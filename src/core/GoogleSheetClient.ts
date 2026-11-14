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
  HtmlResponseError,
} from './utils/safeFetchJson';

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
  private clientSheetCache = new Map<string, { data: any[]; fetchedAt: number }>();
  private static readonly CLIENT_SHEET_CACHE_TTL_MS = 90_000;

  private constructor() {
    this.initFromFirestore();

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline = true;
        ToastManager.getInstance().show(
          'Koneksi Internet Aktif',
          'info',
          'Sistem siap menyinkronkan data langsung ke Google Spreadsheet via Cloud GAS.'
        );
      });

      window.addEventListener('offline', () => {
        this.isOnline = false;
        ToastManager.getInstance().show(
          'Koneksi Internet Terputus',
          'error',
          'Operasi baca/tulis Google Spreadsheet membutuhkan koneksi internet aktif.'
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

  private notifyChange() {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.error('Error in config change listener', e);
      }
    });
  }

  private applyConfig(cfg: PersistedWorkspaceConfig) {
    const prevSpreadsheetId = this.spreadsheetId;

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

    if (prevSpreadsheetId !== this.spreadsheetId) {
      GoogleDriveSheetService.getInstance().clearSheetIdCache(prevSpreadsheetId);
      this.clientSheetCache.clear();
      this.inFlightSheetFetches.clear();
    }

    this.isFirestoreHydrated = true;
    this.notifyChange();
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
      'Menyimpan ke Firebase Firestore...',
      'pending',
      'Memperbarui ID Spreadsheet agar otomatis sinkron ke seluruh perangkat...'
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
        'Tersimpan di Firebase Cloud!',
        'success',
        'ID Spreadsheet sinkron otomatis ke semua HP, tablet, dan PC pengelola.'
      );
      return true;
    } catch (e: any) {
      ToastManager.getInstance().update(
        toastId,
        'Gagal Menyimpan ke Firebase',
        'error',
        e?.message || 'Verifikasi Super Admin Firebase diperlukan untuk mengubah konfigurasi pusat.'
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
        `Sistem kini membaca Google Spreadsheet: [${this.spreadsheetName || this.spreadsheetId}]`
      );
      return true;
    } catch (err: any) {
      ToastManager.getInstance().update(
        toastId,
        'Gagal Mengganti Tahun Ajaran',
        'error',
        err?.message || 'Gagal menyimpan ke Firebase'
      );
      return false;
    }
  }

  /**
   * Add a new academic year Google Spreadsheet entry and persist in Firestore
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
      `Menyimpan berkas Google Spreadsheet TA ${year} ke Firebase...`
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
        'Google Spreadsheet baru terdaftar permanen di Firebase & aktif di semua gawai.'
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
      'Menyimpan Konfigurasi ke Firebase...',
      'pending',
      'Menyinkronkan ID Spreadsheet & URL GAS agar identik di semua perangkat...'
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
        'Konfigurasi Tersimpan di Firebase!',
        'success',
        'Seluruh perangkat kini otomatis membaca ID Spreadsheet & Cloud GAS yang sama.'
      );
      return true;
    } catch (err: any) {
      ToastManager.getInstance().update(
        toastId,
        'Gagal Menyimpan ke Firebase',
        'error',
        err?.message || 'Verifikasi Super Admin Firebase diperlukan untuk menyimpan pengaturan pusat.'
      );
      return false;
    }
  }

  /**
   * Update Google Docs template IDs permanently in Firestore
   */
  public async updateTemplates(templates: WorkspaceTemplateConfig[]): Promise<boolean> {
    const toastId = ToastManager.getInstance().show(
      'Menyimpan Template Docs ke Firebase...',
      'pending',
      'Menyinkronkan ID Google Docs ke seluruh gawai...'
    );

    try {
      this.templates = templates;
      await this.persistToFirestoreAndNotify();

      ToastManager.getInstance().update(
        toastId,
        'Template Dokumen Tersimpan di Firebase!',
        'success',
        'Seluruh ID template Google Docs kini tersimpan permanen & konsisten di semua perangkat.'
      );
      return true;
    } catch (e: any) {
      ToastManager.getInstance().update(
        toastId,
        'Gagal Menyimpan Template',
        'error',
        e?.message || 'Verifikasi Super Admin Firebase diperlukan.'
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
        error: validation.error || 'URL Google Apps Script (/exec) belum dikonfigurasi.',
      };
    }

    const targetGas = validation.normalizedUrl;
    const targetSpreadsheetId = (
      customSpreadsheetId !== undefined ? customSpreadsheetId : this.spreadsheetId
    ).trim();

    if (!targetSpreadsheetId && customGasUrl === undefined) {
      return { connected: false, error: 'ID Google Spreadsheet belum dikonfigurasi.' };
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
        const { ok, data: json } = await safeFetchJson(`/api/admin/gas-ping${qs ? `?${qs}` : ''}`, {
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
        if (json?.message && json?.code !== 'UNAUTHORIZED') {
          return { connected: false, error: json.message };
        }
      } catch (err: any) {
        if (!(err instanceof HtmlResponseError) && !String(err?.message || '').includes('Failed to fetch')) {
          return { connected: false, error: err?.message || 'Gagal menghubungi proxy server GAS.' };
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
          error: json?.error || 'Web App GAS tidak merespon PING dengan benar.',
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
      'Menguji Koneksi Cloud GAS...',
      'pending',
      'Memeriksa koneksi Google Apps Script ke Google Spreadsheet...'
    );

    if (!targetGas) {
      ToastManager.getInstance().update(
        toastId,
        'URL Apps Script Belum Diisi',
        'error',
        'Masukkan URL Web App GAS (/exec) yang telah di-deploy.'
      );
      return { success: false, message: 'URL Web App GAS (/exec) belum diatur.' };
    }

    const pingRes = await this.pingGasConnection(targetGas, customSpreadsheetId);
    if (pingRes.connected) {
      const now = new Date().toLocaleTimeString('id-ID');
      this.lastTestedAt = now;
      const sheetCountNote =
        Array.isArray(pingRes.sheets) && pingRes.sheets.length > 0
          ? ` — ${pingRes.sheets.length} tab sheet terdeteksi`
          : '';

      ToastManager.getInstance().update(
        toastId,
        'Koneksi Cloud GAS Berhasil!',
        'success',
        `Terhubung ke "${pingRes.title || 'Google Spreadsheet'}"${sheetCountNote} (${now})`
      );
      return {
        success: true,
        title: pingRes.title,
        sheets: pingRes.sheets,
        message: `Terhubung via Cloud GAS ke "${pingRes.title || 'Spreadsheet'}"${sheetCountNote}.`,
      };
    }

    const msg = pingRes.error || 'Pastikan Web App GAS di-deploy dengan akses "Anyone (Siapa saja)".';
    ToastManager.getInstance().update(
      toastId,
      'Gagal Menghubungi Web App GAS',
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
      'Auto-Generate Sheet & GForm...',
      'pending',
      `Menyiapkan struktur sheet terpisah untuk TA ${this.activeYear}...`
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
            'Auto-Generate Berhasil!',
            'success',
            'Seluruh tab sheet dan Google Form berhasil disiapkan di Spreadsheet Anda.'
          );
          return {
            success: true,
            message: 'Berhasil membuat sheet dan Google Form di Google Spreadsheet.',
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
      'Gunakan File .xlsx atau Skrip GAS',
      'info',
      'Unduh file Master .xlsx (Impor ke Google Sheets) atau jalankan kode Apps Script di Spreadsheet Anda.'
    );

    return {
      success: false,
      message:
        'Gunakan tab "Download File Master Excel (.xlsx)" lalu Impor ke Google Sheets, atau jalankan kode di tab "Skrip Google Apps Script (GAS)".',
      spreadsheetUrl: sId ? `https://docs.google.com/spreadsheets/d/${sId}` : undefined,
    };
  }

  public invalidateClientSheetCache(sheetName?: string): void {
    if (!sheetName) {
      this.clientSheetCache.clear();
      return;
    }
    this.clientSheetCache.delete(`${this.spreadsheetId}::${sheetName}`);
    if (sheetName === 'Master_Siswa_XI' || sheetName === 'Master_Siswa') {
      this.clientSheetCache.delete(`${this.spreadsheetId}::Master_Siswa_XI`);
      this.clientSheetCache.delete(`${this.spreadsheetId}::Master_Siswa`);
    }
  }

  /**
   * 100% SSOT Fetch directly from Google Spreadsheet via Server Proxy / Cloud GAS Web App
   * Uses in-flight request deduplication and short client cache to keep navigation snappy.
   */
  public async fetchSheetData(
    sheetName: string,
    forceFresh: boolean = false
  ): Promise<{ data: any[]; fromSpreadsheet: boolean; error?: string }> {
    if (!this.spreadsheetId) {
      return {
        data: [],
        fromSpreadsheet: false,
        error: 'ID Google Spreadsheet belum dikonfigurasi.',
      };
    }

    if (!this.isOnline) {
      return {
        data: [],
        fromSpreadsheet: false,
        error: 'Perangkat sedang offline. Sambungkan internet untuk membaca Google Spreadsheet.',
      };
    }

    if (!this.gasDeployUrl) {
      return {
        data: [],
        fromSpreadsheet: false,
        error: 'URL Web App Google Apps Script (/exec) belum dikonfigurasi.',
      };
    }

    const cacheKey = `${this.spreadsheetId}::${sheetName}`;
    if (!forceFresh) {
      const cached = this.clientSheetCache.get(cacheKey);
      if (cached && Date.now() - cached.fetchedAt < GoogleSheetClient.CLIENT_SHEET_CACHE_TTL_MS) {
        return { data: cached.data, fromSpreadsheet: true };
      }
      const existingFlight = this.inFlightSheetFetches.get(cacheKey);
      if (existingFlight) {
        return existingFlight;
      }
    } else {
      this.invalidateClientSheetCache(sheetName);
    }

    const runFetch = (async () => {
      const normalizer = GoogleDriveSheetService.getInstance();

      // 1. Server-side GAS Proxy (cached & CORS-free)
      const bearerToken = await this.resolveAuthBearerToken();
      if (bearerToken) {
        try {
          const { ok, status, data: json } = await safeFetchJson(
            `/api/admin/sheet?sheet=${encodeURIComponent(sheetName)}&fresh=${forceFresh ? '1' : '0'}`,
            {
              method: 'GET',
              timeoutMs: 16_000,
              headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${bearerToken}`,
              },
            }
          );
          if (ok && json?.success && Array.isArray(json.data)) {
            const normalized = normalizer.normalizeExternalRows(sheetName, json.data);
            this.clientSheetCache.set(cacheKey, { data: normalized, fetchedAt: Date.now() });
            return {
              data: normalized,
              fromSpreadsheet: true,
            };
          }
          if (json?.message && status !== 401 && status !== 403) {
            throw new Error(json.message);
          }
        } catch (proxyErr: any) {
          if (
            !(proxyErr instanceof HtmlResponseError) &&
            !String(proxyErr?.message || '').includes('Failed to fetch')
          ) {
            throw proxyErr;
          }
        }
      }

      // 2. Direct Cloud GAS Web App fallback (static SPA preview host)
      const validation = validateGasDeployUrl(this.gasDeployUrl);
      if (!validation.valid) {
        throw new Error(validation.error || 'URL Web App GAS tidak valid.');
      }
      const gasUrl = validation.normalizedUrl;
      const sep = gasUrl.includes('?') ? '&' : '?';
      try {
        const { ok, status, data: json } = await safeFetchJson(
          `${gasUrl}${sep}sheet=${encodeURIComponent(sheetName)}&year=${encodeURIComponent(
            this.activeYear
          )}&spreadsheetId=${encodeURIComponent(this.spreadsheetId)}`,
          { method: 'GET', redirect: 'follow', timeoutMs: 18_000 }
        );
        if (!ok) {
          throw new Error(`GAS Web App gagal membaca sheet [${sheetName}] (${status})`);
        }
        if ((json.status === 'success' || json.success) && Array.isArray(json.data)) {
          const normalized = normalizer.normalizeExternalRows(sheetName, json.data);
          this.clientSheetCache.set(cacheKey, { data: normalized, fetchedAt: Date.now() });
          return {
            data: normalized,
            fromSpreadsheet: true,
          };
        }
        throw new Error(json.error || `Format respon GAS untuk [${sheetName}] tidak valid.`);
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

  private async postViaServerOrDirectGas(
    sheetName: string,
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'BULK_DELETE' | 'BULK_UPDATE' | 'IMPORT' | 'SYNC_ALL',
    payload: any
  ): Promise<void> {
    this.invalidateClientSheetCache(sheetName);

    const bearerToken = await this.resolveAuthBearerToken();
    if (bearerToken) {
      try {
        const { ok, status, data: json } = await safeFetchJson('/api/admin/sheet', {
          method: 'POST',
          timeoutMs: 20_000,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${bearerToken}`,
          },
          body: JSON.stringify({
            sheetName,
            action,
            data: payload,
          }),
        });
        if (ok && json?.success) {
          return;
        }
        if (json?.message && status !== 401 && status !== 403) {
          throw new Error(json.message);
        }
      } catch (proxyErr: any) {
        if (
          !(proxyErr instanceof HtmlResponseError) &&
          !String(proxyErr?.message || '').includes('Failed to fetch')
        ) {
          throw proxyErr;
        }
      }
    }

    const validation = validateGasDeployUrl(this.gasDeployUrl);
    if (!validation.valid) {
      throw new Error(validation.error || 'URL Web App GAS tidak valid.');
    }
    const gasUrl = validation.normalizedUrl;
    const resolvedId =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload.id || payload.deletedRow?.id || payload.updatedRow?.id || ''
        : '';

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
          id: resolvedId,
          data: payload,
          timestamp: new Date().toISOString(),
        }),
      });

      if (!ok || json?.error) {
        throw new Error(json?.error || `GAS Web App mengembalikan status ${status}`);
      }
      fetch(`/api/cache/invalidate?sheet=${encodeURIComponent(sheetName)}`, { method: 'POST' }).catch(() => {});
    } catch (err: any) {
      throw new Error(formatGasNetworkError(err, gasUrl));
    }
  }

  /**
   * Strict CRUD commit to Google Spreadsheet via Cloud GAS (fails loudly if not connected)
   */
  public async commitToSpreadsheet(
    sheetName: string,
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'BULK_DELETE' | 'BULK_UPDATE' | 'IMPORT',
    payload: any,
    options?: { silentToast?: boolean }
  ): Promise<{ success: boolean; fromLiveSheet: boolean; error?: string }> {
    const silent = Boolean(options?.silentToast);

    if (!this.spreadsheetId) {
      const msg = 'ID Google Spreadsheet belum diatur. Atur Spreadsheet terlebih dahulu.';
      if (!silent) ToastManager.getInstance().show('Spreadsheet Belum Diatur', 'error', msg);
      return { success: false, fromLiveSheet: false, error: msg };
    }

    if (!this.isOnline) {
      const msg = 'Tidak ada koneksi internet untuk menulis ke Google Spreadsheet.';
      if (!silent) ToastManager.getInstance().show('Koneksi Offline', 'error', msg);
      return { success: false, fromLiveSheet: false, error: msg };
    }

    if (!this.gasDeployUrl) {
      const msg = 'URL Web App Google Apps Script (/exec) belum dikonfigurasi.';
      if (!silent) ToastManager.getInstance().show('URL GAS Belum Diatur', 'error', msg);
      return { success: false, fromLiveSheet: false, error: msg };
    }

    const toastId = !silent
      ? ToastManager.getInstance().show(
          'Menyimpan ke Google Spreadsheet...',
          'pending',
          `Menulis ${action} ke lembar kerja [${sheetName}] (TA ${this.activeYear})`,
          sheetName
        )
      : null;

    try {
      await this.postViaServerOrDirectGas(sheetName, action, payload);
      if (toastId) {
        ToastManager.getInstance().update(
          toastId,
          'Tersimpan di Google Spreadsheet!',
          'success',
          `Data berhasil ditulis ke Google Spreadsheet [${sheetName}] via Cloud GAS.`
        );
      }
      return { success: true, fromLiveSheet: true };
    } catch (err: any) {
      const errMsg = err?.message || 'Gagal menghubungi Web App GAS';
      if (toastId) {
        ToastManager.getInstance().update(toastId, 'Gagal Menyimpan ke Spreadsheet', 'error', errMsg);
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
      const msg = 'ID Google Spreadsheet belum dikonfigurasi.';
      if (!silent) ToastManager.getInstance().show('Spreadsheet Belum Diatur', 'error', msg);
      return { success: false, message: msg };
    }

    if (!this.gasDeployUrl || !this.isOnline) {
      const msg = 'Pastikan koneksi internet aktif dan URL Web App GAS (/exec) sudah terpasang.';
      if (!silent) ToastManager.getInstance().show('Koneksi GAS Belum Siap', 'error', msg);
      return { success: false, message: msg };
    }

    const toastId = !silent
      ? ToastManager.getInstance().show(
          'Menyinkronkan ke Google Spreadsheet...',
          'pending',
          `Menyegarkan data lembar kerja [${sheetName}] (TA ${this.activeYear})`,
          sheetName
        )
      : null;

    try {
      await this.postViaServerOrDirectGas(sheetName, 'SYNC_ALL', rows);
      const now = new Date().toLocaleTimeString('id-ID');
      if (toastId) {
        ToastManager.getInstance().update(
          toastId,
          'Sinkronisasi Spreadsheet Berhasil',
          'success',
          `${rows.length} baris tersimpan via Cloud GAS (${now}).`
        );
      }
      return { success: true, message: 'Berhasil tersinkronisasi' };
    } catch (err: any) {
      if (toastId) {
        ToastManager.getInstance().update(toastId, 'Gagal Sinkronisasi GAS', 'error', err?.message || 'Error');
      }
      return { success: false, message: err?.message || 'Error' };
    }
  }
}
