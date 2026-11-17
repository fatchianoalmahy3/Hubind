import React, { useState } from 'react';
import {
  X,
  Printer,
  FileText,
  ShieldCheck,
  QrCode,
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
import { formatIndonesianDate, getTodayWibIsoDate } from '../core/utils/dateHelpers';
import { formatNisVisual } from '../core/utils/nisHelpers';

export type DocType =
  | 'pengajuan'
  | 'perizinan'
  | 'pengantaran'
  | 'monitoring'
  | 'penarikan'
  | 'nilai'
  | 'blangko';

interface GoogleDocsPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedStudent?: any;
  allStudents?: any[];
  selectedStudents?: any[];
}

export const GoogleDocsPreviewModal: React.FC<GoogleDocsPreviewModalProps> = ({
  isOpen,
  onClose,
  selectedStudent,
  allStudents = [],
  selectedStudents = [],
}) => {
  const client = GoogleSheetClient.getInstance();
  const activeYear = client.getActiveYear();
  const templates = client.getTemplates();

  const [docType, setDocType] = useState<DocType>('pengajuan');
  const [printScope, setPrintScope] = useState<'single' | 'selected' | 'all'>('single');
  const [previewIndex, setPreviewIndex] = useState(0);

  // Template Settings for Optimal Printing
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

  if (!isOpen) return null;

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

  const handlePrint = () => {
    if (activeStudentList.length === 0) return;
    window.print();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onClose}
    >
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #print-container, #print-container * {
            visibility: visible !important;
          }
          #print-container {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .print-sheet {
            page-break-after: always !important;
            break-after: page !important;
            padding: 15mm 20mm !important;
            width: 100% !important;
            box-shadow: none !important;
            border: none !important;
            min-height: 100vh !important;
          }
          .no-print {
            display: none !important;
          }
          @page {
            size: ${paperSize === 'F4' ? '215mm 330mm' : 'A4'};
            margin: 10mm;
          }
        }
      `}</style>

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
                  Template Dokumen &amp; Cetak Massal
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                  TA {activeYear}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Format administrasi Prakerin langsung dari data Cloud Server aktif
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

        {/* Tab Selector */}
        <div className="flex items-center gap-1 px-5 pt-2.5 border-b border-slate-200 bg-slate-50/70 overflow-x-auto text-xs font-semibold">
          <button
            onClick={() => setDocType('pengajuan')}
            className={`px-3 py-2 border-b-2 transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              docType === 'pengajuan'
                ? 'border-blue-600 text-blue-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>1. Rekomendasi Kakomli</span>
          </button>
          <button
            onClick={() => setDocType('perizinan')}
            className={`px-3 py-2 border-b-2 transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              docType === 'perizinan'
                ? 'border-blue-600 text-blue-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>2. Permohonan DUDI</span>
          </button>
          <button
            onClick={() => setDocType('pengantaran')}
            className={`px-3 py-2 border-b-2 transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              docType === 'pengantaran'
                ? 'border-blue-600 text-blue-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>3. Surat Pengantaran</span>
          </button>
          <button
            onClick={() => setDocType('monitoring')}
            className={`px-3 py-2 border-b-2 transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              docType === 'monitoring'
                ? 'border-blue-600 text-blue-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>4. Instrumen Supervisi</span>
          </button>
          <button
            onClick={() => setDocType('penarikan')}
            className={`px-3 py-2 border-b-2 transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              docType === 'penarikan'
                ? 'border-blue-600 text-blue-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>5. Surat Penarikan</span>
          </button>
          <button
            onClick={() => setDocType('nilai')}
            className={`px-3 py-2 border-b-2 transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              docType === 'nilai'
                ? 'border-blue-600 text-blue-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <FileCheck className="w-3.5 h-3.5" />
            <span>6. Lembar Nilai DUDI</span>
          </button>
          <button
            onClick={() => setDocType('blangko')}
            className={`px-3 py-2 border-b-2 transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              docType === 'blangko'
                ? 'border-amber-600 text-amber-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>7. Blangko Sertifikat</span>
          </button>
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
            <div className="bg-white w-full max-w-[760px] p-8 sm:p-10 rounded-2xl shadow-lg border border-slate-300 font-serif text-slate-900 leading-relaxed text-sm">
              {includeKop && !isOverprintOnly && (
                <div className="border-b-2 border-black pb-3 mb-6 text-center">
                  <div className="text-[11px] font-sans font-bold tracking-widest text-slate-700 uppercase">
                    YAYASAN PEMBINA LEMBAGA PENDIDIKAN DASAR DAN MENENGAH PGRI
                  </div>
                  <div className="text-xl font-bold uppercase tracking-wide mt-0.5 text-slate-950 font-sans">
                    SMK PGRI 2 PONOROGO
                  </div>
                  <div className="text-[11px] font-sans text-slate-700 mt-0.5 font-medium">
                    Status: Terakreditasi &quot;A&quot; (Unggul) • NSS: 322051301002 • NPSN: 20510123
                  </div>
                  <div className="text-[10px] font-sans text-slate-500">
                    Jl. Soekarno - Hatta No. 94 Ponorogo, Jawa Timur • Telp: (0352) 481456
                  </div>
                </div>
              )}

              {renderDocContent(docType, currentStudent, {
                activeYear,
                documentDate,
                customNomorSurat,
                includeQrCode,
                isOverprintOnly,
              })}
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

      {/* HIDDEN PRINT CONTAINER */}
      {activeStudentList.length > 0 && (
        <div id="print-container" className="hidden">
          {activeStudentList.map((stu, idx) => (
            <div key={stu.id || idx} className="print-sheet font-serif text-slate-900 leading-relaxed text-sm">
              {includeKop && !isOverprintOnly && (
                <div className="border-b-2 border-black pb-3 mb-6 text-center">
                  <div className="text-[11px] font-sans font-bold tracking-widest text-slate-700 uppercase">
                    YAYASAN PEMBINA LEMBAGA PENDIDIKAN DASAR DAN MENENGAH PGRI
                  </div>
                  <div className="text-xl font-bold uppercase tracking-wide mt-0.5 text-slate-950 font-sans">
                    SMK PGRI 2 PONOROGO
                  </div>
                  <div className="text-[11px] font-sans text-slate-700 mt-0.5 font-medium">
                    Status: Terakreditasi &quot;A&quot; (Unggul) • NSS: 322051301002 • NPSN: 20510123
                  </div>
                  <div className="text-[10px] font-sans text-slate-500">
                    Jl. Soekarno - Hatta No. 94 Ponorogo, Jawa Timur • Telp: (0352) 481456
                  </div>
                </div>
              )}

              {renderDocContent(docType, stu, {
                activeYear,
                documentDate,
                customNomorSurat,
                includeQrCode,
                isOverprintOnly,
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

function renderDocContent(
  docType: DocType,
  student: any,
  options: {
    activeYear: string;
    documentDate: string;
    customNomorSurat: string;
    includeQrCode: boolean;
    isOverprintOnly: boolean;
  }
) {
  const { activeYear, documentDate, customNomorSurat, includeQrCode, isOverprintOnly } = options;
  const studentName = student.nama || student.namaSiswa || student.nama_siswa || '-';
  const studentNis = formatNisVisual(student.nis || student.NIS || '');
  const studentNik = student.nik || student.NIK || '-';
  const studentJurusan = student.jurusan || student.Jurusan || '-';
  const studentKelas = student.kelas || student.Kelas || '-';
  const dudiName = student.dudiTujuan || student.nama_dudi || student.DUDI_Tujuan || '-';
  const dudiAddress = student.alamatDudi || student.alamat_dudi || student.Alamat_DUDI || '-';

  if (docType === 'pengajuan') {
    return (
      <div className="space-y-4">
        <div className="text-center font-bold uppercase underline text-sm tracking-wide">
          LEMBAR PERMOHONAN REKOMENDASI PRAKERIN
        </div>
        <div className="text-center text-xs font-sans text-slate-500">
          Tahun Ajaran {activeYear}
        </div>

        <p className="text-justify text-xs mt-4">
          Berdasarkan data pendaftaran melalui Portal Pokja Hubin, bersama ini diterangkan bahwa peserta didik berikut mengajukan permohonan rekomendasi penempatan Praktik Kerja Industri (Prakerin):
        </p>

        <table className="w-full text-xs font-sans border-collapse my-3">
          <tbody>
            <tr className="border-b border-slate-200">
              <td className="py-1.5 font-bold w-44">Nama Peserta Didik</td>
              <td className="py-1.5 font-semibold text-slate-900">: {studentName}</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="py-1.5 font-bold">NIS / NIK</td>
              <td className="py-1.5 font-mono">: {studentNis} / {studentNik}</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="py-1.5 font-bold">Kompetensi Keahlian</td>
              <td className="py-1.5">: {studentJurusan}</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="py-1.5 font-bold">Kelas / Wali Kelas</td>
              <td className="py-1.5">: {studentKelas} {student.waliKelas ? `/ ${student.waliKelas}` : ''}</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="py-1.5 font-bold">Mitra DUDI yang Dituju</td>
              <td className="py-1.5 font-bold text-blue-900">: {dudiName}</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="py-1.5 font-bold">Alamat DUDI</td>
              <td className="py-1.5">: {dudiAddress}</td>
            </tr>
          </tbody>
        </table>

        <div className="border border-slate-300 rounded-lg p-3.5 bg-slate-50 font-sans text-xs mt-4">
          <div className="font-bold text-slate-800 mb-2">
            KEPUTUSAN KETUA KOMPETENSI KEAHLIAN (KAKOMLI):
          </div>
          <div className="flex items-center gap-6 mb-2">
            <span className="font-semibold text-slate-700">[ &nbsp; ] DISETUJUI</span>
            <span className="font-semibold text-slate-700">[ &nbsp; ] DITOLAK</span>
          </div>
          <div className="text-[11px] text-slate-500">
            Catatan Kakomli: {student.catatanKakomli || '...............................................................'}
          </div>
        </div>

        <div className="flex justify-between items-end mt-8 font-sans text-xs">
          {includeQrCode ? (
            <div className="text-center p-2 border border-slate-200 rounded-lg bg-slate-50">
              <QrCode className="w-14 h-14 mx-auto text-slate-800" />
              <span className="text-[9px] text-slate-500 font-mono block mt-0.5">
                ID: {studentNis !== '-' ? studentNis : student.id}
              </span>
            </div>
          ) : (
            <div />
          )}
          <div className="text-center">
            <div>Ponorogo, {documentDate}</div>
            <div className="font-semibold mt-1">Ketua Kompetensi Keahlian,</div>
            <div className="h-16" />
            <div className="font-bold underline">................................................</div>
            <div className="text-[11px] text-slate-500">NIP. ..................................</div>
          </div>
        </div>
      </div>
    );
  }

  if (docType === 'perizinan') {
    return (
      <div className="space-y-4">
        <div className="flex justify-between font-sans text-xs">
          <div>
            <div>Nomor : {customNomorSurat}</div>
            <div>Lamp. : 1 (satu) Berkas</div>
            <div>Perihal : <b>Permohonan Penempatan Praktik Kerja Industri (Prakerin)</b></div>
          </div>
          <div>Ponorogo, {documentDate}</div>
        </div>

        <div className="font-sans text-xs mt-4">
          Kepada Yth.<br />
          <b>Pimpinan / HRD {dudiName}</b><br />
          {dudiAddress !== '-' ? dudiAddress : 'Di Tempat'}
        </div>

        <p className="text-justify text-xs mt-4">
          Dengan hormat,<br />
          Dalam rangka memenuhi tuntutan kurikulum Sekolah Menengah Kejuruan serta meningkatkan keselarasan antara kompetensi peserta didik dengan kebutuhan Dunia Usaha dan Dunia Industri (DUDI), kami memohon kesediaan Bapak/Ibu untuk berkenan menerima peserta didik kami melaksanakan Praktik Kerja Industri (Prakerin) di institusi/perusahaan yang Bapak/Ibu pimpin.
        </p>

        <table className="w-full text-xs font-sans border border-slate-300 my-2">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-1.5 border">No</th>
              <th className="p-1.5 border">Nama Siswa</th>
              <th className="p-1.5 border">NIS</th>
              <th className="p-1.5 border">Kompetensi Keahlian</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-1.5 border text-center">1</td>
              <td className="p-1.5 border font-semibold">{studentName}</td>
              <td className="p-1.5 border text-center font-mono">{studentNis}</td>
              <td className="p-1.5 border">{studentJurusan}</td>
            </tr>
          </tbody>
        </table>

        <p className="text-justify text-xs">
          Demikian permohonan ini kami sampaikan. Atas perhatian, kerjasama, dan bimbingan yang Bapak/Ibu berikan, kami sampaikan terima kasih.
        </p>

        <div className="flex justify-end mt-8 font-sans text-xs">
          <div className="text-center">
            <div>Kepala SMK PGRI 2 Ponorogo,</div>
            <div className="h-16" />
            <div className="font-bold underline">................................................</div>
            <div className="text-[11px] text-slate-500">NIP. ..................................</div>
          </div>
        </div>
      </div>
    );
  }

  if (docType === 'monitoring') {
    return (
      <div className="space-y-4">
        <div className="text-center font-bold uppercase underline text-sm tracking-wide">
          INSTRUMEN SUPERVISI &amp; MONITORING 5 TAHAP
        </div>
        <div className="text-center text-xs font-sans text-slate-500">
          Pokja Hubungan Industri SMK PGRI 2 Ponorogo
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs font-sans bg-slate-50 p-2.5 rounded-lg border border-slate-200">
          <div><b>DUDI:</b> {dudiName}</div>
          <div><b>Guru Pendamping:</b> {student.guruPendamping || '-'}</div>
          <div><b>Peserta:</b> {studentName} ({studentKelas})</div>
          <div><b>Tahun Ajaran:</b> {activeYear}</div>
        </div>

        <div className="space-y-2.5 font-sans text-xs mt-3">
          <div className="border border-slate-200 p-2 rounded-lg">
            <div className="font-bold text-blue-900">Tahap 1: Pengantaran Siswa</div>
            <div className="text-slate-600 text-[11px]">Serah terima siswa resmi dengan pimpinan/pembimbing bengkel DUDI &amp; briefing K3.</div>
          </div>
          <div className="border border-slate-200 p-2 rounded-lg">
            <div className="font-bold text-indigo-900">Tahap 2: Monitoring 1</div>
            <div className="text-slate-600 text-[11px]">Pengecekan adaptasi lingkungan kerja, Absensi (S/I/A), dan kedisiplinan harian.</div>
          </div>
          <div className="border border-slate-200 p-2 rounded-lg">
            <div className="font-bold text-violet-900">Tahap 3: Monitoring 2</div>
            <div className="text-slate-600 text-[11px]">Evaluasi perkembangan kompetensi kerja dan absensi S/I/A bulan berjalan.</div>
          </div>
          <div className="border border-slate-200 p-2 rounded-lg">
            <div className="font-bold text-purple-900">Tahap 4: Monitoring 3</div>
            <div className="text-slate-600 text-[11px]">Supervisi teknis lanjutan, penanganan kendala lapangan, dan rekap absensi.</div>
          </div>
          <div className="border-2 border-amber-300 bg-amber-50/50 p-2.5 rounded-lg">
            <div className="font-bold text-amber-900">Tahap 5: Monitoring 4 (Cek Pengambilan Nilai PKL)</div>
            <div className="text-slate-700 text-[11px]">
              Input 4 kategori nilai (K3LH, Softskills, Hardskills, Alur Bisnis Dunia Kerja) · No. Seri Blangko: <b>{student.noSeriBlangko || '(Belum Dialokasikan)'}</b>
            </div>
          </div>
          <div className="border border-slate-200 p-2 rounded-lg">
            <div className="font-bold text-orange-900">Tahap 6: Monitoring 5</div>
            <div className="text-slate-600 text-[11px]">Pemantapan persiapan akhir PKL &amp; susulan input nilai jika belum muncul di Mon 4.</div>
          </div>
          <div className="border border-slate-200 p-2 rounded-lg">
            <div className="font-bold text-cyan-900">Tahap 7: Monitoring 6</div>
            <div className="text-slate-600 text-[11px]">Finalisasi kelengkapan absensi, nilai industri, dan validasi blangko sertifikat.</div>
          </div>
          <div className="border border-slate-200 p-2 rounded-lg">
            <div className="font-bold text-emerald-900">Tahap 8: Penarikan Siswa</div>
            <div className="text-slate-600 text-[11px]">Penjemputan resmi siswa purnatugas prakerin dan penyerahan cinderamata kemitraan sekolah.</div>
          </div>
        </div>
      </div>
    );
  }

  if (docType === 'nilai') {
    const k3lhVal = student.nilaiK3lh ?? student.Nilai_K3LH ?? '-';
    const softskillVal = student.nilaiSoftskill ?? student.Nilai_Softskills ?? student.Nilai_Softskill ?? '-';
    const teknisVal =
      student.nilaiKompetensiTeknis ?? student.Nilai_Hardskills ?? student.Nilai_Kompetensi_Teknis ?? '-';
    const alurBisnisVal =
      student.nilaiAlurBisnis ?? student.Nilai_Alur_Bisnis_Dunia_Kerja ?? student.Nilai_Alur_Bisnis ?? '-';
    const rataRataVal =
      student.nilaiRataRata ??
      student.Nilai_rata_rata ??
      student.Nilai_Rata_Rata ??
      student.nilaiDudi ??
      student.Nilai_DUDI ??
      student.nilaiAkhir ??
      student.Nilai_Akhir ??
      '-';

    return (
      <div className="space-y-4">
        <div className="text-center font-bold uppercase underline text-sm tracking-wide">
          LEMBAR PENILAIAN PRAKTIK KERJA INDUSTRI (DUDI)
        </div>
        <div className="text-center text-xs font-sans text-slate-500">
          Peserta: {studentName} ({studentNis}) · {dudiName}
        </div>

        <table className="w-full text-xs font-sans border-collapse border border-slate-300 my-3">
          <thead className="bg-slate-100">
            <tr>
              <th className="border p-2 w-10 text-center">No</th>
              <th className="border p-2 text-left">Kategori Penilaian DUDI (Bobot Sama 25%)</th>
              <th className="border p-2 w-28 text-center">Nilai DUDI</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border p-2 text-center">1</td>
              <td className="border p-2">
                <div className="font-semibold">K3LH</div>
                <div className="text-[10px] text-slate-500">Keselamatan, Kesehatan Kerja, Penggunaan APD &amp; Kebersihan Area</div>
              </td>
              <td className="border p-2 text-center font-bold font-mono">{k3lhVal}</td>
            </tr>
            <tr>
              <td className="border p-2 text-center">2</td>
              <td className="border p-2">
                <div className="font-semibold">Softskills</div>
                <div className="text-[10px] text-slate-500">Etos Kerja, Kedisiplinan, Komunikasi &amp; Kerjasama Tim</div>
              </td>
              <td className="border p-2 text-center font-bold font-mono">{softskillVal}</td>
            </tr>
            <tr>
              <td className="border p-2 text-center">3</td>
              <td className="border p-2">
                <div className="font-semibold">Hardskills</div>
                <div className="text-[10px] text-slate-500">Kompetensi Teknis Kejuruan, Kualitas Hasil Kerja &amp; Kesesuaian SOP</div>
              </td>
              <td className="border p-2 text-center font-bold font-mono">{teknisVal}</td>
            </tr>
            <tr>
              <td className="border p-2 text-center">4</td>
              <td className="border p-2">
                <div className="font-semibold">Alur Bisnis Dunia Kerja</div>
                <div className="text-[10px] text-slate-500">Pemahaman Proses Operasional Industri &amp; Budaya Kerja DUDI</div>
              </td>
              <td className="border p-2 text-center font-bold font-mono">{alurBisnisVal}</td>
            </tr>
            <tr className="bg-slate-50 font-bold">
              <td colSpan={2} className="border p-2 text-right">
                RATA-RATA NILAI DUDI ({student.predikat || '-'}):
              </td>
              <td className="border p-2 text-center text-blue-700 font-mono text-sm">{rataRataVal}</td>
            </tr>
          </tbody>
        </table>

        <div className="flex justify-between items-end mt-12 font-sans text-xs">
          <div>
            <div className="text-slate-400 italic">Cap Stempel DUDI</div>
            <div className="w-24 h-24 border border-dashed border-slate-300 rounded-full flex items-center justify-center text-[10px] text-slate-400">
              STEMPEL
            </div>
          </div>
          <div className="text-center">
            <div>Ponorogo, {documentDate}</div>
            <div className="font-semibold mt-1">Pembimbing / Kepala Industri,</div>
            <div className="h-16" />
            <div className="font-bold underline">................................................</div>
            <div className="text-[11px] text-slate-500">{dudiName}</div>
          </div>
        </div>
      </div>
    );
  }

  if (docType === 'pengantaran') {
    const guruName = student.guruPendamping || student.Guru_Pendamping || '-';
    const tglBerangkat = formatIndonesianDate(
      student.tanggalBerangkat || student.Tanggal_Berangkat,
      documentDate
    );
    const tglTarik = formatIndonesianDate(
      student.tanggalRencanaTarik || student.Tanggal_Rencana_Tarik,
      '-'
    );
    return (
      <div className="space-y-4">
        <div className="flex justify-between font-sans text-xs">
          <div>
            <div>Nomor : {customNomorSurat}</div>
            <div>Perihal : <b>Berita Acara &amp; Pengantaran Peserta PKL</b></div>
          </div>
          <div>Ponorogo, {documentDate}</div>
        </div>

        <div className="font-sans text-xs mt-3">
          Kepada Yth.<br />
          <b>Pimpinan / Pembimbing Industri {student.namaDudi || dudiName}</b><br />
          {dudiAddress !== '-' ? dudiAddress : 'Di Tempat'}
        </div>

        <p className="text-justify text-xs mt-3">
          Dengan hormat,<br />
          Menindaklanjuti persetujuan penerimaan Praktik Kerja Industri (Prakerin) Tahun Ajaran {activeYear}, bersama surat ini kami menyerahkan peserta didik SMK PGRI 2 Ponorogo untuk melaksanakan Prakerin di instansi/perusahaan yang Bapak/Ibu pimpin dengan Guru Pendamping <b>{guruName}</b>:
        </p>

        <table className="w-full text-xs font-sans border border-slate-300 my-2">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-1.5 border">Nama Peserta</th>
              <th className="p-1.5 border">NIS</th>
              <th className="p-1.5 border">Tgl Berangkat</th>
              <th className="p-1.5 border">Rencana Penarikan</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-1.5 border font-semibold">{studentName}</td>
              <td className="p-1.5 border text-center font-mono">{studentNis}</td>
              <td className="p-1.5 border text-center">{tglBerangkat}</td>
              <td className="p-1.5 border text-center">{tglTarik}</td>
            </tr>
          </tbody>
        </table>

        <p className="text-justify text-xs">
          Mohon bimbingan dan pengawasan dari pihak DUDI selama pelaksanaan PKL berlangsung. Atas kerjasama yang baik kami ucapkan terima kasih.
        </p>

        <div className="flex justify-between items-end mt-10 font-sans text-xs">
          <div className="text-center">
            <div>Pembimbing DUDI,</div>
            <div className="h-14" />
            <div className="font-bold underline">................................................</div>
            <div className="text-[10px] text-slate-500">{student.namaDudi || dudiName}</div>
          </div>
          <div className="text-center">
            <div>Guru Pendamping Sekolah,</div>
            <div className="h-14" />
            <div className="font-bold underline">{guruName !== '-' ? guruName : '................................................'}</div>
            <div className="text-[10px] text-slate-500">SMK PGRI 2 Ponorogo</div>
          </div>
        </div>
      </div>
    );
  }

  if (docType === 'penarikan') {
    const guruName = student.guruPendamping || student.Guru_Pendamping || '-';
    const tglTarik = formatIndonesianDate(
      student.tanggalRencanaTarik || student.Tanggal_Rencana_Tarik,
      documentDate
    );
    return (
      <div className="space-y-4">
        <div className="flex justify-between font-sans text-xs">
          <div>
            <div>Nomor : {customNomorSurat}</div>
            <div>Perihal : <b>Surat Penarikan &amp; Ucapan Terima Kasih PKL</b></div>
          </div>
          <div>Ponorogo, {documentDate}</div>
        </div>

        <div className="font-sans text-xs mt-3">
          Kepada Yth.<br />
          <b>Pimpinan / Pembimbing Industri {student.namaDudi || dudiName}</b><br />
          {dudiAddress !== '-' ? dudiAddress : 'Di Tempat'}
        </div>

        <p className="text-justify text-xs mt-3">
          Dengan hormat,<br />
          Sehubungan dengan telah berakhirnya masa Praktik Kerja Industri (Prakerin) Tahun Ajaran {activeYear} pada tanggal <b>{tglTarik}</b>, bersama ini kami menugaskan Guru Pendamping <b>{guruName}</b> untuk melaksanakan penarikan kembali peserta didik berikut:
        </p>

        <table className="w-full text-xs font-sans border border-slate-300 my-2">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-1.5 border">No</th>
              <th className="p-1.5 border">Nama Siswa</th>
              <th className="p-1.5 border">NIS</th>
              <th className="p-1.5 border">Tempat PKL</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-1.5 border text-center">1</td>
              <td className="p-1.5 border font-semibold">{studentName}</td>
              <td className="p-1.5 border text-center font-mono">{studentNis}</td>
              <td className="p-1.5 border">{student.namaDudi || dudiName}</td>
            </tr>
          </tbody>
        </table>

        <p className="text-justify text-xs">
          Kami menyampaikan terima kasih yang sebesar-besarnya atas ilmu, pembinaan disiplin, serta kerjasama kemitraan yang telah terjalin dengan SMK PGRI 2 Ponorogo.
        </p>

        <div className="flex justify-between items-end mt-10 font-sans text-xs">
          <div className="text-center">
            <div>Pimpinan / Pembimbing DUDI,</div>
            <div className="h-14" />
            <div className="font-bold underline">................................................</div>
            <div className="text-[10px] text-slate-500">{student.namaDudi || dudiName}</div>
          </div>
          <div className="text-center">
            <div>a.n. Kepala Sekolah / Pokja Hubin,</div>
            <div className="h-14" />
            <div className="font-bold underline">................................................</div>
            <div className="text-[10px] text-slate-500">SMK PGRI 2 Ponorogo</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`space-y-4 p-6 rounded-xl relative ${
        isOverprintOnly ? 'bg-transparent' : 'border-4 border-amber-300 bg-amber-50/20'
      }`}
    >
      <div className="flex justify-between items-center text-xs font-mono font-bold text-amber-900 border-b border-amber-200 pb-2">
        <span>BLANGKO SERTIFIKAT RESMI</span>
        <span className="bg-amber-100 text-amber-900 px-3 py-1 rounded border border-amber-300">
          NO. SERI: {student.noSeriBlangko || '(Belum Diisi)'}
        </span>
      </div>

      <div className="text-center py-4">
        <div className="text-2xl font-serif font-bold text-slate-900 tracking-wider">
          SERTIFIKAT PRAKERIN
        </div>
        <div className="text-xs font-sans text-slate-500 mt-1">
          Nomor: 421.5 / {studentNis} / SERT.PKL / {new Date().getFullYear()}
        </div>
      </div>

      <div className="text-center text-xs font-sans text-slate-600">
        Diberikan kepada:
      </div>

      <div className="text-center text-xl font-bold font-serif underline text-blue-900 my-2">
        {studentName}
      </div>

      <div className="text-center text-xs font-sans text-slate-700 leading-relaxed max-w-lg mx-auto">
        Telah menyelesaikan Praktik Kerja Industri (Prakerin) di <b>{dudiName}</b> dengan Rata-rata Nilai DUDI:{' '}
        <b className="text-emerald-700 text-sm">
          {student.nilaiRataRata ??
            student.Nilai_rata_rata ??
            student.Nilai_Rata_Rata ??
            student.nilaiDudi ??
            student.Nilai_DUDI ??
            student.nilaiAkhir ??
            '-'}
        </b>{' '}
        (Predikat: <b>{student.predikat || '-'}</b>).
        <div className="mt-2 pt-2 border-t border-amber-200/70 text-[11px] text-slate-600 grid grid-cols-2 sm:grid-cols-4 gap-1.5 font-mono">
          <span>K3LH: <b>{student.nilaiK3lh ?? student.Nilai_K3LH ?? '-'}</b></span>
          <span>Softskills: <b>{student.nilaiSoftskill ?? student.Nilai_Softskills ?? student.Nilai_Softskill ?? '-'}</b></span>
          <span>Hardskills: <b>{student.nilaiKompetensiTeknis ?? student.Nilai_Hardskills ?? student.Nilai_Kompetensi_Teknis ?? '-'}</b></span>
          <span>Alur Bisnis: <b>{student.nilaiAlurBisnis ?? student.Nilai_Alur_Bisnis_Dunia_Kerja ?? student.Nilai_Alur_Bisnis ?? '-'}</b></span>
        </div>
      </div>

      <div className="flex justify-around items-end pt-10 font-sans text-xs">
        <div className="text-center">
          <div>Pimpinan Dunia Industri,</div>
          <div className="h-14" />
          <div className="font-bold underline">................................................</div>
          <div className="text-[10px] text-slate-500">{dudiName}</div>
        </div>
        <div className="text-center">
          <div>Kepala SMK PGRI 2 Ponorogo,</div>
          <div className="h-14" />
          <div className="font-bold underline">................................................</div>
          <div className="text-[10px] text-slate-500">NIP. ..................................</div>
        </div>
      </div>
    </div>
  );
}
