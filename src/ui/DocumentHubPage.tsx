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
  Lock,
  Layers,
  FileDown,
  Loader2,
  CheckSquare,
  Square,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { GoogleSheetClient } from '../core/GoogleSheetClient';
import { PublicPortalClient } from '../core/PublicPortalClient';
import { DudiService } from '../services/DudiService';
import { GuruService } from '../services/GuruService';
import { PengajuanService } from '../services/PengajuanService';
import { SiswaPklService } from '../services/SiswaPklService';
import { SiswaService } from '../services/SiswaService';
import { MonitoringService } from '../services/MonitoringService';
import {
  Dudi,
  Guru,
  Pengajuan,
  PenempatanPKL,
  Siswa,
  Monitoring,
  MONITORING_STAGES,
} from '../core/types/schema';
import {
  formatIndonesianDate,
  formatIndonesianDateRange,
  getTodayWibIsoDate,
} from '../core/utils/dateHelpers';
import { formatNisVisual, stripNisSymbols } from '../core/utils/nisHelpers';
import {
  buildStudentMonitoringSummary,
  getStageValueByNumber,
} from '../core/utils/monitoringHelpers';
import { formatPhoneDisplay, getWhatsAppHref } from '../core/utils/autoIdHelpers';
import { PrintPortal } from './PrintPortal';
import { QrCodeSvg } from './QrCodeSvg';
import {
  BundleStudentItem,
  LembarMonitoring0701Sheet,
  LembarPenilaianKurmerSheet,
  OfficialSchoolKop0708,
  SuratTugas0708Sheet,
} from './DocumentPrintTemplates';

export type DocumentHubKey =
  | 'doc_paket_monitoring'
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
  doc_paket_monitoring: {
    label: 'Paket Cetak Monitoring (1-Langkah)',
    shortTitle: 'Paket 1-Langkah',
    description:
      'Cetak sekaligus Surat Tugas (07.08), Lembar Monitoring (07.01), dan Lembar Penilaian Kurmer (mulai Mon 4) berurutan per DUDI',
    sourceLabel: 'Penempatan, DUDI, Guru & Monitoring 8 Tahap',
    icon: Layers,
    defaultNoSurat: `191.13 / E / Yay.II / PI / XI / ${new Date().getFullYear()}`,
  },
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
    description: 'Surat perintah tugas resmi Format 07.08 per DUDI binaan sesuai tahap monitoring',
    sourceLabel: 'Database Guru Pendamping & Siswa PKL',
    icon: UserCheck,
    defaultNoSurat: `191.13 / E / Yay.II / PI / XI / ${new Date().getFullYear()}`,
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
    label: 'Lembar Monitoring Lapangan (07.01)',
    shortTitle: 'Monitoring',
    description: 'Formulir supervisi Format 07.01 berisi presensi kelompok & kondisi bengkel DUDI',
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

interface DudiBundleItem {
  bundleKey: string;
  guruId: string;
  guruNama: string;
  guruNip: string;
  guruJabatan: string;
  dudiKey: string;
  namaDudi: string;
  alamatDudi: string;
  pemimpinDudi: string;
  noTelpDudi: string;
  students: BundleStudentItem[];
  isLocked: boolean;
  pendingStudents: string[];
}

function extractGoogleDocId(urlOrId?: string): string {
  const s = String(urlOrId || '').trim();
  if (!s) return '';
  const m = s.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m && m[1] ? m[1] : s;
}

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
  const [siswaList, setSiswaList] = useState<Siswa[]>([]);
  const [monitoringList, setMonitoringList] = useState<Monitoring[]>([]);

  // Active selection ID & print settings
  const [selectedId, setSelectedId] = useState<string>('');
  const [checkedItemIds, setCheckedItemIds] = useState<Record<string, boolean>>({});
  const [multiPreviewIdx, setMultiPreviewIdx] = useState<number>(0);
  const [guruFilter, setGuruFilter] = useState<string>('ALL');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [paperSize, setPaperSize] = useState<'A4' | 'F4'>('A4');
  const [nomorSurat, setNomorSurat] = useState(DOC_META[activeDocKey].defaultNoSurat);
  const [tanggalSurat, setTanggalSurat] = useState(() =>
    formatIndonesianDate(getTodayWibIsoDate())
  );
  const [kepalaSekolah, setKepalaSekolah] = useState('Agus Salim, S. Kom.');
  const [includeGroupPeers, setIncludeGroupPeers] = useState(true);
  const [suratTugasStageNum, setSuratTugasStageNum] = useState<number>(1);
  const [selectedSuratTugasDudi, setSelectedSuratTugasDudi] = useState<string>('ALL_UNLOCKED');

  // Bundle 1-Step Print states (doc_paket_monitoring)
  const [bundleStageNum, setBundleStageNum] = useState<number>(2);
  const [bundleGuruFilter, setBundleGuruFilter] = useState<string>('ALL');
  const [bundleIncludeSt, setBundleIncludeSt] = useState<boolean>(true);
  const [bundleIncludeMon, setBundleIncludeMon] = useState<boolean>(true);
  const [bundleIncludeNilai, setBundleIncludeNilai] = useState<boolean>(false);
  const [checkedBundleKeys, setCheckedBundleKeys] = useState<Record<string, boolean>>({});
  const [bundlePreviewIdx, setBundlePreviewIdx] = useState<number>(0);
  const [generatingDocsPdf, setGeneratingDocsPdf] = useState<boolean>(false);
  const [isParamModalOpen, setIsParamModalOpen] = useState<boolean>(false);
  const [generatedBundlePdf, setGeneratedBundlePdf] = useState<{
    pdfUrl: string;
    fileName: string;
    totalSheets: number;
  } | null>(null);

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
      } else if (activeDocKey === 'doc_surat_tugas' || activeDocKey === 'doc_paket_monitoring') {
        const gSvc = GuruService.getInstance();
        const pSvc = SiswaPklService.getInstance();
        const mSvc = MonitoringService.getInstance();
        const dSvc = DudiService.getInstance();
        const sSvc = SiswaService.getInstance();
        if (forceReload) {
          await Promise.all([
            gSvc.reloadFromSpreadsheet(),
            pSvc.reloadFromSpreadsheet(),
            mSvc.reloadFromSpreadsheet(),
            dSvc.reloadFromSpreadsheet(),
            sSvc.reloadFromSpreadsheet(),
          ]);
        }
        const [gRows, pRows, mRows, dRows, sRows] = await Promise.all([
          gSvc.getAll(),
          pSvc.getAll(),
          mSvc.getAll().catch(() => []),
          dSvc.getAll().catch(() => []),
          sSvc.getAll().catch(() => []),
        ]);
        setGuruList(gRows);
        setPenempatanList(pRows);
        setMonitoringList(mRows);
        setDudiList(dRows);
        setSiswaList(sRows);
        setSelectedId((prev) => (gRows.some((r) => r.id === prev) ? prev : gRows[0]?.id || ''));
      } else if (activeDocKey === 'doc_pengajuan') {
        const svc = PengajuanService.getInstance();
        const dSvc = DudiService.getInstance();
        if (forceReload) {
          await Promise.all([svc.reloadFromSpreadsheet(), dSvc.reloadFromSpreadsheet()]);
        }
        const [rows, dRows] = await Promise.all([
          svc.getAll(),
          dSvc.getAll().catch(() => []),
        ]);
        setPengajuanList(rows);
        setDudiList(dRows);
        setSelectedId((prev) => (rows.some((r) => r.id === prev) ? prev : rows[0]?.id || ''));
      } else {
        const gSvc = GuruService.getInstance();
        const pSvc = SiswaPklService.getInstance();
        const dSvc = DudiService.getInstance();
        const mSvc = MonitoringService.getInstance();
        const reqSvc = PengajuanService.getInstance();
        const sSvc = SiswaService.getInstance();
        if (forceReload) {
          await Promise.all([
            gSvc.reloadFromSpreadsheet(),
            pSvc.reloadFromSpreadsheet(),
            dSvc.reloadFromSpreadsheet(),
            mSvc.reloadFromSpreadsheet(),
            reqSvc.reloadFromSpreadsheet(),
            sSvc.reloadFromSpreadsheet(),
          ]);
        }
        const [gRows, pRows, dRows, mRows, reqRows, sRows] = await Promise.all([
          gSvc.getAll().catch(() => []),
          pSvc.getAll(),
          dSvc.getAll().catch(() => []),
          mSvc.getAll().catch(() => []),
          reqSvc.getAll().catch(() => []),
          sSvc.getAll().catch(() => []),
        ]);
        setGuruList(gRows);
        setPenempatanList(pRows);
        setDudiList(dRows);
        setMonitoringList(mRows);
        setPengajuanList(reqRows);
        setSiswaList(sRows);
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
    setCheckedItemIds({});
    setMultiPreviewIdx(0);
    setGuruFilter('ALL');
    setSelectedSuratTugasDudi('ALL_UNLOCKED');
    setGeneratedBundlePdf(null);
    loadDataForDoc(false);
  }, [activeDocKey]);

  useEffect(() => {
    if (activeDocKey === 'doc_surat_tugas') {
      setSelectedSuratTugasDudi('ALL_UNLOCKED');
    }
  }, [activeDocKey, selectedId]);

  // Auto-toggle Nilai PKL checkbox when stage reaches Monitoring 4 (Tahap 5) or higher
  const handleChangeBundleStage = (nextStage: number) => {
    setBundleStageNum(nextStage);
    setBundleIncludeSt(true);
    setBundleIncludeMon(true);
    setBundleIncludeNilai(nextStage >= 5);
    setGeneratedBundlePdf(null);
    setBundlePreviewIdx(0);
  };

  const siswaByNis = useMemo(() => {
    const map = new Map<string, Siswa>();
    for (const s of siswaList) {
      const d = stripNisSymbols(s.nis);
      if (d) map.set(d, s);
    }
    return map;
  }, [siswaList]);

  // Build 1-Step Monitoring Bundles grouped by (Guru + DUDI)
  const bundleDudiItems = useMemo<DudiBundleItem[]>(() => {
    if (activeDocKey !== 'doc_paket_monitoring') return [];

    const q = searchQuery.trim().toLowerCase();
    const activePlacements = penempatanList.filter((p) => p.statusPenempatan !== 'Dibatalkan');

    const groupMap = new Map<
      string,
      {
        guruId: string;
        guruNama: string;
        dudiId: string;
        namaDudi: string;
        rows: PenempatanPKL[];
      }
    >();

    for (const p of activePlacements) {
      const guruNama = (p.guruPendamping || 'Belum Ditentukan').trim();
      const guruId = (p.idGuruPendamping || guruNama).trim();
      if (bundleGuruFilter !== 'ALL') {
        const selectedGuru = guruList.find((g) => g.id === bundleGuruFilter);
        const matchId = p.idGuruPendamping && p.idGuruPendamping === bundleGuruFilter;
        const matchName =
          selectedGuru &&
          p.guruPendamping &&
          p.guruPendamping.toLowerCase().includes(selectedGuru.nama.toLowerCase());
        if (!matchId && !matchName) continue;
      }

      const namaDudi = (p.namaDudi || 'DUDI Belum Ditentukan').trim();
      const dudiKey = namaDudi.toLowerCase();
      const gKey = guruId.toLowerCase() + '::' + dudiKey;

      if (!groupMap.has(gKey)) {
        groupMap.set(gKey, {
          guruId,
          guruNama,
          dudiId: p.idDudi || '',
          namaDudi,
          rows: [],
        });
      }
      groupMap.get(gKey)!.rows.push(p);
    }

    const items: DudiBundleItem[] = [];

    for (const [bundleKey, grp] of groupMap.entries()) {
      const guruObj = guruList.find(
        (g) =>
          (grp.guruId && g.id === grp.guruId) ||
          g.nama.trim().toLowerCase() === grp.guruNama.toLowerCase()
      );
      const dudiObj = dudiList.find(
        (d) =>
          (grp.dudiId && d.id === grp.dudiId) ||
          d.namaDudi.trim().toLowerCase() === grp.namaDudi.toLowerCase()
      );

      const students: BundleStudentItem[] = grp.rows.map((s) => {
        const siswaRec = siswaByNis.get(stripNisSymbols(s.nis));
        return {
          nis: s.nis,
          namaSiswa: s.namaSiswa,
          kelas: siswaRec?.kelas || '-',
          jurusan: siswaRec?.jurusan || dudiObj?.bidangKeahlian || '-',
        };
      });

      if (q) {
        const hay = `${grp.namaDudi} ${grp.guruNama} ${students.map((x) => `${x.namaSiswa} ${x.nis}`).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }

      const pendingStudents: string[] = [];
      if (bundleStageNum >= 2) {
        const prevStage = bundleStageNum - 1;
        for (const s of grp.rows) {
          const sum = buildStudentMonitoringSummary(
            {
              nis: s.nis,
              nama: s.namaSiswa,
              idPenempatan: s.idPenempatan,
              dudi_name: s.namaDudi,
            },
            monitoringList,
            []
          );
          if (!sum.completedStages.includes(prevStage)) {
            pendingStudents.push(s.namaSiswa);
          }
        }
      }

      const pemimpinDudi =
        (dudiObj?.namaPemimpin && dudiObj.namaPemimpin !== '-' ? dudiObj.namaPemimpin : '') ||
        (dudiObj?.namaPic && dudiObj.namaPic !== '-' ? dudiObj.namaPic : '') ||
        '';
      const noTelpDudi =
        (dudiObj?.noTelpDudi && dudiObj.noTelpDudi !== '-' ? dudiObj.noTelpDudi : '') ||
        (dudiObj?.kontakPic && dudiObj.kontakPic !== '-' ? dudiObj.kontakPic : '') ||
        '';

      items.push({
        bundleKey,
        guruId: guruObj?.id || grp.guruId,
        guruNama: guruObj?.nama || grp.guruNama,
        guruNip: guruObj?.nip || '-',
        guruJabatan: guruObj?.peranUtama || 'Guru SMK PGRI 2 Ponorogo',
        dudiKey: grp.namaDudi.toLowerCase(),
        namaDudi: dudiObj?.namaDudi || grp.namaDudi,
        alamatDudi: dudiObj?.alamat ? `${dudiObj.alamat}${dudiObj.wilayahKota ? `, ${dudiObj.wilayahKota}` : ''}` : '-',
        pemimpinDudi,
        noTelpDudi,
        students,
        isLocked: pendingStudents.length > 0,
        pendingStudents,
      });
    }

    return items.sort((a, b) => a.namaDudi.localeCompare(b.namaDudi));
  }, [
    activeDocKey,
    penempatanList,
    guruList,
    dudiList,
    monitoringList,
    siswaByNis,
    bundleGuruFilter,
    bundleStageNum,
    searchQuery,
  ]);

  // Auto-check all unlocked DUDIs when filter/stage/list changes
  useEffect(() => {
    if (activeDocKey !== 'doc_paket_monitoring') return;
    const nextMap: Record<string, boolean> = {};
    for (const item of bundleDudiItems) {
      nextMap[item.bundleKey] = !item.isLocked;
    }
    setCheckedBundleKeys(nextMap);
    setBundlePreviewIdx(0);
  }, [activeDocKey, bundleStageNum, bundleGuruFilter, penempatanList.length, monitoringList.length]);

  const selectedBundles = useMemo(() => {
    return bundleDudiItems.filter((item) => !item.isLocked && checkedBundleKeys[item.bundleKey]);
  }, [bundleDudiItems, checkedBundleKeys]);

  // Flatten all sheets in order: Per DUDI -> [Surat Tugas -> Lembar Monitoring -> Form Penilaian per Siswa]
  const bundlePrintPages = useMemo(() => {
    if (activeDocKey !== 'doc_paket_monitoring') return [];
    const pages: Array<{
      id: string;
      kind: 'surat_tugas' | 'monitoring' | 'nilai';
      dudiName: string;
      guruName: string;
      subtitle: string;
      bundle: DudiBundleItem;
      student?: BundleStudentItem;
    }> = [];

    for (const b of selectedBundles) {
      if (bundleIncludeSt) {
        pages.push({
          id: `st_${b.bundleKey}`,
          kind: 'surat_tugas',
          dudiName: b.namaDudi,
          guruName: b.guruNama,
          subtitle: `Surat Tugas (07.08) — ${b.namaDudi}`,
          bundle: b,
        });
      }
      if (bundleIncludeMon) {
        pages.push({
          id: `mon_${b.bundleKey}`,
          kind: 'monitoring',
          dudiName: b.namaDudi,
          guruName: b.guruNama,
          subtitle: `Lembar Monitoring (07.01) — ${b.namaDudi} (${b.students.length} siswa)`,
          bundle: b,
        });
      }
      if (bundleIncludeNilai) {
        b.students.forEach((stu, idx) => {
          pages.push({
            id: `nil_${b.bundleKey}_${stu.nis || idx}`,
            kind: 'nilai',
            dudiName: b.namaDudi,
            guruName: b.guruNama,
            subtitle: `Penilaian Kurmer — ${stu.namaSiswa} (${b.namaDudi})`,
            bundle: b,
            student: stu,
          });
        });
      }
    }
    return pages;
  }, [activeDocKey, selectedBundles, bundleIncludeSt, bundleIncludeMon, bundleIncludeNilai]);

  const filteredItems = useMemo(() => {
    if (activeDocKey === 'doc_paket_monitoring') return [];
    const q = searchQuery.trim().toLowerCase();
    if (activeDocKey === 'doc_mou') {
      return dudiList
        .filter((d) => !q || `${d.namaDudi} ${d.wilayahKota} ${d.namaPic}`.toLowerCase().includes(q))
        .map((d) => ({
          id: d.id,
          title: d.namaDudi,
          badge: d.statusKerjasama || 'Aktif',
          subtitle: `${d.wilayahKota || d.alamat || '-'} · ${d.statusKerjasama}`,
          raw: d,
        }));
    }
    if (activeDocKey === 'doc_surat_tugas') {
      return guruList
        .filter((g) => !q || `${g.nama} ${g.kontakWA || ''} ${g.peranUtama}`.toLowerCase().includes(q))
        .map((g) => {
          const dudiSet = new Set(
            penempatanList
              .filter(
                (p) =>
                  p.statusPenempatan !== 'Dibatalkan' &&
                  ((p.idGuruPendamping && p.idGuruPendamping === g.id) ||
                    (p.guruPendamping && p.guruPendamping.toLowerCase().includes(g.nama.toLowerCase())))
              )
              .map((p) => (p.namaDudi || '').trim().toLowerCase())
              .filter(Boolean)
          );
          return {
            id: g.id,
            title: g.nama,
            badge: dudiSet.size > 0 ? `${dudiSet.size} DUDI` : '0 DUDI',
            subtitle: `${g.peranUtama}${g.kontakWA ? ` · ${g.kontakWA}` : ''}`,
            raw: g,
          };
        });
    }
    if (activeDocKey === 'doc_pengajuan') {
      const qDigits = stripNisSymbols(q);
      return pengajuanList
        .filter(
          (p) =>
            !q ||
            `${p.namaSiswa} ${p.nis} ${p.dudiTujuan} ${p.noPengajuan}`.toLowerCase().includes(q) ||
            (qDigits && stripNisSymbols(p.nis).includes(qDigits))
        )
        .map((p) => ({
          id: p.id,
          title: `${p.namaSiswa} — ${p.dudiTujuan}`,
          badge: p.statusKakomli || 'Menunggu',
          subtitle: `${formatNisVisual(p.nis)} · ${p.jurusan} · ${p.statusKakomli}`,
          raw: p,
        }));
    }

    // Group active placements per DUDI for doc_pengantaran, doc_monitoring, doc_penarikan
    const qDigits = stripNisSymbols(q);
    const activeRows = penempatanList.filter((p) => p.statusPenempatan !== 'Dibatalkan');
    const selectedGuruObj = guruFilter !== 'ALL' ? guruList.find((g) => g.id === guruFilter) : undefined;
    const dudiGroupMap = new Map<string, { dudiName: string; rows: PenempatanPKL[] }>();

    for (const p of activeRows) {
      if (guruFilter !== 'ALL') {
        const matchId = p.idGuruPendamping && p.idGuruPendamping === guruFilter;
        const matchName =
          selectedGuruObj &&
          p.guruPendamping &&
          p.guruPendamping.toLowerCase().includes(selectedGuruObj.nama.toLowerCase());
        if (!matchId && !matchName) continue;
      }
      const dudiName = (p.namaDudi || 'DUDI Belum Ditentukan').trim();
      const key = dudiName.toLowerCase();
      if (!dudiGroupMap.has(key)) {
        dudiGroupMap.set(key, { dudiName, rows: [] });
      }
      dudiGroupMap.get(key)!.rows.push(p);
    }

    return Array.from(dudiGroupMap.entries())
      .map(([key, grp]) => {
        const first = grp.rows[0];
        const guruNames = Array.from(
          new Set(grp.rows.map((r) => (r.guruPendamping || '').trim()).filter(Boolean))
        );
        const studentHay = grp.rows.map((r) => `${r.namaSiswa} ${r.nis}`).join(' ');
        const fullHay = `${grp.dudiName} ${guruNames.join(' ')} ${studentHay}`.toLowerCase();
        const digitMatch =
          qDigits && grp.rows.some((r) => stripNisSymbols(r.nis).includes(qDigits));
        if (q && !fullHay.includes(q) && !digitMatch) return null;

        return {
          id: `dudi_grp::${key}`,
          title: grp.dudiName,
          badge: `${grp.rows.length} sw`,
          subtitle: `${grp.rows.length} siswa · ${guruNames.join(', ') || 'Guru belum diatur'}`,
          raw: first,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [
    activeDocKey,
    searchQuery,
    guruFilter,
    guruList,
    dudiList,
    pengajuanList,
    penempatanList,
  ]);

  const activeItem = useMemo(() => {
    return filteredItems.find((i) => i.id === selectedId) || filteredItems[0] || null;
  }, [filteredItems, selectedId]);

  const activeRecord = activeItem?.raw || null;

  const checkedItems = useMemo(() => {
    return filteredItems.filter((item) => Boolean(checkedItemIds[item.id]));
  }, [filteredItems, checkedItemIds]);

  const isMultiCheckedMode = activeDocKey !== 'doc_paket_monitoring' && checkedItems.length > 0;

  // Per-DUDI sequential lock state for doc_surat_tugas
  const suratTugasAudit = useMemo(() => {
    if (activeDocKey !== 'doc_surat_tugas' || !activeRecord) {
      return {
        dudiGroups: [] as Array<{
          key: string;
          namaDudi: string;
          alamatDudi: string;
          pemimpinDudi: string;
          students: PenempatanPKL[];
          isLocked: boolean;
          pendingStudents: string[];
        }>,
        unlockedGroups: [] as any[],
        lockedGroups: [] as any[],
        isPrintBlocked: false,
        blockReason: '',
      };
    }

    const guru = activeRecord as Guru;
    const assigned = penempatanList.filter(
      (p) =>
        p.statusPenempatan !== 'Dibatalkan' &&
        ((p.idGuruPendamping && p.idGuruPendamping === guru.id) ||
          (p.guruPendamping && p.guruPendamping.toLowerCase().includes(guru.nama.toLowerCase())))
    );

    const groupMap = new Map<string, { namaDudi: string; students: PenempatanPKL[] }>();
    for (const stu of assigned) {
      const dudiLabel = (stu.namaDudi || 'DUDI Belum Ditentukan').trim();
      const key = dudiLabel.toLowerCase();
      if (!groupMap.has(key)) {
        groupMap.set(key, { namaDudi: dudiLabel, students: [] });
      }
      groupMap.get(key)!.students.push(stu);
    }

    const dudiGroups = Array.from(groupMap.entries()).map(([key, grp]) => {
      const dudiObj = dudiList.find((d) => d.namaDudi.trim().toLowerCase() === key);
      const alamatDudi = dudiObj?.alamat
        ? `${dudiObj.alamat}${dudiObj.wilayahKota ? `, ${dudiObj.wilayahKota}` : ''}`
        : '-';
      const pemimpinDudi = dudiObj?.namaPemimpin || dudiObj?.namaPic || '';

      if (suratTugasStageNum <= 1) {
        return {
          key,
          namaDudi: grp.namaDudi,
          alamatDudi,
          pemimpinDudi,
          students: grp.students,
          isLocked: false,
          pendingStudents: [] as string[],
        };
      }
      const prevStage = suratTugasStageNum - 1;
      const pendingStudents: string[] = [];
      for (const s of grp.students) {
        const sum = buildStudentMonitoringSummary(
          {
            nis: s.nis,
            nama: s.namaSiswa,
            idPenempatan: s.idPenempatan,
            dudi_name: s.namaDudi,
          },
          monitoringList,
          []
        );
        if (!sum.completedStages.includes(prevStage)) {
          pendingStudents.push(s.namaSiswa);
        }
      }
      return {
        key,
        namaDudi: grp.namaDudi,
        alamatDudi,
        pemimpinDudi,
        students: grp.students,
        isLocked: pendingStudents.length > 0,
        pendingStudents,
      };
    });

    const unlockedGroups = dudiGroups.filter((g) => !g.isLocked);
    const lockedGroups = dudiGroups.filter((g) => g.isLocked);

    let isPrintBlocked = false;
    let blockReason = '';
    const prevStageLabel = getStageValueByNumber(Math.max(1, suratTugasStageNum - 1));
    const currentStageLabel = getStageValueByNumber(suratTugasStageNum);

    if (suratTugasStageNum >= 2 && dudiGroups.length > 0) {
      if (selectedSuratTugasDudi === 'ALL_UNLOCKED') {
        if (unlockedGroups.length === 0) {
          isPrintBlocked = true;
          blockReason = `Seluruh DUDI bimbingan ${guru.nama} belum menyelesaikan ${prevStageLabel}, sehingga Surat Tugas ${currentStageLabel} masih terkunci.`;
        }
      } else {
        const targetGrp = dudiGroups.find((g) => g.key === selectedSuratTugasDudi);
        if (targetGrp?.isLocked) {
          isPrintBlocked = true;
          blockReason = `Surat Tugas ${currentStageLabel} untuk ${targetGrp.namaDudi} terkunci karena ${targetGrp.pendingStudents.join(', ')} belum menyelesaikan ${prevStageLabel}.`;
        }
      }
    }

    return {
      dudiGroups,
      unlockedGroups,
      lockedGroups,
      isPrintBlocked,
      blockReason,
    };
  }, [
    activeDocKey,
    activeRecord,
    penempatanList,
    dudiList,
    monitoringList,
    suratTugasStageNum,
    selectedSuratTugasDudi,
  ]);

  const batchSuratTugasPages = useMemo(() => {
    if (activeDocKey !== 'doc_surat_tugas' || !isMultiCheckedMode) return [];
    const pages: Array<{
      id: string;
      guru: Guru;
      namaDudi: string;
      alamatDudi: string;
      pemimpinDudi: string;
      subtitle: string;
      itemId: string;
    }> = [];

    for (const item of checkedItems) {
      const guru = item.raw as Guru;
      const assigned = penempatanList.filter(
        (p) =>
          p.statusPenempatan !== 'Dibatalkan' &&
          ((p.idGuruPendamping && p.idGuruPendamping === guru.id) ||
            (p.guruPendamping && p.guruPendamping.toLowerCase().includes(guru.nama.toLowerCase())))
      );
      const groupMap = new Map<string, { namaDudi: string; students: PenempatanPKL[] }>();
      for (const stu of assigned) {
        const dudiLabel = (stu.namaDudi || 'DUDI Belum Ditentukan').trim();
        const key = dudiLabel.toLowerCase();
        if (!groupMap.has(key)) groupMap.set(key, { namaDudi: dudiLabel, students: [] });
        groupMap.get(key)!.students.push(stu);
      }
      for (const [dKey, grp] of groupMap.entries()) {
        if (suratTugasStageNum >= 2) {
          const prevStage = suratTugasStageNum - 1;
          const hasPending = grp.students.some((s) => {
            const sum = buildStudentMonitoringSummary(
              { nis: s.nis, nama: s.namaSiswa, idPenempatan: s.idPenempatan, dudi_name: s.namaDudi },
              monitoringList,
              []
            );
            return !sum.completedStages.includes(prevStage);
          });
          if (hasPending) continue;
        }
        const dudiObj = dudiList.find((d) => d.namaDudi.trim().toLowerCase() === dKey);
        const alamatDudi = dudiObj?.alamat
          ? `${dudiObj.alamat}${dudiObj.wilayahKota ? `, ${dudiObj.wilayahKota}` : ''}`
          : '-';
        const pemimpinDudi = dudiObj?.namaPemimpin || dudiObj?.namaPic || '';
        pages.push({
          id: `st_batch_${guru.id}_${dKey}`,
          guru,
          namaDudi: grp.namaDudi,
          alamatDudi,
          pemimpinDudi,
          subtitle: `${guru.nama} — ${grp.namaDudi}`,
          itemId: item.id,
        });
      }
    }
    return pages;
  }, [
    activeDocKey,
    isMultiCheckedMode,
    checkedItems,
    penempatanList,
    monitoringList,
    dudiList,
    suratTugasStageNum,
  ]);

  const stTemplateId = extractGoogleDocId(
    templates.find((t) => t.id === 'doc_surat_tugas')?.url
  );
  const monTemplateId = extractGoogleDocId(
    templates.find((t) => t.id === 'doc_monitoring')?.url
  );
  const nilaiTemplateId = extractGoogleDocId(
    templates.find((t) => t.id === 'doc_nilai')?.url
  );

  const missingBundleTemplates: string[] = [];
  if (bundleIncludeSt && !stTemplateId) missingBundleTemplates.push('Surat Tugas');
  if (bundleIncludeMon && !monTemplateId) missingBundleTemplates.push('Lembar Monitoring');
  if (bundleIncludeNilai && !nilaiTemplateId) missingBundleTemplates.push('Lembar Penilaian PKL');

  const handlePrint = () => {
    if (activeDocKey === 'doc_paket_monitoring') {
      if (bundlePrintPages.length === 0) return;
      window.print();
      return;
    }
    if (isMultiCheckedMode) {
      if (activeDocKey === 'doc_surat_tugas') {
        if (batchSuratTugasPages.length === 0) return;
        window.print();
        return;
      }
      if (checkedItems.length === 0) return;
      window.print();
      return;
    }
    if (!activeRecord || suratTugasAudit.isPrintBlocked) return;
    window.print();
  };

  const handleGenerateDocsPdfBundle = async () => {
    if (selectedBundles.length === 0 || generatingDocsPdf) return;
    setGeneratingDocsPdf(true);
    setGeneratedBundlePdf(null);
    try {
      const res = await PublicPortalClient.generateMonitoringBundlePdf({
        templateIds: {
          suratTugas: stTemplateId,
          monitoring: monTemplateId,
          nilai: nilaiTemplateId,
        },
        includeDocs: {
          suratTugas: bundleIncludeSt,
          monitoring: bundleIncludeMon,
          nilai: bundleIncludeNilai,
        },
        meta: {
          tahapNum: bundleStageNum,
          tahapLabel: getStageValueByNumber(bundleStageNum),
          tahunAjaran: activeYear,
          nomorSurat,
          tanggalSurat,
          kepalaSekolah,
        },
        bundles: selectedBundles.map((b) => ({
          namaDudi: b.namaDudi,
          alamatDudi: b.alamatDudi,
          pemimpinDudi: b.pemimpinDudi,
          noTelpDudi: b.noTelpDudi,
          namaGuru: b.guruNama,
          nipGuru: b.guruNip,
          jabatanGuru: b.guruJabatan,
          students: b.students,
        })),
      });
      setGeneratedBundlePdf({
        pdfUrl: res.pdfUrl,
        fileName: res.fileName,
        totalSheets: res.totalSheets,
      });
    } catch {
      // ToastManager shows clear message
    } finally {
      setGeneratingDocsPdf(false);
    }
  };

  const renderBundlePageContent = (page: (typeof bundlePrintPages)[number]) => {
    if (page.kind === 'surat_tugas') {
      return (
        <SuratTugas0708Sheet
          nomorSurat={nomorSurat}
          tanggalSurat={tanggalSurat}
          kepalaSekolah={kepalaSekolah}
          namaGuru={page.bundle.guruNama}
          jabatanGuru={page.bundle.guruJabatan}
          tahapNum={bundleStageNum}
          namaDudi={page.bundle.namaDudi}
          alamatDudi={page.bundle.alamatDudi}
          namaPemimpinDudi={page.bundle.pemimpinDudi}
          tanggalPenugasan={tanggalSurat}
        />
      );
    }
    if (page.kind === 'monitoring') {
      return (
        <LembarMonitoring0701Sheet
          tahapNum={bundleStageNum}
          activeYear={activeYear}
          namaBengkel={page.bundle.namaDudi}
          alamatBengkel={page.bundle.alamatDudi}
          pemimpinBengkel={page.bundle.pemimpinDudi}
          noTelpBengkel={page.bundle.noTelpDudi}
          students={page.bundle.students}
          namaPetugas={page.bundle.guruNama}
          tanggalSurat={tanggalSurat}
        />
      );
    }
    return (
      <LembarPenilaianKurmerSheet
        namaSiswa={page.student?.namaSiswa || ''}
        jurusan={page.student?.jurusan || '-'}
        kelas={page.student?.kelas || '-'}
        namaDudi={page.bundle.namaDudi}
      />
    );
  };

  const batchDocCount =
    activeDocKey === 'doc_paket_monitoring'
      ? bundlePrintPages.length
      : isMultiCheckedMode
      ? activeDocKey === 'doc_surat_tugas'
        ? batchSuratTugasPages.length
        : checkedItems.length
      : 0;

  const canPrintNow =
    activeDocKey === 'doc_paket_monitoring'
      ? bundlePrintPages.length > 0
      : isMultiCheckedMode
      ? batchDocCount > 0
      : Boolean(activeRecord && !suratTugasAudit.isPrintBlocked);

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      {/* Clean Document Hub Header */}
      <div className="no-print">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shrink-0">
              <meta.icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-slate-900 tracking-tight truncate">
                {meta.label}
              </h1>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-slate-500">
                <span>{meta.description}</span>
                <span className="text-slate-300" aria-hidden="true">·</span>
                <span className="font-mono text-slate-600 font-medium">{meta.sourceLabel}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed((prev) => !prev)}
              className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              title={isSidebarCollapsed ? 'Tampilkan panel pilih data' : 'Sembunyikan panel agar pratinjau penuh'}
            >
              {isSidebarCollapsed ? (
                <PanelLeftOpen className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              ) : (
                <PanelLeftClose className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              )}
              <span>{isSidebarCollapsed ? 'Tampilkan Panel' : 'Sembunyikan Panel'}</span>
            </button>

            {activeDocKey !== 'doc_paket_monitoring' && templateConfig?.url ? (
              <a
                href={templateConfig.url}
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors whitespace-nowrap"
              >
                <ExternalLink className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Master Docs</span>
              </a>
            ) : (
              onOpenTemplateManager && (
                <button
                  type="button"
                  onClick={onOpenTemplateManager}
                  className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Settings2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Atur Template</span>
                </button>
              )
            )}

            <button
              type="button"
              onClick={() => setIsParamModalOpen(true)}
              className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              title="Ubah Nomor Surat, Tanggal, Ukuran Kertas, Penandatangan & Tahap"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>Parameter Surat &amp; Cetak</span>
            </button>

            <button
              type="button"
              onClick={() => loadDataForDoc(true)}
              disabled={loading}
              className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 shrink-0 ${
                  loading ? 'animate-spin text-blue-600' : 'text-slate-500'
                }`}
              />
              <span>Muat Ulang</span>
            </button>

            {activeDocKey === 'doc_paket_monitoring' && (
              <button
                type="button"
                onClick={handleGenerateDocsPdfBundle}
                disabled={selectedBundles.length === 0 || (!bundleIncludeSt && !bundleIncludeMon && !bundleIncludeNilai) || generatingDocsPdf || missingBundleTemplates.length > 0}
                title={
                  missingBundleTemplates.length > 0
                    ? `Pasang template Google Docs dahulu untuk: ${missingBundleTemplates.join(', ')}`
                    : 'Buat 1 file PDF di Google Drive memakai Master Template Google Docs'
                }
                className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {generatingDocsPdf ? (
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                ) : (
                  <FileDown className="w-4 h-4 shrink-0" />
                )}
                <span>
                  {generatingDocsPdf ? 'Memproses...' : 'PDF Drive'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={handlePrint}
              disabled={!canPrintNow}
              title={
                activeDocKey === 'doc_surat_tugas' && !isMultiCheckedMode && suratTugasAudit.isPrintBlocked
                  ? suratTugasAudit.blockReason
                  : `Cetak dokumen (${paperSize})`
              }
              className="h-9 inline-flex items-center gap-1.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap tabular-nums"
            >
              {activeDocKey === 'doc_surat_tugas' && !isMultiCheckedMode && suratTugasAudit.isPrintBlocked ? (
                <Lock className="w-4 h-4 shrink-0" />
              ) : (
                <Printer className="w-4 h-4 shrink-0" />
              )}
              <span>
                {activeDocKey === 'doc_surat_tugas' && !isMultiCheckedMode && suratTugasAudit.isPrintBlocked
                  ? 'Surat Tugas Terkunci'
                  : activeDocKey === 'doc_paket_monitoring'
                  ? `Cetak Paket (${bundlePrintPages.length} Lbr)`
                  : isMultiCheckedMode
                  ? `Cetak Massal (${batchDocCount} Lbr)`
                  : `Cetak 1 Dok (${paperSize})`}
              </span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2 no-print">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Workspace Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left: Compact Collapsible Settings + Checklist Picker */}
        {!isSidebarCollapsed && (
          <div className="lg:col-span-4 space-y-3 no-print">
            {activeDocKey === 'doc_paket_monitoring' ? (
              <div className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                    Paket Monitoring · {selectedBundles.length}/{bundleDudiItems.length} DUDI
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsParamModalOpen(true)}
                    className="text-[11px] text-blue-600 hover:underline font-semibold cursor-pointer"
                  >
                    Parameter ({paperSize})
                  </button>
                </div>

                {/* Compact 2-Column Filters */}
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={bundleStageNum}
                    onChange={(e) => handleChangeBundleStage(Number(e.target.value) || 1)}
                    aria-label="Tahap Kunjungan Monitoring"
                    className="w-full h-8 px-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white font-semibold text-[11.5px] focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  >
                    {MONITORING_STAGES.map((st) => (
                      <option key={st.num} value={st.num}>
                        {st.value}
                      </option>
                    ))}
                  </select>

                  <select
                    value={bundleGuruFilter}
                    onChange={(e) => setBundleGuruFilter(e.target.value)}
                    aria-label="Filter Guru Pendamping"
                    className="w-full h-8 px-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white font-semibold text-[11.5px] focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  >
                    <option value="ALL">Semua Guru</option>
                    {guruList.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.nama}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Compact 3-Chip Document Checkboxes */}
                <div className="grid grid-cols-3 gap-1.5 pt-1">
                  <label
                    className={`flex items-center justify-center gap-1.5 h-8 px-2 rounded-lg border text-[11px] font-semibold cursor-pointer select-none transition-colors ${
                      bundleIncludeSt
                        ? 'bg-blue-50 border-blue-300 text-blue-900'
                        : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={bundleIncludeSt}
                      onChange={(e) => setBundleIncludeSt(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>S. Tugas</span>
                  </label>
                  <label
                    className={`flex items-center justify-center gap-1.5 h-8 px-2 rounded-lg border text-[11px] font-semibold cursor-pointer select-none transition-colors ${
                      bundleIncludeMon
                        ? 'bg-blue-50 border-blue-300 text-blue-900'
                        : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={bundleIncludeMon}
                      onChange={(e) => setBundleIncludeMon(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>Monitor</span>
                  </label>
                  <label
                    className={`flex items-center justify-center gap-1.5 h-8 px-2 rounded-lg border text-[11px] font-semibold cursor-pointer select-none transition-colors ${
                      bundleIncludeNilai
                        ? 'bg-blue-50 border-blue-300 text-blue-900'
                        : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={bundleIncludeNilai}
                      onChange={(e) => setBundleIncludeNilai(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>Nilai</span>
                  </label>
                </div>

                {missingBundleTemplates.length > 0 && (
                  <div className="px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-[10.5px] text-amber-900">
                    Template Docs belum dipasang: <b>{missingBundleTemplates.join(', ')}</b> (Cetak browser tetap siap).
                  </div>
                )}

                {generatedBundlePdf && (
                  <div className="p-2.5 rounded-lg border border-emerald-200 bg-emerald-50 text-[11px] text-emerald-900 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold truncate">PDF Drive Siap ({generatedBundlePdf.totalSheets} hal)</div>
                      <div className="font-mono text-[10px] truncate text-emerald-700">{generatedBundlePdf.fileName}</div>
                    </div>
                    <a
                      href={generatedBundlePdf.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Buka</span>
                    </a>
                  </div>
                )}

                {/* Search + Select All Controls */}
                <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Cari DUDI, guru, siswa..."
                      className="w-full h-8 pl-8 pr-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const m: Record<string, boolean> = {};
                      bundleDudiItems.forEach((b) => {
                        if (!b.isLocked) m[b.bundleKey] = true;
                      });
                      setCheckedBundleKeys(m);
                    }}
                    className="text-[11px] font-semibold text-blue-700 hover:underline shrink-0 cursor-pointer"
                  >
                    Semua
                  </button>
                  <button
                    type="button"
                    onClick={() => setCheckedBundleKeys({})}
                    className="text-[11px] font-semibold text-slate-500 hover:underline shrink-0 cursor-pointer"
                  >
                    Reset
                  </button>
                </div>

                {/* Super-Compact 1-Line DUDI Checklist */}
                <div className="max-h-[460px] overflow-y-auto space-y-1 pr-0.5">
                  {loading ? (
                    <div className="py-6 text-center text-xs text-slate-400">
                      Memuat daftar penempatan &amp; monitoring...
                    </div>
                  ) : bundleDudiItems.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg p-3">
                      Tidak ada penempatan DUDI aktif untuk filter ini.
                    </div>
                  ) : (
                    bundleDudiItems.map((b) => {
                      const isChecked = !b.isLocked && Boolean(checkedBundleKeys[b.bundleKey]);
                      const sheetCountForDudi =
                        (bundleIncludeSt ? 1 : 0) +
                        (bundleIncludeMon ? 1 : 0) +
                        (bundleIncludeNilai ? b.students.length : 0);
                      return (
                        <button
                          type="button"
                          key={b.bundleKey}
                          disabled={b.isLocked}
                          title={
                            b.isLocked
                              ? `Terkunci: ${b.pendingStudents.join(', ')} belum selesai Tahap ${bundleStageNum - 1}`
                              : `${b.namaDudi} · Guru: ${b.guruNama}`
                          }
                          onClick={() =>
                            setCheckedBundleKeys((prev) => ({
                              ...prev,
                              [b.bundleKey]: !prev[b.bundleKey],
                            }))
                          }
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-2 ${
                            b.isLocked
                              ? 'bg-amber-50/70 border-amber-200 opacity-85 cursor-not-allowed'
                              : isChecked
                              ? 'bg-blue-50 border-blue-400 cursor-pointer'
                              : 'bg-slate-50/70 border-slate-200 hover:bg-white cursor-pointer'
                          }`}
                        >
                          <div className="shrink-0">
                            {b.isLocked ? (
                              <Lock className="w-3.5 h-3.5 text-amber-600" />
                            ) : isChecked ? (
                              <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                            ) : (
                              <Square className="w-3.5 h-3.5 text-slate-400" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-900">
                            {b.namaDudi}
                          </div>
                          <span className="shrink-0 text-[10.5px] font-medium text-slate-500 tabular-nums">
                            {b.isLocked ? `Kunci T${bundleStageNum - 1}` : `${b.students.length}sw·${sheetCountForDudi}lbr`}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-2.5 text-xs">
                {/* Compact Active Parameter Strip */}
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                  <div className="min-w-0 truncate text-[11px] text-slate-600">
                    <span className="font-bold text-slate-900">{paperSize}</span>
                    <span className="mx-1 text-slate-300">·</span>
                    <span className="font-mono text-slate-700">{nomorSurat}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsParamModalOpen(true)}
                    className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline font-semibold shrink-0 cursor-pointer"
                  >
                    <SlidersHorizontal className="w-3 h-3" />
                    <span>Ubah</span>
                  </button>
                </div>

                {/* Header + Quick Select All / Reset */}
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[11px] font-bold text-slate-900 uppercase tracking-wider tabular-nums">
                    {activeDocKey === 'doc_pengantaran' ||
                    activeDocKey === 'doc_monitoring' ||
                    activeDocKey === 'doc_penarikan'
                      ? `DUDI (${filteredItems.length})`
                      : `Data (${filteredItems.length})`}
                    {checkedItems.length > 0 && (
                      <span className="ml-1.5 text-blue-600">· {checkedItems.length} dipilih</span>
                    )}
                  </h3>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const next: Record<string, boolean> = {};
                        filteredItems.forEach((it) => {
                          next[it.id] = true;
                        });
                        setCheckedItemIds(next);
                        setMultiPreviewIdx(0);
                      }}
                      className="text-[11px] font-semibold text-blue-700 hover:underline cursor-pointer"
                    >
                      Pilih Semua
                    </button>
                    {checkedItems.length > 0 && (
                      <>
                        <span className="text-slate-300">·</span>
                        <button
                          type="button"
                          onClick={() => {
                            setCheckedItemIds({});
                            setMultiPreviewIdx(0);
                          }}
                          className="text-[11px] font-semibold text-slate-500 hover:underline cursor-pointer"
                        >
                          Kosongkan
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Compact Filter + Search */}
                <div className="space-y-1.5">
                  {(activeDocKey === 'doc_pengantaran' ||
                    activeDocKey === 'doc_monitoring' ||
                    activeDocKey === 'doc_penarikan') && (
                    <select
                      value={guruFilter}
                      onChange={(e) => {
                        setGuruFilter(e.target.value);
                        setMultiPreviewIdx(0);
                      }}
                      aria-label="Filter Guru Pendamping"
                      className="w-full h-8 px-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-[11.5px] font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    >
                      <option value="ALL">Semua Guru Pendamping</option>
                      {guruList.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.nama}
                        </option>
                      ))}
                    </select>
                  )}

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={
                        activeDocKey === 'doc_pengantaran' ||
                        activeDocKey === 'doc_monitoring' ||
                        activeDocKey === 'doc_penarikan'
                          ? 'Cari DUDI, guru, atau siswa...'
                          : 'Cari nama, NIS, atau DUDI...'
                      }
                      className="w-full h-8 pl-8 pr-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>
                </div>

                {/* Super-Compact 1-Line Rows with Left Checkbox + Click-to-Preview */}
                <div className="max-h-[500px] overflow-y-auto space-y-1 pr-0.5">
                  {loading ? (
                    <div className="py-6 text-center text-xs text-slate-400">
                      Membaca data langsung dari Cloud Server...
                    </div>
                  ) : filteredItems.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg p-3">
                      Belum ada data tersedia di {meta.sourceLabel}.
                    </div>
                  ) : (
                    filteredItems.map((item, idx) => {
                      const isChecked = Boolean(checkedItemIds[item.id]);
                      const isFocused = !isMultiCheckedMode && activeItem?.id === item.id;
                      return (
                        <div
                          key={`${item.id || 'doc'}_${idx}`}
                          title={item.subtitle}
                          className={`w-full px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-2 ${
                            isChecked
                              ? 'bg-blue-50 border-blue-400'
                              : isFocused
                              ? 'bg-slate-100 border-slate-400'
                              : 'bg-slate-50/70 border-slate-200 hover:bg-white hover:border-slate-300'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setCheckedItemIds((prev) => ({
                                ...prev,
                                [item.id]: !prev[item.id],
                              }));
                              setMultiPreviewIdx(0);
                            }}
                            className="shrink-0 text-slate-500 hover:text-blue-600 cursor-pointer flex items-center"
                            aria-label={`Centang ${item.title} untuk cetak massal`}
                          >
                            {isChecked ? (
                              <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                            ) : (
                              <Square className="w-3.5 h-3.5 text-slate-400" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedId(item.id);
                              if (isMultiCheckedMode) {
                                if (activeDocKey === 'doc_surat_tugas') {
                                  const foundIdx = batchSuratTugasPages.findIndex(
                                    (p) => p.itemId === item.id
                                  );
                                  if (foundIdx >= 0) setMultiPreviewIdx(foundIdx);
                                } else {
                                  const foundIdx = checkedItems.findIndex((c) => c.id === item.id);
                                  if (foundIdx >= 0) setMultiPreviewIdx(foundIdx);
                                }
                              }
                            }}
                            className="min-w-0 flex-1 text-left flex items-center justify-between gap-2 cursor-pointer"
                          >
                            <span className="text-xs font-semibold text-slate-900 truncate">
                              {item.title}
                            </span>
                            <span className="shrink-0 text-[10.5px] font-medium text-slate-500 tabular-nums">
                              {item.badge}
                            </span>
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Right: Document Paper Preview */}
        <div className={isSidebarCollapsed ? 'lg:col-span-12' : 'lg:col-span-8'}>
          <div className="bg-slate-200/70 rounded-2xl p-4 sm:p-6 border border-slate-200/80 flex flex-col items-center min-h-[600px]">
            {activeDocKey === 'doc_paket_monitoring' ? (
              bundlePrintPages.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 p-10 my-auto max-w-md text-center space-y-3">
                  <Layers className="w-10 h-10 text-slate-300 mx-auto" />
                  <h4 className="text-sm font-bold text-slate-800">
                    Centang Minimal 1 DUDI &amp; 1 Jenis Berkas
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Pilih tahap monitoring, guru pendamping, dan DUDI yang siap di panel kiri untuk mencetak seluruh Surat Tugas, Lembar Monitoring, dan Penilaian Kurmer dalam satu langkah.
                  </p>
                </div>
              ) : (
                <div className="w-full max-w-[794px] space-y-3">
                  <div className="flex items-center justify-between gap-2 bg-white px-3.5 py-2 rounded-xl border border-slate-200 text-xs no-print">
                    <div className="min-w-0 truncate">
                      <span className="font-bold text-slate-900 tabular-nums">
                        Halaman {Math.min(bundlePreviewIdx, bundlePrintPages.length - 1) + 1} /{' '}
                        {bundlePrintPages.length}
                      </span>
                      <span className="text-slate-300 mx-2">·</span>
                      <span className="text-slate-600">
                        {
                          bundlePrintPages[Math.min(bundlePreviewIdx, bundlePrintPages.length - 1)]
                            .subtitle
                        }
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={bundlePreviewIdx <= 0}
                        onClick={() => setBundlePreviewIdx((p) => Math.max(0, p - 1))}
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={bundlePreviewIdx >= bundlePrintPages.length - 1}
                        onClick={() =>
                          setBundlePreviewIdx((p) =>
                            Math.min(bundlePrintPages.length - 1, p + 1)
                          )
                        }
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="bg-white w-full px-8 pb-8 pt-4 sm:px-10 sm:pb-10 sm:pt-5 rounded-xl shadow-md border border-slate-300 text-slate-950">
                    {renderBundlePageContent(
                      bundlePrintPages[Math.min(bundlePreviewIdx, bundlePrintPages.length - 1)]
                    )}
                  </div>
                </div>
              )
            ) : isMultiCheckedMode && activeDocKey === 'doc_surat_tugas' ? (
              batchSuratTugasPages.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 p-10 my-auto max-w-md text-center space-y-2">
                  <Lock className="w-10 h-10 text-amber-400 mx-auto" />
                  <h4 className="text-sm font-bold text-slate-800">
                    Belum Ada Surat Tugas Siap Cetak
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Semua DUDI dari guru yang dicentang masih terkunci di tahap sebelumnya atau belum memiliki penempatan aktif.
                  </p>
                </div>
              ) : (
                <div className="w-full max-w-[794px] space-y-3">
                  <div className="flex items-center justify-between gap-2 bg-white px-3.5 py-2 rounded-xl border border-slate-200 text-xs no-print">
                    <div className="min-w-0 truncate">
                      <span className="font-bold text-slate-900 tabular-nums">
                        Halaman {Math.min(multiPreviewIdx, batchSuratTugasPages.length - 1) + 1} /{' '}
                        {batchSuratTugasPages.length}
                      </span>
                      <span className="text-slate-300 mx-2">·</span>
                      <span className="text-slate-600">
                        {
                          batchSuratTugasPages[
                            Math.min(multiPreviewIdx, batchSuratTugasPages.length - 1)
                          ].subtitle
                        }
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={multiPreviewIdx <= 0}
                        onClick={() => setMultiPreviewIdx((p) => Math.max(0, p - 1))}
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={multiPreviewIdx >= batchSuratTugasPages.length - 1}
                        onClick={() =>
                          setMultiPreviewIdx((p) =>
                            Math.min(batchSuratTugasPages.length - 1, p + 1)
                          )
                        }
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {(() => {
                    const pg =
                      batchSuratTugasPages[
                        Math.min(multiPreviewIdx, batchSuratTugasPages.length - 1)
                      ];
                    return (
                      <div className="bg-white w-full px-8 pb-8 pt-4 sm:px-10 sm:pb-10 sm:pt-5 rounded-xl shadow-md border border-slate-300 text-slate-950">
                        <SuratTugas0708Sheet
                          nomorSurat={nomorSurat}
                          tanggalSurat={tanggalSurat}
                          kepalaSekolah={kepalaSekolah}
                          namaGuru={pg.guru.nama}
                          jabatanGuru={pg.guru.peranUtama || 'Guru SMK PGRI 2 Ponorogo'}
                          tahapNum={suratTugasStageNum}
                          namaDudi={pg.namaDudi}
                          alamatDudi={pg.alamatDudi}
                          namaPemimpinDudi={pg.pemimpinDudi}
                          tanggalPenugasan={tanggalSurat}
                        />
                      </div>
                    );
                  })()}
                </div>
              )
            ) : isMultiCheckedMode ? (
              <div className="w-full max-w-[794px] space-y-3">
                <div className="flex items-center justify-between gap-2 bg-white px-3.5 py-2 rounded-xl border border-slate-200 text-xs no-print">
                  <div className="min-w-0 truncate">
                    <span className="font-bold text-slate-900 tabular-nums">
                      Halaman {Math.min(multiPreviewIdx, checkedItems.length - 1) + 1} /{' '}
                      {checkedItems.length}
                    </span>
                    <span className="text-slate-300 mx-2">·</span>
                    <span className="text-slate-600">
                      {checkedItems[Math.min(multiPreviewIdx, checkedItems.length - 1)].title}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={multiPreviewIdx <= 0}
                      onClick={() => setMultiPreviewIdx((p) => Math.max(0, p - 1))}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={multiPreviewIdx >= checkedItems.length - 1}
                      onClick={() =>
                        setMultiPreviewIdx((p) => Math.min(checkedItems.length - 1, p + 1))
                      }
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div
                  id="doc-hub-print-area"
                  className="bg-white w-full px-8 pb-8 pt-4 sm:px-10 sm:pb-10 sm:pt-5 rounded-xl shadow-md border border-slate-300 font-serif text-slate-900 leading-relaxed text-sm"
                >
                  {activeDocKey !== 'doc_monitoring' && <OfficialSchoolKop0708 variant="school" />}
                  {renderDocumentBody({
                    docKey: activeDocKey,
                    record:
                      checkedItems[Math.min(multiPreviewIdx, checkedItems.length - 1)].raw,
                    activeYear,
                    nomorSurat,
                    tanggalSurat,
                    kepalaSekolah,
                    includeGroupPeers,
                    penempatanList,
                    dudiList,
                    pengajuanList,
                    siswaByNis,
                    suratTugasStageNum,
                  })}
                </div>
              </div>
            ) : !activeRecord ? (
              <div className="bg-white rounded-xl border border-slate-200 p-10 my-auto max-w-md text-center space-y-3">
                <Building2 className="w-10 h-10 text-slate-300 mx-auto" />
                <h4 className="text-sm font-bold text-slate-800">
                  Pilih Data untuk Pratinjau {meta.shortTitle}
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Dokumen ini menarik data langsung dari {meta.sourceLabel} di Cloud Server. Tambahkan data pada modul terkait atau pilih salah satu baris di panel kiri.
                </p>
              </div>
            ) : activeDocKey === 'doc_surat_tugas' ? (
              renderSuratTugasMultiPreview({
                guru: activeRecord as Guru,
                nomorSurat,
                tanggalSurat,
                kepalaSekolah,
                suratTugasStageNum,
                selectedSuratTugasDudi,
                suratTugasAudit,
              })
            ) : (
              <div
                id="doc-hub-print-area"
                className="bg-white w-full max-w-[794px] px-8 pb-8 pt-4 sm:px-10 sm:pb-10 sm:pt-5 rounded-xl shadow-md border border-slate-300 font-serif text-slate-900 leading-relaxed text-sm"
              >
                {activeDocKey !== 'doc_monitoring' && <OfficialSchoolKop0708 variant="school" />}

                {renderDocumentBody({
                  docKey: activeDocKey,
                  record: activeRecord,
                  activeYear,
                  nomorSurat,
                  tanggalSurat,
                  kepalaSekolah,
                  includeGroupPeers,
                  penempatanList,
                  dudiList,
                  pengajuanList,
                  siswaByNis,
                  suratTugasStageNum,
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Top-level Print Portal rendered directly under document.body */}
      {activeDocKey === 'doc_paket_monitoring' && bundlePrintPages.length > 0 && (
        <PrintPortal paperSize={paperSize}>
          {bundlePrintPages.map((page) => (
            <div key={page.id} className="print-sheet text-slate-950">
              {renderBundlePageContent(page)}
            </div>
          ))}
        </PrintPortal>
      )}

      {isMultiCheckedMode && activeDocKey === 'doc_surat_tugas' && batchSuratTugasPages.length > 0 && (
        <PrintPortal paperSize={paperSize}>
          {batchSuratTugasPages.map((pg) => (
            <div key={pg.id} className="print-sheet text-slate-950">
              <SuratTugas0708Sheet
                nomorSurat={nomorSurat}
                tanggalSurat={tanggalSurat}
                kepalaSekolah={kepalaSekolah}
                namaGuru={pg.guru.nama}
                jabatanGuru={pg.guru.peranUtama || 'Guru SMK PGRI 2 Ponorogo'}
                tahapNum={suratTugasStageNum}
                namaDudi={pg.namaDudi}
                alamatDudi={pg.alamatDudi}
                namaPemimpinDudi={pg.pemimpinDudi}
                tanggalPenugasan={tanggalSurat}
              />
            </div>
          ))}
        </PrintPortal>
      )}

      {isMultiCheckedMode &&
        activeDocKey !== 'doc_surat_tugas' &&
        checkedItems.length > 0 && (
          <PrintPortal paperSize={paperSize}>
            {checkedItems.map((it) => (
              <div
                key={`print_batch_${it.id}`}
                className="print-sheet font-serif text-slate-900 leading-relaxed text-sm"
              >
                {activeDocKey !== 'doc_monitoring' && <OfficialSchoolKop0708 variant="school" />}
                {renderDocumentBody({
                  docKey: activeDocKey,
                  record: it.raw,
                  activeYear,
                  nomorSurat,
                  tanggalSurat,
                  kepalaSekolah,
                  includeGroupPeers,
                  penempatanList,
                  dudiList,
                  pengajuanList,
                  siswaByNis,
                  suratTugasStageNum,
                })}
              </div>
            ))}
          </PrintPortal>
        )}

      {!isMultiCheckedMode &&
        activeDocKey === 'doc_surat_tugas' &&
        activeRecord &&
        !suratTugasAudit.isPrintBlocked && (
          <PrintPortal paperSize={paperSize}>
            {(() => {
              const guru = activeRecord as Guru;
              const activeGroups =
                selectedSuratTugasDudi === 'ALL_UNLOCKED'
                  ? suratTugasAudit.unlockedGroups
                  : suratTugasAudit.unlockedGroups.filter(
                      (g) => g.key === selectedSuratTugasDudi
                    );
              if (activeGroups.length === 0) return null;
              return activeGroups.map((grp: any) => (
                <div key={grp.key} className="print-sheet text-slate-950">
                  <SuratTugas0708Sheet
                    nomorSurat={nomorSurat}
                    tanggalSurat={tanggalSurat}
                    kepalaSekolah={kepalaSekolah}
                    namaGuru={guru.nama}
                    jabatanGuru={guru.peranUtama || 'Guru SMK PGRI 2 Ponorogo'}
                    tahapNum={suratTugasStageNum}
                    namaDudi={grp.namaDudi}
                    alamatDudi={grp.alamatDudi}
                    namaPemimpinDudi={grp.pemimpinDudi}
                    tanggalPenugasan={tanggalSurat}
                  />
                </div>
              ));
            })()}
          </PrintPortal>
        )}

      {!isMultiCheckedMode &&
        activeDocKey !== 'doc_paket_monitoring' &&
        activeDocKey !== 'doc_surat_tugas' &&
        activeRecord && (
          <PrintPortal paperSize={paperSize}>
            <div className="print-sheet font-serif text-slate-900 leading-relaxed text-sm">
              {activeDocKey !== 'doc_monitoring' && <OfficialSchoolKop0708 variant="school" />}

              {renderDocumentBody({
                docKey: activeDocKey,
                record: activeRecord,
                activeYear,
                nomorSurat,
                tanggalSurat,
                kepalaSekolah,
                includeGroupPeers,
                penempatanList,
                dudiList,
                pengajuanList,
                siswaByNis,
                suratTugasStageNum,
              })}
            </div>
          </PrintPortal>
        )}

      {/* Modal Popup: Parameter Surat & Cetak */}
      {isParamModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150 no-print"
          onClick={() => setIsParamModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                  <SlidersHorizontal className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-900 truncate">
                    Parameter Surat &amp; Cetak
                  </h3>
                  <p className="text-[11px] text-slate-500 truncate">
                    {meta.label}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsParamModalOpen(false)}
                className="w-8 h-8 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 flex items-center justify-center cursor-pointer"
                aria-label="Tutup modal parameter"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nomor Surat Dinas
                </label>
                <input
                  type="text"
                  value={nomorSurat}
                  onChange={(e) => setNomorSurat(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  Nama Kepala Sekolah / Penandatangan
                </label>
                <input
                  type="text"
                  value={kepalaSekolah}
                  onChange={(e) => setKepalaSekolah(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
              </div>

              {(activeDocKey === 'doc_pengantaran' || activeDocKey === 'doc_penarikan') && (
                <label className="flex items-center gap-2 pt-1 text-xs text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeGroupPeers}
                    onChange={(e) => setIncludeGroupPeers(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>Gabungkan siswa serombongan di DUDI yang sama</span>
                </label>
              )}

              {(activeDocKey === 'doc_surat_tugas' || activeDocKey === 'doc_monitoring') && (
                <div className="pt-3 border-t border-slate-200 space-y-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Tahap Monitoring / Penugasan
                    </label>
                    <select
                      value={suratTugasStageNum}
                      onChange={(e) => setSuratTugasStageNum(Number(e.target.value) || 1)}
                      className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                    >
                      {MONITORING_STAGES.map((st) => (
                        <option key={st.num} value={st.num}>
                          {st.value}
                        </option>
                      ))}
                    </select>
                  </div>

                  {activeDocKey === 'doc_surat_tugas' && suratTugasAudit.dudiGroups.length > 0 && (
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Pilih DUDI Binaan ({suratTugasAudit.unlockedGroups.length}/
                        {suratTugasAudit.dudiGroups.length} Siap)
                      </label>
                      <select
                        value={selectedSuratTugasDudi}
                        onChange={(e) => setSelectedSuratTugasDudi(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                      >
                        <option value="ALL_UNLOCKED">
                          Semua DUDI Siap Cetak ({suratTugasAudit.unlockedGroups.length} DUDI)
                        </option>
                        {suratTugasAudit.dudiGroups.map((grp) => (
                          <option key={grp.key} value={grp.key}>
                            {grp.namaDudi} ({grp.students.length} siswa)
                            {grp.isLocked
                              ? ` — TERKUNCI (Belum Tahap ${suratTugasStageNum - 1})`
                              : ' — Siap Cetak'}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {activeDocKey === 'doc_surat_tugas' &&
                    suratTugasStageNum >= 2 &&
                    suratTugasAudit.lockedGroups.length > 0 && (
                      <div className="p-2.5 rounded-lg border border-amber-200 bg-amber-50 text-[11px] text-amber-900 space-y-1">
                        <div className="font-bold flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>
                            {suratTugasAudit.lockedGroups.length} DUDI Terkunci untuk Tahap{' '}
                            {suratTugasStageNum}
                          </span>
                        </div>
                        <p className="text-amber-800 leading-snug">
                          Hanya DUDI yang belum menyelesaikan{' '}
                          <b>{getStageValueByNumber(suratTugasStageNum - 1)}</b> yang dikunci:{' '}
                          {suratTugasAudit.lockedGroups.map((g) => g.namaDudi).join(', ')}.
                        </p>
                      </div>
                    )}
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsParamModalOpen(false)}
                className="h-9 px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
              >
                Terapkan Parameter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function renderSuratTugasMultiPreview(params: {
  guru: Guru;
  nomorSurat: string;
  tanggalSurat: string;
  kepalaSekolah: string;
  suratTugasStageNum: number;
  selectedSuratTugasDudi: string;
  suratTugasAudit: {
    dudiGroups: any[];
    unlockedGroups: any[];
    lockedGroups: any[];
    isPrintBlocked: boolean;
    blockReason: string;
  };
}) {
  const {
    guru,
    nomorSurat,
    tanggalSurat,
    kepalaSekolah,
    suratTugasStageNum,
    selectedSuratTugasDudi,
    suratTugasAudit,
  } = params;
  const targetStageLabel = getStageValueByNumber(suratTugasStageNum);

  if (suratTugasAudit.isPrintBlocked) {
    return (
      <div className="bg-white w-full max-w-[794px] p-8 rounded-xl border border-slate-300">
        <div className="p-6 rounded-xl border border-rose-200 bg-rose-50 font-sans text-xs text-rose-900 space-y-2.5">
          <div className="flex items-center gap-2 font-bold text-sm text-rose-800">
            <Lock className="w-4 h-4 text-rose-600 shrink-0" />
            <span>Surat Tugas {targetStageLabel} Terkunci</span>
          </div>
          <p className="leading-relaxed">{suratTugasAudit.blockReason}</p>
          <p className="text-rose-700">
            Silakan isi dan simpan tahap sebelumnya pada Portal Supervisi Guru atau pilih DUDI lain yang sudah memenuhi syarat tahap di panel kiri.
          </p>
        </div>
      </div>
    );
  }

  const activeGroups =
    selectedSuratTugasDudi === 'ALL_UNLOCKED'
      ? suratTugasAudit.unlockedGroups
      : suratTugasAudit.unlockedGroups.filter((g) => g.key === selectedSuratTugasDudi);

  if (activeGroups.length === 0) {
    return (
      <div className="bg-white w-full max-w-[794px] p-10 rounded-xl border border-slate-300 text-center text-xs text-slate-500">
        Belum ada penempatan DUDI binaan untuk guru <b>{guru.nama}</b>.
      </div>
    );
  }

  return (
    <div className="w-full max-w-[794px] space-y-5">
      {activeGroups.map((grp: any) => (
        <div
          key={grp.key}
          className="bg-white w-full px-8 pb-8 pt-4 sm:px-10 sm:pb-10 sm:pt-5 rounded-xl shadow-md border border-slate-300 text-slate-950"
        >
          <SuratTugas0708Sheet
            nomorSurat={nomorSurat}
            tanggalSurat={tanggalSurat}
            kepalaSekolah={kepalaSekolah}
            namaGuru={guru.nama}
            jabatanGuru={guru.peranUtama || 'Guru SMK PGRI 2 Ponorogo'}
            tahapNum={suratTugasStageNum}
            namaDudi={grp.namaDudi}
            alamatDudi={grp.alamatDudi}
            namaPemimpinDudi={grp.pemimpinDudi}
            tanggalPenugasan={tanggalSurat}
          />
        </div>
      ))}
    </div>
  );
}

function resolveMapsLink(
  directLink: string | undefined,
  dudiId: string | undefined,
  dudiName: string | undefined,
  dudiList: Dudi[],
  pengajuanList: Pengajuan[]
): string {
  const cleanDirect = String(directLink || '').trim();
  if (cleanDirect && cleanDirect !== '-') return cleanDirect;

  const normName = String(dudiName || '').trim().toLowerCase();
  const matchedDudi = dudiList.find(
    (d) =>
      (dudiId && d.id === dudiId) ||
      (normName && d.namaDudi.trim().toLowerCase() === normName)
  );
  if (matchedDudi?.linkMaps && matchedDudi.linkMaps !== '-') {
    return matchedDudi.linkMaps;
  }

  const matchedReq = pengajuanList.find(
    (p) =>
      ((dudiId && p.dudiTujuan && p.linkMaps) ||
        (normName && p.dudiTujuan.trim().toLowerCase() === normName && p.linkMaps)) &&
      p.linkMaps !== '-'
  );
  return String(matchedReq?.linkMaps || '').trim();
}

function renderDocumentBody(params: {
  docKey: DocumentHubKey;
  record: any;
  activeYear: string;
  nomorSurat: string;
  tanggalSurat: string;
  kepalaSekolah: string;
  includeGroupPeers: boolean;
  penempatanList: PenempatanPKL[];
  dudiList: Dudi[];
  pengajuanList: Pengajuan[];
  siswaByNis: Map<string, Siswa>;
  suratTugasStageNum: number;
}) {
  const {
    docKey,
    record,
    activeYear,
    nomorSurat,
    tanggalSurat,
    kepalaSekolah,
    includeGroupPeers,
    penempatanList,
    dudiList,
    pengajuanList,
    siswaByNis,
    suratTugasStageNum,
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
                <b>{dudi.namaDudi}</b> ({dudi.bidangKeahlian || 'Mitra Industri'}), berkedudukan di {dudi.alamat || '-'}, {dudi.wilayahKota || ''}, dalam hal ini diwakili oleh <b>{dudi.namaPic || 'Pimpinan / HRD'}</b> (Kontak:{' '}
                {getWhatsAppHref(dudi.kontakPic) ? (
                  <a
                    href={getWhatsAppHref(dudi.kontakPic)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-emerald-700 hover:underline print:text-slate-900 print:no-underline"
                  >
                    {formatPhoneDisplay(dudi.kontakPic)}
                  </a>
                ) : (
                  formatPhoneDisplay(dudi.kontakPic)
                )}
                ).
              </td>
            </tr>
          </tbody>
        </table>

        <p className="text-justify text-xs">
          Kedua belah pihak sepakat untuk menjalin kerjasama dalam rangka Penyelenggaraan Praktik Kerja Industri (PKL), penyelarasan kurikulum kejuruan, dan pembinaan kompetensi kerja peserta didik pada Tahun Ajaran <b>{activeYear}</b> dengan kapasitas penempatan hingga <b>{dudi.kuotaMaksimal || '-'} siswa</b>.
        </p>

        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-sans space-y-1 print-avoid-break">
          <div className="font-bold text-slate-800">Ruang Lingkup Kerjasama:</div>
          <ol className="list-decimal list-inside space-y-0.5 text-slate-700">
            <li>Penempatan peserta didik PKL sesuai kompetensi keahlian dan tata tertib K3 industri.</li>
            <li>Bimbingan teknis oleh instruktur industri (DUDI) dan guru pendamping sekolah.</li>
            <li>Penilaian akhir hasil PKL dan penerbitan sertifikat kompetensi industri.</li>
          </ol>
        </div>

        <div className="flex justify-between items-end pt-8 font-sans text-xs print-avoid-break">
          <div className="text-center">
            <div>PIHAK KEDUA,</div>
            <div className="font-semibold">{dudi.namaDudi}</div>
            <div className="h-16" />
            <div className="font-bold underline">{dudi.namaPic || '..........................................'}</div>
            <div className="text-[11px] text-slate-500">Pimpinan / Pembimbing Industri</div>
          </div>
          <div className="text-center">
            <div>PIHAK PERTAMA,</div>
            <div className="font-semibold">Kepala SMK PGRI 2 Ponorogo</div>
            <div className="h-16" />
            <div className="font-bold underline">{kepalaSekolah}</div>
            <div className="text-[11px] text-slate-500">NIP. ..................................</div>
          </div>
        </div>
      </div>
    );
  }

  if (docKey === 'doc_pengajuan') {
    const req = record as Pengajuan;
    const matchedDudi = dudiList.find(
      (d) => d.namaDudi.trim().toLowerCase() === (req.dudiTujuan || '').trim().toLowerCase()
    );
    const mapsUrl = resolveMapsLink(req.linkMaps, matchedDudi?.id, req.dudiTujuan, dudiList, pengajuanList);
    const picDudiName =
      req.namaPemimpin ||
      req.namaPic ||
      matchedDudi?.namaPemimpin ||
      matchedDudi?.namaPic ||
      '..........................................';

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
              <td className="py-1.5 font-mono">: {formatNisVisual(req.nis)}</td>
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
            {mapsUrl && (
              <tr className="border-b border-slate-200">
                <td className="py-1.5 font-bold">Tautan Google Maps</td>
                <td className="py-1.5 font-mono text-[11px] break-all text-blue-800">: {mapsUrl}</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="border border-slate-300 rounded-lg p-3.5 bg-slate-50 font-sans text-xs print-avoid-break">
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

        <div className="flex justify-between items-end gap-4 pt-8 font-sans text-xs print-avoid-break">
          <div className="text-center">
            <div>Mengetahui Tempat PKL,</div>
            <div className="font-semibold">Pimpinan / Pembimbing DUDI</div>
            <div className="h-16" />
            <div className="font-bold underline">{picDudiName}</div>
            <div className="text-[11px] text-slate-500">{req.dudiTujuan}</div>
          </div>

          <QrCodeSvg
            value={mapsUrl}
            size={76}
            label="QR Lokasi Maps"
            emptyText="Link Maps belum diisi"
          />

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

  // doc_pengantaran, doc_monitoring, doc_penarikan
  const penempatan = record as PenempatanPKL;
  const dudiDetail = dudiList.find(
    (d) =>
      d.id === penempatan.idDudi ||
      d.namaDudi.trim().toLowerCase() === (penempatan.namaDudi || '').trim().toLowerCase()
  );
  const groupPeers = includeGroupPeers
    ? penempatanList.filter(
        (p) =>
          p.namaDudi.trim().toLowerCase() === (penempatan.namaDudi || '').trim().toLowerCase() &&
          p.statusPenempatan !== 'Dibatalkan'
      )
    : [penempatan];

  const resolvedDudiMaps = resolveMapsLink(
    dudiDetail?.linkMaps,
    penempatan.idDudi,
    penempatan.namaDudi,
    dudiList,
    pengajuanList
  );
  const resolvedDudiSignName =
    dudiDetail?.namaPic ||
    dudiDetail?.namaPemimpin ||
    '..........................................';

  if (docKey === 'doc_monitoring') {
    const monStudents: BundleStudentItem[] = (groupPeers.length > 0 ? groupPeers : [penempatan]).map(
      (s) => {
        const siswaRec = siswaByNis.get(stripNisSymbols(s.nis));
        return {
          nis: s.nis,
          namaSiswa: s.namaSiswa,
          kelas: siswaRec?.kelas || '-',
          jurusan: siswaRec?.jurusan || dudiDetail?.bidangKeahlian || '-',
        };
      }
    );

    return (
      <LembarMonitoring0701Sheet
        tahapNum={suratTugasStageNum}
        activeYear={activeYear}
        namaBengkel={penempatan.namaDudi}
        alamatBengkel={
          dudiDetail?.alamat
            ? `${dudiDetail.alamat}${dudiDetail.wilayahKota ? `, ${dudiDetail.wilayahKota}` : ''}`
            : '-'
        }
        pemimpinBengkel={dudiDetail?.namaPemimpin || dudiDetail?.namaPic || ''}
        noTelpBengkel={dudiDetail?.noTelpDudi || dudiDetail?.kontakPic || ''}
        students={monStudents}
        namaPetugas={penempatan.guruPendamping || ''}
        tanggalSurat={tanggalSurat}
      />
    );
  }

  if (docKey === 'doc_pengantaran') {
    return (
      <div className="space-y-4">
        <div className="flex justify-between gap-4 font-sans text-xs">
          <div>
            <div>Nomor : {nomorSurat}</div>
            <div>Lamp. : 1 (satu) Berkas</div>
            <div>Perihal : <b>Surat Pengantar &amp; Serah Terima Siswa PKL</b></div>
          </div>
          <div className="shrink-0">Ponorogo, {tanggalSurat}</div>
        </div>

        <div className="font-sans text-xs mt-3">
          Kepada Yth.<br />
          <b>Pimpinan / HRD {penempatan.namaDudi}</b><br />
          {dudiDetail?.alamat ? `${dudiDetail.alamat}, ${dudiDetail.wilayahKota || ''}` : 'Di Tempat'}
        </div>

        <p className="text-justify text-xs">
          Dengan hormat,<br />
          Berdasarkan surat balasan kesediaan tempat PKL Tahun Ajaran {activeYear}, bersama ini kami menyerahkan peserta didik SMK PGRI 2 Ponorogo untuk melaksanakan Praktik Kerja Industri terhitung mulai tanggal <b>{formatIndonesianDate(penempatan.tanggalBerangkat)}</b> s.d. <b>{formatIndonesianDate(penempatan.tanggalRencanaTarik)}</b> di bawah pendampingan <b>{penempatan.guruPendamping || '-'}</b>:
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
                <td className="border border-slate-300 p-1.5 font-mono">{formatNisVisual(s.nis)}</td>
                <td className="border border-slate-300 p-1.5 font-semibold">{s.namaSiswa}</td>
                <td className="border border-slate-300 p-1.5 font-mono">{s.idPenempatan}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="text-justify text-xs">
          Demikian surat pengantaran dan berita acara serah terima ini dibuat untuk dipergunakan sebagaimana mestinya. Atas bimbingan dan kerjasamanya kami ucapkan terima kasih.
        </p>

        <div className="flex justify-between items-end gap-4 pt-8 font-sans text-xs print-avoid-break">
          <div className="text-center">
            <div>Diterima Oleh,</div>
            <div className="font-semibold">Pimpinan / Pembimbing DUDI</div>
            <div className="h-16" />
            <div className="font-bold underline">{resolvedDudiSignName}</div>
            <div className="text-[11px] text-slate-500">{penempatan.namaDudi}</div>
          </div>

          <QrCodeSvg
            value={resolvedDudiMaps}
            size={76}
            label="QR Lokasi Maps"
            emptyText="Link Maps belum diisi"
          />

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

  // doc_penarikan
  return (
    <div className="space-y-4">
      <div className="flex justify-between gap-4 font-sans text-xs">
        <div>
          <div>Nomor : {nomorSurat}</div>
          <div>Lamp. : -</div>
          <div>Perihal : <b>Penarikan Siswa Purnatugas PKL &amp; Ucapan Terima Kasih</b></div>
        </div>
        <div className="shrink-0">Ponorogo, {tanggalSurat}</div>
      </div>

      <div className="font-sans text-xs mt-3">
        Kepada Yth.<br />
        <b>Pimpinan / HRD {penempatan.namaDudi}</b><br />
        {dudiDetail?.alamat ? `${dudiDetail.alamat}, ${dudiDetail.wilayahKota || ''}` : 'Di Tempat'}
      </div>

      <p className="text-justify text-xs">
        Dengan hormat,<br />
        Sehubungan dengan berakhirnya masa pelaksanaan Praktik Kerja Industri (PKL) siswa SMK PGRI 2 Ponorogo Tahun Ajaran {activeYear} (rencana tanggal selesai: <b>{formatIndonesianDate(penempatan.tanggalRencanaTarik, tanggalSurat)}</b>), kami menugaskan <b>{penempatan.guruPendamping || '-'}</b> untuk melakukan penarikan resmi peserta didik berikut:
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
              <td className="border border-slate-300 p-1.5 font-mono">{formatNisVisual(s.nis)}</td>
              <td className="border border-slate-300 p-1.5 font-semibold">{s.namaSiswa}</td>
              <td className="border border-slate-300 p-1.5">
                {formatIndonesianDateRange(s.tanggalBerangkat, s.tanggalRencanaTarik)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-justify text-xs">
        Kami mengucapkan terima kasih sebesar-besarnya atas bimbingan, ilmu, dan kesempatan yang telah diberikan kepada siswa kami. Apabila selama pelaksanaan terdapat kekhilafan dari siswa kami, kami mohon maaf yang sebesar-besarnya.
      </p>

      <div className="flex justify-between items-end gap-4 pt-8 font-sans text-xs print-avoid-break">
        <div className="text-center">
          <div>Diserahkan Kembali Oleh,</div>
          <div className="font-semibold">Pimpinan / Pembimbing DUDI</div>
          <div className="h-16" />
          <div className="font-bold underline">{resolvedDudiSignName}</div>
          <div className="text-[11px] text-slate-500">{penempatan.namaDudi}</div>
        </div>

        <QrCodeSvg
          value={resolvedDudiMaps}
          size={76}
          label="QR Lokasi Maps"
          emptyText="Link Maps belum diisi"
        />

        <div className="text-center">
          <div>Menarik / Mengetahui,</div>
          <div className="font-semibold">Kepala SMK PGRI 2 Ponorogo</div>
          <div className="h-16" />
          <div className="font-bold underline">{kepalaSekolah}</div>
          <div className="text-[11px] text-slate-500">SMK PGRI 2 Ponorogo</div>
        </div>
      </div>
    </div>
  );
}
