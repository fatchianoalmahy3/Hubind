import { GoogleSheetClient } from './GoogleSheetClient';
import { ToastManager } from './ToastManager';
import {
  type IssuedStageDetail,
  type LogPenerbitanSurat,
  type MonitoringStageControl,
} from './types/schema';
import { getTodayWibIsoDate } from './utils/dateHelpers';
import {
  extractIssuedStageNumber,
  getStageValueByNumber,
  isIssuedLetterStatusActive,
} from './utils/monitoringHelpers';
import { pickField } from './utils/rowFieldHelpers';
import { normalizeMonitoringStageControl } from './firebase/WorkspaceConfigStore';
import { normalizeStr } from './utils/rowFieldHelpers';
import { stripNisSymbols } from './utils/nisHelpers';
import { IndexedDbSheetCache } from './cache/IndexedDbSheetCache';
import { isBackendProxyUnavailableError, safeFetchJson } from './utils/safeFetchJson';
import { LocalAccountAuthService } from './auth/LocalAccountAuthService';
import {
  callAuthenticatedProxyWithGasAction,
  callPublicEndpoint,
  clearDirectSheetCache,
  ensureHydratedConfig,
  readSheetDirect,
  resolveAuthToken,
  writeSheetDirect,
} from './portal/portalTransport';
import {
  executeSwrCachedPublicList,
  invalidatePublicTeacherCaches,
  PUBLIC_SWR_SOFT_TTL_MS,
  PUBLIC_TEACHER_SWR_TTL_MS,
} from './portal/portalSwrCache';
import {
  directFetchDudiList,
  directFetchDudiStudents,
  directFetchPetugasDudi,
  directFetchPetugasList,
  directLookupStudentByNis,
  directSaveDudiContactVerification,
  directSubmitApplication,
  directSubmitDeliveryValidation,
  directSubmitMonitoring,
  directSubmitMonitoringBatch,
  directUpdateMonitoringGrades,
  directVerifyPetugasPin,
} from './portal/portalGasFallback';

export const PublicPortalClient = {
  async getConfigSummary(): Promise<{
    success: boolean;
    activeYear: string;
    isConfigured: boolean;
    hasGasUrl: boolean;
    spreadsheetName: string;
  }> {
    try {
      const { ok, data } = await safeFetchJson('/api/public/config-summary');
      if (ok && data?.success) {
        return data;
      }
    } catch {
      // Static SPA host -> fall back cleanly to Firestore config
    }

    const cfg = await ensureHydratedConfig();
    return {
      success: true,
      activeYear: cfg.activeYear,
      isConfigured: Boolean(cfg.spreadsheetId),
      hasGasUrl: Boolean(cfg.gasDeployUrl),
      spreadsheetName: cfg.spreadsheetName,
    };
  },

  async getDudiList(options?: {
    forceRefresh?: boolean;
    onUpdate?: (res: { success: boolean; total: number; data: any[] }) => void;
  }): Promise<{ success: boolean; total: number; data: any[] }> {
    const cfg = await ensureHydratedConfig();
    const idbKey = IndexedDbSheetCache.buildKey(
      cfg.spreadsheetId || 'public',
      cfg.activeYear || 'active',
      'public::dudi-list'
    );

    return executeSwrCachedPublicList({
      idbKey,
      inflightPrefix: 'dudi',
      softTtlMs: PUBLIC_SWR_SOFT_TTL_MS,
      forceRefresh: options?.forceRefresh,
      apiUrl: options?.forceRefresh
        ? `/api/public/dudi-list?fresh=1&_ts=${Date.now()}`
        : '/api/public/dudi-list',
      directFetcher: () => directFetchDudiList(Boolean(options?.forceRefresh)),
      onUpdate: options?.onUpdate,
    });
  },

  async lookupStudentByNis(nis: string): Promise<{
    success: boolean;
    found: boolean;
    message?: string;
    student?: any;
  }> {
    const rawSearchNis = nis.trim();
    const searchNisDigits = stripNisSymbols(rawSearchNis);
    const lookupKey = searchNisDigits || rawSearchNis;
    return callPublicEndpoint(
      () => safeFetchJson(`/api/public/student-lookup/${encodeURIComponent(lookupKey)}`),
      () => directLookupStudentByNis(nis)
    );
  },

  async submitApplication(payload: any): Promise<{
    success: boolean;
    verifiedInSpreadsheet?: boolean;
    sheetRowNumber?: number;
    savedAt?: string;
    deduplicated?: boolean;
    message: string;
    application: any;
  }> {
    const toastId = ToastManager.getInstance().show(
      'Menyimpan Pengajuan ke Cloud Server...',
      'pending',
      `Mengirim data pengajuan PKL ${payload?.nama || ''} ke Cloud Server`
    );

    try {
      const result = await callPublicEndpoint(
        () =>
          safeFetchJson('/api/public/submit-application', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }),
        () => directSubmitApplication(payload)
      );

      const isVerified = Boolean(result?.success) && result?.verifiedInSpreadsheet !== false;
      if (isVerified) {
        GoogleSheetClient.getInstance().invalidateClientSheetCache('Data_Pengajuan_PKL');
        GoogleSheetClient.getInstance().invalidateClientSheetCache('Master_DUDI');
        invalidatePublicTeacherCaches(false);
        ToastManager.getInstance().update(
          toastId,
          'Data Tersimpan di Server!',
          'success',
          `Pengajuan PKL ${payload.nama} (${result.application?.id || ''}) telah terverifikasi tersimpan di server.`
        );
      } else {
        ToastManager.getInstance().update(
          toastId,
          'Gagal Menyimpan Pengajuan',
          'error',
          result?.message || 'Data belum terverifikasi tersimpan di server. Silakan coba lagi.'
        );
        return {
          ...result,
          success: false,
          message:
            result?.message || 'Data belum terverifikasi tersimpan di server. Silakan coba lagi.',
        };
      }
      return result;
    } catch (err: any) {
      ToastManager.getInstance().update(
        toastId,
        'Gagal Menyimpan Pengajuan',
        'error',
        err?.message || 'Periksa koneksi internet Anda atau hubungi Admin Hubin.'
      );
      throw err;
    }
  },

  invalidateCaches(): void {
    clearDirectSheetCache();
    invalidatePublicTeacherCaches(true);
  },

  async getMonitoringStageConfig(forceRefresh = false): Promise<MonitoringStageControl> {
    try {
      const url = forceRefresh
        ? `/api/public/monitoring-stage-config?fresh=1&_ts=${Date.now()}`
        : '/api/public/monitoring-stage-config';
      const { ok, data } = await safeFetchJson(url, {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (ok && data?.success && data?.data) {
        return normalizeMonitoringStageControl(data.data);
      }
    } catch {
      // Fallback to Firestore client SDK below
    }

    const client = GoogleSheetClient.getInstance();
    if (!client.getConfig().isFirestoreHydrated || forceRefresh) {
      await client.initFromFirestore().catch(() => {});
    }
    return client.getMonitoringStageControl();
  },

  async saveDudiContactVerification(payload: {
    dudi_id: string;
    nama_dudi: string;
    alamat_dudi?: string;
    nama_pemimpin: string;
    nama_pic: string;
    no_telp_dudi: string;
    hari_kerja?: string;
    jam_kerja?: string;
    spelling_confirmed: boolean;
  }): Promise<{
    success: boolean;
    message: string;
    dudiContact: { namaPemimpin: string; pic: string; kontak: string; hariKerja?: string; jamKerja?: string };
  }> {
    const inputPemimpin = String(payload.nama_pemimpin || '').trim();
    const inputPic = String(payload.nama_pic || '').trim();
    const inputTelp = String(payload.no_telp_dudi || '').trim();
    if (
      !inputPemimpin ||
      inputPemimpin === '-' ||
      !inputPic ||
      inputPic === '-' ||
      inputTelp.replace(/\D/g, '').length < 7
    ) {
      throw new Error(
        'Nama Pemimpin DUDI, Nama PIC / Pembimbing DUDI, dan No. Telp / WhatsApp DUDI wajib diisi lengkap.'
      );
    }
    if (!payload.spelling_confirmed) {
      throw new Error('Harap centang konfirmasi kebenaran data dan ejaan sebelum menyimpan.');
    }

    const toastId = ToastManager.getInstance().show(
      'Menyimpan Data Pimpinan & Kontak DUDI...',
      'pending',
      `Menyinkronkan kontak resmi ${payload.nama_dudi} ke Database Cloud Server`
    );

    try {
      const res = await callPublicEndpoint(
        () =>
          safeFetchJson('/api/public/update-dudi-contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }),
        () => directSaveDudiContactVerification(payload)
      );

      GoogleSheetClient.getInstance().invalidateClientSheetCache('Master_DUDI');
      GoogleSheetClient.getInstance().invalidateClientSheetCache('Data_Pengajuan_PKL');
      invalidatePublicTeacherCaches(false);
      ToastManager.getInstance().update(
        toastId,
        'Data Kontak DUDI Tersimpan!',
        'success',
        `${payload.nama_dudi} · Pimpinan: ${inputPemimpin}`
      );
      return res;
    } catch (err: any) {
      ToastManager.getInstance().update(
        toastId,
        'Gagal Menyimpan Data DUDI',
        'error',
        err?.message || 'Periksa kembali kelengkapan dan konfirmasi ejaan data DUDI.'
      );
      throw err;
    }
  },

  async getPetugasList(options?: {
    forceRefresh?: boolean;
    onUpdate?: (res: { success: boolean; total: number; data: any[] }) => void;
  }): Promise<{ success: boolean; total: number; data: any[] }> {
    const cfg = await ensureHydratedConfig();
    const idbKey = IndexedDbSheetCache.buildKey(
      cfg.spreadsheetId || 'public',
      cfg.activeYear || 'active',
      'public::petugas-list'
    );

    return executeSwrCachedPublicList({
      idbKey,
      inflightPrefix: 'petugas',
      softTtlMs: PUBLIC_SWR_SOFT_TTL_MS,
      forceRefresh: options?.forceRefresh,
      trackKey: true,
      apiUrl: options?.forceRefresh
        ? `/api/public/petugas-list?fresh=1&_ts=${Date.now()}`
        : '/api/public/petugas-list',
      directFetcher: () => directFetchPetugasList(Boolean(options?.forceRefresh)),
      onUpdate: options?.onUpdate,
    });
  },

  prefetchPublicPortal(target: 'student' | 'teacher'): void {
    if (target === 'student') {
      void this.getDudiList().catch(() => {});
    } else {
      void this.getPetugasList().catch(() => {});
    }
  },

  async verifyPetugasPin(params: {
    petugas_id: string;
    nama_petugas: string;
    pin: string;
  }): Promise<{
    success: boolean;
    message: string;
    sessionToken?: string;
    verifiedPetugas?: { id: string; nama: string; nip: string; verifiedAt: string };
  }> {
    return callPublicEndpoint(
      () =>
        safeFetchJson('/api/public/verify-petugas-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        }),
      () => directVerifyPetugasPin(params)
    );
  },

  async getPetugasDudi(
    petugasNama: string,
    petugasId: string,
    options?: {
      forceRefresh?: boolean;
      onUpdate?: (res: { success: boolean; total: number; data: any[] }) => void;
    }
  ): Promise<{ success: boolean; total: number; data: any[] }> {
    const cfg = GoogleSheetClient.getInstance().getConfig();
    const teacherKey = `${String(petugasId || '').trim()}::${normalizeStr(petugasNama)}`;
    const idbKey = IndexedDbSheetCache.buildKey(
      cfg.spreadsheetId || 'public',
      cfg.activeYear || 'active',
      `public::petugas-dudi::${teacherKey}`
    );

    return executeSwrCachedPublicList({
      idbKey,
      inflightPrefix: 'petugas_dudi',
      softTtlMs: PUBLIC_TEACHER_SWR_TTL_MS,
      forceRefresh: options?.forceRefresh,
      trackKey: true,
      useSyncIdbHit: true,
      apiUrl: `/api/public/petugas-dudi?petugasNama=${encodeURIComponent(
        petugasNama
      )}&petugasId=${encodeURIComponent(petugasId)}`,
      directFetcher: () => directFetchPetugasDudi(petugasNama, petugasId),
      onUpdate: options?.onUpdate,
    });
  },

  async getDudiStudents(
    dudiNama: string,
    dudiId: string,
    petugasNama: string,
    options?: {
      petugasId?: string;
      forceRefresh?: boolean;
      onUpdate?: (res: {
        success: boolean;
        total: number;
        data: any[];
        stageControl?: MonitoringStageControl;
        issuedStages?: number[];
        issuedStageDetails?: Record<number, IssuedStageDetail>;
      }) => void;
    }
  ): Promise<{
    success: boolean;
    total: number;
    data: any[];
    stageControl?: MonitoringStageControl;
    issuedStages?: number[];
    issuedStageDetails?: Record<number, IssuedStageDetail>;
  }> {
    const cfg = GoogleSheetClient.getInstance().getConfig();
    const petugasId = String(options?.petugasId || '').trim();
    const dudiKey = `${String(dudiId || '').trim()}::${normalizeStr(dudiNama)}::${petugasId}::${normalizeStr(petugasNama)}`;
    const idbKey = IndexedDbSheetCache.buildKey(
      cfg.spreadsheetId || 'public',
      cfg.activeYear || 'active',
      `public::dudi-students::${dudiKey}`
    );

    return executeSwrCachedPublicList<{
      stageControl?: MonitoringStageControl;
      issuedStages?: number[];
      issuedStageDetails?: Record<number, IssuedStageDetail>;
    }>({
      idbKey,
      inflightPrefix: 'dudi_students',
      softTtlMs: PUBLIC_TEACHER_SWR_TTL_MS,
      forceRefresh: options?.forceRefresh,
      trackKey: true,
      useSyncIdbHit: true,
      apiUrl: `/api/public/dudi-students?dudiNama=${encodeURIComponent(
        dudiNama
      )}&dudiId=${encodeURIComponent(dudiId || '')}&petugasNama=${encodeURIComponent(
        petugasNama
      )}&petugasId=${encodeURIComponent(petugasId)}${
        options?.forceRefresh ? `&fresh=1&_ts=${Date.now()}` : ''
      }`,
      directFetcher: () => directFetchDudiStudents(dudiNama, dudiId, petugasNama, petugasId),
      onUpdate: options?.onUpdate,
    });
  },

  async submitMonitoring(payload: any): Promise<{
    success: boolean;
    verifiedInSpreadsheet?: boolean;
    sheetRowNumber?: number;
    savedAt?: string;
    gradeSynced?: boolean;
    dudiContactSynced?: boolean;
    dudiContact?: { namaPemimpin: string; pic: string; kontak: string; hariKerja?: string; jamKerja?: string };
    message: string;
    monitoring: any;
  }> {
    const toastId = ToastManager.getInstance().show(
      'Menyimpan Monitoring ke Cloud Server...',
      'pending',
      `Menyimpan ${payload?.tahap_monitoring || 'Monitoring'} untuk ${payload?.nama_siswa || 'Siswa'} ke Cloud Server`
    );

    try {
      const res = await callPublicEndpoint(
        () =>
          safeFetchJson('/api/public/submit-monitoring', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }),
        () => directSubmitMonitoring(payload)
      );

      const verifiedFlag: boolean | undefined = res?.verifiedInSpreadsheet;
      const isVerified = Boolean(res?.success) && verifiedFlag !== false;
      if (isVerified) {
        GoogleSheetClient.getInstance().invalidateClientSheetCache('Monitoring_5_Tahap');
        if (res.gradeSynced) {
          GoogleSheetClient.getInstance().invalidateClientSheetCache('data_plotting');
        }
        if (res.dudiContactSynced) {
          GoogleSheetClient.getInstance().invalidateClientSheetCache('Master_DUDI');
          GoogleSheetClient.getInstance().invalidateClientSheetCache('Data_Pengajuan_PKL');
        }
        invalidatePublicTeacherCaches();
        const nilaiSuffix = res.gradeSynced
          ? ` · Nilai DUDI (${
              res.monitoring?.Nilai_rata_rata ??
              res.monitoring?.Nilai_Rata_Rata ??
              payload.nilai_rata_rata
            }) tersinkron`
          : '';
        ToastManager.getInstance().update(
          toastId,
          res.gradeSynced
            ? 'Monitoring & Nilai Tersimpan di Server!'
            : 'Data Tersimpan di Server!',
          'success',
          `${payload.nama_siswa} · ${payload.tahap_monitoring} (S:${payload.sakit ?? 0} I:${
            payload.izin ?? 0
          } A:${payload.alpha ?? 0})${nilaiSuffix}`
        );
      } else {
        const failMsg =
          res?.message || 'Data belum terverifikasi tersimpan di server. Silakan kirim ulang.';
        ToastManager.getInstance().update(
          toastId,
          'Data Belum Tersimpan di Server',
          'error',
          failMsg
        );
        return {
          ...res,
          success: false,
          message: failMsg,
        };
      }

      return res;
    } catch (err: any) {
      ToastManager.getInstance().update(
        toastId,
        'Gagal Menyimpan Monitoring',
        'error',
        err?.message || 'Periksa koneksi internet Anda atau hubungi Admin Hubin.'
      );
      throw err;
    }
  },

  async submitMonitoringBatch(payload: any): Promise<{
    success: boolean;
    verifiedInSpreadsheet?: boolean;
    sheetRowNumber?: number;
    savedAt?: string;
    savedCount: number;
    gradeSyncedCount?: number;
    dudiContactSynced?: boolean;
    dudiContact?: {
      namaPemimpin: string;
      pic: string;
      kontak: string;
      hariKerja?: string;
      jamKerja?: string;
    };
    results: Array<{
      nis: string;
      namaSiswa: string;
      idPenempatan: string;
      idMonitoring: string;
      tanggal: string;
      sakit: number;
      izin: number;
      alpha: number;
      bukuLaporan: string;
      aktivitasDp: string;
      aktivitasMt: string;
      aktivitasKrt: string;
      ttdSiswa: string;
      catatan: string;
      status: string;
      gradeAvg?: number;
      gradePredikat?: string;
      gradeSummary?: {
        monitoringId: string;
        k3lh: number;
        softskill: number;
        teknis: number;
        alurBisnis: number;
        rataRata: number;
        tahapDiinput: string;
        tanggal: string;
      };
    }>;
    message: string;
  }> {
    const studentCount = Array.isArray(payload?.students) ? payload.students.length : 1;
    const toastId = ToastManager.getInstance().show(
      'Menyimpan Batch Monitoring ke Cloud Server...',
      'pending',
      `Menyimpan ${payload?.tahap_monitoring || 'Monitoring'} untuk ${studentCount} siswa (${payload?.nama_dudi || 'DUDI'})`
    );

    try {
      const res = await callPublicEndpoint(
        () =>
          safeFetchJson('/api/public/submit-monitoring-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }),
        () => directSubmitMonitoringBatch(payload)
      );

      const verifiedFlag: boolean | undefined = res?.verifiedInSpreadsheet;
      const isVerified = Boolean(res?.success) && verifiedFlag !== false;
      if (isVerified) {
        GoogleSheetClient.getInstance().invalidateClientSheetCache('Monitoring_5_Tahap');
        if ((res.gradeSyncedCount ?? 0) > 0) {
          GoogleSheetClient.getInstance().invalidateClientSheetCache('data_plotting');
        }
        if (res.dudiContactSynced) {
          GoogleSheetClient.getInstance().invalidateClientSheetCache('Master_DUDI');
          GoogleSheetClient.getInstance().invalidateClientSheetCache('Data_Pengajuan_PKL');
        }
        invalidatePublicTeacherCaches();
        const gradeSuffix =
          (res.gradeSyncedCount ?? 0) > 0
            ? ` · ${res.gradeSyncedCount} nilai tersinkron`
            : '';
        ToastManager.getInstance().update(
          toastId,
          'Batch Monitoring Tersimpan di Server!',
          'success',
          `${payload?.nama_dudi || 'DUDI'} · ${res.savedCount || studentCount} siswa (${payload?.tahap_monitoring || ''})${gradeSuffix}`
        );
      } else {
        const failMsg =
          res?.message || 'Data batch belum terverifikasi tersimpan di server. Silakan kirim ulang.';
        ToastManager.getInstance().update(
          toastId,
          'Data Belum Tersimpan di Server',
          'error',
          failMsg
        );
        return {
          ...res,
          success: false,
          message: failMsg,
        };
      }

      return res;
    } catch (err: any) {
      ToastManager.getInstance().update(
        toastId,
        'Gagal Menyimpan Batch Monitoring',
        'error',
        err?.message || 'Periksa koneksi internet Anda atau hubungi Admin Hubin.'
      );
      throw err;
    }
  },

  async submitDeliveryValidation(payload: any): Promise<{
    success: boolean;
    verifiedInSpreadsheet?: boolean;
    sheetRowNumber?: number;
    savedAt?: string;
    dudiContactSynced?: boolean;
    dudiContact?: {
      namaPemimpin: string;
      pic: string;
      kontak: string;
      hariKerja?: string;
      jamKerja?: string;
    };
    savedCount: number;
    results: Array<{
      nis: string;
      namaSiswa: string;
      idPenempatan: string;
      idMonitoring: string;
      tanggal: string;
      ttdSiswa: string;
      catatan: string;
      status: string;
      sheetRowNumber?: number;
    }>;
    message: string;
  }> {
    const studentCount = Array.isArray(payload?.students) ? payload.students.length : 1;
    const toastId = ToastManager.getInstance().show(
      'Menyimpan Validasi & Pengantaran DUDI...',
      'pending',
      `Menyinkronkan data petugas ${payload?.nama_dudi || 'DUDI'} & ${studentCount} siswa ke Cloud Server`
    );

    try {
      const res = await callPublicEndpoint(
        () =>
          safeFetchJson('/api/public/submit-delivery', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }),
        () => directSubmitDeliveryValidation(payload)
      );

      const verifiedFlag: boolean | undefined = res?.verifiedInSpreadsheet;
      const isVerified = Boolean(res?.success) && verifiedFlag !== false;
      if (isVerified) {
        GoogleSheetClient.getInstance().invalidateClientSheetCache('Monitoring_5_Tahap');
        GoogleSheetClient.getInstance().invalidateClientSheetCache('Master_DUDI');
        GoogleSheetClient.getInstance().invalidateClientSheetCache('Data_Pengajuan_PKL');
        invalidatePublicTeacherCaches();
        ToastManager.getInstance().update(
          toastId,
          'Data Pengantaran Tersimpan di Server!',
          'success',
          `${payload?.nama_dudi || 'DUDI'} · ${res.savedCount || studentCount} siswa terverifikasi tersimpan di server`
        );
      } else {
        const failMsg =
          res?.message || 'Data pengantaran belum terverifikasi tersimpan di server. Silakan kirim ulang.';
        ToastManager.getInstance().update(
          toastId,
          'Data Belum Tersimpan di Server',
          'error',
          failMsg
        );
        return {
          ...res,
          success: false,
          message: failMsg,
        };
      }

      return res;
    } catch (err: any) {
      ToastManager.getInstance().update(
        toastId,
        'Gagal Menyimpan Pengantaran',
        'error',
        err?.message || 'Periksa koneksi internet Anda atau hubungi Admin Hubin.'
      );
      throw err;
    }
  },

  async updateMonitoringGrades(payload: {
    monitoring_id?: string;
    id_penempatan?: string;
    nis: string;
    nama_siswa: string;
    kelas?: string;
    jurusan?: string;
    dudi_id?: string;
    nama_dudi?: string;
    alamat_dudi?: string;
    guru_id?: string;
    guru_pembimbing?: string;
    tahap_monitoring?: string;
    tanggal?: string;
    nilai_k3lh: number;
    nilai_softskill: number;
    nilai_kompetensi_teknis: number;
    nilai_alur_bisnis: number;
  }): Promise<{
    success: boolean;
    nilaiSynced?: boolean;
    message: string;
    gradeSummary: {
      monitoringId?: string;
      k3lh: number;
      softskill: number;
      teknis: number;
      alurBisnis: number;
      rataRata: number;
      predikat: string;
      tahapDiinput?: string;
      tanggal?: string;
    };
  }> {
    const toastId = ToastManager.getInstance().show(
      'Menyimpan Perubahan Nilai ke Cloud Server...',
      'pending',
      `Memperbarui nilai PKL ${payload.nama_siswa} di Cloud Server`
    );

    try {
      const res = await callPublicEndpoint(
        () =>
          safeFetchJson('/api/public/update-grades', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }),
        () => directUpdateMonitoringGrades(payload)
      );

      if (res?.success) {
        GoogleSheetClient.getInstance().invalidateClientSheetCache('Monitoring_5_Tahap');
        if (res.nilaiSynced) {
          GoogleSheetClient.getInstance().invalidateClientSheetCache('data_plotting');
        }
        invalidatePublicTeacherCaches();
        ToastManager.getInstance().update(
          toastId,
          'Perubahan Nilai Tersimpan di Cloud Server!',
          'success',
          `${payload.nama_siswa}: Rata-rata ${res.gradeSummary?.rataRata ?? ''} (${
            res.gradeSummary?.predikat ?? ''
          })`
        );
        if (res.nilaiSynced) {
          ToastManager.getInstance().show(
            'Rekap Nilai Diperbarui di Server!',
            'success',
            `Nilai DUDI terbaru untuk ${payload.nama_siswa} (${res.gradeSummary?.rataRata}) telah disinkronkan ke Cloud Server.`
          );
        }
      } else {
        ToastManager.getInstance().update(
          toastId,
          'Gagal Memperbarui Nilai',
          'error',
          res?.message || 'Gagal menyimpan perubahan nilai ke Cloud Server.'
        );
      }

      return res;
    } catch (err: any) {
      ToastManager.getInstance().update(
        toastId,
        'Gagal Memperbarui Nilai',
        'error',
        err?.message || 'Periksa koneksi internet Anda atau hubungi Admin Hubin.'
      );
      throw err;
    }
  },

  async generatePerizinanPdf(payload: {
    perizinanId?: string;
    pengajuanId?: string;
    sourceSheet?: 'Data_Pengajuan_PKL' | 'Data_Perizinan_PKL';
    noPerizinan?: string;
    noPengajuan?: string;
    noSuratPermohonan?: string;
    namaSiswa?: string;
    nis?: string;
    kelas?: string;
    jurusan?: string;
    dudiTujuan?: string;
    alamatDudi?: string;
    tanggalSurat?: string;
    kepalaSekolah?: string;
  }): Promise<{
    success: boolean;
    pdfUrl: string;
    fileId: string;
    fileName: string;
    message?: string;
  }> {
    const toastId = ToastManager.getInstance().show(
      'Membuat Surat PDF di Google Drive...',
      'pending',
      `Mengonversi surat permohonan ${payload.namaSiswa || ''} ke PDF`
    );

    const targetSheet =
      payload.sourceSheet ||
      (payload.pengajuanId || payload.noPengajuan ? 'Data_Pengajuan_PKL' : 'Data_Perizinan_PKL');
    const targetRecordId = String(payload.pengajuanId || payload.perizinanId || '').trim();

    try {
      const result = await callAuthenticatedProxyWithGasAction<{
        success: boolean;
        pdfUrl: string;
        fileId: string;
        fileName: string;
        message?: string;
      }>({
        proxyUrl: '/api/perizinan/generate-pdf',
        proxyTimeoutMs: 30_000,
        proxyFailDefaultMsg: 'Gagal membuat PDF surat',
        gasAction: 'GENERATE_SURAT_IZIN_PDF',
        gasTimeoutMs: 32_000,
        payload: {
          ...payload,
          perizinanId: payload.perizinanId || targetRecordId,
          noPerizinan: payload.noPerizinan || payload.noPengajuan || targetRecordId,
        },
        mapGasResult: async (json, status, ok) => {
          if (!ok || json?.error || !json?.pdfUrl) {
            throw new Error(
              json?.error ||
                `Apps Script belum mengembalikan URL PDF (HTTP ${status}). Pastikan kode GAS sudah di-Deploy ulang versi terbaru.`
            );
          }
          const pdfUrl = String(json.pdfUrl).trim();
          if (targetRecordId) {
            if (targetSheet === 'Data_Pengajuan_PKL') {
              await writeSheetDirect('Data_Pengajuan_PKL', 'UPDATE', {
                id: targetRecordId,
                No_Pengajuan: targetRecordId,
                ...(payload.noSuratPermohonan
                  ? {
                      No_Surat_Permohonan: payload.noSuratPermohonan,
                      noSuratPermohonan: payload.noSuratPermohonan,
                    }
                  : {}),
                Link_Surat_PDF: pdfUrl,
                linkSuratPdf: pdfUrl,
              }).catch(() => {});
            } else {
              await writeSheetDirect('Data_Perizinan_PKL', 'UPDATE', {
                id: targetRecordId,
                ID_Perizinan: targetRecordId,
                Link_Bukti_Balasan: pdfUrl,
                linkBuktiBalasan: pdfUrl,
              }).catch(() => {});
            }
          }
          return {
            success: true,
            pdfUrl,
            fileId: String(json.fileId || ''),
            fileName: String(json.fileName || ''),
            message: 'Surat Permohonan PDF berhasil dibuat di Google Drive.',
          };
        },
      });

      GoogleSheetClient.getInstance().invalidateClientSheetCache(targetSheet);
      ToastManager.getInstance().update(
        toastId,
        'PDF Surat Siap di Google Drive!',
        'success',
        'Tautan PDF otomatis ditambahkan ke pesan WhatsApp & database.'
      );
      return result;
    } catch (err: any) {
      ToastManager.getInstance().update(
        toastId,
        'Gagal Membuat PDF Surat',
        'error',
        err?.message || 'Pastikan GAS Web App versi terbaru sudah di-Deploy & diotorisasi Google Drive.'
      );
      throw err;
    }
  },

  async generateMonitoringBundlePdf(payload: {
    templateIds: {
      suratTugas?: string;
      monitoring?: string;
      nilai?: string;
    };
    includeDocs: {
      suratTugas: boolean;
      monitoring: boolean;
      nilai: boolean;
    };
    meta: {
      tahapNum: number;
      tahapLabel: string;
      tahunAjaran: string;
      nomorSurat: string;
      tanggalSurat: string;
      kepalaSekolah: string;
    };
    bundles: Array<{
      dudiId?: string;
      namaDudi: string;
      alamatDudi: string;
      pemimpinDudi: string;
      noTelpDudi: string;
      namaGuru: string;
      nipGuru: string;
      jabatanGuru: string;
      students: Array<{
        nis: string;
        namaSiswa: string;
        kelas: string;
        jurusan: string;
      }>;
    }>;
  }): Promise<{
    success: boolean;
    pdfUrl: string;
    fileId: string;
    fileName: string;
    totalSheets: number;
    issuedRecorded?: boolean;
    issuedCount?: number;
    message?: string;
  }> {
    const toastId = ToastManager.getInstance().show(
      'Menyusun Paket PDF dari Template Google Docs...',
      'pending',
      `Mengisi placeholder untuk ${payload.bundles.length} DUDI dan menggabungkan PDF di Google Drive`
    );

    try {
      const result = await callAuthenticatedProxyWithGasAction<{
        success: boolean;
        pdfUrl: string;
        fileId: string;
        fileName: string;
        totalSheets: number;
        issuedRecorded?: boolean;
        issuedCount?: number;
        message?: string;
      }>({
        proxyUrl: '/api/documents/generate-monitoring-bundle',
        proxyTimeoutMs: 58_000,
        proxyFailDefaultMsg: 'Gagal menyusun paket PDF',
        gasAction: 'GENERATE_MONITORING_BUNDLE_PDF',
        gasTimeoutMs: 58_000,
        payload,
        mapGasResult: async (json, status, ok) => {
          if (!ok || json?.error || !json?.pdfUrl) {
            throw new Error(
              json?.error ||
                `Apps Script belum mengembalikan URL PDF paket (HTTP ${status}). Pastikan kode GAS terbaru sudah di-Deploy.`
            );
          }
          const pdfUrl = String(json.pdfUrl).trim();
          const recorded = await PublicPortalClient.markIssuedLetters(
            payload.bundles.map((b) => ({
              dudiId: b.dudiId || '',
              namaDudi: b.namaDudi,
              tahap: payload.meta.tahapNum,
              jenisDokumen: 'Paket PDF Drive',
              nomorSurat: payload.meta.nomorSurat,
              tanggalTerbit: payload.meta.tanggalSurat,
              guruPendamping: b.namaGuru,
              linkPdf: pdfUrl,
            }))
          ).catch(() => ({ count: 0 }));
          return {
            success: true,
            pdfUrl,
            fileId: String(json.fileId || ''),
            fileName: String(json.fileName || ''),
            totalSheets: Number(json.totalSheets || 0),
            issuedRecorded: recorded.count > 0,
            issuedCount: recorded.count,
            message: 'Paket dokumen monitoring PDF berhasil dibuat dari Template Google Docs.',
          };
        },
      });

      GoogleSheetClient.getInstance().invalidateClientSheetCache('Log_Penerbitan_Surat');
      invalidatePublicTeacherCaches(false);
      ToastManager.getInstance().update(
        toastId,
        'Paket PDF Siap Dicetak!',
        'success',
        `${result.totalSheets || payload.bundles.length} lembar dokumen selesai digabung ke Google Drive.`
      );
      return result;
    } catch (err: any) {
      ToastManager.getInstance().update(
        toastId,
        'Gagal Membuat Paket PDF',
        'error',
        err?.message || 'Pastikan template Google Docs terpasang & GAS versi terbaru sudah di-Deploy.'
      );
      throw err;
    }
  },

  async getIssuedLetters(forceRefresh = false): Promise<LogPenerbitanSurat[]> {
    try {
      const token = await resolveAuthToken();
      if (token) {
        const { ok, data } = await safeFetchJson(
          `/api/documents/issued-letters${forceRefresh ? `?fresh=1&_ts=${Date.now()}` : ''}`,
          {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              Authorization: `Bearer ${token}`,
            },
            timeoutMs: 12_000,
          }
        );
        if (ok && data?.success && Array.isArray(data.data)) {
          return data.data;
        }
      }
    } catch {
      // Fallback to direct sheet read below
    }

    const rows = await readSheetDirect('Log_Penerbitan_Surat', true, forceRefresh).catch(
      () => [] as any[]
    );
    return rows.map((row: any, idx: number) => {
      const idTerbit =
        pickField(row, 'ID_Terbit', 'idTerbit', 'id') ||
        `TRB-ROW-${Number(row?._sheetRowNumber || idx + 2)}`;
      const tahap =
        extractIssuedStageNumber(row?.Tahap ?? row?.tahap) ||
        extractIssuedStageNumber(row?.Nama_Tahap ?? row?.namaTahap) ||
        1;
      return {
        id: idTerbit,
        idTerbit,
        idDudi: pickField(row, 'ID_DUDI', 'idDudi'),
        namaDudi: pickField(row, 'Nama_DUDI', 'namaDudi'),
        tahap,
        namaTahap: pickField(row, 'Nama_Tahap', 'namaTahap') || getStageValueByNumber(tahap),
        statusTerbit: pickField(row, 'Status_Terbit', 'statusTerbit') || 'Sudah Terbit',
        jenisDokumen: pickField(row, 'Jenis_Dokumen', 'jenisDokumen'),
        nomorSurat: pickField(row, 'Nomor_Surat', 'nomorSurat'),
        tanggalTerbit: pickField(row, 'Tanggal_Terbit', 'tanggalTerbit'),
        diterbitkanOleh: pickField(row, 'Diterbitkan_Oleh', 'diterbitkanOleh'),
        guruPendamping: pickField(row, 'Guru_Pendamping', 'guruPendamping'),
        linkPdf: pickField(row, 'Link_PDF', 'linkPdf'),
        updatedAt: pickField(row, 'Updated_At', 'updatedAt'),
      };
    });
  },

  async markIssuedLetters(
    items: Array<{
      dudiId?: string;
      namaDudi: string;
      tahap: number;
      jenisDokumen?: string;
      nomorSurat?: string;
      tanggalTerbit?: string;
      diterbitkanOleh?: string;
      guruPendamping?: string;
      linkPdf?: string;
    }>
  ): Promise<{ success: boolean; count: number; data: LogPenerbitanSurat[] }> {
    if (!Array.isArray(items) || items.length === 0) {
      return { success: true, count: 0, data: [] };
    }

    try {
      const token = await resolveAuthToken();
      if (token) {
        const { ok, status, data } = await safeFetchJson('/api/documents/mark-issued', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ items }),
          timeoutMs: 25_000,
        });
        if (ok && data?.success) {
          clearDirectSheetCache();
          GoogleSheetClient.getInstance().invalidateClientSheetCache('Log_Penerbitan_Surat');
          invalidatePublicTeacherCaches(false);
          return {
            success: true,
            count: Number(data.count || data.data?.length || items.length),
            data: Array.isArray(data.data) ? data.data : [],
          };
        }
        if (status < 500 && status !== 404 && status !== 405 && data?.message) {
          throw new Error(data.message);
        }
      }
    } catch (err: any) {
      if (!isBackendProxyUnavailableError(err)) {
        throw err;
      }
    }

    // Direct GAS SPA fallback
    const [existingRows, dudiRows] = await Promise.all([
      readSheetDirect('Log_Penerbitan_Surat', true, true).catch(() => [] as any[]),
      readSheetDirect('Master_DUDI', true, false).catch(() => [] as any[]),
    ]);
    const todayIso = getTodayWibIsoDate();
    const nowIso = new Date().toISOString();
    const workingExisting = [...existingRows];
    const written: LogPenerbitanSurat[] = [];

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const tahap = Number(item.tahap);
      if (!Number.isInteger(tahap) || tahap < 1 || tahap > 8) continue;
      const rawName = String(item.namaDudi || '').trim();
      let resolvedDudiId = String(item.dudiId || '').trim();
      const targetNorm = normalizeStr(rawName);
      if (!resolvedDudiId && targetNorm) {
        const matchedDudi = dudiRows.find(
          (d: any) => normalizeStr(pickField(d, 'Nama_DUDI', 'namaDudi')) === targetNorm
        );
        if (matchedDudi) {
          resolvedDudiId = pickField(matchedDudi, 'ID', 'id');
        }
      }
      const resolvedDudiNama = rawName || resolvedDudiId;
      if (!resolvedDudiNama && !resolvedDudiId) continue;

      const existingIdx = workingExisting.findIndex((r: any) => {
        const rowStage =
          extractIssuedStageNumber(r.Tahap ?? r.tahap) ||
          extractIssuedStageNumber(r.Nama_Tahap ?? r.namaTahap);
        if (rowStage !== tahap) return false;
        const rId = pickField(r, 'ID_DUDI', 'idDudi');
        const rNama = normalizeStr(pickField(r, 'Nama_DUDI', 'namaDudi'));
        return (
          (resolvedDudiId && rId && rId === resolvedDudiId) ||
          (targetNorm && rNama && rNama === targetNorm)
        );
      });

      const existingRow = existingIdx >= 0 ? workingExisting[existingIdx] : null;
      const idTerbit =
        (existingRow && pickField(existingRow, 'ID_Terbit', 'idTerbit', 'id')) ||
        `TRB-${(resolvedDudiId || 'DUDI').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24)}-T${tahap}-${Date.now().toString(36).slice(-4)}${i}`;
      const namaTahap = getStageValueByNumber(tahap);

      const recordPayload: Record<string, any> = {
        id: idTerbit,
        ID_Terbit: idTerbit,
        idTerbit,
        ID_DUDI: resolvedDudiId,
        idDudi: resolvedDudiId,
        Nama_DUDI: resolvedDudiNama,
        namaDudi: resolvedDudiNama,
        Tahap: tahap,
        tahap,
        Nama_Tahap: namaTahap,
        namaTahap,
        Status_Terbit: 'Sudah Terbit',
        statusTerbit: 'Sudah Terbit',
        Jenis_Dokumen: item.jenisDokumen || 'Paket / Surat Monitoring',
        jenisDokumen: item.jenisDokumen || 'Paket / Surat Monitoring',
        Nomor_Surat: item.nomorSurat || '',
        nomorSurat: item.nomorSurat || '',
        Tanggal_Terbit: item.tanggalTerbit || todayIso,
        tanggalTerbit: item.tanggalTerbit || todayIso,
        Diterbitkan_Oleh: item.diterbitkanOleh || 'Admin Hubin',
        diterbitkanOleh: item.diterbitkanOleh || 'Admin Hubin',
        Guru_Pendamping: item.guruPendamping || '',
        guruPendamping: item.guruPendamping || '',
        Link_PDF: item.linkPdf || '',
        linkPdf: item.linkPdf || '',
        Updated_At: nowIso,
        updatedAt: nowIso,
      };

      if (existingRow) {
        await writeSheetDirect('Log_Penerbitan_Surat', 'UPDATE', {
          ...recordPayload,
          _sheetRowNumber: existingRow._sheetRowNumber,
        });
        workingExisting[existingIdx] = { ...existingRow, ...recordPayload };
      } else {
        await writeSheetDirect('Log_Penerbitan_Surat', 'CREATE', recordPayload);
        workingExisting.push(recordPayload);
      }

      written.push({
        id: idTerbit,
        idTerbit,
        idDudi: resolvedDudiId,
        namaDudi: resolvedDudiNama,
        tahap,
        namaTahap,
        statusTerbit: 'Sudah Terbit',
        jenisDokumen: recordPayload.Jenis_Dokumen,
        nomorSurat: recordPayload.Nomor_Surat,
        tanggalTerbit: recordPayload.Tanggal_Terbit,
        diterbitkanOleh: recordPayload.Diterbitkan_Oleh,
        guruPendamping: recordPayload.Guru_Pendamping,
        linkPdf: recordPayload.Link_PDF,
        updatedAt: nowIso,
      });
    }

    clearDirectSheetCache();
    GoogleSheetClient.getInstance().invalidateClientSheetCache('Log_Penerbitan_Surat');
    invalidatePublicTeacherCaches(false);
    return { success: true, count: written.length, data: written };
  },

  async revokeIssuedLetter(params: {
    idTerbit?: string;
    dudiId?: string;
    namaDudi?: string;
    tahap: number;
    actorName?: string;
  }): Promise<{ success: boolean; revoked: boolean }> {
    try {
      const token = await resolveAuthToken();
      if (token) {
        const { ok, status, data } = await safeFetchJson('/api/documents/revoke-issued', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(params),
          timeoutMs: 20_000,
        });
        if (ok && data?.success) {
          clearDirectSheetCache();
          GoogleSheetClient.getInstance().invalidateClientSheetCache('Log_Penerbitan_Surat');
          invalidatePublicTeacherCaches(false);
          return { success: true, revoked: Boolean(data.revoked) };
        }
        if (status < 500 && status !== 404 && status !== 405 && data?.message) {
          throw new Error(data.message);
        }
      }
    } catch (err: any) {
      if (!isBackendProxyUnavailableError(err)) {
        throw err;
      }
    }

    const rows = await readSheetDirect('Log_Penerbitan_Surat', true, true).catch(() => [] as any[]);
    const targetNorm = normalizeStr(params.namaDudi || '');
    const nowIso = new Date().toISOString();
    let revoked = false;
    for (const row of rows) {
      const rIdTerbit = pickField(row, 'ID_Terbit', 'idTerbit', 'id');
      const rStage =
        extractIssuedStageNumber(row.Tahap ?? row.tahap) ||
        extractIssuedStageNumber(row.Nama_Tahap ?? row.namaTahap);
      const rDudiId = pickField(row, 'ID_DUDI', 'idDudi');
      const rDudiNama = normalizeStr(pickField(row, 'Nama_DUDI', 'namaDudi'));
      const matched =
        (params.idTerbit && rIdTerbit === params.idTerbit) ||
        (rStage === params.tahap &&
          ((params.dudiId && rDudiId && rDudiId === params.dudiId) ||
            (targetNorm && rDudiNama && rDudiNama === targetNorm)));
      if (!matched || !isIssuedLetterStatusActive(row.Status_Terbit ?? row.statusTerbit)) continue;
      await writeSheetDirect('Log_Penerbitan_Surat', 'UPDATE', {
        ...row,
        id: rIdTerbit,
        ID_Terbit: rIdTerbit,
        idTerbit: rIdTerbit,
        _sheetRowNumber: row._sheetRowNumber,
        Status_Terbit: 'Dibatalkan',
        statusTerbit: 'Dibatalkan',
        Diterbitkan_Oleh: `${params.actorName || 'Admin Hubin'} (Dibatalkan)`,
        Updated_At: nowIso,
      });
      revoked = true;
    }
    clearDirectSheetCache();
    GoogleSheetClient.getInstance().invalidateClientSheetCache('Log_Penerbitan_Surat');
    invalidatePublicTeacherCaches(false);
    return { success: true, revoked };
  },

  async getDocumentSigners(): Promise<{ success: boolean; kepalaSekolah: string }> {
    try {
      const token = await resolveAuthToken();
      if (token) {
        const { ok, data } = await safeFetchJson('/api/documents/signers', {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
          timeoutMs: 10_000,
        });
        if (ok && data?.success) {
          return {
            success: true,
            kepalaSekolah: String(data.kepalaSekolah || '').trim(),
          };
        }
      }
    } catch (err: any) {
      if (!isBackendProxyUnavailableError(err)) {
        // Fallback to direct account read below if proxy unavailable or transient
      }
    }

    try {
      const { accounts } = await LocalAccountAuthService.fetchAccounts();
      const kepsek =
        accounts.find((a) => a.role === 'Kepsek' && a.status === 'Aktif') ||
        accounts.find((a) => a.role === 'Kepsek');
      const raw = String(kepsek?.namaLengkap || '').trim();
      const lower = raw.toLowerCase();
      return {
        success: true,
        kepalaSekolah: !raw || lower === 'kepala sekolah' || lower === 'kepsek' ? '' : raw,
      };
    } catch {
      return { success: false, kepalaSekolah: '' };
    }
  },

  async saveDocumentSignerKepalaSekolah(kepalaSekolah: string): Promise<{
    success: boolean;
    kepalaSekolah: string;
  }> {
    const cleanName = String(kepalaSekolah || '').trim();
    if (!cleanName) {
      return { success: false, kepalaSekolah: '' };
    }

    try {
      const token = await resolveAuthToken();
      if (token) {
        const { ok, status, data } = await safeFetchJson('/api/documents/signers', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ kepalaSekolah: cleanName }),
          timeoutMs: 15_000,
        });
        if (ok && data?.success) {
          return { success: true, kepalaSekolah: cleanName };
        }
        if (status < 500 && status !== 404 && status !== 405 && data?.message) {
          throw new Error(data.message);
        }
      }
    } catch (err: any) {
      if (!isBackendProxyUnavailableError(err)) {
        // Try direct Master_Akun fallback on static SPA
      }
    }

    const { accounts } = await LocalAccountAuthService.fetchAccounts();
    const idx = accounts.findIndex((a) => a.role === 'Kepsek');
    if (idx === -1) {
      return { success: false, kepalaSekolah: cleanName };
    }
    const updated = accounts.map((a, i) =>
      i === idx
        ? {
            ...a,
            namaLengkap: cleanName,
            updatedAt: new Date().toISOString(),
            isDefaultSeed: false,
          }
        : a
    );
    await LocalAccountAuthService.syncAccountsDirectToGas(updated);
    return { success: true, kepalaSekolah: cleanName };
  },
};
