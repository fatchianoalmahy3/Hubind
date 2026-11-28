import { useCallback, useEffect, useMemo, useState } from 'react';

export interface UsePaginationOptions {
  defaultPageSize?: number;
  pageSizeOptions?: number[];
}

export function usePagination<T>(
  items: T[],
  options?: UsePaginationOptions
) {
  const defaultPageSize = options?.defaultPageSize ?? 10;
  const pageSizeOptions = options?.pageSizeOptions ?? [10, 25, 50, 100];

  const [page, setPageState] = useState(1);
  const [pageSize, setPageSizeState] = useState(defaultPageSize);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const effectivePage = page > totalPages ? 1 : Math.max(1, page);

  useEffect(() => {
    if (page !== effectivePage) {
      setPageState(effectivePage);
    }
  }, [page, effectivePage]);

  const setPage = useCallback(
    (nextPage: number) => {
      const clamped = Math.min(Math.max(1, nextPage), totalPages);
      setPageState(clamped);
    },
    [totalPages]
  );

  const setPageSize = useCallback((nextSize: number) => {
    const valid = Math.max(1, nextSize);
    setPageSizeState(valid);
    setPageState(1);
  }, []);

  const resetPage = useCallback(() => {
    setPageState(1);
  }, []);

  const paginatedItems = useMemo(() => {
    const start = (effectivePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, effectivePage, pageSize]);

  return {
    paginatedItems,
    page: effectivePage,
    pageSize,
    total,
    totalPages,
    pageSizeOptions,
    setPage,
    setPageSize,
    resetPage,
  };
}
