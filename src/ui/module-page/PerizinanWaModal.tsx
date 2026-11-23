import React from 'react';
import {
  Copy,
  ExternalLink,
  FileDown,
  Loader2,
  MessageCircle,
  X,
} from 'lucide-react';
import { PublicPortalClient } from '../../core/PublicPortalClient';
import { ToastManager } from '../../core/ToastManager';
import { getTodayIsoDate, normalizeWhatsAppNumber } from '../../core/utils/autoIdHelpers';
import { formatIndonesianDate, formatPerizinanDateRange } from '../../core/utils/dateHelpers';
import { formatNisVisual } from '../../core/utils/nisHelpers';
import { PerizinanService } from '../../services/PerizinanService';

export interface PerizinanWaModalState {
  isOpen: boolean;
  row: any | null;
  recipientType: 'dudi' | 'kakomli';
  dudiName: string;
  picName: string;
  dudiPhone: string;
  kakomliName: string;
  kakomliPhone: string;
  phoneInput: string;
  alamat: string;
  pdfUrl: string;
  generatingPdf: boolean;
  message: string;
}

export function composePerizinanWaMessage(params: {
  row: any;
  recipientType: 'dudi' | 'kakomli';
  dudiName: string;
  kakomliName: string;
  alamat: string;
  pdfUrl: string;
}): string {
  const { row, recipientType, dudiName, kakomliName, alamat, pdfUrl } = params;
  const tglSurat = formatIndonesianDate(row?.tanggalKirimSurat || getTodayIsoDate());
  const rentangIzin = formatPerizinanDateRange(
    row?.tanggalMulaiIzin,
    row?.tanggalSelesaiIzin,
    row?.rentangTanggal || '-'
  );
  const baseDetails = [
    `• No. Perizinan: ${row?.noPerizinan || row?.id || '-'}`,
    `• No. Surat: ${row?.noSuratPermohonan || '-'}`,
    `• Tanggal Surat: ${tglSurat}`,
    `• Nama Siswa: ${row?.namaSiswa || '-'} (NIS: ${formatNisVisual(row?.nis)})`,
    `• Kelas / Jurusan: ${row?.kelas || '-'} / ${row?.jurusan || '-'}`,
    `• Nama Ortu / Wali: ${row?.namaOrtuWali || '-'}`,
    `• Izin: ${row?.statusIzinOrtu || '-'}`,
    rentangIzin && rentangIzin !== '-' ? `• Rentang Tanggal: ${rentangIzin}` : '',
    `• Lokasi DUDI: ${dudiName || '-'}`,
    `• Alamat DUDI: ${alamat || '-'}`,
    pdfUrl && pdfUrl !== '-' ? `• Unduh Surat Resmi (PDF): ${pdfUrl}` : '',
    row?.linkBuktiBalasan && row.linkBuktiBalasan !== '-'
      ? `• Tautan Bukti Balasan: ${row.linkBuktiBalasan}`
      : '',
  ];

  if (recipientType === 'kakomli') {
    return [
      `Yth. Bapak/Ibu ${kakomliName || 'Ketua Kompetensi Keahlian'}`,
      `Ketua Kompetensi Keahlian ${row?.jurusan || 'Terkait'}`,
      'SMK PGRI 2 Ponorogo',
      '',
      'Dengan hormat,',
      'Kami informasikan penerbitan berkas Surat Permohonan / Perizinan PKL peserta didik jurusan Anda:',
      '',
      ...baseDetails,
      '',
      'Mohon dapat dipantau & dikoordinasikan bersama siswa/orang tua terkait tindak lanjut konfirmasi DUDI.',
      '',
      'Hormat kami,',
      'Pokja Hubin SMK PGRI 2 Ponorogo',
    ]
      .filter((line, idx, arr) => !(line === '' && arr[idx - 1] === ''))
      .join('\n');
  }

  return [
    'Yth. Pimpinan / Pembimbing Industri',
    `${dudiName || 'Mitra DUDI'}`,
    'di Tempat',
    '',
    'Dengan hormat,',
    'Kami dari Pokja Hubin SMK PGRI 2 Ponorogo menyampaikan surat permohonan & konfirmasi Perizinan PKL peserta didik kami:',
    '',
    ...baseDetails,
    '',
    'Mohon konfirmasi kesediaan penempatan PKL dari pihak Bapak/Ibu. Atas perhatian dan kerjasamanya kami ucapkan terima kasih.',
    '',
    'Hormat kami,',
    'Pokja Hubin SMK PGRI 2 Ponorogo',
  ]
    .filter((line, idx, arr) => !(line === '' && arr[idx - 1] === ''))
    .join('\n');
}

interface PerizinanWaModalProps {
  state: PerizinanWaModalState;
  setState: React.Dispatch<React.SetStateAction<PerizinanWaModalState>>;
  onRefresh: () => Promise<void>;
}

export const PerizinanWaModal: React.FC<PerizinanWaModalProps> = ({
  state,
  setState,
  onRefresh,
}) => {
  if (!state.isOpen || !state.row) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-[2px]"
      onClick={() => !state.generatingPdf && setState((p) => ({ ...p, isOpen: false }))}
    >
      <div
        className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-emerald-50/70 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <MessageCircle className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 truncate">
                Kirim Surat PDF &amp; WhatsApp ({state.recipientType === 'dudi' ? 'DUDI' : 'Kakomli'})
              </h3>
              <p className="text-xs text-slate-600 truncate">
                {state.recipientType === 'dudi'
                  ? `${state.dudiName} · ${state.picName}`
                  : `${state.kakomliName} · ${state.row.jurusan || 'Jurusan'}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={state.generatingPdf}
            onClick={() => setState((p) => ({ ...p, isOpen: false }))}
            className="w-9 h-9 rounded-lg hover:bg-slate-200/70 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer shrink-0 disabled:opacity-40"
            aria-label="Tutup modal WhatsApp"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">
              Pilih Penerima Pesan WhatsApp
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setState((prev) => ({
                    ...prev,
                    recipientType: 'dudi',
                    phoneInput: prev.dudiPhone,
                    message: composePerizinanWaMessage({
                      row: prev.row,
                      recipientType: 'dudi',
                      dudiName: prev.dudiName,
                      kakomliName: prev.kakomliName,
                      alamat: prev.alamat,
                      pdfUrl: prev.pdfUrl,
                    }),
                  }));
                }}
                className={`min-h-[40px] px-3 py-2 rounded-lg border font-semibold transition-colors cursor-pointer text-left ${
                  state.recipientType === 'dudi'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-900'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="font-bold">1. Kirim ke DUDI</div>
                <div className="text-[11px] text-slate-500 truncate">{state.dudiName}</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setState((prev) => ({
                    ...prev,
                    recipientType: 'kakomli',
                    phoneInput: prev.kakomliPhone,
                    message: composePerizinanWaMessage({
                      row: prev.row,
                      recipientType: 'kakomli',
                      dudiName: prev.dudiName,
                      kakomliName: prev.kakomliName,
                      alamat: prev.alamat,
                      pdfUrl: prev.pdfUrl,
                    }),
                  }));
                }}
                className={`min-h-[40px] px-3 py-2 rounded-lg border font-semibold transition-colors cursor-pointer text-left ${
                  state.recipientType === 'kakomli'
                    ? 'bg-blue-50 border-blue-500 text-blue-900'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="font-bold">2. Kirim ke Kakomli</div>
                <div className="text-[11px] text-slate-500 truncate">{state.kakomliName}</div>
              </button>
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-bold text-slate-800">
                  File Surat Permohonan PDF (Google Drive)
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {state.pdfUrl
                    ? 'Tautan PDF Google Drive sudah tersemat otomatis ke dalam pesan WhatsApp.'
                    : 'Generate PDF ke Google Drive agar penerima dapat mengunduh surat permohonan resmi.'}
                </p>
              </div>
              <button
                type="button"
                disabled={state.generatingPdf}
                onClick={async () => {
                  if (!state.row) return;
                  setState((p) => ({ ...p, generatingPdf: true }));
                  try {
                    const res = await PublicPortalClient.generatePerizinanPdf({
                      perizinanId: state.row.id || state.row.noPerizinan,
                      noPerizinan: state.row.noPerizinan,
                      noSuratPermohonan: state.row.noSuratPermohonan,
                      namaSiswa: state.row.namaSiswa,
                      nis: state.row.nis,
                      kelas: state.row.kelas,
                      jurusan: state.row.jurusan,
                      dudiTujuan: state.dudiName,
                      alamatDudi: state.alamat,
                      tanggalSurat: formatIndonesianDate(
                        state.row.tanggalKirimSurat || getTodayIsoDate()
                      ),
                    });
                    const nextUrl = res.pdfUrl;
                    setState((prev) => ({
                      ...prev,
                      generatingPdf: false,
                      pdfUrl: nextUrl,
                      message: composePerizinanWaMessage({
                        row: prev.row,
                        recipientType: prev.recipientType,
                        dudiName: prev.dudiName,
                        kakomliName: prev.kakomliName,
                        alamat: prev.alamat,
                        pdfUrl: nextUrl,
                      }),
                    }));
                    await onRefresh();
                  } catch {
                    setState((prev) => ({ ...prev, generatingPdf: false }));
                  }
                }}
                className="h-9 px-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {state.generatingPdf ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Membuat PDF...</span>
                  </>
                ) : (
                  <>
                    <FileDown className="w-3.5 h-3.5" />
                    <span>{state.pdfUrl ? 'Buat Ulang PDF' : 'Generate PDF ke GDrive'}</span>
                  </>
                )}
              </button>
            </div>

            {state.pdfUrl && (
              <div className="p-2.5 rounded-lg border border-emerald-200 bg-white flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-emerald-800 truncate">
                  {state.pdfUrl}
                </span>
                <a
                  href={state.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-bold text-blue-600 hover:underline inline-flex items-center gap-1 shrink-0 whitespace-nowrap"
                >
                  <span>Buka PDF</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">
              {state.recipientType === 'dudi'
                ? 'Nomor WhatsApp Tujuan (PIC / HRD DUDI)'
                : `Nomor WhatsApp Kakomli (${state.kakomliName})`}
            </label>
            <input
              type="text"
              value={state.phoneInput}
              onChange={(e) => {
                const val = e.target.value;
                setState((prev) => ({
                  ...prev,
                  phoneInput: val,
                  ...(prev.recipientType === 'dudi' ? { dudiPhone: val } : { kakomliPhone: val }),
                }));
              }}
              placeholder="Contoh: 081234567890"
              className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
            />
            {normalizeWhatsAppNumber(state.phoneInput) ? (
              <p className="text-[11px] text-emerald-700 mt-1 font-mono">
                Target Link: wa.me/{normalizeWhatsAppNumber(state.phoneInput)}
              </p>
            ) : (
              <p className="text-[11px] text-amber-700 mt-1">
                {state.recipientType === 'dudi'
                  ? 'Nomor WA DUDI belum tercatat. Masukkan nomor WA yang valid di atas.'
                  : 'Nomor WA Kakomli belum tercatat di Master Jurusan. Masukkan nomor WA Kakomli di atas.'}
              </p>
            )}
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">
              Pratinjau Pesan WhatsApp (Dapat Diedit)
            </label>
            <textarea
              rows={8}
              value={state.message}
              onChange={(e) => setState((prev) => ({ ...prev, message: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white text-xs text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 shrink-0 text-xs">
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(state.message);
                ToastManager.getInstance().show(
                  'Pesan Disalin',
                  'success',
                  'Teks konfirmasi beserta tautan PDF siap ditempel ke WhatsApp.'
                );
              } catch {
                ToastManager.getInstance().show(
                  'Gagal Menyalin Otomatis',
                  'info',
                  'Silakan blok teks pesan dan tekan Ctrl+C.'
                );
              }
            }}
            className="h-9 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Salin Pesan</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={state.generatingPdf}
              onClick={() => setState((p) => ({ ...p, isOpen: false }))}
              className="h-9 px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer"
            >
              Tutup
            </button>
            {normalizeWhatsAppNumber(state.phoneInput) ? (
              <a
                href={`https://wa.me/${normalizeWhatsAppNumber(
                  state.phoneInput
                )}?text=${encodeURIComponent(state.message)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  if (state.recipientType === 'dudi') {
                    PerizinanService.getInstance()
                      .markSuratSentToday(state.row.id, { silentToast: true })
                      .then(() => onRefresh())
                      .catch(() => {});
                  }
                  ToastManager.getInstance().show(
                    state.recipientType === 'dudi'
                      ? 'Membuka WhatsApp DUDI'
                      : 'Membuka WhatsApp Kakomli',
                    'success',
                    `Mengirim surat permohonan ${state.row.namaSiswa} ke ${
                      state.recipientType === 'dudi' ? state.dudiName : state.kakomliName
                    }.`
                  );
                  setState((p) => ({ ...p, isOpen: false }));
                }}
                className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Kirim via WhatsApp</span>
              </a>
            ) : (
              <button
                type="button"
                onClick={() =>
                  ToastManager.getInstance().show(
                    'Nomor WA Kosong',
                    'error',
                    'Isi nomor WhatsApp tujuan terlebih dahulu sebelum mengirim.'
                  )
                }
                className="h-9 px-4 rounded-lg bg-slate-300 text-slate-600 font-semibold inline-flex items-center gap-1.5 cursor-not-allowed"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Isi No. WA Dulu</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
