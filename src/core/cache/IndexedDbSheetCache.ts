export interface CachedSheetSnapshot<T = any> {
  key: string;
  data: T[];
  etag?: string;
  updatedAt: number;
}

const DB_NAME = 'hubin_cloud_swr_v1';
const STORE_NAME = 'sheet_snapshots';
const DB_VERSION = 1;
const LS_PREFIX = 'hubin_swr_';

export class IndexedDbSheetCache {
  private static instance: IndexedDbSheetCache;
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private memoryMirror = new Map<string, CachedSheetSnapshot>();

  private constructor() {}

  public static getInstance(): IndexedDbSheetCache {
    if (!IndexedDbSheetCache.instance) {
      IndexedDbSheetCache.instance = new IndexedDbSheetCache();
    }
    return IndexedDbSheetCache.instance;
  }

  public static buildKey(spreadsheetId: string, activeYear: string, tableName: string): string {
    const cleanTable =
      tableName === 'Master_Siswa' ? 'Master_Siswa_XI' : String(tableName || '').trim();
    return `${String(spreadsheetId || '').trim()}::${String(activeYear || '').trim()}::${cleanTable}`;
  }

  private openDb(): Promise<IDBDatabase | null> {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      return Promise.resolve(null);
    }
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve) => {
      try {
        const req = window.indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });

    return this.dbPromise;
  }

  public async get<T = any>(key: string): Promise<CachedSheetSnapshot<T> | null> {
    const inMem = this.memoryMirror.get(key);
    if (inMem) {
      return inMem as CachedSheetSnapshot<T>;
    }

    const db = await this.openDb();
    if (db) {
      const fromIdb = await new Promise<CachedSheetSnapshot<T> | null>((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(key);
          req.onsuccess = () => {
            const val = req.result as CachedSheetSnapshot<T> | undefined;
            resolve(val && Array.isArray(val.data) ? val : null);
          };
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });

      if (fromIdb) {
        this.memoryMirror.set(key, fromIdb);
        return fromIdb;
      }
    }

    // Fallback to localStorage for small datasets if IndexedDB unavailable
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(`${LS_PREFIX}${key}`);
        if (raw) {
          const parsed = JSON.parse(raw) as CachedSheetSnapshot<T>;
          if (parsed && Array.isArray(parsed.data)) {
            this.memoryMirror.set(key, parsed);
            return parsed;
          }
        }
      } catch {
        // ignore storage errors
      }
    }

    return null;
  }

  public async set<T = any>(key: string, data: T[], etag?: string): Promise<void> {
    const snapshot: CachedSheetSnapshot<T> = {
      key,
      data: Array.isArray(data) ? data : [],
      etag,
      updatedAt: Date.now(),
    };
    this.memoryMirror.set(key, snapshot);

    const db = await this.openDb();
    if (db) {
      await new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          store.put(snapshot);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
      return;
    }

    if (typeof window !== 'undefined') {
      try {
        const serialized = JSON.stringify(snapshot);
        if (serialized.length < 500_000) {
          window.localStorage.setItem(`${LS_PREFIX}${key}`, serialized);
        }
      } catch {
        // ignore quota errors
      }
    }
  }

  public async delete(key: string): Promise<void> {
    this.memoryMirror.delete(key);

    const db = await this.openDb();
    if (db) {
      await new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).delete(key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    }

    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(`${LS_PREFIX}${key}`);
      } catch {
        // ignore
      }
    }
  }

  public async clearAll(): Promise<void> {
    this.memoryMirror.clear();

    const db = await this.openDb();
    if (db) {
      await new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    }
  }
}
