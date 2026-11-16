import React, { useEffect, useState } from 'react';
import { ToastManager, ToastMessage } from '../core/ToastManager';
import { CheckCircle2, AlertTriangle, Loader2, Info, X, Database } from 'lucide-react';
import { getStoredAdminSession } from '../core/auth/LocalAccountAuthService';

export const AppleToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const unsubscribe = ToastManager.getInstance().subscribe((newToasts) => {
      setToasts(newToasts);
    });
    return () => unsubscribe();
  }, []);

  if (toasts.length === 0) return null;

  const toast = toasts[0];
  const isPending = toast.type === 'pending';
  const isSuccess = toast.type === 'success';
  const isError = toast.type === 'error';
  const isHubin = getStoredAdminSession()?.user?.role === 'Hubin';
  const showTableMeta = isHubin && Boolean(toast.sheetName);

  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center pointer-events-none w-full max-w-md px-4"
      aria-live="polite"
      aria-atomic="true"
    >
      <div
        key={toast.id}
        className="pointer-events-auto w-full bg-white/95 backdrop-blur-xl border border-slate-200/90 rounded-2xl shadow-xl p-3.5 flex items-start gap-3 transition-all duration-200 animate-in fade-in slide-in-from-top-3"
      >
        {/* Status Icon */}
        <div className="mt-0.5 shrink-0">
          {isPending && (
            <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-200/80">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          )}
          {isSuccess && (
            <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200/80">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          )}
          {isError && (
            <div className="w-8 h-8 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200/80">
              <AlertTriangle className="w-4 h-4" />
            </div>
          )}
          {!isPending && !isSuccess && !isError && (
            <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center border border-slate-200">
              <Info className="w-4 h-4" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-slate-900 tracking-tight truncate">
              {toast.title}
            </h4>
            <span className="text-[10px] font-mono tabular-nums text-slate-400 shrink-0">
              {toast.timestamp}
            </span>
          </div>
          {toast.description && (
            <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
              {toast.description}
            </p>
          )}
          {(showTableMeta || Number(toast.queuedCount || 0) > 0) && (
            <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] font-medium text-emerald-700">
              {showTableMeta ? (
                <div className="flex items-center gap-1 min-w-0 truncate">
                  <Database className="w-3 h-3 text-emerald-600 shrink-0" />
                  <span className="truncate">Tabel Server: {toast.sheetName}</span>
                </div>
              ) : (
                <span />
              )}
              {Number(toast.queuedCount || 0) > 0 ? (
                <span className="text-slate-400 font-mono shrink-0">
                  +{toast.queuedCount} antrean
                </span>
              ) : null}
            </div>
          )}
        </div>

        {/* Dismiss button */}
        <button
          type="button"
          onClick={() => ToastManager.getInstance().dismiss(toast.id)}
          aria-label="Tutup notifikasi"
          className="text-slate-400 hover:text-slate-700 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
