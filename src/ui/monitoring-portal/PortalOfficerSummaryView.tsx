import React, { useMemo } from 'react';
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  LogOut,
  ShieldCheck,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { MonitoringStageControl } from '../../core/types/schema';
import { resolveMonitoringStagePolicy } from '../../core/utils/monitoringHelpers';
import { formatNisVisual } from '../../core/utils/nisHelpers';

interface PortalOfficerSummaryViewProps {
  petugasNama: string;
  petugasNip: string;
  isOnline: boolean;
  assignedDudiList: any[];
  selectedDudi: any;
  dudiStudents: any[];
  stageControl: MonitoringStageControl;
  disabled?: boolean;
  onGoToDudiList: () => void;
  onGoToMonitoringStudent: (studentIdx?: number) => void;
  onLogout: () => void;
}

export const PortalOfficerSummaryView: React.FC<PortalOfficerSummaryViewProps> = ({
  petugasNama,
  petugasNip,
  isOnline,
  assignedDudiList,
  selectedDudi,
  dudiStudents,
  stageControl,
  disabled = false,
  onGoToDudiList,
  onGoToMonitoringStudent,
  onLogout,
}) => {
  const totalSiswaDiampu = useMemo(() => {
    return assignedDudiList.reduce(
      (sum, d) => sum + (Number(d?.jumlahSiswa ?? d?.kuota) || 0),
      0
    );
  }, [assignedDudiList]);

  const activeDudiStats = useMemo(() => {
    if (!selectedDudi || dudiStudents.length === 0) {
      return { total: 0, allStagesDone: 0, gradedCount: 0 };
    }
    let allStagesDone = 0;
    let gradedCount = 0;
    dudiStudents.forEach((stu) => {
      const pol =
        stu.stagePolicy || resolveMonitoringStagePolicy(stageControl, stu.jurusan);
      const comp: number[] = Array.isArray(stu.completedStages)
        ? stu.completedStages
        : [];
      const doneCnt = comp.filter((n) => pol.enabledStages.includes(n)).length;
      if (doneCnt >= pol.totalStages) allStagesDone += 1;
      if (stu.hasSubmittedGrades) gradedCount += 1;
    });
    return { total: dudiStudents.length, allStagesDone, gradedCount };
  }, [selectedDudi, dudiStudents, stageControl]);

  return (
    <div className="space-y-3.5 animate-in fade-in duration-150">
      {/* Officer Profile Card */}
      <div className="p-3.5 sm:p-4 rounded-2xl border border-blue-200 bg-blue-50/70 space-y-3">
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 block">
                Petugas Monitoring Aktif
              </span>
              <h3 className="text-sm font-bold text-slate-900 leading-snug truncate">
                {petugasNama || '-'}
              </h3>
              {petugasNip && petugasNip !== '-' && (
                <p className="text-[11px] font-mono text-slate-600 tabular-nums">
                  NIP: {petugasNip}
                </p>
              )}
            </div>
          </div>

          <span
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border shrink-0 ${
              isOnline
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}
          >
            {isOnline ? (
              <Wifi className="w-3 h-3" />
            ) : (
              <WifiOff className="w-3 h-3" />
            )}
            <span>{isOnline ? 'Online' : 'Offline'}</span>
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2.5 rounded-xl bg-white border border-blue-100">
            <span className="text-[10px] text-slate-500 block">DUDI Diampu</span>
            <span className="text-base font-bold text-slate-900 tabular-nums">
              {assignedDudiList.length}{' '}
              <span className="text-[11px] font-medium text-slate-500">DUDI</span>
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-white border border-blue-100">
            <span className="text-[10px] text-slate-500 block">Total Siswa PKL</span>
            <span className="text-base font-bold text-slate-900 tabular-nums">
              {totalSiswaDiampu}{' '}
              <span className="text-[11px] font-medium text-slate-500">Siswa</span>
            </span>
          </div>
        </div>
      </div>

      {/* Active DUDI Progress */}
      {selectedDudi ? (
        <div className="p-3.5 sm:p-4 rounded-2xl border border-slate-200 bg-white space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                DUDI Sedang Dibuka
              </span>
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-snug">
                {selectedDudi.nama}
              </h4>
              <p className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                {activeDudiStats.total} Siswa · {activeDudiStats.gradedCount} Nilai Terinput ·{' '}
                {activeDudiStats.allStagesDone} Tuntas Semua Tahap
              </p>
            </div>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onGoToMonitoringStudent()}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <span>Buka Form</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {dudiStudents.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <div className="text-[11px] font-semibold text-slate-600 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                <span>Ketuk siswa untuk langsung buka form monitoringnya:</span>
              </div>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {dudiStudents.map((stu, idx) => {
                  const pol =
                    stu.stagePolicy ||
                    resolveMonitoringStagePolicy(stageControl, stu.jurusan);
                  const comp: number[] = Array.isArray(stu.completedStages)
                    ? stu.completedStages
                    : [];
                  const doneCount = comp.filter((n) =>
                    pol.enabledStages.includes(n)
                  ).length;

                  return (
                    <button
                      key={`${stu.id || idx}_prog`}
                      type="button"
                      disabled={disabled}
                      onClick={() => onGoToMonitoringStudent(idx)}
                      className="w-full min-h-[48px] px-3 py-2 bg-white hover:bg-slate-50 text-left flex items-center justify-between gap-2 cursor-pointer transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">
                          {stu.nama}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono tabular-nums">
                          NIS: {formatNisVisual(stu.nis)} · {stu.kelas}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 tabular-nums">
                        {stu.hasSubmittedGrades && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            <span>Nilai</span>
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold">
                          {doneCount}/{pol.totalStages}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50/70 text-center space-y-2.5">
          <Building2 className="w-7 h-7 text-slate-400 mx-auto" />
          <div className="text-xs font-bold text-slate-800">
            Belum Ada DUDI yang Dipilih
          </div>
          <p className="text-[11px] text-slate-500">
            Pilih DUDI bimbingan pada tab DUDI untuk mulai mengisi absensi, kondisi bengkel, dan nilai PKL.
          </p>
          <button
            type="button"
            onClick={onGoToDudiList}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
          >
            Pilih DUDI Bimbingan
          </button>
        </div>
      )}

      {/* Logout Button */}
      <div className="pt-1">
        <button
          type="button"
          disabled={disabled}
          onClick={onLogout}
          className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <LogOut className="w-4 h-4" />
          <span>Ganti Petugas Monitoring</span>
        </button>
      </div>
    </div>
  );
};
