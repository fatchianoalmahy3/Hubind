import { ModuleMetadata } from '../core/types/metadata';
import { Monitoring } from '../core/types/schema';

export const MonitoringMetadata: ModuleMetadata<Monitoring> = {
  id: 'monitoring',
  title: 'Monitoring 5 Tahap Guru Pendamping',
  subtitle: 'Pengantaran, Monitoring 1-3, Pengambilan Nilai & Sertifikat DUDI, serta Penarikan',
  tableName: 'Monitoring_5_Tahap',
  icon: 'Compass',
  allowedRoles: ['Hubin', 'Kakomli', 'GuruPendamping'],
  statCards: [
    {
      title: 'Total Kunjungan Terdata',
      computedValue: (data) => data.length,
      icon: 'Compass',
      change: 'Log supervisi industri',
      variant: 'primary',
    },
    {
      title: 'Tahap 1 - Pengantaran',
      computedValue: (data) =>
        data.filter((m) => {
          const t = String((m as any)?.tahap || (m as any)?.tahap_monitoring || '');
          return t.includes('1');
        }).length,
      icon: 'Send',
      change: 'Pemberangkatan siswa',
      variant: 'info',
    },
    {
      title: 'Tahap 4 - Nilai & Sertifikat',
      computedValue: (data) =>
        data.filter((m) => {
          const t = String((m as any)?.tahap || (m as any)?.tahap_monitoring || '');
          const hasNilai = Boolean(
            m?.nilaiDudiTerkumpul || (m as any)?.nilai_rata_rata > 0
          );
          return t.includes('4') || hasNilai;
        }).length,
      icon: 'Award',
      change: 'Nilai & TTD DUDI beres',
      variant: 'warning',
    },
    {
      title: 'Tahap 5 - Penarikan',
      computedValue: (data) =>
        data.filter((m) => {
          const t = String((m as any)?.tahap || (m as any)?.tahap_monitoring || '');
          return t.includes('5');
        }).length,
      icon: 'CheckCircle',
      change: 'Prakerin tuntas',
      variant: 'success',
    },
  ],
  fields: [
    {
      key: 'fotoBuktiUrl',
      label: 'Foto Kunjungan',
      type: 'image',
      isTableColumn: true,
      isFormInput: true,
      isSortable: false,
      isSearchable: false,
    },
    {
      key: 'dudiTujuan',
      label: 'Mitra DUDI',
      type: 'text',
      isTableColumn: true,
      isFormInput: true,
      isSearchable: true,
      isSortable: true,
      relationSource: 'dudi',
      allowCustomValue: true,
      validation: { required: true },
    },
    {
      key: 'daftarSiswa',
      label: 'Kelompok Siswa',
      type: 'text',
      isTableColumn: true,
      isFormInput: true,
      isSearchable: true,
      validation: { required: true },
      placeholder: 'Nama-nama siswa di DUDI ini',
    },
    {
      key: 'jurusan',
      label: 'Jurusan',
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
      validation: { required: true },
    },
    {
      key: 'guruPendamping',
      label: 'Guru Pendamping',
      type: 'text',
      isTableColumn: true,
      isFormInput: true,
      isSearchable: true,
      isSortable: true,
      relationSource: 'guru',
      validation: { required: true },
    },
    {
      key: 'tahap',
      label: 'Tahap Kunjungan',
      type: 'select',
      isTableColumn: true,
      isFormInput: true,
      isFilterable: true,
      isSortable: true,
      options: [
        { label: '1. Pengantaran', value: '1. Pengantaran', badgeColor: 'bg-blue-100 text-blue-800' },
        { label: '2. Monitoring 1', value: '2. Monitoring 1', badgeColor: 'bg-indigo-100 text-indigo-800' },
        { label: '3. Monitoring 2', value: '3. Monitoring 2', badgeColor: 'bg-purple-100 text-purple-800' },
        { label: '4. Monitoring 3 (Nilai & Sertifikat)', value: '4. Monitoring 3 (Nilai & Sertifikat)', badgeColor: 'bg-amber-100 text-amber-800' },
        { label: '5. Penarikan', value: '5. Penarikan', badgeColor: 'bg-emerald-100 text-emerald-800' },
      ],
      validation: { required: true },
    },
    {
      key: 'tanggalKunjungan',
      label: 'Tgl Kunjungan',
      type: 'date',
      isTableColumn: true,
      isFormInput: true,
      isSortable: true,
      validation: { required: true },
    },
    {
      key: 'catatanKunjungan',
      label: 'Catatan Supervisi / Evaluasi Siswa',
      type: 'textarea',
      isTableColumn: true,
      isFormInput: true,
      isSearchable: true,
      placeholder: 'Catatan kondisi siswa, kedisiplinan, materi yang dipelajari...',
    },
    {
      key: 'nilaiDudiTerkumpul',
      label: 'Nilai DUDI Masuk',
      type: 'boolean',
      isTableColumn: true,
      isFormInput: true,
    },
    {
      key: 'blangkoSertifikatBawa',
      label: 'Blangko Sertifikat Dibawa',
      type: 'boolean',
      isTableColumn: true,
      isFormInput: true,
    },
    {
      key: 'statusTahap',
      label: 'Status Validasi',
      type: 'select',
      isTableColumn: true,
      isFormInput: true,
      isFilterable: true,
      options: [
        { label: 'Belum Terlaksana', value: 'Belum Terlaksana', badgeColor: 'bg-zinc-100 text-zinc-700' },
        { label: 'Terlaksana', value: 'Terlaksana', badgeColor: 'bg-blue-100 text-blue-800' },
        { label: 'Tervalidasi Hubin', value: 'Tervalidasi Hubin', badgeColor: 'bg-emerald-100 text-emerald-800' },
      ],
    },
  ],
};
