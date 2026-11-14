import { MONITORING_STAGES } from '../types/schema';

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

export interface StageLogEntry {
  monitoringId?: string;
  stageNum: number;
  tahap: string;
  sakit: number;
  izin: number;
  alpha: number;
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

export function stripStructuredTagsFromNote(noteRaw: any): string {
  return String(noteRaw ?? '')
    .replace(/\[Absensi:[^\]]*\]/gi, '')
    .replace(/\[Nilai PKL:[^\]]*\]/gi, '')
    .replace(/\[Skor:[^\]]*\]/gi, '')
    .trim();
}

export function parseGradesFromMonitoringRow(row: Record<string, any>): ParsedGradeSummary | null {
  const monitoringId = String(row.ID_Monitoring ?? row.idMonitoring ?? row.id ?? '').trim() || undefined;
  const k3lhCol = toSafeScore(row.Nilai_K3LH ?? row.nilaiK3lh ?? row.nilai_k3lh);
  const softCol = toSafeScore(row.Nilai_Softskill ?? row.nilaiSoftskill ?? row.nilai_softskill);
  const tekCol = toSafeScore(
    row.Nilai_Kompetensi_Teknis ?? row.nilaiKompetensiTeknis ?? row.nilai_kompetensi_teknis
  );
  const bisnisCol = toSafeScore(row.Nilai_Alur_Bisnis ?? row.nilaiAlurBisnis ?? row.nilai_alur_bisnis);
  const avgCol = toSafeScore(row.Nilai_Rata_Rata ?? row.nilaiRataRata ?? row.nilai_rata_rata);

  if (k3lhCol !== null && softCol !== null && tekCol !== null && bisnisCol !== null) {
    return {
      monitoringId,
      k3lh: k3lhCol,
      softskill: softCol,
      teknis: tekCol,
      alurBisnis: bisnisCol,
      rataRata: avgCol ?? calculateEqualWeightedAverage(k3lhCol, softCol, tekCol, bisnisCol),
      tahapDiinput: String(row.Tahap ?? row.tahap ?? ''),
      tanggal: String(row.Tanggal_Kunjungan ?? row.tanggalKunjungan ?? ''),
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
      tanggal: String(row.Tanggal_Kunjungan ?? row.tanggalKunjungan ?? ''),
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
      tanggal: String(row.Tanggal_Kunjungan ?? row.tanggalKunjungan ?? ''),
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
      tanggal: String(row.Tanggal_Kunjungan ?? row.tanggalKunjungan ?? ''),
    };
  }

  return null;
}

export function buildStudentMonitoringSummary(
  student: { nis?: string; nama?: string; idPenempatan?: string; dudi_name?: string },
  monitoringRows: any[],
  nilaiRows: any[]
): StudentMonitoringSummary {
  const norm = (v: any) => String(v ?? '').trim().toLowerCase();
  const targetNis = String(student.nis || '').trim();
  const targetPlt = String(student.idPenempatan || '').trim();
  const targetNama = norm(student.nama);
  const targetDudi = norm(student.dudi_name);

  const matchedMonitoring = (Array.isArray(monitoringRows) ? monitoringRows : []).filter((row) => {
    const rowNis = String(row.NIS ?? row.nis ?? '').trim();
    const rowPlt = String(row.ID_Penempatan ?? row.idPenempatan ?? '').trim();
    const rowDaftar = norm(row.Daftar_Siswa ?? row.daftarSiswa ?? '');
    const rowNamaSiswa = norm(row.Nama_Siswa ?? row.namaSiswa ?? '');
    const rowDudi = norm(row.DUDI_Tujuan ?? row.dudiTujuan ?? '');

    if (targetNis && targetNis !== '-' && rowNis === targetNis) return true;
    if (targetPlt && rowPlt && rowPlt === targetPlt) return true;
    if (targetNis && targetNis !== '-' && rowDaftar.includes(targetNis.toLowerCase())) return true;
    if (
      targetNama &&
      (rowNamaSiswa === targetNama || rowDaftar.includes(targetNama)) &&
      (!targetDudi || !rowDudi || rowDudi === targetDudi || rowDudi.includes(targetDudi))
    ) {
      return true;
    }
    return false;
  });

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
      stageLogs[stageNum] = {
        monitoringId,
        stageNum,
        tahap: String(row.Tahap ?? row.tahap ?? getStageValueByNumber(stageNum)),
        sakit: att.sakit,
        izin: att.izin,
        alpha: att.alpha,
        catatan: stripStructuredTagsFromNote(row.Catatan_Kunjungan ?? row.catatanKunjungan ?? ''),
        tanggal: String(row.Tanggal_Kunjungan ?? row.tanggalKunjungan ?? ''),
        status,
      };
    }

    const parsedGrade = parseGradesFromMonitoringRow(row);
    if (parsedGrade && parsedGrade.rataRata > 0) {
      submittedGradeSummary = parsedGrade;
    }
  }

  // Fallback or enrich with Nilai_Dan_Sertifikat sheet
  if (Array.isArray(nilaiRows)) {
    const matchedNilai = nilaiRows.find((n) => {
      const rowNis = String(n.NIS ?? n.nis ?? '').trim();
      const rowPlt = String(n.ID_Penempatan ?? n.idPenempatan ?? '').trim();
      const rowNama = norm(n.Nama_Siswa ?? n.namaSiswa ?? '');
      const k3 = Number(n.Nilai_K3LH ?? n.nilaiK3lh ?? 0) || 0;
      const ss = Number(n.Nilai_Softskill ?? n.nilaiSoftskill ?? 0) || 0;
      const tk = Number(n.Nilai_Kompetensi_Teknis ?? n.nilaiKompetensiTeknis ?? 0) || 0;
      const ab = Number(n.Nilai_Alur_Bisnis ?? n.nilaiAlurBisnis ?? 0) || 0;
      const rawAvg = Number(
        n.Nilai_Rata_Rata ??
          n.nilaiRataRata ??
          n.Nilai_DUDI ??
          n.nilaiDudi ??
          n.Nilai_Akhir ??
          n.nilaiAkhir ??
          0
      );
      if (rawAvg <= 0 && (k3 <= 0 || ss <= 0 || tk <= 0 || ab <= 0)) return false;
      if (targetNis && targetNis !== '-' && rowNis === targetNis) return true;
      if (targetPlt && rowPlt === targetPlt) return true;
      return Boolean(targetNama && rowNama === targetNama);
    });

    if (matchedNilai) {
      const k3lh = toSafeScore(matchedNilai.Nilai_K3LH ?? matchedNilai.nilaiK3lh);
      const softskill = toSafeScore(matchedNilai.Nilai_Softskill ?? matchedNilai.nilaiSoftskill);
      const teknis = toSafeScore(
        matchedNilai.Nilai_Kompetensi_Teknis ?? matchedNilai.nilaiKompetensiTeknis
      );
      const alurBisnis = toSafeScore(matchedNilai.Nilai_Alur_Bisnis ?? matchedNilai.nilaiAlurBisnis);
      const avgRaw = toSafeScore(
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
          tanggal: String(matchedNilai.Tgl_Terbit ?? matchedNilai.tanggalTerbit ?? ''),
        };
      }
    }
  }

  const completedStages = Array.from(completedSet).sort((a, b) => a - b);
  const maxCompleted = completedStages.length > 0 ? completedStages[completedStages.length - 1] : 0;
  const recommendedStage = Math.min(maxCompleted + 1, 8);

  return {
    completedStages,
    recommendedStage,
    hasSubmittedGrades: Boolean(submittedGradeSummary && submittedGradeSummary.rataRata > 0),
    submittedGradeSummary,
    stageLogs,
  };
}
