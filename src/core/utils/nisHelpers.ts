import type React from 'react';

/**
 * Strips all non-digit characters from an NIS input or legacy value (e.g. "23241/678/901" -> "23241678901").
 */
export function stripNisSymbols(val: unknown): string {
  if (val === undefined || val === null) return '';
  const str = String(val).trim();
  if (!str || str === '-') return '';
  return str.replace(/\D/g, '');
}

/**
 * Sanitizes interactive NIS input to pure digits with an optional max length (default 12 digits: 5 + 4 + 3).
 */
export function sanitizeNisInput(val: unknown, maxDigits = 12): string {
  return stripNisSymbols(val).slice(0, maxDigits);
}

/**
 * Formats a raw/numeric NIS into official visual slash notation:
 * - 11 digits (5 + 3 + 3): XXXXX/XXX/XXX
 * - 12 digits (5 + 4 + 3): XXXXX/XXXX/XXX
 * - Progressive typing:
 *   - 1..5 digits: XXXXX
 *   - 6..8 digits: XXXXX/XXX
 *   - 9..11 digits: XXXXX/XXX/XXX
 *   - 12 digits: XXXXX/XXXX/XXX
 */
export function formatNisVisual(val: unknown, fallback = '-'): string {
  if (val === undefined || val === null) return fallback;
  const raw = String(val).trim();
  if (!raw || raw === '-') return fallback;

  const digits = stripNisSymbols(raw);
  if (!digits) return raw;

  if (digits.length <= 5) {
    return digits;
  }
  if (digits.length <= 8) {
    return `${digits.slice(0, 5)}/${digits.slice(5)}`;
  }
  if (digits.length <= 11) {
    return `${digits.slice(0, 5)}/${digits.slice(5, 8)}/${digits.slice(8)}`;
  }
  const capped = digits.slice(0, 12);
  return `${capped.slice(0, 5)}/${capped.slice(5, 9)}/${capped.slice(9, 12)}`;
}

/**
 * Formats NIS numbers embedded inside group strings such as:
 * "11 AHMAD FAUZI (23241678901)" -> "11 AHMAD FAUZI (23241/678/901)"
 */
export function formatNisInsideText(val: unknown, fallback = '-'): string {
  if (val === undefined || val === null) return fallback;
  const raw = String(val).trim();
  if (!raw || raw === '-') return fallback;

  return raw.replace(/\(([\d./\-\s]{7,20})\)/g, (full, inner) => {
    const digits = stripNisSymbols(inner);
    if (digits.length >= 8 && digits.length <= 12) {
      return `(${formatNisVisual(digits)})`;
    }
    return full;
  });
}

/**
 * Computes caret index in a visually formatted NIS string corresponding to N digits before the caret.
 */
export function computeNisCaretPosition(digitsBeforeCaret: number, formattedValue: string): number {
  if (digitsBeforeCaret <= 0) return 0;
  let seenDigits = 0;
  for (let i = 0; i < formattedValue.length; i++) {
    if (/\d/.test(formattedValue[i])) {
      seenDigits++;
      if (seenDigits === digitsBeforeCaret) {
        return i + 1;
      }
    }
  }
  return formattedValue.length;
}

/**
 * Keyboard guard for NIS inputs:
 * - Blocks non-numeric characters while allowing navigation/clipboard shortcuts
 * - Allows Backspace right after a visual '/' separator to delete the digit before the slash smoothly
 */
export function handleNisKeyDown(
  e: React.KeyboardEvent<HTMLInputElement>,
  currentDigits: string,
  onDigitsChange: (nextDigits: string, nextCaretPos?: number) => void
): void {
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  const allowedKeys = [
    'Backspace',
    'Delete',
    'Tab',
    'Escape',
    'Enter',
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'ArrowDown',
    'Home',
    'End',
  ];

  const inputEl = e.currentTarget;
  if (
    e.key === 'Backspace' &&
    inputEl.selectionStart !== null &&
    inputEl.selectionStart === inputEl.selectionEnd &&
    inputEl.selectionStart > 0 &&
    inputEl.value[inputEl.selectionStart - 1] === '/'
  ) {
    e.preventDefault();
    const digitsBeforeSlash = stripNisSymbols(
      inputEl.value.slice(0, inputEl.selectionStart)
    ).length;
    if (digitsBeforeSlash > 0) {
      const nextDigits =
        currentDigits.slice(0, digitsBeforeSlash - 1) + currentDigits.slice(digitsBeforeSlash);
      const nextFormatted = formatNisVisual(nextDigits, '');
      const nextPos = computeNisCaretPosition(digitsBeforeSlash - 1, nextFormatted);
      onDigitsChange(nextDigits, nextPos);
    }
    return;
  }

  if (allowedKeys.includes(e.key)) return;
  if (/^\d$/.test(e.key)) return;

  e.preventDefault();
}

/**
 * Processes an onChange event for a visually masked NIS input, returning clean digits and restoring caret.
 */
export function processNisInputChange(
  e: React.ChangeEvent<HTMLInputElement>,
  onDigitsChange: (nextDigits: string) => void,
  maxDigits = 12
): void {
  const inputEl = e.currentTarget;
  const rawValue = inputEl.value;
  const selStart = inputEl.selectionStart ?? rawValue.length;
  const digitsBeforeCaret = stripNisSymbols(rawValue.slice(0, selStart)).length;
  const nextDigits = sanitizeNisInput(rawValue, maxDigits);
  const nextFormatted = formatNisVisual(nextDigits, '');
  const nextPos = computeNisCaretPosition(
    Math.min(digitsBeforeCaret, nextDigits.length),
    nextFormatted
  );

  onDigitsChange(nextDigits);

  requestAnimationFrame(() => {
    try {
      inputEl.setSelectionRange(nextPos, nextPos);
    } catch {
      // Ignore if input is no longer mounted or doesn't support selectionRange
    }
  });
}
