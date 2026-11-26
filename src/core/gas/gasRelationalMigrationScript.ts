export function buildGasRelationalMigrationCode(): string {
  return `/**
 * ============================================================================
 * FILE 03: MIGRASI RELASIONAL, BACKFILL FK & ARRAYFORMULA BARIS-1
 * Bagian dari Google Apps Script SI-HUBIN SMK PGRI 2 Ponorogo (4 File Modular)
 *
 * Fitur utama:
 * - cleanupDoubleColumnsAndRestoreLayout(): membersihkan kolom ganda akibat error
 *   header sebelumnya & mengembalikan urutan kolom sesuai blueprint TANPA menimpa
 *   rumus ARRAYFORMULA manual yang sudah berjalan benar.
 * - setupRelationalFormulasAndMigrate(): backfill Foreign Key lintas sheet via
 *   ID/Nama/NIS, membersihkan kolom ganda/redundan, merapikan urutan kolom, dan
 *   menanamkan seluruh ARRAYFORMULA Baris-1 dengan verifikasi otomatis (';' / ',').
 * ============================================================================
 */

function cleanupDoubleColumnsAndRestoreLayout() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Spreadsheet aktif tidak ditemukan.');
  const summary = applyRelationalFormulasToSpreadsheet(ss, {
    preserveWorkingFormulas: true,
    pruneOptionA: false,
    skipBackfillAndGradeMigration: true
  });
  Logger.log('HASIL PERAPIAN KOLOM & RUMUS: ' + JSON.stringify(summary));
  return summary;
}

function setupRelationalFormulasAndMigrate() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Spreadsheet aktif tidak ditemukan.');
  const summary = applyRelationalFormulasToSpreadsheet(ss, {
    preserveWorkingFormulas: false,
    pruneOptionA: true,
    skipBackfillAndGradeMigration: false
  });
  Logger.log('HASIL MIGRASI RELASIONAL: ' + JSON.stringify(summary));
  return summary;
}

function applyRelationalFormulasToSpreadsheet(ss, opts) {
  const targetSs = ss || SpreadsheetApp.getActiveSpreadsheet();
  const options = opts || {};
  const preserveWorkingFormulas = Boolean(options.preserveWorkingFormulas);
  const pruneOptionA = options.pruneOptionA !== undefined ? Boolean(options.pruneOptionA) : true;
  const skipBackfillAndGradeMigration = Boolean(options.skipBackfillAndGradeMigration);

  const ssLocale = String(targetSs.getSpreadsheetLocale() || 'id_ID');
  const isEnLocale = /^en_/i.test(ssLocale);
  // Pemisah argumen formula sesuai locale Spreadsheet ('; ' untuk Indonesia/id_ID, ', ' untuk English/en_*)
  const S = isEnLocale ? ', ' : '; ';

  const normText = function(v) {
    return String(v === null || v === undefined ? '' : v).trim().toLowerCase().replace(/\\s+/g, ' ');
  };
  const normDigits = function(v) {
    return String(v === null || v === undefined ? '' : v).replace(/\\D/g, '');
  };
  const jurCodeMap = {
    'desain komunikasi visual': 'DKV',
    'rekayasa perangkat lunak': 'RPL',
    'teknik alat berat': 'TAB',
    'teknik bodi kendaraan ringan': 'TBKR',
    'teknik kendaraan ringan': 'TKR',
    'teknik komputer dan jaringan': 'TKJ',
    'teknik pemesinan': 'TPM',
    'teknik pengelasan': 'TPL',
    'teknik sepeda motor': 'TSM'
  };
  const resolveJurCode = function(rawVal, jurusanRowsMap) {
    const str = String(rawVal || '').trim();
    if (!str) return '';
    const n = normText(str);
    if (jurCodeMap[n]) return jurCodeMap[n];
    if (jurusanRowsMap && jurusanRowsMap[n]) return jurusanRowsMap[n];
    const upper = str.toUpperCase();
    if (/^[A-Z0-9]{2,6}$/.test(upper)) return upper;
    return '';
  };

  const insertFkBeforeIfMissing = function(sheet, fkHeader, beforeHeaderCandidates) {
    if (!sheet || sheet.getLastColumn() === 0) return;
    const hdrs = resolveEffectiveHeaderLabels(sheet).labels;
    if (findColumnIndex(hdrs, [normalizeKey(fkHeader)]) !== -1) return;
    const beforeIdx = findColumnIndex(hdrs, beforeHeaderCandidates);
    if (beforeIdx !== -1) {
      sheet.insertColumnBefore(beforeIdx + 1);
      sheet.getRange(1, beforeIdx + 1)
        .setValue(fkHeader)
        .setFontWeight('bold')
        .setBackground('#0F172A')
        .setFontColor('#FFFFFF');
    } else {
      ensureMissingHeaders(sheet, sheet.getName());
    }
  };

  // 1. Resolusi sheet & rename Plotting_Pemberangkatan -> data_plotting saat migrasi penuh
  const shSiswa = resolveSheetAlias(targetSs, 'Master_Siswa_XI');
  const shJurusan = resolveSheetAlias(targetSs, 'Master_Jurusan');
  const shKelas = resolveSheetAlias(targetSs, 'Master_Kelas_Walas');
  const shDudi = resolveSheetAlias(targetSs, 'Master_DUDI');
  const shGuru = resolveSheetAlias(targetSs, 'Master_Guru_Pendamping');
  const shPengajuan = resolveSheetAlias(targetSs, 'Data_Pengajuan_PKL');
  const shPerizinan = resolveSheetAlias(targetSs, 'Data_Perizinan_PKL');
  const shPlotting = resolveSheetAlias(targetSs, 'data_plotting');
  if (
    shPlotting &&
    shPlotting.getName() === 'Plotting_Pemberangkatan' &&
    !targetSs.getSheetByName('data_plotting') &&
    !skipBackfillAndGradeMigration
  ) {
    try {
      shPlotting.setName('data_plotting');
    } catch (renameErr) {}
  }
  const shMonitoring = resolveSheetAlias(targetSs, 'Monitoring_5_Tahap');
  const shSertifikatRaw = targetSs.getSheetByName('Nilai_Dan_Sertifikat');
  const shSertifikat = (shSertifikatRaw && (!shPlotting || shSertifikatRaw.getSheetId() !== shPlotting.getSheetId()))
    ? shSertifikatRaw
    : null;
  const shLogSurat = resolveSheetAlias(targetSs, 'Log_Penerbitan_Surat');

  const allSheetItems = [
    { sheet: shSiswa, name: 'Master_Siswa_XI' },
    { sheet: shJurusan, name: 'Master_Jurusan' },
    { sheet: shKelas, name: 'Master_Kelas_Walas' },
    { sheet: shDudi, name: 'Master_DUDI' },
    { sheet: shGuru, name: 'Master_Guru_Pendamping' },
    { sheet: shPengajuan, name: 'Data_Pengajuan_PKL' },
    { sheet: shPerizinan, name: 'Data_Perizinan_PKL' },
    { sheet: shPlotting, name: 'data_plotting' },
    { sheet: shMonitoring, name: 'Monitoring_5_Tahap' },
    { sheet: shLogSurat, name: 'Log_Penerbitan_Surat' }
  ];

  const OPTION_A_PRUNED_COLS = {
    Data_Pengajuan_PKL: [
      'jurusan',
      'kelas',
      'namaortuwali',
      'noortuwali',
      'alamatdudi',
      'bidangpekerjaan',
      'namapemimpin',
      'namapic',
      'notelpdudi',
      'kontakpic',
      'harikerja',
      'jamkerja',
      'linkmaps',
      'nowa',
      'alamatdomisili'
    ],
    Data_Perizinan_PKL: [
      'jurusan',
      'kelas',
      'namaortuwali',
      'noortuwali',
      'alamatdudi',
      'nopengajuan',
      'nosuratpermohonan',
      'tglkirimsurat',
      'statusbalasandudi',
      'tglbalasan',
      'linksuratpdf'
    ],
    Monitoring_5_Tahap: ['alamatdudi', 'jurusan']
  };

  let cleanedDuplicateCols = 0;
  let cleanedPrunedCols = 0;
  let reorderedCols = 0;

  const consolidateSheetColumns = function(sheet, canonicalSheetName, allowPrune) {
    if (!sheet || sheet.getLastColumn() === 0) return;
    const expected = REQUIRED_SHEET_HEADERS[canonicalSheetName] || [];
    const lastCol = sheet.getLastColumn();
    const lastRow = sheet.getLastRow();
    const resolvedHdr = resolveEffectiveHeaderLabels(sheet, lastCol);
    const headers = resolvedHdr.labels;
    const headerVals = resolvedHdr.values;
    const headerFormulas = resolvedHdr.formulas;
    const formulaFlags = detectFormulaColFlags(sheet, lastCol);
    const values = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];
    const colsToDelete = {};

    const hasWorkingHeaderFormula = function(colIdx) {
      const f = String(headerFormulas[colIdx] || '').trim();
      const v = String(headerVals[colIdx] === null || headerVals[colIdx] === undefined ? '' : headerVals[colIdx]).trim();
      return f.charAt(0) === '=' && v !== '' && v.charAt(0) !== '#';
    };

    for (let eIdx = 0; eIdx < expected.length; eIdx++) {
      const canonicalHeader = expected[eIdx];
      const canonicalNorm = normalizeKey(canonicalHeader);
      const synonyms = getHeaderSynonymNorms(canonicalSheetName, canonicalNorm);
      const matchedCols = [];
      for (let c = 0; c < headers.length; c++) {
        if (colsToDelete[c]) continue;
        const hNorm = normalizeKey(headers[c]);
        if (hNorm && synonyms.indexOf(hNorm) !== -1) {
          matchedCols.push(c);
        }
      }
      if (matchedCols.length === 0) continue;

      let keepCol = matchedCols[0];
      let bestScore = -1;
      for (let m = 0; m < matchedCols.length; m++) {
        const cIdx = matchedCols[m];
        const isExact = normalizeKey(headers[cIdx]) === canonicalNorm ? 1 : 0;
        const isWorking = hasWorkingHeaderFormula(cIdx) ? 10 : 0;
        const hasAnyFormula = String(headerFormulas[cIdx] || '').trim().charAt(0) === '=' ? 2 : 0;
        const score = isWorking + hasAnyFormula + isExact;
        if (score > bestScore) {
          bestScore = score;
          keepCol = cIdx;
        }
      }

      const keepHasFormula = String(headerFormulas[keepCol] || '').trim().charAt(0) === '=';
      if (!keepHasFormula && String(headers[keepCol] || '').trim() !== canonicalHeader) {
        sheet.getRange(1, keepCol + 1).setValue(canonicalHeader);
      }

      if (matchedCols.length > 1) {
        let keepModified = false;
        for (let m = 0; m < matchedCols.length; m++) {
          const dupCol = matchedCols[m];
          if (dupCol === keepCol) continue;
          if (!formulaFlags[keepCol] && !keepHasFormula) {
            for (let r = 0; r < values.length; r++) {
              const currVal = String(values[r][keepCol] === null || values[r][keepCol] === undefined ? '' : values[r][keepCol]).trim();
              const dupVal = values[r][dupCol];
              const dupStr = String(dupVal === null || dupVal === undefined ? '' : dupVal).trim();
              if (!currVal && dupStr !== '') {
                values[r][keepCol] = dupVal;
                keepModified = true;
              }
            }
          }
          colsToDelete[dupCol] = 'duplicate';
        }
        if (keepModified && values.length > 0) {
          sheet.getRange(2, keepCol + 1, values.length, 1).setValues(
            values.map(function(row) { return [row[keepCol]]; })
          );
        }
      }
    }

    if (allowPrune) {
      const prunedList = OPTION_A_PRUNED_COLS[canonicalSheetName] || [];
      if (prunedList.length > 0) {
        const nisCol = findColumnIndex(headers, ['nis']);
        const dudiIdCol = findColumnIndex(headers, ['iddudi']);
        let hasPopulatedFk = false;
        for (let r = 0; r < values.length; r++) {
          const hasNis = nisCol !== -1 && String(values[r][nisCol] || '').trim() !== '';
          const hasDudi = dudiIdCol !== -1 && String(values[r][dudiIdCol] || '').trim() !== '';
          if (hasNis || hasDudi) {
            hasPopulatedFk = true;
            break;
          }
        }

        for (let c = 0; c < headers.length; c++) {
          if (colsToDelete[c]) continue;
          const hNorm = normalizeKey(headers[c]);
          if (prunedList.indexOf(hNorm) === -1) continue;
          let allBlank = true;
          for (let r = 0; r < values.length; r++) {
            if (String(values[r][c] === null || values[r][c] === undefined ? '' : values[r][c]).trim() !== '') {
              allBlank = false;
              break;
            }
          }
          if (formulaFlags[c] || hasPopulatedFk || allBlank || values.length === 0) {
            colsToDelete[c] = 'pruned';
          }
        }
      }
    }

    const deleteIndicesDesc = Object.keys(colsToDelete)
      .map(function(idxStr) { return Number(idxStr); })
      .sort(function(a, b) { return b - a; });

    for (let i = 0; i < deleteIndicesDesc.length; i++) {
      const colIdx = deleteIndicesDesc[i];
      if (colsToDelete[colIdx] === 'duplicate') cleanedDuplicateCols++;
      if (colsToDelete[colIdx] === 'pruned') cleanedPrunedCols++;
      sheet.deleteColumn(colIdx + 1);
    }
  };

  const reorderSheetColumnsToBlueprint = function(sheet, canonicalSheetName) {
    if (!sheet || sheet.getLastColumn() === 0) return;
    const expected = REQUIRED_SHEET_HEADERS[canonicalSheetName] || [];
    if (expected.length === 0) return;
    const labels = resolveEffectiveHeaderLabels(sheet).labels.slice();
    let targetIdx0 = 0;

    for (let eIdx = 0; eIdx < expected.length; eIdx++) {
      const canonicalNorm = normalizeKey(expected[eIdx]);
      const synonyms = getHeaderSynonymNorms(canonicalSheetName, canonicalNorm);
      let foundIdx = -1;
      for (let c = targetIdx0; c < labels.length; c++) {
        const hNorm = normalizeKey(labels[c]);
        if (hNorm && synonyms.indexOf(hNorm) !== -1) {
          foundIdx = c;
          break;
        }
      }
      if (foundIdx === -1) continue;
      if (foundIdx !== targetIdx0) {
        sheet.moveColumns(sheet.getRange(1, foundIdx + 1, 1, 1), targetIdx0 + 1);
        const movedLabel = labels.splice(foundIdx, 1)[0];
        labels.splice(targetIdx0, 0, movedLabel);
        reorderedCols++;
      }
      targetIdx0++;
    }
  };

  // Bersihkan kolom ganda yang mungkin sudah ada sebelum menambah header yang benar-benar kurang
  allSheetItems.forEach(function(item) {
    if (item.sheet) consolidateSheetColumns(item.sheet, item.name, false);
  });

  if (shJurusan) insertFkBeforeIfMissing(shJurusan, 'ID_Kakomli', ['namakakomli']);
  if (shKelas) insertFkBeforeIfMissing(shKelas, 'ID_Jurusan', ['jurusan']);
  if (shPerizinan) insertFkBeforeIfMissing(shPerizinan, 'ID_DUDI', ['duditujuan']);
  if (shMonitoring) {
    insertFkBeforeIfMissing(shMonitoring, 'ID_DUDI', ['duditujuan']);
    insertFkBeforeIfMissing(shMonitoring, 'ID_Guru_Pendamping', ['gurupendamping']);
  }
  if (shLogSurat) insertFkBeforeIfMissing(shLogSurat, 'ID_Guru_Pendamping', ['gurupendamping']);

  Object.keys(REQUIRED_SHEET_HEADERS).forEach(function(name) {
    const sh = resolveSheetAlias(targetSs, name);
    if (sh) ensureMissingHeaders(sh, name);
  });

  // Format kolom NIS sebagai plain text '@' agar VLOOKUP teks & angka selalu cocok
  [shSiswa, shPengajuan, shPerizinan, shPlotting, shMonitoring, shSertifikat].forEach(function(sh) {
    if (!sh || sh.getLastColumn() === 0) return;
    const h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    const nisIdx = findColumnIndex(h, ['nis']);
    if (nisIdx !== -1 && sh.getLastRow() >= 2) {
      const nr = sh.getRange(2, nisIdx + 1, sh.getLastRow() - 1, 1);
      nr.setNumberFormat('@');
      const nVals = nr.getValues();
      let changed = false;
      for (let i = 0; i < nVals.length; i++) {
        const clean = normDigits(nVals[i][0]) || String(nVals[i][0] || '').trim();
        if (clean !== nVals[i][0] && clean !== '') {
          nVals[i][0] = clean;
          changed = true;
        }
      }
      if (changed) nr.setValues(nVals);
    }
  });

  let backfilledRows = 0;

  // 2. Bangun peta referensi Master (Jurusan, Guru, DUDI)
  const jurNameToCode = {};
  if (shJurusan && shJurusan.getLastRow() >= 2) {
    const jd = shJurusan.getDataRange().getValues();
    const jh = jd[0];
    const cKode = findColumnIndex(jh, ['kode', 'kodejurusan', 'id']);
    const cNama = findColumnIndex(jh, ['namajurusan', 'nama']);
    for (let r = 1; r < jd.length; r++) {
      const k = cKode !== -1 ? String(jd[r][cKode] || '').trim() : '';
      const n = cNama !== -1 ? String(jd[r][cNama] || '').trim() : '';
      if (k && n) {
        jurNameToCode[normText(n)] = k.toUpperCase();
        jurNameToCode[normText(k)] = k.toUpperCase();
      }
    }
  }

  const guruById = {};
  const guruByName = {};
  const guruNameCount = {};
  if (shGuru && shGuru.getLastRow() >= 2) {
    const gd = shGuru.getDataRange().getValues();
    const gh = gd[0];
    const cId = findColumnIndex(gh, ['id', 'idguru']);
    const cNama = findColumnIndex(gh, ['namalengkap', 'namaguru', 'nama']);
    for (let r = 1; r < gd.length; r++) {
      const id = cId !== -1 ? String(gd[r][cId] || '').trim() : '';
      const nm = cNama !== -1 ? String(gd[r][cNama] || '').trim() : '';
      if (id) guruById[id] = { id: id, nama: nm };
      if (nm) {
        const nk = normText(nm);
        guruNameCount[nk] = (guruNameCount[nk] || 0) + 1;
        guruByName[nk] = id;
      }
    }
  }

  // Backfill ID_Kakomli di Master_Jurusan
  if (shJurusan && shJurusan.getLastRow() >= 2) {
    const jd2 = shJurusan.getDataRange().getValues();
    const jh2 = jd2[0];
    const cIdKakomli = findColumnIndex(jh2, ['idkakomli']);
    const cNmKakomli = findColumnIndex(jh2, ['namakakomli']);
    if (cIdKakomli !== -1 && cNmKakomli !== -1) {
      let jChanged = false;
      for (let r = 1; r < jd2.length; r++) {
        if (!String(jd2[r][cIdKakomli] || '').trim()) {
          const nk = normText(jd2[r][cNmKakomli]);
          if (nk && guruNameCount[nk] === 1 && guruByName[nk]) {
            jd2[r][cIdKakomli] = guruByName[nk];
            jChanged = true;
            backfilledRows++;
          }
        }
      }
      if (jChanged) {
        shJurusan.getRange(2, cIdKakomli + 1, jd2.length - 1, 1)
          .setValues(jd2.slice(1).map(function(row) { return [row[cIdKakomli]]; }));
      }
    }
  }

  const dudiById = {};
  const dudiByName = {};
  if (shDudi && shDudi.getLastRow() >= 2) {
    const dd = shDudi.getDataRange().getValues();
    const dh = dd[0];
    const cId = findColumnIndex(dh, ['id', 'iddudi']);
    const cNama = findColumnIndex(dh, ['namadudi', 'nama']);
    const cIdGuru = findColumnIndex(dh, ['idgurupendamping', 'idguru']);
    const cNmGuru = findColumnIndex(dh, ['gurupendamping']);
    let dChanged = false;
    for (let r = 1; r < dd.length; r++) {
      const id = cId !== -1 ? String(dd[r][cId] || '').trim() : '';
      const nm = cNama !== -1 ? String(dd[r][cNama] || '').trim() : '';
      let gId = cIdGuru !== -1 ? String(dd[r][cIdGuru] || '').trim() : '';
      const gNm = cNmGuru !== -1 ? String(dd[r][cNmGuru] || '').trim() : '';
      if (!gId && gNm && guruByName[normText(gNm)] && cIdGuru !== -1) {
        gId = guruByName[normText(gNm)];
        dd[r][cIdGuru] = gId;
        dChanged = true;
        backfilledRows++;
      }
      if (id) dudiById[id] = { id: id, nama: nm, idGuru: gId };
      if (nm) dudiByName[normText(nm)] = id;
    }
    if (dChanged && cIdGuru !== -1) {
      shDudi.getRange(2, cIdGuru + 1, dd.length - 1, 1)
        .setValues(dd.slice(1).map(function(row) { return [row[cIdGuru]]; }));
    }
  }

  // Backfill ID_Jurusan menjadi Kode kanonik di Master_Siswa_XI & Master_Kelas_Walas
  if (shSiswa && shSiswa.getLastRow() >= 2) {
    const sd = shSiswa.getDataRange().getValues();
    const shdr = sd[0];
    const cJur = findColumnIndex(shdr, ['idjurusan', 'jurusan']);
    if (cJur !== -1) {
      const out = [];
      let changed = false;
      for (let r = 1; r < sd.length; r++) {
        const curr = String(sd[r][cJur] || '').trim();
        const code = resolveJurCode(curr, jurNameToCode) || curr;
        if (code !== curr) { changed = true; backfilledRows++; }
        out.push([code]);
      }
      if (changed) shSiswa.getRange(2, cJur + 1, out.length, 1).setValues(out);
    }
  }

  if (shKelas && shKelas.getLastRow() >= 2) {
    const kd = shKelas.getDataRange().getValues();
    const kh = kd[0];
    const cIdJur = findColumnIndex(kh, ['idjurusan']);
    const cJur = findColumnIndex(kh, ['jurusan']);
    const cNamaKls = findColumnIndex(kh, ['namakelas']);
    if (cIdJur !== -1) {
      const out = [];
      let changed = false;
      for (let r = 1; r < kd.length; r++) {
        let code = String(kd[r][cIdJur] || '').trim();
        if (!code && cJur !== -1) code = resolveJurCode(kd[r][cJur], jurNameToCode);
        if (!code && cNamaKls !== -1) {
          const tokens = String(kd[r][cNamaKls] || '').trim().split(/\\s+/);
          for (let t = 0; t < tokens.length; t++) {
            const candidate = resolveJurCode(tokens[t], jurNameToCode);
            if (candidate) { code = candidate; break; }
          }
        }
        if (code !== String(kd[r][cIdJur] || '').trim()) { changed = true; backfilledRows++; }
        out.push([code]);
      }
      if (changed) shKelas.getRange(2, cIdJur + 1, out.length, 1).setValues(out);
    }
  }

  // 2B. Bangun peta Pengajuan aktif per NIS + backfill ID_DUDI & ID_Guru_Pendamping di Data_Pengajuan_PKL
  const statusByNis = {};
  const pengajuanActiveByNis = {};
  if (shPengajuan && shPengajuan.getLastRow() >= 2) {
    const pq = shPengajuan.getDataRange().getValues();
    const pqh = pq[0];
    const cNis = findColumnIndex(pqh, ['nis']);
    const cSk = findColumnIndex(pqh, ['statuskakomli']);
    const cSh = findColumnIndex(pqh, ['statushubin']);
    const cIdDudi = findColumnIndex(pqh, ['iddudi']);
    const cDudiNm = findColumnIndex(pqh, ['duditujuan', 'namadudi']);
    const cIdGuru = findColumnIndex(pqh, ['idgurupendamping', 'idguru']);
    const cNmGuru = findColumnIndex(pqh, ['gurupendamping']);
    let pqDudiChanged = false;
    let pqGuruChanged = false;

    for (let r = 1; r < pq.length; r++) {
      const n = normDigits(cNis !== -1 ? pq[r][cNis] : '');
      const sk = normText(cSk !== -1 ? pq[r][cSk] : '');
      const shStat = normText(cSh !== -1 ? pq[r][cSh] : '');

      let dId = cIdDudi !== -1 ? String(pq[r][cIdDudi] || '').trim() : '';
      const dNm = cDudiNm !== -1 ? String(pq[r][cDudiNm] || '').trim() : '';
      if (!dId && dNm && dudiByName[normText(dNm)] && cIdDudi !== -1) {
        dId = dudiByName[normText(dNm)];
        pq[r][cIdDudi] = dId;
        pqDudiChanged = true;
        backfilledRows++;
      }

      let gId = cIdGuru !== -1 ? String(pq[r][cIdGuru] || '').trim() : '';
      const gNm = cNmGuru !== -1 ? String(pq[r][cNmGuru] || '').trim() : '';
      if (!gId && cIdGuru !== -1) {
        const foundG = (gNm && guruByName[normText(gNm)]) || (dId && dudiById[dId] && dudiById[dId].idGuru) || '';
        if (foundG) {
          gId = foundG;
          pq[r][cIdGuru] = gId;
          pqGuruChanged = true;
          backfilledRows++;
        }
      }

      if (n && sk !== 'ditolak' && shStat !== 'batal') {
        statusByNis[n] = 'Diajukan';
        const rank = (shStat === 'terjadwal' || shStat === 'siap diberangkatkan') ? 3 : (sk === 'disetujui' ? 2 : 1);
        const prev = pengajuanActiveByNis[n];
        if (!prev || rank >= prev.rank) {
          pengajuanActiveByNis[n] = {
            idDudi: dId,
            namaDudi: dNm,
            idGuru: gId,
            rank: rank
          };
        }
      }
    }
    if (pqDudiChanged && cIdDudi !== -1) {
      shPengajuan.getRange(2, cIdDudi + 1, pq.length - 1, 1)
        .setValues(pq.slice(1).map(function(row) { return [row[cIdDudi]]; }));
    }
    if (pqGuruChanged && cIdGuru !== -1) {
      shPengajuan.getRange(2, cIdGuru + 1, pq.length - 1, 1)
        .setValues(pq.slice(1).map(function(row) { return [row[cIdGuru]]; }));
    }
  }

  // Backfill ID_DUDI di Data_Perizinan_PKL lebih dulu sebagai referensi tambahan per NIS
  const perizinanDudiByNis = {};
  if (shPerizinan && shPerizinan.getLastRow() >= 2) {
    const zd0 = shPerizinan.getDataRange().getValues();
    const zh0 = zd0[0];
    const cIdD0 = findColumnIndex(zh0, ['iddudi']);
    const cNmD0 = findColumnIndex(zh0, ['duditujuan', 'namadudi']);
    const cNis0 = findColumnIndex(zh0, ['nis']);
    for (let r = 1; r < zd0.length; r++) {
      const n = cNis0 !== -1 ? normDigits(zd0[r][cNis0]) : '';
      let dId = cIdD0 !== -1 ? String(zd0[r][cIdD0] || '').trim() : '';
      const dNm = cNmD0 !== -1 ? String(zd0[r][cNmD0] || '').trim() : '';
      if (!dId && dNm && dudiByName[normText(dNm)]) dId = dudiByName[normText(dNm)];
      if (n && dId) perizinanDudiByNis[n] = dId;
    }
  }

  // 2C. Bangun peta Plotting_Pemberangkatan + backfill ID_DUDI (dari Nama_DUDI / Data_Pengajuan_PKL / Perizinan) & ID_Guru_Pendamping
  const pltById = {};
  const pltActiveByNis = {};
  if (shPlotting && shPlotting.getLastRow() >= 2) {
    const pd = shPlotting.getDataRange().getValues();
    const ph = pd[0];
    const cIdPlt = findColumnIndex(ph, ['idpenempatan', 'id']);
    const cNis = findColumnIndex(ph, ['nis']);
    const cIdDudi = findColumnIndex(ph, ['iddudi']);
    const cNmDudi = findColumnIndex(ph, ['namadudi', 'duditujuan']);
    const cIdGuru = findColumnIndex(ph, ['idgurupendamping', 'idguru']);
    const cNmGuru = findColumnIndex(ph, ['gurupendamping']);
    const cStatus = findColumnIndex(ph, ['statuspenempatan']);
    let dChanged = false;
    let gChanged = false;

    for (let r = 1; r < pd.length; r++) {
      const idPlt = cIdPlt !== -1 ? String(pd[r][cIdPlt] || '').trim() : '';
      const nis = normDigits(cNis !== -1 ? pd[r][cNis] : '');
      let dId = cIdDudi !== -1 ? String(pd[r][cIdDudi] || '').trim() : '';
      const dNm = cNmDudi !== -1 ? String(pd[r][cNmDudi] || '').trim() : '';
      let gId = cIdGuru !== -1 ? String(pd[r][cIdGuru] || '').trim() : '';
      const gNm = cNmGuru !== -1 ? String(pd[r][cNmGuru] || '').trim() : '';
      const stNorm = normText(cStatus !== -1 ? pd[r][cStatus] : '');
      const reqRef = nis ? pengajuanActiveByNis[nis] : null;

      if (!dId && cIdDudi !== -1) {
        const resolvedDudiId =
          (dNm && dudiByName[normText(dNm)]) ||
          (reqRef && reqRef.idDudi) ||
          (reqRef && reqRef.namaDudi && dudiByName[normText(reqRef.namaDudi)]) ||
          (nis && perizinanDudiByNis[nis]) ||
          '';
        if (resolvedDudiId) {
          dId = resolvedDudiId;
          pd[r][cIdDudi] = dId;
          dChanged = true;
          backfilledRows++;
        }
      }
      if (!gId && cIdGuru !== -1) {
        const resolvedGuruId =
          (gNm && guruByName[normText(gNm)]) ||
          (dId && dudiById[dId] && dudiById[dId].idGuru) ||
          (reqRef && reqRef.idGuru) ||
          '';
        if (resolvedGuruId) {
          gId = resolvedGuruId;
          pd[r][cIdGuru] = gId;
          gChanged = true;
          backfilledRows++;
        }
      }
      if (idPlt) {
        pltById[idPlt] = { nis: nis, idDudi: dId, idGuru: gId };
      }
      if (nis && stNorm !== 'dibatalkan' && stNorm !== 'batal' && stNorm !== 'pindah dudi') {
        pltActiveByNis[nis] = { idPlt: idPlt, idDudi: dId, idGuru: gId };
        statusByNis[nis] = stNorm === 'selesai pkl' ? 'Selesai PKL' : 'Sedang PKL';
      }
    }
    if (dChanged && cIdDudi !== -1) {
      shPlotting.getRange(2, cIdDudi + 1, pd.length - 1, 1)
        .setValues(pd.slice(1).map(function(row) { return [row[cIdDudi]]; }));
    }
    if (gChanged && cIdGuru !== -1) {
      shPlotting.getRange(2, cIdGuru + 1, pd.length - 1, 1)
        .setValues(pd.slice(1).map(function(row) { return [row[cIdGuru]]; }));
    }
  }

  // Sinkronisasi Status_PKL pada Master_Siswa_XI
  if (shSiswa && shSiswa.getLastRow() >= 2) {
    const sd2 = shSiswa.getDataRange().getValues();
    const sh2 = sd2[0];
    const cNis = findColumnIndex(sh2, ['nis']);
    const cStatus = findColumnIndex(sh2, ['statuspkl']);
    if (cNis !== -1 && cStatus !== -1) {
      let sChanged = false;
      for (let r = 1; r < sd2.length; r++) {
        const n = normDigits(sd2[r][cNis]);
        const currSt = normText(sd2[r][cStatus]);
        const targetSt = n ? statusByNis[n] : '';
        if (targetSt) {
          const shouldUpgrade =
            !currSt ||
            currSt === 'belum daftar' ||
            currSt === 'aktif pkl' ||
            (targetSt === 'Sedang PKL' && (currSt === 'diajukan' || currSt === 'diterima dudi')) ||
            (targetSt === 'Selesai PKL' && currSt !== 'selesai pkl');
          if (shouldUpgrade && sd2[r][cStatus] !== targetSt) {
            sd2[r][cStatus] = targetSt;
            sChanged = true;
            backfilledRows++;
          }
        }
      }
      if (sChanged) {
        shSiswa.getRange(2, cStatus + 1, sd2.length - 1, 1)
          .setValues(sd2.slice(1).map(function(row) { return [row[cStatus]]; }));
      }
    }
  }

  // Backfill ID_DUDI di Data_Perizinan_PKL
  if (shPerizinan && shPerizinan.getLastRow() >= 2) {
    const zd = shPerizinan.getDataRange().getValues();
    const zh = zd[0];
    const cIdDudi = findColumnIndex(zh, ['iddudi']);
    const cDudiNm = findColumnIndex(zh, ['duditujuan', 'namadudi']);
    const cNis = findColumnIndex(zh, ['nis']);
    if (cIdDudi !== -1) {
      let zChanged = false;
      for (let r = 1; r < zd.length; r++) {
        if (!String(zd[r][cIdDudi] || '').trim()) {
          const nm = cDudiNm !== -1 ? String(zd[r][cDudiNm] || '').trim() : '';
          const n = cNis !== -1 ? normDigits(zd[r][cNis]) : '';
          const found =
            (nm && dudiByName[normText(nm)]) ||
            (n && pltActiveByNis[n] && pltActiveByNis[n].idDudi) ||
            (n && pengajuanActiveByNis[n] && pengajuanActiveByNis[n].idDudi) ||
            '';
          if (found) {
            zd[r][cIdDudi] = found;
            zChanged = true;
            backfilledRows++;
          }
        }
      }
      if (zChanged) {
        shPerizinan.getRange(2, cIdDudi + 1, zd.length - 1, 1)
          .setValues(zd.slice(1).map(function(row) { return [row[cIdDudi]]; }));
      }
    }
  }

  // Backfill ID_Penempatan, NIS, ID_DUDI & ID_Guru_Pendamping di Monitoring_5_Tahap
  const monGradedKeys = {};
  if (shMonitoring && shMonitoring.getLastRow() >= 2) {
    const md = shMonitoring.getDataRange().getValues();
    const mh = md[0];
    const cIdPlt = findColumnIndex(mh, ['idpenempatan']);
    const cNis = findColumnIndex(mh, ['nis']);
    const cIdDudi = findColumnIndex(mh, ['iddudi']);
    const cNmDudi = findColumnIndex(mh, ['duditujuan', 'namadudi']);
    const cIdGuru = findColumnIndex(mh, ['idgurupendamping', 'idguru']);
    const cNmGuru = findColumnIndex(mh, ['gurupendamping']);
    const cK3 = findColumnIndex(mh, ['nilaik3lh']);
    const cSs = findColumnIndex(mh, ['nilaisoftskills', 'nilaisoftskill']);
    const cHs = findColumnIndex(mh, ['nilaihardskills', 'nilaikompetensiteknis']);
    const cAb = findColumnIndex(mh, ['nilaialurbisnisduniakerja', 'nilaialurbisnis']);
    let mpChanged = false;
    let mnChanged = false;
    let mdChanged = false;
    let mgChanged = false;

    for (let r = 1; r < md.length; r++) {
      let idPlt = cIdPlt !== -1 ? String(md[r][cIdPlt] || '').trim() : '';
      let nis = cNis !== -1 ? normDigits(md[r][cNis]) : '';
      let pltRef = (idPlt && pltById[idPlt]) || (nis && pltActiveByNis[nis]) || null;

      if (cIdPlt !== -1 && (!idPlt || idPlt.indexOf('PLT-2') === 0) && nis && pltActiveByNis[nis] && pltActiveByNis[nis].idPlt) {
        idPlt = pltActiveByNis[nis].idPlt;
        md[r][cIdPlt] = idPlt;
        pltRef = pltById[idPlt] || pltActiveByNis[nis];
        mpChanged = true;
        backfilledRows++;
      }
      if (cNis !== -1 && !nis && pltRef && pltRef.nis) {
        nis = pltRef.nis;
        md[r][cNis] = nis;
        mnChanged = true;
        backfilledRows++;
      }

      const reqRef = nis ? pengajuanActiveByNis[nis] : null;
      if (cIdDudi !== -1 && !String(md[r][cIdDudi] || '').trim()) {
        const dNm = cNmDudi !== -1 ? String(md[r][cNmDudi] || '').trim() : '';
        const foundD =
          (dNm && dudiByName[normText(dNm)]) ||
          (pltRef && pltRef.idDudi) ||
          (reqRef && reqRef.idDudi) ||
          '';
        if (foundD) { md[r][cIdDudi] = foundD; mdChanged = true; backfilledRows++; }
      }
      if (cIdGuru !== -1 && !String(md[r][cIdGuru] || '').trim()) {
        const gNm = cNmGuru !== -1 ? String(md[r][cNmGuru] || '').trim() : '';
        const dIdCurr = cIdDudi !== -1 ? String(md[r][cIdDudi] || '').trim() : '';
        const foundG =
          (gNm && guruByName[normText(gNm)]) ||
          (pltRef && pltRef.idGuru) ||
          (dIdCurr && dudiById[dIdCurr] && dudiById[dIdCurr].idGuru) ||
          (reqRef && reqRef.idGuru) ||
          '';
        if (foundG) { md[r][cIdGuru] = foundG; mgChanged = true; backfilledRows++; }
      }
      const sumScore =
        (cK3 !== -1 ? Number(md[r][cK3] || 0) : 0) +
        (cSs !== -1 ? Number(md[r][cSs] || 0) : 0) +
        (cHs !== -1 ? Number(md[r][cHs] || 0) : 0) +
        (cAb !== -1 ? Number(md[r][cAb] || 0) : 0);
      if (sumScore > 0) {
        if (idPlt) monGradedKeys['plt:' + idPlt] = true;
        if (nis) monGradedKeys['nis:' + nis] = true;
      }
    }
    if (mpChanged && cIdPlt !== -1) {
      shMonitoring.getRange(2, cIdPlt + 1, md.length - 1, 1)
        .setValues(md.slice(1).map(function(row) { return [row[cIdPlt]]; }));
    }
    if (mnChanged && cNis !== -1) {
      shMonitoring.getRange(2, cNis + 1, md.length - 1, 1)
        .setValues(md.slice(1).map(function(row) { return [row[cNis]]; }));
    }
    if (mdChanged && cIdDudi !== -1) {
      shMonitoring.getRange(2, cIdDudi + 1, md.length - 1, 1)
        .setValues(md.slice(1).map(function(row) { return [row[cIdDudi]]; }));
    }
    if (mgChanged && cIdGuru !== -1) {
      shMonitoring.getRange(2, cIdGuru + 1, md.length - 1, 1)
        .setValues(md.slice(1).map(function(row) { return [row[cIdGuru]]; }));
    }
  }

  // 3. Migrasi Nilai & Blangko Lama dari tab legacy Nilai_Dan_Sertifikat (jika masih ada) -> Monitoring_5_Tahap & data_plotting
  let migratedGradesCount = 0;
  if (!skipBackfillAndGradeMigration && shSertifikat && shSertifikat.getLastRow() >= 2) {
    const cd = shSertifikat.getDataRange().getValues();
    const ch = cd[0];
    const cIdPlt = findColumnIndex(ch, ['idpenempatan']);
    const cNis = findColumnIndex(ch, ['nis']);
    const cIdDudi = findColumnIndex(ch, ['iddudi']);
    const cNmDudi = findColumnIndex(ch, ['duditujuan', 'namadudi']);
    const cK3 = findColumnIndex(ch, ['nilaik3lh']);
    const cSs = findColumnIndex(ch, ['nilaisoftskills', 'nilaisoftskill']);
    const cHs = findColumnIndex(ch, ['nilaihardskills', 'nilaikompetensiteknis']);
    const cAb = findColumnIndex(ch, ['nilaialurbisnisduniakerja', 'nilaialurbisnis']);
    const cNoSeri = findColumnIndex(ch, ['noseriblangko']);
    const cStBlangko = findColumnIndex(ch, ['statusblangko']);
    const cStRaport = findColumnIndex(ch, ['statusraport']);
    const cTglTerbit = findColumnIndex(ch, ['tglterbit', 'tanggalterbit']);

    const monHeaders = shMonitoring ? shMonitoring.getRange(1, 1, 1, shMonitoring.getLastColumn()).getValues()[0] : [];
    const monRowsToAppend = [];

    const pltData = (shPlotting && shPlotting.getLastRow() >= 2) ? shPlotting.getDataRange().getValues() : [];
    const pltHdr = pltData.length > 0 ? pltData[0] : [];
    const pCIdPlt = findColumnIndex(pltHdr, ['idpenempatan', 'id']);
    const pCNis = findColumnIndex(pltHdr, ['nis']);
    const pCNoSeri = findColumnIndex(pltHdr, ['noseriblangko']);
    const pCStBlangko = findColumnIndex(pltHdr, ['statusblangko']);
    const pCStRaport = findColumnIndex(pltHdr, ['statusraport']);
    const pCTglTerbit = findColumnIndex(pltHdr, ['tglterbit', 'tanggalterbit']);
    let pltBlangkoChanged = false;

    for (let r = 1; r < cd.length; r++) {
      let idPlt = cIdPlt !== -1 ? String(cd[r][cIdPlt] || '').trim() : '';
      const nis = cNis !== -1 ? normDigits(cd[r][cNis]) : '';
      let pltRef = (idPlt && pltById[idPlt]) || (nis && pltActiveByNis[nis]) || null;

      if ((!idPlt || idPlt.indexOf('PLT-2') === 0) && nis && pltActiveByNis[nis] && pltActiveByNis[nis].idPlt) {
        idPlt = pltActiveByNis[nis].idPlt;
        pltRef = pltById[idPlt] || pltActiveByNis[nis];
      }

      // Copy blangko/raport metadata from legacy Nilai_Dan_Sertifikat into data_plotting
      if (pltData.length > 1) {
        for (let pr = 1; pr < pltData.length; pr++) {
          const prId = pCIdPlt !== -1 ? String(pltData[pr][pCIdPlt] || '').trim() : '';
          const prNis = pCNis !== -1 ? normDigits(pltData[pr][pCNis]) : '';
          if ((idPlt && prId === idPlt) || (nis && prNis === nis)) {
            if (pCNoSeri !== -1 && cNoSeri !== -1 && !String(pltData[pr][pCNoSeri] || '').trim() && String(cd[r][cNoSeri] || '').trim()) {
              pltData[pr][pCNoSeri] = cd[r][cNoSeri];
              pltBlangkoChanged = true;
            }
            if (pCStBlangko !== -1 && cStBlangko !== -1 && String(cd[r][cStBlangko] || '').trim()) {
              pltData[pr][pCStBlangko] = cd[r][cStBlangko];
              pltBlangkoChanged = true;
            }
            if (pCStRaport !== -1 && cStRaport !== -1 && String(cd[r][cStRaport] || '').trim()) {
              pltData[pr][pCStRaport] = cd[r][cStRaport];
              pltBlangkoChanged = true;
            }
            if (pCTglTerbit !== -1 && cTglTerbit !== -1 && !String(pltData[pr][pCTglTerbit] || '').trim() && String(cd[r][cTglTerbit] || '').trim()) {
              pltData[pr][pCTglTerbit] = cd[r][cTglTerbit];
              pltBlangkoChanged = true;
            }
            break;
          }
        }
      }

      const k3 = cK3 !== -1 ? Number(cd[r][cK3] || 0) : 0;
      const ssScore = cSs !== -1 ? Number(cd[r][cSs] || 0) : 0;
      const hs = cHs !== -1 ? Number(cd[r][cHs] || 0) : 0;
      const ab = cAb !== -1 ? Number(cd[r][cAb] || 0) : 0;
      const hasLegacyGrades = (k3 + ssScore + hs + ab) > 0;
      const alreadyInMon = (idPlt && monGradedKeys['plt:' + idPlt]) || (nis && monGradedKeys['nis:' + nis]);

      if (shMonitoring && hasLegacyGrades && !alreadyInMon) {
        const dNm = cNmDudi !== -1 ? String(cd[r][cNmDudi] || '').trim() : '';
        const monObj = {
          ID_Monitoring: 'MON-MIG-' + (idPlt || nis || r),
          ID_Penempatan: idPlt || (pltRef ? pltRef.idPlt : ''),
          NIS: nis,
          ID_DUDI: (cIdDudi !== -1 ? String(cd[r][cIdDudi] || '').trim() : '') || (dNm && dudiByName[normText(dNm)]) || (pltRef ? pltRef.idDudi : ''),
          ID_Guru_Pendamping: pltRef ? pltRef.idGuru : '',
          Tahap: '5. Monitoring 4',
          Tanggal_Kunjungan: Utilities.formatDate(new Date(), targetSs.getSpreadsheetTimeZone() || 'Asia/Jakarta', 'yyyy-MM-dd'),
          Nilai_PKL_Muncul: 'Ya',
          Nilai_K3LH: k3,
          Nilai_Softskills: ssScore,
          Nilai_Hardskills: hs,
          Nilai_Alur_Bisnis_Dunia_Kerja: ab,
          Catatan_Kunjungan: 'Migrasi otomatis nilai historis ke SSOT Monitoring_5_Tahap',
          Nilai_DUDI_Terkumpul: 'Ya',
          Status_Tahap: 'Tervalidasi Hubin'
        };
        monRowsToAppend.push(monHeaders.map(function(h) {
          const val = getNormalizedValue(monObj, h);
          return val !== undefined ? val : '';
        }));
        migratedGradesCount++;
      }
    }

    if (pltBlangkoChanged && shPlotting && pltData.length > 1) {
      [pCNoSeri, pCStBlangko, pCStRaport, pCTglTerbit].forEach(function(colIdx) {
        if (colIdx !== -1) {
          shPlotting.getRange(2, colIdx + 1, pltData.length - 1, 1)
            .setValues(pltData.slice(1).map(function(row) { return [row[colIdx]]; }));
        }
      });
    }

    if (shMonitoring && monRowsToAppend.length > 0) {
      const mFlags = detectFormulaColFlags(shMonitoring, monHeaders.length);
      const startRow = getNextAppendRowNonFormula(shMonitoring, mFlags);
      writeNonFormulaMatrixSpans(shMonitoring, startRow, monRowsToAppend, mFlags);
      formatNisAndTextColumns(shMonitoring, monHeaders, startRow, monRowsToAppend.length);
    }
  }

  // Backfill ID_DUDI & ID_Guru_Pendamping di Log_Penerbitan_Surat
  if (shLogSurat && shLogSurat.getLastRow() >= 2) {
    const ld = shLogSurat.getDataRange().getValues();
    const lh = ld[0];
    const cIdDudi = findColumnIndex(lh, ['iddudi']);
    const cNmDudi = findColumnIndex(lh, ['namadudi', 'duditujuan']);
    const cIdGuru = findColumnIndex(lh, ['idgurupendamping', 'idguru']);
    const cNmGuru = findColumnIndex(lh, ['gurupendamping']);
    let ldChanged = false;
    let lgChanged = false;
    for (let r = 1; r < ld.length; r++) {
      let dIdCurr = cIdDudi !== -1 ? String(ld[r][cIdDudi] || '').trim() : '';
      const dNmCurr = cNmDudi !== -1 ? String(ld[r][cNmDudi] || '').trim() : '';
      if (!dIdCurr && dNmCurr && dudiByName[normText(dNmCurr)] && cIdDudi !== -1) {
        dIdCurr = dudiByName[normText(dNmCurr)];
        ld[r][cIdDudi] = dIdCurr;
        ldChanged = true;
        backfilledRows++;
      }
      if (cIdGuru !== -1 && !String(ld[r][cIdGuru] || '').trim()) {
        const gNmCurr = cNmGuru !== -1 ? String(ld[r][cNmGuru] || '').trim() : '';
        const gNk = normText(gNmCurr);
        const foundG =
          (gNk && guruNameCount[gNk] === 1 && guruByName[gNk]) ||
          (dIdCurr && dudiById[dIdCurr] && dudiById[dIdCurr].idGuru) ||
          '';
        if (foundG) {
          ld[r][cIdGuru] = foundG;
          lgChanged = true;
          backfilledRows++;
        }
      }
    }
    if (ldChanged && cIdDudi !== -1) {
      shLogSurat.getRange(2, cIdDudi + 1, ld.length - 1, 1)
        .setValues(ld.slice(1).map(function(row) { return [row[cIdDudi]]; }));
    }
    if (lgChanged && cIdGuru !== -1) {
      shLogSurat.getRange(2, cIdGuru + 1, ld.length - 1, 1)
        .setValues(ld.slice(1).map(function(row) { return [row[cIdGuru]]; }));
    }
  }

  // 3.5. Pembersihan kolom duplikat/alias, kolom redundan, & urutan kolom blueprint
  allSheetItems.forEach(function(item) {
    if (item.sheet) {
      consolidateSheetColumns(item.sheet, item.name, pruneOptionA);
      reorderSheetColumnsToBlueprint(item.sheet, item.name);
    }
  });

  // 4. Resolusi Huruf Kolom Aktual & Pembangun Formula Locale-Safe (HSTACK + S)
  const getColLetter = function(sheet, candidatesNorm) {
    if (!sheet || sheet.getLastColumn() === 0) return '';
    const hdrs = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const idx = findColumnIndex(hdrs, candidatesNorm);
    return idx !== -1 ? colToLetterGas(idx) : '';
  };
  const ref = function(sheet, colLetter) {
    return "'" + sheet.getName() + "'!" + colLetter + "2:" + colLetter;
  };
  const sameRef = function(colLetter) {
    return colLetter + "2:" + colLetter;
  };
  const hstackExpr = function(cols) {
    return 'HSTACK(' + cols.join(S) + ')';
  };
  const vlookupTextExpr = function(lookupExpr, keyRangeExpr, valRangeExpr, fallbackExpr) {
    return 'IFERROR(VLOOKUP(' + lookupExpr + S + hstackExpr([keyRangeExpr, valRangeExpr]) + S + '2' + S + 'FALSE)' + S + (fallbackExpr || '""') + ')';
  };

  const plantFormula = function(sheet, headerCandidates, headerLabel, formulaBody) {
    if (!sheet || !formulaBody) return false;
    const hdrs = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const idx = findColumnIndex(hdrs, headerCandidates);
    if (idx === -1) return false;
    const col1 = idx + 1;
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, col1, lastRow - 1, 1).clearContent();
    }
    const cell = sheet.getRange(1, col1);
    cell.setFormula('={"' + headerLabel + '"; ARRAYFORMULA(' + formulaBody + ')}');
    cell.setFontWeight('bold').setBackground('#0F172A').setFontColor('#FFFFFF');
    return true;
  };

  // Kumpulkan referensi kolom penting tiap sheet
  const sNis = getColLetter(shSiswa, ['nis']);
  const sNama = getColLetter(shSiswa, ['namalengkap', 'namasiswa', 'nama']);
  const sJur = getColLetter(shSiswa, ['idjurusan', 'jurusan']);
  const sKls = getColLetter(shSiswa, ['kelas']);
  const sStatus = getColLetter(shSiswa, ['statuspkl']);

  const jKode = getColLetter(shJurusan, ['kode', 'kodejurusan', 'id']);
  const jNama = getColLetter(shJurusan, ['namajurusan', 'nama']);

  const dId = getColLetter(shDudi, ['id', 'iddudi']);
  const dNama = getColLetter(shDudi, ['namadudi', 'nama']);
  const dIdGuru = getColLetter(shDudi, ['idgurupendamping', 'idguru']);
  const dGuru = getColLetter(shDudi, ['gurupendamping']);

  const gId = getColLetter(shGuru, ['id', 'idguru']);
  const gNama = getColLetter(shGuru, ['namalengkap', 'namaguru', 'nama']);

  const qNo = getColLetter(shPengajuan, ['nopengajuan', 'id']);
  const qNis = getColLetter(shPengajuan, ['nis']);
  const qIdDudi = getColLetter(shPengajuan, ['iddudi']);
  const qDudi = getColLetter(shPengajuan, ['duditujuan', 'namadudi']);
  const qIdGuru = getColLetter(shPengajuan, ['idgurupendamping', 'idguru']);

  const pId = getColLetter(shPlotting, ['idpenempatan', 'id']);
  const pNis = getColLetter(shPlotting, ['nis']);
  const pIdDudi = getColLetter(shPlotting, ['iddudi']);
  const pIdGuru = getColLetter(shPlotting, ['idgurupendamping', 'idguru']);
  const pStatus = getColLetter(shPlotting, ['statuspenempatan']);

  let plantedCount = 0;

  const expandJurusanExpr = function(codeExpr) {
    if (shJurusan && jKode && jNama) {
      return vlookupTextExpr(
        'UPPER(TRIM(TO_TEXT(' + codeExpr + ')))',
        'UPPER(TRIM(TO_TEXT(' + ref(shJurusan, jKode) + ')))',
        ref(shJurusan, jNama),
        'TRIM(TO_TEXT(' + codeExpr + '))'
      );
    }
    return 'TRIM(TO_TEXT(' + codeExpr + '))';
  };

  // --- A. Master_Jurusan: Kuota_Siswa & Total_Terdaftar ---
  if (shJurusan && shSiswa && jKode && jNama && sJur && sStatus) {
    const kExpr = 'IF(TRIM(TO_TEXT(' + sameRef(jKode) + '))=""' + S + '""' + S +
      'COUNTIF(' + ref(shSiswa, sJur) + S + 'TRIM(TO_TEXT(' + sameRef(jKode) + '))) + ' +
      'IF(LOWER(TRIM(TO_TEXT(' + sameRef(jNama) + ')))=LOWER(TRIM(TO_TEXT(' + sameRef(jKode) + ')))' + S + '0' + S +
      'COUNTIF(' + ref(shSiswa, sJur) + S + 'TRIM(TO_TEXT(' + sameRef(jNama) + ')))))';
    if (plantFormula(shJurusan, ['kuotasiswa', 'targetkuota'], 'Kuota_Siswa', kExpr)) plantedCount++;

    const tExpr = 'IF(TRIM(TO_TEXT(' + sameRef(jKode) + '))=""' + S + '""' + S +
      'COUNTIFS(' + ref(shSiswa, sJur) + S + 'TRIM(TO_TEXT(' + sameRef(jKode) + '))' + S + ref(shSiswa, sStatus) + S + '"<>"' + S + ref(shSiswa, sStatus) + S + '"<>Belum Daftar") + ' +
      'IF(LOWER(TRIM(TO_TEXT(' + sameRef(jNama) + ')))=LOWER(TRIM(TO_TEXT(' + sameRef(jKode) + ')))' + S + '0' + S +
      'COUNTIFS(' + ref(shSiswa, sJur) + S + 'TRIM(TO_TEXT(' + sameRef(jNama) + '))' + S + ref(shSiswa, sStatus) + S + '"<>"' + S + ref(shSiswa, sStatus) + S + '"<>Belum Daftar")))';
    if (plantFormula(shJurusan, ['totalterdaftar', 'siswaterdaftar'], 'Total_Terdaftar', tExpr)) plantedCount++;
  }

  // --- B. Master_Kelas_Walas: Jurusan & Jumlah_Siswa ---
  if (shKelas) {
    const kNama = getColLetter(shKelas, ['namakelas']);
    const kIdJur = getColLetter(shKelas, ['idjurusan']);
    if (kIdJur) {
      const jurExpr = 'IF(TRIM(TO_TEXT(' + sameRef(kIdJur) + '))=""' + S + '""' + S + expandJurusanExpr(sameRef(kIdJur)) + ')';
      if (plantFormula(shKelas, ['jurusan'], 'Jurusan', jurExpr)) plantedCount++;
    }
    if (kNama && shSiswa && sKls) {
      const jmlExpr = 'IF(TRIM(TO_TEXT(' + sameRef(kNama) + '))=""' + S + '""' + S + 'COUNTIF(' + ref(shSiswa, sKls) + S + 'TRIM(TO_TEXT(' + sameRef(kNama) + '))))';
      if (plantFormula(shKelas, ['jumlahsiswa'], 'Jumlah_Siswa', jmlExpr)) plantedCount++;
    }
  }

  // --- C. Master_DUDI: Guru_Pendamping & Terisi ---
  if (shDudi) {
    if (dIdGuru && shGuru && gId && gNama) {
      const dgExpr = 'IF(TRIM(TO_TEXT(' + sameRef(dIdGuru) + '))=""' + S + '""' + S +
        vlookupTextExpr('TRIM(TO_TEXT(' + sameRef(dIdGuru) + '))', 'TRIM(TO_TEXT(' + ref(shGuru, gId) + '))', ref(shGuru, gNama)) + ')';
      if (plantFormula(shDudi, ['gurupendamping'], 'Guru_Pendamping', dgExpr)) plantedCount++;
    }
    if (dId && shPlotting && pIdDudi && pStatus) {
      const terisiExpr = 'IF(TRIM(TO_TEXT(' + sameRef(dId) + '))=""' + S + '""' + S +
        'COUNTIFS(' + ref(shPlotting, pIdDudi) + S + 'TRIM(TO_TEXT(' + sameRef(dId) + '))' + S +
        ref(shPlotting, pStatus) + S + '"<>Dibatalkan"' + S +
        ref(shPlotting, pStatus) + S + '"<>Batal"' + S +
        ref(shPlotting, pStatus) + S + '"<>Pindah DUDI"' + S +
        ref(shPlotting, pStatus) + S + '"<>Selesai PKL"))';
      if (plantFormula(shDudi, ['terisi'], 'Terisi', terisiExpr)) plantedCount++;
    }
  }

  // --- D. Master_Guru_Pendamping: Jumlah_Bimbingan ---
  if (shGuru && gId && shPlotting && pIdGuru && pStatus) {
    const gbExpr = 'IF(TRIM(TO_TEXT(' + sameRef(gId) + '))=""' + S + '""' + S +
      'COUNTIFS(' + ref(shPlotting, pIdGuru) + S + 'TRIM(TO_TEXT(' + sameRef(gId) + '))' + S +
      ref(shPlotting, pStatus) + S + '"<>Dibatalkan"' + S +
      ref(shPlotting, pStatus) + S + '"<>Batal"' + S +
      ref(shPlotting, pStatus) + S + '"<>Pindah DUDI"' + S +
      ref(shPlotting, pStatus) + S + '"<>Selesai PKL"))';
    if (plantFormula(shGuru, ['jumlahbimbingan'], 'Jumlah_Bimbingan', gbExpr)) plantedCount++;
  }

  // --- E. Data_Pengajuan_PKL: Nama_Siswa & Guru_Pendamping ---
  if (shPengajuan && shSiswa && sNis) {
    if (qNis && sNama) {
      const qNamaExpr = 'IF(TRIM(TO_TEXT(' + sameRef(qNis) + '))=""' + S + '""' + S +
        vlookupTextExpr('TRIM(TO_TEXT(' + sameRef(qNis) + '))', 'TRIM(TO_TEXT(' + ref(shSiswa, sNis) + '))', ref(shSiswa, sNama)) + ')';
      if (plantFormula(shPengajuan, ['namasiswa'], 'Nama_Siswa', qNamaExpr)) plantedCount++;
    }
    if (qIdGuru && shGuru && gId && gNama) {
      const dudiGuruFallback = (qIdDudi && shDudi && dId && dGuru)
        ? vlookupTextExpr('TRIM(TO_TEXT(' + sameRef(qIdDudi) + '))', 'TRIM(TO_TEXT(' + ref(shDudi, dId) + '))', ref(shDudi, dGuru))
        : '""';
      const keyGuard = qNo || qNis;
      const qGuruExpr = 'IF(TRIM(TO_TEXT(' + sameRef(keyGuard) + '))=""' + S + '""' + S +
        'IF(TRIM(TO_TEXT(' + sameRef(qIdGuru) + '))<>""' + S +
        vlookupTextExpr('TRIM(TO_TEXT(' + sameRef(qIdGuru) + '))', 'TRIM(TO_TEXT(' + ref(shGuru, gId) + '))', ref(shGuru, gNama)) + S +
        dudiGuruFallback + '))';
      if (plantFormula(shPengajuan, ['gurupendamping'], 'Guru_Pendamping', qGuruExpr)) plantedCount++;
    }
  }

  // --- F. Data_Perizinan_PKL: Nama_Siswa, Rentang_Tanggal, DUDI_Tujuan ---
  if (shPerizinan) {
    const zId = getColLetter(shPerizinan, ['idperizinan', 'noperizinan', 'id']);
    const zNis = getColLetter(shPerizinan, ['nis']);
    const zMulai = getColLetter(shPerizinan, ['tglmulaiizin', 'tanggalmulaiizin']);
    const zSelesai = getColLetter(shPerizinan, ['tglselesaiizin', 'tanggalselesaiizin']);
    const zIdDudi = getColLetter(shPerizinan, ['iddudi']);

    if (zNis && shSiswa && sNis && sNama) {
      const zNamaExpr = 'IF(TRIM(TO_TEXT(' + sameRef(zNis) + '))=""' + S + '""' + S +
        vlookupTextExpr('TRIM(TO_TEXT(' + sameRef(zNis) + '))', 'TRIM(TO_TEXT(' + ref(shSiswa, sNis) + '))', ref(shSiswa, sNama)) + ')';
      if (plantFormula(shPerizinan, ['namasiswa'], 'Nama_Siswa', zNamaExpr)) plantedCount++;
    }
    if (zMulai && zSelesai) {
      const mDate = 'IF(ISNUMBER(' + sameRef(zMulai) + ')' + S + sameRef(zMulai) + S + 'DATEVALUE(' + sameRef(zMulai) + '))';
      const sDate = 'IF(ISNUMBER(' + sameRef(zSelesai) + ')' + S + sameRef(zSelesai) + S + 'DATEVALUE(' + sameRef(zSelesai) + '))';
      const rentangExpr = 'IF(TRIM(TO_TEXT(' + sameRef(zMulai) + '))=""' + S + '""' + S +
        'IFERROR(TEXT(' + mDate + S + '"dd/mm/yyyy") & IF(TRIM(TO_TEXT(' + sameRef(zSelesai) + '))=""' + S + '" (1 hari)"' + S +
        '" s/d " & TEXT(' + sDate + S + '"dd/mm/yyyy") & " (" & (VALUE(' + sDate + ') - VALUE(' + mDate + ') + 1) & " hari)")' + S +
        'TRIM(TO_TEXT(' + sameRef(zMulai) + '))))';
      if (plantFormula(shPerizinan, ['rentangtanggal'], 'Rentang_Tanggal', rentangExpr)) plantedCount++;
    }
    if (zIdDudi && shDudi && dId && dNama) {
      const keyGuard = zId || zNis;
      const pltDudiIdByNis = (zNis && shPlotting && pNis && pIdDudi)
        ? vlookupTextExpr('TRIM(TO_TEXT(' + sameRef(zNis) + '))', 'TRIM(TO_TEXT(' + ref(shPlotting, pNis) + '))', 'TRIM(TO_TEXT(' + ref(shPlotting, pIdDudi) + '))')
        : '""';
      const zEffDudiId = (zNis && shPlotting && pNis && pIdDudi)
        ? 'IF(TRIM(TO_TEXT(' + sameRef(zIdDudi) + '))<>""' + S + 'TRIM(TO_TEXT(' + sameRef(zIdDudi) + '))' + S + pltDudiIdByNis + ')'
        : 'TRIM(TO_TEXT(' + sameRef(zIdDudi) + '))';
      const zDudiExpr = 'IF(TRIM(TO_TEXT(' + sameRef(keyGuard) + '))=""' + S + '""' + S +
        vlookupTextExpr(zEffDudiId, 'TRIM(TO_TEXT(' + ref(shDudi, dId) + '))', ref(shDudi, dNama)) + ')';
      if (plantFormula(shPerizinan, ['duditujuan'], 'DUDI_Tujuan', zDudiExpr)) plantedCount++;
    }
  }

  // Kolom Monitoring_5_Tahap (dibutuhkan baik oleh G. data_plotting maupun H. Monitoring_5_Tahap)
  const mId = getColLetter(shMonitoring, ['idmonitoring', 'id']);
  const mIdPlt = getColLetter(shMonitoring, ['idpenempatan']);
  const mNis = getColLetter(shMonitoring, ['nis']);
  const mIdDudi = getColLetter(shMonitoring, ['iddudi']);
  const mIdGuru = getColLetter(shMonitoring, ['idgurupendamping', 'idguru']);
  const mK3 = getColLetter(shMonitoring, ['nilaik3lh']);
  const mSs = getColLetter(shMonitoring, ['nilaisoftskills', 'nilaisoftskill']);
  const mHs = getColLetter(shMonitoring, ['nilaihardskills', 'nilaikompetensiteknis']);
  const mAb = getColLetter(shMonitoring, ['nilaialurbisnisduniakerja', 'nilaialurbisnis']);

  // --- G. data_plotting: Penempatan + Rekap Nilai DUDI & Predikat ---
  if (shPlotting) {
    const pGuard = pId || pNis;
    const pK3 = getColLetter(shPlotting, ['nilaik3lh']);
    const pSs = getColLetter(shPlotting, ['nilaisoftskills', 'nilaisoftskill']);
    const pHs = getColLetter(shPlotting, ['nilaihardskills', 'nilaikompetensiteknis']);
    const pAb = getColLetter(shPlotting, ['nilaialurbisnisduniakerja', 'nilaialurbisnis']);
    const pAvg = getColLetter(shPlotting, ['nilairatarata', 'nilaidudi', 'nilaiakhir']);

    if (pNis && shSiswa && sNis && sNama) {
      const pNamaExpr = 'IF(TRIM(TO_TEXT(' + sameRef(pNis) + '))=""' + S + '""' + S +
        vlookupTextExpr('TRIM(TO_TEXT(' + sameRef(pNis) + '))', 'TRIM(TO_TEXT(' + ref(shSiswa, sNis) + '))', ref(shSiswa, sNama)) + ')';
      if (plantFormula(shPlotting, ['namasiswa'], 'Nama_Siswa', pNamaExpr)) plantedCount++;
    }
    if (pIdDudi && shDudi && dId && dNama) {
      const reqDudiNameByNis = (pNis && shPengajuan && qNis && qDudi)
        ? vlookupTextExpr('TRIM(TO_TEXT(' + sameRef(pNis) + '))', 'TRIM(TO_TEXT(' + ref(shPengajuan, qNis) + '))', ref(shPengajuan, qDudi))
        : '""';
      const pDudiExpr = 'IF(TRIM(TO_TEXT(' + sameRef(pGuard) + '))=""' + S + '""' + S +
        'IF(TRIM(TO_TEXT(' + sameRef(pIdDudi) + '))<>""' + S +
        vlookupTextExpr('TRIM(TO_TEXT(' + sameRef(pIdDudi) + '))', 'TRIM(TO_TEXT(' + ref(shDudi, dId) + '))', ref(shDudi, dNama), reqDudiNameByNis) + S +
        reqDudiNameByNis + '))';
      if (plantFormula(shPlotting, ['namadudi', 'duditujuan'], 'Nama_DUDI', pDudiExpr)) plantedCount++;
    }
    if (pIdGuru && shGuru && gId && gNama) {
      const dudiGuruById = (pIdDudi && shDudi && dId && dGuru)
        ? vlookupTextExpr('TRIM(TO_TEXT(' + sameRef(pIdDudi) + '))', 'TRIM(TO_TEXT(' + ref(shDudi, dId) + '))', ref(shDudi, dGuru))
        : '""';
      const pGuruExpr = 'IF(TRIM(TO_TEXT(' + sameRef(pGuard) + '))=""' + S + '""' + S +
        'IF(TRIM(TO_TEXT(' + sameRef(pIdGuru) + '))<>""' + S +
        vlookupTextExpr('TRIM(TO_TEXT(' + sameRef(pIdGuru) + '))', 'TRIM(TO_TEXT(' + ref(shGuru, gId) + '))', ref(shGuru, gNama), dudiGuruById) + S +
        dudiGuruById + '))';
      if (plantFormula(shPlotting, ['gurupendamping'], 'Guru_Pendamping', pGuruExpr)) plantedCount++;
    }

    if (shMonitoring && mK3 && mSs && mHs && mAb) {
      const mHasGrade = '(N(' + ref(shMonitoring, mK3) + ')+N(' + ref(shMonitoring, mSs) + ')+N(' + ref(shMonitoring, mHs) + ')+N(' + ref(shMonitoring, mAb) + '))>0';
      const mWeight = '((' + mHasGrade + ')*1000000+ROW(' + ref(shMonitoring, mK3) + '))';

      const buildPlotScoreExpr = function(mScoreCol) {
        const valCol = 'IF(' + mHasGrade + S + 'N(' + ref(shMonitoring, mScoreCol) + ')' + S + '"")';
        const byPlt = (pId && mIdPlt)
          ? 'IFERROR(VLOOKUP(TRIM(TO_TEXT(' + sameRef(pId) + '))' + S +
            'SORT(' + hstackExpr(['TRIM(TO_TEXT(' + ref(shMonitoring, mIdPlt) + '))', mWeight, valCol]) + S + '2' + S + 'FALSE)' + S + '3' + S + 'FALSE)' + S + '"")'
          : '""';
        const byNis = (pNis && mNis)
          ? 'IFERROR(VLOOKUP(TRIM(TO_TEXT(' + sameRef(pNis) + '))' + S +
            'SORT(' + hstackExpr(['TRIM(TO_TEXT(' + ref(shMonitoring, mNis) + '))', mWeight, valCol]) + S + '2' + S + 'FALSE)' + S + '3' + S + 'FALSE)' + S + '"")'
          : '""';
        return 'IF(TRIM(TO_TEXT(' + sameRef(pGuard) + '))=""' + S + '""' + S + 'IF(' + byPlt + '<>""' + S + byPlt + S + byNis + '))';
      };

      if (pK3 && plantFormula(shPlotting, ['nilaik3lh'], 'Nilai_K3LH', buildPlotScoreExpr(mK3))) plantedCount++;
      if (pSs && plantFormula(shPlotting, ['nilaisoftskills', 'nilaisoftskill'], 'Nilai_Softskills', buildPlotScoreExpr(mSs))) plantedCount++;
      if (pHs && plantFormula(shPlotting, ['nilaihardskills', 'nilaikompetensiteknis'], 'Nilai_Hardskills', buildPlotScoreExpr(mHs))) plantedCount++;
      if (pAb && plantFormula(shPlotting, ['nilaialurbisnisduniakerja', 'nilaialurbisnis'], 'Nilai_Alur_Bisnis_Dunia_Kerja', buildPlotScoreExpr(mAb))) plantedCount++;
    }

    if (pK3 && pSs && pHs && pAb) {
      const pSum = '(N(' + sameRef(pK3) + ')+N(' + sameRef(pSs) + ')+N(' + sameRef(pHs) + ')+N(' + sameRef(pAb) + '))';
      const pAvgExpr = 'IF(TRIM(TO_TEXT(' + sameRef(pGuard) + '))=""' + S + '""' + S +
        'IF(' + pSum + '>0' + S + 'ROUND(' + pSum + '/4' + S + '1)' + S + '""))';
      if (plantFormula(shPlotting, ['nilairatarata', 'nilaidudi', 'nilaiakhir'], 'Nilai_rata_rata', pAvgExpr)) plantedCount++;
    }
    if (pAvg) {
      const pPredExpr = 'IF(TRIM(TO_TEXT(' + sameRef(pGuard) + '))=""' + S + '""' + S +
        'IF(N(' + sameRef(pAvg) + ')=0' + S + '""' + S +
        'IF(N(' + sameRef(pAvg) + ')>=88' + S + '"Sangat Baik (A)"' + S +
        'IF(N(' + sameRef(pAvg) + ')>=78' + S + '"Baik (B)"' + S +
        'IF(N(' + sameRef(pAvg) + ')>=68' + S + '"Cukup (C)"' + S + '"Kurang (D)")))))';
      if (plantFormula(shPlotting, ['predikat'], 'Predikat', pPredExpr)) plantedCount++;
    }
  }

  // --- H. Monitoring_5_Tahap (Lean Opsi A + Single SSOT Nilai PKL) ---
  if (shMonitoring) {
    const mGuard = mId || mIdPlt || mNis;
    const mEffNis = (mNis && mIdPlt && shPlotting && pId && pNis)
      ? 'IF(TRIM(TO_TEXT(' + sameRef(mNis) + '))<>""' + S + 'TRIM(TO_TEXT(' + sameRef(mNis) + '))' + S +
        vlookupTextExpr('TRIM(TO_TEXT(' + sameRef(mIdPlt) + '))', 'TRIM(TO_TEXT(' + ref(shPlotting, pId) + '))', 'TRIM(TO_TEXT(' + ref(shPlotting, pNis) + '))') + ')'
      : (mNis ? 'TRIM(TO_TEXT(' + sameRef(mNis) + '))' : '""');

    if (mNis && shSiswa && sNis && sNama) {
      const mNamaExpr = 'IF(TRIM(TO_TEXT(' + sameRef(mGuard) + '))=""' + S + '""' + S +
        vlookupTextExpr(mEffNis, 'TRIM(TO_TEXT(' + ref(shSiswa, sNis) + '))', ref(shSiswa, sNama)) + ')';
      if (plantFormula(shMonitoring, ['namasiswa'], 'Nama_Siswa', mNamaExpr)) plantedCount++;
    }
    if (mIdDudi && shDudi && dId && dNama) {
      const dudiByNisPlt = (mNis && shPlotting && pNis && pIdDudi)
        ? vlookupTextExpr(mEffNis, 'TRIM(TO_TEXT(' + ref(shPlotting, pNis) + '))', 'TRIM(TO_TEXT(' + ref(shPlotting, pIdDudi) + '))')
        : '""';
      const dudiByPltId = (mIdPlt && shPlotting && pId && pIdDudi)
        ? vlookupTextExpr('TRIM(TO_TEXT(' + sameRef(mIdPlt) + '))', 'TRIM(TO_TEXT(' + ref(shPlotting, pId) + '))', 'TRIM(TO_TEXT(' + ref(shPlotting, pIdDudi) + '))', dudiByNisPlt)
        : dudiByNisPlt;
      const mEffDudiId = (mIdPlt && shPlotting && pId && pIdDudi) || (mNis && shPlotting && pNis && pIdDudi)
        ? 'IF(TRIM(TO_TEXT(' + sameRef(mIdDudi) + '))<>""' + S + 'TRIM(TO_TEXT(' + sameRef(mIdDudi) + '))' + S + dudiByPltId + ')'
        : 'TRIM(TO_TEXT(' + sameRef(mIdDudi) + '))';
      const mReqDudiName = (mNis && shPengajuan && qNis && qDudi)
        ? vlookupTextExpr(mEffNis, 'TRIM(TO_TEXT(' + ref(shPengajuan, qNis) + '))', ref(shPengajuan, qDudi))
        : '""';
      const mDudiExpr = 'IF(TRIM(TO_TEXT(' + sameRef(mGuard) + '))=""' + S + '""' + S +
        vlookupTextExpr(mEffDudiId, 'TRIM(TO_TEXT(' + ref(shDudi, dId) + '))', ref(shDudi, dNama), mReqDudiName) + ')';
      if (plantFormula(shMonitoring, ['duditujuan'], 'DUDI_Tujuan', mDudiExpr)) plantedCount++;
    }
    if (mIdGuru && shGuru && gId && gNama) {
      const guruByNisPlt = (mNis && shPlotting && pNis && pIdGuru)
        ? vlookupTextExpr(mEffNis, 'TRIM(TO_TEXT(' + ref(shPlotting, pNis) + '))', 'TRIM(TO_TEXT(' + ref(shPlotting, pIdGuru) + '))')
        : '""';
      const mEffGuruId = (mIdPlt && shPlotting && pId && pIdGuru)
        ? 'IF(TRIM(TO_TEXT(' + sameRef(mIdGuru) + '))<>""' + S + 'TRIM(TO_TEXT(' + sameRef(mIdGuru) + '))' + S +
          vlookupTextExpr('TRIM(TO_TEXT(' + sameRef(mIdPlt) + '))', 'TRIM(TO_TEXT(' + ref(shPlotting, pId) + '))', 'TRIM(TO_TEXT(' + ref(shPlotting, pIdGuru) + '))', guruByNisPlt) + ')'
        : 'TRIM(TO_TEXT(' + sameRef(mIdGuru) + '))';
      const mGuruExpr = 'IF(TRIM(TO_TEXT(' + sameRef(mGuard) + '))=""' + S + '""' + S +
        vlookupTextExpr(mEffGuruId, 'TRIM(TO_TEXT(' + ref(shGuru, gId) + '))', ref(shGuru, gNama)) + ')';
      if (plantFormula(shMonitoring, ['gurupendamping'], 'Guru_Pendamping', mGuruExpr)) plantedCount++;
    }
    if (mK3 && mSs && mHs && mAb) {
      const mSum = '(N(' + sameRef(mK3) + ')+N(' + sameRef(mSs) + ')+N(' + sameRef(mHs) + ')+N(' + sameRef(mAb) + '))';
      const mAvgExpr = 'IF(TRIM(TO_TEXT(' + sameRef(mGuard) + '))=""' + S + '""' + S +
        'IF(' + mSum + '>0' + S + 'ROUND(' + mSum + '/4' + S + '1)' + S + '""))';
      if (plantFormula(shMonitoring, ['nilairatarata', 'nilaidudi', 'nilaiakhir'], 'Nilai_rata_rata', mAvgExpr)) plantedCount++;
    }
  }

  SpreadsheetApp.flush();
  bumpGasSheetCacheVersion(targetSs.getId());
  return {
    locale: ssLocale,
    separator: isEnLocale ? ',' : ';',
    backfilledRows: backfilledRows,
    plantedFormulas: plantedCount,
    migratedLegacyGrades: migratedGradesCount,
    cleanedDuplicateCols: cleanedDuplicateCols,
    cleanedPrunedCols: cleanedPrunedCols
  };
}
`;
}
