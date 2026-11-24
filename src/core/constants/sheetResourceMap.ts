export const REST_RESOURCE_TO_SHEET: Record<string, string> = {
  students: 'Master_Siswa_XI',
  majors: 'Master_Jurusan',
  classes: 'Master_Kelas_Walas',
  dudi: 'Master_DUDI',
  teachers: 'Master_Guru_Pendamping',
  submissions: 'Data_Pengajuan_PKL',
  permits: 'Data_Perizinan_PKL',
  placements: 'Plotting_Pemberangkatan',
  monitoring: 'Monitoring_5_Tahap',
  certificates: 'Nilai_Dan_Sertifikat',
  accounts: 'Master_Akun',
  'issued-letters': 'Log_Penerbitan_Surat',
};

export const SHEET_TO_REST_RESOURCE: Record<string, string> = {
  Master_Siswa_XI: 'students',
  Master_Siswa: 'students',
  Master_Jurusan: 'majors',
  Master_Kelas_Walas: 'classes',
  Master_DUDI: 'dudi',
  Master_Guru_Pendamping: 'teachers',
  Data_Pengajuan_PKL: 'submissions',
  Data_Perizinan_PKL: 'permits',
  Plotting_Pemberangkatan: 'placements',
  Monitoring_5_Tahap: 'monitoring',
  Monitoring_6_Tahap: 'monitoring',
  Monitoring_8_Tahap: 'monitoring',
  Monitoring_PKL: 'monitoring',
  Nilai_Dan_Sertifikat: 'certificates',
  Master_Akun: 'accounts',
  Log_Penerbitan_Surat: 'issued-letters',
};

export const CORE_ADMIN_BOOTSTRAP_TABLES: string[] = [
  'Master_Jurusan',
  'Master_Kelas_Walas',
  'Master_DUDI',
  'Master_Guru_Pendamping',
  'Master_Siswa_XI',
  'Data_Pengajuan_PKL',
  'Plotting_Pemberangkatan',
  'Log_Penerbitan_Surat',
];

export const HEAVY_ADMIN_BOOTSTRAP_TABLES: string[] = [
  'Data_Perizinan_PKL',
  'Monitoring_5_Tahap',
  'Nilai_Dan_Sertifikat',
];

export const DEFAULT_ADMIN_BOOTSTRAP_TABLES: string[] = [
  ...CORE_ADMIN_BOOTSTRAP_TABLES,
  ...HEAVY_ADMIN_BOOTSTRAP_TABLES.filter((t) => t !== 'Log_Penerbitan_Surat'),
];

export const ALLOWED_ADMIN_SHEETS = new Set<string>(Object.keys(SHEET_TO_REST_RESOURCE));

export const MODULE_TO_SHEET: Record<string, string> = {
  siswa: 'Master_Siswa_XI',
  jurusan: 'Master_Jurusan',
  kelas: 'Master_Kelas_Walas',
  dudi: 'Master_DUDI',
  guru: 'Master_Guru_Pendamping',
  pengajuan: 'Data_Pengajuan_PKL',
  perizinan: 'Data_Perizinan_PKL',
  siswa_pkl: 'Plotting_Pemberangkatan',
  monitoring: 'Monitoring_5_Tahap',
  sertifikat: 'Nilai_Dan_Sertifikat',
};

export function resolveSheetNameByModuleId(moduleId?: string): string {
  if (!moduleId) return '';
  return MODULE_TO_SHEET[moduleId] || '';
}
