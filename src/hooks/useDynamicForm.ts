import { useState } from 'react';
import { FieldConfig } from '../core/types/metadata';

export function useDynamicForm<T extends Record<string, any>>(
  fields: FieldConfig<T>[],
  initialValues: Partial<T> = {},
  onSubmit: (values: T) => Promise<void> | void,
  customValidate?: (values: Record<string, any>) => Record<string, string>
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
      const strVal = val === undefined || val === null ? '' : String(val).trim();
      const isEmpty = strVal === '';

      if (f.validation?.required && isEmpty) {
        newErrors[k] = f.validation.customError || `${f.label} wajib diisi`;
        return;
      }

      if (isEmpty) return;

      if (f.validation?.minLength !== undefined && strVal.length < f.validation.minLength) {
        newErrors[k] =
          f.validation.customError || `${f.label} minimal ${f.validation.minLength} karakter`;
        return;
      }

      if (f.validation?.maxLength !== undefined && strVal.length > f.validation.maxLength) {
        newErrors[k] =
          f.validation.customError || `${f.label} maksimal ${f.validation.maxLength} karakter`;
        return;
      }

      if (f.validation?.pattern) {
        const regex =
          typeof f.validation.pattern === 'string'
            ? new RegExp(f.validation.pattern)
            : f.validation.pattern;
        if (!regex.test(strVal)) {
          newErrors[k] = f.validation.customError || `Format ${f.label} tidak valid`;
          return;
        }
      }

      const numVal = typeof val === 'number' ? val : Number(strVal);
      if (!isNaN(numVal)) {
        if (f.validation?.min !== undefined && numVal < f.validation.min) {
          newErrors[k] = f.validation.customError || `${f.label} minimal ${f.validation.min}`;
          return;
        }
        if (f.validation?.max !== undefined && numVal > f.validation.max) {
          newErrors[k] = f.validation.customError || `${f.label} maksimal ${f.validation.max}`;
          return;
        }
      }
    });

    if (customValidate) {
      const extraErrors = customValidate(values);
      Object.entries(extraErrors || {}).forEach(([k, msg]) => {
        if (msg && !newErrors[k]) {
          newErrors[k] = msg;
        }
      });
    }

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
