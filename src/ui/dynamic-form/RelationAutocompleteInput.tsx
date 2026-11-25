import React, { useDeferredValue, useMemo } from 'react';
import { FieldConfig } from '../../core/types/metadata';
import { Dudi, Guru } from '../../core/types/schema';
import { generateJurusanCode } from '../../core/utils/autoIdHelpers';
import { formatNisVisual, handleNisKeyDown, processNisInputChange, stripNisSymbols } from '../../core/utils/nisHelpers';
import { getCanonicalNisDigits } from '../../core/utils/relationHelpers';
import { Check, Search, X } from 'lucide-react';
import { normFormValue, StudentDirectoryEntry } from './useDynamicFormRelations';

interface RelationAutocompleteInputProps<T> {
  field: FieldConfig<T>;
  val: string;
  err?: string;
  values: Record<string, any>;
  isDropdownOpen: boolean;
  loadingRelations: boolean;
  studentDirectory: StudentDirectoryEntry[];
  masterDudi: Dudi[];
  masterGuru: Guru[];
  setValue: (key: string, value: any) => void;
  setMultipleValues: (patch: Record<string, any>) => void;
  setOpenAutocompleteKey: React.Dispatch<React.SetStateAction<string | null>>;
  applyStudentSelection: (matched: StudentDirectoryEntry, triggerPatch?: Record<string, any>) => void;
  applyDudiSelection: (matched: Dudi, fieldKey: string, selectedValue?: string) => void;
  applyGuruSelection: (matched: Guru, fieldKey: string, selectedValue?: string) => void;
  resolvePreferredDudi: (matched?: StudentDirectoryEntry) => { dudiTujuan: string; alamatDudi: string };
  onDudiManualEdit: () => void;
}

export function RelationAutocompleteInput<T>({
  field,
  val,
  err,
  values,
  isDropdownOpen,
  loadingRelations,
  studentDirectory,
  masterDudi,
  masterGuru,
  setValue,
  setMultipleValues,
  setOpenAutocompleteKey,
  applyStudentSelection,
  applyDudiSelection,
  applyGuruSelection,
  resolvePreferredDudi,
  onDudiManualEdit,
}: RelationAutocompleteInputProps<T>) {
  const key = String(field.key);
  const deferredVal = useDeferredValue(val);
  const query = normFormValue(val);
  const deferredQuery = normFormValue(deferredVal);

  const filteredStudents = useMemo(() => {
    if (field.relationSource !== 'siswa') return [];
    const qDigits = stripNisSymbols(deferredVal);
    return studentDirectory
      .filter((s) => {
        if (!deferredQuery && !qDigits) return true;
        const hay = s._searchNorm ?? `${normFormValue(s.nama)} ${normFormValue(s.nis)} ${normFormValue(s.kelas)} ${normFormValue(s.jurusan)}`;
        const digits = s._nisDigits ?? stripNisSymbols(s.nis);
        return hay.includes(deferredQuery) || (Boolean(qDigits) && digits.includes(qDigits));
      })
      .sort((a, b) => {
        const aStarts =
          (a._namaNorm ?? normFormValue(a.nama)).startsWith(deferredQuery) ||
          (Boolean(qDigits) && (a._nisDigits ?? stripNisSymbols(a.nis)).startsWith(qDigits)) ||
          (a._nisNorm ?? normFormValue(a.nis)).startsWith(deferredQuery)
            ? 0
            : 1;
        const bStarts =
          (b._namaNorm ?? normFormValue(b.nama)).startsWith(deferredQuery) ||
          (Boolean(qDigits) && (b._nisDigits ?? stripNisSymbols(b.nis)).startsWith(qDigits)) ||
          (b._nisNorm ?? normFormValue(b.nis)).startsWith(deferredQuery)
            ? 0
            : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return a.nama.localeCompare(b.nama);
      })
      .slice(0, 25);
  }, [field.relationSource, studentDirectory, deferredVal, deferredQuery]);

  const indexedDudi = useMemo(
    () =>
      masterDudi.map((d) => ({
        raw: d,
        namaNorm: normFormValue(d.namaDudi),
        bidangNorm: normFormValue(d.bidangKeahlian),
        searchNorm: `${normFormValue(d.namaDudi)} ${normFormValue(d.wilayahKota)} ${normFormValue(d.alamat)} ${normFormValue(d.bidangKeahlian)}`,
      })),
    [masterDudi]
  );

  const selectedJurusanRaw = String(values.jurusan || '').trim();
  const selectedJurusanNorm = normFormValue(selectedJurusanRaw);
  const selectedJurusanCode = normFormValue(generateJurusanCode(selectedJurusanRaw));

  const filteredDudi = useMemo(() => {
    if (field.relationSource !== 'dudi') return [];
    const checkJurusan = (namaNorm: string, bidangNorm: string): boolean => {
      if (!selectedJurusanNorm) return false;
      return Boolean(
        (bidangNorm &&
          (bidangNorm.includes(selectedJurusanNorm) ||
            (selectedJurusanCode && bidangNorm.includes(selectedJurusanCode)))) ||
          (selectedJurusanCode && namaNorm.includes(selectedJurusanCode))
      );
    };

    return indexedDudi
      .filter((item) => (!deferredQuery ? true : item.searchNorm.includes(deferredQuery)))
      .sort((a, b) => {
        const aMatch = checkJurusan(a.namaNorm, a.bidangNorm) ? 0 : 1;
        const bMatch = checkJurusan(b.namaNorm, b.bidangNorm) ? 0 : 1;
        if (aMatch !== bMatch) return aMatch - bMatch;
        return String(a.raw.namaDudi || '').localeCompare(String(b.raw.namaDudi || ''));
      })
      .slice(0, 25)
      .map((x) => x.raw);
  }, [field.relationSource, indexedDudi, deferredQuery, selectedJurusanNorm, selectedJurusanCode]);

  const filteredGuru = useMemo(() => {
    if (field.relationSource !== 'guru') return [];
    return masterGuru
      .filter((g) => {
        if (!deferredQuery) return true;
        const hay = `${normFormValue(g.nama)} ${normFormValue(g.nip)} ${normFormValue(g.peranUtama)} ${normFormValue(g.id)}`;
        return hay.includes(deferredQuery);
      })
      .sort((a, b) => {
        const aStarts = deferredQuery && normFormValue(a.nama).startsWith(deferredQuery) ? 0 : 1;
        const bStarts = deferredQuery && normFormValue(b.nama).startsWith(deferredQuery) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return String(a.nama || '').localeCompare(String(b.nama || ''));
      })
      .slice(0, 30);
  }, [field.relationSource, masterGuru, deferredQuery]);

  if (field.relationSource === 'siswa') {
    const isNisField = key === 'nis';
    const nisDigits = isNisField ? stripNisSymbols(val) : '';
    const displayVal = isNisField ? formatNisVisual(nisDigits, '') : val;
    const filtered = filteredStudents;

    return (
      <div className="relative">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            inputMode={isNisField ? 'numeric' : undefined}
            value={displayVal}
            autoComplete="off"
            onFocus={() => setOpenAutocompleteKey(key)}
            onBlur={() => setTimeout(() => setOpenAutocompleteKey((k) => (k === key ? null : k)), 140)}
            onKeyDown={(e) => {
              if (!isNisField) return;
              handleNisKeyDown(e, nisDigits, (nextDigits, nextPos) => {
                const inputEl = e.currentTarget;
                setValue(key, nextDigits);
                setOpenAutocompleteKey(key);
                if (nextDigits.length >= 4) {
                  const exactMatch = studentDirectory.find((s) => stripNisSymbols(s.nis) === nextDigits);
                  if (exactMatch) applyStudentSelection(exactMatch, { [key]: nextDigits });
                }
                if (nextPos !== undefined) {
                  requestAnimationFrame(() => {
                    try {
                      inputEl.setSelectionRange(nextPos, nextPos);
                    } catch {
                      // ignore
                    }
                  });
                }
              });
            }}
            onChange={(e) => {
              if (isNisField) {
                processNisInputChange(e, (nextDigits) => {
                  setValue(key, nextDigits);
                  setOpenAutocompleteKey(key);
                  if (nextDigits.length >= 4) {
                    const exactMatch = studentDirectory.find((s) => stripNisSymbols(s.nis) === nextDigits);
                    if (exactMatch) applyStudentSelection(exactMatch, { [key]: nextDigits });
                  }
                });
                return;
              }
              const next = e.target.value;
              setValue(key, next);
              setOpenAutocompleteKey(key);
              const qTrim = next.trim();
              if (qTrim.length >= 4) {
                const qDigits = getCanonicalNisDigits(qTrim);
                const nisExact = studentDirectory.filter(
                  (s) => qDigits !== '' && getCanonicalNisDigits(s.nis) === qDigits
                );
                const nameExact = studentDirectory.filter((s) => normFormValue(s.nama) === normFormValue(qTrim));
                const exactMatch = nisExact.length === 1 ? nisExact[0] : nameExact.length === 1 ? nameExact[0] : undefined;
                if (exactMatch) applyStudentSelection(exactMatch, { [key]: next });
              }
            }}
            placeholder={
              loadingRelations
                ? 'Memuat daftar siswa...'
                : isNisField
                ? 'Ketik angka NIS (cth: 23241/001/001)...'
                : field.placeholder || 'Ketik nama atau NIS siswa...'
            }
            className={`w-full h-10 pl-8 pr-8 bg-white border rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors ${
              isNisField ? 'font-mono tabular-nums' : ''
            } ${err ? 'border-rose-400 focus:ring-rose-400/30' : 'border-slate-300'}`}
          />
          {displayVal && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setValue(key, '');
                setOpenAutocompleteKey(key);
              }}
              aria-label="Bersihkan pencarian"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {isDropdownOpen && (
          <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto py-1">
            {loadingRelations ? (
              <div className="px-3 py-2.5 text-xs text-slate-500">Memuat daftar siswa dari Cloud Server...</div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-2.5 text-xs text-slate-500">
                {field.allowCustomValue === false
                  ? `Tidak ada siswa cocok dengan "${displayVal}". Data siswa wajib terdaftar terlebih dahulu di Master Siswa.`
                  : `Tidak ada siswa cocok dengan "${displayVal}". Anda tetap dapat menyimpan input manual ini.`}
              </div>
            ) : (
              filtered.map((stu, idx) => {
                const isCurrent =
                  (key === 'nis' && nisDigits !== '' && stripNisSymbols(stu.nis) === nisDigits) ||
                  (key !== 'nis' && normFormValue(stu.nama) === query);
                const prefDudi = resolvePreferredDudi(stu).dudiTujuan;
                return (
                  <button
                    type="button"
                    key={`${stu.nis || stu.nama}_${idx}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyStudentSelection(stu);
                      setOpenAutocompleteKey(null);
                    }}
                    className={`w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                      isCurrent ? 'bg-blue-50/80' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 truncate">
                        {stu.nama}{' '}
                        <span className="font-mono text-[11px] font-normal text-slate-500">
                          ({stu.nis ? formatNisVisual(stu.nis) : 'Tanpa NIS'})
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {stu.kelas || '-'} · {stu.jurusan || '-'}
                        {prefDudi ? ` · DUDI: ${prefDudi}` : ''}
                      </div>
                    </div>
                    {isCurrent && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    );
  }

  if (field.relationSource === 'dudi') {
    const isJurusanMatchedDudi = (d: Dudi): boolean => {
      if (!selectedJurusanNorm) return false;
      const bidang = normFormValue(d.bidangKeahlian);
      const nama = normFormValue(d.namaDudi);
      return Boolean(
        (bidang && (bidang.includes(selectedJurusanNorm) || (selectedJurusanCode && bidang.includes(selectedJurusanCode)))) ||
          (selectedJurusanCode && nama.includes(selectedJurusanCode))
      );
    };

    return (
      <div className="relative">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={val}
            autoComplete="off"
            onFocus={() => setOpenAutocompleteKey(key)}
            onBlur={() => setTimeout(() => setOpenAutocompleteKey((k) => (k === key ? null : k)), 140)}
            onChange={(e) => {
              const next = e.target.value;
              onDudiManualEdit();
              setValue(key, next);
              setOpenAutocompleteKey(key);
              const exact = masterDudi.find((d) => normFormValue(d.namaDudi) === normFormValue(next));
              if (exact) applyDudiSelection(exact, key, next);
            }}
            placeholder={
              loadingRelations ? 'Memuat daftar DUDI...' : field.placeholder || 'Ketik atau pilih nama DUDI mitra...'
            }
            className={`w-full h-10 pl-8 pr-8 bg-white border rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors ${
              err ? 'border-rose-400 focus:ring-rose-400/30' : 'border-slate-300'
            }`}
          />
          {val && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onDudiManualEdit();
                setValue(key, '');
                setOpenAutocompleteKey(key);
              }}
              aria-label="Bersihkan pencarian"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {isDropdownOpen && (
          <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto py-1">
            {loadingRelations ? (
              <div className="px-3 py-2.5 text-xs text-slate-500">Memuat daftar DUDI dari Cloud Server...</div>
            ) : filteredDudi.length === 0 ? (
              <div className="px-3 py-2.5 text-xs text-slate-500">
                Tidak ada mitra DUDI cocok dengan &quot;{val}&quot;. Anda tetap dapat menggunakan nama manual ini.
              </div>
            ) : (
              filteredDudi.map((d, idx) => {
                const isCurrent = normFormValue(d.namaDudi) === query;
                const jurusanFit = isJurusanMatchedDudi(d);
                return (
                  <button
                    type="button"
                    key={`${d.id || d.namaDudi}_${idx}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyDudiSelection(d, key);
                      setOpenAutocompleteKey(null);
                    }}
                    className={`w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                      isCurrent ? 'bg-blue-50/80' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 truncate flex items-center gap-1.5">
                        <span className="truncate">{d.namaDudi}</span>
                        <span className="text-[11px] font-normal text-slate-500 shrink-0">
                          ({d.terisi ?? 0}/{d.kuotaMaksimal ?? 0})
                        </span>
                        {jurusanFit && (
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded shrink-0">
                            Sesuai Jurusan
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {d.wilayahKota ? `${d.wilayahKota} · ` : ''}
                        {d.alamat || '-'}
                        {d.guruPendamping ? ` · Pendamping: ${d.guruPendamping}` : ''}
                      </div>
                    </div>
                    {isCurrent && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    );
  }

  if (field.relationSource === 'guru') {
    return (
      <div className="relative">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={val}
            autoComplete="off"
            onFocus={() => setOpenAutocompleteKey(key)}
            onBlur={() => setTimeout(() => setOpenAutocompleteKey((k) => (k === key ? null : k)), 140)}
            onChange={(e) => {
              const next = e.target.value;
              setOpenAutocompleteKey(key);
              const exact = masterGuru.find((g) => normFormValue(g.nama) === normFormValue(next));
              if (exact) {
                applyGuruSelection(exact, key, next);
              } else {
                setMultipleValues({
                  [key]: next,
                  ...(key === 'namaKakomli'
                    ? values.idKakomli !== undefined
                      ? { idKakomli: '' }
                      : {}
                    : values.idGuruPendamping !== undefined
                      ? { idGuruPendamping: '' }
                      : {}),
                });
              }
            }}
            placeholder={
              loadingRelations
                ? 'Memuat daftar Guru Pendamping...'
                : field.placeholder || 'Ketik nama atau NIP Guru Pendamping...'
            }
            className={`w-full h-10 pl-8 pr-8 bg-white border rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors ${
              err ? 'border-rose-400 focus:ring-rose-400/30' : 'border-slate-300'
            }`}
          />
          {val && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setMultipleValues({
                  [key]: '',
                  ...(key === 'namaKakomli'
                    ? values.idKakomli !== undefined
                      ? { idKakomli: '' }
                      : {}
                    : values.idGuruPendamping !== undefined
                      ? { idGuruPendamping: '' }
                      : {}),
                });
                setOpenAutocompleteKey(key);
              }}
              aria-label="Bersihkan pencarian"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {isDropdownOpen && (
          <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto py-1">
            {loadingRelations ? (
              <div className="px-3 py-2.5 text-xs text-slate-500">
                Memuat daftar Guru Pendamping dari Cloud Server...
              </div>
            ) : filteredGuru.length === 0 ? (
              <div className="px-3 py-2.5 text-xs text-slate-500">
                {field.allowCustomValue === false
                  ? `Tidak ada guru pendamping cocok dengan "${val}". Pilih dari daftar Master Guru.`
                  : `Tidak ada guru pendamping cocok dengan "${val}".`}
              </div>
            ) : (
              filteredGuru.map((g, idx) => {
                const isCurrent = normFormValue(g.nama) === query;
                return (
                  <button
                    type="button"
                    key={`${g.id || g.nama}_${idx}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyGuruSelection(g, key);
                      setOpenAutocompleteKey(null);
                    }}
                    className={`w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                      isCurrent ? 'bg-blue-50/80' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 truncate">
                        {g.nama}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {g.peranUtama || 'Guru Pendamping'}
                        {g.nip && g.nip !== '-' ? ` · NIP: ${g.nip}` : ''}
                        {g.kontakWA && g.kontakWA !== '-' ? ` · WA: ${g.kontakWA}` : ''}
                      </div>
                    </div>
                    {isCurrent && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    );
  }

  return null;
}
