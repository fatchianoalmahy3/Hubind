import React from 'react';
import { ModuleMetadata } from '../core/types/metadata';
import { PerizinanPKL } from '../core/types/schema';
import { formatPerizinanDateRange } from '../core/utils/dateHelpers';

export const PerizinanMetadata: ModuleMetadata<PerizinanPKL> = {
  id: 'perizinan',
  title: 'Perizinan PKL (Izin & Surat DUDI)',
  subtitle: 'Kelola kategori izin siswa, rentang tanggal izin, surat permohonan ke DUDI, dan penerbitan ke Data Siswa PKL',
  tableName: 'Data_Perizinan_PKL',
  icon: 'FileCheck',
  allowedRoles: ['Hubin', 'Kakomli'],
  statCards: [
    {
      title: 'Total Berkas Perizinan',
      computedValue: (data) => data.length,
      icon: 'FileCheck',
      change: 'Dari pengajuan & input langsung',
      variant: 'primary',
    },
    {
      title: 'Sakit (SO & SD)',
      computedValue: (data) =>
        data.filter(
          (p) =>
            p.statusIzinOrtu === 'Sakit di izinkan Orangtua (SO)' ||
            p.statusIzinOrtu === 'Surat Dokter (SD)'
        ).length,
      icon: 'CheckCircle',
      change: 'SO & Surat Dokter',
      variant: 'warning',
    },
    {
      title: 'Izin & Dispensasi (I / ID)',
      computedValue: (data) =>
        data.filter(
          (p) =>
            p.statusIzinOrtu === 'Izin (I)' ||
            p.statusIzinOrtu === 'Izin dispensasi (ID)'
        ).length,
      icon: 'Building2',
      change: 'Izin & Dispensasi resmi',
      variant: 'info',
    },
    {
      title: 'Surat Terkirim ke DUDI',
      computedValue: (data) =>
        data.filter((p) => Boolean(p.noSuratPermohonan && p.tanggalKirimSurat)).length,
      icon: 'Send',
      change: 'Sudah dibuat & dicatat',
      variant: 'success',
    },
  ],
  fields: [
    {
      key: 'noPerizinan',
      label: 'No. Perizinan',
      type: 'text',
      isTableColumn: true,
      isFormInput: true,
      isSearchable: true,
      isSortable: true,
      disabled: true,
      validation: { required: true },
      placeholder: 'Otomatis (IZN-...)',
      helperText: 'Nomor berkas perizinan dibuat otomatis oleh sistem',
    },
    {
      key: 'noPengajuan',
      label: 'Ref. No. Pengajuan',
      type: 'text',
      isTableColumn: true,
      isFormInput: true,
      isSearchable: true,
      disabled: true,
      placeholder: 'Otomatis dari Pengajuan / Sistem',
      helperText: 'Terisi otomatis dari data Pengajuan siswa (atau dibuat otomatis)',
    },
    {
      key: 'nis',
      label: 'NIS (Cari Nama / NIS)',
      type: 'text',
      isTableColumn: true,
      isFormInput: true,
      isSearchable: true,
      relationSource: 'siswa',
      autocomplete: true,
      allowCustomValue: false,
      validation: { required: true },
      placeholder: 'Ketik NIS atau Nama Siswa dari Master Siswa...',
    },
    {
      key: 'namaSiswa',
      label: 'Nama Siswa',
      type: 'text',
      isTableColumn: true,
      isFormInput: true,
      isSearchable: true,
      isSortable: true,
      relationSource: 'siswa',
      autocomplete: true,
      allowCustomValue: false,
      validation: { required: true },
      placeholder: 'Pilih Nama Siswa dari Master Siswa...',
      helperText: 'Sumber: Master Siswa',
    },
    {
      key: 'jurusan',
      label: 'Kompetensi Keahlian',
      type: 'select',
      isTableColumn: true,
      isFormInput: true,
      isFilterable: true,
      relationSource: 'jurusan',
      options: [
        { label: 'Desain Komunikasi Visual', value: 'Desain Komunikasi Visual' },
        { label: 'Rekayasa Perangkat Lunak', value: 'Rekayasa Perangkat Lunak' },
        { label: 'Teknik Alat Berat', value: 'Teknik Alat Berat' },
        { label: 'Teknik Bodi Kendaraan Ringan', value: 'Teknik Bodi Kendaraan Ringan' },
        { label: 'Teknik Kendaraan Ringan', value: 'Teknik Kendaraan Ringan' },
        { label: 'Teknik Komputer dan Jaringan', value: 'Teknik Komputer dan Jaringan' },
        { label: 'Teknik Pemesinan', value: 'Teknik Pemesinan' },
        { label: 'Teknik Pengelasan', value: 'Teknik Pengelasan' },
        { label: 'Teknik Sepeda Motor', value: 'Teknik Sepeda Motor' },
      ],
    },
    {
      key: 'kelas',
      label: 'Kelas',
      type: 'text',
      isTableColumn: true,
      isFormInput: true,
      isFilterable: true,
      relationSource: 'kelas',
    },
    {
      key: 'namaOrtuWali',
      label: 'Nama Ortu / Wali',
      type: 'text',
      isTableColumn: true,
      isFormInput: true,
      isSearchable: true,
      placeholder: 'Masukkan nama Orang Tua / Wali siswa',
    },
    {
      key: 'statusIzinOrtu',
      label: 'Izin',
      type: 'select',
      isTableColumn: true,
      isFormInput: true,
      isFilterable: true,
      isSortable: true,
      options: [
        {
          label: 'Sakit di izinkan Orangtua (SO)',
          value: 'Sakit di izinkan Orangtua (SO)',
          badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
        },
        {
          label: 'Surat Dokter (SD)',
          value: 'Surat Dokter (SD)',
          badgeColor: 'bg-rose-100 text-rose-800 border-rose-200',
        },
        {
          label: 'Izin (I)',
          value: 'Izin (I)',
          badgeColor: 'bg-sky-100 text-sky-800 border-sky-200',
        },
        {
          label: 'Izin dispensasi (ID)',
          value: 'Izin dispensasi (ID)',
          badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        },
      ],
      validation: { required: true },
    },
    {
      key: 'rentangTanggal',
      label: 'Rentang Tanggal',
      type: 'text',
      isTableColumn: true,
      isFormInput: false,
      isSearchable: true,
      isSortable: true,
      renderCell: (_val, row) => {
        const text = formatPerizinanDateRange(
          row?.tanggalMulaiIzin,
          row?.tanggalSelesaiIzin,
          row?.rentangTanggal || '-'
        );
        if (!text || text === '-') {
          return React.createElement(
            'span',
            { className: 'text-slate-400 text-xs' },
            '-'
          );
        }
        return React.createElement(
          'span',
          { className: 'text-xs font-medium text-slate-700 whitespace-nowrap' },
          text
        );
      },
    },
    {
      key: 'tanggalMulaiIzin',
      label: 'Tanggal Izin',
      type: 'date',
      isTableColumn: false,
      isFormInput: true,
      isSortable: true,
      helperText: 'Pilih tanggal izin siswa',
    },
    {
      key: 'tanggalSelesaiIzin',
      label: 'Sampai Tanggal (Surat Dokter)',
      type: 'date',
      isTableColumn: false,
      isFormInput: true,
      isSortable: true,
      helperText: 'Pilih tanggal berakhir izin sesuai surat dokter',
    },
    {
      key: 'noSuratPermohonan',
      label: 'No. Surat Permohonan',
      type: 'text',
      isTableColumn: true,
      isFormInput: true,
      isSearchable: true,
      placeholder: '421.5/001/Hubin/SMK.PGRI2/2026',
      helperText: 'Terisi otomatis berurutan saat membuat berkas baru',
    },
    {
      key: 'dudiTujuan',
      label: 'Tujuan DUDI',
      type: 'text',
      isTableColumn: true,
      isFormInput: true,
      isSearchable: true,
      isSortable: true,
      relationSource: 'dudi',
      autocomplete: true,
      allowCustomValue: true,
      validation: { required: true },
      placeholder: 'Otomatis dari Pengajuan/Penempatan, atau ketik nama DUDI...',
      helperText: 'Terisi otomatis jika siswa sudah memiliki pengajuan/penempatan PKL, atau ketik untuk memilih DUDI',
    },
    {
      key: 'alamatDudi',
      label: 'Alamat DUDI',
      type: 'text',
      isTableColumn: true,
      isFormInput: true,
      placeholder: 'Terisi otomatis saat memilih DUDI',
    },
    {
      key: 'tanggalKirimSurat',
      label: 'Tanggal Surat DUDI',
      type: 'date',
      isTableColumn: true,
      isFormInput: true,
      isSortable: true,
      helperText: 'Terisi otomatis sesuai tanggal input',
    },
    {
      key: 'catatanPerizinan',
      label: 'Catatan Perizinan',
      type: 'textarea',
      isTableColumn: false,
      isFormInput: true,
      placeholder: 'Keterangan surat izin atau informasi tambahan pengiriman ke DUDI',
    },
    {
      key: 'linkBuktiBalasan',
      label: 'Link Bukti Scan / Drive',
      type: 'text',
      isTableColumn: false,
      isFormInput: true,
      placeholder: 'https://drive.google.com/...',
    },
    {
      key: 'linkSuratPdf',
      label: 'Tautan PDF Surat (Drive)',
      type: 'text',
      isTableColumn: true,
      isFormInput: true,
      placeholder: 'Otomatis terisi saat Generate PDF ke Google Drive',
    },
  ],
};
