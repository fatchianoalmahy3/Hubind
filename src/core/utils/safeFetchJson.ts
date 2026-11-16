export interface SafeFetchResult<T = any> {
  ok: boolean;
  status: number;
  data: T;
  notModified?: boolean;
  etag?: string | null;
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

export class NonJsonResponseError extends Error {
  public readonly status: number;
  public readonly contentType: string;
  public readonly bodySnippet: string;
  public readonly code = 'NON_JSON_RESPONSE';

  constructor(message: string, status: number, contentType = '', bodySnippet = '') {
    super(message);
    this.name = 'NonJsonResponseError';
    this.status = status;
    this.contentType = contentType;
    this.bodySnippet = bodySnippet;
  }
}

export class TimeoutError extends Error {
  public readonly code = 'REQUEST_TIMEOUT';
  public readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number) {
    super(message);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export function isTimeoutError(err: unknown): boolean {
  return (
    err instanceof TimeoutError ||
    (err as any)?.name === 'TimeoutError' ||
    (err as any)?.name === 'AbortError' ||
    (err as any)?.code === 'REQUEST_TIMEOUT'
  );
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
      error: 'URL Endpoint Cloud Server (/exec) belum diisi.',
    };
  }

  if (!/^https?:\/\//i.test(normalizedUrl)) {
    return {
      valid: false,
      normalizedUrl,
      isWorkspaceUrl,
      error: 'URL Endpoint Cloud Server tidak valid. Harus diawali https://...',
    };
  }

  if (/script\.google\.com\/home\/projects\//i.test(normalizedUrl) || /\/edit(\?|$|#)/i.test(normalizedUrl)) {
    return {
      valid: false,
      normalizedUrl,
      isWorkspaceUrl,
      error:
        'Tautan yang Anda tempel adalah tautan editor (/edit), bukan Endpoint Web Service. Salin URL endpoint berakhiran "/exec" dari Konfigurasi Server.',
    };
  }

  if (/\/dev(\?|$)/i.test(normalizedUrl)) {
    return {
      valid: false,
      normalizedUrl,
      isWorkspaceUrl,
      error:
        'URL masih berakhiran "/dev" (mode pengembangan yang memblokir akses publik). Gunakan URL Endpoint Server resmi berakhiran "/exec" dengan akses "Siapa saja (Anyone)".',
    };
  }

  if (/script\.google\.com/i.test(normalizedUrl) && !/\/exec(\?|$)/i.test(normalizedUrl)) {
    return {
      valid: false,
      normalizedUrl,
      isWorkspaceUrl,
      error:
        'URL Endpoint Server harus berakhiran "/exec". Salin URL resmi dari panel deployment Konfigurasi Server.',
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

export function isBackendProxyUnavailableError(err: unknown): boolean {
  return (
    err instanceof HtmlResponseError ||
    err instanceof NonJsonResponseError ||
    isNetworkFetchError(err) ||
    (err as any)?.name === 'HtmlResponseError' ||
    (err as any)?.name === 'NonJsonResponseError'
  );
}

export function formatGasNetworkError(err: unknown, gasUrl?: string): string {
  const validation = gasUrl ? validateGasDeployUrl(gasUrl) : null;
  if (validation && !validation.valid && validation.error) {
    return validation.error;
  }

  if (isNetworkFetchError(err)) {
    const workspaceHint = validation?.isWorkspaceUrl
      ? ' Domain instansi (/a/macros/...) sering memblokir akses publik. Jika tetap gagal, deploy endpoint server memakai akun pengelola dengan akses penuh ke database server.'
      : '';
    return (
      'Browser diblokir (CORS / Redirect Autentikasi) saat menghubungi Cloud Server. ' +
      'Pastikan pada Konfigurasi Server: (1) Akses deployment disetel ke "Siapa saja (Anyone)" dan dijalankan sebagai pengelola, ' +
      '(2) Deploy versi terbaru setelah pembaruan, ' +
      '(3) URL endpoint berakhiran "/exec".' +
      workspaceHint
    );
  }

  return String((err as any)?.message || 'Gagal menghubungi layanan Cloud Server.');
}

export interface SafeFetchInit extends RequestInit {
  timeoutMs?: number;
}

const DEFAULT_FETCH_TIMEOUT_MS = 18_000;

/**
 * Safely fetches a JSON endpoint with strict AbortController timeout and HTML response protection.
 */
export async function safeFetchJson<T = any>(
  input: RequestInfo | URL,
  init?: SafeFetchInit
): Promise<SafeFetchResult<T>> {
  const { timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, signal: externalSignal, ...fetchInit } = init || {};
  const controller = new AbortController();
  let timedOut = false;

  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const timer =
    timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : null;

  let res: Response;
  let rawText: string;
  try {
    res = await fetch(input, { ...fetchInit, signal: controller.signal });
    rawText = await res.text();
  } catch (err: any) {
    if (timedOut || err?.name === 'AbortError') {
      throw new TimeoutError(
        `Koneksi melebihi batas waktu (${Math.round(timeoutMs / 1000)} detik). Cloud Server lambat merespons. Silakan coba lagi.`,
        timeoutMs
      );
    }
    throw err;
  } finally {
    if (timer !== null) clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
  }

  const responseEtag = res.headers.get('etag');

  if (res.status === 304) {
    return {
      ok: true,
      status: 304,
      notModified: true,
      etag: responseEtag,
      data: null as T,
    };
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const trimmed = rawText.trim();

  if (!trimmed) {
    if (!res.ok) {
      throw new NonJsonResponseError(
        `Cloud Server mengembalikan respon kosong (HTTP ${res.status}).`,
        res.status,
        contentType,
        ''
      );
    }
    return { ok: res.ok, status: res.status, etag: responseEtag, data: {} as T };
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
        'Endpoint Cloud Server masih meminta login (akses dibatasi). Pastikan Konfigurasi Server disetel akses "Siapa saja (Anyone)" pada URL "/exec".',
        res.status,
        true
      );
    }

    throw new HtmlResponseError(
      `Cloud Server mengembalikan halaman HTML (HTTP ${res.status}), bukan data JSON. Periksa konfigurasi endpoint server.`,
      res.status,
      false
    );
  }

  try {
    const parsed = JSON.parse(trimmed) as T;
    return { ok: res.ok, status: res.status, etag: responseEtag, data: parsed };
  } catch {
    const hint = contentType ? ` (${contentType})` : '';
    const snippet = trimmed.slice(0, 120);
    throw new NonJsonResponseError(
      `Respon server bukan JSON yang valid${hint} [HTTP ${res.status}]: ${snippet}`,
      res.status,
      contentType,
      snippet
    );
  }
}
