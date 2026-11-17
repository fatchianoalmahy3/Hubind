import type { Request, Response } from 'express';
import app from '../server';

export default function handler(req: Request, res: Response) {
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
  return app(req, res);
}
