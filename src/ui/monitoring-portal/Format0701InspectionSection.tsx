import React from 'react';
import {
  BookOpen,
  CheckSquare,
  Copy,
  ListChecks,
  Plus,
  Square,
  Trash2,
  UserCheck,
  Wrench,
} from 'lucide-react';
import type {
  AktivitasSikapRating,
  BukuLaporanStatus,
  KondisiBengkelCheck,
  KondisiBengkelRating,
} from '../../core/types/schema';

interface Format0701InspectionSectionProps {
  bukuLaporan: BukuLaporanStatus | '';
  aktivitasDp: AktivitasSikapRating | '';
  aktivitasMt: AktivitasSikapRating | '';
  aktivitasKrt: AktivitasSikapRating | '';
  kompetensiList: string[];
  kondisiBengkel: KondisiBengkelCheck;
  disabled?: boolean;
  canCopyFromPrevious?: boolean;
  onCopyFromPrevious?: () => void;
  onChangeBukuLaporan: (val: BukuLaporanStatus) => void;
  onChangeAktivitas: (field: 'aktivitasDp' | 'aktivitasMt' | 'aktivitasKrt', val: AktivitasSikapRating) => void;
  onChangeKompetensiList: (nextList: string[]) => void;
  onChangeKondisiBengkel: (next: KondisiBengkelCheck) => void;
}

const BUKU_LAPORAN_OPTIONS: Array<{
  code: BukuLaporanStatus;
  title: string;
  desc: string;
}> = [
  { code: 'BLM', title: 'BLM', desc: 'Belum Selesai Mengerjakan' },
  { code: 'SDH', title: 'SDH', desc: 'Sudah Dikerjakan' },
  { code: 'TDK', title: 'TDK', desc: 'Tidak Mengerjakan / Tertinggal' },
];

const SIKAP_ROWS: Array<{
  field: 'aktivitasDp' | 'aktivitasMt' | 'aktivitasKrt';
  code: string;
  label: string;
}> = [
  { field: 'aktivitasDp', code: 'DP', label: 'Kedisiplinan' },
  { field: 'aktivitasMt', code: 'MT', label: 'Motivasi' },
  { field: 'aktivitasKrt', code: 'KRT', label: 'Kreativitas' },
];

const SIKAP_VALUES: AktivitasSikapRating[] = ['Kurang', 'Cukup', 'Baik'];

const BENGKEL_ROWS: Array<{
  key: keyof KondisiBengkelCheck;
  label: string;
}> = [
  { key: 'volumePekerjaan', label: 'Volume Pekerjaan' },
  { key: 'relevansiPekerjaan', label: 'Relevansi Pekerjaan' },
  { key: 'kenyamanan', label: 'Kenyamanan' },
  { key: 'kelayakan', label: 'Kelayakan' },
];

const BENGKEL_COLUMNS: Array<{
  value: KondisiBengkelRating;
  header: string;
}> = [
  { value: 'Baik', header: 'Baik / Sesuai / Layak' },
  { value: 'Cukup', header: 'Cukup' },
  { value: 'Kurang', header: 'Kurang / Tidak Sesuai' },
];

export const Format0701InspectionSection: React.FC<Format0701InspectionSectionProps> = ({
  bukuLaporan,
  aktivitasDp,
  aktivitasMt,
  aktivitasKrt,
  kompetensiList,
  kondisiBengkel,
  disabled = false,
  canCopyFromPrevious = false,
  onCopyFromPrevious,
  onChangeBukuLaporan,
  onChangeAktivitas,
  onChangeKompetensiList,
  onChangeKondisiBengkel,
}) => {
  const normalizedKompetensi =
    kompetensiList.length >= 2
      ? kompetensiList
      : [...kompetensiList, ...Array(2 - kompetensiList.length).fill('')];

  const handleKompetensiChange = (idx: number, val: string) => {
    const next = [...normalizedKompetensi];
    next[idx] = val;
    onChangeKompetensiList(next);
  };

  const handleAddKompetensiRow = () => {
    onChangeKompetensiList([...normalizedKompetensi, '']);
  };

  const handleRemoveKompetensiRow = (idx: number) => {
    if (normalizedKompetensi.length <= 2) return;
    onChangeKompetensiList(normalizedKompetensi.filter((_, i) => i !== idx));
  };

  const getAktivitasValue = (field: 'aktivitasDp' | 'aktivitasMt' | 'aktivitasKrt') => {
    if (field === 'aktivitasDp') return aktivitasDp;
    if (field === 'aktivitasMt') return aktivitasMt;
    return aktivitasKrt;
  };

  return (
    <div className="space-y-4">
      {canCopyFromPrevious && !disabled && onCopyFromPrevious && (
        <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-indigo-900 font-medium">
            Siswa dalam 1 DUDI? Salin Kompetensi &amp; Keadaan Bengkel dari siswa sebelumnya.
          </span>
          <button
            type="button"
            onClick={onCopyFromPrevious}
            className="min-h-[34px] px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Samakan dg Siswa Sebelumnya</span>
          </button>
        </div>
      )}

      {/* Ceklist Buku Laporan */}
      <div className="p-3.5 sm:p-4 bg-white border border-slate-200 rounded-2xl space-y-2.5">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
          <BookOpen className="w-4 h-4 text-blue-600 shrink-0" />
          <span>Ceklist Buku Laporan Siswa *</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
          {BUKU_LAPORAN_OPTIONS.map((opt) => {
            const active = bukuLaporan === opt.code;
            return (
              <button
                key={opt.code}
                type="button"
                disabled={disabled}
                onClick={() => onChangeBukuLaporan(opt.code)}
                className={`min-h-[48px] px-2 sm:px-3 py-2 rounded-xl border text-left transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-start gap-1.5 sm:gap-2.5 ${
                  active
                    ? 'border-blue-600 bg-blue-50 text-blue-950 ring-2 ring-blue-600/20'
                    : 'border-slate-200 bg-slate-50/70 hover:border-slate-300 text-slate-700'
                }`}
              >
                {active ? (
                  <CheckSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 shrink-0 mt-0.5" />
                ) : (
                  <Square className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  <div className="text-xs font-bold">{opt.title}</div>
                  <div className="text-[10px] text-slate-500 leading-tight">{opt.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Ceklist Aktivitas Siswa (DP, MT, KRT) */}
      <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
          <UserCheck className="w-4 h-4 text-blue-600 shrink-0" />
          <span>Ceklist Aktivitas Siswa *</span>
        </div>
        <div className="space-y-2.5">
          {SIKAP_ROWS.map((row) => {
            const currentVal = getAktivitasValue(row.field);
            return (
              <div
                key={row.field}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl border border-slate-200/80 bg-slate-50/60"
              >
                <div className="text-xs font-bold text-slate-800">
                  <span className="inline-block min-w-[36px] text-blue-700">{row.code}</span>
                  <span>: {row.label}</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 sm:w-[270px]">
                  {SIKAP_VALUES.map((rating) => {
                    const selected = currentVal === rating;
                    return (
                      <button
                        key={rating}
                        type="button"
                        disabled={disabled}
                        onClick={() => onChangeAktivitas(row.field, rating)}
                        className={`min-h-[36px] px-2 py-1.5 rounded-lg border text-[11px] font-bold transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1 ${
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
                          <CheckSquare className="w-3 h-3 shrink-0" />
                        ) : (
                          <Square className="w-3 h-3 text-slate-400 shrink-0" />
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

      {/* Kompetensi yang didapat (min 2 rows + Add) */}
      <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
              <ListChecks className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Aktivitas Siswa — Kompetensi yang Didapat *</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Isikan minimal 2 kompetensi yang dipelajari/dikerjakan siswa di tempat PKL.
            </p>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={handleAddKompetensiRow}
              className="min-h-[34px] px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Baris</span>
            </button>
          )}
        </div>

        <div className="space-y-2">
          {normalizedKompetensi.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="w-6 text-right font-mono text-xs font-bold text-slate-500 shrink-0">
                {idx + 1}.
              </span>
              <input
                type="text"
                disabled={disabled}
                value={item}
                onChange={(e) => handleKompetensiChange(idx, e.target.value)}
                placeholder={`Kompetensi ke-${idx + 1} (cth: Servis berkala / Desain cetak / Instalasi jaringan)`}
                className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs text-slate-900 disabled:bg-slate-100 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              {!disabled && idx >= 2 && (
                <button
                  type="button"
                  aria-label={`Hapus baris kompetensi ke-${idx + 1}`}
                  onClick={() => handleRemoveKompetensiRow(idx)}
                  className="min-w-[36px] min-h-[36px] rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center cursor-pointer shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Keadaan Bengkel (Mobile Cards + Desktop Matrix) */}
      <div className="p-3.5 sm:p-4 bg-white border border-slate-200 rounded-2xl space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
          <Wrench className="w-4 h-4 text-blue-600 shrink-0" />
          <span>Kondisi / Keadaan Bengkel DUDI *</span>
        </div>

        {/* Mobile View: Segmented Cards without horizontal scrolling */}
        <div className="md:hidden space-y-2.5">
          {BENGKEL_ROWS.map((row, idx) => {
            const selectedVal = kondisiBengkel[row.key];
            return (
              <div
                key={`mob_${row.key}`}
                className="p-2.5 rounded-xl border border-slate-200/80 bg-slate-50/60 space-y-2"
              >
                <div className="text-xs font-bold text-slate-800">
                  {idx + 1}. {row.label}
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {BENGKEL_COLUMNS.map((col) => {
                    const isChecked = selectedVal === col.value;
                    const shortLabel =
                      col.value === 'Baik' ? 'Baik / Layak' : col.value === 'Cukup' ? 'Cukup' : 'Kurang';
                    return (
                      <button
                        key={col.value}
                        type="button"
                        disabled={disabled}
                        onClick={() =>
                          onChangeKondisiBengkel({
                            ...kondisiBengkel,
                            [row.key]: col.value,
                          })
                        }
                        className={`min-h-[40px] px-2 py-1.5 rounded-lg border text-[11px] font-bold transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1 ${
                          isChecked
                            ? col.value === 'Baik'
                              ? 'border-emerald-600 bg-emerald-600 text-white'
                              : col.value === 'Cukup'
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-rose-600 bg-rose-600 text-white'
                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {isChecked ? (
                          <CheckSquare className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <Square className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )}
                        <span className="truncate">{shortLabel}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop View: Print-Matched 4x3 Matrix */}
        <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-800 border-b border-slate-200">
                <th className="py-2 px-2.5 text-center w-9 font-bold border-r border-slate-200">No</th>
                <th className="py-2 px-3 text-left font-bold border-r border-slate-200">
                  Aspek Penilaian
                </th>
                {BENGKEL_COLUMNS.map((col) => (
                  <th
                    key={col.value}
                    className="py-2 px-2 text-center font-bold border-r last:border-r-0 border-slate-200 min-w-[96px]"
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {BENGKEL_ROWS.map((row, idx) => {
                const selectedVal = kondisiBengkel[row.key];
                return (
                  <tr
                    key={row.key}
                    className="border-b last:border-b-0 border-slate-200 hover:bg-slate-50/70"
                  >
                    <td className="py-2 px-2 text-center font-mono text-slate-600 border-r border-slate-200">
                      {idx + 1}
                    </td>
                    <td className="py-2 px-3 font-semibold text-slate-800 border-r border-slate-200">
                      {row.label}
                    </td>
                    {BENGKEL_COLUMNS.map((col) => {
                      const isChecked = selectedVal === col.value;
                      return (
                        <td
                          key={col.value}
                          className="py-1.5 px-2 text-center border-r last:border-r-0 border-slate-200"
                        >
                          <button
                            type="button"
                            disabled={disabled}
                            aria-label={`${row.label}: ${col.header}`}
                            onClick={() =>
                              onChangeKondisiBengkel({
                                ...kondisiBengkel,
                                [row.key]: col.value,
                              })
                            }
                            className={`w-full min-h-[34px] rounded-lg border inline-flex items-center justify-center transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                              isChecked
                                ? col.value === 'Baik'
                                  ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                                  : col.value === 'Cukup'
                                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                                  : 'border-rose-600 bg-rose-50 text-rose-700'
                                : 'border-transparent hover:bg-slate-100 text-slate-400'
                            }`}
                          >
                            {isChecked ? (
                              <CheckSquare className="w-4 h-4" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
