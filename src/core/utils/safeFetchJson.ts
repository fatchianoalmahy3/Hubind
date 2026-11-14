export interface SafeFetchResult<T = any> {
  ok: boolean;
  status: number;
  data: T;
}

export class HtmlResponseError extends Error {
  public readonly status: number;
  public readonly isGoogleAuth: boolean;
  public readonly code: string;

  constructor(message: string, status: number, isGoogleAuth = false) {
    super(message);
    this.name = 'HtmlResponseError';
    this.status = status;
    this.isGoogleAuth = isGoogleAuth;
    this.code = isGoogleAuth ? 'GAS_AUTH_REQUIRED' : 'HTML_RESPONSE';
  }
}

/**
 * Automatically prepends https:// when users paste a Google Apps Script URL
 * without a scheme (e.g. "script.google.com/macros/s/.../exec").
 */
export function normalizeGasUrl(rawUrl: string): string {
  const trimmed = String(rawUrl ?? '')
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, '');
  if (!trimmed) return '';

  let url = trimmed;
  if (/^(script\.google\.com|docs\.google\.com|[a-z0-9-]+\.[a-z]{2,}\/)/i.test(url)) {
    url = `https://${url.replace(/^\/+/, '')}`;
  }
  // Strip accidental Google multi-account /u/0/ segment from script.google.com URLs
  url = url.replace(/^(https:\/\/script\.google\.com)\/macros\/u\/\d+\/s\//i, '$1/macros/s/');
  return url;
}

export interface GasUrlValidationResult {
  valid: boolean;
  normalizedUrl: string;
  isWorkspaceUrl: boolean;
  error?: string;
}

/**
 * Validates that a Google Apps Script Web App deployment URL is a public /exec endpoint.
 */
export function validateGasDeployUrl(rawUrl: string): GasUrlValidationResult {
  const normalizedUrl = normalizeGasUrl(rawUrl);
  const isWorkspaceUrl = /script\.google\.com\/a\/macros\//i.test(normalizedUrl);

  if (!normalizedUrl) {
    return {
      valid: false,
      normalizedUrl,
      isWorkspaceUrl,
      error: 'URL Google Apps Script (/exec) belum diisi.',
    };
  }

  if (!/^https?:\/\//i.test(normalizedUrl)) {
    return {
      valid: false,
      normalizedUrl,
      isWorkspaceUrl,
      error: 'URL Google Apps Script tidak valid. Harus diawali https://script.google.com/...',
    };
  }

  if (/script\.google\.com\/home\/projects\//i.test(normalizedUrl) || /\/edit(\?|$|#)/i.test(normalizedUrl)) {
    return {
      valid: false,
      normalizedUrl,
      isWorkspaceUrl,
      error:
        'Link yang Anda tempel adalah link editor Apps Script (/edit), bukan Web App URL. Klik Deploy -> New deployment -> pilih Web app -> salin URL yang berakhiran "/exec".',
    };
  }

  if (/\/dev(\?|$)/i.test(normalizedUrl)) {
    return {
      valid: false,
      normalizedUrl,
      isWorkspaceUrl,
      error:
        'URL masih berakhiran "/dev" (mode uji coba yang wajib login Google dan diblokir CORS). Gunakan URL Web App resmi yang berakhiran "/exec" dengan akses "Siapa saja (Anyone)".',
    };
  }

  if (/script\.google\.com/i.test(normalizedUrl) && !/\/exec(\?|$)/i.test(normalizedUrl)) {
    return {
      valid: false,
      normalizedUrl,
      isWorkspaceUrl,
      error:
        'URL Google Apps Script harus berakhiran "/exec". Salin URL resmi dari menu Deploy -> Kelola deployment (Manage deployments).',
    };
  }

  return {
    valid: true,
    normalizedUrl,
    isWorkspaceUrl,
  };
}

export function isNetworkFetchError(err: unknown): boolean {
  const msg = String((err as any)?.message || err || '').toLowerCase();
  const name = String((err as any)?.name || '');
  return (
    name === 'TypeError' &&
    (msg.includes('failed to fetch') ||
      msg.includes('load failed') ||
      msg.includes('networkerror') ||
      msg.includes('fetch failed') ||
      msg.includes('network request failed'))
  ) || msg === 'failed to fetch' || msg === 'fetch failed';
}

export function formatGasNetworkError(err: unknown, gasUrl?: string): string {
  const validation = gasUrl ? validateGasDeployUrl(gasUrl) : null;
  if (validation && !validation.valid && validation.error) {
    return validation.error;
  }

  if (isNetworkFetchError(err)) {
    const workspaceHint = validation?.isWorkspaceUrl
      ? ' URL Anda memakai domain Google Workspace (/a/macros/...): banyak domain sekolah/instansi memblokir akses publik "Anyone". Jika tetap gagal, deploy skrip melalui akun @gmail.com biasa yang diberi akses Editor ke Spreadsheet.'
      : '';
    return (
      'Browser diblokir (CORS / Redirect Login Google) saat menghubungi Web App GAS ("Failed to fetch"). ' +
      'Pastikan di Apps Script: (1) Deploy -> Kelola deployment -> Edit -> setel "Jalankan sebagai: Saya (Me)" dan "Yang memiliki akses: Siapa saja (Anyone)", ' +
      '(2) Pilih "Versi baru (New version)" setelah edit kode lalu klik Deploy & berikan izin (Authorize), ' +
      '(3) URL berakhiran "/exec" (bukan "/dev").' +
      workspaceHint
    );
  }

  return String((err as any)?.message || 'Gagal menghubungi Google Apps Script Web App.');
}

/**
 * Safely fetches a JSON endpoint and guards against HTML responses (e.g. <!doctype html>
 * from Google Apps Script login redirects, static SPA fallbacks, or 502 proxy pages).
 */
export async function safeFetchJson<T = any>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<SafeFetchResult<T>> {
  const res = await fetch(input, init);
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const rawText = await res.text();
  const trimmed = rawText.trim();

  if (!trimmed) {
    if (!res.ok) {
      throw new Error(`Server mengembalikan respon kosong (HTTP ${res.status}).`);
    }
    return { ok: res.ok, status: res.status, data: {} as T };
  }

  const looksLikeHtml =
    trimmed.startsWith('<') ||
    trimmed.toLowerCase().startsWith('<!doctype') ||
    trimmed.toLowerCase().includes('<html');

  if (looksLikeHtml) {
    const isGoogleAuth =
      trimmed.includes('accounts.google.com') ||
      trimmed.includes('ServiceLogin') ||
      trimmed.includes('v3/signin');

    if (isGoogleAuth) {
      throw new HtmlResponseError(
        'Google Apps Script mengembalikan halaman login Google. Pastikan Web App di-deploy dengan akses "Yang memiliki akses: Siapa saja (Anyone)" dan URL berakhiran "/exec".',
        res.status,
        true
      );
    }

    throw new HtmlResponseError(
      `Server mengembalikan halaman HTML (HTTP ${res.status}), bukan data JSON. Periksa konfigurasi endpoint server atau URL Google Apps Script.`,
      res.status,
      false
    );
  }

  try {
    const parsed = JSON.parse(trimmed) as T;
    return { ok: res.ok, status: res.status, data: parsed };
  } catch {
    const hint = contentType ? ` (${contentType})` : '';
    throw new Error(
      `Respon server bukan JSON yang valid${hint} [HTTP ${res.status}]: ${trimmed.slice(0, 120)}`
    );
  }
}
