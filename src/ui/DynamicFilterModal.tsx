import React, { useEffect, useState } from 'react';
import { FieldConfig, FilterState } from '../core/types/metadata';
import { GoogleSheetClient } from '../core/GoogleSheetClient';
import { X, Filter, RotateCcw, Check } from 'lucide-react';

interface RelationLookupSpec {
  sheetName: string;
  fields: string[];
  mapOptions: (rows: any[]) => Array<{ label: string; value: string }>;
}

const RELATION_LOOKUP_CONFIG: Record<string, RelationLookupSpec> = {
  jurusan: {
    sheetName: 'Master_Jurusan',
    fields: ['ID', 'Kode', 'Nama_Jurusan', 'kode', 'nama'],
    mapOptions: (rows) =>
      Array.from(
        new Map(
          rows
            .filter((r) => String(r.nama || r.Nama_Jurusan || '').trim())
            .map((r) => {
              const nama = String(r.nama || r.Nama_Jurusan || '').trim();
              const kode = String(r.kode || r.Kode || '').trim();
              return [nama, { label: kode ? `${kode} — ${nama}` : nama, value: nama }];
            })
        ).values()
      ).sort((a, b) => a.label.localeCompare(b.label)),
  },
  kelas: {
    sheetName: 'Master_Kelas_Walas',
    fields: ['ID', 'Nama_Kelas', 'namaKelas'],
    mapOptions: (rows) =>
      Array.from(
        new Set(rows.map((r) => String(r.namaKelas || r.Nama_Kelas || '').trim()).filter(Boolean))
      )
        .sort()
        .map((nama) => ({ label: nama, value: nama })),
  },
  dudi: {
    sheetName: 'Master_DUDI',
    fields: ['ID', 'Nama_DUDI', 'namaDudi'],
    mapOptions: (rows) =>
      Array.from(
        new Set(rows.map((r) => String(r.namaDudi || r.Nama_DUDI || '').trim()).filter(Boolean))
      )
        .sort()
        .map((nama) => ({ label: nama, value: nama })),
  },
  guru: {
    sheetName: 'Master_Guru_Pendamping',
    fields: ['ID', 'Nama_Lengkap', 'nama'],
    mapOptions: (rows) =>
      Array.from(
        new Set(rows.map((r) => String(r.nama || r.Nama_Lengkap || '').trim()).filter(Boolean))
      )
        .sort()
        .map((nama) => ({ label: nama, value: nama })),
  },
};

interface DynamicFilterModalProps<T = any> {
  isOpen: boolean;
  onClose: () => void;
  fields: FieldConfig<T>[];
  currentFilter: FilterState;
  onApplyFilter: (newFilter: FilterState) => void;
  onResetFilter: () => void;
}

export function DynamicFilterModal<T = any>({
  isOpen,
  onClose,
  fields,
  currentFilter,
  onApplyFilter,
  onResetFilter,
}: DynamicFilterModalProps<T>) {
  const filterableFields = fields.filter((f) => f.isFilterable);
  const [localFilter, setLocalFilter] = useState<FilterState>(currentFilter);
  const [relationOptionsMap, setRelationOptionsMap] = useState<
    Record<string, Array<{ label: string; value: string }>>
  >({});

  useEffect(() => {
    setLocalFilter(currentFilter);
  }, [currentFilter, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const sources = Array.from(
      new Set(filterableFields.map((f) => f.relationSource).filter((s): s is NonNullable<typeof s> => Boolean(s)))
    );
    if (sources.length === 0) return;

    let cancelled = false;
    const client = GoogleSheetClient.getInstance();

    const tasks = sources.map(async (source) => {
      const spec = RELATION_LOOKUP_CONFIG[source];
      if (!spec) return;
      try {
        const res = await client.fetchSheetData(spec.sheetName, false, { fields: spec.fields });
        if (cancelled) return;
        const opts = spec.mapOptions(Array.isArray(res.data) ? res.data : []);
        setRelationOptionsMap((prev) => ({ ...prev, [source]: opts }));
      } catch {
        // Fallback silently to static metadata options if lookup fails
      }
    });

    void Promise.all(tasks);
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = (key: string, value: any) => {
    setLocalFilter((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleApply = () => {
    const clean: FilterState = {};
    Object.keys(localFilter).forEach((k) => {
      const v = localFilter[k];
      if (v !== '' && v !== null && v !== undefined && v !== 'ALL') {
        clean[k] = v;
      }
    });
    onApplyFilter(clean);
    onClose();
  };

  const handleReset = () => {
    setLocalFilter({});
    onResetFilter();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-3 min-w-0 pr-2">
            <div className="w-9 h-9 bg-blue-50 border border-blue-200 rounded-lg text-blue-600 flex items-center justify-center shrink-0">
              <Filter className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900">Filter Data</h3>
              <p className="text-xs text-slate-500">Saring data secara presisi berdasarkan atribut</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/80 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            aria-label="Tutup modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter inputs */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {filterableFields.length === 0 ? (
            <div className="text-center py-6 text-slate-500 text-xs">
              Tidak ada kolom yang dapat difilter pada modul ini.
            </div>
          ) : (
            filterableFields.map((field) => {
              const key = String(field.key);
              const val = localFilter[key] ?? '';
              const dynamicRelOpts = field.relationSource ? relationOptionsMap[field.relationSource] : undefined;
              const resolvedOptions =
                dynamicRelOpts && dynamicRelOpts.length > 0 ? dynamicRelOpts : field.options;

              return (
                <div key={key}>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    {field.label}
                  </label>
                  {resolvedOptions && resolvedOptions.length > 0 ? (
                    <select
                      value={val}
                      onChange={(e) => handleChange(key, e.target.value)}
                      className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                    >
                      <option value="">Semua ({field.label})</option>
                      {resolvedOptions.map((opt) => (
                        <option key={String(opt.value)} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={val}
                      onChange={(e) => handleChange(key, e.target.value)}
                      placeholder={`Filter berdasarkan ${field.label}...`}
                      className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                    />
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={handleReset}
            className="h-9 inline-flex items-center gap-1.5 px-3 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded-lg transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Filter</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="h-9 inline-flex items-center gap-1.5 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Terapkan Filter</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
