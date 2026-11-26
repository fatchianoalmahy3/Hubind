import express, { type Request, type Response } from 'express';
import path from 'path';
import {
  __dirnameResolved,
  firebaseCfg,
  isServerlessRuntime,
} from './server/config/runtimeConfig';
import { registerAdminRoutes } from './server/routes/adminRoutes';
import { registerRestApiRoutes } from './server/routes/restApiRoutes';
import { registerPublicPortalRoutes } from './server/routes/publicPortalRoutes';
import { registerDocumentRoutes } from './server/routes/documentRoutes';
import { sanitizeServerErrorMessage } from './server/utils/httpHelpers';

export type { WorkspaceConfig } from './server/types';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const jsonParser = express.json({ limit: '6mb' });
app.use((req, res, next) => {
  // Vercel @vercel/node may pre-parse req.body and drain the request stream before handing off to Express
  if (isServerlessRuntime && req.body !== undefined) {
    if (typeof req.body === 'string') {
      try {
        req.body = req.body.trim() ? JSON.parse(req.body) : {};
      } catch {
        // leave as-is if not JSON
      }
    }
    if (typeof req.body === 'object' && req.body !== null) {
      (req as any)._body = true;
      return next();
    }
  }
  return jsonParser(req, res, next);
});

const PUBLIC_EDGE_CACHEABLE_PATHS = new Set([
  '/public/config-summary',
  '/public/dudi-list',
  '/public/petugas-list',
]);

app.use('/api', (req, res, next) => {
  const isFreshBypass = String(req.query?.fresh || '') === '1';
  if (req.method === 'GET' && !isFreshBypass && PUBLIC_EDGE_CACHEABLE_PATHS.has(req.path)) {
    // Public non-PII directories: allow Vercel Edge CDN fast serve + background SWR
    res.setHeader('Cache-Control', 'public, max-age=15, s-maxage=30, stale-while-revalidate=300');
    res.setHeader('Vary', 'Accept-Encoding');
  } else if ((req.path.startsWith('/v1') || req.path.startsWith('/public')) && req.method === 'GET' && !isFreshBypass) {
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    res.setHeader('Vary', 'Authorization, Accept-Encoding');
  } else {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// Register modular domain route handlers
registerAdminRoutes(app);
registerRestApiRoutes(app);
registerPublicPortalRoutes(app);
registerDocumentRoutes(app);

// Health check & structured JSON 404 for unmatched /api/* routes
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    success: true,
    status: 'ok',
    runtime: isServerlessRuntime ? 'vercel-serverless' : 'node-server',
    firestoreConfigured: Boolean(firebaseCfg.projectId),
    timestamp: new Date().toISOString(),
  });
});

app.use('/api', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    code: 'API_ROUTE_NOT_FOUND',
    message: `Endpoint API [${req.method} ${req.originalUrl || req.url}] tidak ditemukan.`,
  });
});

app.use((err: any, _req: Request, res: Response, _next: express.NextFunction) => {
  console.error('[Express Unhandled Error]', err);
  if (res.headersSent) return;
  res.status(err?.status || 500).json({
    success: false,
    code: err?.code || 'INTERNAL_SERVER_ERROR',
    message: sanitizeServerErrorMessage(err?.message || 'Terjadi kesalahan internal pada server.'),
  });
});

// Serve frontend with Vite dev middleware when running as standalone Node server (not on Vercel Serverless)
async function startServer() {
  if (process.env.NODE_ENV !== 'production' && !isServerlessRuntime) {
    const vitePkg = 'vite';
    const { createServer: createViteServer } = await import(/* @vite-ignore */ vitePkg);
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirnameResolved, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirnameResolved, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SI-HUBIN Server running at http://0.0.0.0:${PORT}`);
  });
}

if (!isServerlessRuntime) {
  startServer();
}

export default app;
