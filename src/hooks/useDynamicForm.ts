import { useState } from 'react';
import { FieldConfig } from '../core/types/metadata';

export function useDynamicForm<T extends Record<string, any>>(
  fields: FieldConfig<T>[],
  initialValues: Partial<T> = {},
  onSubmit: (values: T) => Promise<void> | void
) {
  const [values, setValues] = useState<Record<string, any>>(() => {
    const defaults: Record<string, any> = {};
    fields.forEach((f) => {
      const k = String(f.key);
      defaults[k] = initialValues[k] !== undefined ? initialValues[k] : f.defaultValue ?? '';
    });
    return defaults;
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const setValue = (key: string, val: any) => {
    setValues((prev) => ({ ...prev, [key]: val }));
    if (errors[key]) {
      setErrors((prev) => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
    }
  };

  const setMultipleValues = (patch: Record<string, any>) => {
    setValues((prev) => ({ ...prev, ...patch }));
    setErrors((prev) => {
      let changed = false;
      const copy = { ...prev };
      for (const k of Object.keys(patch)) {
        if (copy[k]) {
          delete copy[k];
          changed = true;
        }
      }
      return changed ? copy : prev;
    });
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    fields.forEach((f) => {
      if (!f.isFormInput) return;
      const k = String(f.key);
      const val = values[k];

      if (f.validation?.required) {
        if (val === undefined || val === null || val === '') {
          newErrors[k] = f.validation.customError || `${f.label} wajib diisi`;
        }
      }

      if (f.validation?.min !== undefined && typeof val === 'number') {
        if (val < f.validation.min) {
          newErrors[k] = `${f.label} minimal ${f.validation.min}`;
        }
      }

      if (f.validation?.max !== undefined && typeof val === 'number') {
        if (val > f.validation.max) {
          newErrors[k] = `${f.label} maksimal ${f.validation.max}`;
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      await onSubmit(values as T);
    } catch (err: any) {
      console.error('Form submission failed', err);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = (newInitial: Partial<T> = {}) => {
    const defaults: Record<string, any> = {};
    fields.forEach((f) => {
      const k = String(f.key);
      defaults[k] = newInitial[k] !== undefined ? newInitial[k] : f.defaultValue ?? '';
    });
    setValues(defaults);
    setErrors({});
  };

  return {
    values,
    setValue,
    setMultipleValues,
    errors,
    submitting,
    handleSubmit,
    resetForm,
  };
}
