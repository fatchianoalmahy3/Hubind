import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  GraduationCap,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { AdminSessionUser } from '../core/auth/LocalAccountAuthService';
import { GoogleSheetClient } from '../core/GoogleSheetClient';
import {
  DEFAULT_MONITORING_STAGE_CONTROL,
  Dudi,
  Guru,
  Jurusan,
  Kelas,
  MONITORING_STAGES,
  Monitoring,
  MonitoringStageControl,
  PenempatanPKL,
  PerizinanPKL,
  Sertifikat,
  Siswa,
  UserRole,
} from '../core/types/schema';
import { ToastManager } from '../core/ToastManager';
import {
  matchAnyJurusanItem,
  matchJurusanItem,
  resolveKakomliJurusans,
} from '../core/utils/jurusanHelpers';
import {
  StageLogEntry,
  buildMonitoringLookupIndex,
  buildPerizinanAttendanceIndex,
  buildStudentMonitoringSummary,
  getPerizinanAttendanceForStudent,
  getStageValueByNumber,
  resolveMonitoringStagePolicy,
} from '../core/utils/monitoringHelpers';
import { stripNisSymbols } from '../core/utils/nisHelpers';
import { isActivePlacementStatus, normalizeRelationText } from '../core/utils/relationHelpers';
import { DudiService } from '../services/DudiService';
import { GuruService } from '../services/GuruService';
import { JurusanService } from '../services/JurusanService';
import { KelasService } from '../services/KelasService';
import { MonitoringService } from '../services/MonitoringService';
import { PerizinanService } from '../services/PerizinanService';
import { SertifikatService } from '../services/SertifikatService';
import { SiswaPklService } from '../services/SiswaPklService';
import { SiswaService } from '../services/SiswaService';
import { AppleConfirmModal } from './AppleConfirmModal';
import { TopProgressBar } from './CrudProgressFeedback';
import { RecapGroupGridView } from './dudi-monitoring-recap/RecapGroupGridView';
import { RecapMatrixTableView } from './dudi-monitoring-recap/RecapMatrixTableView';
import { RecapStageInspectModal } from './dudi-monitoring-recap/RecapStageInspectModal';
import {
  ConfirmModalState,
  InspectTarget,
  RecapGroup,
  RecapViewMode,
  StatusFilterType,
  StudentMatrixRow,
  VerificationStatus,
  normalizeVerificationStatus,
} from './dudi-monitoring-recap/types';

interface DudiMonitoringRecapPageProps {
  userRole: UserRole;
  currentUser: AdminSessionUser | null;
  refreshSignal?: number;
}

export const DudiMonitoringRecapPage: React.FC<DudiMonitoringRecapPageProps> = ({
  userRole,
  currentUser,
  refreshSignal = 0,
}) => {
  const [loading, setLoading] = useState(true);
  const [revalidating, setRevalidating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [batchSaving, setBatchSaving] = useState(false);

  const [dudiList, setDudiList] = useState<Dudi[]>([]);
  const [penempatanList, setPenempatanList] = useState<PenempatanPKL[]>([]);
  const [siswaList, setSiswaList] = useState<Siswa[]>([]);
  const [jurusanList, setJurusanList] = useState<Jurusan[]>([]);
  const [kelasList, setKelasList] = useState<Kelas[]>([]);
  const [guruList, setGuruList] = useState<Guru[]>([]);
  const [monitoringList, setMonitoringList] = useState<Monitoring[]>([]);
  const [perizinanList, setPerizinanList] = useState<PerizinanPKL[]>([]);
  const [sertifikatList, setSertifikatList] = useState<Sertifikat[]>([]);
  const [stageControl, setStageControl] = useState<MonitoringStageControl>(
    DEFAULT_MONITORING_STAGE_CONTROL
  );

  const [viewMode, setViewMode] = useState<RecapViewMode>('DUDI');
  const [search, setSearch] = useState('');
  const [selectedJurusanKey, setSelectedJurusanKey] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>('ALL');
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [selectedStageNum, setSelectedStageNum] = useState<number>(1);
  const [inspectTarget, setInspectTarget] = useState<InspectTarget | null>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({
    isOpen: false,
    title: '',
    description: '',
    confirmText: 'Verifikasi',
    variant: 'success',
    onConfirm: async () => {},
  });
  const [confirmLoading, setConfirmLoading] = useState(false);

  const isKakomliRole = userRole === 'Kakomli';
  const isSuperAdmin = userRole === 'SuperAdmin';
  const canVerifyKakomli = isKakomliRole || isSuperAdmin;
  const canVerifyHubin = userRole === 'Waka' || userRole === 'Hubin' || isSuperAdmin;
  const isStrictHubinWaitingKakomli = canVerifyHubin && !isSuperAdmin;

  const loadAllData = useCallback(async (forceReload = false) => {
    if (forceReload) setRevalidating(true);
    else setLoading(true);
    try {
      const sheetClient = GoogleSheetClient.getInstance();
      const dSvc = DudiService.getInstance();
      const pSvc = SiswaPklService.getInstance();
      const sSvc = SiswaService.getInstance();
      const jSvc = JurusanService.getInstance();
      const kSvc = KelasService.getInstance();
      const gSvc = GuruService.getInstance();
      const mSvc = MonitoringService.getInstance();
      const iznSvc = PerizinanService.getInstance();
      const cSvc = SertifikatService.getInstance();

      if (forceReload) {
        await Promise.all([
          sheetClient.initFromFirestore().catch(() => {}),
          dSvc.reloadFromSpreadsheet().catch(() => []),
          pSvc.reloadFromSpreadsheet().catch(() => []),
          sSvc.reloadFromSpreadsheet().catch(() => []),
          jSvc.reloadFromSpreadsheet().catch(() => []),
          kSvc.reloadFromSpreadsheet().catch(() => []),
          gSvc.reloadFromSpreadsheet().catch(() => []),
          mSvc.reloadFromSpreadsheet().catch(() => []),
          iznSvc.reloadFromSpreadsheet().catch(() => []),
          cSvc.reloadFromSpreadsheet().catch(() => []),
        ]);
      } else {
        await sheetClient.initFromFirestore().catch(() => {});
      }

      const [dRows, pRows, sRows, jRows, kRows, gRows, mRows, iznRows, cRows] = await Promise.all([
        dSvc.getAll(),
        pSvc.getAll(),
        sSvc.getAll(),
        jSvc.getAll(),
        kSvc.getAll().catch(() => [] as Kelas[]),
        gSvc.getAll().catch(() => [] as Guru[]),
        mSvc.getAll(),
        iznSvc.getAll().catch(() => [] as PerizinanPKL[]),
        cSvc.getAll(),
      ]);

      setDudiList(dRows);
      setPenempatanList(pRows);
      setSiswaList(sRows);
      setJurusanList(jRows);
      setKelasList(kRows);
      setGuruList(gRows);
      setMonitoringList(mRows);
      setPerizinanList(iznRows);
      setSertifikatList(cRows);
      setStageControl(sheetClient.getMonitoringStageControl());
    } catch (err: any) {
      ToastManager.getInstance().show(
        'Gagal Memuat Rekap Monitoring',
        'error',
        err?.message || 'Periksa koneksi Cloud Server lalu segarkan kembali.'
      );
    } finally {
      setLoading(false);
      setRevalidating(false);
    }
  }, []);

  useEffect(() => {
    loadAllData(false);
  }, [loadAllData, refreshSignal]);

  // Auto-resolve ALL Jurusans managed by the logged-in Kakomli
  const matchedKakomliJurusans = useMemo(() => {
    if (!isKakomliRole) return [];
    return resolveKakomliJurusans(currentUser, jurusanList, guruList);
  }, [isKakomliRole, currentUser, jurusanList, guruList]);

  useEffect(() => {
    if (isKakomliRole) {
      if (matchedKakomliJurusans.length === 1) {
        const singleKey = matchedKakomliJurusans[0].kode || matchedKakomliJurusans[0].id;
        if (selectedJurusanKey !== singleKey) {
          setSelectedJurusanKey(singleKey);
        }
      } else if (matchedKakomliJurusans.length >= 2) {
        const validAssigned = matchedKakomliJurusans.some(
          (j) => (j.kode || j.id) === selectedJurusanKey
        );
        if (selectedJurusanKey !== 'ALL_ASSIGNED' && !validAssigned) {
          setSelectedJurusanKey('ALL_ASSIGNED');
        }
      } else if (selectedJurusanKey === 'ALL_ASSIGNED') {
        setSelectedJurusanKey('ALL');
      } else if (
        selectedJurusanKey !== 'ALL' &&
        !jurusanList.some((j) => (j.kode || j.id) === selectedJurusanKey)
      ) {
        setSelectedJurusanKey('ALL');
      }
    } else if (!isKakomliRole && selectedJurusanKey !== 'ALL') {
      const exists = jurusanList.some(
        (j) => j.kode === selectedJurusanKey || j.id === selectedJurusanKey
      );
      if (!exists) setSelectedJurusanKey('ALL');
    }
  }, [isKakomliRole, matchedKakomliJurusans, jurusanList, selectedJurusanKey]);

  const activeJurusanObj = useMemo(() => {
    if (selectedJurusanKey === 'ALL' || selectedJurusanKey === 'ALL_ASSIGNED') return null;
    const pool =
      isKakomliRole && matchedKakomliJurusans.length > 0 ? matchedKakomliJurusans : jurusanList;
    return (
      pool.find((j) => j.kode === selectedJurusanKey || j.id === selectedJurusanKey) || null
    );
  }, [isKakomliRole, matchedKakomliJurusans, jurusanList, selectedJurusanKey]);

  const matchesActiveJurusanFilter = useCallback(
    (resolvedJurusan: string) => {
      if (
        isKakomliRole &&
        matchedKakomliJurusans.length > 0 &&
        selectedJurusanKey === 'ALL_ASSIGNED'
      ) {
        return matchAnyJurusanItem(resolvedJurusan, matchedKakomliJurusans);
      }
      if (activeJurusanObj) {
        return matchJurusanItem(resolvedJurusan, activeJurusanObj);
      }
      return true;
    },
    [isKakomliRole, matchedKakomliJurusans, selectedJurusanKey, activeJurusanObj]
  );

  // Build Student Matrix Rows & Group by DUDI AND Kelas
  const { dudiGroups, kelasGroups } = useMemo<{
    dudiGroups: RecapGroup[];
    kelasGroups: RecapGroup[];
  }>(() => {
    const siswaByNis = new Map<string, Siswa>();
    for (const s of siswaList) {
      const clean = stripNisSymbols(s.nis);
      if (clean) siswaByNis.set(clean, s);
      if (s.nis) siswaByNis.set(String(s.nis).trim(), s);
    }

    const dudiById = new Map<string, Dudi>();
    const dudiByNormName = new Map<string, Dudi>();
    for (const d of dudiList) {
      if (d.id) dudiById.set(d.id, d);
      const normName = normalizeRelationText(d.namaDudi);
      if (normName) dudiByNormName.set(normName, d);
    }

    const kelasMetaByNorm = new Map<string, Kelas>();
    for (const k of kelasList) {
      const normK = normalizeRelationText(k.namaKelas);
      if (normK) kelasMetaByNorm.set(normK, k);
    }

    const monitoringIndex = buildMonitoringLookupIndex(monitoringList, sertifikatList);
    const perizinanIndex = buildPerizinanAttendanceIndex(perizinanList);
    const buildAttendanceStats = (nis: string, stageLogs: Record<number, StageLogEntry>) => {
      let monSakit = 0;
      let monIzin = 0;
      let alpha = 0;
      Object.values(stageLogs).forEach((log) => {
        monSakit += Number(log.sakit || 0);
        monIzin += Number(log.izin || 0);
        alpha += Number(log.alpha || 0);
      });
      const izn = getPerizinanAttendanceForStudent(perizinanIndex, nis);
      return {
        sakit: monSakit + izn.sakitDays,
        izin: monIzin + izn.izinDays,
        alpha,
        perizinanSakit: izn.sakitDays,
        perizinanIzin: izn.izinDays,
        dispensasiDays: izn.dispensasiDays,
      };
    };
    const activePlacements = penempatanList.filter((p) =>
      isActivePlacementStatus(p.statusPenempatan)
    );

    const activePlacementByNis = new Map<string, PenempatanPKL>();
    for (const p of activePlacements) {
      const clean = stripNisSymbols(p.nis);
      if (clean && !activePlacementByNis.has(clean)) activePlacementByNis.set(clean, p);
      const raw = String(p.nis || '').trim();
      if (raw && !activePlacementByNis.has(raw)) activePlacementByNis.set(raw, p);
    }

    const accumulateRowCounts = (group: RecapGroup, studentRow: StudentMatrixRow) => {
      group.students.push(studentRow);
      if (studentRow.isPlotted) group.plottedCount += 1;
      else group.unplottedCount += 1;

      if (
        studentRow.jurusan &&
        studentRow.jurusan !== '-' &&
        !group.jurusanList.includes(studentRow.jurusan)
      ) {
        group.jurusanList.push(studentRow.jurusan);
      }
      if (studentRow.highestStage > group.highestStage) {
        group.highestStage = studentRow.highestStage;
      }

      for (const stNum of studentRow.completedStages) {
        const log = studentRow.stageLogs[stNum];
        if (!log || !log.monitoringId) continue;
        const stStatus = normalizeVerificationStatus(log.status);
        group.totalLogs += 1;
        if (stStatus === 'Terlaksana') {
          group.pendingKakomliCount += 1;
        } else if (stStatus === 'Tervalidasi Kakomli') {
          group.pendingHubinCount += 1;
        } else if (stStatus === 'Tervalidasi Hubin') {
          group.verifiedHubinCount += 1;
        }
      }
    };

    // 1. DUDI Groups (from active placements)
    const dudiMap = new Map<string, RecapGroup>();
    const seenPlacementIdsInKelas = new Set<string>();

    for (const p of activePlacements) {
      const cleanNis = stripNisSymbols(p.nis);
      const matchedSiswa =
        (cleanNis && siswaByNis.get(cleanNis)) || siswaByNis.get(String(p.nis || '').trim());
      const matchedMon =
        (cleanNis && monitoringIndex.monitoringByNisDigits.get(cleanNis)?.[0]) ||
        (p.idPenempatan && monitoringIndex.monitoringByPlacement.get(p.idPenempatan)?.[0]) ||
        undefined;
      const resolvedJurusan = matchedSiswa?.jurusan || matchedMon?.jurusan || '-';
      const resolvedKelas = matchedSiswa?.kelas || '-';

      if (!matchesActiveJurusanFilter(resolvedJurusan)) continue;

      const dudiObj =
        (p.idDudi && dudiById.get(p.idDudi)) ||
        dudiByNormName.get(normalizeRelationText(p.namaDudi));
      const dudiKey = normalizeRelationText(p.namaDudi) || p.idDudi || p.id;
      const dudiName = dudiObj?.namaDudi || p.namaDudi || 'Mitra DUDI';

      const summary = buildStudentMonitoringSummary(
        {
          nis: p.nis,
          nama: p.namaSiswa,
          idPenempatan: p.idPenempatan,
          dudi_name: dudiName,
        },
        monitoringList,
        sertifikatList,
        monitoringIndex
      );

      const highestStage =
        summary.completedStages.length > 0
          ? summary.completedStages[summary.completedStages.length - 1]
          : 0;

      const attendanceStats = buildAttendanceStats(p.nis, summary.stageLogs);
      const studentRow: StudentMatrixRow = {
        placementId: p.idPenempatan || p.id,
        nis: p.nis,
        namaSiswa: p.namaSiswa,
        kelas: resolvedKelas,
        jurusan: resolvedJurusan,
        namaDudi: dudiName,
        idDudi: dudiObj?.id || p.idDudi || '',
        guruPendamping: p.guruPendamping || dudiObj?.guruPendamping || '-',
        isPlotted: true,
        stagePolicy: resolveMonitoringStagePolicy(stageControl, resolvedJurusan, jurusanList),
        stageLogs: summary.stageLogs,
        completedStages: summary.completedStages,
        highestStage,
        hasGrade: summary.hasSubmittedGrades,
        rataRataNilai: summary.submittedGradeSummary?.rataRata ?? null,
        ...attendanceStats,
      };

      let group = dudiMap.get(dudiKey);
      if (!group) {
        group = {
          key: dudiKey,
          mode: 'DUDI',
          title: dudiName,
          subtitle: dudiObj?.alamat || dudiObj?.wilayahKota || '-',
          secondaryLabel: `Pembimbing: ${p.guruPendamping || dudiObj?.guruPendamping || '-'}`,
          jurusanList: [],
          students: [],
          plottedCount: 0,
          unplottedCount: 0,
          totalLogs: 0,
          pendingKakomliCount: 0,
          pendingHubinCount: 0,
          verifiedHubinCount: 0,
          highestStage: 0,
        };
        dudiMap.set(dudiKey, group);
      }

      accumulateRowCounts(group, studentRow);
    }

    // 2. Kelas Groups (from Master_Siswa_XI + fallback active placements not in Master_Siswa_XI)
    const kelasMap = new Map<string, RecapGroup>();

    const pushToKelasGroup = (studentRow: StudentMatrixRow) => {
      const kelasLabel = String(studentRow.kelas || '').trim() || 'Tanpa Kelas';
      const kelasKey = normalizeRelationText(kelasLabel) || 'tanpa_kelas';
      const kelasMeta = kelasMetaByNorm.get(kelasKey);

      let group = kelasMap.get(kelasKey);
      if (!group) {
        group = {
          key: kelasKey,
          mode: 'KELAS',
          title: kelasMeta?.namaKelas || kelasLabel,
          subtitle: kelasMeta?.waliKelas
            ? `Wali Kelas: ${kelasMeta.waliKelas}`
            : studentRow.jurusan && studentRow.jurusan !== '-'
            ? `Jurusan: ${studentRow.jurusan}`
            : 'Rombel Kelas XI',
          secondaryLabel: kelasMeta?.jurusan
            ? `Kompetensi: ${kelasMeta.jurusan}`
            : studentRow.jurusan && studentRow.jurusan !== '-'
            ? `Kompetensi: ${studentRow.jurusan}`
            : 'Kelas PKL',
          jurusanList: [],
          students: [],
          plottedCount: 0,
          unplottedCount: 0,
          totalLogs: 0,
          pendingKakomliCount: 0,
          pendingHubinCount: 0,
          verifiedHubinCount: 0,
          highestStage: 0,
        };
        kelasMap.set(kelasKey, group);
      }
      accumulateRowCounts(group, studentRow);
    };

    for (const s of siswaList) {
      const cleanNis = stripNisSymbols(s.nis);
      const p =
        (cleanNis && activePlacementByNis.get(cleanNis)) ||
        activePlacementByNis.get(String(s.nis || '').trim());
      if (p) seenPlacementIdsInKelas.add(p.idPenempatan || p.id);

      const resolvedJurusan = s.jurusan || '-';
      if (!matchesActiveJurusanFilter(resolvedJurusan)) continue;

      const dudiObj = p
        ? (p.idDudi && dudiById.get(p.idDudi)) ||
          dudiByNormName.get(normalizeRelationText(p.namaDudi))
        : undefined;
      const dudiName = p ? dudiObj?.namaDudi || p.namaDudi || 'Mitra DUDI' : 'Belum Terplotting';

      const summary = buildStudentMonitoringSummary(
        {
          nis: s.nis,
          nama: s.nama,
          idPenempatan: p?.idPenempatan,
          dudi_name: p ? dudiName : undefined,
        },
        monitoringList,
        sertifikatList,
        monitoringIndex
      );

      const highestStage =
        summary.completedStages.length > 0
          ? summary.completedStages[summary.completedStages.length - 1]
          : 0;

      const attendanceStats = buildAttendanceStats(s.nis, summary.stageLogs);
      pushToKelasGroup({
        placementId: p?.idPenempatan || p?.id || `siswa_${s.id || cleanNis || s.nama}`,
        nis: s.nis,
        namaSiswa: s.nama,
        kelas: s.kelas || 'Tanpa Kelas',
        jurusan: resolvedJurusan,
        namaDudi: dudiName,
        idDudi: dudiObj?.id || p?.idDudi || '',
        guruPendamping: p?.guruPendamping || dudiObj?.guruPendamping || '-',
        isPlotted: Boolean(p),
        stagePolicy: resolveMonitoringStagePolicy(stageControl, resolvedJurusan, jurusanList),
        stageLogs: summary.stageLogs,
        completedStages: summary.completedStages,
        highestStage,
        hasGrade: summary.hasSubmittedGrades,
        rataRataNilai: summary.submittedGradeSummary?.rataRata ?? null,
        ...attendanceStats,
      });
    }

    // Fallback: include active placements whose student NIS isn't found in Master_Siswa_XI
    for (const p of activePlacements) {
      if (seenPlacementIdsInKelas.has(p.idPenempatan || p.id)) continue;
      const cleanNis = stripNisSymbols(p.nis);
      const matchedMon =
        (cleanNis && monitoringIndex.monitoringByNisDigits.get(cleanNis)?.[0]) ||
        (p.idPenempatan && monitoringIndex.monitoringByPlacement.get(p.idPenempatan)?.[0]) ||
        undefined;
      const resolvedJurusan = matchedMon?.jurusan || '-';
      if (!matchesActiveJurusanFilter(resolvedJurusan)) continue;

      const dudiObj =
        (p.idDudi && dudiById.get(p.idDudi)) ||
        dudiByNormName.get(normalizeRelationText(p.namaDudi));
      const dudiName = dudiObj?.namaDudi || p.namaDudi || 'Mitra DUDI';

      const summary = buildStudentMonitoringSummary(
        {
          nis: p.nis,
          nama: p.namaSiswa,
          idPenempatan: p.idPenempatan,
          dudi_name: dudiName,
        },
        monitoringList,
        sertifikatList,
        monitoringIndex
      );
      const highestStage =
        summary.completedStages.length > 0
          ? summary.completedStages[summary.completedStages.length - 1]
          : 0;

      const attendanceStats = buildAttendanceStats(p.nis, summary.stageLogs);
      pushToKelasGroup({
        placementId: p.idPenempatan || p.id,
        nis: p.nis,
        namaSiswa: p.namaSiswa,
        kelas: 'Tanpa Kelas',
        jurusan: resolvedJurusan,
        namaDudi: dudiName,
        idDudi: dudiObj?.id || p.idDudi || '',
        guruPendamping: p.guruPendamping || dudiObj?.guruPendamping || '-',
        isPlotted: true,
        stagePolicy: resolveMonitoringStagePolicy(stageControl, resolvedJurusan, jurusanList),
        stageLogs: summary.stageLogs,
        completedStages: summary.completedStages,
        highestStage,
        hasGrade: summary.hasSubmittedGrades,
        rataRataNilai: summary.submittedGradeSummary?.rataRata ?? null,
        ...attendanceStats,
      });
    }

    const sortedKelasGroups = Array.from(kelasMap.values()).map((g) => ({
      ...g,
      students: [...g.students].sort((a, b) => a.namaSiswa.localeCompare(b.namaSiswa, 'id')),
    }));
    sortedKelasGroups.sort((a, b) => a.title.localeCompare(b.title, 'id', { numeric: true }));

    return {
      dudiGroups: Array.from(dudiMap.values()).sort((a, b) =>
        a.title.localeCompare(b.title, 'id')
      ),
      kelasGroups: sortedKelasGroups,
    };
  }, [
    dudiList,
    penempatanList,
    siswaList,
    kelasList,
    jurusanList,
    monitoringList,
    perizinanList,
    sertifikatList,
    stageControl,
    matchesActiveJurusanFilter,
  ]);

  const activeModeGroups = viewMode === 'DUDI' ? dudiGroups : kelasGroups;
  const deferredSearch = useDeferredValue(search);

  const filteredGroups = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    const qDigits = !/[a-z]/i.test(deferredSearch) ? stripNisSymbols(deferredSearch) : '';
    return activeModeGroups.filter((g) => {
      if (statusFilter === 'PENDING_KAKOMLI' && g.pendingKakomliCount === 0) return false;
      if (statusFilter === 'PENDING_HUBIN' && g.pendingHubinCount === 0) return false;
      if (
        statusFilter === 'ALL_VERIFIED' &&
        (g.totalLogs === 0 || g.pendingKakomliCount > 0 || g.pendingHubinCount > 0)
      ) {
        return false;
      }
      if (!q && qDigits.length < 3) return true;
      if (
        q &&
        (g.title.toLowerCase().includes(q) ||
          g.subtitle.toLowerCase().includes(q) ||
          g.secondaryLabel.toLowerCase().includes(q))
      ) {
        return true;
      }
      return g.students.some(
        (s) =>
          (q &&
            (s.namaSiswa.toLowerCase().includes(q) ||
              s.nis.toLowerCase().includes(q) ||
              s.kelas.toLowerCase().includes(q) ||
              s.namaDudi.toLowerCase().includes(q))) ||
          (qDigits.length >= 3 && stripNisSymbols(s.nis).includes(qDigits))
      );
    });
  }, [activeModeGroups, deferredSearch, statusFilter]);

  const activeGroup = useMemo(() => {
    if (!selectedGroupKey) return null;
    return activeModeGroups.find((g) => g.key === selectedGroupKey) || null;
  }, [activeModeGroups, selectedGroupKey]);

  const overviewMetrics = useMemo(() => {
    let totalStudents = 0;
    let plottedStudents = 0;
    let pendingKakomli = 0;
    let pendingHubin = 0;
    let verifiedHubin = 0;
    for (const g of filteredGroups) {
      totalStudents += g.students.length;
      plottedStudents += g.plottedCount;
      pendingKakomli += g.pendingKakomliCount;
      pendingHubin += g.pendingHubinCount;
      verifiedHubin += g.verifiedHubinCount;
    }
    return {
      totalGroups: filteredGroups.length,
      totalStudents,
      plottedStudents,
      pendingKakomli,
      pendingHubin,
      verifiedHubin,
    };
  }, [filteredGroups]);

  // Auto-select latest stage waiting for verification when opening a DUDI or Kelas
  const handleSelectGroup = (group: RecapGroup) => {
    setSelectedGroupKey(group.key);
    const stagesDesc = [...MONITORING_STAGES].reverse();

    for (const st of stagesDesc) {
      const hasPendingKakomli = group.students.some((s) => {
        const l = s.stageLogs[st.num];
        return l?.monitoringId && normalizeVerificationStatus(l.status) === 'Terlaksana';
      });
      const hasPendingHubin = group.students.some((s) => {
        const l = s.stageLogs[st.num];
        return (
          l?.monitoringId &&
          normalizeVerificationStatus(l.status) === 'Tervalidasi Kakomli'
        );
      });
      if (isKakomliRole && hasPendingKakomli) {
        setSelectedStageNum(st.num);
        return;
      }
      if (canVerifyHubin && !isSuperAdmin && hasPendingHubin) {
        setSelectedStageNum(st.num);
        return;
      }
      if (isSuperAdmin && (hasPendingHubin || hasPendingKakomli)) {
        setSelectedStageNum(st.num);
        return;
      }
    }

    for (const st of stagesDesc) {
      const hasUnverified = group.students.some((s) => {
        const l = s.stageLogs[st.num];
        const status = normalizeVerificationStatus(l?.status);
        return (
          l?.monitoringId &&
          (status === 'Terlaksana' || status === 'Tervalidasi Kakomli')
        );
      });
      if (hasUnverified) {
        setSelectedStageNum(st.num);
        return;
      }
    }

    setSelectedStageNum(Math.max(1, group.highestStage || 1));
  };

  // Persist single-row status update to Cloud Server
  const handleUpdateSingleVerification = async (
    student: StudentMatrixRow,
    log: StageLogEntry,
    nextStatus: VerificationStatus
  ) => {
    if (!log.monitoringId) {
      ToastManager.getInstance().show(
        'Data Monitoring Belum Tersimpan',
        'error',
        `Tahap ${log.stageNum} untuk ${student.namaSiswa} belum memiliki ID monitoring di Cloud Server.`
      );
      return;
    }

    setSavingId(log.monitoringId);
    const toastId = ToastManager.getInstance().show(
      'Menyimpan Verifikasi...',
      'pending',
      `${student.namaSiswa} · ${getStageValueByNumber(log.stageNum)}`
    );

    try {
      const monSvc = MonitoringService.getInstance();
      await monSvc.update(log.monitoringId, { statusTahap: nextStatus });
      await monSvc.reloadFromSpreadsheet();
      const refreshed = await monSvc.getAll();
      setMonitoringList(refreshed);

      setInspectTarget((prev) =>
        prev && prev.log.monitoringId === log.monitoringId
          ? { ...prev, log: { ...prev.log, status: nextStatus } }
          : prev
      );

      ToastManager.getInstance().update(
        toastId,
        'Verifikasi Tersimpan',
        'success',
        `${student.namaSiswa} (${getStageValueByNumber(log.stageNum)}) berstatus ${nextStatus}.`
      );
    } catch (err: any) {
      ToastManager.getInstance().update(
        toastId,
        'Gagal Menyimpan Verifikasi',
        'error',
        err?.message || 'Periksa koneksi Cloud Server dan coba lagi.'
      );
    } finally {
      setSavingId(null);
    }
  };

  // Persist batch verification via single BULK_UPDATE request
  const handleBatchVerify = async (
    targets: Array<{ student: StudentMatrixRow; log: StageLogEntry }>,
    nextStatus: VerificationStatus
  ) => {
    const validTargets = targets.filter((item) => Boolean(item.log.monitoringId));
    if (validTargets.length === 0) return;
    setBatchSaving(true);
    const toastId = ToastManager.getInstance().show(
      `Memverifikasi ${validTargets.length} Siswa...`,
      'pending',
      `Menyimpan status ${nextStatus} ke Cloud Server`
    );

    try {
      const monSvc = MonitoringService.getInstance();
      const patches = validTargets.map((item) => ({
        id: item.log.monitoringId!,
        updates: { statusTahap: nextStatus } as Partial<Monitoring>,
      }));
      const done = await monSvc.bulkUpdateMany(patches);
      await monSvc.reloadFromSpreadsheet();
      const refreshed = await monSvc.getAll();
      setMonitoringList(refreshed);

      ToastManager.getInstance().update(
        toastId,
        'Verifikasi Massal Berhasil',
        'success',
        `${done} siswa pada ${getStageValueByNumber(selectedStageNum)} diperbarui ke ${nextStatus}.`
      );
    } catch (err: any) {
      ToastManager.getInstance().update(
        toastId,
        'Sebagian / Gagal Verifikasi',
        'error',
        err?.message || 'Terjadi kendala saat menyimpan ke Cloud Server.'
      );
      await loadAllData(true);
    } finally {
      setBatchSaving(false);
    }
  };

  // Stage-level eligible targets in active DUDI / Kelas
  const stageStats = useMemo(() => {
    if (!activeGroup) {
      return {
        disabledCount: 0,
        notFilled: 0,
        terlaksanaTargets: [] as Array<{ student: StudentMatrixRow; log: StageLogEntry }>,
        kakomliTargets: [] as Array<{ student: StudentMatrixRow; log: StageLogEntry }>,
        hubinTargets: [] as Array<{ student: StudentMatrixRow; log: StageLogEntry }>,
      };
    }

    let disabledCount = 0;
    let notFilled = 0;
    const terlaksanaTargets: Array<{ student: StudentMatrixRow; log: StageLogEntry }> = [];
    const kakomliTargets: Array<{ student: StudentMatrixRow; log: StageLogEntry }> = [];
    const hubinTargets: Array<{ student: StudentMatrixRow; log: StageLogEntry }> = [];

    for (const student of activeGroup.students) {
      const log = student.stageLogs[selectedStageNum];
      const isStageEnabled = student.stagePolicy.enabledStages.includes(selectedStageNum);
      if (!log || !log.monitoringId) {
        if (!isStageEnabled) disabledCount += 1;
        else notFilled += 1;
        continue;
      }
      const st = normalizeVerificationStatus(log.status);
      if (st === 'Belum Terlaksana') {
        if (!isStageEnabled) disabledCount += 1;
        else notFilled += 1;
      } else if (st === 'Terlaksana') {
        terlaksanaTargets.push({ student, log });
      } else if (st === 'Tervalidasi Kakomli') {
        kakomliTargets.push({ student, log });
      } else if (st === 'Tervalidasi Hubin') {
        hubinTargets.push({ student, log });
      }
    }

    return { disabledCount, notFilled, terlaksanaTargets, kakomliTargets, hubinTargets };
  }, [activeGroup, selectedStageNum]);

  const hubinEligibleTargets = useMemo(() => stageStats.kakomliTargets, [stageStats]);

  // Helper to prompt SuperAdmin explicit confirmation before bypassing Kakomli ACC
  const confirmSuperAdminBypassSingle = (student: StudentMatrixRow, log: StageLogEntry) => {
    setConfirmModal({
      isOpen: true,
      title: 'Bypass Verifikasi Kakomli (SuperAdmin)?',
      description: `Data ${getStageValueByNumber(log.stageNum)} untuk ${student.namaSiswa} saat ini masih menunggu ACC Kakomli. Sebagai SuperAdmin, Anda akan langsung memvalidasinya menjadi Tervalidasi Hubin tanpa menunggu Kakomli.`,
      confirmText: 'Bypass & Validasi Final',
      variant: 'danger',
      onConfirm: async () => {
        await handleUpdateSingleVerification(student, log, 'Tervalidasi Hubin');
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-3 border-b border-slate-200">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight leading-snug">
            Rekap &amp; Verifikasi Monitoring {viewMode === 'DUDI' ? 'Per DUDI' : 'Per Kelas'}
          </h1>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            {isKakomliRole
              ? `Verifikasi tahap monitoring terlaksana sesuai kebijakan jurusan (${viewMode === 'DUDI' ? 'dikelompokkan per mitra DUDI' : 'dikelompokkan per rombel kelas'}).`
              : isStrictHubinWaitingKakomli
              ? 'Validasi Hubin hanya terbuka setelah tahap disetujui (ACC) oleh Kakomli masing-masing jurusan.'
              : isSuperAdmin
              ? 'Pantau progres monitoring per DUDI maupun per Kelas, kelola validasi berjenjang, atau lakukan bypass Kakomli bila diperlukan.'
              : 'Ringkasan status pelaksanaan & verifikasi monitoring PKL per DUDI dan per Kelas.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto shrink-0">
          {/* View Mode Segmented Switch: Per DUDI vs Per Kelas */}
          <div
            className="inline-flex p-0.5 rounded-lg bg-slate-100 border border-slate-200"
            role="tablist"
            aria-label="Mode Pengelompokan Rekap"
          >
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'DUDI'}
              onClick={() => {
                setViewMode('DUDI');
                setSelectedGroupKey(null);
              }}
              className={`h-8 px-3 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                viewMode === 'DUDI'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Per DUDI</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'KELAS'}
              onClick={() => {
                setViewMode('KELAS');
                setSelectedGroupKey(null);
              }}
              className={`h-8 px-3 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                viewMode === 'KELAS'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Per Kelas</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => loadAllData(true)}
            disabled={loading || revalidating || batchSaving}
            className="h-9 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${
                loading || revalidating ? 'animate-spin text-blue-600' : 'text-slate-500'
              }`}
            />
            <span>{revalidating ? 'Menyegarkan...' : 'Segarkan Data'}</span>
          </button>
        </div>
      </div>

      <TopProgressBar
        active={loading || revalidating || batchSaving || Boolean(savingId)}
        label="Menyinkronkan rekap monitoring dengan Cloud Server"
        className="rounded-full"
      />

      {/* Filter & Jurusan Context Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col md:flex-row md:items-center gap-2.5">
        <div className="w-full md:w-80 shrink-0">
          {isKakomliRole && matchedKakomliJurusans.length === 1 ? (
            <div className="h-9 px-3 rounded-lg bg-indigo-50 border border-indigo-200 text-xs font-semibold text-indigo-900 flex items-center justify-between gap-2">
              <span className="truncate">
                Jurusan: {matchedKakomliJurusans[0].kode} — {matchedKakomliJurusans[0].nama}
              </span>
              <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
            </div>
          ) : isKakomliRole && matchedKakomliJurusans.length >= 2 ? (
            <select
              value={selectedJurusanKey}
              onChange={(e) => {
                setSelectedJurusanKey(e.target.value);
                setSelectedGroupKey(null);
              }}
              aria-label="Filter Jurusan Ampuan Kakomli"
              className="w-full h-9 px-3 rounded-lg border border-indigo-200 bg-indigo-50/70 text-xs font-semibold text-indigo-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:bg-white cursor-pointer"
            >
              <option value="ALL_ASSIGNED">
                Semua Jurusan Ampuan ({matchedKakomliJurusans.length}:{' '}
                {matchedKakomliJurusans.map((j) => j.kode || j.nama).join(', ')})
              </option>
              {matchedKakomliJurusans.map((j) => (
                <option key={j.id} value={j.kode || j.id}>
                  {j.kode} — {j.nama}
                </option>
              ))}
            </select>
          ) : (
            <select
              value={selectedJurusanKey}
              onChange={(e) => {
                setSelectedJurusanKey(e.target.value);
                setSelectedGroupKey(null);
              }}
              aria-label="Filter Kompetensi Keahlian"
              className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:bg-white cursor-pointer"
            >
              <option value="ALL">Semua Kompetensi Keahlian</option>
              {jurusanList.map((j) => (
                <option key={j.id} value={j.kode || j.id}>
                  {j.kode} — {j.nama}
                </option>
              ))}
            </select>
          )}
        </div>

        {!activeGroup && (
          <>
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  viewMode === 'DUDI'
                    ? 'Cari DUDI, pembimbing, atau nama/NIS siswa...'
                    : 'Cari kelas, wali kelas, DUDI, atau nama/NIS siswa...'
                }
                className="w-full h-9 pl-9 pr-8 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:bg-white"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Bersihkan pencarian"
                  className="w-7 h-7 rounded-md text-slate-400 hover:text-slate-700 absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              aria-label="Filter Status Verifikasi"
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer shrink-0"
            >
              <option value="ALL">Semua Status</option>
              <option value="PENDING_KAKOMLI">Menunggu Verifikasi Kakomli</option>
              <option value="PENDING_HUBIN">Menunggu Verifikasi Hubin / Waka</option>
              <option value="ALL_VERIFIED">Terverifikasi Lengkap (Kakomli &amp; Hubin)</option>
            </select>
          </>
        )}

        {activeGroup && (
          <div className="flex-1 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setSelectedGroupKey(null)}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kembali ke Daftar {viewMode === 'DUDI' ? 'DUDI' : 'Kelas'}</span>
            </button>
            <span className="text-xs font-medium text-slate-500 hidden sm:inline">
              Menampilkan {activeGroup.students.length} siswa
              {viewMode === 'KELAS' && activeGroup.unplottedCount > 0
                ? ` (${activeGroup.plottedCount} terplot · ${activeGroup.unplottedCount} belum terplot)`
                : ''}
            </span>
          </div>
        )}
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 flex flex-col items-center justify-center gap-2.5 text-xs text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          <span>Memuat rekap monitoring dari Cloud Server...</span>
        </div>
      ) : !activeGroup ? (
        <RecapGroupGridView
          viewMode={viewMode}
          filteredGroups={filteredGroups}
          overviewMetrics={overviewMetrics}
          isKakomliRole={isKakomliRole}
          isStrictHubinWaitingKakomli={isStrictHubinWaitingKakomli}
          isSuperAdmin={isSuperAdmin}
          filterResetKey={`${viewMode}::${selectedJurusanKey}::${deferredSearch}::${statusFilter}`}
          onSelectGroup={handleSelectGroup}
        />
      ) : (
        <RecapMatrixTableView
          activeGroup={activeGroup}
          viewMode={viewMode}
          selectedStageNum={selectedStageNum}
          stageStats={stageStats}
          hubinEligibleTargets={hubinEligibleTargets}
          canVerifyKakomli={canVerifyKakomli}
          canVerifyHubin={canVerifyHubin}
          isSuperAdmin={isSuperAdmin}
          isStrictHubinWaitingKakomli={isStrictHubinWaitingKakomli}
          savingId={savingId}
          batchSaving={batchSaving}
          onSelectStageNum={setSelectedStageNum}
          onInspectTarget={setInspectTarget}
          onUpdateSingleVerification={handleUpdateSingleVerification}
          onBatchVerify={handleBatchVerify}
          onConfirmSuperAdminBypassSingle={confirmSuperAdminBypassSingle}
          onOpenConfirmModal={setConfirmModal}
        />
      )}

      <RecapStageInspectModal
        inspectTarget={inspectTarget}
        savingId={savingId}
        canVerifyKakomli={canVerifyKakomli}
        canVerifyHubin={canVerifyHubin}
        isSuperAdmin={isSuperAdmin}
        isStrictHubinWaitingKakomli={isStrictHubinWaitingKakomli}
        onClose={() => setInspectTarget(null)}
        onUpdateSingleVerification={handleUpdateSingleVerification}
        onConfirmSuperAdminBypassSingle={confirmSuperAdminBypassSingle}
      />

      {/* Confirmation Modal */}
      <AppleConfirmModal
        isOpen={confirmModal.isOpen}
        loading={confirmLoading || batchSaving}
        onClose={() =>
          !confirmLoading &&
          !batchSaving &&
          setConfirmModal((prev) => ({ ...prev, isOpen: false }))
        }
        onConfirm={async () => {
          if (confirmLoading) return;
          setConfirmLoading(true);
          try {
            await confirmModal.onConfirm();
            setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          } finally {
            setConfirmLoading(false);
          }
        }}
        title={confirmModal.title}
        description={confirmModal.description}
        sheetName="Monitoring_5_Tahap"
        variant={confirmModal.variant}
        confirmText={confirmModal.confirmText}
      />
    </div>
  );
};
