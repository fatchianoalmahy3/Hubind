import { GoogleSheetClient } from '../GoogleSheetClient';
import { GoogleDriveSheetService } from '../GoogleDriveSheetService';
import { getFirebaseIdToken } from '../auth/GoogleAuthService';
import { getAdminSessionToken } from '../auth/LocalAccountAuthService';
import {
  safeFetchJson,
  HtmlResponseError,
  isTimeoutError,
  normalizeGasUrl,
  validateGasDeployUrl,
  formatGasNetworkError,
  isNetworkFetchError,
  isBackendProxyUnavailableError,
} from '../utils/safeFetchJson';

const DIRECT_SHEET_CACHE_TTL_MS = 45_000;
const directSheetCache = new Map<string, { rows: any[]; fetchedAt: number }>();
const inFlightDirectReads = new Map<string, Promise<any[]>>();

export const INFRA_ERROR_CODES = new Set([
  'GAS_NOT_CONFIGURED',
  'GAS_INVALID_URL',
  'GAS_AUTH_REQUIRED',
  'GAS_INVALID_RESPONSE',
  'GAS_FETCH_FAILED',
  'GAS_WRITE_FAILED',
  'GAS_WRITE_ERROR',
  'GAS_ERROR',
  'SPREADSHEET_NOT_CONFIGURED',
  'INTERNAL_ERROR',
]);

export function clearDirectSheetCache(): void {
  directSheetCache.clear();
}

export async function ensureHydratedConfig() {
  const client = GoogleSheetClient.getInstance();
  let cfg = client.getConfig();
  if (!cfg.isFirestoreHydrated || !cfg.spreadsheetId) {
    await client.initFromFirestore();
    cfg = client.getConfig();
  }
  return {
    ...cfg,
    gasDeployUrl: normalizeGasUrl(cfg.gasDeployUrl),
  };
}

function assertValidGasConfig(
  cfg: Awaited<ReturnType<typeof ensureHydratedConfig>>,
  missingGasMsg = 'Endpoint Google Apps Script belum dikonfigurasi oleh Admin Hubin.'
): string {
  if (!cfg.spreadsheetId) {
    throw new Error('Koneksi Database Cloud Server belum dikonfigurasi oleh Admin Hubin.');
  }
  const validation = validateGasDeployUrl(cfg.gasDeployUrl);
  if (!validation.valid) {
    throw new Error(validation.error || missingGasMsg);
  }
  return validation.normalizedUrl;
}

export async function fetchGasGet(
  sheetName: string,
  cfg: Awaited<ReturnType<typeof ensureHydratedConfig>>,
  forceRefresh = false
): Promise<any[]> {
  const gasUrl = assertValidGasConfig(cfg, 'Koneksi Cloud Server belum dikonfigurasi oleh Admin Hubin.');

  const sep = gasUrl.includes('?') ? '&' : '?';
  const freshSuffix = forceRefresh ? `&fresh=1&_ts=${Date.now()}` : '';
  const targetUrl = `${gasUrl}${sep}sheet=${encodeURIComponent(sheetName)}&year=${encodeURIComponent(
    cfg.activeYear
  )}&spreadsheetId=${encodeURIComponent(cfg.spreadsheetId)}${freshSuffix}`;

  try {
    const { ok, status, data: json } = await safeFetchJson(targetUrl, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'follow',
      timeoutMs: 16_000,
    });
    if (!ok || json?.error) {
      throw new Error(json?.error || `Gagal membaca data dari Cloud Server (HTTP ${status}).`);
    }
    return Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
  } catch (err: any) {
    if (err instanceof HtmlResponseError && err.isGoogleAuth) {
      throw new Error(
        'Akses layanan Cloud Server publik masih dibatasi. Silakan hubungi Admin Hubin untuk memeriksa pengaturan akses server.'
      );
    }
    if (isNetworkFetchError(err)) {
      throw new Error(formatGasNetworkError(err, gasUrl));
    }
    throw err;
  }
}

export async function fetchGasPost(
  sheetName: string,
  action: 'CREATE' | 'UPDATE',
  payload: any,
  cfg: Awaited<ReturnType<typeof ensureHydratedConfig>>
): Promise<void> {
  const gasUrl = assertValidGasConfig(
    cfg,
    'Layanan Cloud Server untuk portal publik belum dikonfigurasi oleh Admin Hubin.'
  );
  const preparedPayload = GoogleDriveSheetService.getInstance().prepareOutgoingRecord(
    sheetName,
    payload
  );
  const rawId =
    preparedPayload?.id || preparedPayload?.ID_Monitoring || preparedPayload?.ID_Penempatan || '';
  const { cleanId } = GoogleDriveSheetService.stripSyntheticRowSuffix(rawId);

  try {
    // Use text/plain;charset=utf-8 to avoid browser CORS OPTIONS preflight against script.google.com
    const { ok, status, data: json } = await safeFetchJson(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow',
      timeoutMs: 22_000,
      body: JSON.stringify({
        action,
        sheetName,
        year: cfg.activeYear,
        spreadsheetId: cfg.spreadsheetId,
        id: cleanId || rawId,
        sheetRowNumber: preparedPayload?._sheetRowNumber,
        data: preparedPayload,
        timestamp: new Date().toISOString(),
      }),
    });
    if (!ok || json?.error) {
      throw new Error(json?.error || `Gagal menyimpan data ke Cloud Server (HTTP ${status}).`);
    }
  } catch (err: any) {
    if (err instanceof HtmlResponseError && err.isGoogleAuth) {
      throw new Error(
        'Akses layanan Cloud Server publik masih dibatasi. Silakan hubungi Admin Hubin untuk memeriksa pengaturan akses server.'
      );
    }
    if (isNetworkFetchError(err)) {
      throw new Error(formatGasNetworkError(err, gasUrl));
    }
    throw err;
  }
}

export async function readSheetDirect(
  sheetName: string,
  optional = false,
  forceRefresh = false
): Promise<any[]> {
  const cfg = await ensureHydratedConfig();
  const cacheKey = `${cfg.spreadsheetId}::${sheetName}`;
  const cached = directSheetCache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.fetchedAt < DIRECT_SHEET_CACHE_TTL_MS) {
    return cached.rows;
  }

  if (!forceRefresh) {
    const existingFlight = inFlightDirectReads.get(cacheKey);
    if (existingFlight) {
      try {
        return await existingFlight;
      } catch (e) {
        if (optional) return [];
        throw e;
      }
    }
  }

  const readPromise = fetchGasGet(sheetName, cfg, forceRefresh).then((rows) => {
    directSheetCache.set(cacheKey, { rows, fetchedAt: Date.now() });
    return rows;
  });

  if (!forceRefresh) {
    inFlightDirectReads.set(cacheKey, readPromise);
  }

  try {
    return await readPromise;
  } catch (e) {
    if (optional) return [];
    throw e;
  } finally {
    if (inFlightDirectReads.get(cacheKey) === readPromise) {
      inFlightDirectReads.delete(cacheKey);
    }
  }
}

export async function readMasterSiswaDirect(): Promise<any[]> {
  try {
    const primary = await readSheetDirect('Master_Siswa_XI');
    if (primary.length > 0) return primary;
    const fallback = await readSheetDirect('Master_Siswa', true);
    return fallback.length > 0 ? fallback : primary;
  } catch (err: any) {
    const fallback = await readSheetDirect('Master_Siswa', true);
    if (fallback.length > 0) return fallback;
    throw err;
  }
}

export async function writeSheetDirect(
  sheetName: string,
  action: 'CREATE' | 'UPDATE',
  payload: any
): Promise<void> {
  const cfg = await ensureHydratedConfig();
  await fetchGasPost(sheetName, action, payload, cfg);
  directSheetCache.delete(`${cfg.spreadsheetId}::${sheetName}`);
  GoogleSheetClient.getInstance().invalidateClientSheetCache(sheetName);
  await safeFetchJson(`/api/cache/invalidate?sheet=${encodeURIComponent(sheetName)}`, {
    method: 'POST',
    timeoutMs: 2_500,
  }).catch(() => {});
}

/**
 * Runs server endpoint first; automatically switches to direct Firestore-configured GAS when:
 * 1) The hosting environment serves SPA index.html (HTTP 200 HTML) for /api/*, OR
 * 2) The backend /api/* reports a GAS/config error that direct GAS can diagnose directly.
 */
export async function callPublicEndpoint<T>(
  apiCall: () => Promise<{ ok: boolean; status: number; data: any }>,
  directClientCall: () => Promise<T>
): Promise<T> {
  try {
    const { ok, status, data } = await apiCall();
    if (ok && data?.success) {
      return data as T;
    }

    const errCode = String(data?.code || '');
    // Do NOT trigger slow duplicate direct retry if the backend already timed out talking to GAS
    if (errCode === 'GAS_TIMEOUT' || status === 504) {
      throw new Error(
        data?.message ||
          'Koneksi ke Cloud Server melebihi batas waktu. Periksa koneksi internet atau coba beberapa saat lagi.'
      );
    }

    const isProxyRouteMissing =
      (status === 404 && errCode !== 'PETUGAS_NOT_FOUND') ||
      status === 405 ||
      errCode === 'API_ROUTE_NOT_FOUND';
    const isInfraFailure = INFRA_ERROR_CODES.has(errCode) || status >= 500 || isProxyRouteMissing;
    if (!isInfraFailure) {
      throw new Error(data?.message || `Permintaan ditolak (HTTP ${status}).`);
    }

    return await directClientCall();
  } catch (err: any) {
    if (isTimeoutError(err)) {
      throw err;
    }
    if (isBackendProxyUnavailableError(err)) {
      return directClientCall();
    }
    throw err;
  }
}

export async function resolveAuthToken(): Promise<string | null> {
  const localTok = getAdminSessionToken();
  if (localTok && !localTok.startsWith('local_gas_')) {
    return localTok;
  }
  return getFirebaseIdToken();
}

export async function callAuthenticatedProxyWithGasAction<T extends { success: boolean }>(params: {
  proxyUrl: string;
  proxyTimeoutMs: number;
  proxyFailDefaultMsg: string;
  gasAction: string;
  gasTimeoutMs: number;
  payload: any;
  mapGasResult: (json: any, status: number, ok: boolean) => Promise<T>;
}): Promise<T> {
  const {
    proxyUrl,
    proxyTimeoutMs,
    proxyFailDefaultMsg,
    gasAction,
    gasTimeoutMs,
    payload,
    mapGasResult,
  } = params;

  try {
    const token = await resolveAuthToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const { ok, status, data } = await safeFetchJson(proxyUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      timeoutMs: proxyTimeoutMs,
    });
    if (ok && data?.success && data?.pdfUrl) {
      return data as T;
    }
    const errCode = String(data?.code || '');
    const isProxyMissing = status === 404 || status === 405 || errCode === 'API_ROUTE_NOT_FOUND';
    const isInfra = INFRA_ERROR_CODES.has(errCode) || status >= 500 || isProxyMissing;
    if (!isInfra) {
      throw new Error(data?.message || `${proxyFailDefaultMsg} (HTTP ${status}).`);
    }
  } catch (err: any) {
    if (!isBackendProxyUnavailableError(err) && !isNetworkFetchError(err)) {
      throw err;
    }
  }

  const cfg = await ensureHydratedConfig();
  const gasUrl = assertValidGasConfig(cfg);
  const { ok, status, data: json } = await safeFetchJson(gasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    redirect: 'follow',
    timeoutMs: gasTimeoutMs,
    body: JSON.stringify({
      action: gasAction,
      spreadsheetId: cfg.spreadsheetId,
      driveFolderUrl: cfg.driveFolderUrl,
      year: cfg.activeYear,
      data: payload,
      timestamp: new Date().toISOString(),
    }),
  });
  return mapGasResult(json, status, ok);
}
