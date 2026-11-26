import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Lock,
  Unlock,
  ShieldCheck,
  Save,
  Loader2,
  ListChecks,
  Layers,
  AlertCircle,
  GraduationCap,
  Award,
  RotateCcw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  DEFAULT_MONITORING_STAGE_CONTROL,
  MONITORING_STAGES,
  type Jurusan,
  type JurusanStagePolicy,
  type MonitoringStageControl,
} from '../core/types/schema';
import { GoogleSheetClient } from '../core/GoogleSheetClient';
import { PublicPortalClient } from '../core/PublicPortalClient';
import { JurusanService } from '../services/JurusanService';
import { CrudLoadingOverlay, TopProgressBar } from './CrudProgressFeedback';

interface MonitoringStageControlModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ALL_STAGES = MONITORING_STAGES.map((s) => s.num);
const GRADE_CANDIDATE_STAGES = MONITORING_STAGES.filter((s) => s.num >= 2);

const FALLBACK_JURUSAN_OPTIONS: Array<{ kode: string; nama: string }> = [
  { kode: 'DKV', nama: 'Desain Komunikasi Visual' },
  { kode: 'RPL', nama: 'Rekayasa Perangkat Lunak' },
  { kode: 'TAB', nama: 'Teknik Alat Berat' },
  { kode: 'TBKR', nama: 'Teknik Bodi Kendaraan Ringan' },
  { kode: 'TKR', nama: 'Teknik Kendaraan Ringan' },
  { kode: 'TKJ', nama: 'Teknik Komputer dan Jaringan' },
  { kode: 'TPM', nama: 'Teknik Pemesinan' },
  { kode: 'TPL', nama: 'Teknik Pengelasan' },
  { kode: 'TSM', nama: 'Teknik Sepeda Motor' },
];

export const MonitoringStageControlModal: React.FC<MonitoringStageControlModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [requireSequential, setRequireSequential] = useState<boolean>(
    DEFAULT_MONITORING_STAGE_CONTROL.requireSequential
  );
  const [requireIssuedLetter, setRequireIssuedLetter] = useState<boolean>(
    DEFAULT_MONITORING_STAGE_CONTROL.requireIssuedLetter ?? true
  );
  const [unlockedStages, setUnlockedStages] = useState<number[]>(
    DEFAULT_MONITORING_STAGE_CONTROL.unlockedStages
  );
  const [gradeStage, setGradeStage] = useState<number>(
    DEFAULT_MONITORING_STAGE_CONTROL.gradeStage ?? 5
  );
  const [perJurusan, setPerJurusan] = useState<Record<string, JurusanStagePolicy>>({});
  const [jurusanList, setJurusanList] = useState<Jurusan[]>([]);
  const [expandedJurusanCode, setExpandedJurusanCode] = useState<string | null>(null);
  const [lockedReason, setLockedReason] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;
    const current = GoogleSheetClient.getInstance().getMonitoringStageControl();
    setRequireSequential(current.requireSequential);
    setRequireIssuedLetter(current.requireIssuedLetter ?? true);
    setUnlockedStages([...current.unlockedStages]);
    setGradeStage(
      typeof current.gradeStage === 'number' && current.gradeStage >= 2 && current.gradeStage <= 8
        ? current.gradeStage
        : 5
    );
    const clonedPerJurusan: Record<string, JurusanStagePolicy> = {};
    if (current.perJurusan && typeof current.perJurusan === 'object') {
      for (const [code, pol] of Object.entries(current.perJurusan)) {
        if (!code || !pol) continue;
        clonedPerJurusan[code.toUpperCase()] = {
          enabledStages: Array.isArray(pol.enabledStages)
            ? [...pol.enabledStages].sort((a, b) => a - b)
            : [...ALL_STAGES],
          ...(typeof pol.gradeStage === 'number' ? { gradeStage: pol.gradeStage } : {}),
        };
      }
    }
    setPerJurusan(clonedPerJurusan);
    setExpandedJurusanCode(null);
    setLockedReason(current.lockedReason || '');
    setErrorMsg('');

    JurusanService.getInstance()
      .getAll()
      .then((rows) => {
        if (Array.isArray(rows) && rows.length > 0) {
          setJurusanList(rows);
        }
      })
      .catch(() => {});
  }, [isOpen]);

  const jurusanOptions = useMemo(() => {
    const map = new Map<string, { kode: string; nama: string }>();
    for (const j of jurusanList) {
      const kode = String(j.kode || '').trim().toUpperCase();
      if (!kode) continue;
      map.set(kode, { kode, nama: j.nama || kode });
    }
    for (const fb of FALLBACK_JURUSAN_OPTIONS) {
      if (!map.has(fb.kode)) {
        map.set(fb.kode, fb);
      }
    }
    for (const customKode of Object.keys(perJurusan)) {
      const clean = customKode.trim().toUpperCase();
      if (clean && !map.has(clean)) {
        map.set(clean, { kode: clean, nama: clean });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.kode.localeCompare(b.kode, 'id'));
  }, [jurusanList, perJurusan]);

  if (!isOpen) return null;

  const toggleStage = (stageNum: number) => {
    setErrorMsg('');
    setUnlockedStages((prev) => {
      if (prev.includes(stageNum)) {
        return prev.filter((n) => n !== stageNum);
      }
      return [...prev, stageNum].sort((a, b) => a - b);
    });
  };

  const applyTransitionPreset = () => {
    setErrorMsg('');
    setRequireSequential(false);
    setUnlockedStages([...ALL_STAGES]);
  };

  const applyStrictPreset = () => {
    setErrorMsg('');
    setRequireSequential(true);
    setUnlockedStages([...ALL_STAGES]);
  };

  const enableJurusanCustom = (kode: string) => {
    const clean = kode.toUpperCase();
    setErrorMsg('');
    setPerJurusan((prev) => {
      if (prev[clean]) return prev;
      return {
        ...prev,
        [clean]: {
          enabledStages: [...ALL_STAGES],
          gradeStage,
        },
      };
    });
    setExpandedJurusanCode(clean);
  };

  const removeJurusanCustom = (kode: string) => {
    const clean = kode.toUpperCase();
    setErrorMsg('');
    setPerJurusan((prev) => {
      const next = { ...prev };
      delete next[clean];
      return next;
    });
    if (expandedJurusanCode === clean) {
      setExpandedJurusanCode(null);
    }
  };

  const applyJurusanPreset = (
    kode: string,
    stages: number[],
    presetGradeStage: number
  ) => {
    const clean = kode.toUpperCase();
    setErrorMsg('');
    setPerJurusan((prev) => ({
      ...prev,
      [clean]: {
        enabledStages: [...stages].sort((a, b) => a - b),
        gradeStage: presetGradeStage,
      },
    }));
  };

  const toggleJurusanStage = (kode: string, stageNum: number) => {
    const clean = kode.toUpperCase();
    setErrorMsg('');
    setPerJurusan((prev) => {
      const curr = prev[clean] || { enabledStages: [...ALL_STAGES], gradeStage };
      const exists = curr.enabledStages.includes(stageNum);
      const nextStages = exists
        ? curr.enabledStages.filter((n) => n !== stageNum)
        : [...curr.enabledStages, stageNum].sort((a, b) => a - b);
      if (nextStages.length === 0) {
        setErrorMsg(`Minimal 1 tahap harus aktif untuk jurusan ${clean}.`);
        return prev;
      }
      let nextGrade = curr.gradeStage ?? gradeStage;
      if (!nextStages.includes(nextGrade)) {
        const candidates = nextStages.filter((n) => n >= 2);
        if (candidates.length > 0) {
          nextGrade = candidates[candidates.length - 1];
        }
      }
      return {
        ...prev,
        [clean]: {
          enabledStages: nextStages,
          gradeStage: nextGrade,
        },
      };
    });
  };

  const updateJurusanGradeStage = (kode: string, nextGrade: number) => {
    const clean = kode.toUpperCase();
    setErrorMsg('');
    setPerJurusan((prev) => {
      const curr = prev[clean] || { enabledStages: [...ALL_STAGES], gradeStage };
      const nextStages = curr.enabledStages.includes(nextGrade)
        ? curr.enabledStages
        : [...curr.enabledStages, nextGrade].sort((a, b) => a - b);
      return {
        ...prev,
        [clean]: {
          enabledStages: nextStages,
          gradeStage: nextGrade,
        },
      };
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSaving(true);
    try {
      const payload: MonitoringStageControl = {
        requireSequential,
        requireIssuedLetter,
        unlockedStages: [...unlockedStages].sort((a, b) => a - b),
        lockedReason: lockedReason.trim().slice(0, 150),
        gradeStage,
        perJurusan,
      };
      const ok = await GoogleSheetClient.getInstance().updateMonitoringStageControl(payload);
      if (ok) {
        PublicPortalClient.invalidateCaches();
        onClose();
      } else {
        setErrorMsg('Gagal menyimpan kebijakan tahap monitoring. Pastikan sesi SuperAdmin aktif.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal menyimpan pengaturan tahap monitoring.');
    } finally {
      setSaving(false);
    }
  };

  const customCount = Object.keys(perJurusan).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-[2px]"
      onClick={() => !saving && onClose()}
    >
      <div
        className="relative bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-3 min-w-0 pr-3">
            <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 truncate">
                Kontrol Tahapan Monitoring &amp; Kebijakan Per Jurusan
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                Atur kunci tahapan global, tahap input nilai PKL, dan jumlah monitoring per kompetensi keahlian
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="w-9 h-9 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/80 flex items-center justify-center transition-colors cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Tutup modal kontrol tahapan"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <TopProgressBar
          active={saving}
          label="Menyimpan kebijakan tahapan monitoring ke Cloud Server"
        />

        {/* Body */}
        <form onSubmit={handleSave} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
            {/* Quick Mode Presets */}
            <div className="space-y-2">
              <label className="block font-bold text-slate-800">
                Preset Cepat Mode Operasional
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={applyTransitionPreset}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    !requireSequential && unlockedStages.length === ALL_STAGES.length
                      ? 'border-blue-600 bg-blue-50/70 text-blue-950'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <Layers className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>Mode Transisi (Manual → App)</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Semua tahap dibuka dan guru bebas langsung mengisi tahap berjalan tanpa mengisi tahap manual sebelumnya.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={applyStrictPreset}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    requireSequential && unlockedStages.length === ALL_STAGES.length
                      ? 'border-blue-600 bg-blue-50/70 text-blue-950'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <ListChecks className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Mode Ketat Berurutan (Tahap Aktif)</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Tahap berikutnya terbuka berurutan setelah tahap aktif sebelumnya untuk siswa tersebut tersimpan.
                  </p>
                </button>
              </div>
            </div>

            {/* Layer 1: Sequential Enforcement Switch */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="font-bold text-slate-900">
                  Wajib Berurutan (Sesuai Tahap Aktif Jurusan)
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  {requireSequential
                    ? 'Aktif — Guru harus mengisi berurutan mengikuti tahapan aktif jurusan siswa tersebut.'
                    : 'Nonaktif (Mode Transisi) — Guru dapat langsung memilih tahap aktif mana saja yang berstatus Terbuka.'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={requireSequential}
                onClick={() => setRequireSequential((v) => !v)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                  requireSequential ? 'bg-blue-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition ${
                    requireSequential ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Layer 1B: Issued Letter Prerequisite Switch */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="font-bold text-slate-900">
                  Wajib Surat Terbit per DUDI &amp; Tahap
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  {requireIssuedLetter
                    ? 'Aktif — Guru hanya dapat mengisi tahap yang surat tugas / pengantar / monitoring-nya sudah ditandai Terbit di Pusat Dokumen.'
                    : 'Nonaktif — Guru dapat langsung mengisi seluruh tahap terbuka tanpa menunggu status penerbitan surat di Pusat Dokumen.'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={requireIssuedLetter}
                onClick={() => setRequireIssuedLetter((v) => !v)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                  requireIssuedLetter ? 'bg-blue-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition ${
                    requireIssuedLetter ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Layer 1C: Default Global Grade Stage */}
            <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Tahap Wajib Input Nilai PKL (Standar Global)</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Menentukan pada tahap mana guru pendamping wajib mengonfirmasi nilai PKL (dapat dioverride berbeda pada tiap jurusan di bawah).
                </p>
              </div>
              <select
                value={gradeStage}
                onChange={(e) => setGradeStage(Number(e.target.value) || 5)}
                aria-label="Tahap Wajib Input Nilai PKL Global"
                className="h-9 px-3 rounded-lg border border-indigo-200 bg-white text-xs font-bold text-indigo-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 cursor-pointer shrink-0"
              >
                {GRADE_CANDIDATE_STAGES.map((st) => (
                  <option key={st.num} value={st.num}>
                    {st.label}
                    {st.num === 5 ? ' (Default)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Layer 2: Global Open / Lock Grid */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-bold text-slate-900">
                    Status Buka / Kunci Global Per Tahap (1 – 8)
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Tahap yang dikunci tidak menerima input baru; riwayat yang sudah tersimpan tetap bisa dilihat (Read-Only).
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMsg('');
                      setUnlockedStages([...ALL_STAGES]);
                    }}
                    className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 cursor-pointer"
                  >
                    Buka Semua
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMsg('');
                      setUnlockedStages([]);
                    }}
                    className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-rose-700 cursor-pointer"
                  >
                    Kunci Semua
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {MONITORING_STAGES.map((st) => {
                  const isUnlocked = unlockedStages.includes(st.num);
                  return (
                    <button
                      key={st.num}
                      type="button"
                      onClick={() => toggleStage(st.num)}
                      className={`min-h-[44px] px-3.5 py-2.5 rounded-xl border text-left transition-all flex items-center justify-between gap-2 cursor-pointer ${
                        isUnlocked
                          ? 'border-emerald-300 bg-emerald-50/70 text-emerald-900 hover:bg-emerald-100/60'
                          : 'border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                      }`}
                    >
                      <span className="font-bold text-xs truncate">
                        {st.label}
                        {st.num === gradeStage ? ' · Nilai' : ''}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold shrink-0 ${
                          isUnlocked
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-600 text-white'
                        }`}
                      >
                        {isUnlocked ? (
                          <>
                            <Unlock className="w-3 h-3" />
                            <span>Terbuka</span>
                          </>
                        ) : (
                          <>
                            <Lock className="w-3 h-3" />
                            <span>Dikunci</span>
                          </>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Layer 3: Per-Jurusan Stage Policy Overrides */}
            <div className="space-y-2.5 pt-2 border-t border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <GraduationCap className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>Pengaturan Khusus Per Jurusan (Opsional)</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Jurusan yang tidak diatur di sini otomatis mengikuti standar global ({unlockedStages.length} tahap, input nilai di Tahap {gradeStage}).
                  </p>
                </div>
                {customCount > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-[11px] font-bold text-blue-800">
                    {customCount} Jurusan Kustom
                  </span>
                )}
              </div>

              <div className="space-y-2">
                {jurusanOptions.map((jur) => {
                  const customPolicy = perJurusan[jur.kode];
                  const isCustom = Boolean(customPolicy);
                  const isExpanded = expandedJurusanCode === jur.kode;
                  const activeStages = customPolicy?.enabledStages || ALL_STAGES;
                  const activeGradeStage = customPolicy?.gradeStage ?? gradeStage;

                  return (
                    <div
                      key={jur.kode}
                      className={`rounded-xl border transition-colors ${
                        isCustom
                          ? 'border-blue-300 bg-blue-50/35'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (!isCustom) {
                              enableJurusanCustom(jur.kode);
                            } else {
                              setExpandedJurusanCode((prev) =>
                                prev === jur.kode ? null : jur.kode
                              );
                            }
                          }}
                          className="flex items-center gap-2 min-w-0 text-left cursor-pointer flex-1"
                        >
                          <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-mono text-[11px] font-bold shrink-0">
                            {jur.kode}
                          </span>
                          <span className="font-semibold text-slate-800 truncate">
                            {jur.nama}
                          </span>
                        </button>

                        <div className="flex items-center gap-2 shrink-0">
                          {isCustom ? (
                            <>
                              <span className="text-[11px] font-bold text-blue-800 bg-blue-100 px-2 py-0.5 rounded-md tabular-nums">
                                {activeStages.length} Tahap · Nilai T{activeGradeStage}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeJurusanCustom(jur.kode)}
                                title="Reset jurusan ke standar global"
                                className="h-7 px-2 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 text-[11px] font-semibold text-slate-600 hover:text-rose-700 inline-flex items-center gap-1 cursor-pointer"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Ikuti Global</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedJurusanCode((prev) =>
                                    prev === jur.kode ? null : jur.kode
                                  )
                                }
                                aria-label={`Ubah tahapan ${jur.kode}`}
                                className="w-7 h-7 rounded-lg border border-blue-200 bg-white hover:bg-blue-50 text-blue-700 flex items-center justify-center cursor-pointer"
                              >
                                {isExpanded ? (
                                  <ChevronUp className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => enableJurusanCustom(jur.kode)}
                              className="h-7 px-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-[11px] font-semibold text-slate-700 hover:text-blue-800 cursor-pointer"
                            >
                              Atur Kustom
                            </button>
                          )}
                        </div>
                      </div>

                      {isCustom && isExpanded && (
                        <div className="px-3.5 pb-3.5 pt-2 border-t border-blue-200/70 space-y-3 bg-white/80 rounded-b-xl">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[11px] font-semibold text-slate-500">
                                Preset:
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  applyJurusanPreset(jur.kode, [1, 2, 3, 4, 8], 4)
                                }
                                className="px-2 py-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-blue-50 text-[11px] font-semibold text-slate-700 cursor-pointer"
                              >
                                5 Tahap (1–4 &amp; Penarikan)
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  applyJurusanPreset(jur.kode, [1, 2, 3, 4, 5, 8], 5)
                                }
                                className="px-2 py-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-blue-50 text-[11px] font-semibold text-slate-700 cursor-pointer"
                              >
                                6 Tahap (1–5 &amp; Penarikan)
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  applyJurusanPreset(jur.kode, ALL_STAGES, gradeStage)
                                }
                                className="px-2 py-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-blue-50 text-[11px] font-semibold text-slate-700 cursor-pointer"
                              >
                                8 Tahap Penuh
                              </button>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <label className="text-[11px] font-semibold text-slate-600">
                                Input Nilai:
                              </label>
                              <select
                                value={activeGradeStage}
                                onChange={(e) =>
                                  updateJurusanGradeStage(
                                    jur.kode,
                                    Number(e.target.value) || gradeStage
                                  )
                                }
                                className="h-7 px-2 rounded-md border border-slate-300 bg-white text-[11px] font-bold text-slate-800 cursor-pointer"
                              >
                                {GRADE_CANDIDATE_STAGES.filter((s) =>
                                  activeStages.includes(s.num)
                                ).map((s) => (
                                  <option key={s.num} value={s.num}>
                                    {s.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                            {MONITORING_STAGES.map((st) => {
                              const enabled = activeStages.includes(st.num);
                              const isGradeSt = activeGradeStage === st.num;
                              return (
                                <button
                                  key={`${jur.kode}_${st.num}`}
                                  type="button"
                                  onClick={() => toggleJurusanStage(jur.kode, st.num)}
                                  className={`px-2.5 py-2 rounded-lg border text-left text-[11px] font-semibold transition-all cursor-pointer flex items-center justify-between gap-1 ${
                                    enabled
                                      ? 'border-blue-400 bg-blue-50 text-blue-900'
                                      : 'border-slate-200 bg-slate-50 text-slate-400 line-through'
                                  }`}
                                >
                                  <span className="truncate">
                                    {st.label}
                                    {isGradeSt ? ' ★' : ''}
                                  </span>
                                  <span
                                    className={`w-2 h-2 rounded-full shrink-0 ${
                                      enabled ? 'bg-blue-600' : 'bg-slate-300'
                                    }`}
                                  />
                                </button>
                              );
                            })}
                          </div>
                          <p className="text-[10px] text-slate-500">
                            ★ Menandai tahap wajib konfirmasi nilai PKL untuk jurusan {jur.kode}. Tahap yang tidak dipilih tidak akan muncul di portal guru &amp; rekap jurusan ini.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Optional Locked Reason */}
            <div>
              <label className="block font-bold text-slate-800 mb-1.5">
                Catatan / Alasan Penguncian (Opsional, maks. 150 karakter)
              </label>
              <input
                type="text"
                maxLength={150}
                value={lockedReason}
                onChange={(e) => setLockedReason(e.target.value)}
                placeholder="Contoh: Tahap 1-3 sudah dicatat manual; fokus pengisian Mon 3 mulai minggu ini."
                className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
              <div className="text-[11px] text-slate-400 mt-1 text-right tabular-nums">
                {lockedReason.length}/150
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-2 text-xs text-rose-700">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 shrink-0 text-xs">
            <span className="text-[11px] text-slate-500">
              {unlockedStages.length}/8 global · Nilai Tahap {gradeStage} ·{' '}
              {customCount > 0 ? `${customCount} jurusan kustom` : 'Semua jurusan ikut global'}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={onClose}
                className="h-9 px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="h-9 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Simpan Kebijakan</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

        <CrudLoadingOverlay
          visible={saving}
          title="Menyimpan Kebijakan Tahap ke Cloud Server..."
          subtitle="Kebijakan baru dan aturan per jurusan akan langsung diterapkan pada Portal Monitoring Guru & Rekap."
        />
      </div>
    </div>
  );
};
