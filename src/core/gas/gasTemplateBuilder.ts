import { HUBIN_SHEETS_BLUEPRINT } from '../types/sheetBlueprint';
import { buildGasConfigHelpersCode } from './gasConfigHelpersScript';
import { buildGasWebAppRouterCode } from './gasWebAppRouterScript';
import { buildGasRelationalMigrationCode } from './gasRelationalMigrationScript';
import { buildGasPdfAndRolloverCode } from './gasPdfAndRolloverScript';

export interface GasScriptModule {
  id: 'config' | 'router' | 'migration' | 'pdf';
  filename: string;
  shortLabel: string;
  title: string;
  description: string;
  mainFunction: string;
  code: string;
}

export function buildGasApiModules(): GasScriptModule[] {
  return [
    {
      id: 'config',
      filename: '01_ConfigAndHelpers.gs',
      shortLabel: '01. Config & Helper',
      title: 'Konfigurasi Header SSOT, Alias & Penulisan Non-Formula',
      description: 'Menyimpan daftar kolom baku, normalisasi NIS, cache GAS, dan helper tulis aman tanpa menimpa sel ARRAYFORMULA.',
      mainFunction: 'syncAllSpreadsheetHeaders()',
      code: buildGasConfigHelpersCode(),
    },
    {
      id: 'router',
      filename: '02_WebAppRouter.gs',
      shortLabel: '02. Web App Router',
      title: 'Endpoint Router API (doGet & doPost)',
      description: 'Menangani PING, BATCH_GET, serta mutasi CRUD/Import/Bulk dengan LockService agar sinkron dengan Web App.',
      mainFunction: 'doGet(e) & doPost(e)',
      code: buildGasWebAppRouterCode(),
    },
    {
      id: 'migration',
      filename: '03_RelationalMigration.gs',
      shortLabel: '03. Migrasi & Formula',
      title: 'Backfill Foreign Key & ARRAYFORMULA Baris-1 (Locale ; + HSTACK)',
      description: 'Backfill ID_DUDI, ID_Guru_Pendamping, ID_Penempatan lintas sheet via NIS serta menanam ARRAYFORMULA Baris-1 sesuai locale (; atau ,).',
      mainFunction: 'setupRelationalFormulasAndMigrate()',
      code: buildGasRelationalMigrationCode(),
    },
    {
      id: 'pdf',
      filename: '04_PdfAndYearlyRollover.gs',
      shortLabel: '04. PDF & Tahun Ajaran',
      title: 'Generator Spreadsheet Tahunan & Ekspor Paket PDF',
      description: 'Membuat database Spreadsheet tahun ajaran baru beserta cetak Surat Perizinan & Bundel Monitoring PDF.',
      mainFunction: 'handleCreateYearlySpreadsheet() & PDF',
      code: buildGasPdfAndRolloverCode(),
    },
  ];
}

export function buildGasApiScript(): string {
  return buildGasApiModules()
    .map((m) => m.code)
    .join('\n\n');
}

export function buildGasBootstrapScript(): string {
  const sheetsConfigLiteral = JSON.stringify(
    HUBIN_SHEETS_BLUEPRINT.map((sheet) => ({
      name: sheet.sheetName,
      headers: sheet.headers,
    })),
    null,
    2
  ).replace(/\n/g, '\n  ');

  return `/**
 * ============================================================================
 * GOOGLE APPS SCRIPT (GAS) - 1-CLICK BOOTSTRAP GENERATOR HUBIN SMK PGRI 2 PONOROGO
 * Fungsi: Membuat Folder Drive, File Spreadsheet Relasional (ARRAYFORMULA),
 *         Google Form, & 5 Template Dokumen Resmi Secara Otomatis
 * ============================================================================
 */

function setupGoogleWorkspaceEnvironment(academicYear) {
  const year = academicYear || '2026/2027';
  const cleanYear = year.replace('/', '_');
  Logger.log('=== MEMULAI GENERATOR OTOMATIS HUBIN SMK PGRI 2 PONOROGO (TA ' + year + ') ===');

  const rootFolderName = 'Arsip Hubin SMK PGRI 2 Ponorogo';
  const rootFolders = DriveApp.getFoldersByName(rootFolderName);
  let hubinFolder = rootFolders.hasNext() ? rootFolders.next() : DriveApp.createFolder(rootFolderName);

  const yearFolderName = 'Prakerin TA ' + year;
  const yearFolders = hubinFolder.getFoldersByName(yearFolderName);
  let yearFolder = yearFolders.hasNext() ? yearFolders.next() : hubinFolder.createFolder(yearFolderName);

  const ssTitle = 'Hubin_SMK_PGRI_2_Ponorogo_' + cleanYear;
  const ss = SpreadsheetApp.create(ssTitle);
  const ssFile = DriveApp.getFileById(ss.getId());
  yearFolder.addFile(ssFile);
  DriveApp.getRootFolder().removeFile(ssFile);

  const sheetsConfig = ${sheetsConfigLiteral};

  sheetsConfig.forEach(function(cfg, idx) {
    let sheet = idx === 0 ? ss.getSheets()[0] : ss.insertSheet(cfg.name);
    sheet.setName(cfg.name);
    sheet.appendRow(cfg.headers);
    sheet.getRange(1, 1, 1, cfg.headers.length).setFontWeight('bold').setBackground('#0F172A').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  });

  if (typeof applyRelationalFormulasToSpreadsheet === 'function') {
    applyRelationalFormulasToSpreadsheet(ss);
  }

  const formTitle = 'Pengajuan PKL Siswa SMK PGRI 2 Ponorogo TA ' + year;
  const form = FormApp.create(formTitle);
  const formFile = DriveApp.getFileById(form.getId());
  yearFolder.addFile(formFile);
  DriveApp.getRootFolder().removeFile(formFile);

  form.setTitle(formTitle)
      .setDescription('Formulir Pengajuan PKL SMK PGRI 2 Ponorogo.')
      .setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  const templateDocs = [
    { title: 'Template_Lembar_Permohonan_Rekomendasi_Siswa_' + cleanYear, desc: 'Lembar permohonan ke Kakomli' },
    { title: 'Template_Surat_Permohonan_Penempatan_DUDI_' + cleanYear, desc: 'Surat dinas resmi sekolah ke industri' },
    { title: 'Template_Instrumen_Monitoring_8_Tahap_' + cleanYear, desc: 'Panduan supervisi guru pendamping (Pengantaran, Mon 1-6, Penarikan)' },
    { title: 'Template_Lembar_Penilaian_Industri_DUDI_' + cleanYear, desc: 'Form penilaian kompetensi DUDI' },
    { title: 'Template_Cetak_Blangko_Sertifikat_' + cleanYear, desc: 'Template sertifikat PKL resmi' }
  ];

  const createdDocs = [];
  templateDocs.forEach(function(t) {
    const doc = DocumentApp.create(t.title);
    const body = doc.getBody();
    body.appendParagraph('SMK PGRI 2 PONOROGO - POKJA HUBUNGAN INDUSTRI').setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph(t.desc + ' (Tahun Ajaran ' + year + ')');
    body.appendParagraph('Placeholder Merge: {{NAMA_SISWA}}, {{NIS}}, {{JURUSAN}}, {{DUDI_TUJUAN}}, {{NO_SERI_BLANGKO}}');
    doc.saveAndClose();

    const docFile = DriveApp.getFileById(doc.getId());
    yearFolder.addFile(docFile);
    DriveApp.getRootFolder().removeFile(docFile);
    createdDocs.push({ title: t.title, url: doc.getUrl(), id: doc.getId() });
  });

  Logger.log('SPREADSHEET_ID : ' + ss.getId());
  Logger.log('SPREADSHEET_URL: ' + ss.getUrl());
  Logger.log('FORM_URL       : ' + form.getPublishedUrl());
  Logger.log('DRIVE_FOLDER   : ' + yearFolder.getUrl());
  Logger.log('DOCS           : ' + JSON.stringify(createdDocs));
}
`;
}

export function buildAutoGenerateSheetsFormScript(academicYear: string = '2026/2027'): string {
  const safeYear = String(academicYear || '2026/2027').replace(/"/g, '');
  const totalSheets = HUBIN_SHEETS_BLUEPRINT.length;
  const sheetsConfigLiteral = JSON.stringify(
    HUBIN_SHEETS_BLUEPRINT.map((sheet) => ({
      name: sheet.sheetName,
      headers: sheet.headers,
    })),
    null,
    2
  ).replace(/\n/g, '\n  ');

  return `/**
 * ============================================================================
 * GOOGLE APPS SCRIPT: AUTO-GENERATE ${totalSheets} SHEET & GFORM RESMI (SSOT)
 * HUBIN SMK PGRI 2 PONOROGO (TA ${safeYear})
 * ============================================================================
 */
function autoGenerateAllSheetsAndForm() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const year = "${safeYear}";

  const sheetsData = ${sheetsConfigLiteral};

  sheetsData.forEach(function(item, idx) {
    let sheet = ss.getSheetByName(item.name);
    if (!sheet) {
      sheet = (idx === 0 && ss.getSheets().length === 1 && ss.getSheets()[0].getName().indexOf("Sheet1") !== -1)
        ? ss.getSheets()[0]
        : ss.insertSheet(item.name);
      sheet.setName(item.name);
    }
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(item.headers);
      sheet.getRange(1, 1, 1, item.headers.length)
        .setFontWeight("bold")
        .setBackground("#0F172A")
        .setFontColor("#FFFFFF");
      sheet.setFrozenRows(1);
    }
    const nisColIdx = item.headers.indexOf("NIS");
    if (nisColIdx !== -1) {
      sheet.getRange(2, nisColIdx + 1, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat("@");
    }
  });

  if (typeof applyRelationalFormulasToSpreadsheet === "function") {
    applyRelationalFormulasToSpreadsheet(ss);
  }

  const form = FormApp.create("Formulir Pengajuan PKL Siswa TA " + year);
  form.setDescription("Jawaban masuk ke Sheet Data_Pengajuan_PKL")
      .setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  Logger.log("SUKSES: ${totalSheets} Tabel siap digunakan! Form URL: " + form.getPublishedUrl());
}`;
}
