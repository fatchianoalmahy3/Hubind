import React, { useEffect, useState } from 'react';
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
} from 'lucide-react';
import {
  DEFAULT_MONITORING_STAGE_CONTROL,
  MONITORING_STAGES,
  type MonitoringStageControl,
} from '../core/types/schema';
import { GoogleSheetClient } from '../core/GoogleSheetClient';
import { PublicPortalClient } from '../core/PublicPortalClient';
import { CrudLoadingOverlay, TopProgressBar } from './CrudProgressFeedback';

interface MonitoringStageControlModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ALL_STAGES = MONITORING_STAGES.map((s) => s.num);

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
  const [lockedReason, setLockedReason] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;
    const current = GoogleSheetClient.getInstance().getMonitoringStageControl();
    setRequireSequential(current.requireSequential);
    setRequireIssuedLetter(current.requireIssuedLetter ?? true);
    setUnlockedStages([...current.unlockedStages]);
    setLockedReason(current.lockedReason || '');
    setErrorMsg('');
  }, [isOpen]);

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-[2px]"
      onClick={() => !saving && onClose()}
    >
      <div
        className="relative bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
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
                Kontrol Kunci &amp; Buka Tahapan Monitoring
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                Kebijakan global SuperAdmin untuk Portal Monitoring Guru Pendamping
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
                    Semua tahap dibuka dan guru bebas langsung mengisi tahap berjalan (misal Mon 3 / Mon 4) tanpa mengisi tahap manual sebelumnya.
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
                    <span>Mode Ketat Berurutan (1 → 8)</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Tahap N hanya terbuka apabila tahap N-1 untuk siswa tersebut sudah tersimpan di aplikasi.
                  </p>
                </button>
              </div>
            </div>

            {/* Layer 1: Sequential Enforcement Switch */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="font-bold text-slate-900">
                  Wajib Berurutan (Tahap N-1 harus terisi)
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  {requireSequential
                    ? 'Aktif — Guru harus mengisi berurutan mulai Pengantaran hingga Penarikan.'
                    : 'Nonaktif (Mode Transisi) — Guru dapat langsung memilih tahap mana saja yang berstatus Terbuka.'}
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
                  Wajib Surat Terbit per DUDI &amp; Tahap (1 – 8)
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  {requireIssuedLetter
                    ? 'Aktif — Guru hanya dapat mengisi tahap yang surat tugas / pengantar / monitoring-nya sudah ditandai Terbit (cetak / PDF Drive) di Pusat Dokumen.'
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

            {/* Layer 2: Per-Stage Open / Lock Grid */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-bold text-slate-900">
                    Status Buka / Kunci Per Tahap (1 – 8)
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
                      <span className="font-bold text-xs truncate">{st.value}</span>
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
          <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-2 shrink-0 text-xs">
            <span className="text-[11px] text-slate-500">
              {unlockedStages.length}/8 tahap terbuka · {requireSequential ? 'Berurutan' : 'Transisi'} ·{' '}
              {requireIssuedLetter ? 'Wajib Surat Terbit' : 'Tanpa Kunci Surat'}
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
          subtitle="Kebijakan baru akan langsung diterapkan pada Portal Monitoring Guru."
        />
      </div>
    </div>
  );
};
