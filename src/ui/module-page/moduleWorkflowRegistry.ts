import {
  ArrowRightLeft,
  Calendar,
  CheckCircle2,
  FileCheck,
  MessageCircle,
  Printer,
  Send,
  XCircle,
} from 'lucide-react';
import { Dudi, Guru, Jurusan, UserRole } from '../../core/types/schema';
import {
  getTodayWibIsoDate,
} from '../../core/utils/dateHelpers';
import {
  calculateEqualWeightedAverage,
  getPredikatFromScore,
} from '../../core/utils/monitoringHelpers';
import { normalizeRelationText } from '../../core/utils/relationHelpers';
import { DudiService } from '../../services/DudiService';
import { GuruService } from '../../services/GuruService';
import { JurusanService } from '../../services/JurusanService';
import { PengajuanService } from '../../services/PengajuanService';
import { composePerizinanWaMessage, PerizinanWaModalState } from './PerizinanWaModal';

export interface ModuleRowActionDef {
  name: string;
  label: string;
  icon: any;
  color: string;
}

export interface ModuleConfirmConfig {
  isOpen: boolean;
  title: string;
  description: string;
  variant: 'primary' | 'danger' | 'success';
  confirmText: string;
  onConfirm: () => Promise<void>;
}

const RELATIONAL_MODULE_IDS = new Set([
  'dudi',
  'guru',
  'siswa_pkl',
  'jurusan',
  'kelas',
  'siswa',
]);

const GRADE_MODULE_IDS = new Set(['monitoring', 'sertifikat']);
const SCORE_KEYS = [
  'nilaiK3lh',
  'nilaiSoftskill',
  'nilaiKompetensiTeknis',
  'nilaiAlurBisnis',
] as const;

export function moduleSupportsRelationSync(moduleId: string): boolean {
  return RELATIONAL_MODULE_IDS.has(moduleId);
}

export function moduleSupportsMonitoringRecap(moduleId: string): boolean {
  return moduleId === 'monitoring' || moduleId === 'jurusan';
}

export function moduleSupportsBulkApprove(moduleId: string, userRole: UserRole): boolean {
  return (
    moduleId === 'pengajuan' &&
    (userRole === 'Kakomli' || userRole === 'Hubin' || userRole === 'SuperAdmin')
  );
}

export function getCustomRowActionsForModule(
  moduleId: string,
  userRole: UserRole,
  hasDocsCallback: boolean
): ModuleRowActionDef[] {
  const actions: ModuleRowActionDef[] = [];
  const isHubinOrSuper = userRole === 'Hubin' || userRole === 'SuperAdmin';
  const isKakomliOrAdmin = userRole === 'Kakomli' || isHubinOrSuper;

  switch (moduleId) {
    case 'pengajuan':
      if (isKakomliOrAdmin) {
        actions.push(
          {
            name: 'approve_kakomli',
            label: 'ACC Kakomli',
            icon: CheckCircle2,
            color: 'hover:text-emerald-600 hover:bg-emerald-50 text-emerald-600',
          },
          {
            name: 'reject_kakomli',
            label: 'Tolak',
            icon: XCircle,
            color: 'hover:text-rose-600 hover:bg-rose-50 text-rose-500',
          },
          {
            name: 'create_perizinan',
            label: 'Buat Berkas Perizinan',
            icon: FileCheck,
            color: 'hover:text-indigo-600 hover:bg-indigo-50 text-indigo-600',
          }
        );
      }
      if (isHubinOrSuper) {
        actions.push({
          name: 'schedule_hubin',
          label: 'Jadwalkan',
          icon: Calendar,
          color: 'hover:text-blue-600 hover:bg-blue-50 text-blue-600',
        });
      }
      break;

    case 'perizinan':
      if (isKakomliOrAdmin) {
        actions.push(
          {
            name: 'send_wa_dudi',
            label: 'Kirim WA & PDF',
            icon: MessageCircle,
            color: 'hover:text-emerald-700 hover:bg-emerald-50 text-emerald-600',
          },
          {
            name: 'promote_to_pkl',
            label: 'Terbitkan ke Data Siswa PKL',
            icon: Send,
            color: 'hover:text-blue-600 hover:bg-blue-50 text-blue-600',
          }
        );
      }
      if (hasDocsCallback) {
        actions.push({
          name: 'print_docs',
          label: 'Cetak Surat',
          icon: Printer,
          color: 'hover:text-amber-600 hover:bg-amber-50 text-amber-600',
        });
      }
      break;

    case 'siswa_pkl':
    case 'sertifikat':
      if (moduleId === 'siswa_pkl' && isHubinOrSuper) {
        actions.push({
          name: 'transfer_dudi',
          label: 'Pindah DUDI',
          icon: ArrowRightLeft,
          color: 'hover:text-orange-600 hover:bg-orange-50 text-orange-600',
        });
      }
      actions.push({
        name: 'print_docs',
        label: 'Cetak Dokumen',
        icon: Printer,
        color: 'hover:text-amber-600 hover:bg-amber-50 text-amber-600',
      });
      break;
  }

  return actions;
}

export function normalizeGradePayloadForModule<T>(moduleId: string, values: T): any {
  const nextValues: any = { ...values };
  if (!GRADE_MODULE_IDS.has(moduleId)) return nextValues;

  const enteredScores = SCORE_KEYS.map((k) => nextValues[k])
    .filter((v) => v !== '' && v !== null && v !== undefined && !isNaN(Number(v)))
    .map((v) => Math.min(100, Math.max(0, Number(v))));

  if (enteredScores.length === 4) {
    const avg = calculateEqualWeightedAverage(
      enteredScores[0],
      enteredScores[1],
      enteredScores[2],
      enteredScores[3]
    );
    nextValues.nilaiRataRata = avg;
    if (moduleId === 'monitoring') {
      nextValues.nilaiPklMuncul = true;
      nextValues.nilaiDudiTerkumpul = true;
    } else {
      nextValues.predikat = getPredikatFromScore(avg);
    }
  } else if (enteredScores.length > 0 && enteredScores.some((s) => s > 0)) {
    const avg =
      Math.round(
        (enteredScores.reduce((acc, s) => acc + s, 0) / enteredScores.length) * 10
      ) / 10;
    nextValues.nilaiRataRata = avg;
    if (moduleId === 'monitoring') {
      nextValues.nilaiPklMuncul = true;
      nextValues.nilaiDudiTerkumpul = true;
    } else if (!nextValues.predikat || avg > 0) {
      nextValues.predikat = getPredikatFromScore(avg);
    }
  } else if (moduleId === 'sertifikat') {
    const rataRata = Number(nextValues.nilaiRataRata ?? 0) || 0;
    if (rataRata > 0) {
      const rounded = Math.round(rataRata * 10) / 10;
      nextValues.nilaiRataRata = rounded;
      if (!nextValues.predikat) {
        nextValues.predikat = getPredikatFromScore(rounded);
      }
    }
  }

  return nextValues;
}

export function extractGradeSyncScores(nextValues: any) {
  return {
    nilaiK3lh: Number(nextValues.nilaiK3lh || 0),
    nilaiSoftskill: Number(nextValues.nilaiSoftskill || 0),
    nilaiKompetensiTeknis: Number(nextValues.nilaiKompetensiTeknis || 0),
    nilaiAlurBisnis: Number(nextValues.nilaiAlurBisnis || 0),
  };
}

export function hasPositiveModuleGrades(moduleId: string, nextValues: any): boolean {
  if (moduleId !== 'sertifikat') return false;
  return SCORE_KEYS.some((k) => Number(nextValues[k] || 0) > 0);
}

export function hasChangedModuleGrades(
  moduleId: string,
  prevRow: any,
  nextValues: any
): boolean {
  if (moduleId !== 'sertifikat') return false;
  return SCORE_KEYS.some((k) => Number(nextValues[k] ?? 0) !== Number(prevRow?.[k] ?? 0));
}

export function applyModulePreSubmitTransforms(
  moduleId: string,
  values: any,
  prevRow?: any
): {
  nextValues: any;
  shouldSyncSertifikatGrades: boolean;
} {
  const nextValues = normalizeGradePayloadForModule(moduleId, values);
  const shouldSyncSertifikatGrades = prevRow
    ? hasChangedModuleGrades(moduleId, prevRow, nextValues)
    : hasPositiveModuleGrades(moduleId, nextValues);

  if (
    shouldSyncSertifikatGrades &&
    (!nextValues.statusRaport || nextValues.statusRaport === 'Belum Diproses')
  ) {
    nextValues.statusRaport = 'Siap Cetak';
  }

  if (moduleId === 'siswa_pkl' && prevRow) {
    const oldGuru = String(prevRow.guruPendamping || '').trim();
    const newGuru = String(nextValues.guruPendamping || '').trim();
    if (oldGuru && newGuru && normalizeRelationText(oldGuru) !== normalizeRelationText(newGuru)) {
      const handoverLine = `[${getTodayWibIsoDate()}] Alih pendamping: ${oldGuru} -> ${newGuru}`;
      const prevNote = String(nextValues.catatanPenempatan || '').trim();
      if (!prevNote.includes(handoverLine)) {
        nextValues.catatanPenempatan = prevNote ? `${prevNote}\n${handoverLine}` : handoverLine;
      }
    }
  }

  return { nextValues, shouldSyncSertifikatGrades };
}

export async function loadModuleGuruAndDudiOptions(): Promise<{
  gurus: Guru[];
  dudis: Dudi[];
}> {
  const guruSvc = GuruService.getInstance();
  const dudiSvc = DudiService.getInstance();
  const [gurus, dudis] = await Promise.all([
    guruSvc
      .reloadFromSpreadsheet()
      .then(() => guruSvc.getAll())
      .catch(() => guruSvc.getAll())
      .catch(() => [] as Guru[]),
    dudiSvc
      .reloadFromSpreadsheet()
      .then(() => dudiSvc.getAll())
      .catch(() => dudiSvc.getAll())
      .catch(() => [] as Dudi[]),
  ]);
  return { gurus, dudis };
}

export async function buildPerizinanWaModalState(
  item: any
): Promise<PerizinanWaModalState> {
  const [dudiList, pengajuanList, jurusanList] = await Promise.all([
    DudiService.getInstance().getAll().catch(() => [] as Dudi[]),
    PengajuanService.getInstance().getAll().catch(() => [] as any[]),
    JurusanService.getInstance().getAll().catch(() => [] as Jurusan[]),
  ]);

  const targetDudiNorm = String(item.dudiTujuan || '').trim().toLowerCase();
  const matchedDudi =
    (item.idDudi ? dudiList.find((d) => d.id === item.idDudi) : undefined) ||
    dudiList.find((d) => d.namaDudi.trim().toLowerCase() === targetDudiNorm);
  const matchedPengajuan = pengajuanList.find(
    (p: any) =>
      (item.noPengajuan && p.noPengajuan === item.noPengajuan) ||
      (item.nis && p.nis === item.nis)
  );

  const targetJurRaw = String(item.jurusan || '').trim().toLowerCase();
  const matchedJurusan = jurusanList.find((j) => {
    const k = String(j.kode || '').trim().toLowerCase();
    const n = String(j.nama || '').trim().toLowerCase();
    return (
      targetJurRaw === k ||
      targetJurRaw === n ||
      (k.length >= 2 && targetJurRaw.includes(k)) ||
      (n.length >= 4 && targetJurRaw.includes(n))
    );
  });

  const rawDudiPhone =
    matchedDudi?.noTelpDudi ||
    matchedDudi?.kontakPic ||
    matchedPengajuan?.noTelpDudi ||
    '';
  const cleanDudiPhone = rawDudiPhone === '-' ? '' : rawDudiPhone;
  const rawKakomliPhone = matchedJurusan?.kontakWA || '';
  const cleanKakomliPhone = rawKakomliPhone === '-' ? '' : rawKakomliPhone;
  const kakomliName = matchedJurusan?.namaKakomli || 'Ketua Kompetensi Keahlian';

  const alamat =
    (item.alamatDudi && item.alamatDudi !== '-' ? item.alamatDudi : '') ||
    matchedDudi?.alamat ||
    matchedPengajuan?.alamatDudi ||
    '-';
  const existingPdfUrl =
    item.linkSuratPdf && item.linkSuratPdf !== '-' ? String(item.linkSuratPdf).trim() : '';
  const dudiName = item.dudiTujuan || matchedDudi?.namaDudi || 'Mitra DUDI';

  const message = composePerizinanWaMessage({
    row: item,
    recipientType: 'dudi',
    dudiName,
    kakomliName,
    alamat,
    pdfUrl: existingPdfUrl,
  });

  return {
    isOpen: true,
    row: item,
    recipientType: 'dudi',
    dudiName,
    picName: matchedDudi?.namaPic || matchedDudi?.namaPemimpin || 'PIC / HRD Industri',
    dudiPhone: cleanDudiPhone,
    kakomliName,
    kakomliPhone: cleanKakomliPhone,
    phoneInput: cleanDudiPhone,
    alamat,
    pdfUrl: existingPdfUrl,
    generatingPdf: false,
    message,
  };
}
