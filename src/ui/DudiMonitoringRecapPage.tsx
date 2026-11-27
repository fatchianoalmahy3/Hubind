import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Eye,
  GraduationCap,
  Loader2,
  Lock,
  MapPin,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users,
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
import { formatIndonesianDate } from '../core/utils/dateHelpers';
import {
  matchAnyJurusanItem,
  matchJurusanItem,
  resolveKakomliJurusans,
} from '../core/utils/jurusanHelpers';
import {
  ResolvedMonitoringStagePolicy,
  StageLogEntry,
  buildMonitoringLookupIndex,
  buildPerizinanAttendanceIndex,
  buildStudentMonitoringSummary,
  getPerizinanAttendanceForStudent,
  getStageValueByNumber,
  normalizeMonitoringVerificationStatus,
  resolveMonitoringStagePolicy,
} from '../core/utils/monitoringHelpers';
import { formatNisVisual, stripNisSymbols } from '../core/utils/nisHelpers';
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
import { CrudLoadingOverlay, TopProgressBar } from './CrudProgressFeedback';

interface DudiMonitoringRecapPageProps {
  userRole: UserRole;
  currentUser: AdminSessionUser | null;
  refreshSignal?: number;
}

type VerificationStatus = Monitoring['statusTahap'];
type RecapViewMode = 'DUDI' | 'KELAS';

interface StudentMatrixRow {
  placementId: string;
  nis: string;
  namaSiswa: string;
  kelas: string;
  jurusan: string;
  namaDudi: string;
  idDudi: string;
  guruPendamping: string;
  isPlotted: boolean;
  stagePolicy: ResolvedMonitoringStagePolicy;
  stageLogs: Record<number, StageLogEntry>;
  completedStages: number[];
  highestStage: number;
  hasGrade: boolean;
  rataRataNilai: number | null;
  sakit: number;
  izin: number;
  alpha: number;
  perizinanSakit: number;
  perizinanIzin: number;
  dispensasiDays: number;
}

interface RecapGroup {
  key: string;
  mode: RecapViewMode;
  title: string;
  subtitle: string;
  secondaryLabel: string;
  jurusanList: string[];
  students: StudentMatrixRow[];
  plottedCount: number;
  unplottedCount: number;
  totalLogs: number;
  pendingKakomliCount: number;
  pendingHubinCount: number;
  verifiedHubinCount: number;
  highestStage: number;
}

function normalizeVerificationStatus(raw?: string): VerificationStatus {
  return normalizeMonitoringVerificationStatus(raw);
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
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'PENDING_KAKOMLI' | 'PENDING_HUBIN' | 'ALL_VERIFIED'
  >('ALL');
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [selectedStageNum, setSelectedStageNum] = useState<number>(1);
  const [inspectTarget, setInspectTarget] = useState<{
    student: StudentMatrixRow;
    log: StageLogEntry;
  } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmText: string;
    variant: 'primary' | 'success' | 'danger';
    onConfirm: () => Promise<void>;
  }>({
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

  const renderStageCellBadge = (
    student: StudentMatrixRow,
    stageNum: number,
    isActiveCol: boolean
  ) => {
    const log = student.stageLogs[stageNum];
    const isStageEnabled = student.stagePolicy.enabledStages.includes(stageNum);

    if (!log || !log.monitoringId) {
      if (!isStageEnabled) {
        return (
          <span
            className="inline-flex items-center justify-center w-full py-1.5 text-[10px] font-medium text-slate-300 select-none"
            title={`Tahap ${stageNum}: Tidak aktif untuk jurusan ${student.jurusan}`}
          >
            Nonaktif
          </span>
        );
      }
      return (
        <span
          className={`inline-flex items-center justify-center w-full py-1.5 text-xs ${
            isActiveCol ? 'text-slate-400 font-medium' : 'text-slate-300'
          }`}
          title={`Tahap ${stageNum}: Belum diisi guru pembimbing`}
        >
          —
        </span>
      );
    }

    const status = normalizeVerificationStatus(log.status);
    if (status === 'Belum Terlaksana') {
      return (
        <span className="inline-flex items-center justify-center w-full py-1.5 text-xs text-slate-300">
          —
        </span>
      );
    }

    if (status === 'Tervalidasi Hubin') {
      return (
        <button
          type="button"
          onClick={() => setInspectTarget({ student, log })}
          title={`Tahap ${stageNum}: Tervalidasi Hubin (${log.tanggal || '-'})`}
          className="w-full min-h-[34px] px-1.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 inline-flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors"
        >
          <CheckCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span className="text-[10px] font-bold leading-none">Hubin</span>
        </button>
      );
    }

    if (status === 'Tervalidasi Kakomli') {
      return (
        <button
          type="button"
          onClick={() => setInspectTarget({ student, log })}
          title={`Tahap ${stageNum}: Tervalidasi Kakomli (${log.tanggal || '-'})`}
          className="w-full min-h-[34px] px-1.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-800 inline-flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
          <span className="text-[10px] font-bold leading-none">Kakomli</span>
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={() => setInspectTarget({ student, log })}
        title={`Tahap ${stageNum}: Sudah Terlaksana oleh Guru (${log.tanggal || '-'}), menunggu ACC Kakomli`}
        className="w-full min-h-[34px] px-1.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 inline-flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors"
      >
        <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />
        <span className="text-[10px] font-bold leading-none">Terlaksana</span>
      </button>
    );
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
        /* LEVEL 1: DUDI OR KELAS CARD LIST VIEW */
        <div className="space-y-4">
          {/* 4 Summary Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1.5">
              <div className="flex items-start justify-between gap-2 text-xs text-slate-500">
                <span className="leading-snug font-medium">
                  {viewMode === 'DUDI' ? 'DUDI Aktif' : 'Rombel Kelas XI'}
                </span>
                {viewMode === 'DUDI' ? (
                  <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
                ) : (
                  <GraduationCap className="w-4 h-4 text-blue-600 shrink-0" />
                )}
              </div>
              <div className="text-2xl font-bold text-slate-900 tabular-nums leading-none">
                {overviewMetrics.totalGroups}
              </div>
              <div className="text-[11px] text-slate-500 leading-snug">
                {viewMode === 'DUDI' ? 'Lokasi penempatan aktif' : 'Rombongan belajar terdaftar'}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1.5">
              <div className="flex items-start justify-between gap-2 text-xs text-slate-500">
                <span className="leading-snug font-medium">
                  {viewMode === 'DUDI' ? 'Siswa Dimonitoring' : 'Siswa Terdaftar'}
                </span>
                <Users className="w-4 h-4 text-indigo-600 shrink-0" />
              </div>
              <div className="text-2xl font-bold text-slate-900 tabular-nums leading-none">
                {overviewMetrics.totalStudents}
              </div>
              <div className="text-[11px] text-slate-500 leading-snug">
                {viewMode === 'DUDI'
                  ? 'Siswa aktif PKL'
                  : `${overviewMetrics.plottedStudents} terplot · ${overviewMetrics.totalStudents - overviewMetrics.plottedStudents} belum plot`}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1.5">
              <div className="flex items-start justify-between gap-2 text-xs text-slate-500">
                <span className="leading-snug font-medium">Menunggu Kakomli</span>
                <Clock className="w-4 h-4 text-amber-600 shrink-0" />
              </div>
              <div className="text-2xl font-bold text-amber-700 tabular-nums leading-none">
                {overviewMetrics.pendingKakomli}
              </div>
              <div className="text-[11px] text-slate-500 leading-snug">
                Tahap terlaksana belum diverifikasi
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1.5">
              <div className="flex items-start justify-between gap-2 text-xs text-slate-500">
                <span className="leading-snug font-medium">Terverifikasi Kakomli &amp; Hubin</span>
                <CheckCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              </div>
              <div className="text-2xl font-bold text-emerald-700 tabular-nums leading-none">
                {overviewMetrics.verifiedHubin}
              </div>
              <div className="text-[11px] text-slate-500 leading-snug">
                {overviewMetrics.pendingHubin} menunggu validasi Hubin/Waka
              </div>
            </div>
          </div>

          {filteredGroups.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
              {viewMode === 'DUDI' ? (
                <Building2 className="w-9 h-9 text-slate-300 mx-auto" />
              ) : (
                <GraduationCap className="w-9 h-9 text-slate-300 mx-auto" />
              )}
              <div className="text-sm font-bold text-slate-800">
                Belum ada data {viewMode === 'DUDI' ? 'DUDI' : 'Kelas'} yang sesuai
              </div>
              <p className="text-xs text-slate-500">
                Sesuaikan pencarian, pilihan kompetensi keahlian, atau filter status di atas.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredGroups.map((group) => {
                const needsAttention = isKakomliRole
                  ? group.pendingKakomliCount > 0
                  : isStrictHubinWaitingKakomli
                  ? group.pendingHubinCount > 0
                  : isSuperAdmin
                  ? group.pendingKakomliCount > 0 || group.pendingHubinCount > 0
                  : false;

                return (
                  <button
                    key={group.key}
                    type="button"
                    onClick={() => handleSelectGroup(group)}
                    className={`text-left p-4 rounded-xl border bg-white hover:border-blue-400 hover:shadow-sm transition-all flex flex-col justify-between gap-3 cursor-pointer ${
                      needsAttention ? 'border-indigo-200 ring-1 ring-indigo-100' : 'border-slate-200'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-slate-900 leading-snug">
                            {group.title}
                          </h3>
                          <p className="text-[11px] text-slate-500 mt-0.5 flex items-start gap-1 leading-snug">
                            {viewMode === 'DUDI' ? (
                              <MapPin className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                            ) : (
                              <UserCheck className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                            )}
                            <span>{group.subtitle}</span>
                          </p>
                        </div>
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[11px] font-bold text-slate-800 tabular-nums shrink-0">
                          {group.students.length} Siswa
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-600 flex items-center justify-between gap-2">
                        <span className="leading-snug truncate">{group.secondaryLabel}</span>
                        {viewMode === 'KELAS' && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums shrink-0 ${
                              group.unplottedCount > 0
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            Plot {group.plottedCount}/{group.students.length}
                          </span>
                        )}
                      </div>

                      {group.jurusanList.length > 0 && (
                        <div className="text-[11px] text-slate-500 leading-snug">
                          Jurusan: {group.jurusanList.join(' · ')}
                        </div>
                      )}
                    </div>

                    <div className="pt-2.5 border-t border-slate-100 space-y-2">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tabular-nums">
                        <span className="font-semibold text-blue-700">
                          Menunggu Kakomli: {group.pendingKakomliCount}
                        </span>
                        <span className="font-semibold text-indigo-700">
                          Menunggu Hubin: {group.pendingHubinCount}
                        </span>
                        <span className="font-semibold text-emerald-700">
                          Terverifikasi: {group.verifiedHubinCount}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs font-bold text-blue-700">
                        <span>Buka Tabel Siswa &amp; Verifikasi</span>
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* LEVEL 2: GROUP DETAIL — MATRIX TABLE & PER-PHASE VERIFICATION */
        <div className="space-y-4">
          {/* Active Group Context Banner */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 leading-snug">
                  {activeGroup.title}
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-[11px] font-bold text-blue-800 tabular-nums">
                  {activeGroup.students.length} Siswa
                </span>
                {viewMode === 'KELAS' && activeGroup.unplottedCount > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-800 tabular-nums">
                    {activeGroup.unplottedCount} Belum Terplotting
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                <span>{activeGroup.secondaryLabel}</span>
                <span className="text-slate-300" aria-hidden="true">·</span>
                <span>{activeGroup.subtitle}</span>
              </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-slate-600 shrink-0">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <span>Terlaksana (Menunggu Kakomli)</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                <span>Tervalidasi Kakomli (Menunggu Hubin)</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                <span>Terverifikasi Kakomli &amp; Hubin</span>
              </span>
            </div>
          </div>

          {/* Fase Monitoring Selector + Manual Batch Verify Actions */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="text-xs font-bold text-slate-900">
                Pilih Fase Monitoring untuk Verifikasi:
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] tabular-nums">
                <span className="text-slate-500">
                  Belum diisi: <strong className="text-slate-800">{stageStats.notFilled}</strong>
                </span>
                {stageStats.disabledCount > 0 && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-400">
                      Nonaktif: <strong>{stageStats.disabledCount}</strong>
                    </span>
                  </>
                )}
                <span className="text-slate-300">·</span>
                <span className="text-blue-700 font-semibold">
                  Menunggu Kakomli: {stageStats.terlaksanaTargets.length}
                </span>
                <span className="text-slate-300">·</span>
                <span className="text-indigo-700 font-semibold">
                  Menunggu Hubin: {stageStats.kakomliTargets.length}
                </span>
                <span className="text-slate-300">·</span>
                <span className="text-emerald-700 font-semibold">
                  Lengkap (K+H): {stageStats.hubinTargets.length}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {MONITORING_STAGES.map((st) => {
                const isActive = selectedStageNum === st.num;
                const eligibleStudents = activeGroup.students.filter((s) =>
                  s.stagePolicy.enabledStages.includes(st.num)
                );
                const filledCount = activeGroup.students.filter((s) => {
                  const l = s.stageLogs[st.num];
                  return l?.monitoringId && normalizeVerificationStatus(l.status) !== 'Belum Terlaksana';
                }).length;
                const allDisabled = eligibleStudents.length === 0 && filledCount === 0;

                return (
                  <button
                    key={st.num}
                    type="button"
                    onClick={() => setSelectedStageNum(st.num)}
                    className={`min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-semibold shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-slate-900 border-slate-900 text-white'
                        : allDisabled
                        ? 'bg-slate-50/60 border-slate-200/80 text-slate-400 hover:bg-slate-100'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span>{st.label}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums ${
                        isActive ? 'bg-white/20 text-white' : 'bg-white text-slate-600 border border-slate-200'
                      }`}
                    >
                      {allDisabled
                        ? 'Nonaktif'
                        : `${filledCount}/${eligibleStudents.length || activeGroup.students.length}`}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Manual Verification Action Strip */}
            {(canVerifyKakomli || canVerifyHubin) && (
              <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-slate-500">
                  {isStrictHubinWaitingKakomli &&
                  stageStats.terlaksanaTargets.length > 0 &&
                  hubinEligibleTargets.length === 0
                    ? `${stageStats.terlaksanaTargets.length} siswa pada ${getStageValueByNumber(selectedStageNum)} masih menunggu ACC Kakomli sebelum Validasi Hubin dapat dilakukan.`
                    : (
                      <>
                        Verifikasi berjenjang (Kakomli lalu Hubin) pada{' '}
                        <strong className="text-slate-700">{getStageValueByNumber(selectedStageNum)}</strong>.
                      </>
                    )}
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  {canVerifyKakomli && stageStats.terlaksanaTargets.length > 0 && (
                    <button
                      type="button"
                      disabled={batchSaving}
                      onClick={() =>
                        setConfirmModal({
                          isOpen: true,
                          title: `Verifikasi Kakomli (${stageStats.terlaksanaTargets.length} Siswa)?`,
                          description: `Status tahap ${getStageValueByNumber(
                            selectedStageNum
                          )} untuk ${stageStats.terlaksanaTargets.length} siswa berstatus Terlaksana di ${
                            activeGroup.title
                          } akan diverifikasi menjadi Tervalidasi Kakomli.`,
                          confirmText: 'Ya, Verifikasi Kakomli',
                          variant: 'primary',
                          onConfirm: async () => {
                            await handleBatchVerify(
                              stageStats.terlaksanaTargets,
                              'Tervalidasi Kakomli'
                            );
                          },
                        })
                      }
                      className="h-9 px-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        Verifikasi Kakomli Tahap {selectedStageNum} ({stageStats.terlaksanaTargets.length})
                      </span>
                    </button>
                  )}

                  {canVerifyHubin && hubinEligibleTargets.length > 0 && (
                    <button
                      type="button"
                      disabled={batchSaving}
                      onClick={() =>
                        setConfirmModal({
                          isOpen: true,
                          title: `Verifikasi Hubin (${hubinEligibleTargets.length} Siswa)?`,
                          description: `Status tahap ${getStageValueByNumber(
                            selectedStageNum
                          )} untuk ${hubinEligibleTargets.length} siswa di ${
                            activeGroup.title
                          } akan divalidasi menjadi Tervalidasi Hubin.`,
                          confirmText: 'Ya, Validasi Hubin',
                          variant: 'success',
                          onConfirm: async () => {
                            await handleBatchVerify(hubinEligibleTargets, 'Tervalidasi Hubin');
                          },
                        })
                      }
                      className="h-9 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    >
                      <CheckCheck className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        Verifikasi Hubin Tahap {selectedStageNum} ({hubinEligibleTargets.length})
                      </span>
                    </button>
                  )}

                  {isSuperAdmin && stageStats.terlaksanaTargets.length > 0 && (
                    <button
                      type="button"
                      disabled={batchSaving}
                      onClick={() =>
                        setConfirmModal({
                          isOpen: true,
                          title: `Bypass Kakomli & Validasi Hubin (${stageStats.terlaksanaTargets.length} Siswa)?`,
                          description: `SuperAdmin Override: ${stageStats.terlaksanaTargets.length} siswa berstatus Terlaksana pada ${getStageValueByNumber(
                            selectedStageNum
                          )} di ${activeGroup.title} akan langsung divalidasi menjadi Tervalidasi Hubin tanpa menunggu ACC Kakomli.`,
                          confirmText: 'Ya, Bypass ke Hubin',
                          variant: 'danger',
                          onConfirm: async () => {
                            await handleBatchVerify(
                              stageStats.terlaksanaTargets,
                              'Tervalidasi Hubin'
                            );
                          },
                        })
                      }
                      className="h-9 px-3.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    >
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>
                        Bypass Kakomli → Hubin ({stageStats.terlaksanaTargets.length})
                      </span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Matrix Table: Student x Monitoring Phases */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                    <th className="py-3 px-3.5 sticky left-0 z-10 bg-slate-50 border-r border-slate-200 min-w-[190px] sm:min-w-[235px]">
                      {viewMode === 'DUDI' ? 'Siswa & Jurusan' : 'Siswa & Lokasi DUDI'}
                    </th>
                    {MONITORING_STAGES.map((st) => {
                      const isActiveCol = st.num === selectedStageNum;
                      const headerLabel = st.num === 5 ? 'Mon 4' : st.shortLabel;
                      return (
                        <th
                          key={st.num}
                          onClick={() => setSelectedStageNum(st.num)}
                          className={`py-2.5 px-2 text-center min-w-[82px] cursor-pointer transition-colors select-none ${
                            isActiveCol
                              ? 'bg-blue-50 text-blue-900 border-b-2 border-b-blue-600'
                              : 'hover:bg-slate-100'
                          }`}
                        >
                          <div className="font-mono text-[10px] text-slate-400">Tahap {st.num}</div>
                          <div className="whitespace-nowrap">{headerLabel}</div>
                        </th>
                      );
                    })}
                    <th
                      className="py-2.5 px-2.5 text-center min-w-[76px]"
                      title="Akumulasi Sakit / Izin / Alpha (termasuk Perizinan SO/SD/I; Dispensasi ID tidak dijumlahkan)"
                    >
                      S/I/A
                    </th>
                    <th className="py-2.5 px-2.5 text-center min-w-[64px]">Nilai</th>
                    <th className="py-2.5 px-3 text-right min-w-[155px]">
                      Aksi Tahap {selectedStageNum}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeGroup.students.map((student) => {
                    const activeLog = student.stageLogs[selectedStageNum];
                    const activeStatus = activeLog?.monitoringId
                      ? normalizeVerificationStatus(activeLog.status)
                      : 'Belum Terlaksana';
                    const isStageEnabled = student.stagePolicy.enabledStages.includes(selectedStageNum);
                    const isRowSaving = Boolean(
                      activeLog?.monitoringId && savingId === activeLog.monitoringId
                    );

                    return (
                      <tr key={student.placementId} className="hover:bg-slate-50/60">
                        <td className="py-2.5 px-3.5 sticky left-0 z-10 bg-white border-r border-slate-100 align-middle">
                          <div className="font-bold text-slate-900 leading-snug">
                            {student.namaSiswa}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                            {formatNisVisual(student.nis)} · {student.kelas}
                          </div>
                          {viewMode === 'KELAS' ? (
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              {student.isPlotted ? (
                                <span className="text-[11px] font-medium text-blue-700 leading-snug">
                                  {student.namaDudi}
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-semibold">
                                  Belum Terplotting
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {student.jurusan}
                              {student.stagePolicy.isCustomJurusanPolicy
                                ? ` · ${student.stagePolicy.totalStages} tahap`
                                : ''}
                            </div>
                          )}
                        </td>

                        {MONITORING_STAGES.map((st) => {
                          const isActiveCol = st.num === selectedStageNum;
                          return (
                            <td
                              key={st.num}
                              className={`py-2 px-1.5 text-center align-middle ${
                                isActiveCol ? 'bg-blue-50/35' : ''
                              }`}
                            >
                              {renderStageCellBadge(student, st.num, isActiveCol)}
                            </td>
                          );
                        })}

                        <td
                          className="py-2 px-2.5 text-center align-middle font-mono text-slate-700 tabular-nums whitespace-nowrap"
                          title={
                            student.perizinanSakit > 0 ||
                            student.perizinanIzin > 0 ||
                            student.dispensasiDays > 0
                              ? `Dari Perizinan: Sakit +${student.perizinanSakit} hr, Izin +${student.perizinanIzin} hr${
                                  student.dispensasiDays > 0
                                    ? ` (Dispensasi ${student.dispensasiDays} hr tdk dijumlahkan)`
                                    : ''
                                }`
                              : 'Akumulasi Monitoring + Perizinan (SO/SD/I)'
                          }
                        >
                          <span>
                            {student.sakit}/{student.izin}/{student.alpha}
                          </span>
                          {(student.perizinanSakit > 0 || student.perizinanIzin > 0) && (
                            <div className="text-[10px] text-blue-600 font-sans font-semibold leading-tight mt-0.5">
                              +Izin
                            </div>
                          )}
                        </td>

                        <td className="py-2 px-2.5 text-center align-middle font-mono font-bold tabular-nums">
                          {student.hasGrade && student.rataRataNilai !== null ? (
                            <span className="text-emerald-700">{student.rataRataNilai}</span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        <td className="py-2 px-3 text-right align-middle whitespace-nowrap">
                          {!activeLog || !activeLog.monitoringId || activeStatus === 'Belum Terlaksana' ? (
                            <span className="text-[11px] text-slate-400">
                              {isStageEnabled ? 'Belum ada data' : 'Nonaktif jurusan'}
                            </span>
                          ) : (
                            <div className="inline-flex items-center justify-end gap-1.5">
                              {canVerifyKakomli && activeStatus === 'Terlaksana' && (
                                <button
                                  type="button"
                                  disabled={isRowSaving || batchSaving}
                                  onClick={() =>
                                    handleUpdateSingleVerification(
                                      student,
                                      activeLog,
                                      'Tervalidasi Kakomli'
                                    )
                                  }
                                  className="h-8 px-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                >
                                  {isRowSaving ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <ClipboardCheck className="w-3.5 h-3.5" />
                                  )}
                                  <span>Verifikasi</span>
                                </button>
                              )}

                              {isSuperAdmin && activeStatus === 'Terlaksana' && (
                                <button
                                  type="button"
                                  disabled={isRowSaving || batchSaving}
                                  onClick={() => confirmSuperAdminBypassSingle(student, activeLog)}
                                  title="SuperAdmin Bypass: Validasi Hubin tanpa menunggu Kakomli"
                                  className="h-8 px-2.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                >
                                  <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                                  <span>Bypass</span>
                                </button>
                              )}

                              {canVerifyHubin && activeStatus === 'Tervalidasi Kakomli' && (
                                <button
                                  type="button"
                                  disabled={isRowSaving || batchSaving}
                                  onClick={() =>
                                    handleUpdateSingleVerification(
                                      student,
                                      activeLog,
                                      'Tervalidasi Hubin'
                                    )
                                  }
                                  className="h-8 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                >
                                  {isRowSaving ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <CheckCheck className="w-3.5 h-3.5" />
                                  )}
                                  <span>Validasi Hubin</span>
                                </button>
                              )}

                              {isStrictHubinWaitingKakomli && activeStatus === 'Terlaksana' && (
                                <span
                                  className="px-2 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-semibold inline-flex items-center gap-1"
                                  title="Validasi Hubin wajib menunggu persetujuan Kakomli terlebih dahulu"
                                >
                                  <Lock className="w-3 h-3 text-amber-600 shrink-0" />
                                  <span>Menunggu ACC Kakomli</span>
                                </span>
                              )}

                              <button
                                type="button"
                                onClick={() => setInspectTarget({ student, log: activeLog })}
                                className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                                title="Lihat rincian catatan monitoring"
                              >
                                <Eye className="w-3.5 h-3.5 text-slate-500" />
                                <span>Detail</span>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Detail & Manual Verification Modal */}
      {inspectTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/55 backdrop-blur-[2px]"
          onClick={() => savingId !== inspectTarget.log.monitoringId && setInspectTarget(null)}
        >
          <div
            className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900 leading-snug">
                  {inspectTarget.student.namaSiswa}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {getStageValueByNumber(inspectTarget.log.stageNum)} · {inspectTarget.student.kelas} ·{' '}
                  {inspectTarget.student.namaDudi}
                </p>
              </div>
              <button
                type="button"
                disabled={savingId === inspectTarget.log.monitoringId}
                onClick={() => setInspectTarget(null)}
                aria-label="Tutup detail monitoring"
                className="w-8 h-8 rounded-lg hover:bg-slate-200/70 text-slate-500 flex items-center justify-center cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <TopProgressBar
              active={savingId === inspectTarget.log.monitoringId}
              label="Menyimpan verifikasi monitoring ke Cloud Server"
            />

            <div className="p-5 overflow-y-auto space-y-3.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50/70">
                <div>
                  <div className="text-[11px] text-slate-500">Status Verifikasi Tahap Ini</div>
                  <div className="font-bold text-slate-900 mt-0.5">
                    {normalizeVerificationStatus(inspectTarget.log.status)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-slate-500">Tanggal Kunjungan</div>
                  <div className="font-semibold text-slate-800 mt-0.5">
                    {inspectTarget.log.tanggal
                      ? formatIndonesianDate(inspectTarget.log.tanggal)
                      : '-'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-xl border border-slate-200">
                  <div className="text-[11px] text-slate-500">Absensi Tahap Ini (S / I / A)</div>
                  <div className="font-mono font-bold text-slate-900 mt-0.5 tabular-nums">
                    {inspectTarget.log.sakit} / {inspectTarget.log.izin} / {inspectTarget.log.alpha}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1 tabular-nums">
                    Total Akumulasi: <b>{inspectTarget.student.sakit}/{inspectTarget.student.izin}/{inspectTarget.student.alpha}</b>
                    {(inspectTarget.student.perizinanSakit > 0 || inspectTarget.student.perizinanIzin > 0)
                      ? ` (termasuk Izin S+${inspectTarget.student.perizinanSakit}, I+${inspectTarget.student.perizinanIzin})`
                      : ''}
                  </div>
                </div>
                <div className="p-3 rounded-xl border border-slate-200">
                  <div className="text-[11px] text-slate-500">Buku Laporan</div>
                  <div className="font-bold text-slate-900 mt-0.5">
                    {inspectTarget.log.bukuLaporan || '-'}
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl border border-slate-200 space-y-1">
                <div className="text-[11px] text-slate-500">Aktivitas &amp; Sikap Siswa</div>
                <div className="font-semibold text-slate-800">
                  Disiplin: {inspectTarget.log.aktivitasDp || '-'} · Motivasi:{' '}
                  {inspectTarget.log.aktivitasMt || '-'} · Kreativitas:{' '}
                  {inspectTarget.log.aktivitasKrt || '-'}
                </div>
              </div>

              {inspectTarget.log.kompetensiList.length > 0 && (
                <div className="p-3 rounded-xl border border-slate-200 space-y-1">
                  <div className="text-[11px] text-slate-500">Kompetensi Didapat</div>
                  <ul className="list-decimal pl-4 space-y-0.5 text-slate-800">
                    {inspectTarget.log.kompetensiList.map((k, idx) => (
                      <li key={idx}>{k}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="p-3 rounded-xl border border-slate-200 space-y-1">
                <div className="text-[11px] text-slate-500">Catatan Kunjungan Guru</div>
                <p className="text-slate-800 leading-relaxed whitespace-pre-wrap">
                  {inspectTarget.log.catatan || 'Tidak ada catatan tambahan.'}
                </p>
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                disabled={savingId === inspectTarget.log.monitoringId}
                onClick={() => setInspectTarget(null)}
                className="h-9 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Tutup
              </button>

              {canVerifyKakomli &&
                normalizeVerificationStatus(inspectTarget.log.status) === 'Terlaksana' && (
                  <button
                    type="button"
                    disabled={savingId === inspectTarget.log.monitoringId}
                    onClick={() =>
                      handleUpdateSingleVerification(
                        inspectTarget.student,
                        inspectTarget.log,
                        'Tervalidasi Kakomli'
                      )
                    }
                    className="h-9 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingId === inspectTarget.log.monitoringId ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {savingId === inspectTarget.log.monitoringId
                        ? 'Menyimpan...'
                        : 'Verifikasi Kakomli'}
                    </span>
                  </button>
                )}

              {isSuperAdmin &&
                normalizeVerificationStatus(inspectTarget.log.status) === 'Terlaksana' && (
                  <button
                    type="button"
                    disabled={savingId === inspectTarget.log.monitoringId}
                    onClick={() =>
                      confirmSuperAdminBypassSingle(inspectTarget.student, inspectTarget.log)
                    }
                    className="h-9 px-3.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                    <span>Bypass Kakomli &amp; Validasi Hubin</span>
                  </button>
                )}

              {canVerifyHubin &&
                normalizeVerificationStatus(inspectTarget.log.status) === 'Tervalidasi Kakomli' && (
                  <button
                    type="button"
                    disabled={savingId === inspectTarget.log.monitoringId}
                    onClick={() =>
                      handleUpdateSingleVerification(
                        inspectTarget.student,
                        inspectTarget.log,
                        'Tervalidasi Hubin'
                      )
                    }
                    className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingId === inspectTarget.log.monitoringId ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCheck className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {savingId === inspectTarget.log.monitoringId
                        ? 'Menyimpan...'
                        : 'Verifikasi Hubin'}
                    </span>
                  </button>
                )}

              {isStrictHubinWaitingKakomli &&
                normalizeVerificationStatus(inspectTarget.log.status) === 'Terlaksana' && (
                  <span className="text-[11px] font-medium text-amber-800 inline-flex items-center gap-1 mr-auto">
                    <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>Menunggu ACC Kakomli sebelum validasi Hubin.</span>
                  </span>
                )}
            </div>

            <CrudLoadingOverlay
              visible={savingId === inspectTarget.log.monitoringId}
              tone="emerald"
              title="Menyimpan Verifikasi ke Cloud Server..."
              subtitle="Mohon tunggu sejenak hingga status verifikasi diperbarui."
            />
          </div>
        </div>
      )}

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
