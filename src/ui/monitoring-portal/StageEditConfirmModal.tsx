import React from 'react';
import { Calendar, CheckCircle2, Eye, LockOpen, Pencil, X } from 'lucide-react';
import { formatIndonesianDate } from '../../core/utils/dateHelpers';

export interface PendingStageEditConfirm {
  mode: 'stage' | 'delivery';
  stageNum: number;
  stageLabel: string;
  targetName: string;
  lockKey: string;
  studentKey?: string;
  savedDate?: string;
}

interface StageEditConfirmModalProps {
  pending: PendingStageEditConfirm | null;
  onViewReadOnly: () => void;
  onConfirmEdit: () => void;
  onCancel: () => void;
}

export const StageEditConfirmModal: React.FC<StageEditConfirmModalProps> = ({
  pending,
  onViewReadOnly,
  onConfirmEdit,
  onCancel,
}) => {
  if (!pending) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="stage-edit-confirm-title"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 bg-emerald-50/80 border-b border-emerald-200/80 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
                Tahap Sudah Terisi
              </span>
              <h3
                id="stage-edit-confirm-title"
                className="text-sm font-bold text-slate-900 mt-0.5 leading-snug"
              >
                Apakah Anda Ingin Mengedit Data Ini?
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            aria-label="Tutup konfirmasi edit"
            className="w-8 h-8 rounded-full hover:bg-emerald-100 text-slate-500 hover:text-slate-700 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3.5 text-xs text-slate-700 leading-relaxed">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">Tahap Monitoring</span>
              <span className="font-bold text-slate-900">{pending.stageLabel}</span>
            </div>
            <div className="flex items-start justify-between gap-2">
              <span className="text-slate-500 shrink-0">
                {pending.mode === 'delivery' ? 'DUDI / Kelompok' : 'Siswa'}
              </span>
              <span className="font-semibold text-slate-800 text-right">{pending.targetName}</span>
            </div>
            {pending.savedDate && (
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/80">
                <span className="text-slate-500 inline-flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Tgl Tersimpan</span>
                </span>
                <span className="font-mono font-semibold text-slate-700">
                  {formatIndonesianDate(pending.savedDate)}
                </span>
              </div>
            )}
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Data monitoring untuk tahap ini sudah tersimpan di Cloud Server. Untuk mencegah perubahan yang tidak disengaja, form dikunci dalam mode <b>Baca-Saja</b>.
          </p>
        </div>

        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2">
          <button
            type="button"
            onClick={onViewReadOnly}
            className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Eye className="w-4 h-4 text-slate-500" />
            <span>Lihat Data (Baca-Saja)</span>
          </button>
          <button
            type="button"
            onClick={onConfirmEdit}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-[0.99]"
          >
            <LockOpen className="w-4 h-4" />
            <Pencil className="w-3.5 h-3.5 -ml-0.5" />
            <span>Ya, Edit Data</span>
          </button>
        </div>
      </div>
    </div>
  );
};
