import type { AdminSessionUser } from '../auth/LocalAccountAuthService';
import type { Guru, Jurusan } from '../types/schema';

export function cleanPersonTitle(raw: unknown): string {
  return String(raw || '')
    .toLowerCase()
    .replace(
      /\b(drs?|ir|hj|h|prof|s\.?pd|s\.?kom|s\.?t|s\.?si|s\.?ag|s\.?e|s\.?sos|m\.?pd|m\.?kom|m\.?t|m\.?m|m\.?si|a\.?md)\b\.?/gi,
      ' '
    )
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchJurusanItem(rawJurusan: unknown, jur: Jurusan): boolean {
  const target = String(rawJurusan || '').trim().toLowerCase();
  if (!target || target === '-') return false;

  const idVal = String(jur.id || '').trim().toLowerCase();
  const kode = String(jur.kode || '').trim().toLowerCase();
  const nama = String(jur.nama || '').trim().toLowerCase();

  return (
    (idVal !== '' && target === idVal) ||
    (kode !== '' && target === kode) ||
    (nama !== '' && target === nama) ||
    (kode.length >= 2 &&
      (target.startsWith(`${kode} `) ||
        target.includes(`(${kode})`) ||
        new RegExp(`\\b${kode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(target))) ||
    (nama.length >= 4 && (target.includes(nama) || nama.includes(target)))
  );
}

export function matchAnyJurusanItem(rawJurusan: unknown, jurusans: Jurusan[]): boolean {
  if (!Array.isArray(jurusans) || jurusans.length === 0) return false;
  return jurusans.some((j) => matchJurusanItem(rawJurusan, j));
}

/**
 * Resolves ALL Jurusan records managed by the logged-in Kakomli user.
 * Supports 1 Kakomli managing multiple jurusans (e.g., 2-3 jurusans) by matching:
 * 1) `Master_Jurusan.idKakomli` against user ID / identifier / matched Guru ID (`Master_Guru_Pendamping`)
 * 2) `Master_Jurusan.namaKakomli` person-name match (stripped of academic titles)
 * 3) Multi-token Jurusan codes/names inside user's `title`, `username`, or `identifier`
 */
export function resolveKakomliJurusans(
  currentUser: AdminSessionUser | null,
  jurusanList: Jurusan[],
  guruList: Guru[] = []
): Jurusan[] {
  if (!currentUser || !Array.isArray(jurusanList) || jurusanList.length === 0) return [];

  const userId = String(currentUser.id || '').trim();
  const userIdentifier = String(currentUser.identifier || '').trim();
  const userEmail = String(currentUser.email || '').trim().toLowerCase();
  const userUsername = String(currentUser.username || '').trim().toLowerCase();
  const userNameClean = cleanPersonTitle(currentUser.name);
  const isGenericKakomliName =
    !userNameClean ||
    userNameClean.includes('ketua konsentrasi') ||
    userNameClean.includes('ketua kompetensi') ||
    userNameClean === 'kakomli';

  const matchedGuruIds = new Set<string>();
  for (const g of guruList) {
    const gId = String(g.id || '').trim();
    if (!gId) continue;
    const gEmail = String(g.email || '').trim().toLowerCase();
    const gNameClean = cleanPersonTitle(g.nama);
    const idMatches = (userId && gId === userId) || (userIdentifier && gId === userIdentifier);
    const emailMatches =
      Boolean(gEmail) &&
      ((userEmail && gEmail === userEmail) ||
        (userUsername && gEmail === userUsername) ||
        (userIdentifier && gEmail === userIdentifier.toLowerCase()));
    const nameMatches =
      !isGenericKakomliName &&
      Boolean(gNameClean && gNameClean.length >= 3) &&
      (gNameClean === userNameClean ||
        gNameClean.includes(userNameClean) ||
        userNameClean.includes(gNameClean));

    if (idMatches || emailMatches || nameMatches) {
      matchedGuruIds.add(gId);
    }
  }

  const userTitleRaw =
    `${currentUser.title || ''} ${currentUser.username || ''} ${currentUser.identifier || ''}`.toLowerCase();

  const seenIds = new Set<string>();
  const matched: Jurusan[] = [];

  for (const j of jurusanList) {
    const jIdKakomli = String(j.idKakomli || '').trim();
    const matchesById =
      Boolean(jIdKakomli) &&
      ((userId !== '' && jIdKakomli === userId) ||
        (userIdentifier !== '' && jIdKakomli === userIdentifier) ||
        matchedGuruIds.has(jIdKakomli));

    const kakomliClean = cleanPersonTitle(j.namaKakomli);
    const matchesByName =
      !isGenericKakomliName &&
      Boolean(kakomliClean && kakomliClean.length >= 3) &&
      (kakomliClean === userNameClean ||
        kakomliClean.includes(userNameClean) ||
        userNameClean.includes(kakomliClean));

    const kode = String(j.kode || '').trim().toLowerCase();
    const nama = String(j.nama || '').trim().toLowerCase();
    const matchesByTitleOrCode =
      (kode.length >= 2 &&
        new RegExp(`\\b${kode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(userTitleRaw)) ||
      (nama.length >= 5 && userTitleRaw.includes(nama));

    if (matchesById || matchesByName || matchesByTitleOrCode) {
      const dedupKey = j.id || j.kode || j.nama;
      if (!seenIds.has(dedupKey)) {
        seenIds.add(dedupKey);
        matched.push(j);
      }
    }
  }

  return matched;
}
