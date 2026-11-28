import React, { useMemo, useState } from 'react';
import { FieldConfig, ModuleMetadata } from '../core/types/metadata';
import { getModuleEntry } from '../core/moduleRegistry';
import { useDynamicForm } from '../hooks/useDynamicForm';
import { formatPerizinanDateRange, normalizeToIsoDate } from '../core/utils/dateHelpers';
import { formatNisVisual, stripNisSymbols } from '../core/utils/nisHelpers';
import { getCanonicalNisDigits, isActivePlacementStatus } from '../core/utils/relationHelpers';
import { generateJurusanCode } from '../core/utils/autoIdHelpers';
import { AlertCircle, Link2, Loader2, Save, X } from 'lucide-react';
import { DynamicFormField } from './dynamic-form/DynamicFormField';
import { normFormValue, useDynamicFormRelations } from './dynamic-form/useDynamicFormRelations';
import { CrudLoadingOverlay, TopProgressBar } from './CrudProgressFeedback';

interface DynamicFormModalProps<T = any> {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  fields: FieldConfig<T>[];
  moduleMetadata?: ModuleMetadata<T>;
  initialData?: Partial<T>;
  existingRows?: T[];
  moduleId?: string;
  tableName?: string;
  onSubmit: (values: T) => Promise<void> | void;
  onOpenImageCropper?: (currentImage: string, onDone: (croppedUrl: string) => void) => void;
}

export function DynamicFormModal<T extends Record<string, any>>({
  isOpen,
  onClose,
  title,
  fields,
  moduleMetadata,
  initialData = {},
  existingRows = [],
  moduleId,
  tableName,
  onSubmit,
  onOpenImageCropper,
}: DynamicFormModalProps<T>) {
  const effectiveMeta = useMemo(
    () => moduleMetadata || (moduleId ? (getModuleEntry(moduleId)?.metadata as ModuleMetadata<T> | undefined) : undefined),
    [moduleMetadata, moduleId]
  );

  const formFields = useMemo(() => fields.filter((f) => f.isFormInput !== false), [fields]);
  const visibleFormFields = useMemo(
    () => formFields.filter((f) => !f.hiddenInForm),
    [formFields]
  );
  const formFieldKeys = useMemo(() => new Set(formFields.map((f) => String(f.key))), [formFields]);

  const [manualFields, setManualFields] = useState<Record<string, boolean>>({});
  const [imageUrlInputKey, setImageUrlInputKey] = useState<string | null>(null);
  const [openAutocompleteKey, setOpenAutocompleteKey] = useState<string | null>(null);

  // Late-bound refs filled from relations hook for submit & validation callbacks
  const relationsRef = React.useRef<ReturnType<typeof useDynamicFormRelations<T>> | null>(null);

  const {
    values,
    setValue,
    setMultipleValues,
    errors,
    submitting,
    handleSubmit,
    resetForm,
  } = useDynamicForm<T>(
    formFields,
    initialData,
    async (formValues) => {
      const rel = relationsRef.current;
      const masterSiswa = rel?.masterSiswa || [];
      const masterDudi = rel?.masterDudi || [];
      const masterGuru = rel?.masterGuru || [];
      const payload: Record<string, any> = { ...(formValues as Record<string, any>) };
      const studentMode = effectiveMeta?.studentValidationMode;

      if (studentMode === 'master_unique' && payload.nis !== undefined) {
        const cleanDigits = getCanonicalNisDigits(payload.nis);
        if (cleanDigits) payload.nis = cleanDigits;
      }

      if (
        (studentMode === 'required_master' || studentMode === 'optional_master') &&
        masterSiswa.length > 0
      ) {
        const nisDigits = getCanonicalNisDigits(payload.nis);
        const matchedMaster = nisDigits
          ? masterSiswa.find((s) => getCanonicalNisDigits(s.nis) === nisDigits)
          : undefined;
        if (matchedMaster) {
          payload.nis = stripNisSymbols(matchedMaster.nis) || matchedMaster.nis;
          if (formFieldKeys.has('namaSiswa')) {
            payload.namaSiswa = matchedMaster.nama;
          }
        }
      }

      if (formFieldKeys.has('idJurusan') || effectiveMeta?.canonicalizeJurusanCode) {
        const rawJur = payload.idJurusan || payload.jurusan;
        if (rawJur) {
          payload.idJurusan = generateJurusanCode(String(rawJur)) || String(rawJur);
        }
      }

      if (formFieldKeys.has('idDudi') && !String(payload.idDudi || '').trim()) {
        const dudiName = payload.dudiTujuan || payload.namaDudi;
        const matchedDudi = dudiName
          ? masterDudi.find((d) => normFormValue(d.namaDudi) === normFormValue(dudiName))
          : undefined;
        if (matchedDudi) {
          payload.idDudi = matchedDudi.id;
        }
      }

      if (formFieldKeys.has('guruPendamping')) {
        const guruName = String(payload.guruPendamping || '').trim();
        if (guruName) {
          const matchedGuru =
            masterGuru.find((g) => normFormValue(g.nama) === normFormValue(guruName)) ||
            (payload.idGuruPendamping
              ? masterGuru.find((g) => g.id === payload.idGuruPendamping)
              : undefined);
          if (matchedGuru) {
            payload.guruPendamping = matchedGuru.nama;
            if (formFieldKeys.has('idGuruPendamping')) {
              payload.idGuruPendamping = matchedGuru.id;
            }
          } else if (formFieldKeys.has('idGuruPendamping')) {
            payload.idGuruPendamping = '';
          }
        } else if (formFieldKeys.has('idGuruPendamping')) {
          payload.idGuruPendamping = '';
        }
      }

      if (formFieldKeys.has('namaKakomli')) {
        const kakomliName = String(payload.namaKakomli || '').trim();
        if (kakomliName) {
          const matchedGuru =
            masterGuru.find((g) => normFormValue(g.nama) === normFormValue(kakomliName)) ||
            (payload.idKakomli ? masterGuru.find((g) => g.id === payload.idKakomli) : undefined);
          if (matchedGuru) {
            payload.namaKakomli = matchedGuru.nama;
            if (formFieldKeys.has('idKakomli')) {
              payload.idKakomli = matchedGuru.id;
            }
          } else if (formFieldKeys.has('idKakomli')) {
            payload.idKakomli = '';
          }
        } else if (formFieldKeys.has('idKakomli')) {
          payload.idKakomli = '';
        }
      }

      if (effectiveMeta?.syncPerizinanDateRange) {
        const startIso = normalizeToIsoDate(payload.tanggalMulaiIzin);
        const isSd = payload.statusIzinOrtu === 'Surat Dokter (SD)';
        const endIso = isSd ? normalizeToIsoDate(payload.tanggalSelesaiIzin) : '';
        payload.tanggalMulaiIzin = startIso || '';
        payload.tanggalSelesaiIzin = endIso || '';
        payload.rentangTanggal = formatPerizinanDateRange(startIso, endIso, '');
        if (payload.rentangTanggal === '-') {
          payload.rentangTanggal = '';
        }
      }

      await onSubmit(payload as T);
      onClose();
    },
    (formValues): Record<string, string> => {
      const rel = relationsRef.current;
      const masterSiswa = rel?.masterSiswa || [];
      const loadingRelations = rel?.loadingRelations || false;
      const extraErrors: Record<string, string> = {};
      const studentMode = effectiveMeta?.studentValidationMode;

      if (studentMode === 'master_unique') {
        const nisDigits = getCanonicalNisDigits(formValues.nis);
        if (nisDigits) {
          const duplicate = (existingRows || []).find(
            (r) => r?.id !== initialData?.id && getCanonicalNisDigits(r?.nis) === nisDigits
          );
          if (duplicate) {
            extraErrors.nis = `NIS ${formatNisVisual(nisDigits)} sudah terdaftar atas nama ${duplicate.nama || 'siswa lain'}. 1 siswa hanya boleh memiliki 1 NIS.`;
          }
        }
      }

      if (studentMode === 'required_master') {
        if (loadingRelations && masterSiswa.length === 0) {
          extraErrors.nis = 'Sedang memuat Master Siswa, silakan tunggu sebentar.';
        } else if (masterSiswa.length > 0) {
          const nisDigits = getCanonicalNisDigits(formValues.nis);
          const matchedMaster = nisDigits
            ? masterSiswa.find((s) => getCanonicalNisDigits(s.nis) === nisDigits)
            : undefined;
          if (!matchedMaster) {
            const errKey = formFieldKeys.has('nis') ? 'nis' : 'namaSiswa';
            extraErrors[errKey] =
              'NIS wajib terdaftar di Master Siswa. Tambahkan siswa terlebih dahulu di menu Master Siswa.';
          } else if (
            formFieldKeys.has('namaSiswa') &&
            normFormValue(formValues.namaSiswa) !== normFormValue(matchedMaster.nama)
          ) {
            extraErrors.namaSiswa = `Nama untuk NIS ${formatNisVisual(matchedMaster.nis)} di Master Siswa adalah "${matchedMaster.nama}". Pilih siswa dari daftar Master Siswa.`;
          }
        }
      } else if (studentMode === 'optional_master' && masterSiswa.length > 0) {
        const nisDigits = getCanonicalNisDigits(formValues.nis);
        if (nisDigits) {
          const matchedMaster = masterSiswa.find((s) => getCanonicalNisDigits(s.nis) === nisDigits);
          if (!matchedMaster) {
            extraErrors.nis = 'NIS siswa tidak ditemukan di Master Siswa.';
          }
        }
      }

      if (effectiveMeta?.preventDuplicateActivePlacement && isActivePlacementStatus(formValues.statusPenempatan)) {
        const nisDigits = getCanonicalNisDigits(formValues.nis);
        if (nisDigits) {
          const activeConflict = (existingRows || []).find(
            (r) =>
              r?.id !== initialData?.id &&
              getCanonicalNisDigits(r?.nis) === nisDigits &&
              isActivePlacementStatus(r?.statusPenempatan)
          );
          if (activeConflict) {
            extraErrors.nis = `Siswa ini masih memiliki penempatan aktif (${activeConflict.statusPenempatan || 'Aktif'}) di ${activeConflict.namaDudi || 'DUDI lain'}. Ubah status lama menjadi "Selesai PKL" / "Pindah DUDI" atau gunakan aksi "Pindah DUDI".`;
          }
        }
      }

      if (effectiveMeta?.syncPerizinanDateRange && formValues.statusIzinOrtu === 'Surat Dokter (SD)') {
        const startIso = normalizeToIsoDate(formValues.tanggalMulaiIzin);
        const endIso = normalizeToIsoDate(formValues.tanggalSelesaiIzin);
        if (startIso && endIso && endIso < startIso) {
          extraErrors.tanggalSelesaiIzin =
            'Tanggal Selesai Izin tidak boleh lebih awal dari Tanggal Mulai Izin';
        }
      }

      const guruFieldCfg = formFields.find((f) => String(f.key) === 'guruPendamping');
      if (
        guruFieldCfg?.autocomplete &&
        guruFieldCfg.allowCustomValue === false &&
        rel?.masterGuru?.length
      ) {
        const guruInput = String(formValues.guruPendamping || '').trim();
        if (guruInput) {
          const matchedGuru = rel.masterGuru.find(
            (g) => normFormValue(g.nama) === normFormValue(guruInput)
          );
          if (!matchedGuru) {
            extraErrors.guruPendamping =
              'Pilih Guru Pendamping dari daftar hasil pencarian Master Guru atau kosongkan kolom ini.';
          }
        }
      }

      return extraErrors;
    }
  );

  const relations = useDynamicFormRelations<T>({
    isOpen,
    moduleId,
    tableName,
    formFields,
    formFieldKeys,
    initialData,
    existingRows,
    values,
    setValue,
    setMultipleValues,
    resetForm,
    openAutocompleteKey,
    setOpenAutocompleteKey,
    onResetLocalUi: () => setManualFields({}),
  });
  relationsRef.current = relations;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-[2px]"
      onClick={!submitting ? onClose : undefined}
    >
      <div
        className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]"
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
            disabled={submitting}
            onClick={onClose}
            className="w-9 h-9 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/80 flex items-center justify-center transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Tutup modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <TopProgressBar
          active={submitting || relations.loadingRelations}
          label="Menyinkronkan form dengan Cloud Server"
        />

        {/* Form with Scrollable Body + Fixed Footer */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {visibleFormFields.map((field) => {
                const key = String(field.key);
                if (field.visibleWhen && values[field.visibleWhen.field] !== field.visibleWhen.equals) {
                  return null;
                }

                const displayLabel =
                  field.labelWhen && values[field.labelWhen.field] === field.labelWhen.equals
                    ? field.labelWhen.label
                    : field.label;

                const displayHelperText =
                  field.helperTextWhen &&
                  values[field.helperTextWhen.field] === field.helperTextWhen.equals
                    ? field.helperTextWhen.helperText
                    : field.helperText;

                const isFullWidth = field.type === 'textarea' || field.type === 'image';
                const err = errors[key];
                const canToggleManual =
                  !field.disabled &&
                  !field.autocomplete &&
                  Boolean(field.relationSource) &&
                  Boolean(field.allowCustomValue) &&
                  relations.hasRelationOptions(field);
                const isManual = Boolean(manualFields[key]);

                return (
                  <div key={key} className={isFullWidth ? 'sm:col-span-2' : ''}>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <label className="block text-xs font-semibold text-slate-700">
                        {displayLabel}
                        {field.validation?.required && !field.disabled && (
                          <span className="text-rose-500 ml-1">*</span>
                        )}
                      </label>
                      {field.disabled && (
                        <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
                          Otomatis
                        </span>
                      )}
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

                    <DynamicFormField
                      field={field}
                      moduleId={moduleId}
                      formFieldKeys={formFieldKeys}
                      values={values}
                      errors={errors}
                      isManual={isManual}
                      loadingRelations={relations.loadingRelations}
                      openAutocompleteKey={openAutocompleteKey}
                      imageUrlInputKey={imageUrlInputKey}
                      studentDirectory={relations.studentDirectory}
                      masterDudi={relations.masterDudi}
                      masterGuru={relations.masterGuru}
                      setValue={setValue}
                      setMultipleValues={setMultipleValues}
                      setOpenAutocompleteKey={setOpenAutocompleteKey}
                      setImageUrlInputKey={setImageUrlInputKey}
                      getRelationOptions={relations.getRelationOptions}
                      handleRelationSelect={relations.handleRelationSelect}
                      applyStudentSelection={relations.applyStudentSelection}
                      applyDudiSelection={relations.applyDudiSelection}
                      applyGuruSelection={relations.applyGuruSelection}
                      resolvePreferredDudi={relations.resolvePreferredDudi}
                      onDudiManualEdit={() => {
                        relations.dudiManuallyEditedRef.current = true;
                      }}
                      onOpenImageCropper={onOpenImageCropper}
                    />

                    {err && (
                      <div className="flex items-center gap-1 text-xs text-rose-600 mt-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{err}</span>
                      </div>
                    )}
                    {displayHelperText && !err && (
                      <p className="text-[11px] text-slate-400 mt-1">{displayHelperText}</p>
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
              className="h-9 px-4 border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="h-9 inline-flex items-center gap-1.5 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              ) : (
                <Save className="w-4 h-4 shrink-0" />
              )}
              <span>{submitting ? 'Menyimpan...' : 'Simpan Data'}</span>
            </button>
          </div>
        </form>

        <CrudLoadingOverlay
          visible={submitting}
          title="Menyimpan Data ke Cloud Server..."
          subtitle="Mohon tunggu sejenak sementara data divalidasi dan disinkronkan."
        />
      </div>
    </div>
  );
}
