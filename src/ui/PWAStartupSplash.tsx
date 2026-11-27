import React, { useEffect, useState } from 'react';

const SPLASH_SESSION_KEY = 'hubin_pwa_splash_seen';

function isRunningAsInstalledPwa(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function shouldShowStartupSplash(): boolean {
  if (!isRunningAsInstalledPwa()) return false;
  try {
    if (window.sessionStorage.getItem(SPLASH_SESSION_KEY) === '1') {
      return false;
    }
    window.sessionStorage.setItem(SPLASH_SESSION_KEY, '1');
  } catch {
    // Proceed cleanly if sessionStorage is restricted
  }
  return true;
}

export const PWAStartupSplash: React.FC = () => {
  const [visible, setVisible] = useState<boolean>(() => shouldShowStartupSplash());
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const holdMs = reducedMotion ? 320 : 950;
    const fadeDurationMs = reducedMotion ? 150 : 280;

    const fadeTimer = window.setTimeout(() => {
      setFadingOut(true);
    }, holdMs);

    const hideTimer = window.setTimeout(() => {
      setVisible(false);
    }, holdMs + fadeDurationMs);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-between bg-[#0d2645] bg-[radial-gradient(circle_at_50%_42%,rgba(234,179,8,0.14)_0%,rgba(37,99,235,0.12)_34%,#0d2645_72%)] text-white select-none pt-[env(safe-area-inset-top,0px)] pb-[calc(2.5rem+env(safe-area-inset-bottom,0px))] transition-[opacity,transform] duration-300 ease-out ${
        fadingOut ? 'opacity-0 scale-[1.02] pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      <div className="h-8" />

      <div className="flex flex-col items-center text-center px-6">
        <div className="relative hubin-splash-logo">
          <div className="absolute -inset-3 rounded-[2rem] bg-amber-400/15 blur-xl pointer-events-none" />
          <img
            src="/assets/logo-hubind.png"
            alt="Hubind Sterida"
            className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-3xl object-cover shadow-2xl ring-1 ring-white/15 bg-[#0d2645]"
          />
        </div>

        <h1 className="mt-6 text-2xl sm:text-[26px] font-extrabold tracking-tight text-white hubin-splash-title">
          Hubind Sterida
        </h1>
      </div>

      <div className="w-36 h-1 rounded-full bg-white/15 overflow-hidden hubin-splash-title">
        <div className="w-1/2 h-full rounded-full bg-gradient-to-r from-amber-300 via-amber-400 to-sky-300 hubin-splash-bar" />
      </div>
    </div>
  );
};
