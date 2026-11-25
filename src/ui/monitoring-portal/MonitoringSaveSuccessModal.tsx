import React from 'react';
import { ArrowRight, CheckCircle2, ClipboardCheck, ShieldCheck } from 'lucide-react';
import { formatNisVisual } from '../../core/utils/nisHelpers';
import type { MonitoringSaveReceipt } from './types';

interface MonitoringSaveSuccessModalProps {
  receipt: MonitoringSaveReceipt | null;
  onContinueNext: () => void;
  onStayHere: () => void;
  onClosePortal: () => void;
}

export const MonitoringSaveSuccessModal: React.FC<MonitoringSaveSuccessModalProps> = ({
  receipt,
  onContinueNext,
  onStayHere,
  onClosePortal,
}) => {
  if (!receipt) return null;

  const formattedTime = receipt.savedAt
    ? new Date(receipt.savedAt).toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '';

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="monitoring-save-receipt-title"
        className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-6 pb-4 text-center space-y-2.5 border-b border-slate-100 bg-emerald-50/50">
          <div className="w-14 h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-sm">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-emerald-200 text-[11px] font-bold text-emerald-800">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Data Monitoring Resmi Masuk ke Cloud Server</span>
          </div>
          <h3
            id="monitoring-save-receipt-title"
            className="text-base sm:text-lg font-bold text-slate-900"
          >
            {receipt.isDeliveryBatch
              ? 'Validasi & Pengantaran DUDI Tersimpan!'
              : `Monitoring ${receipt.stageLabel} Tersimpan!`}
          </h3>
          <p className="text-[11px] text-slate-600">
            {receipt.sheetRowNumber
              ? `Terverifikasi di Cloud Server (Record #${receipt.sheetRowNumber})`
              : 'Terverifikasi masuk ke Database Cloud Server'}
            {formattedTime ? ` · Pukul ${formattedTime} WIB` : ''}
          </p>
        </div>

        <div className="p-4 sm:p-5 space-y-3 text-xs">
          {receipt.isDeliveryBatch ? (
            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 space-y-2">
              <div className="flex justify-between items-start gap-2 pb-1.5 border-b border-slate-200/70">
                <span className="text-slate-500 shrink-0">DUDI</span>
                <span className="font-bold text-slate-900 text-right leading-snug">
                  {receipt.dudiName}
                </span>
              </div>
              <div className="flex justify-between items-start gap-2 pb-1.5 border-b border-slate-200/70">
                <span className="text-slate-500 shrink-0">Petugas DUDI</span>
                <span className="font-semibold text-slate-800 text-right leading-snug">
                  {receipt.dudiPic || receipt.dudiPemimpin || '-'}
                  {receipt.dudiKontak ? (
                    <span className="block font-mono text-[11px] text-slate-500">
                      {receipt.dudiKontak}
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="flex justify-between items-start gap-2 pb-1.5 border-b border-slate-200/70">
                <span className="text-slate-500 shrink-0">Siswa Diantar</span>
                <span className="font-semibold text-slate-800 text-right leading-snug">
                  {(receipt.deliveredStudents || []).length} Siswa (
                  {(receipt.deliveredStudents || []).map((s) => s.nama).join(', ')})
                </span>
              </div>
              <div className="flex justify-between items-center gap-2 pt-0.5">
                <span className="text-slate-500 shrink-0">Validasi &amp; TTD</span>
                <span className="font-semibold text-emerald-700 inline-flex items-center gap-1 text-right">
                  <ClipboardCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>Pengantaran Terlaksana · TTD Siswa Sah</span>
                </span>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 space-y-2">
              <div className="flex justify-between gap-2 pb-1.5 border-b border-slate-200/70">
                <span className="text-slate-500">ID Monitoring</span>
                <span className="font-mono font-bold text-blue-700 text-right">
                  {receipt.idMonitoring}
                </span>
              </div>
              <div className="flex justify-between gap-2 pb-1.5 border-b border-slate-200/70">
                <span className="text-slate-500">Siswa</span>
                <span className="font-bold text-slate-900 text-right">
                  {receipt.studentName} ({formatNisVisual(receipt.studentNis)})
                </span>
              </div>
              <div className="flex justify-between items-start gap-2 pb-1.5 border-b border-slate-200/70">
                <span className="text-slate-500 shrink-0">DUDI</span>
                <span className="font-semibold text-slate-800 text-right leading-snug">
                  {receipt.dudiName}
                </span>
              </div>
              <div className="flex justify-between gap-2 pb-1.5 border-b border-slate-200/70">
                <span className="text-slate-500">Presensi (S / I / A)</span>
                <span className="font-mono font-bold text-slate-800 tabular-nums">
                  S:{receipt.sakit} · I:{receipt.izin} · A:{receipt.alpha}
                </span>
              </div>
              <div className="flex justify-between items-start gap-2 pb-1.5 border-b border-slate-200/70">
                <span className="text-slate-500 shrink-0">Format 07.01 &amp; TTD</span>
                <span className="font-semibold text-emerald-700 inline-flex items-center gap-1 text-right">
                  <ClipboardCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Laporan {receipt.bukuLaporan || '-'} · {receipt.ttdSigned ? 'TTD Sah' : 'Tanpa TTD'}
                  </span>
                </span>
              </div>
              {receipt.gradeAvg !== undefined && receipt.gradeAvg > 0 && (
                <div className="flex justify-between gap-2 pt-0.5">
                  <span className="text-slate-500">Nilai DUDI</span>
                  <span className="font-bold text-indigo-700 tabular-nums">
                    {receipt.gradeAvg} ({receipt.gradePredikat || 'Tercatat'})
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2 pt-1">
            {receipt.nextStudentIndex !== undefined && receipt.nextStudentName && (
              <button
                type="button"
                onClick={onContinueNext}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer text-center leading-snug"
              >
                <span>
                  {receipt.isDeliveryBatch
                    ? receipt.nextStudentName
                    : `Lanjut Siswa Berikutnya: ${receipt.nextStudentName}`}
                </span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onStayHere}
                className="min-h-[44px] px-2.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs cursor-pointer whitespace-nowrap"
              >
                Tetap di Sini
              </button>
              <button
                type="button"
                onClick={onClosePortal}
                className="min-h-[44px] px-2.5 py-2 rounded-xl border border-emerald-600 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer whitespace-nowrap"
              >
                Selesai &amp; Tutup
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
