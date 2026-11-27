import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  DEFAULT_MONITORING_STAGE_CONTROL,
  type MonitoringStageControl,
} from '../../src/core/types/schema';
import { PortalConfigError, type FirebaseAppletConfig, type WorkspaceConfig } from '../types';
import { fetchWithRetry } from '../utils/httpHelpers';

export const __dirnameResolved =
  typeof __dirname !== 'undefined'
    ? __dirname
    : import.meta?.url
    ? path.dirname(fileURLToPath(import.meta.url))
    : process.cwd();

export const isServerlessRuntime = Boolean(
  process.env.VERCEL ||
    process.env.VERCEL_ENV ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.NOW_REGION
);

export const BOOTSTRAP_ADMIN_EMAIL = 'fatchiano1@gmail.com';
const CONFIG_CACHE_TTL_MS = 20_000;

function loadFirebaseConfig(): FirebaseAppletConfig {
  const candidates = [
    path.join(__dirnameResolved, 'firebase-applet-config.json'),
    path.join(process.cwd(), 'firebase-applet-config.json'),
    path.resolve(__dirnameResolved, '../firebase-applet-config.json'),
    path.resolve(__dirnameResolved, '../../firebase-applet-config.json'),
  ];

  for (const cfgPath of candidates) {
    try {
      if (fs.existsSync(cfgPath)) {
        const raw = fs.readFileSync(cfgPath, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          projectId: String(parsed.projectId || ''),
          firestoreDatabaseId: String(parsed.firestoreDatabaseId || '(default)'),
          apiKey: String(parsed.apiKey || ''),
        };
      }
    } catch {
      // try next candidate
    }
  }

  return {
    projectId: String(process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || ''),
    firestoreDatabaseId: String(process.env.FIREBASE_DATABASE_ID || '(default)'),
    apiKey: String(process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || ''),
  };
}

export const firebaseCfg = loadFirebaseConfig();

export function normalizeServerGasUrl(rawUrl: string): string {
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

export function normalizeServerMonitoringStageControl(raw: any): MonitoringStageControl {
  if (!raw || typeof raw !== 'object') {
    return {
      requireSequential: DEFAULT_MONITORING_STAGE_CONTROL.requireSequential,
      unlockedStages: [...DEFAULT_MONITORING_STAGE_CONTROL.unlockedStages],
      lockedReason: '',
      requireIssuedLetter: DEFAULT_MONITORING_STAGE_CONTROL.requireIssuedLetter ?? true,
      requireStudentSignature: DEFAULT_MONITORING_STAGE_CONTROL.requireStudentSignature ?? false,
      gradeStage: DEFAULT_MONITORING_STAGE_CONTROL.gradeStage ?? 5,
      perJurusan: {},
    };
  }
  const requireSequential = typeof raw.requireSequential === 'boolean' ? raw.requireSequential : true;
  const requireIssuedLetter = typeof raw.requireIssuedLetter === 'boolean' ? raw.requireIssuedLetter : true;
  const requireStudentSignature =
    typeof raw.requireStudentSignature === 'boolean'
      ? raw.requireStudentSignature
      : DEFAULT_MONITORING_STAGE_CONTROL.requireStudentSignature ?? false;
  const rawList = Array.isArray(raw.unlockedStages)
    ? raw.unlockedStages
    : DEFAULT_MONITORING_STAGE_CONTROL.unlockedStages;
  const deduped = Array.from(
    new Set<number>(
      rawList
        .map((n: any) => Number(n))
        .filter((n: number) => Number.isInteger(n) && n >= 1 && n <= 8)
    )
  ).sort((a, b) => a - b);

  const rawGradeStage = Number(raw.gradeStage);
  const gradeStage =
    Number.isInteger(rawGradeStage) && rawGradeStage >= 2 && rawGradeStage <= 8
      ? rawGradeStage
      : 5;

  const perJurusan: Record<string, { enabledStages: number[]; gradeStage?: number }> = {};
  if (raw.perJurusan && typeof raw.perJurusan === 'object' && !Array.isArray(raw.perJurusan)) {
    for (const [rawKey, rawVal] of Object.entries(raw.perJurusan).slice(0, 30)) {
      const cleanKey = String(rawKey || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, '')
        .slice(0, 20);
      if (!cleanKey || !rawVal || typeof rawVal !== 'object') continue;
      const valObj = rawVal as Record<string, any>;
      const enabledRaw = Array.isArray(valObj.enabledStages)
        ? valObj.enabledStages
        : [1, 2, 3, 4, 5, 6, 7, 8];
      const enabledStages = Array.from(
        new Set<number>(
          enabledRaw
            .map((n: any) => Number(n))
            .filter((n: number) => Number.isInteger(n) && n >= 1 && n <= 8)
        )
      )
        .sort((a, b) => a - b)
        .slice(0, 8);
      if (enabledStages.length === 0) continue;
      const jurGradeRaw = Number(valObj.gradeStage);
      const hasValidJurGrade =
        Number.isInteger(jurGradeRaw) && jurGradeRaw >= 2 && jurGradeRaw <= 8;
      perJurusan[cleanKey] = hasValidJurGrade
        ? { enabledStages, gradeStage: jurGradeRaw }
        : { enabledStages };
    }
  }

  return {
    requireSequential,
    unlockedStages: deduped.slice(0, 8),
    lockedReason: String(raw.lockedReason ?? '').trim().slice(0, 150),
    requireIssuedLetter,
    requireStudentSignature,
    gradeStage,
    perJurusan,
  };
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

let cachedWorkspaceConfig: { config: WorkspaceConfig; fetchedAt: number } | null = null;
let inFlightConfigFetch: Promise<WorkspaceConfig> | null = null;

export function invalidateWorkspaceConfigCache(): void {
  cachedWorkspaceConfig = null;
}

export async function getFirestoreWorkspaceConfig(forceRefresh = false): Promise<WorkspaceConfig> {
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
      monitoringStageControl: normalizeServerMonitoringStageControl(undefined),
    };

    if (!firebaseCfg.projectId) {
      return emptyConfig;
    }

    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      firebaseCfg.projectId
    )}/databases/${encodeURIComponent(firebaseCfg.firestoreDatabaseId)}/documents/config/workspace`;

    let res: globalThis.Response;
    try {
      res = await fetchWithRetry(
        url,
        { headers: { Accept: 'application/json' } },
        { timeoutMs: 10_000, retries: 1, retryOnTimeout: true, baseDelayMs: 250 }
      );
    } catch (err: any) {
      if (cachedWorkspaceConfig) {
        console.warn('[Firestore Config] Network error, returning stale cached config:', err?.message);
        return cachedWorkspaceConfig.config;
      }
      if (err instanceof PortalConfigError) throw err;
      throw new PortalConfigError(
        'FIRESTORE_UNAVAILABLE',
        'Gagal menghubungi layanan konfigurasi Cloud Server. Silakan coba lagi beberapa saat.',
        503
      );
    }

    if (res.status === 404) {
      cachedWorkspaceConfig = { config: emptyConfig, fetchedAt: Date.now() };
      return emptyConfig;
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      const isTransient = res.status >= 500 || res.status === 429;
      if (isTransient && cachedWorkspaceConfig) {
        console.warn(
          `[Firestore Config] Transient HTTP ${res.status}, returning stale cached config.`
        );
        return cachedWorkspaceConfig.config;
      }
      console.warn(
        `[Firestore Config] Read failed (${res.status}): ${errText.slice(0, 160)}`
      );
      throw new PortalConfigError(
        isTransient ? 'FIRESTORE_UNAVAILABLE' : 'FIRESTORE_CONFIG_ERROR',
        isTransient
          ? 'Layanan konfigurasi Firestore sedang mengalami gangguan sementara. Silakan coba lagi beberapa saat.'
          : `Gagal membaca konfigurasi workspace Cloud Server (HTTP ${res.status}).`,
        isTransient ? 503 : 502
      );
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
      monitoringStageControl: normalizeServerMonitoringStageControl(decoded.monitoringStageControl),
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
