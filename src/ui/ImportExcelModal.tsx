import React, { useState } from 'react';
import { FieldConfig } from '../core/types/metadata';
import { X, Upload, FileSpreadsheet, Download, Check, AlertCircle } from 'lucide-react';

import * as XLSX from 'xlsx';

interface ImportExcelModalProps<T = any> {
  isOpen: boolean;
  onClose: () => void;
  fields: FieldConfig<T>[];
  moduleTitle: string;
  onImport: (newRows: Partial<T>[]) => Promise<number>;
}

export function ImportExcelModal<T extends Record<string, any>>({
  isOpen,
  onClose,
  fields,
  moduleTitle,
  onImport,
}: ImportExcelModalProps<T>) {
  const [file, setFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const validColumns = fields.filter((f) => f.isTableColumn && f.type !== 'image');

  // Generate Sample CSV Template for download
  const downloadTemplate = () => {
    const headers = validColumns.map((c) => c.label).join(',');
    const sampleRow = validColumns
      .map((c) => {
        if (c.type === 'number') return '100';
        if (c.type === 'select' && c.options?.length) return `"${c.options[0].value}"`;
        if (c.type === 'date') return '2026-11-10';
        return `"Contoh ${c.label}"`;
      })
      .join(',');

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, sampleRow].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Template_Import_${moduleTitle.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const normalizeCol = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

  const parseSheetData = (wb: XLSX.WorkBook, sheetName: string) => {
    try {
      const worksheet = wb.Sheets[sheetName];
      if (!worksheet) return;

      const rawJson = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });
      if (rawJson.length === 0) {
        setErrorMsg(`Sheet [${sheetName}] tidak memiliki data baris`);
        setParsedRows([]);
        return;
      }

      const rows: any[] = [];
      const rawHeaderKeys = Object.keys(rawJson[0]);

      // Fuzzy column matching
      const keyMap: Record<string, string> = {};
      validColumns.forEach((col) => {
        const targetClean = normalizeCol(String(col.key));
        const labelClean = normalizeCol(col.label);

        const match = rawHeaderKeys.find((hk) => {
          const hkClean = normalizeCol(hk);
          return (
            hkClean === targetClean ||
            hkClean === labelClean ||
            hkClean.includes(targetClean) ||
            targetClean.includes(hkClean) ||
            hkClean.includes(labelClean) ||
            labelClean.includes(hkClean)
          );
        });

        if (match) {
          keyMap[String(col.key)] = match;
        }
      });

      rawJson.forEach((rowObj) => {
        const mapped: any = {};
        validColumns.forEach((col) => {
          const matchedHeader = keyMap[String(col.key)];
          const rawVal = matchedHeader ? rowObj[matchedHeader] : rowObj[String(col.key)] ?? rowObj[col.label] ?? '';
          if (col.type === 'number') {
            mapped[col.key] = Number(rawVal) || 0;
          } else {
            mapped[col.key] = String(rawVal ?? '');
          }
        });
        rows.push(mapped);
      });

      setParsedRows(rows);
      setErrorMsg(null);
    } catch (err: any) {
      setErrorMsg('Gagal memproses sheet: ' + err.message);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setErrorMsg(null);

    try {
      const buffer = await uploadedFile.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      setWorkbook(wb);
      setAvailableSheets(wb.SheetNames);

      // Select matching sheet if exists, otherwise first sheet
      const bestSheet =
        wb.SheetNames.find((s) =>
          normalizeCol(s).includes(normalizeCol(moduleTitle)) ||
          normalizeCol(moduleTitle).includes(normalizeCol(s))
        ) || wb.SheetNames[0];

      setSelectedSheet(bestSheet);
      parseSheetData(wb, bestSheet);
    } catch (err: any) {
      setErrorMsg('Gagal membaca file Excel (.xlsx/.csv): ' + err.message);
    }
  };

  const handleSheetSwitch = (sheetName: string) => {
    setSelectedSheet(sheetName);
    if (workbook) {
      parseSheetData(workbook, sheetName);
    }
  };

  const handleCommitImport = async () => {
    if (parsedRows.length === 0) return;
    setImporting(true);
    try {
      await onImport(parsedRows);
      onClose();
    } catch (err: any) {
      setErrorMsg('Gagal mengimpor data: ' + err.message);
    } finally {
      setImporting(false);
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
                Unggah file Excel data Dapodik atau Buku Induk TU
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Download Template banner */}
          <div className="flex items-center justify-between p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-900">
            <div className="text-xs">
              <div className="font-bold">Belum punya format kolom Excel?</div>
              <div className="text-blue-700">Unduh template standar kolom yang sudah disesuaikan</div>
            </div>
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Template</span>
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
                Format yang didukung: CSV UTF-8 atau file ekspor Excel
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
                <span className="font-bold text-emerald-900 block">File Excel memiliki {availableSheets.length} Sheet:</span>
                <span className="text-emerald-700 text-[11px]">Pilih sheet data yang ingin di-import ke modul ini</span>
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
              <div className="flex items-center justify-between text-xs text-slate-600 font-semibold">
                <span>
                  Pratinjau Data Siap Import ({parsedRows.length} baris
                  {selectedSheet ? ` · Sheet Excel: ${selectedSheet}` : ''})
                </span>
                <span className="text-emerald-600 font-bold">Valid &amp; Terbaca</span>
              </div>
              <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-40 text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      {validColumns.slice(0, 4).map((c) => (
                        <th key={String(c.key)} className="p-2 border-b">
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedRows.slice(0, 5).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        {validColumns.slice(0, 4).map((c) => (
                          <td key={String(c.key)} className="p-2 text-slate-700">
                            {row[c.key] || '-'}
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
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleCommitImport}
            disabled={parsedRows.length === 0 || importing}
            className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold shadow-xs disabled:opacity-40 transition-all"
          >
            <Check className="w-4 h-4" />
            <span>{importing ? 'Mengimpor...' : `Import ${parsedRows.length} Baris Data`}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
