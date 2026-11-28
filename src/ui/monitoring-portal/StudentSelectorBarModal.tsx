import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileEdit,
  Search,
  Users,
  X,
} from 'lucide-react';
import type { MonitoringStageControl } from '../../core/types/schema';
import {
  isStageFullyVerified,
  resolveMonitoringStagePolicy,
} from '../../core/utils/monitoringHelpers';
import { formatNisVisual } from '../../core/utils/nisHelpers';
import { getStudentKey, type StudentStageDraft } from './types';

interface StudentSelectorBarModalProps {
  dudiStudents: any[];
  selectedStudentIndex: number;
  activeStudent: any;
  activeStageNum: number;
  stageControl: MonitoringStageControl;
  draftsByKey: Record<string, StudentStageDraft>;
  onSelectStudentIndex: (idx: number) => void;
}

export function hasStudentDraftProgressForStage(draft?: StudentStageDraft | null): boolean {
  if (!draft) return false;
  return Boolean(
    (Number(draft.sakit) || 0) > 0 ||
      (Number(draft.izin) || 0) > 0 ||
      (Number(draft.alpha) || 0) > 0 ||
      draft.bukuLaporan ||
      draft.aktivitasDp ||
      draft.aktivitasMt ||
      draft.aktivitasKrt ||
      draft.ttdSiswa ||
      draft.nilaiPklMuncul !== null ||
      (draft.catatanPerkembangan && draft.catatanPerkembangan.trim().length > 0)
  );
}

export const StudentSelectorBarModal: React.FC<StudentSelectorBarModalProps> = ({
  dudiStudents,
  selectedStudentIndex,
  activeStudent,
  activeStageNum,
  stageControl,
  draftsByKey,
  onSelectStudentIndex,
}) => {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!isSheetOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setIsSheetOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSheetOpen]);

  const studentMetaList = useMemo(() => {
    return dudiStudents.map((stu, idx) => {
      const stuKey = getStudentKey(stu, idx);
      const stuPolicy =
        stu.stagePolicy || resolveMonitoringStagePolicy(stageControl, stu.jurusan);
      const completedStages: number[] = Array.isArray(stu.completedStages)
        ? stu.completedStages
        : [];
      const isActiveStageDone = completedStages.includes(activeStageNum);
      const isActiveStageVerified =
        isActiveStageDone && isStageFullyVerified(stu.stageLogs?.[activeStageNum]?.status);
      const draftKey = `${stuKey}::${activeStageNum}`;
      const hasLocalDraft =
        !isActiveStageDone && hasStudentDraftProgressForStage(draftsByKey[draftKey]);
      const completedCount = completedStages.filter((n) =>
        stuPolicy.enabledStages.includes(n)
      ).length;
      const hasGrade = Boolean(stu.hasSubmittedGrades);

      return {
        stu,
        idx,
        stuKey,
        stuPolicy,
        isActiveStageDone,
        isActiveStageVerified,
        hasLocalDraft,
        completedCount,
        hasGrade,
      };
    });
  }, [dudiStudents, activeStageNum, stageControl, draftsByKey]);

  const doneInStageCount = useMemo(
    () => studentMetaList.filter((m) => m.isActiveStageDone).length,
    [studentMetaList]
  );

  const nextPendingOther = useMemo(() => {
    return (
      studentMetaList.find(
        (m) => !m.isActiveStageDone && m.idx !== selectedStudentIndex
      ) || null
    );
  }, [studentMetaList, selectedStudentIndex]);

  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return studentMetaList;
    return studentMetaList.filter(({ stu }) => {
      const hay = `${stu.nama || ''} ${stu.nis || ''} ${stu.kelas || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [studentMetaList, searchQuery]);

  const activeMeta = studentMetaList[selectedStudentIndex];

  const renderStageStatusBadge = (
    meta: (typeof studentMetaList)[number],
    compact = false
  ) => {
    if (meta.isActiveStageVerified) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold shrink-0">
          <CheckCircle2 className="w-2.5 h-2.5" />
          <span>{compact ? 'Valid' : 'Tervalidasi'}</span>
        </span>
      );
    }
    if (meta.isActiveStageDone) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-50 border border-sky-200 text-sky-700 text-[10px] font-bold shrink-0">
          <Clock className="w-2.5 h-2.5" />
          <span>Tersimpan</span>
        </span>
      );
    }
    if (meta.hasLocalDraft) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-bold shrink-0">
          <FileEdit className="w-2.5 h-2.5" />
          <span>{compact ? 'Draft' : 'Draft di HP'}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold shrink-0">
        <span>{compact ? 'Belum' : 'Belum Diisi'}</span>
      </span>
    );
  };

  const openPicker = () => {
    setSearchQuery('');
    setIsSheetOpen(true);
  };

  return (
    <>
      <div className="space-y-1.5 sm:space-y-2">
        <div className="hidden sm:flex items-center justify-between gap-2">
          <label className="block text-xs font-bold text-slate-700 tabular-nums">
            Pilih Siswa ({selectedStudentIndex + 1}/{dudiStudents.length} · Tahap{' '}
            {activeStageNum}: {doneInStageCount}/{dudiStudents.length} selesai):
          </label>
          {dudiStudents.length > 6 && (
            <button
              type="button"
              onClick={openPicker}
              className="min-h-[32px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-700 inline-flex items-center gap-1 cursor-pointer"
            >
              <Users className="w-3.5 h-3.5 text-blue-600" />
              <span>Daftar Lengkap</span>
            </button>
          )}
        </div>

        {/* Mobile: Single Compact Active Student Bar + Bottom Sheet Trigger + < > */}
        {activeStudent && activeMeta && (
          <div className="flex sm:hidden items-center gap-1.5 p-1.5 rounded-xl border border-blue-200 bg-blue-50/60">
            <button
              type="button"
              onClick={openPicker}
              aria-label="Pilih siswa dari daftar"
              className="min-w-0 flex-1 min-h-[46px] px-2.5 py-1.5 rounded-lg bg-white border border-blue-200/80 hover:border-blue-400 text-left flex items-center justify-between gap-2 cursor-pointer transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                  <span className="px-1.5 py-0.5 rounded bg-blue-600 text-white text-[10px] font-mono tabular-nums shrink-0">
                    {selectedStudentIndex + 1}/{dudiStudents.length}
                  </span>
                  <span className="truncate">{activeStudent.nama}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-500 tabular-nums overflow-hidden">
                  <span className="truncate">{activeStudent.kelas}</span>
                  <span>·</span>
                  {renderStageStatusBadge(activeMeta, true)}
                  <span className="ml-auto font-semibold text-slate-600 shrink-0">
                    {doneInStageCount}/{dudiStudents.length}
                  </span>
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-blue-600 shrink-0" />
            </button>

            {dudiStudents.length > 1 && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  disabled={selectedStudentIndex <= 0}
                  onClick={() =>
                    onSelectStudentIndex(Math.max(0, selectedStudentIndex - 1))
                  }
                  aria-label="Siswa sebelumnya"
                  className="min-w-[40px] min-h-[46px] rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 flex items-center justify-center disabled:opacity-40 cursor-pointer"
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
                  className="min-w-[40px] min-h-[46px] rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 flex items-center justify-center disabled:opacity-40 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Desktop / Tablet: Multi-Card Grid */}
        <div className="hidden sm:grid sm:grid-cols-2 md:grid-cols-3 gap-2">
          {studentMetaList.map((meta) => {
            const { stu, idx, stuPolicy, completedCount, hasGrade } = meta;
            const isSelected = selectedStudentIndex === idx;

            return (
              <button
                key={`${stu.id || 'stu'}_${idx}`}
                type="button"
                onClick={() => onSelectStudentIndex(idx)}
                className={`min-h-[64px] p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50/70 text-blue-900 ring-2 ring-blue-600/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5 text-[10px] font-mono text-slate-500 tabular-nums">
                  <span>NIS: {formatNisVisual(stu.nis)}</span>
                  {renderStageStatusBadge(meta, true)}
                </div>
                <div className="font-bold text-xs mt-1 leading-snug line-clamp-1">
                  {stu.nama}
                </div>
                <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500 mt-0.5 tabular-nums">
                  <span className="truncate">{stu.kelas}</span>
                  <span className="font-semibold shrink-0">
                    T{completedCount}/{stuPolicy.totalStages}
                    {hasGrade ? ' · Nilai ✓' : ''}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Mobile Bottom Sheet / Modal Student Picker */}
      {isSheetOpen && (
        <div
          className="fixed inset-0 z-[70] bg-slate-900/55 backdrop-blur-[1px] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
          onClick={() => setIsSheetOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Daftar Siswa DUDI"
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 max-h-[82dvh] flex flex-col overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2 bg-slate-50/80 shrink-0">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Pilih Siswa · Tahap {activeStageNum}
                </h3>
                <p className="text-[11px] text-slate-500 tabular-nums">
                  {doneInStageCount} dari {dudiStudents.length} siswa sudah tersimpan di tahap ini
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSheetOpen(false)}
                aria-label="Tutup daftar siswa"
                className="min-w-[38px] min-h-[38px] rounded-full hover:bg-slate-200/70 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {(dudiStudents.length > 6 || nextPendingOther) && (
              <div className="px-4 py-2.5 border-b border-slate-100 space-y-2 shrink-0 bg-white">
                {dudiStudents.length > 6 && (
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Cari nama, NIS, atau kelas..."
                      className="w-full min-h-[40px] pl-9 pr-8 py-1.5 rounded-xl border border-slate-300 bg-slate-50 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        aria-label="Hapus pencarian siswa"
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[30px] min-h-[30px] rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}

                {nextPendingOther && (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectStudentIndex(nextPendingOther.idx);
                      setIsSheetOpen(false);
                    }}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-xs font-bold flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span className="truncate">
                      Lompat ke Belum Diisi: {nextPendingOther.stu.nama}
                    </span>
                    <ChevronRight className="w-4 h-4 shrink-0" />
                  </button>
                )}
              </div>
            )}

            <div className="overflow-y-auto flex-1 p-3 space-y-1.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {filteredList.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  Tidak ada siswa yang cocok dengan "{searchQuery.trim()}".
                </div>
              ) : (
                filteredList.map((meta) => {
                  const { stu, idx, stuPolicy, completedCount, hasGrade } = meta;
                  const isSelected = selectedStudentIndex === idx;

                  return (
                    <button
                      key={`sheet_${stu.id || idx}_${idx}`}
                      type="button"
                      onClick={() => {
                        onSelectStudentIndex(idx);
                        setIsSheetOpen(false);
                      }}
                      className={`w-full min-h-[54px] p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2.5 ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/80 ring-2 ring-blue-600/15'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-5 h-5 rounded-md text-[10px] font-mono font-bold flex items-center justify-center shrink-0 tabular-nums ${
                              isSelected
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {idx + 1}
                          </span>
                          <span className="font-bold text-xs text-slate-900 truncate">
                            {stu.nama}
                          </span>
                        </div>
                        <div className="pl-6.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 mt-0.5 tabular-nums">
                          <span>NIS: {formatNisVisual(stu.nis)}</span>
                          <span>·</span>
                          <span>{stu.kelas}</span>
                          <span>·</span>
                          <span>
                            T{completedCount}/{stuPolicy.totalStages}
                            {hasGrade ? ' · Nilai ✓' : ''}
                          </span>
                        </div>
                      </div>
                      {renderStageStatusBadge(meta)}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
