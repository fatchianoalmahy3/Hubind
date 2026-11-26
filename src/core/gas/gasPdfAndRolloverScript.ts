export function buildGasPdfAndRolloverCode(): string {
  return `/**
 * ============================================================================
 * FILE 04: GENERATOR SPREADSHEET TAHUNAN & CETAK PDF SURAT / MONITORING
 * Bagian dari Google Apps Script SI-HUBIN SMK PGRI 2 Ponorogo (4 File Modular)
 * ============================================================================
 */

function handleCreateYearlySpreadsheet(body) {
  const year = String(body.year || '2026/2027').trim();
  const cleanYear = year.replace(/\\//g, '_');
  const customTitle = String(body.spreadsheetTitle || '').trim();
  const targetSsId = String(body.targetSpreadsheetId || '').trim();
  const driveUrl = String(body.driveFolderUrl || '').trim();
  const seedSheets = (body.seedSheets && typeof body.seedSheets === 'object') ? body.seedSheets : {};

  let yearFolder = null;
  const folderMatch = driveUrl.match(/\\/folders\\/([a-zA-Z0-9_-]+)/);
  if (folderMatch && folderMatch[1]) {
    try {
      yearFolder = DriveApp.getFolderById(folderMatch[1]);
    } catch (errFolder) {
      yearFolder = null;
    }
  }
  if (!yearFolder) {
    const rootName = 'Arsip Hubin SMK PGRI 2 Ponorogo';
    const rootIt = DriveApp.getFoldersByName(rootName);
    const hubinFolder = rootIt.hasNext() ? rootIt.next() : DriveApp.createFolder(rootName);
    const yearFolderName = 'Prakerin TA ' + year;
    const yearIt = hubinFolder.getFoldersByName(yearFolderName);
    yearFolder = yearIt.hasNext() ? yearIt.next() : hubinFolder.createFolder(yearFolderName);
  }

  const ssTitle = customTitle || ('Hubin_SMK_PGRI_2_Ponorogo_' + cleanYear);
  const newSs = targetSsId ? SpreadsheetApp.openById(targetSsId) : SpreadsheetApp.create(ssTitle);
  if (!targetSsId) {
    try {
      const ssFile = DriveApp.getFileById(newSs.getId());
      yearFolder.addFile(ssFile);
      DriveApp.getRootFolder().removeFile(ssFile);
    } catch (moveErr) {}
  }

  const reqNames = Object.keys(REQUIRED_SHEET_HEADERS);
  reqNames.forEach(function(name, idx) {
    const hdrs = REQUIRED_SHEET_HEADERS[name] || [];
    let sh = newSs.getSheetByName(name);
    if (!sh) {
      sh = (idx === 0 && !targetSsId && newSs.getSheets().length === 1)
        ? newSs.getSheets()[0]
        : newSs.insertSheet(name);
      sh.setName(name);
    }
    if (sh.getLastRow() === 0 && hdrs.length > 0) {
      sh.appendRow(hdrs);
      sh.getRange(1, 1, 1, hdrs.length)
        .setFontWeight('bold')
        .setBackground('#0F172A')
        .setFontColor('#FFFFFF');
      sh.setFrozenRows(1);
    } else if (hdrs.length > 0) {
      ensureMissingHeaders(sh, name);
    }
  });

  const seededCounts = {};
  Object.keys(seedSheets).forEach(function(sName) {
    const rows = Array.isArray(seedSheets[sName]) ? seedSheets[sName] : [];
    if (rows.length === 0) return;
    const sh = resolveSheetAlias(newSs, sName);
    if (!sh) return;
    const hdrs = ensureMissingHeaders(sh, sName);
    const fCols = detectFormulaColFlags(sh, hdrs.length);
    const startRow = getNextAppendRowNonFormula(sh, fCols);
    const matrix = rows.map(function(item) {
      return hdrs.map(function(h) {
        const val = getNormalizedValue(item, h);
        return val !== undefined ? val : '';
      });
    });
    formatNisAndTextColumns(sh, hdrs, startRow, matrix.length);
    writeNonFormulaMatrixSpans(sh, startRow, matrix, fCols);
    seededCounts[sName] = matrix.length;
  });

  const formulaRes = applyRelationalFormulasToSpreadsheet(newSs);
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    spreadsheetId: newSs.getId(),
    spreadsheetName: newSs.getName(),
    spreadsheetUrl: newSs.getUrl(),
    driveFolderUrl: yearFolder ? yearFolder.getUrl() : driveUrl,
    seededCounts: seededCounts,
    plantedFormulas: formulaRes.plantedFormulas,
  })).setMimeType(ContentService.MimeType.JSON);
}

function handleGenerateSuratIzinPdf(body) {
  const p = body.data || {};
  let targetRoot = null;
  const driveUrl = String(body.driveFolderUrl || '').trim();
  const folderMatch = driveUrl.match(/\\/folders\\/([a-zA-Z0-9_-]+)/);
  if (folderMatch && folderMatch[1]) {
    try {
      targetRoot = DriveApp.getFolderById(folderMatch[1]);
    } catch (folderErr) {
      targetRoot = null;
    }
  }
  if (!targetRoot) {
    const rootName = 'Arsip Hubin SMK PGRI 2 Ponorogo';
    const rootIt = DriveApp.getFoldersByName(rootName);
    targetRoot = rootIt.hasNext() ? rootIt.next() : DriveApp.createFolder(rootName);
  }

  const subName = 'Surat_Perizinan_PKL_PDF';
  const subIt = targetRoot.getFoldersByName(subName);
  const pdfFolder = subIt.hasNext() ? subIt.next() : targetRoot.createFolder(subName);

  const safeNama = String(p.namaSiswa || 'Siswa').replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'Siswa';
  const safeDudi = String(p.dudiTujuan || 'DUDI').replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'DUDI';
  const baseTitle = 'Surat_Permohonan_PKL_' + safeNama + '_' + safeDudi + '_' + Date.now();

  const doc = DocumentApp.create(baseTitle);
  const docBody = doc.getBody();
  docBody.setMarginTop(48);
  docBody.setMarginBottom(48);
  docBody.setMarginLeft(60);
  docBody.setMarginRight(60);

  const p1 = docBody.appendParagraph('YAYASAN PEMBINA LEMBAGA PENDIDIKAN DASAR DAN MENENGAH PGRI');
  p1.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  p1.editAsText().setFontSize(9).setBold(true);

  const p2 = docBody.appendParagraph('SMK PGRI 2 PONOROGO');
  p2.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  p2.editAsText().setFontSize(14).setBold(true);

  const p3 = docBody.appendParagraph('Status: Terakreditasi "A" (Unggul) • NSS: 322051301002 • NPSN: 20510123\\nJl. Soekarno - Hatta No. 94 Ponorogo, Jawa Timur • Telp: (0352) 481456');
  p3.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  p3.editAsText().setFontSize(9).setBold(false);

  docBody.appendHorizontalRule();
  docBody.appendParagraph('');

  const noSurat = String(p.noSuratPermohonan || '421.5 / ___ / Hubin / SMK.PGRI2 / ' + new Date().getFullYear());
  const tglSurat = String(p.tanggalSurat || '');
  const metaPara = docBody.appendParagraph(
    'Nomor   : ' + noSurat + '\\n' +
    'Lamp.   : 1 (satu) Berkas\\n' +
    'Perihal : Permohonan Penempatan Praktik Kerja Industri (Prakerin)\\n' +
    'Tanggal : ' + tglSurat
  );
  metaPara.editAsText().setFontSize(10);

  docBody.appendParagraph('');
  const toPara = docBody.appendParagraph(
    'Kepada Yth.\\nPimpinan / HRD ' + String(p.dudiTujuan || 'Mitra DUDI') + '\\n' + String(p.alamatDudi || 'Di Tempat')
  );
  toPara.editAsText().setFontSize(10);

  docBody.appendParagraph('');
  const openPara = docBody.appendParagraph(
    'Dengan hormat,\\nDalam rangka memenuhi tuntutan kurikulum Sekolah Menengah Kejuruan serta meningkatkan keselarasan kompetensi peserta didik dengan kebutuhan Dunia Usaha dan Dunia Industri (DUDI), kami memohon kesediaan Bapak/Ibu untuk berkenan menerima peserta didik SMK PGRI 2 Ponorogo melaksanakan Praktik Kerja Industri (Prakerin) di perusahaan/instansi yang Bapak/Ibu pimpin:'
  );
  openPara.setAlignment(DocumentApp.HorizontalAlignment.JUSTIFY);
  openPara.editAsText().setFontSize(10);

  docBody.appendParagraph('');
  const tbl = docBody.appendTable([
    ['No', 'Nama Siswa', 'NIS', 'Kelas / Jurusan'],
    ['1', String(p.namaSiswa || '-'), String(p.nis || '-'), String(p.kelas || '-') + ' / ' + String(p.jurusan || '-')]
  ]);
  tbl.getRow(0).editAsText().setBold(true).setFontSize(10);
  tbl.getRow(1).editAsText().setFontSize(10);

  docBody.appendParagraph('');
  const closePara = docBody.appendParagraph(
    'Demikian surat permohonan ini kami sampaikan. Atas perhatian, kerjasama, dan bimbingan yang Bapak/Ibu berikan, kami ucapkan terima kasih.'
  );
  closePara.setAlignment(DocumentApp.HorizontalAlignment.JUSTIFY);
  closePara.editAsText().setFontSize(10);

  docBody.appendParagraph('');
  const signPara = docBody.appendParagraph(
    'Ponorogo, ' + tglSurat + '\\n' +
    String(p.kepalaSekolah || 'Kepala SMK PGRI 2 Ponorogo') + ',\\n\\n\\n\\n' +
    '................................................\\nNIP. ..................................'
  );
  signPara.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
  signPara.editAsText().setFontSize(10);

  doc.saveAndClose();

  const tempDocFile = DriveApp.getFileById(doc.getId());
  const pdfBlob = tempDocFile.getAs(MimeType.PDF).setName(baseTitle + '.pdf');
  const pdfFile = pdfFolder.createFile(pdfBlob);
  pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  tempDocFile.setTrashed(true);

  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    pdfUrl: pdfFile.getUrl(),
    fileId: pdfFile.getId(),
    fileName: pdfFile.getName()
  })).setMimeType(ContentService.MimeType.JSON);
}

function handleGenerateMonitoringBundlePdf(body) {
  const p = body.data || {};
  const tplIds = p.templateIds || {};
  const includeDocs = p.includeDocs || {};
  const meta = p.meta || {};
  const bundles = Array.isArray(p.bundles) ? p.bundles : [];

  const extractDocIdGas = function(val) {
    const s = String(val || '').trim();
    if (!s) return '';
    const m = s.match(/\\/d\\/([a-zA-Z0-9_-]+)/);
    return (m && m[1]) ? m[1] : s;
  };

  const stTemplateId = extractDocIdGas(tplIds.suratTugas);
  const monTemplateId = extractDocIdGas(tplIds.monitoring);
  const nilaiTemplateId = extractDocIdGas(tplIds.nilai);

  if (includeDocs.suratTugas && !stTemplateId) {
    throw new Error('Template Google Docs untuk Surat Tugas (doc_surat_tugas) belum dipasang di Pengelola Template Dokumen.');
  }
  if (includeDocs.monitoring && !monTemplateId) {
    throw new Error('Template Google Docs untuk Lembar Monitoring (doc_monitoring) belum dipasang di Pengelola Template Dokumen.');
  }
  if (includeDocs.nilai && !nilaiTemplateId) {
    throw new Error('Template Google Docs untuk Lembar Penilaian PKL (doc_nilai) belum dipasang di Pengelola Template Dokumen.');
  }
  if (bundles.length === 0) {
    throw new Error('Tidak ada DUDI terpilih untuk dicetak dalam paket.');
  }

  let targetRoot = null;
  const driveUrl = String(body.driveFolderUrl || '').trim();
  const folderMatch = driveUrl.match(/\\/folders\\/([a-zA-Z0-9_-]+)/);
  if (folderMatch && folderMatch[1]) {
    try {
      targetRoot = DriveApp.getFolderById(folderMatch[1]);
    } catch (folderErr) {
      targetRoot = null;
    }
  }
  if (!targetRoot) {
    const rootName = 'Arsip Hubin SMK PGRI 2 Ponorogo';
    const rootIt = DriveApp.getFoldersByName(rootName);
    targetRoot = rootIt.hasNext() ? rootIt.next() : DriveApp.createFolder(rootName);
  }

  const subName = 'Paket_Cetak_Monitoring_PDF';
  const subIt = targetRoot.getFoldersByName(subName);
  const pdfFolder = subIt.hasNext() ? subIt.next() : targetRoot.createFolder(subName);

  const replaceDocPlaceholdersGas = function(targetBody, mapObj) {
    const keys = Object.keys(mapObj || {});
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const val = String(mapObj[k] === undefined || mapObj[k] === null ? '' : mapObj[k]);
      const pattern = '\\\\{\\\\{\\\\s*' + k + '\\\\s*\\\\}\\\\}';
      targetBody.replaceText(pattern, val);
    }
  };

  const duplicateMonitoringRowsGas = function(targetBody, students) {
    const tables = targetBody.getTables();
    const list = Array.isArray(students) && students.length > 0 ? students : [{ nis: '', namaSiswa: '', kelas: '', jurusan: '' }];
    for (let t = 0; t < tables.length; t++) {
      const tbl = tables[t];
      let tplRowIdx = -1;
      for (let r = 0; r < tbl.getNumRows(); r++) {
        const txt = tbl.getRow(r).getText() || '';
        if (txt.indexOf('NamaSiswa') !== -1 || txt.indexOf('{{No}}') !== -1 || txt.indexOf('{{ No }}') !== -1) {
          tplRowIdx = r;
          break;
        }
      }
      if (tplRowIdx === -1) continue;

      const baseRow = tbl.getRow(tplRowIdx);
      for (let s = 1; s < list.length; s++) {
        const clonedRow = baseRow.copy();
        tbl.insertTableRow(tplRowIdx + s, clonedRow);
      }
      for (let s2 = 0; s2 < list.length; s2++) {
        const stu = list[s2] || {};
        const rowEl = tbl.getRow(tplRowIdx + s2);
        const rowMap = {
          No: String(s2 + 1),
          NamaSiswa: String(stu.namaSiswa || '-'),
          NIS: String(stu.nis || '-'),
          Kelas: String(stu.kelas || '-'),
          Jurusan: String(stu.jurusan || '-')
        };
        const rKeys = Object.keys(rowMap);
        for (let kIdx = 0; kIdx < rKeys.length; kIdx++) {
          const rk = rKeys[kIdx];
          rowEl.replaceText('\\\\{\\\\{\\\\s*' + rk + '\\\\s*\\\\}\\\\}', rowMap[rk]);
        }
      }
      break;
    }
  };

  const appendTempDocGas = function(srcDocId, masterBody, isFirst, copiedPageSetup) {
    const srcDoc = DocumentApp.openById(srcDocId);
    const srcBody = srcDoc.getBody();
    if (isFirst && !copiedPageSetup.done) {
      masterBody.setPageWidth(srcBody.getPageWidth());
      masterBody.setPageHeight(srcBody.getPageHeight());
      masterBody.setMarginTop(srcBody.getMarginTop());
      masterBody.setMarginBottom(srcBody.getMarginBottom());
      masterBody.setMarginLeft(srcBody.getMarginLeft());
      masterBody.setMarginRight(srcBody.getMarginRight());
      copiedPageSetup.done = true;
    } else {
      masterBody.appendPageBreak();
    }

    const totalChildren = srcBody.getNumChildren();
    for (let c = 0; c < totalChildren; c++) {
      const child = srcBody.getChild(c);
      const cType = child.getType();
      if (cType === DocumentApp.ElementType.PARAGRAPH) {
        masterBody.appendParagraph(child.asParagraph().copy());
      } else if (cType === DocumentApp.ElementType.TABLE) {
        masterBody.appendTable(child.asTable().copy());
      } else if (cType === DocumentApp.ElementType.LIST_ITEM) {
        masterBody.appendListItem(child.asListItem().copy());
      } else if (cType === DocumentApp.ElementType.HORIZONTAL_RULE) {
        masterBody.appendHorizontalRule();
      }
    }
    srcDoc.saveAndClose();
  };

  const stageNum = Number(meta.tahapNum || 1);
  const cekPenempatan = '☐';
  const cekPenyerahan = stageNum === 1 ? '■' : '☐';
  const cekMonitoring = (stageNum >= 2 && stageNum <= 7) ? '■' : '☐';
  const cekRaport = stageNum >= 8 ? '■' : '☐';

  const bundleTitle = 'Paket_Monitoring_Tahap_' + stageNum + '_' + Date.now();
  const masterDoc = DocumentApp.create(bundleTitle);
  const masterBody = masterDoc.getBody();
  const copiedPageSetup = { done: false };
  let isFirstPage = true;
  let totalSheets = 0;
  const tempFileIds = [];

  try {
    for (let b = 0; b < bundles.length; b++) {
      const bdl = bundles[b] || {};
      const students = Array.isArray(bdl.students) ? bdl.students : [];
      const commonMap = {
        NomorSurat: String(meta.nomorSurat || ''),
        TanggalSurat: String(meta.tanggalSurat || ''),
        TanggalTugas: String(meta.tanggalSurat || ''),
        TahunAjaran: String(meta.tahunAjaran || ''),
        Tahap: String(stageNum),
        TahapLabel: String(meta.tahapLabel || ''),
        KepalaSekolah: String(meta.kepalaSekolah || '.........................................'),
        NamaGuru: String(bdl.namaGuru || '-'),
        NipGuru: String(bdl.nipGuru || '-'),
        JabatanGuru: String(bdl.jabatanGuru || 'Guru SMK PGRI 2 Ponorogo'),
        AlamatGuru: 'Jl. Soekarno – Hatta Telp. 0352-461821 Ponorogo',
        CekPenempatan: cekPenempatan,
        CekPenyerahan: cekPenyerahan,
        CekMonitoring: cekMonitoring,
        CekRaport: cekRaport,
        NamaDudi: String(bdl.namaDudi || '-'),
        AlamatDudi: String(bdl.alamatDudi || '-'),
        NamaBengkel: String(bdl.namaDudi || '-'),
        Alamat: String(bdl.alamatDudi || '-'),
        Pemimpin: String(bdl.pemimpinDudi || '................................'),
        NoTelp: String(bdl.noTelpDudi || '................................')
      };

      if (includeDocs.suratTugas && stTemplateId) {
        const copySt = DriveApp.getFileById(stTemplateId).makeCopy('TMP_ST_' + b + '_' + Date.now(), pdfFolder);
        const copyStId = copySt.getId();
        tempFileIds.push(copyStId);
        const docSt = DocumentApp.openById(copyStId);
        replaceDocPlaceholdersGas(docSt.getBody(), commonMap);
        docSt.saveAndClose();
        appendTempDocGas(copyStId, masterBody, isFirstPage, copiedPageSetup);
        isFirstPage = false;
        totalSheets++;
      }

      if (includeDocs.monitoring && monTemplateId) {
        const copyMon = DriveApp.getFileById(monTemplateId).makeCopy('TMP_MON_' + b + '_' + Date.now(), pdfFolder);
        const copyMonId = copyMon.getId();
        tempFileIds.push(copyMonId);
        const docMon = DocumentApp.openById(copyMonId);
        const monBody = docMon.getBody();
        duplicateMonitoringRowsGas(monBody, students);
        replaceDocPlaceholdersGas(monBody, commonMap);
        docMon.saveAndClose();
        appendTempDocGas(copyMonId, masterBody, isFirstPage, copiedPageSetup);
        isFirstPage = false;
        totalSheets++;
      }

      if (includeDocs.nilai && nilaiTemplateId) {
        for (let s = 0; s < students.length; s++) {
          const stu = students[s] || {};
          const copyNil = DriveApp.getFileById(nilaiTemplateId).makeCopy('TMP_NIL_' + b + '_' + s + '_' + Date.now(), pdfFolder);
          const copyNilId = copyNil.getId();
          tempFileIds.push(copyNilId);
          const docNil = DocumentApp.openById(copyNilId);
          const nilMap = Object.assign({}, commonMap, {
            NamaSiswa: String(stu.namaSiswa || ''),
            NIS: String(stu.nis || ''),
            Kelas: String(stu.kelas || ''),
            Jurusan: String(stu.jurusan || '')
          });
          replaceDocPlaceholdersGas(docNil.getBody(), nilMap);
          docNil.saveAndClose();
          appendTempDocGas(copyNilId, masterBody, isFirstPage, copiedPageSetup);
          isFirstPage = false;
          totalSheets++;
        }
      }
    }

    if (masterBody.getNumChildren() > 1) {
      const firstChild = masterBody.getChild(0);
      if (firstChild.getType() === DocumentApp.ElementType.PARAGRAPH && firstChild.asParagraph().getText().trim() === '') {
        masterBody.removeChild(firstChild);
      }
    }
    masterDoc.saveAndClose();

    const masterFile = DriveApp.getFileById(masterDoc.getId());
    const pdfBlob = masterFile.getAs(MimeType.PDF).setName(bundleTitle + '.pdf');
    const pdfFile = pdfFolder.createFile(pdfBlob);
    pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    masterFile.setTrashed(true);

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      pdfUrl: pdfFile.getUrl(),
      fileId: pdfFile.getId(),
      fileName: pdfFile.getName(),
      totalSheets: totalSheets
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    for (let tf = 0; tf < tempFileIds.length; tf++) {
      try {
        DriveApp.getFileById(tempFileIds[tf]).setTrashed(true);
      } catch (cleanupErr) {}
    }
  }
}
`;
}
