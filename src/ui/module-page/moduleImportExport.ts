import { FieldConfig } from '../../core/types/metadata';
import { ToastManager } from '../../core/ToastManager';
import { generateJurusanCode } from '../../core/utils/autoIdHelpers';
import {
  getCanonicalNisDigits,
  isActivePlacementStatus,
  normalizeRelationText,
} from '../../core/utils/relationHelpers';

export function exportSelectedRowsToCsv<T>(params: {
  selectedRows: T[];
  fields: FieldConfig<T>[];
  moduleId: string;
  moduleTitle: string;
}): void {
  const { selectedRows, fields, moduleId, moduleTitle } = params;
  if (selectedRows.length === 0) return;

  const exportCols = fields.filter((f) => f.isTableColumn && f.type !== 'image');
  const headers = exportCols.map((c) => `"${c.label.replace(/"/g, '""')}"`).join(',');
  const rows = selectedRows.map((r: any) =>
    exportCols.map((c) => `"${String(r[c.key] ?? '').replace(/"/g, '""')}"`).join(',')
  );

  const csvBody = '\uFEFF' + [headers, ...rows].join('\n');
  const blob = new Blob([csvBody], { type: 'text/csv;charset=utf-8;' });
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = `Export_${moduleId}_${Date.now()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);

  ToastManager.getInstance().show(
    'Data Diekspor ke CSV',
    'success',
    `${selectedRows.length} baris dari ${moduleTitle} berhasil diunduh.`
  );
}

export function deduplicateImportRows(params: {
  moduleId: string;
  newRows: any[];
  existingAll: any[];
}): { rowsToImport: any[]; skipped: number } {
  const { moduleId, newRows, existingAll } = params;
  if (!Array.isArray(newRows) || newRows.length === 0) {
    return { rowsToImport: [], skipped: 0 };
  }

  let skipped = 0;
  let deduped: any[] = [];

  if (moduleId === 'siswa') {
    const seenNis = new Set<string>(
      existingAll.map((r) => getCanonicalNisDigits(r?.nis)).filter(Boolean)
    );
    for (const row of newRows) {
      const nisDigits = getCanonicalNisDigits(row?.nis);
      if (nisDigits && seenNis.has(nisDigits)) {
        skipped++;
        continue;
      }
      if (nisDigits) {
        seenNis.add(nisDigits);
        row.nis = nisDigits;
      }
      deduped.push(row);
    }
  } else if (moduleId === 'dudi') {
    const seen = new Set<string>(
      existingAll.map((r) => normalizeRelationText(r?.namaDudi)).filter(Boolean)
    );
    for (const row of newRows) {
      const key = normalizeRelationText(row?.namaDudi);
      if (key && seen.has(key)) {
        skipped++;
        continue;
      }
      if (key) seen.add(key);
      deduped.push(row);
    }
  } else if (moduleId === 'jurusan') {
    const seenNames = new Set<string>(
      existingAll.map((r) => normalizeRelationText(r?.nama)).filter(Boolean)
    );
    const seenCodes = new Set<string>(
      existingAll.map((r) => normalizeRelationText(r?.kode)).filter(Boolean)
    );
    for (const row of newRows) {
      const nameKey = normalizeRelationText(row?.nama);
      const code = String(row?.kode || generateJurusanCode(String(row?.nama || '')) || '').trim();
      const codeKey = normalizeRelationText(code);
      if ((nameKey && seenNames.has(nameKey)) || (codeKey && seenCodes.has(codeKey))) {
        skipped++;
        continue;
      }
      if (nameKey) seenNames.add(nameKey);
      if (codeKey) seenCodes.add(codeKey);
      if (code && !row.kode) row.kode = code;
      deduped.push(row);
    }
  } else if (moduleId === 'kelas') {
    const seen = new Set<string>(
      existingAll.map((r) => normalizeRelationText(r?.namaKelas)).filter(Boolean)
    );
    for (const row of newRows) {
      const key = normalizeRelationText(row?.namaKelas);
      if (key && seen.has(key)) {
        skipped++;
        continue;
      }
      if (key) seen.add(key);
      deduped.push(row);
    }
  } else if (moduleId === 'guru') {
    const seen = new Set<string>(
      existingAll.map((r) => normalizeRelationText(r?.nama)).filter(Boolean)
    );
    for (const row of newRows) {
      const key = normalizeRelationText(row?.nama);
      if (key && seen.has(key)) {
        skipped++;
        continue;
      }
      if (key) seen.add(key);
      deduped.push(row);
    }
  } else if (moduleId === 'siswa_pkl') {
    const activeNisSet = new Set<string>(
      existingAll
        .filter((r) => isActivePlacementStatus(r?.statusPenempatan))
        .map((r) => getCanonicalNisDigits(r?.nis))
        .filter(Boolean)
    );
    for (const row of newRows) {
      const nisDigits = getCanonicalNisDigits(row?.nis);
      const isRowActive = !row?.statusPenempatan || isActivePlacementStatus(row?.statusPenempatan);
      if (isRowActive && nisDigits && activeNisSet.has(nisDigits)) {
        skipped++;
        continue;
      }
      if (isRowActive && nisDigits) activeNisSet.add(nisDigits);
      if (nisDigits) row.nis = nisDigits;
      deduped.push(row);
    }
  } else {
    deduped = newRows;
  }

  if (skipped > 0) {
    ToastManager.getInstance().show(
      `${skipped} Baris Duplikat Dilewati`,
      'info',
      'Data yang sudah terdaftar di Cloud Server dilewati agar tidak terjadi duplikasi.'
    );
  }

  return { rowsToImport: deduped, skipped };
}
