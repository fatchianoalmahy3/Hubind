import type { FormEvent } from 'react';
import { useState, useEffect, useMemo, useRef } from 'react';
import { ToastManager } from '../../core/ToastManager';
import { PublicPortalClient } from '../../core/PublicPortalClient';
import { useUnloadGuard } from '../../hooks/useUnloadGuard';
import {
  DEFAULT_MONITORING_STAGE_CONTROL,
  type MonitoringStageControl,
} from '../../core/types/schema';
import {
  calculateEqualWeightedAverage,
  EMPTY_KONDISI_BENGKEL,
  formatRangePair,
  getPredikatFromScore,
  getStageValueByNumber,
  parseRangePair,
  pickRecommendedStageForControl,
} from '../../core/utils/monitoringHelpers';
import { getTodayWibIsoDate } from '../../core/utils/dateHelpers';
import {
  DEFAULT_DRAFT,
  getStudentKey,
  isDudiContactIncomplete,
  type GradeScoresDraft,
  type MonitoringSaveReceipt,
  type StudentStageDraft,
} from './types';

const NOTICE_ACK_KEY = 'hubin_petugas_notice_ack';
const MONITORING_DRAFTS_KEY = 'hubin_monitoring_drafts_v1';

function readStoredMonitoringDrafts(): Record<string, StudentStageDraft> {
  try {
    const raw = localStorage.getItem(MONITORING_DRAFTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStoredMonitoringDraft(fullKey: string, draft: StudentStageDraft): void {
  try {
    const all = readStoredMonitoringDrafts();
    all[fullKey] = draft;
    const keys = Object.keys(all);
    if (keys.length > 35) {
      delete all[keys[0]];
    }
    localStorage.setItem(MONITORING_DRAFTS_KEY, JSON.stringify(all));
  } catch {
    // Ignore storage quota issues
  }
}

function removeStoredMonitoringDraft(fullKey: string): void {
  try {
    const all = readStoredMonitoringDrafts();
    if (fullKey in all) {
      delete all[fullKey];
      localStorage.setItem(MONITORING_DRAFTS_KEY, JSON.stringify(all));
    }
  } catch {
    // ignore
  }
}

export function useTeacherMonitoring(isOpen: boolean, onSuccess?: () => void) {
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

  // Step 2: Assigned DUDIs from Google Spreadsheet
  const [assignedDudiList, setAssignedDudiList] = useState<any[]>([]);
  const [loadingDudi, setLoadingDudi] = useState(false);
  const [dudiError, setDudiError] = useState('');
  const [selectedDudi, setSelectedDudi] = useState<any>(null);

  // Step 3: Students placed in selected DUDI + Isolated Per-Student State
  const [dudiStudents, setDudiStudents] = useState<any[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentsError, setStudentsError] = useState('');
  const [selectedStudentIndex, setSelectedStudentIndex] = useState(0);

  // Isolated per-student stage & per-(student, stage) drafts
  const [stageByStudent, setStageByStudent] = useState<Record<string, number>>({});
  const [draftsByKey, setDraftsByKey] = useState<Record<string, StudentStageDraft>>({});
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

  // Global SuperAdmin stage lock & transition policy
  const [stageControl, setStageControl] = useState<MonitoringStageControl>(
    DEFAULT_MONITORING_STAGE_CONTROL
  );

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
          void PublicPortalClient.getDudiStudents(dudi.nama, dudi.id || '', teacherName).catch(
            () => {}
          );
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
      setDudiPopupOpen(false);
      setSaveReceipt(null);
      void loadPetugasList();
      PublicPortalClient.getMonitoringStageConfig(true)
        .then((cfg) => setStageControl(cfg))
        .catch(() => {});

      try {
        const cached = sessionStorage.getItem('hubin_petugas_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed.petugasId && parsed.nama) {
            setSelectedPetugasId(parsed.petugasId);
            setSelectedPetugasNama(parsed.nama);
            setSelectedPetugasNip(parsed.nip || '');
            setIsPinVerified(true);
            setCurrentStep(2);
            if (sessionStorage.getItem(NOTICE_ACK_KEY) !== '1') {
              setShowComplianceNotice(true);
            }
            void loadAssignedDudi(parsed.nama, parsed.petugasId);
          }
        }
      } catch {
        // ignore
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
      'Memverifikasi PIN Petugas...',
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
        sessionStorage.setItem(
          'hubin_petugas_cache',
          JSON.stringify({
            petugasId: verified.id,
            nama: verified.nama,
            nip: verified.nip || selectedPetugasNip,
            token: json.sessionToken,
            timestamp: Date.now(),
          })
        );

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
        const errMsg = json.message || 'PIN Petugas tidak valid.';
        setPinError(errMsg);
        ToastManager.getInstance().update(toastId, 'Verifikasi PIN Gagal', 'error', errMsg);
      }
    } catch (e: any) {
      const errMsg = e?.message || 'Gagal memverifikasi PIN. Periksa koneksi Anda.';
      setPinError(errMsg);
      ToastManager.getInstance().update(toastId, 'Verifikasi PIN Gagal', 'error', errMsg);
    } finally {
      setVerifyingPin(false);
    }
  };

  const handleSelectDudi = async (dudi: any) => {
    const dudiKey = `${dudi.id || ''}::${dudi.nama || ''}::${selectedPetugasNama}`;
    activeDudiKeyRef.current = dudiKey;

    const initPemimpin = dudi.namaPemimpin && dudi.namaPemimpin !== '-' ? dudi.namaPemimpin : '';
    const initPic = dudi.pic && dudi.pic !== '-' ? dudi.pic : '';
    const initTelp = dudi.kontak && dudi.kontak !== '-' ? dudi.kontak : '';
    const initHariRange = parseRangePair(dudi.hariKerja, '', '');
    const initJamRange = parseRangePair(dudi.jamKerja, '', '');

    setSelectedDudi(dudi);
    setDudiPemimpin(initPemimpin);
    setDudiPic(initPic);
    setDudiTelp(initTelp);
    setDudiHariMulai(initHariRange.start);
    setDudiHariSelesai(initHariRange.end);
    setDudiJamMulai(initJamRange.start);
    setDudiJamSelesai(initJamRange.end);
    setShowDudiContactEditor(false);
    setSaveReceipt(null);
    setCurrentStep(3);
    setLoadingStudents(true);
    setStudentsError('');
    setFormError('');
    setDudiStudents([]);
    setSelectedStudentIndex(0);
    setStageByStudent({});
    setDraftsByKey({});
    setEditingGradeByStudent({});
    setGradeEditDrafts({});

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
      controlOverride?: MonitoringStageControl
    ) => {
      const effectiveControl = controlOverride || latestStageControl;
      const initStages: Record<string, number> = {};
      const initDrafts: Record<string, StudentStageDraft> = {};
      const storedDrafts = readStoredMonitoringDrafts();

      students.forEach((stu: any, idx: number) => {
        const stuKey = getStudentKey(stu, idx);
        const recStage = pickRecommendedStageForControl(
          Array.isArray(stu.completedStages) ? stu.completedStages : [],
          effectiveControl
        );
        initStages[stuKey] = recStage;

        if (stu.stageLogs && typeof stu.stageLogs === 'object') {
          Object.entries(stu.stageLogs).forEach(([stageStr, log]: [string, any]) => {
            const draftKey = `${stuKey}::${stageStr}`;
            const rawComp: string[] = Array.isArray(log?.kompetensiList) ? log.kompetensiList : [];
            const paddedComp =
              rawComp.length >= 2
                ? [...rawComp]
                : [...rawComp, ...Array(2 - rawComp.length).fill('')];
            initDrafts[draftKey] = {
              ...DEFAULT_DRAFT,
              sakit: Number(log?.sakit ?? 0) || 0,
              izin: Number(log?.izin ?? 0) || 0,
              alpha: Number(log?.alpha ?? 0) || 0,
              bukuLaporan: log?.bukuLaporan || '',
              aktivitasDp: log?.aktivitasDp || '',
              aktivitasMt: log?.aktivitasMt || '',
              aktivitasKrt: log?.aktivitasKrt || '',
              kompetensiList: paddedComp,
              kondisiBengkel: log?.kondisiBengkel
                ? { ...EMPTY_KONDISI_BENGKEL, ...log.kondisiBengkel }
                : { ...EMPTY_KONDISI_BENGKEL },
              ttdSiswa: String(log?.ttdSiswa || ''),
              catatanPerkembangan: String(log?.catatan || ''),
            };
          });
        }

        for (let stNum = 1; stNum <= 8; stNum += 1) {
          const draftKey = `${stuKey}::${stNum}`;
          const storageKey = `${dudiKey}::${draftKey}`;
          const localSaved = storedDrafts[storageKey];
          if (localSaved && !initDrafts[draftKey]) {
            initDrafts[draftKey] = {
              ...DEFAULT_DRAFT,
              ...localSaved,
              kondisiBengkel: localSaved.kondisiBengkel
                ? { ...EMPTY_KONDISI_BENGKEL, ...localSaved.kondisiBengkel }
                : { ...EMPTY_KONDISI_BENGKEL },
              kompetensiList:
                Array.isArray(localSaved.kompetensiList) && localSaved.kompetensiList.length >= 2
                  ? localSaved.kompetensiList
                  : ['', ''],
            };
          }
        }
      });

      if (isBackgroundRefresh) {
        setStageByStudent((prev) => ({ ...initStages, ...prev }));
        setDraftsByKey((prev) => ({ ...initDrafts, ...prev }));
      } else {
        setStageByStudent(initStages);
        setDraftsByKey(initDrafts);
      }
      setDudiStudents(students);
    };

    try {
      const json: any = await PublicPortalClient.getDudiStudents(
        dudi.nama,
        dudi.id || '',
        selectedPetugasNama,
        {
          onUpdate: (freshJson: any) => {
            if (activeDudiKeyRef.current !== dudiKey) return;
            if (freshJson?.stageControl) {
              latestStageControl = freshJson.stageControl;
              setStageControl(freshJson.stageControl);
            }
            if (freshJson?.success && Array.isArray(freshJson.data)) {
              applyStudentsPayload(freshJson.data, true, freshJson?.stageControl);
            }
          },
        }
      );
      if (activeDudiKeyRef.current !== dudiKey) return;
      if (json?.stageControl) {
        latestStageControl = json.stageControl;
        setStageControl(json.stageControl);
      }
      if (!json.success) {
        const errMsg = 'Gagal memuat daftar siswa dari Cloud Server.';
        setStudentsError(errMsg);
        ToastManager.getInstance().show('Gagal Memuat Daftar Siswa', 'error', errMsg);
        return;
      }

      const students = Array.isArray(json.data) ? json.data : [];
      applyStudentsPayload(students, false, json?.stageControl);
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
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setPopupError(err?.message || 'Gagal menyimpan data kontak DUDI ke Cloud Server.');
    } finally {
      setSavingPopupContact(false);
    }
  };

  const activeStudent = dudiStudents[selectedStudentIndex] || null;
  const activeStudentKey = activeStudent ? getStudentKey(activeStudent, selectedStudentIndex) : '';
  const activeStageNum = activeStudent
    ? stageByStudent[activeStudentKey] ||
      pickRecommendedStageForControl(
        Array.isArray(activeStudent.completedStages) ? activeStudent.completedStages : [],
        stageControl
      )
    : 1;
  const isStageGlobalUnlocked = stageControl.unlockedStages.includes(activeStageNum);
  const isStageCompleted = Boolean(
    activeStudent && (activeStudent.completedStages || []).includes(activeStageNum)
  );
  const isStageReadOnly = !isStageGlobalUnlocked;

  const activeDraftKey = activeStudent ? `${activeStudentKey}::${activeStageNum}` : '';
  const activeDraft: StudentStageDraft =
    (activeDraftKey && draftsByKey[activeDraftKey]) || DEFAULT_DRAFT;

  const updateActiveDraft = (patch: Partial<StudentStageDraft>) => {
    if (!activeDraftKey || isStageReadOnly) return;
    setFormError('');
    setDraftsByKey((prev) => {
      const nextDraft: StudentStageDraft = {
        ...(prev[activeDraftKey] || DEFAULT_DRAFT),
        ...patch,
      };
      if (activeDudiKeyRef.current) {
        writeStoredMonitoringDraft(`${activeDudiKeyRef.current}::${activeDraftKey}`, nextDraft);
      }
      return {
        ...prev,
        [activeDraftKey]: nextDraft,
      };
    });
  };

  const canCopyInspectionFromPrevious = !isStageReadOnly && selectedStudentIndex > 0;

  const copyInspectionFromPreviousStudent = () => {
    if (!canCopyInspectionFromPrevious || !activeDraftKey) return;
    const prevStu = dudiStudents[selectedStudentIndex - 1];
    if (!prevStu) return;
    const prevStuKey = getStudentKey(prevStu, selectedStudentIndex - 1);
    const prevStageNum = stageByStudent[prevStuKey] || activeStageNum;
    const prevDraft = draftsByKey[`${prevStuKey}::${prevStageNum}`];
    const prevLog = prevStu.stageLogs?.[prevStageNum] || prevStu.stageLogs?.[activeStageNum];

    const sourceKomp: string[] = prevDraft?.kompetensiList?.some((k) => k.trim())
      ? prevDraft.kompetensiList
      : Array.isArray(prevLog?.kompetensiList) && prevLog.kompetensiList.length > 0
      ? prevLog.kompetensiList
      : ['', ''];
    const paddedKomp =
      sourceKomp.length >= 2 ? [...sourceKomp] : [...sourceKomp, ...Array(2 - sourceKomp.length).fill('')];

    const sourceBengkel = prevDraft?.kondisiBengkel?.volumePekerjaan
      ? { ...prevDraft.kondisiBengkel }
      : prevLog?.kondisiBengkel
      ? { ...EMPTY_KONDISI_BENGKEL, ...prevLog.kondisiBengkel }
      : { ...EMPTY_KONDISI_BENGKEL };

    updateActiveDraft({
      kompetensiList: paddedKomp,
      kondisiBengkel: sourceBengkel,
    });
  };

  const setStudentStage = (stageNum: number) => {
    if (!activeStudentKey) return;
    const isGlobalUnlocked = stageControl.unlockedStages.includes(stageNum);
    const isCompleted = (activeStudent?.completedStages || []).includes(stageNum);

    if (!isGlobalUnlocked && !isCompleted) {
      reportValidationError(
        stageControl.lockedReason
          ? `Tahap ${stageNum} sedang dikunci oleh SuperAdmin (${stageControl.lockedReason}).`
          : `Tahap ${stageNum} sedang dikunci sementara oleh SuperAdmin.`
      );
      return;
    }

    if (
      isGlobalUnlocked &&
      stageControl.requireSequential &&
      stageNum > 1 &&
      !(activeStudent?.completedStages || []).includes(stageNum - 1)
    ) {
      const prevLabel = getStageValueByNumber(stageNum - 1);
      reportValidationError(
        `Tahap ${stageNum} masih terkunci. Harap isi dan simpan ${prevLabel} terlebih dahulu.`
      );
      return;
    }
    setFormError('');
    setStageByStudent((prev) => ({
      ...prev,
      [activeStudentKey]: stageNum,
    }));
  };

  const alreadyHasGrade = Boolean(activeStudent?.hasSubmittedGrades);
  const isEditingGrade = Boolean(activeStudentKey && editingGradeByStudent[activeStudentKey]);
  const canInputGradeThisStage = !alreadyHasGrade && activeStageNum >= 5;
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

  const handleSaveSupervision = async () => {
    if (!activeStudent || !selectedDudi) return;
    setFormError('');

    if (isStageReadOnly) {
      reportValidationError(
        stageControl.lockedReason
          ? `Tahap ${activeStageNum} sedang dikunci oleh SuperAdmin (${stageControl.lockedReason}).`
          : `Tahap ${activeStageNum} sedang dikunci oleh SuperAdmin dan hanya dapat dilihat (Read-Only).`
      );
      return;
    }

    if (
      stageControl.requireSequential &&
      activeStageNum > 1 &&
      !(activeStudent.completedStages || []).includes(activeStageNum - 1)
    ) {
      const prevLabel = getStageValueByNumber(activeStageNum - 1);
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

    if (
      activeStageNum === 1 &&
      (!dudiHariMulai || !dudiHariSelesai || !dudiJamMulai || !dudiJamSelesai)
    ) {
      reportValidationError(
        'Pada Tahap 1 (Pengantaran), harap lengkapi rentang Hari Kerja (Hari Mulai s/d Hari Selesai) dan Jam Kerja (Jam Masuk s/d Jam Pulang) DUDI.'
      );
      return;
    }

    if (!activeDraft.ttdSiswa) {
      reportValidationError(
        'Tanda Tangan Siswa di bawah Absensi wajib diisi oleh siswa bersangkutan sebelum menyimpan.'
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

    const filledKompetensi = activeDraft.kompetensiList.map((k) => k.trim()).filter(Boolean);
    if (filledKompetensi.length < 2) {
      reportValidationError(
        'Harap isikan minimal 2 baris Kompetensi yang didapat siswa di tempat PKL.'
      );
      return;
    }

    const kb = activeDraft.kondisiBengkel;
    if (!kb.volumePekerjaan || !kb.relevansiPekerjaan || !kb.kenyamanan || !kb.kelayakan) {
      reportValidationError(
        'Harap lengkapi seluruh pilihan centang pada bagian Keadaan Bengkel (Volume Pekerjaan, Relevansi Pekerjaan, Kenyamanan, dan Kelayakan).'
      );
      return;
    }

    if (activeStageNum === 5 && !alreadyHasGrade && activeDraft.nilaiPklMuncul === null) {
      reportValidationError(
        'Pada Monitoring ke-4, silakan pilih terlebih dahulu apakah nilai PKL sudah muncul ("Ya, Sudah Muncul" atau "Belum Muncul").'
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
        kondisi_bengkel: activeDraft.kondisiBengkel,
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

      if (json.success) {
        if (activeDudiKeyRef.current && activeDraftKey) {
          removeStoredMonitoringDraft(`${activeDudiKeyRef.current}::${activeDraftKey}`);
        }
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
            const nextRec = pickRecommendedStageForControl(nextCompleted, stageControl);

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
              stageLogs: {
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
                  kondisiBengkel: { ...activeDraft.kondisiBengkel },
                  ttdSiswa: activeDraft.ttdSiswa,
                  catatan: activeDraft.catatanPerkembangan,
                  tanggal: payload.tanggal,
                  status: 'Terlaksana',
                },
              },
            };
          })
        );

        if (onSuccess) onSuccess();

        const hasNextStudent = selectedStudentIndex < dudiStudents.length - 1;
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
          ttdSigned: Boolean(activeDraft.ttdSiswa),
          gradeAvg: shouldSubmitGrades ? rataRataNilai : undefined,
          gradePredikat: shouldSubmitGrades ? predikatNilai : undefined,
          gradeSynced: json.gradeSynced,
          verifiedInSpreadsheet: json.verifiedInSpreadsheet !== false,
          sheetRowNumber: json.sheetRowNumber,
          savedAt: json.savedAt || new Date().toISOString(),
          nextStudentIndex: hasNextStudent ? selectedStudentIndex + 1 : undefined,
          nextStudentName: hasNextStudent ? dudiStudents[selectedStudentIndex + 1]?.nama : undefined,
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
    setSaveReceipt(null);
    if (action === 'next' && nextIdx !== undefined) {
      setSelectedStudentIndex(nextIdx);
      setFormError('');
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

  const handlePetugasLogout = () => {
    try {
      sessionStorage.removeItem('hubin_petugas_cache');
      sessionStorage.removeItem(NOTICE_ACK_KEY);
    } catch {
      // ignore
    }
    setIsPinVerified(false);
    setShowComplianceNotice(false);
    setSaveReceipt(null);
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
    setCurrentStep(1);
    setPinInput('');
    ToastManager.getInstance().show(
      'Sesi Petugas Berakhir',
      'info',
      'Silakan pilih kembali nama petugas dan verifikasi PIN untuk melanjutkan.'
    );
  };

  return {
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
    setSelectedStudentIndex,
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
    stageControl,
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
    activeStageNum,
    isStageReadOnly,
    isStageCompleted,
    activeDraft,
    alreadyHasGrade,
    isEditingGrade,
    canInputGradeThisStage,
    showGradeInputs,
    canCopyInspectionFromPrevious,
    activeGradeEditDraft,
    rataRataEditNilai,
    predikatEditNilai,
    rataRataNilai,
    predikatNilai,
    loadPetugasList,
    handleVerifyPin,
    handleSelectDudi,
    handleSaveDudiPopup,
    updateActiveDraft,
    copyInspectionFromPreviousStudent,
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
