import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ExternalLink,
  Loader2,
  MapPin,
  Search,
  X,
} from 'lucide-react';
import type { GoogleMapsValidationResult } from '../../core/utils/mapsHelpers';
import { WorkScheduleRangeInputs } from '../monitoring-portal/WorkScheduleRangeInputs';

interface WizardStep3DudiMapProps {
  dudiList: any[];
  loadingDudi: boolean;
  dudiLoadError: string;
  selectedDudiId: string;
  isDudiUnregistered: boolean;
  selectedDudiMeta: any;
  customDudiName: string;
  customDudiAddress: string;
  customDudiField: string;
  hariMulai: string;
  hariSelesai: string;
  jamMulai: string;
  jamSelesai: string;
  linkMaps: string;
  mapsValidation: GoogleMapsValidationResult | null;
  submitting: boolean;
  submitError: string;
  onSelectDudi: (val: string) => void;
  onChangeCustomDudiName: (val: string) => void;
  onChangeCustomDudiAddress: (val: string) => void;
  onChangeCustomDudiField: (val: string) => void;
  onChangeHariMulai: (val: string) => void;
  onChangeHariSelesai: (val: string) => void;
  onChangeJamMulai: (val: string) => void;
  onChangeJamSelesai: (val: string) => void;
  onChangeLinkMaps: (val: string) => void;
  onBackToStep2: () => void;
}

export const WizardStep3DudiMap: React.FC<WizardStep3DudiMapProps> = ({
  dudiList,
  loadingDudi,
  dudiLoadError,
  selectedDudiId,
  isDudiUnregistered,
  selectedDudiMeta,
  customDudiName,
  customDudiAddress,
  customDudiField,
  hariMulai,
  hariSelesai,
  jamMulai,
  jamSelesai,
  linkMaps,
  mapsValidation,
  submitting,
  submitError,
  onSelectDudi,
  onChangeCustomDudiName,
  onChangeCustomDudiAddress,
  onChangeCustomDudiField,
  onChangeHariMulai,
  onChangeHariSelesai,
  onChangeJamMulai,
  onChangeJamSelesai,
  onChangeLinkMaps,
  onBackToStep2,
}) => {
  const [dudiSearch, setDudiSearch] = useState('');
  const [isDudiDropdownOpen, setIsDudiDropdownOpen] = useState(false);
  const deferredDudiSearch = useDeferredValue(dudiSearch);
  const comboboxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isDudiDropdownOpen) return;
    const handleOutside = (e: PointerEvent) => {
      if (comboboxRef.current && !comboboxRef.current.contains(e.target as Node)) {
        setIsDudiDropdownOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleOutside);
    return () => document.removeEventListener('pointerdown', handleOutside);
  }, [isDudiDropdownOpen]);

  useEffect(() => {
    if (selectedDudiId === 'unregistered') {
      setDudiSearch('DUDI Tidak Ada di Daftar (Ajukan Tempat Baru)');
    } else if (selectedDudiId && selectedDudiMeta?.nama_dudi) {
      setDudiSearch(selectedDudiMeta.nama_dudi);
    } else if (!selectedDudiId) {
      setDudiSearch('');
    }
  }, [selectedDudiId, selectedDudiMeta?.nama_dudi]);

  const indexedDudi = useMemo(
    () =>
      dudiList.map((d) => ({
        raw: d,
        searchKey: `${d.nama_dudi || ''} ${d.bidang_usaha || ''} ${d.kota || ''} ${d.alamat || ''}`.toLowerCase(),
      })),
    [dudiList]
  );

  const filteredDudiOptions = useMemo(() => {
    const q = deferredDudiSearch.trim().toLowerCase();
    const isShowingSelectedLabel =
      (selectedDudiId === 'unregistered' && q.includes('dudi tidak ada di daftar')) ||
      (selectedDudiMeta?.nama_dudi && q === String(selectedDudiMeta.nama_dudi).trim().toLowerCase());
    if (!q || isShowingSelectedLabel) {
      return indexedDudi.slice(0, 30).map((x) => x.raw);
    }
    return indexedDudi
      .filter((x) => x.searchKey.includes(q))
      .slice(0, 30)
      .map((x) => x.raw);
  }, [indexedDudi, deferredDudiSearch, selectedDudiId, selectedDudiMeta?.nama_dudi]);

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      <div>
        <h3 className="text-sm font-bold text-slate-900">
          Langkah 3: Pilih DUDI &amp; Sematkan Link Google Maps
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Pilih lokasi DUDI tujuan Anda, periksa bio tempat PKL, lalu masukkan tautan Google Maps lokasi tempat PKL yang valid.
        </p>
      </div>

      {dudiLoadError && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
          {dudiLoadError}
        </div>
      )}

      <div ref={comboboxRef} className="relative">
        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
          Cari &amp; Pilih Mitra DUDI Tujuan *
        </label>
        {loadingDudi ? (
          <div className="space-y-2" aria-busy="true" aria-live="polite">
            <div className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center gap-2.5 text-xs text-slate-600">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
              <span>Memuat daftar mitra DUDI dari Cloud Server...</span>
            </div>
            <div className="h-3 skeleton-shimmer rounded w-2/3" />
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={dudiSearch}
                autoComplete="off"
                onFocus={() => setIsDudiDropdownOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && isDudiDropdownOpen) {
                    e.preventDefault();
                  }
                }}
                onChange={(e) => {
                  const next = e.target.value;
                  setDudiSearch(next);
                  setIsDudiDropdownOpen(true);
                  if (selectedDudiId) {
                    const selectedLabel =
                      selectedDudiId === 'unregistered'
                        ? 'DUDI Tidak Ada di Daftar (Ajukan Tempat Baru)'
                        : String(selectedDudiMeta?.nama_dudi || '');
                    if (next !== selectedLabel) {
                      onSelectDudi('');
                    }
                  }
                }}
                placeholder="Ketik nama bengkel/perusahaan, bidang, atau kota..."
                className="w-full min-h-[44px] pl-10 pr-9 py-2.5 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white text-slate-900 placeholder:text-slate-400"
              />
              {(dudiSearch || selectedDudiId) && (
                <button
                  type="button"
                  onClick={() => {
                    setDudiSearch('');
                    onSelectDudi('');
                    setIsDudiDropdownOpen(true);
                  }}
                  aria-label="Hapus pilihan DUDI"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {isDudiDropdownOpen && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-64 overflow-y-auto py-1">
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelectDudi('unregistered');
                    setDudiSearch('DUDI Tidak Ada di Daftar (Ajukan Tempat Baru)');
                    setIsDudiDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3.5 py-2.5 border-b border-slate-100 hover:bg-amber-50 transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                    selectedDudiId === 'unregistered' ? 'bg-amber-50' : 'bg-amber-50/40'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-amber-800">
                      + DUDI Tidak Ada di Daftar (Ajukan Tempat Baru)
                    </div>
                    <div className="text-[11px] text-amber-700/80">
                      Pilih ini jika perusahaan/bengkel tujuan belum terdaftar di sekolah
                    </div>
                  </div>
                  {selectedDudiId === 'unregistered' && <Check className="w-4 h-4 text-amber-700 shrink-0" />}
                </button>

                {filteredDudiOptions.length === 0 ? (
                  <div className="px-3.5 py-3 text-xs text-slate-500">
                    Tidak ada DUDI mitra yang cocok dengan &quot;{dudiSearch}&quot;. Gunakan tombol di atas jika ingin mengajukan DUDI baru.
                  </div>
                ) : (
                  filteredDudiOptions.map((d, idx) => {
                    const isSelected = selectedDudiId === d.id;
                    return (
                      <button
                        type="button"
                        key={`${d.id || 'dudi'}_${idx}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          onSelectDudi(d.id);
                          setDudiSearch(d.nama_dudi || '');
                          setIsDudiDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3.5 py-2.5 hover:bg-blue-50 transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                          isSelected ? 'bg-blue-50/80' : ''
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900 truncate">
                            {d.nama_dudi}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {d.bidang_usaha || 'Umum'} · {d.kota || '-'}
                          </div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </>
        )}
      </div>

      {selectedDudiId && (
        <div className="space-y-4 p-4 rounded-2xl border border-slate-200 bg-slate-50/70 animate-in fade-in duration-150">
          {isDudiUnregistered ? (
            <div className="space-y-3">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <b>DUDI Belum Terdaftar:</b> Lengkapi profil tempat PKL baru di bawah ini agar dapat diverifikasi Pokja Hubin dan Kakomli.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nama Perusahaan / Bengkel / Instansi *
                  </label>
                  <input
                    type="text"
                    value={customDudiName}
                    onChange={(e) => onChangeCustomDudiName(e.target.value)}
                    placeholder="Contoh: PT Maju Teknik Ponorogo"
                    required
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Alamat Lengkap DUDI *
                  </label>
                  <input
                    type="text"
                    value={customDudiAddress}
                    onChange={(e) => onChangeCustomDudiAddress(e.target.value)}
                    placeholder="Jalan, Kecamatan, Kota/Kabupaten"
                    required
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Bidang Usaha / Keahlian
                  </label>
                  <input
                    type="text"
                    value={customDudiField}
                    onChange={(e) => onChangeCustomDudiField(e.target.value)}
                    placeholder="Contoh: Servis Mobil, Jaringan Komputer, Desain Grafis"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
            </div>
          ) : (
            selectedDudiMeta && (
              <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 font-bold text-slate-900">
                    <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>Bio DUDI: {selectedDudiMeta.nama_dudi}</span>
                  </div>
                  <span className="font-mono text-[11px] font-semibold text-slate-600 shrink-0">
                    Kuota: {selectedDudiMeta.terisi ?? 0}/{selectedDudiMeta.kuota_maksimal || '-'}
                  </span>
                </div>
                <div className="text-slate-600 flex items-start gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <span>
                    {selectedDudiMeta.alamat || '-'}
                    {selectedDudiMeta.kota ? ` · ${selectedDudiMeta.kota}` : ''}
                  </span>
                </div>
                <div className="text-slate-500">
                  Bidang Usaha: <b className="text-slate-700">{selectedDudiMeta.bidang_usaha || '-'}</b>
                  {' · '}
                  Status: <b className="text-slate-700">{selectedDudiMeta.status || 'Aktif'}</b>
                </div>
              </div>
            )
          )}

          {/* Jadwal Hari & Jam Kerja DUDI (Diisi 1x di awal pengajuan) */}
          <div className="pt-3 border-t border-slate-200/80">
            <WorkScheduleRangeInputs
              hariMulai={hariMulai}
              hariSelesai={hariSelesai}
              jamMulai={jamMulai}
              jamSelesai={jamSelesai}
              disabled={submitting}
              required={true}
              helperText="Jika DUDI sudah terdaftar, jadwal kerja terisi otomatis bila tersedia dan dapat disesuaikan bila berbeda."
              onChangeHariMulai={onChangeHariMulai}
              onChangeHariSelesai={onChangeHariSelesai}
              onChangeJamMulai={onChangeJamMulai}
              onChangeJamSelesai={onChangeJamSelesai}
            />
          </div>

          {/* Input Link Google Maps Tempat PKL (Wajib Valid) */}
          <div className="pt-3 border-t border-slate-200/80 space-y-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 font-bold text-slate-800">
                <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Link Google Maps Lokasi Tempat PKL *</span>
              </label>
              {mapsValidation?.valid && (
                <a
                  href={mapsValidation.normalizedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline whitespace-nowrap"
                >
                  <span>Buka Maps</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            <input
              type="url"
              value={linkMaps}
              onChange={(e) => onChangeLinkMaps(e.target.value)}
              placeholder="https://maps.app.goo.gl/... atau https://www.google.com/maps/..."
              required
              className={`w-full min-h-[44px] px-3.5 py-2 rounded-xl border bg-white font-mono text-xs focus:outline-none focus:ring-2 ${
                mapsValidation && !mapsValidation.valid
                  ? 'border-rose-400 focus:ring-rose-500'
                  : mapsValidation?.valid
                  ? 'border-emerald-400 focus:ring-emerald-500'
                  : 'border-slate-300 focus:ring-blue-600'
              }`}
            />

            {mapsValidation && !mapsValidation.valid ? (
              <p className="text-[11px] text-rose-700 font-medium">{mapsValidation.error}</p>
            ) : mapsValidation?.valid ? (
              <p className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Tautan Google Maps valid dan akan dicetak sebagai QR Code pada surat PKL.</span>
              </p>
            ) : (
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Salin link langsung dari tombol <b>Bagikan / Share → Salin Link</b> di Google Maps. Pengajuan akan ditolak jika link bukan tautan Google Maps yang valid.
              </p>
            )}

            <p className="text-[11px] text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-2">
              Catatan: Data Penanggung Jawab (Pemimpin &amp; PIC/Pendamping) serta nomor telepon resmi DUDI akan diverifikasi Guru Pendamping saat pengantaran siswa, sedangkan Hari &amp; Jam Kerja otomatis tersimpan dari pengajuan ini.
            </p>
          </div>
        </div>
      )}

      {submitError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          <span>{submitError}</span>
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2">
        <button
          type="button"
          onClick={onBackToStep2}
          className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali</span>
        </button>
        <button
          type="submit"
          disabled={submitting || !selectedDudiId}
          className="min-h-[44px] px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Mengirim ke Cloud Server...</span>
            </>
          ) : (
            <>
              <span>Kirim Formulir Pengajuan PKL</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
};
