import { GoogleDriveSheetService } from '../GoogleDriveSheetService';
import { getAdminSessionToken } from '../auth/LocalAccountAuthService';
import {
  CORE_ADMIN_BOOTSTRAP_TABLES,
  SHEET_TO_REST_RESOURCE,
} from '../constants/sheetResourceMap';
import {
  formatGasNetworkError,
  isBackendProxyUnavailableError,
  normalizeGasUrl,
  safeFetchJson,
  validateGasDeployUrl,
} from '../utils/safeFetchJson';
import type { SheetSnapshotCache } from './SheetSnapshotCache';

export interface SheetTransportContext {
  activeYear: string;
  spreadsheetId: string;
  gasDeployUrl: string;
  isOnline: boolean;
}

export type SheetWriteAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'BULK_DELETE'
  | 'BULK_UPDATE'
  | 'IMPORT'
  | 'SYNC_ALL';

function projectRowFields(rows: any[], fields: string[]): any[] {
  const keys = Array.from(new Set(['id', '_sheetRowNumber', ...fields]));
  return rows.map((row) => {
    if (!row || typeof row !== 'object') return row;
    const projected: Record<string, any> = {};
    for (const k of keys) {
      if (k in row) projected[k] = row[k];
    }
    return projected;
  });
}

export class SheetRestTransport {
  private inFlightSheetFetches = new Map<
    string,
    Promise<{ data: any[]; fromSpreadsheet: boolean; error?: string; notModified?: boolean }>
  >();
  private bootstrapPromise: Promise<boolean> | null = null;

  constructor(private readonly snapshotCache: SheetSnapshotCache) {}

  public clearInFlight(): void {
    this.inFlightSheetFetches.clear();
  }

  public async resolveAuthBearerToken(): Promise<string | null> {
    const sessionToken = getAdminSessionToken();
    if (sessionToken && !sessionToken.startsWith('local_gas_')) {
      return sessionToken;
    }
    const { getFirebaseIdToken } = await import('../auth/GoogleAuthService');
    return await getFirebaseIdToken();
  }

  public async pingGasConnection(
    ctx: SheetTransportContext,
    customGasUrl?: string,
    customSpreadsheetId?: string
  ): Promise<{
    connected: boolean;
    title?: string;
    sheets?: string[];
    error?: string;
  }> {
    const rawGasUrl = customGasUrl !== undefined ? customGasUrl : ctx.gasDeployUrl;
    const validation = validateGasDeployUrl(rawGasUrl);
    if (!validation.valid) {
      return {
        connected: false,
        error: validation.error || 'URL Endpoint Cloud Server (/exec) belum dikonfigurasi.',
      };
    }

    const targetGas = validation.normalizedUrl;
    const targetSpreadsheetId = (
      customSpreadsheetId !== undefined ? customSpreadsheetId : ctx.spreadsheetId
    ).trim();

    if (!targetSpreadsheetId && customGasUrl === undefined) {
      return { connected: false, error: 'ID Database Cloud Server belum dikonfigurasi.' };
    }
    if (!ctx.isOnline) {
      return { connected: false, error: 'Perangkat sedang offline.' };
    }

    const bearerToken = await this.resolveAuthBearerToken();
    if (bearerToken) {
      try {
        const params = new URLSearchParams();
        if (customGasUrl !== undefined) {
          params.set('gasUrl', targetGas);
        }
        if (targetSpreadsheetId) {
          params.set('spreadsheetId', targetSpreadsheetId);
        }
        const qs = params.toString();
        const { ok, status, data: json } = await safeFetchJson(
          `/api/admin/gas-ping${qs ? `?${qs}` : ''}`,
          {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              Authorization: `Bearer ${bearerToken}`,
            },
          }
        );
        if (ok && json?.success) {
          return {
            connected: true,
            title: json.title,
            sheets: Array.isArray(json.sheets) ? json.sheets : [],
          };
        }
        if (json?.message && status < 500 && json?.code !== 'UNAUTHORIZED') {
          return { connected: false, error: json.message };
        }
      } catch (err: any) {
        if (!isBackendProxyUnavailableError(err)) {
          return { connected: false, error: err?.message || 'Gagal menghubungi proxy Cloud Server.' };
        }
      }
    }

    try {
      const sep = targetGas.includes('?') ? '&' : '?';
      const sidParam = targetSpreadsheetId
        ? `&spreadsheetId=${encodeURIComponent(targetSpreadsheetId)}`
        : '';
      const { ok, data: json } = await safeFetchJson(
        `${targetGas}${sep}action=PING&sheet=Master_Jurusan&year=${encodeURIComponent(
          ctx.activeYear
        )}${sidParam}`,
        {
          method: 'GET',
          redirect: 'follow',
        }
      );

      if (!ok || json?.error) {
        return {
          connected: false,
          error: json?.error || 'Endpoint Cloud Server tidak merespon PING dengan benar.',
        };
      }

      return {
        connected: true,
        title: json?.title,
        sheets: Array.isArray(json?.sheets) ? json.sheets : [],
      };
    } catch (err: any) {
      return {
        connected: false,
        error: formatGasNetworkError(err, targetGas),
      };
    }
  }

  public async bootstrapAdminTables(
    ctx: SheetTransportContext,
    forceFresh: boolean = false
  ): Promise<boolean> {
    if (!ctx.spreadsheetId || !ctx.gasDeployUrl || !ctx.isOnline) {
      return false;
    }
    if (!forceFresh && this.bootstrapPromise) {
      return this.bootstrapPromise;
    }

    const fetchAndHydrateBatch = async (
      tables: string[],
      etagHeader?: string
    ): Promise<{ ok: boolean; notModified: boolean; etag?: string }> => {
      const bearerToken = await this.resolveAuthBearerToken();
      if (!bearerToken) return { ok: false, notModified: false };
      const requestStartedAt = Date.now();

      const headers: Record<string, string> = {
        Accept: 'application/json',
        Authorization: `Bearer ${bearerToken}`,
      };
      if (!forceFresh && etagHeader) {
        headers['If-None-Match'] = etagHeader;
      }

      const params = new URLSearchParams();
      params.set('tables', tables.join(','));
      if (forceFresh) {
        params.set('fresh', '1');
        params.set('_ts', String(Date.now()));
      }

      const res = await safeFetchJson(`/api/v1/bootstrap?${params.toString()}`, {
        method: 'GET',
        timeoutMs: 18_000,
        headers,
      });

      if (res.notModified) {
        this.snapshotCache.touchAllEtagTimestamps(ctx.spreadsheetId);
        return { ok: true, notModified: true, etag: res.etag ?? undefined };
      }

      const json = res.data;
      if (res.ok && json?.success && json?.tables && typeof json.tables === 'object') {
        const normalizer = GoogleDriveSheetService.getInstance();
        const etagsMap: Record<string, string> = json.etags || {};
        const updatedTables: string[] = [];

        await Promise.all(
          Object.entries(json.tables).map(async ([tableName, rawRows]) => {
            if (!Array.isArray(rawRows)) return;
            const lastLocalMut = this.snapshotCache.getSheetLastMutatedAt(tableName);
            if (!forceFresh && lastLocalMut >= requestStartedAt) {
              return;
            }
            const normalized = normalizer.normalizeExternalRows(tableName, rawRows);
            await this.snapshotCache.saveCachedSnapshot(
              ctx.spreadsheetId,
              ctx.activeYear,
              tableName,
              normalized,
              etagsMap[tableName]
            );
            updatedTables.push(tableName);
          })
        );
        if (updatedTables.length > 0) {
          this.snapshotCache.notifyBootstrapUpdated(updatedTables);
        }
        return { ok: true, notModified: false, etag: res.etag || json.etag };
      }
      return { ok: false, notModified: false };
    };

    this.bootstrapPromise = (async () => {
      try {
        const currentBootstrapEtag = this.snapshotCache.getBootstrapEtag();
        const coreResult = await fetchAndHydrateBatch(
          CORE_ADMIN_BOOTSTRAP_TABLES,
          currentBootstrapEtag || undefined
        );
        if (!coreResult.ok) return false;
        if (coreResult.etag) {
          this.snapshotCache.setBootstrapEtag(coreResult.etag);
        }

        // Phase-2: Split heavy operational/monitoring tables so every payload stays well below Vercel 4.5MB limit
        await Promise.all([
          fetchAndHydrateBatch(['Data_Perizinan_PKL', 'Nilai_Dan_Sertifikat']).catch(() => null),
          fetchAndHydrateBatch(['Monitoring_5_Tahap']).catch(() => null),
        ]);

        return true;
      } catch {
        return false;
      }
    })();

    try {
      return await this.bootstrapPromise;
    } finally {
      this.bootstrapPromise = null;
    }
  }

  public async fetchSheetData(
    ctx: SheetTransportContext,
    sheetName: string,
    forceFresh: boolean = false,
    options?: { fields?: string[] }
  ): Promise<{ data: any[]; fromSpreadsheet: boolean; error?: string; notModified?: boolean }> {
    const requestedFields = Array.isArray(options?.fields)
      ? options.fields.map((f) => String(f).trim()).filter(Boolean)
      : undefined;
    const isProjected = Boolean(requestedFields && requestedFields.length > 0);

    if (!ctx.spreadsheetId) {
      return {
        data: [],
        fromSpreadsheet: false,
        error: 'Konfigurasi Database Cloud Server belum diatur.',
      };
    }

    if (!ctx.isOnline) {
      const offlineSnapshot = await this.snapshotCache.getCachedSnapshot(
        ctx.spreadsheetId,
        ctx.activeYear,
        sheetName
      );
      if (offlineSnapshot) {
        return {
          data: isProjected
            ? projectRowFields(offlineSnapshot.data, requestedFields!)
            : offlineSnapshot.data,
          fromSpreadsheet: true,
        };
      }
      return {
        data: [],
        fromSpreadsheet: false,
        error: 'Perangkat sedang offline. Sambungkan internet untuk mengakses Cloud Server.',
      };
    }

    if (!ctx.gasDeployUrl) {
      return {
        data: [],
        fromSpreadsheet: false,
        error: 'URL Endpoint Cloud Server (/exec) belum dikonfigurasi.',
      };
    }

    const baseCacheKey = `${ctx.spreadsheetId}::${sheetName}`;
    const flightKey = isProjected
      ? `${baseCacheKey}::fields=${requestedFields!.join(',')}`
      : baseCacheKey;

    if (!forceFresh) {
      const memHit = this.snapshotCache.getFreshMemoryEntry(ctx.spreadsheetId, sheetName);
      if (memHit) {
        return {
          data: isProjected ? projectRowFields(memHit.data, requestedFields!) : memHit.data,
          fromSpreadsheet: true,
        };
      }
      const existingFlight = this.inFlightSheetFetches.get(flightKey);
      if (existingFlight) {
        return existingFlight;
      }
    } else if (!isProjected) {
      this.snapshotCache.deleteMemoryEntry(ctx.spreadsheetId, sheetName);
    }

    const runFetch = (async () => {
      const normalizer = GoogleDriveSheetService.getInstance();
      const priorSnapshot =
        !forceFresh && !isProjected
          ? await this.snapshotCache.getCachedSnapshot(ctx.spreadsheetId, ctx.activeYear, sheetName)
          : null;

      const bearerToken = await this.resolveAuthBearerToken();
      if (bearerToken) {
        const restSlug = SHEET_TO_REST_RESOURCE[sheetName] || sheetName;
        try {
          const qsParams = new URLSearchParams();
          if (forceFresh) {
            qsParams.set('fresh', '1');
            qsParams.set('_ts', String(Date.now()));
          }
          if (isProjected) {
            qsParams.set('fields', requestedFields!.join(','));
          }
          const qsStr = qsParams.toString();
          const urlSuffix = qsStr ? `?${qsStr}` : '';

          const headers: Record<string, string> = {
            Accept: 'application/json',
            Authorization: `Bearer ${bearerToken}`,
          };
          if (!forceFresh && !isProjected && priorSnapshot?.etag) {
            headers['If-None-Match'] = priorSnapshot.etag;
          }

          const { ok, status, notModified, etag, data: json } = await safeFetchJson(
            `/api/v1/${encodeURIComponent(restSlug)}${urlSuffix}`,
            {
              method: 'GET',
              timeoutMs: 16_000,
              headers,
            }
          );

          if (notModified && priorSnapshot) {
            await this.snapshotCache.saveCachedSnapshot(
              ctx.spreadsheetId,
              ctx.activeYear,
              sheetName,
              priorSnapshot.data,
              etag || priorSnapshot.etag
            );
            return {
              data: priorSnapshot.data,
              fromSpreadsheet: true,
              notModified: true,
            };
          }

          if (ok && json?.success && Array.isArray(json.data)) {
            const normalized = normalizer.normalizeExternalRows(sheetName, json.data);
            if (!isProjected) {
              await this.snapshotCache.saveCachedSnapshot(
                ctx.spreadsheetId,
                ctx.activeYear,
                sheetName,
                normalized,
                etag || json.etag
              );
            }
            return {
              data: isProjected ? projectRowFields(normalized, requestedFields!) : normalized,
              fromSpreadsheet: true,
              notModified: false,
            };
          }

          if (
            json?.message &&
            status >= 400 &&
            status < 500 &&
            status !== 401 &&
            status !== 403 &&
            status !== 404
          ) {
            throw new Error(json.message);
          }
        } catch (proxyErr: any) {
          if (!isBackendProxyUnavailableError(proxyErr)) {
            throw proxyErr;
          }
        }
      }

      const validation = validateGasDeployUrl(ctx.gasDeployUrl);
      if (!validation.valid) {
        throw new Error(validation.error || 'URL Endpoint Cloud Server tidak valid.');
      }
      const gasUrl = validation.normalizedUrl;
      const sep = gasUrl.includes('?') ? '&' : '?';
      const freshParams = forceFresh ? `&fresh=1&_ts=${Date.now()}` : '';
      try {
        const { ok, status, data: json } = await safeFetchJson(
          `${gasUrl}${sep}sheet=${encodeURIComponent(sheetName)}&year=${encodeURIComponent(
            ctx.activeYear
          )}&spreadsheetId=${encodeURIComponent(ctx.spreadsheetId)}${freshParams}`,
          { method: 'GET', redirect: 'follow', cache: 'no-store', timeoutMs: 18_000 }
        );
        if (!ok) {
          throw new Error(`Cloud Server gagal memuat data modul (${status}).`);
        }
        if ((json.status === 'success' || json.success) && Array.isArray(json.data)) {
          const normalized = normalizer.normalizeExternalRows(sheetName, json.data);
          await this.snapshotCache.saveCachedSnapshot(
            ctx.spreadsheetId,
            ctx.activeYear,
            sheetName,
            normalized
          );
          return {
            data: isProjected ? projectRowFields(normalized, requestedFields!) : normalized,
            fromSpreadsheet: true,
          };
        }
        throw new Error(json.error || 'Format respon Cloud Server tidak valid.');
      } catch (err: any) {
        throw new Error(formatGasNetworkError(err, gasUrl));
      }
    })();

    this.inFlightSheetFetches.set(flightKey, runFetch);
    try {
      return await runFetch;
    } finally {
      this.inFlightSheetFetches.delete(flightKey);
    }
  }

  private normalizeOutgoingPayload(
    sheetName: string,
    action: SheetWriteAction,
    payload: any
  ): any {
    const normalizer = GoogleDriveSheetService.getInstance();
    const prep = (row: any) =>
      normalizer.stripFormulaManagedFields(
        sheetName,
        normalizer.prepareOutgoingRecord(sheetName, row)
      );

    if (action === 'CREATE' || action === 'UPDATE') {
      return prep(payload);
    }
    if (action === 'IMPORT' || action === 'SYNC_ALL') {
      return Array.isArray(payload) ? payload.map((row) => prep(row)) : payload;
    }
    if (action === 'BULK_UPDATE' && payload && typeof payload === 'object') {
      return {
        ...payload,
        updatedRows: Array.isArray(payload.updatedRows)
          ? payload.updatedRows.map((row: any) => prep(row))
          : [],
      };
    }
    return payload;
  }

  public async postViaServerOrDirectGas(
    ctx: SheetTransportContext,
    sheetName: string,
    action: SheetWriteAction,
    payload: any
  ): Promise<void> {
    this.snapshotCache.markSheetMutated(ctx.spreadsheetId, ctx.activeYear, sheetName);
    const preparedPayload = this.normalizeOutgoingPayload(sheetName, action, payload);

    const bearerToken = await this.resolveAuthBearerToken();
    if (bearerToken) {
      const restSlug = SHEET_TO_REST_RESOURCE[sheetName] || sheetName;
      const rawId =
        preparedPayload && typeof preparedPayload === 'object' && !Array.isArray(preparedPayload)
          ? preparedPayload.id || preparedPayload.deletedRow?.id || preparedPayload.updatedRow?.id || ''
          : '';
      const { cleanId } = GoogleDriveSheetService.stripSyntheticRowSuffix(rawId);
      const targetId = encodeURIComponent(String(cleanId || rawId || 'unknown'));

      let endpoint = `/api/v1/${encodeURIComponent(restSlug)}`;
      let method: 'POST' | 'PATCH' | 'DELETE' = 'POST';
      let requestBody: any = preparedPayload;

      if (action === 'CREATE') {
        endpoint = `/api/v1/${encodeURIComponent(restSlug)}`;
        method = 'POST';
        requestBody = preparedPayload;
      } else if (action === 'UPDATE') {
        endpoint = `/api/v1/${encodeURIComponent(restSlug)}/${targetId}`;
        method = 'PATCH';
        requestBody = preparedPayload;
      } else if (action === 'DELETE') {
        endpoint = `/api/v1/${encodeURIComponent(restSlug)}/${targetId}`;
        method = 'DELETE';
        requestBody = preparedPayload;
      } else {
        endpoint = `/api/v1/${encodeURIComponent(restSlug)}/bulk`;
        method = 'POST';
        requestBody = {
          action,
          data: preparedPayload,
        };
      }

      try {
        const { ok, status, data: json } = await safeFetchJson(endpoint, {
          method,
          timeoutMs: 20_000,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${bearerToken}`,
          },
          body: JSON.stringify(requestBody),
        });
        if (ok && json?.success) {
          this.snapshotCache.markSheetMutated(ctx.spreadsheetId, ctx.activeYear, sheetName);
          return;
        }
        if (
          json?.message &&
          status >= 400 &&
          status < 500 &&
          status !== 401 &&
          status !== 403 &&
          status !== 404
        ) {
          throw new Error(json.message);
        }
      } catch (proxyErr: any) {
        if (!isBackendProxyUnavailableError(proxyErr)) {
          throw proxyErr;
        }
      }
    }

    const validation = validateGasDeployUrl(ctx.gasDeployUrl);
    if (!validation.valid) {
      throw new Error(validation.error || 'URL Endpoint Cloud Server tidak valid.');
    }
    const gasUrl = validation.normalizedUrl;
    const rawId =
      preparedPayload && typeof preparedPayload === 'object' && !Array.isArray(preparedPayload)
        ? preparedPayload.id || preparedPayload.deletedRow?.id || preparedPayload.updatedRow?.id || ''
        : '';
    const { cleanId } = GoogleDriveSheetService.stripSyntheticRowSuffix(rawId);

    try {
      const { ok, status, data: json } = await safeFetchJson(gasUrl, {
        method: 'POST',
        timeoutMs: 22_000,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        redirect: 'follow',
        body: JSON.stringify({
          action,
          sheetName,
          year: ctx.activeYear,
          spreadsheetId: ctx.spreadsheetId,
          id: cleanId || rawId,
          sheetRowNumber:
            preparedPayload?._sheetRowNumber ||
            preparedPayload?.deletedRow?._sheetRowNumber ||
            undefined,
          data: preparedPayload,
          timestamp: new Date().toISOString(),
        }),
      });

      if (!ok || json?.error) {
        throw new Error(json?.error || `Cloud Server mengembalikan status ${status}`);
      }
      this.snapshotCache.markSheetMutated(ctx.spreadsheetId, ctx.activeYear, sheetName);
      if (bearerToken) {
        await safeFetchJson(`/api/cache/invalidate?sheet=${encodeURIComponent(sheetName)}`, {
          method: 'POST',
          timeoutMs: 2_500,
          headers: { Authorization: `Bearer ${bearerToken}` },
        }).catch(() => {});
      }
    } catch (err: any) {
      throw new Error(formatGasNetworkError(err, gasUrl));
    }
  }

  public async recalculateRelationsOnServer(
    ctx: SheetTransportContext,
    scope: string = 'all',
    forceRefresh: boolean = true
  ): Promise<{
    handledByServer: boolean;
    summary?: {
      updatedPlacements: number;
      updatedDudi: number;
      updatedGuru: number;
      updatedJurusan: number;
      updatedKelas: number;
      formulasApplied?: boolean;
    };
  }> {
    const bearerToken = await this.resolveAuthBearerToken();
    if (!bearerToken) return { handledByServer: false };

    try {
      const { ok, data: json } = await safeFetchJson('/api/v1/relations/recalculate', {
        method: 'POST',
        timeoutMs: 25_000,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({ scope, forceRefresh }),
      });

      if (ok && json?.success && json?.summary) {
        this.snapshotCache.invalidateClientSheetCache(ctx.spreadsheetId, ctx.activeYear, undefined);
        return { handledByServer: true, summary: json.summary };
      }
      return { handledByServer: false };
    } catch {
      return { handledByServer: false };
    }
  }

  public async triggerMigrateRelationalFormulas(ctx: SheetTransportContext): Promise<{
    success: boolean;
    message: string;
    details?: Record<string, any>;
  }> {
    if (!ctx.spreadsheetId || !ctx.gasDeployUrl || !ctx.isOnline) {
      return {
        success: false,
        message: 'Pastikan Spreadsheet ID dan URL GAS Endpoint aktif sebelum migrasi rumus.',
      };
    }

    const gasUrl = normalizeGasUrl(ctx.gasDeployUrl);
    try {
      const { ok, data: resJson } = await safeFetchJson(gasUrl, {
        method: 'POST',
        timeoutMs: 28_000,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'MIGRATE_RELATIONAL_FORMULAS',
          spreadsheetId: ctx.spreadsheetId,
          year: ctx.activeYear,
        }),
      });

      if (ok && !resJson?.error) {
        this.snapshotCache.invalidateClientSheetCache(ctx.spreadsheetId, ctx.activeYear, undefined);
        const bearerToken = await this.resolveAuthBearerToken();
        if (bearerToken) {
          await safeFetchJson('/api/cache/invalidate', {
            method: 'POST',
            timeoutMs: 2_500,
            headers: { Authorization: `Bearer ${bearerToken}` },
          }).catch(() => {});
        }
        return {
          success: true,
          message: String(resJson?.message || 'Migrasi FK & ARRAYFORMULA relasional berhasil diterapkan.'),
          details: resJson,
        };
      }
      return {
        success: false,
        message: String(resJson?.error || 'Gagal menjalankan migrasi rumus relasional di GAS.'),
      };
    } catch (err: any) {
      return {
        success: false,
        message: formatGasNetworkError(err, gasUrl),
      };
    }
  }
}
