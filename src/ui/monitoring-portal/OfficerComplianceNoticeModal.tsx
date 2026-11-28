import React from 'react';
import { CheckCircle2, ClipboardCheck, Info } from 'lucide-react';

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
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="compliance-notice-title"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 bg-blue-50/70 border-b border-blue-100 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <ClipboardCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 block">
              Panduan Singkat Petugas
            </span>
            <h3 id="compliance-notice-title" className="text-sm font-bold text-slate-900 mt-0.5">
              Alur Penerbitan Surat Tugas &amp; Pencairan HR
            </h3>
          </div>
        </div>

        <div className="p-5 space-y-3.5 text-xs text-slate-700 leading-relaxed">
          <p>
            Yth. Bapak/Ibu <b className="text-slate-900">{petugasNama || 'Petugas Monitoring'}</b>, terima kasih telah mendampingi siswa PKL di DUDI. Untuk kelancaran administrasi bersama, mohon kesediaannya memperhatikan alur berikut:
          </p>

          <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200/80 flex items-start gap-2.5 text-slate-800">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="font-medium leading-relaxed">
              Pengisian dan penyimpanan{' '}
              <span className="font-semibold text-blue-900 underline decoration-blue-300">
                Form Lembar Monitoring
              </span>{' '}
              mendukung kelancaran:
              <ul className="list-disc pl-4 mt-1.5 space-y-1 font-semibold text-slate-900">
                <li>Penerbitan Surat Tugas Pendampingan.</li>
                <li>Proses pencairan Honorarium (HR) monitoring.</li>
              </ul>
            </div>
          </div>

          <p className="text-[11px] text-slate-500">
            Mohon bantuannya untuk melengkapi data kehadiran, buku laporan, aktivitas &amp; kompetensi siswa, serta kondisi bengkel pada setiap kunjungan.
          </p>
        </div>

        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onLogout}
            className="min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs inline-flex items-center justify-center whitespace-nowrap cursor-pointer"
          >
            Ganti Petugas
          </button>
          <button
            type="button"
            onClick={onAcknowledge}
            className="min-h-[42px] px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 shadow-xs whitespace-nowrap cursor-pointer active:scale-[0.99]"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Siap, Lanjutkan</span>
          </button>
        </div>
      </div>
    </div>
  );
};