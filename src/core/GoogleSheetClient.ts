import { ToastManager } from './ToastManager';
import { GoogleDriveSheetService } from './GoogleDriveSheetService';
import {
  WorkspaceConfigStore,
  EMPTY_WORKSPACE_CONFIG,
  EMPTY_DEFAULT_TEMPLATES,
  PersistedWorkspaceConfig,
  normalizeMonitoringStageControl,
} from './firebase/WorkspaceConfigStore';
import { DEFAULT_MONITORING_STAGE_CONTROL, type MonitoringStageControl } from './types/schema';
import type { Unsubscribe } from 'firebase/firestore';
import { normalizeGasUrl, safeFetchJson } from './utils/safeFetchJson';
import { IndexedDbSheetCache } from './cache/IndexedDbSheetCache';
import { SheetSnapshotCache } from './sheets/SheetSnapshotCache';
import { SheetRestTransport, type SheetTransportContext } from './sheets/SheetRestTransport';

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
  monitoringStageControl: MonitoringStageControl;
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
  private monitoringStageControl: MonitoringStageControl = {
    ...DEFAULT_MONITORING_STAGE_CONTROL,
    unlockedStages: [...DEFAULT_MONITORING_STAGE_CONTROL.unlockedStages],
  };
  private isFirestoreHydrated: boolean = false;
  private lastTestedAt: string | null = null;
  private unsubscribeFirestore: Unsubscribe | null = null;
  private initFirestorePromise: Promise<void> | null = null;
  private listeners: Array<() => void> = [];

  private readonly snapshotCache: SheetSnapshotCache;
  private readonly transport: SheetRestTransport;

  private constructor() {
    this.snapshotCache = new SheetSnapshotCache((sheetName) => {
      this.invalidateClientSheetCache(sheetName, true);
    });
    this.transport = new SheetRestTransport(this.snapshotCache);

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

  private getTransportContext(): SheetTransportContext {
    return {
      activeYear: this.activeYear,
      spreadsheetId: this.spreadsheetId,
      gasDeployUrl: this.gasDeployUrl,
      isOnline: this.isOnline,
    };
  }

  public addChangeListener(cb: () => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((fn) => fn !== cb);
    };
  }

  public onSheetCacheInvalidate(cb: (sheetName?: string) => void): () => void {
    return this.snapshotCache.onSheetCacheInvalidate(cb);
  }

  public onBootstrapUpdated(cb: (tables: string[]) => void): () => void {
    return this.snapshotCache.onBootstrapUpdated(cb);
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

  private hydrateSyncFromCachedConfig(cfg: PersistedWorkspaceConfig) {
    this.activeYear = cfg.activeYear || '2026/2027';
    this.gasDeployUrl = normalizeGasUrl(cfg.gasDeployUrl || '');
    this.driveFolderUrl = cfg.driveFolderUrl || '';
    this.academicYears = Array.isArray(cfg.academicYears) ? cfg.academicYears : [];
    this.templates =
      Array.isArray(cfg.templates) && cfg.templates.length > 0
        ? cfg.templates
        : [...EMPTY_DEFAULT_TEMPLATES];
    this.monitoringStageControl = normalizeMonitoringStageControl(cfg.monitoringStageControl);

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
    const prevStageControlSig = JSON.stringify(this.monitoringStageControl);

    this.hydrateSyncFromCachedConfig(cfg);

    const coreChanged =
      prevSpreadsheetId !== this.spreadsheetId ||
      prevGasUrl !== this.gasDeployUrl ||
      prevActiveYear !== this.activeYear;

    if (coreChanged) {
      GoogleDriveSheetService.getInstance().clearSheetIdCache(prevSpreadsheetId);
      this.invalidateClientSheetCache(undefined, true);
      this.transport.clearInFlight();
      if (this.spreadsheetId) {
        IndexedDbSheetCache.getInstance()
          .preloadAll(this.spreadsheetId, this.activeYear)
          .catch(() => {});
      }
    }

    const anyVisualChanged =
      coreChanged ||
      prevSpreadsheetName !== this.spreadsheetName ||
      prevTemplatesSig !== JSON.stringify(this.templates || []) ||
      prevStageControlSig !== JSON.stringify(this.monitoringStageControl);

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
      monitoringStageControl: normalizeMonitoringStageControl(this.monitoringStageControl),
    };
  }

  public async initFromFirestore(): Promise<void> {
    if (this.unsubscribeFirestore && this.isFirestoreHydrated) {
      return;
    }
    if (this.initFirestorePromise) {
      return this.initFirestorePromise;
    }

    this.initFirestorePromise = new Promise<void>((resolve) => {
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve();
      };

      const timeoutId = setTimeout(() => {
        console.warn('[GoogleSheetClient] Firestore initial snapshot timeout — continuing with cached/default config.');
        this.isFirestoreHydrated = true;
        this.notifyChange();
        settle();
      }, 8000);

      if (this.unsubscribeFirestore) {
        settle();
        return;
      }

      this.unsubscribeFirestore = WorkspaceConfigStore.subscribeToConfig(
        (config) => {
          this.applyConfig(config);
          settle();
        },
        (err) => {
          console.warn('[GoogleSheetClient] Firestore snapshot warning:', err?.message);
          this.isFirestoreHydrated = true;
          this.notifyChange();
          settle();
        }
      );
    });

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
      monitoringStageControl: normalizeMonitoringStageControl(this.monitoringStageControl),
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

  public getMonitoringStageControl(): MonitoringStageControl {
    return normalizeMonitoringStageControl(this.monitoringStageControl);
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
    const bearerToken = await this.transport.resolveAuthBearerToken();
    fetch('/api/cache/invalidate', {
      method: 'POST',
      headers: bearerToken ? { Authorization: `Bearer ${bearerToken}` } : undefined,
    }).catch(() => {});
  }

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
            spreadsheetName:
              this.spreadsheetName || `Hubin_SMK_PGRI_2_Ponorogo_${this.activeYear.replace('/', '_')}`,
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
      if (this.academicYears.find((ay) => ay.year === cleanYear)) {
        throw new Error(`Tahun ajaran ${cleanYear} sudah terdaftar.`);
      }

      const cleanId = spreadsheetId.trim();
      const newEntry: AcademicYearConfig = {
        year: cleanYear,
        label: `Tahun Ajaran ${cleanYear} (Aktif)`,
        spreadsheetId: cleanId,
        spreadsheetName:
          spreadsheetName || `Hubin_SMK_PGRI_2_Ponorogo_${cleanYear.replace('/', '_')}`,
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

  public async createYearlySpreadsheetWithRollover(params: {
    year: string;
    copySheets: string[];
    targetSpreadsheetId?: string;
    spreadsheetTitle?: string;
    formUrl?: string;
    activateImmediately?: boolean;
  }): Promise<{
    success: boolean;
    spreadsheetId?: string;
    spreadsheetName?: string;
    spreadsheetUrl?: string;
    driveFolderUrl?: string;
    seededCounts?: Record<string, number>;
    plantedFormulas?: number;
    error?: string;
  }> {
    const cleanYear = params.year.trim();
    if (!/^[0-9]{4}\/[0-9]{4}$/.test(cleanYear)) {
      const msg = 'Format Tahun Ajaran wajib YYYY/YYYY (contoh: 2027/2028).';
      ToastManager.getInstance().show('Format Tahun Ajaran Salah', 'error', msg);
      return { success: false, error: msg };
    }
    if (this.academicYears.some((ay) => ay.year === cleanYear)) {
      const msg = `Tahun ajaran ${cleanYear} sudah terdaftar di Workspace.`;
      ToastManager.getInstance().show('Tahun Ajaran Sudah Ada', 'error', msg);
      return { success: false, error: msg };
    }

    const toastId = ToastManager.getInstance().show(
      `Menyiapkan Database TA ${cleanYear}...`,
      'pending',
      'Membuat Spreadsheet 12-sheet baru, menyalin master terpilih, dan menanam ARRAYFORMULA relasional...'
    );

    try {
      const bearerToken = await this.transport.resolveAuthBearerToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };
      if (bearerToken) {
        headers.Authorization = `Bearer ${bearerToken}`;
      }

      const { ok, status, data: resJson } = await safeFetchJson('/api/admin/rollover-year', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          year: cleanYear,
          copySheets: params.copySheets,
          targetSpreadsheetId: params.targetSpreadsheetId?.trim() || undefined,
          spreadsheetTitle: params.spreadsheetTitle?.trim() || undefined,
        }),
      });

      if (!ok || !resJson?.success || !resJson?.spreadsheetId) {
        throw new Error(
          resJson?.message || `Gagal membuat Spreadsheet tahun ajaran baru (HTTP ${status}).`
        );
      }

      const activateNow = params.activateImmediately !== false;
      const newEntry: AcademicYearConfig = {
        year: cleanYear,
        label: activateNow
          ? `Tahun Ajaran ${cleanYear} (Aktif)`
          : `Tahun Ajaran ${cleanYear} (Siap)`,
        spreadsheetId: String(resJson.spreadsheetId),
        spreadsheetName:
          String(resJson.spreadsheetName || '') ||
          `Hubin_SMK_PGRI_2_Ponorogo_${cleanYear.replace('/', '_')}`,
        spreadsheetUrl:
          String(resJson.spreadsheetUrl || '') ||
          `https://docs.google.com/spreadsheets/d/${resJson.spreadsheetId}`,
        formUrl: params.formUrl?.trim() || '',
        formEditUrl: '',
        driveFolderYearUrl: String(resJson.driveFolderUrl || this.driveFolderUrl || ''),
        isActive: activateNow,
        createdAt: new Date().toISOString(),
      };

      if (!this.driveFolderUrl && resJson.driveFolderUrl) {
        this.driveFolderUrl = String(resJson.driveFolderUrl);
      }

      if (activateNow) {
        this.academicYears = [
          newEntry,
          ...this.academicYears.map((ay) => ({
            ...ay,
            isActive: false,
            label: ay.label.replace('(Aktif)', '(Arsip)'),
          })),
        ];
        this.activeYear = cleanYear;
        this.spreadsheetId = newEntry.spreadsheetId;
        this.spreadsheetName = newEntry.spreadsheetName;
        this.spreadsheetUrl = newEntry.spreadsheetUrl;
      } else {
        this.academicYears = [newEntry, ...this.academicYears];
      }

      await this.persistToFirestoreAndNotify();

      const copiedSummary = Object.entries(resJson.seededCounts || {})
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');

      ToastManager.getInstance().update(
        toastId,
        `Database TA ${cleanYear} Siap Digunakan!`,
        'success',
        copiedSummary
          ? `Master tersalin (${copiedSummary}) & ${resJson.plantedFormulas || 0} formula relasional aktif.`
          : `${resJson.plantedFormulas || 0} formula relasional & 12 tabel siap digunakan.`
      );

      return {
        success: true,
        spreadsheetId: newEntry.spreadsheetId,
        spreadsheetName: newEntry.spreadsheetName,
        spreadsheetUrl: newEntry.spreadsheetUrl,
        driveFolderUrl: newEntry.driveFolderYearUrl,
        seededCounts: resJson.seededCounts,
        plantedFormulas: resJson.plantedFormulas,
      };
    } catch (err: any) {
      const errMsg = err?.message || 'Gagal menyiapkan Spreadsheet Tahun Ajaran baru.';
      ToastManager.getInstance().update(
        toastId,
        `Gagal Roll-over TA ${cleanYear}`,
        'error',
        errMsg
      );
      return { success: false, error: errMsg };
    }
  }

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
            spreadsheetName:
              this.spreadsheetName || `Hubin_SMK_PGRI_2_Ponorogo_${this.activeYear.replace('/', '_')}`,
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

  public async updateMonitoringStageControl(control: MonitoringStageControl): Promise<boolean> {
    const toastId = ToastManager.getInstance().show(
      'Menyimpan Pengaturan Tahap Monitoring...',
      'pending',
      'Menyinkronkan kebijakan kunci/buka tahap monitoring ke Cloud Server...'
    );

    try {
      this.monitoringStageControl = normalizeMonitoringStageControl(control);
      await this.persistToFirestoreAndNotify();

      ToastManager.getInstance().update(
        toastId,
        'Pengaturan Tahap Monitoring Tersimpan!',
        'success',
        this.monitoringStageControl.requireSequential
          ? `Mode Berurutan aktif (${this.monitoringStageControl.unlockedStages.length} tahap terbuka).`
          : `Mode Transisi aktif (${this.monitoringStageControl.unlockedStages.length} tahap bisa langsung diisi).`
      );
      return true;
    } catch (e: any) {
      ToastManager.getInstance().update(
        toastId,
        'Gagal Menyimpan Pengaturan Tahap',
        'error',
        e?.message || 'Verifikasi SuperAdmin Google diperlukan untuk menyimpan kebijakan monitoring.'
      );
      return false;
    }
  }

  public async pingGasConnection(customGasUrl?: string, customSpreadsheetId?: string) {
    return this.transport.pingGasConnection(
      this.getTransportContext(),
      customGasUrl,
      customSpreadsheetId
    );
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
            spreadsheetUrl:
              resJson.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${sId}`,
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

  public getCachedSnapshotSync(sheetName: string) {
    return this.snapshotCache.getCachedSnapshotSync(this.spreadsheetId, this.activeYear, sheetName);
  }

  public async getCachedSnapshot(sheetName: string) {
    return this.snapshotCache.getCachedSnapshot(this.spreadsheetId, this.activeYear, sheetName);
  }

  public async saveCachedSnapshot(sheetName: string, rows: any[], etag?: string) {
    return this.snapshotCache.saveCachedSnapshot(
      this.spreadsheetId,
      this.activeYear,
      sheetName,
      rows,
      etag
    );
  }

  public markSheetMutated(sheetName: string): void {
    this.snapshotCache.markSheetMutated(this.spreadsheetId, this.activeYear, sheetName);
  }

  public getSheetLastMutatedAt(sheetName: string): number {
    return this.snapshotCache.getSheetLastMutatedAt(sheetName);
  }

  public invalidateClientSheetCache(sheetName?: string, fromBroadcast: boolean = false): void {
    this.snapshotCache.invalidateClientSheetCache(
      this.spreadsheetId,
      this.activeYear,
      sheetName,
      fromBroadcast
    );
  }

  public async bootstrapAdminTables(forceFresh: boolean = false): Promise<boolean> {
    return this.transport.bootstrapAdminTables(this.getTransportContext(), forceFresh);
  }

  public async fetchSheetData(
    sheetName: string,
    forceFresh: boolean = false,
    options?: { fields?: string[] }
  ) {
    return this.transport.fetchSheetData(
      this.getTransportContext(),
      sheetName,
      forceFresh,
      options
    );
  }

  public async recalculateRelationsOnServer(scope: string = 'all', forceRefresh: boolean = true) {
    return this.transport.recalculateRelationsOnServer(
      this.getTransportContext(),
      scope,
      forceRefresh
    );
  }

  public async triggerMigrateRelationalFormulas() {
    return this.transport.triggerMigrateRelationalFormulas(this.getTransportContext());
  }

  public async commitToSpreadsheet(
    sheetName: string,
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'BULK_DELETE' | 'BULK_UPDATE' | 'IMPORT',
    payload: any,
    options?: { silentToast?: boolean }
  ): Promise<{
    success: boolean;
    fromLiveSheet: boolean;
    verified?: boolean;
    sheetRowNumber?: number;
    savedAt?: string;
    error?: string;
  }> {
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

    const bearerToken = await this.transport.resolveAuthBearerToken().catch(() => null);
    if (!this.gasDeployUrl && !bearerToken) {
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
      const receipt = await this.transport.postViaServerOrDirectGas(
        this.getTransportContext(),
        sheetName,
        action,
        payload
      );
      if (toastId) {
        ToastManager.getInstance().update(
          toastId,
          'Tersimpan di Cloud Server!',
          'success',
          receipt.sheetRowNumber
            ? `Data berhasil ditulis ke Spreadsheet (Baris #${receipt.sheetRowNumber}).`
            : 'Data berhasil ditulis dan disinkronkan ke Cloud Server.'
        );
      }
      return {
        success: true,
        fromLiveSheet: true,
        verified: receipt.verified,
        sheetRowNumber: receipt.sheetRowNumber,
        savedAt: receipt.savedAt,
      };
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
      await this.transport.postViaServerOrDirectGas(
        this.getTransportContext(),
        sheetName,
        'SYNC_ALL',
        rows
      );
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
        ToastManager.getInstance().update(
          toastId,
          'Gagal Sinkronisasi Cloud Server',
          'error',
          err?.message || 'Error'
        );
      }
      return { success: false, message: err?.message || 'Error' };
    }
  }
}
