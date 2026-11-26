import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Database,
  FolderPlus,
  Link2,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react';
import { GoogleSheetClient } from '../core/GoogleSheetClient';

export interface AcademicYearRolloverModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const MASTER_ROLLOVER_OPTIONS: Array<{
  sheetName: string;
  label: string;
  description: string;
}> = [
  {
    sheetName: 'Master_Akun',
    label: 'Master_Akun (Akun & Password Pengelola)',
    description: 'Menyalin akun SuperAdmin, Hubin, Kakomli, & Pokja agar tetap bisa login.',
  },
  {
    sheetName: 'Master_Jurusan',
    label: 'Master_Jurusan (9 Program Keahlian & Kakomli)',
    description: 'Kuota & total terdaftar otomatis dihitung ulang dari nol lewat formula.',
  },
  {
    sheetName: 'Master_Guru_Pendamping',
    label: 'Master_Guru_Pendamping (Daftar Pembimbing & PIN)',
    description: 'Jumlah bimbingan otomatis di-reset ke 0 hingga ada plotting siswa baru.',
  },
  {
    sheetName: 'Master_DUDI',
    label: 'Master_DUDI (Mitra Industri & Jadwal)',
    description: 'Kuota terisi otomatis kembali 0; jadwal kerja & kontak DUDI tetap tersimpan.',
  },
  {
    sheetName: 'Master_Kelas_Walas',
    label: 'Master_Kelas_Walas (Daftar Kelas & Wali Kelas)',
    description: 'Jumlah siswa per kelas otomatis di-reset ke 0 mengikuti Master_Siswa_XI baru.',
  },
];

function suggestNextAcademicYear(currentYear: string): string {
  const m = String(currentYear || '').trim().match(/^(\d{4})\/(\d{4})$/);
  if (m) {
    const start = Number(m[1]) + 1;
    const end = Number(m[2]) + 1;
    return `${start}/${end}`;
  }
  const nowYear = new Date().getFullYear();
  return `${nowYear}/${nowYear + 1}`;
}

function parseSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match && match[1] ? match[1] : trimmed;
}

export const AcademicYearRolloverModal: React.FC<AcademicYearRolloverModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const client = GoogleSheetClient.getInstance();
  const activeYear = client.getActiveYear();
  const suggestedYear = useMemo(() => suggestNextAcademicYear(activeYear), [activeYear]);

  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [yearInput, setYearInput] = useState(suggestedYear);
  const [spreadsheetTitle, setSpreadsheetTitle] = useState('');
  const [targetSpreadsheetInput, setTargetSpreadsheetInput] = useState('');
  const [manualSpreadsheetInput, setManualSpreadsheetInput] = useState('');
  const [manualFormUrl, setManualFormUrl] = useState('');
  const [selectedMasters, setSelectedMasters] = useState<string[]>(() =>
    MASTER_ROLLOVER_OPTIONS.map((o) => o.sheetName)
  );
  const [activateImmediately, setActivateImmediately] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      const nextY = suggestNextAcademicYear(client.getActiveYear());
      setYearInput(nextY);
      setSpreadsheetTitle(`Hubin_SMK_PGRI_2_Ponorogo_${nextY.replace('/', '_')}`);
      setTargetSpreadsheetInput('');
      setManualSpreadsheetInput('');
      setManualFormUrl('');
      setSelectedMasters(MASTER_ROLLOVER_OPTIONS.map((o) => o.sheetName));
      setActivateImmediately(true);
      setErrorMsg('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleMaster = (sheetName: string) => {
    setSelectedMasters((prev) =>
      prev.includes(sheetName) ? prev.filter((item) => item !== sheetName) : [...prev, sheetName]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg('');

    const cleanYear = yearInput.trim();
    if (!/^[0-9]{4}\/[0-9]{4}$/.test(cleanYear)) {
      setErrorMsg('Format Tahun Ajaran wajib YYYY/YYYY (contoh: 2027/2028).');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'auto') {
        const res = await client.createYearlySpreadsheetWithRollover({
          year: cleanYear,
          copySheets: selectedMasters,
          targetSpreadsheetId: targetSpreadsheetInput.trim()
            ? parseSpreadsheetId(targetSpreadsheetInput)
            : undefined,
          spreadsheetTitle: spreadsheetTitle.trim() || undefined,
          activateImmediately,
        });

        if (!res.success) {
          setErrorMsg(res.error || 'Gagal membuat Spreadsheet tahun ajaran baru.');
          return;
        }
        onSuccess?.();
        onClose();
      } else {
        const cleanId = parseSpreadsheetId(manualSpreadsheetInput);
        if (!cleanId) {
          setErrorMsg('ID atau URL Spreadsheet baru wajib diisi pada mode manual.');
          return;
        }
        const ok = await client.addNewAcademicYear(
          cleanYear,
          cleanId,
          `https://docs.google.com/spreadsheets/d/${cleanId}`,
          manualFormUrl.trim()
        );
        if (!ok) {
          setErrorMsg('Gagal mendaftarkan Tahun Ajaran ke Cloud Server.');
          return;
        }
        onSuccess?.();
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/55 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-200 flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3 min-w-0 pr-2">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Calendar className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900">
                Buka Tahun Ajaran Baru &amp; Roll-over Master
              </h3>
              <p className="text-[11px] text-slate-500 truncate">
                Buat file Spreadsheet terpisah (~1.000 siswa/tahun) agar performa selalu ringan
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/80 flex items-center justify-center cursor-pointer shrink-0 disabled:opacity-40"
            aria-label="Tutup modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto text-xs">
          {/* Mode Switcher */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                setMode('auto');
                setErrorMsg('');
              }}
              className={`py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                mode === 'auto'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>Buat File Baru + Salin Master</span>
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                setMode('manual');
                setErrorMsg('');
              }}
              className={`py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                mode === 'manual'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>Hubungkan ID Existing</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Tahun Ajaran Baru <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                disabled={submitting}
                value={yearInput}
                onChange={(e) => {
                  const next = e.target.value;
                  setYearInput(next);
                  if (/^[0-9]{4}\/[0-9]{4}$/.test(next.trim())) {
                    setSpreadsheetTitle(
                      `Hubin_SMK_PGRI_2_Ponorogo_${next.trim().replace('/', '_')}`
                    );
                  }
                }}
                placeholder="2027/2028"
                className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 tabular-nums"
              />
            </div>

            {mode === 'auto' && (
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Nama File Spreadsheet Baru
                </label>
                <input
                  type="text"
                  disabled={submitting}
                  value={spreadsheetTitle}
                  onChange={(e) => setSpreadsheetTitle(e.target.value)}
                  placeholder="Hubin_SMK_PGRI_2_Ponorogo_2027_2028"
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
              </div>
            )}
          </div>

          {mode === 'auto' ? (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-700 flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Pilih Data Master yang Disalin ke TA {yearInput || 'Baru'}:</span>
                  </label>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() =>
                      setSelectedMasters(
                        selectedMasters.length === MASTER_ROLLOVER_OPTIONS.length
                          ? []
                          : MASTER_ROLLOVER_OPTIONS.map((o) => o.sheetName)
                      )
                    }
                    className="text-[11px] font-semibold text-blue-600 hover:underline cursor-pointer"
                  >
                    {selectedMasters.length === MASTER_ROLLOVER_OPTIONS.length
                      ? 'Kosongkan Semua'
                      : 'Pilih Semua'}
                  </button>
                </div>

                <div className="space-y-2 border border-slate-200 rounded-xl p-3 bg-slate-50/70">
                  {MASTER_ROLLOVER_OPTIONS.map((opt) => {
                    const checked = selectedMasters.includes(opt.sheetName);
                    return (
                      <label
                        key={opt.sheetName}
                        className={`flex items-start gap-2.5 p-2 rounded-lg border transition-colors cursor-pointer ${
                          checked
                            ? 'bg-white border-blue-200 shadow-2xs'
                            : 'bg-transparent border-transparent hover:bg-white/70'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={submitting}
                          onChange={() => toggleMaster(opt.sheetName)}
                          className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="min-w-0">
                          <div className="font-bold text-slate-800">{opt.label}</div>
                          <div className="text-[11px] text-slate-500 leading-snug">
                            {opt.description}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl flex items-start gap-2 text-[11px] text-emerald-900">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <b>Tabel Siswa &amp; Transaksi Dimulai Bersih:</b>{' '}
                  <code>Master_Siswa_XI</code>, <code>Data_Pengajuan_PKL</code>,{' '}
                  <code>Data_Perizinan_PKL</code>, <code>data_plotting</code>,{' '}
                  <code>Monitoring_5_Tahap</code>, dan{' '}
                  <code>Log_Penerbitan_Surat</code> otomatis dibuat kosong dengan header &amp;{' '}
                  <code>ARRAYFORMULA</code> Baris-1 aktif.
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Target ID Spreadsheet Kosong (Opsional)
                </label>
                <input
                  type="text"
                  disabled={submitting}
                  value={targetSpreadsheetInput}
                  onChange={(e) => setTargetSpreadsheetInput(e.target.value)}
                  placeholder="Kosongkan agar GAS membuat file Google Sheet baru otomatis di Drive"
                  className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[11px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:bg-white"
                />
              </div>

              <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={activateImmediately}
                  disabled={submitting}
                  onChange={(e) => setActivateImmediately(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="font-semibold text-slate-700">
                  Langsung aktifkan Tahun Ajaran {yearInput || 'baru'} setelah selesai dibuat
                </span>
              </label>
            </>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  ID atau URL Database Cloud Server Baru <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={submitting}
                  value={manualSpreadsheetInput}
                  onChange={(e) => setManualSpreadsheetInput(e.target.value)}
                  placeholder="Tempelkan ID atau URL Google Spreadsheet yang sudah siap"
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-slate-800 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Link Google Form Siswa (Opsional)
                </label>
                <input
                  type="url"
                  disabled={submitting}
                  value={manualFormUrl}
                  onChange={(e) => setManualFormUrl(e.target.value)}
                  placeholder="https://docs.google.com/forms/d/..."
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="h-9 px-4 border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 rounded-lg font-semibold cursor-pointer disabled:opacity-40"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="h-9 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Memproses Roll-over...</span>
                </>
              ) : mode === 'auto' ? (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Buat Spreadsheet &amp; Salin Master</span>
                </>
              ) : (
                <span>Daftarkan Tahun Ajaran</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
