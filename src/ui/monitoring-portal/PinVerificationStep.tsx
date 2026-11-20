import React from 'react';
import { AlertCircle, ArrowRight, KeyRound, Loader2, RefreshCw } from 'lucide-react';

interface PinVerificationStepProps {
  petugasList: any[];
  loadingPetugas: boolean;
  petugasLoadError: string;
  selectedPetugasId: string;
  pinInput: string;
  verifyingPin: boolean;
  pinError: string;
  onSelectPetugas: (id: string, nama: string, nip: string) => void;
  onChangePin: (nextPin: string) => void;
  onReloadPetugas: () => void;
  onSubmit: (e?: React.FormEvent) => void;
}

export const PinVerificationStep: React.FC<PinVerificationStepProps> = ({
  petugasList,
  loadingPetugas,
  petugasLoadError,
  selectedPetugasId,
  pinInput,
  verifyingPin,
  pinError,
  onSelectPetugas,
  onChangePin,
  onReloadPetugas,
  onSubmit,
}) => {
  return (
    <div className="max-w-md mx-auto space-y-5 py-4 animate-in fade-in duration-150">
      <div className="text-center space-y-1">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto border border-blue-200/80 shadow-2xs">
          <KeyRound className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-900">
          Pilih Nama &amp; Masukkan PIN
        </h3>
        <p className="text-xs text-slate-500">
          Gunakan 4 digit terakhir No. WhatsApp terdaftar atau PIN khusus Guru Pendamping
        </p>
      </div>

      {petugasLoadError && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-xs text-amber-900">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
            <span>{petugasLoadError}</span>
          </div>
          <button
            type="button"
            onClick={onReloadPetugas}
            className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 bg-white border border-amber-300 rounded-lg font-semibold text-amber-800 hover:bg-amber-100 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Muat Ulang</span>
          </button>
        </div>
      )}

      {pinError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-xs text-rose-700">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
          <span>{pinError}</span>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Nama Petugas / Guru Pendamping:
          </label>
          {loadingPetugas ? (
            <div className="space-y-2" aria-busy="true" aria-live="polite">
              <div className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2.5 text-xs text-slate-600">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
                <span>Memuat daftar guru dari Cloud Server...</span>
              </div>
              <div className="h-3 skeleton-shimmer rounded w-3/5" />
            </div>
          ) : (
            <select
              value={selectedPetugasId}
              disabled={petugasList.length === 0}
              onChange={(e) => {
                const id = e.target.value;
                const chosen = petugasList.find((p) => p.id === id);
                onSelectPetugas(id, chosen?.nama || '', chosen?.nip || '-');
              }}
              className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all cursor-pointer disabled:opacity-50"
            >
              {petugasList.length === 0 ? (
                <option value="">-- Belum ada data Guru Pendamping terdaftar --</option>
              ) : (
                petugasList.map((p, idx) => (
                  <option key={`${p.id || 'petugas'}_${idx}`} value={p.id}>
                    {p.nama} — {p.peran || 'Guru Pendamping'}
                  </option>
                ))
              )}
            </select>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            PIN Keamanan (4 Digit):
          </label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={8}
            value={pinInput}
            onChange={(e) => onChangePin(e.target.value)}
            placeholder="PIN atau 4 digit terakhir WA"
            className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-center text-base tracking-widest font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all"
            required
          />
        </div>

        <button
          type="submit"
          disabled={verifyingPin || loadingPetugas || petugasList.length === 0}
          className="w-full min-h-[44px] py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] disabled:opacity-50"
        >
          {verifyingPin ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Memverifikasi PIN...</span>
            </>
          ) : (
            <>
              <span>Lanjut ke DUDI Bimbingan</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </div>
  );
};
