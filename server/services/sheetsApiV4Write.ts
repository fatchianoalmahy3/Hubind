import { isFormulaManagedColumn } from '../../src/core/types/sheetBlueprint';
import { stripNisSymbols } from '../../src/core/utils/nisHelpers';
import { type GasWriteAction, PortalConfigError } from '../types';
import { fetchWithRetry, fetchWithTimeout } from '../utils/httpHelpers';
import { registerMetadataCacheClearHook } from './serverSheetCache';
import {
  SHEETS_API_TIMEOUT_MS,
  colIndexToLetter,
  getSpreadsheetMetadataViaApiV4,
  invalidateSheetsAccessTokenCache,
  resolveActualTabName,
  resolveGoogleSheetsWriteAuth,
} from './sheetsApiV4Client';

const SCHEMA_CACHE_TTL_MS = 300_000;
const sheetWriteSchemaCache = new Map<
  string,
  { headers: string[]; isFormulaCol: boolean[]; fetchedAt: number }
>();
const writeMutexChains = new Map<string, Promise<unknown>>();

registerMetadataCacheClearHook(() => {
  sheetWriteSchemaCache.clear();
});

const KEY_ALIASES: Record<string, string[]> = {
  id: ['id', 'idguru', 'iddudi', 'nopengajuan', 'idperizinan', 'idpenempatan', 'idmonitoring', 'idterbit'],
  nopengajuan: ['nopengajuan', 'id'],
  idperizinan: ['idperizinan', 'noperizinan', 'id'],
  noperizinan: ['noperizinan', 'idperizinan', 'id'],
  idpenempatan: ['idpenempatan', 'id'],
  idmonitoring: ['idmonitoring', 'id'],
  idterbit: ['idterbit', 'id'],
  iddudi: ['iddudi', 'id'],
  idgurupendamping: ['idgurupendamping', 'idguru'],
  idguru: ['idguru', 'idgurupendamping', 'id'],
  nohp: ['nohp', 'nohpsiswa', 'nowa'],
  nohpsiswa: ['nohpsiswa', 'nohp', 'nowa'],
  nowa: ['nowa', 'kontakwa', 'nohpsiswa'],
  kontakwa: ['kontakwa', 'nowa'],
  emailgoogle: ['emailgoogle', 'email'],
  alamatdomisili: ['alamatdomisili', 'alamat'],
  alamatdudi: ['alamatdudi', 'alamat'],
  namaortuwali: ['namaortuwali', 'namaorangtua', 'namaortu'],
  noortuwali: ['noortuwali', 'teleponorangtua', 'nohportu'],
  namapemimpin: ['namapemimpin', 'pimpinan'],
  namapic: ['namapic', 'pic'],
  kontakpic: ['kontakpic', 'notelpdudi', 'telepondudi'],
  notelpdudi: ['notelpdudi', 'kontakpic', 'telepondudi'],
  duditujuan: ['duditujuan', 'namadudi'],
  namadudi: ['namadudi', 'duditujuan'],
  tglberangkat: ['tglberangkat', 'tanggalberangkat'],
  tanggalberangkat: ['tanggalberangkat', 'tglberangkat'],
  tglkunjungan: ['tglkunjungan', 'tanggalkunjungan'],
  tanggalkunjungan: ['tanggalkunjungan', 'tglkunjungan'],
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
  ttdsiswa: ['ttdsiswa'],
};

function normalizeKey(key: string): string {
  return String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function quoteA1Sheet(tabName: string): string {
  return `'${tabName.replace(/'/g, "''")}'`;
}

function formatWriteCellValue(val: any): string | number {
  if (val === undefined || val === null) return '';
  if (typeof val === 'boolean') return val ? 'Ya' : 'Belum';
  if (typeof val === 'number') return Number.isFinite(val) ? val : '';
  return String(val);
}

const PRIMARY_ID_NORM_KEYS = new Set([
  'id',
  'nopengajuan',
  'idperizinan',
  'noperizinan',
  'idpenempatan',
  'idmonitoring',
  'idterbit',
]);

function getNormalizedValue(rowObj: Record<string, any> | null | undefined, header: string): any {
  if (!rowObj || typeof rowObj !== 'object') return undefined;
  const target = normalizeKey(header);
  const candidateTargets = KEY_ALIASES[target] || [target];
  const keys = Object.keys(rowObj);

  const sanitizePrimaryIfNeeded = (val: any): any => {
    if (!PRIMARY_ID_NORM_KEYS.has(target) || typeof val !== 'string') return val;
    const { cleanId, rowNum } = parseRowHintFromId(val);
    if (rowNum > 0 && !cleanId) return undefined;
    return cleanId;
  };

  let firstDefined: any = undefined;
  if (rowObj[header] !== undefined) {
    const cleaned = sanitizePrimaryIfNeeded(rowObj[header]);
    if (cleaned !== undefined && String(cleaned === null ? '' : cleaned).trim() !== '') {
      return cleaned;
    }
    firstDefined = cleaned;
  }

  for (const wanted of candidateTargets) {
    for (const k of keys) {
      if (k === '_sheetRowNumber') continue;
      if (normalizeKey(k) === wanted) {
        const val = sanitizePrimaryIfNeeded(rowObj[k]);
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

function parseRowHintFromId(rawId: unknown): { cleanId: string; rowNum: number } {
  const str = String(rawId || '').trim();
  const hashMatch = str.match(/^(.*)#r(\d+)$/);
  if (hashMatch) {
    return { cleanId: hashMatch[1].trim(), rowNum: Number(hashMatch[2]) };
  }
  const placeholderMatch = str.match(/^row_(\d+)$/);
  if (placeholderMatch) {
    return { cleanId: '', rowNum: Number(placeholderMatch[1]) };
  }
  return { cleanId: str, rowNum: 0 };
}

function extractRecordId(obj: any): string {
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

function findColumnIndex(headers: string[], candidatesNorm: string[]): number {
  for (let c = 0; c < headers.length; c++) {
    if (candidatesNorm.includes(normalizeKey(headers[c]))) {
      return c;
    }
  }
  return -1;
}

function findRowIndexById(
  values: any[][],
  headers: string[],
  targetId: string,
  rowObj: any,
  sheetName: string,
  explicitRowNum?: number
): number {
  const parsed = parseRowHintFromId(targetId);
  const cleanId = parsed.cleanId;
  const rowNumHint = Number(explicitRowNum || (rowObj && rowObj._sheetRowNumber) || parsed.rowNum || 0);

  let idColIdx = findColumnIndex(headers, [
    'id',
    'nopengajuan',
    'idperizinan',
    'idpenempatan',
    'idmonitoring',
    'idterbit',
  ]);
  if (idColIdx === -1) idColIdx = 0;

  const nisColIdx = findColumnIndex(headers, ['nis']);
  const userColIdx = findColumnIndex(headers, ['username']);
  const namaColIdx = findColumnIndex(headers, ['namasiswa', 'namalengkap', 'namadudi']);

  if (rowNumHint >= 2 && rowNumHint <= values.length) {
    const idx = rowNumHint - 1;
    const cellId = String(values[idx]?.[idColIdx] ?? '').trim();
    const nisWanted = String((rowObj && (rowObj.NIS || rowObj.nis)) || '').trim();
    const nisWantedDigits = stripNisSymbols(nisWanted);
    const cellNis = nisColIdx !== -1 ? String(values[idx]?.[nisColIdx] ?? '').trim() : '';
    const cellNisDigits = stripNisSymbols(cellNis);
    const nisMatches =
      (nisWanted && cellNis === nisWanted) || (nisWantedDigits && cellNisDigits === nisWantedDigits);

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
      const colVal = String(values[r]?.[idColIdx] ?? '').trim();
      const firstColVal = String(values[r]?.[0] ?? '').trim();
      if (colVal === cleanId || firstColVal === cleanId) {
        return r;
      }
    }
  }

  const nisWanted =
    String((rowObj && (rowObj.NIS || rowObj.nis)) || '').trim() ||
    (sheetName === 'Nilai_Dan_Sertifikat' ||
    sheetName === 'Master_Siswa_XI' ||
    sheetName === 'Master_Siswa'
      ? cleanId
      : '');
  const nisWantedDigits = stripNisSymbols(nisWanted);
  if (nisWanted && nisColIdx !== -1) {
    for (let r2 = 1; r2 < values.length; r2++) {
      const rowNisStr = String(values[r2]?.[nisColIdx] ?? '').trim();
      if (rowNisStr === nisWanted || (nisWantedDigits && stripNisSymbols(rowNisStr) === nisWantedDigits)) {
        return r2;
      }
    }
  }

  const userWanted = String((rowObj && (rowObj.Username || rowObj.username)) || '').trim();
  if (userWanted && userColIdx !== -1) {
    for (let r3 = 1; r3 < values.length; r3++) {
      if (String(values[r3]?.[userColIdx] ?? '').trim().toLowerCase() === userWanted.toLowerCase()) {
        return r3;
      }
    }
  }

  const namaWanted = String(
    (rowObj && (rowObj.Nama_Siswa || rowObj.namaSiswa || rowObj.Nama_Lengkap || rowObj.Nama_DUDI)) || ''
  ).trim();
  if (namaWanted && namaColIdx !== -1 && (rowNumHint >= 2 || !cleanId)) {
    for (let r4 = 1; r4 < values.length; r4++) {
      if (String(values[r4]?.[namaColIdx] ?? '').trim().toLowerCase() === namaWanted.toLowerCase()) {
        return r4;
      }
    }
  }

  return -1;
}

function getNextAppendRowNonFormula(values: any[][], isFormulaCol: boolean[]): number {
  if (values.length <= 1) return 2;
  const cols = isFormulaCol.length;
  for (let r = values.length - 1; r >= 1; r--) {
    const row = values[r] || [];
    for (let c = 0; c < cols; c++) {
      if (!isFormulaCol[c] && String(row[c] ?? '').trim() !== '') {
        return r + 2;
      }
    }
  }
  return 2;
}

function getNextRowInColA(values: any[][]): number {
  for (let r = values.length - 1; r >= 1; r--) {
    if (String(values[r]?.[0] ?? '').trim() !== '') {
      return r + 2;
    }
  }
  return 2;
}

async function withSheetWriteLock<T>(lockKey: string, task: () => Promise<T>): Promise<T> {
  const prev = writeMutexChains.get(lockKey) || Promise.resolve();
  const next = prev.catch(() => undefined).then(task);
  const tracked = next.finally(() => {
    if (writeMutexChains.get(lockKey) === tracked) {
      writeMutexChains.delete(lockKey);
    }
  });
  writeMutexChains.set(lockKey, tracked);
  return next;
}

async function getSheetWriteSchema(
  spreadsheetId: string,
  actualTab: string,
  requestedSheetName: string,
  token: string
): Promise<{ headers: string[]; isFormulaCol: boolean[] } | null> {
  const cacheKey = `${spreadsheetId}::${actualTab}`;
  const cached = sheetWriteSchemaCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < SCHEMA_CACHE_TTL_MS) {
    return { headers: cached.headers, isFormulaCol: cached.isFormulaCol };
  }

  const range12 = encodeURIComponent(`${quoteA1Sheet(actualTab)}!1:2`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}/values/${range12}?valueRenderOption=FORMULA&majorDimension=ROWS`;

  const res = await fetchWithRetry(
    url,
    {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    },
    { timeoutMs: SHEETS_API_TIMEOUT_MS, retries: 2, baseDelayMs: 200 }
  );

  if (res.status === 401) {
    invalidateSheetsAccessTokenCache();
    return null;
  }
  if (!res.ok) {
    return null;
  }

  const json = await res.json();
  const rows: any[][] = Array.isArray(json?.values) ? json.values : [];
  const rawHeaders = Array.isArray(rows[0]) ? rows[0] : [];
  const row2 = Array.isArray(rows[1]) ? rows[1] : [];

  const headers = rawHeaders.map((h) => String(h ?? '').trim());
  if (headers.length === 0 || headers.every((h) => !h)) {
    return null;
  }

  const isFormulaCol = headers.map((header, idx) => {
    const f1 = String(rawHeaders[idx] ?? '');
    const f2 = String(row2[idx] ?? '');
    return (
      f1.startsWith('=') ||
      f2.startsWith('=') ||
      isFormulaManagedColumn(requestedSheetName, header) ||
      isFormulaManagedColumn(actualTab, header)
    );
  });

  sheetWriteSchemaCache.set(cacheKey, { headers, isFormulaCol, fetchedAt: Date.now() });
  return { headers, isFormulaCol };
}

async function readSheetValuesMatrix(
  spreadsheetId: string,
  actualTab: string,
  colCount: number,
  token: string
): Promise<any[][] | null> {
  const lastCol = colIndexToLetter(Math.max(0, colCount - 1));
  const range = encodeURIComponent(`${quoteA1Sheet(actualTab)}!A1:${lastCol}`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER&majorDimension=ROWS`;

  const res = await fetchWithRetry(
    url,
    {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    },
    { timeoutMs: SHEETS_API_TIMEOUT_MS, retries: 2, baseDelayMs: 200 }
  );

  if (res.status === 401) {
    invalidateSheetsAccessTokenCache();
    return null;
  }
  if (!res.ok) {
    return null;
  }
  const json = await res.json();
  return Array.isArray(json?.values) ? json.values : [];
}

async function batchUpdateValueRanges(
  spreadsheetId: string,
  data: Array<{ range: string; values: Array<Array<string | number>> }>,
  token: string
): Promise<{ ok: true } | { fallback: true }> {
  if (data.length === 0) return { ok: true };

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}/values:batchUpdate`;

  const res = await fetchWithRetry(
    url,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        valueInputOption: 'RAW',
        data,
      }),
    },
    { timeoutMs: 12_000, retries: 2, baseDelayMs: 250 }
  );

  if (res.status === 401) {
    invalidateSheetsAccessTokenCache();
    return { fallback: true };
  }
  if (res.status === 403 || res.status === 404) {
    return { fallback: true };
  }
  if (!res.ok) {
    const errTxt = await res.text().catch(() => '');
    console.warn(`[Sheets API v4 Write] batchUpdate HTTP ${res.status}: ${errTxt.slice(0, 140)}`);
    return { fallback: true };
  }
  return { ok: true };
}

async function deleteRowsViaBatchUpdate(
  spreadsheetId: string,
  sheetId: number,
  zeroBasedRowIndices: number[],
  token: string
): Promise<{ ok: true } | { fallback: true }> {
  const uniqueDesc = Array.from(
    new Set(zeroBasedRowIndices.filter((idx) => Number.isInteger(idx) && idx >= 1))
  ).sort((a, b) => b - a);
  if (uniqueDesc.length === 0) return { ok: true };

  // Merge contiguous descending indices into single deleteDimension ranges
  const requests: Array<{
    deleteDimension: { range: { sheetId: number; dimension: 'ROWS'; startIndex: number; endIndex: number } };
  }> = [];
  let runEnd = uniqueDesc[0] + 1;
  let runStart = uniqueDesc[0];
  for (let i = 1; i < uniqueDesc.length; i++) {
    const idx = uniqueDesc[i];
    if (idx === runStart - 1) {
      runStart = idx;
    } else {
      requests.push({
        deleteDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: runStart, endIndex: runEnd },
        },
      });
      runEnd = idx + 1;
      runStart = idx;
    }
  }
  requests.push({
    deleteDimension: {
      range: { sheetId, dimension: 'ROWS', startIndex: runStart, endIndex: runEnd },
    },
  });

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}:batchUpdate`;

  const res = await fetchWithRetry(
    url,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ requests }),
    },
    { timeoutMs: 12_000, retries: 2, baseDelayMs: 250 }
  );

  if (res.status === 401) {
    invalidateSheetsAccessTokenCache();
    return { fallback: true };
  }
  if (res.status === 403 || res.status === 404) {
    return { fallback: true };
  }
  if (!res.ok) {
    const errTxt = await res.text().catch(() => '');
    console.warn(`[Sheets API v4 Delete] batchUpdate HTTP ${res.status}: ${errTxt.slice(0, 140)}`);
    return { fallback: true };
  }
  return { ok: true };
}

async function atomicAppendColAReserveRows(
  spreadsheetId: string,
  actualTab: string,
  colAValues: Array<string | number>,
  token: string
): Promise<{ startRow: number } | null> {
  const range = encodeURIComponent(`${quoteA1Sheet(actualTab)}!A:A`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}/values/${range}:append?valueInputOption=RAW&insertDataOption=OVERWRITE`;

  // Retry only on 429 rate-limit before Google processes append
  for (let attempt = 0; attempt <= 2; attempt++) {
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          majorDimension: 'ROWS',
          values: colAValues.map((v) => [v]),
        }),
      },
      12_000
    );

    if (res.status === 429 && attempt < 2) {
      await res.text().catch(() => '');
      const jitter = 250 + Math.floor(Math.random() * 500);
      await new Promise((r) => setTimeout(r, jitter));
      continue;
    }

    if (res.status === 401) {
      invalidateSheetsAccessTokenCache();
      return null;
    }
    if (!res.ok) {
      return null;
    }

    const json = await res.json();
    const updatedRange = String(json?.updates?.updatedRange || '');
    const m = updatedRange.match(/!A(\d+)(?::A(\d+))?$/);
    if (!m || !m[1]) return null;
    const startRow = Number(m[1]);
    return Number.isInteger(startRow) && startRow >= 2 ? { startRow } : null;
  }

  return null;
}

function buildAppendRangesForMatrix(
  actualTab: string,
  startRow: number,
  matrix: Array<Array<string | number>>,
  isFormulaCol: boolean[],
  startCol = 0
): Array<{ range: string; values: Array<Array<string | number>> }> {
  const ranges: Array<{ range: string; values: Array<Array<string | number>> }> = [];
  const cols = isFormulaCol.length;
  const endRow = startRow + matrix.length - 1;
  const quotedTab = quoteA1Sheet(actualTab);

  let c = startCol;
  while (c < cols) {
    if (isFormulaCol[c]) {
      c++;
      continue;
    }
    const spanStart = c;
    while (c < cols && !isFormulaCol[c]) {
      c++;
    }
    const spanEnd = c - 1;
    const subMatrix = matrix.map((row) => row.slice(spanStart, spanEnd + 1));
    const startL = colIndexToLetter(spanStart);
    const endL = colIndexToLetter(spanEnd);
    ranges.push({
      range: `${quotedTab}!${startL}${startRow}:${endL}${endRow}`,
      values: subMatrix,
    });
  }

  return ranges;
}

function buildPartialRowUpdateRanges(
  actualTab: string,
  sheetRow: number,
  headers: string[],
  isFormulaCol: boolean[],
  rowObj: Record<string, any>
): Array<{ range: string; values: Array<Array<string | number>> }> {
  const ranges: Array<{ range: string; values: Array<Array<string | number>> }> = [];
  const quotedTab = quoteA1Sheet(actualTab);
  const cols = headers.length;

  let c = 0;
  while (c < cols) {
    if (isFormulaCol[c]) {
      c++;
      continue;
    }
    const rawVal = getNormalizedValue(rowObj, headers[c]);
    if (rawVal === undefined) {
      c++;
      continue;
    }
    const spanStart = c;
    const spanValues: Array<string | number> = [];
    while (c < cols && !isFormulaCol[c]) {
      const nextVal = getNormalizedValue(rowObj, headers[c]);
      if (nextVal === undefined) break;
      spanValues.push(formatWriteCellValue(nextVal));
      c++;
    }
    const spanEnd = c - 1;
    const startL = colIndexToLetter(spanStart);
    const endL = colIndexToLetter(spanEnd);
    ranges.push({
      range:
        spanStart === spanEnd
          ? `${quotedTab}!${startL}${sheetRow}`
          : `${quotedTab}!${startL}${sheetRow}:${endL}${sheetRow}`,
      values: [spanValues],
    });
  }

  return ranges;
}

export async function tryWriteSheetViaApiV4(
  spreadsheetId: string,
  sheetName: string,
  action: GasWriteAction,
  payload: any
): Promise<{
  verified: boolean;
  savedId?: string;
  sheetRowNumber?: number;
  savedAt: string;
} | null> {
  if (
    action !== 'CREATE' &&
    action !== 'UPDATE' &&
    action !== 'BULK_UPDATE' &&
    action !== 'IMPORT' &&
    action !== 'DELETE' &&
    action !== 'BULK_DELETE'
  ) {
    return null;
  }

  const auth = await resolveGoogleSheetsWriteAuth();
  if (!auth) return null;

  try {
    const meta = await getSpreadsheetMetadataViaApiV4(spreadsheetId, auth, false);
    const actualTab = resolveActualTabName(sheetName, meta.tabNames);
    if (!actualTab) {
      return null;
    }

    return await withSheetWriteLock(`${spreadsheetId}::${actualTab}`, async () => {
      const schema = await getSheetWriteSchema(spreadsheetId, actualTab, sheetName, auth.token);
      if (!schema) return null;
      const { headers, isFormulaCol } = schema;

      const values = await readSheetValuesMatrix(spreadsheetId, actualTab, headers.length, auth.token);
      if (!values) return null;

      if (action === 'CREATE' || action === 'IMPORT') {
        const items: Record<string, any>[] =
          action === 'IMPORT' ? (Array.isArray(payload) ? payload : []) : [payload || {}];

        if (items.length === 0) {
          return {
            verified: true,
            savedAt: new Date().toISOString(),
          };
        }

        const matrix = items.map((item) =>
          headers.map((h) => {
            const val = getNormalizedValue(item, h);
            return val !== undefined ? formatWriteCellValue(val) : '';
          })
        );

        const nextAppendRow = getNextAppendRowNonFormula(values, isFormulaCol);
        const nextRowColA = getNextRowInColA(values);
        const allColANonEmpty =
          !isFormulaCol[0] &&
          matrix.every((row) => String(row[0] ?? '').trim() !== '');

        let finalStartRow = nextAppendRow;
        let usedAtomicAppend = false;

        if (allColANonEmpty && nextRowColA === nextAppendRow) {
          const reserved = await atomicAppendColAReserveRows(
            spreadsheetId,
            actualTab,
            matrix.map((row) => row[0]),
            auth.token
          );
          if (reserved) {
            finalStartRow = reserved.startRow;
            usedAtomicAppend = true;
          }
        }

        const ranges = buildAppendRangesForMatrix(
          actualTab,
          finalStartRow,
          matrix,
          isFormulaCol,
          usedAtomicAppend ? 1 : 0
        );
        const writeRes = await batchUpdateValueRanges(spreadsheetId, ranges, auth.token);
        if ('fallback' in writeRes) {
          if (usedAtomicAppend) {
            throw new PortalConfigError(
              'GAS_WRITE_FAILED',
              `Gagal melengkapi seluruh kolom baris baru di [${sheetName}]. Silakan segarkan tabel untuk memeriksa baris #${finalStartRow} lalu ulangi.`,
              502
            );
          }
          return null;
        }

        const firstId = extractRecordId(items[0]) || String(matrix[0]?.[0] ?? '').trim();
        return {
          verified: true,
          savedId: firstId || undefined,
          sheetRowNumber: finalStartRow,
          savedAt: new Date().toISOString(),
        };
      }

      if (action === 'UPDATE') {
        const rowObj = payload || {};
        const targetId = extractRecordId(rowObj);
        const explicitRowNum = Number(rowObj._sheetRowNumber || 0);
        const rowIdx = findRowIndexById(values, headers, targetId, rowObj, sheetName, explicitRowNum);
        if (rowIdx === -1) {
          throw new PortalConfigError(
            'GAS_WRITE_ERROR',
            `Baris data dengan ID "${targetId}" tidak ditemukan di sheet "${sheetName}". Segarkan tabel terlebih dahulu lalu coba simpan ulang.`,
            502
          );
        }

        const sheetRowNumber = rowIdx + 1;
        const ranges = buildPartialRowUpdateRanges(
          actualTab,
          sheetRowNumber,
          headers,
          isFormulaCol,
          rowObj
        );
        const writeRes = await batchUpdateValueRanges(spreadsheetId, ranges, auth.token);
        if ('fallback' in writeRes) {
          return null;
        }

        return {
          verified: true,
          savedId: targetId || undefined,
          sheetRowNumber,
          savedAt: new Date().toISOString(),
        };
      }

      if (action === 'DELETE') {
        const sheetId = meta.sheetIds[actualTab];
        if (typeof sheetId !== 'number') return null;

        const rowPayload = payload || {};
        const deletedRowObj = rowPayload.deletedRow || rowPayload;
        const targetId = String(
          extractRecordId(rowPayload) || extractRecordId(deletedRowObj) || ''
        ).trim();
        const explicitRowNum = Number(
          rowPayload._sheetRowNumber || deletedRowObj._sheetRowNumber || 0
        );
        const rowIdx = findRowIndexById(
          values,
          headers,
          targetId,
          deletedRowObj,
          sheetName,
          explicitRowNum
        );
        if (rowIdx === -1) {
          throw new PortalConfigError(
            'GAS_WRITE_ERROR',
            `Baris data yang akan dihapus (ID: "${targetId}") tidak ditemukan di sheet "${sheetName}".`,
            502
          );
        }

        const delRes = await deleteRowsViaBatchUpdate(spreadsheetId, sheetId, [rowIdx], auth.token);
        if ('fallback' in delRes) {
          return null;
        }

        return {
          verified: true,
          savedId: targetId || undefined,
          sheetRowNumber: rowIdx + 1,
          savedAt: new Date().toISOString(),
        };
      }

      if (action === 'BULK_DELETE') {
        const sheetId = meta.sheetIds[actualTab];
        if (typeof sheetId !== 'number') return null;

        const ids: string[] = Array.isArray(payload?.ids) ? payload.ids : [];
        const deletedRows: any[] = Array.isArray(payload?.deletedRows) ? payload.deletedRows : [];
        const rowIndices = new Set<number>();

        for (const rowObj of deletedRows) {
          const idx = findRowIndexById(
            values,
            headers,
            extractRecordId(rowObj),
            rowObj,
            sheetName,
            rowObj?._sheetRowNumber
          );
          if (idx >= 1) rowIndices.add(idx);
        }
        for (const rawId of ids) {
          const idx = findRowIndexById(values, headers, String(rawId), null, sheetName, 0);
          if (idx >= 1) rowIndices.add(idx);
        }

        if (rowIndices.size === 0 && (ids.length > 0 || deletedRows.length > 0)) {
          throw new PortalConfigError(
            'GAS_WRITE_ERROR',
            `Baris yang dipilih tidak ditemukan di sheet "${sheetName}". Segarkan tabel lalu coba lagi.`,
            502
          );
        }

        const delRes = await deleteRowsViaBatchUpdate(
          spreadsheetId,
          sheetId,
          Array.from(rowIndices),
          auth.token
        );
        if ('fallback' in delRes) {
          return null;
        }

        return {
          verified: true,
          savedAt: new Date().toISOString(),
        };
      }

      // BULK_UPDATE
      const updatedRows: any[] = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.updatedRows)
        ? payload.updatedRows
        : Array.isArray(payload?.rows)
        ? payload.rows
        : [];

      const allRanges: Array<{ range: string; values: Array<Array<string | number>> }> = [];
      const missingIds: string[] = [];
      let lastRowNum: number | undefined;
      for (const rowObj of updatedRows) {
        if (!rowObj || typeof rowObj !== 'object') continue;
        const targetId = extractRecordId(rowObj);
        const rowIdx = findRowIndexById(
          values,
          headers,
          targetId,
          rowObj,
          sheetName,
          rowObj._sheetRowNumber
        );
        if (rowIdx === -1) {
          missingIds.push(targetId || '(tanpa ID)');
          continue;
        }
        const sheetRowNumber = rowIdx + 1;
        lastRowNum = sheetRowNumber;
        allRanges.push(
          ...buildPartialRowUpdateRanges(actualTab, sheetRowNumber, headers, isFormulaCol, rowObj)
        );
      }

      if (missingIds.length > 0) {
        throw new PortalConfigError(
          'GAS_WRITE_ERROR',
          `${missingIds.length} baris tidak ditemukan di sheet "${sheetName}" (${missingIds
            .slice(0, 3)
            .join(', ')}). Segarkan tabel terlebih dahulu agar pembaruan seragam tersimpan penuh.`,
          502
        );
      }

      const writeRes = await batchUpdateValueRanges(spreadsheetId, allRanges, auth.token);
      if ('fallback' in writeRes) {
        return null;
      }

      return {
        verified: true,
        sheetRowNumber: lastRowNum,
        savedAt: new Date().toISOString(),
      };
    });
  } catch (err: any) {
    if (err instanceof PortalConfigError) {
      throw err;
    }
    console.warn('[Sheets API v4 Write] Fallback to GAS:', err?.message);
    return null;
  }
}
