import { GoogleSheetClient } from './GoogleSheetClient';
import { GoogleDriveSheetService } from './GoogleDriveSheetService';
import { ToastManager } from './ToastManager';
import {
  buildStudentMonitoringSummary,
  calculateEqualWeightedAverage,
  extractStageNumber,
  getPredikatFromScore,
  getStageValueByNumber,
  stripStructuredTagsFromNote,
} from './utils/monitoringHelpers';
import {
  getTodayWibDateTime,
  getTodayWibIsoDate,
  normalizeToIsoDate,
} from './utils/dateHelpers';
import { stripNisSymbols } from './utils/nisHelpers';
import { IndexedDbSheetCache } from './cache/IndexedDbSheetCache';
import {
  safeFetchJson,
  HtmlResponseError,
  isTimeoutError,
  normalizeGasUrl,
  validateGasDeployUrl,
  formatGasNetworkError,
  isNetworkFetchError,
  isBackendProxyUnavailableError,
} from './utils/safeFetchJson';

const DIRECT_SHEET_CACHE_TTL_MS = 45_000;
const PUBLIC_SWR_SOFT_TTL_MS = 45_000;
const directSheetCache = new Map<string, { rows: any[]; fetchedAt: number }>();
const inFlightDirectReads = new Map<string, Promise<any[]>>();
const publicListMemCache = new Map<string, { data: any[]; etag?: string; updatedAt: number }>();
const inFlightPublicRevalidations = new Map<string, Promise<{ success: boolean; total: number; data: any[] }>>();

function pickField(row: Record<string, any>, ...keys: string[]): string {
  for (const k of keys) {
    const val = row?.[k];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  return '';
}

function normalizeStr(v: any): string {
  return String(v ?? '').trim().toLowerCase();
}

const INFRA_ERROR_CODES = new Set([
  'GAS_NOT_CONFIGURED',
  'GAS_INVALID_URL',
  'GAS_AUTH_REQUIRED',
  'GAS_INVALID_RESPONSE',
  'GAS_FETCH_FAILED',
  'GAS_WRITE_FAILED',
  'GAS_WRITE_ERROR',
  'GAS_ERROR',
  'SPREADSHEET_NOT_CONFIGURED',
  'INTERNAL_ERROR',
]);

async function ensureHydratedConfig() {
  const client = GoogleSheetClient.getInstance();
  let cfg = client.getConfig();
  if (!cfg.isFirestoreHydrated || !cfg.spreadsheetId) {
    await client.initFromFirestore();
    cfg = client.getConfig();
  }
  return {
    ...cfg,
    gasDeployUrl: normalizeGasUrl(cfg.gasDeployUrl),
  };
}

async function fetchGasGet(
  sheetName: string,
  cfg: Awaited<ReturnType<typeof ensureHydratedConfig>>,
  forceRefresh = false
): Promise<any[]> {
  if (!cfg.spreadsheetId) {
    throw new Error('Koneksi Database Cloud Server belum dikonfigurasi oleh Admin Hubin.');
  }
  const validation = validateGasDeployUrl(cfg.gasDeployUrl);
  if (!validation.valid) {
    throw new Error(
      validation.error ||
        'Koneksi Cloud Server belum dikonfigurasi oleh Admin Hubin.'
    );
  }
  const gasUrl = validation.normalizedUrl;

  const sep = gasUrl.includes('?') ? '&' : '?';
  const freshSuffix = forceRefresh ? `&fresh=1&_ts=${Date.now()}` : '';
  const targetUrl = `${gasUrl}${sep}sheet=${encodeURIComponent(sheetName)}&year=${encodeURIComponent(
    cfg.activeYear
  )}&spreadsheetId=${encodeURIComponent(cfg.spreadsheetId)}${freshSuffix}`;

  try {
    const { ok, status, data: json } = await safeFetchJson(targetUrl, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'follow',
      timeoutMs: 16_000,
    });
    if (!ok || json?.error) {
      throw new Error(json?.error || `Gagal membaca data dari Cloud Server (HTTP ${status}).`);
    }
    return Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
  } catch (err: any) {
    if (err instanceof HtmlResponseError && err.isGoogleAuth) {
      throw new Error(
        'Akses layanan Cloud Server publik masih dibatasi. Silakan hubungi Admin Hubin untuk memeriksa pengaturan akses server.'
      );
    }
    if (isNetworkFetchError(err)) {
      throw new Error(formatGasNetworkError(err, gasUrl));
    }
    throw err;
  }
}

async function fetchGasPost(
  sheetName: string,
  action: 'CREATE' | 'UPDATE',
  payload: any,
  cfg: Awaited<ReturnType<typeof ensureHydratedConfig>>
): Promise<void> {
  if (!cfg.spreadsheetId) {
    throw new Error('Koneksi Database Cloud Server belum dikonfigurasi oleh Admin Hubin.');
  }
  const validation = validateGasDeployUrl(cfg.gasDeployUrl);
  if (!validation.valid) {
    throw new Error(
      validation.error ||
        'Layanan Cloud Server untuk portal publik belum dikonfigurasi oleh Admin Hubin.'
    );
  }
  const gasUrl = validation.normalizedUrl;
  const preparedPayload = GoogleDriveSheetService.getInstance().prepareOutgoingRecord(sheetName, payload);
  const rawId = preparedPayload?.id || preparedPayload?.ID_Monitoring || preparedPayload?.ID_Penempatan || '';
  const { cleanId } = GoogleDriveSheetService.stripSyntheticRowSuffix(rawId);

  try {
    // Use text/plain;charset=utf-8 to avoid browser CORS OPTIONS preflight against script.google.com
    const { ok, status, data: json } = await safeFetchJson(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow',
      timeoutMs: 22_000,
      body: JSON.stringify({
        action,
        sheetName,
        year: cfg.activeYear,
        spreadsheetId: cfg.spreadsheetId,
        id: cleanId || rawId,
        sheetRowNumber: preparedPayload?._sheetRowNumber,
        data: preparedPayload,
        timestamp: new Date().toISOString(),
      }),
    });
    if (!ok || json?.error) {
      throw new Error(json?.error || `Gagal menyimpan data ke Cloud Server (HTTP ${status}).`);
    }
  } catch (err: any) {
    if (err instanceof HtmlResponseError && err.isGoogleAuth) {
      throw new Error(
        'Akses layanan Cloud Server publik masih dibatasi. Silakan hubungi Admin Hubin untuk memeriksa pengaturan akses server.'
      );
    }
    if (isNetworkFetchError(err)) {
      throw new Error(formatGasNetworkError(err, gasUrl));
    }
    throw err;
  }
}

async function readSheetDirect(sheetName: string, optional = false, forceRefresh = false): Promise<any[]> {
  const cfg = await ensureHydratedConfig();
  const cacheKey = `${cfg.spreadsheetId}::${sheetName}`;
  const cached = directSheetCache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.fetchedAt < DIRECT_SHEET_CACHE_TTL_MS) {
    return cached.rows;
  }

  if (!forceRefresh) {
    const existingFlight = inFlightDirectReads.get(cacheKey);
    if (existingFlight) {
      try {
        return await existingFlight;
      } catch (e) {
        if (optional) return [];
        throw e;
      }
    }
  }

  const readPromise = fetchGasGet(sheetName, cfg, forceRefresh).then((rows) => {
    directSheetCache.set(cacheKey, { rows, fetchedAt: Date.now() });
    return rows;
  });

  if (!forceRefresh) {
    inFlightDirectReads.set(cacheKey, readPromise);
  }

  try {
    return await readPromise;
  } catch (e) {
    if (optional) return [];
    throw e;
  } finally {
    if (inFlightDirectReads.get(cacheKey) === readPromise) {
      inFlightDirectReads.delete(cacheKey);
    }
  }
}

async function readMasterSiswaDirect(): Promise<any[]> {
  try {
    const primary = await readSheetDirect('Master_Siswa_XI');
    if (primary.length > 0) return primary;
    const fallback = await readSheetDirect('Master_Siswa', true);
    return fallback.length > 0 ? fallback : primary;
  } catch (err: any) {
    const fallback = await readSheetDirect('Master_Siswa', true);
    if (fallback.length > 0) return fallback;
    throw err;
  }
}

async function writeSheetDirect(sheetName: string, action: 'CREATE' | 'UPDATE', payload: any): Promise<void> {
  const cfg = await ensureHydratedConfig();
  await fetchGasPost(sheetName, action, payload, cfg);
  directSheetCache.delete(`${cfg.spreadsheetId}::${sheetName}`);
  GoogleSheetClient.getInstance().invalidateClientSheetCache(sheetName);
  await safeFetchJson(`/api/cache/invalidate?sheet=${encodeURIComponent(sheetName)}`, {
    method: 'POST',
    timeoutMs: 2_500,
  }).catch(() => {});
}

/**
 * Runs server endpoint first; automatically switches to direct Firestore-configured GAS when:
 * 1) The hosting environment serves SPA index.html (HTTP 200 HTML) for /api/*, OR
 * 2) The backend /api/* reports a GAS/config error that direct GAS can diagnose directly.
 */
async function callPublicEndpoint<T>(
  apiCall: () => Promise<{ ok: boolean; status: number; data: any }>,
  directClientCall: () => Promise<T>
): Promise<T> {
  try {
    const { ok, status, data } = await apiCall();
    if (ok && data?.success) {
      return data as T;
    }

    const errCode = String(data?.code || '');
    // Do NOT trigger slow duplicate direct retry if the backend already timed out talking to GAS
    if (errCode === 'GAS_TIMEOUT' || status === 504) {
      throw new Error(
        data?.message ||
          'Koneksi ke Cloud Server melebihi batas waktu. Periksa koneksi internet atau coba beberapa saat lagi.'
      );
    }

    const isProxyRouteMissing =
      (status === 404 && errCode !== 'PETUGAS_NOT_FOUND') ||
      status === 405 ||
      errCode === 'API_ROUTE_NOT_FOUND';
    const isInfraFailure = INFRA_ERROR_CODES.has(errCode) || status >= 500 || isProxyRouteMissing;
    if (!isInfraFailure) {
      throw new Error(data?.message || `Permintaan ditolak (HTTP ${status}).`);
    }

    return await directClientCall();
  } catch (err: any) {
    if (isTimeoutError(err)) {
      throw err;
    }
    if (isBackendProxyUnavailableError(err)) {
      return directClientCall();
    }
    throw err;
  }
}

export const PublicPortalClient = {
  async getConfigSummary(): Promise<{
    success: boolean;
    activeYear: string;
    isConfigured: boolean;
    hasGasUrl: boolean;
    spreadsheetName: string;
  }> {
    const cfg = await ensureHydratedConfig();

    try {
      const { ok, data } = await safeFetchJson('/api/public/config-summary');
      if (ok && data?.success) {
        return data;
      }
    } catch {
      // Static SPA host -> fall back cleanly to Firestore config
    }

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

    const readCached = async () => {
      const mem = publicListMemCache.get(idbKey);
      if (mem) return mem;
      const fromIdb = await IndexedDbSheetCache.getInstance().get(idbKey);
      if (fromIdb) {
        const entry = { data: fromIdb.data, etag: fromIdb.etag, updatedAt: fromIdb.updatedAt };
        publicListMemCache.set(idbKey, entry);
        return entry;
      }
      return null;
    };

    const fetchFresh = async (priorEtag?: string): Promise<{ success: boolean; total: number; data: any[] }> => {
      const inflightKey = `dudi::${idbKey}`;
      const existing = inFlightPublicRevalidations.get(inflightKey);
      if (existing) return existing;

      const task = (async () => {
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (priorEtag && !options?.forceRefresh) {
          headers['If-None-Match'] = priorEtag;
        }

        const res = await callPublicEndpoint(
          async () => {
            const url = options?.forceRefresh
              ? `/api/public/dudi-list?fresh=1&_ts=${Date.now()}`
              : '/api/public/dudi-list';
            const fetched = await safeFetchJson(url, { headers });
            if (fetched.notModified) {
              const cachedNow = await readCached();
              if (cachedNow) {
                const refreshed = { ...cachedNow, updatedAt: Date.now(), etag: fetched.etag || cachedNow.etag };
                publicListMemCache.set(idbKey, refreshed);
                IndexedDbSheetCache.getInstance().set(idbKey, refreshed.data, refreshed.etag).catch(() => {});
                return {
                  ok: true,
                  status: 200,
                  data: { success: true, total: cachedNow.data.length, data: cachedNow.data, notModified: true },
                };
              }
            }
            if (fetched.ok && fetched.data?.success && Array.isArray(fetched.data.data)) {
              const etagVal = fetched.etag || fetched.data.etag;
              const entry = { data: fetched.data.data, etag: etagVal, updatedAt: Date.now() };
              publicListMemCache.set(idbKey, entry);
              IndexedDbSheetCache.getInstance().set(idbKey, entry.data, etagVal).catch(() => {});
            }
            return fetched;
          },
          async () => {
            const rows = await readSheetDirect('Master_DUDI', false, Boolean(options?.forceRefresh));
            const mapped = rows
              .filter((d: any) => pickField(d, 'Nama_DUDI', 'namaDudi', 'nama_dudi', 'nama') !== '')
              .map((d: any, idx: number) => {
                const namaPemimpin = pickField(d, 'Nama_Pemimpin', 'namaPemimpin', 'nama_pemimpin', 'pimpinan');
                const namaPic = pickField(d, 'Nama_PIC', 'namaPic', 'nama_pic');
                const kontakPic = pickField(d, 'Kontak_PIC', 'kontakPic', 'kontak_pic');
                const noTelpDudi =
                  pickField(d, 'No_Telp_DUDI', 'noTelpDudi', 'no_telp_dudi', 'telepon') || kontakPic;
                return {
                  id: pickField(d, 'ID', 'id') || `dudi_${idx + 1}`,
                  nama_dudi: pickField(d, 'Nama_DUDI', 'namaDudi', 'nama_dudi', 'nama'),
                  bidang_usaha: pickField(d, 'Bidang_Keahlian', 'bidangKeahlian', 'bidang_usaha') || '-',
                  alamat: pickField(d, 'Alamat', 'alamat'),
                  kota: pickField(d, 'Wilayah_Kota', 'wilayahKota', 'kota'),
                  kuota_maksimal: Number(d.Kuota_Maksimal ?? d.kuotaMaksimal ?? 0),
                  terisi: Number(d.Terisi ?? d.terisi ?? 0),
                  status: pickField(d, 'Status_Kerjasama', 'statusKerjasama', 'status') || 'Aktif',
                  nama_pemimpin: namaPemimpin,
                  nama_pic: namaPic,
                  kontak_pic: kontakPic,
                  no_telp_dudi: noTelpDudi,
                  pimpinan: namaPemimpin || namaPic,
                  telepon: noTelpDudi,
                };
              });
            const entry = { data: mapped, updatedAt: Date.now() };
            publicListMemCache.set(idbKey, entry);
            IndexedDbSheetCache.getInstance().set(idbKey, mapped).catch(() => {});
            return { success: true, total: mapped.length, data: mapped };
          }
        );
        return res;
      })().finally(() => {
        inFlightPublicRevalidations.delete(inflightKey);
      });

      inFlightPublicRevalidations.set(inflightKey, task);
      return task;
    };

    if (!options?.forceRefresh) {
      const cached = await readCached();
      if (cached && Array.isArray(cached.data) && cached.data.length > 0) {
        if (Date.now() - cached.updatedAt > PUBLIC_SWR_SOFT_TTL_MS) {
          void fetchFresh(cached.etag)
            .then((freshRes: any) => {
              if (!freshRes?.notModified && freshRes?.success) {
                options?.onUpdate?.({ success: true, total: freshRes.data.length, data: freshRes.data });
              }
            })
            .catch(() => {});
        }
        return { success: true, total: cached.data.length, data: cached.data };
      }
    }

    const res = await fetchFresh();
    return { success: Boolean(res?.success), total: res?.total ?? res?.data?.length ?? 0, data: res?.data || [] };
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
      async () => {
        const rows = await readMasterSiswaDirect();
        const student = rows.find((s: any) => {
          const rowNis = pickField(s, 'NIS', 'nis');
          const rowNisDigits = stripNisSymbols(rowNis);
          const rowNik = pickField(s, 'NIK', 'nik');
          const rowNikDigits = stripNisSymbols(rowNik);
          if (searchNisDigits && (rowNisDigits === searchNisDigits || rowNikDigits === searchNisDigits)) {
            return true;
          }
          return rowNis === rawSearchNis || rowNik === rawSearchNis;
        });

        if (!student) {
          return {
            success: true,
            found: false,
            message: `Siswa dengan NIS [${rawSearchNis}] tidak ditemukan di Database Sekolah.`,
          };
        }

        const canonicalNisRaw = pickField(student, 'NIS', 'nis');
        const canonicalNis = stripNisSymbols(canonicalNisRaw) || canonicalNisRaw;

        return {
          success: true,
          found: true,
          student: {
            id: pickField(student, 'ID', 'id', 'NIS', 'nis'),
            nama: pickField(student, 'Nama_Lengkap', 'nama', 'namaLengkap'),
            nis: canonicalNis,
            nik: pickField(student, 'NIK', 'nik'),
            kelas: pickField(student, 'Kelas', 'kelas'),
            jurusan: pickField(student, 'ID_Jurusan', 'jurusan', 'Jurusan', 'idJurusan'),
            telepon: pickField(student, 'No_HP_Siswa', 'noHpSiswa', 'telepon', 'noHp'),
            jk: pickField(student, 'Jenis_Kelamin', 'jenisKelamin', 'jk') || 'Laki-laki',
            alamat_domisili: pickField(
              student,
              'Alamat_Domisili',
              'alamatDomisili',
              'alamat_domisili',
              'Alamat',
              'alamat'
            ),
            nama_wali: pickField(
              student,
              'Nama_Ortu_Wali',
              'namaOrtuWali',
              'nama_ortu_wali',
              'Nama_Wali',
              'nama_wali'
            ),
            telepon_wali: pickField(
              student,
              'No_Ortu_Wali',
              'noOrtuWali',
              'no_ortu_wali',
              'Telepon_Wali',
              'telepon_wali'
            ),
          },
        };
      }
    );
  },

  async submitApplication(payload: any): Promise<{
    success: boolean;
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
        async () => {
          if (!payload?.nis || !payload?.nama) {
            throw new Error('NIS dan Nama Siswa wajib diisi.');
          }

          const noPengajuan = `REQ-${new Date().getFullYear()}-${String(payload.jurusan || 'PKL')
            .substring(0, 3)
            .toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
          const timestamp = getTodayWibDateTime();
          const cleanNis = stripNisSymbols(payload.nis) || String(payload.nis).trim();

          const namaPemimpin = String(payload.nama_pemimpin || '').trim();
          const namaPic = String(payload.nama_pic || '').trim();
          const noTelpDudi = String(payload.no_telp_dudi || '').trim();

          const dudiContactSummary = [
            namaPemimpin ? `Pemimpin: ${namaPemimpin}` : '',
            namaPic ? `PIC/Pendamping: ${namaPic}` : '',
            noTelpDudi ? `Telp DUDI: ${noTelpDudi}` : '',
          ]
            .filter(Boolean)
            .join(' | ');

          const baseStatusNote = payload.is_dudi_unregistered
            ? 'Pengajuan DUDI baru (perlu verifikasi kelayakan Hubin).'
            : 'Menunggu review relevansi kompetensi oleh Kakomli.';

          const combinedCatatanKakomli = dudiContactSummary
            ? `${baseStatusNote} [${dudiContactSummary}]`
            : baseStatusNote;

          const sheetRow = {
            id: noPengajuan,
            No_Pengajuan: noPengajuan,
            noPengajuan,
            Timestamp: timestamp,
            timestamp,
            NIS: cleanNis,
            nis: cleanNis,
            Nama_Siswa: String(payload.nama).trim(),
            namaSiswa: String(payload.nama).trim(),
            nama_siswa: String(payload.nama).trim(),
            Jurusan: String(payload.jurusan || ''),
            jurusan: String(payload.jurusan || ''),
            Kelas: String(payload.kelas || ''),
            kelas: String(payload.kelas || ''),
            DUDI_Tujuan: String(payload.nama_dudi || ''),
            dudiTujuan: String(payload.nama_dudi || ''),
            ID_DUDI: payload.dudi_id && payload.dudi_id !== 'custom_hubin' ? String(payload.dudi_id) : '',
            idDudi: payload.dudi_id && payload.dudi_id !== 'custom_hubin' ? String(payload.dudi_id) : '',
            nama_dudi: String(payload.nama_dudi || ''),
            Alamat_DUDI: String(payload.alamat_dudi || ''),
            alamatDudi: String(payload.alamat_dudi || ''),
            Bidang_Pekerjaan: String(payload.bidang_dudi || ''),
            bidangPekerjaan: String(payload.bidang_dudi || ''),
            Nama_Pemimpin: namaPemimpin,
            namaPemimpin,
            Nama_PIC: namaPic,
            namaPic,
            No_Telp_DUDI: noTelpDudi,
            noTelpDudi,
            Kontak_PIC: noTelpDudi,
            kontakPic: noTelpDudi,
            No_WA: String(payload.telepon || ''),
            noWa: String(payload.telepon || ''),
            Alamat_Domisili: String(payload.alamat_domisili || ''),
            alamatDomisili: String(payload.alamat_domisili || ''),
            Nama_Ortu_Wali: String(payload.nama_orang_tua || ''),
            namaOrtuWali: String(payload.nama_orang_tua || ''),
            No_Ortu_Wali: String(payload.telepon_orang_tua || ''),
            noOrtuWali: String(payload.telepon_orang_tua || ''),
            Status_Kakomli: 'Pending',
            statusKakomli: 'Pending',
            Catatan_Kakomli: combinedCatatanKakomli,
            catatanKakomli: combinedCatatanKakomli,
            Status_Hubin: 'Menunggu ACC Kakomli',
            statusHubin: 'Menunggu ACC Kakomli',
            Guru_Pendamping: '',
            guruPendamping: '',
            Tgl_Berangkat: '',
            tanggalBerangkat: '',
            status: 'Menunggu Validasi Kakomli',
          };

          await writeSheetDirect('Data_Pengajuan_PKL', 'CREATE', sheetRow);
          return {
            success: true,
            message: 'Pengajuan PKL berhasil disimpan ke Cloud Server.',
            application: sheetRow,
          };
        }
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

    const readCached = async () => {
      const mem = publicListMemCache.get(idbKey);
      if (mem) return mem;
      const fromIdb = await IndexedDbSheetCache.getInstance().get(idbKey);
      if (fromIdb) {
        const entry = { data: fromIdb.data, etag: fromIdb.etag, updatedAt: fromIdb.updatedAt };
        publicListMemCache.set(idbKey, entry);
        return entry;
      }
      return null;
    };

    const fetchFresh = async (priorEtag?: string): Promise<{ success: boolean; total: number; data: any[] }> => {
      const inflightKey = `petugas::${idbKey}`;
      const existing = inFlightPublicRevalidations.get(inflightKey);
      if (existing) return existing;

      const task = (async () => {
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (priorEtag && !options?.forceRefresh) {
          headers['If-None-Match'] = priorEtag;
        }

        const res = await callPublicEndpoint(
          async () => {
            const url = options?.forceRefresh
              ? `/api/public/petugas-list?fresh=1&_ts=${Date.now()}`
              : '/api/public/petugas-list';
            const fetched = await safeFetchJson(url, { headers });
            if (fetched.notModified) {
              const cachedNow = await readCached();
              if (cachedNow) {
                const refreshed = { ...cachedNow, updatedAt: Date.now(), etag: fetched.etag || cachedNow.etag };
                publicListMemCache.set(idbKey, refreshed);
                IndexedDbSheetCache.getInstance().set(idbKey, refreshed.data, refreshed.etag).catch(() => {});
                return {
                  ok: true,
                  status: 200,
                  data: { success: true, total: cachedNow.data.length, data: cachedNow.data, notModified: true },
                };
              }
            }
            if (fetched.ok && fetched.data?.success && Array.isArray(fetched.data.data)) {
              const etagVal = fetched.etag || fetched.data.etag;
              const entry = { data: fetched.data.data, etag: etagVal, updatedAt: Date.now() };
              publicListMemCache.set(idbKey, entry);
              IndexedDbSheetCache.getInstance().set(idbKey, entry.data, etagVal).catch(() => {});
            }
            return fetched;
          },
          async () => {
            const rows = await readSheetDirect('Master_Guru_Pendamping', false, Boolean(options?.forceRefresh));
            const mapped = rows
              .filter((g: any) => pickField(g, 'Nama_Lengkap', 'nama', 'Nama') !== '')
              .map((g: any, idx: number) => ({
                id: pickField(g, 'ID', 'id') || `guru_${idx + 1}`,
                nama: pickField(g, 'Nama_Lengkap', 'nama', 'Nama'),
                nip: pickField(g, 'NIP', 'nip') || '-',
                peran: pickField(g, 'Peran_Utama', 'peranUtama', 'peran') || 'Guru Pendamping',
                email: pickField(g, 'Email_Google', 'email', 'emailGoogle'),
              }));
            const entry = { data: mapped, updatedAt: Date.now() };
            publicListMemCache.set(idbKey, entry);
            IndexedDbSheetCache.getInstance().set(idbKey, mapped).catch(() => {});
            return { success: true, total: mapped.length, data: mapped };
          }
        );
        return res;
      })().finally(() => {
        inFlightPublicRevalidations.delete(inflightKey);
      });

      inFlightPublicRevalidations.set(inflightKey, task);
      return task;
    };

    if (!options?.forceRefresh) {
      const cached = await readCached();
      if (cached && Array.isArray(cached.data) && cached.data.length > 0) {
        if (Date.now() - cached.updatedAt > PUBLIC_SWR_SOFT_TTL_MS) {
          void fetchFresh(cached.etag)
            .then((freshRes: any) => {
              if (!freshRes?.notModified && freshRes?.success) {
                options?.onUpdate?.({ success: true, total: freshRes.data.length, data: freshRes.data });
              }
            })
            .catch(() => {});
        }
        return { success: true, total: cached.data.length, data: cached.data };
      }
    }

    const res = await fetchFresh();
    return { success: Boolean(res?.success), total: res?.total ?? res?.data?.length ?? 0, data: res?.data || [] };
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
      async () => {
        const enteredPin = String(params.pin || '').trim();
        if (!enteredPin || enteredPin.length < 4) {
          throw new Error('PIN Petugas 4 digit wajib diisi.');
        }

        const rows = await readSheetDirect('Master_Guru_Pendamping');
        const teacher = rows.find((g: any) => {
          const id = pickField(g, 'ID', 'id');
          const nama = pickField(g, 'Nama_Lengkap', 'nama', 'Nama');
          return (
            (params.petugas_id && id === String(params.petugas_id).trim()) ||
            (params.nama_petugas && normalizeStr(nama) === normalizeStr(params.nama_petugas))
          );
        });

        if (!teacher) {
          throw new Error('Data petugas tidak ditemukan di Database Cloud Server.');
        }

        const explicitPin = pickField(teacher, 'PIN', 'pin', 'Pin');
        const nipDigits = pickField(teacher, 'NIP', 'nip').replace(/\D/g, '');
        const waDigits = pickField(teacher, 'Kontak_WA', 'kontakWA', 'kontakWa', 'No_HP').replace(/\D/g, '');

        const validPins: string[] = [];
        if (explicitPin) validPins.push(explicitPin);
        if (nipDigits.length >= 4) validPins.push(nipDigits.slice(-4));
        if (waDigits.length >= 4) validPins.push(waDigits.slice(-4));

        if (validPins.length === 0) {
          throw new Error(
            'Petugas belum memiliki PIN atau No. WhatsApp terdaftar di Cloud Server untuk verifikasi.'
          );
        }

        if (!validPins.includes(enteredPin)) {
          throw new Error(
            'PIN Petugas tidak cocok. Gunakan PIN atau 4 digit terakhir NIP / No. WhatsApp terdaftar.'
          );
        }

        const resolvedName = pickField(teacher, 'Nama_Lengkap', 'nama', 'Nama');
        return {
          success: true,
          message: `Identitas ${resolvedName} terverifikasi.`,
          sessionToken: `pin_auth_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          verifiedPetugas: {
            id: pickField(teacher, 'ID', 'id') || params.petugas_id,
            nama: resolvedName,
            nip: pickField(teacher, 'NIP', 'nip') || '-',
            verifiedAt: new Date().toISOString(),
          },
        };
      }
    );
  },

  async getPetugasDudi(
    petugasNama: string,
    petugasId: string
  ): Promise<{ success: boolean; total: number; data: any[] }> {
    return callPublicEndpoint(
      () =>
        safeFetchJson(
          `/api/public/petugas-dudi?petugasNama=${encodeURIComponent(
            petugasNama
          )}&petugasId=${encodeURIComponent(petugasId)}`
        ),
      async () => {
        const [plottingRows, dudiRows, pengajuanRows] = await Promise.all([
          readSheetDirect('Plotting_Pemberangkatan', true),
          readSheetDirect('Master_DUDI'),
          readSheetDirect('Data_Pengajuan_PKL', true),
        ]);

        const dudiMapById = new Map<string, any>();
        const dudiMapByName = new Map<string, any>();
        for (const d of dudiRows) {
          const id = pickField(d, 'ID', 'id');
          const nama = pickField(d, 'Nama_DUDI', 'namaDudi', 'nama_dudi');
          if (id) dudiMapById.set(id, d);
          if (nama) dudiMapByName.set(normalizeStr(nama), d);
        }

        const grouped = new Map<string, { dudi: any; studentNisSet: Set<string> }>();
        const targetNamaNorm = normalizeStr(petugasNama);

        for (const p of plottingRows) {
          const statusPlt = normalizeStr(pickField(p, 'Status_Penempatan', 'statusPenempatan'));
          if (statusPlt === 'dibatalkan' || statusPlt === 'batal') continue;

          const rowGuruId = pickField(p, 'ID_Guru_Pendamping', 'idGuruPendamping');
          const rowGuruNama = normalizeStr(pickField(p, 'Guru_Pendamping', 'guruPendamping'));
          const isMatch =
            (petugasId && rowGuruId && rowGuruId === petugasId) ||
            (targetNamaNorm &&
              rowGuruNama &&
              (rowGuruNama === targetNamaNorm ||
                rowGuruNama.includes(targetNamaNorm) ||
                targetNamaNorm.includes(rowGuruNama)));

          if (!isMatch) continue;

          const dudiId = pickField(p, 'ID_DUDI', 'idDudi');
          const dudiNamaRaw = pickField(p, 'Nama_DUDI', 'namaDudi');
          const master =
            (dudiId && dudiMapById.get(dudiId)) || (dudiNamaRaw && dudiMapByName.get(normalizeStr(dudiNamaRaw)));

          const resolvedName = pickField(master || {}, 'Nama_DUDI', 'namaDudi') || dudiNamaRaw;
          if (!resolvedName) continue;

          const key = normalizeStr(resolvedName);
          if (!grouped.has(key)) {
            grouped.set(key, {
              dudi: {
                id: pickField(master || {}, 'ID', 'id') || dudiId || key,
                nama: resolvedName,
                alamat: pickField(master || {}, 'Alamat', 'alamat') || '-',
                bidang: pickField(master || {}, 'Bidang_Keahlian', 'bidangKeahlian') || '-',
                pic: pickField(master || {}, 'Nama_PIC', 'namaPic') || '-',
                kontak: pickField(master || {}, 'Kontak_PIC', 'kontakPic') || '-',
                kuota: Number(master?.Kuota_Maksimal ?? master?.kuotaMaksimal ?? 0),
              },
              studentNisSet: new Set<string>(),
            });
          }
          const nis = pickField(p, 'NIS', 'nis') || pickField(p, 'Nama_Siswa', 'namaSiswa');
          if (nis) grouped.get(key)!.studentNisSet.add(nis);
        }

        for (const reqRow of pengajuanRows) {
          const statusHubin = normalizeStr(pickField(reqRow, 'Status_Hubin', 'statusHubin'));
          const statusKakomli = normalizeStr(pickField(reqRow, 'Status_Kakomli', 'statusKakomli'));
          if (statusHubin === 'batal' || statusKakomli === 'ditolak') continue;

          const rowGuruId = pickField(reqRow, 'ID_Guru_Pendamping', 'idGuruPendamping');
          const rowGuruNama = normalizeStr(pickField(reqRow, 'Guru_Pendamping', 'guruPendamping'));
          const isMatch =
            (petugasId && rowGuruId && rowGuruId === petugasId) ||
            (targetNamaNorm &&
              rowGuruNama &&
              (rowGuruNama === targetNamaNorm ||
                rowGuruNama.includes(targetNamaNorm) ||
                targetNamaNorm.includes(rowGuruNama)));
          if (!isMatch) continue;

          const dudiId = pickField(reqRow, 'ID_DUDI', 'idDudi');
          const dudiNamaRaw = pickField(reqRow, 'DUDI_Tujuan', 'dudiTujuan');
          if (!dudiNamaRaw) continue;
          const master = (dudiId && dudiMapById.get(dudiId)) || dudiMapByName.get(normalizeStr(dudiNamaRaw));
          const key = normalizeStr(dudiNamaRaw);

          if (!grouped.has(key)) {
            grouped.set(key, {
              dudi: {
                id: pickField(master || {}, 'ID', 'id') || dudiId || key,
                nama: pickField(master || {}, 'Nama_DUDI', 'namaDudi') || dudiNamaRaw,
                alamat:
                  pickField(master || {}, 'Alamat', 'alamat') ||
                  pickField(reqRow, 'Alamat_DUDI', 'alamatDudi') ||
                  '-',
                bidang:
                  pickField(master || {}, 'Bidang_Keahlian', 'bidangKeahlian') ||
                  pickField(reqRow, 'Bidang_Pekerjaan', 'bidangPekerjaan') ||
                  '-',
                pic: pickField(master || {}, 'Nama_PIC', 'namaPic') || '-',
                kontak: pickField(master || {}, 'Kontak_PIC', 'kontakPic') || '-',
                kuota: Number(master?.Kuota_Maksimal ?? master?.kuotaMaksimal ?? 0),
              },
              studentNisSet: new Set<string>(),
            });
          }
          const nis = pickField(reqRow, 'NIS', 'nis') || pickField(reqRow, 'Nama_Siswa', 'namaSiswa');
          if (nis) grouped.get(key)!.studentNisSet.add(nis);
        }

        const result = Array.from(grouped.values()).map((entry) => ({
          ...entry.dudi,
          jumlahSiswa: entry.studentNisSet.size,
        }));

        return { success: true, total: result.length, data: result };
      }
    );
  },

  async getDudiStudents(
    dudiNama: string,
    dudiId: string,
    petugasNama: string
  ): Promise<{ success: boolean; total: number; data: any[] }> {
    return callPublicEndpoint(
      () =>
        safeFetchJson(
          `/api/public/dudi-students?dudiNama=${encodeURIComponent(
            dudiNama
          )}&dudiId=${encodeURIComponent(dudiId || '')}&petugasNama=${encodeURIComponent(petugasNama)}`
        ),
      async () => {
        const [plottingRows, pengajuanRows, siswaRows, monitoringRows, nilaiRows] = await Promise.all([
          readSheetDirect('Plotting_Pemberangkatan', true),
          readSheetDirect('Data_Pengajuan_PKL', true),
          readMasterSiswaDirect().catch(() => [] as any[]),
          readSheetDirect('Monitoring_5_Tahap', true),
          readSheetDirect('Nilai_Dan_Sertifikat', true),
        ]);

        const siswaByNis = new Map<string, any>();
        for (const s of siswaRows) {
          const nis = pickField(s, 'NIS', 'nis');
          const nisDigits = stripNisSymbols(nis);
          if (nisDigits) siswaByNis.set(nisDigits, s);
          if (nis) siswaByNis.set(nis, s);
        }

        const studentsMap = new Map<string, any>();
        const targetDudiNorm = normalizeStr(dudiNama);
        const targetPetugasNorm = normalizeStr(petugasNama);

        for (const p of plottingRows) {
          const statusPlt = normalizeStr(pickField(p, 'Status_Penempatan', 'statusPenempatan'));
          if (statusPlt === 'dibatalkan' || statusPlt === 'batal') continue;

          const rowDudiId = pickField(p, 'ID_DUDI', 'idDudi');
          const rowDudiNama = normalizeStr(pickField(p, 'Nama_DUDI', 'namaDudi'));
          const dudiMatches =
            (dudiId && rowDudiId && rowDudiId === dudiId) ||
            (targetDudiNorm &&
              rowDudiNama &&
              (rowDudiNama === targetDudiNorm || rowDudiNama.includes(targetDudiNorm)));

          if (!dudiMatches) continue;

          if (targetPetugasNorm) {
            const rowGuru = normalizeStr(pickField(p, 'Guru_Pendamping', 'guruPendamping'));
            if (rowGuru && !rowGuru.includes(targetPetugasNorm) && !targetPetugasNorm.includes(rowGuru)) {
              continue;
            }
          }

          const rawNis = pickField(p, 'NIS', 'nis');
          const cleanNis = stripNisSymbols(rawNis) || rawNis;
          const masterSiswa = (cleanNis ? siswaByNis.get(cleanNis) : undefined) || (rawNis ? siswaByNis.get(rawNis) : undefined);
          const nama =
            pickField(p, 'Nama_Siswa', 'namaSiswa') || pickField(masterSiswa || {}, 'Nama_Lengkap', 'nama');
          if (!cleanNis && !nama) continue;

          const key = cleanNis || normalizeStr(nama);
          studentsMap.set(key, {
            id: pickField(p, 'ID_Penempatan', 'idPenempatan', 'id') || key,
            idPenempatan: pickField(p, 'ID_Penempatan', 'idPenempatan', 'id') || '',
            nis: cleanNis || '-',
            nama: nama || 'Siswa Prakerin',
            kelas: pickField(masterSiswa || {}, 'Kelas', 'kelas') || '-',
            jurusan: pickField(masterSiswa || {}, 'ID_Jurusan', 'jurusan', 'Jurusan') || '-',
            dudi_name: dudiNama || pickField(p, 'Nama_DUDI', 'namaDudi'),
          });
        }

        for (const reqRow of pengajuanRows) {
          const statusHubin = normalizeStr(pickField(reqRow, 'Status_Hubin', 'statusHubin'));
          const statusKakomli = normalizeStr(pickField(reqRow, 'Status_Kakomli', 'statusKakomli'));
          if (statusHubin === 'batal' || statusKakomli === 'ditolak') continue;

          const rowDudiId = pickField(reqRow, 'ID_DUDI', 'idDudi');
          const rowDudiNama = normalizeStr(pickField(reqRow, 'DUDI_Tujuan', 'dudiTujuan'));
          const dudiMatches =
            (dudiId && rowDudiId && rowDudiId === dudiId) ||
            (targetDudiNorm &&
              rowDudiNama &&
              (rowDudiNama === targetDudiNorm || rowDudiNama.includes(targetDudiNorm)));
          if (!dudiMatches) continue;

          if (targetPetugasNorm) {
            const rowGuru = normalizeStr(pickField(reqRow, 'Guru_Pendamping', 'guruPendamping'));
            if (rowGuru && !rowGuru.includes(targetPetugasNorm) && !targetPetugasNorm.includes(rowGuru)) {
              continue;
            }
          }

          const rawNis = pickField(reqRow, 'NIS', 'nis');
          const cleanNis = stripNisSymbols(rawNis) || rawNis;
          const masterSiswa = (cleanNis ? siswaByNis.get(cleanNis) : undefined) || (rawNis ? siswaByNis.get(rawNis) : undefined);
          const nama =
            pickField(reqRow, 'Nama_Siswa', 'namaSiswa') || pickField(masterSiswa || {}, 'Nama_Lengkap', 'nama');
          if (!cleanNis && !nama) continue;

          const key = cleanNis || normalizeStr(nama);
          if (!studentsMap.has(key)) {
            studentsMap.set(key, {
              id: pickField(reqRow, 'No_Pengajuan', 'noPengajuan', 'id') || key,
              idPenempatan: pickField(reqRow, 'No_Pengajuan', 'noPengajuan', 'id') || '',
              nis: cleanNis || '-',
              nama: nama || 'Siswa Prakerin',
              kelas: pickField(reqRow, 'Kelas', 'kelas') || pickField(masterSiswa || {}, 'Kelas', 'kelas') || '-',
              jurusan:
                pickField(reqRow, 'Jurusan', 'jurusan') ||
                pickField(masterSiswa || {}, 'ID_Jurusan', 'jurusan') ||
                '-',
              dudi_name: dudiNama || pickField(reqRow, 'DUDI_Tujuan', 'dudiTujuan'),
            });
          }
        }

        const result = Array.from(studentsMap.values()).map((stu) => {
          const summary = buildStudentMonitoringSummary(stu, monitoringRows, nilaiRows);
          return {
            ...stu,
            ...summary,
          };
        });
        return { success: true, total: result.length, data: result };
      }
    );
  },

  async submitMonitoring(payload: any): Promise<{
    success: boolean;
    gradeSynced?: boolean;
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
        async () => {
          if (!payload?.nis || !payload?.nama_siswa || !payload?.tahap_monitoring) {
            throw new Error('NIS, Nama Siswa, dan Tahap Monitoring wajib diisi.');
          }

          const cleanNis = stripNisSymbols(payload.nis) || String(payload.nis).trim();
          const existingMonId = String(payload.existing_monitoring_id || '').trim();
          const isUpdate = Boolean(existingMonId);
          const idMonitoring =
            existingMonId || `MON-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
          const tglVal = normalizeToIsoDate(payload.tanggal) || getTodayWibIsoDate();

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

          const noteCombined = stripStructuredTagsFromNote(payload.catatan_perkembangan);
          const stageStr = String(payload.tahap_monitoring);
          const stageNum = extractStageNumber(stageStr);

          const sheetRow = {
            id: idMonitoring,
            ID_Monitoring: idMonitoring,
            idMonitoring,
            ID_Penempatan: String(payload.id_penempatan || `PLT-${cleanNis}`),
            idPenempatan: String(payload.id_penempatan || `PLT-${cleanNis}`),
            ID_DUDI: String(payload.dudi_id || ''),
            idDudi: String(payload.dudi_id || ''),
            DUDI_Tujuan: String(payload.nama_dudi || ''),
            dudiTujuan: String(payload.nama_dudi || ''),
            Alamat_DUDI: String(payload.alamat_dudi || ''),
            alamatDudi: String(payload.alamat_dudi || ''),
            NIS: cleanNis,
            nis: cleanNis,
            Nama_Siswa: String(payload.nama_siswa || ''),
            namaSiswa: String(payload.nama_siswa || ''),
            Daftar_Siswa: `${payload.nama_siswa} (${cleanNis})`,
            daftarSiswa: `${payload.nama_siswa} (${cleanNis})`,
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
            Foto_Bukti_Drive: '',
            fotoBuktiUrl: '',
            Nilai_DUDI_Terkumpul: nilaiMuncul && avgScore > 0 ? 'Ya' : 'Belum',
            nilaiDudiTerkumpul: nilaiMuncul && avgScore > 0,
            Blangko_Sertifikat_Bawa: stageNum >= 5 ? 'Ya' : 'Belum',
            blangkoSertifikatBawa: stageNum >= 5,
            Status_Tahap: 'Terlaksana',
            statusTahap: 'Terlaksana',
          };

          await writeSheetDirect('Monitoring_5_Tahap', isUpdate ? 'UPDATE' : 'CREATE', sheetRow);

          let gradeSynced = false;
          if (nilaiMuncul && avgScore > 0) {
            try {
              const nilaiRows = await readSheetDirect('Nilai_Dan_Sertifikat', true, true);
              const existingNilai = nilaiRows.find((n: any) => {
                const rowNis = pickField(n, 'NIS', 'nis');
                const rowNisDigits = stripNisSymbols(rowNis);
                const rowPlt = pickField(n, 'ID_Penempatan', 'idPenempatan');
                return (
                  (cleanNis && (rowNisDigits === cleanNis || rowNis === cleanNis)) ||
                  (payload.id_penempatan && rowPlt === String(payload.id_penempatan).trim())
                );
              });
              const roundedDudi = Math.round(avgScore * 10) / 10;
              const finalPredikat = getPredikatFromScore(roundedDudi);
              if (existingNilai) {
                await writeSheetDirect('Nilai_Dan_Sertifikat', 'UPDATE', {
                  ...existingNilai,
                  id: pickField(existingNilai, 'ID_Penempatan', 'idPenempatan', 'id'),
                  ID_Penempatan:
                    pickField(existingNilai, 'ID_Penempatan', 'idPenempatan') ||
                    String(payload.id_penempatan || `PLT-${cleanNis}`),
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
                  Nilai_rata_rata: roundedDudi,
                  Nilai_Rata_Rata: roundedDudi,
                  nilaiRataRata: roundedDudi,
                  Nilai_DUDI: roundedDudi,
                  nilaiDudi: roundedDudi,
                  Predikat: finalPredikat,
                  predikat: finalPredikat,
                  Status_Raport: 'Siap Cetak',
                  statusRaport: 'Siap Cetak',
                });
              } else {
                const idPlt = String(payload.id_penempatan || `PLT-${cleanNis}`);
                await writeSheetDirect('Nilai_Dan_Sertifikat', 'CREATE', {
                  id: idPlt,
                  ID_Penempatan: idPlt,
                  idPenempatan: idPlt,
                  NIS: cleanNis,
                  nis: cleanNis,
                  Nama_Siswa: String(payload.nama_siswa || ''),
                  namaSiswa: String(payload.nama_siswa || ''),
                  Jurusan: String(payload.jurusan || ''),
                  jurusan: String(payload.jurusan || ''),
                  Kelas: String(payload.kelas || '-'),
                  kelas: String(payload.kelas || '-'),
                  DUDI_Tujuan: String(payload.nama_dudi || ''),
                  dudiTujuan: String(payload.nama_dudi || ''),
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
                  Nilai_rata_rata: roundedDudi,
                  Nilai_Rata_Rata: roundedDudi,
                  nilaiRataRata: roundedDudi,
                  Nilai_DUDI: roundedDudi,
                  nilaiDudi: roundedDudi,
                  Predikat: finalPredikat,
                  predikat: finalPredikat,
                  No_Seri_Blangko: '',
                  noSeriBlangko: '',
                  Status_Blangko: 'Tersedia',
                  statusBlangko: 'Tersedia',
                  Status_Raport: 'Siap Cetak',
                  statusRaport: 'Siap Cetak',
                  Tgl_Terbit: tglVal,
                  tanggalTerbit: tglVal,
                });
              }
              gradeSynced = true;
            } catch {
              // Non-blocking fallback
            }
          }

          return {
            success: true,
            gradeSynced,
            message: `Data ${stageStr} berhasil ${isUpdate ? 'diperbarui' : 'disimpan'} ke Cloud Server.`,
            monitoring: sheetRow,
          };
        }
      );

      if (res?.success) {
        GoogleSheetClient.getInstance().invalidateClientSheetCache('Monitoring_5_Tahap');
        if (res.gradeSynced) {
          GoogleSheetClient.getInstance().invalidateClientSheetCache('Nilai_Dan_Sertifikat');
        }
        const nilaiSuffix = res.gradeSynced
          ? ` · Nilai DUDI (${res.monitoring?.Nilai_rata_rata ?? res.monitoring?.Nilai_Rata_Rata ?? payload.nilai_rata_rata}) tersinkron ke Rekap Nilai`
          : '';
        ToastManager.getInstance().update(
          toastId,
          res.gradeSynced ? 'Supervisi & Nilai Tersimpan!' : 'Data Supervisi Tersimpan di Cloud Server!',
          'success',
          `${payload.nama_siswa} · ${payload.tahap_monitoring} (S:${payload.sakit ?? 0} I:${payload.izin ?? 0} A:${payload.alpha ?? 0})${nilaiSuffix}`
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
        async () => {
          const nis = stripNisSymbols(payload.nis) || String(payload.nis || '').trim();
          const namaSiswa = String(payload.nama_siswa || '').trim();
          const idPenempatan = String(payload.id_penempatan || (nis ? `PLT-${nis}` : '')).trim();
          if (!nis || !namaSiswa) {
            throw new Error('NIS dan Nama Siswa wajib diisi untuk mengubah nilai.');
          }

          const k3lh = Math.min(100, Math.max(0, Number(payload.nilai_k3lh ?? 0) || 0));
          const softskill = Math.min(100, Math.max(0, Number(payload.nilai_softskill ?? 0) || 0));
          const teknis = Math.min(100, Math.max(0, Number(payload.nilai_kompetensi_teknis ?? 0) || 0));
          const alurBisnis = Math.min(100, Math.max(0, Number(payload.nilai_alur_bisnis ?? 0) || 0));
          const avgScore = calculateEqualWeightedAverage(k3lh, softskill, teknis, alurBisnis);
          const predikat = getPredikatFromScore(avgScore);
          const tglVal = normalizeToIsoDate(payload.tanggal) || getTodayWibIsoDate();

          const monRows = await readSheetDirect('Monitoring_5_Tahap', true, true);
          const targetMonId = String(payload.monitoring_id || '').trim();
          const matchedRows = monRows.filter((r: any) => {
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

          if (targetRow) {
            resolvedMonId = pickField(targetRow, 'ID_Monitoring', 'idMonitoring', 'id');
            resolvedStage = pickField(targetRow, 'Tahap', 'tahap') || resolvedStage;
            const cleanNote = stripStructuredTagsFromNote(
              targetRow.Catatan_Kunjungan ?? targetRow.catatanKunjungan ?? ''
            );

            await writeSheetDirect('Monitoring_5_Tahap', 'UPDATE', {
              ...targetRow,
              id: resolvedMonId,
              ID_Monitoring: resolvedMonId,
              idMonitoring: resolvedMonId,
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
              Nilai_rata_rata: avgScore,
              Nilai_Rata_Rata: avgScore,
              nilaiRataRata: avgScore,
              Nilai_DUDI_Terkumpul: 'Ya',
              nilaiDudiTerkumpul: true,
              Catatan_Kunjungan: cleanNote,
              catatanKunjungan: cleanNote,
            });
          } else {
            resolvedMonId = `MON-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
            const stageNum = extractStageNumber(resolvedStage) || 5;
            await writeSheetDirect('Monitoring_5_Tahap', 'CREATE', {
              id: resolvedMonId,
              ID_Monitoring: resolvedMonId,
              idMonitoring: resolvedMonId,
              ID_Penempatan: idPenempatan,
              ID_DUDI: String(payload.dudi_id || ''),
              DUDI_Tujuan: String(payload.nama_dudi || ''),
              Alamat_DUDI: String(payload.alamat_dudi || ''),
              NIS: nis,
              Nama_Siswa: namaSiswa,
              Daftar_Siswa: `${namaSiswa} (${nis})`,
              Jurusan: String(payload.jurusan || ''),
              ID_Guru_Pendamping: String(payload.guru_id || ''),
              Guru_Pendamping: String(payload.guru_pembimbing || ''),
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
              Nilai_rata_rata: avgScore,
              Nilai_Rata_Rata: avgScore,
              Catatan_Kunjungan: '',
              Nilai_DUDI_Terkumpul: 'Ya',
              Blangko_Sertifikat_Bawa: stageNum >= 5 ? 'Ya' : 'Belum',
              Status_Tahap: 'Terlaksana',
            });
          }

          let nilaiSynced = false;
          try {
            const nilaiRows = await readSheetDirect('Nilai_Dan_Sertifikat', true, true);
            const existingNilai = nilaiRows.find((n: any) => {
              const rowNis = pickField(n, 'NIS', 'nis');
              const rowNisDigits = stripNisSymbols(rowNis);
              const rowPlt = pickField(n, 'ID_Penempatan', 'idPenempatan');
              return (nis && (rowNisDigits === nis || rowNis === nis)) || (idPenempatan && rowPlt === idPenempatan);
            });
            const roundedDudi = Math.round(avgScore * 10) / 10;
            const finalPredikat = getPredikatFromScore(roundedDudi);
            if (existingNilai) {
              const existingId = pickField(existingNilai, 'ID_Penempatan', 'idPenempatan', 'id') || idPenempatan;

              await writeSheetDirect('Nilai_Dan_Sertifikat', 'UPDATE', {
                ...existingNilai,
                id: existingId,
                ID_Penempatan: existingId,
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
                Nilai_rata_rata: roundedDudi,
                Nilai_Rata_Rata: roundedDudi,
                nilaiRataRata: roundedDudi,
                Nilai_DUDI: roundedDudi,
                nilaiDudi: roundedDudi,
                Predikat: finalPredikat,
                predikat: finalPredikat,
                Status_Raport: 'Siap Cetak',
                statusRaport: 'Siap Cetak',
              });
            } else {
              await writeSheetDirect('Nilai_Dan_Sertifikat', 'CREATE', {
                id: idPenempatan,
                ID_Penempatan: idPenempatan,
                idPenempatan,
                NIS: nis,
                nis,
                Nama_Siswa: namaSiswa,
                namaSiswa,
                Jurusan: String(payload.jurusan || ''),
                jurusan: String(payload.jurusan || ''),
                Kelas: String(payload.kelas || '-'),
                kelas: String(payload.kelas || '-'),
                DUDI_Tujuan: String(payload.nama_dudi || ''),
                dudiTujuan: String(payload.nama_dudi || ''),
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
                Nilai_rata_rata: roundedDudi,
                Nilai_Rata_Rata: roundedDudi,
                nilaiRataRata: roundedDudi,
                Nilai_DUDI: roundedDudi,
                nilaiDudi: roundedDudi,
                Predikat: finalPredikat,
                predikat: finalPredikat,
                No_Seri_Blangko: '',
                noSeriBlangko: '',
                Status_Blangko: 'Tersedia',
                statusBlangko: 'Tersedia',
                Status_Raport: 'Siap Cetak',
                statusRaport: 'Siap Cetak',
                Tgl_Terbit: tglVal,
                tanggalTerbit: tglVal,
              });
            }
            nilaiSynced = true;
          } catch {
            // Non-blocking fallback
          }

          return {
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
          };
        }
      );

      if (res?.success) {
        GoogleSheetClient.getInstance().invalidateClientSheetCache('Monitoring_5_Tahap');
        if (res.nilaiSynced) {
          GoogleSheetClient.getInstance().invalidateClientSheetCache('Nilai_Dan_Sertifikat');
        }
        ToastManager.getInstance().update(
          toastId,
          'Perubahan Nilai Tersimpan di Cloud Server!',
          'success',
          `${payload.nama_siswa}: Rata-rata ${res.gradeSummary?.rataRata ?? ''} (${res.gradeSummary?.predikat ?? ''})`
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
};
