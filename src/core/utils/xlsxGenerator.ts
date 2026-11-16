import type * as XLSXTypes from 'xlsx';
import { HUBIN_SHEETS_BLUEPRINT, SheetDefinition } from '../types/sheetBlueprint';

export async function generateAndDownloadHubinXlsx(
  fileName: string = 'Template_Lengkap_Hubin_SMK_PGRI_2_Ponorogo.xlsx',
  customBlueprint: SheetDefinition[] = HUBIN_SHEETS_BLUEPRINT
): Promise<boolean> {
  try {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();

    customBlueprint.forEach((def) => {
      let ws: XLSXTypes.WorkSheet;

      if (def.sampleData && def.sampleData.length > 0) {
        ws = XLSX.utils.json_to_sheet(def.sampleData, { header: def.headers });
      } else {
        ws = XLSX.utils.aoa_to_sheet([def.headers]);
      }

      const colWidths = def.headers.map((h) => {
        let maxLen = h.length;
        if (def.sampleData) {
          def.sampleData.forEach((row) => {
            const valStr = String(row[h] || '');
            if (valStr.length > maxLen) maxLen = valStr.length;
          });
        }
        return { wch: Math.min(Math.max(maxLen + 3, 12), 45) };
      });
      ws['!cols'] = colWidths;

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
