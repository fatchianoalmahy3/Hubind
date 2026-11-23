import type { MonitoringStageControl } from '../types/schema';
import {
  buildStudentMonitoringSummary,
  pickRecommendedStageForControl,
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

  const isTeacherMatch = (row: any) => {
    const rowGuruId = pickField(row, 'ID_Guru_Pendamping', 'idGuruPendamping');
    const rowGuruNama = normalizeStr(pickField(row, 'Guru_Pendamping', 'guruPendamping'));
    return (
      (petugasId && rowGuruId && rowGuruId === petugasId) ||
      (targetNamaNorm &&
        rowGuruNama &&
        (rowGuruNama === targetNamaNorm ||
          rowGuruNama.includes(targetNamaNorm) ||
          targetNamaNorm.includes(rowGuruNama)))
    );
  };

  for (const p of plottingRows) {
    const statusPlt = normalizeStr(pickField(p, 'Status_Penempatan', 'statusPenempatan'));
    if (statusPlt === 'dibatalkan' || statusPlt === 'batal' || statusPlt === 'pindah dudi') continue;
    if (!isTeacherMatch(p)) continue;

    const dudiId = pickField(p, 'ID_DUDI', 'idDudi');
    const dudiNamaRaw = pickField(p, 'Nama_DUDI', 'namaDudi');
    const master =
      (dudiId && dudiMapById.get(dudiId)) ||
      (dudiNamaRaw && dudiMapByName.get(normalizeStr(dudiNamaRaw)));

    const resolvedName = pickField(master || {}, 'Nama_DUDI', 'namaDudi') || dudiNamaRaw;
    if (!resolvedName) continue;

    const key = normalizeStr(resolvedName);
    if (!grouped.has(key)) {
      const masterId = pickField(master || {}, 'ID', 'id') || dudiId || key;
      const resolvedKontak =
        pickField(master || {}, 'No_Telp_DUDI', 'noTelpDudi', 'Kontak_PIC', 'kontakPic') || '-';
      const resolvedMaps =
        pickField(master || {}, 'Link_Maps', 'linkMaps', 'link_maps') ||
        pengajuanMapsByDudi.get(masterId) ||
        pengajuanMapsByDudi.get(key) ||
        '';
      const resolvedHari =
        pickField(master || {}, 'Hari_Kerja', 'hariKerja', 'hari_kerja') ||
        pengajuanHariByDudi.get(masterId) ||
        pengajuanHariByDudi.get(key) ||
        '';
      const resolvedJam =
        pickField(master || {}, 'Jam_Kerja', 'jamKerja', 'jam_kerja') ||
        pengajuanJamByDudi.get(masterId) ||
        pengajuanJamByDudi.get(key) ||
        '';
      grouped.set(key, {
        dudi: {
          id: masterId,
          nama: resolvedName,
          alamat: pickField(master || {}, 'Alamat', 'alamat') || '-',
          bidang: pickField(master || {}, 'Bidang_Keahlian', 'bidangKeahlian') || '-',
          namaPemimpin: pickField(master || {}, 'Nama_Pemimpin', 'namaPemimpin') || '',
          pic: pickField(master || {}, 'Nama_PIC', 'namaPic') || '-',
          kontak: resolvedKontak,
          hariKerja: resolvedHari,
          jamKerja: resolvedJam,
          linkMaps: resolvedMaps,
          kuota: Number(master?.Kuota_Maksimal ?? master?.kuotaMaksimal ?? 0),
        },
        studentNisSet: new Set<string>(),
      });
    }
    const rawNis = pickField(p, 'NIS', 'nis');
    const canonicalStudentKey =
      stripNisSymbols(rawNis) || normalizeStr(pickField(p, 'Nama_Siswa', 'namaSiswa'));
    if (canonicalStudentKey) grouped.get(key)!.studentNisSet.add(canonicalStudentKey);
  }

  for (const reqRow of pengajuanRows) {
    const statusHubin = normalizeStr(pickField(reqRow, 'Status_Hubin', 'statusHubin'));
    const statusKakomli = normalizeStr(pickField(reqRow, 'Status_Kakomli', 'statusKakomli'));
    if (statusHubin === 'batal' || statusKakomli === 'ditolak') continue;
    if (!isTeacherMatch(reqRow)) continue;

    const dudiId = pickField(reqRow, 'ID_DUDI', 'idDudi');
    const dudiNamaRaw = pickField(reqRow, 'DUDI_Tujuan', 'dudiTujuan');
    if (!dudiNamaRaw) continue;
    const master =
      (dudiId && dudiMapById.get(dudiId)) || dudiMapByName.get(normalizeStr(dudiNamaRaw));
    const resolvedName = pickField(master || {}, 'Nama_DUDI', 'namaDudi') || dudiNamaRaw;
    const key = normalizeStr(resolvedName);

    if (!grouped.has(key)) {
      const masterId = pickField(master || {}, 'ID', 'id') || dudiId || key;
      const resolvedKontak =
        pickField(master || {}, 'No_Telp_DUDI', 'noTelpDudi', 'Kontak_PIC', 'kontakPic') ||
        pickField(reqRow, 'No_Telp_DUDI', 'noTelpDudi', 'Kontak_PIC', 'kontakPic') ||
        '-';
      const resolvedMaps =
        pickField(master || {}, 'Link_Maps', 'linkMaps', 'link_maps') ||
        pickField(reqRow, 'Link_Maps', 'linkMaps', 'link_maps') ||
        pengajuanMapsByDudi.get(masterId) ||
        pengajuanMapsByDudi.get(key) ||
        '';
      const resolvedHari =
        pickField(master || {}, 'Hari_Kerja', 'hariKerja', 'hari_kerja') ||
        pickField(reqRow, 'Hari_Kerja', 'hariKerja', 'hari_kerja') ||
        pengajuanHariByDudi.get(masterId) ||
        pengajuanHariByDudi.get(key) ||
        '';
      const resolvedJam =
        pickField(master || {}, 'Jam_Kerja', 'jamKerja', 'jam_kerja') ||
        pickField(reqRow, 'Jam_Kerja', 'jamKerja', 'jam_kerja') ||
        pengajuanJamByDudi.get(masterId) ||
        pengajuanJamByDudi.get(key) ||
        '';
      grouped.set(key, {
        dudi: {
          id: masterId,
          nama: resolvedName,
          alamat:
            pickField(master || {}, 'Alamat', 'alamat') ||
            pickField(reqRow, 'Alamat_DUDI', 'alamatDudi') ||
            '-',
          bidang:
            pickField(master || {}, 'Bidang_Keahlian', 'bidangKeahlian') ||
            pickField(reqRow, 'Bidang_Pekerjaan', 'bidangPekerjaan') ||
            '-',
          namaPemimpin:
            pickField(master || {}, 'Nama_Pemimpin', 'namaPemimpin') ||
            pickField(reqRow, 'Nama_Pemimpin', 'namaPemimpin') ||
            '',
          pic:
            pickField(master || {}, 'Nama_PIC', 'namaPic') ||
            pickField(reqRow, 'Nama_PIC', 'namaPic') ||
            '-',
          kontak: resolvedKontak,
          hariKerja: resolvedHari,
          jamKerja: resolvedJam,
          linkMaps: resolvedMaps,
          kuota: Number(master?.Kuota_Maksimal ?? master?.kuotaMaksimal ?? 0),
        },
        studentNisSet: new Set<string>(),
      });
    }
    const rawNis = pickField(reqRow, 'NIS', 'nis');
    const canonicalStudentKey =
      stripNisSymbols(rawNis) || normalizeStr(pickField(reqRow, 'Nama_Siswa', 'namaSiswa'));
    if (canonicalStudentKey) grouped.get(key)!.studentNisSet.add(canonicalStudentKey);
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
  plottingRows: any[];
  pengajuanRows: any[];
  siswaRows: any[];
  monitoringRows: any[];
  nilaiRows: any[];
  stageControl: MonitoringStageControl;
  issuedStages?: number[];
}) {
  const {
    dudiNama,
    dudiId,
    petugasNama,
    plottingRows,
    pengajuanRows,
    siswaRows,
    monitoringRows,
    nilaiRows,
    stageControl,
    issuedStages,
  } = params;

  const siswaByNis = new Map<string, any>();
  for (const s of siswaRows) {
    const nis = pickField(s, 'NIS', 'nis');
    const nisDigits = stripNisSymbols(nis);
    if (nisDigits) siswaByNis.set(nisDigits, s);
    if (nis) siswaByNis.set(nis, s);
  }

  const studentsMap = new Map<string, any>();
  const targetDudiNorm = normalizeStr(dudiNama);
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

    if (targetPetugasNorm) {
      const rowGuru = normalizeStr(pickField(row, 'Guru_Pendamping', 'guruPendamping'));
      if (rowGuru && !rowGuru.includes(targetPetugasNorm) && !targetPetugasNorm.includes(rowGuru)) {
        return false;
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
    return {
      ...stu,
      ...summary,
      recommendedStage: pickRecommendedStageForControl(
        summary.completedStages,
        stageControl,
        issuedStages
      ),
    };
  });
}
