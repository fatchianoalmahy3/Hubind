import React from 'react';
import { Dudi, Pengajuan, Siswa } from '../../core/types/schema';
import { formatIndonesianDate } from '../../core/utils/dateHelpers';
import { formatNisVisual } from '../../core/utils/nisHelpers';
import { getCanonicalNisDigits } from '../../core/utils/relationHelpers';
import { QrCodeSvg } from '../QrCodeSvg';
import { LembarPenilaianKurmerSheet } from '../DocumentPrintTemplates';
import { resolveMapsLink } from './documentHubConfig';

export type QuickDocType =
  | 'pengajuan'
  | 'perizinan'
  | 'pengantaran'
  | 'monitoring'
  | 'penarikan'
  | 'nilai'
  | 'blangko';

export interface QuickDocRenderOptions {
  activeYear: string;
  documentDate: string;
  customNomorSurat: string;
  includeQrCode: boolean;
  isOverprintOnly: boolean;
  dudiList: Dudi[];
  pengajuanList: Pengajuan[];
  siswaByNis: Map<string, Siswa>;
  kepalaSekolah: string;
}

function resolveDudiSignName(
  student: any,
  dudiName: string,
  dudiList: Dudi[]
): string {
  const normDudi = String(dudiName || '').trim().toLowerCase();
  const dudiId = String(student.idDudi || student.ID_DUDI || '').trim();
  const matchedDudi = dudiList.find(
    (d) =>
      (dudiId && d.id === dudiId) ||
      (normDudi && normDudi !== '-' && d.namaDudi.trim().toLowerCase() === normDudi)
  );
  return (
    String(
      student.namaPemimpin ||
        student.Nama_Pemimpin ||
        student.namaPic ||
        student.Nama_PIC ||
        matchedDudi?.namaPic ||
        matchedDudi?.namaPemimpin ||
        ''
    ).trim() || '................................................'
  );
}

export const QuickDocPreviewContent: React.FC<{
  docType: QuickDocType;
  student: any;
  options: QuickDocRenderOptions;
}> = ({ docType, student, options }) => {
  const {
    activeYear,
    documentDate,
    customNomorSurat,
    includeQrCode,
    isOverprintOnly,
    dudiList,
    pengajuanList,
    siswaByNis,
    kepalaSekolah,
  } = options;

  const rawNis = student.nis || student.NIS || '';
  const canonicalNisKey = getCanonicalNisDigits(rawNis);
  const matchedSiswa = canonicalNisKey ? siswaByNis.get(canonicalNisKey) : undefined;
  const studentName =
    matchedSiswa?.nama || student.nama || student.namaSiswa || student.nama_siswa || '-';
  const studentNis = formatNisVisual(matchedSiswa?.nis || rawNis);
  const studentNik = matchedSiswa?.nik || student.nik || student.NIK || '-';
  const studentJurusan = matchedSiswa?.jurusan || student.jurusan || student.Jurusan || '-';
  const studentKelas = matchedSiswa?.kelas || student.kelas || student.Kelas || '-';
  const dudiName =
    student.dudiTujuan ||
    student.namaDudi ||
    student.nama_dudi ||
    student.DUDI_Tujuan ||
    student.Nama_DUDI ||
    '-';
  const dudiAddress =
    student.alamatDudi ||
    student.alamat ||
    student.alamat_dudi ||
    student.Alamat_DUDI ||
    '-';

  const mapsUrl = resolveMapsLink(
    student.linkMaps || student.Link_Maps || student.link_maps,
    student.idDudi || student.ID_DUDI,
    dudiName,
    dudiList,
    pengajuanList
  );
  const signName = resolveDudiSignName(student, dudiName, dudiList);

  if (docType === 'pengajuan') {
    return (
      <div className="space-y-4">
        <div className="text-center font-bold uppercase underline text-sm tracking-wide">
          LEMBAR PERMOHONAN REKOMENDASI PRAKERIN
        </div>
        <div className="text-center text-xs font-sans text-slate-500">
          Tahun Ajaran {activeYear}
        </div>

        <p className="text-justify text-xs mt-4">
          Berdasarkan data pendaftaran melalui Portal Pokja Hubin, bersama ini diterangkan bahwa peserta didik berikut mengajukan permohonan rekomendasi penempatan Praktik Kerja Industri (Prakerin):
        </p>

        <table className="w-full text-xs font-sans border-collapse my-3">
          <tbody>
            <tr className="border-b border-slate-200">
              <td className="py-1.5 font-bold w-44">Nama Peserta Didik</td>
              <td className="py-1.5 font-semibold text-slate-900">: {studentName}</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="py-1.5 font-bold">NIS / NIK</td>
              <td className="py-1.5 font-mono">: {studentNis} / {studentNik}</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="py-1.5 font-bold">Kompetensi Keahlian</td>
              <td className="py-1.5">: {studentJurusan}</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="py-1.5 font-bold">Kelas / Wali Kelas</td>
              <td className="py-1.5">: {studentKelas} {student.waliKelas ? `/ ${student.waliKelas}` : ''}</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="py-1.5 font-bold">Mitra DUDI yang Dituju</td>
              <td className="py-1.5 font-bold text-blue-900">: {dudiName}</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="py-1.5 font-bold">Alamat DUDI</td>
              <td className="py-1.5">: {dudiAddress}</td>
            </tr>
          </tbody>
        </table>

        <div className="border border-slate-300 rounded-lg p-3.5 bg-slate-50 font-sans text-xs mt-4">
          <div className="font-bold text-slate-800 mb-2">
            KEPUTUSAN KETUA KOMPETENSI KEAHLIAN (KAKOMLI):
          </div>
          <div className="flex items-center gap-6 mb-2">
            <span className="font-semibold text-slate-700">[ &nbsp; ] DISETUJUI</span>
            <span className="font-semibold text-slate-700">[ &nbsp; ] DITOLAK</span>
          </div>
          <div className="text-[11px] text-slate-500">
            Catatan Kakomli: {student.catatanKakomli || '...............................................................'}
          </div>
        </div>

        <div className="flex justify-between items-end gap-4 mt-8 font-sans text-xs print-avoid-break">
          <div className="text-center">
            <div>Mengetahui Tempat PKL,</div>
            <div className="font-semibold">Pimpinan / Pembimbing DUDI</div>
            <div className="h-16" />
            <div className="font-bold underline">{signName}</div>
            <div className="text-[11px] text-slate-500">{dudiName}</div>
          </div>

          {includeQrCode ? (
            <QrCodeSvg
              value={mapsUrl}
              size={76}
              label="QR Lokasi Maps"
              emptyText="Link Maps belum diisi"
            />
          ) : (
            <div />
          )}

          <div className="text-center">
            <div>Ponorogo, {documentDate}</div>
            <div className="font-semibold mt-1">Ketua Kompetensi Keahlian,</div>
            <div className="h-16" />
            <div className="font-bold underline">................................................</div>
            <div className="text-[11px] text-slate-500">NIP. ..................................</div>
          </div>
        </div>
      </div>
    );
  }

  if (docType === 'perizinan') {
    return (
      <div className="space-y-4">
        <div className="flex justify-between gap-4 font-sans text-xs">
          <div>
            <div>Nomor : {customNomorSurat}</div>
            <div>Lamp. : 1 (satu) Berkas</div>
            <div>Perihal : <b>Permohonan Penempatan Praktik Kerja Industri (Prakerin)</b></div>
          </div>
          <div className="shrink-0">Ponorogo, {documentDate}</div>
        </div>

        <div className="font-sans text-xs mt-4">
          Kepada Yth.<br />
          <b>Pimpinan / HRD {dudiName}</b><br />
          {dudiAddress !== '-' ? dudiAddress : 'Di Tempat'}
        </div>

        <p className="text-justify text-xs mt-4">
          Dengan hormat,<br />
          Dalam rangka memenuhi tuntutan kurikulum Sekolah Menengah Kejuruan serta meningkatkan keselarasan antara kompetensi peserta didik dengan kebutuhan Dunia Usaha dan Dunia Industri (DUDI), kami memohon kesediaan Bapak/Ibu untuk berkenan menerima peserta didik kami melaksanakan Praktik Kerja Industri (Prakerin) di institusi/perusahaan yang Bapak/Ibu pimpin.
        </p>

        <table className="w-full text-xs font-sans border border-slate-300 border-collapse my-2">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-1.5 border border-slate-300 w-10 text-center">No</th>
              <th className="p-1.5 border border-slate-300 text-left">Nama Siswa</th>
              <th className="p-1.5 border border-slate-300 text-center w-28">NIS</th>
              <th className="p-1.5 border border-slate-300 text-left">Kompetensi Keahlian</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-1.5 border border-slate-300 text-center">1</td>
              <td className="p-1.5 border border-slate-300 font-semibold">{studentName}</td>
              <td className="p-1.5 border border-slate-300 text-center font-mono">{studentNis}</td>
              <td className="p-1.5 border border-slate-300">{studentJurusan}</td>
            </tr>
          </tbody>
        </table>

        <p className="text-justify text-xs">
          Demikian permohonan ini kami sampaikan. Atas perhatian, kerjasama, dan bimbingan yang Bapak/Ibu berikan, kami sampaikan terima kasih.
        </p>

        <div className="flex justify-end mt-8 font-sans text-xs print-avoid-break">
          <div className="text-center">
            <div>Kepala SMK PGRI 2 Ponorogo,</div>
            <div className="h-16" />
            <div className="font-bold underline">{kepalaSekolah || '................................................'}</div>
            <div className="text-[11px] text-slate-500">NIP. ..................................</div>
          </div>
        </div>
      </div>
    );
  }

  if (docType === 'monitoring') {
    const stageDescriptions = [
      { title: 'Tahap 1: Pengantaran Siswa', desc: 'Serah terima siswa resmi dengan pimpinan/pembimbing bengkel DUDI & briefing K3.', color: 'text-blue-900' },
      { title: 'Tahap 2: Monitoring 1', desc: 'Pengecekan adaptasi lingkungan kerja, Absensi (S/I/A), dan kedisiplinan harian.', color: 'text-indigo-900' },
      { title: 'Tahap 3: Monitoring 2', desc: 'Evaluasi perkembangan kompetensi kerja dan absensi S/I/A bulan berjalan.', color: 'text-violet-900' },
      { title: 'Tahap 4: Monitoring 3', desc: 'Supervisi teknis lanjutan, penanganan kendala lapangan, dan rekap absensi.', color: 'text-purple-900' },
      {
        title: 'Tahap 5: Monitoring 4 (Cek Pengambilan Nilai PKL)',
        desc: `Input 4 kategori nilai (K3LH, Softskills, Hardskills, Alur Bisnis Dunia Kerja) · No. Seri Blangko: ${student.noSeriBlangko || '(Belum Dialokasikan)'}`,
        color: 'text-amber-900',
        highlight: true,
      },
      { title: 'Tahap 6: Monitoring 5', desc: 'Pemantapan persiapan akhir PKL & susulan input nilai jika belum muncul di Mon 4.', color: 'text-orange-900' },
      { title: 'Tahap 7: Monitoring 6', desc: 'Finalisasi kelengkapan absensi, nilai industri, dan validasi blangko sertifikat.', color: 'text-cyan-900' },
      { title: 'Tahap 8: Penarikan Siswa', desc: 'Penjemputan resmi siswa purnatugas prakerin dan penyerahan cinderamata kemitraan sekolah.', color: 'text-emerald-900' },
    ];

    return (
      <div className="space-y-4">
        <div className="text-center font-bold uppercase underline text-sm tracking-wide">
          INSTRUMEN SUPERVISI &amp; MONITORING 8 TAHAP
        </div>
        <div className="text-center text-xs font-sans text-slate-500">
          Pokja Hubungan Industri SMK PGRI 2 Ponorogo
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs font-sans bg-slate-50 p-2.5 rounded-lg border border-slate-200">
          <div><b>DUDI:</b> {dudiName}</div>
          <div><b>Guru Pendamping:</b> {student.guruPendamping || '-'}</div>
          <div><b>Peserta:</b> {studentName} ({studentKelas})</div>
          <div><b>Tahun Ajaran:</b> {activeYear}</div>
        </div>

        <div className="space-y-2.5 font-sans text-xs mt-3">
          {stageDescriptions.map((st) => (
            <div
              key={st.title}
              className={
                st.highlight
                  ? 'border-2 border-amber-300 bg-amber-50/50 p-2.5 rounded-lg'
                  : 'border border-slate-200 p-2 rounded-lg'
              }
            >
              <div className={`font-bold ${st.color}`}>{st.title}</div>
              <div className={`text-[11px] ${st.highlight ? 'text-slate-700' : 'text-slate-600'}`}>
                {st.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (docType === 'nilai') {
    const k3lhVal = student.nilaiK3lh ?? student.Nilai_K3LH ?? '';
    const softskillVal = student.nilaiSoftskill ?? student.Nilai_Softskills ?? student.Nilai_Softskill ?? '';
    const teknisVal =
      student.nilaiKompetensiTeknis ?? student.Nilai_Hardskills ?? student.Nilai_Kompetensi_Teknis ?? '';
    const alurBisnisVal =
      student.nilaiAlurBisnis ?? student.Nilai_Alur_Bisnis_Dunia_Kerja ?? student.Nilai_Alur_Bisnis ?? '';
    const rataRataVal =
      student.nilaiRataRata ??
      student.Nilai_rata_rata ??
      student.Nilai_Rata_Rata ??
      student.nilaiDudi ??
      student.Nilai_DUDI ??
      student.nilaiAkhir ??
      student.Nilai_Akhir ??
      '';

    const hasNumericGrade =
      String(k3lhVal).trim() !== '' &&
      String(k3lhVal).trim() !== '-' &&
      Number(k3lhVal) > 0;

    if (!hasNumericGrade) {
      return (
        <LembarPenilaianKurmerSheet
          namaSiswa={studentName}
          jurusan={studentJurusan}
          kelas={studentKelas}
          namaDudi={dudiName}
        />
      );
    }

    const scoreRows = [
      { no: 1, title: 'K3LH', desc: 'Keselamatan, Kesehatan Kerja, Penggunaan APD & Kebersihan Area', val: k3lhVal },
      { no: 2, title: 'Softskills', desc: 'Etos Kerja, Kedisiplinan, Komunikasi & Kerjasama Tim', val: softskillVal },
      { no: 3, title: 'Hardskills', desc: 'Kompetensi Teknis Kejuruan, Kualitas Hasil Kerja & Kesesuaian SOP', val: teknisVal },
      { no: 4, title: 'Alur Bisnis Dunia Kerja', desc: 'Pemahaman Proses Operasional Industri & Budaya Kerja DUDI', val: alurBisnisVal },
    ];

    return (
      <div className="space-y-4">
        <div className="text-center font-bold uppercase underline text-sm tracking-wide">
          LEMBAR PENILAIAN PRAKTIK KERJA INDUSTRI (DUDI)
        </div>
        <div className="text-center text-xs font-sans text-slate-500">
          Peserta: {studentName} ({studentNis}) · {dudiName}
        </div>

        <table className="w-full text-xs font-sans border-collapse border border-slate-300 my-3">
          <thead className="bg-slate-100">
            <tr>
              <th className="border p-2 w-10 text-center">No</th>
              <th className="border p-2 text-left">Kategori Penilaian DUDI (Bobot Sama 25%)</th>
              <th className="border p-2 w-28 text-center">Nilai DUDI</th>
            </tr>
          </thead>
          <tbody>
            {scoreRows.map((row) => (
              <tr key={row.no}>
                <td className="border p-2 text-center">{row.no}</td>
                <td className="border p-2">
                  <div className="font-semibold">{row.title}</div>
                  <div className="text-[10px] text-slate-500">{row.desc}</div>
                </td>
                <td className="border p-2 text-center font-bold font-mono">{row.val}</td>
              </tr>
            ))}
            <tr className="bg-slate-50 font-bold">
              <td colSpan={2} className="border border-slate-300 p-2 text-right">
                RATA-RATA NILAI DUDI ({student.predikat || '-'}):
              </td>
              <td className="border border-slate-300 p-2 text-center text-blue-700 font-mono text-sm">
                {rataRataVal}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="flex justify-between items-end mt-10 font-sans text-xs print-avoid-break">
          <div>
            <div className="text-slate-400 italic">Cap Stempel DUDI</div>
            <div className="w-24 h-24 border border-dashed border-slate-300 rounded-full flex items-center justify-center text-[10px] text-slate-400">
              STEMPEL
            </div>
          </div>
          <div className="text-center">
            <div>Ponorogo, {documentDate}</div>
            <div className="font-semibold mt-1">Pembimbing / Kepala Industri,</div>
            <div className="h-16" />
            <div className="font-bold underline">................................................</div>
            <div className="text-[11px] text-slate-500">{dudiName}</div>
          </div>
        </div>
      </div>
    );
  }

  if (docType === 'pengantaran') {
    const guruName = student.guruPendamping || student.Guru_Pendamping || '-';
    const tglBerangkat = formatIndonesianDate(
      student.tanggalBerangkat || student.Tanggal_Berangkat,
      documentDate
    );
    const tglTarik = formatIndonesianDate(
      student.tanggalRencanaTarik || student.Tanggal_Rencana_Tarik,
      '-'
    );
    return (
      <div className="space-y-4">
        <div className="flex justify-between gap-4 font-sans text-xs">
          <div>
            <div>Nomor : {customNomorSurat}</div>
            <div>Perihal : <b>Berita Acara &amp; Pengantaran Peserta PKL</b></div>
          </div>
          <div className="shrink-0">Ponorogo, {documentDate}</div>
        </div>

        <div className="font-sans text-xs mt-3">
          Kepada Yth.<br />
          <b>Pimpinan / Pembimbing Industri {dudiName}</b><br />
          {dudiAddress !== '-' ? dudiAddress : 'Di Tempat'}
        </div>

        <p className="text-justify text-xs mt-3">
          Dengan hormat,<br />
          Menindaklanjuti persetujuan penerimaan Praktik Kerja Industri (Prakerin) Tahun Ajaran {activeYear}, bersama ini kami menyerahkan peserta didik SMK PGRI 2 Ponorogo untuk melaksanakan Prakerin di instansi/perusahaan yang Bapak/Ibu pimpin dengan Guru Pendamping <b>{guruName}</b>:
        </p>

        <table className="w-full text-xs font-sans border border-slate-300 border-collapse my-2">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-1.5 border border-slate-300 text-left">Nama Peserta</th>
              <th className="p-1.5 border border-slate-300 text-center">NIS</th>
              <th className="p-1.5 border border-slate-300 text-center">Tgl Berangkat</th>
              <th className="p-1.5 border border-slate-300 text-center">Rencana Penarikan</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-1.5 border border-slate-300 font-semibold">{studentName}</td>
              <td className="p-1.5 border border-slate-300 text-center font-mono">{studentNis}</td>
              <td className="p-1.5 border border-slate-300 text-center">{tglBerangkat}</td>
              <td className="p-1.5 border border-slate-300 text-center">{tglTarik}</td>
            </tr>
          </tbody>
        </table>

        <p className="text-justify text-xs">
          Mohon bimbingan dan pengawasan dari pihak DUDI selama pelaksanaan PKL berlangsung. Atas kerjasama yang baik kami ucapkan terima kasih.
        </p>

        <div className="flex justify-between items-end gap-4 mt-10 font-sans text-xs print-avoid-break">
          <div className="text-center">
            <div>Diterima Oleh,</div>
            <div className="font-semibold">Pimpinan / Pembimbing DUDI</div>
            <div className="h-14" />
            <div className="font-bold underline">{signName}</div>
            <div className="text-[10px] text-slate-500">{dudiName}</div>
          </div>

          {includeQrCode ? (
            <QrCodeSvg
              value={mapsUrl}
              size={74}
              label="QR Lokasi Maps"
              emptyText="Link Maps belum diisi"
            />
          ) : (
            <div />
          )}

          <div className="text-center">
            <div>Guru Pendamping Sekolah,</div>
            <div className="h-14" />
            <div className="font-bold underline">{guruName !== '-' ? guruName : '................................................'}</div>
            <div className="text-[10px] text-slate-500">SMK PGRI 2 Ponorogo</div>
          </div>
        </div>
      </div>
    );
  }

  if (docType === 'penarikan') {
    const guruName = student.guruPendamping || student.Guru_Pendamping || '-';
    const tglTarik = formatIndonesianDate(
      student.tanggalRencanaTarik || student.Tanggal_Rencana_Tarik,
      documentDate
    );
    return (
      <div className="space-y-4">
        <div className="flex justify-between gap-4 font-sans text-xs">
          <div>
            <div>Nomor : {customNomorSurat}</div>
            <div>Perihal : <b>Surat Penarikan &amp; Ucapan Terima Kasih PKL</b></div>
          </div>
          <div className="shrink-0">Ponorogo, {documentDate}</div>
        </div>

        <div className="font-sans text-xs mt-3">
          Kepada Yth.<br />
          <b>Pimpinan / Pembimbing Industri {dudiName}</b><br />
          {dudiAddress !== '-' ? dudiAddress : 'Di Tempat'}
        </div>

        <p className="text-justify text-xs mt-3">
          Dengan hormat,<br />
          Sehubungan dengan telah berakhirnya masa Praktik Kerja Industri (Prakerin) Tahun Ajaran {activeYear} pada tanggal <b>{tglTarik}</b>, bersama ini kami menugaskan Guru Pendamping <b>{guruName}</b> untuk melaksanakan penarikan kembali peserta didik berikut:
        </p>

        <table className="w-full text-xs font-sans border border-slate-300 border-collapse my-2">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-1.5 border border-slate-300 w-10 text-center">No</th>
              <th className="p-1.5 border border-slate-300 text-left">Nama Siswa</th>
              <th className="p-1.5 border border-slate-300 text-center">NIS</th>
              <th className="p-1.5 border border-slate-300 text-left">Tempat PKL</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-1.5 border border-slate-300 text-center">1</td>
              <td className="p-1.5 border border-slate-300 font-semibold">{studentName}</td>
              <td className="p-1.5 border border-slate-300 text-center font-mono">{studentNis}</td>
              <td className="p-1.5 border border-slate-300">{dudiName}</td>
            </tr>
          </tbody>
        </table>

        <p className="text-justify text-xs">
          Kami menyampaikan terima kasih yang sebesar-besarnya atas ilmu, pembinaan disiplin, serta kerjasama kemitraan yang telah terjalin dengan SMK PGRI 2 Ponorogo.
        </p>

        <div className="flex justify-between items-end gap-4 mt-10 font-sans text-xs print-avoid-break">
          <div className="text-center">
            <div>Diserahkan Kembali Oleh,</div>
            <div className="font-semibold">Pimpinan / Pembimbing DUDI</div>
            <div className="h-14" />
            <div className="font-bold underline">{signName}</div>
            <div className="text-[10px] text-slate-500">{dudiName}</div>
          </div>

          {includeQrCode ? (
            <QrCodeSvg
              value={mapsUrl}
              size={74}
              label="QR Lokasi Maps"
              emptyText="Link Maps belum diisi"
            />
          ) : (
            <div />
          )}

          <div className="text-center">
            <div>a.n. Kepala Sekolah / Pokja Hubin,</div>
            <div className="h-14" />
            <div className="font-bold underline">................................................</div>
            <div className="text-[10px] text-slate-500">SMK PGRI 2 Ponorogo</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`space-y-4 p-6 rounded-xl relative print-avoid-break ${
        isOverprintOnly ? 'bg-transparent' : 'border-4 border-amber-300 bg-amber-50/20'
      }`}
    >
      <div className="flex justify-between items-center text-xs font-mono font-bold text-amber-900 border-b border-amber-200 pb-2">
        <span>BLANGKO SERTIFIKAT RESMI</span>
        <span className="bg-amber-100 text-amber-900 px-3 py-1 rounded border border-amber-300">
          NO. SERI: {student.noSeriBlangko || '(Belum Diisi)'}
        </span>
      </div>

      <div className="text-center py-4">
        <div className="text-2xl font-serif font-bold text-slate-900 tracking-wider">
          SERTIFIKAT PRAKERIN
        </div>
        <div className="text-xs font-sans text-slate-500 mt-1">
          Nomor: 421.5 / {studentNis} / SERT.PKL / {new Date().getFullYear()}
        </div>
      </div>

      <div className="text-center text-xs font-sans text-slate-600">
        Diberikan kepada:
      </div>

      <div className="text-center text-xl font-bold font-serif underline text-blue-900 my-2">
        {studentName}
      </div>

      <div className="text-center text-xs font-sans text-slate-700 leading-relaxed max-w-lg mx-auto">
        Telah menyelesaikan Praktik Kerja Industri (Prakerin) di <b>{dudiName}</b> dengan Rata-rata Nilai DUDI:{' '}
        <b className="text-emerald-700 text-sm">
          {student.nilaiRataRata ??
            student.Nilai_rata_rata ??
            student.Nilai_Rata_Rata ??
            student.nilaiDudi ??
            student.Nilai_DUDI ??
            student.nilaiAkhir ??
            '-'}
        </b>{' '}
        (Predikat: <b>{student.predikat || '-'}</b>).
        <div className="mt-2 pt-2 border-t border-amber-200/70 text-[11px] text-slate-600 grid grid-cols-2 sm:grid-cols-4 gap-1.5 font-mono">
          <span>K3LH: <b>{student.nilaiK3lh ?? student.Nilai_K3LH ?? '-'}</b></span>
          <span>Softskills: <b>{student.nilaiSoftskill ?? student.Nilai_Softskills ?? student.Nilai_Softskill ?? '-'}</b></span>
          <span>Hardskills: <b>{student.nilaiKompetensiTeknis ?? student.Nilai_Hardskills ?? student.Nilai_Kompetensi_Teknis ?? '-'}</b></span>
          <span>Alur Bisnis: <b>{student.nilaiAlurBisnis ?? student.Nilai_Alur_Bisnis_Dunia_Kerja ?? student.Nilai_Alur_Bisnis ?? '-'}</b></span>
        </div>
      </div>

      <div className="flex justify-around items-end pt-10 font-sans text-xs print-avoid-break">
        <div className="text-center">
          <div>Pimpinan Dunia Industri,</div>
          <div className="h-14" />
          <div className="font-bold underline">................................................</div>
          <div className="text-[10px] text-slate-500">{dudiName}</div>
        </div>
        <div className="text-center">
          <div>Kepala SMK PGRI 2 Ponorogo,</div>
          <div className="h-14" />
          <div className="font-bold underline">{kepalaSekolah || '................................................'}</div>
          <div className="text-[10px] text-slate-500">NIP. ..................................</div>
        </div>
      </div>
    </div>
  );
};
