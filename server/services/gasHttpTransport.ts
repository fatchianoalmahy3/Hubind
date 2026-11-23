import { GoogleDriveSheetService } from '../../src/core/GoogleDriveSheetService';
import { getDependentSheets } from '../../src/core/types/sheetBlueprint';
import { getFirestoreWorkspaceConfig, normalizeServerGasUrl } from '../config/runtimeConfig';
import { type GasWriteAction, PortalConfigError, type WorkspaceConfig } from '../types';
import { fetchWithTimeout, GAS_FETCH_TIMEOUT_MS } from '../utils/httpHelpers';
import {
  SHEET_CACHE_SOFT_TTL_MS,
  SHEET_CACHE_STALE_MAX_MS,
  inFlightBackgroundRevalidations,
  inFlightSheetFetches,
  invalidateSheetCacheEntry,
  isBackgroundRevalidationActive,
  sheetCache,
  siswaIndexCache,
} from './serverSheetCache';
import { tryFetchBatchSheetsViaApiV4 } from './sheetsApiV4Client';

export function validateGasUrl(rawUrl: string): string {
  const trimmed = normalizeServerGasUrl(rawUrl);
  if (!trimmed) {
    throw new PortalConfigError(
      'GAS_NOT_CONFIGURED',
      'Endpoint URL Cloud Server belum diatur oleh Admin Hubin untuk akses portal publik.'
    );
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new PortalConfigError(
      'GAS_INVALID_URL',
      'Endpoint URL Cloud Server tidak valid. Harus diawali https://...',
      502
    );
  }
  if (/script\.google\.com\/home\/projects\//i.test(trimmed) || /\/edit(\?|$|#)/i.test(trimmed)) {
    throw new PortalConfigError(
      'GAS_INVALID_URL',
      'Link yang ditempel adalah link editor (/edit), bukan Endpoint URL aktif. Klik Deploy -> New deployment -> pilih Web app -> salin URL "/exec".',
      502
    );
  }
  if (/\/dev(\?|$)/i.test(trimmed)) {
    throw new PortalConfigError(
      'GAS_INVALID_URL',
      'Endpoint URL masih menggunakan "/dev" yang memerlukan login internal. Gunakan URL deployment resmi yang berakhiran "/exec" dengan akses publik.',
      502
    );
  }
  if (/script\.google\.com/i.test(trimmed) && !/\/exec(\?|$)/i.test(trimmed)) {
    throw new PortalConfigError(
      'GAS_INVALID_URL',
      'Endpoint URL Cloud Server harus berakhiran "/exec". Salin ulang URL resmi dari Konfigurasi Server.',
      502
    );
  }
  return trimmed;
}

export function parseGasJsonSafely(rawText: string, sheetName: string, status: number): any {
  const trimmed = String(rawText || '').trim();
  if (!trimmed) {
    return {};
  }

  const looksLikeHtml =
    trimmed.startsWith('<') ||
    trimmed.toLowerCase().startsWith('<!doctype') ||
    trimmed.toLowerCase().includes('<html');

  if (looksLikeHtml) {
    const isGoogleAuth =
      trimmed.includes('accounts.google.com') ||
      trimmed.includes('ServiceLogin') ||
      trimmed.includes('Sign in');
    throw new PortalConfigError(
      'GAS_AUTH_REQUIRED',
      isGoogleAuth
        ? `Cloud Server mengembalikan halaman otorisasi untuk tabel [${sheetName}]. Pastikan endpoint server di-deploy dengan akses "Siapa saja (Anyone)" dan URL berakhiran "/exec".`
        : `Cloud Server mengembalikan respon HTML error (HTTP ${status}) untuk tabel [${sheetName}]. Periksa deployment Endpoint Server "/exec".`,
      502
    );
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    throw new PortalConfigError(
      'GAS_INVALID_RESPONSE',
      `Respon Cloud Server untuk [${sheetName}] bukan JSON valid: ${trimmed.slice(0, 120)}`,
      502
    );
  }
}

function triggerBackgroundSheetRefresh(sheetName: string, cacheKey: string): void {
  if (isBackgroundRevalidationActive(cacheKey) || inFlightSheetFetches.has(cacheKey)) {
    return;
  }
  inFlightBackgroundRevalidations.set(cacheKey, Date.now());
  void fetchLiveSheetViaGas(sheetName, true)
    .catch(() => {})
    .finally(() => {
      inFlightBackgroundRevalidations.delete(cacheKey);
    });
}

export async function fetchLiveSheetViaGas(
  sheetName: string,
  forceRefresh = false
): Promise<{
  rows: any[];
  config: WorkspaceConfig;
}> {
  const config = await getFirestoreWorkspaceConfig(forceRefresh);

  if (!config.spreadsheetId) {
    throw new PortalConfigError(
      'SPREADSHEET_NOT_CONFIGURED',
      'ID Database Cloud Server belum dikonfigurasi oleh Admin Hubin.'
    );
  }

  const cacheKey = `${config.spreadsheetId}::${sheetName}`;
  const cached = sheetCache.get(cacheKey);
  if (!forceRefresh && cached) {
    const age = Date.now() - cached.fetchedAt;
    if (age < SHEET_CACHE_SOFT_TTL_MS) {
      return { rows: cached.data, config };
    }
    if (age < SHEET_CACHE_STALE_MAX_MS) {
      triggerBackgroundSheetRefresh(sheetName, cacheKey);
      return { rows: cached.data, config };
    }
  }

  if (!forceRefresh) {
    const existingFlight = inFlightSheetFetches.get(cacheKey);
    if (existingFlight) {
      return existingFlight;
    }
  }

  const fetchPromise = (async (): Promise<{ rows: any[]; config: WorkspaceConfig }> => {
    const apiV4Batch = await tryFetchBatchSheetsViaApiV4(
      config.spreadsheetId,
      [sheetName],
      new Set(sheetName === 'Master_Akun' ? ['Master_Akun'] : []),
      forceRefresh
    );
    if (apiV4Batch && Array.isArray(apiV4Batch[sheetName])) {
      const rows = apiV4Batch[sheetName];
      sheetCache.set(cacheKey, { data: rows, fetchedAt: Date.now() });
      return { rows, config };
    }

    const gasUrl = validateGasUrl(config.gasDeployUrl);
    const separator = gasUrl.includes('?') ? '&' : '?';
    const freshSuffix = forceRefresh ? `&fresh=1&_ts=${Date.now()}` : '';
    const targetUrl = `${gasUrl}${separator}sheet=${encodeURIComponent(
      sheetName
    )}&year=${encodeURIComponent(config.activeYear)}&spreadsheetId=${encodeURIComponent(
      config.spreadsheetId
    )}${freshSuffix}`;

    let gasRes: globalThis.Response;
    try {
      gasRes = await fetchWithTimeout(
        targetUrl,
        {
          method: 'GET',
          headers: { Accept: 'application/json' },
          redirect: 'follow',
        },
        GAS_FETCH_TIMEOUT_MS
      );
    } catch (err: any) {
      if (err instanceof PortalConfigError) throw err;
      throw new PortalConfigError(
        'GAS_FETCH_FAILED',
        `Server gagal menghubungi Endpoint Cloud Server (${err?.message || 'network error'}). Periksa konfigurasi URL "/exec" dan pastikan akses deployment aktif.`,
        502
      );
    }

    const rawText = await gasRes.text();

    if (!gasRes.ok) {
      parseGasJsonSafely(rawText, sheetName, gasRes.status);
      throw new PortalConfigError(
        'GAS_FETCH_FAILED',
        `Gagal membaca tabel [${sheetName}] dari Cloud Server (HTTP ${gasRes.status}).`,
        502
      );
    }

    const json = parseGasJsonSafely(rawText, sheetName, gasRes.status);
    if (json?.error) {
      throw new PortalConfigError('GAS_ERROR', String(json.error), 502);
    }

    const rows: any[] = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
    sheetCache.set(cacheKey, { data: rows, fetchedAt: Date.now() });
    return { rows, config };
  })();

  if (!forceRefresh) {
    inFlightSheetFetches.set(cacheKey, fetchPromise);
  }
  try {
    return await fetchPromise;
  } finally {
    if (inFlightSheetFetches.get(cacheKey) === fetchPromise) {
      inFlightSheetFetches.delete(cacheKey);
    }
  }
}

export async function fetchBatchSheetsViaGas(
  sheetNames: string[],
  optionalSheets: Set<string> = new Set(),
  forceRefresh = false
): Promise<{ sheets: Record<string, any[]>; config: WorkspaceConfig }> {
  const config = await getFirestoreWorkspaceConfig(forceRefresh);

  if (!config.spreadsheetId) {
    throw new PortalConfigError(
      'SPREADSHEET_NOT_CONFIGURED',
      'ID Database Cloud Server belum dikonfigurasi oleh Admin Hubin.'
    );
  }

  const sheetsResult: Record<string, any[]> = {};
  const missingSheets: string[] = [];
  const staleSheets: string[] = [];
  const now = Date.now();

  for (const name of sheetNames) {
    const cacheKey = `${config.spreadsheetId}::${name}`;
    const cached = sheetCache.get(cacheKey);
    if (!forceRefresh && cached) {
      const age = now - cached.fetchedAt;
      if (age < SHEET_CACHE_SOFT_TTL_MS) {
        sheetsResult[name] = cached.data;
        continue;
      }
      if (age < SHEET_CACHE_STALE_MAX_MS) {
        sheetsResult[name] = cached.data;
        if (!isBackgroundRevalidationActive(cacheKey)) {
          staleSheets.push(name);
        }
        continue;
      }
    }
    missingSheets.push(name);
  }

  if (staleSheets.length > 0 && !forceRefresh) {
    const staleKeys = staleSheets.map((n) => `${config.spreadsheetId}::${n}`);
    const lockTs = Date.now();
    staleKeys.forEach((k) => inFlightBackgroundRevalidations.set(k, lockTs));
    void fetchBatchSheetsViaGas(staleSheets, optionalSheets, true)
      .catch(() => {})
      .finally(() => {
        staleKeys.forEach((k) => inFlightBackgroundRevalidations.delete(k));
      });
  }

  if (missingSheets.length === 0) {
    return { sheets: sheetsResult, config };
  }

  const apiV4Results = await tryFetchBatchSheetsViaApiV4(
    config.spreadsheetId,
    missingSheets,
    optionalSheets,
    forceRefresh
  );
  if (apiV4Results) {
    const batchFetchedAt = Date.now();
    for (const name of missingSheets) {
      const rows = Array.isArray(apiV4Results[name]) ? apiV4Results[name] : [];
      sheetsResult[name] = rows;
      sheetCache.set(`${config.spreadsheetId}::${name}`, {
        data: rows,
        fetchedAt: batchFetchedAt,
      });
    }
    return { sheets: sheetsResult, config };
  }

  const gasUrl = validateGasUrl(config.gasDeployUrl);

  if (missingSheets.length > 1) {
    try {
      const separator = gasUrl.includes('?') ? '&' : '?';
      const freshSuffix = forceRefresh ? `&fresh=1&_ts=${Date.now()}` : '';
      const batchUrl = `${gasUrl}${separator}action=BATCH_GET&sheets=${encodeURIComponent(
        missingSheets.join(',')
      )}&year=${encodeURIComponent(config.activeYear)}&spreadsheetId=${encodeURIComponent(
        config.spreadsheetId
      )}${freshSuffix}`;

      const gasRes = await fetchWithTimeout(
        batchUrl,
        {
          method: 'GET',
          headers: { Accept: 'application/json' },
          redirect: 'follow',
        },
        GAS_FETCH_TIMEOUT_MS
      );

      if (gasRes.ok) {
        const rawText = await gasRes.text();
        const json = parseGasJsonSafely(rawText, missingSheets.join(','), gasRes.status);
        if (json?.status === 'success' && json?.sheets && typeof json.sheets === 'object') {
          const batchFetchedAt = Date.now();
          for (const name of missingSheets) {
            const rows = Array.isArray(json.sheets[name]) ? json.sheets[name] : [];
            sheetsResult[name] = rows;
            sheetCache.set(`${config.spreadsheetId}::${name}`, {
              data: rows,
              fetchedAt: batchFetchedAt,
            });
          }
          return { sheets: sheetsResult, config };
        }
      }
    } catch (err) {
      if (err instanceof PortalConfigError && err.code === 'GAS_TIMEOUT') {
        throw err;
      }
    }
  }

  await Promise.all(
    missingSheets.map(async (name) => {
      try {
        const res = await fetchLiveSheetViaGas(name, forceRefresh);
        sheetsResult[name] = res.rows;
      } catch (err) {
        if (optionalSheets.has(name)) {
          sheetsResult[name] = [];
        } else {
          throw err;
        }
      }
    })
  );

  return { sheets: sheetsResult, config };
}

export async function fetchMasterSiswaRows(forceRefresh = false): Promise<{
  rows: any[];
  config: WorkspaceConfig;
}> {
  try {
    const primary = await fetchLiveSheetViaGas('Master_Siswa_XI', forceRefresh);
    if (primary.rows.length > 0) {
      return primary;
    }
    const fallback = await fetchLiveSheetViaGas('Master_Siswa', forceRefresh).catch(() => null);
    return fallback && fallback.rows.length > 0 ? fallback : primary;
  } catch (err: any) {
    if (err instanceof PortalConfigError && err.code === 'GAS_ERROR') {
      return fetchLiveSheetViaGas('Master_Siswa', forceRefresh);
    }
    throw err;
  }
}

export async function writeLiveSheetViaGas(
  sheetName: string,
  action: GasWriteAction,
  payload: any
): Promise<{
  verified: boolean;
  savedId?: string;
  sheetRowNumber?: number;
  savedAt: string;
}> {
  const config = await getFirestoreWorkspaceConfig();

  if (!config.spreadsheetId) {
    throw new PortalConfigError(
      'SPREADSHEET_NOT_CONFIGURED',
      'ID Database Cloud Server belum dikonfigurasi oleh Admin Hubin.'
    );
  }
  const gasUrl = validateGasUrl(config.gasDeployUrl);

  const rawId =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload.id || payload.deletedRow?.id || payload.updatedRow?.id || ''
      : '';
  const hashMatch = String(rawId || '').trim().match(/^(.*)#r(\d+)$/);
  const cleanId = hashMatch ? hashMatch[1].trim() : String(rawId || '').trim();
  const sheetRowNumber =
    (payload && typeof payload === 'object' && !Array.isArray(payload)
      ? Number(
          payload._sheetRowNumber ||
            payload.deletedRow?._sheetRowNumber ||
            payload.updatedRow?._sheetRowNumber ||
            0
        )
      : 0) || (hashMatch ? Number(hashMatch[2]) : 0);

  const sheetSvc = GoogleDriveSheetService.getInstance();
  let sanitizedPayload = payload;
  if (
    (action === 'CREATE' || action === 'UPDATE') &&
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload)
  ) {
    sanitizedPayload = sheetSvc.stripFormulaManagedFields(sheetName, payload);
  } else if ((action === 'BULK_UPDATE' || action === 'IMPORT') && Array.isArray(payload)) {
    sanitizedPayload = payload.map((item) =>
      item && typeof item === 'object' ? sheetSvc.stripFormulaManagedFields(sheetName, item) : item
    );
  } else if (
    action === 'BULK_UPDATE' &&
    payload &&
    typeof payload === 'object' &&
    (Array.isArray(payload.updatedRows) || Array.isArray(payload.rows))
  ) {
    sanitizedPayload = {
      ...payload,
      ...(Array.isArray(payload.updatedRows)
        ? {
            updatedRows: payload.updatedRows.map((item: any) =>
              item && typeof item === 'object'
                ? sheetSvc.stripFormulaManagedFields(sheetName, item)
                : item
            ),
          }
        : {}),
      ...(Array.isArray(payload.rows)
        ? {
            rows: payload.rows.map((item: any) =>
              item && typeof item === 'object'
                ? sheetSvc.stripFormulaManagedFields(sheetName, item)
                : item
            ),
          }
        : {}),
    };
  }

  let gasRes: globalThis.Response;
  try {
    gasRes = await fetchWithTimeout(
      gasUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        redirect: 'follow',
        body: JSON.stringify({
          action,
          sheetName,
          year: config.activeYear,
          spreadsheetId: config.spreadsheetId,
          id: cleanId || rawId,
          sheetRowNumber: sheetRowNumber >= 2 ? sheetRowNumber : undefined,
          data: sanitizedPayload,
          timestamp: new Date().toISOString(),
        }),
      },
      20_000
    );
  } catch (err: any) {
    if (err instanceof PortalConfigError) throw err;
    throw new PortalConfigError(
      'GAS_WRITE_FAILED',
      `Server gagal mengirim data ke Endpoint Cloud Server (${err?.message || 'network error'}). Periksa konfigurasi URL "/exec".`,
      502
    );
  }

  const rawText = await gasRes.text();
  const json = parseGasJsonSafely(rawText, sheetName, gasRes.status);

  if (!gasRes.ok) {
    throw new PortalConfigError(
      'GAS_WRITE_FAILED',
      `Gagal menulis ke Cloud Server [${sheetName}] (HTTP ${gasRes.status}).`,
      502
    );
  }

  if (json?.error) {
    throw new PortalConfigError('GAS_WRITE_ERROR', String(json.error), 502);
  }

  invalidateSheetCacheEntry(config.spreadsheetId, sheetName);
  if (sheetName === 'Master_Siswa_XI' || sheetName === 'Master_Siswa') {
    siswaIndexCache.delete(config.spreadsheetId);
    invalidateSheetCacheEntry(config.spreadsheetId, 'Master_Siswa_XI');
    invalidateSheetCacheEntry(config.spreadsheetId, 'Master_Siswa');
  }
  for (const dep of getDependentSheets(sheetName)) {
    invalidateSheetCacheEntry(config.spreadsheetId, dep);
  }

  return {
    verified: json?.verified !== false,
    savedId: typeof json?.savedId === 'string' ? json.savedId : String(cleanId || rawId || ''),
    sheetRowNumber:
      typeof json?.sheetRowNumber === 'number' && json.sheetRowNumber >= 2
        ? json.sheetRowNumber
        : undefined,
    savedAt: typeof json?.savedAt === 'string' && json.savedAt ? json.savedAt : new Date().toISOString(),
  };
}

export async function callGasCustomAction<T = any>(
  action: string,
  extraBody: Record<string, any> = {},
  timeoutMs = 25_000
): Promise<{ data: T; config: WorkspaceConfig }> {
  const config = await getFirestoreWorkspaceConfig();
  if (!config.spreadsheetId) {
    throw new PortalConfigError(
      'SPREADSHEET_NOT_CONFIGURED',
      'ID Database Cloud Server belum dikonfigurasi oleh Admin Hubin.'
    );
  }
  const gasUrl = validateGasUrl(config.gasDeployUrl);

  let gasRes: globalThis.Response;
  try {
    gasRes = await fetchWithTimeout(
      gasUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        redirect: 'follow',
        body: JSON.stringify({
          action,
          year: config.activeYear,
          spreadsheetId: config.spreadsheetId,
          driveFolderUrl: config.driveFolderUrl,
          timestamp: new Date().toISOString(),
          ...extraBody,
        }),
      },
      timeoutMs
    );
  } catch (err: any) {
    if (err instanceof PortalConfigError) throw err;
    throw new PortalConfigError(
      'GAS_WRITE_FAILED',
      `Server gagal menjalankan aksi [${action}] pada Cloud Server (${err?.message || 'network error'}).`,
      502
    );
  }

  const rawText = await gasRes.text();
  const json = parseGasJsonSafely(rawText, action, gasRes.status);

  if (!gasRes.ok) {
    throw new PortalConfigError(
      'GAS_WRITE_FAILED',
      `Cloud Server mengembalikan error HTTP ${gasRes.status} saat menjalankan aksi [${action}].`,
      502
    );
  }

  if (json?.error) {
    throw new PortalConfigError('GAS_WRITE_ERROR', String(json.error), 502);
  }

  return { data: json as T, config };
}
