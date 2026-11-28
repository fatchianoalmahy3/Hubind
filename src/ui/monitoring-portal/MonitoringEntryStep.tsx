import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  HelpCircle,
  Loader2,
  Lock,
  MapPin,
  MessageCircle,
  Pencil,
  Save,
  Users,
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
import { formatPhoneDisplay, getWhatsAppHref } from '../../core/utils/autoIdHelpers';
import { useVoiceDictation } from '../../hooks/useVoiceDictation';
import { BatchMonitoringStudentsSection } from './BatchMonitoringStudentsSection';
import { DeliveryStageSection } from './DeliveryStageSection';
import { WorkScheduleRangeInputs } from './WorkScheduleRangeInputs';
import { WorkshopSharedInspectionCard } from './WorkshopSharedInspectionCard';
import {
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
  dudiStagePolicy: ResolvedMonitoringStagePolicy;
  activeStageNum: number;
  stageControl: MonitoringStageControl;
  issuedStages: number[];
  issuedStageDetails: Record<number, IssuedStageDetail>;
  isStageLetterIssued: boolean;
  isStageReadOnly: boolean;
  isCompletedReadOnly: boolean;
  isStageCompleted: boolean;
  draftsByKey: Record<string, StudentStageDraft>;
  activeWorkshopDraft: WorkshopStageDraft;
  editUnlockedKeys: Record<string, boolean>;
  batchSelectedKeys: string[];
  gradeEditDrafts: Record<string, GradeScoresDraft>;
  editingGradeByStudent: Record<string, boolean>;
  focusedStudentKey?: string;
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
  onSelectStage: (stageNum: number) => void;
  onUpdateWorkshopDraft: (patch: Partial<WorkshopStageDraft>) => void;
  onCopyWorkshopFromPrevStage: () => void;
  onMarkAllBengkelBaik: () => void;
  onToggleBatchStudent: (stuKey: string) => void;
  onSelectAllPending: () => void;
  onClearBatchSelection: () => void;
  onApplyBatchStandardAll: () => void;
  onUpdateStudentDraft: (stuKey: string, patch: Partial<StudentStageDraft>) => void;
  onApplyStudentStandard: (stuKey: string) => void;
  onRequestUnlockStudentEdit: (stu: any, idx: number) => void;
  onStartEditGradeFor: (stu: any, stuKey: string) => void;
  onCancelEditGradeFor: (stuKey: string) => void;
  onUpdateGradeEditDraftFor: (
    stuKey: string,
    base: GradeScoresDraft,
    patch: Partial<GradeScoresDraft>
  ) => void;
  onSaveEditedGradesFor: (stu: any, idx: number, stuKey: string) => void;
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
  onRequestUnlockEdit: () => void;
  onSaveSupervision: () => void;
}

export const MonitoringEntryStep: React.FC<MonitoringEntryStepProps> = ({
  selectedDudi,
  selectedPetugasNama,
  dudiStudents,
  loadingStudents,
  studentsError,
  dudiStagePolicy,
  activeStageNum,
  stageControl,
  issuedStages,
  issuedStageDetails,
  isStageLetterIssued,
  isStageReadOnly,
  isCompletedReadOnly,
  draftsByKey,
  activeWorkshopDraft,
  editUnlockedKeys,
  batchSelectedKeys,
  gradeEditDrafts,
  editingGradeByStudent,
  focusedStudentKey = '',
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
  onSelectStage,
  onUpdateWorkshopDraft,
  onCopyWorkshopFromPrevStage,
  onMarkAllBengkelBaik,
  onToggleBatchStudent,
  onSelectAllPending,
  onClearBatchSelection,
  onApplyBatchStandardAll,
  onUpdateStudentDraft,
  onApplyStudentStandard,
  onRequestUnlockStudentEdit,
  onStartEditGradeFor,
  onCancelEditGradeFor,
  onUpdateGradeEditDraftFor,
  onSaveEditedGradesFor,
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
  onRequestUnlockEdit,
  onSaveSupervision,
}) => {
  const errorRef = useRef<HTMLDivElement | null>(null);
  const mobileActiveStageRef = useRef<HTMLButtonElement | null>(null);
  const voice = useVoiceDictation('id-ID');
  const [lastVoiceZone, setLastVoiceZone] = useState<'kompetensi' | 'catatan' | null>(null);
  const [showStageInfo, setShowStageInfo] = useState(false);

  useEffect(() => {
    if (formError && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [formError, formErrorTrigger]);

  useEffect(() => {
    voice.stopListening();
  }, [activeStageNum, selectedDudi?.nama, voice.stopListening]);

  useEffect(() => {
    if (mobileActiveStageRef.current) {
      mobileActiveStageRef.current.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    }
  }, [activeStageNum]);

  const isDeliveryStage = activeStageNum === 1;
  const shouldShowDudiEditor = showDudiContactEditor && !isDeliveryStage;

  return (
    <div className="space-y-2.5 sm:space-y-4 animate-in fade-in duration-150">
      {/* Compact Selected DUDI Context Strip */}
      <div className="flex items-center justify-between gap-2 p-2 sm:p-3 bg-slate-50 border border-slate-200/90 rounded-xl sm:rounded-2xl">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            type="button"
            onClick={onChangeStepToDudiList}
            aria-label="Kembali ke daftar DUDI"
            className="min-h-[36px] px-2.5 py-1.5 rounded-lg sm:rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 flex items-center gap-1 text-xs font-semibold cursor-pointer shrink-0 whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Ganti DUDI</span>
            <span className="sm:hidden">DUDI</span>
          </button>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-xs sm:text-sm text-slate-900 truncate">
              {selectedDudi.nama}
            </div>
            <div className="text-[10px] sm:text-[11px] text-slate-500 flex items-center gap-1.5 tabular-nums truncate">
              <span className="font-semibold text-blue-700 shrink-0">
                {dudiStudents.length} Siswa
              </span>
              <span className="hidden sm:inline">·</span>
              <span className="hidden sm:inline truncate">
                Petugas: <b>{selectedPetugasNama}</b>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {selectedDudi.linkMaps && (
            <a
              href={selectedDudi.linkMaps}
              target="_blank"
              rel="noopener noreferrer"
              title="Buka Lokasi di Google Maps"
              className="min-h-[34px] px-2 sm:px-2.5 py-1 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 whitespace-nowrap"
            >
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Maps</span>
              <ExternalLink className="w-2.5 h-2.5 shrink-0" />
            </a>
          )}
          {getWhatsAppHref(selectedDudi.kontak) && (
            <a
              href={getWhatsAppHref(selectedDudi.kontak)!}
              target="_blank"
              rel="noopener noreferrer"
              title={`Chat WhatsApp ${formatPhoneDisplay(selectedDudi.kontak)}`}
              className="min-h-[34px] px-2 sm:px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-emerald-700 whitespace-nowrap"
            >
              <MessageCircle className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">{formatPhoneDisplay(selectedDudi.kontak)}</span>
              <span className="sm:hidden font-sans">WA</span>
            </a>
          )}
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
          {(() => {
            const visibleStages = MONITORING_STAGES.filter((st) =>
              dudiStagePolicy.enabledStages.includes(st.num)
            );
            const activeStageStats = (() => {
              let completedCount = 0;
              let verifiedCount = 0;
              let editableCount = 0;
              dudiStudents.forEach((stu, idx) => {
                const sKey = getStudentKey(stu, idx);
                const comp: number[] = Array.isArray(stu.completedStages) ? stu.completedStages : [];
                if (comp.includes(activeStageNum)) {
                  completedCount++;
                  if (isStageFullyVerified(stu.stageLogs?.[activeStageNum]?.status)) {
                    verifiedCount++;
                  }
                  if (editUnlockedKeys[`${sKey}::${activeStageNum}`]) {
                    editableCount++;
                  }
                } else {
                  const sPol =
                    stu.stagePolicy || resolveMonitoringStagePolicy(stageControl, stu.jurusan);
                  const prevSt = getPreviousEnabledStage(sPol.enabledStages, activeStageNum);
                  const seqOk =
                    !stageControl.requireSequential || prevSt === null || comp.includes(prevSt);
                  if (sPol.enabledStages.includes(activeStageNum) && sPol.unlockedStages.includes(activeStageNum) && isStageLetterIssued && seqOk) {
                    editableCount++;
                  }
                }
              });
              return { completedCount, verifiedCount, editableCount };
            })();

            const activeFirstLog = dudiStudents.find((s) => s.stageLogs?.[activeStageNum])?.stageLogs?.[activeStageNum];
            const activeNormStatus =
              activeStageStats.completedCount > 0
                ? normalizeMonitoringVerificationStatus(activeFirstLog?.status)
                : 'Belum Terlaksana';
            const activeStatusText =
              activeStageStats.verifiedCount === dudiStudents.length && dudiStudents.length > 0
                ? 'Terverifikasi Kakomli & Hubin'
                : activeNormStatus === 'Tervalidasi Kakomli'
                ? 'Tervalidasi Kakomli · Menunggu Hubin'
                : 'Tersimpan · Menunggu Verifikasi';

            return (
            <div className="pt-2 border-t border-slate-200 space-y-3 sm:p-5 sm:rounded-2xl sm:border sm:border-slate-200 sm:bg-slate-50/50 sm:space-y-4">
              {/* Compact Active Context Header (1x Per DUDI) */}
              {isDeliveryStage ? (
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
                  <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-900">
                    <Users className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>Pengantaran 1× Per DUDI · {dudiStudents.length} Siswa</span>
                  </div>
                  <span className="text-[11px] font-semibold text-blue-700 tabular-nums">
                    {getStageValueByNumber(1)} (1/{dudiStagePolicy.totalStages})
                  </span>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-200 gap-1">
                  <div className="min-w-0">
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-snug flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>
                        Monitoring Batch 1× Per DUDI · {getStageValueByNumber(activeStageNum)}
                      </span>
                    </h4>
                    <p className="text-[11px] sm:text-xs text-slate-500 tabular-nums truncate">
                      {activeStageStats.completedCount}/{dudiStudents.length} Siswa tersimpan ·{' '}
                      {batchSelectedKeys.length} siswa dipilih untuk disimpan
                    </p>
                  </div>
                  <div className="text-[11px] font-semibold text-blue-700 tabular-nums shrink-0">
                    Tahap {visibleStages.findIndex((s) => s.num === activeStageNum) + 1}/{dudiStagePolicy.totalStages}
                    {dudiStagePolicy.isCustomJurusanPolicy && dudiStagePolicy.jurusanCode
                      ? ` (${dudiStagePolicy.jurusanCode})`
                      : ''}
                  </div>
                </div>
              )}

              {/* DUDI-Level Stage Selector + Collapsible Policy Info */}
              <div className="space-y-1.5 sm:space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-bold text-slate-800 truncate">
                      Pilih Tahap ({dudiStagePolicy.totalStages} Tahap):
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowStageInfo((v) => !v)}
                      aria-expanded={showStageInfo}
                      title="Lihat aturan tahapan & info surat"
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-[10px] font-semibold text-slate-600 cursor-pointer shrink-0"
                    >
                      <HelpCircle className="w-3 h-3 text-blue-600" />
                      <span>Info</span>
                    </button>
                  </div>
                  <span
                    className={`text-[10px] sm:text-[11px] font-semibold shrink-0 ${
                      !dudiStagePolicy.unlockedStages.includes(activeStageNum) || !isStageLetterIssued
                        ? 'text-amber-700'
                        : isCompletedReadOnly
                        ? 'text-emerald-700'
                        : activeStageStats.completedCount > 0
                        ? 'text-blue-700'
                        : 'text-slate-500'
                    }`}
                  >
                    {!dudiStagePolicy.unlockedStages.includes(activeStageNum)
                      ? 'Dikunci Admin'
                      : !isStageLetterIssued
                      ? 'Surat Belum Terbit'
                      : isCompletedReadOnly
                      ? 'Semua Tersimpan · Baca-Saja'
                      : activeStageStats.completedCount > 0
                      ? `${activeStageStats.completedCount}/${dudiStudents.length} Tersimpan`
                      : 'Siap Diisi'}
                  </span>
                </div>

                {/* Stage Evaluation Helper */}
                {(() => {
                  const getStageButtonMeta = (stNum: number) => {
                    let completedCount = 0;
                    let verifiedCount = 0;
                    let anyReady = false;
                    dudiStudents.forEach((stu) => {
                      const stuPol =
                        stu.stagePolicy || resolveMonitoringStagePolicy(stageControl, stu.jurusan);
                      const comp: number[] = Array.isArray(stu.completedStages)
                        ? stu.completedStages
                        : [];
                      if (comp.includes(stNum)) {
                        completedCount++;
                        if (isStageFullyVerified(stu.stageLogs?.[stNum]?.status)) {
                          verifiedCount++;
                        }
                      } else if (
                        stuPol.enabledStages.includes(stNum) &&
                        stuPol.unlockedStages.includes(stNum)
                      ) {
                        const prevSt = getPreviousEnabledStage(stuPol.enabledStages, stNum);
                        if (!stageControl.requireSequential || prevSt === null || comp.includes(prevSt)) {
                          anyReady = true;
                        }
                      }
                    });
                    const allCompleted = dudiStudents.length > 0 && completedCount === dudiStudents.length;
                    const anyCompleted = completedCount > 0;
                    const isVerifiedFull = allCompleted && verifiedCount === dudiStudents.length;
                    const isGlobalUnlocked = dudiStagePolicy.unlockedStages.includes(stNum);
                    const isLetterIssued =
                      stageControl.requireIssuedLetter === false || issuedStages.includes(stNum);
                    const prevStage = getPreviousEnabledStage(dudiStagePolicy.enabledStages, stNum);
                    const isSequentialLocked =
                      stNum > 1 &&
                      isGlobalUnlocked &&
                      isLetterIssued &&
                      stageControl.requireSequential &&
                      !anyCompleted &&
                      !anyReady;
                    const isReadOnlyHistory = (!isGlobalUnlocked || !isLetterIssued) && anyCompleted;
                    const isDisabled =
                      ((!isGlobalUnlocked || !isLetterIssued) && !anyCompleted) ||
                      isSequentialLocked;
                    const countBadge =
                      !allCompleted && anyCompleted && dudiStudents.length > 1
                        ? ` (${completedCount}/${dudiStudents.length})`
                        : '';
                    return {
                      completedCount,
                      allCompleted,
                      anyCompleted,
                      isVerifiedFull,
                      isGlobalUnlocked,
                      isLetterIssued,
                      prevStage,
                      isSequentialLocked,
                      isReadOnlyHistory,
                      isDisabled,
                      countBadge,
                    };
                  };

                  return (
                    <>
                      {/* Mobile: 1-Row Horizontal Scrollable Stage Selector */}
                      <div className="flex sm:hidden gap-1.5 overflow-x-auto pb-1 snap-x">
                        {visibleStages.map((st) => {
                          const meta = getStageButtonMeta(st.num);
                          const isActive = activeStageNum === st.num;

                          return (
                            <button
                              key={`mob_st_${st.num}`}
                              ref={isActive ? mobileActiveStageRef : undefined}
                              type="button"
                              disabled={meta.isDisabled}
                              onClick={() => onSelectStage(st.num)}
                              className={`snap-start shrink-0 min-h-[40px] px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                                meta.isDisabled && isActive
                                  ? 'border-amber-500 bg-amber-50 text-amber-900 ring-2 ring-amber-400/40 cursor-not-allowed'
                                  : meta.isDisabled
                                  ? 'border-slate-200 bg-slate-100/80 text-slate-400 cursor-not-allowed'
                                  : isActive && meta.isReadOnlyHistory
                                  ? 'border-amber-600 bg-amber-600 text-white shadow-xs cursor-pointer'
                                  : isActive
                                  ? 'border-blue-600 bg-blue-600 text-white shadow-xs cursor-pointer'
                                  : meta.isReadOnlyHistory
                                  ? 'border-amber-300 bg-amber-50 text-amber-800 cursor-pointer'
                                  : meta.isVerifiedFull
                                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800 cursor-pointer'
                                  : meta.allCompleted
                                  ? 'border-sky-300 bg-sky-50 text-sky-800 cursor-pointer'
                                  : 'border-slate-200 bg-white text-slate-700 cursor-pointer'
                              }`}
                            >
                              <span>
                                {st.label}
                                {st.num === dudiStagePolicy.gradeStage ? ' · Nilai' : ''}
                                {meta.countBadge}
                              </span>
                              {meta.isDisabled ? (
                                <Lock
                                  className={`w-3.5 h-3.5 shrink-0 ${
                                    isActive ? 'text-amber-600' : 'text-slate-400'
                                  }`}
                                />
                              ) : meta.isReadOnlyHistory ? (
                                <Lock
                                  className={`w-3.5 h-3.5 shrink-0 ${
                                    isActive ? 'text-white' : 'text-amber-600'
                                  }`}
                                />
                              ) : meta.isVerifiedFull ? (
                                <CheckCircle2
                                  className={`w-3.5 h-3.5 shrink-0 ${
                                    isActive ? 'text-white' : 'text-emerald-600'
                                  }`}
                                />
                              ) : meta.allCompleted ? (
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
                          const meta = getStageButtonMeta(st.num);
                          const isActive = activeStageNum === st.num;

                          return (
                            <button
                              key={st.num}
                              type="button"
                              disabled={meta.isDisabled}
                              title={
                                !meta.isGlobalUnlocked && !meta.anyCompleted
                                  ? `Tahap dikunci oleh SuperAdmin${stageControl.lockedReason ? `: ${stageControl.lockedReason}` : ''}`
                                  : !meta.isLetterIssued && !meta.anyCompleted
                                  ? `Surat ${st.value} untuk DUDI "${selectedDudi?.nama || ''}" belum diterbitkan Admin Hubin di Pusat Dokumen`
                                  : meta.isReadOnlyHistory
                                  ? `${st.value} — Mode Baca-Saja`
                                  : meta.isSequentialLocked && meta.prevStage !== null
                                  ? `Terkunci — selesaikan ${getStageValueByNumber(meta.prevStage)} terlebih dahulu`
                                  : meta.isVerifiedFull
                                  ? `${st.value} — Terverifikasi Kakomli & Hubin`
                                  : meta.allCompleted
                                  ? `${st.value} — Tersimpan (${meta.completedCount}/${dudiStudents.length})`
                                  : st.value
                              }
                              onClick={() => onSelectStage(st.num)}
                              className={`min-h-[44px] px-3 py-2 rounded-xl border text-left text-xs font-semibold transition-all flex items-center justify-between gap-1.5 ${
                                meta.isDisabled && isActive
                                  ? 'border-amber-500 bg-amber-50 text-amber-900 ring-2 ring-amber-400/40 cursor-not-allowed'
                                  : meta.isDisabled
                                  ? 'border-slate-200 bg-slate-100/80 text-slate-400 cursor-not-allowed'
                                  : isActive && meta.isReadOnlyHistory
                                  ? 'border-amber-600 bg-amber-600 text-white shadow-xs cursor-pointer'
                                  : isActive
                                  ? 'border-blue-600 bg-blue-600 text-white shadow-xs cursor-pointer'
                                  : meta.isReadOnlyHistory
                                  ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100/70 cursor-pointer'
                                  : meta.isVerifiedFull
                                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100/70 cursor-pointer'
                                  : meta.allCompleted
                                  ? 'border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100/70 cursor-pointer'
                                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 cursor-pointer'
                              }`}
                            >
                              <span className="truncate">
                                {st.label}
                                {st.num === dudiStagePolicy.gradeStage ? ' · Nilai' : ''}
                                {meta.countBadge}
                              </span>
                              {meta.isDisabled ? (
                                <Lock
                                  className={`w-3.5 h-3.5 shrink-0 ${
                                    isActive ? 'text-amber-600' : 'text-slate-400'
                                  }`}
                                />
                              ) : meta.isReadOnlyHistory ? (
                                <Lock
                                  className={`w-3.5 h-3.5 shrink-0 ${
                                    isActive ? 'text-white' : 'text-amber-600'
                                  }`}
                                />
                              ) : meta.isVerifiedFull ? (
                                <CheckCircle2
                                  className={`w-3.5 h-3.5 shrink-0 ${
                                    isActive ? 'text-white' : 'text-emerald-600'
                                  }`}
                                />
                              ) : meta.allCompleted ? (
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
                    </>
                  );
                })()}

                {showStageInfo && (
                  <div className="p-2.5 rounded-xl bg-slate-100/90 border border-slate-200 text-[11px] text-slate-600 space-y-1">
                    <p>
                      {stageControl.requireSequential
                        ? `Urutan ${dudiStagePolicy.totalStages} tahap aktif: tahap berikut terbuka otomatis setelah tahap sebelumnya disimpan.`
                        : 'Mode Transisi aktif: tahap berstatus Terbuka dapat langsung dipilih.'}
                      {stageControl.requireIssuedLetter !== false &&
                        ' Pengisian aktif untuk tahap yang suratnya sudah diterbitkan Admin Hubin.'}
                      {` Input nilai PKL dibuka mulai ${getStageValueByNumber(dudiStagePolicy.gradeStage)}.`}
                    </p>
                    {stageControl.requireIssuedLetter !== false &&
                      isStageLetterIssued &&
                      issuedStageDetails[activeStageNum] && (
                        <div className="text-emerald-700 flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-0.5">
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
                  </div>
                )}

                {isStageReadOnly && (
                  !dudiStagePolicy.unlockedStages.includes(activeStageNum) || !isStageLetterIssued ? (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-900">
                      <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">
                          {!dudiStagePolicy.unlockedStages.includes(activeStageNum)
                            ? `Tahap ${activeStageNum} Dikunci oleh SuperAdmin (Mode Baca-Saja)`
                            : `Surat Tahap ${activeStageNum} Belum Diterbitkan Admin (Mode Baca-Saja)`}
                        </div>
                        <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                          {!dudiStagePolicy.unlockedStages.includes(activeStageNum)
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
                            {isDeliveryStage
                              ? 'Data pengantaran seluruh siswa sudah tersimpan. Tekan Edit Data bila perlu merevisi.'
                              : 'Seluruh siswa pada tahap ini sudah tersimpan. Ketuk tombol Edit pada baris siswa di Blok 2 bila ingin merevisi.'}
                          </p>
                        </div>
                      </div>
                      {isDeliveryStage && (
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
                      )}
                    </div>
                  )
                )}
              </div>

              {/* Data Penanggung Jawab & Kontak DUDI (Stage 2+ Editor / Collapsed Summary) */}
              {!isDeliveryStage && (
                shouldShowDudiEditor ? (
                  <div className="p-3.5 sm:p-4 rounded-xl border border-blue-200 bg-blue-50/50 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-blue-700 mb-0.5">
                          Pembaruan Kontak Resmi DUDI
                        </div>
                        <h5 className="text-xs sm:text-sm font-bold text-slate-900">
                          Validasi Petugas &amp; Jadwal Kerja DUDI
                        </h5>
                        <p className="text-[11px] text-slate-600 leading-relaxed">
                          Data ini otomatis menyinkronkan profil Master DUDI &amp; berkas pengajuan siswa.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={onCloseDudiContactEditor}
                        className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-[11px] font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                      >
                        Tutup
                      </button>
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
                      required={false}
                      onChangeHariMulai={onChangeDudiHariMulai}
                      onChangeHariSelesai={onChangeDudiHariSelesai}
                      onChangeJamMulai={onChangeDudiJamMulai}
                      onChangeJamSelesai={onChangeDudiJamSelesai}
                    />
                  </div>
                ) : (
                  <div className="p-2.5 sm:px-3.5 sm:py-2.5 rounded-xl border border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-slate-600 text-[11px] sm:text-xs">
                      <span>
                        Pemimpin: <b className="text-slate-800">{dudiPemimpin || '-'}</b>
                      </span>
                      <span>
                        PIC: <b className="text-slate-800">{dudiPic || '-'}</b>
                      </span>
                      <span>
                        Telp: <b className="font-mono text-slate-800">{dudiTelp || '-'}</b>
                      </span>
                      <span className="hidden sm:inline">
                        Hari:{' '}
                        <b className="text-slate-800">
                          {formatRangePair(dudiHariMulai, dudiHariSelesai) || '-'}
                        </b>
                      </span>
                      <span className="hidden sm:inline">
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
                )
              )}

              {isDeliveryStage ? (
                <DeliveryStageSection
                  selectedDudi={selectedDudi}
                  dudiStudents={dudiStudents}
                  stageControl={stageControl}
                  isStageReadOnly={isStageReadOnly}
                  dudiPemimpin={dudiPemimpin}
                  dudiPic={dudiPic}
                  dudiTelp={dudiTelp}
                  dudiHariMulai={dudiHariMulai}
                  dudiHariSelesai={dudiHariSelesai}
                  dudiJamMulai={dudiJamMulai}
                  dudiJamSelesai={dudiJamSelesai}
                  deliveryTtdByKey={deliveryTtdByKey}
                  deliveryCatatan={deliveryCatatan}
                  deliveryContactConfirmed={deliveryContactConfirmed}
                  deliverySelectedKeys={deliverySelectedKeys}
                  onChangeDudiPemimpin={onChangeDudiPemimpin}
                  onChangeDudiPic={onChangeDudiPic}
                  onChangeDudiTelp={onChangeDudiTelp}
                  onChangeDudiHariMulai={onChangeDudiHariMulai}
                  onChangeDudiHariSelesai={onChangeDudiHariSelesai}
                  onChangeDudiJamMulai={onChangeDudiJamMulai}
                  onChangeDudiJamSelesai={onChangeDudiJamSelesai}
                  onChangeDeliveryStudentTtd={onChangeDeliveryStudentTtd}
                  onChangeDeliveryCatatan={onChangeDeliveryCatatan}
                  onChangeDeliveryContactConfirmed={onChangeDeliveryContactConfirmed}
                  onToggleDeliveryStudentKey={onToggleDeliveryStudentKey}
                  voiceSupported={voice.isSupported}
                  voiceActiveFieldId={voice.activeFieldId}
                  voiceInterimText={voice.interimText}
                  voiceError={lastVoiceZone === 'catatan' ? voice.voiceError : ''}
                  onToggleVoice={(fieldId, onFinal) => {
                    setLastVoiceZone('catatan');
                    voice.toggleListening(fieldId, onFinal);
                  }}
                />
              ) : (
                <>
                  {/* BLOK 1 (Level DUDI): Data Umum Bengkel DUDI — Diisi 1x Per DUDI Per Tahap */}
                  <WorkshopSharedInspectionCard
                    dudiNama={selectedDudi.nama}
                    stageNum={activeStageNum}
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

                  {/* BLOK 2 (Level Siswa - Batch Mode): Absensi, Ceklist, Nilai & Catatan */}
                  <BatchMonitoringStudentsSection
                    selectedDudi={selectedDudi}
                    dudiStudents={dudiStudents}
                    activeStageNum={activeStageNum}
                    stageControl={stageControl}
                    issuedStages={issuedStages}
                    draftsByKey={draftsByKey}
                    batchSelectedKeys={batchSelectedKeys}
                    editUnlockedKeys={editUnlockedKeys}
                    gradeEditDrafts={gradeEditDrafts}
                    editingGradeByStudent={editingGradeByStudent}
                    savingGradeEdit={savingGradeEdit}
                    focusedStudentKey={focusedStudentKey}
                    onToggleBatchStudent={onToggleBatchStudent}
                    onSelectAllPending={onSelectAllPending}
                    onClearBatchSelection={onClearBatchSelection}
                    onApplyBatchStandardAll={onApplyBatchStandardAll}
                    onUpdateStudentDraft={onUpdateStudentDraft}
                    onApplyStudentStandard={onApplyStudentStandard}
                    onRequestUnlockStudentEdit={onRequestUnlockStudentEdit}
                    onStartEditGrade={onStartEditGradeFor}
                    onCancelEditGrade={onCancelEditGradeFor}
                    onUpdateGradeEditDraft={onUpdateGradeEditDraftFor}
                    onSaveEditedGrades={onSaveEditedGradesFor}
                    voiceSupported={voice.isSupported}
                    voiceActiveFieldId={voice.activeFieldId}
                    voiceInterimText={voice.interimText}
                    voiceError={lastVoiceZone === 'catatan' ? voice.voiceError : ''}
                    onToggleVoice={(fieldId, onFinal) => {
                      setLastVoiceZone('catatan');
                      voice.toggleListening(fieldId, onFinal);
                    }}
                  />
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
              <div className="sticky bottom-0 z-10 -mx-3 -mb-3 sm:static sm:mx-0 sm:mb-0 px-3 pt-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] sm:p-0 bg-white/95 sm:bg-transparent backdrop-blur-xs sm:backdrop-blur-none border-t border-slate-200 sm:border-t-0 flex justify-end">
                {isStageReadOnly ? (
                  !dudiStagePolicy.unlockedStages.includes(activeStageNum) || !isStageLetterIssued ? (
                    <div className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 font-semibold text-xs flex items-center justify-center gap-2">
                      <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                      <span className="truncate">
                        {!dudiStagePolicy.unlockedStages.includes(activeStageNum)
                          ? 'Baca-Saja (Tahap Dikunci Admin)'
                          : 'Baca-Saja (Surat Belum Terbit)'}
                      </span>
                    </div>
                  ) : isDeliveryStage ? (
                    <div className="w-full sm:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <div
                        className={`min-h-[40px] px-3 py-1.5 rounded-xl border font-semibold text-[11px] sm:text-xs flex items-center justify-center gap-2 ${
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
                        <span className="truncate">{activeStatusText}</span>
                      </div>
                      <button
                        type="button"
                        onClick={onRequestUnlockEdit}
                        className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                      >
                        <Pencil className="w-4 h-4" />
                        <span>Edit Tahap 1</span>
                      </button>
                    </div>
                  ) : (
                    <div
                      className={`w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl border font-semibold text-[11px] sm:text-xs flex items-center justify-center gap-2 ${
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
                      <span>
                        Semua Siswa Tahap {activeStageNum} Tersimpan (Ketuk Edit pada siswa di atas bila revisi)
                      </span>
                    </div>
                  )
                ) : (
                  <button
                    type="button"
                    onClick={onSaveSupervision}
                    disabled={
                      submitting ||
                      !isOnline ||
                      (isDeliveryStage
                        ? deliverySelectedKeys.length === 0
                        : batchSelectedKeys.length === 0)
                    }
                    className="w-full sm:w-auto min-h-[46px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        <span>Menyimpan ke Server...</span>
                      </>
                    ) : !isOnline ? (
                      <>
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>Offline — Hubungkan Internet</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 shrink-0" />
                        <span>
                          {isDeliveryStage
                            ? `Simpan Pengantaran (${deliverySelectedKeys.length})`
                            : `Simpan Monitoring (${batchSelectedKeys.length} Siswa)`}
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
