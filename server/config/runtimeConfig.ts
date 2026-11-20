import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  DEFAULT_MONITORING_STAGE_CONTROL,
  type MonitoringStageControl,
} from '../../src/core/types/schema';
import type { FirebaseAppletConfig, WorkspaceConfig } from '../types';
import { fetchWithTimeout } from '../utils/httpHelpers';

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
const CONFIG_CACHE_TTL_MS = 60_000;

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
    };
  }
  const requireSequential = typeof raw.requireSequential === 'boolean' ? raw.requireSequential : true;
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
  return {
    requireSequential,
    unlockedStages: deduped.slice(0, 8),
    lockedReason: String(raw.lockedReason ?? '').trim().slice(0, 150),
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
