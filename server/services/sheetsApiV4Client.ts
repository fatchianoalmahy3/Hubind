import crypto from 'crypto';
import { normalizeToIsoDate } from '../../src/core/utils/dateHelpers';
import { fetchWithRetry } from '../utils/httpHelpers';
import { registerMetadataCacheClearHook } from './serverSheetCache';

export const SHEETS_API_TIMEOUT_MS = 8_000;
const SHEETS_METADATA_TTL_MS = 300_000;

let sheetsAccessTokenCache: { token: string; expiresAt: number; cacheKey: string } | null = null;
let inFlightSheetsTokenPromise: Promise<string | null> | null = null;
const sheetMetadataCache = new Map<
  string,
  { title: string; tabNames: string[]; sheetIds: Record<string, number>; fetchedAt: number }
>();
const inFlightMetadataFetches = new Map<
  string,
  Promise<{ title: string; tabNames: string[]; sheetIds: Record<string, number> }>
>();

registerMetadataCacheClearHook(() => {
  sheetMetadataCache.clear();
});

export function invalidateSheetsAccessTokenCache(): void {
  sheetsAccessTokenCache = null;
}

export function colIndexToLetter(index0: number): string {
  let col = index0 + 1;
  let letter = '';
  while (col > 0) {
    const rem = (col - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter || 'A';
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

export type SheetsAuthResult =
  | { mode: 'bearer'; token: string }
  | { mode: 'apikey'; apiKey: string };

export async function resolveGoogleSheetsWriteAuth(): Promise<{ mode: 'bearer'; token: string } | null> {
  const sa = getGoogleServiceAccountCreds();
  if (!sa) return null;

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
            scope: 'https://www.googleapis.com/auth/spreadsheets',
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

        const tokenRes = await fetchWithRetry(
          'https://oauth2.googleapis.com/token',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `grant_type=${encodeURIComponent(
              'urn:ietf:params:oauth:grant-type:jwt-bearer'
            )}&assertion=${encodeURIComponent(assertion)}`,
          },
          { timeoutMs: SHEETS_API_TIMEOUT_MS, retries: 1, baseDelayMs: 200 }
        );
        if (!tokenRes.ok) {
          const errTxt = await tokenRes.text().catch(() => '');
          console.warn(
            `[Sheets API v4] OAuth token failed (${tokenRes.status}): ${errTxt.slice(0, 120)}`
          );
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
  return token ? { mode: 'bearer', token } : null;
}

async function resolveGoogleSheetsReadAuth(): Promise<SheetsAuthResult | null> {
  const bearer = await resolveGoogleSheetsWriteAuth();
  if (bearer) return bearer;

  const apiKey = getGoogleSheetsApiKey();
  if (apiKey) {
    return { mode: 'apikey', apiKey };
  }

  return null;
}

export function buildSheetsApiRequest(
  baseUrl: string,
  auth: SheetsAuthResult
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

export function resolveActualTabName(requestedSheet: string, existingTabs: string[]): string | null {
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

export async function getSpreadsheetMetadataViaApiV4(
  spreadsheetId: string,
  auth: SheetsAuthResult,
  forceRefresh = false
): Promise<{ title: string; tabNames: string[]; sheetIds: Record<string, number> }> {
  const cached = sheetMetadataCache.get(spreadsheetId);
  if (!forceRefresh && cached && Date.now() - cached.fetchedAt < SHEETS_METADATA_TTL_MS) {
    return { title: cached.title, tabNames: cached.tabNames, sheetIds: cached.sheetIds };
  }
  if (!forceRefresh) {
    const inflight = inFlightMetadataFetches.get(spreadsheetId);
    if (inflight) return inflight;
  }

  const p = (async () => {
    const { url, headers } = buildSheetsApiRequest(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}?fields=properties.title,sheets.properties(sheetId,title)`,
      auth
    );
    const res = await fetchWithRetry(
      url,
      { method: 'GET', headers },
      { timeoutMs: SHEETS_API_TIMEOUT_MS, retries: 2, baseDelayMs: 200 }
    );
    if (!res.ok) {
      if (res.status === 401) invalidateSheetsAccessTokenCache();
      const errTxt = await res.text().catch(() => '');
      throw new Error(`Sheets metadata HTTP ${res.status}: ${errTxt.slice(0, 120)}`);
    }
    const json = await res.json();
    const title = String(json?.properties?.title || '').trim();
    const tabNames: string[] = [];
    const sheetIds: Record<string, number> = {};
    if (Array.isArray(json?.sheets)) {
      for (const s of json.sheets) {
        const tabTitle = String(s?.properties?.title || '').trim();
        if (!tabTitle) continue;
        tabNames.push(tabTitle);
        if (typeof s?.properties?.sheetId === 'number' && Number.isInteger(s.properties.sheetId)) {
          sheetIds[tabTitle] = s.properties.sheetId;
        }
      }
    }
    sheetMetadataCache.set(spreadsheetId, { title, tabNames, sheetIds, fetchedAt: Date.now() });
    return { title, tabNames, sheetIds };
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
      } else if (
        typeof cellVal === 'string' &&
        SHEETS_DATE_HEADER_KEYS.has(hNorm) &&
        cellVal.trim() !== ''
      ) {
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

export async function tryFetchBatchSheetsViaApiV4(
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
    const res = await fetchWithRetry(
      url,
      { method: 'GET', headers },
      { timeoutMs: SHEETS_API_TIMEOUT_MS, retries: 2, baseDelayMs: 200 }
    );
    if (!res.ok) {
      if (res.status === 401) invalidateSheetsAccessTokenCache();
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
