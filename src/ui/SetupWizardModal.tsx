import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  FileSpreadsheet,
  Download,
  Copy,
  Check,
  ShieldCheck,
  ArrowRight,
  X,
  Server,
} from 'lucide-react';
import { GoogleSheetClient } from '../core/GoogleSheetClient';
import { HUBIN_SHEETS_BLUEPRINT } from '../core/types/sheetBlueprint';
import { generateAndDownloadHubinXlsx } from '../core/utils/xlsxGenerator';
import { ToastManager } from '../core/ToastManager';
import { normalizeGasUrl } from '../core/utils/safeFetchJson';

interface SetupWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigured: () => void;
}

export const SetupWizardModal: React.FC<SetupWizardModalProps> = ({
  isOpen,
  onClose,
  onConfigured,
}) => {
  const client = GoogleSheetClient.getInstance();
  const [config, setConfig] = useState(client.getConfig());

  const [step, setStep] = useState<'welcome' | 'generate' | 'connect' | 'done'>('welcome');
  const [spreadsheetInput, setSpreadsheetInput] = useState(config.spreadsheetId || '');
  const [driveUrlInput, setDriveUrlInput] = useState(config.driveFolderUrl || '');
  const [gasUrlInput, setGasUrlInput] = useState(config.gasDeployUrl || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [activeTabMethod, setActiveTabMethod] = useState<'xlsx' | 'script'>('xlsx');

  useEffect(() => {
    if (isOpen) {
      const latest = client.getConfig();
      setConfig(latest);
      setSpreadsheetInput(latest.spreadsheetId || '');
      setDriveUrlInput(latest.driveFolderUrl || '');
      setGasUrlInput(latest.gasDeployUrl || '');
      setStep('welcome');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Extract clean ID from full Google Spreadsheet URL or raw ID
  const parseSpreadsheetId = (input: string): string => {
    const trimmed = input.trim();
    const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      return match[1];
    }
    return trimmed;
  };

  const handleDownloadXlsx = () => {
    const fileName = `DATABASE_PKL_SMK_PGRI_2_PONOROGO_TA_${(config.activeYear || '2026_2027').replace('/', '_')}.xlsx`;
    const success = generateAndDownloadHubinXlsx(fileName);
    if (success) {
      ToastManager.getInstance().show(
        'File Master .xlsx Diunduh!',
        'success',
        'File template sheet terpisah berhasil diunduh. Siap diunggah ke Google Drive Anda.'
      );
    }
  };

  const handleSaveAndConnect = async () => {
    const cleanId = parseSpreadsheetId(spreadsheetInput);
    if (!cleanId) {
      ToastManager.getInstance().show(
        'ID Spreadsheet Kosong',
        'error',
        'Harap tempelkan Link atau ID Google Spreadsheet Anda.'
      );
      return;
    }

    setIsProcessing(true);
    try {
      const normalizedGas = normalizeGasUrl(gasUrlInput);
      let resolvedName: string | undefined = undefined;
      if (normalizedGas) {
        const check = await client.pingGasConnection(normalizedGas, cleanId);
        if (check.connected && check.title) {
          resolvedName = check.title;
        }
      }

      const ok = normalizedGas
        ? await client.saveCentralConfig(cleanId, normalizedGas, driveUrlInput.trim(), resolvedName)
        : await client.updateCentralLinks({
            spreadsheetId: cleanId,
            spreadsheetName: resolvedName,
            spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${cleanId}`,
            driveFolderUrl: driveUrlInput.trim() || undefined,
          });

      if (ok) {
        setStep('done');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const gasScriptCode = `/**
 * GOOGLE APPS SCRIPT: AUTO-GENERATE 10 SHEET & GFORM RESMI
 * SMK PGRI 2 PONOROGO (TA ${config.activeYear || '2026/2027'})
 */
function autoGenerateAllSheetsAndForm() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const year = "${config.activeYear || '2026/2027'}";

  const sheetsData = [
    { name: "Master_Siswa_XI", headers: ["ID", "NIS", "NIK", "Nama_Lengkap", "Jenis_Kelamin", "ID_Jurusan", "Kelas", "No_HP_Siswa", "Alamat_Domisili", "Nama_Ortu_Wali", "No_Ortu_Wali", "Status_PKL"] },
    { name: "Master_Jurusan", headers: ["ID", "Kode", "Nama_Jurusan", "Nama_Kakomli", "NIP_Kakomli", "Kontak_WA", "Kuota_Siswa", "Total_Terdaftar"] },
    { name: "Master_Kelas_Walas", headers: ["ID", "Nama_Kelas", "Jurusan", "Tingkat", "Wali_Kelas", "Kontak_Walas", "Jumlah_Siswa"] },
    { name: "Master_DUDI", headers: ["ID", "Nama_DUDI", "Bidang_Keahlian", "Alamat", "Wilayah_Kota", "Nama_PIC", "Kontak_PIC", "Kuota_Maksimal", "Terisi", "Status_Kerjasama"] },
    { name: "Master_Guru_Pendamping", headers: ["ID", "NIP", "Nama_Lengkap", "Kontak_WA", "Email_Google", "Peran_Utama", "Jumlah_Bimbingan", "PIN"] },
    { name: "Data_Pengajuan_PKL", headers: ["No_Pengajuan", "Timestamp", "NIS", "Nama_Siswa", "Jurusan", "Kelas", "DUDI_Tujuan", "Alamat_DUDI", "Bidang_Pekerjaan", "No_WA", "Status_Kakomli", "Catatan_Kakomli", "Status_Hubin", "Guru_Pendamping", "Tgl_Berangkat"] },
    { name: "Data_Perizinan_PKL", headers: ["No_Perizinan", "No_Pengajuan", "NIS", "Nama_Siswa", "Jurusan", "Kelas", "Nama_Ortu_Wali", "No_Ortu_Wali", "Status_Izin_Ortu", "No_Surat_Permohonan", "DUDI_Tujuan", "Alamat_DUDI", "Tanggal_Kirim_Surat", "Status_Balasan_DUDI", "Tanggal_Balasan", "Catatan_Perizinan", "Link_Bukti_Balasan"] },
    { name: "Plotting_Pemberangkatan", headers: ["ID_Penempatan", "NIS", "Nama_Siswa", "ID_DUDI", "Nama_DUDI", "ID_Guru_Pendamping", "Guru_Pendamping", "Tanggal_Berangkat", "Tanggal_Rencana_Tarik", "Status_Penempatan"] },
    { name: "Monitoring_5_Tahap", headers: ["ID_Monitoring", "ID_Penempatan", "DUDI_Tujuan", "Alamat_DUDI", "Daftar_Siswa", "Jurusan", "Guru_Pendamping", "Tahap", "Tanggal_Kunjungan", "Catatan_Kunjungan", "Foto_Bukti_Drive", "Nilai_DUDI_Terkumpul", "Blangko_Sertifikat_Bawa", "Status_Tahap"] },
    { name: "Nilai_Dan_Sertifikat", headers: ["ID_Penempatan", "NIS", "Nama_Siswa", "Jurusan", "Kelas", "DUDI_Tujuan", "Nilai_DUDI", "Nilai_Guru", "Nilai_Akhir", "Predikat", "No_Seri_Blangko", "Status_Blangko", "Status_Raport", "Tgl_Terbit"] },
    { name: "Master_Akun", headers: ["ID", "Username", "Password_Hash", "Role", "Nama_Lengkap", "Jabatan", "Status", "Updated_At"] }
  ];

  sheetsData.forEach(function(item, idx) {
    let sheet = ss.getSheetByName(item.name);
    if (!sheet) {
      sheet = (idx === 0 && ss.getSheets().length === 1 && ss.getSheets()[0].getName().indexOf("Sheet1") !== -1)
        ? ss.getSheets()[0] : ss.insertSheet(item.name);
      sheet.setName(item.name);
    }
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(item.headers);
      sheet.getRange(1, 1, 1, item.headers.length)
        .setFontWeight("bold")
        .setBackground("#0F172A")
        .setFontColor("#FFFFFF");
      sheet.setFrozenRows(1);
    }
  });

  const form = FormApp.create("Formulir Pengajuan PKL Siswa TA " + year);
  form.setDescription("Jawaban masuk ke Sheet Data_Pengajuan_PKL")
      .setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  Logger.log("Selesai! Form URL: " + form.getPublishedUrl());
}`;

  const copyScript = () => {
    navigator.clipboard.writeText(gasScriptCode);
    setCopiedCode(true);
    ToastManager.getInstance().show(
      'Kode Script Disalin',
      'success',
      'Tempelkan di Google Spreadsheet: Ekstensi -> Apps Script.'
    );
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white/95 backdrop-blur-2xl rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200/90 flex flex-col max-h-[92vh]">
        {/* Apple Style Top Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 via-white to-blue-50/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 tracking-tight">
                  Wizard Persiapan Google Spreadsheet &amp; Drive
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                  TA {config.activeYear || '2026/2027'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Konfigurasi ID Spreadsheet tersimpan terpusat di Firebase untuk seluruh perangkat
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

        {/* Progress Step Pills */}
        <div className="flex items-center justify-between px-6 py-2.5 bg-slate-50 border-b border-slate-100 text-xs font-semibold">
          <div
            className={`flex items-center gap-1.5 ${
              step === 'welcome' ? 'text-blue-600 font-bold' : 'text-slate-500'
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[11px] font-bold">
              1
            </span>
            <span>Pilihan Setup</span>
          </div>
          <div className="w-8 h-px bg-slate-200" />
          <div
            className={`flex items-center gap-1.5 ${
              step === 'generate' ? 'text-blue-600 font-bold' : 'text-slate-500'
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[11px] font-bold">
              2
            </span>
            <span>Buat 10 Sheet</span>
          </div>
          <div className="w-8 h-px bg-slate-200" />
          <div
            className={`flex items-center gap-1.5 ${
              step === 'connect' || step === 'done' ? 'text-blue-600 font-bold' : 'text-slate-500'
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[11px] font-bold">
              3
            </span>
            <span>Simpan di Firebase</span>
          </div>
        </div>

        {/* Step Body */}
        <div className="p-6 overflow-y-auto space-y-4 max-h-[68vh]">
          {step === 'welcome' && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50/80 border border-blue-200/80 rounded-2xl text-xs space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-blue-900">
                  <Server className="w-4 h-4 text-blue-600" />
                  <span>Arsitektur Single Source of Truth (Firebase + Spreadsheet):</span>
                </div>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  ID Spreadsheet yang diatur di sini disimpan di Firebase Cloud Firestore agar konsisten di laptop, tablet, maupun smartphone. Seluruh data siswa, DUDI, pengajuan, perizinan, dan monitoring dibaca dan ditulis langsung ke Google Spreadsheet tersebut.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('generate')}
                  className="p-4 text-left rounded-2xl border-2 border-emerald-500/30 hover:border-emerald-600 bg-emerald-50/40 hover:bg-emerald-50 transition-all flex flex-col justify-between group cursor-pointer shadow-2xs"
                >
                  <div className="space-y-2">
                    <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm group-hover:text-emerald-700">
                        Opsi A: Auto-Generate 10 Sheet Baru
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                        Belum punya spreadsheet atau ingin file baru? Buat 10 sheet terpisah lengkap dengan header resmi di Google Drive.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-bold text-emerald-700 mt-4">
                    <span>Mulai Pembuatan</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setStep('connect')}
                  className="p-4 text-left rounded-2xl border-2 border-blue-500/30 hover:border-blue-600 bg-blue-50/40 hover:bg-blue-50 transition-all flex flex-col justify-between group cursor-pointer shadow-2xs"
                >
                  <div className="space-y-2">
                    <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm group-hover:text-blue-700">
                        Opsi B: Hubungkan File Spreadsheet Ada
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                        Sudah memiliki Google Spreadsheet di Google Drive sekolah? Tempelkan link atau ID Spreadsheet untuk disinkronkan.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-bold text-blue-700 mt-4">
                    <span>Hubungkan File</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs space-y-1.5">
                <span className="font-bold text-slate-700 block text-[11px]">
                  10 Sheet Terpisah yang Digunakan:
                </span>
                <div className="flex flex-wrap gap-1.5 text-[10px] font-mono text-slate-600">
                  {HUBIN_SHEETS_BLUEPRINT.map((s) => (
                    <span
                      key={s.sheetName}
                      className="px-2 py-0.5 bg-white border border-slate-200 rounded-md"
                    >
                      {s.sheetName}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 'generate' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2 overflow-x-auto text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTabMethod('xlsx')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    activeTabMethod === 'xlsx'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>1. Download Template .xlsx</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTabMethod('script')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    activeTabMethod === 'script'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>2. Skrip Apps Script</span>
                </button>
              </div>

              {activeTabMethod === 'xlsx' && (
                <div className="space-y-3">
                  <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-sm">
                        XLSX
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">
                          DATABASE_PKL_SMK_PGRI_2_PONOROGO_10_SHEETS.xlsx
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          10 Sheet Terpisah Lengkap dengan header kolom terstandar siap isi data sekolah.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleDownloadXlsx}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all active:scale-[0.99] cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download File .xlsx 10 Sheet</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setStep('connect')}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
                  >
                    <span>Lanjut: Masukkan Link Spreadsheet</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {activeTabMethod === 'script' && (
                <div className="space-y-3">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs flex items-center justify-between">
                    <span className="text-[11px] text-slate-600 font-semibold">
                      Jalankan skrip ini sekali di Google Spreadsheet Anda:
                    </span>
                    <button
                      type="button"
                      onClick={copyScript}
                      className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
                    >
                      {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedCode ? 'Tersalin' : 'Salin Skrip'}</span>
                    </button>
                  </div>

                  <pre className="p-4 bg-slate-900 text-slate-100 rounded-2xl text-[10px] font-mono overflow-x-auto max-h-[220px] leading-relaxed">
                    <code>{gasScriptCode}</code>
                  </pre>

                  <button
                    type="button"
                    onClick={() => setStep('connect')}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Lanjut: Hubungkan ID Spreadsheet</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 'connect' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs space-y-1">
                <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Simpan Terpusat di Firebase (Multi-Device Sync):</span>
                </div>
                <p className="text-[11px] text-emerald-800">
                  Tempelkan URL atau ID Google Spreadsheet resmi Anda. Konfigurasi ini disimpan di Cloud Firestore agar seluruh perangkat membaca file yang sama.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Link Lengkap atau ID Google Spreadsheet (TA {config.activeYear || '2026/2027'}):
                </label>
                <input
                  type="text"
                  value={spreadsheetInput}
                  onChange={(e) => setSpreadsheetInput(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/ID_SPREADSHEET_ANDA/edit"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Link Folder Google Drive Hubin (Opsional):
                </label>
                <input
                  type="url"
                  value={driveUrlInput}
                  onChange={(e) => setDriveUrlInput(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Google Apps Script Web App Deployment URL (Untuk Portal Publik Siswa &amp; Guru):
                </label>
                <input
                  type="text"
                  value={gasUrlInput}
                  onChange={(e) => setGasUrlInput(e.target.value)}
                  onBlur={() => setGasUrlInput((prev) => normalizeGasUrl(prev))}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                />
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="py-6 text-center space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-xs border border-emerald-200">
                <Check className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Google Spreadsheet Siap &amp; Tersimpan di Firebase!
                </h3>
                <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed mt-1">
                  ID Spreadsheet untuk <b>Tahun Ajaran {config.activeYear || '2026/2027'}</b> kini tersimpan di Firebase dan otomatis sinkron di seluruh perangkat.
                </p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl inline-block text-xs font-mono text-slate-700">
                ID: {parseSpreadsheetId(spreadsheetInput)}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between">
          {step !== 'welcome' && step !== 'done' ? (
            <button
              type="button"
              onClick={() => setStep('welcome')}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
            >
              &larr; Kembali
            </button>
          ) : (
            <span className="text-[11px] text-slate-400 font-mono">
              Firebase Config Sync
            </span>
          )}

          <div className="flex items-center gap-2">
            {step === 'connect' && (
              <button
                type="button"
                onClick={handleSaveAndConnect}
                disabled={isProcessing || !spreadsheetInput.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all disabled:opacity-50 cursor-pointer"
              >
                <Server className="w-4 h-4" />
                <span>{isProcessing ? 'Menyimpan ke Firebase...' : 'Simpan & Aktifkan di Semua Device'}</span>
              </button>
            )}

            {step === 'done' && (
              <button
                type="button"
                onClick={() => {
                  onConfigured();
                  onClose();
                }}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
              >
                Mulai Bekerja di Aplikasi
              </button>
            )}

            {step === 'welcome' && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Tutup Sementara
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
