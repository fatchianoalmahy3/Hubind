export function pickField(row: Record<string, any>, ...keys: string[]): string {
  for (const k of keys) {
    const val = row?.[k];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  return '';
}

export function normalizeStr(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}
