import React from 'react';
import { Lock, SlidersHorizontal, X } from 'lucide-react';
import { MONITORING_STAGES } from '../../core/types/schema';
import { getStageValueByNumber } from '../../core/utils/monitoringHelpers';
import { DocMetaEntry, DocumentHubKey, SuratTugasAuditResult } from './documentHubConfig';

interface DocumentParametersModalProps {
  isOpen: boolean;
  activeDocKey: DocumentHubKey;
  meta: DocMetaEntry;
  nomorSurat: string;
  tanggalSurat: string;
  paperSize: 'A4' | 'F4';
  kepalaSekolah: string;
  includeGroupPeers: boolean;
  suratTugasStageNum: number;
  selectedSuratTugasDudi: string;
  suratTugasAudit: SuratTugasAuditResult;
  onChangeNomorSurat: (v: string) => void;
  onChangeTanggalSurat: (v: string) => void;
  onChangePaperSize: (v: 'A4' | 'F4') => void;
  onChangeKepalaSekolah: (v: string) => void;
  onChangeIncludeGroupPeers: (v: boolean) => void;
  onChangeSuratTugasStageNum: (v: number) => void;
  onChangeSelectedSuratTugasDudi: (v: string) => void;
  onSaveKepalaSekolahToCloud?: () => Promise<void> | void;
  syncingKepalaSekolah?: boolean;
  onClose: () => void;
}

export const DocumentParametersModal: React.FC<DocumentParametersModalProps> = ({
  isOpen,
  activeDocKey,
  meta,
  nomorSurat,
  tanggalSurat,
  paperSize,
  kepalaSekolah,
  includeGroupPeers,
  suratTugasStageNum,
  selectedSuratTugasDudi,
  suratTugasAudit,
  onChangeNomorSurat,
  onChangeTanggalSurat,
  onChangePaperSize,
  onChangeKepalaSekolah,
  onChangeIncludeGroupPeers,
  onChangeSuratTugasStageNum,
  onChangeSelectedSuratTugasDudi,
  onSaveKepalaSekolahToCloud,
  syncingKepalaSekolah = false,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150 no-print"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 truncate">
                Parameter Surat &amp; Cetak
              </h3>
              <p className="text-[11px] text-slate-500 truncate">{meta.label}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 flex items-center justify-center cursor-pointer"
            aria-label="Tutup modal parameter"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-3.5 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Nomor Surat Dinas</label>
            <input
              type="text"
              value={nomorSurat}
              onChange={(e) => onChangeNomorSurat(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tanggal Surat</label>
              <input
                type="text"
                value={tanggalSurat}
                onChange={(e) => onChangeTanggalSurat(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Ukuran Kertas</label>
              <select
                value={paperSize}
                onChange={(e) => onChangePaperSize(e.target.value as 'A4' | 'F4')}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              >
                <option value="A4">A4 (210 x 297 mm)</option>
                <option value="F4">F4 (215 x 330 mm)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Nama Kepala Sekolah / Penandatangan
            </label>
            <input
              type="text"
              value={kepalaSekolah}
              onChange={(e) => {
                const nextVal = e.target.value;
                onChangeKepalaSekolah(nextVal);
                try {
                  localStorage.setItem('hubin_kepala_sekolah', nextVal);
                } catch {
                  // ignore
                }
              }}
              placeholder="Isi nama Kepala Sekolah / Penandatangan..."
              className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Otomatis disinkronkan ke akun Kepala Sekolah di Cloud Server agar tetap muncul di semua perangkat &amp; domain.
            </p>
          </div>

          {(activeDocKey === 'doc_pengantaran' || activeDocKey === 'doc_penarikan') && (
            <label className="flex items-center gap-2 pt-1 text-xs text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeGroupPeers}
                onChange={(e) => onChangeIncludeGroupPeers(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              <span>Gabungkan siswa serombongan di DUDI yang sama</span>
            </label>
          )}

          {(activeDocKey === 'doc_surat_tugas' || activeDocKey === 'doc_monitoring') && (
            <div className="pt-3 border-t border-slate-200 space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Tahap Monitoring / Penugasan
                </label>
                <select
                  value={suratTugasStageNum}
                  onChange={(e) => onChangeSuratTugasStageNum(Number(e.target.value) || 1)}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                >
                  {MONITORING_STAGES.map((st) => (
                    <option key={st.num} value={st.num}>
                      {st.value}
                    </option>
                  ))}
                </select>
              </div>

              {activeDocKey === 'doc_surat_tugas' && suratTugasAudit.dudiGroups.length > 0 && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Pilih DUDI Binaan ({suratTugasAudit.unlockedGroups.length}/
                    {suratTugasAudit.dudiGroups.length} Siap)
                  </label>
                  <select
                    value={selectedSuratTugasDudi}
                    onChange={(e) => onChangeSelectedSuratTugasDudi(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  >
                    <option value="ALL_UNLOCKED">
                      Semua DUDI Siap Cetak ({suratTugasAudit.unlockedGroups.length} DUDI)
                    </option>
                    {suratTugasAudit.dudiGroups.map((grp) => (
                      <option key={grp.key} value={grp.key}>
                        {grp.namaDudi} ({grp.students.length} siswa)
                        {grp.isLocked
                          ? ` — TERKUNCI (Belum Tahap ${suratTugasStageNum - 1})`
                          : ' — Siap Cetak'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {activeDocKey === 'doc_surat_tugas' &&
                suratTugasStageNum >= 2 &&
                suratTugasAudit.lockedGroups.length > 0 && (
                  <div className="p-2.5 rounded-lg border border-amber-200 bg-amber-50 text-[11px] text-amber-900 space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>
                        {suratTugasAudit.lockedGroups.length} DUDI Terkunci untuk Tahap{' '}
                        {suratTugasStageNum}
                      </span>
                    </div>
                    <p className="text-amber-800 leading-snug">
                      Hanya DUDI yang belum menyelesaikan{' '}
                      <b>{getStageValueByNumber(suratTugasStageNum - 1)}</b> yang dikunci:{' '}
                      {suratTugasAudit.lockedGroups.map((g) => g.namaDudi).join(', ')}.
                    </p>
                  </div>
                )}
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={syncingKepalaSekolah}
            onClick={async () => {
              if (onSaveKepalaSekolahToCloud) {
                await onSaveKepalaSekolahToCloud();
              }
              onClose();
            }}
            className="h-9 px-5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
          >
            {syncingKepalaSekolah ? 'Menyimpan...' : 'Terapkan & Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
};
