import React, { useMemo, useRef, useState } from 'react';
import { X, Copy, Check, ShieldCheck, Sparkles, Download, FileCode2, FolderDown } from 'lucide-react';
import { ToastManager } from '../core/ToastManager';
import {
  buildGasApiModules,
  buildGasBootstrapScript,
  GasScriptModule,
} from '../core/gas/gasTemplateBuilder';

interface GasScriptModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GasScriptModal: React.FC<GasScriptModalProps> = ({ isOpen, onClose }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'bootstrap' | 'api'>('api');
  const [activeModuleId, setActiveModuleId] = useState<GasScriptModule['id']>('config');
  const codeTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const gasBootstrapCode = useMemo(() => buildGasBootstrapScript(), []);
  const gasApiModules = useMemo(() => buildGasApiModules(), []);

  if (!isOpen) return null;

  const activeModule =
    gasApiModules.find((m) => m.id === activeModuleId) || gasApiModules[0];
  const activeCode = activeTab === 'bootstrap' ? gasBootstrapCode : activeModule.code;
  const activeCopyKey = activeTab === 'bootstrap' ? 'bootstrap' : activeModule.id;
  const isCopied = copiedId === activeCopyKey;

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
      setCopiedId(activeCopyKey);
      ToastManager.getInstance().show(
        activeTab === 'bootstrap'
          ? 'Kode Generator Tersalin'
          : `${activeModule.filename} Tersalin`,
        'success',
        'Tempelkan ke file skrip di proyek Apps Script yang sama lalu tekan Ctrl+S (Simpan).'
      );
      setTimeout(() => setCopiedId(null), 2500);
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

  const triggerDownload = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadActiveGsFile = () => {
    const filename =
      activeTab === 'bootstrap' ? 'Hubin_Bootstrap_Generator.gs' : activeModule.filename;
    triggerDownload(filename, activeCode);
  };

  const downloadAllModules = () => {
    gasApiModules.forEach((mod, index) => {
      setTimeout(() => {
        triggerDownload(mod.filename, mod.code);
      }, index * 150);
    });
    ToastManager.getInstance().show(
      '4 File .gs Diunduh',
      'success',
      'Masukkan keempat file ke satu proyek Google Apps Script yang sama lalu Deploy 1 Web App.'
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white/95 backdrop-blur-2xl rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-200/90 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-200/60 shadow-2xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 tracking-tight">
                Integrasi API Server (4 File Modular) &amp; Generator Struktur
              </h3>
              <p className="text-[11px] text-slate-500">
                Kode Google Apps Script terbagi menjadi 4 modul rapi + ARRAYFORMULA Baris-1 (<code>;</code> &amp; <code>HSTACK</code>)
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

        {/* Main Tab Selector */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-slate-100 bg-slate-50/50">
          <button
            onClick={() => setActiveTab('api')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'api'
                ? 'border-blue-600 text-blue-700 font-extrabold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            1. Endpoint API Cloud Server (4 File .gs Modular)
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
          <div className="p-3.5 bg-purple-50/70 border border-purple-200/80 rounded-2xl text-xs text-purple-900 space-y-1.5">
            <div className="font-bold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-purple-600" />
              <span>
                {activeTab === 'api'
                  ? 'Cara Pemasangan 4 File GAS dalam 1 Proyek Apps Script (1 URL Deploy):'
                  : 'Cara Kerja Generator Struktur Server Baru:'}
              </span>
            </div>
            {activeTab === 'api' ? (
              <ol className="list-decimal list-inside space-y-0.5 text-purple-800 text-[11px] leading-relaxed">
                <li>
                  Buka Spreadsheet aktif &rarr; menu <b>Ekstensi</b> &rarr; <b>Apps Script</b>. Hapus kode lama di <code>Code.gs</code> (ubah nama menjadi <code>01_ConfigAndHelpers</code>), lalu klik tombol <b>+</b> &rarr; <b>Script</b> untuk membuat 3 file tambahan (<code>02_WebAppRouter</code>, <code>03_RelationalMigration</code>, <code>04_PdfAndYearlyRollover</code>) di proyek yang sama.
                </li>
                <li>
                  Tempel masing-masing isi modul di bawah ke file yang sesuai &rarr; tekan <b>Simpan semua (Ctrl+S)</b>. Pastikan tidak ada fungsi duplikat di file lama.
                </li>
                <li>
                  Buka file <code>03_RelationalMigration</code>, pilih fungsi <code>setupRelationalFormulasAndMigrate</code> di toolbar atas &rarr; klik <b>Run</b> 1x untuk backfill <code>ID_DUDI</code> / <code>ID_Guru</code> / <code>ID_Penempatan</code> lintas sheet dan menanamkan seluruh <code>ARRAYFORMULA</code> Baris-1 (<code>;</code> + <code>HSTACK</code>).
                </li>
                <li>
                  Klik <b>Deploy</b> &rarr; <b>Manage deployments</b> &rarr; ikon Edit &rarr; Version: <b>New version</b> (Execute as: <b>Me</b>, Who has access: <b>Anyone</b>) &rarr; <b>Deploy</b>.
                </li>
              </ol>
            ) : (
              <ol className="list-decimal list-inside space-y-0.5 text-purple-800 text-[11px] leading-relaxed">
                <li>Tambahkan kode Generator ini sebagai file baru di proyek Apps Script yang sudah berisi 4 modul Tab 1, lalu tekan <b>Ctrl+S</b>.</li>
                <li>Pilih fungsi <b>setupGoogleWorkspaceEnvironment</b> lalu klik <b>Run</b> untuk membuat folder arsip, 11 tabel relasional + <code>ARRAYFORMULA</code> otomatis, formulir, dan 5 templat dokumen.</li>
              </ol>
            )}
          </div>

          {activeTab === 'api' && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {gasApiModules.map((mod) => {
                  const isActive = mod.id === activeModule.id;
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      onClick={() => setActiveModuleId(mod.id)}
                      className={`px-3 py-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        isActive
                          ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-[11px] font-bold">
                        <FileCode2 className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-blue-400' : 'text-slate-400'}`} />
                        <span className="truncate">{mod.shortLabel}</span>
                      </div>
                      <div className={`text-[10px] mt-0.5 truncate ${isActive ? 'text-slate-300' : 'text-slate-500'}`}>
                        {mod.filename}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-slate-800">{activeModule.filename} — {activeModule.title}</div>
                  <div className="text-[11px] text-slate-500">{activeModule.description}</div>
                </div>
                <button
                  type="button"
                  onClick={downloadAllModules}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-[11px] font-bold transition-colors cursor-pointer"
                >
                  <FolderDown className="w-3.5 h-3.5" />
                  <span>Unduh Semua (4 File)</span>
                </button>
              </div>
            </div>
          )}

          <div className="relative">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-[11px] font-medium text-slate-500">
                {activeTab === 'api'
                  ? `Fungsi kunci: ${activeModule.mainFunction} • Klik area kode untuk blok semua teks`
                  : 'Fungsi utama: setupGoogleWorkspaceEnvironment()'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={downloadActiveGsFile}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh {activeTab === 'bootstrap' ? '.gs' : activeModule.filename}</span>
                </button>
                <button
                  type="button"
                  onClick={copyCode}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{isCopied ? 'Tersalin!' : `Salin ${activeTab === 'bootstrap' ? 'Script' : activeModule.shortLabel}`}</span>
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
              className="w-full h-[320px] p-4 bg-slate-900 text-slate-100 rounded-2xl text-[11px] font-mono leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Integrasi Cloud Server SMK PGRI 2 Ponorogo
          </span>
          <button
            type="button"
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
