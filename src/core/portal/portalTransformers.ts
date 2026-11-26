import type { Jurusan, MonitoringStageControl } from '../types/schema';
import {
  buildStudentMonitoringSummary,
  pickRecommendedStageForControl,
  resolveMonitoringStagePolicy,
} from '../utils/monitoringHelpers';
import { stripNisSymbols } from '../utils/nisHelpers';
import { normalizeStr, pickField } from '../utils/rowFieldHelpers';

export function mapPublicDudiRows(rows: any[]) {
  return rows
    .filter((d: any) => pickField(d, 'Nama_DUDI', 'namaDudi', 'nama_dudi', 'nama') !== '')
    .map((d: any, idx: number) => {
      const namaPemimpin = pickField(d, 'Nama_Pemimpin', 'namaPemimpin', 'nama_pemimpin', 'pimpinan');
      const namaPic = pickField(d, 'Nama_PIC', 'namaPic', 'nama_pic');
      const kontakPic = pickField(d, 'Kontak_PIC', 'kontakPic', 'kontak_pic');
      const noTelpDudi =
        pickField(d, 'No_Telp_DUDI', 'noTelpDudi', 'no_telp_dudi', 'telepon') || kontakPic;
      const linkMaps = pickField(d, 'Link_Maps', 'linkMaps', 'link_maps', 'mapsUrl');
      return {
        id: pickField(d, 'ID', 'id') || `dudi_${idx + 1}`,
        nama_dudi: pickField(d, 'Nama_DUDI', 'namaDudi', 'nama_dudi', 'nama'),
        bidang_usaha: pickField(d, 'Bidang_Keahlian', 'bidangKeahlian', 'bidang_usaha') || '-',
        alamat: pickField(d, 'Alamat', 'alamat'),
        kota: pickField(d, 'Wilayah_Kota', 'wilayahKota', 'kota'),
        kuota_maksimal: Number(d.Kuota_Maksimal ?? d.kuotaMaksimal ?? 0),
        terisi: Number(d.Terisi ?? d.terisi ?? 0),
        status: pickField(d, 'Status_Kerjasama', 'statusKerjasama', 'status') || 'Aktif',
        nama_pemimpin: namaPemimpin,
        nama_pic: namaPic,
        kontak_pic: kontakPic,
        no_telp_dudi: noTelpDudi,
        link_maps: linkMaps,
        id_guru_pendamping: pickField(d, 'ID_Guru_Pendamping', 'idGuruPendamping'),
        guru_pendamping: pickField(d, 'Guru_Pendamping', 'guruPendamping'),
        hari_kerja: pickField(d, 'Hari_Kerja', 'hariKerja', 'hari_kerja'),
        jam_kerja: pickField(d, 'Jam_Kerja', 'jamKerja', 'jam_kerja'),
        pimpinan: namaPemimpin || namaPic,
        telepon: noTelpDudi,
      };
    });
}

export function mapPublicPetugasRows(rows: any[]) {
  return rows
    .filter((g: any) => pickField(g, 'Nama_Lengkap', 'Nama_Guru', 'namaGuru', 'nama', 'Nama') !== '')
    .map((g: any, idx: number) => ({
      id: pickField(g, 'ID', 'ID_Guru', 'idGuru', 'id') || `guru_${idx + 1}`,
      nama: pickField(g, 'Nama_Lengkap', 'Nama_Guru', 'namaGuru', 'nama', 'Nama'),
      nip: pickField(g, 'NIP', 'nip') || '-',
      peran: pickField(g, 'Peran_Utama', 'peranUtama', 'Peran', 'peran') || 'Guru Pendamping',
      email: pickField(g, 'Email_Google', 'email', 'emailGoogle'),
    }));
}

export function mapPublicStudentRecord(student: any) {
  const canonicalNisRaw = pickField(student, 'NIS', 'nis');
  const canonicalNis = stripNisSymbols(canonicalNisRaw) || canonicalNisRaw;
  return {
    id: pickField(student, 'ID', 'id', 'NIS', 'nis'),
    nama: pickField(student, 'Nama_Lengkap', 'nama', 'namaLengkap'),
    nis: canonicalNis,
    nik: pickField(student, 'NIK', 'nik'),
    kelas: pickField(student, 'Kelas', 'kelas'),
    jurusan: pickField(student, 'ID_Jurusan', 'jurusan', 'Jurusan', 'idJurusan'),
    telepon: pickField(student, 'No_HP_Siswa', 'noHpSiswa', 'telepon', 'noHp'),
    jk: pickField(student, 'Jenis_Kelamin', 'jenisKelamin', 'jk') || 'Laki-laki',
    alamat_domisili: pickField(
      student,
      'Alamat_Domisili',
      'alamatDomisili',
      'alamat_domisili',
      'Alamat',
      'alamat'
    ),
    nama_wali: pickField(
      student,
      'Nama_Ortu_Wali',
      'namaOrtuWali',
      'nama_ortu_wali',
      'Nama_Wali',
      'nama_wali'
    ),
    telepon_wali: pickField(
      student,
      'No_Ortu_Wali',
      'noOrtuWali',
      'no_ortu_wali',
      'Telepon_Wali',
      'telepon_wali'
    ),
  };
}

export function aggregatePetugasDudiGroups(params: {
  petugasNama: string;
  petugasId: string;
  plottingRows: any[];
  dudiRows: any[];
  pengajuanRows: any[];
}) {
  const { petugasNama, petugasId, plottingRows, dudiRows, pengajuanRows } = params;

  const dudiMapById = new Map<string, any>();
  const dudiMapByName = new Map<string, any>();
  for (const d of dudiRows) {
    const id = pickField(d, 'ID', 'id');
    const nama = pickField(d, 'Nama_DUDI', 'namaDudi', 'nama_dudi');
    if (id) dudiMapById.set(id, d);
    if (nama) dudiMapByName.set(normalizeStr(nama), d);
  }

  const pengajuanMapsByDudi = new Map<string, string>();
  const pengajuanHariByDudi = new Map<string, string>();
  const pengajuanJamByDudi = new Map<string, string>();
  for (const reqRow of pengajuanRows) {
    const did = pickField(reqRow, 'ID_DUDI', 'idDudi');
    const dname = normalizeStr(pickField(reqRow, 'DUDI_Tujuan', 'dudiTujuan'));
    const lm = pickField(reqRow, 'Link_Maps', 'linkMaps', 'link_maps');
    const hk = pickField(reqRow, 'Hari_Kerja', 'hariKerja', 'hari_kerja');
    const jk = pickField(reqRow, 'Jam_Kerja', 'jamKerja', 'jam_kerja');
    if (lm) {
      if (did && !pengajuanMapsByDudi.has(did)) pengajuanMapsByDudi.set(did, lm);
      if (dname && !pengajuanMapsByDudi.has(dname)) pengajuanMapsByDudi.set(dname, lm);
    }
    if (hk) {
      if (did && !pengajuanHariByDudi.has(did)) pengajuanHariByDudi.set(did, hk);
      if (dname && !pengajuanHariByDudi.has(dname)) pengajuanHariByDudi.set(dname, hk);
    }
    if (jk) {
      if (did && !pengajuanJamByDudi.has(did)) pengajuanJamByDudi.set(did, jk);
      if (dname && !pengajuanJamByDudi.has(dname)) pengajuanJamByDudi.set(dname, jk);
    }
  }

  const grouped = new Map<string, { dudi: any; studentNisSet: Set<string> }>();
  const targetNamaNorm = normalizeStr(petugasNama);

  const matchesTeacherFields = (guruIdRaw: unknown, guruNamaRaw: unknown): boolean => {
    const rowGuruId = String(guruIdRaw || '').trim();
    const rowGuruNama = normalizeStr(guruNamaRaw);
    return Boolean(
      (petugasId && rowGuruId && rowGuruId === petugasId) ||
        (targetNamaNorm &&
          rowGuruNama &&
          (rowGuruNama === targetNamaNorm ||
            rowGuruNama.includes(targetNamaNorm) ||
            targetNamaNorm.includes(rowGuruNama)))
    );
  };

  const matchesRowOrMasterTeacher = (row: any, master?: any): boolean => {
    const rowGuruId = pickField(row, 'ID_Guru_Pendamping', 'idGuruPendamping');
    const rowGuruNama = pickField(row, 'Guru_Pendamping', 'guruPendamping');
    if (rowGuruId) {
      if (petugasId) {
        return rowGuruId === petugasId;
      }
      return matchesTeacherFields(rowGuruId, rowGuruNama);
    }
    if (rowGuruNama) {
      if (matchesTeacherFields('', rowGuruNama)) return true;
      if (master && petugasId) {
        const masterGuruId = pickField(master, 'ID_Guru_Pendamping', 'idGuruPendamping');
        if (masterGuruId && masterGuruId === petugasId) return true;
      }
      return false;
    }
    if (master) {
      const masterGuruId = pickField(master, 'ID_Guru_Pendamping', 'idGuruPendamping');
      const masterGuruNama = pickField(master, 'Guru_Pendamping', 'guruPendamping');
      return matchesTeacherFields(masterGuruId, masterGuruNama);
    }
    return false;
  };

  const ensureDudiGroup = (
    key: string,
    master: any | undefined,
    fallbackId: string,
    resolvedName: string,
    fallbackRow?: any
  ) => {
    if (grouped.has(key)) return;
    const masterId = pickField(master || {}, 'ID', 'id') || fallbackId || key;
    const resolvedKontak =
      pickField(master || {}, 'No_Telp_DUDI', 'noTelpDudi', 'Kontak_PIC', 'kontakPic') ||
      (fallbackRow
        ? pickField(fallbackRow, 'No_Telp_DUDI', 'noTelpDudi', 'Kontak_PIC', 'kontakPic')
        : '') ||
      '-';
    const resolvedMaps =
      pickField(master || {}, 'Link_Maps', 'linkMaps', 'link_maps') ||
      (fallbackRow ? pickField(fallbackRow, 'Link_Maps', 'linkMaps', 'link_maps') : '') ||
      pengajuanMapsByDudi.get(masterId) ||
      pengajuanMapsByDudi.get(key) ||
      '';
    const resolvedHari =
      pickField(master || {}, 'Hari_Kerja', 'hariKerja', 'hari_kerja') ||
      (fallbackRow ? pickField(fallbackRow, 'Hari_Kerja', 'hariKerja', 'hari_kerja') : '') ||
      pengajuanHariByDudi.get(masterId) ||
      pengajuanHariByDudi.get(key) ||
      '';
    const resolvedJam =
      pickField(master || {}, 'Jam_Kerja', 'jamKerja', 'jam_kerja') ||
      (fallbackRow ? pickField(fallbackRow, 'Jam_Kerja', 'jamKerja', 'jam_kerja') : '') ||
      pengajuanJamByDudi.get(masterId) ||
      pengajuanJamByDudi.get(key) ||
      '';
    grouped.set(key, {
      dudi: {
        id: masterId,
        nama: resolvedName,
        alamat:
          pickField(master || {}, 'Alamat', 'alamat') ||
          (fallbackRow ? pickField(fallbackRow, 'Alamat_DUDI', 'alamatDudi') : '') ||
          '-',
        bidang:
          pickField(master || {}, 'Bidang_Keahlian', 'bidangKeahlian') ||
          (fallbackRow ? pickField(fallbackRow, 'Bidang_Pekerjaan', 'bidangPekerjaan') : '') ||
          '-',
        namaPemimpin:
          pickField(master || {}, 'Nama_Pemimpin', 'namaPemimpin') ||
          (fallbackRow ? pickField(fallbackRow, 'Nama_Pemimpin', 'namaPemimpin') : '') ||
          '',
        pic:
          pickField(master || {}, 'Nama_PIC', 'namaPic') ||
          (fallbackRow ? pickField(fallbackRow, 'Nama_PIC', 'namaPic') : '') ||
          '-',
        kontak: resolvedKontak,
        hariKerja: resolvedHari,
        jamKerja: resolvedJam,
        linkMaps: resolvedMaps,
        kuota: Number(master?.Kuota_Maksimal ?? master?.kuotaMaksimal ?? 0),
      },
      studentNisSet: new Set<string>(),
    });
  };

  for (const p of plottingRows) {
    const statusPlt = normalizeStr(pickField(p, 'Status_Penempatan', 'statusPenempatan'));
    if (statusPlt === 'dibatalkan' || statusPlt === 'batal' || statusPlt === 'pindah dudi') continue;

    const dudiId = pickField(p, 'ID_DUDI', 'idDudi');
    const dudiNamaRaw = pickField(p, 'Nama_DUDI', 'namaDudi');
    const master =
      (dudiId && dudiMapById.get(dudiId)) ||
      (dudiNamaRaw && dudiMapByName.get(normalizeStr(dudiNamaRaw)));

    if (!matchesRowOrMasterTeacher(p, master)) continue;

    const resolvedName = pickField(master || {}, 'Nama_DUDI', 'namaDudi') || dudiNamaRaw;
    if (!resolvedName) continue;

    const key = normalizeStr(resolvedName);
    ensureDudiGroup(key, master, dudiId, resolvedName);
    const rawNis = pickField(p, 'NIS', 'nis');
    const canonicalStudentKey =
      stripNisSymbols(rawNis) || normalizeStr(pickField(p, 'Nama_Siswa', 'namaSiswa'));
    if (canonicalStudentKey) grouped.get(key)!.studentNisSet.add(canonicalStudentKey);
  }

  for (const reqRow of pengajuanRows) {
    const statusHubin = normalizeStr(pickField(reqRow, 'Status_Hubin', 'statusHubin'));
    const statusKakomli = normalizeStr(pickField(reqRow, 'Status_Kakomli', 'statusKakomli'));
    if (statusHubin === 'batal' || statusKakomli === 'ditolak') continue;

    const dudiId = pickField(reqRow, 'ID_DUDI', 'idDudi');
    const dudiNamaRaw = pickField(reqRow, 'DUDI_Tujuan', 'dudiTujuan');
    if (!dudiNamaRaw && !dudiId) continue;
    const master =
      (dudiId && dudiMapById.get(dudiId)) ||
      (dudiNamaRaw && dudiMapByName.get(normalizeStr(dudiNamaRaw)));

    if (!matchesRowOrMasterTeacher(reqRow, master)) continue;

    const resolvedName = pickField(master || {}, 'Nama_DUDI', 'namaDudi') || dudiNamaRaw;
    if (!resolvedName) continue;
    const key = normalizeStr(resolvedName);

    ensureDudiGroup(key, master, dudiId, resolvedName, reqRow);
    const rawNis = pickField(reqRow, 'NIS', 'nis');
    const canonicalStudentKey =
      stripNisSymbols(rawNis) || normalizeStr(pickField(reqRow, 'Nama_Siswa', 'namaSiswa'));
    if (canonicalStudentKey) grouped.get(key)!.studentNisSet.add(canonicalStudentKey);
  }

  for (const master of dudiRows) {
    const masterName = pickField(master, 'Nama_DUDI', 'namaDudi', 'nama_dudi');
    if (!masterName) continue;
    const masterGuruId = pickField(master, 'ID_Guru_Pendamping', 'idGuruPendamping');
    const masterGuruNama = pickField(master, 'Guru_Pendamping', 'guruPendamping');
    if (!matchesTeacherFields(masterGuruId, masterGuruNama)) continue;

    const key = normalizeStr(masterName);
    const masterId = pickField(master, 'ID', 'id') || key;
    ensureDudiGroup(key, master, masterId, masterName);
  }

  return Array.from(grouped.values()).map((entry) => ({
    ...entry.dudi,
    jumlahSiswa: entry.studentNisSet.size,
  }));
}

export function buildDudiStudentsWithSummary(params: {
  dudiNama: string;
  dudiId: string;
  petugasNama: string;
  petugasId?: string;
  dudiRows?: any[];
  plottingRows: any[];
  pengajuanRows: any[];
  siswaRows: any[];
  monitoringRows: any[];
  nilaiRows: any[];
  jurusanRows?: any[];
  stageControl: MonitoringStageControl;
  issuedStages?: number[];
}) {
  const {
    dudiNama,
    dudiId,
    petugasNama,
    petugasId = '',
    dudiRows = [],
    plottingRows,
    pengajuanRows,
    siswaRows,
    monitoringRows,
    nilaiRows,
    jurusanRows = [],
    stageControl,
    issuedStages,
  } = params;

  const jurusanCatalog: Jurusan[] = jurusanRows.map((j: any) => ({
    id: pickField(j, 'ID', 'id'),
    kode: pickField(j, 'Kode_Jurusan', 'Kode', 'kode', 'kodeJurusan'),
    nama: pickField(j, 'Nama_Jurusan', 'Nama', 'nama', 'namaJurusan'),
    namaKakomli: pickField(j, 'Nama_Kakomli', 'namaKakomli'),
    kontakWA: pickField(j, 'Kontak_WA', 'kontakWA'),
    kuotaSiswa: Number(j.Kuota_Siswa ?? j.kuotaSiswa ?? 0),
    totalTerdaftar: Number(j.Total_Terdaftar ?? j.totalTerdaftar ?? 0),
  }));

  const siswaByNis = new Map<string, any>();
  for (const s of siswaRows) {
    const nis = pickField(s, 'NIS', 'nis');
    const nisDigits = stripNisSymbols(nis);
    if (nisDigits) siswaByNis.set(nisDigits, s);
    if (nis) siswaByNis.set(nis, s);
  }

  const targetDudiNorm = normalizeStr(dudiNama);
  const masterDudiRow = dudiRows.find((d: any) => {
    const id = pickField(d, 'ID', 'id');
    const nama = normalizeStr(pickField(d, 'Nama_DUDI', 'namaDudi', 'nama_dudi'));
    return (dudiId && id && id === dudiId) || (targetDudiNorm && nama === targetDudiNorm);
  });
  const masterGuruId = masterDudiRow
    ? pickField(masterDudiRow, 'ID_Guru_Pendamping', 'idGuruPendamping')
    : '';
  const masterGuruNorm = masterDudiRow
    ? normalizeStr(pickField(masterDudiRow, 'Guru_Pendamping', 'guruPendamping'))
    : '';

  const studentsMap = new Map<string, any>();
  const targetPetugasNorm = normalizeStr(petugasNama);

  const checkDudiAndPetugasMatch = (row: any, rowDudiNameField: 'Nama_DUDI' | 'DUDI_Tujuan') => {
    const rowDudiId = pickField(row, 'ID_DUDI', 'idDudi');
    const rowDudiNama = normalizeStr(
      rowDudiNameField === 'Nama_DUDI'
        ? pickField(row, 'Nama_DUDI', 'namaDudi')
        : pickField(row, 'DUDI_Tujuan', 'dudiTujuan')
    );
    const dudiMatches =
      (dudiId && rowDudiId && rowDudiId === dudiId) ||
      (targetDudiNorm &&
        rowDudiNama &&
        (rowDudiNama === targetDudiNorm || rowDudiNama.includes(targetDudiNorm)));
    if (!dudiMatches) return false;

    if (targetPetugasNorm || petugasId) {
      const rowGuruId = pickField(row, 'ID_Guru_Pendamping', 'idGuruPendamping');
      const rowGuru = normalizeStr(pickField(row, 'Guru_Pendamping', 'guruPendamping'));
      if (rowGuruId) {
        if (petugasId) return rowGuruId === petugasId;
      }
      if (rowGuru) {
        const directTextMatch =
          targetPetugasNorm &&
          (rowGuru.includes(targetPetugasNorm) || targetPetugasNorm.includes(rowGuru));
        const masterIdMatch = Boolean(petugasId && masterGuruId && masterGuruId === petugasId);
        const masterTextMatch = Boolean(
          targetPetugasNorm &&
            masterGuruNorm &&
            (masterGuruNorm.includes(targetPetugasNorm) || targetPetugasNorm.includes(masterGuruNorm))
        );
        if (!directTextMatch && !masterIdMatch && !masterTextMatch) {
          return false;
        }
      }
    }
    return true;
  };

  for (const p of plottingRows) {
    const statusPlt = normalizeStr(pickField(p, 'Status_Penempatan', 'statusPenempatan'));
    if (statusPlt === 'dibatalkan' || statusPlt === 'batal' || statusPlt === 'pindah dudi') continue;
    if (!checkDudiAndPetugasMatch(p, 'Nama_DUDI')) continue;

    const rawNis = pickField(p, 'NIS', 'nis');
    const cleanNis = stripNisSymbols(rawNis) || rawNis;
    const masterSiswa =
      (cleanNis ? siswaByNis.get(cleanNis) : undefined) || (rawNis ? siswaByNis.get(rawNis) : undefined);
    const canonicalNis = stripNisSymbols(pickField(masterSiswa || {}, 'NIS', 'nis')) || cleanNis;
    const nama =
      pickField(masterSiswa || {}, 'Nama_Lengkap', 'namaLengkap', 'nama') ||
      pickField(p, 'Nama_Siswa', 'namaSiswa');
    if (!canonicalNis && !nama) continue;

    const key = canonicalNis || normalizeStr(nama);
    if (!studentsMap.has(key)) {
      studentsMap.set(key, {
        id: pickField(p, 'ID_Penempatan', 'idPenempatan', 'id') || key,
        idPenempatan: pickField(p, 'ID_Penempatan', 'idPenempatan', 'id') || '',
        nis: canonicalNis || '-',
        nama: nama || 'Siswa Prakerin',
        kelas: pickField(masterSiswa || {}, 'Kelas', 'kelas') || '-',
        jurusan: pickField(masterSiswa || {}, 'ID_Jurusan', 'jurusan', 'Jurusan') || '-',
        dudi_name: dudiNama || pickField(p, 'Nama_DUDI', 'namaDudi'),
      });
    }
  }

  for (const reqRow of pengajuanRows) {
    const statusHubin = normalizeStr(pickField(reqRow, 'Status_Hubin', 'statusHubin'));
    const statusKakomli = normalizeStr(pickField(reqRow, 'Status_Kakomli', 'statusKakomli'));
    if (statusHubin === 'batal' || statusKakomli === 'ditolak') continue;
    if (!checkDudiAndPetugasMatch(reqRow, 'DUDI_Tujuan')) continue;

    const rawNis = pickField(reqRow, 'NIS', 'nis');
    const cleanNis = stripNisSymbols(rawNis) || rawNis;
    const masterSiswa =
      (cleanNis ? siswaByNis.get(cleanNis) : undefined) || (rawNis ? siswaByNis.get(rawNis) : undefined);
    const canonicalNis = stripNisSymbols(pickField(masterSiswa || {}, 'NIS', 'nis')) || cleanNis;
    const nama =
      pickField(masterSiswa || {}, 'Nama_Lengkap', 'namaLengkap', 'nama') ||
      pickField(reqRow, 'Nama_Siswa', 'namaSiswa');
    if (!canonicalNis && !nama) continue;

    const key = canonicalNis || normalizeStr(nama);
    if (!studentsMap.has(key)) {
      studentsMap.set(key, {
        id: pickField(reqRow, 'No_Pengajuan', 'noPengajuan', 'id') || key,
        idPenempatan: pickField(reqRow, 'No_Pengajuan', 'noPengajuan', 'id') || '',
        nis: canonicalNis || '-',
        nama: nama || 'Siswa Prakerin',
        kelas:
          pickField(masterSiswa || {}, 'Kelas', 'kelas') ||
          pickField(reqRow, 'Kelas', 'kelas') ||
          '-',
        jurusan:
          pickField(masterSiswa || {}, 'ID_Jurusan', 'jurusan') ||
          pickField(reqRow, 'Jurusan', 'jurusan') ||
          '-',
        dudi_name: dudiNama || pickField(reqRow, 'DUDI_Tujuan', 'dudiTujuan'),
      });
    }
  }

  return Array.from(studentsMap.values()).map((stu) => {
    const summary = buildStudentMonitoringSummary(stu, monitoringRows, nilaiRows);
    const stagePolicy = resolveMonitoringStagePolicy(stageControl, stu.jurusan, jurusanCatalog);
    return {
      ...stu,
      ...summary,
      stagePolicy,
      recommendedStage: pickRecommendedStageForControl(
        summary.completedStages,
        stageControl,
        issuedStages,
        summary.stageLogs,
        stu.jurusan,
        jurusanCatalog
      ),
    };
  });
}
