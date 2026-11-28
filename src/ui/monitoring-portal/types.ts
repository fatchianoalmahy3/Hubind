import type {
  AktivitasSikapRating,
  BukuLaporanStatus,
  KondisiBengkelCheck,
} from '../../core/types/schema';
import { EMPTY_KONDISI_BENGKEL } from '../../core/utils/monitoringHelpers';

export interface WorkshopStageDraft {
  kompetensiList: string[];
  kondisiBengkel: KondisiBengkelCheck;
}

export const DEFAULT_WORKSHOP_DRAFT: WorkshopStageDraft = {
  kompetensiList: ['', ''],
  kondisiBengkel: { ...EMPTY_KONDISI_BENGKEL },
};

export interface StudentStageDraft {
  sakit: number;
  izin: number;
  alpha: number;
  bukuLaporan: BukuLaporanStatus | '';
  aktivitasDp: AktivitasSikapRating | '';
  aktivitasMt: AktivitasSikapRating | '';
  aktivitasKrt: AktivitasSikapRating | '';
  ttdSiswa: string;
  nilaiPklMuncul: boolean | null;
  nilaiK3lh: number;
  nilaiSoftskill: number;
  nilaiKompetensiTeknis: number;
  nilaiAlurBisnis: number;
  catatanPerkembangan: string;
}

export const CATATAN_QUICK_PRESETS: string[] = [
  'Disiplin, aktif, dan mengikuti SOP bengkel dengan baik.',
  'Buku jurnal terisi rapi sesuai kegiatan harian.',
  'Perlu peningkatan ketelitian & inisiatif kerja.',
];

export const DELIVERY_CATATAN_PRESETS: string[] = [
  'Siswa telah diserahkan resmi dan diterima baik oleh pihak DUDI.',
  'Tata tertib, SOP keselamatan kerja (K3), dan jadwal kerja telah disepakati.',
  'Data pimpinan, pembimbing lapangan, dan kontak darurat DUDI terverifikasi.',
];

export interface GradeScoresDraft {
  nilaiK3lh: number;
  nilaiSoftskill: number;
  nilaiKompetensiTeknis: number;
  nilaiAlurBisnis: number;
}

export const DEFAULT_DRAFT: StudentStageDraft = {
  sakit: 0,
  izin: 0,
  alpha: 0,
  bukuLaporan: '',
  aktivitasDp: '',
  aktivitasMt: '',
  aktivitasKrt: '',
  ttdSiswa: '',
  nilaiPklMuncul: null,
  nilaiK3lh: 0,
  nilaiSoftskill: 0,
  nilaiKompetensiTeknis: 0,
  nilaiAlurBisnis: 0,
  catatanPerkembangan: '',
};

export function isDudiContactIncomplete(pemimpin?: unknown, pic?: unknown, telp?: unknown): boolean {
  const p = String(pemimpin ?? '').trim();
  const c = String(pic ?? '').trim();
  const t = String(telp ?? '').replace(/\D/g, '');
  return !p || p === '-' || !c || c === '-' || t.length < 7;
}

export const QUICK_SCORE_PRESETS = [75, 80, 85, 90, 95];

export const GRADE_CATEGORIES: Array<{
  field: keyof GradeScoresDraft;
  title: string;
  subtitle: string;
}> = [
  {
    field: 'nilaiK3lh',
    title: '1. K3LH',
    subtitle: 'Keselamatan, Kesehatan Kerja, Penggunaan APD & Kebersihan Area',
  },
  {
    field: 'nilaiSoftskill',
    title: '2. Softskills',
    subtitle: 'Etos Kerja, Kedisiplinan, Komunikasi & Kerjasama Tim',
  },
  {
    field: 'nilaiKompetensiTeknis',
    title: '3. Hardskills',
    subtitle: 'Kompetensi Teknis Kejuruan, Kualitas Hasil Kerja & Kesesuaian SOP',
  },
  {
    field: 'nilaiAlurBisnis',
    title: '4. Alur Bisnis Dunia Kerja',
    subtitle: 'Pemahaman Proses Operasional Industri & Budaya Kerja DUDI',
  },
];

export function getStudentKey(student: any, fallbackIdx = 0): string {
  if (!student) return `stu_${fallbackIdx}`;
  return String(student.nis && student.nis !== '-' ? student.nis : student.id || `stu_${fallbackIdx}`);
}

export interface MonitoringSaveReceipt {
  idMonitoring: string;
  studentName: string;
  studentNis: string;
  dudiName: string;
  stageNum: number;
  stageLabel: string;
  sakit: number;
  izin: number;
  alpha: number;
  bukuLaporan: string;
  ttdSigned: boolean;
  isDeliveryBatch?: boolean;
  isMonitoringBatch?: boolean;
  deliveredStudents?: Array<{ nama: string; nis: string }>;
  savedStudents?: Array<{
    nama: string;
    nis: string;
    sakit: number;
    izin: number;
    alpha: number;
    bukuLaporan: string;
    gradeAvg?: number;
    gradePredikat?: string;
  }>;
  dudiPemimpin?: string;
  dudiPic?: string;
  dudiKontak?: string;
  gradeAvg?: number;
  gradePredikat?: string;
  gradeSynced?: boolean;
  verifiedInSpreadsheet: boolean;
  sheetRowNumber?: number;
  savedAt: string;
  nextStudentIndex?: number;
  nextStudentName?: string;
  nextStageNum?: number;
}

