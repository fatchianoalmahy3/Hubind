import crypto from 'crypto';
import type { Request } from 'express';
import { pickField } from '../../src/core/utils/rowFieldHelpers';
import { BOOTSTRAP_ADMIN_EMAIL, firebaseCfg } from '../config/runtimeConfig';
import {
  type AdminSessionPayload,
  type AuthenticatedAdmin,
  PortalConfigError,
  type ServerAdminAccountRecord,
} from '../types';
import { fetchLiveSheetViaGas } from './sheetsTransport';

export const ROLE_TITLE_MAP: Record<string, string> = {
  SuperAdmin: 'Super Administrator Sistem & Server',
  Hubin: 'Koordinator Pokja Hubin & Kerjasama DUDI',
  Kepsek: 'Kepala Sekolah SMK PGRI 2 Ponorogo',
  Waka: 'Wakil Kepala Sekolah Bidang Hubin',
  Pokja: 'Tim Pokja Hubin & Pendamping PKL',
  Kakomli: 'Ketua Konsentrasi Keahlian (Kakomli)',
};

const DEFAULT_ADMIN_SEED = [
  {
    id: 'AKN-SUPERADMIN',
    username: 'superadmin',
    defaultPassword: 'SuperAdmin@2026',
    role: 'SuperAdmin',
    namaLengkap: 'Super Admin Sistem',
    jabatan: ROLE_TITLE_MAP.SuperAdmin,
  },
  {
    id: 'AKN-HUBIN',
    username: 'hubin',
    defaultPassword: 'Hubin@2026',
    role: 'Hubin',
    namaLengkap: 'Admin Pokja Hubin',
    jabatan: ROLE_TITLE_MAP.Hubin,
  },
  {
    id: 'AKN-KEPSEK',
    username: 'kepsek',
    defaultPassword: 'Kepsek@2026',
    role: 'Kepsek',
    namaLengkap: 'Kepala Sekolah',
    jabatan: ROLE_TITLE_MAP.Kepsek,
  },
  {
    id: 'AKN-WAKA',
    username: 'waka',
    defaultPassword: 'Waka@2026',
    role: 'Waka',
    namaLengkap: 'Waka Bidang Hubin',
    jabatan: ROLE_TITLE_MAP.Waka,
  },
  {
    id: 'AKN-POKJA',
    username: 'pokja',
    defaultPassword: 'Pokja@2026',
    role: 'Pokja',
    namaLengkap: 'Staf Pokja Hubin',
    jabatan: ROLE_TITLE_MAP.Pokja,
  },
  {
    id: 'AKN-KAKOMLI',
    username: 'kakomli',
    defaultPassword: 'Kakomli@2026',
    role: 'Kakomli',
    namaLengkap: 'Ketua Kompetensi Keahlian',
    jabatan: ROLE_TITLE_MAP.Kakomli,
  },
];

function getSessionSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    crypto
      .createHash('sha256')
      .update(`${firebaseCfg.projectId}:${firebaseCfg.apiKey}:hubin-sterida-session-v1`)
      .digest('hex')
  );
}

export function hashPasswordServer(plainPassword: string, customSalt?: string): string {
  const salt = customSalt || crypto.randomBytes(12).toString('hex');
  const digest = crypto.createHash('sha256').update(`${salt}:${plainPassword}`).digest('hex');
  return `sha256$${salt}$${digest}`;
}

export function verifyPasswordServer(plainPassword: string, storedHash: string): boolean {
  const trimmed = String(storedHash || '').trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('sha256$')) {
    const parts = trimmed.split('$');
    if (parts.length !== 3) return false;
    const [, salt, expectedHex] = parts;
    const actualHex = crypto.createHash('sha256').update(`${salt}:${plainPassword}`).digest('hex');
    const a = Buffer.from(actualHex, 'utf8');
    const b = Buffer.from(expectedHex, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  return plainPassword === trimmed;
}

export function signAdminSessionToken(payload: Omit<AdminSessionPayload, 'exp'>): string {
  const full: AdminSessionPayload = {
    ...payload,
    exp: Date.now() + 24 * 60 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(full), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  return `hb1.${encoded}.${sig}`;
}

export function verifyAdminSessionToken(token: string): AdminSessionPayload | null {
  if (!token.startsWith('hb1.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(sig, 'utf8');
  const expBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as AdminSessionPayload;
    if (!decoded?.username || !decoded?.exp || Date.now() > decoded.exp) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function buildDefaultAdminRecords(): ServerAdminAccountRecord[] {
  const nowIso = new Date().toISOString();
  return DEFAULT_ADMIN_SEED.map((d) => ({
    id: d.id,
    username: d.username,
    passwordHash: hashPasswordServer(d.defaultPassword, `${d.username}_salt_2026`),
    role: d.role,
    namaLengkap: d.namaLengkap,
    jabatan: d.jabatan,
    status: 'Aktif',
    updatedAt: nowIso,
    isDefaultSeed: true,
  }));
}

function normalizeAccountRecord(raw: any, idx: number): ServerAdminAccountRecord | null {
  const username = pickField(raw, 'Username', 'username').toLowerCase();
  if (!username) return null;
  const validRoles = ['SuperAdmin', 'Hubin', 'Kepsek', 'Waka', 'Pokja', 'Kakomli'];
  const rawRole = pickField(raw, 'Role', 'role') || 'Pokja';
  const role = validRoles.includes(rawRole) ? rawRole : 'Pokja';
  const rawStatus = pickField(raw, 'Status', 'status').toLowerCase();
  return {
    id: pickField(raw, 'ID', 'id') || `AKN-${idx + 1}`,
    username,
    passwordHash: pickField(raw, 'Password_Hash', 'passwordHash', 'password_hash'),
    role,
    namaLengkap: pickField(raw, 'Nama_Lengkap', 'namaLengkap', 'nama') || username,
    jabatan: pickField(raw, 'Jabatan', 'jabatan') || ROLE_TITLE_MAP[role] || role,
    status: rawStatus === 'nonaktif' ? 'Nonaktif' : 'Aktif',
    updatedAt: pickField(raw, 'Updated_At', 'updatedAt'),
    isDefaultSeed: false,
  };
}

export async function fetchMasterAkunFromGasOrDefaults(forceRefresh = false): Promise<{
  accounts: ServerAdminAccountRecord[];
  syncedToSheet: boolean;
}> {
  try {
    const { rows } = await fetchLiveSheetViaGas('Master_Akun', forceRefresh);
    const parsed = rows
      .map((r, i) => normalizeAccountRecord(r, i))
      .filter((a): a is NonNullable<ReturnType<typeof normalizeAccountRecord>> => a !== null);

    if (parsed.length > 0) {
      return { accounts: parsed, syncedToSheet: true };
    }
  } catch (err: any) {
    const msg = String(err?.message || '').toLowerCase();
    const isFallbackable =
      msg.includes('tidak ditemukan') ||
      msg.includes('not found') ||
      err?.code === 'GAS_NOT_CONFIGURED' ||
      err?.code === 'SPREADSHEET_NOT_CONFIGURED';
    if (!isFallbackable) {
      console.warn('[Master_Akun] GAS read fallback to defaults:', err?.message);
    }
  }

  return { accounts: buildDefaultAdminRecords(), syncedToSheet: false };
}

export async function requireAdminAuth(req: Request): Promise<AuthenticatedAdmin> {
  const authHeader = String(req.headers.authorization || '');
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) {
    throw new PortalConfigError(
      'UNAUTHORIZED',
      'Sesi login pengelola tidak ditemukan. Silakan masuk kembali.',
      401
    );
  }

  const token = match[1].trim();
  const localSession = verifyAdminSessionToken(token);
  if (localSession) {
    return {
      id: localSession.id,
      username: localSession.username,
      role: localSession.role,
      name: localSession.name,
    };
  }

  if (!firebaseCfg.apiKey || !firebaseCfg.projectId) {
    throw new PortalConfigError('UNAUTHORIZED', 'Token sesi tidak valid atau kedaluwarsa.', 401);
  }

  const lookupRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseCfg.apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
    }
  );

  if (!lookupRes.ok) {
    throw new PortalConfigError('UNAUTHORIZED', 'Sesi login telah berakhir. Silakan masuk ulang.', 401);
  }

  const lookupJson = await lookupRes.json();
  const fbUser = lookupJson?.users?.[0];
  const uid = String(fbUser?.localId || '');
  const email = String(fbUser?.email || '');
  const emailVerified = Boolean(fbUser?.emailVerified);

  if (!uid || !emailVerified) {
    throw new PortalConfigError('FORBIDDEN', 'Akun tidak terverifikasi.', 403);
  }

  if (email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase()) {
    return { id: uid, username: email, role: 'SuperAdmin', name: fbUser?.displayName || email };
  }

  const adminDocUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    firebaseCfg.projectId
  )}/databases/${encodeURIComponent(firebaseCfg.firestoreDatabaseId)}/documents/admins/${encodeURIComponent(uid)}`;

  const adminRes = await fetch(adminDocUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!adminRes.ok) {
    throw new PortalConfigError(
      'FORBIDDEN',
      `Akun (${email}) tidak terdaftar sebagai Admin Hubin terotorisasi.`,
      403
    );
  }

  return { id: uid, username: email, role: 'Hubin', name: fbUser?.displayName || email };
}
