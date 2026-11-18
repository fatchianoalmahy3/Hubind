import {
  doc,
  getDocFromServer,
  onSnapshot,
  setDoc,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { db, auth, OperationType, handleFirestoreError } from './firebaseApp';
import type { AcademicYearConfig, WorkspaceTemplateConfig } from '../GoogleSheetClient';
import { normalizeGasUrl } from '../utils/safeFetchJson';

export const BOOTSTRAP_ADMIN_EMAIL = 'fatchiano1@gmail.com';
const WORKSPACE_DOC_PATH = 'config/workspace';
const LS_WORKSPACE_CONFIG_KEY = 'hubin_workspace_config_v1';

export interface PersistedWorkspaceConfig {
  activeYear: string;
  spreadsheetId: string;
  spreadsheetName: string;
  spreadsheetUrl: string;
  driveFolderUrl: string;
  gasDeployUrl: string;
  academicYears: AcademicYearConfig[];
  templates: WorkspaceTemplateConfig[];
}

export const EMPTY_DEFAULT_TEMPLATES: WorkspaceTemplateConfig[] = [
  {
    id: 'doc_mou',
    title: 'Naskah Perjanjian Kerjasama (MoU) DUDI',
    url: '',
    type: 'Google Docs',
    description: 'Draft resmi Nota Kesepahaman / MoU kemitraan industri antara sekolah dan DUDI',
  },
  {
    id: 'doc_surat_tugas',
    title: 'Surat Tugas Guru Pendamping PKL',
    url: '',
    type: 'Google Docs',
    description: 'Surat perintah tugas resmi bagi guru pembimbing untuk pengantaran, supervisi, dan penarikan',
  },
  {
    id: 'doc_pengajuan',
    title: 'Lembar Permohonan Rekomendasi Siswa (Pengajuan)',
    url: '',
    type: 'Google Docs',
    description: 'Format baku verifikasi Kakomli dan pengajuan siswa ke Hubin',
  },
  {
    id: 'doc_pengantaran',
    title: 'Surat & Berita Acara Pengantaran Siswa PKL',
    url: '',
    type: 'Google Docs',
    description: 'Surat pengantar resmi dan berita acara serah terima siswa ke pimpinan DUDI',
  },
  {
    id: 'doc_monitoring',
    title: 'Instrumen Supervisi & Monitoring Guru Pendamping',
    url: '',
    type: 'Google Docs',
    description: 'Panduan & form berita acara supervisi lapangan (Monitoring 1-3)',
  },
  {
    id: 'doc_penarikan',
    title: 'Surat Tugas & Berita Acara Penarikan Siswa PKL',
    url: '',
    type: 'Google Docs',
    description: 'Dokumen resmi penjemputan / penarikan purna tugas Prakerin dan ucapan terima kasih DUDI',
  },
  {
    id: 'doc_perizinan',
    title: 'Surat Permohonan Penempatan & Izin Orang Tua PKL',
    url: '',
    type: 'Google Docs',
    description: 'Kop surat dinas permohonan kuota DUDI serta format surat pernyataan izin orang tua/wali',
  },
  {
    id: 'doc_nilai',
    title: 'Lembar Penilaian Industri DUDI (Monitoring 3)',
    url: '',
    type: 'Google Docs',
    description: 'Instrumen penilaian kompetensi teknis & non-teknis DUDI',
  },
  {
    id: 'doc_blangko',
    title: 'Template Cetak Blangko Sertifikat Fisik (Overprint)',
    url: '',
    type: 'Google Docs',
    description: 'Setting margin presisi untuk cetak pada kertas blangko ber-nomor seri',
  },
];

export const EMPTY_WORKSPACE_CONFIG: PersistedWorkspaceConfig = {
  activeYear: '2026/2027',
  spreadsheetId: '',
  spreadsheetName: '',
  spreadsheetUrl: '',
  driveFolderUrl: '',
  gasDeployUrl: '',
  academicYears: [],
  templates: EMPTY_DEFAULT_TEMPLATES,
};

function sanitizeString(val: unknown, maxLen: number): string {
  return String(val ?? '').trim().slice(0, maxLen);
}

function sanitizeYearString(val: unknown): string {
  const s = String(val ?? '').trim();
  return /^[0-9]{4}\/[0-9]{4}$/.test(s) ? s.slice(0, 20) : '2026/2027';
}

function sanitizeSpreadsheetId(val: unknown): string {
  const s = String(val ?? '').trim();
  const match = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  const id = match && match[1] ? match[1] : s;
  return id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
}

function normalizeConfigData(raw: Record<string, any> | undefined): PersistedWorkspaceConfig {
  if (!raw) return { ...EMPTY_WORKSPACE_CONFIG, academicYears: [], templates: [...EMPTY_DEFAULT_TEMPLATES] };

  const activeYear = sanitizeYearString(raw.activeYear);
  const academicYears: AcademicYearConfig[] = Array.isArray(raw.academicYears)
    ? raw.academicYears.slice(0, 20).map((ay: any) => ({
        year: sanitizeYearString(ay?.year),
        label: sanitizeString(ay?.label || `Tahun Ajaran ${ay?.year || activeYear}`, 120),
        spreadsheetId: sanitizeSpreadsheetId(ay?.spreadsheetId),
        spreadsheetName: sanitizeString(ay?.spreadsheetName || '', 200),
        spreadsheetUrl: sanitizeString(ay?.spreadsheetUrl || '', 500),
        formUrl: sanitizeString(ay?.formUrl || '', 500),
        formEditUrl: sanitizeString(ay?.formEditUrl || '', 500),
        driveFolderYearUrl: sanitizeString(ay?.driveFolderYearUrl || '', 500),
        isActive: Boolean(ay?.year === activeYear || ay?.isActive),
        createdAt: sanitizeString(ay?.createdAt || '', 64),
      }))
    : [];

  const savedList: any[] = Array.isArray(raw.templates) ? raw.templates : [];
  const savedById = new Map<string, any>();
  savedList.forEach((item) => {
    const id = sanitizeString(item?.id || '', 64);
    if (id) savedById.set(id, item);
  });

  const mergedDefaults: WorkspaceTemplateConfig[] = EMPTY_DEFAULT_TEMPLATES.map((def) => {
    const saved = savedById.get(def.id);
    if (!saved) return { ...def };
    return {
      id: def.id,
      title: sanitizeString(saved.title || def.title, 150),
      url: sanitizeString(saved.url || '', 500),
      type: sanitizeString(saved.type || def.type, 50),
      description: sanitizeString(saved.description || def.description, 250),
    };
  });

  const defaultIdSet = new Set(EMPTY_DEFAULT_TEMPLATES.map((d) => d.id));
  const extraSaved: WorkspaceTemplateConfig[] = savedList
    .filter((item) => {
      const id = sanitizeString(item?.id || '', 64);
      return id && !defaultIdSet.has(id);
    })
    .map((t: any, idx: number) => ({
      id: sanitizeString(t?.id || `doc_custom_${idx + 1}`, 64),
      title: sanitizeString(t?.title || `Template ${idx + 1}`, 150),
      url: sanitizeString(t?.url || '', 500),
      type: sanitizeString(t?.type || 'Google Docs', 50),
      description: sanitizeString(t?.description || '', 250),
    }));

  const templates: WorkspaceTemplateConfig[] = [...mergedDefaults, ...extraSaved].slice(0, 15);

  const activeEntry = academicYears.find((ay) => ay.year === activeYear) || academicYears[0];
  const spreadsheetId = sanitizeSpreadsheetId(raw.spreadsheetId || activeEntry?.spreadsheetId || '');
  const spreadsheetName = sanitizeString(raw.spreadsheetName || activeEntry?.spreadsheetName || '', 200);
  const spreadsheetUrl = sanitizeString(
    raw.spreadsheetUrl || activeEntry?.spreadsheetUrl || (spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}` : ''),
    500
  );

  return {
    activeYear,
    spreadsheetId,
    spreadsheetName,
    spreadsheetUrl,
    driveFolderUrl: sanitizeString(raw.driveFolderUrl || '', 500),
    gasDeployUrl: normalizeGasUrl(sanitizeString(raw.gasDeployUrl || '', 500)).slice(0, 500),
    academicYears,
    templates,
  };
}

export class WorkspaceConfigStore {
  public static readCachedConfigSync(): PersistedWorkspaceConfig | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(LS_WORKSPACE_CONFIG_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return normalizeConfigData(parsed);
    } catch {
      return null;
    }
  }

  public static writeCachedConfigSync(cfg: PersistedWorkspaceConfig): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(LS_WORKSPACE_CONFIG_KEY, JSON.stringify(cfg));
    } catch {
      // ignore storage quota errors
    }
  }

  public static async fetchConfigFromServer(): Promise<{
    exists: boolean;
    config: PersistedWorkspaceConfig;
  }> {
    const ref = doc(db, 'config', 'workspace');
    try {
      const snap = await getDocFromServer(ref);
      if (!snap.exists()) {
        const empty = normalizeConfigData(undefined);
        WorkspaceConfigStore.writeCachedConfigSync(empty);
        return {
          exists: false,
          config: empty,
        };
      }
      const normalized = normalizeConfigData(snap.data());
      WorkspaceConfigStore.writeCachedConfigSync(normalized);
      return {
        exists: true,
        config: normalized,
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, WORKSPACE_DOC_PATH);
    }
  }

  public static subscribeToConfig(
    onUpdate: (config: PersistedWorkspaceConfig, exists: boolean) => void,
    onError?: (err: Error) => void
  ): Unsubscribe {
    const ref = doc(db, 'config', 'workspace');
    return onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          const empty = normalizeConfigData(undefined);
          WorkspaceConfigStore.writeCachedConfigSync(empty);
          onUpdate(empty, false);
          return;
        }
        const normalized = normalizeConfigData(snap.data());
        WorkspaceConfigStore.writeCachedConfigSync(normalized);
        onUpdate(normalized, true);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.GET, WORKSPACE_DOC_PATH);
        } catch (wrapped: any) {
          if (onError) onError(wrapped);
        }
      }
    );
  }

  public static async saveConfigToFirestore(cfg: PersistedWorkspaceConfig): Promise<PersistedWorkspaceConfig> {
    let user = auth.currentUser;
    if (!user) {
      const { ensureFirebaseConfigAdminSignedIn } = await import('../auth/GoogleAuthService');
      user = await ensureFirebaseConfigAdminSignedIn();
    }

    const sanitized = normalizeConfigData(cfg);
    const payload = {
      activeYear: sanitized.activeYear,
      spreadsheetId: sanitized.spreadsheetId,
      spreadsheetName: sanitized.spreadsheetName,
      spreadsheetUrl: sanitized.spreadsheetUrl,
      driveFolderUrl: sanitized.driveFolderUrl,
      gasDeployUrl: sanitized.gasDeployUrl,
      academicYears: sanitized.academicYears,
      templates: sanitized.templates,
      updatedBy: user.uid.slice(0, 128),
      updatedAt: serverTimestamp(),
    };

    const ref = doc(db, 'config', 'workspace');
    try {
      await setDoc(ref, payload);
      WorkspaceConfigStore.writeCachedConfigSync(sanitized);
      return sanitized;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, WORKSPACE_DOC_PATH);
    }
  }

  public static async checkIsAuthorizedAdmin(): Promise<boolean> {
    const user = auth.currentUser;
    if (!user || !user.emailVerified) return false;
    if (user.email === BOOTSTRAP_ADMIN_EMAIL) return true;

    const adminRef = doc(db, 'admins', user.uid);
    try {
      const snap = await getDocFromServer(adminRef);
      return snap.exists();
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `admins/${user.uid}`);
    }
  }

  public static async ensureSuperAdminRecord(): Promise<void> {
    const user = auth.currentUser;
    if (!user || !user.emailVerified || user.email !== BOOTSTRAP_ADMIN_EMAIL) return;

    const adminRef = doc(db, 'admins', user.uid);
    try {
      const existingSnap = await getDocFromServer(adminRef);
      if (!existingSnap.exists()) {
        await setDoc(adminRef, {
          uid: user.uid.slice(0, 128),
          email: (user.email || '').slice(0, 256),
          displayName: (user.displayName || 'Admin Hubin').slice(0, 150),
          role: 'Hubin',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `admins/${user.uid}`);
    }
  }
}
