const INDONESIAN_MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const;

const INDONESIAN_MONTH_MAP: Record<string, number> = {
  januari: 1,
  jan: 1,
  februari: 2,
  feb: 2,
  pebruari: 2,
  maret: 3,
  mar: 3,
  april: 4,
  apr: 4,
  mei: 5,
  may: 5,
  juni: 6,
  jun: 6,
  juli: 7,
  jul: 7,
  agustus: 8,
  agu: 8,
  agt: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  oktober: 10,
  okt: 10,
  oct: 10,
  november: 11,
  nov: 11,
  desember: 12,
  des: 12,
  dec: 12,
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isValidYmd(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/**
 * Formats a Date object in Asia/Jakarta (WIB) calendar parts.
 */
export function getWibCalendarParts(date: Date = new Date()): {
  year: number;
  month: number;
  day: number;
  hour: string;
  minute: string;
  second: string;
} {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value || '00';
  return {
    year: Number(pick('year')),
    month: Number(pick('month')),
    day: Number(pick('day')),
    hour: pick('hour'),
    minute: pick('minute'),
    second: pick('second'),
  };
}

/**
 * Returns today's date in Asia/Jakarta (WIB) formatted as YYYY-MM-DD.
 */
export function getTodayWibIsoDate(): string {
  const p = getWibCalendarParts(new Date());
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/**
 * Returns today's timestamp in Asia/Jakarta (WIB) formatted as YYYY-MM-DD HH:mm:ss.
 */
export function getTodayWibDateTime(): string {
  const p = getWibCalendarParts(new Date());
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)} ${p.hour}:${p.minute}:${p.second}`;
}

/**
 * Adds/subtracts days from today (or from an ISO YYYY-MM-DD base date) cleanly without UTC drift.
 */
export function getOffsetWibIsoDate(days: number, baseDateInput?: unknown): string {
  const normalizedBase = baseDateInput ? normalizeToIsoDate(baseDateInput) : '';
  const baseIso = normalizedBase || getTodayWibIsoDate();
  const [y, m, d] = baseIso.split('-').map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d + days));
  return `${utcDate.getUTCFullYear()}-${pad2(utcDate.getUTCMonth() + 1)}-${pad2(utcDate.getUTCDate())}`;
}

/**
 * Detects whether a raw value is a pure ISO UTC timestamp string (e.g. 2026-11-16T00:00:00.000Z).
 */
export function isIsoTimestampString(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/i.test(
    val.trim()
  );
}

/**
 * Normalizes any supported date input (YYYY-MM-DD, ISO 8601 UTC timestamp, DD/MM/YYYY,
 * DD-MM-YYYY, "16 November 2026", Date instance, or Excel serial number) into canonical YYYY-MM-DD.
 * Returns '' if not parseable as a date.
 */
export function normalizeToIsoDate(val: unknown): string {
  if (val === undefined || val === null) return '';

  if (val instanceof Date) {
    if (Number.isNaN(val.getTime())) return '';
    const p = getWibCalendarParts(val);
    return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
  }

  if (typeof val === 'number' && Number.isFinite(val)) {
    // Support Excel serial date numbers (e.g. 46342 -> 2026-11-16)
    if (val > 20000 && val < 90000) {
      const utcMs = Date.UTC(1899, 11, 30) + Math.round(val) * 86400000;
      const d = new Date(utcMs);
      return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
    }
    return '';
  }

  const raw = String(val).trim();
  if (!raw || raw === '-' || raw.toLowerCase() === 'invalid date') return '';

  // 1. Canonical YYYY-MM-DD (optionally followed by space + HH:mm:ss)
  const ymdMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/);
  if (ymdMatch) {
    const y = Number(ymdMatch[1]);
    const m = Number(ymdMatch[2]);
    const d = Number(ymdMatch[3]);
    if (isValidYmd(y, m, d)) {
      return `${y}-${pad2(m)}-${pad2(d)}`;
    }
  }

  // 2. ISO timestamp (e.g., 2026-11-16T00:00:00.000Z or 2026-11-15T17:00:00.000Z from Google Sheets)
  if (isIsoTimestampString(raw)) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      const p = getWibCalendarParts(parsed);
      return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
    }
  }

  // 3. DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const d = Number(dmyMatch[1]);
    const m = Number(dmyMatch[2]);
    const y = Number(dmyMatch[3]);
    if (isValidYmd(y, m, d)) {
      return `${y}-${pad2(m)}-${pad2(d)}`;
    }
  }

  // 4. Indonesian text format: "16 November 2026" or "16 Nov 2026"
  const idTextMatch = raw.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (idTextMatch) {
    const d = Number(idTextMatch[1]);
    const m = INDONESIAN_MONTH_MAP[idTextMatch[2].toLowerCase()];
    const y = Number(idTextMatch[3]);
    if (m && isValidYmd(y, m, d)) {
      return `${y}-${pad2(m)}-${pad2(d)}`;
    }
  }

  // 5. Fallback parse (non-ambiguous date strings)
  const numericOnly = /^\d+$/.test(raw);
  if (numericOnly) {
    const num = Number(raw);
    if (num > 20000 && num < 90000) {
      return normalizeToIsoDate(num);
    }
    return '';
  }

  return '';
}

/**
 * Formats any supported date input into official Indonesian format:
 * e.g. "16 November 2026"
 */
export function formatIndonesianDate(val: unknown, fallback = '-'): string {
  if (val === undefined || val === null) return fallback;
  const raw = String(val).trim();
  if (!raw || raw === '-') return fallback;

  const iso = normalizeToIsoDate(val);
  if (!iso) return raw;

  const [yStr, mStr, dStr] = iso.split('-');
  const monthIdx = Number(mStr) - 1;
  const dayNum = Number(dStr);
  const monthName = INDONESIAN_MONTHS[monthIdx];
  if (!monthName || !dayNum || !yStr) return raw;

  return `${dayNum} ${monthName} ${yStr}`;
}

/**
 * Formats a start..end date pair into official Indonesian range text:
 * e.g. "10 November 2026 s/d 5 Maret 2027"
 */
export function formatIndonesianDateRange(
  startVal: unknown,
  endVal: unknown,
  separator = ' s/d ',
  fallback = '-'
): string {
  const startFormatted = formatIndonesianDate(startVal, '');
  const endFormatted = formatIndonesianDate(endVal, '');
  if (startFormatted && endFormatted) {
    return `${startFormatted}${separator}${endFormatted}`;
  }
  return startFormatted || endFormatted || fallback;
}
