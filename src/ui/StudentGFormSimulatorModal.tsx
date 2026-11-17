import React, { useState, useEffect } from 'react';
import { X, Sparkles, Send, CheckCircle2, AlertCircle, User, Lock, RefreshCw } from 'lucide-react';
import { Jurusan, Kelas, Siswa } from '../core/types/schema';
import { JurusanService } from '../services/JurusanService';
import { KelasService } from '../services/KelasService';
import { SiswaService } from '../services/SiswaService';
import { PengajuanService } from '../services/PengajuanService';
import { ToastManager } from '../core/ToastManager';
import { getTodayWibDateTime } from '../core/utils/dateHelpers';
import { formatNisVisual, stripNisSymbols } from '../core/utils/nisHelpers';

interface StudentGFormSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFormSubmitted: () => void;
}

export const StudentGFormSimulatorModal: React.FC<StudentGFormSimulatorModalProps> = ({
  isOpen,
  onClose,
  onFormSubmitted,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [jurusanList, setJurusanList] = useState<Jurusan[]>([]);
  const [kelasList, setKelasList] = useState<Kelas[]>([]);
  const [siswaList, setSiswaList] = useState<Siswa[]>([]);
  const [loadingMaster, setLoadingMaster] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedJurusan, setSelectedJurusan] = useState<string>('');
  const [selectedKelas, setSelectedKelas] = useState<string>('');
  const [selectedNama, setSelectedNama] = useState<string>('');
  const [pinVerification, setPinVerification] = useState<string>('');

  // Step 4: DUDI details
  const [dudiTujuan, setDudiTujuan] = useState<string>('');
  const [alamatDudi, setAlamatDudi] = useState<string>('');
  const [bidangPekerjaan, setBidangPekerjaan] = useState<string>('');
  const [noWa, setNoWa] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [submittedData, setSubmittedData] = useState<any>(null);

  const loadLiveMasterData = async () => {
    setLoadingMaster(true);
    setLoadError(null);
    try {
      const [jur, kls, sis] = await Promise.all([
        JurusanService.getInstance().getAll(),
        KelasService.getInstance().getAll(),
        SiswaService.getInstance().getAll(),
      ]);
      setJurusanList(jur);
      setKelasList(kls);
      setSiswaList(sis);
    } catch (err: any) {
      setLoadError(err?.message || 'Gagal membaca master data dari Cloud Server.');
    } finally {
      setLoadingMaster(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadLiveMasterData();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Filter classes by selected jurusan
  const availableClasses = kelasList.filter((k) => k.jurusan === selectedJurusan);

  // Filter students by selected class
  const availableStudents = siswaList.filter(
    (s) => s.kelas === selectedKelas && (!s.statusPKL || s.statusPKL === 'Belum Daftar')
  );

  const matchedStudent = siswaList.find(
    (s) => s.nama === selectedNama && (!selectedKelas || s.kelas === selectedKelas)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matchedStudent) {
      ToastManager.getInstance().show(
        'Siswa Belum Dipilih',
        'error',
        'Pilih siswa yang terdaftar di Database Siswa terlebih dahulu.'
      );
      return;
    }

    setLoading(true);
    try {
      const pengajuanService = PengajuanService.getInstance();
      const siswaService = SiswaService.getInstance();

      const kodeJurusan =
        jurusanList.find((j) => j.nama === selectedJurusan)?.kode ||
        matchedStudent.jurusan.substring(0, 3).toUpperCase() ||
        'SMK';
      const newNoPengajuan = `REQ-${new Date().getFullYear()}-${kodeJurusan}-${Math.floor(100 + Math.random() * 900)}`;
      const timestamp = getTodayWibDateTime();
      const cleanNis = stripNisSymbols(matchedStudent.nis) || matchedStudent.nis;

      const created = await pengajuanService.create({
        noPengajuan: newNoPengajuan,
        timestamp,
        nis: cleanNis,
        namaSiswa: matchedStudent.nama,
        jurusan: selectedJurusan,
        kelas: selectedKelas,
        dudiTujuan,
        alamatDudi,
        bidangPekerjaan,
        noWa,
        statusKakomli: 'Pending',
        catatanKakomli: 'Menunggu review relevansi kompetensi oleh Kakomli.',
        statusHubin: 'Menunggu ACC Kakomli',
      });

      await siswaService.updateStatusPKL(cleanNis, 'Diajukan');

      setSubmittedData(created);
      setStep(5);
      onFormSubmitted();
    } catch (err: any) {
      ToastManager.getInstance().show(
        'Gagal Menyimpan ke Cloud Server',
        'error',
        err?.message || 'Periksa koneksi dan konfigurasi Cloud Server Anda.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedJurusan('');
    setSelectedKelas('');
    setSelectedNama('');
    setPinVerification('');
    setDudiTujuan('');
    setAlamatDudi('');
    setBidangPekerjaan('');
    setNoWa('');
    setSubmittedData(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
        {/* Google Form Header Brand */}
        <div className="bg-purple-700 text-white p-5 border-b border-purple-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-purple-600 rounded-lg">
                <Sparkles className="w-5 h-5 text-purple-200" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-widest text-purple-200 bg-purple-800/60 px-2 py-0.5 rounded">
                  Simulasi Pengajuan Cloud Server
                </span>
                <h3 className="text-base font-bold mt-1">
                  Pengajuan PKL Siswa SMK PGRI 2 Ponorogo
                </h3>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-purple-200 hover:text-white hover:bg-purple-600 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-xs text-purple-100 mt-2">
            Mekanisme Section Bertingkat: <b>Jurusan &rarr; Kelas &rarr; Nama Dropdown (Live Cloud Server)</b>
          </p>
        </div>

        {/* Form Body */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-50">
          {loadingMaster ? (
            <div className="bg-white p-8 rounded-xl border border-slate-200 text-center space-y-3">
              <RefreshCw className="w-6 h-6 text-purple-600 animate-spin mx-auto" />
              <p className="text-xs font-semibold text-slate-600">
                Memuat data Master Jurusan, Kelas, dan Siswa langsung dari Cloud Server...
              </p>
            </div>
          ) : loadError ? (
            <div className="bg-white p-6 rounded-xl border border-rose-200 space-y-3 text-xs text-rose-800">
              <div className="flex items-center gap-2 font-bold">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                <span>Gagal Membaca Data Cloud Server</span>
              </div>
              <p className="text-rose-700">{loadError}</p>
              <button
                type="button"
                onClick={loadLiveMasterData}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold"
              >
                Coba Muat Ulang
              </button>
            </div>
          ) : (
            <>
              {step === 1 && (
                <div className="space-y-4 bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="border-b border-slate-100 pb-2">
                    <span className="text-xs font-bold text-purple-700 uppercase">Section 1 dari 4</span>
                    <h4 className="text-sm font-bold text-slate-800 mt-0.5">
                      Pilih Kompetensi Keahlian (Jurusan) Anda:
                    </h4>
                  </div>
                  <div className="space-y-2">
                    {jurusanList.length > 0 ? (
                      jurusanList.map((j, idx) => (
                        <label
                          key={`${j.id || j.kode || 'jur'}_${idx}`}
                          className={`flex items-center justify-between p-3 rounded-lg border text-xs font-semibold cursor-pointer transition-all ${
                            selectedJurusan === j.nama
                              ? 'bg-purple-50 border-purple-600 text-purple-900 shadow-xs'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <input
                              type="radio"
                              name="jurusan"
                              checked={selectedJurusan === j.nama}
                              onChange={() => {
                                setSelectedJurusan(j.nama);
                                setSelectedKelas('');
                                setSelectedNama('');
                              }}
                              className="text-purple-600 focus:ring-purple-500"
                            />
                            <span>{j.nama}</span>
                          </div>
                          <span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] text-slate-500 font-mono">
                            {j.kode}
                          </span>
                        </label>
                      ))
                    ) : (
                      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                        Data <b>Kompetensi Keahlian</b> di Cloud Server masih kosong. Tambahkan data jurusan terlebih dahulu.
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end pt-3">
                    <button
                      type="button"
                      disabled={!selectedJurusan}
                      onClick={() => setStep(2)}
                      className="px-5 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-xs font-bold shadow-xs disabled:opacity-40 transition-all cursor-pointer"
                    >
                      Lanjut ke Pemilihan Kelas &rarr;
                    </button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4 bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="border-b border-slate-100 pb-2">
                    <span className="text-xs font-bold text-purple-700 uppercase">Section 2 dari 4</span>
                    <h4 className="text-sm font-bold text-slate-800 mt-0.5">
                      Pilih Rombel / Kelas ({selectedJurusan}):
                    </h4>
                  </div>
                  <div className="space-y-2">
                    {availableClasses.length > 0 ? (
                      availableClasses.map((k, idx) => (
                        <label
                          key={`${k.id || k.namaKelas || 'kls'}_${idx}`}
                          className={`flex items-center justify-between p-3 rounded-lg border text-xs font-semibold cursor-pointer transition-all ${
                            selectedKelas === k.namaKelas
                              ? 'bg-purple-50 border-purple-600 text-purple-900 shadow-xs'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <input
                              type="radio"
                              name="kelas"
                              checked={selectedKelas === k.namaKelas}
                              onChange={() => {
                                setSelectedKelas(k.namaKelas);
                                setSelectedNama('');
                              }}
                              className="text-purple-600 focus:ring-purple-500"
                            />
                            <span>{k.namaKelas}</span>
                          </div>
                          <span className="text-[11px] text-slate-500">
                            Walas: {k.waliKelas}
                          </span>
                        </label>
                      ))
                    ) : (
                      <div className="p-4 bg-amber-50 rounded-lg text-xs text-amber-800">
                        Tidak ada rombel terdaftar di Database Kelas untuk jurusan {selectedJurusan}.
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between pt-3">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
                    >
                      &larr; Kembali
                    </button>
                    <button
                      type="button"
                      disabled={!selectedKelas}
                      onClick={() => setStep(3)}
                      className="px-5 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-xs font-bold shadow-xs disabled:opacity-40 transition-all cursor-pointer"
                    >
                      Lanjut ke Pilih Nama Siswa &rarr;
                    </button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4 bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="border-b border-slate-100 pb-2">
                    <span className="text-xs font-bold text-purple-700 uppercase">Section 3 dari 4</span>
                    <h4 className="text-sm font-bold text-slate-800 mt-0.5">
                      Pilih Nama Resmi Siswa dari Database Siswa:
                    </h4>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nama Siswa (Terdaftar di {selectedKelas}):
                    </label>
                    <select
                      value={selectedNama}
                      onChange={(e) => setSelectedNama(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">-- Pilih Nama Siswa --</option>
                      {availableStudents.map((s, idx) => (
                        <option key={`${s.id || s.nis || 'sis'}_${idx}`} value={s.nama}>
                          {s.nama} (NIS: {formatNisVisual(s.nis)})
                        </option>
                      ))}
                    </select>
                    {availableStudents.length === 0 ? (
                      <p className="text-[11px] text-amber-700 mt-1.5 font-medium">
                        Tidak ada siswa berstatus &quot;Belum Daftar&quot; pada kelas {selectedKelas} di Cloud Server.
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-500 mt-1">
                        *Nama diambil langsung dari Database Siswa Cloud Server Pokja Hubin.
                      </p>
                    )}
                  </div>

                  {matchedStudent && (
                    <div className="p-3 bg-purple-50 rounded-lg border border-purple-200 text-xs space-y-1">
                      <div className="font-bold text-purple-900 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" />
                        <span>Data Otomatis Terkunci (Bebas Salah Ketik):</span>
                      </div>
                      <div className="text-purple-800">
                        NIS: <b>{formatNisVisual(matchedStudent.nis)}</b> | NIK: <b>{matchedStudent.nik || '-'}</b>
                      </div>
                      <div className="text-purple-800">
                        Jenis Kelamin: <b>{matchedStudent.jenisKelamin || '-'}</b>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      PIN Verifikasi (4 digit terakhir NIK):
                    </label>
                    <div className="relative">
                      <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="password"
                        maxLength={4}
                        value={pinVerification}
                        onChange={(e) => setPinVerification(e.target.value)}
                        placeholder="4 digit terakhir NIK"
                        className="w-full pl-8 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Mencegah siswa lain memilih nama tanpa izin.
                    </p>
                  </div>

                  <div className="flex justify-between pt-3">
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
                    >
                      &larr; Kembali
                    </button>
                    <button
                      type="button"
                      disabled={!matchedStudent}
                      onClick={() => setStep(4)}
                      className="px-5 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-xs font-bold shadow-xs disabled:opacity-40 transition-all cursor-pointer"
                    >
                      Lanjut ke Input DUDI &rarr;
                    </button>
                  </div>
                </div>
              )}

              {step === 4 && (
                <form onSubmit={handleSubmit} className="space-y-4 bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="border-b border-slate-100 pb-2">
                    <span className="text-xs font-bold text-purple-700 uppercase">Section 4 dari 4</span>
                    <h4 className="text-sm font-bold text-slate-800 mt-0.5">
                      Identitas DUDI Tujuan:
                    </h4>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nama Perusahaan / Bengkel / Industri: <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={dudiTujuan}
                      onChange={(e) => setDudiTujuan(e.target.value)}
                      placeholder="Nama perusahaan / instansi tujuan"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Alamat Lengkap &amp; Kota DUDI: <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={alamatDudi}
                      onChange={(e) => setAlamatDudi(e.target.value)}
                      placeholder="Jalan, Kecamatan, Kabupaten/Kota"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Bidang Pekerjaan / Lingkup Usaha:
                    </label>
                    <input
                      type="text"
                      value={bidangPekerjaan}
                      onChange={(e) => setBidangPekerjaan(e.target.value)}
                      placeholder="Bidang usaha atau divisi kerja"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      No. WhatsApp Aktif Siswa: <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={noWa}
                      onChange={(e) => setNoWa(e.target.value)}
                      placeholder="08xxxxxxxxxx"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <div className="flex justify-between pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setStep(3)}
                      className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
                    >
                      &larr; Kembali
                    </button>
                    <button
                      type="submit"
                      disabled={loading || !dudiTujuan || !alamatDudi || !noWa}
                      className="flex items-center gap-1.5 px-5 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-xs font-bold shadow-xs disabled:opacity-40 transition-all cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{loading ? 'Mengirim...' : 'Kirim Pengajuan PKL'}</span>
                    </button>
                  </div>
                </form>
              )}

              {step === 5 && submittedData && (
                <div className="bg-white p-6 rounded-xl border border-emerald-200 text-center space-y-4 shadow-sm animate-in fade-in">
                  <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>

                  <div>
                    <h4 className="text-base font-bold text-slate-800">Pengajuan Berhasil Dikirim!</h4>
                    <p className="text-xs text-slate-500 mt-1">
                      Data pengajuan telah dicatat langsung ke Cloud Server Pokja Hubin.
                    </p>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-left space-y-1 font-mono">
                    <div>No. Pengajuan : <span className="font-bold text-blue-700">{submittedData.noPengajuan}</span></div>
                    <div>Nama Siswa    : {submittedData.namaSiswa}</div>
                    <div>Jurusan/Kelas : {submittedData.jurusan} ({submittedData.kelas})</div>
                    <div>DUDI Tujuan   : {submittedData.dudiTujuan}</div>
                    <div>Status        : <span className="text-amber-700 font-bold">Menunggu ACC Kakomli</span></div>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    Silakan cetak <b>Lembar Permohonan Rekomendasi PKL</b> dan serahkan ke <b>Ketua Kompetensi Keahlian (Kakomli)</b> jurusan Anda untuk diverifikasi kelayakan kompetensinya.
                  </p>

                  <div className="flex justify-center gap-2 pt-2">
                    <button
                      onClick={handleReset}
                      className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                    >
                      Input Siswa Lain
                    </button>
                    <button
                      onClick={onClose}
                      className="px-5 py-2 bg-purple-700 text-white rounded-lg text-xs font-bold hover:bg-purple-800 shadow-xs cursor-pointer"
                    >
                      Tutup &amp; Lihat di Dashboard
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
