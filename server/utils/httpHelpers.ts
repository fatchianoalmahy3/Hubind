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
