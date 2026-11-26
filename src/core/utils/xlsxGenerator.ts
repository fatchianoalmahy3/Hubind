import type * as XLSXTypes from 'xlsx';
import {
  HUBIN_SHEETS_BLUEPRINT,
  SheetDefinition,
  isFormulaManagedColumn,
} from '../types/sheetBlueprint';
import { isPhoneFieldKey } from './autoIdHelpers';

export const MASTER_IMPORT_WORKBOOK_SHEET_NAMES = [
  'Master_Guru_Pendamping',
  'Master_Jurusan',
  'Master_Kelas_Walas',
  'Master_DUDI',
  'Master_Siswa_XI',
  'data_plotting',
] as const;

const TEXT_PRESERVED_KEYS = new Set([
  'nis',
  'nik',
  'nip',
  'nipkakomli',
  'pin',
  'nopengajuan',
  'noperizinan',
  'idperizinan',
  'idpenempatan',
  'noseriblangko',
  'nosuratpermohonan',
  'nomorsurat',
]);

function normalizeCellKey(raw: string): string {
  return String(raw || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function shouldForceTextCell(keyOrHeader: string): boolean {
  const norm = normalizeCellKey(keyOrHeader);
  if (TEXT_PRESERVED_KEYS.has(norm)) return true;
  if (isPhoneFieldKey(norm)) return true;
  if (
    norm.includes('hp') ||
    norm.includes('wa') ||
    norm.includes('telp') ||
    norm.includes('kontak') ||
    norm.includes('ortu')
  ) {
    return !norm.includes('nama');
  }
  return false;
}

function applyTextFormatsAndWidths(
  XLSX: typeof XLSXTypes,
  ws: XLSXTypes.WorkSheet,
  headers: string[],
  keysForFormat: string[],
  rowMatrix: Array<Array<string | number>>
): void {
  const rangeRef = ws['!ref'];
  if (rangeRef) {
    const range = XLSX.utils.decode_range(rangeRef);
    for (let c = range.s.c; c <= range.e.c; c++) {
      const colKey = keysForFormat[c] || headers[c] || '';
      if (!shouldForceTextCell(colKey)) continue;
      for (let r = 1; r <= range.e.r; r++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (!cell) continue;
        const val = cell.v === undefined || cell.v === null ? '' : String(cell.v);
        cell.t = 's';
        cell.v = val;
        cell.z = '@';
      }
    }
  }

  ws['!cols'] = headers.map((h, colIdx) => {
    let maxLen = h.length;
    for (let r = 0; r < rowMatrix.length; r++) {
      const len = String(rowMatrix[r]?.[colIdx] ?? '').length;
      if (len > maxLen) maxLen = len;
    }
    return { wch: Math.min(Math.max(maxLen + 4, 14), 48) };
  });
}

const TEMPLATE_HUMAN_RELATION_KEEP = new Set([
  'gurupendamping',
  'namadudi',
  'duditujuan',
  'jurusan',
  'namakakomli',
  'namasiswa',
]);

const TEMPLATE_HIDDEN_INTERNAL_IDS = new Set([
  'id',
  'idkakomli',
  'idjurusan',
  'iddudi',
  'idgurupendamping',
  'idpenempatan',
]);

export async function generateAndDownloadHubinXlsx(
  fileName: string = 'Template_Lengkap_Hubin_SMK_PGRI_2_Ponorogo.xlsx',
  customBlueprint: SheetDefinition[] = HUBIN_SHEETS_BLUEPRINT,
  options: { excludeFormulaRollups?: boolean; masterImportOnly?: boolean } = {}
): Promise<boolean> {
  try {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    const excludeRollups = options.excludeFormulaRollups !== false;
    const blueprint = options.masterImportOnly
      ? MASTER_IMPORT_WORKBOOK_SHEET_NAMES.map((name) =>
          customBlueprint.find((b) => b.sheetName === name)
        ).filter((b): b is SheetDefinition => Boolean(b))
      : customBlueprint;

    blueprint.forEach((def) => {
      const exportHeaders = excludeRollups
        ? def.headers.filter((h) => {
            const norm = normalizeCellKey(h);
            if (TEMPLATE_HIDDEN_INTERNAL_IDS.has(norm)) {
              // On Master_Siswa_XI keep ID_Jurusan as human-readable "Jurusan" column in template
              return false;
            }
            if (isFormulaManagedColumn(def.sheetName, h)) {
              return TEMPLATE_HUMAN_RELATION_KEEP.has(norm);
            }
            return true;
          })
        : def.headers;

      const finalHeaders =
        def.sheetName === 'Master_Siswa_XI' && excludeRollups
          ? (() => {
              const idx = exportHeaders.findIndex((h) => normalizeCellKey(h) === 'jenis_kelamin'.replace(/_/g, ''));
              const out = [...exportHeaders];
              const targetIdx = idx !== -1 ? idx + 1 : 4;
              out.splice(targetIdx, 0, 'Jurusan');
              return out;
            })()
          : exportHeaders;

      const sampleRows =
        def.sampleData && def.sampleData.length > 0
          ? def.sampleData.map((row) => finalHeaders.map((h) => row[h] ?? ''))
          : [];
      const aoa: Array<Array<string | number>> = [finalHeaders, ...sampleRows];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      applyTextFormatsAndWidths(XLSX, ws, finalHeaders, finalHeaders, sampleRows);

      const sanitizedName = def.sheetName.substring(0, 31);
      XLSX.utils.book_append_sheet(workbook, ws, sanitizedName);
    });

    XLSX.writeFile(workbook, fileName);
    return true;
  } catch (error) {
    console.error('Failed to generate XLSX file:', error);
    return false;
  }
}

export interface ExportColumnDef {
  key: string;
  label: string;
}

export async function exportModuleRowsToXlsx(params: {
  rows: Array<Record<string, any>>;
  columns: ExportColumnDef[];
  sheetName: string;
  fileName: string;
}): Promise<void> {
  const { rows, columns, sheetName, fileName } = params;
  if (!Array.isArray(rows) || rows.length === 0 || columns.length === 0) return;

  const XLSX = await import('xlsx');
  const headers = columns.map((c) => c.label);
  const keys = columns.map((c) => c.key);

  const bodyMatrix: Array<Array<string | number>> = rows.map((row) =>
    columns.map((col) => {
      const val = row?.[col.key];
      if (val === null || val === undefined) return '';
      if (shouldForceTextCell(col.key) || shouldForceTextCell(col.label)) {
        return String(val).trim();
      }
      if (typeof val === 'number') return val;
      return String(val);
    })
  );

  const ws = XLSX.utils.aoa_to_sheet([headers, ...bodyMatrix]);
  applyTextFormatsAndWidths(XLSX, ws, headers, keys, bodyMatrix);

  const wb = XLSX.utils.book_new();
  const safeSheet = sheetName.replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'Data';
  XLSX.utils.book_append_sheet(wb, ws, safeSheet);
  XLSX.writeFile(wb, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`);
}

export async function downloadSingleSheetCsv(
  sheetName: string,
  headers: string[],
  data: any[]
): Promise<void> {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(data, { header: headers });
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${sheetName}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

