import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Loader2,
  MapPin,
  MessageCircle,
  Search,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { formatPhoneDisplay, getWhatsAppHref } from '../../core/utils/autoIdHelpers';
import { usePagination } from '../../hooks/usePagination';
import { PaginationBar } from '../PaginationBar';

interface DudiSelectionStepProps {
  selectedPetugasNama: string;
  assignedDudiList: any[];
  loadingDudi: boolean;
  dudiError: string;
  activeDudiId?: string;
  activeDudiNama?: string;
  onSelectDudi: (dudi: any) => void;
}

export const DudiSelectionStep: React.FC<DudiSelectionStepProps> = ({
  selectedPetugasNama,
  assignedDudiList,
  loadingDudi,
  dudiError,
  activeDudiId,
  activeDudiNama,
  onSelectDudi,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const deferredQuery = useDeferredValue(searchQuery);

  const filteredDudiList = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return assignedDudiList;
    return assignedDudiList.filter((dudi) => {
      const hay = `${dudi.nama || ''} ${dudi.bidang || ''} ${dudi.alamat || ''} ${dudi.pic || ''} ${dudi.namaPemimpin || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [assignedDudiList, deferredQuery]);

  const {
    paginatedItems: paginatedDudiList,
    page,
    pageSize,
    total,
    pageSizeOptions,
    setPage,
    setPageSize,
    resetPage,
  } = usePagination(filteredDudiList, { defaultPageSize: 10 });

  useEffect(() => {
    resetPage();
  }, [selectedPetugasNama, deferredQuery, resetPage]);

  return (
    <div className="space-y-3 sm:space-y-4 animate-in fade-in duration-150">
      <div className="px-3 py-2.5 sm:p-3.5 bg-blue-50/80 border border-blue-200/80 rounded-xl sm:rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs text-blue-900">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="truncate">
            Petugas: <b>{selectedPetugasNama}</b>
          </span>
        </div>
        <span className="text-[11px] text-blue-700 font-semibold tabular-nums shrink-0">
          {assignedDudiList.length} DUDI Diampu
        </span>
      </div>

      {!loadingDudi && !dudiError && assignedDudiList.length > 0 && (
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama DUDI, bidang, alamat, atau PIC..."
            aria-label="Cari DUDI bimbingan"
            className="w-full min-h-[42px] pl-9 pr-9 py-2 rounded-xl border border-slate-300 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Hapus pencarian DUDI"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[34px] min-h-[34px] rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {loadingDudi ? (
        <div className="space-y-3.5" aria-busy="true" aria-live="polite">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2.5 text-xs font-medium text-slate-600">
            <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
            <span>Memuat daftar DUDI bimbingan dari Cloud Server...</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="h-3 skeleton-shimmer rounded w-24" />
                  <div className="h-3 skeleton-shimmer rounded w-16" />
                </div>
                <div className="h-4 skeleton-shimmer rounded w-3/4" />
                <div className="h-3 skeleton-shimmer rounded w-full" />
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div className="h-3 skeleton-shimmer rounded w-20" />
                  <div className="h-8 skeleton-shimmer rounded-lg w-24" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : dudiError ? (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800">
          {dudiError}
        </div>
      ) : assignedDudiList.length === 0 ? (
        <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-center space-y-2 text-xs text-slate-600">
          <p className="font-bold text-slate-800">
            Belum Ada DUDI yang Di-plotting untuk {selectedPetugasNama}
          </p>
          <p>
            Pastikan Admin Hubin sudah menetapkan nama Anda pada data Penempatan Siswa PKL di Cloud Server.
          </p>
        </div>
      ) : filteredDudiList.length === 0 ? (
        <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl text-center space-y-2.5 text-xs text-slate-600">
          <p className="font-bold text-slate-800">
            Tidak ada DUDI yang cocok dengan "{searchQuery.trim()}"
          </p>
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="min-h-[38px] px-4 py-1.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold text-xs cursor-pointer"
          >
            Tampilkan Semua DUDI ({assignedDudiList.length})
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3.5 pt-0.5">
            {paginatedDudiList.map((dudi, idx) => {
              const isCurrentActive = Boolean(
                (activeDudiId && dudi.id && activeDudiId === dudi.id) ||
                  (activeDudiNama && dudi.nama && activeDudiNama === dudi.nama)
              );

              return (
                <div
                  key={`${dudi.id || 'dudi'}_${idx}`}
                  onClick={() => onSelectDudi(dudi)}
                  className={`p-3 sm:p-4 rounded-2xl border bg-white hover:border-blue-500 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between ${
                    isCurrentActive
                      ? 'border-blue-500 ring-2 ring-blue-500/15 bg-blue-50/20'
                      : 'border-slate-200/90'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1 text-[11px] text-slate-500">
                      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                        <span className="font-semibold text-blue-700 leading-snug truncate">
                          {dudi.bidang}
                        </span>
                        {isCurrentActive && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            <span>Dibuka</span>
                          </span>
                        )}
                      </div>
                      <span className="font-bold text-slate-600 flex items-center gap-1 shrink-0 whitespace-nowrap tabular-nums">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        <span>{dudi.jumlahSiswa ?? dudi.kuota} Siswa</span>
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors leading-snug">
                      {dudi.nama}
                    </h4>

                    <div className="flex items-start gap-1.5 text-[11px] text-slate-500 mt-1 leading-relaxed line-clamp-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <span>{dudi.alamat}</span>
                    </div>
                  </div>

                  <div className="pt-2.5 mt-2.5 border-t border-slate-100 flex items-center justify-between gap-2.5">
                    <div className="min-w-0 space-y-0.5">
                      <span className="text-[11px] text-slate-500 block leading-snug truncate">
                        PIC: <b className="text-slate-700">{dudi.pic}</b>
                      </span>
                      {getWhatsAppHref(dudi.kontak) && (
                        <a
                          href={getWhatsAppHref(dudi.kontak)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title={`Chat WhatsApp ke ${formatPhoneDisplay(dudi.kontak)}`}
                          className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-emerald-700 hover:text-emerald-900 hover:underline underline-offset-2"
                        >
                          <MessageCircle className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span>{formatPhoneDisplay(dudi.kontak)}</span>
                        </a>
                      )}
                    </div>
                    <button
                      type="button"
                      className="min-h-[40px] px-3.5 py-2 rounded-xl bg-blue-600 group-hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1 transition-all shrink-0 whitespace-nowrap"
                    >
                      <span>{isCurrentActive ? 'Lanjut' : 'Monitoring'}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
            <PaginationBar
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              pageSizeOptions={pageSizeOptions}
              itemLabel="DUDI"
            />
          </div>
        </div>
      )}
    </div>
  );
};
