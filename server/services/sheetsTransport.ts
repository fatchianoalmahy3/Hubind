import crypto from 'crypto';
import { normalizeToIsoDate } from '../../src/core/utils/dateHelpers';
import { stripNisSymbols } from '../../src/core/utils/nisHelpers';
import { pickField } from '../../src/core/utils/rowFieldHelpers';
import {
  getFirestoreWorkspaceConfig,
  invalidateWorkspaceConfigCache,
  normalizeServerGasUrl,
} from '../config/runtimeConfig';
import { type GasWriteAction, PortalConfigError, type WorkspaceConfig } from '../types';
import { fetchWithTimeout, GAS_FETCH_TIMEOUT_MS } from '../utils/httpHelpers';

const SHEET_CACHE_SOFT_TTL_MS = 45_000;
const SHEET_CACHE_STALE_MAX_MS = 600_000;
const SHEET_CACHE_TTL_MS = SHEET_CACHE_SOFT_TTL_MS;
const SHEETS_API_TIMEOUT_MS = 8_000;
const SHEETS_METADATA_TTL_MS = 300_000;
const BACKGROUND_REVALIDATION_LOCK_MAX_MS = 20_000;

const sheetCache = new Map<string, { data: any[]; fetchedAt: number }>();
const inFlightSheetFetches = new Map<string, Promise<{ rows: any[]; config: WorkspaceConfig }>>();
const inFlightBackgroundRevalidations = new Map<string, number>();
const siswaIndexCache = new Map<string, { byKey: Map<string, any>; fetchedAt: number }>();

let sheetsAccessTokenCache: { token: string; expiresAt: number; cacheKey: string } | null = null;
let inFlightSheetsTokenPromise: Promise<string | null> | null = null;
const sheetMetadataCache = new Map<string, { title: string; tabNames: string[]; fetchedAt: number }>();
const inFlightMetadataFetches = new Map<string, Promise<{ title: string; tabNames: string[] }>>();

export function invalidateSheetCacheEntry(spreadsheetId: string, sheetName: string): void {
  sheetCache.delete(`${spreadsheetId}::${sheetName}`);
  if (sheetName === 'Master_Siswa_XI' || sheetName === 'Master_Siswa') {
    siswaIndexCache.delete(spreadsheetId);
  }
}

export async function invalidateServerCaches(sheetParam?: string): Promise<void> {
  if (sheetParam) {
    const cfg = await getFirestoreWorkspaceConfig().catch(() => null);
    if (cfg?.spreadsheetId) {
      invalidateSheetCacheEntry(cfg.spreadsheetId, sheetParam);
    } else {
      sheetCache.clear();
    }
    return;
  }
  invalidateWorkspaceConfigCache();
  sheetCache.clear();
  siswaIndexCache.clear();
  sheetMetadataCache.clear();
}

export function getOrBuildSiswaIndex(spreadsheetId: string, rows: any[]): Map<string, any> {
  let indexEntry = siswaIndexCache.get(spreadsheetId);
  if (!indexEntry || Date.now() - indexEntry.fetchedAt >= SHEET_CACHE_TTL_MS) {
    const byKey = new Map<string, any>();
    for (const s of rows) {
      const nis = pickField(s, 'NIS', 'nis');
      const nisDigits = stripNisSymbols(nis);
      const nik = pickField(s, 'NIK', 'nik');
      const nikDigits = stripNisSymbols(nik);
      if (nis && !byKey.has(nis)) byKey.set(nis, s);
      if (nisDigits && !byKey.has(nisDigits)) byKey.set(nisDigits, s);
      if (nik && !byKey.has(nik)) byKey.set(nik, s);
      if (nikDigits && !byKey.has(nikDigits)) byKey.set(nikDigits, s);
    }
    indexEntry = { byKey, fetchedAt: Date.now() };
    siswaIndexCache.set(spreadsheetId, indexEntry);
  }
  return indexEntry.byKey;
}

function isBackgroundRevalidationActive(cacheKey: string): boolean {
  const startedAt = inFlightBackgroundRevalidations.get(cacheKey);
  if (!startedAt) return false;
  if (Date.now() - startedAt > BACKGROUND_REVALIDATION_LOCK_MAX_MS) {
    inFlightBackgroundRevalidations.delete(cacheKey);
    return false;
  }
  return true;
}

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

const SHEETS_DATE_HEADER_KEYS = new Set([
  'tglberangkat',
  'tanggalberangkat',
  'tanggalrencanatarik',
  'tglkirimsurat',
  'tanggalkirimsurat',
  'tglbalasan',
  'tanggalbalasan',
  'tanggalkunjungan',
  'tglkunjungan',
  'tglterbit',
  'tanggalterbit',
]);
const SHEETS_TIMESTAMP_HEADER_KEYS = new Set(['timestamp', 'updatedat']);

function normalizeSheetsHeaderKey(key: string): string {
  return String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

interface ParsedServiceAccountCreds {
  clientEmail: string;
  privateKey: string;
}

function getGoogleServiceAccountCreds(): ParsedServiceAccountCreds | null {
  try {
    const rawJson = String(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim();
    const rawB64 = String(process.env.GOOGLE_SERVICE_ACCOUNT_B64 || '').trim();
    const jsonText = rawJson || (rawB64 ? Buffer.from(rawB64, 'base64').toString('utf8') : '');
    if (jsonText) {
      const parsed = JSON.parse(jsonText);
      const clientEmail = String(parsed?.client_email || '').trim();
      const privateKey = String(parsed?.private_key || '').replace(/\\n/g, '\n').trim();
      if (clientEmail && privateKey) {
        return { clientEmail, privateKey };
      }
    }
  } catch (err: any) {
    console.warn('[Sheets API v4] Invalid GOOGLE_SERVICE_ACCOUNT_JSON/B64:', err?.message);
  }

  const email = String(process.env.GOOGLE_CLIENT_EMAIL || '').trim();
  const key = String(process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  if (email && key) {
    return { clientEmail: email, privateKey: key };
  }
  return null;
}

function getGoogleSheetsApiKey(): string {
  return String(
    process.env.GOOGLE_SHEETS_API_KEY ||
      process.env.GOOGLE_CONSOLE_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      ''
  ).trim();
}

async function resolveGoogleSheetsReadAuth(): Promise<
  { mode: 'bearer'; token: string } | { mode: 'apikey'; apiKey: string } | null
> {
  const sa = getGoogleServiceAccountCreds();
  if (sa) {
    const cacheKey = sa.clientEmail;
    if (
      sheetsAccessTokenCache &&
      sheetsAccessTokenCache.cacheKey === cacheKey &&
      Date.now() < sheetsAccessTokenCache.expiresAt - 60_000
    ) {
      return { mode: 'bearer', token: sheetsAccessTokenCache.token };
    }

    if (!inFlightSheetsTokenPromise) {
      inFlightSheetsTokenPromise = (async (): Promise<string | null> => {
        try {
          const nowSec = Math.floor(Date.now() / 1000);
          const headerB64 = Buffer.from(
            JSON.stringify({ alg: 'RS256', typ: 'JWT' }),
            'utf8'
          ).toString('base64url');
          const claimB64 = Buffer.from(
            JSON.stringify({
              iss: sa.clientEmail,
              scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
              aud: 'https://oauth2.googleapis.com/token',
              iat: nowSec,
              exp: nowSec + 3600,
            }),
            'utf8'
          ).toString('base64url');
          const unsignedJwt = `${headerB64}.${claimB64}`;
          const signer = crypto.createSign('RSA-SHA256');
          signer.update(unsignedJwt);
          signer.end();
          const signatureB64 = signer.sign(sa.privateKey, 'base64url');
          const assertion = `${unsignedJwt}.${signatureB64}`;

          const tokenRes = await fetchWithTimeout(
            'https://oauth2.googleapis.com/token',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: `grant_type=${encodeURIComponent(
                'urn:ietf:params:oauth:grant-type:jwt-bearer'
              )}&assertion=${encodeURIComponent(assertion)}`,
            },
            SHEETS_API_TIMEOUT_MS
          );
          if (!tokenRes.ok) {
            const errTxt = await tokenRes.text().catch(() => '');
            console.warn(`[Sheets API v4] OAuth token failed (${tokenRes.status}): ${errTxt.slice(0, 120)}`);
            return null;
          }
          const tokenJson = await tokenRes.json();
          const accessToken = String(tokenJson?.access_token || '').trim();
          const expiresIn = Number(tokenJson?.expires_in || 3600);
          if (!accessToken) return null;

          sheetsAccessTokenCache = {
            token: accessToken,
            expiresAt: Date.now() + expiresIn * 1000,
            cacheKey,
          };
          return accessToken;
        } catch (err: any) {
          console.warn('[Sheets API v4] Token exchange error:', err?.message);
          return null;
        } finally {
          inFlightSheetsTokenPromise = null;
        }
      })();
    }

    const token = await inFlightSheetsTokenPromise;
    if (token) {
      return { mode: 'bearer', token };
    }
  }

  const apiKey = getGoogleSheetsApiKey();
  if (apiKey) {
    return { mode: 'apikey', apiKey };
  }

  return null;
}

function buildSheetsApiRequest(
  baseUrl: string,
  auth: { mode: 'bearer'; token: string } | { mode: 'apikey'; apiKey: string }
): { url: string; headers: Record<string, string> } {
  if (auth.mode === 'bearer') {
    return {
      url: baseUrl,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${auth.token}`,
      },
    };
  }
  const sep = baseUrl.includes('?') ? '&' : '?';
  return {
    url: `${baseUrl}${sep}key=${encodeURIComponent(auth.apiKey)}`,
    headers: { Accept: 'application/json' },
  };
}

function resolveActualTabName(requestedSheet: string, existingTabs: string[]): string | null {
  if (existingTabs.includes(requestedSheet)) return requestedSheet;
  const lowerMap = new Map(existingTabs.map((t) => [t.toLowerCase(), t]));
  const exactCi = lowerMap.get(requestedSheet.toLowerCase());
  if (exactCi) return exactCi;

  if (requestedSheet === 'Master_Siswa_XI' || requestedSheet === 'Master_Siswa') {
    return lowerMap.get('master_siswa_xi') || lowerMap.get('master_siswa') || null;
  }
  if (
    requestedSheet === 'Monitoring_5_Tahap' ||
    requestedSheet === 'Monitoring_6_Tahap' ||
    requestedSheet === 'Monitoring_8_Tahap' ||
    requestedSheet === 'Monitoring_PKL'
  ) {
    return (
      lowerMap.get('monitoring_5_tahap') ||
      lowerMap.get('monitoring_6_tahap') ||
      lowerMap.get('monitoring_8_tahap') ||
      lowerMap.get('monitoring_pkl') ||
      null
    );
  }
  return null;
}

async function getSpreadsheetMetadataViaApiV4(
  spreadsheetId: string,
  auth: { mode: 'bearer'; token: string } | { mode: 'apikey'; apiKey: string },
  forceRefresh = false
): Promise<{ title: string; tabNames: string[] }> {
  const cached = sheetMetadataCache.get(spreadsheetId);
  if (!forceRefresh && cached && Date.now() - cached.fetchedAt < SHEETS_METADATA_TTL_MS) {
    return { title: cached.title, tabNames: cached.tabNames };
  }
  if (!forceRefresh) {
    const inflight = inFlightMetadataFetches.get(spreadsheetId);
    if (inflight) return inflight;
  }

  const p = (async () => {
    const { url, headers } = buildSheetsApiRequest(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}?fields=properties.title,sheets.properties.title`,
      auth
    );
    const res = await fetchWithTimeout(url, { method: 'GET', headers }, SHEETS_API_TIMEOUT_MS);
    if (!res.ok) {
      const errTxt = await res.text().catch(() => '');
      throw new Error(`Sheets metadata HTTP ${res.status}: ${errTxt.slice(0, 120)}`);
    }
    const json = await res.json();
    const title = String(json?.properties?.title || '').trim();
    const tabNames: string[] = Array.isArray(json?.sheets)
      ? json.sheets
          .map((s: any) => String(s?.properties?.title || '').trim())
          .filter(Boolean)
      : [];
    sheetMetadataCache.set(spreadsheetId, { title, tabNames, fetchedAt: Date.now() });
    return { title, tabNames };
  })();

  if (!forceRefresh) {
    inFlightMetadataFetches.set(spreadsheetId, p);
  }
  try {
    return await p;
  } finally {
    if (inFlightMetadataFetches.get(spreadsheetId) === p) {
      inFlightMetadataFetches.delete(spreadsheetId);
    }
  }
}

function formatSheetsSerialNumber(serial: number, includeTime: boolean): string {
  const totalSeconds = Math.round(serial * 86400);
  const d = new Date(Date.UTC(1899, 11, 30) + totalSeconds * 1000);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  if (!includeTime) {
    return `${yyyy}-${mm}-${dd}`;
  }
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function convertSheetsValuesMatrixToRows(values: any[][]): Record<string, any>[] {
  if (!Array.isArray(values) || values.length < 2) return [];
  const rawHeaders = Array.isArray(values[0]) ? values[0] : [];
  const headers = rawHeaders.map((h) => String(h ?? '').trim());
  if (headers.every((h) => !h)) return [];

  const rows: Record<string, any>[] = [];
  for (let i = 1; i < values.length; i++) {
    const rawRow = Array.isArray(values[i]) ? values[i] : [];
    const row: Record<string, any> = {};
    let hasValue = false;

    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      if (!header) continue;

      let cellVal: any = rawRow[j] !== undefined && rawRow[j] !== null ? rawRow[j] : '';
      const hNorm = normalizeSheetsHeaderKey(header);

      if (typeof cellVal === 'number' && Number.isFinite(cellVal)) {
        if (SHEETS_TIMESTAMP_HEADER_KEYS.has(hNorm) && cellVal > 20000 && cellVal < 90000) {
          cellVal = formatSheetsSerialNumber(cellVal, true);
        } else if (SHEETS_DATE_HEADER_KEYS.has(hNorm) && cellVal > 20000 && cellVal < 90000) {
          cellVal = formatSheetsSerialNumber(cellVal, false);
        }
      } else if (typeof cellVal === 'string' && SHEETS_DATE_HEADER_KEYS.has(hNorm) && cellVal.trim() !== '') {
        const iso = normalizeToIsoDate(cellVal);
        if (iso) cellVal = iso;
      }

      row[header] = cellVal;
      if (String(cellVal).trim() !== '') {
        hasValue = true;
      }
    }

    if (hasValue) {
      row._sheetRowNumber = i + 1;
      rows.push(row);
    }
  }
  return rows;
}

async function tryFetchBatchSheetsViaApiV4(
  spreadsheetId: string,
  requestedSheets: string[],
  optionalSheets: Set<string>,
  forceRefresh = false
): Promise<Record<string, any[]> | null> {
  const auth = await resolveGoogleSheetsReadAuth();
  if (!auth) return null;

  try {
    const meta = await getSpreadsheetMetadataViaApiV4(spreadsheetId, auth, forceRefresh);
    const results: Record<string, any[]> = {};
    const resolvedEntries: Array<{ requestedName: string; actualTab: string }> = [];

    for (const reqName of requestedSheets) {
      const actualTab = resolveActualTabName(reqName, meta.tabNames);
      if (!actualTab) {
        if (reqName === 'Master_Akun' || optionalSheets.has(reqName)) {
          results[reqName] = [];
          continue;
        }
        return null;
      }
      resolvedEntries.push({ requestedName: reqName, actualTab });
    }

    if (resolvedEntries.length === 0) {
      return results;
    }

    const uniqueTabs = Array.from(new Set(resolvedEntries.map((e) => e.actualTab)));
    const rangesQuery = uniqueTabs
      .map((tab) => `ranges=${encodeURIComponent(`'${tab.replace(/'/g, "''")}'`)}`)
      .join('&');
    const batchBaseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values:batchGet?${rangesQuery}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER&majorDimension=ROWS`;

    const { url, headers } = buildSheetsApiRequest(batchBaseUrl, auth);
    const res = await fetchWithTimeout(url, { method: 'GET', headers }, SHEETS_API_TIMEOUT_MS);
    if (!res.ok) {
      const errTxt = await res.text().catch(() => '');
      console.warn(`[Sheets API v4] batchGet HTTP ${res.status}: ${errTxt.slice(0, 140)}`);
      return null;
    }

    const json = await res.json();
    const valueRanges = Array.isArray(json?.valueRanges) ? json.valueRanges : [];
    const rowsByActualTab = new Map<string, Record<string, any>[]>();

    uniqueTabs.forEach((tabName, idx) => {
      const vr = valueRanges[idx];
      const matrix = Array.isArray(vr?.values) ? vr.values : [];
      rowsByActualTab.set(tabName, convertSheetsValuesMatrixToRows(matrix));
    });

    for (const entry of resolvedEntries) {
      results[entry.requestedName] = rowsByActualTab.get(entry.actualTab) || [];
    }
    return results;
  } catch (err: any) {
    console.warn('[Sheets API v4] Fallback to GAS:', err?.message);
    return null;
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
): Promise<void> {
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
      ? Number(payload._sheetRowNumber || payload.deletedRow?._sheetRowNumber || payload.updatedRow?._sheetRowNumber || 0)
      : 0) ||
    (hashMatch ? Number(hashMatch[2]) : 0);

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
          data: payload,
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

  sheetCache.delete(`${config.spreadsheetId}::${sheetName}`);
  if (sheetName === 'Master_Siswa_XI' || sheetName === 'Master_Siswa') {
    siswaIndexCache.delete(config.spreadsheetId);
    sheetCache.delete(`${config.spreadsheetId}::Master_Siswa_XI`);
    sheetCache.delete(`${config.spreadsheetId}::Master_Siswa`);
  }
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
