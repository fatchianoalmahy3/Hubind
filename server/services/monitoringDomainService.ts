import { getTodayWibIsoDate } from '../../src/core/utils/dateHelpers';
import {
  extractIssuedStageNumber,
  getStageValueByNumber,
  isIssuedLetterStatusActive,
} from '../../src/core/utils/monitoringHelpers';
import { stripNisSymbols } from '../../src/core/utils/nisHelpers';
import { normalizeStr, pickField } from '../../src/core/utils/rowFieldHelpers';
import { getFirestoreWorkspaceConfig } from '../config/runtimeConfig';
import {
  fetchLiveSheetViaGas,
  invalidateSheetCacheEntry,
  writeLiveSheetViaGas,
} from './sheetsTransport';

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

  const dudiRes = await fetchLiveSheetViaGas('Master_DUDI', false).catch(() => ({ rows: [] as any[] }));
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
    const currPemimpin = pickField(existingDudi, 'Nama_Pemimpin', 'namaPemimpin');
    const currPic = pickField(existingDudi, 'Nama_PIC', 'namaPic');
    const currTelp = pickField(existingDudi, 'No_Telp_DUDI', 'noTelpDudi', 'Kontak_PIC', 'kontakPic');
    const currHariKerja = pickField(existingDudi, 'Hari_Kerja', 'hariKerja');
    const currJamKerja = pickField(existingDudi, 'Jam_Kerja', 'jamKerja');

    const nextPemimpin = overwrite ? inputPemimpin || currPemimpin : currPemimpin || inputPemimpin;
    const nextPic = overwrite ? inputPic || currPic : currPic || inputPic;
    const nextTelp = overwrite ? inputTelpDudi || currTelp : currTelp || inputTelpDudi;
    const nextHariKerja = overwrite ? inputHariKerja || currHariKerja : currHariKerja || inputHariKerja;
    const nextJamKerja = overwrite ? inputJamKerja || currJamKerja : currJamKerja || inputJamKerja;

    const hasChanges =
      nextPemimpin !== currPemimpin ||
      nextPic !== currPic ||
      nextTelp !== currTelp ||
      nextHariKerja !== currHariKerja ||
      nextJamKerja !== currJamKerja;

    if (hasChanges) {
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
    }
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
      !pickField(r, 'No_Telp_DUDI', 'noTelpDudi') ||
      (inputHariKerja && !pickField(r, 'Hari_Kerja', 'hariKerja')) ||
      (inputJamKerja && !pickField(r, 'Jam_Kerja', 'jamKerja'));
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
      Hari_Kerja: pickField(mr, 'Hari_Kerja', 'hariKerja') || inputHariKerja,
      Jam_Kerja: pickField(mr, 'Jam_Kerja', 'jamKerja') || inputJamKerja,
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

export interface IssuedLetterTargetInput {
  dudiId?: string;
  namaDudi: string;
  tahap: number;
  jenisDokumen?: string;
  nomorSurat?: string;
  tanggalTerbit?: string;
  diterbitkanOleh?: string;
  guruPendamping?: string;
  linkPdf?: string;
}

export interface IssuedLetterRecordDto {
  id: string;
  idTerbit: string;
  idDudi: string;
  namaDudi: string;
  tahap: number;
  namaTahap: string;
  statusTerbit: string;
  jenisDokumen: string;
  nomorSurat: string;
  tanggalTerbit: string;
  diterbitkanOleh: string;
  guruPendamping: string;
  linkPdf: string;
  updatedAt: string;
  _sheetRowNumber?: number;
}

function mapRawIssuedLetterRow(row: any, idx: number): IssuedLetterRecordDto {
  const idTerbit =
    pickField(row, 'ID_Terbit', 'idTerbit', 'id') ||
    `TRB-ROW-${Number(row?._sheetRowNumber || idx + 2)}`;
  const tahap =
    extractIssuedStageNumber(row?.Tahap ?? row?.tahap) ||
    extractIssuedStageNumber(row?.Nama_Tahap ?? row?.namaTahap) ||
    1;
  return {
    id: idTerbit,
    idTerbit,
    idDudi: pickField(row, 'ID_DUDI', 'idDudi'),
    namaDudi: pickField(row, 'Nama_DUDI', 'namaDudi'),
    tahap,
    namaTahap: pickField(row, 'Nama_Tahap', 'namaTahap') || getStageValueByNumber(tahap),
    statusTerbit: pickField(row, 'Status_Terbit', 'statusTerbit') || 'Sudah Terbit',
    jenisDokumen: pickField(row, 'Jenis_Dokumen', 'jenisDokumen'),
    nomorSurat: pickField(row, 'Nomor_Surat', 'nomorSurat'),
    tanggalTerbit: pickField(row, 'Tanggal_Terbit', 'tanggalTerbit'),
    diterbitkanOleh: pickField(row, 'Diterbitkan_Oleh', 'diterbitkanOleh'),
    guruPendamping: pickField(row, 'Guru_Pendamping', 'guruPendamping'),
    linkPdf: pickField(row, 'Link_PDF', 'linkPdf'),
    updatedAt: pickField(row, 'Updated_At', 'updatedAt'),
    _sheetRowNumber: typeof row?._sheetRowNumber === 'number' ? row._sheetRowNumber : undefined,
  };
}

export async function fetchIssuedLettersList(
  forceRefresh = false
): Promise<IssuedLetterRecordDto[]> {
  const res = await fetchLiveSheetViaGas('Log_Penerbitan_Surat', forceRefresh).catch(() => ({
    rows: [] as any[],
  }));
  return (Array.isArray(res.rows) ? res.rows : []).map((row, idx) =>
    mapRawIssuedLetterRow(row, idx)
  );
}

export async function recordIssuedLetters(
  items: IssuedLetterTargetInput[],
  actorName: string
): Promise<IssuedLetterRecordDto[]> {
  if (!Array.isArray(items) || items.length === 0) return [];

  const [existingRes, dudiRes] = await Promise.all([
    fetchLiveSheetViaGas('Log_Penerbitan_Surat', true).catch(() => ({ rows: [] as any[] })),
    fetchLiveSheetViaGas('Master_DUDI', false).catch(() => ({ rows: [] as any[] })),
  ]);

  const existingRows = Array.isArray(existingRes.rows) ? [...existingRes.rows] : [];
  const dudiRows = Array.isArray(dudiRes.rows) ? dudiRes.rows : [];
  const todayIso = getTodayWibIsoDate();
  const nowIso = new Date().toISOString();
  const results: IssuedLetterRecordDto[] = [];

  for (let i = 0; i < items.length; i += 1) {
    const rawItem = items[i];
    const tahap = Number(rawItem?.tahap);
    const rawName = String(rawItem?.namaDudi || '').trim().slice(0, 180);
    let resolvedDudiId = String(rawItem?.dudiId || '').trim().slice(0, 80);

    if (!Number.isInteger(tahap) || tahap < 1 || tahap > 8 || (!rawName && !resolvedDudiId)) {
      continue;
    }

    const targetNorm = normalizeStr(rawName);
    const matchedDudi = dudiRows.find((d: any) => {
      const mId = pickField(d, 'ID', 'id');
      const mNama = normalizeStr(pickField(d, 'Nama_DUDI', 'namaDudi'));
      return (resolvedDudiId && mId === resolvedDudiId) || (targetNorm && mNama === targetNorm);
    });
    if (matchedDudi) {
      resolvedDudiId = pickField(matchedDudi, 'ID', 'id') || resolvedDudiId;
    }
    const resolvedDudiNama =
      rawName || pickField(matchedDudi || {}, 'Nama_DUDI', 'namaDudi') || resolvedDudiId;

    const existingIdx = existingRows.findIndex((r: any) => {
      const rowStage =
        extractIssuedStageNumber(r.Tahap ?? r.tahap) ||
        extractIssuedStageNumber(r.Nama_Tahap ?? r.namaTahap);
      if (rowStage !== tahap) return false;
      const rId = pickField(r, 'ID_DUDI', 'idDudi');
      const rNama = normalizeStr(pickField(r, 'Nama_DUDI', 'namaDudi'));
      return (
        (resolvedDudiId && rId && rId === resolvedDudiId) ||
        (targetNorm && rNama && rNama === targetNorm)
      );
    });

    const namaTahap = getStageValueByNumber(tahap);
    const existingRow = existingIdx >= 0 ? existingRows[existingIdx] : null;
    const existingIdTerbit = existingRow
      ? pickField(existingRow, 'ID_Terbit', 'idTerbit', 'id')
      : '';
    const idTerbit =
      existingIdTerbit ||
      `TRB-${(resolvedDudiId || 'DUDI').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24)}-T${tahap}-${Date.now().toString(36).slice(-4)}${i}`;

    const recordPayload = {
      id: idTerbit,
      ID_Terbit: idTerbit,
      idTerbit,
      ID_DUDI: resolvedDudiId,
      idDudi: resolvedDudiId,
      Nama_DUDI: resolvedDudiNama,
      namaDudi: resolvedDudiNama,
      Tahap: tahap,
      tahap,
      Nama_Tahap: namaTahap,
      namaTahap,
      Status_Terbit: 'Sudah Terbit',
      statusTerbit: 'Sudah Terbit',
      Jenis_Dokumen:
        String(rawItem.jenisDokumen || '').trim().slice(0, 120) ||
        pickField(existingRow || {}, 'Jenis_Dokumen', 'jenisDokumen') ||
        'Paket / Surat Supervisi',
      jenisDokumen:
        String(rawItem.jenisDokumen || '').trim().slice(0, 120) ||
        pickField(existingRow || {}, 'Jenis_Dokumen', 'jenisDokumen') ||
        'Paket / Surat Supervisi',
      Nomor_Surat:
        String(rawItem.nomorSurat || '').trim().slice(0, 120) ||
        pickField(existingRow || {}, 'Nomor_Surat', 'nomorSurat'),
      nomorSurat:
        String(rawItem.nomorSurat || '').trim().slice(0, 120) ||
        pickField(existingRow || {}, 'Nomor_Surat', 'nomorSurat'),
      Tanggal_Terbit: String(rawItem.tanggalTerbit || '').trim().slice(0, 40) || todayIso,
      tanggalTerbit: String(rawItem.tanggalTerbit || '').trim().slice(0, 40) || todayIso,
      Diterbitkan_Oleh:
        String(rawItem.diterbitkanOleh || actorName || 'Admin Hubin').trim().slice(0, 120),
      diterbitkanOleh:
        String(rawItem.diterbitkanOleh || actorName || 'Admin Hubin').trim().slice(0, 120),
      Guru_Pendamping:
        String(rawItem.guruPendamping || '').trim().slice(0, 120) ||
        pickField(existingRow || {}, 'Guru_Pendamping', 'guruPendamping'),
      guruPendamping:
        String(rawItem.guruPendamping || '').trim().slice(0, 120) ||
        pickField(existingRow || {}, 'Guru_Pendamping', 'guruPendamping'),
      Link_PDF:
        String(rawItem.linkPdf || '').trim().slice(0, 500) ||
        pickField(existingRow || {}, 'Link_PDF', 'linkPdf'),
      linkPdf:
        String(rawItem.linkPdf || '').trim().slice(0, 500) ||
        pickField(existingRow || {}, 'Link_PDF', 'linkPdf'),
      Updated_At: nowIso,
      updatedAt: nowIso,
    };

    if (existingRow) {
      await writeLiveSheetViaGas('Log_Penerbitan_Surat', 'UPDATE', {
        ...recordPayload,
        _sheetRowNumber: existingRow._sheetRowNumber,
      });
      existingRows[existingIdx] = { ...existingRow, ...recordPayload };
    } else {
      await writeLiveSheetViaGas('Log_Penerbitan_Surat', 'CREATE', recordPayload);
      existingRows.push(recordPayload);
    }

    results.push(mapRawIssuedLetterRow(recordPayload, existingIdx >= 0 ? existingIdx : existingRows.length - 1));
  }

  const cfg = await getFirestoreWorkspaceConfig().catch(() => null);
  if (cfg?.spreadsheetId) {
    invalidateSheetCacheEntry(cfg.spreadsheetId, 'Log_Penerbitan_Surat');
  }

  return results;
}

export async function revokeIssuedLetter(params: {
  idTerbit?: string;
  dudiId?: string;
  namaDudi?: string;
  tahap: number;
  actorName: string;
}): Promise<{ revoked: boolean; idTerbit?: string }> {
  const tahap = Number(params.tahap);
  if (!Number.isInteger(tahap) || tahap < 1 || tahap > 8) {
    return { revoked: false };
  }

  const existingRes = await fetchLiveSheetViaGas('Log_Penerbitan_Surat', true).catch(() => ({
    rows: [] as any[],
  }));
  const rows = Array.isArray(existingRes.rows) ? existingRes.rows : [];
  const targetIdTerbit = String(params.idTerbit || '').trim();
  const targetDudiId = String(params.dudiId || '').trim();
  const targetDudiNorm = normalizeStr(params.namaDudi || '');
  const nowIso = new Date().toISOString();

  const matchingRows = rows.filter((r: any) => {
    const rIdTerbit = pickField(r, 'ID_Terbit', 'idTerbit', 'id');
    if (targetIdTerbit && rIdTerbit === targetIdTerbit) return true;
    const rowStage =
      extractIssuedStageNumber(r.Tahap ?? r.tahap) ||
      extractIssuedStageNumber(r.Nama_Tahap ?? r.namaTahap);
    if (rowStage !== tahap) return false;
    const rDudiId = pickField(r, 'ID_DUDI', 'idDudi');
    const rDudiNama = normalizeStr(pickField(r, 'Nama_DUDI', 'namaDudi'));
    return (
      (targetDudiId && rDudiId && rDudiId === targetDudiId) ||
      (targetDudiNorm && rDudiNama && rDudiNama === targetDudiNorm)
    );
  });

  if (matchingRows.length === 0) {
    return { revoked: false };
  }

  let lastIdTerbit = '';
  for (const row of matchingRows) {
    if (!isIssuedLetterStatusActive(row.Status_Terbit ?? row.statusTerbit)) continue;
    const rowIdTerbit = pickField(row, 'ID_Terbit', 'idTerbit', 'id');
    lastIdTerbit = rowIdTerbit || lastIdTerbit;
    await writeLiveSheetViaGas('Log_Penerbitan_Surat', 'UPDATE', {
      ...row,
      id: rowIdTerbit,
      ID_Terbit: rowIdTerbit,
      idTerbit: rowIdTerbit,
      _sheetRowNumber: row._sheetRowNumber,
      Status_Terbit: 'Dibatalkan',
      statusTerbit: 'Dibatalkan',
      Diterbitkan_Oleh: `${String(params.actorName || 'Admin Hubin').trim().slice(0, 80)} (Dibatalkan)`,
      diterbitkanOleh: `${String(params.actorName || 'Admin Hubin').trim().slice(0, 80)} (Dibatalkan)`,
      Updated_At: nowIso,
      updatedAt: nowIso,
    });
  }

  const cfg = await getFirestoreWorkspaceConfig().catch(() => null);
  if (cfg?.spreadsheetId) {
    invalidateSheetCacheEntry(cfg.spreadsheetId, 'Log_Penerbitan_Surat');
  }

  return { revoked: true, idTerbit: lastIdTerbit || undefined };
}

