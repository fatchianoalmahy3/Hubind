import { stripNisSymbols } from './nisHelpers';

export function normalizeRelationText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Status penempatan yang menandakan siswa SUDAH TIDAK menempati slot aktif di DUDI tersebut.
 * - 'Selesai PKL' : durasi PKL tuntas / purnatugas
 * - 'Pindah DUDI' : siswa pindah ke DUDI lain karena kendala/rotasi
 * - 'Dibatalkan' / 'Batal' : penempatan batal
 */
export const CLOSED_PLACEMENT_STATUSES = new Set<string>([
  'selesai pkl',
  'pindah dudi',
  'dibatalkan',
  'batal',
]);

/**
 * Apakah baris penempatan masih berstatus AKTIF ('Terjadwal' / 'Sedang Berjalan')?
 * Digunakan untuk:
 * 1) Pembatasan maksimal 1 penempatan aktif per NIS
 * 2) Perhitungan kuota terisi DUDI & jumlah bimbingan aktif guru
 */
export function isActivePlacementStatus(status: unknown): boolean {
  const norm = normalizeRelationText(status);
  if (!norm) return true;
  return !CLOSED_PLACEMENT_STATUSES.has(norm);
}

/**
 * Apakah baris penempatan dikeluarkan dari daftar cetak aktif DUDI (Monitoring, Pengantaran, Penarikan, Portal Guru)?
 * Catatan: 'Selesai PKL' tetap dapat dicetak pada riwayat Penarikan/Arsip DUDI,
 * sedangkan 'Dibatalkan' dan 'Pindah DUDI' dikeluarkan dari DUDI lama.
 */
export function isExcludedFromDudiListStatus(status: unknown): boolean {
  const norm = normalizeRelationText(status);
  return norm === 'dibatalkan' || norm === 'batal' || norm === 'pindah dudi';
}

export function getCanonicalNisDigits(nis: unknown): string {
  const digits = stripNisSymbols(nis);
  if (digits) return digits;
  const raw = String(nis ?? '').trim();
  return raw && raw !== '-' ? raw : '';
}
