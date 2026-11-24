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
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import type { AdminSessionUser } from '../core/auth/LocalAccountAuthService';
import {
  Dudi,
  Jurusan,
  MONITORING_STAGES,
  Monitoring,
  PenempatanPKL,
  Sertifikat,
  Siswa,
  UserRole,
} from '../core/types/schema';
import { ToastManager } from '../core/ToastManager';
import { formatIndonesianDate } from '../core/utils/dateHelpers';
import {
  StageLogEntry,
  buildMonitoringLookupIndex,
  buildStudentMonitoringSummary,
  getStageValueByNumber,
} from '../core/utils/monitoringHelpers';
import { formatNisVisual, stripNisSymbols } from '../core/utils/nisHelpers';
import { isActivePlacementStatus, normalizeRelationText } from '../core/utils/relationHelpers';
import { DudiService } from '../services/DudiService';
import { JurusanService } from '../services/JurusanService';
import { MonitoringService } from '../services/MonitoringService';
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

interface StudentMatrixRow {
  placementId: string;
  nis: string;
  namaSiswa: string;
  kelas: string;
  jurusan: string;
  namaDudi: string;
  idDudi: string;
  guruPendamping: string;
  stageLogs: Record<number, StageLogEntry>;
  completedStages: number[];
  highestStage: number;
  hasGrade: boolean;
  rataRataNilai: number | null;
}

interface DudiRecapGroup {
  key: string;
  idDudi: string;
  namaDudi: string;
  alamat: string;
  guruPendamping: string;
  jurusanList: string[];
  students: StudentMatrixRow[];
  totalLogs: number;
  pendingKakomliCount: number;
  pendingHubinCount: number;
  verifiedHubinCount: number;
  highestStage: number;
}

function cleanPersonTitle(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/\b(drs?|ir|hj|h|prof|s\.?pd|s\.?kom|s\.?t|s\.?si|s\.?ag|m\.?pd|m\.?kom|m\.?t|m\.?m|a\.?md)\b\.?/gi, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchJurusanItem(rawJurusan: string, jur: Jurusan): boolean {
  const target = String(rawJurusan || '').trim().toLowerCase();
  if (!target || target === '-') return false;
  const kode = String(jur.kode || '').trim().toLowerCase();
  const nama = String(jur.nama || '').trim().toLowerCase();
  return (
    target === kode ||
    target === nama ||
    (kode.length >= 2 &&
      (target.startsWith(`${kode} `) ||
        target.includes(`(${kode})`) ||
        new RegExp(`\\b${kode}\\b`, 'i').test(target))) ||
    (nama.length >= 4 && (target.includes(nama) || nama.includes(target)))
  );
}

function resolveKakomliJurusan(
  currentUser: AdminSessionUser | null,
  jurusanList: Jurusan[]
): Jurusan | null {
  if (!currentUser || jurusanList.length === 0) return null;
  const userNameClean = cleanPersonTitle(currentUser.name);
  const userTitleRaw = `${currentUser.title || ''} ${currentUser.username || ''}`.toLowerCase();

  // 1. Exact or strong person-name match with Master_Jurusan.namaKakomli
  if (userNameClean && !userNameClean.includes('ketua konsentrasi') && !userNameClean.includes('kakomli')) {
    const byName = jurusanList.find((j) => {
      const kakomliClean = cleanPersonTitle(j.namaKakomli);
      if (!kakomliClean || kakomliClean.length < 3) return false;
      return (
        kakomliClean === userNameClean ||
        kakomliClean.includes(userNameClean) ||
        userNameClean.includes(kakomliClean)
      );
    });
    if (byName) return byName;
  }

  // 2. Check if username or title explicitly specifies a Jurusan code or name
  const byTitleOrCode = jurusanList.find((j) => {
    const kode = String(j.kode || '').trim().toLowerCase();
    const nama = String(j.nama || '').trim().toLowerCase();
    return (
      (kode.length >= 2 && new RegExp(`\\b${kode}\\b`, 'i').test(userTitleRaw)) ||
      (nama.length >= 5 && userTitleRaw.includes(nama))
    );
  });
  return byTitleOrCode || null;
}

function normalizeVerificationStatus(raw?: string): VerificationStatus {
  const low = String(raw || '').trim().toLowerCase();
  if (!low || low.includes('belum')) return 'Belum Terlaksana';
  if (low.includes('hubin')) return 'Tervalidasi Hubin';
  if (low.includes('kakomli')) return 'Tervalidasi Kakomli';
  return 'Terlaksana';
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
  const [monitoringList, setMonitoringList] = useState<Monitoring[]>([]);
  const [sertifikatList, setSertifikatList] = useState<Sertifikat[]>([]);

  const [search, setSearch] = useState('');
  const [selectedJurusanKey, setSelectedJurusanKey] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'PENDING_KAKOMLI' | 'PENDING_HUBIN' | 'ALL_VERIFIED'
  >('ALL');
  const [selectedDudiKey, setSelectedDudiKey] = useState<string | null>(null);
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

  const canVerifyKakomli = userRole === 'Kakomli' || userRole === 'SuperAdmin';
  const canVerifyHubin = userRole === 'Waka' || userRole === 'Hubin' || userRole === 'SuperAdmin';
  const isKakomliRole = userRole === 'Kakomli';

  const loadAllData = useCallback(async (forceReload = false) => {
    if (forceReload) setRevalidating(true);
    else setLoading(true);
    try {
      const dSvc = DudiService.getInstance();
      const pSvc = SiswaPklService.getInstance();
      const sSvc = SiswaService.getInstance();
      const jSvc = JurusanService.getInstance();
      const mSvc = MonitoringService.getInstance();
      const cSvc = SertifikatService.getInstance();

      if (forceReload) {
        await Promise.all([
          dSvc.reloadFromSpreadsheet().catch(() => []),
          pSvc.reloadFromSpreadsheet().catch(() => []),
          sSvc.reloadFromSpreadsheet().catch(() => []),
          jSvc.reloadFromSpreadsheet().catch(() => []),
          mSvc.reloadFromSpreadsheet().catch(() => []),
          cSvc.reloadFromSpreadsheet().catch(() => []),
        ]);
      }

      const [dRows, pRows, sRows, jRows, mRows, cRows] = await Promise.all([
        dSvc.getAll(),
        pSvc.getAll(),
        sSvc.getAll(),
        jSvc.getAll(),
        mSvc.getAll(),
        cSvc.getAll(),
      ]);

      setDudiList(dRows);
      setPenempatanList(pRows);
      setSiswaList(sRows);
      setJurusanList(jRows);
      setMonitoringList(mRows);
      setSertifikatList(cRows);
    } catch (err: any) {
      ToastManager.getInstance().show(
        'Gagal Memuat Rekap DUDI',
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

  // Auto-resolve Kakomli's Jurusan from Master_Jurusan (Kompetensi Keahlian)
  const matchedKakomliJurusan = useMemo(() => {
    if (!isKakomliRole) return null;
    return resolveKakomliJurusan(currentUser, jurusanList);
  }, [isKakomliRole, currentUser, jurusanList]);

  useEffect(() => {
    if (isKakomliRole) {
      if (matchedKakomliJurusan) {
        setSelectedJurusanKey(matchedKakomliJurusan.kode || matchedKakomliJurusan.id);
      } else if (selectedJurusanKey === 'ALL' && jurusanList.length > 0) {
        setSelectedJurusanKey(jurusanList[0].kode || jurusanList[0].id);
      }
    } else if (!isKakomliRole && selectedJurusanKey !== 'ALL') {
      // Keep user's explicit selection if valid
      const exists = jurusanList.some(
        (j) => j.kode === selectedJurusanKey || j.id === selectedJurusanKey
      );
      if (!exists) setSelectedJurusanKey('ALL');
    }
  }, [isKakomliRole, matchedKakomliJurusan, jurusanList, selectedJurusanKey]);

  const activeJurusanObj = useMemo(() => {
    if (selectedJurusanKey === 'ALL') return null;
    return (
      jurusanList.find((j) => j.kode === selectedJurusanKey || j.id === selectedJurusanKey) || null
    );
  }, [jurusanList, selectedJurusanKey]);

  // Build Student Matrix Rows & Group by DUDI
  const dudiGroups = useMemo<DudiRecapGroup[]>(() => {
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

    const monitoringIndex = buildMonitoringLookupIndex(monitoringList, sertifikatList);
    const activePlacements = penempatanList.filter((p) =>
      isActivePlacementStatus(p.statusPenempatan)
    );

    const groupMap = new Map<string, DudiRecapGroup>();

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

      // Filter by active Jurusan (always enforced for Kakomli or when admin picks a Jurusan)
      if (activeJurusanObj && !matchJurusanItem(resolvedJurusan, activeJurusanObj)) {
        continue;
      }

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

      const studentRow: StudentMatrixRow = {
        placementId: p.idPenempatan || p.id,
        nis: p.nis,
        namaSiswa: p.namaSiswa,
        kelas: resolvedKelas,
        jurusan: resolvedJurusan,
        namaDudi: dudiName,
        idDudi: dudiObj?.id || p.idDudi || '',
        guruPendamping: p.guruPendamping || dudiObj?.guruPendamping || '-',
        stageLogs: summary.stageLogs,
        completedStages: summary.completedStages,
        highestStage,
        hasGrade: summary.hasSubmittedGrades,
        rataRataNilai: summary.submittedGradeSummary?.rataRata ?? null,
      };

      let group = groupMap.get(dudiKey);
      if (!group) {
        group = {
          key: dudiKey,
          idDudi: dudiObj?.id || p.idDudi || '',
          namaDudi: dudiName,
          alamat: dudiObj?.alamat || dudiObj?.wilayahKota || '-',
          guruPendamping: p.guruPendamping || dudiObj?.guruPendamping || '-',
          jurusanList: [],
          students: [],
          totalLogs: 0,
          pendingKakomliCount: 0,
          pendingHubinCount: 0,
          verifiedHubinCount: 0,
          highestStage: 0,
        };
        groupMap.set(dudiKey, group);
      }

      group.students.push(studentRow);
      if (resolvedJurusan && resolvedJurusan !== '-' && !group.jurusanList.includes(resolvedJurusan)) {
        group.jurusanList.push(resolvedJurusan);
      }
      if (highestStage > group.highestStage) group.highestStage = highestStage;

      for (const stNum of summary.completedStages) {
        const log = summary.stageLogs[stNum];
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
    }

    return Array.from(groupMap.values()).sort((a, b) =>
      a.namaDudi.localeCompare(b.namaDudi, 'id')
    );
  }, [
    dudiList,
    penempatanList,
    siswaList,
    monitoringList,
    sertifikatList,
    activeJurusanObj,
  ]);

  const deferredSearch = useDeferredValue(search);

  const filteredDudiGroups = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    const qDigits = !/[a-z]/i.test(deferredSearch) ? stripNisSymbols(deferredSearch) : '';
    return dudiGroups.filter((g) => {
      if (statusFilter === 'PENDING_KAKOMLI' && g.pendingKakomliCount === 0) return false;
      if (
        statusFilter === 'PENDING_HUBIN' &&
        g.pendingHubinCount === 0 &&
        g.pendingKakomliCount === 0
      ) {
        return false;
      }
      if (
        statusFilter === 'ALL_VERIFIED' &&
        (g.totalLogs === 0 || g.pendingKakomliCount > 0 || g.pendingHubinCount > 0)
      ) {
        return false;
      }
      if (!q && qDigits.length < 3) return true;
      if (
        q &&
        (g.namaDudi.toLowerCase().includes(q) ||
          g.alamat.toLowerCase().includes(q) ||
          g.guruPendamping.toLowerCase().includes(q))
      ) {
        return true;
      }
      return g.students.some(
        (s) =>
          (q &&
            (s.namaSiswa.toLowerCase().includes(q) ||
              s.nis.toLowerCase().includes(q) ||
              s.kelas.toLowerCase().includes(q))) ||
          (qDigits.length >= 3 && stripNisSymbols(s.nis).includes(qDigits))
      );
    });
  }, [dudiGroups, deferredSearch, statusFilter]);

  const activeDudiGroup = useMemo(() => {
    if (!selectedDudiKey) return null;
    return dudiGroups.find((g) => g.key === selectedDudiKey) || null;
  }, [dudiGroups, selectedDudiKey]);

  // Global summary metrics
  const overviewMetrics = useMemo(() => {
    let totalStudents = 0;
    let pendingKakomli = 0;
    let pendingHubin = 0;
    let verifiedHubin = 0;
    for (const g of filteredDudiGroups) {
      totalStudents += g.students.length;
      pendingKakomli += g.pendingKakomliCount;
      pendingHubin += g.pendingHubinCount;
      verifiedHubin += g.verifiedHubinCount;
    }
    return {
      totalDudi: filteredDudiGroups.length,
      totalStudents,
      pendingKakomli,
      pendingHubin,
      verifiedHubin,
    };
  }, [filteredDudiGroups]);

  // Auto-select most relevant stage when opening a DUDI
  const handleSelectDudi = (group: DudiRecapGroup) => {
    setSelectedDudiKey(group.key);
    // Pick earliest stage needing verification by current role, else highest stage
    for (const st of MONITORING_STAGES) {
      const hasPendingKakomli = group.students.some((s) => {
        const l = s.stageLogs[st.num];
        return l?.monitoringId && normalizeVerificationStatus(l.status) === 'Terlaksana';
      });
      const hasPendingHubin = group.students.some((s) => {
        const l = s.stageLogs[st.num];
        const status = normalizeVerificationStatus(l?.status);
        return (
          l?.monitoringId &&
          (status === 'Tervalidasi Kakomli' || status === 'Terlaksana')
        );
      });
      if (isKakomliRole && hasPendingKakomli) {
        setSelectedStageNum(st.num);
        return;
      }
      if (canVerifyHubin && hasPendingHubin) {
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
        'Data Supervisi Belum Tersimpan',
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

  // Persist batch verification for active DUDI + active Fase Supervisi
  const handleBatchVerify = async (
    targets: Array<{ student: StudentMatrixRow; log: StageLogEntry }>,
    nextStatus: VerificationStatus
  ) => {
    if (targets.length === 0) return;
    setBatchSaving(true);
    const toastId = ToastManager.getInstance().show(
      `Memverifikasi ${targets.length} Siswa...`,
      'pending',
      `Menyimpan status ${nextStatus} ke Cloud Server`
    );

    try {
      const monSvc = MonitoringService.getInstance();
      let done = 0;
      for (const item of targets) {
        if (!item.log.monitoringId) continue;
        await monSvc.update(item.log.monitoringId, { statusTahap: nextStatus });
        done += 1;
      }
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

  // Stage-level eligible targets in active DUDI
  const stageStats = useMemo(() => {
    if (!activeDudiGroup) {
      return {
        notFilled: 0,
        terlaksanaTargets: [] as Array<{ student: StudentMatrixRow; log: StageLogEntry }>,
        kakomliTargets: [] as Array<{ student: StudentMatrixRow; log: StageLogEntry }>,
        hubinTargets: [] as Array<{ student: StudentMatrixRow; log: StageLogEntry }>,
      };
    }

    let notFilled = 0;
    const terlaksanaTargets: Array<{ student: StudentMatrixRow; log: StageLogEntry }> = [];
    const kakomliTargets: Array<{ student: StudentMatrixRow; log: StageLogEntry }> = [];
    const hubinTargets: Array<{ student: StudentMatrixRow; log: StageLogEntry }> = [];

    for (const student of activeDudiGroup.students) {
      const log = student.stageLogs[selectedStageNum];
      if (!log || !log.monitoringId) {
        notFilled += 1;
        continue;
      }
      const st = normalizeVerificationStatus(log.status);
      if (st === 'Belum Terlaksana') {
        notFilled += 1;
      } else if (st === 'Terlaksana') {
        terlaksanaTargets.push({ student, log });
      } else if (st === 'Tervalidasi Kakomli') {
        kakomliTargets.push({ student, log });
      } else if (st === 'Tervalidasi Hubin') {
        hubinTargets.push({ student, log });
      }
    }

    return { notFilled, terlaksanaTargets, kakomliTargets, hubinTargets };
  }, [activeDudiGroup, selectedStageNum]);

  const hubinEligibleTargets = useMemo(
    () => [...stageStats.kakomliTargets, ...stageStats.terlaksanaTargets],
    [stageStats]
  );

  const renderStageCellBadge = (
    student: StudentMatrixRow,
    stageNum: number,
    isActiveCol: boolean
  ) => {
    const log = student.stageLogs[stageNum];
    if (!log || !log.monitoringId) {
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

    // Status === 'Terlaksana' (Otomatis tercentang setelah guru pembimbing isi)
    return (
      <button
        type="button"
        onClick={() => setInspectTarget({ student, log })}
        title={`Tahap ${stageNum}: Sudah Terlaksana oleh Guru (${log.tanggal || '-'}), siap verifikasi`}
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
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pb-3 border-b border-slate-200">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight leading-snug">
            Rekap Monitoring Per DUDI
          </h1>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            {isKakomliRole
              ? 'Daftar mitra DUDI dan verifikasi manual progres supervisi siswa per fase sesuai kompetensi keahlian.'
              : canVerifyHubin
              ? 'Pantau progres 8 tahap per DUDI dan lakukan validasi Hubin secara manual per fase supervisi.'
              : 'Ringkasan status pelaksanaan & verifikasi supervisi 8 tahap seluruh siswa per mitra DUDI.'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadAllData(true)}
          disabled={loading || revalidating || batchSaving}
          className="h-9 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 self-start sm:self-auto shrink-0 cursor-pointer disabled:opacity-50 whitespace-nowrap"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${
              loading || revalidating ? 'animate-spin text-blue-600' : 'text-slate-500'
            }`}
          />
          <span>{revalidating ? 'Menyegarkan...' : 'Segarkan Data'}</span>
        </button>
      </div>

      <TopProgressBar
        active={loading || revalidating || batchSaving || Boolean(savingId)}
        label="Menyinkronkan rekap monitoring dengan Cloud Server"
        className="rounded-full"
      />

      {/* Filter & Jurusan Context Bar (shown on Level 1 & shows Jurusan lock info on Level 2 too) */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col md:flex-row md:items-center gap-2.5">
        {/* Jurusan Selector / Kakomli Lock */}
        <div className="w-full md:w-72 shrink-0">
          {isKakomliRole && matchedKakomliJurusan ? (
            <div className="h-9 px-3 rounded-lg bg-indigo-50 border border-indigo-200 text-xs font-semibold text-indigo-900 flex items-center justify-between gap-2">
              <span className="truncate">
                Jurusan: {matchedKakomliJurusan.kode} — {matchedKakomliJurusan.nama}
              </span>
              <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
            </div>
          ) : (
            <select
              value={selectedJurusanKey}
              onChange={(e) => {
                setSelectedJurusanKey(e.target.value);
                setSelectedDudiKey(null);
              }}
              aria-label="Filter Kompetensi Keahlian"
              className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:bg-white cursor-pointer"
            >
              {!isKakomliRole && <option value="ALL">Semua Kompetensi Keahlian</option>}
              {jurusanList.map((j) => (
                <option key={j.id} value={j.kode || j.id}>
                  {j.kode} — {j.nama}
                </option>
              ))}
            </select>
          )}
        </div>

        {!activeDudiGroup && (
          <>
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari DUDI, pembimbing, atau nama/NIS siswa..."
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
              <option value="PENDING_KAKOMLI">Perlu Verifikasi Kakomli</option>
              <option value="PENDING_HUBIN">Perlu Verifikasi Hubin / Waka</option>
              <option value="ALL_VERIFIED">Semua Sudah Terverifikasi</option>
            </select>
          </>
        )}

        {activeDudiGroup && (
          <div className="flex-1 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setSelectedDudiKey(null)}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kembali ke Daftar DUDI</span>
            </button>
            <span className="text-xs font-medium text-slate-500 hidden sm:inline">
              Menampilkan {activeDudiGroup.students.length} siswa aktif
            </span>
          </div>
        )}
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 flex flex-col items-center justify-center gap-2.5 text-xs text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          <span>Memuat rekap monitoring per DUDI dari Cloud Server...</span>
        </div>
      ) : !activeDudiGroup ? (
        /* LEVEL 1: DUDI LIST VIEW */
        <div className="space-y-4">
          {/* 4 Summary Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1.5">
              <div className="flex items-start justify-between gap-2 text-xs text-slate-500">
                <span className="leading-snug font-medium">DUDI Aktif</span>
                <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
              </div>
              <div className="text-2xl font-bold text-slate-900 tabular-nums leading-none">
                {overviewMetrics.totalDudi}
              </div>
              <div className="text-[11px] text-slate-500 leading-snug">
                Lokasi penempatan aktif
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1.5">
              <div className="flex items-start justify-between gap-2 text-xs text-slate-500">
                <span className="leading-snug font-medium">Siswa Terpantau</span>
                <Users className="w-4 h-4 text-indigo-600 shrink-0" />
              </div>
              <div className="text-2xl font-bold text-slate-900 tabular-nums leading-none">
                {overviewMetrics.totalStudents}
              </div>
              <div className="text-[11px] text-slate-500 leading-snug">
                Siswa aktif PKL
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
                <span className="leading-snug font-medium">Tervalidasi Hubin</span>
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

          {filteredDudiGroups.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
              <Building2 className="w-9 h-9 text-slate-300 mx-auto" />
              <div className="text-sm font-bold text-slate-800">
                Belum ada data DUDI yang sesuai
              </div>
              <p className="text-xs text-slate-500">
                Sesuaikan pencarian, pilihan kompetensi keahlian, atau filter status di atas.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredDudiGroups.map((group) => {
                const needsAttention = isKakomliRole
                  ? group.pendingKakomliCount > 0
                  : canVerifyHubin
                  ? group.pendingHubinCount > 0 || group.pendingKakomliCount > 0
                  : false;

                return (
                  <button
                    key={group.key}
                    type="button"
                    onClick={() => handleSelectDudi(group)}
                    className={`text-left p-4 rounded-xl border bg-white hover:border-blue-400 hover:shadow-sm transition-all flex flex-col justify-between gap-3 cursor-pointer ${
                      needsAttention ? 'border-indigo-200 ring-1 ring-indigo-100' : 'border-slate-200'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-slate-900 leading-snug">
                            {group.namaDudi}
                          </h3>
                          <p className="text-[11px] text-slate-500 mt-0.5 flex items-start gap-1 leading-snug">
                            <MapPin className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                            <span>{group.alamat}</span>
                          </p>
                        </div>
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[11px] font-bold text-slate-800 tabular-nums shrink-0">
                          {group.students.length} Siswa
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-600 flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="leading-snug">
                          Pembimbing: <strong className="text-slate-800">{group.guruPendamping}</strong>
                        </span>
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
                          Terlaksana: {group.pendingKakomliCount}
                        </span>
                        <span className="font-semibold text-indigo-700">
                          Kakomli: {group.pendingHubinCount}
                        </span>
                        <span className="font-semibold text-emerald-700">
                          Hubin: {group.verifiedHubinCount}
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
        /* LEVEL 2: DUDI DETAIL — MATRIX TABLE & PER-PHASE VERIFICATION */
        <div className="space-y-4">
          {/* Active DUDI Context Banner */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 leading-snug">
                  {activeDudiGroup.namaDudi}
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-[11px] font-bold text-blue-800 tabular-nums">
                  {activeDudiGroup.students.length} Siswa
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                <span>Pembimbing: <strong className="text-slate-800">{activeDudiGroup.guruPendamping}</strong></span>
                <span className="text-slate-300" aria-hidden="true">·</span>
                <span>{activeDudiGroup.alamat}</span>
              </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-slate-600 shrink-0">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <span>Terlaksana (Otomatis)</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                <span>Tervalidasi Kakomli</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                <span>Tervalidasi Hubin</span>
              </span>
            </div>
          </div>

          {/* Fase Supervisi Selector + Manual Batch Verify Actions */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="text-xs font-bold text-slate-900">
                Pilih Fase Supervisi untuk Verifikasi:
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] tabular-nums">
                <span className="text-slate-500">
                  Belum diisi: <strong className="text-slate-800">{stageStats.notFilled}</strong>
                </span>
                <span className="text-slate-300">·</span>
                <span className="text-blue-700 font-semibold">
                  Terlaksana: {stageStats.terlaksanaTargets.length}
                </span>
                <span className="text-slate-300">·</span>
                <span className="text-indigo-700 font-semibold">
                  Kakomli: {stageStats.kakomliTargets.length}
                </span>
                <span className="text-slate-300">·</span>
                <span className="text-emerald-700 font-semibold">
                  Hubin: {stageStats.hubinTargets.length}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {MONITORING_STAGES.map((st) => {
                const isActive = selectedStageNum === st.num;
                const filledCount = activeDudiGroup.students.filter((s) => {
                  const l = s.stageLogs[st.num];
                  return l?.monitoringId && normalizeVerificationStatus(l.status) !== 'Belum Terlaksana';
                }).length;

                return (
                  <button
                    key={st.num}
                    type="button"
                    onClick={() => setSelectedStageNum(st.num)}
                    className={`min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-semibold shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-slate-900 border-slate-900 text-white'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span>{st.label}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums ${
                        isActive ? 'bg-white/20 text-white' : 'bg-white text-slate-600 border border-slate-200'
                      }`}
                    >
                      {filledCount}/{activeDudiGroup.students.length}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Manual Verification Action Strip */}
            {(canVerifyKakomli || canVerifyHubin) && (
              <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-slate-500">
                  Verifikasi bersifat manual untuk memastikan kelayakan data supervisi pada{' '}
                  <strong className="text-slate-700">{getStageValueByNumber(selectedStageNum)}</strong>.
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
                            activeDudiGroup.namaDudi
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
                            activeDudiGroup.namaDudi
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
                </div>
              </div>
            )}
          </div>

          {/* Matrix Table: Student x 8 Supervision Phases */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                    <th className="py-3 px-3.5 sticky left-0 z-10 bg-slate-50 border-r border-slate-200 min-w-[180px] sm:min-w-[220px]">
                      Siswa &amp; Jurusan
                    </th>
                    {MONITORING_STAGES.map((st) => {
                      const isActiveCol = st.num === selectedStageNum;
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
                          <div className="whitespace-nowrap">{st.shortLabel}</div>
                        </th>
                      );
                    })}
                    <th className="py-2.5 px-2.5 text-center min-w-[64px]">Nilai</th>
                    <th className="py-2.5 px-3 text-right min-w-[130px]">
                      Aksi Tahap {selectedStageNum}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeDudiGroup.students.map((student) => {
                    const activeLog = student.stageLogs[selectedStageNum];
                    const activeStatus = activeLog?.monitoringId
                      ? normalizeVerificationStatus(activeLog.status)
                      : 'Belum Terlaksana';
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
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {student.jurusan}
                          </div>
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

                        <td className="py-2 px-2.5 text-center align-middle font-mono font-bold tabular-nums">
                          {student.hasGrade && student.rataRataNilai !== null ? (
                            <span className="text-emerald-700">{student.rataRataNilai}</span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        <td className="py-2 px-3 text-right align-middle whitespace-nowrap">
                          {!activeLog || !activeLog.monitoringId || activeStatus === 'Belum Terlaksana' ? (
                            <span className="text-[11px] text-slate-400">Belum ada data</span>
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

                              {canVerifyHubin &&
                                (activeStatus === 'Tervalidasi Kakomli' ||
                                  activeStatus === 'Terlaksana') && (
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

                              <button
                                type="button"
                                onClick={() => setInspectTarget({ student, log: activeLog })}
                                className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                                title="Lihat rincian catatan supervisi"
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
                  {getStageValueByNumber(inspectTarget.log.stageNum)} · {inspectTarget.student.namaDudi}
                </p>
              </div>
              <button
                type="button"
                disabled={savingId === inspectTarget.log.monitoringId}
                onClick={() => setInspectTarget(null)}
                aria-label="Tutup detail supervisi"
                className="w-8 h-8 rounded-lg hover:bg-slate-200/70 text-slate-500 flex items-center justify-center cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <TopProgressBar
              active={savingId === inspectTarget.log.monitoringId}
              label="Menyimpan verifikasi supervisi ke Cloud Server"
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
                  <div className="text-[11px] text-slate-500">Absensi (S / I / A)</div>
                  <div className="font-mono font-bold text-slate-900 mt-0.5 tabular-nums">
                    {inspectTarget.log.sakit} / {inspectTarget.log.izin} / {inspectTarget.log.alpha}
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

              {canVerifyHubin &&
                normalizeVerificationStatus(inspectTarget.log.status) !== 'Tervalidasi Hubin' && (
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
