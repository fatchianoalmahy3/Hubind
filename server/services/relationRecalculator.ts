import { stripNisSymbols } from '../../src/core/utils/nisHelpers';
import { pickField } from '../../src/core/utils/rowFieldHelpers';
import { fetchBatchSheetsViaGas, writeLiveSheetViaGas } from './sheetsTransport';

export interface RelationRecalculationSummary {
  updatedPlacements: number;
  updatedDudi: number;
  updatedGuru: number;
  updatedJurusan: number;
  updatedKelas: number;
}

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
  ];

  const { sheets } = await fetchBatchSheetsViaGas(
    neededTables,
    new Set(['Data_Pengajuan_PKL', 'Data_Perizinan_PKL', 'Plotting_Pemberangkatan']),
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

  const norm = (v: unknown) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const studentIdentity = (nis?: unknown, nama?: unknown, kelas?: unknown) => {
    const digitsNis = stripNisSymbols(nis);
    if (digitsNis) return `nis:${digitsNis}`;
    const cleanNis = String(nis ?? '').trim();
    if (cleanNis && cleanNis !== '-') return `nis:${cleanNis.toLowerCase()}`;
    const cleanNama = norm(nama);
    return cleanNama ? `nama:${cleanNama}|${norm(kelas)}` : '';
  };

  let updatedDudi = 0;
  let updatedGuru = 0;
  let updatedJurusan = 0;
  let updatedKelas = 0;

  // A. DUDI & Guru placement counters (hanya status aktif: Terjadwal / Sedang Berjalan)
  if (scope === 'all' || scope === 'placements' || scope === 'dudi' || scope === 'guru' || scope === 'siswa_pkl') {
    const CLOSED_STATUSES = new Set(['dibatalkan', 'batal', 'pindah dudi', 'selesai pkl']);
    const activePlacements = placements.filter(
      (p) => !CLOSED_STATUSES.has(norm(pickField(p, 'Status_Penempatan', 'statusPenempatan')))
    );

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

    const resolveCanonicalGuru = (idVal: string, namaVal: string) => {
      if (idVal && guruById.has(idVal)) return guruById.get(idVal);
      const nk = namaVal ? norm(namaVal) : '';
      if (nk && guruNameCount.get(nk) === 1) return guruByName.get(nk);
      return undefined;
    };

    if (scope === 'all' || scope === 'guru' || scope === 'dudi') {
      for (const d of dudiList) {
        const dId = pickField(d, 'ID', 'ID_DUDI', 'idDudi', 'id');
        if (!dId) continue;
        const dGuruId = pickField(d, 'ID_Guru_Pendamping', 'idGuruPendamping');
        const dGuruName = pickField(d, 'Guru_Pendamping', 'guruPendamping');
        const matchedG = resolveCanonicalGuru(dGuruId, dGuruName);
        if (!matchedG) continue;
        const gId = pickField(matchedG, 'ID', 'ID_Guru', 'idGuru', 'id');
        const gName = pickField(matchedG, 'Nama_Lengkap', 'Nama_Guru', 'namaGuru', 'nama');
        if (gId && gName && (dGuruId !== gId || dGuruName !== gName)) {
          await writeLiveSheetViaGas('Master_DUDI', 'UPDATE', {
            ...d,
            id: dId,
            ID: dId,
            ID_DUDI: dId,
            ID_Guru_Pendamping: gId,
            idGuruPendamping: gId,
            Guru_Pendamping: gName,
            guruPendamping: gName,
          }).catch(() => {});
          d.ID_Guru_Pendamping = gId;
          d.Guru_Pendamping = gName;
          updatedDudi++;
        }
      }
    }

    const dudiCounts = new Map<string, number>();
    const guruCounts = new Map<string, number>();

    for (const p of activePlacements) {
      const pDudiId = pickField(p, 'ID_DUDI', 'idDudi');
      const pDudiName = pickField(p, 'Nama_DUDI', 'namaDudi', 'DUDI_Tujuan');
      const matchedDudi = (pDudiId && dudiById.get(pDudiId)) || (pDudiName && dudiByName.get(norm(pDudiName)));
      if (matchedDudi) {
        const dId = pickField(matchedDudi, 'ID', 'ID_DUDI', 'idDudi', 'id');
        if (dId) dudiCounts.set(dId, (dudiCounts.get(dId) || 0) + 1);
      }

      const pGuruId = pickField(p, 'ID_Guru_Pendamping', 'idGuruPendamping');
      const pGuruName = pickField(p, 'Guru_Pendamping', 'guruPendamping');
      const matchedGuru = resolveCanonicalGuru(pGuruId, pGuruName);
      if (matchedGuru) {
        const gId = pickField(matchedGuru, 'ID', 'ID_Guru', 'idGuru', 'id');
        if (gId) guruCounts.set(gId, (guruCounts.get(gId) || 0) + 1);
      }
    }

    for (const d of dudiList) {
      const dId = pickField(d, 'ID', 'ID_DUDI', 'idDudi', 'id');
      const nextCount = dudiCounts.get(dId) || 0;
      const currCount = Number(d.Terisi ?? d.terisi ?? 0) || 0;
      if (dId && currCount !== nextCount) {
        await writeLiveSheetViaGas('Master_DUDI', 'UPDATE', {
          ...d,
          id: dId,
          ID: dId,
          ID_DUDI: dId,
          Terisi: nextCount,
          terisi: nextCount,
        });
        updatedDudi++;
      }
    }

    for (const g of guruList) {
      const gId = pickField(g, 'ID', 'ID_Guru', 'idGuru', 'id');
      const nextCount = guruCounts.get(gId) || 0;
      const currCount = Number(g.Jumlah_Bimbingan ?? g.jumlahBimbingan ?? 0) || 0;
      if (gId && currCount !== nextCount) {
        await writeLiveSheetViaGas('Master_Guru_Pendamping', 'UPDATE', {
          ...g,
          id: gId,
          ID: gId,
          ID_Guru: gId,
          Jumlah_Bimbingan: nextCount,
          jumlahBimbingan: nextCount,
        });
        updatedGuru++;
      }
    }
  }

  // B. Jurusan counters (kuotaSiswa + totalTerdaftar)
  if (scope === 'all' || scope === 'jurusan' || scope === 'siswa' || scope === 'pengajuan' || scope === 'perizinan' || scope === 'siswa_pkl') {
    const jurusanByKey = new Map<string, any>();
    for (const j of jurusanList) {
      const nama = pickField(j, 'Nama_Jurusan', 'namaJurusan', 'nama');
      const kode = pickField(j, 'Kode_Jurusan', 'kodeJurusan', 'kode', 'id');
      if (nama) jurusanByKey.set(norm(nama), j);
      if (kode) jurusanByKey.set(norm(kode), j);
    }

    const siswaByNis = new Map<string, any>();
    const siswaByName = new Map<string, any>();
    const siswaNameCounts = new Map<string, number>();
    for (const s of siswaList) {
      const nis = pickField(s, 'NIS', 'nis');
      const nisDigits = stripNisSymbols(nis);
      const nama = pickField(s, 'Nama_Lengkap', 'namaLengkap', 'nama');
      if (nisDigits) siswaByNis.set(nisDigits, s);
      if (nis) siswaByNis.set(nis.toLowerCase(), s);
      if (nama) {
        const nm = norm(nama);
        siswaNameCounts.set(nm, (siswaNameCounts.get(nm) || 0) + 1);
        siswaByName.set(nm, s);
      }
    }
    const resolveMasterSiswa = (nisRaw: unknown, namaRaw: unknown) => {
      const clean = stripNisSymbols(nisRaw);
      const nisLower = String(nisRaw ?? '').trim().toLowerCase();
      if (clean && siswaByNis.has(clean)) return siswaByNis.get(clean);
      if (nisLower && siswaByNis.has(nisLower)) return siswaByNis.get(nisLower);
      if (clean) return undefined;
      const nm = norm(namaRaw);
      return nm && siswaNameCounts.get(nm) === 1 ? siswaByName.get(nm) : undefined;
    };

    const kuotaCounts = new Map<string, number>();
    const registeredSets = new Map<string, Set<string>>();
    const addRegistered = (jurId: string, key: string) => {
      if (!key) return;
      let set = registeredSets.get(jurId);
      if (!set) {
        set = new Set<string>();
        registeredSets.set(jurId, set);
      }
      set.add(key);
    };

    for (const s of siswaList) {
      const jur = pickField(s, 'ID_Jurusan', 'jurusan', 'Jurusan');
      const matchedJur = jur ? jurusanByKey.get(norm(jur)) : undefined;
      if (!matchedJur) continue;
      const jId = pickField(matchedJur, 'Kode_Jurusan', 'kode', 'id');
      kuotaCounts.set(jId, (kuotaCounts.get(jId) || 0) + 1);
      const statusNorm = norm(pickField(s, 'Status_PKL', 'statusPKL'));
      if (statusNorm && statusNorm !== 'belum daftar') {
        addRegistered(
          jId,
          studentIdentity(
            pickField(s, 'NIS', 'nis'),
            pickField(s, 'Nama_Lengkap', 'namaLengkap', 'nama'),
            pickField(s, 'Kelas', 'kelas')
          )
        );
      }
    }

    for (const reqRow of pengajuanList) {
      if (norm(pickField(reqRow, 'Status_Kakomli', 'statusKakomli')) === 'ditolak') continue;
      if (norm(pickField(reqRow, 'Status_Hubin', 'statusHubin')) === 'batal') continue;
      const rNis = pickField(reqRow, 'NIS', 'nis');
      const rNama = pickField(reqRow, 'Nama_Siswa', 'namaSiswa');
      const ms = resolveMasterSiswa(rNis, rNama);
      const jur = (ms ? pickField(ms, 'ID_Jurusan', 'jurusan') : '') || pickField(reqRow, 'Jurusan', 'jurusan');
      const matchedJur = jur ? jurusanByKey.get(norm(jur)) : undefined;
      if (!matchedJur) continue;
      const jId = pickField(matchedJur, 'Kode_Jurusan', 'kode', 'id');
      addRegistered(
        jId,
        studentIdentity(
          (ms ? pickField(ms, 'NIS', 'nis') : '') || rNis,
          (ms ? pickField(ms, 'Nama_Lengkap', 'nama') : '') || rNama,
          (ms ? pickField(ms, 'Kelas', 'kelas') : '') || pickField(reqRow, 'Kelas', 'kelas')
        )
      );
    }

    for (const izn of perizinanList) {
      const iNis = pickField(izn, 'NIS', 'nis');
      const iNama = pickField(izn, 'Nama_Siswa', 'namaSiswa');
      const ms = resolveMasterSiswa(iNis, iNama);
      const jur = (ms ? pickField(ms, 'ID_Jurusan', 'jurusan') : '') || pickField(izn, 'Jurusan', 'jurusan');
      const matchedJur = jur ? jurusanByKey.get(norm(jur)) : undefined;
      if (!matchedJur) continue;
      const jId = pickField(matchedJur, 'Kode_Jurusan', 'kode', 'id');
      addRegistered(
        jId,
        studentIdentity(
          (ms ? pickField(ms, 'NIS', 'nis') : '') || iNis,
          (ms ? pickField(ms, 'Nama_Lengkap', 'nama') : '') || iNama,
          (ms ? pickField(ms, 'Kelas', 'kelas') : '') || pickField(izn, 'Kelas', 'kelas')
        )
      );
    }

    for (const p of placements) {
      const statusPlt = norm(pickField(p, 'Status_Penempatan', 'statusPenempatan'));
      if (statusPlt === 'dibatalkan' || statusPlt === 'batal') continue;
      const pNis = pickField(p, 'NIS', 'nis');
      const pNama = pickField(p, 'Nama_Siswa', 'namaSiswa');
      const ms = resolveMasterSiswa(pNis, pNama);
      const jur = ms ? pickField(ms, 'ID_Jurusan', 'jurusan') : '';
      const matchedJur = jur ? jurusanByKey.get(norm(jur)) : undefined;
      if (!matchedJur) continue;
      const jId = pickField(matchedJur, 'Kode_Jurusan', 'kode', 'id');
      addRegistered(
        jId,
        studentIdentity(
          (ms ? pickField(ms, 'NIS', 'nis') : '') || pNis,
          (ms ? pickField(ms, 'Nama_Lengkap', 'nama') : '') || pNama,
          ms ? pickField(ms, 'Kelas', 'kelas') : ''
        )
      );
    }

    for (const j of jurusanList) {
      const jId = pickField(j, 'Kode_Jurusan', 'kode', 'id');
      const nextKuota = kuotaCounts.get(jId) || 0;
      const nextTerdaftar = registeredSets.get(jId)?.size || 0;
      const currKuota = Number(j.Target_Kuota ?? j.kuotaSiswa ?? 0) || 0;
      const currTerdaftar = Number(j.Siswa_Terdaftar ?? j.totalTerdaftar ?? 0) || 0;
      if (jId && (currKuota !== nextKuota || currTerdaftar !== nextTerdaftar)) {
        await writeLiveSheetViaGas('Master_Jurusan', 'UPDATE', {
          ...j,
          id: jId,
          Kode_Jurusan: jId,
          Target_Kuota: nextKuota,
          kuotaSiswa: nextKuota,
          Siswa_Terdaftar: nextTerdaftar,
          totalTerdaftar: nextTerdaftar,
        });
        updatedJurusan++;
      }
    }
  }

  // C. Kelas student counters
  if (scope === 'all' || scope === 'kelas' || scope === 'siswa') {
    const kelasByName = new Map<string, any>();
    for (const k of kelasList) {
      const nama = pickField(k, 'Nama_Kelas', 'namaKelas');
      if (nama) kelasByName.set(norm(nama), k);
    }

    const kelasCounts = new Map<string, number>();
    for (const s of siswaList) {
      const kls = pickField(s, 'Kelas', 'kelas');
      const matchedKls = kls ? kelasByName.get(norm(kls)) : undefined;
      if (matchedKls) {
        const kId = pickField(matchedKls, 'ID_Kelas', 'idKelas', 'id');
        kelasCounts.set(kId, (kelasCounts.get(kId) || 0) + 1);
      }
    }

    for (const k of kelasList) {
      const kId = pickField(k, 'ID_Kelas', 'idKelas', 'id');
      const nextCount = kelasCounts.get(kId) || 0;
      const currCount = Number(k.Jumlah_Siswa ?? k.jumlahSiswa ?? 0) || 0;
      if (kId && currCount !== nextCount) {
        await writeLiveSheetViaGas('Master_Kelas_Walas', 'UPDATE', {
          ...k,
          id: kId,
          ID_Kelas: kId,
          Jumlah_Siswa: nextCount,
          jumlahSiswa: nextCount,
        });
        updatedKelas++;
      }
    }
  }

  return {
    updatedPlacements: 0,
    updatedDudi,
    updatedGuru,
    updatedJurusan,
    updatedKelas,
  };
}
