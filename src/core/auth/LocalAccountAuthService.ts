import { UserRole } from '../types/schema';
import { GoogleSheetClient } from '../GoogleSheetClient';
import { safeFetchJson, HtmlResponseError, validateGasDeployUrl } from '../utils/safeFetchJson';

export const ADMIN_SESSION_STORAGE_KEY = 'hubin_admin_session_v1';
export const MASTER_AKUN_SHEET_NAME = 'Master_Akun';
export const MASTER_AKUN_HEADERS = [
  'ID',
  'Username',
  'Password_Hash',
  'Role',
  'Nama_Lengkap',
  'Jabatan',
  'Status',
  'Updated_At',
];

export interface AdminAccountRecord {
  id: string;
  username: string;
  passwordHash: string;
  role: Extract<UserRole, 'Hubin' | 'Kepsek' | 'Waka' | 'Pokja' | 'Kakomli'>;
  namaLengkap: string;
  jabatan: string;
  status: 'Aktif' | 'Nonaktif';
  updatedAt: string;
  isDefaultSeed?: boolean;
}

export interface AdminSessionUser {
  id: string;
  username: string;
  role: UserRole;
  name: string;
  title: string;
  email: string;
  identifier: string;
  canManageSpreadsheet: boolean;
}

export interface StoredAdminSession {
  user: AdminSessionUser;
  sessionToken: string;
  expiresAt: number;
}

export const ROLE_TITLE_MAP: Record<
  Extract<UserRole, 'Hubin' | 'Kepsek' | 'Waka' | 'Pokja' | 'Kakomli'>,
  string
> = {
  Hubin: 'Koordinator Pokja Hubin & Kerjasama DUDI',
  Kepsek: 'Kepala Sekolah SMK PGRI 2 Ponorogo',
  Waka: 'Wakil Kepala Sekolah Bidang Hubin',
  Pokja: 'Tim Pokja Hubin & Pendamping PKL',
  Kakomli: 'Ketua Konsentrasi Keahlian (Kakomli)',
};

export interface DefaultAccountDefinition {
  id: string;
  username: string;
  defaultPassword: string;
  passwordHash: string;
  role: Extract<UserRole, 'Hubin' | 'Kepsek' | 'Waka' | 'Pokja' | 'Kakomli'>;
  namaLengkap: string;
  jabatan: string;
}

// Pre-computed deterministic salted SHA-256 hashes (format: sha256$<salt>$<hex>)
// Matches node:crypto and browser SubtleCrypto sha256(`${salt}:${password}`)
export const DEFAULT_ADMIN_ACCOUNTS: DefaultAccountDefinition[] = [
  {
    id: 'AKN-HUBIN',
    username: 'hubin',
    defaultPassword: 'Hubin@2026',
    passwordHash: 'sha256$hubin_salt_2026$b23210b83e9f6351a2e22d1f1fd581303f14a55f641c0d9435238c849f83ebdf',
    role: 'Hubin',
    namaLengkap: 'Admin Pokja Hubin',
    jabatan: ROLE_TITLE_MAP.Hubin,
  },
  {
    id: 'AKN-KEPSEK',
    username: 'kepsek',
    defaultPassword: 'Kepsek@2026',
    passwordHash: 'sha256$kepsek_salt_2026$706c596815cfed8b16a3f039660fd2bd091b03c5967e28fe24d936c81d484d30',
    role: 'Kepsek',
    namaLengkap: 'Kepala Sekolah',
    jabatan: ROLE_TITLE_MAP.Kepsek,
  },
  {
    id: 'AKN-WAKA',
    username: 'waka',
    defaultPassword: 'Waka@2026',
    passwordHash: 'sha256$waka_salt_2026$40aa355ff6a07625da095fa9d674133e34853b2c0c40d23e544cc3b9cb069727',
    role: 'Waka',
    namaLengkap: 'Waka Bidang Hubin',
    jabatan: ROLE_TITLE_MAP.Waka,
  },
  {
    id: 'AKN-POKJA',
    username: 'pokja',
    defaultPassword: 'Pokja@2026',
    passwordHash: 'sha256$pokja_salt_2026$72983b18a20b56d905310366c424d587fb24efaa8a93f948e662ed2d96934966',
    role: 'Pokja',
    namaLengkap: 'Staf Pokja Hubin',
    jabatan: ROLE_TITLE_MAP.Pokja,
  },
  {
    id: 'AKN-KAKOMLI',
    username: 'kakomli',
    defaultPassword: 'Kakomli@2026',
    passwordHash: 'sha256$kakomli_salt_2026$82d8f09bb4b6ef87a1cb7a29b41358be64f58f239d9ad1be626c0c10494f8f96',
    role: 'Kakomli',
    namaLengkap: 'Ketua Kompetensi Keahlian',
    jabatan: ROLE_TITLE_MAP.Kakomli,
  },
];

async function sha256HexBrowser(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashPassword(plainPassword: string, customSalt?: string): Promise<string> {
  const salt =
    customSalt ||
    Array.from(crypto.getRandomValues(new Uint8Array(12)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  const hex = await sha256HexBrowser(`${salt}:${plainPassword}`);
  return `sha256$${salt}$${hex}`;
}

export async function verifyPasswordHash(plainPassword: string, storedHash: string): Promise<boolean> {
  const trimmed = String(storedHash || '').trim();
  if (!trimmed) return false;

  if (trimmed.startsWith('sha256$')) {
    const parts = trimmed.split('$');
    if (parts.length !== 3) return false;
    const [, salt, expectedHex] = parts;
    const actualHex = await sha256HexBrowser(`${salt}:${plainPassword}`);
    return actualHex === expectedHex;
  }

  // Fallback for manually entered plain text in sheet if someone typed directly in Excel/Sheets
  return plainPassword === trimmed;
}

function normalizeAccountRow(raw: Record<string, any>, idx: number): AdminAccountRecord | null {
  const username = String(raw.Username || raw.username || '').trim().toLowerCase();
  if (!username) return null;

  const rawRole = String(raw.Role || raw.role || 'Pokja').trim();
  const validRoles = ['Hubin', 'Kepsek', 'Waka', 'Pokja', 'Kakomli'] as const;
  const role = (validRoles.includes(rawRole as any) ? rawRole : 'Pokja') as AdminAccountRecord['role'];

  const rawStatus = String(raw.Status || raw.status || 'Aktif').trim().toLowerCase();
  const status: 'Aktif' | 'Nonaktif' = rawStatus === 'nonaktif' ? 'Nonaktif' : 'Aktif';

  return {
    id: String(raw.ID || raw.id || `AKN-${idx + 1}`).trim(),
    username,
    passwordHash: String(raw.Password_Hash || raw.passwordHash || raw.password_hash || '').trim(),
    role,
    namaLengkap: String(raw.Nama_Lengkap || raw.namaLengkap || raw.nama || username).trim(),
    jabatan: String(raw.Jabatan || raw.jabatan || ROLE_TITLE_MAP[role]).trim(),
    status,
    updatedAt: String(raw.Updated_At || raw.updatedAt || '').trim(),
  };
}

function buildDefaultAccountsList(): AdminAccountRecord[] {
  const nowIso = new Date().toISOString();
  return DEFAULT_ADMIN_ACCOUNTS.map((d) => ({
    id: d.id,
    username: d.username,
    passwordHash: d.passwordHash,
    role: d.role,
    namaLengkap: d.namaLengkap,
    jabatan: d.jabatan,
    status: 'Aktif',
    updatedAt: nowIso,
    isDefaultSeed: true,
  }));
}

async function resolveDefaultHashes(): Promise<AdminAccountRecord[]> {
  // Ensure precomputed hashes match SubtleCrypto exactly
  const defaults = buildDefaultAccountsList();
  for (let i = 0; i < defaults.length; i++) {
    const def = DEFAULT_ADMIN_ACCOUNTS[i];
    const salt = `${def.username}_salt_2026`;
    defaults[i].passwordHash = await hashPassword(def.defaultPassword, salt);
  }
  return defaults;
}

export function getStoredAdminSession(): StoredAdminSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ADMIN_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAdminSession;
    if (!parsed?.user?.username || !parsed?.expiresAt || Date.now() > parsed.expiresAt) {
      window.localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveAdminSession(session: StoredAdminSession): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ADMIN_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // ignore storage errors
  }
}

export function clearAdminSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function getAdminSessionToken(): string | null {
  return getStoredAdminSession()?.sessionToken || null;
}

async function fetchMasterAkunDirectViaGas(): Promise<{
  accounts: AdminAccountRecord[];
  sheetExists: boolean;
}> {
  const client = GoogleSheetClient.getInstance();
  let cfg = client.getConfig();
  if (!cfg.isFirestoreHydrated) {
    await client.initFromFirestore();
    cfg = client.getConfig();
  }

  if (!cfg.spreadsheetId || !cfg.gasDeployUrl) {
    return { accounts: [], sheetExists: false };
  }

  const validation = validateGasDeployUrl(cfg.gasDeployUrl);
  if (!validation.valid) {
    return { accounts: [], sheetExists: false };
  }

  const gasUrl = validation.normalizedUrl;
  const sep = gasUrl.includes('?') ? '&' : '?';
  const targetUrl = `${gasUrl}${sep}sheet=${encodeURIComponent(
    MASTER_AKUN_SHEET_NAME
  )}&year=${encodeURIComponent(cfg.activeYear)}&spreadsheetId=${encodeURIComponent(
    cfg.spreadsheetId
  )}`;

  const { ok, data: json } = await safeFetchJson(targetUrl, {
    method: 'GET',
    redirect: 'follow',
  });

  if (!ok || json?.error) {
    const errMsg = String(json?.error || '');
    if (errMsg.toLowerCase().includes('tidak ditemukan') || errMsg.toLowerCase().includes('not found')) {
      return { accounts: [], sheetExists: false };
    }
    throw new Error(errMsg || 'Gagal membaca data akun dari Google Spreadsheet.');
  }

  const rawRows: any[] = Array.isArray(json?.data) ? json.data : [];
  const normalized = rawRows
    .map((r, i) => normalizeAccountRow(r, i))
    .filter((a): a is AdminAccountRecord => a !== null);

  return {
    accounts: normalized,
    sheetExists: !json?.missingSheet,
  };
}

export const LocalAccountAuthService = {
  async loginWithUsernamePassword(
    usernameInput: string,
    passwordInput: string
  ): Promise<StoredAdminSession> {
    const cleanUsername = usernameInput.trim().toLowerCase();
    const cleanPassword = passwordInput;

    if (!cleanUsername || !cleanPassword) {
      throw new Error('Username dan Password wajib diisi.');
    }

    // 1. Try server-side login proxy (validates Master_Akun via GAS + issues HMAC-signed Bearer token)
    try {
      const { ok, status, data } = await safeFetchJson('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cleanUsername,
          password: cleanPassword,
        }),
      });

      if (ok && data?.success && data?.user && data?.sessionToken) {
        const session: StoredAdminSession = {
          user: data.user,
          sessionToken: data.sessionToken,
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        };
        saveAdminSession(session);
        return session;
      }

      if (status === 401 || status === 403 || status === 400) {
        throw new Error(data?.message || 'Username atau Password salah.');
      }
    } catch (err: any) {
      const isStaticHostFallback =
        err instanceof HtmlResponseError ||
        err instanceof TypeError ||
        String(err?.message || '').includes('Failed to fetch');
      if (!isStaticHostFallback) {
        throw err;
      }
    }

    // 2. Static SPA / fallback verification directly against Cloud GAS Master_Akun or built-in defaults
    let accounts: AdminAccountRecord[] = [];
    try {
      const gasRes = await fetchMasterAkunDirectViaGas();
      accounts = gasRes.accounts;
    } catch {
      accounts = [];
    }

    if (accounts.length === 0) {
      accounts = await resolveDefaultHashes();
    }

    const matched = accounts.find((a) => a.username.toLowerCase() === cleanUsername);
    if (!matched) {
      throw new Error(`Username "${cleanUsername}" tidak ditemukan.`);
    }
    if (matched.status === 'Nonaktif') {
      throw new Error(`Akun "${cleanUsername}" sedang dinonaktifkan oleh Admin Hubin.`);
    }

    const isValid = await verifyPasswordHash(cleanPassword, matched.passwordHash);
    if (!isValid) {
      throw new Error('Password yang Anda masukkan tidak sesuai.');
    }

    const sessionUser: AdminSessionUser = {
      id: matched.id,
      username: matched.username,
      role: matched.role,
      name: matched.namaLengkap,
      title: matched.jabatan || ROLE_TITLE_MAP[matched.role],
      email: '',
      identifier: matched.username,
      canManageSpreadsheet:
        matched.role === 'Hubin' || matched.role === 'Kepsek' || matched.role === 'Waka',
    };

    const session: StoredAdminSession = {
      user: sessionUser,
      sessionToken: `local_gas_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };
    saveAdminSession(session);
    return session;
  },

  async fetchAccounts(): Promise<{ accounts: AdminAccountRecord[]; syncedToSheet: boolean }> {
    const token = getAdminSessionToken();
    if (token) {
      try {
        const { ok, data } = await safeFetchJson('/api/admin/accounts', {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
        if (ok && data?.success && Array.isArray(data.accounts)) {
          return {
            accounts: data.accounts,
            syncedToSheet: Boolean(data.syncedToSheet),
          };
        }
      } catch (err: any) {
        if (
          !(err instanceof HtmlResponseError) &&
          !String(err?.message || '').includes('Failed to fetch')
        ) {
          throw err;
        }
      }
    }

    try {
      const direct = await fetchMasterAkunDirectViaGas();
      if (direct.accounts.length > 0) {
        return { accounts: direct.accounts, syncedToSheet: true };
      }
    } catch {
      // fall through to defaults
    }

    const defaults = await resolveDefaultHashes();
    return { accounts: defaults, syncedToSheet: false };
  },

  async saveAccount(params: {
    id?: string;
    username: string;
    newPassword?: string;
    role: AdminAccountRecord['role'];
    namaLengkap: string;
    jabatan?: string;
    status: 'Aktif' | 'Nonaktif';
  }): Promise<{ accounts: AdminAccountRecord[]; updatedAccount?: AdminAccountRecord; syncedToSheet: boolean }> {
    const cleanUsername = params.username.trim().toLowerCase();
    if (!cleanUsername || !/^[a-z0-9._-]{3,32}$/.test(cleanUsername)) {
      throw new Error(
        'Username harus 3–32 karakter (hanya huruf kecil, angka, titik, garis bawah, atau tanda hubung).'
      );
    }

    if (params.newPassword && params.newPassword.trim().length > 0 && params.newPassword.trim().length < 6) {
      throw new Error('Password baru minimal 6 karakter.');
    }

    const token = getAdminSessionToken();
    if (token && !token.startsWith('local_gas_')) {
      try {
        const { ok, status, data } = await safeFetchJson('/api/admin/accounts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            op: 'UPSERT',
            id: params.id,
            username: cleanUsername,
            newPassword: params.newPassword?.trim() || '',
            role: params.role,
            namaLengkap: params.namaLengkap.trim() || cleanUsername,
            jabatan: (params.jabatan || '').trim() || ROLE_TITLE_MAP[params.role],
            status: params.status,
          }),
        });

        if (ok && data?.success && Array.isArray(data.accounts)) {
          const updatedAccount = data.accounts.find(
            (a: AdminAccountRecord) =>
              (params.id && a.id === params.id) || a.username === cleanUsername
          );
          if (updatedAccount) {
            this.refreshStoredSessionIfSelf(updatedAccount);
          }
          return {
            accounts: data.accounts,
            updatedAccount,
            syncedToSheet: Boolean(data.syncedToSheet),
          };
        }

        if (status >= 400 && status < 500 && data?.message) {
          throw new Error(data.message);
        }
        if (data?.message && !String(data.message).includes('Failed to fetch')) {
          throw new Error(data.message);
        }
      } catch (err: any) {
        if (
          !(err instanceof HtmlResponseError) &&
          !String(err?.message || '').includes('Failed to fetch')
        ) {
          throw err;
        }
      }
    }

    // Static SPA fallback: read hashes directly from GAS Master_Akun (or default seeds)
    let currentList: AdminAccountRecord[] = [];
    try {
      const direct = await fetchMasterAkunDirectViaGas();
      currentList = direct.accounts;
    } catch {
      currentList = [];
    }
    const defaults = await resolveDefaultHashes();
    if (currentList.length === 0) {
      currentList = defaults;
    }

    const workingList: AdminAccountRecord[] = currentList.map((a) => ({ ...a }));
    const existingIdx = workingList.findIndex(
      (a) => (params.id && a.id === params.id) || a.username === cleanUsername
    );

    const duplicate = workingList.find(
      (a, idx) => a.username === cleanUsername && idx !== existingIdx
    );
    if (duplicate) {
      throw new Error(`Username "${cleanUsername}" sudah digunakan oleh akun lain.`);
    }

    let passwordHash = '';
    if (params.newPassword && params.newPassword.trim().length > 0) {
      passwordHash = await hashPassword(params.newPassword.trim());
    } else if (existingIdx !== -1) {
      passwordHash =
        workingList[existingIdx].passwordHash ||
        defaults.find((d) => d.id === workingList[existingIdx].id)?.passwordHash ||
        '';
    } else {
      throw new Error('Password wajib diisi untuk akun baru.');
    }

    const nowIso = new Date().toISOString();
    const record: AdminAccountRecord = {
      id:
        params.id ||
        (existingIdx !== -1
          ? workingList[existingIdx].id
          : `AKN-${Date.now().toString(36).toUpperCase()}`),
      username: cleanUsername,
      passwordHash,
      role: params.role,
      namaLengkap: params.namaLengkap.trim() || cleanUsername,
      jabatan: (params.jabatan || '').trim() || ROLE_TITLE_MAP[params.role],
      status: params.status,
      updatedAt: nowIso,
      isDefaultSeed: false,
    };

    if (existingIdx !== -1) {
      workingList[existingIdx] = record;
    } else {
      workingList.push(record);
    }

    await this.syncAccountsDirectToGas(workingList);
    this.refreshStoredSessionIfSelf(record);

    return { accounts: workingList, updatedAccount: record, syncedToSheet: true };
  },

  async deleteAccount(accountId: string): Promise<AdminAccountRecord[]> {
    const token = getAdminSessionToken();
    if (token && !token.startsWith('local_gas_')) {
      try {
        const { ok, status, data } = await safeFetchJson('/api/admin/accounts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ op: 'DELETE', id: accountId }),
        });

        if (ok && data?.success && Array.isArray(data.accounts)) {
          return data.accounts;
        }
        if (status >= 400 && status < 500 && data?.message) {
          throw new Error(data.message);
        }
        if (data?.message && !String(data.message).includes('Failed to fetch')) {
          throw new Error(data.message);
        }
      } catch (err: any) {
        if (
          !(err instanceof HtmlResponseError) &&
          !String(err?.message || '').includes('Failed to fetch')
        ) {
          throw err;
        }
      }
    }

    const direct = await fetchMasterAkunDirectViaGas();
    const currentList = direct.accounts.length > 0 ? direct.accounts : await resolveDefaultHashes();
    const target = currentList.find((a) => a.id === accountId);
    if (!target) return currentList;

    const remainingHubin = currentList.filter(
      (a) => a.id !== accountId && a.role === 'Hubin' && a.status === 'Aktif'
    );
    if (target.role === 'Hubin' && remainingHubin.length === 0) {
      throw new Error('Minimal harus ada 1 akun Hubin aktif agar pengelola tetap bisa masuk.');
    }

    const updated = currentList.filter((a) => a.id !== accountId);
    await this.syncAccountsDirectToGas(updated);
    return updated;
  },

  async bootstrapDefaultAccountsToSheet(): Promise<AdminAccountRecord[]> {
    const token = getAdminSessionToken();
    if (token && !token.startsWith('local_gas_')) {
      try {
        const { ok, data } = await safeFetchJson('/api/admin/accounts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ op: 'BOOTSTRAP' }),
        });

        if (ok && data?.success && Array.isArray(data.accounts)) {
          return data.accounts;
        }
        if (data?.message && !String(data.message).includes('Failed to fetch')) {
          throw new Error(data.message);
        }
      } catch (err: any) {
        if (
          !(err instanceof HtmlResponseError) &&
          !String(err?.message || '').includes('Failed to fetch')
        ) {
          throw err;
        }
      }
    }

    const defaults = await resolveDefaultHashes();
    let listToSave = defaults;
    try {
      const direct = await fetchMasterAkunDirectViaGas();
      if (direct.accounts.length > 0) {
        listToSave = direct.accounts;
      }
    } catch {
      // use defaults
    }

    await this.syncAccountsDirectToGas(listToSave);
    return listToSave.map((a) => ({ ...a, isDefaultSeed: false }));
  },

  refreshStoredSessionIfSelf(record: Pick<AdminAccountRecord, 'id' | 'username' | 'role' | 'namaLengkap' | 'jabatan'>): void {
    const currentSession = getStoredAdminSession();
    if (currentSession && currentSession.user.id === record.id) {
      saveAdminSession({
        ...currentSession,
        user: {
          ...currentSession.user,
          username: record.username,
          identifier: record.username,
          name: record.namaLengkap,
          title: record.jabatan || ROLE_TITLE_MAP[record.role],
          role: record.role,
          canManageSpreadsheet:
            record.role === 'Hubin' || record.role === 'Kepsek' || record.role === 'Waka',
        },
      });
    }
  },

  async syncAccountsDirectToGas(accounts: AdminAccountRecord[]): Promise<void> {
    const rowsPayload = accounts.map((a) => ({
      id: a.id,
      ID: a.id,
      Username: a.username,
      Password_Hash: a.passwordHash,
      Role: a.role,
      Nama_Lengkap: a.namaLengkap,
      Jabatan: a.jabatan,
      Status: a.status,
      Updated_At: a.updatedAt || new Date().toISOString(),
    }));

    const client = GoogleSheetClient.getInstance();
    const res = await client.syncSheetFull(MASTER_AKUN_SHEET_NAME, rowsPayload);
    if (!res.success) {
      throw new Error(res.message || 'Gagal menyimpan data akun ke Google Spreadsheet.');
    }
  },
};
