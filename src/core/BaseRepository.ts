import { ModuleMetadata, QueryResult, FilterState, SortState } from './types/metadata';
import { GoogleSheetClient } from './GoogleSheetClient';

export interface MutationOptions {
  silentToast?: boolean;
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
  private static readonly REVALIDATE_TTL_MS = 120_000;

  constructor(tableName: string, metadata: ModuleMetadata<T>, _initialData: T[] = []) {
    this.tableName = tableName;
    this.metadata = metadata;
    this.memoryData = [];

    // Automatically invalidate RAM cache whenever active Spreadsheet ID changes
    GoogleSheetClient.getInstance().addChangeListener(() => {
      const activeId = GoogleSheetClient.getInstance().getSpreadsheetId();
      if (activeId !== this.loadedSpreadsheetId) {
        this.memoryData = [];
        this.isInitialized = false;
        this.initPromise = null;
        this.lastFetchedAt = 0;
      }
    });
  }

  public getLastError(): string | null {
    return this.lastError;
  }

  public async ensureInitialized(): Promise<void> {
    const activeId = GoogleSheetClient.getInstance().getSpreadsheetId();
    const isStale =
      this.loadedSpreadsheetId !== '' &&
      Date.now() - this.lastFetchedAt > BaseRepository.REVALIDATE_TTL_MS;

    if (!this.isInitialized || activeId !== this.loadedSpreadsheetId || isStale) {
      if (!this.initPromise) {
        this.initPromise = this.initData(false);
      }
      await this.initPromise;
    }
  }

  private async initData(forceFresh: boolean = false): Promise<void> {
    this.lastError = null;
    const client = GoogleSheetClient.getInstance();
    const activeId = client.getSpreadsheetId();

    try {
      if (!activeId) {
        this.memoryData = [];
        this.loadedSpreadsheetId = '';
        this.lastFetchedAt = 0;
        this.lastError = 'ID Google Spreadsheet belum dikonfigurasi.';
        return;
      }

      const res = await client.fetchSheetData(this.tableName, forceFresh);
      if (res.fromSpreadsheet) {
        const seenIds = new Set<string>();
        this.memoryData = res.data.map((row: any, idx: number) => {
          const baseId = String(row?.id || `row_${idx + 2}`);
          if (seenIds.has(baseId)) {
            const uniqueId = `${baseId}#r${idx + 2}`;
            seenIds.add(uniqueId);
            return { ...row, id: uniqueId };
          }
          seenIds.add(baseId);
          return { ...row, id: baseId };
        });
        this.loadedSpreadsheetId = activeId;
        this.lastFetchedAt = Date.now();
      } else {
        this.memoryData = [];
        this.loadedSpreadsheetId = '';
        this.lastFetchedAt = 0;
        this.lastError = res.error || 'Belum terhubung ke Google Spreadsheet.';
      }
    } catch (err: any) {
      this.memoryData = [];
      this.loadedSpreadsheetId = '';
      this.lastFetchedAt = 0;
      this.lastError = err?.message || `Gagal membaca sheet ${this.tableName}`;
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
    const newRecord = {
      ...data,
      id: data.id || `rec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    } as T;

    const commitRes = await GoogleSheetClient.getInstance().commitToSpreadsheet(
      this.tableName,
      'CREATE',
      newRecord,
      options
    );
    if (!commitRes.success) {
      throw new Error(commitRes.error || 'Gagal menyimpan data baru ke Google Spreadsheet.');
    }

    this.memoryData.unshift(newRecord);
    this.lastFetchedAt = Date.now();
    return { ...newRecord };
  }

  public async update(
    id: string,
    updates: Partial<T>,
    options?: MutationOptions
  ): Promise<T | null> {
    await this.ensureInitialized();
    const index = this.memoryData.findIndex((row) => row.id === id);
    if (index === -1) return null;

    const candidate = {
      ...this.memoryData[index],
      ...updates,
    };

    const commitRes = await GoogleSheetClient.getInstance().commitToSpreadsheet(
      this.tableName,
      'UPDATE',
      candidate,
      options
    );
    if (!commitRes.success) {
      throw new Error(commitRes.error || 'Gagal memperbarui data di Google Spreadsheet.');
    }

    this.memoryData[index] = candidate;
    this.lastFetchedAt = Date.now();
    return { ...this.memoryData[index] };
  }

  public async delete(id: string, options?: MutationOptions): Promise<boolean> {
    await this.ensureInitialized();
    const target = this.memoryData.find((r) => r.id === id);
    if (!target) return false;

    const commitRes = await GoogleSheetClient.getInstance().commitToSpreadsheet(
      this.tableName,
      'DELETE',
      { id, deletedRow: target },
      options
    );
    if (!commitRes.success) {
      throw new Error(commitRes.error || 'Gagal menghapus data dari Google Spreadsheet.');
    }

    this.memoryData = this.memoryData.filter((row) => row.id !== id);
    this.lastFetchedAt = Date.now();
    return true;
  }

  public async bulkDelete(ids: string[], options?: MutationOptions): Promise<number> {
    await this.ensureInitialized();
    const idSet = new Set(ids);
    const matching = this.memoryData.filter((row) => idSet.has(row.id));
    if (matching.length === 0) return 0;

    const commitRes = await GoogleSheetClient.getInstance().commitToSpreadsheet(
      this.tableName,
      'BULK_DELETE',
      { ids },
      options
    );
    if (!commitRes.success) {
      throw new Error(commitRes.error || 'Gagal menghapus baris terpilih dari Google Spreadsheet.');
    }

    this.memoryData = this.memoryData.filter((row) => !idSet.has(row.id));
    this.lastFetchedAt = Date.now();
    return matching.length;
  }

  public async bulkUpdate(
    ids: string[],
    updates: Partial<T>,
    options?: MutationOptions
  ): Promise<number> {
    await this.ensureInitialized();
    const idSet = new Set(ids);
    const updatedRows: T[] = [];
    const nextMemory = this.memoryData.map((row) => {
      if (idSet.has(row.id)) {
        const updated = { ...row, ...updates };
        updatedRows.push(updated);
        return updated;
      }
      return row;
    });

    if (updatedRows.length === 0) return 0;

    const commitRes = await GoogleSheetClient.getInstance().commitToSpreadsheet(
      this.tableName,
      'BULK_UPDATE',
      { ids, updates, updatedRows },
      options
    );
    if (!commitRes.success) {
      throw new Error(commitRes.error || 'Gagal memperbarui baris terpilih di Google Spreadsheet.');
    }

    this.memoryData = nextMemory;
    this.lastFetchedAt = Date.now();
    return updatedRows.length;
  }

  public async importRows(newRows: Partial<T>[], options?: MutationOptions): Promise<number> {
    await this.ensureInitialized();
    const createdRows: T[] = newRows.map((item, idx) => ({
      ...item,
      id: item.id || `imp_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
    })) as T[];

    if (createdRows.length === 0) return 0;

    const commitRes = await GoogleSheetClient.getInstance().commitToSpreadsheet(
      this.tableName,
      'IMPORT',
      createdRows,
      options
    );
    if (!commitRes.success) {
      throw new Error(commitRes.error || 'Gagal mengimpor data ke Google Spreadsheet.');
    }

    this.memoryData = [...createdRows, ...this.memoryData];
    this.lastFetchedAt = Date.now();
    return createdRows.length;
  }

  public async query(
    filter: FilterState = {},
    sort: SortState = { column: null, direction: 'asc' },
    page: number = 1,
    pageSize: number = 10,
    search: string = ''
  ): Promise<QueryResult<T>> {
    let result = [...this.memoryData];

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      const searchableKeys = this.metadata.fields
        .filter((f) => f.isSearchable !== false)
        .map((f) => String(f.key));

      result = result.filter((row) => {
        return searchableKeys.some((k) => {
          const val = (row as any)[k];
          if (val === null || val === undefined) return false;
          return String(val).toLowerCase().includes(q);
        });
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
      total,
      page,
      pageSize,
    };
  }
}
