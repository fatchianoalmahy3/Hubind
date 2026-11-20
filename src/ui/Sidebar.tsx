import React, { useState } from 'react';
import {
  Layers,
  FileText,
  UserCheck,
  Compass,
  FileCode2,
  Printer,
  ChevronRight,
  ChevronDown,
  FolderSync,
  Database,
  FileSignature,
  Send,
  LogOut,
  FolderOpen,
  X,
  KeyRound,
} from 'lucide-react';
import { UserRole } from '../core/types/schema';
import { getSidebarModuleItems } from '../core/moduleRegistry';

interface SidebarProps {
  currentModule: string;
  onSelectModule: (id: string) => void;
  userRole: UserRole;
  onOpenSimulator: () => void;
  onOpenDocs: () => void;
  onOpenGas: () => void;
  onOpenAutoGenerate: () => void;
  onOpenWizard: () => void;
  onOpenSheetConfig?: () => void;
  onOpenTemplateManager?: () => void;
  onOpenAccountManager?: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentModule,
  onSelectModule,
  userRole,
  onOpenDocs,
  onOpenGas,
  onOpenSheetConfig,
  onOpenTemplateManager,
  onOpenAccountManager,
  isOpenMobile,
  onCloseMobile,
}) => {
  const [isDocsGroupOpen, setIsDocsGroupOpen] = useState(true);

  // Group 1: Operasional PKL (Derived from central moduleRegistry)
  const operasionalItems = getSidebarModuleItems('operasional').map((item) => ({
    id: item.id,
    label: item.sidebarLabel,
    icon: item.icon,
    allowed: item.allowedRoles,
  }));

  // Group 2: Dokumen (Grouped & Collapsible)
  const dokumenItems = [
    {
      id: 'doc_paket_monitoring',
      label: 'Paket 1-Langkah',
      icon: Layers,
      allowed: ['SuperAdmin', 'Hubin', 'Kakomli', 'GuruPendamping'],
    },
    {
      id: 'doc_mou',
      label: 'MOU DUDI',
      icon: FileSignature,
      allowed: ['SuperAdmin', 'Hubin', 'Kakomli'],
    },
    {
      id: 'doc_surat_tugas',
      label: 'Surat Tugas',
      icon: UserCheck,
      allowed: ['SuperAdmin', 'Hubin', 'Kakomli', 'GuruPendamping'],
    },
    {
      id: 'doc_pengajuan',
      label: 'Pengajuan',
      icon: FileText,
      allowed: ['SuperAdmin', 'Hubin', 'Kakomli', 'GuruPendamping'],
    },
    {
      id: 'doc_pengantaran',
      label: 'Pengantaran',
      icon: Send,
      allowed: ['SuperAdmin', 'Hubin', 'Kakomli', 'GuruPendamping'],
    },
    {
      id: 'doc_monitoring',
      label: 'Monitoring',
      icon: Compass,
      allowed: ['SuperAdmin', 'Hubin', 'Kakomli', 'GuruPendamping'],
    },
    {
      id: 'doc_penarikan',
      label: 'Penarikan',
      icon: LogOut,
      allowed: ['SuperAdmin', 'Hubin', 'Kakomli', 'GuruPendamping'],
    },
  ];

  // Group 3: Master Data (Derived from central moduleRegistry)
  const masterDataItems = getSidebarModuleItems('master').map((item) => ({
    id: item.id,
    label: item.sidebarLabel,
    icon: item.icon,
    allowed: item.allowedRoles,
  }));

  const isDocModuleActive = currentModule.startsWith('doc_');

  return (
    <>
      {/* Mobile overlay */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-[2px] z-40 lg:hidden"
        />
      )}

      <aside
        className={`fixed lg:static top-0 bottom-0 left-0 z-50 lg:z-20 w-64 h-full bg-slate-900 text-slate-300 flex flex-col justify-between transition-transform duration-200 border-r border-slate-800 shrink-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="overflow-y-auto flex-1 py-4 px-3 space-y-5">
          {/* Brand Header */}
          <div className="px-2.5 py-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-blue-600 text-white font-extrabold flex items-center justify-center text-xs shrink-0">
                P2
              </div>
              <div className="min-w-0">
                <div className="font-bold text-white text-sm tracking-tight truncate">
                  SMK PGRI 2 Ponorogo
                </div>
                <div className="text-[11px] text-slate-400 font-medium truncate">
                  Pokja Hubungan Industri
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onCloseMobile}
              className="w-9 h-9 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center lg:hidden shrink-0 cursor-pointer"
              aria-label="Tutup menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Group 1: Operasional PKL */}
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 px-3 pb-1">
              Operasional PKL
            </div>
            {operasionalItems.map((item) => {
              const isAllowed = item.allowed.includes(userRole);
              const isActive = currentModule === item.id;
              const Icon = item.icon;
              if (!isAllowed) return null;

              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => {
                    onSelectModule(item.id);
                    onCloseMobile();
                  }}
                  className={`w-full min-h-10 flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    isActive
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Group 2: Dokumen (Collapsible Accordion) */}
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => setIsDocsGroupOpen((prev) => !prev)}
              className={`w-full min-h-9 flex items-center justify-between px-3 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                isDocModuleActive
                  ? 'text-blue-300 bg-slate-800/60'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <span className="flex items-center gap-2">
                <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
                <span>Dokumen Resmi</span>
              </span>
              {isDocsGroupOpen ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              )}
            </button>

            {isDocsGroupOpen && (
              <div className="space-y-0.5 pl-3">
                {dokumenItems.map((item) => {
                  const isAllowed = item.allowed.includes(userRole);
                  const isActive = currentModule === item.id;
                  const Icon = item.icon;
                  if (!isAllowed) return null;

                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => {
                        onSelectModule(item.id);
                        onCloseMobile();
                      }}
                      className={`w-full min-h-9 flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                        isActive
                          ? 'bg-blue-600 text-white font-semibold'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Group 3: Master Data */}
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 px-3 pb-1">
              Master Data
            </div>
            {masterDataItems.map((item) => {
              const isAllowed = item.allowed.includes(userRole);
              const isActive = currentModule === item.id;
              const Icon = item.icon;
              if (!isAllowed) return null;

              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => {
                    onSelectModule(item.id);
                    onCloseMobile();
                  }}
                  className={`w-full min-h-10 flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    isActive
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Group 4: Sistem & Server (Strictly SuperAdmin Only) */}
          {userRole === 'SuperAdmin' && (
            <div className="space-y-1 pt-2 border-t border-slate-800/80">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 px-3 py-1">
                Sistem &amp; Server
              </div>

              <button
                type="button"
                onClick={() => {
                  onSelectModule('workspace');
                  onCloseMobile();
                }}
                className={`w-full min-h-10 flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  currentModule === 'workspace'
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                }`}
              >
                <FolderSync
                  className={`w-4 h-4 shrink-0 ${
                    currentModule === 'workspace' ? 'text-white' : 'text-slate-400'
                  }`}
                />
                <span className="truncate">Pusat Berkas &amp; Server</span>
              </button>

              {onOpenSheetConfig && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenSheetConfig();
                    onCloseMobile();
                  }}
                  className="w-full min-h-9 flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <Database className="w-4 h-4 text-slate-500 shrink-0" />
                  <span className="truncate">Konfigurasi Server</span>
                </button>
              )}

              {onOpenTemplateManager && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenTemplateManager();
                    onCloseMobile();
                  }}
                  className="w-full min-h-9 flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <FileText className="w-4 h-4 text-slate-500 shrink-0" />
                  <span className="truncate">Template Dokumen</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  onOpenDocs();
                  onCloseMobile();
                }}
                className="w-full min-h-9 flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <Printer className="w-4 h-4 text-slate-500 shrink-0" />
                <span className="truncate">Cetak Dokumen Massal</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onOpenGas();
                  onCloseMobile();
                }}
                className="w-full min-h-9 flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <FileCode2 className="w-4 h-4 text-slate-500 shrink-0" />
                <span className="truncate">Integrasi API Server</span>
              </button>

              {onOpenAccountManager && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenAccountManager();
                    onCloseMobile();
                  }}
                  className="w-full min-h-9 flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <KeyRound className="w-4 h-4 text-slate-500 shrink-0" />
                  <span className="truncate">Kelola Akun &amp; Password</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer Role Summary */}
        <div className="p-3 border-t border-slate-800 shrink-0">
          <div className="px-3 py-2 bg-slate-800/60 rounded-lg flex items-center justify-between text-xs text-slate-400">
            <span>Peran Aktif</span>
            <span className="font-semibold text-white">{userRole}</span>
          </div>
        </div>
      </aside>
    </>
  );
};
