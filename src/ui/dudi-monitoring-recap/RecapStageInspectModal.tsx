import React from 'react';
import { CheckCheck, CheckCircle2, Loader2, Lock, ShieldAlert, X } from 'lucide-react';
import { formatIndonesianDate } from '../../core/utils/dateHelpers';
import { StageLogEntry, formatBukuLaporanLabel, getStageValueByNumber } from '../../core/utils/monitoringHelpers';
import { CrudLoadingOverlay, TopProgressBar } from '../CrudProgressFeedback';
import {
  InspectTarget,
  StudentMatrixRow,
  VerificationStatus,
  normalizeVerificationStatus,
} from './types';

interface RecapStageInspectModalProps {
  inspectTarget: InspectTarget | null;
  savingId: string | null;
  canVerifyKakomli: boolean;
  canVerifyHubin: boolean;
  isSuperAdmin: boolean;
  isStrictHubinWaitingKakomli: boolean;
  onClose: () => void;
  onUpdateSingleVerification: (
    student: StudentMatrixRow,
    log: StageLogEntry,
    nextStatus: VerificationStatus
  ) => Promise<void>;
  onConfirmSuperAdminBypassSingle: (student: StudentMatrixRow, log: StageLogEntry) => void;
}

export const RecapStageInspectModal: React.FC<RecapStageInspectModalProps> = ({
  inspectTarget,
  savingId,
  canVerifyKakomli,
  canVerifyHubin,
  isSuperAdmin,
  isStrictHubinWaitingKakomli,
  onClose,
  onUpdateSingleVerification,
  onConfirmSuperAdminBypassSingle,
}) => {
  if (!inspectTarget) return null;

  const isSaving = savingId === inspectTarget.log.monitoringId;
  const currentStatus = normalizeVerificationStatus(inspectTarget.log.status);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/55 backdrop-blur-[2px]"
      onClick={() => !isSaving && onClose()}
    >
      <div
        className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 leading-snug">
              {inspectTarget.student.namaSiswa}
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {getStageValueByNumber(inspectTarget.log.stageNum)} · {inspectTarget.student.kelas} ·{' '}
              {inspectTarget.student.namaDudi}
            </p>
          </div>
          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            aria-label="Tutup detail monitoring"
            className="w-8 h-8 rounded-lg hover:bg-slate-200/70 text-slate-500 flex items-center justify-center cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <TopProgressBar
          active={isSaving}
          label="Menyimpan verifikasi monitoring ke Cloud Server"
        />

        <div className="p-5 overflow-y-auto space-y-3.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50/70">
            <div>
              <div className="text-[11px] text-slate-500">Status Verifikasi Tahap Ini</div>
              <div className="font-bold text-slate-900 mt-0.5">{currentStatus}</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-slate-500">Tanggal Kunjungan</div>
              <div className="font-semibold text-slate-800 mt-0.5">
                {inspectTarget.log.tanggal
                  ? formatIndonesianDate(inspectTarget.log.tanggal)
                  : '-'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 rounded-xl border border-slate-200">
              <div className="text-[11px] text-slate-500">Absensi Tahap Ini (S / I / A)</div>
              <div className="font-mono font-bold text-slate-900 mt-0.5 tabular-nums">
                {inspectTarget.log.sakit} / {inspectTarget.log.izin} / {inspectTarget.log.alpha}
              </div>
              <div className="text-[10px] text-slate-500 mt-1 tabular-nums">
                Total Akumulasi:{' '}
                <b>
                  {inspectTarget.student.sakit}/{inspectTarget.student.izin}/
                  {inspectTarget.student.alpha}
                </b>
                {(inspectTarget.student.perizinanSakit > 0 ||
                  inspectTarget.student.perizinanIzin > 0) &&
                  ` (termasuk Izin S+${inspectTarget.student.perizinanSakit}, I+${inspectTarget.student.perizinanIzin})`}
              </div>
            </div>
            <div className="p-3 rounded-xl border border-slate-200">
              <div className="text-[11px] text-slate-500">Buku Laporan</div>
              <div className="font-bold text-slate-900 mt-0.5">
                {formatBukuLaporanLabel(inspectTarget.log.bukuLaporan)}
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl border border-slate-200 space-y-1">
            <div className="text-[11px] text-slate-500">Aktivitas &amp; Sikap Siswa</div>
            <div className="font-semibold text-slate-800">
              Disiplin: {inspectTarget.log.aktivitasDp || '-'} · Motivasi:{' '}
              {inspectTarget.log.aktivitasMt || '-'} · Kreativitas:{' '}
              {inspectTarget.log.aktivitasKrt || '-'}
            </div>
          </div>

          {inspectTarget.log.kompetensiList.length > 0 && (
            <div className="p-3 rounded-xl border border-slate-200 space-y-1">
              <div className="text-[11px] text-slate-500">Kompetensi Didapat</div>
              <ul className="list-decimal pl-4 space-y-0.5 text-slate-800">
                {inspectTarget.log.kompetensiList.map((k, idx) => (
                  <li key={idx}>{k}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="p-3 rounded-xl border border-slate-200 space-y-1">
            <div className="text-[11px] text-slate-500">Catatan Kunjungan Guru</div>
            <p className="text-slate-800 leading-relaxed whitespace-pre-wrap">
              {inspectTarget.log.catatan || 'Tidak ada catatan tambahan.'}
            </p>
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            className="h-9 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Tutup
          </button>

          {canVerifyKakomli && currentStatus === 'Terlaksana' && (
            <button
              type="button"
              disabled={isSaving}
              onClick={() =>
                onUpdateSingleVerification(
                  inspectTarget.student,
                  inspectTarget.log,
                  'Tervalidasi Kakomli'
                )
              }
              className="h-9 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              <span>{isSaving ? 'Menyimpan...' : 'Verifikasi Kakomli'}</span>
            </button>
          )}

          {isSuperAdmin && currentStatus === 'Terlaksana' && (
            <button
              type="button"
              disabled={isSaving}
              onClick={() =>
                onConfirmSuperAdminBypassSingle(inspectTarget.student, inspectTarget.log)
              }
              className="h-9 px-3.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
              <span>Bypass Kakomli &amp; Validasi Hubin</span>
            </button>
          )}

          {canVerifyHubin && currentStatus === 'Tervalidasi Kakomli' && (
            <button
              type="button"
              disabled={isSaving}
              onClick={() =>
                onUpdateSingleVerification(
                  inspectTarget.student,
                  inspectTarget.log,
                  'Tervalidasi Hubin'
                )
              }
              className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCheck className="w-3.5 h-3.5" />
              )}
              <span>{isSaving ? 'Menyimpan...' : 'Verifikasi Hubin'}</span>
            </button>
          )}

          {isStrictHubinWaitingKakomli && currentStatus === 'Terlaksana' && (
            <span className="text-[11px] font-medium text-amber-800 inline-flex items-center gap-1 mr-auto">
              <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Menunggu ACC Kakomli sebelum validasi Hubin.</span>
            </span>
          )}
        </div>

        <CrudLoadingOverlay
          visible={isSaving}
          tone="emerald"
          title="Menyimpan Verifikasi ke Cloud Server..."
          subtitle="Mohon tunggu sejenak hingga status verifikasi diperbarui."
        />
      </div>
    </div>
  );
};
