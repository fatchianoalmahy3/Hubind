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

export interface RelationMutationHint {
  mutatedId?: string;
  previousName?: string;
  nextName?: string;
}

function getTablesForRelationScope(scope: string): string[] {
  if (scope === 'guru') {
    return [
      'Master_Guru_Pendamping',
      'Master_DUDI',
      'Data_Pengajuan_PKL',
      'Plotting_Pemberangkatan',
      'Monitoring_5_Tahap',
    ];
  }
  if (scope === 'dudi') {
    return [
      'Master_DUDI',
      'Master_Guru_Pendamping',
      'Data_Pengajuan_PKL',
      'Data_Perizinan_PKL',
      'Plotting_Pemberangkatan',
      'Monitoring_5_Tahap',
      'Nilai_Dan_Sertifikat',
    ];
  }
  return [
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
}

/**
 * Option 2 (Hybrid Relational + Row-1 ARRAYFORMULA):
 * Server-side relation reconciliation never overwrites active Row-1/Row-2 formula columns.
 * Instead, it backfills canonical Foreign Keys (ID_Jurusan, ID_DUDI, ID_Guru_Pendamping,
 * ID_Penempatan, Status_PKL) and safely syncs static display names on non-formula sheets.
 */
export async function recalculateAllRelations(
  scopeParam = 'all',
  forceRefresh = false,
  mutationHint?: RelationMutationHint
): Promise<RelationRecalculationSummary> {
  const scope = String(scopeParam || 'all').toLowerCase();
  const neededTables = getTablesForRelationScope(scope);

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
  const hintedId = String(mutationHint?.mutatedId || '').trim();
  const hintedPrevNorm = norm(mutationHint?.previousName);

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
  const resolveDudiRecord = (idVal: string, namaVal: string): any | undefined => {
    if (idVal && dudiById.has(idVal)) return dudiById.get(idVal);
    const nk = namaVal ? norm(namaVal) : '';
    if (nk && hintedId && hintedPrevNorm && nk === hintedPrevNorm && dudiById.has(hintedId)) {
      return dudiById.get(hintedId);
    }
    if (nk && dudiByName.has(nk)) return dudiByName.get(nk);
    return undefined;
  };

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
  const resolveGuruRecord = (idVal: string, namaVal: string): any | undefined => {
    if (idVal && guruById.has(idVal)) return guruById.get(idVal);
    const nk = namaVal ? norm(namaVal) : '';
    if (nk && hintedId && hintedPrevNorm && nk === hintedPrevNorm && guruById.has(hintedId)) {
      return guruById.get(hintedId);
    }
    if (nk && guruNameCount.get(nk) === 1) {
      return guruByName.get(nk);
    }
    return undefined;
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
      const res = await writeLiveSheetViaGas(
        sheetName,
        'BULK_UPDATE',
        {
          ids: chunk.map((r) => r.id),
          updatedRows: chunk,
        },
        { preserveDisplayColumnsForNonFormula: true }
      )
        .then(() => true)
        .catch(() => false);
      if (res) applied += chunk.length;
    }
    return applied;
  };

  let updatedPlacements = 0;
  let updatedDudi = 0;
  let updatedGuru = 0;
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

  // 1. Reconcile ID_Guru_Pendamping & static Guru_Pendamping on Master_DUDI
  if (scope === 'all' || scope === 'guru' || scope === 'dudi') {
    for (const d of dudiList) {
      const dId = pickField(d, 'ID', 'ID_DUDI', 'idDudi', 'id');
      if (!dId) continue;
      const dGuruId = pickField(d, 'ID_Guru_Pendamping', 'idGuruPendamping');
      const dGuruName = pickField(d, 'Guru_Pendamping', 'guruPendamping');
      const matchedGuru = resolveGuruRecord(dGuruId, dGuruName);
      if (!matchedGuru) continue;

      const nextGuruId = pickField(matchedGuru, 'ID', 'ID_Guru', 'idGuru', 'id');
      const nextGuruName = pickField(matchedGuru, 'Nama_Lengkap', 'Nama_Guru', 'namaGuru', 'nama');
      const needsIdFix = Boolean(nextGuruId && nextGuruId !== dGuruId);
      const needsNameSync = Boolean(nextGuruName && nextGuruName !== dGuruName);

      if (needsIdFix || needsNameSync) {
        dudiUpdates.push({
          id: dId,
          ID: dId,
          _sheetRowNumber: d._sheetRowNumber,
          ...(nextGuruId ? { ID_Guru_Pendamping: nextGuruId, idGuruPendamping: nextGuruId } : {}),
          ...(nextGuruName ? { Guru_Pendamping: nextGuruName, guruPendamping: nextGuruName } : {}),
        });
        if (nextGuruId) d.ID_Guru_Pendamping = nextGuruId;
        if (nextGuruName) d.Guru_Pendamping = nextGuruName;
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

  // 3. Reconcile FKs + static display names across Pengajuan, Perizinan, & Plotting
  if (
    scope === 'all' ||
    scope === 'guru' ||
    scope === 'dudi' ||
    scope === 'placements' ||
    scope === 'siswa_pkl' ||
    scope === 'pengajuan' ||
    scope === 'perizinan'
  ) {
    for (const pq of pengajuanList) {
      const pqId = pickField(pq, 'No_Pengajuan', 'noPengajuan', 'id');
      if (!pqId) continue;
      const currDudiId = pickField(pq, 'ID_DUDI', 'idDudi');
      const currDudiName = pickField(pq, 'DUDI_Tujuan', 'dudiTujuan');
      const matchedDudi = resolveDudiRecord(currDudiId, currDudiName);
      const nextDudiId = matchedDudi ? pickField(matchedDudi, 'ID', 'id') : currDudiId;
      const nextDudiName = matchedDudi ? pickField(matchedDudi, 'Nama_DUDI', 'namaDudi') : '';
      const nextDudiAlamat = matchedDudi ? pickField(matchedDudi, 'Alamat', 'alamat') : '';

      const currGuruId = pickField(pq, 'ID_Guru_Pendamping', 'idGuruPendamping');
      const currGuruName = pickField(pq, 'Guru_Pendamping', 'guruPendamping');
      const matchedGuru =
        resolveGuruRecord(currGuruId, currGuruName) ||
        (matchedDudi
          ? resolveGuruRecord(
              pickField(matchedDudi, 'ID_Guru_Pendamping', 'idGuruPendamping'),
              pickField(matchedDudi, 'Guru_Pendamping', 'guruPendamping')
            )
          : undefined);
      const nextGuruId = matchedGuru ? pickField(matchedGuru, 'ID', 'ID_Guru', 'idGuru', 'id') : '';
      const nextGuruName = matchedGuru ? pickField(matchedGuru, 'Nama_Lengkap', 'Nama_Guru', 'namaGuru', 'nama') : '';

      const needsDudiUpdate =
        Boolean(nextDudiId && nextDudiId !== currDudiId) ||
        Boolean(nextDudiName && nextDudiName !== currDudiName);
      const needsGuruUpdate =
        Boolean(nextGuruId && nextGuruId !== currGuruId) ||
        Boolean(nextGuruName && nextGuruName !== currGuruName);

      if (needsDudiUpdate || needsGuruUpdate) {
        pengajuanUpdates.push({
          id: pqId,
          No_Pengajuan: pqId,
          _sheetRowNumber: pq._sheetRowNumber,
          ...(nextDudiId ? { ID_DUDI: nextDudiId, idDudi: nextDudiId } : {}),
          ...(nextDudiName ? { DUDI_Tujuan: nextDudiName, dudiTujuan: nextDudiName } : {}),
          ...(nextDudiAlamat ? { Alamat_DUDI: nextDudiAlamat, alamatDudi: nextDudiAlamat } : {}),
          ...(nextGuruId ? { ID_Guru_Pendamping: nextGuruId, idGuruPendamping: nextGuruId } : {}),
          ...(nextGuruName ? { Guru_Pendamping: nextGuruName, guruPendamping: nextGuruName } : {}),
        });
      }
    }

    for (const iz of perizinanList) {
      const izId = pickField(iz, 'ID_Perizinan', 'noPerizinan', 'id');
      if (!izId) continue;
      const currDudiId = pickField(iz, 'ID_DUDI', 'idDudi');
      const currDudiName = pickField(iz, 'DUDI_Tujuan', 'dudiTujuan');
      const currAlamat = pickField(iz, 'Alamat_DUDI', 'alamatDudi');
      const matchedDudi = resolveDudiRecord(currDudiId, currDudiName);
      if (!matchedDudi) continue;

      const nextDudiId = pickField(matchedDudi, 'ID', 'id');
      const nextDudiName = pickField(matchedDudi, 'Nama_DUDI', 'namaDudi');
      const nextAlamat = pickField(matchedDudi, 'Alamat', 'alamat');
      if (
        (nextDudiId && nextDudiId !== currDudiId) ||
        (nextDudiName && nextDudiName !== currDudiName) ||
        (nextAlamat && nextAlamat !== currAlamat)
      ) {
        perizinanUpdates.push({
          id: izId,
          ID_Perizinan: izId,
          _sheetRowNumber: iz._sheetRowNumber,
          ...(nextDudiId ? { ID_DUDI: nextDudiId, idDudi: nextDudiId } : {}),
          ...(nextDudiName ? { DUDI_Tujuan: nextDudiName, dudiTujuan: nextDudiName } : {}),
          ...(nextAlamat ? { Alamat_DUDI: nextAlamat, alamatDudi: nextAlamat } : {}),
        });
      }
    }

    for (const p of placements) {
      const pId = pickField(p, 'ID_Penempatan', 'idPenempatan', 'id');
      if (!pId) continue;
      const currDudiId = pickField(p, 'ID_DUDI', 'idDudi');
      const currDudiName = pickField(p, 'Nama_DUDI', 'namaDudi', 'DUDI_Tujuan');
      const matchedDudi = resolveDudiRecord(currDudiId, currDudiName);
      const nextDudiId = matchedDudi ? pickField(matchedDudi, 'ID', 'id') : currDudiId;
      const nextDudiName = matchedDudi ? pickField(matchedDudi, 'Nama_DUDI', 'namaDudi') : '';

      const currGuruId = pickField(p, 'ID_Guru_Pendamping', 'idGuruPendamping');
      const currGuruName = pickField(p, 'Guru_Pendamping', 'guruPendamping');
      const matchedGuru =
        resolveGuruRecord(currGuruId, currGuruName) ||
        (matchedDudi
          ? resolveGuruRecord(
              pickField(matchedDudi, 'ID_Guru_Pendamping', 'idGuruPendamping'),
              pickField(matchedDudi, 'Guru_Pendamping', 'guruPendamping')
            )
          : undefined);
      const nextGuruId = matchedGuru ? pickField(matchedGuru, 'ID', 'ID_Guru', 'idGuru', 'id') : '';
      const nextGuruName = matchedGuru ? pickField(matchedGuru, 'Nama_Lengkap', 'Nama_Guru', 'namaGuru', 'nama') : '';

      const needsDudiUpdate =
        Boolean(nextDudiId && nextDudiId !== currDudiId) ||
        Boolean(nextDudiName && nextDudiName !== currDudiName);
      const needsGuruUpdate =
        Boolean(nextGuruId && nextGuruId !== currGuruId) ||
        Boolean(nextGuruName && nextGuruName !== currGuruName);

      if (needsDudiUpdate || needsGuruUpdate) {
        placementUpdates.push({
          id: pId,
          ID_Penempatan: pId,
          _sheetRowNumber: p._sheetRowNumber,
          ...(nextDudiId ? { ID_DUDI: nextDudiId, idDudi: nextDudiId } : {}),
          ...(nextDudiName ? { Nama_DUDI: nextDudiName, namaDudi: nextDudiName } : {}),
          ...(nextGuruId ? { ID_Guru_Pendamping: nextGuruId, idGuruPendamping: nextGuruId } : {}),
          ...(nextGuruName ? { Guru_Pendamping: nextGuruName, guruPendamping: nextGuruName } : {}),
        });
      }
    }
  }

  // 4. Reconcile Monitoring_5_Tahap & Nilai_Dan_Sertifikat FKs + static display names
  if (scope === 'all' || scope === 'guru' || scope === 'dudi' || scope === 'monitoring' || scope === 'sertifikat') {
    for (const m of monitoringList) {
      const mId = pickField(m, 'ID_Monitoring', 'idMonitoring', 'id');
      if (!mId) continue;
      const nisDigits = stripNisSymbols(pickField(m, 'NIS', 'nis'));
      const plt = nisDigits ? placementByNis.get(nisDigits) : undefined;
      const currPltId = pickField(m, 'ID_Penempatan', 'idPenempatan');
      const nextPltId = currPltId || (plt ? pickField(plt, 'ID_Penempatan', 'idPenempatan', 'id') : '');

      const currDudiId = pickField(m, 'ID_DUDI', 'idDudi');
      const currDudiName = pickField(m, 'DUDI_Tujuan', 'dudiTujuan');
      const currDudiAlamat = pickField(m, 'Alamat_DUDI', 'alamatDudi');
      const matchedDudi =
        resolveDudiRecord(currDudiId, currDudiName) ||
        (plt
          ? resolveDudiRecord(
              pickField(plt, 'ID_DUDI', 'idDudi'),
              pickField(plt, 'Nama_DUDI', 'namaDudi', 'DUDI_Tujuan')
            )
          : undefined);
      const nextDudiId = matchedDudi ? pickField(matchedDudi, 'ID', 'id') : currDudiId;
      const nextDudiName = matchedDudi ? pickField(matchedDudi, 'Nama_DUDI', 'namaDudi') : '';
      const nextDudiAlamat = matchedDudi ? pickField(matchedDudi, 'Alamat', 'alamat') : '';

      const currGuruId = pickField(m, 'ID_Guru_Pendamping', 'idGuruPendamping');
      const currGuruName = pickField(m, 'Guru_Pendamping', 'guruPendamping');
      const matchedGuru =
        resolveGuruRecord(currGuruId, currGuruName) ||
        (plt
          ? resolveGuruRecord(
              pickField(plt, 'ID_Guru_Pendamping', 'idGuruPendamping'),
              pickField(plt, 'Guru_Pendamping', 'guruPendamping')
            )
          : undefined) ||
        (matchedDudi
          ? resolveGuruRecord(
              pickField(matchedDudi, 'ID_Guru_Pendamping', 'idGuruPendamping'),
              pickField(matchedDudi, 'Guru_Pendamping', 'guruPendamping')
            )
          : undefined);
      const nextGuruId = matchedGuru ? pickField(matchedGuru, 'ID', 'ID_Guru', 'idGuru', 'id') : '';
      const nextGuruName = matchedGuru ? pickField(matchedGuru, 'Nama_Lengkap', 'Nama_Guru', 'namaGuru', 'nama') : '';

      const needsPltUpdate = Boolean(nextPltId && nextPltId !== currPltId);
      const needsDudiUpdate =
        Boolean(nextDudiId && nextDudiId !== currDudiId) ||
        Boolean(nextDudiName && nextDudiName !== currDudiName) ||
        Boolean(nextDudiAlamat && nextDudiAlamat !== currDudiAlamat);
      const needsGuruUpdate =
        Boolean(nextGuruId && nextGuruId !== currGuruId) ||
        Boolean(nextGuruName && nextGuruName !== currGuruName);

      if (needsPltUpdate || needsDudiUpdate || needsGuruUpdate) {
        monitoringUpdates.push({
          id: mId,
          ID_Monitoring: mId,
          _sheetRowNumber: m._sheetRowNumber,
          ...(nextPltId ? { ID_Penempatan: nextPltId, idPenempatan: nextPltId } : {}),
          ...(nextDudiId ? { ID_DUDI: nextDudiId, idDudi: nextDudiId } : {}),
          ...(nextDudiName ? { DUDI_Tujuan: nextDudiName, dudiTujuan: nextDudiName } : {}),
          ...(nextDudiAlamat ? { Alamat_DUDI: nextDudiAlamat, alamatDudi: nextDudiAlamat } : {}),
          ...(nextGuruId ? { ID_Guru_Pendamping: nextGuruId, idGuruPendamping: nextGuruId } : {}),
          ...(nextGuruName ? { Guru_Pendamping: nextGuruName, guruPendamping: nextGuruName } : {}),
        });
      }
    }

    for (const sr of sertifikatList) {
      const srId = pickField(sr, 'ID_Penempatan', 'idPenempatan', 'id');
      if (!srId) continue;
      const nisDigits = stripNisSymbols(pickField(sr, 'NIS', 'nis'));
      const plt = nisDigits ? placementByNis.get(nisDigits) : undefined;
      const currDudiId = pickField(sr, 'ID_DUDI', 'idDudi');
      const currDudiName = pickField(sr, 'DUDI_Tujuan', 'dudiTujuan');
      const matchedDudi =
        resolveDudiRecord(currDudiId, currDudiName) ||
        (plt
          ? resolveDudiRecord(
              pickField(plt, 'ID_DUDI', 'idDudi'),
              pickField(plt, 'Nama_DUDI', 'namaDudi', 'DUDI_Tujuan')
            )
          : undefined);
      const nextDudiId = matchedDudi ? pickField(matchedDudi, 'ID', 'id') : currDudiId;
      const nextDudiName = matchedDudi ? pickField(matchedDudi, 'Nama_DUDI', 'namaDudi') : '';

      if (
        (nextDudiId && nextDudiId !== currDudiId) ||
        (nextDudiName && nextDudiName !== currDudiName)
      ) {
        sertifikatUpdates.push({
          id: srId,
          ID_Penempatan: srId,
          _sheetRowNumber: sr._sheetRowNumber,
          ...(nextDudiId ? { ID_DUDI: nextDudiId, idDudi: nextDudiId } : {}),
          ...(nextDudiName ? { DUDI_Tujuan: nextDudiName, dudiTujuan: nextDudiName } : {}),
        });
      }
    }
  }

  // Flush batched BULK_UPDATE per mutated sheet (in parallel for speed)
  const [
    flushedDudi,
    flushedKelas,
    flushedSiswa,
    flushedPengajuan,
    ,
    flushedPlacements,
    flushedMonitoring,
  ] = await Promise.all([
    flushBulkUpdates('Master_DUDI', dudiUpdates),
    flushBulkUpdates('Master_Kelas_Walas', kelasUpdates),
    flushBulkUpdates('Master_Siswa_XI', siswaUpdates),
    flushBulkUpdates('Data_Pengajuan_PKL', pengajuanUpdates),
    flushBulkUpdates('Data_Perizinan_PKL', perizinanUpdates),
    flushBulkUpdates('Plotting_Pemberangkatan', placementUpdates),
    flushBulkUpdates('Monitoring_5_Tahap', monitoringUpdates),
    flushBulkUpdates('Nilai_Dan_Sertifikat', sertifikatUpdates),
  ]);

  updatedDudi = flushedDudi;
  updatedKelas = flushedKelas;
  updatedJurusan = flushedSiswa;
  updatedPlacements = flushedPlacements;
  if (scope === 'guru') {
    updatedGuru = flushedDudi + flushedPengajuan + flushedPlacements + flushedMonitoring;
  }

  let formulasApplied = false;
  if (scope === 'all') {
    const migRes = await callGasCustomAction('MIGRATE_RELATIONAL_FORMULAS').catch(() => null);
    formulasApplied = Boolean(migRes?.data?.status === 'success');
  }

  if (scope === 'all') {
    await invalidateServerCaches();
  }

  return {
    updatedPlacements,
    updatedDudi,
    updatedGuru,
    updatedJurusan,
    updatedKelas,
    formulasApplied,
  };
}
