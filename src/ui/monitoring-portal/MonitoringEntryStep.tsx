import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Award,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  ExternalLink,
  Loader2,
  Lock,
  MapPin,
  MessageCircle,
  Mic,
  MicOff,
  Minus,
  Pencil,
  Plus,
  Save,
} from 'lucide-react';
import {
  MONITORING_STAGES,
  type IssuedStageDetail,
  type MonitoringStageControl,
} from '../../core/types/schema';
import { formatIndonesianDate } from '../../core/utils/dateHelpers';
import {
  formatRangePair,
  getPreviousEnabledStage,
  getStageValueByNumber,
  isStageFullyVerified,
  normalizeMonitoringVerificationStatus,
  resolveMonitoringStagePolicy,
  type ResolvedMonitoringStagePolicy,
} from '../../core/utils/monitoringHelpers';
import { formatNisVisual } from '../../core/utils/nisHelpers';
import { formatPhoneDisplay, getWhatsAppHref } from '../../core/utils/autoIdHelpers';
import { appendVoiceTranscript, useVoiceDictation } from '../../hooks/useVoiceDictation';
import { Format0701InspectionSection } from './Format0701InspectionSection';
import { GradeScoreEditorGrid } from './GradeScoreEditorGrid';
import { SignaturePadInput } from './SignaturePadInput';
import { WorkScheduleRangeInputs } from './WorkScheduleRangeInputs';
import { WorkshopSharedInspectionCard } from './WorkshopSharedInspectionCard';
import {
  CATATAN_QUICK_PRESETS,
  DELIVERY_CATATAN_PRESETS,
  getStudentKey,
  type GradeScoresDraft,
  type StudentStageDraft,
  type WorkshopStageDraft,
} from './types';

interface MonitoringEntryStepProps {
  selectedDudi: any;
  selectedPetugasNama: string;
  dudiStudents: any[];
  loadingStudents: boolean;
  studentsError: string;
  selectedStudentIndex: number;
  activeStudent: any;
  studentPolicy: ResolvedMonitoringStagePolicy;
  activeStageNum: number;
  stageControl: MonitoringStageControl;
  issuedStages: number[];
  issuedStageDetails: Record<number, IssuedStageDetail>;
  isStageLetterIssued: boolean;
  isStageReadOnly: boolean;
  isCompletedReadOnly: boolean;
  isStageCompleted: boolean;
  activeDraft: StudentStageDraft;
  activeWorkshopDraft: WorkshopStageDraft;
  alreadyHasGrade: boolean;
  isEditingGrade: boolean;
  canInputGradeThisStage: boolean;
  showGradeInputs: boolean;
  activeGradeEditDraft: GradeScoresDraft;
  rataRataEditNilai: number;
  predikatEditNilai: string;
  rataRataNilai: number;
  predikatNilai: string;
  savingGradeEdit: boolean;
  submitting: boolean;
  formError: string;
  formErrorTrigger?: number;
  dudiPemimpin: string;
  dudiPic: string;
  dudiTelp: string;
  dudiHariMulai: string;
  dudiHariSelesai: string;
  dudiJamMulai: string;
  dudiJamSelesai: string;
  showDudiContactEditor: boolean;
  deliveryTtdByKey: Record<string, string>;
  deliveryCatatan: string;
  deliveryContactConfirmed: boolean;
  deliverySelectedKeys: string[];
  canCopyWorkshopFromPrevStage: boolean;
  isOnline?: boolean;
  onChangeStepToDudiList: () => void;
  onSelectStudentIndex: (idx: number) => void;
  onSelectStage: (stageNum: number) => void;
  onUpdateDraft: (patch: Partial<StudentStageDraft>) => void;
  onUpdateWorkshopDraft: (patch: Partial<WorkshopStageDraft>) => void;
  onCopyWorkshopFromPrevStage: () => void;
  onMarkAllBengkelBaik: () => void;
  onApplyStandardChecklist: () => void;
  onChangeDudiPemimpin: (val: string) => void;
  onChangeDudiPic: (val: string) => void;
  onChangeDudiTelp: (val: string) => void;
  onChangeDudiHariMulai: (val: string) => void;
  onChangeDudiHariSelesai: (val: string) => void;
  onChangeDudiJamMulai: (val: string) => void;
  onChangeDudiJamSelesai: (val: string) => void;
  onCloseDudiContactEditor: () => void;
  onOpenDudiPopupForEdit: () => void;
  onChangeDeliveryStudentTtd: (stuKey: string, val: string) => void;
  onChangeDeliveryCatatan: (val: string) => void;
  onChangeDeliveryContactConfirmed: (val: boolean) => void;
  onToggleDeliveryStudentKey: (stuKey: string) => void;
  onStartEditGrade: () => void;
  onCancelEditGrade: () => void;
  onUpdateGradeEditDraft: (patch: Partial<GradeScoresDraft>) => void;
  onSaveEditedGrades: () => void;
  onRequestUnlockEdit: () => void;
  onSaveSupervision: () => void;
}

export const MonitoringEntryStep: React.FC<MonitoringEntryStepProps> = ({
  selectedDudi,
  selectedPetugasNama,
  dudiStudents,
  loadingStudents,
  studentsError,
  selectedStudentIndex,
  activeStudent,
  studentPolicy,
  activeStageNum,
  stageControl,
  issuedStages,
  issuedStageDetails,
  isStageLetterIssued,
  isStageReadOnly,
  isCompletedReadOnly,
  isStageCompleted,
  activeDraft,
  activeWorkshopDraft,
  alreadyHasGrade,
  isEditingGrade,
  canInputGradeThisStage,
  showGradeInputs,
  activeGradeEditDraft,
  rataRataEditNilai,
  predikatEditNilai,
  rataRataNilai,
  predikatNilai,
  savingGradeEdit,
  submitting,
  formError,
  formErrorTrigger = 0,
  dudiPemimpin,
  dudiPic,
  dudiTelp,
  dudiHariMulai,
  dudiHariSelesai,
  dudiJamMulai,
  dudiJamSelesai,
  showDudiContactEditor,
  deliveryTtdByKey,
  deliveryCatatan,
  deliveryContactConfirmed,
  deliverySelectedKeys,
  canCopyWorkshopFromPrevStage,
  isOnline = true,
  onChangeStepToDudiList,
  onSelectStudentIndex,
  onSelectStage,
  onUpdateDraft,
  onUpdateWorkshopDraft,
  onCopyWorkshopFromPrevStage,
  onMarkAllBengkelBaik,
  onApplyStandardChecklist,
  onChangeDudiPemimpin,
  onChangeDudiPic,
  onChangeDudiTelp,
  onChangeDudiHariMulai,
  onChangeDudiHariSelesai,
  onChangeDudiJamMulai,
  onChangeDudiJamSelesai,
  onCloseDudiContactEditor,
  onOpenDudiPopupForEdit,
  onChangeDeliveryStudentTtd,
  onChangeDeliveryCatatan,
  onChangeDeliveryContactConfirmed,
  onToggleDeliveryStudentKey,
  onStartEditGrade,
  onCancelEditGrade,
  onUpdateGradeEditDraft,
  onSaveEditedGrades,
  onRequestUnlockEdit,
  onSaveSupervision,
}) => {
  const errorRef = useRef<HTMLDivElement | null>(null);
  const mobileActiveStageRef = useRef<HTMLButtonElement | null>(null);
  const voice = useVoiceDictation('id-ID');
  const [lastVoiceZone, setLastVoiceZone] = useState<'kompetensi' | 'catatan' | null>(null);

  useEffect(() => {
    if (formError && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [formError, formErrorTrigger]);

  useEffect(() => {
    voice.stopListening();
  }, [selectedStudentIndex, activeStageNum, voice.stopListening]);

  useEffect(() => {
    if (mobileActiveStageRef.current) {
      mobileActiveStageRef.current.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    }
  }, [activeStageNum, selectedStudentIndex]);

  const activeStudentKey = activeStudent
    ? getStudentKey(activeStudent, selectedStudentIndex)
    : '';
  const isDeliveryStage = activeStageNum === 1;
  const shouldShowDudiEditor = showDudiContactEditor || isDeliveryStage;

  return (
    <div className="space-y-3 sm:space-y-4 animate-in fade-in duration-150">
      {/* Selected DUDI Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 p-2.5 sm:p-3.5 bg-slate-50 border border-slate-200/90 rounded-xl sm:rounded-2xl">
        <div className="flex items-start sm:items-center gap-2 sm:gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onChangeStepToDudiList}
            className="min-h-[38px] sm:min-h-[40px] px-2.5 sm:px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 flex items-center gap-1 text-xs font-semibold cursor-pointer shrink-0 whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
            <span>Ganti DUDI</span>
          </button>
          <div className="text-xs min-w-0">
            <span className="text-slate-500 block text-[10px]">DUDI Yang Dipilih</span>
            <span className="font-bold text-slate-900 leading-snug block">{selectedDudi.nama}</span>
          </div>
        </div>

        <div className="text-[11px] text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-1 shrink-0">
          {selectedDudi.linkMaps && (
            <>
              <a
                href={selectedDudi.linkMaps}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:text-blue-900 hover:underline underline-offset-2"
              >
                <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Maps</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
              <span aria-hidden="true">·</span>
            </>
          )}
          {getWhatsAppHref(selectedDudi.kontak) && (
            <>
              <a
                href={getWhatsAppHref(selectedDudi.kontak)!}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-mono font-semibold text-emerald-700 hover:text-emerald-900 hover:underline underline-offset-2"
              >
                <MessageCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>{formatPhoneDisplay(selectedDudi.kontak)}</span>
              </a>
              <span aria-hidden="true">·</span>
            </>
          )}
          <span>
            Petugas: <b>{selectedPetugasNama}</b>
          </span>
          <span aria-hidden="true">·</span>
          <span className="text-blue-700 font-bold tabular-nums">{dudiStudents.length} Siswa</span>
        </div>
      </div>

      {loadingStudents ? (
        <div className="space-y-4" aria-busy="true" aria-live="polite">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2.5 text-xs font-medium text-slate-600">
            <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
            <span>Memuat daftar siswa &amp; riwayat tahap monitoring dari Cloud Server...</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div
                key={idx}
                className="min-h-[64px] p-3 rounded-xl border border-slate-200 bg-white space-y-2"
              >
                <div className="flex justify-between gap-2">
                  <div className="h-3 skeleton-shimmer rounded w-16" />
                  <div className="h-3 skeleton-shimmer rounded w-14" />
                </div>
                <div className="h-4 skeleton-shimmer rounded w-4/5" />
                <div className="h-3 skeleton-shimmer rounded w-1/2" />
              </div>
            ))}
          </div>
          <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-4">
            <div className="h-5 skeleton-shimmer rounded w-1/2" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div key={idx} className="h-11 skeleton-shimmer rounded-xl" />
              ))}
            </div>
            <div className="h-24 skeleton-shimmer rounded-xl" />
          </div>
        </div>
      ) : studentsError ? (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800">
          {studentsError}
        </div>
      ) : dudiStudents.length === 0 ? (
        <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-center text-xs text-slate-600">
          Belum ada siswa yang tercatat di-plotting pada DUDI <b>{selectedDudi.nama}</b>.
        </div>
      ) : (
        <>
          {/* Student Switcher (Isolated State per Student) */}
          <div className="space-y-1.5 sm:space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="block text-xs font-bold text-slate-700 tabular-nums">
                Pilih Siswa ({selectedStudentIndex + 1}/{dudiStudents.length}):
              </label>
              {dudiStudents.length > 1 && (
                <div className="flex sm:hidden items-center gap-1">
                  <button
                    type="button"
                    disabled={selectedStudentIndex <= 0}
                    onClick={() => onSelectStudentIndex(Math.max(0, selectedStudentIndex - 1))}
                    aria-label="Siswa sebelumnya"
                    className="min-w-[38px] min-h-[38px] rounded-lg border border-slate-300 bg-white text-slate-700 flex items-center justify-center disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={selectedStudentIndex >= dudiStudents.length - 1}
                    onClick={() =>
                      onSelectStudentIndex(
                        Math.min(dudiStudents.length - 1, selectedStudentIndex + 1)
                      )
                    }
                    aria-label="Siswa berikutnya"
                    className="min-w-[38px] min-h-[38px] rounded-lg border border-slate-300 bg-white text-slate-700 flex items-center justify-center disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Mobile: Compact Horizontal Scrollable Switcher without cutting names */}
            <div className="flex sm:hidden gap-2 overflow-x-auto pb-1 snap-x">
              {dudiStudents.map((student, idx) => {
                const isSelected = selectedStudentIndex === idx;
                const stuPolicy =
                  student.stagePolicy || resolveMonitoringStagePolicy(stageControl, student.jurusan);
                const completedCount = (Array.isArray(student.completedStages)
                  ? student.completedStages
                  : []
                ).filter((n: number) => stuPolicy.enabledStages.includes(n)).length;
                const hasGrade = Boolean(student.hasSubmittedGrades);

                return (
                  <button
                    key={`${student.id || 'stu_mob'}_${idx}`}
                    type="button"
                    onClick={() => onSelectStudentIndex(idx)}
                    className={`snap-start shrink-0 min-w-[150px] max-w-[240px] min-h-[48px] px-3 py-2 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-blue-600 bg-blue-600 text-white shadow-xs'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <div className="font-bold text-xs leading-snug line-clamp-2">
                      {student.nama}
                    </div>
                    <div
                      className={`text-[10px] mt-1 flex items-center justify-between gap-2 tabular-nums ${
                        isSelected ? 'text-blue-100' : 'text-slate-500'
                      }`}
                    >
                      <span>{student.kelas}</span>
                      <span className="font-semibold shrink-0">
                        T{completedCount}/{stuPolicy.totalStages}{hasGrade ? ' · ✓' : ''}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Desktop / Tablet: Multi-Card Grid */}
            <div className="hidden sm:grid sm:grid-cols-2 md:grid-cols-3 gap-2">
              {dudiStudents.map((student, idx) => {
                const isSelected = selectedStudentIndex === idx;
                const stuPolicy =
                  student.stagePolicy || resolveMonitoringStagePolicy(stageControl, student.jurusan);
                const completedCount = (Array.isArray(student.completedStages)
                  ? student.completedStages
                  : []
                ).filter((n: number) => stuPolicy.enabledStages.includes(n)).length;
                const hasGrade = Boolean(student.hasSubmittedGrades);

                return (
                  <button
                    key={`${student.id || 'stu'}_${idx}`}
                    type="button"
                    onClick={() => onSelectStudentIndex(idx)}
                    className={`min-h-[60px] p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/70 text-blue-900 ring-2 ring-blue-600/20'
                        : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-slate-500 tabular-nums">
                      <span>NIS: {formatNisVisual(student.nis)}</span>
                      <span className="font-semibold text-slate-600">
                        Tahap {completedCount}/{stuPolicy.totalStages}{hasGrade ? ' · Nilai ✓' : ''}
                      </span>
                    </div>
                    <div className="font-bold text-xs mt-1 leading-snug">{student.nama}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{student.kelas}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {activeStudent && (() => {
            const visibleStages = MONITORING_STAGES.filter((st) =>
              studentPolicy.enabledStages.includes(st.num)
            );
            const recStageNum = activeStudent.recommendedStage || studentPolicy.enabledStages[0] || 1;
            const recOrderIdx = Math.max(
              1,
              visibleStages.findIndex((st) => st.num === recStageNum) + 1
            );
            const recLog = activeStudent.stageLogs?.[recStageNum];
            const recIsCompleted = (activeStudent.completedStages || []).includes(recStageNum);
            const recNormStatus = recIsCompleted
              ? normalizeMonitoringVerificationStatus(recLog?.status)
              : 'Belum Terlaksana';
            const recAwaitingVerify = recIsCompleted && !isStageFullyVerified(recLog?.status);

            const activeStageStatus = activeStudent.stageLogs?.[activeStageNum]?.status;
            const activeNormStatus = isStageCompleted
              ? normalizeMonitoringVerificationStatus(activeStageStatus)
              : 'Belum Terlaksana';
            const activeStatusText =
              activeNormStatus === 'Tervalidasi Hubin'
                ? 'Terverifikasi Kakomli & Hubin'
                : activeNormStatus === 'Tervalidasi Kakomli'
                ? 'Tervalidasi Kakomli · Menunggu Verifikasi Hubin'
                : 'Tersimpan · Menunggu Verifikasi Kakomli & Hubin';

            return (
            <div className="pt-2.5 border-t border-slate-200 space-y-3.5 sm:p-5 sm:rounded-2xl sm:border sm:border-slate-200 sm:bg-slate-50/50 sm:space-y-5">
              {/* Active Student Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2.5 sm:pb-3 border-b border-slate-200 gap-1.5">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 leading-snug">
                    Monitoring: {activeStudent.nama}
                  </h4>
                  <p className="text-[11px] sm:text-xs text-slate-500 tabular-nums">
                    NIS: {formatNisVisual(activeStudent.nis)} · Kelas: {activeStudent.kelas} · Jurusan: {activeStudent.jurusan}
                  </p>
                </div>
                <div className="text-[11px] sm:text-xs font-semibold text-blue-700 tabular-nums">
                  Deteksi Otomatis: {getStageValueByNumber(recStageNum)} ({recOrderIdx}/{studentPolicy.totalStages} tahap
                  {studentPolicy.isCustomJurusanPolicy && studentPolicy.jurusanCode
                    ? ` ${studentPolicy.jurusanCode}`
                    : ''}
                  )
                  {recAwaitingVerify && (
                    <span className="ml-1.5 text-amber-700">
                      ({recNormStatus === 'Tervalidasi Kakomli'
                        ? 'Menunggu Verifikasi Hubin'
                        : 'Menunggu Verifikasi Kakomli & Hubin'})
                    </span>
                  )}
                </div>
              </div>

              {/* Stage Auto-Detect & Jurusan-Scoped SuperAdmin Control Selector */}
              <div className="space-y-1.5 sm:space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs">
                  <span className="font-bold text-slate-800">
                    Tahap Monitoring ({stageControl.requireSequential ? `Berurutan · ${studentPolicy.totalStages} Tahap` : `Mode Fleksibel · ${studentPolicy.totalStages} Tahap`}):
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {!studentPolicy.unlockedStages.includes(activeStageNum)
                      ? 'Dikunci SuperAdmin · Baca-Saja'
                      : !isStageLetterIssued
                      ? 'Surat Belum Terbit · Baca-Saja'
                      : isCompletedReadOnly
                      ? `${activeStatusText} · Baca-Saja`
                      : isStageCompleted
                      ? `Mode Edit Aktif (${activeStatusText})`
                      : 'Siap diisi'}
                  </span>
                </div>

                {/* Mobile: 1-Row Horizontal Scrollable Stage Selector */}
                <div className="flex sm:hidden gap-1.5 overflow-x-auto pb-1 snap-x">
                  {visibleStages.map((st) => {
                    const isCompleted = (activeStudent.completedStages || []).includes(st.num);
                    const isVerifiedFull =
                      isCompleted && isStageFullyVerified(activeStudent.stageLogs?.[st.num]?.status);
                    const isGlobalUnlocked = studentPolicy.unlockedStages.includes(st.num);
                    const isLetterIssued =
                      stageControl.requireIssuedLetter === false || issuedStages.includes(st.num);
                    const prevStage = getPreviousEnabledStage(studentPolicy.enabledStages, st.num);
                    const isSequentialLocked =
                      isGlobalUnlocked &&
                      isLetterIssued &&
                      stageControl.requireSequential &&
                      prevStage !== null &&
                      !(activeStudent.completedStages || []).includes(prevStage);
                    const isReadOnlyHistory = (!isGlobalUnlocked || !isLetterIssued) && isCompleted;
                    const isDisabled =
                      ((!isGlobalUnlocked || !isLetterIssued) && !isCompleted) ||
                      isSequentialLocked;
                    const isActive = activeStageNum === st.num;

                    return (
                      <button
                        key={`mob_st_${st.num}`}
                        ref={isActive ? mobileActiveStageRef : undefined}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => onSelectStage(st.num)}
                        className={`snap-start shrink-0 min-h-[40px] px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                          isDisabled && isActive
                            ? 'border-amber-500 bg-amber-50 text-amber-900 ring-2 ring-amber-400/40 cursor-not-allowed'
                            : isDisabled
                            ? 'border-slate-200 bg-slate-100/80 text-slate-400 cursor-not-allowed'
                            : isActive && isReadOnlyHistory
                            ? 'border-amber-600 bg-amber-600 text-white shadow-xs cursor-pointer'
                            : isActive
                            ? 'border-blue-600 bg-blue-600 text-white shadow-xs cursor-pointer'
                            : isReadOnlyHistory
                            ? 'border-amber-300 bg-amber-50 text-amber-800 cursor-pointer'
                            : isVerifiedFull
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 cursor-pointer'
                            : isCompleted
                            ? 'border-sky-300 bg-sky-50 text-sky-800 cursor-pointer'
                            : 'border-slate-200 bg-white text-slate-700 cursor-pointer'
                        }`}
                      >
                        <span>
                          {st.label}
                          {st.num === studentPolicy.gradeStage ? ' · Nilai' : ''}
                        </span>
                        {isDisabled ? (
                          <Lock
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isActive ? 'text-amber-600' : 'text-slate-400'
                            }`}
                          />
                        ) : isReadOnlyHistory ? (
                          <Lock
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isActive ? 'text-white' : 'text-amber-600'
                            }`}
                          />
                        ) : isVerifiedFull ? (
                          <CheckCircle2
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isActive ? 'text-white' : 'text-emerald-600'
                            }`}
                          />
                        ) : isCompleted ? (
                          <Clock
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isActive ? 'text-white' : 'text-sky-600'
                            }`}
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                {/* Desktop / Tablet: Multi-Column Stage Grid */}
                <div className="hidden sm:grid sm:grid-cols-4 gap-2">
                  {visibleStages.map((st) => {
                    const isCompleted = (activeStudent.completedStages || []).includes(st.num);
                    const isVerifiedFull =
                      isCompleted && isStageFullyVerified(activeStudent.stageLogs?.[st.num]?.status);
                    const stageNormStatus = isCompleted
                      ? normalizeMonitoringVerificationStatus(activeStudent.stageLogs?.[st.num]?.status)
                      : 'Belum Terlaksana';
                    const isGlobalUnlocked = studentPolicy.unlockedStages.includes(st.num);
                    const isLetterIssued =
                      stageControl.requireIssuedLetter === false || issuedStages.includes(st.num);
                    const prevStage = getPreviousEnabledStage(studentPolicy.enabledStages, st.num);
                    const isSequentialLocked =
                      isGlobalUnlocked &&
                      isLetterIssued &&
                      stageControl.requireSequential &&
                      prevStage !== null &&
                      !(activeStudent.completedStages || []).includes(prevStage);
                    const isReadOnlyHistory = (!isGlobalUnlocked || !isLetterIssued) && isCompleted;
                    const isDisabled =
                      ((!isGlobalUnlocked || !isLetterIssued) && !isCompleted) ||
                      isSequentialLocked;
                    const isActive = activeStageNum === st.num;

                    return (
                      <button
                        key={st.num}
                        type="button"
                        disabled={isDisabled}
                        title={
                          !isGlobalUnlocked && !isCompleted
                            ? `Tahap dikunci oleh SuperAdmin${stageControl.lockedReason ? `: ${stageControl.lockedReason}` : ''}`
                            : !isLetterIssued && !isCompleted
                            ? `Surat ${st.value} untuk DUDI "${selectedDudi?.nama || ''}" belum diterbitkan Admin Hubin di Pusat Dokumen`
                            : isReadOnlyHistory
                            ? `${st.value} — ${stageNormStatus} (Klik untuk melihat mode Baca-Saja)`
                            : isSequentialLocked && prevStage !== null
                            ? `Terkunci — selesaikan ${getStageValueByNumber(prevStage)} terlebih dahulu`
                            : isVerifiedFull
                            ? `${st.value} — Terverifikasi Kakomli & Hubin`
                            : isCompleted
                            ? `${st.value} — ${stageNormStatus === 'Tervalidasi Kakomli' ? 'Menunggu Verifikasi Hubin' : 'Menunggu Verifikasi Kakomli & Hubin'}`
                            : st.value
                        }
                        onClick={() => onSelectStage(st.num)}
                        className={`min-h-[44px] px-3 py-2 rounded-xl border text-left text-xs font-semibold transition-all flex items-center justify-between gap-1.5 ${
                          isDisabled && isActive
                            ? 'border-amber-500 bg-amber-50 text-amber-900 ring-2 ring-amber-400/40 cursor-not-allowed'
                            : isDisabled
                            ? 'border-slate-200 bg-slate-100/80 text-slate-400 cursor-not-allowed'
                            : isActive && isReadOnlyHistory
                            ? 'border-amber-600 bg-amber-600 text-white shadow-xs cursor-pointer'
                            : isActive
                            ? 'border-blue-600 bg-blue-600 text-white shadow-xs cursor-pointer'
                            : isReadOnlyHistory
                            ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100/70 cursor-pointer'
                            : isVerifiedFull
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100/70 cursor-pointer'
                            : isCompleted
                            ? 'border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100/70 cursor-pointer'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 cursor-pointer'
                        }`}
                      >
                        <span className="truncate">
                          {st.label}
                          {st.num === studentPolicy.gradeStage ? ' · Nilai' : ''}
                        </span>
                        {isDisabled ? (
                          <Lock
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isActive ? 'text-amber-600' : 'text-slate-400'
                            }`}
                          />
                        ) : isReadOnlyHistory ? (
                          <Lock
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isActive ? 'text-white' : 'text-amber-600'
                            }`}
                          />
                        ) : isVerifiedFull ? (
                          <CheckCircle2
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isActive ? 'text-white' : 'text-emerald-600'
                            }`}
                          />
                        ) : isCompleted ? (
                          <Clock
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isActive ? 'text-white' : 'text-sky-600'
                            }`}
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500">
                  {stageControl.requireSequential
                    ? `Urutan ${studentPolicy.totalStages} tahap aktif jurusan: tahap berikut terbuka otomatis setelah tahap sebelumnya disimpan.`
                    : 'Mode Transisi aktif: tahap berstatus Terbuka dapat langsung dipilih.'}
                  {stageControl.requireIssuedLetter !== false &&
                    ' Pengisian aktif untuk tahap yang suratnya sudah diterbitkan Admin Hubin.'}
                  {` Input nilai PKL dibuka mulai ${getStageValueByNumber(studentPolicy.gradeStage)}.`}
                </p>

                {stageControl.requireIssuedLetter !== false &&
                  isStageLetterIssued &&
                  issuedStageDetails[activeStageNum] && (
                    <div className="text-[11px] text-emerald-700 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="inline-flex items-center gap-1 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Surat Tahap {activeStageNum} Sudah Terbit</span>
                      </span>
                      {issuedStageDetails[activeStageNum].nomorSurat && (
                        <span className="font-mono text-slate-600">
                          · No. {issuedStageDetails[activeStageNum].nomorSurat}
                        </span>
                      )}
                      {issuedStageDetails[activeStageNum].tanggalTerbit && (
                        <span className="text-slate-500">
                          · {formatIndonesianDate(issuedStageDetails[activeStageNum].tanggalTerbit)}
                        </span>
                      )}
                    </div>
                  )}

                {isStageReadOnly && (
                  !studentPolicy.unlockedStages.includes(activeStageNum) || !isStageLetterIssued ? (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-900">
                      <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">
                          {!studentPolicy.unlockedStages.includes(activeStageNum)
                            ? `Tahap ${activeStageNum} Dikunci oleh SuperAdmin (Mode Baca-Saja)`
                            : `Surat Tahap ${activeStageNum} Belum Diterbitkan Admin (Mode Baca-Saja)`}
                        </div>
                        <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                          {!studentPolicy.unlockedStages.includes(activeStageNum)
                            ? `${stageControl.lockedReason ? `${stageControl.lockedReason}. ` : ''}Riwayat yang sudah tersimpan tetap ditampilkan untuk ditinjau, namun tidak dapat diubah atau disimpan ulang.`
                            : `Admin Hubin / Pokja perlu mencetak atau menandai surat ${getStageValueByNumber(activeStageNum)} untuk DUDI "${selectedDudi?.nama || 'ini'}" sebagai Terbit di Pusat Dokumen sebelum pengisian dibuka.`}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs ${
                        activeNormStatus === 'Tervalidasi Hubin'
                          ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                          : 'bg-blue-50/80 border-blue-200 text-blue-950'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <CheckCircle2
                          className={`w-4 h-4 shrink-0 mt-0.5 ${
                            activeNormStatus === 'Tervalidasi Hubin'
                              ? 'text-emerald-600'
                              : 'text-blue-600'
                          }`}
                        />
                        <div>
                          <div className="font-bold">
                            {getStageValueByNumber(activeStageNum)} · {activeStatusText} (Mode Baca-Saja)
                          </div>
                          <p
                            className={`text-[11px] mt-0.5 leading-relaxed ${
                              activeNormStatus === 'Tervalidasi Hubin'
                                ? 'text-emerald-800'
                                : 'text-blue-800'
                            }`}
                          >
                            {activeNormStatus === 'Tervalidasi Hubin'
                              ? 'Tahap ini sudah diverifikasi oleh Kakomli dan Hubin. Data dikunci untuk mencegah perubahan tidak sengaja.'
                              : activeNormStatus === 'Tervalidasi Kakomli'
                              ? 'Tahap ini sudah diverifikasi Kakomli dan masih menunggu validasi Hubin.'
                              : 'Data tersimpan di Cloud Server dan masih menunggu verifikasi Kakomli dan Hubin.'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={onRequestUnlockEdit}
                        className={`min-h-[36px] px-3 py-1.5 rounded-lg bg-white border font-bold text-xs inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer transition-colors whitespace-nowrap ${
                          activeNormStatus === 'Tervalidasi Hubin'
                            ? 'border-emerald-300 hover:bg-emerald-100 text-emerald-800'
                            : 'border-blue-300 hover:bg-blue-100 text-blue-800'
                        }`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Edit Data</span>
                      </button>
                    </div>
                  )
                )}
              </div>

              {/* Data Penanggung Jawab & Kontak DUDI */}
              {shouldShowDudiEditor ? (
                <div className="p-3.5 sm:p-4 rounded-xl border border-blue-200 bg-blue-50/50 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-blue-700 mb-0.5">
                        <span>
                          {isDeliveryStage
                            ? '1× Per DUDI · Fokus Validasi Pengantaran'
                            : 'Pembaruan Kontak Resmi DUDI'}
                        </span>
                      </div>
                      <h5 className="text-xs sm:text-sm font-bold text-slate-900">
                        Validasi Petugas &amp; Jadwal Kerja DUDI
                      </h5>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        {isDeliveryStage
                          ? 'Pastikan ejaan nama pimpinan, pembimbing DUDI, nomor telepon, serta hari & jam kerja sesuai kondisi bengkel/perusahaan. Data otomatis tersinkron ke Master DUDI, Surat Tugas, & Sertifikat.'
                          : 'Data ini otomatis menyinkronkan profil Master DUDI & berkas pengajuan siswa.'}
                      </p>
                    </div>
                    {!isDeliveryStage && (
                      <button
                        type="button"
                        onClick={onCloseDudiContactEditor}
                        className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-[11px] font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                      >
                        Tutup
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Nama Pemimpin DUDI *
                      </label>
                      <input
                        type="text"
                        disabled={isStageReadOnly}
                        value={dudiPemimpin}
                        onChange={(e) => onChangeDudiPemimpin(e.target.value)}
                        placeholder="Direktur / Pemilik / Kepala"
                        className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-white disabled:bg-slate-100 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Nama PIC / Pembimbing DUDI *
                      </label>
                      <input
                        type="text"
                        disabled={isStageReadOnly}
                        value={dudiPic}
                        onChange={(e) => onChangeDudiPic(e.target.value)}
                        placeholder="Nama pembimbing lapangan"
                        className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-white disabled:bg-slate-100 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        No. Telp / WhatsApp DUDI *
                      </label>
                      <input
                        type="tel"
                        inputMode="tel"
                        disabled={isStageReadOnly}
                        value={dudiTelp}
                        onChange={(e) => onChangeDudiTelp(e.target.value)}
                        placeholder="08xxxxxxxxxx"
                        className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-white disabled:bg-slate-100 disabled:text-slate-500 font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </div>
                  <WorkScheduleRangeInputs
                    hariMulai={dudiHariMulai}
                    hariSelesai={dudiHariSelesai}
                    jamMulai={dudiJamMulai}
                    jamSelesai={dudiJamSelesai}
                    disabled={isStageReadOnly}
                    required={isDeliveryStage}
                    onChangeHariMulai={onChangeDudiHariMulai}
                    onChangeHariSelesai={onChangeDudiHariSelesai}
                    onChangeJamMulai={onChangeDudiJamMulai}
                    onChangeJamSelesai={onChangeDudiJamSelesai}
                  />
                  {isDeliveryStage && (
                    <label className="p-3 rounded-xl border border-blue-200 bg-white flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        disabled={isStageReadOnly}
                        checked={deliveryContactConfirmed}
                        onChange={(e) => onChangeDeliveryContactConfirmed(e.target.checked)}
                        className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 w-4 h-4 shrink-0 cursor-pointer"
                      />
                      <span className="text-[11px] font-semibold text-slate-800 leading-relaxed">
                        Saya mengonfirmasi seluruh data Pemimpin, Pembimbing DUDI, nomor telepon/WA, dan jadwal kerja di atas sudah divalidasi di lokasi DUDI.
                      </span>
                    </label>
                  )}
                </div>
              ) : (
                <div className="p-2.5 sm:px-3.5 sm:py-2.5 rounded-xl border border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600 text-[11px] sm:text-xs">
                    <span>
                      Pemimpin: <b className="text-slate-800">{dudiPemimpin || '-'}</b>
                    </span>
                    <span>
                      PIC: <b className="text-slate-800">{dudiPic || '-'}</b>
                    </span>
                    <span>
                      Telp: <b className="font-mono text-slate-800">{dudiTelp || '-'}</b>
                    </span>
                    <span>
                      Hari:{' '}
                      <b className="text-slate-800">
                        {formatRangePair(dudiHariMulai, dudiHariSelesai) || '-'}
                      </b>
                    </span>
                    <span>
                      Jam:{' '}
                      <b className="font-mono text-slate-800">
                        {formatRangePair(dudiJamMulai, dudiJamSelesai) || '-'}
                      </b>
                    </span>
                  </div>
                  {!isStageReadOnly && (
                    <button
                      type="button"
                      onClick={onOpenDudiPopupForEdit}
                      className="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    >
                      <Pencil className="w-3 h-3 shrink-0" />
                      <span>Edit Biodata</span>
                    </button>
                  )}
                </div>
              )}

              {isDeliveryStage ? (
                <div className="space-y-3.5">
                  {/* Daftar Siswa yang Diantar & Tanda Tangan Siswa (1x Simpan per DUDI) */}
                  <div className="p-3.5 sm:p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h5 className="text-xs font-bold text-slate-900">
                          Daftar Siswa yang Diantar &amp; Tanda Tangan Siswa ({deliverySelectedKeys.length}/{dudiStudents.length} dipilih)
                        </h5>
                        <p className="text-[11px] text-slate-500">
                          Centang siswa yang diantar dan minta masing-masing siswa menandatangani langsung di bawah namanya, lalu klik 1× Simpan untuk <b>{selectedDudi.nama}</b>.
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2.5">
                      {dudiStudents.map((stu, idx) => {
                        const stuKey = getStudentKey(stu, idx);
                        const isChecked = deliverySelectedKeys.includes(stuKey);
                        const isAlreadyDelivered =
                          Array.isArray(stu.completedStages) && stu.completedStages.includes(1);
                        const stuTtd = deliveryTtdByKey[stuKey] || '';
                        return (
                          <div
                            key={stuKey}
                            className={`p-3 rounded-xl border transition-colors space-y-2.5 ${
                              isChecked
                                ? 'border-blue-300 bg-blue-50/40'
                                : 'border-slate-200 bg-slate-50/60'
                            }`}
                          >
                            <label
                              className={`flex items-start gap-2.5 cursor-pointer ${
                                isStageReadOnly ? 'opacity-70 cursor-not-allowed' : ''
                              }`}
                            >
                              <input
                                type="checkbox"
                                disabled={isStageReadOnly}
                                checked={isChecked}
                                onChange={() => onToggleDeliveryStudentKey(stuKey)}
                                className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 w-4 h-4 shrink-0 cursor-pointer"
                              />
                              <div className="min-w-0 flex-1 text-xs">
                                <div className="flex flex-wrap items-center justify-between gap-1.5">
                                  <span className="font-bold text-slate-900 leading-snug">
                                    {stu.nama}
                                  </span>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {isAlreadyDelivered && (
                                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        Sudah Diantar
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                                  NIS: {formatNisVisual(stu.nis)} · {stu.kelas}
                                </div>
                              </div>
                            </label>

                            {isChecked && (
                              <SignaturePadInput
                                value={stuTtd}
                                studentName={stu.nama}
                                helperFilled="Tanda tangan siswa tersimpan ringan dalam format vektor."
                                helperEmpty="Minta siswa bersangkutan menandatangani langsung pada kotak di atas sebagai bukti serah terima pengantaran."
                                emptyDisabledText="Belum ada tanda tangan siswa"
                                disabled={isStageReadOnly}
                                onChange={(nextSvg) => onChangeDeliveryStudentTtd(stuKey, nextSvg)}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Catatan Pengantaran + Dikte Suara */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="block text-xs font-semibold text-slate-700">
                        Catatan Pengantaran ({selectedDudi.nama}) — Opsional:
                      </label>
                      {!isStageReadOnly && (
                        <button
                          type="button"
                          onClick={() => {
                            setLastVoiceZone('catatan');
                            voice.toggleListening('catatan', (spoken) => {
                              onChangeDeliveryCatatan(
                                appendVoiceTranscript(deliveryCatatan, spoken)
                              );
                            });
                          }}
                          title={
                            voice.isSupported
                              ? 'Dikte catatan pengantaran dengan suara Bahasa Indonesia'
                              : 'Browser tidak mendukung dikte suara'
                          }
                          className={`min-h-[32px] px-3 py-1 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer transition-all ${
                            voice.activeFieldId === 'catatan'
                              ? 'border-rose-500 bg-rose-600 text-white animate-pulse shadow-xs'
                              : 'border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700'
                          }`}
                        >
                          {voice.activeFieldId === 'catatan' ? (
                            <>
                              <MicOff className="w-3.5 h-3.5" />
                              <span>Stop Dikte</span>
                            </>
                          ) : (
                            <>
                              <Mic className="w-3.5 h-3.5" />
                              <span>Dikte Suara</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {voice.activeFieldId === 'catatan' && (
                      <p className="text-[11px] font-medium text-rose-700 flex items-center gap-1.5 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">
                        <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping shrink-0" />
                        <span>
                          {voice.interimText
                            ? `Mendengarkan: "${voice.interimText}"`
                            : 'Silakan ucapkan catatan pengantaran (Bahasa Indonesia)...'}
                        </span>
                      </p>
                    )}

                    {lastVoiceZone === 'catatan' && voice.voiceError && (
                      <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                        {voice.voiceError}
                      </p>
                    )}

                    <textarea
                      rows={2}
                      disabled={isStageReadOnly}
                      value={deliveryCatatan}
                      onChange={(e) => onChangeDeliveryCatatan(e.target.value)}
                      placeholder="Tuliskan catatan serah terima, penyesuaian jadwal, atau pesan dari DUDI saat pengantaran..."
                      className={`w-full px-3.5 py-2.5 bg-white border rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 disabled:bg-slate-100 disabled:text-slate-500 ${
                        voice.activeFieldId === 'catatan'
                          ? 'border-rose-400 focus:ring-rose-500'
                          : 'border-slate-300 focus:ring-blue-600'
                      }`}
                    />

                    {!isStageReadOnly && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-semibold text-slate-500 mr-0.5">
                          Isi Cepat:
                        </span>
                        {DELIVERY_CATATAN_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() =>
                              onChangeDeliveryCatatan(
                                appendVoiceTranscript(deliveryCatatan, preset)
                              )
                            }
                            className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-medium text-slate-700 cursor-pointer text-left transition-colors"
                          >
                            + {preset}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {/* ZONA A: Data Umum Bengkel DUDI — Diisi 1x Per DUDI Per Tahap (Auto-Collapse bila sudah lengkap) */}
                  <WorkshopSharedInspectionCard
                    dudiNama={selectedDudi.nama}
                    stageNum={activeStageNum}
                    studentKey={activeStudentKey}
                    studentCount={dudiStudents.length}
                kompetensiList={activeWorkshopDraft.kompetensiList}
                kondisiBengkel={activeWorkshopDraft.kondisiBengkel}
                disabled={isStageReadOnly}
                canCopyFromPrevStage={canCopyWorkshopFromPrevStage}
                onCopyFromPrevStage={onCopyWorkshopFromPrevStage}
                onMarkAllBaik={onMarkAllBengkelBaik}
                onChangeKompetensiList={(nextList) =>
                  onUpdateWorkshopDraft({ kompetensiList: nextList })
                }
                onChangeKondisiBengkel={(nextCheck) =>
                  onUpdateWorkshopDraft({ kondisiBengkel: nextCheck })
                }
                voiceSupported={voice.isSupported}
                voiceActiveFieldId={voice.activeFieldId}
                voiceInterimText={voice.interimText}
                voiceError={lastVoiceZone === 'kompetensi' ? voice.voiceError : ''}
                onToggleVoice={(fieldId, onFinal) => {
                  setLastVoiceZone('kompetensi');
                  voice.toggleListening(fieldId, onFinal);
                }}
              />

              {/* Section: Absensi (Sakit, Izin, Alpha) — Compact 3-Column Row on Mobile */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                  <ClipboardCheck className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Absensi Siswa (Sakit, Izin, Alpha) — Tahap {activeStageNum}</span>
                </div>

                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {(
                    [
                      { key: 'sakit', label: 'Sakit', accent: 'text-amber-700' },
                      { key: 'izin', label: 'Izin', accent: 'text-blue-700' },
                      { key: 'alpha', label: 'Alpha', accent: 'text-rose-700' },
                    ] as const
                  ).map((item) => {
                    const val = activeDraft[item.key];
                    return (
                      <div
                        key={item.key}
                        className="p-2 sm:p-3 bg-white border border-slate-200 rounded-xl space-y-1.5 sm:space-y-2"
                      >
                        <label
                          className={`block text-[11px] sm:text-xs font-bold text-center sm:text-left ${item.accent}`}
                        >
                          {item.label} <span className="hidden sm:inline">(Hari)</span>
                        </label>
                        <div className="flex flex-wrap sm:flex-nowrap items-center gap-1 sm:gap-2">
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={90}
                            disabled={isStageReadOnly}
                            aria-label={`${item.label} (Hari)`}
                            value={val}
                            onChange={(e) => {
                              const parsed = Math.max(
                                0,
                                Math.min(90, Math.round(Number(e.target.value) || 0))
                              );
                              onUpdateDraft({ [item.key]: parsed });
                            }}
                            className="order-1 sm:order-2 w-full sm:flex-1 min-h-[38px] sm:min-h-[44px] text-center font-mono tabular-nums text-base font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-lg sm:rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:bg-slate-100 disabled:text-slate-500"
                          />
                          <button
                            type="button"
                            disabled={isStageReadOnly}
                            aria-label={`Kurangi ${item.label}`}
                            onClick={() =>
                              onUpdateDraft({
                                [item.key]: Math.max(0, val - 1),
                              })
                            }
                            className="order-2 sm:order-1 flex-1 sm:flex-none sm:min-w-[44px] min-h-[38px] sm:min-h-[44px] rounded-lg sm:rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Minus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          </button>
                          <button
                            type="button"
                            disabled={isStageReadOnly}
                            aria-label={`Tambah ${item.label}`}
                            onClick={() =>
                              onUpdateDraft({
                                [item.key]: Math.min(90, val + 1),
                              })
                            }
                            className="order-3 flex-1 sm:flex-none sm:min-w-[44px] min-h-[38px] sm:min-h-[44px] rounded-lg sm:rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Tanda Tangan Siswa langsung di bawah Absensi */}
                <SignaturePadInput
                  value={activeDraft.ttdSiswa}
                  studentName={activeStudent.nama}
                  disabled={isStageReadOnly}
                  onChange={(nextSvg) => onUpdateDraft({ ttdSiswa: nextSvg })}
                />
              </div>

              {/* ZONA B: Ceklist Format 07.01 Individual Siswa (Buku Laporan & Aktivitas Sikap) */}
              <Format0701InspectionSection
                bukuLaporan={activeDraft.bukuLaporan}
                aktivitasDp={activeDraft.aktivitasDp}
                aktivitasMt={activeDraft.aktivitasMt}
                aktivitasKrt={activeDraft.aktivitasKrt}
                disabled={isStageReadOnly}
                onApplyStandardAll={onApplyStandardChecklist}
                onChangeBukuLaporan={(val) => onUpdateDraft({ bukuLaporan: val })}
                onChangeAktivitas={(field, val) => onUpdateDraft({ [field]: val })}
              />

              {/* Conditional Section: Already Submitted Grade Notice (+ Edit Nilai) OR Monitoring ke-4+ Prompt */}
              {alreadyHasGrade ? (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-3 text-xs text-emerald-900">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-bold text-sm text-emerald-900">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Nilai PKL Sudah Terinput</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      {activeStudent.submittedGradeSummary?.rataRata ? (
                        <span className="font-mono tabular-nums font-bold text-sm text-emerald-800">
                          Rata-rata: {activeStudent.submittedGradeSummary.rataRata}
                        </span>
                      ) : null}
                      {!isEditingGrade && !isStageReadOnly && (
                        <button
                          type="button"
                          onClick={onStartEditGrade}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-800 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>Edit Nilai</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {!isEditingGrade ? (
                    <>
                      <p className="text-emerald-800 leading-relaxed">
                        Nilai DUDI untuk siswa ini sudah tercatat di Cloud Server
                        {activeStudent.submittedGradeSummary?.tahapDiinput
                          ? ` (${activeStudent.submittedGradeSummary.tahapDiinput})`
                          : ''}
                        , sehingga form input awal tidak ditampilkan lagi. Gunakan tombol <b>Edit Nilai</b> bila perlu merevisi skor.
                      </p>
                      {activeStudent.submittedGradeSummary?.k3lh !== null &&
                        activeStudent.submittedGradeSummary?.k3lh !== undefined && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono tabular-nums text-[11px]">
                            <div className="p-2 bg-white/80 rounded-lg border border-emerald-200/70">
                              <span className="text-slate-500 block font-sans">K3LH</span>
                              <b>{activeStudent.submittedGradeSummary.k3lh}</b>
                            </div>
                            <div className="p-2 bg-white/80 rounded-lg border border-emerald-200/70">
                              <span className="text-slate-500 block font-sans">Softskills</span>
                              <b>{activeStudent.submittedGradeSummary.softskill}</b>
                            </div>
                            <div className="p-2 bg-white/80 rounded-lg border border-emerald-200/70">
                              <span className="text-slate-500 block font-sans">Hardskills</span>
                              <b>{activeStudent.submittedGradeSummary.teknis}</b>
                            </div>
                            <div className="p-2 bg-white/80 rounded-lg border border-emerald-200/70">
                              <span className="text-slate-500 block font-sans">
                                Alur Bisnis Dunia Kerja
                              </span>
                              <b>{activeStudent.submittedGradeSummary.alurBisnis}</b>
                            </div>
                          </div>
                        )}
                    </>
                  ) : (
                    <>
                      <GradeScoreEditorGrid
                        variant="edit"
                        scores={activeGradeEditDraft}
                        rataRata={rataRataEditNilai}
                        predikat={predikatEditNilai}
                        disabled={savingGradeEdit}
                        onChange={onUpdateGradeEditDraft}
                      />

                      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          disabled={savingGradeEdit}
                          onClick={onCancelEditGrade}
                          className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs cursor-pointer disabled:opacity-50"
                        >
                          Batal
                        </button>
                        <button
                          type="button"
                          disabled={savingGradeEdit}
                          onClick={onSaveEditedGrades}
                          className="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          {savingGradeEdit ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Save className="w-4 h-4" />
                          )}
                          <span>
                            {savingGradeEdit ? 'Menyimpan Perubahan...' : 'Simpan Perubahan Nilai'}
                          </span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                canInputGradeThisStage && (
                  <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                        <Award className="w-4 h-4 text-blue-600 shrink-0" />
                        <span>Apakah nilai PKL sudah muncul?</span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {activeStageNum === studentPolicy.gradeStage
                          ? `Wajib dijawab pada ${getStageValueByNumber(studentPolicy.gradeStage)}. Jika belum muncul, nilai dapat menyusul pada tahap aktif berikutnya.`
                          : `Nilai PKL belum tercatat pada tahap sebelumnya. Pilih "Ya" apabila nilai DUDI sudah keluar pada ${getStageValueByNumber(activeStageNum)}.`}
                      </p>

                      <div className="grid grid-cols-2 gap-2.5 pt-1">
                        <button
                          type="button"
                          disabled={isStageReadOnly}
                          onClick={() => onUpdateDraft({ nilaiPklMuncul: false })}
                          className={`min-h-[44px] px-4 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                            activeDraft.nilaiPklMuncul === false
                              ? 'border-slate-800 bg-slate-800 text-white'
                              : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          Belum Muncul
                        </button>
                        <button
                          type="button"
                          disabled={isStageReadOnly}
                          onClick={() => onUpdateDraft({ nilaiPklMuncul: true })}
                          className={`min-h-[44px] px-4 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                            activeDraft.nilaiPklMuncul === true
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
                          nilaiK3lh: activeDraft.nilaiK3lh,
                          nilaiSoftskill: activeDraft.nilaiSoftskill,
                          nilaiKompetensiTeknis: activeDraft.nilaiKompetensiTeknis,
                          nilaiAlurBisnis: activeDraft.nilaiAlurBisnis,
                        }}
                        rataRata={rataRataNilai}
                        predikat={predikatNilai}
                        disabled={isStageReadOnly}
                        onChange={(patch) => onUpdateDraft(patch)}
                      />
                    )}
                  </div>
                )
              )}

              {/* Catatan Pembimbing + Dikte Suara + Template Cepat */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Catatan Pembimbing / Evaluasi Siswa ({activeStudent.nama}):
                  </label>
                  {!isStageReadOnly && (
                    <button
                      type="button"
                      onClick={() => {
                        setLastVoiceZone('catatan');
                        voice.toggleListening('catatan', (spoken) => {
                          onUpdateDraft({
                            catatanPerkembangan: appendVoiceTranscript(
                              activeDraft.catatanPerkembangan,
                              spoken
                            ),
                          });
                        });
                      }}
                      title={
                        voice.isSupported
                          ? 'Dikte catatan monitoring dengan suara Bahasa Indonesia'
                          : 'Browser tidak mendukung dikte suara'
                      }
                      className={`min-h-[32px] px-3 py-1 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer transition-all ${
                        voice.activeFieldId === 'catatan'
                          ? 'border-rose-500 bg-rose-600 text-white animate-pulse shadow-xs'
                          : 'border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700'
                      }`}
                    >
                      {voice.activeFieldId === 'catatan' ? (
                        <>
                          <MicOff className="w-3.5 h-3.5" />
                          <span>Stop Dikte</span>
                        </>
                      ) : (
                        <>
                          <Mic className="w-3.5 h-3.5" />
                          <span>Dikte Suara</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {voice.activeFieldId === 'catatan' && (
                  <p className="text-[11px] font-medium text-rose-700 flex items-center gap-1.5 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping shrink-0" />
                    <span>
                      {voice.interimText
                        ? `Mendengarkan: "${voice.interimText}"`
                        : 'Silakan ucapkan catatan pembimbing (Bahasa Indonesia)...'}
                    </span>
                  </p>
                )}

                {lastVoiceZone === 'catatan' && voice.voiceError && (
                  <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                    {voice.voiceError}
                  </p>
                )}

                <textarea
                  rows={2}
                  disabled={isStageReadOnly}
                  value={activeDraft.catatanPerkembangan}
                  onChange={(e) => onUpdateDraft({ catatanPerkembangan: e.target.value })}
                  placeholder="Tuliskan atau tekan Dikte Suara untuk mencatat kondisi siswa & kendala lapangan..."
                  className={`w-full px-3.5 py-2.5 bg-white border rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 disabled:bg-slate-100 disabled:text-slate-500 ${
                    voice.activeFieldId === 'catatan'
                      ? 'border-rose-400 focus:ring-rose-500'
                      : 'border-slate-300 focus:ring-blue-600'
                  }`}
                />

                {!isStageReadOnly && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-slate-500 mr-0.5">
                      Isi Cepat:
                    </span>
                    {CATATAN_QUICK_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() =>
                          onUpdateDraft({
                            catatanPerkembangan: appendVoiceTranscript(
                              activeDraft.catatanPerkembangan,
                              preset
                            ),
                          })
                        }
                        className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-medium text-slate-700 cursor-pointer text-left transition-colors"
                      >
                        + {preset}
                      </button>
                    ))}
                  </div>
                )}
              </div>
                </>
              )}

              {formError && (
                <div
                  ref={errorRef}
                  role="alert"
                  className="p-3 bg-rose-50 border border-rose-300 rounded-xl flex items-start gap-2 text-xs font-medium text-rose-800 shadow-xs"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {!isOnline && (
                <div
                  role="alert"
                  className="p-3 bg-rose-50 border border-rose-300 rounded-xl flex items-start gap-2 text-xs font-semibold text-rose-800"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                  <span>
                    Koneksi internet terputus. Data belum bisa dikirim agar tidak gagal tersimpan di server. Hubungkan internet terlebih dahulu sebelum menekan Simpan.
                  </span>
                </div>
              )}

              {/* Primary Save CTA OR Read-Only Notice */}
              <div className="sticky bottom-0 z-10 -mx-3 -mb-3 sm:static sm:mx-0 sm:mb-0 px-3 py-2.5 sm:p-0 bg-white/95 sm:bg-transparent backdrop-blur-xs sm:backdrop-blur-none border-t border-slate-200 sm:border-t-0 flex justify-end">
                {isStageReadOnly ? (
                  !studentPolicy.unlockedStages.includes(activeStageNum) || !isStageLetterIssued ? (
                    <div className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 font-semibold text-xs flex items-center justify-center gap-2">
                      <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>
                        {!studentPolicy.unlockedStages.includes(activeStageNum)
                          ? 'Mode Baca-Saja (Tahap Dikunci SuperAdmin)'
                          : 'Mode Baca-Saja (Surat Tahap Belum Diterbitkan Admin)'}
                      </span>
                    </div>
                  ) : (
                    <div className="w-full sm:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <div
                        className={`min-h-[42px] px-3.5 py-2 rounded-xl border font-semibold text-xs flex items-center justify-center gap-2 ${
                          activeNormStatus === 'Tervalidasi Hubin'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : 'bg-blue-50 border-blue-200 text-blue-800'
                        }`}
                      >
                        <CheckCircle2
                          className={`w-4 h-4 shrink-0 ${
                            activeNormStatus === 'Tervalidasi Hubin'
                              ? 'text-emerald-600'
                              : 'text-blue-600'
                          }`}
                        />
                        <span>{activeStatusText} (Baca-Saja)</span>
                      </div>
                      <button
                        type="button"
                        onClick={onRequestUnlockEdit}
                        className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                      >
                        <Pencil className="w-4 h-4" />
                        <span>Edit Data Tahap {activeStageNum}</span>
                      </button>
                    </div>
                  )
                ) : (
                  <button
                    type="button"
                    onClick={onSaveSupervision}
                    disabled={submitting || !isOnline}
                    className="w-full sm:w-auto min-h-[46px] px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Menyimpan &amp; Memverifikasi ke Server...</span>
                      </>
                    ) : !isOnline ? (
                      <>
                        <AlertCircle className="w-4 h-4" />
                        <span>Offline — Hubungkan Internet untuk Simpan ke Server</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>
                          {isDeliveryStage
                            ? `Simpan Validasi & Pengantaran (${deliverySelectedKeys.length} Siswa)`
                            : showGradeInputs
                            ? 'Simpan Absensi & Nilai PKL Siswa Ini'
                            : `Simpan Monitoring Tahap ${activeStageNum}`}
                        </span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
            );
          })()}
        </>
      )}
    </div>
  );
};
