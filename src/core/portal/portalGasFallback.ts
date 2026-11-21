import { GoogleSheetClient } from '../GoogleSheetClient';
import {
  buildStudentMonitoringSummary,
  calculateEqualWeightedAverage,
  extractStageNumber,
  getPredikatFromScore,
  getStageValueByNumber,
  pickRecommendedStageForControl,
  stripStructuredTagsFromNote,
} from '../utils/monitoringHelpers';
import { type MonitoringStageControl } from '../types/schema';
import {
  getTodayWibDateTime,
  getTodayWibIsoDate,
  normalizeToIsoDate,
} from '../utils/dateHelpers';
import { stripNisSymbols } from '../utils/nisHelpers';
import { validateGoogleMapsUrl } from '../utils/mapsHelpers';
import { pickField, normalizeStr } from '../utils/rowFieldHelpers';
import {
  readMasterSiswaDirect,
  readSheetDirect,
  writeSheetDirect,
} from './portalTransport';

async function syncDudiContactFallback(params: {
  dudiId?: string;
  namaDudi?: string;
  alamatDudi?: string;
  pemimpin: string;
  pic: string;
  telp: string;
  allowPartialFallback: boolean;
}): Promise<boolean> {
  const { dudiId, namaDudi, alamatDudi, pemimpin, pic, telp, allowPartialFallback } = params;
  const dudiRows = await readSheetDirect('Master_DUDI', true, true);
  const targetDudiId = String(dudiId || '').trim();
  const targetDudiName = normalizeStr(namaDudi);

  const existingDudi = dudiRows.find((d: any) => {
    const dId = pickField(d, 'ID', 'id');
    const dNama = normalizeStr(pickField(d, 'Nama_DUDI', 'namaDudi'));
    return (
      (targetDudiId && dId === targetDudiId) ||
      (targetDudiName && (dNama === targetDudiName || dNama.includes(targetDudiName)))
    );
  });

  if (existingDudi) {
    const resolvedId = pickField(existingDudi, 'ID', 'id') || targetDudiId;
    const nextPemimpin = allowPartialFallback
      ? pemimpin || pickField(existingDudi, 'Nama_Pemimpin', 'namaPemimpin')
      : pemimpin;
    const nextPic = allowPartialFallback
      ? pic || pickField(existingDudi, 'Nama_PIC', 'namaPic')
      : pic;
    const nextTelp = allowPartialFallback
      ? telp || pickField(existingDudi, 'No_Telp_DUDI', 'noTelpDudi')
      : telp;
    const nextKontakPic = allowPartialFallback
      ? telp || pickField(existingDudi, 'Kontak_PIC', 'kontakPic')
      : telp;

    await writeSheetDirect('Master_DUDI', 'UPDATE', {
      ...existingDudi,
      id: resolvedId,
      ID: resolvedId,
      Nama_Pemimpin: nextPemimpin,
      namaPemimpin: nextPemimpin,
      Nama_PIC: nextPic,
      namaPic: nextPic,
      Kontak_PIC: nextKontakPic,
      kontakPic: nextKontakPic,
      No_Telp_DUDI: nextTelp,
      noTelpDudi: nextTelp,
    });
  } else if (namaDudi) {
    const newDudiId =
      targetDudiId && !targetDudiId.includes('::')
        ? targetDudiId
        : `DUD-${Date.now().toString(36).toUpperCase()}`;
    await writeSheetDirect('Master_DUDI', 'CREATE', {
      id: newDudiId,
      ID: newDudiId,
      Nama_DUDI: String(namaDudi).trim(),
      Bidang_Keahlian: '-',
      Alamat: String(alamatDudi || '-').trim(),
      Wilayah_Kota: 'Ponorogo',
      Nama_Pemimpin: pemimpin,
      Nama_PIC: pic,
      Kontak_PIC: telp,
      No_Telp_DUDI: telp,
      Kuota_Maksimal: 4,
      Terisi: 1,
      Status_Kerjasama: 'Mitra Baru',
    });
  }

  const reqRows = await readSheetDirect('Data_Pengajuan_PKL', true);
  const matchingReqs = reqRows.filter((r: any) => {
    const rDudiId = pickField(r, 'ID_DUDI', 'idDudi');
    const rDudiNama = normalizeStr(pickField(r, 'DUDI_Tujuan', 'dudiTujuan'));
    const isTarget =
      (targetDudiId && rDudiId === targetDudiId) || (targetDudiName && rDudiNama === targetDudiName);
    const hasBlankContact =
      !pickField(r, 'Nama_Pemimpin', 'namaPemimpin') ||
      !pickField(r, 'Nama_PIC', 'namaPic') ||
      !pickField(r, 'No_Telp_DUDI', 'noTelpDudi');
    return isTarget && hasBlankContact;
  });

  for (const mr of matchingReqs.slice(0, 10)) {
    const mrId = pickField(mr, 'No_Pengajuan', 'noPengajuan', 'id');
    if (!mrId) continue;
    await writeSheetDirect('Data_Pengajuan_PKL', 'UPDATE', {
      ...mr,
      id: mrId,
      No_Pengajuan: mrId,
      Nama_Pemimpin: pickField(mr, 'Nama_Pemimpin', 'namaPemimpin') || pemimpin,
      Nama_PIC: pickField(mr, 'Nama_PIC', 'namaPic') || pic,
      No_Telp_DUDI: pickField(mr, 'No_Telp_DUDI', 'noTelpDudi') || telp,
      Kontak_PIC: pickField(mr, 'Kontak_PIC', 'kontakPic') || telp,
    }).catch(() => {});
  }

  return true;
}

async function upsertNilaiDanSertifikatFallback(params: {
  cleanNis: string;
  idPenempatan: string;
  namaSiswa: string;
  jurusan: string;
  kelas: string;
  namaDudi: string;
  k3lh: number;
  softskill: number;
  teknis: number;
  alurBisnis: number;
  avgScore: number;
  tglVal: string;
}): Promise<boolean> {
  const {
    cleanNis,
    idPenempatan,
    namaSiswa,
    jurusan,
    kelas,
    namaDudi,
    k3lh,
    softskill,
    teknis,
    alurBisnis,
    avgScore,
    tglVal,
  } = params;

  const nilaiRows = await readSheetDirect('Nilai_Dan_Sertifikat', true, true);
  const existingNilai = nilaiRows.find((n: any) => {
    const rowNis = pickField(n, 'NIS', 'nis');
    const rowNisDigits = stripNisSymbols(rowNis);
    const rowPlt = pickField(n, 'ID_Penempatan', 'idPenempatan');
    return (
      (cleanNis && (rowNisDigits === cleanNis || rowNis === cleanNis)) ||
      (idPenempatan && rowPlt === idPenempatan)
    );
  });

  const roundedDudi = Math.round(avgScore * 10) / 10;
  const finalPredikat = getPredikatFromScore(roundedDudi);

  if (existingNilai) {
    const existingId =
      pickField(existingNilai, 'ID_Penempatan', 'idPenempatan', 'id') || idPenempatan;
    await writeSheetDirect('Nilai_Dan_Sertifikat', 'UPDATE', {
      ...existingNilai,
      id: existingId,
      ID_Penempatan: existingId,
      Nilai_K3LH: k3lh,
      nilaiK3lh: k3lh,
      Nilai_Softskills: softskill,
      Nilai_Softskill: softskill,
      nilaiSoftskill: softskill,
      Nilai_Hardskills: teknis,
      Nilai_Kompetensi_Teknis: teknis,
      nilaiKompetensiTeknis: teknis,
      Nilai_Alur_Bisnis_Dunia_Kerja: alurBisnis,
      Nilai_Alur_Bisnis: alurBisnis,
      nilaiAlurBisnis: alurBisnis,
      Nilai_rata_rata: roundedDudi,
      Nilai_Rata_Rata: roundedDudi,
      nilaiRataRata: roundedDudi,
      Nilai_DUDI: roundedDudi,
      nilaiDudi: roundedDudi,
      Predikat: finalPredikat,
      predikat: finalPredikat,
      Status_Raport: 'Siap Cetak',
      statusRaport: 'Siap Cetak',
    });
  } else {
    await writeSheetDirect('Nilai_Dan_Sertifikat', 'CREATE', {
      id: idPenempatan,
      ID_Penempatan: idPenempatan,
      idPenempatan,
      NIS: cleanNis,
      nis: cleanNis,
      Nama_Siswa: namaSiswa,
      namaSiswa,
      Jurusan: jurusan,
      jurusan,
      Kelas: kelas,
      kelas,
      DUDI_Tujuan: namaDudi,
      dudiTujuan: namaDudi,
      Nilai_K3LH: k3lh,
      nilaiK3lh: k3lh,
      Nilai_Softskills: softskill,
      Nilai_Softskill: softskill,
      nilaiSoftskill: softskill,
      Nilai_Hardskills: teknis,
      Nilai_Kompetensi_Teknis: teknis,
      nilaiKompetensiTeknis: teknis,
      Nilai_Alur_Bisnis_Dunia_Kerja: alurBisnis,
      Nilai_Alur_Bisnis: alurBisnis,
      nilaiAlurBisnis: alurBisnis,
      Nilai_rata_rata: roundedDudi,
      Nilai_Rata_Rata: roundedDudi,
      nilaiRataRata: roundedDudi,
      Nilai_DUDI: roundedDudi,
      nilaiDudi: roundedDudi,
      Predikat: finalPredikat,
      predikat: finalPredikat,
      No_Seri_Blangko: '',
      noSeriBlangko: '',
      Status_Blangko: 'Tersedia',
      statusBlangko: 'Tersedia',
      Status_Raport: 'Siap Cetak',
      statusRaport: 'Siap Cetak',
      Tgl_Terbit: tglVal,
      tanggalTerbit: tglVal,
    });
  }
  return true;
}

export async function directFetchDudiList(forceRefresh = false) {
  const rows = await readSheetDirect('Master_DUDI', false, forceRefresh);
  const mapped = rows
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
        pimpinan: namaPemimpin || namaPic,
        telepon: noTelpDudi,
      };
    });
  return { success: true, total: mapped.length, data: mapped };
}

export async function directLookupStudentByNis(nis: string) {
  const rawSearchNis = nis.trim();
  const searchNisDigits = stripNisSymbols(rawSearchNis);
  const rows = await readMasterSiswaDirect();
  const student = rows.find((s: any) => {
    const rowNis = pickField(s, 'NIS', 'nis');
    const rowNisDigits = stripNisSymbols(rowNis);
    const rowNik = pickField(s, 'NIK', 'nik');
    const rowNikDigits = stripNisSymbols(rowNik);
    if (
      searchNisDigits &&
      (rowNisDigits === searchNisDigits || rowNikDigits === searchNisDigits)
    ) {
      return true;
    }
    return rowNis === rawSearchNis || rowNik === rawSearchNis;
  });

  if (!student) {
    return {
      success: true,
      found: false,
      message: `Siswa dengan NIS [${rawSearchNis}] tidak ditemukan di Database Sekolah.`,
    };
  }

  const canonicalNisRaw = pickField(student, 'NIS', 'nis');
  const canonicalNis = stripNisSymbols(canonicalNisRaw) || canonicalNisRaw;

  return {
    success: true,
    found: true,
    student: {
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
    },
  };
}

export async function directSubmitApplication(payload: any) {
  if (!payload?.nis || !payload?.nama) {
    throw new Error('NIS dan Nama Siswa wajib diisi.');
  }

  const rawMaps = String(payload.link_maps || payload.Link_Maps || payload.linkMaps || '').trim();
  const mapsCheck = validateGoogleMapsUrl(rawMaps);
  if (!mapsCheck.valid) {
    throw new Error(mapsCheck.error || 'Link Google Maps lokasi PKL tidak valid.');
  }

  const rawNisStr = String(payload.nis).trim();
  const cleanNisInput = stripNisSymbols(rawNisStr) || rawNisStr;

  const siswaRows = await readMasterSiswaDirect().catch(() => [] as any[]);
  let canonicalNis = cleanNisInput;
  let canonicalNama = String(payload.nama).trim();
  let canonicalJurusan = String(payload.jurusan || '');
  let canonicalKelas = String(payload.kelas || '');

  if (siswaRows.length > 0) {
    const matchedStudent = siswaRows.find((s: any) => {
      const rowNis = pickField(s, 'NIS', 'nis');
      const rowDigits = stripNisSymbols(rowNis);
      return (
        (cleanNisInput && rowDigits === cleanNisInput) ||
        rowNis.toLowerCase() === rawNisStr.toLowerCase()
      );
    });
    if (!matchedStudent) {
      throw new Error(`NIS [${rawNisStr}] tidak terdaftar di Master Siswa. Hubungi Admin Hubin.`);
    }
    const mNis = pickField(matchedStudent, 'NIS', 'nis');
    canonicalNis = stripNisSymbols(mNis) || mNis || cleanNisInput;
    canonicalNama =
      pickField(matchedStudent, 'Nama_Lengkap', 'namaLengkap', 'nama') || canonicalNama;
    canonicalJurusan =
      pickField(matchedStudent, 'ID_Jurusan', 'jurusan', 'Jurusan') || canonicalJurusan;
    canonicalKelas = pickField(matchedStudent, 'Kelas', 'kelas') || canonicalKelas;
  }

  let resolvedDudiId =
    payload.dudi_id && payload.dudi_id !== 'custom_hubin'
      ? String(payload.dudi_id).trim()
      : '';
  let resolvedDudiNama = String(payload.nama_dudi || '').trim();
  let autoIdGuruPendamping = '';
  let autoGuruPendamping = '';
  let matchedDudiRow: any = null;

  if (!payload.is_dudi_unregistered && (resolvedDudiId || resolvedDudiNama)) {
    try {
      const dudiRows = await readSheetDirect('Master_DUDI', false);
      matchedDudiRow =
        dudiRows.find((d: any) => {
          const dId = pickField(d, 'ID', 'id');
          const dNama = normalizeStr(pickField(d, 'Nama_DUDI', 'namaDudi'));
          return (
            (resolvedDudiId && dId === resolvedDudiId) ||
            (resolvedDudiNama && dNama === normalizeStr(resolvedDudiNama))
          );
        }) || null;

      if (matchedDudiRow) {
        resolvedDudiId = pickField(matchedDudiRow, 'ID', 'id') || resolvedDudiId;
        resolvedDudiNama =
          pickField(matchedDudiRow, 'Nama_DUDI', 'namaDudi') || resolvedDudiNama;
        autoIdGuruPendamping = pickField(matchedDudiRow, 'ID_Guru_Pendamping', 'idGuruPendamping');
        autoGuruPendamping = pickField(matchedDudiRow, 'Guru_Pendamping', 'guruPendamping');
      }
    } catch {
      // non-blocking DUDI lookup
    }
  }

  const noPengajuan = `REQ-${new Date().getFullYear()}-${String(canonicalJurusan || 'PKL')
    .substring(0, 3)
    .toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
  const timestamp = getTodayWibDateTime();

  const baseStatusNote = payload.is_dudi_unregistered
    ? 'Pengajuan DUDI baru (perlu verifikasi kelayakan Hubin).'
    : 'Menunggu review relevansi kompetensi oleh Kakomli.';

  const sheetRow = {
    id: noPengajuan,
    No_Pengajuan: noPengajuan,
    noPengajuan,
    Timestamp: timestamp,
    timestamp,
    NIS: canonicalNis,
    nis: canonicalNis,
    Nama_Siswa: canonicalNama,
    namaSiswa: canonicalNama,
    nama_siswa: canonicalNama,
    Jurusan: canonicalJurusan,
    jurusan: canonicalJurusan,
    Kelas: canonicalKelas,
    kelas: canonicalKelas,
    DUDI_Tujuan: resolvedDudiNama,
    dudiTujuan: resolvedDudiNama,
    ID_DUDI: resolvedDudiId,
    idDudi: resolvedDudiId,
    nama_dudi: resolvedDudiNama,
    Alamat_DUDI: String(payload.alamat_dudi || ''),
    alamatDudi: String(payload.alamat_dudi || ''),
    Bidang_Pekerjaan: String(payload.bidang_dudi || ''),
    bidangPekerjaan: String(payload.bidang_dudi || ''),
    Nama_Pemimpin: '',
    namaPemimpin: '',
    Nama_PIC: '',
    namaPic: '',
    No_Telp_DUDI: '',
    noTelpDudi: '',
    Kontak_PIC: '',
    kontakPic: '',
    Link_Maps: mapsCheck.normalizedUrl,
    linkMaps: mapsCheck.normalizedUrl,
    link_maps: mapsCheck.normalizedUrl,
    No_WA: String(payload.telepon || ''),
    noWa: String(payload.telepon || ''),
    Alamat_Domisili: String(payload.alamat_domisili || ''),
    alamatDomisili: String(payload.alamat_domisili || ''),
    Nama_Ortu_Wali: String(payload.nama_orang_tua || ''),
    namaOrtuWali: String(payload.nama_orang_tua || ''),
    No_Ortu_Wali: String(payload.telepon_orang_tua || ''),
    noOrtuWali: String(payload.telepon_orang_tua || ''),
    Status_Kakomli: 'Pending',
    statusKakomli: 'Pending',
    Catatan_Kakomli: baseStatusNote,
    catatanKakomli: baseStatusNote,
    Status_Hubin: 'Menunggu ACC Kakomli',
    statusHubin: 'Menunggu ACC Kakomli',
    ID_Guru_Pendamping: autoIdGuruPendamping,
    idGuruPendamping: autoIdGuruPendamping,
    Guru_Pendamping: autoGuruPendamping,
    guruPendamping: autoGuruPendamping,
    Tgl_Berangkat: '',
    tanggalBerangkat: '',
    status: 'Menunggu Validasi Kakomli',
  };

  await writeSheetDirect('Data_Pengajuan_PKL', 'CREATE', sheetRow);

  if (
    matchedDudiRow &&
    mapsCheck.normalizedUrl &&
    !pickField(matchedDudiRow, 'Link_Maps', 'linkMaps', 'link_maps')
  ) {
    try {
      const targetDudiId = pickField(matchedDudiRow, 'ID', 'id');
      if (targetDudiId) {
        await writeSheetDirect('Master_DUDI', 'UPDATE', {
          ...matchedDudiRow,
          id: targetDudiId,
          ID: targetDudiId,
          Link_Maps: mapsCheck.normalizedUrl,
          linkMaps: mapsCheck.normalizedUrl,
        });
      }
    } catch {
      // non-blocking backfill
    }
  }

  return {
    success: true,
    message: 'Pengajuan PKL berhasil disimpan ke Cloud Server.',
    application: sheetRow,
  };
}

export async function directSaveDudiContactVerification(payload: {
  dudi_id: string;
  nama_dudi: string;
  alamat_dudi?: string;
  nama_pemimpin: string;
  nama_pic: string;
  no_telp_dudi: string;
  spelling_confirmed: boolean;
}) {
  const inputPemimpin = String(payload.nama_pemimpin || '').trim();
  const inputPic = String(payload.nama_pic || '').trim();
  const inputTelp = String(payload.no_telp_dudi || '').trim();

  await syncDudiContactFallback({
    dudiId: payload.dudi_id,
    namaDudi: payload.nama_dudi,
    alamatDudi: payload.alamat_dudi,
    pemimpin: inputPemimpin,
    pic: inputPic,
    telp: inputTelp,
    allowPartialFallback: false,
  });

  return {
    success: true,
    message: 'Data kontak & pimpinan DUDI berhasil dikonfirmasi dan disimpan.',
    dudiContact: {
      namaPemimpin: inputPemimpin,
      pic: inputPic,
      kontak: inputTelp,
    },
  };
}

export async function directFetchPetugasList(forceRefresh = false) {
  const rows = await readSheetDirect('Master_Guru_Pendamping', false, forceRefresh);
  const mapped = rows
    .filter((g: any) => pickField(g, 'Nama_Lengkap', 'Nama_Guru', 'namaGuru', 'nama', 'Nama') !== '')
    .map((g: any, idx: number) => ({
      id: pickField(g, 'ID', 'ID_Guru', 'idGuru', 'id') || `guru_${idx + 1}`,
      nama: pickField(g, 'Nama_Lengkap', 'Nama_Guru', 'namaGuru', 'nama', 'Nama'),
      nip: pickField(g, 'NIP', 'nip') || '-',
      peran: pickField(g, 'Peran_Utama', 'peranUtama', 'Peran', 'peran') || 'Guru Pendamping',
      email: pickField(g, 'Email_Google', 'email', 'emailGoogle'),
    }));
  return { success: true, total: mapped.length, data: mapped };
}

export async function directVerifyPetugasPin(params: {
  petugas_id: string;
  nama_petugas: string;
  pin: string;
}) {
  const enteredPin = String(params.pin || '').trim();
  if (!enteredPin || enteredPin.length < 4) {
    throw new Error('PIN Petugas 4 digit wajib diisi.');
  }

  const rows = await readSheetDirect('Master_Guru_Pendamping');
  const teacher = rows.find((g: any) => {
    const id = pickField(g, 'ID', 'ID_Guru', 'idGuru', 'id');
    const nama = pickField(g, 'Nama_Lengkap', 'Nama_Guru', 'namaGuru', 'nama', 'Nama');
    return (
      (params.petugas_id && id === String(params.petugas_id).trim()) ||
      (params.nama_petugas && normalizeStr(nama) === normalizeStr(params.nama_petugas))
    );
  });

  if (!teacher) {
    throw new Error('Data petugas tidak ditemukan di Database Cloud Server.');
  }

  const explicitPin = pickField(teacher, 'PIN', 'pin', 'Pin');
  const nipDigits = pickField(teacher, 'NIP', 'nip').replace(/\D/g, '');
  const waDigits = pickField(
    teacher,
    'Kontak_WA',
    'kontakWA',
    'kontakWa',
    'No_WA',
    'noWa',
    'No_HP'
  ).replace(/\D/g, '');

  const validPins: string[] = [];
  if (explicitPin) validPins.push(explicitPin);
  if (nipDigits.length >= 4) validPins.push(nipDigits.slice(-4));
  if (waDigits.length >= 4) validPins.push(waDigits.slice(-4));

  if (validPins.length === 0) {
    throw new Error(
      'Petugas belum memiliki PIN atau No. WhatsApp terdaftar di Cloud Server untuk verifikasi.'
    );
  }

  if (!validPins.includes(enteredPin)) {
    throw new Error(
      'PIN Petugas tidak cocok. Gunakan PIN atau 4 digit terakhir NIP / No. WhatsApp terdaftar.'
    );
  }

  const resolvedName = pickField(teacher, 'Nama_Lengkap', 'Nama_Guru', 'namaGuru', 'nama', 'Nama');
  return {
    success: true,
    message: `Identitas ${resolvedName} terverifikasi.`,
    sessionToken: `pin_auth_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    verifiedPetugas: {
      id: pickField(teacher, 'ID', 'ID_Guru', 'idGuru', 'id') || params.petugas_id,
      nama: resolvedName,
      nip: pickField(teacher, 'NIP', 'nip') || '-',
      verifiedAt: new Date().toISOString(),
    },
  };
}

export async function directFetchPetugasDudi(petugasNama: string, petugasId: string) {
  const [plottingRows, dudiRows, pengajuanRows] = await Promise.all([
    readSheetDirect('Plotting_Pemberangkatan', true),
    readSheetDirect('Master_DUDI'),
    readSheetDirect('Data_Pengajuan_PKL', true),
  ]);

  const dudiMapById = new Map<string, any>();
  const dudiMapByName = new Map<string, any>();
  for (const d of dudiRows) {
    const id = pickField(d, 'ID', 'id');
    const nama = pickField(d, 'Nama_DUDI', 'namaDudi', 'nama_dudi');
    if (id) dudiMapById.set(id, d);
    if (nama) dudiMapByName.set(normalizeStr(nama), d);
  }

  const pengajuanMapsByDudi = new Map<string, string>();
  for (const reqRow of pengajuanRows) {
    const lm = pickField(reqRow, 'Link_Maps', 'linkMaps', 'link_maps');
    if (!lm) continue;
    const did = pickField(reqRow, 'ID_DUDI', 'idDudi');
    const dname = normalizeStr(pickField(reqRow, 'DUDI_Tujuan', 'dudiTujuan'));
    if (did && !pengajuanMapsByDudi.has(did)) pengajuanMapsByDudi.set(did, lm);
    if (dname && !pengajuanMapsByDudi.has(dname)) pengajuanMapsByDudi.set(dname, lm);
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
      grouped.set(key, {
        dudi: {
          id: masterId,
          nama: resolvedName,
          alamat: pickField(master || {}, 'Alamat', 'alamat') || '-',
          bidang: pickField(master || {}, 'Bidang_Keahlian', 'bidangKeahlian') || '-',
          namaPemimpin: pickField(master || {}, 'Nama_Pemimpin', 'namaPemimpin') || '',
          pic: pickField(master || {}, 'Nama_PIC', 'namaPic') || '-',
          kontak: resolvedKontak,
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

  const result = Array.from(grouped.values()).map((entry) => ({
    ...entry.dudi,
    jumlahSiswa: entry.studentNisSet.size,
  }));

  return { success: true, total: result.length, data: result };
}

export async function directFetchDudiStudents(
  dudiNama: string,
  dudiId: string,
  petugasNama: string
): Promise<{
  success: boolean;
  total: number;
  stageControl: MonitoringStageControl;
  data: any[];
}> {
  const [plottingRows, pengajuanRows, siswaRows, monitoringRows, nilaiRows] = await Promise.all([
    readSheetDirect('Plotting_Pemberangkatan', true),
    readSheetDirect('Data_Pengajuan_PKL', true),
    readMasterSiswaDirect().catch(() => [] as any[]),
    readSheetDirect('Monitoring_5_Tahap', true),
    readSheetDirect('Nilai_Dan_Sertifikat', true),
  ]);

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

  const stageControl = GoogleSheetClient.getInstance().getMonitoringStageControl();
  const result = Array.from(studentsMap.values()).map((stu) => {
    const summary = buildStudentMonitoringSummary(stu, monitoringRows, nilaiRows);
    return {
      ...stu,
      ...summary,
      recommendedStage: pickRecommendedStageForControl(summary.completedStages, stageControl),
    };
  });

  return { success: true, total: result.length, stageControl, data: result };
}

export async function directSubmitMonitoring(payload: any) {
  if (!payload?.nis || !payload?.nama_siswa || !payload?.tahap_monitoring) {
    throw new Error('NIS, Nama Siswa, dan Tahap Monitoring wajib diisi.');
  }

  const cleanNis = stripNisSymbols(payload.nis) || String(payload.nis).trim();
  const existingMonId = String(payload.existing_monitoring_id || '').trim();
  const isUpdate = Boolean(existingMonId);
  const idMonitoring =
    existingMonId || `MON-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const tglVal = normalizeToIsoDate(payload.tanggal) || getTodayWibIsoDate();

  const noteCombined = stripStructuredTagsFromNote(payload.catatan_perkembangan);
  const stageStr = String(payload.tahap_monitoring);
  const stageNum = extractStageNumber(stageStr);

  if (stageNum < 1 || stageNum > 8) {
    throw new Error('Tahap Monitoring tidak valid (harus Tahap 1 sampai Tahap 8).');
  }

  await GoogleSheetClient.getInstance().initFromFirestore().catch(() => {});
  const stageControl = GoogleSheetClient.getInstance().getMonitoringStageControl();
  if (!stageControl.unlockedStages.includes(stageNum)) {
    throw new Error(
      stageControl.lockedReason
        ? `${stageStr} sedang dikunci oleh SuperAdmin (${stageControl.lockedReason}).`
        : `${stageStr} sedang dikunci sementara oleh SuperAdmin. Riwayat yang sudah tersimpan hanya dapat dilihat (Read-Only).`
    );
  }

  if (stageControl.requireSequential && stageNum >= 2) {
    const monRows = await readSheetDirect('Monitoring_5_Tahap', true, true);
    const summary = buildStudentMonitoringSummary(
      {
        nis: cleanNis,
        nama: String(payload.nama_siswa || ''),
        idPenempatan: String(payload.id_penempatan || ''),
        dudi_name: String(payload.nama_dudi || ''),
      },
      monRows,
      []
    );
    if (!summary.completedStages.includes(stageNum - 1)) {
      const prevStageLabel = getStageValueByNumber(stageNum - 1);
      throw new Error(
        `${stageStr} masih terkunci. Harap isi dan simpan ${prevStageLabel} untuk ${payload.nama_siswa} terlebih dahulu.`
      );
    }
  }

  const inputPemimpin = String(payload.nama_pemimpin || '').trim();
  const inputPic = String(payload.nama_pic || '').trim();
  const inputTelpDudi = String(payload.no_telp_dudi || '').trim();
  const inputTelpDigits = inputTelpDudi.replace(/\D/g, '');
  if (stageNum === 1 || payload.dudi_contact_submitted) {
    if (
      !inputPemimpin ||
      inputPemimpin === '-' ||
      !inputPic ||
      inputPic === '-' ||
      inputTelpDigits.length < 7
    ) {
      throw new Error(
        'Nama Pemimpin DUDI, Nama PIC/Pendamping, dan No. Telp/WhatsApp DUDI wajib diisi lengkap.'
      );
    }
    if (payload.dudi_contact_submitted && payload.spelling_confirmed !== true) {
      throw new Error('Harap centang konfirmasi kebenaran data dan ejaan sebelum menyimpan.');
    }
  }

  const sakit = Math.max(0, Math.round(Number(payload.sakit ?? 0) || 0));
  const izin = Math.max(0, Math.round(Number(payload.izin ?? 0) || 0));
  const alpha = Math.max(0, Math.round(Number(payload.alpha ?? 0) || 0));
  const nilaiMuncul = Boolean(payload.nilai_pkl_muncul);

  let k3lh = 0;
  let softskill = 0;
  let teknis = 0;
  let alurBisnis = 0;
  let avgScore = 0;

  if (nilaiMuncul) {
    k3lh = Math.min(100, Math.max(0, Number(payload.nilai_k3lh ?? 0) || 0));
    softskill = Math.min(100, Math.max(0, Number(payload.nilai_softskill ?? 0) || 0));
    teknis = Math.min(100, Math.max(0, Number(payload.nilai_kompetensi_teknis ?? 0) || 0));
    alurBisnis = Math.min(100, Math.max(0, Number(payload.nilai_alur_bisnis ?? 0) || 0));
    avgScore = calculateEqualWeightedAverage(k3lh, softskill, teknis, alurBisnis);
  }

  const idPenempatan = String(payload.id_penempatan || `PLT-${cleanNis}`);
  const sheetRow = {
    id: idMonitoring,
    ID_Monitoring: idMonitoring,
    idMonitoring,
    ID_Penempatan: idPenempatan,
    idPenempatan,
    ID_DUDI: String(payload.dudi_id || ''),
    idDudi: String(payload.dudi_id || ''),
    DUDI_Tujuan: String(payload.nama_dudi || ''),
    dudiTujuan: String(payload.nama_dudi || ''),
    Alamat_DUDI: String(payload.alamat_dudi || ''),
    alamatDudi: String(payload.alamat_dudi || ''),
    NIS: cleanNis,
    nis: cleanNis,
    Nama_Siswa: String(payload.nama_siswa || ''),
    namaSiswa: String(payload.nama_siswa || ''),
    Jurusan: String(payload.jurusan || ''),
    jurusan: String(payload.jurusan || ''),
    ID_Guru_Pendamping: String(payload.guru_id || ''),
    idGuruPendamping: String(payload.guru_id || ''),
    Guru_Pendamping: String(payload.guru_pembimbing || ''),
    guruPendamping: String(payload.guru_pembimbing || ''),
    Tahap: stageStr,
    tahap: stageStr,
    Tanggal_Kunjungan: tglVal,
    tanggalKunjungan: tglVal,
    Sakit: sakit,
    sakit,
    Izin: izin,
    izin,
    Alpha: alpha,
    alpha,
    Nilai_PKL_Muncul: nilaiMuncul ? 'Ya' : 'Belum',
    nilaiPklMuncul: nilaiMuncul,
    Nilai_K3LH: nilaiMuncul ? k3lh : '',
    nilaiK3lh: nilaiMuncul ? k3lh : '',
    Nilai_Softskills: nilaiMuncul ? softskill : '',
    Nilai_Softskill: nilaiMuncul ? softskill : '',
    nilaiSoftskill: nilaiMuncul ? softskill : '',
    Nilai_Hardskills: nilaiMuncul ? teknis : '',
    Nilai_Kompetensi_Teknis: nilaiMuncul ? teknis : '',
    nilaiKompetensiTeknis: nilaiMuncul ? teknis : '',
    Nilai_Alur_Bisnis_Dunia_Kerja: nilaiMuncul ? alurBisnis : '',
    Nilai_Alur_Bisnis: nilaiMuncul ? alurBisnis : '',
    nilaiAlurBisnis: nilaiMuncul ? alurBisnis : '',
    Nilai_rata_rata: nilaiMuncul ? avgScore : '',
    Nilai_Rata_Rata: nilaiMuncul ? avgScore : '',
    nilaiRataRata: nilaiMuncul ? avgScore : '',
    Catatan_Kunjungan: noteCombined,
    catatanKunjungan: noteCombined,
    Foto_Bukti_Drive: '',
    fotoBuktiUrl: '',
    Nilai_DUDI_Terkumpul: nilaiMuncul && avgScore > 0 ? 'Ya' : 'Belum',
    nilaiDudiTerkumpul: nilaiMuncul && avgScore > 0,
    Blangko_Sertifikat_Bawa: stageNum >= 5 ? 'Ya' : 'Belum',
    blangkoSertifikatBawa: stageNum >= 5,
    Status_Tahap: 'Terlaksana',
    statusTahap: 'Terlaksana',
  };

  await writeSheetDirect('Monitoring_5_Tahap', isUpdate ? 'UPDATE' : 'CREATE', sheetRow);

  let dudiContactSynced = false;
  if (inputPemimpin || inputPic || inputTelpDudi) {
    try {
      dudiContactSynced = await syncDudiContactFallback({
        dudiId: payload.dudi_id,
        namaDudi: payload.nama_dudi,
        alamatDudi: payload.alamat_dudi,
        pemimpin: inputPemimpin,
        pic: inputPic,
        telp: inputTelpDudi,
        allowPartialFallback: true,
      });
    } catch {
      // non-blocking
    }
  }

  let gradeSynced = false;
  if (nilaiMuncul && avgScore > 0) {
    try {
      gradeSynced = await upsertNilaiDanSertifikatFallback({
        cleanNis,
        idPenempatan,
        namaSiswa: String(payload.nama_siswa || ''),
        jurusan: String(payload.jurusan || ''),
        kelas: String(payload.kelas || '-'),
        namaDudi: String(payload.nama_dudi || ''),
        k3lh,
        softskill,
        teknis,
        alurBisnis,
        avgScore,
        tglVal,
      });
    } catch {
      // Non-blocking fallback
    }
  }

  return {
    success: true,
    gradeSynced,
    dudiContactSynced,
    dudiContact:
      inputPemimpin || inputPic || inputTelpDudi
        ? {
            namaPemimpin: inputPemimpin,
            pic: inputPic,
            kontak: inputTelpDudi,
          }
        : undefined,
    message: `Data ${stageStr} berhasil ${isUpdate ? 'diperbarui' : 'disimpan'} ke Cloud Server.`,
    monitoring: sheetRow,
  };
}

export async function directUpdateMonitoringGrades(payload: {
  monitoring_id?: string;
  id_penempatan?: string;
  nis: string;
  nama_siswa: string;
  kelas?: string;
  jurusan?: string;
  dudi_id?: string;
  nama_dudi?: string;
  alamat_dudi?: string;
  guru_id?: string;
  guru_pembimbing?: string;
  tahap_monitoring?: string;
  tanggal?: string;
  nilai_k3lh: number;
  nilai_softskill: number;
  nilai_kompetensi_teknis: number;
  nilai_alur_bisnis: number;
}) {
  const nis = stripNisSymbols(payload.nis) || String(payload.nis || '').trim();
  const namaSiswa = String(payload.nama_siswa || '').trim();
  const idPenempatan = String(payload.id_penempatan || (nis ? `PLT-${nis}` : '')).trim();
  if (!nis || !namaSiswa) {
    throw new Error('NIS dan Nama Siswa wajib diisi untuk mengubah nilai.');
  }

  const k3lh = Math.min(100, Math.max(0, Number(payload.nilai_k3lh ?? 0) || 0));
  const softskill = Math.min(100, Math.max(0, Number(payload.nilai_softskill ?? 0) || 0));
  const teknis = Math.min(100, Math.max(0, Number(payload.nilai_kompetensi_teknis ?? 0) || 0));
  const alurBisnis = Math.min(100, Math.max(0, Number(payload.nilai_alur_bisnis ?? 0) || 0));
  const avgScore = calculateEqualWeightedAverage(k3lh, softskill, teknis, alurBisnis);
  const predikat = getPredikatFromScore(avgScore);
  const tglVal = normalizeToIsoDate(payload.tanggal) || getTodayWibIsoDate();

  const monRows = await readSheetDirect('Monitoring_5_Tahap', true, true);
  const targetMonId = String(payload.monitoring_id || '').trim();
  const matchedRows = monRows.filter((r: any) => {
    const rMonId = pickField(r, 'ID_Monitoring', 'idMonitoring', 'id');
    const rNis = pickField(r, 'NIS', 'nis');
    const rNisDigits = stripNisSymbols(rNis);
    const rPlt = pickField(r, 'ID_Penempatan', 'idPenempatan');
    if (targetMonId && rMonId === targetMonId) return true;
    if (nis && (rNisDigits === nis || rNis === nis)) return true;
    if (idPenempatan && rPlt === idPenempatan) return true;
    return false;
  });

  const targetRow =
    (targetMonId
      ? matchedRows.find(
          (r: any) => pickField(r, 'ID_Monitoring', 'idMonitoring', 'id') === targetMonId
        )
      : undefined) ||
    [...matchedRows].reverse().find((r: any) => {
      const flag = normalizeStr(pickField(r, 'Nilai_DUDI_Terkumpul', 'nilaiDudiTerkumpul'));
      const avg = Number(r.Nilai_rata_rata ?? r.Nilai_Rata_Rata ?? r.nilaiRataRata ?? 0);
      return flag === 'ya' || flag === 'true' || avg > 0;
    }) ||
    matchedRows[matchedRows.length - 1];

  let resolvedMonId = targetMonId;
  let resolvedStage = String(payload.tahap_monitoring || getStageValueByNumber(5));

  if (targetRow) {
    resolvedMonId = pickField(targetRow, 'ID_Monitoring', 'idMonitoring', 'id');
    resolvedStage = pickField(targetRow, 'Tahap', 'tahap') || resolvedStage;
    const cleanNote = stripStructuredTagsFromNote(
      targetRow.Catatan_Kunjungan ?? targetRow.catatanKunjungan ?? ''
    );

    await writeSheetDirect('Monitoring_5_Tahap', 'UPDATE', {
      ...targetRow,
      id: resolvedMonId,
      ID_Monitoring: resolvedMonId,
      idMonitoring: resolvedMonId,
      Nilai_PKL_Muncul: 'Ya',
      nilaiPklMuncul: true,
      Nilai_K3LH: k3lh,
      nilaiK3lh: k3lh,
      Nilai_Softskills: softskill,
      Nilai_Softskill: softskill,
      nilaiSoftskill: softskill,
      Nilai_Hardskills: teknis,
      Nilai_Kompetensi_Teknis: teknis,
      nilaiKompetensiTeknis: teknis,
      Nilai_Alur_Bisnis_Dunia_Kerja: alurBisnis,
      Nilai_Alur_Bisnis: alurBisnis,
      nilaiAlurBisnis: alurBisnis,
      Nilai_rata_rata: avgScore,
      Nilai_Rata_Rata: avgScore,
      nilaiRataRata: avgScore,
      Nilai_DUDI_Terkumpul: 'Ya',
      nilaiDudiTerkumpul: true,
      Catatan_Kunjungan: cleanNote,
      catatanKunjungan: cleanNote,
    });
  } else {
    resolvedMonId = `MON-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const stageNum = extractStageNumber(resolvedStage) || 5;
    await writeSheetDirect('Monitoring_5_Tahap', 'CREATE', {
      id: resolvedMonId,
      ID_Monitoring: resolvedMonId,
      idMonitoring: resolvedMonId,
      ID_Penempatan: idPenempatan,
      ID_DUDI: String(payload.dudi_id || ''),
      DUDI_Tujuan: String(payload.nama_dudi || ''),
      Alamat_DUDI: String(payload.alamat_dudi || ''),
      NIS: nis,
      Nama_Siswa: namaSiswa,
      Jurusan: String(payload.jurusan || ''),
      ID_Guru_Pendamping: String(payload.guru_id || ''),
      Guru_Pendamping: String(payload.guru_pembimbing || ''),
      Tahap: resolvedStage,
      Tanggal_Kunjungan: tglVal,
      Sakit: 0,
      Izin: 0,
      Alpha: 0,
      Nilai_PKL_Muncul: 'Ya',
      Nilai_K3LH: k3lh,
      Nilai_Softskills: softskill,
      Nilai_Softskill: softskill,
      Nilai_Hardskills: teknis,
      Nilai_Kompetensi_Teknis: teknis,
      Nilai_Alur_Bisnis_Dunia_Kerja: alurBisnis,
      Nilai_Alur_Bisnis: alurBisnis,
      Nilai_rata_rata: avgScore,
      Nilai_Rata_Rata: avgScore,
      Catatan_Kunjungan: '',
      Nilai_DUDI_Terkumpul: 'Ya',
      Blangko_Sertifikat_Bawa: stageNum >= 5 ? 'Ya' : 'Belum',
      Status_Tahap: 'Terlaksana',
    });
  }

  let nilaiSynced = false;
  try {
    nilaiSynced = await upsertNilaiDanSertifikatFallback({
      cleanNis: nis,
      idPenempatan,
      namaSiswa,
      jurusan: String(payload.jurusan || ''),
      kelas: String(payload.kelas || '-'),
      namaDudi: String(payload.nama_dudi || ''),
      k3lh,
      softskill,
      teknis,
      alurBisnis,
      avgScore,
      tglVal,
    });
  } catch {
    // Non-blocking fallback
  }

  return {
    success: true,
    nilaiSynced,
    message: `Perubahan nilai PKL ${namaSiswa} (${avgScore}) berhasil disimpan ke Cloud Server.`,
    gradeSummary: {
      monitoringId: resolvedMonId,
      k3lh,
      softskill,
      teknis,
      alurBisnis,
      rataRata: avgScore,
      predikat,
      tahapDiinput: resolvedStage,
      tanggal: tglVal,
    },
  };
}
