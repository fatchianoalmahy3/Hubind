import React, { useEffect, useState } from 'react';
import {
  FileText,
  UserCheck,
  Lock,
  ArrowRight,
  CheckCircle2,
  Calendar,
  ChevronRight,
  AlertCircle,
  MapPin,
  Mail,
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

const SERVICE_FLOW_STEPS = [
  {
    step: '01',
    title: 'Ajukan PKL',
    desc: 'Verifikasi NIS & pilih DUDI tujuan',
  },
  {
    step: '02',
    title: 'Validasi',
    desc: 'Persetujuan Kakomli & Pokja Hubin',
  },
  {
    step: '03',
    title: 'Surat & Plotting',
    desc: 'Penetapan pendamping & surat resmi',
  },
  {
    step: '04',
    title: 'Supervisi 8 Tahap',
    desc: 'Absensi, 4 nilai DUDI, & sertifikat',
  },
] as const;

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
    <div className="min-h-[100dvh] bg-slate-50 flex flex-col font-sans text-slate-800 selection:bg-blue-600 selection:text-white overflow-x-hidden">
      {/* 1. Header: Mobile-safe, crisp contrast */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/85 w-full">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-3">
          <a
            href="#beranda"
            className="flex items-center gap-2.5 min-w-0 shrink-0"
          >
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-extrabold text-sm shadow-xs shrink-0">
              H
            </div>
            <div className="leading-tight min-w-0">
              <span className="block text-sm sm:text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
                Hubind Sterida
              </span>
              <span className="hidden sm:block text-[11px] font-medium text-slate-500 whitespace-nowrap">
                SMK PGRI 2 Ponorogo
              </span>
            </div>
          </a>

          <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-600 shrink-0">
            <a href="#beranda" className="hover:text-blue-600 transition-colors whitespace-nowrap">
              Beranda
            </a>
            <a href="#alur-layanan" className="hover:text-blue-600 transition-colors whitespace-nowrap">
              Alur Layanan
            </a>
            <a href="#kontak" className="hover:text-blue-600 transition-colors whitespace-nowrap">
              Kontak Hubin
            </a>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            {currentUser ? (
              <button
                onClick={onGoToDashboard}
                className="min-h-[38px] px-3 sm:px-4 py-1.5 text-xs font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer whitespace-nowrap"
              >
                <span>Dashboard</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={onOpenLogin}
                className="min-h-[38px] px-3 sm:px-4 py-1.5 text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 hover:border-slate-400 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer whitespace-nowrap"
              >
                <Lock className="w-3.5 h-3.5 text-blue-600" />
                <span className="hidden sm:inline">Login Pengelola</span>
                <span className="sm:hidden">Login</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 2. Hero + Main Portals */}
      <main className="flex-1 bg-[radial-gradient(ellipse_at_top,_rgba(37,99,235,0.07),_transparent_58%)]">
        <section
          id="beranda"
          className="pt-5 sm:pt-10 pb-6 sm:pb-8 px-4 sm:px-6 max-w-5xl mx-auto w-full"
        >
          <div className="text-center max-w-2xl mx-auto space-y-2.5 sm:space-y-3">
            <div className="inline-flex items-center gap-2 text-[11px] sm:text-xs font-semibold text-slate-700 bg-white px-3 py-1.5 rounded-lg border border-slate-200/90 shadow-2xs max-w-full">
              <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span className="truncate">
                Tahun Ajaran <b className="text-slate-900 tabular-nums">{liveYear}</b> · Pokja Hubungan Industri
              </span>
            </div>

            <h1 className="text-[22px] sm:text-3xl lg:text-4xl font-extrabold text-slate-900 tracking-tight leading-[1.25] [text-wrap:balance] max-w-xl sm:max-w-2xl mx-auto">
              Portal Terpadu Praktek Kerja Lapangan &amp; Kemitraan DUDI
            </h1>

            {!isPortalConfigured && (
              <div className="pt-1 flex justify-center">
                <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 font-medium">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Layanan Cloud Server publik sedang disiapkan oleh Admin Hubin.</span>
                </div>
              </div>
            )}
          </div>

          {/* 2 Dominant Action Portal Cards: 1 col full-width on smartphone, 2 cols on sm+ */}
          <div className="mt-5 sm:mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-6">
            {/* Portal Card 1: Pengajuan PKL Siswa */}
            <div
              onMouseEnter={handlePrefetchStudentPortal}
              onTouchStart={handlePrefetchStudentPortal}
              className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-slate-200/95 shadow-xs hover:shadow-md hover:border-blue-300/80 transition-all flex flex-col justify-between group"
            >
              <div className="space-y-3 sm:space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
                    <FileText className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200/70 rounded-md px-2.5 py-1 whitespace-nowrap">
                    Siapkan: NIS &amp; Link Maps
                  </span>
                </div>

                <div className="space-y-1.5">
                  <h2 className="text-base sm:text-xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors leading-snug">
                    Pengajuan PKL Siswa Mandiri
                  </h2>
                  <p className="text-xs sm:text-[13px] text-slate-600 leading-relaxed">
                    Masukkan NIS untuk verifikasi data otomatis dari Cloud Server, lengkapi kontak wali, dan pilih DUDI mitra resmi sekolah.
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

              <div className="pt-4 sm:pt-6">
                <button
                  type="button"
                  onClick={onOpenPengajuan}
                  onFocus={handlePrefetchStudentPortal}
                  className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                >
                  <span>Ajukan PKL Mandiri</span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </button>
              </div>
            </div>

            {/* Portal Card 2: Monitoring 1-8 Guru */}
            <div
              onMouseEnter={handlePrefetchTeacherPortal}
              onTouchStart={handlePrefetchTeacherPortal}
              className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-slate-200/95 shadow-xs hover:shadow-md hover:border-slate-300 transition-all flex flex-col justify-between group"
            >
              <div className="space-y-3 sm:space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-xs shrink-0">
                    <UserCheck className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-md px-2.5 py-1 whitespace-nowrap">
                    Siapkan: PIN Petugas
                  </span>
                </div>

                <div className="space-y-1.5">
                  <h2 className="text-base sm:text-xl font-bold text-slate-900 group-hover:text-slate-700 transition-colors leading-snug">
                    Portal Petugas Monitoring DUDI
                  </h2>
                  <p className="text-xs sm:text-[13px] text-slate-600 leading-relaxed">
                    Pilih nama guru pendamping dan masukkan PIN verifikasi untuk mencatat supervisi 8 tahap serta 4 kategori nilai per DUDI binaan.
                  </p>
                </div>

                <div className="hidden sm:block space-y-2 pt-1 text-xs text-slate-500">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-slate-700 shrink-0" />
                    <span>Langkah 1: Pilih Nama Petugas &amp; Verifikasi PIN</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-slate-700 shrink-0" />
                    <span>Langkah 2: Pilih DUDI yang diampu oleh petugas</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-slate-700 shrink-0" />
                    <span>Langkah 3: Input absensi &amp; nilai 4 kategori per siswa</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 sm:pt-6">
                <button
                  type="button"
                  onClick={onOpenMonitoring}
                  onFocus={handlePrefetchTeacherPortal}
                  className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                >
                  <span>Buka Portal Monitoring</span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Alur Layanan PKL Terpadu (2x2 compact grid on mobile, 4 cols on desktop) */}
        <section
          id="alur-layanan"
          className="pt-1 pb-8 sm:pb-12 px-4 sm:px-6 max-w-5xl mx-auto w-full"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight uppercase">
              Alur Layanan PKL Terpadu
            </h2>
            <span className="text-[11px] font-medium text-slate-500">
              4 Tahap Terstruktur
            </span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
            {SERVICE_FLOW_STEPS.map((item) => (
              <div
                key={item.step}
                className="bg-white/95 rounded-xl sm:rounded-2xl border border-slate-200/90 p-3 sm:p-4 flex flex-col gap-1 shadow-2xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono font-bold text-blue-600 tabular-nums">
                    {item.step}
                  </span>
                </div>
                <div className="text-xs sm:text-sm font-bold text-slate-900 leading-snug">
                  {item.title}
                </div>
                <p className="text-[11px] sm:text-xs text-slate-500 leading-snug">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* 4. Footer with safe bottom padding for mobile browser toolbars */}
      <footer
        id="kontak"
        className="mt-auto bg-white border-t border-slate-200 pt-6 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] sm:py-8 px-4 sm:px-6"
      >
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-6 text-xs text-slate-500">
          <div className="space-y-1.5">
            <div className="font-bold text-slate-900 text-xs sm:text-sm">
              SMK PGRI 2 Ponorogo · Pokja Hubungan Industri (Hubin)
            </div>
            <p className="flex items-start gap-1.5 leading-relaxed text-[11px] sm:text-xs">
              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
              <span>
                Jl. Soekarno - Hatta No. 94, Kertosari, Kec. Babadan, Kabupaten Ponorogo, Jawa Timur 63491
              </span>
            </p>
            <p className="flex items-center gap-1.5 text-[11px] sm:text-xs">
              <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>hubin@smkpgri2ponorogo.sch.id</span>
            </p>
          </div>

          <div className="pt-2 md:pt-0 border-t border-slate-100 md:border-t-0 w-full md:w-auto flex items-center justify-between md:justify-end gap-4 shrink-0">
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
                className="text-slate-700 font-semibold hover:text-blue-600 inline-flex items-center gap-1.5 cursor-pointer py-1"
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
