// @ts-nocheck

// server.ts
import express from "express";
import path2 from "path";

// server/config/runtimeConfig.ts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// src/core/types/schema.ts
var MONITORING_STAGES = [
  { num: 1, value: "1. Pengantaran", shortLabel: "Pengantaran", label: "1. Pengantaran" },
  { num: 2, value: "2. Monitoring 1", shortLabel: "Mon 1", label: "2. Monitoring 1" },
  { num: 3, value: "3. Monitoring 2", shortLabel: "Mon 2", label: "3. Monitoring 2" },
  { num: 4, value: "4. Monitoring 3", shortLabel: "Mon 3", label: "4. Monitoring 3" },
  { num: 5, value: "5. Monitoring 4", shortLabel: "Mon 4 \xB7 Nilai", label: "5. Monitoring 4" },
  { num: 6, value: "6. Monitoring 5", shortLabel: "Mon 5", label: "6. Monitoring 5" },
  { num: 7, value: "7. Monitoring 6", shortLabel: "Mon 6", label: "7. Monitoring 6" },
  { num: 8, value: "8. Penarikan", shortLabel: "Penarikan", label: "8. Penarikan" }
];
var DEFAULT_MONITORING_STAGE_CONTROL = {
  requireSequential: true,
  unlockedStages: [1, 2, 3, 4, 5, 6, 7, 8],
  lockedReason: "",
  requireIssuedLetter: true
};

// server/utils/httpHelpers.ts
import crypto from "crypto";

// src/core/constants/sheetResourceMap.ts
var REST_RESOURCE_TO_SHEET = {
  students: "Master_Siswa_XI",
  majors: "Master_Jurusan",
  classes: "Master_Kelas_Walas",
  dudi: "Master_DUDI",
  teachers: "Master_Guru_Pendamping",
  submissions: "Data_Pengajuan_PKL",
  permits: "Data_Perizinan_PKL",
  placements: "Plotting_Pemberangkatan",
  monitoring: "Monitoring_5_Tahap",
  certificates: "Nilai_Dan_Sertifikat",
  accounts: "Master_Akun",
  "issued-letters": "Log_Penerbitan_Surat"
};
var SHEET_TO_REST_RESOURCE = {
  Master_Siswa_XI: "students",
  Master_Siswa: "students",
  Master_Jurusan: "majors",
  Master_Kelas_Walas: "classes",
  Master_DUDI: "dudi",
  Master_Guru_Pendamping: "teachers",
  Data_Pengajuan_PKL: "submissions",
  Data_Perizinan_PKL: "permits",
  Plotting_Pemberangkatan: "placements",
  Monitoring_5_Tahap: "monitoring",
  Monitoring_6_Tahap: "monitoring",
  Monitoring_8_Tahap: "monitoring",
  Monitoring_PKL: "monitoring",
  Nilai_Dan_Sertifikat: "certificates",
  Master_Akun: "accounts",
  Log_Penerbitan_Surat: "issued-letters"
};
var CORE_ADMIN_BOOTSTRAP_TABLES = [
  "Master_Jurusan",
  "Master_Kelas_Walas",
  "Master_DUDI",
  "Master_Guru_Pendamping",
  "Master_Siswa_XI",
  "Data_Pengajuan_PKL",
  "Plotting_Pemberangkatan",
  "Log_Penerbitan_Surat"
];
var HEAVY_ADMIN_BOOTSTRAP_TABLES = [
  "Data_Perizinan_PKL",
  "Monitoring_5_Tahap",
  "Nilai_Dan_Sertifikat"
];
var DEFAULT_ADMIN_BOOTSTRAP_TABLES = [
  ...CORE_ADMIN_BOOTSTRAP_TABLES,
  ...HEAVY_ADMIN_BOOTSTRAP_TABLES.filter((t) => t !== "Log_Penerbitan_Surat")
];
var ALLOWED_ADMIN_SHEETS = new Set(Object.keys(SHEET_TO_REST_RESOURCE));

// server/types.ts
var PortalConfigError = class extends Error {
  constructor(code, message, status = 503) {
    super(message);
    this.code = code;
    this.status = status;
  }
};

// server/utils/httpHelpers.ts
var GAS_FETCH_TIMEOUT_MS = 15e3;
async function fetchWithTimeout(url, init = {}, timeoutMs = GAS_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new PortalConfigError(
        "GAS_TIMEOUT",
        `Permintaan ke Cloud Server melebihi batas waktu (${Math.round(timeoutMs / 1e3)} detik). Silakan coba lagi.`,
        504
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
function handlePortalError(res, err) {
  if (err instanceof PortalConfigError) {
    return res.status(err.status).json({
      success: false,
      code: err.code,
      message: err.message
    });
  }
  return res.status(500).json({
    success: false,
    code: "INTERNAL_ERROR",
    message: err?.message || "Terjadi kesalahan pada server saat mengakses Database Cloud Server."
  });
}
function resolveRestTableName(resourceParam) {
  const raw = String(resourceParam || "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (REST_RESOURCE_TO_SHEET[lower]) {
    return REST_RESOURCE_TO_SHEET[lower];
  }
  if (ALLOWED_ADMIN_SHEETS.has(raw)) {
    return raw;
  }
  return null;
}
function computeWeakEtag(payload) {
  const hash = crypto.createHash("sha1").update(typeof payload === "string" ? payload : JSON.stringify(payload)).digest("base64url");
  return `W/"${hash}"`;
}
function isEtagMatched(req, etag) {
  const rawIfNoneMatch = String(req.headers["if-none-match"] || "").trim();
  if (!rawIfNoneMatch) return false;
  if (rawIfNoneMatch === "*") return true;
  return rawIfNoneMatch.split(",").map((tag) => tag.trim()).some((tag) => tag === etag || tag.replace(/^W\//, "") === etag.replace(/^W\//, ""));
}
function matchRowById(row, targetId) {
  const candidates = [
    row?.id,
    row?.ID,
    row?.NIS,
    row?.nis,
    row?.Kode,
    row?.kode,
    row?.ID_DUDI,
    row?.idDudi,
    row?.ID_Guru,
    row?.idGuru,
    row?.No_Pengajuan,
    row?.noPengajuan,
    row?.No_Perizinan,
    row?.noPerizinan,
    row?.ID_Penempatan,
    row?.idPenempatan,
    row?.ID_Monitoring,
    row?.idMonitoring
  ];
  return candidates.some((val) => val !== void 0 && val !== null && String(val).trim() === targetId);
}

// server/config/runtimeConfig.ts
var __dirnameResolved = typeof __dirname !== "undefined" ? __dirname : import.meta?.url ? path.dirname(fileURLToPath(import.meta.url)) : process.cwd();
var isServerlessRuntime = Boolean(
  process.env.VERCEL || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NOW_REGION
);
var BOOTSTRAP_ADMIN_EMAIL = "fatchiano1@gmail.com";
var CONFIG_CACHE_TTL_MS = 6e4;
function loadFirebaseConfig() {
  const candidates = [
    path.join(__dirnameResolved, "firebase-applet-config.json"),
    path.join(process.cwd(), "firebase-applet-config.json"),
    path.resolve(__dirnameResolved, "../firebase-applet-config.json"),
    path.resolve(__dirnameResolved, "../../firebase-applet-config.json")
  ];
  for (const cfgPath of candidates) {
    try {
      if (fs.existsSync(cfgPath)) {
        const raw = fs.readFileSync(cfgPath, "utf-8");
        const parsed = JSON.parse(raw);
        return {
          projectId: String(parsed.projectId || ""),
          firestoreDatabaseId: String(parsed.firestoreDatabaseId || "(default)"),
          apiKey: String(parsed.apiKey || "")
        };
      }
    } catch {
    }
  }
  return {
    projectId: String(process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || ""),
    firestoreDatabaseId: String(process.env.FIREBASE_DATABASE_ID || "(default)"),
    apiKey: String(process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || "")
  };
}
var firebaseCfg = loadFirebaseConfig();
function normalizeServerGasUrl(rawUrl) {
  const trimmed = String(rawUrl || "").trim().replace(/^["'`]+|["'`]+$/g, "").replace(/\s+/g, "");
  if (!trimmed) return "";
  let url = trimmed;
  if (/^(script\.google\.com|docs\.google\.com|[a-z0-9-]+\.[a-z]{2,}\/)/i.test(url)) {
    url = `https://${url.replace(/^\/+/, "")}`;
  }
  url = url.replace(/^(https:\/\/script\.google\.com)\/macros\/u\/\d+\/s\//i, "$1/macros/s/");
  return url;
}
function normalizeServerMonitoringStageControl(raw) {
  if (!raw || typeof raw !== "object") {
    return {
      requireSequential: DEFAULT_MONITORING_STAGE_CONTROL.requireSequential,
      unlockedStages: [...DEFAULT_MONITORING_STAGE_CONTROL.unlockedStages],
      lockedReason: "",
      requireIssuedLetter: DEFAULT_MONITORING_STAGE_CONTROL.requireIssuedLetter ?? true
    };
  }
  const requireSequential = typeof raw.requireSequential === "boolean" ? raw.requireSequential : true;
  const requireIssuedLetter = typeof raw.requireIssuedLetter === "boolean" ? raw.requireIssuedLetter : true;
  const rawList = Array.isArray(raw.unlockedStages) ? raw.unlockedStages : DEFAULT_MONITORING_STAGE_CONTROL.unlockedStages;
  const deduped = Array.from(
    new Set(
      rawList.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 1 && n <= 8)
    )
  ).sort((a, b) => a - b);
  return {
    requireSequential,
    unlockedStages: deduped.slice(0, 8),
    lockedReason: String(raw.lockedReason ?? "").trim().slice(0, 150),
    requireIssuedLetter
  };
}
function decodeFirestoreValue(val) {
  if (!val || typeof val !== "object") return null;
  if ("stringValue" in val) return val.stringValue;
  if ("booleanValue" in val) return Boolean(val.booleanValue);
  if ("integerValue" in val) return Number(val.integerValue);
  if ("doubleValue" in val) return Number(val.doubleValue);
  if ("timestampValue" in val) return val.timestampValue;
  if ("nullValue" in val) return null;
  if ("arrayValue" in val) {
    const arr = val.arrayValue?.values || [];
    return arr.map((item) => decodeFirestoreValue(item));
  }
  if ("mapValue" in val) {
    const fields = val.mapValue?.fields || {};
    const obj = {};
    for (const [k, v] of Object.entries(fields)) {
      obj[k] = decodeFirestoreValue(v);
    }
    return obj;
  }
  return null;
}
var cachedWorkspaceConfig = null;
var inFlightConfigFetch = null;
function invalidateWorkspaceConfigCache() {
  cachedWorkspaceConfig = null;
}
async function getFirestoreWorkspaceConfig(forceRefresh = false) {
  if (!forceRefresh && cachedWorkspaceConfig && Date.now() - cachedWorkspaceConfig.fetchedAt < CONFIG_CACHE_TTL_MS) {
    return cachedWorkspaceConfig.config;
  }
  if (!forceRefresh && inFlightConfigFetch) {
    return inFlightConfigFetch;
  }
  const loadPromise = (async () => {
    const emptyConfig = {
      activeYear: "2026/2027",
      spreadsheetId: "",
      spreadsheetName: "",
      spreadsheetUrl: "",
      driveFolderUrl: "",
      gasDeployUrl: "",
      academicYears: [],
      templates: [],
      monitoringStageControl: normalizeServerMonitoringStageControl(void 0)
    };
    if (!firebaseCfg.projectId) {
      return emptyConfig;
    }
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      firebaseCfg.projectId
    )}/databases/${encodeURIComponent(firebaseCfg.firestoreDatabaseId)}/documents/config/workspace`;
    const res = await fetchWithTimeout(url, { headers: { Accept: "application/json" } }, 1e4);
    if (res.status === 404) {
      cachedWorkspaceConfig = { config: emptyConfig, fetchedAt: Date.now() };
      return emptyConfig;
    }
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gagal membaca konfigurasi Firestore (${res.status}): ${errText.slice(0, 160)}`);
    }
    const docJson = await res.json();
    const fields = docJson?.fields || {};
    const decoded = {};
    for (const [k, v] of Object.entries(fields)) {
      decoded[k] = decodeFirestoreValue(v);
    }
    const academicYears = Array.isArray(decoded.academicYears) ? decoded.academicYears : [];
    const activeYear = String(decoded.activeYear || "2026/2027");
    const activeEntry = academicYears.find((ay) => ay?.year === activeYear) || academicYears[0];
    const config = {
      activeYear,
      spreadsheetId: String(decoded.spreadsheetId || activeEntry?.spreadsheetId || ""),
      spreadsheetName: String(decoded.spreadsheetName || activeEntry?.spreadsheetName || ""),
      spreadsheetUrl: String(decoded.spreadsheetUrl || activeEntry?.spreadsheetUrl || ""),
      driveFolderUrl: String(decoded.driveFolderUrl || ""),
      gasDeployUrl: normalizeServerGasUrl(String(decoded.gasDeployUrl || "")),
      academicYears,
      templates: Array.isArray(decoded.templates) ? decoded.templates : [],
      monitoringStageControl: normalizeServerMonitoringStageControl(decoded.monitoringStageControl)
    };
    cachedWorkspaceConfig = { config, fetchedAt: Date.now() };
    return config;
  })();
  if (!forceRefresh) {
    inFlightConfigFetch = loadPromise;
  }
  try {
    return await loadPromise;
  } finally {
    if (inFlightConfigFetch === loadPromise) {
      inFlightConfigFetch = null;
    }
  }
}

// src/core/types/sheetBlueprint.ts
var HUBIN_SHEETS_BLUEPRINT = [
  {
    sheetName: "Master_Siswa_XI",
    displayName: "1. Master Siswa",
    description: "Data induk resmi siswa peserta PKL Pokja Hubin (dilengkapi domisili & kontak orang tua/wali).",
    category: "master",
    icon: "Users",
    color: "emerald",
    headers: [
      "ID",
      "NIS",
      "NIK",
      "Nama_Lengkap",
      "Jenis_Kelamin",
      "ID_Jurusan",
      "Kelas",
      "No_HP_Siswa",
      "Alamat_Domisili",
      "Nama_Ortu_Wali",
      "No_Ortu_Wali",
      "Status_PKL",
      "Foto_URL"
    ],
    sampleData: []
  },
  {
    sheetName: "Master_Jurusan",
    displayName: "2. Master 9 Jurusan",
    description: "Daftar 9 Program Keahlian resmi SMK PGRI 2 Ponorogo dan data Ketua Kompetensi Keahlian (Kakomli).",
    category: "master",
    icon: "BookOpen",
    color: "blue",
    headers: [
      "ID",
      "Kode",
      "Nama_Jurusan",
      "Nama_Kakomli",
      "NIP_Kakomli",
      "Kontak_WA",
      "Kuota_Siswa",
      "Total_Terdaftar"
    ],
    sampleData: []
  },
  {
    sheetName: "Master_Kelas_Walas",
    displayName: "3. Master Kelas & Walas",
    description: "Daftar rombongan belajar dan penanggung jawab guru Wali Kelas.",
    category: "master",
    icon: "Layers",
    color: "indigo",
    headers: [
      "ID",
      "Nama_Kelas",
      "ID_Jurusan",
      "Jurusan",
      "Tingkat",
      "Wali_Kelas",
      "Kontak_Walas",
      "Jumlah_Siswa"
    ],
    sampleData: []
  },
  {
    sheetName: "Master_DUDI",
    displayName: "4. Master Mitra DUDI",
    description: "Data Dunia Usaha & Industri rekanan, kapasitas kuota penempatan, pemimpin/PIC bengkel, dan status MoU.",
    category: "master",
    icon: "Building2",
    color: "amber",
    headers: [
      "ID",
      "Nama_DUDI",
      "Bidang_Keahlian",
      "Alamat",
      "Wilayah_Kota",
      "Nama_Pemimpin",
      "Nama_PIC",
      "Kontak_PIC",
      "No_Telp_DUDI",
      "Link_Maps",
      "ID_Guru_Pendamping",
      "Guru_Pendamping",
      "Hari_Kerja",
      "Jam_Kerja",
      "Kuota_Maksimal",
      "Terisi",
      "Status_Kerjasama"
    ],
    sampleData: []
  },
  {
    sheetName: "Master_Guru_Pendamping",
    displayName: "5. Master Guru Pendamping",
    description: "Daftar guru pendamping/pembimbing prakerin yang bertugas supervisi lapangan beserta PIN portal.",
    category: "master",
    icon: "UserCheck",
    color: "cyan",
    headers: [
      "ID",
      "NIP",
      "Nama_Lengkap",
      "Kontak_WA",
      "Email_Google",
      "Peran_Utama",
      "Jumlah_Bimbingan",
      "PIN"
    ],
    sampleData: []
  },
  {
    sheetName: "Data_Pengajuan_PKL",
    displayName: "6. Data Pengajuan PKL",
    description: "Respon pendaftaran masuk dari portal siswa beserta hasil keputusan verifikasi Kakomli.",
    category: "operasional",
    icon: "FileText",
    color: "purple",
    headers: [
      "No_Pengajuan",
      "Timestamp",
      "NIS",
      "Nama_Siswa",
      "Jurusan",
      "Kelas",
      "ID_DUDI",
      "DUDI_Tujuan",
      "Alamat_DUDI",
      "Bidang_Pekerjaan",
      "Nama_Pemimpin",
      "Nama_PIC",
      "No_Telp_DUDI",
      "Hari_Kerja",
      "Jam_Kerja",
      "Link_Maps",
      "No_WA",
      "Alamat_Domisili",
      "Nama_Ortu_Wali",
      "No_Ortu_Wali",
      "Status_Kakomli",
      "Catatan_Kakomli",
      "Status_Hubin",
      "ID_Guru_Pendamping",
      "Guru_Pendamping",
      "Tgl_Berangkat"
    ],
    sampleData: []
  },
  {
    sheetName: "Data_Perizinan_PKL",
    displayName: "7. Data Perizinan PKL (Izin & Surat DUDI)",
    description: "Tracking kategori izin siswa, rentang tanggal izin, pengiriman surat permohonan resmi, dan status balasan DUDI.",
    category: "operasional",
    icon: "FileCheck",
    color: "teal",
    headers: [
      "ID_Perizinan",
      "No_Pengajuan",
      "NIS",
      "Nama_Siswa",
      "Jurusan",
      "Kelas",
      "Nama_Ortu_Wali",
      "No_Ortu_Wali",
      "Izin",
      "Tgl_Mulai_Izin",
      "Tgl_Selesai_Izin",
      "Rentang_Tanggal",
      "No_Surat_Permohonan",
      "ID_DUDI",
      "DUDI_Tujuan",
      "Alamat_DUDI",
      "Tgl_Kirim_Surat",
      "Status_Balasan_DUDI",
      "Tgl_Balasan",
      "Catatan_Perizinan",
      "Link_Bukti_Balasan",
      "Link_Surat_PDF"
    ],
    sampleData: []
  },
  {
    sheetName: "Plotting_Pemberangkatan",
    displayName: "8. Data Siswa PKL & Penempatan",
    description: "Penjadwalan pemberangkatan kelompok siswa PKL dan penetapan guru pendamping resmi oleh Pokja Hubin.",
    category: "operasional",
    icon: "Calendar",
    color: "blue",
    headers: [
      "ID_Penempatan",
      "NIS",
      "Nama_Siswa",
      "ID_DUDI",
      "Nama_DUDI",
      "ID_Guru_Pendamping",
      "Guru_Pendamping",
      "Tanggal_Berangkat",
      "Tanggal_Rencana_Tarik",
      "Status_Penempatan",
      "Catatan_Penempatan"
    ],
    sampleData: []
  },
  {
    sheetName: "Monitoring_5_Tahap",
    displayName: "9. Monitoring 8 Tahap Guru",
    description: "Log pelaksanaan supervisi 8 tahap: Pengantaran, Monitoring 1-6, Absensi S/I/A, Nilai PKL (mulai Mon 4), & Penarikan.",
    category: "operasional",
    icon: "Compass",
    color: "orange",
    headers: [
      "ID_Monitoring",
      "ID_Penempatan",
      "NIS",
      "Nama_Siswa",
      "ID_DUDI",
      "DUDI_Tujuan",
      "Alamat_DUDI",
      "Jurusan",
      "ID_Guru_Pendamping",
      "Guru_Pendamping",
      "Tahap",
      "Tanggal_Kunjungan",
      "Sakit",
      "Izin",
      "Alpha",
      "Buku_Laporan",
      "Aktivitas_DP",
      "Aktivitas_MT",
      "Aktivitas_KRT",
      "Kompetensi_Didapat",
      "Kondisi_Bengkel",
      "TTD_Siswa",
      "Nilai_PKL_Muncul",
      "Nilai_K3LH",
      "Nilai_Softskills",
      "Nilai_Hardskills",
      "Nilai_Alur_Bisnis_Dunia_Kerja",
      "Nilai_rata_rata",
      "Catatan_Kunjungan",
      "Foto_Bukti_Drive",
      "Nilai_DUDI_Terkumpul",
      "Blangko_Sertifikat_Bawa",
      "Status_Tahap"
    ],
    sampleData: []
  },
  {
    sheetName: "Nilai_Dan_Sertifikat",
    displayName: "10. Nilai, Raport & No Seri Blangko",
    description: "Rekapitulasi 4 kategori nilai DUDI (K3LH, Softskills, Hardskills, Alur Bisnis Dunia Kerja), rata-rata nilai, predikat, no seri blangko, & raport.",
    category: "evaluasi",
    icon: "Award",
    color: "emerald",
    headers: [
      "ID_Penempatan",
      "NIS",
      "Nama_Siswa",
      "Jurusan",
      "Kelas",
      "ID_DUDI",
      "DUDI_Tujuan",
      "Nilai_K3LH",
      "Nilai_Softskills",
      "Nilai_Hardskills",
      "Nilai_Alur_Bisnis_Dunia_Kerja",
      "Nilai_rata_rata",
      "Predikat",
      "No_Seri_Blangko",
      "Status_Blangko",
      "Status_Raport",
      "Tgl_Terbit"
    ],
    sampleData: []
  },
  {
    sheetName: "Master_Akun",
    displayName: "11. Master Akun Pengelola",
    description: "Akun login username & password terenkripsi (SHA-256) untuk seluruh peran admin pengelola portal.",
    category: "master",
    icon: "ShieldCheck",
    color: "slate",
    headers: [
      "ID",
      "Username",
      "Password_Hash",
      "Role",
      "Nama_Lengkap",
      "Jabatan",
      "Status",
      "Updated_At"
    ],
    sampleData: []
  },
  {
    sheetName: "Log_Penerbitan_Surat",
    displayName: "12. Log Penerbitan Surat Monitoring",
    description: "Catatan status terbit surat tugas/monitoring/pengantaran/penarikan per DUDI & Tahap (1-8) sebagai kunci pembuka portal supervisi.",
    category: "evaluasi",
    icon: "FileCheck2",
    color: "blue",
    headers: [
      "ID_Terbit",
      "ID_DUDI",
      "Nama_DUDI",
      "Tahap",
      "Nama_Tahap",
      "Status_Terbit",
      "Jenis_Dokumen",
      "Nomor_Surat",
      "Tanggal_Terbit",
      "Diterbitkan_Oleh",
      "Guru_Pendamping",
      "Link_PDF",
      "Updated_At"
    ],
    sampleData: []
  }
];
var FORMULA_MANAGED_COLUMNS = {
  Master_Jurusan: ["Kuota_Siswa", "Total_Terdaftar"],
  Master_Kelas_Walas: ["Jurusan", "Jumlah_Siswa"],
  Master_DUDI: ["Guru_Pendamping", "Terisi"],
  Master_Guru_Pendamping: ["Jumlah_Bimbingan"],
  Data_Pengajuan_PKL: [
    "Nama_Siswa",
    "Jurusan",
    "Kelas",
    "Nama_Ortu_Wali",
    "No_Ortu_Wali",
    "Guru_Pendamping"
  ],
  Data_Perizinan_PKL: [
    "Nama_Siswa",
    "Jurusan",
    "Kelas",
    "Nama_Ortu_Wali",
    "No_Ortu_Wali",
    "Rentang_Tanggal",
    "DUDI_Tujuan",
    "Alamat_DUDI"
  ],
  Plotting_Pemberangkatan: ["Nama_Siswa", "Nama_DUDI", "Guru_Pendamping"],
  Monitoring_5_Tahap: [
    "Nama_Siswa",
    "DUDI_Tujuan",
    "Alamat_DUDI",
    "Jurusan",
    "Guru_Pendamping",
    "Nilai_rata_rata"
  ],
  Nilai_Dan_Sertifikat: [
    "Nama_Siswa",
    "Jurusan",
    "Kelas",
    "DUDI_Tujuan",
    "Nilai_K3LH",
    "Nilai_Softskills",
    "Nilai_Hardskills",
    "Nilai_Alur_Bisnis_Dunia_Kerja",
    "Nilai_rata_rata",
    "Predikat"
  ]
};
function normalizeFormulaHeaderKey(key) {
  return String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
var FORMULA_MANAGED_NORM_SETS = Object.fromEntries(
  Object.entries(FORMULA_MANAGED_COLUMNS).map(([sheet, cols]) => [
    sheet,
    new Set(cols.map(normalizeFormulaHeaderKey))
  ])
);
var SHEET_DEPENDENTS_MAP = {
  Master_Siswa_XI: [
    "Master_Jurusan",
    "Master_Kelas_Walas",
    "Data_Pengajuan_PKL",
    "Data_Perizinan_PKL",
    "Plotting_Pemberangkatan",
    "Monitoring_5_Tahap",
    "Nilai_Dan_Sertifikat"
  ],
  Master_Siswa: [
    "Master_Jurusan",
    "Master_Kelas_Walas",
    "Data_Pengajuan_PKL",
    "Data_Perizinan_PKL",
    "Plotting_Pemberangkatan",
    "Monitoring_5_Tahap",
    "Nilai_Dan_Sertifikat"
  ],
  Master_Jurusan: [
    "Master_Kelas_Walas",
    "Data_Pengajuan_PKL",
    "Data_Perizinan_PKL",
    "Monitoring_5_Tahap",
    "Nilai_Dan_Sertifikat"
  ],
  Master_DUDI: [
    "Data_Perizinan_PKL",
    "Plotting_Pemberangkatan",
    "Monitoring_5_Tahap",
    "Nilai_Dan_Sertifikat"
  ],
  Master_Guru_Pendamping: [
    "Master_DUDI",
    "Data_Pengajuan_PKL",
    "Plotting_Pemberangkatan",
    "Monitoring_5_Tahap"
  ],
  Data_Pengajuan_PKL: ["Master_Jurusan", "Data_Perizinan_PKL"],
  Plotting_Pemberangkatan: [
    "Master_DUDI",
    "Master_Guru_Pendamping",
    "Master_Jurusan",
    "Monitoring_5_Tahap",
    "Nilai_Dan_Sertifikat"
  ],
  Monitoring_5_Tahap: ["Nilai_Dan_Sertifikat"]
};
function getDependentSheets(sheetName) {
  return SHEET_DEPENDENTS_MAP[sheetName] || [];
}

// src/core/utils/dateHelpers.ts
var INDONESIAN_MONTH_MAP = {
  januari: 1,
  jan: 1,
  februari: 2,
  feb: 2,
  pebruari: 2,
  maret: 3,
  mar: 3,
  april: 4,
  apr: 4,
  mei: 5,
  may: 5,
  juni: 6,
  jun: 6,
  juli: 7,
  jul: 7,
  agustus: 8,
  agu: 8,
  agt: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  oktober: 10,
  okt: 10,
  oct: 10,
  november: 11,
  nov: 11,
  desember: 12,
  des: 12,
  dec: 12
};
function pad2(n) {
  return String(n).padStart(2, "0");
}
function isValidYmd(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}
function getWibCalendarParts(date = /* @__PURE__ */ new Date()) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const pick = (type) => parts.find((p) => p.type === type)?.value || "00";
  return {
    year: Number(pick("year")),
    month: Number(pick("month")),
    day: Number(pick("day")),
    hour: pick("hour"),
    minute: pick("minute"),
    second: pick("second")
  };
}
function getTodayWibIsoDate() {
  const p = getWibCalendarParts(/* @__PURE__ */ new Date());
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}
function getTodayWibDateTime() {
  const p = getWibCalendarParts(/* @__PURE__ */ new Date());
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)} ${p.hour}:${p.minute}:${p.second}`;
}
function isIsoTimestampString(val) {
  if (typeof val !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/i.test(
    val.trim()
  );
}
function normalizeToIsoDate(val) {
  if (val === void 0 || val === null) return "";
  if (val instanceof Date) {
    if (Number.isNaN(val.getTime())) return "";
    const p = getWibCalendarParts(val);
    return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
  }
  if (typeof val === "number" && Number.isFinite(val)) {
    if (val > 2e4 && val < 9e4) {
      const utcMs = Date.UTC(1899, 11, 30) + Math.round(val) * 864e5;
      const d = new Date(utcMs);
      return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
    }
    return "";
  }
  const raw = String(val).trim();
  if (!raw || raw === "-" || raw.toLowerCase() === "invalid date") return "";
  const ymdMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/);
  if (ymdMatch) {
    const y = Number(ymdMatch[1]);
    const m = Number(ymdMatch[2]);
    const d = Number(ymdMatch[3]);
    if (isValidYmd(y, m, d)) {
      return `${y}-${pad2(m)}-${pad2(d)}`;
    }
  }
  if (isIsoTimestampString(raw)) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      const p = getWibCalendarParts(parsed);
      return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
    }
  }
  const dmyMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const d = Number(dmyMatch[1]);
    const m = Number(dmyMatch[2]);
    const y = Number(dmyMatch[3]);
    if (isValidYmd(y, m, d)) {
      return `${y}-${pad2(m)}-${pad2(d)}`;
    }
  }
  const idTextMatch = raw.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (idTextMatch) {
    const d = Number(idTextMatch[1]);
    const m = INDONESIAN_MONTH_MAP[idTextMatch[2].toLowerCase()];
    const y = Number(idTextMatch[3]);
    if (m && isValidYmd(y, m, d)) {
      return `${y}-${pad2(m)}-${pad2(d)}`;
    }
  }
  const numericOnly = /^\d+$/.test(raw);
  if (numericOnly) {
    const num = Number(raw);
    if (num > 2e4 && num < 9e4) {
      return normalizeToIsoDate(num);
    }
    return "";
  }
  return "";
}

// src/core/utils/autoIdHelpers.ts
var JURUSAN_CODE_MAP = {
  "desain komunikasi visual": "DKV",
  "rekayasa perangkat lunak": "RPL",
  "teknik alat berat": "TAB",
  "teknik bodi kendaraan ringan": "TBKR",
  "teknik kendaraan ringan": "TKR",
  "teknik komputer dan jaringan": "TKJ",
  "teknik pemesinan": "TPM",
  "teknik pengelasan": "TPL",
  "teknik sepeda motor": "TSM"
};
var CODE_TO_JURUSAN_NAME = {
  DKV: "Desain Komunikasi Visual",
  RPL: "Rekayasa Perangkat Lunak",
  TAB: "Teknik Alat Berat",
  TBKR: "Teknik Bodi Kendaraan Ringan",
  TKR: "Teknik Kendaraan Ringan",
  TKJ: "Teknik Komputer dan Jaringan",
  TPM: "Teknik Pemesinan",
  TPL: "Teknik Pengelasan",
  TSM: "Teknik Sepeda Motor"
};
function resolveJurusanDisplayName(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";
  const upper = trimmed.toUpperCase();
  if (CODE_TO_JURUSAN_NAME[upper]) {
    return CODE_TO_JURUSAN_NAME[upper];
  }
  const lower = trimmed.toLowerCase().replace(/\s+/g, " ");
  if (JURUSAN_CODE_MAP[lower]) {
    return CODE_TO_JURUSAN_NAME[JURUSAN_CODE_MAP[lower]] || trimmed;
  }
  return trimmed;
}
function generateJurusanCode(namaJurusan) {
  const raw = String(namaJurusan || "").trim();
  if (!raw) return "";
  const upperRaw = raw.toUpperCase();
  if (CODE_TO_JURUSAN_NAME[upperRaw]) {
    return upperRaw;
  }
  const cleaned = raw.toLowerCase().replace(/\s+/g, " ");
  if (JURUSAN_CODE_MAP[cleaned]) {
    return JURUSAN_CODE_MAP[cleaned];
  }
  const stopWords = /* @__PURE__ */ new Set(["dan", "serta", "di", "ke", "yang", "atau", "keahlian", "program"]);
  const words = cleaned.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w && !stopWords.has(w));
  if (words.length === 0) return "";
  if (words.length === 1) {
    return words[0].slice(0, 5).toUpperCase();
  }
  return words.map((w) => w[0]).join("").slice(0, 5).toUpperCase();
}

// src/core/utils/nisHelpers.ts
function stripNisSymbols(val) {
  if (val === void 0 || val === null) return "";
  const str = String(val).trim();
  if (!str || str === "-") return "";
  return str.replace(/\D/g, "");
}

// src/core/GoogleDriveSheetService.ts
var GoogleDriveSheetService = class _GoogleDriveSheetService {
  constructor() {
  }
  static getInstance() {
    if (!_GoogleDriveSheetService.instance) {
      _GoogleDriveSheetService.instance = new _GoogleDriveSheetService();
    }
    return _GoogleDriveSheetService.instance;
  }
  clearSheetIdCache(_spreadsheetId) {
  }
  static {
    this.FIELD_ALIASES = {
      // Siswa / Guru Shared Nama & ID
      Nama_Lengkap: ["nama", "namaLengkap", "nama_lengkap", "Nama_Lengkap", "Nama_Guru", "namaGuru", "nama_guru"],
      Jenis_Kelamin: ["jenisKelamin", "jenis_kelamin", "Jenis_Kelamin"],
      ID_Jurusan: ["idJurusan", "jurusan", "id_jurusan", "ID_Jurusan"],
      No_HP_Siswa: ["noHpSiswa", "noHp", "no_hp_siswa", "No_HP_Siswa"],
      Alamat_Domisili: ["alamatDomisili", "alamat_domisili", "Alamat_Domisili", "alamat"],
      Nama_Ortu_Wali: ["namaOrtuWali", "nama_ortu_wali", "Nama_Ortu_Wali", "nama_orang_tua", "namaOrtu"],
      No_Ortu_Wali: ["noOrtuWali", "no_ortu_wali", "No_Ortu_Wali", "telepon_orang_tua", "noHpOrtu"],
      Status_PKL: ["statusPKL", "status_pkl", "Status_PKL"],
      Foto_URL: ["fotoUrl", "foto_url", "Foto_URL"],
      NIK: ["nik", "NIK"],
      NIS: ["nis", "NIS"],
      Kelas: ["kelas", "Kelas"],
      ID: ["id", "ID", "ID_Guru", "idGuru", "id_guru"],
      // Jurusan
      Kode: ["kode", "Kode"],
      Nama_Jurusan: ["nama", "namaJurusan", "nama_jurusan", "Nama_Jurusan"],
      Nama_Kakomli: ["namaKakomli", "nama_kakomli", "Nama_Kakomli"],
      NIP_Kakomli: ["nipKakomli", "nip_kakomli", "NIP_Kakomli"],
      Kontak_WA: ["kontakWA", "kontakWa", "kontak_wa", "Kontak_WA", "noWa", "No_WA", "no_wa"],
      Kuota_Siswa: ["kuotaSiswa", "kuota_siswa", "Kuota_Siswa"],
      Total_Terdaftar: ["totalTerdaftar", "total_terdaftar", "Total_Terdaftar"],
      // Kelas
      Nama_Kelas: ["namaKelas", "nama_kelas", "Nama_Kelas"],
      Jurusan: ["jurusan", "Jurusan"],
      Tingkat: ["tingkat", "Tingkat"],
      Wali_Kelas: ["waliKelas", "wali_kelas", "Wali_Kelas"],
      Kontak_Walas: ["kontakWalas", "kontak_walas", "Kontak_Walas"],
      Jumlah_Siswa: ["jumlahSiswa", "jumlah_siswa", "Jumlah_Siswa"],
      // DUDI
      Nama_DUDI: ["namaDudi", "nama_dudi", "Nama_DUDI", "nama"],
      Bidang_Keahlian: ["bidangKeahlian", "bidang_keahlian", "Bidang_Keahlian"],
      Alamat: ["alamat", "Alamat"],
      Wilayah_Kota: ["wilayahKota", "wilayah_kota", "Wilayah_Kota"],
      Nama_Pemimpin: ["namaPemimpin", "nama_pemimpin", "Nama_Pemimpin", "pimpinan"],
      Nama_PIC: ["namaPic", "nama_pic", "Nama_PIC"],
      Kontak_PIC: ["kontakPic", "kontak_pic", "Kontak_PIC"],
      No_Telp_DUDI: ["noTelpDudi", "no_telp_dudi", "No_Telp_DUDI", "teleponDudi"],
      Link_Maps: ["linkMaps", "link_maps", "Link_Maps", "linkMapsDudi", "googleMapsUrl"],
      Hari_Kerja: ["hariKerja", "hari_kerja", "Hari_Kerja"],
      Jam_Kerja: ["jamKerja", "jam_kerja", "Jam_Kerja"],
      Kuota_Maksimal: ["kuotaMaksimal", "kuota_maksimal", "Kuota_Maksimal"],
      Terisi: ["terisi", "Terisi"],
      Status_Kerjasama: ["statusKerjasama", "status_kerjasama", "Status_Kerjasama"],
      // Guru
      NIP: ["nip", "NIP"],
      Email_Google: ["email", "emailGoogle", "email_google", "Email_Google"],
      Peran_Utama: ["peranUtama", "peran_utama", "Peran_Utama", "Peran", "peran"],
      Jumlah_Bimbingan: ["jumlahBimbingan", "jumlah_bimbingan", "Jumlah_Bimbingan"],
      PIN: ["pin", "PIN", "Pin"],
      // Pengajuan
      No_Pengajuan: ["noPengajuan", "no_pengajuan", "No_Pengajuan", "id"],
      Timestamp: ["timestamp", "Timestamp"],
      Nama_Siswa: ["namaSiswa", "nama_siswa", "Nama_Siswa", "nama"],
      DUDI_Tujuan: ["dudiTujuan", "dudi_tujuan", "DUDI_Tujuan"],
      Alamat_DUDI: ["alamatDudi", "alamat_dudi", "Alamat_DUDI", "alamat"],
      Bidang_Pekerjaan: ["bidangPekerjaan", "bidang_pekerjaan", "Bidang_Pekerjaan"],
      No_WA: ["noWa", "no_wa", "No_WA"],
      Status_Kakomli: ["statusKakomli", "status_kakomli", "Status_Kakomli"],
      Catatan_Kakomli: ["catatanKakomli", "catatan_kakomli", "Catatan_Kakomli"],
      Status_Hubin: ["statusHubin", "status_hubin", "Status_Hubin"],
      Guru_Pendamping: ["guruPendamping", "guru_pendamping", "Guru_Pendamping"],
      Tgl_Berangkat: ["tanggalBerangkat", "tglBerangkat", "tgl_berangkat", "Tgl_Berangkat"],
      // Perizinan PKL
      ID_Perizinan: ["noPerizinan", "idPerizinan", "id_perizinan", "ID_Perizinan", "id"],
      Status_Izin_Ortu: ["statusIzinOrtu", "status_izin_ortu", "Status_Izin_Ortu", "Izin"],
      Tgl_Mulai_Izin: ["tanggalMulaiIzin", "tglMulaiIzin", "tgl_mulai_izin", "Tgl_Mulai_Izin"],
      Tgl_Selesai_Izin: ["tanggalSelesaiIzin", "tglSelesaiIzin", "tgl_selesai_izin", "Tgl_Selesai_Izin"],
      Rentang_Tanggal: ["rentangTanggal", "rentang_tanggal", "Rentang_Tanggal"],
      No_Surat_Permohonan: ["noSuratPermohonan", "no_surat_permohonan", "No_Surat_Permohonan"],
      Tgl_Kirim_Surat: ["tanggalKirimSurat", "tglKirimSurat", "tgl_kirim_surat", "Tgl_Kirim_Surat"],
      Status_Balasan_DUDI: ["statusBalasanDudi", "status_balasan_dudi", "Status_Balasan_DUDI"],
      Tgl_Balasan: ["tanggalBalasan", "tglBalasan", "tgl_balasan", "Tgl_Balasan"],
      Catatan_Perizinan: ["catatanPerizinan", "catatan_perizinan", "Catatan_Perizinan"],
      Link_Bukti_Balasan: ["linkBuktiBalasan", "link_bukti_balasan", "Link_Bukti_Balasan"],
      Link_Surat_PDF: ["linkSuratPdf", "link_surat_pdf", "Link_Surat_PDF", "pdfUrl"],
      // Plotting / Data Siswa PKL
      ID_Penempatan: ["idPenempatan", "id_penempatan", "ID_Penempatan", "id"],
      ID_DUDI: ["idDudi", "id_dudi", "ID_DUDI"],
      ID_Guru_Pendamping: ["idGuruPendamping", "id_guru_pendamping", "ID_Guru_Pendamping"],
      Tanggal_Berangkat: ["tanggalBerangkat", "tanggal_berangkat", "Tanggal_Berangkat", "tglBerangkat"],
      Tanggal_Rencana_Tarik: ["tanggalRencanaTarik", "tanggal_rencana_tarik", "Tanggal_Rencana_Tarik"],
      Status_Penempatan: ["statusPenempatan", "status_penempatan", "Status_Penempatan"],
      Catatan_Penempatan: ["catatanPenempatan", "catatan_penempatan", "Catatan_Penempatan"],
      // Monitoring
      ID_Monitoring: ["idMonitoring", "id_monitoring", "ID_Monitoring", "id"],
      Daftar_Siswa: ["daftarSiswa", "daftar_siswa", "Daftar_Siswa"],
      Tahap: ["tahap", "Tahap"],
      Tanggal_Kunjungan: ["tanggalKunjungan", "tanggal_kunjungan", "Tanggal_Kunjungan"],
      Sakit: ["sakit", "Sakit"],
      Izin: ["izin", "Izin"],
      Alpha: ["alpha", "alfa", "Alpha"],
      Buku_Laporan: ["bukuLaporan", "buku_laporan", "Buku_Laporan"],
      Aktivitas_DP: ["aktivitasDp", "aktivitas_dp", "Aktivitas_DP"],
      Aktivitas_MT: ["aktivitasMt", "aktivitas_mt", "Aktivitas_MT"],
      Aktivitas_KRT: ["aktivitasKrt", "aktivitas_krt", "Aktivitas_KRT"],
      Kompetensi_Didapat: ["kompetensiDidapat", "kompetensi_didapat", "kompetensi_siswa", "Kompetensi_Didapat"],
      Kondisi_Bengkel: ["kondisiBengkel", "kondisi_bengkel", "Kondisi_Bengkel"],
      TTD_Siswa: ["ttdSiswa", "ttd_siswa", "TTD_Siswa"],
      Nilai_PKL_Muncul: ["nilaiPklMuncul", "nilai_pkl_muncul", "Nilai_PKL_Muncul"],
      // Monitoring & Sertifikat Nilai (4 Kategori DUDI + Rata-rata)
      Nilai_K3LH: ["nilaiK3lh", "nilai_k3lh", "Nilai_K3LH"],
      Nilai_Softskills: ["nilaiSoftskill", "nilaiSoftskills", "nilai_softskills", "nilai_softskill", "Nilai_Softskills", "Nilai_Softskill"],
      Nilai_Softskill: ["nilaiSoftskill", "nilaiSoftskills", "nilai_softskill", "nilai_softskills", "Nilai_Softskill", "Nilai_Softskills"],
      Nilai_Hardskills: ["nilaiKompetensiTeknis", "nilaiHardskills", "nilai_hardskills", "nilai_kompetensi_teknis", "Nilai_Hardskills", "Nilai_Kompetensi_Teknis"],
      Nilai_Kompetensi_Teknis: ["nilaiKompetensiTeknis", "nilaiHardskills", "nilai_kompetensi_teknis", "nilai_hardskills", "Nilai_Kompetensi_Teknis", "Nilai_Hardskills"],
      Nilai_Alur_Bisnis_Dunia_Kerja: ["nilaiAlurBisnis", "nilaiAlurBisnisDuniaKerja", "nilai_alur_bisnis_dunia_kerja", "nilai_alur_bisnis", "Nilai_Alur_Bisnis_Dunia_Kerja", "Nilai_Alur_Bisnis"],
      Nilai_Alur_Bisnis: ["nilaiAlurBisnis", "nilaiAlurBisnisDuniaKerja", "nilai_alur_bisnis", "nilai_alur_bisnis_dunia_kerja", "Nilai_Alur_Bisnis", "Nilai_Alur_Bisnis_Dunia_Kerja"],
      Nilai_rata_rata: ["nilaiRataRata", "nilaiDudi", "nilaiAkhir", "nilai_rata_rata", "Nilai_rata_rata", "Nilai_Rata_Rata", "Nilai_DUDI", "Nilai_Akhir"],
      Nilai_Rata_Rata: ["nilaiRataRata", "nilaiDudi", "nilaiAkhir", "nilai_rata_rata", "Nilai_Rata_Rata", "Nilai_rata_rata", "Nilai_DUDI", "Nilai_Akhir"],
      Catatan_Kunjungan: ["catatanKunjungan", "catatan_kunjungan", "Catatan_Kunjungan"],
      Foto_Bukti_Drive: ["fotoBuktiUrl", "fotoBuktiDrive", "foto_bukti_drive", "Foto_Bukti_Drive"],
      Nilai_DUDI_Terkumpul: ["nilaiDudiTerkumpul", "nilai_dudi_terkumpul", "Nilai_DUDI_Terkumpul"],
      Blangko_Sertifikat_Bawa: ["blangkoSertifikatBawa", "blangko_sertifikat_bawa", "Blangko_Sertifikat_Bawa"],
      Status_Tahap: ["statusTahap", "status_tahap", "Status_Tahap"],
      // Sertifikat & Blangko
      Predikat: ["predikat", "Predikat"],
      No_Seri_Blangko: ["noSeriBlangko", "no_seri_blangko", "No_Seri_Blangko"],
      Status_Blangko: ["statusBlangko", "status_blangko", "Status_Blangko"],
      Status_Raport: ["statusRaport", "status_raport", "Status_Raport"],
      Tgl_Terbit: ["tanggalTerbit", "tglTerbit", "tgl_terbit", "Tgl_Terbit"],
      // Log Penerbitan Surat
      ID_Terbit: ["idTerbit", "id_terbit", "ID_Terbit", "id"],
      Nama_Tahap: ["namaTahap", "nama_tahap", "Nama_Tahap"],
      Status_Terbit: ["statusTerbit", "status_terbit", "Status_Terbit"],
      Jenis_Dokumen: ["jenisDokumen", "jenis_dokumen", "Jenis_Dokumen"],
      Nomor_Surat: ["nomorSurat", "nomor_surat", "Nomor_Surat"],
      Tanggal_Terbit: ["tanggalTerbit", "tanggal_terbit", "Tanggal_Terbit", "tglTerbit"],
      Diterbitkan_Oleh: ["diterbitkanOleh", "diterbitkan_oleh", "Diterbitkan_Oleh"],
      Link_PDF: ["linkPdf", "link_pdf", "Link_PDF", "pdfUrl"],
      Updated_At: ["updatedAt", "updated_at", "Updated_At"]
    };
  }
  static {
    this.PRIMARY_ID_HEADER_BY_SHEET = {
      Master_Siswa_XI: "ID",
      Master_Siswa: "ID",
      Master_Jurusan: "ID",
      Master_Kelas_Walas: "ID",
      Master_DUDI: "ID",
      Master_Guru_Pendamping: "ID",
      Data_Pengajuan_PKL: "No_Pengajuan",
      Data_Perizinan_PKL: "ID_Perizinan",
      Plotting_Pemberangkatan: "ID_Penempatan",
      Monitoring_5_Tahap: "ID_Monitoring",
      Nilai_Dan_Sertifikat: "ID_Penempatan",
      Master_Akun: "ID",
      Log_Penerbitan_Surat: "ID_Terbit"
    };
  }
  static {
    this.BOOLEAN_HEADER_KEYS = /* @__PURE__ */ new Set([
      "nilaipklmuncul",
      "nilaiduditerkumpul",
      "blangkosertifikatbawa"
    ]);
  }
  static {
    this.DATE_HEADER_KEYS = /* @__PURE__ */ new Set([
      "tglberangkat",
      "tanggalberangkat",
      "tanggalrencanatarik",
      "tglkirimsurat",
      "tanggalkirimsurat",
      "tglbalasan",
      "tanggalbalasan",
      "tanggalkunjungan",
      "tglkunjungan",
      "tglterbit",
      "tanggalterbit",
      "tglmulaiizin",
      "tanggalmulaiizin",
      "tglselesaiizin",
      "tanggalselesaiizin"
    ]);
  }
  static normalizeKey(key) {
    return String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  getFieldAliases(sheetName, header) {
    if (sheetName === "Data_Perizinan_PKL" && (header === "Izin" || header === "Status_Izin_Ortu")) {
      return ["statusIzinOrtu", "Status_Izin_Ortu", "status_izin_ortu", "Izin", "izin"];
    }
    return _GoogleDriveSheetService.FIELD_ALIASES[header] || [];
  }
  static stripSyntheticRowSuffix(rawId) {
    const str = String(rawId ?? "").trim();
    if (!str) return { cleanId: "" };
    const hashMatch = str.match(/^(.*)#r(\d+)$/);
    if (hashMatch) {
      return {
        cleanId: hashMatch[1].trim(),
        hintedRowNumber: Number(hashMatch[2])
      };
    }
    const rowPlaceholder = str.match(/^row_(\d+)$/);
    if (rowPlaceholder) {
      return {
        cleanId: "",
        hintedRowNumber: Number(rowPlaceholder[1])
      };
    }
    return { cleanId: str };
  }
  getHeadersForSheet(sheetName) {
    const blueprint = HUBIN_SHEETS_BLUEPRINT.find((b) => b.sheetName === sheetName);
    if (blueprint) return blueprint.headers;
    if (sheetName === "Master_Siswa") {
      const siswaBp = HUBIN_SHEETS_BLUEPRINT.find((b) => b.sheetName === "Master_Siswa_XI");
      if (siswaBp) return siswaBp.headers;
    }
    return ["id"];
  }
  formatCellValue(val) {
    if (typeof val === "boolean") {
      return val ? "Ya" : "Belum";
    }
    if (typeof val === "number") {
      return Number.isFinite(val) ? val : "";
    }
    return String(val ?? "");
  }
  /**
   * Synchronizes canonical spreadsheet column keys (from blueprint headers)
   * with camelCase / aliased domain keys so GAS always reads the latest edited values
   * instead of stale raw column properties copied from memoryData.
   */
  prepareOutgoingRecord(sheetName, record, updatedKeys) {
    if (!record || typeof record !== "object") return record;
    const out = { ...record };
    const { cleanId, hintedRowNumber } = _GoogleDriveSheetService.stripSyntheticRowSuffix(out.id);
    const sheetRowNumber = typeof out._sheetRowNumber === "number" && out._sheetRowNumber >= 2 ? out._sheetRowNumber : hintedRowNumber;
    if (sheetRowNumber && sheetRowNumber >= 2) {
      out._sheetRowNumber = sheetRowNumber;
    }
    const updatedNormalized = /* @__PURE__ */ new Set();
    if (updatedKeys) {
      for (const k of updatedKeys) {
        if (k === "id" || k === "_sheetRowNumber") continue;
        updatedNormalized.add(_GoogleDriveSheetService.normalizeKey(k));
        for (const [header, aliases] of Object.entries(_GoogleDriveSheetService.FIELD_ALIASES)) {
          const effectiveAliases = this.getFieldAliases(sheetName, header);
          const allForms = [header, ...effectiveAliases, ...aliases].map(
            (f) => _GoogleDriveSheetService.normalizeKey(f)
          );
          if (allForms.includes(_GoogleDriveSheetService.normalizeKey(k))) {
            allForms.forEach((f) => updatedNormalized.add(f));
          }
        }
        if (sheetName === "Data_Perizinan_PKL" && (_GoogleDriveSheetService.normalizeKey(k) === "statusizinortu" || _GoogleDriveSheetService.normalizeKey(k) === "izin")) {
          updatedNormalized.add("izin");
          updatedNormalized.add("statusizinortu");
        }
      }
    }
    const blueprintHeaders = this.getHeadersForSheet(sheetName);
    const allRecordKeys = Object.keys(out);
    for (const header of blueprintHeaders) {
      const aliases = this.getFieldAliases(sheetName, header);
      const cleanHeader = _GoogleDriveSheetService.normalizeKey(header);
      const isFieldUpdated = updatedNormalized.has(cleanHeader);
      let chosenVal = void 0;
      if (isFieldUpdated) {
        for (const alias of aliases) {
          if (out[alias] !== void 0 && out[alias] !== null) {
            chosenVal = out[alias];
            break;
          }
        }
        if (chosenVal === void 0) {
          for (const recKey of allRecordKeys) {
            if (recKey !== header && _GoogleDriveSheetService.normalizeKey(recKey) === cleanHeader && out[recKey] !== void 0 && out[recKey] !== null) {
              chosenVal = out[recKey];
              break;
            }
          }
        }
        if (chosenVal === void 0 && out[header] !== void 0) {
          chosenVal = out[header];
        }
      } else {
        const candidates = [header, ...aliases];
        for (const keyName of candidates) {
          const v = out[keyName];
          if (v !== void 0 && v !== null && String(v).trim() !== "") {
            chosenVal = v;
            break;
          }
        }
        if (chosenVal === void 0) {
          for (const keyName of candidates) {
            if (out[keyName] !== void 0 && out[keyName] !== null) {
              chosenVal = out[keyName];
              break;
            }
          }
        }
      }
      if (chosenVal !== void 0) {
        let formatted = this.formatCellValue(chosenVal);
        if (_GoogleDriveSheetService.DATE_HEADER_KEYS.has(cleanHeader) && formatted !== "") {
          const iso = normalizeToIsoDate(formatted);
          if (iso) formatted = iso;
        } else if (cleanHeader === "nis" && formatted !== "") {
          const digits = stripNisSymbols(formatted);
          if (digits) formatted = digits;
        } else if (cleanHeader === "idjurusan" && formatted !== "") {
          const code = generateJurusanCode(String(formatted));
          if (code) formatted = code;
        }
        out[header] = formatted;
        for (const alias of aliases) {
          if (alias.includes("_")) {
            out[alias] = formatted;
          }
        }
      }
    }
    const primaryIdHeader = _GoogleDriveSheetService.PRIMARY_ID_HEADER_BY_SHEET[sheetName] || "ID";
    if (cleanId && (!out[primaryIdHeader] || String(out[primaryIdHeader]).includes("#r"))) {
      out[primaryIdHeader] = cleanId;
    }
    return out;
  }
  static {
    this.PROTECTED_KEY_HEADERS = /* @__PURE__ */ new Set([
      "id",
      "nis",
      "idjurusan",
      "kode",
      "iddudi",
      "idgurupendamping",
      "idguru",
      "idpenempatan",
      "nopengajuan",
      "idperizinan",
      "noperizinan",
      "idmonitoring",
      "idterbit",
      "sheetrownumber"
    ]);
  }
  /**
   * Strips formula-managed read-only columns from an outgoing Spreadsheet/GAS write payload
   * while preserving Primary Keys, Foreign Keys, and native transaction columns.
   */
  stripFormulaManagedFields(sheetName, record) {
    if (!record || typeof record !== "object") return record;
    const managedHeaders = FORMULA_MANAGED_COLUMNS[sheetName];
    if (!managedHeaders || managedHeaders.length === 0) return record;
    const stripKeySet = /* @__PURE__ */ new Set();
    for (const h of managedHeaders) {
      stripKeySet.add(_GoogleDriveSheetService.normalizeKey(h));
      const aliases = this.getFieldAliases(sheetName, h);
      for (const alias of aliases) {
        if (alias === "nama") continue;
        stripKeySet.add(_GoogleDriveSheetService.normalizeKey(alias));
      }
    }
    const sanitized = {};
    for (const [k, v] of Object.entries(record)) {
      if (k === "_sheetRowNumber" || k === "id") {
        sanitized[k] = v;
        continue;
      }
      const normK = _GoogleDriveSheetService.normalizeKey(k);
      if (_GoogleDriveSheetService.PROTECTED_KEY_HEADERS.has(normK) || !stripKeySet.has(normK)) {
        sanitized[k] = v;
      }
    }
    return sanitized;
  }
  /**
   * Merges partial updates into an existing base record while stripping conflicting
   * raw spreadsheet header keys so updated domain values always win.
   */
  applyUpdatesAndPrepareRecord(sheetName, baseRecord, updates) {
    const cleanBase = { ...baseRecord };
    const updatedKeys = Object.keys(updates || {});
    const updatedNorms = /* @__PURE__ */ new Set();
    for (const k of updatedKeys) {
      updatedNorms.add(_GoogleDriveSheetService.normalizeKey(k));
      for (const [header, aliases] of Object.entries(_GoogleDriveSheetService.FIELD_ALIASES)) {
        const effectiveAliases = this.getFieldAliases(sheetName, header);
        const forms = [header, ...effectiveAliases, ...aliases].map(
          (f) => _GoogleDriveSheetService.normalizeKey(f)
        );
        if (forms.includes(_GoogleDriveSheetService.normalizeKey(k))) {
          forms.forEach((f) => updatedNorms.add(f));
        }
      }
      if (sheetName === "Data_Perizinan_PKL" && (_GoogleDriveSheetService.normalizeKey(k) === "statusizinortu" || _GoogleDriveSheetService.normalizeKey(k) === "izin")) {
        updatedNorms.add("izin");
        updatedNorms.add("statusizinortu");
      }
    }
    for (const baseKey of Object.keys(cleanBase)) {
      if (baseKey === "id" || baseKey === "_sheetRowNumber") continue;
      if (updatedNorms.has(_GoogleDriveSheetService.normalizeKey(baseKey))) {
        delete cleanBase[baseKey];
      }
    }
    const merged = {
      ...cleanBase,
      ...updates
    };
    if (baseRecord._sheetRowNumber && !merged._sheetRowNumber) {
      merged._sheetRowNumber = baseRecord._sheetRowNumber;
    }
    if (baseRecord.id && !updates.id) {
      merged.id = baseRecord.id;
    }
    return this.prepareOutgoingRecord(sheetName, merged, updatedKeys);
  }
  recordToRow(headers, record, sheetName = "") {
    return headers.map((header) => {
      if (record[header] !== void 0 && record[header] !== null) {
        return this.formatCellValue(record[header]);
      }
      const aliases = this.getFieldAliases(sheetName, header);
      for (const alias of aliases) {
        if (record[alias] !== void 0 && record[alias] !== null) {
          return this.formatCellValue(record[alias]);
        }
      }
      const cleanHeader = header.toLowerCase().replace(/[^a-z0-9]/g, "");
      for (const recKey of Object.keys(record)) {
        const cleanKey = recKey.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (cleanKey === cleanHeader && record[recKey] !== void 0 && record[recKey] !== null) {
          return this.formatCellValue(record[recKey]);
        }
      }
      return "";
    });
  }
  rowToRecord(sheetName, headers, rowValues, rowIndex = 0) {
    const record = {};
    headers.forEach((header, idx) => {
      if (header === "_sheetRowNumber") return;
      const cellVal = rowValues[idx] !== void 0 && rowValues[idx] !== null ? rowValues[idx] : "";
      const aliases = this.getFieldAliases(sheetName, header);
      const primaryKey = aliases[0] || header.charAt(0).toLowerCase() + header.slice(1);
      const upperHeader = header.toUpperCase();
      const cleanHeader = _GoogleDriveSheetService.normalizeKey(header);
      const isBooleanHeader = _GoogleDriveSheetService.BOOLEAN_HEADER_KEYS.has(cleanHeader);
      const isDateHeader = _GoogleDriveSheetService.DATE_HEADER_KEYS.has(cleanHeader);
      let normalizedRawCell = cellVal;
      if (isDateHeader || cleanHeader !== "timestamp" && isIsoTimestampString(cellVal)) {
        const iso = normalizeToIsoDate(cellVal);
        if (iso) normalizedRawCell = iso;
      } else if (cleanHeader === "nis" && typeof cellVal === "string") {
        const digits = stripNisSymbols(cellVal);
        if (digits) normalizedRawCell = digits;
      } else if (cleanHeader === "nis" && typeof cellVal === "number" && Number.isFinite(cellVal)) {
        normalizedRawCell = String(Math.trunc(cellVal));
      }
      let parsedVal = normalizedRawCell;
      if (typeof normalizedRawCell === "string") {
        const trimmed = normalizedRawCell.trim();
        const lower = trimmed.toLowerCase();
        if (isBooleanHeader && (lower === "ya" || lower === "true" || lower === "sudah")) {
          parsedVal = true;
        } else if (isBooleanHeader && (lower === "belum" || lower === "false" || lower === "tidak")) {
          parsedVal = false;
        } else if (!isNaN(Number(trimmed)) && trimmed !== "" && !upperHeader.includes("NIS") && !upperHeader.includes("NIK") && !upperHeader.includes("NO_") && !upperHeader.includes("KONTAK") && !upperHeader.includes("HP") && !upperHeader.includes("NIP") && !upperHeader.includes("PIN") && !upperHeader.includes("TELEPON") && !upperHeader.includes("SERI")) {
          parsedVal = Number(trimmed);
        }
      }
      if (record[primaryKey] === void 0 || record[primaryKey] === "" || parsedVal !== "") {
        record[primaryKey] = parsedVal;
      }
      if (cleanHeader === "idjurusan" && normalizedRawCell) {
        const code = generateJurusanCode(String(normalizedRawCell)) || String(normalizedRawCell).trim();
        record.idJurusan = code;
        if (!record.jurusan) {
          record.jurusan = resolveJurusanDisplayName(normalizedRawCell);
        }
      } else if (cleanHeader === "jurusan") {
        const resolved = resolveJurusanDisplayName(normalizedRawCell || record.idJurusan);
        if (resolved) record.jurusan = resolved;
      }
      record[header] = normalizedRawCell;
    });
    if (!record.jurusan && record.idJurusan) {
      record.jurusan = resolveJurusanDisplayName(record.idJurusan);
    }
    if (!record.idJurusan && record.jurusan && (sheetName === "Master_Siswa_XI" || sheetName === "Master_Siswa" || sheetName === "Master_Kelas_Walas")) {
      record.idJurusan = generateJurusanCode(String(record.jurusan));
    }
    const sheetRowNum = rowIndex + 2;
    record._sheetRowNumber = sheetRowNum;
    if (!record.id) {
      record.id = record.ID || record.No_Pengajuan || record.noPengajuan || record.ID_Perizinan || record.noPerizinan || record.ID_Penempatan || record.idPenempatan || record.ID_Monitoring || record.idMonitoring || record.ID_Terbit || record.idTerbit || record.NIS || record.nis || `row_${sheetRowNum}`;
    }
    if ((sheetName === "Monitoring_5_Tahap" || sheetName.startsWith("Monitoring_")) && (!record.nis || !record.namaSiswa)) {
      const rawDaftar = String(record.daftarSiswa || record.Daftar_Siswa || "").trim();
      if (rawDaftar) {
        const match = rawDaftar.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
        if (match) {
          if (!record.namaSiswa && match[1].trim()) {
            record.namaSiswa = match[1].trim();
          }
          if (!record.nis) {
            const digits = stripNisSymbols(match[2]);
            if (digits) record.nis = digits;
          }
        } else if (!record.namaSiswa) {
          record.namaSiswa = rawDaftar;
        }
      }
    }
    return record;
  }
  /**
   * Normalizes raw row objects returned by GAS Web App / Server Proxy
   * into the exact same typed/aliased record shape used by all UI modules.
   */
  normalizeExternalRows(sheetName, rawRows) {
    if (!Array.isArray(rawRows) || rawRows.length === 0) return [];
    const seenIds = /* @__PURE__ */ new Set();
    const blueprintHeaders = this.getHeadersForSheet(sheetName);
    return rawRows.filter((raw) => raw && typeof raw === "object").map((raw, idx) => {
      const dynamicKeys = Object.keys(raw).filter((k) => k !== "_sheetRowNumber");
      const headerSet = new Set(blueprintHeaders);
      dynamicKeys.forEach((k) => headerSet.add(k));
      const headers = Array.from(headerSet);
      const rowValues = headers.map((header) => {
        if (raw[header] !== void 0 && raw[header] !== null) return raw[header];
        const aliases = this.getFieldAliases(sheetName, header);
        for (const alias of aliases) {
          if (raw[alias] !== void 0 && raw[alias] !== null) return raw[alias];
        }
        const cleanHeader = header.toLowerCase().replace(/[^a-z0-9]/g, "");
        for (const recKey of dynamicKeys) {
          if (recKey.toLowerCase().replace(/[^a-z0-9]/g, "") === cleanHeader && raw[recKey] !== void 0 && raw[recKey] !== null) {
            return raw[recKey];
          }
        }
        return "";
      });
      const resolvedRowIndex = typeof raw._sheetRowNumber === "number" && raw._sheetRowNumber >= 2 ? raw._sheetRowNumber - 2 : idx;
      const rec = this.rowToRecord(sheetName, headers, rowValues, resolvedRowIndex);
      const sheetRowNumber = typeof raw._sheetRowNumber === "number" && raw._sheetRowNumber >= 2 ? raw._sheetRowNumber : resolvedRowIndex + 2;
      rec._sheetRowNumber = sheetRowNumber;
      const baseId = String(rec.id || `row_${sheetRowNumber}`);
      if (seenIds.has(baseId)) {
        rec.id = `${baseId}#r${sheetRowNumber}`;
      } else {
        rec.id = baseId;
      }
      seenIds.add(rec.id);
      return rec;
    });
  }
};

// server/services/adminAuthService.ts
import crypto3 from "crypto";

// src/core/utils/rowFieldHelpers.ts
function pickField(row, ...keys) {
  for (const k of keys) {
    const val = row?.[k];
    if (val !== void 0 && val !== null && String(val).trim() !== "") {
      return String(val).trim();
    }
  }
  return "";
}
function normalizeStr(v) {
  return String(v ?? "").trim().toLowerCase();
}

// server/services/serverSheetCache.ts
var SHEET_CACHE_SOFT_TTL_MS = 45e3;
var SHEET_CACHE_STALE_MAX_MS = 6e5;
var SHEET_CACHE_TTL_MS = SHEET_CACHE_SOFT_TTL_MS;
var BACKGROUND_REVALIDATION_LOCK_MAX_MS = 2e4;
var sheetCache = /* @__PURE__ */ new Map();
var inFlightSheetFetches = /* @__PURE__ */ new Map();
var inFlightBackgroundRevalidations = /* @__PURE__ */ new Map();
var siswaIndexCache = /* @__PURE__ */ new Map();
var metadataCacheClearHook = null;
function registerMetadataCacheClearHook(hook) {
  metadataCacheClearHook = hook;
}
function isBackgroundRevalidationActive(cacheKey) {
  const startedAt = inFlightBackgroundRevalidations.get(cacheKey);
  if (!startedAt) return false;
  if (Date.now() - startedAt > BACKGROUND_REVALIDATION_LOCK_MAX_MS) {
    inFlightBackgroundRevalidations.delete(cacheKey);
    return false;
  }
  return true;
}
function invalidateSheetCacheEntry(spreadsheetId, sheetName) {
  sheetCache.delete(`${spreadsheetId}::${sheetName}`);
  if (sheetName === "Master_Siswa_XI" || sheetName === "Master_Siswa") {
    siswaIndexCache.delete(spreadsheetId);
  }
}
async function invalidateServerCaches(sheetParam) {
  if (sheetParam) {
    const cfg = await getFirestoreWorkspaceConfig().catch(() => null);
    if (cfg?.spreadsheetId) {
      invalidateSheetCacheEntry(cfg.spreadsheetId, sheetParam);
      for (const dep of getDependentSheets(sheetParam)) {
        invalidateSheetCacheEntry(cfg.spreadsheetId, dep);
      }
    } else {
      sheetCache.clear();
      siswaIndexCache.clear();
    }
    return;
  }
  invalidateWorkspaceConfigCache();
  sheetCache.clear();
  siswaIndexCache.clear();
  metadataCacheClearHook?.();
}
function getOrBuildSiswaIndex(spreadsheetId, rows) {
  let indexEntry = siswaIndexCache.get(spreadsheetId);
  if (!indexEntry || Date.now() - indexEntry.fetchedAt >= SHEET_CACHE_TTL_MS) {
    const byKey = /* @__PURE__ */ new Map();
    for (const s of rows) {
      const nis = pickField(s, "NIS", "nis");
      const nisDigits = stripNisSymbols(nis);
      const nik = pickField(s, "NIK", "nik");
      const nikDigits = stripNisSymbols(nik);
      if (nis && !byKey.has(nis)) byKey.set(nis, s);
      if (nisDigits && !byKey.has(nisDigits)) byKey.set(nisDigits, s);
      if (nik && !byKey.has(nik)) byKey.set(nik, s);
      if (nikDigits && !byKey.has(nikDigits)) byKey.set(nikDigits, s);
    }
    indexEntry = { byKey, fetchedAt: Date.now() };
    siswaIndexCache.set(spreadsheetId, indexEntry);
  }
  return indexEntry.byKey;
}

// server/services/sheetsApiV4Client.ts
import crypto2 from "crypto";
var SHEETS_API_TIMEOUT_MS = 8e3;
var SHEETS_METADATA_TTL_MS = 3e5;
var sheetsAccessTokenCache = null;
var inFlightSheetsTokenPromise = null;
var sheetMetadataCache = /* @__PURE__ */ new Map();
var inFlightMetadataFetches = /* @__PURE__ */ new Map();
registerMetadataCacheClearHook(() => {
  sheetMetadataCache.clear();
});
var SHEETS_DATE_HEADER_KEYS = /* @__PURE__ */ new Set([
  "tglberangkat",
  "tanggalberangkat",
  "tanggalrencanatarik",
  "tglkirimsurat",
  "tanggalkirimsurat",
  "tglbalasan",
  "tanggalbalasan",
  "tanggalkunjungan",
  "tglkunjungan",
  "tglterbit",
  "tanggalterbit"
]);
var SHEETS_TIMESTAMP_HEADER_KEYS = /* @__PURE__ */ new Set(["timestamp", "updatedat"]);
function normalizeSheetsHeaderKey(key) {
  return String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function getGoogleServiceAccountCreds() {
  try {
    const rawJson = String(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "").trim();
    const rawB64 = String(process.env.GOOGLE_SERVICE_ACCOUNT_B64 || "").trim();
    const jsonText = rawJson || (rawB64 ? Buffer.from(rawB64, "base64").toString("utf8") : "");
    if (jsonText) {
      const parsed = JSON.parse(jsonText);
      const clientEmail = String(parsed?.client_email || "").trim();
      const privateKey = String(parsed?.private_key || "").replace(/\\n/g, "\n").trim();
      if (clientEmail && privateKey) {
        return { clientEmail, privateKey };
      }
    }
  } catch (err) {
    console.warn("[Sheets API v4] Invalid GOOGLE_SERVICE_ACCOUNT_JSON/B64:", err?.message);
  }
  const email = String(process.env.GOOGLE_CLIENT_EMAIL || "").trim();
  const key = String(process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
  if (email && key) {
    return { clientEmail: email, privateKey: key };
  }
  return null;
}
function getGoogleSheetsApiKey() {
  return String(
    process.env.GOOGLE_SHEETS_API_KEY || process.env.GOOGLE_CONSOLE_API_KEY || process.env.GOOGLE_API_KEY || ""
  ).trim();
}
async function resolveGoogleSheetsReadAuth() {
  const sa = getGoogleServiceAccountCreds();
  if (sa) {
    const cacheKey = sa.clientEmail;
    if (sheetsAccessTokenCache && sheetsAccessTokenCache.cacheKey === cacheKey && Date.now() < sheetsAccessTokenCache.expiresAt - 6e4) {
      return { mode: "bearer", token: sheetsAccessTokenCache.token };
    }
    if (!inFlightSheetsTokenPromise) {
      inFlightSheetsTokenPromise = (async () => {
        try {
          const nowSec = Math.floor(Date.now() / 1e3);
          const headerB64 = Buffer.from(
            JSON.stringify({ alg: "RS256", typ: "JWT" }),
            "utf8"
          ).toString("base64url");
          const claimB64 = Buffer.from(
            JSON.stringify({
              iss: sa.clientEmail,
              scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
              aud: "https://oauth2.googleapis.com/token",
              iat: nowSec,
              exp: nowSec + 3600
            }),
            "utf8"
          ).toString("base64url");
          const unsignedJwt = `${headerB64}.${claimB64}`;
          const signer = crypto2.createSign("RSA-SHA256");
          signer.update(unsignedJwt);
          signer.end();
          const signatureB64 = signer.sign(sa.privateKey, "base64url");
          const assertion = `${unsignedJwt}.${signatureB64}`;
          const tokenRes = await fetchWithTimeout(
            "https://oauth2.googleapis.com/token",
            {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: `grant_type=${encodeURIComponent(
                "urn:ietf:params:oauth:grant-type:jwt-bearer"
              )}&assertion=${encodeURIComponent(assertion)}`
            },
            SHEETS_API_TIMEOUT_MS
          );
          if (!tokenRes.ok) {
            const errTxt = await tokenRes.text().catch(() => "");
            console.warn(
              `[Sheets API v4] OAuth token failed (${tokenRes.status}): ${errTxt.slice(0, 120)}`
            );
            return null;
          }
          const tokenJson = await tokenRes.json();
          const accessToken = String(tokenJson?.access_token || "").trim();
          const expiresIn = Number(tokenJson?.expires_in || 3600);
          if (!accessToken) return null;
          sheetsAccessTokenCache = {
            token: accessToken,
            expiresAt: Date.now() + expiresIn * 1e3,
            cacheKey
          };
          return accessToken;
        } catch (err) {
          console.warn("[Sheets API v4] Token exchange error:", err?.message);
          return null;
        } finally {
          inFlightSheetsTokenPromise = null;
        }
      })();
    }
    const token = await inFlightSheetsTokenPromise;
    if (token) {
      return { mode: "bearer", token };
    }
  }
  const apiKey = getGoogleSheetsApiKey();
  if (apiKey) {
    return { mode: "apikey", apiKey };
  }
  return null;
}
function buildSheetsApiRequest(baseUrl, auth) {
  if (auth.mode === "bearer") {
    return {
      url: baseUrl,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${auth.token}`
      }
    };
  }
  const sep = baseUrl.includes("?") ? "&" : "?";
  return {
    url: `${baseUrl}${sep}key=${encodeURIComponent(auth.apiKey)}`,
    headers: { Accept: "application/json" }
  };
}
function resolveActualTabName(requestedSheet, existingTabs) {
  if (existingTabs.includes(requestedSheet)) return requestedSheet;
  const lowerMap = new Map(existingTabs.map((t) => [t.toLowerCase(), t]));
  const exactCi = lowerMap.get(requestedSheet.toLowerCase());
  if (exactCi) return exactCi;
  if (requestedSheet === "Master_Siswa_XI" || requestedSheet === "Master_Siswa") {
    return lowerMap.get("master_siswa_xi") || lowerMap.get("master_siswa") || null;
  }
  if (requestedSheet === "Monitoring_5_Tahap" || requestedSheet === "Monitoring_6_Tahap" || requestedSheet === "Monitoring_8_Tahap" || requestedSheet === "Monitoring_PKL") {
    return lowerMap.get("monitoring_5_tahap") || lowerMap.get("monitoring_6_tahap") || lowerMap.get("monitoring_8_tahap") || lowerMap.get("monitoring_pkl") || null;
  }
  return null;
}
async function getSpreadsheetMetadataViaApiV4(spreadsheetId, auth, forceRefresh = false) {
  const cached = sheetMetadataCache.get(spreadsheetId);
  if (!forceRefresh && cached && Date.now() - cached.fetchedAt < SHEETS_METADATA_TTL_MS) {
    return { title: cached.title, tabNames: cached.tabNames };
  }
  if (!forceRefresh) {
    const inflight = inFlightMetadataFetches.get(spreadsheetId);
    if (inflight) return inflight;
  }
  const p = (async () => {
    const { url, headers } = buildSheetsApiRequest(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}?fields=properties.title,sheets.properties.title`,
      auth
    );
    const res = await fetchWithTimeout(url, { method: "GET", headers }, SHEETS_API_TIMEOUT_MS);
    if (!res.ok) {
      const errTxt = await res.text().catch(() => "");
      throw new Error(`Sheets metadata HTTP ${res.status}: ${errTxt.slice(0, 120)}`);
    }
    const json = await res.json();
    const title = String(json?.properties?.title || "").trim();
    const tabNames = Array.isArray(json?.sheets) ? json.sheets.map((s) => String(s?.properties?.title || "").trim()).filter(Boolean) : [];
    sheetMetadataCache.set(spreadsheetId, { title, tabNames, fetchedAt: Date.now() });
    return { title, tabNames };
  })();
  if (!forceRefresh) {
    inFlightMetadataFetches.set(spreadsheetId, p);
  }
  try {
    return await p;
  } finally {
    if (inFlightMetadataFetches.get(spreadsheetId) === p) {
      inFlightMetadataFetches.delete(spreadsheetId);
    }
  }
}
function formatSheetsSerialNumber(serial, includeTime) {
  const totalSeconds = Math.round(serial * 86400);
  const d = new Date(Date.UTC(1899, 11, 30) + totalSeconds * 1e3);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  if (!includeTime) {
    return `${yyyy}-${mm}-${dd}`;
  }
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}
function convertSheetsValuesMatrixToRows(values) {
  if (!Array.isArray(values) || values.length < 2) return [];
  const rawHeaders = Array.isArray(values[0]) ? values[0] : [];
  const headers = rawHeaders.map((h) => String(h ?? "").trim());
  if (headers.every((h) => !h)) return [];
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const rawRow = Array.isArray(values[i]) ? values[i] : [];
    const row = {};
    let hasValue = false;
    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      if (!header) continue;
      let cellVal = rawRow[j] !== void 0 && rawRow[j] !== null ? rawRow[j] : "";
      const hNorm = normalizeSheetsHeaderKey(header);
      if (typeof cellVal === "number" && Number.isFinite(cellVal)) {
        if (SHEETS_TIMESTAMP_HEADER_KEYS.has(hNorm) && cellVal > 2e4 && cellVal < 9e4) {
          cellVal = formatSheetsSerialNumber(cellVal, true);
        } else if (SHEETS_DATE_HEADER_KEYS.has(hNorm) && cellVal > 2e4 && cellVal < 9e4) {
          cellVal = formatSheetsSerialNumber(cellVal, false);
        }
      } else if (typeof cellVal === "string" && SHEETS_DATE_HEADER_KEYS.has(hNorm) && cellVal.trim() !== "") {
        const iso = normalizeToIsoDate(cellVal);
        if (iso) cellVal = iso;
      }
      row[header] = cellVal;
      if (String(cellVal).trim() !== "") {
        hasValue = true;
      }
    }
    if (hasValue) {
      row._sheetRowNumber = i + 1;
      rows.push(row);
    }
  }
  return rows;
}
async function tryFetchBatchSheetsViaApiV4(spreadsheetId, requestedSheets, optionalSheets, forceRefresh = false) {
  const auth = await resolveGoogleSheetsReadAuth();
  if (!auth) return null;
  try {
    const meta = await getSpreadsheetMetadataViaApiV4(spreadsheetId, auth, forceRefresh);
    const results = {};
    const resolvedEntries = [];
    for (const reqName of requestedSheets) {
      const actualTab = resolveActualTabName(reqName, meta.tabNames);
      if (!actualTab) {
        if (reqName === "Master_Akun" || optionalSheets.has(reqName)) {
          results[reqName] = [];
          continue;
        }
        return null;
      }
      resolvedEntries.push({ requestedName: reqName, actualTab });
    }
    if (resolvedEntries.length === 0) {
      return results;
    }
    const uniqueTabs = Array.from(new Set(resolvedEntries.map((e) => e.actualTab)));
    const rangesQuery = uniqueTabs.map((tab) => `ranges=${encodeURIComponent(`'${tab.replace(/'/g, "''")}'`)}`).join("&");
    const batchBaseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values:batchGet?${rangesQuery}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER&majorDimension=ROWS`;
    const { url, headers } = buildSheetsApiRequest(batchBaseUrl, auth);
    const res = await fetchWithTimeout(url, { method: "GET", headers }, SHEETS_API_TIMEOUT_MS);
    if (!res.ok) {
      const errTxt = await res.text().catch(() => "");
      console.warn(`[Sheets API v4] batchGet HTTP ${res.status}: ${errTxt.slice(0, 140)}`);
      return null;
    }
    const json = await res.json();
    const valueRanges = Array.isArray(json?.valueRanges) ? json.valueRanges : [];
    const rowsByActualTab = /* @__PURE__ */ new Map();
    uniqueTabs.forEach((tabName, idx) => {
      const vr = valueRanges[idx];
      const matrix = Array.isArray(vr?.values) ? vr.values : [];
      rowsByActualTab.set(tabName, convertSheetsValuesMatrixToRows(matrix));
    });
    for (const entry of resolvedEntries) {
      results[entry.requestedName] = rowsByActualTab.get(entry.actualTab) || [];
    }
    return results;
  } catch (err) {
    console.warn("[Sheets API v4] Fallback to GAS:", err?.message);
    return null;
  }
}

// server/services/gasHttpTransport.ts
function validateGasUrl(rawUrl) {
  const trimmed = normalizeServerGasUrl(rawUrl);
  if (!trimmed) {
    throw new PortalConfigError(
      "GAS_NOT_CONFIGURED",
      "Endpoint URL Cloud Server belum diatur oleh Admin Hubin untuk akses portal publik."
    );
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new PortalConfigError(
      "GAS_INVALID_URL",
      "Endpoint URL Cloud Server tidak valid. Harus diawali https://...",
      502
    );
  }
  if (/script\.google\.com\/home\/projects\//i.test(trimmed) || /\/edit(\?|$|#)/i.test(trimmed)) {
    throw new PortalConfigError(
      "GAS_INVALID_URL",
      'Link yang ditempel adalah link editor (/edit), bukan Endpoint URL aktif. Klik Deploy -> New deployment -> pilih Web app -> salin URL "/exec".',
      502
    );
  }
  if (/\/dev(\?|$)/i.test(trimmed)) {
    throw new PortalConfigError(
      "GAS_INVALID_URL",
      'Endpoint URL masih menggunakan "/dev" yang memerlukan login internal. Gunakan URL deployment resmi yang berakhiran "/exec" dengan akses publik.',
      502
    );
  }
  if (/script\.google\.com/i.test(trimmed) && !/\/exec(\?|$)/i.test(trimmed)) {
    throw new PortalConfigError(
      "GAS_INVALID_URL",
      'Endpoint URL Cloud Server harus berakhiran "/exec". Salin ulang URL resmi dari Konfigurasi Server.',
      502
    );
  }
  return trimmed;
}
function parseGasJsonSafely(rawText, sheetName, status) {
  const trimmed = String(rawText || "").trim();
  if (!trimmed) {
    return {};
  }
  const looksLikeHtml = trimmed.startsWith("<") || trimmed.toLowerCase().startsWith("<!doctype") || trimmed.toLowerCase().includes("<html");
  if (looksLikeHtml) {
    const isGoogleAuth = trimmed.includes("accounts.google.com") || trimmed.includes("ServiceLogin") || trimmed.includes("Sign in");
    throw new PortalConfigError(
      "GAS_AUTH_REQUIRED",
      isGoogleAuth ? `Cloud Server mengembalikan halaman otorisasi untuk tabel [${sheetName}]. Pastikan endpoint server di-deploy dengan akses "Siapa saja (Anyone)" dan URL berakhiran "/exec".` : `Cloud Server mengembalikan respon HTML error (HTTP ${status}) untuk tabel [${sheetName}]. Periksa deployment Endpoint Server "/exec".`,
      502
    );
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new PortalConfigError(
      "GAS_INVALID_RESPONSE",
      `Respon Cloud Server untuk [${sheetName}] bukan JSON valid: ${trimmed.slice(0, 120)}`,
      502
    );
  }
}
function triggerBackgroundSheetRefresh(sheetName, cacheKey) {
  if (isBackgroundRevalidationActive(cacheKey) || inFlightSheetFetches.has(cacheKey)) {
    return;
  }
  inFlightBackgroundRevalidations.set(cacheKey, Date.now());
  void fetchLiveSheetViaGas(sheetName, true).catch(() => {
  }).finally(() => {
    inFlightBackgroundRevalidations.delete(cacheKey);
  });
}
async function fetchLiveSheetViaGas(sheetName, forceRefresh = false) {
  const config = await getFirestoreWorkspaceConfig(forceRefresh);
  if (!config.spreadsheetId) {
    throw new PortalConfigError(
      "SPREADSHEET_NOT_CONFIGURED",
      "ID Database Cloud Server belum dikonfigurasi oleh Admin Hubin."
    );
  }
  const cacheKey = `${config.spreadsheetId}::${sheetName}`;
  const cached = sheetCache.get(cacheKey);
  if (!forceRefresh && cached) {
    const age = Date.now() - cached.fetchedAt;
    if (age < SHEET_CACHE_SOFT_TTL_MS) {
      return { rows: cached.data, config };
    }
    if (age < SHEET_CACHE_STALE_MAX_MS) {
      triggerBackgroundSheetRefresh(sheetName, cacheKey);
      return { rows: cached.data, config };
    }
  }
  if (!forceRefresh) {
    const existingFlight = inFlightSheetFetches.get(cacheKey);
    if (existingFlight) {
      return existingFlight;
    }
  }
  const fetchPromise = (async () => {
    const apiV4Batch = await tryFetchBatchSheetsViaApiV4(
      config.spreadsheetId,
      [sheetName],
      new Set(sheetName === "Master_Akun" ? ["Master_Akun"] : []),
      forceRefresh
    );
    if (apiV4Batch && Array.isArray(apiV4Batch[sheetName])) {
      const rows2 = apiV4Batch[sheetName];
      sheetCache.set(cacheKey, { data: rows2, fetchedAt: Date.now() });
      return { rows: rows2, config };
    }
    const gasUrl = validateGasUrl(config.gasDeployUrl);
    const separator = gasUrl.includes("?") ? "&" : "?";
    const freshSuffix = forceRefresh ? `&fresh=1&_ts=${Date.now()}` : "";
    const targetUrl = `${gasUrl}${separator}sheet=${encodeURIComponent(
      sheetName
    )}&year=${encodeURIComponent(config.activeYear)}&spreadsheetId=${encodeURIComponent(
      config.spreadsheetId
    )}${freshSuffix}`;
    let gasRes;
    try {
      gasRes = await fetchWithTimeout(
        targetUrl,
        {
          method: "GET",
          headers: { Accept: "application/json" },
          redirect: "follow"
        },
        GAS_FETCH_TIMEOUT_MS
      );
    } catch (err) {
      if (err instanceof PortalConfigError) throw err;
      throw new PortalConfigError(
        "GAS_FETCH_FAILED",
        `Server gagal menghubungi Endpoint Cloud Server (${err?.message || "network error"}). Periksa konfigurasi URL "/exec" dan pastikan akses deployment aktif.`,
        502
      );
    }
    const rawText = await gasRes.text();
    if (!gasRes.ok) {
      parseGasJsonSafely(rawText, sheetName, gasRes.status);
      throw new PortalConfigError(
        "GAS_FETCH_FAILED",
        `Gagal membaca tabel [${sheetName}] dari Cloud Server (HTTP ${gasRes.status}).`,
        502
      );
    }
    const json = parseGasJsonSafely(rawText, sheetName, gasRes.status);
    if (json?.error) {
      throw new PortalConfigError("GAS_ERROR", String(json.error), 502);
    }
    const rows = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
    sheetCache.set(cacheKey, { data: rows, fetchedAt: Date.now() });
    return { rows, config };
  })();
  if (!forceRefresh) {
    inFlightSheetFetches.set(cacheKey, fetchPromise);
  }
  try {
    return await fetchPromise;
  } finally {
    if (inFlightSheetFetches.get(cacheKey) === fetchPromise) {
      inFlightSheetFetches.delete(cacheKey);
    }
  }
}
async function fetchBatchSheetsViaGas(sheetNames, optionalSheets = /* @__PURE__ */ new Set(), forceRefresh = false) {
  const config = await getFirestoreWorkspaceConfig(forceRefresh);
  if (!config.spreadsheetId) {
    throw new PortalConfigError(
      "SPREADSHEET_NOT_CONFIGURED",
      "ID Database Cloud Server belum dikonfigurasi oleh Admin Hubin."
    );
  }
  const sheetsResult = {};
  const missingSheets = [];
  const staleSheets = [];
  const now = Date.now();
  for (const name of sheetNames) {
    const cacheKey = `${config.spreadsheetId}::${name}`;
    const cached = sheetCache.get(cacheKey);
    if (!forceRefresh && cached) {
      const age = now - cached.fetchedAt;
      if (age < SHEET_CACHE_SOFT_TTL_MS) {
        sheetsResult[name] = cached.data;
        continue;
      }
      if (age < SHEET_CACHE_STALE_MAX_MS) {
        sheetsResult[name] = cached.data;
        if (!isBackgroundRevalidationActive(cacheKey)) {
          staleSheets.push(name);
        }
        continue;
      }
    }
    missingSheets.push(name);
  }
  if (staleSheets.length > 0 && !forceRefresh) {
    const staleKeys = staleSheets.map((n) => `${config.spreadsheetId}::${n}`);
    const lockTs = Date.now();
    staleKeys.forEach((k) => inFlightBackgroundRevalidations.set(k, lockTs));
    void fetchBatchSheetsViaGas(staleSheets, optionalSheets, true).catch(() => {
    }).finally(() => {
      staleKeys.forEach((k) => inFlightBackgroundRevalidations.delete(k));
    });
  }
  if (missingSheets.length === 0) {
    return { sheets: sheetsResult, config };
  }
  const apiV4Results = await tryFetchBatchSheetsViaApiV4(
    config.spreadsheetId,
    missingSheets,
    optionalSheets,
    forceRefresh
  );
  if (apiV4Results) {
    const batchFetchedAt = Date.now();
    for (const name of missingSheets) {
      const rows = Array.isArray(apiV4Results[name]) ? apiV4Results[name] : [];
      sheetsResult[name] = rows;
      sheetCache.set(`${config.spreadsheetId}::${name}`, {
        data: rows,
        fetchedAt: batchFetchedAt
      });
    }
    return { sheets: sheetsResult, config };
  }
  const gasUrl = validateGasUrl(config.gasDeployUrl);
  if (missingSheets.length > 1) {
    try {
      const separator = gasUrl.includes("?") ? "&" : "?";
      const freshSuffix = forceRefresh ? `&fresh=1&_ts=${Date.now()}` : "";
      const batchUrl = `${gasUrl}${separator}action=BATCH_GET&sheets=${encodeURIComponent(
        missingSheets.join(",")
      )}&year=${encodeURIComponent(config.activeYear)}&spreadsheetId=${encodeURIComponent(
        config.spreadsheetId
      )}${freshSuffix}`;
      const gasRes = await fetchWithTimeout(
        batchUrl,
        {
          method: "GET",
          headers: { Accept: "application/json" },
          redirect: "follow"
        },
        GAS_FETCH_TIMEOUT_MS
      );
      if (gasRes.ok) {
        const rawText = await gasRes.text();
        const json = parseGasJsonSafely(rawText, missingSheets.join(","), gasRes.status);
        if (json?.status === "success" && json?.sheets && typeof json.sheets === "object") {
          const batchFetchedAt = Date.now();
          for (const name of missingSheets) {
            const rows = Array.isArray(json.sheets[name]) ? json.sheets[name] : [];
            sheetsResult[name] = rows;
            sheetCache.set(`${config.spreadsheetId}::${name}`, {
              data: rows,
              fetchedAt: batchFetchedAt
            });
          }
          return { sheets: sheetsResult, config };
        }
      }
    } catch (err) {
      if (err instanceof PortalConfigError && err.code === "GAS_TIMEOUT") {
        throw err;
      }
    }
  }
  await Promise.all(
    missingSheets.map(async (name) => {
      try {
        const res = await fetchLiveSheetViaGas(name, forceRefresh);
        sheetsResult[name] = res.rows;
      } catch (err) {
        if (optionalSheets.has(name)) {
          sheetsResult[name] = [];
        } else {
          throw err;
        }
      }
    })
  );
  return { sheets: sheetsResult, config };
}
async function fetchMasterSiswaRows(forceRefresh = false) {
  try {
    const primary = await fetchLiveSheetViaGas("Master_Siswa_XI", forceRefresh);
    if (primary.rows.length > 0) {
      return primary;
    }
    const fallback = await fetchLiveSheetViaGas("Master_Siswa", forceRefresh).catch(() => null);
    return fallback && fallback.rows.length > 0 ? fallback : primary;
  } catch (err) {
    if (err instanceof PortalConfigError && err.code === "GAS_ERROR") {
      return fetchLiveSheetViaGas("Master_Siswa", forceRefresh);
    }
    throw err;
  }
}
async function writeLiveSheetViaGas(sheetName, action, payload) {
  const config = await getFirestoreWorkspaceConfig();
  if (!config.spreadsheetId) {
    throw new PortalConfigError(
      "SPREADSHEET_NOT_CONFIGURED",
      "ID Database Cloud Server belum dikonfigurasi oleh Admin Hubin."
    );
  }
  const gasUrl = validateGasUrl(config.gasDeployUrl);
  const rawId = payload && typeof payload === "object" && !Array.isArray(payload) ? payload.id || payload.deletedRow?.id || payload.updatedRow?.id || "" : "";
  const hashMatch = String(rawId || "").trim().match(/^(.*)#r(\d+)$/);
  const cleanId = hashMatch ? hashMatch[1].trim() : String(rawId || "").trim();
  const sheetRowNumber = (payload && typeof payload === "object" && !Array.isArray(payload) ? Number(
    payload._sheetRowNumber || payload.deletedRow?._sheetRowNumber || payload.updatedRow?._sheetRowNumber || 0
  ) : 0) || (hashMatch ? Number(hashMatch[2]) : 0);
  const sheetSvc = GoogleDriveSheetService.getInstance();
  let sanitizedPayload = payload;
  if ((action === "CREATE" || action === "UPDATE") && payload && typeof payload === "object" && !Array.isArray(payload)) {
    sanitizedPayload = sheetSvc.stripFormulaManagedFields(sheetName, payload);
  } else if ((action === "BULK_UPDATE" || action === "IMPORT") && Array.isArray(payload)) {
    sanitizedPayload = payload.map(
      (item) => item && typeof item === "object" ? sheetSvc.stripFormulaManagedFields(sheetName, item) : item
    );
  } else if (action === "BULK_UPDATE" && payload && typeof payload === "object" && (Array.isArray(payload.updatedRows) || Array.isArray(payload.rows))) {
    sanitizedPayload = {
      ...payload,
      ...Array.isArray(payload.updatedRows) ? {
        updatedRows: payload.updatedRows.map(
          (item) => item && typeof item === "object" ? sheetSvc.stripFormulaManagedFields(sheetName, item) : item
        )
      } : {},
      ...Array.isArray(payload.rows) ? {
        rows: payload.rows.map(
          (item) => item && typeof item === "object" ? sheetSvc.stripFormulaManagedFields(sheetName, item) : item
        )
      } : {}
    };
  }
  let gasRes;
  try {
    gasRes = await fetchWithTimeout(
      gasUrl,
      {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        redirect: "follow",
        body: JSON.stringify({
          action,
          sheetName,
          year: config.activeYear,
          spreadsheetId: config.spreadsheetId,
          id: cleanId || rawId,
          sheetRowNumber: sheetRowNumber >= 2 ? sheetRowNumber : void 0,
          data: sanitizedPayload,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        })
      },
      2e4
    );
  } catch (err) {
    if (err instanceof PortalConfigError) throw err;
    throw new PortalConfigError(
      "GAS_WRITE_FAILED",
      `Server gagal mengirim data ke Endpoint Cloud Server (${err?.message || "network error"}). Periksa konfigurasi URL "/exec".`,
      502
    );
  }
  const rawText = await gasRes.text();
  const json = parseGasJsonSafely(rawText, sheetName, gasRes.status);
  if (!gasRes.ok) {
    throw new PortalConfigError(
      "GAS_WRITE_FAILED",
      `Gagal menulis ke Cloud Server [${sheetName}] (HTTP ${gasRes.status}).`,
      502
    );
  }
  if (json?.error) {
    throw new PortalConfigError("GAS_WRITE_ERROR", String(json.error), 502);
  }
  invalidateSheetCacheEntry(config.spreadsheetId, sheetName);
  if (sheetName === "Master_Siswa_XI" || sheetName === "Master_Siswa") {
    siswaIndexCache.delete(config.spreadsheetId);
    invalidateSheetCacheEntry(config.spreadsheetId, "Master_Siswa_XI");
    invalidateSheetCacheEntry(config.spreadsheetId, "Master_Siswa");
  }
  for (const dep of getDependentSheets(sheetName)) {
    invalidateSheetCacheEntry(config.spreadsheetId, dep);
  }
  return {
    verified: json?.verified !== false,
    savedId: typeof json?.savedId === "string" ? json.savedId : String(cleanId || rawId || ""),
    sheetRowNumber: typeof json?.sheetRowNumber === "number" && json.sheetRowNumber >= 2 ? json.sheetRowNumber : void 0,
    savedAt: typeof json?.savedAt === "string" && json.savedAt ? json.savedAt : (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function callGasCustomAction(action, extraBody = {}, timeoutMs = 25e3) {
  const config = await getFirestoreWorkspaceConfig();
  if (!config.spreadsheetId && !extraBody?.targetSpreadsheetId && String(action || "").toUpperCase() !== "CREATE_YEARLY_SPREADSHEET") {
    throw new PortalConfigError(
      "SPREADSHEET_NOT_CONFIGURED",
      "ID Database Cloud Server belum dikonfigurasi oleh Admin Hubin."
    );
  }
  const gasUrl = validateGasUrl(config.gasDeployUrl);
  let gasRes;
  try {
    gasRes = await fetchWithTimeout(
      gasUrl,
      {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        redirect: "follow",
        body: JSON.stringify({
          action,
          year: config.activeYear,
          spreadsheetId: config.spreadsheetId,
          driveFolderUrl: config.driveFolderUrl,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          ...extraBody
        })
      },
      timeoutMs
    );
  } catch (err) {
    if (err instanceof PortalConfigError) throw err;
    throw new PortalConfigError(
      "GAS_WRITE_FAILED",
      `Server gagal menjalankan aksi [${action}] pada Cloud Server (${err?.message || "network error"}).`,
      502
    );
  }
  const rawText = await gasRes.text();
  const json = parseGasJsonSafely(rawText, action, gasRes.status);
  if (!gasRes.ok) {
    throw new PortalConfigError(
      "GAS_WRITE_FAILED",
      `Cloud Server mengembalikan error HTTP ${gasRes.status} saat menjalankan aksi [${action}].`,
      502
    );
  }
  if (json?.error) {
    throw new PortalConfigError("GAS_WRITE_ERROR", String(json.error), 502);
  }
  return { data: json, config };
}

// server/services/adminAuthService.ts
var ROLE_TITLE_MAP = {
  SuperAdmin: "Super Administrator Sistem & Server",
  Hubin: "Koordinator Pokja Hubin & Kerjasama DUDI",
  Kepsek: "Kepala Sekolah SMK PGRI 2 Ponorogo",
  Waka: "Wakil Kepala Sekolah Bidang Hubin",
  Pokja: "Tim Pokja Hubin & Pendamping PKL",
  Kakomli: "Ketua Konsentrasi Keahlian (Kakomli)"
};
var DEFAULT_ADMIN_SEED = [
  {
    id: "AKN-SUPERADMIN",
    username: "superadmin",
    defaultPassword: "SuperAdmin@2026",
    role: "SuperAdmin",
    namaLengkap: "Super Admin Sistem",
    jabatan: ROLE_TITLE_MAP.SuperAdmin
  },
  {
    id: "AKN-HUBIN",
    username: "hubin",
    defaultPassword: "Hubin@2026",
    role: "Hubin",
    namaLengkap: "Admin Pokja Hubin",
    jabatan: ROLE_TITLE_MAP.Hubin
  },
  {
    id: "AKN-KEPSEK",
    username: "kepsek",
    defaultPassword: "Kepsek@2026",
    role: "Kepsek",
    namaLengkap: "Kepala Sekolah",
    jabatan: ROLE_TITLE_MAP.Kepsek
  },
  {
    id: "AKN-WAKA",
    username: "waka",
    defaultPassword: "Waka@2026",
    role: "Waka",
    namaLengkap: "Waka Bidang Hubin",
    jabatan: ROLE_TITLE_MAP.Waka
  },
  {
    id: "AKN-POKJA",
    username: "pokja",
    defaultPassword: "Pokja@2026",
    role: "Pokja",
    namaLengkap: "Staf Pokja Hubin",
    jabatan: ROLE_TITLE_MAP.Pokja
  },
  {
    id: "AKN-KAKOMLI",
    username: "kakomli",
    defaultPassword: "Kakomli@2026",
    role: "Kakomli",
    namaLengkap: "Ketua Kompetensi Keahlian",
    jabatan: ROLE_TITLE_MAP.Kakomli
  }
];
function getSessionSecret() {
  return process.env.SESSION_SECRET || crypto3.createHash("sha256").update(`${firebaseCfg.projectId}:${firebaseCfg.apiKey}:hubin-sterida-session-v1`).digest("hex");
}
function hashPasswordServer(plainPassword, customSalt) {
  const salt = customSalt || crypto3.randomBytes(12).toString("hex");
  const digest = crypto3.createHash("sha256").update(`${salt}:${plainPassword}`).digest("hex");
  return `sha256$${salt}$${digest}`;
}
function verifyPasswordServer(plainPassword, storedHash) {
  const trimmed = String(storedHash || "").trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("sha256$")) {
    const parts = trimmed.split("$");
    if (parts.length !== 3) return false;
    const [, salt, expectedHex] = parts;
    const actualHex = crypto3.createHash("sha256").update(`${salt}:${plainPassword}`).digest("hex");
    const a = Buffer.from(actualHex, "utf8");
    const b = Buffer.from(expectedHex, "utf8");
    return a.length === b.length && crypto3.timingSafeEqual(a, b);
  }
  return plainPassword === trimmed;
}
function signAdminSessionToken(payload) {
  const full = {
    ...payload,
    exp: Date.now() + 24 * 60 * 60 * 1e3
  };
  const encoded = Buffer.from(JSON.stringify(full), "utf8").toString("base64url");
  const sig = crypto3.createHmac("sha256", getSessionSecret()).update(encoded).digest("base64url");
  return `hb1.${encoded}.${sig}`;
}
function verifyAdminSessionToken(token) {
  if (!token.startsWith("hb1.")) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [, encoded, sig] = parts;
  const expectedSig = crypto3.createHmac("sha256", getSessionSecret()).update(encoded).digest("base64url");
  const sigBuf = Buffer.from(sig, "utf8");
  const expBuf = Buffer.from(expectedSig, "utf8");
  if (sigBuf.length !== expBuf.length || !crypto3.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!decoded?.username || !decoded?.exp || Date.now() > decoded.exp) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}
function buildDefaultAdminRecords() {
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  return DEFAULT_ADMIN_SEED.map((d) => ({
    id: d.id,
    username: d.username,
    passwordHash: hashPasswordServer(d.defaultPassword, `${d.username}_salt_2026`),
    role: d.role,
    namaLengkap: d.namaLengkap,
    jabatan: d.jabatan,
    status: "Aktif",
    updatedAt: nowIso,
    isDefaultSeed: true
  }));
}
function normalizeAccountRecord(raw, idx) {
  const username = pickField(raw, "Username", "username").toLowerCase();
  if (!username) return null;
  const validRoles = ["SuperAdmin", "Hubin", "Kepsek", "Waka", "Pokja", "Kakomli"];
  const rawRole = pickField(raw, "Role", "role") || "Pokja";
  const role = validRoles.includes(rawRole) ? rawRole : "Pokja";
  const rawStatus = pickField(raw, "Status", "status").toLowerCase();
  return {
    id: pickField(raw, "ID", "id") || `AKN-${idx + 1}`,
    username,
    passwordHash: pickField(raw, "Password_Hash", "passwordHash", "password_hash"),
    role,
    namaLengkap: pickField(raw, "Nama_Lengkap", "namaLengkap", "nama") || username,
    jabatan: pickField(raw, "Jabatan", "jabatan") || ROLE_TITLE_MAP[role] || role,
    status: rawStatus === "nonaktif" ? "Nonaktif" : "Aktif",
    updatedAt: pickField(raw, "Updated_At", "updatedAt"),
    isDefaultSeed: false
  };
}
async function fetchMasterAkunFromGasOrDefaults(forceRefresh = false) {
  try {
    const { rows } = await fetchLiveSheetViaGas("Master_Akun", forceRefresh);
    const parsed = rows.map((r, i) => normalizeAccountRecord(r, i)).filter((a) => a !== null);
    if (parsed.length > 0) {
      return { accounts: parsed, syncedToSheet: true };
    }
  } catch (err) {
    const msg = String(err?.message || "").toLowerCase();
    const isFallbackable = msg.includes("tidak ditemukan") || msg.includes("not found") || err?.code === "GAS_NOT_CONFIGURED" || err?.code === "SPREADSHEET_NOT_CONFIGURED";
    if (!isFallbackable) {
      console.warn("[Master_Akun] GAS read fallback to defaults:", err?.message);
    }
  }
  return { accounts: buildDefaultAdminRecords(), syncedToSheet: false };
}
async function requireAdminAuth(req) {
  const authHeader = String(req.headers.authorization || "");
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) {
    throw new PortalConfigError(
      "UNAUTHORIZED",
      "Sesi login pengelola tidak ditemukan. Silakan masuk kembali.",
      401
    );
  }
  const token = match[1].trim();
  const localSession = verifyAdminSessionToken(token);
  if (localSession) {
    return {
      id: localSession.id,
      username: localSession.username,
      role: localSession.role,
      name: localSession.name
    };
  }
  if (!firebaseCfg.apiKey || !firebaseCfg.projectId) {
    throw new PortalConfigError("UNAUTHORIZED", "Token sesi tidak valid atau kedaluwarsa.", 401);
  }
  const lookupRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseCfg.apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token })
    }
  );
  if (!lookupRes.ok) {
    throw new PortalConfigError("UNAUTHORIZED", "Sesi login telah berakhir. Silakan masuk ulang.", 401);
  }
  const lookupJson = await lookupRes.json();
  const fbUser = lookupJson?.users?.[0];
  const uid = String(fbUser?.localId || "");
  const email = String(fbUser?.email || "");
  const emailVerified = Boolean(fbUser?.emailVerified);
  if (!uid || !emailVerified) {
    throw new PortalConfigError("FORBIDDEN", "Akun tidak terverifikasi.", 403);
  }
  if (email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase()) {
    return { id: uid, username: email, role: "SuperAdmin", name: fbUser?.displayName || email };
  }
  const adminDocUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    firebaseCfg.projectId
  )}/databases/${encodeURIComponent(firebaseCfg.firestoreDatabaseId)}/documents/admins/${encodeURIComponent(uid)}`;
  const adminRes = await fetch(adminDocUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
  });
  if (!adminRes.ok) {
    throw new PortalConfigError(
      "FORBIDDEN",
      `Akun (${email}) tidak terdaftar sebagai Admin Hubin terotorisasi.`,
      403
    );
  }
  return { id: uid, username: email, role: "Hubin", name: fbUser?.displayName || email };
}

// server/routes/adminRoutes.ts
var SAFE_ROLLOVER_MASTER_SHEETS = /* @__PURE__ */ new Set([
  "Master_Akun",
  "Master_Jurusan",
  "Master_Guru_Pendamping",
  "Master_DUDI",
  "Master_Kelas_Walas"
]);
function registerAdminRoutes(app2) {
  app2.post("/api/admin/login", async (req, res) => {
    try {
      const username = String(req.body?.username || "").trim().toLowerCase();
      const password = String(req.body?.password || "");
      if (!username || !password) {
        return res.status(400).json({
          success: false,
          message: "Username dan Password wajib diisi."
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
          message: `Username "${username}" tidak ditemukan.`
        });
      }
      if (matched.status === "Nonaktif") {
        return res.status(403).json({
          success: false,
          message: `Akun "${username}" sedang dinonaktifkan oleh Admin Hubin.`
        });
      }
      if (!verifyPasswordServer(password, matched.passwordHash)) {
        return res.status(401).json({
          success: false,
          message: "Password yang Anda masukkan tidak sesuai."
        });
      }
      const sessionToken = signAdminSessionToken({
        id: matched.id,
        username: matched.username,
        role: matched.role,
        name: matched.namaLengkap
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
          email: "",
          identifier: matched.username,
          canManageSpreadsheet: matched.role === "SuperAdmin"
        }
      });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
  app2.get("/api/admin/accounts", async (req, res) => {
    try {
      const session = await requireAdminAuth(req);
      const { accounts, syncedToSheet } = await fetchMasterAkunFromGasOrDefaults(true);
      const visible = session.role === "SuperAdmin" ? accounts : accounts.filter((a) => a.id === session.id || a.username === session.username);
      res.json({
        success: true,
        syncedToSheet,
        accounts: visible.map(({ passwordHash: _omit, ...rest }) => rest)
      });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
  app2.post("/api/admin/accounts", async (req, res) => {
    try {
      const session = await requireAdminAuth(req);
      const body = req.body || {};
      if (Array.isArray(body.accounts)) {
        if (session.role !== "SuperAdmin" && body.accounts.length > 1) {
          return res.status(403).json({
            success: false,
            message: "Hanya peran SuperAdmin yang dapat mengelola seluruh daftar akun."
          });
        }
        await writeLiveSheetViaGas("Master_Akun", "SYNC_ALL", body.accounts);
        const cfg2 = await getFirestoreWorkspaceConfig();
        if (cfg2.spreadsheetId) {
          invalidateSheetCacheEntry(cfg2.spreadsheetId, "Master_Akun");
        }
        return res.json({ success: true });
      }
      const op = String(body.op || "UPSERT").toUpperCase();
      const { accounts: currentAccounts } = await fetchMasterAkunFromGasOrDefaults(true);
      let working = currentAccounts.map((a) => ({ ...a }));
      if (op === "BOOTSTRAP") {
        if (session.role !== "SuperAdmin") {
          return res.status(403).json({ success: false, message: "Hanya SuperAdmin yang dapat inisialisasi akun." });
        }
        working = working.map((a) => ({ ...a, isDefaultSeed: false }));
      } else if (op === "DELETE") {
        if (session.role !== "SuperAdmin") {
          return res.status(403).json({ success: false, message: "Hanya SuperAdmin yang dapat menghapus akun." });
        }
        const targetId = String(body.id || "").trim();
        const target = working.find((a) => a.id === targetId);
        if (target) {
          const remainingSuperAdmin = working.filter(
            (a) => a.id !== targetId && a.role === "SuperAdmin" && a.status === "Aktif"
          );
          if (target.role === "SuperAdmin" && remainingSuperAdmin.length === 0) {
            return res.status(400).json({
              success: false,
              message: "Minimal harus ada 1 akun SuperAdmin aktif."
            });
          }
          working = working.filter((a) => a.id !== targetId);
        }
      } else {
        const cleanUsername = String(body.username || "").trim().toLowerCase();
        if (!/^[a-z0-9._-]{3,32}$/.test(cleanUsername)) {
          return res.status(400).json({
            success: false,
            message: "Username harus 3\u201332 karakter (huruf kecil, angka, titik, underscore, atau strip)."
          });
        }
        const targetId = String(body.id || "").trim();
        const existingIdx = working.findIndex(
          (a) => targetId && a.id === targetId || a.username === cleanUsername
        );
        if (session.role !== "SuperAdmin") {
          if (existingIdx === -1 || working[existingIdx].id !== session.id) {
            return res.status(403).json({
              success: false,
              message: "Anda hanya dapat mengubah username & password akun Anda sendiri."
            });
          }
        }
        const duplicate = working.find((a, idx) => a.username === cleanUsername && idx !== existingIdx);
        if (duplicate) {
          return res.status(400).json({
            success: false,
            message: `Username "${cleanUsername}" sudah dipakai oleh akun lain.`
          });
        }
        const newPassword = String(body.newPassword || "").trim();
        let passwordHash = existingIdx !== -1 ? working[existingIdx].passwordHash : "";
        if (newPassword) {
          if (newPassword.length < 6) {
            return res.status(400).json({
              success: false,
              message: "Password baru minimal 6 karakter."
            });
          }
          passwordHash = hashPasswordServer(newPassword);
        } else if (!passwordHash) {
          return res.status(400).json({
            success: false,
            message: "Password wajib diisi untuk akun baru."
          });
        }
        const requestedRole = session.role === "SuperAdmin" ? String(body.role || (existingIdx !== -1 ? working[existingIdx].role : "Pokja")) : working[existingIdx].role;
        const updatedRow = {
          id: targetId || (existingIdx !== -1 ? working[existingIdx].id : `AKN-${Date.now().toString(36).toUpperCase()}`),
          username: cleanUsername,
          passwordHash,
          role: requestedRole,
          namaLengkap: String(body.namaLengkap || "").trim() || cleanUsername,
          jabatan: String(body.jabatan || "").trim() || ROLE_TITLE_MAP[requestedRole] || requestedRole,
          status: session.role === "SuperAdmin" && String(body.status || "").toLowerCase() === "nonaktif" ? "Nonaktif" : "Aktif",
          updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          isDefaultSeed: false
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
        Updated_At: a.updatedAt || (/* @__PURE__ */ new Date()).toISOString()
      }));
      await writeLiveSheetViaGas("Master_Akun", "SYNC_ALL", rowsPayload);
      const cfg = await getFirestoreWorkspaceConfig();
      if (cfg.spreadsheetId) {
        invalidateSheetCacheEntry(cfg.spreadsheetId, "Master_Akun");
      }
      return res.json({
        success: true,
        syncedToSheet: true,
        accounts: working.map(({ passwordHash: _omit, ...rest }) => rest)
      });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
  app2.post("/api/cache/invalidate", async (req, res) => {
    try {
      await requireAdminAuth(req);
      const sheetParam = String(req.query.sheet || req.body?.sheet || "").trim();
      await invalidateServerCaches(sheetParam || void 0);
      res.json({ success: true, scope: sheetParam || "all" });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
  app2.get("/api/admin/gas-ping", async (req, res) => {
    try {
      await requireAdminAuth(req);
      const cfg = await getFirestoreWorkspaceConfig(true);
      const customGas = String(req.query.gasUrl || "").trim();
      const customSpreadsheetId = String(req.query.spreadsheetId || "").trim();
      const targetSpreadsheetId = customSpreadsheetId || cfg.spreadsheetId;
      const gasUrl = validateGasUrl(customGas || cfg.gasDeployUrl);
      if (!targetSpreadsheetId && !customGas) {
        throw new PortalConfigError(
          "SPREADSHEET_NOT_CONFIGURED",
          "ID Database Cloud Server belum dikonfigurasi oleh Admin Hubin."
        );
      }
      const sep = gasUrl.includes("?") ? "&" : "?";
      const sidParam = targetSpreadsheetId ? `&spreadsheetId=${encodeURIComponent(targetSpreadsheetId)}` : "";
      const pingUrl = `${gasUrl}${sep}action=PING&sheet=Master_Jurusan&year=${encodeURIComponent(
        cfg.activeYear
      )}${sidParam}`;
      let gasRes;
      try {
        gasRes = await fetchWithTimeout(
          pingUrl,
          {
            method: "GET",
            headers: { Accept: "application/json" },
            redirect: "follow"
          },
          GAS_FETCH_TIMEOUT_MS
        );
      } catch (err) {
        if (err instanceof PortalConfigError) throw err;
        throw new PortalConfigError(
          "GAS_FETCH_FAILED",
          `Gagal menghubungi Endpoint Cloud Server (${err?.message || "network error"}). Pastikan URL berakhiran "/exec" dan akses server aktif.`,
          502
        );
      }
      const rawText = await gasRes.text();
      const json = parseGasJsonSafely(rawText, "PING", gasRes.status);
      if (!gasRes.ok || json?.error) {
        throw new PortalConfigError(
          "GAS_ERROR",
          String(json?.error || `Server PING gagal (HTTP ${gasRes.status})`),
          502
        );
      }
      res.json({
        success: true,
        spreadsheetId: targetSpreadsheetId,
        title: json?.title || cfg.spreadsheetName || targetSpreadsheetId,
        sheets: Array.isArray(json?.sheets) ? json.sheets : []
      });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
  app2.get("/api/admin/sheet", async (req, res) => {
    try {
      const session = await requireAdminAuth(req);
      const sheetName = String(req.query.sheet || "").trim();
      const fresh = String(req.query.fresh || "") === "1";
      if (!sheetName) {
        return res.status(400).json({ success: false, message: "Parameter tabel wajib diisi." });
      }
      if (!ALLOWED_ADMIN_SHEETS.has(sheetName)) {
        return res.status(400).json({ success: false, message: `Tabel [${sheetName}] tidak terdaftar.` });
      }
      if (sheetName.toLowerCase() === "master_akun" && session.role !== "SuperAdmin") {
        return res.status(403).json({
          success: false,
          code: "FORBIDDEN",
          message: "Akses tabel Master_Akun hanya diperbolehkan untuk peran SuperAdmin."
        });
      }
      const { rows, config } = await fetchLiveSheetViaGas(sheetName, fresh);
      res.json({
        success: true,
        sheetName,
        spreadsheetId: config.spreadsheetId,
        data: rows
      });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
  app2.post("/api/admin/sheet", async (req, res) => {
    try {
      const session = await requireAdminAuth(req);
      const { sheetName, action, data } = req.body || {};
      const targetSheet = String(sheetName || "").trim();
      const normalizedAction = String(action || "").toUpperCase();
      const validActions = /* @__PURE__ */ new Set([
        "CREATE",
        "UPDATE",
        "DELETE",
        "BULK_DELETE",
        "BULK_UPDATE",
        "IMPORT",
        "SYNC_ALL"
      ]);
      if (!targetSheet || !validActions.has(normalizedAction)) {
        return res.status(400).json({
          success: false,
          message: "Parameter tabel dan aksi tidak valid."
        });
      }
      if (!ALLOWED_ADMIN_SHEETS.has(targetSheet)) {
        return res.status(400).json({
          success: false,
          message: `Tabel [${targetSheet}] tidak diizinkan untuk dimodifikasi.`
        });
      }
      if (targetSheet.toLowerCase() === "master_akun" && session.role !== "SuperAdmin") {
        return res.status(403).json({
          success: false,
          code: "FORBIDDEN",
          message: "Hanya SuperAdmin yang berhak mengubah data Master_Akun."
        });
      }
      if (normalizedAction === "SYNC_ALL" && session.role !== "SuperAdmin" && session.role !== "Hubin") {
        return res.status(403).json({
          success: false,
          code: "FORBIDDEN",
          message: "Operasi sinkronisasi penuh (SYNC_ALL) hanya diperbolehkan untuk SuperAdmin atau Admin Hubin."
        });
      }
      await writeLiveSheetViaGas(targetSheet, normalizedAction, data);
      res.json({ success: true });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
  app2.post("/api/admin/rollover-year", async (req, res) => {
    try {
      const session = await requireAdminAuth(req);
      if (session.role !== "SuperAdmin") {
        return res.status(403).json({
          success: false,
          code: "FORBIDDEN",
          message: "Hanya peran SuperAdmin yang berhak membuka Tahun Ajaran baru dan menggandakan master."
        });
      }
      const rawYear = String(req.body?.year || "").trim();
      if (!/^[0-9]{4}\/[0-9]{4}$/.test(rawYear)) {
        return res.status(400).json({
          success: false,
          message: "Format Tahun Ajaran wajib YYYY/YYYY (contoh: 2027/2028)."
        });
      }
      const rawTargetId = String(req.body?.targetSpreadsheetId || "").trim();
      const targetMatch = rawTargetId.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
      const targetSpreadsheetId = targetMatch && targetMatch[1] ? targetMatch[1] : rawTargetId;
      const cleanYear = rawYear.replace(/\//g, "_");
      const spreadsheetTitle = String(req.body?.spreadsheetTitle || "").trim() || `Hubin_SMK_PGRI_2_Ponorogo_${cleanYear}`;
      const requestedSheets = Array.isArray(req.body?.copySheets) ? req.body.copySheets.map((s) => String(s || "").trim()).filter((s) => SAFE_ROLLOVER_MASTER_SHEETS.has(s)) : [];
      const selectedSheets = Array.from(new Set(requestedSheets));
      const cfg = await getFirestoreWorkspaceConfig(true);
      const seedSheets = {};
      if (selectedSheets.length > 0 && cfg.spreadsheetId) {
        const sheetSvc = GoogleDriveSheetService.getInstance();
        const { sheets } = await fetchBatchSheetsViaGas(
          selectedSheets,
          /* @__PURE__ */ new Set(["Master_Akun"]),
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
      const { data: gasResult } = await callGasCustomAction(
        "CREATE_YEARLY_SPREADSHEET",
        {
          year: rawYear,
          spreadsheetTitle,
          targetSpreadsheetId: targetSpreadsheetId || void 0,
          driveFolderUrl: cfg.driveFolderUrl || "",
          seedSheets
        },
        45e3
      );
      if (!gasResult?.spreadsheetId) {
        throw new PortalConfigError(
          "GAS_ROLLOVER_INCOMPLETE",
          "Endpoint Cloud Server belum mengembalikan ID Spreadsheet baru. Pastikan skrip API GAS sudah diperbarui ke versi terbaru.",
          502
        );
      }
      await invalidateServerCaches();
      return res.json({
        success: true,
        year: rawYear,
        spreadsheetId: gasResult.spreadsheetId,
        spreadsheetName: gasResult.spreadsheetName || spreadsheetTitle,
        spreadsheetUrl: gasResult.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${gasResult.spreadsheetId}`,
        driveFolderUrl: gasResult.driveFolderUrl || cfg.driveFolderUrl || "",
        seededCounts: gasResult.seededCounts || {},
        plantedFormulas: Number(gasResult.plantedFormulas || 0)
      });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
}

// server/services/relationRecalculator.ts
async function recalculateAllRelations(scopeParam = "all", forceRefresh = false) {
  const scope = String(scopeParam || "all").toLowerCase();
  const neededTables = [
    "Master_Siswa_XI",
    "Master_DUDI",
    "Master_Guru_Pendamping",
    "Master_Jurusan",
    "Master_Kelas_Walas",
    "Data_Pengajuan_PKL",
    "Data_Perizinan_PKL",
    "Plotting_Pemberangkatan",
    "Monitoring_5_Tahap",
    "Nilai_Dan_Sertifikat"
  ];
  const { sheets } = await fetchBatchSheetsViaGas(
    neededTables,
    /* @__PURE__ */ new Set([
      "Data_Pengajuan_PKL",
      "Data_Perizinan_PKL",
      "Plotting_Pemberangkatan",
      "Monitoring_5_Tahap",
      "Nilai_Dan_Sertifikat"
    ]),
    forceRefresh
  );
  const siswaList = sheets["Master_Siswa_XI"] || [];
  const dudiList = sheets["Master_DUDI"] || [];
  const guruList = sheets["Master_Guru_Pendamping"] || [];
  const jurusanList = sheets["Master_Jurusan"] || [];
  const kelasList = sheets["Master_Kelas_Walas"] || [];
  const pengajuanList = sheets["Data_Pengajuan_PKL"] || [];
  const perizinanList = sheets["Data_Perizinan_PKL"] || [];
  const placements = sheets["Plotting_Pemberangkatan"] || [];
  const monitoringList = sheets["Monitoring_5_Tahap"] || [];
  const sertifikatList = sheets["Nilai_Dan_Sertifikat"] || [];
  const norm = (v) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const jurCodeByKey = /* @__PURE__ */ new Map();
  for (const j of jurusanList) {
    const nama = pickField(j, "Nama_Jurusan", "namaJurusan", "nama");
    const kode = (pickField(j, "Kode", "Kode_Jurusan", "kode", "id") || "").toUpperCase();
    if (kode) {
      jurCodeByKey.set(norm(kode), kode);
      if (nama) jurCodeByKey.set(norm(nama), kode);
    }
  }
  const resolveCanonicalJurusanCode = (rawVal) => {
    const str = String(rawVal ?? "").trim();
    if (!str) return "";
    return jurCodeByKey.get(norm(str)) || generateJurusanCode(str) || "";
  };
  const dudiById = /* @__PURE__ */ new Map();
  const dudiByName = /* @__PURE__ */ new Map();
  for (const d of dudiList) {
    const id = pickField(d, "ID", "ID_DUDI", "idDudi", "id");
    const nama = pickField(d, "Nama_DUDI", "namaDudi");
    if (id) dudiById.set(id, d);
    if (nama) dudiByName.set(norm(nama), d);
  }
  const guruById = /* @__PURE__ */ new Map();
  const guruNameCount = /* @__PURE__ */ new Map();
  const guruByName = /* @__PURE__ */ new Map();
  for (const g of guruList) {
    const id = pickField(g, "ID", "ID_Guru", "idGuru", "id");
    const nama = pickField(g, "Nama_Lengkap", "Nama_Guru", "namaGuru", "nama");
    if (id) guruById.set(id, g);
    if (nama) {
      const nk = norm(nama);
      guruNameCount.set(nk, (guruNameCount.get(nk) || 0) + 1);
      guruByName.set(nk, g);
    }
  }
  const resolveCanonicalGuruId = (idVal, namaVal) => {
    if (idVal && guruById.has(idVal)) return idVal;
    const nk = namaVal ? norm(namaVal) : "";
    if (nk && guruNameCount.get(nk) === 1) {
      const matched = guruByName.get(nk);
      return pickField(matched, "ID", "ID_Guru", "idGuru", "id");
    }
    return "";
  };
  const placementByNis = /* @__PURE__ */ new Map();
  const activePlacementNis = /* @__PURE__ */ new Set();
  const completedPlacementNis = /* @__PURE__ */ new Set();
  const CLOSED_STATUSES = /* @__PURE__ */ new Set(["dibatalkan", "batal", "pindah dudi", "selesai pkl"]);
  for (const p of placements) {
    const pNis = stripNisSymbols(pickField(p, "NIS", "nis"));
    if (!pNis) continue;
    const st = norm(pickField(p, "Status_Penempatan", "statusPenempatan"));
    if (st === "selesai pkl") {
      completedPlacementNis.add(pNis);
    } else if (!CLOSED_STATUSES.has(st)) {
      activePlacementNis.add(pNis);
      placementByNis.set(pNis, p);
    } else if (!placementByNis.has(pNis)) {
      placementByNis.set(pNis, p);
    }
  }
  const flushBulkUpdates = async (sheetName, rows) => {
    if (!rows.length) return 0;
    const CHUNK = 150;
    let applied = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const res = await writeLiveSheetViaGas(sheetName, "BULK_UPDATE", {
        ids: chunk.map((r) => r.id),
        updatedRows: chunk
      }).then(() => true).catch(() => false);
      if (res) applied += chunk.length;
    }
    return applied;
  };
  let updatedPlacements = 0;
  let updatedDudi = 0;
  const updatedGuru = 0;
  let updatedJurusan = 0;
  let updatedKelas = 0;
  const dudiUpdates = [];
  const kelasUpdates = [];
  const siswaUpdates = [];
  const pengajuanUpdates = [];
  const perizinanUpdates = [];
  const placementUpdates = [];
  const monitoringUpdates = [];
  const sertifikatUpdates = [];
  if (scope === "all" || scope === "guru" || scope === "dudi") {
    for (const d of dudiList) {
      const dId = pickField(d, "ID", "ID_DUDI", "idDudi", "id");
      if (!dId) continue;
      const dGuruId = pickField(d, "ID_Guru_Pendamping", "idGuruPendamping");
      const dGuruName = pickField(d, "Guru_Pendamping", "guruPendamping");
      const resolvedGuruId = resolveCanonicalGuruId(dGuruId, dGuruName);
      if (resolvedGuruId && resolvedGuruId !== dGuruId) {
        dudiUpdates.push({
          id: dId,
          ID: dId,
          _sheetRowNumber: d._sheetRowNumber,
          ID_Guru_Pendamping: resolvedGuruId,
          idGuruPendamping: resolvedGuruId
        });
        d.ID_Guru_Pendamping = resolvedGuruId;
      }
    }
  }
  if (scope === "all" || scope === "kelas" || scope === "siswa" || scope === "jurusan") {
    for (const k of kelasList) {
      const kId = pickField(k, "ID", "ID_Kelas", "idKelas", "id");
      if (!kId) continue;
      const currCode = pickField(k, "ID_Jurusan", "idJurusan");
      const jurName = pickField(k, "Jurusan", "jurusan") || pickField(k, "Nama_Kelas", "namaKelas");
      const canonicalCode = resolveCanonicalJurusanCode(currCode || jurName);
      if (canonicalCode && canonicalCode !== currCode) {
        kelasUpdates.push({
          id: kId,
          ID: kId,
          _sheetRowNumber: k._sheetRowNumber,
          ID_Jurusan: canonicalCode,
          idJurusan: canonicalCode
        });
      }
    }
    for (const s of siswaList) {
      const sId = pickField(s, "ID", "id", "NIS", "nis");
      if (!sId) continue;
      const nisDigits = stripNisSymbols(pickField(s, "NIS", "nis"));
      const currJur = pickField(s, "ID_Jurusan", "idJurusan", "jurusan");
      const canonicalJur = resolveCanonicalJurusanCode(currJur);
      const currStatus = pickField(s, "Status_PKL", "statusPKL");
      let nextStatus = currStatus;
      if (nisDigits) {
        if (activePlacementNis.has(nisDigits) && ["belum daftar", "diajukan", "menunggu acc", ""].includes(norm(currStatus))) {
          nextStatus = "Aktif PKL";
        } else if (!activePlacementNis.has(nisDigits) && completedPlacementNis.has(nisDigits) && norm(currStatus) !== "selesai pkl") {
          nextStatus = "Selesai PKL";
        }
      }
      const needsJurFix = Boolean(canonicalJur && canonicalJur !== currJur);
      const needsStatusFix = Boolean(nextStatus && nextStatus !== currStatus);
      if (needsJurFix || needsStatusFix) {
        siswaUpdates.push({
          id: sId,
          ID: sId,
          _sheetRowNumber: s._sheetRowNumber,
          ...needsJurFix ? { ID_Jurusan: canonicalJur, idJurusan: canonicalJur } : {},
          ...needsStatusFix ? { Status_PKL: nextStatus, statusPKL: nextStatus } : {}
        });
      }
    }
  }
  if (scope === "all" || scope === "placements" || scope === "siswa_pkl" || scope === "pengajuan" || scope === "perizinan") {
    for (const pq of pengajuanList) {
      const pqId = pickField(pq, "No_Pengajuan", "noPengajuan", "id");
      if (!pqId) continue;
      const currDudiId = pickField(pq, "ID_DUDI", "idDudi");
      const dudiName = pickField(pq, "DUDI_Tujuan", "dudiTujuan");
      const matchedDudi = currDudiId && dudiById.get(currDudiId) || dudiName && dudiByName.get(norm(dudiName));
      const nextDudiId = matchedDudi ? pickField(matchedDudi, "ID", "id") : currDudiId;
      const currGuruId = pickField(pq, "ID_Guru_Pendamping", "idGuruPendamping");
      const guruName = pickField(pq, "Guru_Pendamping", "guruPendamping");
      const nextGuruId = resolveCanonicalGuruId(currGuruId, guruName) || (matchedDudi ? pickField(matchedDudi, "ID_Guru_Pendamping", "idGuruPendamping") : "");
      if (nextDudiId && nextDudiId !== currDudiId || nextGuruId && nextGuruId !== currGuruId) {
        pengajuanUpdates.push({
          id: pqId,
          No_Pengajuan: pqId,
          _sheetRowNumber: pq._sheetRowNumber,
          ...nextDudiId ? { ID_DUDI: nextDudiId, idDudi: nextDudiId } : {},
          ...nextGuruId ? { ID_Guru_Pendamping: nextGuruId, idGuruPendamping: nextGuruId } : {}
        });
      }
    }
    for (const iz of perizinanList) {
      const izId = pickField(iz, "ID_Perizinan", "noPerizinan", "id");
      if (!izId) continue;
      const currDudiId = pickField(iz, "ID_DUDI", "idDudi");
      const dudiName = pickField(iz, "DUDI_Tujuan", "dudiTujuan");
      const matchedDudi = !currDudiId && dudiName ? dudiByName.get(norm(dudiName)) : void 0;
      const nextDudiId = matchedDudi ? pickField(matchedDudi, "ID", "id") : "";
      if (nextDudiId && nextDudiId !== currDudiId) {
        perizinanUpdates.push({
          id: izId,
          ID_Perizinan: izId,
          _sheetRowNumber: iz._sheetRowNumber,
          ID_DUDI: nextDudiId,
          idDudi: nextDudiId
        });
      }
    }
    for (const p of placements) {
      const pId = pickField(p, "ID_Penempatan", "idPenempatan", "id");
      if (!pId) continue;
      const currDudiId = pickField(p, "ID_DUDI", "idDudi");
      const dudiName = pickField(p, "Nama_DUDI", "namaDudi", "DUDI_Tujuan");
      const matchedDudi = currDudiId && dudiById.get(currDudiId) || dudiName && dudiByName.get(norm(dudiName));
      const nextDudiId = matchedDudi ? pickField(matchedDudi, "ID", "id") : currDudiId;
      const currGuruId = pickField(p, "ID_Guru_Pendamping", "idGuruPendamping");
      const guruName = pickField(p, "Guru_Pendamping", "guruPendamping");
      const nextGuruId = resolveCanonicalGuruId(currGuruId, guruName) || (matchedDudi ? pickField(matchedDudi, "ID_Guru_Pendamping", "idGuruPendamping") : "");
      if (nextDudiId && nextDudiId !== currDudiId || nextGuruId && nextGuruId !== currGuruId) {
        placementUpdates.push({
          id: pId,
          ID_Penempatan: pId,
          _sheetRowNumber: p._sheetRowNumber,
          ...nextDudiId ? { ID_DUDI: nextDudiId, idDudi: nextDudiId } : {},
          ...nextGuruId ? { ID_Guru_Pendamping: nextGuruId, idGuruPendamping: nextGuruId } : {}
        });
      }
    }
  }
  if (scope === "all" || scope === "monitoring" || scope === "sertifikat") {
    for (const m of monitoringList) {
      const mId = pickField(m, "ID_Monitoring", "idMonitoring", "id");
      if (!mId) continue;
      const nisDigits = stripNisSymbols(pickField(m, "NIS", "nis"));
      const plt = nisDigits ? placementByNis.get(nisDigits) : void 0;
      const currPltId = pickField(m, "ID_Penempatan", "idPenempatan");
      const nextPltId = currPltId || (plt ? pickField(plt, "ID_Penempatan", "idPenempatan", "id") : "");
      const currDudiId = pickField(m, "ID_DUDI", "idDudi");
      const dudiName = pickField(m, "DUDI_Tujuan", "dudiTujuan");
      const matchedDudi = currDudiId && dudiById.get(currDudiId) || dudiName && dudiByName.get(norm(dudiName));
      const nextDudiId = (matchedDudi ? pickField(matchedDudi, "ID", "id") : "") || (plt ? pickField(plt, "ID_DUDI", "idDudi") : "") || currDudiId;
      const currGuruId = pickField(m, "ID_Guru_Pendamping", "idGuruPendamping");
      const guruName = pickField(m, "Guru_Pendamping", "guruPendamping");
      const nextGuruId = resolveCanonicalGuruId(currGuruId, guruName) || (plt ? pickField(plt, "ID_Guru_Pendamping", "idGuruPendamping") : "") || (matchedDudi ? pickField(matchedDudi, "ID_Guru_Pendamping", "idGuruPendamping") : "");
      if (nextPltId && nextPltId !== currPltId || nextDudiId && nextDudiId !== currDudiId || nextGuruId && nextGuruId !== currGuruId) {
        monitoringUpdates.push({
          id: mId,
          ID_Monitoring: mId,
          _sheetRowNumber: m._sheetRowNumber,
          ...nextPltId ? { ID_Penempatan: nextPltId, idPenempatan: nextPltId } : {},
          ...nextDudiId ? { ID_DUDI: nextDudiId, idDudi: nextDudiId } : {},
          ...nextGuruId ? { ID_Guru_Pendamping: nextGuruId, idGuruPendamping: nextGuruId } : {}
        });
      }
    }
    for (const sr of sertifikatList) {
      const srId = pickField(sr, "ID_Penempatan", "idPenempatan", "id");
      if (!srId) continue;
      const nisDigits = stripNisSymbols(pickField(sr, "NIS", "nis"));
      const plt = nisDigits ? placementByNis.get(nisDigits) : void 0;
      const currDudiId = pickField(sr, "ID_DUDI", "idDudi");
      const dudiName = pickField(sr, "DUDI_Tujuan", "dudiTujuan");
      const matchedDudi = currDudiId && dudiById.get(currDudiId) || dudiName && dudiByName.get(norm(dudiName));
      const nextDudiId = (matchedDudi ? pickField(matchedDudi, "ID", "id") : "") || (plt ? pickField(plt, "ID_DUDI", "idDudi") : "") || currDudiId;
      if (nextDudiId && nextDudiId !== currDudiId) {
        sertifikatUpdates.push({
          id: srId,
          ID_Penempatan: srId,
          _sheetRowNumber: sr._sheetRowNumber,
          ID_DUDI: nextDudiId,
          idDudi: nextDudiId
        });
      }
    }
  }
  updatedDudi = await flushBulkUpdates("Master_DUDI", dudiUpdates);
  updatedKelas = await flushBulkUpdates("Master_Kelas_Walas", kelasUpdates);
  updatedJurusan = await flushBulkUpdates("Master_Siswa_XI", siswaUpdates);
  await flushBulkUpdates("Data_Pengajuan_PKL", pengajuanUpdates);
  await flushBulkUpdates("Data_Perizinan_PKL", perizinanUpdates);
  updatedPlacements = await flushBulkUpdates("Plotting_Pemberangkatan", placementUpdates);
  await flushBulkUpdates("Monitoring_5_Tahap", monitoringUpdates);
  await flushBulkUpdates("Nilai_Dan_Sertifikat", sertifikatUpdates);
  let formulasApplied = false;
  if (scope === "all") {
    const migRes = await callGasCustomAction("MIGRATE_RELATIONAL_FORMULAS").catch(() => null);
    formulasApplied = Boolean(migRes?.data?.status === "success");
  }
  await invalidateServerCaches();
  return {
    updatedPlacements,
    updatedDudi,
    updatedGuru,
    updatedJurusan,
    updatedKelas,
    formulasApplied
  };
}

// server/routes/restApiRoutes.ts
function ensureRestMutationAllowed(res, role, tableName, verb) {
  const lowerTable = tableName.toLowerCase();
  if (lowerTable === "master_akun" && role !== "SuperAdmin") {
    res.status(403).json({
      success: false,
      code: "FORBIDDEN",
      message: "Akses ubah akun hanya diperbolehkan untuk peran SuperAdmin."
    });
    return false;
  }
  if (role === "SuperAdmin" || role === "Hubin" || role === "Pokja") {
    return true;
  }
  if (role === "Kepsek") {
    res.status(403).json({
      success: false,
      code: "FORBIDDEN",
      message: "Peran Kepala Sekolah berada pada mode pantau (hanya baca & cetak)."
    });
    return false;
  }
  if (role === "Waka") {
    if (lowerTable === "monitoring_5_tahap" && verb === "UPDATE") {
      return true;
    }
    res.status(403).json({
      success: false,
      code: "FORBIDDEN",
      message: "Peran Waka hanya berhak melakukan verifikasi Hubin pada data Monitoring PKL."
    });
    return false;
  }
  if (role === "GuruPendamping") {
    if (lowerTable === "monitoring_5_tahap" && (verb === "CREATE" || verb === "UPDATE")) {
      return true;
    }
    res.status(403).json({
      success: false,
      code: "FORBIDDEN",
      message: "Peran Guru Pendamping hanya berhak mengisi/memperbarui data Monitoring PKL."
    });
    return false;
  }
  if (role === "Kakomli") {
    const allowedKakomliWrite = lowerTable === "monitoring_5_tahap" && verb === "UPDATE" || lowerTable === "data_pengajuan_pkl" && (verb === "UPDATE" || verb === "BULK_UPDATE") || lowerTable === "master_siswa_xi" && (verb === "UPDATE" || verb === "BULK_UPDATE") || lowerTable === "data_perizinan_pkl" && (verb === "CREATE" || verb === "IMPORT");
    if (allowedKakomliWrite) {
      return true;
    }
    res.status(403).json({
      success: false,
      code: "FORBIDDEN",
      message: "Peran Kakomli hanya berhak memverifikasi Pengajuan PKL dan Monitoring jurusan."
    });
    return false;
  }
  res.status(403).json({
    success: false,
    code: "FORBIDDEN",
    message: "Peran Anda tidak memiliki izin untuk mengubah data ini."
  });
  return false;
}
function registerRestApiRoutes(app2) {
  app2.get("/api/v1/bootstrap", async (req, res) => {
    try {
      const session = await requireAdminAuth(req);
      const fresh = String(req.query.fresh || "") === "1";
      const tablesParam = String(req.query.tables || "").trim();
      const requestedTables = tablesParam ? tablesParam.split(",").map((t) => resolveRestTableName(t) || t.trim()).filter((t) => ALLOWED_ADMIN_SHEETS.has(t)) : DEFAULT_ADMIN_BOOTSTRAP_TABLES;
      const authorizedTables = requestedTables.filter(
        (t) => t.toLowerCase() !== "master_akun" || session.role === "SuperAdmin"
      );
      const optionalSet = new Set(authorizedTables);
      const { sheets, config } = await fetchBatchSheetsViaGas(authorizedTables, optionalSet, fresh);
      const etags = {};
      for (const table of authorizedTables) {
        etags[table] = computeWeakEtag({
          s: config.spreadsheetId,
          y: config.activeYear,
          t: table,
          d: sheets[table] || []
        });
      }
      const bundleEtag = computeWeakEtag({ s: config.spreadsheetId, y: config.activeYear, etags });
      res.setHeader("ETag", bundleEtag);
      if (!fresh && isEtagMatched(req, bundleEtag)) {
        return res.status(304).end();
      }
      return res.json({
        success: true,
        spreadsheetId: config.spreadsheetId,
        activeYear: config.activeYear,
        etag: bundleEtag,
        etags,
        tables: sheets
      });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
  app2.post("/api/v1/relations/recalculate", async (req, res) => {
    try {
      const session = await requireAdminAuth(req);
      if (session.role !== "SuperAdmin" && session.role !== "Hubin" && session.role !== "Pokja") {
        return res.status(403).json({
          success: false,
          code: "FORBIDDEN",
          message: "Sinkronisasi relasi data hanya diperbolehkan untuk SuperAdmin, Admin Hubin, atau Pokja."
        });
      }
      const scope = String(req.body?.scope || "all");
      const forceRefresh = Boolean(req.body?.forceRefresh);
      const summary = await recalculateAllRelations(scope, forceRefresh);
      return res.json({ success: true, summary });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
  app2.get("/api/v1/:resource", async (req, res) => {
    try {
      const session = await requireAdminAuth(req);
      const tableName = resolveRestTableName(req.params.resource);
      if (!tableName) {
        return res.status(404).json({
          success: false,
          message: `Resource [${req.params.resource}] tidak ditemukan.`
        });
      }
      if (tableName.toLowerCase() === "master_akun" && session.role !== "SuperAdmin") {
        return res.status(403).json({
          success: false,
          code: "FORBIDDEN",
          message: "Akses resource akun hanya diperbolehkan untuk peran SuperAdmin."
        });
      }
      const fresh = String(req.query.fresh || "") === "1";
      const { rows, config } = await fetchLiveSheetViaGas(tableName, fresh);
      let filtered = rows;
      const rawQ = String(req.query.q || "").trim();
      const q = rawQ.toLowerCase();
      const qDigits = !/[a-z]/i.test(rawQ) ? stripNisSymbols(rawQ) : "";
      if (q || qDigits.length >= 3) {
        filtered = filtered.filter(
          (row) => Object.entries(row || {}).some(([k, v]) => {
            if (v === null || v === void 0) return false;
            const str = String(v);
            if (q && str.toLowerCase().includes(q)) return true;
            if (qDigits.length >= 3 && (k.toLowerCase().includes("nis") || k.toLowerCase().includes("nik") || k.toLowerCase().includes("siswa"))) {
              return stripNisSymbols(str).includes(qDigits);
            }
            return false;
          })
        );
      }
      const sortCol = String(req.query.sort || "").trim();
      const sortDir = String(req.query.order || "asc").toLowerCase() === "desc" ? -1 : 1;
      if (sortCol) {
        filtered = [...filtered].sort((a, b) => {
          const va = a?.[sortCol];
          const vb = b?.[sortCol];
          if (va === vb) return 0;
          if (va === null || va === void 0) return 1;
          if (vb === null || vb === void 0) return -1;
          if (typeof va === "number" && typeof vb === "number") return (va - vb) * sortDir;
          return String(va).localeCompare(String(vb), void 0, { numeric: true }) * sortDir;
        });
      }
      const total = filtered.length;
      const page = Number(req.query.page || 0);
      const limit = Number(req.query.limit || 0);
      const isPaginated = page > 0 && limit > 0;
      const slicedData = isPaginated ? filtered.slice((page - 1) * limit, page * limit) : filtered;
      const fieldsParam = String(req.query.fields || "").trim();
      const requestedFields = fieldsParam ? Array.from(
        /* @__PURE__ */ new Set([
          "id",
          "_sheetRowNumber",
          ...fieldsParam.split(",").map((f) => f.trim()).filter(Boolean)
        ])
      ) : null;
      const resultData = requestedFields ? slicedData.map((row) => {
        if (!row || typeof row !== "object") return row;
        const projected = {};
        for (const key of requestedFields) {
          if (key in row) {
            projected[key] = row[key];
          }
        }
        return projected;
      }) : slicedData;
      const etag = computeWeakEtag({
        s: config.spreadsheetId,
        y: config.activeYear,
        t: tableName,
        q,
        sortCol,
        sortDir,
        page,
        limit,
        fields: fieldsParam,
        data: resultData
      });
      res.setHeader("ETag", etag);
      if (!fresh && isEtagMatched(req, etag)) {
        return res.status(304).end();
      }
      return res.json({
        success: true,
        resource: req.params.resource,
        tableName,
        spreadsheetId: config.spreadsheetId,
        etag,
        data: resultData,
        meta: {
          total,
          page: isPaginated ? page : 1,
          limit: isPaginated ? limit : total,
          totalPages: isPaginated ? Math.max(1, Math.ceil(total / limit)) : 1
        }
      });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
  app2.get("/api/v1/:resource/:id", async (req, res) => {
    try {
      const session = await requireAdminAuth(req);
      const tableName = resolveRestTableName(req.params.resource);
      if (!tableName) {
        return res.status(404).json({
          success: false,
          message: `Resource [${req.params.resource}] tidak ditemukan.`
        });
      }
      if (tableName.toLowerCase() === "master_akun" && session.role !== "SuperAdmin") {
        return res.status(403).json({
          success: false,
          code: "FORBIDDEN",
          message: "Akses resource akun hanya diperbolehkan untuk peran SuperAdmin."
        });
      }
      const { rows, config } = await fetchLiveSheetViaGas(tableName, false);
      const item = rows.find((r) => matchRowById(r, String(req.params.id || "").trim()));
      if (!item) {
        return res.status(404).json({
          success: false,
          message: `Data dengan ID [${req.params.id}] tidak ditemukan.`
        });
      }
      const etag = computeWeakEtag({ s: config.spreadsheetId, t: tableName, item });
      res.setHeader("ETag", etag);
      if (isEtagMatched(req, etag)) {
        return res.status(304).end();
      }
      return res.json({
        success: true,
        resource: req.params.resource,
        tableName,
        data: item
      });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
  app2.post("/api/v1/:resource", async (req, res) => {
    try {
      const session = await requireAdminAuth(req);
      const tableName = resolveRestTableName(req.params.resource);
      if (!tableName) {
        return res.status(404).json({
          success: false,
          message: `Resource [${req.params.resource}] tidak ditemukan.`
        });
      }
      if (!ensureRestMutationAllowed(res, session.role, tableName, "CREATE")) {
        return;
      }
      const payload = req.body && typeof req.body === "object" ? req.body : {};
      await writeLiveSheetViaGas(tableName, "CREATE", payload);
      return res.status(201).json({
        success: true,
        resource: req.params.resource,
        tableName,
        data: payload
      });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
  app2.post("/api/v1/:resource/bulk", async (req, res) => {
    try {
      const session = await requireAdminAuth(req);
      const tableName = resolveRestTableName(req.params.resource);
      if (!tableName) {
        return res.status(404).json({
          success: false,
          message: `Resource [${req.params.resource}] tidak ditemukan.`
        });
      }
      const { action, data } = req.body || {};
      const normalizedAction = String(action || "").toUpperCase();
      const allowedBulk = /* @__PURE__ */ new Set(["BULK_DELETE", "BULK_UPDATE", "IMPORT", "SYNC_ALL"]);
      if (!allowedBulk.has(normalizedAction)) {
        return res.status(400).json({ success: false, message: "Aksi bulk tidak valid." });
      }
      if (!ensureRestMutationAllowed(
        res,
        session.role,
        tableName,
        normalizedAction
      )) {
        return;
      }
      if (normalizedAction === "SYNC_ALL" && session.role !== "SuperAdmin" && session.role !== "Hubin" && session.role !== "Pokja") {
        return res.status(403).json({
          success: false,
          code: "FORBIDDEN",
          message: "Operasi sinkronisasi penuh (SYNC_ALL) hanya diperbolehkan untuk SuperAdmin, Hubin, atau Pokja."
        });
      }
      await writeLiveSheetViaGas(tableName, normalizedAction, data);
      return res.json({
        success: true,
        resource: req.params.resource,
        tableName,
        action: normalizedAction
      });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
  const handleRestUpdate = async (req, res) => {
    try {
      const session = await requireAdminAuth(req);
      const tableName = resolveRestTableName(req.params.resource);
      if (!tableName) {
        return res.status(404).json({
          success: false,
          message: `Resource [${req.params.resource}] tidak ditemukan.`
        });
      }
      if (!ensureRestMutationAllowed(res, session.role, tableName, "UPDATE")) {
        return;
      }
      const id = String(req.params.id || "").trim();
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const payload = { ...body, id: body.id || id };
      await writeLiveSheetViaGas(tableName, "UPDATE", payload);
      return res.json({
        success: true,
        resource: req.params.resource,
        tableName,
        id,
        data: payload
      });
    } catch (err) {
      handlePortalError(res, err);
    }
  };
  app2.put("/api/v1/:resource/:id", handleRestUpdate);
  app2.patch("/api/v1/:resource/:id", handleRestUpdate);
  app2.delete("/api/v1/:resource/:id", async (req, res) => {
    try {
      const session = await requireAdminAuth(req);
      const tableName = resolveRestTableName(req.params.resource);
      if (!tableName) {
        return res.status(404).json({
          success: false,
          message: `Resource [${req.params.resource}] tidak ditemukan.`
        });
      }
      if (!ensureRestMutationAllowed(res, session.role, tableName, "DELETE")) {
        return;
      }
      const id = String(req.params.id || "").trim();
      const body = req.body && typeof req.body === "object" ? req.body : {};
      await writeLiveSheetViaGas(tableName, "DELETE", {
        id,
        rawId: body.rawId || id,
        deletedRow: body.deletedRow
      });
      return res.json({
        success: true,
        resource: req.params.resource,
        tableName,
        id
      });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
}

// src/core/utils/mapsHelpers.ts
var GOOGLE_MAPS_SHORT_HOSTS = /* @__PURE__ */ new Set(["maps.app.goo.gl"]);
var GOOGLE_DOMAIN_REGEX = /^(www\.|maps\.)?google\.(com|co\.id|co\.uk|com\.sg|com\.my)$/i;
function validateGoogleMapsUrl(rawInput) {
  const raw = String(rawInput ?? "").trim();
  if (!raw) {
    return {
      valid: false,
      normalizedUrl: "",
      error: "Link Google Maps tempat PKL wajib diisi."
    };
  }
  if (/\s/.test(raw)) {
    return {
      valid: false,
      normalizedUrl: "",
      error: "Link Google Maps tidak boleh mengandung spasi. Salin tautan utuh dari fitur Share/Bagikan Google Maps."
    };
  }
  let candidate = raw;
  if (!/^https?:\/\//i.test(candidate)) {
    if (/^(maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.|(www\.)?google\.[a-z.]+\/maps)/i.test(candidate)) {
      candidate = `https://${candidate}`;
    } else {
      return {
        valid: false,
        normalizedUrl: "",
        error: "Format tautan tidak valid. Harus berupa link Google Maps diawali https:// (misal https://maps.app.goo.gl/... atau https://www.google.com/maps/...)."
      };
    }
  }
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return {
      valid: false,
      normalizedUrl: "",
      error: "Link Google Maps tidak valid. Pastikan URL disalin lengkap dari aplikasi Google Maps."
    };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return {
      valid: false,
      normalizedUrl: "",
      error: "Link Google Maps harus menggunakan protokol https://."
    };
  }
  parsed.protocol = "https:";
  const host = parsed.hostname.toLowerCase();
  const path3 = parsed.pathname || "/";
  if (GOOGLE_MAPS_SHORT_HOSTS.has(host)) {
    if (path3.length < 4 || path3 === "/") {
      return {
        valid: false,
        normalizedUrl: "",
        error: "Link pendek maps.app.goo.gl belum lengkap. Gunakan tombol Share -> Copy Link di Google Maps."
      };
    }
    return { valid: true, normalizedUrl: parsed.toString() };
  }
  if (host === "goo.gl") {
    if (!/^\/maps\/[A-Za-z0-9_-]{3,}/i.test(path3)) {
      return {
        valid: false,
        normalizedUrl: "",
        error: "Tautan goo.gl harus mengarah ke /maps/... (bukan link singkat umum)."
      };
    }
    return { valid: true, normalizedUrl: parsed.toString() };
  }
  if (GOOGLE_DOMAIN_REGEX.test(host)) {
    const isMapsSubdomain = host.startsWith("maps.");
    const hasMapsPath = /^\/maps(\/|$)/i.test(path3);
    const hasCoordinateOrQuery = parsed.searchParams.has("q") || parsed.searchParams.has("ll") || parsed.searchParams.has("cid") || parsed.searchParams.has("ftid") || parsed.searchParams.has("query") || parsed.searchParams.has("destination");
    if (hasMapsPath || isMapsSubdomain && (hasCoordinateOrQuery || path3.length > 1)) {
      return { valid: true, normalizedUrl: parsed.toString() };
    }
    return {
      valid: false,
      normalizedUrl: "",
      error: "Link Google harus mengarah langsung ke lokasi Google Maps (/maps/place/... atau koordinat peta)."
    };
  }
  return {
    valid: false,
    normalizedUrl: "",
    error: "Tautan ditolak karena bukan link Google Maps resmi (gunakan https://maps.app.goo.gl/... atau https://www.google.com/maps/...)."
  };
}

// src/core/utils/monitoringHelpers.ts
function extractStageNumber(tahapRaw) {
  const s = String(tahapRaw ?? "").trim();
  if (!s) return 0;
  const lower = s.toLowerCase();
  if (lower.includes("pengantaran")) return 1;
  if (lower.includes("penarikan")) return 8;
  const monMatch = lower.match(/monitoring\s*([1-6])\b/);
  if (monMatch) {
    return Number(monMatch[1]) + 1;
  }
  const prefixMatch = s.match(/^([1-8])\b/);
  if (prefixMatch) return Number(prefixMatch[1]);
  const tahapMatch = lower.match(/tahap\s*([1-8])\b/);
  if (tahapMatch) return Number(tahapMatch[1]);
  return 0;
}
function getStageValueByNumber(num) {
  const found = MONITORING_STAGES.find((st) => st.num === num);
  return found ? found.value : MONITORING_STAGES[0].value;
}
function calculateEqualWeightedAverage(k3lh, softskill, teknis, alurBisnis) {
  const avg = (Number(k3lh) + Number(softskill) + Number(teknis) + Number(alurBisnis)) / 4;
  return Math.round(avg * 10) / 10;
}
function getPredikatFromScore(score) {
  if (score >= 88) return "Sangat Baik (A)";
  if (score >= 78) return "Baik (B)";
  if (score >= 68) return "Cukup (C)";
  return "Kurang (D)";
}
function toSafeInt(val, fallback = 0) {
  const n = Number(val);
  if (Number.isNaN(n) || !Number.isFinite(n)) return fallback;
  return Math.max(0, Math.round(n));
}
function toSafeScore(val) {
  if (val === void 0 || val === null || String(val).trim() === "") return null;
  const n = Number(val);
  if (Number.isNaN(n) || !Number.isFinite(n) || n <= 0) return null;
  return Math.min(100, Math.max(0, Math.round(n * 10) / 10));
}
function parseAttendanceFromRow(row) {
  const colSakit = row.Sakit ?? row.sakit;
  const colIzin = row.Izin ?? row.izin;
  const colAlpha = row.Alpha ?? row.alpha ?? row.alfa;
  if (colSakit !== void 0 && colSakit !== "" || colIzin !== void 0 && colIzin !== "" || colAlpha !== void 0 && colAlpha !== "") {
    return {
      sakit: toSafeInt(colSakit, 0),
      izin: toSafeInt(colIzin, 0),
      alpha: toSafeInt(colAlpha, 0)
    };
  }
  const note = String(row.Catatan_Kunjungan ?? row.catatanKunjungan ?? "");
  const match = note.match(/\[Absensi:\s*S=(\d+),\s*I=(\d+),\s*A=(\d+)\]/i);
  if (match) {
    return {
      sakit: toSafeInt(match[1], 0),
      izin: toSafeInt(match[2], 0),
      alpha: toSafeInt(match[3], 0)
    };
  }
  return { sakit: 0, izin: 0, alpha: 0 };
}
var EMPTY_KONDISI_BENGKEL = {
  volumePekerjaan: "",
  relevansiPekerjaan: "",
  kenyamanan: "",
  kelayakan: ""
};
function normalizeBukuLaporan(raw) {
  const up = String(raw ?? "").trim().toUpperCase();
  if (up === "BLM" || up === "SDH" || up === "TDK") return up;
  return "";
}
function normalizeAktivitasRating(raw) {
  const low = String(raw ?? "").trim().toLowerCase();
  if (low === "baik" || low === "b") return "Baik";
  if (low === "cukup" || low === "c") return "Cukup";
  if (low === "kurang" || low === "k") return "Kurang";
  return "";
}
function normalizeKondisiRating(raw) {
  const low = String(raw ?? "").trim().toLowerCase();
  if (!low) return "";
  if (low.includes("baik") || low.includes("sesuai") && !low.includes("tidak") || low.includes("layak")) {
    return "Baik";
  }
  if (low.includes("cukup")) return "Cukup";
  if (low.includes("kurang") || low.includes("tidak")) return "Kurang";
  return "";
}
function parseKompetensiList(raw) {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x ?? "").trim()).filter(Boolean);
  }
  const s = String(raw ?? "").trim();
  if (!s) return [];
  if (s.startsWith("[")) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) {
        return parsed.map((x) => String(x ?? "").trim()).filter(Boolean);
      }
    } catch {
    }
  }
  return s.split(/\r?\n|\s*\|\|\s*/).map((line) => line.replace(/^\d+\.\s*/, "").trim()).filter(Boolean);
}
function serializeKompetensiList(list) {
  const cleaned = (Array.isArray(list) ? list : []).map((x) => String(x ?? "").trim()).filter(Boolean);
  if (cleaned.length === 0) return "";
  return cleaned.map((item, idx) => `${idx + 1}. ${item}`).join("\n");
}
function parseKondisiBengkel(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw;
    return {
      volumePekerjaan: normalizeKondisiRating(obj.volumePekerjaan ?? obj.volume),
      relevansiPekerjaan: normalizeKondisiRating(obj.relevansiPekerjaan ?? obj.relevansi),
      kenyamanan: normalizeKondisiRating(obj.kenyamanan),
      kelayakan: normalizeKondisiRating(obj.kelayakan)
    };
  }
  const s = String(raw ?? "").trim();
  if (!s) return { ...EMPTY_KONDISI_BENGKEL };
  if (s.startsWith("{")) {
    try {
      const parsed = JSON.parse(s);
      if (parsed && typeof parsed === "object") {
        return parseKondisiBengkel(parsed);
      }
    } catch {
    }
  }
  const result = { ...EMPTY_KONDISI_BENGKEL };
  const tokens = s.split(/[|,;]+/);
  for (const tok of tokens) {
    const [kRaw, vRaw] = tok.split(":").map((x) => x.trim());
    if (!kRaw || !vRaw) continue;
    const k = kRaw.toLowerCase();
    const val = normalizeKondisiRating(vRaw);
    if (k.includes("volume")) result.volumePekerjaan = val;
    else if (k.includes("relevan")) result.relevansiPekerjaan = val;
    else if (k.includes("nyaman")) result.kenyamanan = val;
    else if (k.includes("layak")) result.kelayakan = val;
  }
  return result;
}
function serializeKondisiBengkel(check) {
  if (!check) return "";
  const parts = [];
  if (check.volumePekerjaan) parts.push(`Volume: ${check.volumePekerjaan}`);
  if (check.relevansiPekerjaan) parts.push(`Relevansi: ${check.relevansiPekerjaan}`);
  if (check.kenyamanan) parts.push(`Kenyamanan: ${check.kenyamanan}`);
  if (check.kelayakan) parts.push(`Kelayakan: ${check.kelayakan}`);
  return parts.join(" | ");
}
function serializeFormat0701Tag(data) {
  const compact = {};
  if (data.bukuLaporan) compact.bl = data.bukuLaporan;
  if (data.dp) compact.dp = data.dp;
  if (data.mt) compact.mt = data.mt;
  if (data.krt) compact.krt = data.krt;
  const comp = (data.kompetensiList || []).map((x) => x.trim()).filter(Boolean);
  if (comp.length > 0) compact.kp = comp;
  if (data.kondisiBengkel && Object.values(data.kondisiBengkel).some(Boolean)) {
    compact.kb = data.kondisiBengkel;
  }
  if (Object.keys(compact).length === 0) return "";
  return `[F0701:${encodeURIComponent(JSON.stringify(compact))}]`;
}
function parseFormat0701FromRow(row) {
  let bukuLaporan = normalizeBukuLaporan(row.Buku_Laporan ?? row.bukuLaporan ?? row.buku_laporan);
  let aktivitasDp = normalizeAktivitasRating(row.Aktivitas_DP ?? row.aktivitasDp ?? row.aktivitas_dp);
  let aktivitasMt = normalizeAktivitasRating(row.Aktivitas_MT ?? row.aktivitasMt ?? row.aktivitas_mt);
  let aktivitasKrt = normalizeAktivitasRating(
    row.Aktivitas_KRT ?? row.aktivitasKrt ?? row.aktivitas_krt
  );
  let kompetensiList = parseKompetensiList(
    row.Kompetensi_Didapat ?? row.kompetensiDidapat ?? row.kompetensi_siswa
  );
  let kondisiBengkel = parseKondisiBengkel(
    row.Kondisi_Bengkel ?? row.kondisiBengkel ?? row.kondisi_bengkel
  );
  const ttdSiswa = String(row.TTD_Siswa ?? row.ttdSiswa ?? row.ttd_siswa ?? "").trim();
  const note = String(row.Catatan_Kunjungan ?? row.catatanKunjungan ?? "");
  const tagMatch = note.match(/\[F0701:([^\]]+)\]/i);
  if (tagMatch && tagMatch[1]) {
    try {
      const parsed = JSON.parse(decodeURIComponent(tagMatch[1]));
      if (!bukuLaporan && parsed.bl) bukuLaporan = normalizeBukuLaporan(parsed.bl);
      if (!aktivitasDp && parsed.dp) aktivitasDp = normalizeAktivitasRating(parsed.dp);
      if (!aktivitasMt && parsed.mt) aktivitasMt = normalizeAktivitasRating(parsed.mt);
      if (!aktivitasKrt && parsed.krt) aktivitasKrt = normalizeAktivitasRating(parsed.krt);
      if (kompetensiList.length === 0 && Array.isArray(parsed.kp)) {
        kompetensiList = parseKompetensiList(parsed.kp);
      }
      if (!kondisiBengkel.volumePekerjaan && !kondisiBengkel.relevansiPekerjaan && !kondisiBengkel.kenyamanan && !kondisiBengkel.kelayakan && parsed.kb) {
        kondisiBengkel = parseKondisiBengkel(parsed.kb);
      }
    } catch {
    }
  }
  return {
    bukuLaporan,
    aktivitasDp,
    aktivitasMt,
    aktivitasKrt,
    kompetensiList,
    kondisiBengkel,
    ttdSiswa
  };
}
function stripStructuredTagsFromNote(noteRaw) {
  return String(noteRaw ?? "").replace(/\[Absensi:[^\]]*\]/gi, "").replace(/\[Nilai PKL:[^\]]*\]/gi, "").replace(/\[Skor:[^\]]*\]/gi, "").replace(/\[F0701:[^\]]*\]/gi, "").trim();
}
function parseGradesFromMonitoringRow(row) {
  const monitoringId = String(row.ID_Monitoring ?? row.idMonitoring ?? row.id ?? "").trim() || void 0;
  const k3lhCol = toSafeScore(row.Nilai_K3LH ?? row.nilaiK3lh ?? row.nilai_k3lh);
  const softCol = toSafeScore(
    row.Nilai_Softskills ?? row.Nilai_Softskill ?? row.nilaiSoftskills ?? row.nilaiSoftskill ?? row.nilai_softskills ?? row.nilai_softskill
  );
  const tekCol = toSafeScore(
    row.Nilai_Hardskills ?? row.Nilai_Kompetensi_Teknis ?? row.nilaiHardskills ?? row.nilaiKompetensiTeknis ?? row.nilai_hardskills ?? row.nilai_kompetensi_teknis
  );
  const bisnisCol = toSafeScore(
    row.Nilai_Alur_Bisnis_Dunia_Kerja ?? row.Nilai_Alur_Bisnis ?? row.nilaiAlurBisnisDuniaKerja ?? row.nilaiAlurBisnis ?? row.nilai_alur_bisnis_dunia_kerja ?? row.nilai_alur_bisnis
  );
  const avgCol = toSafeScore(
    row.Nilai_rata_rata ?? row.Nilai_Rata_Rata ?? row.nilaiRataRata ?? row.nilai_rata_rata
  );
  if (k3lhCol !== null && softCol !== null && tekCol !== null && bisnisCol !== null) {
    return {
      monitoringId,
      k3lh: k3lhCol,
      softskill: softCol,
      teknis: tekCol,
      alurBisnis: bisnisCol,
      rataRata: avgCol ?? calculateEqualWeightedAverage(k3lhCol, softCol, tekCol, bisnisCol),
      tahapDiinput: String(row.Tahap ?? row.tahap ?? ""),
      tanggal: normalizeToIsoDate(row.Tanggal_Kunjungan ?? row.tanggalKunjungan ?? "") || String(row.Tanggal_Kunjungan ?? row.tanggalKunjungan ?? "")
    };
  }
  const note = String(row.Catatan_Kunjungan ?? row.catatanKunjungan ?? "");
  const newFmt = note.match(
    /\[Nilai PKL:\s*K3LH=([\d.]+),\s*Softskill=([\d.]+),\s*Teknis=([\d.]+),\s*AlurBisnis=([\d.]+)\s*\|\s*Rata-rata=([\d.]+)/i
  );
  if (newFmt) {
    return {
      monitoringId,
      k3lh: Number(newFmt[1]),
      softskill: Number(newFmt[2]),
      teknis: Number(newFmt[3]),
      alurBisnis: Number(newFmt[4]),
      rataRata: Number(newFmt[5]),
      tahapDiinput: String(row.Tahap ?? row.tahap ?? ""),
      tanggal: normalizeToIsoDate(row.Tanggal_Kunjungan ?? row.tanggalKunjungan ?? "") || String(row.Tanggal_Kunjungan ?? row.tanggalKunjungan ?? "")
    };
  }
  const legacyFmt = note.match(/\[Skor:[^\]]*\|\s*Akhir=([\d.]+)/i);
  if (legacyFmt) {
    return {
      monitoringId,
      k3lh: null,
      softskill: null,
      teknis: null,
      alurBisnis: null,
      rataRata: Number(legacyFmt[1]),
      tahapDiinput: String(row.Tahap ?? row.tahap ?? ""),
      tanggal: normalizeToIsoDate(row.Tanggal_Kunjungan ?? row.tanggalKunjungan ?? "") || String(row.Tanggal_Kunjungan ?? row.tanggalKunjungan ?? "")
    };
  }
  const collectedFlag = String(row.Nilai_DUDI_Terkumpul ?? row.nilaiDudiTerkumpul ?? "").trim().toLowerCase();
  if ((collectedFlag === "ya" || collectedFlag === "true") && avgCol && avgCol > 0) {
    return {
      monitoringId,
      k3lh: k3lhCol,
      softskill: softCol,
      teknis: tekCol,
      alurBisnis: bisnisCol,
      rataRata: avgCol,
      tahapDiinput: String(row.Tahap ?? row.tahap ?? ""),
      tanggal: normalizeToIsoDate(row.Tanggal_Kunjungan ?? row.tanggalKunjungan ?? "") || String(row.Tanggal_Kunjungan ?? row.tanggalKunjungan ?? "")
    };
  }
  return null;
}
function buildStudentMonitoringSummary(student, monitoringRows, nilaiRows, lookupIndex) {
  const norm = (v) => String(v ?? "").trim().toLowerCase();
  const targetNisRaw = String(student.nis || "").trim();
  const targetNisDigits = stripNisSymbols(targetNisRaw);
  const targetPlt = String(student.idPenempatan || "").trim();
  const targetNama = norm(student.nama);
  const targetDudi = norm(student.dudi_name);
  let matchedMonitoring;
  if (lookupIndex) {
    const seen = /* @__PURE__ */ new Set();
    const addCandidate = (rows) => {
      if (!rows) return;
      for (const r of rows) seen.add(r);
    };
    if (targetNisDigits) addCandidate(lookupIndex.monitoringByNisDigits.get(targetNisDigits));
    if (targetNisRaw && targetNisRaw !== "-") addCandidate(lookupIndex.monitoringByNisRaw.get(targetNisRaw));
    if (targetPlt) addCandidate(lookupIndex.monitoringByPlacement.get(targetPlt));
    for (const row of lookupIndex.groupMonitoringRows) {
      if (seen.has(row)) continue;
      const rowDaftar = norm(row.Daftar_Siswa ?? row.daftarSiswa ?? "");
      const rowDaftarDigits = stripNisSymbols(rowDaftar);
      const rowNamaSiswa = norm(row.Nama_Siswa ?? row.namaSiswa ?? "");
      const rowDudi = norm(row.DUDI_Tujuan ?? row.dudiTujuan ?? "");
      if (targetNisDigits && rowDaftarDigits.includes(targetNisDigits) || targetNisRaw && targetNisRaw !== "-" && rowDaftar.includes(targetNisRaw.toLowerCase()) || targetNama && (rowNamaSiswa === targetNama || rowDaftar.includes(targetNama)) && (!targetDudi || !rowDudi || rowDudi === targetDudi || rowDudi.includes(targetDudi))) {
        seen.add(row);
      }
    }
    matchedMonitoring = Array.from(seen);
  } else {
    matchedMonitoring = (Array.isArray(monitoringRows) ? monitoringRows : []).filter((row) => {
      const rowNisRaw = String(row.NIS ?? row.nis ?? "").trim();
      const rowNisDigits = stripNisSymbols(rowNisRaw);
      const rowPlt = String(row.ID_Penempatan ?? row.idPenempatan ?? "").trim();
      const rowDaftar = norm(row.Daftar_Siswa ?? row.daftarSiswa ?? "");
      const rowDaftarDigits = stripNisSymbols(rowDaftar);
      const rowNamaSiswa = norm(row.Nama_Siswa ?? row.namaSiswa ?? "");
      const rowDudi = norm(row.DUDI_Tujuan ?? row.dudiTujuan ?? "");
      if (targetNisDigits && rowNisDigits === targetNisDigits) return true;
      if (targetNisRaw && targetNisRaw !== "-" && rowNisRaw === targetNisRaw) return true;
      if (targetPlt && rowPlt && rowPlt === targetPlt) return true;
      if (targetNisDigits && rowDaftarDigits.includes(targetNisDigits)) return true;
      if (targetNisRaw && targetNisRaw !== "-" && rowDaftar.includes(targetNisRaw.toLowerCase())) return true;
      if (targetNama && (rowNamaSiswa === targetNama || rowDaftar.includes(targetNama)) && (!targetDudi || !rowDudi || rowDudi === targetDudi || rowDudi.includes(targetDudi))) {
        return true;
      }
      return false;
    });
  }
  const stageLogs = {};
  const completedSet = /* @__PURE__ */ new Set();
  let submittedGradeSummary = null;
  for (const row of matchedMonitoring) {
    const stageNum = extractStageNumber(row.Tahap ?? row.tahap);
    const status = String(row.Status_Tahap ?? row.statusTahap ?? "Terlaksana").trim();
    const monitoringId = String(row.ID_Monitoring ?? row.idMonitoring ?? row.id ?? "").trim() || void 0;
    const isCompleted = stageNum >= 1 && stageNum <= 8 && !status.toLowerCase().includes("belum");
    if (isCompleted) {
      completedSet.add(stageNum);
    }
    if (stageNum >= 1 && stageNum <= 8) {
      const att = parseAttendanceFromRow(row);
      const f0701 = parseFormat0701FromRow(row);
      stageLogs[stageNum] = {
        monitoringId,
        stageNum,
        tahap: String(row.Tahap ?? row.tahap ?? getStageValueByNumber(stageNum)),
        sakit: att.sakit,
        izin: att.izin,
        alpha: att.alpha,
        bukuLaporan: f0701.bukuLaporan,
        aktivitasDp: f0701.aktivitasDp,
        aktivitasMt: f0701.aktivitasMt,
        aktivitasKrt: f0701.aktivitasKrt,
        kompetensiList: f0701.kompetensiList,
        kondisiBengkel: f0701.kondisiBengkel,
        ttdSiswa: f0701.ttdSiswa,
        catatan: stripStructuredTagsFromNote(row.Catatan_Kunjungan ?? row.catatanKunjungan ?? ""),
        tanggal: normalizeToIsoDate(row.Tanggal_Kunjungan ?? row.tanggalKunjungan ?? "") || String(row.Tanggal_Kunjungan ?? row.tanggalKunjungan ?? ""),
        status
      };
    }
    const parsedGrade = parseGradesFromMonitoringRow(row);
    if (parsedGrade && parsedGrade.rataRata > 0) {
      submittedGradeSummary = parsedGrade;
    }
  }
  const nilaiCandidates = lookupIndex ? (() => {
    const set = /* @__PURE__ */ new Set();
    if (targetNisDigits) lookupIndex.nilaiByNisDigits.get(targetNisDigits)?.forEach((x) => set.add(x));
    if (targetNisRaw && targetNisRaw !== "-") lookupIndex.nilaiByNisRaw.get(targetNisRaw)?.forEach((x) => set.add(x));
    if (targetPlt) lookupIndex.nilaiByPlacement.get(targetPlt)?.forEach((x) => set.add(x));
    if (set.size > 0) return Array.from(set);
    return lookupIndex.allNilaiRows;
  })() : Array.isArray(nilaiRows) ? nilaiRows : [];
  if (nilaiCandidates.length > 0) {
    const matchedNilai = nilaiCandidates.find((n) => {
      const rowNisRaw = String(n.NIS ?? n.nis ?? "").trim();
      const rowNisDigits = stripNisSymbols(rowNisRaw);
      const rowPlt = String(n.ID_Penempatan ?? n.idPenempatan ?? "").trim();
      const rowNama = norm(n.Nama_Siswa ?? n.namaSiswa ?? "");
      const k3 = Number(n.Nilai_K3LH ?? n.nilaiK3lh ?? 0) || 0;
      const ss = Number(n.Nilai_Softskills ?? n.Nilai_Softskill ?? n.nilaiSoftskills ?? n.nilaiSoftskill ?? 0) || 0;
      const tk = Number(n.Nilai_Hardskills ?? n.Nilai_Kompetensi_Teknis ?? n.nilaiHardskills ?? n.nilaiKompetensiTeknis ?? 0) || 0;
      const ab = Number(n.Nilai_Alur_Bisnis_Dunia_Kerja ?? n.Nilai_Alur_Bisnis ?? n.nilaiAlurBisnisDuniaKerja ?? n.nilaiAlurBisnis ?? 0) || 0;
      const rawAvg = Number(
        n.Nilai_rata_rata ?? n.Nilai_Rata_Rata ?? n.nilaiRataRata ?? n.Nilai_DUDI ?? n.nilaiDudi ?? n.Nilai_Akhir ?? n.nilaiAkhir ?? 0
      );
      if (rawAvg <= 0 && (k3 <= 0 || ss <= 0 || tk <= 0 || ab <= 0)) return false;
      if (targetNisDigits && rowNisDigits === targetNisDigits) return true;
      if (targetNisRaw && targetNisRaw !== "-" && rowNisRaw === targetNisRaw) return true;
      if (targetPlt && rowPlt === targetPlt) return true;
      return Boolean(targetNama && rowNama === targetNama);
    });
    if (matchedNilai) {
      const k3lh = toSafeScore(matchedNilai.Nilai_K3LH ?? matchedNilai.nilaiK3lh);
      const softskill = toSafeScore(
        matchedNilai.Nilai_Softskills ?? matchedNilai.Nilai_Softskill ?? matchedNilai.nilaiSoftskills ?? matchedNilai.nilaiSoftskill
      );
      const teknis = toSafeScore(
        matchedNilai.Nilai_Hardskills ?? matchedNilai.Nilai_Kompetensi_Teknis ?? matchedNilai.nilaiHardskills ?? matchedNilai.nilaiKompetensiTeknis
      );
      const alurBisnis = toSafeScore(
        matchedNilai.Nilai_Alur_Bisnis_Dunia_Kerja ?? matchedNilai.Nilai_Alur_Bisnis ?? matchedNilai.nilaiAlurBisnisDuniaKerja ?? matchedNilai.nilaiAlurBisnis
      );
      const avgRaw = toSafeScore(
        matchedNilai.Nilai_rata_rata ?? matchedNilai.Nilai_Rata_Rata ?? matchedNilai.nilaiRataRata ?? matchedNilai.Nilai_DUDI ?? matchedNilai.nilaiDudi ?? matchedNilai.Nilai_Akhir ?? matchedNilai.nilaiAkhir
      );
      const computedAvg = k3lh !== null && softskill !== null && teknis !== null && alurBisnis !== null ? calculateEqualWeightedAverage(k3lh, softskill, teknis, alurBisnis) : 0;
      const finalAvg = avgRaw ?? computedAvg;
      if (!submittedGradeSummary && finalAvg > 0) {
        submittedGradeSummary = {
          k3lh,
          softskill,
          teknis,
          alurBisnis,
          rataRata: finalAvg,
          tahapDiinput: "Nilai_Dan_Sertifikat",
          tanggal: normalizeToIsoDate(matchedNilai.Tgl_Terbit ?? matchedNilai.tanggalTerbit ?? "") || String(matchedNilai.Tgl_Terbit ?? matchedNilai.tanggalTerbit ?? "")
        };
      }
    }
  }
  const completedStages = Array.from(completedSet).sort((a, b) => a - b);
  const maxCompleted = completedStages.length > 0 ? completedStages[completedStages.length - 1] : 0;
  const recommendedStage = Math.min(maxCompleted + 1, 8);
  return {
    completedStages,
    recommendedStage,
    hasSubmittedGrades: Boolean(submittedGradeSummary && submittedGradeSummary.rataRata > 0),
    submittedGradeSummary,
    stageLogs
  };
}
function extractIssuedStageNumber(raw) {
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 1 && raw <= 8) return raw;
  const str = String(raw ?? "").trim();
  if (!str) return 0;
  const directNum = Number(str);
  if (Number.isInteger(directNum) && directNum >= 1 && directNum <= 8) return directNum;
  return extractStageNumber(str);
}
function isIssuedLetterStatusActive(statusVal) {
  const s = String(statusVal ?? "").trim().toLowerCase();
  if (!s) return true;
  if (s.includes("batal") || s.includes("cabut") || s === "nonaktif" || s === "false") {
    return false;
  }
  return s === "sudah terbit" || s === "terbit" || s === "active" || s === "ya" || s === "true";
}
function resolveIssuedStagesForDudi(logRows, dudiId, namaDudi) {
  const norm = (val) => String(val ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const targetId = norm(dudiId);
  const targetName = norm(namaDudi);
  if (!Array.isArray(logRows) || logRows.length === 0 || !targetId && !targetName) {
    return { issuedStages: [], issuedStageDetails: {} };
  }
  const latestByStage = {};
  logRows.forEach((row, idx) => {
    if (!row || typeof row !== "object") return;
    const rowDudiId = norm(row.ID_DUDI ?? row.idDudi);
    const rowDudiName = norm(row.Nama_DUDI ?? row.namaDudi);
    const matchesId = Boolean(targetId && rowDudiId && rowDudiId === targetId);
    const matchesName = Boolean(targetName && rowDudiName && rowDudiName === targetName);
    if (!matchesId && !matchesName) return;
    const stageNum = extractIssuedStageNumber(row.Tahap ?? row.tahap) || extractIssuedStageNumber(row.Nama_Tahap ?? row.namaTahap);
    if (stageNum < 1 || stageNum > 8) return;
    const statusTerbit = String(row.Status_Terbit ?? row.statusTerbit ?? "Sudah Terbit").trim() || "Sudah Terbit";
    latestByStage[stageNum] = {
      tahap: stageNum,
      statusTerbit,
      jenisDokumen: String(row.Jenis_Dokumen ?? row.jenisDokumen ?? "").trim(),
      nomorSurat: String(row.Nomor_Surat ?? row.nomorSurat ?? "").trim(),
      tanggalTerbit: normalizeToIsoDate(row.Tanggal_Terbit ?? row.tanggalTerbit ?? "") || String(row.Tanggal_Terbit ?? row.tanggalTerbit ?? "").trim(),
      diterbitkanOleh: String(row.Diterbitkan_Oleh ?? row.diterbitkanOleh ?? "").trim(),
      linkPdf: String(row.Link_PDF ?? row.linkPdf ?? "").trim(),
      _rowOrder: Number(row._sheetRowNumber || idx + 2)
    };
  });
  const issuedStages = [];
  const issuedStageDetails = {};
  for (let st = 1; st <= 8; st += 1) {
    const entry = latestByStage[st];
    if (!entry) continue;
    if (!isIssuedLetterStatusActive(entry.statusTerbit)) continue;
    issuedStages.push(st);
    const { _rowOrder, ...cleanDetail } = entry;
    void _rowOrder;
    issuedStageDetails[st] = cleanDetail;
  }
  return { issuedStages, issuedStageDetails };
}
function pickRecommendedStageForControl(completedStages, control, issuedStages) {
  const unlocked = Array.isArray(control?.unlockedStages) ? Array.from(
    new Set(
      control.unlockedStages.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 1 && n <= 8)
    )
  ).sort((a, b) => a - b) : [...DEFAULT_MONITORING_STAGE_CONTROL.unlockedStages];
  const requireSequential = typeof control?.requireSequential === "boolean" ? control.requireSequential : DEFAULT_MONITORING_STAGE_CONTROL.requireSequential;
  const requireIssuedLetter = typeof control?.requireIssuedLetter === "boolean" ? control.requireIssuedLetter : DEFAULT_MONITORING_STAGE_CONTROL.requireIssuedLetter ?? true;
  const completed = Array.isArray(completedStages) ? completedStages : [];
  const issuedSet = Array.isArray(issuedStages) ? new Set(issuedStages) : null;
  const isEligibleOpenStage = (num) => unlocked.includes(num) && (!requireIssuedLetter || !issuedSet || issuedSet.has(num));
  const eligibleOpenStages = unlocked.filter((num) => isEligibleOpenStage(num));
  if (eligibleOpenStages.length > 0) {
    if (requireSequential) {
      const nextSequential = eligibleOpenStages.find(
        (num) => !completed.includes(num) && (num === 1 || completed.includes(num - 1))
      );
      if (nextSequential !== void 0) return nextSequential;
    }
    const firstEligiblePending = eligibleOpenStages.find((num) => !completed.includes(num));
    if (firstEligiblePending !== void 0) return firstEligiblePending;
    return eligibleOpenStages[0];
  }
  if (completed.length > 0) {
    return completed[completed.length - 1];
  }
  return unlocked[0] ?? 1;
}

// src/core/portal/portalTransformers.ts
function mapPublicDudiRows(rows) {
  return rows.filter((d) => pickField(d, "Nama_DUDI", "namaDudi", "nama_dudi", "nama") !== "").map((d, idx) => {
    const namaPemimpin = pickField(d, "Nama_Pemimpin", "namaPemimpin", "nama_pemimpin", "pimpinan");
    const namaPic = pickField(d, "Nama_PIC", "namaPic", "nama_pic");
    const kontakPic = pickField(d, "Kontak_PIC", "kontakPic", "kontak_pic");
    const noTelpDudi = pickField(d, "No_Telp_DUDI", "noTelpDudi", "no_telp_dudi", "telepon") || kontakPic;
    const linkMaps = pickField(d, "Link_Maps", "linkMaps", "link_maps", "mapsUrl");
    return {
      id: pickField(d, "ID", "id") || `dudi_${idx + 1}`,
      nama_dudi: pickField(d, "Nama_DUDI", "namaDudi", "nama_dudi", "nama"),
      bidang_usaha: pickField(d, "Bidang_Keahlian", "bidangKeahlian", "bidang_usaha") || "-",
      alamat: pickField(d, "Alamat", "alamat"),
      kota: pickField(d, "Wilayah_Kota", "wilayahKota", "kota"),
      kuota_maksimal: Number(d.Kuota_Maksimal ?? d.kuotaMaksimal ?? 0),
      terisi: Number(d.Terisi ?? d.terisi ?? 0),
      status: pickField(d, "Status_Kerjasama", "statusKerjasama", "status") || "Aktif",
      nama_pemimpin: namaPemimpin,
      nama_pic: namaPic,
      kontak_pic: kontakPic,
      no_telp_dudi: noTelpDudi,
      link_maps: linkMaps,
      id_guru_pendamping: pickField(d, "ID_Guru_Pendamping", "idGuruPendamping"),
      guru_pendamping: pickField(d, "Guru_Pendamping", "guruPendamping"),
      hari_kerja: pickField(d, "Hari_Kerja", "hariKerja", "hari_kerja"),
      jam_kerja: pickField(d, "Jam_Kerja", "jamKerja", "jam_kerja"),
      pimpinan: namaPemimpin || namaPic,
      telepon: noTelpDudi
    };
  });
}
function mapPublicPetugasRows(rows) {
  return rows.filter((g) => pickField(g, "Nama_Lengkap", "Nama_Guru", "namaGuru", "nama", "Nama") !== "").map((g, idx) => ({
    id: pickField(g, "ID", "ID_Guru", "idGuru", "id") || `guru_${idx + 1}`,
    nama: pickField(g, "Nama_Lengkap", "Nama_Guru", "namaGuru", "nama", "Nama"),
    nip: pickField(g, "NIP", "nip") || "-",
    peran: pickField(g, "Peran_Utama", "peranUtama", "Peran", "peran") || "Guru Pendamping",
    email: pickField(g, "Email_Google", "email", "emailGoogle")
  }));
}
function mapPublicStudentRecord(student) {
  const canonicalNisRaw = pickField(student, "NIS", "nis");
  const canonicalNis = stripNisSymbols(canonicalNisRaw) || canonicalNisRaw;
  return {
    id: pickField(student, "ID", "id", "NIS", "nis"),
    nama: pickField(student, "Nama_Lengkap", "nama", "namaLengkap"),
    nis: canonicalNis,
    nik: pickField(student, "NIK", "nik"),
    kelas: pickField(student, "Kelas", "kelas"),
    jurusan: pickField(student, "ID_Jurusan", "jurusan", "Jurusan", "idJurusan"),
    telepon: pickField(student, "No_HP_Siswa", "noHpSiswa", "telepon", "noHp"),
    jk: pickField(student, "Jenis_Kelamin", "jenisKelamin", "jk") || "Laki-laki",
    alamat_domisili: pickField(
      student,
      "Alamat_Domisili",
      "alamatDomisili",
      "alamat_domisili",
      "Alamat",
      "alamat"
    ),
    nama_wali: pickField(
      student,
      "Nama_Ortu_Wali",
      "namaOrtuWali",
      "nama_ortu_wali",
      "Nama_Wali",
      "nama_wali"
    ),
    telepon_wali: pickField(
      student,
      "No_Ortu_Wali",
      "noOrtuWali",
      "no_ortu_wali",
      "Telepon_Wali",
      "telepon_wali"
    )
  };
}
function aggregatePetugasDudiGroups(params) {
  const { petugasNama, petugasId, plottingRows, dudiRows, pengajuanRows } = params;
  const dudiMapById = /* @__PURE__ */ new Map();
  const dudiMapByName = /* @__PURE__ */ new Map();
  for (const d of dudiRows) {
    const id = pickField(d, "ID", "id");
    const nama = pickField(d, "Nama_DUDI", "namaDudi", "nama_dudi");
    if (id) dudiMapById.set(id, d);
    if (nama) dudiMapByName.set(normalizeStr(nama), d);
  }
  const pengajuanMapsByDudi = /* @__PURE__ */ new Map();
  const pengajuanHariByDudi = /* @__PURE__ */ new Map();
  const pengajuanJamByDudi = /* @__PURE__ */ new Map();
  for (const reqRow of pengajuanRows) {
    const did = pickField(reqRow, "ID_DUDI", "idDudi");
    const dname = normalizeStr(pickField(reqRow, "DUDI_Tujuan", "dudiTujuan"));
    const lm = pickField(reqRow, "Link_Maps", "linkMaps", "link_maps");
    const hk = pickField(reqRow, "Hari_Kerja", "hariKerja", "hari_kerja");
    const jk = pickField(reqRow, "Jam_Kerja", "jamKerja", "jam_kerja");
    if (lm) {
      if (did && !pengajuanMapsByDudi.has(did)) pengajuanMapsByDudi.set(did, lm);
      if (dname && !pengajuanMapsByDudi.has(dname)) pengajuanMapsByDudi.set(dname, lm);
    }
    if (hk) {
      if (did && !pengajuanHariByDudi.has(did)) pengajuanHariByDudi.set(did, hk);
      if (dname && !pengajuanHariByDudi.has(dname)) pengajuanHariByDudi.set(dname, hk);
    }
    if (jk) {
      if (did && !pengajuanJamByDudi.has(did)) pengajuanJamByDudi.set(did, jk);
      if (dname && !pengajuanJamByDudi.has(dname)) pengajuanJamByDudi.set(dname, jk);
    }
  }
  const grouped = /* @__PURE__ */ new Map();
  const targetNamaNorm = normalizeStr(petugasNama);
  const isTeacherMatch = (row) => {
    const rowGuruId = pickField(row, "ID_Guru_Pendamping", "idGuruPendamping");
    const rowGuruNama = normalizeStr(pickField(row, "Guru_Pendamping", "guruPendamping"));
    return petugasId && rowGuruId && rowGuruId === petugasId || targetNamaNorm && rowGuruNama && (rowGuruNama === targetNamaNorm || rowGuruNama.includes(targetNamaNorm) || targetNamaNorm.includes(rowGuruNama));
  };
  for (const p of plottingRows) {
    const statusPlt = normalizeStr(pickField(p, "Status_Penempatan", "statusPenempatan"));
    if (statusPlt === "dibatalkan" || statusPlt === "batal" || statusPlt === "pindah dudi") continue;
    if (!isTeacherMatch(p)) continue;
    const dudiId = pickField(p, "ID_DUDI", "idDudi");
    const dudiNamaRaw = pickField(p, "Nama_DUDI", "namaDudi");
    const master = dudiId && dudiMapById.get(dudiId) || dudiNamaRaw && dudiMapByName.get(normalizeStr(dudiNamaRaw));
    const resolvedName = pickField(master || {}, "Nama_DUDI", "namaDudi") || dudiNamaRaw;
    if (!resolvedName) continue;
    const key = normalizeStr(resolvedName);
    if (!grouped.has(key)) {
      const masterId = pickField(master || {}, "ID", "id") || dudiId || key;
      const resolvedKontak = pickField(master || {}, "No_Telp_DUDI", "noTelpDudi", "Kontak_PIC", "kontakPic") || "-";
      const resolvedMaps = pickField(master || {}, "Link_Maps", "linkMaps", "link_maps") || pengajuanMapsByDudi.get(masterId) || pengajuanMapsByDudi.get(key) || "";
      const resolvedHari = pickField(master || {}, "Hari_Kerja", "hariKerja", "hari_kerja") || pengajuanHariByDudi.get(masterId) || pengajuanHariByDudi.get(key) || "";
      const resolvedJam = pickField(master || {}, "Jam_Kerja", "jamKerja", "jam_kerja") || pengajuanJamByDudi.get(masterId) || pengajuanJamByDudi.get(key) || "";
      grouped.set(key, {
        dudi: {
          id: masterId,
          nama: resolvedName,
          alamat: pickField(master || {}, "Alamat", "alamat") || "-",
          bidang: pickField(master || {}, "Bidang_Keahlian", "bidangKeahlian") || "-",
          namaPemimpin: pickField(master || {}, "Nama_Pemimpin", "namaPemimpin") || "",
          pic: pickField(master || {}, "Nama_PIC", "namaPic") || "-",
          kontak: resolvedKontak,
          hariKerja: resolvedHari,
          jamKerja: resolvedJam,
          linkMaps: resolvedMaps,
          kuota: Number(master?.Kuota_Maksimal ?? master?.kuotaMaksimal ?? 0)
        },
        studentNisSet: /* @__PURE__ */ new Set()
      });
    }
    const rawNis = pickField(p, "NIS", "nis");
    const canonicalStudentKey = stripNisSymbols(rawNis) || normalizeStr(pickField(p, "Nama_Siswa", "namaSiswa"));
    if (canonicalStudentKey) grouped.get(key).studentNisSet.add(canonicalStudentKey);
  }
  for (const reqRow of pengajuanRows) {
    const statusHubin = normalizeStr(pickField(reqRow, "Status_Hubin", "statusHubin"));
    const statusKakomli = normalizeStr(pickField(reqRow, "Status_Kakomli", "statusKakomli"));
    if (statusHubin === "batal" || statusKakomli === "ditolak") continue;
    if (!isTeacherMatch(reqRow)) continue;
    const dudiId = pickField(reqRow, "ID_DUDI", "idDudi");
    const dudiNamaRaw = pickField(reqRow, "DUDI_Tujuan", "dudiTujuan");
    if (!dudiNamaRaw) continue;
    const master = dudiId && dudiMapById.get(dudiId) || dudiMapByName.get(normalizeStr(dudiNamaRaw));
    const resolvedName = pickField(master || {}, "Nama_DUDI", "namaDudi") || dudiNamaRaw;
    const key = normalizeStr(resolvedName);
    if (!grouped.has(key)) {
      const masterId = pickField(master || {}, "ID", "id") || dudiId || key;
      const resolvedKontak = pickField(master || {}, "No_Telp_DUDI", "noTelpDudi", "Kontak_PIC", "kontakPic") || pickField(reqRow, "No_Telp_DUDI", "noTelpDudi", "Kontak_PIC", "kontakPic") || "-";
      const resolvedMaps = pickField(master || {}, "Link_Maps", "linkMaps", "link_maps") || pickField(reqRow, "Link_Maps", "linkMaps", "link_maps") || pengajuanMapsByDudi.get(masterId) || pengajuanMapsByDudi.get(key) || "";
      const resolvedHari = pickField(master || {}, "Hari_Kerja", "hariKerja", "hari_kerja") || pickField(reqRow, "Hari_Kerja", "hariKerja", "hari_kerja") || pengajuanHariByDudi.get(masterId) || pengajuanHariByDudi.get(key) || "";
      const resolvedJam = pickField(master || {}, "Jam_Kerja", "jamKerja", "jam_kerja") || pickField(reqRow, "Jam_Kerja", "jamKerja", "jam_kerja") || pengajuanJamByDudi.get(masterId) || pengajuanJamByDudi.get(key) || "";
      grouped.set(key, {
        dudi: {
          id: masterId,
          nama: resolvedName,
          alamat: pickField(master || {}, "Alamat", "alamat") || pickField(reqRow, "Alamat_DUDI", "alamatDudi") || "-",
          bidang: pickField(master || {}, "Bidang_Keahlian", "bidangKeahlian") || pickField(reqRow, "Bidang_Pekerjaan", "bidangPekerjaan") || "-",
          namaPemimpin: pickField(master || {}, "Nama_Pemimpin", "namaPemimpin") || pickField(reqRow, "Nama_Pemimpin", "namaPemimpin") || "",
          pic: pickField(master || {}, "Nama_PIC", "namaPic") || pickField(reqRow, "Nama_PIC", "namaPic") || "-",
          kontak: resolvedKontak,
          hariKerja: resolvedHari,
          jamKerja: resolvedJam,
          linkMaps: resolvedMaps,
          kuota: Number(master?.Kuota_Maksimal ?? master?.kuotaMaksimal ?? 0)
        },
        studentNisSet: /* @__PURE__ */ new Set()
      });
    }
    const rawNis = pickField(reqRow, "NIS", "nis");
    const canonicalStudentKey = stripNisSymbols(rawNis) || normalizeStr(pickField(reqRow, "Nama_Siswa", "namaSiswa"));
    if (canonicalStudentKey) grouped.get(key).studentNisSet.add(canonicalStudentKey);
  }
  return Array.from(grouped.values()).map((entry) => ({
    ...entry.dudi,
    jumlahSiswa: entry.studentNisSet.size
  }));
}
function buildDudiStudentsWithSummary(params) {
  const {
    dudiNama,
    dudiId,
    petugasNama,
    plottingRows,
    pengajuanRows,
    siswaRows,
    monitoringRows,
    nilaiRows,
    stageControl,
    issuedStages
  } = params;
  const siswaByNis = /* @__PURE__ */ new Map();
  for (const s of siswaRows) {
    const nis = pickField(s, "NIS", "nis");
    const nisDigits = stripNisSymbols(nis);
    if (nisDigits) siswaByNis.set(nisDigits, s);
    if (nis) siswaByNis.set(nis, s);
  }
  const studentsMap = /* @__PURE__ */ new Map();
  const targetDudiNorm = normalizeStr(dudiNama);
  const targetPetugasNorm = normalizeStr(petugasNama);
  const checkDudiAndPetugasMatch = (row, rowDudiNameField) => {
    const rowDudiId = pickField(row, "ID_DUDI", "idDudi");
    const rowDudiNama = normalizeStr(
      rowDudiNameField === "Nama_DUDI" ? pickField(row, "Nama_DUDI", "namaDudi") : pickField(row, "DUDI_Tujuan", "dudiTujuan")
    );
    const dudiMatches = dudiId && rowDudiId && rowDudiId === dudiId || targetDudiNorm && rowDudiNama && (rowDudiNama === targetDudiNorm || rowDudiNama.includes(targetDudiNorm));
    if (!dudiMatches) return false;
    if (targetPetugasNorm) {
      const rowGuru = normalizeStr(pickField(row, "Guru_Pendamping", "guruPendamping"));
      if (rowGuru && !rowGuru.includes(targetPetugasNorm) && !targetPetugasNorm.includes(rowGuru)) {
        return false;
      }
    }
    return true;
  };
  for (const p of plottingRows) {
    const statusPlt = normalizeStr(pickField(p, "Status_Penempatan", "statusPenempatan"));
    if (statusPlt === "dibatalkan" || statusPlt === "batal" || statusPlt === "pindah dudi") continue;
    if (!checkDudiAndPetugasMatch(p, "Nama_DUDI")) continue;
    const rawNis = pickField(p, "NIS", "nis");
    const cleanNis = stripNisSymbols(rawNis) || rawNis;
    const masterSiswa = (cleanNis ? siswaByNis.get(cleanNis) : void 0) || (rawNis ? siswaByNis.get(rawNis) : void 0);
    const canonicalNis = stripNisSymbols(pickField(masterSiswa || {}, "NIS", "nis")) || cleanNis;
    const nama = pickField(masterSiswa || {}, "Nama_Lengkap", "namaLengkap", "nama") || pickField(p, "Nama_Siswa", "namaSiswa");
    if (!canonicalNis && !nama) continue;
    const key = canonicalNis || normalizeStr(nama);
    if (!studentsMap.has(key)) {
      studentsMap.set(key, {
        id: pickField(p, "ID_Penempatan", "idPenempatan", "id") || key,
        idPenempatan: pickField(p, "ID_Penempatan", "idPenempatan", "id") || "",
        nis: canonicalNis || "-",
        nama: nama || "Siswa Prakerin",
        kelas: pickField(masterSiswa || {}, "Kelas", "kelas") || "-",
        jurusan: pickField(masterSiswa || {}, "ID_Jurusan", "jurusan", "Jurusan") || "-",
        dudi_name: dudiNama || pickField(p, "Nama_DUDI", "namaDudi")
      });
    }
  }
  for (const reqRow of pengajuanRows) {
    const statusHubin = normalizeStr(pickField(reqRow, "Status_Hubin", "statusHubin"));
    const statusKakomli = normalizeStr(pickField(reqRow, "Status_Kakomli", "statusKakomli"));
    if (statusHubin === "batal" || statusKakomli === "ditolak") continue;
    if (!checkDudiAndPetugasMatch(reqRow, "DUDI_Tujuan")) continue;
    const rawNis = pickField(reqRow, "NIS", "nis");
    const cleanNis = stripNisSymbols(rawNis) || rawNis;
    const masterSiswa = (cleanNis ? siswaByNis.get(cleanNis) : void 0) || (rawNis ? siswaByNis.get(rawNis) : void 0);
    const canonicalNis = stripNisSymbols(pickField(masterSiswa || {}, "NIS", "nis")) || cleanNis;
    const nama = pickField(masterSiswa || {}, "Nama_Lengkap", "namaLengkap", "nama") || pickField(reqRow, "Nama_Siswa", "namaSiswa");
    if (!canonicalNis && !nama) continue;
    const key = canonicalNis || normalizeStr(nama);
    if (!studentsMap.has(key)) {
      studentsMap.set(key, {
        id: pickField(reqRow, "No_Pengajuan", "noPengajuan", "id") || key,
        idPenempatan: pickField(reqRow, "No_Pengajuan", "noPengajuan", "id") || "",
        nis: canonicalNis || "-",
        nama: nama || "Siswa Prakerin",
        kelas: pickField(masterSiswa || {}, "Kelas", "kelas") || pickField(reqRow, "Kelas", "kelas") || "-",
        jurusan: pickField(masterSiswa || {}, "ID_Jurusan", "jurusan") || pickField(reqRow, "Jurusan", "jurusan") || "-",
        dudi_name: dudiNama || pickField(reqRow, "DUDI_Tujuan", "dudiTujuan")
      });
    }
  }
  return Array.from(studentsMap.values()).map((stu) => {
    const summary = buildStudentMonitoringSummary(stu, monitoringRows, nilaiRows);
    return {
      ...stu,
      ...summary,
      recommendedStage: pickRecommendedStageForControl(
        summary.completedStages,
        stageControl,
        issuedStages
      )
    };
  });
}

// server/routes/public/publicStudentRoutes.ts
function registerPublicStudentRoutes(app2) {
  app2.get("/api/public/config-summary", async (_req, res) => {
    try {
      const cfg = await getFirestoreWorkspaceConfig();
      res.json({
        success: true,
        activeYear: cfg.activeYear,
        isConfigured: Boolean(cfg.spreadsheetId),
        hasGasUrl: Boolean(cfg.gasDeployUrl),
        spreadsheetName: cfg.spreadsheetName
      });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
  app2.get("/api/public/student-lookup/:nis", async (req, res) => {
    try {
      const rawSearchNis = String(req.params.nis || "").trim();
      const searchNisDigits = stripNisSymbols(rawSearchNis);
      if (!rawSearchNis && !searchNisDigits) {
        return res.status(400).json({ success: false, found: false, message: "NIS wajib diisi." });
      }
      const { rows, config } = await fetchMasterSiswaRows();
      const byKey = getOrBuildSiswaIndex(config.spreadsheetId, rows);
      const student = (searchNisDigits ? byKey.get(searchNisDigits) : void 0) || byKey.get(rawSearchNis);
      if (!student) {
        return res.json({
          success: true,
          found: false,
          message: `Siswa dengan NIS [${rawSearchNis}] tidak ditemukan di Database Sekolah.`
        });
      }
      return res.json({
        success: true,
        found: true,
        student: mapPublicStudentRecord(student)
      });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
  app2.get("/api/public/dudi-list", async (req, res) => {
    try {
      const fresh = String(req.query.fresh || "") === "1";
      const { rows, config } = await fetchLiveSheetViaGas("Master_DUDI", fresh);
      const mapped = mapPublicDudiRows(rows);
      const etag = computeWeakEtag({ s: config.spreadsheetId, y: config.activeYear, k: "public_dudi", mapped });
      res.setHeader("ETag", etag);
      if (!fresh && isEtagMatched(req, etag)) {
        return res.status(304).end();
      }
      res.json({ success: true, total: mapped.length, etag, data: mapped });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
  app2.post("/api/public/submit-application", async (req, res) => {
    try {
      const payload = req.body || {};
      if (!payload.nis || !payload.nama) {
        return res.status(400).json({ success: false, message: "NIS dan Nama Siswa wajib diisi." });
      }
      const rawMapsInput = String(payload.link_maps || payload.Link_Maps || payload.linkMaps || "").trim();
      const mapsCheck = validateGoogleMapsUrl(rawMapsInput);
      if (!mapsCheck.valid) {
        return res.status(400).json({
          success: false,
          message: mapsCheck.error || "Link Google Maps lokasi PKL tidak valid."
        });
      }
      const rawNisStr = String(payload.nis).trim();
      const cleanNisInput = stripNisSymbols(rawNisStr) || rawNisStr;
      const masterSiswaRes = await fetchMasterSiswaRows().catch(() => ({ rows: [] }));
      let canonicalNis = cleanNisInput;
      let canonicalNama = String(payload.nama).trim();
      let canonicalJurusan = String(payload.jurusan || "");
      let canonicalKelas = String(payload.kelas || "");
      let matchedStudent = null;
      if (masterSiswaRes.rows.length > 0) {
        matchedStudent = masterSiswaRes.rows.find((s) => {
          const rowNis = pickField(s, "NIS", "nis");
          const rowDigits = stripNisSymbols(rowNis);
          return cleanNisInput && rowDigits === cleanNisInput || rowNis.toLowerCase() === rawNisStr.toLowerCase();
        }) || null;
        if (!matchedStudent) {
          return res.status(400).json({
            success: false,
            message: `NIS [${rawNisStr}] tidak terdaftar di Master Siswa. Hubungi Admin Hubin.`
          });
        }
        const mNis = pickField(matchedStudent, "NIS", "nis");
        canonicalNis = stripNisSymbols(mNis) || mNis || cleanNisInput;
        canonicalNama = pickField(matchedStudent, "Nama_Lengkap", "namaLengkap", "nama") || canonicalNama;
        canonicalJurusan = pickField(matchedStudent, "ID_Jurusan", "jurusan", "Jurusan") || canonicalJurusan;
        canonicalKelas = pickField(matchedStudent, "Kelas", "kelas") || canonicalKelas;
      }
      let resolvedDudiId = payload.dudi_id && payload.dudi_id !== "custom_hubin" ? String(payload.dudi_id).trim() : "";
      let resolvedDudiNama = String(payload.nama_dudi || "").trim();
      let autoIdGuruPendamping = "";
      let autoGuruPendamping = "";
      let matchedDudiRow = null;
      if (!payload.is_dudi_unregistered && (resolvedDudiId || resolvedDudiNama)) {
        try {
          const dudiRes = await fetchLiveSheetViaGas("Master_DUDI", false);
          matchedDudiRow = dudiRes.rows.find((d) => {
            const dId = pickField(d, "ID", "id");
            const dNama = normalizeStr(pickField(d, "Nama_DUDI", "namaDudi"));
            return resolvedDudiId && dId === resolvedDudiId || resolvedDudiNama && dNama === normalizeStr(resolvedDudiNama);
          }) || null;
          if (matchedDudiRow) {
            resolvedDudiId = pickField(matchedDudiRow, "ID", "id") || resolvedDudiId;
            resolvedDudiNama = pickField(matchedDudiRow, "Nama_DUDI", "namaDudi") || resolvedDudiNama;
            autoIdGuruPendamping = pickField(
              matchedDudiRow,
              "ID_Guru_Pendamping",
              "idGuruPendamping"
            );
            autoGuruPendamping = pickField(matchedDudiRow, "Guru_Pendamping", "guruPendamping");
          }
        } catch {
        }
      }
      const cleanClientRequestId = String(payload.client_request_id || "").trim();
      try {
        const existingRes = await fetchLiveSheetViaGas("Data_Pengajuan_PKL", true);
        const existingApp = existingRes.rows.find((r) => {
          const rReqId = pickField(r, "No_Pengajuan", "noPengajuan", "id");
          if (cleanClientRequestId && rReqId === cleanClientRequestId) return true;
          const rNis = stripNisSymbols(pickField(r, "NIS", "nis")) || pickField(r, "NIS", "nis");
          const rStatusKakomli = normalizeStr(pickField(r, "Status_Kakomli", "statusKakomli"));
          if (!canonicalNis || rNis !== canonicalNis || rStatusKakomli !== "pending") return false;
          const rDudiId = pickField(r, "ID_DUDI", "idDudi");
          const rDudiNama = normalizeStr(pickField(r, "DUDI_Tujuan", "dudiTujuan", "nama_dudi"));
          return resolvedDudiId && rDudiId === resolvedDudiId || resolvedDudiNama && rDudiNama === normalizeStr(resolvedDudiNama);
        });
        if (existingApp) {
          const existingId = pickField(existingApp, "No_Pengajuan", "noPengajuan", "id");
          const existingMaps = pickField(existingApp, "Link_Maps", "linkMaps", "link_maps");
          const existingHari = pickField(existingApp, "Hari_Kerja", "hariKerja", "hari_kerja");
          const existingJam = pickField(existingApp, "Jam_Kerja", "jamKerja", "jam_kerja");
          return res.json({
            success: true,
            deduplicated: true,
            verifiedInSpreadsheet: true,
            sheetRowNumber: existingApp._sheetRowNumber,
            savedAt: (/* @__PURE__ */ new Date()).toISOString(),
            message: "Pengajuan PKL Anda untuk DUDI ini sudah tercatat di Cloud Server.",
            application: {
              ...existingApp,
              id: existingId,
              No_Pengajuan: existingId,
              nis: canonicalNis,
              nama_siswa: pickField(existingApp, "Nama_Siswa", "namaSiswa", "nama_siswa") || canonicalNama,
              kelas: pickField(existingApp, "Kelas", "kelas") || canonicalKelas,
              jurusan: pickField(existingApp, "Jurusan", "jurusan") || canonicalJurusan,
              nama_dudi: pickField(existingApp, "DUDI_Tujuan", "dudiTujuan", "nama_dudi") || resolvedDudiNama,
              Hari_Kerja: existingHari || String(payload.hari_kerja || "").trim(),
              hari_kerja: existingHari || String(payload.hari_kerja || "").trim(),
              Jam_Kerja: existingJam || String(payload.jam_kerja || "").trim(),
              jam_kerja: existingJam || String(payload.jam_kerja || "").trim(),
              Link_Maps: existingMaps || mapsCheck.normalizedUrl,
              link_maps: existingMaps || mapsCheck.normalizedUrl,
              status: pickField(existingApp, "Status_Hubin", "statusHubin", "status") || "Menunggu ACC Kakomli"
            }
          });
        }
      } catch {
      }
      const jurCode = generateJurusanCode(canonicalJurusan) || String(canonicalJurusan || "PKL").substring(0, 3).toUpperCase();
      const noPengajuan = cleanClientRequestId || `REQ-${(/* @__PURE__ */ new Date()).getFullYear()}-${jurCode}-${Math.floor(100 + Math.random() * 900)}`;
      const timestamp = getTodayWibDateTime();
      const baseStatusNote = payload.is_dudi_unregistered ? "Pengajuan DUDI baru (perlu verifikasi kelayakan Hubin)." : "Menunggu review relevansi kompetensi oleh Kakomli.";
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
        Alamat_DUDI: String(payload.alamat_dudi || ""),
        alamatDudi: String(payload.alamat_dudi || ""),
        Bidang_Pekerjaan: String(payload.bidang_dudi || ""),
        bidangPekerjaan: String(payload.bidang_dudi || ""),
        Nama_Pemimpin: "",
        namaPemimpin: "",
        Nama_PIC: "",
        namaPic: "",
        No_Telp_DUDI: "",
        noTelpDudi: "",
        Kontak_PIC: "",
        kontakPic: "",
        Hari_Kerja: String(payload.hari_kerja || payload.Hari_Kerja || "").trim(),
        hariKerja: String(payload.hari_kerja || payload.Hari_Kerja || "").trim(),
        hari_kerja: String(payload.hari_kerja || payload.Hari_Kerja || "").trim(),
        Jam_Kerja: String(payload.jam_kerja || payload.Jam_Kerja || "").trim(),
        jamKerja: String(payload.jam_kerja || payload.Jam_Kerja || "").trim(),
        jam_kerja: String(payload.jam_kerja || payload.Jam_Kerja || "").trim(),
        Link_Maps: mapsCheck.normalizedUrl,
        linkMaps: mapsCheck.normalizedUrl,
        link_maps: mapsCheck.normalizedUrl,
        No_WA: String(payload.telepon || ""),
        noWa: String(payload.telepon || ""),
        Alamat_Domisili: String(payload.alamat_domisili || ""),
        alamatDomisili: String(payload.alamat_domisili || ""),
        Nama_Ortu_Wali: String(payload.nama_orang_tua || ""),
        namaOrtuWali: String(payload.nama_orang_tua || ""),
        No_Ortu_Wali: String(payload.telepon_orang_tua || ""),
        noOrtuWali: String(payload.telepon_orang_tua || ""),
        Status_Kakomli: "Pending",
        statusKakomli: "Pending",
        Catatan_Kakomli: baseStatusNote,
        catatanKakomli: baseStatusNote,
        Status_Hubin: "Menunggu ACC Kakomli",
        statusHubin: "Menunggu ACC Kakomli",
        ID_Guru_Pendamping: autoIdGuruPendamping,
        idGuruPendamping: autoIdGuruPendamping,
        Guru_Pendamping: autoGuruPendamping,
        guruPendamping: autoGuruPendamping,
        Tgl_Berangkat: "",
        tanggalBerangkat: "",
        status: "Menunggu Validasi Kakomli"
      };
      const persistedPengajuan = GoogleDriveSheetService.getInstance().stripFormulaManagedFields(
        "Data_Pengajuan_PKL",
        sheetRow
      );
      const writeReceipt = await writeLiveSheetViaGas("Data_Pengajuan_PKL", "CREATE", persistedPengajuan);
      if (matchedStudent) {
        const siswaId = pickField(matchedStudent, "ID", "id", "NIS", "nis");
        if (siswaId) {
          const inputNoHp = String(payload.telepon || "").trim();
          const inputAlamat = String(payload.alamat_domisili || "").trim();
          const inputNamaOrtu = String(payload.nama_orang_tua || "").trim();
          const inputNoOrtu = String(payload.telepon_orang_tua || "").trim();
          const currNoHp = pickField(matchedStudent, "No_HP_Siswa", "noHpSiswa");
          const currAlamat = pickField(matchedStudent, "Alamat_Domisili", "alamatDomisili");
          const currNamaOrtu = pickField(matchedStudent, "Nama_Ortu_Wali", "namaOrtuWali");
          const currNoOrtu = pickField(matchedStudent, "No_Ortu_Wali", "noOrtuWali");
          const currStatus = pickField(matchedStudent, "Status_PKL", "statusPKL");
          const studentUpdates = {};
          if (inputNoHp && inputNoHp !== currNoHp) studentUpdates.No_HP_Siswa = inputNoHp;
          if (inputAlamat && inputAlamat !== currAlamat) studentUpdates.Alamat_Domisili = inputAlamat;
          if (inputNamaOrtu && inputNamaOrtu !== currNamaOrtu) studentUpdates.Nama_Ortu_Wali = inputNamaOrtu;
          if (inputNoOrtu && inputNoOrtu !== currNoOrtu) studentUpdates.No_Ortu_Wali = inputNoOrtu;
          if (!currStatus || normalizeStr(currStatus) === "belum daftar") {
            studentUpdates.Status_PKL = "Diajukan";
          }
          if (Object.keys(studentUpdates).length > 0) {
            await writeLiveSheetViaGas("Master_Siswa_XI", "UPDATE", {
              id: siswaId,
              ID: siswaId,
              _sheetRowNumber: matchedStudent._sheetRowNumber,
              ...studentUpdates
            }).catch(() => {
            });
          }
        }
      }
      if (matchedDudiRow) {
        const inputHari = String(payload.hari_kerja || payload.Hari_Kerja || "").trim();
        const inputJam = String(payload.jam_kerja || payload.Jam_Kerja || "").trim();
        const dudiUpdates = {};
        if (mapsCheck.normalizedUrl && !pickField(matchedDudiRow, "Link_Maps", "linkMaps", "link_maps")) {
          dudiUpdates.Link_Maps = mapsCheck.normalizedUrl;
          dudiUpdates.linkMaps = mapsCheck.normalizedUrl;
        }
        if (inputHari && !pickField(matchedDudiRow, "Hari_Kerja", "hariKerja", "hari_kerja")) {
          dudiUpdates.Hari_Kerja = inputHari;
          dudiUpdates.hariKerja = inputHari;
        }
        if (inputJam && !pickField(matchedDudiRow, "Jam_Kerja", "jamKerja", "jam_kerja")) {
          dudiUpdates.Jam_Kerja = inputJam;
          dudiUpdates.jamKerja = inputJam;
        }
        if (Object.keys(dudiUpdates).length > 0) {
          try {
            const targetDudiId = pickField(matchedDudiRow, "ID", "id");
            if (targetDudiId) {
              await writeLiveSheetViaGas("Master_DUDI", "UPDATE", {
                id: targetDudiId,
                ID: targetDudiId,
                _sheetRowNumber: matchedDudiRow._sheetRowNumber,
                ...dudiUpdates
              });
            }
          } catch {
          }
        }
      }
      res.json({
        success: true,
        verifiedInSpreadsheet: writeReceipt.verified,
        sheetRowNumber: writeReceipt.sheetRowNumber,
        savedAt: writeReceipt.savedAt,
        message: "Pengajuan PKL berhasil disimpan dan diverifikasi ke Cloud Server.",
        application: sheetRow
      });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
}

// server/routes/public/publicTeacherMonitoringRoutes.ts
import crypto4 from "node:crypto";

// server/services/monitoringDomainService.ts
async function syncDudiContactToMasterAndPengajuan(input) {
  const targetDudiId = String(input.dudiId || "").trim();
  const targetDudiNameRaw = String(input.namaDudi || "").trim();
  const targetDudiNameNorm = normalizeStr(targetDudiNameRaw);
  const inputPemimpin = String(input.namaPemimpin || "").trim();
  const inputPic = String(input.namaPic || "").trim();
  const inputTelpDudi = String(input.noTelpDudi || "").trim();
  const inputHariKerja = String(input.hariKerja || "").trim();
  const inputJamKerja = String(input.jamKerja || "").trim();
  const overwrite = input.overwriteExisting !== false;
  if (!inputPemimpin && !inputPic && !inputTelpDudi && !inputHariKerja && !inputJamKerja) {
    return false;
  }
  const dudiRes = await fetchLiveSheetViaGas("Master_DUDI", true).catch(() => ({ rows: [] }));
  const existingDudi = dudiRes.rows.find((d) => {
    const dId = pickField(d, "ID", "id");
    const dNama = normalizeStr(pickField(d, "Nama_DUDI", "namaDudi"));
    return targetDudiId && dId === targetDudiId || targetDudiNameNorm && (dNama === targetDudiNameNorm || dNama.includes(targetDudiNameNorm));
  });
  let synced = false;
  if (existingDudi) {
    const resolvedId = pickField(existingDudi, "ID", "id") || targetDudiId;
    const nextPemimpin = overwrite ? inputPemimpin || pickField(existingDudi, "Nama_Pemimpin", "namaPemimpin") : pickField(existingDudi, "Nama_Pemimpin", "namaPemimpin") || inputPemimpin;
    const nextPic = overwrite ? inputPic || pickField(existingDudi, "Nama_PIC", "namaPic") : pickField(existingDudi, "Nama_PIC", "namaPic") || inputPic;
    const nextTelp = overwrite ? inputTelpDudi || pickField(existingDudi, "No_Telp_DUDI", "noTelpDudi", "Kontak_PIC", "kontakPic") : pickField(existingDudi, "No_Telp_DUDI", "noTelpDudi", "Kontak_PIC", "kontakPic") || inputTelpDudi;
    const nextHariKerja = overwrite ? inputHariKerja || pickField(existingDudi, "Hari_Kerja", "hariKerja") : pickField(existingDudi, "Hari_Kerja", "hariKerja") || inputHariKerja;
    const nextJamKerja = overwrite ? inputJamKerja || pickField(existingDudi, "Jam_Kerja", "jamKerja") : pickField(existingDudi, "Jam_Kerja", "jamKerja") || inputJamKerja;
    await writeLiveSheetViaGas("Master_DUDI", "UPDATE", {
      ...existingDudi,
      id: resolvedId,
      ID: resolvedId,
      Nama_Pemimpin: nextPemimpin,
      namaPemimpin: nextPemimpin,
      Nama_PIC: nextPic,
      namaPic: nextPic,
      Kontak_PIC: nextTelp,
      kontakPic: nextTelp,
      No_Telp_DUDI: nextTelp,
      noTelpDudi: nextTelp,
      Hari_Kerja: nextHariKerja,
      hariKerja: nextHariKerja,
      Jam_Kerja: nextJamKerja,
      jamKerja: nextJamKerja
    });
    synced = true;
  } else if (input.createIfMissing !== false && targetDudiNameRaw) {
    const newDudiId = targetDudiId && !targetDudiId.includes("::") ? targetDudiId : `DUD-${Date.now().toString(36).toUpperCase()}`;
    await writeLiveSheetViaGas("Master_DUDI", "CREATE", {
      id: newDudiId,
      ID: newDudiId,
      Nama_DUDI: targetDudiNameRaw,
      Bidang_Keahlian: "-",
      Alamat: String(input.alamatDudi || "-").trim(),
      Wilayah_Kota: "Ponorogo",
      Nama_Pemimpin: inputPemimpin,
      Nama_PIC: inputPic,
      Kontak_PIC: inputTelpDudi,
      No_Telp_DUDI: inputTelpDudi,
      Hari_Kerja: inputHariKerja,
      Jam_Kerja: inputJamKerja,
      Kuota_Maksimal: 4,
      Status_Kerjasama: "Mitra Baru"
    });
    synced = true;
  }
  const reqRes = await fetchLiveSheetViaGas("Data_Pengajuan_PKL", false).catch(() => ({ rows: [] }));
  const matchingReqs = reqRes.rows.filter((r) => {
    const rDudiId = pickField(r, "ID_DUDI", "idDudi");
    const rDudiNama = normalizeStr(pickField(r, "DUDI_Tujuan", "dudiTujuan"));
    const isTarget = targetDudiId && rDudiId === targetDudiId || targetDudiNameNorm && rDudiNama === targetDudiNameNorm;
    const hasBlankContact = !pickField(r, "Nama_Pemimpin", "namaPemimpin") || !pickField(r, "Nama_PIC", "namaPic") || !pickField(r, "No_Telp_DUDI", "noTelpDudi") || inputHariKerja && !pickField(r, "Hari_Kerja", "hariKerja") || inputJamKerja && !pickField(r, "Jam_Kerja", "jamKerja");
    return isTarget && hasBlankContact;
  });
  const pengajuanUpdates = [];
  for (const mr of matchingReqs.slice(0, 10)) {
    const mrId = pickField(mr, "No_Pengajuan", "noPengajuan", "id");
    if (!mrId) continue;
    pengajuanUpdates.push({
      ...mr,
      id: mrId,
      No_Pengajuan: mrId,
      Nama_Pemimpin: pickField(mr, "Nama_Pemimpin", "namaPemimpin") || inputPemimpin,
      Nama_PIC: pickField(mr, "Nama_PIC", "namaPic") || inputPic,
      No_Telp_DUDI: pickField(mr, "No_Telp_DUDI", "noTelpDudi") || inputTelpDudi,
      Kontak_PIC: pickField(mr, "Kontak_PIC", "kontakPic") || inputTelpDudi,
      Hari_Kerja: pickField(mr, "Hari_Kerja", "hariKerja") || inputHariKerja,
      Jam_Kerja: pickField(mr, "Jam_Kerja", "jamKerja") || inputJamKerja
    });
  }
  if (pengajuanUpdates.length > 0) {
    await writeLiveSheetViaGas("Data_Pengajuan_PKL", "BULK_UPDATE", {
      ids: pengajuanUpdates.map((r) => r.id),
      updatedRows: pengajuanUpdates
    }).catch(() => {
    });
  }
  return synced;
}
async function upsertNilaiDanSertifikat(input) {
  const nilaiRes = await fetchLiveSheetViaGas("Nilai_Dan_Sertifikat", true).catch(() => ({ rows: [] }));
  const cleanNis = stripNisSymbols(input.nis) || String(input.nis || "").trim();
  const idPenempatan = String(input.idPenempatan || `PLT-${cleanNis}`).trim();
  let resolvedDudiId = String(input.idDudi || "").trim();
  if (!resolvedDudiId && input.namaDudi) {
    const dudiRes = await fetchLiveSheetViaGas("Master_DUDI", false).catch(() => ({ rows: [] }));
    const targetDudiNorm = normalizeStr(input.namaDudi);
    const matchedDudi = dudiRes.rows.find(
      (d) => normalizeStr(pickField(d, "Nama_DUDI", "namaDudi")) === targetDudiNorm
    );
    if (matchedDudi) {
      resolvedDudiId = pickField(matchedDudi, "ID", "id");
    }
  }
  const existingNilai = nilaiRes.rows.find((n) => {
    const rowNis = pickField(n, "NIS", "nis");
    const rowNisDigits = stripNisSymbols(rowNis);
    const rowPlt = pickField(n, "ID_Penempatan", "idPenempatan");
    return cleanNis && (rowNisDigits === cleanNis || rowNis === cleanNis) || idPenempatan && rowPlt === idPenempatan;
  });
  if (existingNilai) {
    const existingId = pickField(existingNilai, "ID_Penempatan", "idPenempatan", "id") || idPenempatan;
    const existingDudiId = pickField(existingNilai, "ID_DUDI", "idDudi") || resolvedDudiId;
    await writeLiveSheetViaGas("Nilai_Dan_Sertifikat", "UPDATE", {
      id: existingId,
      ID_Penempatan: existingId,
      idPenempatan: existingId,
      _sheetRowNumber: existingNilai._sheetRowNumber,
      NIS: cleanNis || pickField(existingNilai, "NIS", "nis"),
      nis: cleanNis || pickField(existingNilai, "NIS", "nis"),
      ID_DUDI: existingDudiId,
      idDudi: existingDudiId,
      No_Seri_Blangko: pickField(existingNilai, "No_Seri_Blangko", "noSeriBlangko"),
      noSeriBlangko: pickField(existingNilai, "No_Seri_Blangko", "noSeriBlangko"),
      Status_Blangko: pickField(existingNilai, "Status_Blangko", "statusBlangko") || "Tersedia",
      statusBlangko: pickField(existingNilai, "Status_Blangko", "statusBlangko") || "Tersedia",
      Status_Raport: "Siap Cetak",
      statusRaport: "Siap Cetak",
      Tgl_Terbit: pickField(existingNilai, "Tgl_Terbit", "tanggalTerbit") || input.tglTerbit,
      tanggalTerbit: pickField(existingNilai, "Tgl_Terbit", "tanggalTerbit") || input.tglTerbit
    });
    return;
  }
  await writeLiveSheetViaGas("Nilai_Dan_Sertifikat", "CREATE", {
    id: idPenempatan,
    ID_Penempatan: idPenempatan,
    idPenempatan,
    NIS: cleanNis,
    nis: cleanNis,
    ID_DUDI: resolvedDudiId,
    idDudi: resolvedDudiId,
    No_Seri_Blangko: "",
    noSeriBlangko: "",
    Status_Blangko: "Tersedia",
    statusBlangko: "Tersedia",
    Status_Raport: "Siap Cetak",
    statusRaport: "Siap Cetak",
    Tgl_Terbit: input.tglTerbit,
    tanggalTerbit: input.tglTerbit
  });
}
function mapRawIssuedLetterRow(row, idx) {
  const idTerbit = pickField(row, "ID_Terbit", "idTerbit", "id") || `TRB-ROW-${Number(row?._sheetRowNumber || idx + 2)}`;
  const tahap = extractIssuedStageNumber(row?.Tahap ?? row?.tahap) || extractIssuedStageNumber(row?.Nama_Tahap ?? row?.namaTahap) || 1;
  return {
    id: idTerbit,
    idTerbit,
    idDudi: pickField(row, "ID_DUDI", "idDudi"),
    namaDudi: pickField(row, "Nama_DUDI", "namaDudi"),
    tahap,
    namaTahap: pickField(row, "Nama_Tahap", "namaTahap") || getStageValueByNumber(tahap),
    statusTerbit: pickField(row, "Status_Terbit", "statusTerbit") || "Sudah Terbit",
    jenisDokumen: pickField(row, "Jenis_Dokumen", "jenisDokumen"),
    nomorSurat: pickField(row, "Nomor_Surat", "nomorSurat"),
    tanggalTerbit: pickField(row, "Tanggal_Terbit", "tanggalTerbit"),
    diterbitkanOleh: pickField(row, "Diterbitkan_Oleh", "diterbitkanOleh"),
    guruPendamping: pickField(row, "Guru_Pendamping", "guruPendamping"),
    linkPdf: pickField(row, "Link_PDF", "linkPdf"),
    updatedAt: pickField(row, "Updated_At", "updatedAt"),
    _sheetRowNumber: typeof row?._sheetRowNumber === "number" ? row._sheetRowNumber : void 0
  };
}
async function fetchIssuedLettersList(forceRefresh = false) {
  const res = await fetchLiveSheetViaGas("Log_Penerbitan_Surat", forceRefresh).catch(() => ({
    rows: []
  }));
  return (Array.isArray(res.rows) ? res.rows : []).map(
    (row, idx) => mapRawIssuedLetterRow(row, idx)
  );
}
async function recordIssuedLetters(items, actorName) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const [existingRes, dudiRes] = await Promise.all([
    fetchLiveSheetViaGas("Log_Penerbitan_Surat", true).catch(() => ({ rows: [] })),
    fetchLiveSheetViaGas("Master_DUDI", false).catch(() => ({ rows: [] }))
  ]);
  const existingRows = Array.isArray(existingRes.rows) ? [...existingRes.rows] : [];
  const dudiRows = Array.isArray(dudiRes.rows) ? dudiRes.rows : [];
  const todayIso = getTodayWibIsoDate();
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const results = [];
  for (let i = 0; i < items.length; i += 1) {
    const rawItem = items[i];
    const tahap = Number(rawItem?.tahap);
    const rawName = String(rawItem?.namaDudi || "").trim().slice(0, 180);
    let resolvedDudiId = String(rawItem?.dudiId || "").trim().slice(0, 80);
    if (!Number.isInteger(tahap) || tahap < 1 || tahap > 8 || !rawName && !resolvedDudiId) {
      continue;
    }
    const targetNorm = normalizeStr(rawName);
    const matchedDudi = dudiRows.find((d) => {
      const mId = pickField(d, "ID", "id");
      const mNama = normalizeStr(pickField(d, "Nama_DUDI", "namaDudi"));
      return resolvedDudiId && mId === resolvedDudiId || targetNorm && mNama === targetNorm;
    });
    if (matchedDudi) {
      resolvedDudiId = pickField(matchedDudi, "ID", "id") || resolvedDudiId;
    }
    const resolvedDudiNama = rawName || pickField(matchedDudi || {}, "Nama_DUDI", "namaDudi") || resolvedDudiId;
    const existingIdx = existingRows.findIndex((r) => {
      const rowStage = extractIssuedStageNumber(r.Tahap ?? r.tahap) || extractIssuedStageNumber(r.Nama_Tahap ?? r.namaTahap);
      if (rowStage !== tahap) return false;
      const rId = pickField(r, "ID_DUDI", "idDudi");
      const rNama = normalizeStr(pickField(r, "Nama_DUDI", "namaDudi"));
      return resolvedDudiId && rId && rId === resolvedDudiId || targetNorm && rNama && rNama === targetNorm;
    });
    const namaTahap = getStageValueByNumber(tahap);
    const existingRow = existingIdx >= 0 ? existingRows[existingIdx] : null;
    const existingIdTerbit = existingRow ? pickField(existingRow, "ID_Terbit", "idTerbit", "id") : "";
    const idTerbit = existingIdTerbit || `TRB-${(resolvedDudiId || "DUDI").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24)}-T${tahap}-${Date.now().toString(36).slice(-4)}${i}`;
    const recordPayload = {
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
      Status_Terbit: "Sudah Terbit",
      statusTerbit: "Sudah Terbit",
      Jenis_Dokumen: String(rawItem.jenisDokumen || "").trim().slice(0, 120) || pickField(existingRow || {}, "Jenis_Dokumen", "jenisDokumen") || "Paket / Surat Supervisi",
      jenisDokumen: String(rawItem.jenisDokumen || "").trim().slice(0, 120) || pickField(existingRow || {}, "Jenis_Dokumen", "jenisDokumen") || "Paket / Surat Supervisi",
      Nomor_Surat: String(rawItem.nomorSurat || "").trim().slice(0, 120) || pickField(existingRow || {}, "Nomor_Surat", "nomorSurat"),
      nomorSurat: String(rawItem.nomorSurat || "").trim().slice(0, 120) || pickField(existingRow || {}, "Nomor_Surat", "nomorSurat"),
      Tanggal_Terbit: String(rawItem.tanggalTerbit || "").trim().slice(0, 40) || todayIso,
      tanggalTerbit: String(rawItem.tanggalTerbit || "").trim().slice(0, 40) || todayIso,
      Diterbitkan_Oleh: String(rawItem.diterbitkanOleh || actorName || "Admin Hubin").trim().slice(0, 120),
      diterbitkanOleh: String(rawItem.diterbitkanOleh || actorName || "Admin Hubin").trim().slice(0, 120),
      Guru_Pendamping: String(rawItem.guruPendamping || "").trim().slice(0, 120) || pickField(existingRow || {}, "Guru_Pendamping", "guruPendamping"),
      guruPendamping: String(rawItem.guruPendamping || "").trim().slice(0, 120) || pickField(existingRow || {}, "Guru_Pendamping", "guruPendamping"),
      Link_PDF: String(rawItem.linkPdf || "").trim().slice(0, 500) || pickField(existingRow || {}, "Link_PDF", "linkPdf"),
      linkPdf: String(rawItem.linkPdf || "").trim().slice(0, 500) || pickField(existingRow || {}, "Link_PDF", "linkPdf"),
      Updated_At: nowIso,
      updatedAt: nowIso
    };
    if (existingRow) {
      await writeLiveSheetViaGas("Log_Penerbitan_Surat", "UPDATE", {
        ...recordPayload,
        _sheetRowNumber: existingRow._sheetRowNumber
      });
      existingRows[existingIdx] = { ...existingRow, ...recordPayload };
    } else {
      await writeLiveSheetViaGas("Log_Penerbitan_Surat", "CREATE", recordPayload);
      existingRows.push(recordPayload);
    }
    results.push(mapRawIssuedLetterRow(recordPayload, existingIdx >= 0 ? existingIdx : existingRows.length - 1));
  }
  const cfg = await getFirestoreWorkspaceConfig().catch(() => null);
  if (cfg?.spreadsheetId) {
    invalidateSheetCacheEntry(cfg.spreadsheetId, "Log_Penerbitan_Surat");
  }
  return results;
}
async function revokeIssuedLetter(params) {
  const tahap = Number(params.tahap);
  if (!Number.isInteger(tahap) || tahap < 1 || tahap > 8) {
    return { revoked: false };
  }
  const existingRes = await fetchLiveSheetViaGas("Log_Penerbitan_Surat", true).catch(() => ({
    rows: []
  }));
  const rows = Array.isArray(existingRes.rows) ? existingRes.rows : [];
  const targetIdTerbit = String(params.idTerbit || "").trim();
  const targetDudiId = String(params.dudiId || "").trim();
  const targetDudiNorm = normalizeStr(params.namaDudi || "");
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const matchingRows = rows.filter((r) => {
    const rIdTerbit = pickField(r, "ID_Terbit", "idTerbit", "id");
    if (targetIdTerbit && rIdTerbit === targetIdTerbit) return true;
    const rowStage = extractIssuedStageNumber(r.Tahap ?? r.tahap) || extractIssuedStageNumber(r.Nama_Tahap ?? r.namaTahap);
    if (rowStage !== tahap) return false;
    const rDudiId = pickField(r, "ID_DUDI", "idDudi");
    const rDudiNama = normalizeStr(pickField(r, "Nama_DUDI", "namaDudi"));
    return targetDudiId && rDudiId && rDudiId === targetDudiId || targetDudiNorm && rDudiNama && rDudiNama === targetDudiNorm;
  });
  if (matchingRows.length === 0) {
    return { revoked: false };
  }
  let lastIdTerbit = "";
  for (const row of matchingRows) {
    if (!isIssuedLetterStatusActive(row.Status_Terbit ?? row.statusTerbit)) continue;
    const rowIdTerbit = pickField(row, "ID_Terbit", "idTerbit", "id");
    lastIdTerbit = rowIdTerbit || lastIdTerbit;
    await writeLiveSheetViaGas("Log_Penerbitan_Surat", "UPDATE", {
      ...row,
      id: rowIdTerbit,
      ID_Terbit: rowIdTerbit,
      idTerbit: rowIdTerbit,
      _sheetRowNumber: row._sheetRowNumber,
      Status_Terbit: "Dibatalkan",
      statusTerbit: "Dibatalkan",
      Diterbitkan_Oleh: `${String(params.actorName || "Admin Hubin").trim().slice(0, 80)} (Dibatalkan)`,
      diterbitkanOleh: `${String(params.actorName || "Admin Hubin").trim().slice(0, 80)} (Dibatalkan)`,
      Updated_At: nowIso,
      updatedAt: nowIso
    });
  }
  const cfg = await getFirestoreWorkspaceConfig().catch(() => null);
  if (cfg?.spreadsheetId) {
    invalidateSheetCacheEntry(cfg.spreadsheetId, "Log_Penerbitan_Surat");
  }
  return { revoked: true, idTerbit: lastIdTerbit || void 0 };
}

// server/routes/public/publicTeacherMonitoringRoutes.ts
function constantTimeMatch(a, b) {
  const hashA = crypto4.createHash("sha256").update(a, "utf8").digest();
  const hashB = crypto4.createHash("sha256").update(b, "utf8").digest();
  return crypto4.timingSafeEqual(hashA, hashB);
}
function registerPublicTeacherMonitoringRoutes(app2) {
  app2.get("/api/public/petugas-list", async (req, res) => {
    try {
      const fresh = String(req.query.fresh || "") === "1";
      const { rows, config } = await fetchLiveSheetViaGas("Master_Guru_Pendamping", fresh);
      const mapped = mapPublicPetugasRows(rows);
      if (!isServerlessRuntime) {
        void fetchBatchSheetsViaGas(
          ["Plotting_Pemberangkatan", "Master_DUDI"],
          /* @__PURE__ */ new Set(["Plotting_Pemberangkatan", "Master_DUDI"])
        ).catch(() => {
        });
      }
      const etag = computeWeakEtag({ s: config.spreadsheetId, y: config.activeYear, k: "public_petugas", mapped });
      res.setHeader("ETag", etag);
      if (!fresh && isEtagMatched(req, etag)) {
        return res.status(304).end();
      }
      res.json({ success: true, total: mapped.length, etag, data: mapped });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
  app2.get("/api/public/monitoring-stage-config", async (req, res) => {
    try {
      const fresh = String(req.query.fresh || "") === "1";
      const config = await getFirestoreWorkspaceConfig(fresh);
      res.setHeader("Cache-Control", "no-store");
      res.json({
        success: true,
        data: normalizeServerMonitoringStageControl(config.monitoringStageControl)
      });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
  app2.post("/api/public/verify-petugas-pin", async (req, res) => {
    try {
      const { petugas_id, nama_petugas, pin } = req.body || {};
      const enteredPin = String(pin || "").trim();
      if (!enteredPin || enteredPin.length < 4) {
        return res.status(400).json({ success: false, message: "PIN Petugas 4 digit wajib diisi." });
      }
      const { rows } = await fetchLiveSheetViaGas("Master_Guru_Pendamping");
      const teacher = rows.find((g) => {
        const id = pickField(g, "ID", "ID_Guru", "idGuru", "id");
        const nama = pickField(g, "Nama_Lengkap", "Nama_Guru", "namaGuru", "nama", "Nama");
        return petugas_id && id === String(petugas_id).trim() || nama_petugas && normalizeStr(nama) === normalizeStr(nama_petugas);
      });
      if (!teacher) {
        return res.status(404).json({
          success: false,
          code: "PETUGAS_NOT_FOUND",
          message: "Data petugas tidak ditemukan di Database Cloud Server."
        });
      }
      const explicitPin = pickField(teacher, "PIN", "pin", "Pin");
      const nipDigits = pickField(teacher, "NIP", "nip").replace(/\D/g, "");
      const waDigits = pickField(teacher, "Kontak_WA", "kontakWA", "kontakWa", "No_WA", "noWa", "No_HP").replace(/\D/g, "");
      const validPins = [];
      if (explicitPin) validPins.push(explicitPin);
      if (nipDigits.length >= 4) validPins.push(nipDigits.slice(-4));
      if (waDigits.length >= 4) validPins.push(waDigits.slice(-4));
      if (validPins.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Petugas belum memiliki PIN atau No. WhatsApp terdaftar di Cloud Server untuk verifikasi."
        });
      }
      const pinMatched = validPins.some((candidate) => constantTimeMatch(candidate, enteredPin));
      if (!pinMatched) {
        return res.status(401).json({
          success: false,
          message: "PIN Petugas tidak cocok. Gunakan PIN atau 4 digit terakhir NIP / No. WhatsApp terdaftar."
        });
      }
      const resolvedName = pickField(teacher, "Nama_Lengkap", "Nama_Guru", "namaGuru", "nama", "Nama");
      return res.json({
        success: true,
        message: `Identitas ${resolvedName} terverifikasi.`,
        sessionToken: `pin_auth_${Date.now()}_${crypto4.randomBytes(8).toString("hex")}`,
        verifiedPetugas: {
          id: pickField(teacher, "ID", "ID_Guru", "idGuru", "id") || petugas_id,
          nama: resolvedName,
          nip: pickField(teacher, "NIP", "nip") || "-",
          verifiedAt: (/* @__PURE__ */ new Date()).toISOString()
        }
      });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
  app2.get("/api/public/petugas-dudi", async (req, res) => {
    try {
      const petugasNama = String(req.query.petugasNama || "").trim();
      const petugasId = String(req.query.petugasId || "").trim();
      if (!petugasNama && !petugasId) {
        return res.status(400).json({ success: false, message: "Parameter petugasNama atau petugasId wajib diisi." });
      }
      const { sheets } = await fetchBatchSheetsViaGas(
        ["Plotting_Pemberangkatan", "Master_DUDI", "Data_Pengajuan_PKL"],
        /* @__PURE__ */ new Set(["Plotting_Pemberangkatan", "Data_Pengajuan_PKL"])
      );
      const result = aggregatePetugasDudiGroups({
        petugasNama,
        petugasId,
        plottingRows: sheets["Plotting_Pemberangkatan"] || [],
        dudiRows: sheets["Master_DUDI"] || [],
        pengajuanRows: sheets["Data_Pengajuan_PKL"] || []
      });
      const etag = computeWeakEtag({ k: "petugas_dudi", petugasNama, petugasId, result });
      res.setHeader("ETag", etag);
      if (isEtagMatched(req, etag)) {
        return res.status(304).end();
      }
      res.json({ success: true, total: result.length, etag, data: result });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
  app2.get("/api/public/dudi-students", async (req, res) => {
    try {
      const dudiNama = String(req.query.dudiNama || "").trim();
      const dudiId = String(req.query.dudiId || "").trim();
      const petugasNama = String(req.query.petugasNama || "").trim();
      if (!dudiNama && !dudiId) {
        return res.status(400).json({ success: false, message: "Parameter dudiNama atau dudiId wajib diisi." });
      }
      const { sheets } = await fetchBatchSheetsViaGas(
        [
          "Plotting_Pemberangkatan",
          "Data_Pengajuan_PKL",
          "Master_Siswa_XI",
          "Monitoring_5_Tahap",
          "Nilai_Dan_Sertifikat",
          "Log_Penerbitan_Surat"
        ],
        /* @__PURE__ */ new Set([
          "Plotting_Pemberangkatan",
          "Data_Pengajuan_PKL",
          "Master_Siswa_XI",
          "Monitoring_5_Tahap",
          "Nilai_Dan_Sertifikat",
          "Log_Penerbitan_Surat"
        ])
      );
      let siswaRows = sheets["Master_Siswa_XI"] || [];
      if (siswaRows.length === 0) {
        const fallbackSiswa = await fetchMasterSiswaRows().catch(() => ({ rows: [] }));
        siswaRows = fallbackSiswa.rows;
      }
      const wsConfig = await getFirestoreWorkspaceConfig(String(req.query.fresh || "") === "1");
      const stageControl = normalizeServerMonitoringStageControl(wsConfig.monitoringStageControl);
      const { issuedStages, issuedStageDetails } = resolveIssuedStagesForDudi(
        sheets["Log_Penerbitan_Surat"] || [],
        dudiId,
        dudiNama
      );
      const result = buildDudiStudentsWithSummary({
        dudiNama,
        dudiId,
        petugasNama,
        plottingRows: sheets["Plotting_Pemberangkatan"] || [],
        pengajuanRows: sheets["Data_Pengajuan_PKL"] || [],
        siswaRows,
        monitoringRows: sheets["Monitoring_5_Tahap"] || [],
        nilaiRows: sheets["Nilai_Dan_Sertifikat"] || [],
        stageControl,
        issuedStages
      });
      const etag = computeWeakEtag({
        k: "dudi_students",
        dudiNama,
        dudiId,
        petugasNama,
        stageControl,
        issuedStages,
        result
      });
      res.setHeader("ETag", etag);
      if (String(req.query.fresh || "") !== "1" && isEtagMatched(req, etag)) {
        return res.status(304).end();
      }
      res.json({
        success: true,
        total: result.length,
        stageControl,
        issuedStages,
        issuedStageDetails,
        etag,
        data: result
      });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
  app2.post("/api/public/update-dudi-contact", async (req, res) => {
    try {
      const payload = req.body || {};
      const targetDudiId = String(payload.dudi_id || "").trim();
      const targetDudiNama = String(payload.nama_dudi || "").trim();
      const inputPemimpin = String(payload.nama_pemimpin || "").trim();
      const inputPic = String(payload.nama_pic || "").trim();
      const inputTelpDudi = String(payload.no_telp_dudi || "").trim();
      const inputHariKerja = String(payload.hari_kerja || "").trim();
      const inputJamKerja = String(payload.jam_kerja || "").trim();
      const inputTelpDigits = inputTelpDudi.replace(/\D/g, "");
      const spellingConfirmed = payload.spelling_confirmed === true;
      if (!targetDudiId && !targetDudiNama) {
        return res.status(400).json({
          success: false,
          message: "Identitas DUDI wajib disertakan."
        });
      }
      if (!inputPemimpin || inputPemimpin === "-" || !inputPic || inputPic === "-" || inputTelpDigits.length < 7) {
        return res.status(400).json({
          success: false,
          code: "DUDI_CONTACT_REQUIRED",
          message: "Nama Pemimpin DUDI, Nama PIC / Pembimbing DUDI, dan No. Telp / WhatsApp DUDI wajib diisi lengkap."
        });
      }
      if (!spellingConfirmed) {
        return res.status(400).json({
          success: false,
          code: "SPELLING_CONFIRMATION_REQUIRED",
          message: "Harap centang konfirmasi kebenaran data dan ejaan sebelum menyimpan."
        });
      }
      await syncDudiContactToMasterAndPengajuan({
        dudiId: targetDudiId,
        namaDudi: targetDudiNama,
        alamatDudi: payload.alamat_dudi,
        namaPemimpin: inputPemimpin,
        namaPic: inputPic,
        noTelpDudi: inputTelpDudi,
        hariKerja: inputHariKerja || void 0,
        jamKerja: inputJamKerja || void 0,
        createIfMissing: true,
        overwriteExisting: true
      });
      res.json({
        success: true,
        message: "Data kontak & pimpinan DUDI berhasil dikonfirmasi dan disimpan.",
        dudiContact: {
          namaPemimpin: inputPemimpin,
          pic: inputPic,
          kontak: inputTelpDudi,
          ...inputHariKerja ? { hariKerja: inputHariKerja } : {},
          ...inputJamKerja ? { jamKerja: inputJamKerja } : {}
        }
      });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
  app2.post("/api/public/submit-monitoring", async (req, res) => {
    try {
      const payload = req.body || {};
      if (!payload.nis || !payload.nama_siswa || !payload.tahap_monitoring) {
        return res.status(400).json({
          success: false,
          message: "NIS, Nama Siswa, dan Tahap Monitoring wajib diisi."
        });
      }
      const cleanNis = stripNisSymbols(payload.nis) || String(payload.nis).trim();
      const inputIdPenempatan = String(payload.id_penempatan || "").trim();
      let existingMonId = String(payload.existing_monitoring_id || "").trim();
      const tglVal = normalizeToIsoDate(payload.tanggal) || getTodayWibIsoDate();
      const bukuLaporan = String(payload.buku_laporan || "").trim().toUpperCase();
      const aktivitasDp = String(payload.aktivitas_dp || "").trim();
      const aktivitasMt = String(payload.aktivitas_mt || "").trim();
      const aktivitasKrt = String(payload.aktivitas_krt || "").trim();
      const kompetensiArr = parseKompetensiList(payload.kompetensi_siswa);
      const kompetensiSerialized = serializeKompetensiList(kompetensiArr);
      const kondisiCheck = parseKondisiBengkel(payload.kondisi_bengkel);
      const kondisiSerialized = serializeKondisiBengkel(kondisiCheck);
      const ttdSiswaRaw = String(payload.ttd_siswa || "").trim();
      const safeTtdSiswa = ttdSiswaRaw.startsWith("svgpath:") ? ttdSiswaRaw : "";
      const cleanUserNote = stripStructuredTagsFromNote(payload.catatan_perkembangan);
      const f0701Tag = serializeFormat0701Tag({
        bukuLaporan,
        dp: aktivitasDp,
        mt: aktivitasMt,
        krt: aktivitasKrt,
        kompetensiList: kompetensiArr,
        kondisiBengkel: kondisiCheck
      });
      const noteCombined = [cleanUserNote, f0701Tag].filter(Boolean).join(" ").trim();
      const stageStr = String(payload.tahap_monitoring);
      const stageNum = extractStageNumber(stageStr);
      if (stageNum < 1 || stageNum > 8) {
        return res.status(400).json({
          success: false,
          message: "Tahap Monitoring tidak valid (harus Tahap 1 sampai Tahap 8)."
        });
      }
      const wsConfig = await getFirestoreWorkspaceConfig(true);
      const stageControl = normalizeServerMonitoringStageControl(wsConfig.monitoringStageControl);
      if (!stageControl.unlockedStages.includes(stageNum)) {
        return res.status(403).json({
          success: false,
          code: "STAGE_GLOBALLY_LOCKED",
          message: stageControl.lockedReason ? `${stageStr} sedang dikunci oleh SuperAdmin (${stageControl.lockedReason}).` : `${stageStr} sedang dikunci sementara oleh SuperAdmin. Riwayat yang sudah tersimpan hanya dapat dilihat (Read-Only).`
        });
      }
      if (stageControl.requireIssuedLetter !== false) {
        const logRes = await fetchLiveSheetViaGas("Log_Penerbitan_Surat", true).catch(() => ({
          rows: []
        }));
        const { issuedStages } = resolveIssuedStagesForDudi(
          logRes.rows,
          String(payload.dudi_id || ""),
          String(payload.nama_dudi || "")
        );
        if (!issuedStages.includes(stageNum)) {
          return res.status(403).json({
            success: false,
            code: "LETTER_NOT_ISSUED",
            message: `Surat ${stageStr} untuk DUDI "${String(payload.nama_dudi || "ini").trim()}" belum diterbitkan Admin Hubin di Pusat Dokumen. Harap konfirmasi penerbitan surat terlebih dahulu.`
          });
        }
      }
      const monRes = await fetchLiveSheetViaGas("Monitoring_5_Tahap", true).catch(() => ({
        rows: []
      }));
      if (stageControl.requireSequential && stageNum >= 2) {
        const summary = buildStudentMonitoringSummary(
          {
            nis: cleanNis,
            nama: String(payload.nama_siswa || ""),
            idPenempatan: inputIdPenempatan,
            dudi_name: String(payload.nama_dudi || "")
          },
          monRes.rows,
          []
        );
        if (!summary.completedStages.includes(stageNum - 1)) {
          const prevStageLabel = getStageValueByNumber(stageNum - 1);
          return res.status(400).json({
            success: false,
            code: "STAGE_LOCKED",
            message: `${stageStr} masih terkunci. Harap isi dan simpan ${prevStageLabel} untuk ${payload.nama_siswa} terlebih dahulu.`
          });
        }
      }
      const matchedExistingRow = monRes.rows.find((r) => {
        const rMonId = pickField(r, "ID_Monitoring", "idMonitoring", "id");
        if (existingMonId && rMonId === existingMonId) return true;
        const rStage = extractStageNumber(pickField(r, "Tahap", "tahap"));
        if (rStage !== stageNum) return false;
        const rNisRaw = pickField(r, "NIS", "nis");
        const rNisDigits = stripNisSymbols(rNisRaw) || rNisRaw;
        const rPlt = pickField(r, "ID_Penempatan", "idPenempatan");
        return Boolean(
          cleanNis && rNisDigits === cleanNis || inputIdPenempatan && rPlt === inputIdPenempatan
        );
      });
      if (matchedExistingRow) {
        existingMonId = pickField(matchedExistingRow, "ID_Monitoring", "idMonitoring", "id") || existingMonId;
      }
      const isUpdate = Boolean(existingMonId);
      const idMonitoring = existingMonId || `MON-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const inputPemimpin = String(payload.nama_pemimpin || "").trim();
      const inputPic = String(payload.nama_pic || "").trim();
      const inputTelpDudi = String(payload.no_telp_dudi || "").trim();
      const inputHariKerja = String(payload.hari_kerja || "").trim();
      const inputJamKerja = String(payload.jam_kerja || "").trim();
      const inputTelpDigits = inputTelpDudi.replace(/\D/g, "");
      if (stageNum === 1 || payload.dudi_contact_submitted) {
        if (!inputPemimpin || inputPemimpin === "-" || !inputPic || inputPic === "-" || inputTelpDigits.length < 7) {
          return res.status(400).json({
            success: false,
            code: "DUDI_CONTACT_REQUIRED",
            message: "Nama Pemimpin DUDI, Nama PIC/Pendamping, dan No. Telp/WhatsApp DUDI wajib diisi lengkap."
          });
        }
        if (payload.dudi_contact_submitted && payload.spelling_confirmed !== true) {
          return res.status(400).json({
            success: false,
            code: "SPELLING_CONFIRMATION_REQUIRED",
            message: "Harap centang konfirmasi kebenaran data dan ejaan sebelum menyimpan."
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
      let resolvedDudiId = String(payload.dudi_id || "").trim();
      if (!resolvedDudiId && payload.nama_dudi) {
        const dudiRes = await fetchLiveSheetViaGas("Master_DUDI", false).catch(() => ({ rows: [] }));
        const targetDudiNorm = normalizeStr(payload.nama_dudi);
        const matchedDudi = dudiRes.rows.find(
          (d) => normalizeStr(pickField(d, "Nama_DUDI", "namaDudi")) === targetDudiNorm
        );
        if (matchedDudi) {
          resolvedDudiId = pickField(matchedDudi, "ID", "id");
        }
      }
      const sheetRow = {
        id: idMonitoring,
        ID_Monitoring: idMonitoring,
        idMonitoring,
        ID_Penempatan: String(payload.id_penempatan || `PLT-${cleanNis}`),
        idPenempatan: String(payload.id_penempatan || `PLT-${cleanNis}`),
        ID_DUDI: resolvedDudiId,
        idDudi: resolvedDudiId,
        DUDI_Tujuan: String(payload.nama_dudi || ""),
        dudiTujuan: String(payload.nama_dudi || ""),
        Alamat_DUDI: String(payload.alamat_dudi || ""),
        alamatDudi: String(payload.alamat_dudi || ""),
        NIS: cleanNis,
        nis: cleanNis,
        Nama_Siswa: String(payload.nama_siswa || ""),
        namaSiswa: String(payload.nama_siswa || ""),
        Jurusan: String(payload.jurusan || ""),
        jurusan: String(payload.jurusan || ""),
        ID_Guru_Pendamping: String(payload.guru_id || ""),
        idGuruPendamping: String(payload.guru_id || ""),
        Guru_Pendamping: String(payload.guru_pembimbing || ""),
        guruPendamping: String(payload.guru_pembimbing || ""),
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
        Nilai_PKL_Muncul: nilaiMuncul ? "Ya" : "Belum",
        nilaiPklMuncul: nilaiMuncul,
        Nilai_K3LH: nilaiMuncul ? k3lh : "",
        nilaiK3lh: nilaiMuncul ? k3lh : "",
        Nilai_Softskills: nilaiMuncul ? softskill : "",
        Nilai_Softskill: nilaiMuncul ? softskill : "",
        nilaiSoftskill: nilaiMuncul ? softskill : "",
        Nilai_Hardskills: nilaiMuncul ? teknis : "",
        Nilai_Kompetensi_Teknis: nilaiMuncul ? teknis : "",
        nilaiKompetensiTeknis: nilaiMuncul ? teknis : "",
        Nilai_Alur_Bisnis_Dunia_Kerja: nilaiMuncul ? alurBisnis : "",
        Nilai_Alur_Bisnis: nilaiMuncul ? alurBisnis : "",
        nilaiAlurBisnis: nilaiMuncul ? alurBisnis : "",
        Nilai_rata_rata: nilaiMuncul ? avgScore : "",
        Nilai_Rata_Rata: nilaiMuncul ? avgScore : "",
        nilaiRataRata: nilaiMuncul ? avgScore : "",
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
        Foto_Bukti_Drive: "",
        fotoBuktiUrl: "",
        Nilai_DUDI_Terkumpul: nilaiMuncul && avgScore > 0 ? "Ya" : "Belum",
        nilaiDudiTerkumpul: nilaiMuncul && avgScore > 0,
        Blangko_Sertifikat_Bawa: stageNum >= 5 ? "Ya" : "Belum",
        blangkoSertifikatBawa: stageNum >= 5,
        Status_Tahap: "Terlaksana",
        statusTahap: "Terlaksana"
      };
      const persistedMonitoring = GoogleDriveSheetService.getInstance().stripFormulaManagedFields(
        "Monitoring_5_Tahap",
        matchedExistingRow?._sheetRowNumber ? { ...sheetRow, _sheetRowNumber: matchedExistingRow._sheetRowNumber } : sheetRow
      );
      const writeReceipt = await writeLiveSheetViaGas(
        "Monitoring_5_Tahap",
        isUpdate ? "UPDATE" : "CREATE",
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
            hariKerja: inputHariKerja || void 0,
            jamKerja: inputJamKerja || void 0,
            createIfMissing: true,
            overwriteExisting: true
          });
        } catch (dudiErr) {
          console.warn("[submit-monitoring] Sync DUDI contact warning:", dudiErr);
        }
      }
      let gradeSynced = false;
      if (nilaiMuncul && avgScore > 0) {
        try {
          await upsertNilaiDanSertifikat({
            nis: cleanNis,
            idPenempatan: String(payload.id_penempatan || `PLT-${cleanNis}`),
            idDudi: resolvedDudiId,
            namaSiswa: String(payload.nama_siswa || ""),
            jurusan: String(payload.jurusan || ""),
            kelas: String(payload.kelas || "-"),
            namaDudi: String(payload.nama_dudi || ""),
            k3lh,
            softskill,
            teknis,
            alurBisnis,
            avgScore,
            tglTerbit: tglVal
          });
          gradeSynced = true;
        } catch (gradeErr) {
          console.warn("[submit-monitoring] Sync to Nilai_Dan_Sertifikat warning:", gradeErr);
        }
      }
      res.json({
        success: true,
        verifiedInSpreadsheet: writeReceipt.verified,
        sheetRowNumber: writeReceipt.sheetRowNumber,
        savedAt: writeReceipt.savedAt,
        gradeSynced,
        dudiContactSynced,
        dudiContact: inputPemimpin || inputPic || inputTelpDudi || inputHariKerja || inputJamKerja ? {
          namaPemimpin: inputPemimpin,
          pic: inputPic,
          kontak: inputTelpDudi,
          ...inputHariKerja ? { hariKerja: inputHariKerja } : {},
          ...inputJamKerja ? { jamKerja: inputJamKerja } : {}
        } : void 0,
        message: `Data ${stageStr} berhasil ${isUpdate ? "diperbarui" : "disimpan"} ke Cloud Server.`,
        monitoring: sheetRow
      });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
  app2.post("/api/public/update-grades", async (req, res) => {
    try {
      const payload = req.body || {};
      const nis = stripNisSymbols(payload.nis) || String(payload.nis || "").trim();
      const namaSiswa = String(payload.nama_siswa || "").trim();
      const idPenempatan = String(payload.id_penempatan || (nis ? `PLT-${nis}` : "")).trim();
      if (!nis || !namaSiswa) {
        return res.status(400).json({
          success: false,
          message: "NIS dan Nama Siswa wajib diisi untuk mengubah nilai."
        });
      }
      const k3lh = Math.min(100, Math.max(0, Number(payload.nilai_k3lh ?? 0) || 0));
      const softskill = Math.min(100, Math.max(0, Number(payload.nilai_softskill ?? 0) || 0));
      const teknis = Math.min(100, Math.max(0, Number(payload.nilai_kompetensi_teknis ?? 0) || 0));
      const alurBisnis = Math.min(100, Math.max(0, Number(payload.nilai_alur_bisnis ?? 0) || 0));
      const avgScore = calculateEqualWeightedAverage(k3lh, softskill, teknis, alurBisnis);
      const predikat = getPredikatFromScore(avgScore);
      const tglVal = normalizeToIsoDate(payload.tanggal) || getTodayWibIsoDate();
      const monRes = await fetchLiveSheetViaGas("Monitoring_5_Tahap", true).catch(() => ({ rows: [] }));
      const targetMonId = String(payload.monitoring_id || "").trim();
      const matchedRows = monRes.rows.filter((r) => {
        const rMonId = pickField(r, "ID_Monitoring", "idMonitoring", "id");
        const rNis = pickField(r, "NIS", "nis");
        const rNisDigits = stripNisSymbols(rNis);
        const rPlt = pickField(r, "ID_Penempatan", "idPenempatan");
        if (targetMonId && rMonId === targetMonId) return true;
        if (nis && (rNisDigits === nis || rNis === nis)) return true;
        if (idPenempatan && rPlt === idPenempatan) return true;
        return false;
      });
      const targetRow = (targetMonId ? matchedRows.find((r) => pickField(r, "ID_Monitoring", "idMonitoring", "id") === targetMonId) : void 0) || [...matchedRows].reverse().find((r) => {
        const flag = normalizeStr(pickField(r, "Nilai_DUDI_Terkumpul", "nilaiDudiTerkumpul"));
        const avg = Number(r.Nilai_rata_rata ?? r.Nilai_Rata_Rata ?? r.nilaiRataRata ?? 0);
        return flag === "ya" || flag === "true" || avg > 0;
      }) || matchedRows[matchedRows.length - 1];
      let resolvedMonId = targetMonId;
      let resolvedStage = String(payload.tahap_monitoring || getStageValueByNumber(5));
      let resolvedDudiId = String(payload.dudi_id || "").trim();
      if (!resolvedDudiId && targetRow) {
        resolvedDudiId = pickField(targetRow, "ID_DUDI", "idDudi");
      }
      if (!resolvedDudiId && payload.nama_dudi) {
        const dudiRes = await fetchLiveSheetViaGas("Master_DUDI", false).catch(() => ({ rows: [] }));
        const targetDudiNorm = normalizeStr(payload.nama_dudi);
        const matchedDudi = dudiRes.rows.find(
          (d) => normalizeStr(pickField(d, "Nama_DUDI", "namaDudi")) === targetDudiNorm
        );
        if (matchedDudi) {
          resolvedDudiId = pickField(matchedDudi, "ID", "id");
        }
      }
      const sheetSvc = GoogleDriveSheetService.getInstance();
      if (targetRow) {
        resolvedMonId = pickField(targetRow, "ID_Monitoring", "idMonitoring", "id");
        resolvedStage = pickField(targetRow, "Tahap", "tahap") || resolvedStage;
        const rawNote = String(targetRow.Catatan_Kunjungan ?? targetRow.catatanKunjungan ?? "");
        const existingF0701 = rawNote.match(/\[F0701:[^\]]+\]/i);
        const cleanNoteBase = stripStructuredTagsFromNote(rawNote);
        const cleanNote = [cleanNoteBase, existingF0701 ? existingF0701[0] : ""].filter(Boolean).join(" ").trim();
        await writeLiveSheetViaGas(
          "Monitoring_5_Tahap",
          "UPDATE",
          sheetSvc.stripFormulaManagedFields("Monitoring_5_Tahap", {
            id: resolvedMonId,
            ID_Monitoring: resolvedMonId,
            idMonitoring: resolvedMonId,
            _sheetRowNumber: targetRow._sheetRowNumber,
            ID_Penempatan: pickField(targetRow, "ID_Penempatan", "idPenempatan") || idPenempatan,
            ID_DUDI: resolvedDudiId,
            ID_Guru_Pendamping: pickField(targetRow, "ID_Guru_Pendamping", "idGuruPendamping") || String(payload.guru_id || ""),
            Nilai_PKL_Muncul: "Ya",
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
            Nilai_DUDI_Terkumpul: "Ya",
            nilaiDudiTerkumpul: true,
            Catatan_Kunjungan: cleanNote,
            catatanKunjungan: cleanNote
          })
        );
      } else {
        resolvedMonId = `MON-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const stageNum = extractStageNumber(resolvedStage) || 5;
        await writeLiveSheetViaGas(
          "Monitoring_5_Tahap",
          "CREATE",
          sheetSvc.stripFormulaManagedFields("Monitoring_5_Tahap", {
            id: resolvedMonId,
            ID_Monitoring: resolvedMonId,
            idMonitoring: resolvedMonId,
            ID_Penempatan: idPenempatan,
            idPenempatan,
            ID_DUDI: resolvedDudiId,
            NIS: nis,
            ID_Guru_Pendamping: String(payload.guru_id || ""),
            Tahap: resolvedStage,
            Tanggal_Kunjungan: tglVal,
            Sakit: 0,
            Izin: 0,
            Alpha: 0,
            Nilai_PKL_Muncul: "Ya",
            Nilai_K3LH: k3lh,
            Nilai_Softskills: softskill,
            Nilai_Softskill: softskill,
            Nilai_Hardskills: teknis,
            Nilai_Kompetensi_Teknis: teknis,
            Nilai_Alur_Bisnis_Dunia_Kerja: alurBisnis,
            Nilai_Alur_Bisnis: alurBisnis,
            Catatan_Kunjungan: "",
            Nilai_DUDI_Terkumpul: "Ya",
            Blangko_Sertifikat_Bawa: stageNum >= 5 ? "Ya" : "Belum",
            Status_Tahap: "Terlaksana"
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
          jurusan: String(payload.jurusan || ""),
          kelas: String(payload.kelas || "-"),
          namaDudi: String(payload.nama_dudi || ""),
          k3lh,
          softskill,
          teknis,
          alurBisnis,
          avgScore,
          tglTerbit: tglVal
        });
        nilaiSynced = true;
      } catch (syncErr) {
        console.warn("[update-grades] Sync to Nilai_Dan_Sertifikat warning:", syncErr);
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
          tanggal: tglVal
        }
      });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
}

// server/routes/publicPortalRoutes.ts
function registerPublicPortalRoutes(app2) {
  registerPublicStudentRoutes(app2);
  registerPublicTeacherMonitoringRoutes(app2);
}

// server/routes/documentRoutes.ts
var ISSUED_LETTER_ADMIN_ROLES = /* @__PURE__ */ new Set(["SuperAdmin", "Hubin", "Pokja"]);
function extractValidKepalaSekolahName(accounts) {
  const kepsek = accounts.find((a) => a.role === "Kepsek" && a.status === "Aktif") || accounts.find((a) => a.role === "Kepsek");
  const raw = String(kepsek?.namaLengkap || "").trim();
  const lower = raw.toLowerCase();
  if (!raw || lower === "kepala sekolah" || lower === "kepsek") {
    return "";
  }
  return raw;
}
function registerDocumentRoutes(app2) {
  app2.get("/api/documents/signers", async (req, res) => {
    try {
      await requireAdminAuth(req);
      const { accounts, syncedToSheet } = await fetchMasterAkunFromGasOrDefaults(false);
      return res.json({
        success: true,
        kepalaSekolah: extractValidKepalaSekolahName(accounts),
        syncedToSheet
      });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
  app2.post("/api/documents/signers", async (req, res) => {
    try {
      await requireAdminAuth(req);
      const nextKepala = String(req.body?.kepalaSekolah || "").trim().slice(0, 150);
      if (!nextKepala) {
        return res.status(400).json({
          success: false,
          message: "Nama Kepala Sekolah tidak boleh kosong."
        });
      }
      const { accounts } = await fetchMasterAkunFromGasOrDefaults(true);
      const working = accounts.map((a) => ({ ...a }));
      const idx = working.findIndex((a) => a.role === "Kepsek");
      if (idx === -1) {
        return res.status(404).json({
          success: false,
          message: "Akun dengan peran Kepsek tidak ditemukan di Master_Akun."
        });
      }
      working[idx] = {
        ...working[idx],
        namaLengkap: nextKepala,
        jabatan: working[idx].jabatan || ROLE_TITLE_MAP.Kepsek,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        isDefaultSeed: false
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
        Updated_At: a.updatedAt || (/* @__PURE__ */ new Date()).toISOString()
      }));
      await writeLiveSheetViaGas("Master_Akun", "SYNC_ALL", rowsPayload);
      const cfg = await getFirestoreWorkspaceConfig();
      if (cfg.spreadsheetId) {
        invalidateSheetCacheEntry(cfg.spreadsheetId, "Master_Akun");
      }
      return res.json({
        success: true,
        kepalaSekolah: nextKepala,
        message: "Nama Kepala Sekolah berhasil disimpan ke Cloud Server (Master_Akun)."
      });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
  app2.post("/api/perizinan/generate-pdf", async (req, res) => {
    try {
      await requireAdminAuth(req);
      const body = req.body || {};
      const perizinanId = String(body.perizinanId || body.id || "").trim();
      let existingRow = null;
      if (perizinanId) {
        const izinRes = await fetchLiveSheetViaGas("Data_Perizinan_PKL", false).catch(() => ({ rows: [] }));
        existingRow = izinRes.rows.find((r) => {
          const rid = pickField(r, "ID_Perizinan", "idPerizinan", "id");
          return rid === perizinanId;
        });
      }
      const dudiTujuan = String(body.dudiTujuan || "").trim() || pickField(existingRow || {}, "DUDI_Tujuan", "dudiTujuan") || "Mitra DUDI";
      let alamatDudi = String(body.alamatDudi || "").trim() || pickField(existingRow || {}, "Alamat_DUDI", "alamatDudi");
      if (!alamatDudi || alamatDudi === "-") {
        const dudiRes = await fetchLiveSheetViaGas("Master_DUDI", false).catch(() => ({ rows: [] }));
        const matchedDudi = dudiRes.rows.find(
          (d) => normalizeStr(pickField(d, "Nama_DUDI", "namaDudi")) === normalizeStr(dudiTujuan)
        );
        if (matchedDudi) {
          alamatDudi = pickField(matchedDudi, "Alamat", "alamat") || alamatDudi;
        }
      }
      const gasPayload = {
        perizinanId: perizinanId || `IZN-${Date.now()}`,
        noPerizinan: String(body.noPerizinan || "").trim() || pickField(existingRow || {}, "ID_Perizinan", "idPerizinan", "id") || perizinanId,
        noSuratPermohonan: String(body.noSuratPermohonan || "").trim() || pickField(existingRow || {}, "No_Surat_Permohonan", "noSuratPermohonan") || `421.5 / ___ / Hubin / SMK.PGRI2 / ${(/* @__PURE__ */ new Date()).getFullYear()}`,
        namaSiswa: String(body.namaSiswa || "").trim() || pickField(existingRow || {}, "Nama_Siswa", "namaSiswa") || "-",
        nis: stripNisSymbols(
          String(body.nis || "").trim() || pickField(existingRow || {}, "NIS", "nis")
        ),
        kelas: String(body.kelas || "").trim() || pickField(existingRow || {}, "Kelas", "kelas") || "-",
        jurusan: String(body.jurusan || "").trim() || pickField(existingRow || {}, "Jurusan", "jurusan") || "-",
        dudiTujuan,
        alamatDudi: alamatDudi || "Di Tempat",
        tanggalSurat: String(body.tanggalSurat || "").trim() || getTodayWibIsoDate(),
        kepalaSekolah: String(body.kepalaSekolah || "").trim() || "Kepala SMK PGRI 2 Ponorogo"
      };
      const { data: gasResult } = await callGasCustomAction("GENERATE_SURAT_IZIN_PDF", { data: gasPayload });
      const pdfUrl = String(gasResult?.pdfUrl || "").trim();
      if (!pdfUrl) {
        throw new PortalConfigError(
          "GAS_WRITE_ERROR",
          "Apps Script belum mengembalikan URL PDF. Pastikan Anda sudah memperbarui & Deploy ulang versi terbaru script GAS Web App.",
          502
        );
      }
      if (existingRow && perizinanId) {
        await writeLiveSheetViaGas("Data_Perizinan_PKL", "UPDATE", {
          ...existingRow,
          id: pickField(existingRow, "ID_Perizinan", "idPerizinan", "id") || perizinanId,
          ID_Perizinan: pickField(existingRow, "ID_Perizinan", "idPerizinan", "id") || perizinanId,
          Link_Surat_PDF: pdfUrl,
          linkSuratPdf: pdfUrl
        }).catch(() => {
        });
      }
      return res.json({
        success: true,
        pdfUrl,
        fileId: gasResult?.fileId || "",
        fileName: gasResult?.fileName || "",
        message: "Surat Permohonan PDF berhasil dibuat di Google Drive."
      });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
  app2.post("/api/documents/generate-monitoring-bundle", async (req, res) => {
    try {
      const actor = await requireAdminAuth(req);
      const body = req.body || {};
      const bundles = Array.isArray(body.bundles) ? body.bundles : [];
      if (bundles.length === 0) {
        return res.status(400).json({
          success: false,
          code: "EMPTY_BUNDLE",
          message: "Pilih minimal satu DUDI siap cetak terlebih dahulu."
        });
      }
      const { data: gasResult } = await callGasCustomAction(
        "GENERATE_MONITORING_BUNDLE_PDF",
        {
          data: {
            templateIds: body.templateIds || {},
            includeDocs: body.includeDocs || {},
            meta: body.meta || {},
            bundles
          }
        },
        55e3
      );
      const pdfUrl = String(gasResult?.pdfUrl || "").trim();
      if (!pdfUrl) {
        throw new PortalConfigError(
          "GAS_WRITE_ERROR",
          "Apps Script belum mengembalikan URL PDF paket. Pastikan script GAS versi terbaru sudah di-Deploy.",
          502
        );
      }
      const metaObj = body.meta || {};
      const tahapNum = Number(metaObj.tahapNum || 0);
      let issuedCount = 0;
      if (Number.isInteger(tahapNum) && tahapNum >= 1 && tahapNum <= 8 && ISSUED_LETTER_ADMIN_ROLES.has(actor.role)) {
        const issuedTargets = bundles.filter((b) => b && (b.namaDudi || b.dudiId)).map((b) => ({
          dudiId: String(b.dudiId || "").trim(),
          namaDudi: String(b.namaDudi || "").trim(),
          tahap: tahapNum,
          jenisDokumen: "Paket PDF Drive",
          nomorSurat: String(metaObj.nomorSurat || "").trim(),
          tanggalTerbit: String(metaObj.tanggalSurat || "").trim(),
          diterbitkanOleh: actor.name || actor.username || "Admin Hubin",
          guruPendamping: String(b.namaGuru || "").trim(),
          linkPdf: pdfUrl
        }));
        const recorded = await recordIssuedLetters(
          issuedTargets,
          actor.name || actor.username || "Admin Hubin"
        ).catch(() => []);
        issuedCount = recorded.length;
      }
      return res.json({
        success: true,
        pdfUrl,
        fileId: gasResult?.fileId || "",
        fileName: gasResult?.fileName || "",
        totalSheets: gasResult?.totalSheets || 0,
        issuedRecorded: issuedCount > 0,
        issuedCount,
        message: "Paket dokumen monitoring PDF berhasil dibuat dari Template Google Docs."
      });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
  app2.get("/api/documents/issued-letters", async (req, res) => {
    try {
      await requireAdminAuth(req);
      const fresh = String(req.query?.fresh || "") === "1";
      const rows = await fetchIssuedLettersList(fresh);
      return res.json({
        success: true,
        total: rows.length,
        data: rows
      });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
  app2.post("/api/documents/mark-issued", async (req, res) => {
    try {
      const actor = await requireAdminAuth(req);
      if (!ISSUED_LETTER_ADMIN_ROLES.has(actor.role)) {
        return res.status(403).json({
          success: false,
          code: "FORBIDDEN_ROLE",
          message: "Hanya SuperAdmin, Admin Hubin, atau Pokja yang dapat menerbitkan status surat."
        });
      }
      const rawItems = Array.isArray(req.body?.items) ? req.body.items : req.body?.item ? [req.body.item] : [];
      if (rawItems.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Daftar target DUDI & Tahap yang akan diterbitkan tidak boleh kosong."
        });
      }
      const sanitizedItems = rawItems.map((it) => ({
        dudiId: String(it?.dudiId || "").trim().slice(0, 80),
        namaDudi: String(it?.namaDudi || "").trim().slice(0, 180),
        tahap: Number(it?.tahap),
        jenisDokumen: String(it?.jenisDokumen || "").trim().slice(0, 120),
        nomorSurat: String(it?.nomorSurat || "").trim().slice(0, 120),
        tanggalTerbit: String(it?.tanggalTerbit || "").trim().slice(0, 40),
        diterbitkanOleh: String(
          it?.diterbitkanOleh || actor.name || actor.username || "Admin Hubin"
        ).trim().slice(0, 120),
        guruPendamping: String(it?.guruPendamping || "").trim().slice(0, 120),
        linkPdf: String(it?.linkPdf || "").trim().slice(0, 500)
      })).filter(
        (it) => Number.isInteger(it.tahap) && it.tahap >= 1 && it.tahap <= 8 && (Boolean(it.namaDudi) || Boolean(it.dudiId))
      );
      if (sanitizedItems.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Data DUDI atau nomor Tahap (1-8) tidak valid."
        });
      }
      const recorded = await recordIssuedLetters(
        sanitizedItems,
        actor.name || actor.username || "Admin Hubin"
      );
      return res.json({
        success: true,
        count: recorded.length,
        data: recorded,
        message: `${recorded.length} status penerbitan surat berhasil disimpan ke Cloud Server.`
      });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
  app2.post("/api/documents/revoke-issued", async (req, res) => {
    try {
      const actor = await requireAdminAuth(req);
      if (!ISSUED_LETTER_ADMIN_ROLES.has(actor.role)) {
        return res.status(403).json({
          success: false,
          code: "FORBIDDEN_ROLE",
          message: "Hanya SuperAdmin, Admin Hubin, atau Pokja yang dapat membatalkan penerbitan surat."
        });
      }
      const tahap = Number(req.body?.tahap);
      const idTerbit = String(req.body?.idTerbit || "").trim().slice(0, 100);
      const dudiId = String(req.body?.dudiId || "").trim().slice(0, 80);
      const namaDudi = String(req.body?.namaDudi || "").trim().slice(0, 180);
      if (!Number.isInteger(tahap) || tahap < 1 || tahap > 8 || !idTerbit && !dudiId && !namaDudi) {
        return res.status(400).json({
          success: false,
          message: "Parameter pembatalan penerbitan surat (DUDI & Tahap 1-8) tidak valid."
        });
      }
      const result = await revokeIssuedLetter({
        idTerbit,
        dudiId,
        namaDudi,
        tahap,
        actorName: actor.name || actor.username || "Admin Hubin"
      });
      return res.json({
        success: true,
        revoked: result.revoked,
        idTerbit: result.idTerbit,
        message: result.revoked ? "Status penerbitan surat berhasil dibatalkan." : "Catatan terbit aktif untuk DUDI & Tahap tersebut tidak ditemukan."
      });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
}

// server.ts
var app = express();
var PORT = Number(process.env.PORT) || 3e3;
var jsonParser = express.json({ limit: "6mb" });
app.use((req, res, next) => {
  if (isServerlessRuntime && req.body !== void 0) {
    if (typeof req.body === "string") {
      try {
        req.body = req.body.trim() ? JSON.parse(req.body) : {};
      } catch {
      }
    }
    if (typeof req.body === "object" && req.body !== null) {
      req._body = true;
      return next();
    }
  }
  return jsonParser(req, res, next);
});
var PUBLIC_EDGE_CACHEABLE_PATHS = /* @__PURE__ */ new Set([
  "/public/config-summary",
  "/public/dudi-list",
  "/public/petugas-list"
]);
app.use("/api", (req, res, next) => {
  const isFreshBypass = String(req.query?.fresh || "") === "1";
  if (req.method === "GET" && !isFreshBypass && PUBLIC_EDGE_CACHEABLE_PATHS.has(req.path)) {
    res.setHeader("Cache-Control", "public, max-age=15, s-maxage=30, stale-while-revalidate=300");
    res.setHeader("Vary", "Accept-Encoding");
  } else if ((req.path.startsWith("/v1") || req.path.startsWith("/public")) && req.method === "GET" && !isFreshBypass) {
    res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
    res.setHeader("Vary", "Authorization, Accept-Encoding");
  } else {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});
registerAdminRoutes(app);
registerRestApiRoutes(app);
registerPublicPortalRoutes(app);
registerDocumentRoutes(app);
app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    status: "ok",
    runtime: isServerlessRuntime ? "vercel-serverless" : "node-server",
    firestoreConfigured: Boolean(firebaseCfg.projectId),
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
});
app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    code: "API_ROUTE_NOT_FOUND",
    message: `Endpoint API [${req.method} ${req.originalUrl || req.url}] tidak ditemukan.`
  });
});
app.use((err, _req, res, _next) => {
  console.error("[Express Unhandled Error]", err);
  if (res.headersSent) return;
  res.status(err?.status || 500).json({
    success: false,
    code: err?.code || "INTERNAL_SERVER_ERROR",
    message: err?.message || "Terjadi kesalahan internal pada server."
  });
});
async function startServer() {
  if (process.env.NODE_ENV !== "production" && !isServerlessRuntime) {
    const vitePkg = "vite";
    const { createServer: createViteServer } = await import(
      /* @vite-ignore */
      vitePkg
    );
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path2.join(__dirnameResolved, "dist")));
    app.get("*", (_req, res) => {
      res.sendFile(path2.join(__dirnameResolved, "dist", "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`SI-HUBIN Server running at http://0.0.0.0:${PORT}`);
  });
}
if (!isServerlessRuntime) {
  startServer();
}
var server_default = app;
export {
  server_default as default
};
