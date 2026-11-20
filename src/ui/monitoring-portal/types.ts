export interface StudentStageDraft {
  sakit: number;
  izin: number;
  alpha: number;
  nilaiPklMuncul: boolean | null;
  nilaiK3lh: number;
  nilaiSoftskill: number;
  nilaiKompetensiTeknis: number;
  nilaiAlurBisnis: number;
  catatanPerkembangan: string;
}

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
