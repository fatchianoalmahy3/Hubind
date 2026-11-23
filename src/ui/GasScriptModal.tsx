import React, { useMemo, useRef, useState } from 'react';
import { X, Copy, Check, ShieldCheck, Sparkles, Download } from 'lucide-react';
import { ToastManager } from '../core/ToastManager';
import {
  buildGasApiScript,
  buildGasBootstrapScript,
} from '../core/gas/gasTemplateBuilder';

interface GasScriptModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GasScriptModal: React.FC<GasScriptModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'bootstrap' | 'api'>('api');
  const codeTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const gasBootstrapCode = useMemo(() => buildGasBootstrapScript(), []);
  const gasApiCode = useMemo(() => buildGasApiScript(), []);

  if (!isOpen) return null;

  const activeCode = activeTab === 'bootstrap' ? gasBootstrapCode : gasApiCode;

  const copyCode = async () => {
    let succeeded = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(activeCode);
        succeeded = true;
      }
    } catch {
      succeeded = false;
    }

    if (!succeeded && codeTextareaRef.current) {
      try {
        const el = codeTextareaRef.current;
        el.focus();
        el.select();
        el.setSelectionRange(0, activeCode.length);
        succeeded = document.execCommand('copy');
      } catch {
        succeeded = false;
      }
    }

    if (succeeded) {
      setCopied(true);
      ToastManager.getInstance().show(
        'Kode GAS Tersalin',
        'success',
        'Pastikan menempelkannya ke editor Apps Script lalu tekan Ctrl+S (Simpan) agar fungsi setupRelationalFormulasAndMigrate muncul.'
      );
      setTimeout(() => setCopied(false), 2500);
    } else {
      if (codeTextareaRef.current) {
        codeTextareaRef.current.focus();
        codeTextareaRef.current.select();
      }
      ToastManager.getInstance().show(
        'Salin Manual (Ctrl+C)',
        'info',
        'Seluruh teks kode sudah diblok otomatis. Tekan Ctrl+C (atau Unduh .gs) lalu tempel ke Apps Script.'
      );
    }
  };

  const downloadGsFile = () => {
    const filename =
      activeTab === 'bootstrap' ? 'Hubin_Bootstrap_Generator.gs' : 'Hubin_API_Endpoint_Relasional.gs';
    const blob = new Blob([activeCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white/95 backdrop-blur-2xl rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden border border-slate-200/90 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-200/60 shadow-2xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 tracking-tight">
                Integrasi API Server &amp; Generator Struktur
              </h3>
              <p className="text-[11px] text-slate-500">
                Hubungkan Portal Publik Siswa/Guru ke Database Cloud Server secara real-time (Relasional + ARRAYFORMULA)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-slate-100 bg-slate-50/50">
          <button
            onClick={() => setActiveTab('api')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'api'
                ? 'border-blue-600 text-blue-700 font-extrabold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            1. Endpoint API Cloud Server (Wajib untuk Portal Publik)
          </button>
          <button
            onClick={() => setActiveTab('bootstrap')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'bootstrap'
                ? 'border-purple-600 text-purple-700 font-extrabold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            2. Generator Struktur Database Baru (Tahun Ajaran Baru)
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4">
          <div className="p-3.5 bg-purple-50/70 border border-purple-200/80 rounded-2xl text-xs text-purple-900 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-purple-600" />
              <span>
                {activeTab === 'api'
                  ? 'Panduan Pemasangan Endpoint API Cloud Server & Migrasi ARRAYFORMULA:'
                  : 'Cara Kerja Generator Struktur Server Baru:'}
              </span>
            </div>
            {activeTab === 'api' ? (
              <ol className="list-decimal list-inside space-y-0.5 text-purple-800 text-[11px] leading-relaxed">
                <li>Buka Spreadsheet aktif &rarr; menu <b>Ekstensi</b> &rarr; <b>Apps Script</b> &rarr; hapus isi lama <code>Code.gs</code>, tempel seluruh kode Tab 1 di bawah, lalu klik <b>Simpan (Ctrl+S)</b> agar daftar fungsi terdeteksi.</li>
                <li>Pilih fungsi <code>setupRelationalFormulasAndMigrate</code> di bagian paling atas daftar fungsi toolbar Apps Script &rarr; klik <b>Run</b> 1 kali untuk backfill ID/FK, migrasi nilai ke <code>Monitoring_5_Tahap</code>, dan tanam <code>ARRAYFORMULA</code> Baris-1.</li>
                <li>Klik <b>Deploy</b> &rarr; <b>Manage deployments</b> &rarr; ikon Edit &rarr; Version: <b>New version</b> (atau <b>New deployment</b> &rarr; <b>Web app</b>, atur <b>Execute as: Me</b> dan <b>Who has access: Anyone</b>) &rarr; <b>Deploy</b>.</li>
                <li>Pastikan <b>Endpoint URL</b> berakhiran <code>/exec</code> terpasang di Konfigurasi Server.</li>
              </ol>
            ) : (
              <ol className="list-decimal list-inside space-y-0.5 text-purple-800 text-[11px] leading-relaxed">
                <li>Tempelkan kode Endpoint API (Tab 1) dan kode Generator ini ke dalam satu proyek Apps Script lalu tekan <b>Simpan (Ctrl+S)</b>.</li>
                <li>Pilih fungsi <b>setupGoogleWorkspaceEnvironment</b> lalu klik <b>Run</b> untuk membuat folder arsip, 11 tabel relasional + <code>ARRAYFORMULA</code> otomatis, formulir, dan 5 templat dokumen.</li>
              </ol>
            )}
          </div>

          <div className="relative">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-[11px] font-medium text-slate-500">
                {activeTab === 'api'
                  ? 'Fungsi teratas: setupRelationalFormulasAndMigrate() • Klik area kode untuk blok semua teks'
                  : 'Fungsi utama: setupGoogleWorkspaceEnvironment()'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={downloadGsFile}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh .gs</span>
                </button>
                <button
                  onClick={copyCode}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Tersalin!' : 'Salin Kode Script'}</span>
                </button>
              </div>
            </div>
            <textarea
              ref={codeTextareaRef}
              readOnly
              value={activeCode}
              onClick={(e) => e.currentTarget.select()}
              spellCheck={false}
              aria-label="Kode Google Apps Script"
              className="w-full h-[360px] p-4 bg-slate-900 text-slate-100 rounded-2xl text-[11px] font-mono leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Integrasi Cloud Server SMK PGRI 2 Ponorogo
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
