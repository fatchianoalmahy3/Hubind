import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Filter,
  RefreshCw,
  FileSpreadsheet,
  Plus,
  Layers,
  Sparkles,
  FileText,
  Code2,
  LayoutGrid,
  Table,
  Link2,
  MoreHorizontal,
  ChevronDown,
  X,
  BarChart3,
  Printer,
  Lock,
  Download,
  UserPlus,
} from 'lucide-react';

interface ToolbarProps {
  search: string;
  onSearchChange: (q: string) => void;
  searchPlaceholder?: string;
  activeFilterCount: number;
  onOpenFilterModal: () => void;
  selectedCount: number;
  onOpenBulkModal: () => void;
  onSyncSpreadsheet: () => void;
  syncing: boolean;
  onOpenImportModal: () => void;
  onExportAllXlsx?: () => void;
  onOpenAddModal: () => void;
  onOpenDocsModal?: () => void;
  onOpenSimulatorModal?: () => void;
  onOpenGasModal?: () => void;
  onSyncRelations?: () => void;
  onOpenMonitoringRecap?: () => void;
  onOpenMonitoringBundle?: () => void;
  onOpenStageControl?: () => void;
  onOpenBulkPlotting?: () => void;
  syncingRelations?: boolean;
  canAdd?: boolean;
  readOnly?: boolean;
  viewMode?: 'table' | 'card';
  onViewModeChange?: (mode: 'table' | 'card') => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  search,
  onSearchChange,
  searchPlaceholder,
  activeFilterCount,
  onOpenFilterModal,
  selectedCount,
  onOpenBulkModal,
  onSyncSpreadsheet,
  syncing,
  onOpenImportModal,
  onExportAllXlsx,
  onOpenAddModal,
  onOpenDocsModal,
  onOpenSimulatorModal,
  onOpenGasModal,
  onSyncRelations,
  onOpenMonitoringRecap,
  onOpenMonitoringBundle,
  onOpenStageControl,
  onOpenBulkPlotting,
  syncingRelations = false,
  canAdd = true,
  readOnly = false,
  viewMode = 'card',
  onViewModeChange,
}) => {
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const toolsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!toolsMenuOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) {
        setToolsMenuOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setToolsMenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [toolsMenuOpen]);

  const hasLeftWorkflowActions =
    selectedCount > 0 ||
    Boolean(onOpenBulkPlotting) ||
    Boolean(onOpenMonitoringBundle) ||
    Boolean(onOpenMonitoringRecap) ||
    Boolean(onOpenStageControl);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col gap-2.5">
      {/* Row 1: Search, Filter & Segmented View Switcher (Isolated from action bar so it never collides) */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder || 'Cari data...'}
            className="w-full h-9 pl-9 pr-8 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 focus:bg-white transition-colors placeholder:text-slate-400"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="w-7 h-7 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center cursor-pointer transition-colors"
              title="Bersihkan pencarian"
              aria-label="Bersihkan pencarian"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onOpenFilterModal}
          className={`h-9 px-3.5 text-xs font-semibold rounded-lg border transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
            activeFilterCount > 0
              ? 'bg-blue-50 border-blue-300 text-blue-700'
              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
          title="Filter Data"
        >
          <Filter className="w-3.5 h-3.5 shrink-0" />
          <span>Filter</span>
          {activeFilterCount > 0 && (
            <span className="ml-0.5 px-1.5 py-0.5 rounded bg-blue-600 text-white text-[11px] font-bold leading-none tabular-nums">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Segmented View Toggle (Exact h-9 = 36px height to match adjacent controls) */}
        {onViewModeChange && (
          <div
            className="h-9 inline-flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200 shrink-0"
            role="group"
            aria-label="Mode tampilan data"
          >
            <button
              type="button"
              onClick={() => onViewModeChange('table')}
              className={`h-full px-3 rounded-md text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                viewMode === 'table'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Tampilan Tabel"
            >
              <Table className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Tabel</span>
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('card')}
              className={`h-full px-3 rounded-md text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                viewMode === 'card'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Tampilan Kartu"
            >
              <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Kartu</span>
            </button>
          </div>
        )}
      </div>

      {/* Row 2: Standardized Action Bar (Contextual Left + Universal Right) */}
      <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
        {hasLeftWorkflowActions && (
          <div className="flex flex-wrap items-center gap-2">
            {selectedCount > 0 && (
              <button
                type="button"
                onClick={onOpenBulkModal}
                className="h-9 px-3.5 text-xs font-semibold rounded-lg bg-slate-900 hover:bg-slate-800 text-white transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/40"
              >
                <Layers className="w-3.5 h-3.5 shrink-0" />
                <span>Aksi Massal ({selectedCount})</span>
              </button>
            )}

            {onOpenBulkPlotting && (
              <button
                type="button"
                onClick={onOpenBulkPlotting}
                className="h-9 px-3.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                title="Plotting Massal 1-Langkah: Pilih 1 DUDI dan beberapa siswa sekaligus"
              >
                <UserPlus className="w-3.5 h-3.5 shrink-0" />
                <span>Plotting Massal</span>
              </button>
            )}

            {onOpenMonitoringBundle && (
              <button
                type="button"
                onClick={onOpenMonitoringBundle}
                className="h-9 px-3.5 text-xs font-semibold rounded-lg bg-slate-900 hover:bg-slate-800 text-white transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/40"
                title="Cetak Paket Surat Tugas, Lembar Monitoring & Penilaian Kurmer (1-Langkah)"
              >
                <Printer className="w-3.5 h-3.5 shrink-0" />
                <span>Paket Cetak Berkas</span>
              </button>
            )}

            {onOpenMonitoringRecap && (
              <button
                type="button"
                onClick={onOpenMonitoringRecap}
                className="h-9 px-3.5 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                title="Rekap Monitoring Per Jurusan & Info ke Kakomli"
              >
                <BarChart3 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Rekap &amp; Info Kakomli</span>
              </button>
            )}

            {onOpenStageControl && (
              <button
                type="button"
                onClick={onOpenStageControl}
                className="h-9 px-3.5 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                title="Kunci atau Buka Tahapan Monitoring (Khusus SuperAdmin)"
              >
                <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Kunci Tahapan</span>
              </button>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 ml-auto">
          {/* Secondary Action: Sync Active Cloud Table */}
          <button
            type="button"
            onClick={onSyncSpreadsheet}
            disabled={syncing}
            className="h-9 px-3.5 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            title="Muat ulang data terbaru dari Cloud Server"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 shrink-0 ${
                syncing ? 'animate-spin text-blue-600' : 'text-slate-500'
              }`}
            />
            <span>{syncing ? 'Menyinkronkan...' : 'Segarkan Data'}</span>
          </button>

          {/* Secondary Tools Overflow Dropdown */}
          <div className="relative shrink-0" ref={toolsMenuRef}>
            <button
              type="button"
              onClick={() => setToolsMenuOpen((prev) => !prev)}
              aria-expanded={toolsMenuOpen}
              aria-haspopup="menu"
              className={`h-9 px-3.5 text-xs font-semibold rounded-lg border transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                toolsMenuOpen
                  ? 'bg-slate-100 border-slate-300 text-slate-900'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <MoreHorizontal className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span>Alat Lainnya</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${
                  toolsMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {toolsMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-1.5 w-64 bg-white rounded-xl border border-slate-200 shadow-lg py-1.5 z-30"
              >
                {!readOnly && onSyncRelations && (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={syncingRelations}
                    onClick={() => {
                      setToolsMenuOpen(false);
                      onSyncRelations();
                    }}
                    className="w-full min-h-10 px-3.5 py-2 text-left text-xs hover:bg-slate-50 flex items-center gap-2.5 text-slate-700 disabled:opacity-50 cursor-pointer"
                  >
                    <Link2
                      className={`w-4 h-4 text-blue-600 shrink-0 ${
                        syncingRelations ? 'animate-spin' : ''
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900">
                        {syncingRelations ? 'Menghitung Relasi...' : 'Sinkronisasi Relasi Data'}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        Hitung ulang Siswa, DUDI, Guru &amp; Kelas
                      </div>
                    </div>
                  </button>
                )}

                {!readOnly && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setToolsMenuOpen(false);
                      onOpenImportModal();
                    }}
                    className="w-full min-h-10 px-3.5 py-2 text-left text-xs hover:bg-slate-50 flex items-center gap-2.5 text-slate-700 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900">Import Excel (.xlsx / .csv)</div>
                      <div className="text-[11px] text-slate-500 truncate">
                        Unggah 1 sheet atau Workbook 6-Sheet
                      </div>
                    </div>
                  </button>
                )}

                {onExportAllXlsx && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setToolsMenuOpen(false);
                      onExportAllXlsx();
                    }}
                    className="w-full min-h-10 px-3.5 py-2 text-left text-xs hover:bg-slate-50 flex items-center gap-2.5 text-slate-700 cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-blue-600 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900">Export Data (.xlsx)</div>
                      <div className="text-[11px] text-slate-500 truncate">
                        Unduh tabel tampil ke Excel (.xlsx)
                      </div>
                    </div>
                  </button>
                )}

                {onOpenDocsModal && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setToolsMenuOpen(false);
                      onOpenDocsModal();
                    }}
                    className="w-full min-h-10 px-3.5 py-2 text-left text-xs hover:bg-slate-50 flex items-center gap-2.5 text-slate-700 cursor-pointer"
                  >
                    <FileText className="w-4 h-4 text-amber-600 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900">Cetak Dokumen Massal</div>
                      <div className="text-[11px] text-slate-500 truncate">
                        Surat pengajuan, izin, pengantaran &amp; sertifikat
                      </div>
                    </div>
                  </button>
                )}

                {(onOpenSimulatorModal || onOpenGasModal) && (
                  <div className="my-1 border-t border-slate-100" />
                )}

                {onOpenSimulatorModal && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setToolsMenuOpen(false);
                      onOpenSimulatorModal();
                    }}
                    className="w-full min-h-10 px-3.5 py-2 text-left text-xs hover:bg-slate-50 flex items-center gap-2.5 text-slate-700 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-slate-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900">Simulasi Portal Siswa</div>
                      <div className="text-[11px] text-slate-500 truncate">
                        Uji alur dropdown Jurusan → Kelas → Siswa
                      </div>
                    </div>
                  </button>
                )}

                {onOpenGasModal && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setToolsMenuOpen(false);
                      onOpenGasModal();
                    }}
                    className="w-full min-h-10 px-3.5 py-2 text-left text-xs hover:bg-slate-50 flex items-center gap-2.5 text-slate-700 cursor-pointer"
                  >
                    <Code2 className="w-4 h-4 text-slate-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900">Integrasi API Server</div>
                      <div className="text-[11px] text-slate-500 truncate">
                        Konfigurasi skrip konektor Cloud Server
                      </div>
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Single Primary CTA */}
          {canAdd && (
            <button
              type="button"
              onClick={onOpenAddModal}
              className="h-9 px-3.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>Tambah Data</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
