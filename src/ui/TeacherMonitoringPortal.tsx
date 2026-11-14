import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  AlertCircle,
  Building2,
  Users,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  KeyRound,
  ChevronRight,
  Save,
  MapPin,
  RefreshCw,
  CheckCircle2,
  Minus,
  Plus,
  ClipboardCheck,
  Award,
  Pencil,
} from 'lucide-react';
import { ToastManager } from '../core/ToastManager';
import { PublicPortalClient } from '../core/PublicPortalClient';
import { MONITORING_STAGES } from '../core/types/schema';
import {
  calculateEqualWeightedAverage,
  getPredikatFromScore,
  getStageValueByNumber,
} from '../core/utils/monitoringHelpers';

interface TeacherMonitoringPortalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface StudentStageDraft {
  sakit: number;
  izin: number;
  alpha: number;
  nilaiPklMuncul: boolean | null;
  nilaiK3lh: number;
  nilaiSoftskill: number;
  nilaiKompetensiTeknis: number;
  nilaiAlurBisnis: number;
  catatanPerkembangan: string;
}

const DEFAULT_DRAFT: StudentStageDraft = {
  sakit: 0,
  izin: 0,
  alpha: 0,
  nilaiPklMuncul: null,
  nilaiK3lh: 85,
  nilaiSoftskill: 85,
  nilaiKompetensiTeknis: 85,
  nilaiAlurBisnis: 85,
  catatanPerkembangan: '',
};

const QUICK_SCORE_PRESETS = [75, 80, 85, 90, 95];

const GRADE_CATEGORIES: Array<{
  field: 'nilaiK3lh' | 'nilaiSoftskill' | 'nilaiKompetensiTeknis' | 'nilaiAlurBisnis';
  title: string;
  subtitle: string;
}> = [
  {
    field: 'nilaiK3lh',
    title: '1. K3LH',
    subtitle: 'Keselamatan, Kesehatan Kerja, Penggunaan APD & Kebersihan Area',
  },
  {
    field: 'nilaiSoftskill',
    title: '2. Softskill',
    subtitle: 'Etos Kerja, Kedisiplinan, Komunikasi & Kerjasama Tim',
  },
  {
    field: 'nilaiKompetensiTeknis',
    title: '3. Kompetensi Teknis',
    subtitle: 'Keterampilan Kejuruan, Kualitas Hasil Kerja & Kesesuaian SOP',
  },
  {
    field: 'nilaiAlurBisnis',
    title: '4. Alur Bisnis Dunia Kerja',
    subtitle: 'Pemahaman Proses Operasional Industri & Budaya Kerja DUDI',
  },
];

function getStudentKey(student: any, fallbackIdx = 0): string {
  if (!student) return `stu_${fallbackIdx}`;
  return String(student.nis && student.nis !== '-' ? student.nis : student.id || `stu_${fallbackIdx}`);
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
  const [gradeEditDrafts, setGradeEditDrafts] = useState<
    Record<
      string,
      {
        nilaiK3lh: number;
        nilaiSoftskill: number;
        nilaiKompetensiTeknis: number;
        nilaiAlurBisnis: number;
      }
    >
  >({});
  const [savingGradeEdit, setSavingGradeEdit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadPetugasList();

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
      const json = await PublicPortalClient.getPetugasList();
      if (!json.success) {
        const errMsg = 'Gagal membaca daftar petugas dari Google Spreadsheet.';
        setPetugasList([]);
        setPetugasLoadError(errMsg);
        ToastManager.getInstance().show('Gagal Memuat Daftar Petugas', 'error', errMsg);
        return;
      }

      const list = Array.isArray(json.data) ? json.data : [];
      setPetugasList(list);
      if (list.length > 0 && !selectedPetugasId) {
        setSelectedPetugasId(list[0].id);
        setSelectedPetugasNama(list[0].nama);
        setSelectedPetugasNip(list[0].nip || '-');
      }
    } catch (e: any) {
      const errMsg = e?.message || 'Tidak dapat terhubung ke Google Spreadsheet.';
      setPetugasList([]);
      setPetugasLoadError(errMsg);
      ToastManager.getInstance().show('Gagal Memuat Daftar Petugas', 'error', errMsg);
    } finally {
      setLoadingPetugas(false);
    }
  };

  const loadAssignedDudi = async (teacherName: string, teacherId: string) => {
    setLoadingDudi(true);
    setDudiError('');
    try {
      const json = await PublicPortalClient.getPetugasDudi(teacherName, teacherId);
      if (!json.success) {
        const errMsg = 'Gagal memuat daftar DUDI bimbingan dari Spreadsheet.';
        setAssignedDudiList([]);
        setDudiError(errMsg);
        ToastManager.getInstance().show('Gagal Memuat DUDI Bimbingan', 'error', errMsg);
        return;
      }
      setAssignedDudiList(Array.isArray(json.data) ? json.data : []);
    } catch (e: any) {
      const errMsg = e?.message || 'Gagal terhubung ke Google Spreadsheet.';
      setAssignedDudiList([]);
      setDudiError(errMsg);
      ToastManager.getInstance().show('Gagal Memuat DUDI Bimbingan', 'error', errMsg);
    } finally {
      setLoadingDudi(false);
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
      `Mencocokkan identitas ${selectedPetugasNama || 'petugas'} dengan Spreadsheet`
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

        // Immediately enter Step 2 and stream DUDI list asynchronously so button never hangs
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
    setSelectedDudi(dudi);
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

    try {
      const json = await PublicPortalClient.getDudiStudents(
        dudi.nama,
        dudi.id || '',
        selectedPetugasNama
      );
      if (!json.success) {
        const errMsg = 'Gagal memuat daftar siswa dari Google Spreadsheet.';
        setStudentsError(errMsg);
        ToastManager.getInstance().show('Gagal Memuat Daftar Siswa', 'error', errMsg);
        return;
      }

      const students = Array.isArray(json.data) ? json.data : [];
      const initStages: Record<string, number> = {};
      const initDrafts: Record<string, StudentStageDraft> = {};

      students.forEach((stu: any, idx: number) => {
        const stuKey = getStudentKey(stu, idx);
        const recStage = Math.min(8, Math.max(1, Number(stu.recommendedStage || 1)));
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

      setStageByStudent(initStages);
      setDraftsByKey(initDrafts);
      setDudiStudents(students);
    } catch (e: any) {
      const errMsg = e?.message || 'Gagal menghubungi Google Spreadsheet.';
      setStudentsError(errMsg);
      ToastManager.getInstance().show('Gagal Memuat Siswa DUDI', 'error', errMsg);
    } finally {
      setLoadingStudents(false);
    }
  };

  const activeStudent = dudiStudents[selectedStudentIndex] || null;
  const activeStudentKey = activeStudent ? getStudentKey(activeStudent, selectedStudentIndex) : '';
  const activeStageNum = activeStudent
    ? stageByStudent[activeStudentKey] || Number(activeStudent.recommendedStage || 1)
    : 1;
  const activeDraftKey = activeStudent ? `${activeStudentKey}::${activeStageNum}` : '';
  const activeDraft: StudentStageDraft =
    (activeDraftKey && draftsByKey[activeDraftKey]) || DEFAULT_DRAFT;

  const updateActiveDraft = (patch: Partial<StudentStageDraft>) => {
    if (!activeDraftKey) return;
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

  const activeGradeEditDraft = (activeStudentKey && gradeEditDrafts[activeStudentKey]) || {
    nilaiK3lh: Number(activeStudent?.submittedGradeSummary?.k3lh ?? 85) || 85,
    nilaiSoftskill: Number(activeStudent?.submittedGradeSummary?.softskill ?? 85) || 85,
    nilaiKompetensiTeknis: Number(activeStudent?.submittedGradeSummary?.teknis ?? 85) || 85,
    nilaiAlurBisnis: Number(activeStudent?.submittedGradeSummary?.alurBisnis ?? 85) || 85,
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
    if (!activeStudent || !activeStudentKey) return;
    const g = activeStudent.submittedGradeSummary;
    const fallbackAvg = Number(g?.rataRata ?? 85) || 85;
    setGradeEditDrafts((prev) => ({
      ...prev,
      [activeStudentKey]: {
        nilaiK3lh: Number(g?.k3lh ?? fallbackAvg) || 85,
        nilaiSoftskill: Number(g?.softskill ?? fallbackAvg) || 85,
        nilaiKompetensiTeknis: Number(g?.teknis ?? fallbackAvg) || 85,
        nilaiAlurBisnis: Number(g?.alurBisnis ?? fallbackAvg) || 85,
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

  const updateGradeEditDraft = (
    patch: Partial<{
      nilaiK3lh: number;
      nilaiSoftskill: number;
      nilaiKompetensiTeknis: number;
      nilaiAlurBisnis: number;
    }>
  ) => {
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
    if (!activeStudent || !activeStudentKey || !selectedDudi) return;
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
        tanggal: new Date().toISOString().split('T')[0],
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
        setFormError(res.message || 'Gagal menyimpan perubahan nilai ke Google Spreadsheet.');
      }
    } catch (e: any) {
      setFormError(e?.message || 'Gagal memperbarui nilai ke Google Spreadsheet.');
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

    if (activeStageNum === 5 && !alreadyHasGrade && activeDraft.nilaiPklMuncul === null) {
      setFormError(
        'Pada Monitoring ke-4, silakan pilih terlebih dahulu apakah nilai PKL sudah muncul ("Ya, Sudah Muncul" atau "Belum Muncul").'
      );
      return;
    }

    const stageLabel = getStageValueByNumber(activeStageNum);
    const shouldSubmitGrades = canInputGradeThisStage && activeDraft.nilaiPklMuncul === true;
    const existingStageLog = activeStudent.stageLogs?.[activeStageNum];

    setSubmitting(true);
    try {
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
        tanggal: new Date().toISOString().split('T')[0],
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
      };

      const json = await PublicPortalClient.submitMonitoring(payload);

      if (json.success) {
        setDudiStudents((prev) =>
          prev.map((stu, idx) => {
            if (idx !== selectedStudentIndex) return stu;
            const prevCompleted: number[] = Array.isArray(stu.completedStages) ? stu.completedStages : [];
            const nextCompleted = Array.from(new Set([...prevCompleted, activeStageNum])).sort(
              (a, b) => a - b
            );
            const maxDone = nextCompleted[nextCompleted.length - 1] || activeStageNum;
            const nextRec = Math.min(maxDone + 1, 8);
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
        setFormError(json.message || 'Gagal menyimpan data ke Google Spreadsheet.');
      }
    } catch (e: any) {
      setFormError(e?.message || 'Periksa koneksi dan konfigurasi Apps Script.');
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
                Langkah {currentStep} dari 3 · Sinkron Google Spreadsheet
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
            <div className="max-w-md mx-auto space-y-5 py-4 animate-in fade-in duration-150">
              <div className="text-center space-y-1">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto border border-blue-200/80 shadow-2xs">
                  <KeyRound className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  Pilih Nama &amp; Masukkan PIN
                </h3>
                <p className="text-xs text-slate-500">
                  Gunakan 4 digit terakhir NIP / No. WhatsApp terdaftar atau PIN khusus pada sheet Master Guru
                </p>
              </div>

              {petugasLoadError && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-xs text-amber-900">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                    <span>{petugasLoadError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={loadPetugasList}
                    className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 bg-white border border-amber-300 rounded-lg font-semibold text-amber-800 hover:bg-amber-100 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Muat Ulang</span>
                  </button>
                </div>
              )}

              {pinError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-xs text-rose-700">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                  <span>{pinError}</span>
                </div>
              )}

              <form onSubmit={handleVerifyPin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Nama Petugas / Guru Pendamping:
                  </label>
                  <select
                    value={selectedPetugasId}
                    disabled={loadingPetugas || petugasList.length === 0}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedPetugasId(id);
                      const chosen = petugasList.find((p) => p.id === id);
                      if (chosen) {
                        setSelectedPetugasNama(chosen.nama);
                        setSelectedPetugasNip(chosen.nip);
                      }
                      setPinError('');
                    }}
                    className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {loadingPetugas ? (
                      <option value="">Memuat daftar guru dari Google Spreadsheet...</option>
                    ) : petugasList.length === 0 ? (
                      <option value="">-- Belum ada data di Master_Guru_Pendamping --</option>
                    ) : (
                      petugasList.map((p, idx) => (
                        <option key={`${p.id || 'petugas'}_${idx}`} value={p.id}>
                          {p.nama} — {p.peran || 'Guru Pendamping'}
                        </option>
                      ))
                    )}
                  </select>
                  {selectedPetugasNip && (
                    <p className="text-[11px] text-slate-500 mt-1">
                      NIP: {selectedPetugasNip}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    PIN Keamanan (4 Digit):
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={8}
                    value={pinInput}
                    onChange={(e) => {
                      setPinInput(e.target.value);
                      setPinError('');
                    }}
                    placeholder="4 digit terakhir NIP / WA"
                    className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-center text-base tracking-widest font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={verifyingPin || petugasList.length === 0}
                  className="w-full min-h-[44px] py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] disabled:opacity-50"
                >
                  {verifyingPin ? (
                    <span>Memverifikasi PIN...</span>
                  ) : (
                    <>
                      <span>Lanjut ke DUDI Bimbingan</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-3.5 bg-blue-50/80 border border-blue-200/80 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs text-blue-900">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    Petugas Aktif: <b>{selectedPetugasNama}</b> (NIP: {selectedPetugasNip})
                  </span>
                </div>
                <span className="text-[11px] text-blue-700 font-semibold">
                  {assignedDudiList.length} DUDI Diampu
                </span>
              </div>

              {loadingDudi ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Memuat daftar DUDI bimbingan dari sheet Plotting_Pemberangkatan...
                </div>
              ) : dudiError ? (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800">
                  {dudiError}
                </div>
              ) : assignedDudiList.length === 0 ? (
                <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-center space-y-2 text-xs text-slate-600">
                  <p className="font-bold text-slate-800">
                    Belum Ada DUDI yang Di-plotting untuk {selectedPetugasNama}
                  </p>
                  <p>
                    Pastikan Admin Hubin sudah menetapkan nama Anda pada sheet <code>Plotting_Pemberangkatan</code> atau <code>Data_Pengajuan_PKL</code> di Google Spreadsheet.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                  {assignedDudiList.map((dudi, idx) => (
                    <div
                      key={`${dudi.id || 'dudi'}_${idx}`}
                      onClick={() => handleSelectDudi(dudi)}
                      className="p-4 rounded-2xl border border-slate-200/90 bg-white hover:border-blue-500 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1.5 text-[11px] text-slate-500">
                          <span className="font-semibold text-blue-700 truncate">{dudi.bidang}</span>
                          <span className="font-bold text-slate-600 flex items-center gap-1 shrink-0">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                            <span>{dudi.jumlahSiswa ?? dudi.kuota} Siswa</span>
                          </span>
                        </div>

                        <h4 className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                          {dudi.nama}
                        </h4>

                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-2">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{dudi.alamat}</span>
                        </div>
                      </div>

                      <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-[11px] text-slate-500 truncate">
                          PIC: <b className="text-slate-700">{dudi.pic}</b>
                        </span>
                        <button
                          type="button"
                          className="min-h-[38px] px-3 py-1.5 rounded-lg bg-blue-600 group-hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1 transition-all shrink-0"
                        >
                          <span>Supervisi</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {currentStep === 3 && selectedDudi && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Selected DUDI Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-slate-50 border border-slate-200/90 rounded-2xl">
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(2)}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 flex items-center gap-1 text-xs font-semibold cursor-pointer shrink-0"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Ganti DUDI</span>
                  </button>
                  <div className="text-xs min-w-0">
                    <span className="text-slate-500 block text-[10px]">DUDI Yang Dipilih</span>
                    <span className="font-bold text-slate-900 truncate block">{selectedDudi.nama}</span>
                  </div>
                </div>

                <div className="text-[11px] text-slate-600 flex items-center gap-2 shrink-0">
                  <span>Petugas: <b>{selectedPetugasNama}</b></span>
                  <span aria-hidden="true">·</span>
                  <span className="text-blue-700 font-bold">
                    {dudiStudents.length} Siswa
                  </span>
                </div>
              </div>

              {loadingStudents ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Memuat daftar siswa &amp; riwayat tahap monitoring dari Google Spreadsheet...
                </div>
              ) : studentsError ? (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800">
                  {studentsError}
                </div>
              ) : dudiStudents.length === 0 ? (
                <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-center text-xs text-slate-600">
                  Belum ada siswa yang tercatat di-plotting pada DUDI <b>{selectedDudi.nama}</b>.
                </div>
              ) : (
                <>
                  {/* Student Switcher (Isolated State per Student) */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-2">
                      Pilih Siswa ({dudiStudents.length} Siswa Terdata):
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {dudiStudents.map((student, idx) => {
                        const isSelected = selectedStudentIndex === idx;
                        const completedCount = Array.isArray(student.completedStages)
                          ? student.completedStages.length
                          : 0;
                        const hasGrade = Boolean(student.hasSubmittedGrades);

                        return (
                          <button
                            key={`${student.id || 'stu'}_${idx}`}
                            type="button"
                            onClick={() => {
                              setSelectedStudentIndex(idx);
                              setFormError('');
                            }}
                            className={`min-h-[60px] p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                              isSelected
                                ? 'border-blue-600 bg-blue-50/70 text-blue-900 ring-2 ring-blue-600/20'
                                : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-slate-500">
                              <span>NIS: {student.nis}</span>
                              <span className="font-semibold text-slate-600">
                                Tahap {completedCount}/8{hasGrade ? ' · Nilai ✓' : ''}
                              </span>
                            </div>
                            <div className="font-bold text-xs truncate mt-1">{student.nama}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                              {student.kelas}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {activeStudent && (
                    <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-5">
                      {/* Active Student Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-2">
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">
                            Supervisi: {activeStudent.nama}
                          </h4>
                          <p className="text-xs text-slate-500">
                            NIS: {activeStudent.nis} · Kelas: {activeStudent.kelas} · Jurusan: {activeStudent.jurusan}
                          </p>
                        </div>
                        <div className="text-xs font-semibold text-blue-700">
                          Deteksi Otomatis: Tahap {activeStudent.recommendedStage || 1} dari 8
                        </div>
                      </div>

                      {/* 8-Stage Auto-Detect & Selector */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-bold text-slate-800">
                            Tahap Monitoring (8 Tahap):
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {(activeStudent.completedStages || []).includes(activeStageNum)
                              ? 'Sudah terdata di Spreadsheet'
                              : 'Tahap berikutnya'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {MONITORING_STAGES.map((st) => {
                            const isCompleted = (activeStudent.completedStages || []).includes(st.num);
                            const isActive = activeStageNum === st.num;
                            return (
                              <button
                                key={st.num}
                                type="button"
                                onClick={() => setStudentStage(st.num)}
                                className={`min-h-[44px] px-3 py-2 rounded-xl border text-left text-xs font-semibold transition-all cursor-pointer flex items-center justify-between gap-1.5 ${
                                  isActive
                                    ? 'border-blue-600 bg-blue-600 text-white shadow-xs'
                                    : isCompleted
                                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100/70'
                                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                                }`}
                              >
                                <span className="truncate">{st.label}</span>
                                {isCompleted && (
                                  <CheckCircle2
                                    className={`w-3.5 h-3.5 shrink-0 ${
                                      isActive ? 'text-white' : 'text-emerald-600'
                                    }`}
                                  />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Section: Absensi (Sakit, Izin, Alpha) */}
                      <div className="space-y-2.5">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                          <ClipboardCheck className="w-4 h-4 text-blue-600" />
                          <span>Absensi Siswa (Sakit, Izin, Alpha) — Tahap {activeStageNum}</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {(
                            [
                              { key: 'sakit', label: 'Sakit (Hari)', accent: 'text-amber-700' },
                              { key: 'izin', label: 'Izin (Hari)', accent: 'text-blue-700' },
                              { key: 'alpha', label: 'Alpha (Hari)', accent: 'text-rose-700' },
                            ] as const
                          ).map((item) => {
                            const val = activeDraft[item.key];
                            return (
                              <div
                                key={item.key}
                                className="p-3 bg-white border border-slate-200 rounded-xl space-y-2"
                              >
                                <label className={`block text-xs font-bold ${item.accent}`}>
                                  {item.label}
                                </label>
                                <div className="flex items-center justify-between gap-2">
                                  <button
                                    type="button"
                                    aria-label={`Kurangi ${item.label}`}
                                    onClick={() =>
                                      updateActiveDraft({
                                        [item.key]: Math.max(0, val - 1),
                                      })
                                    }
                                    className="min-w-[44px] min-h-[44px] rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer"
                                  >
                                    <Minus className="w-4 h-4" />
                                  </button>
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    min={0}
                                    max={90}
                                    value={val}
                                    onChange={(e) => {
                                      const parsed = Math.max(
                                        0,
                                        Math.min(90, Math.round(Number(e.target.value) || 0))
                                      );
                                      updateActiveDraft({ [item.key]: parsed });
                                    }}
                                    className="w-full min-h-[44px] text-center font-mono tabular-nums text-base font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                                  />
                                  <button
                                    type="button"
                                    aria-label={`Tambah ${item.label}`}
                                    onClick={() =>
                                      updateActiveDraft({
                                        [item.key]: Math.min(90, val + 1),
                                      })
                                    }
                                    className="min-w-[44px] min-h-[44px] rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer"
                                  >
                                    <Plus className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Conditional Section: Already Submitted Grade Notice (+ Edit Nilai) OR Monitoring ke-4+ Prompt */}
                      {alreadyHasGrade ? (
                        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-3 text-xs text-emerald-900">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 font-bold text-sm text-emerald-900">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                              <span>Nilai PKL Sudah Terinput</span>
                            </div>
                            <div className="flex items-center gap-2.5">
                              {activeStudent.submittedGradeSummary?.rataRata ? (
                                <span className="font-mono tabular-nums font-bold text-sm text-emerald-800">
                                  Rata-rata: {activeStudent.submittedGradeSummary.rataRata}
                                </span>
                              ) : null}
                              {!isEditingGrade && (
                                <button
                                  type="button"
                                  onClick={startEditGrade}
                                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-800 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                  <span>Edit Nilai</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {!isEditingGrade ? (
                            <>
                              <p className="text-emerald-800 leading-relaxed">
                                Nilai DUDI untuk siswa ini sudah tercatat di Spreadsheet
                                {activeStudent.submittedGradeSummary?.tahapDiinput
                                  ? ` (${activeStudent.submittedGradeSummary.tahapDiinput})`
                                  : ''}
                                , sehingga form input awal tidak ditampilkan lagi. Gunakan tombol <b>Edit Nilai</b> bila perlu merevisi skor.
                              </p>
                              {activeStudent.submittedGradeSummary?.k3lh !== null &&
                                activeStudent.submittedGradeSummary?.k3lh !== undefined && (
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono tabular-nums text-[11px]">
                                    <div className="p-2 bg-white/80 rounded-lg border border-emerald-200/70">
                                      <span className="text-slate-500 block font-sans">K3LH</span>
                                      <b>{activeStudent.submittedGradeSummary.k3lh}</b>
                                    </div>
                                    <div className="p-2 bg-white/80 rounded-lg border border-emerald-200/70">
                                      <span className="text-slate-500 block font-sans">Softskill</span>
                                      <b>{activeStudent.submittedGradeSummary.softskill}</b>
                                    </div>
                                    <div className="p-2 bg-white/80 rounded-lg border border-emerald-200/70">
                                      <span className="text-slate-500 block font-sans">Teknis</span>
                                      <b>{activeStudent.submittedGradeSummary.teknis}</b>
                                    </div>
                                    <div className="p-2 bg-white/80 rounded-lg border border-emerald-200/70">
                                      <span className="text-slate-500 block font-sans">Alur Bisnis</span>
                                      <b>{activeStudent.submittedGradeSummary.alurBisnis}</b>
                                    </div>
                                  </div>
                                )}
                            </>
                          ) : (
                            <div className="space-y-3 pt-2 border-t border-emerald-200/80 animate-in fade-in duration-150">
                              <div className="flex items-center justify-between text-xs text-emerald-950">
                                <span className="font-bold">
                                  Edit 4 Kategori Nilai PKL (Bobot Sama 25%)
                                </span>
                                <span className="text-[11px] text-emerald-700">Skala 0 – 100</span>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {GRADE_CATEGORIES.map((cat) => {
                                  const score = activeGradeEditDraft[cat.field];
                                  return (
                                    <div
                                      key={cat.field}
                                      className="p-3.5 bg-white border border-emerald-200 rounded-xl space-y-2.5"
                                    >
                                      <div>
                                        <span className="text-xs font-bold text-slate-900 block">
                                          {cat.title}
                                        </span>
                                        <span className="text-[11px] text-slate-500 leading-snug block">
                                          {cat.subtitle}
                                        </span>
                                      </div>

                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          aria-label={`Kurangi ${cat.title}`}
                                          onClick={() =>
                                            updateGradeEditDraft({
                                              [cat.field]: Math.max(0, score - 1),
                                            })
                                          }
                                          className="min-w-[44px] min-h-[44px] rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer"
                                        >
                                          <Minus className="w-4 h-4" />
                                        </button>
                                        <input
                                          type="number"
                                          inputMode="numeric"
                                          min={0}
                                          max={100}
                                          value={score}
                                          onChange={(e) => {
                                            const nextVal = Math.max(
                                              0,
                                              Math.min(100, Math.round(Number(e.target.value) || 0))
                                            );
                                            updateGradeEditDraft({ [cat.field]: nextVal });
                                          }}
                                          className="w-full min-h-[44px] text-center font-mono tabular-nums text-base font-bold text-blue-700 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                                        />
                                        <button
                                          type="button"
                                          aria-label={`Tambah ${cat.title}`}
                                          onClick={() =>
                                            updateGradeEditDraft({
                                              [cat.field]: Math.min(100, score + 1),
                                            })
                                          }
                                          className="min-w-[44px] min-h-[44px] rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer"
                                        >
                                          <Plus className="w-4 h-4" />
                                        </button>
                                      </div>

                                      <div className="grid grid-cols-5 gap-1.5">
                                        {QUICK_SCORE_PRESETS.map((preset) => (
                                          <button
                                            key={preset}
                                            type="button"
                                            onClick={() => updateGradeEditDraft({ [cat.field]: preset })}
                                            className={`min-h-[36px] rounded-lg text-xs font-mono tabular-nums font-bold transition-colors cursor-pointer ${
                                              score === preset
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'
                                            }`}
                                          >
                                            {preset}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              <div className="p-3.5 bg-white border border-emerald-200 rounded-xl flex items-center justify-between gap-3">
                                <div>
                                  <span className="text-[11px] text-slate-600 block">
                                    Rata-rata Terbaru (4 Kategori Sama Rata)
                                  </span>
                                  <span className="text-xs font-bold text-emerald-700">
                                    Predikat: {predikatEditNilai}
                                  </span>
                                </div>
                                <span className="text-2xl font-bold font-mono tabular-nums text-blue-700">
                                  {rataRataEditNilai}
                                </span>
                              </div>

                              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                                <button
                                  type="button"
                                  disabled={savingGradeEdit}
                                  onClick={cancelEditGrade}
                                  className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs cursor-pointer disabled:opacity-50"
                                >
                                  Batal
                                </button>
                                <button
                                  type="button"
                                  disabled={savingGradeEdit}
                                  onClick={handleSaveEditedGrades}
                                  className="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                                >
                                  <Save className="w-4 h-4" />
                                  <span>
                                    {savingGradeEdit
                                      ? 'Menyimpan Perubahan...'
                                      : 'Simpan Perubahan Nilai'}
                                  </span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        canInputGradeThisStage && (
                          <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-4">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                                <Award className="w-4 h-4 text-blue-600 shrink-0" />
                                <span>Apakah nilai PKL sudah muncul?</span>
                              </div>
                              <p className="text-[11px] text-slate-500">
                                {activeStageNum === 5
                                  ? 'Wajib dijawab pada Monitoring ke-4. Jika belum muncul, nilai dapat menyusul pada Monitoring ke-5, ke-6, atau Penarikan.'
                                  : `Nilai PKL belum tercatat pada tahap sebelumnya. Pilih "Ya" apabila nilai DUDI sudah keluar pada ${getStageValueByNumber(activeStageNum)}.`}
                              </p>

                              <div className="grid grid-cols-2 gap-2.5 pt-1">
                                <button
                                  type="button"
                                  onClick={() => updateActiveDraft({ nilaiPklMuncul: false })}
                                  className={`min-h-[44px] px-4 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                                    activeDraft.nilaiPklMuncul === false
                                      ? 'border-slate-800 bg-slate-800 text-white'
                                      : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'
                                  }`}
                                >
                                  Belum Muncul
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateActiveDraft({ nilaiPklMuncul: true })}
                                  className={`min-h-[44px] px-4 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                                    activeDraft.nilaiPklMuncul === true
                                      ? 'border-blue-600 bg-blue-600 text-white'
                                      : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'
                                  }`}
                                >
                                  Ya, Sudah Muncul
                                </button>
                              </div>
                            </div>

                            {/* Mobile-First Ergonomic 4 Grade Inputs (No Sliders) */}
                            {showGradeInputs && (
                              <div className="space-y-3 pt-3 border-t border-slate-100 animate-in fade-in duration-150">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-bold text-slate-900">
                                    Input 4 Kategori Nilai PKL (Bobot Sama 25%)
                                  </span>
                                  <span className="text-[11px] text-slate-500">Skala 0 – 100</span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {GRADE_CATEGORIES.map((cat) => {
                                    const score = activeDraft[cat.field];
                                    return (
                                      <div
                                        key={cat.field}
                                        className="p-3.5 bg-slate-50/80 border border-slate-200 rounded-xl space-y-2.5"
                                      >
                                        <div>
                                          <span className="text-xs font-bold text-slate-900 block">
                                            {cat.title}
                                          </span>
                                          <span className="text-[11px] text-slate-500 leading-snug block">
                                            {cat.subtitle}
                                          </span>
                                        </div>

                                        {/* Stepper + Numeric Input (44px+ touch targets) */}
                                        <div className="flex items-center gap-2">
                                          <button
                                            type="button"
                                            aria-label={`Kurangi nilai ${cat.title}`}
                                            onClick={() =>
                                              updateActiveDraft({
                                                [cat.field]: Math.max(0, score - 1),
                                              })
                                            }
                                            className="min-w-[44px] min-h-[44px] rounded-xl border border-slate-300 bg-white hover:bg-slate-100 active:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer"
                                          >
                                            <Minus className="w-4 h-4" />
                                          </button>
                                          <input
                                            type="number"
                                            inputMode="numeric"
                                            min={0}
                                            max={100}
                                            value={score}
                                            onChange={(e) => {
                                              const nextVal = Math.max(
                                                0,
                                                Math.min(100, Math.round(Number(e.target.value) || 0))
                                              );
                                              updateActiveDraft({ [cat.field]: nextVal });
                                            }}
                                            className="w-full min-h-[44px] text-center font-mono tabular-nums text-base font-bold text-blue-700 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                                          />
                                          <button
                                            type="button"
                                            aria-label={`Tambah nilai ${cat.title}`}
                                            onClick={() =>
                                              updateActiveDraft({
                                                [cat.field]: Math.min(100, score + 1),
                                              })
                                            }
                                            className="min-w-[44px] min-h-[44px] rounded-xl border border-slate-300 bg-white hover:bg-slate-100 active:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer"
                                          >
                                            <Plus className="w-4 h-4" />
                                          </button>
                                        </div>

                                        {/* Quick Tap Score Presets */}
                                        <div className="grid grid-cols-5 gap-1.5">
                                          {QUICK_SCORE_PRESETS.map((preset) => (
                                            <button
                                              key={preset}
                                              type="button"
                                              onClick={() => updateActiveDraft({ [cat.field]: preset })}
                                              className={`min-h-[36px] rounded-lg text-xs font-mono tabular-nums font-bold transition-colors cursor-pointer ${
                                                score === preset
                                                  ? 'bg-blue-600 text-white'
                                                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                                              }`}
                                            >
                                              {preset}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>

                                <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between gap-3">
                                  <div>
                                    <span className="text-[11px] text-slate-600 block">
                                      Rata-rata Nilai PKL (4 Kategori Sama Rata)
                                    </span>
                                    <span className="text-xs font-bold text-emerald-700">
                                      Predikat: {predikatNilai}
                                    </span>
                                  </div>
                                  <span className="text-2xl font-bold font-mono tabular-nums text-blue-700">
                                    {rataRataNilai}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      )}

                      {/* Catatan Pembimbing */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                          Catatan Pembimbing / Evaluasi DUDI:
                        </label>
                        <textarea
                          rows={2}
                          value={activeDraft.catatanPerkembangan}
                          onChange={(e) =>
                            updateActiveDraft({ catatanPerkembangan: e.target.value })
                          }
                          placeholder="Tuliskan catatan supervisi, kondisi siswa, atau kendala lapangan..."
                          className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                      </div>

                      {formError && (
                        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-xs text-rose-700">
                          <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                          <span>{formError}</span>
                        </div>
                      )}

                      {/* Primary Save CTA */}
                      <div className="pt-1 flex justify-end">
                        <button
                          type="button"
                          onClick={handleSaveSupervision}
                          disabled={submitting}
                          className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] disabled:opacity-50"
                        >
                          {submitting ? (
                            <span>Menyimpan ke Spreadsheet...</span>
                          ) : (
                            <>
                              <Save className="w-4 h-4" />
                              <span>
                                {showGradeInputs
                                  ? 'Simpan Absensi & Nilai PKL Siswa Ini'
                                  : `Simpan Supervisi Tahap ${activeStageNum}`}
                              </span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
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
      </div>
    </div>
  );
};
