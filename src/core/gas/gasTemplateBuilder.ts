import {
  FORMULA_MANAGED_COLUMNS,
  HUBIN_SHEETS_BLUEPRINT,
} from '../types/sheetBlueprint';

function buildRequiredSheetHeadersLiteral(): string {
  const map = Object.fromEntries(
    HUBIN_SHEETS_BLUEPRINT.map((sheet) => [sheet.sheetName, sheet.headers])
  );
  return JSON.stringify(map, null, 2);
}

function buildFormulaManagedHeadersLiteral(): string {
  const map = Object.fromEntries(
    Object.entries(FORMULA_MANAGED_COLUMNS).map(([sheet, cols]) => [
      sheet,
      cols.map((c) => c.toLowerCase().replace(/[^a-z0-9]/g, '')),
    ])
  );
  return JSON.stringify(map, null, 2);
}

export function buildGasBootstrapScript(): string {
  const sheetsConfigLiteral = JSON.stringify(
    HUBIN_SHEETS_BLUEPRINT.map((sheet) => ({
      name: sheet.sheetName,
      headers: sheet.headers,
    })),
    null,
    2
  ).replace(/\n/g, '\n  ');

  return `/**
 * ============================================================================
 * GOOGLE APPS SCRIPT (GAS) - 1-CLICK BOOTSTRAP GENERATOR HUBIN SMK PGRI 2 PONOROGO
 * Fungsi: Membuat Folder Drive, File Spreadsheet Relasional (ARRAYFORMULA),
 *         Google Form, & 5 Template Dokumen Resmi Secara Otomatis
 * ============================================================================
 */

function setupGoogleWorkspaceEnvironment(academicYear) {
  const year = academicYear || '2026/2027';
  const cleanYear = year.replace('/', '_');
  Logger.log('=== MEMULAI GENERATOR OTOMATIS HUBIN SMK PGRI 2 PONOROGO (TA ' + year + ') ===');

  // 1. Buat Folder Utama di Google Drive
  const rootFolderName = 'Arsip Hubin SMK PGRI 2 Ponorogo';
  const rootFolders = DriveApp.getFoldersByName(rootFolderName);
  let hubinFolder = rootFolders.hasNext() ? rootFolders.next() : DriveApp.createFolder(rootFolderName);

  const yearFolderName = 'Prakerin TA ' + year;
  const yearFolders = hubinFolder.getFoldersByName(yearFolderName);
  let yearFolder = yearFolders.hasNext() ? yearFolders.next() : hubinFolder.createFolder(yearFolderName);

  // 2. Buat File Google Spreadsheet Mandiri untuk Tahun Ajaran Ini
  const ssTitle = 'Hubin_SMK_PGRI_2_Ponorogo_' + cleanYear;
  const ss = SpreadsheetApp.create(ssTitle);
  const ssFile = DriveApp.getFileById(ss.getId());
  yearFolder.addFile(ssFile);
  DriveApp.getRootFolder().removeFile(ssFile);

  // Struktur ${HUBIN_SHEETS_BLUEPRINT.length} Sheet Baku Relasional (Single Source of Truth dari Blueprint Aplikasi)
  const sheetsConfig = ${sheetsConfigLiteral};

  sheetsConfig.forEach(function(cfg, idx) {
    let sheet = idx === 0 ? ss.getSheets()[0] : ss.insertSheet(cfg.name);
    sheet.setName(cfg.name);
    sheet.appendRow(cfg.headers);
    sheet.getRange(1, 1, 1, cfg.headers.length).setFontWeight('bold').setBackground('#0F172A').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  });

  // Tanamkan seluruh ARRAYFORMULA relasional Baris-1 bila skrip API terpasang di project yang sama
  if (typeof applyRelationalFormulasToSpreadsheet === 'function') {
    applyRelationalFormulasToSpreadsheet(ss);
  }

  // 3. Buat Google Form Pendaftaran Siswa
  const formTitle = 'Pengajuan PKL Siswa SMK PGRI 2 Ponorogo TA ' + year;
  const form = FormApp.create(formTitle);
  const formFile = DriveApp.getFileById(form.getId());
  yearFolder.addFile(formFile);
  DriveApp.getRootFolder().removeFile(formFile);

  form.setTitle(formTitle)
      .setDescription('Formulir Pengajuan PKL SMK PGRI 2 Ponorogo.')
      .setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  // 4. Buat 5 Template Dokumen Resmi Google Docs
  const templateDocs = [
    { title: 'Template_Lembar_Permohonan_Rekomendasi_Siswa_' + cleanYear, desc: 'Lembar permohonan ke Kakomli' },
    { title: 'Template_Surat_Permohonan_Penempatan_DUDI_' + cleanYear, desc: 'Surat dinas resmi sekolah ke industri' },
    { title: 'Template_Instrumen_Monitoring_8_Tahap_' + cleanYear, desc: 'Panduan supervisi guru pendamping (Pengantaran, Mon 1-6, Penarikan)' },
    { title: 'Template_Lembar_Penilaian_Industri_DUDI_' + cleanYear, desc: 'Form penilaian kompetensi DUDI' },
    { title: 'Template_Cetak_Blangko_Sertifikat_' + cleanYear, desc: 'Template sertifikat PKL resmi' }
  ];

  const createdDocs = [];
  templateDocs.forEach(function(t) {
    const doc = DocumentApp.create(t.title);
    const body = doc.getBody();
    body.appendParagraph('SMK PGRI 2 PONOROGO - POKJA HUBUNGAN INDUSTRI').setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph(t.desc + ' (Tahun Ajaran ' + year + ')');
    body.appendParagraph('Placeholder Merge: {{NAMA_SISWA}}, {{NIS}}, {{JURUSAN}}, {{DUDI_TUJUAN}}, {{NO_SERI_BLANGKO}}');
    doc.saveAndClose();

    const docFile = DriveApp.getFileById(doc.getId());
    yearFolder.addFile(docFile);
    DriveApp.getRootFolder().removeFile(docFile);
    createdDocs.push({ title: t.title, url: doc.getUrl(), id: doc.getId() });
  });

  Logger.log('SPREADSHEET_ID : ' + ss.getId());
  Logger.log('SPREADSHEET_URL: ' + ss.getUrl());
  Logger.log('FORM_URL       : ' + form.getPublishedUrl());
  Logger.log('DRIVE_FOLDER   : ' + yearFolder.getUrl());
  Logger.log('DOCS           : ' + JSON.stringify(createdDocs));
}
`;
}

export function buildAutoGenerateSheetsFormScript(academicYear: string = '2026/2027'): string {
  const safeYear = String(academicYear || '2026/2027').replace(/"/g, '');
  const totalSheets = HUBIN_SHEETS_BLUEPRINT.length;
  const sheetsConfigLiteral = JSON.stringify(
    HUBIN_SHEETS_BLUEPRINT.map((sheet) => ({
      name: sheet.sheetName,
      headers: sheet.headers,
    })),
    null,
    2
  ).replace(/\n/g, '\n  ');

  return `/**
 * ============================================================================
 * GOOGLE APPS SCRIPT: AUTO-GENERATE ${totalSheets} SHEET & GFORM RESMI (SSOT)
 * HUBIN SMK PGRI 2 PONOROGO (TA ${safeYear})
 * ============================================================================
 */
function autoGenerateAllSheetsAndForm() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const year = "${safeYear}";

  const sheetsData = ${sheetsConfigLiteral};

  sheetsData.forEach(function(item, idx) {
    let sheet = ss.getSheetByName(item.name);
    if (!sheet) {
      sheet = (idx === 0 && ss.getSheets().length === 1 && ss.getSheets()[0].getName().indexOf("Sheet1") !== -1)
        ? ss.getSheets()[0]
        : ss.insertSheet(item.name);
      sheet.setName(item.name);
    }
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(item.headers);
      sheet.getRange(1, 1, 1, item.headers.length)
        .setFontWeight("bold")
        .setBackground("#0F172A")
        .setFontColor("#FFFFFF");
      sheet.setFrozenRows(1);
    }
    const nisColIdx = item.headers.indexOf("NIS");
    if (nisColIdx !== -1) {
      sheet.getRange(2, nisColIdx + 1, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat("@");
    }
  });

  if (typeof applyRelationalFormulasToSpreadsheet === "function") {
    applyRelationalFormulasToSpreadsheet(ss);
  }

  const form = FormApp.create("Formulir Pengajuan PKL Siswa TA " + year);
  form.setDescription("Jawaban masuk ke Sheet Data_Pengajuan_PKL")
      .setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  Logger.log("SUKSES: ${totalSheets} Tabel siap digunakan! Form URL: " + form.getPublishedUrl());
}`;
}

export function buildGasApiScript(): string {
  const requiredHeadersLiteral = buildRequiredSheetHeadersLiteral();
  const formulaManagedLiteral = buildFormulaManagedHeadersLiteral();

  return `/**
 * ============================================================================
 * GOOGLE APPS SCRIPT (GAS) - API WEB APP ENDPOINT (SSOT RELATIONAL + ARRAYFORMULA)
 * Mendukung Opsi 2 (Hybrid Relational + ARRAYFORMULA Baris-1 Read-Only),
 * Non-Formula Span Writes (Zero #REF!), Monitoring_5_Tahap sebagai SSOT Nilai,
 * Portal Publik Siswa (NIS) & Petugas Monitoring (PIN), serta Cetak PDF.
 * ============================================================================
 */

/**
 * Jalankan fungsi ini 1x dari toolbar Apps Script (setelah klik Save / Ctrl+S)
 * untuk backfill Foreign Key, migrasi nilai historis ke Monitoring_5_Tahap,
 * dan menanamkan seluruh ARRAYFORMULA Baris-1 secara otomatis.
 */
function setupRelationalFormulasAndMigrate() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Spreadsheet aktif tidak ditemukan.');
  const summary = applyRelationalFormulasToSpreadsheet(ss);
  Logger.log('HASIL MIGRASI RELASIONAL: ' + JSON.stringify(summary));
  return summary;
}

function normalizeKey(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const KEY_ALIASES = {
  id: ['id', 'idguru', 'idperizinan', 'idpenempatan', 'idmonitoring', 'nopengajuan'],
  idguru: ['idguru', 'id'],
  idgurupendamping: ['idgurupendamping', 'idguru'],
  idkakomli: ['idkakomli', 'idguru'],
  iddudi: ['iddudi'],
  idperizinan: ['idperizinan', 'noperizinan', 'id'],
  noperizinan: ['noperizinan', 'idperizinan', 'id'],
  nopengajuan: ['nopengajuan', 'id'],
  idpenempatan: ['idpenempatan', 'id'],
  idmonitoring: ['idmonitoring', 'id'],
  idterbit: ['idterbit', 'id'],
  namatahap: ['namatahap'],
  statusterbit: ['statusterbit'],
  jenisdokumen: ['jenisdokumen'],
  nomorsurat: ['nomorsurat'],
  diterbitkanoleh: ['diterbitkanoleh'],
  linkpdf: ['linkpdf', 'linksuratpdf'],
  updatedat: ['updatedat'],
  tahap: ['tahap', 'tahapmonitoring'],
  tahapmonitoring: ['tahapmonitoring', 'tahap'],
  nohpsiswa: ['nohpsiswa', 'nohp', 'telepon'],
  alamatdudi: ['alamatdudi', 'alamat'],
  tglberangkat: ['tglberangkat', 'tanggalberangkat'],
  tanggalberangkat: ['tanggalberangkat', 'tglberangkat'],
  tglkirimsurat: ['tglkirimsurat', 'tanggalkirimsurat'],
  tanggalkirimsurat: ['tanggalkirimsurat', 'tglkirimsurat'],
  tglbalasan: ['tglbalasan', 'tanggalbalasan'],
  tanggalbalasan: ['tanggalbalasan', 'tglbalasan'],
  tglterbit: ['tglterbit', 'tanggalterbit'],
  tanggalterbit: ['tanggalterbit', 'tglterbit'],
  fotobuktidrive: ['fotobuktidrive', 'fotobuktiurl'],
  fotobuktiurl: ['fotobuktiurl', 'fotobuktidrive'],
  fotourl: ['fotourl', 'foto'],
  noseriblangko: ['noseriblangko'],
  passwordhash: ['passwordhash'],
  nilaisoftskills: ['nilaisoftskills', 'nilaisoftskill'],
  nilaisoftskill: ['nilaisoftskill', 'nilaisoftskills'],
  nilaihardskills: ['nilaihardskills', 'nilaikompetensiteknis'],
  nilaikompetensiteknis: ['nilaikompetensiteknis', 'nilaihardskills'],
  nilaialurbisnisduniakerja: ['nilaialurbisnisduniakerja', 'nilaialurbisnis'],
  nilaialurbisnis: ['nilaialurbisnis', 'nilaialurbisnisduniakerja'],
  nilairatarata: ['nilairatarata', 'nilaidudi', 'nilaiakhir'],
  nilaidudi: ['nilaidudi', 'nilairatarata', 'nilaiakhir'],
  idjurusan: ['idjurusan', 'jurusan'],
  jurusan: ['jurusan', 'idjurusan'],
  namalengkap: ['namalengkap', 'nama', 'namasiswa', 'namaguru'],
  namaguru: ['namaguru', 'namalengkap', 'nama'],
  namasiswa: ['namasiswa', 'nama', 'namalengkap'],
  linkmaps: ['linkmaps', 'mapsurl', 'googlemaps'],
  linksuratpdf: ['linksuratpdf', 'linkpdf'],
  izin: ['izin', 'statusizinortu'],
  statusizinortu: ['statusizinortu', 'izin'],
  tglmulaiizin: ['tglmulaiizin', 'tanggalmulaiizin'],
  tanggalmulaiizin: ['tanggalmulaiizin', 'tglmulaiizin'],
  tglselesaiizin: ['tglselesaiizin', 'tanggalselesaiizin'],
  tanggalselesaiizin: ['tanggalselesaiizin', 'tglselesaiizin'],
  rentangtanggal: ['rentangtanggal'],
  harikerja: ['harikerja'],
  jamkerja: ['jamkerja'],
  bukulaporan: ['bukulaporan'],
  aktivitasdp: ['aktivitasdp'],
  aktivitasmt: ['aktivitasmt'],
  aktivitaskrt: ['aktivitaskrt'],
  kompetensididapat: ['kompetensididapat', 'kompetensisiswa'],
  kondisibengkel: ['kondisibengkel'],
  ttdsiswa: ['ttdsiswa']
};

const REQUIRED_SHEET_HEADERS = ${requiredHeadersLiteral};

const FORMULA_MANAGED_HEADERS = ${formulaManagedLiteral};

function getNormalizedValue(rowObj, header) {
  if (!rowObj || typeof rowObj !== 'object') return undefined;
  const target = normalizeKey(header);
  const candidateTargets = KEY_ALIASES[target] || [target];
  const keys = Object.keys(rowObj);

  let firstDefined = undefined;
  if (rowObj[header] !== undefined) {
    if (String(rowObj[header] === null ? '' : rowObj[header]).trim() !== '') {
      return rowObj[header];
    }
    firstDefined = rowObj[header];
  }

  for (let c = 0; c < candidateTargets.length; c++) {
    const wanted = candidateTargets[c];
    for (let i = 0; i < keys.length; i++) {
      if (keys[i] === '_sheetRowNumber') continue;
      if (normalizeKey(keys[i]) === wanted) {
        const val = rowObj[keys[i]];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return val;
        }
        if (firstDefined === undefined && val !== undefined) {
          firstDefined = val;
        }
      }
    }
  }
  return firstDefined;
}

function getGasSheetCacheVersion(ssId) {
  try {
    return CacheService.getScriptCache().get('ver_' + ssId) || '0';
  } catch (e) {
    return '0';
  }
}

function bumpGasSheetCacheVersion(ssId) {
  try {
    CacheService.getScriptCache().put('ver_' + ssId, String(Date.now()), 3600);
  } catch (e) {
    // ignore cache error
  }
}

function readSheetRowsFast(ss, sheetName, ssId, ver, bypassCache) {
  const cacheKey = 'sh_' + ver + '_' + ssId + '_' + sheetName;
  let scriptCache = null;
  if (!bypassCache) {
    try {
      scriptCache = CacheService.getScriptCache();
      const cached = scriptCache.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {
      // ignore cache miss
    }
  }

  const sheet = resolveSheetAlias(ss, sheetName);
  if (!sheet) {
    if (sheetName === 'Master_Akun' || sheetName === 'Log_Penerbitan_Surat') {
      return { rows: [], missingSheet: true };
    }
    return { error: 'Sheet tidak ditemukan: ' + sheetName };
  }

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    return { rows: [] };
  }

  const headers = data[0];
  const tz = ss.getSpreadsheetTimeZone() || 'Asia/Jakarta';
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const row = {};
    let hasValue = false;
    for (let j = 0; j < headers.length; j++) {
      let cellVal = data[i][j];
      if (Object.prototype.toString.call(cellVal) === '[object Date]' && !isNaN(cellVal.getTime())) {
        const hNorm = normalizeKey(headers[j]);
        const fmt = (hNorm === 'timestamp' || hNorm === 'updatedat') ? 'yyyy-MM-dd HH:mm:ss' : 'yyyy-MM-dd';
        cellVal = Utilities.formatDate(cellVal, tz, fmt);
      }
      row[headers[j]] = cellVal;
      if (String(cellVal === null || cellVal === undefined ? '' : cellVal).trim() !== '') hasValue = true;
    }
    if (hasValue) {
      row._sheetRowNumber = i + 1;
      rows.push(row);
    }
  }

  const result = { rows: rows };
  try {
    scriptCache = scriptCache || CacheService.getScriptCache();
    const serialized = JSON.stringify(result);
    if (serialized.length < 90000) {
      scriptCache.put(cacheKey, serialized, 90);
    }
  } catch (e) {
    // ignore CacheService 100KB limit
  }
  return result;
}

function doGet(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    const action = String(params.action || '').toUpperCase();
    const bypassCache = String(params.fresh || '') === '1';
    const spreadsheetId = String(params.spreadsheetId || '').trim();
    const ss = spreadsheetId ? SpreadsheetApp.openById(spreadsheetId) : SpreadsheetApp.getActiveSpreadsheet();

    if (!ss) {
      return ContentService.createTextOutput(JSON.stringify({
        error: 'Spreadsheet tidak ditemukan. Pastikan skrip dipasang melalui Ekstensi -> Apps Script atau kirim parameter spreadsheetId.'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const ssId = ss.getId();
    const ver = getGasSheetCacheVersion(ssId);

    if (action === 'PING' || (!action && !params.sheet && !params.sheets)) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        title: ss.getName(),
        sheets: ss.getSheets().map(function(s) { return s.getName(); })
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'BATCH_GET' && params.sheets) {
      const requested = String(params.sheets)
        .split(',')
        .map(function(s) { return String(s || '').trim(); })
        .filter(Boolean);
      const sheetsPayload = {};
      for (let i = 0; i < requested.length; i++) {
        const name = requested[i];
        const res = readSheetRowsFast(ss, name, ssId, ver, bypassCache);
        sheetsPayload[name] = res.error ? [] : (res.rows || []);
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        sheets: sheetsPayload
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const sheetName = params.sheet || 'Master_Jurusan';
    const res = readSheetRowsFast(ss, sheetName, ssId, ver, bypassCache);
    if (res.error) {
      return ContentService.createTextOutput(JSON.stringify({ error: res.error }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      data: res.rows || [],
      missingSheet: Boolean(res.missingSheet)
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function canonicalizeSheetName(sheetName) {
  if (sheetName === 'Master_Siswa') return 'Master_Siswa_XI';
  if (
    sheetName === 'Monitoring_6_Tahap' ||
    sheetName === 'Monitoring_8_Tahap' ||
    sheetName === 'Monitoring_PKL'
  ) {
    return 'Monitoring_5_Tahap';
  }
  return sheetName;
}

function resolveSheetAlias(ss, sheetName) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet && (sheetName === 'Master_Siswa_XI' || sheetName === 'Master_Siswa')) {
    sheet = ss.getSheetByName('Master_Siswa_XI') || ss.getSheetByName('Master_Siswa');
  } else if (
    !sheet &&
    (sheetName === 'Monitoring_5_Tahap' ||
      sheetName === 'Monitoring_6_Tahap' ||
      sheetName === 'Monitoring_8_Tahap' ||
      sheetName === 'Monitoring_PKL')
  ) {
    sheet =
      ss.getSheetByName('Monitoring_5_Tahap') ||
      ss.getSheetByName('Monitoring_6_Tahap') ||
      ss.getSheetByName('Monitoring_8_Tahap') ||
      ss.getSheetByName('Monitoring_PKL');
  }
  return sheet;
}

function ensureMissingHeaders(sheet, rawSheetName) {
  const canonicalSheetName = canonicalizeSheetName(rawSheetName);
  const expected = REQUIRED_SHEET_HEADERS[canonicalSheetName];
  const lastCol = sheet.getLastColumn();
  if (!expected || lastCol === 0) {
    return lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  }
  const currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const existingNorms = {};
  for (let i = 0; i < currentHeaders.length; i++) {
    existingNorms[normalizeKey(currentHeaders[i])] = true;
  }
  const missing = [];
  for (let j = 0; j < expected.length; j++) {
    const expNorm = normalizeKey(expected[j]);
    const hasMatch = Boolean(existingNorms[expNorm]);
    if (!hasMatch) {
      missing.push(expected[j]);
    }
  }
  if (missing.length > 0) {
    sheet.getRange(1, currentHeaders.length + 1, 1, missing.length)
      .setValues([missing])
      .setFontWeight('bold')
      .setBackground('#0F172A')
      .setFontColor('#FFFFFF');
    return currentHeaders.concat(missing);
  }
  return currentHeaders;
}

function syncAllSpreadsheetHeaders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(REQUIRED_SHEET_HEADERS).forEach(function(name) {
    const sh = resolveSheetAlias(ss, name);
    if (sh) ensureMissingHeaders(sh, name);
  });
}

function colToLetterGas(index0) {
  let col = index0 + 1;
  let letter = '';
  while (col > 0) {
    const rem = (col - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}

function findColumnIndex(headers, candidatesNorm) {
  for (let c = 0; c < headers.length; c++) {
    const k = normalizeKey(headers[c]);
    if (candidatesNorm.indexOf(k) !== -1) {
      return c;
    }
  }
  return -1;
}

function detectFormulaColFlags(sheet, headersLength) {
  const flags = [];
  if (!sheet || headersLength <= 0) return flags;
  const f1 = sheet.getRange(1, 1, 1, headersLength).getFormulas()[0];
  const f2 = sheet.getLastRow() >= 2 ? sheet.getRange(2, 1, 1, headersLength).getFormulas()[0] : [];
  for (let c = 0; c < headersLength; c++) {
    const hasF1 = Boolean(f1[c] && String(f1[c]).charAt(0) === '=');
    const hasF2 = Boolean(f2[c] && String(f2[c]).charAt(0) === '=');
    flags.push(hasF1 || hasF2);
  }
  return flags;
}

function formatNisAndTextColumns(sheet, headers, startRow, numRows) {
  if (!sheet || numRows <= 0) return;
  const nisIdx = findColumnIndex(headers, ['nis']);
  if (nisIdx !== -1) {
    sheet.getRange(startRow, nisIdx + 1, numRows, 1).setNumberFormat('@');
  }
}

function writeNonFormulaRowSpans(sheet, rowNum, rowValues, isFormulaCol) {
  const len = rowValues.length;
  let c = 0;
  while (c < len) {
    if (isFormulaCol[c]) {
      c++;
      continue;
    }
    const startIdx = c;
    const span = [];
    while (c < len && !isFormulaCol[c]) {
      span.push(rowValues[c]);
      c++;
    }
    sheet.getRange(rowNum, startIdx + 1, 1, span.length).setValues([span]);
  }
}

function writeNonFormulaMatrixSpans(sheet, startRow, matrix, isFormulaCol) {
  if (!matrix || matrix.length === 0) return;
  const cols = isFormulaCol.length;
  const rowsCount = matrix.length;
  let c = 0;
  while (c < cols) {
    if (isFormulaCol[c]) {
      c++;
      continue;
    }
    const startIdx = c;
    let endIdx = c;
    while (endIdx < cols && !isFormulaCol[endIdx]) {
      endIdx++;
    }
    const spanLen = endIdx - startIdx;
    const subMatrix = [];
    for (let r = 0; r < rowsCount; r++) {
      subMatrix.push(matrix[r].slice(startIdx, endIdx));
    }
    sheet.getRange(startRow, startIdx + 1, rowsCount, spanLen).setValues(subMatrix);
    c = endIdx;
  }
}

function clearNonFormulaDataRows(sheet, headersLen, isFormulaCol) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;
  let c = 0;
  while (c < headersLen) {
    if (isFormulaCol[c]) {
      c++;
      continue;
    }
    const startIdx = c;
    while (c < headersLen && !isFormulaCol[c]) {
      c++;
    }
    sheet.getRange(2, startIdx + 1, lastRow - 1, c - startIdx).clearContent();
  }
}

function getNextAppendRowNonFormula(sheet, isFormulaCol) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 2;
  const cols = isFormulaCol.length;
  const data = sheet.getRange(1, 1, lastRow, cols).getValues();
  for (let r = data.length - 1; r >= 1; r--) {
    for (let c = 0; c < cols; c++) {
      if (!isFormulaCol[c] && String(data[r][c] === null || data[r][c] === undefined ? '' : data[r][c]).trim() !== '') {
        return r + 2;
      }
    }
  }
  return 2;
}

function parseRowHintFromId(rawId) {
  const str = String(rawId || '').trim();
  const hashMatch = str.match(/^(.*)#r(\\d+)$/);
  if (hashMatch) {
    return { cleanId: hashMatch[1].trim(), rowNum: Number(hashMatch[2]) };
  }
  const placeholderMatch = str.match(/^row_(\\d+)$/);
  if (placeholderMatch) {
    return { cleanId: '', rowNum: Number(placeholderMatch[1]) };
  }
  return { cleanId: str, rowNum: 0 };
}

function extractRecordId(obj) {
  if (!obj || typeof obj !== 'object') return '';
  return String(
    obj.id ||
    obj.ID ||
    obj.No_Pengajuan ||
    obj.noPengajuan ||
    obj.ID_Perizinan ||
    obj.noPerizinan ||
    obj.ID_Penempatan ||
    obj.idPenempatan ||
    obj.ID_Monitoring ||
    obj.idMonitoring ||
    obj.ID_Terbit ||
    obj.idTerbit ||
    ''
  ).trim();
}

function findRowIndexById(values, headers, targetId, rowObj, sheetName, explicitRowNum) {
  const parsed = parseRowHintFromId(targetId);
  const cleanId = parsed.cleanId;
  const rowNumHint = Number(explicitRowNum || (rowObj && rowObj._sheetRowNumber) || parsed.rowNum || 0);

  let idColIdx = findColumnIndex(headers, ['id', 'nopengajuan', 'idperizinan', 'idpenempatan', 'idmonitoring', 'idterbit']);
  if (idColIdx === -1) idColIdx = 0;

  const nisColIdx = findColumnIndex(headers, ['nis']);
  const userColIdx = findColumnIndex(headers, ['username']);
  const namaColIdx = findColumnIndex(headers, ['namasiswa', 'namalengkap', 'namadudi']);

  const stripNis = function(v) {
    return String(v || '').replace(/\\D/g, '');
  };

  if (rowNumHint >= 2 && rowNumHint <= values.length) {
    const idx = rowNumHint - 1;
    const cellId = String(values[idx][idColIdx] || '').trim();
    const nisWanted = String((rowObj && (rowObj.NIS || rowObj.nis)) || '').trim();
    const nisWantedDigits = stripNis(nisWanted);
    const cellNis = nisColIdx !== -1 ? String(values[idx][nisColIdx] || '').trim() : '';
    const cellNisDigits = stripNis(cellNis);
    const nisMatches = (nisWanted && cellNis === nisWanted) || (nisWantedDigits && cellNisDigits === nisWantedDigits);

    if (
      (cleanId && cellId === cleanId) ||
      (!cellId && (!nisWanted || !cellNis || nisMatches)) ||
      nisMatches
    ) {
      return idx;
    }
  }

  if (cleanId) {
    for (let r = 1; r < values.length; r++) {
      const colVal = String(values[r][idColIdx] || '').trim();
      const firstColVal = String(values[r][0] || '').trim();
      if (colVal === cleanId || firstColVal === cleanId) {
        return r;
      }
    }
  }

  const nisWanted = String((rowObj && (rowObj.NIS || rowObj.nis)) || '').trim() ||
    ((sheetName === 'Nilai_Dan_Sertifikat' || sheetName === 'Master_Siswa_XI' || sheetName === 'Master_Siswa') ? cleanId : '');
  const nisWantedDigits = stripNis(nisWanted);
  if (nisWanted && nisColIdx !== -1) {
    for (let r2 = 1; r2 < values.length; r2++) {
      const rowNisStr = String(values[r2][nisColIdx] || '').trim();
      if (rowNisStr === nisWanted || (nisWantedDigits && stripNis(rowNisStr) === nisWantedDigits)) {
        return r2;
      }
    }
  }

  const userWanted = String((rowObj && (rowObj.Username || rowObj.username)) || '').trim();
  if (userWanted && userColIdx !== -1) {
    for (let r3 = 1; r3 < values.length; r3++) {
      if (String(values[r3][userColIdx] || '').trim().toLowerCase() === userWanted.toLowerCase()) {
        return r3;
      }
    }
  }

  const namaWanted = String((rowObj && (rowObj.Nama_Siswa || rowObj.namaSiswa || rowObj.Nama_Lengkap || rowObj.Nama_DUDI)) || '').trim();
  if (namaWanted && namaColIdx !== -1 && (rowNumHint >= 2 || !cleanId)) {
    for (let r4 = 1; r4 < values.length; r4++) {
      if (String(values[r4][namaColIdx] || '').trim().toLowerCase() === namaWanted.toLowerCase()) {
        return r4;
      }
    }
  }

  return -1;
}

// (Entry point setupRelationalFormulasAndMigrate berada di bagian paling atas skrip)
function applyRelationalFormulasToSpreadsheet(ss) {
  const targetSs = ss || SpreadsheetApp.getActiveSpreadsheet();
  const normText = function(v) {
    return String(v === null || v === undefined ? '' : v).trim().toLowerCase().replace(/\\s+/g, ' ');
  };
  const normDigits = function(v) {
    return String(v === null || v === undefined ? '' : v).replace(/\\D/g, '');
  };
  const jurCodeMap = {
    'desain komunikasi visual': 'DKV',
    'rekayasa perangkat lunak': 'RPL',
    'teknik alat berat': 'TAB',
    'teknik bodi kendaraan ringan': 'TBKR',
    'teknik kendaraan ringan': 'TKR',
    'teknik komputer dan jaringan': 'TKJ',
    'teknik pemesinan': 'TPM',
    'teknik pengelasan': 'TPL',
    'teknik sepeda motor': 'TSM'
  };
  const resolveJurCode = function(rawVal, jurusanRowsMap) {
    const s = String(rawVal || '').trim();
    if (!s) return '';
    const n = normText(s);
    if (jurCodeMap[n]) return jurCodeMap[n];
    if (jurusanRowsMap && jurusanRowsMap[n]) return jurusanRowsMap[n];
    const upper = s.toUpperCase();
    if (/^[A-Z0-9]{2,6}$/.test(upper)) return upper;
    return '';
  };

  // Helper sisipkan kolom FK sebelum kolom referensi bila belum ada
  const insertFkBeforeIfMissing = function(sheet, fkHeader, beforeHeaderCandidates) {
    if (!sheet || sheet.getLastColumn() === 0) return;
    const hdrs = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (findColumnIndex(hdrs, [normalizeKey(fkHeader)]) !== -1) return;
    const beforeIdx = findColumnIndex(hdrs, beforeHeaderCandidates);
    if (beforeIdx !== -1) {
      sheet.insertColumnBefore(beforeIdx + 1);
      sheet.getRange(1, beforeIdx + 1)
        .setValue(fkHeader)
        .setFontWeight('bold')
        .setBackground('#0F172A')
        .setFontColor('#FFFFFF');
    } else {
      ensureMissingHeaders(sheet, sheet.getName());
    }
  };

  // 1. Pastikan seluruh sheet memiliki kolom relasional terbaru & header lengkap
  const shSiswa = resolveSheetAlias(targetSs, 'Master_Siswa_XI');
  const shJurusan = resolveSheetAlias(targetSs, 'Master_Jurusan');
  const shKelas = resolveSheetAlias(targetSs, 'Master_Kelas_Walas');
  const shDudi = resolveSheetAlias(targetSs, 'Master_DUDI');
  const shGuru = resolveSheetAlias(targetSs, 'Master_Guru_Pendamping');
  const shPengajuan = resolveSheetAlias(targetSs, 'Data_Pengajuan_PKL');
  const shPerizinan = resolveSheetAlias(targetSs, 'Data_Perizinan_PKL');
  const shPlotting = resolveSheetAlias(targetSs, 'Plotting_Pemberangkatan');
  const shMonitoring = resolveSheetAlias(targetSs, 'Monitoring_5_Tahap');
  const shSertifikat = resolveSheetAlias(targetSs, 'Nilai_Dan_Sertifikat');
  const shLogSurat = resolveSheetAlias(targetSs, 'Log_Penerbitan_Surat');

  if (shJurusan) insertFkBeforeIfMissing(shJurusan, 'ID_Kakomli', ['namakakomli']);
  if (shKelas) insertFkBeforeIfMissing(shKelas, 'ID_Jurusan', ['jurusan']);
  if (shPerizinan) insertFkBeforeIfMissing(shPerizinan, 'ID_DUDI', ['duditujuan']);
  if (shMonitoring) {
    insertFkBeforeIfMissing(shMonitoring, 'ID_DUDI', ['duditujuan']);
    insertFkBeforeIfMissing(shMonitoring, 'ID_Guru_Pendamping', ['gurupendamping']);
  }
  if (shSertifikat) insertFkBeforeIfMissing(shSertifikat, 'ID_DUDI', ['duditujuan']);
  if (shLogSurat) insertFkBeforeIfMissing(shLogSurat, 'ID_Guru_Pendamping', ['gurupendamping']);

  Object.keys(REQUIRED_SHEET_HEADERS).forEach(function(name) {
    const sh = resolveSheetAlias(targetSs, name);
    if (sh) ensureMissingHeaders(sh, name);
  });

  // 2. Bangun peta referensi Master (Jurusan, Guru, DUDI, Siswa, Plotting) untuk backfill FK
  const jurNameToCode = {};
  if (shJurusan && shJurusan.getLastRow() >= 2) {
    const jd = shJurusan.getDataRange().getValues();
    const jh = jd[0];
    const cKode = findColumnIndex(jh, ['kode', 'kodejurusan', 'id']);
    const cNama = findColumnIndex(jh, ['namajurusan', 'nama']);
    for (let r = 1; r < jd.length; r++) {
      const k = cKode !== -1 ? String(jd[r][cKode] || '').trim() : '';
      const n = cNama !== -1 ? String(jd[r][cNama] || '').trim() : '';
      if (k && n) {
        jurNameToCode[normText(n)] = k.toUpperCase();
        jurNameToCode[normText(k)] = k.toUpperCase();
      }
    }
  }

  const guruById = {};
  const guruByName = {};
  const guruNameCount = {};
  if (shGuru && shGuru.getLastRow() >= 2) {
    const gd = shGuru.getDataRange().getValues();
    const gh = gd[0];
    const cId = findColumnIndex(gh, ['id', 'idguru']);
    const cNama = findColumnIndex(gh, ['namalengkap', 'namaguru', 'nama']);
    for (let r = 1; r < gd.length; r++) {
      const id = cId !== -1 ? String(gd[r][cId] || '').trim() : '';
      const nm = cNama !== -1 ? String(gd[r][cNama] || '').trim() : '';
      if (id) guruById[id] = { id: id, nama: nm };
      if (nm) {
        const nk = normText(nm);
        guruNameCount[nk] = (guruNameCount[nk] || 0) + 1;
        guruByName[nk] = id;
      }
    }
  }

  // Backfill ID_Kakomli di Master_Jurusan dari Master_Guru_Pendamping (tanpa menimpa Nama_Kakomli manual)
  if (shJurusan && shJurusan.getLastRow() >= 2) {
    const jd2 = shJurusan.getDataRange().getValues();
    const jh2 = jd2[0];
    const cIdKakomli = findColumnIndex(jh2, ['idkakomli']);
    const cNmKakomli = findColumnIndex(jh2, ['namakakomli']);
    if (cIdKakomli !== -1 && cNmKakomli !== -1) {
      let jChanged = false;
      for (let r = 1; r < jd2.length; r++) {
        if (!String(jd2[r][cIdKakomli] || '').trim()) {
          const nk = normText(jd2[r][cNmKakomli]);
          if (nk && guruNameCount[nk] === 1 && guruByName[nk]) {
            jd2[r][cIdKakomli] = guruByName[nk];
            jChanged = true;
          }
        }
      }
      if (jChanged) {
        shJurusan.getRange(2, cIdKakomli + 1, jd2.length - 1, 1)
          .setValues(jd2.slice(1).map(function(row) { return [row[cIdKakomli]]; }));
      }
    }
  }

  const dudiById = {};
  const dudiByName = {};
  if (shDudi && shDudi.getLastRow() >= 2) {
    const dd = shDudi.getDataRange().getValues();
    const dh = dd[0];
    const cId = findColumnIndex(dh, ['id', 'iddudi']);
    const cNama = findColumnIndex(dh, ['namadudi', 'nama']);
    const cIdGuru = findColumnIndex(dh, ['idgurupendamping', 'idguru']);
    const cNmGuru = findColumnIndex(dh, ['gurupendamping']);
    let dChanged = false;
    for (let r = 1; r < dd.length; r++) {
      const id = cId !== -1 ? String(dd[r][cId] || '').trim() : '';
      const nm = cNama !== -1 ? String(dd[r][cNama] || '').trim() : '';
      let gId = cIdGuru !== -1 ? String(dd[r][cIdGuru] || '').trim() : '';
      const gNm = cNmGuru !== -1 ? String(dd[r][cNmGuru] || '').trim() : '';
      if (!gId && gNm && guruByName[normText(gNm)] && cIdGuru !== -1) {
        gId = guruByName[normText(gNm)];
        dd[r][cIdGuru] = gId;
        dChanged = true;
      }
      if (id) dudiById[id] = { id: id, nama: nm, idGuru: gId };
      if (nm) dudiByName[normText(nm)] = id;
    }
    if (dChanged && cIdGuru !== -1) {
      const colVals = dd.slice(1).map(function(row) { return [row[cIdGuru]]; });
      shDudi.getRange(2, cIdGuru + 1, colVals.length, 1).setValues(colVals);
    }
  }

  // Format kolom NIS sebagai plain text '@' agar VLOOKUP teks & angka konsisten
  [shSiswa, shPengajuan, shPerizinan, shPlotting, shMonitoring, shSertifikat].forEach(function(sh) {
    if (!sh || sh.getLastColumn() === 0) return;
    const h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    const nisIdx = findColumnIndex(h, ['nis']);
    if (nisIdx !== -1 && sh.getLastRow() >= 2) {
      const nr = sh.getRange(2, nisIdx + 1, sh.getLastRow() - 1, 1);
      nr.setNumberFormat('@');
      const nVals = nr.getValues();
      let changed = false;
      for (let i = 0; i < nVals.length; i++) {
        const clean = normDigits(nVals[i][0]) || String(nVals[i][0] || '').trim();
        if (clean !== nVals[i][0] && clean !== '') {
          nVals[i][0] = clean;
          changed = true;
        }
      }
      if (changed) nr.setValues(nVals);
    }
  });

  // Backfill ID_Jurusan menjadi Kode kanonik di Master_Siswa_XI & Master_Kelas_Walas
  if (shSiswa && shSiswa.getLastRow() >= 2) {
    const sd = shSiswa.getDataRange().getValues();
    const shdr = sd[0];
    const cJur = findColumnIndex(shdr, ['idjurusan', 'jurusan']);
    if (cJur !== -1) {
      const out = [];
      let changed = false;
      for (let r = 1; r < sd.length; r++) {
        const curr = String(sd[r][cJur] || '').trim();
        const code = resolveJurCode(curr, jurNameToCode) || curr;
        if (code !== curr) changed = true;
        out.push([code]);
      }
      if (changed) shSiswa.getRange(2, cJur + 1, out.length, 1).setValues(out);
    }
  }

  if (shKelas && shKelas.getLastRow() >= 2) {
    const kd = shKelas.getDataRange().getValues();
    const kh = kd[0];
    const cIdJur = findColumnIndex(kh, ['idjurusan']);
    const cJur = findColumnIndex(kh, ['jurusan']);
    const cNamaKls = findColumnIndex(kh, ['namakelas']);
    if (cIdJur !== -1) {
      const out = [];
      let changed = false;
      for (let r = 1; r < kd.length; r++) {
        let code = String(kd[r][cIdJur] || '').trim();
        if (!code && cJur !== -1) code = resolveJurCode(kd[r][cJur], jurNameToCode);
        if (!code && cNamaKls !== -1) {
          const tokens = String(kd[r][cNamaKls] || '').trim().split(/\\s+/);
          for (let t = 0; t < tokens.length; t++) {
            const candidate = resolveJurCode(tokens[t], jurNameToCode);
            if (candidate) { code = candidate; break; }
          }
        }
        if (code !== String(kd[r][cIdJur] || '').trim()) changed = true;
        out.push([code]);
      }
      if (changed) shKelas.getRange(2, cIdJur + 1, out.length, 1).setValues(out);
    }
  }

  // Backfill Status_PKL pada Master_Siswa_XI bila kosong / Belum Daftar tapi ada Pengajuan / Plotting
  const statusByNis = {};
  if (shPengajuan && shPengajuan.getLastRow() >= 2) {
    const pq = shPengajuan.getDataRange().getValues();
    const pqh = pq[0];
    const cNis = findColumnIndex(pqh, ['nis']);
    const cSk = findColumnIndex(pqh, ['statuskakomli']);
    const cSh = findColumnIndex(pqh, ['statushubin']);
    const cIdGuru = findColumnIndex(pqh, ['idgurupendamping', 'idguru']);
    const cNmGuru = findColumnIndex(pqh, ['gurupendamping']);
    const cIdDudi = findColumnIndex(pqh, ['iddudi']);
    let pqChanged = false;
    for (let r = 1; r < pq.length; r++) {
      const n = normDigits(cNis !== -1 ? pq[r][cNis] : '');
      const sk = normText(cSk !== -1 ? pq[r][cSk] : '');
      const shStat = normText(cSh !== -1 ? pq[r][cSh] : '');
      if (n && sk !== 'ditolak' && shStat !== 'batal') {
        statusByNis[n] = 'Diajukan';
      }
      if (cIdGuru !== -1 && !String(pq[r][cIdGuru] || '').trim()) {
        const gNm = cNmGuru !== -1 ? String(pq[r][cNmGuru] || '').trim() : '';
        const dId = cIdDudi !== -1 ? String(pq[r][cIdDudi] || '').trim() : '';
        const foundG = (gNm && guruByName[normText(gNm)]) || (dId && dudiById[dId] && dudiById[dId].idGuru) || '';
        if (foundG) {
          pq[r][cIdGuru] = foundG;
          pqChanged = true;
        }
      }
    }
    if (pqChanged && cIdGuru !== -1) {
      shPengajuan.getRange(2, cIdGuru + 1, pq.length - 1, 1)
        .setValues(pq.slice(1).map(function(row) { return [row[cIdGuru]]; }));
    }
  }

  // Bangun peta Plotting_Pemberangkatan + backfill ID_DUDI / ID_Guru_Pendamping
  const pltById = {};
  const pltActiveByNis = {};
  if (shPlotting && shPlotting.getLastRow() >= 2) {
    const pd = shPlotting.getDataRange().getValues();
    const ph = pd[0];
    const cIdPlt = findColumnIndex(ph, ['idpenempatan', 'id']);
    const cNis = findColumnIndex(ph, ['nis']);
    const cIdDudi = findColumnIndex(ph, ['iddudi']);
    const cNmDudi = findColumnIndex(ph, ['namadudi', 'duditujuan']);
    const cIdGuru = findColumnIndex(ph, ['idgurupendamping', 'idguru']);
    const cNmGuru = findColumnIndex(ph, ['gurupendamping']);
    const cStatus = findColumnIndex(ph, ['statuspenempatan']);
    let dChanged = false;
    let gChanged = false;

    for (let r = 1; r < pd.length; r++) {
      const idPlt = cIdPlt !== -1 ? String(pd[r][cIdPlt] || '').trim() : '';
      const nis = normDigits(cNis !== -1 ? pd[r][cNis] : '');
      let dId = cIdDudi !== -1 ? String(pd[r][cIdDudi] || '').trim() : '';
      const dNm = cNmDudi !== -1 ? String(pd[r][cNmDudi] || '').trim() : '';
      let gId = cIdGuru !== -1 ? String(pd[r][cIdGuru] || '').trim() : '';
      const gNm = cNmGuru !== -1 ? String(pd[r][cNmGuru] || '').trim() : '';
      const stNorm = normText(cStatus !== -1 ? pd[r][cStatus] : '');

      if (!dId && dNm && dudiByName[normText(dNm)] && cIdDudi !== -1) {
        dId = dudiByName[normText(dNm)];
        pd[r][cIdDudi] = dId;
        dChanged = true;
      }
      if (!gId && gNm && guruByName[normText(gNm)] && cIdGuru !== -1) {
        gId = guruByName[normText(gNm)];
        pd[r][cIdGuru] = gId;
        gChanged = true;
      } else if (!gId && dId && dudiById[dId] && dudiById[dId].idGuru && cIdGuru !== -1) {
        gId = dudiById[dId].idGuru;
        pd[r][cIdGuru] = gId;
        gChanged = true;
      }
      if (idPlt) {
        pltById[idPlt] = { nis: nis, idDudi: dId, idGuru: gId };
      }
      if (nis && stNorm !== 'dibatalkan' && stNorm !== 'batal' && stNorm !== 'pindah dudi') {
        pltActiveByNis[nis] = { idPlt: idPlt, idDudi: dId, idGuru: gId };
        statusByNis[nis] = stNorm === 'selesai pkl' ? 'Selesai PKL' : 'Sedang PKL';
      }
    }
    if (dChanged && cIdDudi !== -1) {
      shPlotting.getRange(2, cIdDudi + 1, pd.length - 1, 1)
        .setValues(pd.slice(1).map(function(row) { return [row[cIdDudi]]; }));
    }
    if (gChanged && cIdGuru !== -1) {
      shPlotting.getRange(2, cIdGuru + 1, pd.length - 1, 1)
        .setValues(pd.slice(1).map(function(row) { return [row[cIdGuru]]; }));
    }
  }

  if (shSiswa && shSiswa.getLastRow() >= 2) {
    const sd2 = shSiswa.getDataRange().getValues();
    const sh2 = sd2[0];
    const cNis = findColumnIndex(sh2, ['nis']);
    const cStatus = findColumnIndex(sh2, ['statuspkl']);
    if (cNis !== -1 && cStatus !== -1) {
      let sChanged = false;
      for (let r = 1; r < sd2.length; r++) {
        const n = normDigits(sd2[r][cNis]);
        const currSt = normText(sd2[r][cStatus]);
        if (n && statusByNis[n] && (!currSt || currSt === 'belum daftar')) {
          sd2[r][cStatus] = statusByNis[n];
          sChanged = true;
        }
      }
      if (sChanged) {
        shSiswa.getRange(2, cStatus + 1, sd2.length - 1, 1)
          .setValues(sd2.slice(1).map(function(row) { return [row[cStatus]]; }));
      }
    }
  }

  // Backfill ID_DUDI di Data_Perizinan_PKL
  if (shPerizinan && shPerizinan.getLastRow() >= 2) {
    const zd = shPerizinan.getDataRange().getValues();
    const zh = zd[0];
    const cIdDudi = findColumnIndex(zh, ['iddudi']);
    const cDudiNm = findColumnIndex(zh, ['duditujuan', 'namadudi']);
    const cNis = findColumnIndex(zh, ['nis']);
    if (cIdDudi !== -1) {
      let zChanged = false;
      for (let r = 1; r < zd.length; r++) {
        if (!String(zd[r][cIdDudi] || '').trim()) {
          const nm = cDudiNm !== -1 ? String(zd[r][cDudiNm] || '').trim() : '';
          const n = cNis !== -1 ? normDigits(zd[r][cNis]) : '';
          const found = (nm && dudiByName[normText(nm)]) || (n && pltActiveByNis[n] && pltActiveByNis[n].idDudi) || '';
          if (found) {
            zd[r][cIdDudi] = found;
            zChanged = true;
          }
        }
      }
      if (zChanged) {
        shPerizinan.getRange(2, cIdDudi + 1, zd.length - 1, 1)
          .setValues(zd.slice(1).map(function(row) { return [row[cIdDudi]]; }));
      }
    }
  }

  // Backfill ID_DUDI & ID_Guru_Pendamping di Monitoring_5_Tahap
  const monGradedKeys = {};
  if (shMonitoring && shMonitoring.getLastRow() >= 2) {
    const md = shMonitoring.getDataRange().getValues();
    const mh = md[0];
    const cIdPlt = findColumnIndex(mh, ['idpenempatan']);
    const cNis = findColumnIndex(mh, ['nis']);
    const cIdDudi = findColumnIndex(mh, ['iddudi']);
    const cNmDudi = findColumnIndex(mh, ['duditujuan', 'namadudi']);
    const cIdGuru = findColumnIndex(mh, ['idgurupendamping', 'idguru']);
    const cNmGuru = findColumnIndex(mh, ['gurupendamping']);
    const cK3 = findColumnIndex(mh, ['nilaik3lh']);
    const cSs = findColumnIndex(mh, ['nilaisoftskills', 'nilaisoftskill']);
    const cHs = findColumnIndex(mh, ['nilaihardskills', 'nilaikompetensiteknis']);
    const cAb = findColumnIndex(mh, ['nilaialurbisnisduniakerja', 'nilaialurbisnis']);
    let mdChanged = false;
    let mgChanged = false;

    for (let r = 1; r < md.length; r++) {
      const idPlt = cIdPlt !== -1 ? String(md[r][cIdPlt] || '').trim() : '';
      const nis = cNis !== -1 ? normDigits(md[r][cNis]) : '';
      const pltRef = (idPlt && pltById[idPlt]) || (nis && pltActiveByNis[nis]) || null;

      if (cIdDudi !== -1 && !String(md[r][cIdDudi] || '').trim()) {
        const dNm = cNmDudi !== -1 ? String(md[r][cNmDudi] || '').trim() : '';
        const foundD = (dNm && dudiByName[normText(dNm)]) || (pltRef && pltRef.idDudi) || '';
        if (foundD) { md[r][cIdDudi] = foundD; mdChanged = true; }
      }
      if (cIdGuru !== -1 && !String(md[r][cIdGuru] || '').trim()) {
        const gNm = cNmGuru !== -1 ? String(md[r][cNmGuru] || '').trim() : '';
        const dIdCurr = cIdDudi !== -1 ? String(md[r][cIdDudi] || '').trim() : '';
        const foundG = (gNm && guruByName[normText(gNm)]) || (pltRef && pltRef.idGuru) || (dIdCurr && dudiById[dIdCurr] && dudiById[dIdCurr].idGuru) || '';
        if (foundG) { md[r][cIdGuru] = foundG; mgChanged = true; }
      }
      const sumScore =
        (cK3 !== -1 ? Number(md[r][cK3] || 0) : 0) +
        (cSs !== -1 ? Number(md[r][cSs] || 0) : 0) +
        (cHs !== -1 ? Number(md[r][cHs] || 0) : 0) +
        (cAb !== -1 ? Number(md[r][cAb] || 0) : 0);
      if (sumScore > 0) {
        if (idPlt) monGradedKeys['plt:' + idPlt] = true;
        if (nis) monGradedKeys['nis:' + nis] = true;
      }
    }
    if (mdChanged && cIdDudi !== -1) {
      shMonitoring.getRange(2, cIdDudi + 1, md.length - 1, 1)
        .setValues(md.slice(1).map(function(row) { return [row[cIdDudi]]; }));
    }
    if (mgChanged && cIdGuru !== -1) {
      shMonitoring.getRange(2, cIdGuru + 1, md.length - 1, 1)
        .setValues(md.slice(1).map(function(row) { return [row[cIdGuru]]; }));
    }
  }

  // 3. Migrasi Nilai Lama dari Nilai_Dan_Sertifikat ke Monitoring_5_Tahap (SSOT Nilai) + backfill ID_DUDI
  let migratedGradesCount = 0;
  if (shSertifikat && shSertifikat.getLastRow() >= 2) {
    const cd = shSertifikat.getDataRange().getValues();
    const ch = cd[0];
    const cIdPlt = findColumnIndex(ch, ['idpenempatan']);
    const cNis = findColumnIndex(ch, ['nis']);
    const cIdDudi = findColumnIndex(ch, ['iddudi']);
    const cNmDudi = findColumnIndex(ch, ['duditujuan', 'namadudi']);
    const cK3 = findColumnIndex(ch, ['nilaik3lh']);
    const cSs = findColumnIndex(ch, ['nilaisoftskills', 'nilaisoftskill']);
    const cHs = findColumnIndex(ch, ['nilaihardskills', 'nilaikompetensiteknis']);
    const cAb = findColumnIndex(ch, ['nilaialurbisnisduniakerja', 'nilaialurbisnis']);
    let cdChanged = false;

    const monHeaders = shMonitoring ? shMonitoring.getRange(1, 1, 1, shMonitoring.getLastColumn()).getValues()[0] : [];
    const monRowsToAppend = [];

    for (let r = 1; r < cd.length; r++) {
      const idPlt = cIdPlt !== -1 ? String(cd[r][cIdPlt] || '').trim() : '';
      const nis = cNis !== -1 ? normDigits(cd[r][cNis]) : '';
      const pltRef = (idPlt && pltById[idPlt]) || (nis && pltActiveByNis[nis]) || null;

      if (cIdDudi !== -1 && !String(cd[r][cIdDudi] || '').trim()) {
        const dNm = cNmDudi !== -1 ? String(cd[r][cNmDudi] || '').trim() : '';
        const foundD = (dNm && dudiByName[normText(dNm)]) || (pltRef && pltRef.idDudi) || '';
        if (foundD) { cd[r][cIdDudi] = foundD; cdChanged = true; }
      }

      const k3 = cK3 !== -1 ? Number(cd[r][cK3] || 0) : 0;
      const ssScore = cSs !== -1 ? Number(cd[r][cSs] || 0) : 0;
      const hs = cHs !== -1 ? Number(cd[r][cHs] || 0) : 0;
      const ab = cAb !== -1 ? Number(cd[r][cAb] || 0) : 0;
      const hasLegacyGrades = (k3 + ssScore + hs + ab) > 0;
      const alreadyInMon = (idPlt && monGradedKeys['plt:' + idPlt]) || (nis && monGradedKeys['nis:' + nis]);

      if (shMonitoring && hasLegacyGrades && !alreadyInMon) {
        const monObj = {
          ID_Monitoring: 'MON-MIG-' + (idPlt || nis || r),
          ID_Penempatan: idPlt || (pltRef ? pltRef.idPlt : ''),
          NIS: nis,
          ID_DUDI: (cIdDudi !== -1 ? String(cd[r][cIdDudi] || '').trim() : '') || (pltRef ? pltRef.idDudi : ''),
          ID_Guru_Pendamping: pltRef ? pltRef.idGuru : '',
          Tahap: '5. Monitoring 4',
          Tanggal_Kunjungan: Utilities.formatDate(new Date(), targetSs.getSpreadsheetTimeZone() || 'Asia/Jakarta', 'yyyy-MM-dd'),
          Nilai_PKL_Muncul: 'Ya',
          Nilai_K3LH: k3,
          Nilai_Softskills: ssScore,
          Nilai_Hardskills: hs,
          Nilai_Alur_Bisnis_Dunia_Kerja: ab,
          Catatan_Kunjungan: 'Migrasi otomatis nilai historis ke SSOT Monitoring_5_Tahap',
          Nilai_DUDI_Terkumpul: 'Ya',
          Status_Tahap: 'Tervalidasi Hubin'
        };
        monRowsToAppend.push(monHeaders.map(function(h) {
          const val = getNormalizedValue(monObj, h);
          return val !== undefined ? val : '';
        }));
        migratedGradesCount++;
      }
    }

    if (cdChanged && cIdDudi !== -1) {
      shSertifikat.getRange(2, cIdDudi + 1, cd.length - 1, 1)
        .setValues(cd.slice(1).map(function(row) { return [row[cIdDudi]]; }));
    }

    if (shMonitoring && monRowsToAppend.length > 0) {
      const mFlags = detectFormulaColFlags(shMonitoring, monHeaders.length);
      const startRow = getNextAppendRowNonFormula(shMonitoring, mFlags);
      writeNonFormulaMatrixSpans(shMonitoring, startRow, monRowsToAppend, mFlags);
      formatNisAndTextColumns(shMonitoring, monHeaders, startRow, monRowsToAppend.length);
    }
  }

  // Backfill ID_DUDI & ID_Guru_Pendamping di Log_Penerbitan_Surat (tanpa menghapus nama manual)
  if (shLogSurat && shLogSurat.getLastRow() >= 2) {
    const ld = shLogSurat.getDataRange().getValues();
    const lh = ld[0];
    const cIdDudi = findColumnIndex(lh, ['iddudi']);
    const cNmDudi = findColumnIndex(lh, ['namadudi', 'duditujuan']);
    const cIdGuru = findColumnIndex(lh, ['idgurupendamping', 'idguru']);
    const cNmGuru = findColumnIndex(lh, ['gurupendamping']);
    let ldChanged = false;
    let lgChanged = false;
    for (let r = 1; r < ld.length; r++) {
      let dIdCurr = cIdDudi !== -1 ? String(ld[r][cIdDudi] || '').trim() : '';
      const dNmCurr = cNmDudi !== -1 ? String(ld[r][cNmDudi] || '').trim() : '';
      if (!dIdCurr && dNmCurr && dudiByName[normText(dNmCurr)] && cIdDudi !== -1) {
        dIdCurr = dudiByName[normText(dNmCurr)];
        ld[r][cIdDudi] = dIdCurr;
        ldChanged = true;
      }
      if (cIdGuru !== -1 && !String(ld[r][cIdGuru] || '').trim()) {
        const gNmCurr = cNmGuru !== -1 ? String(ld[r][cNmGuru] || '').trim() : '';
        const gNk = normText(gNmCurr);
        const foundG =
          (gNk && guruNameCount[gNk] === 1 && guruByName[gNk]) ||
          (dIdCurr && dudiById[dIdCurr] && dudiById[dIdCurr].idGuru) ||
          '';
        if (foundG) {
          ld[r][cIdGuru] = foundG;
          lgChanged = true;
        }
      }
    }
    if (ldChanged && cIdDudi !== -1) {
      shLogSurat.getRange(2, cIdDudi + 1, ld.length - 1, 1)
        .setValues(ld.slice(1).map(function(row) { return [row[cIdDudi]]; }));
    }
    if (lgChanged && cIdGuru !== -1) {
      shLogSurat.getRange(2, cIdGuru + 1, ld.length - 1, 1)
        .setValues(ld.slice(1).map(function(row) { return [row[cIdGuru]]; }));
    }
  }

  // 4. Resolusi Huruf Kolom Aktual per Sheet (aman jika urutan kolom kustom)
  const getColLetter = function(sheet, candidatesNorm) {
    if (!sheet || sheet.getLastColumn() === 0) return '';
    const hdrs = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const idx = findColumnIndex(hdrs, candidatesNorm);
    return idx !== -1 ? colToLetterGas(idx) : '';
  };
  const ref = function(sheet, colLetter) {
    return "'" + sheet.getName() + "'!" + colLetter + "2:" + colLetter;
  };
  const sameRef = function(colLetter) {
    return colLetter + "2:" + colLetter;
  };

  // Bersihkan isi statis Baris 2..lastRow pada kolom target lalu tanam ARRAYFORMULA Baris-1
  const plantFormula = function(sheet, headerCandidates, headerLabel, formulaBody) {
    if (!sheet || !formulaBody) return false;
    const hdrs = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const idx = findColumnIndex(hdrs, headerCandidates);
    if (idx === -1) return false;
    const col1 = idx + 1;
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, col1, lastRow - 1, 1).clearContent();
    }
    const cell = sheet.getRange(1, col1);
    cell.setFormula('={"' + headerLabel + '"; ARRAYFORMULA(' + formulaBody + ')}');
    cell.setFontWeight('bold').setBackground('#0F172A').setFontColor('#FFFFFF');
    return true;
  };

  // Kumpulkan referensi kolom penting tiap sheet
  const sNis = getColLetter(shSiswa, ['nis']);
  const sNama = getColLetter(shSiswa, ['namalengkap', 'namasiswa', 'nama']);
  const sJur = getColLetter(shSiswa, ['idjurusan', 'jurusan']);
  const sKls = getColLetter(shSiswa, ['kelas']);
  const sOrtu = getColLetter(shSiswa, ['namaortuwali']);
  const sNoOrtu = getColLetter(shSiswa, ['noortuwali']);
  const sStatus = getColLetter(shSiswa, ['statuspkl']);

  const jKode = getColLetter(shJurusan, ['kode', 'kodejurusan', 'id']);
  const jNama = getColLetter(shJurusan, ['namajurusan', 'nama']);

  const dId = getColLetter(shDudi, ['id', 'iddudi']);
  const dNama = getColLetter(shDudi, ['namadudi', 'nama']);
  const dAlamat = getColLetter(shDudi, ['alamat']);
  const dIdGuru = getColLetter(shDudi, ['idgurupendamping', 'idguru']);
  const dGuru = getColLetter(shDudi, ['gurupendamping']);

  const gId = getColLetter(shGuru, ['id', 'idguru']);
  const gNama = getColLetter(shGuru, ['namalengkap', 'namaguru', 'nama']);

  const pId = getColLetter(shPlotting, ['idpenempatan', 'id']);
  const pNis = getColLetter(shPlotting, ['nis']);
  const pIdDudi = getColLetter(shPlotting, ['iddudi']);
  const pIdGuru = getColLetter(shPlotting, ['idgurupendamping', 'idguru']);
  const pStatus = getColLetter(shPlotting, ['statuspenempatan']);

  let plantedCount = 0;

  // Ekspresi lookup Nama Jurusan dari Kode
  const expandJurusanExpr = function(codeExpr) {
    if (shJurusan && jKode && jNama) {
      return 'IFERROR(VLOOKUP(UPPER(TRIM(TO_TEXT(' + codeExpr + '))), {UPPER(TRIM(TO_TEXT(' + ref(shJurusan, jKode) + '))), ' + ref(shJurusan, jNama) + '}, 2, FALSE), TRIM(TO_TEXT(' + codeExpr + ')))';
    }
    return 'TRIM(TO_TEXT(' + codeExpr + '))';
  };

  // --- A. Master_Jurusan: Kuota_Siswa & Total_Terdaftar ---
  if (shJurusan && shSiswa && jKode && jNama && sJur && sStatus) {
    const kExpr = 'IF(TRIM(TO_TEXT(' + sameRef(jKode) + '))="", , ' +
      'COUNTIF(' + ref(shSiswa, sJur) + ', TRIM(TO_TEXT(' + sameRef(jKode) + '))) + ' +
      'IF(LOWER(TRIM(TO_TEXT(' + sameRef(jNama) + ')))=LOWER(TRIM(TO_TEXT(' + sameRef(jKode) + '))), 0, COUNTIF(' + ref(shSiswa, sJur) + ', TRIM(TO_TEXT(' + sameRef(jNama) + ')))))';
    if (plantFormula(shJurusan, ['kuotasiswa', 'targetkuota'], 'Kuota_Siswa', kExpr)) plantedCount++;

    const tExpr = 'IF(TRIM(TO_TEXT(' + sameRef(jKode) + '))="", , ' +
      'COUNTIFS(' + ref(shSiswa, sJur) + ', TRIM(TO_TEXT(' + sameRef(jKode) + ')), ' + ref(shSiswa, sStatus) + ', "<>", ' + ref(shSiswa, sStatus) + ', "<>Belum Daftar") + ' +
      'IF(LOWER(TRIM(TO_TEXT(' + sameRef(jNama) + ')))=LOWER(TRIM(TO_TEXT(' + sameRef(jKode) + '))), 0, COUNTIFS(' + ref(shSiswa, sJur) + ', TRIM(TO_TEXT(' + sameRef(jNama) + ')), ' + ref(shSiswa, sStatus) + ', "<>", ' + ref(shSiswa, sStatus) + ', "<>Belum Daftar")))';
    if (plantFormula(shJurusan, ['totalterdaftar', 'siswaterdaftar'], 'Total_Terdaftar', tExpr)) plantedCount++;
  }

  // --- B. Master_Kelas_Walas: Jurusan & Jumlah_Siswa ---
  if (shKelas) {
    const kNama = getColLetter(shKelas, ['namakelas']);
    const kIdJur = getColLetter(shKelas, ['idjurusan']);
    if (kIdJur) {
      const jurExpr = 'IF(TRIM(TO_TEXT(' + sameRef(kIdJur) + '))="", , ' + expandJurusanExpr(sameRef(kIdJur)) + ')';
      if (plantFormula(shKelas, ['jurusan'], 'Jurusan', jurExpr)) plantedCount++;
    }
    if (kNama && shSiswa && sKls) {
      const jmlExpr = 'IF(TRIM(TO_TEXT(' + sameRef(kNama) + '))="", , COUNTIF(' + ref(shSiswa, sKls) + ', TRIM(TO_TEXT(' + sameRef(kNama) + '))))';
      if (plantFormula(shKelas, ['jumlahsiswa'], 'Jumlah_Siswa', jmlExpr)) plantedCount++;
    }
  }

  // --- C. Master_DUDI: Guru_Pendamping & Terisi ---
  if (shDudi) {
    if (dIdGuru && shGuru && gId && gNama) {
      const dgExpr = 'IF(TRIM(TO_TEXT(' + sameRef(dIdGuru) + '))="", , IFERROR(VLOOKUP(TRIM(TO_TEXT(' + sameRef(dIdGuru) + ')), {TRIM(TO_TEXT(' + ref(shGuru, gId) + ')), ' + ref(shGuru, gNama) + '}, 2, FALSE), ""))';
      if (plantFormula(shDudi, ['gurupendamping'], 'Guru_Pendamping', dgExpr)) plantedCount++;
    }
    if (dId && shPlotting && pIdDudi && pStatus) {
      const terisiExpr = 'IF(TRIM(TO_TEXT(' + sameRef(dId) + '))="", , COUNTIFS(' + ref(shPlotting, pIdDudi) + ', TRIM(TO_TEXT(' + sameRef(dId) + ')), ' + ref(shPlotting, pStatus) + ', "<>Dibatalkan", ' + ref(shPlotting, pStatus) + ', "<>Batal", ' + ref(shPlotting, pStatus) + ', "<>Pindah DUDI", ' + ref(shPlotting, pStatus) + ', "<>Selesai PKL"))';
      if (plantFormula(shDudi, ['terisi'], 'Terisi', terisiExpr)) plantedCount++;
    }
  }

  // --- D. Master_Guru_Pendamping: Jumlah_Bimbingan ---
  if (shGuru && gId && shPlotting && pIdGuru && pStatus) {
    const gbExpr = 'IF(TRIM(TO_TEXT(' + sameRef(gId) + '))="", , COUNTIFS(' + ref(shPlotting, pIdGuru) + ', TRIM(TO_TEXT(' + sameRef(gId) + ')), ' + ref(shPlotting, pStatus) + ', "<>Dibatalkan", ' + ref(shPlotting, pStatus) + ', "<>Batal", ' + ref(shPlotting, pStatus) + ', "<>Pindah DUDI", ' + ref(shPlotting, pStatus) + ', "<>Selesai PKL"))';
    if (plantFormula(shGuru, ['jumlahbimbingan'], 'Jumlah_Bimbingan', gbExpr)) plantedCount++;
  }

  // --- E. Data_Pengajuan_PKL ---
  const qNo = getColLetter(shPengajuan, ['nopengajuan', 'id']);
  const qDudi = getColLetter(shPengajuan, ['duditujuan', 'namadudi']);
  const qAlamat = getColLetter(shPengajuan, ['alamatdudi', 'alamat']);
  if (shPengajuan && shSiswa && sNis) {
    const qNis = getColLetter(shPengajuan, ['nis']);
    const qIdDudi = getColLetter(shPengajuan, ['iddudi']);
    const qIdGuru = getColLetter(shPengajuan, ['idgurupendamping', 'idguru']);
    if (qNis && sNama) {
      if (plantFormula(shPengajuan, ['namasiswa'], 'Nama_Siswa', 'IF(TRIM(TO_TEXT(' + sameRef(qNis) + '))="", , IFERROR(VLOOKUP(TRIM(TO_TEXT(' + sameRef(qNis) + ')), {TRIM(TO_TEXT(' + ref(shSiswa, sNis) + ')), ' + ref(shSiswa, sNama) + '}, 2, FALSE), ""))')) plantedCount++;
    }
    if (qNis && sJur) {
      const codeLookup = 'VLOOKUP(TRIM(TO_TEXT(' + sameRef(qNis) + ')), {TRIM(TO_TEXT(' + ref(shSiswa, sNis) + ')), ' + ref(shSiswa, sJur) + '}, 2, FALSE)';
      if (plantFormula(shPengajuan, ['jurusan'], 'Jurusan', 'IF(TRIM(TO_TEXT(' + sameRef(qNis) + '))="", , IFERROR(' + expandJurusanExpr(codeLookup) + ', ""))')) plantedCount++;
    }
    if (qNis && sKls) {
      if (plantFormula(shPengajuan, ['kelas'], 'Kelas', 'IF(TRIM(TO_TEXT(' + sameRef(qNis) + '))="", , IFERROR(VLOOKUP(TRIM(TO_TEXT(' + sameRef(qNis) + ')), {TRIM(TO_TEXT(' + ref(shSiswa, sNis) + ')), ' + ref(shSiswa, sKls) + '}, 2, FALSE), ""))')) plantedCount++;
    }
    if (qNis && sOrtu) {
      if (plantFormula(shPengajuan, ['namaortuwali'], 'Nama_Ortu_Wali', 'IF(TRIM(TO_TEXT(' + sameRef(qNis) + '))="", , IFERROR(VLOOKUP(TRIM(TO_TEXT(' + sameRef(qNis) + ')), {TRIM(TO_TEXT(' + ref(shSiswa, sNis) + ')), ' + ref(shSiswa, sOrtu) + '}, 2, FALSE), ""))')) plantedCount++;
    }
    if (qNis && sNoOrtu) {
      if (plantFormula(shPengajuan, ['noortuwali'], 'No_Ortu_Wali', 'IF(TRIM(TO_TEXT(' + sameRef(qNis) + '))="", , IFERROR(VLOOKUP(TRIM(TO_TEXT(' + sameRef(qNis) + ')), {TRIM(TO_TEXT(' + ref(shSiswa, sNis) + ')), ' + ref(shSiswa, sNoOrtu) + '}, 2, FALSE), ""))')) plantedCount++;
    }
    if (qIdGuru && shGuru && gId && gNama) {
      const dudiGuruFallback = (qIdDudi && shDudi && dId && dGuru)
        ? 'IFERROR(VLOOKUP(TRIM(TO_TEXT(' + sameRef(qIdDudi) + ')), {TRIM(TO_TEXT(' + ref(shDudi, dId) + ')), ' + ref(shDudi, dGuru) + '}, 2, FALSE), "")'
        : '""';
      const keyGuard = qNo || qNis;
      const qGuruExpr = 'IF(TRIM(TO_TEXT(' + sameRef(keyGuard) + '))="", , IF(TRIM(TO_TEXT(' + sameRef(qIdGuru) + '))<>"", IFERROR(VLOOKUP(TRIM(TO_TEXT(' + sameRef(qIdGuru) + ')), {TRIM(TO_TEXT(' + ref(shGuru, gId) + ')), ' + ref(shGuru, gNama) + '}, 2, FALSE), ""), ' + dudiGuruFallback + '))';
      if (plantFormula(shPengajuan, ['gurupendamping'], 'Guru_Pendamping', qGuruExpr)) plantedCount++;
    }
  }

  // --- F. Data_Perizinan_PKL ---
  if (shPerizinan) {
    const zId = getColLetter(shPerizinan, ['idperizinan', 'noperizinan', 'id']);
    const zNoReq = getColLetter(shPerizinan, ['nopengajuan']);
    const zNis = getColLetter(shPerizinan, ['nis']);
    const zMulai = getColLetter(shPerizinan, ['tglmulaiizin', 'tanggalmulaiizin']);
    const zSelesai = getColLetter(shPerizinan, ['tglselesaiizin', 'tanggalselesaiizin']);
    const zIdDudi = getColLetter(shPerizinan, ['iddudi']);

    if (zNis && shSiswa && sNis) {
      if (sNama && plantFormula(shPerizinan, ['namasiswa'], 'Nama_Siswa', 'IF(TRIM(TO_TEXT(' + sameRef(zNis) + '))="", , IFERROR(VLOOKUP(TRIM(TO_TEXT(' + sameRef(zNis) + ')), {TRIM(TO_TEXT(' + ref(shSiswa, sNis) + ')), ' + ref(shSiswa, sNama) + '}, 2, FALSE), ""))')) plantedCount++;
      if (sJur && plantFormula(shPerizinan, ['jurusan'], 'Jurusan', 'IF(TRIM(TO_TEXT(' + sameRef(zNis) + '))="", , IFERROR(' + expandJurusanExpr('VLOOKUP(TRIM(TO_TEXT(' + sameRef(zNis) + ')), {TRIM(TO_TEXT(' + ref(shSiswa, sNis) + ')), ' + ref(shSiswa, sJur) + '}, 2, FALSE)') + ', ""))')) plantedCount++;
      if (sKls && plantFormula(shPerizinan, ['kelas'], 'Kelas', 'IF(TRIM(TO_TEXT(' + sameRef(zNis) + '))="", , IFERROR(VLOOKUP(TRIM(TO_TEXT(' + sameRef(zNis) + ')), {TRIM(TO_TEXT(' + ref(shSiswa, sNis) + ')), ' + ref(shSiswa, sKls) + '}, 2, FALSE), ""))')) plantedCount++;
      if (sOrtu && plantFormula(shPerizinan, ['namaortuwali'], 'Nama_Ortu_Wali', 'IF(TRIM(TO_TEXT(' + sameRef(zNis) + '))="", , IFERROR(VLOOKUP(TRIM(TO_TEXT(' + sameRef(zNis) + ')), {TRIM(TO_TEXT(' + ref(shSiswa, sNis) + ')), ' + ref(shSiswa, sOrtu) + '}, 2, FALSE), ""))')) plantedCount++;
      if (sNoOrtu && plantFormula(shPerizinan, ['noortuwali'], 'No_Ortu_Wali', 'IF(TRIM(TO_TEXT(' + sameRef(zNis) + '))="", , IFERROR(VLOOKUP(TRIM(TO_TEXT(' + sameRef(zNis) + ')), {TRIM(TO_TEXT(' + ref(shSiswa, sNis) + ')), ' + ref(shSiswa, sNoOrtu) + '}, 2, FALSE), ""))')) plantedCount++;
    }
    if (zMulai && zSelesai) {
      const mDate = 'IF(ISNUMBER(' + sameRef(zMulai) + '), ' + sameRef(zMulai) + ', DATEVALUE(' + sameRef(zMulai) + '))';
      const sDate = 'IF(ISNUMBER(' + sameRef(zSelesai) + '), ' + sameRef(zSelesai) + ', DATEVALUE(' + sameRef(zSelesai) + '))';
      const rentangExpr = 'IF(TRIM(TO_TEXT(' + sameRef(zMulai) + '))="", , IFERROR(TEXT(' + mDate + ', "dd/mm/yyyy") & IF(TRIM(TO_TEXT(' + sameRef(zSelesai) + '))="", " (1 hari)", " s/d " & TEXT(' + sDate + ', "dd/mm/yyyy") & " (" & (VALUE(' + sDate + ') - VALUE(' + mDate + ') + 1) & " hari)"), TRIM(TO_TEXT(' + sameRef(zMulai) + '))))';
      if (plantFormula(shPerizinan, ['rentangtanggal'], 'Rentang_Tanggal', rentangExpr)) plantedCount++;
    }
    if (zIdDudi && shDudi && dId && dNama) {
      const keyGuard = zId || zNis;
      const reqFallbackNm = (zNoReq && shPengajuan && qNo && qDudi)
        ? 'IFERROR(VLOOKUP(TRIM(TO_TEXT(' + sameRef(zNoReq) + ')), {TRIM(TO_TEXT(' + ref(shPengajuan, qNo) + ')), ' + ref(shPengajuan, qDudi) + '}, 2, FALSE), "")'
        : '""';
      const zDudiExpr = 'IF(TRIM(TO_TEXT(' + sameRef(keyGuard) + '))="", , IF(TRIM(TO_TEXT(' + sameRef(zIdDudi) + '))<>"", IFERROR(VLOOKUP(TRIM(TO_TEXT(' + sameRef(zIdDudi) + ')), {TRIM(TO_TEXT(' + ref(shDudi, dId) + ')), ' + ref(shDudi, dNama) + '}, 2, FALSE), ' + reqFallbackNm + '), ' + reqFallbackNm + '))';
      if (plantFormula(shPerizinan, ['duditujuan'], 'DUDI_Tujuan', zDudiExpr)) plantedCount++;

      if (dAlamat) {
        const reqFallbackAl = (zNoReq && shPengajuan && qNo && qAlamat)
          ? 'IFERROR(VLOOKUP(TRIM(TO_TEXT(' + sameRef(zNoReq) + ')), {TRIM(TO_TEXT(' + ref(shPengajuan, qNo) + ')), ' + ref(shPengajuan, qAlamat) + '}, 2, FALSE), "")'
          : '""';
        const zAlExpr = 'IF(TRIM(TO_TEXT(' + sameRef(keyGuard) + '))="", , IF(TRIM(TO_TEXT(' + sameRef(zIdDudi) + '))<>"", IFERROR(VLOOKUP(TRIM(TO_TEXT(' + sameRef(zIdDudi) + ')), {TRIM(TO_TEXT(' + ref(shDudi, dId) + ')), ' + ref(shDudi, dAlamat) + '}, 2, FALSE), ' + reqFallbackAl + '), ' + reqFallbackAl + '))';
        if (plantFormula(shPerizinan, ['alamatdudi'], 'Alamat_DUDI', zAlExpr)) plantedCount++;
      }
    }
  }

  // --- G. Plotting_Pemberangkatan ---
  if (shPlotting) {
    if (pNis && shSiswa && sNis && sNama) {
      if (plantFormula(shPlotting, ['namasiswa'], 'Nama_Siswa', 'IF(TRIM(TO_TEXT(' + sameRef(pNis) + '))="", , IFERROR(VLOOKUP(TRIM(TO_TEXT(' + sameRef(pNis) + ')), {TRIM(TO_TEXT(' + ref(shSiswa, sNis) + ')), ' + ref(shSiswa, sNama) + '}, 2, FALSE), ""))')) plantedCount++;
    }
    if (pIdDudi && shDudi && dId && dNama) {
      if (plantFormula(shPlotting, ['namadudi'], 'Nama_DUDI', 'IF(TRIM(TO_TEXT(' + sameRef(pIdDudi) + '))="", , IFERROR(VLOOKUP(TRIM(TO_TEXT(' + sameRef(pIdDudi) + ')), {TRIM(TO_TEXT(' + ref(shDudi, dId) + ')), ' + ref(shDudi, dNama) + '}, 2, FALSE), ""))')) plantedCount++;
    }
    if (pIdGuru && shGuru && gId && gNama) {
      if (plantFormula(shPlotting, ['gurupendamping'], 'Guru_Pendamping', 'IF(TRIM(TO_TEXT(' + sameRef(pIdGuru) + '))="", , IFERROR(VLOOKUP(TRIM(TO_TEXT(' + sameRef(pIdGuru) + ')), {TRIM(TO_TEXT(' + ref(shGuru, gId) + ')), ' + ref(shGuru, gNama) + '}, 2, FALSE), ""))')) plantedCount++;
    }
  }

  // --- H. Monitoring_5_Tahap (Single SSOT Nilai PKL) ---
  const mId = getColLetter(shMonitoring, ['idmonitoring', 'id']);
  const mIdPlt = getColLetter(shMonitoring, ['idpenempatan']);
  const mNis = getColLetter(shMonitoring, ['nis']);
  const mIdDudi = getColLetter(shMonitoring, ['iddudi']);
  const mIdGuru = getColLetter(shMonitoring, ['idgurupendamping', 'idguru']);
  const mK3 = getColLetter(shMonitoring, ['nilaik3lh']);
  const mSs = getColLetter(shMonitoring, ['nilaisoftskills', 'nilaisoftskill']);
  const mHs = getColLetter(shMonitoring, ['nilaihardskills', 'nilaikompetensiteknis']);
  const mAb = getColLetter(shMonitoring, ['nilaialurbisnisduniakerja', 'nilaialurbisnis']);

  if (shMonitoring) {
    const mGuard = mId || mIdPlt || mNis;
    if (mNis && shSiswa && sNis) {
      if (sNama && plantFormula(shMonitoring, ['namasiswa'], 'Nama_Siswa', 'IF(TRIM(TO_TEXT(' + sameRef(mNis) + '))="", , IFERROR(VLOOKUP(TRIM(TO_TEXT(' + sameRef(mNis) + ')), {TRIM(TO_TEXT(' + ref(shSiswa, sNis) + ')), ' + ref(shSiswa, sNama) + '}, 2, FALSE), ""))')) plantedCount++;
      if (sJur && plantFormula(shMonitoring, ['jurusan'], 'Jurusan', 'IF(TRIM(TO_TEXT(' + sameRef(mNis) + '))="", , IFERROR(' + expandJurusanExpr('VLOOKUP(TRIM(TO_TEXT(' + sameRef(mNis) + ')), {TRIM(TO_TEXT(' + ref(shSiswa, sNis) + ')), ' + ref(shSiswa, sJur) + '}, 2, FALSE)') + ', ""))')) plantedCount++;
    }
    if (mIdDudi && shDudi && dId) {
      const mEffDudiId = (mIdPlt && shPlotting && pId && pIdDudi)
        ? 'IF(TRIM(TO_TEXT(' + sameRef(mIdDudi) + '))<>"", TRIM(TO_TEXT(' + sameRef(mIdDudi) + ')), IFERROR(VLOOKUP(TRIM(TO_TEXT(' + sameRef(mIdPlt) + ')), {TRIM(TO_TEXT(' + ref(shPlotting, pId) + ')), ' + ref(shPlotting, pIdDudi) + '}, 2, FALSE), ""))'
        : 'TRIM(TO_TEXT(' + sameRef(mIdDudi) + '))';
      if (dNama && plantFormula(shMonitoring, ['duditujuan'], 'DUDI_Tujuan', 'IF(TRIM(TO_TEXT(' + sameRef(mGuard) + '))="", , IFERROR(VLOOKUP(' + mEffDudiId + ', {TRIM(TO_TEXT(' + ref(shDudi, dId) + ')), ' + ref(shDudi, dNama) + '}, 2, FALSE), ""))')) plantedCount++;
      if (dAlamat && plantFormula(shMonitoring, ['alamatdudi'], 'Alamat_DUDI', 'IF(TRIM(TO_TEXT(' + sameRef(mGuard) + '))="", , IFERROR(VLOOKUP(' + mEffDudiId + ', {TRIM(TO_TEXT(' + ref(shDudi, dId) + ')), ' + ref(shDudi, dAlamat) + '}, 2, FALSE), ""))')) plantedCount++;
    }
    if (mIdGuru && shGuru && gId && gNama) {
      const mEffGuruId = (mIdPlt && shPlotting && pId && pIdGuru)
        ? 'IF(TRIM(TO_TEXT(' + sameRef(mIdGuru) + '))<>"", TRIM(TO_TEXT(' + sameRef(mIdGuru) + ')), IFERROR(VLOOKUP(TRIM(TO_TEXT(' + sameRef(mIdPlt) + ')), {TRIM(TO_TEXT(' + ref(shPlotting, pId) + ')), ' + ref(shPlotting, pIdGuru) + '}, 2, FALSE), ""))'
        : 'TRIM(TO_TEXT(' + sameRef(mIdGuru) + '))';
      if (plantFormula(shMonitoring, ['gurupendamping'], 'Guru_Pendamping', 'IF(TRIM(TO_TEXT(' + sameRef(mGuard) + '))="", , IFERROR(VLOOKUP(' + mEffGuruId + ', {TRIM(TO_TEXT(' + ref(shGuru, gId) + ')), ' + ref(shGuru, gNama) + '}, 2, FALSE), ""))')) plantedCount++;
    }
    if (mK3 && mSs && mHs && mAb) {
      const mSum = '(N(' + sameRef(mK3) + ')+N(' + sameRef(mSs) + ')+N(' + sameRef(mHs) + ')+N(' + sameRef(mAb) + '))';
      const mAvgExpr = 'IF(TRIM(TO_TEXT(' + sameRef(mGuard) + '))="", , IF(' + mSum + '>0, ROUND(' + mSum + '/4, 1), ))';
      if (plantFormula(shMonitoring, ['nilairatarata', 'nilaidudi', 'nilaiakhir'], 'Nilai_rata_rata', mAvgExpr)) plantedCount++;
    }
  }

  // --- I. Nilai_Dan_Sertifikat (Read-Only Nilai & Display dari Monitoring_5_Tahap & Master) ---
  if (shSertifikat) {
    const cIdPlt = getColLetter(shSertifikat, ['idpenempatan']);
    const cNis = getColLetter(shSertifikat, ['nis']);
    const cIdDudi = getColLetter(shSertifikat, ['iddudi']);
    const cK3 = getColLetter(shSertifikat, ['nilaik3lh']);
    const cSs = getColLetter(shSertifikat, ['nilaisoftskills', 'nilaisoftskill']);
    const cHs = getColLetter(shSertifikat, ['nilaihardskills', 'nilaikompetensiteknis']);
    const cAb = getColLetter(shSertifikat, ['nilaialurbisnisduniakerja', 'nilaialurbisnis']);
    const cAvg = getColLetter(shSertifikat, ['nilairatarata', 'nilaidudi', 'nilaiakhir']);
    const cKeyGuard = (cIdPlt && cNis)
      ? 'TRIM(TO_TEXT(' + sameRef(cIdPlt) + ')&TO_TEXT(' + sameRef(cNis) + '))'
      : 'TRIM(TO_TEXT(' + sameRef(cNis || cIdPlt) + '))';

    if (cNis && shSiswa && sNis) {
      if (sNama && plantFormula(shSertifikat, ['namasiswa'], 'Nama_Siswa', 'IF(TRIM(TO_TEXT(' + sameRef(cNis) + '))="", , IFERROR(VLOOKUP(TRIM(TO_TEXT(' + sameRef(cNis) + ')), {TRIM(TO_TEXT(' + ref(shSiswa, sNis) + ')), ' + ref(shSiswa, sNama) + '}, 2, FALSE), ""))')) plantedCount++;
      if (sJur && plantFormula(shSertifikat, ['jurusan'], 'Jurusan', 'IF(TRIM(TO_TEXT(' + sameRef(cNis) + '))="", , IFERROR(' + expandJurusanExpr('VLOOKUP(TRIM(TO_TEXT(' + sameRef(cNis) + ')), {TRIM(TO_TEXT(' + ref(shSiswa, sNis) + ')), ' + ref(shSiswa, sJur) + '}, 2, FALSE)') + ', ""))')) plantedCount++;
      if (sKls && plantFormula(shSertifikat, ['kelas'], 'Kelas', 'IF(TRIM(TO_TEXT(' + sameRef(cNis) + '))="", , IFERROR(VLOOKUP(TRIM(TO_TEXT(' + sameRef(cNis) + ')), {TRIM(TO_TEXT(' + ref(shSiswa, sNis) + ')), ' + ref(shSiswa, sKls) + '}, 2, FALSE), ""))')) plantedCount++;
    }
    if (cIdDudi && shDudi && dId && dNama) {
      const cEffDudiId = (cIdPlt && shPlotting && pId && pIdDudi)
        ? 'IF(TRIM(TO_TEXT(' + sameRef(cIdDudi) + '))<>"", TRIM(TO_TEXT(' + sameRef(cIdDudi) + ')), IFERROR(VLOOKUP(TRIM(TO_TEXT(' + sameRef(cIdPlt) + ')), {TRIM(TO_TEXT(' + ref(shPlotting, pId) + ')), ' + ref(shPlotting, pIdDudi) + '}, 2, FALSE), ""))'
        : 'TRIM(TO_TEXT(' + sameRef(cIdDudi) + '))';
      if (plantFormula(shSertifikat, ['duditujuan'], 'DUDI_Tujuan', 'IF(' + cKeyGuard + '="", , IFERROR(VLOOKUP(' + cEffDudiId + ', {TRIM(TO_TEXT(' + ref(shDudi, dId) + ')), ' + ref(shDudi, dNama) + '}, 2, FALSE), ""))')) plantedCount++;
    }

    if (shMonitoring && mK3 && mSs && mHs && mAb) {
      const mHasGrade = '(N(' + ref(shMonitoring, mK3) + ')+N(' + ref(shMonitoring, mSs) + ')+N(' + ref(shMonitoring, mHs) + ')+N(' + ref(shMonitoring, mAb) + '))>0';
      const mWeight = '((' + mHasGrade + ')*1000000+ROW(' + ref(shMonitoring, mK3) + '))';

      const buildScoreLookupExpr = function(mScoreCol) {
        const valCol = 'IF(' + mHasGrade + ', N(' + ref(shMonitoring, mScoreCol) + '), "")';
        const byPlt = (cIdPlt && mIdPlt)
          ? 'IFERROR(VLOOKUP(TRIM(TO_TEXT(' + sameRef(cIdPlt) + ')), SORT({TRIM(TO_TEXT(' + ref(shMonitoring, mIdPlt) + ')), ' + mWeight + ', ' + valCol + '}, 2, FALSE), 3, FALSE), "")'
          : '""';
        const byNis = (cNis && mNis)
          ? 'IFERROR(VLOOKUP(TRIM(TO_TEXT(' + sameRef(cNis) + ')), SORT({TRIM(TO_TEXT(' + ref(shMonitoring, mNis) + ')), ' + mWeight + ', ' + valCol + '}, 2, FALSE), 3, FALSE), "")'
          : '""';
        return 'IF(' + cKeyGuard + '="", , IF(' + byPlt + '<>"", ' + byPlt + ', ' + byNis + '))';
      };

      if (cK3 && plantFormula(shSertifikat, ['nilaik3lh'], 'Nilai_K3LH', buildScoreLookupExpr(mK3))) plantedCount++;
      if (cSs && plantFormula(shSertifikat, ['nilaisoftskills', 'nilaisoftskill'], 'Nilai_Softskills', buildScoreLookupExpr(mSs))) plantedCount++;
      if (cHs && plantFormula(shSertifikat, ['nilaihardskills', 'nilaikompetensiteknis'], 'Nilai_Hardskills', buildScoreLookupExpr(mHs))) plantedCount++;
      if (cAb && plantFormula(shSertifikat, ['nilaialurbisnisduniakerja', 'nilaialurbisnis'], 'Nilai_Alur_Bisnis_Dunia_Kerja', buildScoreLookupExpr(mAb))) plantedCount++;
    }

    if (cK3 && cSs && cHs && cAb) {
      const cSum = '(N(' + sameRef(cK3) + ')+N(' + sameRef(cSs) + ')+N(' + sameRef(cHs) + ')+N(' + sameRef(cAb) + '))';
      const cAvgExpr = 'IF(' + cKeyGuard + '="", , IF(' + cSum + '>0, ROUND(' + cSum + '/4, 1), ))';
      if (plantFormula(shSertifikat, ['nilairatarata', 'nilaidudi', 'nilaiakhir'], 'Nilai_rata_rata', cAvgExpr)) plantedCount++;
    }
    if (cAvg) {
      const predExpr = 'IF(' + cKeyGuard + '="", , IF(N(' + sameRef(cAvg) + ')=0, , IF(N(' + sameRef(cAvg) + ')>=88, "Sangat Baik (A)", IF(N(' + sameRef(cAvg) + ')>=78, "Baik (B)", IF(N(' + sameRef(cAvg) + ')>=68, "Cukup (C)", "Kurang (D)")))))';
      if (plantFormula(shSertifikat, ['predikat'], 'Predikat', predExpr)) plantedCount++;
    }
  }

  SpreadsheetApp.flush();
  bumpGasSheetCacheVersion(targetSs.getId());
  return {
    plantedFormulas: plantedCount,
    migratedLegacyGrades: migratedGradesCount
  };
}

function doPost(e) {
  let scriptLock = null;
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(body.action || '').toUpperCase();
    const sheetName = body.sheetName;
    const spreadsheetId = String(body.spreadsheetId || '').trim();

    const lockRequired =
      action !== 'GENERATE_SURAT_IZIN_PDF' && action !== 'GENERATE_MONITORING_BUNDLE_PDF';
    if (lockRequired) {
      scriptLock = LockService.getScriptLock();
      scriptLock.waitLock(15000);
    }

    if (action === 'CREATE_YEARLY_SPREADSHEET') {
      const year = String(body.year || '2026/2027').trim();
      const cleanYear = year.replace(/\\//g, '_');
      const customTitle = String(body.spreadsheetTitle || '').trim();
      const targetSsId = String(body.targetSpreadsheetId || '').trim();
      const driveUrl = String(body.driveFolderUrl || '').trim();
      const seedSheets = (body.seedSheets && typeof body.seedSheets === 'object') ? body.seedSheets : {};

      let yearFolder = null;
      const folderMatch = driveUrl.match(/\\/folders\\/([a-zA-Z0-9_-]+)/);
      if (folderMatch && folderMatch[1]) {
        try {
          yearFolder = DriveApp.getFolderById(folderMatch[1]);
        } catch (errFolder) {
          yearFolder = null;
        }
      }
      if (!yearFolder) {
        const rootName = 'Arsip Hubin SMK PGRI 2 Ponorogo';
        const rootIt = DriveApp.getFoldersByName(rootName);
        const hubinFolder = rootIt.hasNext() ? rootIt.next() : DriveApp.createFolder(rootName);
        const yearFolderName = 'Prakerin TA ' + year;
        const yearIt = hubinFolder.getFoldersByName(yearFolderName);
        yearFolder = yearIt.hasNext() ? yearIt.next() : hubinFolder.createFolder(yearFolderName);
      }

      const ssTitle = customTitle || ('Hubin_SMK_PGRI_2_Ponorogo_' + cleanYear);
      const newSs = targetSsId ? SpreadsheetApp.openById(targetSsId) : SpreadsheetApp.create(ssTitle);
      if (!targetSsId) {
        try {
          const ssFile = DriveApp.getFileById(newSs.getId());
          yearFolder.addFile(ssFile);
          DriveApp.getRootFolder().removeFile(ssFile);
        } catch (moveErr) {}
      }

      const reqNames = Object.keys(REQUIRED_SHEET_HEADERS);
      reqNames.forEach(function(name, idx) {
        const hdrs = REQUIRED_SHEET_HEADERS[name] || [];
        let sh = newSs.getSheetByName(name);
        if (!sh) {
          sh = (idx === 0 && !targetSsId && newSs.getSheets().length === 1)
            ? newSs.getSheets()[0]
            : newSs.insertSheet(name);
          sh.setName(name);
        }
        if (sh.getLastRow() === 0 && hdrs.length > 0) {
          sh.appendRow(hdrs);
          sh.getRange(1, 1, 1, hdrs.length)
            .setFontWeight('bold')
            .setBackground('#0F172A')
            .setFontColor('#FFFFFF');
          sh.setFrozenRows(1);
        } else if (hdrs.length > 0) {
          ensureMissingHeaders(sh, name);
        }
      });

      const seededCounts = {};
      Object.keys(seedSheets).forEach(function(sName) {
        const rows = Array.isArray(seedSheets[sName]) ? seedSheets[sName] : [];
        if (rows.length === 0) return;
        const sh = resolveSheetAlias(newSs, sName);
        if (!sh) return;
        const hdrs = ensureMissingHeaders(sh, sName);
        const fCols = detectFormulaColFlags(sh, hdrs.length);
        const startRow = getNextAppendRowNonFormula(sh, fCols);
        const matrix = rows.map(function(item) {
          return hdrs.map(function(h) {
            const val = getNormalizedValue(item, h);
            return val !== undefined ? val : '';
          });
        });
        formatNisAndTextColumns(sh, hdrs, startRow, matrix.length);
        writeNonFormulaMatrixSpans(sh, startRow, matrix, fCols);
        seededCounts[sName] = matrix.length;
      });

      const formulaRes = applyRelationalFormulasToSpreadsheet(newSs);
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        spreadsheetId: newSs.getId(),
        spreadsheetName: newSs.getName(),
        spreadsheetUrl: newSs.getUrl(),
        driveFolderUrl: yearFolder ? yearFolder.getUrl() : driveUrl,
        seededCounts: seededCounts,
        plantedFormulas: formulaRes.plantedFormulas,
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const ss = spreadsheetId ? SpreadsheetApp.openById(spreadsheetId) : SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      throw new Error('Spreadsheet tidak ditemukan.');
    }

    if (action === 'MIGRATE_RELATIONAL_FORMULAS') {
      const result = applyRelationalFormulasToSpreadsheet(ss);
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: 'Migrasi FK & ' + result.plantedFormulas + ' ARRAYFORMULA relasional berhasil diterapkan (nilai historis termigrasi: ' + result.migratedLegacyGrades + ').',
        details: result
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'GENERATE_SURAT_IZIN_PDF') {
      const p = body.data || {};
      let targetRoot = null;
      const driveUrl = String(body.driveFolderUrl || '').trim();
      const folderMatch = driveUrl.match(/\\/folders\\/([a-zA-Z0-9_-]+)/);
      if (folderMatch && folderMatch[1]) {
        try {
          targetRoot = DriveApp.getFolderById(folderMatch[1]);
        } catch (folderErr) {
          targetRoot = null;
        }
      }
      if (!targetRoot) {
        const rootName = 'Arsip Hubin SMK PGRI 2 Ponorogo';
        const rootIt = DriveApp.getFoldersByName(rootName);
        targetRoot = rootIt.hasNext() ? rootIt.next() : DriveApp.createFolder(rootName);
      }

      const subName = 'Surat_Perizinan_PKL_PDF';
      const subIt = targetRoot.getFoldersByName(subName);
      const pdfFolder = subIt.hasNext() ? subIt.next() : targetRoot.createFolder(subName);

      const safeNama = String(p.namaSiswa || 'Siswa').replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'Siswa';
      const safeDudi = String(p.dudiTujuan || 'DUDI').replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'DUDI';
      const baseTitle = 'Surat_Permohonan_PKL_' + safeNama + '_' + safeDudi + '_' + Date.now();

      const doc = DocumentApp.create(baseTitle);
      const docBody = doc.getBody();
      docBody.setMarginTop(48);
      docBody.setMarginBottom(48);
      docBody.setMarginLeft(60);
      docBody.setMarginRight(60);

      const p1 = docBody.appendParagraph('YAYASAN PEMBINA LEMBAGA PENDIDIKAN DASAR DAN MENENGAH PGRI');
      p1.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      p1.editAsText().setFontSize(9).setBold(true);

      const p2 = docBody.appendParagraph('SMK PGRI 2 PONOROGO');
      p2.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      p2.editAsText().setFontSize(14).setBold(true);

      const p3 = docBody.appendParagraph('Status: Terakreditasi "A" (Unggul) • NSS: 322051301002 • NPSN: 20510123\\nJl. Soekarno - Hatta No. 94 Ponorogo, Jawa Timur • Telp: (0352) 481456');
      p3.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      p3.editAsText().setFontSize(9).setBold(false);

      docBody.appendHorizontalRule();
      docBody.appendParagraph('');

      const noSurat = String(p.noSuratPermohonan || '421.5 / ___ / Hubin / SMK.PGRI2 / ' + new Date().getFullYear());
      const tglSurat = String(p.tanggalSurat || '');
      const metaPara = docBody.appendParagraph(
        'Nomor   : ' + noSurat + '\\n' +
        'Lamp.   : 1 (satu) Berkas\\n' +
        'Perihal : Permohonan Penempatan Praktik Kerja Industri (Prakerin)\\n' +
        'Tanggal : ' + tglSurat
      );
      metaPara.editAsText().setFontSize(10);

      docBody.appendParagraph('');
      const toPara = docBody.appendParagraph(
        'Kepada Yth.\\nPimpinan / HRD ' + String(p.dudiTujuan || 'Mitra DUDI') + '\\n' + String(p.alamatDudi || 'Di Tempat')
      );
      toPara.editAsText().setFontSize(10);

      docBody.appendParagraph('');
      const openPara = docBody.appendParagraph(
        'Dengan hormat,\\nDalam rangka memenuhi tuntutan kurikulum Sekolah Menengah Kejuruan serta meningkatkan keselarasan kompetensi peserta didik dengan kebutuhan Dunia Usaha dan Dunia Industri (DUDI), kami memohon kesediaan Bapak/Ibu untuk berkenan menerima peserta didik SMK PGRI 2 Ponorogo melaksanakan Praktik Kerja Industri (Prakerin) di perusahaan/instansi yang Bapak/Ibu pimpin:'
      );
      openPara.setAlignment(DocumentApp.HorizontalAlignment.JUSTIFY);
      openPara.editAsText().setFontSize(10);

      docBody.appendParagraph('');
      const tbl = docBody.appendTable([
        ['No', 'Nama Siswa', 'NIS', 'Kelas / Jurusan'],
        ['1', String(p.namaSiswa || '-'), String(p.nis || '-'), String(p.kelas || '-') + ' / ' + String(p.jurusan || '-')]
      ]);
      tbl.getRow(0).editAsText().setBold(true).setFontSize(10);
      tbl.getRow(1).editAsText().setFontSize(10);

      docBody.appendParagraph('');
      const closePara = docBody.appendParagraph(
        'Demikian surat permohonan ini kami sampaikan. Atas perhatian, kerjasama, dan bimbingan yang Bapak/Ibu berikan, kami ucapkan terima kasih.'
      );
      closePara.setAlignment(DocumentApp.HorizontalAlignment.JUSTIFY);
      closePara.editAsText().setFontSize(10);

      docBody.appendParagraph('');
      const signPara = docBody.appendParagraph(
        'Ponorogo, ' + tglSurat + '\\n' +
        String(p.kepalaSekolah || 'Kepala SMK PGRI 2 Ponorogo') + ',\\n\\n\\n\\n' +
        '................................................\\nNIP. ..................................'
      );
      signPara.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
      signPara.editAsText().setFontSize(10);

      doc.saveAndClose();

      const tempDocFile = DriveApp.getFileById(doc.getId());
      const pdfBlob = tempDocFile.getAs(MimeType.PDF).setName(baseTitle + '.pdf');
      const pdfFile = pdfFolder.createFile(pdfBlob);
      pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      tempDocFile.setTrashed(true);

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        pdfUrl: pdfFile.getUrl(),
        fileId: pdfFile.getId(),
        fileName: pdfFile.getName()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'GENERATE_MONITORING_BUNDLE_PDF') {
      const p = body.data || {};
      const tplIds = p.templateIds || {};
      const includeDocs = p.includeDocs || {};
      const meta = p.meta || {};
      const bundles = Array.isArray(p.bundles) ? p.bundles : [];

      const extractDocIdGas = function(val) {
        const s = String(val || '').trim();
        if (!s) return '';
        const m = s.match(/\\/d\\/([a-zA-Z0-9_-]+)/);
        return (m && m[1]) ? m[1] : s;
      };

      const stTemplateId = extractDocIdGas(tplIds.suratTugas);
      const monTemplateId = extractDocIdGas(tplIds.monitoring);
      const nilaiTemplateId = extractDocIdGas(tplIds.nilai);

      if (includeDocs.suratTugas && !stTemplateId) {
        throw new Error('Template Google Docs untuk Surat Tugas (doc_surat_tugas) belum dipasang di Pengelola Template Dokumen.');
      }
      if (includeDocs.monitoring && !monTemplateId) {
        throw new Error('Template Google Docs untuk Lembar Monitoring (doc_monitoring) belum dipasang di Pengelola Template Dokumen.');
      }
      if (includeDocs.nilai && !nilaiTemplateId) {
        throw new Error('Template Google Docs untuk Lembar Penilaian PKL (doc_nilai) belum dipasang di Pengelola Template Dokumen.');
      }
      if (bundles.length === 0) {
        throw new Error('Tidak ada DUDI terpilih untuk dicetak dalam paket.');
      }

      let targetRoot = null;
      const driveUrl = String(body.driveFolderUrl || '').trim();
      const folderMatch = driveUrl.match(/\\/folders\\/([a-zA-Z0-9_-]+)/);
      if (folderMatch && folderMatch[1]) {
        try {
          targetRoot = DriveApp.getFolderById(folderMatch[1]);
        } catch (folderErr) {
          targetRoot = null;
        }
      }
      if (!targetRoot) {
        const rootName = 'Arsip Hubin SMK PGRI 2 Ponorogo';
        const rootIt = DriveApp.getFoldersByName(rootName);
        targetRoot = rootIt.hasNext() ? rootIt.next() : DriveApp.createFolder(rootName);
      }

      const subName = 'Paket_Cetak_Monitoring_PDF';
      const subIt = targetRoot.getFoldersByName(subName);
      const pdfFolder = subIt.hasNext() ? subIt.next() : targetRoot.createFolder(subName);

      const replaceDocPlaceholdersGas = function(targetBody, mapObj) {
        const keys = Object.keys(mapObj || {});
        for (let i = 0; i < keys.length; i++) {
          const k = keys[i];
          const val = String(mapObj[k] === undefined || mapObj[k] === null ? '' : mapObj[k]);
          const pattern = '\\\\{\\\\{\\\\s*' + k + '\\\\s*\\\\}\\\\}';
          targetBody.replaceText(pattern, val);
        }
      };

      const duplicateMonitoringRowsGas = function(targetBody, students) {
        const tables = targetBody.getTables();
        const list = Array.isArray(students) && students.length > 0 ? students : [{ nis: '', namaSiswa: '', kelas: '', jurusan: '' }];
        for (let t = 0; t < tables.length; t++) {
          const tbl = tables[t];
          let tplRowIdx = -1;
          for (let r = 0; r < tbl.getNumRows(); r++) {
            const txt = tbl.getRow(r).getText() || '';
            if (txt.indexOf('NamaSiswa') !== -1 || txt.indexOf('{{No}}') !== -1 || txt.indexOf('{{ No }}') !== -1) {
              tplRowIdx = r;
              break;
            }
          }
          if (tplRowIdx === -1) continue;

          const baseRow = tbl.getRow(tplRowIdx);
          for (let s = 1; s < list.length; s++) {
            const clonedRow = baseRow.copy();
            tbl.insertTableRow(tplRowIdx + s, clonedRow);
          }
          for (let s2 = 0; s2 < list.length; s2++) {
            const stu = list[s2] || {};
            const rowEl = tbl.getRow(tplRowIdx + s2);
            const rowMap = {
              No: String(s2 + 1),
              NamaSiswa: String(stu.namaSiswa || '-'),
              NIS: String(stu.nis || '-'),
              Kelas: String(stu.kelas || '-'),
              Jurusan: String(stu.jurusan || '-')
            };
            const rKeys = Object.keys(rowMap);
            for (let kIdx = 0; kIdx < rKeys.length; kIdx++) {
              const rk = rKeys[kIdx];
              rowEl.replaceText('\\\\{\\\\{\\\\s*' + rk + '\\\\s*\\\\}\\\\}', rowMap[rk]);
            }
          }
          break;
        }
      };

      const appendTempDocGas = function(srcDocId, masterBody, isFirst, copiedPageSetup) {
        const srcDoc = DocumentApp.openById(srcDocId);
        const srcBody = srcDoc.getBody();
        if (isFirst && !copiedPageSetup.done) {
          masterBody.setPageWidth(srcBody.getPageWidth());
          masterBody.setPageHeight(srcBody.getPageHeight());
          masterBody.setMarginTop(srcBody.getMarginTop());
          masterBody.setMarginBottom(srcBody.getMarginBottom());
          masterBody.setMarginLeft(srcBody.getMarginLeft());
          masterBody.setMarginRight(srcBody.getMarginRight());
          copiedPageSetup.done = true;
        } else {
          masterBody.appendPageBreak();
        }

        const totalChildren = srcBody.getNumChildren();
        for (let c = 0; c < totalChildren; c++) {
          const child = srcBody.getChild(c);
          const cType = child.getType();
          if (cType === DocumentApp.ElementType.PARAGRAPH) {
            masterBody.appendParagraph(child.asParagraph().copy());
          } else if (cType === DocumentApp.ElementType.TABLE) {
            masterBody.appendTable(child.asTable().copy());
          } else if (cType === DocumentApp.ElementType.LIST_ITEM) {
            masterBody.appendListItem(child.asListItem().copy());
          } else if (cType === DocumentApp.ElementType.HORIZONTAL_RULE) {
            masterBody.appendHorizontalRule();
          }
        }
        srcDoc.saveAndClose();
      };

      const stageNum = Number(meta.tahapNum || 1);
      const cekPenempatan = '☐';
      const cekPenyerahan = stageNum === 1 ? '■' : '☐';
      const cekMonitoring = (stageNum >= 2 && stageNum <= 7) ? '■' : '☐';
      const cekRaport = stageNum >= 8 ? '■' : '☐';

      const bundleTitle = 'Paket_Monitoring_Tahap_' + stageNum + '_' + Date.now();
      const masterDoc = DocumentApp.create(bundleTitle);
      const masterBody = masterDoc.getBody();
      const copiedPageSetup = { done: false };
      let isFirstPage = true;
      let totalSheets = 0;
      const tempFileIds = [];

      try {
        for (let b = 0; b < bundles.length; b++) {
          const bdl = bundles[b] || {};
          const students = Array.isArray(bdl.students) ? bdl.students : [];
          const commonMap = {
            NomorSurat: String(meta.nomorSurat || ''),
            TanggalSurat: String(meta.tanggalSurat || ''),
            TanggalTugas: String(meta.tanggalSurat || ''),
            TahunAjaran: String(meta.tahunAjaran || ''),
            Tahap: String(stageNum),
            TahapLabel: String(meta.tahapLabel || ''),
            KepalaSekolah: String(meta.kepalaSekolah || '.........................................'),
            NamaGuru: String(bdl.namaGuru || '-'),
            NipGuru: String(bdl.nipGuru || '-'),
            JabatanGuru: String(bdl.jabatanGuru || 'Guru SMK PGRI 2 Ponorogo'),
            AlamatGuru: 'Jl. Soekarno – Hatta Telp. 0352-461821 Ponorogo',
            CekPenempatan: cekPenempatan,
            CekPenyerahan: cekPenyerahan,
            CekMonitoring: cekMonitoring,
            CekRaport: cekRaport,
            NamaDudi: String(bdl.namaDudi || '-'),
            AlamatDudi: String(bdl.alamatDudi || '-'),
            NamaBengkel: String(bdl.namaDudi || '-'),
            Alamat: String(bdl.alamatDudi || '-'),
            Pemimpin: String(bdl.pemimpinDudi || '................................'),
            NoTelp: String(bdl.noTelpDudi || '................................')
          };

          if (includeDocs.suratTugas && stTemplateId) {
            const copySt = DriveApp.getFileById(stTemplateId).makeCopy('TMP_ST_' + b + '_' + Date.now(), pdfFolder);
            const copyStId = copySt.getId();
            tempFileIds.push(copyStId);
            const docSt = DocumentApp.openById(copyStId);
            replaceDocPlaceholdersGas(docSt.getBody(), commonMap);
            docSt.saveAndClose();
            appendTempDocGas(copyStId, masterBody, isFirstPage, copiedPageSetup);
            isFirstPage = false;
            totalSheets++;
          }

          if (includeDocs.monitoring && monTemplateId) {
            const copyMon = DriveApp.getFileById(monTemplateId).makeCopy('TMP_MON_' + b + '_' + Date.now(), pdfFolder);
            const copyMonId = copyMon.getId();
            tempFileIds.push(copyMonId);
            const docMon = DocumentApp.openById(copyMonId);
            const monBody = docMon.getBody();
            duplicateMonitoringRowsGas(monBody, students);
            replaceDocPlaceholdersGas(monBody, commonMap);
            docMon.saveAndClose();
            appendTempDocGas(copyMonId, masterBody, isFirstPage, copiedPageSetup);
            isFirstPage = false;
            totalSheets++;
          }

          if (includeDocs.nilai && nilaiTemplateId) {
            for (let s = 0; s < students.length; s++) {
              const stu = students[s] || {};
              const copyNil = DriveApp.getFileById(nilaiTemplateId).makeCopy('TMP_NIL_' + b + '_' + s + '_' + Date.now(), pdfFolder);
              const copyNilId = copyNil.getId();
              tempFileIds.push(copyNilId);
              const docNil = DocumentApp.openById(copyNilId);
              const nilMap = Object.assign({}, commonMap, {
                NamaSiswa: String(stu.namaSiswa || ''),
                NIS: String(stu.nis || ''),
                Kelas: String(stu.kelas || ''),
                Jurusan: String(stu.jurusan || '')
              });
              replaceDocPlaceholdersGas(docNil.getBody(), nilMap);
              docNil.saveAndClose();
              appendTempDocGas(copyNilId, masterBody, isFirstPage, copiedPageSetup);
              isFirstPage = false;
              totalSheets++;
            }
          }
        }

        if (masterBody.getNumChildren() > 1) {
          const firstChild = masterBody.getChild(0);
          if (firstChild.getType() === DocumentApp.ElementType.PARAGRAPH && firstChild.asParagraph().getText().trim() === '') {
            masterBody.removeChild(firstChild);
          }
        }
        masterDoc.saveAndClose();

        const masterFile = DriveApp.getFileById(masterDoc.getId());
        const pdfBlob = masterFile.getAs(MimeType.PDF).setName(bundleTitle + '.pdf');
        const pdfFile = pdfFolder.createFile(pdfBlob);
        pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        masterFile.setTrashed(true);

        return ContentService.createTextOutput(JSON.stringify({
          success: true,
          pdfUrl: pdfFile.getUrl(),
          fileId: pdfFile.getId(),
          fileName: pdfFile.getName(),
          totalSheets: totalSheets
        })).setMimeType(ContentService.MimeType.JSON);
      } finally {
        for (let tf = 0; tf < tempFileIds.length; tf++) {
          try {
            DriveApp.getFileById(tempFileIds[tf]).setTrashed(true);
          } catch (cleanupErr) {}
        }
      }
    }

    let sheet = resolveSheetAlias(ss, sheetName);

    if (!sheet && (sheetName === 'Master_Akun' || sheetName === 'Log_Penerbitan_Surat')) {
      const autoHeaders = REQUIRED_SHEET_HEADERS[sheetName] || [];
      sheet = ss.insertSheet(sheetName);
      if (autoHeaders.length > 0) {
        sheet.appendRow(autoHeaders);
        sheet.getRange(1, 1, 1, autoHeaders.length)
          .setFontWeight('bold')
          .setBackground('#0F172A')
          .setFontColor('#FFFFFF');
        sheet.setFrozenRows(1);
      }
    }

    if (!sheet) {
      throw new Error('Sheet tidak ditemukan: ' + sheetName);
    }

    const headers = ensureMissingHeaders(sheet, sheetName);
    const isFormulaCol = detectFormulaColFlags(sheet, headers.length);
    let savedId = '';
    let savedRowNumber = 0;

    if (action === 'CREATE') {
      const rowObj = body.data || {};
      savedId = String(body.id || extractRecordId(rowObj) || '').trim();
      const newRow = headers.map(function(h) {
        const val = getNormalizedValue(rowObj, h);
        return val !== undefined ? val : '';
      });
      const targetRow = getNextAppendRowNonFormula(sheet, isFormulaCol);
      formatNisAndTextColumns(sheet, headers, targetRow, 1);
      writeNonFormulaRowSpans(sheet, targetRow, newRow, isFormulaCol);
      savedRowNumber = targetRow;
    } else if (action === 'IMPORT') {
      const items = Array.isArray(body.data) ? body.data : [];
      if (items.length > 0) {
        const matrix = items.map(function(item) {
          return headers.map(function(h) {
            const val = getNormalizedValue(item, h);
            return val !== undefined ? val : '';
          });
        });
        const startRow = getNextAppendRowNonFormula(sheet, isFormulaCol);
        formatNisAndTextColumns(sheet, headers, startRow, matrix.length);
        writeNonFormulaMatrixSpans(sheet, startRow, matrix, isFormulaCol);
        savedRowNumber = startRow;
      }
    } else if (action === 'UPDATE') {
      const rowObj = body.data || {};
      const targetId = String(body.id || extractRecordId(rowObj)).trim();
      savedId = targetId;
      const explicitRowNum = Number(body.sheetRowNumber || rowObj._sheetRowNumber || 0);
      const values = sheet.getDataRange().getValues();
      const rowIdx = findRowIndexById(values, headers, targetId, rowObj, sheetName, explicitRowNum);
      if (rowIdx === -1) {
        return ContentService.createTextOutput(JSON.stringify({
          error: 'Baris data dengan ID "' + targetId + '" tidak ditemukan di sheet "' + sheetName + '". Segarkan tabel terlebih dahulu lalu coba simpan ulang.'
        })).setMimeType(ContentService.MimeType.JSON);
      }
      const updatedRow = headers.map(function(h, colIdx) {
        if (isFormulaCol[colIdx]) return '';
        const val = getNormalizedValue(rowObj, h);
        return val !== undefined ? val : values[rowIdx][colIdx];
      });
      formatNisAndTextColumns(sheet, headers, rowIdx + 1, 1);
      writeNonFormulaRowSpans(sheet, rowIdx + 1, updatedRow, isFormulaCol);
      savedRowNumber = rowIdx + 1;
    } else if (action === 'BULK_UPDATE') {
      const updatedRows = (body.data && Array.isArray(body.data.updatedRows)) ? body.data.updatedRows : [];
      const values = sheet.getDataRange().getValues();
      const pendingWrites = [];
      updatedRows.forEach(function(rowObj) {
        const targetId = extractRecordId(rowObj);
        const rowIdx = findRowIndexById(values, headers, targetId, rowObj, sheetName, rowObj && rowObj._sheetRowNumber);
        if (rowIdx !== -1) {
          const updatedRow = headers.map(function(h, colIdx) {
            if (isFormulaCol[colIdx]) return '';
            const val = getNormalizedValue(rowObj, h);
            return val !== undefined ? val : values[rowIdx][colIdx];
          });
          values[rowIdx] = updatedRow;
          pendingWrites.push({ sheetRow: rowIdx + 1, row: updatedRow });
        }
      });
      if (pendingWrites.length > 0) {
        pendingWrites.sort(function(a, b) { return a.sheetRow - b.sheetRow; });
        let runStartIdx = 0;
        while (runStartIdx < pendingWrites.length) {
          let runEndIdx = runStartIdx;
          const runMatrix = [pendingWrites[runStartIdx].row];
          while (
            runEndIdx + 1 < pendingWrites.length &&
            pendingWrites[runEndIdx + 1].sheetRow === pendingWrites[runEndIdx].sheetRow + 1
          ) {
            runEndIdx++;
            runMatrix.push(pendingWrites[runEndIdx].row);
          }
          const startSheetRow = pendingWrites[runStartIdx].sheetRow;
          formatNisAndTextColumns(sheet, headers, startSheetRow, runMatrix.length);
          writeNonFormulaMatrixSpans(sheet, startSheetRow, runMatrix, isFormulaCol);
          runStartIdx = runEndIdx + 1;
        }
      }
    } else if (action === 'DELETE') {
      const payload = body.data || {};
      const deletedRowObj = payload.deletedRow || payload;
      const targetId = String(body.id || extractRecordId(payload) || extractRecordId(deletedRowObj)).trim();
      const explicitRowNum = Number(body.sheetRowNumber || deletedRowObj._sheetRowNumber || 0);
      const values = sheet.getDataRange().getValues();
      const rowIdx = findRowIndexById(values, headers, targetId, deletedRowObj, sheetName, explicitRowNum);
      if (rowIdx === -1) {
        return ContentService.createTextOutput(JSON.stringify({
          error: 'Baris data yang akan dihapus (ID: "' + targetId + '") tidak ditemukan di sheet "' + sheetName + '".'
        })).setMimeType(ContentService.MimeType.JSON);
      }
      sheet.deleteRow(rowIdx + 1);
    } else if (action === 'BULK_DELETE') {
      const ids = (body.data && Array.isArray(body.data.ids)) ? body.data.ids : [];
      const deletedRows = (body.data && Array.isArray(body.data.deletedRows)) ? body.data.deletedRows : [];
      const values = sheet.getDataRange().getValues();
      const rowsToDelete = {};

      deletedRows.forEach(function(rowObj) {
        const idx = findRowIndexById(values, headers, extractRecordId(rowObj), rowObj, sheetName, rowObj && rowObj._sheetRowNumber);
        if (idx >= 1) rowsToDelete[idx] = true;
      });
      ids.forEach(function(rawId) {
        const idx = findRowIndexById(values, headers, String(rawId), null, sheetName, 0);
        if (idx >= 1) rowsToDelete[idx] = true;
      });

      const sortedDesc = Object.keys(rowsToDelete).map(Number).sort(function(a, b) { return b - a; });
      for (let d = 0; d < sortedDesc.length; d++) {
        sheet.deleteRow(sortedDesc[d] + 1);
      }
    } else if (action === 'SYNC_ALL') {
      const rows = body.data;
      if (Array.isArray(rows)) {
        clearNonFormulaDataRows(sheet, headers.length, isFormulaCol);
        if (rows.length > 0) {
          const matrix = rows.map(function(r) {
            return headers.map(function(h) {
              const val = getNormalizedValue(r, h);
              return val !== undefined ? val : '';
            });
          });
          formatNisAndTextColumns(sheet, headers, 2, matrix.length);
          writeNonFormulaMatrixSpans(sheet, 2, matrix, isFormulaCol);
        }
      }
    }

    SpreadsheetApp.flush();
    bumpGasSheetCacheVersion(ss.getId());
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      verified: true,
      action: action,
      sheetName: sheetName,
      savedId: savedId || undefined,
      sheetRowNumber: savedRowNumber >= 2 ? savedRowNumber : undefined,
      savedAt: new Date().toISOString()
    }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    if (scriptLock) {
      try {
        scriptLock.releaseLock();
      } catch (releaseErr) {}
    }
  }
}
`;
}
