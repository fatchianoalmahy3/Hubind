import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Mic,
  MicOff,
  Pencil,
} from 'lucide-react';
import type { MonitoringStageControl } from '../../core/types/schema';
import { formatRangePair } from '../../core/utils/monitoringHelpers';
import { formatNisVisual } from '../../core/utils/nisHelpers';
import { appendVoiceTranscript } from '../../hooks/useVoiceDictation';
import { SignaturePadInput } from './SignaturePadInput';
import { WorkScheduleRangeInputs } from './WorkScheduleRangeInputs';
import {
  DELIVERY_CATATAN_PRESETS,
  getStudentKey,
  isDudiContactIncomplete,
} from './types';

interface DeliveryStageSectionProps {
  selectedDudi: any;
  dudiStudents: any[];
  stageControl: MonitoringStageControl;
  isStageReadOnly: boolean;
  dudiPemimpin: string;
  dudiPic: string;
  dudiTelp: string;
  dudiHariMulai: string;
  dudiHariSelesai: string;
  dudiJamMulai: string;
  dudiJamSelesai: string;
  deliveryTtdByKey: Record<string, string>;
  deliveryCatatan: string;
  deliveryContactConfirmed: boolean;
  deliverySelectedKeys: string[];
  onChangeDudiPemimpin: (val: string) => void;
  onChangeDudiPic: (val: string) => void;
  onChangeDudiTelp: (val: string) => void;
  onChangeDudiHariMulai: (val: string) => void;
  onChangeDudiHariSelesai: (val: string) => void;
  onChangeDudiJamMulai: (val: string) => void;
  onChangeDudiJamSelesai: (val: string) => void;
  onChangeDeliveryStudentTtd: (stuKey: string, val: string) => void;
  onChangeDeliveryCatatan: (val: string) => void;
  onChangeDeliveryContactConfirmed: (val: boolean) => void;
  onToggleDeliveryStudentKey: (stuKey: string) => void;
  voiceSupported: boolean;
  voiceActiveFieldId: string | null;
  voiceInterimText: string;
  voiceError: string;
  onToggleVoice: (fieldId: string, onFinal: (spoken: string) => void) => void;
}

export const DeliveryStageSection: React.FC<DeliveryStageSectionProps> = ({
  selectedDudi,
  dudiStudents,
  stageControl,
  isStageReadOnly,
  dudiPemimpin,
  dudiPic,
  dudiTelp,
  dudiHariMulai,
  dudiHariSelesai,
  dudiJamMulai,
  dudiJamSelesai,
  deliveryTtdByKey,
  deliveryCatatan,
  deliveryContactConfirmed,
  deliverySelectedKeys,
  onChangeDudiPemimpin,
  onChangeDudiPic,
  onChangeDudiTelp,
  onChangeDudiHariMulai,
  onChangeDudiHariSelesai,
  onChangeDudiJamMulai,
  onChangeDudiJamSelesai,
  onChangeDeliveryStudentTtd,
  onChangeDeliveryCatatan,
  onChangeDeliveryContactConfirmed,
  onToggleDeliveryStudentKey,
  voiceSupported,
  voiceActiveFieldId,
  voiceInterimText,
  voiceError,
  onToggleVoice,
}) => {
  const isBiodataComplete =
    !isDudiContactIncomplete(dudiPemimpin, dudiPic, dudiTelp) &&
    Boolean(dudiHariMulai && dudiHariSelesai && dudiJamMulai && dudiJamSelesai);

  const dudiIdentityKey = String(selectedDudi?.id || selectedDudi?.nama || '');
  const prevDudiRef = useRef(dudiIdentityKey);
  const [bioExpanded, setBioExpanded] = useState<boolean>(() => !isBiodataComplete);

  useEffect(() => {
    if (prevDudiRef.current !== dudiIdentityKey) {
      prevDudiRef.current = dudiIdentityKey;
      setBioExpanded(!isBiodataComplete);
    } else if (!isBiodataComplete) {
      setBioExpanded(true);
    }
  }, [dudiIdentityKey, isBiodataComplete]);

  return (
    <div className="space-y-3">
      {/* Biodata & Jadwal Kerja DUDI (Smart Auto-Collapse bila data sudah terisi lengkap) */}
      {!bioExpanded && isBiodataComplete ? (
        <div className="p-3 sm:px-4 sm:py-3 rounded-xl border border-emerald-200 bg-emerald-50/60 space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Biodata &amp; Jadwal Kerja DUDI Lengkap</span>
              </div>
              <p className="text-[11px] text-slate-700 leading-snug">
                Pemimpin: <b>{dudiPemimpin}</b> · PIC: <b>{dudiPic}</b> · Telp:{' '}
                <b className="font-mono">{dudiTelp}</b> ·{' '}
                <b>{formatRangePair(dudiHariMulai, dudiHariSelesai)}</b> (
                <span className="font-mono">
                  {formatRangePair(dudiJamMulai, dudiJamSelesai)}
                </span>
                )
              </p>
            </div>
            <button
              type="button"
              onClick={() => setBioExpanded(true)}
              className="min-h-[34px] px-2.5 py-1 rounded-lg border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-800 font-bold text-[11px] inline-flex items-center gap-1 shrink-0 cursor-pointer whitespace-nowrap"
            >
              <Pencil className="w-3 h-3" />
              <span>{isStageReadOnly ? 'Lihat' : 'Cek / Ubah'}</span>
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>

          <label className="p-2.5 rounded-xl border border-emerald-200 bg-white flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              disabled={isStageReadOnly}
              checked={deliveryContactConfirmed}
              onChange={(e) => onChangeDeliveryContactConfirmed(e.target.checked)}
              className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 w-4 h-4 shrink-0 cursor-pointer"
            />
            <span className="text-[11px] font-semibold text-slate-800 leading-snug">
              Saya mengonfirmasi data Pemimpin, Pembimbing DUDI, telepon/WA, dan jadwal kerja di atas sudah benar.
            </span>
          </label>
        </div>
      ) : (
        <div className="p-3 sm:p-4 rounded-xl border border-blue-200 bg-blue-50/50 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-blue-700 mb-0.5">
                1× Per DUDI · Validasi Pengantaran
              </div>
              <h5 className="text-xs sm:text-sm font-bold text-slate-900">
                Validasi Petugas &amp; Jadwal Kerja DUDI
              </h5>
            </div>
            {isBiodataComplete && (
              <button
                type="button"
                onClick={() => setBioExpanded(false)}
                className="min-h-[32px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-700 inline-flex items-center gap-1 cursor-pointer"
              >
                <span>Ringkas</span>
                <ChevronUp className="w-3.5 h-3.5" />
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
            required={true}
            onChangeHariMulai={onChangeDudiHariMulai}
            onChangeHariSelesai={onChangeDudiHariSelesai}
            onChangeJamMulai={onChangeDudiJamMulai}
            onChangeJamSelesai={onChangeDudiJamSelesai}
          />

          <label className="p-2.5 sm:p-3 rounded-xl border border-blue-200 bg-white flex items-start gap-2.5 cursor-pointer select-none">
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
        </div>
      )}

      {/* Daftar Siswa yang Diantar & Tanda Tangan Siswa */}
      <div className="p-3 sm:p-4 rounded-xl border border-slate-200 bg-white space-y-2.5">
        <div>
          <h5 className="text-xs font-bold text-slate-900">
            {stageControl.requireStudentSignature === true
              ? `Daftar Siswa Diantar & TTD (${deliverySelectedKeys.length}/${dudiStudents.length} dipilih)`
              : `Daftar Siswa yang Diantar (${deliverySelectedKeys.length}/${dudiStudents.length} dipilih)`}
          </h5>
          <p className="text-[11px] text-slate-500">
            {stageControl.requireStudentSignature === true
              ? `Centang siswa & lengkapi TTD, lalu klik 1× Simpan untuk ${selectedDudi.nama}.`
              : `Centang siswa yang diantar, lalu klik 1× Simpan untuk ${selectedDudi.nama}.`}
          </p>
        </div>

        <div className="space-y-2">
          {dudiStudents.map((stu, idx) => {
            const stuKey = getStudentKey(stu, idx);
            const isChecked = deliverySelectedKeys.includes(stuKey);
            const isAlreadyDelivered =
              Array.isArray(stu.completedStages) && stu.completedStages.includes(1);
            const stuTtd = deliveryTtdByKey[stuKey] || '';
            return (
              <div
                key={stuKey}
                className={`p-2.5 sm:p-3 rounded-xl border transition-colors space-y-2 ${
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
                      {isAlreadyDelivered && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                          Sudah Diantar
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                      NIS: {formatNisVisual(stu.nis)} · {stu.kelas}
                    </div>
                  </div>
                </label>

                {isChecked && stageControl.requireStudentSignature === true && (
                  <SignaturePadInput
                    value={stuTtd}
                    studentName={stu.nama}
                    helperFilled="Tanda tangan siswa tersimpan ringan dalam format vektor."
                    helperEmpty="Minta siswa menandatangani langsung di kotak atas sebagai bukti pengantaran."
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
              onClick={() =>
                onToggleVoice('catatan', (spoken) => {
                  onChangeDeliveryCatatan(appendVoiceTranscript(deliveryCatatan, spoken));
                })
              }
              title={
                voiceSupported
                  ? 'Dikte catatan pengantaran dengan suara Bahasa Indonesia'
                  : 'Browser tidak mendukung dikte suara'
              }
              className={`min-h-[32px] px-3 py-1 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer transition-all ${
                voiceActiveFieldId === 'catatan'
                  ? 'border-rose-500 bg-rose-600 text-white animate-pulse shadow-xs'
                  : 'border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700'
              }`}
            >
              {voiceActiveFieldId === 'catatan' ? (
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

        {voiceActiveFieldId === 'catatan' && (
          <p className="text-[11px] font-medium text-rose-700 flex items-center gap-1.5 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping shrink-0" />
            <span>
              {voiceInterimText
                ? `Mendengarkan: "${voiceInterimText}"`
                : 'Silakan ucapkan catatan pengantaran (Bahasa Indonesia)...'}
            </span>
          </p>
        )}

        {voiceError && (
          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            {voiceError}
          </p>
        )}

        <textarea
          rows={2}
          disabled={isStageReadOnly}
          value={deliveryCatatan}
          onChange={(e) => onChangeDeliveryCatatan(e.target.value)}
          placeholder="Tuliskan catatan serah terima, penyesuaian jadwal, atau pesan dari DUDI..."
          className={`w-full px-3.5 py-2.5 bg-white border rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 disabled:bg-slate-100 disabled:text-slate-500 ${
            voiceActiveFieldId === 'catatan'
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
                  onChangeDeliveryCatatan(appendVoiceTranscript(deliveryCatatan, preset))
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
  );
};
