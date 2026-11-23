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
  hariKerja?: string;
  jamKerja?: string;
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
  const inputHariKerja = String(input.hariKerja || '').trim();
  const inputJamKerja = String(input.jamKerja || '').trim();
  const overwrite = input.overwriteExisting !== false;

  if (!inputPemimpin && !inputPic && !inputTelpDudi && !inputHariKerja && !inputJamKerja) {
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
    const nextHariKerja = overwrite
      ? inputHariKerja || pickField(existingDudi, 'Hari_Kerja', 'hariKerja')
      : pickField(existingDudi, 'Hari_Kerja', 'hariKerja') || inputHariKerja;
    const nextJamKerja = overwrite
      ? inputJamKerja || pickField(existingDudi, 'Jam_Kerja', 'jamKerja')
      : pickField(existingDudi, 'Jam_Kerja', 'jamKerja') || inputJamKerja;

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
      Hari_Kerja: nextHariKerja,
      hariKerja: nextHariKerja,
      Jam_Kerja: nextJamKerja,
      jamKerja: nextJamKerja,
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
      Hari_Kerja: inputHariKerja,
      Jam_Kerja: inputJamKerja,
      Kuota_Maksimal: 4,
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

  const pengajuanUpdates: any[] = [];
  for (const mr of matchingReqs.slice(0, 10)) {
    const mrId = pickField(mr, 'No_Pengajuan', 'noPengajuan', 'id');
    if (!mrId) continue;
    pengajuanUpdates.push({
      ...mr,
      id: mrId,
      No_Pengajuan: mrId,
      Nama_Pemimpin: pickField(mr, 'Nama_Pemimpin', 'namaPemimpin') || inputPemimpin,
      Nama_PIC: pickField(mr, 'Nama_PIC', 'namaPic') || inputPic,
      No_Telp_DUDI: pickField(mr, 'No_Telp_DUDI', 'noTelpDudi') || inputTelpDudi,
      Kontak_PIC: pickField(mr, 'Kontak_PIC', 'kontakPic') || inputTelpDudi,
    });
  }

  if (pengajuanUpdates.length > 0) {
    await writeLiveSheetViaGas('Data_Pengajuan_PKL', 'BULK_UPDATE', {
      ids: pengajuanUpdates.map((r) => r.id),
      updatedRows: pengajuanUpdates,
    }).catch(() => {});
  }

  return synced;
}

export interface UpsertNilaiSertifikatInput {
  nis: string;
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
  tglTerbit: string;
}

/**
 * Grade SSOT: Monitoring_5_Tahap owns the 4 PKL score components.
 * Nilai_Dan_Sertifikat persists only FK + administrative/certificate metadata
 * (ID_Penempatan, NIS, ID_DUDI, No_Seri_Blangko, Status_Blangko, Status_Raport, Tgl_Terbit);
 * student/DUDI display & grade columns are populated via Row-1 ARRAYFORMULA.
 */
export async function upsertNilaiDanSertifikat(input: UpsertNilaiSertifikatInput): Promise<void> {
  const nilaiRes = await fetchLiveSheetViaGas('Nilai_Dan_Sertifikat', true).catch(() => ({ rows: [] as any[] }));
  const cleanNis = stripNisSymbols(input.nis) || String(input.nis || '').trim();
  const idPenempatan = String(input.idPenempatan || `PLT-${cleanNis}`).trim();

  let resolvedDudiId = String(input.idDudi || '').trim();
  if (!resolvedDudiId && input.namaDudi) {
    const dudiRes = await fetchLiveSheetViaGas('Master_DUDI', false).catch(() => ({ rows: [] as any[] }));
    const targetDudiNorm = normalizeStr(input.namaDudi);
    const matchedDudi = dudiRes.rows.find(
      (d: any) => normalizeStr(pickField(d, 'Nama_DUDI', 'namaDudi')) === targetDudiNorm
    );
    if (matchedDudi) {
      resolvedDudiId = pickField(matchedDudi, 'ID', 'id');
    }
  }

  const existingNilai = nilaiRes.rows.find((n: any) => {
    const rowNis = pickField(n, 'NIS', 'nis');
    const rowNisDigits = stripNisSymbols(rowNis);
    const rowPlt = pickField(n, 'ID_Penempatan', 'idPenempatan');
    return (cleanNis && (rowNisDigits === cleanNis || rowNis === cleanNis)) || (idPenempatan && rowPlt === idPenempatan);
  });

  if (existingNilai) {
    const existingId = pickField(existingNilai, 'ID_Penempatan', 'idPenempatan', 'id') || idPenempatan;
    const existingDudiId = pickField(existingNilai, 'ID_DUDI', 'idDudi') || resolvedDudiId;
    await writeLiveSheetViaGas('Nilai_Dan_Sertifikat', 'UPDATE', {
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
      Tgl_Terbit: pickField(existingNilai, 'Tgl_Terbit', 'tanggalTerbit') || input.tglTerbit,
      tanggalTerbit: pickField(existingNilai, 'Tgl_Terbit', 'tanggalTerbit') || input.tglTerbit,
    });
    return;
  }

  await writeLiveSheetViaGas('Nilai_Dan_Sertifikat', 'CREATE', {
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
    Tgl_Terbit: input.tglTerbit,
    tanggalTerbit: input.tglTerbit,
  });
}
