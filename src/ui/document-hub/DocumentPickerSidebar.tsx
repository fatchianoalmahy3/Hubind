import React, { useEffect } from 'react';
import {
  CheckCircle2,
  CheckSquare,
  ExternalLink,
  Filter,
  Lock,
  Search,
  SlidersHorizontal,
  Square,
  X,
} from 'lucide-react';
import { Guru, MONITORING_STAGES } from '../../core/types/schema';
import { getStageValueByNumber } from '../../core/utils/monitoringHelpers';
import { usePagination } from '../../hooks/usePagination';
import { PaginationBar } from '../PaginationBar';
import {
  BatchSuratTugasPage,
  BundlePrintPage,
  DocFilterMeta,
  DocMetaEntry,
  DocumentHubKey,
  DudiBundleItem,
  FilteredDocItem,
} from './documentHubConfig';

interface DocumentPickerSidebarProps {
  activeDocKey: DocumentHubKey;
  meta: DocMetaEntry;
  loading: boolean;
  isSidebarCollapsed: boolean;
  isMobilePickerModalOpen: boolean;
  paperSize: 'A4' | 'F4';
  nomorSurat: string;
  searchQuery: string;
  guruFilter: string;
  jurusanFilter: string;
  statusFilter: string;
  subFilter: string;
  guruList: Guru[];
  filterMeta: DocFilterMeta;
  filteredItems: FilteredDocItem[];
  activeItem: FilteredDocItem | null;
  checkedItemIds: Record<string, boolean>;
  checkedItems: FilteredDocItem[];
  isMultiCheckedMode: boolean;
  batchSuratTugasPages: BatchSuratTugasPage[];
  bundleStageNum: number;
  suratTugasStageNum: number;
  bundleGuruFilter: string;
  bundleIncludeSt: boolean;
  bundleIncludeMon: boolean;
  bundleIncludeNilai: boolean;
  bundleDudiItems: DudiBundleItem[];
  selectedBundles: DudiBundleItem[];
  checkedBundleKeys: Record<string, boolean>;
  bundlePrintPages: BundlePrintPage[];
  missingBundleTemplates: string[];
  generatedBundlePdf: { pdfUrl: string; fileName: string; totalSheets: number } | null;
  isTargetIssued?: (dudiId: string | undefined, namaDudi: string, tahap: number) => boolean;
  onChangeSearchQuery: (q: string) => void;
  onChangeGuruFilter: (v: string) => void;
  onChangeJurusanFilter: (v: string) => void;
  onChangeStatusFilter: (v: string) => void;
  onChangeSubFilter: (v: string) => void;
  onChangeBundleStage: (nextStage: number) => void;
  onChangeBundleGuruFilter: (v: string) => void;
  onChangeBundleIncludeSt: (v: boolean) => void;
  onChangeBundleIncludeMon: (v: boolean) => void;
  onChangeBundleIncludeNilai: (v: boolean) => void;
  onSetCheckedBundleKeys: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onSetCheckedItemIds: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onSelectId: (id: string) => void;
  onChangeMultiPreviewIdx: (idx: number) => void;
  onOpenParamModal: () => void;
  onOpenMobilePickerModal: () => void;
  onCloseMobilePickerModal: () => void;
  onResetAllFilters: () => void;
}

export const DocumentPickerSidebar: React.FC<DocumentPickerSidebarProps> = (props) => {
  const {
    activeDocKey,
    meta,
    loading,
    isSidebarCollapsed,
    isMobilePickerModalOpen,
    paperSize,
    nomorSurat,
    searchQuery,
    guruFilter,
    jurusanFilter,
    statusFilter,
    subFilter,
    guruList,
    filterMeta,
    filteredItems,
    activeItem,
    checkedItemIds,
    checkedItems,
    isMultiCheckedMode,
    batchSuratTugasPages,
    bundleStageNum,
    suratTugasStageNum,
    bundleGuruFilter,
    bundleIncludeSt,
    bundleIncludeMon,
    bundleIncludeNilai,
    bundleDudiItems,
    selectedBundles,
    checkedBundleKeys,
    bundlePrintPages,
    missingBundleTemplates,
    generatedBundlePdf,
    isTargetIssued,
    onChangeSearchQuery,
    onChangeGuruFilter,
    onChangeJurusanFilter,
    onChangeStatusFilter,
    onChangeSubFilter,
    onChangeBundleStage,
    onChangeBundleGuruFilter,
    onChangeBundleIncludeSt,
    onChangeBundleIncludeMon,
    onChangeBundleIncludeNilai,
    onSetCheckedBundleKeys,
    onSetCheckedItemIds,
    onSelectId,
    onChangeMultiPreviewIdx,
    onOpenParamModal,
    onOpenMobilePickerModal,
    onCloseMobilePickerModal,
    onResetAllFilters,
  } = props;

  const defaultStatusFilter = activeDocKey === 'doc_paket_monitoring' ? 'SIAP' : 'ALL';
  const activeFilterCount =
    (jurusanFilter !== 'ALL' ? 1 : 0) +
    (statusFilter !== defaultStatusFilter ? 1 : 0) +
    (subFilter !== 'ALL' ? 1 : 0) +
    (activeDocKey === 'doc_paket_monitoring'
      ? bundleGuruFilter !== 'ALL'
        ? 1
        : 0
      : guruFilter !== 'ALL'
      ? 1
      : 0) +
    (searchQuery.trim() ? 1 : 0);

  const bundlePagination = usePagination(bundleDudiItems, { defaultPageSize: 10 });
  const itemPagination = usePagination(filteredItems, { defaultPageSize: 10 });

  useEffect(() => {
    bundlePagination.resetPage();
  }, [
    activeDocKey,
    bundleStageNum,
    bundleGuruFilter,
    jurusanFilter,
    statusFilter,
    searchQuery,
    bundlePagination.resetPage,
  ]);

  useEffect(() => {
    itemPagination.resetPage();
  }, [
    activeDocKey,
    guruFilter,
    jurusanFilter,
    statusFilter,
    subFilter,
    searchQuery,
    itemPagination.resetPage,
  ]);

  const renderPickerPanelBody = (inModal: boolean) => {
    const outerClass = inModal
      ? 'flex flex-col gap-2.5 text-xs h-full min-h-0'
      : 'bg-white rounded-xl border border-slate-200 p-3.5 flex flex-col gap-2.5 text-xs max-h-[calc(100vh-110px)]';

    if (activeDocKey === 'doc_paket_monitoring') {
      return (
        <div className={outerClass}>
          <div className="flex items-center justify-between gap-2 shrink-0">
            <span className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
              Paket · {selectedBundles.length}/{bundleDudiItems.length} DUDI
            </span>
            <div className="flex items-center gap-2">
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={onResetAllFilters}
                  className="text-[11px] text-rose-600 hover:underline font-semibold cursor-pointer"
                >
                  Reset Filter
                </button>
              )}
              <button
                type="button"
                onClick={onOpenParamModal}
                className="text-[11px] text-blue-600 hover:underline font-semibold cursor-pointer"
              >
                Parameter ({paperSize})
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 shrink-0">
            <select
              value={bundleStageNum}
              onChange={(e) => onChangeBundleStage(Number(e.target.value) || 1)}
              aria-label="Tahap Kunjungan Monitoring"
              className="w-full h-8 px-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white font-semibold text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            >
              {MONITORING_STAGES.map((st) => (
                <option key={st.num} value={st.num}>
                  {st.value}
                </option>
              ))}
            </select>

            <select
              value={bundleGuruFilter}
              onChange={(e) => onChangeBundleGuruFilter(e.target.value)}
              aria-label="Filter Guru Pendamping"
              className="w-full h-8 px-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white font-semibold text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            >
              <option value="ALL">Semua Guru</option>
              {guruList.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nama}
                </option>
              ))}
            </select>

            <select
              value={jurusanFilter}
              onChange={(e) => onChangeJurusanFilter(e.target.value)}
              aria-label="Filter Jurusan"
              className="w-full h-8 px-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white font-semibold text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            >
              <option value="ALL">{filterMeta.jurusanLabel}</option>
              {filterMeta.jurusanOptions.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => onChangeStatusFilter(e.target.value)}
              aria-label="Filter Status Kesiapan"
              className="w-full h-8 px-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white font-semibold text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            >
              <option value="ALL">Semua Status</option>
              <option value="SIAP">Siap Cetak</option>
              <option value="TERKUNCI">Terkunci</option>
            </select>
          </div>

          <div className="grid grid-cols-3 gap-1.5 shrink-0">
            <label
              className={`flex items-center justify-center gap-1.5 h-8 px-2 rounded-lg border text-[11px] font-semibold cursor-pointer select-none transition-colors ${
                bundleIncludeSt
                  ? 'bg-blue-50 border-blue-300 text-blue-900'
                  : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}
            >
              <input
                type="checkbox"
                checked={bundleIncludeSt}
                onChange={(e) => onChangeBundleIncludeSt(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              <span>S. Tugas</span>
            </label>
            <label
              className={`flex items-center justify-center gap-1.5 h-8 px-2 rounded-lg border text-[11px] font-semibold cursor-pointer select-none transition-colors ${
                bundleIncludeMon
                  ? 'bg-blue-50 border-blue-300 text-blue-900'
                  : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}
            >
              <input
                type="checkbox"
                checked={bundleIncludeMon}
                onChange={(e) => onChangeBundleIncludeMon(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              <span>Monitor</span>
            </label>
            <label
              className={`flex items-center justify-center gap-1.5 h-8 px-2 rounded-lg border text-[11px] font-semibold cursor-pointer select-none transition-colors ${
                bundleIncludeNilai
                  ? 'bg-blue-50 border-blue-300 text-blue-900'
                  : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}
            >
              <input
                type="checkbox"
                checked={bundleIncludeNilai}
                onChange={(e) => onChangeBundleIncludeNilai(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              <span>Nilai</span>
            </label>
          </div>

          {missingBundleTemplates.length > 0 && (
            <div className="px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-[10.5px] text-amber-900 shrink-0">
              Template Docs belum dipasang: <b>{missingBundleTemplates.join(', ')}</b> (Cetak browser tetap siap).
            </div>
          )}

          {generatedBundlePdf && (
            <div className="p-2.5 rounded-lg border border-emerald-200 bg-emerald-50 text-[11px] text-emerald-900 flex items-center justify-between gap-2 shrink-0">
              <div className="min-w-0">
                <div className="font-bold truncate">
                  PDF Drive Siap ({generatedBundlePdf.totalSheets} hal)
                </div>
                <div className="font-mono text-[10px] truncate text-emerald-700">
                  {generatedBundlePdf.fileName}
                </div>
              </div>
              <a
                href={generatedBundlePdf.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Buka</span>
              </a>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1 border-t border-slate-100 shrink-0">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onChangeSearchQuery(e.target.value)}
                placeholder="Cari DUDI, guru, siswa..."
                className="w-full h-8 pl-8 pr-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                const m: Record<string, boolean> = {};
                bundleDudiItems.forEach((b) => {
                  if (!b.isLocked) m[b.bundleKey] = true;
                });
                onSetCheckedBundleKeys(m);
              }}
              className="text-[11px] font-semibold text-blue-700 hover:underline shrink-0 cursor-pointer"
            >
              Semua
            </button>
            <button
              type="button"
              onClick={() => onSetCheckedBundleKeys({})}
              className="text-[11px] font-semibold text-slate-500 hover:underline shrink-0 cursor-pointer"
            >
              Reset
            </button>
          </div>

          <div className="flex-1 min-h-[160px] overflow-y-auto space-y-1 pr-0.5">
            {loading ? (
              <div className="py-6 text-center text-xs text-slate-400">
                Memuat daftar penempatan &amp; monitoring...
              </div>
            ) : bundleDudiItems.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg p-3">
                Tidak ada penempatan DUDI aktif untuk filter ini.
              </div>
            ) : (
              bundlePagination.paginatedItems.map((b) => {
                const isChecked = !b.isLocked && Boolean(checkedBundleKeys[b.bundleKey]);
                const isIssued = Boolean(isTargetIssued?.(b.dudiId, b.namaDudi, bundleStageNum));
                const sheetCountForDudi =
                  (bundleIncludeSt ? 1 : 0) +
                  (bundleIncludeMon ? 1 : 0) +
                  (bundleIncludeNilai ? b.students.length : 0);
                return (
                  <button
                    type="button"
                    key={b.bundleKey}
                    disabled={b.isLocked}
                    title={
                      b.isLocked
                        ? `Terkunci: ${b.pendingStudents.join(', ')} belum selesai Tahap ${bundleStageNum - 1}`
                        : `${b.namaDudi} · Guru: ${b.guruNama}${isIssued ? ` · Surat Tahap ${bundleStageNum} Sudah Terbit` : ''}`
                    }
                    onClick={() =>
                      onSetCheckedBundleKeys((prev) => ({
                        ...prev,
                        [b.bundleKey]: !prev[b.bundleKey],
                      }))
                    }
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-2 ${
                      b.isLocked
                        ? 'bg-amber-50/70 border-amber-200 opacity-85 cursor-not-allowed'
                        : isChecked
                        ? 'bg-blue-50 border-blue-400 cursor-pointer'
                        : 'bg-slate-50/70 border-slate-200 hover:bg-white cursor-pointer'
                    }`}
                  >
                    <div className="shrink-0">
                      {b.isLocked ? (
                        <Lock className="w-3.5 h-3.5 text-amber-600" />
                      ) : isChecked ? (
                        <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-900">
                      {b.namaDudi}
                    </div>
                    {isIssued && (
                      <span
                        title={`Surat Tahap ${bundleStageNum} sudah terbit`}
                        className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700"
                      >
                        <CheckCircle2 className="w-3 h-3 shrink-0" />
                        <span>Terbit</span>
                      </span>
                    )}
                    <span className="shrink-0 text-[10.5px] font-medium text-slate-500 tabular-nums">
                      {b.isLocked
                        ? `Kunci T${bundleStageNum - 1}`
                        : `${b.students.length}sw·${sheetCountForDudi}lbr`}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {bundleDudiItems.length > 0 && (
            <PaginationBar
              compact
              page={bundlePagination.page}
              pageSize={bundlePagination.pageSize}
              total={bundlePagination.total}
              onPageChange={bundlePagination.setPage}
              onPageSizeChange={bundlePagination.setPageSize}
              pageSizeOptions={bundlePagination.pageSizeOptions}
              itemLabel="DUDI"
              className="rounded-b-lg shrink-0"
            />
          )}
        </div>
      );
    }

    return (
      <div className={outerClass}>
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 shrink-0">
          <div className="min-w-0 truncate text-[11px] text-slate-600">
            <span className="font-bold text-slate-900">{paperSize}</span>
            <span className="mx-1 text-slate-300">·</span>
            <span className="font-mono text-slate-700">{nomorSurat}</span>
          </div>
          <button
            type="button"
            onClick={onOpenParamModal}
            className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline font-semibold shrink-0 cursor-pointer"
          >
            <SlidersHorizontal className="w-3 h-3" />
            <span>Ubah</span>
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 shrink-0">
          <h3 className="text-[11px] font-bold text-slate-900 uppercase tracking-wider tabular-nums">
            {activeDocKey === 'doc_pengantaran' ||
            activeDocKey === 'doc_monitoring' ||
            activeDocKey === 'doc_penarikan'
              ? `DUDI (${filteredItems.length})`
              : `Data (${filteredItems.length})`}
            {checkedItems.length > 0 && (
              <span className="ml-1.5 text-blue-600">· {checkedItems.length} dipilih</span>
            )}
          </h3>
          <div className="flex items-center gap-2 shrink-0">
            {activeFilterCount > 0 && (
              <>
                <button
                  type="button"
                  onClick={onResetAllFilters}
                  className="text-[11px] font-semibold text-rose-600 hover:underline cursor-pointer"
                >
                  Reset Filter
                </button>
                <span className="text-slate-300">·</span>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                const next: Record<string, boolean> = {};
                filteredItems.forEach((it) => {
                  next[it.id] = true;
                });
                onSetCheckedItemIds(next);
                onChangeMultiPreviewIdx(0);
              }}
              className="text-[11px] font-semibold text-blue-700 hover:underline cursor-pointer"
            >
              Pilih Semua
            </button>
            {checkedItems.length > 0 && (
              <>
                <span className="text-slate-300">·</span>
                <button
                  type="button"
                  onClick={() => {
                    onSetCheckedItemIds({});
                    onChangeMultiPreviewIdx(0);
                  }}
                  className="text-[11px] font-semibold text-slate-500 hover:underline cursor-pointer"
                >
                  Kosongkan
                </button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5 shrink-0">
          {filterMeta.jurusanOptions.length > 0 && (
            <select
              value={jurusanFilter}
              onChange={(e) => {
                onChangeJurusanFilter(e.target.value);
                onChangeMultiPreviewIdx(0);
              }}
              aria-label="Filter Jurusan"
              className="w-full h-8 px-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-[11px] font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            >
              <option value="ALL">{filterMeta.jurusanLabel}</option>
              {filterMeta.jurusanOptions.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
          )}

          {(activeDocKey === 'doc_pengantaran' ||
            activeDocKey === 'doc_monitoring' ||
            activeDocKey === 'doc_penarikan') && (
            <select
              value={guruFilter}
              onChange={(e) => {
                onChangeGuruFilter(e.target.value);
                onChangeMultiPreviewIdx(0);
              }}
              aria-label="Filter Guru Pendamping"
              className="w-full h-8 px-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-[11px] font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            >
              <option value="ALL">Semua Guru</option>
              {guruList.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nama}
                </option>
              ))}
            </select>
          )}

          {filterMeta.statusOptions.length > 0 && (
            <select
              value={statusFilter}
              onChange={(e) => {
                onChangeStatusFilter(e.target.value);
                onChangeMultiPreviewIdx(0);
              }}
              aria-label="Filter Status"
              className="w-full h-8 px-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-[11px] font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            >
              <option value="ALL">{filterMeta.statusLabel}</option>
              {filterMeta.statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}

          {filterMeta.subOptions.length > 0 && (
            <select
              value={subFilter}
              onChange={(e) => {
                onChangeSubFilter(e.target.value);
                onChangeMultiPreviewIdx(0);
              }}
              aria-label="Filter Tambahan"
              className="w-full h-8 px-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-[11px] font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/30 col-span-2"
            >
              <option value="ALL">{filterMeta.subLabel}</option>
              {filterMeta.subOptions.map((sb) => (
                <option key={sb} value={sb}>
                  {sb}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="relative shrink-0">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onChangeSearchQuery(e.target.value)}
            placeholder={
              activeDocKey === 'doc_pengantaran' ||
              activeDocKey === 'doc_monitoring' ||
              activeDocKey === 'doc_penarikan'
                ? 'Cari DUDI, guru, atau siswa...'
                : 'Cari nama, NIS, atau DUDI...'
            }
            className="w-full h-8 pl-8 pr-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>

        <div className="flex-1 min-h-[160px] overflow-y-auto space-y-1 pr-0.5">
          {loading ? (
            <div className="py-6 text-center text-xs text-slate-400">
              Membaca data langsung dari Cloud Server...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg p-3">
              Tidak ada data yang sesuai dengan filter.
            </div>
          ) : (
            itemPagination.paginatedItems.map((item, idx) => {
              const isChecked = Boolean(checkedItemIds[item.id]);
              const isFocused = !isMultiCheckedMode && activeItem?.id === item.id;
              const targetStageForDoc =
                activeDocKey === 'doc_pengantaran'
                  ? 1
                  : activeDocKey === 'doc_penarikan'
                  ? 8
                  : activeDocKey === 'doc_monitoring'
                  ? suratTugasStageNum
                  : 0;
              const isIssued =
                targetStageForDoc > 0 &&
                Boolean(isTargetIssued?.(item.dudiId, item.title, targetStageForDoc));
              return (
                <div
                  key={`${item.id || 'doc'}_${idx}`}
                  title={item.subtitle}
                  className={`w-full px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-2 ${
                    isChecked
                      ? 'bg-blue-50 border-blue-400'
                      : isFocused
                      ? 'bg-slate-100 border-slate-400'
                      : 'bg-slate-50/70 border-slate-200 hover:bg-white hover:border-slate-300'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSetCheckedItemIds((prev) => ({
                        ...prev,
                        [item.id]: !prev[item.id],
                      }));
                      onChangeMultiPreviewIdx(0);
                    }}
                    className="shrink-0 text-slate-500 hover:text-blue-600 cursor-pointer flex items-center"
                    aria-label={`Centang ${item.title} untuk cetak massal`}
                  >
                    {isChecked ? (
                      <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onSelectId(item.id);
                      if (isMultiCheckedMode) {
                        if (activeDocKey === 'doc_surat_tugas') {
                          const foundIdx = batchSuratTugasPages.findIndex(
                            (p) => p.itemId === item.id
                          );
                          if (foundIdx >= 0) onChangeMultiPreviewIdx(foundIdx);
                        } else {
                          const foundIdx = checkedItems.findIndex((c) => c.id === item.id);
                          if (foundIdx >= 0) onChangeMultiPreviewIdx(foundIdx);
                        }
                      }
                    }}
                    className="min-w-0 flex-1 text-left flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span className="text-xs font-semibold text-slate-900 truncate">
                      {item.title}
                    </span>
                    <div className="shrink-0 flex items-center gap-1.5">
                      {isIssued && (
                        <span
                          title={`Surat Tahap ${targetStageForDoc} sudah terbit`}
                          className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700"
                        >
                          <CheckCircle2 className="w-3 h-3 shrink-0" />
                          <span>Terbit</span>
                        </span>
                      )}
                      <span className="text-[10.5px] font-medium text-slate-500 tabular-nums">
                        {item.badge}
                      </span>
                    </div>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {filteredItems.length > 0 && (
          <PaginationBar
            compact
            page={itemPagination.page}
            pageSize={itemPagination.pageSize}
            total={itemPagination.total}
            onPageChange={itemPagination.setPage}
            onPageSizeChange={itemPagination.setPageSize}
            pageSizeOptions={itemPagination.pageSizeOptions}
            itemLabel="data"
            className="rounded-b-lg shrink-0"
          />
        )}
      </div>
    );
  };

  return (
    <>
      {!isSidebarCollapsed && (
        <div className="hidden lg:block lg:col-span-4 lg:sticky lg:top-4 no-print">
          {renderPickerPanelBody(false)}
        </div>
      )}

      <div className="lg:hidden col-span-1 bg-white rounded-xl border border-slate-200 p-2.5 flex items-center gap-2 no-print">
        {activeDocKey === 'doc_paket_monitoring' ? (
          <div className="flex-1 min-w-0 text-xs text-slate-700 truncate">
            <span className="font-bold text-slate-900">
              {getStageValueByNumber(bundleStageNum)}
            </span>
            <span className="mx-1.5 text-slate-300">·</span>
            <span className="tabular-nums">
              {selectedBundles.length} DUDI ({bundlePrintPages.length} lbr)
            </span>
          </div>
        ) : (
          <select
            value={activeItem?.id || ''}
            onChange={(e) => {
              onSelectId(e.target.value);
              onSetCheckedItemIds({});
            }}
            aria-label="Pilih 1 data cepat"
            className="flex-1 min-w-0 h-9 px-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            {filteredItems.length === 0 ? (
              <option value="">Tidak ada data</option>
            ) : (
              filteredItems.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.title} ({it.badge})
                </option>
              ))
            )}
          </select>
        )}

        <button
          type="button"
          onClick={onOpenMobilePickerModal}
          className="h-9 shrink-0 inline-flex items-center gap-1.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
        >
          <Filter className="w-3.5 h-3.5" />
          <span>
            Filter &amp; Massal
            {(activeDocKey === 'doc_paket_monitoring'
              ? selectedBundles.length
              : checkedItems.length) > 0 &&
              ` (${
                activeDocKey === 'doc_paket_monitoring'
                  ? selectedBundles.length
                  : checkedItems.length
              })`}
          </span>
        </button>
      </div>

      {isMobilePickerModalOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 backdrop-blur-xs no-print"
          onClick={onCloseMobilePickerModal}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 w-full sm:max-w-lg h-[82vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <div className="font-bold text-sm text-slate-900">
                Filter &amp; Pilih Data ({meta.shortTitle})
              </div>
              <button
                type="button"
                onClick={onCloseMobilePickerModal}
                className="w-8 h-8 rounded-lg text-slate-500 hover:bg-slate-200/70 flex items-center justify-center cursor-pointer"
                aria-label="Tutup popup pilih data"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 flex-1 min-h-0 overflow-hidden">{renderPickerPanelBody(true)}</div>
            <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex justify-end shrink-0">
              <button
                type="button"
                onClick={onCloseMobilePickerModal}
                className="h-9 px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
              >
                Lihat Pratinjau
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
