import React, { useMemo, useState } from 'react';
import { Dudi, Guru, UserRole } from '../../core/types/schema';
import { ToastManager } from '../../core/ToastManager';
import {
  getOffsetWibIsoDate,
  getTodayWibIsoDate,
  normalizeToIsoDate,
} from '../../core/utils/dateHelpers';
import {
  isActivePlacementStatus,
  normalizeRelationText,
} from '../../core/utils/relationHelpers';
import { PengajuanService } from '../../services/PengajuanService';
import { PerizinanService } from '../../services/PerizinanService';
import { RelationSyncService } from '../../services/RelationSyncService';
import { SiswaPklService } from '../../services/SiswaPklService';
import { ModuleActionModalState } from './ModuleActionModal';
import { PerizinanWaModalState } from './PerizinanWaModal';
import {
  buildPerizinanWaModalState,
  getCustomRowActionsForModule,
  loadModuleGuruAndDudiOptions,
  ModuleConfirmConfig,
  moduleSupportsBulkApprove,
  moduleSupportsMonitoringRecap,
  moduleSupportsRelationSync,
} from './moduleWorkflowRegistry';

interface UseModuleWorkflowsParams<T extends { id: string }> {
  moduleId: string;
  userRole: UserRole;
  filteredData: T[];
  selectedIds: string[];
  refresh: () => Promise<void>;
  setConfirmModal: React.Dispatch<React.SetStateAction<ModuleConfirmConfig>>;
  onOpenDocsForStudent?: (
    studentData: any,
    selectedStudents?: any[],
    allStudents?: any[],
    sourceModuleId?: string
  ) => void;
}

export function useModuleWorkflows<T extends { id: string }>({
  moduleId,
  userRole,
  filteredData,
  selectedIds,
  refresh,
  setConfirmModal,
  onOpenDocsForStudent,
}: UseModuleWorkflowsParams<T>) {
  const isSuperAdmin = userRole === 'SuperAdmin';

  const [guruList, setGuruList] = useState<Guru[]>([]);
  const [dudiList, setDudiList] = useState<Dudi[]>([]);
  const [syncingRelations, setSyncingRelations] = useState(false);

  const [actionModal, setActionModal] = useState<ModuleActionModalState>({
    isOpen: false,
    type: null,
    row: null,
    reason: 'Kompetensi tidak linier',
    newDudi: '',
    guruPendamping: '',
    tanggalBerangkat: getTodayWibIsoDate(),
    tanggalRencanaTarik: getOffsetWibIsoDate(120),
    submitting: false,
  });

  const [waModal, setWaModal] = useState<PerizinanWaModalState>({
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

  const customRowActions = useMemo(
    () => getCustomRowActionsForModule(moduleId, userRole, Boolean(onOpenDocsForStudent)),
    [moduleId, userRole, onOpenDocsForStudent]
  );

  const supportsRelationSync = moduleSupportsRelationSync(moduleId);
  const supportsMonitoringRecap = moduleSupportsMonitoringRecap(moduleId);
  const supportsBulkApprove = moduleSupportsBulkApprove(moduleId, userRole);

  const refreshGuruAndDudiOptions = async () => {
    const res = await loadModuleGuruAndDudiOptions();
    setGuruList(res.gurus);
    setDudiList(res.dudis);
    return res;
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

  const handleCustomAction = async (actionName: string, row: T) => {
    const item = row as any;

    switch (actionName) {
      case 'approve_kakomli':
        setConfirmModal({
          isOpen: true,
          title: 'Setujui Pengajuan Siswa (ACC Kakomli)?',
          description: `Setujui permohonan PKL ${item.namaSiswa} di ${item.dudiTujuan}. Sistem juga akan membuatkan antrean berkas pada menu Perizinan PKL.`,
          variant: 'success',
          confirmText: 'Ya, Setujui & Catat',
          onConfirm: async () => {
            await PengajuanService.getInstance().approveByKakomli(row.id);
            await refresh();
          },
        });
        return;

      case 'create_perizinan':
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
        return;

      case 'reject_kakomli':
        setActionModal({
          isOpen: true,
          type: 'reject_kakomli',
          row: item,
          reason: 'Kompetensi tidak linier dengan bidang pekerjaan DUDI',
          newDudi: '',
          guruPendamping: '',
          tanggalBerangkat: getTodayWibIsoDate(),
          tanggalRencanaTarik: '',
          submitting: false,
        });
        return;

      case 'schedule_hubin': {
        const { dudis } = await refreshGuruAndDudiOptions();
        const targetDudiNorm = normalizeRelationText(item.dudiTujuan);
        const matchedDudi =
          (item.idDudi ? dudis.find((d) => d.id === item.idDudi) : undefined) ||
          dudis.find((d) => normalizeRelationText(d.namaDudi) === targetDudiNorm);
        setActionModal({
          isOpen: true,
          type: 'schedule_hubin',
          row: item,
          reason: '',
          newDudi: '',
          guruPendamping: item.guruPendamping || matchedDudi?.guruPendamping || '',
          tanggalBerangkat: normalizeToIsoDate(item.tanggalBerangkat) || getTodayWibIsoDate(),
          tanggalRencanaTarik: '',
          submitting: false,
        });
        return;
      }

      case 'send_wa_dudi': {
        const nextWaState = await buildPerizinanWaModalState(item);
        setWaModal(nextWaState);
        return;
      }

      case 'promote_to_pkl': {
        const { dudis } = await refreshGuruAndDudiOptions();
        const targetDudiNorm = normalizeRelationText(item.dudiTujuan);
        const matchedDudi =
          (item.idDudi ? dudis.find((d) => d.id === item.idDudi) : undefined) ||
          dudis.find((d) => normalizeRelationText(d.namaDudi) === targetDudiNorm);
        const todayWib = getTodayWibIsoDate();
        setActionModal({
          isOpen: true,
          type: 'promote_to_pkl',
          row: item,
          reason: '',
          newDudi: '',
          guruPendamping: matchedDudi?.guruPendamping || '',
          tanggalBerangkat: todayWib,
          tanggalRencanaTarik: getOffsetWibIsoDate(120, todayWib),
          submitting: false,
        });
        return;
      }

      case 'transfer_dudi': {
        if (!isActivePlacementStatus(item.statusPenempatan)) {
          ToastManager.getInstance().show(
            'Penempatan Sudah Non-Aktif',
            'info',
            `Pindah DUDI hanya berlaku untuk status Terjadwal / Sedang Berjalan (saat ini: ${item.statusPenempatan}).`
          );
          return;
        }
        await refreshGuruAndDudiOptions();
        const todayWib = getTodayWibIsoDate();
        setActionModal({
          isOpen: true,
          type: 'transfer_dudi',
          row: item,
          reason: '',
          newDudi: '',
          guruPendamping: item.guruPendamping || '',
          tanggalBerangkat: todayWib,
          tanggalRencanaTarik:
            normalizeToIsoDate(item.tanggalRencanaTarik) || getOffsetWibIsoDate(120, todayWib),
          submitting: false,
        });
        return;
      }

      case 'print_docs':
        if (onOpenDocsForStudent) {
          const selected = filteredData.filter((d) => selectedIds.includes(d.id));
          onOpenDocsForStudent(item, selected, filteredData, moduleId);
        }
        return;
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
      transfer_dudi: 'Memproses Pindah DUDI Siswa...',
    };
    const toastId = ToastManager.getInstance().show(
      toastTitleMap[actionModal.type],
      'pending',
      `${actionModal.row.namaSiswa} · ${actionModal.row.dudiTujuan || actionModal.row.namaDudi || ''}`
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
      } else if (actionModal.type === 'transfer_dudi') {
        if (
          !actionModal.newDudi.trim() ||
          !actionModal.guruPendamping.trim() ||
          !actionModal.tanggalBerangkat
        ) {
          throw new Error('DUDI tujuan baru, Guru Pendamping, dan Tanggal Berangkat wajib diisi.');
        }
        const res = await SiswaPklService.getInstance().transferDudi({
          sourcePlacementId: actionModal.row.id,
          newDudiName: actionModal.newDudi.trim(),
          newGuruPendamping: actionModal.guruPendamping.trim(),
          tanggalBerangkat: actionModal.tanggalBerangkat,
          tanggalRencanaTarik: actionModal.tanggalRencanaTarik,
          reason: actionModal.reason.trim(),
        });
        ToastManager.getInstance().update(
          toastId,
          'Pindah DUDI Berhasil Dicatat',
          'success',
          `${actionModal.row.namaSiswa} dipindahkan ke ${res.newPlacement.namaDudi}. Riwayat lama tersimpan sebagai Pindah DUDI.`
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

  const handleBulkApprove = supportsBulkApprove
    ? async () => {
        setConfirmModal({
          isOpen: true,
          title: `Setujui Massal ${selectedIds.length} Pengajuan Siswa?`,
          description:
            'Status pengajuan terpilih akan diubah menjadi Disetujui di Database Cloud Server.',
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
              const updatedCount = await PengajuanService.getInstance().bulkApproveByKakomli(
                selectedIds,
                undefined,
                { silentToast: true }
              );
              await refresh();
              ToastManager.getInstance().update(
                toastId,
                `${updatedCount} Pengajuan Disetujui (ACC)`,
                'success',
                'Seluruh pengajuan terpilih telah diperbarui secara massal & masuk antrean Perizinan.'
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
    : undefined;

  return {
    guruList,
    dudiList,
    syncingRelations,
    actionModal,
    setActionModal,
    waModal,
    setWaModal,
    customRowActions,
    supportsRelationSync,
    supportsMonitoringRecap,
    handleSyncRelations,
    handleCustomAction,
    handleActionModalSubmit,
    handleBulkApprove,
  };
}
