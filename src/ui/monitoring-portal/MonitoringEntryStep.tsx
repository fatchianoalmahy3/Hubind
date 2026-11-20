import React from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Award,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  Loader2,
  Lock,
  MapPin,
  MessageCircle,
  Minus,
  Pencil,
  Plus,
  Save,
} from 'lucide-react';
import { MONITORING_STAGES, type MonitoringStageControl } from '../../core/types/schema';
import { getStageValueByNumber } from '../../core/utils/monitoringHelpers';
import { formatNisVisual } from '../../core/utils/nisHelpers';
import { formatPhoneDisplay, getWhatsAppHref } from '../../core/utils/autoIdHelpers';
import { GradeScoreEditorGrid } from './GradeScoreEditorGrid';
import type { GradeScoresDraft, StudentStageDraft } from './types';

interface MonitoringEntryStepProps {
  selectedDudi: any;
  selectedPetugasNama: string;
  dudiStudents: any[];
  loadingStudents: boolean;
  studentsError: string;
  selectedStudentIndex: number;
  activeStudent: any;
  activeStageNum: number;
  stageControl: MonitoringStageControl;
  isStageReadOnly: boolean;
  isStageCompleted: boolean;
  activeDraft: StudentStageDraft;
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
  dudiPemimpin: string;
  dudiPic: string;
  dudiTelp: string;
  showDudiContactEditor: boolean;
  onChangeStepToDudiList: () => void;
  onSelectStudentIndex: (idx: number) => void;
  onSelectStage: (stageNum: number) => void;
  onUpdateDraft: (patch: Partial<StudentStageDraft>) => void;
  onChangeDudiPemimpin: (val: string) => void;
  onChangeDudiPic: (val: string) => void;
  onChangeDudiTelp: (val: string) => void;
  onCloseDudiContactEditor: () => void;
  onOpenDudiPopupForEdit: () => void;
  onStartEditGrade: () => void;
  onCancelEditGrade: () => void;
  onUpdateGradeEditDraft: (patch: Partial<GradeScoresDraft>) => void;
  onSaveEditedGrades: () => void;
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
  activeStageNum,
  stageControl,
  isStageReadOnly,
  isStageCompleted,
  activeDraft,
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
  dudiPemimpin,
  dudiPic,
  dudiTelp,
  showDudiContactEditor,
  onChangeStepToDudiList,
  onSelectStudentIndex,
  onSelectStage,
  onUpdateDraft,
  onChangeDudiPemimpin,
  onChangeDudiPic,
  onChangeDudiTelp,
  onCloseDudiContactEditor,
  onOpenDudiPopupForEdit,
  onStartEditGrade,
  onCancelEditGrade,
  onUpdateGradeEditDraft,
  onSaveEditedGrades,
  onSaveSupervision,
}) => {
  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      {/* Selected DUDI Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-slate-50 border border-slate-200/90 rounded-2xl">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onChangeStepToDudiList}
            className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 flex items-center gap-1 text-xs font-semibold cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Ganti DUDI</span>
          </button>
          <div className="text-xs min-w-0">
            <span className="text-slate-500 block text-[10px]">DUDI Yang Dipilih</span>
            <span className="font-bold text-slate-900 truncate block">{selectedDudi.nama}</span>
          </div>
        </div>

        <div className="text-[11px] text-slate-600 flex flex-wrap items-center gap-2 shrink-0">
          {selectedDudi.linkMaps && (
            <>
              <a
                href={selectedDudi.linkMaps}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:text-blue-900 hover:underline underline-offset-2"
              >
                <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Lokasi Maps</span>
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
          <span className="text-blue-700 font-bold">{dudiStudents.length} Siswa</span>
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
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              Pilih Siswa ({dudiStudents.length} Siswa Terdata):
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {dudiStudents.map((student, idx) => {
                const isSelected = selectedStudentIndex === idx;
                const completedCount = Array.isArray(student.completedStages)
                  ? student.completedStages.length
                  : 0;
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
                    <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-slate-500">
                      <span>NIS: {formatNisVisual(student.nis)}</span>
                      <span className="font-semibold text-slate-600">
                        Tahap {completedCount}/8{hasGrade ? ' · Nilai ✓' : ''}
                      </span>
                    </div>
                    <div className="font-bold text-xs truncate mt-1">{student.nama}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5 truncate">{student.kelas}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {activeStudent && (
            <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-5">
              {/* Active Student Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-2">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Supervisi: {activeStudent.nama}
                  </h4>
                  <p className="text-xs text-slate-500">
                    NIS: {formatNisVisual(activeStudent.nis)} · Kelas: {activeStudent.kelas} · Jurusan: {activeStudent.jurusan}
                  </p>
                </div>
                <div className="text-xs font-semibold text-blue-700">
                  Deteksi Otomatis: Tahap {activeStudent.recommendedStage || 1} dari 8
                </div>
              </div>

              {/* 8-Stage Auto-Detect & SuperAdmin Control Selector */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-slate-800">
                    Tahap Monitoring ({stageControl.requireSequential ? '8 Tahap Berurutan' : 'Mode Transisi Fleksibel'}):
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {isStageReadOnly
                      ? 'Dikunci SuperAdmin · Riwayat Baca-Saja'
                      : isStageCompleted
                      ? 'Sudah terdata di Cloud Server'
                      : 'Siap diisi'}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {MONITORING_STAGES.map((st) => {
                    const isCompleted = (activeStudent.completedStages || []).includes(st.num);
                    const isGlobalUnlocked = stageControl.unlockedStages.includes(st.num);
                    const isSequentialLocked =
                      isGlobalUnlocked &&
                      stageControl.requireSequential &&
                      st.num > 1 &&
                      !(activeStudent.completedStages || []).includes(st.num - 1);
                    const isReadOnlyHistory = !isGlobalUnlocked && isCompleted;
                    const isDisabled = (!isGlobalUnlocked && !isCompleted) || isSequentialLocked;
                    const isActive = activeStageNum === st.num;

                    return (
                      <button
                        key={st.num}
                        type="button"
                        disabled={isDisabled}
                        title={
                          !isGlobalUnlocked && !isCompleted
                            ? `Tahap dikunci oleh SuperAdmin${stageControl.lockedReason ? `: ${stageControl.lockedReason}` : ''}`
                            : isReadOnlyHistory
                            ? `${st.value} — Riwayat Terkunci (Klik untuk melihat mode Baca-Saja)`
                            : isSequentialLocked
                            ? `Terkunci — selesaikan ${getStageValueByNumber(st.num - 1)} terlebih dahulu`
                            : st.value
                        }
                        onClick={() => onSelectStage(st.num)}
                        className={`min-h-[44px] px-3 py-2 rounded-xl border text-left text-xs font-semibold transition-all flex items-center justify-between gap-1.5 ${
                          isDisabled
                            ? 'border-slate-200 bg-slate-100/80 text-slate-400 cursor-not-allowed'
                            : isActive && isReadOnlyHistory
                            ? 'border-amber-600 bg-amber-600 text-white shadow-xs cursor-pointer'
                            : isActive
                            ? 'border-blue-600 bg-blue-600 text-white shadow-xs cursor-pointer'
                            : isReadOnlyHistory
                            ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100/70 cursor-pointer'
                            : isCompleted
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100/70 cursor-pointer'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 cursor-pointer'
                        }`}
                      >
                        <span className="truncate">{st.label}</span>
                        {isDisabled ? (
                          <Lock className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                        ) : isReadOnlyHistory ? (
                          <Lock
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isActive ? 'text-white' : 'text-amber-600'
                            }`}
                          />
                        ) : isCompleted ? (
                          <CheckCircle2
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isActive ? 'text-white' : 'text-emerald-600'
                            }`}
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500">
                  {stageControl.requireSequential
                    ? 'Pengisian dilakukan berurutan tahap per tahap (1 → 8). Tahap selanjutnya otomatis terbuka setelah tahap sebelumnya disimpan.'
                    : 'Mode Transisi aktif: Anda dapat langsung memilih tahap berstatus Terbuka (misal Mon 3 / Mon 4) tanpa harus mengisi tahap manual sebelumnya.'}
                </p>

                {isStageReadOnly && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-900">
                    <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold">
                        Tahap {activeStageNum} Dikunci oleh SuperAdmin (Mode Baca-Saja)
                      </div>
                      <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                        {stageControl.lockedReason ? `${stageControl.lockedReason}. ` : ''}
                        Riwayat yang sudah tersimpan tetap ditampilkan untuk ditinjau, namun tidak dapat diubah atau disimpan ulang.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Data Penanggung Jawab & Kontak DUDI */}
              {activeStageNum === 1 || showDudiContactEditor ? (
                <div className="p-3.5 sm:p-4 rounded-xl border border-blue-200 bg-blue-50/50 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h5 className="text-xs font-bold text-slate-900">
                        Data Penanggung Jawab &amp; Kontak DUDI{' '}
                        {activeStageNum === 1 ? '(Wajib Saat Pengantaran)' : '(Pembaruan Kontak)'}
                      </h5>
                      <p className="text-[11px] text-slate-600">
                        Data ini otomatis menyinkronkan profil Master DUDI &amp; berkas pengajuan siswa.
                      </p>
                    </div>
                    {activeStageNum !== 1 && (
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
                </div>
              ) : (
                <div className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600">
                    <span>
                      Pemimpin: <b className="text-slate-800">{dudiPemimpin || '-'}</b>
                    </span>
                    <span>
                      PIC DUDI: <b className="text-slate-800">{dudiPic || '-'}</b>
                    </span>
                    <span>
                      Telp/WA: <b className="font-mono text-slate-800">{dudiTelp || '-'}</b>
                    </span>
                  </div>
                  {!isStageReadOnly && (
                    <button
                      type="button"
                      onClick={onOpenDudiPopupForEdit}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>Edit Kontak DUDI</span>
                    </button>
                  )}
                </div>
              )}

              {/* Section: Absensi (Sakit, Izin, Alpha) */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                  <ClipboardCheck className="w-4 h-4 text-blue-600" />
                  <span>Absensi Siswa (Sakit, Izin, Alpha) — Tahap {activeStageNum}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(
                    [
                      { key: 'sakit', label: 'Sakit (Hari)', accent: 'text-amber-700' },
                      { key: 'izin', label: 'Izin (Hari)', accent: 'text-blue-700' },
                      { key: 'alpha', label: 'Alpha (Hari)', accent: 'text-rose-700' },
                    ] as const
                  ).map((item) => {
                    const val = activeDraft[item.key];
                    return (
                      <div
                        key={item.key}
                        className="p-3 bg-white border border-slate-200 rounded-xl space-y-2"
                      >
                        <label className={`block text-xs font-bold ${item.accent}`}>
                          {item.label}
                        </label>
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            disabled={isStageReadOnly}
                            aria-label={`Kurangi ${item.label}`}
                            onClick={() =>
                              onUpdateDraft({
                                [item.key]: Math.max(0, val - 1),
                              })
                            }
                            className="min-w-[44px] min-h-[44px] rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={90}
                            disabled={isStageReadOnly}
                            value={val}
                            onChange={(e) => {
                              const parsed = Math.max(
                                0,
                                Math.min(90, Math.round(Number(e.target.value) || 0))
                              );
                              onUpdateDraft({ [item.key]: parsed });
                            }}
                            className="w-full min-h-[44px] text-center font-mono tabular-nums text-base font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:bg-slate-100 disabled:text-slate-500"
                          />
                          <button
                            type="button"
                            disabled={isStageReadOnly}
                            aria-label={`Tambah ${item.label}`}
                            onClick={() =>
                              onUpdateDraft({
                                [item.key]: Math.min(90, val + 1),
                              })
                            }
                            className="min-w-[44px] min-h-[44px] rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

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
                        {activeStageNum === 5
                          ? 'Wajib dijawab pada Monitoring ke-4. Jika belum muncul, nilai dapat menyusul pada Monitoring ke-5, ke-6, atau Penarikan.'
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

              {/* Catatan Pembimbing */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Catatan Pembimbing / Evaluasi DUDI:
                </label>
                <textarea
                  rows={2}
                  disabled={isStageReadOnly}
                  value={activeDraft.catatanPerkembangan}
                  onChange={(e) => onUpdateDraft({ catatanPerkembangan: e.target.value })}
                  placeholder="Tuliskan catatan supervisi, kondisi siswa, atau kendala lapangan..."
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:bg-slate-100 disabled:text-slate-500"
                />
              </div>

              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-xs text-rose-700">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Primary Save CTA OR Read-Only Notice */}
              <div className="pt-1 flex justify-end">
                {isStageReadOnly ? (
                  <div className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 font-semibold text-xs flex items-center justify-center gap-2">
                    <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Mode Baca-Saja (Tahap Dikunci SuperAdmin)</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={onSaveSupervision}
                    disabled={submitting}
                    className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] disabled:opacity-50"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Menyimpan ke Cloud Server...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>
                          {showGradeInputs
                            ? 'Simpan Absensi & Nilai PKL Siswa Ini'
                            : `Simpan Supervisi Tahap ${activeStageNum}`}
                        </span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
