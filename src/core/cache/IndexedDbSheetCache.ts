export interface CachedSheetSnapshot<T = any> {
  key: string;
  data: T[];
  etag?: string;
  updatedAt: number;
  extra?: Record<string, any>;
}

const DB_NAME = 'hubin_cloud_swr_v1';
const STORE_NAME = 'sheet_snapshots';
const DB_VERSION = 1;
const LEGACY_LS_PREFIXES = ['hubin_swr_', 'hubin_hot_'];

function purgeLegacyCacheLocalStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && LEGACY_LS_PREFIXES.some((prefix) => k.startsWith(prefix))) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // ignore storage access errors
  }
}

export class IndexedDbSheetCache {
  private static instance: IndexedDbSheetCache;
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private memoryMirror = new Map<string, CachedSheetSnapshot>();
  private preloadPromises = new Map<string, Promise<void>>();
  private legacyPurged = false;

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
    if (!this.legacyPurged) {
      this.legacyPurged = true;
      purgeLegacyCacheLocalStorage();
    }
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

  public getSync<T = any>(key: string): CachedSheetSnapshot<T> | null {
    const inMem = this.memoryMirror.get(key);
    return inMem ? (inMem as CachedSheetSnapshot<T>) : null;
  }

  public async preloadAll(spreadsheetId: string, activeYear: string): Promise<void> {
    const cleanId = String(spreadsheetId || '').trim();
    const cleanYear = String(activeYear || '').trim();
    if (!cleanId) return;

    const prefix = `${cleanId}::${cleanYear}::`;
    const existing = this.preloadPromises.get(prefix);
    if (existing) return existing;

    const promise = (async () => {
      const db = await this.openDb();
      if (!db) return;
      await new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.openCursor();
          req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) {
              resolve();
              return;
            }
            const val = cursor.value as CachedSheetSnapshot | undefined;
            if (
              val &&
              typeof val.key === 'string' &&
              val.key.startsWith(prefix) &&
              Array.isArray(val.data) &&
              !this.memoryMirror.has(val.key)
            ) {
              this.memoryMirror.set(val.key, val);
            }
            cursor.continue();
          };
          req.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    })();

    this.preloadPromises.set(prefix, promise);
    try {
      await promise;
    } finally {
      this.preloadPromises.delete(prefix);
    }
  }

  public async get<T = any>(key: string): Promise<CachedSheetSnapshot<T> | null> {
    const inMem = this.memoryMirror.get(key);
    if (inMem) {
      return inMem as CachedSheetSnapshot<T>;
    }

    const db = await this.openDb();
    if (!db) return null;

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
    return null;
  }

  public async set<T = any>(
    key: string,
    data: T[],
    etag?: string,
    extra?: Record<string, any>
  ): Promise<void> {
    const snapshot: CachedSheetSnapshot<T> = {
      key,
      data: Array.isArray(data) ? data : [],
      etag,
      updatedAt: Date.now(),
      ...(extra && Object.keys(extra).length > 0 ? { extra } : {}),
    };
    this.memoryMirror.set(key, snapshot);

    const db = await this.openDb();
    if (!db) return;

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
  }

  public async delete(key: string): Promise<void> {
    this.memoryMirror.delete(key);

    const db = await this.openDb();
    if (!db) return;

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

  public async clearAll(): Promise<void> {
    this.memoryMirror.clear();
    purgeLegacyCacheLocalStorage();

    const db = await this.openDb();
    if (!db) return;

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
