export type UserRole = 'SuperAdmin' | 'Hubin' | 'Kepsek' | 'Waka' | 'Pokja' | 'Kakomli' | 'GuruPendamping' | 'Siswa';

export const MONITORING_STAGES = [
  { num: 1, value: '1. Pengantaran', shortLabel: 'Pengantaran', label: '1. Pengantaran' },
  { num: 2, value: '2. Monitoring 1', shortLabel: 'Mon 1', label: '2. Monitoring 1' },
  { num: 3, value: '3. Monitoring 2', shortLabel: 'Mon 2', label: '3. Monitoring 2' },
  { num: 4, value: '4. Monitoring 3', shortLabel: 'Mon 3', label: '4. Monitoring 3' },
  { num: 5, value: '5. Monitoring 4', shortLabel: 'Mon 4 · Nilai', label: '5. Monitoring 4' },
  { num: 6, value: '6. Monitoring 5', shortLabel: 'Mon 5', label: '6. Monitoring 5' },
  { num: 7, value: '7. Monitoring 6', shortLabel: 'Mon 6', label: '7. Monitoring 6' },
  { num: 8, value: '8. Penarikan', shortLabel: 'Penarikan', label: '8. Penarikan' },
] as const;

export type MonitoringTahapValue =
  | (typeof MONITORING_STAGES)[number]['value']
  | '4. Monitoring 3 (Cek Nilai PKL)'
  | '4. Monitoring 3 (Nilai & Sertifikat)'
  | '5. Penarikan'
  | '6. Penarikan';

export interface MonitoringStageControl {
  requireSequential: boolean;
  unlockedStages: number[];
  lockedReason?: string;
}

export const DEFAULT_MONITORING_STAGE_CONTROL: MonitoringStageControl = {
  requireSequential: true,
  unlockedStages: [1, 2, 3, 4, 5, 6, 7, 8],
  lockedReason: '',
};

export interface Siswa {
  id: string;
  nis: string;
  nik: string;
  nama: string;
  jenisKelamin: 'Laki-laki' | 'Perempuan';
  jurusan: string;
  kelas: string;
  noHpSiswa: string;
  alamatDomisili?: string;
  namaOrtuWali?: string;
  noOrtuWali?: string;
  statusPKL: 'Belum Daftar' | 'Diajukan' | 'Diterima DUDI' | 'Sedang PKL' | 'Selesai PKL';
  fotoUrl?: string;
}

export interface Jurusan {
  id: string;
  kode: string; // DKV, RPL, TAB, TBKR, TKR, TKJ, TPM, TPL, TSM
  nama: string;
  namaKakomli: string;
  nipKakomli?: string;
  kontakWA: string;
  kuotaSiswa: number;
  totalTerdaftar: number;
}

export interface Kelas {
  id: string;
  namaKelas: string; // misal: XI TKR 1, XI RPL 2
  jurusan: string;
  tingkat: string;
  waliKelas: string;
  kontakWalas: string;
  jumlahSiswa: number;
}

export interface Dudi {
  id: string;
  namaDudi: string;
  bidangKeahlian: string;
  alamat: string;
  wilayahKota: string;
  namaPemimpin?: string;
  namaPic: string;
  kontakPic: string;
  noTelpDudi?: string;
  linkMaps?: string;
  idGuruPendamping?: string;
  guruPendamping?: string;
  kuotaMaksimal: number;
  terisi: number;
  statusKerjasama: 'MoU Aktif' | 'Proses Perpanjangan' | 'Mitra Baru';
}

export interface Guru {
  id: string;
  nip?: string;
  nama: string;
  kontakWA: string;
  email?: string;
  peranUtama: 'Hubin' | 'Kakomli' | 'Wali Kelas' | 'Guru Pendamping';
  jumlahBimbingan: number;
  pin?: string;
}

export interface Pengajuan {
  id: string;
  noPengajuan: string;
  timestamp: string;
  nis: string;
  namaSiswa: string;
  jurusan: string;
  kelas: string;
  idDudi?: string;
  dudiTujuan: string;
  alamatDudi: string;
  bidangPekerjaan: string;
  namaPemimpin?: string;
  namaPic?: string;
  noTelpDudi?: string;
  linkMaps?: string;
  noWa: string;
  alamatDomisili?: string;
  namaOrtuWali?: string;
  noOrtuWali?: string;
  statusKakomli: 'Pending' | 'Disetujui' | 'Ditolak';
  catatanKakomli?: string;
  statusHubin: 'Menunggu ACC Kakomli' | 'Siap Diberangkatkan' | 'Terjadwal' | 'Batal';
  idGuruPendamping?: string;
  guruPendamping?: string;
  tanggalBerangkat?: string;
}

export type PerizinanIzinOption =
  | 'Sakit di izinkan Orangtua (SO)'
  | 'Surat Dokter (SD)'
  | 'Izin (I)'
  | 'Izin dispensasi (ID)';

export interface PerizinanPKL {
  id: string;
  noPerizinan: string;
  noPengajuan: string;
  nis: string;
  namaSiswa: string;
  jurusan: string;
  kelas: string;
  namaOrtuWali: string;
  noOrtuWali?: string;
  statusIzinOrtu: PerizinanIzinOption | '';
  tanggalMulaiIzin?: string;
  tanggalSelesaiIzin?: string;
  rentangTanggal?: string;
  noSuratPermohonan: string;
  dudiTujuan: string;
  alamatDudi: string;
  tanggalKirimSurat: string;
  statusBalasanDudi?: 'Belum Dikirim' | 'Menunggu Balasan' | 'Diterima DUDI' | 'Ditolak DUDI';
  tanggalBalasan?: string;
  catatanPerizinan?: string;
  linkBuktiBalasan?: string;
  linkSuratPdf?: string;
}

export interface PenempatanPKL {
  id: string;
  idPenempatan: string;
  nis: string;
  namaSiswa: string;
  idDudi: string;
  namaDudi: string;
  idGuruPendamping: string;
  guruPendamping: string;
  tanggalBerangkat: string;
  tanggalRencanaTarik: string;
  statusPenempatan: 'Terjadwal' | 'Sedang Berjalan' | 'Selesai PKL' | 'Pindah DUDI' | 'Dibatalkan';
  catatanPenempatan?: string;
}

export interface Monitoring {
  id: string;
  idPenempatan: string;
  nis?: string;
  namaSiswa?: string;
  dudiTujuan: string;
  alamatDudi: string;
  daftarSiswa: string;
  jurusan: string;
  guruPendamping: string;
  tahap: MonitoringTahapValue | string;
  tanggalKunjungan: string;
  sakit?: number;
  izin?: number;
  alpha?: number;
  nilaiPklMuncul?: boolean;
  nilaiK3lh?: number;
  nilaiSoftskill?: number;
  nilaiKompetensiTeknis?: number;
  nilaiAlurBisnis?: number;
  nilaiRataRata?: number;
  catatanKunjungan: string;
  fotoBuktiUrl?: string;
  nilaiDudiTerkumpul?: boolean;
  blangkoSertifikatBawa?: boolean;
  statusTahap: 'Belum Terlaksana' | 'Terlaksana' | 'Tervalidasi Hubin';
}

export interface Sertifikat {
  id: string;
  nis: string;
  namaSiswa: string;
  jurusan: string;
  kelas: string;
  dudiTujuan: string;
  nilaiK3lh: number;
  nilaiSoftskill: number;
  nilaiKompetensiTeknis: number;
  nilaiAlurBisnis: number;
  nilaiRataRata: number;
  predikat: 'Sangat Baik (A)' | 'Baik (B)' | 'Cukup (C)' | 'Kurang (D)';
  noSeriBlangko: string;
  statusBlangko: 'Tersedia' | 'Dialokasikan' | 'Tervalidasi DUDI' | 'Tercetak & Terbit' | 'Rusak / Batal';
  statusRaport: 'Belum Diproses' | 'Siap Cetak' | 'Sudah Diterbitkan';
  tanggalTerbit?: string;
}
