import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';

export interface PaginationBarProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
  itemLabel?: string;
  compact?: boolean;
  className?: string;
}

export const PaginationBar: React.FC<PaginationBarProps> = ({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  itemLabel = 'data',
  compact = false,
  className = '',
}) => {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIdx = total > 0 ? (safePage - 1) * pageSize + 1 : 0;
  const endIdx = total > 0 ? Math.min(safePage * pageSize, total) : 0;

  if (compact) {
    return (
      <div
        className={`border-t border-slate-200 px-2.5 py-2 bg-slate-50/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 ${className}`}
      >
        <div className="flex items-center gap-1.5">
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            aria-label={`Jumlah ${itemLabel} per halaman`}
            className="h-7 bg-white border border-slate-200 rounded-md px-1.5 text-[11px] font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer tabular-nums"
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt} / hal
              </option>
            ))}
          </select>
          <span className="text-slate-500 tabular-nums">
            {total > 0 ? `${startIdx}–${endIdx} / ${total}` : `0 ${itemLabel}`}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(1)}
            disabled={safePage <= 1}
            className="w-7 h-7 rounded-md bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center transition-colors cursor-pointer"
            title="Halaman Pertama"
            aria-label="Halaman Pertama"
          >
            <ChevronsLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onPageChange(safePage - 1)}
            disabled={safePage <= 1}
            className="w-7 h-7 rounded-md bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center transition-colors cursor-pointer"
            title="Sebelumnya"
            aria-label="Halaman Sebelumnya"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          <span className="h-7 px-2 rounded-md bg-white border border-slate-200 font-semibold text-[11px] text-slate-800 inline-flex items-center tabular-nums">
            {safePage} / {totalPages}
          </span>

          <button
            type="button"
            onClick={() => onPageChange(safePage + 1)}
            disabled={safePage >= totalPages}
            className="w-7 h-7 rounded-md bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center transition-colors cursor-pointer"
            title="Berikutnya"
            aria-label="Halaman Berikutnya"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onPageChange(totalPages)}
            disabled={safePage >= totalPages}
            className="w-7 h-7 rounded-md bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center transition-colors cursor-pointer"
            title="Halaman Terakhir"
            aria-label="Halaman Terakhir"
          >
            <ChevronsRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`border-t border-slate-200 px-4 py-3 bg-slate-50/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 ${className}`}
    >
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="font-medium text-slate-500">Tampilkan</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          aria-label={`Jumlah ${itemLabel} per halaman`}
          className="h-9 bg-white border border-slate-200 rounded-lg px-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer tabular-nums"
        >
          {pageSizeOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt} baris
            </option>
          ))}
        </select>
        <span className="text-slate-500 tabular-nums">
          {total > 0
            ? `Menampilkan ${startIdx}–${endIdx} dari ${total} ${itemLabel}`
            : `0 ${itemLabel}`}
        </span>
      </div>

      {/* Stepper buttons (36x36px) */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={safePage <= 1}
          className="w-9 h-9 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
          title="Halaman Pertama"
          aria-label="Halaman Pertama"
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onPageChange(safePage - 1)}
          disabled={safePage <= 1}
          className="w-9 h-9 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
          title="Sebelumnya"
          aria-label="Halaman Sebelumnya"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <span className="h-9 px-3 rounded-lg bg-white border border-slate-200 font-semibold text-xs text-slate-800 inline-flex items-center tabular-nums">
          Hal {safePage} / {totalPages}
        </span>

        <button
          type="button"
          onClick={() => onPageChange(safePage + 1)}
          disabled={safePage >= totalPages}
          className="w-9 h-9 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
          title="Berikutnya"
          aria-label="Halaman Berikutnya"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={safePage >= totalPages}
          className="w-9 h-9 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
          title="Halaman Terakhir"
          aria-label="Halaman Terakhir"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
