import { ToastManager } from './ToastManager';
import { GoogleDriveSheetService } from './GoogleDriveSheetService';
import { getFirebaseIdToken } from './auth/GoogleAuthService';
import { getAdminSessionToken } from './auth/LocalAccountAuthService';
import {
  WorkspaceConfigStore,
  EMPTY_WORKSPACE_CONFIG,
  EMPTY_DEFAULT_TEMPLATES,
  PersistedWorkspaceConfig,
} from './firebase/WorkspaceConfigStore';
import type { Unsubscribe } from 'firebase/firestore';
import {
  safeFetchJson,
  normalizeGasUrl,
  validateGasDeployUrl,
  formatGasNetworkError,
  isBackendProxyUnavailableError,
} from './utils/safeFetchJson';
import { IndexedDbSheetCache } from './cache/IndexedDbSheetCache';

const SHEET_TO_REST_RESOURCE: Record<string, string> = {
  Master_Siswa_XI: 'students',
  Master_Siswa: 'students',
  Master_Jurusan: 'majors',
  Master_Kelas_Walas: 'classes',
  Master_DUDI: 'dudi',
  Master_Guru_Pendamping: 'teachers',
  Data_Pengajuan_PKL: 'submissions',
  Data_Perizinan_PKL: 'permits',
  Plotting_Pemberangkatan: 'placements',
  Monitoring_5_Tahap: 'monitoring',
  Monitoring_6_Tahap: 'monitoring',
  Monitoring_8_Tahap: 'monitoring',
  Monitoring_PKL: 'monitoring',
  Nilai_Dan_Sertifikat: 'certificates',
  Master_Akun: 'accounts',
};

export interface AcademicYearConfig {
  year: string;
  label: string;
  spreadsheetId: string;
  spreadsheetName: string;
  spreadsheetUrl: string;
  formUrl?: string;
  formEditUrl?: string;
  driveFolderYearUrl?: string;
  isActive: boolean;
  createdAt?: string;
  totalSiswa?: number;
  totalDudi?: number;
}

export interface WorkspaceTemplateConfig {
  id: string;
  title: string;
  url: string;
  type: string;
  description: string;
}

export interface SheetConnectionConfig {
  activeYear: string;
  spreadsheetId: string;
  spreadsheetName: string;
  spreadsheetUrl: string;
  gasDeployUrl: string;
  driveFolderUrl: string;
  isLiveConnected: boolean;
  isFirestoreHydrated: boolean;
  lastTestedAt: string | null;
  academicYears: AcademicYearConfig[];
  templates: WorkspaceTemplateConfig[];
}

export class GoogleSheetClient {
  private static instance: GoogleSheetClient;
  private activeYear: string = EMPTY_WORKSPACE_CONFIG.activeYear;
  private spreadsheetId: string = '';
  private spreadsheetName: string = '';
  private spreadsheetUrl: string = '';
  private gasDeployUrl: string = '';
  private driveFolderUrl: string = '';
  private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private academicYears: AcademicYearConfig[] = [];
  private templates: WorkspaceTemplateConfig[] = [...EMPTY_DEFAULT_TEMPLATES];
  private isFirestoreHydrated: boolean = false;
  private lastTestedAt: string | null = null;
  private unsubscribeFirestore: Unsubscribe | null = null;
  private initFirestorePromise: Promise<void> | null = null;
  private inFlightSheetFetches = new Map<
    string,
    Promise<{ data: any[]; fromSpreadsheet: boolean; error?: string }>
  >();
  private clientSheetCache = new Map<string, { data: any[]; fetchedAt: number; etag?: string }>();
  private bootstrapPromise: Promise<boolean> | null = null;
  private bootstrapEtag: string | null = null;
  private cacheInvalidationListeners = new Set<(sheetName?: string) => void>();
  private bootstrapListeners = new Set<(tables: string[]) => void>();
  private broadcastChannel: BroadcastChannel | null = null;
  private static readonly CLIENT_SHEET_CACHE_TTL_MS = 90_000;

  private constructor() {
    const cachedCfg = WorkspaceConfigStore.readCachedConfigSync();
    if (cachedCfg) {
      this.hydrateSyncFromCachedConfig(cachedCfg);
      if (this.spreadsheetId) {
        IndexedDbSheetCache.getInstance()
          .preloadAll(this.spreadsheetId, this.activeYear)
          .catch(() => {});
      }
    }

    this.initFromFirestore();

    if (typeof window !== 'undefined') {
      if (typeof BroadcastChannel !== 'undefined') {
        try {
          this.broadcastChannel = new BroadcastChannel('hubin_ssot_sync');
          this.broadcastChannel.onmessage = (ev) => {
            const sheetName = typeof ev?.data?.sheetName === 'string' ? ev.data.sheetName : undefined;
            this.invalidateClientSheetCache(sheetName, true);
          };
        } catch {
          this.broadcastChannel = null;
        }
      }

      window.addEventListener('online', () => {
        this.isOnline = true;
        ToastManager.getInstance().show(
          'Koneksi Internet Aktif',
          'info',
          'Sistem siap menyinkronkan data langsung ke Database Cloud Server.'
        );
      });

      window.addEventListener('offline', () => {
        this.isOnline = false;
        ToastManager.getInstance().show(
          'Koneksi Internet Terputus',
          'error',
          'Operasi baca/tulis Cloud Server membutuhkan koneksi internet aktif.'
        );
      });
    }
  }

  public static getInstance(): GoogleSheetClient {
    if (!GoogleSheetClient.instance) {
      GoogleSheetClient.instance = new GoogleSheetClient();
    }
    return GoogleSheetClient.instance;
  }

  private listeners: Array<() => void> = [];

  public addChangeListener(cb: () => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((fn) => fn !== cb);
    };
  }

  public onSheetCacheInvalidate(cb: (sheetName?: string) => void): () => void {
    this.cacheInvalidationListeners.add(cb);
    return () => {
      this.cacheInvalidationListeners.delete(cb);
    };
  }

  private notifyChange() {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.error('Error in config change listener', e);
      }
    });
  }

  public onBootstrapUpdated(cb: (tables: string[]) => void): () => void {
    this.bootstrapListeners.add(cb);
    return () => {
      this.bootstrapListeners.delete(cb);
    };
  }

  private notifyBootstrapUpdated(tables: string[]) {
    if (tables.length === 0) return;
    this.bootstrapListeners.forEach((cb) => {
      try {
        cb(tables);
      } catch {
        // ignore listener failure
      }
    });
  }

  private hydrateSyncFromCachedConfig(cfg: PersistedWorkspaceConfig) {
    this.activeYear = cfg.activeYear || '2026/2027';
    this.gasDeployUrl = normalizeGasUrl(cfg.gasDeployUrl || '');
    this.driveFolderUrl = cfg.driveFolderUrl || '';
    this.academicYears = Array.isArray(cfg.academicYears) ? cfg.academicYears : [];
    this.templates =
      Array.isArray(cfg.templates) && cfg.templates.length > 0
        ? cfg.templates
        : [...EMPTY_DEFAULT_TEMPLATES];

    const currentYearObj =
      this.academicYears.find((ay) => ay.year === this.activeYear) || this.academicYears[0];

    this.spreadsheetId = cfg.spreadsheetId || currentYearObj?.spreadsheetId || '';
    this.spreadsheetName = cfg.spreadsheetName || currentYearObj?.spreadsheetName || '';
    this.spreadsheetUrl =
      cfg.spreadsheetUrl ||
      currentYearObj?.spreadsheetUrl ||
      (this.spreadsheetId ? `https://docs.google.com/spreadsheets/d/${this.spreadsheetId}` : '');
  }

  private applyConfig(cfg: PersistedWorkspaceConfig) {
    const prevSpreadsheetId = this.spreadsheetId;
    const prevGasUrl = this.gasDeployUrl;
    const prevActiveYear = this.activeYear;
    const prevSpreadsheetName = this.spreadsheetName;
    const prevTemplatesSig = JSON.stringify(this.templates || []);

    this.activeYear = cfg.activeYear || '2026/2027';
    this.gasDeployUrl = normalizeGasUrl(cfg.gasDeployUrl || '');
    this.driveFolderUrl = cfg.driveFolderUrl || '';
    this.academicYears = Array.isArray(cfg.academicYears) ? cfg.academicYears : [];
    this.templates =
      Array.isArray(cfg.templates) && cfg.templates.length > 0
        ? cfg.templates
        : [...EMPTY_DEFAULT_TEMPLATES];

    const currentYearObj =
      this.academicYears.find((ay) => ay.year === this.activeYear) || this.academicYears[0];

    this.spreadsheetId = cfg.spreadsheetId || currentYearObj?.spreadsheetId || '';
    this.spreadsheetName = cfg.spreadsheetName || currentYearObj?.spreadsheetName || '';
    this.spreadsheetUrl =
      cfg.spreadsheetUrl ||
      currentYearObj?.spreadsheetUrl ||
      (this.spreadsheetId ? `https://docs.google.com/spreadsheets/d/${this.spreadsheetId}` : '');

    const coreChanged =
      prevSpreadsheetId !== this.spreadsheetId ||
      prevGasUrl !== this.gasDeployUrl ||
      prevActiveYear !== this.activeYear;

    if (coreChanged) {
      GoogleDriveSheetService.getInstance().clearSheetIdCache(prevSpreadsheetId);
      this.invalidateClientSheetCache(undefined, true);
      this.inFlightSheetFetches.clear();
      if (this.spreadsheetId) {
        IndexedDbSheetCache.getInstance()
          .preloadAll(this.spreadsheetId, this.activeYear)
          .catch(() => {});
      }
    }

    const anyVisualChanged =
      coreChanged ||
      prevSpreadsheetName !== this.spreadsheetName ||
      prevTemplatesSig !== JSON.stringify(this.templates || []);

    const firstHydration = !this.isFirestoreHydrated;
    this.isFirestoreHydrated = true;
    if (anyVisualChanged || (firstHydration && !prevSpreadsheetId)) {
      this.notifyChange();
    }
  }

  private toPersistedPayload(): PersistedWorkspaceConfig {
    return {
      activeYear: this.activeYear,
      spreadsheetId: this.spreadsheetId,
      spreadsheetName: this.spreadsheetName,
      spreadsheetUrl: this.spreadsheetUrl,
      driveFolderUrl: this.driveFolderUrl,
      gasDeployUrl: this.gasDeployUrl,
      academicYears: this.academicYears,
      templates: this.templates,
    };
  }

  private async resolveAuthBearerToken(): Promise<string | null> {
    const sessionToken = getAdminSessionToken();
    if (sessionToken && !sessionToken.startsWith('local_gas_')) {
      return sessionToken;
    }
    return await getFirebaseIdToken();
  }

  /**
   * Hydrate & subscribe in real-time to Firestore /config/workspace (deduplicated)
   */
  public async initFromFirestore(): Promise<void> {
    if (this.initFirestorePromise) {
      return this.initFirestorePromise;
    }

    this.initFirestorePromise = (async () => {
      try {
        const { config } = await WorkspaceConfigStore.fetchConfigFromServer();
        this.applyConfig(config);
      } catch (e) {
        console.warn('[GoogleSheetClient] Firestore initial config fetch failed:', e);
        this.isFirestoreHydrated = true;
        this.notifyChange();
      }

      if (!this.unsubscribeFirestore) {
        this.unsubscribeFirestore = WorkspaceConfigStore.subscribeToConfig(
          (config) => {
            this.applyConfig(config);
          },
          (err) => {
            console.warn('[GoogleSheetClient] Firestore snapshot warning:', err?.message);
          }
        );
      }
    })();

    try {
      await this.initFirestorePromise;
    } finally {
      this.initFirestorePromise = null;
    }
  }

  public async initFromServer(): Promise<void> {
    await this.initFromFirestore();
  }

  public getConfig(): SheetConnectionConfig {
    return {
      activeYear: this.activeYear,
      spreadsheetId: this.spreadsheetId,
      spreadsheetName: this.spreadsheetName,
      spreadsheetUrl: this.spreadsheetUrl,
      gasDeployUrl: this.gasDeployUrl,
      driveFolderUrl: this.driveFolderUrl,
      isLiveConnected: Boolean(this.spreadsheetId && this.gasDeployUrl && this.isOnline),
      isFirestoreHydrated: this.isFirestoreHydrated,
      lastTestedAt: this.lastTestedAt,
      academicYears: this.academicYears,
      templates: this.templates,
    };
  }

  public isConfigured(): boolean {
    return Boolean(this.spreadsheetId && this.spreadsheetId.trim().length > 5);
  }

  public getActiveAcademicYearConfig(): AcademicYearConfig | undefined {
    return this.academicYears.find((ay) => ay.year === this.activeYear);
  }

  public getActiveYear(): string {
    return this.activeYear;
  }

  public getAcademicYears(): AcademicYearConfig[] {
    return this.academicYears;
  }

  public getTemplates(): WorkspaceTemplateConfig[] {
    return this.templates;
  }

  public getSpreadsheetId(): string {
    return this.spreadsheetId;
  }

  public getGasDeployUrl(): string {
    return this.gasDeployUrl;
  }

  private async persistToFirestoreAndNotify(): Promise<void> {
    const saved = await WorkspaceConfigStore.saveConfigToFirestore(this.toPersistedPayload());
    this.applyConfig(saved);
    fetch('/api/cache/invalidate', { method: 'POST' }).catch(() => {});
  }

  /**
   * Update active spreadsheet links in Cloud Firestore (/config/workspace)
   */
  public async updateCentralLinks(params: {
    spreadsheetId?: string;
    spreadsheetName?: string;
    spreadsheetUrl?: string;
    formUrl?: string;
    formEditUrl?: string;
    driveFolderUrl?: string;
  }): Promise<boolean> {
    const toastId = ToastManager.getInstance().show(
      'Menyimpan ke Cloud Server...',
      'pending',
      'Memperbarui ID Database Server agar sinkron ke seluruh perangkat...'
    );

    try {
      if (params.spreadsheetId !== undefined) {
        this.spreadsheetId = params.spreadsheetId;
        this.spreadsheetUrl =
          params.spreadsheetUrl ||
          (params.spreadsheetId ? `https://docs.google.com/spreadsheets/d/${params.spreadsheetId}` : '');
      }
      if (params.spreadsheetName !== undefined) {
        this.spreadsheetName = params.spreadsheetName;
      }
      if (params.driveFolderUrl !== undefined) {
        this.driveFolderUrl = params.driveFolderUrl;
      }

      const existingIdx = this.academicYears.findIndex((ay) => ay.year === this.activeYear);
      if (existingIdx !== -1) {
        this.academicYears = this.academicYears.map((ay) =>
          ay.year === this.activeYear
            ? {
                ...ay,
                ...(params.spreadsheetId ? { spreadsheetId: params.spreadsheetId } : {}),
                ...(params.spreadsheetName ? { spreadsheetName: params.spreadsheetName } : {}),
                ...(params.spreadsheetUrl
                  ? { spreadsheetUrl: params.spreadsheetUrl }
                  : params.spreadsheetId
                  ? { spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${params.spreadsheetId}` }
                  : {}),
                ...(params.formUrl !== undefined ? { formUrl: params.formUrl } : {}),
                ...(params.formEditUrl !== undefined ? { formEditUrl: params.formEditUrl } : {}),
                isActive: true,
              }
            : { ...ay, isActive: false }
        );
      } else if (this.spreadsheetId) {
        this.academicYears = [
          {
            year: this.activeYear,
            label: `Tahun Ajaran ${this.activeYear} (Aktif)`,
            spreadsheetId: this.spreadsheetId,
            spreadsheetName: this.spreadsheetName || `Hubin_SMK_PGRI_2_Ponorogo_${this.activeYear.replace('/', '_')}`,
            spreadsheetUrl: this.spreadsheetUrl,
            formUrl: params.formUrl || '',
            formEditUrl: params.formEditUrl || '',
            isActive: true,
            createdAt: new Date().toISOString(),
          },
          ...this.academicYears.map((ay) => ({ ...ay, isActive: false })),
        ];
      }

      await this.persistToFirestoreAndNotify();

      ToastManager.getInstance().update(
        toastId,
        'Konfigurasi Server Tersimpan!',
        'success',
        'Konfigurasi Database Cloud Server sinkron otomatis ke semua perangkat pengelola.'
      );
      return true;
    } catch (e: any) {
      ToastManager.getInstance().update(
        toastId,
        'Gagal Menyimpan Konfigurasi Server',
        'error',
        e?.message || 'Verifikasi Administrator diperlukan untuk mengubah konfigurasi server.'
      );
      return false;
    }
  }

  /**
   * Switch active academic year in Firestore across all devices
   */
  public async switchAcademicYear(year: string): Promise<boolean> {
    const toastId = ToastManager.getInstance().show(
      'Mengganti Tahun Ajaran...',
      'pending',
      `Menghubungkan database ke Tahun Ajaran ${year}...`
    );

    try {
      const target = this.academicYears.find((ay) => ay.year === year);
      if (!target) {
        throw new Error(`Tahun ajaran ${year} belum terdaftar.`);
      }

      this.activeYear = year;
      this.spreadsheetId = target.spreadsheetId;
      this.spreadsheetName = target.spreadsheetName;
      this.spreadsheetUrl = target.spreadsheetUrl;
      this.academicYears = this.academicYears.map((ay) => ({
        ...ay,
        isActive: ay.year === year,
      }));

      await this.persistToFirestoreAndNotify();

      ToastManager.getInstance().update(
        toastId,
        `Tahun Ajaran Aktif: ${year}`,
        'success',
        `Cloud Server kini terhubung ke Database: ${this.spreadsheetName || `TA ${year}`}`
      );
      return true;
    } catch (err: any) {
      ToastManager.getInstance().update(
        toastId,
        'Gagal Mengganti Tahun Ajaran',
        'error',
        err?.message || 'Gagal menyimpan konfigurasi tahun ajaran ke server'
      );
      return false;
    }
  }

  /**
   * Add a new academic year database entry and persist in Firestore
   */
  public async addNewAcademicYear(
    year: string,
    spreadsheetId: string,
    spreadsheetUrl?: string,
    formUrl?: string,
    spreadsheetName?: string
  ): Promise<boolean> {
    const toastId = ToastManager.getInstance().show(
      'Mendaftarkan Tahun Ajaran Baru...',
      'pending',
      `Menyimpan konfigurasi Database Cloud Server TA ${year}...`
    );

    try {
      const cleanYear = year.trim();
      const exists = this.academicYears.find((ay) => ay.year === cleanYear);
      if (exists) {
        throw new Error(`Tahun ajaran ${cleanYear} sudah terdaftar.`);
      }

      const cleanId = spreadsheetId.trim();
      const newEntry: AcademicYearConfig = {
        year: cleanYear,
        label: `Tahun Ajaran ${cleanYear} (Aktif)`,
        spreadsheetId: cleanId,
        spreadsheetName: spreadsheetName || `Hubin_SMK_PGRI_2_Ponorogo_${cleanYear.replace('/', '_')}`,
        spreadsheetUrl: spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${cleanId}`,
        formUrl: formUrl || '',
        formEditUrl: '',
        driveFolderYearUrl: this.driveFolderUrl,
        isActive: true,
        createdAt: new Date().toISOString(),
      };

      this.academicYears = [
        newEntry,
        ...this.academicYears.map((ay) => ({
          ...ay,
          isActive: false,
          label: ay.label.replace('(Aktif)', '(Arsip)'),
        })),
      ];
      this.activeYear = cleanYear;
      this.spreadsheetId = cleanId;
      this.spreadsheetName = newEntry.spreadsheetName;
      this.spreadsheetUrl = newEntry.spreadsheetUrl;

      await this.persistToFirestoreAndNotify();

      ToastManager.getInstance().update(
        toastId,
        `Tahun Ajaran ${cleanYear} Tersimpan!`,
        'success',
        'Database Cloud Server baru terdaftar permanen & aktif di semua perangkat.'
      );
      return true;
    } catch (err: any) {
      ToastManager.getInstance().update(
        toastId,
        'Gagal Menambahkan Tahun Ajaran',
        'error',
        err?.message || 'Error menyimpan tahun ajaran'
      );
      return false;
    }
  }

  /**
   * Save central Spreadsheet ID, GAS URL, & Drive Folder URL to Firestore
   */
  public async saveCentralConfig(
    spreadsheetId: string,
    gasDeployUrl: string,
    driveFolderUrl?: string,
    spreadsheetName?: string
  ): Promise<boolean> {
    const toastId = ToastManager.getInstance().show(
      'Menyimpan Konfigurasi Server...',
      'pending',
      'Menyinkronkan pengaturan Database & Endpoint Cloud Server untuk semua perangkat...'
    );

    try {
      this.spreadsheetId = spreadsheetId.trim();
      this.spreadsheetUrl = this.spreadsheetId
        ? `https://docs.google.com/spreadsheets/d/${this.spreadsheetId}`
        : '';
      if (spreadsheetName !== undefined) {
        this.spreadsheetName = spreadsheetName;
      }
      this.gasDeployUrl = normalizeGasUrl(gasDeployUrl);
      if (driveFolderUrl !== undefined) {
        this.driveFolderUrl = driveFolderUrl.trim();
      }

      const hasActive = this.academicYears.some((ay) => ay.year === this.activeYear);
      if (hasActive) {
        this.academicYears = this.academicYears.map((ay) =>
          ay.year === this.activeYear
            ? {
                ...ay,
                spreadsheetId: this.spreadsheetId,
                spreadsheetName: this.spreadsheetName || ay.spreadsheetName,
                spreadsheetUrl: this.spreadsheetUrl,
                isActive: true,
              }
            : { ...ay, isActive: false }
        );
      } else if (this.spreadsheetId) {
        this.academicYears = [
          {
            year: this.activeYear,
            label: `Tahun Ajaran ${this.activeYear} (Aktif)`,
            spreadsheetId: this.spreadsheetId,
            spreadsheetName: this.spreadsheetName || `Hubin_SMK_PGRI_2_Ponorogo_${this.activeYear.replace('/', '_')}`,
            spreadsheetUrl: this.spreadsheetUrl,
            isActive: true,
            createdAt: new Date().toISOString(),
          },
          ...this.academicYears,
        ];
      }

      await this.persistToFirestoreAndNotify();

      ToastManager.getInstance().update(
        toastId,
        'Konfigurasi Server Tersimpan!',
        'success',
        'Seluruh perangkat kini terhubung ke Database Cloud Server yang sama.'
      );
      return true;
    } catch (err: any) {
      ToastManager.getInstance().update(
        toastId,
        'Gagal Menyimpan Konfigurasi Server',
        'error',
        err?.message || 'Verifikasi Administrator diperlukan untuk menyimpan konfigurasi server.'
      );
      return false;
    }
  }

  /**
   * Update document template IDs permanently in Firestore
   */
  public async updateTemplates(templates: WorkspaceTemplateConfig[]): Promise<boolean> {
    const toastId = ToastManager.getInstance().show(
      'Menyimpan Template Dokumen...',
      'pending',
      'Menyinkronkan template dokumen resmi ke Konfigurasi Server...'
    );

    try {
      this.templates = templates;
      await this.persistToFirestoreAndNotify();

      ToastManager.getInstance().update(
        toastId,
        'Template Dokumen Tersimpan!',
        'success',
        'Seluruh ID template dokumen kini tersimpan permanen di Cloud Server untuk semua perangkat.'
      );
      return true;
    } catch (e: any) {
      ToastManager.getInstance().update(
        toastId,
        'Gagal Menyimpan Template',
        'error',
        e?.message || 'Verifikasi Administrator diperlukan.'
      );
      return false;
    }
  }

  /**
   * Silent verification for Cloud GAS Web App channel (cross-device & refresh-proof).
   */
  public async pingGasConnection(
    customGasUrl?: string,
    customSpreadsheetId?: string
  ): Promise<{
    connected: boolean;
    title?: string;
    sheets?: string[];
    error?: string;
  }> {
    const rawGasUrl = customGasUrl !== undefined ? customGasUrl : this.gasDeployUrl;
    const validation = validateGasDeployUrl(rawGasUrl);
    if (!validation.valid) {
      return {
        connected: false,
        error: validation.error || 'URL Endpoint Cloud Server (/exec) belum dikonfigurasi.',
      };
    }

    const targetGas = validation.normalizedUrl;
    const targetSpreadsheetId = (
      customSpreadsheetId !== undefined ? customSpreadsheetId : this.spreadsheetId
    ).trim();

    if (!targetSpreadsheetId && customGasUrl === undefined) {
      return { connected: false, error: 'ID Database Cloud Server belum dikonfigurasi.' };
    }
    if (!this.isOnline) {
      return { connected: false, error: 'Perangkat sedang offline.' };
    }

    // 1. Prefer server-side proxy when Admin session token is available
    const bearerToken = await this.resolveAuthBearerToken();
    if (bearerToken) {
      try {
        const params = new URLSearchParams();
        if (customGasUrl !== undefined) {
          params.set('gasUrl', targetGas);
        }
        if (targetSpreadsheetId) {
          params.set('spreadsheetId', targetSpreadsheetId);
        }
        const qs = params.toString();
        const { ok, status, data: json } = await safeFetchJson(`/api/admin/gas-ping${qs ? `?${qs}` : ''}`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${bearerToken}`,
          },
        });
        if (ok && json?.success) {
          return {
            connected: true,
            title: json.title,
            sheets: Array.isArray(json.sheets) ? json.sheets : [],
          };
        }
        if (json?.message && status < 500 && json?.code !== 'UNAUTHORIZED') {
          return { connected: false, error: json.message };
        }
      } catch (err: any) {
        if (!isBackendProxyUnavailableError(err)) {
          return { connected: false, error: err?.message || 'Gagal menghubungi proxy Cloud Server.' };
        }
      }
    }

    // 2. Fallback direct GAS GET (static SPA hosting / direct browser test)
    try {
      const sep = targetGas.includes('?') ? '&' : '?';
      const sidParam = targetSpreadsheetId
        ? `&spreadsheetId=${encodeURIComponent(targetSpreadsheetId)}`
        : '';
      const { ok, data: json } = await safeFetchJson(
        `${targetGas}${sep}action=PING&sheet=Master_Jurusan&year=${encodeURIComponent(
          this.activeYear
        )}${sidParam}`,
        {
          method: 'GET',
          redirect: 'follow',
        }
      );

      if (!ok || json?.error) {
        return {
          connected: false,
          error: json?.error || 'Endpoint Cloud Server tidak merespon PING dengan benar.',
        };
      }

      return {
        connected: true,
        title: json?.title,
        sheets: Array.isArray(json?.sheets) ? json.sheets : [],
      };
    } catch (err: any) {
      return {
        connected: false,
        error: formatGasNetworkError(err, targetGas),
      };
    }
  }

  public async testConnection(
    customGasUrl?: string,
    customSpreadsheetId?: string
  ): Promise<{ success: boolean; message: string; title?: string; sheets?: string[] }> {
    const targetGas = normalizeGasUrl(customGasUrl ?? this.gasDeployUrl);
    const toastId = ToastManager.getInstance().show(
      'Menguji Koneksi Cloud Server...',
      'pending',
      'Memeriksa koneksi ke endpoint Database Cloud Server...'
    );

    if (!targetGas) {
      ToastManager.getInstance().update(
        toastId,
        'Endpoint Server Belum Diisi',
        'error',
        'Masukkan URL Endpoint Server (/exec) pada Konfigurasi Server.'
      );
      return { success: false, message: 'URL Endpoint Server (/exec) belum diatur.' };
    }

    const pingRes = await this.pingGasConnection(targetGas, customSpreadsheetId);
    if (pingRes.connected) {
      const now = new Date().toLocaleTimeString('id-ID');
      this.lastTestedAt = now;
      const sheetCountNote =
        Array.isArray(pingRes.sheets) && pingRes.sheets.length > 0
          ? ` — ${pingRes.sheets.length} tabel server terdeteksi`
          : '';

      ToastManager.getInstance().update(
        toastId,
        'Koneksi Cloud Server Berhasil!',
        'success',
        `Terhubung ke "${pingRes.title || 'Database Cloud Server'}"${sheetCountNote} (${now})`
      );
      return {
        success: true,
        title: pingRes.title,
        sheets: pingRes.sheets,
        message: `Terhubung ke Cloud Server "${pingRes.title || 'Database Server'}"${sheetCountNote}.`,
      };
    }

    const msg = pingRes.error || 'Pastikan Endpoint Server disetel dengan akses "Anyone (Siapa saja)".';
    ToastManager.getInstance().update(
      toastId,
      'Gagal Menghubungi Cloud Server',
      'error',
      msg
    );
    return { success: false, message: msg };
  }

  public async triggerAutoGenerateAllSheetsAndForm(
    targetSpreadsheetId?: string
  ): Promise<{ success: boolean; message: string; formUrl?: string; spreadsheetUrl?: string }> {
    const sId = targetSpreadsheetId || this.spreadsheetId;
    const toastId = ToastManager.getInstance().show(
      'Inisialisasi Tabel Cloud Server...',
      'pending',
      `Menyiapkan struktur tabel terpisah untuk TA ${this.activeYear}...`
    );

    if (this.gasDeployUrl && this.isOnline) {
      try {
        const gasUrl = normalizeGasUrl(this.gasDeployUrl);
        const { ok, data: resJson } = await safeFetchJson(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'SETUP_ALL_SHEETS_AND_FORM',
            spreadsheetId: sId,
            year: this.activeYear,
          }),
        });

        if (ok && !resJson?.error) {
          ToastManager.getInstance().update(
            toastId,
            'Struktur Cloud Server Siap!',
            'success',
            'Seluruh tabel server dan formulir pendaftaran berhasil disiapkan.'
          );
          return {
            success: true,
            message: 'Berhasil menyiapkan seluruh struktur tabel pada Database Cloud Server.',
            formUrl: resJson.formUrl,
            spreadsheetUrl: resJson.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${sId}`,
          };
        }
      } catch (err: any) {
        console.warn('GAS auto-generate fetch failed:', err);
      }
    }

    ToastManager.getInstance().update(
      toastId,
      'Gunakan Template Excel atau Skrip Inisialisasi',
      'info',
      'Unduh file Master Excel (.xlsx) atau jalankan skrip inisialisasi pada Konfigurasi Server.'
    );

    return {
      success: false,
      message:
        'Gunakan tab "Download File Master Excel (.xlsx)" atau jalankan skrip di tab "Skrip API Integrasi Server".',
      spreadsheetUrl: sId ? `https://docs.google.com/spreadsheets/d/${sId}` : undefined,
    };
  }

  public getCachedSnapshotSync(
    sheetName: string
  ): { data: any[]; etag?: string; updatedAt: number } | null {
    if (!this.spreadsheetId) return null;
    const cacheKey = `${this.spreadsheetId}::${sheetName}`;
    const inMem = this.clientSheetCache.get(cacheKey);
    if (inMem) {
      return { data: inMem.data, etag: inMem.etag, updatedAt: inMem.fetchedAt };
    }
    const idbKey = IndexedDbSheetCache.buildKey(this.spreadsheetId, this.activeYear, sheetName);
    const fromSync = IndexedDbSheetCache.getInstance().getSync(idbKey);
    if (fromSync) {
      this.clientSheetCache.set(cacheKey, {
        data: fromSync.data,
        fetchedAt: fromSync.updatedAt,
        etag: fromSync.etag,
      });
      return { data: fromSync.data, etag: fromSync.etag, updatedAt: fromSync.updatedAt };
    }
    return null;
  }

  public async getCachedSnapshot(
    sheetName: string
  ): Promise<{ data: any[]; etag?: string; updatedAt: number } | null> {
    if (!this.spreadsheetId) return null;
    const syncHit = this.getCachedSnapshotSync(sheetName);
    if (syncHit) return syncHit;

    const cacheKey = `${this.spreadsheetId}::${sheetName}`;
    const idbKey = IndexedDbSheetCache.buildKey(this.spreadsheetId, this.activeYear, sheetName);
    const fromIdb = await IndexedDbSheetCache.getInstance().get(idbKey);
    if (fromIdb) {
      this.clientSheetCache.set(cacheKey, {
        data: fromIdb.data,
        fetchedAt: fromIdb.updatedAt,
        etag: fromIdb.etag,
      });
      return { data: fromIdb.data, etag: fromIdb.etag, updatedAt: fromIdb.updatedAt };
    }
    return null;
  }

  public async saveCachedSnapshot(
    sheetName: string,
    rows: any[],
    etag?: string
  ): Promise<void> {
    if (!this.spreadsheetId) return;
    const cacheKey = `${this.spreadsheetId}::${sheetName}`;
    const now = Date.now();
    this.clientSheetCache.set(cacheKey, { data: rows, fetchedAt: now, etag });
    const idbKey = IndexedDbSheetCache.buildKey(this.spreadsheetId, this.activeYear, sheetName);
    await IndexedDbSheetCache.getInstance().set(idbKey, rows, etag).catch(() => {});
  }

  public invalidateClientSheetCache(sheetName?: string, fromBroadcast: boolean = false): void {
    const idb = IndexedDbSheetCache.getInstance();
    if (!sheetName) {
      this.clientSheetCache.clear();
      this.bootstrapEtag = null;
      idb.clearAll().catch(() => {});
    } else {
      this.clientSheetCache.delete(`${this.spreadsheetId}::${sheetName}`);
      this.bootstrapEtag = null;
      if (this.spreadsheetId) {
        idb.delete(IndexedDbSheetCache.buildKey(this.spreadsheetId, this.activeYear, sheetName)).catch(() => {});
      }
      if (sheetName === 'Master_Siswa_XI' || sheetName === 'Master_Siswa') {
        this.clientSheetCache.delete(`${this.spreadsheetId}::Master_Siswa_XI`);
        this.clientSheetCache.delete(`${this.spreadsheetId}::Master_Siswa`);
        if (this.spreadsheetId) {
          idb.delete(IndexedDbSheetCache.buildKey(this.spreadsheetId, this.activeYear, 'Master_Siswa_XI')).catch(() => {});
        }
      }
    }

    this.cacheInvalidationListeners.forEach((cb) => {
      try {
        cb(sheetName);
      } catch {
        // ignore listener failure
      }
    });

    if (!fromBroadcast && this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({ sheetName: sheetName || null, ts: Date.now() });
      } catch {
        // ignore closed channel
      }
    }
  }

  /**
   * Single-request Admin Bootstrap via GET /api/v1/bootstrap.
   * Pre-warms RAM and IndexedDB for all active master & operational tables in 1 HTTP call.
   */
  public async bootstrapAdminTables(forceFresh: boolean = false): Promise<boolean> {
    if (!this.spreadsheetId || !this.gasDeployUrl || !this.isOnline) {
      return false;
    }
    if (!forceFresh && this.bootstrapPromise) {
      return this.bootstrapPromise;
    }

    this.bootstrapPromise = (async () => {
      const bearerToken = await this.resolveAuthBearerToken();
      if (!bearerToken) return false;

      try {
        const headers: Record<string, string> = {
          Accept: 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        };
        if (!forceFresh && this.bootstrapEtag) {
          headers['If-None-Match'] = this.bootstrapEtag;
        }

        const qs = forceFresh ? `?fresh=1&_ts=${Date.now()}` : '';
        const res = await safeFetchJson(`/api/v1/bootstrap${qs}`, {
          method: 'GET',
          timeoutMs: 18_000,
          headers,
        });

        if (res.notModified) {
          const now = Date.now();
          for (const [k, entry] of this.clientSheetCache.entries()) {
            if (k.startsWith(`${this.spreadsheetId}::`)) {
              this.clientSheetCache.set(k, { ...entry, fetchedAt: now });
            }
          }
          return true;
        }

        const json = res.data;
        if (res.ok && json?.success && json?.tables && typeof json.tables === 'object') {
          if (res.etag || json.etag) {
            this.bootstrapEtag = res.etag || json.etag;
          }
          const normalizer = GoogleDriveSheetService.getInstance();
          const etagsMap: Record<string, string> = json.etags || {};
          const updatedTables: string[] = [];

          await Promise.all(
            Object.entries(json.tables).map(async ([tableName, rawRows]) => {
              if (!Array.isArray(rawRows)) return;
              const normalized = normalizer.normalizeExternalRows(tableName, rawRows);
              await this.saveCachedSnapshot(tableName, normalized, etagsMap[tableName]);
              updatedTables.push(tableName);
            })
          );
          this.notifyBootstrapUpdated(updatedTables);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    })();

    try {
      return await this.bootstrapPromise;
    } finally {
      this.bootstrapPromise = null;
    }
  }

  /**
   * 100% SSOT Fetch via Full REST API (/api/v1/:resource) with ETag 304 + IndexedDB persistence
   */
  public async fetchSheetData(
    sheetName: string,
    forceFresh: boolean = false
  ): Promise<{ data: any[]; fromSpreadsheet: boolean; error?: string; notModified?: boolean }> {
    if (!this.spreadsheetId) {
      return {
        data: [],
        fromSpreadsheet: false,
        error: 'Konfigurasi Database Cloud Server belum diatur.',
      };
    }

    if (!this.isOnline) {
      const offlineSnapshot = await this.getCachedSnapshot(sheetName);
      if (offlineSnapshot) {
        return { data: offlineSnapshot.data, fromSpreadsheet: true };
      }
      return {
        data: [],
        fromSpreadsheet: false,
        error: 'Perangkat sedang offline. Sambungkan internet untuk mengakses Cloud Server.',
      };
    }

    if (!this.gasDeployUrl) {
      return {
        data: [],
        fromSpreadsheet: false,
        error: 'URL Endpoint Cloud Server (/exec) belum dikonfigurasi.',
      };
    }

    const cacheKey = `${this.spreadsheetId}::${sheetName}`;
    if (!forceFresh) {
      // Do NOT block the active module behind all 10 bootstrap tables on cold start:
      // fetch the active table immediately in parallel while bootstrap warms the rest.
      const cached = this.clientSheetCache.get(cacheKey);
      if (cached && Date.now() - cached.fetchedAt < GoogleSheetClient.CLIENT_SHEET_CACHE_TTL_MS) {
        return { data: cached.data, fromSpreadsheet: true };
      }
      const existingFlight = this.inFlightSheetFetches.get(cacheKey);
      if (existingFlight) {
        return existingFlight;
      }
    } else {
      this.clientSheetCache.delete(cacheKey);
    }

    const runFetch = (async () => {
      const normalizer = GoogleDriveSheetService.getInstance();
      const priorSnapshot = !forceFresh ? await this.getCachedSnapshot(sheetName) : null;

      // 1. Full REST API v1 (/api/v1/:resource) with ETag / If-None-Match 304 revalidation
      const bearerToken = await this.resolveAuthBearerToken();
      if (bearerToken) {
        const restSlug = SHEET_TO_REST_RESOURCE[sheetName] || sheetName;
        try {
          const bustParam = forceFresh ? `?fresh=1&_ts=${Date.now()}` : '';
          const headers: Record<string, string> = {
            Accept: 'application/json',
            Authorization: `Bearer ${bearerToken}`,
          };
          if (!forceFresh && priorSnapshot?.etag) {
            headers['If-None-Match'] = priorSnapshot.etag;
          }

          const { ok, status, notModified, etag, data: json } = await safeFetchJson(
            `/api/v1/${encodeURIComponent(restSlug)}${bustParam}`,
            {
              method: 'GET',
              timeoutMs: 16_000,
              headers,
            }
          );

          if (notModified && priorSnapshot) {
            await this.saveCachedSnapshot(sheetName, priorSnapshot.data, etag || priorSnapshot.etag);
            return {
              data: priorSnapshot.data,
              fromSpreadsheet: true,
              notModified: true,
            };
          }

          if (ok && json?.success && Array.isArray(json.data)) {
            const normalized = normalizer.normalizeExternalRows(sheetName, json.data);
            await this.saveCachedSnapshot(sheetName, normalized, etag || json.etag);
            return {
              data: normalized,
              fromSpreadsheet: true,
              notModified: false,
            };
          }

          if (json?.message && status >= 400 && status < 500 && status !== 401 && status !== 403 && status !== 404) {
            throw new Error(json.message);
          }
        } catch (proxyErr: any) {
          if (!isBackendProxyUnavailableError(proxyErr)) {
            throw proxyErr;
          }
        }
      }

      // 2. Direct Cloud GAS Web App fallback (static SPA preview host)
      const validation = validateGasDeployUrl(this.gasDeployUrl);
      if (!validation.valid) {
        throw new Error(validation.error || 'URL Endpoint Cloud Server tidak valid.');
      }
      const gasUrl = validation.normalizedUrl;
      const sep = gasUrl.includes('?') ? '&' : '?';
      const freshParams = forceFresh ? `&fresh=1&_ts=${Date.now()}` : '';
      try {
        const { ok, status, data: json } = await safeFetchJson(
          `${gasUrl}${sep}sheet=${encodeURIComponent(sheetName)}&year=${encodeURIComponent(
            this.activeYear
          )}&spreadsheetId=${encodeURIComponent(this.spreadsheetId)}${freshParams}`,
          { method: 'GET', redirect: 'follow', cache: 'no-store', timeoutMs: 18_000 }
        );
        if (!ok) {
          throw new Error(`Cloud Server gagal memuat data modul (${status}).`);
        }
        if ((json.status === 'success' || json.success) && Array.isArray(json.data)) {
          const normalized = normalizer.normalizeExternalRows(sheetName, json.data);
          await this.saveCachedSnapshot(sheetName, normalized);
          return {
            data: normalized,
            fromSpreadsheet: true,
          };
        }
        throw new Error(json.error || 'Format respon Cloud Server tidak valid.');
      } catch (err: any) {
        throw new Error(formatGasNetworkError(err, gasUrl));
      }
    })();

    this.inFlightSheetFetches.set(cacheKey, runFetch);
    try {
      return await runFetch;
    } finally {
      this.inFlightSheetFetches.delete(cacheKey);
    }
  }

  private normalizeOutgoingPayload(
    sheetName: string,
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'BULK_DELETE' | 'BULK_UPDATE' | 'IMPORT' | 'SYNC_ALL',
    payload: any
  ): any {
    const normalizer = GoogleDriveSheetService.getInstance();

    if (action === 'CREATE' || action === 'UPDATE') {
      return normalizer.prepareOutgoingRecord(sheetName, payload);
    }
    if (action === 'IMPORT' || action === 'SYNC_ALL') {
      return Array.isArray(payload)
        ? payload.map((row) => normalizer.prepareOutgoingRecord(sheetName, row))
        : payload;
    }
    if (action === 'BULK_UPDATE' && payload && typeof payload === 'object') {
      return {
        ...payload,
        updatedRows: Array.isArray(payload.updatedRows)
          ? payload.updatedRows.map((row: any) => normalizer.prepareOutgoingRecord(sheetName, row))
          : [],
      };
    }
    return payload;
  }

  private async postViaServerOrDirectGas(
    sheetName: string,
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'BULK_DELETE' | 'BULK_UPDATE' | 'IMPORT' | 'SYNC_ALL',
    payload: any
  ): Promise<void> {
    this.invalidateClientSheetCache(sheetName);
    const preparedPayload = this.normalizeOutgoingPayload(sheetName, action, payload);

    const bearerToken = await this.resolveAuthBearerToken();
    if (bearerToken) {
      const restSlug = SHEET_TO_REST_RESOURCE[sheetName] || sheetName;
      const rawId =
        preparedPayload && typeof preparedPayload === 'object' && !Array.isArray(preparedPayload)
          ? preparedPayload.id || preparedPayload.deletedRow?.id || preparedPayload.updatedRow?.id || ''
          : '';
      const { cleanId } = GoogleDriveSheetService.stripSyntheticRowSuffix(rawId);
      const targetId = encodeURIComponent(String(cleanId || rawId || 'unknown'));

      let endpoint = `/api/v1/${encodeURIComponent(restSlug)}`;
      let method: 'POST' | 'PATCH' | 'DELETE' = 'POST';
      let requestBody: any = preparedPayload;

      if (action === 'CREATE') {
        endpoint = `/api/v1/${encodeURIComponent(restSlug)}`;
        method = 'POST';
        requestBody = preparedPayload;
      } else if (action === 'UPDATE') {
        endpoint = `/api/v1/${encodeURIComponent(restSlug)}/${targetId}`;
        method = 'PATCH';
        requestBody = preparedPayload;
      } else if (action === 'DELETE') {
        endpoint = `/api/v1/${encodeURIComponent(restSlug)}/${targetId}`;
        method = 'DELETE';
        requestBody = preparedPayload;
      } else {
        endpoint = `/api/v1/${encodeURIComponent(restSlug)}/bulk`;
        method = 'POST';
        requestBody = {
          action,
          data: preparedPayload,
        };
      }

      try {
        const { ok, status, data: json } = await safeFetchJson(endpoint, {
          method,
          timeoutMs: 20_000,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${bearerToken}`,
          },
          body: JSON.stringify(requestBody),
        });
        if (ok && json?.success) {
          return;
        }
        if (json?.message && status >= 400 && status < 500 && status !== 401 && status !== 403 && status !== 404) {
          throw new Error(json.message);
        }
      } catch (proxyErr: any) {
        if (!isBackendProxyUnavailableError(proxyErr)) {
          throw proxyErr;
        }
      }
    }

    const validation = validateGasDeployUrl(this.gasDeployUrl);
    if (!validation.valid) {
      throw new Error(validation.error || 'URL Endpoint Cloud Server tidak valid.');
    }
    const gasUrl = validation.normalizedUrl;
    const rawId =
      preparedPayload && typeof preparedPayload === 'object' && !Array.isArray(preparedPayload)
        ? preparedPayload.id || preparedPayload.deletedRow?.id || preparedPayload.updatedRow?.id || ''
        : '';
    const { cleanId } = GoogleDriveSheetService.stripSyntheticRowSuffix(rawId);

    try {
      const { ok, status, data: json } = await safeFetchJson(gasUrl, {
        method: 'POST',
        timeoutMs: 22_000,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        redirect: 'follow',
        body: JSON.stringify({
          action,
          sheetName,
          year: this.activeYear,
          spreadsheetId: this.spreadsheetId,
          id: cleanId || rawId,
          sheetRowNumber:
            preparedPayload?._sheetRowNumber ||
            preparedPayload?.deletedRow?._sheetRowNumber ||
            undefined,
          data: preparedPayload,
          timestamp: new Date().toISOString(),
        }),
      });

      if (!ok || json?.error) {
        throw new Error(json?.error || `Cloud Server mengembalikan status ${status}`);
      }
      await safeFetchJson(`/api/cache/invalidate?sheet=${encodeURIComponent(sheetName)}`, {
        method: 'POST',
        timeoutMs: 2_500,
      }).catch(() => {});
    } catch (err: any) {
      throw new Error(formatGasNetworkError(err, gasUrl));
    }
  }

  public async recalculateRelationsOnServer(scope: string = 'all'): Promise<{
    handledByServer: boolean;
    summary?: {
      updatedPlacements: number;
      updatedDudi: number;
      updatedGuru: number;
      updatedJurusan: number;
      updatedKelas: number;
    };
  }> {
    const bearerToken = await this.resolveAuthBearerToken();
    if (!bearerToken) return { handledByServer: false };

    try {
      const { ok, data: json } = await safeFetchJson('/api/v1/relations/recalculate', {
        method: 'POST',
        timeoutMs: 22_000,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({ scope }),
      });

      if (ok && json?.success && json?.summary) {
        for (const tbl of [
          'Master_DUDI',
          'Master_Guru_Pendamping',
          'Master_Jurusan',
          'Master_Kelas_Walas',
        ]) {
          this.invalidateClientSheetCache(tbl);
        }
        return { handledByServer: true, summary: json.summary };
      }
      return { handledByServer: false };
    } catch {
      return { handledByServer: false };
    }
  }

  /**
   * Strict CRUD commit to Cloud Server (fails loudly if not connected)
   */
  public async commitToSpreadsheet(
    sheetName: string,
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'BULK_DELETE' | 'BULK_UPDATE' | 'IMPORT',
    payload: any,
    options?: { silentToast?: boolean }
  ): Promise<{ success: boolean; fromLiveSheet: boolean; error?: string }> {
    const silent = Boolean(options?.silentToast);

    if (!this.spreadsheetId) {
      const msg = 'Konfigurasi Database Cloud Server belum diatur.';
      if (!silent) ToastManager.getInstance().show('Server Belum Dikonfigurasi', 'error', msg);
      return { success: false, fromLiveSheet: false, error: msg };
    }

    if (!this.isOnline) {
      const msg = 'Tidak ada koneksi internet untuk menyimpan data ke Cloud Server.';
      if (!silent) ToastManager.getInstance().show('Koneksi Offline', 'error', msg);
      return { success: false, fromLiveSheet: false, error: msg };
    }

    if (!this.gasDeployUrl) {
      const msg = 'URL Endpoint Cloud Server (/exec) belum dikonfigurasi.';
      if (!silent) ToastManager.getInstance().show('Endpoint Server Belum Diatur', 'error', msg);
      return { success: false, fromLiveSheet: false, error: msg };
    }

    const toastId = !silent
      ? ToastManager.getInstance().show(
          'Menyimpan ke Cloud Server...',
          'pending',
          `Memproses sinkronisasi data ke Cloud Server (TA ${this.activeYear})`,
          sheetName
        )
      : null;

    try {
      await this.postViaServerOrDirectGas(sheetName, action, payload);
      if (toastId) {
        ToastManager.getInstance().update(
          toastId,
          'Tersimpan di Cloud Server!',
          'success',
          'Data berhasil ditulis dan disinkronkan ke Cloud Server.'
        );
      }
      return { success: true, fromLiveSheet: true };
    } catch (err: any) {
      const errMsg = err?.message || 'Gagal menghubungi Cloud Server';
      if (toastId) {
        ToastManager.getInstance().update(toastId, 'Gagal Menyimpan ke Cloud Server', 'error', errMsg);
      }
      return { success: false, fromLiveSheet: false, error: errMsg };
    }
  }

  public async syncSheet(
    sheetName: string,
    rows: any[],
    options?: { silentToast?: boolean }
  ): Promise<{ success: boolean; message: string }> {
    return this.syncSheetFull(sheetName, rows, options);
  }

  public async syncSheetFull(
    sheetName: string,
    rows: any[],
    options?: { silentToast?: boolean }
  ): Promise<{ success: boolean; message: string }> {
    const silent = Boolean(options?.silentToast);

    if (!this.spreadsheetId) {
      const msg = 'Konfigurasi Database Cloud Server belum diatur.';
      if (!silent) ToastManager.getInstance().show('Server Belum Dikonfigurasi', 'error', msg);
      return { success: false, message: msg };
    }

    if (!this.gasDeployUrl || !this.isOnline) {
      const msg = 'Pastikan koneksi internet aktif dan Endpoint Cloud Server sudah terpasang.';
      if (!silent) ToastManager.getInstance().show('Koneksi Server Belum Siap', 'error', msg);
      return { success: false, message: msg };
    }

    const toastId = !silent
      ? ToastManager.getInstance().show(
          'Menyinkronkan ke Cloud Server...',
          'pending',
          `Menyegarkan data terbaru di Cloud Server (TA ${this.activeYear})`,
          sheetName
        )
      : null;

    try {
      await this.postViaServerOrDirectGas(sheetName, 'SYNC_ALL', rows);
      const now = new Date().toLocaleTimeString('id-ID');
      if (toastId) {
        ToastManager.getInstance().update(
          toastId,
          'Sinkronisasi Cloud Server Berhasil',
          'success',
          `${rows.length} baris tersinkron di Cloud Server (${now}).`
        );
      }
      return { success: true, message: 'Berhasil tersinkronisasi' };
    } catch (err: any) {
      if (toastId) {
        ToastManager.getInstance().update(toastId, 'Gagal Sinkronisasi Cloud Server', 'error', err?.message || 'Error');
      }
      return { success: false, message: err?.message || 'Error' };
    }
  }
}
