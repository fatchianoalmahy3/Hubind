import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let cachedDeferredPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<(ev: BeforeInstallPromptEvent | null) => void>();
let globalListenersAttached = false;

function attachGlobalInstallListeners() {
  if (globalListenersAttached || typeof window === 'undefined') return;
  globalListenersAttached = true;

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    cachedDeferredPrompt = e as BeforeInstallPromptEvent;
    promptListeners.forEach((cb) => cb(cachedDeferredPrompt));
  });

  window.addEventListener('appinstalled', () => {
    cachedDeferredPrompt = null;
    promptListeners.forEach((cb) => cb(null));
  });
}

// Register early at module evaluation so fast browser beforeinstallprompt events are never missed
attachGlobalInstallListeners();

function checkIsStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function checkIsEmbeddedPreview(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function detectDeviceEnvironment() {
  if (typeof window === 'undefined') {
    return {
      isIOS: false,
      isAndroid: false,
      isInAppBrowser: false,
      isMobileOrTablet: false,
    };
  }
  const ua = window.navigator.userAgent || '';
  const uaLower = ua.toLowerCase();
  const isIOS =
    /iphone|ipad|ipod/.test(uaLower) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /android/.test(uaLower);
  const isInAppBrowser =
    /whatsapp|fban|fbav|instagram|line\/|telegram|tiktok|bytedance|musical_ly|snapchat|micromessenger/i.test(
      uaLower
    ) ||
    (isAndroid && /; wv\)/i.test(uaLower));
  const hasTouch = navigator.maxTouchPoints > 0;
  const mobileViewport = window.innerWidth <= 1024;
  const isMobileOrTablet =
    isIOS ||
    isAndroid ||
    /mobile|tablet|blackberry|iemobile|opera mini/i.test(uaLower) ||
    (hasTouch && mobileViewport);

  return { isIOS, isAndroid, isInAppBrowser, isMobileOrTablet };
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => cachedDeferredPrompt
  );
  const [isInstalled, setIsInstalled] = useState(() => checkIsStandalone());
  const [justInstalled, setJustInstalled] = useState(false);
  const [deviceEnv, setDeviceEnv] = useState(() => detectDeviceEnvironment());
  const [isEmbeddedPreview] = useState(() => checkIsEmbeddedPreview());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    attachGlobalInstallListeners();

    setIsInstalled(checkIsStandalone());
    setDeviceEnv(detectDeviceEnvironment());

    const displayMedia = window.matchMedia('(display-mode: standalone)');
    const handleDisplayChange = () => {
      setIsInstalled(checkIsStandalone());
    };
    displayMedia.addEventListener?.('change', handleDisplayChange);

    const listener = (ev: BeforeInstallPromptEvent | null) => {
      setDeferredPrompt(ev);
      if (ev === null && checkIsStandalone()) {
        setIsInstalled(true);
      }
    };
    promptListeners.add(listener);

    const handleInstalled = () => {
      setIsInstalled(checkIsStandalone());
      setJustInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      promptListeners.delete(listener);
      window.removeEventListener('appinstalled', handleInstalled);
      displayMedia.removeEventListener?.('change', handleDisplayChange);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      cachedDeferredPrompt = null;
      setDeferredPrompt(null);
      setJustInstalled(true);
      promptListeners.forEach((cb) => cb(null));
      if (checkIsStandalone()) {
        setIsInstalled(true);
      }
      return true;
    }
    return false;
  };

  // Strict mandatory PWA gate applies to mobile/tablet outside standalone & outside preview iframe
  const requiresMobileInstallGate =
    deviceEnv.isMobileOrTablet && !isInstalled && !isEmbeddedPreview;

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    justInstalled,
    isIOS: deviceEnv.isIOS,
    isAndroid: deviceEnv.isAndroid,
    isInAppBrowser: deviceEnv.isInAppBrowser,
    isMobileOrTablet: deviceEnv.isMobileOrTablet,
    isEmbeddedPreview,
    requiresMobileInstallGate,
    install,
  };
}
