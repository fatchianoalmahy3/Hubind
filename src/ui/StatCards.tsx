import React from 'react';
import { StatCardConfig } from '../core/types/metadata';
import * as Icons from 'lucide-react';

interface StatCardsProps {
  configs: StatCardConfig[];
  data: any[];
  loading?: boolean;
}

export const StatCards: React.FC<StatCardsProps> = ({ configs, data, loading = false }) => {
  const getIcon = (iconName: string) => {
    const IconComponent = (Icons as any)[iconName] || Icons.Activity;
    return <IconComponent className="w-4 h-4" />;
  };

  const getVariantStyles = (variant: StatCardConfig['variant'] = 'primary') => {
    switch (variant) {
      case 'success':
        return {
          icon: 'bg-emerald-50 text-emerald-700',
          change: 'text-emerald-700',
        };
      case 'warning':
        return {
          icon: 'bg-amber-50 text-amber-700',
          change: 'text-amber-700',
        };
      case 'danger':
        return {
          icon: 'bg-rose-50 text-rose-700',
          change: 'text-rose-700',
        };
      case 'info':
        return {
          icon: 'bg-sky-50 text-sky-700',
          change: 'text-sky-700',
        };
      case 'primary':
      default:
        return {
          icon: 'bg-blue-50 text-blue-700',
          change: 'text-slate-500',
        };
    }
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
      {configs.map((card, idx) => {
        let val: any = 0;
        if (!loading) {
          try {
            val = card.computedValue ? card.computedValue(data) : 0;
          } catch (e) {
            console.warn(`[StatCards] Error calculating ${card.title}:`, e);
            val = 0;
          }
        }
        const styles = getVariantStyles(card.variant);

        return (
          <div
            key={idx}
            className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between gap-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500 truncate">
                {card.title}
              </span>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${styles.icon}`}>
                {getIcon(card.icon)}
              </div>
            </div>
            <div>
              {loading ? (
                <div className="h-7 w-16 rounded-md skeleton-shimmer" aria-label={`Memuat ${card.title}`} />
              ) : (
                <div className="text-2xl font-bold text-slate-900 tracking-tight tabular-nums leading-none">
                  {typeof val === 'number' ? val.toLocaleString('id-ID') : val}
                </div>
              )}
              {card.change && (
                <p className={`mt-1.5 text-xs font-medium truncate ${styles.change}`}>
                  {card.change}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
