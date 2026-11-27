import type { FormEvent } from 'react';
import { useState, useEffect, useMemo, useRef } from 'react';
import { ToastManager } from '../../core/ToastManager';
import { PublicPortalClient } from '../../core/PublicPortalClient';
import { useUnloadGuard } from '../../hooks/useUnloadGuard';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import {
  DEFAULT_MONITORING_STAGE_CONTROL,
  type IssuedStageDetail,
  type MonitoringStageControl,
} from '../../core/types/schema';
import {
  calculateEqualWeightedAverage,
  EMPTY_KONDISI_BENGKEL,
  formatRangePair,
  getPredikatFromScore,
  getPreviousEnabledStage,
  getStageValueByNumber,
  isStageFullyVerified,
  parseRangePair,
  pickRecommendedStageForControl,
  resolveMonitoringStagePolicy,
  type ResolvedMonitoringStagePolicy,
} from '../../core/utils/monitoringHelpers';
import { getTodayWibIsoDate } from '../../core/utils/dateHelpers';
import {
  DEFAULT_DRAFT,
  DEFAULT_WORKSHOP_DRAFT,
  getStudentKey,
  isDudiContactIncomplete,
  type GradeScoresDraft,
  type MonitoringSaveReceipt,
  type StudentStageDraft,
  type WorkshopStageDraft,
} from './types';

import type { PendingStageEditConfirm } from './StageEditConfirmModal';

const PETUGAS_CACHE_KEY = 'hubin_petugas_cache';
const PETUGAS_DUDI_CACHE_KEY = 'hubin_petugas_dudi_cache';
const NOTICE_ACK_KEY = 'hubin_petugas_notice_ack';
const LEGACY_LOCAL_KEYS = [
  'hubin_petugas_cache',
  'hubin_petugas_dudi_cache',
  'hubin_monitoring_drafts_v1',
  'hubin_monitoring_workshop_drafts_v1',
  'hubin_monitoring_delivery_drafts_v1',
];
const PORTAL_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

interface StoredPetugasDudiCache {
  petugasId: string;
  petugasNama: string;
  dudi: any;
  selectedStudentIndex: number;
  timestamp: number;
}

function purgeLegacyMonitoringLocalStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    LEGACY_LOCAL_KEYS.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // ignore storage access errors
  }
}

function readPortalSessionJson<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.timestamp === 'number' &&
      Date.now() - parsed.timestamp > PORTAL_SESSION_TTL_MS
    ) {
      sessionStorage.removeItem(key);
      return null;
    }
    return parsed as T;
  } catch {
    return null;
  }
}

function writePortalSessionJson(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage quota errors
  }
}

function removePortalSessionKey(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function normalizeWorkshopDraft(raw?: Partial<WorkshopStageDraft> | null): WorkshopStageDraft {
  const rawComp = Array.isArray(raw?.kompetensiList) ? raw!.kompetensiList : [];
  const paddedComp =
    rawComp.length >= 2 ? [...rawComp] : [...rawComp, ...Array(2 - rawComp.length).fill('')];
  return {
    kompetensiList: paddedComp,
    kondisiBengkel: raw?.kondisiBengkel
      ? { ...EMPTY_KONDISI_BENGKEL, ...raw.kondisiBengkel }
      : { ...EMPTY_KONDISI_BENGKEL },
  };
}

function hasFilledWorkshopData(w?: WorkshopStageDraft | null): boolean {
  if (!w) return false;
  const hasComp = w.kompetensiList.some((k) => k.trim().length > 0);
  const kb = w.kondisiBengkel;
  const hasBengkel = Boolean(
    kb.volumePekerjaan || kb.relevansiPekerjaan || kb.kenyamanan || kb.kelayakan
  );
  return hasComp || hasBengkel;
}

export function useTeacherMonitoring(isOpen: boolean, onSuccess?: () => void) {
  const isOnline = useOnlineStatus();
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Step 1: Petugas & PIN verification
  const [petugasList, setPetugasList] = useState<any[]>([]);
  const [loadingPetugas, setLoadingPetugas] = useState(false);
  const [petugasLoadError, setPetugasLoadError] = useState('');
  const [selectedPetugasId, setSelectedPetugasId] = useState('');
  const [selectedPetugasNama, setSelectedPetugasNama] = useState('');
  const [selectedPetugasNip, setSelectedPetugasNip] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [isPinVerified, setIsPinVerified] = useState(false);
  const [showComplianceNotice, setShowComplianceNotice] = useState(false);
  const [verifyingPin, setVerifyingPin] = useState(false);
  const [pinError, setPinError] = useState('');

  // Step 2: Assigned DUDIs from Cloud Server
  const [assignedDudiList, setAssignedDudiList] = useState<any[]>([]);
  const [loadingDudi, setLoadingDudi] = useState(false);
  const [dudiError, setDudiError] = useState('');
  const [selectedDudi, setSelectedDudi] = useState<any>(null);

  // Step 3: Students placed in selected DUDI + Isolated Per-Student State
  const [dudiStudents, setDudiStudents] = useState<any[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentsError, setStudentsError] = useState('');
  const [selectedStudentIndex, setSelectedStudentIndex] = useState(0);

  // Isolated per-student stage & per-(student, stage) drafts + shared per-(DUDI, stage) workshop draft
  const [stageByStudent, setStageByStudent] = useState<Record<string, number>>({});
  const [draftsByKey, setDraftsByKey] = useState<Record<string, StudentStageDraft>>({});
  const [workshopDraftsByStage, setWorkshopDraftsByStage] = useState<
    Record<number, WorkshopStageDraft>
  >({});
  const [editingGradeByStudent, setEditingGradeByStudent] = useState<Record<string, boolean>>({});
  const [gradeEditDrafts, setGradeEditDrafts] = useState<Record<string, GradeScoresDraft>>({});
  const [savingGradeEdit, setSavingGradeEdit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formErrorTrigger, setFormErrorTrigger] = useState(0);
  const [saveReceipt, setSaveReceipt] = useState<MonitoringSaveReceipt | null>(null);
  const [dudiPemimpin, setDudiPemimpin] = useState('');
  const [dudiPic, setDudiPic] = useState('');
  const [dudiTelp, setDudiTelp] = useState('');
  const [dudiHariMulai, setDudiHariMulai] = useState('');
  const [dudiHariSelesai, setDudiHariSelesai] = useState('');
  const [dudiJamMulai, setDudiJamMulai] = useState('');
  const [dudiJamSelesai, setDudiJamSelesai] = useState('');
  const [showDudiContactEditor, setShowDudiContactEditor] = useState(false);

  // Stage 1 (Pengantaran): 1x per DUDI validation state with per-student TTD
  const [deliveryTtdByKey, setDeliveryTtdByKey] = useState<Record<string, string>>({});
  const [deliveryCatatan, setDeliveryCatatan] = useState('');
  const [deliveryContactConfirmed, setDeliveryContactConfirmed] = useState(false);
  const [deliverySelectedKeys, setDeliverySelectedKeys] = useState<string[]>([]);

  // Global SuperAdmin stage lock & transition policy + DUDI issued-letter status
  const [stageControl, setStageControl] = useState<MonitoringStageControl>(
    DEFAULT_MONITORING_STAGE_CONTROL
  );
  const [issuedStages, setIssuedStages] = useState<number[]>([]);
  const [issuedStageDetails, setIssuedStageDetails] = useState<Record<number, IssuedStageDetail>>({});

  // Mandatory incomplete DUDI contact + spelling confirmation popup
  const [dudiPopupOpen, setDudiPopupOpen] = useState(false);
  const [popupPemimpin, setPopupPemimpin] = useState('');
  const [popupPic, setPopupPic] = useState('');
  const [popupTelp, setPopupTelp] = useState('');
  const [popupHariMulai, setPopupHariMulai] = useState('');
  const [popupHariSelesai, setPopupHariSelesai] = useState('');
  const [popupJamMulai, setPopupJamMulai] = useState('');
  const [popupJamSelesai, setPopupJamSelesai] = useState('');
  const [popupSpellingConfirmed, setPopupSpellingConfirmed] = useState(false);
  const [popupError, setPopupError] = useState('');
  const [savingPopupContact, setSavingPopupContact] = useState(false);

  // Protected Edit State for already-submitted monitoring stages (1-8)
  const [editUnlockedKeys, setEditUnlockedKeys] = useState<Record<string, boolean>>({});
  const [pendingEditConfirm, setPendingEditConfirm] = useState<PendingStageEditConfirm | null>(null);

  const activeTeacherKeyRef = useRef('');
  const activeDudiKeyRef = useRef('');

  useUnloadGuard(submitting || savingGradeEdit || savingPopupContact);

  const reportValidationError = (msg: string) => {
    setFormError(msg);
    setFormErrorTrigger((n) => n + 1);
    ToastManager.getInstance().show('Periksa Kembali Isian Form', 'error', msg);
  };

  const loadPetugasList = async () => {
    setLoadingPetugas(true);
    setPetugasLoadError('');
    try {
      const json = await PublicPortalClient.getPetugasList({
        onUpdate: (freshJson) => {
          if (freshJson?.success && Array.isArray(freshJson.data)) {
            setPetugasList(freshJson.data);
          }
        },
      });
      if (!json.success) {
        const errMsg = 'Gagal membaca daftar petugas dari Cloud Server.';
        setPetugasList([]);
        setPetugasLoadError(errMsg);
        ToastManager.getInstance().show('Gagal Memuat Daftar Petugas', 'error', errMsg);
        return;
      }

      const list = Array.isArray(json.data) ? json.data : [];
      setPetugasList(list);
    } catch (e: any) {
      const errMsg = e?.message || 'Tidak dapat terhubung ke Cloud Server.';
      setPetugasList([]);
      setPetugasLoadError(errMsg);
      ToastManager.getInstance().show('Gagal Memuat Daftar Petugas', 'error', errMsg);
    } finally {
      setLoadingPetugas(false);
    }
  };

  const loadAssignedDudi = async (teacherName: string, teacherId: string) => {
    const teacherKey = `${teacherId}::${teacherName}`;
    activeTeacherKeyRef.current = teacherKey;
    setLoadingDudi(true);
    setDudiError('');

    const prefetchTopDudiStudents = (list: any[]) => {
      list.slice(0, 2).forEach((dudi) => {
        if (dudi?.nama) {
          void PublicPortalClient.getDudiStudents(dudi.nama, dudi.id || '', teacherName, {
            petugasId: teacherId,
          }).catch(() => {});
        }
      });
    };

    try {
      const json = await PublicPortalClient.getPetugasDudi(teacherName, teacherId, {
        onUpdate: (freshJson) => {
          if (activeTeacherKeyRef.current !== teacherKey) return;
          if (freshJson?.success && Array.isArray(freshJson.data)) {
            setAssignedDudiList(freshJson.data);
            prefetchTopDudiStudents(freshJson.data);
          }
        },
      });
      if (activeTeacherKeyRef.current !== teacherKey) return;
      if (!json.success) {
        const errMsg = 'Gagal memuat daftar DUDI bimbingan dari Cloud Server.';
        setAssignedDudiList([]);
        setDudiError(errMsg);
        ToastManager.getInstance().show('Gagal Memuat DUDI Bimbingan', 'error', errMsg);
        return;
      }
      const list = Array.isArray(json.data) ? json.data : [];
      setAssignedDudiList(list);
      prefetchTopDudiStudents(list);
    } catch (e: any) {
      if (activeTeacherKeyRef.current !== teacherKey) return;
      const errMsg = e?.message || 'Gagal terhubung ke Cloud Server.';
      setAssignedDudiList([]);
      setDudiError(errMsg);
      ToastManager.getInstance().show('Gagal Memuat DUDI Bimbingan', 'error', errMsg);
    } finally {
      if (activeTeacherKeyRef.current === teacherKey) {
        setLoadingDudi(false);
      }
    }
  };

  useEffect(() => {
    if (isOpen) {
      purgeLegacyMonitoringLocalStorage();
      setDudiPopupOpen(false);
      setSaveReceipt(null);
      setPendingEditConfirm(null);
      void loadPetugasList();
      PublicPortalClient.getMonitoringStageConfig(true)
        .then((cfg) => setStageControl(cfg))
        .catch(() => {});

      const parsed = readPortalSessionJson<{
        petugasId?: string;
        nama?: string;
        nip?: string;
      }>(PETUGAS_CACHE_KEY);

      if (parsed?.petugasId && parsed?.nama) {
        setSelectedPetugasId(parsed.petugasId);
        setSelectedPetugasNama(parsed.nama);
        setSelectedPetugasNip(parsed.nip || '');
        setIsPinVerified(true);
        if (sessionStorage.getItem(NOTICE_ACK_KEY) !== '1') {
          setShowComplianceNotice(true);
        }
        void loadAssignedDudi(parsed.nama, parsed.petugasId);

        const cachedDudi = readPortalSessionJson<StoredPetugasDudiCache>(PETUGAS_DUDI_CACHE_KEY);
        if (cachedDudi?.dudi && cachedDudi.petugasId === parsed.petugasId) {
          void handleSelectDudi(cachedDudi.dudi, {
            initialStudentIndex: cachedDudi.selectedStudentIndex,
            petugasIdOverride: parsed.petugasId,
            petugasNamaOverride: parsed.nama,
          });
        } else {
          setCurrentStep(2);
        }
      }
    }
  }, [isOpen]);

  const handleVerifyPin = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedPetugasId) {
      const msg = 'Pilih nama petugas dari daftar terlebih dahulu.';
      setPinError(msg);
      ToastManager.getInstance().show('Petugas Belum Dipilih', 'error', msg);
      return;
    }

    setVerifyingPin(true);
    setPinError('');
    const toastId = ToastManager.getInstance().show(
      'Memverifikasi Password Petugas...',
      'pending',
      `Mencocokkan identitas ${selectedPetugasNama || 'petugas'} dengan Cloud Server`
    );

    try {
      const json = await PublicPortalClient.verifyPetugasPin({
        petugas_id: selectedPetugasId,
        nama_petugas: selectedPetugasNama,
        pin: pinInput.trim(),
      });

      if (json.success) {
        const verified = json.verifiedPetugas || {
          id: selectedPetugasId,
          nama: selectedPetugasNama,
          nip: selectedPetugasNip,
        };
        setIsPinVerified(true);
        setPinInput('');
        sessionStorage.removeItem(NOTICE_ACK_KEY);
        removePortalSessionKey(PETUGAS_DUDI_CACHE_KEY);
        writePortalSessionJson(PETUGAS_CACHE_KEY, {
          petugasId: verified.id,
          nama: verified.nama,
          nip: verified.nip || selectedPetugasNip,
          token: json.sessionToken,
          timestamp: Date.now(),
        });

        ToastManager.getInstance().update(
          toastId,
          'Identitas Terverifikasi',
          'success',
          `Selamat datang, ${verified.nama}`
        );

        setCurrentStep(2);
        setShowComplianceNotice(true);
        setVerifyingPin(false);
        void loadAssignedDudi(verified.nama, verified.id);
      } else {
        const errMsg = json.message || 'Password Petugas tidak valid.';
        setPinError(errMsg);
        ToastManager.getInstance().update(toastId, 'Verifikasi Password Gagal', 'error', errMsg);
      }
    } catch (e: any) {
      const errMsg = e?.message || 'Gagal memverifikasi password. Periksa koneksi Anda.';
      setPinError(errMsg);
      ToastManager.getInstance().update(toastId, 'Verifikasi Password Gagal', 'error', errMsg);
    } finally {
      setVerifyingPin(false);
    }
  };

  const handleSelectDudi = async (
    dudi: any,
    options?: {
      initialStudentIndex?: number;
      petugasIdOverride?: string;
      petugasNamaOverride?: string;
    }
  ) => {
    const effectivePetugasId = options?.petugasIdOverride ?? selectedPetugasId;
    const effectivePetugasNama = options?.petugasNamaOverride ?? selectedPetugasNama;
    const dudiKey = `${dudi.id || ''}::${dudi.nama || ''}::${effectivePetugasNama}`;
    activeDudiKeyRef.current = dudiKey;

    const initPemimpin = dudi.namaPemimpin && dudi.namaPemimpin !== '-' ? dudi.namaPemimpin : '';
    const initPic = dudi.pic && dudi.pic !== '-' ? dudi.pic : '';
    const initTelp = dudi.kontak && dudi.kontak !== '-' ? dudi.kontak : '';
    const initHariRange = parseRangePair(dudi.hariKerja, '', '');
    const initJamRange = parseRangePair(dudi.jamKerja, '', '');

    writePortalSessionJson(PETUGAS_DUDI_CACHE_KEY, {
      petugasId: effectivePetugasId,
      petugasNama: effectivePetugasNama,
      dudi,
      selectedStudentIndex: options?.initialStudentIndex ?? 0,
      timestamp: Date.now(),
    });

    setSelectedDudi(dudi);
    setDudiPemimpin(initPemimpin);
    setDudiPic(initPic);
    setDudiTelp(initTelp);
    setDudiHariMulai(initHariRange.start);
    setDudiHariSelesai(initHariRange.end);
    setDudiJamMulai(initJamRange.start);
    setDudiJamSelesai(initJamRange.end);
    setShowDudiContactEditor(false);
    setDeliveryTtdByKey({});
    setDeliveryCatatan('');
    setDeliveryContactConfirmed(false);
    setDeliverySelectedKeys([]);
    setSaveReceipt(null);
    setEditUnlockedKeys({});
    setPendingEditConfirm(null);
    setCurrentStep(3);
    setLoadingStudents(true);
    setStudentsError('');
    setFormError('');
    setDudiStudents([]);
    setSelectedStudentIndex(options?.initialStudentIndex ?? 0);
    setStageByStudent({});
    setDraftsByKey({});
    setWorkshopDraftsByStage({});
    setEditingGradeByStudent({});
    setGradeEditDrafts({});
    setIssuedStages([]);
    setIssuedStageDetails({});

    if (isDudiContactIncomplete(initPemimpin, initPic, initTelp)) {
      setPopupPemimpin(initPemimpin);
      setPopupPic(initPic);
      setPopupTelp(initTelp);
      setPopupHariMulai(initHariRange.start);
      setPopupHariSelesai(initHariRange.end);
      setPopupJamMulai(initJamRange.start);
      setPopupJamSelesai(initJamRange.end);
      setPopupSpellingConfirmed(false);
      setPopupError('');
      setDudiPopupOpen(true);
    } else {
      setDudiPopupOpen(false);
    }

    let latestStageControl = stageControl;
    let latestIssuedStages: number[] = [];
    void PublicPortalClient.getMonitoringStageConfig(true)
      .then((cfg) => {
        if (activeDudiKeyRef.current === dudiKey) {
          latestStageControl = cfg;
          setStageControl(cfg);
        }
      })
      .catch(() => {});

    const applyStudentsPayload = (
      students: any[],
      isBackgroundRefresh: boolean,
      controlOverride?: MonitoringStageControl,
      issuedStagesOverride?: number[]
    ) => {
      const effectiveControl = controlOverride || latestStageControl;
      const effectiveIssuedStages = issuedStagesOverride ?? latestIssuedStages;
      const initStages: Record<string, number> = {};
      const initDrafts: Record<string, StudentStageDraft> = {};
      const initWorkshops: Record<number, WorkshopStageDraft> = {};

      students.forEach((stu: any, idx: number) => {
        const stuKey = getStudentKey(stu, idx);
        const recStage = pickRecommendedStageForControl(
          Array.isArray(stu.completedStages) ? stu.completedStages : [],
          effectiveControl,
          effectiveIssuedStages,
          stu.stageLogs,
          stu.jurusan
        );
        initStages[stuKey] = recStage;

        if (stu.stageLogs && typeof stu.stageLogs === 'object') {
          Object.entries(stu.stageLogs).forEach(([stageStr, log]: [string, any]) => {
            const stNum = Number(stageStr);
            const draftKey = `${stuKey}::${stageStr}`;
            initDrafts[draftKey] = {
              ...DEFAULT_DRAFT,
              sakit: Number(log?.sakit ?? 0) || 0,
              izin: Number(log?.izin ?? 0) || 0,
              alpha: Number(log?.alpha ?? 0) || 0,
              bukuLaporan: log?.bukuLaporan || '',
              aktivitasDp: log?.aktivitasDp || '',
              aktivitasMt: log?.aktivitasMt || '',
              aktivitasKrt: log?.aktivitasKrt || '',
              ttdSiswa: String(log?.ttdSiswa || ''),
              catatanPerkembangan: String(log?.catatan || ''),
            };

            const candidateWorkshop = normalizeWorkshopDraft({
              kompetensiList: Array.isArray(log?.kompetensiList) ? log.kompetensiList : [],
              kondisiBengkel: log?.kondisiBengkel,
            });
            if (stNum >= 1 && stNum <= 8 && hasFilledWorkshopData(candidateWorkshop)) {
              const curr = initWorkshops[stNum];
              if (!curr || !hasFilledWorkshopData(curr)) {
                initWorkshops[stNum] = candidateWorkshop;
              } else {
                const currKompCount = curr.kompetensiList.filter((k) => k.trim()).length;
                const candKompCount = candidateWorkshop.kompetensiList.filter((k) => k.trim()).length;
                initWorkshops[stNum] = {
                  kompetensiList:
                    candKompCount > currKompCount
                      ? candidateWorkshop.kompetensiList
                      : curr.kompetensiList,
                  kondisiBengkel: {
                    volumePekerjaan:
                      curr.kondisiBengkel.volumePekerjaan ||
                      candidateWorkshop.kondisiBengkel.volumePekerjaan,
                    relevansiPekerjaan:
                      curr.kondisiBengkel.relevansiPekerjaan ||
                      candidateWorkshop.kondisiBengkel.relevansiPekerjaan,
                    kenyamanan:
                      curr.kondisiBengkel.kenyamanan ||
                      candidateWorkshop.kondisiBengkel.kenyamanan,
                    kelayakan:
                      curr.kondisiBengkel.kelayakan ||
                      candidateWorkshop.kondisiBengkel.kelayakan,
                  },
                };
              }
            }
          });
        }
      });

      if (isBackgroundRefresh) {
        setStageByStudent((prev) => ({ ...initStages, ...prev }));
        setDraftsByKey((prev) => ({ ...initDrafts, ...prev }));
        setWorkshopDraftsByStage((prev) => ({ ...initWorkshops, ...prev }));
      } else {
        setStageByStudent(initStages);
        setDraftsByKey(initDrafts);
        setWorkshopDraftsByStage(initWorkshops);
        const firstPendingIdx = students.findIndex((stu, idx) => {
          const recStage = initStages[getStudentKey(stu, idx)] || 1;
          const completed = Array.isArray(stu.completedStages) ? stu.completedStages : [];
          return !completed.includes(recStage);
        });
        const firstAwaitingIdx =
          firstPendingIdx >= 0
            ? firstPendingIdx
            : students.findIndex((stu, idx) => {
                const recStage = initStages[getStudentKey(stu, idx)] || 1;
                return !isStageFullyVerified(stu?.stageLogs?.[recStage]?.status);
              });
        const hasExplicitInitialIdx =
          typeof options?.initialStudentIndex === 'number' &&
          options.initialStudentIndex >= 0 &&
          options.initialStudentIndex < students.length;
        const resolvedIdx = hasExplicitInitialIdx
          ? (options!.initialStudentIndex as number)
          : firstAwaitingIdx >= 0
          ? firstAwaitingIdx
          : 0;
        setSelectedStudentIndex(resolvedIdx);

        // Initialize Stage 1 (Pengantaran) per-student TTD, Note & Student selection
        const allKeys = students.map((stu, idx) => getStudentKey(stu, idx));
        const pendingDeliveryKeys = students
          .map((stu, idx) => ({ stu, key: getStudentKey(stu, idx) }))
          .filter(
            ({ stu }) => !(Array.isArray(stu.completedStages) && stu.completedStages.includes(1))
          )
          .map(({ key }) => key);
        setDeliverySelectedKeys(pendingDeliveryKeys.length > 0 ? pendingDeliveryKeys : allKeys);

        const initTtdByKey: Record<string, string> = {};
        students.forEach((stu, idx) => {
          const key = getStudentKey(stu, idx);
          initTtdByKey[key] = String(stu?.stageLogs?.[1]?.ttdSiswa || '');
        });
        setDeliveryTtdByKey(initTtdByKey);

        const savedStage1NoteLog = students
          .map((stu) => stu?.stageLogs?.[1])
          .find((log) => Boolean(log && log.catatan));
        setDeliveryCatatan(String(savedStage1NoteLog?.catatan || ''));
        const allStage1Done =
          students.length > 0 &&
          students.every(
            (stu) => Array.isArray(stu.completedStages) && stu.completedStages.includes(1)
          );
        const bioHasSchedule = Boolean(
          initHariRange.start && initHariRange.end && initJamRange.start && initJamRange.end
        );
        setDeliveryContactConfirmed(
          allStage1Done && !isDudiContactIncomplete(initPemimpin, initPic, initTelp) && bioHasSchedule
        );
      }
      const normalizedStudents = students.map((stu: any, idx: number) => {
        const stuKey = getStudentKey(stu, idx);
        const stuPolicy =
          stu.stagePolicy || resolveMonitoringStagePolicy(effectiveControl, stu.jurusan);
        return {
          ...stu,
          stagePolicy: stuPolicy,
          recommendedStage: initStages[stuKey] ?? stu.recommendedStage ?? 1,
        };
      });
      setDudiStudents(normalizedStudents);
    };

    try {
      const json: any = await PublicPortalClient.getDudiStudents(
        dudi.nama,
        dudi.id || '',
        effectivePetugasNama,
        {
          petugasId: effectivePetugasId,
          onUpdate: (freshJson: any) => {
            if (activeDudiKeyRef.current !== dudiKey) return;
            if (freshJson?.stageControl) {
              latestStageControl = freshJson.stageControl;
              setStageControl(freshJson.stageControl);
            }
            if (Array.isArray(freshJson?.issuedStages)) {
              latestIssuedStages = freshJson.issuedStages;
              setIssuedStages(freshJson.issuedStages);
            }
            if (freshJson?.issuedStageDetails && typeof freshJson.issuedStageDetails === 'object') {
              setIssuedStageDetails(freshJson.issuedStageDetails);
            }
            if (freshJson?.success && Array.isArray(freshJson.data)) {
              applyStudentsPayload(
                freshJson.data,
                true,
                freshJson?.stageControl,
                Array.isArray(freshJson?.issuedStages) ? freshJson.issuedStages : undefined
              );
            }
          },
        }
      );
      if (activeDudiKeyRef.current !== dudiKey) return;
      if (json?.stageControl) {
        latestStageControl = json.stageControl;
        setStageControl(json.stageControl);
      }
      if (Array.isArray(json?.issuedStages)) {
        latestIssuedStages = json.issuedStages;
        setIssuedStages(json.issuedStages);
      }
      if (json?.issuedStageDetails && typeof json.issuedStageDetails === 'object') {
        setIssuedStageDetails(json.issuedStageDetails);
      }
      if (!json.success) {
        const errMsg = 'Gagal memuat daftar siswa dari Cloud Server.';
        setStudentsError(errMsg);
        ToastManager.getInstance().show('Gagal Memuat Daftar Siswa', 'error', errMsg);
        return;
      }

      const students = Array.isArray(json.data) ? json.data : [];
      applyStudentsPayload(
        students,
        false,
        json?.stageControl,
        Array.isArray(json?.issuedStages) ? json.issuedStages : undefined
      );
    } catch (e: any) {
      if (activeDudiKeyRef.current !== dudiKey) return;
      const errMsg = e?.message || 'Gagal menghubungi Cloud Server.';
      setStudentsError(errMsg);
      ToastManager.getInstance().show('Gagal Memuat Siswa DUDI', 'error', errMsg);
    } finally {
      if (activeDudiKeyRef.current === dudiKey) {
        setLoadingStudents(false);
      }
    }
  };

  const handleSaveDudiPopup = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedDudi) return;
    setPopupError('');

    const cleanPemimpin = popupPemimpin.trim();
    const cleanPic = popupPic.trim();
    const cleanTelp = popupTelp.trim();

    if (!cleanPemimpin || cleanPemimpin === '-') {
      setPopupError('Nama Pemimpin DUDI wajib diisi dengan lengkap.');
      return;
    }
    if (!cleanPic || cleanPic === '-') {
      setPopupError('Nama PIC / Pembimbing DUDI wajib diisi.');
      return;
    }
    if (cleanTelp.replace(/\D/g, '').length < 7) {
      setPopupError('No. Telp / WhatsApp DUDI wajib diisi minimal 7 digit angka.');
      return;
    }
    if (!popupSpellingConfirmed) {
      setPopupError('Harap centang konfirmasi kebenaran data dan ejaan sebelum melanjutkan.');
      return;
    }

    const hariRangeStr =
      popupHariMulai && popupHariSelesai ? formatRangePair(popupHariMulai, popupHariSelesai) : '';
    const jamRangeStr =
      popupJamMulai && popupJamSelesai ? formatRangePair(popupJamMulai, popupJamSelesai) : '';

    if (!isOnline) {
      setPopupError('Koneksi internet terputus. Hubungkan internet terlebih dahulu agar data tersimpan di server.');
      return;
    }

    setSavingPopupContact(true);
    try {
      const res = await PublicPortalClient.saveDudiContactVerification({
        dudi_id: selectedDudi.id || '',
        nama_dudi: selectedDudi.nama,
        alamat_dudi: selectedDudi.alamat || '',
        nama_pemimpin: cleanPemimpin,
        nama_pic: cleanPic,
        no_telp_dudi: cleanTelp,
        ...(hariRangeStr ? { hari_kerja: hariRangeStr } : {}),
        ...(jamRangeStr ? { jam_kerja: jamRangeStr } : {}),
        spelling_confirmed: true,
      });

      const resolvedHariStr = res.dudiContact?.hariKerja || hariRangeStr;
      const resolvedJamStr = res.dudiContact?.jamKerja || jamRangeStr;
      const updatedContact = {
        namaPemimpin: res.dudiContact?.namaPemimpin || cleanPemimpin,
        pic: res.dudiContact?.pic || cleanPic,
        kontak: res.dudiContact?.kontak || cleanTelp,
        ...(resolvedHariStr ? { hariKerja: resolvedHariStr } : {}),
        ...(resolvedJamStr ? { jamKerja: resolvedJamStr } : {}),
      };
      setDudiPemimpin(updatedContact.namaPemimpin);
      setDudiPic(updatedContact.pic);
      setDudiTelp(updatedContact.kontak);
      if (resolvedHariStr) {
        const parsedH = parseRangePair(resolvedHariStr, '', '');
        setDudiHariMulai(parsedH.start);
        setDudiHariSelesai(parsedH.end);
      }
      if (resolvedJamStr) {
        const parsedJ = parseRangePair(resolvedJamStr, '', '');
        setDudiJamMulai(parsedJ.start);
        setDudiJamSelesai(parsedJ.end);
      }
      setSelectedDudi((prev: any) => (prev ? { ...prev, ...updatedContact } : prev));
      setAssignedDudiList((prev) =>
        prev.map((d) =>
          d.nama === selectedDudi.nama || (d.id && d.id === selectedDudi.id)
            ? { ...d, ...updatedContact }
            : d
        )
      );
      setDudiPopupOpen(false);
      setShowDudiContactEditor(false);
      if (resolvedHariStr && resolvedJamStr) {
        setDeliveryContactConfirmed(true);
      }
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setPopupError(err?.message || 'Gagal menyimpan data kontak DUDI ke Cloud Server.');
    } finally {
      setSavingPopupContact(false);
    }
  };

  const getStageEditLockKey = (stageNum: number, stuKey: string): string => {
    if (stageNum === 1) {
      return activeDudiKeyRef.current ? `delivery::${activeDudiKeyRef.current}` : '';
    }
    return stuKey ? `${stuKey}::${stageNum}` : '';
  };

  const isStageCompletedInData = (stageNum: number, student: any): boolean => {
    if (stageNum === 1) {
      return (
        dudiStudents.length > 0 &&
        dudiStudents.every((s) => Array.isArray(s.completedStages) && s.completedStages.includes(1))
      );
    }
    return Boolean(student && Array.isArray(student.completedStages) && student.completedStages.includes(stageNum));
  };

  const activeStudent = dudiStudents[selectedStudentIndex] || null;
  const activeStudentKey = activeStudent ? getStudentKey(activeStudent, selectedStudentIndex) : '';
  const activeStudentPolicy: ResolvedMonitoringStagePolicy = useMemo(
    () =>
      activeStudent?.stagePolicy ||
      resolveMonitoringStagePolicy(stageControl, activeStudent?.jurusan),
    [activeStudent, stageControl]
  );
  const activeStageNum = activeStudent
    ? stageByStudent[activeStudentKey] ||
      pickRecommendedStageForControl(
        Array.isArray(activeStudent.completedStages) ? activeStudent.completedStages : [],
        stageControl,
        issuedStages,
        activeStudent.stageLogs,
        activeStudent.jurusan
      )
    : 1;
  const isStageEnabledForStudent = activeStudentPolicy.enabledStages.includes(activeStageNum);
  const isStageGlobalUnlocked =
    isStageEnabledForStudent && activeStudentPolicy.unlockedStages.includes(activeStageNum);
  const isStageLetterIssued =
    stageControl.requireIssuedLetter === false || issuedStages.includes(activeStageNum);
  const isStageCompleted = isStageCompletedInData(activeStageNum, activeStudent);
  const activeEditLockKey = getStageEditLockKey(activeStageNum, activeStudentKey);
  const isStageEditUnlocked = Boolean(activeEditLockKey && editUnlockedKeys[activeEditLockKey]);
  const isCompletedReadOnly =
    isStageGlobalUnlocked && isStageLetterIssued && isStageCompleted && !isStageEditUnlocked;
  const isStageReadOnly = !isStageGlobalUnlocked || !isStageLetterIssued || isCompletedReadOnly;

  const activeDraftKey = activeStudent ? `${activeStudentKey}::${activeStageNum}` : '';
  const activeDraft: StudentStageDraft =
    (activeDraftKey && draftsByKey[activeDraftKey]) || DEFAULT_DRAFT;
  const activeWorkshopDraft: WorkshopStageDraft =
    workshopDraftsByStage[activeStageNum] || DEFAULT_WORKSHOP_DRAFT;

  const updateActiveDraft = (patch: Partial<StudentStageDraft>) => {
    if (!activeDraftKey || isStageReadOnly) return;
    setFormError('');
    setDraftsByKey((prev) => {
      const nextDraft: StudentStageDraft = {
        ...(prev[activeDraftKey] || DEFAULT_DRAFT),
        ...patch,
      };
      return {
        ...prev,
        [activeDraftKey]: nextDraft,
      };
    });
  };

  const updateActiveWorkshopDraft = (patch: Partial<WorkshopStageDraft>) => {
    if (!selectedDudi || isStageReadOnly) return;
    setFormError('');
    setWorkshopDraftsByStage((prev) => {
      const base = prev[activeStageNum] || DEFAULT_WORKSHOP_DRAFT;
      const nextWorkshop = normalizeWorkshopDraft({
        ...base,
        ...patch,
      });
      return {
        ...prev,
        [activeStageNum]: nextWorkshop,
      };
    });
  };

  const prevEnabledStageForCopy = getPreviousEnabledStage(
    activeStudentPolicy.enabledStages,
    activeStageNum
  );
  const prevStageWorkshop =
    prevEnabledStageForCopy !== null ? workshopDraftsByStage[prevEnabledStageForCopy] : undefined;
  const canCopyWorkshopFromPrevStage =
    !isStageReadOnly && prevEnabledStageForCopy !== null && hasFilledWorkshopData(prevStageWorkshop);

  const copyWorkshopFromPrevStage = () => {
    if (!canCopyWorkshopFromPrevStage || !prevStageWorkshop) return;
    updateActiveWorkshopDraft({
      kompetensiList: [...prevStageWorkshop.kompetensiList],
      kondisiBengkel: { ...prevStageWorkshop.kondisiBengkel },
    });
  };

  const markAllBengkelBaik = () => {
    updateActiveWorkshopDraft({
      kondisiBengkel: {
        volumePekerjaan: 'Baik',
        relevansiPekerjaan: 'Baik',
        kenyamanan: 'Baik',
        kelayakan: 'Baik',
      },
    });
  };

  const applyStandardStudentChecklist = () => {
    updateActiveDraft({
      bukuLaporan: 'SDH',
      aktivitasDp: 'Baik',
      aktivitasMt: 'Baik',
      aktivitasKrt: 'Baik',
    });
  };

  const updateDeliveryStudentTtd = (stuKey: string, nextTtd: string) => {
    if (isStageReadOnly || !stuKey) return;
    setFormError('');
    setDeliveryTtdByKey((prev) => ({ ...prev, [stuKey]: nextTtd }));
  };

  const updateDeliveryCatatan = (nextNote: string) => {
    if (isStageReadOnly) return;
    setFormError('');
    setDeliveryCatatan(nextNote);
  };

  const toggleDeliveryStudentKey = (stuKey: string) => {
    if (isStageReadOnly) return;
    setFormError('');
    setDeliverySelectedKeys((prev) =>
      prev.includes(stuKey) ? prev.filter((k) => k !== stuKey) : [...prev, stuKey]
    );
  };

  const buildEditConfirmPayload = (stageNum: number): PendingStageEditConfirm => {
    const lockKey = getStageEditLockKey(stageNum, activeStudentKey);
    const savedDate =
      stageNum === 1
        ? dudiStudents.find((s) => s.stageLogs?.[1]?.tanggal)?.stageLogs?.[1]?.tanggal
        : activeStudent?.stageLogs?.[stageNum]?.tanggal;
    return {
      mode: stageNum === 1 ? 'delivery' : 'stage',
      stageNum,
      stageLabel: getStageValueByNumber(stageNum),
      targetName:
        stageNum === 1
          ? `${dudiStudents.length} Siswa · ${selectedDudi?.nama || 'DUDI'}`
          : activeStudent?.nama || 'Siswa',
      lockKey,
      savedDate,
    };
  };

  const setStudentStage = (stageNum: number) => {
    if (!activeStudentKey) return;
    if (!activeStudentPolicy.enabledStages.includes(stageNum)) {
      reportValidationError(
        `${getStageValueByNumber(stageNum)} tidak termasuk tahapan aktif untuk jurusan siswa ini.`
      );
      return;
    }
    const isGlobalUnlocked = activeStudentPolicy.unlockedStages.includes(stageNum);
    const isLetterIssued =
      stageControl.requireIssuedLetter === false || issuedStages.includes(stageNum);
    const isCompleted = isStageCompletedInData(stageNum, activeStudent);

    if (!isGlobalUnlocked && !isCompleted) {
      reportValidationError(
        stageControl.lockedReason
          ? `Tahap ${stageNum} sedang dikunci oleh SuperAdmin (${stageControl.lockedReason}).`
          : `Tahap ${stageNum} sedang dikunci sementara oleh SuperAdmin.`
      );
      return;
    }

    if (!isLetterIssued && !isCompleted) {
      reportValidationError(
        `Surat ${getStageValueByNumber(stageNum)} untuk DUDI "${selectedDudi?.nama || 'ini'}" belum diterbitkan Admin Hubin di Pusat Dokumen.`
      );
      return;
    }

    const prevEnabledStage = getPreviousEnabledStage(activeStudentPolicy.enabledStages, stageNum);
    if (
      isGlobalUnlocked &&
      isLetterIssued &&
      stageControl.requireSequential &&
      prevEnabledStage !== null &&
      !(activeStudent?.completedStages || []).includes(prevEnabledStage)
    ) {
      const prevLabel = getStageValueByNumber(prevEnabledStage);
      reportValidationError(
        `Tahap ${stageNum} masih terkunci. Harap isi dan simpan ${prevLabel} terlebih dahulu.`
      );
      return;
    }

    const targetLockKey = getStageEditLockKey(stageNum, activeStudentKey);
    const isTargetEditUnlocked = Boolean(targetLockKey && editUnlockedKeys[targetLockKey]);
    if (isGlobalUnlocked && isLetterIssued && isCompleted && !isTargetEditUnlocked) {
      setFormError('');
      setPendingEditConfirm(buildEditConfirmPayload(stageNum));
      return;
    }

    setFormError('');
    setStageByStudent((prev) => ({
      ...prev,
      [activeStudentKey]: stageNum,
    }));
  };

  const requestUnlockCurrentStageEdit = () => {
    if (!activeStudentKey || !isCompletedReadOnly) return;
    setFormError('');
    setPendingEditConfirm(buildEditConfirmPayload(activeStageNum));
  };

  const confirmStageViewReadOnly = () => {
    if (!pendingEditConfirm || !activeStudentKey) {
      setPendingEditConfirm(null);
      return;
    }
    const targetStage = pendingEditConfirm.stageNum;
    setPendingEditConfirm(null);
    setFormError('');
    setStageByStudent((prev) => ({
      ...prev,
      [activeStudentKey]: targetStage,
    }));
  };

  const confirmStageEditUnlock = () => {
    if (!pendingEditConfirm || !activeStudentKey) {
      setPendingEditConfirm(null);
      return;
    }
    const { stageNum: targetStage, lockKey } = pendingEditConfirm;
    if (lockKey) {
      setEditUnlockedKeys((prev) => ({ ...prev, [lockKey]: true }));
    }
    setPendingEditConfirm(null);
    setFormError('');
    setStageByStudent((prev) => ({
      ...prev,
      [activeStudentKey]: targetStage,
    }));
  };

  const cancelStageEditConfirm = () => {
    setPendingEditConfirm(null);
  };

  const alreadyHasGrade = Boolean(activeStudent?.hasSubmittedGrades);
  const isEditingGrade = Boolean(activeStudentKey && editingGradeByStudent[activeStudentKey]);
  const canInputGradeThisStage = !alreadyHasGrade && activeStageNum >= activeStudentPolicy.gradeStage;
  const showGradeInputs = canInputGradeThisStage && activeDraft.nilaiPklMuncul === true;

  const activeGradeEditDraft: GradeScoresDraft = (activeStudentKey &&
    gradeEditDrafts[activeStudentKey]) || {
    nilaiK3lh: Number(activeStudent?.submittedGradeSummary?.k3lh ?? 0) || 0,
    nilaiSoftskill: Number(activeStudent?.submittedGradeSummary?.softskill ?? 0) || 0,
    nilaiKompetensiTeknis: Number(activeStudent?.submittedGradeSummary?.teknis ?? 0) || 0,
    nilaiAlurBisnis: Number(activeStudent?.submittedGradeSummary?.alurBisnis ?? 0) || 0,
  };

  const rataRataEditNilai = useMemo(() => {
    return calculateEqualWeightedAverage(
      activeGradeEditDraft.nilaiK3lh,
      activeGradeEditDraft.nilaiSoftskill,
      activeGradeEditDraft.nilaiKompetensiTeknis,
      activeGradeEditDraft.nilaiAlurBisnis
    );
  }, [
    activeGradeEditDraft.nilaiK3lh,
    activeGradeEditDraft.nilaiSoftskill,
    activeGradeEditDraft.nilaiKompetensiTeknis,
    activeGradeEditDraft.nilaiAlurBisnis,
  ]);

  const predikatEditNilai = useMemo(() => getPredikatFromScore(rataRataEditNilai), [rataRataEditNilai]);

  const startEditGrade = () => {
    if (!activeStudent || !activeStudentKey || isStageReadOnly) return;
    const g = activeStudent.submittedGradeSummary;
    const fallbackAvg = Number(g?.rataRata ?? 0) || 0;
    setGradeEditDrafts((prev) => ({
      ...prev,
      [activeStudentKey]: {
        nilaiK3lh: Number(g?.k3lh ?? fallbackAvg) || 0,
        nilaiSoftskill: Number(g?.softskill ?? fallbackAvg) || 0,
        nilaiKompetensiTeknis: Number(g?.teknis ?? fallbackAvg) || 0,
        nilaiAlurBisnis: Number(g?.alurBisnis ?? fallbackAvg) || 0,
      },
    }));
    setEditingGradeByStudent((prev) => ({ ...prev, [activeStudentKey]: true }));
    setFormError('');
  };

  const cancelEditGrade = () => {
    if (!activeStudentKey) return;
    setEditingGradeByStudent((prev) => ({ ...prev, [activeStudentKey]: false }));
    setFormError('');
  };

  const updateGradeEditDraft = (patch: Partial<GradeScoresDraft>) => {
    if (!activeStudentKey) return;
    setFormError('');
    setGradeEditDrafts((prev) => ({
      ...prev,
      [activeStudentKey]: {
        ...activeGradeEditDraft,
        ...patch,
      },
    }));
  };

  const handleSaveEditedGrades = async () => {
    if (!activeStudent || !activeStudentKey || !selectedDudi || isStageReadOnly) return;
    const scores = [
      activeGradeEditDraft.nilaiK3lh,
      activeGradeEditDraft.nilaiSoftskill,
      activeGradeEditDraft.nilaiKompetensiTeknis,
      activeGradeEditDraft.nilaiAlurBisnis,
    ];
    if (scores.some((s) => !Number.isFinite(s) || s < 1 || s > 100)) {
      reportValidationError(
        'Keempat kategori nilai PKL (K3LH, Softskills, Hardskills, Alur Bisnis) wajib diisi antara 1 – 100.'
      );
      return;
    }
    if (!isOnline) {
      reportValidationError(
        'Koneksi internet terputus. Data nilai belum tersimpan di server. Hubungkan internet lalu kirim ulang.'
      );
      return;
    }
    setSavingGradeEdit(true);
    setFormError('');
    try {
      const stageLabel = getStageValueByNumber(activeStageNum);
      const res = await PublicPortalClient.updateMonitoringGrades({
        monitoring_id: activeStudent.submittedGradeSummary?.monitoringId,
        id_penempatan: activeStudent.idPenempatan || activeStudent.id,
        nis: activeStudent.nis,
        nama_siswa: activeStudent.nama,
        kelas: activeStudent.kelas || '-',
        jurusan: activeStudent.jurusan || '',
        dudi_id: selectedDudi.id || '',
        nama_dudi: selectedDudi.nama,
        alamat_dudi: selectedDudi.alamat || '',
        guru_id: selectedPetugasId || '',
        guru_pembimbing: selectedPetugasNama,
        tahap_monitoring: activeStudent.submittedGradeSummary?.tahapDiinput || stageLabel,
        tanggal: getTodayWibIsoDate(),
        nilai_k3lh: activeGradeEditDraft.nilaiK3lh,
        nilai_softskill: activeGradeEditDraft.nilaiSoftskill,
        nilai_kompetensi_teknis: activeGradeEditDraft.nilaiKompetensiTeknis,
        nilai_alur_bisnis: activeGradeEditDraft.nilaiAlurBisnis,
      });

      if (res.success) {
        setDudiStudents((prev) =>
          prev.map((stu, idx) =>
            idx === selectedStudentIndex
              ? {
                  ...stu,
                  hasSubmittedGrades: true,
                  submittedGradeSummary: res.gradeSummary,
                }
              : stu
          )
        );
        setEditingGradeByStudent((prev) => ({ ...prev, [activeStudentKey]: false }));
        if (onSuccess) onSuccess();
      } else {
        reportValidationError(res.message || 'Gagal menyimpan perubahan nilai ke Cloud Server.');
      }
    } catch (e: any) {
      reportValidationError(e?.message || 'Gagal memperbarui nilai ke Cloud Server.');
    } finally {
      setSavingGradeEdit(false);
    }
  };

  const rataRataNilai = useMemo(() => {
    return calculateEqualWeightedAverage(
      activeDraft.nilaiK3lh,
      activeDraft.nilaiSoftskill,
      activeDraft.nilaiKompetensiTeknis,
      activeDraft.nilaiAlurBisnis
    );
  }, [
    activeDraft.nilaiK3lh,
    activeDraft.nilaiSoftskill,
    activeDraft.nilaiKompetensiTeknis,
    activeDraft.nilaiAlurBisnis,
  ]);

  const predikatNilai = useMemo(() => getPredikatFromScore(rataRataNilai), [rataRataNilai]);

  const handleSaveDeliveryValidation = async () => {
    if (!selectedDudi) return;
    setFormError('');

    if (!isStageGlobalUnlocked) {
      reportValidationError(
        stageControl.lockedReason
          ? `Tahap 1 sedang dikunci oleh SuperAdmin (${stageControl.lockedReason}).`
          : 'Tahap 1 sedang dikunci oleh SuperAdmin dan hanya dapat dilihat (Read-Only).'
      );
      return;
    }

    if (!isStageLetterIssued) {
      reportValidationError(
        `Surat ${getStageValueByNumber(1)} untuk DUDI "${selectedDudi?.nama || 'ini'}" belum diterbitkan Admin Hubin di Pusat Dokumen.`
      );
      return;
    }

    const cleanPemimpin = dudiPemimpin.trim();
    const cleanPic = dudiPic.trim();
    const cleanTelp = dudiTelp.trim();
    if (!cleanPemimpin || cleanPemimpin === '-' || !cleanPic || cleanPic === '-' || cleanTelp.replace(/\D/g, '').length < 7) {
      reportValidationError(
        'Nama Pemimpin DUDI, Nama PIC / Pembimbing DUDI, dan No. Telp / WhatsApp DUDI (min. 7 digit) wajib dilengkapi.'
      );
      return;
    }

    if (!dudiHariMulai || !dudiHariSelesai || !dudiJamMulai || !dudiJamSelesai) {
      reportValidationError(
        'Jadwal Hari Kerja dan Jam Kerja DUDI (Rentang) wajib dilengkapi saat Pengantaran.'
      );
      return;
    }

    if (!deliveryContactConfirmed) {
      reportValidationError(
        'Harap centang konfirmasi bahwa data Petugas DUDI & Jadwal Kerja di atas sudah benar.'
      );
      return;
    }

    const selectedStudentsWithKey = dudiStudents
      .map((stu, idx) => ({ stu, key: getStudentKey(stu, idx) }))
      .filter(({ key }) => deliverySelectedKeys.includes(key));

    if (selectedStudentsWithKey.length === 0) {
      reportValidationError('Pilih minimal 1 siswa yang diantar pada DUDI ini.');
      return;
    }

    const requireStudentSignature = stageControl.requireStudentSignature === true;
    if (requireStudentSignature) {
      const missingTtdStudent = selectedStudentsWithKey.find(
        ({ key }) => !deliveryTtdByKey[key] || !deliveryTtdByKey[key].startsWith('svgpath:')
      );
      if (missingTtdStudent) {
        reportValidationError(
          `Tanda Tangan Siswa (${missingTtdStudent.stu.nama}) wajib diisi sebagai bukti pengantaran.`
        );
        return;
      }
    }

    if (!isOnline) {
      reportValidationError(
        'Koneksi internet terputus. Data pengantaran belum tersimpan di server. Hubungkan internet lalu kirim ulang.'
      );
      return;
    }

    const hariKerjaStr = formatRangePair(dudiHariMulai, dudiHariSelesai);
    const jamKerjaStr = formatRangePair(dudiJamMulai, dudiJamSelesai);
    const stageLabel = getStageValueByNumber(1);
    const todayWib = getTodayWibIsoDate();

    setSubmitting(true);
    try {
      const res = await PublicPortalClient.submitDeliveryValidation({
        dudi_id: selectedDudi.id || '',
        nama_dudi: selectedDudi.nama,
        alamat_dudi: selectedDudi.alamat || '',
        guru_id: selectedPetugasId || '',
        guru_pembimbing: selectedPetugasNama,
        tanggal: todayWib,
        nama_pemimpin: cleanPemimpin,
        nama_pic: cleanPic,
        no_telp_dudi: cleanTelp,
        hari_kerja: hariKerjaStr,
        jam_kerja: jamKerjaStr,
        spelling_confirmed: true,
        catatan_pengantaran: deliveryCatatan.trim(),
        students: selectedStudentsWithKey.map(({ stu, key }) => ({
          id_penempatan: stu.idPenempatan || stu.id,
          nis: stu.nis,
          nama_siswa: stu.nama,
          kelas: stu.kelas || '-',
          jurusan: stu.jurusan || '',
          ttd_siswa: deliveryTtdByKey[key] || '',
        })),
      });

      if (res.success && res.verifiedInSpreadsheet !== false) {

        const updatedContact = {
          namaPemimpin: res.dudiContact?.namaPemimpin || cleanPemimpin,
          pic: res.dudiContact?.pic || cleanPic,
          kontak: res.dudiContact?.kontak || cleanTelp,
          hariKerja: res.dudiContact?.hariKerja || hariKerjaStr,
          jamKerja: res.dudiContact?.jamKerja || jamKerjaStr,
        };
        setSelectedDudi((prev: any) => (prev ? { ...prev, ...updatedContact } : prev));
        setAssignedDudiList((prev) =>
          prev.map((d) =>
            d.nama === selectedDudi.nama || (d.id && d.id === selectedDudi.id)
              ? { ...d, ...updatedContact }
              : d
          )
        );
        setShowDudiContactEditor(false);

        const deliveredKeySet = new Set(selectedStudentsWithKey.map((x) => x.key));
        const resultByNis = new Map((res.results || []).map((r) => [r.nis, r]));

        setDudiStudents((prev) =>
          prev.map((stu, idx) => {
            const key = getStudentKey(stu, idx);
            if (!deliveredKeySet.has(key)) return stu;
            const prevCompleted: number[] = Array.isArray(stu.completedStages)
              ? stu.completedStages
              : [];
            const nextCompleted = Array.from(new Set([...prevCompleted, 1])).sort((a, b) => a - b);
            const matchedRes = resultByNis.get(stu.nis);
            const savedMonId =
              matchedRes?.idMonitoring ||
              stu.stageLogs?.[1]?.monitoringId ||
              `MON-${Date.now()}-${idx}`;
            const savedStuTtd = deliveryTtdByKey[key] || matchedRes?.ttdSiswa || '';
            const nextStageLogs = {
              ...(stu.stageLogs || {}),
              [1]: {
                monitoringId: savedMonId,
                stageNum: 1,
                tahap: stageLabel,
                sakit: 0,
                izin: 0,
                alpha: 0,
                bukuLaporan: '',
                aktivitasDp: '',
                aktivitasMt: '',
                aktivitasKrt: '',
                kompetensiList: [],
                kondisiBengkel: { ...EMPTY_KONDISI_BENGKEL },
                ttdSiswa: savedStuTtd,
                catatan: deliveryCatatan.trim(),
                tanggal: todayWib,
                status: 'Terlaksana',
              },
            };
            const nextRec = pickRecommendedStageForControl(
              nextCompleted,
              stageControl,
              issuedStages,
              nextStageLogs,
              stu.jurusan
            );

            return {
              ...stu,
              completedStages: nextCompleted,
              recommendedStage: nextRec,
              stageLogs: nextStageLogs,
            };
          })
        );

        if (activeDudiKeyRef.current) {
          const deliveryLockKey = `delivery::${activeDudiKeyRef.current}`;
          setEditUnlockedKeys((prev) => {
            if (!prev[deliveryLockKey]) return prev;
            const next = { ...prev };
            delete next[deliveryLockKey];
            return next;
          });
        }

        if (onSuccess) onSuccess();

        const firstRes = res.results?.[0];
        const firstStudentPolicy =
          dudiStudents[0]?.stagePolicy ||
          resolveMonitoringStagePolicy(stageControl, dudiStudents[0]?.jurusan);
        const nextStageAfterDelivery = firstStudentPolicy.enabledStages.find((n: number) => n > 1) ?? 2;
        const canContinueNextStage =
          firstStudentPolicy.unlockedStages.includes(nextStageAfterDelivery) &&
          (stageControl.requireIssuedLetter === false || issuedStages.includes(nextStageAfterDelivery));

        setSaveReceipt({
          idMonitoring: firstRes?.idMonitoring || `MON-${Date.now()}`,
          studentName:
            selectedStudentsWithKey.length === 1
              ? selectedStudentsWithKey[0].stu.nama
              : `${selectedStudentsWithKey.length} Siswa (${selectedDudi.nama})`,
          studentNis: selectedStudentsWithKey[0]?.stu?.nis || '-',
          dudiName: selectedDudi.nama,
          stageNum: 1,
          stageLabel,
          sakit: 0,
          izin: 0,
          alpha: 0,
          bukuLaporan: '',
          ttdSigned: requireStudentSignature,
          isDeliveryBatch: true,
          deliveredStudents: selectedStudentsWithKey.map(({ stu }) => ({
            nama: stu.nama,
            nis: stu.nis,
          })),
          dudiPemimpin: updatedContact.namaPemimpin,
          dudiPic: updatedContact.pic,
          dudiKontak: updatedContact.kontak,
          verifiedInSpreadsheet: true,
          sheetRowNumber: res.sheetRowNumber,
          savedAt: res.savedAt || new Date().toISOString(),
          nextStudentIndex: canContinueNextStage ? 0 : undefined,
          nextStudentName: canContinueNextStage
            ? `Lanjut ke ${getStageValueByNumber(nextStageAfterDelivery)}`
            : undefined,
        });
      } else {
        reportValidationError(res.message || 'Gagal menyimpan validasi pengantaran ke Cloud Server.');
      }
    } catch (e: any) {
      reportValidationError(e?.message || 'Periksa koneksi internet dan layanan Cloud Server.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveSupervision = async () => {
    if (!activeStudent || !selectedDudi) return;
    if (activeStageNum === 1) {
      await handleSaveDeliveryValidation();
      return;
    }
    setFormError('');

    if (!isStageEnabledForStudent) {
      reportValidationError(
        `${getStageValueByNumber(activeStageNum)} tidak termasuk tahapan monitoring aktif untuk jurusan siswa ini.`
      );
      return;
    }

    if (!isStageGlobalUnlocked) {
      reportValidationError(
        stageControl.lockedReason
          ? `Tahap ${activeStageNum} sedang dikunci oleh SuperAdmin (${stageControl.lockedReason}).`
          : `Tahap ${activeStageNum} sedang dikunci oleh SuperAdmin dan hanya dapat dilihat (Read-Only).`
      );
      return;
    }

    if (!isStageLetterIssued) {
      reportValidationError(
        `Surat ${getStageValueByNumber(activeStageNum)} untuk DUDI "${selectedDudi?.nama || 'ini'}" belum diterbitkan Admin Hubin di Pusat Dokumen.`
      );
      return;
    }

    const prevEnabledStage = getPreviousEnabledStage(activeStudentPolicy.enabledStages, activeStageNum);
    if (
      stageControl.requireSequential &&
      prevEnabledStage !== null &&
      !(activeStudent.completedStages || []).includes(prevEnabledStage)
    ) {
      const prevLabel = getStageValueByNumber(prevEnabledStage);
      reportValidationError(
        `Tahap ${activeStageNum} masih terkunci. Harap isi dan simpan ${prevLabel} terlebih dahulu.`
      );
      return;
    }

    if (isDudiContactIncomplete(dudiPemimpin, dudiPic, dudiTelp)) {
      setPopupPemimpin(dudiPemimpin);
      setPopupPic(dudiPic);
      setPopupTelp(dudiTelp);
      setPopupHariMulai(dudiHariMulai);
      setPopupHariSelesai(dudiHariSelesai);
      setPopupJamMulai(dudiJamMulai);
      setPopupJamSelesai(dudiJamSelesai);
      setPopupSpellingConfirmed(false);
      setPopupError(
        'Data Pemimpin, PIC, dan No. Telp DUDI harus dilengkapi dan dikonfirmasi ejaannya terlebih dahulu.'
      );
      setDudiPopupOpen(true);
      return;
    }

    const requireStudentSignature = stageControl.requireStudentSignature === true;
    if (requireStudentSignature && !activeDraft.ttdSiswa) {
      reportValidationError(
        'Tanda Tangan Siswa di bawah Absensi wajib diisi oleh siswa bersangkutan sebelum menyimpan.'
      );
      return;
    }

    const filledKompetensi = activeWorkshopDraft.kompetensiList
      .map((k) => k.trim())
      .filter(Boolean);
    if (filledKompetensi.length < 2) {
      reportValidationError(
        'Harap isikan minimal 2 baris Kompetensi yang didapat pada bagian Data Umum Bengkel DUDI.'
      );
      return;
    }

    const kb = activeWorkshopDraft.kondisiBengkel;
    if (!kb.volumePekerjaan || !kb.relevansiPekerjaan || !kb.kenyamanan || !kb.kelayakan) {
      reportValidationError(
        'Harap lengkapi seluruh pilihan centang Keadaan Bengkel pada bagian Data Umum Bengkel DUDI.'
      );
      return;
    }

    if (!activeDraft.bukuLaporan) {
      reportValidationError('Harap pilih Ceklist Buku Laporan siswa (BLM, SDH, atau TDK).');
      return;
    }

    if (!activeDraft.aktivitasDp || !activeDraft.aktivitasMt || !activeDraft.aktivitasKrt) {
      reportValidationError(
        'Harap lengkapi Ceklist Aktivitas Siswa untuk ketiga aspek (DP Kedisiplinan, MT Motivasi, dan KRT Kreativitas).'
      );
      return;
    }

    if (activeStageNum === activeStudentPolicy.gradeStage && !alreadyHasGrade && activeDraft.nilaiPklMuncul === null) {
      reportValidationError(
        `Pada ${getStageValueByNumber(activeStageNum)}, silakan pilih terlebih dahulu apakah nilai PKL sudah muncul ("Ya, Sudah Muncul" atau "Belum Muncul").`
      );
      return;
    }

    const stageLabel = getStageValueByNumber(activeStageNum);
    const shouldSubmitGrades = canInputGradeThisStage && activeDraft.nilaiPklMuncul === true;
    if (shouldSubmitGrades) {
      const scores = [
        activeDraft.nilaiK3lh,
        activeDraft.nilaiSoftskill,
        activeDraft.nilaiKompetensiTeknis,
        activeDraft.nilaiAlurBisnis,
      ];
      if (scores.some((s) => !Number.isFinite(s) || s < 1 || s > 100)) {
        reportValidationError(
          'Keempat kategori nilai PKL (K3LH, Softskills, Hardskills, Alur Bisnis) wajib diisi antara 1 – 100.'
        );
        return;
      }
    }
    const existingStageLog = activeStudent.stageLogs?.[activeStageNum];

    if (!isOnline) {
      reportValidationError(
        'Koneksi internet terputus. Data monitoring belum tersimpan di server. Hubungkan internet lalu tekan Simpan lagi.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const shouldSendDudiContact = activeStageNum === 1 || showDudiContactEditor;
      const hariKerjaStr = formatRangePair(dudiHariMulai, dudiHariSelesai);
      const jamKerjaStr = formatRangePair(dudiJamMulai, dudiJamSelesai);
      const payload = {
        existing_monitoring_id: existingStageLog?.monitoringId,
        id_penempatan: activeStudent.idPenempatan || activeStudent.id,
        nis: activeStudent.nis,
        nama_siswa: activeStudent.nama,
        kelas: activeStudent.kelas || '-',
        jurusan: activeStudent.jurusan || '',
        dudi_id: selectedDudi.id || '',
        nama_dudi: selectedDudi.nama,
        alamat_dudi: selectedDudi.alamat || '',
        guru_id: selectedPetugasId || '',
        guru_pembimbing: selectedPetugasNama,
        tahap_monitoring: stageLabel,
        tanggal: getTodayWibIsoDate(),
        sakit: activeDraft.sakit,
        izin: activeDraft.izin,
        alpha: activeDraft.alpha,
        buku_laporan: activeDraft.bukuLaporan,
        aktivitas_dp: activeDraft.aktivitasDp,
        aktivitas_mt: activeDraft.aktivitasMt,
        aktivitas_krt: activeDraft.aktivitasKrt,
        kompetensi_siswa: filledKompetensi,
        kondisi_bengkel: activeWorkshopDraft.kondisiBengkel,
        ttd_siswa: activeDraft.ttdSiswa,
        nilai_pkl_muncul: shouldSubmitGrades,
        nilai_k3lh: shouldSubmitGrades ? activeDraft.nilaiK3lh : undefined,
        nilai_softskill: shouldSubmitGrades ? activeDraft.nilaiSoftskill : undefined,
        nilai_kompetensi_teknis: shouldSubmitGrades ? activeDraft.nilaiKompetensiTeknis : undefined,
        nilai_alur_bisnis: shouldSubmitGrades ? activeDraft.nilaiAlurBisnis : undefined,
        nilai_rata_rata: shouldSubmitGrades ? rataRataNilai : undefined,
        predikat: shouldSubmitGrades ? predikatNilai : undefined,
        catatan_perkembangan: activeDraft.catatanPerkembangan,
        ...(shouldSendDudiContact
          ? {
              nama_pemimpin: dudiPemimpin.trim(),
              nama_pic: dudiPic.trim(),
              no_telp_dudi: dudiTelp.trim(),
              ...(hariKerjaStr ? { hari_kerja: hariKerjaStr } : {}),
              ...(jamKerjaStr ? { jam_kerja: jamKerjaStr } : {}),
            }
          : {}),
      };

      const json = await PublicPortalClient.submitMonitoring(payload);

      if (json.success && json.verifiedInSpreadsheet !== false) {
        if (json.dudiContact) {
          const updatedContact = {
            namaPemimpin: json.dudiContact.namaPemimpin || dudiPemimpin.trim(),
            pic: json.dudiContact.pic || dudiPic.trim() || '-',
            kontak: json.dudiContact.kontak || dudiTelp.trim() || '-',
            ...(json.dudiContact.hariKerja || hariKerjaStr
              ? { hariKerja: json.dudiContact.hariKerja || hariKerjaStr }
              : {}),
            ...(json.dudiContact.jamKerja || jamKerjaStr
              ? { jamKerja: json.dudiContact.jamKerja || jamKerjaStr }
              : {}),
          };
          setSelectedDudi((prev: any) => (prev ? { ...prev, ...updatedContact } : prev));
          setAssignedDudiList((prev) =>
            prev.map((d) =>
              d.nama === selectedDudi.nama || (d.id && d.id === selectedDudi.id)
                ? { ...d, ...updatedContact }
                : d
            )
          );
          setShowDudiContactEditor(false);
        }

        const savedMonId =
          json.monitoring?.ID_Monitoring || existingStageLog?.monitoringId || `MON-${Date.now()}`;

        setDudiStudents((prev) =>
          prev.map((stu, idx) => {
            if (idx !== selectedStudentIndex) return stu;
            const prevCompleted: number[] = Array.isArray(stu.completedStages)
              ? stu.completedStages
              : [];
            const nextCompleted = Array.from(new Set([...prevCompleted, activeStageNum])).sort(
              (a, b) => a - b
            );
            const nextStageLogs = {
              ...(stu.stageLogs || {}),
              [activeStageNum]: {
                monitoringId: savedMonId,
                stageNum: activeStageNum,
                tahap: stageLabel,
                sakit: activeDraft.sakit,
                izin: activeDraft.izin,
                alpha: activeDraft.alpha,
                bukuLaporan: activeDraft.bukuLaporan,
                aktivitasDp: activeDraft.aktivitasDp,
                aktivitasMt: activeDraft.aktivitasMt,
                aktivitasKrt: activeDraft.aktivitasKrt,
                kompetensiList: filledKompetensi,
                kondisiBengkel: { ...activeWorkshopDraft.kondisiBengkel },
                ttdSiswa: activeDraft.ttdSiswa,
                catatan: activeDraft.catatanPerkembangan,
                tanggal: payload.tanggal,
                status: 'Terlaksana',
              },
            };
            const nextRec = pickRecommendedStageForControl(
              nextCompleted,
              stageControl,
              issuedStages,
              nextStageLogs,
              stu.jurusan
            );

            return {
              ...stu,
              completedStages: nextCompleted,
              recommendedStage: nextRec,
              hasSubmittedGrades: stu.hasSubmittedGrades || shouldSubmitGrades,
              submittedGradeSummary: shouldSubmitGrades
                ? {
                    monitoringId: savedMonId,
                    k3lh: activeDraft.nilaiK3lh,
                    softskill: activeDraft.nilaiSoftskill,
                    teknis: activeDraft.nilaiKompetensiTeknis,
                    alurBisnis: activeDraft.nilaiAlurBisnis,
                    rataRata: rataRataNilai,
                    tahapDiinput: stageLabel,
                    tanggal: payload.tanggal,
                  }
                : stu.submittedGradeSummary,
              stageLogs: nextStageLogs,
            };
          })
        );

        const allCompletedNow = dudiStudents.every((stu, idx) => {
          if (idx === selectedStudentIndex) return true;
          return Array.isArray(stu.completedStages) && stu.completedStages.includes(activeStageNum);
        });
        void allCompletedNow;

        const stageLockKey = getStageEditLockKey(activeStageNum, activeStudentKey);
        if (stageLockKey) {
          setEditUnlockedKeys((prev) => {
            if (!prev[stageLockKey]) return prev;
            const next = { ...prev };
            delete next[stageLockKey];
            return next;
          });
        }

        if (onSuccess) onSuccess();

        const nextPendingIdx = dudiStudents.findIndex((stu, idx) => {
          if (idx === selectedStudentIndex) return false;
          const completed = Array.isArray(stu.completedStages) ? stu.completedStages : [];
          return !completed.includes(activeStageNum);
        });
        setSaveReceipt({
          idMonitoring: savedMonId,
          studentName: activeStudent.nama,
          studentNis: activeStudent.nis,
          dudiName: selectedDudi.nama,
          stageNum: activeStageNum,
          stageLabel,
          sakit: activeDraft.sakit,
          izin: activeDraft.izin,
          alpha: activeDraft.alpha,
          bukuLaporan: activeDraft.bukuLaporan,
          ttdSigned: requireStudentSignature && Boolean(activeDraft.ttdSiswa),
          gradeAvg: shouldSubmitGrades ? rataRataNilai : undefined,
          gradePredikat: shouldSubmitGrades ? predikatNilai : undefined,
          gradeSynced: json.gradeSynced,
          verifiedInSpreadsheet: true,
          sheetRowNumber: json.sheetRowNumber,
          savedAt: json.savedAt || new Date().toISOString(),
          nextStudentIndex: nextPendingIdx >= 0 ? nextPendingIdx : undefined,
          nextStudentName: nextPendingIdx >= 0 ? dudiStudents[nextPendingIdx]?.nama : undefined,
        });
      } else {
        reportValidationError(json.message || 'Gagal menyimpan data ke Cloud Server.');
      }
    } catch (e: any) {
      reportValidationError(e?.message || 'Periksa koneksi internet dan layanan Cloud Server.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleContinueAfterSave = (
    action: 'next' | 'stay' | 'close',
    closePortal?: () => void
  ) => {
    const nextIdx = saveReceipt?.nextStudentIndex;
    const isDeliveryBatch = Boolean(saveReceipt?.isDeliveryBatch);
    setSaveReceipt(null);
    if (action === 'next') {
      if (isDeliveryBatch) {
        const nextStages: Record<string, number> = {};
        dudiStudents.forEach((stu, idx) => {
          const stuPol =
            stu?.stagePolicy || resolveMonitoringStagePolicy(stageControl, stu?.jurusan);
          nextStages[getStudentKey(stu, idx)] =
            stuPol.enabledStages.find((n: number) => n > 1) ?? 2;
        });
        setStageByStudent((prev) => ({ ...prev, ...nextStages }));
        setSelectedStudentIndex(0);
        setFormError('');
      } else if (nextIdx !== undefined) {
        setSelectedStudentIndex(nextIdx);
        setFormError('');
      }
    } else if (action === 'close' && closePortal) {
      closePortal();
    }
  };

  const handleAcknowledgeComplianceNotice = () => {
    try {
      sessionStorage.setItem(NOTICE_ACK_KEY, '1');
    } catch {
      // ignore
    }
    setShowComplianceNotice(false);
  };

  const selectStudentIndex = (idx: number) => {
    setSelectedStudentIndex(idx);
    setFormError('');
    if (selectedDudi && selectedPetugasId) {
      writePortalSessionJson(PETUGAS_DUDI_CACHE_KEY, {
        petugasId: selectedPetugasId,
        petugasNama: selectedPetugasNama,
        dudi: selectedDudi,
        selectedStudentIndex: idx,
        timestamp: Date.now(),
      });
    }
  };

  const backToDudiList = () => {
    removePortalSessionKey(PETUGAS_DUDI_CACHE_KEY);
    setDudiPopupOpen(false);
    setPendingEditConfirm(null);
    setEditUnlockedKeys({});
    setSelectedDudi(null);
    setDudiStudents([]);
    setFormError('');
    setCurrentStep(2);
  };

  const handlePetugasLogout = () => {
    removePortalSessionKey(PETUGAS_CACHE_KEY);
    removePortalSessionKey(PETUGAS_DUDI_CACHE_KEY);
    try {
      sessionStorage.removeItem(NOTICE_ACK_KEY);
    } catch {
      // ignore
    }
    setIsPinVerified(false);
    setShowComplianceNotice(false);
    setSaveReceipt(null);
    setPendingEditConfirm(null);
    setEditUnlockedKeys({});
    setSelectedPetugasId('');
    setSelectedPetugasNama('');
    setSelectedPetugasNip('');
    setDudiPopupOpen(false);
    setSelectedDudi(null);
    setDudiStudents([]);
    setAssignedDudiList([]);
    setStageByStudent({});
    setDraftsByKey({});
    setEditingGradeByStudent({});
    setGradeEditDrafts({});
    setIssuedStages([]);
    setIssuedStageDetails({});
    setCurrentStep(1);
    setPinInput('');
    ToastManager.getInstance().show(
      'Sesi Petugas Berakhir',
      'info',
      'Silakan pilih kembali nama petugas dan verifikasi password untuk melanjutkan.'
    );
  };

  return {
    isOnline,
    currentStep,
    setCurrentStep,
    petugasList,
    loadingPetugas,
    petugasLoadError,
    selectedPetugasId,
    setSelectedPetugasId,
    selectedPetugasNama,
    setSelectedPetugasNama,
    setSelectedPetugasNip,
    pinInput,
    setPinInput,
    isPinVerified,
    showComplianceNotice,
    verifyingPin,
    pinError,
    setPinError,
    assignedDudiList,
    loadingDudi,
    dudiError,
    selectedDudi,
    setSelectedDudi,
    dudiStudents,
    setDudiStudents,
    loadingStudents,
    studentsError,
    selectedStudentIndex,
    setSelectedStudentIndex: selectStudentIndex,
    savingGradeEdit,
    submitting,
    formError,
    formErrorTrigger,
    saveReceipt,
    setFormError,
    dudiPemimpin,
    setDudiPemimpin,
    dudiPic,
    setDudiPic,
    dudiTelp,
    setDudiTelp,
    dudiHariMulai,
    setDudiHariMulai,
    dudiHariSelesai,
    setDudiHariSelesai,
    dudiJamMulai,
    setDudiJamMulai,
    dudiJamSelesai,
    setDudiJamSelesai,
    showDudiContactEditor,
    setShowDudiContactEditor,
    deliveryTtdByKey,
    deliveryCatatan,
    deliveryContactConfirmed,
    setDeliveryContactConfirmed,
    deliverySelectedKeys,
    updateDeliveryStudentTtd,
    updateDeliveryCatatan,
    toggleDeliveryStudentKey,
    stageControl,
    issuedStages,
    issuedStageDetails,
    dudiPopupOpen,
    setDudiPopupOpen,
    popupPemimpin,
    setPopupPemimpin,
    popupPic,
    setPopupPic,
    popupTelp,
    setPopupTelp,
    popupHariMulai,
    setPopupHariMulai,
    popupHariSelesai,
    setPopupHariSelesai,
    popupJamMulai,
    setPopupJamMulai,
    popupJamSelesai,
    setPopupJamSelesai,
    popupSpellingConfirmed,
    setPopupSpellingConfirmed,
    popupError,
    setPopupError,
    savingPopupContact,
    activeStudent,
    activeStudentPolicy,
    activeStageNum,
    isStageReadOnly,
    isCompletedReadOnly,
    isStageLetterIssued,
    isStageCompleted,
    pendingEditConfirm,
    requestUnlockCurrentStageEdit,
    confirmStageViewReadOnly,
    confirmStageEditUnlock,
    cancelStageEditConfirm,
    activeDraft,
    activeWorkshopDraft,
    alreadyHasGrade,
    isEditingGrade,
    canInputGradeThisStage,
    showGradeInputs,
    canCopyWorkshopFromPrevStage,
    activeGradeEditDraft,
    rataRataEditNilai,
    predikatEditNilai,
    rataRataNilai,
    predikatNilai,
    loadPetugasList,
    handleVerifyPin,
    handleSelectDudi,
    backToDudiList,
    handleSaveDudiPopup,
    updateActiveDraft,
    updateActiveWorkshopDraft,
    copyWorkshopFromPrevStage,
    markAllBengkelBaik,
    applyStandardStudentChecklist,
    setStudentStage,
    startEditGrade,
    cancelEditGrade,
    updateGradeEditDraft,
    handleSaveEditedGrades,
    handleSaveSupervision,
    handleContinueAfterSave,
    handleAcknowledgeComplianceNotice,
    handlePetugasLogout,
  };
}
