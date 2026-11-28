import React from 'react';
import { Building2, ClipboardCheck, UserCheck } from 'lucide-react';

export type PortalMobileTab = 'dudi' | 'monitoring' | 'progress';

interface PortalBottomNavProps {
  activeTab: PortalMobileTab;
  hasSelectedDudi: boolean;
  dudiCount: number;
  disabled?: boolean;
  hidden?: boolean;
  onChangeTab: (tab: PortalMobileTab) => void;
}

export const PortalBottomNav: React.FC<PortalBottomNavProps> = ({
  activeTab,
  hasSelectedDudi,
  dudiCount,
  disabled = false,
  hidden = false,
  onChangeTab,
}) => {
  if (hidden) return null;

  const items: Array<{
    id: PortalMobileTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
    muted?: boolean;
  }> = [
    {
      id: 'dudi',
      label: 'DUDI',
      icon: Building2,
      badge: dudiCount > 0 ? String(dudiCount) : undefined,
    },
    {
      id: 'monitoring',
      label: 'Monitoring',
      icon: ClipboardCheck,
      muted: !hasSelectedDudi,
    },
    {
      id: 'progress',
      label: 'Progres',
      icon: UserCheck,
    },
  ];

  return (
    <nav
      aria-label="Navigasi Portal Monitoring"
      className="sm:hidden shrink-0 border-t border-slate-200 bg-white/95 backdrop-blur-xs px-2 pt-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] grid grid-cols-3 gap-1 z-20"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            disabled={disabled}
            onClick={() => onChangeTab(item.id)}
            className={`relative min-h-[48px] py-1 px-2 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              isActive
                ? 'bg-blue-50 text-blue-700 font-bold'
                : item.muted
                ? 'text-slate-400 hover:bg-slate-50'
                : 'text-slate-600 hover:bg-slate-50 font-medium'
            }`}
          >
            <div className="relative">
              <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : ''}`} />
              {item.badge && (
                <span
                  className={`absolute -top-1.5 -right-3 px-1 min-w-[16px] h-[15px] rounded-full text-[9px] font-bold flex items-center justify-center tabular-nums ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {item.badge}
                </span>
              )}
              {item.id === 'monitoring' && hasSelectedDudi && !isActive && (
                <span
                  aria-hidden="true"
                  className="absolute -top-0.5 -right-1.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white"
                />
              )}
            </div>
            <span className="text-[10px] leading-none">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
