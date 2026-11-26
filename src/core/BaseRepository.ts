import { ModuleMetadata, QueryResult, FilterState, SortState } from './types/metadata';
import { GoogleSheetClient } from './GoogleSheetClient';
import { GoogleDriveSheetService } from './GoogleDriveSheetService';
import {
  generateJurusanCode,
  generateNextSequentialId,
} from './utils/autoIdHelpers';
import { stripNisSymbols } from './utils/nisHelpers';
import { enrichBatchWithRelations, enrichRecordWithRelations } from './utils/relationJoinHelper';

export interface MutationOptions {
  silentToast?: boolean;
  onProgress?: (done: number, total: number) => void;
}

export abstract class BaseRepository<T extends { id: string }> {
  protected tableName: string;
  protected metadata: ModuleMetadata<T>;
  protected memoryData: T[] = [];
  protected loadedSpreadsheetId: string = '';
  protected initPromise: Promise<void> | null = null;
  protected isInitialized: boolean = false;
  protected lastError: string | null = null;
  protected lastFetchedAt: number = 0;
  protected lastLocalMutationAt: number = 0;
  private isCommittingSelf: boolean = false;
  private isRevalidating: boolean = false;
  private revalidatingPromise: Promise<void> | null = null;
  private dataUpdateListeners = new Set<(meta?: { revalidatingOnly?: boolean }) => void>();
  private searchIndexCache = new WeakMap<object, { text: string; nisDigits: string }>();
  private static readonly REVALIDATE_TTL_MS = 30_000;
  private static repoInstances = new Set<BaseRepository<any>>();

  constructor(tableName: string, metadata: ModuleMetadata<T>, _initialData: T[] = []) {
    this.tableName = tableName;
    this.metadata = metadata;
    this.memoryData = [];
    BaseRepository.repoInstances.add(this);

    const client = GoogleSheetClient.getInstance();

    // Try immediate synchronous hydration if cache is already warm
    this.tryHydrateSync();

    // Automatically invalidate RAM cache whenever active Spreadsheet / GAS / Year changes
    client.addChangeListener(() => {
      const activeId = client.getSpreadsheetId();
      if (activeId !== this.loadedSpreadsheetId) {
        this.memoryData = [];
        this.isInitialized = false;
        this.initPromise = null;
        this.lastFetchedAt = 0;
        this.tryHydrateSync();
      }
    });

    // Hydrate immediately when background bootstrap completes
    client.onBootstrapUpdated((tables) => {
      if (this.isCommittingSelf) return;
      const matches = tables.some(
        (t) =>
          t === this.tableName ||
          ((this.tableName === 'Master_Siswa_XI' || this.tableName === 'Master_Siswa') &&
            (t === 'Master_Siswa_XI' || t === 'Master_Siswa'))
      );
      const activeId = client.getSpreadsheetId();
      if (matches) {
        const snapshot = client.getCachedSnapshotSync(this.tableName);
        if (activeId && snapshot && Array.isArray(snapshot.data)) {
          const snapshotTs = snapshot.updatedAt || 0;
          if (this.lastLocalMutationAt > 0 && snapshotTs <= this.lastLocalMutationAt) {
            return;
          }
          this.memoryData = this.enrichLoadedRows(snapshot.data as T[]);
          this.loadedSpreadsheetId = activeId;
          this.lastFetchedAt = snapshotTs || Date.now();
          this.isInitialized = true;
          this.lastError = null;
          this.notifyDataUpdated();
          return;
        }
      }

      // Re-enrich dependent memory rows when a Master lookup table finishes bootstrapping
      const hasMasterUpdate = tables.some((t) =>
        [
          'Master_Siswa_XI',
          'Master_Siswa',
          'Master_Jurusan',
          'Master_DUDI',
          'Master_Guru_Pendamping',
          'data_plotting',
          'Plotting_Pemberangkatan',
        ].includes(t)
      );
      if (hasMasterUpdate && this.isInitialized && this.memoryData.length > 0) {
        this.memoryData = this.enrichLoadedRows(this.memoryData);
        this.notifyDataUpdated({ revalidatingOnly: true });
      }
    });

    // Invalidate RAM cache when external portals / another tab / Master table writes
    client.onSheetCacheInvalidate((sheetName) => {
      if (this.isCommittingSelf) return;
      const matchesThis =
        !sheetName ||
        sheetName === this.tableName ||
        ((this.tableName === 'Master_Siswa_XI' || this.tableName === 'Master_Siswa') &&
          (sheetName === 'Master_Siswa_XI' || sheetName === 'Master_Siswa'));
      if (matchesThis) {
        this.isInitialized = false;
        this.lastFetchedAt = 0;
        if (this.memoryData.length > 0) {
          this.memoryData = this.enrichLoadedRows(this.memoryData);
        }
      }
    });
  }

  public onDataUpdated(cb: (meta?: { revalidatingOnly?: boolean }) => void): () => void {
    this.dataUpdateListeners.add(cb);
    return () => {
      this.dataUpdateListeners.delete(cb);
    };
  }

  private notifyDataUpdated(meta?: { revalidatingOnly?: boolean }): void {
    this.dataUpdateListeners.forEach((cb) => {
      try {
        cb(meta);
      } catch {
        // ignore subscriber errors
      }
    });
  }

  private syncSiblingRepositories(meta?: { revalidatingOnly?: boolean }): void {
    for (const sibling of BaseRepository.repoInstances) {
      if (sibling === this) continue;
      if (sibling.tableName !== this.tableName) continue;
      sibling.memoryData = sibling.enrichLoadedRows(this.memoryData as any[]);
      sibling.loadedSpreadsheetId = this.loadedSpreadsheetId;
      sibling.lastFetchedAt = this.lastFetchedAt;
      sibling.lastLocalMutationAt = this.lastLocalMutationAt;
      sibling.isInitialized = this.isInitialized;
      sibling.lastError = null;
      sibling.notifyDataUpdated(meta);
    }
  }

  private getPlacementSnapshotData(): Array<Record<string, any>> | undefined {
    const client = GoogleSheetClient.getInstance();
    return (
      client.getCachedSnapshotSync('data_plotting')?.data ||
      client.getCachedSnapshotSync('Plotting_Pemberangkatan')?.data
    );
  }

  protected enrichOptimisticRecord(record: T): T {
    const client = GoogleSheetClient.getInstance();
    return enrichRecordWithRelations(this.tableName, record as Record<string, any>, {
      siswaRows: client.getCachedSnapshotSync('Master_Siswa_XI')?.data,
      jurusanRows: client.getCachedSnapshotSync('Master_Jurusan')?.data,
      dudiRows: client.getCachedSnapshotSync('Master_DUDI')?.data,
      guruRows: client.getCachedSnapshotSync('Master_Guru_Pendamping')?.data,
      placementRows: this.getPlacementSnapshotData(),
    }) as T;
  }

  protected enrichLoadedRows(rows: T[]): T[] {
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const client = GoogleSheetClient.getInstance();
    const maps = {
      siswaRows: client.getCachedSnapshotSync('Master_Siswa_XI')?.data,
      jurusanRows: client.getCachedSnapshotSync('Master_Jurusan')?.data,
      dudiRows: client.getCachedSnapshotSync('Master_DUDI')?.data,
      guruRows: client.getCachedSnapshotSync('Master_Guru_Pendamping')?.data,
      placementRows: this.getPlacementSnapshotData(),
    };
    return enrichBatchWithRelations(this.tableName, rows as Record<string, any>[], maps) as T[];
  }

  public hasHydratedData(): boolean {
    return this.isInitialized && this.memoryData.length > 0;
  }

  public getIsRevalidating(): boolean {
    return this.isRevalidating;
  }

  public getLastError(): string | null {
    return this.lastError;
  }

  public tryHydrateSync(): boolean {
    const client = GoogleSheetClient.getInstance();
    const activeId = client.getSpreadsheetId();
    if (!activeId) return false;
    if (this.isInitialized && activeId === this.loadedSpreadsheetId && this.memoryData.length > 0) {
      return true;
    }
    const snapshot = client.getCachedSnapshotSync(this.tableName);
    if (snapshot && Array.isArray(snapshot.data)) {
      this.memoryData = this.enrichLoadedRows(snapshot.data as T[]);
      this.loadedSpreadsheetId = activeId;
      this.lastFetchedAt = snapshot.updatedAt || 0;
      this.isInitialized = true;
      this.lastError = null;
      return true;
    }
    return false;
  }

  public async ensureInitialized(): Promise<void> {
    const client = GoogleSheetClient.getInstance();
    if (!client.getConfig().isFirestoreHydrated && !client.getSpreadsheetId()) {
      await client.initFromFirestore();
    } else if (!client.getConfig().isFirestoreHydrated) {
      client.initFromFirestore().catch(() => {});
    }

    const activeId = client.getSpreadsheetId();
    if (activeId && (!this.isInitialized || activeId !== this.loadedSpreadsheetId || this.memoryData.length === 0)) {
      this.tryHydrateSync();
    }

    const isSameSheet = activeId !== '' && activeId === this.loadedSpreadsheetId;
    const isFresh =
      this.isInitialized &&
      isSameSheet &&
      Date.now() - this.lastFetchedAt <= BaseRepository.REVALIDATE_TTL_MS;

    if (isFresh) {
      return;
    }

    // SWR Step 1: Hydrate instantaneously from RAM / IndexedDB snapshot if available (<10ms)
    if (activeId && (!this.isInitialized || !isSameSheet || this.memoryData.length === 0)) {
      const snapshot = await client.getCachedSnapshot(this.tableName);
      if (snapshot && Array.isArray(snapshot.data)) {
        this.memoryData = this.enrichLoadedRows(snapshot.data as T[]);
        this.loadedSpreadsheetId = activeId;
        this.lastFetchedAt = snapshot.updatedAt || 0;
        this.isInitialized = true;
        this.lastError = null;
      }
    }

    // If we already have hydrated data for the active spreadsheet, return immediately & revalidate in background!
    if (this.isInitialized && activeId && activeId === this.loadedSpreadsheetId) {
      if (
        !this.isRevalidating &&
        Date.now() - this.lastFetchedAt > BaseRepository.REVALIDATE_TTL_MS
      ) {
        this.revalidateInBackground();
      }
      return;
    }

    if (!this.initPromise) {
      this.initPromise = this.initData(false);
    }
    await this.initPromise;
  }

  private revalidateInBackground(): void {
    if (this.isRevalidating || this.revalidatingPromise || this.isCommittingSelf) return;
    const client = GoogleSheetClient.getInstance();
    const activeId = client.getSpreadsheetId();
    if (!activeId) return;

    this.isRevalidating = true;
    let hasNewData = false;
    const revalidationStartedAt = Date.now();

    this.revalidatingPromise = (async () => {
      try {
        const res = await client.fetchSheetData(this.tableName, false);
        if (this.isCommittingSelf || this.lastLocalMutationAt >= revalidationStartedAt) return;
        if (res.fromSpreadsheet && Array.isArray(res.data)) {
          this.loadedSpreadsheetId = activeId;
          this.lastFetchedAt = Date.now();
          this.lastError = null;
          if (!res.notModified) {
            this.memoryData = this.enrichLoadedRows(res.data as T[]);
            hasNewData = true;
          }
        }
      } catch {
        // Silent background revalidation error — keep showing cached SWR data
      } finally {
        this.isRevalidating = false;
        this.revalidatingPromise = null;
        this.notifyDataUpdated({ revalidatingOnly: !hasNewData });
      }
    })();

    this.notifyDataUpdated({ revalidatingOnly: true });
  }

  private async initData(forceFresh: boolean = false): Promise<void> {
    this.lastError = null;
    const client = GoogleSheetClient.getInstance();
    if (!client.getConfig().isFirestoreHydrated) {
      await client.initFromFirestore();
    }
    const activeId = client.getSpreadsheetId();

    try {
      if (!activeId) {
        this.memoryData = [];
        this.loadedSpreadsheetId = '';
        this.lastFetchedAt = 0;
        this.lastError = 'Koneksi Cloud Server belum dikonfigurasi.';
        return;
      }

      const res = await client.fetchSheetData(this.tableName, forceFresh);
      if (res.fromSpreadsheet) {
        this.memoryData = Array.isArray(res.data)
          ? this.enrichLoadedRows(res.data as T[])
          : [];
        this.loadedSpreadsheetId = activeId;
        this.lastFetchedAt = Date.now();
      } else {
        this.memoryData = [];
        this.loadedSpreadsheetId = '';
        this.lastFetchedAt = 0;
        this.lastError = res.error || 'Belum terhubung ke Cloud Server.';
      }
    } catch (err: any) {
      this.memoryData = [];
      this.loadedSpreadsheetId = '';
      this.lastFetchedAt = 0;
      this.lastError = err?.message || 'Gagal memuat data dari Cloud Server.';
    } finally {
      this.isInitialized = true;
      this.initPromise = null;
    }
  }

  public async reloadFromSpreadsheet(): Promise<void> {
    this.isInitialized = false;
    this.lastFetchedAt = 0;
    this.initPromise = this.initData(true);
    await this.initPromise;
  }

  public getTableFields(): string[] {
    return this.metadata.fields
      .filter((f) => f.isTableColumn)
      .map((f) => String(f.key));
  }

  public async getAll(): Promise<T[]> {
    await this.ensureInitialized();
    return [...this.memoryData];
  }

  public async getById(id: string): Promise<T | null> {
    await this.ensureInitialized();
    const item = this.memoryData.find((row) => row.id === id);
    return item ? { ...item } : null;
  }

  public async create(
    data: Omit<T, 'id'> & { id?: string },
    options?: MutationOptions
  ): Promise<T> {
    await this.ensureInitialized();
    const rawData: Record<string, any> = { ...(data as Record<string, any>) };

    let resolvedId = String(rawData.id || '').trim();
    if (!resolvedId) {
      resolvedId =
        String(rawData.noPerizinan || '').trim() ||
        String(rawData.noPengajuan || '').trim() ||
        String(rawData.idPenempatan || '').trim() ||
        generateNextSequentialId(this.tableName, this.memoryData as any);
    }
    rawData.id = resolvedId;

    if (this.tableName === 'Master_Jurusan' && !String(rawData.kode || '').trim() && rawData.nama) {
      rawData.kode = generateJurusanCode(String(rawData.nama));
    }
    if (this.tableName === 'Data_Pengajuan_PKL' && !String(rawData.noPengajuan || '').trim()) {
      rawData.noPengajuan = resolvedId;
    }
    if (this.tableName === 'Data_Perizinan_PKL') {
      if (!String(rawData.noPerizinan || '').trim()) {
        rawData.noPerizinan = resolvedId;
      }
    }
    if (
      (this.tableName === 'data_plotting' || this.tableName === 'Plotting_Pemberangkatan') &&
      !String(rawData.idPenempatan || '').trim()
    ) {
      rawData.idPenempatan = resolvedId;
    }

    const normalizer = GoogleDriveSheetService.getInstance();
    const prepared = this.enrichOptimisticRecord(
      normalizer.prepareOutgoingRecord(
        this.tableName,
        rawData,
        Object.keys(rawData)
      ) as T
    );

    const client = GoogleSheetClient.getInstance();
    const previousMemory = [...this.memoryData];
    const now = Date.now();

    // Optimistic UI update (<16ms)
    this.memoryData = [prepared, ...this.memoryData];
    this.lastFetchedAt = now;
    this.lastLocalMutationAt = now;
    client.saveCachedSnapshot(this.tableName, this.memoryData).catch(() => {});
    client.markSheetMutated(this.tableName);
    this.notifyDataUpdated();

    this.isCommittingSelf = true;
    try {
      const commitRes = await client.commitToSpreadsheet(
        this.tableName,
        'CREATE',
        prepared,
        options
      );
      if (!commitRes.success) {
        throw new Error(commitRes.error || 'Gagal menyimpan data baru ke Cloud Server.');
      }
      if (commitRes.sheetRowNumber && commitRes.sheetRowNumber >= 2) {
        (prepared as any)._sheetRowNumber = commitRes.sheetRowNumber;
        this.memoryData = this.memoryData.map((r) =>
          r.id === prepared.id ? ({ ...r, _sheetRowNumber: commitRes.sheetRowNumber } as T) : r
        );
      }
      const committedAt = Date.now();
      this.lastFetchedAt = committedAt;
      this.lastLocalMutationAt = committedAt;
      await client.saveCachedSnapshot(this.tableName, this.memoryData).catch(() => {});
      this.syncSiblingRepositories();
    } catch (err) {
      // Rollback optimistic change on failure
      this.memoryData = previousMemory;
      await client.saveCachedSnapshot(this.tableName, previousMemory).catch(() => {});
      this.notifyDataUpdated();
      this.syncSiblingRepositories();
      throw err;
    } finally {
      this.isCommittingSelf = false;
    }

    return { ...prepared };
  }

  public async update(
    id: string,
    updates: Partial<T>,
    options?: MutationOptions
  ): Promise<T | null> {
    await this.ensureInitialized();
    const index = this.memoryData.findIndex((row) => row.id === id);
    if (index === -1) return null;

    const normalizer = GoogleDriveSheetService.getInstance();
    const candidate = this.enrichOptimisticRecord(
      normalizer.applyUpdatesAndPrepareRecord(
        this.tableName,
        this.memoryData[index] as Record<string, any>,
        updates as Record<string, any>
      ) as T
    );

    const client = GoogleSheetClient.getInstance();
    const previousMemory = [...this.memoryData];
    const now = Date.now();

    // Optimistic UI update (<16ms)
    const nextMemory = [...this.memoryData];
    nextMemory[index] = candidate;
    this.memoryData = nextMemory;
    this.lastFetchedAt = now;
    this.lastLocalMutationAt = now;
    client.saveCachedSnapshot(this.tableName, this.memoryData).catch(() => {});
    client.markSheetMutated(this.tableName);
    this.notifyDataUpdated();

    this.isCommittingSelf = true;
    try {
      const commitRes = await client.commitToSpreadsheet(
        this.tableName,
        'UPDATE',
        candidate,
        options
      );
      if (!commitRes.success) {
        throw new Error(commitRes.error || 'Gagal memperbarui data di Cloud Server.');
      }
      if (commitRes.sheetRowNumber && commitRes.sheetRowNumber >= 2) {
        (candidate as any)._sheetRowNumber = commitRes.sheetRowNumber;
        this.memoryData = this.memoryData.map((r) =>
          r.id === candidate.id ? ({ ...r, _sheetRowNumber: commitRes.sheetRowNumber } as T) : r
        );
      }
      const committedAt = Date.now();
      this.lastFetchedAt = committedAt;
      this.lastLocalMutationAt = committedAt;
      await client.saveCachedSnapshot(this.tableName, this.memoryData).catch(() => {});
      this.syncSiblingRepositories();
    } catch (err) {
      // Rollback optimistic change on failure
      this.memoryData = previousMemory;
      await client.saveCachedSnapshot(this.tableName, previousMemory).catch(() => {});
      this.notifyDataUpdated();
      this.syncSiblingRepositories();
      throw err;
    } finally {
      this.isCommittingSelf = false;
    }

    return { ...candidate };
  }

  public async delete(id: string, options?: MutationOptions): Promise<boolean> {
    await this.ensureInitialized();
    const target = this.memoryData.find((r) => r.id === id);
    if (!target) return false;

    const { cleanId } = GoogleDriveSheetService.stripSyntheticRowSuffix(id);
    const client = GoogleSheetClient.getInstance();
    const previousMemory = [...this.memoryData];
    const now = Date.now();

    // Optimistic UI update (<16ms)
    this.memoryData = this.memoryData.filter((row) => row.id !== id);
    this.lastFetchedAt = now;
    this.lastLocalMutationAt = now;
    client.saveCachedSnapshot(this.tableName, this.memoryData).catch(() => {});
    client.markSheetMutated(this.tableName);
    this.notifyDataUpdated();

    this.isCommittingSelf = true;
    try {
      const commitRes = await client.commitToSpreadsheet(
        this.tableName,
        'DELETE',
        { id: cleanId || id, rawId: id, deletedRow: target },
        options
      );
      if (!commitRes.success) {
        throw new Error(commitRes.error || 'Gagal menghapus data dari Cloud Server.');
      }
      const committedAt = Date.now();
      this.lastFetchedAt = committedAt;
      this.lastLocalMutationAt = committedAt;
      await client.saveCachedSnapshot(this.tableName, this.memoryData).catch(() => {});
      this.syncSiblingRepositories();
    } catch (err) {
      // Rollback optimistic change on failure
      this.memoryData = previousMemory;
      await client.saveCachedSnapshot(this.tableName, previousMemory).catch(() => {});
      this.notifyDataUpdated();
      this.syncSiblingRepositories();
      throw err;
    } finally {
      this.isCommittingSelf = false;
    }

    return true;
  }

  public async bulkDelete(ids: string[], options?: MutationOptions): Promise<number> {
    await this.ensureInitialized();
    const idSet = new Set(ids);
    const matching = this.memoryData.filter((row) => idSet.has(row.id));
    if (matching.length === 0) return 0;

    const client = GoogleSheetClient.getInstance();
    const previousMemory = [...this.memoryData];
    const now = Date.now();

    // Optimistic UI update (<16ms)
    this.memoryData = this.memoryData.filter((row) => !idSet.has(row.id));
    this.lastFetchedAt = now;
    this.lastLocalMutationAt = now;
    client.markSheetMutated(this.tableName);
    client.saveCachedSnapshot(this.tableName, this.memoryData).catch(() => {});
    this.notifyDataUpdated();

    this.isCommittingSelf = true;
    try {
      const commitRes = await client.commitToSpreadsheet(
        this.tableName,
        'BULK_DELETE',
        {
          ids: matching.map((m) => GoogleDriveSheetService.stripSyntheticRowSuffix(m.id).cleanId || m.id),
          deletedRows: matching,
        },
        options
      );
      if (!commitRes.success) {
        throw new Error(commitRes.error || 'Gagal menghapus baris terpilih dari Cloud Server.');
      }
      const committedAt = Date.now();
      this.lastFetchedAt = committedAt;
      this.lastLocalMutationAt = committedAt;
      await client.saveCachedSnapshot(this.tableName, this.memoryData).catch(() => {});
      this.syncSiblingRepositories();
    } catch (err) {
      this.memoryData = previousMemory;
      await client.saveCachedSnapshot(this.tableName, previousMemory).catch(() => {});
      this.notifyDataUpdated();
      this.syncSiblingRepositories();
      throw err;
    } finally {
      this.isCommittingSelf = false;
    }

    return matching.length;
  }

  public async bulkUpdateMany(
    patches: Array<{ id: string; updates: Partial<T> }>,
    options?: MutationOptions
  ): Promise<number> {
    await this.ensureInitialized();
    const patchMap = new Map<string, Partial<T>>();
    for (const p of patches) {
      if (p?.id) patchMap.set(p.id, p.updates || {});
    }
    if (patchMap.size === 0) return 0;

    const normalizer = GoogleDriveSheetService.getInstance();
    const updatedRows: T[] = [];
    const nextMemory = this.memoryData.map((row) => {
      const updates = patchMap.get(row.id);
      if (updates) {
        const updated = this.enrichOptimisticRecord(
          normalizer.applyUpdatesAndPrepareRecord(
            this.tableName,
            row as Record<string, any>,
            updates as Record<string, any>
          ) as T
        );
        updatedRows.push(updated);
        return updated;
      }
      return row;
    });

    if (updatedRows.length === 0) return 0;

    const client = GoogleSheetClient.getInstance();
    const previousMemory = [...this.memoryData];
    const now = Date.now();

    // Optimistic UI update (<16ms)
    this.memoryData = nextMemory;
    this.lastFetchedAt = now;
    this.lastLocalMutationAt = now;
    client.saveCachedSnapshot(this.tableName, this.memoryData).catch(() => {});
    client.markSheetMutated(this.tableName);
    this.notifyDataUpdated();

    this.isCommittingSelf = true;
    try {
      const commitRes = await client.commitToSpreadsheet(
        this.tableName,
        'BULK_UPDATE',
        { ids: Array.from(patchMap.keys()), updatedRows },
        options
      );
      if (!commitRes.success) {
        throw new Error(commitRes.error || 'Gagal memperbarui baris terpilih di Cloud Server.');
      }
      const committedAt = Date.now();
      this.lastFetchedAt = committedAt;
      this.lastLocalMutationAt = committedAt;
      await client.saveCachedSnapshot(this.tableName, this.memoryData).catch(() => {});
      this.syncSiblingRepositories();
    } catch (err) {
      this.memoryData = previousMemory;
      await client.saveCachedSnapshot(this.tableName, previousMemory).catch(() => {});
      this.notifyDataUpdated();
      this.syncSiblingRepositories();
      throw err;
    } finally {
      this.isCommittingSelf = false;
    }

    return updatedRows.length;
  }

  public async bulkUpdate(
    ids: string[],
    updates: Partial<T>,
    options?: MutationOptions
  ): Promise<number> {
    return this.bulkUpdateMany(
      ids.map((id) => ({ id, updates })),
      options
    );
  }

  public async importRows(newRows: Partial<T>[], options?: MutationOptions): Promise<number> {
    await this.ensureInitialized();
    if (!Array.isArray(newRows) || newRows.length === 0) return 0;

    const normalizer = GoogleDriveSheetService.getInstance();
    const accumulatedRefRows: Array<Record<string, any>> = [...(this.memoryData as any[])];
    const createdRows: T[] = [];

    for (const item of newRows) {
      const preparedInput: Record<string, any> = { ...(item as Record<string, any>) };
      if (!String(preparedInput.id || '').trim()) {
        preparedInput.id = generateNextSequentialId(this.tableName, accumulatedRefRows);
      }
      if (this.tableName === 'Master_Jurusan' && !String(preparedInput.kode || '').trim() && preparedInput.nama) {
        preparedInput.kode = generateJurusanCode(String(preparedInput.nama));
      }
      if (this.tableName === 'Data_Pengajuan_PKL' && !String(preparedInput.noPengajuan || '').trim()) {
        preparedInput.noPengajuan = preparedInput.id;
      }
      if (this.tableName === 'Data_Perizinan_PKL') {
        if (!String(preparedInput.noPerizinan || '').trim()) {
          preparedInput.noPerizinan = preparedInput.id;
        }
      }
      if (
        (this.tableName === 'data_plotting' || this.tableName === 'Plotting_Pemberangkatan') &&
        !String(preparedInput.idPenempatan || '').trim()
      ) {
        preparedInput.idPenempatan = preparedInput.id;
      }
      if (preparedInput.nis !== undefined && preparedInput.nis !== null && String(preparedInput.nis).trim()) {
        preparedInput.nis = stripNisSymbols(preparedInput.nis) || String(preparedInput.nis).trim();
      }

      const preparedRecord = this.enrichOptimisticRecord(
        normalizer.prepareOutgoingRecord(
          this.tableName,
          preparedInput,
          Object.keys(preparedInput)
        ) as T
      );
      accumulatedRefRows.push(preparedRecord as Record<string, any>);
      createdRows.push(preparedRecord);
    }

    if (createdRows.length === 0) return 0;

    const client = GoogleSheetClient.getInstance();
    const CHUNK_SIZE = 150;
    let totalImported = 0;

    this.isCommittingSelf = true;
    try {
      for (let i = 0; i < createdRows.length; i += CHUNK_SIZE) {
        const chunk = createdRows.slice(i, i + CHUNK_SIZE);
        this.lastLocalMutationAt = Date.now();
        client.markSheetMutated(this.tableName);

        const commitRes = await client.commitToSpreadsheet(
          this.tableName,
          'IMPORT',
          chunk,
          options
        );
        if (!commitRes.success) {
          throw new Error(commitRes.error || 'Gagal mengimpor data ke Cloud Server.');
        }
        totalImported += chunk.length;
        options?.onProgress?.(totalImported, createdRows.length);
        const committedAt = Date.now();
        this.memoryData = [...chunk, ...this.memoryData];
        this.lastFetchedAt = committedAt;
        this.lastLocalMutationAt = committedAt;
      }
      await client.saveCachedSnapshot(this.tableName, this.memoryData).catch(() => {});
      this.notifyDataUpdated();
      this.syncSiblingRepositories();
    } finally {
      this.isCommittingSelf = false;
    }

    return totalImported;
  }

  public querySync(
    filter: FilterState = {},
    sort: SortState = { column: null, direction: 'asc' },
    page: number = 1,
    pageSize: number = 10,
    search: string = ''
  ): QueryResult<T> {
    let result = [...this.memoryData];

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      const qDigits = !/[a-z]/i.test(search) ? stripNisSymbols(search) : '';
      const searchableKeys = this.metadata.fields
        .filter((f) => f.isSearchable !== false)
        .map((f) => String(f.key));

      result = result.filter((row) => {
        let entry = typeof row === 'object' && row !== null ? this.searchIndexCache.get(row) : undefined;
        if (!entry) {
          const textParts: string[] = [];
          const digitParts: string[] = [];
          for (const k of searchableKeys) {
            const val = (row as any)[k];
            if (val === null || val === undefined || val === '') continue;
            const strVal = String(val);
            textParts.push(strVal.toLowerCase());
            if (k === 'nis' || k === 'daftarSiswa' || k === 'nik') {
              const digits = stripNisSymbols(strVal);
              if (digits) digitParts.push(digits);
            }
          }
          entry = {
            text: textParts.join(' '),
            nisDigits: digitParts.join(' '),
          };
          if (typeof row === 'object' && row !== null) {
            this.searchIndexCache.set(row, entry);
          }
        }
        if (entry.text.includes(q)) return true;
        if (qDigits.length >= 3 && entry.nisDigits.includes(qDigits)) return true;
        return false;
      });
    }

    const filterKeys = Object.keys(filter);
    if (filterKeys.length > 0) {
      result = result.filter((row) => {
        return filterKeys.every((key) => {
          const filterVal = filter[key];
          if (filterVal === undefined || filterVal === null || filterVal === '' || filterVal === 'ALL') {
            return true;
          }
          const rowVal = (row as any)[key];
          if (rowVal === undefined || rowVal === null) return false;
          return String(rowVal).toLowerCase() === String(filterVal).toLowerCase();
        });
      });
    }

    if (sort.column) {
      const col = sort.column;
      const dir = sort.direction === 'desc' ? -1 : 1;
      result.sort((a, b) => {
        const valA = (a as any)[col];
        const valB = (b as any)[col];

        if (valA === valB) return 0;
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;

        if (typeof valA === 'number' && typeof valB === 'number') {
          return (valA - valB) * dir;
        }
        return String(valA).localeCompare(String(valB), undefined, { numeric: true }) * dir;
      });
    }

    const total = result.length;
    const startIndex = (page - 1) * pageSize;
    const paginatedData = result.slice(startIndex, startIndex + pageSize);

    return {
      data: paginatedData,
      filteredData: result,
      total,
      page,
      pageSize,
    };
  }

  public async query(
    filter: FilterState = {},
    sort: SortState = { column: null, direction: 'asc' },
    page: number = 1,
    pageSize: number = 10,
    search: string = ''
  ): Promise<QueryResult<T>> {
    return this.querySync(filter, sort, page, pageSize, search);
  }
}
