import { IndexedDbSheetCache } from '../cache/IndexedDbSheetCache';
import { safeFetchJson } from '../utils/safeFetchJson';
import { callPublicEndpoint } from './portalTransport';

export const PUBLIC_SWR_SOFT_TTL_MS = 45_000;
export const PUBLIC_TEACHER_SWR_TTL_MS = 20_000;

interface PublicListCacheEntry {
  data: any[];
  etag?: string;
  updatedAt: number;
  extra?: Record<string, any>;
}

function extractExtraFields(res: any): Record<string, any> | undefined {
  if (!res || typeof res !== 'object') return undefined;
  const ignored = new Set(['success', 'total', 'data', 'etag', 'notModified']);
  const out: Record<string, any> = {};
  for (const k of Object.keys(res)) {
    if (!ignored.has(k) && res[k] !== undefined) {
      out[k] = res[k];
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

const publicListMemCache = new Map<string, PublicListCacheEntry>();
const inFlightPublicRevalidations = new Map<string, Promise<any>>();
const trackedPublicCacheKeys = new Set<string>();

export function invalidatePublicTeacherCaches(includePetugasList = false): void {
  const idb = IndexedDbSheetCache.getInstance();
  for (const key of Array.from(trackedPublicCacheKeys)) {
    if (
      key.includes('public::dudi-students::') ||
      key.includes('public::petugas-dudi::') ||
      key.includes('public::dudi-list') ||
      (includePetugasList && key.includes('public::petugas-list'))
    ) {
      publicListMemCache.delete(key);
      idb.delete(key).catch(() => {});
    }
  }
  for (const key of Array.from(publicListMemCache.keys())) {
    if (
      key.includes('public::dudi-students::') ||
      key.includes('public::petugas-dudi::') ||
      key.includes('public::dudi-list') ||
      (includePetugasList && key.includes('public::petugas-list'))
    ) {
      publicListMemCache.delete(key);
    }
  }
}

export async function executeSwrCachedPublicList<TExtra extends object = {}>(params: {
  idbKey: string;
  inflightPrefix: string;
  softTtlMs: number;
  forceRefresh?: boolean;
  trackKey?: boolean;
  useSyncIdbHit?: boolean;
  apiUrl: string;
  directFetcher: () => Promise<{ success: boolean; total: number; data: any[] } & Partial<TExtra>>;
  onUpdate?: (res: { success: boolean; total: number; data: any[] } & Partial<TExtra>) => void;
}): Promise<{ success: boolean; total: number; data: any[] } & Partial<TExtra>> {
  const {
    idbKey,
    inflightPrefix,
    softTtlMs,
    forceRefresh,
    trackKey = false,
    useSyncIdbHit = false,
    apiUrl,
    directFetcher,
    onUpdate,
  } = params;

  if (trackKey) {
    trackedPublicCacheKeys.add(idbKey);
  }

  const readCached = async (): Promise<PublicListCacheEntry | null> => {
    const mem = publicListMemCache.get(idbKey);
    if (mem) return mem;
    if (useSyncIdbHit) {
      const syncHit = IndexedDbSheetCache.getInstance().getSync(idbKey);
      if (syncHit) {
        const entry: PublicListCacheEntry = {
          data: syncHit.data,
          etag: syncHit.etag,
          updatedAt: syncHit.updatedAt,
          extra: syncHit.extra,
        };
        publicListMemCache.set(idbKey, entry);
        return entry;
      }
    }
    const fromIdb = await IndexedDbSheetCache.getInstance().get(idbKey);
    if (fromIdb) {
      const entry: PublicListCacheEntry = {
        data: fromIdb.data,
        etag: fromIdb.etag,
        updatedAt: fromIdb.updatedAt,
        extra: fromIdb.extra,
      };
      publicListMemCache.set(idbKey, entry);
      return entry;
    }
    return null;
  };

  const persistCache = (rows: any[], etagVal?: string, rawResponse?: any) => {
    const extra = extractExtraFields(rawResponse);
    const entry: PublicListCacheEntry = {
      data: rows,
      etag: etagVal,
      updatedAt: Date.now(),
      ...(extra ? { extra } : {}),
    };
    publicListMemCache.set(idbKey, entry);
    IndexedDbSheetCache.getInstance().set(idbKey, rows, etagVal, extra).catch(() => {});
  };

  const fetchFresh = async (priorEtag?: string) => {
    const inflightKey = `${inflightPrefix}::${idbKey}`;
    const existing = inFlightPublicRevalidations.get(inflightKey);
    if (existing) return existing;

    const task = (async () => {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (priorEtag && !forceRefresh) {
        headers['If-None-Match'] = priorEtag;
      }

      return callPublicEndpoint(
        async () => {
          const fetched = await safeFetchJson(apiUrl, { headers });
          if (fetched.notModified) {
            const cachedNow = await readCached();
            if (cachedNow) {
              const refreshed: PublicListCacheEntry = {
                ...cachedNow,
                updatedAt: Date.now(),
                etag: fetched.etag || cachedNow.etag,
              };
              publicListMemCache.set(idbKey, refreshed);
              IndexedDbSheetCache.getInstance()
                .set(idbKey, refreshed.data, refreshed.etag, refreshed.extra)
                .catch(() => {});
              return {
                ok: true,
                status: 200,
                data: {
                  ...(cachedNow.extra || {}),
                  success: true,
                  total: cachedNow.data.length,
                  data: cachedNow.data,
                  notModified: true,
                },
              };
            }
          }
          if (fetched.ok && fetched.data?.success && Array.isArray(fetched.data.data)) {
            persistCache(fetched.data.data, fetched.etag || fetched.data.etag, fetched.data);
          }
          return fetched;
        },
        async () => {
          const directRes = await directFetcher();
          persistCache(directRes.data || [], undefined, directRes);
          return directRes;
        }
      );
    })().finally(() => {
      inFlightPublicRevalidations.delete(inflightKey);
    });

    inFlightPublicRevalidations.set(inflightKey, task);
    return task;
  };

  if (!forceRefresh) {
    const cached = await readCached();
    if (cached && Array.isArray(cached.data) && cached.data.length > 0) {
      if (Date.now() - cached.updatedAt > softTtlMs) {
        void fetchFresh(cached.etag)
          .then((freshRes: any) => {
            if (!freshRes?.notModified && freshRes?.success) {
              onUpdate?.({
                ...freshRes,
                success: true,
                total: freshRes.data.length,
                data: freshRes.data,
              });
            }
          })
          .catch(() => {});
      }
      return {
        ...(cached.extra || {}),
        success: true,
        total: cached.data.length,
        data: cached.data,
      } as any;
    }
    // For teacher/student scoped caches, even empty array cache hits can SWR-revalidate cleanly
    if (cached && Array.isArray(cached.data) && useSyncIdbHit) {
      if (Date.now() - cached.updatedAt > softTtlMs) {
        void fetchFresh(cached.etag)
          .then((freshRes: any) => {
            if (!freshRes?.notModified && freshRes?.success) {
              onUpdate?.({
                ...freshRes,
                success: true,
                total: freshRes.data.length,
                data: freshRes.data,
              });
            }
          })
          .catch(() => {});
      }
      return {
        ...(cached.extra || {}),
        success: true,
        total: cached.data.length,
        data: cached.data,
      } as any;
    }
  }

  const res = await fetchFresh();
  return {
    ...res,
    success: Boolean(res?.success),
    total: res?.total ?? res?.data?.length ?? 0,
    data: res?.data || [],
  };
}
