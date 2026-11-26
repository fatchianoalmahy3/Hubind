import type { Express, Request, Response } from 'express';
import { getTodayWibIsoDate } from '../../src/core/utils/dateHelpers';
import { stripNisSymbols } from '../../src/core/utils/nisHelpers';
import { normalizeStr, pickField } from '../../src/core/utils/rowFieldHelpers';
import { getFirestoreWorkspaceConfig } from '../config/runtimeConfig';
import {
  fetchMasterAkunFromGasOrDefaults,
  ROLE_TITLE_MAP,
  requireAdminAuth,
} from '../services/adminAuthService';
import {
  callGasCustomAction,
  fetchLiveSheetViaGas,
  invalidateSheetCacheEntry,
  writeLiveSheetViaGas,
} from '../services/sheetsTransport';
import {
  fetchIssuedLettersList,
  recordIssuedLetters,
  revokeIssuedLetter,
  type IssuedLetterTargetInput,
} from '../services/monitoringDomainService';
import { PortalConfigError } from '../types';
import { handlePortalError } from '../utils/httpHelpers';

const ISSUED_LETTER_ADMIN_ROLES = new Set(['SuperAdmin', 'Hubin', 'Pokja']);

function extractValidKepalaSekolahName(accounts: Array<{ role: string; status: string; namaLengkap: string }>): string {
  const kepsek =
    accounts.find((a) => a.role === 'Kepsek' && a.status === 'Aktif') ||
    accounts.find((a) => a.role === 'Kepsek');
  const raw = String(kepsek?.namaLengkap || '').trim();
  const lower = raw.toLowerCase();
  if (!raw || lower === 'kepala sekolah' || lower === 'kepsek') {
    return '';
  }
  return raw;
}

export function registerDocumentRoutes(app: Express): void {
  // Read centralized document signer settings (Kepala Sekolah) from Master_Akun (role: Kepsek)
  app.get('/api/documents/signers', async (req: Request, res: Response) => {
    try {
      await requireAdminAuth(req);
      const { accounts, syncedToSheet } = await fetchMasterAkunFromGasOrDefaults(false);
      return res.json({
        success: true,
        kepalaSekolah: extractValidKepalaSekolahName(accounts),
        syncedToSheet,
      });
    } catch (err: any) {
      handlePortalError(res, err);
    }
  });

  // Save centralized Kepala Sekolah signer name to Master_Akun (role: Kepsek)
  app.post('/api/documents/signers', async (req: Request, res: Response) => {
    try {
      await requireAdminAuth(req);
      const nextKepala = String(req.body?.kepalaSekolah || '').trim().slice(0, 150);
      if (!nextKepala) {
        return res.status(400).json({
          success: false,
          message: 'Nama Kepala Sekolah tidak boleh kosong.',
        });
      }

      const { accounts } = await fetchMasterAkunFromGasOrDefaults(true);
      const working = accounts.map((a) => ({ ...a }));
      const idx = working.findIndex((a) => a.role === 'Kepsek');
      if (idx === -1) {
        return res.status(404).json({
          success: false,
          message: 'Akun dengan peran Kepsek tidak ditemukan di Master_Akun.',
        });
      }

      working[idx] = {
        ...working[idx],
        namaLengkap: nextKepala,
        jabatan: working[idx].jabatan || ROLE_TITLE_MAP.Kepsek,
        updatedAt: new Date().toISOString(),
        isDefaultSeed: false,
      };

      const rowsPayload = working.map((a) => ({
        id: a.id,
        ID: a.id,
        Username: a.username,
        Password_Hash: a.passwordHash,
        Role: a.role,
        Nama_Lengkap: a.namaLengkap,
        Jabatan: a.jabatan,
        Status: a.status,
        Updated_At: a.updatedAt || new Date().toISOString(),
      }));

      await writeLiveSheetViaGas('Master_Akun', 'SYNC_ALL', rowsPayload);
      const cfg = await getFirestoreWorkspaceConfig();
      if (cfg.spreadsheetId) {
        invalidateSheetCacheEntry(cfg.spreadsheetId, 'Master_Akun');
      }

      return res.json({
        success: true,
        kepalaSekolah: nextKepala,
        message: 'Nama Kepala Sekolah berhasil disimpan ke Cloud Server (Master_Akun).',
      });
    } catch (err: any) {
      handlePortalError(res, err);
    }
  });

  // Generate Surat Permohonan/Perizinan PKL PDF in Google Drive via GAS & save link to Data_Perizinan_PKL
  app.post('/api/perizinan/generate-pdf', async (req: Request, res: Response) => {
    try {
      await requireAdminAuth(req);
      const body = req.body || {};
      const perizinanId = String(body.perizinanId || body.id || '').trim();

      let existingRow: any = null;
      if (perizinanId) {
        const izinRes = await fetchLiveSheetViaGas('Data_Perizinan_PKL', false).catch(() => ({ rows: [] as any[] }));
        existingRow = izinRes.rows.find((r: any) => {
          const rid = pickField(r, 'ID_Perizinan', 'idPerizinan', 'id');
          return rid === perizinanId;
        });
      }

      const nisClean = stripNisSymbols(
        String(body.nis || '').trim() || pickField(existingRow || {}, 'NIS', 'nis')
      );
      let namaSiswa =
        String(body.namaSiswa || '').trim() ||
        pickField(existingRow || {}, 'Nama_Siswa', 'namaSiswa');
      let kelas =
        String(body.kelas || '').trim() ||
        pickField(existingRow || {}, 'Kelas', 'kelas');
      let jurusan =
        String(body.jurusan || '').trim() ||
        pickField(existingRow || {}, 'Jurusan', 'jurusan');

      if (nisClean && (!namaSiswa || !kelas || kelas === '-' || !jurusan || jurusan === '-')) {
        const siswaRes = await fetchLiveSheetViaGas('Master_Siswa_XI', false).catch(() => ({
          rows: [] as any[],
        }));
        const matchedSiswa = siswaRes.rows.find(
          (s: any) => stripNisSymbols(pickField(s, 'NIS', 'nis')) === nisClean
        );
        if (matchedSiswa) {
          if (!namaSiswa) namaSiswa = pickField(matchedSiswa, 'Nama_Lengkap', 'namaLengkap', 'nama');
          if (!kelas || kelas === '-') kelas = pickField(matchedSiswa, 'Kelas', 'kelas') || kelas;
          if (!jurusan || jurusan === '-') {
            jurusan =
              pickField(matchedSiswa, 'Jurusan', 'jurusan', 'ID_Jurusan', 'idJurusan') || jurusan;
          }
        }
      }

      const dudiTujuan =
        String(body.dudiTujuan || '').trim() ||
        pickField(existingRow || {}, 'DUDI_Tujuan', 'dudiTujuan') ||
        'Mitra DUDI';

      let alamatDudi =
        String(body.alamatDudi || '').trim() ||
        pickField(existingRow || {}, 'Alamat_DUDI', 'alamatDudi');

      if (!alamatDudi || alamatDudi === '-') {
        const existingDudiId = pickField(existingRow || {}, 'ID_DUDI', 'idDudi');
        const dudiRes = await fetchLiveSheetViaGas('Master_DUDI', false).catch(() => ({ rows: [] as any[] }));
        const matchedDudi = dudiRes.rows.find(
          (d: any) =>
            (existingDudiId && pickField(d, 'ID', 'id') === existingDudiId) ||
            normalizeStr(pickField(d, 'Nama_DUDI', 'namaDudi')) === normalizeStr(dudiTujuan)
        );
        if (matchedDudi) {
          alamatDudi = pickField(matchedDudi, 'Alamat', 'alamat') || alamatDudi;
        }
      }

      const gasPayload = {
        perizinanId: perizinanId || `IZN-${Date.now()}`,
        noPerizinan:
          String(body.noPerizinan || '').trim() ||
          pickField(existingRow || {}, 'ID_Perizinan', 'idPerizinan', 'id') ||
          perizinanId,
        noSuratPermohonan:
          String(body.noSuratPermohonan || '').trim() ||
          pickField(existingRow || {}, 'No_Surat_Permohonan', 'noSuratPermohonan') ||
          `421.5 / ___ / Hubin / SMK.PGRI2 / ${new Date().getFullYear()}`,
        namaSiswa: namaSiswa || '-',
        nis: nisClean,
        kelas: kelas || '-',
        jurusan: jurusan || '-',
        dudiTujuan,
        alamatDudi: alamatDudi || 'Di Tempat',
        tanggalSurat: String(body.tanggalSurat || '').trim() || getTodayWibIsoDate(),
        kepalaSekolah: String(body.kepalaSekolah || '').trim() || 'Kepala SMK PGRI 2 Ponorogo',
      };

      const { data: gasResult } = await callGasCustomAction<{
        success?: boolean;
        pdfUrl?: string;
        fileId?: string;
        fileName?: string;
      }>('GENERATE_SURAT_IZIN_PDF', { data: gasPayload });

      const pdfUrl = String(gasResult?.pdfUrl || '').trim();
      if (!pdfUrl) {
        throw new PortalConfigError(
          'GAS_WRITE_ERROR',
          'Apps Script belum mengembalikan URL PDF. Pastikan Anda sudah memperbarui & Deploy ulang versi terbaru script GAS Web App.',
          502
        );
      }

      if (existingRow && perizinanId) {
        await writeLiveSheetViaGas('Data_Perizinan_PKL', 'UPDATE', {
          ...existingRow,
          id: pickField(existingRow, 'ID_Perizinan', 'idPerizinan', 'id') || perizinanId,
          ID_Perizinan: pickField(existingRow, 'ID_Perizinan', 'idPerizinan', 'id') || perizinanId,
          Link_Surat_PDF: pdfUrl,
          linkSuratPdf: pdfUrl,
        }).catch(() => {});
      }

      return res.json({
        success: true,
        pdfUrl,
        fileId: gasResult?.fileId || '',
        fileName: gasResult?.fileName || '',
        message: 'Surat Permohonan PDF berhasil dibuat di Google Drive.',
      });
    } catch (err: any) {
      handlePortalError(res, err);
    }
  });

  // Generate bundled 1-step Monitoring Packet PDF in Google Drive from official Google Docs templates via GAS
  app.post('/api/documents/generate-monitoring-bundle', async (req: Request, res: Response) => {
    try {
      const actor = await requireAdminAuth(req);
      const body = req.body || {};
      const bundles = Array.isArray(body.bundles) ? body.bundles : [];
      if (bundles.length === 0) {
        return res.status(400).json({
          success: false,
          code: 'EMPTY_BUNDLE',
          message: 'Pilih minimal satu DUDI siap cetak terlebih dahulu.',
        });
      }

      const { data: gasResult } = await callGasCustomAction<{
        success?: boolean;
        pdfUrl?: string;
        fileId?: string;
        fileName?: string;
        totalSheets?: number;
      }>(
        'GENERATE_MONITORING_BUNDLE_PDF',
        {
          data: {
            templateIds: body.templateIds || {},
            includeDocs: body.includeDocs || {},
            meta: body.meta || {},
            bundles,
          },
        },
        55_000
      );

      const pdfUrl = String(gasResult?.pdfUrl || '').trim();
      if (!pdfUrl) {
        throw new PortalConfigError(
          'GAS_WRITE_ERROR',
          'Apps Script belum mengembalikan URL PDF paket. Pastikan script GAS versi terbaru sudah di-Deploy.',
          502
        );
      }

      const metaObj = body.meta || {};
      const tahapNum = Number(metaObj.tahapNum || 0);
      let issuedCount = 0;
      if (
        Number.isInteger(tahapNum) &&
        tahapNum >= 1 &&
        tahapNum <= 8 &&
        ISSUED_LETTER_ADMIN_ROLES.has(actor.role)
      ) {
        const issuedTargets: IssuedLetterTargetInput[] = bundles
          .filter((b: any) => b && (b.namaDudi || b.dudiId))
          .map((b: any) => ({
            dudiId: String(b.dudiId || '').trim(),
            namaDudi: String(b.namaDudi || '').trim(),
            tahap: tahapNum,
            jenisDokumen: 'Paket PDF Drive',
            nomorSurat: String(metaObj.nomorSurat || '').trim(),
            tanggalTerbit: String(metaObj.tanggalSurat || '').trim(),
            diterbitkanOleh: actor.name || actor.username || 'Admin Hubin',
            idGuruPendamping: String(b.guruId || b.idGuru || b.idGuruPendamping || '').trim(),
            guruPendamping: String(b.namaGuru || '').trim(),
            linkPdf: pdfUrl,
          }));
        const recorded = await recordIssuedLetters(
          issuedTargets,
          actor.name || actor.username || 'Admin Hubin'
        ).catch(() => []);
        issuedCount = recorded.length;
      }

      return res.json({
        success: true,
        pdfUrl,
        fileId: gasResult?.fileId || '',
        fileName: gasResult?.fileName || '',
        totalSheets: gasResult?.totalSheets || 0,
        issuedRecorded: issuedCount > 0,
        issuedCount,
        message: 'Paket dokumen monitoring PDF berhasil dibuat dari Template Google Docs.',
      });
    } catch (err: any) {
      handlePortalError(res, err);
    }
  });

  // Read issued-letter log rows (Log_Penerbitan_Surat)
  app.get('/api/documents/issued-letters', async (req: Request, res: Response) => {
    try {
      await requireAdminAuth(req);
      const fresh = String(req.query?.fresh || '') === '1';
      const rows = await fetchIssuedLettersList(fresh);
      return res.json({
        success: true,
        total: rows.length,
        data: rows,
      });
    } catch (err: any) {
      handlePortalError(res, err);
    }
  });

  // Mark one or more (DUDI, Tahap 1..8) letters as issued ('Sudah Terbit')
  app.post('/api/documents/mark-issued', async (req: Request, res: Response) => {
    try {
      const actor = await requireAdminAuth(req);
      if (!ISSUED_LETTER_ADMIN_ROLES.has(actor.role)) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN_ROLE',
          message: 'Hanya SuperAdmin, Admin Hubin, atau Pokja yang dapat menerbitkan status surat.',
        });
      }

      const rawItems = Array.isArray(req.body?.items)
        ? req.body.items
        : req.body?.item
        ? [req.body.item]
        : [];
      if (rawItems.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Daftar target DUDI & Tahap yang akan diterbitkan tidak boleh kosong.',
        });
      }

      const sanitizedItems: IssuedLetterTargetInput[] = rawItems
        .map((it: any) => ({
          dudiId: String(it?.dudiId || '').trim().slice(0, 80),
          namaDudi: String(it?.namaDudi || '').trim().slice(0, 180),
          tahap: Number(it?.tahap),
          jenisDokumen: String(it?.jenisDokumen || '').trim().slice(0, 120),
          nomorSurat: String(it?.nomorSurat || '').trim().slice(0, 120),
          tanggalTerbit: String(it?.tanggalTerbit || '').trim().slice(0, 40),
          diterbitkanOleh: String(
            it?.diterbitkanOleh || actor.name || actor.username || 'Admin Hubin'
          )
            .trim()
            .slice(0, 120),
          idGuruPendamping: String(it?.idGuruPendamping || it?.idGuru || it?.guruId || '').trim().slice(0, 80),
          guruPendamping: String(it?.guruPendamping || '').trim().slice(0, 120),
          linkPdf: String(it?.linkPdf || '').trim().slice(0, 500),
        }))
        .filter(
          (it: IssuedLetterTargetInput) =>
            Number.isInteger(it.tahap) &&
            it.tahap >= 1 &&
            it.tahap <= 8 &&
            (Boolean(it.namaDudi) || Boolean(it.dudiId))
        );

      if (sanitizedItems.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Data DUDI atau nomor Tahap (1-8) tidak valid.',
        });
      }

      const recorded = await recordIssuedLetters(
        sanitizedItems,
        actor.name || actor.username || 'Admin Hubin'
      );

      return res.json({
        success: true,
        count: recorded.length,
        data: recorded,
        message: `${recorded.length} status penerbitan surat berhasil disimpan ke Cloud Server.`,
      });
    } catch (err: any) {
      handlePortalError(res, err);
    }
  });

  // Revoke issued-letter status ('Dibatalkan') for a (DUDI, Tahap 1..8)
  app.post('/api/documents/revoke-issued', async (req: Request, res: Response) => {
    try {
      const actor = await requireAdminAuth(req);
      if (!ISSUED_LETTER_ADMIN_ROLES.has(actor.role)) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN_ROLE',
          message: 'Hanya SuperAdmin, Admin Hubin, atau Pokja yang dapat membatalkan penerbitan surat.',
        });
      }

      const tahap = Number(req.body?.tahap);
      const idTerbit = String(req.body?.idTerbit || '').trim().slice(0, 100);
      const dudiId = String(req.body?.dudiId || '').trim().slice(0, 80);
      const namaDudi = String(req.body?.namaDudi || '').trim().slice(0, 180);

      if (!Number.isInteger(tahap) || tahap < 1 || tahap > 8 || (!idTerbit && !dudiId && !namaDudi)) {
        return res.status(400).json({
          success: false,
          message: 'Parameter pembatalan penerbitan surat (DUDI & Tahap 1-8) tidak valid.',
        });
      }

      const result = await revokeIssuedLetter({
        idTerbit,
        dudiId,
        namaDudi,
        tahap,
        actorName: actor.name || actor.username || 'Admin Hubin',
      });

      return res.json({
        success: true,
        revoked: result.revoked,
        idTerbit: result.idTerbit,
        message: result.revoked
          ? 'Status penerbitan surat berhasil dibatalkan.'
          : 'Catatan terbit aktif untuk DUDI & Tahap tersebut tidak ditemukan.',
      });
    } catch (err: any) {
      handlePortalError(res, err);
    }
  });
}
