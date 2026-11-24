import React from 'react';
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { Dudi, Guru, Monitoring, Pengajuan, PenempatanPKL, Siswa } from '../../core/types/schema';
import { formatIndonesianDate, formatIndonesianDateRange } from '../../core/utils/dateHelpers';
import { formatNisVisual } from '../../core/utils/nisHelpers';
import { getCanonicalNisDigits, isExcludedFromDudiListStatus, normalizeRelationText } from '../../core/utils/relationHelpers';
import { getStageValueByNumber } from '../../core/utils/monitoringHelpers';
import {
  formatPhoneDisplay,
  getWhatsAppHref,
} from '../../core/utils/autoIdHelpers';
import { QrCodeSvg } from '../QrCodeSvg';
import {
  PAPER_DIMENSIONS,
  PAPER_SHEET_PADDING,
  PreviewZoomMode,
  ResizablePaperPreview,
} from '../ResizablePaperPreview';
import {
  LembarMonitoring0701Sheet,
  LembarPenilaianKurmerSheet,
  SuratTugas0708Sheet,
} from '../DocumentPrintTemplates';
import {
  BundlePrintPage,
  dedupePlacementsByCanonicalNis,
  DocumentHubKey,
  resolveMapsLink,
  SuratTugasAuditResult,
} from './documentHubConfig';
import {
  enrichBundleStudentsWithMonitoring,
  extractGroupFormat0701Summary,
} from './documentDataBuilders';

export const PreviewPaginationBar: React.FC<{
  currentIdx: number;
  total: number;
  subtitle: string;
  onPrev: () => void;
  onNext: () => void;
}> = ({ currentIdx, total, subtitle, onPrev, onNext }) => (
  <div className="flex items-center justify-between gap-2 bg-white px-3.5 py-2 rounded-xl border border-slate-200 text-xs no-print">
    <div className="min-w-0 truncate">
      <span className="font-bold text-slate-900 tabular-nums">
        Halaman {Math.min(currentIdx, total - 1) + 1} / {total}
      </span>
      <span className="text-slate-300 mx-2">·</span>
      <span className="text-slate-600">{subtitle}</span>
    </div>
    <div className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        disabled={currentIdx <= 0}
        onClick={onPrev}
        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        disabled={currentIdx >= total - 1}
        onClick={onNext}
        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  </div>
);

export const BundlePageRenderer: React.FC<{
  page: BundlePrintPage;
  nomorSurat: string;
  tanggalSurat: string;
  kepalaSekolah: string;
  bundleStageNum: number;
  activeYear: string;
}> = ({ page, nomorSurat, tanggalSurat, kepalaSekolah, bundleStageNum, activeYear }) => {
  if (page.kind === 'surat_tugas') {
    return (
      <SuratTugas0708Sheet
        nomorSurat={nomorSurat}
        tanggalSurat={tanggalSurat}
        kepalaSekolah={kepalaSekolah}
        namaGuru={page.bundle.guruNama}
        jabatanGuru={page.bundle.guruJabatan}
        tahapNum={bundleStageNum}
        namaDudi={page.bundle.namaDudi}
        alamatDudi={page.bundle.alamatDudi}
        namaPemimpinDudi={page.bundle.pemimpinDudi}
        tanggalPenugasan={tanggalSurat}
      />
    );
  }
  if (page.kind === 'monitoring') {
    return (
      <LembarMonitoring0701Sheet
        tahapNum={bundleStageNum}
        activeYear={activeYear}
        namaBengkel={page.bundle.namaDudi}
        alamatBengkel={page.bundle.alamatDudi}
        pemimpinBengkel={page.bundle.pemimpinDudi}
        noTelpBengkel={page.bundle.noTelpDudi}
        hariKerja={page.bundle.hariKerja}
        jamKerja={page.bundle.jamKerja}
        students={page.bundle.students}
        namaPetugas={page.bundle.guruNama}
        tanggalSurat={tanggalSurat}
        kompetensiList={page.bundle.kompetensiList}
        keadaanBengkel={page.bundle.keadaanBengkel}
        catatanLain={page.bundle.catatanLain}
      />
    );
  }
  return (
    <LembarPenilaianKurmerSheet
      namaSiswa={page.student?.namaSiswa || ''}
      jurusan={page.student?.jurusan || '-'}
      kelas={page.student?.kelas || '-'}
      namaDudi={page.bundle.namaDudi}
      namaPembimbingDudi={page.bundle.pembimbingDudi || page.bundle.pemimpinDudi}
    />
  );
};

export const SuratTugasMultiPreview: React.FC<{
  guru: Guru;
  nomorSurat: string;
  tanggalSurat: string;
  kepalaSekolah: string;
  suratTugasStageNum: number;
  selectedSuratTugasDudi: string;
  paperSize: 'A4' | 'F4';
  zoomMode: PreviewZoomMode;
  onChangeZoomMode: (next: PreviewZoomMode) => void;
  suratTugasAudit: SuratTugasAuditResult;
}> = ({
  guru,
  nomorSurat,
  tanggalSurat,
  kepalaSekolah,
  suratTugasStageNum,
  selectedSuratTugasDudi,
  paperSize,
  zoomMode,
  onChangeZoomMode,
  suratTugasAudit,
}) => {
  const targetStageLabel = getStageValueByNumber(suratTugasStageNum);
  const paper = PAPER_DIMENSIONS[paperSize];

  if (suratTugasAudit.isPrintBlocked) {
    return (
      <div className="bg-white w-full max-w-[794px] p-8 rounded-xl border border-slate-300">
        <div className="p-6 rounded-xl border border-rose-200 bg-rose-50 font-sans text-xs text-rose-900 space-y-2.5">
          <div className="flex items-center gap-2 font-bold text-sm text-rose-800">
            <Lock className="w-4 h-4 text-rose-600 shrink-0" />
            <span>Surat Tugas {targetStageLabel} Terkunci</span>
          </div>
          <p className="leading-relaxed">{suratTugasAudit.blockReason}</p>
          <p className="text-rose-700">
            Silakan isi dan simpan tahap sebelumnya pada Portal Supervisi Guru atau pilih DUDI lain yang sudah memenuhi syarat tahap di panel kiri.
          </p>
        </div>
      </div>
    );
  }

  const activeGroups =
    selectedSuratTugasDudi === 'ALL_UNLOCKED'
      ? suratTugasAudit.unlockedGroups
      : suratTugasAudit.unlockedGroups.filter((g) => g.key === selectedSuratTugasDudi);

  if (activeGroups.length === 0) {
    return (
      <div className="bg-white w-full max-w-[794px] p-10 rounded-xl border border-slate-300 text-center text-xs text-slate-500">
        Belum ada penempatan DUDI binaan untuk guru <b>{guru.nama}</b>.
      </div>
    );
  }

  return (
    <ResizablePaperPreview
      paperSize={paperSize}
      zoomMode={zoomMode}
      onChangeZoomMode={onChangeZoomMode}
      unstyledCanvas={true}
    >
      <div className="space-y-5">
        {activeGroups.map((grp) => (
          <div
            key={grp.key}
            style={{
              width: `${paper.widthPx}px`,
              minHeight: `${paper.heightPx}px`,
              padding: PAPER_SHEET_PADDING,
              boxSizing: 'border-box',
            }}
            className="bg-white rounded-xl shadow-md border border-slate-300 text-slate-950 flex flex-col"
          >
            <SuratTugas0708Sheet
              nomorSurat={nomorSurat}
              tanggalSurat={tanggalSurat}
              kepalaSekolah={kepalaSekolah}
              namaGuru={guru.nama}
              jabatanGuru={guru.peranUtama || 'Guru SMK PGRI 2 Ponorogo'}
              tahapNum={suratTugasStageNum}
              namaDudi={grp.namaDudi}
              alamatDudi={grp.alamatDudi}
              namaPemimpinDudi={grp.pemimpinDudi}
              tanggalPenugasan={tanggalSurat}
            />
          </div>
        ))}
      </div>
    </ResizablePaperPreview>
  );
};

export const DocumentBodyRenderer: React.FC<{
  docKey: DocumentHubKey;
  record: any;
  activeYear: string;
  nomorSurat: string;
  tanggalSurat: string;
  kepalaSekolah: string;
  includeGroupPeers: boolean;
  penempatanList: PenempatanPKL[];
  dudiList: Dudi[];
  pengajuanList: Pengajuan[];
  monitoringList?: Monitoring[];
  siswaByNis: Map<string, Siswa>;
  suratTugasStageNum: number;
}> = ({
  docKey,
  record,
  activeYear,
  nomorSurat,
  tanggalSurat,
  kepalaSekolah,
  includeGroupPeers,
  penempatanList,
  dudiList,
  pengajuanList,
  monitoringList = [],
  siswaByNis,
  suratTugasStageNum,
}) => {
  if (docKey === 'doc_mou') {
    const dudi = record as Dudi;
    return (
      <div className="space-y-3 text-[12pt] font-serif leading-[1.35]">
        <div className="text-center space-y-0.5">
          <div className="font-bold uppercase underline text-[13pt] tracking-wide">
            NASKAH PERJANJIAN KERJASAMA (MEMORANDUM OF UNDERSTANDING)
          </div>
          <div className="text-[12pt] font-serif text-slate-700">Nomor: {nomorSurat}</div>
        </div>

        <p className="text-justify text-[12pt] mt-3">
          Pada hari ini, tanggal <b>{tanggalSurat}</b>, bertempat di Ponorogo, kami yang bertanda tangan di bawah ini:
        </p>

        <table className="w-full text-[12pt] font-serif border-collapse my-1.5">
          <tbody>
            <tr>
              <td className="py-1 font-bold w-40 align-top">1. PIHAK PERTAMA</td>
              <td className="py-1">
                <b>SMK PGRI 2 Ponorogo</b>, berkedudukan di Jl. Soekarno - Hatta No. 94 Ponorogo, dalam hal ini diwakili oleh <b>{kepalaSekolah || 'Kepala Sekolah'}</b>.
              </td>
            </tr>
            <tr>
              <td className="py-1 font-bold align-top">2. PIHAK KEDUA</td>
              <td className="py-1">
                <b>{dudi.namaDudi}</b> ({dudi.bidangKeahlian || 'Mitra Industri'}), berkedudukan di {dudi.alamat || '-'}, {dudi.wilayahKota || ''}, dalam hal ini diwakili oleh <b>{dudi.namaPic || 'Pimpinan / HRD'}</b> (Kontak:{' '}
                {getWhatsAppHref(dudi.kontakPic) ? (
                  <a
                    href={getWhatsAppHref(dudi.kontakPic)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[11pt] text-emerald-700 hover:underline print:text-slate-950 print:no-underline"
                  >
                    {formatPhoneDisplay(dudi.kontakPic)}
                  </a>
                ) : (
                  formatPhoneDisplay(dudi.kontakPic)
                )}
                ).
              </td>
            </tr>
          </tbody>
        </table>

        <p className="text-justify text-[12pt]">
          Kedua belah pihak sepakat untuk menjalin kerjasama dalam rangka Penyelenggaraan Praktik Kerja Industri (PKL), penyelarasan kurikulum kejuruan, dan pembinaan kompetensi kerja peserta didik pada Tahun Ajaran <b>{activeYear}</b> dengan kapasitas penempatan hingga <b>{dudi.kuotaMaksimal || '-'} siswa</b>.
        </p>

        <div className="p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-[12pt] font-serif space-y-1 print-avoid-break">
          <div className="font-bold text-slate-900">Ruang Lingkup Kerjasama:</div>
          <ol className="list-decimal list-inside space-y-0.5 text-slate-800">
            <li>Penempatan peserta didik PKL sesuai kompetensi keahlian dan tata tertib K3 industri.</li>
            <li>Bimbingan teknis oleh instruktur industri (DUDI) dan guru pendamping sekolah.</li>
            <li>Penilaian akhir hasil PKL dan penerbitan sertifikat kompetensi industri.</li>
          </ol>
        </div>

        <div className="flex justify-between items-end pt-6 font-serif text-[12pt] print-avoid-break">
          <div className="text-center">
            <div>PIHAK KEDUA,</div>
            <div className="font-semibold">{dudi.namaDudi}</div>
            <div className="h-14" />
            <div className="font-bold underline">{dudi.namaPic || '..........................................'}</div>
            <div className="text-[10.5pt] text-slate-600">Pimpinan / Pembimbing Industri</div>
          </div>
          <div className="text-center">
            <div>PIHAK PERTAMA,</div>
            <div className="font-semibold">Kepala SMK PGRI 2 Ponorogo</div>
            <div className="h-14" />
            <div className="font-bold underline">{kepalaSekolah || '.........................................'}</div>
            <div className="text-[10.5pt] text-slate-600">NIP. ..................................</div>
          </div>
        </div>
      </div>
    );
  }

  if (docKey === 'doc_pengajuan') {
    const req = record as Pengajuan;
    const sRec = siswaByNis.get(getCanonicalNisDigits(req.nis));
    const resolvedNama = sRec?.nama || req.namaSiswa;
    const resolvedNis = sRec?.nis || req.nis;
    const resolvedJurusan = sRec?.jurusan || req.jurusan;
    const resolvedKelas = sRec?.kelas || req.kelas;
    const matchedDudi = dudiList.find(
      (d) =>
        (req.idDudi && d.id === req.idDudi) ||
        normalizeRelationText(d.namaDudi) === normalizeRelationText(req.dudiTujuan)
    );
    const mapsUrl = resolveMapsLink(
      req.linkMaps,
      matchedDudi?.id || req.idDudi,
      req.dudiTujuan,
      dudiList,
      pengajuanList
    );
    const picDudiName =
      req.namaPemimpin ||
      req.namaPic ||
      matchedDudi?.namaPemimpin ||
      matchedDudi?.namaPic ||
      '..........................................';

    return (
      <div className="space-y-3 text-[12pt] font-serif leading-[1.35]">
        <div className="text-center space-y-0.5">
          <div className="font-bold uppercase underline text-[13pt] tracking-wide">
            LEMBAR PERMOHONAN REKOMENDASI PRAKERIN
          </div>
          <div className="text-[11.5pt] font-serif text-slate-700">
            No. Registrasi: <b className="font-mono text-slate-900">{req.noPengajuan}</b> • TA {activeYear}
          </div>
        </div>

        <p className="text-justify text-[12pt] mt-2.5">
          Berdasarkan pendaftaran siswa pada Portal Pokja Hubin SMK PGRI 2 Ponorogo, diajukan permohonan rekomendasi penempatan Praktik Kerja Industri (PKL) sebagai berikut:
        </p>

        <table className="w-full text-[12pt] font-serif border-collapse my-1.5">
          <tbody>
            <tr className="border-b border-slate-200">
              <td className="py-1 font-bold w-56">Nama Peserta Didik</td>
              <td className="py-1 font-semibold">: {resolvedNama}</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="py-1 font-bold">NIS</td>
              <td className="py-1 font-mono text-[11pt]">: {formatNisVisual(resolvedNis)}</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="py-1 font-bold">Kompetensi Keahlian / Kelas</td>
              <td className="py-1">: {resolvedJurusan} / {resolvedKelas}</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="py-1 font-bold">DUDI Tujuan</td>
              <td className="py-1 font-bold text-blue-900">: {req.dudiTujuan}</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="py-1 font-bold">Alamat / Bidang Usaha</td>
              <td className="py-1">: {req.alamatDudi || '-'} ({req.bidangPekerjaan || '-'})</td>
            </tr>
            {mapsUrl && (
              <tr className="border-b border-slate-200">
                <td className="py-1 font-bold">Tautan Google Maps</td>
                <td className="py-1 font-mono text-[10pt] break-all text-blue-800">: {mapsUrl}</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="border border-slate-300 rounded-lg p-3 bg-slate-50 font-serif text-[12pt] print-avoid-break">
          <div className="font-bold text-slate-900 mb-1">
            KEPUTUSAN KETUA KOMPETENSI KEAHLIAN (KAKOMLI):
          </div>
          <div className="flex items-center gap-6 mb-1">
            <span>[{req.statusKakomli === 'Disetujui' ? ' ✓ ' : '   '}] DISETUJUI</span>
            <span>[{req.statusKakomli === 'Ditolak' ? ' ✓ ' : '   '}] DITOLAK</span>
          </div>
          <div className="text-[11pt] text-slate-700">
            Catatan: {req.catatanKakomli || '..................................................................'}
          </div>
        </div>

        <div className="flex justify-between items-end gap-4 pt-5 font-serif text-[12pt] print-avoid-break">
          <div className="text-center">
            <div>Mengetahui Tempat PKL,</div>
            <div className="font-semibold">Pimpinan / Pembimbing DUDI</div>
            <div className="h-14" />
            <div className="font-bold underline">{picDudiName}</div>
            <div className="text-[10.5pt] text-slate-600">{req.dudiTujuan}</div>
          </div>

          <QrCodeSvg
            value={mapsUrl}
            size={72}
            label="QR Lokasi Maps"
            emptyText="Link Maps belum diisi"
          />

          <div className="text-center">
            <div>Ponorogo, {tanggalSurat}</div>
            <div className="font-semibold mt-0.5">Ketua Kompetensi Keahlian,</div>
            <div className="h-14" />
            <div className="font-bold underline">................................................</div>
            <div className="text-[10.5pt] text-slate-600">NIP. ..................................</div>
          </div>
        </div>
      </div>
    );
  }

  const penempatan = record as PenempatanPKL;
  const dudiDetail = dudiList.find(
    (d) =>
      (penempatan.idDudi && d.id === penempatan.idDudi) ||
      normalizeRelationText(d.namaDudi) === normalizeRelationText(penempatan.namaDudi)
  );
  const rawPeers = includeGroupPeers
    ? penempatanList.filter(
        (p) =>
          !isExcludedFromDudiListStatus(p.statusPenempatan) &&
          ((penempatan.idDudi && p.idDudi && p.idDudi === penempatan.idDudi) ||
            normalizeRelationText(p.namaDudi) === normalizeRelationText(penempatan.namaDudi))
      )
    : [penempatan];
  const groupPeers = dedupePlacementsByCanonicalNis(rawPeers, siswaByNis);

  const resolvedDudiMaps = resolveMapsLink(
    dudiDetail?.linkMaps,
    penempatan.idDudi,
    penempatan.namaDudi,
    dudiList,
    pengajuanList
  );
  const resolvedDudiSignName =
    dudiDetail?.namaPic ||
    dudiDetail?.namaPemimpin ||
    '..........................................';

  if (docKey === 'doc_monitoring') {
    const monStudents = enrichBundleStudentsWithMonitoring(
      groupPeers.length > 0 ? groupPeers : [penempatan],
      siswaByNis,
      monitoringList,
      suratTugasStageNum
    );
    const group0701 = extractGroupFormat0701Summary(monStudents);

    return (
      <LembarMonitoring0701Sheet
        tahapNum={suratTugasStageNum}
        activeYear={activeYear}
        namaBengkel={dudiDetail?.namaDudi || penempatan.namaDudi}
        alamatBengkel={
          dudiDetail?.alamat
            ? `${dudiDetail.alamat}${dudiDetail.wilayahKota ? `, ${dudiDetail.wilayahKota}` : ''}`
            : '-'
        }
        pemimpinBengkel={dudiDetail?.namaPemimpin || dudiDetail?.namaPic || ''}
        noTelpBengkel={dudiDetail?.noTelpDudi || dudiDetail?.kontakPic || ''}
        hariKerja={dudiDetail?.hariKerja || ''}
        jamKerja={dudiDetail?.jamKerja || ''}
        students={monStudents}
        namaPetugas={penempatan.guruPendamping || ''}
        tanggalSurat={tanggalSurat}
        kompetensiList={group0701.kompetensiList}
        keadaanBengkel={group0701.keadaanBengkel}
        catatanLain={group0701.catatanLain}
      />
    );
  }

  if (docKey === 'doc_pengantaran') {
    return (
      <div className="space-y-3 text-[12pt] font-serif leading-[1.35]">
        <div className="flex justify-between gap-4 font-serif text-[12pt]">
          <div>
            <div>Nomor : {nomorSurat}</div>
            <div>Lamp. : 1 (satu) Berkas</div>
            <div>Perihal : <b>Surat Pengantar &amp; Serah Terima Siswa PKL</b></div>
          </div>
          <div className="shrink-0">Ponorogo, {tanggalSurat}</div>
        </div>

        <div className="font-serif text-[12pt] mt-2">
          Kepada Yth.<br />
          <b>Pimpinan / HRD {penempatan.namaDudi}</b><br />
          {dudiDetail?.alamat ? `${dudiDetail.alamat}, ${dudiDetail.wilayahKota || ''}` : 'Di Tempat'}
        </div>

        <p className="text-justify text-[12pt]">
          Dengan hormat,<br />
          Berdasarkan surat balasan kesediaan tempat PKL Tahun Ajaran {activeYear}, bersama ini kami menyerahkan peserta didik SMK PGRI 2 Ponorogo untuk melaksanakan Praktik Kerja Industri terhitung mulai tanggal <b>{formatIndonesianDate(penempatan.tanggalBerangkat)}</b> s.d. <b>{formatIndonesianDate(penempatan.tanggalRencanaTarik)}</b> di bawah pendampingan <b>{penempatan.guruPendamping || '-'}</b>:
        </p>

        <table className="w-full text-[11pt] font-serif border border-slate-400 border-collapse">
          <thead className="bg-slate-100">
            <tr>
              <th className="border border-slate-400 px-2 py-1 w-9 text-center">No</th>
              <th className="border border-slate-400 px-2 py-1 text-left">NIS</th>
              <th className="border border-slate-400 px-2 py-1 text-left">Nama Siswa</th>
              <th className="border border-slate-400 px-2 py-1 text-left">ID Penempatan</th>
            </tr>
          </thead>
          <tbody>
            {(groupPeers.length > 0 ? groupPeers : [penempatan]).map((s, idx) => (
              <tr key={`${s.id || 'peer'}_${idx}`}>
                <td className="border border-slate-400 px-2 py-1 text-center">{idx + 1}</td>
                <td className="border border-slate-400 px-2 py-1 font-mono text-[10.5pt]">{formatNisVisual(s.nis)}</td>
                <td className="border border-slate-400 px-2 py-1 font-semibold">{s.namaSiswa}</td>
                <td className="border border-slate-400 px-2 py-1 font-mono text-[10.5pt]">{s.idPenempatan}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="text-justify text-[12pt]">
          Demikian surat pengantaran dan berita acara serah terima ini dibuat untuk dipergunakan sebagaimana mestinya. Atas bimbingan dan kerjasamanya kami ucapkan terima kasih.
        </p>

        <div className="flex justify-between items-end gap-4 pt-5 font-serif text-[12pt] print-avoid-break">
          <div className="text-center">
            <div>Diterima Oleh,</div>
            <div className="font-semibold">Pimpinan / Pembimbing DUDI</div>
            <div className="h-14" />
            <div className="font-bold underline">{resolvedDudiSignName}</div>
            <div className="text-[10.5pt] text-slate-600">{penempatan.namaDudi}</div>
          </div>

          <QrCodeSvg
            value={resolvedDudiMaps}
            size={72}
            label="QR Lokasi Maps"
            emptyText="Link Maps belum diisi"
          />

          <div className="text-center">
            <div>Yang Menyerahkan,</div>
            <div className="font-semibold">Guru Pendamping Sekolah</div>
            <div className="h-14" />
            <div className="font-bold underline">{penempatan.guruPendamping || '..........................................'}</div>
            <div className="text-[10.5pt] text-slate-600">SMK PGRI 2 Ponorogo</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-[12pt] font-serif leading-[1.35]">
      <div className="flex justify-between gap-4 font-serif text-[12pt]">
        <div>
          <div>Nomor : {nomorSurat}</div>
          <div>Lamp. : -</div>
          <div>Perihal : <b>Penarikan Siswa Purnatugas PKL &amp; Ucapan Terima Kasih</b></div>
        </div>
        <div className="shrink-0">Ponorogo, {tanggalSurat}</div>
      </div>

      <div className="font-serif text-[12pt] mt-2">
        Kepada Yth.<br />
        <b>Pimpinan / HRD {penempatan.namaDudi}</b><br />
        {dudiDetail?.alamat ? `${dudiDetail.alamat}, ${dudiDetail.wilayahKota || ''}` : 'Di Tempat'}
      </div>

      <p className="text-justify text-[12pt]">
        Dengan hormat,<br />
        Sehubungan dengan berakhirnya masa pelaksanaan Praktik Kerja Industri (PKL) siswa SMK PGRI 2 Ponorogo Tahun Ajaran {activeYear} (rencana tanggal selesai: <b>{formatIndonesianDate(penempatan.tanggalRencanaTarik, tanggalSurat)}</b>), kami menugaskan <b>{penempatan.guruPendamping || '-'}</b> untuk melakukan penarikan resmi peserta didik berikut:
      </p>

      <table className="w-full text-[11pt] font-serif border border-slate-400 border-collapse">
        <thead className="bg-slate-100">
          <tr>
            <th className="border border-slate-400 px-2 py-1 w-9 text-center">No</th>
            <th className="border border-slate-400 px-2 py-1 text-left">NIS</th>
            <th className="border border-slate-400 px-2 py-1 text-left">Nama Siswa</th>
            <th className="border border-slate-400 px-2 py-1 text-left">Periode PKL</th>
          </tr>
        </thead>
        <tbody>
          {(groupPeers.length > 0 ? groupPeers : [penempatan]).map((s, idx) => (
            <tr key={`${s.id || 'pull'}_${idx}`}>
              <td className="border border-slate-400 px-2 py-1 text-center">{idx + 1}</td>
              <td className="border border-slate-400 px-2 py-1 font-mono text-[10.5pt]">{formatNisVisual(s.nis)}</td>
              <td className="border border-slate-400 px-2 py-1 font-semibold">{s.namaSiswa}</td>
              <td className="border border-slate-400 px-2 py-1">
                {formatIndonesianDateRange(s.tanggalBerangkat, s.tanggalRencanaTarik)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-justify text-[12pt]">
        Kami mengucapkan terima kasih sebesar-besarnya atas bimbingan, ilmu, dan kesempatan yang telah diberikan kepada siswa kami. Apabila selama pelaksanaan terdapat kekhilafan dari siswa kami, kami mohon maaf yang sebesar-besarnya.
      </p>

      <div className="flex justify-between items-end gap-4 pt-5 font-serif text-[12pt] print-avoid-break">
        <div className="text-center">
          <div>Diserahkan Kembali Oleh,</div>
          <div className="font-semibold">Pimpinan / Pembimbing DUDI</div>
          <div className="h-14" />
          <div className="font-bold underline">{resolvedDudiSignName}</div>
          <div className="text-[10.5pt] text-slate-600">{penempatan.namaDudi}</div>
        </div>

        <QrCodeSvg
          value={resolvedDudiMaps}
          size={72}
          label="QR Lokasi Maps"
          emptyText="Link Maps belum diisi"
        />

        <div className="text-center">
          <div>Menarik / Mengetahui,</div>
          <div className="font-semibold">Kepala SMK PGRI 2 Ponorogo</div>
          <div className="h-14" />
          <div className="font-bold underline">{kepalaSekolah || '.........................................'}</div>
          <div className="text-[10.5pt] text-slate-600">SMK PGRI 2 Ponorogo</div>
        </div>
      </div>
    </div>
  );
};
