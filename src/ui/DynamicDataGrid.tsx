import React, { useState, useRef, useEffect } from 'react';
import { FieldConfig, SortState } from '../core/types/metadata';
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  FileText,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Image as ImageIcon,
  MoreVertical,
  Loader2,
  MessageCircle,
} from 'lucide-react';
import {
  formatIndonesianDate,
  getWibCalendarParts,
  isIsoTimestampString,
} from '../core/utils/dateHelpers';
import { formatNisInsideText, formatNisVisual } from '../core/utils/nisHelpers';
import {
  formatPhoneDisplay,
  getWhatsAppHref,
  isPhoneFieldKey,
} from '../core/utils/autoIdHelpers';

export interface CustomRowAction {
  name: string;
  label: string;
  icon?: any;
  color?: string;
}

interface DynamicDataGridProps<T = any> {
  fields: FieldConfig<T>[];
  data: T[];
  total: number;
  loading: boolean;
  revalidating?: boolean;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
  sort: SortState;
  onSort: (colKey: string) => void;
  selectedIds: string[];
  onToggleSelectRow: (id: string) => void;
  onToggleSelectAll: () => void;
  onEdit: (row: T) => void;
  onDelete: (row: T) => void;
  onCustomAction?: (actionName: string, row: T) => void;
  customRowActions?: CustomRowAction[];
  viewMode?: 'table' | 'card';
  onViewModeChange?: (mode: 'table' | 'card') => void;
}

interface RowActionsProps<T> {
  row: T;
  customRowActions: CustomRowAction[];
  onCustomAction?: (actionName: string, row: T) => void;
  onEdit: (row: T) => void;
  onDelete: (row: T) => void;
  openUpward?: boolean;
}

function RowActions<T>({
  row,
  customRowActions,
  onCustomAction,
  onEdit,
  onDelete,
  openUpward = false,
}: RowActionsProps<T>) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

  // If no custom workflow actions, render clean Edit | Delete with generous 36x36px hit targets
  if (customRowActions.length === 0) {
    return (
      <div className="inline-flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={() => onEdit(row)}
          className="w-9 h-9 rounded-lg text-slate-600 hover:text-blue-700 hover:bg-blue-50 inline-flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
          title="Edit Data"
          aria-label="Edit Data"
        >
          <Edit2 className="w-4 h-4" />
        </button>
        <span className="w-px h-4 bg-slate-200" aria-hidden="true" />
        <button
          type="button"
          onClick={() => onDelete(row)}
          className="w-9 h-9 rounded-lg text-slate-500 hover:text-rose-700 hover:bg-rose-50 inline-flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40"
          title="Hapus Data"
          aria-label="Hapus Data"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // With custom actions: expose primary inline action + Edit, overflow remaining workflow actions + Delete into clean menu
  const primaryActions = customRowActions.slice(0, 1);
  const secondaryActions = customRowActions.slice(1);

  return (
    <div className="inline-flex items-center justify-end gap-1.5 relative" ref={menuRef}>
      {primaryActions.map((act) => {
        const Icon = act.icon;
        return (
          <button
            key={act.name}
            type="button"
            onClick={() => onCustomAction && onCustomAction(act.name, row)}
            className={`h-9 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
              act.color || 'text-slate-700'
            }`}
            title={act.label}
          >
            {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
            <span className="hidden xl:inline">{act.label}</span>
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => onEdit(row)}
        className="w-9 h-9 rounded-lg text-slate-600 hover:text-blue-700 hover:bg-blue-50 inline-flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
        title="Edit Data"
        aria-label="Edit Data"
      >
        <Edit2 className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={() => setMenuOpen((prev) => !prev)}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        className={`w-9 h-9 rounded-lg inline-flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
          menuOpen
            ? 'bg-slate-200 text-slate-900'
            : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
        }`}
        title="Aksi Lainnya"
        aria-label="Aksi Lainnya"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {menuOpen && (
        <div
          role="menu"
          className={`absolute right-0 w-52 bg-white rounded-xl border border-slate-200 shadow-lg py-1.5 z-30 text-left ${
            openUpward ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          }`}
        >
          {secondaryActions.map((act) => {
            const Icon = act.icon;
            return (
              <button
                key={act.name}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onCustomAction && onCustomAction(act.name, row);
                }}
                className="w-full min-h-9 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 cursor-pointer"
              >
                {Icon && <Icon className={`w-4 h-4 shrink-0 ${act.color || 'text-slate-500'}`} />}
                <span className="truncate">{act.label}</span>
              </button>
            );
          })}

          {secondaryActions.length > 0 && <div className="my-1 border-t border-slate-100" />}

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              onDelete(row);
            }}
            className="w-full min-h-9 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 flex items-center gap-2.5 cursor-pointer"
          >
            <Trash2 className="w-4 h-4 text-rose-600 shrink-0" />
            <span>Hapus Data</span>
          </button>
        </div>
      )}
    </div>
  );
}

export function DynamicDataGrid<T extends { id: string }>({
  fields,
  data,
  total,
  loading,
  revalidating = false,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  sort,
  onSort,
  selectedIds,
  onToggleSelectRow,
  onToggleSelectAll,
  onEdit,
  onDelete,
  onCustomAction,
  customRowActions = [],
  viewMode = 'table',
}: DynamicDataGridProps<T>) {
  const tableColumns = fields.filter((f) => f.isTableColumn);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const isAllSelected = data.length > 0 && selectedIds.length === data.length;
  const [slowLoad, setSlowLoad] = useState(false);

  useEffect(() => {
    if (!loading) {
      setSlowLoad(false);
      return;
    }
    const timer = window.setTimeout(() => setSlowLoad(true), 2500);
    return () => window.clearTimeout(timer);
  }, [loading]);

  const skeletonWidths = ['w-20', 'w-40', 'w-28', 'w-32', 'w-24'];

  const renderCellContent = (field: FieldConfig<T>, row: T) => {
    const val = (row as any)[field.key];

    if (field.renderCell) {
      return field.renderCell(val, row);
    }

    if (field.type === 'image') {
      return val ? (
        <img
          src={val}
          alt="Thumbnail"
          referrerPolicy="no-referrer"
          className="w-9 h-9 rounded-lg object-cover border border-slate-200"
        />
      ) : (
        <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200">
          <ImageIcon className="w-4 h-4" />
        </div>
      );
    }

    if (field.type === 'boolean') {
      return val ? (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
          <CheckCircle2 className="w-3.5 h-3.5" /> Ya
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
          <XCircle className="w-3.5 h-3.5" /> Belum
        </span>
      );
    }

    if (field.type === 'select' && field.options) {
      const opt = field.options.find((o) => String(o.value) === String(val));
      if (opt?.badgeColor) {
        return (
          <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold border whitespace-nowrap ${opt.badgeColor}`}>
            {opt.label || val}
          </span>
        );
      }
    }

    if (field.type === 'date' && val) {
      return (
        <span className="text-xs font-medium text-slate-700 whitespace-nowrap">
          {formatIndonesianDate(val)}
        </span>
      );
    }

    if (field.key === 'timestamp' && val) {
      const rawTs = String(val).trim();
      if (isIsoTimestampString(rawTs)) {
        const datePart = formatIndonesianDate(rawTs);
        const parts = getWibCalendarParts(new Date(rawTs));
        const hasTime = !(parts.hour === '00' && parts.minute === '00' && parts.second === '00');
        return (
          <span className="text-xs text-slate-700 whitespace-nowrap">
            {hasTime ? `${datePart}, ${parts.hour}:${parts.minute} WIB` : datePart}
          </span>
        );
      }
      const spaceTsMatch = rawTs.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})(?::\d{2})?$/);
      if (spaceTsMatch) {
        return (
          <span className="text-xs text-slate-700 whitespace-nowrap">
            {formatIndonesianDate(spaceTsMatch[1])}, {spaceTsMatch[2]} WIB
          </span>
        );
      }
    }

    if (field.key === 'nis' && val !== null && val !== undefined && val !== '') {
      return (
        <span className="font-mono text-xs font-semibold text-slate-800 tabular-nums whitespace-nowrap">
          {formatNisVisual(val)}
        </span>
      );
    }

    if (field.key === 'daftarSiswa' && val !== null && val !== undefined && val !== '') {
      return <span className="text-slate-700 text-[13px]">{formatNisInsideText(val)}</span>;
    }

    if (isPhoneFieldKey(String(field.key)) && val !== null && val !== undefined && val !== '') {
      const displayPhone = formatPhoneDisplay(val);
      const waHref = getWhatsAppHref(val);
      if (waHref) {
        return (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title={`Chat WhatsApp ke ${displayPhone}`}
            className="inline-flex items-center gap-1.5 max-w-full font-mono text-xs font-semibold text-emerald-700 hover:text-emerald-900 hover:underline decoration-emerald-500/70 underline-offset-2 whitespace-nowrap transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="truncate">{displayPhone}</span>
          </a>
        );
      }
      return (
        <span className="font-mono text-xs text-slate-700 whitespace-nowrap">
          {displayPhone}
        </span>
      );
    }

    if (typeof val === 'number') {
      return <span className="font-semibold text-slate-800 tabular-nums">{val.toLocaleString('id-ID')}</span>;
    }

    return (
      <span className="text-slate-700 text-[13px]">
        {val !== null && val !== undefined && val !== '' ? String(val) : '-'}
      </span>
    );
  };

  const getRowStatusText = (row: any): string | null => {
    const candidate =
      row.statusKakomli ||
      row.status ||
      row.statusPenempatan ||
      row.statusKerjasama ||
      row.tahap ||
      null;
    return candidate ? String(candidate) : null;
  };

  const showProgressSweep = loading || revalidating;
  const loadingMessage = slowLoad
    ? 'Sedang mengambil data terbaru dari Cloud Server, mohon tunggu...'
    : 'Memuat data dari Cloud Server...';

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
      {showProgressSweep && (
        <div
          className="progress-sweep-track"
          role="progressbar"
          aria-label="Memuat atau menyinkronkan data dari Cloud Server"
        >
          <div className="progress-sweep-bar" />
        </div>
      )}

      {revalidating && !loading && data.length > 0 && (
        <div
          className="px-4 py-1.5 bg-blue-50/70 border-b border-blue-100 flex items-center gap-2 text-[11px] font-medium text-blue-700"
          aria-live="polite"
        >
          <Loader2 className="w-3 h-3 animate-spin shrink-0" />
          <span>Menyinkronkan pembaruan dari Cloud Server...</span>
        </div>
      )}

      {/* Main Grid View: Table or Card Mode */}
      {viewMode === 'card' ? (
        <div className="p-4 min-h-[340px] bg-slate-50/60">
          {loading ? (
            <div className="space-y-3.5" aria-busy="true" aria-live="polite">
              <div className="px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl flex items-center gap-2.5 text-xs font-medium text-slate-600">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
                <span>{loadingMessage}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div key={idx} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                      <div className="h-4 skeleton-shimmer rounded w-2/5" />
                      <div className="h-6 skeleton-shimmer rounded w-14" />
                    </div>
                    <div className="h-5 skeleton-shimmer rounded w-4/5" />
                    <div className="grid grid-cols-2 gap-2.5 pt-2">
                      <div className="h-3.5 skeleton-shimmer rounded w-full" />
                      <div className="h-3.5 skeleton-shimmer rounded w-5/6" />
                      <div className="h-3.5 skeleton-shimmer rounded w-4/5" />
                      <div className="h-3.5 skeleton-shimmer rounded w-full" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : data.length === 0 ? (
            <div className="p-12 text-center text-slate-500 bg-white rounded-xl border border-slate-200">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <div className="text-sm font-semibold text-slate-800">Tidak ada data ditemukan</div>
              <div className="text-xs text-slate-500 mt-1">
                Coba sesuaikan kata kunci pencarian atau ubah filter data Anda.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {data.map((row, idx) => {
                const isSelected = selectedIds.includes(row.id);
                const primaryField = tableColumns[0];
                const secondaryField = tableColumns[1];
                const otherFields = tableColumns.slice(2);
                const realStatus = getRowStatusText(row);

                return (
                  <div
                    key={`${row.id || 'row'}_${idx}`}
                    className={`p-4 rounded-xl border transition-colors flex flex-col justify-between ${
                      isSelected
                        ? 'bg-blue-50/50 border-blue-400 ring-1 ring-blue-500/30'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3 mb-3">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => onToggleSelectRow(row.id)}
                            aria-label={`Pilih baris ${row.id}`}
                            className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 border-slate-300 w-4 h-4 cursor-pointer shrink-0"
                          />
                          <div className="min-w-0">
                            <span className="text-[11px] font-medium text-slate-400 block truncate">
                              {primaryField?.label}
                            </span>
                            <div className="text-xs font-bold text-slate-900 truncate mt-0.5">
                              {renderCellContent(primaryField, row)}
                            </div>
                          </div>
                        </div>

                        <RowActions
                          row={row}
                          customRowActions={customRowActions}
                          onCustomAction={onCustomAction}
                          onEdit={onEdit}
                          onDelete={onDelete}
                        />
                      </div>

                      {secondaryField && (
                        <div className="mb-3">
                          <span className="text-[11px] font-medium text-slate-400 block">
                            {secondaryField.label}
                          </span>
                          <div className="text-sm font-bold text-slate-900 mt-0.5">
                            {renderCellContent(secondaryField, row)}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2.5 text-xs pt-2 border-t border-slate-100">
                        {otherFields.map((col) => (
                          <div key={String(col.key)} className="space-y-0.5 min-w-0">
                            <span className="text-[11px] font-medium text-slate-400 block truncate">
                              {col.label}
                            </span>
                            <div className="text-slate-700 truncate font-medium text-xs">
                              {renderCellContent(col, row)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Footer: Real ID + Real Status (no hardcoded fake status) */}
                    <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                      <span className="font-mono tabular-nums truncate">ID: {row.id}</span>
                      {realStatus && (
                        <span className="text-slate-600 font-semibold truncate">
                          {realStatus}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Table responsive wrapper */
        <div className="overflow-x-auto min-h-[340px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-3.5 w-11 text-center">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={onToggleSelectAll}
                    aria-label="Pilih semua baris di halaman ini"
                    className="rounded text-blue-600 focus:ring-blue-500 border-slate-300 w-4 h-4 cursor-pointer"
                  />
                </th>

                {tableColumns.map((col) => {
                  const isSortable = col.isSortable !== false;
                  const isCurrentSort = sort.column === col.key;

                  return (
                    <th
                      key={String(col.key)}
                      onClick={() => isSortable && onSort(String(col.key))}
                      className={`py-3 px-3.5 select-none whitespace-nowrap ${
                        isSortable ? 'cursor-pointer hover:bg-slate-100/80 hover:text-slate-800 transition-colors' : ''
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>{col.label}</span>
                        {isSortable && (
                          <span className="text-slate-400">
                            {isCurrentSort ? (
                              sort.direction === 'asc' ? (
                                <ChevronUp className="w-3.5 h-3.5 text-blue-600" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5 text-blue-600" />
                              )
                            ) : (
                              <ChevronsUpDown className="w-3.5 h-3.5 opacity-40" />
                            )}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}

                <th className="py-3 px-3.5 text-right whitespace-nowrap w-auto">Aksi</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <>
                  <tr className="bg-blue-50/40">
                    <td colSpan={tableColumns.length + 2} className="py-2.5 px-4">
                      <div className="flex items-center gap-2.5 text-xs font-medium text-slate-600" aria-live="polite">
                        <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
                        <span>{loadingMessage}</span>
                      </div>
                    </td>
                  </tr>
                  {Array.from({ length: 5 }).map((_, rIdx) => (
                    <tr key={rIdx} className="bg-white">
                      <td className="py-3.5 px-3.5 text-center">
                        <div className="w-4 h-4 skeleton-shimmer rounded mx-auto" />
                      </td>
                      {tableColumns.map((col, cIdx) => (
                        <td key={String(col.key)} className="py-3.5 px-3.5">
                          <div
                            className={`h-4 skeleton-shimmer rounded ${
                              skeletonWidths[(rIdx + cIdx) % skeletonWidths.length]
                            }`}
                          />
                        </td>
                      ))}
                      <td className="py-3.5 px-3.5 text-right">
                        <div className="h-8 skeleton-shimmer rounded-lg w-20 ml-auto" />
                      </td>
                    </tr>
                  ))}
                </>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={tableColumns.length + 2} className="p-12 text-center text-slate-500">
                    <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <div className="text-sm font-semibold text-slate-800">Tidak ada data ditemukan</div>
                    <div className="text-xs text-slate-500 mt-1">
                      Coba sesuaikan kata kunci pencarian atau ubah filter data Anda.
                    </div>
                  </td>
                </tr>
              ) : (
                data.map((row, idx) => {
                  const isSelected = selectedIds.includes(row.id);
                  const openUpward = data.length >= 4 && idx >= data.length - 2;

                  return (
                    <tr
                      key={`${row.id || 'row'}_${idx}`}
                      className={`hover:bg-slate-50/90 transition-colors ${
                        isSelected ? 'bg-blue-50/50' : 'bg-white'
                      }`}
                    >
                      <td className="py-3 px-3.5 text-center align-middle">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => onToggleSelectRow(row.id)}
                          aria-label={`Pilih baris ${row.id}`}
                          className="rounded text-blue-600 focus:ring-blue-500 border-slate-300 w-4 h-4 cursor-pointer"
                        />
                      </td>

                      {tableColumns.map((col) => (
                        <td key={String(col.key)} className="py-3 px-3.5 text-slate-700 align-middle">
                          {renderCellContent(col, row)}
                        </td>
                      ))}

                      <td className="py-2.5 px-3.5 text-right align-middle whitespace-nowrap">
                        <RowActions
                          row={row}
                          customRowActions={customRowActions}
                          onCustomAction={onCustomAction}
                          onEdit={onEdit}
                          onDelete={onDelete}
                          openUpward={openUpward}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Ergonomic Pagination Bar */}
      <div className="border-t border-slate-200 px-4 py-3 bg-slate-50/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="font-medium text-slate-500">Tampilkan</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            aria-label="Jumlah baris per halaman"
            className="h-9 bg-white border border-slate-200 rounded-lg px-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer tabular-nums"
          >
            <option value={10}>10 baris</option>
            <option value={25}>25 baris</option>
            <option value={50}>50 baris</option>
            <option value={100}>100 baris</option>
          </select>
          <span className="text-slate-500 tabular-nums">
            {total > 0
              ? `Menampilkan ${(page - 1) * pageSize + 1}–${Math.min(
                  page * pageSize,
                  total
                )} dari ${total} data`
              : '0 data'}
          </span>
        </div>

        {/* Stepper buttons (36x36px) */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onPageChange(1)}
            disabled={page <= 1}
            className="w-9 h-9 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            title="Halaman Pertama"
            aria-label="Halaman Pertama"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="w-9 h-9 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            title="Sebelumnya"
            aria-label="Halaman Sebelumnya"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="h-9 px-3 rounded-lg bg-white border border-slate-200 font-semibold text-xs text-slate-800 inline-flex items-center tabular-nums">
            Hal {page} / {totalPages}
          </span>

          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="w-9 h-9 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            title="Berikutnya"
            aria-label="Halaman Berikutnya"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onPageChange(totalPages)}
            disabled={page >= totalPages}
            className="w-9 h-9 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            title="Halaman Terakhir"
            aria-label="Halaman Terakhir"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
