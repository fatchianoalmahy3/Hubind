import React from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight } from 'lucide-react';
import { formatNisVisual } from '../../core/utils/nisHelpers';

interface WizardStep2BioProps {
  studentData: any;
  telepon: string;
  alamatDomisili: string;
  namaOrtu: string;
  teleponOrtu: string;
  bioError: string;
  onChangeTelepon: (val: string) => void;
  onChangeAlamatDomisili: (val: string) => void;
  onChangeNamaOrtu: (val: string) => void;
  onChangeTeleponOrtu: (val: string) => void;
  onBackToStep1: () => void;
  onNextStep: () => void;
}

export const WizardStep2Bio: React.FC<WizardStep2BioProps> = ({
  studentData,
  telepon,
  alamatDomisili,
  namaOrtu,
  teleponOrtu,
  bioError,
  onChangeTelepon,
  onChangeAlamatDomisili,
  onChangeNamaOrtu,
  onChangeTeleponOrtu,
  onBackToStep1,
  onNextStep,
}) => {
  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      <div className="p-3.5 bg-blue-50/80 border border-blue-200/80 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs text-blue-900">
        <div>
          <span className="font-bold">{studentData.nama}</span>
          <span className="text-blue-700">
            {' '}· NIS {formatNisVisual(studentData.nis)} · {studentData.kelas}
          </span>
        </div>
        <button
          type="button"
          onClick={onBackToStep1}
          className="text-blue-700 font-semibold hover:underline cursor-pointer"
        >
          Ganti Siswa
        </button>
      </div>

      <div>
        <h3 className="text-sm font-bold text-slate-900">
          Langkah 2: Lengkapi Bio Siswa &amp; Orang Tua / Wali
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Lengkapi seluruh data kontak dan domisili berikut untuk keperluan surat izin orang tua dan komunikasi pembimbing.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
        <div>
          <label className="block text-slate-700 font-semibold mb-1.5">
            Nomor WhatsApp Siswa *
          </label>
          <input
            type="tel"
            inputMode="tel"
            value={telepon}
            onChange={(e) => onChangeTelepon(e.target.value)}
            placeholder="08xxxxxxxxxx"
            required
            className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
        <div>
          <label className="block text-slate-700 font-semibold mb-1.5">
            Nama Orang Tua / Wali *
          </label>
          <input
            type="text"
            value={namaOrtu}
            onChange={(e) => onChangeNamaOrtu(e.target.value)}
            placeholder="Nama lengkap orang tua / wali"
            required
            className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-slate-700 font-semibold mb-1.5">
            Alamat Domisili Siswa *
          </label>
          <input
            type="text"
            value={alamatDomisili}
            onChange={(e) => onChangeAlamatDomisili(e.target.value)}
            placeholder="Jalan, RT/RW, Desa/Kelurahan, Kecamatan, Kabupaten"
            required
            className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-slate-700 font-semibold mb-1.5">
            Nomor Telepon / WhatsApp Orang Tua (Kontak Darurat) *
          </label>
          <input
            type="tel"
            inputMode="tel"
            value={teleponOrtu}
            onChange={(e) => onChangeTeleponOrtu(e.target.value)}
            placeholder="08xxxxxxxxxx"
            required
            className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
      </div>

      {bioError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          <span>{bioError}</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={onBackToStep1}
          className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali</span>
        </button>
        <button
          type="button"
          onClick={onNextStep}
          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs flex items-center gap-2 cursor-pointer"
        >
          <span>Lanjut Pilih DUDI</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
