import { getTodayWibIsoDate } from './dateHelpers';

/**
 * Utility helpers for deterministic sequential IDs, document numbers,
 * competence codes, and WhatsApp phone normalization across Pokja Hubin modules.
 */

const JURUSAN_CODE_MAP: Record<string, string> = {
  'desain komunikasi visual': 'DKV',
  'rekayasa perangkat lunak': 'RPL',
  'teknik alat berat': 'TAB',
  'teknik bodi kendaraan ringan': 'TBKR',
  'teknik kendaraan ringan': 'TKR',
  'teknik komputer dan jaringan': 'TKJ',
  'teknik pemesinan': 'TPM',
  'teknik pengelasan': 'TPL',
  'teknik sepeda motor': 'TSM',
};

const PREFIX_BY_SHEET: Record<string, { prefix: string; withYear: boolean }> = {
  Master_Siswa_XI: { prefix: 'SIS', withYear: true },
  Master_Siswa: { prefix: 'SIS', withYear: true },
  Master_Jurusan: { prefix: 'JUR', withYear: false },
  Master_Kelas_Walas: { prefix: 'KLS', withYear: false },
  Master_DUDI: { prefix: 'DUDI', withYear: false },
  Master_Guru_Pendamping: { prefix: 'GRU', withYear: true },
  Data_Pengajuan_PKL: { prefix: 'REQ', withYear: true },
  Data_Perizinan_PKL: { prefix: 'IZN', withYear: true },
  Plotting_Pemberangkatan: { prefix: 'PLT', withYear: true },
  Monitoring_5_Tahap: { prefix: 'MON', withYear: true },
  Nilai_Dan_Sertifikat: { prefix: 'SRT', withYear: true },
};

export function getTodayIsoDate(): string {
  return getTodayWibIsoDate();
}

export function generateJurusanCode(namaJurusan: string): string {
  const cleaned = String(namaJurusan || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!cleaned) return '';
  if (JURUSAN_CODE_MAP[cleaned]) {
    return JURUSAN_CODE_MAP[cleaned];
  }

  const stopWords = new Set(['dan', 'serta', 'di', 'ke', 'yang', 'atau', 'keahlian', 'program']);
  const words = cleaned
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !stopWords.has(w));

  if (words.length === 0) return '';
  if (words.length === 1) {
    return words[0].slice(0, 4).toUpperCase();
  }
  return words
    .map((w) => w[0])
    .join('')
    .slice(0, 5)
    .toUpperCase();
}

export function generateNextSequentialId(
  sheetName: string,
  existingRows: Array<Record<string, any>> = [],
  year: number = new Date().getFullYear()
): string {
  const cfg = PREFIX_BY_SHEET[sheetName] || { prefix: 'REC', withYear: true };
  const basePrefix = cfg.withYear ? `${cfg.prefix}-${year}-` : `${cfg.prefix}-`;
  const escaped = cfg.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = cfg.withYear
    ? new RegExp(`^${escaped}-(?:\\d{4}-)?(\\d+)$`, 'i')
    : new RegExp(`^${escaped}-(\\d+)$`, 'i');

  let maxNum = 0;
  for (const row of existingRows) {
    const candidates = [
      row?.id,
      row?.ID,
      row?.noPengajuan,
      row?.No_Pengajuan,
      row?.noPerizinan,
      row?.ID_Perizinan,
      row?.idPenempatan,
      row?.ID_Penempatan,
    ];
    for (const raw of candidates) {
      const str = String(raw ?? '').split('#r')[0].trim();
      const match = str.match(pattern);
      if (match) {
        const num = Number(match[1]);
        if (Number.isFinite(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }
  }

  const nextNum = Math.max(maxNum, existingRows.length) + 1;
  return `${basePrefix}${String(nextNum).padStart(3, '0')}`;
}

export function generateNextSuratPermohonan(
  existingRows: Array<Record<string, any>> = [],
  year: number = new Date().getFullYear()
): string {
  let maxSeq = 0;
  for (const row of existingRows) {
    const raw = String(row?.noSuratPermohonan ?? row?.No_Surat_Permohonan ?? '').trim();
    const match = raw.match(/421\.5\s*\/\s*(\d+)\s*\//i);
    if (match) {
      const num = Number(match[1]);
      if (Number.isFinite(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  }
  const nextSeq = Math.max(maxSeq, existingRows.length) + 1;
  return `421.5/${String(nextSeq).padStart(3, '0')}/Hubin/SMK.PGRI2/${year}`;
}

export function normalizeWhatsAppNumber(rawPhone: string): string {
  const digits = String(rawPhone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('620')) return `62${digits.slice(3)}`;
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('8')) return `62${digits}`;
  return digits;
}

const PHONE_FIELD_KEYS = new Set([
  'nohpsiswa',
  'noortuwali',
  'kontakwa',
  'kontakwalas',
  'kontakpic',
  'notelpdudi',
  'nowa',
  'telepon',
  'teleponortu',
  'nohp',
  'kontak',
]);

export function isPhoneFieldKey(fieldKey: string): boolean {
  return PHONE_FIELD_KEYS.has(String(fieldKey || '').trim().toLowerCase());
}

export function formatPhoneDisplay(rawPhone: unknown, fallback = '-'): string {
  if (rawPhone === undefined || rawPhone === null) return fallback;
  const trimmed = String(rawPhone).trim();
  if (!trimmed || trimmed === '-') return fallback;

  // Restore leading zero if spreadsheet stripped it from an Indonesian 08xx number
  if (/^8\d{8,13}$/.test(trimmed)) {
    return `0${trimmed}`;
  }
  return trimmed;
}

export function getWhatsAppHref(rawPhone: unknown, message?: string): string | null {
  if (rawPhone === undefined || rawPhone === null) return null;
  const trimmed = String(rawPhone).trim();
  if (!trimmed || trimmed === '-') return null;

  const normalized = normalizeWhatsAppNumber(trimmed);
  if (!normalized || normalized.length < 9 || /^0+$/.test(normalized) || /^620*$/.test(normalized)) {
    return null;
  }

  return message
    ? `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`
    : `https://wa.me/${normalized}`;
}
