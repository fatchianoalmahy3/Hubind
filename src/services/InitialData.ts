import {
  Siswa,
  Jurusan,
  Kelas,
  Dudi,
  Guru,
  Pengajuan,
  PerizinanPKL,
  PenempatanPKL,
  Monitoring,
  Sertifikat,
} from '../core/types/schema';

// Zero dummy data: All operational data is sourced 100% from the connected Google Spreadsheet (SSOT).
export const initialJurusan: Jurusan[] = [];
export const initialKelas: Kelas[] = [];
export const initialSiswa: Siswa[] = [];
export const initialDudi: Dudi[] = [];
export const initialGuru: Guru[] = [];
export const initialPengajuan: Pengajuan[] = [];
export const initialPerizinan: PerizinanPKL[] = [];
export const initialSiswaPkl: PenempatanPKL[] = [];
export const initialMonitoring: Monitoring[] = [];
export const initialSertifikat: Sertifikat[] = [];
