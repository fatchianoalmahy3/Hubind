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
  Database,
  AlertTriangle,
  RefreshCw,
  FileCheck,
  Send,
  X,
  MessageCircle,
  Copy,
  ExternalLink,
  FileDown,
  Loader2,
} from 'lucide-react';
import { DudiService } from '../services/DudiService';
import { PengajuanService } from '../services/PengajuanService';
import { PerizinanService } from '../services/PerizinanService';
import { GuruService } from '../services/GuruService';
import { JurusanService } from '../services/JurusanService';
import { RelationSyncService } from '../services/RelationSyncService';
import { PublicPortalClient } from '../core/PublicPortalClient';
import { MonitoringRecapModal } from './MonitoringRecapModal';
import { Guru, Jurusan } from '../core/types/schema';
import { ToastManager } from '../core/ToastManager';
import { getTodayIsoDate, normalizeWhatsAppNumber } from '../core/utils/autoIdHelpers';
import {
  formatIndonesianDate,
  formatPerizinanDateRange,
  getOffsetWibIsoDate,
  getTodayWibIsoDate,
  normalizeToIsoDate,
} from '../core/utils/dateHelpers';
import { formatNisVisual } from '../core/utils/nisHelpers';
import {
  calculateEqualWeightedAverage,
  getPredikatFromScore,
} from '../core/utils/monitoringHelpers';

interface ModulePageProps<T extends { id: string }> {
  metadata: ModuleMetadata<T>;
  repository: BaseRepository<T>;
  userRole: UserRole;
  onOpenDocsForStudent?: (
    studentData: any,
    selectedStudents?: any[],
    allStudents?: any[],
    sourceModuleId?: string
  ) => void;
  onOpenSimulator?: () => void;
  onOpenGas?: () => void;
  onOpenSheetConfig?: () => void;
  onOpenMonitoringBundle?: () => void;
}

export function ModulePage<T extends { id: string }>({
  metadata,
  repository,
  userRole,
  onOpenDocsForStudent,
  onOpenSimulator,
  onOpenGas,
  onOpenSheetConfig,
  onOpenMonitoringBundle,
}: ModulePageProps<T>) {
  const {
    data,
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
    tanggalBerangkat: getTodayWibIsoDate(),
    tanggalRencanaTarik: getOffsetWibIsoDate(120),
    submitting: false,
  });
  const [guruList, setGuruList] = useState<Guru[]>([]);
  const [syncingRelations, setSyncingRelations] = useState(false);
  const [allExistingRows, setAllExistingRows] = useState<T[]>([]);
  const [isMonitoringRecapOpen, setIsMonitoringRecapOpen] = useState(false);

  // Kirim WA & PDF Surat Izin modal state (DUDI / Kakomli)
  const [waModal, setWaModal] = useState<{
    isOpen: boolean;
    row: any | null;
    recipientType: 'dudi' | 'kakomli';
    dudiName: string;
    picName: string;
    dudiPhone: string;
    kakomliName: string;
    kakomliPhone: string;
    phoneInput: string;
    alamat: string;
    pdfUrl: string;
    generatingPdf: boolean;
    message: string;
  }>({
    isOpen: false,
    row: null,
    recipientType: 'dudi',
    dudiName: '',
    picName: '',
    dudiPhone: '',
    kakomliName: '',
    kakomliPhone: '',
    phoneInput: '',
    alamat: '-',
    pdfUrl: '',
    generatingPdf: false,
    message: '',
  });

  const isRelationalModule = ['dudi', 'guru', 'siswa_pkl', 'jurusan', 'kelas', 'siswa'].includes(
    metadata.id
  );

  const handleOpenAddModal = async () => {
    try {
      const fullList = await repository.getAll();
      setAllExistingRows(fullList);
    } catch {
      setAllExistingRows(data);
    }
    setIsAddModalOpen(true);
  };

  const handleSyncRelations = async () => {
    setSyncingRelations(true);
    const toastId = ToastManager.getInstance().show(
      'Menyinkronkan Relasi Data...',
      'pending',
      'Menghitung ulang keterisian DUDI, Guru, Jurusan & Kelas dari Cloud Server'
    );
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

      ToastManager.getInstance().update(
        toastId,
        'Relasi Data Tersinkron',
        'success',
        totalChanges > 0
          ? `Diperbarui: ${summary.updatedPlacements} plotting, ${summary.updatedDudi} DUDI, ${summary.updatedGuru} guru, ${summary.updatedJurusan} jurusan, ${summary.updatedKelas} kelas.`
          : 'Semua relasi Siswa, DUDI, Guru, Jurusan & Kelas sudah konsisten.'
      );
    } catch (err: any) {
      ToastManager.getInstance().update(
        toastId,
        'Gagal Sinkronisasi Relasi',
        'error',
        err?.message || 'Periksa koneksi Cloud Server dan coba kembali.'
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

  const isSuperAdmin = userRole === 'SuperAdmin';
  const isHubinOrSuper = userRole === 'Hubin' || isSuperAdmin;

  if (metadata.id === 'pengajuan') {
    if (userRole === 'Kakomli' || isHubinOrSuper) {
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
    if (isHubinOrSuper) {
      customRowActions.push({
        name: 'schedule_hubin',
        label: 'Jadwalkan',
        icon: Calendar,
        color: 'hover:text-blue-600 hover:bg-blue-50 text-blue-600',
      });
    }
  }

  if (metadata.id === 'perizinan') {
    if (isHubinOrSuper || userRole === 'Kakomli') {
      customRowActions.push({
        name: 'send_wa_dudi',
        label: 'Kirim WA & PDF',
        icon: MessageCircle,
        color: 'hover:text-emerald-700 hover:bg-emerald-50 text-emerald-600',
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
          await PengajuanService.getInstance().createPerizinanFromPengajuan(row.id, {
            silentToast: true,
          });
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
        tanggalBerangkat: getTodayWibIsoDate(),
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
        tanggalBerangkat: normalizeToIsoDate(item.tanggalBerangkat) || getTodayWibIsoDate(),
        tanggalRencanaTarik: '',
        submitting: false,
      });
    } else if (actionName === 'send_wa_dudi') {
      const [dudiList, pengajuanList, jurusanList] = await Promise.all([
        DudiService.getInstance().getAll().catch(() => []),
        PengajuanService.getInstance().getAll().catch(() => []),
        JurusanService.getInstance().getAll().catch(() => [] as Jurusan[]),
      ]);
      const targetDudiNorm = String(item.dudiTujuan || '').trim().toLowerCase();
      const matchedDudi = dudiList.find(
        (d) => d.namaDudi.trim().toLowerCase() === targetDudiNorm
      );
      const matchedPengajuan = pengajuanList.find(
        (p) =>
          (item.noPengajuan && p.noPengajuan === item.noPengajuan) ||
          (item.nis && p.nis === item.nis)
      );

      const targetJurRaw = String(item.jurusan || '').trim().toLowerCase();
      const matchedJurusan = jurusanList.find((j) => {
        const k = String(j.kode || '').trim().toLowerCase();
        const n = String(j.nama || '').trim().toLowerCase();
        return (
          targetJurRaw === k ||
          targetJurRaw === n ||
          (k.length >= 2 && targetJurRaw.includes(k)) ||
          (n.length >= 4 && targetJurRaw.includes(n))
        );
      });

      const rawDudiPhone =
        matchedDudi?.noTelpDudi ||
        matchedDudi?.kontakPic ||
        matchedPengajuan?.noTelpDudi ||
        '';
      const cleanDudiPhone = rawDudiPhone === '-' ? '' : rawDudiPhone;
      const rawKakomliPhone = matchedJurusan?.kontakWA || '';
      const cleanKakomliPhone = rawKakomliPhone === '-' ? '' : rawKakomliPhone;
      const kakomliName = matchedJurusan?.namaKakomli || 'Ketua Kompetensi Keahlian';

      const alamat =
        (item.alamatDudi && item.alamatDudi !== '-' ? item.alamatDudi : '') ||
        matchedDudi?.alamat ||
        matchedPengajuan?.alamatDudi ||
        '-';
      const existingPdfUrl =
        item.linkSuratPdf && item.linkSuratPdf !== '-' ? String(item.linkSuratPdf).trim() : '';
      const dudiName = item.dudiTujuan || matchedDudi?.namaDudi || 'Mitra DUDI';

      const composedMsg = composePerizinanWaMessage({
        row: item,
        recipientType: 'dudi',
        dudiName,
        kakomliName,
        alamat,
        pdfUrl: existingPdfUrl,
      });

      setWaModal({
        isOpen: true,
        row: item,
        recipientType: 'dudi',
        dudiName,
        picName: matchedDudi?.namaPic || matchedDudi?.namaPemimpin || 'PIC / HRD Industri',
        dudiPhone: cleanDudiPhone,
        kakomliName,
        kakomliPhone: cleanKakomliPhone,
        phoneInput: cleanDudiPhone,
        alamat,
        pdfUrl: existingPdfUrl,
        generatingPdf: false,
        message: composedMsg,
      });
    } else if (actionName === 'promote_to_pkl') {
      await loadGuruOptions();
      const todayWib = getTodayWibIsoDate();
      const fourMonthsLater = getOffsetWibIsoDate(120, todayWib);
      setActionModal({
        isOpen: true,
        type: 'promote_to_pkl',
        row: item,
        reason: '',
        guruPendamping: '',
        tanggalBerangkat: todayWib,
        tanggalRencanaTarik: fourMonthsLater,
        submitting: false,
      });
    } else if (actionName === 'print_docs') {
      if (onOpenDocsForStudent) {
        const selected = data.filter((d) => selectedIds.includes(d.id));
        onOpenDocsForStudent(item, selected, data, metadata.id);
      }
    }
  };

  const handleActionModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionModal.row || !actionModal.type) return;

    setActionModal((prev) => ({ ...prev, submitting: true }));
    const toastTitleMap = {
      reject_kakomli: 'Menyimpan Penolakan Pengajuan...',
      schedule_hubin: 'Menjadwalkan Pemberangkatan...',
      promote_to_pkl: 'Menerbitkan ke Data Siswa PKL...',
    };
    const toastId = ToastManager.getInstance().show(
      toastTitleMap[actionModal.type],
      'pending',
      `${actionModal.row.namaSiswa} · ${actionModal.row.dudiTujuan}`
    );

    try {
      if (actionModal.type === 'reject_kakomli') {
        await PengajuanService.getInstance().rejectByKakomli(
          actionModal.row.id,
          actionModal.reason.trim(),
          { silentToast: true }
        );
        ToastManager.getInstance().update(
          toastId,
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
          actionModal.tanggalBerangkat,
          { silentToast: true }
        );
        ToastManager.getInstance().update(
          toastId,
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
          actionModal.tanggalRencanaTarik,
          { silentToast: true }
        );
        ToastManager.getInstance().update(
          toastId,
          'Resmi Diterbitkan ke Data Siswa PKL',
          'success',
          `${actionModal.row.namaSiswa} kini tercatat aktif di Data Siswa PKL.`
        );
      }

      setActionModal((prev) => ({ ...prev, isOpen: false, submitting: false }));
      await refresh();
    } catch (err: any) {
      ToastManager.getInstance().update(
        toastId,
        'Gagal Memproses Tindakan',
        'error',
        err?.message || 'Periksa kembali data dan koneksi Cloud Server.'
      );
      setActionModal((prev) => ({ ...prev, submitting: false }));
    }
  };

  const normalizeGradePayload = (values: T): any => {
    const nextValues: any = { ...values };

    if (metadata.id === 'monitoring' || metadata.id === 'sertifikat') {
      const scoreKeys = [
        'nilaiK3lh',
        'nilaiSoftskill',
        'nilaiKompetensiTeknis',
        'nilaiAlurBisnis',
      ];
      const enteredScores = scoreKeys
        .map((k) => nextValues[k])
        .filter((v) => v !== '' && v !== null && v !== undefined && !isNaN(Number(v)))
        .map((v) => Math.min(100, Math.max(0, Number(v))));

      if (enteredScores.length === 4) {
        const avg = calculateEqualWeightedAverage(
          enteredScores[0],
          enteredScores[1],
          enteredScores[2],
          enteredScores[3]
        );
        nextValues.nilaiRataRata = avg;
        if (metadata.id === 'monitoring') {
          nextValues.nilaiPklMuncul = true;
          nextValues.nilaiDudiTerkumpul = true;
        } else {
          nextValues.predikat = getPredikatFromScore(avg);
        }
      } else if (enteredScores.length > 0 && enteredScores.some((s) => s > 0)) {
        const avg =
          Math.round(
            (enteredScores.reduce((acc, s) => acc + s, 0) / enteredScores.length) * 10
          ) / 10;
        nextValues.nilaiRataRata = avg;
        if (metadata.id === 'monitoring') {
          nextValues.nilaiPklMuncul = true;
          nextValues.nilaiDudiTerkumpul = true;
        } else if (!nextValues.predikat || avg > 0) {
          nextValues.predikat = getPredikatFromScore(avg);
        }
      } else if (metadata.id === 'sertifikat') {
        const rataRata = Number(nextValues.nilaiRataRata ?? 0) || 0;
        if (rataRata > 0) {
          const rounded = Math.round(rataRata * 10) / 10;
          nextValues.nilaiRataRata = rounded;
          if (!nextValues.predikat) {
            nextValues.predikat = getPredikatFromScore(rounded);
          }
        }
      }
    }

    return nextValues;
  };

  // Form submit for Add with confirmation
  const handleCreateSubmit = (values: T) => {
    const nextValues = normalizeGradePayload(values);
    setConfirmModal({
      isOpen: true,
      title: 'Simpan Data Baru ke Cloud Server?',
      description: 'Data baru akan divalidasi dan tersimpan secara permanen di Database Cloud Server.',
      variant: 'primary',
      confirmText: 'Simpan ke Server',
      onConfirm: async () => {
        await repository.create(nextValues);
        await RelationSyncService.getInstance()
          .syncAfterMutation(metadata.id)
          .catch(() => {});
        await refresh();
      },
    });
  };

  // Form submit for Edit with confirmation
  const handleEditSubmit = (values: T) => {
    if (!editingRow) return;

    const nextValues = normalizeGradePayload(values);

    setConfirmModal({
      isOpen: true,
      title: 'Perbarui Data di Cloud Server?',
      description: `Perubahan data baris ID ${editingRow.id} akan disinkronkan ke Database Cloud Server.`,
      variant: 'primary',
      confirmText: 'Perbarui di Server',
      onConfirm: async () => {
        await repository.update(editingRow.id, nextValues);
        await RelationSyncService.getInstance()
          .syncAfterMutation(metadata.id)
          .catch(() => {});
        setEditingRow(null);
        await refresh();
      },
    });
  };

  // Delete row with confirmation
  const handleDeleteRow = (row: T) => {
    setConfirmModal({
      isOpen: true,
      title: 'Hapus Baris dari Cloud Server?',
      description: 'Apakah Anda yakin ingin menghapus data baris ini? Perubahan akan langsung disinkronkan ke Database Cloud Server.',
      variant: 'danger',
      confirmText: 'Ya, Hapus Data',
      onConfirm: async () => {
        await deleteRow(row.id);
        await RelationSyncService.getInstance()
          .syncAfterMutation(metadata.id)
          .catch(() => {});
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
    ToastManager.getInstance().show(
      'Data Diekspor ke CSV',
      'success',
      `${selectedRows.length} baris dari ${metadata.title} berhasil diunduh.`
    );
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
            {isSuperAdmin && (
              <>
                <span className="text-slate-300" aria-hidden="true">·</span>
                <span className="font-mono text-slate-600 font-medium">
                  Tabel Server: {metadata.tableName}
                </span>
              </>
            )}
          </div>
        </div>

        {isSuperAdmin && onOpenSheetConfig && (
          <button
            type="button"
            onClick={onOpenSheetConfig}
            className="h-9 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 self-start sm:self-auto shrink-0 cursor-pointer transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            title="Lihat Konfigurasi Cloud Server"
          >
            <Database className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Konfigurasi Server</span>
          </button>
        )}
      </div>

      {/* Server Error Banner (Never fallback to fake data) */}
      {loadError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-rose-900">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">Gagal Memuat Data {metadata.title}</div>
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
            {isSuperAdmin && onOpenSheetConfig && (
              <button
                type="button"
                onClick={onOpenSheetConfig}
                className="h-9 px-3.5 rounded-lg bg-white border border-rose-300 text-rose-800 hover:bg-rose-100 font-semibold cursor-pointer whitespace-nowrap"
              >
                Konfigurasi Server
              </button>
            )}
          </div>
        </div>
      )}

      {/* 1. Top 4 Statistic Cards */}
      <StatCards configs={metadata.statCards} data={data} loading={loading && data.length === 0} />

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
        onOpenAddModal={handleOpenAddModal}
        onOpenDocsModal={
          onOpenDocsForStudent
            ? () => {
                const selected = data.filter((d) => selectedIds.includes(d.id));
                const active = selected.length > 0 ? selected[0] : data[0] || null;
                onOpenDocsForStudent(active, selected, data, metadata.id);
              }
            : undefined
        }
        onOpenSimulatorModal={isSuperAdmin ? onOpenSimulator : undefined}
        onOpenGasModal={isSuperAdmin ? onOpenGas : undefined}
        onSyncRelations={isRelationalModule ? handleSyncRelations : undefined}
        onOpenMonitoringRecap={
          metadata.id === 'monitoring' || metadata.id === 'jurusan'
            ? () => setIsMonitoringRecapOpen(true)
            : undefined
        }
        onOpenMonitoringBundle={
          metadata.id === 'monitoring' ? onOpenMonitoringBundle : undefined
        }
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
        revalidating={revalidating || syncing || syncingRelations}
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
              'Gagal Menyimpan ke Cloud Server',
              'error',
              err?.message || 'Periksa koneksi Cloud Server dan coba beberapa saat lagi.'
            );
            setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          }
        }}
        title={confirmModal.title}
        description={confirmModal.description}
        sheetName={isSuperAdmin ? metadata.tableName : ''}
        variant={confirmModal.variant}
        confirmText={confirmModal.confirmText}
      />

      {/* Create Modal */}
      <DynamicFormModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={`Tambah Data ${metadata.title}`}
        fields={metadata.fields}
        existingRows={allExistingRows.length > 0 ? allExistingRows : data}
        moduleId={metadata.id}
        tableName={metadata.tableName}
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
          existingRows={data}
          moduleId={metadata.id}
          tableName={metadata.tableName}
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
            description: 'Tindakan ini akan menghapus data terpilih secara permanen dari Database Cloud Server.',
            variant: 'danger',
            confirmText: 'Ya, Hapus Terpilih',
            onConfirm: async () => {
              await bulkDeleteRows();
            },
          });
        }}
        onBulkApprove={
          metadata.id === 'pengajuan' && (userRole === 'Kakomli' || isHubinOrSuper)
            ? async () => {
                setConfirmModal({
                  isOpen: true,
                  title: `Setujui Massal ${selectedIds.length} Pengajuan Siswa?`,
                  description: 'Status pengajuan terpilih akan diubah menjadi Disetujui di Database Cloud Server.',
                  variant: 'success',
                  confirmText: 'Setujui Massal',
                  onConfirm: async () => {
                    const count = selectedIds.length;
                    const toastId = ToastManager.getInstance().show(
                      `Menyetujui Massal ${count} Pengajuan...`,
                      'pending',
                      'Memperbarui status pengajuan ke Cloud Server',
                      isSuperAdmin ? 'Data_Pengajuan_PKL' : undefined
                    );
                    try {
                      const pengajuanService = PengajuanService.getInstance();
                      for (const id of selectedIds) {
                        await pengajuanService.approveByKakomli(id, undefined, { silentToast: true });
                      }
                      await refresh();
                      ToastManager.getInstance().update(
                        toastId,
                        `${count} Pengajuan Disetujui (ACC)`,
                        'success',
                        'Seluruh pengajuan terpilih telah diperbarui & masuk antrean Perizinan.'
                      );
                    } catch (err: any) {
                      ToastManager.getInstance().update(
                        toastId,
                        'Persetujuan Massal Gagal',
                        'error',
                        err?.message || 'Terjadi kendala saat memperbarui sebagian data.'
                      );
                      throw err;
                    }
                  },
                });
              }
            : undefined
        }
        onBulkPrint={
          onOpenDocsForStudent && selectedIds.length > 0
            ? () => {
                const selected = data.filter((d) => selectedIds.includes(d.id));
                onOpenDocsForStudent(selected[0], selected, data, metadata.id);
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
                  {actionModal.row.namaSiswa} ({formatNisVisual(actionModal.row.nis)}) · {actionModal.row.dudiTujuan}
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
                        Daftar Guru Pendamping di Cloud Server masih kosong; Anda dapat mengetik nama guru secara langsung.
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

      {/* Kirim WA & PDF Surat Izin Modal (DUDI / Kakomli) */}
      {waModal.isOpen && waModal.row && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-[2px]"
          onClick={() => !waModal.generatingPdf && setWaModal((p) => ({ ...p, isOpen: false }))}
        >
          <div
            className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-emerald-50/70 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <MessageCircle className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-900 truncate">
                    Kirim Surat PDF &amp; WhatsApp ({waModal.recipientType === 'dudi' ? 'DUDI' : 'Kakomli'})
                  </h3>
                  <p className="text-xs text-slate-600 truncate">
                    {waModal.recipientType === 'dudi'
                      ? `${waModal.dudiName} · ${waModal.picName}`
                      : `${waModal.kakomliName} · ${waModal.row.jurusan || 'Jurusan'}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={waModal.generatingPdf}
                onClick={() => setWaModal((p) => ({ ...p, isOpen: false }))}
                className="w-9 h-9 rounded-lg hover:bg-slate-200/70 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer shrink-0 disabled:opacity-40"
                aria-label="Tutup modal WhatsApp"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
              {/* Recipient Toggle: DUDI vs Kakomli */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Pilih Penerima Pesan WhatsApp
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setWaModal((prev) => ({
                        ...prev,
                        recipientType: 'dudi',
                        phoneInput: prev.dudiPhone,
                        message: composePerizinanWaMessage({
                          row: prev.row,
                          recipientType: 'dudi',
                          dudiName: prev.dudiName,
                          kakomliName: prev.kakomliName,
                          alamat: prev.alamat,
                          pdfUrl: prev.pdfUrl,
                        }),
                      }));
                    }}
                    className={`min-h-[40px] px-3 py-2 rounded-lg border font-semibold transition-colors cursor-pointer text-left ${
                      waModal.recipientType === 'dudi'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-900'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-bold">1. Kirim ke DUDI</div>
                    <div className="text-[11px] text-slate-500 truncate">{waModal.dudiName}</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setWaModal((prev) => ({
                        ...prev,
                        recipientType: 'kakomli',
                        phoneInput: prev.kakomliPhone,
                        message: composePerizinanWaMessage({
                          row: prev.row,
                          recipientType: 'kakomli',
                          dudiName: prev.dudiName,
                          kakomliName: prev.kakomliName,
                          alamat: prev.alamat,
                          pdfUrl: prev.pdfUrl,
                        }),
                      }));
                    }}
                    className={`min-h-[40px] px-3 py-2 rounded-lg border font-semibold transition-colors cursor-pointer text-left ${
                      waModal.recipientType === 'kakomli'
                        ? 'bg-blue-50 border-blue-500 text-blue-900'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-bold">2. Kirim ke Kakomli</div>
                    <div className="text-[11px] text-slate-500 truncate">{waModal.kakomliName}</div>
                  </button>
                </div>
              </div>

              {/* Google Drive PDF Generator */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-slate-800">
                      File Surat Permohonan PDF (Google Drive)
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {waModal.pdfUrl
                        ? 'Tautan PDF Google Drive sudah tersemat otomatis ke dalam pesan WhatsApp.'
                        : 'Generate PDF ke Google Drive agar penerima dapat mengunduh surat permohonan resmi.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={waModal.generatingPdf}
                    onClick={async () => {
                      if (!waModal.row) return;
                      setWaModal((p) => ({ ...p, generatingPdf: true }));
                      try {
                        const res = await PublicPortalClient.generatePerizinanPdf({
                          perizinanId: waModal.row.id || waModal.row.noPerizinan,
                          noPerizinan: waModal.row.noPerizinan,
                          noSuratPermohonan: waModal.row.noSuratPermohonan,
                          namaSiswa: waModal.row.namaSiswa,
                          nis: waModal.row.nis,
                          kelas: waModal.row.kelas,
                          jurusan: waModal.row.jurusan,
                          dudiTujuan: waModal.dudiName,
                          alamatDudi: waModal.alamat,
                          tanggalSurat: formatIndonesianDate(
                            waModal.row.tanggalKirimSurat || getTodayIsoDate()
                          ),
                        });
                        const nextUrl = res.pdfUrl;
                        setWaModal((prev) => ({
                          ...prev,
                          generatingPdf: false,
                          pdfUrl: nextUrl,
                          message: composePerizinanWaMessage({
                            row: prev.row,
                            recipientType: prev.recipientType,
                            dudiName: prev.dudiName,
                            kakomliName: prev.kakomliName,
                            alamat: prev.alamat,
                            pdfUrl: nextUrl,
                          }),
                        }));
                        await refresh();
                      } catch {
                        setWaModal((prev) => ({ ...prev, generatingPdf: false }));
                      }
                    }}
                    className="h-9 px-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    {waModal.generatingPdf ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Membuat PDF...</span>
                      </>
                    ) : (
                      <>
                        <FileDown className="w-3.5 h-3.5" />
                        <span>{waModal.pdfUrl ? 'Buat Ulang PDF' : 'Generate PDF ke GDrive'}</span>
                      </>
                    )}
                  </button>
                </div>

                {waModal.pdfUrl && (
                  <div className="p-2.5 rounded-lg border border-emerald-200 bg-white flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-emerald-800 truncate">
                      {waModal.pdfUrl}
                    </span>
                    <a
                      href={waModal.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-bold text-blue-600 hover:underline inline-flex items-center gap-1 shrink-0 whitespace-nowrap"
                    >
                      <span>Buka PDF</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  {waModal.recipientType === 'dudi'
                    ? 'Nomor WhatsApp Tujuan (PIC / HRD DUDI)'
                    : `Nomor WhatsApp Kakomli (${waModal.kakomliName})`}
                </label>
                <input
                  type="text"
                  value={waModal.phoneInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setWaModal((prev) => ({
                      ...prev,
                      phoneInput: val,
                      ...(prev.recipientType === 'dudi'
                        ? { dudiPhone: val }
                        : { kakomliPhone: val }),
                    }));
                  }}
                  placeholder="Contoh: 081234567890"
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                />
                {normalizeWhatsAppNumber(waModal.phoneInput) ? (
                  <p className="text-[11px] text-emerald-700 mt-1 font-mono">
                    Target Link: wa.me/{normalizeWhatsAppNumber(waModal.phoneInput)}
                  </p>
                ) : (
                  <p className="text-[11px] text-amber-700 mt-1">
                    {waModal.recipientType === 'dudi'
                      ? 'Nomor WA DUDI belum tercatat. Masukkan nomor WA yang valid di atas.'
                      : 'Nomor WA Kakomli belum tercatat di Master Jurusan. Masukkan nomor WA Kakomli di atas.'}
                  </p>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Pratinjau Pesan WhatsApp (Dapat Diedit)
                </label>
                <textarea
                  rows={8}
                  value={waModal.message}
                  onChange={(e) =>
                    setWaModal((prev) => ({ ...prev, message: e.target.value }))
                  }
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white text-xs text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 shrink-0 text-xs">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(waModal.message);
                    ToastManager.getInstance().show(
                      'Pesan Disalin',
                      'success',
                      'Teks konfirmasi beserta tautan PDF siap ditempel ke WhatsApp.'
                    );
                  } catch {
                    ToastManager.getInstance().show(
                      'Gagal Menyalin Otomatis',
                      'info',
                      'Silakan blok teks pesan dan tekan Ctrl+C.'
                    );
                  }
                }}
                className="h-9 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Salin Pesan</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={waModal.generatingPdf}
                  onClick={() => setWaModal((p) => ({ ...p, isOpen: false }))}
                  className="h-9 px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer"
                >
                  Tutup
                </button>
                {normalizeWhatsAppNumber(waModal.phoneInput) ? (
                  <a
                    href={`https://wa.me/${normalizeWhatsAppNumber(
                      waModal.phoneInput
                    )}?text=${encodeURIComponent(waModal.message)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      if (waModal.recipientType === 'dudi') {
                        PerizinanService.getInstance()
                          .markSuratSentToday(waModal.row.id, { silentToast: true })
                          .then(() => refresh())
                          .catch(() => {});
                      }
                      ToastManager.getInstance().show(
                        waModal.recipientType === 'dudi'
                          ? 'Membuka WhatsApp DUDI'
                          : 'Membuka WhatsApp Kakomli',
                        'success',
                        `Mengirim surat permohonan ${waModal.row.namaSiswa} ke ${
                          waModal.recipientType === 'dudi' ? waModal.dudiName : waModal.kakomliName
                        }.`
                      );
                      setWaModal((p) => ({ ...p, isOpen: false }));
                    }}
                    className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Kirim via WhatsApp</span>
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      ToastManager.getInstance().show(
                        'Nomor WA Kosong',
                        'error',
                        'Isi nomor WhatsApp tujuan terlebih dahulu sebelum mengirim.'
                      )
                    }
                    className="h-9 px-4 rounded-lg bg-slate-300 text-slate-600 font-semibold inline-flex items-center gap-1.5 cursor-not-allowed"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Isi No. WA Dulu</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {isMonitoringRecapOpen && (
        <MonitoringRecapModal
          isOpen={isMonitoringRecapOpen}
          onClose={() => setIsMonitoringRecapOpen(false)}
        />
      )}
    </div>
  );
}

function composePerizinanWaMessage(params: {
  row: any;
  recipientType: 'dudi' | 'kakomli';
  dudiName: string;
  kakomliName: string;
  alamat: string;
  pdfUrl: string;
}): string {
  const { row, recipientType, dudiName, kakomliName, alamat, pdfUrl } = params;
  const tglSurat = formatIndonesianDate(row?.tanggalKirimSurat || getTodayIsoDate());
  const rentangIzin = formatPerizinanDateRange(
    row?.tanggalMulaiIzin,
    row?.tanggalSelesaiIzin,
    row?.rentangTanggal || '-'
  );
  const baseDetails = [
    `• No. Perizinan: ${row?.noPerizinan || row?.id || '-'}`,
    `• No. Surat: ${row?.noSuratPermohonan || '-'}`,
    `• Tanggal Surat: ${tglSurat}`,
    `• Nama Siswa: ${row?.namaSiswa || '-'} (NIS: ${formatNisVisual(row?.nis)})`,
    `• Kelas / Jurusan: ${row?.kelas || '-'} / ${row?.jurusan || '-'}`,
    `• Nama Ortu / Wali: ${row?.namaOrtuWali || '-'}`,
    `• Izin: ${row?.statusIzinOrtu || '-'}`,
    rentangIzin && rentangIzin !== '-' ? `• Rentang Tanggal: ${rentangIzin}` : '',
    `• Lokasi DUDI: ${dudiName || '-'}`,
    `• Alamat DUDI: ${alamat || '-'}`,
    pdfUrl && pdfUrl !== '-' ? `• Unduh Surat Resmi (PDF): ${pdfUrl}` : '',
    row?.linkBuktiBalasan && row.linkBuktiBalasan !== '-'
      ? `• Tautan Bukti Balasan: ${row.linkBuktiBalasan}`
      : '',
  ];

  if (recipientType === 'kakomli') {
    return [
      `Yth. Bapak/Ibu ${kakomliName || 'Ketua Kompetensi Keahlian'}`,
      `Ketua Kompetensi Keahlian ${row?.jurusan || 'Terkait'}`,
      'SMK PGRI 2 Ponorogo',
      '',
      'Dengan hormat,',
      'Kami informasikan penerbitan berkas Surat Permohonan / Perizinan PKL peserta didik jurusan Anda:',
      '',
      ...baseDetails,
      '',
      'Mohon dapat dipantau & dikoordinasikan bersama siswa/orang tua terkait tindak lanjut konfirmasi DUDI.',
      '',
      'Hormat kami,',
      'Pokja Hubin SMK PGRI 2 Ponorogo',
    ]
      .filter((line, idx, arr) => !(line === '' && arr[idx - 1] === ''))
      .join('\n');
  }

  return [
    'Yth. Pimpinan / Pembimbing Industri',
    `${dudiName || 'Mitra DUDI'}`,
    'di Tempat',
    '',
    'Dengan hormat,',
    'Kami dari Pokja Hubin SMK PGRI 2 Ponorogo menyampaikan surat permohonan & konfirmasi Perizinan PKL peserta didik kami:',
    '',
    ...baseDetails,
    '',
    'Mohon konfirmasi kesediaan penempatan PKL dari pihak Bapak/Ibu. Atas perhatian dan kerjasamanya kami ucapkan terima kasih.',
    '',
    'Hormat kami,',
    'Pokja Hubin SMK PGRI 2 Ponorogo',
  ]
    .filter((line, idx, arr) => !(line === '' && arr[idx - 1] === ''))
    .join('\n');
}
