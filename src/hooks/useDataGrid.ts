import { useState, useEffect, useCallback, useRef, useDeferredValue } from 'react';
import { BaseRepository } from '../core/BaseRepository';
import { FilterState, SortState } from '../core/types/metadata';
import { ToastManager } from '../core/ToastManager';

import { GoogleSheetClient } from '../core/GoogleSheetClient';

export interface UseDataGridOptions<T> {
  rowPredicate?: (row: T) => boolean;
}

export function useDataGrid<T extends { id: string }>(
  repository: BaseRepository<T>,
  options?: UseDataGridOptions<T>
) {
  const rowPredicate = options?.rowPredicate;

  const [initialSnapshot] = useState(() => {
    const hydrated = repository.tryHydrateSync();
    if (hydrated || repository.hasHydratedData()) {
      const res = repository.querySync({}, { column: null, direction: 'asc' }, 1, 10, '');
      const baseFiltered = res.filteredData || res.data;
      const scopedAll = rowPredicate ? baseFiltered.filter(rowPredicate) : baseFiltered;
      return {
        data: scopedAll.slice(0, 10),
        filteredData: scopedAll,
        total: scopedAll.length,
        hasCache: true,
      };
    }
    return { data: [] as T[], filteredData: [] as T[], total: 0, hasCache: false };
  });

  const [data, setData] = useState<T[]>(initialSnapshot.data);
  const [filteredData, setFilteredData] = useState<T[]>(initialSnapshot.filteredData);
  const [total, setTotal] = useState(initialSnapshot.total);
  const [loading, setLoading] = useState(false);
  const [revalidating, setRevalidating] = useState(() => repository.getIsRevalidating());
  const [loadError, setLoadError] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Sorting & Filtering
  const [sort, setSort] = useState<SortState>({ column: null, direction: 'asc' });
  const [filter, setFilter] = useState<FilterState>({});
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);

  // Row Selection (for Bulk Actions)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const lastVisibleFetchRef = useRef<number>(initialSnapshot.hasCache ? Date.now() : 0);

  const queryParamsRef = useRef({
    filter,
    sort,
    page,
    pageSize,
    search: deferredSearch,
  });
  queryParamsRef.current = {
    filter,
    sort,
    page,
    pageSize,
    search: deferredSearch,
  };

  const applyLocalQuery = useCallback(
    (override?: Partial<{ filter: FilterState; sort: SortState; page: number; pageSize: number; search: string }>) => {
      const p = { ...queryParamsRef.current, ...override };
      const res = repository.querySync(p.filter, p.sort, 1, Number.MAX_SAFE_INTEGER, p.search);
      const baseFiltered = res.filteredData || res.data;
      const scopedAll = rowPredicate ? baseFiltered.filter(rowPredicate) : baseFiltered;

      const totalScoped = scopedAll.length;
      const maxPage = Math.max(1, Math.ceil(totalScoped / Math.max(1, p.pageSize)));
      const effectivePage = p.page > maxPage ? 1 : p.page;
      if (effectivePage !== p.page) {
        setPage(1);
      }

      const startIndex = (effectivePage - 1) * p.pageSize;
      setData(scopedAll.slice(startIndex, startIndex + p.pageSize));
      setFilteredData(scopedAll);
      setTotal(totalScoped);

      if (rowPredicate) {
        const allowedIds = new Set(scopedAll.map((r) => r.id));
        setSelectedIds((prev) => {
          if (prev.length === 0) return prev;
          const next = prev.filter((id) => allowedIds.has(id));
          return next.length === prev.length ? prev : next;
        });
      }
    },
    [repository, rowPredicate]
  );

  const fetchData = useCallback(
    async (silent = false) => {
      repository.tryHydrateSync();
      if (!silent && !repository.hasHydratedData()) {
        setLoading(true);
      }
      setLoadError(null);
      try {
        await repository.ensureInitialized();
        const repoErr = repository.getLastError();
        if (repoErr) {
          setLoadError(repoErr);
        }
        applyLocalQuery();
        lastVisibleFetchRef.current = Date.now();
      } catch (e: any) {
        console.error('Failed to query data', e);
        setLoadError(e?.message || 'Gagal membaca data dari Cloud Server.');
      } finally {
        setLoading(false);
      }
    },
    [repository, applyLocalQuery]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Synchronous local query on search/filter/sort/page/scope changes (zero API/listener churn)
  useEffect(() => {
    applyLocalQuery({
      filter,
      sort,
      page,
      pageSize,
      search: deferredSearch,
    });
  }, [applyLocalQuery, filter, sort, page, pageSize, deferredSearch, rowPredicate]);

  useEffect(() => {
    const client = GoogleSheetClient.getInstance();
    const unsubConfig = client.addChangeListener(() => {
      fetchData(true);
    });
    const unsubRepo = repository.onDataUpdated((meta) => {
      setRevalidating(repository.getIsRevalidating());
      if (!meta?.revalidatingOnly) {
        fetchData(true);
      }
    });

    const onVisibilityOrFocus = () => {
      if (
        (typeof document === 'undefined' || document.visibilityState === 'visible') &&
        Date.now() - lastVisibleFetchRef.current > 20_000
      ) {
        fetchData(true);
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityOrFocus);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onVisibilityOrFocus);
    }

    return () => {
      unsubConfig();
      unsubRepo();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityOrFocus);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onVisibilityOrFocus);
      }
    };
  }, [fetchData, repository]);

  const handleSort = (columnKey: string) => {
    setSort((prev) => {
      if (prev.column === columnKey) {
        return {
          column: columnKey,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      return { column: columnKey, direction: 'asc' };
    });
    setPage(1);
  };

  const handleSearch = (q: string) => {
    setSearch(q);
    setPage(1);
  };

  const handleFilterChange = (newFilter: FilterState) => {
    setFilter(newFilter);
    setPage(1);
  };

  const resetFilter = () => {
    setFilter({});
    setSearch('');
    setPage(1);
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === data.length && data.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(data.map((r) => r.id));
    }
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  const deleteRow = async (id: string) => {
    const success = await repository.delete(id);
    if (success) {
      setSelectedIds((prev) => prev.filter((item) => item !== id));
      await fetchData();
    }
    return success;
  };

  const bulkDeleteRows = async () => {
    if (selectedIds.length === 0) return 0;
    const count = await repository.bulkDelete(selectedIds);
    setSelectedIds([]);
    await fetchData();
    return count;
  };

  const bulkUpdateRows = async (updates: Partial<T>) => {
    if (selectedIds.length === 0) return 0;
    const count = await repository.bulkUpdate(selectedIds, updates);
    setSelectedIds([]);
    await fetchData();
    return count;
  };

  const syncWithSpreadsheet = async (sheetName: string) => {
    setSyncing(true);
    setSyncMessage(null);
    setLoadError(null);
    const toastId = ToastManager.getInstance().show(
      'Menyegarkan Data Cloud Server...',
      'pending',
      'Mengambil data terbaru langsung dari Cloud Server.',
      sheetName
    );
    try {
      await repository.reloadFromSpreadsheet();
      const repoErr = repository.getLastError();
      if (repoErr) {
        setLoadError(repoErr);
        setSyncMessage(repoErr);
        ToastManager.getInstance().update(toastId, 'Gagal Memuat Data', 'error', repoErr);
      } else {
        const msg = 'Data berhasil disegarkan langsung dari Cloud Server.';
        setSyncMessage(msg);
        ToastManager.getInstance().update(toastId, 'Data Cloud Server Diperbarui', 'success', msg);
      }
      await fetchData();
    } catch (e: any) {
      const msg = `Gagal sinkronisasi: ${e?.message || 'Koneksi ke Cloud Server terputus'}`;
      setLoadError(msg);
      setSyncMessage(msg);
      ToastManager.getInstance().update(toastId, 'Gagal Menyegarkan Data', 'error', msg);
    } finally {
      setSyncing(false);
    }
  };

  return {
    data,
    filteredData,
    total,
    loading,
    revalidating,
    loadError,
    page,
    pageSize,
    setPage,
    setPageSize,
    sort,
    handleSort,
    filter,
    handleFilterChange,
    resetFilter,
    search,
    handleSearch,
    selectedIds,
    toggleSelectRow,
    toggleSelectAll,
    clearSelection,
    refresh: fetchData,
    deleteRow,
    bulkDeleteRows,
    bulkUpdateRows,
    syncWithSpreadsheet,
    syncing,
    syncMessage,
    setSyncMessage,
  };
}
