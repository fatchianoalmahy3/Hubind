import React from 'react';
import { AlertCircle, Building2, Loader2, Save } from 'lucide-react';
import { WorkScheduleRangeInputs } from './WorkScheduleRangeInputs';

interface DudiContactPopupModalProps {
  isOpen: boolean;
  dudiNama: string;
  pemimpin: string;
  pic: string;
  telp: string;
  hariMulai: string;
  hariSelesai: string;
  jamMulai: string;
  jamSelesai: string;
  spellingConfirmed: boolean;
  error: string;
  saving: boolean;
  onChangePemimpin: (v: string) => void;
  onChangePic: (v: string) => void;
  onChangeTelp: (v: string) => void;
  onChangeHariMulai: (v: string) => void;
  onChangeHariSelesai: (v: string) => void;
  onChangeJamMulai: (v: string) => void;
  onChangeJamSelesai: (v: string) => void;
  onChangeSpellingConfirmed: (v: boolean) => void;
  onBackToDudiList: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const DudiContactPopupModal: React.FC<DudiContactPopupModalProps> = ({
  isOpen,
  dudiNama,
  pemimpin,
  pic,
  telp,
  hariMulai,
  hariSelesai,
  jamMulai,
  jamSelesai,
  spellingConfirmed,
  error,
  saving,
  onChangePemimpin,
  onChangePic,
  onChangeTelp,
  onChangeHariMulai,
  onChangeHariSelesai,
  onChangeJamMulai,
  onChangeJamSelesai,
  onChangeSpellingConfirmed,
  onBackToDudiList,
  onSubmit,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 bg-slate-950/65 backdrop-blur-xs"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[94dvh] sm:max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 bg-amber-50/80 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0">
            <Building2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900">
              Lengkapi &amp; Konfirmasi Kontak Resmi DUDI
            </h3>
            <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
              Data penanggung jawab <b className="text-slate-900">{dudiNama}</b> masih kosong atau perlu verifikasi. Pastikan nama lengkap, gelar, dan ejaan sudah benar karena tercetak pada Sertifikat &amp; Surat Tugas.
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-3.5 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Nama Pemimpin / Direktur DUDI <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              disabled={saving}
              value={pemimpin}
              onChange={(e) => onChangePemimpin(e.target.value)}
              placeholder="Contoh: H. Bambang Susanto, S.T."
              className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Nama PIC / Pembimbing DUDI <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              disabled={saving}
              value={pic}
              onChange={(e) => onChangePic(e.target.value)}
              placeholder="Contoh: Andi Wijaya (Kepala Mekanik)"
              className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              No. Telp / WhatsApp Resmi DUDI <span className="text-rose-500">*</span>
            </label>
            <input
              type="tel"
              inputMode="tel"
              required
              disabled={saving}
              value={telp}
              onChange={(e) => onChangeTelp(e.target.value)}
              placeholder="Contoh: 081234567890"
              className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <WorkScheduleRangeInputs
            hariMulai={hariMulai}
            hariSelesai={hariSelesai}
            jamMulai={jamMulai}
            jamSelesai={jamSelesai}
            disabled={saving}
            onChangeHariMulai={onChangeHariMulai}
            onChangeHariSelesai={onChangeHariSelesai}
            onChangeJamMulai={onChangeJamMulai}
            onChangeJamSelesai={onChangeJamSelesai}
          />

          <label className="p-3 rounded-xl border border-blue-200 bg-blue-50/70 flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              disabled={saving}
              checked={spellingConfirmed}
              onChange={(e) => onChangeSpellingConfirmed(e.target.checked)}
              className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 w-4 h-4 shrink-0 cursor-pointer"
            />
            <span className="text-[11px] font-semibold text-slate-800 leading-relaxed">
              Saya mengonfirmasi bahwa seluruh data penanggung jawab DUDI, termasuk ejaan nama lengkap, gelar, dan nomor telepon/WhatsApp sudah benar.
            </span>
          </label>

          {error && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2 text-[11px] text-rose-700">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={onBackToDudiList}
              className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer disabled:opacity-50"
            >
              Kembali Pilih DUDI
            </button>
            <button
              type="submit"
              disabled={saving || !spellingConfirmed}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menyimpan Kontak...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Simpan &amp; Konfirmasi Kontak DUDI</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
