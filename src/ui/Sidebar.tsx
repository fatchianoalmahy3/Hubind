import React, { useEffect, useState } from 'react';
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
  ClipboardCheck,
  Briefcase,
  Settings,
} from 'lucide-react';
import { UserRole } from '../core/types/schema';
import { getSidebarModuleItems, isModuleAllowedForRole } from '../core/moduleRegistry';

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

type GroupKey = 'master' | 'operasional' | 'dokumen' | 'sistem';

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
  const [openGroups, setOpenGroups] = useState<Record<GroupKey, boolean>>({
    master: true,
    operasional: true,
    dokumen: false,
    sistem: false,
  });

  const toggleGroup = (key: GroupKey) => {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Group 1 (TOP): Master Data
  const masterDataItems = getSidebarModuleItems('master')
    .filter((item) => isModuleAllowedForRole(item.id, userRole))
    .map((item) => ({
      id: item.id,
      label: item.sidebarLabel,
      icon: item.icon,
    }));

  // Group 2: Operasional PKL + Rekap Monitoring Per DUDI
  const baseOperasional = getSidebarModuleItems('operasional').map((item) => ({
    id: item.id,
    label: item.sidebarLabel,
    icon: item.icon,
  }));

  const rekapDudiEntry = {
    id: 'rekap_monitoring_dudi',
    label: 'Rekap DUDI / Kelas',
    icon: ClipboardCheck,
  };

  const operasionalWithRecap: typeof baseOperasional = [];
  for (const item of baseOperasional) {
    operasionalWithRecap.push(item);
    if (item.id === 'monitoring') {
      operasionalWithRecap.push(rekapDudiEntry);
    }
  }
  const operasionalItems = operasionalWithRecap.filter((item) =>
    isModuleAllowedForRole(item.id, userRole)
  );

  // Group 3: Dokumen Resmi
  const dokumenItems = [
    { id: 'doc_paket_monitoring', label: 'Paket 1-Langkah', icon: Layers },
    { id: 'doc_mou', label: 'MOU DUDI', icon: FileSignature },
    { id: 'doc_surat_tugas', label: 'Surat Tugas', icon: UserCheck },
    { id: 'doc_pengajuan', label: 'Pengajuan', icon: FileText },
    { id: 'doc_pengantaran', label: 'Pengantaran', icon: Send },
    { id: 'doc_monitoring', label: 'Monitoring', icon: Compass },
    { id: 'doc_penarikan', label: 'Penarikan', icon: LogOut },
  ].filter((item) => isModuleAllowedForRole(item.id, userRole));

  const isMasterActive = masterDataItems.some((i) => i.id === currentModule);
  const isOperasionalActive = operasionalItems.some((i) => i.id === currentModule);
  const isDocModuleActive = currentModule.startsWith('doc_');
  const isSistemActive = currentModule === 'workspace';

  // Ensure the group containing the active module opens automatically
  useEffect(() => {
    setOpenGroups((prev) => {
      if (isMasterActive && !prev.master) return { ...prev, master: true };
      if (isOperasionalActive && !prev.operasional) return { ...prev, operasional: true };
      if (isDocModuleActive && !prev.dokumen) return { ...prev, dokumen: true };
      if (isSistemActive && !prev.sistem) return { ...prev, sistem: true };
      return prev;
    });
  }, [isMasterActive, isOperasionalActive, isDocModuleActive, isSistemActive]);

  const renderNavItem = (item: { id: string; label: string; icon: any }, compact = false) => {
    const isActive = currentModule === item.id;
    const Icon = item.icon;
    return (
      <button
        type="button"
        key={item.id}
        onClick={() => {
          onSelectModule(item.id);
          onCloseMobile();
        }}
        className={`w-full ${
          compact ? 'min-h-9 py-1.5' : 'min-h-10 py-2'
        } flex items-center gap-2.5 px-3 rounded-lg text-[13px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
          isActive
            ? 'bg-blue-600 text-white font-semibold'
            : compact
            ? 'text-slate-400 hover:text-white hover:bg-slate-800/80'
            : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
        }`}
      >
        <Icon
          className={`w-4 h-4 shrink-0 ${
            isActive ? 'text-white' : compact ? 'text-slate-500' : 'text-slate-400'
          }`}
        />
        <span className="truncate">{item.label}</span>
      </button>
    );
  };

  const renderGroupHeader = (
    groupKey: GroupKey,
    title: string,
    Icon: any,
    hasActiveChild: boolean
  ) => {
    const isOpen = openGroups[groupKey];
    return (
      <button
        type="button"
        onClick={() => toggleGroup(groupKey)}
        aria-expanded={isOpen}
        className={`w-full min-h-9 flex items-center justify-between px-3 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
          hasActiveChild
            ? 'text-blue-300 bg-slate-800/60'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
        }`}
      >
        <span className="flex items-center gap-2 min-w-0">
          <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="truncate">{title}</span>
        </span>
        {isOpen ? (
          <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        )}
      </button>
    );
  };

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
        <div className="overflow-y-auto flex-1 py-4 px-3 space-y-3">
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

          {/* Group 1 (TOP): Master Data (Hidden when role has 0 master items) */}
          {masterDataItems.length > 0 && (
            <div className="space-y-1">
              {renderGroupHeader('master', 'Master Data', Database, isMasterActive)}
              {openGroups.master && (
                <div className="space-y-0.5 pl-1">
                  {masterDataItems.map((item) => renderNavItem(item))}
                </div>
              )}
            </div>
          )}

          {/* Group 2: Operasional PKL */}
          {operasionalItems.length > 0 && (
            <div className="space-y-1">
              {renderGroupHeader('operasional', 'Operasional PKL', Briefcase, isOperasionalActive)}
              {openGroups.operasional && (
                <div className="space-y-0.5 pl-1">
                  {operasionalItems.map((item) => renderNavItem(item))}
                </div>
              )}
            </div>
          )}

          {/* Group 3: Dokumen Resmi */}
          {dokumenItems.length > 0 && (
            <div className="space-y-1">
              {renderGroupHeader('dokumen', 'Dokumen Resmi', FolderOpen, isDocModuleActive)}
              {openGroups.dokumen && (
                <div className="space-y-0.5 pl-2">
                  {dokumenItems.map((item) => renderNavItem(item, true))}
                </div>
              )}
            </div>
          )}

          {/* Group 4: Sistem & Server (Strictly SuperAdmin Only) */}
          {userRole === 'SuperAdmin' && (
            <div className="space-y-1 pt-2 border-t border-slate-800/80">
              {renderGroupHeader('sistem', 'Sistem & Server', Settings, isSistemActive)}

              {openGroups.sistem && (
                <div className="space-y-0.5 pl-1">
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
