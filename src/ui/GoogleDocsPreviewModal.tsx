import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Printer,
  FileText,
  ShieldCheck,
  Layers,
  ChevronLeft,
  ChevronRight,
  Sliders,
  ExternalLink,
  Award,
  Building2,
  FileCheck,
  AlertCircle,
  Send,
  LogOut,
} from 'lucide-react';
import { GoogleSheetClient } from '../core/GoogleSheetClient';
import { PublicPortalClient } from '../core/PublicPortalClient';
import { DudiService } from '../services/DudiService';
import { PengajuanService } from '../services/PengajuanService';
import { SiswaService } from '../services/SiswaService';
import { Dudi, Pengajuan, Siswa } from '../core/types/schema';
import { formatIndonesianDate, getTodayWibIsoDate } from '../core/utils/dateHelpers';
import { getCanonicalNisDigits } from '../core/utils/relationHelpers';
import { PrintPortal } from './PrintPortal';
import { OfficialSchoolKop0708 } from './DocumentPrintTemplates';
import {
  QuickDocPreviewContent,
  QuickDocRenderOptions,
  QuickDocType,
} from './document-hub/QuickDocPreviewContent';

export type DocType = QuickDocType;

interface DocTabMeta {
  id: DocType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isGold?: boolean;
}

const ALL_DOC_TABS: DocTabMeta[] = [
  { id: 'pengajuan', label: '1. Rekomendasi Kakomli', icon: FileText },
  { id: 'perizinan', label: '2. Permohonan DUDI', icon: Building2 },
  { id: 'pengantaran', label: '3. Surat Pengantaran', icon: Send },
  { id: 'monitoring', label: '4. Instrumen Supervisi', icon: Layers },
  { id: 'penarikan', label: '5. Surat Penarikan', icon: LogOut },
  { id: 'nilai', label: '6. Lembar Nilai DUDI', icon: FileCheck },
  { id: 'blangko', label: '7. Blangko Sertifikat', icon: Award, isGold: true },
];

const MODULE_DOC_CONTEXT: Record<
  string,
  { defaultType: DocType; allowed: DocType[]; label: string }
> = {
  pengajuan: {
    defaultType: 'pengajuan',
    allowed: ['pengajuan'],
    label: 'Pengajuan PKL',
  },
  perizinan: {
    defaultType: 'perizinan',
    allowed: ['perizinan'],
    label: 'Perizinan PKL',
  },
  siswa_pkl: {
    defaultType: 'pengantaran',
    allowed: ['pengantaran', 'penarikan'],
    label: 'Data Siswa PKL',
  },
  monitoring: {
    defaultType: 'monitoring',
    allowed: ['monitoring'],
    label: 'Supervisi 8 Tahap',
  },
  sertifikat: {
    defaultType: 'blangko',
    allowed: ['blangko', 'nilai'],
    label: 'Raport & Blangko',
  },
  siswa: {
    defaultType: 'pengajuan',
    allowed: ['pengajuan', 'perizinan', 'pengantaran', 'penarikan', 'nilai', 'blangko'],
    label: 'Master Siswa',
  },
};

interface GoogleDocsPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedStudent?: any;
  allStudents?: any[];
  selectedStudents?: any[];
  sourceModuleId?: string;
  initialDocType?: DocType;
}

export const GoogleDocsPreviewModal: React.FC<GoogleDocsPreviewModalProps> = ({
  isOpen,
  onClose,
  selectedStudent,
  allStudents = [],
  selectedStudents = [],
  sourceModuleId,
  initialDocType,
}) => {
  const client = GoogleSheetClient.getInstance();
  const activeYear = client.getActiveYear();
  const templates = client.getTemplates();

  const moduleCtx = useMemo(() => {
    if (sourceModuleId && MODULE_DOC_CONTEXT[sourceModuleId]) {
      return MODULE_DOC_CONTEXT[sourceModuleId];
    }
    return {
      defaultType: initialDocType || 'pengajuan',
      allowed: [initialDocType || 'pengajuan'],
      label: 'Pengajuan PKL',
    };
  }, [sourceModuleId, initialDocType]);

  const resolvedDefaultDocType: DocType = initialDocType || moduleCtx.defaultType;

  const [docType, setDocType] = useState<DocType>(resolvedDefaultDocType);
  const [showAllDocTypes, setShowAllDocTypes] = useState(false);
  const [printScope, setPrintScope] = useState<'single' | 'selected' | 'all'>(() =>
    selectedStudents.length > 1
      ? 'selected'
      : selectedStudent
      ? 'single'
      : allStudents.length > 0
      ? 'all'
      : 'single'
  );
  const [previewIndex, setPreviewIndex] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    setDocType(resolvedDefaultDocType);
    setShowAllDocTypes(false);
    setPreviewIndex(0);
    if (selectedStudents.length > 1) {
      setPrintScope('selected');
    } else if (selectedStudent) {
      setPrintScope('single');
    } else if (selectedStudents.length === 1) {
      setPrintScope('selected');
    } else if (allStudents.length > 0) {
      setPrintScope('all');
    } else {
      setPrintScope('single');
    }
  }, [isOpen, resolvedDefaultDocType, selectedStudent, selectedStudents.length, allStudents.length]);

  const [showSettings, setShowSettings] = useState(false);
  const [paperSize, setPaperSize] = useState<'A4' | 'F4'>('A4');
  const [includeKop, setIncludeKop] = useState(true);
  const [includeQrCode, setIncludeQrCode] = useState(true);
  const [customNomorSurat, setCustomNomorSurat] = useState(
    `421.5 / ___ / Hubin / SMK.PGRI2 / ${new Date().getFullYear()}`
  );
  const [documentDate, setDocumentDate] = useState(() =>
    formatIndonesianDate(getTodayWibIsoDate())
  );
  const [isOverprintOnly, setIsOverprintOnly] = useState(false);
  const [kepalaSekolah, setKepalaSekolah] = useState(() => {
    try {
      return localStorage.getItem('hubin_kepala_sekolah') || '';
    } catch {
      return '';
    }
  });
  const [dudiList, setDudiList] = useState<Dudi[]>([]);
  const [pengajuanList, setPengajuanList] = useState<Pengajuan[]>([]);
  const [siswaList, setSiswaList] = useState<Siswa[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    let localVal = '';
    try {
      localVal = localStorage.getItem('hubin_kepala_sekolah') || '';
      if (localVal) setKepalaSekolah(localVal);
    } catch {
      // ignore
    }
    if (!localVal.trim()) {
      PublicPortalClient.getDocumentSigners()
        .then((res) => {
          if (!res?.kepalaSekolah) return;
          setKepalaSekolah(res.kepalaSekolah);
          try {
            localStorage.setItem('hubin_kepala_sekolah', res.kepalaSekolah);
          } catch {
            // ignore
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    Promise.all([
      DudiService.getInstance().getAll().catch(() => [] as Dudi[]),
      PengajuanService.getInstance().getAll().catch(() => [] as Pengajuan[]),
      SiswaService.getInstance().getAll().catch(() => [] as Siswa[]),
    ]).then(([dRows, pRows, sRows]) => {
      setDudiList(dRows);
      setPengajuanList(pRows);
      setSiswaList(sRows);
    });
  }, [isOpen]);

  const siswaByNis = useMemo(() => {
    const map = new Map<string, Siswa>();
    for (const s of siswaList) {
      const key = getCanonicalNisDigits(s.nis);
      if (key) map.set(key, s);
    }
    return map;
  }, [siswaList]);

  if (!isOpen) return null;

  const visibleTabs = showAllDocTypes
    ? ALL_DOC_TABS
    : ALL_DOC_TABS.filter((tab) => moduleCtx.allowed.includes(tab.id));

  let activeStudentList: any[] = [];
  if (printScope === 'single') {
    activeStudentList = selectedStudent ? [selectedStudent] : [];
  } else if (printScope === 'selected') {
    activeStudentList =
      selectedStudents.length > 0
        ? selectedStudents
        : selectedStudent
        ? [selectedStudent]
        : [];
  } else {
    activeStudentList =
      allStudents.length > 0
        ? allStudents
        : selectedStudents.length > 0
        ? selectedStudents
        : selectedStudent
        ? [selectedStudent]
        : [];
  }

  const currentStudent = activeStudentList[previewIndex] || activeStudentList[0] || null;
  const activeTemplateConfig = templates.find((t) => t.id === `doc_${docType}`);

  const renderOptions: QuickDocRenderOptions = {
    activeYear,
    documentDate,
    customNomorSurat,
    includeQrCode,
    isOverprintOnly,
    dudiList,
    pengajuanList,
    siswaByNis,
    kepalaSekolah,
  };

  const handlePrint = () => {
    if (activeStudentList.length === 0) return;
    window.print();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-150 no-print"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl overflow-hidden border border-slate-200/90 flex flex-col max-h-[94vh] no-print"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Header */}
        <div className="px-5 py-3.5 border-b border-slate-200/80 flex items-center justify-between bg-gradient-to-r from-slate-50 via-white to-amber-50/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                  Cetak Dokumen — {moduleCtx.label}
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                  TA {activeYear}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Menampilkan format surat resmi sesuai menu aktif ({paperSize})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeTemplateConfig?.url && (
              <a
                href={activeTemplateConfig.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold transition-all"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Buka Master Google Docs</span>
              </a>
            )}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                showSettings
                  ? 'bg-blue-50 border-blue-300 text-blue-700 shadow-2xs'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Setting Cetak</span>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scope Selector */}
        <div className="px-5 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-semibold text-[11px]">Jumlah Cetak:</span>
            <div className="inline-flex p-0.5 bg-slate-200/80 rounded-xl border border-slate-300/80">
              <button
                onClick={() => {
                  setPrintScope('single');
                  setPreviewIndex(0);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  printScope === 'single'
                    ? 'bg-white text-blue-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                1 Siswa ({selectedStudent ? 1 : 0})
              </button>
              <button
                onClick={() => {
                  setPrintScope('selected');
                  setPreviewIndex(0);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  printScope === 'selected'
                    ? 'bg-white text-blue-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Terpilih ({selectedStudents.length})
              </button>
              <button
                onClick={() => {
                  setPrintScope('all');
                  setPreviewIndex(0);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  printScope === 'all'
                    ? 'bg-white text-blue-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Semua di Tabel ({allStudents.length})
              </button>
            </div>
          </div>

          {activeStudentList.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500">
                Pratinjau: <b>{previewIndex + 1}</b> dari <b>{activeStudentList.length}</b> dokumen
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPreviewIndex((prev) => Math.max(0, prev - 1))}
                  disabled={previewIndex <= 0}
                  className="p-1 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() =>
                    setPreviewIndex((prev) => Math.min(activeStudentList.length - 1, prev + 1))
                  }
                  disabled={previewIndex >= activeStudentList.length - 1}
                  className="p-1 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Collapsible Setting Toolbar */}
        {showSettings && (
          <div className="p-4 bg-blue-50/70 border-b border-blue-200 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs animate-in slide-in-from-top-2 duration-150">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Ukuran Kertas:
              </label>
              <select
                value={paperSize}
                onChange={(e) => setPaperSize(e.target.value as any)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800"
              >
                <option value="A4">A4 Standar (210 x 297 mm)</option>
                <option value="F4">F4 / Folio (215 x 330 mm)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Tanggal Terbit Dokumen:
              </label>
              <input
                type="text"
                value={documentDate}
                onChange={(e) => setDocumentDate(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Nomor Surat Dinas:
              </label>
              <input
                type="text"
                value={customNomorSurat}
                onChange={(e) => setCustomNomorSurat(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 font-mono"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Opsi Cetak:
              </label>
              <div className="flex flex-wrap items-center gap-3 mt-1.5">
                <label className="flex items-center gap-1.5 text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeKop}
                    onChange={(e) => setIncludeKop(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <span>Kop</span>
                </label>
                <label className="flex items-center gap-1.5 text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeQrCode}
                    onChange={(e) => setIncludeQrCode(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <span>QR</span>
                </label>
                <label className="flex items-center gap-1.5 text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isOverprintOnly}
                    onChange={(e) => setIsOverprintOnly(e.target.checked)}
                    className="rounded text-amber-600"
                  />
                  <span>Overprint</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Contextual Tab Selector */}
        <div className="flex items-center justify-between gap-2 px-5 pt-2.5 border-b border-slate-200 bg-slate-50/70 text-xs font-semibold">
          <div className="flex items-center gap-1 overflow-x-auto">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = docType === tab.id;
              const activeBorder = tab.isGold
                ? 'border-amber-600 text-amber-600 font-bold'
                : 'border-blue-600 text-blue-600 font-bold';
              return (
                <button
                  type="button"
                  key={tab.id}
                  onClick={() => setDocType(tab.id)}
                  className={`px-3 py-2 border-b-2 transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                    isActive
                      ? activeBorder
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {moduleCtx.allowed.length < ALL_DOC_TABS.length && (
            <button
              type="button"
              onClick={() => {
                setShowAllDocTypes((prev) => {
                  const next = !prev;
                  if (!next && !moduleCtx.allowed.includes(docType)) {
                    setDocType(moduleCtx.defaultType);
                  }
                  return next;
                });
              }}
              className="mb-1.5 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-600 whitespace-nowrap cursor-pointer shrink-0"
            >
              {showAllDocTypes ? 'Sesuai Menu Saja' : 'Jenis Surat Lain'}
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-200/70 flex justify-center">
          {!currentStudent ? (
            <div className="bg-white w-full max-w-lg my-auto p-8 rounded-2xl border border-slate-200 text-center space-y-3 shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-900">
                Belum Ada Data Siswa Dipilih untuk Dicetak
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Silakan buka modul data (Pengajuan / Sertifikat / Siswa) yang sudah terhubung ke Cloud Server, pilih satu atau beberapa baris siswa, lalu klik tombol cetak dokumen.
              </p>
            </div>
          ) : (
            <div
              className={`bg-white w-full max-w-[760px] px-8 pb-8 pt-4 sm:px-10 sm:pb-10 sm:pt-5 rounded-2xl shadow-lg border border-slate-300 font-serif text-slate-900 leading-relaxed text-sm ${
                docType === 'nilai' ? 'flex flex-col min-h-[1040px]' : ''
              }`}
            >
              {includeKop && !isOverprintOnly && (
                <OfficialSchoolKop0708 variant="school" />
              )}

              <QuickDocPreviewContent
                docType={docType}
                student={currentStudent}
                options={renderOptions}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-600 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Total <b>{activeStudentList.length}</b> dokumen siap cetak ({paperSize}).
            </span>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              Tutup
            </button>
            <button
              onClick={handlePrint}
              disabled={activeStudentList.length === 0}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all active:scale-[0.98] cursor-pointer disabled:opacity-40"
            >
              <Printer className="w-4 h-4" />
              <span>
                {activeStudentList.length > 1
                  ? `Cetak ${activeStudentList.length} Dokumen (PDF / Printer)`
                  : 'Cetak Dokumen (PDF / Printer)'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* PRINT PORTAL OUTSIDE MODAL/OVERFLOW ROOT */}
      {activeStudentList.length > 0 && (
        <PrintPortal paperSize={paperSize}>
          {activeStudentList.map((stu, idx) => (
            <div
              key={stu.id || idx}
              className="print-sheet font-serif text-slate-900 leading-relaxed text-[13px]"
            >
              {includeKop && !isOverprintOnly && (
                <div className="print-avoid-break">
                  <OfficialSchoolKop0708 variant="school" />
                </div>
              )}

              <QuickDocPreviewContent
                docType={docType}
                student={stu}
                options={renderOptions}
              />
            </div>
          ))}
        </PrintPortal>
      )}
    </div>
  );
};
