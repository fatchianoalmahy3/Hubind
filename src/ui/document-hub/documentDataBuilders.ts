import { Dudi, Guru, Monitoring, Pengajuan, PenempatanPKL, Siswa } from '../../core/types/schema';
import { formatNisVisual, stripNisSymbols } from '../../core/utils/nisHelpers';
import {
  getCanonicalNisDigits,
  isExcludedFromDudiListStatus,
  normalizeRelationText,
} from '../../core/utils/relationHelpers';
import {
  buildStudentMonitoringSummary,
  getStageValueByNumber,
} from '../../core/utils/monitoringHelpers';
import { BundleStudentItem } from '../DocumentPrintTemplates';
import {
  BatchSuratTugasPage,
  BundlePrintPage,
  dedupePlacementsByCanonicalNis,
  DocFilterMeta,
  DocumentHubKey,
  DudiBundleItem,
  FilteredDocItem,
  SuratTugasAuditResult,
  SuratTugasDudiGroup,
} from './documentHubConfig';

function isGuruAssignedToPlacement(p: PenempatanPKL, guru: Guru): boolean {
  return Boolean(
    (p.idGuruPendamping && p.idGuruPendamping === guru.id) ||
      (p.guruPendamping && p.guruPendamping.toLowerCase().includes(guru.nama.toLowerCase()))
  );
}

function findMatchingDudi(dudiList: Dudi[], dudiId?: string, namaDudi?: string): Dudi | undefined {
  const normName = normalizeRelationText(namaDudi);
  return dudiList.find(
    (d) => (dudiId && d.id === dudiId) || (normName && normalizeRelationText(d.namaDudi) === normName)
  );
}

function getPendingStudentsForStage(
  dedupedStudents: PenempatanPKL[],
  stageNum: number,
  monitoringList: Monitoring[]
): string[] {
  if (stageNum < 2) return [];
  const prevStage = stageNum - 1;
  const pending: string[] = [];
  for (const s of dedupedStudents) {
    const sum = buildStudentMonitoringSummary(
      {
        nis: s.nis,
        nama: s.namaSiswa,
        idPenempatan: s.idPenempatan,
        dudi_name: s.namaDudi,
      },
      monitoringList,
      []
    );
    if (!sum.completedStages.includes(prevStage)) {
      pending.push(s.namaSiswa);
    }
  }
  return pending;
}

export function buildBundleDudiItems(params: {
  activeDocKey: DocumentHubKey;
  penempatanList: PenempatanPKL[];
  guruList: Guru[];
  dudiList: Dudi[];
  monitoringList: Monitoring[];
  siswaByNis: Map<string, Siswa>;
  bundleGuruFilter: string;
  jurusanFilter: string;
  statusFilter: string;
  bundleStageNum: number;
  searchQuery: string;
}): DudiBundleItem[] {
  const {
    activeDocKey,
    penempatanList,
    guruList,
    dudiList,
    monitoringList,
    siswaByNis,
    bundleGuruFilter,
    jurusanFilter,
    statusFilter,
    bundleStageNum,
    searchQuery,
  } = params;

  if (activeDocKey !== 'doc_paket_monitoring') return [];

  const q = searchQuery.trim().toLowerCase();
  const activePlacements = penempatanList.filter(
    (p) => !isExcludedFromDudiListStatus(p.statusPenempatan)
  );
  const selectedGuru =
    bundleGuruFilter !== 'ALL' ? guruList.find((g) => g.id === bundleGuruFilter) : undefined;

  const groupMap = new Map<
    string,
    {
      guruId: string;
      guruNama: string;
      dudiId: string;
      namaDudi: string;
      rows: PenempatanPKL[];
    }
  >();

  for (const p of activePlacements) {
    const guruNama = (p.guruPendamping || 'Belum Ditentukan').trim();
    const guruId = (p.idGuruPendamping || guruNama).trim();
    if (bundleGuruFilter !== 'ALL') {
      const matchId = p.idGuruPendamping && p.idGuruPendamping === bundleGuruFilter;
      const matchName =
        selectedGuru &&
        p.guruPendamping &&
        p.guruPendamping.toLowerCase().includes(selectedGuru.nama.toLowerCase());
      if (!matchId && !matchName) continue;
    }

    const matchedDudi = findMatchingDudi(dudiList, p.idDudi, p.namaDudi);
    const namaDudi = (matchedDudi?.namaDudi || p.namaDudi || 'DUDI Belum Ditentukan').trim();
    const canonicalDudiId = matchedDudi?.id || p.idDudi || '';
    const dudiKey = canonicalDudiId || normalizeRelationText(namaDudi);
    const gKey = `${guruId.toLowerCase()}::${dudiKey.toLowerCase()}`;

    if (!groupMap.has(gKey)) {
      groupMap.set(gKey, {
        guruId,
        guruNama,
        dudiId: canonicalDudiId,
        namaDudi,
        rows: [],
      });
    }
    groupMap.get(gKey)!.rows.push(p);
  }

  const items: DudiBundleItem[] = [];

  for (const [bundleKey, grp] of groupMap.entries()) {
    const guruObj = guruList.find(
      (g) =>
        (grp.guruId && g.id === grp.guruId) ||
        normalizeRelationText(g.nama) === normalizeRelationText(grp.guruNama)
    );
    const dudiObj = findMatchingDudi(dudiList, grp.dudiId, grp.namaDudi);

    const dedupedRows = dedupePlacementsByCanonicalNis(grp.rows, siswaByNis);
    const students: BundleStudentItem[] = dedupedRows.map((s) => {
      const siswaRec = siswaByNis.get(getCanonicalNisDigits(s.nis));
      return {
        nis: siswaRec?.nis || s.nis,
        namaSiswa: siswaRec?.nama || s.namaSiswa,
        kelas: siswaRec?.kelas || '-',
        jurusan: siswaRec?.jurusan || dudiObj?.bidangKeahlian || '-',
      };
    });

    const jurusanSet = new Set<string>();
    for (const st of students) {
      const j = String(st.jurusan || '').trim();
      if (j && j !== '-') jurusanSet.add(j);
    }
    if (dudiObj?.bidangKeahlian && dudiObj.bidangKeahlian !== '-') {
      jurusanSet.add(dudiObj.bidangKeahlian.trim());
    }
    if (jurusanFilter !== 'ALL' && !jurusanSet.has(jurusanFilter)) {
      continue;
    }

    if (q) {
      const hay = `${grp.namaDudi} ${grp.guruNama} ${Array.from(jurusanSet).join(' ')} ${students
        .map((x) => `${x.namaSiswa} ${x.nis}`)
        .join(' ')}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }

    const pendingStudents = getPendingStudentsForStage(dedupedRows, bundleStageNum, monitoringList);
    const isLocked = pendingStudents.length > 0;
    if (statusFilter === 'SIAP' && isLocked) continue;
    if (statusFilter === 'TERKUNCI' && !isLocked) continue;

    const pemimpinDudi =
      (dudiObj?.namaPemimpin && dudiObj.namaPemimpin !== '-' ? dudiObj.namaPemimpin : '') ||
      (dudiObj?.namaPic && dudiObj.namaPic !== '-' ? dudiObj.namaPic : '') ||
      '';
    const noTelpDudi =
      (dudiObj?.noTelpDudi && dudiObj.noTelpDudi !== '-' ? dudiObj.noTelpDudi : '') ||
      (dudiObj?.kontakPic && dudiObj.kontakPic !== '-' ? dudiObj.kontakPic : '') ||
      '';

    items.push({
      bundleKey,
      guruId: guruObj?.id || grp.guruId,
      guruNama: guruObj?.nama || grp.guruNama,
      guruNip: guruObj?.nip || '-',
      guruJabatan: guruObj?.peranUtama || 'Guru SMK PGRI 2 Ponorogo',
      dudiKey: grp.namaDudi.toLowerCase(),
      namaDudi: dudiObj?.namaDudi || grp.namaDudi,
      alamatDudi: dudiObj?.alamat
        ? `${dudiObj.alamat}${dudiObj.wilayahKota ? `, ${dudiObj.wilayahKota}` : ''}`
        : '-',
      pemimpinDudi,
      noTelpDudi,
      students,
      isLocked,
      pendingStudents,
    });
  }

  return items.sort((a, b) => a.namaDudi.localeCompare(b.namaDudi));
}

export function buildBundlePrintPages(params: {
  activeDocKey: DocumentHubKey;
  selectedBundles: DudiBundleItem[];
  bundleIncludeSt: boolean;
  bundleIncludeMon: boolean;
  bundleIncludeNilai: boolean;
}): BundlePrintPage[] {
  const {
    activeDocKey,
    selectedBundles,
    bundleIncludeSt,
    bundleIncludeMon,
    bundleIncludeNilai,
  } = params;
  if (activeDocKey !== 'doc_paket_monitoring') return [];

  const pages: BundlePrintPage[] = [];
  for (const b of selectedBundles) {
    if (bundleIncludeSt) {
      pages.push({
        id: `st_${b.bundleKey}`,
        kind: 'surat_tugas',
        dudiName: b.namaDudi,
        guruName: b.guruNama,
        subtitle: `Surat Tugas (07.08) — ${b.namaDudi}`,
        bundle: b,
      });
    }
    if (bundleIncludeMon) {
      pages.push({
        id: `mon_${b.bundleKey}`,
        kind: 'monitoring',
        dudiName: b.namaDudi,
        guruName: b.guruNama,
        subtitle: `Lembar Monitoring (07.01) — ${b.namaDudi} (${b.students.length} siswa)`,
        bundle: b,
      });
    }
    if (bundleIncludeNilai) {
      b.students.forEach((stu, idx) => {
        pages.push({
          id: `nil_${b.bundleKey}_${stu.nis || idx}`,
          kind: 'nilai',
          dudiName: b.namaDudi,
          guruName: b.guruNama,
          subtitle: `Penilaian Kurmer — ${stu.namaSiswa} (${b.namaDudi})`,
          bundle: b,
          student: stu,
        });
      });
    }
  }
  return pages;
}

export function buildFilterMeta(params: {
  activeDocKey: DocumentHubKey;
  dudiList: Dudi[];
  pengajuanList: Pengajuan[];
  penempatanList: PenempatanPKL[];
  siswaByNis: Map<string, Siswa>;
  guruList: Guru[];
}): DocFilterMeta {
  const { activeDocKey, dudiList, pengajuanList, penempatanList, siswaByNis, guruList } = params;
  const jSet = new Set<string>();
  const sSet = new Set<string>();
  const subSet = new Set<string>();

  if (activeDocKey === 'doc_mou') {
    for (const d of dudiList) {
      if (d.bidangKeahlian && d.bidangKeahlian !== '-') jSet.add(d.bidangKeahlian.trim());
      if (d.statusKerjasama) sSet.add(d.statusKerjasama.trim());
      if (d.wilayahKota && d.wilayahKota !== '-') subSet.add(d.wilayahKota.trim());
    }
  } else if (activeDocKey === 'doc_pengajuan') {
    for (const p of pengajuanList) {
      if (p.jurusan && p.jurusan !== '-') jSet.add(p.jurusan.trim());
      if (p.statusKakomli) sSet.add(p.statusKakomli.trim());
      if (p.kelas && p.kelas !== '-') subSet.add(p.kelas.trim());
    }
  } else {
    for (const p of penempatanList) {
      if (isExcludedFromDudiListStatus(p.statusPenempatan)) continue;
      const sRec = siswaByNis.get(getCanonicalNisDigits(p.nis));
      if (sRec?.jurusan && sRec.jurusan !== '-') jSet.add(sRec.jurusan.trim());
    }
    for (const d of dudiList) {
      if (d.bidangKeahlian && d.bidangKeahlian !== '-') jSet.add(d.bidangKeahlian.trim());
    }
    if (activeDocKey === 'doc_surat_tugas') {
      for (const g of guruList) {
        if (g.peranUtama) sSet.add(g.peranUtama.trim());
      }
    }
  }

  return {
    jurusanOptions: Array.from(jSet).sort((a, b) => a.localeCompare(b)),
    statusOptions:
      activeDocKey === 'doc_paket_monitoring'
        ? ['SIAP', 'TERKUNCI']
        : Array.from(sSet).sort((a, b) => a.localeCompare(b)),
    subOptions: Array.from(subSet).sort((a, b) => a.localeCompare(b)),
    jurusanLabel: activeDocKey === 'doc_mou' ? 'Semua Bidang/Jurusan' : 'Semua Jurusan',
    statusLabel:
      activeDocKey === 'doc_mou'
        ? 'Semua Status MoU'
        : activeDocKey === 'doc_surat_tugas'
        ? 'Semua Peran'
        : activeDocKey === 'doc_pengajuan'
        ? 'Semua Status ACC'
        : 'Semua Status',
    subLabel: activeDocKey === 'doc_mou' ? 'Semua Wilayah' : 'Semua Kelas',
  };
}

export function buildFilteredItems(params: {
  activeDocKey: DocumentHubKey;
  searchQuery: string;
  guruFilter: string;
  jurusanFilter: string;
  statusFilter: string;
  subFilter: string;
  guruList: Guru[];
  dudiList: Dudi[];
  pengajuanList: Pengajuan[];
  penempatanList: PenempatanPKL[];
  siswaByNis: Map<string, Siswa>;
}): FilteredDocItem[] {
  const {
    activeDocKey,
    searchQuery,
    guruFilter,
    jurusanFilter,
    statusFilter,
    subFilter,
    guruList,
    dudiList,
    pengajuanList,
    penempatanList,
    siswaByNis,
  } = params;

  if (activeDocKey === 'doc_paket_monitoring') return [];
  const q = searchQuery.trim().toLowerCase();

  if (activeDocKey === 'doc_mou') {
    return dudiList
      .filter((d) => {
        if (jurusanFilter !== 'ALL' && (d.bidangKeahlian || '').trim() !== jurusanFilter) return false;
        if (statusFilter !== 'ALL' && (d.statusKerjasama || '').trim() !== statusFilter) return false;
        if (subFilter !== 'ALL' && (d.wilayahKota || '').trim() !== subFilter) return false;
        if (
          q &&
          !`${d.namaDudi} ${d.wilayahKota} ${d.bidangKeahlian} ${d.namaPic}`
            .toLowerCase()
            .includes(q)
        ) {
          return false;
        }
        return true;
      })
      .map((d) => ({
        id: d.id,
        title: d.namaDudi,
        badge: d.statusKerjasama || 'Aktif',
        subtitle: `${d.wilayahKota || d.alamat || '-'} · ${d.bidangKeahlian || '-'} · ${d.statusKerjasama}`,
        raw: d,
      }));
  }

  if (activeDocKey === 'doc_surat_tugas') {
    return guruList
      .filter((g) => {
        if (statusFilter !== 'ALL' && (g.peranUtama || '').trim() !== statusFilter) return false;
        if (jurusanFilter !== 'ALL') {
          const guruPlacements = penempatanList.filter(
            (p) => !isExcludedFromDudiListStatus(p.statusPenempatan) && isGuruAssignedToPlacement(p, g)
          );
          const hasJurusan = guruPlacements.some((p) => {
            const sRec = siswaByNis.get(getCanonicalNisDigits(p.nis));
            const dObj = findMatchingDudi(dudiList, p.idDudi, p.namaDudi);
            return (
              (sRec?.jurusan && sRec.jurusan.trim() === jurusanFilter) ||
              (dObj?.bidangKeahlian && dObj.bidangKeahlian.trim() === jurusanFilter)
            );
          });
          if (!hasJurusan) return false;
        }
        if (q && !`${g.nama} ${g.kontakWA || ''} ${g.peranUtama}`.toLowerCase().includes(q)) {
          return false;
        }
        return true;
      })
      .map((g) => {
        const dudiSet = new Set(
          penempatanList
            .filter(
              (p) => !isExcludedFromDudiListStatus(p.statusPenempatan) && isGuruAssignedToPlacement(p, g)
            )
            .map((p) => p.idDudi || normalizeRelationText(p.namaDudi))
            .filter(Boolean)
        );
        return {
          id: g.id,
          title: g.nama,
          badge: dudiSet.size > 0 ? `${dudiSet.size} DUDI` : '0 DUDI',
          subtitle: `${g.peranUtama}${g.kontakWA ? ` · ${g.kontakWA}` : ''}`,
          raw: g,
        };
      });
  }

  if (activeDocKey === 'doc_pengajuan') {
    const qDigits = stripNisSymbols(q);
    return pengajuanList
      .filter((p) => {
        const sRec = siswaByNis.get(getCanonicalNisDigits(p.nis));
        const resolvedNama = sRec?.nama || p.namaSiswa;
        const resolvedNis = sRec?.nis || p.nis;
        const resolvedJurusan = sRec?.jurusan || p.jurusan;
        const resolvedKelas = sRec?.kelas || p.kelas;
        if (jurusanFilter !== 'ALL' && (resolvedJurusan || '').trim() !== jurusanFilter) return false;
        if (statusFilter !== 'ALL' && (p.statusKakomli || '').trim() !== statusFilter) return false;
        if (subFilter !== 'ALL' && (resolvedKelas || '').trim() !== subFilter) return false;
        if (
          q &&
          !`${resolvedNama} ${resolvedNis} ${p.dudiTujuan} ${p.noPengajuan} ${resolvedJurusan} ${resolvedKelas}`
            .toLowerCase()
            .includes(q) &&
          !(qDigits && stripNisSymbols(resolvedNis).includes(qDigits))
        ) {
          return false;
        }
        return true;
      })
      .map((p) => {
        const sRec = siswaByNis.get(getCanonicalNisDigits(p.nis));
        const resolvedNama = sRec?.nama || p.namaSiswa;
        const resolvedNis = sRec?.nis || p.nis;
        const resolvedJurusan = sRec?.jurusan || p.jurusan;
        const resolvedKelas = sRec?.kelas || p.kelas;
        return {
          id: p.id,
          title: `${resolvedNama} — ${p.dudiTujuan}`,
          badge: p.statusKakomli || 'Menunggu',
          subtitle: `${formatNisVisual(resolvedNis)} · ${resolvedJurusan} (${resolvedKelas}) · ${p.statusKakomli}`,
          raw: p,
        };
      });
  }

  const qDigits = stripNisSymbols(q);
  const activeRows = penempatanList.filter((p) => !isExcludedFromDudiListStatus(p.statusPenempatan));
  const selectedGuruObj = guruFilter !== 'ALL' ? guruList.find((g) => g.id === guruFilter) : undefined;
  const dudiGroupMap = new Map<string, { dudiId: string; dudiName: string; rows: PenempatanPKL[] }>();

  for (const p of activeRows) {
    if (guruFilter !== 'ALL') {
      const matchId = p.idGuruPendamping && p.idGuruPendamping === guruFilter;
      const matchName =
        selectedGuruObj &&
        p.guruPendamping &&
        p.guruPendamping.toLowerCase().includes(selectedGuruObj.nama.toLowerCase());
      if (!matchId && !matchName) continue;
    }
    const matchedDudi = findMatchingDudi(dudiList, p.idDudi, p.namaDudi);
    const dudiName = (matchedDudi?.namaDudi || p.namaDudi || 'DUDI Belum Ditentukan').trim();
    const canonicalDudiId = matchedDudi?.id || p.idDudi || '';
    const key = canonicalDudiId || normalizeRelationText(dudiName);
    if (!dudiGroupMap.has(key)) {
      dudiGroupMap.set(key, { dudiId: canonicalDudiId, dudiName, rows: [] });
    }
    dudiGroupMap.get(key)!.rows.push(p);
  }

  return Array.from(dudiGroupMap.entries())
    .map(([key, grp]) => {
      const dedupedRows = dedupePlacementsByCanonicalNis(grp.rows, siswaByNis);
      const first = dedupedRows[0] || grp.rows[0];
      const dObj = findMatchingDudi(dudiList, grp.dudiId, grp.dudiName);
      const jurSet = new Set<string>();
      for (const r of dedupedRows) {
        const sRec = siswaByNis.get(getCanonicalNisDigits(r.nis));
        if (sRec?.jurusan && sRec.jurusan !== '-') jurSet.add(sRec.jurusan.trim());
      }
      if (dObj?.bidangKeahlian && dObj.bidangKeahlian !== '-') {
        jurSet.add(dObj.bidangKeahlian.trim());
      }
      if (jurusanFilter !== 'ALL' && !jurSet.has(jurusanFilter)) return null;

      const guruNames = Array.from(
        new Set(dedupedRows.map((r) => (r.guruPendamping || '').trim()).filter(Boolean))
      );
      const studentHay = dedupedRows.map((r) => `${r.namaSiswa} ${r.nis}`).join(' ');
      const fullHay = `${grp.dudiName} ${guruNames.join(' ')} ${Array.from(jurSet).join(' ')} ${studentHay}`.toLowerCase();
      const digitMatch =
        qDigits && dedupedRows.some((r) => stripNisSymbols(r.nis).includes(qDigits));
      if (q && !fullHay.includes(q) && !digitMatch) return null;

      return {
        id: `dudi_grp::${key}`,
        title: grp.dudiName,
        badge: `${dedupedRows.length} sw`,
        subtitle: `${dedupedRows.length} siswa · ${Array.from(jurSet).join('/') || '-'} · ${guruNames.join(', ') || 'Guru belum diatur'}`,
        raw: first,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function buildSuratTugasAudit(params: {
  activeDocKey: DocumentHubKey;
  activeRecord: any;
  penempatanList: PenempatanPKL[];
  dudiList: Dudi[];
  monitoringList: Monitoring[];
  siswaByNis: Map<string, Siswa>;
  suratTugasStageNum: number;
  selectedSuratTugasDudi: string;
}): SuratTugasAuditResult {
  const {
    activeDocKey,
    activeRecord,
    penempatanList,
    dudiList,
    monitoringList,
    siswaByNis,
    suratTugasStageNum,
    selectedSuratTugasDudi,
  } = params;

  if (activeDocKey !== 'doc_surat_tugas' || !activeRecord) {
    return {
      dudiGroups: [],
      unlockedGroups: [],
      lockedGroups: [],
      isPrintBlocked: false,
      blockReason: '',
    };
  }

  const guru = activeRecord as Guru;
  const assigned = penempatanList.filter(
    (p) => !isExcludedFromDudiListStatus(p.statusPenempatan) && isGuruAssignedToPlacement(p, guru)
  );

  const groupMap = new Map<string, { dudiId: string; namaDudi: string; students: PenempatanPKL[] }>();
  for (const stu of assigned) {
    const matchedDudi = findMatchingDudi(dudiList, stu.idDudi, stu.namaDudi);
    const dudiLabel = (matchedDudi?.namaDudi || stu.namaDudi || 'DUDI Belum Ditentukan').trim();
    const key = (matchedDudi?.id || stu.idDudi || normalizeRelationText(dudiLabel)).toLowerCase();
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        dudiId: matchedDudi?.id || stu.idDudi || '',
        namaDudi: dudiLabel,
        students: [],
      });
    }
    groupMap.get(key)!.students.push(stu);
  }

  const dudiGroups: SuratTugasDudiGroup[] = Array.from(groupMap.entries()).map(([key, grp]) => {
    const dudiObj = findMatchingDudi(dudiList, grp.dudiId, grp.namaDudi);
    const alamatDudi = dudiObj?.alamat
      ? `${dudiObj.alamat}${dudiObj.wilayahKota ? `, ${dudiObj.wilayahKota}` : ''}`
      : '-';
    const pemimpinDudi = dudiObj?.namaPemimpin || dudiObj?.namaPic || '';
    const dedupedStudents = dedupePlacementsByCanonicalNis(grp.students, siswaByNis);
    const pendingStudents = getPendingStudentsForStage(
      dedupedStudents,
      suratTugasStageNum,
      monitoringList
    );

    return {
      key,
      namaDudi: grp.namaDudi,
      alamatDudi,
      pemimpinDudi,
      students: dedupedStudents,
      isLocked: pendingStudents.length > 0,
      pendingStudents,
    };
  });

  const unlockedGroups = dudiGroups.filter((g) => !g.isLocked);
  const lockedGroups = dudiGroups.filter((g) => g.isLocked);

  let isPrintBlocked = false;
  let blockReason = '';
  const prevStageLabel = getStageValueByNumber(Math.max(1, suratTugasStageNum - 1));
  const currentStageLabel = getStageValueByNumber(suratTugasStageNum);

  if (suratTugasStageNum >= 2 && dudiGroups.length > 0) {
    if (selectedSuratTugasDudi === 'ALL_UNLOCKED') {
      if (unlockedGroups.length === 0) {
        isPrintBlocked = true;
        blockReason = `Seluruh DUDI bimbingan ${guru.nama} belum menyelesaikan ${prevStageLabel}, sehingga Surat Tugas ${currentStageLabel} masih terkunci.`;
      }
    } else {
      const targetGrp = dudiGroups.find((g) => g.key === selectedSuratTugasDudi);
      if (targetGrp?.isLocked) {
        isPrintBlocked = true;
        blockReason = `Surat Tugas ${currentStageLabel} untuk ${targetGrp.namaDudi} terkunci karena ${targetGrp.pendingStudents.join(', ')} belum menyelesaikan ${prevStageLabel}.`;
      }
    }
  }

  return {
    dudiGroups,
    unlockedGroups,
    lockedGroups,
    isPrintBlocked,
    blockReason,
  };
}

export function buildBatchSuratTugasPages(params: {
  activeDocKey: DocumentHubKey;
  isMultiCheckedMode: boolean;
  checkedItems: FilteredDocItem[];
  penempatanList: PenempatanPKL[];
  monitoringList: Monitoring[];
  dudiList: Dudi[];
  siswaByNis: Map<string, Siswa>;
  suratTugasStageNum: number;
}): BatchSuratTugasPage[] {
  const {
    activeDocKey,
    isMultiCheckedMode,
    checkedItems,
    penempatanList,
    monitoringList,
    dudiList,
    siswaByNis,
    suratTugasStageNum,
  } = params;

  if (activeDocKey !== 'doc_surat_tugas' || !isMultiCheckedMode) return [];
  const pages: BatchSuratTugasPage[] = [];

  for (const item of checkedItems) {
    const guru = item.raw as Guru;
    const assigned = penempatanList.filter(
      (p) => !isExcludedFromDudiListStatus(p.statusPenempatan) && isGuruAssignedToPlacement(p, guru)
    );
    const groupMap = new Map<string, { dudiId: string; namaDudi: string; students: PenempatanPKL[] }>();
    for (const stu of assigned) {
      const matchedDudi = findMatchingDudi(dudiList, stu.idDudi, stu.namaDudi);
      const dudiLabel = (matchedDudi?.namaDudi || stu.namaDudi || 'DUDI Belum Ditentukan').trim();
      const key = (matchedDudi?.id || stu.idDudi || normalizeRelationText(dudiLabel)).toLowerCase();
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          dudiId: matchedDudi?.id || stu.idDudi || '',
          namaDudi: dudiLabel,
          students: [],
        });
      }
      groupMap.get(key)!.students.push(stu);
    }

    for (const [dKey, grp] of groupMap.entries()) {
      const dedupedStudents = dedupePlacementsByCanonicalNis(grp.students, siswaByNis);
      const pending = getPendingStudentsForStage(dedupedStudents, suratTugasStageNum, monitoringList);
      if (pending.length > 0) continue;

      const dudiObj = findMatchingDudi(dudiList, grp.dudiId, grp.namaDudi);
      const alamatDudi = dudiObj?.alamat
        ? `${dudiObj.alamat}${dudiObj.wilayahKota ? `, ${dudiObj.wilayahKota}` : ''}`
        : '-';
      const pemimpinDudi = dudiObj?.namaPemimpin || dudiObj?.namaPic || '';
      pages.push({
        id: `st_batch_${guru.id}_${dKey}`,
        guru,
        namaDudi: grp.namaDudi,
        alamatDudi,
        pemimpinDudi,
        subtitle: `${guru.nama} — ${grp.namaDudi}`,
        itemId: item.id,
      });
    }
  }
  return pages;
}
