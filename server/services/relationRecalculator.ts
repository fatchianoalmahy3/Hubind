import { generateJurusanCode } from '../../src/core/utils/autoIdHelpers';
import { stripNisSymbols } from '../../src/core/utils/nisHelpers';
import { pickField } from '../../src/core/utils/rowFieldHelpers';
import {
  callGasCustomAction,
  fetchBatchSheetsViaGas,
  invalidateServerCaches,
  writeLiveSheetViaGas,
} from './sheetsTransport';

export interface RelationRecalculationSummary {
  updatedPlacements: number;
  updatedDudi: number;
  updatedGuru: number;
  updatedJurusan: number;
  updatedKelas: number;
  formulasApplied?: boolean;
}

/**
 * Option 2 (Hybrid Relational + Row-1 ARRAYFORMULA):
 * Server-side relation reconciliation never overwrites formula-managed aggregate
 * counters (Terisi, Jumlah_Bimbingan, Kuota_Siswa, Total_Terdaftar, Jumlah_Siswa)
 * or text lookups. Instead, it backfills canonical Foreign Keys (ID_Jurusan,
 * ID_DUDI, ID_Guru_Pendamping, ID_Penempatan, Status_PKL) across sheets,
 * triggers GAS formula migration if needed, and invalidates dependent caches.
 */
export async function recalculateAllRelations(
  scopeParam = 'all',
  forceRefresh = false
): Promise<RelationRecalculationSummary> {
  const scope = String(scopeParam || 'all').toLowerCase();

  const neededTables = [
    'Master_Siswa_XI',
    'Master_DUDI',
    'Master_Guru_Pendamping',
    'Master_Jurusan',
    'Master_Kelas_Walas',
    'Data_Pengajuan_PKL',
    'Data_Perizinan_PKL',
    'Plotting_Pemberangkatan',
    'Monitoring_5_Tahap',
    'Nilai_Dan_Sertifikat',
  ];

  const { sheets } = await fetchBatchSheetsViaGas(
    neededTables,
    new Set([
      'Data_Pengajuan_PKL',
      'Data_Perizinan_PKL',
      'Plotting_Pemberangkatan',
      'Monitoring_5_Tahap',
      'Nilai_Dan_Sertifikat',
    ]),
    forceRefresh
  );

  const siswaList = sheets['Master_Siswa_XI'] || [];
  const dudiList = sheets['Master_DUDI'] || [];
  const guruList = sheets['Master_Guru_Pendamping'] || [];
  const jurusanList = sheets['Master_Jurusan'] || [];
  const kelasList = sheets['Master_Kelas_Walas'] || [];
  const pengajuanList = sheets['Data_Pengajuan_PKL'] || [];
  const perizinanList = sheets['Data_Perizinan_PKL'] || [];
  const placements = sheets['Plotting_Pemberangkatan'] || [];
  const monitoringList = sheets['Monitoring_5_Tahap'] || [];
  const sertifikatList = sheets['Nilai_Dan_Sertifikat'] || [];

  const norm = (v: unknown) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

  // Build master lookup maps
  const jurCodeByKey = new Map<string, string>();
  for (const j of jurusanList) {
    const nama = pickField(j, 'Nama_Jurusan', 'namaJurusan', 'nama');
    const kode = (pickField(j, 'Kode', 'Kode_Jurusan', 'kode', 'id') || '').toUpperCase();
    if (kode) {
      jurCodeByKey.set(norm(kode), kode);
      if (nama) jurCodeByKey.set(norm(nama), kode);
    }
  }
  const resolveCanonicalJurusanCode = (rawVal: unknown): string => {
    const str = String(rawVal ?? '').trim();
    if (!str) return '';
    return jurCodeByKey.get(norm(str)) || generateJurusanCode(str) || '';
  };

  const dudiById = new Map<string, any>();
  const dudiByName = new Map<string, any>();
  for (const d of dudiList) {
    const id = pickField(d, 'ID', 'ID_DUDI', 'idDudi', 'id');
    const nama = pickField(d, 'Nama_DUDI', 'namaDudi');
    if (id) dudiById.set(id, d);
    if (nama) dudiByName.set(norm(nama), d);
  }

  const guruById = new Map<string, any>();
  const guruNameCount = new Map<string, number>();
  const guruByName = new Map<string, any>();
  for (const g of guruList) {
    const id = pickField(g, 'ID', 'ID_Guru', 'idGuru', 'id');
    const nama = pickField(g, 'Nama_Lengkap', 'Nama_Guru', 'namaGuru', 'nama');
    if (id) guruById.set(id, g);
    if (nama) {
      const nk = norm(nama);
      guruNameCount.set(nk, (guruNameCount.get(nk) || 0) + 1);
      guruByName.set(nk, g);
    }
  }
  const resolveCanonicalGuruId = (idVal: string, namaVal: string): string => {
    if (idVal && guruById.has(idVal)) return idVal;
    const nk = namaVal ? norm(namaVal) : '';
    if (nk && guruNameCount.get(nk) === 1) {
      const matched = guruByName.get(nk);
      return pickField(matched, 'ID', 'ID_Guru', 'idGuru', 'id');
    }
    return '';
  };

  const placementByNis = new Map<string, any>();
  const activePlacementNis = new Set<string>();
  const completedPlacementNis = new Set<string>();
  const CLOSED_STATUSES = new Set(['dibatalkan', 'batal', 'pindah dudi', 'selesai pkl']);
  for (const p of placements) {
    const pNis = stripNisSymbols(pickField(p, 'NIS', 'nis'));
    if (!pNis) continue;
    const st = norm(pickField(p, 'Status_Penempatan', 'statusPenempatan'));
    if (st === 'selesai pkl') {
      completedPlacementNis.add(pNis);
    } else if (!CLOSED_STATUSES.has(st)) {
      activePlacementNis.add(pNis);
      placementByNis.set(pNis, p);
    } else if (!placementByNis.has(pNis)) {
      placementByNis.set(pNis, p);
    }
  }

  const flushBulkUpdates = async (sheetName: string, rows: any[]): Promise<number> => {
    if (!rows.length) return 0;
    const CHUNK = 150;
    let applied = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const res = await writeLiveSheetViaGas(sheetName, 'BULK_UPDATE', {
        ids: chunk.map((r) => r.id),
        updatedRows: chunk,
      })
        .then(() => true)
        .catch(() => false);
      if (res) applied += chunk.length;
    }
    return applied;
  };

  let updatedPlacements = 0;
  let updatedDudi = 0;
  const updatedGuru = 0;
  let updatedJurusan = 0;
  let updatedKelas = 0;

  const dudiUpdates: any[] = [];
  const kelasUpdates: any[] = [];
  const siswaUpdates: any[] = [];
  const pengajuanUpdates: any[] = [];
  const perizinanUpdates: any[] = [];
  const placementUpdates: any[] = [];
  const monitoringUpdates: any[] = [];
  const sertifikatUpdates: any[] = [];

  // 1. Collect ID_Guru_Pendamping backfills on Master_DUDI
  if (scope === 'all' || scope === 'guru' || scope === 'dudi') {
    for (const d of dudiList) {
      const dId = pickField(d, 'ID', 'ID_DUDI', 'idDudi', 'id');
      if (!dId) continue;
      const dGuruId = pickField(d, 'ID_Guru_Pendamping', 'idGuruPendamping');
      const dGuruName = pickField(d, 'Guru_Pendamping', 'guruPendamping');
      const resolvedGuruId = resolveCanonicalGuruId(dGuruId, dGuruName);
      if (resolvedGuruId && resolvedGuruId !== dGuruId) {
        dudiUpdates.push({
          id: dId,
          ID: dId,
          _sheetRowNumber: d._sheetRowNumber,
          ID_Guru_Pendamping: resolvedGuruId,
          idGuruPendamping: resolvedGuruId,
        });
        d.ID_Guru_Pendamping = resolvedGuruId;
      }
    }
  }

  // 2. Collect ID_Jurusan backfills on Master_Kelas_Walas & Master_Siswa_XI + Status_PKL
  if (scope === 'all' || scope === 'kelas' || scope === 'siswa' || scope === 'jurusan') {
    for (const k of kelasList) {
      const kId = pickField(k, 'ID', 'ID_Kelas', 'idKelas', 'id');
      if (!kId) continue;
      const currCode = pickField(k, 'ID_Jurusan', 'idJurusan');
      const jurName = pickField(k, 'Jurusan', 'jurusan') || pickField(k, 'Nama_Kelas', 'namaKelas');
      const canonicalCode = resolveCanonicalJurusanCode(currCode || jurName);
      if (canonicalCode && canonicalCode !== currCode) {
        kelasUpdates.push({
          id: kId,
          ID: kId,
          _sheetRowNumber: k._sheetRowNumber,
          ID_Jurusan: canonicalCode,
          idJurusan: canonicalCode,
        });
      }
    }

    for (const s of siswaList) {
      const sId = pickField(s, 'ID', 'id', 'NIS', 'nis');
      if (!sId) continue;
      const nisDigits = stripNisSymbols(pickField(s, 'NIS', 'nis'));
      const currJur = pickField(s, 'ID_Jurusan', 'idJurusan', 'jurusan');
      const canonicalJur = resolveCanonicalJurusanCode(currJur);
      const currStatus = pickField(s, 'Status_PKL', 'statusPKL');
      let nextStatus = currStatus;
      if (nisDigits) {
        if (activePlacementNis.has(nisDigits) && ['belum daftar', 'diajukan', 'menunggu acc', ''].includes(norm(currStatus))) {
          nextStatus = 'Aktif PKL';
        } else if (!activePlacementNis.has(nisDigits) && completedPlacementNis.has(nisDigits) && norm(currStatus) !== 'selesai pkl') {
          nextStatus = 'Selesai PKL';
        }
      }
      const needsJurFix = Boolean(canonicalJur && canonicalJur !== currJur);
      const needsStatusFix = Boolean(nextStatus && nextStatus !== currStatus);
      if (needsJurFix || needsStatusFix) {
        siswaUpdates.push({
          id: sId,
          ID: sId,
          _sheetRowNumber: s._sheetRowNumber,
          ...(needsJurFix ? { ID_Jurusan: canonicalJur, idJurusan: canonicalJur } : {}),
          ...(needsStatusFix ? { Status_PKL: nextStatus, statusPKL: nextStatus } : {}),
        });
      }
    }
  }

  // 3. Collect FK ID backfills across transactional sheets
  if (scope === 'all' || scope === 'placements' || scope === 'siswa_pkl' || scope === 'pengajuan' || scope === 'perizinan') {
    for (const pq of pengajuanList) {
      const pqId = pickField(pq, 'No_Pengajuan', 'noPengajuan', 'id');
      if (!pqId) continue;
      const currDudiId = pickField(pq, 'ID_DUDI', 'idDudi');
      const dudiName = pickField(pq, 'DUDI_Tujuan', 'dudiTujuan');
      const matchedDudi = (currDudiId && dudiById.get(currDudiId)) || (dudiName && dudiByName.get(norm(dudiName)));
      const nextDudiId = matchedDudi ? pickField(matchedDudi, 'ID', 'id') : currDudiId;

      const currGuruId = pickField(pq, 'ID_Guru_Pendamping', 'idGuruPendamping');
      const guruName = pickField(pq, 'Guru_Pendamping', 'guruPendamping');
      const nextGuruId =
        resolveCanonicalGuruId(currGuruId, guruName) ||
        (matchedDudi ? pickField(matchedDudi, 'ID_Guru_Pendamping', 'idGuruPendamping') : '');

      if ((nextDudiId && nextDudiId !== currDudiId) || (nextGuruId && nextGuruId !== currGuruId)) {
        pengajuanUpdates.push({
          id: pqId,
          No_Pengajuan: pqId,
          _sheetRowNumber: pq._sheetRowNumber,
          ...(nextDudiId ? { ID_DUDI: nextDudiId, idDudi: nextDudiId } : {}),
          ...(nextGuruId ? { ID_Guru_Pendamping: nextGuruId, idGuruPendamping: nextGuruId } : {}),
        });
      }
    }

    for (const iz of perizinanList) {
      const izId = pickField(iz, 'ID_Perizinan', 'noPerizinan', 'id');
      if (!izId) continue;
      const currDudiId = pickField(iz, 'ID_DUDI', 'idDudi');
      const dudiName = pickField(iz, 'DUDI_Tujuan', 'dudiTujuan');
      const matchedDudi = !currDudiId && dudiName ? dudiByName.get(norm(dudiName)) : undefined;
      const nextDudiId = matchedDudi ? pickField(matchedDudi, 'ID', 'id') : '';
      if (nextDudiId && nextDudiId !== currDudiId) {
        perizinanUpdates.push({
          id: izId,
          ID_Perizinan: izId,
          _sheetRowNumber: iz._sheetRowNumber,
          ID_DUDI: nextDudiId,
          idDudi: nextDudiId,
        });
      }
    }

    for (const p of placements) {
      const pId = pickField(p, 'ID_Penempatan', 'idPenempatan', 'id');
      if (!pId) continue;
      const currDudiId = pickField(p, 'ID_DUDI', 'idDudi');
      const dudiName = pickField(p, 'Nama_DUDI', 'namaDudi', 'DUDI_Tujuan');
      const matchedDudi = (currDudiId && dudiById.get(currDudiId)) || (dudiName && dudiByName.get(norm(dudiName)));
      const nextDudiId = matchedDudi ? pickField(matchedDudi, 'ID', 'id') : currDudiId;

      const currGuruId = pickField(p, 'ID_Guru_Pendamping', 'idGuruPendamping');
      const guruName = pickField(p, 'Guru_Pendamping', 'guruPendamping');
      const nextGuruId =
        resolveCanonicalGuruId(currGuruId, guruName) ||
        (matchedDudi ? pickField(matchedDudi, 'ID_Guru_Pendamping', 'idGuruPendamping') : '');

      if ((nextDudiId && nextDudiId !== currDudiId) || (nextGuruId && nextGuruId !== currGuruId)) {
        placementUpdates.push({
          id: pId,
          ID_Penempatan: pId,
          _sheetRowNumber: p._sheetRowNumber,
          ...(nextDudiId ? { ID_DUDI: nextDudiId, idDudi: nextDudiId } : {}),
          ...(nextGuruId ? { ID_Guru_Pendamping: nextGuruId, idGuruPendamping: nextGuruId } : {}),
        });
      }
    }
  }

  // 4. Collect Monitoring_5_Tahap & Nilai_Dan_Sertifikat FKs
  if (scope === 'all' || scope === 'monitoring' || scope === 'sertifikat') {
    for (const m of monitoringList) {
      const mId = pickField(m, 'ID_Monitoring', 'idMonitoring', 'id');
      if (!mId) continue;
      const nisDigits = stripNisSymbols(pickField(m, 'NIS', 'nis'));
      const plt = nisDigits ? placementByNis.get(nisDigits) : undefined;
      const currPltId = pickField(m, 'ID_Penempatan', 'idPenempatan');
      const nextPltId = currPltId || (plt ? pickField(plt, 'ID_Penempatan', 'idPenempatan', 'id') : '');

      const currDudiId = pickField(m, 'ID_DUDI', 'idDudi');
      const dudiName = pickField(m, 'DUDI_Tujuan', 'dudiTujuan');
      const matchedDudi = (currDudiId && dudiById.get(currDudiId)) || (dudiName && dudiByName.get(norm(dudiName)));
      const nextDudiId =
        (matchedDudi ? pickField(matchedDudi, 'ID', 'id') : '') ||
        (plt ? pickField(plt, 'ID_DUDI', 'idDudi') : '') ||
        currDudiId;

      const currGuruId = pickField(m, 'ID_Guru_Pendamping', 'idGuruPendamping');
      const guruName = pickField(m, 'Guru_Pendamping', 'guruPendamping');
      const nextGuruId =
        resolveCanonicalGuruId(currGuruId, guruName) ||
        (plt ? pickField(plt, 'ID_Guru_Pendamping', 'idGuruPendamping') : '') ||
        (matchedDudi ? pickField(matchedDudi, 'ID_Guru_Pendamping', 'idGuruPendamping') : '');

      if (
        (nextPltId && nextPltId !== currPltId) ||
        (nextDudiId && nextDudiId !== currDudiId) ||
        (nextGuruId && nextGuruId !== currGuruId)
      ) {
        monitoringUpdates.push({
          id: mId,
          ID_Monitoring: mId,
          _sheetRowNumber: m._sheetRowNumber,
          ...(nextPltId ? { ID_Penempatan: nextPltId, idPenempatan: nextPltId } : {}),
          ...(nextDudiId ? { ID_DUDI: nextDudiId, idDudi: nextDudiId } : {}),
          ...(nextGuruId ? { ID_Guru_Pendamping: nextGuruId, idGuruPendamping: nextGuruId } : {}),
        });
      }
    }

    for (const sr of sertifikatList) {
      const srId = pickField(sr, 'ID_Penempatan', 'idPenempatan', 'id');
      if (!srId) continue;
      const nisDigits = stripNisSymbols(pickField(sr, 'NIS', 'nis'));
      const plt = nisDigits ? placementByNis.get(nisDigits) : undefined;
      const currDudiId = pickField(sr, 'ID_DUDI', 'idDudi');
      const dudiName = pickField(sr, 'DUDI_Tujuan', 'dudiTujuan');
      const matchedDudi = (currDudiId && dudiById.get(currDudiId)) || (dudiName && dudiByName.get(norm(dudiName)));
      const nextDudiId =
        (matchedDudi ? pickField(matchedDudi, 'ID', 'id') : '') ||
        (plt ? pickField(plt, 'ID_DUDI', 'idDudi') : '') ||
        currDudiId;

      if (nextDudiId && nextDudiId !== currDudiId) {
        sertifikatUpdates.push({
          id: srId,
          ID_Penempatan: srId,
          _sheetRowNumber: sr._sheetRowNumber,
          ID_DUDI: nextDudiId,
          idDudi: nextDudiId,
        });
      }
    }
  }

  // Flush batched BULK_UPDATE per mutated sheet
  updatedDudi = await flushBulkUpdates('Master_DUDI', dudiUpdates);
  updatedKelas = await flushBulkUpdates('Master_Kelas_Walas', kelasUpdates);
  updatedJurusan = await flushBulkUpdates('Master_Siswa_XI', siswaUpdates);
  await flushBulkUpdates('Data_Pengajuan_PKL', pengajuanUpdates);
  await flushBulkUpdates('Data_Perizinan_PKL', perizinanUpdates);
  updatedPlacements = await flushBulkUpdates('Plotting_Pemberangkatan', placementUpdates);
  await flushBulkUpdates('Monitoring_5_Tahap', monitoringUpdates);
  await flushBulkUpdates('Nilai_Dan_Sertifikat', sertifikatUpdates);

  let formulasApplied = false;
  if (scope === 'all') {
    const migRes = await callGasCustomAction('MIGRATE_RELATIONAL_FORMULAS').catch(() => null);
    formulasApplied = Boolean(migRes?.data?.status === 'success');
  }

  await invalidateServerCaches();

  return {
    updatedPlacements,
    updatedDudi,
    updatedGuru,
    updatedJurusan,
    updatedKelas,
    formulasApplied,
  };
}
