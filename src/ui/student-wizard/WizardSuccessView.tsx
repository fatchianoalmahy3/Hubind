import React from 'react';
import { CheckCircle2, ExternalLink, Printer, ShieldCheck } from 'lucide-react';
import { formatNisVisual } from '../../core/utils/nisHelpers';

interface WizardSuccessViewProps {
  submissionResult: any;
  onSuccessOpenDocs?: (student: any) => void;
  onClose: () => void;
  onResetForm: () => void;
}

export const WizardSuccessView: React.FC<WizardSuccessViewProps> = ({
  submissionResult,
  onSuccessOpenDocs,
  onClose,
  onResetForm,
}) => {
  const mapsUrl = submissionResult.Link_Maps || submissionResult.link_maps;
  const formattedSavedAt = submissionResult.savedAt
    ? new Date(submissionResult.savedAt).toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '';

  return (
    <div className="py-3 sm:py-4 text-center space-y-4 sm:space-y-5 animate-in zoom-in-95 duration-200">
      <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
        <CheckCircle2 className="w-9 h-9" />
      </div>
      <div className="space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-800">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>Tercatat Resmi di Spreadsheet Google Sheets</span>
        </div>
        <h3 className="text-lg sm:text-xl font-bold text-slate-900">
          {submissionResult.deduplicated
            ? 'Pengajuan PKL Anda Sudah Tercatat!'
            : 'Pengajuan PKL Berhasil Disimpan!'}
        </h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
          Data pengajuan Anda beserta bio DUDI sudah terverifikasi masuk ke Cloud Server Pokja Hubin SMK PGRI 2 Ponorogo.
          {(submissionResult.sheetRowNumber || formattedSavedAt) && (
            <span className="block mt-1 font-mono text-[11px] text-emerald-700 font-semibold">
              {submissionResult.sheetRowNumber
                ? `Baris Spreadsheet #${submissionResult.sheetRowNumber}`
                : 'Tersimpan di Spreadsheet'}
              {formattedSavedAt ? ` · Pukul ${formattedSavedAt} WIB` : ''}
            </span>
          )}
        </p>
      </div>

      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-left max-w-lg mx-auto space-y-2 text-xs">
        <div className="flex justify-between gap-3 py-1 border-b border-slate-200/60">
          <span className="text-slate-500">Nomor Registrasi</span>
          <span className="font-mono font-bold text-blue-600">{submissionResult.id}</span>
        </div>
        <div className="flex justify-between gap-3 py-1 border-b border-slate-200/60">
          <span className="text-slate-500">Nama Siswa</span>
          <span className="font-bold text-slate-800 text-right">
            {submissionResult.nama_siswa} ({formatNisVisual(submissionResult.nis)})
          </span>
        </div>
        <div className="flex justify-between gap-3 py-1 border-b border-slate-200/60">
          <span className="text-slate-500">Kelas / Jurusan</span>
          <span className="font-semibold text-slate-700 text-right">
            {submissionResult.kelas} - {submissionResult.jurusan}
          </span>
        </div>
        <div className="flex justify-between gap-3 py-1 border-b border-slate-200/60">
          <span className="text-slate-500">DUDI Pilihan</span>
          <span className="font-bold text-indigo-700 text-right">{submissionResult.nama_dudi}</span>
        </div>
        {(submissionResult.Hari_Kerja || submissionResult.hari_kerja || submissionResult.Jam_Kerja || submissionResult.jam_kerja) && (
          <div className="flex justify-between gap-3 py-1 border-b border-slate-200/60">
            <span className="text-slate-500">Jadwal Kerja DUDI</span>
            <span className="font-semibold text-slate-800 text-right">
              {submissionResult.Hari_Kerja || submissionResult.hari_kerja || '-'}
              {submissionResult.Jam_Kerja || submissionResult.jam_kerja
                ? ` · ${submissionResult.Jam_Kerja || submissionResult.jam_kerja}`
                : ''}
            </span>
          </div>
        )}
        <div className="flex justify-between gap-3 py-1 border-b border-slate-200/60">
          <span className="text-slate-500 shrink-0">Link Google Maps</span>
          {mapsUrl ? (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-blue-600 hover:underline truncate max-w-[210px] sm:max-w-[240px] inline-flex items-center gap-1"
            >
              <span className="truncate">{mapsUrl}</span>
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          ) : (
            <span className="text-slate-500">-</span>
          )}
        </div>
        <div className="flex justify-between gap-3 py-1">
          <span className="text-slate-500">Status Saat Ini</span>
          <span className="font-semibold text-amber-600">{submissionResult.status}</span>
        </div>
      </div>

      <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-2xl text-xs text-blue-900 max-w-lg mx-auto text-left flex items-start gap-3">
        <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <b>Langkah Selanjutnya:</b> Cetak berkas rekomendasi dan mintakan persetujuan Ketua Konsentrasi Keahlian (Kakomli) jurusan Anda. Anda kini aman menutup halaman ini.
        </div>
      </div>

      <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-2.5 pt-2">
        {onSuccessOpenDocs && (
          <button
            type="button"
            onClick={() => {
              onSuccessOpenDocs(submissionResult);
              onClose();
            }}
            className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak Lembar Rekomendasi Kakomli</span>
          </button>
        )}
        <button
          type="button"
          onClick={onResetForm}
          className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
        >
          Ajukan untuk Siswa Lain
        </button>
        <button
          type="button"
          onClick={onClose}
          className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl border border-emerald-600 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors cursor-pointer"
        >
          Selesai &amp; Tutup Portal
        </button>
      </div>
    </div>
  );
};
