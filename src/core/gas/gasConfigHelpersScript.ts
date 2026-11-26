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

export function buildGasConfigHelpersCode(): string {
  const requiredHeadersLiteral = buildRequiredSheetHeadersLiteral();
  const formulaManagedLiteral = buildFormulaManagedHeadersLiteral();

  return `/**
 * ============================================================================
 * FILE 01: KONFIGURASI HEADER, ALIAS, CACHE & HELPER NON-FORMULA SPANS
 * Bagian dari Google Apps Script SI-HUBIN SMK PGRI 2 Ponorogo (4 File Modular)
 * Simpan bersama 02_WebAppRouter.gs, 03_RelationalMigration.gs, 04_PdfAndYearlyRollover.gs
 * ============================================================================
 */

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
  notelpdudi: ['notelpdudi', 'telepondudi', 'kontakpic'],
  kontakpic: ['kontakpic', 'notelpdudi'],
  namapemimpin: ['namapemimpin', 'pimpinan'],
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

const HEADER_SYNONYMS_BY_SHEET = {
  Master_DUDI: {
    notelpdudi: ['notelpdudi', 'kontakpic', 'telepondudi'],
    namapemimpin: ['namapemimpin', 'pimpinan']
  },
  Master_Siswa_XI: {
    namalengkap: ['namalengkap', 'namasiswa', 'nama'],
    nohpsiswa: ['nohpsiswa', 'nohp', 'telepon']
  },
  Master_Guru_Pendamping: {
    namalengkap: ['namalengkap', 'namaguru', 'nama']
  },
  Data_Pengajuan_PKL: {
    alamatdudi: ['alamatdudi', 'alamat'],
    tglberangkat: ['tglberangkat', 'tanggalberangkat'],
    notelpdudi: ['notelpdudi', 'kontakpic', 'telepondudi']
  },
  Data_Perizinan_PKL: {
    idperizinan: ['idperizinan', 'noperizinan'],
    izin: ['izin', 'statusizinortu'],
    tglmulaiizin: ['tglmulaiizin', 'tanggalmulaiizin'],
    tglselesaiizin: ['tglselesaiizin', 'tanggalselesaiizin'],
    tglkirimsurat: ['tglkirimsurat', 'tanggalkirimsurat'],
    tglbalasan: ['tglbalasan', 'tanggalbalasan'],
    linksuratpdf: ['linksuratpdf', 'linkpdf']
  },
  Monitoring_5_Tahap: {
    tahap: ['tahap', 'tahapmonitoring'],
    nilaisoftskills: ['nilaisoftskills', 'nilaisoftskill'],
    nilaihardskills: ['nilaihardskills', 'nilaikompetensiteknis'],
    nilaialurbisnisduniakerja: ['nilaialurbisnisduniakerja', 'nilaialurbisnis'],
    nilairatarata: ['nilairatarata', 'nilaidudi', 'nilaiakhir'],
    fotobuktidrive: ['fotobuktidrive', 'fotobuktiurl'],
    kompetensididapat: ['kompetensididapat', 'kompetensisiswa']
  },
  Nilai_Dan_Sertifikat: {
    nilaisoftskills: ['nilaisoftskills', 'nilaisoftskill'],
    nilaihardskills: ['nilaihardskills', 'nilaikompetensiteknis'],
    nilaialurbisnisduniakerja: ['nilaialurbisnisduniakerja', 'nilaialurbisnis'],
    nilairatarata: ['nilairatarata', 'nilaidudi', 'nilaiakhir'],
    tglterbit: ['tglterbit', 'tanggalterbit']
  },
  Log_Penerbitan_Surat: {
    linkpdf: ['linkpdf', 'linksuratpdf'],
    tglterbit: ['tglterbit', 'tanggalterbit']
  }
};

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

function getHeaderSynonymNorms(canonicalSheetName, headerNorm) {
  const sheetMap = HEADER_SYNONYMS_BY_SHEET[canonicalSheetName] || {};
  if (sheetMap[headerNorm]) return sheetMap[headerNorm];
  return [headerNorm];
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
    const synonymList = getHeaderSynonymNorms(canonicalSheetName, expNorm);
    const hasMatch = synonymList.some(function(syn) {
      return Boolean(existingNorms[syn]);
    });
    if (!hasMatch) {
      missing.push(expected[j]);
      existingNorms[expNorm] = true;
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
`;
}
