import React, { useState, useEffect } from 'react';
import {
  X,
  Database,
  Check,
  RefreshCw,
  ShieldCheck,
  FolderSync,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  FolderPlus,
} from 'lucide-react';
import { GoogleSheetClient } from '../core/GoogleSheetClient';
import { ToastManager } from '../core/ToastManager';
import { normalizeGasUrl, validateGasDeployUrl } from '../core/utils/safeFetchJson';
import { AcademicYearRolloverModal } from './AcademicYearRolloverModal';

interface SpreadsheetConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigUpdated: () => void;
}

function parseSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return trimmed;
}

export const SpreadsheetConfigModal: React.FC<SpreadsheetConfigModalProps> = ({
  isOpen,
  onClose,
  onConfigUpdated,
}) => {
  const client = GoogleSheetClient.getInstance();

  const [activeYear, setActiveYear] = useState(client.getActiveYear());
  const [spreadsheetInput, setSpreadsheetInput] = useState('');
  const [spreadsheetName, setSpreadsheetName] = useState('');
  const [gasUrl, setGasUrl] = useState('');
  const [driveFolderUrl, setDriveFolderUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isRolloverOpen, setIsRolloverOpen] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      const cfg = client.getConfig();
      setActiveYear(cfg.activeYear);
      setSpreadsheetInput(cfg.spreadsheetId || '');
      setSpreadsheetName(cfg.spreadsheetName || '');
      setGasUrl(cfg.gasDeployUrl || '');
      setDriveFolderUrl(cfg.driveFolderUrl || '');
      setTestResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const cleanSpreadsheetId = parseSpreadsheetId(spreadsheetInput);

  const handleTestGas = async () => {
    if (testing) return;
    const normalized = normalizeGasUrl(gasUrl);
    setGasUrl(normalized);
    const check = validateGasDeployUrl(normalized);
    if (!check.valid) {
      const errMsg = check.error || 'Endpoint API Cloud Server tidak valid.';
      setTestResult({
        success: false,
        message: errMsg,
      });
      ToastManager.getInstance().show('Endpoint API Server Tidak Valid', 'error', errMsg);
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const res = await client.testConnection(normalized, cleanSpreadsheetId);
      if (res.success && res.title && !spreadsheetName.trim()) {
        setSpreadsheetName(res.title);
      }
      setTestResult(res);
    } finally {
      setTesting(false);
    }
  };

  const handleSaveCentral = async () => {
    setSaving(true);
    try {
      let resolvedName = spreadsheetName.trim();
      const normalizedGas = normalizeGasUrl(gasUrl);
      setGasUrl(normalizedGas);

      if (cleanSpreadsheetId && normalizedGas && !resolvedName) {
        const check = await client.pingGasConnection(normalizedGas, cleanSpreadsheetId);
        if (check.connected && check.title) {
          resolvedName = check.title;
        }
      }

      const ok = await client.saveCentralConfig(
        cleanSpreadsheetId,
        normalizedGas,
        driveFolderUrl.trim(),
        resolvedName || undefined
      );
      if (ok) {
        onConfigUpdated();
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white/95 backdrop-blur-2xl rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200/90 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200/60 shadow-2xs">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 tracking-tight">
                Konfigurasi Server &amp; Database Cloud (TA {activeYear})
              </h3>
              <p className="text-[11px] text-slate-500">
                Disimpan terpusat di Cloud Server agar identik di semua perangkat
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

        {/* Content */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="p-3.5 bg-slate-50/90 border border-slate-200/80 rounded-2xl text-xs text-slate-600 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-slate-800">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Single Source of Truth Cloud Server (TA {activeYear}):</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Pusat konfigurasi menyimpan referensi node database aktif. Seluruh data siswa, DUDI, pengajuan, monitoring, dan sertifikat dibaca serta ditulis 100% langsung ke Database Cloud Server ini.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span>Link atau ID Database Cloud Server (TA {activeYear}):</span>
              </label>
              <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-bold">
                Tahun Aktif
              </span>
            </div>
            <input
              type="text"
              value={spreadsheetInput}
              onChange={(e) => {
                setSpreadsheetInput(e.target.value);
                setTestResult(null);
              }}
              placeholder="Tempelkan link atau ID Database Cloud Server..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
            />
            {cleanSpreadsheetId && (
              <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                <span className="truncate">
                  ID Aktif: <b className="text-blue-700">{cleanSpreadsheetId}</b>
                </span>
                {spreadsheetName && (
                  <span className="text-emerald-700 font-sans font-semibold truncate ml-2">
                    {spreadsheetName}
                  </span>
                )}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Endpoint API Cloud Server (Deployment URL):
              </label>
              <button
                type="button"
                disabled={testing || !gasUrl.trim()}
                onClick={handleTestGas}
                className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline disabled:opacity-40 cursor-pointer"
              >
                {testing ? 'Menguji Server...' : 'Tes URL API Server'}
              </button>
            </div>
            <input
              type="text"
              value={gasUrl}
              onChange={(e) => {
                setGasUrl(e.target.value);
                setTestResult(null);
              }}
              onBlur={() => setGasUrl((prev) => normalizeGasUrl(prev))}
              placeholder="https://script.google.com/macros/s/.../exec"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
            />
            <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
              Wajib berakhiran <code>/exec</code> (bukan <code>/dev</code>). Pada dialog deploy server, pastikan <b>Execute as: Me</b> dan <b>Who has access: Anyone (Siapa saja)</b>.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
              <FolderSync className="w-3.5 h-3.5 text-blue-600" />
              <span>Link Folder Arsip Drive Hubin (Opsional):</span>
            </label>
            <input
              type="url"
              value={driveFolderUrl}
              onChange={(e) => setDriveFolderUrl(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
            />
          </div>

          <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5 min-w-0">
              <div className="text-xs font-bold text-blue-950">
                Pergantian Tahun Ajaran (~1.000 Siswa/Tahun)
              </div>
              <p className="text-[11px] text-blue-800/90 leading-snug">
                Buat file Spreadsheet baru untuk TA berikutnya sekaligus menyalin Master Jurusan, DUDI, Guru, &amp; Akun.
              </p>
            </div>
            <button
              type="button"
              disabled={!gasUrl.trim()}
              onClick={() => setIsRolloverOpen(true)}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold shadow-2xs transition-colors disabled:opacity-40 cursor-pointer whitespace-nowrap"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>Buka TA Baru &amp; Salin Master</span>
            </button>
          </div>

          {/* Test Status Banner */}
          {testResult && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                testResult.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1.5 min-w-0 flex-1">
                <p className="leading-relaxed">{testResult.message}</p>
                {!testResult.success && /^https?:\/\//i.test(normalizeGasUrl(gasUrl)) && (
                  <a
                    href={`${normalizeGasUrl(gasUrl)}${
                      normalizeGasUrl(gasUrl).includes('?') ? '&' : '?'
                    }action=PING${
                      cleanSpreadsheetId
                        ? `&spreadsheetId=${encodeURIComponent(cleanSpreadsheetId)}`
                        : ''
                    }`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 underline hover:text-rose-900"
                  >
                    <span>Cek langsung respon API Server di tab baru</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleTestGas}
            disabled={testing || !gasUrl.trim()}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-all disabled:opacity-40 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
            <span>{testing ? 'Menguji Koneksi...' : 'Tes Koneksi Server'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSaveCentral}
              disabled={saving || !cleanSpreadsheetId}
              className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all disabled:opacity-50 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{saving ? 'Menyimpan...' : 'Simpan Konfigurasi Server'}</span>
            </button>
          </div>
        </div>
      </div>

      <AcademicYearRolloverModal
        isOpen={isRolloverOpen}
        onClose={() => setIsRolloverOpen(false)}
        onSuccess={() => {
          onConfigUpdated();
          onClose();
        }}
      />
    </div>
  );
};
