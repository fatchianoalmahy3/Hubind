import express, { Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildStudentMonitoringSummary,
  calculateEqualWeightedAverage,
  extractStageNumber,
  getPredikatFromScore,
  getStageValueByNumber,
  stripStructuredTagsFromNote,
} from './src/core/utils/monitoringHelpers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Load Firebase project/database config cleanly (zero hardcoded fallback)
interface FirebaseAppletConfig {
  projectId: string;
  firestoreDatabaseId: string;
  apiKey: string;
}

function loadFirebaseConfig(): FirebaseAppletConfig {
  const cfgPath = path.join(__dirname, 'firebase-applet-config.json');
  const raw = fs.readFileSync(cfgPath, 'utf-8');
  const parsed = JSON.parse(raw);
  return {
    projectId: String(parsed.projectId || ''),
    firestoreDatabaseId: String(parsed.firestoreDatabaseId || '(default)'),
    apiKey: String(parsed.apiKey || ''),
  };
}

const firebaseCfg = loadFirebaseConfig();
const BOOTSTRAP_ADMIN_EMAIL = 'fatchiano1@gmail.com';

export interface WorkspaceConfig {
  activeYear: string;
  spreadsheetId: string;
  spreadsheetName: string;
  spreadsheetUrl: string;
  driveFolderUrl: string;
  gasDeployUrl: string;
  academicYears: any[];
  templates: any[];
}

// Short in-memory caches with strict per-sheet write invalidation (SSOT stays Firestore + Google Spreadsheet)
const CONFIG_CACHE_TTL_MS = 15_000;
const SHEET_CACHE_TTL_MS = 20_000;
const GAS_FETCH_TIMEOUT_MS = 15_000;

let cachedWorkspaceConfig: { config: WorkspaceConfig; fetchedAt: number } | null = null;
let inFlightConfigFetch: Promise<WorkspaceConfig> | null = null;
const sheetCache = new Map<string, { data: any[]; fetchedAt: number }>();
const inFlightSheetFetches = new Map<string, Promise<{ rows: any[]; config: WorkspaceConfig }>>();
const siswaIndexCache = new Map<string, { byKey: Map<string, any>; fetchedAt: number }>();

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = GAS_FETCH_TIMEOUT_MS
): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new PortalConfigError(
        'GAS_TIMEOUT',
        `Permintaan ke Google Apps Script melebihi batas waktu (${Math.round(timeoutMs / 1000)} detik). Silakan coba lagi.`,
        504
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function decodeFirestoreValue(val: any): any {
  if (!val || typeof val !== 'object') return null;
  if ('stringValue' in val) return val.stringValue;
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('timestampValue' in val) return val.timestampValue;
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) {
    const arr = val.arrayValue?.values || [];
    return arr.map((item: any) => decodeFirestoreValue(item));
  }
  if ('mapValue' in val) {
    const fields = val.mapValue?.fields || {};
    const obj: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      obj[k] = decodeFirestoreValue(v);
    }
    return obj;
  }
  return null;
}

async function getFirestoreWorkspaceConfig(forceRefresh = false): Promise<WorkspaceConfig> {
  if (
    !forceRefresh &&
    cachedWorkspaceConfig &&
    Date.now() - cachedWorkspaceConfig.fetchedAt < CONFIG_CACHE_TTL_MS
  ) {
    return cachedWorkspaceConfig.config;
  }

  if (!forceRefresh && inFlightConfigFetch) {
    return inFlightConfigFetch;
  }

  const loadPromise = (async (): Promise<WorkspaceConfig> => {
    const emptyConfig: WorkspaceConfig = {
      activeYear: '2026/2027',
      spreadsheetId: '',
      spreadsheetName: '',
      spreadsheetUrl: '',
      driveFolderUrl: '',
      gasDeployUrl: '',
      academicYears: [],
      templates: [],
    };

    if (!firebaseCfg.projectId) {
      return emptyConfig;
    }

    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      firebaseCfg.projectId
    )}/databases/${encodeURIComponent(firebaseCfg.firestoreDatabaseId)}/documents/config/workspace`;

    const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 10_000);
    if (res.status === 404) {
      cachedWorkspaceConfig = { config: emptyConfig, fetchedAt: Date.now() };
      return emptyConfig;
    }
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gagal membaca konfigurasi Firestore (${res.status}): ${errText.slice(0, 160)}`);
    }

    const docJson = await res.json();
    const fields = docJson?.fields || {};
    const decoded: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      decoded[k] = decodeFirestoreValue(v);
    }

    const academicYears = Array.isArray(decoded.academicYears) ? decoded.academicYears : [];
    const activeYear = String(decoded.activeYear || '2026/2027');
    const activeEntry = academicYears.find((ay: any) => ay?.year === activeYear) || academicYears[0];

    const config: WorkspaceConfig = {
      activeYear,
      spreadsheetId: String(decoded.spreadsheetId || activeEntry?.spreadsheetId || ''),
      spreadsheetName: String(decoded.spreadsheetName || activeEntry?.spreadsheetName || ''),
      spreadsheetUrl: String(decoded.spreadsheetUrl || activeEntry?.spreadsheetUrl || ''),
      driveFolderUrl: String(decoded.driveFolderUrl || ''),
      gasDeployUrl: normalizeServerGasUrl(String(decoded.gasDeployUrl || '')),
      academicYears,
      templates: Array.isArray(decoded.templates) ? decoded.templates : [],
    };

    cachedWorkspaceConfig = { config, fetchedAt: Date.now() };
    return config;
  })();

  if (!forceRefresh) {
    inFlightConfigFetch = loadPromise;
  }
  try {
    return await loadPromise;
  } finally {
    if (inFlightConfigFetch === loadPromise) {
      inFlightConfigFetch = null;
    }
  }
}

function normalizeServerGasUrl(rawUrl: string): string {
  const trimmed = String(rawUrl || '')
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, '');
  if (!trimmed) return '';
  let url = trimmed;
  if (/^(script\.google\.com|docs\.google\.com|[a-z0-9-]+\.[a-z]{2,}\/)/i.test(url)) {
    url = `https://${url.replace(/^\/+/, '')}`;
  }
  url = url.replace(/^(https:\/\/script\.google\.com)\/macros\/u\/\d+\/s\//i, '$1/macros/s/');
  return url;
}

class PortalConfigError extends Error {
  public code: string;
  public status: number;
  constructor(code: string, message: string, status = 503) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function validateGasUrl(rawUrl: string): string {
  const trimmed = normalizeServerGasUrl(rawUrl);
  if (!trimmed) {
    throw new PortalConfigError(
      'GAS_NOT_CONFIGURED',
      'URL Google Apps Script Web App belum diatur oleh Admin Hubin untuk akses portal publik.'
    );
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new PortalConfigError(
      'GAS_INVALID_URL',
      'URL Google Apps Script tidak valid. Harus diawali https://...',
      502
    );
  }
  if (/script\.google\.com\/home\/projects\//i.test(trimmed) || /\/edit(\?|$|#)/i.test(trimmed)) {
    throw new PortalConfigError(
      'GAS_INVALID_URL',
      'Link yang ditempel adalah link editor Apps Script (/edit), bukan Web App URL. Klik Deploy -> New deployment -> pilih Web app -> salin URL "/exec".',
      502
    );
  }
  if (/\/dev(\?|$)/i.test(trimmed)) {
    throw new PortalConfigError(
      'GAS_INVALID_URL',
      'URL Google Apps Script masih menggunakan "/dev" yang memerlukan login Google. Gunakan URL Web App deployment resmi yang berakhiran "/exec" dengan akses "Siapa saja (Anyone)".',
      502
    );
  }
  if (/script\.google\.com/i.test(trimmed) && !/\/exec(\?|$)/i.test(trimmed)) {
    throw new PortalConfigError(
      'GAS_INVALID_URL',
      'URL Google Apps Script harus berakhiran "/exec". Salin ulang URL resmi dari dialog Deploy -> Kelola deployment.',
      502
    );
  }
  return trimmed;
}

function parseGasJsonSafely(rawText: string, sheetName: string, status: number): any {
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
        ? `Google Apps Script mengembalikan halaman login HTML untuk sheet [${sheetName}]. Pastikan Web App di-deploy ulang dengan akses "Who has access: Anyone (Siapa saja)" dan URL berakhiran "/exec".`
        : `Google Apps Script mengembalikan halaman HTML error (HTTP ${status}) untuk sheet [${sheetName}]. Periksa kode doGet/doPost dan deployment Web App "/exec".`,
      502
    );
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    throw new PortalConfigError(
      'GAS_INVALID_RESPONSE',
      `Respon Google Apps Script untuk [${sheetName}] bukan JSON valid: ${trimmed.slice(0, 120)}`,
      502
    );
  }
}

async function fetchLiveSheetViaGas(sheetName: string, forceRefresh = false): Promise<{
  rows: any[];
  config: WorkspaceConfig;
}> {
  const config = await getFirestoreWorkspaceConfig(forceRefresh);

  if (!config.spreadsheetId) {
    throw new PortalConfigError(
      'SPREADSHEET_NOT_CONFIGURED',
      'ID Google Spreadsheet belum dikonfigurasi oleh Admin Hubin di Firebase.'
    );
  }

  const gasUrl = validateGasUrl(config.gasDeployUrl);

  const cacheKey = `${config.spreadsheetId}::${sheetName}`;
  const cached = sheetCache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.fetchedAt < SHEET_CACHE_TTL_MS) {
    return { rows: cached.data, config };
  }

  if (!forceRefresh) {
    const existingFlight = inFlightSheetFetches.get(cacheKey);
    if (existingFlight) {
      return existingFlight;
    }
  }

  const fetchPromise = (async (): Promise<{ rows: any[]; config: WorkspaceConfig }> => {
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
        `Server gagal menghubungi URL Google Apps Script (${err?.message || 'network error'}). Periksa URL "/exec" dan pastikan akses deployment adalah "Anyone (Siapa saja)".`,
        502
      );
    }

    const rawText = await gasRes.text();

    if (!gasRes.ok) {
      parseGasJsonSafely(rawText, sheetName, gasRes.status);
      throw new PortalConfigError(
        'GAS_FETCH_FAILED',
        `Gagal membaca sheet [${sheetName}] dari Google Spreadsheet (HTTP ${gasRes.status}).`,
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

async function fetchBatchSheetsViaGas(
  sheetNames: string[],
  optionalSheets: Set<string> = new Set(),
  forceRefresh = false
): Promise<{ sheets: Record<string, any[]>; config: WorkspaceConfig }> {
  const config = await getFirestoreWorkspaceConfig(forceRefresh);

  if (!config.spreadsheetId) {
    throw new PortalConfigError(
      'SPREADSHEET_NOT_CONFIGURED',
      'ID Google Spreadsheet belum dikonfigurasi oleh Admin Hubin di Firebase.'
    );
  }
  const gasUrl = validateGasUrl(config.gasDeployUrl);

  const sheetsResult: Record<string, any[]> = {};
  const missingSheets: string[] = [];
  const now = Date.now();

  for (const name of sheetNames) {
    const cacheKey = `${config.spreadsheetId}::${name}`;
    const cached = sheetCache.get(cacheKey);
    if (!forceRefresh && cached && now - cached.fetchedAt < SHEET_CACHE_TTL_MS) {
      sheetsResult[name] = cached.data;
    } else {
      missingSheets.push(name);
    }
  }

  if (missingSheets.length === 0) {
    return { sheets: sheetsResult, config };
  }

  // Try GAS native BATCH_GET endpoint first (1 cold-start instead of N parallel roundtrips)
  if (missingSheets.length > 1) {
    try {
      const separator = gasUrl.includes('?') ? '&' : '?';
      const batchUrl = `${gasUrl}${separator}action=BATCH_GET&sheets=${encodeURIComponent(
        missingSheets.join(',')
      )}&year=${encodeURIComponent(config.activeYear)}&spreadsheetId=${encodeURIComponent(
        config.spreadsheetId
      )}`;

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
      // Fallback gracefully below if deployed GAS script hasn't been updated to v2 BATCH_GET yet
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

async function fetchMasterSiswaRows(forceRefresh = false): Promise<{
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

type GasWriteAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'BULK_DELETE'
  | 'BULK_UPDATE'
  | 'IMPORT'
  | 'SYNC_ALL';

async function writeLiveSheetViaGas(
  sheetName: string,
  action: GasWriteAction,
  payload: any
): Promise<void> {
  const config = await getFirestoreWorkspaceConfig();

  if (!config.spreadsheetId) {
    throw new PortalConfigError(
      'SPREADSHEET_NOT_CONFIGURED',
      'ID Google Spreadsheet belum dikonfigurasi oleh Admin Hubin.'
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
      `Server gagal mengirim data ke URL Google Apps Script (${err?.message || 'network error'}). Periksa URL "/exec" dan deployment Web App.`,
      502
    );
  }

  const rawText = await gasRes.text();
  const json = parseGasJsonSafely(rawText, sheetName, gasRes.status);

  if (!gasRes.ok) {
    throw new PortalConfigError(
      'GAS_WRITE_FAILED',
      `Gagal menulis ke Google Spreadsheet [${sheetName}] (HTTP ${gasRes.status}).`,
      502
    );
  }

  if (json?.error) {
    throw new PortalConfigError('GAS_WRITE_ERROR', String(json.error), 502);
  }

  // Instant cache invalidation after write
  sheetCache.delete(`${config.spreadsheetId}::${sheetName}`);
  if (sheetName === 'Master_Siswa_XI' || sheetName === 'Master_Siswa') {
    siswaIndexCache.delete(config.spreadsheetId);
    sheetCache.delete(`${config.spreadsheetId}::Master_Siswa_XI`);
    sheetCache.delete(`${config.spreadsheetId}::Master_Siswa`);
  }
}

function handlePortalError(res: Response, err: any) {
  if (err instanceof PortalConfigError) {
    return res.status(err.status).json({
      success: false,
      code: err.code,
      message: err.message,
    });
  }
  return res.status(500).json({
    success: false,
    code: 'INTERNAL_ERROR',
    message: err?.message || 'Terjadi kesalahan pada server saat mengakses Google Spreadsheet.',
  });
}

function pickField(row: Record<string, any>, ...keys: string[]): string {
  for (const k of keys) {
    const val = row?.[k];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  return '';
}

function normalizeStr(v: any): string {
  return String(v ?? '').trim().toLowerCase();
}

const ROLE_TITLE_MAP: Record<string, string> = {
  Hubin: 'Koordinator Pokja Hubin & Kerjasama DUDI',
  Kepsek: 'Kepala Sekolah SMK PGRI 2 Ponorogo',
  Waka: 'Wakil Kepala Sekolah Bidang Hubin',
  Pokja: 'Tim Pokja Hubin & Pendamping PKL',
  Kakomli: 'Ketua Konsentrasi Keahlian (Kakomli)',
};

const DEFAULT_ADMIN_SEED = [
  {
    id: 'AKN-HUBIN',
    username: 'hubin',
    defaultPassword: 'Hubin@2026',
    role: 'Hubin',
    namaLengkap: 'Admin Pokja Hubin',
    jabatan: ROLE_TITLE_MAP.Hubin,
  },
  {
    id: 'AKN-KEPSEK',
    username: 'kepsek',
    defaultPassword: 'Kepsek@2026',
    role: 'Kepsek',
    namaLengkap: 'Kepala Sekolah',
    jabatan: ROLE_TITLE_MAP.Kepsek,
  },
  {
    id: 'AKN-WAKA',
    username: 'waka',
    defaultPassword: 'Waka@2026',
    role: 'Waka',
    namaLengkap: 'Waka Bidang Hubin',
    jabatan: ROLE_TITLE_MAP.Waka,
  },
  {
    id: 'AKN-POKJA',
    username: 'pokja',
    defaultPassword: 'Pokja@2026',
    role: 'Pokja',
    namaLengkap: 'Staf Pokja Hubin',
    jabatan: ROLE_TITLE_MAP.Pokja,
  },
  {
    id: 'AKN-KAKOMLI',
    username: 'kakomli',
    defaultPassword: 'Kakomli@2026',
    role: 'Kakomli',
    namaLengkap: 'Ketua Kompetensi Keahlian',
    jabatan: ROLE_TITLE_MAP.Kakomli,
  },
];

function getSessionSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    crypto
      .createHash('sha256')
      .update(`${firebaseCfg.projectId}:${firebaseCfg.apiKey}:hubin-sterida-session-v1`)
      .digest('hex')
  );
}

function hashPasswordServer(plainPassword: string, customSalt?: string): string {
  const salt = customSalt || crypto.randomBytes(12).toString('hex');
  const digest = crypto.createHash('sha256').update(`${salt}:${plainPassword}`).digest('hex');
  return `sha256$${salt}$${digest}`;
}

function verifyPasswordServer(plainPassword: string, storedHash: string): boolean {
  const trimmed = String(storedHash || '').trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('sha256$')) {
    const parts = trimmed.split('$');
    if (parts.length !== 3) return false;
    const [, salt, expectedHex] = parts;
    const actualHex = crypto.createHash('sha256').update(`${salt}:${plainPassword}`).digest('hex');
    const a = Buffer.from(actualHex, 'utf8');
    const b = Buffer.from(expectedHex, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  return plainPassword === trimmed;
}

interface AdminSessionPayload {
  id: string;
  username: string;
  role: string;
  name: string;
  exp: number;
}

function signAdminSessionToken(payload: Omit<AdminSessionPayload, 'exp'>): string {
  const full: AdminSessionPayload = {
    ...payload,
    exp: Date.now() + 24 * 60 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(full), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  return `hb1.${encoded}.${sig}`;
}

function verifyAdminSessionToken(token: string): AdminSessionPayload | null {
  if (!token.startsWith('hb1.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(sig, 'utf8');
  const expBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as AdminSessionPayload;
    if (!decoded?.username || !decoded?.exp || Date.now() > decoded.exp) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

interface ServerAdminAccountRecord {
  id: string;
  username: string;
  passwordHash: string;
  role: string;
  namaLengkap: string;
  jabatan: string;
  status: 'Aktif' | 'Nonaktif';
  updatedAt: string;
  isDefaultSeed: boolean;
}

function buildDefaultAdminRecords(): ServerAdminAccountRecord[] {
  const nowIso = new Date().toISOString();
  return DEFAULT_ADMIN_SEED.map((d) => ({
    id: d.id,
    username: d.username,
    passwordHash: hashPasswordServer(d.defaultPassword, `${d.username}_salt_2026`),
    role: d.role,
    namaLengkap: d.namaLengkap,
    jabatan: d.jabatan,
    status: 'Aktif',
    updatedAt: nowIso,
    isDefaultSeed: true,
  }));
}

function normalizeAccountRecord(raw: any, idx: number): ServerAdminAccountRecord | null {
  const username = pickField(raw, 'Username', 'username').toLowerCase();
  if (!username) return null;
  const validRoles = ['Hubin', 'Kepsek', 'Waka', 'Pokja', 'Kakomli'];
  const rawRole = pickField(raw, 'Role', 'role') || 'Pokja';
  const role = validRoles.includes(rawRole) ? rawRole : 'Pokja';
  const rawStatus = pickField(raw, 'Status', 'status').toLowerCase();
  return {
    id: pickField(raw, 'ID', 'id') || `AKN-${idx + 1}`,
    username,
    passwordHash: pickField(raw, 'Password_Hash', 'passwordHash', 'password_hash'),
    role,
    namaLengkap: pickField(raw, 'Nama_Lengkap', 'namaLengkap', 'nama') || username,
    jabatan: pickField(raw, 'Jabatan', 'jabatan') || ROLE_TITLE_MAP[role] || role,
    status: rawStatus === 'nonaktif' ? 'Nonaktif' : 'Aktif',
    updatedAt: pickField(raw, 'Updated_At', 'updatedAt'),
    isDefaultSeed: false,
  };
}

async function fetchMasterAkunFromGasOrDefaults(forceRefresh = false): Promise<{
  accounts: ServerAdminAccountRecord[];
  syncedToSheet: boolean;
}> {
  try {
    const { rows } = await fetchLiveSheetViaGas('Master_Akun', forceRefresh);
    const parsed = rows
      .map((r, i) => normalizeAccountRecord(r, i))
      .filter((a): a is NonNullable<ReturnType<typeof normalizeAccountRecord>> => a !== null);

    if (parsed.length > 0) {
      return { accounts: parsed, syncedToSheet: true };
    }
  } catch (err: any) {
    // Missing Master_Akun tab or unconfigured GAS -> safely fall back to built-in 5 defaults
    const msg = String(err?.message || '').toLowerCase();
    const isFallbackable =
      msg.includes('tidak ditemukan') ||
      msg.includes('not found') ||
      err?.code === 'GAS_NOT_CONFIGURED' ||
      err?.code === 'SPREADSHEET_NOT_CONFIGURED';
    if (!isFallbackable) {
      console.warn('[Master_Akun] GAS read fallback to defaults:', err?.message);
    }
  }

  return { accounts: buildDefaultAdminRecords(), syncedToSheet: false };
}

// Verify either HMAC Admin Session Token (Username+Password) OR Firebase ID Token
async function requireAdminAuth(req: Request): Promise<{
  id: string;
  username: string;
  role: string;
  name: string;
}> {
  const authHeader = String(req.headers.authorization || '');
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) {
    throw new PortalConfigError('UNAUTHORIZED', 'Sesi login pengelola tidak ditemukan. Silakan masuk kembali.', 401);
  }

  const token = match[1].trim();
  const localSession = verifyAdminSessionToken(token);
  if (localSession) {
    return {
      id: localSession.id,
      username: localSession.username,
      role: localSession.role,
      name: localSession.name,
    };
  }

  // Legacy Firebase ID Token fallback
  if (!firebaseCfg.apiKey || !firebaseCfg.projectId) {
    throw new PortalConfigError('UNAUTHORIZED', 'Token sesi tidak valid atau kedaluwarsa.', 401);
  }

  const lookupRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseCfg.apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
    }
  );

  if (!lookupRes.ok) {
    throw new PortalConfigError('UNAUTHORIZED', 'Sesi login telah berakhir. Silakan masuk ulang.', 401);
  }

  const lookupJson = await lookupRes.json();
  const fbUser = lookupJson?.users?.[0];
  const uid = String(fbUser?.localId || '');
  const email = String(fbUser?.email || '');
  const emailVerified = Boolean(fbUser?.emailVerified);

  if (!uid || !emailVerified) {
    throw new PortalConfigError('FORBIDDEN', 'Akun tidak terverifikasi.', 403);
  }

  if (email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase()) {
    return { id: uid, username: email, role: 'Hubin', name: fbUser?.displayName || email };
  }

  const adminDocUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    firebaseCfg.projectId
  )}/databases/${encodeURIComponent(firebaseCfg.firestoreDatabaseId)}/documents/admins/${encodeURIComponent(uid)}`;

  const adminRes = await fetch(adminDocUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!adminRes.ok) {
    throw new PortalConfigError(
      'FORBIDDEN',
      `Akun (${email}) tidak terdaftar sebagai Admin Hubin terotorisasi.`,
      403
    );
  }

  return { id: uid, username: email, role: 'Hubin', name: fbUser?.displayName || email };
}

// Admin Login: Username + Password verified against Master_Akun in Spreadsheet (or 5 role defaults)
app.post('/api/admin/login', async (req: Request, res: Response) => {
  try {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username dan Password wajib diisi.',
      });
    }

    let { accounts } = await fetchMasterAkunFromGasOrDefaults(false);
    let matched = accounts.find((a) => a.username.toLowerCase() === username);

    // If not matched on cached Master_Akun, force-refresh from Sheet once so cross-device password changes work immediately
    if (!matched || !verifyPasswordServer(password, matched.passwordHash)) {
      const freshRes = await fetchMasterAkunFromGasOrDefaults(true);
      accounts = freshRes.accounts;
      matched = accounts.find((a) => a.username.toLowerCase() === username);
    }

    if (!matched) {
      return res.status(401).json({
        success: false,
        message: `Username "${username}" tidak ditemukan.`,
      });
    }

    if (matched.status === 'Nonaktif') {
      return res.status(403).json({
        success: false,
        message: `Akun "${username}" sedang dinonaktifkan oleh Admin Hubin.`,
      });
    }

    if (!verifyPasswordServer(password, matched.passwordHash)) {
      return res.status(401).json({
        success: false,
        message: 'Password yang Anda masukkan tidak sesuai.',
      });
    }

    const sessionToken = signAdminSessionToken({
      id: matched.id,
      username: matched.username,
      role: matched.role,
      name: matched.namaLengkap,
    });

    return res.json({
      success: true,
      sessionToken,
      user: {
        id: matched.id,
        username: matched.username,
        role: matched.role,
        name: matched.namaLengkap,
        title: matched.jabatan || ROLE_TITLE_MAP[matched.role] || matched.role,
        email: '',
        identifier: matched.username,
        canManageSpreadsheet:
          matched.role === 'Hubin' || matched.role === 'Kepsek' || matched.role === 'Waka',
      },
    });
  } catch (err: any) {
    handlePortalError(res, err);
  }
});

// Admin Accounts: List Master_Akun (preserving password hashes server-side)
app.get('/api/admin/accounts', async (req: Request, res: Response) => {
  try {
    const session = await requireAdminAuth(req);
    const { accounts, syncedToSheet } = await fetchMasterAkunFromGasOrDefaults(true);

    const visible =
      session.role === 'Hubin'
        ? accounts
        : accounts.filter((a) => a.id === session.id || a.username === session.username);

    res.json({
      success: true,
      syncedToSheet,
      accounts: visible.map(({ passwordHash: _omit, ...rest }) => rest),
    });
  } catch (err: any) {
    handlePortalError(res, err);
  }
});

// Admin Accounts: Create / Update / Delete / Bootstrap to Master_Akun in Spreadsheet
app.post('/api/admin/accounts', async (req: Request, res: Response) => {
  try {
    const session = await requireAdminAuth(req);
    const body = req.body || {};

    // Support direct rows payload from LocalAccountAuthService (already hashed in browser)
    if (Array.isArray(body.accounts)) {
      if (session.role !== 'Hubin' && body.accounts.length > 1) {
        return res.status(403).json({
          success: false,
          message: 'Hanya peran Hubin yang dapat mengelola seluruh daftar akun.',
        });
      }
      await writeLiveSheetViaGas('Master_Akun', 'SYNC_ALL', body.accounts);
      const cfg = await getFirestoreWorkspaceConfig();
      if (cfg.spreadsheetId) {
        sheetCache.delete(`${cfg.spreadsheetId}::Master_Akun`);
      }
      return res.json({ success: true });
    }

    const op = String(body.op || 'UPSERT').toUpperCase();
    const { accounts: currentAccounts } = await fetchMasterAkunFromGasOrDefaults(true);
    let working = currentAccounts.map((a) => ({ ...a }));

    if (op === 'BOOTSTRAP') {
      if (session.role !== 'Hubin') {
        return res.status(403).json({ success: false, message: 'Hanya Hubin yang dapat inisialisasi akun.' });
      }
      working = working.map((a) => ({ ...a, isDefaultSeed: false }));
    } else if (op === 'DELETE') {
      if (session.role !== 'Hubin') {
        return res.status(403).json({ success: false, message: 'Hanya Hubin yang dapat menghapus akun.' });
      }
      const targetId = String(body.id || '').trim();
      const target = working.find((a) => a.id === targetId);
      if (target) {
        const remainingHubin = working.filter(
          (a) => a.id !== targetId && a.role === 'Hubin' && a.status === 'Aktif'
        );
        if (target.role === 'Hubin' && remainingHubin.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'Minimal harus ada 1 akun Hubin aktif.',
          });
        }
        working = working.filter((a) => a.id !== targetId);
      }
    } else {
      const cleanUsername = String(body.username || '').trim().toLowerCase();
      if (!/^[a-z0-9._-]{3,32}$/.test(cleanUsername)) {
        return res.status(400).json({
          success: false,
          message: 'Username harus 3–32 karakter (huruf kecil, angka, titik, underscore, atau strip).',
        });
      }

      const targetId = String(body.id || '').trim();
      const existingIdx = working.findIndex(
        (a) => (targetId && a.id === targetId) || a.username === cleanUsername
      );

      if (session.role !== 'Hubin') {
        if (existingIdx === -1 || working[existingIdx].id !== session.id) {
          return res.status(403).json({
            success: false,
            message: 'Anda hanya dapat mengubah username & password akun Anda sendiri.',
          });
        }
      }

      const duplicate = working.find((a, idx) => a.username === cleanUsername && idx !== existingIdx);
      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: `Username "${cleanUsername}" sudah dipakai oleh akun lain.`,
        });
      }

      const newPassword = String(body.newPassword || '').trim();
      let passwordHash = existingIdx !== -1 ? working[existingIdx].passwordHash : '';
      if (newPassword) {
        if (newPassword.length < 6) {
          return res.status(400).json({
            success: false,
            message: 'Password baru minimal 6 karakter.',
          });
        }
        passwordHash = hashPasswordServer(newPassword);
      } else if (!passwordHash) {
        return res.status(400).json({
          success: false,
          message: 'Password wajib diisi untuk akun baru.',
        });
      }

      const requestedRole =
        session.role === 'Hubin'
          ? String(body.role || (existingIdx !== -1 ? working[existingIdx].role : 'Pokja'))
          : working[existingIdx].role;

      const updatedRow = {
        id: targetId || (existingIdx !== -1 ? working[existingIdx].id : `AKN-${Date.now().toString(36).toUpperCase()}`),
        username: cleanUsername,
        passwordHash,
        role: requestedRole,
        namaLengkap: String(body.namaLengkap || '').trim() || cleanUsername,
        jabatan: String(body.jabatan || '').trim() || ROLE_TITLE_MAP[requestedRole] || requestedRole,
        status:
          session.role === 'Hubin' && String(body.status || '').toLowerCase() === 'nonaktif'
            ? ('Nonaktif' as const)
            : ('Aktif' as const),
        updatedAt: new Date().toISOString(),
        isDefaultSeed: false,
      };

      if (existingIdx !== -1) {
        working[existingIdx] = updatedRow;
      } else {
        working.push(updatedRow);
      }
    }

    const rowsPayload = working.map((a) => ({
      id: a.id,
      ID: a.id,
      Username: a.username,
      Password_Hash: a.passwordHash,
      Role: a.role,
      Nama_Lengkap: a.namaLengkap,
      Jabatan: a.jabatan,
      Status: a.status,
      Updated_At: a.updatedAt || new Date().toISOString(),
    }));

    await writeLiveSheetViaGas('Master_Akun', 'SYNC_ALL', rowsPayload);
    const cfg = await getFirestoreWorkspaceConfig();
    if (cfg.spreadsheetId) {
      sheetCache.delete(`${cfg.spreadsheetId}::Master_Akun`);
    }

    return res.json({
      success: true,
      syncedToSheet: true,
      accounts: working.map(({ passwordHash: _omit, ...rest }) => rest),
    });
  } catch (err: any) {
    handlePortalError(res, err);
  }
});

// Invalidate server-side short-lived caches immediately after admin changes settings/data
app.post('/api/cache/invalidate', async (req: Request, res: Response) => {
  const sheetParam = String(req.query.sheet || req.body?.sheet || '').trim();
  if (sheetParam) {
    const cfg = await getFirestoreWorkspaceConfig().catch(() => null);
    if (cfg?.spreadsheetId) {
      sheetCache.delete(`${cfg.spreadsheetId}::${sheetParam}`);
      if (sheetParam === 'Master_Siswa_XI' || sheetParam === 'Master_Siswa') {
        siswaIndexCache.delete(cfg.spreadsheetId);
      }
    } else {
      sheetCache.clear();
    }
  } else {
    cachedWorkspaceConfig = null;
    sheetCache.clear();
    siswaIndexCache.clear();
  }
  res.json({ success: true, scope: sheetParam || 'all' });
});

// Admin Proxy: Verify GAS Web App connection without requiring per-device Google OAuth popup
app.get('/api/admin/gas-ping', async (req: Request, res: Response) => {
  try {
    await requireAdminAuth(req);
    const cfg = await getFirestoreWorkspaceConfig(true);
    const customGas = String(req.query.gasUrl || '').trim();
    const customSpreadsheetId = String(req.query.spreadsheetId || '').trim();
    const targetSpreadsheetId = customSpreadsheetId || cfg.spreadsheetId;
    const gasUrl = validateGasUrl(customGas || cfg.gasDeployUrl);

    if (!targetSpreadsheetId && !customGas) {
      throw new PortalConfigError(
        'SPREADSHEET_NOT_CONFIGURED',
        'ID Google Spreadsheet belum dikonfigurasi oleh Admin Hubin di Firebase.'
      );
    }

    const sep = gasUrl.includes('?') ? '&' : '?';
    const sidParam = targetSpreadsheetId
      ? `&spreadsheetId=${encodeURIComponent(targetSpreadsheetId)}`
      : '';
    const pingUrl = `${gasUrl}${sep}action=PING&sheet=Master_Jurusan&year=${encodeURIComponent(
      cfg.activeYear
    )}${sidParam}`;

    let gasRes: globalThis.Response;
    try {
      gasRes = await fetchWithTimeout(
        pingUrl,
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
        `Gagal menghubungi Google Apps Script (${err?.message || 'network error'}). Pastikan URL berakhiran "/exec" dan Web App di-deploy dengan akses "Siapa saja (Anyone)".`,
        502
      );
    }

    const rawText = await gasRes.text();
    const json = parseGasJsonSafely(rawText, 'PING', gasRes.status);

    if (!gasRes.ok || json?.error) {
      throw new PortalConfigError(
        'GAS_ERROR',
        String(json?.error || `GAS PING gagal (HTTP ${gasRes.status})`),
        502
      );
    }

    res.json({
      success: true,
      spreadsheetId: targetSpreadsheetId,
      title: json?.title || cfg.spreadsheetName || targetSpreadsheetId,
      sheets: Array.isArray(json?.sheets) ? json.sheets : [],
    });
  } catch (err: any) {
    handlePortalError(res, err);
  }
});

// Admin Proxy: Read sheet data via Cloud GAS Web App (consistent across refresh & devices)
app.get('/api/admin/sheet', async (req: Request, res: Response) => {
  try {
    await requireAdminAuth(req);
    const sheetName = String(req.query.sheet || '').trim();
    const fresh = String(req.query.fresh || '') === '1';

    if (!sheetName) {
      return res.status(400).json({ success: false, message: 'Parameter sheet wajib diisi.' });
    }

    const { rows, config } = await fetchLiveSheetViaGas(sheetName, fresh);
    res.json({
      success: true,
      sheetName,
      spreadsheetId: config.spreadsheetId,
      data: rows,
    });
  } catch (err: any) {
    handlePortalError(res, err);
  }
});

// Admin Proxy: Write sheet mutations via Cloud GAS Web App + instant cache invalidation
app.post('/api/admin/sheet', async (req: Request, res: Response) => {
  try {
    await requireAdminAuth(req);
    const { sheetName, action, data } = req.body || {};
    const validActions = new Set([
      'CREATE',
      'UPDATE',
      'DELETE',
      'BULK_DELETE',
      'BULK_UPDATE',
      'IMPORT',
      'SYNC_ALL',
    ]);

    if (!sheetName || !validActions.has(String(action || '').toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: 'Parameter sheetName dan action tidak valid.',
      });
    }

    await writeLiveSheetViaGas(String(sheetName), String(action).toUpperCase() as GasWriteAction, data);
    res.json({ success: true });
  } catch (err: any) {
    handlePortalError(res, err);
  }
});

// Public configuration summary (no dummy stats, no sensitive private admin data)
app.get('/api/public/config-summary', async (_req: Request, res: Response) => {
  try {
    const cfg = await getFirestoreWorkspaceConfig();
    res.json({
      success: true,
      activeYear: cfg.activeYear,
      isConfigured: Boolean(cfg.spreadsheetId),
      hasGasUrl: Boolean(cfg.gasDeployUrl),
      spreadsheetName: cfg.spreadsheetName,
    });
  } catch (err: any) {
    handlePortalError(res, err);
  }
});

// Public Student Lookup by NIS directly from Master_Siswa_XI (O(1) Indexed Cache)
app.get('/api/public/student-lookup/:nis', async (req: Request, res: Response) => {
  try {
    const searchNis = String(req.params.nis || '').trim();
    if (!searchNis) {
      return res.status(400).json({ success: false, found: false, message: 'NIS wajib diisi.' });
    }

    const { rows, config } = await fetchMasterSiswaRows();
    let indexEntry = siswaIndexCache.get(config.spreadsheetId);
    if (!indexEntry || Date.now() - indexEntry.fetchedAt >= SHEET_CACHE_TTL_MS) {
      const byKey = new Map<string, any>();
      for (const s of rows) {
        const nis = pickField(s, 'NIS', 'nis');
        const nik = pickField(s, 'NIK', 'nik');
        if (nis && !byKey.has(nis)) byKey.set(nis, s);
        if (nik && !byKey.has(nik)) byKey.set(nik, s);
      }
      indexEntry = { byKey, fetchedAt: Date.now() };
      siswaIndexCache.set(config.spreadsheetId, indexEntry);
    }

    const student = indexEntry.byKey.get(searchNis);

    if (!student) {
      return res.json({
        success: true,
        found: false,
        message: `Siswa dengan NIS [${searchNis}] tidak ditemukan di sheet Master Siswa.`,
      });
    }

    return res.json({
      success: true,
      found: true,
      student: {
        id: pickField(student, 'ID', 'id', 'NIS', 'nis'),
        nama: pickField(student, 'Nama_Lengkap', 'nama', 'namaLengkap'),
        nis: pickField(student, 'NIS', 'nis'),
        nik: pickField(student, 'NIK', 'nik'),
        kelas: pickField(student, 'Kelas', 'kelas'),
        jurusan: pickField(student, 'ID_Jurusan', 'jurusan', 'Jurusan', 'idJurusan'),
        telepon: pickField(student, 'No_HP_Siswa', 'noHpSiswa', 'telepon', 'noHp'),
        jk: pickField(student, 'Jenis_Kelamin', 'jenisKelamin', 'jk') || 'Laki-laki',
        alamat_domisili: pickField(
          student,
          'Alamat_Domisili',
          'alamatDomisili',
          'alamat_domisili',
          'Alamat',
          'alamat'
        ),
        nama_wali: pickField(
          student,
          'Nama_Ortu_Wali',
          'namaOrtuWali',
          'nama_ortu_wali',
          'Nama_Wali',
          'nama_wali'
        ),
        telepon_wali: pickField(
          student,
          'No_Ortu_Wali',
          'noOrtuWali',
          'no_ortu_wali',
          'Telepon_Wali',
          'telepon_wali'
        ),
      },
    });
  } catch (err: any) {
    handlePortalError(res, err);
  }
});

// Public DUDI List directly from Master_DUDI
app.get('/api/public/dudi-list', async (_req: Request, res: Response) => {
  try {
    const { rows } = await fetchLiveSheetViaGas('Master_DUDI');
    const mapped = rows
      .filter((d: any) => pickField(d, 'Nama_DUDI', 'namaDudi', 'nama_dudi', 'nama') !== '')
      .map((d: any, idx: number) => {
        const namaPemimpin = pickField(d, 'Nama_Pemimpin', 'namaPemimpin', 'nama_pemimpin', 'pimpinan');
        const namaPic = pickField(d, 'Nama_PIC', 'namaPic', 'nama_pic');
        const kontakPic = pickField(d, 'Kontak_PIC', 'kontakPic', 'kontak_pic');
        const noTelpDudi = pickField(d, 'No_Telp_DUDI', 'noTelpDudi', 'no_telp_dudi', 'telepon') || kontakPic;
        return {
          id: pickField(d, 'ID', 'id') || `dudi_${idx + 1}`,
          nama_dudi: pickField(d, 'Nama_DUDI', 'namaDudi', 'nama_dudi', 'nama'),
          bidang_usaha: pickField(d, 'Bidang_Keahlian', 'bidangKeahlian', 'bidang_usaha') || '-',
          alamat: pickField(d, 'Alamat', 'alamat'),
          kota: pickField(d, 'Wilayah_Kota', 'wilayahKota', 'kota'),
          kuota_maksimal: Number(d.Kuota_Maksimal ?? d.kuotaMaksimal ?? 0),
          terisi: Number(d.Terisi ?? d.terisi ?? 0),
          status: pickField(d, 'Status_Kerjasama', 'statusKerjasama', 'status') || 'Aktif',
          nama_pemimpin: namaPemimpin,
          nama_pic: namaPic,
          kontak_pic: kontakPic,
          no_telp_dudi: noTelpDudi,
          pimpinan: namaPemimpin || namaPic,
          telepon: noTelpDudi,
        };
      });

    res.json({ success: true, total: mapped.length, data: mapped });
  } catch (err: any) {
    handlePortalError(res, err);
  }
});

// Public Student PKL Application Submission -> writes directly to Data_Pengajuan_PKL
app.post('/api/public/submit-application', async (req: Request, res: Response) => {
  try {
    const payload = req.body || {};
    if (!payload.nis || !payload.nama) {
      return res.status(400).json({ success: false, message: 'NIS dan Nama Siswa wajib diisi.' });
    }

    const noPengajuan = `REQ-${new Date().getFullYear()}-${String(payload.jurusan || 'PKL')
      .substring(0, 3)
      .toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
    const nowIso = new Date().toISOString();
    const timestamp = nowIso.replace('T', ' ').substring(0, 19);

    const namaPemimpin = String(payload.nama_pemimpin || '').trim();
    const namaPic = String(payload.nama_pic || '').trim();
    const noTelpDudi = String(payload.no_telp_dudi || '').trim();

    const dudiContactSummary = [
      namaPemimpin ? `Pemimpin: ${namaPemimpin}` : '',
      namaPic ? `PIC/Pendamping: ${namaPic}` : '',
      noTelpDudi ? `Telp DUDI: ${noTelpDudi}` : '',
    ]
      .filter(Boolean)
      .join(' | ');

    const baseStatusNote = payload.is_dudi_unregistered
      ? 'Pengajuan DUDI baru (perlu verifikasi kelayakan Hubin).'
      : 'Menunggu review relevansi kompetensi oleh Kakomli.';

    const combinedCatatanKakomli = dudiContactSummary
      ? `${baseStatusNote} [${dudiContactSummary}]`
      : baseStatusNote;

    const sheetRow = {
      id: noPengajuan,
      No_Pengajuan: noPengajuan,
      noPengajuan,
      Timestamp: timestamp,
      timestamp,
      NIS: String(payload.nis).trim(),
      nis: String(payload.nis).trim(),
      Nama_Siswa: String(payload.nama).trim(),
      namaSiswa: String(payload.nama).trim(),
      nama_siswa: String(payload.nama).trim(),
      Jurusan: String(payload.jurusan || ''),
      jurusan: String(payload.jurusan || ''),
      Kelas: String(payload.kelas || ''),
      kelas: String(payload.kelas || ''),
      DUDI_Tujuan: String(payload.nama_dudi || ''),
      dudiTujuan: String(payload.nama_dudi || ''),
      ID_DUDI: payload.dudi_id && payload.dudi_id !== 'custom_hubin' ? String(payload.dudi_id) : '',
      idDudi: payload.dudi_id && payload.dudi_id !== 'custom_hubin' ? String(payload.dudi_id) : '',
      nama_dudi: String(payload.nama_dudi || ''),
      Alamat_DUDI: String(payload.alamat_dudi || ''),
      alamatDudi: String(payload.alamat_dudi || ''),
      Bidang_Pekerjaan: String(payload.bidang_dudi || ''),
      bidangPekerjaan: String(payload.bidang_dudi || ''),
      Nama_Pemimpin: namaPemimpin,
      namaPemimpin,
      Nama_PIC: namaPic,
      namaPic,
      No_Telp_DUDI: noTelpDudi,
      noTelpDudi,
      Kontak_PIC: noTelpDudi,
      kontakPic: noTelpDudi,
      No_WA: String(payload.telepon || ''),
      noWa: String(payload.telepon || ''),
      Alamat_Domisili: String(payload.alamat_domisili || ''),
      alamatDomisili: String(payload.alamat_domisili || ''),
      Nama_Ortu_Wali: String(payload.nama_orang_tua || ''),
      namaOrtuWali: String(payload.nama_orang_tua || ''),
      No_Ortu_Wali: String(payload.telepon_orang_tua || ''),
      noOrtuWali: String(payload.telepon_orang_tua || ''),
      Status_Kakomli: 'Pending',
      statusKakomli: 'Pending',
      Catatan_Kakomli: combinedCatatanKakomli,
      catatanKakomli: combinedCatatanKakomli,
      Status_Hubin: 'Menunggu ACC Kakomli',
      statusHubin: 'Menunggu ACC Kakomli',
      Guru_Pendamping: '',
      guruPendamping: '',
      Tgl_Berangkat: '',
      tanggalBerangkat: '',
      status: 'Menunggu Validasi Kakomli',
    };

    await writeLiveSheetViaGas('Data_Pengajuan_PKL', 'CREATE', sheetRow);

    res.json({
      success: true,
      message: 'Pengajuan PKL berhasil disimpan langsung ke Google Spreadsheet.',
      application: sheetRow,
    });
  } catch (err: any) {
    handlePortalError(res, err);
  }
});

// Public Petugas List directly from Master_Guru_Pendamping (ZERO fallback mock array)
app.get('/api/public/petugas-list', async (_req: Request, res: Response) => {
  try {
    const { rows } = await fetchLiveSheetViaGas('Master_Guru_Pendamping');
    const mapped = rows
      .filter((g: any) => pickField(g, 'Nama_Lengkap', 'nama', 'Nama') !== '')
      .map((g: any, idx: number) => ({
        id: pickField(g, 'ID', 'id') || `guru_${idx + 1}`,
        nama: pickField(g, 'Nama_Lengkap', 'nama', 'Nama'),
        nip: pickField(g, 'NIP', 'nip') || '-',
        peran: pickField(g, 'Peran_Utama', 'peranUtama', 'peran') || 'Guru Pendamping',
        email: pickField(g, 'Email_Google', 'email', 'emailGoogle'),
      }));

    // Background non-blocking warmup for Step 2 (Plotting_Pemberangkatan + Master_DUDI)
    void fetchBatchSheetsViaGas(
      ['Plotting_Pemberangkatan', 'Master_DUDI'],
      new Set(['Plotting_Pemberangkatan', 'Master_DUDI'])
    ).catch(() => {});

    res.json({ success: true, total: mapped.length, data: mapped });
  } catch (err: any) {
    handlePortalError(res, err);
  }
});

// Public Officer PIN Verification against Master_Guru_Pendamping (ZERO hardcoded demo PIN)
app.post('/api/public/verify-petugas-pin', async (req: Request, res: Response) => {
  try {
    const { petugas_id, nama_petugas, pin } = req.body || {};
    const enteredPin = String(pin || '').trim();

    if (!enteredPin || enteredPin.length < 4) {
      return res.status(400).json({ success: false, message: 'PIN Petugas 4 digit wajib diisi.' });
    }

    const { rows } = await fetchLiveSheetViaGas('Master_Guru_Pendamping');
    const teacher = rows.find((g: any) => {
      const id = pickField(g, 'ID', 'id');
      const nama = pickField(g, 'Nama_Lengkap', 'nama', 'Nama');
      return (
        (petugas_id && id === String(petugas_id).trim()) ||
        (nama_petugas && normalizeStr(nama) === normalizeStr(nama_petugas))
      );
    });

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Data petugas tidak ditemukan di sheet Master_Guru_Pendamping.',
      });
    }

    const explicitPin = pickField(teacher, 'PIN', 'pin', 'Pin');
    const nipDigits = pickField(teacher, 'NIP', 'nip').replace(/\D/g, '');
    const waDigits = pickField(teacher, 'Kontak_WA', 'kontakWA', 'kontakWa', 'No_HP').replace(/\D/g, '');

    const validPins: string[] = [];
    if (explicitPin) validPins.push(explicitPin);
    if (nipDigits.length >= 4) validPins.push(nipDigits.slice(-4));
    if (waDigits.length >= 4) validPins.push(waDigits.slice(-4));

    if (validPins.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          'Petugas belum memiliki kolom PIN, NIP, atau No. WA yang valid di Master_Guru_Pendamping untuk verifikasi.',
      });
    }

    if (!validPins.includes(enteredPin)) {
      return res.status(401).json({
        success: false,
        message: 'PIN Petugas tidak cocok. Gunakan PIN atau 4 digit terakhir NIP / No. WhatsApp terdaftar.',
      });
    }

    const resolvedName = pickField(teacher, 'Nama_Lengkap', 'nama', 'Nama');
    return res.json({
      success: true,
      message: `Identitas ${resolvedName} terverifikasi.`,
      sessionToken: `pin_auth_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      verifiedPetugas: {
        id: pickField(teacher, 'ID', 'id') || petugas_id,
        nama: resolvedName,
        nip: pickField(teacher, 'NIP', 'nip') || '-',
        verifiedAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    handlePortalError(res, err);
  }
});

// Assigned DUDIs for the verified officer derived directly from Plotting_Pemberangkatan + Data_Pengajuan_PKL + Master_DUDI
app.get('/api/public/petugas-dudi', async (req: Request, res: Response) => {
  try {
    const petugasNama = String(req.query.petugasNama || '').trim();
    const petugasId = String(req.query.petugasId || '').trim();

    if (!petugasNama && !petugasId) {
      return res.status(400).json({ success: false, message: 'Parameter petugasNama atau petugasId wajib diisi.' });
    }

    const { sheets } = await fetchBatchSheetsViaGas(
      ['Plotting_Pemberangkatan', 'Master_DUDI', 'Data_Pengajuan_PKL'],
      new Set(['Plotting_Pemberangkatan', 'Data_Pengajuan_PKL'])
    );
    const plottingRes = { rows: sheets['Plotting_Pemberangkatan'] || [] };
    const dudiRes = { rows: sheets['Master_DUDI'] || [] };
    const pengajuanRes = { rows: sheets['Data_Pengajuan_PKL'] || [] };

    const dudiMapById = new Map<string, any>();
    const dudiMapByName = new Map<string, any>();
    for (const d of dudiRes.rows) {
      const id = pickField(d, 'ID', 'id');
      const nama = pickField(d, 'Nama_DUDI', 'namaDudi', 'nama_dudi');
      if (id) dudiMapById.set(id, d);
      if (nama) dudiMapByName.set(normalizeStr(nama), d);
    }

    const grouped = new Map<string, { dudi: any; studentNisSet: Set<string> }>();
    const targetNamaNorm = normalizeStr(petugasNama);

    // 1. Check Plotting_Pemberangkatan
    for (const p of plottingRes.rows) {
      const statusPlt = normalizeStr(pickField(p, 'Status_Penempatan', 'statusPenempatan'));
      if (statusPlt === 'dibatalkan' || statusPlt === 'batal') continue;

      const rowGuruId = pickField(p, 'ID_Guru_Pendamping', 'idGuruPendamping');
      const rowGuruNama = normalizeStr(pickField(p, 'Guru_Pendamping', 'guruPendamping'));
      const isMatch =
        (petugasId && rowGuruId && rowGuruId === petugasId) ||
        (targetNamaNorm && rowGuruNama && (rowGuruNama === targetNamaNorm || rowGuruNama.includes(targetNamaNorm) || targetNamaNorm.includes(rowGuruNama)));

      if (!isMatch) continue;

      const dudiId = pickField(p, 'ID_DUDI', 'idDudi');
      const dudiNamaRaw = pickField(p, 'Nama_DUDI', 'namaDudi');
      const master = (dudiId && dudiMapById.get(dudiId)) || (dudiNamaRaw && dudiMapByName.get(normalizeStr(dudiNamaRaw)));

      const resolvedName = pickField(master || {}, 'Nama_DUDI', 'namaDudi') || dudiNamaRaw;
      if (!resolvedName) continue;

      const key = normalizeStr(resolvedName);
      if (!grouped.has(key)) {
        grouped.set(key, {
          dudi: {
            id: pickField(master || {}, 'ID', 'id') || dudiId || key,
            nama: resolvedName,
            alamat: pickField(master || {}, 'Alamat', 'alamat') || '-',
            bidang: pickField(master || {}, 'Bidang_Keahlian', 'bidangKeahlian') || '-',
            pic: pickField(master || {}, 'Nama_PIC', 'namaPic') || '-',
            kontak: pickField(master || {}, 'Kontak_PIC', 'kontakPic') || '-',
            kuota: Number(master?.Kuota_Maksimal ?? master?.kuotaMaksimal ?? 0),
          },
          studentNisSet: new Set<string>(),
        });
      }
      const nis = pickField(p, 'NIS', 'nis') || pickField(p, 'Nama_Siswa', 'namaSiswa');
      if (nis) grouped.get(key)!.studentNisSet.add(nis);
    }

    // 2. Also include scheduled Data_Pengajuan_PKL rows assigned to this Guru_Pendamping
    for (const reqRow of pengajuanRes.rows) {
      const statusHubin = normalizeStr(pickField(reqRow, 'Status_Hubin', 'statusHubin'));
      const statusKakomli = normalizeStr(pickField(reqRow, 'Status_Kakomli', 'statusKakomli'));
      if (statusHubin === 'batal' || statusKakomli === 'ditolak') continue;

      const rowGuruId = pickField(reqRow, 'ID_Guru_Pendamping', 'idGuruPendamping');
      const rowGuruNama = normalizeStr(pickField(reqRow, 'Guru_Pendamping', 'guruPendamping'));
      const isMatch =
        (petugasId && rowGuruId && rowGuruId === petugasId) ||
        (targetNamaNorm && rowGuruNama && (rowGuruNama === targetNamaNorm || rowGuruNama.includes(targetNamaNorm) || targetNamaNorm.includes(rowGuruNama)));
      if (!isMatch) continue;

      const dudiId = pickField(reqRow, 'ID_DUDI', 'idDudi');
      const dudiNamaRaw = pickField(reqRow, 'DUDI_Tujuan', 'dudiTujuan');
      if (!dudiNamaRaw) continue;
      const master = (dudiId && dudiMapById.get(dudiId)) || dudiMapByName.get(normalizeStr(dudiNamaRaw));
      const key = normalizeStr(dudiNamaRaw);

      if (!grouped.has(key)) {
        grouped.set(key, {
          dudi: {
            id: pickField(master || {}, 'ID', 'id') || dudiId || key,
            nama: pickField(master || {}, 'Nama_DUDI', 'namaDudi') || dudiNamaRaw,
            alamat: pickField(master || {}, 'Alamat', 'alamat') || pickField(reqRow, 'Alamat_DUDI', 'alamatDudi') || '-',
            bidang: pickField(master || {}, 'Bidang_Keahlian', 'bidangKeahlian') || pickField(reqRow, 'Bidang_Pekerjaan', 'bidangPekerjaan') || '-',
            pic: pickField(master || {}, 'Nama_PIC', 'namaPic') || '-',
            kontak: pickField(master || {}, 'Kontak_PIC', 'kontakPic') || '-',
            kuota: Number(master?.Kuota_Maksimal ?? master?.kuotaMaksimal ?? 0),
          },
          studentNisSet: new Set<string>(),
        });
      }
      const nis = pickField(reqRow, 'NIS', 'nis') || pickField(reqRow, 'Nama_Siswa', 'namaSiswa');
      if (nis) grouped.get(key)!.studentNisSet.add(nis);
    }

    const result = Array.from(grouped.values()).map((entry) => ({
      ...entry.dudi,
      jumlahSiswa: entry.studentNisSet.size,
    }));

    res.json({ success: true, total: result.length, data: result });
  } catch (err: any) {
    handlePortalError(res, err);
  }
});

// Placed students inside a selected DUDI from Plotting_Pemberangkatan + Data_Pengajuan_PKL + Master_Siswa_XI
// enriched with per-student 6-stage monitoring history & grade submission status.
app.get('/api/public/dudi-students', async (req: Request, res: Response) => {
  try {
    const dudiNama = String(req.query.dudiNama || '').trim();
    const dudiId = String(req.query.dudiId || '').trim();
    const petugasNama = String(req.query.petugasNama || '').trim();

    if (!dudiNama && !dudiId) {
      return res.status(400).json({ success: false, message: 'Parameter dudiNama atau dudiId wajib diisi.' });
    }

    const { sheets } = await fetchBatchSheetsViaGas(
      [
        'Plotting_Pemberangkatan',
        'Data_Pengajuan_PKL',
        'Master_Siswa_XI',
        'Monitoring_5_Tahap',
        'Nilai_Dan_Sertifikat',
      ],
      new Set([
        'Plotting_Pemberangkatan',
        'Data_Pengajuan_PKL',
        'Master_Siswa_XI',
        'Monitoring_5_Tahap',
        'Nilai_Dan_Sertifikat',
      ])
    );

    let siswaRows = sheets['Master_Siswa_XI'] || [];
    if (siswaRows.length === 0) {
      const fallbackSiswa = await fetchMasterSiswaRows().catch(() => ({ rows: [] as any[] }));
      siswaRows = fallbackSiswa.rows;
    }

    const plottingRes = { rows: sheets['Plotting_Pemberangkatan'] || [] };
    const pengajuanRes = { rows: sheets['Data_Pengajuan_PKL'] || [] };
    const siswaRes = { rows: siswaRows };
    const monitoringRes = { rows: sheets['Monitoring_5_Tahap'] || [] };
    const nilaiRes = { rows: sheets['Nilai_Dan_Sertifikat'] || [] };

    const siswaByNis = new Map<string, any>();
    for (const s of siswaRes.rows) {
      const nis = pickField(s, 'NIS', 'nis');
      if (nis) siswaByNis.set(nis, s);
    }

    const studentsMap = new Map<string, any>();
    const targetDudiNorm = normalizeStr(dudiNama);
    const targetPetugasNorm = normalizeStr(petugasNama);

    for (const p of plottingRes.rows) {
      const statusPlt = normalizeStr(pickField(p, 'Status_Penempatan', 'statusPenempatan'));
      if (statusPlt === 'dibatalkan' || statusPlt === 'batal') continue;

      const rowDudiId = pickField(p, 'ID_DUDI', 'idDudi');
      const rowDudiNama = normalizeStr(pickField(p, 'Nama_DUDI', 'namaDudi'));
      const dudiMatches =
        (dudiId && rowDudiId && rowDudiId === dudiId) ||
        (targetDudiNorm && rowDudiNama && (rowDudiNama === targetDudiNorm || rowDudiNama.includes(targetDudiNorm)));

      if (!dudiMatches) continue;

      if (targetPetugasNorm) {
        const rowGuru = normalizeStr(pickField(p, 'Guru_Pendamping', 'guruPendamping'));
        if (rowGuru && !rowGuru.includes(targetPetugasNorm) && !targetPetugasNorm.includes(rowGuru)) {
          continue;
        }
      }

      const nis = pickField(p, 'NIS', 'nis');
      const masterSiswa = nis ? siswaByNis.get(nis) : undefined;
      const nama = pickField(p, 'Nama_Siswa', 'namaSiswa') || pickField(masterSiswa || {}, 'Nama_Lengkap', 'nama');
      if (!nis && !nama) continue;

      const key = nis || normalizeStr(nama);
      studentsMap.set(key, {
        id: pickField(p, 'ID_Penempatan', 'idPenempatan', 'id') || key,
        idPenempatan: pickField(p, 'ID_Penempatan', 'idPenempatan', 'id') || '',
        nis: nis || '-',
        nama: nama || 'Siswa Prakerin',
        kelas: pickField(masterSiswa || {}, 'Kelas', 'kelas') || '-',
        jurusan: pickField(masterSiswa || {}, 'ID_Jurusan', 'jurusan', 'Jurusan') || '-',
        dudi_name: dudiNama || pickField(p, 'Nama_DUDI', 'namaDudi'),
      });
    }

    for (const reqRow of pengajuanRes.rows) {
      const statusHubin = normalizeStr(pickField(reqRow, 'Status_Hubin', 'statusHubin'));
      const statusKakomli = normalizeStr(pickField(reqRow, 'Status_Kakomli', 'statusKakomli'));
      if (statusHubin === 'batal' || statusKakomli === 'ditolak') continue;

      const rowDudiId = pickField(reqRow, 'ID_DUDI', 'idDudi');
      const rowDudiNama = normalizeStr(pickField(reqRow, 'DUDI_Tujuan', 'dudiTujuan'));
      const dudiMatches =
        (dudiId && rowDudiId && rowDudiId === dudiId) ||
        (targetDudiNorm && rowDudiNama && (rowDudiNama === targetDudiNorm || rowDudiNama.includes(targetDudiNorm)));
      if (!dudiMatches) continue;

      if (targetPetugasNorm) {
        const rowGuru = normalizeStr(pickField(reqRow, 'Guru_Pendamping', 'guruPendamping'));
        if (rowGuru && !rowGuru.includes(targetPetugasNorm) && !targetPetugasNorm.includes(rowGuru)) {
          continue;
        }
      }

      const nis = pickField(reqRow, 'NIS', 'nis');
      const masterSiswa = nis ? siswaByNis.get(nis) : undefined;
      const nama = pickField(reqRow, 'Nama_Siswa', 'namaSiswa') || pickField(masterSiswa || {}, 'Nama_Lengkap', 'nama');
      if (!nis && !nama) continue;

      const key = nis || normalizeStr(nama);
      if (!studentsMap.has(key)) {
        studentsMap.set(key, {
          id: pickField(reqRow, 'No_Pengajuan', 'noPengajuan', 'id') || key,
          idPenempatan: pickField(reqRow, 'No_Pengajuan', 'noPengajuan', 'id') || '',
          nis: nis || '-',
          nama: nama || 'Siswa Prakerin',
          kelas: pickField(reqRow, 'Kelas', 'kelas') || pickField(masterSiswa || {}, 'Kelas', 'kelas') || '-',
          jurusan: pickField(reqRow, 'Jurusan', 'jurusan') || pickField(masterSiswa || {}, 'ID_Jurusan', 'jurusan') || '-',
          dudi_name: dudiNama || pickField(reqRow, 'DUDI_Tujuan', 'dudiTujuan'),
        });
      }
    }

    const result = Array.from(studentsMap.values()).map((stu) => {
      const summary = buildStudentMonitoringSummary(stu, monitoringRes.rows, nilaiRes.rows);
      return {
        ...stu,
        ...summary,
      };
    });

    res.json({ success: true, total: result.length, data: result });
  } catch (err: any) {
    handlePortalError(res, err);
  }
});

// Public Monitoring (8 Stages: Pengantaran, Monitoring 1-6, Penarikan) Submission -> writes to Monitoring_5_Tahap & syncs Nilai_Dan_Sertifikat
app.post('/api/public/submit-monitoring', async (req: Request, res: Response) => {
  try {
    const payload = req.body || {};
    if (!payload.nis || !payload.nama_siswa || !payload.tahap_monitoring) {
      return res.status(400).json({
        success: false,
        message: 'NIS, Nama Siswa, dan Tahap Monitoring wajib diisi.',
      });
    }

    const existingMonId = String(payload.existing_monitoring_id || '').trim();
    const isUpdate = Boolean(existingMonId);
    const idMonitoring =
      existingMonId || `MON-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const tglVal = payload.tanggal || new Date().toISOString().split('T')[0];

    const sakit = Math.max(0, Math.round(Number(payload.sakit ?? 0) || 0));
    const izin = Math.max(0, Math.round(Number(payload.izin ?? 0) || 0));
    const alpha = Math.max(0, Math.round(Number(payload.alpha ?? 0) || 0));
    const nilaiMuncul = Boolean(payload.nilai_pkl_muncul);

    let k3lh = 0;
    let softskill = 0;
    let teknis = 0;
    let alurBisnis = 0;
    let avgScore = 0;
    let predikat = '';

    if (nilaiMuncul) {
      k3lh = Math.min(100, Math.max(0, Number(payload.nilai_k3lh ?? 0) || 0));
      softskill = Math.min(100, Math.max(0, Number(payload.nilai_softskill ?? 0) || 0));
      teknis = Math.min(100, Math.max(0, Number(payload.nilai_kompetensi_teknis ?? 0) || 0));
      alurBisnis = Math.min(100, Math.max(0, Number(payload.nilai_alur_bisnis ?? 0) || 0));
      avgScore = calculateEqualWeightedAverage(k3lh, softskill, teknis, alurBisnis);
      predikat = payload.predikat || getPredikatFromScore(avgScore);
    }

    const cleanNote = stripStructuredTagsFromNote(payload.catatan_perkembangan);
    const noteParts = [
      `[Absensi: S=${sakit}, I=${izin}, A=${alpha}]`,
      nilaiMuncul && avgScore > 0
        ? `[Nilai PKL: K3LH=${k3lh}, Softskill=${softskill}, Teknis=${teknis}, AlurBisnis=${alurBisnis} | Rata-rata=${avgScore} (${predikat})]`
        : '',
      cleanNote,
    ].filter(Boolean);

    const noteCombined = noteParts.join(' ');
    const stageStr = String(payload.tahap_monitoring);
    const stageNum = extractStageNumber(stageStr);

    const sheetRow: Record<string, any> = {
      id: idMonitoring,
      ID_Monitoring: idMonitoring,
      idMonitoring,
      ID_Penempatan: String(payload.id_penempatan || `PLT-${payload.nis}`),
      idPenempatan: String(payload.id_penempatan || `PLT-${payload.nis}`),
      ID_DUDI: String(payload.dudi_id || ''),
      idDudi: String(payload.dudi_id || ''),
      DUDI_Tujuan: String(payload.nama_dudi || ''),
      dudiTujuan: String(payload.nama_dudi || ''),
      Alamat_DUDI: String(payload.alamat_dudi || ''),
      alamatDudi: String(payload.alamat_dudi || ''),
      NIS: String(payload.nis || ''),
      nis: String(payload.nis || ''),
      Nama_Siswa: String(payload.nama_siswa || ''),
      namaSiswa: String(payload.nama_siswa || ''),
      Daftar_Siswa: `${payload.nama_siswa} (${payload.nis})`,
      daftarSiswa: `${payload.nama_siswa} (${payload.nis})`,
      Jurusan: String(payload.jurusan || ''),
      jurusan: String(payload.jurusan || ''),
      ID_Guru_Pendamping: String(payload.guru_id || ''),
      idGuruPendamping: String(payload.guru_id || ''),
      Guru_Pendamping: String(payload.guru_pembimbing || ''),
      guruPendamping: String(payload.guru_pembimbing || ''),
      Tahap: stageStr,
      tahap: stageStr,
      Tanggal_Kunjungan: tglVal,
      tanggalKunjungan: tglVal,
      Sakit: sakit,
      sakit,
      Izin: izin,
      izin,
      Alpha: alpha,
      alpha,
      Nilai_PKL_Muncul: nilaiMuncul ? 'Ya' : 'Belum',
      nilaiPklMuncul: nilaiMuncul,
      Nilai_K3LH: nilaiMuncul ? k3lh : '',
      nilaiK3lh: nilaiMuncul ? k3lh : '',
      Nilai_Softskills: nilaiMuncul ? softskill : '',
      Nilai_Softskill: nilaiMuncul ? softskill : '',
      nilaiSoftskill: nilaiMuncul ? softskill : '',
      Nilai_Hardskills: nilaiMuncul ? teknis : '',
      Nilai_Kompetensi_Teknis: nilaiMuncul ? teknis : '',
      nilaiKompetensiTeknis: nilaiMuncul ? teknis : '',
      Nilai_Alur_Bisnis_Dunia_Kerja: nilaiMuncul ? alurBisnis : '',
      Nilai_Alur_Bisnis: nilaiMuncul ? alurBisnis : '',
      nilaiAlurBisnis: nilaiMuncul ? alurBisnis : '',
      Nilai_rata_rata: nilaiMuncul ? avgScore : '',
      Nilai_Rata_Rata: nilaiMuncul ? avgScore : '',
      nilaiRataRata: nilaiMuncul ? avgScore : '',
      Catatan_Kunjungan: noteCombined,
      catatanKunjungan: noteCombined,
      Foto_Bukti_Drive: '',
      fotoBuktiUrl: '',
      Nilai_DUDI_Terkumpul: nilaiMuncul && avgScore > 0 ? 'Ya' : 'Belum',
      nilaiDudiTerkumpul: nilaiMuncul && avgScore > 0,
      Blangko_Sertifikat_Bawa: stageNum >= 5 ? 'Ya' : 'Belum',
      blangkoSertifikatBawa: stageNum >= 5,
      Status_Tahap: 'Terlaksana',
      statusTahap: 'Terlaksana',
    };

    await writeLiveSheetViaGas('Monitoring_5_Tahap', isUpdate ? 'UPDATE' : 'CREATE', sheetRow);

    let gradeSynced = false;
    if (nilaiMuncul && avgScore > 0) {
      try {
        const nilaiRes = await fetchLiveSheetViaGas('Nilai_Dan_Sertifikat', true).catch(() => ({ rows: [] as any[] }));
        const existingNilai = nilaiRes.rows.find((n: any) => {
          const rowNis = pickField(n, 'NIS', 'nis');
          const rowPlt = pickField(n, 'ID_Penempatan', 'idPenempatan');
          return (
            (payload.nis && rowNis === String(payload.nis).trim()) ||
            (payload.id_penempatan && rowPlt === String(payload.id_penempatan).trim())
          );
        });

        const roundedDudi = Math.round(avgScore * 10) / 10;
        const finalPredikat = getPredikatFromScore(roundedDudi);
        if (existingNilai) {
          await writeLiveSheetViaGas('Nilai_Dan_Sertifikat', 'UPDATE', {
            ...existingNilai,
            id: pickField(existingNilai, 'ID_Penempatan', 'idPenempatan', 'id'),
            ID_Penempatan:
              pickField(existingNilai, 'ID_Penempatan', 'idPenempatan') ||
              String(payload.id_penempatan || `PLT-${payload.nis}`),
            Nilai_K3LH: k3lh,
            nilaiK3lh: k3lh,
            Nilai_Softskills: softskill,
            Nilai_Softskill: softskill,
            nilaiSoftskill: softskill,
            Nilai_Hardskills: teknis,
            Nilai_Kompetensi_Teknis: teknis,
            nilaiKompetensiTeknis: teknis,
            Nilai_Alur_Bisnis_Dunia_Kerja: alurBisnis,
            Nilai_Alur_Bisnis: alurBisnis,
            nilaiAlurBisnis: alurBisnis,
            Nilai_rata_rata: roundedDudi,
            Nilai_Rata_Rata: roundedDudi,
            nilaiRataRata: roundedDudi,
            Nilai_DUDI: roundedDudi,
            nilaiDudi: roundedDudi,
            Predikat: finalPredikat,
            predikat: finalPredikat,
            Status_Raport: 'Siap Cetak',
            statusRaport: 'Siap Cetak',
          });
        } else {
          const idPlt = String(payload.id_penempatan || `PLT-${payload.nis}`);
          await writeLiveSheetViaGas('Nilai_Dan_Sertifikat', 'CREATE', {
            id: idPlt,
            ID_Penempatan: idPlt,
            idPenempatan: idPlt,
            NIS: String(payload.nis || ''),
            nis: String(payload.nis || ''),
            Nama_Siswa: String(payload.nama_siswa || ''),
            namaSiswa: String(payload.nama_siswa || ''),
            Jurusan: String(payload.jurusan || ''),
            jurusan: String(payload.jurusan || ''),
            Kelas: String(payload.kelas || '-'),
            kelas: String(payload.kelas || '-'),
            DUDI_Tujuan: String(payload.nama_dudi || ''),
            dudiTujuan: String(payload.nama_dudi || ''),
            Nilai_K3LH: k3lh,
            nilaiK3lh: k3lh,
            Nilai_Softskills: softskill,
            Nilai_Softskill: softskill,
            nilaiSoftskill: softskill,
            Nilai_Hardskills: teknis,
            Nilai_Kompetensi_Teknis: teknis,
            nilaiKompetensiTeknis: teknis,
            Nilai_Alur_Bisnis_Dunia_Kerja: alurBisnis,
            Nilai_Alur_Bisnis: alurBisnis,
            nilaiAlurBisnis: alurBisnis,
            Nilai_rata_rata: roundedDudi,
            Nilai_Rata_Rata: roundedDudi,
            nilaiRataRata: roundedDudi,
            Nilai_DUDI: roundedDudi,
            nilaiDudi: roundedDudi,
            Predikat: finalPredikat,
            predikat: finalPredikat,
            No_Seri_Blangko: '',
            noSeriBlangko: '',
            Status_Blangko: 'Tersedia',
            statusBlangko: 'Tersedia',
            Status_Raport: 'Siap Cetak',
            statusRaport: 'Siap Cetak',
            Tgl_Terbit: tglVal,
            tanggalTerbit: tglVal,
          });
        }
        gradeSynced = true;
      } catch (gradeErr) {
        console.warn('[submit-monitoring] Sync to Nilai_Dan_Sertifikat warning:', gradeErr);
      }
    }

    res.json({
      success: true,
      gradeSynced,
      message: `Data ${stageStr} berhasil ${isUpdate ? 'diperbarui' : 'disimpan'} ke Google Spreadsheet.`,
      monitoring: sheetRow,
    });
  } catch (err: any) {
    handlePortalError(res, err);
  }
});

// Edit / Update already submitted PKL grades in both Monitoring_5_Tahap & Nilai_Dan_Sertifikat
app.post('/api/public/update-grades', async (req: Request, res: Response) => {
  try {
    const payload = req.body || {};
    const nis = String(payload.nis || '').trim();
    const namaSiswa = String(payload.nama_siswa || '').trim();
    const idPenempatan = String(payload.id_penempatan || (nis ? `PLT-${nis}` : '')).trim();

    if (!nis || !namaSiswa) {
      return res.status(400).json({
        success: false,
        message: 'NIS dan Nama Siswa wajib diisi untuk mengubah nilai.',
      });
    }

    const k3lh = Math.min(100, Math.max(0, Number(payload.nilai_k3lh ?? 0) || 0));
    const softskill = Math.min(100, Math.max(0, Number(payload.nilai_softskill ?? 0) || 0));
    const teknis = Math.min(100, Math.max(0, Number(payload.nilai_kompetensi_teknis ?? 0) || 0));
    const alurBisnis = Math.min(100, Math.max(0, Number(payload.nilai_alur_bisnis ?? 0) || 0));
    const avgScore = calculateEqualWeightedAverage(k3lh, softskill, teknis, alurBisnis);
    const predikat = getPredikatFromScore(avgScore);
    const tglVal = String(payload.tanggal || new Date().toISOString().split('T')[0]);

    const monRes = await fetchLiveSheetViaGas('Monitoring_5_Tahap', true).catch(() => ({ rows: [] as any[] }));
    const targetMonId = String(payload.monitoring_id || '').trim();

    const matchedRows = monRes.rows.filter((r: any) => {
      const rMonId = pickField(r, 'ID_Monitoring', 'idMonitoring', 'id');
      const rNis = pickField(r, 'NIS', 'nis');
      const rPlt = pickField(r, 'ID_Penempatan', 'idPenempatan');
      if (targetMonId && rMonId === targetMonId) return true;
      if (nis && rNis === nis) return true;
      if (idPenempatan && rPlt === idPenempatan) return true;
      return false;
    });

    let targetRow =
      (targetMonId
        ? matchedRows.find((r: any) => pickField(r, 'ID_Monitoring', 'idMonitoring', 'id') === targetMonId)
        : undefined) ||
      [...matchedRows].reverse().find((r: any) => {
        const flag = normalizeStr(pickField(r, 'Nilai_DUDI_Terkumpul', 'nilaiDudiTerkumpul'));
        const avg = Number(r.Nilai_rata_rata ?? r.Nilai_Rata_Rata ?? r.nilaiRataRata ?? 0);
        return flag === 'ya' || flag === 'true' || avg > 0;
      }) ||
      matchedRows[matchedRows.length - 1];

    let resolvedMonId = targetMonId;
    let resolvedStage = String(payload.tahap_monitoring || getStageValueByNumber(5));

    if (targetRow) {
      resolvedMonId = pickField(targetRow, 'ID_Monitoring', 'idMonitoring', 'id');
      resolvedStage = pickField(targetRow, 'Tahap', 'tahap') || resolvedStage;
      const existingSakit = Math.max(0, Math.round(Number(targetRow.Sakit ?? targetRow.sakit ?? 0) || 0));
      const existingIzin = Math.max(0, Math.round(Number(targetRow.Izin ?? targetRow.izin ?? 0) || 0));
      const existingAlpha = Math.max(0, Math.round(Number(targetRow.Alpha ?? targetRow.alpha ?? 0) || 0));
      const cleanNote = stripStructuredTagsFromNote(
        targetRow.Catatan_Kunjungan ?? targetRow.catatanKunjungan ?? ''
      );
      const updatedNote = [
        `[Absensi: S=${existingSakit}, I=${existingIzin}, A=${existingAlpha}]`,
        `[Nilai PKL: K3LH=${k3lh}, Softskill=${softskill}, Teknis=${teknis}, AlurBisnis=${alurBisnis} | Rata-rata=${avgScore} (${predikat})]`,
        cleanNote,
      ]
        .filter(Boolean)
        .join(' ');

      await writeLiveSheetViaGas('Monitoring_5_Tahap', 'UPDATE', {
        ...targetRow,
        id: resolvedMonId,
        ID_Monitoring: resolvedMonId,
        idMonitoring: resolvedMonId,
        Nilai_PKL_Muncul: 'Ya',
        nilaiPklMuncul: true,
        Nilai_K3LH: k3lh,
        nilaiK3lh: k3lh,
        Nilai_Softskills: softskill,
        Nilai_Softskill: softskill,
        nilaiSoftskill: softskill,
        Nilai_Hardskills: teknis,
        Nilai_Kompetensi_Teknis: teknis,
        nilaiKompetensiTeknis: teknis,
        Nilai_Alur_Bisnis_Dunia_Kerja: alurBisnis,
        Nilai_Alur_Bisnis: alurBisnis,
        nilaiAlurBisnis: alurBisnis,
        Nilai_rata_rata: avgScore,
        Nilai_Rata_Rata: avgScore,
        nilaiRataRata: avgScore,
        Nilai_DUDI_Terkumpul: 'Ya',
        nilaiDudiTerkumpul: true,
        Catatan_Kunjungan: updatedNote,
        catatanKunjungan: updatedNote,
      });
    } else {
      resolvedMonId = `MON-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const stageNum = extractStageNumber(resolvedStage) || 5;
      const noteCombined = `[Absensi: S=0, I=0, A=0] [Nilai PKL: K3LH=${k3lh}, Softskill=${softskill}, Teknis=${teknis}, AlurBisnis=${alurBisnis} | Rata-rata=${avgScore} (${predikat})]`;
      await writeLiveSheetViaGas('Monitoring_5_Tahap', 'CREATE', {
        id: resolvedMonId,
        ID_Monitoring: resolvedMonId,
        idMonitoring: resolvedMonId,
        ID_Penempatan: idPenempatan,
        idPenempatan: idPenempatan,
        ID_DUDI: String(payload.dudi_id || ''),
        DUDI_Tujuan: String(payload.nama_dudi || ''),
        Alamat_DUDI: String(payload.alamat_dudi || ''),
        NIS: nis,
        Nama_Siswa: namaSiswa,
        Daftar_Siswa: `${namaSiswa} (${nis})`,
        Jurusan: String(payload.jurusan || ''),
        ID_Guru_Pendamping: String(payload.guru_id || ''),
        Guru_Pendamping: String(payload.guru_pembimbing || ''),
        Tahap: resolvedStage,
        Tanggal_Kunjungan: tglVal,
        Sakit: 0,
        Izin: 0,
        Alpha: 0,
        Nilai_PKL_Muncul: 'Ya',
        Nilai_K3LH: k3lh,
        Nilai_Softskills: softskill,
        Nilai_Softskill: softskill,
        Nilai_Hardskills: teknis,
        Nilai_Kompetensi_Teknis: teknis,
        Nilai_Alur_Bisnis_Dunia_Kerja: alurBisnis,
        Nilai_Alur_Bisnis: alurBisnis,
        Nilai_rata_rata: avgScore,
        Nilai_Rata_Rata: avgScore,
        Catatan_Kunjungan: noteCombined,
        Nilai_DUDI_Terkumpul: 'Ya',
        Blangko_Sertifikat_Bawa: stageNum >= 5 ? 'Ya' : 'Belum',
        Status_Tahap: 'Terlaksana',
      });
    }

    let nilaiSynced = false;
    try {
      const nilaiRes = await fetchLiveSheetViaGas('Nilai_Dan_Sertifikat', true).catch(() => ({ rows: [] as any[] }));
      const existingNilai = nilaiRes.rows.find((n: any) => {
        const rowNis = pickField(n, 'NIS', 'nis');
        const rowPlt = pickField(n, 'ID_Penempatan', 'idPenempatan');
        return (nis && rowNis === nis) || (idPenempatan && rowPlt === idPenempatan);
      });

      const roundedDudi = Math.round(avgScore * 10) / 10;
      const finalPredikat = getPredikatFromScore(roundedDudi);
      if (existingNilai) {
        const existingId = pickField(existingNilai, 'ID_Penempatan', 'idPenempatan', 'id') || idPenempatan;

        await writeLiveSheetViaGas('Nilai_Dan_Sertifikat', 'UPDATE', {
          ...existingNilai,
          id: existingId,
          ID_Penempatan: existingId,
          Nilai_K3LH: k3lh,
          nilaiK3lh: k3lh,
          Nilai_Softskills: softskill,
          Nilai_Softskill: softskill,
          nilaiSoftskill: softskill,
          Nilai_Hardskills: teknis,
          Nilai_Kompetensi_Teknis: teknis,
          nilaiKompetensiTeknis: teknis,
          Nilai_Alur_Bisnis_Dunia_Kerja: alurBisnis,
          Nilai_Alur_Bisnis: alurBisnis,
          nilaiAlurBisnis: alurBisnis,
          Nilai_rata_rata: roundedDudi,
          Nilai_Rata_Rata: roundedDudi,
          nilaiRataRata: roundedDudi,
          Nilai_DUDI: roundedDudi,
          nilaiDudi: roundedDudi,
          Predikat: finalPredikat,
          predikat: finalPredikat,
          Status_Raport: 'Siap Cetak',
          statusRaport: 'Siap Cetak',
        });
      } else {
        await writeLiveSheetViaGas('Nilai_Dan_Sertifikat', 'CREATE', {
          id: idPenempatan,
          ID_Penempatan: idPenempatan,
          idPenempatan,
          NIS: nis,
          nis,
          Nama_Siswa: namaSiswa,
          namaSiswa,
          Jurusan: String(payload.jurusan || ''),
          jurusan: String(payload.jurusan || ''),
          Kelas: String(payload.kelas || '-'),
          kelas: String(payload.kelas || '-'),
          DUDI_Tujuan: String(payload.nama_dudi || ''),
          dudiTujuan: String(payload.nama_dudi || ''),
          Nilai_K3LH: k3lh,
          nilaiK3lh: k3lh,
          Nilai_Softskills: softskill,
          Nilai_Softskill: softskill,
          nilaiSoftskill: softskill,
          Nilai_Hardskills: teknis,
          Nilai_Kompetensi_Teknis: teknis,
          nilaiKompetensiTeknis: teknis,
          Nilai_Alur_Bisnis_Dunia_Kerja: alurBisnis,
          Nilai_Alur_Bisnis: alurBisnis,
          nilaiAlurBisnis: alurBisnis,
          Nilai_rata_rata: roundedDudi,
          Nilai_Rata_Rata: roundedDudi,
          nilaiRataRata: roundedDudi,
          Nilai_DUDI: roundedDudi,
          nilaiDudi: roundedDudi,
          Predikat: finalPredikat,
          predikat: finalPredikat,
          No_Seri_Blangko: '',
          noSeriBlangko: '',
          Status_Blangko: 'Tersedia',
          statusBlangko: 'Tersedia',
          Status_Raport: 'Siap Cetak',
          statusRaport: 'Siap Cetak',
          Tgl_Terbit: tglVal,
          tanggalTerbit: tglVal,
        });
      }
      nilaiSynced = true;
    } catch (syncErr) {
      console.warn('[update-grades] Sync to Nilai_Dan_Sertifikat warning:', syncErr);
    }

    res.json({
      success: true,
      nilaiSynced,
      message: `Perubahan nilai PKL ${namaSiswa} (${avgScore}) berhasil disimpan ke Google Spreadsheet.`,
      gradeSummary: {
        monitoringId: resolvedMonId,
        k3lh,
        softskill,
        teknis,
        alurBisnis,
        rataRata: avgScore,
        predikat,
        tahapDiinput: resolvedStage,
        tanggal: tglVal,
      },
    });
  } catch (err: any) {
    handlePortalError(res, err);
  }
});

// Serve frontend with Vite dev middleware
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SI-HUBIN Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
