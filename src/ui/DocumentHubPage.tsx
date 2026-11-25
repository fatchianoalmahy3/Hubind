import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  Printer,
  ExternalLink,
  RefreshCw,
  Building2,
  AlertCircle,
  Settings2,
  Lock,
  Layers,
  FileDown,
  Loader2,
  SlidersHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  CheckCircle2,
} from 'lucide-react';
import { GoogleSheetClient } from '../core/GoogleSheetClient';
import { PublicPortalClient } from '../core/PublicPortalClient';
import { ToastManager } from '../core/ToastManager';
import {
  getStoredAdminSession,
  type AdminSessionUser,
} from '../core/auth/LocalAccountAuthService';
import { DudiService } from '../services/DudiService';
import { GuruService } from '../services/GuruService';
import { PengajuanService } from '../services/PengajuanService';
import { SiswaPklService } from '../services/SiswaPklService';
import { SiswaService } from '../services/SiswaService';
import { MonitoringService } from '../services/MonitoringService';
import {
  Dudi,
  Guru,
  LogPenerbitanSurat,
  Pengajuan,
  PenempatanPKL,
  Siswa,
  Monitoring,
  UserRole,
} from '../core/types/schema';
import { formatIndonesianDate, getTodayWibIsoDate } from '../core/utils/dateHelpers';
import { getCanonicalNisDigits, normalizeRelationText } from '../core/utils/relationHelpers';
import {
  extractIssuedStageNumber,
  getStageValueByNumber,
  isIssuedLetterStatusActive,
} from '../core/utils/monitoringHelpers';
import { PrintPortal } from './PrintPortal';
import { PreviewZoomMode, ResizablePaperPreview } from './ResizablePaperPreview';
import { AppleConfirmModal } from './AppleConfirmModal';
import { OfficialSchoolKop0708, SuratTugas0708Sheet } from './DocumentPrintTemplates';
import {
  DOC_META,
  extractGoogleDocId,
  type DocumentHubKey,
} from './document-hub/documentHubConfig';
import {
  buildBatchSuratTugasPages,
  buildBundleDudiItems,
  buildBundlePrintPages,
  buildFilteredItems,
  buildFilterMeta,
  buildSuratTugasAudit,
  filterBundleDudiItems,
} from './document-hub/documentDataBuilders';
import {
  BundlePageRenderer,
  DocumentBodyRenderer,
  PreviewPaginationBar,
  SuratTugasMultiPreview,
} from './document-hub/DocumentBodies';
import { DocumentPickerSidebar } from './document-hub/DocumentPickerSidebar';
import { DocumentParametersModal } from './document-hub/DocumentParametersModal';
import { TopProgressBar } from './CrudProgressFeedback';

export type { DocumentHubKey };

interface IssuedTargetDraft {
  dudiId: string;
  namaDudi: string;
  tahap: number;
  jenisDokumen: string;
  nomorSurat: string;
  tanggalTerbit: string;
  guruPendamping: string;
}

interface DocumentHubPageProps {
  activeDocKey: DocumentHubKey;
  onSelectDocKey: (key: DocumentHubKey) => void;
  onOpenTemplateManager?: () => void;
  userRole?: UserRole;
  currentUser?: AdminSessionUser | null;
}

export const DocumentHubPage: React.FC<DocumentHubPageProps> = ({
  activeDocKey,
  onOpenTemplateManager,
  userRole,
  currentUser,
}) => {
  const client = GoogleSheetClient.getInstance();
  const activeYear = client.getActiveYear();
  const templates = client.getTemplates();
  const stageControl = client.getMonitoringStageControl();
  const storedSessionUser = getStoredAdminSession()?.user || null;
  const effectiveRole = userRole || currentUser?.role || storedSessionUser?.role;
  const canManageIssuedStatus = Boolean(
    effectiveRole && ['SuperAdmin', 'Hubin', 'Pokja'].includes(effectiveRole)
  );
  const actorDisplayName =
    currentUser?.name ||
    currentUser?.username ||
    storedSessionUser?.name ||
    storedSessionUser?.username ||
    'Admin Hubin';

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
  const [jurusanFilter, setJurusanFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>(() =>
    activeDocKey === 'doc_paket_monitoring' ? 'SIAP' : 'ALL'
  );
  const [subFilter, setSubFilter] = useState<string>('ALL');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isMobilePickerModalOpen, setIsMobilePickerModalOpen] = useState<boolean>(false);
  const [paperSize, setPaperSize] = useState<'A4' | 'F4'>('A4');
  const [previewZoomMode, setPreviewZoomMode] = useState<PreviewZoomMode>('auto');
  const [nomorSurat, setNomorSurat] = useState(DOC_META[activeDocKey].defaultNoSurat);
  const [tanggalSurat, setTanggalSurat] = useState(() =>
    formatIndonesianDate(getTodayWibIsoDate())
  );
  const [kepalaSekolah, setKepalaSekolah] = useState(() => {
    try {
      return localStorage.getItem('hubin_kepala_sekolah') || '';
    } catch {
      return '';
    }
  });
  const [syncingKepalaSekolah, setSyncingKepalaSekolah] = useState(false);
  const [cloudKepalaSekolah, setCloudKepalaSekolah] = useState('');
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
  const [issuedLetters, setIssuedLetters] = useState<LogPenerbitanSurat[]>([]);
  const [issuingBusy, setIssuingBusy] = useState<boolean>(false);
  const [pendingIssueTargets, setPendingIssueTargets] = useState<IssuedTargetDraft[] | null>(null);
  const [pendingRevokeTargets, setPendingRevokeTargets] = useState<IssuedTargetDraft[] | null>(null);

  const meta = DOC_META[activeDocKey];
  const templateConfig = templates.find((t) => t.id === activeDocKey);

  const refreshIssuedLetters = async (forceRefresh = false) => {
    const rows = await PublicPortalClient.getIssuedLetters(forceRefresh).catch(
      () => [] as LogPenerbitanSurat[]
    );
    setIssuedLetters(rows);
  };

  const loadDataForDoc = async (forceReload = false) => {
    setLoading(true);
    setError(null);
    void refreshIssuedLetters(forceReload);
    try {
      const bootstrapped = forceReload
        ? await client.bootstrapAdminTables(true).catch(() => false)
        : false;
      const shouldFallbackReload = forceReload && !bootstrapped;

      if (activeDocKey === 'doc_mou') {
        const svc = DudiService.getInstance();
        if (shouldFallbackReload) await svc.reloadFromSpreadsheet();
        const rows = await svc.getAll();
        setDudiList(rows);
        setSelectedId((prev) => (rows.some((r) => r.id === prev) ? prev : rows[0]?.id || ''));
      } else if (activeDocKey === 'doc_surat_tugas' || activeDocKey === 'doc_paket_monitoring') {
        const gSvc = GuruService.getInstance();
        const pSvc = SiswaPklService.getInstance();
        const mSvc = MonitoringService.getInstance();
        const dSvc = DudiService.getInstance();
        const sSvc = SiswaService.getInstance();
        if (shouldFallbackReload) {
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
        const sSvc = SiswaService.getInstance();
        if (shouldFallbackReload) {
          await Promise.all([
            svc.reloadFromSpreadsheet(),
            dSvc.reloadFromSpreadsheet(),
            sSvc.reloadFromSpreadsheet(),
          ]);
        }
        const [rows, dRows, sRows] = await Promise.all([
          svc.getAll(),
          dSvc.getAll().catch(() => []),
          sSvc.getAll().catch(() => []),
        ]);
        setPengajuanList(rows);
        setDudiList(dRows);
        setSiswaList(sRows);
        setSelectedId((prev) => (rows.some((r) => r.id === prev) ? prev : rows[0]?.id || ''));
      } else {
        const gSvc = GuruService.getInstance();
        const pSvc = SiswaPklService.getInstance();
        const dSvc = DudiService.getInstance();
        const mSvc = MonitoringService.getInstance();
        const reqSvc = PengajuanService.getInstance();
        const sSvc = SiswaService.getInstance();
        if (shouldFallbackReload) {
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
    setJurusanFilter('ALL');
    setStatusFilter(activeDocKey === 'doc_paket_monitoring' ? 'SIAP' : 'ALL');
    setSubFilter('ALL');
    setIsMobilePickerModalOpen(false);
    setSelectedSuratTugasDudi('ALL_UNLOCKED');
    setGeneratedBundlePdf(null);
    loadDataForDoc(false);
  }, [activeDocKey]);

  useEffect(() => {
    if (activeDocKey === 'doc_surat_tugas') {
      setSelectedSuratTugasDudi('ALL_UNLOCKED');
    }
  }, [activeDocKey, selectedId]);

  useEffect(() => {
    let cancelled = false;
    PublicPortalClient.getDocumentSigners()
      .then((res) => {
        if (cancelled || !res?.kepalaSekolah) return;
        const cloudName = res.kepalaSekolah.trim();
        setCloudKepalaSekolah(cloudName);
        setKepalaSekolah((prev) => {
          if (prev.trim()) return prev;
          try {
            localStorage.setItem('hubin_kepala_sekolah', cloudName);
          } catch {
            // ignore
          }
          return cloudName;
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveKepalaSekolahToCloud = async () => {
    const clean = kepalaSekolah.trim();
    try {
      localStorage.setItem('hubin_kepala_sekolah', clean);
    } catch {
      // ignore
    }
    if (!clean || clean === cloudKepalaSekolah) return;
    setSyncingKepalaSekolah(true);
    try {
      const res = await PublicPortalClient.saveDocumentSignerKepalaSekolah(clean);
      if (res.success) {
        setCloudKepalaSekolah(res.kepalaSekolah);
      }
    } catch {
      // Tetap tersimpan di localStorage bila fallback offline/tidak diizinkan
    } finally {
      setSyncingKepalaSekolah(false);
    }
  };

  const handleChangeBundleStage = (nextStage: number) => {
    setBundleStageNum(nextStage);
    setBundleIncludeSt(true);
    setBundleIncludeMon(true);
    setBundleIncludeNilai(nextStage >= 5);
    setGeneratedBundlePdf(null);
    setBundlePreviewIdx(0);
  };

  const resetAllFilters = () => {
    setSearchQuery('');
    setJurusanFilter('ALL');
    setStatusFilter(activeDocKey === 'doc_paket_monitoring' ? 'SIAP' : 'ALL');
    setSubFilter('ALL');
    setGuruFilter('ALL');
    setBundleGuruFilter('ALL');
    setMultiPreviewIdx(0);
  };

  const siswaByNis = useMemo(() => {
    const map = new Map<string, Siswa>();
    for (const s of siswaList) {
      const d = getCanonicalNisDigits(s.nis);
      if (d) map.set(d, s);
    }
    return map;
  }, [siswaList]);

  const deferredSearchQuery = useDeferredValue(searchQuery);

  const allBundleDudiItems = useMemo(
    () =>
      buildBundleDudiItems({
        activeDocKey,
        penempatanList,
        guruList,
        dudiList,
        monitoringList,
        siswaByNis,
        bundleGuruFilter,
        jurusanFilter,
        statusFilter,
        bundleStageNum,
        requireSequential: stageControl.requireSequential,
      }),
    [
      activeDocKey,
      penempatanList,
      guruList,
      dudiList,
      monitoringList,
      siswaByNis,
      bundleGuruFilter,
      jurusanFilter,
      statusFilter,
      bundleStageNum,
      stageControl.requireSequential,
    ]
  );

  const bundleDudiItems = useMemo(
    () => filterBundleDudiItems(allBundleDudiItems, deferredSearchQuery),
    [allBundleDudiItems, deferredSearchQuery]
  );

  useEffect(() => {
    if (activeDocKey !== 'doc_paket_monitoring') return;
    const nextMap: Record<string, boolean> = {};
    for (const item of allBundleDudiItems) {
      nextMap[item.bundleKey] = !item.isLocked;
    }
    setCheckedBundleKeys(nextMap);
    setBundlePreviewIdx(0);
  }, [
    activeDocKey,
    allBundleDudiItems,
  ]);

  const selectedBundles = useMemo(
    () => bundleDudiItems.filter((item) => !item.isLocked && checkedBundleKeys[item.bundleKey]),
    [bundleDudiItems, checkedBundleKeys]
  );

  const bundlePrintPages = useMemo(
    () =>
      buildBundlePrintPages({
        activeDocKey,
        selectedBundles,
        bundleIncludeSt,
        bundleIncludeMon,
        bundleIncludeNilai,
      }),
    [activeDocKey, selectedBundles, bundleIncludeSt, bundleIncludeMon, bundleIncludeNilai]
  );

  const filterMeta = useMemo(
    () =>
      buildFilterMeta({
        activeDocKey,
        dudiList,
        pengajuanList,
        penempatanList,
        siswaByNis,
        guruList,
      }),
    [activeDocKey, dudiList, pengajuanList, penempatanList, siswaByNis, guruList]
  );

  const filteredItems = useMemo(
    () =>
      buildFilteredItems({
        activeDocKey,
        searchQuery: deferredSearchQuery,
        guruFilter,
        jurusanFilter,
        statusFilter,
        subFilter,
        guruList,
        dudiList,
        pengajuanList,
        penempatanList,
        siswaByNis,
      }),
    [
      activeDocKey,
      deferredSearchQuery,
      guruFilter,
      jurusanFilter,
      statusFilter,
      subFilter,
      guruList,
      dudiList,
      pengajuanList,
      penempatanList,
      siswaByNis,
    ]
  );

  const activeItem = useMemo(
    () => filteredItems.find((i) => i.id === selectedId) || filteredItems[0] || null,
    [filteredItems, selectedId]
  );

  const activeRecord = activeItem?.raw || null;

  const checkedItems = useMemo(
    () => filteredItems.filter((item) => Boolean(checkedItemIds[item.id])),
    [filteredItems, checkedItemIds]
  );

  const isMultiCheckedMode = activeDocKey !== 'doc_paket_monitoring' && checkedItems.length > 0;

  const suratTugasAudit = useMemo(
    () =>
      buildSuratTugasAudit({
        activeDocKey,
        activeRecord,
        penempatanList,
        dudiList,
        monitoringList,
        siswaByNis,
        suratTugasStageNum,
        selectedSuratTugasDudi,
        requireSequential: stageControl.requireSequential,
      }),
    [
      activeDocKey,
      activeRecord,
      penempatanList,
      dudiList,
      monitoringList,
      siswaByNis,
      suratTugasStageNum,
      selectedSuratTugasDudi,
      stageControl.requireSequential,
    ]
  );

  const batchSuratTugasPages = useMemo(
    () =>
      buildBatchSuratTugasPages({
        activeDocKey,
        isMultiCheckedMode,
        checkedItems,
        penempatanList,
        monitoringList,
        dudiList,
        siswaByNis,
        suratTugasStageNum,
        requireSequential: stageControl.requireSequential,
      }),
    [
      activeDocKey,
      isMultiCheckedMode,
      checkedItems,
      penempatanList,
      monitoringList,
      dudiList,
      siswaByNis,
      suratTugasStageNum,
      stageControl.requireSequential,
    ]
  );

  const activeIssuedByKey = useMemo(() => {
    const latest = new Map<string, LogPenerbitanSurat>();
    for (const row of issuedLetters) {
      const tahapNum =
        extractIssuedStageNumber(row.tahap) || extractIssuedStageNumber(row.namaTahap);
      if (tahapNum < 1 || tahapNum > 8) continue;
      const cleanId = String(row.idDudi || '').trim().toLowerCase();
      const cleanName = normalizeRelationText(row.namaDudi);
      if (cleanId) latest.set(`${tahapNum}::id:${cleanId}`, row);
      if (cleanName) latest.set(`${tahapNum}::name:${cleanName}`, row);
    }
    return latest;
  }, [issuedLetters]);

  const findActiveIssuedRecord = (
    dudiId: string | undefined,
    namaDudi: string,
    tahap: number
  ): LogPenerbitanSurat | undefined => {
    const cleanId = String(dudiId || '').trim().toLowerCase();
    const cleanName = normalizeRelationText(namaDudi);
    const row =
      (cleanId ? activeIssuedByKey.get(`${tahap}::id:${cleanId}`) : undefined) ||
      (cleanName ? activeIssuedByKey.get(`${tahap}::name:${cleanName}`) : undefined);
    if (!row || !isIssuedLetterStatusActive(row.statusTerbit)) return undefined;
    return row;
  };

  const isTargetIssued = (dudiId: string | undefined, namaDudi: string, tahap: number) =>
    Boolean(findActiveIssuedRecord(dudiId, namaDudi, tahap));

  const resolveDudiIdForTarget = (rawId?: string, rawName?: string): string => {
    const cleanId = String(rawId || '').trim();
    if (cleanId) return cleanId;
    const normName = normalizeRelationText(rawName);
    if (!normName) return '';
    return dudiList.find((d) => normalizeRelationText(d.namaDudi) === normName)?.id || '';
  };

  const currentSupervisionTargets = useMemo<IssuedTargetDraft[]>(() => {
    const todayIso = getTodayWibIsoDate();
    const rawTargets: IssuedTargetDraft[] = [];

    if (activeDocKey === 'doc_paket_monitoring') {
      selectedBundles.forEach((b) => {
        rawTargets.push({
          dudiId: resolveDudiIdForTarget(b.dudiId, b.namaDudi),
          namaDudi: b.namaDudi,
          tahap: bundleStageNum,
          jenisDokumen: 'Paket Cetak Monitoring',
          nomorSurat,
          tanggalTerbit: todayIso,
          guruPendamping: b.guruNama || '',
        });
      });
    } else if (activeDocKey === 'doc_surat_tugas') {
      if (isMultiCheckedMode) {
        batchSuratTugasPages.forEach((pg) => {
          rawTargets.push({
            dudiId: resolveDudiIdForTarget(pg.dudiId, pg.namaDudi),
            namaDudi: pg.namaDudi,
            tahap: suratTugasStageNum,
            jenisDokumen: 'Surat Tugas 07.08',
            nomorSurat,
            tanggalTerbit: todayIso,
            guruPendamping: pg.guru.nama || '',
          });
        });
      } else if (activeRecord && !suratTugasAudit.isPrintBlocked) {
        const guru = activeRecord as Guru;
        const activeGroups =
          selectedSuratTugasDudi === 'ALL_UNLOCKED'
            ? suratTugasAudit.unlockedGroups
            : suratTugasAudit.unlockedGroups.filter((g) => g.key === selectedSuratTugasDudi);
        activeGroups.forEach((grp) => {
          rawTargets.push({
            dudiId: resolveDudiIdForTarget(grp.dudiId, grp.namaDudi),
            namaDudi: grp.namaDudi,
            tahap: suratTugasStageNum,
            jenisDokumen: 'Surat Tugas 07.08',
            nomorSurat,
            tanggalTerbit: todayIso,
            guruPendamping: guru.nama || '',
          });
        });
      }
    } else if (
      activeDocKey === 'doc_monitoring' ||
      activeDocKey === 'doc_pengantaran' ||
      activeDocKey === 'doc_penarikan'
    ) {
      const targetTahap =
        activeDocKey === 'doc_pengantaran'
          ? 1
          : activeDocKey === 'doc_penarikan'
          ? 8
          : suratTugasStageNum;
      const jenisLabel =
        activeDocKey === 'doc_pengantaran'
          ? 'Surat Pengantaran'
          : activeDocKey === 'doc_penarikan'
          ? 'Surat Penarikan'
          : 'Lembar Monitoring 07.01';
      const items = isMultiCheckedMode ? checkedItems : activeItem ? [activeItem] : [];
      items.forEach((it) => {
        const rawPlacement = it.raw as PenempatanPKL | undefined;
        rawTargets.push({
          dudiId: resolveDudiIdForTarget(it.dudiId || rawPlacement?.idDudi, it.title),
          namaDudi: it.title,
          tahap: targetTahap,
          jenisDokumen: jenisLabel,
          nomorSurat,
          tanggalTerbit: todayIso,
          guruPendamping: rawPlacement?.guruPendamping || '',
        });
      });
    }

    const deduped = new Map<string, IssuedTargetDraft>();
    for (const t of rawTargets) {
      if (!t.namaDudi && !t.dudiId) continue;
      const dKey = (t.dudiId || normalizeRelationText(t.namaDudi)).toLowerCase();
      const mapKey = `${t.tahap}::${dKey}`;
      if (!deduped.has(mapKey)) {
        deduped.set(mapKey, t);
      }
    }
    return Array.from(deduped.values());
  }, [
    activeDocKey,
    selectedBundles,
    bundleStageNum,
    isMultiCheckedMode,
    batchSuratTugasPages,
    suratTugasStageNum,
    activeRecord,
    suratTugasAudit.isPrintBlocked,
    suratTugasAudit.unlockedGroups,
    selectedSuratTugasDudi,
    checkedItems,
    activeItem,
    nomorSurat,
    dudiList,
  ]);

  const unissuedCurrentTargets = useMemo(
    () =>
      currentSupervisionTargets.filter(
        (t) => !findActiveIssuedRecord(t.dudiId, t.namaDudi, t.tahap)
      ),
    [currentSupervisionTargets, activeIssuedByKey]
  );

  const allCurrentTargetsIssued =
    currentSupervisionTargets.length > 0 && unissuedCurrentTargets.length === 0;

  const stTemplateId = extractGoogleDocId(templates.find((t) => t.id === 'doc_surat_tugas')?.url);
  const monTemplateId = extractGoogleDocId(templates.find((t) => t.id === 'doc_monitoring')?.url);
  const nilaiTemplateId = extractGoogleDocId(templates.find((t) => t.id === 'doc_nilai')?.url);

  const missingBundleTemplates: string[] = [];
  if (bundleIncludeSt && !stTemplateId) missingBundleTemplates.push('Surat Tugas');
  if (bundleIncludeMon && !monTemplateId) missingBundleTemplates.push('Lembar Monitoring');
  if (bundleIncludeNilai && !nilaiTemplateId) missingBundleTemplates.push('Lembar Penilaian PKL');

  const promptIssueAfterPrint = () => {
    if (canManageIssuedStatus && unissuedCurrentTargets.length > 0) {
      setPendingIssueTargets(unissuedCurrentTargets);
    }
  };

  const handleConfirmMarkIssued = async (targets: IssuedTargetDraft[]) => {
    if (!targets.length || issuingBusy) return;
    setIssuingBusy(true);
    try {
      const res = await PublicPortalClient.markIssuedLetters(
        targets.map((t) => ({
          ...t,
          diterbitkanOleh: actorDisplayName,
        }))
      );
      await refreshIssuedLetters(true);
      setPendingIssueTargets(null);
      ToastManager.getInstance().show(
        'Status Surat Terbit Disimpan',
        'success',
        `${res.count} DUDI (${targets
          .map((t) => `Tahap ${t.tahap}`)
          .filter((v, i, a) => a.indexOf(v) === i)
          .join(', ')}) telah ditandai Sudah Terbit untuk Portal Monitoring.`
      );
    } catch (err: any) {
      ToastManager.getInstance().show(
        'Gagal Menandai Surat Terbit',
        'error',
        err?.message || 'Terjadi kesalahan saat menyimpan status terbit ke Cloud Server.'
      );
    } finally {
      setIssuingBusy(false);
    }
  };

  const handleConfirmRevokeIssued = async (targets: IssuedTargetDraft[]) => {
    if (!targets.length || issuingBusy) return;
    setIssuingBusy(true);
    try {
      for (const t of targets) {
        const existing = findActiveIssuedRecord(t.dudiId, t.namaDudi, t.tahap);
        await PublicPortalClient.revokeIssuedLetter({
          idTerbit: existing?.idTerbit || existing?.id,
          dudiId: t.dudiId,
          namaDudi: t.namaDudi,
          tahap: t.tahap,
          actorName: actorDisplayName,
        });
      }
      await refreshIssuedLetters(true);
      setPendingRevokeTargets(null);
      ToastManager.getInstance().show(
        'Status Terbit Dibatalkan',
        'info',
        `Status penerbitan surat untuk ${targets.length} DUDI telah dibatalkan.`
      );
    } catch (err: any) {
      ToastManager.getInstance().show(
        'Gagal Membatalkan Status Terbit',
        'error',
        err?.message || 'Terjadi kesalahan saat memperbarui status penerbitan surat.'
      );
    } finally {
      setIssuingBusy(false);
    }
  };

  const handlePrint = () => {
    if (activeDocKey === 'doc_paket_monitoring') {
      if (bundlePrintPages.length === 0) return;
      window.print();
      promptIssueAfterPrint();
      return;
    }
    if (isMultiCheckedMode) {
      if (activeDocKey === 'doc_surat_tugas') {
        if (batchSuratTugasPages.length === 0) return;
        window.print();
        promptIssueAfterPrint();
        return;
      }
      if (checkedItems.length === 0) return;
      window.print();
      promptIssueAfterPrint();
      return;
    }
    if (!activeRecord || suratTugasAudit.isPrintBlocked) return;
    window.print();
    promptIssueAfterPrint();
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
          dudiId: b.dudiId,
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
      void refreshIssuedLetters(true);
    } catch {
      // ToastManager shows clear message
    } finally {
      setGeneratingDocsPdf(false);
    }
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
        <div className="flex flex-col gap-2.5 pb-3 border-b border-slate-200">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shrink-0">
              <meta.icon className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
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

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed((prev) => !prev)}
              className="h-9 hidden lg:inline-flex items-center justify-center gap-1.5 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              title={
                isSidebarCollapsed
                  ? 'Tampilkan panel pilih data'
                  : 'Sembunyikan panel agar pratinjau penuh'
              }
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
                className="h-9 inline-flex items-center justify-center gap-1.5 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors whitespace-nowrap"
              >
                <ExternalLink className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Master Docs</span>
              </a>
            ) : (
              onOpenTemplateManager && (
                <button
                  type="button"
                  onClick={onOpenTemplateManager}
                  className="h-9 inline-flex items-center justify-center gap-1.5 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Settings2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Atur Template</span>
                </button>
              )
            )}

            <button
              type="button"
              onClick={() => setIsParamModalOpen(true)}
              className="h-9 inline-flex items-center justify-center gap-1.5 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              title="Ubah Nomor Surat, Tanggal, Ukuran Kertas, Penandatangan & Tahap"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>Parameter Surat &amp; Cetak</span>
            </button>

            <button
              type="button"
              onClick={() => loadDataForDoc(true)}
              disabled={loading}
              className="h-9 inline-flex items-center justify-center gap-1.5 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
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
                disabled={
                  selectedBundles.length === 0 ||
                  (!bundleIncludeSt && !bundleIncludeMon && !bundleIncludeNilai) ||
                  generatingDocsPdf ||
                  missingBundleTemplates.length > 0
                }
                title={
                  missingBundleTemplates.length > 0
                    ? `Pasang template Google Docs dahulu untuk: ${missingBundleTemplates.join(', ')}`
                    : 'Buat 1 file PDF di Google Drive memakai Master Template Google Docs'
                }
                className="h-9 inline-flex items-center justify-center gap-1.5 px-3.5 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {generatingDocsPdf ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                ) : (
                  <FileDown className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>{generatingDocsPdf ? 'Memproses...' : 'PDF Drive'}</span>
              </button>
            )}

            {canManageIssuedStatus && currentSupervisionTargets.length > 0 && (
              allCurrentTargetsIssued ? (
                <button
                  type="button"
                  disabled={issuingBusy}
                  onClick={() => setPendingRevokeTargets(currentSupervisionTargets)}
                  title="Surat DUDI & tahap ini sudah ditandai Terbit. Klik untuk membatalkan status terbit."
                  className="h-9 inline-flex items-center justify-center gap-1.5 px-3.5 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-rose-50 hover:border-rose-300 text-emerald-800 hover:text-rose-700 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Terbit ✓ · Batalkan</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={issuingBusy}
                  onClick={() => setPendingIssueTargets(unissuedCurrentTargets)}
                  title="Tandai surat DUDI & tahap terpilih sudah diterbitkan agar Portal Monitoring guru terbuka"
                  className="h-9 inline-flex items-center justify-center gap-1.5 px-3.5 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  {issuingBusy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>
                    Tandai Terbit
                    {unissuedCurrentTargets.length > 1
                      ? ` (${unissuedCurrentTargets.length})`
                      : ''}
                  </span>
                </button>
              )
            )}

            <button
              type="button"
              onClick={handlePrint}
              disabled={!canPrintNow}
              title={
                activeDocKey === 'doc_surat_tugas' &&
                !isMultiCheckedMode &&
                suratTugasAudit.isPrintBlocked
                  ? suratTugasAudit.blockReason
                  : `Cetak dokumen (${paperSize})`
              }
              className="h-9 inline-flex items-center justify-center gap-1.5 px-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap tabular-nums"
            >
              {activeDocKey === 'doc_surat_tugas' &&
              !isMultiCheckedMode &&
              suratTugasAudit.isPrintBlocked ? (
                <Lock className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Printer className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>
                {activeDocKey === 'doc_surat_tugas' &&
                !isMultiCheckedMode &&
                suratTugasAudit.isPrintBlocked
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

      <TopProgressBar
        active={loading || issuingBusy || generatingDocsPdf}
        label="Memproses dokumen dengan Cloud Server"
        className="rounded-full no-print"
      />

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2 no-print">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Workspace Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <DocumentPickerSidebar
          activeDocKey={activeDocKey}
          meta={meta}
          loading={loading}
          isSidebarCollapsed={isSidebarCollapsed}
          isMobilePickerModalOpen={isMobilePickerModalOpen}
          paperSize={paperSize}
          nomorSurat={nomorSurat}
          searchQuery={searchQuery}
          guruFilter={guruFilter}
          jurusanFilter={jurusanFilter}
          statusFilter={statusFilter}
          subFilter={subFilter}
          guruList={guruList}
          filterMeta={filterMeta}
          filteredItems={filteredItems}
          activeItem={activeItem}
          checkedItemIds={checkedItemIds}
          checkedItems={checkedItems}
          isMultiCheckedMode={isMultiCheckedMode}
          batchSuratTugasPages={batchSuratTugasPages}
          bundleStageNum={bundleStageNum}
          suratTugasStageNum={suratTugasStageNum}
          bundleGuruFilter={bundleGuruFilter}
          bundleIncludeSt={bundleIncludeSt}
          bundleIncludeMon={bundleIncludeMon}
          bundleIncludeNilai={bundleIncludeNilai}
          bundleDudiItems={bundleDudiItems}
          selectedBundles={selectedBundles}
          checkedBundleKeys={checkedBundleKeys}
          bundlePrintPages={bundlePrintPages}
          missingBundleTemplates={missingBundleTemplates}
          generatedBundlePdf={generatedBundlePdf}
          isTargetIssued={isTargetIssued}
          onChangeSearchQuery={setSearchQuery}
          onChangeGuruFilter={setGuruFilter}
          onChangeJurusanFilter={setJurusanFilter}
          onChangeStatusFilter={setStatusFilter}
          onChangeSubFilter={setSubFilter}
          onChangeBundleStage={handleChangeBundleStage}
          onChangeBundleGuruFilter={setBundleGuruFilter}
          onChangeBundleIncludeSt={setBundleIncludeSt}
          onChangeBundleIncludeMon={setBundleIncludeMon}
          onChangeBundleIncludeNilai={setBundleIncludeNilai}
          onSetCheckedBundleKeys={setCheckedBundleKeys}
          onSetCheckedItemIds={setCheckedItemIds}
          onSelectId={setSelectedId}
          onChangeMultiPreviewIdx={setMultiPreviewIdx}
          onOpenParamModal={() => setIsParamModalOpen(true)}
          onOpenMobilePickerModal={() => setIsMobilePickerModalOpen(true)}
          onCloseMobilePickerModal={() => setIsMobilePickerModalOpen(false)}
          onResetAllFilters={resetAllFilters}
        />

        {/* Right: Document Paper Preview */}
        <div className={isSidebarCollapsed ? 'lg:col-span-12' : 'lg:col-span-8'}>
          <div className="bg-slate-200/70 rounded-2xl p-3 sm:p-5 border border-slate-200/80 flex flex-col items-center min-h-[600px]">
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
                <ResizablePaperPreview
                  paperSize={paperSize}
                  zoomMode={previewZoomMode}
                  onChangeZoomMode={setPreviewZoomMode}
                  topSlot={
                    <PreviewPaginationBar
                      currentIdx={bundlePreviewIdx}
                      total={bundlePrintPages.length}
                      subtitle={
                        bundlePrintPages[Math.min(bundlePreviewIdx, bundlePrintPages.length - 1)]
                          .subtitle
                      }
                      onPrev={() => setBundlePreviewIdx((p) => Math.max(0, p - 1))}
                      onNext={() =>
                        setBundlePreviewIdx((p) => Math.min(bundlePrintPages.length - 1, p + 1))
                      }
                    />
                  }
                >
                  <BundlePageRenderer
                    page={bundlePrintPages[Math.min(bundlePreviewIdx, bundlePrintPages.length - 1)]}
                    nomorSurat={nomorSurat}
                    tanggalSurat={tanggalSurat}
                    kepalaSekolah={kepalaSekolah}
                    bundleStageNum={bundleStageNum}
                    activeYear={activeYear}
                  />
                </ResizablePaperPreview>
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
                <ResizablePaperPreview
                  paperSize={paperSize}
                  zoomMode={previewZoomMode}
                  onChangeZoomMode={setPreviewZoomMode}
                  topSlot={
                    <PreviewPaginationBar
                      currentIdx={multiPreviewIdx}
                      total={batchSuratTugasPages.length}
                      subtitle={
                        batchSuratTugasPages[
                          Math.min(multiPreviewIdx, batchSuratTugasPages.length - 1)
                        ].subtitle
                      }
                      onPrev={() => setMultiPreviewIdx((p) => Math.max(0, p - 1))}
                      onNext={() =>
                        setMultiPreviewIdx((p) =>
                          Math.min(batchSuratTugasPages.length - 1, p + 1)
                        )
                      }
                    />
                  }
                >
                  {(() => {
                    const pg =
                      batchSuratTugasPages[
                        Math.min(multiPreviewIdx, batchSuratTugasPages.length - 1)
                      ];
                    return (
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
                    );
                  })()}
                </ResizablePaperPreview>
              )
            ) : isMultiCheckedMode ? (
              <ResizablePaperPreview
                paperSize={paperSize}
                zoomMode={previewZoomMode}
                onChangeZoomMode={setPreviewZoomMode}
                sheetId="doc-hub-print-area"
                sheetClassName="font-serif leading-[1.35] text-[12pt]"
                topSlot={
                  <PreviewPaginationBar
                    currentIdx={multiPreviewIdx}
                    total={checkedItems.length}
                    subtitle={
                      checkedItems[Math.min(multiPreviewIdx, checkedItems.length - 1)].title
                    }
                    onPrev={() => setMultiPreviewIdx((p) => Math.max(0, p - 1))}
                    onNext={() =>
                      setMultiPreviewIdx((p) => Math.min(checkedItems.length - 1, p + 1))
                    }
                  />
                }
              >
                {activeDocKey !== 'doc_monitoring' && <OfficialSchoolKop0708 variant="school" />}
                <DocumentBodyRenderer
                  docKey={activeDocKey}
                  record={checkedItems[Math.min(multiPreviewIdx, checkedItems.length - 1)].raw}
                  activeYear={activeYear}
                  nomorSurat={nomorSurat}
                  tanggalSurat={tanggalSurat}
                  kepalaSekolah={kepalaSekolah}
                  includeGroupPeers={includeGroupPeers}
                  penempatanList={penempatanList}
                  dudiList={dudiList}
                  pengajuanList={pengajuanList}
                  monitoringList={monitoringList}
                  siswaByNis={siswaByNis}
                  suratTugasStageNum={suratTugasStageNum}
                />
              </ResizablePaperPreview>
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
              <SuratTugasMultiPreview
                guru={activeRecord as Guru}
                nomorSurat={nomorSurat}
                tanggalSurat={tanggalSurat}
                kepalaSekolah={kepalaSekolah}
                suratTugasStageNum={suratTugasStageNum}
                selectedSuratTugasDudi={selectedSuratTugasDudi}
                suratTugasAudit={suratTugasAudit}
                paperSize={paperSize}
                zoomMode={previewZoomMode}
                onChangeZoomMode={setPreviewZoomMode}
              />
            ) : (
              <ResizablePaperPreview
                paperSize={paperSize}
                zoomMode={previewZoomMode}
                onChangeZoomMode={setPreviewZoomMode}
                sheetId="doc-hub-print-area"
                sheetClassName="font-serif leading-[1.35] text-[12pt]"
              >
                {activeDocKey !== 'doc_monitoring' && <OfficialSchoolKop0708 variant="school" />}
                <DocumentBodyRenderer
                  docKey={activeDocKey}
                  record={activeRecord}
                  activeYear={activeYear}
                  nomorSurat={nomorSurat}
                  tanggalSurat={tanggalSurat}
                  kepalaSekolah={kepalaSekolah}
                  includeGroupPeers={includeGroupPeers}
                  penempatanList={penempatanList}
                  dudiList={dudiList}
                  pengajuanList={pengajuanList}
                  monitoringList={monitoringList}
                  siswaByNis={siswaByNis}
                  suratTugasStageNum={suratTugasStageNum}
                />
              </ResizablePaperPreview>
            )}
          </div>
        </div>
      </div>

      {/* Top-level Print Portal rendered directly under document.body */}
      {activeDocKey === 'doc_paket_monitoring' && bundlePrintPages.length > 0 && (
        <PrintPortal paperSize={paperSize}>
          {bundlePrintPages.map((page) => (
            <div key={page.id} className="print-sheet text-slate-950">
              <BundlePageRenderer
                page={page}
                nomorSurat={nomorSurat}
                tanggalSurat={tanggalSurat}
                kepalaSekolah={kepalaSekolah}
                bundleStageNum={bundleStageNum}
                activeYear={activeYear}
              />
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
                className="print-sheet font-serif text-slate-950 leading-[1.35] text-[12pt]"
              >
                {activeDocKey !== 'doc_monitoring' && <OfficialSchoolKop0708 variant="school" />}
                <DocumentBodyRenderer
                  docKey={activeDocKey}
                  record={it.raw}
                  activeYear={activeYear}
                  nomorSurat={nomorSurat}
                  tanggalSurat={tanggalSurat}
                  kepalaSekolah={kepalaSekolah}
                  includeGroupPeers={includeGroupPeers}
                  penempatanList={penempatanList}
                  dudiList={dudiList}
                  pengajuanList={pengajuanList}
                  monitoringList={monitoringList}
                  siswaByNis={siswaByNis}
                  suratTugasStageNum={suratTugasStageNum}
                />
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
              return activeGroups.map((grp) => (
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
            <div className="print-sheet font-serif text-slate-950 leading-[1.35] text-[12pt]">
              {activeDocKey !== 'doc_monitoring' && <OfficialSchoolKop0708 variant="school" />}
              <DocumentBodyRenderer
                docKey={activeDocKey}
                record={activeRecord}
                activeYear={activeYear}
                nomorSurat={nomorSurat}
                tanggalSurat={tanggalSurat}
                kepalaSekolah={kepalaSekolah}
                includeGroupPeers={includeGroupPeers}
                penempatanList={penempatanList}
                dudiList={dudiList}
                pengajuanList={pengajuanList}
                monitoringList={monitoringList}
                siswaByNis={siswaByNis}
                suratTugasStageNum={suratTugasStageNum}
              />
            </div>
          </PrintPortal>
        )}

      <DocumentParametersModal
        isOpen={isParamModalOpen}
        activeDocKey={activeDocKey}
        meta={meta}
        nomorSurat={nomorSurat}
        tanggalSurat={tanggalSurat}
        paperSize={paperSize}
        kepalaSekolah={kepalaSekolah}
        includeGroupPeers={includeGroupPeers}
        suratTugasStageNum={suratTugasStageNum}
        selectedSuratTugasDudi={selectedSuratTugasDudi}
        suratTugasAudit={suratTugasAudit}
        onChangeNomorSurat={setNomorSurat}
        onChangeTanggalSurat={setTanggalSurat}
        onChangePaperSize={setPaperSize}
        onChangeKepalaSekolah={setKepalaSekolah}
        onChangeIncludeGroupPeers={setIncludeGroupPeers}
        onChangeSuratTugasStageNum={setSuratTugasStageNum}
        onChangeSelectedSuratTugasDudi={setSelectedSuratTugasDudi}
        onSaveKepalaSekolahToCloud={handleSaveKepalaSekolahToCloud}
        syncingKepalaSekolah={syncingKepalaSekolah}
        onClose={() => setIsParamModalOpen(false)}
      />

      <AppleConfirmModal
        isOpen={Boolean(pendingIssueTargets && pendingIssueTargets.length > 0)}
        onClose={() => !issuingBusy && setPendingIssueTargets(null)}
        onConfirm={() => pendingIssueTargets && handleConfirmMarkIssued(pendingIssueTargets)}
        title="Tandai Surat Sudah Terbit?"
        description={
          pendingIssueTargets && pendingIssueTargets.length > 0
            ? pendingIssueTargets.length === 1
              ? `Surat ${getStageValueByNumber(pendingIssueTargets[0].tahap)} untuk DUDI "${pendingIssueTargets[0].namaDudi}" akan dicatat Sudah Terbit sehingga pengisian Portal Monitoring guru untuk tahap ini otomatis terbuka.`
              : `${pendingIssueTargets.length} DUDI untuk ${getStageValueByNumber(pendingIssueTargets[0].tahap)} akan dicatat Sudah Terbit sehingga pengisian Portal Monitoring guru untuk tahap tersebut otomatis terbuka.`
            : ''
        }
        sheetName="Log_Penerbitan_Surat"
        confirmText="Ya, Tandai Terbit"
        cancelText="Belum"
        variant="primary"
        loading={issuingBusy}
      />

      <AppleConfirmModal
        isOpen={Boolean(pendingRevokeTargets && pendingRevokeTargets.length > 0)}
        onClose={() => !issuingBusy && setPendingRevokeTargets(null)}
        onConfirm={() => pendingRevokeTargets && handleConfirmRevokeIssued(pendingRevokeTargets)}
        title="Batalkan Status Surat Terbit?"
        description={
          pendingRevokeTargets && pendingRevokeTargets.length > 0
            ? pendingRevokeTargets.length === 1
              ? `Status terbit ${getStageValueByNumber(pendingRevokeTargets[0].tahap)} untuk DUDI "${pendingRevokeTargets[0].namaDudi}" akan dibatalkan sehingga input baru Portal Monitoring untuk tahap ini kembali terkunci.`
              : `Status terbit ${pendingRevokeTargets.length} DUDI untuk ${getStageValueByNumber(pendingRevokeTargets[0].tahap)} akan dibatalkan.`
            : ''
        }
        sheetName="Log_Penerbitan_Surat"
        confirmText="Ya, Batalkan Terbit"
        cancelText="Tutup"
        variant="danger"
        loading={issuingBusy}
      />
    </div>
  );
};
