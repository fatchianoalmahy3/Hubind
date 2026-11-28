import React, { useEffect } from 'react';
import {
  Check,
  CheckCheck,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  Loader2,
  Lock,
  ShieldAlert,
} from 'lucide-react';
import { MONITORING_STAGES } from '../../core/types/schema';
import { StageLogEntry, getStageValueByNumber } from '../../core/utils/monitoringHelpers';
import { formatNisVisual } from '../../core/utils/nisHelpers';
import { usePagination } from '../../hooks/usePagination';
import { PaginationBar } from '../PaginationBar';
import {
  ConfirmModalState,
  InspectTarget,
  RecapGroup,
  RecapViewMode,
  StudentMatrixRow,
  VerificationStatus,
  normalizeVerificationStatus,
} from './types';

interface StageStats {
  disabledCount: number;
  notFilled: number;
  terlaksanaTargets: Array<{ student: StudentMatrixRow; log: StageLogEntry }>;
  kakomliTargets: Array<{ student: StudentMatrixRow; log: StageLogEntry }>;
  hubinTargets: Array<{ student: StudentMatrixRow; log: StageLogEntry }>;
}

interface RecapMatrixTableViewProps {
  activeGroup: RecapGroup;
  viewMode: RecapViewMode;
  selectedStageNum: number;
  stageStats: StageStats;
  hubinEligibleTargets: Array<{ student: StudentMatrixRow; log: StageLogEntry }>;
  canVerifyKakomli: boolean;
  canVerifyHubin: boolean;
  isSuperAdmin: boolean;
  isStrictHubinWaitingKakomli: boolean;
  savingId: string | null;
  batchSaving: boolean;
  onSelectStageNum: (stageNum: number) => void;
  onInspectTarget: (target: InspectTarget) => void;
  onUpdateSingleVerification: (
    student: StudentMatrixRow,
    log: StageLogEntry,
    nextStatus: VerificationStatus
  ) => Promise<void>;
  onBatchVerify: (
    targets: Array<{ student: StudentMatrixRow; log: StageLogEntry }>,
    nextStatus: VerificationStatus
  ) => Promise<void>;
  onConfirmSuperAdminBypassSingle: (student: StudentMatrixRow, log: StageLogEntry) => void;
  onOpenConfirmModal: (modal: ConfirmModalState) => void;
}

export const RecapMatrixTableView: React.FC<RecapMatrixTableViewProps> = ({
  activeGroup,
  viewMode,
  selectedStageNum,
  stageStats,
  hubinEligibleTargets,
  canVerifyKakomli,
  canVerifyHubin,
  isSuperAdmin,
  isStrictHubinWaitingKakomli,
  savingId,
  batchSaving,
  onSelectStageNum,
  onInspectTarget,
  onUpdateSingleVerification,
  onBatchVerify,
  onConfirmSuperAdminBypassSingle,
  onOpenConfirmModal,
}) => {
  const {
    paginatedItems: paginatedStudents,
    page,
    pageSize,
    total,
    pageSizeOptions,
    setPage,
    setPageSize,
    resetPage,
  } = usePagination(activeGroup.students, { defaultPageSize: 10 });

  useEffect(() => {
    resetPage();
  }, [activeGroup.key, resetPage]);

  const renderStageCellBadge = (
    student: StudentMatrixRow,
    stageNum: number,
    isActiveCol: boolean
  ) => {
    const log = student.stageLogs[stageNum];
    const isStageEnabled = student.stagePolicy.enabledStages.includes(stageNum);

    if (!log || !log.monitoringId) {
      if (!isStageEnabled) {
        return (
          <span
            className="inline-flex items-center justify-center w-full py-1.5 text-[10px] font-medium text-slate-300 select-none"
            title={`Tahap ${stageNum}: Tidak aktif untuk jurusan ${student.jurusan}`}
          >
            Nonaktif
          </span>
        );
      }
      return (
        <span
          className={`inline-flex items-center justify-center w-full py-1.5 text-xs ${
            isActiveCol ? 'text-slate-400 font-medium' : 'text-slate-300'
          }`}
          title={`Tahap ${stageNum}: Belum diisi guru pembimbing`}
        >
          —
        </span>
      );
    }

    const status = normalizeVerificationStatus(log.status);
    if (status === 'Belum Terlaksana') {
      return (
        <span className="inline-flex items-center justify-center w-full py-1.5 text-xs text-slate-300">
          —
        </span>
      );
    }

    if (status === 'Tervalidasi Hubin') {
      return (
        <button
          type="button"
          onClick={() => onInspectTarget({ student, log })}
          title={`Tahap ${stageNum}: Tervalidasi Hubin (${log.tanggal || '-'})`}
          className="w-full min-h-[34px] px-1.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 inline-flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors"
        >
          <CheckCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span className="text-[10px] font-bold leading-none">Hubin</span>
        </button>
      );
    }

    if (status === 'Tervalidasi Kakomli') {
      return (
        <button
          type="button"
          onClick={() => onInspectTarget({ student, log })}
          title={`Tahap ${stageNum}: Tervalidasi Kakomli (${log.tanggal || '-'})`}
          className="w-full min-h-[34px] px-1.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-800 inline-flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
          <span className="text-[10px] font-bold leading-none">Kakomli</span>
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={() => onInspectTarget({ student, log })}
        title={`Tahap ${stageNum}: Sudah Terlaksana oleh Guru (${log.tanggal || '-'}), menunggu ACC Kakomli`}
        className="w-full min-h-[34px] px-1.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 inline-flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors"
      >
        <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />
        <span className="text-[10px] font-bold leading-none">Terlaksana</span>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {/* Active Group Context Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 leading-snug">
              {activeGroup.title}
            </h2>
            <span className="px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-[11px] font-bold text-blue-800 tabular-nums">
              {activeGroup.students.length} Siswa
            </span>
            {viewMode === 'KELAS' && activeGroup.unplottedCount > 0 && (
              <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-800 tabular-nums">
                {activeGroup.unplottedCount} Belum Terplotting
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
            <span>{activeGroup.secondaryLabel}</span>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span>{activeGroup.subtitle}</span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-slate-600 shrink-0">
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <span>Terlaksana (Menunggu Kakomli)</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
            <span>Tervalidasi Kakomli (Menunggu Hubin)</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
            <span>Terverifikasi Kakomli &amp; Hubin</span>
          </span>
        </div>
      </div>

      {/* Fase Monitoring Selector + Manual Batch Verify Actions */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="text-xs font-bold text-slate-900">
            Pilih Fase Monitoring untuk Verifikasi:
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] tabular-nums">
            <span className="text-slate-500">
              Belum diisi: <strong className="text-slate-800">{stageStats.notFilled}</strong>
            </span>
            {stageStats.disabledCount > 0 && (
              <>
                <span className="text-slate-300">·</span>
                <span className="text-slate-400">
                  Nonaktif: <strong>{stageStats.disabledCount}</strong>
                </span>
              </>
            )}
            <span className="text-slate-300">·</span>
            <span className="text-blue-700 font-semibold">
              Menunggu Kakomli: {stageStats.terlaksanaTargets.length}
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-indigo-700 font-semibold">
              Menunggu Hubin: {stageStats.kakomliTargets.length}
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-emerald-700 font-semibold">
              Lengkap (K+H): {stageStats.hubinTargets.length}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {MONITORING_STAGES.map((st) => {
            const isActive = selectedStageNum === st.num;
            const eligibleStudents = activeGroup.students.filter((s) =>
              s.stagePolicy.enabledStages.includes(st.num)
            );
            const filledCount = activeGroup.students.filter((s) => {
              const l = s.stageLogs[st.num];
              return l?.monitoringId && normalizeVerificationStatus(l.status) !== 'Belum Terlaksana';
            }).length;
            const allDisabled = eligibleStudents.length === 0 && filledCount === 0;

            return (
              <button
                key={st.num}
                type="button"
                onClick={() => onSelectStageNum(st.num)}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-semibold shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                  isActive
                    ? 'bg-slate-900 border-slate-900 text-white'
                    : allDisabled
                    ? 'bg-slate-50/60 border-slate-200/80 text-slate-400 hover:bg-slate-100'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span>{st.label}</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums ${
                    isActive ? 'bg-white/20 text-white' : 'bg-white text-slate-600 border border-slate-200'
                  }`}
                >
                  {allDisabled
                    ? 'Nonaktif'
                    : `${filledCount}/${eligibleStudents.length || activeGroup.students.length}`}
                </span>
              </button>
            );
          })}
        </div>

        {/* Manual Verification Action Strip */}
        {(canVerifyKakomli || canVerifyHubin) && (
          <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-slate-500">
              {isStrictHubinWaitingKakomli &&
              stageStats.terlaksanaTargets.length > 0 &&
              hubinEligibleTargets.length === 0 ? (
                `${stageStats.terlaksanaTargets.length} siswa pada ${getStageValueByNumber(selectedStageNum)} masih menunggu ACC Kakomli sebelum Validasi Hubin dapat dilakukan.`
              ) : (
                <>
                  Verifikasi berjenjang (Kakomli lalu Hubin) pada{' '}
                  <strong className="text-slate-700">{getStageValueByNumber(selectedStageNum)}</strong>.
                </>
              )}
            </p>

            <div className="flex flex-wrap items-center gap-2">
              {canVerifyKakomli && stageStats.terlaksanaTargets.length > 0 && (
                <button
                  type="button"
                  disabled={batchSaving}
                  onClick={() =>
                    onOpenConfirmModal({
                      isOpen: true,
                      title: `Verifikasi Kakomli (${stageStats.terlaksanaTargets.length} Siswa)?`,
                      description: `Status tahap ${getStageValueByNumber(
                        selectedStageNum
                      )} untuk ${stageStats.terlaksanaTargets.length} siswa berstatus Terlaksana di ${
                        activeGroup.title
                      } akan diverifikasi menjadi Tervalidasi Kakomli.`,
                      confirmText: 'Ya, Verifikasi Kakomli',
                      variant: 'primary',
                      onConfirm: async () => {
                        await onBatchVerify(stageStats.terlaksanaTargets, 'Tervalidasi Kakomli');
                      },
                    })
                  }
                  className="h-9 px-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Verifikasi Kakomli Tahap {selectedStageNum} ({stageStats.terlaksanaTargets.length})
                  </span>
                </button>
              )}

              {canVerifyHubin && hubinEligibleTargets.length > 0 && (
                <button
                  type="button"
                  disabled={batchSaving}
                  onClick={() =>
                    onOpenConfirmModal({
                      isOpen: true,
                      title: `Verifikasi Hubin (${hubinEligibleTargets.length} Siswa)?`,
                      description: `Status tahap ${getStageValueByNumber(
                        selectedStageNum
                      )} untuk ${hubinEligibleTargets.length} siswa di ${
                        activeGroup.title
                      } akan divalidasi menjadi Tervalidasi Hubin.`,
                      confirmText: 'Ya, Validasi Hubin',
                      variant: 'success',
                      onConfirm: async () => {
                        await onBatchVerify(hubinEligibleTargets, 'Tervalidasi Hubin');
                      },
                    })
                  }
                  className="h-9 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  <CheckCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Verifikasi Hubin Tahap {selectedStageNum} ({hubinEligibleTargets.length})
                  </span>
                </button>
              )}

              {isSuperAdmin && stageStats.terlaksanaTargets.length > 0 && (
                <button
                  type="button"
                  disabled={batchSaving}
                  onClick={() =>
                    onOpenConfirmModal({
                      isOpen: true,
                      title: `Bypass Kakomli & Validasi Hubin (${stageStats.terlaksanaTargets.length} Siswa)?`,
                      description: `SuperAdmin Override: ${stageStats.terlaksanaTargets.length} siswa berstatus Terlaksana pada ${getStageValueByNumber(
                        selectedStageNum
                      )} di ${activeGroup.title} akan langsung divalidasi menjadi Tervalidasi Hubin tanpa menunggu ACC Kakomli.`,
                      confirmText: 'Ya, Bypass ke Hubin',
                      variant: 'danger',
                      onConfirm: async () => {
                        await onBatchVerify(stageStats.terlaksanaTargets, 'Tervalidasi Hubin');
                      },
                    })
                  }
                  className="h-9 px-3.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>
                    Bypass Kakomli → Hubin ({stageStats.terlaksanaTargets.length})
                  </span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Matrix Table: Student x Monitoring Phases */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                <th className="py-3 px-3.5 sticky left-0 z-10 bg-slate-50 border-r border-slate-200 min-w-[190px] sm:min-w-[235px]">
                  {viewMode === 'DUDI' ? 'Siswa & Jurusan' : 'Siswa & Lokasi DUDI'}
                </th>
                {MONITORING_STAGES.map((st) => {
                  const isActiveCol = st.num === selectedStageNum;
                  const headerLabel = st.num === 5 ? 'Mon 4' : st.shortLabel;
                  return (
                    <th
                      key={st.num}
                      onClick={() => onSelectStageNum(st.num)}
                      className={`py-2.5 px-2 text-center min-w-[82px] cursor-pointer transition-colors select-none ${
                        isActiveCol
                          ? 'bg-blue-50 text-blue-900 border-b-2 border-b-blue-600'
                          : 'hover:bg-slate-100'
                      }`}
                    >
                      <div className="font-mono text-[10px] text-slate-400">Tahap {st.num}</div>
                      <div className="whitespace-nowrap">{headerLabel}</div>
                    </th>
                  );
                })}
                <th
                  className="py-2.5 px-2.5 text-center min-w-[76px]"
                  title="Akumulasi Sakit / Izin / Alpha (termasuk Perizinan SO/SD/I; Dispensasi ID tidak dijumlahkan)"
                >
                  S/I/A
                </th>
                <th className="py-2.5 px-2.5 text-center min-w-[64px]">Nilai</th>
                <th className="py-2.5 px-3 text-right min-w-[155px]">
                  Aksi Tahap {selectedStageNum}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedStudents.map((student) => {
                const activeLog = student.stageLogs[selectedStageNum];
                const activeStatus = activeLog?.monitoringId
                  ? normalizeVerificationStatus(activeLog.status)
                  : 'Belum Terlaksana';
                const isStageEnabled = student.stagePolicy.enabledStages.includes(selectedStageNum);
                const isRowSaving = Boolean(
                  activeLog?.monitoringId && savingId === activeLog.monitoringId
                );

                return (
                  <tr key={student.placementId} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-3.5 sticky left-0 z-10 bg-white border-r border-slate-100 align-middle">
                      <div className="font-bold text-slate-900 leading-snug">
                        {student.namaSiswa}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                        {formatNisVisual(student.nis)} · {student.kelas}
                      </div>
                      {viewMode === 'KELAS' ? (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {student.isPlotted ? (
                            <span className="text-[11px] font-medium text-blue-700 leading-snug">
                              {student.namaDudi}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-semibold">
                              Belum Terplotting
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {student.jurusan}
                          {student.stagePolicy.isCustomJurusanPolicy
                            ? ` · ${student.stagePolicy.totalStages} tahap`
                            : ''}
                        </div>
                      )}
                    </td>

                    {MONITORING_STAGES.map((st) => {
                      const isActiveCol = st.num === selectedStageNum;
                      return (
                        <td
                          key={st.num}
                          className={`py-2 px-1.5 text-center align-middle ${
                            isActiveCol ? 'bg-blue-50/35' : ''
                          }`}
                        >
                          {renderStageCellBadge(student, st.num, isActiveCol)}
                        </td>
                      );
                    })}

                    <td
                      className="py-2 px-2.5 text-center align-middle font-mono text-slate-700 tabular-nums whitespace-nowrap"
                      title={
                        student.perizinanSakit > 0 ||
                        student.perizinanIzin > 0 ||
                        student.dispensasiDays > 0
                          ? `Dari Perizinan: Sakit +${student.perizinanSakit} hr, Izin +${student.perizinanIzin} hr${
                              student.dispensasiDays > 0
                                ? ` (Dispensasi ${student.dispensasiDays} hr tdk dijumlahkan)`
                                : ''
                            }`
                          : 'Akumulasi Monitoring + Perizinan (SO/SD/I)'
                      }
                    >
                      <span>
                        {student.sakit}/{student.izin}/{student.alpha}
                      </span>
                      {(student.perizinanSakit > 0 || student.perizinanIzin > 0) && (
                        <div className="text-[10px] text-blue-600 font-sans font-semibold leading-tight mt-0.5">
                          +Izin
                        </div>
                      )}
                    </td>

                    <td className="py-2 px-2.5 text-center align-middle font-mono font-bold tabular-nums">
                      {student.hasGrade && student.rataRataNilai !== null ? (
                        <span className="text-emerald-700">{student.rataRataNilai}</span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>

                    <td className="py-2 px-3 text-right align-middle whitespace-nowrap">
                      {!activeLog || !activeLog.monitoringId || activeStatus === 'Belum Terlaksana' ? (
                        <span className="text-[11px] text-slate-400">
                          {isStageEnabled ? 'Belum ada data' : 'Nonaktif jurusan'}
                        </span>
                      ) : (
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {canVerifyKakomli && activeStatus === 'Terlaksana' && (
                            <button
                              type="button"
                              disabled={isRowSaving || batchSaving}
                              onClick={() =>
                                onUpdateSingleVerification(
                                  student,
                                  activeLog,
                                  'Tervalidasi Kakomli'
                                )
                              }
                              className="h-8 px-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              {isRowSaving ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <ClipboardCheck className="w-3.5 h-3.5" />
                              )}
                              <span>Verifikasi</span>
                            </button>
                          )}

                          {isSuperAdmin && activeStatus === 'Terlaksana' && (
                            <button
                              type="button"
                              disabled={isRowSaving || batchSaving}
                              onClick={() => onConfirmSuperAdminBypassSingle(student, activeLog)}
                              title="SuperAdmin Bypass: Validasi Hubin tanpa menunggu Kakomli"
                              className="h-8 px-2.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                              <span>Bypass</span>
                            </button>
                          )}

                          {canVerifyHubin && activeStatus === 'Tervalidasi Kakomli' && (
                            <button
                              type="button"
                              disabled={isRowSaving || batchSaving}
                              onClick={() =>
                                onUpdateSingleVerification(
                                  student,
                                  activeLog,
                                  'Tervalidasi Hubin'
                                )
                              }
                              className="h-8 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              {isRowSaving ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <CheckCheck className="w-3.5 h-3.5" />
                              )}
                              <span>Validasi Hubin</span>
                            </button>
                          )}

                          {isStrictHubinWaitingKakomli && activeStatus === 'Terlaksana' && (
                            <span
                              className="px-2 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-semibold inline-flex items-center gap-1"
                              title="Validasi Hubin wajib menunggu persetujuan Kakomli terlebih dahulu"
                            >
                              <Lock className="w-3 h-3 text-amber-600 shrink-0" />
                              <span>Menunggu ACC Kakomli</span>
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => onInspectTarget({ student, log: activeLog })}
                            className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                            title="Lihat rincian catatan monitoring"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-500" />
                            <span>Detail</span>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <PaginationBar
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={pageSizeOptions}
          itemLabel="siswa"
        />
      </div>
    </div>
  );
};
