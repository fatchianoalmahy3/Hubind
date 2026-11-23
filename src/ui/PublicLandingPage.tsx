import React, { useEffect, useState } from 'react';
import {
  FileText,
  UserCheck,
  Lock,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  ChevronRight,
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

    // Proactively warm public DUDI & Petugas caches + modal chunks in background
    // so both mobile & desktop users see zero wait when opening any portal.
    const prewarm = () => {
      if (!active) return;
      PublicPortalClient.prefetchPublicPortal('student');
      PublicPortalClient.prefetchPublicPortal('teacher');
      void import('./StudentApplicationWizard');
      void import('./TeacherMonitoringPortal');
      void import('./LoginModal');
    };

    const win = typeof window !== 'undefined' ? (window as any) : null;
    if (win && typeof win.requestIdleCallback === 'function') {
      const idleId = win.requestIdleCallback(prewarm, { timeout: 600 });
      return () => {
        active = false;
        if (typeof win.cancelIdleCallback === 'function') {
          win.cancelIdleCallback(idleId);
        }
      };
    }

    const timer = setTimeout(prewarm, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  const handlePrefetchStudentPortal = () => {
    PublicPortalClient.prefetchPublicPortal('student');
    void import('./StudentApplicationWizard');
  };

  const handlePrefetchTeacherPortal = () => {
    PublicPortalClient.prefetchPublicPortal('teacher');
    void import('./TeacherMonitoringPortal');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800 selection:bg-blue-600 selection:text-white overflow-x-hidden">
      {/* 1. Top Bar Contract: Brand — Nav Links — Primary Action */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200 w-full">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-4">
          {/* Zone 1: Brand Wordmark */}
          <a
            href="#"
            className="flex items-center gap-2 sm:gap-2.5 text-sm sm:text-base font-bold tracking-tight text-slate-900 shrink-0 whitespace-nowrap"
          >
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-extrabold text-sm shadow-xs shrink-0">
              H
            </div>
            <span className="hidden md:inline whitespace-nowrap">Hubind Sterida · SMK PGRI 2 Ponorogo</span>
            <span className="md:hidden font-bold whitespace-nowrap">Hubind Sterida</span>
          </a>

          {/* Zone 2: Navigation links */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-600 shrink-0">
            <a href="#beranda" className="hover:text-blue-600 transition-colors whitespace-nowrap">
              Beranda
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
                className="px-2.5 sm:px-4 py-2 text-xs font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all flex items-center gap-1.5 shadow-xs cursor-pointer whitespace-nowrap"
              >
                <span>Dashboard</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={onOpenLogin}
                className="px-2.5 sm:px-4 py-2 text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 hover:text-slate-900 transition-all flex items-center gap-1.5 shadow-xs cursor-pointer whitespace-nowrap"
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
      <section id="beranda" className="pt-6 sm:pt-10 pb-8 sm:pb-12 px-4 sm:px-6 max-w-7xl mx-auto w-full">
        <div className="text-center max-w-3xl mx-auto space-y-3 sm:space-y-3.5">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-200 max-w-full">
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Tahun Ajaran Aktif {liveYear} · Pokja Hubungan Industri</span>
          </div>

          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-900 tracking-tight leading-snug [text-wrap:balance] max-w-2xl mx-auto">
            Portal Terpadu Praktek Kerja Lapangan &amp; Kemitraan DUDI
          </h1>

          {!isPortalConfigured && (
            <div className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 font-medium">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Layanan Cloud Server publik sedang disiapkan oleh Admin Hubin.
              </span>
            </div>
          )}
        </div>

        {/* 2 Dominant Action Portal Cards (2 cards per row on mobile & desktop) */}
        <div className="mt-6 sm:mt-8 grid grid-cols-2 gap-2.5 sm:gap-6 max-w-4xl mx-auto">
          {/* Portal Card 1: Pengajuan PKL Siswa */}
          <div
            onMouseEnter={handlePrefetchStudentPortal}
            onTouchStart={handlePrefetchStudentPortal}
            className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-7 border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group"
          >
            <div className="space-y-2.5 sm:space-y-4">
              <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                <FileText className="w-4 h-4 sm:w-6 sm:h-6" />
              </div>
              <div className="space-y-1 sm:space-y-1.5">
                <h2 className="text-sm sm:text-xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors leading-snug">
                  Pengajuan PKL Siswa Mandiri
                </h2>
                <p className="text-[11px] sm:text-xs text-slate-600 leading-relaxed line-clamp-3 sm:line-clamp-none">
                  Masukkan NIS Anda untuk verifikasi data otomatis dari Cloud Server, lengkapi kontak wali, dan pilih DUDI mitra resmi sekolah.
                </p>
              </div>

              <div className="hidden sm:block space-y-2 pt-1 text-xs text-slate-500">
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

            <div className="pt-3.5 sm:pt-6">
              <button
                onClick={onOpenPengajuan}
                onFocus={handlePrefetchStudentPortal}
                className="w-full min-h-[44px] py-2.5 sm:py-3 px-2.5 sm:px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] sm:text-xs shadow-md transition-all flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer active:scale-[0.99]"
              >
                <span className="sm:hidden truncate">Ajukan PKL</span>
                <span className="hidden sm:inline">Buka Formulir Pengajuan Siswa</span>
                <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              </button>
            </div>
          </div>

          {/* Portal Card 2: Monitoring 1-8 Guru */}
          <div
            onMouseEnter={handlePrefetchTeacherPortal}
            onTouchStart={handlePrefetchTeacherPortal}
            className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-7 border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group"
          >
            <div className="space-y-2.5 sm:space-y-4">
              <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                <UserCheck className="w-4 h-4 sm:w-6 sm:h-6" />
              </div>
              <div className="space-y-1 sm:space-y-1.5">
                <h2 className="text-sm sm:text-xl font-bold text-slate-900 group-hover:text-indigo-600 transition-colors leading-snug">
                  Portal Petugas Monitoring DUDI
                </h2>
                <p className="text-[11px] sm:text-xs text-slate-600 leading-relaxed line-clamp-3 sm:line-clamp-none">
                  Pilih nama petugas dari daftar resmi dan masukkan PIN verifikasi. Sistem menampilkan DUDI binaan beserta daftar siswa dan 4 kategori penilaian.
                </p>
              </div>

              <div className="hidden sm:block space-y-2 pt-1 text-xs text-slate-500">
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

            <div className="pt-3.5 sm:pt-6">
              <button
                onClick={onOpenMonitoring}
                onFocus={handlePrefetchTeacherPortal}
                className="w-full min-h-[44px] py-2.5 sm:py-3 px-2.5 sm:px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] sm:text-xs shadow-md transition-all flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer active:scale-[0.99]"
              >
                <span className="sm:hidden truncate">Monitoring</span>
                <span className="hidden sm:inline">Buka Portal Monitoring Guru</span>
                <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
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
