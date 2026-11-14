import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  AlertCircle,
  Building2,
  Users,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  KeyRound,
  ChevronRight,
  Save,
  MapPin,
  RefreshCw,
} from 'lucide-react';
import { ToastManager } from '../core/ToastManager';
import { PublicPortalClient } from '../core/PublicPortalClient';

interface TeacherMonitoringPortalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const TeacherMonitoringPortal: React.FC<TeacherMonitoringPortalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Step 1: Petugas & PIN verification
  const [petugasList, setPetugasList] = useState<any[]>([]);
  const [loadingPetugas, setLoadingPetugas] = useState(false);
  const [petugasLoadError, setPetugasLoadError] = useState('');
  const [selectedPetugasId, setSelectedPetugasId] = useState('');
  const [selectedPetugasNama, setSelectedPetugasNama] = useState('');
  const [selectedPetugasNip, setSelectedPetugasNip] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [isPinVerified, setIsPinVerified] = useState(false);
  const [verifyingPin, setVerifyingPin] = useState(false);
  const [pinError, setPinError] = useState('');

  // Step 2: Assigned DUDIs from Google Spreadsheet
  const [assignedDudiList, setAssignedDudiList] = useState<any[]>([]);
  const [loadingDudi, setLoadingDudi] = useState(false);
  const [dudiError, setDudiError] = useState('');
  const [selectedDudi, setSelectedDudi] = useState<any>(null);

  // Step 3: Students placed in the selected DUDI
  const [dudiStudents, setDudiStudents] = useState<any[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentsError, setStudentsError] = useState('');
  const [selectedStudentIndex, setSelectedStudentIndex] = useState(0);

  // 4 Kategori Penilaian Standar Industri
  const [nilaiTeknis, setNilaiTeknis] = useState(85);
  const [nilaiDisiplin, setNilaiDisiplin] = useState(85);
  const [nilaiInisiatif, setNilaiInisiatif] = useState(85);
  const [nilaiK3, setNilaiK3] = useState(85);
  const [kehadiran, setKehadiran] = useState('Hadir');
  const [catatanPerkembangan, setCatatanPerkembangan] = useState('');
  const [tahapMonitoring, setTahapMonitoring] = useState('Tahap 4 (Evaluasi Akhir)');
  const [submitting, setSubmitting] = useState(false);
  const [evaluatedStudentIds, setEvaluatedStudentIds] = useState<Record<string, number>>({});

  const nilaiAkhir = useMemo(() => {
    const raw =
      nilaiTeknis * 0.3 +
      nilaiDisiplin * 0.25 +
      nilaiInisiatif * 0.25 +
      nilaiK3 * 0.2;
    return Math.round(raw * 10) / 10;
  }, [nilaiTeknis, nilaiDisiplin, nilaiInisiatif, nilaiK3]);

  const predikat = useMemo(() => {
    if (nilaiAkhir >= 90) return 'Amat Baik (A)';
    if (nilaiAkhir >= 80) return 'Baik (B)';
    if (nilaiAkhir >= 70) return 'Cukup (C)';
    return 'Kurang (D)';
  }, [nilaiAkhir]);

  useEffect(() => {
    if (isOpen) {
      loadPetugasList();

      try {
        const cached = sessionStorage.getItem('hubin_petugas_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed.petugasId && parsed.nama) {
            setSelectedPetugasId(parsed.petugasId);
            setSelectedPetugasNama(parsed.nama);
            setSelectedPetugasNip(parsed.nip || '');
            setIsPinVerified(true);
            setCurrentStep(2);
            loadAssignedDudi(parsed.nama, parsed.petugasId);
          }
        }
      } catch {
        // ignore
      }
    }
  }, [isOpen]);

  const loadPetugasList = async () => {
    setLoadingPetugas(true);
    setPetugasLoadError('');
    try {
      const json = await PublicPortalClient.getPetugasList();
      if (!json.success) {
        setPetugasList([]);
        setPetugasLoadError('Gagal membaca daftar petugas dari Google Spreadsheet.');
        return;
      }

      const list = Array.isArray(json.data) ? json.data : [];
      setPetugasList(list);
      if (list.length > 0 && !selectedPetugasId) {
        setSelectedPetugasId(list[0].id);
        setSelectedPetugasNama(list[0].nama);
        setSelectedPetugasNip(list[0].nip || '-');
      }
    } catch (e: any) {
      setPetugasList([]);
      setPetugasLoadError(e?.message || 'Tidak dapat terhubung ke Google Spreadsheet.');
    } finally {
      setLoadingPetugas(false);
    }
  };

  const loadAssignedDudi = async (teacherName: string, teacherId: string) => {
    setLoadingDudi(true);
    setDudiError('');
    try {
      const json = await PublicPortalClient.getPetugasDudi(teacherName, teacherId);
      if (!json.success) {
        setAssignedDudiList([]);
        setDudiError('Gagal memuat daftar DUDI bimbingan dari Spreadsheet.');
        return;
      }
      setAssignedDudiList(Array.isArray(json.data) ? json.data : []);
    } catch (e: any) {
      setAssignedDudiList([]);
      setDudiError(e?.message || 'Gagal terhubung ke Google Spreadsheet.');
    } finally {
      setLoadingDudi(false);
    }
  };

  const handleVerifyPin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedPetugasId) {
      setPinError('Pilih nama petugas dari daftar terlebih dahulu.');
      return;
    }

    setVerifyingPin(true);
    setPinError('');

    try {
      const json = await PublicPortalClient.verifyPetugasPin({
        petugas_id: selectedPetugasId,
        nama_petugas: selectedPetugasNama,
        pin: pinInput.trim(),
      });

      if (json.success) {
        const verified = json.verifiedPetugas || {
          id: selectedPetugasId,
          nama: selectedPetugasNama,
          nip: selectedPetugasNip,
        };
        setIsPinVerified(true);
        setPinInput('');
        sessionStorage.setItem(
          'hubin_petugas_cache',
          JSON.stringify({
            petugasId: verified.id,
            nama: verified.nama,
            nip: verified.nip || selectedPetugasNip,
            token: json.sessionToken,
            timestamp: Date.now(),
          })
        );

        await loadAssignedDudi(verified.nama, verified.id);
        setCurrentStep(2);
        ToastManager.getInstance().show(
          'Identitas Terverifikasi',
          'success',
          `Selamat datang, ${verified.nama}`
        );
      } else {
        setPinError(json.message || 'PIN Petugas tidak valid.');
      }
    } catch (e: any) {
      setPinError(e?.message || 'Gagal memverifikasi PIN. Periksa koneksi Anda.');
    } finally {
      setVerifyingPin(false);
    }
  };

  const handleSelectDudi = async (dudi: any) => {
    setSelectedDudi(dudi);
    setCurrentStep(3);
    setLoadingStudents(true);
    setStudentsError('');
    setDudiStudents([]);
    setSelectedStudentIndex(0);

    try {
      const json = await PublicPortalClient.getDudiStudents(
        dudi.nama,
        dudi.id || '',
        selectedPetugasNama
      );
      if (!json.success) {
        setStudentsError('Gagal memuat daftar siswa dari Google Spreadsheet.');
        return;
      }
      setDudiStudents(Array.isArray(json.data) ? json.data : []);
    } catch (e: any) {
      setStudentsError(e?.message || 'Gagal menghubungi Google Spreadsheet.');
    } finally {
      setLoadingStudents(false);
    }
  };

  const handleSaveEvaluation = async () => {
    const activeStudent = dudiStudents[selectedStudentIndex];
    if (!activeStudent || !selectedDudi) return;

    setSubmitting(true);
    try {
      const payload = {
        id_penempatan: activeStudent.idPenempatan || activeStudent.id,
        nis: activeStudent.nis,
        nama_siswa: activeStudent.nama,
        jurusan: activeStudent.jurusan || '',
        dudi_id: selectedDudi.id || '',
        nama_dudi: selectedDudi.nama,
        alamat_dudi: selectedDudi.alamat || '',
        guru_id: selectedPetugasId || '',
        guru_pembimbing: selectedPetugasNama,
        tahap_monitoring: tahapMonitoring,
        tanggal: new Date().toISOString().split('T')[0],
        kehadiran: kehadiran,
        catatan_perkembangan: catatanPerkembangan,
        nilai_teknis: nilaiTeknis,
        nilai_disiplin: nilaiDisiplin,
        nilai_inisiatif: nilaiInisiatif,
        nilai_k3: nilaiK3,
        nilai_rata_rata: nilaiAkhir,
        predikat: predikat,
      };

      const json = await PublicPortalClient.submitMonitoring(payload);

      if (json.success) {
        setEvaluatedStudentIds((prev) => ({
          ...prev,
          [activeStudent.id]: nilaiAkhir,
        }));

        ToastManager.getInstance().show(
          'Nilai Tersimpan ke Spreadsheet!',
          'success',
          `${activeStudent.nama}: Nilai Akhir ${nilaiAkhir} (${predikat})`
        );

        if (onSuccess) onSuccess();

        if (selectedStudentIndex < dudiStudents.length - 1) {
          setSelectedStudentIndex(selectedStudentIndex + 1);
        }
      } else {
        throw new Error(json.message || 'Gagal menyimpan nilai ke Google Spreadsheet');
      }
    } catch (e: any) {
      ToastManager.getInstance().show(
        'Gagal Menyimpan Nilai',
        'error',
        e.message || 'Periksa koneksi dan konfigurasi Apps Script'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handlePetugasLogout = () => {
    try {
      sessionStorage.removeItem('hubin_petugas_cache');
    } catch {
      // ignore
    }
    setIsPinVerified(false);
    setSelectedDudi(null);
    setDudiStudents([]);
    setAssignedDudiList([]);
    setCurrentStep(1);
    setPinInput('');
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                  Portal Supervisi Guru Pembimbing
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  Langkah {currentStep} dari 3
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Data 100% langsung dari Google Spreadsheet (Master Guru &amp; Plotting)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isPinVerified && (
              <button
                type="button"
                onClick={handlePetugasLogout}
                className="px-2.5 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors cursor-pointer"
              >
                Ganti Petugas
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full hover:bg-slate-200/70 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Step Progress Bar */}
        <div className="px-6 py-2.5 bg-slate-100/70 border-b border-slate-200/70 flex items-center justify-between text-xs font-semibold shrink-0">
          <div
            className={`flex items-center gap-2 ${
              currentStep === 1
                ? 'text-blue-700 font-bold'
                : isPinVerified
                ? 'text-emerald-700'
                : 'text-slate-500'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                isPinVerified
                  ? 'bg-emerald-600 text-white'
                  : currentStep === 1
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-300 text-slate-700'
              }`}
            >
              {isPinVerified ? '✓' : '1'}
            </span>
            <span>1. Identitas &amp; PIN</span>
          </div>

          <ChevronRight className="w-4 h-4 text-slate-400" />

          <div
            className={`flex items-center gap-2 ${
              currentStep === 2
                ? 'text-blue-700 font-bold'
                : selectedDudi
                ? 'text-emerald-700'
                : 'text-slate-400'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                selectedDudi
                  ? 'bg-emerald-600 text-white'
                  : currentStep === 2
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {selectedDudi ? '✓' : '2'}
            </span>
            <span>2. DUDI Bimbingan</span>
          </div>

          <ChevronRight className="w-4 h-4 text-slate-400" />

          <div
            className={`flex items-center gap-2 ${
              currentStep === 3 ? 'text-blue-700 font-bold' : 'text-slate-400'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                currentStep === 3
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              3
            </span>
            <span>3. Penilaian 4 Kategori</span>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1">
          {currentStep === 1 && (
            <div className="max-w-md mx-auto space-y-5 py-4 animate-in fade-in duration-150">
              <div className="text-center space-y-1">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto border border-blue-200/80 shadow-2xs">
                  <KeyRound className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  Pilih Nama &amp; Masukkan PIN
                </h3>
                <p className="text-xs text-slate-500">
                  Gunakan 4 digit terakhir NIP / No. WhatsApp terdaftar atau PIN khusus pada sheet Master Guru
                </p>
              </div>

              {petugasLoadError && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-xs text-amber-900">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                    <span>{petugasLoadError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={loadPetugasList}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-amber-300 rounded-lg font-semibold text-amber-800 hover:bg-amber-100 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Muat Ulang</span>
                  </button>
                </div>
              )}

              {pinError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-xs text-rose-700">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                  <span>{pinError}</span>
                </div>
              )}

              <form onSubmit={handleVerifyPin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nama Petugas / Guru Pendamping:
                  </label>
                  <select
                    value={selectedPetugasId}
                    disabled={loadingPetugas || petugasList.length === 0}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedPetugasId(id);
                      const chosen = petugasList.find((p) => p.id === id);
                      if (chosen) {
                        setSelectedPetugasNama(chosen.nama);
                        setSelectedPetugasNip(chosen.nip);
                      }
                      setPinError('');
                    }}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {loadingPetugas ? (
                      <option value="">Memuat daftar guru dari Google Spreadsheet...</option>
                    ) : petugasList.length === 0 ? (
                      <option value="">-- Belum ada data di Master_Guru_Pendamping --</option>
                    ) : (
                      petugasList.map((p, idx) => (
                        <option key={`${p.id || 'petugas'}_${idx}`} value={p.id}>
                          {p.nama} — {p.peran || 'Guru Pendamping'}
                        </option>
                      ))
                    )}
                  </select>
                  {selectedPetugasNip && (
                    <p className="text-[11px] text-slate-500 mt-1">
                      NIP: {selectedPetugasNip}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    PIN Keamanan (4 Digit):
                  </label>
                  <input
                    type="password"
                    maxLength={8}
                    value={pinInput}
                    onChange={(e) => {
                      setPinInput(e.target.value);
                      setPinError('');
                    }}
                    placeholder="4 digit terakhir NIP / WA"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-center text-base tracking-widest font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={verifyingPin || petugasList.length === 0}
                  className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] disabled:opacity-50"
                >
                  {verifyingPin ? (
                    <span>Memverifikasi PIN...</span>
                  ) : (
                    <>
                      <span>Lanjut ke DUDI Bimbingan</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-3.5 bg-blue-50/80 border border-blue-200/80 rounded-2xl flex items-center justify-between text-xs text-blue-900">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    Petugas Aktif: <b>{selectedPetugasNama}</b> (NIP: {selectedPetugasNip})
                  </span>
                </div>
                <span className="text-[11px] text-blue-700 font-semibold">
                  {assignedDudiList.length} DUDI Diampu
                </span>
              </div>

              {loadingDudi ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Memuat daftar DUDI bimbingan dari sheet Plotting_Pemberangkatan...
                </div>
              ) : dudiError ? (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800">
                  {dudiError}
                </div>
              ) : assignedDudiList.length === 0 ? (
                <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-center space-y-2 text-xs text-slate-600">
                  <p className="font-bold text-slate-800">
                    Belum Ada DUDI yang Di-plotting untuk {selectedPetugasNama}
                  </p>
                  <p>
                    Pastikan Admin Hubin sudah menetapkan nama Anda pada sheet <code>Plotting_Pemberangkatan</code> atau <code>Data_Pengajuan_PKL</code> di Google Spreadsheet.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                  {assignedDudiList.map((dudi, idx) => (
                    <div
                      key={`${dudi.id || 'dudi'}_${idx}`}
                      onClick={() => handleSelectDudi(dudi)}
                      className="p-4 rounded-2xl border border-slate-200/90 bg-white hover:border-blue-500 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                            {dudi.bidang}
                          </span>
                          <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                            <span>{dudi.jumlahSiswa ?? dudi.kuota} Siswa</span>
                          </span>
                        </div>

                        <h4 className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                          {dudi.nama}
                        </h4>

                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-2">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{dudi.alamat}</span>
                        </div>
                      </div>

                      <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-[11px] text-slate-500">
                          PIC: <b className="text-slate-700">{dudi.pic}</b>
                        </span>
                        <button
                          type="button"
                          className="px-3 py-1.5 rounded-lg bg-blue-600 group-hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1 transition-all"
                        >
                          <span>Nilai Siswa</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {currentStep === 3 && selectedDudi && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-slate-50 border border-slate-200/90 rounded-2xl">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(2)}
                    className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 flex items-center gap-1 text-xs font-semibold cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Ganti DUDI</span>
                  </button>
                  <div className="text-xs">
                    <span className="text-slate-500 block text-[10px]">DUDI Yang Dipilih:</span>
                    <span className="font-bold text-slate-900">{selectedDudi.nama}</span>
                  </div>
                </div>

                <div className="text-[11px] text-slate-600 flex items-center gap-2">
                  <span>Petugas: <b>{selectedPetugasNama}</b></span>
                  <span>·</span>
                  <span className="text-blue-700 font-bold">
                    {dudiStudents.length} Siswa Terdaftar
                  </span>
                </div>
              </div>

              {loadingStudents ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Memuat daftar siswa di DUDI ini dari Google Spreadsheet...
                </div>
              ) : studentsError ? (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800">
                  {studentsError}
                </div>
              ) : dudiStudents.length === 0 ? (
                <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-center text-xs text-slate-600">
                  Belum ada siswa yang tercatat di-plotting pada DUDI <b>{selectedDudi.nama}</b>.
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-2">
                      Pilih Siswa yang Sedang Dinilai:
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {dudiStudents.map((student, idx) => {
                        const isSelected = selectedStudentIndex === idx;
                        const savedScore = evaluatedStudentIds[student.id];
                        return (
                          <button
                            key={`${student.id || 'stu'}_${idx}`}
                            type="button"
                            onClick={() => setSelectedStudentIndex(idx)}
                            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                              isSelected
                                ? 'border-blue-600 bg-blue-50/70 text-blue-900 ring-2 ring-blue-600/20'
                                : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-mono font-bold text-slate-500">
                                NIS: {student.nis}
                              </span>
                              {savedScore !== undefined && (
                                <span
                                  className="w-2 h-2 rounded-full bg-emerald-500"
                                  title="Sudah Dinilai"
                                />
                              )}
                            </div>
                            <div className="font-bold text-xs truncate mt-1">{student.nama}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              {student.kelas}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {dudiStudents[selectedStudentIndex] && (
                    <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-2">
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">
                            Penilaian: {dudiStudents[selectedStudentIndex].nama}
                          </h4>
                          <p className="text-xs text-slate-500">
                            NIS: {dudiStudents[selectedStudentIndex].nis} · Kelas:{' '}
                            {dudiStudents[selectedStudentIndex].kelas}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <select
                            value={tahapMonitoring}
                            onChange={(e) => setTahapMonitoring(e.target.value)}
                            className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none"
                          >
                            <option value="1. Pengantaran">Tahap 1 (Pengantaran)</option>
                            <option value="2. Monitoring 1">Tahap 2 (Monitoring 1)</option>
                            <option value="3. Monitoring 2">Tahap 3 (Monitoring 2)</option>
                            <option value="4. Monitoring 3 (Nilai & Sertifikat)">
                              Tahap 4 (Evaluasi Akhir)
                            </option>
                            <option value="5. Penarikan">Tahap 5 (Penarikan)</option>
                          </select>

                          <select
                            value={kehadiran}
                            onChange={(e) => setKehadiran(e.target.value)}
                            className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none"
                          >
                            <option value="Hadir">Hadir</option>
                            <option value="Izin">Izin</option>
                            <option value="Sakit">Sakit</option>
                            <option value="Alfa">Alfa</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-xs font-bold text-slate-900 block">
                                1. Kompetensi Teknis &amp; Kejuruan
                              </span>
                              <span className="text-[10px] text-slate-500">
                                Bobot: 30% · Standar SOP &amp; Hasil Praktik
                              </span>
                            </div>
                            <span className="text-sm font-bold font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                              {nilaiTeknis}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={50}
                            max={100}
                            value={nilaiTeknis}
                            onChange={(e) => setNilaiTeknis(Number(e.target.value))}
                            className="w-full accent-blue-600"
                          />
                        </div>

                        <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-xs font-bold text-slate-900 block">
                                2. Kedisiplinan &amp; Etos Kerja
                              </span>
                              <span className="text-[10px] text-slate-500">
                                Bobot: 25% · Presensi, Ketepatan Waktu
                              </span>
                            </div>
                            <span className="text-sm font-bold font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                              {nilaiDisiplin}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={50}
                            max={100}
                            value={nilaiDisiplin}
                            onChange={(e) => setNilaiDisiplin(Number(e.target.value))}
                            className="w-full accent-blue-600"
                          />
                        </div>

                        <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-xs font-bold text-slate-900 block">
                                3. Inisiatif &amp; Tanggung Jawab
                              </span>
                              <span className="text-[10px] text-slate-500">
                                Bobot: 25% · Kemandirian &amp; Kerjasama
                              </span>
                            </div>
                            <span className="text-sm font-bold font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                              {nilaiInisiatif}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={50}
                            max={100}
                            value={nilaiInisiatif}
                            onChange={(e) => setNilaiInisiatif(Number(e.target.value))}
                            className="w-full accent-blue-600"
                          />
                        </div>

                        <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-xs font-bold text-slate-900 block">
                                4. Keselamatan Kerja (K3LH)
                              </span>
                              <span className="text-[10px] text-slate-500">
                                Bobot: 20% · Penggunaan APD &amp; Kebersihan
                              </span>
                            </div>
                            <span className="text-sm font-bold font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                              {nilaiK3}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={50}
                            max={100}
                            value={nilaiK3}
                            onChange={(e) => setNilaiK3(Number(e.target.value))}
                            className="w-full accent-blue-600"
                          />
                        </div>
                      </div>

                      <div className="p-4 bg-blue-50/70 border border-blue-200/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <span className="text-xs text-slate-600 block">
                            Kalkulasi Nilai Akhir Otomatis:
                          </span>
                          <div className="flex items-baseline gap-2 mt-0.5">
                            <span className="text-2xl font-bold font-mono text-blue-700">
                              {nilaiAkhir}
                            </span>
                            <span className="text-xs font-bold text-slate-700">
                              Predikat: <b className="text-emerald-700">{predikat}</b>
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={handleSaveEvaluation}
                          disabled={submitting}
                          className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] disabled:opacity-50"
                        >
                          {submitting ? (
                            <span>Menyimpan ke Spreadsheet...</span>
                          ) : (
                            <>
                              <Save className="w-4 h-4" />
                              <span>Simpan Nilai Siswa Ini</span>
                            </>
                          )}
                        </button>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Catatan Pembimbing / Evaluasi DUDI:
                        </label>
                        <textarea
                          rows={2}
                          value={catatanPerkembangan}
                          onChange={(e) => setCatatanPerkembangan(e.target.value)}
                          placeholder="Tuliskan catatan supervisi atau perkembangan siswa di DUDI..."
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-500">
            {currentStep === 3 && dudiStudents.length > 0 && (
              <span>
                Siswa ke-{selectedStudentIndex + 1} dari {dudiStudents.length}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
