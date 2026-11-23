import { useEffect } from 'react';

/**
 * Prevents accidental tab closure / page reload while critical
 * Spreadsheet write mutations are still in-flight.
 */
export function useUnloadGuard(
  isLocked: boolean,
  warningText = 'Data sedang disimpan ke Spreadsheet Google Sheets. Mohon tunggu hingga proses selesai sebelum menutup halaman.'
): void {
  useEffect(() => {
    if (!isLocked || typeof window === 'undefined') return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = warningText;
      return warningText;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isLocked, warningText]);
}
