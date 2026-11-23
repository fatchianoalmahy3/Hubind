import React, { useState } from 'react';
import { FieldConfig } from '../core/types/metadata';
import { X, Upload, FileSpreadsheet, Download, Check, AlertCircle } from 'lucide-react';
import type * as XLSXTypes from 'xlsx';
import { formatIndonesianDate, normalizeToIsoDate } from '../core/utils/dateHelpers';
import { formatNisVisual, stripNisSymbols } from '../core/utils/nisHelpers';
import { formatPhoneDisplay, isPhoneFieldKey } from '../core/utils/autoIdHelpers';

interface ImportExcelModalProps<T = any> {
  isOpen: boolean;
  onClose: () => void;
  fields: FieldConfig<T>[];
  moduleTitle: string;
  onImport: (newRows: Partial<T>[]) => Promise<number>;
}

const STRING_DIGITS_KEYS = new Set(['nis', 'nik', 'nip', 'pin']);

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

export function ImportExcelModal<T extends Record<string, any>>({
  isOpen,
  onClose,
  fields,
  moduleTitle,
  onImport,
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
  const [importing, setImporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const validColumns = fields.filter((f) => f.isTableColumn && f.type !== 'image' && !f.disabled);
  const previewColumns = validColumns.slice(0, 4);

  const downloadTemplate = async () => {
    try {
      const XLSX = await import('xlsx');
      const headers = validColumns.map((c) => c.label);
      const sampleRow = validColumns.map((c) => {
        const k = String(c.key).toLowerCase();
        if (k === 'nis') return '23241/001/001';
        if (k === 'nik') return "'3502010101080001";
        if (isPhoneFieldKey(k)) return '081234567890';
        if (c.type === 'number') return 10;
        if (c.type === 'select' && c.options?.length) return String(c.options[0].value);
        if (c.type === 'date') return '2026-11-10';
        return c.placeholder || `Contoh ${c.label}`;
      });

      const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
      ws['!cols'] = validColumns.map((c) => ({ wch: Math.max(18, c.label.length + 4) }));
      const wb = XLSX.utils.book_new();
      const safeSheetName = moduleTitle.replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'Template';
      XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
      XLSX.writeFile(wb, `Template_Import_${moduleTitle.replace(/\s+/g, '_')}.xlsx`);
    } catch (err: any) {
      setErrorMsg('Gagal membuat template Excel: ' + (err?.message || 'Error'));
    }
  };

  const parseSheetData = async (wb: XLSXTypes.WorkBook, sheetName: string) => {
    try {
      const worksheet = wb.Sheets[sheetName];
      if (!worksheet) return;

      const XLSX = await import('xlsx');
      const rawJson = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
        defval: '',
        raw: false,
      });
      if (rawJson.length === 0) {
        setErrorMsg(`Sheet [${sheetName}] tidak memiliki data baris.`);
        setParsedRows([]);
        setMatchedColumnCount(0);
        setSkippedBlankCount(0);
        setSkippedInvalidCount(0);
        return;
      }

      const rawHeaderKeys = Object.keys(rawJson[0] || {});
      const usedHeaders = new Set<string>();
      const keyMap: Record<string, string> = {};

      // Pass 1: Exact normalized match (key or label)
      validColumns.forEach((col) => {
        const colKey = String(col.key);
        const targetClean = normalizeCol(colKey);
        const labelClean = normalizeCol(col.label);
        const exactMatch = rawHeaderKeys.find((hk) => {
          if (usedHeaders.has(hk)) return false;
          const hkClean = normalizeCol(hk);
          return hkClean !== '' && (hkClean === targetClean || hkClean === labelClean);
        });
        if (exactMatch) {
          keyMap[colKey] = exactMatch;
          usedHeaders.add(exactMatch);
        }
      });

      // Pass 2: Controlled substring match on unused headers (min length >= 3)
      validColumns.forEach((col) => {
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
        setErrorMsg(
          `Header kolom di sheet [${sheetName}] tidak cocok dengan kolom modul ${moduleTitle}. Gunakan tombol Download Template untuk format resmi.`
        );
        setParsedRows([]);
        setMatchedColumnCount(0);
        setSkippedBlankCount(0);
        setSkippedInvalidCount(0);
        return;
      }

      const requiredCols = validColumns.filter((c) => c.validation?.required);
      const rows: any[] = [];
      let blankCount = 0;
      let invalidCount = 0;

      for (const rowObj of rawJson) {
        const hasAnyValue = Object.values(rowObj).some((v) => String(v ?? '').trim() !== '');
        if (!hasAnyValue) {
          blankCount++;
          continue;
        }

        const mapped: any = {};
        let hasMappedContent = false;

        validColumns.forEach((col) => {
          const colKey = String(col.key);
          const matchedHeader = keyMap[colKey];
          const rawVal = matchedHeader
            ? rowObj[matchedHeader]
            : rowObj[colKey] ?? rowObj[col.label] ?? '';
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

      setMatchedColumnCount(matchedCount);
      setSkippedBlankCount(blankCount);
      setSkippedInvalidCount(invalidCount);
      setParsedRows(rows);
      if (rows.length === 0) {
        setErrorMsg(
          `Tidak ada baris valid yang siap diimpor (${invalidCount} baris tidak memenuhi kolom wajib).`
        );
      } else {
        setErrorMsg(null);
      }
    } catch (err: any) {
      setErrorMsg('Gagal memproses sheet: ' + (err?.message || 'Error'));
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setErrorMsg(null);

    try {
      const XLSX = await import('xlsx');
      const buffer = await uploadedFile.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      setWorkbook(wb);
      setAvailableSheets(wb.SheetNames);

      const bestSheet =
        wb.SheetNames.find(
          (s) =>
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

  const handleCommitImport = async () => {
    if (parsedRows.length === 0) return;
    setImporting(true);
    setErrorMsg(null);
    setImportProgress('Memproses pengiriman data ke Cloud Server...');
    try {
      const importedCount = await onImport(parsedRows);
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
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl overflow-hidden border border-slate-200 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-100 rounded-lg text-emerald-700">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">
                Import Data .xlsx / .csv ({moduleTitle})
              </h3>
              <p className="text-xs text-slate-500">
                Unggah file Excel data Dapodik, Buku Induk, atau Template resmi
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={importing}
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Download Template banner */}
          <div className="flex items-center justify-between gap-3 p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-900">
            <div className="text-xs">
              <div className="font-bold">Belum punya format kolom Excel?</div>
              <div className="text-blue-700">
                Unduh template standar .xlsx yang sudah disesuaikan kolomnya
              </div>
            </div>
            <button
              type="button"
              onClick={downloadTemplate}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Template .xlsx</span>
            </button>
          </div>

          {/* Upload Dropzone */}
          <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-blue-500 hover:bg-slate-50/50 transition-all cursor-pointer relative">
            <input
              type="file"
              accept=".csv, .xlsx, .xls, text/csv"
              onChange={handleFileChange}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
            <div className="flex flex-col items-center">
              <div className="p-3 bg-slate-100 rounded-full text-slate-500 mb-2">
                <Upload className="w-6 h-6" />
              </div>
              <span className="text-sm font-semibold text-slate-700">
                {file ? file.name : 'Klik atau seret file .xlsx / .csv ke sini'}
              </span>
              <span className="text-xs text-slate-400 mt-1">
                Format yang didukung: Excel (.xlsx / .xls) atau CSV UTF-8
              </span>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Sheet Selector for Multi-sheet Workbooks */}
          {availableSheets.length > 1 && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-3 text-xs">
              <div>
                <span className="font-bold text-emerald-900 block">
                  File Excel memiliki {availableSheets.length} Sheet:
                </span>
                <span className="text-emerald-700 text-[11px]">
                  Pilih sheet data yang ingin di-import ke modul ini
                </span>
              </div>
              <select
                value={selectedSheet}
                onChange={(e) => handleSheetSwitch(e.target.value)}
                className="px-3 py-1.5 bg-white border border-emerald-300 rounded-lg text-xs font-bold text-slate-800 shadow-2xs cursor-pointer focus:ring-2 focus:ring-emerald-500"
              >
                {availableSheets.map((s) => (
                  <option key={s} value={s}>
                    Sheet Excel: {s}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Preview of Parsed Rows */}
          {parsedRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 font-semibold">
                <span>
                  Siap Import ({parsedRows.length} baris
                  {selectedSheet ? ` · Sheet: ${selectedSheet}` : ''})
                </span>
                <span className="text-emerald-700 font-bold">
                  {matchedColumnCount}/{validColumns.length} kolom cocok
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
            {importProgress || (parsedRows.length > 150 ? 'Akan dikirim bertahap per 150 baris' : '')}
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
              disabled={parsedRows.length === 0 || importing}
              className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold shadow-xs disabled:opacity-40 transition-all cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{importing ? 'Mengimpor...' : `Import ${parsedRows.length} Baris Data`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
