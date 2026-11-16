import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  FileText,
  Printer,
  ShieldCheck,
  Building2,
  UserCheck,
  Phone,
  MapPin,
} from 'lucide-react';
import { GoogleSheetClient } from '../core/GoogleSheetClient';
import { PublicPortalClient } from '../core/PublicPortalClient';
import { ToastManager } from '../core/ToastManager';

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

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Step 1: NIS Search & Identity Confirmation
  const [nisInput, setNisInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [studentData, setStudentData] = useState<any>(null);
  const [searchError, setSearchError] = useState('');
  const [identityStatus, setIdentityStatus] = useState<'pending' | 'confirmed' | 'mismatch'>('pending');

  // Step 2: Student & Parent Bio
  const [telepon, setTelepon] = useState('');
  const [alamatDomisili, setAlamatDomisili] = useState('');
  const [namaOrtu, setNamaOrtu] = useState('');
  const [teleponOrtu, setTeleponOrtu] = useState('');
  const [bioError, setBioError] = useState('');

  // Step 3: DUDI Selection + Bio DUDI + Pemimpin / PIC / Telp DUDI
  const [dudiList, setDudiList] = useState<any[]>([]);
  const [loadingDudi, setLoadingDudi] = useState(false);
  const [dudiLoadError, setDudiLoadError] = useState('');
  const [selectedDudiId, setSelectedDudiId] = useState('');
  const [isDudiUnregistered, setIsDudiUnregistered] = useState(false);
  const [selectedDudiMeta, setSelectedDudiMeta] = useState<any>(null);
  const [customDudiName, setCustomDudiName] = useState('');
  const [customDudiAddress, setCustomDudiAddress] = useState('');
  const [customDudiField, setCustomDudiField] = useState('');
  const [namaPemimpinDudi, setNamaPemimpinDudi] = useState('');
  const [namaPicDudi, setNamaPicDudi] = useState('');
  const [noTelpDudi, setNoTelpDudi] = useState('');

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
        const msg = 'Gagal membaca daftar DUDI dari Cloud Server.';
        setDudiList([]);
        setDudiLoadError(msg);
        ToastManager.getInstance().show('Gagal Memuat DUDI', 'error', msg);
        return;
      }
      setDudiList(Array.isArray(json.data) ? json.data : []);
    } catch (e: any) {
      const msg = e?.message || 'Tidak dapat terhubung ke Cloud Server.';
      setDudiList([]);
      setDudiLoadError(msg);
      ToastManager.getInstance().show('Gagal Memuat DUDI', 'error', msg);
    } finally {
      setLoadingDudi(false);
    }
  };

  const resetForm = () => {
    setCurrentStep(1);
    setNisInput('');
    setStudentData(null);
    setSearchError('');
    setIdentityStatus('pending');
    setTelepon('');
    setAlamatDomisili('');
    setNamaOrtu('');
    setTeleponOrtu('');
    setBioError('');
    setSelectedDudiId('');
    setIsDudiUnregistered(false);
    setSelectedDudiMeta(null);
    setCustomDudiName('');
    setCustomDudiAddress('');
    setCustomDudiField('');
    setNamaPemimpinDudi('');
    setNamaPicDudi('');
    setNoTelpDudi('');
    setSubmitError('');
    setSubmissionResult(null);
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
    setIdentityStatus('pending');

    try {
      const json = await PublicPortalClient.lookupStudentByNis(nis);

      if (!json.success) {
        const msg = json.message || 'Gagal mengakses data siswa di Cloud Server.';
        setSearchError(msg);
        ToastManager.getInstance().show('Gagal Mencari NIS', 'error', msg);
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
          json.message || `Siswa dengan NIS [${nis}] tidak ditemukan di Database Sekolah.`
        );
      }
    } catch (e: any) {
      const msg = e?.message || 'Gagal mencari NIS. Periksa koneksi internet Anda.';
      setSearchError(msg);
      ToastManager.getInstance().show('Gagal Mencari NIS', 'error', msg);
    } finally {
      setSearching(false);
    }
  };

  const handleConfirmIdentity = (isMatch: boolean) => {
    if (isMatch) {
      setIdentityStatus('confirmed');
      setCurrentStep(2);
    } else {
      setIdentityStatus('mismatch');
    }
  };

  const handleValidateBioAndNext = () => {
    setBioError('');
    const waDigits = telepon.replace(/\D/g, '');
    const parentWaDigits = teleponOrtu.replace(/\D/g, '');

    if (!telepon.trim() || waDigits.length < 9) {
      setBioError('Nomor WhatsApp Siswa wajib diisi dengan benar (minimal 9 digit angka).');
      return;
    }
    if (!namaOrtu.trim()) {
      setBioError('Nama Orang Tua / Wali wajib diisi.');
      return;
    }
    if (!alamatDomisili.trim()) {
      setBioError('Alamat Domisili Siswa wajib diisi lengkap.');
      return;
    }
    if (!teleponOrtu.trim() || parentWaDigits.length < 9) {
      setBioError('Nomor Telepon / WhatsApp Orang Tua wajib diisi dengan benar (minimal 9 digit angka).');
      return;
    }

    setCurrentStep(3);
  };

  const handleDudiChange = (val: string) => {
    setSelectedDudiId(val);
    setSubmitError('');

    if (!val) {
      setIsDudiUnregistered(false);
      setSelectedDudiMeta(null);
      setCustomDudiName('');
      setCustomDudiAddress('');
      setCustomDudiField('');
      setNamaPemimpinDudi('');
      setNamaPicDudi('');
      setNoTelpDudi('');
      return;
    }

    if (val === 'unregistered') {
      setIsDudiUnregistered(true);
      setSelectedDudiMeta(null);
      setCustomDudiName('');
      setCustomDudiAddress('');
      setCustomDudiField('');
      setNamaPemimpinDudi('');
      setNamaPicDudi('');
      setNoTelpDudi('');
    } else {
      setIsDudiUnregistered(false);
      const chosen = dudiList.find((d) => d.id === val);
      setSelectedDudiMeta(chosen || null);
      if (chosen) {
        setCustomDudiName(chosen.nama_dudi || '');
        setCustomDudiAddress(chosen.alamat || chosen.kota || '');
        setCustomDudiField(chosen.bidang_usaha || '');
        setNamaPemimpinDudi(chosen.nama_pemimpin || '');
        setNamaPicDudi(chosen.nama_pic || '');
        setNoTelpDudi(chosen.no_telp_dudi || chosen.kontak_pic || chosen.telepon || '');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    if (!studentData || identityStatus !== 'confirmed') {
      setCurrentStep(1);
      setSearchError('Harap cari NIS dan konfirmasi kesesuaian data terlebih dahulu.');
      return;
    }

    if (!selectedDudiId) {
      setSubmitError('Silakan pilih DUDI tujuan Anda.');
      return;
    }

    if (isDudiUnregistered && !customDudiName.trim()) {
      setSubmitError('Silakan ketik nama perusahaan / DUDI yang dituju.');
      return;
    }

    if (isDudiUnregistered && !customDudiAddress.trim()) {
      setSubmitError('Silakan ketik alamat lengkap perusahaan / DUDI.');
      return;
    }

    if (!namaPemimpinDudi.trim()) {
      setSubmitError('Nama Pemimpin DUDI wajib diisi.');
      return;
    }

    if (!namaPicDudi.trim()) {
      setSubmitError('Nama PIC / Pendamping DUDI wajib diisi.');
      return;
    }

    const dudiPhoneDigits = noTelpDudi.replace(/\D/g, '');
    if (!noTelpDudi.trim() || dudiPhoneDigits.length < 7) {
      setSubmitError('No. Telp DUDI wajib diisi dengan nomor yang valid.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        nis: studentData.nis,
        nama: studentData.nama,
        kelas: studentData.kelas,
        jurusan: studentData.jurusan,
        telepon: telepon.trim(),
        alamat_domisili: alamatDomisili.trim(),
        nama_orang_tua: namaOrtu.trim(),
        telepon_orang_tua: teleponOrtu.trim(),
        dudi_id: isDudiUnregistered ? 'custom_hubin' : selectedDudiId,
        nama_dudi: customDudiName.trim(),
        alamat_dudi: customDudiAddress.trim(),
        bidang_dudi: customDudiField.trim() || '-',
        nama_pemimpin: namaPemimpinDudi.trim(),
        nama_pic: namaPicDudi.trim(),
        no_telp_dudi: noTelpDudi.trim(),
        is_dudi_unregistered: isDudiUnregistered,
      };

      const json = await PublicPortalClient.submitApplication(payload);

      if (json.success && json.application) {
        setSubmissionResult(json.application);
      } else {
        setSubmitError(
          json.message || 'Gagal mengirim pengajuan ke Cloud Server. Hubungi Admin Hubin.'
        );
      }
    } catch (e: any) {
      setSubmitError(e?.message || 'Gagal mengirim pengajuan. Periksa koneksi internet Anda.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                Portal Pengajuan PKL Siswa Mandiri
              </h2>
              <p className="text-xs text-slate-500 truncate">
                Tahun Ajaran {activeYear} · Terhubung Cloud Server Sekolah
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup portal pengajuan"
            className="min-w-[40px] min-h-[40px] rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step Indicator */}
        {!submissionResult && (
          <div className="px-5 sm:px-6 py-3 bg-slate-50 border-b border-slate-200/70 flex items-center justify-between gap-2 text-xs font-semibold shrink-0 overflow-x-auto">
            <div
              className={`flex items-center gap-2 whitespace-nowrap ${
                currentStep === 1
                  ? 'text-blue-700 font-bold'
                  : identityStatus === 'confirmed'
                  ? 'text-emerald-700'
                  : 'text-slate-500'
              }`}
            >
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                  currentStep > 1 && identityStatus === 'confirmed'
                    ? 'bg-emerald-600 text-white'
                    : currentStep === 1
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {currentStep > 1 && identityStatus === 'confirmed' ? '✓' : '1'}
              </span>
              <span>Cek &amp; Konfirmasi NIS</span>
            </div>

            <span className="text-slate-300" aria-hidden="true">
              /
            </span>

            <div
              className={`flex items-center gap-2 whitespace-nowrap ${
                currentStep === 2
                  ? 'text-blue-700 font-bold'
                  : currentStep > 2
                  ? 'text-emerald-700'
                  : 'text-slate-400'
              }`}
            >
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                  currentStep > 2
                    ? 'bg-emerald-600 text-white'
                    : currentStep === 2
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {currentStep > 2 ? '✓' : '2'}
              </span>
              <span>Bio Siswa &amp; Ortu</span>
            </div>

            <span className="text-slate-300" aria-hidden="true">
              /
            </span>

            <div
              className={`flex items-center gap-2 whitespace-nowrap ${
                currentStep === 3 ? 'text-blue-700 font-bold' : 'text-slate-400'
              }`}
            >
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                  currentStep === 3
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                3
              </span>
              <span>Pilih &amp; Bio DUDI</span>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5">
          {submissionResult ? (
            <div className="py-4 text-center space-y-5 animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-slate-900">
                  Pengajuan PKL Berhasil Dikirim!
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Data pengajuan Anda beserta bio DUDI telah tercatat langsung di Cloud Server Pokja Hubin SMK PGRI 2 Ponorogo.
                </p>
              </div>

              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-left max-w-lg mx-auto space-y-2 text-xs">
                <div className="flex justify-between gap-3 py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Nomor Registrasi</span>
                  <span className="font-mono font-bold text-blue-600">{submissionResult.id}</span>
                </div>
                <div className="flex justify-between gap-3 py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Nama Siswa</span>
                  <span className="font-bold text-slate-800 text-right">
                    {submissionResult.nama_siswa} ({submissionResult.nis})
                  </span>
                </div>
                <div className="flex justify-between gap-3 py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Kelas / Jurusan</span>
                  <span className="font-semibold text-slate-700 text-right">
                    {submissionResult.kelas} - {submissionResult.jurusan}
                  </span>
                </div>
                <div className="flex justify-between gap-3 py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">DUDI Pilihan</span>
                  <span className="font-bold text-indigo-700 text-right">{submissionResult.nama_dudi}</span>
                </div>
                <div className="flex justify-between gap-3 py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Pemimpin DUDI</span>
                  <span className="font-semibold text-slate-800 text-right">
                    {submissionResult.Nama_Pemimpin || '-'}
                  </span>
                </div>
                <div className="flex justify-between gap-3 py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">PIC / Pendamping</span>
                  <span className="font-semibold text-slate-800 text-right">
                    {submissionResult.Nama_PIC || '-'}
                  </span>
                </div>
                <div className="flex justify-between gap-3 py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">No. Telp DUDI</span>
                  <span className="font-mono font-semibold text-slate-800 text-right">
                    {submissionResult.No_Telp_DUDI || '-'}
                  </span>
                </div>
                <div className="flex justify-between gap-3 py-1">
                  <span className="text-slate-500">Status Saat Ini</span>
                  <span className="font-semibold text-amber-600">{submissionResult.status}</span>
                </div>
              </div>

              <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-2xl text-xs text-blue-900 max-w-lg mx-auto text-left flex items-start gap-3">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <b>Langkah Selanjutnya:</b> Cetak berkas rekomendasi dan mintakan persetujuan Ketua Konsentrasi Keahlian (Kakomli) jurusan Anda.
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                {onSuccessOpenDocs && (
                  <button
                    type="button"
                    onClick={() => {
                      onSuccessOpenDocs(submissionResult);
                      onClose();
                    }}
                    className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Cetak Lembar Rekomendasi Kakomli</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={resetForm}
                  className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
                >
                  Ajukan untuk Siswa Lain
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* STEP 1: CARI NIS & KONFIRMASI KESESUAIAN DATA */}
              {currentStep === 1 && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="bg-slate-50/90 rounded-2xl p-4 sm:p-5 border border-slate-200/80 space-y-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Langkah 1: Cari &amp; Verifikasi Data NIS
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Masukkan Nomor Induk Siswa (NIS) Anda yang terdaftar di sekolah untuk memeriksa kecocokan data.
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
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
                          className="w-full min-h-[44px] pl-10 pr-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-white font-mono"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleLookupNis()}
                        disabled={searching}
                        className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors shrink-0 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {searching ? (
                          <span>Mencari...</span>
                        ) : (
                          <>
                            <Search className="w-3.5 h-3.5" />
                            <span>Cari Data NIS</span>
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
                  </div>

                  {studentData && (
                    <div className="p-4 sm:p-5 bg-white border border-slate-200 rounded-2xl space-y-4 shadow-2xs animate-in fade-in duration-150">
                      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                        <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                          <UserCheck className="w-4 h-4 text-blue-600" />
                          <span>Data Siswa Terverifikasi di Server</span>
                        </div>
                        <span className="text-xs font-mono font-semibold text-slate-500">
                          NIS: {studentData.nis}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div className="p-3 rounded-xl bg-slate-50">
                          <span className="text-slate-500 block text-[11px]">Nama Lengkap</span>
                          <span className="font-bold text-slate-900 text-sm">{studentData.nama}</span>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-50">
                          <span className="text-slate-500 block text-[11px]">NIK</span>
                          <span className="font-mono font-semibold text-slate-800">{studentData.nik || '-'}</span>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-50">
                          <span className="text-slate-500 block text-[11px]">Kelas</span>
                          <span className="font-bold text-slate-800">{studentData.kelas}</span>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-50">
                          <span className="text-slate-500 block text-[11px]">Kompetensi Keahlian</span>
                          <span className="font-bold text-slate-800">{studentData.jurusan}</span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100 space-y-3">
                        <p className="text-xs font-bold text-slate-800">
                          Apakah data identitas Anda di atas sudah sesuai?
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <button
                            type="button"
                            onClick={() => handleConfirmIdentity(false)}
                            className={`min-h-[44px] px-4 py-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                              identityStatus === 'mismatch'
                                ? 'border-rose-400 bg-rose-50 text-rose-800'
                                : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            Belum Sesuai
                          </button>
                          <button
                            type="button"
                            onClick={() => handleConfirmIdentity(true)}
                            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Ya, Data Sudah Sesuai &amp; Lanjut</span>
                          </button>
                        </div>

                        {identityStatus === 'mismatch' && (
                          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-2">
                            <p className="font-bold">Data Belum Sesuai?</p>
                            <p className="leading-relaxed">
                              Silakan hubungi Wali Kelas atau Admin Pokja Hubin untuk memperbarui data Anda di{' '}
                              <span className="font-semibold">Database Siswa Sekolah</span> sebelum melanjutkan pengajuan PKL, atau periksa kembali NIS yang Anda ketik.
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setStudentData(null);
                                setIdentityStatus('pending');
                                setNisInput('');
                              }}
                              className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-900 font-semibold hover:bg-amber-100 cursor-pointer"
                            >
                              Cari Ulang NIS
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 2: INPUT BIO SISWA & ORANG TUA */}
              {currentStep === 2 && studentData && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="p-3.5 bg-blue-50/80 border border-blue-200/80 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs text-blue-900">
                    <div>
                      <span className="font-bold">{studentData.nama}</span>
                      <span className="text-blue-700"> · NIS {studentData.nis} · {studentData.kelas}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCurrentStep(1)}
                      className="text-blue-700 font-semibold hover:underline cursor-pointer"
                    >
                      Ganti Siswa
                    </button>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Langkah 2: Lengkapi Bio Siswa &amp; Orang Tua / Wali
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Lengkapi seluruh data kontak dan domisili berikut untuk keperluan surat izin orang tua dan komunikasi pembimbing.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1.5">
                        Nomor WhatsApp Siswa *
                      </label>
                      <input
                        type="tel"
                        inputMode="tel"
                        value={telepon}
                        onChange={(e) => {
                          setTelepon(e.target.value);
                          setBioError('');
                        }}
                        placeholder="08xxxxxxxxxx"
                        required
                        className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1.5">
                        Nama Orang Tua / Wali *
                      </label>
                      <input
                        type="text"
                        value={namaOrtu}
                        onChange={(e) => {
                          setNamaOrtu(e.target.value);
                          setBioError('');
                        }}
                        placeholder="Nama lengkap orang tua / wali"
                        required
                        className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-slate-700 font-semibold mb-1.5">
                        Alamat Domisili Siswa *
                      </label>
                      <input
                        type="text"
                        value={alamatDomisili}
                        onChange={(e) => {
                          setAlamatDomisili(e.target.value);
                          setBioError('');
                        }}
                        placeholder="Jalan, RT/RW, Desa/Kelurahan, Kecamatan, Kabupaten"
                        required
                        className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-slate-700 font-semibold mb-1.5">
                        Nomor Telepon / WhatsApp Orang Tua (Kontak Darurat) *
                      </label>
                      <input
                        type="tel"
                        inputMode="tel"
                        value={teleponOrtu}
                        onChange={(e) => {
                          setTeleponOrtu(e.target.value);
                          setBioError('');
                        }}
                        placeholder="08xxxxxxxxxx"
                        required
                        className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </div>

                  {bioError && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      <span>{bioError}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(1)}
                      className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Kembali</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleValidateBioAndNext}
                      className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs flex items-center gap-2 cursor-pointer"
                    >
                      <span>Lanjut Pilih DUDI</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: PILIH DUDI & LENGKAPI BIO DUDI + PEMIMPIN / PIC / NO. TELP DUDI */}
              {currentStep === 3 && studentData && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Langkah 3: Pilih DUDI &amp; Lengkapi Bio DUDI
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Pilih lokasi DUDI tujuan Anda, lalu periksa bio DUDI serta lengkapi data Pemimpin, PIC/Pendamping, dan No. Telp DUDI.
                    </p>
                  </div>

                  {dudiLoadError && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                      {dudiLoadError}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Pilih Mitra DUDI Tujuan *
                    </label>
                    <select
                      value={selectedDudiId}
                      onChange={(e) => handleDudiChange(e.target.value)}
                      disabled={loadingDudi}
                      required
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
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

                  {/* Muncul Bio DUDI + Input Pemimpin, PIC, & No. Telp setelah memilih DUDI */}
                  {selectedDudiId && (
                    <div className="space-y-4 p-4 rounded-2xl border border-slate-200 bg-slate-50/70 animate-in fade-in duration-150">
                      {isDudiUnregistered ? (
                        <div className="space-y-3">
                          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            <span>
                              <b>DUDI Belum Terdaftar:</b> Lengkapi profil tempat PKL baru di bawah ini agar dapat diverifikasi Pokja Hubin dan Kakomli.
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                            <div className="sm:col-span-2">
                              <label className="block font-semibold text-slate-700 mb-1">
                                Nama Perusahaan / Bengkel / Instansi *
                              </label>
                              <input
                                type="text"
                                value={customDudiName}
                                onChange={(e) => setCustomDudiName(e.target.value)}
                                placeholder="Contoh: PT Maju Teknik Ponorogo"
                                required
                                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block font-semibold text-slate-700 mb-1">
                                Alamat Lengkap DUDI *
                              </label>
                              <input
                                type="text"
                                value={customDudiAddress}
                                onChange={(e) => setCustomDudiAddress(e.target.value)}
                                placeholder="Jalan, Kecamatan, Kota/Kabupaten"
                                required
                                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block font-semibold text-slate-700 mb-1">
                                Bidang Usaha / Keahlian
                              </label>
                              <input
                                type="text"
                                value={customDudiField}
                                onChange={(e) => setCustomDudiField(e.target.value)}
                                placeholder="Contoh: Servis Mobil, Jaringan Komputer, Desain Grafis"
                                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        selectedDudiMeta && (
                          <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-2 text-xs">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 font-bold text-slate-900">
                                <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
                                <span>Bio DUDI: {selectedDudiMeta.nama_dudi}</span>
                              </div>
                              <span className="font-mono text-[11px] font-semibold text-slate-600 shrink-0">
                                Kuota: {selectedDudiMeta.terisi ?? 0}/{selectedDudiMeta.kuota_maksimal || '-'}
                              </span>
                            </div>
                            <div className="text-slate-600 flex items-start gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                              <span>
                                {selectedDudiMeta.alamat || '-'}
                                {selectedDudiMeta.kota ? ` · ${selectedDudiMeta.kota}` : ''}
                              </span>
                            </div>
                            <div className="text-slate-500">
                              Bidang Usaha: <b className="text-slate-700">{selectedDudiMeta.bidang_usaha || '-'}</b>
                              {' · '}
                              Status: <b className="text-slate-700">{selectedDudiMeta.status || 'Aktif'}</b>
                            </div>
                          </div>
                        )
                      )}

                      {/* Input Pemimpin, PIC/Pendamping DUDI, dan No. Telp DUDI */}
                      <div className="pt-1 border-t border-slate-200/80 space-y-3">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                          <Phone className="w-3.5 h-3.5 text-blue-600" />
                          <span>Data Penanggung Jawab &amp; Kontak DUDI</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">
                              Nama Pemimpin DUDI *
                            </label>
                            <input
                              type="text"
                              value={namaPemimpinDudi}
                              onChange={(e) => setNamaPemimpinDudi(e.target.value)}
                              placeholder="Direktur / Kepala Bengkel / Pemilik"
                              required
                              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                            />
                          </div>
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">
                              Nama PIC / Pendamping DUDI *
                            </label>
                            <input
                              type="text"
                              value={namaPicDudi}
                              onChange={(e) => setNamaPicDudi(e.target.value)}
                              placeholder="Nama pembimbing lapangan / HRD"
                              required
                              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block font-semibold text-slate-700 mb-1">
                              No. Telp / WhatsApp DUDI *
                            </label>
                            <input
                              type="tel"
                              inputMode="tel"
                              value={noTelpDudi}
                              onChange={(e) => setNoTelpDudi(e.target.value)}
                              placeholder="0352-xxxxxx atau 08xxxxxxxxxx"
                              required
                              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {submitError && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      <span>{submitError}</span>
                    </div>
                  )}

                  <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(2)}
                      className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Kembali</span>
                    </button>
                    <button
                      type="submit"
                      disabled={submitting || !selectedDudiId}
                      className="min-h-[44px] px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {submitting ? (
                        <span>Mengirim ke Cloud Server...</span>
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
