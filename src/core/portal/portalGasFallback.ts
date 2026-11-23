import { GoogleSheetClient } from '../GoogleSheetClient';
import { GoogleDriveSheetService } from '../GoogleDriveSheetService';
import { generateJurusanCode } from '../utils/autoIdHelpers';
import {
  buildStudentMonitoringSummary,
  calculateEqualWeightedAverage,
  extractStageNumber,
  getPredikatFromScore,
  getStageValueByNumber,
  parseKompetensiList,
  parseKondisiBengkel,
  resolveIssuedStagesForDudi,
  serializeFormat0701Tag,
  serializeKompetensiList,
  serializeKondisiBengkel,
  stripStructuredTagsFromNote,
} from '../utils/monitoringHelpers';
import { type IssuedStageDetail, type MonitoringStageControl } from '../types/schema';
import {
  getTodayWibDateTime,
  getTodayWibIsoDate,
  normalizeToIsoDate,
} from '../utils/dateHelpers';
import { stripNisSymbols } from '../utils/nisHelpers';
import { validateGoogleMapsUrl } from '../utils/mapsHelpers';
import { pickField, normalizeStr } from '../utils/rowFieldHelpers';
import {
  aggregatePetugasDudiGroups,
  buildDudiStudentsWithSummary,
  mapPublicDudiRows,
  mapPublicPetugasRows,
  mapPublicStudentRecord,
} from './portalTransformers';
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
  hariKerja?: string;
  jamKerja?: string;
  allowPartialFallback: boolean;
}): Promise<boolean> {
  const { dudiId, namaDudi, alamatDudi, pemimpin, pic, telp, hariKerja, jamKerja, allowPartialFallback } = params;
  const inputHariKerja = String(hariKerja || '').trim();
  const inputJamKerja = String(jamKerja || '').trim();
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
    const nextHariKerja = inputHariKerja || pickField(existingDudi, 'Hari_Kerja', 'hariKerja');
    const nextJamKerja = inputJamKerja || pickField(existingDudi, 'Jam_Kerja', 'jamKerja');

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
      Hari_Kerja: nextHariKerja,
      hariKerja: nextHariKerja,
      Jam_Kerja: nextJamKerja,
      jamKerja: nextJamKerja,
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
      Hari_Kerja: inputHariKerja,
      Jam_Kerja: inputJamKerja,
      Kuota_Maksimal: 4,
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
      !pickField(r, 'No_Telp_DUDI', 'noTelpDudi') ||
      (inputHariKerja && !pickField(r, 'Hari_Kerja', 'hariKerja')) ||
      (inputJamKerja && !pickField(r, 'Jam_Kerja', 'jamKerja'));
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
      Hari_Kerja: pickField(mr, 'Hari_Kerja', 'hariKerja') || inputHariKerja,
      Jam_Kerja: pickField(mr, 'Jam_Kerja', 'jamKerja') || inputJamKerja,
    }).catch(() => {});
  }

  return true;
}

async function upsertNilaiDanSertifikatFallback(params: {
  cleanNis: string;
  idPenempatan: string;
  idDudi?: string;
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
    idDudi,
    namaDudi,
    tglVal,
  } = params;

  let resolvedDudiId = String(idDudi || '').trim();
  if (!resolvedDudiId && namaDudi) {
    const dudiRows = await readSheetDirect('Master_DUDI', true).catch(() => [] as any[]);
    const targetDudiNorm = normalizeStr(namaDudi);
    const matchedDudi = dudiRows.find(
      (d: any) => normalizeStr(pickField(d, 'Nama_DUDI', 'namaDudi')) === targetDudiNorm
    );
    if (matchedDudi) {
      resolvedDudiId = pickField(matchedDudi, 'ID', 'id');
    }
  }

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

  if (existingNilai) {
    const existingId =
      pickField(existingNilai, 'ID_Penempatan', 'idPenempatan', 'id') || idPenempatan;
    const existingDudiId = pickField(existingNilai, 'ID_DUDI', 'idDudi') || resolvedDudiId;
    await writeSheetDirect('Nilai_Dan_Sertifikat', 'UPDATE', {
      id: existingId,
      ID_Penempatan: existingId,
      idPenempatan: existingId,
      _sheetRowNumber: existingNilai._sheetRowNumber,
      NIS: cleanNis || pickField(existingNilai, 'NIS', 'nis'),
      nis: cleanNis || pickField(existingNilai, 'NIS', 'nis'),
      ID_DUDI: existingDudiId,
      idDudi: existingDudiId,
      No_Seri_Blangko: pickField(existingNilai, 'No_Seri_Blangko', 'noSeriBlangko'),
      noSeriBlangko: pickField(existingNilai, 'No_Seri_Blangko', 'noSeriBlangko'),
      Status_Blangko: pickField(existingNilai, 'Status_Blangko', 'statusBlangko') || 'Tersedia',
      statusBlangko: pickField(existingNilai, 'Status_Blangko', 'statusBlangko') || 'Tersedia',
      Status_Raport: 'Siap Cetak',
      statusRaport: 'Siap Cetak',
      Tgl_Terbit: pickField(existingNilai, 'Tgl_Terbit', 'tanggalTerbit') || tglVal,
      tanggalTerbit: pickField(existingNilai, 'Tgl_Terbit', 'tanggalTerbit') || tglVal,
    });
  } else {
    await writeSheetDirect('Nilai_Dan_Sertifikat', 'CREATE', {
      id: idPenempatan,
      ID_Penempatan: idPenempatan,
      idPenempatan,
      NIS: cleanNis,
      nis: cleanNis,
      ID_DUDI: resolvedDudiId,
      idDudi: resolvedDudiId,
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
  const mapped = mapPublicDudiRows(rows);
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

  return {
    success: true,
    found: true,
    student: mapPublicStudentRecord(student),
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
  let matchedStudent: any = null;

  if (siswaRows.length > 0) {
    matchedStudent =
      siswaRows.find((s: any) => {
        const rowNis = pickField(s, 'NIS', 'nis');
        const rowDigits = stripNisSymbols(rowNis);
        return (
          (cleanNisInput && rowDigits === cleanNisInput) ||
          rowNis.toLowerCase() === rawNisStr.toLowerCase()
        );
      }) || null;
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

  const cleanClientRequestId = String(payload.client_request_id || '').trim();
  try {
    const existingRows = await readSheetDirect('Data_Pengajuan_PKL', true, true);
    const existingApp = existingRows.find((r: any) => {
      const rReqId = pickField(r, 'No_Pengajuan', 'noPengajuan', 'id');
      if (cleanClientRequestId && rReqId === cleanClientRequestId) return true;
      const rNis = stripNisSymbols(pickField(r, 'NIS', 'nis')) || pickField(r, 'NIS', 'nis');
      const rStatusKakomli = normalizeStr(pickField(r, 'Status_Kakomli', 'statusKakomli'));
      if (!canonicalNis || rNis !== canonicalNis || rStatusKakomli !== 'pending') return false;
      const rDudiId = pickField(r, 'ID_DUDI', 'idDudi');
      const rDudiNama = normalizeStr(pickField(r, 'DUDI_Tujuan', 'dudiTujuan', 'nama_dudi'));
      return (
        (resolvedDudiId && rDudiId === resolvedDudiId) ||
        (resolvedDudiNama && rDudiNama === normalizeStr(resolvedDudiNama))
      );
    });
    if (existingApp) {
      const existingId = pickField(existingApp, 'No_Pengajuan', 'noPengajuan', 'id');
      const existingMaps = pickField(existingApp, 'Link_Maps', 'linkMaps', 'link_maps');
      const existingHari = pickField(existingApp, 'Hari_Kerja', 'hariKerja', 'hari_kerja');
      const existingJam = pickField(existingApp, 'Jam_Kerja', 'jamKerja', 'jam_kerja');
      return {
        success: true,
        deduplicated: true,
        verifiedInSpreadsheet: true,
        sheetRowNumber: existingApp._sheetRowNumber,
        savedAt: new Date().toISOString(),
        message: 'Pengajuan PKL Anda untuk DUDI ini sudah tercatat di Cloud Server.',
        application: {
          ...existingApp,
          id: existingId,
          No_Pengajuan: existingId,
          nis: canonicalNis,
          nama_siswa: pickField(existingApp, 'Nama_Siswa', 'namaSiswa', 'nama_siswa') || canonicalNama,
          kelas: pickField(existingApp, 'Kelas', 'kelas') || canonicalKelas,
          jurusan: pickField(existingApp, 'Jurusan', 'jurusan') || canonicalJurusan,
          nama_dudi: pickField(existingApp, 'DUDI_Tujuan', 'dudiTujuan', 'nama_dudi') || resolvedDudiNama,
          Hari_Kerja: existingHari || String(payload.hari_kerja || '').trim(),
          hari_kerja: existingHari || String(payload.hari_kerja || '').trim(),
          Jam_Kerja: existingJam || String(payload.jam_kerja || '').trim(),
          jam_kerja: existingJam || String(payload.jam_kerja || '').trim(),
          Link_Maps: existingMaps || mapsCheck.normalizedUrl,
          link_maps: existingMaps || mapsCheck.normalizedUrl,
          status: pickField(existingApp, 'Status_Hubin', 'statusHubin', 'status') || 'Menunggu ACC Kakomli',
        },
      };
    }
  } catch {
    // Proceed cleanly
  }

  const jurCode =
    generateJurusanCode(canonicalJurusan) ||
    String(canonicalJurusan || 'PKL').substring(0, 3).toUpperCase();
  const noPengajuan =
    cleanClientRequestId ||
    `REQ-${new Date().getFullYear()}-${jurCode}-${Math.floor(100 + Math.random() * 900)}`;
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
    Hari_Kerja: String(payload.hari_kerja || payload.Hari_Kerja || '').trim(),
    hariKerja: String(payload.hari_kerja || payload.Hari_Kerja || '').trim(),
    hari_kerja: String(payload.hari_kerja || payload.Hari_Kerja || '').trim(),
    Jam_Kerja: String(payload.jam_kerja || payload.Jam_Kerja || '').trim(),
    jamKerja: String(payload.jam_kerja || payload.Jam_Kerja || '').trim(),
    jam_kerja: String(payload.jam_kerja || payload.Jam_Kerja || '').trim(),
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

  const persistedPengajuan = GoogleDriveSheetService.getInstance().stripFormulaManagedFields(
    'Data_Pengajuan_PKL',
    sheetRow
  );
  const writeReceipt = await writeSheetDirect('Data_Pengajuan_PKL', 'CREATE', persistedPengajuan);

  if (matchedStudent) {
    const siswaId = pickField(matchedStudent, 'ID', 'id', 'NIS', 'nis');
    if (siswaId) {
      const inputNoHp = String(payload.telepon || '').trim();
      const inputAlamat = String(payload.alamat_domisili || '').trim();
      const inputNamaOrtu = String(payload.nama_orang_tua || '').trim();
      const inputNoOrtu = String(payload.telepon_orang_tua || '').trim();
      const currNoHp = pickField(matchedStudent, 'No_HP_Siswa', 'noHpSiswa');
      const currAlamat = pickField(matchedStudent, 'Alamat_Domisili', 'alamatDomisili');
      const currNamaOrtu = pickField(matchedStudent, 'Nama_Ortu_Wali', 'namaOrtuWali');
      const currNoOrtu = pickField(matchedStudent, 'No_Ortu_Wali', 'noOrtuWali');
      const currStatus = pickField(matchedStudent, 'Status_PKL', 'statusPKL');
      const studentUpdates: Record<string, any> = {};
      if (inputNoHp && inputNoHp !== currNoHp) studentUpdates.No_HP_Siswa = inputNoHp;
      if (inputAlamat && inputAlamat !== currAlamat) studentUpdates.Alamat_Domisili = inputAlamat;
      if (inputNamaOrtu && inputNamaOrtu !== currNamaOrtu) studentUpdates.Nama_Ortu_Wali = inputNamaOrtu;
      if (inputNoOrtu && inputNoOrtu !== currNoOrtu) studentUpdates.No_Ortu_Wali = inputNoOrtu;
      if (!currStatus || normalizeStr(currStatus) === 'belum daftar') {
        studentUpdates.Status_PKL = 'Diajukan';
      }
      if (Object.keys(studentUpdates).length > 0) {
        await writeSheetDirect('Master_Siswa_XI', 'UPDATE', {
          id: siswaId,
          ID: siswaId,
          _sheetRowNumber: matchedStudent._sheetRowNumber,
          ...studentUpdates,
        }).catch(() => {});
      }
    }
  }

  if (matchedDudiRow) {
    const inputHari = String(payload.hari_kerja || payload.Hari_Kerja || '').trim();
    const inputJam = String(payload.jam_kerja || payload.Jam_Kerja || '').trim();
    const dudiUpdates: Record<string, any> = {};
    if (mapsCheck.normalizedUrl && !pickField(matchedDudiRow, 'Link_Maps', 'linkMaps', 'link_maps')) {
      dudiUpdates.Link_Maps = mapsCheck.normalizedUrl;
      dudiUpdates.linkMaps = mapsCheck.normalizedUrl;
    }
    if (inputHari && !pickField(matchedDudiRow, 'Hari_Kerja', 'hariKerja', 'hari_kerja')) {
      dudiUpdates.Hari_Kerja = inputHari;
      dudiUpdates.hariKerja = inputHari;
    }
    if (inputJam && !pickField(matchedDudiRow, 'Jam_Kerja', 'jamKerja', 'jam_kerja')) {
      dudiUpdates.Jam_Kerja = inputJam;
      dudiUpdates.jamKerja = inputJam;
    }
    if (Object.keys(dudiUpdates).length > 0) {
      try {
        const targetDudiId = pickField(matchedDudiRow, 'ID', 'id');
        if (targetDudiId) {
          await writeSheetDirect('Master_DUDI', 'UPDATE', {
            id: targetDudiId,
            ID: targetDudiId,
            _sheetRowNumber: matchedDudiRow._sheetRowNumber,
            ...dudiUpdates,
          });
        }
      } catch {
        // non-blocking backfill
      }
    }
  }

  return {
    success: true,
    verifiedInSpreadsheet: writeReceipt.verified,
    sheetRowNumber: writeReceipt.sheetRowNumber,
    savedAt: writeReceipt.savedAt,
    message: 'Pengajuan PKL berhasil disimpan dan diverifikasi ke Cloud Server.',
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
  hari_kerja?: string;
  jam_kerja?: string;
  spelling_confirmed: boolean;
}) {
  const inputPemimpin = String(payload.nama_pemimpin || '').trim();
  const inputPic = String(payload.nama_pic || '').trim();
  const inputTelp = String(payload.no_telp_dudi || '').trim();
  const inputHariKerja = String(payload.hari_kerja || '').trim();
  const inputJamKerja = String(payload.jam_kerja || '').trim();

  await syncDudiContactFallback({
    dudiId: payload.dudi_id,
    namaDudi: payload.nama_dudi,
    alamatDudi: payload.alamat_dudi,
    pemimpin: inputPemimpin,
    pic: inputPic,
    telp: inputTelp,
    hariKerja: inputHariKerja || undefined,
    jamKerja: inputJamKerja || undefined,
    allowPartialFallback: false,
  });

  return {
    success: true,
    message: 'Data kontak & pimpinan DUDI berhasil dikonfirmasi dan disimpan.',
    dudiContact: {
      namaPemimpin: inputPemimpin,
      pic: inputPic,
      kontak: inputTelp,
      ...(inputHariKerja ? { hariKerja: inputHariKerja } : {}),
      ...(inputJamKerja ? { jamKerja: inputJamKerja } : {}),
    },
  };
}

export async function directFetchPetugasList(forceRefresh = false) {
  const rows = await readSheetDirect('Master_Guru_Pendamping', false, forceRefresh);
  const mapped = mapPublicPetugasRows(rows);
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

  const result = aggregatePetugasDudiGroups({
    petugasNama,
    petugasId,
    plottingRows,
    dudiRows,
    pengajuanRows,
  });

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
  issuedStages: number[];
  issuedStageDetails: Record<number, IssuedStageDetail>;
  data: any[];
}> {
  const [plottingRows, pengajuanRows, siswaRows, monitoringRows, nilaiRows, logSuratRows] =
    await Promise.all([
      readSheetDirect('Plotting_Pemberangkatan', true),
      readSheetDirect('Data_Pengajuan_PKL', true),
      readMasterSiswaDirect().catch(() => [] as any[]),
      readSheetDirect('Monitoring_5_Tahap', true),
      readSheetDirect('Nilai_Dan_Sertifikat', true),
      readSheetDirect('Log_Penerbitan_Surat', true).catch(() => [] as any[]),
    ]);

  const stageControl = GoogleSheetClient.getInstance().getMonitoringStageControl();
  const { issuedStages, issuedStageDetails } = resolveIssuedStagesForDudi(
    logSuratRows,
    dudiId,
    dudiNama
  );
  const result = buildDudiStudentsWithSummary({
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
  });

  return {
    success: true,
    total: result.length,
    stageControl,
    issuedStages,
    issuedStageDetails,
    data: result,
  };
}

export async function directSubmitMonitoring(payload: any) {
  if (!payload?.nis || !payload?.nama_siswa || !payload?.tahap_monitoring) {
    throw new Error('NIS, Nama Siswa, dan Tahap Monitoring wajib diisi.');
  }

  const cleanNis = stripNisSymbols(payload.nis) || String(payload.nis).trim();
  const inputIdPenempatan = String(payload.id_penempatan || '').trim();
  let existingMonId = String(payload.existing_monitoring_id || '').trim();
  const tglVal = normalizeToIsoDate(payload.tanggal) || getTodayWibIsoDate();

  const bukuLaporan = String(payload.buku_laporan || '').trim().toUpperCase();
  const aktivitasDp = String(payload.aktivitas_dp || '').trim();
  const aktivitasMt = String(payload.aktivitas_mt || '').trim();
  const aktivitasKrt = String(payload.aktivitas_krt || '').trim();
  const kompetensiArr = parseKompetensiList(payload.kompetensi_siswa);
  const kompetensiSerialized = serializeKompetensiList(kompetensiArr);
  const kondisiCheck = parseKondisiBengkel(payload.kondisi_bengkel);
  const kondisiSerialized = serializeKondisiBengkel(kondisiCheck);
  const ttdSiswaRaw = String(payload.ttd_siswa || '').trim();
  const safeTtdSiswa = ttdSiswaRaw.startsWith('svgpath:') ? ttdSiswaRaw : '';

  const cleanUserNote = stripStructuredTagsFromNote(payload.catatan_perkembangan);
  const f0701Tag = serializeFormat0701Tag({
    bukuLaporan,
    dp: aktivitasDp,
    mt: aktivitasMt,
    krt: aktivitasKrt,
    kompetensiList: kompetensiArr,
    kondisiBengkel: kondisiCheck,
  });
  const noteCombined = [cleanUserNote, f0701Tag].filter(Boolean).join(' ').trim();

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

  if (stageControl.requireIssuedLetter !== false) {
    const logRows = await readSheetDirect('Log_Penerbitan_Surat', true, true).catch(
      () => [] as any[]
    );
    const { issuedStages } = resolveIssuedStagesForDudi(
      logRows,
      String(payload.dudi_id || ''),
      String(payload.nama_dudi || '')
    );
    if (!issuedStages.includes(stageNum)) {
      throw new Error(
        `Surat ${stageStr} untuk DUDI "${String(payload.nama_dudi || 'ini').trim()}" belum diterbitkan Admin Hubin di Pusat Dokumen.`
      );
    }
  }

  const monRows = await readSheetDirect('Monitoring_5_Tahap', true, true).catch(() => [] as any[]);

  if (stageControl.requireSequential && stageNum >= 2) {
    const summary = buildStudentMonitoringSummary(
      {
        nis: cleanNis,
        nama: String(payload.nama_siswa || ''),
        idPenempatan: inputIdPenempatan,
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

  const matchedExistingRow = monRows.find((r: any) => {
    const rMonId = pickField(r, 'ID_Monitoring', 'idMonitoring', 'id');
    if (existingMonId && rMonId === existingMonId) return true;
    const rStage = extractStageNumber(pickField(r, 'Tahap', 'tahap'));
    if (rStage !== stageNum) return false;
    const rNisRaw = pickField(r, 'NIS', 'nis');
    const rNisDigits = stripNisSymbols(rNisRaw) || rNisRaw;
    const rPlt = pickField(r, 'ID_Penempatan', 'idPenempatan');
    return Boolean(
      (cleanNis && rNisDigits === cleanNis) || (inputIdPenempatan && rPlt === inputIdPenempatan)
    );
  });

  if (matchedExistingRow) {
    existingMonId =
      pickField(matchedExistingRow, 'ID_Monitoring', 'idMonitoring', 'id') || existingMonId;
  }

  const isUpdate = Boolean(existingMonId);
  const idMonitoring =
    existingMonId || `MON-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  const inputPemimpin = String(payload.nama_pemimpin || '').trim();
  const inputPic = String(payload.nama_pic || '').trim();
  const inputTelpDudi = String(payload.no_telp_dudi || '').trim();
  const inputHariKerja = String(payload.hari_kerja || '').trim();
  const inputJamKerja = String(payload.jam_kerja || '').trim();
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

  let resolvedDudiId = String(payload.dudi_id || '').trim();
  if (!resolvedDudiId && payload.nama_dudi) {
    const dudiRows = await readSheetDirect('Master_DUDI', true).catch(() => [] as any[]);
    const targetDudiNorm = normalizeStr(payload.nama_dudi);
    const matchedDudi = dudiRows.find(
      (d: any) => normalizeStr(pickField(d, 'Nama_DUDI', 'namaDudi')) === targetDudiNorm
    );
    if (matchedDudi) {
      resolvedDudiId = pickField(matchedDudi, 'ID', 'id');
    }
  }

  const idPenempatan = String(payload.id_penempatan || `PLT-${cleanNis}`);
  const sheetRow = {
    id: idMonitoring,
    ID_Monitoring: idMonitoring,
    idMonitoring,
    ID_Penempatan: idPenempatan,
    idPenempatan,
    ID_DUDI: resolvedDudiId,
    idDudi: resolvedDudiId,
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
    Buku_Laporan: bukuLaporan,
    bukuLaporan,
    Aktivitas_DP: aktivitasDp,
    aktivitasDp,
    Aktivitas_MT: aktivitasMt,
    aktivitasMt,
    Aktivitas_KRT: aktivitasKrt,
    aktivitasKrt,
    Kompetensi_Didapat: kompetensiSerialized,
    kompetensiDidapat: kompetensiSerialized,
    Kondisi_Bengkel: kondisiSerialized,
    kondisiBengkel: kondisiSerialized,
    TTD_Siswa: safeTtdSiswa,
    ttdSiswa: safeTtdSiswa,
    Foto_Bukti_Drive: '',
    fotoBuktiUrl: '',
    Nilai_DUDI_Terkumpul: nilaiMuncul && avgScore > 0 ? 'Ya' : 'Belum',
    nilaiDudiTerkumpul: nilaiMuncul && avgScore > 0,
    Blangko_Sertifikat_Bawa: stageNum >= 5 ? 'Ya' : 'Belum',
    blangkoSertifikatBawa: stageNum >= 5,
    Status_Tahap: 'Terlaksana',
    statusTahap: 'Terlaksana',
  };

  const persistedMon = GoogleDriveSheetService.getInstance().stripFormulaManagedFields(
    'Monitoring_5_Tahap',
    matchedExistingRow?._sheetRowNumber
      ? { ...sheetRow, _sheetRowNumber: matchedExistingRow._sheetRowNumber }
      : sheetRow
  );
  const writeReceipt = await writeSheetDirect(
    'Monitoring_5_Tahap',
    isUpdate ? 'UPDATE' : 'CREATE',
    persistedMon
  );

  let dudiContactSynced = false;
  if (inputPemimpin || inputPic || inputTelpDudi || inputHariKerja || inputJamKerja) {
    try {
      dudiContactSynced = await syncDudiContactFallback({
        dudiId: resolvedDudiId || payload.dudi_id,
        namaDudi: payload.nama_dudi,
        alamatDudi: payload.alamat_dudi,
        pemimpin: inputPemimpin,
        pic: inputPic,
        telp: inputTelpDudi,
        hariKerja: inputHariKerja || undefined,
        jamKerja: inputJamKerja || undefined,
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
        idDudi: resolvedDudiId,
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
    verifiedInSpreadsheet: writeReceipt.verified,
    sheetRowNumber: writeReceipt.sheetRowNumber,
    savedAt: writeReceipt.savedAt,
    gradeSynced,
    dudiContactSynced,
    dudiContact:
      inputPemimpin || inputPic || inputTelpDudi || inputHariKerja || inputJamKerja
        ? {
            namaPemimpin: inputPemimpin,
            pic: inputPic,
            kontak: inputTelpDudi,
            ...(inputHariKerja ? { hariKerja: inputHariKerja } : {}),
            ...(inputJamKerja ? { jamKerja: inputJamKerja } : {}),
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
  let resolvedDudiId = String(payload.dudi_id || '').trim();
  if (!resolvedDudiId && targetRow) {
    resolvedDudiId = pickField(targetRow, 'ID_DUDI', 'idDudi');
  }
  if (!resolvedDudiId && payload.nama_dudi) {
    const dudiRows = await readSheetDirect('Master_DUDI', true).catch(() => [] as any[]);
    const targetDudiNorm = normalizeStr(payload.nama_dudi);
    const matchedDudi = dudiRows.find(
      (d: any) => normalizeStr(pickField(d, 'Nama_DUDI', 'namaDudi')) === targetDudiNorm
    );
    if (matchedDudi) {
      resolvedDudiId = pickField(matchedDudi, 'ID', 'id');
    }
  }

  const sheetSvc = GoogleDriveSheetService.getInstance();

  if (targetRow) {
    resolvedMonId = pickField(targetRow, 'ID_Monitoring', 'idMonitoring', 'id');
    resolvedStage = pickField(targetRow, 'Tahap', 'tahap') || resolvedStage;
    const rawNote = String(targetRow.Catatan_Kunjungan ?? targetRow.catatanKunjungan ?? '');
    const existingF0701 = rawNote.match(/\[F0701:[^\]]+\]/i);
    const cleanNoteBase = stripStructuredTagsFromNote(rawNote);
    const cleanNote = [cleanNoteBase, existingF0701 ? existingF0701[0] : ''].filter(Boolean).join(' ').trim();

    await writeSheetDirect(
      'Monitoring_5_Tahap',
      'UPDATE',
      sheetSvc.stripFormulaManagedFields('Monitoring_5_Tahap', {
        id: resolvedMonId,
        ID_Monitoring: resolvedMonId,
        idMonitoring: resolvedMonId,
        _sheetRowNumber: targetRow._sheetRowNumber,
        ID_Penempatan: pickField(targetRow, 'ID_Penempatan', 'idPenempatan') || idPenempatan,
        ID_DUDI: resolvedDudiId,
        ID_Guru_Pendamping: pickField(targetRow, 'ID_Guru_Pendamping', 'idGuruPendamping') || String(payload.guru_id || ''),
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
        Nilai_DUDI_Terkumpul: 'Ya',
        nilaiDudiTerkumpul: true,
        Catatan_Kunjungan: cleanNote,
        catatanKunjungan: cleanNote,
      })
    );
  } else {
    resolvedMonId = `MON-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const stageNum = extractStageNumber(resolvedStage) || 5;
    await writeSheetDirect(
      'Monitoring_5_Tahap',
      'CREATE',
      sheetSvc.stripFormulaManagedFields('Monitoring_5_Tahap', {
        id: resolvedMonId,
        ID_Monitoring: resolvedMonId,
        idMonitoring: resolvedMonId,
        ID_Penempatan: idPenempatan,
        ID_DUDI: resolvedDudiId,
        NIS: nis,
        ID_Guru_Pendamping: String(payload.guru_id || ''),
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
        Catatan_Kunjungan: '',
        Nilai_DUDI_Terkumpul: 'Ya',
        Blangko_Sertifikat_Bawa: stageNum >= 5 ? 'Ya' : 'Belum',
        Status_Tahap: 'Terlaksana',
      })
    );
  }

  let nilaiSynced = false;
  try {
    nilaiSynced = await upsertNilaiDanSertifikatFallback({
      cleanNis: nis,
      idPenempatan,
      idDudi: resolvedDudiId,
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
