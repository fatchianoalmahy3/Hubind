import { getDependentSheets } from '../../src/core/types/sheetBlueprint';
import { stripNisSymbols } from '../../src/core/utils/nisHelpers';
import { pickField } from '../../src/core/utils/rowFieldHelpers';
import {
  getFirestoreWorkspaceConfig,
  invalidateWorkspaceConfigCache,
} from '../config/runtimeConfig';
import type { WorkspaceConfig } from '../types';

export const SHEET_CACHE_SOFT_TTL_MS = 45_000;
export const SHEET_CACHE_STALE_MAX_MS = 600_000;
export const SHEET_CACHE_TTL_MS = SHEET_CACHE_SOFT_TTL_MS;
const BACKGROUND_REVALIDATION_LOCK_MAX_MS = 20_000;

export const sheetCache = new Map<string, { data: any[]; fetchedAt: number }>();
export const inFlightSheetFetches = new Map<
  string,
  Promise<{ rows: any[]; config: WorkspaceConfig }>
>();
export const inFlightBackgroundRevalidations = new Map<string, number>();
export const siswaIndexCache = new Map<
  string,
  { byKey: Map<string, any>; fetchedAt: number }
>();

const metadataCacheClearHooks: Array<() => void> = [];

export function registerMetadataCacheClearHook(hook: () => void): void {
  metadataCacheClearHooks.push(hook);
}

export function isBackgroundRevalidationActive(cacheKey: string): boolean {
  const startedAt = inFlightBackgroundRevalidations.get(cacheKey);
  if (!startedAt) return false;
  if (Date.now() - startedAt > BACKGROUND_REVALIDATION_LOCK_MAX_MS) {
    inFlightBackgroundRevalidations.delete(cacheKey);
    return false;
  }
  return true;
}

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
      for (const dep of getDependentSheets(sheetParam)) {
        invalidateSheetCacheEntry(cfg.spreadsheetId, dep);
      }
    } else {
      sheetCache.clear();
      siswaIndexCache.clear();
    }
    return;
  }
  invalidateWorkspaceConfigCache();
  sheetCache.clear();
  siswaIndexCache.clear();
  metadataCacheClearHooks.forEach((hook) => {
    try {
      hook();
    } catch {
      // ignore hook errors
    }
  });
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
