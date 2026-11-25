import crypto from 'crypto';
import type { Request, Response } from 'express';
import {
  ALLOWED_ADMIN_SHEETS,
  REST_RESOURCE_TO_SHEET,
} from '../../src/core/constants/sheetResourceMap';
import { PortalConfigError } from '../types';

export const GAS_FETCH_TIMEOUT_MS = 15_000;

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = GAS_FETCH_TIMEOUT_MS
): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new PortalConfigError(
        'GAS_TIMEOUT',
        `Permintaan ke Cloud Server melebihi batas waktu (${Math.round(timeoutMs / 1000)} detik). Silakan coba lagi.`,
        504
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

const RETRYABLE_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);

export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  options: {
    timeoutMs?: number;
    retries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    retryOnTimeout?: boolean;
  } = {}
): Promise<globalThis.Response> {
  const timeoutMs = options.timeoutMs ?? GAS_FETCH_TIMEOUT_MS;
  const retries = Math.max(0, options.retries ?? 2);
  const baseDelayMs = options.baseDelayMs ?? 250;
  const maxDelayMs = options.maxDelayMs ?? 1500;
  const retryOnTimeout = options.retryOnTimeout ?? false;

  let lastError: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, init, timeoutMs);
      if (!RETRYABLE_HTTP_STATUSES.has(res.status) || attempt === retries) {
        return res;
      }
      // Drain body before retrying to free socket
      await res.text().catch(() => '');
    } catch (err: any) {
      lastError = err;
      const isTimeout = err instanceof PortalConfigError && err.code === 'GAS_TIMEOUT';
      if (attempt === retries || (isTimeout && !retryOnTimeout)) {
        throw err;
      }
    }

    const expDelay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
    const jitter = Math.floor(Math.random() * Math.max(120, Math.round(expDelay * 0.6)));
    await new Promise((resolve) => setTimeout(resolve, expDelay + jitter));
  }

  throw lastError;
}

export function setPublicSwrCacheHeaders(
  res: Response,
  fresh: boolean,
  maxAgeSec = 15,
  swrSec = 60
): void {
  if (fresh) {
    res.setHeader('Cache-Control', 'no-store');
    return;
  }
  res.setHeader(
    'Cache-Control',
    `public, max-age=${maxAgeSec}, stale-while-revalidate=${swrSec}`
  );
}

export function handlePortalError(res: Response, err: any) {
  if (err instanceof PortalConfigError) {
    return res.status(err.status).json({
      success: false,
      code: err.code,
      message: err.message,
    });
  }
  return res.status(500).json({
    success: false,
    code: 'INTERNAL_ERROR',
    message: err?.message || 'Terjadi kesalahan pada server saat mengakses Database Cloud Server.',
  });
}

export function resolveRestTableName(resourceParam: string): string | null {
  const raw = String(resourceParam || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (REST_RESOURCE_TO_SHEET[lower]) {
    return REST_RESOURCE_TO_SHEET[lower];
  }
  if (ALLOWED_ADMIN_SHEETS.has(raw)) {
    return raw;
  }
  return null;
}

export function computeWeakEtag(payload: unknown): string {
  const hash = crypto
    .createHash('sha1')
    .update(typeof payload === 'string' ? payload : JSON.stringify(payload))
    .digest('base64url');
  return `W/"${hash}"`;
}

export function isEtagMatched(req: Request, etag: string): boolean {
  const rawIfNoneMatch = String(req.headers['if-none-match'] || '').trim();
  if (!rawIfNoneMatch) return false;
  if (rawIfNoneMatch === '*') return true;
  return rawIfNoneMatch
    .split(',')
    .map((tag) => tag.trim())
    .some((tag) => tag === etag || tag.replace(/^W\//, '') === etag.replace(/^W\//, ''));
}

export function matchRowById(row: Record<string, any>, targetId: string): boolean {
  const candidates = [
    row?.id,
    row?.ID,
    row?.NIS,
    row?.nis,
    row?.Kode,
    row?.kode,
    row?.ID_DUDI,
    row?.idDudi,
    row?.ID_Guru,
    row?.idGuru,
    row?.No_Pengajuan,
    row?.noPengajuan,
    row?.No_Perizinan,
    row?.noPerizinan,
    row?.ID_Penempatan,
    row?.idPenempatan,
    row?.ID_Monitoring,
    row?.idMonitoring,
  ];
  return candidates.some((val) => val !== undefined && val !== null && String(val).trim() === targetId);
}
