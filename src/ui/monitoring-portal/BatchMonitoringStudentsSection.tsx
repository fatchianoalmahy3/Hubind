import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Loader2,
  Lock,
  Mic,
  MicOff,
  Minus,
  Pencil,
  Plus,
  Save,
  Search,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import type { MonitoringStageControl } from '../../core/types/schema';
import {
  calculateEqualWeightedAverage,
  formatBukuLaporanLabel,
  getPredikatFromScore,
  getPreviousEnabledStage,
  getStageValueByNumber,
  normalizeMonitoringVerificationStatus,
  resolveMonitoringStagePolicy,
} from '../../core/utils/monitoringHelpers';
import { formatNisVisual } from '../../core/utils/nisHelpers';
import { appendVoiceTranscript } from '../../hooks/useVoiceDictation';
import { Format0701InspectionSection } from './Format0701InspectionSection';
import { GradeScoreEditorGrid } from './GradeScoreEditorGrid';
import { SignaturePadInput } from './SignaturePadInput';
import {
  CATATAN_QUICK_PRESETS,
  DEFAULT_DRAFT,
  getStudentKey,
  type GradeScoresDraft,
  type StudentStageDraft,
} from './types';

interface BatchMonitoringStudentsSectionProps {
  selectedDudi: any;
  dudiStudents: any[];
  activeStageNum: number;
  stageControl: MonitoringStageControl;
  issuedStages: number[];
  draftsByKey: Record<string, StudentStageDraft>;
  batchSelectedKeys: string[];
  editUnlockedKeys: Record<string, boolean>;
  gradeEditDrafts: Record<string, GradeScoresDraft>;
  editingGradeByStudent: Record<string, boolean>;
  savingGradeEdit: boolean;
  focusedStudentKey?: string;
  onToggleBatchStudent: (stuKey: string) => void;
  onSelectAllPending: () => void;
  onClearBatchSelection: () => void;
  onApplyBatchStandardAll: () => void;
  onUpdateStudentDraft: (stuKey: string, patch: Partial<StudentStageDraft>) => void;
  onApplyStudentStandard: (stuKey: string) => void;
  onRequestUnlockStudentEdit: (stu: any, idx: number) => void;
  onStartEditGrade: (stu: any, stuKey: string) => void;
  onCancelEditGrade: (stuKey: string) => void;
  onUpdateGradeEditDraft: (
    stuKey: string,
    base: GradeScoresDraft,
    patch: Partial<GradeScoresDraft>
  ) => void;
  onSaveEditedGrades: (stu: any, idx: number, stuKey: string) => void;
  voiceSupported: boolean;
  voiceActiveFieldId: string | null;
  voiceInterimText: string;
  voiceError: string;
  onToggleVoice: (fieldId: string, onFinal: (spoken: string) => void) => void;
}

export const BatchMonitoringStudentsSection: React.FC<BatchMonitoringStudentsSectionProps> = ({
  selectedDudi,
  dudiStudents,
  activeStageNum,
  stageControl,
  issuedStages,
  draftsByKey,
  batchSelectedKeys,
  editUnlockedKeys,
  gradeEditDrafts,
  editingGradeByStudent,
  savingGradeEdit,
  focusedStudentKey = '',
  onToggleBatchStudent,
  onSelectAllPending,
  onClearBatchSelection,
  onApplyBatchStandardAll,
  onUpdateStudentDraft,
  onApplyStudentStandard,
  onRequestUnlockStudentEdit,
  onStartEditGrade,
  onCancelEditGrade,
  onUpdateGradeEditDraft,
  onSaveEditedGrades,
  voiceSupported,
  voiceActiveFieldId,
  voiceInterimText,
  voiceError,
  onToggleVoice,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const contextKey = `${selectedDudi?.id || selectedDudi?.nama || ''}::${activeStageNum}`;
  const prevContextRef = useRef('');
  const prevUnlockedRef = useRef<Record<string, boolean>>(editUnlockedKeys);

  const studentMetaList = useMemo(() => {
    const isLetterIssued =
      stageControl.requireIssuedLetter === false || issuedStages.includes(activeStageNum);

    return dudiStudents.map((stu, idx) => {
      const stuKey = getStudentKey(stu, idx);
      const stuPolicy =
        stu.stagePolicy || resolveMonitoringStagePolicy(stageControl, stu.jurusan);
      const isEnabled = stuPolicy.enabledStages.includes(activeStageNum);
      const isGlobalUnlocked = isEnabled && stuPolicy.unlockedStages.includes(activeStageNum);
      const prevStage = getPreviousEnabledStage(stuPolicy.enabledStages, activeStageNum);
      const completedArr: number[] = Array.isArray(stu.completedStages)
        ? stu.completedStages
        : [];
      const isSequentialLocked =
        isGlobalUnlocked &&
        isLetterIssued &&
        stageControl.requireSequential &&
        prevStage !== null &&
        !completedArr.includes(prevStage);
      const isCompleted = completedArr.includes(activeStageNum);
      const lockKey = `${stuKey}::${activeStageNum}`;
      const isEditUnlocked = Boolean(editUnlockedKeys[lockKey]);
      const isEditable =
        isGlobalUnlocked &&
        isLetterIssued &&
        !isSequentialLocked &&
        (!isCompleted || isEditUnlocked);
      const isChecked = isEditable && batchSelectedKeys.includes(stuKey);
      const draft: StudentStageDraft =
        draftsByKey[`${stuKey}::${activeStageNum}`] || DEFAULT_DRAFT;
      const alreadyHasGrade = Boolean(stu.hasSubmittedGrades);
      const canInputGradeThisStage = !alreadyHasGrade && activeStageNum >= stuPolicy.gradeStage;
      const needsGradeDecision =
        activeStageNum === stuPolicy.gradeStage &&
        !alreadyHasGrade &&
        draft.nilaiPklMuncul === null;
      const needsGradeScores =
        canInputGradeThisStage &&
        draft.nilaiPklMuncul === true &&
        [
          draft.nilaiK3lh,
          draft.nilaiSoftskill,
          draft.nilaiKompetensiTeknis,
          draft.nilaiAlurBisnis,
        ].some((v) => !Number.isFinite(v) || v < 1 || v > 100);
      const needsTtd =
        stageControl.requireStudentSignature === true &&
        (!draft.ttdSiswa || !draft.ttdSiswa.startsWith('svgpath:'));
      const needsChecklist =
        !draft.bukuLaporan ||
        !draft.aktivitasDp ||
        !draft.aktivitasMt ||
        !draft.aktivitasKrt;

      return {
        stu,
        idx,
        stuKey,
        stuPolicy,
        isEnabled,
        isGlobalUnlocked,
        isLetterIssued,
        prevStage,
        isSequentialLocked,
        isCompleted,
        isEditUnlocked,
        isEditable,
        isChecked,
        draft,
        alreadyHasGrade,
        canInputGradeThisStage,
        needsGradeDecision,
        needsGradeScores,
        needsTtd,
        needsChecklist,
      };
    });
  }, [dudiStudents, activeStageNum, stageControl, issuedStages, editUnlockedKeys, batchSelectedKeys, draftsByKey]);

  useEffect(() => {
    if (prevContextRef.current !== contextKey) {
      prevContextRef.current = contextKey;
      setSearchQuery('');
      const pendingEditable = studentMetaList.filter((m) => m.isEditable && !m.isCompleted);
      const nextExpanded: Record<string, boolean> = {};
      if (pendingEditable.length <= 3) {
        pendingEditable.forEach((m) => {
          nextExpanded[m.stuKey] = true;
        });
      } else if (pendingEditable.length > 0) {
        nextExpanded[pendingEditable[0].stuKey] = true;
      }
      if (focusedStudentKey) {
        nextExpanded[focusedStudentKey] = true;
      }
      setExpandedKeys(nextExpanded);
    }
  }, [contextKey, studentMetaList, focusedStudentKey]);

  // Auto-expand student card when unlocked via Edit confirmation modal
  useEffect(() => {
    const prevMap = prevUnlockedRef.current;
    const newlyUnlockedStudentKeys: string[] = [];
    studentMetaList.forEach((m) => {
      const k = `${m.stuKey}::${activeStageNum}`;
      if (editUnlockedKeys[k] && !prevMap[k]) {
        newlyUnlockedStudentKeys.push(m.stuKey);
      }
    });
    prevUnlockedRef.current = editUnlockedKeys;
    if (newlyUnlockedStudentKeys.length > 0) {
      setExpandedKeys((prev) => {
        const next = { ...prev };
        newlyUnlockedStudentKeys.forEach((sk) => {
          next[sk] = true;
        });
        return next;
      });
    }
  }, [editUnlockedKeys, activeStageNum, studentMetaList]);

  useEffect(() => {
    if (focusedStudentKey) {
      setExpandedKeys((prev) => ({ ...prev, [focusedStudentKey]: true }));
    }
  }, [focusedStudentKey]);

  const editableList = studentMetaList.filter((m) => m.isEditable);
  const selectedEditableCount = studentMetaList.filter((m) => m.isChecked).length;
  const anyExpanded = studentMetaList.some((m) => expandedKeys[m.stuKey]);

  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return studentMetaList;
    return studentMetaList.filter((m) => {
      const hay = `${m.stu.nama || ''} ${m.stu.nis || ''} ${m.stu.kelas || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [studentMetaList, searchQuery]);

  const toggleExpandAll = () => {
    if (anyExpanded) {
      setExpandedKeys({});
    } else {
      const all: Record<string, boolean> = {};
      studentMetaList.forEach((m) => {
        all[m.stuKey] = true;
      });
      setExpandedKeys(all);
    }
  };

  return (
    <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200 bg-white space-y-3">
      {/* Batch Toolbar Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-900">
            <Users className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              Blok 2 · Daftar Siswa Tahap {activeStageNum} ({selectedEditableCount}/
              {dudiStudents.length} dipilih)
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Centang siswa yang dipantau pada kunjungan ini, lalu tekan 1× Simpan di bagian bawah.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {editableList.length > 0 && (
            <button
              type="button"
              onClick={onApplyBatchStandardAll}
              className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-[11px] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>Samakan Semua: Sudah Dikerjakan &amp; Baik</span>
            </button>
          )}
          <button
            type="button"
            onClick={toggleExpandAll}
            className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-[11px] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
          >
            {anyExpanded ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Ringkas Semua</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Buka Semua</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Quick Selection & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-2">
          {editableList.length > 0 && (
            <>
              <button
                type="button"
                onClick={onSelectAllPending}
                className="font-semibold text-blue-700 hover:text-blue-800 cursor-pointer underline-offset-2 hover:underline"
              >
                Pilih Semua Siap ({editableList.length})
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={onClearBatchSelection}
                className="font-semibold text-slate-500 hover:text-slate-700 cursor-pointer underline-offset-2 hover:underline"
              >
                Kosongkan Pilihan
              </button>
            </>
          )}
        </div>

        {dudiStudents.length > 5 && (
          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama / NIS siswa..."
              className="w-full min-h-[34px] pl-8 pr-7 py-1 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Hapus pencarian siswa"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Student Batch List */}
      <div className="space-y-2.5">
        {filteredList.length === 0 ? (
          <div className="p-4 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-500">
            Tidak ada siswa yang cocok dengan pencarian &ldquo;{searchQuery}&rdquo;.
          </div>
        ) : (
          filteredList.map((m) => {
            const {
              stu,
              idx,
              stuKey,
              stuPolicy,
              isEnabled,
              isGlobalUnlocked,
              isLetterIssued,
              prevStage,
              isSequentialLocked,
              isCompleted,
              isEditUnlocked,
              isEditable,
              isChecked,
              draft,
              alreadyHasGrade,
              canInputGradeThisStage,
              needsGradeDecision,
              needsGradeScores,
              needsTtd,
              needsChecklist,
            } = m;

            const isExpanded = Boolean(expandedKeys[stuKey]);
            const stageLog = stu.stageLogs?.[activeStageNum];
            const normStatus = isCompleted
              ? normalizeMonitoringVerificationStatus(stageLog?.status)
              : 'Belum Terlaksana';
            const isReadOnlyStudent = !isEditable;
            const showGradeInputs = canInputGradeThisStage && draft.nilaiPklMuncul === true;
            const rataRataNilai = calculateEqualWeightedAverage(
              draft.nilaiK3lh,
              draft.nilaiSoftskill,
              draft.nilaiKompetensiTeknis,
              draft.nilaiAlurBisnis
            );
            const predikatNilai = getPredikatFromScore(rataRataNilai);

            const baseEditDraft: GradeScoresDraft = gradeEditDrafts[stuKey] || {
              nilaiK3lh: Number(stu.submittedGradeSummary?.k3lh ?? 0) || 0,
              nilaiSoftskill: Number(stu.submittedGradeSummary?.softskill ?? 0) || 0,
              nilaiKompetensiTeknis: Number(stu.submittedGradeSummary?.teknis ?? 0) || 0,
              nilaiAlurBisnis: Number(stu.submittedGradeSummary?.alurBisnis ?? 0) || 0,
            };
            const isEditingThisGrade = Boolean(editingGradeByStudent[stuKey]);
            const rataRataEditNilai = calculateEqualWeightedAverage(
              baseEditDraft.nilaiK3lh,
              baseEditDraft.nilaiSoftskill,
              baseEditDraft.nilaiKompetensiTeknis,
              baseEditDraft.nilaiAlurBisnis
            );
            const predikatEditNilai = getPredikatFromScore(rataRataEditNilai);

            const isStudentReady =
              isChecked &&
              !needsChecklist &&
              !needsTtd &&
              !needsGradeDecision &&
              !needsGradeScores;

            return (
              <div
                key={stuKey}
                className={`rounded-xl border transition-all overflow-hidden ${
                  isChecked
                    ? isStudentReady
                      ? 'border-emerald-300 bg-emerald-50/20'
                      : 'border-blue-300 bg-blue-50/20'
                    : isCompleted
                    ? 'border-slate-200 bg-slate-50/60'
                    : 'border-slate-200 bg-white'
                }`}
              >
                {/* Compact Student Batch Header */}
                <div className="p-2.5 sm:px-3.5 sm:py-2.5 flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    {isEditable ? (
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => onToggleBatchStudent(stuKey)}
                        aria-label={`Pilih ${stu.nama}`}
                        className="mt-1 rounded text-blue-600 focus:ring-blue-500 w-4 h-4 shrink-0 cursor-pointer"
                      />
                    ) : (
                      <div className="mt-1 w-4 h-4 flex items-center justify-center shrink-0 text-slate-400">
                        {isCompleted && !isEditUnlocked ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Lock className="w-3.5 h-3.5 text-slate-400" />
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        setExpandedKeys((prev) => ({
                          ...prev,
                          [stuKey]: !prev[stuKey],
                        }))
                      }
                      className="min-w-0 flex-1 text-left cursor-pointer group"
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-blue-700 transition-colors leading-snug">
                          {stu.nama}
                        </span>
                        {!isEnabled ? (
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-semibold text-slate-500">
                            Tidak termasuk jurusan
                          </span>
                        ) : !isGlobalUnlocked ? (
                          <span className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-[10px] font-semibold text-amber-800">
                            Dikunci Admin
                          </span>
                        ) : !isLetterIssued ? (
                          <span className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-[10px] font-semibold text-amber-800">
                            Surat Belum Terbit
                          </span>
                        ) : isSequentialLocked && prevStage !== null ? (
                          <span className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-[10px] font-semibold text-amber-800">
                            Selesaikan Tahap {prevStage} dulu
                          </span>
                        ) : isCompleted && !isEditUnlocked ? (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-700">
                            {normStatus === 'Tervalidasi Hubin'
                              ? 'Tervalidasi Hubin'
                              : normStatus === 'Tervalidasi Kakomli'
                              ? 'Tervalidasi Kakomli'
                              : 'Tersimpan'}
                          </span>
                        ) : isEditUnlocked ? (
                          <span className="px-1.5 py-0.5 rounded bg-blue-100 border border-blue-200 text-[10px] font-bold text-blue-800">
                            Mode Edit
                          </span>
                        ) : isStudentReady ? (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-100 border border-emerald-200 text-[10px] font-bold text-emerald-800">
                            Siap Simpan
                          </span>
                        ) : isChecked ? (
                          <span className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-[10px] font-bold text-amber-800">
                            {needsChecklist
                              ? 'Perlu Ceklist'
                              : needsTtd
                              ? 'Perlu TTD Siswa'
                              : 'Perlu Nilai PKL'}
                          </span>
                        ) : null}
                      </div>

                      <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
                        <span className="font-mono">
                          NIS: {formatNisVisual(stu.nis)} · {stu.kelas}
                        </span>
                        {(draft.bukuLaporan || isCompleted) && (
                          <span className="text-slate-700 font-medium">
                            · Sakit:{draft.sakit} Izin:{draft.izin} Alpha:{draft.alpha} ·{' '}
                            {formatBukuLaporanLabel(draft.bukuLaporan)}
                          </span>
                        )}
                        {alreadyHasGrade && stu.submittedGradeSummary?.rataRata && (
                          <span className="text-emerald-700 font-bold">
                            · Nilai: {stu.submittedGradeSummary.rataRata}
                          </span>
                        )}
                      </div>
                    </button>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {isCompleted && !isEditUnlocked && isGlobalUnlocked && isLetterIssued && (
                      <button
                        type="button"
                        onClick={() => onRequestUnlockStudentEdit(stu, idx)}
                        className="min-h-[32px] px-2.5 py-1 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>Edit</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedKeys((prev) => ({
                          ...prev,
                          [stuKey]: !prev[stuKey],
                        }))
                      }
                      aria-expanded={isExpanded}
                      aria-label={isExpanded ? `Ringkas ${stu.nama}` : `Buka detail ${stu.nama}`}
                      className="min-w-[34px] min-h-[34px] rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 flex items-center justify-center cursor-pointer"
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Per-Student Detail Form */}
                {isExpanded && (
                  <div className="px-3 pb-3.5 pt-2.5 sm:px-4 sm:pb-4 border-t border-slate-200/80 bg-slate-50/40 space-y-3">
                    {isReadOnlyStudent && (
                      <div className="p-2.5 rounded-xl bg-amber-50/90 border border-amber-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-amber-900">
                        <span className="font-semibold">
                          {isCompleted && isGlobalUnlocked && isLetterIssued
                            ? 'Data tahap ini sudah tersimpan (Baca-Saja). Klik "Edit" bila ingin merevisi.'
                            : !isGlobalUnlocked
                            ? 'Tahap dikunci Admin (Baca-Saja).'
                            : !isLetterIssued
                            ? 'Surat tahap ini belum terbit (Baca-Saja).'
                            : `Selesaikan Tahap ${prevStage ?? activeStageNum - 1} terlebih dahulu.`}
                        </span>
                        {isCompleted && !isEditUnlocked && isGlobalUnlocked && isLetterIssued && (
                          <button
                            type="button"
                            onClick={() => onRequestUnlockStudentEdit(stu, idx)}
                            className="px-2.5 py-1 rounded-lg bg-white border border-blue-300 text-blue-700 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>Edit Data</span>
                          </button>
                        )}
                      </div>
                    )}

                    {/* Absensi (Sakit, Izin, Alpha) */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                        <ClipboardCheck className="w-4 h-4 text-blue-600 shrink-0" />
                        <span>Absensi (Sakit, Izin, Alpha)</span>
                      </div>
                      <div className="flex flex-col gap-2 sm:grid sm:grid-cols-3 sm:gap-2.5">
                        {(
                          [
                            {
                              key: 'sakit',
                              label: 'Sakit',
                              accent: 'text-amber-700',
                              dot: 'bg-amber-500',
                            },
                            {
                              key: 'izin',
                              label: 'Izin',
                              accent: 'text-blue-700',
                              dot: 'bg-blue-500',
                            },
                            {
                              key: 'alpha',
                              label: 'Alpha',
                              accent: 'text-rose-700',
                              dot: 'bg-rose-500',
                            },
                          ] as const
                        ).map((item) => {
                          const val = draft[item.key];
                          return (
                            <div
                              key={item.key}
                              className="p-2.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-2 sm:block sm:space-y-1.5"
                            >
                              <label
                                className={`flex items-center sm:block gap-2 text-xs font-bold ${item.accent}`}
                              >
                                <span
                                  className={`sm:hidden w-2 h-2 rounded-full ${item.dot} shrink-0`}
                                />
                                <span>{item.label} (Hari)</span>
                              </label>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  disabled={isReadOnlyStudent}
                                  aria-label={`Kurangi ${item.label} ${stu.nama}`}
                                  onClick={() =>
                                    onUpdateStudentDraft(stuKey, {
                                      [item.key]: Math.max(0, val - 1),
                                    })
                                  }
                                  className="min-w-[42px] min-h-[42px] rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <Minus className="w-4 h-4" />
                                </button>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  min={0}
                                  max={90}
                                  disabled={isReadOnlyStudent}
                                  aria-label={`${item.label} ${stu.nama}`}
                                  value={val}
                                  onChange={(e) => {
                                    const parsed = Math.max(
                                      0,
                                      Math.min(90, Math.round(Number(e.target.value) || 0))
                                    );
                                    onUpdateStudentDraft(stuKey, { [item.key]: parsed });
                                  }}
                                  className="w-12 sm:w-full sm:flex-1 min-h-[42px] text-center font-mono tabular-nums text-sm font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:bg-slate-100 disabled:text-slate-500"
                                />
                                <button
                                  type="button"
                                  disabled={isReadOnlyStudent}
                                  aria-label={`Tambah ${item.label} ${stu.nama}`}
                                  onClick={() =>
                                    onUpdateStudentDraft(stuKey, {
                                      [item.key]: Math.min(90, val + 1),
                                    })
                                  }
                                  className="min-w-[42px] min-h-[42px] rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {stageControl.requireStudentSignature === true && (
                        <SignaturePadInput
                          value={draft.ttdSiswa}
                          studentName={stu.nama}
                          disabled={isReadOnlyStudent}
                          onChange={(nextSvg) => onUpdateStudentDraft(stuKey, { ttdSiswa: nextSvg })}
                        />
                      )}
                    </div>

                    {/* Buku Laporan & Sikap (Zero Abbreviations) */}
                    <Format0701InspectionSection
                      bukuLaporan={draft.bukuLaporan}
                      aktivitasDp={draft.aktivitasDp}
                      aktivitasMt={draft.aktivitasMt}
                      aktivitasKrt={draft.aktivitasKrt}
                      disabled={isReadOnlyStudent}
                      onApplyStandardAll={() => onApplyStudentStandard(stuKey)}
                      onChangeBukuLaporan={(val) =>
                        onUpdateStudentDraft(stuKey, { bukuLaporan: val })
                      }
                      onChangeAktivitas={(field, val) =>
                        onUpdateStudentDraft(stuKey, { [field]: val })
                      }
                    />

                    {/* Nilai PKL (If applicable for student & stage) */}
                    {alreadyHasGrade ? (
                      <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2.5 text-xs text-emerald-900">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>Nilai PKL Sudah Terinput</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {stu.submittedGradeSummary?.rataRata ? (
                              <span className="font-mono tabular-nums font-bold text-emerald-800">
                                Rata-rata: {stu.submittedGradeSummary.rataRata}
                              </span>
                            ) : null}
                            {!isEditingThisGrade && !isReadOnlyStudent && (
                              <button
                                type="button"
                                onClick={() => onStartEditGrade(stu, stuKey)}
                                className="min-h-[32px] px-2.5 py-1 rounded-lg bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-800 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Pencil className="w-3 h-3" />
                                <span>Edit Nilai</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {!isEditingThisGrade ? (
                          stu.submittedGradeSummary?.k3lh !== null &&
                          stu.submittedGradeSummary?.k3lh !== undefined && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 font-mono tabular-nums text-[11px]">
                              <div className="p-2 bg-white/80 rounded-lg border border-emerald-200/70">
                                <span className="text-slate-500 block font-sans">K3LH</span>
                                <b>{stu.submittedGradeSummary.k3lh}</b>
                              </div>
                              <div className="p-2 bg-white/80 rounded-lg border border-emerald-200/70">
                                <span className="text-slate-500 block font-sans">Softskills</span>
                                <b>{stu.submittedGradeSummary.softskill}</b>
                              </div>
                              <div className="p-2 bg-white/80 rounded-lg border border-emerald-200/70">
                                <span className="text-slate-500 block font-sans">Hardskills</span>
                                <b>{stu.submittedGradeSummary.teknis}</b>
                              </div>
                              <div className="p-2 bg-white/80 rounded-lg border border-emerald-200/70">
                                <span className="text-slate-500 block font-sans">Alur Bisnis</span>
                                <b>{stu.submittedGradeSummary.alurBisnis}</b>
                              </div>
                            </div>
                          )
                        ) : (
                          <>
                            <GradeScoreEditorGrid
                              variant="edit"
                              scores={baseEditDraft}
                              rataRata={rataRataEditNilai}
                              predikat={predikatEditNilai}
                              disabled={savingGradeEdit}
                              onChange={(patch) =>
                                onUpdateGradeEditDraft(stuKey, baseEditDraft, patch)
                              }
                            />
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <button
                                type="button"
                                disabled={savingGradeEdit}
                                onClick={() => onCancelEditGrade(stuKey)}
                                className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs cursor-pointer"
                              >
                                Batal
                              </button>
                              <button
                                type="button"
                                disabled={savingGradeEdit}
                                onClick={() => onSaveEditedGrades(stu, idx, stuKey)}
                                className="min-h-[38px] px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                              >
                                {savingGradeEdit ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Save className="w-3.5 h-3.5" />
                                )}
                                <span>
                                  {savingGradeEdit ? 'Menyimpan...' : 'Simpan Perubahan Nilai'}
                                </span>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      canInputGradeThisStage && (
                        <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-3">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                              <Award className="w-4 h-4 text-blue-600 shrink-0" />
                              <span>Apakah nilai PKL sudah muncul?</span>
                            </div>
                            <p className="text-[11px] text-slate-500">
                              {activeStageNum === stuPolicy.gradeStage
                                ? `Wajib dijawab pada ${getStageValueByNumber(stuPolicy.gradeStage)}. Jika belum muncul, dapat diisi di tahap berikutnya.`
                                : `Nilai belum tercatat sebelumnya. Pilih "Ya" bila nilai sudah keluar pada ${getStageValueByNumber(activeStageNum)}.`}
                            </p>
                            <div className="grid grid-cols-2 gap-2 pt-0.5">
                              <button
                                type="button"
                                disabled={isReadOnlyStudent}
                                onClick={() =>
                                  onUpdateStudentDraft(stuKey, { nilaiPklMuncul: false })
                                }
                                className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer disabled:opacity-50 ${
                                  draft.nilaiPklMuncul === false
                                    ? 'border-slate-800 bg-slate-800 text-white'
                                    : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                Belum Muncul
                              </button>
                              <button
                                type="button"
                                disabled={isReadOnlyStudent}
                                onClick={() =>
                                  onUpdateStudentDraft(stuKey, { nilaiPklMuncul: true })
                                }
                                className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer disabled:opacity-50 ${
                                  draft.nilaiPklMuncul === true
                                    ? 'border-blue-600 bg-blue-600 text-white'
                                    : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                Ya, Sudah Muncul
                              </button>
                            </div>
                          </div>

                          {showGradeInputs && (
                            <GradeScoreEditorGrid
                              variant="initial"
                              scores={{
                                nilaiK3lh: draft.nilaiK3lh,
                                nilaiSoftskill: draft.nilaiSoftskill,
                                nilaiKompetensiTeknis: draft.nilaiKompetensiTeknis,
                                nilaiAlurBisnis: draft.nilaiAlurBisnis,
                              }}
                              rataRata={rataRataNilai}
                              predikat={predikatNilai}
                              disabled={isReadOnlyStudent}
                              onChange={(patch) => onUpdateStudentDraft(stuKey, patch)}
                            />
                          )}
                        </div>
                      )
                    )}

                    {/* Catatan Siswa + Dikte Suara */}
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="text-xs font-semibold text-slate-700">
                          Catatan Siswa ({stu.nama}) — Opsional:
                        </label>
                        {!isReadOnlyStudent && (
                          <button
                            type="button"
                            onClick={() =>
                              onToggleVoice(`catatan_${stuKey}`, (spoken) =>
                                onUpdateStudentDraft(stuKey, {
                                  catatanPerkembangan: appendVoiceTranscript(
                                    draft.catatanPerkembangan,
                                    spoken
                                  ),
                                })
                              )
                            }
                            title={
                              voiceSupported
                                ? 'Dikte catatan dengan suara Bahasa Indonesia'
                                : 'Browser tidak mendukung dikte suara'
                            }
                            className={`min-h-[30px] px-2.5 py-1 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer ${
                              voiceActiveFieldId === `catatan_${stuKey}`
                                ? 'border-rose-500 bg-rose-600 text-white animate-pulse'
                                : 'border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700'
                            }`}
                          >
                            {voiceActiveFieldId === `catatan_${stuKey}` ? (
                              <>
                                <MicOff className="w-3 h-3" />
                                <span>Stop Dikte</span>
                              </>
                            ) : (
                              <>
                                <Mic className="w-3 h-3" />
                                <span>Dikte Suara</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>

                      {voiceActiveFieldId === `catatan_${stuKey}` && (
                        <p className="text-[11px] font-medium text-rose-700 flex items-center gap-1.5 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">
                          <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping shrink-0" />
                          <span>
                            {voiceInterimText
                              ? `Mendengarkan: "${voiceInterimText}"`
                              : 'Silakan ucapkan catatan siswa...'}
                          </span>
                        </p>
                      )}

                      {voiceActiveFieldId === `catatan_${stuKey}` && voiceError && (
                        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                          {voiceError}
                        </p>
                      )}

                      <textarea
                        rows={2}
                        disabled={isReadOnlyStudent}
                        value={draft.catatanPerkembangan}
                        onChange={(e) =>
                          onUpdateStudentDraft(stuKey, {
                            catatanPerkembangan: e.target.value,
                          })
                        }
                        placeholder="Catatan kondisi siswa atau kendala lapangan (opsional)..."
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:bg-slate-100 disabled:text-slate-500"
                      />

                      {!isReadOnlyStudent && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {CATATAN_QUICK_PRESETS.map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() =>
                                onUpdateStudentDraft(stuKey, {
                                  catatanPerkembangan: appendVoiceTranscript(
                                    draft.catatanPerkembangan,
                                    preset
                                  ),
                                })
                              }
                              className="px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-[10px] font-medium text-slate-700 cursor-pointer text-left"
                            >
                              + {preset}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
