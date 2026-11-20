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
  lockedReason: ""
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
  accounts: "Master_Akun"
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
  Master_Akun: "accounts"
};
var DEFAULT_ADMIN_BOOTSTRAP_TABLES = [
  "Master_Jurusan",
  "Master_Kelas_Walas",
  "Master_DUDI",
  "Master_Guru_Pendamping",
  "Master_Siswa_XI",
  "Data_Pengajuan_PKL",
  "Data_Perizinan_PKL",
  "Plotting_Pemberangkatan",
  "Monitoring_5_Tahap",
  "Nilai_Dan_Sertifikat"
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
      lockedReason: ""
    };
  }
  const requireSequential = typeof raw.requireSequential === "boolean" ? raw.requireSequential : true;
  const rawList = Array.isArray(raw.unlockedStages) ? raw.unlockedStages : DEFAULT_MONITORING_STAGE_CONTROL.unlockedStages;
  const deduped = Array.from(
    new Set(
      rawList.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 1 && n <= 8)
    )
  ).sort((a, b) => a - b);
  return {
    requireSequential,
    unlockedStages: deduped.slice(0, 8),
    lockedReason: String(raw.lockedReason ?? "").trim().slice(0, 150)
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

// server/services/sheetsTransport.ts
import crypto2 from "crypto";

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

// src/core/utils/nisHelpers.ts
function stripNisSymbols(val) {
  if (val === void 0 || val === null) return "";
  const str = String(val).trim();
  if (!str || str === "-") return "";
  return str.replace(/\D/g, "");
}

// server/services/sheetsTransport.ts
var SHEET_CACHE_SOFT_TTL_MS = 45e3;
var SHEET_CACHE_STALE_MAX_MS = 6e5;
var SHEET_CACHE_TTL_MS = SHEET_CACHE_SOFT_TTL_MS;
var SHEETS_API_TIMEOUT_MS = 8e3;
var SHEETS_METADATA_TTL_MS = 3e5;
var BACKGROUND_REVALIDATION_LOCK_MAX_MS = 2e4;
var sheetCache = /* @__PURE__ */ new Map();
var inFlightSheetFetches = /* @__PURE__ */ new Map();
var inFlightBackgroundRevalidations = /* @__PURE__ */ new Map();
var siswaIndexCache = /* @__PURE__ */ new Map();
var sheetsAccessTokenCache = null;
var inFlightSheetsTokenPromise = null;
var sheetMetadataCache = /* @__PURE__ */ new Map();
var inFlightMetadataFetches = /* @__PURE__ */ new Map();
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
    } else {
      sheetCache.clear();
    }
    return;
  }
  invalidateWorkspaceConfigCache();
  sheetCache.clear();
  siswaIndexCache.clear();
  sheetMetadataCache.clear();
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
function isBackgroundRevalidationActive(cacheKey) {
  const startedAt = inFlightBackgroundRevalidations.get(cacheKey);
  if (!startedAt) return false;
  if (Date.now() - startedAt > BACKGROUND_REVALIDATION_LOCK_MAX_MS) {
    inFlightBackgroundRevalidations.delete(cacheKey);
    return false;
  }
  return true;
}
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
            console.warn(`[Sheets API v4] OAuth token failed (${tokenRes.status}): ${errTxt.slice(0, 120)}`);
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
  const sheetRowNumber = (payload && typeof payload === "object" && !Array.isArray(payload) ? Number(payload._sheetRowNumber || payload.deletedRow?._sheetRowNumber || payload.updatedRow?._sheetRowNumber || 0) : 0) || (hashMatch ? Number(hashMatch[2]) : 0);
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
          data: payload,
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
  sheetCache.delete(`${config.spreadsheetId}::${sheetName}`);
  if (sheetName === "Master_Siswa_XI" || sheetName === "Master_Siswa") {
    siswaIndexCache.delete(config.spreadsheetId);
    sheetCache.delete(`${config.spreadsheetId}::Master_Siswa_XI`);
    sheetCache.delete(`${config.spreadsheetId}::Master_Siswa`);
  }
}
async function callGasCustomAction(action, extraBody = {}, timeoutMs = 25e3) {
  const config = await getFirestoreWorkspaceConfig();
  if (!config.spreadsheetId) {
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
    const sheetParam = String(req.query.sheet || req.body?.sheet || "").trim();
    await invalidateServerCaches(sheetParam || void 0);
    res.json({ success: true, scope: sheetParam || "all" });
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
    "Plotting_Pemberangkatan"
  ];
  const { sheets } = await fetchBatchSheetsViaGas(
    neededTables,
    /* @__PURE__ */ new Set(["Data_Pengajuan_PKL", "Data_Perizinan_PKL", "Plotting_Pemberangkatan"]),
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
  const norm = (v) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const studentIdentity = (nis, nama, kelas) => {
    const digitsNis = stripNisSymbols(nis);
    if (digitsNis) return `nis:${digitsNis}`;
    const cleanNis = String(nis ?? "").trim();
    if (cleanNis && cleanNis !== "-") return `nis:${cleanNis.toLowerCase()}`;
    const cleanNama = norm(nama);
    return cleanNama ? `nama:${cleanNama}|${norm(kelas)}` : "";
  };
  let updatedDudi = 0;
  let updatedGuru = 0;
  let updatedJurusan = 0;
  let updatedKelas = 0;
  if (scope === "all" || scope === "placements" || scope === "dudi" || scope === "guru" || scope === "siswa_pkl") {
    const CLOSED_STATUSES = /* @__PURE__ */ new Set(["dibatalkan", "batal", "pindah dudi", "selesai pkl"]);
    const activePlacements = placements.filter(
      (p) => !CLOSED_STATUSES.has(norm(pickField(p, "Status_Penempatan", "statusPenempatan")))
    );
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
    const resolveCanonicalGuru = (idVal, namaVal) => {
      if (idVal && guruById.has(idVal)) return guruById.get(idVal);
      const nk = namaVal ? norm(namaVal) : "";
      if (nk && guruNameCount.get(nk) === 1) return guruByName.get(nk);
      return void 0;
    };
    if (scope === "all" || scope === "guru" || scope === "dudi") {
      for (const d of dudiList) {
        const dId = pickField(d, "ID", "ID_DUDI", "idDudi", "id");
        if (!dId) continue;
        const dGuruId = pickField(d, "ID_Guru_Pendamping", "idGuruPendamping");
        const dGuruName = pickField(d, "Guru_Pendamping", "guruPendamping");
        const matchedG = resolveCanonicalGuru(dGuruId, dGuruName);
        if (!matchedG) continue;
        const gId = pickField(matchedG, "ID", "ID_Guru", "idGuru", "id");
        const gName = pickField(matchedG, "Nama_Lengkap", "Nama_Guru", "namaGuru", "nama");
        if (gId && gName && (dGuruId !== gId || dGuruName !== gName)) {
          await writeLiveSheetViaGas("Master_DUDI", "UPDATE", {
            ...d,
            id: dId,
            ID: dId,
            ID_DUDI: dId,
            ID_Guru_Pendamping: gId,
            idGuruPendamping: gId,
            Guru_Pendamping: gName,
            guruPendamping: gName
          }).catch(() => {
          });
          d.ID_Guru_Pendamping = gId;
          d.Guru_Pendamping = gName;
          updatedDudi++;
        }
      }
    }
    const dudiCounts = /* @__PURE__ */ new Map();
    const guruCounts = /* @__PURE__ */ new Map();
    for (const p of activePlacements) {
      const pDudiId = pickField(p, "ID_DUDI", "idDudi");
      const pDudiName = pickField(p, "Nama_DUDI", "namaDudi", "DUDI_Tujuan");
      const matchedDudi = pDudiId && dudiById.get(pDudiId) || pDudiName && dudiByName.get(norm(pDudiName));
      if (matchedDudi) {
        const dId = pickField(matchedDudi, "ID", "ID_DUDI", "idDudi", "id");
        if (dId) dudiCounts.set(dId, (dudiCounts.get(dId) || 0) + 1);
      }
      const pGuruId = pickField(p, "ID_Guru_Pendamping", "idGuruPendamping");
      const pGuruName = pickField(p, "Guru_Pendamping", "guruPendamping");
      const matchedGuru = resolveCanonicalGuru(pGuruId, pGuruName);
      if (matchedGuru) {
        const gId = pickField(matchedGuru, "ID", "ID_Guru", "idGuru", "id");
        if (gId) guruCounts.set(gId, (guruCounts.get(gId) || 0) + 1);
      }
    }
    for (const d of dudiList) {
      const dId = pickField(d, "ID", "ID_DUDI", "idDudi", "id");
      const nextCount = dudiCounts.get(dId) || 0;
      const currCount = Number(d.Terisi ?? d.terisi ?? 0) || 0;
      if (dId && currCount !== nextCount) {
        await writeLiveSheetViaGas("Master_DUDI", "UPDATE", {
          ...d,
          id: dId,
          ID: dId,
          ID_DUDI: dId,
          Terisi: nextCount,
          terisi: nextCount
        });
        updatedDudi++;
      }
    }
    for (const g of guruList) {
      const gId = pickField(g, "ID", "ID_Guru", "idGuru", "id");
      const nextCount = guruCounts.get(gId) || 0;
      const currCount = Number(g.Jumlah_Bimbingan ?? g.jumlahBimbingan ?? 0) || 0;
      if (gId && currCount !== nextCount) {
        await writeLiveSheetViaGas("Master_Guru_Pendamping", "UPDATE", {
          ...g,
          id: gId,
          ID: gId,
          ID_Guru: gId,
          Jumlah_Bimbingan: nextCount,
          jumlahBimbingan: nextCount
        });
        updatedGuru++;
      }
    }
  }
  if (scope === "all" || scope === "jurusan" || scope === "siswa" || scope === "pengajuan" || scope === "perizinan" || scope === "siswa_pkl") {
    const jurusanByKey = /* @__PURE__ */ new Map();
    for (const j of jurusanList) {
      const nama = pickField(j, "Nama_Jurusan", "namaJurusan", "nama");
      const kode = pickField(j, "Kode_Jurusan", "kodeJurusan", "kode", "id");
      if (nama) jurusanByKey.set(norm(nama), j);
      if (kode) jurusanByKey.set(norm(kode), j);
    }
    const siswaByNis = /* @__PURE__ */ new Map();
    const siswaByName = /* @__PURE__ */ new Map();
    const siswaNameCounts = /* @__PURE__ */ new Map();
    for (const s of siswaList) {
      const nis = pickField(s, "NIS", "nis");
      const nisDigits = stripNisSymbols(nis);
      const nama = pickField(s, "Nama_Lengkap", "namaLengkap", "nama");
      if (nisDigits) siswaByNis.set(nisDigits, s);
      if (nis) siswaByNis.set(nis.toLowerCase(), s);
      if (nama) {
        const nm = norm(nama);
        siswaNameCounts.set(nm, (siswaNameCounts.get(nm) || 0) + 1);
        siswaByName.set(nm, s);
      }
    }
    const resolveMasterSiswa = (nisRaw, namaRaw) => {
      const clean = stripNisSymbols(nisRaw);
      const nisLower = String(nisRaw ?? "").trim().toLowerCase();
      if (clean && siswaByNis.has(clean)) return siswaByNis.get(clean);
      if (nisLower && siswaByNis.has(nisLower)) return siswaByNis.get(nisLower);
      if (clean) return void 0;
      const nm = norm(namaRaw);
      return nm && siswaNameCounts.get(nm) === 1 ? siswaByName.get(nm) : void 0;
    };
    const kuotaCounts = /* @__PURE__ */ new Map();
    const registeredSets = /* @__PURE__ */ new Map();
    const addRegistered = (jurId, key) => {
      if (!key) return;
      let set = registeredSets.get(jurId);
      if (!set) {
        set = /* @__PURE__ */ new Set();
        registeredSets.set(jurId, set);
      }
      set.add(key);
    };
    for (const s of siswaList) {
      const jur = pickField(s, "ID_Jurusan", "jurusan", "Jurusan");
      const matchedJur = jur ? jurusanByKey.get(norm(jur)) : void 0;
      if (!matchedJur) continue;
      const jId = pickField(matchedJur, "Kode_Jurusan", "kode", "id");
      kuotaCounts.set(jId, (kuotaCounts.get(jId) || 0) + 1);
      const statusNorm = norm(pickField(s, "Status_PKL", "statusPKL"));
      if (statusNorm && statusNorm !== "belum daftar") {
        addRegistered(
          jId,
          studentIdentity(
            pickField(s, "NIS", "nis"),
            pickField(s, "Nama_Lengkap", "namaLengkap", "nama"),
            pickField(s, "Kelas", "kelas")
          )
        );
      }
    }
    for (const reqRow of pengajuanList) {
      if (norm(pickField(reqRow, "Status_Kakomli", "statusKakomli")) === "ditolak") continue;
      if (norm(pickField(reqRow, "Status_Hubin", "statusHubin")) === "batal") continue;
      const rNis = pickField(reqRow, "NIS", "nis");
      const rNama = pickField(reqRow, "Nama_Siswa", "namaSiswa");
      const ms = resolveMasterSiswa(rNis, rNama);
      const jur = (ms ? pickField(ms, "ID_Jurusan", "jurusan") : "") || pickField(reqRow, "Jurusan", "jurusan");
      const matchedJur = jur ? jurusanByKey.get(norm(jur)) : void 0;
      if (!matchedJur) continue;
      const jId = pickField(matchedJur, "Kode_Jurusan", "kode", "id");
      addRegistered(
        jId,
        studentIdentity(
          (ms ? pickField(ms, "NIS", "nis") : "") || rNis,
          (ms ? pickField(ms, "Nama_Lengkap", "nama") : "") || rNama,
          (ms ? pickField(ms, "Kelas", "kelas") : "") || pickField(reqRow, "Kelas", "kelas")
        )
      );
    }
    for (const izn of perizinanList) {
      const iNis = pickField(izn, "NIS", "nis");
      const iNama = pickField(izn, "Nama_Siswa", "namaSiswa");
      const ms = resolveMasterSiswa(iNis, iNama);
      const jur = (ms ? pickField(ms, "ID_Jurusan", "jurusan") : "") || pickField(izn, "Jurusan", "jurusan");
      const matchedJur = jur ? jurusanByKey.get(norm(jur)) : void 0;
      if (!matchedJur) continue;
      const jId = pickField(matchedJur, "Kode_Jurusan", "kode", "id");
      addRegistered(
        jId,
        studentIdentity(
          (ms ? pickField(ms, "NIS", "nis") : "") || iNis,
          (ms ? pickField(ms, "Nama_Lengkap", "nama") : "") || iNama,
          (ms ? pickField(ms, "Kelas", "kelas") : "") || pickField(izn, "Kelas", "kelas")
        )
      );
    }
    for (const p of placements) {
      const statusPlt = norm(pickField(p, "Status_Penempatan", "statusPenempatan"));
      if (statusPlt === "dibatalkan" || statusPlt === "batal") continue;
      const pNis = pickField(p, "NIS", "nis");
      const pNama = pickField(p, "Nama_Siswa", "namaSiswa");
      const ms = resolveMasterSiswa(pNis, pNama);
      const jur = ms ? pickField(ms, "ID_Jurusan", "jurusan") : "";
      const matchedJur = jur ? jurusanByKey.get(norm(jur)) : void 0;
      if (!matchedJur) continue;
      const jId = pickField(matchedJur, "Kode_Jurusan", "kode", "id");
      addRegistered(
        jId,
        studentIdentity(
          (ms ? pickField(ms, "NIS", "nis") : "") || pNis,
          (ms ? pickField(ms, "Nama_Lengkap", "nama") : "") || pNama,
          ms ? pickField(ms, "Kelas", "kelas") : ""
        )
      );
    }
    for (const j of jurusanList) {
      const jId = pickField(j, "Kode_Jurusan", "kode", "id");
      const nextKuota = kuotaCounts.get(jId) || 0;
      const nextTerdaftar = registeredSets.get(jId)?.size || 0;
      const currKuota = Number(j.Target_Kuota ?? j.kuotaSiswa ?? 0) || 0;
      const currTerdaftar = Number(j.Siswa_Terdaftar ?? j.totalTerdaftar ?? 0) || 0;
      if (jId && (currKuota !== nextKuota || currTerdaftar !== nextTerdaftar)) {
        await writeLiveSheetViaGas("Master_Jurusan", "UPDATE", {
          ...j,
          id: jId,
          Kode_Jurusan: jId,
          Target_Kuota: nextKuota,
          kuotaSiswa: nextKuota,
          Siswa_Terdaftar: nextTerdaftar,
          totalTerdaftar: nextTerdaftar
        });
        updatedJurusan++;
      }
    }
  }
  if (scope === "all" || scope === "kelas" || scope === "siswa") {
    const kelasByName = /* @__PURE__ */ new Map();
    for (const k of kelasList) {
      const nama = pickField(k, "Nama_Kelas", "namaKelas");
      if (nama) kelasByName.set(norm(nama), k);
    }
    const kelasCounts = /* @__PURE__ */ new Map();
    for (const s of siswaList) {
      const kls = pickField(s, "Kelas", "kelas");
      const matchedKls = kls ? kelasByName.get(norm(kls)) : void 0;
      if (matchedKls) {
        const kId = pickField(matchedKls, "ID_Kelas", "idKelas", "id");
        kelasCounts.set(kId, (kelasCounts.get(kId) || 0) + 1);
      }
    }
    for (const k of kelasList) {
      const kId = pickField(k, "ID_Kelas", "idKelas", "id");
      const nextCount = kelasCounts.get(kId) || 0;
      const currCount = Number(k.Jumlah_Siswa ?? k.jumlahSiswa ?? 0) || 0;
      if (kId && currCount !== nextCount) {
        await writeLiveSheetViaGas("Master_Kelas_Walas", "UPDATE", {
          ...k,
          id: kId,
          ID_Kelas: kId,
          Jumlah_Siswa: nextCount,
          jumlahSiswa: nextCount
        });
        updatedKelas++;
      }
    }
  }
  return {
    updatedPlacements: 0,
    updatedDudi,
    updatedGuru,
    updatedJurusan,
    updatedKelas
  };
}

// server/routes/restApiRoutes.ts
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
      await requireAdminAuth(req);
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
      const q = String(req.query.q || "").trim().toLowerCase();
      if (q) {
        filtered = filtered.filter(
          (row) => Object.values(row || {}).some(
            (v) => v !== null && v !== void 0 && String(v).toLowerCase().includes(q)
          )
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
      const resultData = isPaginated ? filtered.slice((page - 1) * limit, page * limit) : filtered;
      const etag = computeWeakEtag({
        s: config.spreadsheetId,
        y: config.activeYear,
        t: tableName,
        q,
        sortCol,
        sortDir,
        page,
        limit,
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
      if (tableName.toLowerCase() === "master_akun" && session.role !== "SuperAdmin") {
        return res.status(403).json({
          success: false,
          code: "FORBIDDEN",
          message: "Hanya SuperAdmin yang berhak menambah akun."
        });
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
      if (tableName.toLowerCase() === "master_akun" && session.role !== "SuperAdmin") {
        return res.status(403).json({
          success: false,
          code: "FORBIDDEN",
          message: "Hanya SuperAdmin yang berhak mengubah data akun."
        });
      }
      if (normalizedAction === "SYNC_ALL" && session.role !== "SuperAdmin" && session.role !== "Hubin") {
        return res.status(403).json({
          success: false,
          code: "FORBIDDEN",
          message: "Operasi sinkronisasi penuh (SYNC_ALL) hanya diperbolehkan untuk SuperAdmin atau Admin Hubin."
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
      if (tableName.toLowerCase() === "master_akun" && session.role !== "SuperAdmin") {
        return res.status(403).json({
          success: false,
          code: "FORBIDDEN",
          message: "Hanya SuperAdmin yang berhak mengubah data akun."
        });
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
      if (tableName.toLowerCase() === "master_akun" && session.role !== "SuperAdmin") {
        return res.status(403).json({
          success: false,
          code: "FORBIDDEN",
          message: "Hanya SuperAdmin yang berhak menghapus data akun."
        });
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
function stripStructuredTagsFromNote(noteRaw) {
  return String(noteRaw ?? "").replace(/\[Absensi:[^\]]*\]/gi, "").replace(/\[Nilai PKL:[^\]]*\]/gi, "").replace(/\[Skor:[^\]]*\]/gi, "").trim();
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
function buildStudentMonitoringSummary(student, monitoringRows, nilaiRows) {
  const norm = (v) => String(v ?? "").trim().toLowerCase();
  const targetNisRaw = String(student.nis || "").trim();
  const targetNisDigits = stripNisSymbols(targetNisRaw);
  const targetPlt = String(student.idPenempatan || "").trim();
  const targetNama = norm(student.nama);
  const targetDudi = norm(student.dudi_name);
  const matchedMonitoring = (Array.isArray(monitoringRows) ? monitoringRows : []).filter((row) => {
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
      stageLogs[stageNum] = {
        monitoringId,
        stageNum,
        tahap: String(row.Tahap ?? row.tahap ?? getStageValueByNumber(stageNum)),
        sakit: att.sakit,
        izin: att.izin,
        alpha: att.alpha,
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
  if (Array.isArray(nilaiRows)) {
    const matchedNilai = nilaiRows.find((n) => {
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
function pickRecommendedStageForControl(completedStages, control) {
  const unlocked = Array.isArray(control?.unlockedStages) ? Array.from(
    new Set(
      control.unlockedStages.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 1 && n <= 8)
    )
  ).sort((a, b) => a - b) : [...DEFAULT_MONITORING_STAGE_CONTROL.unlockedStages];
  const requireSequential = typeof control?.requireSequential === "boolean" ? control.requireSequential : DEFAULT_MONITORING_STAGE_CONTROL.requireSequential;
  const completed = Array.isArray(completedStages) ? completedStages : [];
  if (unlocked.length > 0) {
    if (requireSequential) {
      const nextSequential = unlocked.find(
        (num) => !completed.includes(num) && (num === 1 || completed.includes(num - 1))
      );
      if (nextSequential !== void 0) return nextSequential;
    }
    const firstUnlockedPending = unlocked.find((num) => !completed.includes(num));
    if (firstUnlockedPending !== void 0) return firstUnlockedPending;
    return unlocked[0];
  }
  if (completed.length > 0) {
    return completed[completed.length - 1];
  }
  return 1;
}

// server/services/monitoringDomainService.ts
async function syncDudiContactToMasterAndPengajuan(input) {
  const targetDudiId = String(input.dudiId || "").trim();
  const targetDudiNameRaw = String(input.namaDudi || "").trim();
  const targetDudiNameNorm = normalizeStr(targetDudiNameRaw);
  const inputPemimpin = String(input.namaPemimpin || "").trim();
  const inputPic = String(input.namaPic || "").trim();
  const inputTelpDudi = String(input.noTelpDudi || "").trim();
  const overwrite = input.overwriteExisting !== false;
  if (!inputPemimpin && !inputPic && !inputTelpDudi) {
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
      noTelpDudi: nextTelp
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
      Kuota_Maksimal: 4,
      Terisi: 1,
      Status_Kerjasama: "Mitra Baru"
    });
    synced = true;
  }
  const reqRes = await fetchLiveSheetViaGas("Data_Pengajuan_PKL", false).catch(() => ({ rows: [] }));
  const matchingReqs = reqRes.rows.filter((r) => {
    const rDudiId = pickField(r, "ID_DUDI", "idDudi");
    const rDudiNama = normalizeStr(pickField(r, "DUDI_Tujuan", "dudiTujuan"));
    const isTarget = targetDudiId && rDudiId === targetDudiId || targetDudiNameNorm && rDudiNama === targetDudiNameNorm;
    const hasBlankContact = !pickField(r, "Nama_Pemimpin", "namaPemimpin") || !pickField(r, "Nama_PIC", "namaPic") || !pickField(r, "No_Telp_DUDI", "noTelpDudi");
    return isTarget && hasBlankContact;
  });
  for (const mr of matchingReqs.slice(0, 10)) {
    const mrId = pickField(mr, "No_Pengajuan", "noPengajuan", "id");
    if (!mrId) continue;
    await writeLiveSheetViaGas("Data_Pengajuan_PKL", "UPDATE", {
      ...mr,
      id: mrId,
      No_Pengajuan: mrId,
      Nama_Pemimpin: pickField(mr, "Nama_Pemimpin", "namaPemimpin") || inputPemimpin,
      Nama_PIC: pickField(mr, "Nama_PIC", "namaPic") || inputPic,
      No_Telp_DUDI: pickField(mr, "No_Telp_DUDI", "noTelpDudi") || inputTelpDudi,
      Kontak_PIC: pickField(mr, "Kontak_PIC", "kontakPic") || inputTelpDudi
    }).catch(() => {
    });
  }
  return synced;
}
async function upsertNilaiDanSertifikat(input) {
  const nilaiRes = await fetchLiveSheetViaGas("Nilai_Dan_Sertifikat", true).catch(() => ({ rows: [] }));
  const cleanNis = stripNisSymbols(input.nis) || String(input.nis || "").trim();
  const idPenempatan = String(input.idPenempatan || `PLT-${cleanNis}`).trim();
  const existingNilai = nilaiRes.rows.find((n) => {
    const rowNis = pickField(n, "NIS", "nis");
    const rowNisDigits = stripNisSymbols(rowNis);
    const rowPlt = pickField(n, "ID_Penempatan", "idPenempatan");
    return cleanNis && (rowNisDigits === cleanNis || rowNis === cleanNis) || idPenempatan && rowPlt === idPenempatan;
  });
  const roundedDudi = Math.round(input.avgScore * 10) / 10;
  const finalPredikat = getPredikatFromScore(roundedDudi);
  if (existingNilai) {
    const existingId = pickField(existingNilai, "ID_Penempatan", "idPenempatan", "id") || idPenempatan;
    await writeLiveSheetViaGas("Nilai_Dan_Sertifikat", "UPDATE", {
      ...existingNilai,
      id: existingId,
      ID_Penempatan: existingId,
      Nilai_K3LH: input.k3lh,
      nilaiK3lh: input.k3lh,
      Nilai_Softskills: input.softskill,
      Nilai_Softskill: input.softskill,
      nilaiSoftskill: input.softskill,
      Nilai_Hardskills: input.teknis,
      Nilai_Kompetensi_Teknis: input.teknis,
      nilaiKompetensiTeknis: input.teknis,
      Nilai_Alur_Bisnis_Dunia_Kerja: input.alurBisnis,
      Nilai_Alur_Bisnis: input.alurBisnis,
      nilaiAlurBisnis: input.alurBisnis,
      Nilai_rata_rata: roundedDudi,
      Nilai_Rata_Rata: roundedDudi,
      nilaiRataRata: roundedDudi,
      Nilai_DUDI: roundedDudi,
      nilaiDudi: roundedDudi,
      Predikat: finalPredikat,
      predikat: finalPredikat,
      Status_Raport: "Siap Cetak",
      statusRaport: "Siap Cetak"
    });
    return;
  }
  await writeLiveSheetViaGas("Nilai_Dan_Sertifikat", "CREATE", {
    id: idPenempatan,
    ID_Penempatan: idPenempatan,
    idPenempatan,
    NIS: cleanNis,
    nis: cleanNis,
    Nama_Siswa: input.namaSiswa,
    namaSiswa: input.namaSiswa,
    Jurusan: input.jurusan,
    jurusan: input.jurusan,
    Kelas: input.kelas || "-",
    kelas: input.kelas || "-",
    DUDI_Tujuan: input.namaDudi,
    dudiTujuan: input.namaDudi,
    Nilai_K3LH: input.k3lh,
    nilaiK3lh: input.k3lh,
    Nilai_Softskills: input.softskill,
    Nilai_Softskill: input.softskill,
    nilaiSoftskill: input.softskill,
    Nilai_Hardskills: input.teknis,
    Nilai_Kompetensi_Teknis: input.teknis,
    nilaiKompetensiTeknis: input.teknis,
    Nilai_Alur_Bisnis_Dunia_Kerja: input.alurBisnis,
    Nilai_Alur_Bisnis: input.alurBisnis,
    nilaiAlurBisnis: input.alurBisnis,
    Nilai_rata_rata: roundedDudi,
    Nilai_Rata_Rata: roundedDudi,
    nilaiRataRata: roundedDudi,
    Nilai_DUDI: roundedDudi,
    nilaiDudi: roundedDudi,
    Predikat: finalPredikat,
    predikat: finalPredikat,
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

// server/routes/publicPortalRoutes.ts
function registerPublicPortalRoutes(app2) {
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
      const canonicalNisRaw = pickField(student, "NIS", "nis");
      const canonicalNis = stripNisSymbols(canonicalNisRaw) || canonicalNisRaw;
      return res.json({
        success: true,
        found: true,
        student: {
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
        }
      });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
  app2.get("/api/public/dudi-list", async (req, res) => {
    try {
      const fresh = String(req.query.fresh || "") === "1";
      const { rows, config } = await fetchLiveSheetViaGas("Master_DUDI", fresh);
      const mapped = rows.filter((d) => pickField(d, "Nama_DUDI", "namaDudi", "nama_dudi", "nama") !== "").map((d, idx) => {
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
          pimpinan: namaPemimpin || namaPic,
          telepon: noTelpDudi
        };
      });
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
      if (masterSiswaRes.rows.length > 0) {
        const matchedStudent = masterSiswaRes.rows.find((s) => {
          const rowNis = pickField(s, "NIS", "nis");
          const rowDigits = stripNisSymbols(rowNis);
          return cleanNisInput && rowDigits === cleanNisInput || rowNis.toLowerCase() === rawNisStr.toLowerCase();
        });
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
      const noPengajuan = `REQ-${(/* @__PURE__ */ new Date()).getFullYear()}-${String(canonicalJurusan || "PKL").substring(0, 3).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
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
      await writeLiveSheetViaGas("Data_Pengajuan_PKL", "CREATE", sheetRow);
      if (matchedDudiRow && mapsCheck.normalizedUrl && !pickField(matchedDudiRow, "Link_Maps", "linkMaps", "link_maps")) {
        try {
          const targetDudiId = pickField(matchedDudiRow, "ID", "id");
          if (targetDudiId) {
            await writeLiveSheetViaGas("Master_DUDI", "UPDATE", {
              ...matchedDudiRow,
              id: targetDudiId,
              ID: targetDudiId,
              Link_Maps: mapsCheck.normalizedUrl,
              linkMaps: mapsCheck.normalizedUrl
            });
          }
        } catch {
        }
      }
      res.json({
        success: true,
        message: "Pengajuan PKL berhasil disimpan langsung ke Cloud Server.",
        application: sheetRow
      });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
  app2.get("/api/public/petugas-list", async (req, res) => {
    try {
      const fresh = String(req.query.fresh || "") === "1";
      const { rows, config } = await fetchLiveSheetViaGas("Master_Guru_Pendamping", fresh);
      const mapped = rows.filter((g) => pickField(g, "Nama_Lengkap", "Nama_Guru", "namaGuru", "nama", "Nama") !== "").map((g, idx) => ({
        id: pickField(g, "ID", "ID_Guru", "idGuru", "id") || `guru_${idx + 1}`,
        nama: pickField(g, "Nama_Lengkap", "Nama_Guru", "namaGuru", "nama", "Nama"),
        nip: pickField(g, "NIP", "nip") || "-",
        peran: pickField(g, "Peran_Utama", "peranUtama", "Peran", "peran") || "Guru Pendamping",
        email: pickField(g, "Email_Google", "email", "emailGoogle")
      }));
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
      if (!validPins.includes(enteredPin)) {
        return res.status(401).json({
          success: false,
          message: "PIN Petugas tidak cocok. Gunakan PIN atau 4 digit terakhir NIP / No. WhatsApp terdaftar."
        });
      }
      const resolvedName = pickField(teacher, "Nama_Lengkap", "Nama_Guru", "namaGuru", "nama", "Nama");
      return res.json({
        success: true,
        message: `Identitas ${resolvedName} terverifikasi.`,
        sessionToken: `pin_auth_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
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
      const plottingRes = { rows: sheets["Plotting_Pemberangkatan"] || [] };
      const dudiRes = { rows: sheets["Master_DUDI"] || [] };
      const pengajuanRes = { rows: sheets["Data_Pengajuan_PKL"] || [] };
      const dudiMapById = /* @__PURE__ */ new Map();
      const dudiMapByName = /* @__PURE__ */ new Map();
      for (const d of dudiRes.rows) {
        const id = pickField(d, "ID", "id");
        const nama = pickField(d, "Nama_DUDI", "namaDudi", "nama_dudi");
        if (id) dudiMapById.set(id, d);
        if (nama) dudiMapByName.set(normalizeStr(nama), d);
      }
      const pengajuanMapsByDudi = /* @__PURE__ */ new Map();
      for (const reqRow of pengajuanRes.rows) {
        const lm = pickField(reqRow, "Link_Maps", "linkMaps", "link_maps");
        if (!lm) continue;
        const did = pickField(reqRow, "ID_DUDI", "idDudi");
        const dname = normalizeStr(pickField(reqRow, "DUDI_Tujuan", "dudiTujuan"));
        if (did && !pengajuanMapsByDudi.has(did)) pengajuanMapsByDudi.set(did, lm);
        if (dname && !pengajuanMapsByDudi.has(dname)) pengajuanMapsByDudi.set(dname, lm);
      }
      const grouped = /* @__PURE__ */ new Map();
      const targetNamaNorm = normalizeStr(petugasNama);
      for (const p of plottingRes.rows) {
        const statusPlt = normalizeStr(pickField(p, "Status_Penempatan", "statusPenempatan"));
        if (statusPlt === "dibatalkan" || statusPlt === "batal" || statusPlt === "pindah dudi") continue;
        const rowGuruId = pickField(p, "ID_Guru_Pendamping", "idGuruPendamping");
        const rowGuruNama = normalizeStr(pickField(p, "Guru_Pendamping", "guruPendamping"));
        const isMatch = petugasId && rowGuruId && rowGuruId === petugasId || targetNamaNorm && rowGuruNama && (rowGuruNama === targetNamaNorm || rowGuruNama.includes(targetNamaNorm) || targetNamaNorm.includes(rowGuruNama));
        if (!isMatch) continue;
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
          grouped.set(key, {
            dudi: {
              id: masterId,
              nama: resolvedName,
              alamat: pickField(master || {}, "Alamat", "alamat") || "-",
              bidang: pickField(master || {}, "Bidang_Keahlian", "bidangKeahlian") || "-",
              namaPemimpin: pickField(master || {}, "Nama_Pemimpin", "namaPemimpin") || "",
              pic: pickField(master || {}, "Nama_PIC", "namaPic") || "-",
              kontak: resolvedKontak,
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
      for (const reqRow of pengajuanRes.rows) {
        const statusHubin = normalizeStr(pickField(reqRow, "Status_Hubin", "statusHubin"));
        const statusKakomli = normalizeStr(pickField(reqRow, "Status_Kakomli", "statusKakomli"));
        if (statusHubin === "batal" || statusKakomli === "ditolak") continue;
        const rowGuruId = pickField(reqRow, "ID_Guru_Pendamping", "idGuruPendamping");
        const rowGuruNama = normalizeStr(pickField(reqRow, "Guru_Pendamping", "guruPendamping"));
        const isMatch = petugasId && rowGuruId && rowGuruId === petugasId || targetNamaNorm && rowGuruNama && (rowGuruNama === targetNamaNorm || rowGuruNama.includes(targetNamaNorm) || targetNamaNorm.includes(rowGuruNama));
        if (!isMatch) continue;
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
          grouped.set(key, {
            dudi: {
              id: masterId,
              nama: resolvedName,
              alamat: pickField(master || {}, "Alamat", "alamat") || pickField(reqRow, "Alamat_DUDI", "alamatDudi") || "-",
              bidang: pickField(master || {}, "Bidang_Keahlian", "bidangKeahlian") || pickField(reqRow, "Bidang_Pekerjaan", "bidangPekerjaan") || "-",
              namaPemimpin: pickField(master || {}, "Nama_Pemimpin", "namaPemimpin") || pickField(reqRow, "Nama_Pemimpin", "namaPemimpin") || "",
              pic: pickField(master || {}, "Nama_PIC", "namaPic") || pickField(reqRow, "Nama_PIC", "namaPic") || "-",
              kontak: resolvedKontak,
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
      const result = Array.from(grouped.values()).map((entry) => ({
        ...entry.dudi,
        jumlahSiswa: entry.studentNisSet.size
      }));
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
          "Nilai_Dan_Sertifikat"
        ],
        /* @__PURE__ */ new Set([
          "Plotting_Pemberangkatan",
          "Data_Pengajuan_PKL",
          "Master_Siswa_XI",
          "Monitoring_5_Tahap",
          "Nilai_Dan_Sertifikat"
        ])
      );
      let siswaRows = sheets["Master_Siswa_XI"] || [];
      if (siswaRows.length === 0) {
        const fallbackSiswa = await fetchMasterSiswaRows().catch(() => ({ rows: [] }));
        siswaRows = fallbackSiswa.rows;
      }
      const plottingRes = { rows: sheets["Plotting_Pemberangkatan"] || [] };
      const pengajuanRes = { rows: sheets["Data_Pengajuan_PKL"] || [] };
      const siswaRes = { rows: siswaRows };
      const monitoringRes = { rows: sheets["Monitoring_5_Tahap"] || [] };
      const nilaiRes = { rows: sheets["Nilai_Dan_Sertifikat"] || [] };
      const siswaByNis = /* @__PURE__ */ new Map();
      for (const s of siswaRes.rows) {
        const nis = pickField(s, "NIS", "nis");
        const nisDigits = stripNisSymbols(nis);
        if (nisDigits) siswaByNis.set(nisDigits, s);
        if (nis) siswaByNis.set(nis, s);
      }
      const studentsMap = /* @__PURE__ */ new Map();
      const targetDudiNorm = normalizeStr(dudiNama);
      const targetPetugasNorm = normalizeStr(petugasNama);
      for (const p of plottingRes.rows) {
        const statusPlt = normalizeStr(pickField(p, "Status_Penempatan", "statusPenempatan"));
        if (statusPlt === "dibatalkan" || statusPlt === "batal" || statusPlt === "pindah dudi") continue;
        const rowDudiId = pickField(p, "ID_DUDI", "idDudi");
        const rowDudiNama = normalizeStr(pickField(p, "Nama_DUDI", "namaDudi"));
        const dudiMatches = dudiId && rowDudiId && rowDudiId === dudiId || targetDudiNorm && rowDudiNama && (rowDudiNama === targetDudiNorm || rowDudiNama.includes(targetDudiNorm));
        if (!dudiMatches) continue;
        if (targetPetugasNorm) {
          const rowGuru = normalizeStr(pickField(p, "Guru_Pendamping", "guruPendamping"));
          if (rowGuru && !rowGuru.includes(targetPetugasNorm) && !targetPetugasNorm.includes(rowGuru)) {
            continue;
          }
        }
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
      for (const reqRow of pengajuanRes.rows) {
        const statusHubin = normalizeStr(pickField(reqRow, "Status_Hubin", "statusHubin"));
        const statusKakomli = normalizeStr(pickField(reqRow, "Status_Kakomli", "statusKakomli"));
        if (statusHubin === "batal" || statusKakomli === "ditolak") continue;
        const rowDudiId = pickField(reqRow, "ID_DUDI", "idDudi");
        const rowDudiNama = normalizeStr(pickField(reqRow, "DUDI_Tujuan", "dudiTujuan"));
        const dudiMatches = dudiId && rowDudiId && rowDudiId === dudiId || targetDudiNorm && rowDudiNama && (rowDudiNama === targetDudiNorm || rowDudiNama.includes(targetDudiNorm));
        if (!dudiMatches) continue;
        if (targetPetugasNorm) {
          const rowGuru = normalizeStr(pickField(reqRow, "Guru_Pendamping", "guruPendamping"));
          if (rowGuru && !rowGuru.includes(targetPetugasNorm) && !targetPetugasNorm.includes(rowGuru)) {
            continue;
          }
        }
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
      const wsConfig = await getFirestoreWorkspaceConfig(String(req.query.fresh || "") === "1");
      const stageControl = normalizeServerMonitoringStageControl(wsConfig.monitoringStageControl);
      const result = Array.from(studentsMap.values()).map((stu) => {
        const summary = buildStudentMonitoringSummary(stu, monitoringRes.rows, nilaiRes.rows);
        return {
          ...stu,
          ...summary,
          recommendedStage: pickRecommendedStageForControl(summary.completedStages, stageControl)
        };
      });
      const etag = computeWeakEtag({
        k: "dudi_students",
        dudiNama,
        dudiId,
        petugasNama,
        stageControl,
        result
      });
      res.setHeader("ETag", etag);
      if (String(req.query.fresh || "") !== "1" && isEtagMatched(req, etag)) {
        return res.status(304).end();
      }
      res.json({ success: true, total: result.length, stageControl, etag, data: result });
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
        createIfMissing: true,
        overwriteExisting: true
      });
      res.json({
        success: true,
        message: "Data kontak & pimpinan DUDI berhasil dikonfirmasi dan disimpan.",
        dudiContact: {
          namaPemimpin: inputPemimpin,
          pic: inputPic,
          kontak: inputTelpDudi
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
      const existingMonId = String(payload.existing_monitoring_id || "").trim();
      const isUpdate = Boolean(existingMonId);
      const idMonitoring = existingMonId || `MON-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const tglVal = normalizeToIsoDate(payload.tanggal) || getTodayWibIsoDate();
      const noteCombined = stripStructuredTagsFromNote(payload.catatan_perkembangan);
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
      if (stageControl.requireSequential && stageNum >= 2) {
        const monRes = await fetchLiveSheetViaGas("Monitoring_5_Tahap", true).catch(() => ({ rows: [] }));
        const summary = buildStudentMonitoringSummary(
          {
            nis: cleanNis,
            nama: String(payload.nama_siswa || ""),
            idPenempatan: String(payload.id_penempatan || ""),
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
      const inputPemimpin = String(payload.nama_pemimpin || "").trim();
      const inputPic = String(payload.nama_pic || "").trim();
      const inputTelpDudi = String(payload.no_telp_dudi || "").trim();
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
      const sheetRow = {
        id: idMonitoring,
        ID_Monitoring: idMonitoring,
        idMonitoring,
        ID_Penempatan: String(payload.id_penempatan || `PLT-${cleanNis}`),
        idPenempatan: String(payload.id_penempatan || `PLT-${cleanNis}`),
        ID_DUDI: String(payload.dudi_id || ""),
        idDudi: String(payload.dudi_id || ""),
        DUDI_Tujuan: String(payload.nama_dudi || ""),
        dudiTujuan: String(payload.nama_dudi || ""),
        Alamat_DUDI: String(payload.alamat_dudi || ""),
        alamatDudi: String(payload.alamat_dudi || ""),
        NIS: cleanNis,
        nis: cleanNis,
        Nama_Siswa: String(payload.nama_siswa || ""),
        namaSiswa: String(payload.nama_siswa || ""),
        Daftar_Siswa: `${payload.nama_siswa} (${cleanNis})`,
        daftarSiswa: `${payload.nama_siswa} (${cleanNis})`,
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
        Foto_Bukti_Drive: "",
        fotoBuktiUrl: "",
        Nilai_DUDI_Terkumpul: nilaiMuncul && avgScore > 0 ? "Ya" : "Belum",
        nilaiDudiTerkumpul: nilaiMuncul && avgScore > 0,
        Blangko_Sertifikat_Bawa: stageNum >= 5 ? "Ya" : "Belum",
        blangkoSertifikatBawa: stageNum >= 5,
        Status_Tahap: "Terlaksana",
        statusTahap: "Terlaksana"
      };
      await writeLiveSheetViaGas("Monitoring_5_Tahap", isUpdate ? "UPDATE" : "CREATE", sheetRow);
      let dudiContactSynced = false;
      if (inputPemimpin || inputPic || inputTelpDudi) {
        try {
          dudiContactSynced = await syncDudiContactToMasterAndPengajuan({
            dudiId: payload.dudi_id,
            namaDudi: payload.nama_dudi,
            alamatDudi: payload.alamat_dudi,
            namaPemimpin: inputPemimpin,
            namaPic: inputPic,
            noTelpDudi: inputTelpDudi,
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
        gradeSynced,
        dudiContactSynced,
        dudiContact: inputPemimpin || inputPic || inputTelpDudi ? {
          namaPemimpin: inputPemimpin,
          pic: inputPic,
          kontak: inputTelpDudi
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
      if (targetRow) {
        resolvedMonId = pickField(targetRow, "ID_Monitoring", "idMonitoring", "id");
        resolvedStage = pickField(targetRow, "Tahap", "tahap") || resolvedStage;
        const cleanNote = stripStructuredTagsFromNote(
          targetRow.Catatan_Kunjungan ?? targetRow.catatanKunjungan ?? ""
        );
        await writeLiveSheetViaGas("Monitoring_5_Tahap", "UPDATE", {
          ...targetRow,
          id: resolvedMonId,
          ID_Monitoring: resolvedMonId,
          idMonitoring: resolvedMonId,
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
          Nilai_rata_rata: avgScore,
          Nilai_Rata_Rata: avgScore,
          nilaiRataRata: avgScore,
          Nilai_DUDI_Terkumpul: "Ya",
          nilaiDudiTerkumpul: true,
          Catatan_Kunjungan: cleanNote,
          catatanKunjungan: cleanNote
        });
      } else {
        resolvedMonId = `MON-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const stageNum = extractStageNumber(resolvedStage) || 5;
        await writeLiveSheetViaGas("Monitoring_5_Tahap", "CREATE", {
          id: resolvedMonId,
          ID_Monitoring: resolvedMonId,
          idMonitoring: resolvedMonId,
          ID_Penempatan: idPenempatan,
          idPenempatan,
          ID_DUDI: String(payload.dudi_id || ""),
          DUDI_Tujuan: String(payload.nama_dudi || ""),
          Alamat_DUDI: String(payload.alamat_dudi || ""),
          NIS: nis,
          Nama_Siswa: namaSiswa,
          Daftar_Siswa: `${namaSiswa} (${nis})`,
          Jurusan: String(payload.jurusan || ""),
          ID_Guru_Pendamping: String(payload.guru_id || ""),
          Guru_Pendamping: String(payload.guru_pembimbing || ""),
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
          Nilai_rata_rata: avgScore,
          Nilai_Rata_Rata: avgScore,
          Catatan_Kunjungan: "",
          Nilai_DUDI_Terkumpul: "Ya",
          Blangko_Sertifikat_Bawa: stageNum >= 5 ? "Ya" : "Belum",
          Status_Tahap: "Terlaksana"
        });
      }
      let nilaiSynced = false;
      try {
        await upsertNilaiDanSertifikat({
          nis,
          idPenempatan,
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

// server/routes/documentRoutes.ts
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
      await requireAdminAuth(req);
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
      return res.json({
        success: true,
        pdfUrl,
        fileId: gasResult?.fileId || "",
        fileName: gasResult?.fileName || "",
        totalSheets: gasResult?.totalSheets || 0,
        message: "Paket dokumen monitoring PDF berhasil dibuat dari Template Google Docs."
      });
    } catch (err) {
      handlePortalError(res, err);
    }
  });
}

// server.ts
var app = express();
var PORT = Number(process.env.PORT) || 3e3;
var jsonParser = express.json({ limit: "2mb" });
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
