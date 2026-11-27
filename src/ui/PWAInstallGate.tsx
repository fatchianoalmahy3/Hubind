import React, { useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  MoreVertical,
  Share,
  Smartphone,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallGateProps {
  targetTitle: string;
  targetDescription: string;
  onBack?: () => void;
}

export const PWAInstallGate: React.FC<PWAInstallGateProps> = ({
  targetTitle,
  targetDescription,
  onBack,
}) => {
  const { isInstallable, justInstalled, isIOS, isAndroid, isInAppBrowser, install } =
    usePWAInstall();
  const [copied, setCopied] = useState(false);
  const [installing, setInstalling] = useState(false);

  const currentHref = typeof window !== 'undefined' ? window.location.href : '';
  const androidBrowserIntentUrl =
    typeof window !== 'undefined'
      ? `intent://${window.location.host}${window.location.pathname}${window.location.search}${window.location.hash}#Intent;scheme=${window.location.protocol.replace(':', '')};action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end`
      : '#';

  const handleInstall = async () => {
    if (installing) return;
    setInstalling(true);
    try {
      await install();
    } finally {
      setInstalling(false);
    }
  };

  const handleCopyUrl = async () => {
    if (!currentHref) return;
    try {
      await navigator.clipboard.writeText(currentHref);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback if clipboard API blocked in certain WebViews
      setCopied(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[75] bg-slate-50 text-slate-900 flex flex-col min-h-[100dvh] overflow-y-auto pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
      {/* Compact top bar with optional safe return to Landing Page */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-slate-200/80 bg-white shrink-0">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="min-h-[44px] px-2 -ml-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span>Halaman Utama</span>
          </button>
        ) : (
          <span className="text-xs font-semibold text-slate-500">Hubind Sterida</span>
        )}
        <span className="text-xs font-medium text-slate-500 tabular-nums">
          SMK PGRI 2 Ponorogo
        </span>
      </div>

      {/* Main Centered Content */}
      <div className="flex-1 flex flex-col justify-between max-w-md w-full mx-auto px-5 py-6 sm:py-10 gap-6">
        <div className="space-y-6">
          {/* App Emblem + Title */}
          <div className="flex flex-col items-center text-center space-y-4">
            <img
              src="/assets/logo-hubind.png"
              alt="Logo Hubind SMK PGRI 2 Ponorogo"
              className="w-20 h-20 rounded-3xl object-cover shadow-md bg-[#0d2645]"
            />

            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-blue-700">{targetTitle}</p>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 leading-snug [text-wrap:balance]">
                {justInstalled
                  ? 'Aplikasi Berhasil Dipasang'
                  : isInAppBrowser
                  ? 'Buka Melalui Browser HP Anda'
                  : 'Pasang Aplikasi Hubind PKL'}
              </h1>
              <p className="text-sm text-slate-600 leading-relaxed">{targetDescription}</p>
            </div>
          </div>

          <hr className="border-slate-200/80" />

          {/* Adaptive Device Guidance */}
          {justInstalled ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs sm:text-sm leading-relaxed space-y-1">
                  <p className="font-bold">Ikon Hubind PKL sedang/sudah terpasang di HP Anda.</p>
                  <p>
                    Silakan tutup halaman browser ini, lalu buka aplikasi langsung dari ikon{' '}
                    <b>Hubind PKL</b> di layar utama HP Anda.
                  </p>
                </div>
              </div>
            </div>
          ) : isInAppBrowser ? (
            <div className="space-y-4">
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                Tautan ini terbuka di penampil internal WhatsApp/aplikasi chat, sehingga fitur
                pemasangan aplikasi dibatasi oleh sistem.
              </p>

              <ol className="space-y-3 text-xs sm:text-sm text-slate-800 list-decimal pl-5">
                <li>
                  Ketuk menu <b className="inline-flex items-center gap-0.5"><MoreVertical className="w-3.5 h-3.5" /> (titik tiga)</b> di pojok kanan atas layar.
                </li>
                <li>
                  Pilih <b>Buka di Browser</b> (bisa menggunakan Chrome, Samsung Internet, Edge,
                  Safari, atau browser utama HP Anda).
                </li>
                <li>
                  Setelah terbuka di browser, pasang aplikasi agar muncul di layar utama.
                </li>
              </ol>

              <div className="pt-2 space-y-2.5">
                {isAndroid && (
                  <a
                    href={androidBrowserIntentUrl}
                    className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#0d2645] hover:bg-slate-900 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-colors"
                  >
                    <ExternalLink className="w-4 h-4 shrink-0" />
                    <span>Buka di Browser HP</span>
                  </a>
                )}

                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Tautan Disalin — Tempel di Browser</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 shrink-0" />
                      <span>Salin Tautan Aplikasi</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : isIOS ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                <Smartphone className="w-4 h-4 text-blue-700 shrink-0" />
                <span>Panduan Pasang di iPhone / iPad (iOS)</span>
              </div>

              <ol className="space-y-3 text-xs sm:text-sm text-slate-700 list-decimal pl-5 leading-relaxed">
                <li>
                  Pastikan halaman terbuka di <b>Safari</b> (atau browser iOS 16.4 ke atas).
                </li>
                <li>
                  Ketuk ikon{' '}
                  <b className="inline-flex items-center gap-1 text-blue-700">
                    <Share className="w-3.5 h-3.5" /> Bagikan (Share)
                  </b>{' '}
                  di bilah navigasi browser.
                </li>
                <li>
                  Pilih <b>Tambahkan ke Layar Utama (Add to Home Screen)</b>, lalu ketuk{' '}
                  <b>Tambah</b>.
                </li>
              </ol>

              <button
                type="button"
                onClick={handleCopyUrl}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Tautan Disalin untuk Safari</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 shrink-0" />
                    <span>Salin Tautan untuk Dibuka di Safari</span>
                  </>
                )}
              </button>
            </div>
          ) : isInstallable ? (
            <div className="space-y-4">
              <ul className="space-y-2.5 text-xs sm:text-sm text-slate-700">
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Terbuka penuh tanpa bilah browser layaknya aplikasi terpasang.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Akses cepat 1 ketuk langsung dari layar utama HP Anda.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Data monitoring tetap tersinkron dan terverifikasi langsung ke server.</span>
                </li>
              </ul>

              <div className="pt-2">
                <button
                  type="button"
                  disabled={installing}
                  onClick={handleInstall}
                  className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#0d2645] hover:bg-slate-900 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-md transition-colors cursor-pointer disabled:opacity-60 active:scale-[0.99]"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  <span>{installing ? 'Menyiapkan Pemasangan...' : 'Pasang Aplikasi Sekarang'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                Pasang aplikasi melalui menu browser yang sedang Anda gunakan (Chrome, Samsung
                Internet, Edge, Opera, Brave, atau Firefox):
              </p>

              <ol className="space-y-3 text-xs sm:text-sm text-slate-800 list-decimal pl-5 leading-relaxed">
                <li>
                  Ketuk ikon menu browser (<b>⋮</b> atau <b>☰</b>) di pojok layar.
                </li>
                <li>
                  Pilih <b>Pasang aplikasi</b> / <b>Instal</b> / <b>Tambahkan ke Layar utama</b>.
                </li>
                <li>
                  Buka kembali melalui ikon <b>Hubind PKL</b> di layar utama HP Anda.
                </li>
              </ol>

              <button
                type="button"
                onClick={handleCopyUrl}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Tautan Disalin</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 shrink-0" />
                    <span>Salin Tautan Jika Ingin Pindah Browser</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Bottom reassurance for users who already installed on home screen */}
        <div className="pt-4 border-t border-slate-200/80 text-center space-y-1">
          <p className="text-xs font-semibold text-slate-700">
            Sudah pernah memasang aplikasi ini?
          </p>
          <p className="text-xs text-slate-500 leading-relaxed">
            Tutup tab browser ini, lalu buka langsung dari ikon <b>Hubind PKL</b> di layar utama
            HP Anda.
          </p>
        </div>
      </div>
    </div>
  );
};
