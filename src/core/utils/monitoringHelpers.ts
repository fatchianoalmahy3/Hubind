import {
  DEFAULT_MONITORING_STAGE_CONTROL,
  MONITORING_STAGES,
  type AktivitasSikapRating,
  type BukuLaporanStatus,
  type IssuedStageDetail,
  type Jurusan,
  type KondisiBengkelCheck,
  type KondisiBengkelRating,
  type MonitoringStageControl,
  type PerizinanPKL,
} from '../types/schema';
import { normalizeToIsoDate } from './dateHelpers';
import { matchJurusanItem } from './jurusanHelpers';
import { stripNisSymbols } from './nisHelpers';

export interface ParsedGradeSummary {
  monitoringId?: string;
  k3lh: number | null;
  softskill: number | null;
  teknis: number | null;
  alurBisnis: number | null;
  rataRata: number;
  tahapDiinput?: string;
  tanggal?: string;
}

export interface ParsedFormat0701Data {
  bukuLaporan: BukuLaporanStatus | '';
  aktivitasDp: AktivitasSikapRating | '';
  aktivitasMt: AktivitasSikapRating | '';
  aktivitasKrt: AktivitasSikapRating | '';
  kompetensiList: string[];
  kondisiBengkel: KondisiBengkelCheck;
  ttdSiswa: string;
}

export interface StageLogEntry {
  monitoringId?: string;
  stageNum: number;
  tahap: string;
  sakit: number;
  izin: number;
  alpha: number;
  bukuLaporan: BukuLaporanStatus | '';
  aktivitasDp: AktivitasSikapRating | '';
  aktivitasMt: AktivitasSikapRating | '';
  aktivitasKrt: AktivitasSikapRating | '';
  kompetensiList: string[];
  kondisiBengkel: KondisiBengkelCheck;
  ttdSiswa: string;
  catatan: string;
  tanggal: string;
  status: string;
}

export interface StudentMonitoringSummary {
  completedStages: number[];
  recommendedStage: number;
  hasSubmittedGrades: boolean;
  submittedGradeSummary: ParsedGradeSummary | null;
  stageLogs: Record<number, StageLogEntry>;
}

export type MonitoringVerificationStatus =
  | 'Belum Terlaksana'
  | 'Terlaksana'
  | 'Tervalidasi Kakomli'
  | 'Tervalidasi Hubin';

export function normalizeMonitoringVerificationStatus(
  statusRaw: unknown
): MonitoringVerificationStatus {
  const low = String(statusRaw ?? '').trim().toLowerCase();
  if (!low || low.includes('belum')) return 'Belum Terlaksana';
  if (low.includes('hubin')) return 'Tervalidasi Hubin';
  if (low.includes('kakomli')) return 'Tervalidasi Kakomli';
  return 'Terlaksana';
}

export function isStageFullyVerified(statusRaw: unknown): boolean {
  return normalizeMonitoringVerificationStatus(statusRaw) === 'Tervalidasi Hubin';
}

export function extractStageNumber(tahapRaw: any): number {
  const s = String(tahapRaw ?? '').trim();
  if (!s) return 0;
  const lower = s.toLowerCase();
  if (lower.includes('pengantaran')) return 1;
  if (lower.includes('penarikan')) return 8;

  // Map "Monitoring 1..6" to stages 2..7 explicitly
  const monMatch = lower.match(/monitoring\s*([1-6])\b/);
  if (monMatch) {
    return Number(monMatch[1]) + 1;
  }

  const prefixMatch = s.match(/^([1-8])\b/);
  if (prefixMatch) return Number(prefixMatch[1]);

  const tahapMatch = lower.match(/tahap\s*([1-8])\b/);
  if (tahapMatch) return Number(tahapMatch[1]);

  return 0;
}

export function getStageValueByNumber(num: number): string {
  const found = MONITORING_STAGES.find((st) => st.num === num);
  return found ? found.value : MONITORING_STAGES[0].value;
}

export function calculateEqualWeightedAverage(
  k3lh: number,
  softskill: number,
  teknis: number,
  alurBisnis: number
): number {
  const avg = (Number(k3lh) + Number(softskill) + Number(teknis) + Number(alurBisnis)) / 4;
  return Math.round(avg * 10) / 10;
}

export function getPredikatFromScore(score: number): string {
  if (score >= 88) return 'Sangat Baik (A)';
  if (score >= 78) return 'Baik (B)';
  if (score >= 68) return 'Cukup (C)';
  return 'Kurang (D)';
}

function toSafeInt(val: any, fallback = 0): number {
  const n = Number(val);
  if (Number.isNaN(n) || !Number.isFinite(n)) return fallback;
  return Math.max(0, Math.round(n));
}

function toSafeScore(val: any): number | null {
  if (val === undefined || val === null || String(val).trim() === '') return null;
  const n = Number(val);
  if (Number.isNaN(n) || !Number.isFinite(n) || n <= 0) return null;
  return Math.min(100, Math.max(0, Math.round(n * 10) / 10));
}

export function parseAttendanceFromRow(row: Record<string, any>): {
  sakit: number;
  izin: number;
  alpha: number;
} {
  const colSakit = row.Sakit ?? row.sakit;
  const colIzin = row.Izin ?? row.izin;
  const colAlpha = row.Alpha ?? row.alpha ?? row.alfa;

  if (
    (colSakit !== undefined && colSakit !== '') ||
    (colIzin !== undefined && colIzin !== '') ||
    (colAlpha !== undefined && colAlpha !== '')
  ) {
    return {
      sakit: toSafeInt(colSakit, 0),
      izin: toSafeInt(colIzin, 0),
      alpha: toSafeInt(colAlpha, 0),
    };
  }

  const note = String(row.Catatan_Kunjungan ?? row.catatanKunjungan ?? '');
  const match = note.match(/\[Absensi:\s*S=(\d+),\s*I=(\d+),\s*A=(\d+)\]/i);
  if (match) {
    return {
      sakit: toSafeInt(match[1], 0),
      izin: toSafeInt(match[2], 0),
      alpha: toSafeInt(match[3], 0),
    };
  }

  return { sakit: 0, izin: 0, alpha: 0 };
}

export const WORK_DAY_OPTIONS = [
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
  'Minggu',
] as const;

export function parseRangePair(
  raw: unknown,
  defaultStart = '',
  defaultEnd = ''
): { start: string; end: string } {
  const s = String(raw ?? '').trim();
  if (!s || s === '-') return { start: defaultStart, end: defaultEnd };
  const parts = s.split(/\s*(?:s\/d|s\.d\.|-|–|sampai)\s*/i).map((p) => p.trim());
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return { start: parts[0], end: parts[1] };
  }
  return { start: parts[0] || defaultStart, end: defaultEnd };
}

export function formatRangePair(start: string, end: string): string {
  const s = String(start || '').trim();
  const e = String(end || '').trim();
  if (!s && !e) return '';
  if (s && e) return `${s} s/d ${e}`;
  return s || e;
}

export const EMPTY_KONDISI_BENGKEL: KondisiBengkelCheck = {
  volumePekerjaan: '',
  relevansiPekerjaan: '',
  kenyamanan: '',
  kelayakan: '',
};

function normalizeBukuLaporan(raw: unknown): BukuLaporanStatus | '' {
  const up = String(raw ?? '').trim().toUpperCase();
  if (up === 'BLM' || up === 'SDH' || up === 'TDK') return up;
  return '';
}

function normalizeAktivitasRating(raw: unknown): AktivitasSikapRating | '' {
  const low = String(raw ?? '').trim().toLowerCase();
  if (low === 'baik' || low === 'b') return 'Baik';
  if (low === 'cukup' || low === 'c') return 'Cukup';
  if (low === 'kurang' || low === 'k') return 'Kurang';
  return '';
}

function normalizeKondisiRating(raw: unknown): KondisiBengkelRating | '' {
  const low = String(raw ?? '').trim().toLowerCase();
  if (!low) return '';
  if (low.includes('baik') || low.includes('sesuai') && !low.includes('tidak') || low.includes('layak')) {
    return 'Baik';
  }
  if (low.includes('cukup')) return 'Cukup';
  if (low.includes('kurang') || low.includes('tidak')) return 'Kurang';
  return '';
}

export function parseKompetensiList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x ?? '').trim()).filter(Boolean);
  }
  const s = String(raw ?? '').trim();
  if (!s) return [];
  if (s.startsWith('[')) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) {
        return parsed.map((x) => String(x ?? '').trim()).filter(Boolean);
      }
    } catch {
      // fall through
    }
  }
  return s
    .split(/\r?\n|\s*\|\|\s*/)
    .map((line) => line.replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean);
}

export function serializeKompetensiList(list: string[]): string {
  const cleaned = (Array.isArray(list) ? list : [])
    .map((x) => String(x ?? '').trim())
    .filter(Boolean);
  if (cleaned.length === 0) return '';
  return cleaned.map((item, idx) => `${idx + 1}. ${item}`).join('\n');
}

export function parseKondisiBengkel(raw: unknown): KondisiBengkelCheck {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    return {
      volumePekerjaan: normalizeKondisiRating(obj.volumePekerjaan ?? obj.volume),
      relevansiPekerjaan: normalizeKondisiRating(obj.relevansiPekerjaan ?? obj.relevansi),
      kenyamanan: normalizeKondisiRating(obj.kenyamanan),
      kelayakan: normalizeKondisiRating(obj.kelayakan),
    };
  }
  const s = String(raw ?? '').trim();
  if (!s) return { ...EMPTY_KONDISI_BENGKEL };
  if (s.startsWith('{')) {
    try {
      const parsed = JSON.parse(s);
      if (parsed && typeof parsed === 'object') {
        return parseKondisiBengkel(parsed);
      }
    } catch {
      // fall through
    }
  }
  const result: KondisiBengkelCheck = { ...EMPTY_KONDISI_BENGKEL };
  const tokens = s.split(/[|,;]+/);
  for (const tok of tokens) {
    const [kRaw, vRaw] = tok.split(':').map((x) => x.trim());
    if (!kRaw || !vRaw) continue;
    const k = kRaw.toLowerCase();
    const val = normalizeKondisiRating(vRaw);
    if (k.includes('volume')) result.volumePekerjaan = val;
    else if (k.includes('relevan')) result.relevansiPekerjaan = val;
    else if (k.includes('nyaman')) result.kenyamanan = val;
    else if (k.includes('layak')) result.kelayakan = val;
  }
  return result;
}

export function serializeKondisiBengkel(check?: Partial<KondisiBengkelCheck> | null): string {
  if (!check) return '';
  const parts: string[] = [];
  if (check.volumePekerjaan) parts.push(`Volume: ${check.volumePekerjaan}`);
  if (check.relevansiPekerjaan) parts.push(`Relevansi: ${check.relevansiPekerjaan}`);
  if (check.kenyamanan) parts.push(`Kenyamanan: ${check.kenyamanan}`);
  if (check.kelayakan) parts.push(`Kelayakan: ${check.kelayakan}`);
  return parts.join(' | ');
}

export function normalizeSignatureSvgPath(raw: unknown): {
  viewBox: string;
  pathD: string;
} | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (s.startsWith('svgpath:')) {
    const rest = s.slice('svgpath:'.length);
    const pipeIdx = rest.indexOf('|');
    if (pipeIdx > 0) {
      const dims = rest.slice(0, pipeIdx);
      const pathD = rest.slice(pipeIdx + 1).trim();
      const [w, h] = dims.split('x').map(Number);
      if (pathD && w > 0 && h > 0) {
        return { viewBox: `0 0 ${w} ${h}`, pathD };
      }
    }
  }
  const pathMatch = s.match(/d=["']([^"']+)["']/i);
  if (pathMatch && pathMatch[1]) {
    return { viewBox: '0 0 280 90', pathD: pathMatch[1] };
  }
  if (/^M[\d.\s,L]+$/i.test(s)) {
    return { viewBox: '0 0 280 90', pathD: s };
  }
  return null;
}

export function serializeFormat0701Tag(data: {
  bukuLaporan?: string;
  dp?: string;
  mt?: string;
  krt?: string;
  kompetensiList?: string[];
  kondisiBengkel?: Partial<KondisiBengkelCheck>;
}): string {
  const compact: Record<string, any> = {};
  if (data.bukuLaporan) compact.bl = data.bukuLaporan;
  if (data.dp) compact.dp = data.dp;
  if (data.mt) compact.mt = data.mt;
  if (data.krt) compact.krt = data.krt;
  const comp = (data.kompetensiList || []).map((x) => x.trim()).filter(Boolean);
  if (comp.length > 0) compact.kp = comp;
  if (data.kondisiBengkel && Object.values(data.kondisiBengkel).some(Boolean)) {
    compact.kb = data.kondisiBengkel;
  }
  if (Object.keys(compact).length === 0) return '';
  return `[F0701:${encodeURIComponent(JSON.stringify(compact))}]`;
}

export function parseFormat0701FromRow(row: Record<string, any>): ParsedFormat0701Data {
  let bukuLaporan = normalizeBukuLaporan(row.Buku_Laporan ?? row.bukuLaporan ?? row.buku_laporan);
  let aktivitasDp = normalizeAktivitasRating(row.Aktivitas_DP ?? row.aktivitasDp ?? row.aktivitas_dp);
  let aktivitasMt = normalizeAktivitasRating(row.Aktivitas_MT ?? row.aktivitasMt ?? row.aktivitas_mt);
  let aktivitasKrt = normalizeAktivitasRating(
    row.Aktivitas_KRT ?? row.aktivitasKrt ?? row.aktivitas_krt
  );
  let kompetensiList = parseKompetensiList(
    row.Kompetensi_Didapat ?? row.kompetensiDidapat ?? row.kompetensi_siswa
  );
  let kondisiBengkel = parseKondisiBengkel(
    row.Kondisi_Bengkel ?? row.kondisiBengkel ?? row.kondisi_bengkel
  );
  const ttdSiswa = String(row.TTD_Siswa ?? row.ttdSiswa ?? row.ttd_siswa ?? '').trim();

  const note = String(row.Catatan_Kunjungan ?? row.catatanKunjungan ?? '');
  const tagMatch = note.match(/\[F0701:([^\]]+)\]/i);
  if (tagMatch && tagMatch[1]) {
    try {
      const parsed = JSON.parse(decodeURIComponent(tagMatch[1]));
      if (!bukuLaporan && parsed.bl) bukuLaporan = normalizeBukuLaporan(parsed.bl);
      if (!aktivitasDp && parsed.dp) aktivitasDp = normalizeAktivitasRating(parsed.dp);
      if (!aktivitasMt && parsed.mt) aktivitasMt = normalizeAktivitasRating(parsed.mt);
      if (!aktivitasKrt && parsed.krt) aktivitasKrt = normalizeAktivitasRating(parsed.krt);
      if (kompetensiList.length === 0 && Array.isArray(parsed.kp)) {
        kompetensiList = parseKompetensiList(parsed.kp);
      }
      if (
        !kondisiBengkel.volumePekerjaan &&
        !kondisiBengkel.relevansiPekerjaan &&
        !kondisiBengkel.kenyamanan &&
        !kondisiBengkel.kelayakan &&
        parsed.kb
      ) {
        kondisiBengkel = parseKondisiBengkel(parsed.kb);
      }
    } catch {
      // ignore malformed tag
    }
  }

  return {
    bukuLaporan,
    aktivitasDp,
    aktivitasMt,
    aktivitasKrt,
    kompetensiList,
    kondisiBengkel,
    ttdSiswa,
  };
}

export function stripStructuredTagsFromNote(noteRaw: any): string {
  return String(noteRaw ?? '')
    .replace(/\[Absensi:[^\]]*\]/gi, '')
    .replace(/\[Nilai PKL:[^\]]*\]/gi, '')
    .replace(/\[Skor:[^\]]*\]/gi, '')
    .replace(/\[F0701:[^\]]*\]/gi, '')
    .trim();
}

export function parseGradesFromMonitoringRow(row: Record<string, any>): ParsedGradeSummary | null {
  const monitoringId = String(row.ID_Monitoring ?? row.idMonitoring ?? row.id ?? '').trim() || undefined;
  const k3lhCol = toSafeScore(row.Nilai_K3LH ?? row.nilaiK3lh ?? row.nilai_k3lh);
  const softCol = toSafeScore(
    row.Nilai_Softskills ?? row.Nilai_Softskill ?? row.nilaiSoftskills ?? row.nilaiSoftskill ?? row.nilai_softskills ?? row.nilai_softskill
  );
  const tekCol = toSafeScore(
    row.Nilai_Hardskills ??
      row.Nilai_Kompetensi_Teknis ??
      row.nilaiHardskills ??
      row.nilaiKompetensiTeknis ??
      row.nilai_hardskills ??
      row.nilai_kompetensi_teknis
  );
  const bisnisCol = toSafeScore(
    row.Nilai_Alur_Bisnis_Dunia_Kerja ??
      row.Nilai_Alur_Bisnis ??
      row.nilaiAlurBisnisDuniaKerja ??
      row.nilaiAlurBisnis ??
      row.nilai_alur_bisnis_dunia_kerja ??
      row.nilai_alur_bisnis
  );
  const avgCol = toSafeScore(
    row.Nilai_rata_rata ?? row.Nilai_Rata_Rata ?? row.nilaiRataRata ?? row.nilai_rata_rata
  );

  if (k3lhCol !== null && softCol !== null && tekCol !== null && bisnisCol !== null) {
    return {
      monitoringId,
      k3lh: k3lhCol,
      softskill: softCol,
      teknis: tekCol,
      alurBisnis: bisnisCol,
      rataRata: avgCol ?? calculateEqualWeightedAverage(k3lhCol, softCol, tekCol, bisnisCol),
      tahapDiinput: String(row.Tahap ?? row.tahap ?? ''),
      tanggal: normalizeToIsoDate(row.Tanggal_Kunjungan ?? row.tanggalKunjungan ?? '') || String(row.Tanggal_Kunjungan ?? row.tanggalKunjungan ?? ''),
    };
  }

  const note = String(row.Catatan_Kunjungan ?? row.catatanKunjungan ?? '');
  const newFmt = note.match(
    /\[Nilai PKL:\s*K3LH=([\d.]+),\s*Softskill=([\d.]+),\s*Teknis=([\d.]+),\s*AlurBisnis=([\d.]+)\s*\|\s*Rata-rata=([\d.]+)/i
  );
  if (newFmt) {
    return {
      monitoringId,
      k3lh: Number(newFmt[1]),
      softskill: Number(newFmt[2]),
      teknis: Number(newFmt[3]),
      alurBisnis: Number(newFmt[4]),
      rataRata: Number(newFmt[5]),
      tahapDiinput: String(row.Tahap ?? row.tahap ?? ''),
      tanggal: normalizeToIsoDate(row.Tanggal_Kunjungan ?? row.tanggalKunjungan ?? '') || String(row.Tanggal_Kunjungan ?? row.tanggalKunjungan ?? ''),
    };
  }

  const legacyFmt = note.match(/\[Skor:[^\]]*\|\s*Akhir=([\d.]+)/i);
  if (legacyFmt) {
    return {
      monitoringId,
      k3lh: null,
      softskill: null,
      teknis: null,
      alurBisnis: null,
      rataRata: Number(legacyFmt[1]),
      tahapDiinput: String(row.Tahap ?? row.tahap ?? ''),
      tanggal: normalizeToIsoDate(row.Tanggal_Kunjungan ?? row.tanggalKunjungan ?? '') || String(row.Tanggal_Kunjungan ?? row.tanggalKunjungan ?? ''),
    };
  }

  const collectedFlag = String(row.Nilai_DUDI_Terkumpul ?? row.nilaiDudiTerkumpul ?? '')
    .trim()
    .toLowerCase();
  if ((collectedFlag === 'ya' || collectedFlag === 'true') && avgCol && avgCol > 0) {
    return {
      monitoringId,
      k3lh: k3lhCol,
      softskill: softCol,
      teknis: tekCol,
      alurBisnis: bisnisCol,
      rataRata: avgCol,
      tahapDiinput: String(row.Tahap ?? row.tahap ?? ''),
      tanggal: normalizeToIsoDate(row.Tanggal_Kunjungan ?? row.tanggalKunjungan ?? '') || String(row.Tanggal_Kunjungan ?? row.tanggalKunjungan ?? ''),
    };
  }

  return null;
}

export interface MonitoringLookupIndex {
  monitoringByNisDigits: Map<string, any[]>;
  monitoringByNisRaw: Map<string, any[]>;
  monitoringByPlacement: Map<string, any[]>;
  groupMonitoringRows: any[];
  nilaiByNisDigits: Map<string, any[]>;
  nilaiByNisRaw: Map<string, any[]>;
  nilaiByPlacement: Map<string, any[]>;
  allNilaiRows: any[];
}

function pushMapArray(map: Map<string, any[]>, key: string, item: any): void {
  if (!key) return;
  const arr = map.get(key);
  if (arr) arr.push(item);
  else map.set(key, [item]);
}

export function buildMonitoringLookupIndex(
  monitoringRows: any[],
  nilaiRows: any[]
): MonitoringLookupIndex {
  const monitoringByNisDigits = new Map<string, any[]>();
  const monitoringByNisRaw = new Map<string, any[]>();
  const monitoringByPlacement = new Map<string, any[]>();
  const groupMonitoringRows: any[] = [];

  for (const row of Array.isArray(monitoringRows) ? monitoringRows : []) {
    const rowNisRaw = String(row.NIS ?? row.nis ?? '').trim();
    const rowNisDigits = stripNisSymbols(rowNisRaw);
    const rowPlt = String(row.ID_Penempatan ?? row.idPenempatan ?? '').trim();
    const rowDaftar = String(row.Daftar_Siswa ?? row.daftarSiswa ?? '').trim();

    if (rowNisDigits) pushMapArray(monitoringByNisDigits, rowNisDigits, row);
    if (rowNisRaw && rowNisRaw !== '-') pushMapArray(monitoringByNisRaw, rowNisRaw, row);
    if (rowPlt) pushMapArray(monitoringByPlacement, rowPlt, row);
    if (rowDaftar && (!rowNisDigits || rowNisRaw === '-')) {
      groupMonitoringRows.push(row);
    }
  }

  const nilaiByNisDigits = new Map<string, any[]>();
  const nilaiByNisRaw = new Map<string, any[]>();
  const nilaiByPlacement = new Map<string, any[]>();
  const allNilaiRows = Array.isArray(nilaiRows) ? nilaiRows : [];

  for (const n of allNilaiRows) {
    const rowNisRaw = String(n.NIS ?? n.nis ?? '').trim();
    const rowNisDigits = stripNisSymbols(rowNisRaw);
    const rowPlt = String(n.ID_Penempatan ?? n.idPenempatan ?? '').trim();
    if (rowNisDigits) pushMapArray(nilaiByNisDigits, rowNisDigits, n);
    if (rowNisRaw && rowNisRaw !== '-') pushMapArray(nilaiByNisRaw, rowNisRaw, n);
    if (rowPlt) pushMapArray(nilaiByPlacement, rowPlt, n);
  }

  return {
    monitoringByNisDigits,
    monitoringByNisRaw,
    monitoringByPlacement,
    groupMonitoringRows,
    nilaiByNisDigits,
    nilaiByNisRaw,
    nilaiByPlacement,
    allNilaiRows,
  };
}

export function buildStudentMonitoringSummary(
  student: { nis?: string; nama?: string; idPenempatan?: string; dudi_name?: string },
  monitoringRows: any[],
  nilaiRows: any[],
  lookupIndex?: MonitoringLookupIndex
): StudentMonitoringSummary {
  const norm = (v: any) => String(v ?? '').trim().toLowerCase();
  const targetNisRaw = String(student.nis || '').trim();
  const targetNisDigits = stripNisSymbols(targetNisRaw);
  const targetPlt = String(student.idPenempatan || '').trim();
  const targetNama = norm(student.nama);
  const targetDudi = norm(student.dudi_name);

  let matchedMonitoring: any[];
  if (lookupIndex) {
    const seen = new Set<any>();
    const addCandidate = (rows?: any[]) => {
      if (!rows) return;
      for (const r of rows) seen.add(r);
    };
    if (targetNisDigits) addCandidate(lookupIndex.monitoringByNisDigits.get(targetNisDigits));
    if (targetNisRaw && targetNisRaw !== '-') addCandidate(lookupIndex.monitoringByNisRaw.get(targetNisRaw));
    if (targetPlt) addCandidate(lookupIndex.monitoringByPlacement.get(targetPlt));
    for (const row of lookupIndex.groupMonitoringRows) {
      if (seen.has(row)) continue;
      const rowDaftar = norm(row.Daftar_Siswa ?? row.daftarSiswa ?? '');
      const rowDaftarDigits = stripNisSymbols(rowDaftar);
      const rowNamaSiswa = norm(row.Nama_Siswa ?? row.namaSiswa ?? '');
      const rowDudi = norm(row.DUDI_Tujuan ?? row.dudiTujuan ?? '');
      if (
        (targetNisDigits && rowDaftarDigits.includes(targetNisDigits)) ||
        (targetNisRaw && targetNisRaw !== '-' && rowDaftar.includes(targetNisRaw.toLowerCase())) ||
        (targetNama &&
          (rowNamaSiswa === targetNama || rowDaftar.includes(targetNama)) &&
          (!targetDudi || !rowDudi || rowDudi === targetDudi || rowDudi.includes(targetDudi)))
      ) {
        seen.add(row);
      }
    }
    matchedMonitoring = Array.from(seen);
  } else {
    matchedMonitoring = (Array.isArray(monitoringRows) ? monitoringRows : []).filter((row) => {
      const rowNisRaw = String(row.NIS ?? row.nis ?? '').trim();
      const rowNisDigits = stripNisSymbols(rowNisRaw);
      const rowPlt = String(row.ID_Penempatan ?? row.idPenempatan ?? '').trim();
      const rowDaftar = norm(row.Daftar_Siswa ?? row.daftarSiswa ?? '');
      const rowDaftarDigits = stripNisSymbols(rowDaftar);
      const rowNamaSiswa = norm(row.Nama_Siswa ?? row.namaSiswa ?? '');
      const rowDudi = norm(row.DUDI_Tujuan ?? row.dudiTujuan ?? '');

      if (targetNisDigits && rowNisDigits === targetNisDigits) return true;
      if (targetNisRaw && targetNisRaw !== '-' && rowNisRaw === targetNisRaw) return true;
      if (targetPlt && rowPlt && rowPlt === targetPlt) return true;
      if (targetNisDigits && rowDaftarDigits.includes(targetNisDigits)) return true;
      if (targetNisRaw && targetNisRaw !== '-' && rowDaftar.includes(targetNisRaw.toLowerCase())) return true;
      if (
        targetNama &&
        (rowNamaSiswa === targetNama || rowDaftar.includes(targetNama)) &&
        (!targetDudi || !rowDudi || rowDudi === targetDudi || rowDudi.includes(targetDudi))
      ) {
        return true;
      }
      return false;
    });
  }

  const stageLogs: Record<number, StageLogEntry> = {};
  const completedSet = new Set<number>();
  let submittedGradeSummary: ParsedGradeSummary | null = null;

  for (const row of matchedMonitoring) {
    const stageNum = extractStageNumber(row.Tahap ?? row.tahap);
    const status = String(row.Status_Tahap ?? row.statusTahap ?? 'Terlaksana').trim();
    const monitoringId = String(row.ID_Monitoring ?? row.idMonitoring ?? row.id ?? '').trim() || undefined;
    const isCompleted =
      stageNum >= 1 &&
      stageNum <= 8 &&
      !status.toLowerCase().includes('belum');

    if (isCompleted) {
      completedSet.add(stageNum);
    }

    if (stageNum >= 1 && stageNum <= 8) {
      const att = parseAttendanceFromRow(row);
      const f0701 = parseFormat0701FromRow(row);
      stageLogs[stageNum] = {
        monitoringId,
        stageNum,
        tahap: String(row.Tahap ?? row.tahap ?? getStageValueByNumber(stageNum)),
        sakit: att.sakit,
        izin: att.izin,
        alpha: att.alpha,
        bukuLaporan: f0701.bukuLaporan,
        aktivitasDp: f0701.aktivitasDp,
        aktivitasMt: f0701.aktivitasMt,
        aktivitasKrt: f0701.aktivitasKrt,
        kompetensiList: f0701.kompetensiList,
        kondisiBengkel: f0701.kondisiBengkel,
        ttdSiswa: f0701.ttdSiswa,
        catatan: stripStructuredTagsFromNote(row.Catatan_Kunjungan ?? row.catatanKunjungan ?? ''),
        tanggal: normalizeToIsoDate(row.Tanggal_Kunjungan ?? row.tanggalKunjungan ?? '') || String(row.Tanggal_Kunjungan ?? row.tanggalKunjungan ?? ''),
        status,
      };
    }

    const parsedGrade = parseGradesFromMonitoringRow(row);
    if (parsedGrade && parsedGrade.rataRata > 0) {
      submittedGradeSummary = parsedGrade;
    }
  }

  // Fallback or enrich with Nilai_Dan_Sertifikat sheet
  const nilaiCandidates: any[] = lookupIndex
    ? (() => {
        const set = new Set<any>();
        if (targetNisDigits) lookupIndex.nilaiByNisDigits.get(targetNisDigits)?.forEach((x) => set.add(x));
        if (targetNisRaw && targetNisRaw !== '-') lookupIndex.nilaiByNisRaw.get(targetNisRaw)?.forEach((x) => set.add(x));
        if (targetPlt) lookupIndex.nilaiByPlacement.get(targetPlt)?.forEach((x) => set.add(x));
        if (set.size > 0) return Array.from(set);
        return lookupIndex.allNilaiRows;
      })()
    : Array.isArray(nilaiRows)
    ? nilaiRows
    : [];

  if (nilaiCandidates.length > 0) {
    const matchedNilai = nilaiCandidates.find((n) => {
      const rowNisRaw = String(n.NIS ?? n.nis ?? '').trim();
      const rowNisDigits = stripNisSymbols(rowNisRaw);
      const rowPlt = String(n.ID_Penempatan ?? n.idPenempatan ?? '').trim();
      const rowNama = norm(n.Nama_Siswa ?? n.namaSiswa ?? '');
      const k3 = Number(n.Nilai_K3LH ?? n.nilaiK3lh ?? 0) || 0;
      const ss = Number(n.Nilai_Softskills ?? n.Nilai_Softskill ?? n.nilaiSoftskills ?? n.nilaiSoftskill ?? 0) || 0;
      const tk = Number(n.Nilai_Hardskills ?? n.Nilai_Kompetensi_Teknis ?? n.nilaiHardskills ?? n.nilaiKompetensiTeknis ?? 0) || 0;
      const ab = Number(n.Nilai_Alur_Bisnis_Dunia_Kerja ?? n.Nilai_Alur_Bisnis ?? n.nilaiAlurBisnisDuniaKerja ?? n.nilaiAlurBisnis ?? 0) || 0;
      const rawAvg = Number(
        n.Nilai_rata_rata ??
          n.Nilai_Rata_Rata ??
          n.nilaiRataRata ??
          n.Nilai_DUDI ??
          n.nilaiDudi ??
          n.Nilai_Akhir ??
          n.nilaiAkhir ??
          0
      );
      if (rawAvg <= 0 && (k3 <= 0 || ss <= 0 || tk <= 0 || ab <= 0)) return false;
      if (targetNisDigits && rowNisDigits === targetNisDigits) return true;
      if (targetNisRaw && targetNisRaw !== '-' && rowNisRaw === targetNisRaw) return true;
      if (targetPlt && rowPlt === targetPlt) return true;
      return Boolean(targetNama && rowNama === targetNama);
    });

    if (matchedNilai) {
      const k3lh = toSafeScore(matchedNilai.Nilai_K3LH ?? matchedNilai.nilaiK3lh);
      const softskill = toSafeScore(
        matchedNilai.Nilai_Softskills ?? matchedNilai.Nilai_Softskill ?? matchedNilai.nilaiSoftskills ?? matchedNilai.nilaiSoftskill
      );
      const teknis = toSafeScore(
        matchedNilai.Nilai_Hardskills ?? matchedNilai.Nilai_Kompetensi_Teknis ?? matchedNilai.nilaiHardskills ?? matchedNilai.nilaiKompetensiTeknis
      );
      const alurBisnis = toSafeScore(
        matchedNilai.Nilai_Alur_Bisnis_Dunia_Kerja ?? matchedNilai.Nilai_Alur_Bisnis ?? matchedNilai.nilaiAlurBisnisDuniaKerja ?? matchedNilai.nilaiAlurBisnis
      );
      const avgRaw = toSafeScore(
        matchedNilai.Nilai_rata_rata ??
          matchedNilai.Nilai_Rata_Rata ??
          matchedNilai.nilaiRataRata ??
          matchedNilai.Nilai_DUDI ??
          matchedNilai.nilaiDudi ??
          matchedNilai.Nilai_Akhir ??
          matchedNilai.nilaiAkhir
      );
      const computedAvg =
        k3lh !== null && softskill !== null && teknis !== null && alurBisnis !== null
          ? calculateEqualWeightedAverage(k3lh, softskill, teknis, alurBisnis)
          : 0;
      const finalAvg = avgRaw ?? computedAvg;

      if (!submittedGradeSummary && finalAvg > 0) {
        submittedGradeSummary = {
          k3lh,
          softskill,
          teknis,
          alurBisnis,
          rataRata: finalAvg,
          tahapDiinput: 'Nilai_Dan_Sertifikat',
          tanggal: normalizeToIsoDate(matchedNilai.Tgl_Terbit ?? matchedNilai.tanggalTerbit ?? '') || String(matchedNilai.Tgl_Terbit ?? matchedNilai.tanggalTerbit ?? ''),
        };
      }
    }
  }

  const completedStages = Array.from(completedSet).sort((a, b) => a - b);
  const pendingVerificationStages = completedStages.filter(
    (st) => !isStageFullyVerified(stageLogs[st]?.status)
  );
  const maxCompleted = completedStages.length > 0 ? completedStages[completedStages.length - 1] : 0;
  const recommendedStage =
    pendingVerificationStages.length > 0
      ? pendingVerificationStages[pendingVerificationStages.length - 1]
      : Math.min(maxCompleted + 1, 8);

  return {
    completedStages,
    recommendedStage,
    hasSubmittedGrades: Boolean(submittedGradeSummary && submittedGradeSummary.rataRata > 0),
    submittedGradeSummary,
    stageLogs,
  };
}

export function extractIssuedStageNumber(raw: any): number {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= 8) return raw;
  const str = String(raw ?? '').trim();
  if (!str) return 0;
  const directNum = Number(str);
  if (Number.isInteger(directNum) && directNum >= 1 && directNum <= 8) return directNum;
  return extractStageNumber(str);
}

export function isIssuedLetterStatusActive(statusVal: unknown): boolean {
  const s = String(statusVal ?? '').trim().toLowerCase();
  if (!s) return true;
  if (s.includes('batal') || s.includes('cabut') || s === 'nonaktif' || s === 'false') {
    return false;
  }
  return s === 'sudah terbit' || s === 'terbit' || s === 'active' || s === 'ya' || s === 'true';
}

export function resolveIssuedStagesForDudi(
  logRows: any[],
  dudiId?: string,
  namaDudi?: string
): {
  issuedStages: number[];
  issuedStageDetails: Record<number, IssuedStageDetail>;
} {
  const norm = (val: unknown) =>
    String(val ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  const targetId = norm(dudiId);
  const targetName = norm(namaDudi);

  if (!Array.isArray(logRows) || logRows.length === 0 || (!targetId && !targetName)) {
    return { issuedStages: [], issuedStageDetails: {} };
  }

  const latestByStage: Record<number, IssuedStageDetail & { _rowOrder: number }> = {};

  logRows.forEach((row, idx) => {
    if (!row || typeof row !== 'object') return;
    const rowDudiId = norm(row.ID_DUDI ?? row.idDudi);
    const rowDudiName = norm(row.Nama_DUDI ?? row.namaDudi);
    const matchesId = Boolean(targetId && rowDudiId && rowDudiId === targetId);
    const matchesName = Boolean(targetName && rowDudiName && rowDudiName === targetName);
    if (!matchesId && !matchesName) return;

    const stageNum =
      extractIssuedStageNumber(row.Tahap ?? row.tahap) ||
      extractIssuedStageNumber(row.Nama_Tahap ?? row.namaTahap);
    if (stageNum < 1 || stageNum > 8) return;

    const statusTerbit = String(row.Status_Terbit ?? row.statusTerbit ?? 'Sudah Terbit').trim() || 'Sudah Terbit';
    latestByStage[stageNum] = {
      tahap: stageNum,
      statusTerbit,
      jenisDokumen: String(row.Jenis_Dokumen ?? row.jenisDokumen ?? '').trim(),
      nomorSurat: String(row.Nomor_Surat ?? row.nomorSurat ?? '').trim(),
      tanggalTerbit:
        normalizeToIsoDate(row.Tanggal_Terbit ?? row.tanggalTerbit ?? '') ||
        String(row.Tanggal_Terbit ?? row.tanggalTerbit ?? '').trim(),
      diterbitkanOleh: String(row.Diterbitkan_Oleh ?? row.diterbitkanOleh ?? '').trim(),
      linkPdf: String(row.Link_PDF ?? row.linkPdf ?? '').trim(),
      _rowOrder: Number(row._sheetRowNumber || idx + 2),
    };
  });

  const issuedStages: number[] = [];
  const issuedStageDetails: Record<number, IssuedStageDetail> = {};

  for (let st = 1; st <= 8; st += 1) {
    const entry = latestByStage[st];
    if (!entry) continue;
    if (!isIssuedLetterStatusActive(entry.statusTerbit)) continue;
    issuedStages.push(st);
    const { _rowOrder, ...cleanDetail } = entry;
    void _rowOrder;
    issuedStageDetails[st] = cleanDetail;
  }

  return { issuedStages, issuedStageDetails };
}

export interface ResolvedMonitoringStagePolicy {
  jurusanCode: string;
  isCustomJurusanPolicy: boolean;
  enabledStages: number[];
  unlockedStages: number[];
  gradeStage: number;
  totalStages: number;
  requireSequential: boolean;
  requireIssuedLetter: boolean;
  requireStudentSignature: boolean;
  lockedReason: string;
}

function sanitizeStageList(raw: unknown, fallback: number[]): number[] {
  if (!Array.isArray(raw)) return [...fallback];
  return Array.from(
    new Set(
      raw
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 8)
    )
  ).sort((a, b) => a - b);
}

function deriveAcronymCode(rawName: string): string {
  const words = rawName
    .trim()
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !/^(dan|atau|di|ke|xi|xii|x)$/i.test(w));
  if (words.length < 2) return '';
  return words.map((w) => w[0].toUpperCase()).join('');
}

export function getPreviousEnabledStage(enabledStages: number[], stageNum: number): number | null {
  const idx = enabledStages.indexOf(stageNum);
  if (idx <= 0) return null;
  return enabledStages[idx - 1];
}

export function resolveMonitoringStagePolicy(
  control?: MonitoringStageControl | null,
  jurusanRaw?: string | null,
  jurusanCatalog?: Jurusan[]
): ResolvedMonitoringStagePolicy {
  const allDefault = [1, 2, 3, 4, 5, 6, 7, 8];
  const globalUnlocked = sanitizeStageList(
    control?.unlockedStages,
    DEFAULT_MONITORING_STAGE_CONTROL.unlockedStages
  );
  const requireSequential =
    typeof control?.requireSequential === 'boolean'
      ? control.requireSequential
      : DEFAULT_MONITORING_STAGE_CONTROL.requireSequential;
  const requireIssuedLetter =
    typeof control?.requireIssuedLetter === 'boolean'
      ? control.requireIssuedLetter
      : DEFAULT_MONITORING_STAGE_CONTROL.requireIssuedLetter ?? true;
  const requireStudentSignature =
    typeof control?.requireStudentSignature === 'boolean'
      ? control.requireStudentSignature
      : DEFAULT_MONITORING_STAGE_CONTROL.requireStudentSignature ?? false;
  const lockedReason = String(control?.lockedReason ?? '').trim();
  const rawGlobalGrade = Number(control?.gradeStage);
  const globalGradeStage =
    Number.isInteger(rawGlobalGrade) && rawGlobalGrade >= 2 && rawGlobalGrade <= 8
      ? rawGlobalGrade
      : 5;

  const perJurusanMap =
    control?.perJurusan && typeof control.perJurusan === 'object' ? control.perJurusan : {};

  let matchedKey = '';
  const cleanJurRaw = String(jurusanRaw || '').trim();

  if (cleanJurRaw && cleanJurRaw !== '-' && Object.keys(perJurusanMap).length > 0) {
    const upperRaw = cleanJurRaw.toUpperCase();
    // 1. Exact key match (e.g. "RPL")
    if (perJurusanMap[upperRaw]) {
      matchedKey = upperRaw;
    }

    // 2. Catalog lookup via Master_Jurusan (matches full name, code, or ID)
    if (!matchedKey && Array.isArray(jurusanCatalog) && jurusanCatalog.length > 0) {
      const catItem = jurusanCatalog.find((j) => matchJurusanItem(cleanJurRaw, j));
      if (catItem) {
        const catKode = String(catItem.kode || '').trim().toUpperCase();
        if (catKode && perJurusanMap[catKode]) {
          matchedKey = catKode;
        }
      }
    }

    // 3. Word-boundary token match inside kelas/jurusan string (e.g. "XI RPL 1", "jur_rpl")
    if (!matchedKey) {
      for (const candidateKey of Object.keys(perJurusanMap)) {
        const escaped = candidateKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (
          new RegExp(`(?:^|[^A-Z0-9])${escaped}(?:$|[^A-Z0-9])`, 'i').test(upperRaw)
        ) {
          matchedKey = candidateKey;
          break;
        }
      }
    }

    // 4. Acronym match (e.g. "Rekayasa Perangkat Lunak" -> "RPL")
    if (!matchedKey) {
      const acronym = deriveAcronymCode(cleanJurRaw);
      if (acronym && perJurusanMap[acronym]) {
        matchedKey = acronym;
      }
    }
  }

  const override = matchedKey ? perJurusanMap[matchedKey] : undefined;
  const enabledStages = override
    ? sanitizeStageList(override.enabledStages, allDefault)
    : [...allDefault];
  const unlockedStages = enabledStages.filter((num) => globalUnlocked.includes(num));

  let gradeStage = globalGradeStage;
  const rawJurGrade = Number(override?.gradeStage);
  if (Number.isInteger(rawJurGrade) && rawJurGrade >= 2 && rawJurGrade <= 8) {
    gradeStage = rawJurGrade;
  } else if (!enabledStages.includes(gradeStage)) {
    const monitoringStagesOnly = enabledStages.filter((n) => n >= 2 && n < 8);
    if (monitoringStagesOnly.length > 0) {
      gradeStage = monitoringStagesOnly[monitoringStagesOnly.length - 1];
    } else {
      const ge2 = enabledStages.filter((n) => n >= 2);
      if (ge2.length > 0) gradeStage = ge2[ge2.length - 1];
    }
  }

  return {
    jurusanCode: matchedKey || cleanJurRaw.toUpperCase(),
    isCustomJurusanPolicy: Boolean(override),
    enabledStages,
    unlockedStages,
    gradeStage,
    totalStages: enabledStages.length,
    requireSequential,
    requireIssuedLetter,
    requireStudentSignature,
    lockedReason,
  };
}

export function pickRecommendedStageForControl(
  completedStages: number[],
  control?: MonitoringStageControl | null,
  issuedStages?: number[],
  stageLogs?: Record<number, Pick<StageLogEntry, 'status'> | { status?: string }> | null,
  studentJurusan?: string,
  jurusanCatalog?: Jurusan[]
): number {
  const policy = resolveMonitoringStagePolicy(control, studentJurusan, jurusanCatalog);
  const { enabledStages, unlockedStages: unlocked, requireSequential, requireIssuedLetter } = policy;
  const completed = sanitizeStageList(completedStages, []);

  // 1. Prioritize the latest filled stage still waiting for full verification (Kakomli AND Hubin)
  if (stageLogs && typeof stageLogs === 'object' && completed.length > 0) {
    const pendingVerificationStages = completed.filter(
      (num) => enabledStages.includes(num) && !isStageFullyVerified(stageLogs[num]?.status)
    );
    if (pendingVerificationStages.length > 0) {
      return pendingVerificationStages[pendingVerificationStages.length - 1];
    }
  }

  // 2. All filled stages are fully verified (or no stages filled yet): pick next stage to be taken
  const uncompleted = enabledStages.filter((num) => !completed.includes(num));
  if (uncompleted.length === 0) {
    return enabledStages[enabledStages.length - 1] ?? 8;
  }

  const issuedSet = Array.isArray(issuedStages) ? new Set(issuedStages) : null;
  const isEligibleOpenStage = (num: number) =>
    unlocked.includes(num) && (!requireIssuedLetter || !issuedSet || issuedSet.has(num));
  const eligibleOpenStages = unlocked.filter((num) => isEligibleOpenStage(num));

  if (requireSequential) {
    const nextEligibleSequential = eligibleOpenStages.find((num) => {
      if (completed.includes(num)) return false;
      const prevStage = getPreviousEnabledStage(enabledStages, num);
      return prevStage === null || completed.includes(prevStage);
    });
    if (nextEligibleSequential !== undefined) return nextEligibleSequential;

    const nextLogicalSequential = uncompleted.find((num) => {
      const prevStage = getPreviousEnabledStage(enabledStages, num);
      return prevStage === null || completed.includes(prevStage);
    });
    if (nextLogicalSequential !== undefined) return nextLogicalSequential;

    return uncompleted[0];
  }

  const firstEligiblePending = eligibleOpenStages.find((num) => !completed.includes(num));
  if (firstEligiblePending !== undefined) return firstEligiblePending;

  const maxCompleted = completed.length > 0 ? completed[completed.length - 1] : 0;
  const nextAfterMax = uncompleted.find((num) => num > maxCompleted);
  return nextAfterMax ?? uncompleted[0];
}

export interface PerizinanAttendanceSummary {
  sakitDays: number;
  izinDays: number;
  dispensasiDays: number;
  recordCount: number;
}

const EMPTY_PERIZINAN_SUMMARY: PerizinanAttendanceSummary = {
  sakitDays: 0,
  izinDays: 0,
  dispensasiDays: 0,
  recordCount: 0,
};

export function computePerizinanDays(
  row: Partial<
    Pick<PerizinanPKL, 'tanggalMulaiIzin' | 'tanggalSelesaiIzin' | 'rentangTanggal'>
  >
): number {
  const startIso = normalizeToIsoDate(row.tanggalMulaiIzin);
  const endIso = normalizeToIsoDate(row.tanggalSelesaiIzin);

  if (startIso && endIso) {
    const [sy, sm, sd] = startIso.split('-').map(Number);
    const [ey, em, ed] = endIso.split('-').map(Number);
    const diffDays = Math.round(
      (Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86400000
    );
    return diffDays > 0 ? diffDays + 1 : 1;
  }

  if (startIso || endIso) {
    return 1;
  }

  const rangeText = String(row.rentangTanggal || '');
  const daysMatch = rangeText.match(/\((\d+)\s*hari\)/i);
  if (daysMatch) {
    const parsed = Number(daysMatch[1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  return 1;
}

/**
 * Aggregates Data_Perizinan_PKL per student NIS without modifying any Google Sheet structure.
 * Mapping policy:
 * - SO (Sakit Ortu) & SD (Surat Dokter) -> sakitDays
 * - I (Izin) -> izinDays
 * - ID (Izin Dispensasi) -> dispensasiDays (NOT added to izinDays)
 */
export function buildPerizinanAttendanceIndex(
  perizinanList: PerizinanPKL[]
): Map<string, PerizinanAttendanceSummary> {
  const index = new Map<string, PerizinanAttendanceSummary>();
  if (!Array.isArray(perizinanList) || perizinanList.length === 0) return index;

  for (const row of perizinanList) {
    if (!row) continue;
    const rawNis = String(row.nis || '').trim();
    const cleanNis = stripNisSymbols(rawNis);
    if (!cleanNis && !rawNis) continue;

    const statusLower = String(row.statusIzinOrtu || '').trim().toLowerCase();
    const days = computePerizinanDays(row);

    const isDispensasi =
      statusLower.includes('dispensasi') || statusLower.includes('(id)') || statusLower === 'id';
    const isSakit =
      !isDispensasi &&
      (statusLower.includes('sakit') ||
        statusLower.includes('dokter') ||
        statusLower.includes('(so)') ||
        statusLower.includes('(sd)') ||
        statusLower === 'so' ||
        statusLower === 'sd');
    const isIzin =
      !isDispensasi &&
      !isSakit &&
      (statusLower.includes('izin') || statusLower.includes('(i)') || statusLower === 'i');

    const keys = Array.from(new Set([cleanNis, rawNis].filter(Boolean)));
    const primaryKey = cleanNis || rawNis;

    const target = index.get(primaryKey) || { ...EMPTY_PERIZINAN_SUMMARY };
    target.recordCount += 1;
    if (isDispensasi) {
      target.dispensasiDays += days;
    } else if (isSakit) {
      target.sakitDays += days;
    } else if (isIzin) {
      target.izinDays += days;
    }

    for (const k of keys) {
      index.set(k, target);
    }
  }

  return index;
}

export function getPerizinanAttendanceForStudent(
  index: Map<string, PerizinanAttendanceSummary>,
  nis: string
): PerizinanAttendanceSummary {
  const rawNis = String(nis || '').trim();
  const cleanNis = stripNisSymbols(rawNis);
  return (
    (cleanNis ? index.get(cleanNis) : undefined) ||
    (rawNis ? index.get(rawNis) : undefined) ||
    EMPTY_PERIZINAN_SUMMARY
  );
}

