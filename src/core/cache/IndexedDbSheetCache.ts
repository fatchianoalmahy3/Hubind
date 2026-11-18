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
const LS_HOT_PREFIX = 'hubin_hot_';
const MAX_HOT_SERIALIZED_CHARS = 240_000;

export class IndexedDbSheetCache {
  private static instance: IndexedDbSheetCache;
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private memoryMirror = new Map<string, CachedSheetSnapshot>();
  private preloadPromises = new Map<string, Promise<void>>();

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

  private readHotLocalStorage<T = any>(key: string): CachedSheetSnapshot<T> | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw =
        window.localStorage.getItem(`${LS_HOT_PREFIX}${key}`) ||
        window.localStorage.getItem(`${LS_PREFIX}${key}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CachedSheetSnapshot<T>;
      if (parsed && Array.isArray(parsed.data)) {
        this.memoryMirror.set(key, parsed);
        return parsed;
      }
    } catch {
      // ignore storage/parse error
    }
    return null;
  }

  private writeHotLocalStorage<T = any>(key: string, snapshot: CachedSheetSnapshot<T>): void {
    if (typeof window === 'undefined') return;
    try {
      const serialized = JSON.stringify(snapshot);
      if (serialized.length > MAX_HOT_SERIALIZED_CHARS) {
        window.localStorage.removeItem(`${LS_HOT_PREFIX}${key}`);
        return;
      }
      window.localStorage.setItem(`${LS_HOT_PREFIX}${key}`, serialized);
    } catch {
      // On QuotaExceededError, evict older hot entries cleanly and retry once
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k && k.startsWith(LS_HOT_PREFIX) && k !== `${LS_HOT_PREFIX}${key}`) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.slice(0, Math.ceil(keysToRemove.length / 2)).forEach((k) => {
          window.localStorage.removeItem(k);
        });
        const serialized = JSON.stringify(snapshot);
        if (serialized.length <= MAX_HOT_SERIALIZED_CHARS) {
          window.localStorage.setItem(`${LS_HOT_PREFIX}${key}`, serialized);
        }
      } catch {
        // ignore persistent quota constraints
      }
    }
  }

  public getSync<T = any>(key: string): CachedSheetSnapshot<T> | null {
    const inMem = this.memoryMirror.get(key);
    if (inMem) {
      return inMem as CachedSheetSnapshot<T>;
    }
    return this.readHotLocalStorage<T>(key);
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
        this.writeHotLocalStorage(key, fromIdb);
        return fromIdb;
      }
    }

    // Fallback to localStorage snapshot if IndexedDB unavailable
    return this.readHotLocalStorage<T>(key);
  }

  public async set<T = any>(key: string, data: T[], etag?: string): Promise<void> {
    const snapshot: CachedSheetSnapshot<T> = {
      key,
      data: Array.isArray(data) ? data : [],
      etag,
      updatedAt: Date.now(),
    };
    this.memoryMirror.set(key, snapshot);
    this.writeHotLocalStorage(key, snapshot);

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
        window.localStorage.removeItem(`${LS_HOT_PREFIX}${key}`);
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

    if (typeof window !== 'undefined') {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k && (k.startsWith(LS_HOT_PREFIX) || k.startsWith(LS_PREFIX))) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach((k) => window.localStorage.removeItem(k));
      } catch {
        // ignore
      }
    }
  }
}
