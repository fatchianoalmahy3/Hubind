import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { GRADE_CATEGORIES, QUICK_SCORE_PRESETS, type GradeScoresDraft } from './types';

interface GradeScoreEditorGridProps {
  variant: 'initial' | 'edit';
  scores: GradeScoresDraft;
  rataRata: number;
  predikat: string;
  disabled?: boolean;
  onChange: (patch: Partial<GradeScoresDraft>) => void;
}

export const GradeScoreEditorGrid: React.FC<GradeScoreEditorGridProps> = ({
  variant,
  scores,
  rataRata,
  predikat,
  disabled = false,
  onChange,
}) => {
  const isEdit = variant === 'edit';

  return (
    <div
      className={
        isEdit
          ? 'space-y-3 pt-2 border-t border-emerald-200/80 animate-in fade-in duration-150'
          : 'space-y-3 pt-3 border-t border-slate-100 animate-in fade-in duration-150'
      }
    >
      <div
        className={`flex items-center justify-between text-xs ${
          isEdit ? 'text-emerald-950' : ''
        }`}
      >
        <span className={isEdit ? 'font-bold' : 'font-bold text-slate-900'}>
          {isEdit
            ? 'Edit 4 Kategori Nilai PKL (Bobot Sama 25%)'
            : 'Input 4 Kategori Nilai PKL (Bobot Sama 25%)'}
        </span>
        <span className={`text-[11px] ${isEdit ? 'text-emerald-700' : 'text-slate-500'}`}>
          Skala 0 – 100
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3">
        {GRADE_CATEGORIES.map((cat) => {
          const score = scores[cat.field];
          return (
            <div
              key={cat.field}
              className={`p-3 sm:p-3.5 rounded-xl space-y-2 border ${
                isEdit
                  ? 'bg-white border-emerald-200'
                  : 'bg-slate-50/80 border-slate-200'
              }`}
            >
              <div>
                <span className="text-xs font-bold text-slate-900 block">{cat.title}</span>
                <span className="text-[11px] text-slate-500 leading-snug block">
                  {cat.subtitle}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={isEdit ? `Kurangi ${cat.title}` : `Kurangi nilai ${cat.title}`}
                  onClick={() =>
                    onChange({
                      [cat.field]: Math.max(0, score - 1),
                    })
                  }
                  className={`min-w-[44px] min-h-[44px] rounded-xl border border-slate-300 text-slate-700 flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    isEdit
                      ? 'bg-slate-50 hover:bg-slate-100 active:bg-slate-200'
                      : 'bg-white hover:bg-slate-100 active:bg-slate-200'
                  }`}
                >
                  <Minus className="w-4 h-4" />
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={isEdit ? 0 : 1}
                  max={100}
                  disabled={disabled}
                  placeholder={isEdit ? undefined : '1-100'}
                  value={isEdit ? score : score > 0 ? score : ''}
                  onChange={(e) => {
                    const nextVal = Math.max(
                      0,
                      Math.min(100, Math.round(Number(e.target.value) || 0))
                    );
                    onChange({ [cat.field]: nextVal });
                  }}
                  className="w-full min-h-[44px] text-center font-mono tabular-nums text-base font-bold text-blue-700 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:bg-slate-100 disabled:text-slate-500"
                />
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={isEdit ? `Tambah ${cat.title}` : `Tambah nilai ${cat.title}`}
                  onClick={() =>
                    onChange({
                      [cat.field]: Math.min(100, score + 1),
                    })
                  }
                  className={`min-w-[44px] min-h-[44px] rounded-xl border border-slate-300 text-slate-700 flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    isEdit
                      ? 'bg-slate-50 hover:bg-slate-100 active:bg-slate-200'
                      : 'bg-white hover:bg-slate-100 active:bg-slate-200'
                  }`}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-5 gap-1.5">
                {QUICK_SCORE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange({ [cat.field]: preset })}
                    className={`min-h-[36px] rounded-lg text-xs font-mono tabular-nums font-bold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      score === preset
                        ? 'bg-blue-600 text-white'
                        : isEdit
                        ? 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div
        className={`p-3.5 rounded-xl flex items-center justify-between gap-3 border ${
          isEdit ? 'bg-white border-emerald-200' : 'bg-blue-50 border-blue-200'
        }`}
      >
        <div>
          <span className="text-[11px] text-slate-600 block">
            {isEdit
              ? 'Rata-rata Terbaru (4 Kategori Sama Rata)'
              : 'Rata-rata Nilai PKL (4 Kategori Sama Rata)'}
          </span>
          <span className="text-xs font-bold text-emerald-700">Predikat: {predikat}</span>
        </div>
        <span className="text-2xl font-bold font-mono tabular-nums text-blue-700">
          {rataRata}
        </span>
      </div>
    </div>
  );
};
