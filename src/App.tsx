import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Database,
  RefreshCw,
  Sparkles,
  ExternalLink,
  Code2,
} from 'lucide-react';
import { Navbar } from './ui/Navbar';
import { Sidebar } from './ui/Sidebar';
import { ModulePage } from './ui/ModulePage';
import { UserRole } from './core/types/schema';
import { GoogleSheetClient } from './core/GoogleSheetClient';
import { signOutFirebaseAdmin } from './core/auth/GoogleAuthService';
import {
  getStoredAdminSession,
  clearAdminSession,
  AdminSessionUser,
} from './core/auth/LocalAccountAuthService';

// Modules & Metadata
import { SiswaMetadata } from './modules/siswa.meta.ts';
import { JurusanMetadata } from './modules/jurusan.meta.ts';
import { KelasMetadata } from './modules/kelas.meta.ts';
import { DudiMetadata } from './modules/dudi.meta.ts';
import { GuruMetadata } from './modules/guru.meta.ts';
import { PengajuanMetadata } from './modules/pengajuan.meta.ts';
import { PerizinanMetadata } from './modules/perizinan.meta.ts';
import { SiswaPklMetadata } from './modules/siswaPkl.meta.ts';
import { MonitoringMetadata } from './modules/monitoring.meta.ts';
import { SertifikatMetadata } from './modules/sertifikat.meta.ts';

// Services
import { SiswaService } from './services/SiswaService';
import { JurusanService } from './services/JurusanService';
import { KelasService } from './services/KelasService';
import { DudiService } from './services/DudiService';
import { GuruService } from './services/GuruService';
import { PengajuanService } from './services/PengajuanService';
import { PerizinanService } from './services/PerizinanService';
import { SiswaPklService } from './services/SiswaPklService';
import { MonitoringService } from './services/MonitoringService';
import { SertifikatService } from './services/SertifikatService';

import { AppleToastContainer } from './ui/AppleToastContainer';
import { PublicLandingPage } from './ui/PublicLandingPage';
import type { DocumentHubKey } from './ui/DocumentHubPage';
import { ToastManager } from './core/ToastManager';

// Code-split heavy modals & secondary views for instant initial load
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

const UI_SESSION_KEY = 'hubin_ui_session';

interface SavedUiSession {
  appMode?: 'landing' | 'admin';
  currentModule?: string;
  userRole?: UserRole;
}

function readSavedUiSession(): SavedUiSession {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(UI_SESSION_KEY);
    return raw ? (JSON.parse(raw) as SavedUiSession) : {};
  } catch {
    return {};
  }
}

function writeSavedUiSession(data: SavedUiSession) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(UI_SESSION_KEY, JSON.stringify(data));
  } catch {
    // ignore storage quota issues
  }
}

function clearSavedUiSession() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(UI_SESSION_KEY);
  } catch {
    // ignore
  }
}

export default function App() {
  const initialUi = readSavedUiSession();
  const [appMode, setAppMode] = useState<'landing' | 'admin'>(
    initialUi.appMode === 'admin' ? 'admin' : 'landing'
  );
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<AdminSessionUser | null>(null);
  const [currentModule, setCurrentModule] = useState<string>(
    initialUi.currentModule || 'pengajuan'
  );
  const [userRole, setUserRole] = useState<UserRole>(
    initialUi.userRole || 'Hubin'
  );
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Global modals
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isStudentWizardOpen, setIsStudentWizardOpen] = useState(false);
  const [isTeacherMonitoringOpen, setIsTeacherMonitoringOpen] = useState(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [isDocsOpen, setIsDocsOpen] = useState(false);
  const [isTemplateManagerOpen, setIsTemplateManagerOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [selectedStudentForDocs, setSelectedStudentForDocs] = useState<any>(null);
  const [selectedStudentsListForDocs, setSelectedStudentsListForDocs] = useState<any[]>([]);
  const [allStudentsListForDocs, setAllStudentsListForDocs] = useState<any[]>([]);
  const [isGasOpen, setIsGasOpen] = useState(false);
  const [isSheetConfigOpen, setIsSheetConfigOpen] = useState(false);
  const [isAutoGenerateOpen, setIsAutoGenerateOpen] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [globalSyncing, setGlobalSyncing] = useState(false);
  const [, setRefreshState] = useState(0);

  const googleClient = GoogleSheetClient.getInstance();
  const [configSnapshot, setConfigSnapshot] = useState(() => googleClient.getConfig());
  const [verification, setVerification] = useState<{
    checking: boolean;
    connected: boolean;
    spreadsheetId: string;
    spreadsheetTitle?: string;
    error?: string;
  }>({
    checking: false,
    connected: false,
    spreadsheetId: googleClient.getSpreadsheetId(),
  });

  // Persist non-sensitive UI view state across page reloads
  useEffect(() => {
    writeSavedUiSession({ appMode, currentModule, userRole });
  }, [appMode, currentModule, userRole]);

  // Restore local admin session & subscribe to Firestore Workspace config on mount
  useEffect(() => {
    googleClient.initFromFirestore();

    const unsubConfig = googleClient.addChangeListener(() => {
      setConfigSnapshot(googleClient.getConfig());
    });

    const savedSession = getStoredAdminSession();
    if (savedSession?.user) {
      setCurrentUser(savedSession.user);
      setUserRole(savedSession.user.role);
      const savedUi = readSavedUiSession();
      if (savedUi.appMode === 'admin') {
        setAppMode('admin');
      }
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

  const handleLoginSuccess = (user: AdminSessionUser) => {
    setCurrentUser(user);
    setUserRole(user.role as UserRole);
    setAppMode('admin');
  };

  const handleLogout = async () => {
    clearAdminSession();
    await signOutFirebaseAdmin();
    clearSavedUiSession();
    setCurrentUser(null);
    setAppMode('landing');
    ToastManager.getInstance().show(
      'Sesi Berakhir',
      'info',
      'Anda telah keluar dari portal pengelola.'
    );
  };

  const getRepositoryForModule = (modId: string) => {
    switch (modId) {
      case 'siswa':
        return SiswaService.getInstance();
      case 'jurusan':
        return JurusanService.getInstance();
      case 'kelas':
        return KelasService.getInstance();
      case 'dudi':
        return DudiService.getInstance();
      case 'guru':
        return GuruService.getInstance();
      case 'perizinan':
        return PerizinanService.getInstance();
      case 'siswa_pkl':
        return SiswaPklService.getInstance();
      case 'monitoring':
        return MonitoringService.getInstance();
      case 'sertifikat':
        return SertifikatService.getInstance();
      case 'pengajuan':
      default:
        return PengajuanService.getInstance();
    }
  };

  const handleSyncAll = async () => {
    setGlobalSyncing(true);
    try {
      await Promise.all([
        runConnectionVerification(),
        googleClient.bootstrapAdminTables(true),
      ]);
      if (currentModule.startsWith('doc_')) {
        await Promise.all([
          DudiService.getInstance().reloadFromSpreadsheet().catch(() => null),
          GuruService.getInstance().reloadFromSpreadsheet().catch(() => null),
          PengajuanService.getInstance().reloadFromSpreadsheet().catch(() => null),
          SiswaPklService.getInstance().reloadFromSpreadsheet().catch(() => null),
          MonitoringService.getInstance().reloadFromSpreadsheet().catch(() => null),
        ]);
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

  const openDocsForStudent = (studentData: any, selectedList: any[] = [], allList: any[] = []) => {
    setSelectedStudentForDocs(studentData);
    setSelectedStudentsListForDocs(selectedList);
    setAllStudentsListForDocs(allList);
    setIsDocsOpen(true);
  };

  const renderConnectionGate = () => {
    const activeId = configSnapshot.spreadsheetId;
    const isFirebaseAuthOk = Boolean(currentUser);
    const isSheetOk = verification.connected;
    const isHubin = userRole === 'Hubin';

    if (!isHubin) {
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
                    Layanan Cloud Server Sedang Disiapkan Admin Hubin
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Koneksi database utama belum aktif atau sedang dalam pemeliharaan. Silakan muat ulang dalam beberapa saat atau hubungi Admin Hubin.
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
    if (currentModule === 'workspace' && userRole === 'Hubin') {
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

    switch (currentModule) {
      case 'siswa':
        return (
          <ModulePage
            key={`siswa_${configSnapshot.spreadsheetId}`}
            metadata={SiswaMetadata}
            repository={SiswaService.getInstance()}
            userRole={userRole}
            onOpenDocsForStudent={openDocsForStudent}
            onOpenSimulator={() => setIsSimulatorOpen(true)}
            onOpenGas={() => setIsGasOpen(true)}
            onOpenSheetConfig={() => setIsSheetConfigOpen(true)}
          />
        );
      case 'jurusan':
        return (
          <ModulePage
            key={`jurusan_${configSnapshot.spreadsheetId}`}
            metadata={JurusanMetadata}
            repository={JurusanService.getInstance()}
            userRole={userRole}
            onOpenDocsForStudent={openDocsForStudent}
            onOpenSimulator={() => setIsSimulatorOpen(true)}
            onOpenGas={() => setIsGasOpen(true)}
            onOpenSheetConfig={() => setIsSheetConfigOpen(true)}
          />
        );
      case 'kelas':
        return (
          <ModulePage
            key={`kelas_${configSnapshot.spreadsheetId}`}
            metadata={KelasMetadata}
            repository={KelasService.getInstance()}
            userRole={userRole}
            onOpenDocsForStudent={openDocsForStudent}
            onOpenSimulator={() => setIsSimulatorOpen(true)}
            onOpenGas={() => setIsGasOpen(true)}
            onOpenSheetConfig={() => setIsSheetConfigOpen(true)}
          />
        );
      case 'dudi':
        return (
          <ModulePage
            key={`dudi_${configSnapshot.spreadsheetId}`}
            metadata={DudiMetadata}
            repository={DudiService.getInstance()}
            userRole={userRole}
            onOpenDocsForStudent={openDocsForStudent}
            onOpenSimulator={() => setIsSimulatorOpen(true)}
            onOpenGas={() => setIsGasOpen(true)}
            onOpenSheetConfig={() => setIsSheetConfigOpen(true)}
          />
        );
      case 'guru':
        return (
          <ModulePage
            key={`guru_${configSnapshot.spreadsheetId}`}
            metadata={GuruMetadata}
            repository={GuruService.getInstance()}
            userRole={userRole}
            onOpenDocsForStudent={openDocsForStudent}
            onOpenSimulator={() => setIsSimulatorOpen(true)}
            onOpenGas={() => setIsGasOpen(true)}
            onOpenSheetConfig={() => setIsSheetConfigOpen(true)}
          />
        );
      case 'perizinan':
        return (
          <ModulePage
            key={`perizinan_${configSnapshot.spreadsheetId}`}
            metadata={PerizinanMetadata}
            repository={PerizinanService.getInstance()}
            userRole={userRole}
            onOpenDocsForStudent={openDocsForStudent}
            onOpenSimulator={() => setIsSimulatorOpen(true)}
            onOpenGas={() => setIsGasOpen(true)}
            onOpenSheetConfig={() => setIsSheetConfigOpen(true)}
          />
        );
      case 'siswa_pkl':
        return (
          <ModulePage
            key={`siswa_pkl_${configSnapshot.spreadsheetId}`}
            metadata={SiswaPklMetadata}
            repository={SiswaPklService.getInstance()}
            userRole={userRole}
            onOpenDocsForStudent={openDocsForStudent}
            onOpenSimulator={() => setIsSimulatorOpen(true)}
            onOpenGas={() => setIsGasOpen(true)}
            onOpenSheetConfig={() => setIsSheetConfigOpen(true)}
          />
        );
      case 'monitoring':
        return (
          <ModulePage
            key={`monitoring_${configSnapshot.spreadsheetId}`}
            metadata={MonitoringMetadata}
            repository={MonitoringService.getInstance()}
            userRole={userRole}
            onOpenDocsForStudent={openDocsForStudent}
            onOpenSimulator={() => setIsSimulatorOpen(true)}
            onOpenGas={() => setIsGasOpen(true)}
            onOpenSheetConfig={() => setIsSheetConfigOpen(true)}
          />
        );
      case 'sertifikat':
        return (
          <ModulePage
            key={`sertifikat_${configSnapshot.spreadsheetId}`}
            metadata={SertifikatMetadata}
            repository={SertifikatService.getInstance()}
            userRole={userRole}
            onOpenDocsForStudent={openDocsForStudent}
            onOpenSimulator={() => setIsSimulatorOpen(true)}
            onOpenGas={() => setIsGasOpen(true)}
            onOpenSheetConfig={() => setIsSheetConfigOpen(true)}
          />
        );
      case 'doc_mou':
      case 'doc_surat_tugas':
      case 'doc_pengajuan':
      case 'doc_pengantaran':
      case 'doc_monitoring':
      case 'doc_penarikan':
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
              onOpenTemplateManager={() => setIsTemplateManagerOpen(true)}
            />
          </Suspense>
        );
      case 'pengajuan':
      default:
        return (
          <ModulePage
            key={`pengajuan_${configSnapshot.spreadsheetId}`}
            metadata={PengajuanMetadata}
            repository={PengajuanService.getInstance()}
            userRole={userRole}
            onOpenDocsForStudent={openDocsForStudent}
            onOpenSimulator={() => setIsSimulatorOpen(true)}
            onOpenGas={() => setIsGasOpen(true)}
            onOpenSheetConfig={() => setIsSheetConfigOpen(true)}
          />
        );
    }
  };

  const moduleNames: Record<string, string> = {
    pengajuan: 'Verifikasi Pengajuan PKL',
    perizinan: 'Perizinan PKL',
    siswa_pkl: 'Data Siswa PKL',
    siswa: 'Master Siswa',
    dudi: 'Mitra DUDI & Kuota',
    guru: 'Guru Pendamping',
    monitoring: 'Supervisi 8 Tahap Guru',
    sertifikat: 'Raport & Blangko Sertifikat',
    jurusan: 'Kompetensi Keahlian',
    kelas: 'Kelas & Wali Kelas',
    doc_mou: 'Dokumen MOU DUDI',
    doc_surat_tugas: 'Dokumen Surat Tugas',
    doc_pengajuan: 'Dokumen Pengajuan PKL',
    doc_pengantaran: 'Dokumen Pengantaran PKL',
    doc_monitoring: 'Dokumen Monitoring PKL',
    doc_penarikan: 'Dokumen Penarikan PKL',
    workspace: 'Pusat Berkas & Konfigurasi Server',
  };

  return (
    <div className="min-h-screen bg-slate-50/70 flex flex-col font-sans text-slate-800 antialiased selection:bg-blue-600 selection:text-white">
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

          <div className="flex-1 flex overflow-hidden">
            <Sidebar
              currentModule={currentModule}
              onSelectModule={setCurrentModule}
              userRole={userRole}
              onOpenSimulator={() => setIsSimulatorOpen(true)}
              onOpenDocs={() => {
                setSelectedStudentForDocs(null);
                setSelectedStudentsListForDocs([]);
                setAllStudentsListForDocs([]);
                setIsDocsOpen(true);
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

            <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 lg:py-5 max-w-[1440px] mx-auto w-full">
              {/* Compact Single-Line Cloud Server Context Strip (Hubin Only) */}
              {userRole === 'Hubin' && (
                <div className="mb-4 px-3.5 py-2 bg-white border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600">
                  <div className="flex items-center gap-2 min-w-0">
                    {verification.connected ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                    )}
                    <span className="truncate">
                      {verification.connected ? (
                        <>
                          Cloud Server:{' '}
                          <strong className="text-slate-900 font-semibold">
                            {verification.spreadsheetTitle || configSnapshot.spreadsheetName || configSnapshot.spreadsheetId}
                          </strong>
                          <span className="text-slate-400 mx-1.5 hidden md:inline" aria-hidden="true">·</span>
                          <span className="text-emerald-700 font-medium hidden md:inline">
                            Tersinkron
                          </span>
                        </>
                      ) : configSnapshot.spreadsheetId ? (
                        <>
                          Cloud Server:{' '}
                          <span className="font-mono font-medium text-slate-900">{configSnapshot.spreadsheetId}</span>
                          <span className="text-slate-400 mx-1.5" aria-hidden="true">·</span>
                          <span className="text-amber-700 font-medium">
                            {verification.checking ? 'Memeriksa koneksi...' : 'Menunggu koneksi Cloud Server'}
                          </span>
                        </>
                      ) : (
                        <span className="text-amber-800 font-medium">
                          Cloud Server belum dikonfigurasi
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                    {configSnapshot.spreadsheetUrl && (
                      <a
                        href={configSnapshot.spreadsheetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-8 px-2.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                      >
                        <span>Buka Database</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsTemplateManagerOpen(true)}
                      className="h-8 px-2.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium cursor-pointer transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                    >
                      Template Dokumen
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsSheetConfigOpen(true)}
                      className="h-8 px-2.5 rounded-lg text-blue-600 hover:text-blue-700 hover:bg-blue-50 font-semibold cursor-pointer transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                    >
                      Konfigurasi Server
                    </button>
                  </div>
                </div>
              )}

              {renderActiveModule()}
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
              openDocsForStudent(submitted);
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

        {isTemplateManagerOpen && (
          <GoogleDocsTemplateManagerModal
            isOpen={isTemplateManagerOpen}
            onClose={() => setIsTemplateManagerOpen(false)}
            onUpdated={() => setRefreshState((prev) => prev + 1)}
          />
        )}

        {isWizardOpen && (
          <SetupWizardModal
            isOpen={isWizardOpen}
            onClose={() => setIsWizardOpen(false)}
            onConfigured={() => {
              runConnectionVerification();
              setRefreshState((prev) => prev + 1);
            }}
          />
        )}

        {isSimulatorOpen && (
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
          />
        )}

        {isGasOpen && (
          <GasScriptModal
            isOpen={isGasOpen}
            onClose={() => setIsGasOpen(false)}
          />
        )}

        {isSheetConfigOpen && (
          <SpreadsheetConfigModal
            isOpen={isSheetConfigOpen}
            onClose={() => setIsSheetConfigOpen(false)}
            onConfigUpdated={() => {
              runConnectionVerification();
              setRefreshState((prev) => prev + 1);
            }}
          />
        )}

        {isAutoGenerateOpen && (
          <AutoGenerateSyncModal
            isOpen={isAutoGenerateOpen}
            onClose={() => setIsAutoGenerateOpen(false)}
            onSuccess={() => {
              runConnectionVerification();
              setRefreshState((prev) => prev + 1);
            }}
          />
        )}

        {isAccountModalOpen && (
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
