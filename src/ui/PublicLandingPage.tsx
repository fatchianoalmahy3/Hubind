import React, { useEffect, useState } from 'react';
import {
  FileText,
  UserCheck,
  Lock,
  ArrowRight,
  CheckCircle2,
  MessageCircle,
  Sparkles,
  ChevronRight,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { PublicPortalClient } from '../core/PublicPortalClient';

interface PublicLandingPageProps {
  onOpenLogin: () => void;
  onOpenPengajuan: () => void;
  onOpenMonitoring: () => void;
  currentUser?: any;
  onGoToDashboard?: () => void;
  activeYear?: string;
}

export const PublicLandingPage: React.FC<PublicLandingPageProps> = ({
  onOpenLogin,
  onOpenPengajuan,
  onOpenMonitoring,
  currentUser,
  onGoToDashboard,
  activeYear,
}) => {
  const [liveYear, setLiveYear] = useState<string>(activeYear || '2026/2027');
  const [isPortalConfigured, setIsPortalConfigured] = useState<boolean>(true);

  useEffect(() => {
    if (activeYear) {
      setLiveYear(activeYear);
    }
  }, [activeYear]);

  useEffect(() => {
    let active = true;
    PublicPortalClient.getConfigSummary()
      .then((data) => {
        if (!active || !data) return;
        if (data.activeYear) setLiveYear(data.activeYear);
        setIsPortalConfigured(Boolean(data.isConfigured && data.hasGasUrl));
      })
      .catch(() => {
        // Keep current fallback display silently
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800 selection:bg-blue-600 selection:text-white overflow-x-hidden">
      {/* 1. Top Bar Contract: Brand — Nav Links — Primary Action */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200 w-full">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-4">
          {/* Zone 1: Brand Wordmark */}
          <a
            href="#"
            className="flex items-center gap-2 sm:gap-2.5 text-sm sm:text-base font-bold tracking-tight text-slate-900 min-w-0 shrink"
          >
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-extrabold text-sm shadow-xs shrink-0">
              H
            </div>
            <span className="hidden md:inline truncate">Hubind Sterida · SMK PGRI 2 Ponorogo</span>
            <span className="md:hidden font-bold truncate">Hubind Sterida</span>
          </a>

          {/* Zone 2: Navigation links */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-600 shrink-0">
            <a href="#beranda" className="hover:text-blue-600 transition-colors whitespace-nowrap">
              Beranda
            </a>
            <a href="#alur" className="hover:text-blue-600 transition-colors whitespace-nowrap">
              Alur PKL
            </a>
            <a href="#dudi" className="hover:text-blue-600 transition-colors whitespace-nowrap">
              Tempat DUDI
            </a>
            <a href="#kontak" className="hover:text-blue-600 transition-colors whitespace-nowrap">
              Kontak Hubin
            </a>
          </nav>

          {/* Zone 3: Primary Action Button */}
          <div className="flex items-center gap-2 shrink-0">
            {currentUser ? (
              <button
                onClick={onGoToDashboard}
                className="px-3 sm:px-4 py-2 text-xs font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all flex items-center gap-1.5 shadow-xs cursor-pointer whitespace-nowrap"
              >
                <span>Dashboard ({currentUser.role})</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={onOpenLogin}
                className="px-3 sm:px-4 py-2 text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 hover:text-slate-900 transition-all flex items-center gap-1.5 shadow-xs cursor-pointer whitespace-nowrap"
              >
                <Lock className="w-3.5 h-3.5 text-blue-600" />
                <span className="hidden sm:inline">Login Pengelola</span>
                <span className="sm:hidden">Login</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 2. Hero Section */}
      <section id="beranda" className="pt-10 pb-14 px-4 sm:px-6 max-w-7xl mx-auto w-full">
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-200 max-w-full">
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Tahun Ajaran Aktif {liveYear} · Pokja Hubungan Industri</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
            Portal Terpadu Praktek Kerja Lapangan &amp; Kemitraan DUDI
          </h1>

          <p className="text-sm sm:text-base text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Sistem informasi resmi SMK PGRI 2 Ponorogo. Memudahkan siswa mengajukan tempat PKL mandiri berbasis NIS, guru melaksanakan supervisi terstruktur per DUDI, dan sekolah mengelola seluruh data langsung di Google Spreadsheet.
          </p>

          {/* Unboxed Metadata Capabilities */}
          <div className="pt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-500 font-medium">
            <span>Pengajuan Mandiri Berbasis NIS</span>
            <span aria-hidden="true">·</span>
            <span>Supervisi 5 Tahap &amp; 4 Kategori Nilai</span>
            <span aria-hidden="true">·</span>
            <span>Terhubung Google Spreadsheet Resmi</span>
          </div>

          {!isPortalConfigured && (
            <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 font-medium">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Koneksi Google Spreadsheet publik sedang disiapkan oleh Admin Hubin.
              </span>
            </div>
          )}
        </div>

        {/* 2 Dominant Action Portal Cards */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* Portal Card 1: Pengajuan PKL Siswa */}
          <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                <FileText className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                  Pengajuan PKL Siswa Mandiri
                </h2>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Masukkan NIS Anda untuk verifikasi data otomatis dari Google Spreadsheet, lengkapi kontak wali, dan pilih DUDI mitra resmi sekolah.
                </p>
              </div>

              <div className="space-y-2 pt-1 text-xs text-slate-500">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Cek biodata instan dengan memasukkan NIS resmi</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Daftar kuota DUDI mitra aktif tahun {liveYear}</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Bantuan koordinasi jika DUDI belum terdaftar</span>
                </div>
              </div>
            </div>

            <div className="pt-6">
              <button
                onClick={onOpenPengajuan}
                className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
              >
                <span>Buka Formulir Pengajuan Siswa</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Portal Card 2: Monitoring 1-5 Guru */}
          <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                <UserCheck className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-xl font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                  Portal Petugas Monitoring DUDI
                </h2>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Pilih nama petugas dari daftar resmi dan masukkan PIN verifikasi. Sistem menampilkan DUDI binaan beserta daftar siswa dan 4 kategori penilaian.
                </p>
              </div>

              <div className="space-y-2 pt-1 text-xs text-slate-500">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Langkah 1: Pilih Nama Petugas &amp; Verifikasi PIN</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Langkah 2: Pilih DUDI yang diampu oleh petugas</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Langkah 3: Input nilai 4 kategori per siswa dalam 1 DUDI</span>
                </div>
              </div>
            </div>

            <div className="pt-6">
              <button
                onClick={onOpenMonitoring}
                className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
              >
                <span>Buka Portal Monitoring Guru</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Section: Alur 4 Langkah PKL Sterida */}
      <section id="alur" className="py-14 bg-white border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto space-y-2 mb-10">
            <h3 className="text-xs font-bold uppercase tracking-wider text-blue-600">
              Prosedur Resmi Sekolah
            </h3>
            <h2 className="text-2xl font-bold text-slate-900">
              Alur 4 Tahap Pelaksanaan PKL Sterida {liveYear}
            </h2>
            <p className="text-xs text-slate-500">
              Setiap tahapan tersinkronisasi langsung dengan Google Spreadsheet Pokja Hubin.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
              <span className="text-xs font-mono font-bold text-blue-600">01.</span>
              <h4 className="text-sm font-bold text-slate-900">
                Pengajuan Mandiri Berbasis NIS
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Siswa memasukkan NIS pada portal publik, mengecek data terverifikasi, dan memilih DUDI mitra yang tersedia.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
              <span className="text-xs font-mono font-bold text-blue-600">02.</span>
              <h4 className="text-sm font-bold text-slate-900">
                Verifikasi &amp; ACC Kakomli
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Ketua Konsentrasi Keahlian meninjau kesesuaian kompetensi dan menerbitkan persetujuan penempatan.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
              <span className="text-xs font-mono font-bold text-blue-600">03.</span>
              <h4 className="text-sm font-bold text-slate-900">
                Supervisi Berkala Monitoring 1–3
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Guru pendamping memantau kehadiran siswa, adaptasi lingkungan kerja industri, dan penyelesaian kendala.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
              <span className="text-xs font-mono font-bold text-blue-600">04.</span>
              <h4 className="text-sm font-bold text-slate-900">
                Evaluasi 4 Kategori &amp; Sertifikat
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Petugas monitoring menginput nilai 4 kategori per siswa dalam 1 DUDI dan menerbitkan piagam sertifikat resmi.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Section: Penanganan DUDI Belum Terdaftar (Hubin Desk) */}
      <section id="dudi" className="py-14 px-4 sm:px-6 max-w-7xl mx-auto w-full">
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-3xl p-7 sm:p-10 shadow-lg flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-3 max-w-xl">
            <span className="text-xs font-mono font-bold text-amber-400">
              POKJA HUBIN CORNER
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Ingin Mengajukan DUDI yang Belum Ada di Daftar?
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Jika perusahaan/bengkel pilihan Anda belum tercantum di sistem, silakan berkoordinasi dengan staf Pokja Hubin untuk verifikasi legalitas dan kesesuaian kompetensi.
            </p>
            <div className="pt-2 flex items-center gap-4 text-xs text-slate-300">
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>Pelayanan: Senin – Jumat (07.00 – 15.30 WIB)</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row md:flex-col gap-3 shrink-0 w-full md:w-auto">
            <a
              href="https://wa.me/6281234567890?text=Halo%20Pokja%20Hubin%20SMK%20PGRI%202%20Ponorogo%2C%20saya%20ingin%20konsultasi%20pengajuan%20tempat%20PKL%20baru."
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 text-center"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Hubungi Hubin via WhatsApp</span>
            </a>
            <button
              onClick={onOpenPengajuan}
              className="px-5 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Ajukan Rekomendasi di Portal</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* 5. Footer */}
      <footer id="kontak" className="mt-auto bg-white border-t border-slate-200 py-10 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6 text-xs text-slate-500">
          <div className="space-y-1">
            <div className="font-bold text-slate-800 text-sm">
              SMK PGRI 2 Ponorogo · Pokja Hubungan Industri (Hubin)
            </div>
            <p>
              Jl. Soekarno - Hatta No. 94, Kertosari, Kec. Babadan, Kabupaten Ponorogo, Jawa Timur 63491
            </p>
            <p>
              Email: hubin@smkpgri2ponorogo.sch.id
            </p>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            {currentUser ? (
              <button
                onClick={onGoToDashboard}
                className="text-blue-600 font-bold hover:underline cursor-pointer"
              >
                Kembali ke Dashboard Pengelola
              </button>
            ) : (
              <button
                onClick={onOpenLogin}
                className="text-slate-700 font-semibold hover:text-blue-600 flex items-center gap-1.5 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Login Pengelola Sekolah</span>
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
};
