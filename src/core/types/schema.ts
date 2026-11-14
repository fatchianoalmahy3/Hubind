export type UserRole = 'Hubin' | 'Kepsek' | 'Waka' | 'Pokja' | 'Kakomli' | 'GuruPendamping' | 'Siswa';

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
  nipKakomli: string;
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
  namaPic: string;
  kontakPic: string;
  kuotaMaksimal: number;
  terisi: number;
  statusKerjasama: 'MoU Aktif' | 'Proses Perpanjangan' | 'Mitra Baru';
}

export interface Guru {
  id: string;
  nip: string;
  nama: string;
  kontakWA: string;
  email: string;
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
  dudiTujuan: string;
  alamatDudi: string;
  bidangPekerjaan: string;
  noWa: string;
  statusKakomli: 'Pending' | 'Disetujui' | 'Ditolak';
  catatanKakomli?: string;
  statusHubin: 'Menunggu ACC Kakomli' | 'Siap Diberangkatkan' | 'Terjadwal' | 'Batal';
  guruPendamping?: string;
  tanggalBerangkat?: string;
}

export interface PerizinanPKL {
  id: string;
  noPerizinan: string;
  noPengajuan: string;
  nis: string;
  namaSiswa: string;
  jurusan: string;
  kelas: string;
  namaOrtuWali: string;
  noOrtuWali: string;
  statusIzinOrtu: 'Menunggu Izin' | 'Diizinkan Ortu' | 'Tidak Diizinkan';
  noSuratPermohonan: string;
  dudiTujuan: string;
  alamatDudi: string;
  tanggalKirimSurat: string;
  statusBalasanDudi: 'Belum Dikirim' | 'Menunggu Balasan' | 'Diterima DUDI' | 'Ditolak DUDI';
  tanggalBalasan?: string;
  catatanPerizinan?: string;
  linkBuktiBalasan?: string;
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
  statusPenempatan: 'Terjadwal' | 'Sedang Berjalan' | 'Selesai PKL' | 'Dibatalkan';
}

export interface Monitoring {
  id: string;
  idPenempatan: string;
  dudiTujuan: string;
  alamatDudi: string;
  daftarSiswa: string; // Nama-nama siswa satu kelompok
  jurusan: string;
  guruPendamping: string;
  tahap: '1. Pengantaran' | '2. Monitoring 1' | '3. Monitoring 2' | '4. Monitoring 3 (Nilai & Sertifikat)' | '5. Penarikan';
  tanggalKunjungan: string;
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
  nilaiDudi: number;
  nilaiGuru: number;
  nilaiAkhir: number;
  predikat: 'Sangat Baik (A)' | 'Baik (B)' | 'Cukup (C)';
  noSeriBlangko: string;
  statusBlangko: 'Tersedia' | 'Dialokasikan' | 'Tervalidasi DUDI' | 'Tercetak & Terbit' | 'Rusak / Batal';
  statusRaport: 'Belum Diproses' | 'Siap Cetak' | 'Sudah Diterbitkan';
  tanggalTerbit?: string;
}
