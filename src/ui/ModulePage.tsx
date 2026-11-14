import React, { useState } from 'react';
import { ModuleMetadata } from '../core/types/metadata';
import { BaseRepository } from '../core/BaseRepository';
import { useDataGrid } from '../hooks/useDataGrid';
import { StatCards } from './StatCards';
import { Toolbar } from './Toolbar';
import { DynamicDataGrid } from './DynamicDataGrid';
import { DynamicFormModal } from './DynamicFormModal';
import { DynamicFilterModal } from './DynamicFilterModal';
import { BulkActionModal } from './BulkActionModal';
import { ImportExcelModal } from './ImportExcelModal';
import { ImageCropperModal } from './ImageCropperModal';
import { AppleConfirmModal } from './AppleConfirmModal';
import { UserRole } from '../core/types/schema';
import {
  CheckCircle2,
  XCircle,
  Printer,
  Calendar,
  FileSpreadsheet,
  AlertTriangle,
  RefreshCw,
  FileCheck,
  UserCheck,
  Send,
  X,
} from 'lucide-react';
import { PengajuanService } from '../services/PengajuanService';
import { PerizinanService } from '../services/PerizinanService';
import { GuruService } from '../services/GuruService';
import { RelationSyncService } from '../services/RelationSyncService';
import { Guru } from '../core/types/schema';
import { ToastManager } from '../core/ToastManager';

interface ModulePageProps<T extends { id: string }> {
  metadata: ModuleMetadata<T>;
  repository: BaseRepository<T>;
  userRole: UserRole;
  onOpenDocsForStudent?: (studentData: any, selectedStudents?: any[], allStudents?: any[]) => void;
  onOpenSimulator?: () => void;
  onOpenGas?: () => void;
  onOpenSheetConfig?: () => void;
}

export function ModulePage<T extends { id: string }>({
  metadata,
  repository,
  userRole,
  onOpenDocsForStudent,
  onOpenSimulator,
  onOpenGas,
  onOpenSheetConfig,
}: ModulePageProps<T>) {
  const {
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
    deleteRow,
    bulkDeleteRows,
    syncWithSpreadsheet,
    syncing,
    refresh,
  } = useDataGrid<T>(repository);

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<T | null>(null);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Responsive viewMode: Default to 'card' on smartphone and tablet (< 1024px), 'table' on desktop
  const [viewMode, setViewMode] = useState<'table' | 'card'>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 1024 ? 'card' : 'table';
    }
    return 'card';
  });

  // Confirmation modal state (Apple Style)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    variant: 'primary' | 'danger' | 'success';
    confirmText: string;
    onConfirm: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    description: '',
    variant: 'primary',
    confirmText: 'Konfirmasi',
    onConfirm: async () => {},
  });

  // Image Cropper modal state
  const [cropperState, setCropperState] = useState<{
    isOpen: boolean;
    currentImage: string;
    onDone: (url: string) => void;
  }>({
    isOpen: false,
    currentImage: '',
    onDone: () => {},
  });

  // Action prompt modal state (Apple Style replacement for window.prompt)
  const [actionModal, setActionModal] = useState<{
    isOpen: boolean;
    type: 'reject_kakomli' | 'schedule_hubin' | 'promote_to_pkl' | null;
    row: any | null;
    reason: string;
    guruPendamping: string;
    tanggalBerangkat: string;
    tanggalRencanaTarik: string;
    submitting: boolean;
  }>({
    isOpen: false,
    type: null,
    row: null,
    reason: 'Kompetensi tidak linier',
    guruPendamping: '',
    tanggalBerangkat: new Date().toISOString().split('T')[0],
    tanggalRencanaTarik: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    submitting: false,
  });
  const [guruList, setGuruList] = useState<Guru[]>([]);
  const [syncingRelations, setSyncingRelations] = useState(false);

  const isRelationalModule = ['dudi', 'guru', 'siswa_pkl', 'jurusan', 'kelas', 'siswa'].includes(
    metadata.id
  );

  const handleSyncRelations = async () => {
    setSyncingRelations(true);
    try {
      const summary = await RelationSyncService.getInstance().recalculateAllRelations({
        backfillIds: true,
      });
      await refresh();
      const totalChanges =
        summary.updatedPlacements +
        summary.updatedDudi +
        summary.updatedGuru +
        summary.updatedJurusan +
        summary.updatedKelas;

      ToastManager.getInstance().show(
        'Relasi Data Tersinkron',
        'success',
        totalChanges > 0
          ? `Diperbarui: ${summary.updatedPlacements} plotting, ${summary.updatedDudi} DUDI, ${summary.updatedGuru} guru, ${summary.updatedJurusan} jurusan, ${summary.updatedKelas} kelas.`
          : 'Semua relasi Siswa, DUDI, Guru, Jurusan & Kelas sudah konsisten.'
      );
    } catch (err: any) {
      ToastManager.getInstance().show(
        'Gagal Sinkronisasi Relasi',
        'error',
        err?.message || 'Periksa koneksi Google Spreadsheet dan coba kembali.'
      );
    } finally {
      setSyncingRelations(false);
    }
  };

  const loadGuruOptions = async () => {
    try {
      const list = await GuruService.getInstance().getAll();
      setGuruList(list);
    } catch {
      setGuruList([]);
    }
  };

  const activeFilterCount = Object.keys(filter).length;

  // Custom row actions based on module
  const customRowActions: any[] = [];

  if (metadata.id === 'pengajuan') {
    if (userRole === 'Kakomli' || userRole === 'Hubin') {
      customRowActions.push({
        name: 'approve_kakomli',
        label: 'ACC Kakomli',
        icon: CheckCircle2,
        color: 'hover:text-emerald-600 hover:bg-emerald-50 text-emerald-600',
      });
      customRowActions.push({
        name: 'reject_kakomli',
        label: 'Tolak',
        icon: XCircle,
        color: 'hover:text-rose-600 hover:bg-rose-50 text-rose-500',
      });
      customRowActions.push({
        name: 'create_perizinan',
        label: 'Buat Berkas Perizinan',
        icon: FileCheck,
        color: 'hover:text-indigo-600 hover:bg-indigo-50 text-indigo-600',
      });
    }
    if (userRole === 'Hubin') {
      customRowActions.push({
        name: 'schedule_hubin',
        label: 'Jadwalkan',
        icon: Calendar,
        color: 'hover:text-blue-600 hover:bg-blue-50 text-blue-600',
      });
    }
  }

  if (metadata.id === 'perizinan') {
    if (userRole === 'Hubin' || userRole === 'Kakomli') {
      customRowActions.push({
        name: 'mark_ortu_ok',
        label: 'Izin Ortu OK',
        icon: UserCheck,
        color: 'hover:text-sky-600 hover:bg-sky-50 text-sky-600',
      });
      customRowActions.push({
        name: 'mark_dudi_accepted',
        label: 'Diterima DUDI',
        icon: CheckCircle2,
        color: 'hover:text-emerald-600 hover:bg-emerald-50 text-emerald-600',
      });
      customRowActions.push({
        name: 'promote_to_pkl',
        label: 'Terbitkan ke Data Siswa PKL',
        icon: Send,
        color: 'hover:text-blue-600 hover:bg-blue-50 text-blue-600',
      });
    }
    if (onOpenDocsForStudent) {
      customRowActions.push({
        name: 'print_docs',
        label: 'Cetak Surat',
        icon: Printer,
        color: 'hover:text-amber-600 hover:bg-amber-50 text-amber-600',
      });
    }
  }

  if (metadata.id === 'siswa_pkl' || metadata.id === 'sertifikat') {
    customRowActions.push({
      name: 'print_docs',
      label: 'Cetak Dokumen',
      icon: Printer,
      color: 'hover:text-amber-600 hover:bg-amber-50 text-amber-600',
    });
  }

  const handleCustomAction = async (actionName: string, row: T) => {
    const item = row as any;

    if (actionName === 'approve_kakomli') {
      setConfirmModal({
        isOpen: true,
        title: 'Setujui Pengajuan Siswa (ACC Kakomli)?',
        description: `Setujui permohonan PKL ${item.namaSiswa} di ${item.dudiTujuan}. Sistem juga akan membuatkan antrean berkas pada menu Perizinan PKL.`,
        variant: 'success',
        confirmText: 'Ya, Setujui & Catat',
        onConfirm: async () => {
          const pengajuanService = PengajuanService.getInstance();
          await pengajuanService.approveByKakomli(row.id);
          await refresh();
        },
      });
    } else if (actionName === 'create_perizinan') {
      setConfirmModal({
        isOpen: true,
        title: 'Buat Berkas Perizinan PKL?',
        description: `Kirim data ${item.namaSiswa} (${item.dudiTujuan}) ke modul Perizinan PKL untuk pencatatan izin orang tua & balasan DUDI.`,
        variant: 'primary',
        confirmText: 'Buat Berkas Perizinan',
        onConfirm: async () => {
          await PengajuanService.getInstance().createPerizinanFromPengajuan(row.id);
          ToastManager.getInstance().show(
            'Berkas Perizinan Dibuat',
            'success',
            `${item.namaSiswa} kini tercatat di menu Perizinan PKL.`
          );
          await refresh();
        },
      });
    } else if (actionName === 'reject_kakomli') {
      setActionModal({
        isOpen: true,
        type: 'reject_kakomli',
        row: item,
        reason: 'Kompetensi tidak linier dengan bidang pekerjaan DUDI',
        guruPendamping: '',
        tanggalBerangkat: new Date().toISOString().split('T')[0],
        tanggalRencanaTarik: '',
        submitting: false,
      });
    } else if (actionName === 'schedule_hubin') {
      await loadGuruOptions();
      setActionModal({
        isOpen: true,
        type: 'schedule_hubin',
        row: item,
        reason: '',
        guruPendamping: item.guruPendamping || '',
        tanggalBerangkat: item.tanggalBerangkat || new Date().toISOString().split('T')[0],
        tanggalRencanaTarik: '',
        submitting: false,
      });
    } else if (actionName === 'mark_ortu_ok') {
      setConfirmModal({
        isOpen: true,
        title: 'Konfirmasi Izin Orang Tua / Wali?',
        description: `Tandai bahwa orang tua/wali dari ${item.namaSiswa} telah menyetujui keikutsertaan PKL di ${item.dudiTujuan}.`,
        variant: 'primary',
        confirmText: 'Ya, Diizinkan Ortu',
        onConfirm: async () => {
          await PerizinanService.getInstance().markOrtuApproved(row.id);
          await refresh();
        },
      });
    } else if (actionName === 'mark_dudi_accepted') {
      setConfirmModal({
        isOpen: true,
        title: 'Konfirmasi Balasan DUDI: Diterima?',
        description: `Catat bahwa ${item.dudiTujuan} telah menerima ${item.namaSiswa} dan perbarui status siswa di Master Siswa.`,
        variant: 'success',
        confirmText: 'Catat Diterima DUDI',
        onConfirm: async () => {
          await PerizinanService.getInstance().markDudiAccepted(row.id);
          await refresh();
        },
      });
    } else if (actionName === 'promote_to_pkl') {
      await loadGuruOptions();
      const fourMonthsLater = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      setActionModal({
        isOpen: true,
        type: 'promote_to_pkl',
        row: item,
        reason: '',
        guruPendamping: '',
        tanggalBerangkat: new Date().toISOString().split('T')[0],
        tanggalRencanaTarik: fourMonthsLater,
        submitting: false,
      });
    } else if (actionName === 'print_docs') {
      if (onOpenDocsForStudent) {
        const selected = data.filter((d) => selectedIds.includes(d.id));
        onOpenDocsForStudent(item, selected.length > 0 ? selected : [item], data);
      }
    }
  };

  const handleActionModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionModal.row || !actionModal.type) return;

    setActionModal((prev) => ({ ...prev, submitting: true }));
    try {
      if (actionModal.type === 'reject_kakomli') {
        await PengajuanService.getInstance().rejectByKakomli(
          actionModal.row.id,
          actionModal.reason.trim()
        );
        ToastManager.getInstance().show(
          'Pengajuan Ditolak',
          'info',
          `Pengajuan ${actionModal.row.namaSiswa} telah diperbarui.`
        );
      } else if (actionModal.type === 'schedule_hubin') {
        if (!actionModal.guruPendamping.trim() || !actionModal.tanggalBerangkat) {
          throw new Error('Nama Guru Pendamping dan Tanggal Keberangkatan wajib diisi.');
        }
        await PengajuanService.getInstance().scheduleHubin(
          actionModal.row.id,
          actionModal.guruPendamping.trim(),
          actionModal.tanggalBerangkat
        );
        ToastManager.getInstance().show(
          'Pemberangkatan Dijadwalkan',
          'success',
          `${actionModal.row.namaSiswa} dijadwalkan dengan ${actionModal.guruPendamping}.`
        );
      } else if (actionModal.type === 'promote_to_pkl') {
        if (!actionModal.guruPendamping.trim() || !actionModal.tanggalBerangkat) {
          throw new Error('Guru Pendamping dan Tanggal Berangkat wajib diisi.');
        }
        await PerizinanService.getInstance().promoteToPenempatan(
          actionModal.row.id,
          actionModal.guruPendamping.trim(),
          actionModal.tanggalBerangkat,
          actionModal.tanggalRencanaTarik
        );
        ToastManager.getInstance().show(
          'Resmi Diterbitkan ke Data Siswa PKL',
          'success',
          `${actionModal.row.namaSiswa} kini tercatat aktif di Data Siswa PKL.`
        );
      }

      setActionModal((prev) => ({ ...prev, isOpen: false, submitting: false }));
      await refresh();
    } catch (err: any) {
      ToastManager.getInstance().show(
        'Gagal Memproses Tindakan',
        'error',
        err?.message || 'Periksa kembali data dan koneksi Google Spreadsheet.'
      );
      setActionModal((prev) => ({ ...prev, submitting: false }));
    }
  };

  // Form submit for Add with confirmation
  const handleCreateSubmit = (values: T) => {
    setConfirmModal({
      isOpen: true,
      title: 'Simpan Data Baru ke Google Spreadsheet?',
      description: `Data baru akan divalidasi dan dicatat permanen pada lembar kerja [${metadata.tableName}].`,
      variant: 'primary',
      confirmText: 'Simpan ke Spreadsheet',
      onConfirm: async () => {
        await repository.create(values);
        if (metadata.id === 'siswa_pkl') {
          await RelationSyncService.getInstance()
            .syncPlacementCounts()
            .catch(() => {});
        }
        await refresh();
      },
    });
  };

  // Form submit for Edit with confirmation
  const handleEditSubmit = (values: T) => {
    if (!editingRow) return;
    setConfirmModal({
      isOpen: true,
      title: 'Perbarui Data di Google Spreadsheet?',
      description: `Perubahan data baris ID ${editingRow.id} akan disinkronkan ke lembar kerja [${metadata.tableName}].`,
      variant: 'primary',
      confirmText: 'Perbarui di Spreadsheet',
      onConfirm: async () => {
        await repository.update(editingRow.id, values);
        if (metadata.id === 'siswa_pkl') {
          await RelationSyncService.getInstance()
            .syncPlacementCounts()
            .catch(() => {});
        }
        setEditingRow(null);
        await refresh();
      },
    });
  };

  // Delete row with confirmation
  const handleDeleteRow = (row: T) => {
    setConfirmModal({
      isOpen: true,
      title: 'Hapus Baris dari Google Spreadsheet?',
      description: `Apakah Anda yakin ingin menghapus data baris ini? Data akan dihapus dari lembar kerja [${metadata.tableName}].`,
      variant: 'danger',
      confirmText: 'Ya, Hapus Data',
      onConfirm: async () => {
        await deleteRow(row.id);
        if (metadata.id === 'siswa_pkl') {
          await RelationSyncService.getInstance()
            .syncPlacementCounts()
            .catch(() => {});
        }
      },
    });
  };

  // Export selected rows as CSV
  const handleExportSelected = () => {
    const selectedRows = data.filter((d) => selectedIds.includes(d.id));
    if (selectedRows.length === 0) return;

    const exportCols = metadata.fields.filter((f) => f.isTableColumn && f.type !== 'image');
    const headers = exportCols.map((c) => `"${c.label}"`).join(',');
    const rows = selectedRows.map((r: any) =>
      exportCols.map((c) => `"${String(r[c.key] ?? '').replace(/"/g, '""')}"`).join(',')
    );

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Export_${metadata.id}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {/* Clean Editorial Page Header (Zero nested card bloat or pill clutter) */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-3 border-b border-slate-200">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight truncate">
            {metadata.title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 mt-1">
            <span>{metadata.subtitle}</span>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span className="font-mono text-slate-600 font-medium">
              Sheet: {metadata.tableName}
            </span>
          </div>
        </div>

        {onOpenSheetConfig && (
          <button
            type="button"
            onClick={onOpenSheetConfig}
            className="h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 self-start sm:self-auto shrink-0 cursor-pointer transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            title="Lihat konfigurasi Google Spreadsheet"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Sumber Google Sheet</span>
          </button>
        )}
      </div>

      {/* Sheet Error Banner (Never fallback to fake data) */}
      {loadError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-rose-900">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">Gagal Membaca Sheet [{metadata.tableName}]</div>
              <div className="text-rose-700 mt-0.5">{loadError}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => syncWithSpreadsheet(metadata.tableName)}
              disabled={syncing}
              className="h-9 px-3.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span>Muat Ulang</span>
            </button>
            {onOpenSheetConfig && (
              <button
                type="button"
                onClick={onOpenSheetConfig}
                className="h-9 px-3.5 rounded-lg bg-white border border-rose-300 text-rose-800 hover:bg-rose-100 font-semibold cursor-pointer whitespace-nowrap"
              >
                Atur Spreadsheet
              </button>
            )}
          </div>
        </div>
      )}

      {/* 1. Top 4 Statistic Cards */}
      <StatCards configs={metadata.statCards} data={data} />

      {/* 2. Middle Toolbar */}
      <Toolbar
        search={search}
        onSearchChange={handleSearch}
        activeFilterCount={activeFilterCount}
        onOpenFilterModal={() => setIsFilterModalOpen(true)}
        selectedCount={selectedIds.length}
        onOpenBulkModal={() => setIsBulkModalOpen(true)}
        onSyncSpreadsheet={() => syncWithSpreadsheet(metadata.tableName)}
        syncing={syncing}
        onOpenImportModal={() => setIsImportModalOpen(true)}
        onOpenAddModal={() => setIsAddModalOpen(true)}
        onOpenDocsModal={
          onOpenDocsForStudent
            ? () => {
                const selected = data.filter((d) => selectedIds.includes(d.id));
                const active = selected.length > 0 ? selected[0] : data[0] || null;
                onOpenDocsForStudent(active, selected, data);
              }
            : undefined
        }
        onOpenSimulatorModal={onOpenSimulator}
        onOpenGasModal={onOpenGas}
        onSyncRelations={isRelationalModule ? handleSyncRelations : undefined}
        syncingRelations={syncingRelations}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {/* 3. Dynamic Data Grid (Table & Card Pagination) */}
      <DynamicDataGrid
        fields={metadata.fields}
        data={data}
        total={total}
        loading={loading}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        sort={sort}
        onSort={handleSort}
        selectedIds={selectedIds}
        onToggleSelectRow={toggleSelectRow}
        onToggleSelectAll={toggleSelectAll}
        onEdit={(row) => setEditingRow(row)}
        onDelete={handleDeleteRow}
        onCustomAction={handleCustomAction}
        customRowActions={customRowActions}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {/* Apple Confirmation Modal */}
      <AppleConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={async () => {
          try {
            await confirmModal.onConfirm();
            setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          } catch (err: any) {
            ToastManager.getInstance().show(
              'Gagal Menyimpan ke Spreadsheet',
              'error',
              err?.message || 'Periksa koneksi Cloud GAS Web App dan ID Spreadsheet.'
            );
            setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          }
        }}
        title={confirmModal.title}
        description={confirmModal.description}
        sheetName={metadata.tableName}
        variant={confirmModal.variant}
        confirmText={confirmModal.confirmText}
      />

      {/* Create Modal */}
      <DynamicFormModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={`Tambah Data ${metadata.title}`}
        fields={metadata.fields}
        onSubmit={handleCreateSubmit}
        onOpenImageCropper={(current, onDone) =>
          setCropperState({ isOpen: true, currentImage: current, onDone })
        }
      />

      {/* Edit Modal */}
      {editingRow && (
        <DynamicFormModal
          isOpen={true}
          onClose={() => setEditingRow(null)}
          title={`Edit Data ${metadata.title}`}
          fields={metadata.fields}
          initialData={editingRow}
          onSubmit={handleEditSubmit}
          onOpenImageCropper={(current, onDone) =>
            setCropperState({ isOpen: true, currentImage: current, onDone })
          }
        />
      )}

      {/* Filter Modal */}
      <DynamicFilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        fields={metadata.fields}
        currentFilter={filter}
        onApplyFilter={handleFilterChange}
        onResetFilter={resetFilter}
      />

      {/* Bulk Action Modal */}
      <BulkActionModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        selectedCount={selectedIds.length}
        onBulkDelete={async () => {
          setConfirmModal({
            isOpen: true,
            title: `Hapus ${selectedIds.length} Baris Data Terpilih?`,
            description: `Tindakan ini akan menghapus data terpilih dari Google Spreadsheet [${metadata.tableName}].`,
            variant: 'danger',
            confirmText: 'Ya, Hapus Terpilih',
            onConfirm: async () => {
              await bulkDeleteRows();
            },
          });
        }}
        onBulkApprove={
          metadata.id === 'pengajuan' && (userRole === 'Kakomli' || userRole === 'Hubin')
            ? async () => {
                setConfirmModal({
                  isOpen: true,
                  title: `Setujui Massal ${selectedIds.length} Pengajuan Siswa?`,
                  description: 'Status pengajuan terpilih akan diubah menjadi Disetujui di Google Spreadsheet.',
                  variant: 'success',
                  confirmText: 'Setujui Massal',
                  onConfirm: async () => {
                    const pengajuanService = PengajuanService.getInstance();
                    for (const id of selectedIds) {
                      await pengajuanService.approveByKakomli(id);
                    }
                    await refresh();
                  },
                });
              }
            : undefined
        }
        onBulkPrint={
          onOpenDocsForStudent && selectedIds.length > 0
            ? () => {
                const selected = data.filter((d) => selectedIds.includes(d.id));
                onOpenDocsForStudent(selected[0], selected, data);
              }
            : undefined
        }
        onExportSelected={handleExportSelected}
        moduleTitle={metadata.title}
      />

      {/* Import Excel Modal */}
      <ImportExcelModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        fields={metadata.fields}
        moduleTitle={metadata.title}
        onImport={async (newRows) => {
          const count = await repository.importRows(newRows);
          await refresh();
          return count;
        }}
      />

      {/* Image Cropper Modal */}
      <ImageCropperModal
        isOpen={cropperState.isOpen}
        onClose={() => setCropperState((prev) => ({ ...prev, isOpen: false }))}
        currentImage={cropperState.currentImage}
        onSave={(dataUrl) => {
          cropperState.onDone(dataUrl);
        }}
      />

      {/* Unified Inline Action Modal (Reject / Schedule / Promote to Data Siswa PKL) */}
      {actionModal.isOpen && actionModal.row && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-[2px]"
          onClick={() => !actionModal.submitting && setActionModal((p) => ({ ...p, isOpen: false }))}
        >
          <div
            className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="min-w-0 pr-2">
                <h3 className="text-sm font-bold text-slate-900">
                  {actionModal.type === 'reject_kakomli' && 'Tolak Pengajuan PKL'}
                  {actionModal.type === 'schedule_hubin' && 'Jadwalkan Pemberangkatan PKL'}
                  {actionModal.type === 'promote_to_pkl' && 'Terbitkan ke Data Siswa PKL'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 truncate">
                  {actionModal.row.namaSiswa} ({actionModal.row.nis}) · {actionModal.row.dudiTujuan}
                </p>
              </div>
              <button
                type="button"
                disabled={actionModal.submitting}
                onClick={() => setActionModal((p) => ({ ...p, isOpen: false }))}
                className="w-9 h-9 rounded-lg hover:bg-slate-200/80 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer shrink-0 transition-colors"
                aria-label="Tutup modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleActionModalSubmit} className="p-5 space-y-4 text-xs">
              {actionModal.type === 'reject_kakomli' ? (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Alasan Penolakan (Catatan Kakomli):
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={actionModal.reason}
                    onChange={(e) =>
                      setActionModal((prev) => ({ ...prev, reason: e.target.value }))
                    }
                    placeholder="Contoh: DUDI tidak linier dengan kompetensi keahlian"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1.5">
                      Guru Pendamping Lapangan <span className="text-rose-500">*</span>
                    </label>
                    {guruList.length > 0 ? (
                      <select
                        required
                        value={actionModal.guruPendamping}
                        onChange={(e) =>
                          setActionModal((prev) => ({
                            ...prev,
                            guruPendamping: e.target.value,
                          }))
                        }
                        className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                      >
                        <option value="">-- Pilih Guru Pendamping --</option>
                        {guruList.map((g, idx) => (
                          <option key={`${g.id || 'guru'}_${idx}`} value={g.nama}>
                            {g.nama} ({g.peranUtama || 'Guru Pendamping'})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        required
                        value={actionModal.guruPendamping}
                        onChange={(e) =>
                          setActionModal((prev) => ({
                            ...prev,
                            guruPendamping: e.target.value,
                          }))
                        }
                        placeholder="Ketik nama lengkap Guru Pendamping..."
                        className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                      />
                    )}
                    {guruList.length === 0 && (
                      <p className="text-[11px] text-amber-700 mt-1">
                        Daftar di sheet Master_Guru_Pendamping masih kosong; Anda dapat mengetik nama guru secara langsung.
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1.5">
                        Tanggal Berangkat <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        value={actionModal.tanggalBerangkat}
                        onChange={(e) =>
                          setActionModal((prev) => ({
                            ...prev,
                            tanggalBerangkat: e.target.value,
                          }))
                        }
                        className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 tabular-nums"
                      />
                    </div>
                    {actionModal.type === 'promote_to_pkl' && (
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1.5">
                          Rencana Tanggal Tarik
                        </label>
                        <input
                          type="date"
                          value={actionModal.tanggalRencanaTarik}
                          onChange={(e) =>
                            setActionModal((prev) => ({
                              ...prev,
                              tanggalRencanaTarik: e.target.value,
                            }))
                          }
                          className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 tabular-nums"
                        />
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={actionModal.submitting}
                  onClick={() => setActionModal((p) => ({ ...p, isOpen: false }))}
                  className="h-9 px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={actionModal.submitting}
                  className={`h-9 px-4 rounded-lg text-white font-semibold cursor-pointer disabled:opacity-50 ${
                    actionModal.type === 'reject_kakomli'
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {actionModal.submitting
                    ? 'Menyimpan...'
                    : actionModal.type === 'reject_kakomli'
                    ? 'Tolak Pengajuan'
                    : actionModal.type === 'promote_to_pkl'
                    ? 'Terbitkan ke Data Siswa PKL'
                    : 'Simpan Jadwal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
