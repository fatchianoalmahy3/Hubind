import React, { useEffect, useState, useMemo } from 'react';
import { FieldConfig } from '../core/types/metadata';
import { Dudi, Guru, Jurusan, Kelas, Siswa } from '../core/types/schema';
import { useDynamicForm } from '../hooks/useDynamicForm';
import { DudiService } from '../services/DudiService';
import { GuruService } from '../services/GuruService';
import { JurusanService } from '../services/JurusanService';
import { KelasService } from '../services/KelasService';
import { SiswaService } from '../services/SiswaService';
import { getPredikatFromScore } from '../core/utils/monitoringHelpers';
import { X, Save, Upload, AlertCircle, Link2 } from 'lucide-react';

interface DynamicFormModalProps<T = any> {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  fields: FieldConfig<T>[];
  initialData?: Partial<T>;
  onSubmit: (values: T) => Promise<void> | void;
  onOpenImageCropper?: (currentImage: string, onDone: (croppedUrl: string) => void) => void;
}

function norm(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}

export function DynamicFormModal<T extends Record<string, any>>({
  isOpen,
  onClose,
  title,
  fields,
  initialData = {},
  onSubmit,
  onOpenImageCropper,
}: DynamicFormModalProps<T>) {
  const formFields = useMemo(
    () => fields.filter((f) => f.isFormInput !== false),
    [fields]
  );
  const formFieldKeys = useMemo(
    () => new Set(formFields.map((f) => String(f.key))),
    [formFields]
  );

  const {
    values,
    setValue,
    setMultipleValues,
    errors,
    submitting,
    handleSubmit,
    resetForm,
  } = useDynamicForm<T>(formFields, initialData, async (formValues) => {
    await onSubmit(formValues);
    onClose();
  });

  const [masterJurusan, setMasterJurusan] = useState<Jurusan[]>([]);
  const [masterKelas, setMasterKelas] = useState<Kelas[]>([]);
  const [masterDudi, setMasterDudi] = useState<Dudi[]>([]);
  const [masterGuru, setMasterGuru] = useState<Guru[]>([]);
  const [masterSiswa, setMasterSiswa] = useState<Siswa[]>([]);
  const [loadingRelations, setLoadingRelations] = useState(false);
  const [manualFields, setManualFields] = useState<Record<string, boolean>>({});
  const [imageUrlInputKey, setImageUrlInputKey] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    resetForm(initialData);
    setManualFields({});

    const sources = new Set(
      formFields.map((f) => f.relationSource).filter(Boolean)
    );
    if (sources.size === 0) return;

    let cancelled = false;
    setLoadingRelations(true);

    const tasks: Promise<void>[] = [];
    if (sources.has('jurusan')) {
      tasks.push(
        JurusanService.getInstance()
          .getAll()
          .then((list) => {
            if (!cancelled) setMasterJurusan(list);
          })
          .catch(() => {})
      );
    }
    if (sources.has('kelas')) {
      tasks.push(
        KelasService.getInstance()
          .getAll()
          .then((list) => {
            if (!cancelled) setMasterKelas(list);
          })
          .catch(() => {})
      );
    }
    if (sources.has('dudi')) {
      tasks.push(
        DudiService.getInstance()
          .getAll()
          .then((list) => {
            if (!cancelled) setMasterDudi(list);
          })
          .catch(() => {})
      );
    }
    if (sources.has('guru')) {
      tasks.push(
        GuruService.getInstance()
          .getAll()
          .then((list) => {
            if (!cancelled) setMasterGuru(list);
          })
          .catch(() => {})
      );
    }
    if (sources.has('siswa')) {
      tasks.push(
        SiswaService.getInstance()
          .getAll()
          .then((list) => {
            if (!cancelled) setMasterSiswa(list);
          })
          .catch(() => {})
      );
    }

    Promise.all(tasks).finally(() => {
      if (!cancelled) setLoadingRelations(false);
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRelationSelect = (field: FieldConfig<T>, selectedValue: string) => {
    const key = String(field.key);
    const patch: Record<string, any> = { [key]: selectedValue };

    if (!selectedValue) {
      setMultipleValues(patch);
      return;
    }

    if (field.relationSource === 'siswa') {
      const matched = masterSiswa.find((s) =>
        key === 'nis'
          ? String(s.nis).trim() === selectedValue.trim()
          : norm(s.nama) === norm(selectedValue)
      );
      if (matched) {
        if (formFieldKeys.has('nis')) patch.nis = matched.nis;
        if (formFieldKeys.has('namaSiswa')) patch.namaSiswa = matched.nama;
        if (formFieldKeys.has('jurusan') && matched.jurusan) patch.jurusan = matched.jurusan;
        if (formFieldKeys.has('kelas') && matched.kelas) patch.kelas = matched.kelas;
        if (formFieldKeys.has('namaOrtuWali') && matched.namaOrtuWali) {
          patch.namaOrtuWali = matched.namaOrtuWali;
        }
        if (formFieldKeys.has('noOrtuWali') && matched.noOrtuWali) {
          patch.noOrtuWali = matched.noOrtuWali;
        }
        if (formFieldKeys.has('noWa') && matched.noHpSiswa) {
          patch.noWa = matched.noHpSiswa;
        }
      }
    } else if (field.relationSource === 'dudi') {
      const matched = masterDudi.find((d) => norm(d.namaDudi) === norm(selectedValue));
      if (matched) {
        if (formFieldKeys.has('idDudi')) patch.idDudi = matched.id;
        if (formFieldKeys.has('alamatDudi') && matched.alamat) {
          patch.alamatDudi = matched.alamat;
        }
        if (formFieldKeys.has('bidangPekerjaan') && matched.bidangKeahlian) {
          patch.bidangPekerjaan = matched.bidangKeahlian;
        }
      }
    } else if (field.relationSource === 'guru') {
      const matched = masterGuru.find((g) => norm(g.nama) === norm(selectedValue));
      if (matched && formFieldKeys.has('idGuruPendamping')) {
        patch.idGuruPendamping = matched.id;
      }
    }

    setMultipleValues(patch);
  };

  const getRelationOptions = (
    field: FieldConfig<T>
  ): { label: string; value: string }[] => {
    const key = String(field.key);
    switch (field.relationSource) {
      case 'jurusan': {
        if (masterJurusan.length > 0) {
          return masterJurusan.map((j) => ({
            label: j.kode ? `${j.nama} (${j.kode})` : j.nama,
            value: j.nama,
          }));
        }
        return (field.options || []).map((o) => ({
          label: o.label,
          value: String(o.value),
        }));
      }
      case 'kelas': {
        if (masterKelas.length > 0) {
          const selectedJur = norm(values.jurusan);
          const filtered = selectedJur
            ? masterKelas.filter(
                (k) =>
                  norm(k.jurusan) === selectedJur ||
                  norm(k.jurusan).includes(selectedJur) ||
                  selectedJur.includes(norm(k.jurusan))
              )
            : masterKelas;
          const list = filtered.length > 0 ? filtered : masterKelas;
          return list.map((k) => ({
            label: k.jurusan ? `${k.namaKelas} — ${k.jurusan}` : k.namaKelas,
            value: k.namaKelas,
          }));
        }
        return (field.options || []).map((o) => ({
          label: o.label,
          value: String(o.value),
        }));
      }
      case 'dudi':
        return masterDudi.map((d) => ({
          label: `${d.namaDudi}${d.wilayahKota ? ` · ${d.wilayahKota}` : ''} (${d.terisi ?? 0}/${d.kuotaMaksimal ?? 0})`,
          value: d.namaDudi,
        }));
      case 'guru':
        return masterGuru.map((g) => ({
          label: `${g.nama} (${g.peranUtama || 'Guru Pendamping'})`,
          value: g.nama,
        }));
      case 'siswa':
        return masterSiswa.map((s) =>
          key === 'nis'
            ? { label: `${s.nis} — ${s.nama} (${s.kelas})`, value: s.nis }
            : { label: `${s.nama} (${s.nis} · ${s.kelas})`, value: s.nama }
        );
      default:
        return (field.options || []).map((o) => ({
          label: o.label,
          value: String(o.value),
        }));
    }
  };

  const renderFieldInput = (field: FieldConfig<T>) => {
    const key = String(field.key);
    const val = values[key];
    const err = errors[key];

    if (field.relationSource) {
      const dynamicOpts = getRelationOptions(field);
      const isManual =
        Boolean(manualFields[key]) ||
        (field.allowCustomValue && dynamicOpts.length === 0 && !loadingRelations);

      if (!isManual && dynamicOpts.length > 0) {
        const currentStr = String(val ?? '').trim();
        const hasCurrentInList =
          !currentStr || dynamicOpts.some((opt) => opt.value === currentStr);

        return (
          <select
            value={val ?? ''}
            onChange={(e) => handleRelationSelect(field, e.target.value)}
            className={`w-full h-10 px-3 bg-white border rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors ${
              err ? 'border-rose-400 focus:ring-rose-400/30' : 'border-slate-300'
            }`}
          >
            <option value="">
              {loadingRelations
                ? `Memuat daftar ${field.label}...`
                : `-- Pilih ${field.label} --`}
            </option>
            {!hasCurrentInList && (
              <option value={currentStr}>{currentStr} (Data Saat Ini)</option>
            )}
            {dynamicOpts.map((opt, idx) => (
              <option key={`${opt.value}-${idx}`} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );
      }
    }

    const handleFieldChange = (fieldKey: string, nextVal: any) => {
      const gradeKeys = new Set([
        'nilaiK3lh',
        'nilaiSoftskill',
        'nilaiKompetensiTeknis',
        'nilaiAlurBisnis',
      ]);
      if (gradeKeys.has(fieldKey) && formFieldKeys.has('nilaiRataRata')) {
        const mergedGrades: Record<string, any> = {
          nilaiK3lh: fieldKey === 'nilaiK3lh' ? nextVal : values.nilaiK3lh,
          nilaiSoftskill: fieldKey === 'nilaiSoftskill' ? nextVal : values.nilaiSoftskill,
          nilaiKompetensiTeknis:
            fieldKey === 'nilaiKompetensiTeknis' ? nextVal : values.nilaiKompetensiTeknis,
          nilaiAlurBisnis: fieldKey === 'nilaiAlurBisnis' ? nextVal : values.nilaiAlurBisnis,
        };
        const nums = Object.values(mergedGrades)
          .filter((v) => v !== '' && v !== null && v !== undefined && !isNaN(Number(v)))
          .map((v) => Math.min(100, Math.max(0, Number(v))));
        const patch: Record<string, any> = { [fieldKey]: nextVal };
        if (nums.length > 0) {
          const avg = Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
          patch.nilaiRataRata = avg;
          if (formFieldKeys.has('predikat')) {
            patch.predikat = getPredikatFromScore(avg);
          }
        }
        setMultipleValues(patch);
        return;
      }
      setValue(fieldKey, nextVal);
    };

    switch (field.type) {
      case 'select': {
        const currentStr = String(val ?? '').trim();
        const hasMatch =
          !currentStr || (field.options || []).some((opt) => String(opt.value) === currentStr);
        return (
          <select
            value={val ?? ''}
            onChange={(e) => handleFieldChange(key, e.target.value)}
            className={`w-full h-10 px-3 bg-white border rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors ${
              err ? 'border-rose-400 focus:ring-rose-400/30' : 'border-slate-300'
            }`}
          >
            <option value="">-- Pilih {field.label} --</option>
            {!hasMatch && (
              <option value={currentStr}>{currentStr} (Data Saat Ini)</option>
            )}
            {field.options?.map((opt) => (
              <option key={String(opt.value)} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );
      }

      case 'textarea':
        return (
          <textarea
            rows={3}
            value={val ?? ''}
            onChange={(e) => handleFieldChange(key, e.target.value)}
            placeholder={field.placeholder || `Masukkan ${field.label}...`}
            className={`w-full px-3 py-2 bg-white border rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors ${
              err ? 'border-rose-400 focus:ring-rose-400/30' : 'border-slate-300'
            }`}
          />
        );

      case 'number':
        return (
          <input
            type="number"
            value={val ?? ''}
            onChange={(e) => handleFieldChange(key, e.target.value === '' ? '' : Number(e.target.value))}
            placeholder={field.placeholder}
            className={`w-full h-10 px-3 bg-white border rounded-lg text-sm text-slate-800 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors ${
              err ? 'border-rose-400 focus:ring-rose-400/30' : 'border-slate-300'
            }`}
          />
        );

      case 'date':
        return (
          <input
            type="date"
            value={val ?? ''}
            onChange={(e) => setValue(key, e.target.value)}
            className={`w-full h-10 px-3 bg-white border rounded-lg text-sm text-slate-800 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors ${
              err ? 'border-rose-400 focus:ring-rose-400/30' : 'border-slate-300'
            }`}
          />
        );

      case 'boolean':
        return (
          <label className="flex items-center gap-2.5 h-10 cursor-pointer">
            <input
              type="checkbox"
              checked={!!val}
              onChange={(e) => setValue(key, e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
            />
            <span className="text-sm text-slate-700 select-none">
              {val ? 'Sudah Terlaksana / Ya' : 'Belum Terlaksana / Tidak'}
            </span>
          </label>
        );

      case 'image':
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              {val ? (
                <img
                  src={val}
                  alt="Preview"
                  referrerPolicy="no-referrer"
                  className="w-14 h-14 rounded-lg object-cover border border-slate-200 shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-[11px] shrink-0">
                  Foto
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  if (onOpenImageCropper) {
                    onOpenImageCropper(val || '', (newUrl) => setValue(key, newUrl));
                  } else {
                    setImageUrlInputKey((prev) => (prev === key ? null : key));
                  }
                }}
                className="h-9 px-3.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{val ? 'Ganti Foto (Crop/Resize)' : 'Pilih Foto (Crop/Resize)'}</span>
              </button>
            </div>
            {imageUrlInputKey === key && (
              <input
                type="url"
                value={val ?? ''}
                onChange={(e) => setValue(key, e.target.value)}
                placeholder="Tempel URL gambar atau data URL..."
                className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
            )}
          </div>
        );

      case 'text':
      default:
        return (
          <input
            type="text"
            value={val ?? ''}
            onChange={(e) => setValue(key, e.target.value)}
            placeholder={field.placeholder || `Masukkan ${field.label}...`}
            className={`w-full h-10 px-3 bg-white border rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors ${
              err ? 'border-rose-400 focus:ring-rose-400/30' : 'border-slate-300'
            }`}
          />
        );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fixed Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="min-w-0 pr-3">
            <h3 className="text-base font-bold text-slate-900 truncate">{title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Isi data sesuai standar administrasi Hubin SMK PGRI 2 Ponorogo
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/80 flex items-center justify-center transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            aria-label="Tutup modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form with Scrollable Body + Fixed Footer */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {formFields.map((field) => {
                const key = String(field.key);
                const isFullWidth = field.type === 'textarea' || field.type === 'image';
                const err = errors[key];
                const canToggleManual =
                  Boolean(field.relationSource) &&
                  Boolean(field.allowCustomValue) &&
                  getRelationOptions(field).length > 0;
                const isManual = Boolean(manualFields[key]);

                return (
                  <div key={key} className={isFullWidth ? 'sm:col-span-2' : ''}>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <label className="block text-xs font-semibold text-slate-700">
                        {field.label}
                        {field.validation?.required && <span className="text-rose-500 ml-1">*</span>}
                      </label>
                      {canToggleManual && (
                        <button
                          type="button"
                          onClick={() =>
                            setManualFields((prev) => ({ ...prev, [key]: !prev[key] }))
                          }
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                        >
                          <Link2 className="w-3 h-3" />
                          <span>{isManual ? 'Pilih dari Master' : 'Input Manual'}</span>
                        </button>
                      )}
                    </div>
                    {renderFieldInput(field)}
                    {err && (
                      <div className="flex items-center gap-1 text-xs text-rose-600 mt-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{err}</span>
                      </div>
                    )}
                    {field.helperText && !err && (
                      <p className="text-[11px] text-slate-400 mt-1">{field.helperText}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Fixed Footer Actions */}
          <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="h-9 px-4 border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="h-9 inline-flex items-center gap-1.5 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Save className="w-4 h-4 shrink-0" />
              <span>{submitting ? 'Menyimpan...' : 'Simpan Data'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
