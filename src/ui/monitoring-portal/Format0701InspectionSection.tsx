import React from 'react';
import { BookOpen, CheckSquare, Sparkles, Square, UserCheck } from 'lucide-react';
import type { AktivitasSikapRating, BukuLaporanStatus } from '../../core/types/schema';

interface Format0701InspectionSectionProps {
  bukuLaporan: BukuLaporanStatus | '';
  aktivitasDp: AktivitasSikapRating | '';
  aktivitasMt: AktivitasSikapRating | '';
  aktivitasKrt: AktivitasSikapRating | '';
  disabled?: boolean;
  onApplyStandardAll: () => void;
  onChangeBukuLaporan: (val: BukuLaporanStatus) => void;
  onChangeAktivitas: (field: 'aktivitasDp' | 'aktivitasMt' | 'aktivitasKrt', val: AktivitasSikapRating) => void;
}

const BUKU_LAPORAN_OPTIONS: Array<{
  code: BukuLaporanStatus;
  label: string;
  desc: string;
}> = [
  { code: 'BLM', label: 'Belum Selesai', desc: 'Belum Selesai Mengerjakan' },
  { code: 'SDH', label: 'Sudah Dikerjakan', desc: 'Sudah Dikerjakan Lengkap' },
  { code: 'TDK', label: 'Tidak Mengerjakan', desc: 'Tidak Mengerjakan / Tertinggal' },
];

const SIKAP_ROWS: Array<{
  field: 'aktivitasDp' | 'aktivitasMt' | 'aktivitasKrt';
  label: string;
}> = [
  { field: 'aktivitasDp', label: 'Kedisiplinan' },
  { field: 'aktivitasMt', label: 'Motivasi' },
  { field: 'aktivitasKrt', label: 'Kreativitas' },
];

const SIKAP_VALUES: AktivitasSikapRating[] = ['Kurang', 'Cukup', 'Baik'];

export const Format0701InspectionSection: React.FC<Format0701InspectionSectionProps> = ({
  bukuLaporan,
  aktivitasDp,
  aktivitasMt,
  aktivitasKrt,
  disabled = false,
  onApplyStandardAll,
  onChangeBukuLaporan,
  onChangeAktivitas,
}) => {
  const getAktivitasValue = (field: 'aktivitasDp' | 'aktivitasMt' | 'aktivitasKrt') => {
    if (field === 'aktivitasDp') return aktivitasDp;
    if (field === 'aktivitasMt') return aktivitasMt;
    return aktivitasKrt;
  };

  return (
    <div className="space-y-2.5 sm:space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-slate-600">
          Ceklist Buku Laporan &amp; Sikap Siswa
        </span>
        {!disabled && (
          <button
            type="button"
            onClick={onApplyStandardAll}
            className="min-h-[34px] px-2.5 py-1 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
          >
            <Sparkles className="w-3 h-3 shrink-0" />
            <span>Isi Cepat: Sudah Dikerjakan &amp; Baik</span>
          </button>
        )}
      </div>

      {/* Ceklist Buku Laporan */}
      <div className="p-2.5 sm:p-4 bg-white border border-slate-200 rounded-xl sm:rounded-2xl space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
          <BookOpen className="w-4 h-4 text-blue-600 shrink-0" />
          <span>Ceklist Buku Laporan Siswa *</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 sm:gap-2">
          {BUKU_LAPORAN_OPTIONS.map((opt) => {
            const active = bukuLaporan === opt.code;
            return (
              <button
                key={opt.code}
                type="button"
                disabled={disabled}
                onClick={() => onChangeBukuLaporan(opt.code)}
                className={`min-h-[46px] sm:min-h-[52px] px-3 py-2 rounded-xl border text-left transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center sm:items-start justify-start gap-2.5 ${
                  active
                    ? 'border-blue-600 bg-blue-50 text-blue-950 ring-2 ring-blue-600/20'
                    : 'border-slate-200 bg-slate-50/70 hover:border-slate-300 text-slate-700'
                }`}
              >
                <div className="sm:mt-0.5 shrink-0">
                  {active ? (
                    <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                </div>
                <div className="min-w-0">
                  <span className="block text-xs font-bold leading-snug">{opt.label}</span>
                  <span className="hidden sm:block text-[10px] text-slate-500 leading-tight mt-0.5">
                    {opt.desc}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Ceklist Aktivitas & Sikap Siswa */}
      <div className="p-3 sm:p-4 bg-white border border-slate-200 rounded-xl sm:rounded-2xl space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
          <UserCheck className="w-4 h-4 text-blue-600 shrink-0" />
          <span>Ceklist Aktivitas &amp; Sikap Siswa *</span>
        </div>
        <div className="space-y-2">
          {SIKAP_ROWS.map((row) => {
            const currentVal = getAktivitasValue(row.field);
            return (
              <div
                key={row.field}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2 p-2.5 rounded-xl border border-slate-200/80 bg-slate-50/60"
              >
                <div className="text-xs font-bold text-slate-800">{row.label}</div>
                <div className="grid grid-cols-3 gap-1.5 sm:w-[270px]">
                  {SIKAP_VALUES.map((rating) => {
                    const selected = currentVal === rating;
                    return (
                      <button
                        key={rating}
                        type="button"
                        disabled={disabled}
                        onClick={() => onChangeAktivitas(row.field, rating)}
                        className={`min-h-[40px] sm:min-h-[36px] px-2 py-1.5 rounded-lg border text-xs sm:text-[11px] font-bold transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1 whitespace-nowrap ${
                          selected
                            ? rating === 'Baik'
                              ? 'border-emerald-600 bg-emerald-600 text-white'
                              : rating === 'Cukup'
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-amber-600 bg-amber-600 text-white'
                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {selected ? (
                          <CheckSquare className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <Square className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )}
                        <span>{rating}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
