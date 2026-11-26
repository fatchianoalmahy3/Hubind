import { FieldConfig } from '../../core/types/metadata';
import { Dudi, Guru, Jurusan, Kelas, PenempatanPKL } from '../../core/types/schema';
import { ToastManager } from '../../core/ToastManager';
import { isFormulaManagedColumn } from '../../core/types/sheetBlueprint';
import {
  formatPhoneDisplay,
  generateJurusanCode,
  getTodayIsoDate,
  isPhoneFieldKey,
  resolveJurusanDisplayName,
} from '../../core/utils/autoIdHelpers';
import { cleanPersonTitle, matchJurusanItem } from '../../core/utils/jurusanHelpers';
import {
  getCanonicalNisDigits,
  isActivePlacementStatus,
  normalizeRelationText,
} from '../../core/utils/relationHelpers';
import { exportModuleRowsToXlsx } from '../../core/utils/xlsxGenerator';

const NON_IMPORTABLE_COMPUTED_KEYS = new Set([
  'kuotasiswa',
  'totalterdaftar',
  'jumlahsiswa',
  'terisi',
  'jumlahbimbingan',
  'rentangtanggal',
  'nilairatarata',
  'predikat',
]);

function normalizeKey(v: unknown): string {
  return String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function exportRowsToXlsx<T>(params: {
  rows: T[];
  fields: FieldConfig<T>[];
  moduleId: string;
  moduleTitle: string;
  tableName?: string;
}): Promise<void> {
  const { rows, fields, moduleId, moduleTitle } = params;
  if (!Array.isArray(rows) || rows.length === 0) return;

  const exportCols = fields
    .filter((f) => f.isTableColumn && f.type !== 'image')
    .map((f) => ({
      key: String(f.key),
      label: f.label,
    }));

  const normalizedRows = rows.map((row: any) => {
    const out: Record<string, any> = {};
    for (const col of exportCols) {
      const raw = row?.[col.key];
      if (isPhoneFieldKey(col.key)) {
        out[col.key] = formatPhoneDisplay(raw, '');
      } else {
        out[col.key] = raw ?? '';
      }
    }
    return out;
  });

  const stamp = new Date().toISOString().slice(0, 10);
  await exportModuleRowsToXlsx({
    rows: normalizedRows,
    columns: exportCols,
    sheetName: moduleTitle,
    fileName: `Export_${moduleId}_${stamp}.xlsx`,
  });

  ToastManager.getInstance().show(
    'Data Diekspor ke Excel (.xlsx)',
    'success',
    `${rows.length} baris dari ${moduleTitle} berhasil diunduh dalam format .xlsx.`
  );
}

/**
 * Backward-compatible alias that now exports clean .xlsx workbooks.
 */
export function exportSelectedRowsToCsv<T>(params: {
  selectedRows: T[];
  fields: FieldConfig<T>[];
  moduleId: string;
  moduleTitle: string;
}): void {
  void exportRowsToXlsx({
    rows: params.selectedRows,
    fields: params.fields,
    moduleId: params.moduleId,
    moduleTitle: params.moduleTitle,
  });
}

function findMatchingJurusan(rawVal: unknown, jurusanList: Jurusan[]): Jurusan | undefined {
  const s = String(rawVal ?? '').trim();
  if (!s) return undefined;
  const direct = jurusanList.find((j) => matchJurusanItem(s, j));
  if (direct) return direct;

  const generated = generateJurusanCode(s);
  if (generated) {
    const byCode = jurusanList.find(
      (j) => normalizeRelationText(j.kode) === normalizeRelationText(generated)
    );
    if (byCode) return byCode;
  }

  const tokens = s.split(/[\s\-_/(),]+/).filter(Boolean);
  for (const token of tokens) {
    const found = jurusanList.find(
      (j) =>
        normalizeRelationText(j.kode) === normalizeRelationText(token) ||
        normalizeRelationText(j.nama) === normalizeRelationText(token)
    );
    if (found) return found;
  }
  return undefined;
}

function findMatchingGuru(
  rawIdOrName: unknown,
  guruList: Guru[]
): Guru | undefined {
  const raw = String(rawIdOrName ?? '').trim();
  if (!raw) return undefined;
  const norm = normalizeRelationText(raw);
  const cleanName = cleanPersonTitle(raw);
  const digits = raw.replace(/\D/g, '');

  return guruList.find((g) => {
    if (g.id && normalizeRelationText(g.id) === norm) return true;
    if (normalizeRelationText(g.nama) === norm) return true;
    if (cleanName && cleanName.length >= 3 && cleanPersonTitle(g.nama) === cleanName) return true;
    if (digits.length >= 8 && g.nip && String(g.nip).replace(/\D/g, '') === digits) return true;
    return false;
  });
}

function findMatchingDudi(rawIdOrName: unknown, dudiList: Dudi[]): Dudi | undefined {
  const raw = String(rawIdOrName ?? '').trim();
  if (!raw) return undefined;
  const norm = normalizeRelationText(raw);
  return dudiList.find(
    (d) =>
      (d.id && normalizeRelationText(d.id) === norm) ||
      normalizeRelationText(d.namaDudi) === norm
  );
}

function normalizeGenderValue(raw: unknown): string {
  const s = normalizeRelationText(raw);
  if (!s) return '';
  if (s === 'l' || s === 'lk' || s.startsWith('laki')) return 'Laki-laki';
  if (s === 'p' || s === 'pr' || s.startsWith('peremp') || s.startsWith('wanita')) return 'Perempuan';
  return String(raw ?? '').trim();
}

function normalizePeranGuru(raw: unknown): Guru['peranUtama'] {
  const s = normalizeRelationText(raw);
  if (s.includes('kakomli')) return 'Kakomli';
  if (s.includes('hubin') || s.includes('pokja')) return 'Hubin';
  if (s.includes('wali') || s.includes('walas')) return 'Wali Kelas';
  return 'Guru Pendamping';
}

function normalizePerizinanCategory(raw: unknown): string {
  const s = normalizeRelationText(raw);
  if (!s) return 'Izin (I)';
  if (s === 'so' || (s.includes('sakit') && !s.includes('dokter'))) {
    return 'Sakit di izinkan Orangtua (SO)';
  }
  if (s === 'sd' || s.includes('dokter')) {
    return 'Surat Dokter (SD)';
  }
  if (s === 'id' || s.includes('dispensasi')) {
    return 'Izin dispensasi (ID)';
  }
  return 'Izin (I)';
}

export function resolveImportRowRelations(params: {
  moduleId: string;
  rows: Array<Record<string, any>>;
  jurusanList?: Jurusan[];
  guruList?: Guru[];
  dudiList?: Dudi[];
  kelasList?: Kelas[];
  penempatanList?: PenempatanPKL[];
}): {
  resolvedRows: Array<Record<string, any>>;
  missingGuruNames: string[];
} {
  const {
    moduleId,
    rows,
    jurusanList = [],
    guruList = [],
    dudiList = [],
    penempatanList = [],
  } = params;

  const missingGuruMap = new Map<string, string>();
  const recordMissingGuru = (rawName: unknown) => {
    const trimmed = String(rawName ?? '').trim();
    if (!trimmed) return;
    if (/^GRU[-_]/i.test(trimmed)) return;
    const key = cleanPersonTitle(trimmed) || normalizeRelationText(trimmed);
    if (key && !missingGuruMap.has(key)) {
      missingGuruMap.set(key, trimmed);
    }
  };

  const resolvedRows = rows.map((srcRow) => {
    const row: Record<string, any> = { ...srcRow };

    if (moduleId === 'siswa') {
      const nisDigits = getCanonicalNisDigits(row.nis);
      if (nisDigits) row.nis = nisDigits;
      if (row.jenisKelamin !== undefined) {
        row.jenisKelamin = normalizeGenderValue(row.jenisKelamin);
      }
      const jurCandidate = row.idJurusan || row.jurusan || row.kelas;
      const matchedJur = findMatchingJurusan(jurCandidate, jurusanList);
      if (matchedJur) {
        row.idJurusan = matchedJur.kode || matchedJur.id;
        row.jurusan = matchedJur.nama || resolveJurusanDisplayName(matchedJur.kode);
      } else if (row.jurusan || row.idJurusan) {
        const rawJur = String(row.idJurusan || row.jurusan || '').trim();
        const code = generateJurusanCode(rawJur);
        if (code) row.idJurusan = code;
        row.jurusan = resolveJurusanDisplayName(rawJur) || rawJur;
      }
    } else if (moduleId === 'kelas') {
      const jurCandidate = row.idJurusan || row.jurusan || row.namaKelas;
      const matchedJur = findMatchingJurusan(jurCandidate, jurusanList);
      if (matchedJur) {
        row.idJurusan = matchedJur.kode || matchedJur.id;
        row.jurusan = matchedJur.nama;
      } else if (jurCandidate) {
        const code = generateJurusanCode(String(jurCandidate));
        if (code) {
          row.idJurusan = code;
          row.jurusan = resolveJurusanDisplayName(code);
        }
      }
    } else if (moduleId === 'jurusan') {
      if (!String(row.kode || '').trim() && row.nama) {
        row.kode = generateJurusanCode(String(row.nama));
      }
      const guruRef = row.idKakomli || row.namaKakomli;
      const matchedGuru = findMatchingGuru(guruRef, guruList);
      if (matchedGuru) {
        row.idKakomli = matchedGuru.id;
        row.namaKakomli = matchedGuru.nama;
        if (!String(row.kontakWA || '').trim() && matchedGuru.kontakWA) {
          row.kontakWA = matchedGuru.kontakWA;
        }
      } else if (row.namaKakomli) {
        recordMissingGuru(row.namaKakomli);
      }
    } else if (moduleId === 'guru') {
      if (row.peranUtama) {
        row.peranUtama = normalizePeranGuru(row.peranUtama);
      }
    } else if (moduleId === 'dudi') {
      const guruRef = row.idGuruPendamping || row.guruPendamping;
      const matchedGuru = findMatchingGuru(guruRef, guruList);
      if (matchedGuru) {
        row.idGuruPendamping = matchedGuru.id;
        row.guruPendamping = matchedGuru.nama;
      } else if (row.guruPendamping) {
        recordMissingGuru(row.guruPendamping);
      }
    } else if (moduleId === 'siswa_pkl') {
      const nisDigits = getCanonicalNisDigits(row.nis);
      if (nisDigits) row.nis = nisDigits;

      const dudiRef = row.idDudi || row.namaDudi || row.dudiTujuan;
      const matchedDudi = findMatchingDudi(dudiRef, dudiList);
      if (matchedDudi) {
        row.idDudi = matchedDudi.id;
        row.namaDudi = matchedDudi.namaDudi;
      }

      const explicitGuruRef = row.idGuruPendamping || row.guruPendamping;
      const matchedExplicitGuru = findMatchingGuru(explicitGuruRef, guruList);
      if (matchedExplicitGuru) {
        row.idGuruPendamping = matchedExplicitGuru.id;
        row.guruPendamping = matchedExplicitGuru.nama;
      } else if (String(row.guruPendamping || '').trim()) {
        recordMissingGuru(row.guruPendamping);
      } else if (matchedDudi) {
        if (matchedDudi.idGuruPendamping) {
          row.idGuruPendamping = matchedDudi.idGuruPendamping;
        }
        if (matchedDudi.guruPendamping) {
          row.guruPendamping = matchedDudi.guruPendamping;
          const fallbackGuru = findMatchingGuru(matchedDudi.idGuruPendamping || matchedDudi.guruPendamping, guruList);
          if (fallbackGuru) {
            row.idGuruPendamping = fallbackGuru.id;
            row.guruPendamping = fallbackGuru.nama;
          }
        }
      }
    } else if (moduleId === 'perizinan') {
      const nisDigits = getCanonicalNisDigits(row.nis);
      if (nisDigits) row.nis = nisDigits;

      row.statusIzinOrtu = normalizePerizinanCategory(row.statusIzinOrtu);

      const dudiRef = row.idDudi || row.dudiTujuan || row.namaDudi;
      const matchedDudi = findMatchingDudi(dudiRef, dudiList);
      if (matchedDudi) {
        row.idDudi = matchedDudi.id;
        row.dudiTujuan = matchedDudi.namaDudi;
      } else if (!String(row.dudiTujuan || '').trim() && nisDigits && penempatanList.length > 0) {
        const plt =
          penempatanList.find(
            (p) =>
              getCanonicalNisDigits(p.nis) === nisDigits &&
              isActivePlacementStatus(p.statusPenempatan)
          ) || penempatanList.find((p) => getCanonicalNisDigits(p.nis) === nisDigits);
        if (plt) {
          row.idDudi = plt.idDudi || '';
          row.dudiTujuan = plt.namaDudi || '';
        }
      }
    }

    return row;
  });

  return {
    resolvedRows,
    missingGuruNames: Array.from(missingGuruMap.values()),
  };
}

function getRowIdentityKey(moduleId: string, row: Record<string, any>): string {
  if (moduleId === 'siswa') {
    const nis = getCanonicalNisDigits(row?.nis);
    return nis ? `nis:${nis}` : '';
  }
  if (moduleId === 'dudi') {
    const nm = normalizeRelationText(row?.namaDudi);
    return nm ? `dudi:${nm}` : '';
  }
  if (moduleId === 'jurusan') {
    const kode = normalizeRelationText(row?.kode || generateJurusanCode(String(row?.nama || '')));
    const nm = normalizeRelationText(row?.nama);
    return kode ? `jur:${kode}` : nm ? `jurNm:${nm}` : '';
  }
  if (moduleId === 'kelas') {
    const nm = normalizeRelationText(row?.namaKelas);
    return nm ? `kls:${nm}` : '';
  }
  if (moduleId === 'guru') {
    const clean = cleanPersonTitle(row?.nama) || normalizeRelationText(row?.nama);
    return clean ? `gru:${clean}` : '';
  }
  if (moduleId === 'siswa_pkl') {
    const nis = getCanonicalNisDigits(row?.nis);
    return nis ? `plt:${nis}` : '';
  }
  const explicitId = normalizeRelationText(
    row?.id || row?.idPenempatan || row?.noPengajuan || row?.noPerizinan
  );
  return explicitId ? `id:${explicitId}` : '';
}

function findExistingMatch(
  moduleId: string,
  row: Record<string, any>,
  existingAll: Array<Record<string, any>>
): Record<string, any> | undefined {
  const explicitId = String(
    row?.id || row?.idPenempatan || row?.noPengajuan || row?.noPerizinan || ''
  ).trim();
  if (explicitId) {
    const byId = existingAll.find((ex) => {
      const exId = String(
        ex?.id || ex?.idPenempatan || ex?.noPengajuan || ex?.noPerizinan || ''
      ).trim();
      return exId && exId.toLowerCase() === explicitId.toLowerCase();
    });
    if (byId) return byId;
  }

  if (moduleId === 'siswa') {
    const nis = getCanonicalNisDigits(row?.nis);
    if (!nis) return undefined;
    return existingAll.find((ex) => getCanonicalNisDigits(ex?.nis) === nis);
  }
  if (moduleId === 'dudi') {
    const nm = normalizeRelationText(row?.namaDudi);
    if (!nm) return undefined;
    return existingAll.find((ex) => normalizeRelationText(ex?.namaDudi) === nm);
  }
  if (moduleId === 'jurusan') {
    const kode = normalizeRelationText(row?.kode || generateJurusanCode(String(row?.nama || '')));
    const nm = normalizeRelationText(row?.nama);
    return existingAll.find(
      (ex) =>
        (kode && normalizeRelationText(ex?.kode) === kode) ||
        (nm && normalizeRelationText(ex?.nama) === nm)
    );
  }
  if (moduleId === 'kelas') {
    const nm = normalizeRelationText(row?.namaKelas);
    if (!nm) return undefined;
    return existingAll.find((ex) => normalizeRelationText(ex?.namaKelas) === nm);
  }
  if (moduleId === 'guru') {
    const nm = normalizeRelationText(row?.nama);
    const clean = cleanPersonTitle(row?.nama);
    const nipDigits = String(row?.nip || '').replace(/\D/g, '');
    return existingAll.find(
      (ex) =>
        (nm && normalizeRelationText(ex?.nama) === nm) ||
        (clean && clean.length >= 3 && cleanPersonTitle(ex?.nama) === clean) ||
        (nipDigits.length >= 8 && String(ex?.nip || '').replace(/\D/g, '') === nipDigits)
    );
  }
  if (moduleId === 'siswa_pkl') {
    const nis = getCanonicalNisDigits(row?.nis);
    if (!nis) return undefined;
    return (
      existingAll.find(
        (ex) => getCanonicalNisDigits(ex?.nis) === nis && isActivePlacementStatus(ex?.statusPenempatan)
      ) || existingAll.find((ex) => getCanonicalNisDigits(ex?.nis) === nis)
    );
  }
  return undefined;
}

function applyCreateDefaults(moduleId: string, row: Record<string, any>): Record<string, any> {
  const next = { ...row };
  if (moduleId === 'siswa') {
    if (!String(next.statusPKL || '').trim()) next.statusPKL = 'Belum Daftar';
  } else if (moduleId === 'dudi') {
    if (!String(next.wilayahKota || '').trim()) next.wilayahKota = 'Ponorogo';
    if (!String(next.statusKerjasama || '').trim()) next.statusKerjasama = 'MoU Aktif';
    if (!Number(next.kuotaMaksimal) || Number(next.kuotaMaksimal) < 1) next.kuotaMaksimal = 4;
  } else if (moduleId === 'guru') {
    if (!String(next.peranUtama || '').trim()) next.peranUtama = 'Guru Pendamping';
  } else if (moduleId === 'kelas') {
    if (!String(next.tingkat || '').trim()) next.tingkat = 'XI';
  } else if (moduleId === 'siswa_pkl') {
    if (!String(next.statusPenempatan || '').trim()) next.statusPenempatan = 'Terjadwal';
    if (!String(next.tanggalBerangkat || '').trim()) next.tanggalBerangkat = getTodayIsoDate();
  }
  return next;
}

export function partitionImportRowsForUpsert(params: {
  moduleId: string;
  tableName?: string;
  newRows: Array<Record<string, any>>;
  existingAll: Array<Record<string, any>>;
  upsertExisting: boolean;
}): {
  rowsToCreate: Array<Record<string, any>>;
  patchesToUpdate: Array<{ id: string; updates: Record<string, any> }>;
  skipped: number;
} {
  const { moduleId, tableName = '', newRows, existingAll, upsertExisting } = params;
  if (!Array.isArray(newRows) || newRows.length === 0) {
    return { rowsToCreate: [], patchesToUpdate: [], skipped: 0 };
  }

  let skipped = 0;
  const rowsToCreate: Array<Record<string, any>> = [];
  const createIndexByKey = new Map<string, number>();
  const updateMap = new Map<string, Record<string, any>>();

  for (const rawRow of newRows) {
    const cleanedRow: Record<string, any> = {};
    for (const [k, v] of Object.entries(rawRow)) {
      const kNorm = normalizeKey(k);
      if (NON_IMPORTABLE_COMPUTED_KEYS.has(kNorm)) continue;
      if (tableName && isFormulaManagedColumn(tableName, k)) {
        // Keep FK display fields only if we haven't stripped non-formula fields; computed rollups already skipped
        if (kNorm === 'terisi' || kNorm === 'kuotasiswa' || kNorm === 'totalterdaftar' || kNorm === 'jumlahsiswa' || kNorm === 'jumlahbimbingan') {
          continue;
        }
      }
      cleanedRow[k] = v;
    }

    const existingMatch = findExistingMatch(moduleId, cleanedRow, existingAll);
    if (existingMatch && existingMatch.id) {
      if (!upsertExisting) {
        skipped++;
        continue;
      }
      const sparsePatch: Record<string, any> = {};
      for (const [k, v] of Object.entries(cleanedRow)) {
        if (k === 'id' || k === 'idPenempatan' || k === 'noPengajuan' || k === 'noPerizinan') continue;
        if (v === undefined || v === null) continue;
        if (typeof v === 'string' && v.trim() === '') continue;
        if (typeof v === 'number' && v === 0 && k === 'kuotaMaksimal') continue;
        sparsePatch[k] = v;
      }
      if (Object.keys(sparsePatch).length > 0) {
        const prevPatch = updateMap.get(existingMatch.id) || {};
        updateMap.set(existingMatch.id, { ...prevPatch, ...sparsePatch });
      } else {
        skipped++;
      }
      continue;
    }

    const key = getRowIdentityKey(moduleId, cleanedRow);
    if (key && createIndexByKey.has(key)) {
      if (upsertExisting) {
        const existingIdx = createIndexByKey.get(key)!;
        const merged = { ...rowsToCreate[existingIdx] };
        for (const [k, v] of Object.entries(cleanedRow)) {
          if (v !== undefined && v !== null && String(v).trim() !== '') {
            merged[k] = v;
          }
        }
        rowsToCreate[existingIdx] = merged;
      } else {
        skipped++;
      }
      continue;
    }

    const withDefaults = applyCreateDefaults(moduleId, cleanedRow);
    if (key) createIndexByKey.set(key, rowsToCreate.length);
    rowsToCreate.push(withDefaults);
  }

  const patchesToUpdate = Array.from(updateMap.entries()).map(([id, updates]) => ({
    id,
    updates,
  }));

  return {
    rowsToCreate,
    patchesToUpdate,
    skipped,
  };
}

export function deduplicateImportRows(params: {
  moduleId: string;
  newRows: any[];
  existingAll: any[];
}): { rowsToImport: any[]; skipped: number } {
  const { rowsToCreate, skipped } = partitionImportRowsForUpsert({
    moduleId: params.moduleId,
    newRows: params.newRows,
    existingAll: params.existingAll,
    upsertExisting: false,
  });

  if (skipped > 0) {
    ToastManager.getInstance().show(
      `${skipped} Baris Duplikat Dilewati`,
      'info',
      'Data yang sudah terdaftar di Cloud Server dilewati agar tidak terjadi duplikasi.'
    );
  }

  return { rowsToImport: rowsToCreate, skipped };
}
