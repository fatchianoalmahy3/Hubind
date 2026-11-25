import { generateJurusanCode, resolveJurusanDisplayName } from './autoIdHelpers';
import { formatPerizinanDateRange } from './dateHelpers';
import { calculateEqualWeightedAverage, getPredikatFromScore } from './monitoringHelpers';
import { stripNisSymbols } from './nisHelpers';
import { normalizeRelationText } from './relationHelpers';

export interface RelationSnapshotMaps {
  siswaRows?: Array<Record<string, any>>;
  jurusanRows?: Array<Record<string, any>>;
  dudiRows?: Array<Record<string, any>>;
  guruRows?: Array<Record<string, any>>;
  placementRows?: Array<Record<string, any>>;
}

function findStudent(
  siswaRows: Array<Record<string, any>> | undefined,
  nis: unknown
): Record<string, any> | undefined {
  if (!Array.isArray(siswaRows) || siswaRows.length === 0) return undefined;
  const targetDigits = stripNisSymbols(nis);
  const targetRaw = normalizeRelationText(nis);
  if (!targetDigits && !targetRaw) return undefined;
  return siswaRows.find((s) => {
    const sDigits = stripNisSymbols(s.nis ?? s.NIS);
    const sRaw = normalizeRelationText(s.nis ?? s.NIS);
    return (targetDigits && sDigits === targetDigits) || (targetRaw && sRaw === targetRaw);
  });
}

function findDudi(
  dudiRows: Array<Record<string, any>> | undefined,
  idDudi: unknown,
  namaDudi?: unknown
): Record<string, any> | undefined {
  if (!Array.isArray(dudiRows) || dudiRows.length === 0) return undefined;
  const cleanId = String(idDudi ?? '').trim();
  if (cleanId) {
    const byId = dudiRows.find((d) => String(d.id ?? d.ID ?? '').trim() === cleanId);
    if (byId) return byId;
  }
  const cleanName = normalizeRelationText(namaDudi);
  if (cleanName) {
    return dudiRows.find((d) => normalizeRelationText(d.namaDudi ?? d.Nama_DUDI) === cleanName);
  }
  return undefined;
}

function findGuru(
  guruRows: Array<Record<string, any>> | undefined,
  idGuru: unknown,
  namaGuru?: unknown
): Record<string, any> | undefined {
  if (!Array.isArray(guruRows) || guruRows.length === 0) return undefined;
  const cleanId = String(idGuru ?? '').trim();
  if (cleanId) {
    const byId = guruRows.find((g) => String(g.id ?? g.ID ?? '').trim() === cleanId);
    if (byId) return byId;
  }
  const cleanName = normalizeRelationText(namaGuru);
  if (cleanName) {
    return guruRows.find((g) => normalizeRelationText(g.nama ?? g.Nama_Lengkap) === cleanName);
  }
  return undefined;
}

function resolveJurusanName(
  jurusanRows: Array<Record<string, any>> | undefined,
  rawIdOrName: unknown
): string {
  const str = String(rawIdOrName ?? '').trim();
  if (!str) return '';
  if (Array.isArray(jurusanRows) && jurusanRows.length > 0) {
    const normStr = normalizeRelationText(str);
    const codeStr = generateJurusanCode(str).toLowerCase();
    const matched = jurusanRows.find((j) => {
      const kode = normalizeRelationText(j.kode ?? j.Kode);
      const nama = normalizeRelationText(j.nama ?? j.Nama_Jurusan);
      return (
        kode === normStr ||
        nama === normStr ||
        (codeStr && kode === codeStr)
      );
    });
    if (matched) {
      return String(matched.nama ?? matched.Nama_Jurusan ?? resolveJurusanDisplayName(str)).trim();
    }
  }
  return resolveJurusanDisplayName(str);
}

interface BuiltRelationIndexes {
  siswaByDigits: Map<string, Record<string, any>>;
  siswaByRaw: Map<string, Record<string, any>>;
  dudiById: Map<string, Record<string, any>>;
  dudiByNormName: Map<string, Record<string, any>>;
  guruById: Map<string, Record<string, any>>;
  guruByNormName: Map<string, Record<string, any>>;
  jurusanNameByKey: Map<string, string>;
  placementById: Map<string, Record<string, any>>;
}

function buildRelationIndexes(maps: RelationSnapshotMaps): BuiltRelationIndexes {
  const siswaByDigits = new Map<string, Record<string, any>>();
  const siswaByRaw = new Map<string, Record<string, any>>();
  if (Array.isArray(maps.siswaRows)) {
    for (const s of maps.siswaRows) {
      const d = stripNisSymbols(s.nis ?? s.NIS);
      const r = normalizeRelationText(s.nis ?? s.NIS);
      if (d && !siswaByDigits.has(d)) siswaByDigits.set(d, s);
      if (r && !siswaByRaw.has(r)) siswaByRaw.set(r, s);
    }
  }

  const dudiById = new Map<string, Record<string, any>>();
  const dudiByNormName = new Map<string, Record<string, any>>();
  if (Array.isArray(maps.dudiRows)) {
    for (const d of maps.dudiRows) {
      const id = String(d.id ?? d.ID ?? '').trim();
      const name = normalizeRelationText(d.namaDudi ?? d.Nama_DUDI);
      if (id && !dudiById.has(id)) dudiById.set(id, d);
      if (name && !dudiByNormName.has(name)) dudiByNormName.set(name, d);
    }
  }

  const guruById = new Map<string, Record<string, any>>();
  const guruByNormName = new Map<string, Record<string, any>>();
  if (Array.isArray(maps.guruRows)) {
    for (const g of maps.guruRows) {
      const id = String(g.id ?? g.ID ?? '').trim();
      const name = normalizeRelationText(g.nama ?? g.Nama_Lengkap);
      if (id && !guruById.has(id)) guruById.set(id, g);
      if (name && !guruByNormName.has(name)) guruByNormName.set(name, g);
    }
  }

  const jurusanNameByKey = new Map<string, string>();
  if (Array.isArray(maps.jurusanRows)) {
    for (const j of maps.jurusanRows) {
      const rawName = String(j.nama ?? j.Nama_Jurusan ?? '').trim();
      const kode = normalizeRelationText(j.kode ?? j.Kode);
      const nama = normalizeRelationText(rawName);
      const resolved = rawName || resolveJurusanDisplayName(j.kode ?? j.Kode);
      if (kode && !jurusanNameByKey.has(kode)) jurusanNameByKey.set(kode, resolved);
      if (nama && !jurusanNameByKey.has(nama)) jurusanNameByKey.set(nama, resolved);
    }
  }

  const placementById = new Map<string, Record<string, any>>();
  if (Array.isArray(maps.placementRows)) {
    for (const p of maps.placementRows) {
      const pid = String(p.idPenempatan ?? p.id ?? '').trim();
      if (pid && !placementById.has(pid)) placementById.set(pid, p);
    }
  }

  return {
    siswaByDigits,
    siswaByRaw,
    dudiById,
    dudiByNormName,
    guruById,
    guruByNormName,
    jurusanNameByKey,
    placementById,
  };
}

function enrichRecordWithIndexes<T extends Record<string, any>>(
  sheetName: string,
  record: T,
  idx: BuiltRelationIndexes
): T {
  if (!record || typeof record !== 'object') return record;
  const out: Record<string, any> = { ...record };

  const resolveJurusan = (rawIdOrName: unknown): string => {
    const str = String(rawIdOrName ?? '').trim();
    if (!str) return '';
    const normStr = normalizeRelationText(str);
    const codeStr = generateJurusanCode(str).toLowerCase();
    return (
      idx.jurusanNameByKey.get(normStr) ||
      (codeStr ? idx.jurusanNameByKey.get(codeStr) : undefined) ||
      resolveJurusanDisplayName(str)
    );
  };

  if (sheetName === 'Master_Siswa_XI' || sheetName === 'Master_Siswa' || sheetName === 'Master_Kelas_Walas') {
    const rawJur = out.idJurusan || out.ID_Jurusan || out.jurusan;
    if (rawJur) {
      out.idJurusan = generateJurusanCode(String(rawJur)) || String(rawJur).trim();
      out.jurusan = resolveJurusan(rawJur);
    }
    return out as T;
  }

  if (sheetName === 'Master_DUDI') {
    const gId = String(out.idGuruPendamping || out.ID_Guru_Pendamping || '').trim();
    const gName = normalizeRelationText(out.guruPendamping);
    const guru = (gId ? idx.guruById.get(gId) : undefined) || (gName ? idx.guruByNormName.get(gName) : undefined);
    if (guru) {
      if (!out.idGuruPendamping && guru.id) out.idGuruPendamping = guru.id;
      const latestGuruName = String(guru.nama || '').trim();
      if (latestGuruName) out.guruPendamping = latestGuruName;
    }
    return out as T;
  }

  if (sheetName === 'Master_Jurusan') {
    const kId = String(out.idKakomli || out.ID_Kakomli || '').trim();
    const kName = normalizeRelationText(out.namaKakomli);
    const guru = (kId ? idx.guruById.get(kId) : undefined) || (kName ? idx.guruByNormName.get(kName) : undefined);
    if (guru) {
      if (!out.idKakomli && guru.id) out.idKakomli = guru.id;
      const latestName = String(guru.nama || '').trim();
      if (latestName) out.namaKakomli = latestName;
      if ((!out.nipKakomli || out.nipKakomli === '-') && guru.nip) out.nipKakomli = guru.nip;
      if ((!out.kontakWA || out.kontakWA === '-') && guru.kontakWA && guru.kontakWA !== '-') {
        out.kontakWA = guru.kontakWA;
      }
    }
    return out as T;
  }

  if (sheetName === 'Log_Penerbitan_Surat') {
    const dId = String(out.idDudi || out.ID_DUDI || '').trim();
    const dName = normalizeRelationText(out.namaDudi || out.dudiTujuan);
    const dudi = (dId ? idx.dudiById.get(dId) : undefined) || (dName ? idx.dudiByNormName.get(dName) : undefined);
    if (dudi) {
      if (!out.idDudi && dudi.id) out.idDudi = dudi.id;
      const latestDudiName = String(dudi.namaDudi || '').trim();
      if (latestDudiName) out.namaDudi = latestDudiName;
    }
    const gId = String(out.idGuruPendamping || out.ID_Guru_Pendamping || dudi?.idGuruPendamping || '').trim();
    const gName = normalizeRelationText(out.guruPendamping || dudi?.guruPendamping);
    const guru = (gId ? idx.guruById.get(gId) : undefined) || (gName ? idx.guruByNormName.get(gName) : undefined);
    if (guru) {
      if (!out.idGuruPendamping && guru.id) out.idGuruPendamping = guru.id;
      const latestGuruName = String(guru.nama || '').trim();
      if (latestGuruName) out.guruPendamping = latestGuruName;
    }
    return out as T;
  }

  const nisRaw = out.nis || out.NIS;
  const targetDigits = stripNisSymbols(nisRaw);
  const targetRaw = normalizeRelationText(nisRaw);
  const student =
    (targetDigits ? idx.siswaByDigits.get(targetDigits) : undefined) ||
    (targetRaw ? idx.siswaByRaw.get(targetRaw) : undefined);

  if (student) {
    if (student.nama) out.namaSiswa = student.nama;
    if (student.kelas) out.kelas = student.kelas;
    const resolvedJur = resolveJurusan(student.idJurusan || student.jurusan);
    if (resolvedJur) out.jurusan = resolvedJur;
    if (student.namaOrtuWali) out.namaOrtuWali = student.namaOrtuWali;
    if (student.noOrtuWali) out.noOrtuWali = student.noOrtuWali;
    if ((!out.noWa || out.noWa === '-') && student.noHpSiswa) out.noWa = student.noHpSiswa;
    if ((!out.alamatDomisili || out.alamatDomisili === '-') && student.alamatDomisili) {
      out.alamatDomisili = student.alamatDomisili;
    }
  }

  const placement = out.idPenempatan
    ? idx.placementById.get(String(out.idPenempatan).trim())
    : undefined;

  const dudiId = String(out.idDudi || out.ID_DUDI || placement?.idDudi || '').trim();
  const dudiNameKey = normalizeRelationText(out.namaDudi || out.dudiTujuan || placement?.namaDudi);
  const dudi =
    (dudiId ? idx.dudiById.get(dudiId) : undefined) ||
    (dudiNameKey ? idx.dudiByNormName.get(dudiNameKey) : undefined);

  if (dudi) {
    if (!out.idDudi && dudi.id) out.idDudi = dudi.id;
    const latestDudiName = String(dudi.namaDudi || '').trim();
    if (sheetName === 'Plotting_Pemberangkatan') {
      if (latestDudiName) out.namaDudi = latestDudiName;
    } else if (
      sheetName === 'Data_Perizinan_PKL' ||
      sheetName === 'Monitoring_5_Tahap' ||
      sheetName === 'Nilai_Dan_Sertifikat' ||
      sheetName === 'Data_Pengajuan_PKL'
    ) {
      if (latestDudiName) out.dudiTujuan = latestDudiName;
      if (dudi.alamat) out.alamatDudi = dudi.alamat;
      if (sheetName === 'Data_Pengajuan_PKL') {
        if ((!out.bidangPekerjaan || out.bidangPekerjaan === '-') && dudi.bidangKeahlian) {
          out.bidangPekerjaan = dudi.bidangKeahlian;
        }
        if ((!out.namaPemimpin || out.namaPemimpin === '-') && dudi.namaPemimpin) {
          out.namaPemimpin = dudi.namaPemimpin;
        }
        if ((!out.namaPic || out.namaPic === '-') && dudi.namaPic) {
          out.namaPic = dudi.namaPic;
        }
        if ((!out.noTelpDudi || out.noTelpDudi === '-') && (dudi.noTelpDudi || dudi.kontakPic)) {
          out.noTelpDudi = dudi.noTelpDudi || dudi.kontakPic;
        }
        if ((!out.hariKerja || out.hariKerja === '-') && dudi.hariKerja) out.hariKerja = dudi.hariKerja;
        if ((!out.jamKerja || out.jamKerja === '-') && dudi.jamKerja) out.jamKerja = dudi.jamKerja;
        if ((!out.linkMaps || out.linkMaps === '-') && dudi.linkMaps) out.linkMaps = dudi.linkMaps;
      }
    }
  }

  const guruId = String(
    out.idGuruPendamping || out.ID_Guru_Pendamping || placement?.idGuruPendamping || dudi?.idGuruPendamping || ''
  ).trim();
  const guruNameKey = normalizeRelationText(
    out.guruPendamping || placement?.guruPendamping || dudi?.guruPendamping
  );
  const guru =
    (guruId ? idx.guruById.get(guruId) : undefined) ||
    (guruNameKey ? idx.guruByNormName.get(guruNameKey) : undefined);

  if (guru) {
    if (
      !out.idGuruPendamping &&
      guru.id &&
      (sheetName === 'Plotting_Pemberangkatan' || sheetName === 'Monitoring_5_Tahap' || sheetName === 'Data_Pengajuan_PKL')
    ) {
      out.idGuruPendamping = guru.id;
    }
    const latestGuruName = String(guru.nama || '').trim();
    if (latestGuruName) out.guruPendamping = latestGuruName;
  }

  if (sheetName === 'Data_Perizinan_PKL') {
    const start = out.tanggalMulaiIzin || out.Tgl_Mulai_Izin;
    const end = out.tanggalSelesaiIzin || out.Tgl_Selesai_Izin;
    if (start && !out.rentangTanggal) {
      out.rentangTanggal = formatPerizinanDateRange(start, end);
    }
  }

  if (sheetName === 'Monitoring_5_Tahap' || sheetName === 'Nilai_Dan_Sertifikat') {
    const k3 = Number(out.nilaiK3lh ?? out.Nilai_K3LH ?? 0);
    const ss = Number(out.nilaiSoftskill ?? out.Nilai_Softskills ?? 0);
    const hs = Number(out.nilaiKompetensiTeknis ?? out.Nilai_Hardskills ?? 0);
    const ab = Number(out.nilaiAlurBisnis ?? out.Nilai_Alur_Bisnis_Dunia_Kerja ?? 0);
    if (k3 + ss + hs + ab > 0) {
      const avg = calculateEqualWeightedAverage(k3, ss, hs, ab);
      out.nilaiRataRata = avg;
      if (sheetName === 'Nilai_Dan_Sertifikat') {
        out.predikat = getPredikatFromScore(avg);
      }
    }
  }

  return out as T;
}

/**
 * Enriches an optimistic / client-side record with relational display fields
 * (`namaSiswa`, `jurusan`, `kelas`, `dudiTujuan`, `guruPendamping`, `nilaiRataRata`, `predikat`, `rentangTanggal`)
 * from cached Master snapshots when Google Sheet formula cells haven't been re-fetched yet.
 */
export function enrichRecordWithRelations<T extends Record<string, any>>(
  sheetName: string,
  record: T,
  maps: RelationSnapshotMaps
): T {
  if (!record || typeof record !== 'object') return record;
  const out: Record<string, any> = { ...record };

  if (sheetName === 'Master_Siswa_XI' || sheetName === 'Master_Siswa') {
    const rawJur = out.idJurusan || out.ID_Jurusan || out.jurusan;
    if (rawJur) {
      out.idJurusan = generateJurusanCode(String(rawJur)) || String(rawJur).trim();
      out.jurusan = resolveJurusanName(maps.jurusanRows, rawJur);
    }
    return out as T;
  }

  if (sheetName === 'Master_Kelas_Walas') {
    const rawJur = out.idJurusan || out.ID_Jurusan || out.jurusan;
    if (rawJur) {
      out.idJurusan = generateJurusanCode(String(rawJur)) || String(rawJur).trim();
      out.jurusan = resolveJurusanName(maps.jurusanRows, rawJur);
    }
    return out as T;
  }

  if (sheetName === 'Master_DUDI') {
    const guru = findGuru(maps.guruRows, out.idGuruPendamping || out.ID_Guru_Pendamping, out.guruPendamping);
    if (guru) {
      if (!out.idGuruPendamping && guru.id) out.idGuruPendamping = guru.id;
      const latestGuruName = String(guru.nama || '').trim();
      if (latestGuruName) out.guruPendamping = latestGuruName;
    }
    return out as T;
  }

  if (sheetName === 'Master_Jurusan') {
    const guru = findGuru(maps.guruRows, out.idKakomli || out.ID_Kakomli, out.namaKakomli);
    if (guru) {
      if (!out.idKakomli && guru.id) out.idKakomli = guru.id;
      const latestName = String(guru.nama || '').trim();
      if (latestName) out.namaKakomli = latestName;
      if ((!out.nipKakomli || out.nipKakomli === '-') && guru.nip) out.nipKakomli = guru.nip;
      if ((!out.kontakWA || out.kontakWA === '-') && guru.kontakWA && guru.kontakWA !== '-') {
        out.kontakWA = guru.kontakWA;
      }
    }
    return out as T;
  }

  if (sheetName === 'Log_Penerbitan_Surat') {
    const dudi = findDudi(maps.dudiRows, out.idDudi || out.ID_DUDI, out.namaDudi || out.dudiTujuan);
    if (dudi) {
      if (!out.idDudi && dudi.id) out.idDudi = dudi.id;
      const latestDudiName = String(dudi.namaDudi || '').trim();
      if (latestDudiName) out.namaDudi = latestDudiName;
    }
    const guru = findGuru(
      maps.guruRows,
      out.idGuruPendamping || out.ID_Guru_Pendamping || dudi?.idGuruPendamping,
      out.guruPendamping || dudi?.guruPendamping
    );
    if (guru) {
      if (!out.idGuruPendamping && guru.id) out.idGuruPendamping = guru.id;
      const latestGuruName = String(guru.nama || '').trim();
      if (latestGuruName) out.guruPendamping = latestGuruName;
    }
    return out as T;
  }

  // Shared student lookup
  const student = findStudent(maps.siswaRows, out.nis || out.NIS);
  if (student) {
    if (student.nama) out.namaSiswa = student.nama;
    if (student.kelas) out.kelas = student.kelas;
    const resolvedJur = resolveJurusanName(maps.jurusanRows, student.idJurusan || student.jurusan);
    if (resolvedJur) out.jurusan = resolvedJur;
    if (student.namaOrtuWali) out.namaOrtuWali = student.namaOrtuWali;
    if (student.noOrtuWali) out.noOrtuWali = student.noOrtuWali;
    if ((!out.noWa || out.noWa === '-') && student.noHpSiswa) out.noWa = student.noHpSiswa;
    if ((!out.alamatDomisili || out.alamatDomisili === '-') && student.alamatDomisili) {
      out.alamatDomisili = student.alamatDomisili;
    }
  }

  // Placement lookup when idPenempatan present
  const placement =
    Array.isArray(maps.placementRows) && out.idPenempatan
      ? maps.placementRows.find((p) => String(p.idPenempatan || p.id).trim() === String(out.idPenempatan).trim())
      : undefined;

  const dudi = findDudi(
    maps.dudiRows,
    out.idDudi || out.ID_DUDI || placement?.idDudi,
    out.namaDudi || out.dudiTujuan || placement?.namaDudi
  );
  if (dudi) {
    if (!out.idDudi && dudi.id) out.idDudi = dudi.id;
    const latestDudiName = String(dudi.namaDudi || '').trim();
    if (sheetName === 'Plotting_Pemberangkatan') {
      if (latestDudiName) out.namaDudi = latestDudiName;
    } else if (
      sheetName === 'Data_Perizinan_PKL' ||
      sheetName === 'Monitoring_5_Tahap' ||
      sheetName === 'Nilai_Dan_Sertifikat' ||
      sheetName === 'Data_Pengajuan_PKL'
    ) {
      if (latestDudiName) out.dudiTujuan = latestDudiName;
      if (dudi.alamat) out.alamatDudi = dudi.alamat;
      if (sheetName === 'Data_Pengajuan_PKL') {
        if ((!out.bidangPekerjaan || out.bidangPekerjaan === '-') && dudi.bidangKeahlian) {
          out.bidangPekerjaan = dudi.bidangKeahlian;
        }
        if ((!out.namaPemimpin || out.namaPemimpin === '-') && dudi.namaPemimpin) {
          out.namaPemimpin = dudi.namaPemimpin;
        }
        if ((!out.namaPic || out.namaPic === '-') && dudi.namaPic) {
          out.namaPic = dudi.namaPic;
        }
        if ((!out.noTelpDudi || out.noTelpDudi === '-') && (dudi.noTelpDudi || dudi.kontakPic)) {
          out.noTelpDudi = dudi.noTelpDudi || dudi.kontakPic;
        }
        if ((!out.hariKerja || out.hariKerja === '-') && dudi.hariKerja) out.hariKerja = dudi.hariKerja;
        if ((!out.jamKerja || out.jamKerja === '-') && dudi.jamKerja) out.jamKerja = dudi.jamKerja;
        if ((!out.linkMaps || out.linkMaps === '-') && dudi.linkMaps) out.linkMaps = dudi.linkMaps;
      }
    }
  }

  const guru = findGuru(
    maps.guruRows,
    out.idGuruPendamping || out.ID_Guru_Pendamping || placement?.idGuruPendamping || dudi?.idGuruPendamping,
    out.guruPendamping || placement?.guruPendamping || dudi?.guruPendamping
  );
  if (guru) {
    if (
      !out.idGuruPendamping &&
      guru.id &&
      (sheetName === 'Plotting_Pemberangkatan' || sheetName === 'Monitoring_5_Tahap' || sheetName === 'Data_Pengajuan_PKL')
    ) {
      out.idGuruPendamping = guru.id;
    }
    const latestGuruName = String(guru.nama || '').trim();
    if (latestGuruName) out.guruPendamping = latestGuruName;
  }

  if (sheetName === 'Data_Perizinan_PKL') {
    const start = out.tanggalMulaiIzin || out.Tgl_Mulai_Izin;
    const end = out.tanggalSelesaiIzin || out.Tgl_Selesai_Izin;
    if (start && !out.rentangTanggal) {
      out.rentangTanggal = formatPerizinanDateRange(start, end);
    }
  }

  if (sheetName === 'Monitoring_5_Tahap' || sheetName === 'Nilai_Dan_Sertifikat') {
    const k3 = Number(out.nilaiK3lh ?? out.Nilai_K3LH ?? 0);
    const ss = Number(out.nilaiSoftskill ?? out.Nilai_Softskills ?? 0);
    const hs = Number(out.nilaiKompetensiTeknis ?? out.Nilai_Hardskills ?? 0);
    const ab = Number(out.nilaiAlurBisnis ?? out.Nilai_Alur_Bisnis_Dunia_Kerja ?? 0);
    if (k3 + ss + hs + ab > 0) {
      const avg = calculateEqualWeightedAverage(k3, ss, hs, ab);
      out.nilaiRataRata = avg;
      if (sheetName === 'Nilai_Dan_Sertifikat') {
        out.predikat = getPredikatFromScore(avg);
      }
    }
  }

  return out as T;
}

/**
 * Batch relation enrichment in O(N + M) by pre-indexing Master Maps once.
 */
export function enrichBatchWithRelations<T extends Record<string, any>>(
  sheetName: string,
  rows: T[],
  maps: RelationSnapshotMaps
): T[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const idx = buildRelationIndexes(maps);
  return rows.map((row) => enrichRecordWithIndexes(sheetName, row, idx));
}

