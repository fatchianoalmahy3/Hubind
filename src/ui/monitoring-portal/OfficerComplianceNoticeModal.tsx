import React from 'react';
import { AlertTriangle, CheckCircle2, FileWarning } from 'lucide-react';

interface OfficerComplianceNoticeModalProps {
  isOpen: boolean;
  petugasNama: string;
  onAcknowledge: () => void;
  onLogout: () => void;
}

export const OfficerComplianceNoticeModal: React.FC<OfficerComplianceNoticeModalProps> = ({
  isOpen,
  petugasNama,
  onAcknowledge,
  onLogout,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="compliance-notice-title"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-amber-300 w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 bg-amber-50 border-b border-amber-200 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block">
              Pemberitahuan Penting Petugas
            </span>
            <h3 id="compliance-notice-title" className="text-sm font-bold text-slate-900 mt-0.5">
              Ketentuan Penerbitan Surat Tugas &amp; Pencairan HR
            </h3>
          </div>
        </div>

        <div className="p-5 space-y-3.5 text-xs text-slate-700 leading-relaxed">
          <p>
            Yth. Bapak/Ibu <b className="text-slate-900">{petugasNama || 'Petugas Monitoring'}</b>, sebelum melanjutkan pendampingan DUDI harap diperhatikan ketentuan berikut:
          </p>

          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-rose-900">
            <FileWarning className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="font-semibold leading-relaxed">
              Apabila petugas tidak mengisi dan menyimpan{' '}
              <span className="underline decoration-rose-400">Form Lembar Monitoring</span> secara lengkap sesuai tahap kunjungan:
              <ul className="list-disc pl-4 mt-1.5 space-y-1 font-bold text-rose-800">
                <li>Surat Tugas tidak dapat diterbitkan.</li>
                <li>HR (Honorarium) monitoring tidak dapat dicairkan.</li>
              </ul>
            </div>
          </div>

          <p className="text-[11px] text-slate-500">
            Pastikan seluruh data kehadiran, ceklist buku laporan, aktivitas &amp; kompetensi siswa, kondisi bengkel, serta tanda tangan siswa dilengkapi setiap kali kunjungan monitoring.
          </p>
        </div>

        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onLogout}
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs cursor-pointer"
          >
            Kembali / Ganti Petugas
          </button>
          <button
            type="button"
            onClick={onAcknowledge}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-[0.99]"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Saya Mengerti &amp; Lanjutkan</span>
          </button>
        </div>
      </div>
    </div>
  );
};
