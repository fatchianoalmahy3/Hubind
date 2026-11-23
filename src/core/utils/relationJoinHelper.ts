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
      if (!out.idGuruPendamping) out.idGuruPendamping = guru.id;
      if (!out.guruPendamping) out.guruPendamping = guru.nama;
    }
    return out as T;
  }

  // Shared student lookup
  const student = findStudent(maps.siswaRows, out.nis || out.NIS);
  if (student) {
    if (!out.namaSiswa) out.namaSiswa = student.nama || '';
    if (!out.kelas) out.kelas = student.kelas || '';
    if (!out.jurusan) out.jurusan = resolveJurusanName(maps.jurusanRows, student.idJurusan || student.jurusan);
    if (!out.namaOrtuWali) out.namaOrtuWali = student.namaOrtuWali || '';
    if (!out.noOrtuWali) out.noOrtuWali = student.noOrtuWali || '';
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
    if (!out.idDudi) out.idDudi = dudi.id;
    if (sheetName === 'Plotting_Pemberangkatan') {
      if (!out.namaDudi) out.namaDudi = dudi.namaDudi || '';
    } else if (
      sheetName === 'Data_Perizinan_PKL' ||
      sheetName === 'Monitoring_5_Tahap' ||
      sheetName === 'Nilai_Dan_Sertifikat' ||
      sheetName === 'Data_Pengajuan_PKL'
    ) {
      if (!out.dudiTujuan) out.dudiTujuan = dudi.namaDudi || '';
      if (!out.alamatDudi && dudi.alamat) out.alamatDudi = dudi.alamat;
    }
  }

  const guru = findGuru(
    maps.guruRows,
    out.idGuruPendamping || out.ID_Guru_Pendamping || placement?.idGuruPendamping || dudi?.idGuruPendamping,
    out.guruPendamping || placement?.guruPendamping || dudi?.guruPendamping
  );
  if (guru) {
    if (!out.idGuruPendamping && (sheetName === 'Plotting_Pemberangkatan' || sheetName === 'Monitoring_5_Tahap' || sheetName === 'Data_Pengajuan_PKL')) {
      out.idGuruPendamping = guru.id;
    }
    if (!out.guruPendamping) out.guruPendamping = guru.nama || '';
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
