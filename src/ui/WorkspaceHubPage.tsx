import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  FileText,
  FolderSync,
  ExternalLink,
  Copy,
  Check,
  Plus,
  Calendar,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Code2,
  AlertCircle,
  X,
} from 'lucide-react';
import { GoogleSheetClient } from '../core/GoogleSheetClient';
import { ToastManager } from '../core/ToastManager';

interface WorkspaceHubPageProps {
  onOpenGasModal: () => void;
  onOpenSheetConfig: () => void;
  onOpenAutoGenerate?: () => void;
  onOpenWizard?: () => void;
  onOpenTemplateManager?: () => void;
}

export const WorkspaceHubPage: React.FC<WorkspaceHubPageProps> = ({
  onOpenGasModal,
  onOpenSheetConfig,
  onOpenAutoGenerate,
  onOpenWizard,
  onOpenTemplateManager,
}) => {
  const client = GoogleSheetClient.getInstance();
  const [config, setConfig] = useState(client.getConfig());

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isAddYearModalOpen, setIsAddYearModalOpen] = useState(false);
  const [newYearName, setNewYearName] = useState('2027/2028');
  const [newSpreadsheetId, setNewSpreadsheetId] = useState('');
  const [newFormUrl, setNewFormUrl] = useState('');
  const [savingYear, setSavingYear] = useState(false);

  useEffect(() => {
    const unsubscribe = client.addChangeListener(() => {
      setConfig(client.getConfig());
    });
    return () => unsubscribe();
  }, []);

  const parseSpreadsheetId = (input: string): string => {
    const trimmed = input.trim();
    const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match && match[1] ? match[1] : trimmed;
  };

  const copyToClipboard = (text: string, id: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    ToastManager.getInstance().show(
      'Tautan Berhasil Disalin',
      'info',
      'Link dokumen telah disalin ke clipboard Anda.'
    );
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleSwitchYear = async (year: string) => {
    await client.switchAcademicYear(year);
  };

  const handleCreateNewYear = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = parseSpreadsheetId(newSpreadsheetId);
    if (!newYearName.trim() || !cleanId) return;

    setSavingYear(true);
    try {
      const ok = await client.addNewAcademicYear(
        newYearName.trim(),
        cleanId,
        `https://docs.google.com/spreadsheets/d/${cleanId}`,
        newFormUrl.trim()
      );
      if (ok) {
        setIsAddYearModalOpen(false);
        setNewYearName('');
        setNewSpreadsheetId('');
        setNewFormUrl('');
      }
    } finally {
      setSavingYear(false);
    }
  };

  const activeYearConfig = config.academicYears.find((y) => y.year === config.activeYear);
  const activeFormUrl = activeYearConfig?.formUrl || '';

  return (
    <div className="space-y-6">
      {/* Clean Editorial Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Pusat Berkas &amp; Tautan Google Workspace
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Direktori berkas resmi Prakerin SMK PGRI 2 Ponorogo tersimpan di Firebase
          </p>
        </div>

        {/* Disciplined Action Controls (h-9 = 36px uniform) */}
        <div className="flex items-center flex-wrap gap-2">
          <button
            type="button"
            onClick={onOpenGasModal}
            className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            <Code2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span>Script Otomasi (GAS)</span>
          </button>

          {onOpenAutoGenerate && (
            <button
              type="button"
              onClick={onOpenAutoGenerate}
              className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Blueprint 10 Sheet</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsAddYearModalOpen(true)}
            className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span>Tahun Ajaran Baru</span>
          </button>

          {onOpenWizard && (
            <button
              type="button"
              onClick={onOpenWizard}
              className="h-9 inline-flex items-center gap-1.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>Setup Wizard</span>
            </button>
          )}
        </div>
      </div>

      {/* Active Year & Single Source of Truth Summary Bar */}
      <div className="p-4 bg-white border border-slate-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
              config.spreadsheetId
                ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                : 'bg-amber-50 text-amber-600 border border-amber-200'
            }`}
          >
            {config.spreadsheetId ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0">
            <div className="font-bold text-slate-900">
              Tahun Ajaran Aktif:{' '}
              <span className="text-blue-600 font-mono tabular-nums">
                {config.activeYear || 'Belum Diatur'}
              </span>
            </div>
            <div className="text-slate-500 text-xs mt-0.5 truncate">
              {config.spreadsheetId ? (
                <>
                  File Database: <strong className="text-slate-700 font-medium">{config.spreadsheetName || config.spreadsheetId}</strong>
                </>
              ) : (
                'Belum ada Spreadsheet ID aktif. Klik Atur Spreadsheet ID atau Setup Wizard.'
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-slate-500 text-xs font-medium">Ganti Database Tahun</span>
          {config.academicYears.length > 0 ? (
            <select
              value={config.activeYear}
              onChange={(e) => handleSwitchYear(e.target.value)}
              className="h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer tabular-nums"
            >
              {config.academicYears.map((ay) => (
                <option key={ay.year} value={ay.year}>
                  {ay.label || `TA ${ay.year}`}
                </option>
              ))}
            </select>
          ) : (
            <button
              type="button"
              onClick={onOpenSheetConfig}
              className="h-9 px-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              Atur Spreadsheet ID
            </button>
          )}
        </div>
      </div>

      {/* Section 1: Daftar File Google Spreadsheet Per Tahun Ajaran */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>01. Berkas Google Spreadsheet Per Tahun Ajaran</span>
          </h2>
          <span className="text-xs text-slate-500">
            Setiap tahun ajaran memiliki file database mandiri di Google Drive
          </span>
        </div>

        {config.academicYears.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center space-y-3">
            <FileSpreadsheet className="w-8 h-8 text-slate-400 mx-auto" />
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-800">
                Belum Ada Google Spreadsheet Terhubung
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Tambahkan atau buat file Google Spreadsheet resmi sekolah melalui Setup Wizard atau tombol Konfigurasi Spreadsheet.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-1">
              {onOpenWizard && (
                <button
                  type="button"
                  onClick={onOpenWizard}
                  className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Buka Setup Wizard
                </button>
              )}
              <button
                type="button"
                onClick={onOpenSheetConfig}
                className="h-9 px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                Masukkan Spreadsheet ID
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {config.academicYears.map((ay) => {
              const isCurrent = ay.year === config.activeYear;
              const sheetUrl =
                ay.spreadsheetUrl ||
                (ay.spreadsheetId
                  ? `https://docs.google.com/spreadsheets/d/${ay.spreadsheetId}`
                  : '');

              return (
                <div
                  key={ay.year}
                  className={`bg-white rounded-xl border p-4 flex flex-col justify-between transition-colors ${
                    isCurrent
                      ? 'border-blue-400 ring-1 ring-blue-500/20'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 text-xs mb-2">
                      <span
                        className={`font-semibold ${
                          isCurrent ? 'text-blue-700' : 'text-slate-500'
                        }`}
                      >
                        {isCurrent ? 'Aktif Digunakan' : 'Arsip Historis'}
                      </span>
                      <span className="text-slate-400 font-mono tabular-nums">
                        TA {ay.year}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                      {ay.spreadsheetName || `Database PKL TA ${ay.year}`}
                    </h3>
                    <div className="mt-1 text-xs font-mono text-slate-500 truncate" title={ay.spreadsheetId}>
                      ID: {ay.spreadsheetId || 'Belum diatur'}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {sheetUrl ? (
                        <>
                          <a
                            href={sheetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 text-xs font-semibold transition-colors whitespace-nowrap"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>Buka Sheet</span>
                            <ExternalLink className="w-3 h-3 text-slate-400" />
                          </a>

                          <button
                            type="button"
                            onClick={() => copyToClipboard(sheetUrl, ay.year)}
                            className="w-9 h-9 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 inline-flex items-center justify-center transition-colors cursor-pointer"
                            title="Salin tautan spreadsheet"
                            aria-label="Salin tautan spreadsheet"
                          >
                            {copiedId === ay.year ? (
                              <Check className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={onOpenSheetConfig}
                          className="h-9 px-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold cursor-pointer"
                        >
                          Atur ID Spreadsheet
                        </button>
                      )}
                    </div>

                    {!isCurrent && (
                      <button
                        type="button"
                        onClick={() => handleSwitchYear(ay.year)}
                        className="h-9 px-3 rounded-lg text-xs font-semibold border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Aktifkan Tahun Ini
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Section 2: Google Form Siswa & Folder Google Drive */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Google Form Siswa */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-semibold text-slate-500">Pendaftaran Siswa Eksternal</span>
              <span className="text-slate-600 font-medium">
                {activeFormUrl ? 'Tautan Terpasang' : 'Belum Diatur'}
              </span>
            </div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">
              Formulir Pengajuan PKL Siswa (Opsional)
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Tautan Google Form eksternal di luar portal pengajuan berbasis NIS bawaan aplikasi.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
            {activeFormUrl ? (
              <>
                <a
                  href={activeFormUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 text-xs font-semibold transition-colors whitespace-nowrap"
                >
                  <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>Buka Google Form</span>
                  <ExternalLink className="w-3 h-3 text-slate-400" />
                </a>

                <button
                  type="button"
                  onClick={() => copyToClipboard(activeFormUrl, 'form_siswa')}
                  className="w-9 h-9 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 inline-flex items-center justify-center transition-colors cursor-pointer"
                  title="Salin Link Form"
                  aria-label="Salin Link Form"
                >
                  {copiedId === 'form_siswa' ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setIsAddYearModalOpen(true)}
                className="h-9 px-3.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                Atur Tautan Google Form
              </button>
            )}
          </div>
        </div>

        {/* Google Drive Folder */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-semibold text-slate-500">Arsip Cloud Sekolah</span>
              <span className="text-slate-600 font-medium">
                {config.driveFolderUrl ? 'Folder Terhubung' : 'Belum Diatur'}
              </span>
            </div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">
              Folder Utama: Arsip Hubin SMK PGRI 2 Ponorogo
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Penyimpanan cloud untuk foto supervisi guru, scan dokumen stempel DUDI, dan arsip surat.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
            {config.driveFolderUrl ? (
              <>
                <a
                  href={config.driveFolderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 text-xs font-semibold transition-colors whitespace-nowrap"
                >
                  <FolderSync className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>Buka Google Drive</span>
                  <ExternalLink className="w-3 h-3 text-slate-400" />
                </a>

                <button
                  type="button"
                  onClick={() => copyToClipboard(config.driveFolderUrl, 'drive_folder')}
                  className="w-9 h-9 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 inline-flex items-center justify-center transition-colors cursor-pointer"
                  title="Salin Link Folder Drive"
                  aria-label="Salin Link Folder Drive"
                >
                  {copiedId === 'drive_folder' ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onOpenSheetConfig}
                className="h-9 px-3.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                Pasang Link Folder Drive
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Section 3: Template Resmi Google Docs */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600 shrink-0" />
            <span>02. Template Resmi Google Docs (Mail Merge to PDF)</span>
          </h2>
          {onOpenTemplateManager && (
            <button
              type="button"
              onClick={onOpenTemplateManager}
              className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer self-start sm:self-auto whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span>Atur / Ganti ID Template</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {config.templates.map((tpl) => {
            const hasUrl = Boolean(tpl.url && tpl.url.trim());
            return (
              <div
                key={tpl.id}
                className="bg-white rounded-xl border border-slate-200 p-4 hover:border-slate-300 transition-colors flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-mono text-slate-500 font-semibold">{tpl.type}</span>
                    {hasUrl ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Terpasang
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-amber-700">
                        Belum Diatur
                      </span>
                    )}
                  </div>
                  <h3 className="text-xs font-bold text-slate-900 leading-snug">{tpl.title}</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{tpl.description}</p>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  {hasUrl ? (
                    <>
                      <a
                        href={tpl.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-8 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
                      >
                        <span>Buka Google Docs</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>

                      <button
                        type="button"
                        onClick={() => copyToClipboard(tpl.url, tpl.id)}
                        className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 inline-flex items-center justify-center transition-colors cursor-pointer"
                        title="Salin URL Dokumen"
                        aria-label="Salin URL Dokumen"
                      >
                        {copiedId === tpl.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </>
                  ) : onOpenTemplateManager ? (
                    <button
                      type="button"
                      onClick={onOpenTemplateManager}
                      className="h-8 text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                    >
                      Pasang ID / Link Google Docs &rarr;
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">Belum dikonfigurasi</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Modal Buat Tahun Ajaran Baru */}
      {isAddYearModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-[2px]"
          onClick={() => setIsAddYearModalOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3 min-w-0 pr-2">
                <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-900">Tambah Tahun Ajaran Baru</h3>
                  <p className="text-xs text-slate-500 truncate">
                    Menyimpan file Google Spreadsheet mandiri ke Firebase
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddYearModalOpen(false)}
                className="w-9 h-9 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/80 flex items-center justify-center cursor-pointer shrink-0"
                aria-label="Tutup modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateNewYear} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Label Tahun Ajaran <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newYearName}
                  onChange={(e) => setNewYearName(e.target.value)}
                  placeholder="Contoh: 2027/2028"
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 tabular-nums"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Google Spreadsheet ID atau URL Baru <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newSpreadsheetId}
                  onChange={(e) => setNewSpreadsheetId(e.target.value)}
                  placeholder="ID atau URL Google Spreadsheet baru"
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-slate-800 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Gunakan &quot;Setup Wizard&quot; untuk membuat Spreadsheet otomatis di Google Drive.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Link Google Form Siswa (Opsional)
                </label>
                <input
                  type="url"
                  value={newFormUrl}
                  onChange={(e) => setNewFormUrl(e.target.value)}
                  placeholder="https://docs.google.com/forms/d/..."
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddYearModalOpen(false)}
                  className="h-9 px-4 border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 rounded-lg font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingYear}
                  className="h-9 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold disabled:opacity-50 cursor-pointer"
                >
                  {savingYear ? 'Menyimpan...' : 'Daftarkan Tahun Ajaran'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
