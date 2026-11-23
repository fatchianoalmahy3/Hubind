import crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { GoogleDriveSheetService } from '../../../src/core/GoogleDriveSheetService';
import { getTodayWibIsoDate, normalizeToIsoDate } from '../../../src/core/utils/dateHelpers';
import {
  buildStudentMonitoringSummary,
  calculateEqualWeightedAverage,
  extractStageNumber,
  getPredikatFromScore,
  getStageValueByNumber,
  parseKompetensiList,
  parseKondisiBengkel,
  resolveIssuedStagesForDudi,
  serializeFormat0701Tag,
  serializeKompetensiList,
  serializeKondisiBengkel,
  stripStructuredTagsFromNote,
} from '../../../src/core/utils/monitoringHelpers';
import {
  aggregatePetugasDudiGroups,
  buildDudiStudentsWithSummary,
  mapPublicPetugasRows,
} from '../../../src/core/portal/portalTransformers';
import { stripNisSymbols } from '../../../src/core/utils/nisHelpers';
import { normalizeStr, pickField } from '../../../src/core/utils/rowFieldHelpers';
import {
  getFirestoreWorkspaceConfig,
  isServerlessRuntime,
  normalizeServerMonitoringStageControl,
} from '../../config/runtimeConfig';
import {
  syncDudiContactToMasterAndPengajuan,
  upsertNilaiDanSertifikat,
} from '../../services/monitoringDomainService';
import {
  fetchBatchSheetsViaGas,
  fetchLiveSheetViaGas,
  fetchMasterSiswaRows,
  writeLiveSheetViaGas,
} from '../../services/sheetsTransport';
import { computeWeakEtag, handlePortalError, isEtagMatched } from '../../utils/httpHelpers';

function constantTimeMatch(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hashB = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

export function registerPublicTeacherMonitoringRoutes(app: Express): void {
  // Public Petugas List directly from Master_Guru_Pendamping (with ETag 304)
  app.get('/api/public/petugas-list', async (req: Request, res: Response) => {
    try {
      const fresh = String(req.query.fresh || '') === '1';
      const { rows, config } = await fetchLiveSheetViaGas('Master_Guru_Pendamping', fresh);
      const mapped = mapPublicPetugasRows(rows);

      if (!isServerlessRuntime) {
        void fetchBatchSheetsViaGas(
          ['Plotting_Pemberangkatan', 'Master_DUDI'],
          new Set(['Plotting_Pemberangkatan', 'Master_DUDI'])
        ).catch(() => {});
      }

      const etag = computeWeakEtag({ s: config.spreadsheetId, y: config.activeYear, k: 'public_petugas', mapped });
      res.setHeader('ETag', etag);
      if (!fresh && isEtagMatched(req, etag)) {
        return res.status(304).end();
      }

      res.json({ success: true, total: mapped.length, etag, data: mapped });
    } catch (err: any) {
      handlePortalError(res, err);
    }
  });

  // Public Monitoring Stage Control Configuration
  app.get('/api/public/monitoring-stage-config', async (req: Request, res: Response) => {
    try {
      const fresh = String(req.query.fresh || '') === '1';
      const config = await getFirestoreWorkspaceConfig(fresh);
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        success: true,
        data: normalizeServerMonitoringStageControl(config.monitoringStageControl),
      });
    } catch (err: any) {
      handlePortalError(res, err);
    }
  });

  // Public Officer PIN Verification against Master_Guru_Pendamping
  app.post('/api/public/verify-petugas-pin', async (req: Request, res: Response) => {
    try {
      const { petugas_id, nama_petugas, pin } = req.body || {};
      const enteredPin = String(pin || '').trim();

      if (!enteredPin || enteredPin.length < 4) {
        return res.status(400).json({ success: false, message: 'PIN Petugas 4 digit wajib diisi.' });
      }

      const { rows } = await fetchLiveSheetViaGas('Master_Guru_Pendamping');
      const teacher = rows.find((g: any) => {
        const id = pickField(g, 'ID', 'ID_Guru', 'idGuru', 'id');
        const nama = pickField(g, 'Nama_Lengkap', 'Nama_Guru', 'namaGuru', 'nama', 'Nama');
        return (
          (petugas_id && id === String(petugas_id).trim()) ||
          (nama_petugas && normalizeStr(nama) === normalizeStr(nama_petugas))
        );
      });

      if (!teacher) {
        return res.status(404).json({
          success: false,
          code: 'PETUGAS_NOT_FOUND',
          message: 'Data petugas tidak ditemukan di Database Cloud Server.',
        });
      }

      const explicitPin = pickField(teacher, 'PIN', 'pin', 'Pin');
      const nipDigits = pickField(teacher, 'NIP', 'nip').replace(/\D/g, '');
      const waDigits = pickField(teacher, 'Kontak_WA', 'kontakWA', 'kontakWa', 'No_WA', 'noWa', 'No_HP').replace(/\D/g, '');

      const validPins: string[] = [];
      if (explicitPin) validPins.push(explicitPin);
      if (nipDigits.length >= 4) validPins.push(nipDigits.slice(-4));
      if (waDigits.length >= 4) validPins.push(waDigits.slice(-4));

      if (validPins.length === 0) {
        return res.status(400).json({
          success: false,
          message:
            'Petugas belum memiliki PIN atau No. WhatsApp terdaftar di Cloud Server untuk verifikasi.',
        });
      }

      const pinMatched = validPins.some((candidate) => constantTimeMatch(candidate, enteredPin));
      if (!pinMatched) {
        return res.status(401).json({
          success: false,
          message: 'PIN Petugas tidak cocok. Gunakan PIN atau 4 digit terakhir NIP / No. WhatsApp terdaftar.',
        });
      }

      const resolvedName = pickField(teacher, 'Nama_Lengkap', 'Nama_Guru', 'namaGuru', 'nama', 'Nama');
      return res.json({
        success: true,
        message: `Identitas ${resolvedName} terverifikasi.`,
        sessionToken: `pin_auth_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`,
        verifiedPetugas: {
          id: pickField(teacher, 'ID', 'ID_Guru', 'idGuru', 'id') || petugas_id,
          nama: resolvedName,
          nip: pickField(teacher, 'NIP', 'nip') || '-',
          verifiedAt: new Date().toISOString(),
        },
      });
    } catch (err: any) {
      handlePortalError(res, err);
    }
  });

  // Assigned DUDIs for the verified officer
  app.get('/api/public/petugas-dudi', async (req: Request, res: Response) => {
    try {
      const petugasNama = String(req.query.petugasNama || '').trim();
      const petugasId = String(req.query.petugasId || '').trim();

      if (!petugasNama && !petugasId) {
        return res.status(400).json({ success: false, message: 'Parameter petugasNama atau petugasId wajib diisi.' });
      }

      const { sheets } = await fetchBatchSheetsViaGas(
        ['Plotting_Pemberangkatan', 'Master_DUDI', 'Data_Pengajuan_PKL'],
        new Set(['Plotting_Pemberangkatan', 'Data_Pengajuan_PKL'])
      );
      const result = aggregatePetugasDudiGroups({
        petugasNama,
        petugasId,
        plottingRows: sheets['Plotting_Pemberangkatan'] || [],
        dudiRows: sheets['Master_DUDI'] || [],
        pengajuanRows: sheets['Data_Pengajuan_PKL'] || [],
      });

      const etag = computeWeakEtag({ k: 'petugas_dudi', petugasNama, petugasId, result });
      res.setHeader('ETag', etag);
      if (isEtagMatched(req, etag)) {
        return res.status(304).end();
      }

      res.json({ success: true, total: result.length, etag, data: result });
    } catch (err: any) {
      handlePortalError(res, err);
    }
  });

  // Placed students inside a selected DUDI enriched with 8-stage monitoring summary
  app.get('/api/public/dudi-students', async (req: Request, res: Response) => {
    try {
      const dudiNama = String(req.query.dudiNama || '').trim();
      const dudiId = String(req.query.dudiId || '').trim();
      const petugasNama = String(req.query.petugasNama || '').trim();

      if (!dudiNama && !dudiId) {
        return res.status(400).json({ success: false, message: 'Parameter dudiNama atau dudiId wajib diisi.' });
      }

      const { sheets } = await fetchBatchSheetsViaGas(
        [
          'Plotting_Pemberangkatan',
          'Data_Pengajuan_PKL',
          'Master_Siswa_XI',
          'Monitoring_5_Tahap',
          'Nilai_Dan_Sertifikat',
          'Log_Penerbitan_Surat',
        ],
        new Set([
          'Plotting_Pemberangkatan',
          'Data_Pengajuan_PKL',
          'Master_Siswa_XI',
          'Monitoring_5_Tahap',
          'Nilai_Dan_Sertifikat',
          'Log_Penerbitan_Surat',
        ])
      );

      let siswaRows = sheets['Master_Siswa_XI'] || [];
      if (siswaRows.length === 0) {
        const fallbackSiswa = await fetchMasterSiswaRows().catch(() => ({ rows: [] as any[] }));
        siswaRows = fallbackSiswa.rows;
      }

      const wsConfig = await getFirestoreWorkspaceConfig(String(req.query.fresh || '') === '1');
      const stageControl = normalizeServerMonitoringStageControl(wsConfig.monitoringStageControl);
      const { issuedStages, issuedStageDetails } = resolveIssuedStagesForDudi(
        sheets['Log_Penerbitan_Surat'] || [],
        dudiId,
        dudiNama
      );

      const result = buildDudiStudentsWithSummary({
        dudiNama,
        dudiId,
        petugasNama,
        plottingRows: sheets['Plotting_Pemberangkatan'] || [],
        pengajuanRows: sheets['Data_Pengajuan_PKL'] || [],
        siswaRows,
        monitoringRows: sheets['Monitoring_5_Tahap'] || [],
        nilaiRows: sheets['Nilai_Dan_Sertifikat'] || [],
        stageControl,
        issuedStages,
      });

      const etag = computeWeakEtag({
        k: 'dudi_students',
        dudiNama,
        dudiId,
        petugasNama,
        stageControl,
        issuedStages,
        result,
      });
      res.setHeader('ETag', etag);
      if (String(req.query.fresh || '') !== '1' && isEtagMatched(req, etag)) {
        return res.status(304).end();
      }

      res.json({
        success: true,
        total: result.length,
        stageControl,
        issuedStages,
        issuedStageDetails,
        etag,
        data: result,
      });
    } catch (err: any) {
      handlePortalError(res, err);
    }
  });

  // Public DUDI Contact & Pemimpin Completion Popup Save (requires explicit spelling confirmation)
  app.post('/api/public/update-dudi-contact', async (req: Request, res: Response) => {
    try {
      const payload = req.body || {};
      const targetDudiId = String(payload.dudi_id || '').trim();
      const targetDudiNama = String(payload.nama_dudi || '').trim();
      const inputPemimpin = String(payload.nama_pemimpin || '').trim();
      const inputPic = String(payload.nama_pic || '').trim();
      const inputTelpDudi = String(payload.no_telp_dudi || '').trim();
      const inputHariKerja = String(payload.hari_kerja || '').trim();
      const inputJamKerja = String(payload.jam_kerja || '').trim();
      const inputTelpDigits = inputTelpDudi.replace(/\D/g, '');
      const spellingConfirmed = payload.spelling_confirmed === true;

      if (!targetDudiId && !targetDudiNama) {
        return res.status(400).json({
          success: false,
          message: 'Identitas DUDI wajib disertakan.',
        });
      }
      if (!inputPemimpin || inputPemimpin === '-' || !inputPic || inputPic === '-' || inputTelpDigits.length < 7) {
        return res.status(400).json({
          success: false,
          code: 'DUDI_CONTACT_REQUIRED',
          message: 'Nama Pemimpin DUDI, Nama PIC / Pembimbing DUDI, dan No. Telp / WhatsApp DUDI wajib diisi lengkap.',
        });
      }
      if (!spellingConfirmed) {
        return res.status(400).json({
          success: false,
          code: 'SPELLING_CONFIRMATION_REQUIRED',
          message: 'Harap centang konfirmasi kebenaran data dan ejaan sebelum menyimpan.',
        });
      }

      await syncDudiContactToMasterAndPengajuan({
        dudiId: targetDudiId,
        namaDudi: targetDudiNama,
        alamatDudi: payload.alamat_dudi,
        namaPemimpin: inputPemimpin,
        namaPic: inputPic,
        noTelpDudi: inputTelpDudi,
        hariKerja: inputHariKerja || undefined,
        jamKerja: inputJamKerja || undefined,
        createIfMissing: true,
        overwriteExisting: true,
      });

      res.json({
        success: true,
        message: 'Data kontak & pimpinan DUDI berhasil dikonfirmasi dan disimpan.',
        dudiContact: {
          namaPemimpin: inputPemimpin,
          pic: inputPic,
          kontak: inputTelpDudi,
          ...(inputHariKerja ? { hariKerja: inputHariKerja } : {}),
          ...(inputJamKerja ? { jamKerja: inputJamKerja } : {}),
        },
      });
    } catch (err: any) {
      handlePortalError(res, err);
    }
  });

  // Public Monitoring (8 Stages) Submission -> writes to Monitoring_5_Tahap & syncs Nilai_Dan_Sertifikat
  app.post('/api/public/submit-monitoring', async (req: Request, res: Response) => {
    try {
      const payload = req.body || {};
      if (!payload.nis || !payload.nama_siswa || !payload.tahap_monitoring) {
        return res.status(400).json({
          success: false,
          message: 'NIS, Nama Siswa, dan Tahap Monitoring wajib diisi.',
        });
      }

      const cleanNis = stripNisSymbols(payload.nis) || String(payload.nis).trim();
      const inputIdPenempatan = String(payload.id_penempatan || '').trim();
      let existingMonId = String(payload.existing_monitoring_id || '').trim();
      const tglVal = normalizeToIsoDate(payload.tanggal) || getTodayWibIsoDate();

      const bukuLaporan = String(payload.buku_laporan || '').trim().toUpperCase();
      const aktivitasDp = String(payload.aktivitas_dp || '').trim();
      const aktivitasMt = String(payload.aktivitas_mt || '').trim();
      const aktivitasKrt = String(payload.aktivitas_krt || '').trim();
      const kompetensiArr = parseKompetensiList(payload.kompetensi_siswa);
      const kompetensiSerialized = serializeKompetensiList(kompetensiArr);
      const kondisiCheck = parseKondisiBengkel(payload.kondisi_bengkel);
      const kondisiSerialized = serializeKondisiBengkel(kondisiCheck);
      const ttdSiswaRaw = String(payload.ttd_siswa || '').trim();
      const safeTtdSiswa = ttdSiswaRaw.startsWith('svgpath:') ? ttdSiswaRaw : '';

      const cleanUserNote = stripStructuredTagsFromNote(payload.catatan_perkembangan);
      const f0701Tag = serializeFormat0701Tag({
        bukuLaporan,
        dp: aktivitasDp,
        mt: aktivitasMt,
        krt: aktivitasKrt,
        kompetensiList: kompetensiArr,
        kondisiBengkel: kondisiCheck,
      });
      const noteCombined = [cleanUserNote, f0701Tag].filter(Boolean).join(' ').trim();

      const stageStr = String(payload.tahap_monitoring);
      const stageNum = extractStageNumber(stageStr);

      if (stageNum < 1 || stageNum > 8) {
        return res.status(400).json({
          success: false,
          message: 'Tahap Monitoring tidak valid (harus Tahap 1 sampai Tahap 8).',
        });
      }

      const wsConfig = await getFirestoreWorkspaceConfig(true);
      const stageControl = normalizeServerMonitoringStageControl(wsConfig.monitoringStageControl);

      if (!stageControl.unlockedStages.includes(stageNum)) {
        return res.status(403).json({
          success: false,
          code: 'STAGE_GLOBALLY_LOCKED',
          message: stageControl.lockedReason
            ? `${stageStr} sedang dikunci oleh SuperAdmin (${stageControl.lockedReason}).`
            : `${stageStr} sedang dikunci sementara oleh SuperAdmin. Riwayat yang sudah tersimpan hanya dapat dilihat (Read-Only).`,
        });
      }

      if (stageControl.requireIssuedLetter !== false) {
        const logRes = await fetchLiveSheetViaGas('Log_Penerbitan_Surat', true).catch(() => ({
          rows: [] as any[],
        }));
        const { issuedStages } = resolveIssuedStagesForDudi(
          logRes.rows,
          String(payload.dudi_id || ''),
          String(payload.nama_dudi || '')
        );
        if (!issuedStages.includes(stageNum)) {
          return res.status(403).json({
            success: false,
            code: 'LETTER_NOT_ISSUED',
            message: `Surat ${stageStr} untuk DUDI "${String(payload.nama_dudi || 'ini').trim()}" belum diterbitkan Admin Hubin di Pusat Dokumen. Harap konfirmasi penerbitan surat terlebih dahulu.`,
          });
        }
      }

      const monRes = await fetchLiveSheetViaGas('Monitoring_5_Tahap', true).catch(() => ({
        rows: [] as any[],
      }));

      if (stageControl.requireSequential && stageNum >= 2) {
        const summary = buildStudentMonitoringSummary(
          {
            nis: cleanNis,
            nama: String(payload.nama_siswa || ''),
            idPenempatan: inputIdPenempatan,
            dudi_name: String(payload.nama_dudi || ''),
          },
          monRes.rows,
          []
        );
        if (!summary.completedStages.includes(stageNum - 1)) {
          const prevStageLabel = getStageValueByNumber(stageNum - 1);
          return res.status(400).json({
            success: false,
            code: 'STAGE_LOCKED',
            message: `${stageStr} masih terkunci. Harap isi dan simpan ${prevStageLabel} untuk ${payload.nama_siswa} terlebih dahulu.`,
          });
        }
      }

      const matchedExistingRow = monRes.rows.find((r: any) => {
        const rMonId = pickField(r, 'ID_Monitoring', 'idMonitoring', 'id');
        if (existingMonId && rMonId === existingMonId) return true;
        const rStage = extractStageNumber(pickField(r, 'Tahap', 'tahap'));
        if (rStage !== stageNum) return false;
        const rNisRaw = pickField(r, 'NIS', 'nis');
        const rNisDigits = stripNisSymbols(rNisRaw) || rNisRaw;
        const rPlt = pickField(r, 'ID_Penempatan', 'idPenempatan');
        return Boolean(
          (cleanNis && rNisDigits === cleanNis) || (inputIdPenempatan && rPlt === inputIdPenempatan)
        );
      });

      if (matchedExistingRow) {
        existingMonId =
          pickField(matchedExistingRow, 'ID_Monitoring', 'idMonitoring', 'id') || existingMonId;
      }

      const isUpdate = Boolean(existingMonId);
      const idMonitoring =
        existingMonId || `MON-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      const inputPemimpin = String(payload.nama_pemimpin || '').trim();
      const inputPic = String(payload.nama_pic || '').trim();
      const inputTelpDudi = String(payload.no_telp_dudi || '').trim();
      const inputHariKerja = String(payload.hari_kerja || '').trim();
      const inputJamKerja = String(payload.jam_kerja || '').trim();
      const inputTelpDigits = inputTelpDudi.replace(/\D/g, '');
      if (stageNum === 1 || payload.dudi_contact_submitted) {
        if (!inputPemimpin || inputPemimpin === '-' || !inputPic || inputPic === '-' || inputTelpDigits.length < 7) {
          return res.status(400).json({
            success: false,
            code: 'DUDI_CONTACT_REQUIRED',
            message:
              'Nama Pemimpin DUDI, Nama PIC/Pendamping, dan No. Telp/WhatsApp DUDI wajib diisi lengkap.',
          });
        }
        if (payload.dudi_contact_submitted && payload.spelling_confirmed !== true) {
          return res.status(400).json({
            success: false,
            code: 'SPELLING_CONFIRMATION_REQUIRED',
            message: 'Harap centang konfirmasi kebenaran data dan ejaan sebelum menyimpan.',
          });
        }
      }

      const sakit = Math.max(0, Math.round(Number(payload.sakit ?? 0) || 0));
      const izin = Math.max(0, Math.round(Number(payload.izin ?? 0) || 0));
      const alpha = Math.max(0, Math.round(Number(payload.alpha ?? 0) || 0));
      const nilaiMuncul = Boolean(payload.nilai_pkl_muncul);

      let k3lh = 0;
      let softskill = 0;
      let teknis = 0;
      let alurBisnis = 0;
      let avgScore = 0;

      if (nilaiMuncul) {
        k3lh = Math.min(100, Math.max(0, Number(payload.nilai_k3lh ?? 0) || 0));
        softskill = Math.min(100, Math.max(0, Number(payload.nilai_softskill ?? 0) || 0));
        teknis = Math.min(100, Math.max(0, Number(payload.nilai_kompetensi_teknis ?? 0) || 0));
        alurBisnis = Math.min(100, Math.max(0, Number(payload.nilai_alur_bisnis ?? 0) || 0));
        avgScore = calculateEqualWeightedAverage(k3lh, softskill, teknis, alurBisnis);
      }

      let resolvedDudiId = String(payload.dudi_id || '').trim();
      if (!resolvedDudiId && payload.nama_dudi) {
        const dudiRes = await fetchLiveSheetViaGas('Master_DUDI', false).catch(() => ({ rows: [] as any[] }));
        const targetDudiNorm = normalizeStr(payload.nama_dudi);
        const matchedDudi = dudiRes.rows.find(
          (d: any) => normalizeStr(pickField(d, 'Nama_DUDI', 'namaDudi')) === targetDudiNorm
        );
        if (matchedDudi) {
          resolvedDudiId = pickField(matchedDudi, 'ID', 'id');
        }
      }

      const sheetRow: Record<string, any> = {
        id: idMonitoring,
        ID_Monitoring: idMonitoring,
        idMonitoring,
        ID_Penempatan: String(payload.id_penempatan || `PLT-${cleanNis}`),
        idPenempatan: String(payload.id_penempatan || `PLT-${cleanNis}`),
        ID_DUDI: resolvedDudiId,
        idDudi: resolvedDudiId,
        DUDI_Tujuan: String(payload.nama_dudi || ''),
        dudiTujuan: String(payload.nama_dudi || ''),
        Alamat_DUDI: String(payload.alamat_dudi || ''),
        alamatDudi: String(payload.alamat_dudi || ''),
        NIS: cleanNis,
        nis: cleanNis,
        Nama_Siswa: String(payload.nama_siswa || ''),
        namaSiswa: String(payload.nama_siswa || ''),
        Jurusan: String(payload.jurusan || ''),
        jurusan: String(payload.jurusan || ''),
        ID_Guru_Pendamping: String(payload.guru_id || ''),
        idGuruPendamping: String(payload.guru_id || ''),
        Guru_Pendamping: String(payload.guru_pembimbing || ''),
        guruPendamping: String(payload.guru_pembimbing || ''),
        Tahap: stageStr,
        tahap: stageStr,
        Tanggal_Kunjungan: tglVal,
        tanggalKunjungan: tglVal,
        Sakit: sakit,
        sakit,
        Izin: izin,
        izin,
        Alpha: alpha,
        alpha,
        Nilai_PKL_Muncul: nilaiMuncul ? 'Ya' : 'Belum',
        nilaiPklMuncul: nilaiMuncul,
        Nilai_K3LH: nilaiMuncul ? k3lh : '',
        nilaiK3lh: nilaiMuncul ? k3lh : '',
        Nilai_Softskills: nilaiMuncul ? softskill : '',
        Nilai_Softskill: nilaiMuncul ? softskill : '',
        nilaiSoftskill: nilaiMuncul ? softskill : '',
        Nilai_Hardskills: nilaiMuncul ? teknis : '',
        Nilai_Kompetensi_Teknis: nilaiMuncul ? teknis : '',
        nilaiKompetensiTeknis: nilaiMuncul ? teknis : '',
        Nilai_Alur_Bisnis_Dunia_Kerja: nilaiMuncul ? alurBisnis : '',
        Nilai_Alur_Bisnis: nilaiMuncul ? alurBisnis : '',
        nilaiAlurBisnis: nilaiMuncul ? alurBisnis : '',
        Nilai_rata_rata: nilaiMuncul ? avgScore : '',
        Nilai_Rata_Rata: nilaiMuncul ? avgScore : '',
        nilaiRataRata: nilaiMuncul ? avgScore : '',
        Catatan_Kunjungan: noteCombined,
        catatanKunjungan: noteCombined,
        Buku_Laporan: bukuLaporan,
        bukuLaporan,
        Aktivitas_DP: aktivitasDp,
        aktivitasDp,
        Aktivitas_MT: aktivitasMt,
        aktivitasMt,
        Aktivitas_KRT: aktivitasKrt,
        aktivitasKrt,
        Kompetensi_Didapat: kompetensiSerialized,
        kompetensiDidapat: kompetensiSerialized,
        Kondisi_Bengkel: kondisiSerialized,
        kondisiBengkel: kondisiSerialized,
        TTD_Siswa: safeTtdSiswa,
        ttdSiswa: safeTtdSiswa,
        Foto_Bukti_Drive: '',
        fotoBuktiUrl: '',
        Nilai_DUDI_Terkumpul: nilaiMuncul && avgScore > 0 ? 'Ya' : 'Belum',
        nilaiDudiTerkumpul: nilaiMuncul && avgScore > 0,
        Blangko_Sertifikat_Bawa: stageNum >= 5 ? 'Ya' : 'Belum',
        blangkoSertifikatBawa: stageNum >= 5,
        Status_Tahap: 'Terlaksana',
        statusTahap: 'Terlaksana',
      };

      const persistedMonitoring = GoogleDriveSheetService.getInstance().stripFormulaManagedFields(
        'Monitoring_5_Tahap',
        matchedExistingRow?._sheetRowNumber
          ? { ...sheetRow, _sheetRowNumber: matchedExistingRow._sheetRowNumber }
          : sheetRow
      );
      const writeReceipt = await writeLiveSheetViaGas(
        'Monitoring_5_Tahap',
        isUpdate ? 'UPDATE' : 'CREATE',
        persistedMonitoring
      );

      let dudiContactSynced = false;
      if (inputPemimpin || inputPic || inputTelpDudi || inputHariKerja || inputJamKerja) {
        try {
          dudiContactSynced = await syncDudiContactToMasterAndPengajuan({
            dudiId: resolvedDudiId || payload.dudi_id,
            namaDudi: payload.nama_dudi,
            alamatDudi: payload.alamat_dudi,
            namaPemimpin: inputPemimpin,
            namaPic: inputPic,
            noTelpDudi: inputTelpDudi,
            hariKerja: inputHariKerja || undefined,
            jamKerja: inputJamKerja || undefined,
            createIfMissing: true,
            overwriteExisting: true,
          });
        } catch (dudiErr) {
          console.warn('[submit-monitoring] Sync DUDI contact warning:', dudiErr);
        }
      }

      let gradeSynced = false;
      if (nilaiMuncul && avgScore > 0) {
        try {
          await upsertNilaiDanSertifikat({
            nis: cleanNis,
            idPenempatan: String(payload.id_penempatan || `PLT-${cleanNis}`),
            idDudi: resolvedDudiId,
            namaSiswa: String(payload.nama_siswa || ''),
            jurusan: String(payload.jurusan || ''),
            kelas: String(payload.kelas || '-'),
            namaDudi: String(payload.nama_dudi || ''),
            k3lh,
            softskill,
            teknis,
            alurBisnis,
            avgScore,
            tglTerbit: tglVal,
          });
          gradeSynced = true;
        } catch (gradeErr) {
          console.warn('[submit-monitoring] Sync to Nilai_Dan_Sertifikat warning:', gradeErr);
        }
      }

      res.json({
        success: true,
        verifiedInSpreadsheet: writeReceipt.verified,
        sheetRowNumber: writeReceipt.sheetRowNumber,
        savedAt: writeReceipt.savedAt,
        gradeSynced,
        dudiContactSynced,
        dudiContact:
          inputPemimpin || inputPic || inputTelpDudi || inputHariKerja || inputJamKerja
            ? {
                namaPemimpin: inputPemimpin,
                pic: inputPic,
                kontak: inputTelpDudi,
                ...(inputHariKerja ? { hariKerja: inputHariKerja } : {}),
                ...(inputJamKerja ? { jamKerja: inputJamKerja } : {}),
              }
            : undefined,
        message: `Data ${stageStr} berhasil ${isUpdate ? 'diperbarui' : 'disimpan'} ke Cloud Server.`,
        monitoring: sheetRow,
      });
    } catch (err: any) {
      handlePortalError(res, err);
    }
  });

  // Edit / Update already submitted PKL grades in both Monitoring_5_Tahap & Nilai_Dan_Sertifikat
  app.post('/api/public/update-grades', async (req: Request, res: Response) => {
    try {
      const payload = req.body || {};
      const nis = stripNisSymbols(payload.nis) || String(payload.nis || '').trim();
      const namaSiswa = String(payload.nama_siswa || '').trim();
      const idPenempatan = String(payload.id_penempatan || (nis ? `PLT-${nis}` : '')).trim();

      if (!nis || !namaSiswa) {
        return res.status(400).json({
          success: false,
          message: 'NIS dan Nama Siswa wajib diisi untuk mengubah nilai.',
        });
      }

      const k3lh = Math.min(100, Math.max(0, Number(payload.nilai_k3lh ?? 0) || 0));
      const softskill = Math.min(100, Math.max(0, Number(payload.nilai_softskill ?? 0) || 0));
      const teknis = Math.min(100, Math.max(0, Number(payload.nilai_kompetensi_teknis ?? 0) || 0));
      const alurBisnis = Math.min(100, Math.max(0, Number(payload.nilai_alur_bisnis ?? 0) || 0));
      const avgScore = calculateEqualWeightedAverage(k3lh, softskill, teknis, alurBisnis);
      const predikat = getPredikatFromScore(avgScore);
      const tglVal = normalizeToIsoDate(payload.tanggal) || getTodayWibIsoDate();

      const monRes = await fetchLiveSheetViaGas('Monitoring_5_Tahap', true).catch(() => ({ rows: [] as any[] }));
      const targetMonId = String(payload.monitoring_id || '').trim();

      const matchedRows = monRes.rows.filter((r: any) => {
        const rMonId = pickField(r, 'ID_Monitoring', 'idMonitoring', 'id');
        const rNis = pickField(r, 'NIS', 'nis');
        const rNisDigits = stripNisSymbols(rNis);
        const rPlt = pickField(r, 'ID_Penempatan', 'idPenempatan');
        if (targetMonId && rMonId === targetMonId) return true;
        if (nis && (rNisDigits === nis || rNis === nis)) return true;
        if (idPenempatan && rPlt === idPenempatan) return true;
        return false;
      });

      const targetRow =
        (targetMonId
          ? matchedRows.find((r: any) => pickField(r, 'ID_Monitoring', 'idMonitoring', 'id') === targetMonId)
          : undefined) ||
        [...matchedRows].reverse().find((r: any) => {
          const flag = normalizeStr(pickField(r, 'Nilai_DUDI_Terkumpul', 'nilaiDudiTerkumpul'));
          const avg = Number(r.Nilai_rata_rata ?? r.Nilai_Rata_Rata ?? r.nilaiRataRata ?? 0);
          return flag === 'ya' || flag === 'true' || avg > 0;
        }) ||
        matchedRows[matchedRows.length - 1];

      let resolvedMonId = targetMonId;
      let resolvedStage = String(payload.tahap_monitoring || getStageValueByNumber(5));
      let resolvedDudiId = String(payload.dudi_id || '').trim();
      if (!resolvedDudiId && targetRow) {
        resolvedDudiId = pickField(targetRow, 'ID_DUDI', 'idDudi');
      }
      if (!resolvedDudiId && payload.nama_dudi) {
        const dudiRes = await fetchLiveSheetViaGas('Master_DUDI', false).catch(() => ({ rows: [] as any[] }));
        const targetDudiNorm = normalizeStr(payload.nama_dudi);
        const matchedDudi = dudiRes.rows.find(
          (d: any) => normalizeStr(pickField(d, 'Nama_DUDI', 'namaDudi')) === targetDudiNorm
        );
        if (matchedDudi) {
          resolvedDudiId = pickField(matchedDudi, 'ID', 'id');
        }
      }

      const sheetSvc = GoogleDriveSheetService.getInstance();

      if (targetRow) {
        resolvedMonId = pickField(targetRow, 'ID_Monitoring', 'idMonitoring', 'id');
        resolvedStage = pickField(targetRow, 'Tahap', 'tahap') || resolvedStage;
        const rawNote = String(targetRow.Catatan_Kunjungan ?? targetRow.catatanKunjungan ?? '');
        const existingF0701 = rawNote.match(/\[F0701:[^\]]+\]/i);
        const cleanNoteBase = stripStructuredTagsFromNote(rawNote);
        const cleanNote = [cleanNoteBase, existingF0701 ? existingF0701[0] : ''].filter(Boolean).join(' ').trim();

        await writeLiveSheetViaGas(
          'Monitoring_5_Tahap',
          'UPDATE',
          sheetSvc.stripFormulaManagedFields('Monitoring_5_Tahap', {
            id: resolvedMonId,
            ID_Monitoring: resolvedMonId,
            idMonitoring: resolvedMonId,
            _sheetRowNumber: targetRow._sheetRowNumber,
            ID_Penempatan: pickField(targetRow, 'ID_Penempatan', 'idPenempatan') || idPenempatan,
            ID_DUDI: resolvedDudiId,
            ID_Guru_Pendamping: pickField(targetRow, 'ID_Guru_Pendamping', 'idGuruPendamping') || String(payload.guru_id || ''),
            Nilai_PKL_Muncul: 'Ya',
            nilaiPklMuncul: true,
            Nilai_K3LH: k3lh,
            nilaiK3lh: k3lh,
            Nilai_Softskills: softskill,
            Nilai_Softskill: softskill,
            nilaiSoftskill: softskill,
            Nilai_Hardskills: teknis,
            Nilai_Kompetensi_Teknis: teknis,
            nilaiKompetensiTeknis: teknis,
            Nilai_Alur_Bisnis_Dunia_Kerja: alurBisnis,
            Nilai_Alur_Bisnis: alurBisnis,
            nilaiAlurBisnis: alurBisnis,
            Nilai_DUDI_Terkumpul: 'Ya',
            nilaiDudiTerkumpul: true,
            Catatan_Kunjungan: cleanNote,
            catatanKunjungan: cleanNote,
          })
        );
      } else {
        resolvedMonId = `MON-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const stageNum = extractStageNumber(resolvedStage) || 5;
        await writeLiveSheetViaGas(
          'Monitoring_5_Tahap',
          'CREATE',
          sheetSvc.stripFormulaManagedFields('Monitoring_5_Tahap', {
            id: resolvedMonId,
            ID_Monitoring: resolvedMonId,
            idMonitoring: resolvedMonId,
            ID_Penempatan: idPenempatan,
            idPenempatan,
            ID_DUDI: resolvedDudiId,
            NIS: nis,
            ID_Guru_Pendamping: String(payload.guru_id || ''),
            Tahap: resolvedStage,
            Tanggal_Kunjungan: tglVal,
            Sakit: 0,
            Izin: 0,
            Alpha: 0,
            Nilai_PKL_Muncul: 'Ya',
            Nilai_K3LH: k3lh,
            Nilai_Softskills: softskill,
            Nilai_Softskill: softskill,
            Nilai_Hardskills: teknis,
            Nilai_Kompetensi_Teknis: teknis,
            Nilai_Alur_Bisnis_Dunia_Kerja: alurBisnis,
            Nilai_Alur_Bisnis: alurBisnis,
            Catatan_Kunjungan: '',
            Nilai_DUDI_Terkumpul: 'Ya',
            Blangko_Sertifikat_Bawa: stageNum >= 5 ? 'Ya' : 'Belum',
            Status_Tahap: 'Terlaksana',
          })
        );
      }

      let nilaiSynced = false;
      try {
        await upsertNilaiDanSertifikat({
          nis,
          idPenempatan,
          idDudi: resolvedDudiId,
          namaSiswa,
          jurusan: String(payload.jurusan || ''),
          kelas: String(payload.kelas || '-'),
          namaDudi: String(payload.nama_dudi || ''),
          k3lh,
          softskill,
          teknis,
          alurBisnis,
          avgScore,
          tglTerbit: tglVal,
        });
        nilaiSynced = true;
      } catch (syncErr) {
        console.warn('[update-grades] Sync to Nilai_Dan_Sertifikat warning:', syncErr);
      }

      res.json({
        success: true,
        nilaiSynced,
        message: `Perubahan nilai PKL ${namaSiswa} (${avgScore}) berhasil disimpan ke Cloud Server.`,
        gradeSummary: {
          monitoringId: resolvedMonId,
          k3lh,
          softskill,
          teknis,
          alurBisnis,
          rataRata: avgScore,
          predikat,
          tahapDiinput: resolvedStage,
          tanggal: tglVal,
        },
      });
    } catch (err: any) {
      handlePortalError(res, err);
    }
  });
}
