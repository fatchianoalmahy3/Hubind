import type { Express, Request, Response } from 'express';
import { GoogleDriveSheetService } from '../../../src/core/GoogleDriveSheetService';
import { generateJurusanCode } from '../../../src/core/utils/autoIdHelpers';
import { getTodayWibDateTime } from '../../../src/core/utils/dateHelpers';
import { validateGoogleMapsUrl } from '../../../src/core/utils/mapsHelpers';
import { stripNisSymbols } from '../../../src/core/utils/nisHelpers';
import { normalizeStr, pickField } from '../../../src/core/utils/rowFieldHelpers';
import {
  mapPublicDudiRows,
  mapPublicStudentRecord,
} from '../../../src/core/portal/portalTransformers';
import { getFirestoreWorkspaceConfig } from '../../config/runtimeConfig';
import {
  fetchLiveSheetViaGas,
  fetchMasterSiswaRows,
  getOrBuildSiswaIndex,
  writeLiveSheetViaGas,
} from '../../services/sheetsTransport';
import {
  computeWeakEtag,
  handlePortalError,
  isEtagMatched,
  setPublicSwrCacheHeaders,
} from '../../utils/httpHelpers';

export function registerPublicStudentRoutes(app: Express): void {
  // Public configuration summary (no dummy stats, no sensitive private admin data)
  app.get('/api/public/config-summary', async (_req: Request, res: Response) => {
    try {
      const cfg = await getFirestoreWorkspaceConfig();
      setPublicSwrCacheHeaders(res, false, 15, 60);
      res.json({
        success: true,
        activeYear: cfg.activeYear,
        isConfigured: Boolean(cfg.spreadsheetId),
        hasGasUrl: Boolean(cfg.gasDeployUrl),
        spreadsheetName: cfg.spreadsheetName,
      });
    } catch (err: any) {
      handlePortalError(res, err);
    }
  });

  // Public Student Lookup by NIS directly from Master_Siswa_XI (O(1) Indexed Cache)
  app.get('/api/public/student-lookup/:nis', async (req: Request, res: Response) => {
    try {
      const rawSearchNis = String(req.params.nis || '').trim();
      const searchNisDigits = stripNisSymbols(rawSearchNis);
      if (!rawSearchNis && !searchNisDigits) {
        return res.status(400).json({ success: false, found: false, message: 'NIS wajib diisi.' });
      }

      const { rows, config } = await fetchMasterSiswaRows();
      const byKey = getOrBuildSiswaIndex(config.spreadsheetId, rows);

      const student =
        (searchNisDigits ? byKey.get(searchNisDigits) : undefined) || byKey.get(rawSearchNis);

      if (!student) {
        return res.json({
          success: true,
          found: false,
          message: `Siswa dengan NIS [${rawSearchNis}] tidak ditemukan di Database Sekolah.`,
        });
      }

      return res.json({
        success: true,
        found: true,
        student: mapPublicStudentRecord(student),
      });
    } catch (err: any) {
      handlePortalError(res, err);
    }
  });

  // Public DUDI List directly from Master_DUDI (with ETag 304 support)
  app.get('/api/public/dudi-list', async (req: Request, res: Response) => {
    try {
      const fresh = String(req.query.fresh || '') === '1';
      const { rows, config } = await fetchLiveSheetViaGas('Master_DUDI', fresh);
      const mapped = mapPublicDudiRows(rows);

      const etag = computeWeakEtag({ s: config.spreadsheetId, y: config.activeYear, k: 'public_dudi', mapped });
      res.setHeader('ETag', etag);
      setPublicSwrCacheHeaders(res, fresh, 15, 60);
      if (!fresh && isEtagMatched(req, etag)) {
        return res.status(304).end();
      }

      res.json({ success: true, total: mapped.length, etag, data: mapped });
    } catch (err: any) {
      handlePortalError(res, err);
    }
  });

  // Public Student PKL Application Submission -> writes directly to Data_Pengajuan_PKL
  app.post('/api/public/submit-application', async (req: Request, res: Response) => {
    try {
      const payload = req.body || {};
      if (!payload.nis || !payload.nama) {
        return res.status(400).json({ success: false, message: 'NIS dan Nama Siswa wajib diisi.' });
      }

      const rawMapsInput = String(payload.link_maps || payload.Link_Maps || payload.linkMaps || '').trim();
      const mapsCheck = validateGoogleMapsUrl(rawMapsInput);
      if (!mapsCheck.valid) {
        return res.status(400).json({
          success: false,
          message: mapsCheck.error || 'Link Google Maps lokasi PKL tidak valid.',
        });
      }

      const rawNisStr = String(payload.nis).trim();
      const cleanNisInput = stripNisSymbols(rawNisStr) || rawNisStr;

      const masterSiswaRes = await fetchMasterSiswaRows().catch(() => ({ rows: [] as any[] }));
      let canonicalNis = cleanNisInput;
      let canonicalNama = String(payload.nama).trim();
      let canonicalJurusan = String(payload.jurusan || '');
      let canonicalKelas = String(payload.kelas || '');
      let matchedStudent: any = null;

      if (masterSiswaRes.rows.length > 0) {
        matchedStudent =
          masterSiswaRes.rows.find((s: any) => {
            const rowNis = pickField(s, 'NIS', 'nis');
            const rowDigits = stripNisSymbols(rowNis);
            return (
              (cleanNisInput && rowDigits === cleanNisInput) ||
              rowNis.toLowerCase() === rawNisStr.toLowerCase()
            );
          }) || null;
        if (!matchedStudent) {
          return res.status(400).json({
            success: false,
            message: `NIS [${rawNisStr}] tidak terdaftar di Master Siswa. Hubungi Admin Hubin.`,
          });
        }
        const mNis = pickField(matchedStudent, 'NIS', 'nis');
        canonicalNis = stripNisSymbols(mNis) || mNis || cleanNisInput;
        canonicalNama = pickField(matchedStudent, 'Nama_Lengkap', 'namaLengkap', 'nama') || canonicalNama;
        canonicalJurusan =
          pickField(matchedStudent, 'ID_Jurusan', 'jurusan', 'Jurusan') || canonicalJurusan;
        canonicalKelas = pickField(matchedStudent, 'Kelas', 'kelas') || canonicalKelas;
      }

      let resolvedDudiId =
        payload.dudi_id && payload.dudi_id !== 'custom_hubin' ? String(payload.dudi_id).trim() : '';
      let resolvedDudiNama = String(payload.nama_dudi || '').trim();
      let autoIdGuruPendamping = '';
      let autoGuruPendamping = '';
      let matchedDudiRow: any = null;

      if (resolvedDudiId || resolvedDudiNama) {
        try {
          const dudiRes = await fetchLiveSheetViaGas('Master_DUDI', false);
          matchedDudiRow =
            dudiRes.rows.find((d: any) => {
              const dId = pickField(d, 'ID', 'id');
              const dNama = normalizeStr(pickField(d, 'Nama_DUDI', 'namaDudi'));
              return (
                (resolvedDudiId && dId === resolvedDudiId) ||
                (resolvedDudiNama && dNama === normalizeStr(resolvedDudiNama))
              );
            }) || null;

          if (matchedDudiRow) {
            resolvedDudiId = pickField(matchedDudiRow, 'ID', 'id') || resolvedDudiId;
            resolvedDudiNama =
              pickField(matchedDudiRow, 'Nama_DUDI', 'namaDudi') || resolvedDudiNama;
            autoIdGuruPendamping = pickField(
              matchedDudiRow,
              'ID_Guru_Pendamping',
              'idGuruPendamping'
            );
            autoGuruPendamping = pickField(matchedDudiRow, 'Guru_Pendamping', 'guruPendamping');
          } else if (resolvedDudiNama) {
            const newDudiId = `DUD-${Date.now().toString(36).toUpperCase()}`;
            await writeLiveSheetViaGas('Master_DUDI', 'CREATE', {
              id: newDudiId,
              ID: newDudiId,
              Nama_DUDI: resolvedDudiNama,
              Bidang_Keahlian: String(payload.bidang_dudi || '-').trim() || '-',
              Alamat: String(payload.alamat_dudi || '-').trim() || '-',
              Wilayah_Kota: 'Ponorogo',
              Link_Maps: mapsCheck.normalizedUrl,
              Hari_Kerja: String(payload.hari_kerja || payload.Hari_Kerja || '').trim(),
              Jam_Kerja: String(payload.jam_kerja || payload.Jam_Kerja || '').trim(),
              Kuota_Maksimal: 4,
              Status_Kerjasama: 'Mitra Baru',
            });
            resolvedDudiId = newDudiId;
          }
        } catch {
          // non-blocking DUDI lookup/creation
        }
      }

      const cleanClientRequestId = String(payload.client_request_id || '').trim();
      try {
        const existingRes = await fetchLiveSheetViaGas('Data_Pengajuan_PKL', true);
        const existingApp = existingRes.rows.find((r: any) => {
          const rReqId = pickField(r, 'No_Pengajuan', 'noPengajuan', 'id');
          if (cleanClientRequestId && rReqId === cleanClientRequestId) return true;
          const rNis = stripNisSymbols(pickField(r, 'NIS', 'nis')) || pickField(r, 'NIS', 'nis');
          const rStatusKakomli = normalizeStr(pickField(r, 'Status_Kakomli', 'statusKakomli'));
          if (!canonicalNis || rNis !== canonicalNis || rStatusKakomli !== 'pending') return false;
          const rDudiId = pickField(r, 'ID_DUDI', 'idDudi');
          const rDudiNama = normalizeStr(pickField(r, 'DUDI_Tujuan', 'dudiTujuan', 'nama_dudi'));
          return (
            (resolvedDudiId && rDudiId === resolvedDudiId) ||
            (resolvedDudiNama && rDudiNama === normalizeStr(resolvedDudiNama))
          );
        });
        if (existingApp) {
          const existingId = pickField(existingApp, 'No_Pengajuan', 'noPengajuan', 'id');
          const existingMaps = pickField(existingApp, 'Link_Maps', 'linkMaps', 'link_maps');
          const existingHari = pickField(existingApp, 'Hari_Kerja', 'hariKerja', 'hari_kerja');
          const existingJam = pickField(existingApp, 'Jam_Kerja', 'jamKerja', 'jam_kerja');
          return res.json({
            success: true,
            deduplicated: true,
            verifiedInSpreadsheet: true,
            sheetRowNumber: existingApp._sheetRowNumber,
            savedAt: new Date().toISOString(),
            message: 'Pengajuan PKL Anda untuk DUDI ini sudah tercatat di Cloud Server.',
            application: {
              ...existingApp,
              id: existingId,
              No_Pengajuan: existingId,
              nis: canonicalNis,
              nama_siswa: pickField(existingApp, 'Nama_Siswa', 'namaSiswa', 'nama_siswa') || canonicalNama,
              kelas: pickField(existingApp, 'Kelas', 'kelas') || canonicalKelas,
              jurusan: pickField(existingApp, 'Jurusan', 'jurusan') || canonicalJurusan,
              nama_dudi: pickField(existingApp, 'DUDI_Tujuan', 'dudiTujuan', 'nama_dudi') || resolvedDudiNama,
              Hari_Kerja: existingHari || String(payload.hari_kerja || '').trim(),
              hari_kerja: existingHari || String(payload.hari_kerja || '').trim(),
              Jam_Kerja: existingJam || String(payload.jam_kerja || '').trim(),
              jam_kerja: existingJam || String(payload.jam_kerja || '').trim(),
              Link_Maps: existingMaps || mapsCheck.normalizedUrl,
              link_maps: existingMaps || mapsCheck.normalizedUrl,
              status: pickField(existingApp, 'Status_Hubin', 'statusHubin', 'status') || 'Menunggu ACC Kakomli',
            },
          });
        }
      } catch {
        // Proceed with creation if deduplication pre-check is unavailable
      }

      const jurCode =
        generateJurusanCode(canonicalJurusan) ||
        String(canonicalJurusan || 'PKL').substring(0, 3).toUpperCase();
      const noPengajuan =
        cleanClientRequestId ||
        `REQ-${new Date().getFullYear()}-${jurCode}-${Math.floor(100 + Math.random() * 900)}`;
      const timestamp = getTodayWibDateTime();

      const baseStatusNote = payload.is_dudi_unregistered
        ? 'Pengajuan DUDI baru (perlu verifikasi kelayakan Hubin).'
        : 'Menunggu review relevansi kompetensi oleh Kakomli.';

      const sheetRow = {
        id: noPengajuan,
        No_Pengajuan: noPengajuan,
        noPengajuan,
        Timestamp: timestamp,
        timestamp,
        NIS: canonicalNis,
        nis: canonicalNis,
        Nama_Siswa: canonicalNama,
        namaSiswa: canonicalNama,
        nama_siswa: canonicalNama,
        Jurusan: canonicalJurusan,
        jurusan: canonicalJurusan,
        Kelas: canonicalKelas,
        kelas: canonicalKelas,
        DUDI_Tujuan: resolvedDudiNama,
        dudiTujuan: resolvedDudiNama,
        ID_DUDI: resolvedDudiId,
        idDudi: resolvedDudiId,
        nama_dudi: resolvedDudiNama,
        No_Surat_Permohonan: '',
        noSuratPermohonan: '',
        Tgl_Kirim_Surat: '',
        tanggalKirimSurat: '',
        Status_Balasan_DUDI: 'Belum Dikirim',
        statusBalasanDudi: 'Belum Dikirim',
        Tgl_Balasan: '',
        tanggalBalasan: '',
        Link_Surat_PDF: '',
        linkSuratPdf: '',
        Status_Kakomli: 'Pending',
        statusKakomli: 'Pending',
        Catatan_Kakomli: baseStatusNote,
        catatanKakomli: baseStatusNote,
        Status_Hubin: 'Menunggu ACC Kakomli',
        statusHubin: 'Menunggu ACC Kakomli',
        ID_Guru_Pendamping: autoIdGuruPendamping,
        idGuruPendamping: autoIdGuruPendamping,
        Guru_Pendamping: autoGuruPendamping,
        guruPendamping: autoGuruPendamping,
        Tgl_Berangkat: '',
        tanggalBerangkat: '',
        status: 'Menunggu Validasi Kakomli',
      };

      const persistedPengajuan = GoogleDriveSheetService.getInstance().stripFormulaManagedFields(
        'Data_Pengajuan_PKL',
        sheetRow
      );
      const writeReceipt = await writeLiveSheetViaGas('Data_Pengajuan_PKL', 'CREATE', persistedPengajuan);

      const backfillTasks: Promise<unknown>[] = [];

      if (matchedStudent) {
        const siswaId = pickField(matchedStudent, 'ID', 'id', 'NIS', 'nis');
        if (siswaId) {
          const inputNoHp = String(payload.telepon || '').trim();
          const inputAlamat = String(payload.alamat_domisili || '').trim();
          const inputNamaOrtu = String(payload.nama_orang_tua || '').trim();
          const inputNoOrtu = String(payload.telepon_orang_tua || '').trim();
          const currNoHp = pickField(matchedStudent, 'No_HP_Siswa', 'noHpSiswa');
          const currAlamat = pickField(matchedStudent, 'Alamat_Domisili', 'alamatDomisili');
          const currNamaOrtu = pickField(matchedStudent, 'Nama_Ortu_Wali', 'namaOrtuWali');
          const currNoOrtu = pickField(matchedStudent, 'No_Ortu_Wali', 'noOrtuWali');
          const currStatus = pickField(matchedStudent, 'Status_PKL', 'statusPKL');
          const studentUpdates: Record<string, any> = {};
          if (inputNoHp && inputNoHp !== currNoHp) studentUpdates.No_HP_Siswa = inputNoHp;
          if (inputAlamat && inputAlamat !== currAlamat) studentUpdates.Alamat_Domisili = inputAlamat;
          if (inputNamaOrtu && inputNamaOrtu !== currNamaOrtu) studentUpdates.Nama_Ortu_Wali = inputNamaOrtu;
          if (inputNoOrtu && inputNoOrtu !== currNoOrtu) studentUpdates.No_Ortu_Wali = inputNoOrtu;
          if (!currStatus || normalizeStr(currStatus) === 'belum daftar') {
            studentUpdates.Status_PKL = 'Diajukan';
          }
          if (Object.keys(studentUpdates).length > 0) {
            backfillTasks.push(
              writeLiveSheetViaGas('Master_Siswa_XI', 'UPDATE', {
                id: siswaId,
                ID: siswaId,
                _sheetRowNumber: matchedStudent._sheetRowNumber,
                ...studentUpdates,
              }).catch(() => {})
            );
          }
        }
      }

      if (matchedDudiRow) {
        const inputHari = String(payload.hari_kerja || payload.Hari_Kerja || '').trim();
        const inputJam = String(payload.jam_kerja || payload.Jam_Kerja || '').trim();
        const dudiUpdates: Record<string, any> = {};
        if (mapsCheck.normalizedUrl && !pickField(matchedDudiRow, 'Link_Maps', 'linkMaps', 'link_maps')) {
          dudiUpdates.Link_Maps = mapsCheck.normalizedUrl;
          dudiUpdates.linkMaps = mapsCheck.normalizedUrl;
        }
        if (inputHari && !pickField(matchedDudiRow, 'Hari_Kerja', 'hariKerja', 'hari_kerja')) {
          dudiUpdates.Hari_Kerja = inputHari;
          dudiUpdates.hariKerja = inputHari;
        }
        if (inputJam && !pickField(matchedDudiRow, 'Jam_Kerja', 'jamKerja', 'jam_kerja')) {
          dudiUpdates.Jam_Kerja = inputJam;
          dudiUpdates.jamKerja = inputJam;
        }
        if (Object.keys(dudiUpdates).length > 0) {
          const targetDudiId = pickField(matchedDudiRow, 'ID', 'id');
          if (targetDudiId) {
            backfillTasks.push(
              writeLiveSheetViaGas('Master_DUDI', 'UPDATE', {
                id: targetDudiId,
                ID: targetDudiId,
                _sheetRowNumber: matchedDudiRow._sheetRowNumber,
                ...dudiUpdates,
              }).catch(() => {})
            );
          }
        }
      }

      if (backfillTasks.length > 0) {
        await Promise.allSettled(backfillTasks);
      }

      res.json({
        success: true,
        verifiedInSpreadsheet: writeReceipt.verified,
        sheetRowNumber: writeReceipt.sheetRowNumber,
        savedAt: writeReceipt.savedAt,
        message: 'Pengajuan PKL berhasil disimpan dan diverifikasi ke Cloud Server.',
        application: sheetRow,
      });
    } catch (err: any) {
      handlePortalError(res, err);
    }
  });
}
