import type { Express, Request, Response } from 'express';
import { ALLOWED_ADMIN_SHEETS } from '../../src/core/constants/sheetResourceMap';
import { GoogleDriveSheetService } from '../../src/core/GoogleDriveSheetService';
import { getFirestoreWorkspaceConfig } from '../config/runtimeConfig';
import {
  ROLE_TITLE_MAP,
  fetchMasterAkunFromGasOrDefaults,
  hashPasswordServer,
  requireAdminAuth,
  signAdminSessionToken,
  verifyPasswordServer,
} from '../services/adminAuthService';
import {
  callGasCustomAction,
  fetchBatchSheetsViaGas,
  fetchLiveSheetViaGas,
  invalidateServerCaches,
  invalidateSheetCacheEntry,
  parseGasJsonSafely,
  validateGasUrl,
  writeLiveSheetViaGas,
} from '../services/sheetsTransport';
import { type GasWriteAction, PortalConfigError } from '../types';
import { fetchWithTimeout, GAS_FETCH_TIMEOUT_MS, handlePortalError } from '../utils/httpHelpers';

const SAFE_ROLLOVER_MASTER_SHEETS = new Set([
  'Master_Akun',
  'Master_Jurusan',
  'Master_Guru_Pendamping',
  'Master_DUDI',
  'Master_Kelas_Walas',
]);

export function registerAdminRoutes(app: Express): void {
  // Admin Login: Username + Password verified against Master_Akun in Spreadsheet (or defaults)
  app.post('/api/admin/login', async (req: Request, res: Response) => {
    try {
      const username = String(req.body?.username || '').trim().toLowerCase();
      const password = String(req.body?.password || '');

      if (!username || !password) {
        return res.status(400).json({
          success: false,
          message: 'Username dan Password wajib diisi.',
        });
      }

      let { accounts } = await fetchMasterAkunFromGasOrDefaults(false);
      let matched = accounts.find((a) => a.username.toLowerCase() === username);

      if (!matched || !verifyPasswordServer(password, matched.passwordHash)) {
        const freshRes = await fetchMasterAkunFromGasOrDefaults(true);
        accounts = freshRes.accounts;
        matched = accounts.find((a) => a.username.toLowerCase() === username);
      }

      if (!matched) {
        return res.status(401).json({
          success: false,
          message: `Username "${username}" tidak ditemukan.`,
        });
      }

      if (matched.status === 'Nonaktif') {
        return res.status(403).json({
          success: false,
          message: `Akun "${username}" sedang dinonaktifkan oleh Admin Hubin.`,
        });
      }

      if (!verifyPasswordServer(password, matched.passwordHash)) {
        return res.status(401).json({
          success: false,
          message: 'Password yang Anda masukkan tidak sesuai.',
        });
      }

      const sessionToken = signAdminSessionToken({
        id: matched.id,
        username: matched.username,
        role: matched.role,
        name: matched.namaLengkap,
      });

      return res.json({
        success: true,
        sessionToken,
        user: {
          id: matched.id,
          username: matched.username,
          role: matched.role,
          name: matched.namaLengkap,
          title: matched.jabatan || ROLE_TITLE_MAP[matched.role] || matched.role,
          email: '',
          identifier: matched.username,
          canManageSpreadsheet: matched.role === 'SuperAdmin',
        },
      });
    } catch (err: any) {
      handlePortalError(res, err);
    }
  });

  // Admin Accounts: List Master_Akun (preserving password hashes server-side)
  app.get('/api/admin/accounts', async (req: Request, res: Response) => {
    try {
      const session = await requireAdminAuth(req);
      const { accounts, syncedToSheet } = await fetchMasterAkunFromGasOrDefaults(true);

      const visible =
        session.role === 'SuperAdmin'
          ? accounts
          : accounts.filter((a) => a.id === session.id || a.username === session.username);

      res.json({
        success: true,
        syncedToSheet,
        accounts: visible.map(({ passwordHash: _omit, ...rest }) => rest),
      });
    } catch (err: any) {
      handlePortalError(res, err);
    }
  });

  // Admin Accounts: Create / Update / Delete / Bootstrap to Master_Akun in Spreadsheet
  app.post('/api/admin/accounts', async (req: Request, res: Response) => {
    try {
      const session = await requireAdminAuth(req);
      const body = req.body || {};

      if (Array.isArray(body.accounts)) {
        if (session.role !== 'SuperAdmin' && body.accounts.length > 1) {
          return res.status(403).json({
            success: false,
            message: 'Hanya peran SuperAdmin yang dapat mengelola seluruh daftar akun.',
          });
        }
        await writeLiveSheetViaGas('Master_Akun', 'SYNC_ALL', body.accounts);
        const cfg = await getFirestoreWorkspaceConfig();
        if (cfg.spreadsheetId) {
          invalidateSheetCacheEntry(cfg.spreadsheetId, 'Master_Akun');
        }
        return res.json({ success: true });
      }

      const op = String(body.op || 'UPSERT').toUpperCase();
      const { accounts: currentAccounts } = await fetchMasterAkunFromGasOrDefaults(true);
      let working = currentAccounts.map((a) => ({ ...a }));

      if (op === 'BOOTSTRAP') {
        if (session.role !== 'SuperAdmin') {
          return res.status(403).json({ success: false, message: 'Hanya SuperAdmin yang dapat inisialisasi akun.' });
        }
        working = working.map((a) => ({ ...a, isDefaultSeed: false }));
      } else if (op === 'DELETE') {
        if (session.role !== 'SuperAdmin') {
          return res.status(403).json({ success: false, message: 'Hanya SuperAdmin yang dapat menghapus akun.' });
        }
        const targetId = String(body.id || '').trim();
        const target = working.find((a) => a.id === targetId);
        if (target) {
          const remainingSuperAdmin = working.filter(
            (a) => a.id !== targetId && a.role === 'SuperAdmin' && a.status === 'Aktif'
          );
          if (target.role === 'SuperAdmin' && remainingSuperAdmin.length === 0) {
            return res.status(400).json({
              success: false,
              message: 'Minimal harus ada 1 akun SuperAdmin aktif.',
            });
          }
          working = working.filter((a) => a.id !== targetId);
        }
      } else {
        const cleanUsername = String(body.username || '').trim().toLowerCase();
        if (!/^[a-z0-9._-]{3,32}$/.test(cleanUsername)) {
          return res.status(400).json({
            success: false,
            message: 'Username harus 3–32 karakter (huruf kecil, angka, titik, underscore, atau strip).',
          });
        }

        const targetId = String(body.id || '').trim();
        const existingIdx = working.findIndex(
          (a) => (targetId && a.id === targetId) || a.username === cleanUsername
        );

        if (session.role !== 'SuperAdmin') {
          if (existingIdx === -1 || working[existingIdx].id !== session.id) {
            return res.status(403).json({
              success: false,
              message: 'Anda hanya dapat mengubah username & password akun Anda sendiri.',
            });
          }
        }

        const duplicate = working.find((a, idx) => a.username === cleanUsername && idx !== existingIdx);
        if (duplicate) {
          return res.status(400).json({
            success: false,
            message: `Username "${cleanUsername}" sudah dipakai oleh akun lain.`,
          });
        }

        const newPassword = String(body.newPassword || '').trim();
        let passwordHash = existingIdx !== -1 ? working[existingIdx].passwordHash : '';
        if (newPassword) {
          if (newPassword.length < 6) {
            return res.status(400).json({
              success: false,
              message: 'Password baru minimal 6 karakter.',
            });
          }
          passwordHash = hashPasswordServer(newPassword);
        } else if (!passwordHash) {
          return res.status(400).json({
            success: false,
            message: 'Password wajib diisi untuk akun baru.',
          });
        }

        const requestedRole =
          session.role === 'SuperAdmin'
            ? String(body.role || (existingIdx !== -1 ? working[existingIdx].role : 'Pokja'))
            : working[existingIdx].role;

        const updatedRow = {
          id: targetId || (existingIdx !== -1 ? working[existingIdx].id : `AKN-${Date.now().toString(36).toUpperCase()}`),
          username: cleanUsername,
          passwordHash,
          role: requestedRole,
          namaLengkap: String(body.namaLengkap || '').trim() || cleanUsername,
          jabatan: String(body.jabatan || '').trim() || ROLE_TITLE_MAP[requestedRole] || requestedRole,
          status:
            session.role === 'SuperAdmin' && String(body.status || '').toLowerCase() === 'nonaktif'
              ? ('Nonaktif' as const)
              : ('Aktif' as const),
          updatedAt: new Date().toISOString(),
          isDefaultSeed: false,
        };

        if (existingIdx !== -1) {
          working[existingIdx] = updatedRow;
        } else {
          working.push(updatedRow);
        }
      }

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
        syncedToSheet: true,
        accounts: working.map(({ passwordHash: _omit, ...rest }) => rest),
      });
    } catch (err: any) {
      handlePortalError(res, err);
    }
  });

  // Invalidate server-side short-lived caches immediately after admin changes settings/data
  app.post('/api/cache/invalidate', async (req: Request, res: Response) => {
    try {
      await requireAdminAuth(req);
      const sheetParam = String(req.query.sheet || req.body?.sheet || '').trim();
      await invalidateServerCaches(sheetParam || undefined);
      res.json({ success: true, scope: sheetParam || 'all' });
    } catch (err: any) {
      handlePortalError(res, err);
    }
  });

  // Admin Proxy: Verify GAS Web App connection without requiring per-device Google OAuth popup
  app.get('/api/admin/gas-ping', async (req: Request, res: Response) => {
    try {
      await requireAdminAuth(req);
      const cfg = await getFirestoreWorkspaceConfig(true);
      const customGas = String(req.query.gasUrl || '').trim();
      const customSpreadsheetId = String(req.query.spreadsheetId || '').trim();
      const targetSpreadsheetId = customSpreadsheetId || cfg.spreadsheetId;
      const gasUrl = validateGasUrl(customGas || cfg.gasDeployUrl);

      if (!targetSpreadsheetId && !customGas) {
        throw new PortalConfigError(
          'SPREADSHEET_NOT_CONFIGURED',
          'ID Database Cloud Server belum dikonfigurasi oleh Admin Hubin.'
        );
      }

      const sep = gasUrl.includes('?') ? '&' : '?';
      const sidParam = targetSpreadsheetId
        ? `&spreadsheetId=${encodeURIComponent(targetSpreadsheetId)}`
        : '';
      const pingUrl = `${gasUrl}${sep}action=PING&sheet=Master_Jurusan&year=${encodeURIComponent(
        cfg.activeYear
      )}${sidParam}`;

      let gasRes: globalThis.Response;
      try {
        gasRes = await fetchWithTimeout(
          pingUrl,
          {
            method: 'GET',
            headers: { Accept: 'application/json' },
            redirect: 'follow',
          },
          GAS_FETCH_TIMEOUT_MS
        );
      } catch (err: any) {
        if (err instanceof PortalConfigError) throw err;
        throw new PortalConfigError(
          'GAS_FETCH_FAILED',
          `Gagal menghubungi Endpoint Cloud Server (${err?.message || 'network error'}). Pastikan URL berakhiran "/exec" dan akses server aktif.`,
          502
        );
      }

      const rawText = await gasRes.text();
      const json = parseGasJsonSafely(rawText, 'PING', gasRes.status);

      if (!gasRes.ok || json?.error) {
        throw new PortalConfigError(
          'GAS_ERROR',
          String(json?.error || `Server PING gagal (HTTP ${gasRes.status})`),
          502
        );
      }

      res.json({
        success: true,
        spreadsheetId: targetSpreadsheetId,
        title: json?.title || cfg.spreadsheetName || targetSpreadsheetId,
        sheets: Array.isArray(json?.sheets) ? json.sheets : [],
      });
    } catch (err: any) {
      handlePortalError(res, err);
    }
  });

  // Admin Proxy: Read table data via Cloud Server (consistent across refresh & devices)
  app.get('/api/admin/sheet', async (req: Request, res: Response) => {
    try {
      const session = await requireAdminAuth(req);
      const sheetName = String(req.query.sheet || '').trim();
      const fresh = String(req.query.fresh || '') === '1';

      if (!sheetName) {
        return res.status(400).json({ success: false, message: 'Parameter tabel wajib diisi.' });
      }
      if (!ALLOWED_ADMIN_SHEETS.has(sheetName)) {
        return res.status(400).json({ success: false, message: `Tabel [${sheetName}] tidak terdaftar.` });
      }
      if (sheetName.toLowerCase() === 'master_akun' && session.role !== 'SuperAdmin') {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN',
          message: 'Akses tabel Master_Akun hanya diperbolehkan untuk peran SuperAdmin.',
        });
      }

      const { rows, config } = await fetchLiveSheetViaGas(sheetName, fresh);
      res.json({
        success: true,
        sheetName,
        spreadsheetId: config.spreadsheetId,
        data: rows,
      });
    } catch (err: any) {
      handlePortalError(res, err);
    }
  });

  // Admin Proxy: Write table mutations via Cloud Server + instant cache invalidation
  app.post('/api/admin/sheet', async (req: Request, res: Response) => {
    try {
      const session = await requireAdminAuth(req);
      const { sheetName, action, data } = req.body || {};
      const targetSheet = String(sheetName || '').trim();
      const normalizedAction = String(action || '').toUpperCase();
      const validActions = new Set([
        'CREATE',
        'UPDATE',
        'DELETE',
        'BULK_DELETE',
        'BULK_UPDATE',
        'IMPORT',
        'SYNC_ALL',
      ]);

      if (!targetSheet || !validActions.has(normalizedAction)) {
        return res.status(400).json({
          success: false,
          message: 'Parameter tabel dan aksi tidak valid.',
        });
      }
      if (!ALLOWED_ADMIN_SHEETS.has(targetSheet)) {
        return res.status(400).json({
          success: false,
          message: `Tabel [${targetSheet}] tidak diizinkan untuk dimodifikasi.`,
        });
      }
      if (targetSheet.toLowerCase() === 'master_akun' && session.role !== 'SuperAdmin') {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN',
          message: 'Hanya SuperAdmin yang berhak mengubah data Master_Akun.',
        });
      }
      if (normalizedAction === 'SYNC_ALL' && session.role !== 'SuperAdmin' && session.role !== 'Hubin') {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN',
          message: 'Operasi sinkronisasi penuh (SYNC_ALL) hanya diperbolehkan untuk SuperAdmin atau Admin Hubin.',
        });
      }

      const receipt = await writeLiveSheetViaGas(targetSheet, normalizedAction as GasWriteAction, data);
      res.json({
        success: true,
        verified: receipt.verified,
        savedId: receipt.savedId,
        sheetRowNumber: receipt.sheetRowNumber,
        savedAt: receipt.savedAt,
      });
    } catch (err: any) {
      handlePortalError(res, err);
    }
  });

  // SuperAdmin Roll-over: Create new yearly Spreadsheet & safely copy selected Master tables
  app.post('/api/admin/rollover-year', async (req: Request, res: Response) => {
    try {
      const session = await requireAdminAuth(req);
      if (session.role !== 'SuperAdmin') {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN',
          message: 'Hanya peran SuperAdmin yang berhak membuka Tahun Ajaran baru dan menggandakan master.',
        });
      }

      const rawYear = String(req.body?.year || '').trim();
      if (!/^[0-9]{4}\/[0-9]{4}$/.test(rawYear)) {
        return res.status(400).json({
          success: false,
          message: 'Format Tahun Ajaran wajib YYYY/YYYY (contoh: 2027/2028).',
        });
      }

      const rawTargetId = String(req.body?.targetSpreadsheetId || '').trim();
      const targetMatch = rawTargetId.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
      const targetSpreadsheetId = targetMatch && targetMatch[1] ? targetMatch[1] : rawTargetId;

      const cleanYear = rawYear.replace(/\//g, '_');
      const spreadsheetTitle =
        String(req.body?.spreadsheetTitle || '').trim() ||
        `Hubin_SMK_PGRI_2_Ponorogo_${cleanYear}`;

      const requestedSheets = Array.isArray(req.body?.copySheets)
        ? req.body.copySheets
            .map((s: any) => String(s || '').trim())
            .filter((s: string) => SAFE_ROLLOVER_MASTER_SHEETS.has(s))
        : [];
      const selectedSheets = Array.from(new Set<string>(requestedSheets));

      const cfg = await getFirestoreWorkspaceConfig(true);
      const seedSheets: Record<string, any[]> = {};

      if (selectedSheets.length > 0 && cfg.spreadsheetId) {
        const sheetSvc = GoogleDriveSheetService.getInstance();
        const { sheets } = await fetchBatchSheetsViaGas(
          selectedSheets,
          new Set(['Master_Akun']),
          true
        );

        for (const sName of selectedSheets) {
          const rawRows = Array.isArray(sheets[sName]) ? sheets[sName] : [];
          if (rawRows.length === 0) continue;

          seedSheets[sName] = rawRows.map((row) => {
            const stripped = sheetSvc.stripFormulaManagedFields(sName, row || {});
            const { _sheetRowNumber: _omitRow, ...cleanRow } = stripped;
            return cleanRow;
          });
        }
      }

      const { data: gasResult } = await callGasCustomAction<{
        success?: boolean;
        spreadsheetId?: string;
        spreadsheetName?: string;
        spreadsheetUrl?: string;
        driveFolderUrl?: string;
        seededCounts?: Record<string, number>;
        plantedFormulas?: number;
      }>(
        'CREATE_YEARLY_SPREADSHEET',
        {
          year: rawYear,
          spreadsheetTitle,
          targetSpreadsheetId: targetSpreadsheetId || undefined,
          driveFolderUrl: cfg.driveFolderUrl || '',
          seedSheets,
        },
        45_000
      );

      if (!gasResult?.spreadsheetId) {
        throw new PortalConfigError(
          'GAS_ROLLOVER_INCOMPLETE',
          'Endpoint Cloud Server belum mengembalikan ID Spreadsheet baru. Pastikan skrip API GAS sudah diperbarui ke versi terbaru.',
          502
        );
      }

      await invalidateServerCaches();

      return res.json({
        success: true,
        year: rawYear,
        spreadsheetId: gasResult.spreadsheetId,
        spreadsheetName: gasResult.spreadsheetName || spreadsheetTitle,
        spreadsheetUrl:
          gasResult.spreadsheetUrl ||
          `https://docs.google.com/spreadsheets/d/${gasResult.spreadsheetId}`,
        driveFolderUrl: gasResult.driveFolderUrl || cfg.driveFolderUrl || '',
        seededCounts: gasResult.seededCounts || {},
        plantedFormulas: Number(gasResult.plantedFormulas || 0),
      });
    } catch (err: any) {
      handlePortalError(res, err);
    }
  });
}
