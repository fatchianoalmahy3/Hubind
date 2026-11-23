import { GoogleSheetClient } from './GoogleSheetClient';
import { ToastManager } from './ToastManager';
import { type MonitoringStageControl } from './types/schema';
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
  directSubmitMonitoring,
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

      if (result?.success) {
        GoogleSheetClient.getInstance().invalidateClientSheetCache('Data_Pengajuan_PKL');
        ToastManager.getInstance().update(
          toastId,
          'Tersimpan di Cloud Server!',
          'success',
          `Pengajuan PKL ${payload.nama} (${result.application?.id || ''}) telah tersimpan ke Cloud Server.`
        );
      } else {
        ToastManager.getInstance().update(
          toastId,
          'Gagal Menyimpan Pengajuan',
          'error',
          result?.message || 'Terjadi kendala saat menyimpan ke Cloud Server.'
        );
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
      forceRefresh?: boolean;
      onUpdate?: (res: {
        success: boolean;
        total: number;
        data: any[];
        stageControl?: MonitoringStageControl;
      }) => void;
    }
  ): Promise<{ success: boolean; total: number; data: any[]; stageControl?: MonitoringStageControl }> {
    const cfg = GoogleSheetClient.getInstance().getConfig();
    const dudiKey = `${String(dudiId || '').trim()}::${normalizeStr(dudiNama)}::${normalizeStr(petugasNama)}`;
    const idbKey = IndexedDbSheetCache.buildKey(
      cfg.spreadsheetId || 'public',
      cfg.activeYear || 'active',
      `public::dudi-students::${dudiKey}`
    );

    return executeSwrCachedPublicList<{ stageControl?: MonitoringStageControl }>({
      idbKey,
      inflightPrefix: 'dudi_students',
      softTtlMs: PUBLIC_TEACHER_SWR_TTL_MS,
      forceRefresh: options?.forceRefresh,
      trackKey: true,
      useSyncIdbHit: true,
      apiUrl: `/api/public/dudi-students?dudiNama=${encodeURIComponent(
        dudiNama
      )}&dudiId=${encodeURIComponent(dudiId || '')}&petugasNama=${encodeURIComponent(petugasNama)}${
        options?.forceRefresh ? `&fresh=1&_ts=${Date.now()}` : ''
      }`,
      directFetcher: () => directFetchDudiStudents(dudiNama, dudiId, petugasNama),
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
      'Menyimpan Supervisi ke Cloud Server...',
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

      if (res?.success) {
        GoogleSheetClient.getInstance().invalidateClientSheetCache('Monitoring_5_Tahap');
        if (res.gradeSynced) {
          GoogleSheetClient.getInstance().invalidateClientSheetCache('Nilai_Dan_Sertifikat');
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
            }) tersinkron ke Rekap Nilai`
          : '';
        ToastManager.getInstance().update(
          toastId,
          res.gradeSynced
            ? 'Supervisi & Nilai Tersimpan!'
            : 'Data Supervisi Tersimpan di Cloud Server!',
          'success',
          `${payload.nama_siswa} · ${payload.tahap_monitoring} (S:${payload.sakit ?? 0} I:${
            payload.izin ?? 0
          } A:${payload.alpha ?? 0})${nilaiSuffix}`
        );
      } else {
        ToastManager.getInstance().update(
          toastId,
          'Gagal Menyimpan Supervisi',
          'error',
          res?.message || 'Gagal menyimpan ke Cloud Server.'
        );
      }

      return res;
    } catch (err: any) {
      ToastManager.getInstance().update(
        toastId,
        'Gagal Menyimpan Supervisi',
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
          GoogleSheetClient.getInstance().invalidateClientSheetCache('Nilai_Dan_Sertifikat');
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
    perizinanId: string;
    noPerizinan?: string;
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
        payload,
        mapGasResult: async (json, status, ok) => {
          if (!ok || json?.error || !json?.pdfUrl) {
            throw new Error(
              json?.error ||
                `Apps Script belum mengembalikan URL PDF (HTTP ${status}). Pastikan kode GAS sudah di-Deploy ulang versi terbaru.`
            );
          }
          const pdfUrl = String(json.pdfUrl).trim();
          if (payload.perizinanId) {
            await writeSheetDirect('Data_Perizinan_PKL', 'UPDATE', {
              id: payload.perizinanId,
              ID_Perizinan: payload.perizinanId,
              Link_Surat_PDF: pdfUrl,
              linkSuratPdf: pdfUrl,
            }).catch(() => {});
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

      GoogleSheetClient.getInstance().invalidateClientSheetCache('Data_Perizinan_PKL');
      ToastManager.getInstance().update(
        toastId,
        'PDF Surat Siap di Google Drive!',
        'success',
        'Tautan PDF otomatis ditambahkan ke pesan WhatsApp & database perizinan.'
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
          return {
            success: true,
            pdfUrl: String(json.pdfUrl).trim(),
            fileId: String(json.fileId || ''),
            fileName: String(json.fileName || ''),
            totalSheets: Number(json.totalSheets || 0),
            message: 'Paket dokumen monitoring PDF berhasil dibuat dari Template Google Docs.',
          };
        },
      });

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
