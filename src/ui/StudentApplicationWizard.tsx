import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  CheckCircle2,
  AlertTriangle,
  MessageCircle,
  ArrowRight,
  FileText,
  Printer,
  ShieldCheck,
} from 'lucide-react';
import { GoogleSheetClient } from '../core/GoogleSheetClient';
import { PublicPortalClient } from '../core/PublicPortalClient';

interface StudentApplicationWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessOpenDocs?: (student: any) => void;
}

export const StudentApplicationWizard: React.FC<StudentApplicationWizardProps> = ({
  isOpen,
  onClose,
  onSuccessOpenDocs,
}) => {
  const activeYear = GoogleSheetClient.getInstance().getActiveYear();

  const [nisInput, setNisInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [studentData, setStudentData] = useState<any>(null);
  const [searchError, setSearchError] = useState('');

  // Form Fields
  const [telepon, setTelepon] = useState('');
  const [alamatDomisili, setAlamatDomisili] = useState('');
  const [namaOrtu, setNamaOrtu] = useState('');
  const [teleponOrtu, setTeleponOrtu] = useState('');

  // DUDI Selection
  const [dudiList, setDudiList] = useState<any[]>([]);
  const [loadingDudi, setLoadingDudi] = useState(false);
  const [dudiLoadError, setDudiLoadError] = useState('');
  const [selectedDudiId, setSelectedDudiId] = useState('');
  const [isDudiUnregistered, setIsDudiUnregistered] = useState(false);
  const [customDudiName, setCustomDudiName] = useState('');
  const [customDudiAddress, setCustomDudiAddress] = useState('');
  const [customDudiField, setCustomDudiField] = useState('');

  // Dates & Notes
  const [tanggalMulai, setTanggalMulai] = useState('2026-08-01');
  const [tanggalSelesai, setTanggalSelesai] = useState('2026-11-30');
  const [catatan, setCatatan] = useState('');

  // Submission State
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submissionResult, setSubmissionResult] = useState<any>(null);

  useEffect(() => {
    if (isOpen) {
      loadDudiList();
    }
  }, [isOpen]);

  const loadDudiList = async () => {
    setLoadingDudi(true);
    setDudiLoadError('');
    try {
      const json = await PublicPortalClient.getDudiList();
      if (!json.success) {
        setDudiList([]);
        setDudiLoadError('Gagal membaca daftar DUDI dari Google Spreadsheet.');
        return;
      }
      setDudiList(Array.isArray(json.data) ? json.data : []);
    } catch (e: any) {
      setDudiList([]);
      setDudiLoadError(e?.message || 'Tidak dapat terhubung ke Google Spreadsheet.');
    } finally {
      setLoadingDudi(false);
    }
  };

  const handleLookupNis = async (nisToSearch?: string) => {
    const nis = (nisToSearch || nisInput).trim();
    if (!nis) {
      setSearchError('Silakan masukkan NIS Anda terlebih dahulu.');
      return;
    }

    setSearching(true);
    setSearchError('');
    setStudentData(null);

    try {
      const json = await PublicPortalClient.lookupStudentByNis(nis);

      if (!json.success) {
        setSearchError(json.message || 'Gagal mengakses data siswa di Google Spreadsheet.');
        return;
      }

      if (json.found && json.student) {
        setStudentData(json.student);
        setTelepon(json.student.telepon || '');
        setAlamatDomisili(json.student.alamat_domisili || '');
        setNamaOrtu(json.student.nama_wali || '');
        setTeleponOrtu(json.student.telepon_wali || '');
      } else {
        setSearchError(
          json.message || `Siswa dengan NIS [${nis}] tidak ditemukan di Google Spreadsheet sekolah.`
        );
      }
    } catch (e: any) {
      setSearchError(e?.message || 'Gagal mencari NIS. Periksa koneksi internet Anda.');
    } finally {
      setSearching(false);
    }
  };

  const handleDudiChange = (val: string) => {
    setSelectedDudiId(val);
    setSubmitError('');
    if (val === 'unregistered') {
      setIsDudiUnregistered(true);
      setCustomDudiName('');
      setCustomDudiAddress('');
      setCustomDudiField('');
    } else {
      setIsDudiUnregistered(false);
      const chosen = dudiList.find((d) => d.id === val);
      if (chosen) {
        setCustomDudiName(chosen.nama_dudi);
        setCustomDudiAddress(chosen.alamat || chosen.kota || '');
        setCustomDudiField(chosen.bidang_usaha || '');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    if (!studentData) {
      setSearchError('Harap cari dan verifikasi NIS Anda terlebih dahulu.');
      return;
    }

    if (!selectedDudiId) {
      setSubmitError('Silakan pilih DUDI tujuan Anda.');
      return;
    }

    if (isDudiUnregistered && !customDudiName.trim()) {
      setSubmitError('Silakan ketik nama DUDI/Perusahaan yang diajukan.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        nis: studentData.nis,
        nama: studentData.nama,
        kelas: studentData.kelas,
        jurusan: studentData.jurusan,
        telepon,
        alamat_domisili: alamatDomisili,
        nama_orang_tua: namaOrtu,
        telepon_orang_tua: teleponOrtu,
        dudi_id: isDudiUnregistered ? 'custom_hubin' : selectedDudiId,
        nama_dudi: customDudiName,
        alamat_dudi: customDudiAddress,
        bidang_dudi: customDudiField,
        tanggal_mulai: tanggalMulai,
        tanggal_selesai: tanggalSelesai,
        catatan,
        is_dudi_unregistered: isDudiUnregistered,
      };

      const json = await PublicPortalClient.submitApplication(payload);

      if (json.success && json.application) {
        setSubmissionResult(json.application);
      } else {
        setSubmitError(
          json.message || 'Gagal mengirim pengajuan ke Google Spreadsheet. Hubungi Admin Hubin.'
        );
      }
    } catch (e: any) {
      setSubmitError(e?.message || 'Gagal mengirim pengajuan. Periksa koneksi internet Anda.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setNisInput('');
    setStudentData(null);
    setAlamatDomisili('');
    setSearchError('');
    setSubmitError('');
    setSelectedDudiId('');
    setIsDudiUnregistered(false);
    setCustomDudiName('');
    setCustomDudiAddress('');
    setCustomDudiField('');
    setSubmissionResult(null);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-2xl max-h-[92vh] overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-white/95 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Portal Pengajuan PKL Siswa Mandiri
              </h2>
              <p className="text-xs text-slate-500">
                Tahun Ajaran {activeYear} · Terhubung Google Spreadsheet Sekolah
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-200/60 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {submissionResult ? (
            <div className="py-6 text-center space-y-5 animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-slate-900">
                  Pengajuan PKL Berhasil Dikirim!
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Data pengajuan Anda telah tercatat langsung di Google Spreadsheet Pokja Hubin SMK PGRI 2 Ponorogo.
                </p>
              </div>

              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-left max-w-lg mx-auto space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Nomor Registrasi:</span>
                  <span className="font-mono font-bold text-blue-600">{submissionResult.id}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Nama Siswa:</span>
                  <span className="font-bold text-slate-800">
                    {submissionResult.nama_siswa} ({submissionResult.nis})
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Kelas / Jurusan:</span>
                  <span className="font-semibold text-slate-700">
                    {submissionResult.kelas} - {submissionResult.jurusan}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">DUDI Pilihan:</span>
                  <span className="font-bold text-indigo-700">{submissionResult.nama_dudi}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Status Saat Ini:</span>
                  <span className="font-semibold text-amber-600">{submissionResult.status}</span>
                </div>
              </div>

              <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-2xl text-xs text-blue-900 max-w-lg mx-auto text-left flex items-start gap-3">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <b>Langkah Selanjutnya:</b> Cetak berkas rekomendasi dan mintakan persetujuan Ketua Konsentrasi Keahlian (Kakomli) jurusan Anda.
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3">
                {onSuccessOpenDocs && (
                  <button
                    onClick={() => {
                      onSuccessOpenDocs(submissionResult);
                      onClose();
                    }}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Cetak Lembar Rekomendasi Kakomli</span>
                  </button>
                )}
                <button
                  onClick={resetForm}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
                >
                  Ajukan untuk Siswa Lain
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Step 1: Lookup NIS */}
              <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">
                      1
                    </span>
                    Masukkan Nomor Induk Siswa (NIS) Terdaftar
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={nisInput}
                      onChange={(e) => setNisInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleLookupNis();
                        }
                      }}
                      placeholder="Masukkan NIS Anda sesuai data sekolah..."
                      className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-white font-mono"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleLookupNis()}
                    disabled={searching}
                    className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {searching ? (
                      <span>Mencari...</span>
                    ) : (
                      <>
                        <Search className="w-3.5 h-3.5" />
                        <span>Cari Data</span>
                      </>
                    )}
                  </button>
                </div>

                {searchError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                    <span>{searchError}</span>
                  </div>
                )}

                {studentData && (
                  <div className="p-3.5 bg-emerald-50/90 border border-emerald-200 rounded-xl space-y-1.5 animate-in fade-in duration-150">
                    <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Data Siswa Terverifikasi di Google Spreadsheet:</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
                      <div>
                        <span className="text-slate-500 block text-[10px]">Nama Lengkap:</span>
                        <span className="font-bold text-slate-800">{studentData.nama}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Kelas:</span>
                        <span className="font-bold text-slate-800">{studentData.kelas}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Jurusan:</span>
                        <span className="font-bold text-slate-800">{studentData.jurusan}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">NIK:</span>
                        <span className="font-mono text-slate-700">{studentData.nik || '-'}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {studentData && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">
                      2
                    </span>
                    <span>Lengkapi Data Kontak &amp; Orang Tua / Wali</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">
                        Nomor WhatsApp Siswa
                      </label>
                      <input
                        type="text"
                        value={telepon}
                        onChange={(e) => setTelepon(e.target.value)}
                        placeholder="08xxxxxxxxxx"
                        required
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">
                        Nama Orang Tua / Wali
                      </label>
                      <input
                        type="text"
                        value={namaOrtu}
                        onChange={(e) => setNamaOrtu(e.target.value)}
                        placeholder="Nama lengkap orang tua / wali"
                        required
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-slate-700 font-semibold mb-1">
                        Alamat Domisili Siswa
                      </label>
                      <input
                        type="text"
                        value={alamatDomisili}
                        onChange={(e) => setAlamatDomisili(e.target.value)}
                        placeholder="Jalan, RT/RW, Desa/Kelurahan, Kecamatan, Kabupaten"
                        required
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-slate-700 font-semibold mb-1">
                        Nomor Telepon / WhatsApp Orang Tua (Kontak Darurat)
                      </label>
                      <input
                        type="text"
                        value={teleponOrtu}
                        onChange={(e) => setTeleponOrtu(e.target.value)}
                        placeholder="08xxxxxxxxxx"
                        required
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </div>

                  <div className="space-y-3 pt-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">
                        3
                      </span>
                      <span>Pilih Dunia Usaha / Dunia Industri (DUDI) Tujuan</span>
                    </div>

                    {dudiLoadError && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                        {dudiLoadError}
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Pilih dari Mitra Resmi di Spreadsheet:
                      </label>
                      <select
                        value={selectedDudiId}
                        onChange={(e) => handleDudiChange(e.target.value)}
                        disabled={loadingDudi}
                        required
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
                      >
                        <option value="">
                          {loadingDudi ? 'Memuat daftar DUDI...' : '-- Pilih DUDI Mitra --'}
                        </option>
                        {dudiList.map((d, idx) => (
                          <option key={`${d.id || 'dudi'}_${idx}`} value={d.id}>
                            {d.nama_dudi} ({d.bidang_usaha} - {d.kota})
                          </option>
                        ))}
                        <option value="unregistered" className="font-bold text-amber-700 bg-amber-50">
                          DUDI Tidak Ada di Daftar (Ajukan Tempat Baru)
                        </option>
                      </select>
                    </div>

                    {isDudiUnregistered && (
                      <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl space-y-3 animate-in fade-in duration-200">
                        <div className="flex items-start gap-2.5">
                          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <h4 className="text-xs font-bold text-amber-900">
                              DUDI Belum Terdaftar di Sistem Pokja Hubin
                            </h4>
                            <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                              Tempat PKL baru wajib diverifikasi dan disetujui oleh Pokja Hubin untuk memastikan kesesuaian kompetensi dan keselamatan kerja.
                            </p>
                          </div>
                        </div>

                        <div className="space-y-2 pt-1 text-xs">
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">
                              Nama Perusahaan / Bengkel yang Dituju
                            </label>
                            <input
                              type="text"
                              value={customDudiName}
                              onChange={(e) => setCustomDudiName(e.target.value)}
                              placeholder="Nama perusahaan / instansi..."
                              required
                              className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                            />
                          </div>
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">
                              Alamat Lengkap Perusahaan
                            </label>
                            <input
                              type="text"
                              value={customDudiAddress}
                              onChange={(e) => setCustomDudiAddress(e.target.value)}
                              placeholder="Alamat lengkap dan kota..."
                              required
                              className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 pt-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">
                        4
                      </span>
                      <span>Periode PKL &amp; Catatan Tambahan</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block text-slate-700 font-semibold mb-1">
                          Rencana Tanggal Mulai
                        </label>
                        <input
                          type="date"
                          value={tanggalMulai}
                          onChange={(e) => setTanggalMulai(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-700 font-semibold mb-1">
                          Rencana Tanggal Selesai
                        </label>
                        <input
                          type="date"
                          value={tanggalSelesai}
                          onChange={(e) => setTanggalSelesai(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-slate-700 font-semibold mb-1">
                          Catatan / Keterangan Tambahan Siswa
                        </label>
                        <textarea
                          rows={2}
                          value={catatan}
                          onChange={(e) => setCatatan(e.target.value)}
                          placeholder="Tuliskan keterangan tambahan bila ada..."
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                      </div>
                    </div>
                  </div>

                  {submitError && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      <span>{submitError}</span>
                    </div>
                  )}

                  <div className="pt-3">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {submitting ? (
                        <span>Mengirim ke Google Spreadsheet...</span>
                      ) : (
                        <>
                          <span>Kirim Formulir Pengajuan PKL</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
