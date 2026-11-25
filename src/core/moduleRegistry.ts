import type { LucideIcon } from 'lucide-react';
import {
  Users,
  BookOpen,
  Layers,
  Building2,
  FileText,
  FileCheck,
  Briefcase,
  UserCheck,
  Compass,
  Award,
} from 'lucide-react';
import type { ModuleMetadata } from './types/metadata';
import type { UserRole } from './types/schema';
import type { BaseRepository } from './BaseRepository';

import { SiswaMetadata } from '../modules/siswa.meta.ts';
import { JurusanMetadata } from '../modules/jurusan.meta.ts';
import { KelasMetadata } from '../modules/kelas.meta.ts';
import { DudiMetadata } from '../modules/dudi.meta.ts';
import { GuruMetadata } from '../modules/guru.meta.ts';
import { PengajuanMetadata } from '../modules/pengajuan.meta.ts';
import { PerizinanMetadata } from '../modules/perizinan.meta.ts';
import { SiswaPklMetadata } from '../modules/siswaPkl.meta.ts';
import { MonitoringMetadata } from '../modules/monitoring.meta.ts';
import { SertifikatMetadata } from '../modules/sertifikat.meta.ts';

import { SiswaService } from '../services/SiswaService';
import { JurusanService } from '../services/JurusanService';
import { KelasService } from '../services/KelasService';
import { DudiService } from '../services/DudiService';
import { GuruService } from '../services/GuruService';
import { PengajuanService } from '../services/PengajuanService';
import { PerizinanService } from '../services/PerizinanService';
import { SiswaPklService } from '../services/SiswaPklService';
import { MonitoringService } from '../services/MonitoringService';
import { SertifikatService } from '../services/SertifikatService';

export type ModuleGroup = 'operasional' | 'master';

export interface ModuleRegistryEntry<T extends { id: string } = any> {
  id: string;
  group: ModuleGroup;
  sidebarLabel: string;
  navbarTitle: string;
  icon: LucideIcon;
  metadata: ModuleMetadata<T>;
  getRepository: () => BaseRepository<T>;
  allowedRoles: string[];
  supportsStudentDocs?: boolean;
  docShortcutModule?: string;
  supportsMonitoringBundle?: boolean;
}

function buildAllowedRoles(meta: ModuleMetadata<any>, extraRoles: string[] = []): string[] {
  return Array.from(new Set(['SuperAdmin', ...(meta.allowedRoles || []), ...extraRoles]));
}

export const MODULE_REGISTRY: ModuleRegistryEntry[] = [
  // Group 1: Operasional PKL
  {
    id: 'pengajuan',
    group: 'operasional',
    sidebarLabel: 'Pengajuan PKL',
    navbarTitle: 'Verifikasi Pengajuan PKL',
    icon: FileText,
    metadata: PengajuanMetadata,
    getRepository: () => PengajuanService.getInstance(),
    allowedRoles: buildAllowedRoles(PengajuanMetadata, ['Siswa']),
    supportsStudentDocs: true,
  },
  {
    id: 'perizinan',
    group: 'operasional',
    sidebarLabel: 'Perizinan PKL',
    navbarTitle: 'Perizinan PKL',
    icon: FileCheck,
    metadata: PerizinanMetadata,
    getRepository: () => PerizinanService.getInstance(),
    allowedRoles: buildAllowedRoles(PerizinanMetadata),
    supportsStudentDocs: true,
  },
  {
    id: 'siswa_pkl',
    group: 'operasional',
    sidebarLabel: 'Data Siswa PKL',
    navbarTitle: 'Data Siswa PKL',
    icon: Briefcase,
    metadata: SiswaPklMetadata,
    getRepository: () => SiswaPklService.getInstance(),
    allowedRoles: buildAllowedRoles(SiswaPklMetadata),
    supportsStudentDocs: true,
  },
  {
    id: 'monitoring',
    group: 'operasional',
    sidebarLabel: 'Monitoring 8 Tahap',
    navbarTitle: 'Monitoring 8 Tahap Guru',
    icon: Compass,
    metadata: MonitoringMetadata,
    getRepository: () => MonitoringService.getInstance(),
    allowedRoles: buildAllowedRoles(MonitoringMetadata),
    supportsStudentDocs: true,
    supportsMonitoringBundle: true,
  },
  {
    id: 'sertifikat',
    group: 'operasional',
    sidebarLabel: 'Raport & Blangko',
    navbarTitle: 'Raport & Blangko Sertifikat',
    icon: Award,
    metadata: SertifikatMetadata,
    getRepository: () => SertifikatService.getInstance(),
    allowedRoles: buildAllowedRoles(SertifikatMetadata),
    supportsStudentDocs: true,
  },

  // Group 2: Master Data
  {
    id: 'siswa',
    group: 'master',
    sidebarLabel: 'Master Siswa',
    navbarTitle: 'Master Siswa',
    icon: Users,
    metadata: SiswaMetadata,
    getRepository: () => SiswaService.getInstance(),
    allowedRoles: buildAllowedRoles(SiswaMetadata),
    supportsStudentDocs: true,
  },
  {
    id: 'dudi',
    group: 'master',
    sidebarLabel: 'Mitra DUDI & Kuota',
    navbarTitle: 'Mitra DUDI & Kuota',
    icon: Building2,
    metadata: DudiMetadata,
    getRepository: () => DudiService.getInstance(),
    allowedRoles: buildAllowedRoles(DudiMetadata),
    docShortcutModule: 'doc_mou',
  },
  {
    id: 'guru',
    group: 'master',
    sidebarLabel: 'Guru Pendamping',
    navbarTitle: 'Guru Pendamping',
    icon: UserCheck,
    metadata: GuruMetadata,
    getRepository: () => GuruService.getInstance(),
    allowedRoles: buildAllowedRoles(GuruMetadata),
    docShortcutModule: 'doc_surat_tugas',
  },
  {
    id: 'jurusan',
    group: 'master',
    sidebarLabel: 'Kompetensi Keahlian',
    navbarTitle: 'Kompetensi Keahlian',
    icon: BookOpen,
    metadata: JurusanMetadata,
    getRepository: () => JurusanService.getInstance(),
    allowedRoles: buildAllowedRoles(JurusanMetadata),
  },
  {
    id: 'kelas',
    group: 'master',
    sidebarLabel: 'Kelas & Wali Kelas',
    navbarTitle: 'Kelas & Wali Kelas',
    icon: Layers,
    metadata: KelasMetadata,
    getRepository: () => KelasService.getInstance(),
    allowedRoles: buildAllowedRoles(KelasMetadata),
  },
];

export const MODULE_MAP: Record<string, ModuleRegistryEntry> = Object.fromEntries(
  MODULE_REGISTRY.map((entry) => [entry.id, entry])
);

export const CRUD_MODULE_NAMES: Record<string, string> = Object.fromEntries(
  MODULE_REGISTRY.map((entry) => [entry.id, entry.navbarTitle])
);

export function getModuleEntry(moduleId: string): ModuleRegistryEntry {
  return MODULE_MAP[moduleId] || MODULE_MAP.pengajuan;
}

export function getRepositoryForModule(moduleId: string): BaseRepository<any> {
  return getModuleEntry(moduleId).getRepository();
}

export function getSidebarModuleItems(group: ModuleGroup): ModuleRegistryEntry[] {
  return MODULE_REGISTRY.filter((entry) => entry.group === group);
}

export function getDocumentHubDependencies(): BaseRepository<any>[] {
  return ['dudi', 'guru', 'pengajuan', 'siswa_pkl', 'monitoring']
    .map((id) => MODULE_MAP[id]?.getRepository())
    .filter((repo): repo is BaseRepository<any> => Boolean(repo));
}

export const SPECIAL_MODULE_ALLOWED_ROLES: Record<string, UserRole[]> = {
  rekap_monitoring_dudi: [
    'SuperAdmin',
    'Hubin',
    'Pokja',
    'Kakomli',
    'Waka',
    'Kepsek',
    'GuruPendamping',
  ],
  workspace: ['SuperAdmin'],
  doc_paket_monitoring: [
    'SuperAdmin',
    'Hubin',
    'Pokja',
    'Kakomli',
    'Waka',
    'Kepsek',
    'GuruPendamping',
  ],
  doc_mou: ['SuperAdmin', 'Hubin', 'Pokja'],
  doc_surat_tugas: ['SuperAdmin', 'Hubin', 'Pokja', 'Waka', 'Kepsek', 'GuruPendamping'],
  doc_pengajuan: ['SuperAdmin', 'Hubin', 'Pokja', 'Kakomli', 'Waka', 'Kepsek'],
  doc_pengantaran: ['SuperAdmin', 'Hubin', 'Pokja', 'Kakomli', 'Waka', 'Kepsek', 'GuruPendamping'],
  doc_monitoring: ['SuperAdmin', 'Hubin', 'Pokja', 'Kakomli', 'Waka', 'Kepsek', 'GuruPendamping'],
  doc_penarikan: ['SuperAdmin', 'Hubin', 'Pokja', 'Kakomli', 'Waka', 'Kepsek', 'GuruPendamping'],
};

export function isModuleAllowedForRole(moduleId: string, userRole: UserRole): boolean {
  if (userRole === 'SuperAdmin') return true;
  if (moduleId in SPECIAL_MODULE_ALLOWED_ROLES) {
    return SPECIAL_MODULE_ALLOWED_ROLES[moduleId].includes(userRole);
  }
  const entry = MODULE_MAP[moduleId];
  if (!entry) return false;
  return entry.allowedRoles.includes(userRole);
}

export function isModuleReadOnlyForRole(moduleId: string, userRole: UserRole): boolean {
  if (userRole === 'SuperAdmin' || userRole === 'Hubin' || userRole === 'Pokja') {
    return false;
  }
  if (userRole === 'Kepsek' || userRole === 'Waka') {
    return true;
  }
  if (userRole === 'Kakomli') {
    return moduleId !== 'pengajuan';
  }
  if (userRole === 'GuruPendamping') {
    return moduleId === 'siswa_pkl';
  }
  return true;
}

export function getDefaultModuleForRole(userRole: UserRole): string {
  if (userRole === 'Kepsek' || userRole === 'Waka') {
    return 'rekap_monitoring_dudi';
  }
  if (userRole === 'Kakomli') {
    return 'pengajuan';
  }
  if (userRole === 'GuruPendamping') {
    return 'monitoring';
  }
  return 'pengajuan';
}

