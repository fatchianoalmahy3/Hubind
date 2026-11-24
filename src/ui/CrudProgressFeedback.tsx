import React from 'react';
import { Loader2 } from 'lucide-react';

interface TopProgressBarProps {
  active: boolean;
  progressPercent?: number;
  label?: string;
  className?: string;
}

export const TopProgressBar: React.FC<TopProgressBarProps> = ({
  active,
  progressPercent,
  label = 'Menyinkronkan data dengan Cloud Server',
  className = '',
}) => {
  if (!active) return null;

  const isDeterminate =
    typeof progressPercent === 'number' && Number.isFinite(progressPercent);
  const clamped = isDeterminate
    ? Math.max(0, Math.min(100, Math.round(progressPercent!)))
    : 0;

  if (isDeterminate) {
    return (
      <div
        className={`relative h-[3px] w-full overflow-hidden bg-blue-100 shrink-0 ${className}`}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
      >
        <div
          className="h-full bg-gradient-to-r from-blue-500 via-blue-600 to-sky-500 transition-[width] duration-300 ease-out"
          style={{ width: `${clamped}%` }}
        />
      </div>
    );
  }

  return (
    <div
      className={`progress-sweep-track shrink-0 ${className}`}
      role="progressbar"
      aria-label={label}
    >
      <div className="progress-sweep-bar" />
    </div>
  );
};

interface CrudLoadingOverlayProps {
  visible: boolean;
  title?: string;
  subtitle?: string;
  progressText?: string;
  progressPercent?: number;
  tone?: 'blue' | 'rose' | 'emerald';
  zIndexClass?: string;
}

export const CrudLoadingOverlay: React.FC<CrudLoadingOverlayProps> = ({
  visible,
  title = 'Menyimpan Perubahan ke Cloud Server...',
  subtitle = 'Mohon tunggu sejenak dan jangan tutup jendela ini hingga proses selesai.',
  progressText,
  progressPercent,
  tone = 'blue',
  zIndexClass = 'z-40',
}) => {
  if (!visible) return null;

  const badgeClass =
    tone === 'rose'
      ? 'bg-rose-600 text-white'
      : tone === 'emerald'
      ? 'bg-emerald-600 text-white'
      : 'bg-blue-600 text-white';

  const hasPercent =
    typeof progressPercent === 'number' && Number.isFinite(progressPercent);
  const clamped = hasPercent
    ? Math.max(0, Math.min(100, Math.round(progressPercent!)))
    : 0;

  return (
    <div
      role="status"
      aria-live="assertive"
      className={`absolute inset-0 ${zIndexClass} bg-white/85 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center space-y-3.5 animate-in fade-in duration-150`}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shadow-lg ${badgeClass}`}
      >
        <Loader2 className="w-6 h-6 sm:w-7 sm:h-7 animate-spin" />
      </div>

      <div className="space-y-1 max-w-xs sm:max-w-sm">
        <h4 className="text-sm font-bold text-slate-900 leading-snug">{title}</h4>
        <p className="text-xs text-slate-600 leading-relaxed">{subtitle}</p>
      </div>

      {(hasPercent || progressText) && (
        <div className="w-full max-w-xs space-y-1.5 pt-1">
          {hasPercent && (
            <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
              <div
                className={`h-full rounded-full transition-[width] duration-300 ${
                  tone === 'emerald'
                    ? 'bg-emerald-600'
                    : tone === 'rose'
                    ? 'bg-rose-600'
                    : 'bg-blue-600'
                }`}
                style={{ width: `${clamped}%` }}
              />
            </div>
          )}
          <div className="flex items-center justify-center gap-2 text-[11px] font-semibold text-slate-700 tabular-nums">
            {progressText && <span>{progressText}</span>}
            {hasPercent && <span className="font-mono text-blue-700">{clamped}%</span>}
          </div>
        </div>
      )}
    </div>
  );
};
