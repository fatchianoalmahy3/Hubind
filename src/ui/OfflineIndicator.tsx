import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="assertive"
      className="fixed bottom-4 left-4 right-4 sm:right-auto z-[90] flex items-center gap-2.5 rounded-xl bg-rose-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-xl border border-rose-400"
    >
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>
        Koneksi Terputus — Pengiriman diblokir sampai internet aktif agar data pasti tersimpan di server.
      </span>
    </div>
  );
};
