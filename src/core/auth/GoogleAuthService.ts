import {
  signInWithPopup,
  GoogleAuthProvider,
  User,
  signOut,
} from 'firebase/auth';
import { auth } from '../firebase/firebaseApp';
import { WorkspaceConfigStore } from '../firebase/WorkspaceConfigStore';

// Guard against known Firebase Auth JS SDK (v13.x) PopupOperation race
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const msg = String(event?.reason?.message || event?.reason || '');
    if (msg.includes('Pending promise was never set')) {
      event.preventDefault();
    }
  });
}

let activeVerifyPromise: Promise<User> | null = null;

function normalizeFirebaseVerifyError(error: any): Error & { code?: string } {
  const code = String(error?.code || '');
  const rawMsg = String(error?.message || '');

  let friendlyMsg = rawMsg || 'Gagal memverifikasi Super Admin Firebase.';
  if (code === 'auth/popup-closed-by-user') {
    friendlyMsg =
      'Jendela verifikasi Firebase ditutup sebelum selesai. Klik Simpan lagi jika ingin memverifikasi Super Admin.';
  } else if (code === 'auth/cancelled-popup-request') {
    friendlyMsg = 'Permintaan verifikasi Firebase dibatalkan karena ada jendela lain yang terbuka.';
  } else if (code === 'auth/popup-blocked') {
    friendlyMsg =
      'Popup verifikasi Firebase diblokir browser. Izinkan pop-up untuk menyimpan pengaturan ke Firestore.';
  } else if (rawMsg.includes('Pending promise was never set')) {
    friendlyMsg = 'Verifikasi Firebase terganggu. Silakan klik tombol simpan kembali.';
  }

  const normalized = new Error(friendlyMsg) as Error & { code?: string };
  if (code) normalized.code = code;
  return normalized;
}

/**
 * Scopeless Firebase Google Sign-In strictly for verifying Super Admin / Admin
 * permission ONLY when modifying central /config/workspace settings in Firestore.
 * Does NOT request any Google Workspace OAuth scopes (no Drive/Sheets/Docs OAuth).
 */
export const ensureFirebaseConfigAdminSignedIn = async (): Promise<User> => {
  if (auth.currentUser) {
    const alreadyAuthorized = await WorkspaceConfigStore.checkIsAuthorizedAdmin().catch(() => false);
    if (alreadyAuthorized) {
      return auth.currentUser;
    }
  }

  if (activeVerifyPromise) {
    return activeVerifyPromise;
  }

  activeVerifyPromise = (async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);

      await WorkspaceConfigStore.ensureSuperAdminRecord().catch(() => {});
      const isAuthorized = await WorkspaceConfigStore.checkIsAuthorizedAdmin();
      if (!isAuthorized) {
        await signOut(auth).catch(() => {});
        throw new Error(
          `Akun (${result.user.email || 'tidak diketahui'}) bukan Super Admin Firebase yang berwenang mengubah konfigurasi /config/workspace.`
        );
      }

      return result.user;
    } catch (error: any) {
      throw normalizeFirebaseVerifyError(error);
    } finally {
      activeVerifyPromise = null;
    }
  })();

  return activeVerifyPromise;
};

export const getCurrentFirebaseUser = (): User | null => {
  return auth.currentUser;
};

export const getFirebaseIdToken = async (forceRefresh = false): Promise<string | null> => {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken(forceRefresh);
  } catch {
    return null;
  }
};

export const signOutFirebaseAdmin = async () => {
  if (auth.currentUser) {
    await signOut(auth).catch(() => {});
  }
};
