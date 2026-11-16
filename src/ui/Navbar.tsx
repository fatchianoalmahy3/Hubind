import React, { useState, useEffect } from 'react';
import {
  Menu,
  RefreshCw,
  LogOut,
  Home,
} from 'lucide-react';
import { UserRole } from '../core/types/schema';
import { GoogleSheetClient } from '../core/GoogleSheetClient';

interface NavbarProps {
  onToggleMobileSidebar: () => void;
  userRole: UserRole;
  onChangeUserRole?: (role: UserRole) => void;
  onOpenSpreadsheetConfig: () => void;
  onOpenTemplateManager?: () => void;
  onSyncAll: () => void;
  syncing: boolean;
  onGoToLanding?: () => void;
  currentUser?: any;
  onLogout?: () => void;
  currentModuleName?: string;
  isConnected?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  onToggleMobileSidebar,
  onSyncAll,
  syncing,
  onGoToLanding,
  currentUser,
  onLogout,
  currentModuleName,
  isConnected = false,
}) => {
  const client = GoogleSheetClient.getInstance();
  const [config, setConfig] = useState(client.getConfig());

  useEffect(() => {
    const unsubscribe = client.addChangeListener(() => {
      setConfig(client.getConfig());
    });
    return () => unsubscribe();
  }, []);

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-4 sm:px-6 h-16 flex items-center justify-between gap-4 w-full shrink-0">
      {/* Left: Mobile menu button & Clean Breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onToggleMobileSidebar}
          className="w-10 h-10 -ml-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 lg:hidden flex items-center justify-center transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
          title="Buka Menu"
          aria-label="Buka menu navigasi"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
            P2
          </div>
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm min-w-0">
            <span className="font-semibold text-slate-500 hidden sm:inline whitespace-nowrap shrink-0">
              Hubind Sterida
            </span>
            <span className="text-slate-300 hidden sm:inline shrink-0" aria-hidden="true">
              /
            </span>
            <span className="font-bold text-slate-900 truncate max-w-[180px] sm:max-w-[280px]">
              {currentModuleName || 'Portal Pengelola'}
            </span>
          </nav>
        </div>
      </div>

      {/* Right: Uniform Height Controls (h-9 = 36px) */}
      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
        {/* Clean Connection Status (Text-led, no decorative pulsing dots) */}
        <div
          className="hidden xl:flex items-center gap-2 text-xs font-medium text-slate-600 pr-2 border-r border-slate-200 whitespace-nowrap shrink-0"
          title={
            isConnected
              ? 'Terhubung otomatis lintas perangkat ke Cloud Server'
              : 'Menunggu konfigurasi Cloud Server'
          }
        >
          <span
            className={`inline-block w-2 h-2 rounded-full shrink-0 ${
              isConnected ? 'bg-emerald-600' : 'bg-amber-500'
            }`}
            aria-hidden="true"
          />
          <span>{isConnected ? 'Cloud Server Aktif' : 'Belum Terhubung'}</span>
        </div>

        {/* Academic Year Switcher */}
        <div className="flex items-center h-9 bg-slate-50 px-2.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 shrink-0 focus-within:ring-2 focus-within:ring-blue-500/30 focus-within:border-blue-400">
          <span className="text-slate-400 mr-1.5 hidden sm:inline whitespace-nowrap">TA</span>
          <select
            value={config.activeYear}
            onChange={async (e) => {
              await client.switchAcademicYear(e.target.value);
            }}
            aria-label="Tahun Ajaran Aktif"
            className="bg-transparent border-0 font-bold text-slate-800 focus:outline-none cursor-pointer text-xs tabular-nums pr-1"
            title="Ganti Tahun Ajaran Database Server"
          >
            {config.academicYears && config.academicYears.length > 0 ? (
              config.academicYears.map((ay) => (
                <option key={ay.year} value={ay.year}>
                  {ay.year}
                </option>
              ))
            ) : (
              <option value={config.activeYear || ''}>
                {config.activeYear || 'Belum Diatur'}
              </option>
            )}
          </select>
        </div>

        {/* Global Sync Button */}
        <button
          type="button"
          onClick={onSyncAll}
          disabled={syncing}
          className="h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors shrink-0 disabled:opacity-50 inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
          title="Muat ulang seluruh data dari Cloud Server"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 shrink-0 ${
              syncing ? 'animate-spin text-blue-600' : 'text-slate-500'
            }`}
          />
          <span className="hidden sm:inline">{syncing ? 'Menyinkronkan...' : 'Sync Server'}</span>
        </button>

        {/* Back to Landing Page */}
        {onGoToLanding && (
          <button
            type="button"
            onClick={onGoToLanding}
            className="h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors shrink-0 inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            title="Lihat Portal Publik"
          >
            <Home className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="hidden md:inline">Portal Publik</span>
          </button>
        )}

        {/* User Account & Sign Out */}
        {currentUser && (
          <div className="flex items-center gap-2.5 pl-2.5 border-l border-slate-200 shrink-0">
            <div className="hidden lg:flex flex-col text-right leading-tight">
              <span className="text-xs font-bold text-slate-900 truncate max-w-[140px]">
                {currentUser.name?.split('(')[0]?.trim() || currentUser.name}
              </span>
              <span className="text-[11px] text-slate-500 font-medium mt-0.5">
                {currentUser.role}
              </span>
            </div>

            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 text-slate-700 text-xs font-semibold transition-colors shrink-0 cursor-pointer inline-flex items-center justify-center gap-1.5 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40"
                title={`Keluar dari sesi ${currentUser.role}`}
              >
                <LogOut className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Keluar</span>
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
