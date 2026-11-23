import React, { useEffect, useRef, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Copy,
  ListChecks,
  Mic,
  MicOff,
  Plus,
  Sparkles,
  Square,
  Trash2,
  Wrench,
} from 'lucide-react';
import type { KondisiBengkelCheck, KondisiBengkelRating } from '../../core/types/schema';
import { appendVoiceTranscript } from '../../hooks/useVoiceDictation';

interface WorkshopSharedInspectionCardProps {
  dudiNama: string;
  stageNum: number;
  studentKey?: string;
  studentCount: number;
  kompetensiList: string[];
  kondisiBengkel: KondisiBengkelCheck;
  disabled?: boolean;
  canCopyFromPrevStage?: boolean;
  onCopyFromPrevStage?: () => void;
  onMarkAllBaik: () => void;
  onChangeKompetensiList: (nextList: string[]) => void;
  onChangeKondisiBengkel: (next: KondisiBengkelCheck) => void;
  voiceSupported: boolean;
  voiceActiveFieldId: string | null;
  voiceInterimText: string;
  voiceError: string;
  onToggleVoice: (fieldId: string, onFinalTranscript: (spoken: string) => void) => void;
}

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
  shortLabel: string;
}> = [
  { value: 'Baik', header: 'Baik / Sesuai / Layak', shortLabel: 'Baik' },
  { value: 'Cukup', header: 'Cukup', shortLabel: 'Cukup' },
  { value: 'Kurang', header: 'Kurang / Tidak Sesuai', shortLabel: 'Kurang' },
];

export const WorkshopSharedInspectionCard: React.FC<WorkshopSharedInspectionCardProps> = ({
  dudiNama,
  stageNum,
  studentKey = '',
  studentCount,
  kompetensiList,
  kondisiBengkel,
  disabled = false,
  canCopyFromPrevStage = false,
  onCopyFromPrevStage,
  onMarkAllBaik,
  onChangeKompetensiList,
  onChangeKondisiBengkel,
  voiceSupported,
  voiceActiveFieldId,
  voiceInterimText,
  voiceError,
  onToggleVoice,
}) => {
  const normalizedKompetensi =
    kompetensiList.length >= 2
      ? kompetensiList
      : [...kompetensiList, ...Array(2 - kompetensiList.length).fill('')];

  const filledKompCount = normalizedKompetensi.filter((k) => k.trim().length > 0).length;
  const isWorkshopComplete =
    filledKompCount >= 2 &&
    Boolean(
      kondisiBengkel.volumePekerjaan &&
        kondisiBengkel.relevansiPekerjaan &&
        kondisiBengkel.kenyamanan &&
        kondisiBengkel.kelayakan
    );

  const contextKey = `${dudiNama}::${stageNum}::${studentKey}`;
  const prevContextRef = useRef(contextKey);
  const [isExpanded, setIsExpanded] = useState<boolean>(() => !isWorkshopComplete);

  useEffect(() => {
    if (prevContextRef.current !== contextKey) {
      prevContextRef.current = contextKey;
      setIsExpanded(!isWorkshopComplete);
    } else if (!isWorkshopComplete) {
      setIsExpanded(true);
    }
  }, [contextKey, isWorkshopComplete]);

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

  if (!isExpanded && isWorkshopComplete) {
    return (
      <div className="p-3 sm:px-4 sm:py-3 rounded-xl sm:rounded-2xl border border-emerald-200 bg-emerald-50/60 flex items-center justify-between gap-2.5">
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-bold text-emerald-800">
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Kompetensi &amp; Bengkel Tahap {stageNum} Lengkap (1x Per DUDI)</span>
            </span>
          </div>
          <p className="text-[11px] text-slate-600 leading-snug">
            <span className="tabular-nums font-semibold text-slate-800">{filledKompCount}</span>{' '}
            kompetensi terisi · Kondisi:{' '}
            <span className="font-semibold text-slate-800">
              Vol {kondisiBengkel.volumePekerjaan} / Rel {kondisiBengkel.relevansiPekerjaan} / Nyaman{' '}
              {kondisiBengkel.kenyamanan} / Layak {kondisiBengkel.kelayakan}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="min-h-[38px] px-3 py-1.5 rounded-xl border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-800 font-bold text-[11px] inline-flex items-center gap-1 shrink-0 cursor-pointer whitespace-nowrap"
        >
          <span>{disabled ? 'Lihat' : 'Ubah'}</span>
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-indigo-200 bg-indigo-50/35 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
            <span className="inline-flex items-center gap-1 font-bold text-indigo-700">
              <Building2 className="w-3.5 h-3.5 shrink-0" />
              <span>1x Per DUDI · Tahap {stageNum}</span>
            </span>
            {isWorkshopComplete && (
              <>
                <span aria-hidden="true" className="text-slate-300">
                  ·
                </span>
                <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Lengkap</span>
                </span>
              </>
            )}
          </div>
          <h5 className="text-xs sm:text-sm font-bold text-slate-900 mt-0.5 leading-snug">
            Kompetensi &amp; Kelayakan Bengkel ({dudiNama})
          </h5>
          <p className="text-[11px] text-slate-600 leading-snug mt-0.5">
            Cukup diisi 1x — otomatis berlaku untuk seluruh{' '}
            <span className="tabular-nums font-semibold">{studentCount}</span> siswa di tahap ini.
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {canCopyFromPrevStage && !disabled && onCopyFromPrevStage && (
            <button
              type="button"
              onClick={onCopyFromPrevStage}
              className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-white border border-indigo-300 hover:bg-indigo-100 text-indigo-800 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <Copy className="w-3.5 h-3.5 shrink-0" />
              <span>Salin Tahap {stageNum - 1}</span>
            </button>
          )}
          {isWorkshopComplete && (
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold text-[11px] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <span>Ringkas</span>
              <ChevronUp className="w-3.5 h-3.5 shrink-0" />
            </button>
          )}
        </div>
      </div>

      {/* Kompetensi yang Didapat + Voice Dictation */}
      <div className="p-3 sm:p-3.5 bg-white border border-slate-200 rounded-xl space-y-2.5">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
            <ListChecks className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Kompetensi yang Didapat *</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Min. 2 baris. Ketuk mikrofon untuk dikte suara.
          </p>
        </div>

        <div className="space-y-2">
          {normalizedKompetensi.map((item, idx) => {
            const fieldId = `kompetensi_${idx}`;
            const isListeningThis = voiceActiveFieldId === fieldId;
            return (
              <div key={idx} className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-4 text-right font-mono text-xs font-bold text-slate-500 shrink-0 tabular-nums">
                    {idx + 1}.
                  </span>
                  <input
                    type="text"
                    disabled={disabled}
                    value={item}
                    onChange={(e) => handleKompetensiChange(idx, e.target.value)}
                    placeholder={`Kompetensi ke-${idx + 1} (ketik / mic)`}
                    className={`min-w-0 flex-1 min-h-[42px] px-3 py-1.5 rounded-xl border text-xs text-slate-900 disabled:bg-slate-100 disabled:text-slate-500 focus:outline-none focus:ring-2 ${
                      isListeningThis
                        ? 'border-rose-400 bg-rose-50/40 focus:ring-rose-500'
                        : 'border-slate-300 bg-white focus:ring-blue-600'
                    }`}
                  />
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() =>
                        onToggleVoice(fieldId, (spoken) => {
                          const updated = appendVoiceTranscript(item, spoken);
                          handleKompetensiChange(idx, updated);
                        })
                      }
                      aria-label={
                        isListeningThis
                          ? `Hentikan dikte suara kompetensi ke-${idx + 1}`
                          : `Dikte suara kompetensi ke-${idx + 1}`
                      }
                      title={
                        voiceSupported
                          ? isListeningThis
                            ? 'Ketuk untuk berhenti merekam'
                            : 'Dikte suara kompetensi (Bahasa Indonesia)'
                          : 'Browser tidak mendukung dikte suara'
                      }
                      className={`min-w-[42px] min-h-[42px] rounded-xl border flex items-center justify-center cursor-pointer shrink-0 transition-all ${
                        isListeningThis
                          ? 'border-rose-500 bg-rose-600 text-white animate-pulse shadow-xs'
                          : 'border-slate-300 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-slate-700 hover:text-blue-700'
                      }`}
                    >
                      {isListeningThis ? (
                        <MicOff className="w-4 h-4" />
                      ) : (
                        <Mic className="w-4 h-4" />
                      )}
                    </button>
                  )}
                  {!disabled && idx >= 2 && (
                    <button
                      type="button"
                      aria-label={`Hapus baris kompetensi ke-${idx + 1}`}
                      onClick={() => handleRemoveKompetensiRow(idx)}
                      className="min-w-[42px] min-h-[42px] rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {isListeningThis && (
                  <p className="pl-6 text-[11px] font-medium text-rose-700 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping shrink-0" />
                    <span>
                      {voiceInterimText
                        ? `Mendengarkan: "${voiceInterimText}"`
                        : 'Silakan bicara sekarang (Bahasa Indonesia)...'}
                    </span>
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {!disabled && (
          <div className="pt-0.5">
            <button
              type="button"
              onClick={handleAddKompetensiRow}
              className="w-full sm:w-auto min-h-[40px] px-3.5 py-2 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>Tambah Baris</span>
            </button>
          </div>
        )}

        {voiceError && (
          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            {voiceError}
          </p>
        )}
      </div>

      {/* Keadaan / Kelayakan Bengkel DUDI */}
      <div className="p-3 sm:p-3.5 bg-white border border-slate-200 rounded-xl space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
              <Wrench className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Kondisi / Kelayakan Bengkel *</span>
            </div>
            <p className="md:hidden text-[10px] text-slate-500 mt-0.5">
              Baik = Sesuai / Layak · Kurang = Tidak Sesuai
            </p>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={onMarkAllBaik}
              className="min-h-[34px] px-2.5 py-1 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-3 h-3 shrink-0" />
              <span>Semua Baik/Layak</span>
            </button>
          )}
        </div>

        {/* Mobile View: Crisp Compact Rows with Clear Labels */}
        <div className="md:hidden divide-y divide-slate-100 border border-slate-200/80 rounded-xl overflow-hidden bg-slate-50/40">
          {BENGKEL_ROWS.map((row, idx) => {
            const selectedVal = kondisiBengkel[row.key];
            return (
              <div key={`mob_${row.key}`} className="p-2.5 space-y-1.5 bg-white">
                <div className="text-xs font-bold text-slate-800">
                  <span className="font-mono text-slate-400 mr-1">{idx + 1}.</span>
                  <span>{row.label}</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {BENGKEL_COLUMNS.map((col) => {
                    const isChecked = selectedVal === col.value;
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
                        className={`min-h-[40px] px-2 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 whitespace-nowrap ${
                          isChecked
                            ? col.value === 'Baik'
                              ? 'border-emerald-600 bg-emerald-600 text-white'
                              : col.value === 'Cukup'
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-rose-600 bg-rose-600 text-white'
                            : 'border-slate-300 bg-slate-50/70 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {isChecked ? (
                          <CheckSquare className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <Square className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )}
                        <span>{col.shortLabel}</span>
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
                    <td className="py-2 px-2 text-center font-mono text-slate-600 border-r border-slate-200 tabular-nums">
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

