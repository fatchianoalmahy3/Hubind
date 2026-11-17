import app from './_server.mjs';

export default function handler(req, res) {
  try {
    const rawUrl = req.url || '/api';
    const parsed = new URL(rawUrl, 'http://localhost');
    const vercelPath = parsed.searchParams.get('__vercel_path');

    if (vercelPath !== null) {
      parsed.searchParams.delete('__vercel_path');
      const cleanPath = vercelPath.replace(/^\/+/, '');
      const qs = parsed.searchParams.toString();
      req.url = cleanPath ? `/api/${cleanPath}${qs ? `?${qs}` : ''}` : `/api${qs ? `?${qs}` : ''}`;
    } else if (!rawUrl.startsWith('/api')) {
      req.url = `/api${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
    }
  } catch {
    if (req.url && !req.url.startsWith('/api')) {
      req.url = `/api${req.url.startsWith('/') ? '' : '/'}${req.url}`;
    }
  }

  try {
    return app(req, res);
  } catch (err) {
    console.error('[Vercel API Handler Error]', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          success: false,
          code: 'SERVERLESS_HANDLER_ERROR',
          message: err?.message || 'Gagal memproses permintaan API di server.',
        })
      );
    }
  }
}
