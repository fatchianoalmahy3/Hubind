import React, { useEffect, useMemo, useState } from 'react';
import { FieldConfig } from '../core/types/metadata';
import {
  X,
  Upload,
  FileSpreadsheet,
  Download,
  Check,
  AlertCircle,
  Loader2,
  Layers,
} from 'lucide-react';
import type * as XLSXTypes from 'xlsx';
import { formatIndonesianDate, normalizeToIsoDate } from '../core/utils/dateHelpers';
import { formatNisVisual, stripNisSymbols } from '../core/utils/nisHelpers';
import { formatPhoneDisplay, isPhoneFieldKey } from '../core/utils/autoIdHelpers';
import { isFormulaManagedColumn } from '../core/types/sheetBlueprint';
import { MODULE_MAP } from '../core/moduleRegistry';
import {
  generateAndDownloadHubinXlsx,
  shouldForceTextCell,
} from '../core/utils/xlsxGenerator';
import { CrudLoadingOverlay, TopProgressBar } from './CrudProgressFeedback';

export interface ImportCommitOptions {
  upsertExisting: boolean;
  autoCreateMissingGuru: boolean;
}

export interface ImportCommitResult {
  created: number;
  updated: number;
  skipped: number;
  createdGuru?: number;
  createdKelas?: number;
}

export interface BatchWorkbookSheetPayload {
  sheetName: string;
  moduleId: string;
  moduleTitle: string;
  rows: Array<Record<string, any>>;
}

interface ImportExcelModalProps<T = any> {
  isOpen: boolean;
  onClose: () => void;
  fields: FieldConfig<T>[];
  moduleId?: string;
  tableName?: string;
  moduleTitle: string;
  onImport: (
    newRows: Partial<T>[],
    onProgress?: (done: number, total: number) => void
  ) => Promise<number>;
  onImportWithOptions?: (
    newRows: Partial<T>[],
    options: ImportCommitOptions,
    onProgress?: (done: number, total: number) => void
  ) => Promise<ImportCommitResult>;
  onBatchImportWorkbook?: (
    sheets: BatchWorkbookSheetPayload[],
    options: ImportCommitOptions,
    onProgress?: (label: string, done: number, total: number) => void
  ) => Promise<{
    totalCreated: number;
    totalUpdated: number;
    totalSkipped: number;
    createdGuru: number;
    processedSheets: string[];
  }>;
}

const STRING_DIGITS_KEYS = new Set(['nis', 'nik', 'nip', 'pin']);

const ROLLUP_FORMULA_KEYS = new Set([
  'kuotasiswa',
  'totalterdaftar',
  'jumlahsiswa',
  'terisi',
  'jumlahbimbingan',
  'rentangtanggal',
  'nilairatarata',
  'predikat',
]);

const TEMPLATE_KEEP_HUMAN_KEYS = new Set([
  'jurusan',
  'gurupendamping',
  'namadudi',
  'duditujuan',
  'namakakomli',
  'namasiswa',
]);

const EXCEL_COLUMN_ALIASES: Record<string, string[]> = {
  id: ['id', 'idguru', 'iddudi', 'idjurusan', 'idkelas'],
  nis: ['nis', 'nipd', 'nomorinduksiswa', 'nomoris'],
  nik: ['nik', 'noktp', 'nokk'],
  nip: ['nip', 'nipguru'],
  nama: [
    'namalengkap',
    'namasiswa',
    'namapesertadidik',
    'nama',
    'namalengkapgelar',
    'namaguru',
    'namajurusan',
    'namaprogramkeahlian',
  ],
  jenisKelamin: ['jeniskelamin', 'jk', 'kelamin', 'gender'],
  jurusan: ['jurusan', 'kompetensikeahlian', 'programkeahlian', 'idjurusan', 'kodejurusan'],
  idJurusan: ['idjurusan', 'kodejurusan'],
  kelas: ['kelas', 'rombel', 'rombonganbelajar', 'namakelas'],
  namaKelas: ['namakelas', 'kelas', 'rombel'],
  noHpSiswa: ['nohpsiswa', 'nowasiswa', 'nohp', 'nowa', 'teleponsiswa', 'hp'],
  alamatDomisili: ['alamatdomisili', 'domisili', 'alamatlengkap', 'alamat'],
  namaOrtuWali: ['namaortuwali', 'namaortu', 'namawali', 'orangtua'],
  noOrtuWali: ['noortuwali', 'noortu', 'nowaortu', 'teleponortu'],
  statusPKL: ['statuspkl', 'status'],
  namaDudi: ['namadudi', 'duditujuan', 'namaperusahaan', 'namaperusahaanindustri', 'perusahaan', 'industri'],
  dudiTujuan: ['duditujuan', 'namadudi', 'namaperusahaan', 'perusahaan'],
  bidangKeahlian: ['bidangkeahlian', 'bidangusaha', 'lingkupkerja'],
  alamat: ['alamat', 'alamatlengkap', 'alamatdudi'],
  wilayahKota: ['wilayahkota', 'kota', 'kabupaten', 'wilayah'],
  namaPemimpin: ['namapemimpin', 'namapemimpindudi', 'pimpinan', 'direktur'],
  namaPic: ['namapic', 'namapicpembimbingdudi', 'pic', 'pembimbingindustri'],
  noTelpDudi: ['notelpdudi', 'notelpwadudi', 'kontakpic', 'telepondudi', 'nohpdudi'],
  guruPendamping: ['gurupendamping', 'gurupendampingdefault', 'pembimbing', 'petugasmonitoring', 'namaguru'],
  kuotaMaksimal: ['kuotamaks', 'kuotamaksimal', 'kuota'],
  statusKerjasama: ['statuskerjasama', 'mou', 'statusmou'],
  kontakWA: ['kontakwa', 'nowa', 'nowhatsapp', 'nohp', 'telepon'],
  peranUtama: ['peranutama', 'peran', 'jabatan'],
  pin: ['pin', 'pinportal', 'pinportalmonitoring'],
  namaKakomli: ['namakakomli', 'kakomli'],
  kode: ['kode', 'kodejurusan'],
  tingkat: ['tingkat'],
  waliKelas: ['walikelas', 'namawalikelas', 'walas'],
  kontakWalas: ['kontakwalas', 'kontakwawalas', 'nowawalas'],
  tanggalBerangkat: ['tanggalberangkat', 'tglberangkat', 'tglberangkatmulai', 'tanggalmulai'],
  tanggalRencanaTarik: ['tanggalrencanatarik', 'tglrencanatarik', 'tanggalselesai'],
  statusPenempatan: ['statuspenempatan', 'statuspkl', 'status'],
  catatanPenempatan: ['catatanpenempatan', 'catatanriwayatpenempatan', 'catatan'],
  namaSiswa: ['namasiswa', 'namalengkap', 'nama'],
  statusIzinOrtu: ['statusizinortu', 'kategoriizin', 'jenisizin', 'izin', 'keteranganizin', 'status'],
  tanggalMulaiIzin: ['tanggalmulaiizin', 'tglmulaiizin', 'mulaiizin', 'tanggalmulai', 'tglmulai'],
  tanggalSelesaiIzin: ['tanggalselesaiizin', 'tglselesaiizin', 'selesaiizin', 'tanggalselesai', 'tglselesai'],
  catatanPerizinan: ['catatanperizinan', 'keterangancatatanizin', 'keterangan', 'catatan', 'alasanizin'],
  linkBuktiBalasan: ['linkbuktibalasan', 'linkbuktisuratfoto', 'linkbukti', 'bukti'],
};

const BULK_REQUIRED_KEYS_BY_MODULE: Record<string, string[]> = {
  siswa: ['nis', 'nama'],
  dudi: ['namaDudi'],
  guru: ['nama'],
  jurusan: ['nama'],
  kelas: ['namaKelas'],
  siswa_pkl: ['nis', 'namaDudi'],
  perizinan: ['nis', 'statusIzinOrtu'],
};

const TOPOLOGICAL_MODULE_ORDER = ['guru', 'jurusan', 'kelas', 'dudi', 'siswa', 'siswa_pkl'] as const;

const SHEET_NAME_TO_MODULE_ID: Record<string, string> = {
  mastergurupendamping: 'guru',
  gurupendamping: 'guru',
  guru: 'guru',
  masterjurusan: 'jurusan',
  jurusan: 'jurusan',
  masterkelaswalas: 'kelas',
  masterkelas: 'kelas',
  kelas: 'kelas',
  masterdudi: 'dudi',
  mitradudi: 'dudi',
  dudi: 'dudi',
  mastersiswaxi: 'siswa',
  mastersiswa: 'siswa',
  siswa: 'siswa',
  dataplotting: 'siswa_pkl',
  plottingpemberangkatan: 'siswa_pkl',
  datasiswapkl: 'siswa_pkl',
  siswapkl: 'siswa_pkl',
  penempatan: 'siswa_pkl',
  dataperizinanpkl: 'perizinan',
  perizinanpkl: 'perizinan',
  perizinan: 'perizinan',
  nilaidansertifikat: 'sertifikat',
};

function normalizeCol(str: string): string {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function cleanDigitString(rawVal: unknown, preserveLeadingZero = true): string {
  const s = String(rawVal ?? '').trim();
  if (!s) return '';
  const noTrailingDecimal = s.replace(/\.0+$/, '');
  if (preserveLeadingZero) {
    return noTrailingDecimal.replace(/[^0-9]/g, '') || noTrailingDecimal;
  }
  return noTrailingDecimal;
}

function resolveModuleIdForExcelSheet(sheetName: string): string | null {
  const norm = normalizeCol(sheetName);
  if (SHEET_NAME_TO_MODULE_ID[norm]) return SHEET_NAME_TO_MODULE_ID[norm];
  for (const [pattern, modId] of Object.entries(SHEET_NAME_TO_MODULE_ID)) {
    if (norm.includes(pattern) || pattern.includes(norm)) {
      return modId;
    }
  }
  return null;
}

interface ParsedSheetResult {
  rows: Array<Record<string, any>>;
  matchedCount: number;
  blankCount: number;
  invalidCount: number;
  totalColumns: number;
}

function parseWorksheetForModule<T extends Record<string, any>>(
  XLSX: typeof XLSXTypes,
  worksheet: XLSXTypes.WorkSheet,
  fields: FieldConfig<T>[],
  moduleId?: string
): ParsedSheetResult {
  const rawJson = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
    defval: '',
    raw: false,
  });

  const importableCols = fields.filter((f) => {
    const keyNorm = normalizeCol(String(f.key));
    if (f.type === 'image') return false;
    if (ROLLUP_FORMULA_KEYS.has(keyNorm)) return false;
    return f.isTableColumn || keyNorm === 'id' || keyNorm.startsWith('id');
  });

  if (rawJson.length === 0) {
    return {
      rows: [],
      matchedCount: 0,
      blankCount: 0,
      invalidCount: 0,
      totalColumns: importableCols.length,
    };
  }

  const rawHeaderKeys = Object.keys(rawJson[0] || {});
  const usedHeaders = new Set<string>();
  const keyMap: Record<string, string> = {};

  // Pass 1: Exact key/label/alias match
  importableCols.forEach((col) => {
    const colKey = String(col.key);
    const candidates = new Set<string>([
      normalizeCol(colKey),
      normalizeCol(col.label),
      ...(EXCEL_COLUMN_ALIASES[colKey] || []),
    ]);
    const exactMatch = rawHeaderKeys.find((hk) => {
      if (usedHeaders.has(hk)) return false;
      const hkClean = normalizeCol(hk);
      return hkClean !== '' && candidates.has(hkClean);
    });
    if (exactMatch) {
      keyMap[colKey] = exactMatch;
      usedHeaders.add(exactMatch);
    }
  });

  // Pass 2: Controlled substring match on unused headers
  importableCols.forEach((col) => {
    const colKey = String(col.key);
    if (keyMap[colKey]) return;
    const targetClean = normalizeCol(colKey);
    const labelClean = normalizeCol(col.label);
    const fuzzyMatch = rawHeaderKeys.find((hk) => {
      if (usedHeaders.has(hk)) return false;
      const hkClean = normalizeCol(hk);
      if (hkClean.length < 3) return false;
      const matchesTarget =
        targetClean.length >= 3 &&
        (hkClean.includes(targetClean) || targetClean.includes(hkClean));
      const matchesLabel =
        labelClean.length >= 3 &&
        (hkClean.includes(labelClean) || labelClean.includes(hkClean));
      return matchesTarget || matchesLabel;
    });
    if (fuzzyMatch) {
      keyMap[colKey] = fuzzyMatch;
      usedHeaders.add(fuzzyMatch);
    }
  });

  const matchedCount = Object.keys(keyMap).length;
  if (matchedCount === 0) {
    return {
      rows: [],
      matchedCount: 0,
      blankCount: 0,
      invalidCount: 0,
      totalColumns: importableCols.length,
    };
  }

  const customRequired = moduleId ? BULK_REQUIRED_KEYS_BY_MODULE[moduleId] : undefined;
  const requiredCols = customRequired
    ? importableCols.filter((c) => customRequired.includes(String(c.key)))
    : importableCols.filter((c) => c.validation?.required && !c.disabled);

  const rows: Array<Record<string, any>> = [];
  let blankCount = 0;
  let invalidCount = 0;

  for (const rowObj of rawJson) {
    const hasAnyValue = Object.values(rowObj).some((v) => String(v ?? '').trim() !== '');
    if (!hasAnyValue) {
      blankCount++;
      continue;
    }

    const mapped: Record<string, any> = {};
    let hasMappedContent = false;

    importableCols.forEach((col) => {
      const colKey = String(col.key);
      const matchedHeader = keyMap[colKey];
      if (!matchedHeader) return;
      const rawVal = rowObj[matchedHeader];
      const trimmedRaw = String(rawVal ?? '').trim();
      if (trimmedRaw !== '') hasMappedContent = true;

      if (col.type === 'number') {
        const numericClean = trimmedRaw.replace(/[^\d.,-]/g, '').replace(',', '.');
        const numVal = numericClean === '' ? 0 : Number(numericClean);
        mapped[colKey] = Number.isFinite(numVal) ? numVal : 0;
      } else if (col.type === 'date') {
        mapped[colKey] = normalizeToIsoDate(trimmedRaw) || trimmedRaw;
      } else if (colKey === 'nis') {
        mapped[colKey] = stripNisSymbols(trimmedRaw) || trimmedRaw;
      } else if (isPhoneFieldKey(colKey)) {
        const cleanedPhone = trimmedRaw.replace(/^'+/, '');
        mapped[colKey] = cleanedPhone ? formatPhoneDisplay(cleanedPhone, '') : '';
      } else if (STRING_DIGITS_KEYS.has(colKey.toLowerCase())) {
        mapped[colKey] = cleanDigitString(trimmedRaw.replace(/^'+/, ''), true);
      } else {
        mapped[colKey] = trimmedRaw;
      }
    });

    if (!hasMappedContent) {
      blankCount++;
      continue;
    }

    const missingRequired = requiredCols.some((reqCol) => {
      const v = mapped[String(reqCol.key)];
      return v === undefined || v === null || String(v).trim() === '';
    });
    if (missingRequired) {
      invalidCount++;
      continue;
    }

    rows.push(mapped);
  }

  return {
    rows,
    matchedCount,
    blankCount,
    invalidCount,
    totalColumns: importableCols.length,
  };
}

export function ImportExcelModal<T extends Record<string, any>>({
  isOpen,
  onClose,
  fields,
  moduleId,
  tableName,
  moduleTitle,
  onImport,
  onImportWithOptions,
  onBatchImportWorkbook,
}: ImportExcelModalProps<T>) {
  const [file, setFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<XLSXTypes.WorkBook | null>(null);
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [matchedColumnCount, setMatchedColumnCount] = useState<number>(0);
  const [skippedBlankCount, setSkippedBlankCount] = useState<number>(0);
  const [skippedInvalidCount, setSkippedInvalidCount] = useState<number>(0);
  const [importProgress, setImportProgress] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number | undefined>(undefined);
  const [importing, setImporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resultBanner, setResultBanner] = useState<string | null>(null);

  const [upsertExisting, setUpsertExisting] = useState<boolean>(true);
  const [autoCreateMissingGuru, setAutoCreateMissingGuru] = useState<boolean>(true);
  const [importAllDetectedSheets, setImportAllDetectedSheets] = useState<boolean>(false);
  const [detectedBatchSheets, setDetectedBatchSheets] = useState<BatchWorkbookSheetPayload[]>([]);

  const templateColumns = useMemo(
    () =>
      fields.filter((f) => {
        if (!f.isTableColumn || f.type === 'image' || f.disabled) return false;
        const kNorm = normalizeCol(String(f.key));
        if (ROLLUP_FORMULA_KEYS.has(kNorm)) return false;
        if (tableName && isFormulaManagedColumn(tableName, String(f.key))) {
          return TEMPLATE_KEEP_HUMAN_KEYS.has(kNorm);
        }
        return true;
      }),
    [fields, tableName]
  );

  const validColumns = useMemo(
    () => fields.filter((f) => f.isTableColumn && f.type !== 'image'),
    [fields]
  );
  const previewColumns = useMemo(() => templateColumns.slice(0, 4), [templateColumns]);

  const supportsGuruAutoCreate =
    moduleId === 'dudi' ||
    moduleId === 'siswa_pkl' ||
    moduleId === 'jurusan' ||
    (importAllDetectedSheets &&
      detectedBatchSheets.some((s) =>
        s.moduleId === 'dudi' || s.moduleId === 'siswa_pkl' || s.moduleId === 'jurusan'
      ));

  useEffect(() => {
    if (!isOpen) {
      setFile(null);
      setWorkbook(null);
      setAvailableSheets([]);
      setSelectedSheet('');
      setParsedRows([]);
      setMatchedColumnCount(0);
      setSkippedBlankCount(0);
      setSkippedInvalidCount(0);
      setDetectedBatchSheets([]);
      setImportAllDetectedSheets(false);
      setErrorMsg(null);
      setResultBanner(null);
    }
  }, [isOpen, moduleId]);

  if (!isOpen) return null;

  const downloadSingleTemplate = async () => {
    try {
      const XLSX = await import('xlsx');
      const headers = templateColumns.map((c) => c.label);
      const sampleRow = templateColumns.map((c) => {
        const k = String(c.key).toLowerCase();
        if (k === 'nis') return '23241001001';
        if (k === 'nik') return '3502010101080001';
        if (isPhoneFieldKey(k)) return '081234567890';
        if (c.type === 'number') return 4;
        if (c.type === 'select' && c.options?.length) return String(c.options[0].value);
        if (c.type === 'date') return '2026-11-10';
        return c.placeholder || `Contoh ${c.label}`;
      });

      const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
      const rangeRef = ws['!ref'];
      if (rangeRef) {
        const range = XLSX.utils.decode_range(rangeRef);
        for (let c = 0; c < templateColumns.length; c++) {
          const key = String(templateColumns[c].key);
          if (!shouldForceTextCell(key)) continue;
          const addr = XLSX.utils.encode_cell({ r: 1, c });
          if (ws[addr]) {
            ws[addr].t = 's';
            ws[addr].v = String(ws[addr].v ?? '');
            ws[addr].z = '@';
          }
        }
        ws['!cols'] = templateColumns.map((c) => ({
          wch: Math.max(18, c.label.length + 4),
        }));
      }
      const wb = XLSX.utils.book_new();
      const safeSheetName = moduleTitle.replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'Template';
      XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
      XLSX.writeFile(wb, `Template_Import_${moduleTitle.replace(/\s+/g, '_')}.xlsx`);
    } catch (err: any) {
      setErrorMsg('Gagal membuat template Excel: ' + (err?.message || 'Error'));
    }
  };

  const downloadMasterWorkbook = async () => {
    const ok = await generateAndDownloadHubinXlsx(
      'Workbook_Master_Hubin_SMK_PGRI_2_Ponorogo.xlsx',
      undefined,
      { excludeFormulaRollups: true, masterImportOnly: true }
    );
    if (!ok) {
      setErrorMsg('Gagal membuat Workbook Master 6-Sheet.');
    }
  };

  const parseSheetData = async (wb: XLSXTypes.WorkBook, sheetName: string) => {
    try {
      const worksheet = wb.Sheets[sheetName];
      if (!worksheet) return;
      const XLSX = await import('xlsx');
      const result = parseWorksheetForModule(XLSX, worksheet, fields, moduleId);

      setMatchedColumnCount(result.matchedCount);
      setSkippedBlankCount(result.blankCount);
      setSkippedInvalidCount(result.invalidCount);
      setParsedRows(result.rows);

      if (result.matchedCount === 0) {
        setErrorMsg(
          `Header kolom di sheet [${sheetName}] tidak cocok dengan kolom modul ${moduleTitle}. Gunakan tombol Template .xlsx untuk format resmi.`
        );
      } else if (result.rows.length === 0) {
        setErrorMsg(
          `Tidak ada baris valid yang siap diimpor (${result.invalidCount} baris tidak memenuhi kolom wajib).`
        );
      } else {
        setErrorMsg(null);
      }
    } catch (err: any) {
      setErrorMsg('Gagal memproses sheet: ' + (err?.message || 'Error'));
    }
  };

  const scanBatchWorkbookSheets = (
    XLSX: typeof XLSXTypes,
    wb: XLSXTypes.WorkBook
  ): BatchWorkbookSheetPayload[] => {
    if (!onBatchImportWorkbook || wb.SheetNames.length <= 1) return [];
    const foundByModule = new Map<string, BatchWorkbookSheetPayload>();

    for (const sName of wb.SheetNames) {
      const detectedModId = resolveModuleIdForExcelSheet(sName);
      if (!detectedModId) continue;
      const entry = MODULE_MAP[detectedModId];
      if (!entry) continue;
      const ws = wb.Sheets[sName];
      if (!ws) continue;

      const parsed = parseWorksheetForModule(XLSX, ws, entry.metadata.fields, detectedModId);
      if (parsed.rows.length > 0 && !foundByModule.has(detectedModId)) {
        foundByModule.set(detectedModId, {
          sheetName: sName,
          moduleId: detectedModId,
          moduleTitle: entry.metadata.title,
          rows: parsed.rows,
        });
      }
    }

    const ordered: BatchWorkbookSheetPayload[] = [];
    for (const modId of TOPOLOGICAL_MODULE_ORDER) {
      const item = foundByModule.get(modId);
      if (item) ordered.push(item);
    }
    return ordered;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setErrorMsg(null);
    setResultBanner(null);

    try {
      const XLSX = await import('xlsx');
      const buffer = await uploadedFile.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      setWorkbook(wb);
      setAvailableSheets(wb.SheetNames);

      const batchDetected = scanBatchWorkbookSheets(XLSX, wb);
      setDetectedBatchSheets(batchDetected);
      setImportAllDetectedSheets(batchDetected.length > 1);

      const bestSheet =
        wb.SheetNames.find(
          (s) =>
            (moduleId && resolveModuleIdForExcelSheet(s) === moduleId) ||
            normalizeCol(s).includes(normalizeCol(moduleTitle)) ||
            normalizeCol(moduleTitle).includes(normalizeCol(s))
        ) || wb.SheetNames[0];

      setSelectedSheet(bestSheet);
      await parseSheetData(wb, bestSheet);
    } catch (err: any) {
      setErrorMsg('Gagal membaca file Excel (.xlsx/.csv): ' + (err?.message || 'Error'));
    }
  };

  const handleSheetSwitch = (sheetName: string) => {
    setSelectedSheet(sheetName);
    if (workbook) {
      void parseSheetData(workbook, sheetName);
    }
  };

  const totalBatchRows = detectedBatchSheets.reduce((sum, s) => sum + s.rows.length, 0);
  const canCommitBatch = importAllDetectedSheets && detectedBatchSheets.length > 1 && Boolean(onBatchImportWorkbook);

  const handleCommitImport = async () => {
    if (!canCommitBatch && parsedRows.length === 0) return;
    setImporting(true);
    setErrorMsg(null);
    setResultBanner(null);

    try {
      if (canCommitBatch && onBatchImportWorkbook) {
        setProgressPercent(5);
        setImportProgress(`Memproses ${detectedBatchSheets.length} sheet terdeteksi...`);
        const res = await onBatchImportWorkbook(
          detectedBatchSheets,
          { upsertExisting, autoCreateMissingGuru },
          (label, done, total) => {
            const pct = total > 0 ? Math.round((done / total) * 100) : 100;
            setProgressPercent(pct);
            setImportProgress(`${label} (${done}/${total})`);
          }
        );
        if (res.totalCreated === 0 && res.totalUpdated === 0) {
          setErrorMsg('Tidak ada perubahan baru yang disimpan (seluruh baris sama / dilewati).');
          return;
        }
        onClose();
        return;
      }

      setProgressPercent(5);
      setImportProgress(`Menyiapkan ${parsedRows.length} baris untuk Cloud Server...`);

      if (onImportWithOptions) {
        const res = await onImportWithOptions(
          parsedRows,
          { upsertExisting, autoCreateMissingGuru },
          (done, total) => {
            const pct = total > 0 ? Math.round((done / total) * 100) : 100;
            setProgressPercent(pct);
            setImportProgress(`Mengirim ${done} / ${total} baris ke Cloud Server...`);
          }
        );
        if (res.created === 0 && res.updated === 0) {
          setErrorMsg(
            'Tidak ada data baru atau pembaruan yang tersimpan (seluruh data sudah sama atau dilewati).'
          );
          return;
        }
        onClose();
        return;
      }

      const importedCount = await onImport(parsedRows, (done, total) => {
        const pct = total > 0 ? Math.round((done / total) * 100) : 100;
        setProgressPercent(pct);
        setImportProgress(`Mengirim ${done} / ${total} baris ke Cloud Server...`);
      });
      if (importedCount === 0) {
        setErrorMsg('Tidak ada baris baru yang diimpor (kemungkinan seluruh data sudah terdaftar / duplikat).');
        return;
      }
      onClose();
    } catch (err: any) {
      setErrorMsg('Gagal mengimpor data: ' + (err?.message || 'Error'));
    } finally {
      setImporting(false);
      setImportProgress('');
      setProgressPercent(undefined);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={!importing ? onClose : undefined}
    >
      <div
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 rounded-lg text-emerald-700">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">
                Import Excel Terintegrasi ({moduleTitle})
              </h3>
              <p className="text-xs text-slate-500">
                Mendukung 1-File Workbook (6 Sheet Sekaligus) &amp; sinkronisasi relasi otomatis
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={importing}
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <TopProgressBar
          active={importing}
          progressPercent={progressPercent}
          label="Mengimpor & menautkan relasi data ke Cloud Server"
        />

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Download Template banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-900">
            <div className="text-xs">
              <div className="font-bold">Butuh format Excel siap isi (tanpa kolom rumus)?</div>
              <div className="text-blue-700 mt-0.5">
                Unduh template modul ini atau Workbook Master 6-Sheet untuk import tahun ajaran baru
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={downloadSingleTemplate}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Template .xlsx</span>
              </button>
              {onBatchImportWorkbook && (
                <button
                  type="button"
                  onClick={downloadMasterWorkbook}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-blue-100/60 border border-blue-300 text-blue-800 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                  title="1 file Excel berisi 6 sheet setup tahun ajaran baru (Guru, Jurusan, Kelas, DUDI, Siswa, Plotting)"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Workbook 6-Sheet</span>
                </button>
              )}
            </div>
          </div>

          {/* Upload Dropzone */}
          <div className="border-2 border-dashed border-slate-300 rounded-xl p-5 text-center hover:border-blue-500 hover:bg-slate-50/50 transition-all cursor-pointer relative">
            <input
              type="file"
              accept=".xlsx, .xls, .csv, text/csv"
              onChange={handleFileChange}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
            <div className="flex flex-col items-center">
              <div className="p-2.5 bg-slate-100 rounded-full text-slate-500 mb-2">
                <Upload className="w-5 h-5" />
              </div>
              <span className="text-sm font-semibold text-slate-700">
                {file ? file.name : 'Klik atau seret file .xlsx / .csv ke sini'}
              </span>
              <span className="text-xs text-slate-400 mt-1">
                Format Excel (.xlsx / .xls) dianjurkan agar NIS, NIK, dan No. HP tidak berubah
              </span>
            </div>
          </div>

          {/* Options Checkboxes */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5 text-xs">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={upsertExisting}
                onChange={(e) => setUpsertExisting(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
              <div>
                <div className="font-semibold text-slate-800">
                  Perbarui data yang sudah ada (Mode Upsert)
                </div>
                <div className="text-[11px] text-slate-500">
                  Jika NIS / Nama DUDI / Nama Kelas / Nama Guru sudah terdaftar, data yang terisi di Excel akan memperbarui baris lama tanpa membuat duplikat.
                </div>
              </div>
            </label>

            {supportsGuruAutoCreate && (
              <label className="flex items-start gap-2.5 cursor-pointer select-none pt-2 border-t border-slate-200/80">
                <input
                  type="checkbox"
                  checked={autoCreateMissingGuru}
                  onChange={(e) => setAutoCreateMissingGuru(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
                <div>
                  <div className="font-semibold text-slate-800">
                    Otomatis daftarkan Guru Pendamping baru ke Master Guru
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Jika nama guru pada kolom Pembimbing / Kakomli belum ada di Master Guru, sistem akan mendaftarkannya otomatis lalu menautkan ID-nya.
                  </div>
                </div>
              </label>
            )}
          </div>

          {/* Multi-Sheet Batch Detection */}
          {detectedBatchSheets.length > 1 && onBatchImportWorkbook && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2.5 text-xs">
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={importAllDetectedSheets}
                  onChange={(e) => setImportAllDetectedSheets(e.target.checked)}
                  className="mt-0.5 rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
                <div className="flex-1">
                  <div className="font-bold text-emerald-950">
                    Import Semua Sheet Terdeteksi Sekaligus ({detectedBatchSheets.length} Sheet · {totalBatchRows} Baris)
                  </div>
                  <div className="text-[11px] text-emerald-800 mt-0.5">
                    Diurutkan otomatis sesuai ketergantungan relasi tanpa perlu pindah menu berulang:
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {detectedBatchSheets.map((item, idx) => (
                      <span
                        key={item.moduleId}
                        className="px-2 py-0.5 bg-white border border-emerald-200 rounded-md text-[11px] font-semibold text-emerald-900"
                      >
                        {idx + 1}. {item.sheetName} ({item.rows.length})
                      </span>
                    ))}
                  </div>
                </div>
              </label>
            </div>
          )}

          {errorMsg && !canCommitBatch && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {resultBanner && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-medium">
              {resultBanner}
            </div>
          )}

          {/* Single-Sheet Selector when not using batch mode */}
          {!canCommitBatch && availableSheets.length > 1 && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3 text-xs">
              <div>
                <span className="font-bold text-slate-800 block">
                  File Excel memiliki {availableSheets.length} Sheet:
                </span>
                <span className="text-slate-500 text-[11px]">
                  Pilih sheet data yang ingin di-import ke modul {moduleTitle}
                </span>
              </div>
              <select
                value={selectedSheet}
                onChange={(e) => handleSheetSwitch(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 shadow-2xs cursor-pointer focus:ring-2 focus:ring-blue-500"
              >
                {availableSheets.map((s) => (
                  <option key={s} value={s}>
                    Sheet: {s}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Preview of Parsed Rows (single sheet mode) */}
          {!canCommitBatch && parsedRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 font-semibold">
                <span>
                  Siap Import ({parsedRows.length} baris
                  {selectedSheet ? ` · Sheet: ${selectedSheet}` : ''})
                </span>
                <span className="text-emerald-700 font-bold">
                  {matchedColumnCount}/{validColumns.length} kolom terpetakan
                </span>
              </div>
              {(skippedBlankCount > 0 || skippedInvalidCount > 0) && (
                <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                  Dilewati otomatis:{' '}
                  {skippedBlankCount > 0 ? `${skippedBlankCount} baris kosong` : ''}
                  {skippedBlankCount > 0 && skippedInvalidCount > 0 ? ', ' : ''}
                  {skippedInvalidCount > 0
                    ? `${skippedInvalidCount} baris kolom wajib tidak lengkap`
                    : ''}
                  .
                </div>
              )}
              <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-40 text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      {previewColumns.map((c) => (
                        <th key={String(c.key)} className="p-2 border-b whitespace-nowrap">
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedRows.slice(0, 5).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        {previewColumns.map((c) => (
                          <td key={String(c.key)} className="p-2 text-slate-700 whitespace-nowrap">
                            {String(c.key) === 'nis'
                              ? formatNisVisual(row[c.key])
                              : c.type === 'date'
                              ? formatIndonesianDate(row[c.key])
                              : row[c.key] || '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
          <div className="text-xs text-slate-500 truncate">
            {importProgress ||
              (canCommitBatch
                ? `Mode Batch ${detectedBatchSheets.length} Sheet · ${totalBatchRows} baris siap diproses`
                : parsedRows.length > 150
                ? 'Akan dikirim bertahap per 150 baris'
                : '')}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={importing}
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-40"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleCommitImport}
              disabled={(!canCommitBatch && parsedRows.length === 0) || importing}
              className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold shadow-xs disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              {importing ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              ) : (
                <Check className="w-4 h-4 shrink-0" />
              )}
              <span>
                {importing
                  ? 'Mengimpor...'
                  : canCommitBatch
                  ? `Import ${detectedBatchSheets.length} Sheet (${totalBatchRows} Baris)`
                  : `Import ${parsedRows.length} Baris Data`}
              </span>
            </button>
          </div>
        </div>

        <CrudLoadingOverlay
          visible={importing}
          tone="emerald"
          title="Mengimpor Data ke Cloud Server..."
          subtitle="Relasi ID dan perhitungan otomatis sedang disinkronkan."
          progressText={importProgress}
          progressPercent={progressPercent}
        />
      </div>
    </div>
  );
}
