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
const DRAFT_SESSION_PREFIX = 'hubin_portal_drafts_v2_';
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

interface StoredDudiDraftCache {
  timestamp: number;
  draftsByKey?: Record<string, StudentStageDraft>;
  workshopDraftsByStage?: Record<number, WorkshopStageDraft>;
  batchSelectedKeysByStage?: Record<number, string[]>;
  deliveryTtdByKey?: Record<string, string>;
  deliveryCatatan?: string;
  deliveryContactConfirmed?: boolean;
  deliverySelectedKeys?: string[];
}

function buildDraftSessionKey(petugasId: string, dudi: any): string {
  const safeTeacher = String(petugasId || 'anon').replace(/[^a-zA-Z0-9_-]/g, '_');
  const rawDudi = String(dudi?.id || dudi?.nama || 'dudi').trim().toLowerCase();
  const safeDudi = rawDudi.replace(/[^a-z0-9_-]/g, '_').slice(0, 64);
  return `${DRAFT_SESSION_PREFIX}${safeTeacher}__${safeDudi}`;
}

function clearAllPortalDraftSessionKeys(): void {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(DRAFT_SESSION_PREFIX)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    // ignore storage errors
  }
}

function hasUnsavedStudentDraftContent(d?: Partial<StudentStageDraft> | null): boolean {
  if (!d) return false;
  return Boolean(
    (Number(d.sakit) || 0) > 0 ||
      (Number(d.izin) || 0) > 0 ||
      (Number(d.alpha) || 0) > 0 ||
      d.bukuLaporan ||
      d.aktivitasDp ||
      d.aktivitasMt ||
      d.aktivitasKrt ||
      d.ttdSiswa ||
      d.nilaiPklMuncul !== null ||
      (d.catatanPerkembangan && d.catatanPerkembangan.trim().length > 0)
  );
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

  // Isolated per-student stage & per-(student, stage) drafts + shared per-(DUDI, stage) workshop draft & batch selections
  const [selectedDudiStage, setSelectedDudiStage] = useState<number | null>(null);
  const [stageByStudent, setStageByStudent] = useState<Record<string, number>>({});
  const [draftsByKey, setDraftsByKey] = useState<Record<string, StudentStageDraft>>({});
  const [workshopDraftsByStage, setWorkshopDraftsByStage] = useState<
    Record<number, WorkshopStageDraft>
  >({});
  const [batchSelectedKeysByStage, setBatchSelectedKeysByStage] = useState<
    Record<number, string[]>
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
    setSelectedDudiStage(null);
    setStageByStudent({});
    setDraftsByKey({});
    setWorkshopDraftsByStage({});
    setBatchSelectedKeysByStage({});
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

      const initBatchSelectedByStage: Record<number, string[]> = {};
      for (let stNum = 2; stNum <= 8; stNum++) {
        const isLetterIssued =
          effectiveControl.requireIssuedLetter === false || effectiveIssuedStages.includes(stNum);
        const eligiblePendingKeys: string[] = [];
        normalizedStudents.forEach((stu: any, idx: number) => {
          const stuKey = getStudentKey(stu, idx);
          const stuPolicy = stu.stagePolicy;
          if (!stuPolicy.enabledStages.includes(stNum)) return;
          if (!stuPolicy.unlockedStages.includes(stNum)) return;
          if (!isLetterIssued) return;
          const comp: number[] = Array.isArray(stu.completedStages) ? stu.completedStages : [];
          if (comp.includes(stNum)) return;
          const prevSt = getPreviousEnabledStage(stuPolicy.enabledStages, stNum);
          if (effectiveControl.requireSequential && prevSt !== null && !comp.includes(prevSt)) {
            return;
          }
          eligiblePendingKeys.push(stuKey);
        });
        initBatchSelectedByStage[stNum] = eligiblePendingKeys;
      }

      if (isBackgroundRefresh) {
        setStageByStudent((prev) => ({ ...initStages, ...prev }));
        setDraftsByKey((prev) => ({ ...initDrafts, ...prev }));
        setWorkshopDraftsByStage((prev) => ({ ...initWorkshops, ...prev }));
        setBatchSelectedKeysByStage((prev) => ({ ...initBatchSelectedByStage, ...prev }));
      } else {
        const draftSessionKey = buildDraftSessionKey(effectivePetugasId, dudi);
        const savedDraftCache = readPortalSessionJson<StoredDudiDraftCache>(draftSessionKey);

        const completedKeySet = new Set<string>();
        students.forEach((stu: any, idx: number) => {
          const sKey = getStudentKey(stu, idx);
          const compList = Array.isArray(stu.completedStages) ? stu.completedStages : [];
          compList.forEach((stNum: number) => completedKeySet.add(`${sKey}::${stNum}`));
        });

        const mergedDrafts: Record<string, StudentStageDraft> = { ...initDrafts };
        if (savedDraftCache?.draftsByKey && typeof savedDraftCache.draftsByKey === 'object') {
          Object.entries(savedDraftCache.draftsByKey).forEach(([k, val]) => {
            if (!completedKeySet.has(k) && hasUnsavedStudentDraftContent(val)) {
              mergedDrafts[k] = { ...DEFAULT_DRAFT, ...val };
            }
          });
        }

        const mergedWorkshops: Record<number, WorkshopStageDraft> = { ...initWorkshops };
        if (
          savedDraftCache?.workshopDraftsByStage &&
          typeof savedDraftCache.workshopDraftsByStage === 'object'
        ) {
          Object.entries(savedDraftCache.workshopDraftsByStage).forEach(([stStr, wVal]) => {
            const stNum = Number(stStr);
            const normalized = normalizeWorkshopDraft(wVal);
            if (
              stNum >= 1 &&
              stNum <= 8 &&
              !hasFilledWorkshopData(mergedWorkshops[stNum]) &&
              hasFilledWorkshopData(normalized)
            ) {
              mergedWorkshops[stNum] = normalized;
            }
          });
        }

        const mergedBatchByStage: Record<number, string[]> = { ...initBatchSelectedByStage };
        if (
          savedDraftCache?.batchSelectedKeysByStage &&
          typeof savedDraftCache.batchSelectedKeysByStage === 'object'
        ) {
          Object.entries(savedDraftCache.batchSelectedKeysByStage).forEach(([stStr, cachedKeys]) => {
            const stNum = Number(stStr);
            const eligibleSet = new Set(initBatchSelectedByStage[stNum] || []);
            if (stNum >= 2 && stNum <= 8 && Array.isArray(cachedKeys) && eligibleSet.size > 0) {
              const filtered = cachedKeys.filter((k) => eligibleSet.has(k));
              if (filtered.length > 0) {
                mergedBatchByStage[stNum] = filtered;
              }
            }
          });
        }

        setStageByStudent(initStages);
        setDraftsByKey(mergedDrafts);
        setWorkshopDraftsByStage(mergedWorkshops);
        setBatchSelectedKeysByStage(mergedBatchByStage);

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

        // Pick default DUDI-level stage (prefer first open pending stage across students)
        const allEnabledUnion = Array.from(
          new Set(
            normalizedStudents.flatMap((s: any) => s.stagePolicy?.enabledStages || [1, 2, 3, 4, 5, 6, 7, 8])
          )
        ).sort((a, b) => a - b);
        const firstOpenPendingStage = allEnabledUnion.find((stNum) => {
          const isLetterOk =
            effectiveControl.requireIssuedLetter === false || effectiveIssuedStages.includes(stNum);
          if (!isLetterOk) return false;
          return normalizedStudents.some((stu: any) => {
            const pol = stu.stagePolicy;
            if (!pol.enabledStages.includes(stNum) || !pol.unlockedStages.includes(stNum)) return false;
            const comp: number[] = Array.isArray(stu.completedStages) ? stu.completedStages : [];
            if (comp.includes(stNum)) return false;
            const prevSt = getPreviousEnabledStage(pol.enabledStages, stNum);
            return !(effectiveControl.requireSequential && prevSt !== null && !comp.includes(prevSt));
          });
        });
        const fallbackStu = normalizedStudents[resolvedIdx];
        const fallbackRec =
          (fallbackStu && initStages[getStudentKey(fallbackStu, resolvedIdx)]) ||
          allEnabledUnion[0] ||
          1;
        setSelectedDudiStage(firstOpenPendingStage ?? fallbackRec);

        // Initialize Stage 1 (Pengantaran) per-student TTD, Note & Student selection
        const allKeys = students.map((stu, idx) => getStudentKey(stu, idx));
        const allKeysSet = new Set(allKeys);
        const pendingDeliveryKeys = students
          .map((stu, idx) => ({ stu, key: getStudentKey(stu, idx) }))
          .filter(
            ({ stu }) => !(Array.isArray(stu.completedStages) && stu.completedStages.includes(1))
          )
          .map(({ key }) => key);
        const defaultDeliveryKeys = pendingDeliveryKeys.length > 0 ? pendingDeliveryKeys : allKeys;
        const allStage1Done =
          students.length > 0 &&
          students.every(
            (stu) => Array.isArray(stu.completedStages) && stu.completedStages.includes(1)
          );

        const cachedDeliveryKeys = Array.isArray(savedDraftCache?.deliverySelectedKeys)
          ? savedDraftCache!.deliverySelectedKeys.filter((k) => allKeysSet.has(k))
          : [];
        setDeliverySelectedKeys(
          !allStage1Done && cachedDeliveryKeys.length > 0
            ? cachedDeliveryKeys
            : defaultDeliveryKeys
        );

        const initTtdByKey: Record<string, string> = {};
        students.forEach((stu, idx) => {
          const key = getStudentKey(stu, idx);
          const serverTtd = String(stu?.stageLogs?.[1]?.ttdSiswa || '');
          const cachedTtd =
            !allStage1Done && savedDraftCache?.deliveryTtdByKey?.[key]
              ? String(savedDraftCache.deliveryTtdByKey[key])
              : '';
          initTtdByKey[key] = serverTtd || cachedTtd;
        });
        setDeliveryTtdByKey(initTtdByKey);

        const savedStage1NoteLog = students
          .map((stu) => stu?.stageLogs?.[1])
          .find((log) => Boolean(log && log.catatan));
        const serverNote = String(savedStage1NoteLog?.catatan || '');
        const cachedNote = !allStage1Done ? String(savedDraftCache?.deliveryCatatan || '') : '';
        setDeliveryCatatan(serverNote || cachedNote);

        const bioHasSchedule = Boolean(
          initHariRange.start && initHariRange.end && initJamRange.start && initJamRange.end
        );
        setDeliveryContactConfirmed(
          (allStage1Done || Boolean(savedDraftCache?.deliveryContactConfirmed)) &&
            !isDudiContactIncomplete(initPemimpin, initPic, initTelp) &&
            bioHasSchedule
        );
      }

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
    return Boolean(
      student && Array.isArray(student.completedStages) && student.completedStages.includes(stageNum)
    );
  };

  const dudiStagePolicy: ResolvedMonitoringStagePolicy = useMemo(() => {
    if (dudiStudents.length === 0) {
      return resolveMonitoringStagePolicy(stageControl);
    }
    const enabledSet = new Set<number>();
    const unlockedSet = new Set<number>();
    let minGradeStage = 8;
    let isCustom = false;
    let firstJurCode = '';
    dudiStudents.forEach((stu) => {
      const pol: ResolvedMonitoringStagePolicy =
        stu.stagePolicy || resolveMonitoringStagePolicy(stageControl, stu.jurusan);
      pol.enabledStages.forEach((n) => enabledSet.add(n));
      pol.unlockedStages.forEach((n) => unlockedSet.add(n));
      if (pol.gradeStage < minGradeStage) minGradeStage = pol.gradeStage;
      if (pol.isCustomJurusanPolicy) {
        isCustom = true;
        if (!firstJurCode && pol.jurusanCode) firstJurCode = pol.jurusanCode;
      }
    });
    const enabledStages = Array.from(enabledSet).sort((a, b) => a - b);
    const unlockedStages = enabledStages.filter((n) => unlockedSet.has(n));
    return {
      ...resolveMonitoringStagePolicy(stageControl),
      enabledStages: enabledStages.length > 0 ? enabledStages : [1, 2, 3, 4, 5, 6, 7, 8],
      unlockedStages,
      totalStages: enabledStages.length || 8,
      gradeStage: minGradeStage,
      isCustomJurusanPolicy: isCustom,
      jurusanCode: firstJurCode || '',
    };
  }, [dudiStudents, stageControl]);

  const activeStudent = dudiStudents[selectedStudentIndex] || null;
  const activeStudentKey = activeStudent ? getStudentKey(activeStudent, selectedStudentIndex) : '';
  const activeStudentPolicy: ResolvedMonitoringStagePolicy = useMemo(
    () =>
      activeStudent?.stagePolicy ||
      resolveMonitoringStagePolicy(stageControl, activeStudent?.jurusan),
    [activeStudent, stageControl]
  );

  const activeStageNum =
    selectedDudiStage ??
    (activeStudent
      ? stageByStudent[activeStudentKey] ||
        pickRecommendedStageForControl(
          Array.isArray(activeStudent.completedStages) ? activeStudent.completedStages : [],
          stageControl,
          issuedStages,
          activeStudent.stageLogs,
          activeStudent.jurusan
        )
      : 1);

  const isStageLetterIssued =
    stageControl.requireIssuedLetter === false || issuedStages.includes(activeStageNum);

  const isStudentEditableAtStage = (stu: any, stuKey: string, stageNum: number): boolean => {
    const pol: ResolvedMonitoringStagePolicy =
      stu?.stagePolicy || resolveMonitoringStagePolicy(stageControl, stu?.jurusan);
    if (!pol.enabledStages.includes(stageNum)) return false;
    if (!pol.unlockedStages.includes(stageNum)) return false;
    const letterOk = stageControl.requireIssuedLetter === false || issuedStages.includes(stageNum);
    if (!letterOk) return false;
    const comp: number[] = Array.isArray(stu?.completedStages) ? stu.completedStages : [];
    const prevSt = getPreviousEnabledStage(pol.enabledStages, stageNum);
    if (stageControl.requireSequential && prevSt !== null && !comp.includes(prevSt)) {
      return false;
    }
    const isCompleted = comp.includes(stageNum);
    const lockKey = `${stuKey}::${stageNum}`;
    return !isCompleted || Boolean(editUnlockedKeys[lockKey]);
  };

  const editableBatchStudentsWithKey = useMemo(() => {
    if (activeStageNum === 1) return [];
    return dudiStudents
      .map((stu, idx) => ({ stu, idx, stuKey: getStudentKey(stu, idx) }))
      .filter(({ stu, stuKey }) => isStudentEditableAtStage(stu, stuKey, activeStageNum));
  }, [dudiStudents, activeStageNum, stageControl, issuedStages, editUnlockedKeys]);

  const batchSelectedKeys = useMemo(() => {
    if (activeStageNum === 1) return [];
    const editableSet = new Set(editableBatchStudentsWithKey.map((x) => x.stuKey));
    const current = batchSelectedKeysByStage[activeStageNum];
    if (Array.isArray(current)) {
      return current.filter((k) => editableSet.has(k));
    }
    return editableBatchStudentsWithKey
      .filter(({ stu }) => !(Array.isArray(stu.completedStages) && stu.completedStages.includes(activeStageNum)))
      .map((x) => x.stuKey);
  }, [activeStageNum, batchSelectedKeysByStage, editableBatchStudentsWithKey]);

  const isStageEnabledForStudent = dudiStagePolicy.enabledStages.includes(activeStageNum);
  const isStageGlobalUnlocked =
    isStageEnabledForStudent && dudiStagePolicy.unlockedStages.includes(activeStageNum);

  const isStage1Completed =
    dudiStudents.length > 0 &&
    dudiStudents.every((s) => Array.isArray(s.completedStages) && s.completedStages.includes(1));
  const deliveryLockKey = getStageEditLockKey(1, '');
  const isDeliveryEditUnlocked = Boolean(deliveryLockKey && editUnlockedKeys[deliveryLockKey]);

  const isAllCompletedForStage =
    activeStageNum === 1
      ? isStage1Completed
      : dudiStudents.length > 0 &&
        dudiStudents.every(
          (s) => Array.isArray(s.completedStages) && s.completedStages.includes(activeStageNum)
        );

  const isStageCompleted = activeStageNum === 1 ? isStage1Completed : isAllCompletedForStage;
  const isCompletedReadOnly =
    activeStageNum === 1
      ? isStageGlobalUnlocked && isStageLetterIssued && isStage1Completed && !isDeliveryEditUnlocked
      : isStageGlobalUnlocked &&
        isStageLetterIssued &&
        editableBatchStudentsWithKey.length === 0 &&
        isAllCompletedForStage;
  const isStageReadOnly =
    activeStageNum === 1
      ? !isStageGlobalUnlocked || !isStageLetterIssued || isCompletedReadOnly
      : !isStageGlobalUnlocked ||
        !isStageLetterIssued ||
        editableBatchStudentsWithKey.length === 0;

  const activeDraftKey = activeStudent ? `${activeStudentKey}::${activeStageNum}` : '';
  const activeDraft: StudentStageDraft =
    (activeDraftKey && draftsByKey[activeDraftKey]) || DEFAULT_DRAFT;
  const activeWorkshopDraft: WorkshopStageDraft =
    workshopDraftsByStage[activeStageNum] || DEFAULT_WORKSHOP_DRAFT;

  const updateStudentDraftFor = (stuKey: string, patch: Partial<StudentStageDraft>) => {
    if (!stuKey) return;
    const stuIdx = dudiStudents.findIndex((s, i) => getStudentKey(s, i) === stuKey);
    const stu = stuIdx >= 0 ? dudiStudents[stuIdx] : null;
    if (!stu || !isStudentEditableAtStage(stu, stuKey, activeStageNum)) return;
    const draftKey = `${stuKey}::${activeStageNum}`;
    setFormError('');
    setDraftsByKey((prev) => ({
      ...prev,
      [draftKey]: {
        ...(prev[draftKey] || DEFAULT_DRAFT),
        ...patch,
      },
    }));
  };

  const updateActiveDraft = (patch: Partial<StudentStageDraft>) => {
    if (!activeStudentKey) return;
    updateStudentDraftFor(activeStudentKey, patch);
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
    dudiStagePolicy.enabledStages,
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

  const applyStandardStudentChecklistFor = (stuKey: string) => {
    updateStudentDraftFor(stuKey, {
      bukuLaporan: 'SDH',
      aktivitasDp: 'Baik',
      aktivitasMt: 'Baik',
      aktivitasKrt: 'Baik',
    });
  };

  const applyStandardStudentChecklist = () => {
    if (activeStudentKey) {
      applyStandardStudentChecklistFor(activeStudentKey);
    }
  };

  const toggleBatchStudentKey = (stuKey: string) => {
    if (activeStageNum === 1) return;
    setFormError('');
    setBatchSelectedKeysByStage((prev) => {
      const curr = prev[activeStageNum] ?? batchSelectedKeys;
      const next = curr.includes(stuKey) ? curr.filter((k) => k !== stuKey) : [...curr, stuKey];
      return {
        ...prev,
        [activeStageNum]: next,
      };
    });
  };

  const selectAllPendingBatchStudents = () => {
    if (activeStageNum === 1) return;
    setFormError('');
    setBatchSelectedKeysByStage((prev) => ({
      ...prev,
      [activeStageNum]: editableBatchStudentsWithKey.map((x) => x.stuKey),
    }));
  };

  const clearBatchStudentSelection = () => {
    if (activeStageNum === 1) return;
    setFormError('');
    setBatchSelectedKeysByStage((prev) => ({
      ...prev,
      [activeStageNum]: [],
    }));
  };

  const applyBatchStandardDefaults = () => {
    if (activeStageNum === 1 || editableBatchStudentsWithKey.length === 0) return;
    setFormError('');
    const targetKeys =
      batchSelectedKeys.length > 0
        ? batchSelectedKeys
        : editableBatchStudentsWithKey.map((x) => x.stuKey);
    if (batchSelectedKeys.length === 0) {
      setBatchSelectedKeysByStage((prev) => ({
        ...prev,
        [activeStageNum]: targetKeys,
      }));
    }
    setDraftsByKey((prev) => {
      const next = { ...prev };
      targetKeys.forEach((stuKey) => {
        const draftKey = `${stuKey}::${activeStageNum}`;
        next[draftKey] = {
          ...(next[draftKey] || DEFAULT_DRAFT),
          bukuLaporan: 'SDH',
          aktivitasDp: 'Baik',
          aktivitasMt: 'Baik',
          aktivitasKrt: 'Baik',
        };
      });
      return next;
    });
    ToastManager.getInstance().show(
      'Checklist Massal Diterapkan',
      'success',
      `${targetKeys.length} siswa diisi Buku Laporan: Sudah Dikerjakan & Sikap: Baik.`
    );
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

  const buildEditConfirmPayload = (
    stageNum: number,
    targetStu?: any,
    targetStuKey?: string
  ): PendingStageEditConfirm => {
    const resolvedStu = targetStu || activeStudent;
    const resolvedKey = targetStuKey || activeStudentKey;
    const lockKey = getStageEditLockKey(stageNum, resolvedKey);
    const savedDate =
      stageNum === 1
        ? dudiStudents.find((s) => s.stageLogs?.[1]?.tanggal)?.stageLogs?.[1]?.tanggal
        : resolvedStu?.stageLogs?.[stageNum]?.tanggal;
    return {
      mode: stageNum === 1 ? 'delivery' : 'stage',
      stageNum,
      stageLabel: getStageValueByNumber(stageNum),
      targetName:
        stageNum === 1
          ? `${dudiStudents.length} Siswa · ${selectedDudi?.nama || 'DUDI'}`
          : resolvedStu?.nama || 'Siswa',
      lockKey,
      studentKey: stageNum === 1 ? undefined : resolvedKey,
      savedDate,
    };
  };

  const setStudentStage = (stageNum: number) => {
    if (!dudiStagePolicy.enabledStages.includes(stageNum)) {
      reportValidationError(
        `${getStageValueByNumber(stageNum)} tidak termasuk tahapan aktif untuk siswa di DUDI ini.`
      );
      return;
    }

    const isGlobalUnlocked = dudiStagePolicy.unlockedStages.includes(stageNum);
    const isLetterIssued =
      stageControl.requireIssuedLetter === false || issuedStages.includes(stageNum);
    const anyStudentCompleted =
      stageNum === 1
        ? isStage1Completed
        : dudiStudents.some(
            (stu) => Array.isArray(stu.completedStages) && stu.completedStages.includes(stageNum)
          );

    if (!isGlobalUnlocked && !anyStudentCompleted) {
      reportValidationError(
        stageControl.lockedReason
          ? `Tahap ${stageNum} sedang dikunci oleh SuperAdmin (${stageControl.lockedReason}).`
          : `Tahap ${stageNum} sedang dikunci sementara oleh SuperAdmin.`
      );
      return;
    }

    if (!isLetterIssued && !anyStudentCompleted) {
      reportValidationError(
        `Surat ${getStageValueByNumber(stageNum)} untuk DUDI "${selectedDudi?.nama || 'ini'}" belum diterbitkan Admin Hubin di Pusat Dokumen.`
      );
      return;
    }

    if (stageNum > 1 && stageControl.requireSequential && !anyStudentCompleted) {
      const anyEligible = dudiStudents.some((stu, idx) =>
        isStudentEditableAtStage(stu, getStudentKey(stu, idx), stageNum)
      );
      if (!anyEligible) {
        const prevSt = getPreviousEnabledStage(dudiStagePolicy.enabledStages, stageNum);
        const prevLabel = prevSt !== null ? getStageValueByNumber(prevSt) : `Tahap ${stageNum - 1}`;
        reportValidationError(
          `Tahap ${stageNum} masih terkunci. Harap isi dan simpan ${prevLabel} terlebih dahulu.`
        );
        return;
      }
    }

    if (stageNum === 1 && isGlobalUnlocked && isLetterIssued && isStage1Completed && !isDeliveryEditUnlocked) {
      setFormError('');
      setPendingEditConfirm(buildEditConfirmPayload(1));
      return;
    }

    setFormError('');
    setSelectedDudiStage(stageNum);
  };

  const requestUnlockCurrentStageEdit = () => {
    if (!isCompletedReadOnly) return;
    setFormError('');
    setPendingEditConfirm(buildEditConfirmPayload(activeStageNum));
  };

  const requestUnlockStudentStageEdit = (stu: any, idx: number) => {
    const stuKey = getStudentKey(stu, idx);
    if (!stuKey) return;
    setFormError('');
    setPendingEditConfirm(buildEditConfirmPayload(activeStageNum, stu, stuKey));
  };

  const confirmStageViewReadOnly = () => {
    if (!pendingEditConfirm) {
      setPendingEditConfirm(null);
      return;
    }
    const targetStage = pendingEditConfirm.stageNum;
    setPendingEditConfirm(null);
    setFormError('');
    setSelectedDudiStage(targetStage);
  };

  const confirmStageEditUnlock = () => {
    if (!pendingEditConfirm) {
      setPendingEditConfirm(null);
      return;
    }
    const { stageNum: targetStage, lockKey, studentKey: unlockedStuKey } = pendingEditConfirm;
    if (lockKey) {
      setEditUnlockedKeys((prev) => ({ ...prev, [lockKey]: true }));
    }
    if (targetStage >= 2 && unlockedStuKey) {
      setBatchSelectedKeysByStage((prev) => {
        const curr = prev[targetStage] || [];
        if (curr.includes(unlockedStuKey)) return prev;
        return {
          ...prev,
          [targetStage]: [...curr, unlockedStuKey],
        };
      });
    }
    setPendingEditConfirm(null);
    setFormError('');
    setSelectedDudiStage(targetStage);
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

  const predikatEditNilai = useMemo(
    () => getPredikatFromScore(rataRataEditNilai),
    [rataRataEditNilai]
  );

  const startEditGradeFor = (stu: any, stuKey: string) => {
    if (!stu || !stuKey || !isStudentEditableAtStage(stu, stuKey, activeStageNum)) return;
    const g = stu.submittedGradeSummary;
    const fallbackAvg = Number(g?.rataRata ?? 0) || 0;
    setGradeEditDrafts((prev) => ({
      ...prev,
      [stuKey]: {
        nilaiK3lh: Number(g?.k3lh ?? fallbackAvg) || 0,
        nilaiSoftskill: Number(g?.softskill ?? fallbackAvg) || 0,
        nilaiKompetensiTeknis: Number(g?.teknis ?? fallbackAvg) || 0,
        nilaiAlurBisnis: Number(g?.alurBisnis ?? fallbackAvg) || 0,
      },
    }));
    setEditingGradeByStudent((prev) => ({ ...prev, [stuKey]: true }));
    setFormError('');
  };

  const startEditGrade = () => {
    if (activeStudent && activeStudentKey) {
      startEditGradeFor(activeStudent, activeStudentKey);
    }
  };

  const cancelEditGradeFor = (stuKey: string) => {
    if (!stuKey) return;
    setEditingGradeByStudent((prev) => ({ ...prev, [stuKey]: false }));
    setFormError('');
  };

  const cancelEditGrade = () => {
    cancelEditGradeFor(activeStudentKey);
  };

  const updateGradeEditDraftFor = (
    stuKey: string,
    base: GradeScoresDraft,
    patch: Partial<GradeScoresDraft>
  ) => {
    if (!stuKey) return;
    setFormError('');
    setGradeEditDrafts((prev) => ({
      ...prev,
      [stuKey]: {
        ...(prev[stuKey] || base),
        ...patch,
      },
    }));
  };

  const updateGradeEditDraft = (patch: Partial<GradeScoresDraft>) => {
    updateGradeEditDraftFor(activeStudentKey, activeGradeEditDraft, patch);
  };

  const handleSaveEditedGradesFor = async (stu: any, idx: number, stuKey: string) => {
    if (!stu || !stuKey || !selectedDudi || !isStudentEditableAtStage(stu, stuKey, activeStageNum)) return;
    const g = stu.submittedGradeSummary;
    const draftScores = gradeEditDrafts[stuKey] || {
      nilaiK3lh: Number(g?.k3lh ?? 0) || 0,
      nilaiSoftskill: Number(g?.softskill ?? 0) || 0,
      nilaiKompetensiTeknis: Number(g?.teknis ?? 0) || 0,
      nilaiAlurBisnis: Number(g?.alurBisnis ?? 0) || 0,
    };
    const scores = [
      draftScores.nilaiK3lh,
      draftScores.nilaiSoftskill,
      draftScores.nilaiKompetensiTeknis,
      draftScores.nilaiAlurBisnis,
    ];
    if (scores.some((s) => !Number.isFinite(s) || s < 1 || s > 100)) {
      reportValidationError(
        `Keempat kategori nilai PKL (${stu.nama}) wajib diisi antara 1 – 100.`
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
        monitoring_id: stu.submittedGradeSummary?.monitoringId,
        id_penempatan: stu.idPenempatan || stu.id,
        nis: stu.nis,
        nama_siswa: stu.nama,
        kelas: stu.kelas || '-',
        jurusan: stu.jurusan || '',
        dudi_id: selectedDudi.id || '',
        nama_dudi: selectedDudi.nama,
        alamat_dudi: selectedDudi.alamat || '',
        guru_id: selectedPetugasId || '',
        guru_pembimbing: selectedPetugasNama,
        tahap_monitoring: stu.submittedGradeSummary?.tahapDiinput || stageLabel,
        tanggal: getTodayWibIsoDate(),
        nilai_k3lh: draftScores.nilaiK3lh,
        nilai_softskill: draftScores.nilaiSoftskill,
        nilai_kompetensi_teknis: draftScores.nilaiKompetensiTeknis,
        nilai_alur_bisnis: draftScores.nilaiAlurBisnis,
      });

      if (res.success) {
        setDudiStudents((prev) =>
          prev.map((s, sIdx) =>
            sIdx === idx
              ? {
                  ...s,
                  hasSubmittedGrades: true,
                  submittedGradeSummary: res.gradeSummary,
                }
              : s
          )
        );
        setEditingGradeByStudent((prev) => ({ ...prev, [stuKey]: false }));
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

  const handleSaveEditedGrades = async () => {
    if (activeStudent && activeStudentKey) {
      await handleSaveEditedGradesFor(activeStudent, selectedStudentIndex, activeStudentKey);
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

  const handleSaveBatchSupervision = async () => {
    if (!selectedDudi) return;
    setFormError('');

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

    // Validate Blok 1 (1x Per DUDI)
    const filledKompetensi = activeWorkshopDraft.kompetensiList
      .map((k) => k.trim())
      .filter(Boolean);
    if (filledKompetensi.length < 2) {
      reportValidationError(
        'Harap isikan minimal 2 baris Kompetensi yang didapat pada Blok 1 (Bengkel DUDI).'
      );
      return;
    }

    const kb = activeWorkshopDraft.kondisiBengkel;
    if (!kb.volumePekerjaan || !kb.relevansiPekerjaan || !kb.kenyamanan || !kb.kelayakan) {
      reportValidationError(
        'Harap lengkapi seluruh pilihan Kondisi & Kelayakan Bengkel pada Blok 1.'
      );
      return;
    }

    // Collect selected editable students for Blok 2
    const selectedBatchItems = editableBatchStudentsWithKey.filter(({ stuKey }) =>
      batchSelectedKeys.includes(stuKey)
    );
    if (selectedBatchItems.length === 0) {
      reportValidationError(
        'Pilih minimal 1 siswa pada Blok 2 yang akan disimpan untuk tahap monitoring ini.'
      );
      return;
    }

    const stageLabel = getStageValueByNumber(activeStageNum);
    const requireStudentSignature = stageControl.requireStudentSignature === true;

    for (const { stu, stuKey } of selectedBatchItems) {
      const stuDraft: StudentStageDraft =
        draftsByKey[`${stuKey}::${activeStageNum}`] || DEFAULT_DRAFT;
      const stuPol: ResolvedMonitoringStagePolicy =
        stu.stagePolicy || resolveMonitoringStagePolicy(stageControl, stu.jurusan);

      if (
        requireStudentSignature &&
        (!stuDraft.ttdSiswa || !stuDraft.ttdSiswa.startsWith('svgpath:'))
      ) {
        reportValidationError(
          `Tanda Tangan Siswa (${stu.nama}) wajib diisi sebelum menyimpan.`
        );
        return;
      }

      if (!stuDraft.bukuLaporan) {
        reportValidationError(
          `Harap pilih Ceklist Buku Laporan (Belum Selesai, Sudah Dikerjakan, atau Tidak Mengerjakan) untuk ${stu.nama}.`
        );
        return;
      }

      if (!stuDraft.aktivitasDp || !stuDraft.aktivitasMt || !stuDraft.aktivitasKrt) {
        reportValidationError(
          `Harap lengkapi Ceklist Aktivitas & Sikap (Kedisiplinan, Motivasi, dan Kreativitas) untuk ${stu.nama}.`
        );
        return;
      }

      const stuHasGrade = Boolean(stu.hasSubmittedGrades);
      const stuCanGrade = !stuHasGrade && activeStageNum >= stuPol.gradeStage;
      if (
        activeStageNum === stuPol.gradeStage &&
        !stuHasGrade &&
        stuDraft.nilaiPklMuncul === null
      ) {
        reportValidationError(
          `Pada ${stageLabel}, silakan pilih apakah nilai PKL untuk ${stu.nama} sudah muncul ("Ya, Sudah Muncul" atau "Belum Muncul").`
        );
        return;
      }

      if (stuCanGrade && stuDraft.nilaiPklMuncul === true) {
        const scores = [
          stuDraft.nilaiK3lh,
          stuDraft.nilaiSoftskill,
          stuDraft.nilaiKompetensiTeknis,
          stuDraft.nilaiAlurBisnis,
        ];
        if (scores.some((s) => !Number.isFinite(s) || s < 1 || s > 100)) {
          reportValidationError(
            `Keempat kategori nilai PKL (1 – 100) untuk ${stu.nama} wajib diisi lengkap.`
          );
          return;
        }
      }
    }

    if (!isOnline) {
      reportValidationError(
        'Koneksi internet terputus. Data monitoring belum tersimpan di server. Hubungkan internet lalu tekan Simpan lagi.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const shouldSendDudiContact = showDudiContactEditor;
      const hariKerjaStr = formatRangePair(dudiHariMulai, dudiHariSelesai);
      const jamKerjaStr = formatRangePair(dudiJamMulai, dudiJamSelesai);
      const todayWib = getTodayWibIsoDate();

      const studentPayloads = selectedBatchItems.map(({ stu, stuKey }) => {
        const stuDraft: StudentStageDraft =
          draftsByKey[`${stuKey}::${activeStageNum}`] || DEFAULT_DRAFT;
        const stuPol: ResolvedMonitoringStagePolicy =
          stu.stagePolicy || resolveMonitoringStagePolicy(stageControl, stu.jurusan);
        const shouldSubmitGrades =
          !stu.hasSubmittedGrades &&
          activeStageNum >= stuPol.gradeStage &&
          stuDraft.nilaiPklMuncul === true;
        const avg = shouldSubmitGrades
          ? calculateEqualWeightedAverage(
              stuDraft.nilaiK3lh,
              stuDraft.nilaiSoftskill,
              stuDraft.nilaiKompetensiTeknis,
              stuDraft.nilaiAlurBisnis
            )
          : 0;
        const existingStageLog = stu.stageLogs?.[activeStageNum];

        return {
          existing_monitoring_id: existingStageLog?.monitoringId,
          id_penempatan: stu.idPenempatan || stu.id,
          nis: stu.nis,
          nama_siswa: stu.nama,
          kelas: stu.kelas || '-',
          jurusan: stu.jurusan || '',
          sakit: stuDraft.sakit,
          izin: stuDraft.izin,
          alpha: stuDraft.alpha,
          buku_laporan: stuDraft.bukuLaporan,
          aktivitas_dp: stuDraft.aktivitasDp,
          aktivitas_mt: stuDraft.aktivitasMt,
          aktivitas_krt: stuDraft.aktivitasKrt,
          ttd_siswa: stuDraft.ttdSiswa,
          nilai_pkl_muncul: shouldSubmitGrades,
          nilai_k3lh: shouldSubmitGrades ? stuDraft.nilaiK3lh : undefined,
          nilai_softskill: shouldSubmitGrades ? stuDraft.nilaiSoftskill : undefined,
          nilai_kompetensi_teknis: shouldSubmitGrades ? stuDraft.nilaiKompetensiTeknis : undefined,
          nilai_alur_bisnis: shouldSubmitGrades ? stuDraft.nilaiAlurBisnis : undefined,
          nilai_rata_rata: shouldSubmitGrades ? avg : undefined,
          predikat: shouldSubmitGrades ? getPredikatFromScore(avg) : undefined,
          catatan_perkembangan: stuDraft.catatanPerkembangan,
        };
      });

      const res = await PublicPortalClient.submitMonitoringBatch({
        dudi_id: selectedDudi.id || '',
        nama_dudi: selectedDudi.nama,
        alamat_dudi: selectedDudi.alamat || '',
        guru_id: selectedPetugasId || '',
        guru_pembimbing: selectedPetugasNama,
        tahap_monitoring: stageLabel,
        tanggal: todayWib,
        kompetensi_siswa: filledKompetensi,
        kondisi_bengkel: activeWorkshopDraft.kondisiBengkel,
        ...(shouldSendDudiContact
          ? {
              dudi_contact_submitted: true,
              nama_pemimpin: dudiPemimpin.trim(),
              nama_pic: dudiPic.trim(),
              no_telp_dudi: dudiTelp.trim(),
              ...(hariKerjaStr ? { hari_kerja: hariKerjaStr } : {}),
              ...(jamKerjaStr ? { jam_kerja: jamKerjaStr } : {}),
            }
          : {}),
        students: studentPayloads,
      });

      if (res.success && res.verifiedInSpreadsheet !== false) {
        if (res.dudiContact) {
          const updatedContact = {
            namaPemimpin: res.dudiContact.namaPemimpin || dudiPemimpin.trim(),
            pic: res.dudiContact.pic || dudiPic.trim() || '-',
            kontak: res.dudiContact.kontak || dudiTelp.trim() || '-',
            ...(res.dudiContact.hariKerja || hariKerjaStr
              ? { hariKerja: res.dudiContact.hariKerja || hariKerjaStr }
              : {}),
            ...(res.dudiContact.jamKerja || jamKerjaStr
              ? { jamKerja: res.dudiContact.jamKerja || jamKerjaStr }
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

        const savedKeySet = new Set(selectedBatchItems.map((x) => x.stuKey));
        const resByNis = new Map((res.results || []).map((r) => [r.nis, r]));
        const lockKeysToClear: string[] = [];

        setDudiStudents((prev) =>
          prev.map((stu, idx) => {
            const stuKey = getStudentKey(stu, idx);
            if (!savedKeySet.has(stuKey)) return stu;
            const stuDraft: StudentStageDraft =
              draftsByKey[`${stuKey}::${activeStageNum}`] || DEFAULT_DRAFT;
            const matchedRes = resByNis.get(stu.nis);
            const savedMonId =
              matchedRes?.idMonitoring ||
              stu.stageLogs?.[activeStageNum]?.monitoringId ||
              `MON-${Date.now()}-${idx}`;

            const lockK = getStageEditLockKey(activeStageNum, stuKey);
            if (lockK) lockKeysToClear.push(lockK);

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
                sakit: stuDraft.sakit,
                izin: stuDraft.izin,
                alpha: stuDraft.alpha,
                bukuLaporan: stuDraft.bukuLaporan,
                aktivitasDp: stuDraft.aktivitasDp,
                aktivitasMt: stuDraft.aktivitasMt,
                aktivitasKrt: stuDraft.aktivitasKrt,
                kompetensiList: filledKompetensi,
                kondisiBengkel: { ...activeWorkshopDraft.kondisiBengkel },
                ttdSiswa: stuDraft.ttdSiswa,
                catatan: stuDraft.catatanPerkembangan,
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

            const hasGradeInRes = Boolean(matchedRes?.gradeSummary);

            return {
              ...stu,
              completedStages: nextCompleted,
              recommendedStage: nextRec,
              hasSubmittedGrades: stu.hasSubmittedGrades || hasGradeInRes,
              submittedGradeSummary: matchedRes?.gradeSummary || stu.submittedGradeSummary,
              stageLogs: nextStageLogs,
            };
          })
        );

        if (lockKeysToClear.length > 0) {
          setEditUnlockedKeys((prev) => {
            const next = { ...prev };
            let changed = false;
            lockKeysToClear.forEach((lk) => {
              if (next[lk]) {
                delete next[lk];
                changed = true;
              }
            });
            return changed ? next : prev;
          });
        }

        // Uncheck newly saved students from current stage selection
        setBatchSelectedKeysByStage((prev) => ({
          ...prev,
          [activeStageNum]: (prev[activeStageNum] || []).filter((k) => !savedKeySet.has(k)),
        }));

        if (onSuccess) onSuccess();

        const nextStageCandidate = dudiStagePolicy.enabledStages.find((n) => n > activeStageNum);
        const canContinueNextStage =
          nextStageCandidate !== undefined &&
          dudiStagePolicy.unlockedStages.includes(nextStageCandidate) &&
          (stageControl.requireIssuedLetter === false || issuedStages.includes(nextStageCandidate));

        setSaveReceipt({
          idMonitoring: res.results?.[0]?.idMonitoring || `MON-${Date.now()}`,
          studentName:
            selectedBatchItems.length === 1
              ? selectedBatchItems[0].stu.nama
              : `${selectedBatchItems.length} Siswa (${selectedDudi.nama})`,
          studentNis: selectedBatchItems[0]?.stu?.nis || '-',
          dudiName: selectedDudi.nama,
          stageNum: activeStageNum,
          stageLabel,
          sakit: studentPayloads[0]?.sakit ?? 0,
          izin: studentPayloads[0]?.izin ?? 0,
          alpha: studentPayloads[0]?.alpha ?? 0,
          bukuLaporan: studentPayloads[0]?.buku_laporan || '',
          ttdSigned: requireStudentSignature,
          isMonitoringBatch: true,
          savedStudents: (res.results || []).map((r) => ({
            nama: r.namaSiswa,
            nis: r.nis,
            sakit: r.sakit,
            izin: r.izin,
            alpha: r.alpha,
            bukuLaporan: r.bukuLaporan,
            gradeAvg: r.gradeAvg,
            gradePredikat: r.gradePredikat,
          })),
          verifiedInSpreadsheet: true,
          sheetRowNumber: res.sheetRowNumber,
          savedAt: res.savedAt || new Date().toISOString(),
          nextStageNum: canContinueNextStage ? nextStageCandidate : undefined,
          nextStudentName: canContinueNextStage
            ? `Lanjut ke ${getStageValueByNumber(nextStageCandidate!)}`
            : undefined,
        });
      } else {
        reportValidationError(res.message || 'Gagal menyimpan data batch ke Cloud Server.');
      }
    } catch (e: any) {
      reportValidationError(e?.message || 'Periksa koneksi internet dan layanan Cloud Server.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveSupervision = async () => {
    if (!selectedDudi) return;
    if (activeStageNum === 1) {
      await handleSaveDeliveryValidation();
      return;
    }
    await handleSaveBatchSupervision();
  };

  const handleContinueAfterSave = (
    action: 'next' | 'stay' | 'close',
    closePortal?: () => void
  ) => {
    const nextIdx = saveReceipt?.nextStudentIndex;
    const nextStageNum = saveReceipt?.nextStageNum;
    const isDeliveryBatch = Boolean(saveReceipt?.isDeliveryBatch);
    const isMonitoringBatch = Boolean(saveReceipt?.isMonitoringBatch);
    setSaveReceipt(null);
    if (action === 'next') {
      if (isDeliveryBatch) {
        const nextStage = dudiStagePolicy.enabledStages.find((n: number) => n > 1) ?? 2;
        setSelectedDudiStage(nextStage);
        setSelectedStudentIndex(0);
        setFormError('');
      } else if (isMonitoringBatch && nextStageNum !== undefined) {
        setSelectedDudiStage(nextStageNum);
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

  useEffect(() => {
    if (!isPinVerified || !selectedDudi || !selectedPetugasId || loadingStudents) return;
    const timer = window.setTimeout(() => {
      const draftKey = buildDraftSessionKey(selectedPetugasId, selectedDudi);
      const completedKeySet = new Set<string>();
      dudiStudents.forEach((stu: any, idx: number) => {
        const sKey = getStudentKey(stu, idx);
        const compList = Array.isArray(stu.completedStages) ? stu.completedStages : [];
        compList.forEach((stNum: number) => completedKeySet.add(`${sKey}::${stNum}`));
      });

      const dirtyDrafts: Record<string, StudentStageDraft> = {};
      Object.entries(draftsByKey).forEach(([k, val]) => {
        if (!completedKeySet.has(k) && hasUnsavedStudentDraftContent(val)) {
          dirtyDrafts[k] = val;
        }
      });

      const dirtyWorkshops: Record<number, WorkshopStageDraft> = {};
      Object.entries(workshopDraftsByStage).forEach(([stStr, wVal]) => {
        if (hasFilledWorkshopData(wVal)) {
          dirtyWorkshops[Number(stStr)] = wVal;
        }
      });

      writePortalSessionJson(draftKey, {
        timestamp: Date.now(),
        draftsByKey: dirtyDrafts,
        workshopDraftsByStage: dirtyWorkshops,
        batchSelectedKeysByStage,
        deliveryTtdByKey,
        deliveryCatatan,
        deliveryContactConfirmed,
        deliverySelectedKeys,
      } satisfies StoredDudiDraftCache);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [
    isPinVerified,
    selectedDudi,
    selectedPetugasId,
    loadingStudents,
    dudiStudents,
    draftsByKey,
    workshopDraftsByStage,
    batchSelectedKeysByStage,
    deliveryTtdByKey,
    deliveryCatatan,
    deliveryContactConfirmed,
    deliverySelectedKeys,
  ]);

  const handlePetugasLogout = () => {
    removePortalSessionKey(PETUGAS_CACHE_KEY);
    removePortalSessionKey(PETUGAS_DUDI_CACHE_KEY);
    clearAllPortalDraftSessionKeys();
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
    setSelectedDudiStage(null);
    setStageByStudent({});
    setDraftsByKey({});
    setBatchSelectedKeysByStage({});
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
    selectedPetugasNip,
    setSelectedPetugasNip,
    draftsByKey,
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
    dudiStagePolicy,
    activeStageNum,
    isStageReadOnly,
    isCompletedReadOnly,
    isStageLetterIssued,
    isStageCompleted,
    pendingEditConfirm,
    editUnlockedKeys,
    batchSelectedKeys,
    editingGradeByStudent,
    gradeEditDrafts,
    requestUnlockCurrentStageEdit,
    requestUnlockStudentStageEdit,
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
    updateStudentDraftFor,
    updateActiveWorkshopDraft,
    copyWorkshopFromPrevStage,
    markAllBengkelBaik,
    applyStandardStudentChecklist,
    applyStandardStudentChecklistFor,
    toggleBatchStudentKey,
    selectAllPendingBatchStudents,
    clearBatchStudentSelection,
    applyBatchStandardDefaults,
    setStudentStage,
    startEditGrade,
    startEditGradeFor,
    cancelEditGrade,
    cancelEditGradeFor,
    updateGradeEditDraft,
    updateGradeEditDraftFor,
    handleSaveEditedGrades,
    handleSaveEditedGradesFor,
    handleSaveSupervision,
    handleContinueAfterSave,
    handleAcknowledgeComplianceNotice,
    handlePetugasLogout,
  };
}
