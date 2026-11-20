import { getPredikatFromScore } from '../../src/core/utils/monitoringHelpers';
import { stripNisSymbols } from '../../src/core/utils/nisHelpers';
import { normalizeStr, pickField } from '../../src/core/utils/rowFieldHelpers';
import { fetchLiveSheetViaGas, writeLiveSheetViaGas } from './sheetsTransport';

export interface SyncDudiContactInput {
  dudiId?: string;
  namaDudi?: string;
  alamatDudi?: string;
  namaPemimpin: string;
  namaPic: string;
  noTelpDudi: string;
  createIfMissing?: boolean;
  overwriteExisting?: boolean;
}

export async function syncDudiContactToMasterAndPengajuan(
  input: SyncDudiContactInput
): Promise<boolean> {
  const targetDudiId = String(input.dudiId || '').trim();
  const targetDudiNameRaw = String(input.namaDudi || '').trim();
  const targetDudiNameNorm = normalizeStr(targetDudiNameRaw);
  const inputPemimpin = String(input.namaPemimpin || '').trim();
  const inputPic = String(input.namaPic || '').trim();
  const inputTelpDudi = String(input.noTelpDudi || '').trim();
  const overwrite = input.overwriteExisting !== false;

  if (!inputPemimpin && !inputPic && !inputTelpDudi) {
    return false;
  }

  const dudiRes = await fetchLiveSheetViaGas('Master_DUDI', true).catch(() => ({ rows: [] as any[] }));
  const existingDudi = dudiRes.rows.find((d: any) => {
    const dId = pickField(d, 'ID', 'id');
    const dNama = normalizeStr(pickField(d, 'Nama_DUDI', 'namaDudi'));
    return (
      (targetDudiId && dId === targetDudiId) ||
      (targetDudiNameNorm && (dNama === targetDudiNameNorm || dNama.includes(targetDudiNameNorm)))
    );
  });

  let synced = false;
  if (existingDudi) {
    const resolvedId = pickField(existingDudi, 'ID', 'id') || targetDudiId;
    const nextPemimpin = overwrite
      ? inputPemimpin || pickField(existingDudi, 'Nama_Pemimpin', 'namaPemimpin')
      : pickField(existingDudi, 'Nama_Pemimpin', 'namaPemimpin') || inputPemimpin;
    const nextPic = overwrite
      ? inputPic || pickField(existingDudi, 'Nama_PIC', 'namaPic')
      : pickField(existingDudi, 'Nama_PIC', 'namaPic') || inputPic;
    const nextTelp = overwrite
      ? inputTelpDudi || pickField(existingDudi, 'No_Telp_DUDI', 'noTelpDudi', 'Kontak_PIC', 'kontakPic')
      : pickField(existingDudi, 'No_Telp_DUDI', 'noTelpDudi', 'Kontak_PIC', 'kontakPic') || inputTelpDudi;

    await writeLiveSheetViaGas('Master_DUDI', 'UPDATE', {
      ...existingDudi,
      id: resolvedId,
      ID: resolvedId,
      Nama_Pemimpin: nextPemimpin,
      namaPemimpin: nextPemimpin,
      Nama_PIC: nextPic,
      namaPic: nextPic,
      Kontak_PIC: nextTelp,
      kontakPic: nextTelp,
      No_Telp_DUDI: nextTelp,
      noTelpDudi: nextTelp,
    });
    synced = true;
  } else if (input.createIfMissing !== false && targetDudiNameRaw) {
    const newDudiId =
      targetDudiId && !targetDudiId.includes('::')
        ? targetDudiId
        : `DUD-${Date.now().toString(36).toUpperCase()}`;
    await writeLiveSheetViaGas('Master_DUDI', 'CREATE', {
      id: newDudiId,
      ID: newDudiId,
      Nama_DUDI: targetDudiNameRaw,
      Bidang_Keahlian: '-',
      Alamat: String(input.alamatDudi || '-').trim(),
      Wilayah_Kota: 'Ponorogo',
      Nama_Pemimpin: inputPemimpin,
      Nama_PIC: inputPic,
      Kontak_PIC: inputTelpDudi,
      No_Telp_DUDI: inputTelpDudi,
      Kuota_Maksimal: 4,
      Terisi: 1,
      Status_Kerjasama: 'Mitra Baru',
    });
    synced = true;
  }

  // Backfill matching active Data_Pengajuan_PKL rows whose DUDI contact is blank
  const reqRes = await fetchLiveSheetViaGas('Data_Pengajuan_PKL', false).catch(() => ({ rows: [] as any[] }));
  const matchingReqs = reqRes.rows.filter((r: any) => {
    const rDudiId = pickField(r, 'ID_DUDI', 'idDudi');
    const rDudiNama = normalizeStr(pickField(r, 'DUDI_Tujuan', 'dudiTujuan'));
    const isTarget =
      (targetDudiId && rDudiId === targetDudiId) ||
      (targetDudiNameNorm && rDudiNama === targetDudiNameNorm);
    const hasBlankContact =
      !pickField(r, 'Nama_Pemimpin', 'namaPemimpin') ||
      !pickField(r, 'Nama_PIC', 'namaPic') ||
      !pickField(r, 'No_Telp_DUDI', 'noTelpDudi');
    return isTarget && hasBlankContact;
  });

  for (const mr of matchingReqs.slice(0, 10)) {
    const mrId = pickField(mr, 'No_Pengajuan', 'noPengajuan', 'id');
    if (!mrId) continue;
    await writeLiveSheetViaGas('Data_Pengajuan_PKL', 'UPDATE', {
      ...mr,
      id: mrId,
      No_Pengajuan: mrId,
      Nama_Pemimpin: pickField(mr, 'Nama_Pemimpin', 'namaPemimpin') || inputPemimpin,
      Nama_PIC: pickField(mr, 'Nama_PIC', 'namaPic') || inputPic,
      No_Telp_DUDI: pickField(mr, 'No_Telp_DUDI', 'noTelpDudi') || inputTelpDudi,
      Kontak_PIC: pickField(mr, 'Kontak_PIC', 'kontakPic') || inputTelpDudi,
    }).catch(() => {});
  }

  return synced;
}

export interface UpsertNilaiSertifikatInput {
  nis: string;
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
  tglTerbit: string;
}

export async function upsertNilaiDanSertifikat(input: UpsertNilaiSertifikatInput): Promise<void> {
  const nilaiRes = await fetchLiveSheetViaGas('Nilai_Dan_Sertifikat', true).catch(() => ({ rows: [] as any[] }));
  const cleanNis = stripNisSymbols(input.nis) || String(input.nis || '').trim();
  const idPenempatan = String(input.idPenempatan || `PLT-${cleanNis}`).trim();

  const existingNilai = nilaiRes.rows.find((n: any) => {
    const rowNis = pickField(n, 'NIS', 'nis');
    const rowNisDigits = stripNisSymbols(rowNis);
    const rowPlt = pickField(n, 'ID_Penempatan', 'idPenempatan');
    return (cleanNis && (rowNisDigits === cleanNis || rowNis === cleanNis)) || (idPenempatan && rowPlt === idPenempatan);
  });

  const roundedDudi = Math.round(input.avgScore * 10) / 10;
  const finalPredikat = getPredikatFromScore(roundedDudi);

  if (existingNilai) {
    const existingId = pickField(existingNilai, 'ID_Penempatan', 'idPenempatan', 'id') || idPenempatan;
    await writeLiveSheetViaGas('Nilai_Dan_Sertifikat', 'UPDATE', {
      ...existingNilai,
      id: existingId,
      ID_Penempatan: existingId,
      Nilai_K3LH: input.k3lh,
      nilaiK3lh: input.k3lh,
      Nilai_Softskills: input.softskill,
      Nilai_Softskill: input.softskill,
      nilaiSoftskill: input.softskill,
      Nilai_Hardskills: input.teknis,
      Nilai_Kompetensi_Teknis: input.teknis,
      nilaiKompetensiTeknis: input.teknis,
      Nilai_Alur_Bisnis_Dunia_Kerja: input.alurBisnis,
      Nilai_Alur_Bisnis: input.alurBisnis,
      nilaiAlurBisnis: input.alurBisnis,
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
    return;
  }

  await writeLiveSheetViaGas('Nilai_Dan_Sertifikat', 'CREATE', {
    id: idPenempatan,
    ID_Penempatan: idPenempatan,
    idPenempatan,
    NIS: cleanNis,
    nis: cleanNis,
    Nama_Siswa: input.namaSiswa,
    namaSiswa: input.namaSiswa,
    Jurusan: input.jurusan,
    jurusan: input.jurusan,
    Kelas: input.kelas || '-',
    kelas: input.kelas || '-',
    DUDI_Tujuan: input.namaDudi,
    dudiTujuan: input.namaDudi,
    Nilai_K3LH: input.k3lh,
    nilaiK3lh: input.k3lh,
    Nilai_Softskills: input.softskill,
    Nilai_Softskill: input.softskill,
    nilaiSoftskill: input.softskill,
    Nilai_Hardskills: input.teknis,
    Nilai_Kompetensi_Teknis: input.teknis,
    nilaiKompetensiTeknis: input.teknis,
    Nilai_Alur_Bisnis_Dunia_Kerja: input.alurBisnis,
    Nilai_Alur_Bisnis: input.alurBisnis,
    nilaiAlurBisnis: input.alurBisnis,
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
    Tgl_Terbit: input.tglTerbit,
    tanggalTerbit: input.tglTerbit,
  });
}
