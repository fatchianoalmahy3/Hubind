import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Building2, ChevronRight } from 'lucide-react';
import { ToastManager } from '../core/ToastManager';
import { PublicPortalClient } from '../core/PublicPortalClient';
import {
  DEFAULT_MONITORING_STAGE_CONTROL,
  type MonitoringStageControl,
} from '../core/types/schema';
import {
  calculateEqualWeightedAverage,
  getPredikatFromScore,
  getStageValueByNumber,
  pickRecommendedStageForControl,
} from '../core/utils/monitoringHelpers';
import { getTodayWibIsoDate } from '../core/utils/dateHelpers';
import {
  DEFAULT_DRAFT,
  getStudentKey,
  isDudiContactIncomplete,
  type GradeScoresDraft,
  type StudentStageDraft,
} from './monitoring-portal/types';
import { PinVerificationStep } from './monitoring-portal/PinVerificationStep';
import { DudiSelectionStep } from './monitoring-portal/DudiSelectionStep';
import { MonitoringEntryStep } from './monitoring-portal/MonitoringEntryStep';
import { DudiContactPopupModal } from './monitoring-portal/DudiContactPopupModal';

interface TeacherMonitoringPortalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const TeacherMonitoringPortal: React.FC<TeacherMonitoringPortalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
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
  const [dudiPemimpin, setDudiPemimpin] = useState('');
  const [dudiPic, setDudiPic] = useState('');
  const [dudiTelp, setDudiTelp] = useState('');
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
  const [popupSpellingConfirmed, setPopupSpellingConfirmed] = useState(false);
  const [popupError, setPopupError] = useState('');
  const [savingPopupContact, setSavingPopupContact] = useState(false);

  const activeTeacherKeyRef = useRef('');
  const activeDudiKeyRef = useRef('');

  useEffect(() => {
    if (isOpen) {
      setDudiPopupOpen(false);
      loadPetugasList();
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
            loadAssignedDudi(parsed.nama, parsed.petugasId);
          }
        }
      } catch {
        // ignore
      }
    }
  }, [isOpen]);

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
          void PublicPortalClient.getDudiStudents(dudi.nama, dudi.id || '', teacherName).catch(() => {});
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

  const handleVerifyPin = async (e?: React.FormEvent) => {
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

    setSelectedDudi(dudi);
    setDudiPemimpin(initPemimpin);
    setDudiPic(initPic);
    setDudiTelp(initTelp);
    setShowDudiContactEditor(false);
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
            initDrafts[draftKey] = {
              ...DEFAULT_DRAFT,
              sakit: Number(log?.sakit ?? 0) || 0,
              izin: Number(log?.izin ?? 0) || 0,
              alpha: Number(log?.alpha ?? 0) || 0,
              catatanPerkembangan: String(log?.catatan || ''),
            };
          });
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

  const handleSaveDudiPopup = async (e: React.FormEvent) => {
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

    setSavingPopupContact(true);
    try {
      const res = await PublicPortalClient.saveDudiContactVerification({
        dudi_id: selectedDudi.id || '',
        nama_dudi: selectedDudi.nama,
        alamat_dudi: selectedDudi.alamat || '',
        nama_pemimpin: cleanPemimpin,
        nama_pic: cleanPic,
        no_telp_dudi: cleanTelp,
        spelling_confirmed: true,
      });

      const updatedContact = {
        namaPemimpin: res.dudiContact?.namaPemimpin || cleanPemimpin,
        pic: res.dudiContact?.pic || cleanPic,
        kontak: res.dudiContact?.kontak || cleanTelp,
      };
      setDudiPemimpin(updatedContact.namaPemimpin);
      setDudiPic(updatedContact.pic);
      setDudiTelp(updatedContact.kontak);
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
    setDraftsByKey((prev) => ({
      ...prev,
      [activeDraftKey]: {
        ...(prev[activeDraftKey] || DEFAULT_DRAFT),
        ...patch,
      },
    }));
  };

  const setStudentStage = (stageNum: number) => {
    if (!activeStudentKey) return;
    const isGlobalUnlocked = stageControl.unlockedStages.includes(stageNum);
    const isCompleted = (activeStudent?.completedStages || []).includes(stageNum);

    if (!isGlobalUnlocked && !isCompleted) {
      setFormError(
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
      setFormError(
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

  const activeGradeEditDraft: GradeScoresDraft = (activeStudentKey && gradeEditDrafts[activeStudentKey]) || {
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
      setFormError('Keempat kategori nilai PKL (K3LH, Softskills, Hardskills, Alur Bisnis) wajib diisi antara 1 – 100.');
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
        setFormError(res.message || 'Gagal menyimpan perubahan nilai ke Cloud Server.');
      }
    } catch (e: any) {
      setFormError(e?.message || 'Gagal memperbarui nilai ke Cloud Server.');
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
      setFormError(
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
      setFormError(
        `Tahap ${activeStageNum} masih terkunci. Harap isi dan simpan ${prevLabel} terlebih dahulu.`
      );
      return;
    }

    if (isDudiContactIncomplete(dudiPemimpin, dudiPic, dudiTelp)) {
      setPopupPemimpin(dudiPemimpin);
      setPopupPic(dudiPic);
      setPopupTelp(dudiTelp);
      setPopupSpellingConfirmed(false);
      setPopupError('Data Pemimpin, PIC, dan No. Telp DUDI harus dilengkapi dan dikonfirmasi ejaannya terlebih dahulu.');
      setDudiPopupOpen(true);
      return;
    }

    if (activeStageNum === 5 && !alreadyHasGrade && activeDraft.nilaiPklMuncul === null) {
      setFormError(
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
        setFormError(
          'Keempat kategori nilai PKL (K3LH, Softskills, Hardskills, Alur Bisnis) wajib diisi antara 1 – 100.'
        );
        return;
      }
    }
    const existingStageLog = activeStudent.stageLogs?.[activeStageNum];

    setSubmitting(true);
    try {
      const shouldSendDudiContact = activeStageNum === 1 || showDudiContactEditor;
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
            }
          : {}),
      };

      const json = await PublicPortalClient.submitMonitoring(payload);

      if (json.success) {
        if (json.dudiContact) {
          const updatedContact = {
            namaPemimpin: json.dudiContact.namaPemimpin || dudiPemimpin.trim(),
            pic: json.dudiContact.pic || dudiPic.trim() || '-',
            kontak: json.dudiContact.kontak || dudiTelp.trim() || '-',
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
        setDudiStudents((prev) =>
          prev.map((stu, idx) => {
            if (idx !== selectedStudentIndex) return stu;
            const prevCompleted: number[] = Array.isArray(stu.completedStages) ? stu.completedStages : [];
            const nextCompleted = Array.from(new Set([...prevCompleted, activeStageNum])).sort(
              (a, b) => a - b
            );
            const nextRec = pickRecommendedStageForControl(nextCompleted, stageControl);
            const savedMonId = json.monitoring?.ID_Monitoring || existingStageLog?.monitoringId;

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
                  catatan: activeDraft.catatanPerkembangan,
                  tanggal: payload.tanggal,
                  status: 'Terlaksana',
                },
              },
            };
          })
        );

        if (onSuccess) onSuccess();

        if (selectedStudentIndex < dudiStudents.length - 1) {
          setSelectedStudentIndex(selectedStudentIndex + 1);
        }
      } else {
        setFormError(json.message || 'Gagal menyimpan data ke Cloud Server.');
      }
    } catch (e: any) {
      setFormError(e?.message || 'Periksa koneksi internet dan layanan Cloud Server.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePetugasLogout = () => {
    try {
      sessionStorage.removeItem('hubin_petugas_cache');
    } catch {
      // ignore
    }
    setIsPinVerified(false);
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

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-3xl max-h-[94vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0 gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight truncate">
                Portal Supervisi Guru Pembimbing
              </h2>
              <p className="text-[11px] text-slate-500 truncate">
                Langkah {currentStep} dari 3 · Tersinkron ke Cloud Server
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isPinVerified && (
              <button
                type="button"
                onClick={handlePetugasLogout}
                className="min-h-[36px] px-3 py-1.5 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors cursor-pointer"
              >
                Ganti Petugas
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup portal supervisi"
              className="min-w-[40px] min-h-[40px] rounded-full hover:bg-slate-200/70 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {(loadingPetugas || verifyingPin || loadingDudi || loadingStudents || submitting || savingGradeEdit) && (
          <div className="progress-sweep-track shrink-0" role="progressbar" aria-label="Menyinkronkan data supervisi">
            <div className="progress-sweep-bar" />
          </div>
        )}

        {/* Step Progress Bar */}
        <div className="px-4 sm:px-6 py-2.5 bg-slate-100/70 border-b border-slate-200/70 flex items-center justify-between text-xs font-semibold shrink-0 overflow-x-auto gap-2">
          <div
            className={`flex items-center gap-2 whitespace-nowrap ${
              currentStep === 1
                ? 'text-blue-700 font-bold'
                : isPinVerified
                ? 'text-emerald-700'
                : 'text-slate-500'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                isPinVerified
                  ? 'bg-emerald-600 text-white'
                  : currentStep === 1
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-300 text-slate-700'
              }`}
            >
              {isPinVerified ? '✓' : '1'}
            </span>
            <span>1. Identitas &amp; PIN</span>
          </div>

          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />

          <div
            className={`flex items-center gap-2 whitespace-nowrap ${
              currentStep === 2
                ? 'text-blue-700 font-bold'
                : selectedDudi
                ? 'text-emerald-700'
                : 'text-slate-400'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                selectedDudi
                  ? 'bg-emerald-600 text-white'
                  : currentStep === 2
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {selectedDudi ? '✓' : '2'}
            </span>
            <span>2. DUDI Bimbingan</span>
          </div>

          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />

          <div
            className={`flex items-center gap-2 whitespace-nowrap ${
              currentStep === 3 ? 'text-blue-700 font-bold' : 'text-slate-400'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                currentStep === 3
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              3
            </span>
            <span>3. Absensi &amp; Supervisi</span>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          {currentStep === 1 && (
            <PinVerificationStep
              petugasList={petugasList}
              loadingPetugas={loadingPetugas}
              petugasLoadError={petugasLoadError}
              selectedPetugasId={selectedPetugasId}
              selectedPetugasNama={selectedPetugasNama}
              pinInput={pinInput}
              verifyingPin={verifyingPin}
              pinError={pinError}
              onSelectPetugas={(id, nama, nip) => {
                setSelectedPetugasId(id);
                setSelectedPetugasNama(nama);
                setSelectedPetugasNip(nip);
                setPinError('');
              }}
              onChangePin={(nextPin) => {
                setPinInput(nextPin);
                setPinError('');
              }}
              onReloadPetugas={loadPetugasList}
              onSubmit={handleVerifyPin}
            />
          )}

          {currentStep === 2 && (
            <DudiSelectionStep
              selectedPetugasNama={selectedPetugasNama}
              assignedDudiList={assignedDudiList}
              loadingDudi={loadingDudi}
              dudiError={dudiError}
              onSelectDudi={handleSelectDudi}
            />
          )}

          {currentStep === 3 && selectedDudi && (
            <MonitoringEntryStep
              selectedDudi={selectedDudi}
              selectedPetugasNama={selectedPetugasNama}
              dudiStudents={dudiStudents}
              loadingStudents={loadingStudents}
              studentsError={studentsError}
              selectedStudentIndex={selectedStudentIndex}
              activeStudent={activeStudent}
              activeStageNum={activeStageNum}
              stageControl={stageControl}
              isStageReadOnly={isStageReadOnly}
              isStageCompleted={isStageCompleted}
              activeDraft={activeDraft}
              alreadyHasGrade={alreadyHasGrade}
              isEditingGrade={isEditingGrade}
              canInputGradeThisStage={canInputGradeThisStage}
              showGradeInputs={showGradeInputs}
              activeGradeEditDraft={activeGradeEditDraft}
              rataRataEditNilai={rataRataEditNilai}
              predikatEditNilai={predikatEditNilai}
              rataRataNilai={rataRataNilai}
              predikatNilai={predikatNilai}
              savingGradeEdit={savingGradeEdit}
              submitting={submitting}
              formError={formError}
              dudiPemimpin={dudiPemimpin}
              dudiPic={dudiPic}
              dudiTelp={dudiTelp}
              showDudiContactEditor={showDudiContactEditor}
              onChangeStepToDudiList={() => setCurrentStep(2)}
              onSelectStudentIndex={(idx) => {
                setSelectedStudentIndex(idx);
                setFormError('');
              }}
              onSelectStage={setStudentStage}
              onUpdateDraft={updateActiveDraft}
              onChangeDudiPemimpin={(val) => {
                setDudiPemimpin(val);
                setFormError('');
              }}
              onChangeDudiPic={(val) => {
                setDudiPic(val);
                setFormError('');
              }}
              onChangeDudiTelp={(val) => {
                setDudiTelp(val);
                setFormError('');
              }}
              onCloseDudiContactEditor={() => setShowDudiContactEditor(false)}
              onOpenDudiPopupForEdit={() => {
                setPopupPemimpin(dudiPemimpin);
                setPopupPic(dudiPic);
                setPopupTelp(dudiTelp);
                setPopupSpellingConfirmed(false);
                setPopupError('');
                setDudiPopupOpen(true);
              }}
              onStartEditGrade={startEditGrade}
              onCancelEditGrade={cancelEditGrade}
              onUpdateGradeEditDraft={updateGradeEditDraft}
              onSaveEditedGrades={handleSaveEditedGrades}
              onSaveSupervision={handleSaveSupervision}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-500">
            {currentStep === 3 && dudiStudents.length > 0 && (
              <span>
                Siswa ke-{selectedStudentIndex + 1} dari {dudiStudents.length}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>

        <DudiContactPopupModal
          isOpen={Boolean(dudiPopupOpen && selectedDudi)}
          dudiNama={selectedDudi?.nama || ''}
          pemimpin={popupPemimpin}
          pic={popupPic}
          telp={popupTelp}
          spellingConfirmed={popupSpellingConfirmed}
          error={popupError}
          saving={savingPopupContact}
          onChangePemimpin={(v) => {
            setPopupPemimpin(v);
            setPopupError('');
          }}
          onChangePic={(v) => {
            setPopupPic(v);
            setPopupError('');
          }}
          onChangeTelp={(v) => {
            setPopupTelp(v);
            setPopupError('');
          }}
          onChangeSpellingConfirmed={(v) => {
            setPopupSpellingConfirmed(v);
            setPopupError('');
          }}
          onBackToDudiList={() => {
            setDudiPopupOpen(false);
            setSelectedDudi(null);
            setDudiStudents([]);
            setCurrentStep(2);
          }}
          onSubmit={handleSaveDudiPopup}
        />
      </div>
    </div>
  );
};
