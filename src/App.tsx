import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Database,
  RefreshCw,
  Sparkles,
  Code2,
} from 'lucide-react';
import { Navbar } from './ui/Navbar';
import { Sidebar } from './ui/Sidebar';
import { UserRole } from './core/types/schema';
import { GoogleSheetClient } from './core/GoogleSheetClient';
import { IndexedDbSheetCache } from './core/cache/IndexedDbSheetCache';
import {
  getStoredAdminSession,
  clearAdminSession,
  AdminSessionUser,
} from './core/auth/LocalAccountAuthService';

import {
  CRUD_MODULE_NAMES,
  getDefaultModuleForRole,
  getDocumentHubDependencies,
  getModuleEntry,
  getRepositoryForModule,
  isModuleAllowedForRole,
} from './core/moduleRegistry';

import { AppleToastContainer } from './ui/AppleToastContainer';
import { PublicLandingPage } from './ui/PublicLandingPage';
import type { DocumentHubKey } from './ui/DocumentHubPage';
import { ToastManager } from './core/ToastManager';

// Code-split heavy modules, modals & secondary views for instant initial load
const ModulePage = lazy(() =>
  import('./ui/ModulePage').then((m) => ({ default: m.ModulePage }))
);
const StudentGFormSimulatorModal = lazy(() =>
  import('./ui/StudentGFormSimulatorModal').then((m) => ({ default: m.StudentGFormSimulatorModal }))
);
const GoogleDocsPreviewModal = lazy(() =>
  import('./ui/GoogleDocsPreviewModal').then((m) => ({ default: m.GoogleDocsPreviewModal }))
);
const GasScriptModal = lazy(() =>
  import('./ui/GasScriptModal').then((m) => ({ default: m.GasScriptModal }))
);
const SpreadsheetConfigModal = lazy(() =>
  import('./ui/SpreadsheetConfigModal').then((m) => ({ default: m.SpreadsheetConfigModal }))
);
const AutoGenerateSyncModal = lazy(() =>
  import('./ui/AutoGenerateSyncModal').then((m) => ({ default: m.AutoGenerateSyncModal }))
);
const SetupWizardModal = lazy(() =>
  import('./ui/SetupWizardModal').then((m) => ({ default: m.SetupWizardModal }))
);
const WorkspaceHubPage = lazy(() =>
  import('./ui/WorkspaceHubPage').then((m) => ({ default: m.WorkspaceHubPage }))
);
const LoginModal = lazy(() =>
  import('./ui/LoginModal').then((m) => ({ default: m.LoginModal }))
);
const StudentApplicationWizard = lazy(() =>
  import('./ui/StudentApplicationWizard').then((m) => ({ default: m.StudentApplicationWizard }))
);
const TeacherMonitoringPortal = lazy(() =>
  import('./ui/TeacherMonitoringPortal').then((m) => ({ default: m.TeacherMonitoringPortal }))
);
const GoogleDocsTemplateManagerModal = lazy(() =>
  import('./ui/GoogleDocsTemplateManagerModal').then((m) => ({ default: m.GoogleDocsTemplateManagerModal }))
);
const DocumentHubPage = lazy(() =>
  import('./ui/DocumentHubPage').then((m) => ({ default: m.DocumentHubPage }))
);
const AccountManagementModal = lazy(() =>
  import('./ui/AccountManagementModal').then((m) => ({ default: m.AccountManagementModal }))
);
const DudiMonitoringRecapPage = lazy(() =>
  import('./ui/DudiMonitoringRecapPage').then((m) => ({ default: m.DudiMonitoringRecapPage }))
);

const UI_SESSION_KEY = 'hubin_ui_session';

interface SavedUiSession {
  appMode?: 'landing' | 'admin';
  currentModule?: string;
  userRole?: UserRole;
  activePortal?: 'monitoring' | 'pengajuan' | null;
}

function readSavedUiSession(): SavedUiSession {
  if (typeof window === 'undefined') return {};
  try {
    const raw =
      window.sessionStorage.getItem(UI_SESSION_KEY) ||
      window.localStorage.getItem(UI_SESSION_KEY);
    return raw ? (JSON.parse(raw) as SavedUiSession) : {};
  } catch {
    return {};
  }
}

function writeSavedUiSession(data: SavedUiSession) {
  if (typeof window === 'undefined') return;
  try {
    const serialized = JSON.stringify(data);
    window.sessionStorage.setItem(UI_SESSION_KEY, serialized);
    window.localStorage.setItem(UI_SESSION_KEY, serialized);
  } catch {
    // ignore storage quota issues
  }
}

function clearSavedUiSession() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(UI_SESSION_KEY);
    window.localStorage.removeItem(UI_SESSION_KEY);
  } catch {
    // ignore
  }
}

function resolveInitialUiState() {
  const savedSession = typeof window !== 'undefined' ? getStoredAdminSession() : null;
  const savedUi = readSavedUiSession();
  const hash = typeof window !== 'undefined' ? window.location.hash || '' : '';

  const initialUser: AdminSessionUser | null = savedSession?.user || null;
  const initialRole: UserRole =
    (initialUser?.role as UserRole) || savedUi.userRole || 'Hubin';

  let initialPortal: 'monitoring' | 'pengajuan' | null = null;
  let initialAppMode: 'landing' | 'admin' = 'landing';
  let initialModule: string = savedUi.currentModule || getDefaultModuleForRole(initialRole);

  if (hash === '#/monitoring') {
    initialPortal = 'monitoring';
  } else if (hash === '#/pengajuan') {
    initialPortal = 'pengajuan';
  } else if (hash.startsWith('#/admin')) {
    const hashMod = hash.replace(/^#\/admin\/?/, '').split('?')[0].trim();
    if (initialUser) {
      initialAppMode = 'admin';
      if (hashMod) {
        initialModule = hashMod;
      }
    }
  } else if (savedUi.activePortal === 'monitoring' || savedUi.activePortal === 'pengajuan') {
    initialPortal = savedUi.activePortal;
  } else if (initialUser && savedUi.appMode === 'admin') {
    initialAppMode = 'admin';
  }

  if (initialUser && !isModuleAllowedForRole(initialModule, initialRole)) {
    initialModule = getDefaultModuleForRole(initialRole);
  }

  return {
    initialUser,
    initialRole,
    initialAppMode,
    initialModule,
    initialPortal,
  };
}

export default function App() {
  const [initialState] = useState(resolveInitialUiState);
  const [appMode, setAppMode] = useState<'landing' | 'admin'>(initialState.initialAppMode);
  const [authReady, setAuthReady] = useState(true);
  const [currentUser, setCurrentUser] = useState<AdminSessionUser | null>(initialState.initialUser);
  const [currentModule, setCurrentModule] = useState<string>(initialState.initialModule);
  const [userRole, setUserRole] = useState<UserRole>(initialState.initialRole);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Global modals
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isStudentWizardOpen, setIsStudentWizardOpen] = useState(
    initialState.initialPortal === 'pengajuan'
  );
  const [isTeacherMonitoringOpen, setIsTeacherMonitoringOpen] = useState(
    initialState.initialPortal === 'monitoring'
  );
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [isDocsOpen, setIsDocsOpen] = useState(false);
  const [isTemplateManagerOpen, setIsTemplateManagerOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [selectedStudentForDocs, setSelectedStudentForDocs] = useState<any>(null);
  const [selectedStudentsListForDocs, setSelectedStudentsListForDocs] = useState<any[]>([]);
  const [allStudentsListForDocs, setAllStudentsListForDocs] = useState<any[]>([]);
  const [docsSourceModule, setDocsSourceModule] = useState<string | undefined>(undefined);
  const [isGasOpen, setIsGasOpen] = useState(false);
  const [isSheetConfigOpen, setIsSheetConfigOpen] = useState(false);
  const [isAutoGenerateOpen, setIsAutoGenerateOpen] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [globalSyncing, setGlobalSyncing] = useState(false);
  const [refreshState, setRefreshState] = useState(0);

  const googleClient = GoogleSheetClient.getInstance();
  const [configSnapshot, setConfigSnapshot] = useState(() => googleClient.getConfig());
  const [verification, setVerification] = useState<{
    checking: boolean;
    connected: boolean;
    spreadsheetId: string;
    spreadsheetTitle?: string;
    error?: string;
  }>(() => {
    const cfg = googleClient.getConfig();
    const hasConfigured = Boolean(cfg.spreadsheetId && cfg.gasDeployUrl);
    return {
      checking: false,
      connected: hasConfigured,
      spreadsheetId: cfg.spreadsheetId,
      spreadsheetTitle: cfg.spreadsheetName || undefined,
    };
  });

  // Persist UI view & active public portal across page reloads + keep URL hash synchronized
  useEffect(() => {
    const activePortal: 'monitoring' | 'pengajuan' | null = isTeacherMonitoringOpen
      ? 'monitoring'
      : isStudentWizardOpen
      ? 'pengajuan'
      : null;
    writeSavedUiSession({ appMode, currentModule, userRole, activePortal });

    if (typeof window === 'undefined') return;
    let targetHash = '';
    if (isTeacherMonitoringOpen) {
      targetHash = '#/monitoring';
    } else if (isStudentWizardOpen) {
      targetHash = '#/pengajuan';
    } else if (appMode === 'admin' && currentUser) {
      targetHash = `#/admin/${currentModule}`;
    } else {
      const curr = window.location.hash || '';
      if (curr.startsWith('#/admin') || curr === '#/monitoring' || curr === '#/pengajuan') {
        targetHash = '#/';
      }
    }

    if (targetHash && window.location.hash !== targetHash) {
      try {
        window.history.replaceState(null, '', targetHash);
      } catch {
        window.location.hash = targetHash;
      }
    }
  }, [appMode, currentModule, userRole, currentUser, isTeacherMonitoringOpen, isStudentWizardOpen]);

  // Preload IndexedDB cache & subscribe to Firestore Workspace config on mount
  useEffect(() => {
    const initialCfg = googleClient.getConfig();
    if (initialCfg.spreadsheetId) {
      IndexedDbSheetCache.getInstance()
        .preloadAll(initialCfg.spreadsheetId, initialCfg.activeYear)
        .catch(() => {});
    }

    googleClient.initFromFirestore();

    const unsubConfig = googleClient.addChangeListener(() => {
      setConfigSnapshot(googleClient.getConfig());
    });

    const savedSession = getStoredAdminSession();
    if (savedSession?.user) {
      setCurrentUser(savedSession.user);
      setUserRole(savedSession.user.role);
    } else {
      setCurrentUser(null);
      setAppMode('landing');
    }
    setAuthReady(true);

    return () => {
      unsubConfig();
    };
  }, []);

  // Verify Spreadsheet connection via Cloud GAS Web App (refresh-proof & cross-device consistent)
  const runConnectionVerification = useCallback(async () => {
    if (appMode !== 'admin' || !currentUser) return;

    const activeId = configSnapshot.spreadsheetId;
    if (!activeId) {
      setVerification({
        checking: false,
        connected: false,
        spreadsheetId: '',
        error:
          'ID Database Cloud Server untuk tahun ajaran aktif belum diatur. Masukkan konfigurasi server pada menu Konfigurasi Server.',
      });
      return;
    }

    if (!configSnapshot.gasDeployUrl) {
      setVerification({
        checking: false,
        connected: false,
        spreadsheetId: activeId,
        error:
          'Endpoint API Cloud Server ("/exec") belum diatur. Pasang endpoint API Server agar seluruh perangkat membaca dan menulis data secara konsisten.',
      });
      return;
    }

    setVerification((prev) => ({
      ...prev,
      checking: true,
      connected: true, // Non-blocking optimistic connection while background health check runs
      spreadsheetId: activeId,
      error: undefined,
    }));

    // Single-request bootstrap validates GAS connectivity & hydrates all admin tables at once.
    // Only fall back to pingGasConnection() when bootstrap fails (e.g. static SPA hosting or diagnostics).
    const bootstrapped = await googleClient.bootstrapAdminTables(false).catch(() => false);
    if (bootstrapped) {
      setVerification({
        checking: false,
        connected: true,
        spreadsheetId: activeId,
        spreadsheetTitle: configSnapshot.spreadsheetName || activeId,
      });
      return;
    }

    const gasRes = await googleClient.pingGasConnection();
    if (gasRes.connected) {
      setVerification({
        checking: false,
        connected: true,
        spreadsheetId: activeId,
        spreadsheetTitle: gasRes.title || configSnapshot.spreadsheetName || activeId,
      });
      return;
    }

    setVerification({
      checking: false,
      connected: false,
      spreadsheetId: activeId,
      error:
        gasRes.error ||
        'Gagal terhubung ke Endpoint API Cloud Server. Periksa URL "/exec" dan pastikan akses endpoint tersedia.',
    });
  }, [appMode, currentUser, configSnapshot.spreadsheetId, configSnapshot.gasDeployUrl, configSnapshot.spreadsheetName]);

  useEffect(() => {
    runConnectionVerification();
  }, [runConnectionVerification]);

  // Enforce role-based module access when user switches roles or restores session
  useEffect(() => {
    if (!currentUser) return;
    if (!isModuleAllowedForRole(currentModule, userRole)) {
      setCurrentModule(getDefaultModuleForRole(userRole));
    }
  }, [currentUser, currentModule, userRole]);

  const handleLoginSuccess = (user: AdminSessionUser) => {
    const nextRole = user.role as UserRole;
    setCurrentUser(user);
    setUserRole(nextRole);
    setCurrentModule((prev) =>
      isModuleAllowedForRole(prev, nextRole) ? prev : getDefaultModuleForRole(nextRole)
    );
    setAppMode('admin');
    void googleClient.bootstrapAdminTables(false).catch(() => false);
  };

  const handleLogout = async () => {
    clearAdminSession();
    try {
      const { signOutFirebaseAdmin } = await import('./core/auth/GoogleAuthService');
      await signOutFirebaseAdmin();
    } catch {
      // ignore if auth chunk fails or already signed out
    }
    clearSavedUiSession();
    setCurrentUser(null);
    setAppMode('landing');
    ToastManager.getInstance().show(
      'Sesi Berakhir',
      'info',
      'Anda telah keluar dari portal pengelola.'
    );
  };

  const handleSyncAll = async () => {
    setGlobalSyncing(true);
    try {
      await Promise.all([
        runConnectionVerification(),
        googleClient.bootstrapAdminTables(true),
      ]);
      if (currentModule.startsWith('doc_')) {
        await Promise.all(
          getDocumentHubDependencies().map((repo) => repo.reloadFromSpreadsheet().catch(() => null))
        );
      } else if (currentModule === 'rekap_monitoring_dudi') {
        await Promise.all(
          ['dudi', 'siswa_pkl', 'siswa', 'jurusan', 'monitoring', 'sertifikat'].map((id) =>
            getModuleEntry(id).getRepository().reloadFromSpreadsheet().catch(() => null)
          )
        );
      } else if (currentModule !== 'workspace') {
        const repo = getRepositoryForModule(currentModule);
        await repo.reloadFromSpreadsheet();
      }
      setRefreshState((prev) => prev + 1);
      ToastManager.getInstance().show(
        'Data Diperbarui dari Cloud Server',
        'success',
        `Tersinkron langsung dengan Cloud Server (${verification.spreadsheetTitle || `TA ${configSnapshot.activeYear}`}).`
      );
    } catch (err: any) {
      ToastManager.getInstance().show(
        'Gagal Sinkronisasi',
        'error',
        err?.message || 'Periksa koneksi Cloud Server dan konfigurasi server.'
      );
    } finally {
      setGlobalSyncing(false);
    }
  };

  const openDocsForStudent = (
    studentData: any,
    selectedList: any[] = [],
    allList: any[] = [],
    sourceModuleId?: string
  ) => {
    setSelectedStudentForDocs(studentData);
    setSelectedStudentsListForDocs(selectedList);
    setAllStudentsListForDocs(allList);
    setDocsSourceModule(sourceModuleId);
    setIsDocsOpen(true);
  };

  const renderConnectionGate = () => {
    const activeId = configSnapshot.spreadsheetId;
    const isFirebaseAuthOk = Boolean(currentUser);
    const isSheetOk = verification.connected;
    const isSuperAdmin = userRole === 'SuperAdmin';

    if (!isSuperAdmin) {
      return (
        <div className="max-w-xl mx-auto py-8 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-lg overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-blue-50/40 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-xs shrink-0">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                    Layanan Cloud Server Sedang Disiapkan Super Admin
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Koneksi database utama belum aktif atau sedang dalam pemeliharaan. Silakan muat ulang dalam beberapa saat atau hubungi Super Admin Sistem.
                  </p>
                </div>
              </div>
            </div>
            <div className="p-6 flex items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                Tahun Ajaran Aktif: <strong className="text-slate-800">{configSnapshot.activeYear}</strong>
              </span>
              <button
                type="button"
                onClick={runConnectionVerification}
                disabled={verification.checking}
                className="h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${verification.checking ? 'animate-spin' : ''}`} />
                <span>Cek Ulang</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="max-w-3xl mx-auto py-4 sm:py-8 animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-lg overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-blue-50/40 flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                  Verifikasi Koneksi Cloud Server
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Aplikasi menggunakan 100% data langsung dari Cloud Server (tanpa data dummy). Pastikan 3 status berikut terhubung.
                </p>
              </div>
            </div>
            <button
              onClick={runConnectionVerification}
              disabled={verification.checking}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${verification.checking ? 'animate-spin text-blue-600' : ''}`} />
              <span>Cek Ulang</span>
            </button>
          </div>

          <div className="p-6 space-y-4">
            {/* Step 1: Username & Password Session */}
            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {isFirebaseAuthOk ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                )}
                <div>
                  <div className="text-xs font-bold text-slate-900">
                    1. Sesi Akun Pengelola Aktif
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {isFirebaseAuthOk && currentUser
                      ? `Masuk sebagai ${currentUser.name} (@${currentUser.username} · Role ${currentUser.role})`
                      : 'Sesi pengelola belum aktif.'}
                  </div>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold self-start sm:self-auto ${
                  isFirebaseAuthOk
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {isFirebaseAuthOk ? 'Terhubung' : 'Perlu Login'}
              </span>
            </div>

            {/* Step 2: Endpoint API Cloud Server */}
            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {verification.connected ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                )}
                <div>
                  <div className="text-xs font-bold text-slate-900">
                    2. Endpoint API Cloud Server
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {verification.connected
                      ? 'Terhubung otomatis lintas perangkat & tahan refresh ke Cloud Server.'
                      : 'Pasang URL endpoint API Cloud Server dengan akses publik agar aplikasi terhubung konsisten di semua perangkat.'}
                  </div>
                </div>
              </div>

              {verification.connected ? (
                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 self-start sm:self-auto">
                  Cloud Server Aktif
                </span>
              ) : (
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setIsGasOpen(true)}
                    className="px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Code2 className="w-3.5 h-3.5 text-purple-600" />
                    <span>Integrasi API Server</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsSheetConfigOpen(true)}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                  >
                    Konfigurasi Server
                  </button>
                </div>
              )}
            </div>

            {/* Step 3: Database Cloud Server */}
            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {isSheetOk ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900">
                    3. Database Cloud Server (TA {configSnapshot.activeYear})
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {activeId
                      ? verification.spreadsheetTitle
                        ? `${verification.spreadsheetTitle} (${activeId})`
                        : `ID Database Tersimpan: ${activeId}`
                      : 'Belum ada ID Database Server tersimpan.'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <button
                  type="button"
                  onClick={() => setIsSheetConfigOpen(true)}
                  className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Database className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{activeId ? 'Ganti / Atur Database' : 'Konfigurasi Server'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsWizardOpen(true)}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Setup Server (Wizard)</span>
                </button>
              </div>
            </div>

            {verification.error && (
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                <b>Catatan Koneksi:</b> {verification.error}
              </div>
            )}

            <div className="pt-2 flex items-center justify-between text-xs text-slate-500 border-t border-slate-100">
              <span>Ingin mengelola daftar tahun ajaran atau template dokumen terlebih dahulu?</span>
              <button
                type="button"
                onClick={() => setCurrentModule('workspace')}
                className="text-blue-600 font-semibold hover:underline cursor-pointer"
              >
                Buka Pusat Berkas &amp; Konfigurasi Server &rarr;
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderActiveModule = () => {
    if (currentModule === 'workspace' && userRole === 'SuperAdmin') {
      return (
        <Suspense
          fallback={
            <div className="py-12 flex items-center justify-center text-xs text-slate-500">
              Memuat Pusat Berkas &amp; Konfigurasi Server...
            </div>
          }
        >
          <WorkspaceHubPage
            onOpenGasModal={() => setIsGasOpen(true)}
            onOpenSheetConfig={() => setIsSheetConfigOpen(true)}
            onOpenAutoGenerate={() => setIsAutoGenerateOpen(true)}
            onOpenWizard={() => setIsWizardOpen(true)}
            onOpenTemplateManager={() => setIsTemplateManagerOpen(true)}
          />
        </Suspense>
      );
    }

    // Non-blocking startup: only show Connection Gate if config is missing or background check explicitly failed
    const hasConfiguredServer = Boolean(configSnapshot.spreadsheetId && configSnapshot.gasDeployUrl);
    if (!hasConfiguredServer || (!verification.checking && !verification.connected)) {
      return renderConnectionGate();
    }

    if (currentModule.startsWith('doc_')) {
      return (
        <Suspense
          fallback={
            <div className="py-12 flex items-center justify-center text-xs text-slate-500">
              Memuat Pusat Dokumen...
            </div>
          }
        >
          <DocumentHubPage
            key={`${currentModule}_${configSnapshot.spreadsheetId}`}
            activeDocKey={currentModule as DocumentHubKey}
            onSelectDocKey={(k) => setCurrentModule(k)}
            userRole={userRole}
            currentUser={currentUser}
            onOpenTemplateManager={
              userRole === 'SuperAdmin' ? () => setIsTemplateManagerOpen(true) : undefined
            }
          />
        </Suspense>
      );
    }

    if (currentModule === 'rekap_monitoring_dudi') {
      return (
        <Suspense
          fallback={
            <div className="py-12 flex items-center justify-center text-xs text-slate-500">
              Memuat Rekap Monitoring DUDI &amp; Kelas...
            </div>
          }
        >
          <DudiMonitoringRecapPage
            key={`rekap_${configSnapshot.spreadsheetId}`}
            userRole={userRole}
            currentUser={currentUser}
            refreshSignal={refreshState}
          />
        </Suspense>
      );
    }

    const safeModuleId = isModuleAllowedForRole(currentModule, userRole)
      ? currentModule
      : getDefaultModuleForRole(userRole);
    const entry = getModuleEntry(safeModuleId);
    return (
      <Suspense
        fallback={
          <div className="py-12 flex items-center justify-center text-xs text-slate-500">
            Memuat Modul {entry.metadata.title}...
          </div>
        }
      >
        <ModulePage
          key={`${entry.id}_${configSnapshot.spreadsheetId}`}
          metadata={entry.metadata}
          repository={entry.getRepository()}
          userRole={userRole}
          currentUser={currentUser}
          onOpenDocsForStudent={
            entry.docShortcutModule
              ? () => setCurrentModule(entry.docShortcutModule!)
              : entry.supportsStudentDocs
                ? openDocsForStudent
                : undefined
          }
          onOpenMonitoringBundle={
            entry.supportsMonitoringBundle ? () => setCurrentModule('doc_paket_monitoring') : undefined
          }
          onOpenSimulator={() => setIsSimulatorOpen(true)}
          onOpenGas={() => setIsGasOpen(true)}
          onOpenSheetConfig={() => setIsSheetConfigOpen(true)}
        />
      </Suspense>
    );
  };

  const moduleNames: Record<string, string> = {
    ...CRUD_MODULE_NAMES,
    rekap_monitoring_dudi: 'Rekap Monitoring DUDI / Kelas',
    doc_paket_monitoring: 'Paket Cetak Monitoring (1-Langkah)',
    doc_mou: 'Dokumen MOU DUDI',
    doc_surat_tugas: 'Dokumen Surat Tugas',
    doc_pengajuan: 'Dokumen Pengajuan PKL',
    doc_pengantaran: 'Dokumen Pengantaran PKL',
    doc_monitoring: 'Dokumen Monitoring PKL',
    doc_penarikan: 'Dokumen Penarikan PKL',
    workspace: 'Pusat Berkas & Konfigurasi Server',
  };

  return (
    <div
      className={`${
        appMode === 'admin' && authReady && currentUser
          ? 'h-screen overflow-hidden'
          : 'min-h-screen'
      } bg-slate-50/70 flex flex-col font-sans text-slate-800 antialiased selection:bg-blue-600 selection:text-white`}
    >
      <AppleToastContainer />

      {appMode === 'admin' && !authReady ? (
        <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-50 text-slate-600">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
          <span className="text-xs font-semibold">Memulihkan sesi Admin Hubin...</span>
        </div>
      ) : appMode === 'landing' || !currentUser ? (
        <PublicLandingPage
          onOpenLogin={() => setIsLoginModalOpen(true)}
          onOpenPengajuan={() => setIsStudentWizardOpen(true)}
          onOpenMonitoring={() => setIsTeacherMonitoringOpen(true)}
          currentUser={currentUser}
          onGoToDashboard={() => setAppMode('admin')}
          activeYear={configSnapshot.activeYear}
        />
      ) : (
        <>
          <Navbar
            onToggleMobileSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
            userRole={userRole}
            onChangeUserRole={setUserRole}
            onOpenSpreadsheetConfig={() => setIsSheetConfigOpen(true)}
            onOpenTemplateManager={() => setIsTemplateManagerOpen(true)}
            onSyncAll={handleSyncAll}
            syncing={globalSyncing}
            onGoToLanding={() => setAppMode('landing')}
            currentUser={currentUser}
            onLogout={handleLogout}
            currentModuleName={moduleNames[currentModule] || 'Portal Pengelola'}
            isConnected={verification.connected}
          />

          <div className="flex-1 min-h-0 flex overflow-hidden">
            <Sidebar
              currentModule={currentModule}
              onSelectModule={setCurrentModule}
              userRole={userRole}
              onOpenSimulator={() => setIsSimulatorOpen(true)}
              onOpenDocs={() => {
                setCurrentModule('doc_paket_monitoring');
              }}
              onOpenGas={() => setIsGasOpen(true)}
              onOpenAutoGenerate={() => setIsAutoGenerateOpen(true)}
              onOpenWizard={() => setIsWizardOpen(true)}
              onOpenSheetConfig={() => setIsSheetConfigOpen(true)}
              onOpenTemplateManager={() => setIsTemplateManagerOpen(true)}
              onOpenAccountManager={() => setIsAccountModalOpen(true)}
              isOpenMobile={isMobileSidebarOpen}
              onCloseMobile={() => setIsMobileSidebarOpen(false)}
            />

            <main className="flex-1 min-w-0 h-full overflow-y-auto px-4 sm:px-6 py-4 lg:py-5">
              <div className="max-w-[1440px] mx-auto w-full">
                {renderActiveModule()}
              </div>
            </main>
          </div>
        </>
      )}

      {/* Global Interactive Portals & Modals (Lazy-loaded on demand) */}
      <Suspense fallback={null}>
        {isLoginModalOpen && (
          <LoginModal
            isOpen={isLoginModalOpen}
            onClose={() => setIsLoginModalOpen(false)}
            onLoginSuccess={handleLoginSuccess}
          />
        )}

        {isStudentWizardOpen && (
          <StudentApplicationWizard
            isOpen={isStudentWizardOpen}
            onClose={() => setIsStudentWizardOpen(false)}
            onSuccessOpenDocs={(submitted) => {
              openDocsForStudent(submitted, [], [], 'pengajuan');
            }}
          />
        )}

        {isTeacherMonitoringOpen && (
          <TeacherMonitoringPortal
            isOpen={isTeacherMonitoringOpen}
            onClose={() => setIsTeacherMonitoringOpen(false)}
            onSuccess={() => setRefreshState((prev) => prev + 1)}
          />
        )}

        {isTemplateManagerOpen && userRole === 'SuperAdmin' && (
          <GoogleDocsTemplateManagerModal
            isOpen={isTemplateManagerOpen}
            onClose={() => setIsTemplateManagerOpen(false)}
            onUpdated={() => setRefreshState((prev) => prev + 1)}
          />
        )}

        {isWizardOpen && userRole === 'SuperAdmin' && (
          <SetupWizardModal
            isOpen={isWizardOpen}
            onClose={() => setIsWizardOpen(false)}
            onConfigured={() => {
              runConnectionVerification();
              setRefreshState((prev) => prev + 1);
            }}
          />
        )}

        {isSimulatorOpen && userRole === 'SuperAdmin' && (
          <StudentGFormSimulatorModal
            isOpen={isSimulatorOpen}
            onClose={() => setIsSimulatorOpen(false)}
            onFormSubmitted={() => {
              setCurrentModule('pengajuan');
            }}
          />
        )}

        {isDocsOpen && (
          <GoogleDocsPreviewModal
            isOpen={isDocsOpen}
            onClose={() => setIsDocsOpen(false)}
            selectedStudent={selectedStudentForDocs}
            selectedStudents={selectedStudentsListForDocs}
            allStudents={allStudentsListForDocs}
            sourceModuleId={docsSourceModule}
          />
        )}

        {isGasOpen && userRole === 'SuperAdmin' && (
          <GasScriptModal
            isOpen={isGasOpen}
            onClose={() => setIsGasOpen(false)}
          />
        )}

        {isSheetConfigOpen && userRole === 'SuperAdmin' && (
          <SpreadsheetConfigModal
            isOpen={isSheetConfigOpen}
            onClose={() => setIsSheetConfigOpen(false)}
            onConfigUpdated={() => {
              runConnectionVerification();
              setRefreshState((prev) => prev + 1);
            }}
          />
        )}

        {isAutoGenerateOpen && userRole === 'SuperAdmin' && (
          <AutoGenerateSyncModal
            isOpen={isAutoGenerateOpen}
            onClose={() => setIsAutoGenerateOpen(false)}
            onSuccess={() => {
              runConnectionVerification();
              setRefreshState((prev) => prev + 1);
            }}
          />
        )}

        {isAccountModalOpen && userRole === 'SuperAdmin' && (
          <AccountManagementModal
            isOpen={isAccountModalOpen}
            onClose={() => setIsAccountModalOpen(false)}
            currentUser={currentUser}
            onCurrentUserUpdated={(updatedUser) => {
              setCurrentUser(updatedUser);
              setUserRole(updatedUser.role);
            }}
          />
        )}
      </Suspense>
    </div>
  );
}
