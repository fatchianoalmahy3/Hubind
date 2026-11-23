import React from 'react';
import { FieldConfig } from '../../core/types/metadata';
import { Dudi } from '../../core/types/schema';
import { getPredikatFromScore } from '../../core/utils/monitoringHelpers';
import { formatNisVisual, handleNisKeyDown, processNisInputChange, stripNisSymbols } from '../../core/utils/nisHelpers';
import {
  formatPhoneDisplay,
  generateJurusanCode,
  getWhatsAppHref,
  isPhoneFieldKey,
} from '../../core/utils/autoIdHelpers';
import { Lock, MessageCircle, Upload } from 'lucide-react';
import { RelationAutocompleteInput } from './RelationAutocompleteInput';
import { normFormValue, StudentDirectoryEntry } from './useDynamicFormRelations';

interface DynamicFormFieldProps<T> {
  field: FieldConfig<T>;
  moduleId?: string;
  formFieldKeys: Set<string>;
  values: Record<string, any>;
  errors: Record<string, string>;
  isManual: boolean;
  loadingRelations: boolean;
  openAutocompleteKey: string | null;
  imageUrlInputKey: string | null;
  studentDirectory: StudentDirectoryEntry[];
  masterDudi: Dudi[];
  setValue: (key: string, value: any) => void;
  setMultipleValues: (patch: Record<string, any>) => void;
  setOpenAutocompleteKey: React.Dispatch<React.SetStateAction<string | null>>;
  setImageUrlInputKey: React.Dispatch<React.SetStateAction<string | null>>;
  getRelationOptions: (field: FieldConfig<T>) => { label: string; value: string }[];
  handleRelationSelect: (field: FieldConfig<T>, selectedValue: string) => void;
  applyStudentSelection: (matched: StudentDirectoryEntry, triggerPatch?: Record<string, any>) => void;
  applyDudiSelection: (matched: Dudi, fieldKey: string, selectedValue?: string) => void;
  resolvePreferredDudi: (matched?: StudentDirectoryEntry) => { dudiTujuan: string; alamatDudi: string };
  onDudiManualEdit: () => void;
  onOpenImageCropper?: (currentImage: string, onDone: (croppedUrl: string) => void) => void;
}

export function DynamicFormField<T>({
  field,
  formFieldKeys,
  values,
  errors,
  isManual,
  loadingRelations,
  openAutocompleteKey,
  imageUrlInputKey,
  studentDirectory,
  masterDudi,
  setValue,
  setMultipleValues,
  setOpenAutocompleteKey,
  setImageUrlInputKey,
  getRelationOptions,
  handleRelationSelect,
  applyStudentSelection,
  applyDudiSelection,
  resolvePreferredDudi,
  onDudiManualEdit,
  onOpenImageCropper,
}: DynamicFormFieldProps<T>) {
  const key = String(field.key);
  const val = values[key];
  const err = errors[key];

  if (field.disabled) {
    return (
      <div className="relative">
        <input
          type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
          value={val ?? ''}
          disabled
          readOnly
          placeholder={field.placeholder || 'Otomatis oleh sistem'}
          className="w-full h-10 px-3 pr-8 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-600 font-medium cursor-not-allowed tabular-nums"
        />
        <Lock className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
    );
  }

  if (
    field.autocomplete &&
    field.relationSource &&
    (field.relationSource === 'siswa' || field.relationSource === 'dudi') &&
    !isManual
  ) {
    return (
      <RelationAutocompleteInput
        field={field}
        val={String(val ?? '')}
        err={err}
        values={values}
        isDropdownOpen={openAutocompleteKey === key}
        loadingRelations={loadingRelations}
        studentDirectory={studentDirectory}
        masterDudi={masterDudi}
        setValue={setValue}
        setOpenAutocompleteKey={setOpenAutocompleteKey}
        applyStudentSelection={applyStudentSelection}
        applyDudiSelection={applyDudiSelection}
        resolvePreferredDudi={resolvePreferredDudi}
        onDudiManualEdit={onDudiManualEdit}
      />
    );
  }

  if (field.relationSource) {
    const dynamicOpts = getRelationOptions(field);
    const shouldRenderManual =
      isManual || (Boolean(field.allowCustomValue) && dynamicOpts.length === 0 && !loadingRelations);

    if (!shouldRenderManual && dynamicOpts.length > 0) {
      const currentStr = String(val ?? '').trim();
      const matchedOpt = currentStr
        ? dynamicOpts.find((opt) => normFormValue(opt.value) === normFormValue(currentStr))
        : undefined;
      const resolvedSelectVal = matchedOpt ? matchedOpt.value : currentStr;
      const hasCurrentInList = !currentStr || Boolean(matchedOpt);

      return (
        <select
          value={currentStr ? resolvedSelectVal : ''}
          onChange={(e) => handleRelationSelect(field, e.target.value)}
          className={`w-full h-10 px-3 bg-white border rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors ${
            err ? 'border-rose-400 focus:ring-rose-400/30' : 'border-slate-300'
          }`}
        >
          <option value="">
            {loadingRelations ? `Memuat daftar ${field.label}...` : `-- Pilih ${field.label} --`}
          </option>
          {!hasCurrentInList && <option value={currentStr}>{currentStr} (Data Saat Ini)</option>}
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
    if (
      fieldKey === 'statusIzinOrtu' &&
      nextVal !== 'Surat Dokter (SD)' &&
      formFieldKeys.has('tanggalSelesaiIzin') &&
      values.tanggalSelesaiIzin
    ) {
      setMultipleValues({ statusIzinOrtu: nextVal, tanggalSelesaiIzin: '' });
      return;
    }

    if (fieldKey === 'nama' && formFieldKeys.has('kode')) {
      const autoKode = generateJurusanCode(String(nextVal || ''));
      setMultipleValues({ nama: nextVal, kode: autoKode || values.kode || '' });
      return;
    }

    if (fieldKey === 'jurusan' && formFieldKeys.has('idJurusan')) {
      setMultipleValues({ jurusan: nextVal, idJurusan: generateJurusanCode(String(nextVal || '')) || '' });
      return;
    }

    const gradeKeys = new Set(['nilaiK3lh', 'nilaiSoftskill', 'nilaiKompetensiTeknis', 'nilaiAlurBisnis']);
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
        if (formFieldKeys.has('predikat')) patch.predikat = getPredikatFromScore(avg);
      }
      setMultipleValues(patch);
      return;
    }

    setValue(fieldKey, nextVal);
  };

  switch (field.type) {
    case 'select': {
      const currentStr = String(val ?? '').trim();
      const hasMatch = !currentStr || (field.options || []).some((opt) => String(opt.value) === currentStr);
      return (
        <select
          value={val ?? ''}
          onChange={(e) => handleFieldChange(key, e.target.value)}
          className={`w-full h-10 px-3 bg-white border rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors ${
            err ? 'border-rose-400 focus:ring-rose-400/30' : 'border-slate-300'
          }`}
        >
          <option value="">-- Pilih {field.label} --</option>
          {!hasMatch && <option value={currentStr}>{currentStr} (Data Saat Ini)</option>}
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
    default: {
      if (key === 'nis') {
        const nisDigits = stripNisSymbols(val);
        return (
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={formatNisVisual(nisDigits, '')}
            onKeyDown={(e) =>
              handleNisKeyDown(e, nisDigits, (nextDigits, nextPos) => {
                const inputEl = e.currentTarget;
                handleFieldChange(key, nextDigits);
                if (nextPos !== undefined) {
                  requestAnimationFrame(() => {
                    try {
                      inputEl.setSelectionRange(nextPos, nextPos);
                    } catch {
                      // ignore
                    }
                  });
                }
              })
            }
            onChange={(e) => processNisInputChange(e, (nextDigits) => handleFieldChange(key, nextDigits))}
            placeholder={field.placeholder || 'Contoh: 23241/001/001'}
            className={`w-full h-10 px-3 bg-white border rounded-lg text-sm text-slate-800 font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors ${
              err ? 'border-rose-400 focus:ring-rose-400/30' : 'border-slate-300'
            }`}
          />
        );
      }
      if (isPhoneFieldKey(key)) {
        const waHref = getWhatsAppHref(val);
        const displayPhone = formatPhoneDisplay(val, '');
        return (
          <div className="flex items-center gap-2">
            <input
              type="tel"
              inputMode="tel"
              value={val ?? ''}
              onChange={(e) => handleFieldChange(key, e.target.value)}
              placeholder={field.placeholder || `Masukkan ${field.label}...`}
              className={`flex-1 min-w-0 h-10 px-3 bg-white border rounded-lg text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors ${
                err ? 'border-rose-400 focus:ring-rose-400/30' : 'border-slate-300'
              }`}
            />
            {waHref && (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                title={`Buka chat WhatsApp ke ${displayPhone}`}
                className="h-10 px-3 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-semibold text-xs inline-flex items-center gap-1.5 shrink-0 transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Chat WA</span>
              </a>
            )}
          </div>
        );
      }
      return (
        <input
          type="text"
          value={val ?? ''}
          onChange={(e) => handleFieldChange(key, e.target.value)}
          placeholder={field.placeholder || `Masukkan ${field.label}...`}
          className={`w-full h-10 px-3 bg-white border rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors ${
            err ? 'border-rose-400 focus:ring-rose-400/30' : 'border-slate-300'
          }`}
        />
      );
    }
  }
}
