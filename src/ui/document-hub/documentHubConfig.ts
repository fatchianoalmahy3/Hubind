import {
  FileText,
  UserCheck,
  Send,
  Compass,
  LogOut,
  FileSignature,
  Layers,
} from 'lucide-react';
import { Dudi, Guru, KondisiBengkelCheck, Pengajuan, PenempatanPKL, Siswa } from '../../core/types/schema';
import { getCanonicalNisDigits, normalizeRelationText } from '../../core/utils/relationHelpers';
import { BundleStudentItem } from '../DocumentPrintTemplates';

export type DocumentHubKey =
  | 'doc_paket_monitoring'
  | 'doc_mou'
  | 'doc_surat_tugas'
  | 'doc_pengajuan'
  | 'doc_pengantaran'
  | 'doc_monitoring'
  | 'doc_penarikan';

export interface DocMetaEntry {
  label: string;
  shortTitle: string;
  description: string;
  sourceLabel: string;
  icon: any;
  defaultNoSurat: string;
}

export const DOC_META: Record<DocumentHubKey, DocMetaEntry> = {
  doc_paket_monitoring: {
    label: 'Paket Cetak Monitoring (1-Langkah)',
    shortTitle: 'Paket 1-Langkah',
    description:
      'Cetak sekaligus Surat Tugas (07.08), Lembar Monitoring (07.01), dan Lembar Penilaian Kurmer (07.09, mulai Mon 4) berurutan per DUDI',
    sourceLabel: 'Penempatan, DUDI, Guru & Monitoring 8 Tahap',
    icon: Layers,
    defaultNoSurat: `191.13 / E / Yay.II / PI / XI / ${new Date().getFullYear()}`,
  },
  doc_mou: {
    label: 'Naskah MoU DUDI',
    shortTitle: 'MOU',
    description: 'Nota Kesepahaman kerjasama penyelenggaraan PKL dengan Dunia Usaha / Industri',
    sourceLabel: 'Database Mitra DUDI',
    icon: FileSignature,
    defaultNoSurat: `421.5 / ___ / MoU.PKL / SMK.PGRI2 / ${new Date().getFullYear()}`,
  },
  doc_surat_tugas: {
    label: 'Surat Tugas Guru Pendamping',
    shortTitle: 'Surat Tugas',
    description: 'Surat perintah tugas resmi Format 07.08 per DUDI binaan sesuai tahap monitoring',
    sourceLabel: 'Database Guru Pendamping & Siswa PKL',
    icon: UserCheck,
    defaultNoSurat: `191.13 / E / Yay.II / PI / XI / ${new Date().getFullYear()}`,
  },
  doc_pengajuan: {
    label: 'Dokumen Pengajuan PKL',
    shortTitle: 'Pengajuan',
    description: 'Lembar permohonan rekomendasi penempatan PKL siswa ke Kakomli & Hubin',
    sourceLabel: 'Database Pengajuan PKL',
    icon: FileText,
    defaultNoSurat: `421.5 / ___ / REG.PKL / SMK.PGRI2 / ${new Date().getFullYear()}`,
  },
  doc_pengantaran: {
    label: 'Surat & Berita Acara Pengantaran',
    shortTitle: 'Pengantaran',
    description: 'Surat pengantar resmi dan berita acara serah terima siswa ke DUDI',
    sourceLabel: 'Database Penempatan Siswa PKL',
    icon: Send,
    defaultNoSurat: `421.5 / ___ / ANTAR.PKL / SMK.PGRI2 / ${new Date().getFullYear()}`,
  },
  doc_monitoring: {
    label: 'Lembar Monitoring Lapangan (07.01)',
    shortTitle: 'Monitoring',
    description: 'Formulir supervisi Format 07.01 berisi presensi kelompok & kondisi bengkel DUDI',
    sourceLabel: 'Database Penempatan & Monitoring PKL',
    icon: Compass,
    defaultNoSurat: `421.5 / ___ / MON.PKL / SMK.PGRI2 / ${new Date().getFullYear()}`,
  },
  doc_penarikan: {
    label: 'Surat & Berita Acara Penarikan',
    shortTitle: 'Penarikan',
    description: 'Surat tugas penjemputan siswa purnatugas PKL & ucapan terima kasih mitra',
    sourceLabel: 'Database Penempatan Siswa PKL',
    icon: LogOut,
    defaultNoSurat: `421.5 / ___ / TARIK.PKL / SMK.PGRI2 / ${new Date().getFullYear()}`,
  },
};

export interface DudiBundleItem {
  bundleKey: string;
  guruId: string;
  guruNama: string;
  guruNip: string;
  guruJabatan: string;
  dudiKey: string;
  namaDudi: string;
  alamatDudi: string;
  pemimpinDudi: string;
  noTelpDudi: string;
  hariKerja?: string;
  jamKerja?: string;
  kompetensiList?: string[];
  keadaanBengkel?: KondisiBengkelCheck;
  catatanLain?: string;
  students: BundleStudentItem[];
  isLocked: boolean;
  pendingStudents: string[];
}

export interface BundlePrintPage {
  id: string;
  kind: 'surat_tugas' | 'monitoring' | 'nilai';
  dudiName: string;
  guruName: string;
  subtitle: string;
  bundle: DudiBundleItem;
  student?: BundleStudentItem;
}

export interface FilteredDocItem {
  id: string;
  title: string;
  badge: string;
  subtitle: string;
  raw: any;
}

export interface DocFilterMeta {
  jurusanOptions: string[];
  statusOptions: string[];
  subOptions: string[];
  jurusanLabel: string;
  statusLabel: string;
  subLabel: string;
}

export interface SuratTugasDudiGroup {
  key: string;
  namaDudi: string;
  alamatDudi: string;
  pemimpinDudi: string;
  students: PenempatanPKL[];
  isLocked: boolean;
  pendingStudents: string[];
}

export interface SuratTugasAuditResult {
  dudiGroups: SuratTugasDudiGroup[];
  unlockedGroups: SuratTugasDudiGroup[];
  lockedGroups: SuratTugasDudiGroup[];
  isPrintBlocked: boolean;
  blockReason: string;
}

export interface BatchSuratTugasPage {
  id: string;
  guru: Guru;
  namaDudi: string;
  alamatDudi: string;
  pemimpinDudi: string;
  subtitle: string;
  itemId: string;
}

export function extractGoogleDocId(urlOrId?: string): string {
  const s = String(urlOrId || '').trim();
  if (!s) return '';
  const m = s.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m && m[1] ? m[1] : s;
}

export function dedupePlacementsByCanonicalNis(
  rows: PenempatanPKL[],
  siswaByNis: Map<string, Siswa>
): PenempatanPKL[] {
  const rankStatus = (st?: string) => {
    const n = normalizeRelationText(st);
    if (n === 'sedang berjalan') return 3;
    if (n === 'terjadwal') return 2;
    if (n === 'selesai pkl') return 1;
    return 0;
  };
  const deduped = new Map<string, PenempatanPKL>();
  for (const row of rows) {
    const nisKey = getCanonicalNisDigits(row.nis);
    const siswaRec = nisKey ? siswaByNis.get(nisKey) : undefined;
    const resolvedRow: PenempatanPKL = siswaRec
      ? {
          ...row,
          nis: siswaRec.nis || row.nis,
          namaSiswa: siswaRec.nama || row.namaSiswa,
        }
      : row;
    const key = nisKey
      ? `nis:${nisKey}`
      : `name:${normalizeRelationText(resolvedRow.namaSiswa)}|${resolvedRow.id}`;
    const existing = deduped.get(key);
    if (
      !existing ||
      rankStatus(resolvedRow.statusPenempatan) > rankStatus(existing.statusPenempatan)
    ) {
      deduped.set(key, resolvedRow);
    }
  }
  return Array.from(deduped.values());
}

export function resolveMapsLink(
  directLink: string | undefined,
  dudiId: string | undefined,
  dudiName: string | undefined,
  dudiList: Dudi[],
  pengajuanList: Pengajuan[]
): string {
  const cleanDirect = String(directLink || '').trim();
  if (cleanDirect && cleanDirect !== '-') return cleanDirect;

  const normName = normalizeRelationText(dudiName);
  const matchedDudi = dudiList.find(
    (d) =>
      (dudiId && d.id === dudiId) ||
      (normName && normalizeRelationText(d.namaDudi) === normName)
  );
  if (matchedDudi?.linkMaps && matchedDudi.linkMaps !== '-') {
    return matchedDudi.linkMaps;
  }

  const matchedReq = pengajuanList.find(
    (p) =>
      ((dudiId && p.idDudi === dudiId) ||
        (normName && normalizeRelationText(p.dudiTujuan) === normName)) &&
      p.linkMaps &&
      p.linkMaps !== '-'
  );
  return String(matchedReq?.linkMaps || '').trim();
}
