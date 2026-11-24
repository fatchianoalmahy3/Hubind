import React from 'react';
import { CalendarDays, Clock } from 'lucide-react';
import { WORK_DAY_OPTIONS } from '../../core/utils/monitoringHelpers';

interface WorkScheduleRangeInputsProps {
  hariMulai: string;
  hariSelesai: string;
  jamMulai: string;
  jamSelesai: string;
  disabled?: boolean;
  required?: boolean;
  layout?: 'responsive' | 'stacked';
  helperText?: string;
  onChangeHariMulai: (val: string) => void;
  onChangeHariSelesai: (val: string) => void;
  onChangeJamMulai: (val: string) => void;
  onChangeJamSelesai: (val: string) => void;
}

export const WorkScheduleRangeInputs: React.FC<WorkScheduleRangeInputsProps> = ({
  hariMulai,
  hariSelesai,
  jamMulai,
  jamSelesai,
  disabled = false,
  required = false,
  layout = 'responsive',
  helperText,
  onChangeHariMulai,
  onChangeHariSelesai,
  onChangeJamMulai,
  onChangeJamSelesai,
}) => {
  return (
    <div className="space-y-1.5 min-w-0">
      <div
        className={`grid gap-3 text-xs min-w-0 ${
          layout === 'stacked' ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'
        }`}
      >
        <div className="min-w-0">
          <label className="flex items-center gap-1.5 font-semibold text-slate-700 mb-1">
            <CalendarDays className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>
              Hari Kerja (Rentang){required ? ' *' : ''}
            </span>
          </label>
          <div className="flex items-center gap-1.5 min-w-0">
            <select
              disabled={disabled}
              required={required}
              aria-label="Hari kerja mulai"
              value={hariMulai}
              onChange={(e) => onChangeHariMulai(e.target.value)}
              className="flex-1 min-w-0 w-full min-h-[40px] px-2 sm:px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-xs text-slate-900 disabled:bg-slate-100 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="">Hari Mulai</option>
              {WORK_DAY_OPTIONS.map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
            <span className="text-[11px] font-bold text-slate-500 shrink-0">s/d</span>
            <select
              disabled={disabled}
              required={required}
              aria-label="Hari kerja selesai"
              value={hariSelesai}
              onChange={(e) => onChangeHariSelesai(e.target.value)}
              className="flex-1 min-w-0 w-full min-h-[40px] px-2 sm:px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-xs text-slate-900 disabled:bg-slate-100 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="">Hari Selesai</option>
              {WORK_DAY_OPTIONS.map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="min-w-0">
          <label className="flex items-center gap-1.5 font-semibold text-slate-700 mb-1">
            <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>
              Jam Kerja (Rentang){required ? ' *' : ''}
            </span>
          </label>
          <div className="flex items-center gap-1.5 min-w-0">
            <input
              type="time"
              disabled={disabled}
              required={required}
              aria-label="Jam kerja masuk"
              value={jamMulai}
              onChange={(e) => onChangeJamMulai(e.target.value)}
              className="flex-1 min-w-0 w-full min-h-[40px] px-2 sm:px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono text-slate-900 disabled:bg-slate-100 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <span className="text-[11px] font-bold text-slate-500 shrink-0">s/d</span>
            <input
              type="time"
              disabled={disabled}
              required={required}
              aria-label="Jam kerja pulang"
              value={jamSelesai}
              onChange={(e) => onChangeJamSelesai(e.target.value)}
              className="flex-1 min-w-0 w-full min-h-[40px] px-2 sm:px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono text-slate-900 disabled:bg-slate-100 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>
      </div>
      {helperText && <p className="text-[11px] text-slate-500 leading-relaxed">{helperText}</p>}
    </div>
  );
};
