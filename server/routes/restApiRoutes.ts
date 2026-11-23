import type { Express, Request, Response } from 'express';
import {
  ALLOWED_ADMIN_SHEETS,
  DEFAULT_ADMIN_BOOTSTRAP_TABLES,
} from '../../src/core/constants/sheetResourceMap';
import { requireAdminAuth } from '../services/adminAuthService';
import { recalculateAllRelations } from '../services/relationRecalculator';
import {
  fetchBatchSheetsViaGas,
  fetchLiveSheetViaGas,
  writeLiveSheetViaGas,
} from '../services/sheetsTransport';
import type { GasWriteAction } from '../types';
import {
  computeWeakEtag,
  handlePortalError,
  isEtagMatched,
  matchRowById,
  resolveRestTableName,
} from '../utils/httpHelpers';

export function registerRestApiRoutes(app: Express): void {
  // 1. Single-Request Admin Bootstrap (Batch-fetches all master & operational tables in 1 roundtrip)
  app.get('/api/v1/bootstrap', async (req: Request, res: Response) => {
    try {
      const session = await requireAdminAuth(req);
      const fresh = String(req.query.fresh || '') === '1';
      const tablesParam = String(req.query.tables || '').trim();

      const requestedTables = tablesParam
        ? tablesParam
            .split(',')
            .map((t) => resolveRestTableName(t) || t.trim())
            .filter((t) => ALLOWED_ADMIN_SHEETS.has(t))
        : DEFAULT_ADMIN_BOOTSTRAP_TABLES;

      const authorizedTables = requestedTables.filter(
        (t) => t.toLowerCase() !== 'master_akun' || session.role === 'SuperAdmin'
      );

      const optionalSet = new Set(authorizedTables);
      const { sheets, config } = await fetchBatchSheetsViaGas(authorizedTables, optionalSet, fresh);

      const etags: Record<string, string> = {};
      for (const table of authorizedTables) {
        etags[table] = computeWeakEtag({
          s: config.spreadsheetId,
          y: config.activeYear,
          t: table,
          d: sheets[table] || [],
        });
      }
      const bundleEtag = computeWeakEtag({ s: config.spreadsheetId, y: config.activeYear, etags });

      res.setHeader('ETag', bundleEtag);
      if (!fresh && isEtagMatched(req, bundleEtag)) {
        return res.status(304).end();
      }

      return res.json({
        success: true,
        spreadsheetId: config.spreadsheetId,
        activeYear: config.activeYear,
        etag: bundleEtag,
        etags,
        tables: sheets,
      });
    } catch (err: any) {
      handlePortalError(res, err);
    }
  });

  // 2. Server-Side Relation Recalculation (Eliminates client-side N+1 sync waterfalls)
  app.post('/api/v1/relations/recalculate', async (req: Request, res: Response) => {
    try {
      await requireAdminAuth(req);
      const scope = String(req.body?.scope || 'all');
      const forceRefresh = Boolean(req.body?.forceRefresh);
      const summary = await recalculateAllRelations(scope, forceRefresh);
      return res.json({ success: true, summary });
    } catch (err: any) {
      handlePortalError(res, err);
    }
  });

  // 3. REST Collection Read: GET /api/v1/:resource (?page=&limit=&q=&sort=&order=&fresh=1)
  app.get('/api/v1/:resource', async (req: Request, res: Response) => {
    try {
      const session = await requireAdminAuth(req);
      const tableName = resolveRestTableName(req.params.resource);
      if (!tableName) {
        return res.status(404).json({
          success: false,
          message: `Resource [${req.params.resource}] tidak ditemukan.`,
        });
      }
      if (tableName.toLowerCase() === 'master_akun' && session.role !== 'SuperAdmin') {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN',
          message: 'Akses resource akun hanya diperbolehkan untuk peran SuperAdmin.',
        });
      }

      const fresh = String(req.query.fresh || '') === '1';
      const { rows, config } = await fetchLiveSheetViaGas(tableName, fresh);

      let filtered = rows;
      const q = String(req.query.q || '').trim().toLowerCase();
      if (q) {
        filtered = filtered.filter((row) =>
          Object.values(row || {}).some(
            (v) => v !== null && v !== undefined && String(v).toLowerCase().includes(q)
          )
        );
      }

      const sortCol = String(req.query.sort || '').trim();
      const sortDir = String(req.query.order || 'asc').toLowerCase() === 'desc' ? -1 : 1;
      if (sortCol) {
        filtered = [...filtered].sort((a, b) => {
          const va = a?.[sortCol];
          const vb = b?.[sortCol];
          if (va === vb) return 0;
          if (va === null || va === undefined) return 1;
          if (vb === null || vb === undefined) return -1;
          if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sortDir;
          return String(va).localeCompare(String(vb), undefined, { numeric: true }) * sortDir;
        });
      }

      const total = filtered.length;
      const page = Number(req.query.page || 0);
      const limit = Number(req.query.limit || 0);
      const isPaginated = page > 0 && limit > 0;
      const slicedData = isPaginated ? filtered.slice((page - 1) * limit, page * limit) : filtered;

      const fieldsParam = String(req.query.fields || '').trim();
      const requestedFields = fieldsParam
        ? Array.from(
            new Set([
              'id',
              '_sheetRowNumber',
              ...fieldsParam
                .split(',')
                .map((f) => f.trim())
                .filter(Boolean),
            ])
          )
        : null;

      const resultData = requestedFields
        ? slicedData.map((row) => {
            if (!row || typeof row !== 'object') return row;
            const projected: Record<string, any> = {};
            for (const key of requestedFields) {
              if (key in row) {
                projected[key] = row[key];
              }
            }
            return projected;
          })
        : slicedData;

      const etag = computeWeakEtag({
        s: config.spreadsheetId,
        y: config.activeYear,
        t: tableName,
        q,
        sortCol,
        sortDir,
        page,
        limit,
        fields: fieldsParam,
        data: resultData,
      });

      res.setHeader('ETag', etag);
      if (!fresh && isEtagMatched(req, etag)) {
        return res.status(304).end();
      }

      return res.json({
        success: true,
        resource: req.params.resource,
        tableName,
        spreadsheetId: config.spreadsheetId,
        etag,
        data: resultData,
        meta: {
          total,
          page: isPaginated ? page : 1,
          limit: isPaginated ? limit : total,
          totalPages: isPaginated ? Math.max(1, Math.ceil(total / limit)) : 1,
        },
      });
    } catch (err: any) {
      handlePortalError(res, err);
    }
  });

  // 4. REST Single Item Read: GET /api/v1/:resource/:id
  app.get('/api/v1/:resource/:id', async (req: Request, res: Response) => {
    try {
      const session = await requireAdminAuth(req);
      const tableName = resolveRestTableName(req.params.resource);
      if (!tableName) {
        return res.status(404).json({
          success: false,
          message: `Resource [${req.params.resource}] tidak ditemukan.`,
        });
      }
      if (tableName.toLowerCase() === 'master_akun' && session.role !== 'SuperAdmin') {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN',
          message: 'Akses resource akun hanya diperbolehkan untuk peran SuperAdmin.',
        });
      }

      const { rows, config } = await fetchLiveSheetViaGas(tableName, false);
      const item = rows.find((r) => matchRowById(r, String(req.params.id || '').trim()));
      if (!item) {
        return res.status(404).json({
          success: false,
          message: `Data dengan ID [${req.params.id}] tidak ditemukan.`,
        });
      }

      const etag = computeWeakEtag({ s: config.spreadsheetId, t: tableName, item });
      res.setHeader('ETag', etag);
      if (isEtagMatched(req, etag)) {
        return res.status(304).end();
      }

      return res.json({
        success: true,
        resource: req.params.resource,
        tableName,
        data: item,
      });
    } catch (err: any) {
      handlePortalError(res, err);
    }
  });

  // 5. REST Create: POST /api/v1/:resource
  app.post('/api/v1/:resource', async (req: Request, res: Response) => {
    try {
      const session = await requireAdminAuth(req);
      const tableName = resolveRestTableName(req.params.resource);
      if (!tableName) {
        return res.status(404).json({
          success: false,
          message: `Resource [${req.params.resource}] tidak ditemukan.`,
        });
      }
      if (tableName.toLowerCase() === 'master_akun' && session.role !== 'SuperAdmin') {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN',
          message: 'Hanya SuperAdmin yang berhak menambah akun.',
        });
      }

      const payload = req.body && typeof req.body === 'object' ? req.body : {};
      await writeLiveSheetViaGas(tableName, 'CREATE', payload);
      return res.status(201).json({
        success: true,
        resource: req.params.resource,
        tableName,
        data: payload,
      });
    } catch (err: any) {
      handlePortalError(res, err);
    }
  });

  // 6. REST Bulk Mutation: POST /api/v1/:resource/bulk
  app.post('/api/v1/:resource/bulk', async (req: Request, res: Response) => {
    try {
      const session = await requireAdminAuth(req);
      const tableName = resolveRestTableName(req.params.resource);
      if (!tableName) {
        return res.status(404).json({
          success: false,
          message: `Resource [${req.params.resource}] tidak ditemukan.`,
        });
      }
      const { action, data } = req.body || {};
      const normalizedAction = String(action || '').toUpperCase();
      const allowedBulk = new Set(['BULK_DELETE', 'BULK_UPDATE', 'IMPORT', 'SYNC_ALL']);

      if (!allowedBulk.has(normalizedAction)) {
        return res.status(400).json({ success: false, message: 'Aksi bulk tidak valid.' });
      }
      if (tableName.toLowerCase() === 'master_akun' && session.role !== 'SuperAdmin') {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN',
          message: 'Hanya SuperAdmin yang berhak mengubah data akun.',
        });
      }
      if (normalizedAction === 'SYNC_ALL' && session.role !== 'SuperAdmin' && session.role !== 'Hubin') {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN',
          message: 'Operasi sinkronisasi penuh (SYNC_ALL) hanya diperbolehkan untuk SuperAdmin atau Admin Hubin.',
        });
      }

      await writeLiveSheetViaGas(tableName, normalizedAction as GasWriteAction, data);
      return res.json({
        success: true,
        resource: req.params.resource,
        tableName,
        action: normalizedAction,
      });
    } catch (err: any) {
      handlePortalError(res, err);
    }
  });

  // 7. REST Update: PUT & PATCH /api/v1/:resource/:id
  const handleRestUpdate = async (req: Request, res: Response) => {
    try {
      const session = await requireAdminAuth(req);
      const tableName = resolveRestTableName(req.params.resource);
      if (!tableName) {
        return res.status(404).json({
          success: false,
          message: `Resource [${req.params.resource}] tidak ditemukan.`,
        });
      }
      if (tableName.toLowerCase() === 'master_akun' && session.role !== 'SuperAdmin') {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN',
          message: 'Hanya SuperAdmin yang berhak mengubah data akun.',
        });
      }

      const id = String(req.params.id || '').trim();
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const payload = { ...body, id: body.id || id };
      await writeLiveSheetViaGas(tableName, 'UPDATE', payload);
      return res.json({
        success: true,
        resource: req.params.resource,
        tableName,
        id,
        data: payload,
      });
    } catch (err: any) {
      handlePortalError(res, err);
    }
  };
  app.put('/api/v1/:resource/:id', handleRestUpdate);
  app.patch('/api/v1/:resource/:id', handleRestUpdate);

  // 8. REST Delete: DELETE /api/v1/:resource/:id
  app.delete('/api/v1/:resource/:id', async (req: Request, res: Response) => {
    try {
      const session = await requireAdminAuth(req);
      const tableName = resolveRestTableName(req.params.resource);
      if (!tableName) {
        return res.status(404).json({
          success: false,
          message: `Resource [${req.params.resource}] tidak ditemukan.`,
        });
      }
      if (tableName.toLowerCase() === 'master_akun' && session.role !== 'SuperAdmin') {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN',
          message: 'Hanya SuperAdmin yang berhak menghapus data akun.',
        });
      }

      const id = String(req.params.id || '').trim();
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      await writeLiveSheetViaGas(tableName, 'DELETE', {
        id,
        rawId: body.rawId || id,
        deletedRow: body.deletedRow,
      });
      return res.json({
        success: true,
        resource: req.params.resource,
        tableName,
        id,
      });
    } catch (err: any) {
      handlePortalError(res, err);
    }
  });
}
