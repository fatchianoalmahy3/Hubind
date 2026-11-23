import React from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Search, UserCheck } from 'lucide-react';
import {
  formatNisVisual,
  handleNisKeyDown,
  processNisInputChange,
} from '../../core/utils/nisHelpers';

interface WizardStep1IdentityProps {
  nisInput: string;
  searching: boolean;
  studentData: any;
  searchError: string;
  identityStatus: 'pending' | 'confirmed' | 'mismatch';
  onChangeNis: (nextDigits: string) => void;
  onLookupNis: () => void;
  onConfirmIdentity: (isMatch: boolean) => void;
  onResetSearch: () => void;
}

export const WizardStep1Identity: React.FC<WizardStep1IdentityProps> = ({
  nisInput,
  searching,
  studentData,
  searchError,
  identityStatus,
  onChangeNis,
  onLookupNis,
  onConfirmIdentity,
  onResetSearch,
}) => {
  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      <div className="bg-slate-50/90 rounded-2xl p-4 sm:p-5 border border-slate-200/80 space-y-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            Langkah 1: Cari &amp; Verifikasi Data NIS
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Masukkan Nomor Induk Siswa (NIS) Anda yang terdaftar di sekolah untuk memeriksa kecocokan data.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={formatNisVisual(nisInput, '')}
              onChange={(e) => {
                processNisInputChange(e, (nextDigits) => {
                  onChangeNis(nextDigits);
                });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onLookupNis();
                  return;
                }
                handleNisKeyDown(e, nisInput, (nextDigits, nextPos) => {
                  const inputEl = e.currentTarget;
                  onChangeNis(nextDigits);
                  if (nextPos !== undefined) {
                    requestAnimationFrame(() => {
                      try {
                        inputEl.setSelectionRange(nextPos, nextPos);
                      } catch {
                        // ignore
                      }
                    });
                  }
                });
              }}
              placeholder="Masukkan angka NIS Anda (cth: 23241/001/001)..."
              className="w-full min-h-[44px] pl-10 pr-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-white font-mono tabular-nums"
            />
          </div>
          <button
            type="button"
            onClick={onLookupNis}
            disabled={searching}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors shrink-0 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {searching ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Mencari di Server...</span>
              </>
            ) : (
              <>
                <Search className="w-3.5 h-3.5" />
                <span>Cari Data NIS</span>
              </>
            )}
          </button>
        </div>

        {searchError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <span>{searchError}</span>
          </div>
        )}
      </div>

      {searching && (
        <div
          className="p-4 sm:p-5 bg-white border border-slate-200 rounded-2xl space-y-4"
          aria-busy="true"
          aria-live="polite"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 pb-2.5 border-b border-slate-100">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            <span>Mencocokkan NIS dengan Database Siswa di Cloud Server...</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 space-y-2">
              <div className="h-3 skeleton-shimmer rounded w-20" />
              <div className="h-4 skeleton-shimmer rounded w-40" />
            </div>
            <div className="p-3 rounded-xl bg-slate-50 space-y-2">
              <div className="h-3 skeleton-shimmer rounded w-14" />
              <div className="h-4 skeleton-shimmer rounded w-32" />
            </div>
            <div className="p-3 rounded-xl bg-slate-50 space-y-2">
              <div className="h-3 skeleton-shimmer rounded w-16" />
              <div className="h-4 skeleton-shimmer rounded w-24" />
            </div>
            <div className="p-3 rounded-xl bg-slate-50 space-y-2">
              <div className="h-3 skeleton-shimmer rounded w-28" />
              <div className="h-4 skeleton-shimmer rounded w-36" />
            </div>
          </div>
        </div>
      )}

      {studentData && (
        <div className="p-4 sm:p-5 bg-white border border-slate-200 rounded-2xl space-y-4 shadow-2xs animate-in fade-in duration-150">
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <UserCheck className="w-4 h-4 text-blue-600" />
              <span>Data Siswa Terverifikasi di Server</span>
            </div>
            <span className="text-xs font-mono font-semibold text-slate-500">
              NIS: {formatNisVisual(studentData.nis)}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-50">
              <span className="text-slate-500 block text-[11px]">Nama Lengkap</span>
              <span className="font-bold text-slate-900 text-sm">{studentData.nama}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50">
              <span className="text-slate-500 block text-[11px]">NIK</span>
              <span className="font-mono font-semibold text-slate-800">{studentData.nik || '-'}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50">
              <span className="text-slate-500 block text-[11px]">Kelas</span>
              <span className="font-bold text-slate-800">{studentData.kelas}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50">
              <span className="text-slate-500 block text-[11px]">Kompetensi Keahlian</span>
              <span className="font-bold text-slate-800">{studentData.jurusan}</span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 space-y-3">
            <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-950 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1 leading-relaxed">
                <p className="font-bold text-amber-900">
                  Periksa Data Anda Dengan Teliti Sebelum Konfirmasi
                </p>
                <p>
                  Pastikan seluruh biodata di atas (<b>Nama Lengkap, NIS, NIK, Kelas, dan Kompetensi Keahlian</b>) telah sesuai. Data yang sudah dikonfirmasi dan dikirim <b>tidak dapat diubah secara mandiri</b> karena akan dicetak pada surat resmi PKL serta sertifikat. Apabila terdapat kekeliruan sekecil apa pun, klik tombol <b>&ldquo;Belum Sesuai&rdquo;</b> dan segera laporkan kepada Wali Kelas atau Admin Pokja Hubin sebelum melanjutkan.
                </p>
              </div>
            </div>
            <p className="text-xs font-bold text-slate-800">
              Apakah data identitas Anda di atas sudah sesuai?
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => onConfirmIdentity(false)}
                className={`min-h-[44px] px-4 py-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                  identityStatus === 'mismatch'
                    ? 'border-rose-400 bg-rose-50 text-rose-800'
                    : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                Belum Sesuai
              </button>
              <button
                type="button"
                onClick={() => onConfirmIdentity(true)}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Ya, Data Sudah Sesuai &amp; Lanjut</span>
              </button>
            </div>

            {identityStatus === 'mismatch' && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-2">
                <p className="font-bold">Data Belum Sesuai?</p>
                <p className="leading-relaxed">
                  Silakan hubungi Wali Kelas atau Admin Pokja Hubin untuk memperbarui data Anda di{' '}
                  <span className="font-semibold">Database Siswa Sekolah</span> sebelum melanjutkan pengajuan PKL, atau periksa kembali NIS yang Anda ketik.
                </p>
                <button
                  type="button"
                  onClick={onResetSearch}
                  className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-900 font-semibold hover:bg-amber-100 cursor-pointer"
                >
                  Cari Ulang NIS
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
