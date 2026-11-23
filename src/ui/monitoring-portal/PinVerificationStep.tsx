import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  KeyRound,
  Loader2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';

interface PinVerificationStepProps {
  petugasList: any[];
  loadingPetugas: boolean;
  petugasLoadError: string;
  selectedPetugasId: string;
  selectedPetugasNama: string;
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
  selectedPetugasNama,
  pinInput,
  verifyingPin,
  pinError,
  onSelectPetugas,
  onChangePin,
  onReloadPetugas,
  onSubmit,
}) => {
  const [searchQuery, setSearchQuery] = useState(selectedPetugasNama || '');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const prevSelectedIdRef = useRef(selectedPetugasId);
  const dropdownContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isDropdownOpen) return;
    const handleOutsidePointerDown = (e: PointerEvent) => {
      if (
        dropdownContainerRef.current &&
        !dropdownContainerRef.current.contains(e.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleOutsidePointerDown);
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown);
  }, [isDropdownOpen]);

  useEffect(() => {
    if (selectedPetugasId && selectedPetugasNama) {
      setSearchQuery(selectedPetugasNama);
    } else if (prevSelectedIdRef.current && !selectedPetugasId) {
      setSearchQuery('');
    }
    prevSelectedIdRef.current = selectedPetugasId;
  }, [selectedPetugasId, selectedPetugasNama]);

  const filteredPetugas = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const sorted = [...petugasList].sort((a, b) =>
      String(a.nama || '').localeCompare(String(b.nama || ''))
    );
    if (!q) return sorted.slice(0, 40);
    return sorted
      .filter((p) => {
        const nama = String(p.nama || '').toLowerCase();
        const nip = String(p.nip || '').toLowerCase();
        const peran = String(p.peran || '').toLowerCase();
        return nama.includes(q) || nip.includes(q) || peran.includes(q);
      })
      .slice(0, 40);
  }, [petugasList, searchQuery]);

  const handleSelectItem = (p: any) => {
    onSelectPetugas(p.id, p.nama, p.nip || '-');
    setSearchQuery(p.nama || '');
    setIsDropdownOpen(false);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    onSelectPetugas('', '', '');
    setIsDropdownOpen(true);
  };

  return (
    <div className="max-w-md mx-auto space-y-3.5 sm:space-y-5 py-1.5 sm:py-4 animate-in fade-in duration-150">
      <div className="text-center space-y-1">
        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto border border-blue-200/80 shadow-2xs">
          <KeyRound className="w-5 h-5 sm:w-6 sm:h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-900">
          Cari Nama &amp; Masukkan PIN
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
          <label
            htmlFor="portal-petugas-search"
            className="block text-xs font-semibold text-slate-700 mb-1.5"
          >
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
            <div ref={dropdownContainerRef} className="relative">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="portal-petugas-search"
                  type="text"
                  autoComplete="off"
                  value={searchQuery}
                  disabled={petugasList.length === 0}
                  onFocus={() => setIsDropdownOpen(true)}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setSearchQuery(nextVal);
                    setIsDropdownOpen(true);
                    if (
                      selectedPetugasId &&
                      nextVal.trim().toLowerCase() !== selectedPetugasNama.trim().toLowerCase()
                    ) {
                      onSelectPetugas('', '', '');
                    }
                    const exactMatch = petugasList.find(
                      (p) =>
                        String(p.nama || '').trim().toLowerCase() === nextVal.trim().toLowerCase()
                    );
                    if (exactMatch) {
                      onSelectPetugas(exactMatch.id, exactMatch.nama, exactMatch.nip || '-');
                    }
                  }}
                  placeholder={
                    petugasList.length === 0
                      ? 'Belum ada data Guru Pendamping terdaftar'
                      : 'Ketik nama atau NIP petugas...'
                  }
                  className="w-full min-h-[44px] pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-600 transition-all disabled:opacity-50"
                />
                {(searchQuery || selectedPetugasId) && (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    aria-label="Hapus pencarian petugas"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {isDropdownOpen && petugasList.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto py-1">
                  {filteredPetugas.length === 0 ? (
                    <div className="px-3.5 py-3 text-xs text-slate-500">
                      Tidak ada petugas cocok dengan &ldquo;{searchQuery}&rdquo;.
                    </div>
                  ) : (
                    filteredPetugas.map((p, idx) => {
                      const isSelected = Boolean(selectedPetugasId && p.id === selectedPetugasId);
                      return (
                        <button
                          type="button"
                          key={`${p.id || 'petugas'}_${idx}`}
                          onClick={() => handleSelectItem(p)}
                          className={`w-full min-h-[44px] text-left px-3.5 py-2 hover:bg-blue-50 active:bg-blue-100 transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                            isSelected ? 'bg-blue-50/80' : ''
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-900 truncate">
                              {p.nama}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {p.peran || 'Guru Pendamping'}
                              {p.nip && p.nip !== '-' ? ` · NIP ${p.nip}` : ''}
                            </div>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                        </button>
                      );
                    })
                  )}
                </div>
              )}

              {!selectedPetugasId && searchQuery.trim() !== '' && !isDropdownOpen && (
                <p className="text-[11px] text-amber-700 mt-1">
                  Pilih salah satu nama petugas dari daftar hasil pencarian.
                </p>
              )}
            </div>
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
            className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-center text-base tracking-widest font-mono text-slate-800 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-600 transition-all"
            required
          />
        </div>

        <button
          type="submit"
          disabled={verifyingPin || loadingPetugas || petugasList.length === 0 || !selectedPetugasId}
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
