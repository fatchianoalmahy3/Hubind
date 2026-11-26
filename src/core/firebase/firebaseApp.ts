import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// CRITICAL: Pass firestoreDatabaseId explicitly for provisioned Enterprise Firestore instance
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export { app };

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function isTransientFirestoreError(error: unknown): boolean {
  const code = String((error as any)?.code || '').toLowerCase();
  const message = String(error instanceof Error ? error.message : error || '').toLowerCase();
  return (
    code === 'internal' ||
    code === 'unavailable' ||
    code === 'deadline-exceeded' ||
    code === 'resource-exhausted' ||
    message.includes('internal error encountered') ||
    message.includes('the service is currently unavailable')
  );
}

async function testFirestoreConnection(): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
      return;
    } catch (error) {
      if (isTransientFirestoreError(error) && attempt === 0) {
        await new Promise((r) => setTimeout(r, 350));
        continue;
      }
      if (error instanceof Error && error.message.includes('the client is offline')) {
        console.error('Please check your Firebase configuration (Firestore offline).');
      } else if (isTransientFirestoreError(error)) {
        console.warn('[Firestore] Transient startup connection error; continuing safely.');
      }
      return;
    }
  }
}

void testFirestoreConnection();
