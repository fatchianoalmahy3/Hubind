import React, { useState, useEffect } from 'react';
import {
  X,
  FileText,
  ExternalLink,
  Check,
  ShieldCheck,
  Copy,
  Save,
} from 'lucide-react';
import { GoogleSheetClient, WorkspaceTemplateConfig } from '../core/GoogleSheetClient';
import { EMPTY_DEFAULT_TEMPLATES } from '../core/firebase/WorkspaceConfigStore';
import { ToastManager } from '../core/ToastManager';

interface GoogleDocsTemplateManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdated?: () => void;
}

export const GoogleDocsTemplateManagerModal: React.FC<GoogleDocsTemplateManagerModalProps> = ({
  isOpen,
  onClose,
  onUpdated,
}) => {
  const client = GoogleSheetClient.getInstance();
  const [templates, setTemplates] = useState<WorkspaceTemplateConfig[]>([]);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const current = client.getTemplates();
      if (current && current.length > 0) {
        setTemplates(JSON.parse(JSON.stringify(current)));
      } else {
        setTemplates(JSON.parse(JSON.stringify(EMPTY_DEFAULT_TEMPLATES)));
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const extractDocId = (input: string): string => {
    const trimmed = input.trim();
    if (!trimmed) return '';
    const match = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return match[1];
    }
    return trimmed;
  };

  const handleUrlChange = (id: string, newInputValue: string) => {
    setTemplates((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const trimmed = newInputValue.trim();
        if (!trimmed) {
          return { ...t, url: '' };
        }
        const extractedId = extractDocId(trimmed);
        const fullUrl = trimmed.startsWith('http')
          ? trimmed
          : extractedId
          ? `https://docs.google.com/document/d/${extractedId}/edit`
          : '';
        return {
          ...t,
          url: fullUrl,
        };
      })
    );
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const ok = await client.updateTemplates(templates);
      if (ok) {
        if (onUpdated) onUpdated();
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  const copyId = (id: string, fullUrl: string) => {
    const docId = extractDocId(fullUrl);
    if (!docId) return;
    navigator.clipboard.writeText(docId);
    setCopiedId(id);
    ToastManager.getInstance().show('ID Disalin', 'info', `ID: ${docId}`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Apple-styled Modal Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Pengelola ID Template Google Docs
              </h2>
              <p className="text-xs text-slate-500">
                Disimpan permanen di Firebase Cloud agar sinkron di semua perangkat pengelola
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-200/70 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          <div className="p-4 bg-blue-50/70 border border-blue-200/80 rounded-2xl flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-600 space-y-1">
              <span className="font-bold text-slate-900 block">
                Pengaturan Template Dokumen (Auto-Detect ID):
              </span>
              <p className="leading-relaxed">
                Tempelkan (<b>Paste</b>) <b>Link Dokumen Lengkap</b> dari Google Docs atau ID dokumen saja
                (contoh: <code className="bg-white px-1 py-0.5 rounded text-[11px] font-mono text-blue-800">https://docs.google.com/document/d/.../edit</code>).
                Sistem otomatis mengekstrak ID dan menyimpannya ke Firebase.
              </p>
            </div>
          </div>

          {/* Template Items List */}
          <div className="space-y-3.5">
            {templates.map((tpl, idx) => {
              const currentId = extractDocId(tpl.url);
              const isConfigured = Boolean(currentId);

              return (
                <div
                  key={tpl.id}
                  className="p-4 rounded-2xl border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:border-blue-300 transition-all shadow-2xs space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="w-5 h-5 rounded-md bg-blue-100 text-blue-800 text-[11px] font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <h4 className="text-xs font-bold text-slate-900">{tpl.title}</h4>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isConfigured
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {isConfigured ? 'Terpasang' : 'Belum Diatur'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">{tpl.description}</p>
                    </div>

                    {isConfigured && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => copyId(tpl.id, tpl.url)}
                          className="px-2.5 py-1 text-[11px] font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 flex items-center gap-1 transition-colors cursor-pointer"
                          title="Salin ID Dokumen"
                        >
                          {copiedId === tpl.id ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span className="text-emerald-700">Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3 text-slate-400" />
                              <span>Salin ID</span>
                            </>
                          )}
                        </button>

                        <a
                          href={tpl.url}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Buka</span>
                        </a>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Link URL Google Docs atau Dokumen ID:
                    </label>
                    <input
                      type="text"
                      value={tpl.url}
                      onChange={(e) => handleUrlChange(tpl.id, e.target.value)}
                      placeholder="Tempel link Google Docs atau ID dokumen di sini..."
                      className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
                    />
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                      <span>
                        ID Dokumen:{' '}
                        <b className={isConfigured ? 'text-blue-700' : 'text-slate-400'}>
                          {currentId || '(Kosong)'}
                        </b>
                      </span>
                      <span className="text-slate-400 text-[10px]">Google Docs Template</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors cursor-pointer"
          >
            Tutup
          </button>

          <button
            type="button"
            onClick={handleSaveAll}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-all flex items-center gap-2 cursor-pointer active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? (
              <span>Menyimpan ke Firebase...</span>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Simpan Template ke Firebase</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
