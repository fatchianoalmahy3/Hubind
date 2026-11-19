/**
 * Strict validator & normalizer for Google Maps location links submitted by students or admin.
 * Rejects plain text, invalid URLs, or non-Google-Maps domains.
 */
export interface GoogleMapsValidationResult {
  valid: boolean;
  normalizedUrl: string;
  error?: string;
}

const GOOGLE_MAPS_SHORT_HOSTS = new Set(['maps.app.goo.gl']);

const GOOGLE_DOMAIN_REGEX = /^(www\.|maps\.)?google\.(com|co\.id|co\.uk|com\.sg|com\.my)$/i;

export function validateGoogleMapsUrl(rawInput: unknown): GoogleMapsValidationResult {
  const raw = String(rawInput ?? '').trim();
  if (!raw) {
    return {
      valid: false,
      normalizedUrl: '',
      error: 'Link Google Maps tempat PKL wajib diisi.',
    };
  }

  // Disallow whitespace inside URL
  if (/\s/.test(raw)) {
    return {
      valid: false,
      normalizedUrl: '',
      error: 'Link Google Maps tidak boleh mengandung spasi. Salin tautan utuh dari fitur Share/Bagikan Google Maps.',
    };
  }

  // Require explicit http(s):// or allow bare known Google Maps domains and upgrade to https://
  let candidate = raw;
  if (!/^https?:\/\//i.test(candidate)) {
    if (/^(maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.|(www\.)?google\.[a-z.]+\/maps)/i.test(candidate)) {
      candidate = `https://${candidate}`;
    } else {
      return {
        valid: false,
        normalizedUrl: '',
        error: 'Format tautan tidak valid. Harus berupa link Google Maps diawali https:// (misal https://maps.app.goo.gl/... atau https://www.google.com/maps/...).',
      };
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return {
      valid: false,
      normalizedUrl: '',
      error: 'Link Google Maps tidak valid. Pastikan URL disalin lengkap dari aplikasi Google Maps.',
    };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return {
      valid: false,
      normalizedUrl: '',
      error: 'Link Google Maps harus menggunakan protokol https://.',
    };
  }

  // Upgrade http -> https cleanly
  parsed.protocol = 'https:';
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname || '/';

  // 1. Short share links: https://maps.app.goo.gl/xxxxx
  if (GOOGLE_MAPS_SHORT_HOSTS.has(host)) {
    if (path.length < 4 || path === '/') {
      return {
        valid: false,
        normalizedUrl: '',
        error: 'Link pendek maps.app.goo.gl belum lengkap. Gunakan tombol Share -> Copy Link di Google Maps.',
      };
    }
    return { valid: true, normalizedUrl: parsed.toString() };
  }

  // 2. Legacy short links: https://goo.gl/maps/xxxxx
  if (host === 'goo.gl') {
    if (!/^\/maps\/[A-Za-z0-9_-]{3,}/i.test(path)) {
      return {
        valid: false,
        normalizedUrl: '',
        error: 'Tautan goo.gl harus mengarah ke /maps/... (bukan link singkat umum).',
      };
    }
    return { valid: true, normalizedUrl: parsed.toString() };
  }

  // 3. Full Google Maps domains: google.com/maps/..., maps.google.com/?q=..., google.co.id/maps/...
  if (GOOGLE_DOMAIN_REGEX.test(host)) {
    const isMapsSubdomain = host.startsWith('maps.');
    const hasMapsPath = /^\/maps(\/|$)/i.test(path);
    const hasCoordinateOrQuery =
      parsed.searchParams.has('q') ||
      parsed.searchParams.has('ll') ||
      parsed.searchParams.has('cid') ||
      parsed.searchParams.has('ftid') ||
      parsed.searchParams.has('query') ||
      parsed.searchParams.has('destination');

    if (hasMapsPath || (isMapsSubdomain && (hasCoordinateOrQuery || path.length > 1))) {
      return { valid: true, normalizedUrl: parsed.toString() };
    }

    return {
      valid: false,
      normalizedUrl: '',
      error: 'Link Google harus mengarah langsung ke lokasi Google Maps (/maps/place/... atau koordinat peta).',
    };
  }

  return {
    valid: false,
    normalizedUrl: '',
    error: 'Tautan ditolak karena bukan link Google Maps resmi (gunakan https://maps.app.goo.gl/... atau https://www.google.com/maps/...).',
  };
}
