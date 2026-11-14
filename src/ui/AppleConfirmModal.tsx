import React from 'react';
import { Trash2, Save, FileSpreadsheet } from 'lucide-react';

interface AppleConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  sheetName: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary' | 'success';
  loading?: boolean;
}

export const AppleConfirmModal: React.FC<AppleConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  sheetName,
  confirmText = 'Konfirmasi & Simpan',
  cancelText = 'Batal',
  variant = 'primary',
  loading = false,
}) => {
  if (!isOpen) return null;

  const isDanger = variant === 'danger';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-[2px]"
      onClick={!loading ? onClose : undefined}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden border border-slate-200 flex flex-col p-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon */}
        <div
          className={`w-12 h-12 rounded-xl mx-auto flex items-center justify-center mb-4 border ${
            isDanger
              ? 'bg-rose-50 text-rose-600 border-rose-200'
              : 'bg-blue-50 text-blue-600 border-blue-200'
          }`}
        >
          {isDanger ? <Trash2 className="w-5 h-5" /> : <Save className="w-5 h-5" />}
        </div>

        {/* Title & Description */}
        <h3 className="text-base font-bold text-slate-900 tracking-tight leading-snug">
          {title}
        </h3>
        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
          {description}
        </p>

        {/* Unboxed Target Sheet Metadata */}
        <div className="mt-3 inline-flex items-center justify-center gap-1.5 text-xs font-mono text-slate-600 mx-auto">
          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>Target: {sheetName}</span>
        </div>

        {/* Proportional Action Buttons (h-10) */}
        <div className="grid grid-cols-2 gap-2.5 mt-6 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="h-10 w-full px-4 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`h-10 w-full px-4 rounded-lg text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer ${
              isDanger
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loading ? 'Menyimpan...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
