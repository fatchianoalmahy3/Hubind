import React, { useEffect, useMemo, useState } from 'react';
import {
  FileText,
  Printer,
  ExternalLink,
  RefreshCw,
  Building2,
  UserCheck,
  Send,
  Compass,
  LogOut,
  FileSignature,
  Search,
  AlertCircle,
  Settings2,
  QrCode,
  CheckCircle2,
} from 'lucide-react';
import { GoogleSheetClient } from '../core/GoogleSheetClient';
import { DudiService } from '../services/DudiService';
import { GuruService } from '../services/GuruService';
import { PengajuanService } from '../services/PengajuanService';
import { SiswaPklService } from '../services/SiswaPklService';
import { MonitoringService } from '../services/MonitoringService';
import { Dudi, Guru, Pengajuan, PenempatanPKL, Monitoring } from '../core/types/schema';

export type DocumentHubKey =
  | 'doc_mou'
  | 'doc_surat_tugas'
  | 'doc_pengajuan'
  | 'doc_pengantaran'
  | 'doc_monitoring'
  | 'doc_penarikan';

interface DocumentHubPageProps {
  activeDocKey: DocumentHubKey;
  onSelectDocKey: (key: DocumentHubKey) => void;
  onOpenTemplateManager?: () => void;
}

const DOC_META: Record<
  DocumentHubKey,
  {
    label: string;
    shortTitle: string;
    description: string;
    sourceLabel: string;
    icon: any;
    defaultNoSurat: string;
  }
> = {
  doc_mou: {
    label: 'Naskah MoU DUDI',
    shortTitle: 'MOU',
    description: 'Nota Kesepahaman kerjasama penyelenggaraan PKL dengan Dunia Usaha / Industri',
    sourceLabel: 'Database Mitra DUDI',
    icon: FileSignature,
    defaultNoSurat: `421.5 / ___ / MoU.PKL / SMK.PGRI2 / ${new Date().getFullYear()}`,
  },
  doc_surat_tugas: {
    label: 'Surat Tugas Guru Pendamping',
    shortTitle: 'Surat Tugas',
    description: 'Surat perintah tugas guru pendamping beserta daftar siswa & DUDI binaan',
    sourceLabel: 'Database Guru Pendamping & Siswa PKL',
    icon: UserCheck,
    defaultNoSurat: `421.5 / ___ / ST.PKL / SMK.PGRI2 / ${new Date().getFullYear()}`,
  },
  doc_pengajuan: {
    label: 'Dokumen Pengajuan PKL',
    shortTitle: 'Pengajuan',
    description: 'Lembar permohonan rekomendasi penempatan PKL siswa ke Kakomli & Hubin',
    sourceLabel: 'Database Pengajuan PKL',
    icon: FileText,
    defaultNoSurat: `421.5 / ___ / REG.PKL / SMK.PGRI2 / ${new Date().getFullYear()}`,
  },
  doc_pengantaran: {
    label: 'Surat & Berita Acara Pengantaran',
    shortTitle: 'Pengantaran',
    description: 'Surat pengantar resmi dan berita acara serah terima siswa ke DUDI',
    sourceLabel: 'Database Penempatan Siswa PKL',
    icon: Send,
    defaultNoSurat: `421.5 / ___ / ANTAR.PKL / SMK.PGRI2 / ${new Date().getFullYear()}`,
  },
  doc_monitoring: {
    label: 'Instrumen Monitoring Lapangan',
    shortTitle: 'Monitoring',
    description: 'Berita acara dan lembar supervisi guru pendamping di lokasi DUDI',
    sourceLabel: 'Database Penempatan & Monitoring PKL',
    icon: Compass,
    defaultNoSurat: `421.5 / ___ / MON.PKL / SMK.PGRI2 / ${new Date().getFullYear()}`,
  },
  doc_penarikan: {
    label: 'Surat & Berita Acara Penarikan',
    shortTitle: 'Penarikan',
    description: 'Surat tugas penjemputan siswa purnatugas PKL & ucapan terima kasih mitra',
    sourceLabel: 'Database Penempatan Siswa PKL',
    icon: LogOut,
    defaultNoSurat: `421.5 / ___ / TARIK.PKL / SMK.PGRI2 / ${new Date().getFullYear()}`,
  },
};

export const DocumentHubPage: React.FC<DocumentHubPageProps> = ({
  activeDocKey,
  onSelectDocKey,
  onOpenTemplateManager,
}) => {
  const client = GoogleSheetClient.getInstance();
  const activeYear = client.getActiveYear();
  const templates = client.getTemplates();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Live Spreadsheet datasets
  const [dudiList, setDudiList] = useState<Dudi[]>([]);
  const [guruList, setGuruList] = useState<Guru[]>([]);
  const [pengajuanList, setPengajuanList] = useState<Pengajuan[]>([]);
  const [penempatanList, setPenempatanList] = useState<PenempatanPKL[]>([]);
  const [monitoringList, setMonitoringList] = useState<Monitoring[]>([]);

  // Active selection ID & print settings
  const [selectedId, setSelectedId] = useState<string>('');
  const [paperSize, setPaperSize] = useState<'A4' | 'F4'>('A4');
  const [nomorSurat, setNomorSurat] = useState(DOC_META[activeDocKey].defaultNoSurat);
  const [tanggalSurat, setTanggalSurat] = useState(() =>
    new Date().toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  );
  const [kepalaSekolah, setKepalaSekolah] = useState('Kepala SMK PGRI 2 Ponorogo');

  const meta = DOC_META[activeDocKey];
  const templateConfig = templates.find((t) => t.id === activeDocKey);

  const loadDataForDoc = async (forceReload = false) => {
    setLoading(true);
    setError(null);
    try {
      if (activeDocKey === 'doc_mou') {
        const svc = DudiService.getInstance();
        if (forceReload) await svc.reloadFromSpreadsheet();
        const rows = await svc.getAll();
        setDudiList(rows);
        setSelectedId((prev) => (rows.some((r) => r.id === prev) ? prev : rows[0]?.id || ''));
      } else if (activeDocKey === 'doc_surat_tugas') {
        const gSvc = GuruService.getInstance();
        const pSvc = SiswaPklService.getInstance();
        if (forceReload) {
          await Promise.all([gSvc.reloadFromSpreadsheet(), pSvc.reloadFromSpreadsheet()]);
        }
        const [gRows, pRows] = await Promise.all([gSvc.getAll(), pSvc.getAll()]);
        setGuruList(gRows);
        setPenempatanList(pRows);
        setSelectedId((prev) => (gRows.some((r) => r.id === prev) ? prev : gRows[0]?.id || ''));
      } else if (activeDocKey === 'doc_pengajuan') {
        const svc = PengajuanService.getInstance();
        if (forceReload) await svc.reloadFromSpreadsheet();
        const rows = await svc.getAll();
        setPengajuanList(rows);
        setSelectedId((prev) => (rows.some((r) => r.id === prev) ? prev : rows[0]?.id || ''));
      } else {
        const pSvc = SiswaPklService.getInstance();
        const dSvc = DudiService.getInstance();
        const mSvc = MonitoringService.getInstance();
        if (forceReload) {
          await Promise.all([
            pSvc.reloadFromSpreadsheet(),
            dSvc.reloadFromSpreadsheet(),
            mSvc.reloadFromSpreadsheet(),
          ]);
        }
        const [pRows, dRows, mRows] = await Promise.all([
          pSvc.getAll(),
          dSvc.getAll().catch(() => []),
          mSvc.getAll().catch(() => []),
        ]);
        setPenempatanList(pRows);
        setDudiList(dRows);
        setMonitoringList(mRows);
        setSelectedId((prev) => (pRows.some((r) => r.id === prev) ? prev : pRows[0]?.id || ''));
      }
    } catch (e: any) {
      setError(e?.message || 'Gagal memuat data dari Cloud Server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setNomorSurat(DOC_META[activeDocKey].defaultNoSurat);
    setSearchQuery('');
    loadDataForDoc(false);
  }, [activeDocKey]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (activeDocKey === 'doc_mou') {
      return dudiList
        .filter((d) => !q || `${d.namaDudi} ${d.wilayahKota} ${d.namaPic}`.toLowerCase().includes(q))
        .map((d) => ({
          id: d.id,
          title: d.namaDudi,
          subtitle: `${d.wilayahKota || d.alamat || '-'} · ${d.statusKerjasama}`,
          raw: d,
        }));
    }
    if (activeDocKey === 'doc_surat_tugas') {
      return guruList
        .filter((g) => !q || `${g.nama} ${g.kontakWA || ''} ${g.peranUtama}`.toLowerCase().includes(q))
        .map((g) => ({
          id: g.id,
          title: g.nama,
          subtitle: `${g.peranUtama}${g.kontakWA ? ` · WA: ${g.kontakWA}` : ''}`,
          raw: g,
        }));
    }
    if (activeDocKey === 'doc_pengajuan') {
      return pengajuanList
        .filter(
          (p) =>
            !q ||
            `${p.namaSiswa} ${p.nis} ${p.dudiTujuan} ${p.noPengajuan}`.toLowerCase().includes(q)
        )
        .map((p) => ({
          id: p.id,
          title: `${p.namaSiswa} (${p.nis})`,
          subtitle: `${p.dudiTujuan} · ${p.statusKakomli}`,
          raw: p,
        }));
    }
    return penempatanList
      .filter(
        (p) =>
          !q ||
          `${p.namaSiswa} ${p.nis} ${p.namaDudi} ${p.guruPendamping}`.toLowerCase().includes(q)
      )
      .map((p) => ({
        id: p.id,
        title: `${p.namaSiswa} (${p.nis})`,
        subtitle: `${p.namaDudi} · Guru: ${p.guruPendamping || '-'}`,
        raw: p,
      }));
  }, [activeDocKey, searchQuery, dudiList, guruList, pengajuanList, penempatanList]);

  const activeRecord = useMemo(() => {
    const found = filteredItems.find((i) => i.id === selectedId);
    return found?.raw || filteredItems[0]?.raw || null;
  }, [filteredItems, selectedId]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #doc-hub-print-area, #doc-hub-print-area * {
            visibility: visible !important;
          }
          #doc-hub-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: white !important;
            padding: 15mm 20mm !important;
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
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

      {/* Clean Document Hub Header */}
      <div className="space-y-4 no-print">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-3 border-b border-slate-200">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shrink-0">
              <meta.icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight truncate">{meta.label}</h1>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 mt-0.5">
                <span>{meta.description}</span>
                <span className="text-slate-300" aria-hidden="true">·</span>
                <span className="font-mono text-slate-600 font-medium">{meta.sourceLabel}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {templateConfig?.url ? (
              <a
                href={templateConfig.url}
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors whitespace-nowrap"
              >
                <ExternalLink className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Master Google Docs</span>
              </a>
            ) : (
              onOpenTemplateManager && (
                <button
                  type="button"
                  onClick={onOpenTemplateManager}
                  className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Settings2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Pasang Template Docs</span>
                </button>
              )
            )}

            <button
              type="button"
              onClick={() => loadDataForDoc(true)}
              disabled={loading}
              className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${loading ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
              <span>Muat Ulang</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              disabled={!activeRecord}
              className="h-9 inline-flex items-center gap-1.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
            >
              <Printer className="w-4 h-4 shrink-0" />
              <span>Cetak / PDF ({paperSize})</span>
            </button>
          </div>
        </div>

        {/* 6 Document Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {(Object.keys(DOC_META) as DocumentHubKey[]).map((key) => {
            const item = DOC_META[key];
            const Icon = item.icon;
            const isActive = key === activeDocKey;
            return (
              <button
                type="button"
                key={key}
                onClick={() => onSelectDocKey(key)}
                className={`h-9 inline-flex items-center gap-1.5 px-3.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer border ${
                  isActive
                    ? 'bg-slate-900 border-slate-900 text-white'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{item.shortTitle}</span>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2 no-print">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Workspace Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Target Record Picker & Letter Parameters */}
        <div className="lg:col-span-4 space-y-4 no-print">
          {/* Letter Settings Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Parameter Surat &amp; Cetak
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nomor Surat Dinas</label>
                <input
                  type="text"
                  value={nomorSurat}
                  onChange={(e) => setNomorSurat(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tanggal Surat</label>
                  <input
                    type="text"
                    value={tanggalSurat}
                    onChange={(e) => setTanggalSurat(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Ukuran Kertas</label>
                  <select
                    value={paperSize}
                    onChange={(e) => setPaperSize(e.target.value as 'A4' | 'F4')}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  >
                    <option value="A4">A4 (210 x 297 mm)</option>
                    <option value="F4">F4 (215 x 330 mm)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Jabatan Penandatangan
                </label>
                <input
                  type="text"
                  value={kepalaSekolah}
                  onChange={(e) => setKepalaSekolah(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Data Picker Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider tabular-nums">
                Pilih Data ({filteredItems.length})
              </h3>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama, NIS, atau DUDI..."
                className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 bg-slate-50 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
            </div>

            <div className="max-h-[380px] overflow-y-auto space-y-1.5 pr-1">
              {loading ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Membaca data langsung dari Cloud Server...
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg p-4">
                  Belum ada data tersedia di {meta.sourceLabel}. Silakan isi data terlebih dahulu pada modul terkait.
                </div>
              ) : (
                filteredItems.map((item, idx) => {
                  const isSelected = activeRecord?.id === item.id;
                  return (
                    <button
                      type="button"
                      key={`${item.id || 'doc'}_${idx}`}
                      onClick={() => setSelectedId(item.id)}
                      className={`w-full text-left p-2.5 rounded-lg border transition-colors cursor-pointer flex items-start justify-between gap-2 ${
                        isSelected
                          ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-500/20'
                          : 'bg-slate-50/70 border-slate-200 hover:bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">{item.title}</div>
                        <div className="text-[11px] text-slate-500 truncate mt-0.5">
                          {item.subtitle}
                        </div>
                      </div>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right: Document Paper Preview */}
        <div className="lg:col-span-8">
          <div className="bg-slate-200/70 rounded-3xl p-4 sm:p-6 border border-slate-200/80 flex justify-center min-h-[600px]">
            {!activeRecord ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-10 my-auto max-w-md text-center space-y-3 shadow-xs">
                <Building2 className="w-10 h-10 text-slate-300 mx-auto" />
                <h4 className="text-sm font-bold text-slate-800">
                  Pilih Data untuk Pratinjau {meta.shortTitle}
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Dokumen ini menarik data langsung dari {meta.sourceLabel} di Cloud Server. Tambahkan data pada modul terkait atau pilih salah satu baris di panel kiri.
                </p>
              </div>
            ) : (
              <div
                id="doc-hub-print-area"
                className="bg-white w-full max-w-[780px] p-8 sm:p-12 rounded-2xl shadow-lg border border-slate-300 font-serif text-slate-900 leading-relaxed text-sm"
              >
                {/* Official School Kop Surat */}
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

                {renderDocumentBody({
                  docKey: activeDocKey,
                  record: activeRecord,
                  activeYear,
                  nomorSurat,
                  tanggalSurat,
                  kepalaSekolah,
                  penempatanList,
                  dudiList,
                  monitoringList,
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

function renderDocumentBody(params: {
  docKey: DocumentHubKey;
  record: any;
  activeYear: string;
  nomorSurat: string;
  tanggalSurat: string;
  kepalaSekolah: string;
  penempatanList: PenempatanPKL[];
  dudiList: Dudi[];
  monitoringList: Monitoring[];
}) {
  const {
    docKey,
    record,
    activeYear,
    nomorSurat,
    tanggalSurat,
    kepalaSekolah,
    penempatanList,
    dudiList,
    monitoringList,
  } = params;

  if (docKey === 'doc_mou') {
    const dudi = record as Dudi;
    return (
      <div className="space-y-4">
        <div className="text-center space-y-1">
          <div className="font-bold uppercase underline text-sm tracking-wide">
            NASKAH PERJANJIAN KERJASAMA (MEMORANDUM OF UNDERSTANDING)
          </div>
          <div className="text-xs font-sans font-mono text-slate-600">Nomor: {nomorSurat}</div>
        </div>

        <p className="text-justify text-xs mt-4">
          Pada hari ini, tanggal <b>{tanggalSurat}</b>, bertempat di Ponorogo, kami yang bertanda tangan di bawah ini:
        </p>

        <table className="w-full text-xs font-sans border-collapse my-2">
          <tbody>
            <tr>
              <td className="py-1 font-bold w-36 align-top">1. PIHAK PERTAMA</td>
              <td className="py-1">
                <b>SMK PGRI 2 Ponorogo</b>, berkedudukan di Jl. Soekarno - Hatta No. 94 Ponorogo, dalam hal ini diwakili oleh <b>{kepalaSekolah}</b>.
              </td>
            </tr>
            <tr>
              <td className="py-1 font-bold align-top">2. PIHAK KEDUA</td>
              <td className="py-1">
                <b>{dudi.namaDudi}</b> ({dudi.bidangKeahlian || 'Mitra Industri'}), berkedudukan di {dudi.alamat || '-'}, {dudi.wilayahKota || ''}, dalam hal ini diwakili oleh <b>{dudi.namaPic || 'Pimpinan / HRD'}</b> (Kontak: {dudi.kontakPic || '-'}).
              </td>
            </tr>
          </tbody>
        </table>

        <p className="text-justify text-xs">
          Kedua belah pihak sepakat untuk menjalin kerjasama dalam rangka Penyelenggaraan Praktik Kerja Industri (PKL), penyelarasan kurikulum kejuruan, dan pembinaan kompetensi kerja peserta didik pada Tahun Ajaran <b>{activeYear}</b> dengan kapasitas penempatan hingga <b>{dudi.kuotaMaksimal || '-'} siswa</b>.
        </p>

        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-sans space-y-1">
          <div className="font-bold text-slate-800">Ruang Lingkup Kerjasama:</div>
          <ol className="list-decimal list-inside space-y-0.5 text-slate-700">
            <li>Penempatan peserta didik PKL sesuai kompetensi keahlian dan tata tertib K3 industri.</li>
            <li>Bimbingan teknis oleh instruktur industri (DUDI) dan guru pendamping sekolah.</li>
            <li>Penilaian akhir hasil PKL dan penerbitan sertifikat kompetensi industri.</li>
          </ol>
        </div>

        <div className="flex justify-between items-end pt-10 font-sans text-xs">
          <div className="text-center">
            <div>PIHAK KEDUA,</div>
            <div className="font-semibold">{dudi.namaDudi}</div>
            <div className="h-16" />
            <div className="font-bold underline">{dudi.namaPic || '..........................................'}</div>
            <div className="text-[11px] text-slate-500">Pimpinan / Pembimbing Industri</div>
          </div>
          <div className="text-center">
            <div>PIHAK PERTAMA,</div>
            <div className="font-semibold">{kepalaSekolah}</div>
            <div className="h-16" />
            <div className="font-bold underline">................................................</div>
            <div className="text-[11px] text-slate-500">NIP. ..................................</div>
          </div>
        </div>
      </div>
    );
  }

  if (docKey === 'doc_surat_tugas') {
    const guru = record as Guru;
    const assignedStudents = penempatanList.filter(
      (p) =>
        (p.idGuruPendamping && p.idGuruPendamping === guru.id) ||
        (p.guruPendamping && p.guruPendamping.toLowerCase().includes(guru.nama.toLowerCase()))
    );

    return (
      <div className="space-y-4">
        <div className="text-center space-y-1">
          <div className="font-bold uppercase underline text-sm tracking-wide">SURAT PERINTAH TUGAS</div>
          <div className="text-xs font-sans font-mono text-slate-600">Nomor: {nomorSurat}</div>
        </div>

        <p className="text-justify text-xs mt-4">
          Yang bertanda tangan di bawah ini, {kepalaSekolah}, dengan ini menugaskan kepada:
        </p>

        <table className="w-full text-xs font-sans border-collapse my-2">
          <tbody>
            <tr className="border-b border-slate-200">
              <td className="py-1.5 font-bold w-40">Nama Petugas / Guru</td>
              <td className="py-1.5 font-bold">: {guru.nama}</td>
            </tr>
            {guru.nip && guru.nip !== '-' && (
              <tr className="border-b border-slate-200">
                <td className="py-1.5 font-bold">NIP / NUPTK</td>
                <td className="py-1.5 font-mono">: {guru.nip}</td>
              </tr>
            )}
            <tr className="border-b border-slate-200">
              <td className="py-1.5 font-bold">Jabatan / Peran</td>
              <td className="py-1.5">: {guru.peranUtama || 'Guru Pendamping PKL'}</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="py-1.5 font-bold">Kontak WhatsApp</td>
              <td className="py-1.5 font-mono">: {guru.kontakWA || '-'}</td>
            </tr>
          </tbody>
        </table>

        <p className="text-justify text-xs">
          Untuk melaksanakan tugas pengantaran, supervisi monitoring berkala, pengambilan nilai industri, serta penarikan siswa Praktik Kerja Industri (PKL) Tahun Ajaran <b>{activeYear}</b> bagi peserta didik berikut:
        </p>

        <table className="w-full text-xs font-sans border border-slate-300 border-collapse">
          <thead className="bg-slate-100">
            <tr>
              <th className="border border-slate-300 p-1.5 w-8">No</th>
              <th className="border border-slate-300 p-1.5">NIS</th>
              <th className="border border-slate-300 p-1.5">Nama Siswa</th>
              <th className="border border-slate-300 p-1.5">Lokasi DUDI</th>
              <th className="border border-slate-300 p-1.5">Periode</th>
            </tr>
          </thead>
          <tbody>
            {assignedStudents.length === 0 ? (
              <tr>
                <td colSpan={5} className="border border-slate-300 p-3 text-center text-slate-400 italic">
                  Belum ada siswa terplot pada guru pendamping ini di Cloud Server.
                </td>
              </tr>
            ) : (
              assignedStudents.map((s, idx) => (
                <tr key={`${s.id || 'stu'}_${idx}`}>
                  <td className="border border-slate-300 p-1.5 text-center">{idx + 1}</td>
                  <td className="border border-slate-300 p-1.5 font-mono">{s.nis}</td>
                  <td className="border border-slate-300 p-1.5 font-semibold">{s.namaSiswa}</td>
                  <td className="border border-slate-300 p-1.5">{s.namaDudi}</td>
                  <td className="border border-slate-300 p-1.5 font-mono text-[11px]">
                    {s.tanggalBerangkat || '-'} s/d {s.tanggalRencanaTarik || '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="flex justify-end pt-8 font-sans text-xs">
          <div className="text-center">
            <div>Ponorogo, {tanggalSurat}</div>
            <div className="font-semibold mt-0.5">{kepalaSekolah},</div>
            <div className="h-16" />
            <div className="font-bold underline">................................................</div>
            <div className="text-[11px] text-slate-500">NIP. ..................................</div>
          </div>
        </div>
      </div>
    );
  }

  if (docKey === 'doc_pengajuan') {
    const req = record as Pengajuan;
    return (
      <div className="space-y-4">
        <div className="text-center space-y-1">
          <div className="font-bold uppercase underline text-sm tracking-wide">
            LEMBAR PERMOHONAN REKOMENDASI PRAKERIN
          </div>
          <div className="text-xs font-sans text-slate-500">
            No. Registrasi: <b className="font-mono text-slate-800">{req.noPengajuan}</b> • TA {activeYear}
          </div>
        </div>

        <p className="text-justify text-xs mt-4">
          Berdasarkan pendaftaran siswa pada Portal Pokja Hubin SMK PGRI 2 Ponorogo, diajukan permohonan rekomendasi penempatan Praktik Kerja Industri (PKL) sebagai berikut:
        </p>

        <table className="w-full text-xs font-sans border-collapse my-2">
          <tbody>
            <tr className="border-b border-slate-200">
              <td className="py-1.5 font-bold w-44">Nama Peserta Didik</td>
              <td className="py-1.5 font-semibold">: {req.namaSiswa}</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="py-1.5 font-bold">NIS</td>
              <td className="py-1.5 font-mono">: {req.nis}</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="py-1.5 font-bold">Kompetensi Keahlian / Kelas</td>
              <td className="py-1.5">: {req.jurusan} / {req.kelas}</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="py-1.5 font-bold">DUDI Tujuan</td>
              <td className="py-1.5 font-bold text-blue-900">: {req.dudiTujuan}</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="py-1.5 font-bold">Alamat / Bidang Usaha</td>
              <td className="py-1.5">: {req.alamatDudi || '-'} ({req.bidangPekerjaan || '-'})</td>
            </tr>
          </tbody>
        </table>

        <div className="border border-slate-300 rounded-lg p-3.5 bg-slate-50 font-sans text-xs">
          <div className="font-bold text-slate-800 mb-1.5">
            KEPUTUSAN KETUA KOMPETENSI KEAHLIAN (KAKOMLI):
          </div>
          <div className="flex items-center gap-6 mb-1.5">
            <span>[{req.statusKakomli === 'Disetujui' ? ' ✓ ' : '   '}] DISETUJUI</span>
            <span>[{req.statusKakomli === 'Ditolak' ? ' ✓ ' : '   '}] DITOLAK</span>
          </div>
          <div className="text-[11px] text-slate-600">
            Catatan: {req.catatanKakomli || '..................................................................'}
          </div>
        </div>

        <div className="flex justify-between items-end pt-8 font-sans text-xs">
          <div className="text-center p-2 border border-slate-200 rounded-lg bg-slate-50">
            <QrCode className="w-12 h-12 mx-auto text-slate-800" />
            <span className="text-[9px] text-slate-500 font-mono block mt-0.5">{req.noPengajuan}</span>
          </div>
          <div className="text-center">
            <div>Ponorogo, {tanggalSurat}</div>
            <div className="font-semibold mt-0.5">Ketua Kompetensi Keahlian,</div>
            <div className="h-16" />
            <div className="font-bold underline">................................................</div>
            <div className="text-[11px] text-slate-500">NIP. ..................................</div>
          </div>
        </div>
      </div>
    );
  }

  // doc_pengantaran, doc_monitoring, doc_penarikan use PenempatanPKL + peers at the same DUDI
  const penempatan = record as PenempatanPKL;
  const dudiDetail = dudiList.find(
    (d) =>
      d.id === penempatan.idDudi ||
      d.namaDudi.trim().toLowerCase() === (penempatan.namaDudi || '').trim().toLowerCase()
  );
  const groupPeers = penempatanList.filter(
    (p) =>
      p.namaDudi.trim().toLowerCase() === (penempatan.namaDudi || '').trim().toLowerCase() &&
      p.statusPenempatan !== 'Dibatalkan'
  );
  const relatedLogs = monitoringList.filter(
    (m) =>
      m.idPenempatan === penempatan.idPenempatan ||
      m.dudiTujuan.trim().toLowerCase() === (penempatan.namaDudi || '').trim().toLowerCase()
  );

  if (docKey === 'doc_pengantaran') {
    return (
      <div className="space-y-4">
        <div className="flex justify-between font-sans text-xs">
          <div>
            <div>Nomor : {nomorSurat}</div>
            <div>Lamp. : 1 (satu) Berkas</div>
            <div>Perihal : <b>Surat Pengantar &amp; Serah Terima Siswa PKL</b></div>
          </div>
          <div>Ponorogo, {tanggalSurat}</div>
        </div>

        <div className="font-sans text-xs mt-3">
          Kepada Yth.<br />
          <b>Pimpinan / HRD {penempatan.namaDudi}</b><br />
          {dudiDetail?.alamat ? `${dudiDetail.alamat}, ${dudiDetail.wilayahKota || ''}` : 'Di Tempat'}
        </div>

        <p className="text-justify text-xs">
          Dengan hormat,<br />
          Berdasarkan surat balasan kesediaan tempat PKL Tahun Ajaran {activeYear}, bersama ini kami menyerahkan peserta didik SMK PGRI 2 Ponorogo untuk melaksanakan Praktik Kerja Industri terhitung mulai tanggal <b>{penempatan.tanggalBerangkat || '-'}</b> s.d. <b>{penempatan.tanggalRencanaTarik || '-'}</b> di bawah pendampingan <b>{penempatan.guruPendamping || '-'}</b>:
        </p>

        <table className="w-full text-xs font-sans border border-slate-300 border-collapse">
          <thead className="bg-slate-100">
            <tr>
              <th className="border border-slate-300 p-1.5 w-8">No</th>
              <th className="border border-slate-300 p-1.5">NIS</th>
              <th className="border border-slate-300 p-1.5">Nama Siswa</th>
              <th className="border border-slate-300 p-1.5">ID Penempatan</th>
            </tr>
          </thead>
          <tbody>
            {(groupPeers.length > 0 ? groupPeers : [penempatan]).map((s, idx) => (
              <tr key={`${s.id || 'peer'}_${idx}`}>
                <td className="border border-slate-300 p-1.5 text-center">{idx + 1}</td>
                <td className="border border-slate-300 p-1.5 font-mono">{s.nis}</td>
                <td className="border border-slate-300 p-1.5 font-semibold">{s.namaSiswa}</td>
                <td className="border border-slate-300 p-1.5 font-mono">{s.idPenempatan}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="text-justify text-xs">
          Demikian surat pengantaran dan berita acara serah terima ini dibuat untuk dipergunakan sebagaimana mestinya. Atas bimbingan dan kerjasamanya kami ucapkan terima kasih.
        </p>

        <div className="flex justify-between items-end pt-8 font-sans text-xs">
          <div className="text-center">
            <div>Diterima Oleh,</div>
            <div className="font-semibold">Pimpinan / Pembimbing DUDI</div>
            <div className="h-16" />
            <div className="font-bold underline">{dudiDetail?.namaPic || '..........................................'}</div>
            <div className="text-[11px] text-slate-500">{penempatan.namaDudi}</div>
          </div>
          <div className="text-center">
            <div>Yang Menyerahkan,</div>
            <div className="font-semibold">Guru Pendamping Sekolah</div>
            <div className="h-16" />
            <div className="font-bold underline">{penempatan.guruPendamping || '..........................................'}</div>
            <div className="text-[11px] text-slate-500">SMK PGRI 2 Ponorogo</div>
          </div>
        </div>
      </div>
    );
  }

  if (docKey === 'doc_monitoring') {
    return (
      <div className="space-y-4">
        <div className="text-center space-y-1">
          <div className="font-bold uppercase underline text-sm tracking-wide">
            BERITA ACARA &amp; INSTRUMEN MONITORING PKL
          </div>
          <div className="text-xs font-sans text-slate-500">
            Nomor: {nomorSurat} • Tahun Ajaran {activeYear}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs font-sans bg-slate-50 p-3 rounded-lg border border-slate-200">
          <div><b>Mitra DUDI:</b> {penempatan.namaDudi}</div>
          <div><b>Guru Pendamping:</b> {penempatan.guruPendamping || '-'}</div>
          <div><b>Siswa Utama:</b> {penempatan.namaSiswa} ({penempatan.nis})</div>
          <div><b>Kelompok di Lokasi:</b> {groupPeers.length || 1} Siswa</div>
        </div>

        <table className="w-full text-xs font-sans border border-slate-300 border-collapse">
          <thead className="bg-slate-100">
            <tr>
              <th className="border border-slate-300 p-2 w-10">No</th>
              <th className="border border-slate-300 p-2">Tahapan Supervisi</th>
              <th className="border border-slate-300 p-2">Tgl Kunjungan</th>
              <th className="border border-slate-300 p-2">Catatan / Hasil Evaluasi</th>
              <th className="border border-slate-300 p-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {relatedLogs.length > 0 ? (
              relatedLogs.map((log, i) => (
                <tr key={`${log.id || 'log'}_${i}`}>
                  <td className="border border-slate-300 p-2 text-center">{i + 1}</td>
                  <td className="border border-slate-300 p-2 font-semibold">{log.tahap}</td>
                  <td className="border border-slate-300 p-2 font-mono">{log.tanggalKunjungan || '-'}</td>
                  <td className="border border-slate-300 p-2">{log.catatanKunjungan || '-'}</td>
                  <td className="border border-slate-300 p-2 font-semibold">{log.statusTahap}</td>
                </tr>
              ))
            ) : (
              [
                '1. Pengantaran',
                '2. Monitoring 1',
                '3. Monitoring 2',
                '4. Monitoring 3',
                '5. Monitoring 4',
                '6. Monitoring 5',
                '7. Monitoring 6',
                '8. Penarikan',
              ].map(
                (stage, idx) => (
                  <tr key={stage}>
                    <td className="border border-slate-300 p-2 text-center">{idx + 1}</td>
                    <td className="border border-slate-300 p-2 font-semibold">{stage}</td>
                    <td className="border border-slate-300 p-2">.... / .... / 20....</td>
                    <td className="border border-slate-300 p-2 text-slate-400">...............................................</td>
                    <td className="border border-slate-300 p-2">[ &nbsp; ] Terlaksana</td>
                  </tr>
                )
              )
            )}
          </tbody>
        </table>

        <div className="flex justify-between items-end pt-8 font-sans text-xs">
          <div className="text-center">
            <div>Mengetahui Pembimbing DUDI,</div>
            <div className="h-16" />
            <div className="font-bold underline">{dudiDetail?.namaPic || '..........................................'}</div>
            <div className="text-[11px] text-slate-500">{penempatan.namaDudi}</div>
          </div>
          <div className="text-center">
            <div>Ponorogo, {tanggalSurat}</div>
            <div className="font-semibold">Guru Pendamping,</div>
            <div className="h-16" />
            <div className="font-bold underline">{penempatan.guruPendamping || '..........................................'}</div>
            <div className="text-[11px] text-slate-500">SMK PGRI 2 Ponorogo</div>
          </div>
        </div>
      </div>
    );
  }

  // doc_penarikan
  return (
    <div className="space-y-4">
      <div className="flex justify-between font-sans text-xs">
        <div>
          <div>Nomor : {nomorSurat}</div>
          <div>Lamp. : -</div>
          <div>Perihal : <b>Penarikan Siswa Purnatugas PKL &amp; Ucapan Terima Kasih</b></div>
        </div>
        <div>Ponorogo, {tanggalSurat}</div>
      </div>

      <div className="font-sans text-xs mt-3">
        Kepada Yth.<br />
        <b>Pimpinan / HRD {penempatan.namaDudi}</b><br />
        {dudiDetail?.alamat ? `${dudiDetail.alamat}, ${dudiDetail.wilayahKota || ''}` : 'Di Tempat'}
      </div>

      <p className="text-justify text-xs">
        Dengan hormat,<br />
        Sehubungan dengan berakhirnya masa pelaksanaan Praktik Kerja Industri (PKL) siswa SMK PGRI 2 Ponorogo Tahun Ajaran {activeYear} (rencana tanggal selesai: <b>{penempatan.tanggalRencanaTarik || tanggalSurat}</b>), kami menugaskan <b>{penempatan.guruPendamping || '-'}</b> untuk melakukan penarikan resmi peserta didik berikut:
      </p>

      <table className="w-full text-xs font-sans border border-slate-300 border-collapse">
        <thead className="bg-slate-100">
          <tr>
            <th className="border border-slate-300 p-1.5 w-8">No</th>
            <th className="border border-slate-300 p-1.5">NIS</th>
            <th className="border border-slate-300 p-1.5">Nama Siswa</th>
            <th className="border border-slate-300 p-1.5">Periode PKL</th>
          </tr>
        </thead>
        <tbody>
          {(groupPeers.length > 0 ? groupPeers : [penempatan]).map((s, idx) => (
            <tr key={`${s.id || 'pull'}_${idx}`}>
              <td className="border border-slate-300 p-1.5 text-center">{idx + 1}</td>
              <td className="border border-slate-300 p-1.5 font-mono">{s.nis}</td>
              <td className="border border-slate-300 p-1.5 font-semibold">{s.namaSiswa}</td>
              <td className="border border-slate-300 p-1.5 font-mono">
                {s.tanggalBerangkat || '-'} s/d {s.tanggalRencanaTarik || '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-justify text-xs">
        Kami mengucapkan terima kasih sebesar-besarnya atas bimbingan, ilmu, dan kesempatan yang telah diberikan kepada siswa kami. Apabila selama pelaksanaan terdapat kekhilafan dari siswa kami, kami mohon maaf yang sebesar-besarnya.
      </p>

      <div className="flex justify-between items-end pt-8 font-sans text-xs">
        <div className="text-center">
          <div>Diserahkan Kembali Oleh,</div>
          <div className="font-semibold">Pimpinan / Pembimbing DUDI</div>
          <div className="h-16" />
          <div className="font-bold underline">{dudiDetail?.namaPic || '..........................................'}</div>
          <div className="text-[11px] text-slate-500">{penempatan.namaDudi}</div>
        </div>
        <div className="text-center">
          <div>Menarik / Mengetahui,</div>
          <div className="font-semibold">{kepalaSekolah}</div>
          <div className="h-16" />
          <div className="font-bold underline">................................................</div>
          <div className="text-[11px] text-slate-500">SMK PGRI 2 Ponorogo</div>
        </div>
      </div>
    </div>
  );
}
