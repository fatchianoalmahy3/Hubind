import { GoogleSheetClient } from './GoogleSheetClient';
import {
  safeFetchJson,
  HtmlResponseError,
  normalizeGasUrl,
  validateGasDeployUrl,
  formatGasNetworkError,
  isNetworkFetchError,
} from './utils/safeFetchJson';

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

async function fetchGasGet(sheetName: string, cfg: Awaited<ReturnType<typeof ensureHydratedConfig>>): Promise<any[]> {
  if (!cfg.spreadsheetId) {
    throw new Error('ID Google Spreadsheet belum dikonfigurasi oleh Admin Hubin di Firebase.');
  }
  const validation = validateGasDeployUrl(cfg.gasDeployUrl);
  if (!validation.valid) {
    throw new Error(
      validation.error ||
        'URL Google Apps Script Web App (/exec) belum diatur oleh Admin Hubin di Pengaturan Spreadsheet.'
    );
  }
  const gasUrl = validation.normalizedUrl;

  const sep = gasUrl.includes('?') ? '&' : '?';
  const targetUrl = `${gasUrl}${sep}sheet=${encodeURIComponent(sheetName)}&year=${encodeURIComponent(
    cfg.activeYear
  )}&spreadsheetId=${encodeURIComponent(cfg.spreadsheetId)}`;

  try {
    const { ok, status, data: json } = await safeFetchJson(targetUrl, {
      method: 'GET',
      redirect: 'follow',
    });
    if (!ok || json?.error) {
      throw new Error(json?.error || `Gagal membaca sheet [${sheetName}] dari Google Apps Script (HTTP ${status}).`);
    }
    return Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
  } catch (err: any) {
    if (err instanceof HtmlResponseError && err.isGoogleAuth) {
      throw new Error(
        'Akses Google Apps Script Web App masih dibatasi (mengembalikan halaman login Google). Admin: buka Apps Script -> Deploy -> Kelola deployment -> Edit -> setel "Yang memiliki akses" ke "Siapa saja (Anyone)".'
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
    throw new Error('ID Google Spreadsheet belum dikonfigurasi oleh Admin Hubin di Firebase.');
  }
  const validation = validateGasDeployUrl(cfg.gasDeployUrl);
  if (!validation.valid) {
    throw new Error(
      validation.error ||
        'URL Google Apps Script Web App (/exec) belum diatur oleh Admin Hubin untuk portal publik.'
    );
  }
  const gasUrl = validation.normalizedUrl;

  try {
    // Use text/plain;charset=utf-8 to avoid browser CORS OPTIONS preflight against script.google.com
    const { ok, status, data: json } = await safeFetchJson(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow',
      body: JSON.stringify({
        action,
        sheetName,
        year: cfg.activeYear,
        spreadsheetId: cfg.spreadsheetId,
        data: payload,
        timestamp: new Date().toISOString(),
      }),
    });
    if (!ok || json?.error) {
      throw new Error(json?.error || `Gagal menulis ke Google Spreadsheet [${sheetName}] (HTTP ${status}).`);
    }
  } catch (err: any) {
    if (err instanceof HtmlResponseError && err.isGoogleAuth) {
      throw new Error(
        'Akses Google Apps Script Web App masih dibatasi (mengembalikan halaman login Google). Admin: setel akses Web App deployment ke "Siapa saja (Anyone)".'
      );
    }
    if (isNetworkFetchError(err)) {
      throw new Error(formatGasNetworkError(err, gasUrl));
    }
    throw err;
  }
}

async function readSheetDirect(sheetName: string, optional = false): Promise<any[]> {
  const cfg = await ensureHydratedConfig();
  try {
    return await fetchGasGet(sheetName, cfg);
  } catch (e) {
    if (optional) return [];
    throw e;
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
    const isInfraFailure = INFRA_ERROR_CODES.has(errCode) || status >= 500;
    if (!isInfraFailure) {
      throw new Error(data?.message || `Permintaan ditolak (HTTP ${status}).`);
    }

    return await directClientCall();
  } catch (err: any) {
    if (
      err instanceof HtmlResponseError ||
      err instanceof TypeError ||
      String(err?.message || '').includes('Failed to fetch')
    ) {
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

  async getDudiList(): Promise<{ success: boolean; total: number; data: any[] }> {
    return callPublicEndpoint(
      () => safeFetchJson('/api/public/dudi-list'),
      async () => {
        const rows = await readSheetDirect('Master_DUDI');
        const mapped = rows
          .filter((d: any) => pickField(d, 'Nama_DUDI', 'namaDudi', 'nama_dudi', 'nama') !== '')
          .map((d: any, idx: number) => ({
            id: pickField(d, 'ID', 'id') || `dudi_${idx + 1}`,
            nama_dudi: pickField(d, 'Nama_DUDI', 'namaDudi', 'nama_dudi', 'nama'),
            bidang_usaha: pickField(d, 'Bidang_Keahlian', 'bidangKeahlian', 'bidang_usaha') || '-',
            alamat: pickField(d, 'Alamat', 'alamat'),
            kota: pickField(d, 'Wilayah_Kota', 'wilayahKota', 'kota'),
            kuota_maksimal: Number(d.Kuota_Maksimal ?? d.kuotaMaksimal ?? 0),
            terisi: Number(d.Terisi ?? d.terisi ?? 0),
            status: pickField(d, 'Status_Kerjasama', 'statusKerjasama', 'status') || 'Aktif',
            pimpinan: pickField(d, 'Nama_PIC', 'namaPic', 'pimpinan'),
            telepon: pickField(d, 'Kontak_PIC', 'kontakPic', 'telepon'),
          }));
        return { success: true, total: mapped.length, data: mapped };
      }
    );
  },

  async lookupStudentByNis(nis: string): Promise<{
    success: boolean;
    found: boolean;
    message?: string;
    student?: any;
  }> {
    const searchNis = nis.trim();
    return callPublicEndpoint(
      () => safeFetchJson(`/api/public/student-lookup/${encodeURIComponent(searchNis)}`),
      async () => {
        const rows = await readMasterSiswaDirect();
        const student = rows.find((s: any) => {
          const rowNis = pickField(s, 'NIS', 'nis');
          const rowNik = pickField(s, 'NIK', 'nik');
          return rowNis === searchNis || rowNik === searchNis;
        });

        if (!student) {
          return {
            success: true,
            found: false,
            message: `Siswa dengan NIS [${searchNis}] tidak ditemukan di sheet Master Siswa.`,
          };
        }

        return {
          success: true,
          found: true,
          student: {
            id: pickField(student, 'ID', 'id', 'NIS', 'nis'),
            nama: pickField(student, 'Nama_Lengkap', 'nama', 'namaLengkap'),
            nis: pickField(student, 'NIS', 'nis'),
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
    return callPublicEndpoint(
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
        const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);

        const sheetRow = {
          id: noPengajuan,
          No_Pengajuan: noPengajuan,
          noPengajuan,
          Timestamp: timestamp,
          timestamp,
          NIS: String(payload.nis).trim(),
          nis: String(payload.nis).trim(),
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
          Catatan_Kakomli: payload.catatan
            ? String(payload.catatan)
            : payload.is_dudi_unregistered
            ? 'Pengajuan DUDI baru (perlu verifikasi kelayakan Hubin).'
            : 'Menunggu review relevansi kompetensi oleh Kakomli.',
          catatanKakomli: String(payload.catatan || ''),
          Status_Hubin: 'Menunggu ACC Kakomli',
          statusHubin: 'Menunggu ACC Kakomli',
          Guru_Pendamping: '',
          guruPendamping: '',
          Tgl_Berangkat: String(payload.tanggal_mulai || ''),
          tanggalBerangkat: String(payload.tanggal_mulai || ''),
          status: 'Menunggu Validasi Kakomli',
        };

        await writeSheetDirect('Data_Pengajuan_PKL', 'CREATE', sheetRow);
        return {
          success: true,
          message: 'Pengajuan PKL berhasil disimpan langsung ke Google Spreadsheet.',
          application: sheetRow,
        };
      }
    );
  },

  async getPetugasList(): Promise<{ success: boolean; total: number; data: any[] }> {
    return callPublicEndpoint(
      () => safeFetchJson('/api/public/petugas-list'),
      async () => {
        const rows = await readSheetDirect('Master_Guru_Pendamping');
        const mapped = rows
          .filter((g: any) => pickField(g, 'Nama_Lengkap', 'nama', 'Nama') !== '')
          .map((g: any, idx: number) => ({
            id: pickField(g, 'ID', 'id') || `guru_${idx + 1}`,
            nama: pickField(g, 'Nama_Lengkap', 'nama', 'Nama'),
            nip: pickField(g, 'NIP', 'nip') || '-',
            peran: pickField(g, 'Peran_Utama', 'peranUtama', 'peran') || 'Guru Pendamping',
            email: pickField(g, 'Email_Google', 'email', 'emailGoogle'),
          }));
        return { success: true, total: mapped.length, data: mapped };
      }
    );
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
          throw new Error('Data petugas tidak ditemukan di sheet Master_Guru_Pendamping.');
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
            'Petugas belum memiliki kolom PIN, NIP, atau No. WA yang valid di Master_Guru_Pendamping untuk verifikasi.'
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
        const [plottingRows, pengajuanRows, siswaRows] = await Promise.all([
          readSheetDirect('Plotting_Pemberangkatan', true),
          readSheetDirect('Data_Pengajuan_PKL', true),
          readMasterSiswaDirect().catch(() => [] as any[]),
        ]);

        const siswaByNis = new Map<string, any>();
        for (const s of siswaRows) {
          const nis = pickField(s, 'NIS', 'nis');
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

          const nis = pickField(p, 'NIS', 'nis');
          const masterSiswa = nis ? siswaByNis.get(nis) : undefined;
          const nama =
            pickField(p, 'Nama_Siswa', 'namaSiswa') || pickField(masterSiswa || {}, 'Nama_Lengkap', 'nama');
          if (!nis && !nama) continue;

          const key = nis || normalizeStr(nama);
          studentsMap.set(key, {
            id: pickField(p, 'ID_Penempatan', 'idPenempatan', 'id') || key,
            idPenempatan: pickField(p, 'ID_Penempatan', 'idPenempatan', 'id') || '',
            nis: nis || '-',
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

          const nis = pickField(reqRow, 'NIS', 'nis');
          const masterSiswa = nis ? siswaByNis.get(nis) : undefined;
          const nama =
            pickField(reqRow, 'Nama_Siswa', 'namaSiswa') || pickField(masterSiswa || {}, 'Nama_Lengkap', 'nama');
          if (!nis && !nama) continue;

          const key = nis || normalizeStr(nama);
          if (!studentsMap.has(key)) {
            studentsMap.set(key, {
              id: pickField(reqRow, 'No_Pengajuan', 'noPengajuan', 'id') || key,
              idPenempatan: pickField(reqRow, 'No_Pengajuan', 'noPengajuan', 'id') || '',
              nis: nis || '-',
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

        const result = Array.from(studentsMap.values());
        return { success: true, total: result.length, data: result };
      }
    );
  },

  async submitMonitoring(payload: any): Promise<{
    success: boolean;
    message: string;
    monitoring: any;
  }> {
    return callPublicEndpoint(
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

        const idMonitoring = `MON-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const tglVal = payload.tanggal || new Date().toISOString().split('T')[0];
        const avgScore = Number(payload.nilai_rata_rata) || 0;

        const noteCombined = [
          payload.catatan_perkembangan || '',
          avgScore > 0
            ? `[Skor: Teknis=${payload.nilai_teknis ?? '-'}, Disiplin=${payload.nilai_disiplin ?? '-'}, Inisiatif=${payload.nilai_inisiatif ?? '-'}, K3=${payload.nilai_k3 ?? '-'} | Akhir=${avgScore} (${payload.predikat || ''})]`
            : '',
        ]
          .filter(Boolean)
          .join(' ');

        const sheetRow = {
          id: idMonitoring,
          ID_Monitoring: idMonitoring,
          idMonitoring,
          ID_Penempatan: String(payload.id_penempatan || `PLT-${payload.nis}`),
          idPenempatan: String(payload.id_penempatan || `PLT-${payload.nis}`),
          ID_DUDI: String(payload.dudi_id || ''),
          idDudi: String(payload.dudi_id || ''),
          DUDI_Tujuan: String(payload.nama_dudi || ''),
          dudiTujuan: String(payload.nama_dudi || ''),
          Alamat_DUDI: String(payload.alamat_dudi || ''),
          alamatDudi: String(payload.alamat_dudi || ''),
          NIS: String(payload.nis || ''),
          nis: String(payload.nis || ''),
          Nama_Siswa: String(payload.nama_siswa || ''),
          namaSiswa: String(payload.nama_siswa || ''),
          Daftar_Siswa: `${payload.nama_siswa} (${payload.nis})`,
          daftarSiswa: `${payload.nama_siswa} (${payload.nis})`,
          Jurusan: String(payload.jurusan || ''),
          jurusan: String(payload.jurusan || ''),
          ID_Guru_Pendamping: String(payload.guru_id || ''),
          idGuruPendamping: String(payload.guru_id || ''),
          Guru_Pendamping: String(payload.guru_pembimbing || ''),
          guruPendamping: String(payload.guru_pembimbing || ''),
          Tahap: String(payload.tahap_monitoring),
          tahap: String(payload.tahap_monitoring),
          Tanggal_Kunjungan: tglVal,
          tanggalKunjungan: tglVal,
          Catatan_Kunjungan: noteCombined,
          catatanKunjungan: noteCombined,
          Foto_Bukti_Drive: '',
          fotoBuktiUrl: '',
          Nilai_DUDI_Terkumpul: avgScore > 0 ? 'Ya' : 'Belum',
          nilaiDudiTerkumpul: avgScore > 0,
          Blangko_Sertifikat_Bawa: String(payload.tahap_monitoring).includes('4') ? 'Ya' : 'Belum',
          blangkoSertifikatBawa: String(payload.tahap_monitoring).includes('4'),
          Status_Tahap: 'Terlaksana',
          statusTahap: 'Terlaksana',
        };

        await writeSheetDirect('Monitoring_5_Tahap', 'CREATE', sheetRow);
        return {
          success: true,
          message: `Data ${payload.tahap_monitoring} berhasil disimpan ke Google Spreadsheet.`,
          monitoring: sheetRow,
        };
      }
    );
  },
};
