import React from 'react';
import { ChevronRight, Loader2, MapPin, MessageCircle, ShieldCheck, Users } from 'lucide-react';
import { formatPhoneDisplay, getWhatsAppHref } from '../../core/utils/autoIdHelpers';

interface DudiSelectionStepProps {
  selectedPetugasNama: string;
  assignedDudiList: any[];
  loadingDudi: boolean;
  dudiError: string;
  onSelectDudi: (dudi: any) => void;
}

export const DudiSelectionStep: React.FC<DudiSelectionStepProps> = ({
  selectedPetugasNama,
  assignedDudiList,
  loadingDudi,
  dudiError,
  onSelectDudi,
}) => {
  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      <div className="p-3.5 bg-blue-50/80 border border-blue-200/80 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs text-blue-900">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            Petugas Aktif: <b>{selectedPetugasNama}</b>
          </span>
        </div>
        <span className="text-[11px] text-blue-700 font-semibold">
          {assignedDudiList.length} DUDI Diampu
        </span>
      </div>

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
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
          {assignedDudiList.map((dudi, idx) => (
            <div
              key={`${dudi.id || 'dudi'}_${idx}`}
              onClick={() => onSelectDudi(dudi)}
              className="p-4 rounded-2xl border border-slate-200/90 bg-white hover:border-blue-500 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5 text-[11px] text-slate-500">
                  <span className="font-semibold text-blue-700 truncate">{dudi.bidang}</span>
                  <span className="font-bold text-slate-600 flex items-center gap-1 shrink-0">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span>{dudi.jumlahSiswa ?? dudi.kuota} Siswa</span>
                  </span>
                </div>

                <h4 className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                  {dudi.nama}
                </h4>

                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-2">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{dudi.alamat}</span>
                </div>
              </div>

              <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[11px] text-slate-500 truncate block">
                    PIC: <b className="text-slate-700">{dudi.pic}</b>
                  </span>
                  {getWhatsAppHref(dudi.kontak) && (
                    <a
                      href={getWhatsAppHref(dudi.kontak)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title={`Chat WhatsApp ke ${formatPhoneDisplay(dudi.kontak)}`}
                      className="inline-flex items-center gap-1 mt-0.5 text-[11px] font-mono font-semibold text-emerald-700 hover:text-emerald-900 hover:underline underline-offset-2"
                    >
                      <MessageCircle className="w-3 h-3 text-emerald-600 shrink-0" />
                      <span>{formatPhoneDisplay(dudi.kontak)}</span>
                    </a>
                  )}
                </div>
                <button
                  type="button"
                  className="min-h-[38px] px-3 py-1.5 rounded-lg bg-blue-600 group-hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1 transition-all shrink-0"
                >
                  <span>Supervisi</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
