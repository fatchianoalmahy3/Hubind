import { useState, useEffect, useCallback, useRef } from 'react';
import { BaseRepository } from '../core/BaseRepository';
import { FilterState, SortState } from '../core/types/metadata';
import { ToastManager } from '../core/ToastManager';

export function useDataGrid<T extends { id: string }>(repository: BaseRepository<T>) {
  const [data, setData] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Sorting & Filtering
  const [sort, setSort] = useState<SortState>({ column: null, direction: 'asc' });
  const [filter, setFilter] = useState<FilterState>({});
  const [search, setSearch] = useState('');

  // Row Selection (for Bulk Actions)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const lastVisibleFetchRef = useRef<number>(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      await repository.ensureInitialized();
      const repoErr = repository.getLastError();
      if (repoErr) {
        setLoadError(repoErr);
      }
      const res = await repository.query(filter, sort, page, pageSize, search);
      setData(res.data);
      setTotal(res.total);
      lastVisibleFetchRef.current = Date.now();
    } catch (e: any) {
      console.error('Failed to query data', e);
      setLoadError(e?.message || 'Gagal membaca data dari Google Spreadsheet.');
    } finally {
      setLoading(false);
    }
  }, [repository, filter, sort, page, pageSize, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibilityChange = () => {
      // Only revalidate on focus return if data is older than 2 minutes
      if (
        document.visibilityState === 'visible' &&
        Date.now() - lastVisibleFetchRef.current > 120_000
      ) {
        fetchData();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [fetchData]);

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
      `Menyegarkan Sheet ${sheetName}...`,
      'pending',
      'Mengambil data terbaru langsung dari Google Spreadsheet.',
      sheetName
    );
    try {
      await repository.reloadFromSpreadsheet();
      const repoErr = repository.getLastError();
      if (repoErr) {
        setLoadError(repoErr);
        setSyncMessage(repoErr);
        ToastManager.getInstance().update(toastId, 'Gagal Memuat Sheet', 'error', repoErr);
      } else {
        const msg = `Sheet ${sheetName} berhasil disegarkan dari Google Spreadsheet.`;
        setSyncMessage(msg);
        ToastManager.getInstance().update(toastId, 'Data Sheet Diperbarui', 'success', msg);
      }
      await fetchData();
    } catch (e: any) {
      const msg = `Gagal sinkronisasi: ${e?.message || 'Koneksi terputus'}`;
      setLoadError(msg);
      setSyncMessage(msg);
      ToastManager.getInstance().update(toastId, 'Gagal Menyegarkan Sheet', 'error', msg);
    } finally {
      setSyncing(false);
    }
  };

  return {
    data,
    total,
    loading,
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
