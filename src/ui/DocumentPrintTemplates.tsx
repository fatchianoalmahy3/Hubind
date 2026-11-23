import React from 'react';
import type {
  AktivitasSikapRating,
  BukuLaporanStatus,
  KondisiBengkelCheck,
} from '../core/types/schema';
import { formatIndonesianDate } from '../core/utils/dateHelpers';
import {
  getStageValueByNumber,
  normalizeSignatureSvgPath,
  parseRangePair,
} from '../core/utils/monitoringHelpers';

export interface BundleStudentItem {
  nis: string;
  namaSiswa: string;
  kelas: string;
  jurusan: string;
  hasStageLog?: boolean;
  tanggalMonitoring?: string;
  sakit?: number;
  izin?: number;
  alpha?: number;
  bukuLaporan?: BukuLaporanStatus | '';
  dp?: AktivitasSikapRating | '';
  mt?: AktivitasSikapRating | '';
  krt?: AktivitasSikapRating | '';
  kompetensiList?: string[];
  kondisiBengkel?: KondisiBengkelCheck;
  ttdSiswa?: string;
  catatan?: string;
}

export interface SuratTugas0708Props {
  nomorSurat: string;
  tanggalSurat: string;
  kepalaSekolah: string;
  namaGuru: string;
  jabatanGuru?: string;
  alamatGuru?: string;
  tahapNum: number;
  namaDudi: string;
  alamatDudi: string;
  namaPemimpinDudi?: string;
  tanggalPenugasan?: string;
}

export interface OfficialSchoolKop0708Props {
  variant?: 'surat_tugas' | 'school';
  showRightLogo?: boolean;
}

export const OfficialSchoolKop0708: React.FC<OfficialSchoolKop0708Props> = ({
  variant = 'school',
  showRightLogo,
}) => {
  const isSuratTugas = variant === 'surat_tugas' || showRightLogo === false;

  return (
    <div className="border-b-[3px] border-double border-blue-900 pb-1.5 mb-2.5 flex items-center gap-3">
      {isSuratTugas ? (
        <div className="w-28 h-28 ml-1 shrink-0 flex items-center justify-center">
          <img
            src="/assets/logo-pgri.png"
            alt="Logo PGRI"
            className="w-28 h-28 object-contain"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      ) : (
        <div className="w-24 h-24 ml-1 shrink-0 flex items-center justify-center">
          <img
            src="/assets/logo-smk-pgri2.png"
            alt="Logo SMK PGRI 2 Ponorogo"
            className="w-24 h-24 object-contain"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      )}

      <div className="flex-1 text-center font-serif leading-[1.2] min-w-0">
        {isSuratTugas && (
          <>
            <div className="text-[10.5pt] font-bold uppercase tracking-[0.02em] text-blue-900">
              PERWAKILAN YAYASAN PEMBINA LEMBAGA PENDIDIKAN
            </div>
            <div className="text-[10.5pt] font-bold uppercase tracking-[0.02em] text-blue-900">
              PERSATUAN GURU REPUBLIK INDONESIA ( YPLP-PGRI )
            </div>
            <div className="text-[10.5pt] font-bold uppercase tracking-[0.02em] text-blue-900">
              KABUPATEN PONOROGO - JAWA TIMUR
            </div>
          </>
        )}
        <div className="text-[18pt] font-bold uppercase tracking-[0.03em] text-red-700 leading-tight mt-0.5">
          SMK PGRI 2 PONOROGO
        </div>
        <div className="text-[10.5pt] font-bold uppercase tracking-[0.03em] text-blue-900">
          TERAKREDITASI A
        </div>
        <div className="text-[9.5pt] text-blue-950 mt-0.5">
          Alamat : Jl. Soekarno - Hatta , Kertosari, Babadan, Ponorogo, Telp. 0352-461821/Fax. 0352-462659
        </div>
        <div className="text-[9.5pt] text-blue-950">
          Website : <span className="underline">www.smkpgri2ponorogo.com</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; E-mail : smkpgri2ponorogo@yahoo.com
        </div>
      </div>
    </div>
  );
};

export const SuratTugas0708Sheet: React.FC<SuratTugas0708Props> = ({
  nomorSurat,
  tanggalSurat,
  kepalaSekolah,
  namaGuru,
  jabatanGuru = 'Guru SMK PGRI 2 Ponorogo',
  alamatGuru = 'Jl. Soekarno – Hatta Telp. 0352-461821 Ponorogo',
  tahapNum,
  namaDudi,
  alamatDudi,
  namaPemimpinDudi,
  tanggalPenugasan,
}) => {
  // Keperluan mapping strictly per agreed 8-stage workflow:
  // Tahap 1 -> Kotak 2 (Penyerahan)
  // Tahap 2..7 -> Kotak 3 (Monitoring)
  // Tahap 8 -> Kotak 4 (Pemohonan data Raport PKL / Penarikan)
  const activeBox = tahapNum === 1 ? 2 : tahapNum >= 8 ? 4 : 3;

  const renderCheckBox = (filled: boolean) => (
    <span
      className={`inline-block w-5 h-3 border border-slate-900 rounded-[2px] align-middle shrink-0 ${
        filled ? 'bg-slate-950' : 'bg-white'
      }`}
      aria-label={filled ? 'Terpilih' : 'Tidak terpilih'}
    />
  );

  return (
    <table className="hubin-doc-shell font-serif text-slate-950 text-[12pt] leading-[1.3]">
      <tbody>
        <tr>
          <td>
            <OfficialSchoolKop0708 variant="surat_tugas" />

        <div className="text-center mt-1.5 mb-3">
          <div className="text-[13pt] font-bold uppercase underline tracking-[0.16em]">
            SURAT TUGAS
          </div>
          <div className="text-[12pt] font-serif mt-0.5">
            NOMOR &nbsp;: {nomorSurat}
          </div>
        </div>

        <div className="space-y-2.5 px-1">
          <div>
            <div>Yang bertandatangan di bawah ini :</div>
            <table className="w-full mt-0.5 ml-5 text-[12pt] border-collapse">
              <tbody>
                <tr>
                  <td className="w-28 py-0.5 align-top">Nama</td>
                  <td className="w-4 py-0.5 align-top">:</td>
                  <td className="py-0.5 font-semibold">{kepalaSekolah || '.........................................'}</td>
                </tr>
                <tr>
                  <td className="py-0.5 align-top">Jabatan</td>
                  <td className="py-0.5 align-top">:</td>
                  <td className="py-0.5">Kepala SMK PGRI 2 Ponorogo</td>
                </tr>
                <tr>
                  <td className="py-0.5 align-top">Alamat</td>
                  <td className="py-0.5 align-top">:</td>
                  <td className="py-0.5">Jl. Soekarno – Hatta Telp. 0352-461821 Ponorogo</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div>
            <div>Menugaskan Kepada:</div>
            <table className="w-full mt-0.5 ml-5 text-[12pt] border-collapse">
              <tbody>
                <tr>
                  <td className="w-28 py-0.5 align-top">Nama</td>
                  <td className="w-4 py-0.5 align-top">:</td>
                  <td className="py-0.5 font-bold">{namaGuru || '.........................................'}</td>
                </tr>
                <tr>
                  <td className="py-0.5 align-top">Jabatan</td>
                  <td className="py-0.5 align-top">:</td>
                  <td className="py-0.5">{jabatanGuru || 'Guru SMK PGRI 2 Ponorogo'}</td>
                </tr>
                <tr>
                  <td className="py-0.5 align-top">Alamat</td>
                  <td className="py-0.5 align-top">:</td>
                  <td className="py-0.5">{alamatGuru}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div>
            <table className="w-full text-[12pt] border-collapse">
              <tbody>
                <tr>
                  <td className="w-28 py-0.5 align-top">Keperluan</td>
                  <td className="w-4 py-0.5 align-top">:</td>
                  <td className="py-0.5">
                    <div className="space-y-1 mt-0.5">
                      <div className="flex items-center gap-2.5">
                        {renderCheckBox(false)}
                        <span>Permohonan Penempatan Peserta Didik Praktek Kerja Industri</span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        {renderCheckBox(activeBox === 2)}
                        <span>Penyerahan Peserta Didik Praktek Kerja Industri</span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        {renderCheckBox(activeBox === 3)}
                        <span>Monitoring Peserta Didik Kerja Industri</span>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <span className="mt-1">{renderCheckBox(activeBox === 4)}</span>
                        <span>
                          Pemohonan Diri data Raport PKL dari Pelaksanaan Praktek Kerja Industri
                        </span>
                      </div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <table className="w-full text-[12pt] border-collapse mt-1">
            <tbody>
              <tr>
                <td className="w-28 py-0.5 align-top">Tempat</td>
                <td className="w-4 py-0.5 align-top">:</td>
                <td className="py-0.5 font-bold">{namaDudi || '.........................................'}</td>
              </tr>
              <tr>
                <td className="py-0.5 align-top">Alamat</td>
                <td className="py-0.5 align-top">:</td>
                <td className="py-0.5">{alamatDudi && alamatDudi !== '-' ? alamatDudi : '.........................................'}</td>
              </tr>
              <tr>
                <td className="py-0.5 align-top">Tanggal</td>
                <td className="py-0.5 align-top">:</td>
                <td className="py-0.5">{tanggalPenugasan || tanggalSurat || '.........................................'}</td>
              </tr>
            </tbody>
          </table>

          <p className="pt-0.5">
            Demikian surat tugas ini dibuat untuk dilaksanakan dengan penuh tanggungjawab.
          </p>

          <div className="grid grid-cols-2 gap-6 pt-2 text-[12pt] print-avoid-break">
            <div className="text-center">
              <div className="invisible">Ponorogo, {tanggalSurat}</div>
              <div>Yang diberi Tugas</div>
              <div className="h-14" />
              <div className="font-bold underline">
                {namaGuru || '.........................................'}
              </div>
            </div>

            <div className="text-center">
              <div>Ponorogo, {tanggalSurat}</div>
              <div>Kepala SMK PGRI 2 Ponorogo</div>
              <div className="h-14" />
              <div className="font-bold underline">
                {kepalaSekolah || '.........................................'}
              </div>
            </div>
          </div>

          <div className="text-center pt-2 text-[12pt] print-avoid-break">
            <div>Mengetahui,</div>
            <div>Pimpinan / Direktur</div>
            <div className="text-[11pt] text-slate-700 mt-0.5">{namaDudi}</div>
            <div className="h-12" />
            <div className="font-bold underline">
              {namaPemimpinDudi && namaPemimpinDudi !== '-'
                ? namaPemimpinDudi
                : '.........................................'}
            </div>
            <div>NIP. .........................................</div>
          </div>
        </div>
          </td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <td>
            <div className="pt-3 mt-2 space-y-1.5 px-1">
              <div className="text-[10.5pt]">
                NB : Surat Tugas harap dikembalikan ke Waka Hubungan Industri selambat-lambatnya 2 minggu setelah surat di terbitkan
              </div>
              <div className="flex items-end justify-between text-[9.5pt] font-sans text-slate-600 border-t border-slate-300 pt-1">
                <div>Format : 07 . 08</div>
                <div className="text-right leading-tight">
                  <div>Halaman 1 dari 1</div>
                  <div>Revisi : 11/11/2026</div>
                </div>
              </div>
            </div>
          </td>
        </tr>
      </tfoot>
    </table>
  );
};

export interface LembarMonitoring0701Props {
  tahapNum: number;
  activeYear: string;
  namaBengkel: string;
  alamatBengkel: string;
  pemimpinBengkel: string;
  noTelpBengkel: string;
  hariKerja?: string;
  jamKerja?: string;
  students: BundleStudentItem[];
  namaPetugas: string;
  tanggalSurat: string;
  kompetensiList?: string[];
  keadaanBengkel?: KondisiBengkelCheck;
  catatanLain?: string;
}

export const LembarMonitoring0701Sheet: React.FC<LembarMonitoring0701Props> = ({
  tahapNum,
  activeYear,
  namaBengkel,
  alamatBengkel,
  pemimpinBengkel,
  noTelpBengkel,
  hariKerja,
  jamKerja,
  students,
  namaPetugas,
  tanggalSurat,
  kompetensiList,
  keadaanBengkel,
  catatanLain,
}) => {
  const stageLabel = getStageValueByNumber(tahapNum);
  const displayRows: BundleStudentItem[] =
    students.length > 0
      ? students
      : [{ nis: '', namaSiswa: '....................................................', kelas: '', jurusan: '' }];

  const hariRange = parseRangePair(hariKerja, '', '');
  const jamRange = parseRangePair(jamKerja, '', '');
  const hariDisplay =
    hariRange.start && hariRange.end
      ? `${hariRange.start} s/d ${hariRange.end}`
      : hariKerja && hariKerja.trim() && hariKerja.trim() !== '-'
      ? hariKerja.trim()
      : '............................ s/d ............................';
  const jamDisplay =
    jamRange.start && jamRange.end
      ? `${jamRange.start} s/d ${jamRange.end}`
      : jamKerja && jamKerja.trim() && jamKerja.trim() !== '-'
      ? jamKerja.trim()
      : '............................ s/d ............................';

  const firstMonitorDate = displayRows.find((s) => s.tanggalMonitoring)?.tanggalMonitoring || '';
  const monitorTglDisplay = firstMonitorDate
    ? formatIndonesianDate(firstMonitorDate, firstMonitorDate)
    : '......................';

  const resolvedKompetensi =
    (kompetensiList && kompetensiList.filter(Boolean).length > 0
      ? kompetensiList.filter(Boolean)
      : displayRows.find((s) => Array.isArray(s.kompetensiList) && s.kompetensiList.length > 0)
          ?.kompetensiList?.filter(Boolean)) || [];
  const kompetensiLineCount = Math.max(4, resolvedKompetensi.length);

  const resolvedBengkel =
    keadaanBengkel ||
    displayRows.find(
      (s) =>
        s.kondisiBengkel &&
        (s.kondisiBengkel.volumePekerjaan ||
          s.kondisiBengkel.relevansiPekerjaan ||
          s.kondisiBengkel.kenyamanan ||
          s.kondisiBengkel.kelayakan)
    )?.kondisiBengkel;

  const bengkelAspectRows: Array<{ key: keyof KondisiBengkelCheck; label: string }> = [
    { key: 'volumePekerjaan', label: 'Volume Pekerjaan' },
    { key: 'relevansiPekerjaan', label: 'Relevansi Pekerjaan' },
    { key: 'kenyamanan', label: 'Kenyamanan' },
    { key: 'kelayakan', label: 'Kelayakan' },
  ];

  const resolvedCatatan =
    (catatanLain && catatanLain.trim()) ||
    displayRows
      .map((s) => (s.catatan || '').trim())
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .join('; ');

  return (
    <div className="hubin-doc-flow hubin-monitoring-sheet font-sans text-slate-950 text-[10.5pt] leading-[1.22] space-y-2.5">
      <div className="border-b-2 border-slate-900 pb-2 flex items-center gap-3">
        <div className="w-20 h-20 shrink-0 flex items-center justify-center">
          <img
            src="/assets/logo-smk-pgri2.png"
            alt="Logo SMK PGRI 2 Ponorogo"
            className="w-20 h-20 object-contain"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
        <div className="flex-1 text-center min-w-0 leading-[1.2]">
          <div className="text-[12.5pt] font-extrabold uppercase tracking-wide">LEMBAR MONITORING</div>
          <div className="text-[10.5pt] font-bold uppercase mt-0.5">
            TAHAP {tahapNum} ({stageLabel})
          </div>
          <div className="text-[10.5pt] font-bold uppercase">PRAKERIN TAHUN {activeYear}</div>
          <div className="text-[10.5pt] font-bold uppercase">SMK PGRI 2 PONOROGO</div>
        </div>
        <div className="w-20 shrink-0" aria-hidden="true" />
      </div>

      {/* 1. Identitas Bengkel */}
      <div>
        <div className="font-bold">1. Identitas Bengkel (Dudi)</div>
        <table className="w-full ml-3 mt-0.5 text-[10.5pt] border-collapse">
          <tbody>
            <tr>
              <td className="w-36 py-[1px]">1. Nama Bengkel</td>
              <td className="w-3 py-[1px]">:</td>
              <td className="py-[1px] font-bold">{namaBengkel || '-'}</td>
            </tr>
            <tr>
              <td className="py-[1px]">2. Alamat</td>
              <td className="py-[1px]">:</td>
              <td className="py-[1px]">{alamatBengkel && alamatBengkel !== '-' ? alamatBengkel : '-'}</td>
            </tr>
            <tr>
              <td className="py-[1px]">3. Pemimpin</td>
              <td className="py-[1px]">:</td>
              <td className="py-[1px]">
                {pemimpinBengkel && pemimpinBengkel !== '-'
                  ? pemimpinBengkel
                  : '....................................................'}
              </td>
            </tr>
            <tr>
              <td className="py-[1px]">4. No. Telp.</td>
              <td className="py-[1px]">:</td>
              <td className="py-[1px] font-mono">
                {noTelpBengkel && noTelpBengkel !== '-'
                  ? noTelpBengkel
                  : '....................................................'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 2. Hari / Jam Masuk Kerja */}
      <div>
        <div className="font-bold">2. Hari / Jam Masuk Kerja</div>
        <table className="w-full ml-3 mt-0.5 text-[10.5pt] border-collapse">
          <tbody>
            <tr>
              <td className="w-36 py-[1px]">1. Hari Kerja</td>
              <td className="w-3 py-[1px]">:</td>
              <td className="py-[1px] font-medium">{hariDisplay}</td>
            </tr>
            <tr>
              <td className="py-[1px]">2. Jam Kerja</td>
              <td className="py-[1px]">:</td>
              <td className="py-[1px] font-medium">{jamDisplay}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 3. Presensi Siswa */}
      <div>
        <div className="font-bold mb-0.5">3. Presensi Siswa :</div>
          <table className="w-full border-collapse border border-slate-900 text-[9pt]">
            <thead>
              <tr className="bg-slate-100">
                <th rowSpan={2} className="border border-slate-900 px-1 py-0.5 w-6 text-center">
                  No
                </th>
                <th rowSpan={2} className="border border-slate-900 px-1.5 py-0.5 text-left">
                  Nama Siswa
                </th>
                <th colSpan={3} className="border border-slate-900 px-1 py-0.5 text-center leading-tight">
                  Monitor<br />
                  Tgl {monitorTglDisplay}
                </th>
                <th colSpan={3} className="border border-slate-900 px-1 py-0.5 text-center leading-tight">
                  Chek List<br />
                  Buku Laporan
                </th>
                <th colSpan={3} className="border border-slate-900 px-1 py-0.5 text-center leading-tight">
                  Aktivitas Siswa
                </th>
                <th rowSpan={2} className="border border-slate-900 px-1 py-0.5 w-24 text-center leading-tight">
                  Tanda Tangan Siswa
                </th>
              </tr>
              <tr className="bg-slate-50">
                <th className="border border-slate-900 px-1 py-[1px] w-5 text-center">S</th>
                <th className="border border-slate-900 px-1 py-[1px] w-5 text-center">I</th>
                <th className="border border-slate-900 px-1 py-[1px] w-5 text-center">A</th>
                <th className="border border-slate-900 px-0.5 py-[1px] w-7 text-center">BLM</th>
                <th className="border border-slate-900 px-0.5 py-[1px] w-7 text-center">SDH</th>
                <th className="border border-slate-900 px-0.5 py-[1px] w-7 text-center">TDK</th>
                <th className="border border-slate-900 px-0.5 py-[1px] w-8 text-center">DP</th>
                <th className="border border-slate-900 px-0.5 py-[1px] w-8 text-center">MT</th>
                <th className="border border-slate-900 px-0.5 py-[1px] w-8 text-center">KRT</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((stu, idx) => {
                const sig = normalizeSignatureSvgPath(stu.ttdSiswa);
                return (
                  <tr key={`${stu.nis || 'row'}_${idx}`}>
                    <td className="border border-slate-900 px-1 py-0.5 text-center">{idx + 1}</td>
                    <td className="border border-slate-900 px-1.5 py-0.5 font-semibold">{stu.namaSiswa}</td>
                    <td className="border border-slate-900 px-1 py-0.5 text-center font-mono">
                      {stu.hasStageLog ? stu.sakit ?? 0 : ''}
                    </td>
                    <td className="border border-slate-900 px-1 py-0.5 text-center font-mono">
                      {stu.hasStageLog ? stu.izin ?? 0 : ''}
                    </td>
                    <td className="border border-slate-900 px-1 py-0.5 text-center font-mono">
                      {stu.hasStageLog ? stu.alpha ?? 0 : ''}
                    </td>
                    <td className="border border-slate-900 px-0.5 py-0.5 text-center font-bold">
                      {stu.bukuLaporan === 'BLM' ? '✓' : ''}
                    </td>
                    <td className="border border-slate-900 px-0.5 py-0.5 text-center font-bold">
                      {stu.bukuLaporan === 'SDH' ? '✓' : ''}
                    </td>
                    <td className="border border-slate-900 px-0.5 py-0.5 text-center font-bold">
                      {stu.bukuLaporan === 'TDK' ? '✓' : ''}
                    </td>
                    <td className="border border-slate-900 px-0.5 py-0.5 text-center text-[7.5pt] font-semibold">
                      {stu.dp || ''}
                    </td>
                    <td className="border border-slate-900 px-0.5 py-0.5 text-center text-[7.5pt] font-semibold">
                      {stu.mt || ''}
                    </td>
                    <td className="border border-slate-900 px-0.5 py-0.5 text-center text-[7.5pt] font-semibold">
                      {stu.krt || ''}
                    </td>
                    <td className="border border-slate-900 px-1 py-0.5 h-7 text-center align-middle">
                      {sig ? (
                        <svg viewBox={sig.viewBox} className="w-20 h-6 mx-auto">
                          <path
                            d={sig.pathD}
                            fill="none"
                            stroke="#0f172a"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        <div className="text-[8.5pt] text-slate-700 mt-1 leading-tight space-y-0.5">
          <div>
            <b>KET:</b> BLM : Belum Selesai Mengerjakan &nbsp;|&nbsp; SDH : Sudah Dikerjakan &nbsp;|&nbsp; TDK : Tidak Mengerjakan atau Tertinggal
          </div>
          <div>
            DP : Kedisiplinan (Kurang, Cukup, Baik) &nbsp;|&nbsp; MT : Motivasi (Kurang, Cukup, Baik) &nbsp;|&nbsp; KRT : Kreativitas (Kurang, Cukup, Baik)
          </div>
        </div>
      </div>

      {/* 4. Aktivitas Siswa */}
      <div className="print-avoid-break">
        <div className="font-bold">4. Aktivitas Siswa</div>
        <div className="ml-3 mt-0.5 space-y-0.5 leading-snug">
          <div>Kompetensi yang didapat :</div>
          {Array.from({ length: kompetensiLineCount }).map((_, idx) => (
            <div key={idx}>
              {idx + 1}.{' '}
              {resolvedKompetensi[idx] ? (
                <span className="font-medium">{resolvedKompetensi[idx]}</span>
              ) : (
                '..................................................................................................................'
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 5. Keadaan Bengkel */}
      <div className="print-avoid-break">
        <div className="font-bold mb-0.5">5. Keadaan Bengkel</div>
        <table className="w-full border-collapse border border-slate-900 text-[9.5pt]">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-900 px-1 py-0.5 w-7 text-center">No</th>
              <th className="border border-slate-900 px-1.5 py-0.5 text-left">Aspek Penilaian</th>
              <th className="border border-slate-900 px-1 py-0.5 text-center w-36">Baik / Sesuai / Layak</th>
              <th className="border border-slate-900 px-1 py-0.5 text-center w-20">Cukup</th>
              <th className="border border-slate-900 px-1 py-0.5 text-center w-36">Kurang / Tidak Sesuai</th>
            </tr>
          </thead>
          <tbody>
            {bengkelAspectRows.map((aspek, i) => {
              const val = resolvedBengkel?.[aspek.key] || '';
              return (
                <tr key={aspek.key}>
                  <td className="border border-slate-900 px-1 py-0.5 text-center">{i + 1}</td>
                  <td className="border border-slate-900 px-1.5 py-0.5">{aspek.label}</td>
                  <td className="border border-slate-900 px-1 py-0.5 text-center text-[11pt] leading-none">
                    {val === 'Baik' ? '☑' : '☐'}
                  </td>
                  <td className="border border-slate-900 px-1 py-0.5 text-center text-[11pt] leading-none">
                    {val === 'Cukup' ? '☑' : '☐'}
                  </td>
                  <td className="border border-slate-900 px-1 py-0.5 text-center text-[11pt] leading-none">
                    {val === 'Kurang' ? '☑' : '☐'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Catatan Lain & Tanda Tangan */}
      <div className="grid grid-cols-12 gap-3 pt-1 print-avoid-break">
        <div className="col-span-7 space-y-1">
          <div className="font-bold">Catatan Lain :</div>
          {resolvedCatatan ? (
            <div className="text-[9.5pt] leading-snug border-b border-dotted border-slate-700 pb-0.5 min-h-[2rem]">
              {resolvedCatatan}
            </div>
          ) : (
            <>
              <div className="border-b border-dotted border-slate-700 h-4" />
              <div className="border-b border-dotted border-slate-700 h-4" />
            </>
          )}
        </div>
        <div className="col-span-5 text-center">
          <div>Ponorogo, {tanggalSurat || '..... / ..... / 2026'}</div>
          <div className="font-semibold">Petugas Monitoring</div>
          <div className="h-10" />
          <div className="font-bold underline">
            {namaPetugas && namaPetugas !== '-' ? namaPetugas : '........................................'}
          </div>
        </div>
      </div>

      {/* Format Footer — mengikuti urutan langsung di bawah Catatan & TTD */}
      <div className="pt-2 print-avoid-break">
        <div className="flex items-center justify-between text-[9pt] font-sans text-slate-600 border-t border-slate-400 pt-1">
          <div>Format : 07 . 01</div>
          <div>Revisi : 11/11/2026</div>
        </div>
      </div>
    </div>
  );
};

export interface LembarPenilaianKurmerProps {
  namaSiswa: string;
  jurusan: string;
  kelas: string;
  namaDudi: string;
}

export const LembarPenilaianKurmerSheet: React.FC<LembarPenilaianKurmerProps> = ({
  namaSiswa,
  jurusan,
  kelas,
  namaDudi,
}) => {
  return (
    <table className="hubin-doc-shell font-sans text-slate-950 text-[12pt] leading-[1.16]">
      <tbody>
        <tr>
          <td>
            <div className="space-y-1.5">
        <div className="text-center pb-1.5 border-b-2 border-slate-900 leading-tight">
          <div className="text-[13.5pt] font-extrabold uppercase tracking-wide">
            LEMBAR PENILAIAN
          </div>
          <div className="text-[13.5pt] font-extrabold uppercase tracking-wide">
            PRAKTIK KERJA LAPANGAN
          </div>
        </div>

        <table className="w-full text-[12pt] border-collapse leading-tight">
          <tbody>
            <tr>
              <td className="w-36 py-[1px] font-semibold">Nama Peserta</td>
              <td className="w-4 py-[1px]">:</td>
              <td className="py-[1px] font-bold">{namaSiswa || '..........................................'}</td>
            </tr>
            <tr>
              <td className="py-[1px] font-semibold">Jurusan</td>
              <td className="py-[1px]">:</td>
              <td className="py-[1px]">{jurusan && jurusan !== '-' ? jurusan : '..........................................'}</td>
            </tr>
            <tr>
              <td className="py-[1px] font-semibold">Kelas</td>
              <td className="py-[1px]">:</td>
              <td className="py-[1px]">{kelas && kelas !== '-' ? kelas : '..........................................'}</td>
            </tr>
            <tr>
              <td className="py-[1px] font-semibold">Nama DUDI</td>
              <td className="py-[1px]">:</td>
              <td className="py-[1px] font-semibold">{namaDudi || '..........................................'}</td>
            </tr>
          </tbody>
        </table>

        <table className="w-full border-collapse border border-slate-900 text-[12pt] leading-[1.15]">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-900 px-1.5 py-1 w-9 text-center">NO</th>
              <th className="border border-slate-900 px-2 py-1 text-left">KRITERIA PENILAIAN</th>
              <th className="border border-slate-900 px-2 py-1 w-22 text-center">ANGKA</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-slate-900 px-1.5 py-1 text-center align-top font-bold">1</td>
              <td className="border border-slate-900 px-2 py-1">
                <div className="font-bold">
                  Menerapkan POS dan K3LH yang Ada Pada Dunia Kerja
                </div>
                <ul className="list-disc list-inside space-y-0.5 mt-0.5 text-[12pt] leading-[1.14]">
                  <li>
                    <b>Kepatuhan POS (Prosedur Operasi Standard):</b> Melaksanakan setiap tugas sesuai panduan dan arahan kerja resmi perusahaan/bengkel.
                  </li>
                  <li>
                    <b>Pelaksanaan K3LH (Keselamatan, Kesehatan Kerja &amp; Lingkungan Hidup):</b> Menggunakan Alat Pelindung Diri (APD) yang sesuai dan mengutamakan keselamatan diri serta lingkungan kerja.
                  </li>
                  <li>
                    <b>Kebersihan &amp; Kerapian Kerja:</b> Menjaga kebersihan area kerja dan merapikan peralatan setelah digunakan.
                  </li>
                </ul>
              </td>
              <td className="border border-slate-900 px-2 py-1" />
            </tr>
            <tr>
              <td className="border border-slate-900 px-1.5 py-1 text-center align-top font-bold">2</td>
              <td className="border border-slate-900 px-2 py-1">
                <div className="font-bold">
                  Menerapkan Softskills yang Dibutuhkan dalam Dunia Kerja
                </div>
                <ul className="list-disc list-inside space-y-0.5 mt-0.5 text-[12pt] leading-[1.14]">
                  <li>
                    <b>Ketepatan Masa &amp; Disiplin:</b> Menjaga kehadiran tepat waktu dan mematuhi peraturan jam kerja industri.
                  </li>
                  <li>
                    <b>Komunikasi &amp; Etika Kerja:</b> Berkomunikasi secara sopan, profesional, serta menjaga etika bersama rekan kerja dan pembimbing.
                  </li>
                  <li>
                    <b>Kerjasama Tim:</b> Mampu bekerjasama dalam tim dan berkontribusi aktif dalam menyelesaikan tugas.
                  </li>
                  <li>
                    <b>Inisiatif &amp; Adaptasi:</b> Menunjukkan sikap proaktif, kreatif, dan cepat menyesuaikan diri dengan lingkungan kerja.
                  </li>
                </ul>
              </td>
              <td className="border border-slate-900 px-2 py-1" />
            </tr>
            <tr>
              <td className="border border-slate-900 px-1.5 py-1 text-center align-top font-bold">3</td>
              <td className="border border-slate-900 px-2 py-1">
                <div className="font-bold">Menerapkan Kompetensi Teknis</div>
                <ul className="list-disc list-inside space-y-0.5 mt-0.5 text-[12pt] leading-[1.14]">
                  <li>
                    <b>Penguasaan Alat &amp; Teknologi:</b> Menggunakan peralatan dan perkakas kerja sesuai standar kompetensi keahlian.
                  </li>
                  <li>
                    <b>Kualitas Hasil Kerja:</b> Menghasilkan output pekerjaan yang teliti, rapi, dan memenuhi standar mutu industri.
                  </li>
                  <li>
                    <b>Penyelesaian Masalah (Problem Solving):</b> Mampu mengidentifikasi dan menyelesaikan masalah teknis dasar secara efektif.
                  </li>
                </ul>
              </td>
              <td className="border border-slate-900 px-2 py-1" />
            </tr>
            <tr>
              <td className="border border-slate-900 px-1.5 py-1 text-center align-top font-bold">4</td>
              <td className="border border-slate-900 px-2 py-1">
                <div className="font-bold">Memahami Alur Bisnis Dunia Kerja</div>
                <ul className="list-disc list-inside space-y-0.5 mt-0.5 text-[12pt] leading-[1.14]">
                  <li>
                    <b>Pemahaman Struktur Organisasi:</b> Memahami peran, fungsi, dan tanggung jawab setiap unit kerja di industri.
                  </li>
                  <li>
                    <b>Aliran Proses Kerja:</b> Memahami rantai proses mulai dari bahan/input, alur pengerjaan, hingga produk/layanan akhir.
                  </li>
                  <li>
                    <b>Budaya Industri &amp; Wawasan Usaha:</b> Memahami nilai-nilai utama perusahaan serta tujuan pelayanan/bisnis tempat praktik.
                  </li>
                </ul>
              </td>
              <td className="border border-slate-900 px-2 py-1" />
            </tr>
          </tbody>
        </table>

        <div className="space-y-0.5 pt-0.5 print-avoid-break">
          <div className="font-bold text-[12pt]">Rubrik Penilaian:</div>
          <table className="w-full border-collapse border border-slate-900 text-[12pt] leading-[1.14]">
            <tbody>
              <tr>
                <td className="border border-slate-900 px-1 py-1 text-center w-1/4">
                  <div className="font-bold">91 s/d 100 = SB</div>
                  <div>( Sangat Berkembang )</div>
                </td>
                <td className="border border-slate-900 px-1 py-1 text-center w-1/4">
                  <div className="font-bold">81 s/d 90 = BSH</div>
                  <div>( Berkembang Sesuai Harapan )</div>
                </td>
                <td className="border border-slate-900 px-1 py-1 text-center w-1/4">
                  <div className="font-bold">80 s/d 71 = MB</div>
                  <div>( Mulai Berkembang )</div>
                </td>
                <td className="border border-slate-900 px-1 py-1 text-center w-1/4">
                  <div className="font-bold">00 s/d 70 = BB</div>
                  <div>( Belum Berkembang )</div>
                </td>
              </tr>
              </tbody>
            </table>
          </div>
        </div>
          </td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <td>
            <div className="pt-1.5">
              <div className="flex items-end justify-between text-[9.5pt] font-sans text-slate-600 border-t border-slate-400 pt-1">
                <div>Format : 07 . 09</div>
                <div className="text-right leading-tight">
                  <div>Halaman 1 dari 1</div>
                  <div>Revisi : 11/11/2026</div>
                </div>
              </div>
            </div>
          </td>
        </tr>
      </tfoot>
    </table>
  );
};
