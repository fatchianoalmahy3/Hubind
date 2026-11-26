import { IndexedDbSheetCache } from '../cache/IndexedDbSheetCache';
import { getDependentSheets } from '../types/sheetBlueprint';

export interface SheetCacheEntry {
  data: any[];
  fetchedAt: number;
  etag?: string;
}

export class SheetSnapshotCache {
  public static readonly CLIENT_SHEET_CACHE_TTL_MS = 90_000;

  private clientSheetCache = new Map<string, SheetCacheEntry>();
  private bootstrapEtag: string | null = null;
  private sheetLocalMutationAt = new Map<string, number>();
  private cacheInvalidationListeners = new Set<(sheetName?: string) => void>();
  private bootstrapListeners = new Set<(tables: string[]) => void>();
  private broadcastChannel: BroadcastChannel | null = null;

  constructor(onBroadcastInvalidate?: (sheetName?: string) => void) {
    if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel('hubin_ssot_sync');
        this.broadcastChannel.onmessage = (ev) => {
          const sheetName = typeof ev?.data?.sheetName === 'string' ? ev.data.sheetName : undefined;
          if (onBroadcastInvalidate) {
            onBroadcastInvalidate(sheetName);
          }
        };
      } catch {
        this.broadcastChannel = null;
      }
    }
  }

  public getFreshMemoryEntry(spreadsheetId: string, sheetName: string): SheetCacheEntry | null {
    if (!spreadsheetId) return null;
    const cached = this.clientSheetCache.get(`${spreadsheetId}::${sheetName}`);
    if (cached && Date.now() - cached.fetchedAt < SheetSnapshotCache.CLIENT_SHEET_CACHE_TTL_MS) {
      return cached;
    }
    return null;
  }

  public deleteMemoryEntry(spreadsheetId: string, sheetName: string): void {
    if (!spreadsheetId) return;
    this.clientSheetCache.delete(`${spreadsheetId}::${sheetName}`);
  }

  public clearMemoryOnly(): void {
    this.clientSheetCache.clear();
  }

  public getBootstrapEtag(): string | null {
    return this.bootstrapEtag;
  }

  public setBootstrapEtag(etag: string | null): void {
    this.bootstrapEtag = etag;
  }

  public touchAllEtagTimestamps(spreadsheetId: string): void {
    const now = Date.now();
    for (const [k, entry] of this.clientSheetCache.entries()) {
      if (k.startsWith(`${spreadsheetId}::`)) {
        this.clientSheetCache.set(k, { ...entry, fetchedAt: now });
      }
    }
  }

  public onSheetCacheInvalidate(cb: (sheetName?: string) => void): () => void {
    this.cacheInvalidationListeners.add(cb);
    return () => {
      this.cacheInvalidationListeners.delete(cb);
    };
  }

  public onBootstrapUpdated(cb: (tables: string[]) => void): () => void {
    this.bootstrapListeners.add(cb);
    return () => {
      this.bootstrapListeners.delete(cb);
    };
  }

  public notifyBootstrapUpdated(tables: string[]): void {
    if (tables.length === 0) return;
    this.bootstrapListeners.forEach((cb) => {
      try {
        cb(tables);
      } catch {
        // ignore listener failure
      }
    });
  }

  public getCachedSnapshotSync(
    spreadsheetId: string,
    activeYear: string,
    sheetName: string
  ): { data: any[]; etag?: string; updatedAt: number } | null {
    if (!spreadsheetId) return null;
    const cacheKey = `${spreadsheetId}::${sheetName}`;
    const inMem = this.clientSheetCache.get(cacheKey);
    if (inMem) {
      return { data: inMem.data, etag: inMem.etag, updatedAt: inMem.fetchedAt };
    }
    const idbKey = IndexedDbSheetCache.buildKey(spreadsheetId, activeYear, sheetName);
    const fromSync = IndexedDbSheetCache.getInstance().getSync(idbKey);
    if (fromSync) {
      this.clientSheetCache.set(cacheKey, {
        data: fromSync.data,
        fetchedAt: fromSync.updatedAt,
        etag: fromSync.etag,
      });
      return { data: fromSync.data, etag: fromSync.etag, updatedAt: fromSync.updatedAt };
    }
    return null;
  }

  public async getCachedSnapshot(
    spreadsheetId: string,
    activeYear: string,
    sheetName: string
  ): Promise<{ data: any[]; etag?: string; updatedAt: number } | null> {
    if (!spreadsheetId) return null;
    const syncHit = this.getCachedSnapshotSync(spreadsheetId, activeYear, sheetName);
    if (syncHit) return syncHit;

    const cacheKey = `${spreadsheetId}::${sheetName}`;
    const idbKey = IndexedDbSheetCache.buildKey(spreadsheetId, activeYear, sheetName);
    const fromIdb = await IndexedDbSheetCache.getInstance().get(idbKey);
    if (fromIdb) {
      this.clientSheetCache.set(cacheKey, {
        data: fromIdb.data,
        fetchedAt: fromIdb.updatedAt,
        etag: fromIdb.etag,
      });
      return { data: fromIdb.data, etag: fromIdb.etag, updatedAt: fromIdb.updatedAt };
    }
    return null;
  }

  public async saveCachedSnapshot(
    spreadsheetId: string,
    activeYear: string,
    sheetName: string,
    rows: any[],
    etag?: string
  ): Promise<void> {
    if (!spreadsheetId) return;
    const cacheKey = `${spreadsheetId}::${sheetName}`;
    const now = Date.now();
    this.clientSheetCache.set(cacheKey, { data: rows, fetchedAt: now, etag });
    const idbKey = IndexedDbSheetCache.buildKey(spreadsheetId, activeYear, sheetName);
    await IndexedDbSheetCache.getInstance().set(idbKey, rows, etag).catch(() => {});
  }

  public markSheetMutated(spreadsheetId: string, activeYear: string, sheetName: string): void {
    const now = Date.now();
    this.sheetLocalMutationAt.set(sheetName, now);
    if (sheetName === 'Master_Siswa_XI' || sheetName === 'Master_Siswa') {
      this.sheetLocalMutationAt.set('Master_Siswa_XI', now);
      this.sheetLocalMutationAt.set('Master_Siswa', now);
    }
    if (
      sheetName === 'data_plotting' ||
      sheetName === 'Plotting_Pemberangkatan' ||
      sheetName === 'Nilai_Dan_Sertifikat'
    ) {
      this.sheetLocalMutationAt.set('data_plotting', now);
      this.sheetLocalMutationAt.set('Plotting_Pemberangkatan', now);
      this.sheetLocalMutationAt.set('Nilai_Dan_Sertifikat', now);
    }
    const deps = getDependentSheets(sheetName);
    for (const dep of deps) {
      this.sheetLocalMutationAt.set(dep, now);
      if (spreadsheetId) {
        this.clientSheetCache.delete(`${spreadsheetId}::${dep}`);
        IndexedDbSheetCache.getInstance()
          .delete(IndexedDbSheetCache.buildKey(spreadsheetId, activeYear, dep))
          .catch(() => {});
      }
      this.cacheInvalidationListeners.forEach((cb) => {
        try {
          cb(dep);
        } catch {
          // ignore
        }
      });
    }
    this.bootstrapEtag = null;
  }

  public getSheetLastMutatedAt(sheetName: string): number {
    return this.sheetLocalMutationAt.get(sheetName) || 0;
  }

  public invalidateClientSheetCache(
    spreadsheetId: string,
    activeYear: string,
    sheetName?: string,
    fromBroadcast: boolean = false
  ): void {
    const idb = IndexedDbSheetCache.getInstance();
    const affectedSheets: string[] = [];

    if (!sheetName) {
      this.clientSheetCache.clear();
      this.bootstrapEtag = null;
      idb.clearAll().catch(() => {});
    } else {
      const toClear = new Set<string>([sheetName, ...getDependentSheets(sheetName)]);
      if (sheetName === 'Master_Siswa_XI' || sheetName === 'Master_Siswa') {
        toClear.add('Master_Siswa_XI');
        toClear.add('Master_Siswa');
      }
      if (
        sheetName === 'data_plotting' ||
        sheetName === 'Plotting_Pemberangkatan' ||
        sheetName === 'Nilai_Dan_Sertifikat'
      ) {
        toClear.add('data_plotting');
        toClear.add('Plotting_Pemberangkatan');
        toClear.add('Nilai_Dan_Sertifikat');
      }
      this.bootstrapEtag = null;
      toClear.forEach((target) => {
        affectedSheets.push(target);
        if (spreadsheetId) {
          this.clientSheetCache.delete(`${spreadsheetId}::${target}`);
          idb.delete(IndexedDbSheetCache.buildKey(spreadsheetId, activeYear, target)).catch(() => {});
        }
      });
    }

    this.cacheInvalidationListeners.forEach((cb) => {
      try {
        if (affectedSheets.length === 0) {
          cb(undefined);
        } else {
          affectedSheets.forEach((target) => cb(target));
        }
      } catch {
        // ignore listener failure
      }
    });

    if (!fromBroadcast && this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({ sheetName: sheetName || null, ts: Date.now() });
      } catch {
        // ignore closed channel
      }
    }
  }
}
