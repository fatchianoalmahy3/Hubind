import React, { useEffect, useState } from 'react';
import { ToastManager, ToastMessage } from '../core/ToastManager';
import { CheckCircle2, AlertTriangle, Loader2, Info, X, FileSpreadsheet } from 'lucide-react';

export const AppleToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const unsubscribe = ToastManager.getInstance().subscribe((newToasts) => {
      setToasts(newToasts);
    });
    return () => unsubscribe();
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-none w-full max-w-md px-4">
      {toasts.map((toast) => {
        const isPending = toast.type === 'pending';
        const isSuccess = toast.type === 'success';
        const isError = toast.type === 'error';

        return (
          <div
            key={toast.id}
            className="pointer-events-auto w-full bg-white/90 backdrop-blur-xl border border-slate-200/80 rounded-2xl shadow-lg p-3.5 flex items-start gap-3 transition-all duration-300 animate-in fade-in slide-in-from-top-4"
          >
            {/* Status Icon */}
            <div className="mt-0.5 shrink-0">
              {isPending && (
                <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-200/80">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              )}
              {isSuccess && (
                <div className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200/80">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              )}
              {isError && (
                <div className="w-7 h-7 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200/80">
                  <AlertTriangle className="w-4 h-4" />
                </div>
              )}
              {!isPending && !isSuccess && !isError && (
                <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center border border-slate-200">
                  <Info className="w-4 h-4" />
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-bold text-slate-800 tracking-tight">
                  {toast.title}
                </h4>
                <span className="text-[10px] font-mono text-slate-400">
                  {toast.timestamp}
                </span>
              </div>
              {toast.description && (
                <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                  {toast.description}
                </p>
              )}
              {toast.sheetName && (
                <div className="mt-1 flex items-center gap-1 text-[10px] font-medium text-emerald-700">
                  <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                  <span>Google Sheet: {toast.sheetName}</span>
                </div>
              )}
            </div>

            {/* Dismiss button */}
            <button
              onClick={() => ToastManager.getInstance().dismiss(toast.id)}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
