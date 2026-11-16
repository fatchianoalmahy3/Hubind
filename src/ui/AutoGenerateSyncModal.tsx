import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  FileSpreadsheet,
  Download,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Layers,
  ArrowRight,
  Database,
  Code2,
} from 'lucide-react';
import { GoogleSheetClient } from '../core/GoogleSheetClient';
import { HUBIN_SHEETS_BLUEPRINT, SheetDefinition } from '../core/types/sheetBlueprint';
import { generateAndDownloadHubinXlsx, downloadSingleSheetCsv } from '../core/utils/xlsxGenerator';
import { ToastManager } from '../core/ToastManager';

interface AutoGenerateSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const AutoGenerateSyncModal: React.FC<AutoGenerateSyncModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const client = GoogleSheetClient.getInstance();
  const config = client.getConfig();

  const [activeTab, setActiveTab] = useState<'cloud' | 'download' | 'blueprint' | 'script'>('cloud');
  const [targetSpreadsheetId, setTargetSpreadsheetId] = useState(config.spreadsheetId || '');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    spreadsheetUrl?: string;
    formUrl?: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTargetSpreadsheetId(client.getConfig().spreadsheetId || '');
      setResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCloudAutoGenerate = async () => {
    setIsGenerating(true);
    setResult(null);
    try {
      const res = await client.triggerAutoGenerateAllSheetsAndForm(targetSpreadsheetId.trim());
      setResult(res);
      if (res.success && onSuccess) {
        onSuccess();
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadXlsx = async () => {
    const fileName = `Hubin_SMK_PGRI_2_Ponorogo_11_Tabel_TA_${config.activeYear.replace('/', '_')}.xlsx`;
    const success = await generateAndDownloadHubinXlsx(fileName);
    if (success) {
      ToastManager.getInstance().show(
        'File Master Excel (.xlsx) Berhasil Diunduh!',
        'success',
        `File ${fileName} berisi 11 tabel lengkap siap diunggah.`
      );
    }
  };

  const handleDownloadSingleCsv = async (def: SheetDefinition) => {
    await downloadSingleSheetCsv(def.sheetName, def.headers, def.sampleData);
    ToastManager.getInstance().show(
      'File CSV Diunduh',
      'info',
      `Template CSV tabel [${def.sheetName}] berhasil diunduh.`
    );
  };

  const gasScriptCode = `/**
 * ============================================================================
 * GOOGLE APPS SCRIPT: AUTO GENERATE 11 SHEET & FORMULIR TERPISAH
 * HUBIN SMK PGRI 2 PONOROGO (TA ${config.activeYear})
 * ============================================================================
 * 
 * Jalankan fungsi "autoGenerateAllSheetsAndForm" di bawah ini satu kali:
 * 1. Buka konsol Database Server Anda -> Ekstensi -> Apps Script.
 * 2. Tempelkan kode ini.
 * 3. Pilih fungsi "autoGenerateAllSheetsAndForm", lalu klik "Run".
 */

function autoGenerateAllSheetsAndForm() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const year = "${config.activeYear}";
  Logger.log("=== MEMULAI GENERASI 11 TABEL & FORMULIR UNTUK TA " + year + " ===");

  const sheetsData = [
    {
      name: "Master_Siswa_XI",
      headers: ["ID", "NIS", "NIK", "Nama_Lengkap", "Jenis_Kelamin", "ID_Jurusan", "Kelas", "No_HP_Siswa", "Alamat_Domisili", "Nama_Ortu_Wali", "No_Ortu_Wali", "Status_PKL", "Foto_URL"]
    },
    {
      name: "Master_Jurusan",
      headers: ["ID", "Kode", "Nama_Jurusan", "Nama_Kakomli", "NIP_Kakomli", "Kontak_WA", "Kuota_Siswa", "Total_Terdaftar"]
    },
    {
      name: "Master_Kelas_Walas",
      headers: ["ID", "Nama_Kelas", "Jurusan", "Tingkat", "Wali_Kelas", "Kontak_Walas", "Jumlah_Siswa"]
    },
    {
      name: "Master_DUDI",
      headers: ["ID", "Nama_DUDI", "Bidang_Keahlian", "Alamat", "Wilayah_Kota", "Nama_Pemimpin", "Nama_PIC", "Kontak_PIC", "No_Telp_DUDI", "Kuota_Maksimal", "Terisi", "Status_Kerjasama"]
    },
    {
      name: "Master_Guru_Pendamping",
      headers: ["ID", "NIP", "Nama_Lengkap", "Kontak_WA", "Email_Google", "Peran_Utama", "Jumlah_Bimbingan", "PIN"]
    },
    {
      name: "Data_Pengajuan_PKL",
      headers: ["No_Pengajuan", "Timestamp", "NIS", "Nama_Siswa", "Jurusan", "Kelas", "DUDI_Tujuan", "Alamat_DUDI", "Bidang_Pekerjaan", "Nama_Pemimpin", "Nama_PIC", "No_Telp_DUDI", "No_WA", "Alamat_Domisili", "Nama_Ortu_Wali", "No_Ortu_Wali", "Status_Kakomli", "Catatan_Kakomli", "Status_Hubin", "Guru_Pendamping", "Tgl_Berangkat"]
    },
    {
      name: "Data_Perizinan_PKL",
      headers: ["ID_Perizinan", "No_Pengajuan", "NIS", "Nama_Siswa", "Jurusan", "Kelas", "Nama_Ortu_Wali", "No_Ortu_Wali", "Status_Izin_Ortu", "No_Surat_Permohonan", "DUDI_Tujuan", "Alamat_DUDI", "Tgl_Kirim_Surat", "Status_Balasan_DUDI", "Tgl_Balasan", "Catatan_Perizinan", "Link_Bukti_Balasan"]
    },
    {
      name: "Plotting_Pemberangkatan",
      headers: ["ID_Penempatan", "NIS", "Nama_Siswa", "ID_DUDI", "Nama_DUDI", "ID_Guru_Pendamping", "Guru_Pendamping", "Tanggal_Berangkat", "Tanggal_Rencana_Tarik", "Status_Penempatan"]
    },
    {
      name: "Monitoring_5_Tahap",
      headers: ["ID_Monitoring", "ID_Penempatan", "NIS", "Nama_Siswa", "DUDI_Tujuan", "Alamat_DUDI", "Daftar_Siswa", "Jurusan", "Guru_Pendamping", "Tahap", "Tanggal_Kunjungan", "Sakit", "Izin", "Alpha", "Nilai_PKL_Muncul", "Nilai_K3LH", "Nilai_Softskills", "Nilai_Hardskills", "Nilai_Alur_Bisnis_Dunia_Kerja", "Nilai_rata_rata", "Catatan_Kunjungan", "Foto_Bukti_Drive", "Nilai_DUDI_Terkumpul", "Blangko_Sertifikat_Bawa", "Status_Tahap"]
    },
    {
      name: "Nilai_Dan_Sertifikat",
      headers: ["ID_Penempatan", "NIS", "Nama_Siswa", "Jurusan", "Kelas", "DUDI_Tujuan", "Nilai_K3LH", "Nilai_Softskills", "Nilai_Hardskills", "Nilai_Alur_Bisnis_Dunia_Kerja", "Nilai_rata_rata", "Predikat", "No_Seri_Blangko", "Status_Blangko", "Status_Raport", "Tgl_Terbit"]
    },
    {
      name: "Master_Akun",
      headers: ["ID", "Username", "Password_Hash", "Role", "Nama_Lengkap", "Jabatan", "Status", "Updated_At"]
    }
  ];

  // 1. Buat / Format 11 Tabel Terpisah
  sheetsData.forEach(function(item, index) {
    let sheet = ss.getSheetByName(item.name);
    if (!sheet) {
      sheet = (index === 0 && ss.getSheets().length === 1 && ss.getSheets()[0].getName().indexOf("Sheet1") !== -1)
        ? ss.getSheets()[0]
        : ss.insertSheet(item.name);
      sheet.setName(item.name);
    }
    // Jika kosong, pasang header dengan styling rapi
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(item.headers);
      sheet.getRange(1, 1, 1, item.headers.length)
        .setFontWeight("bold")
        .setBackground("#1E293B")
        .setFontColor("#FFFFFF");
      sheet.setFrozenRows(1);
    }
  });

  // 2. Buat Google Form Otomatis
  const formTitle = "Formulir Pengajuan PKL SMK PGRI 2 Ponorogo TA " + year;
  const form = FormApp.create(formTitle);
  form.setTitle(formTitle)
      .setDescription("Formulir Pengajuan PKL Siswa. Jawaban otomatis masuk ke Sheet Data_Pengajuan_PKL.")
      .setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  // Section 1: Jurusan
  form.addListItem()
      .setTitle("Pilih Kompetensi Keahlian (Jurusan) Anda")
      .setChoiceValues(["Desain Komunikasi Visual (DKV)", "Rekayasa Perangkat Lunak (RPL)", "Teknik Alat Berat (TAB)", "Teknik Bodi Kendaraan Ringan (TBKR)", "Teknik Kendaraan Ringan (TKR)", "Teknik Komputer dan Jaringan (TKJ)", "Teknik Pemesinan (TPM)", "Teknik Pengelasan (TPL)", "Teknik Sepeda Motor (TSM)"])
      .setRequired(true);

  // Section 2: Kelas & Nama Siswa
  form.addPageBreakItem().setTitle("Section 2: Kelas & Nama Siswa");
  form.addTextItem().setTitle("Pilih / Tuliskan Kelas Anda").setRequired(true);
  form.addTextItem().setTitle("Nama Lengkap Siswa").setRequired(true);
  form.addTextItem().setTitle("4 Digit Terakhir NIK (PIN Verifikasi)").setRequired(true);

  // Section 3: Identitas DUDI Tujuan
  form.addPageBreakItem().setTitle("Section 3: Identitas DUDI Tujuan");
  form.addTextItem().setTitle("Nama Perusahaan / Bengkel / DUDI").setRequired(true);
  form.addParagraphTextItem().setTitle("Alamat Lengkap & Kota DUDI").setRequired(true);
  form.addTextItem().setTitle("Bidang Pekerjaan / Usaha").setRequired(true);
  form.addTextItem().setTitle("No. WhatsApp Aktif Siswa").setRequired(true);

  Logger.log("SUKSES: 11 Tabel dan Formulir siap digunakan!");
  Logger.log("Link Form Siswa: " + form.getPublishedUrl());
}
`;

  const copyScript = () => {
    navigator.clipboard.writeText(gasScriptCode);
    setCopiedCode(true);
    ToastManager.getInstance().show(
      'Skrip API Server Disalin',
      'success',
      'Kode inisialisasi tabel siap ditempelkan pada konsol API Server.'
    );
    setTimeout(() => setCopiedCode(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white/95 backdrop-blur-2xl rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden border border-slate-200/90 flex flex-col max-h-[92vh]">
        {/* Apple Style Header */}
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 tracking-tight">
                  Inisialisasi &amp; Blueprint Struktur Server
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  11 Tabel Server
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Inisialisasi otomatis struktur Database Cloud Server dan sinkronkan seluruh entitas data
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 pt-2 border-b border-slate-100 bg-slate-50/50 overflow-x-auto text-xs">
          <button
            onClick={() => setActiveTab('cloud')}
            className={`px-3.5 py-2.5 font-bold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'cloud'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            1. Inisialisasi Cloud Server
          </button>
          <button
            onClick={() => setActiveTab('download')}
            className={`px-3.5 py-2.5 font-bold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'download'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            2. Download File Master Excel (.xlsx)
          </button>
          <button
            onClick={() => setActiveTab('blueprint')}
            className={`px-3.5 py-2.5 font-bold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'blueprint'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            3. Blueprint 11 Tabel Server
          </button>
          <button
            onClick={() => setActiveTab('script')}
            className={`px-3.5 py-2.5 font-bold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'script'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            4. Skrip API Integrasi Server
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4 max-h-[70vh]">
          {/* TAB 1: CLOUD AUTO-GENERATE */}
          {activeTab === 'cloud' && (
            <div className="space-y-4">
              <div className="p-4 bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-blue-500/10 border border-emerald-200/80 rounded-2xl text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Otomatisasi Struktur 11 Tabel Cloud Server:</span>
                </div>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  Fitur ini secara instan menyiapkan seluruh skema Database Cloud Server ke dalam <b>11 entitas tabel terpisah</b>, menata struktur kolom terstandar, dan menyiapkan entitas pengajuan PKL siswa agar tersinkronisasi penuh.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Target ID Database Cloud Server (Tahun Ajaran {config.activeYear}):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={targetSpreadsheetId}
                    onChange={(e) => setTargetSpreadsheetId(e.target.value)}
                    placeholder="Tempelkan ID Database Cloud Server sekolah Anda"
                    className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    onClick={handleCloudAutoGenerate}
                    disabled={isGenerating || !targetSpreadsheetId.trim()}
                    className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all disabled:opacity-50 shrink-0 cursor-pointer"
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                    <span>{isGenerating ? 'Memproses...' : 'Inisialisasi Server Sekarang'}</span>
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  *Masukkan ID Database resmi yang tersimpan pada Konfigurasi Server.
                </p>
              </div>

              {/* Alert Penjelasan Keamanan Server */}
              <div className="p-4 bg-amber-50/90 border border-amber-200 rounded-2xl text-xs space-y-2 text-amber-900">
                <div className="flex items-center gap-2 font-bold text-amber-900 text-xs">
                  <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Mengapa Struktur Database Server Belum Berubah Otomatis?</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Node Database Cloud Server dilindungi kebijakan otorisasi ketat. Browser web <b>tidak dapat memodifikasi skema inti secara sepihak</b> tanpa eksekusi skrip inisialisasi atau impor file master Excel (.xlsx).
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={() => setActiveTab('download')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Cara 1: Download File Master Excel (.xlsx)</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('script')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold shadow-xs transition-all"
                  >
                    <Code2 className="w-3.5 h-3.5" />
                    <span>Cara 2: Jalankan Skrip API Server</span>
                  </button>
                </div>
              </div>

              {/* Execution Feedback */}
              {result && (
                <div
                  className={`p-4 rounded-2xl text-xs space-y-2 border ${
                    result.success
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-blue-50 border-blue-200 text-blue-900'
                  }`}
                >
                  <div className="font-bold flex items-center gap-1.5">
                    {result.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <ShieldCheck className="w-4 h-4 text-blue-600" />
                    )}
                    <span>{result.message}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      onClick={() => setActiveTab('download')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download File Master Excel (.xlsx)</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('script')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 text-white text-[11px] font-semibold"
                    >
                      <Code2 className="w-3.5 h-3.5" />
                      <span>Salin Skrip API Server</span>
                    </button>
                    {result.spreadsheetUrl && (
                      <a
                        href={result.spreadsheetUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-[11px] font-semibold hover:bg-slate-50"
                      >
                        <Database className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Buka Database Server</span>
                        <ExternalLink className="w-3 h-3 text-slate-400" />
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Summary of 10 Server Tables */}
              <div className="border border-slate-200 rounded-2xl p-4 bg-white space-y-2 text-xs">
                <div className="font-bold text-slate-800">
                  Daftar 11 Tabel Server yang Digenerate:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  {HUBIN_SHEETS_BLUEPRINT.map((s, idx) => (
                    <div key={s.sheetName} className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="w-5 h-5 rounded-md bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-[10px] shrink-0">
                        {idx + 1}
                      </span>
                      <div className="truncate">
                        <span className="font-mono font-bold text-slate-700">{s.sheetName}</span>
                        <span className="text-slate-400 block text-[10px] truncate">{s.description}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Panduan Penyiapan Struktur Server */}
              <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl text-xs space-y-2">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <span>Ingin Menyiapkan Struktur Database Server Terlebih Dahulu?</span>
                </div>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  Anda dapat membuat node Database Cloud Server baru terlebih dahulu, lalu memilih salah satu dari 2 cara praktis berikut:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-[11px]">
                  <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
                    <span className="font-bold text-emerald-700 block">Cara 1 (Template Excel):</span>
                    <p className="text-slate-500">
                      Buka tab <b>&quot;Download File Master Excel (.xlsx)&quot;</b>, unduh file 11 tabel lengkap, lalu impor ke node database server Anda.
                    </p>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
                    <span className="font-bold text-blue-700 block">Cara 2 (Otomatisasi ID Server):</span>
                    <p className="text-slate-500">
                      Tempelkan ID Database Server kosong Anda ke kolom di atas, lalu klik <b>&quot;Inisialisasi Server Sekarang&quot;</b> untuk menyiapkan 11 tabel secara otomatis.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DOWNLOAD FILE MASTER EXCEL .XLSX */}
          {activeTab === 'download' && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl text-xs space-y-2 text-blue-900">
                <div className="font-bold flex items-center gap-1.5 text-sm">
                  <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                  <span>Download File Master Excel (.xlsx) Lengkap 11 Tabel:</span>
                </div>
                <p className="text-[11px] text-blue-800 leading-relaxed">
                  Unduh file master Excel <b>.xlsx</b> ini apabila ingin mengimpor struktur 11 tabel terstandar sekaligus ke node database server Anda.
                </p>
              </div>

              <div className="p-5 bg-white border border-slate-200 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-lg">
                    XLSX
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm">
                      Template_Lengkap_Hubin_SMK_PGRI_2_Ponorogo.xlsx
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      File Master Excel 11 Tabel • Format Kolom Auto-Width • Data Master 9 Jurusan &amp; Mitra DUDI
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleDownloadXlsx}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all shrink-0 active:scale-[0.98]"
                >
                  <Download className="w-4 h-4" />
                  <span>Download File Master Excel (.xlsx)</span>
                </button>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs space-y-1.5">
                <div className="font-bold text-slate-800">
                  Cara Impor File Master Excel (.xlsx) ke Database Server:
                </div>
                <ol className="list-decimal list-inside space-y-1 text-slate-600 text-[11px]">
                  <li>Unduh file Master Excel <code>.xlsx</code> di atas.</li>
                  <li>Buka panel database server Anda pada menu Konfigurasi Server.</li>
                  <li>Pilih menu <b>File</b> &rarr; <b>Impor (Import)</b> &rarr; <b>Upload</b> &rarr; pilih file <code>.xlsx</code> tadi.</li>
                  <li>Pilih opsi ganti / sisipkan tabel agar 11 struktur tabel baku langsung terbentuk.</li>
                  <li>Selesai! 11 entitas tabel server langsung siap dipakai seluruh pengguna.</li>
                </ol>
              </div>
            </div>
          )}

          {/* TAB 3: BLUEPRINT 11 TABEL SERVER */}
          {activeTab === 'blueprint' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Rincian spesifikasi 11 tabel server beserta struktur kolom bakunya:</span>
                <span className="font-bold text-emerald-700">11 Tabel Baku</span>
              </div>

              <div className="space-y-2.5">
                {HUBIN_SHEETS_BLUEPRINT.map((def) => (
                  <div
                    key={def.sheetName}
                    className="p-3.5 bg-white border border-slate-200 rounded-2xl hover:border-slate-300 transition-all flex flex-col justify-between space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-800 border">
                          {def.sheetName}
                        </span>
                        <span className="text-xs font-bold text-slate-800">{def.displayName}</span>
                      </div>
                      <button
                        onClick={() => handleDownloadSingleCsv(def)}
                        className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 p-1 hover:bg-blue-50 rounded-lg"
                        title="Unduh template CSV untuk tabel ini"
                      >
                        <Download className="w-3 h-3" />
                        <span>Unduh CSV</span>
                      </button>
                    </div>

                    <p className="text-[11px] text-slate-500">
                      {def.description}
                    </p>

                    <div className="flex flex-wrap gap-1 pt-1">
                      {def.headers.map((h) => (
                        <span key={h} className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-mono text-slate-700 border border-slate-200">
                          {h}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: SKRIP API SERVER */}
          {activeTab === 'script' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600">
                  Skrip inisialisasi struktur tabel untuk dipasang pada konektor Cloud Server:
                </span>
                <button
                  onClick={copyScript}
                  className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode ? 'Tersalin!' : 'Salin Skrip Server'}</span>
                </button>
              </div>

              <pre className="p-4 bg-slate-900 text-slate-100 rounded-2xl text-[11px] font-mono overflow-x-auto max-h-[350px] leading-relaxed">
                <code>{gasScriptCode}</code>
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Tahun Ajaran: <b className="text-slate-700">{config.activeYear}</b>
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
