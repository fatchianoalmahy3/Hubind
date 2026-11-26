import React from 'react';
import { ModuleMetadata } from '../core/types/metadata';
import { PerizinanPKL } from '../core/types/schema';
import { formatPerizinanDateRange } from '../core/utils/dateHelpers';

export const PerizinanMetadata: ModuleMetadata<PerizinanPKL> = {
  id: 'perizinan',
  title: 'Perizinan Siswa PKL (SO/SD/I/ID)',
  subtitle: 'Pencatatan izin ketidakhadiran & dispensasi siswa selama PKL (SO, SD, I, ID) via input manual atau impor Excel',
  tableName: 'Data_Perizinan_PKL',
  icon: 'FileCheck',
  allowedRoles: ['Hubin', 'Pokja', 'Waka', 'Kepsek'],
  statCards: [
    {
      title: 'Total Catatan Izin',
      computedValue: (data) => data.length,
      icon: 'FileCheck',
      change: 'Input manual & impor Excel',
      variant: 'primary',
    },
    {
      title: 'Sakit Ortu (SO)',
      computedValue: (data) =>
        data.filter((p) => p.statusIzinOrtu === 'Sakit di izinkan Orangtua (SO)').length,
      icon: 'HeartPulse',
      change: 'Izin sakit oleh orang tua',
      variant: 'warning',
    },
    {
      title: 'Surat Dokter (SD)',
      computedValue: (data) =>
        data.filter((p) => p.statusIzinOrtu === 'Surat Dokter (SD)').length,
      icon: 'FileText',
      change: 'Melampirkan surat dokter',
      variant: 'danger',
    },
    {
      title: 'Izin & Dispensasi (I / ID)',
      computedValue: (data) =>
        data.filter(
          (p) =>
            p.statusIzinOrtu === 'Izin (I)' ||
            p.statusIzinOrtu === 'Izin dispensasi (ID)'
        ).length,
      icon: 'CheckCircle',
      change: 'Izin pribadi & dispensasi resmi',
      variant: 'info',
    },
  ],
  fields: [
    {
      key: 'noPerizinan',
      label: 'ID Perizinan',
      type: 'text',
      isTableColumn: true,
      isFormInput: true,
      isSearchable: true,
      isSortable: true,
      disabled: true,
      validation: { required: true },
      placeholder: 'Otomatis (IZN-...)',
      helperText: 'Nomor catatan perizinan dibuat otomatis oleh sistem',
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
      isFormInput: false,
      isFilterable: true,
      relationSource: 'jurusan',
    },
    {
      key: 'kelas',
      label: 'Kelas',
      type: 'text',
      isTableColumn: true,
      isFormInput: false,
      isFilterable: true,
      relationSource: 'kelas',
    },
    {
      key: 'idDudi',
      label: 'ID DUDI',
      type: 'text',
      isTableColumn: false,
      isFormInput: true,
      disabled: true,
      placeholder: 'Otomatis dari penempatan siswa / Master DUDI',
      helperText: 'Terisi otomatis dari penempatan PKL siswa atau saat memilih DUDI',
    },
    {
      key: 'dudiTujuan',
      label: 'Lokasi DUDI PKL',
      type: 'text',
      isTableColumn: true,
      isFormInput: true,
      isSearchable: true,
      isSortable: true,
      relationSource: 'dudi',
      autocomplete: true,
      allowCustomValue: true,
      placeholder: 'Otomatis dari penempatan aktif, atau ketik nama DUDI...',
      helperText: 'Terisi otomatis jika siswa sudah terplotting di DUDI',
    },
    {
      key: 'statusIzinOrtu',
      label: 'Kategori Izin',
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
          { className: 'text-xs font-medium text-slate-700 whitespace-nowrap tabular-nums' },
          text
        );
      },
    },
    {
      key: 'tanggalMulaiIzin',
      label: 'Tanggal Mulai Izin',
      type: 'date',
      isTableColumn: false,
      isFormInput: true,
      isSortable: true,
      validation: { required: true },
      helperText: 'Pilih tanggal mulai izin siswa',
    },
    {
      key: 'tanggalSelesaiIzin',
      label: 'Tanggal Selesai Izin',
      type: 'date',
      isTableColumn: false,
      isFormInput: true,
      isSortable: true,
      helperText: 'Kosongkan jika hanya 1 hari',
    },
    {
      key: 'catatanPerizinan',
      label: 'Keterangan / Catatan Izin',
      type: 'textarea',
      isTableColumn: true,
      isFormInput: true,
      isSearchable: true,
      placeholder: 'Alasan izin, nomor surat dispensasi sekolah, atau catatan pendamping...',
    },
    {
      key: 'linkBuktiBalasan',
      label: 'Link Bukti Surat / Foto (Drive)',
      type: 'text',
      isTableColumn: true,
      isFormInput: true,
      placeholder: 'https://drive.google.com/...',
    },
  ],
};
