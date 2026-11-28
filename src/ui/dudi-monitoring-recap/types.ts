import type { Monitoring } from '../../core/types/schema';
import {
  ResolvedMonitoringStagePolicy,
  StageLogEntry,
  normalizeMonitoringVerificationStatus,
} from '../../core/utils/monitoringHelpers';

export type VerificationStatus = Monitoring['statusTahap'];
export type RecapViewMode = 'DUDI' | 'KELAS';
export type StatusFilterType =
  | 'ALL'
  | 'PENDING_KAKOMLI'
  | 'PENDING_HUBIN'
  | 'ALL_VERIFIED';

export interface StudentMatrixRow {
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

export interface RecapGroup {
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

export interface InspectTarget {
  student: StudentMatrixRow;
  log: StageLogEntry;
}

export interface ConfirmModalState {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText: string;
  variant: 'primary' | 'success' | 'danger';
  onConfirm: () => Promise<void>;
}

export function normalizeVerificationStatus(raw?: string): VerificationStatus {
  return normalizeMonitoringVerificationStatus(raw);
}
