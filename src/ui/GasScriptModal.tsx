import React, { useState } from 'react';
import { X, Copy, Check, ShieldCheck, Sparkles } from 'lucide-react';

interface GasScriptModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GasScriptModal: React.FC<GasScriptModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'bootstrap' | 'api'>('api');

  if (!isOpen) return null;

  const gasBootstrapCode = `/**
 * ============================================================================
 * GOOGLE APPS SCRIPT (GAS) - 1-CLICK BOOTSTRAP GENERATOR HUBIN SMK PGRI 2 PONOROGO
 * Fungsi: Membuat Folder Drive, File Spreadsheet per Tahun, Form, & 5 Docs Otomatis
 * ============================================================================
 */

function setupGoogleWorkspaceEnvironment(academicYear) {
  const year = academicYear || '2026/2027';
  const cleanYear = year.replace('/', '_');
  Logger.log('=== MEMULAI GENERATOR OTOMATIS HUBIN SMK PGRI 2 PONOROGO (TA ' + year + ') ===');

  // 1. Buat Folder Utama di Google Drive
  const rootFolderName = 'Arsip Hubin SMK PGRI 2 Ponorogo';
  const rootFolders = DriveApp.getFoldersByName(rootFolderName);
  let hubinFolder = rootFolders.hasNext() ? rootFolders.next() : DriveApp.createFolder(rootFolderName);
  
  const yearFolderName = 'Prakerin TA ' + year;
  const yearFolders = hubinFolder.getFoldersByName(yearFolderName);
  let yearFolder = yearFolders.hasNext() ? yearFolders.next() : hubinFolder.createFolder(yearFolderName);

  // 2. Buat File Google Spreadsheet Mandiri untuk Tahun Ajaran Ini
  const ssTitle = 'Hubin_SMK_PGRI_2_Ponorogo_' + cleanYear;
  const ss = SpreadsheetApp.create(ssTitle);
  const ssFile = DriveApp.getFileById(ss.getId());
  yearFolder.addFile(ssFile);
  DriveApp.getRootFolder().removeFile(ssFile);

  // Struktur 11 Sheet Baku Relasional (Header Kosong Siap Isi Data Resmi Sekolah)
  const sheetsConfig = [
    { name: 'Master_Siswa_XI', headers: ['ID', 'NIS', 'NIK', 'Nama_Lengkap', 'Jenis_Kelamin', 'ID_Jurusan', 'Kelas', 'No_HP_Siswa', 'Alamat_Domisili', 'Nama_Ortu_Wali', 'No_Ortu_Wali', 'Status_PKL'] },
    { name: 'Master_Jurusan', headers: ['ID', 'Kode', 'Nama_Jurusan', 'Nama_Kakomli', 'NIP_Kakomli', 'Kontak_WA', 'Kuota_Siswa', 'Total_Terdaftar'] },
    { name: 'Master_Kelas_Walas', headers: ['ID', 'Nama_Kelas', 'Jurusan', 'Tingkat', 'Wali_Kelas', 'Kontak_Walas', 'Jumlah_Siswa'] },
    { name: 'Master_DUDI', headers: ['ID', 'Nama_DUDI', 'Bidang_Keahlian', 'Alamat', 'Wilayah_Kota', 'Nama_Pemimpin', 'Nama_PIC', 'Kontak_PIC', 'No_Telp_DUDI', 'Kuota_Maksimal', 'Terisi', 'Status_Kerjasama'] },
    { name: 'Master_Guru_Pendamping', headers: ['ID', 'NIP', 'Nama_Lengkap', 'Kontak_WA', 'Email_Google', 'Peran_Utama', 'Jumlah_Bimbingan', 'PIN'] },
    { name: 'Data_Pengajuan_PKL', headers: ['No_Pengajuan', 'Timestamp', 'NIS', 'Nama_Siswa', 'Jurusan', 'Kelas', 'DUDI_Tujuan', 'Alamat_DUDI', 'Bidang_Pekerjaan', 'Nama_Pemimpin', 'Nama_PIC', 'No_Telp_DUDI', 'No_WA', 'Alamat_Domisili', 'Nama_Ortu_Wali', 'No_Ortu_Wali', 'Status_Kakomli', 'Catatan_Kakomli', 'Status_Hubin', 'Guru_Pendamping', 'Tgl_Berangkat'] },
    { name: 'Data_Perizinan_PKL', headers: ['ID_Perizinan', 'No_Pengajuan', 'NIS', 'Nama_Siswa', 'Jurusan', 'Kelas', 'Nama_Ortu_Wali', 'No_Ortu_Wali', 'Status_Izin_Ortu', 'No_Surat_Permohonan', 'DUDI_Tujuan', 'Alamat_DUDI', 'Tgl_Kirim_Surat', 'Status_Balasan_DUDI', 'Tgl_Balasan', 'Catatan_Perizinan', 'Link_Bukti_Balasan'] },
    { name: 'Plotting_Pemberangkatan', headers: ['ID_Penempatan', 'NIS', 'Nama_Siswa', 'ID_DUDI', 'Nama_DUDI', 'ID_Guru_Pendamping', 'Guru_Pendamping', 'Tanggal_Berangkat', 'Tanggal_Rencana_Tarik', 'Status_Penempatan'] },
    { name: 'Monitoring_5_Tahap', headers: ['ID_Monitoring', 'ID_Penempatan', 'NIS', 'Nama_Siswa', 'DUDI_Tujuan', 'Alamat_DUDI', 'Daftar_Siswa', 'Jurusan', 'Guru_Pendamping', 'Tahap', 'Tanggal_Kunjungan', 'Sakit', 'Izin', 'Alpha', 'Nilai_PKL_Muncul', 'Nilai_K3LH', 'Nilai_Softskill', 'Nilai_Kompetensi_Teknis', 'Nilai_Alur_Bisnis', 'Nilai_Rata_Rata', 'Catatan_Kunjungan', 'Foto_Bukti_Drive', 'Nilai_DUDI_Terkumpul', 'Blangko_Sertifikat_Bawa', 'Status_Tahap'] },
    { name: 'Nilai_Dan_Sertifikat', headers: ['ID_Penempatan', 'NIS', 'Nama_Siswa', 'Jurusan', 'Kelas', 'DUDI_Tujuan', 'Nilai_K3LH', 'Nilai_Softskill', 'Nilai_Kompetensi_Teknis', 'Nilai_Alur_Bisnis', 'Nilai_Rata_Rata', 'Predikat', 'No_Seri_Blangko', 'Status_Blangko', 'Status_Raport', 'Tgl_Terbit'] },
    { name: 'Master_Akun', headers: ['ID', 'Username', 'Password_Hash', 'Role', 'Nama_Lengkap', 'Jabatan', 'Status', 'Updated_At'] }
  ];

  sheetsConfig.forEach(function(cfg, idx) {
    let sheet = idx === 0 ? ss.getSheets()[0] : ss.insertSheet(cfg.name);
    sheet.setName(cfg.name);
    sheet.appendRow(cfg.headers);
    sheet.getRange(1, 1, 1, cfg.headers.length).setFontWeight('bold').setBackground('#0F172A').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  });

  // 3. Buat Google Form Pendaftaran Siswa
  const formTitle = 'Pengajuan PKL Siswa SMK PGRI 2 Ponorogo TA ' + year;
  const form = FormApp.create(formTitle);
  const formFile = DriveApp.getFileById(form.getId());
  yearFolder.addFile(formFile);
  DriveApp.getRootFolder().removeFile(formFile);

  form.setTitle(formTitle)
      .setDescription('Formulir Pengajuan PKL SMK PGRI 2 Ponorogo.')
      .setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  // 4. Buat 5 Template Dokumen Resmi Google Docs
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

  const gasApiCode = `/**
 * ============================================================================
 * GOOGLE APPS SCRIPT (GAS) - API WEB APP ENDPOINT (SSOT SPREADSHEET)
 * Mendukung Portal Publik Siswa (Pengajuan NIS) & Petugas Monitoring (PIN)
 * ============================================================================
 */

function normalizeKey(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getNormalizedValue(rowObj, header) {
  if (rowObj[header] !== undefined) return rowObj[header];
  const target = normalizeKey(header);
  const keys = Object.keys(rowObj || {});
  for (let i = 0; i < keys.length; i++) {
    if (normalizeKey(keys[i]) === target) {
      return rowObj[keys[i]];
    }
  }
  return '';
}

function getGasSheetCacheVersion(ssId) {
  try {
    return CacheService.getScriptCache().get('ver_' + ssId) || '0';
  } catch (e) {
    return '0';
  }
}

function bumpGasSheetCacheVersion(ssId) {
  try {
    CacheService.getScriptCache().put('ver_' + ssId, String(Date.now()), 3600);
  } catch (e) {
    // ignore cache error
  }
}

function readSheetRowsFast(ss, sheetName, ssId, ver) {
  const cacheKey = 'sh_' + ver + '_' + ssId + '_' + sheetName;
  let scriptCache = null;
  try {
    scriptCache = CacheService.getScriptCache();
    const cached = scriptCache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (e) {
    // ignore cache miss
  }

  const sheet = resolveSheetAlias(ss, sheetName);
  if (!sheet) {
    if (sheetName === 'Master_Akun') {
      return { rows: [], missingSheet: true };
    }
    return { error: 'Sheet tidak ditemukan: ' + sheetName };
  }

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    return { rows: [] };
  }

  const headers = data[0];
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const row = {};
    let hasValue = false;
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = data[i][j];
      if (String(data[i][j] || '').trim() !== '') hasValue = true;
    }
    if (hasValue) rows.push(row);
  }

  const result = { rows: rows };
  if (scriptCache) {
    try {
      const serialized = JSON.stringify(result);
      if (serialized.length < 90000) {
        scriptCache.put(cacheKey, serialized, 90);
      }
    } catch (e) {
      // ignore CacheService 100KB limit
    }
  }
  return result;
}

function doGet(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    const action = String(params.action || '').toUpperCase();
    const spreadsheetId = String(params.spreadsheetId || '').trim();
    const ss = spreadsheetId ? SpreadsheetApp.openById(spreadsheetId) : SpreadsheetApp.getActiveSpreadsheet();

    if (!ss) {
      return ContentService.createTextOutput(JSON.stringify({
        error: 'Spreadsheet tidak ditemukan. Pastikan skrip dipasang melalui Ekstensi -> Apps Script atau kirim parameter spreadsheetId.'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const ssId = ss.getId();
    const ver = getGasSheetCacheVersion(ssId);

    if (action === 'PING' || (!action && !params.sheet && !params.sheets)) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        title: ss.getName(),
        sheets: ss.getSheets().map(function(s) { return s.getName(); })
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'BATCH_GET' && params.sheets) {
      const requested = String(params.sheets)
        .split(',')
        .map(function(s) { return String(s || '').trim(); })
        .filter(Boolean);
      const sheetsPayload = {};
      for (let i = 0; i < requested.length; i++) {
        const name = requested[i];
        const res = readSheetRowsFast(ss, name, ssId, ver);
        sheetsPayload[name] = res.error ? [] : (res.rows || []);
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        sheets: sheetsPayload
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const sheetName = params.sheet || 'Master_Jurusan';
    const res = readSheetRowsFast(ss, sheetName, ssId, ver);
    if (res.error) {
      return ContentService.createTextOutput(JSON.stringify({ error: res.error }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      data: res.rows || [],
      missingSheet: Boolean(res.missingSheet)
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

const REQUIRED_SHEET_HEADERS = {
  Master_DUDI: ['ID', 'Nama_DUDI', 'Bidang_Keahlian', 'Alamat', 'Wilayah_Kota', 'Nama_Pemimpin', 'Nama_PIC', 'Kontak_PIC', 'No_Telp_DUDI', 'Kuota_Maksimal', 'Terisi', 'Status_Kerjasama'],
  Data_Pengajuan_PKL: ['No_Pengajuan', 'Timestamp', 'NIS', 'Nama_Siswa', 'Jurusan', 'Kelas', 'DUDI_Tujuan', 'Alamat_DUDI', 'Bidang_Pekerjaan', 'Nama_Pemimpin', 'Nama_PIC', 'No_Telp_DUDI', 'No_WA', 'Alamat_Domisili', 'Nama_Ortu_Wali', 'No_Ortu_Wali', 'Status_Kakomli', 'Catatan_Kakomli', 'Status_Hubin', 'Guru_Pendamping', 'Tgl_Berangkat'],
  Monitoring_5_Tahap: ['ID_Monitoring', 'ID_Penempatan', 'NIS', 'Nama_Siswa', 'DUDI_Tujuan', 'Alamat_DUDI', 'Daftar_Siswa', 'Jurusan', 'Guru_Pendamping', 'Tahap', 'Tanggal_Kunjungan', 'Sakit', 'Izin', 'Alpha', 'Nilai_PKL_Muncul', 'Nilai_K3LH', 'Nilai_Softskill', 'Nilai_Kompetensi_Teknis', 'Nilai_Alur_Bisnis', 'Nilai_Rata_Rata', 'Catatan_Kunjungan', 'Foto_Bukti_Drive', 'Nilai_DUDI_Terkumpul', 'Blangko_Sertifikat_Bawa', 'Status_Tahap'],
  Nilai_Dan_Sertifikat: ['ID_Penempatan', 'NIS', 'Nama_Siswa', 'Jurusan', 'Kelas', 'DUDI_Tujuan', 'Nilai_K3LH', 'Nilai_Softskill', 'Nilai_Kompetensi_Teknis', 'Nilai_Alur_Bisnis', 'Nilai_Rata_Rata', 'Predikat', 'No_Seri_Blangko', 'Status_Blangko', 'Status_Raport', 'Tgl_Terbit']
};

function ensureMissingHeaders(sheet, canonicalSheetName) {
  const expected = REQUIRED_SHEET_HEADERS[canonicalSheetName];
  const lastCol = sheet.getLastColumn();
  if (!expected || lastCol === 0) {
    return lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  }
  const currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const existingNorms = {};
  for (let i = 0; i < currentHeaders.length; i++) {
    existingNorms[normalizeKey(currentHeaders[i])] = true;
  }
  const missing = [];
  for (let j = 0; j < expected.length; j++) {
    if (!existingNorms[normalizeKey(expected[j])]) {
      missing.push(expected[j]);
    }
  }
  if (missing.length > 0) {
    sheet.getRange(1, currentHeaders.length + 1, 1, missing.length)
      .setValues([missing])
      .setFontWeight('bold')
      .setBackground('#0F172A')
      .setFontColor('#FFFFFF');
    return currentHeaders.concat(missing);
  }
  return currentHeaders;
}

function syncAllSpreadsheetHeaders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(REQUIRED_SHEET_HEADERS).forEach(function(name) {
    const sh = resolveSheetAlias(ss, name);
    if (sh) ensureMissingHeaders(sh, name);
  });
}

function resolveSheetAlias(ss, sheetName) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet && (sheetName === 'Master_Siswa_XI' || sheetName === 'Master_Siswa')) {
    sheet = ss.getSheetByName('Master_Siswa_XI') || ss.getSheetByName('Master_Siswa');
  } else if (
    !sheet &&
    (sheetName === 'Monitoring_5_Tahap' ||
      sheetName === 'Monitoring_6_Tahap' ||
      sheetName === 'Monitoring_8_Tahap' ||
      sheetName === 'Monitoring_PKL')
  ) {
    sheet =
      ss.getSheetByName('Monitoring_5_Tahap') ||
      ss.getSheetByName('Monitoring_6_Tahap') ||
      ss.getSheetByName('Monitoring_8_Tahap') ||
      ss.getSheetByName('Monitoring_PKL');
  }
  return sheet;
}

function extractRecordId(obj) {
  if (!obj || typeof obj !== 'object') return '';
  return String(
    obj.id ||
    obj.ID ||
    obj.No_Pengajuan ||
    obj.noPengajuan ||
    obj.ID_Perizinan ||
    obj.noPerizinan ||
    obj.ID_Penempatan ||
    obj.idPenempatan ||
    obj.ID_Monitoring ||
    obj.idMonitoring ||
    ''
  ).trim();
}

function findRowIndexById(values, headers, targetId) {
  if (!targetId) return -1;
  let idColIdx = 0;
  for (let c = 0; c < headers.length; c++) {
    const k = normalizeKey(headers[c]);
    if (k === 'id' || k === 'nopengajuan' || k === 'idperizinan' || k === 'idpenempatan' || k === 'idmonitoring') {
      idColIdx = c;
      break;
    }
  }
  for (let r = 1; r < values.length; r++) {
    const colVal = String(values[r][idColIdx] || '').trim();
    const firstColVal = String(values[r][0] || '').trim();
    if (colVal === targetId || firstColVal === targetId) {
      return r;
    }
  }
  return -1;
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(body.action || '').toUpperCase();
    const sheetName = body.sheetName;
    const spreadsheetId = String(body.spreadsheetId || '').trim();
    const ss = spreadsheetId ? SpreadsheetApp.openById(spreadsheetId) : SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      throw new Error('Spreadsheet tidak ditemukan.');
    }
    let sheet = resolveSheetAlias(ss, sheetName);

    if (!sheet && sheetName === 'Master_Akun') {
      const akunHeaders = ['ID', 'Username', 'Password_Hash', 'Role', 'Nama_Lengkap', 'Jabatan', 'Status', 'Updated_At'];
      sheet = ss.insertSheet('Master_Akun');
      sheet.appendRow(akunHeaders);
      sheet.getRange(1, 1, 1, akunHeaders.length)
        .setFontWeight('bold')
        .setBackground('#0F172A')
        .setFontColor('#FFFFFF');
      sheet.setFrozenRows(1);
    }

    if (!sheet) {
      throw new Error('Sheet tidak ditemukan: ' + sheetName);
    }

    const headers = ensureMissingHeaders(sheet, sheetName);

    if (action === 'CREATE') {
      const rowObj = body.data || {};
      const newRow = headers.map(function(h) { return getNormalizedValue(rowObj, h); });
      sheet.appendRow(newRow);
    } else if (action === 'IMPORT') {
      const items = Array.isArray(body.data) ? body.data : [];
      if (items.length > 0) {
        const matrix = items.map(function(item) {
          return headers.map(function(h) { return getNormalizedValue(item, h); });
        });
        const startRow = sheet.getLastRow() + 1;
        sheet.getRange(startRow, 1, matrix.length, headers.length).setValues(matrix);
      }
    } else if (action === 'UPDATE') {
      const rowObj = body.data || {};
      const targetId = String(body.id || extractRecordId(rowObj)).trim();
      const values = sheet.getDataRange().getValues();
      const rowIdx = findRowIndexById(values, headers, targetId);
      if (rowIdx !== -1) {
        const updatedRow = headers.map(function(h, colIdx) {
          const val = getNormalizedValue(rowObj, h);
          return val !== undefined ? val : values[rowIdx][colIdx];
        });
        sheet.getRange(rowIdx + 1, 1, 1, headers.length).setValues([updatedRow]);
      }
    } else if (action === 'BULK_UPDATE') {
      const updatedRows = (body.data && Array.isArray(body.data.updatedRows)) ? body.data.updatedRows : [];
      const values = sheet.getDataRange().getValues();
      updatedRows.forEach(function(rowObj) {
        const targetId = extractRecordId(rowObj);
        const rowIdx = findRowIndexById(values, headers, targetId);
        if (rowIdx !== -1) {
          const updatedRow = headers.map(function(h, colIdx) {
            const val = getNormalizedValue(rowObj, h);
            return val !== undefined ? val : values[rowIdx][colIdx];
          });
          sheet.getRange(rowIdx + 1, 1, 1, headers.length).setValues([updatedRow]);
        }
      });
    } else if (action === 'DELETE') {
      const payload = body.data || {};
      const targetId = String(body.id || extractRecordId(payload) || extractRecordId(payload.deletedRow)).trim();
      const values = sheet.getDataRange().getValues();
      const rowIdx = findRowIndexById(values, headers, targetId);
      if (rowIdx !== -1) {
        sheet.deleteRow(rowIdx + 1);
      }
    } else if (action === 'BULK_DELETE') {
      const ids = (body.data && Array.isArray(body.data.ids)) ? body.data.ids.map(function(x) { return String(x).trim(); }) : [];
      if (ids.length > 0) {
        let idColIdx = 0;
        for (let c = 0; c < headers.length; c++) {
          const k = normalizeKey(headers[c]);
          if (k === 'id' || k === 'nopengajuan' || k === 'idperizinan' || k === 'idpenempatan' || k === 'idmonitoring') {
            idColIdx = c;
            break;
          }
        }
        const values = sheet.getDataRange().getValues();
        for (let r = values.length - 1; r >= 1; r--) {
          const cellId = String(values[r][idColIdx] || '').trim();
          const firstCellId = String(values[r][0] || '').trim();
          if (ids.indexOf(cellId) !== -1 || ids.indexOf(firstCellId) !== -1) {
            sheet.deleteRow(r + 1);
          }
        }
      }
    } else if (action === 'SYNC_ALL') {
      const rows = body.data;
      if (Array.isArray(rows)) {
        const lastRow = sheet.getLastRow();
        if (lastRow > 1) {
          sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
        }
        if (rows.length > 0) {
          const matrix = rows.map(function(r) {
            return headers.map(function(h) { return getNormalizedValue(r, h); });
          });
          sheet.getRange(2, 1, matrix.length, headers.length).setValues(matrix);
        }
      }
    }

    bumpGasSheetCacheVersion(ss.getId());
    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
`;

  const activeCode = activeTab === 'bootstrap' ? gasBootstrapCode : gasApiCode;

  const copyCode = () => {
    navigator.clipboard.writeText(activeCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white/95 backdrop-blur-2xl rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden border border-slate-200/90 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-200/60 shadow-2xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 tracking-tight">
                Google Apps Script (GAS) Endpoint &amp; Generator
              </h3>
              <p className="text-[11px] text-slate-500">
                Hubungkan Portal Publik Siswa/Guru ke Google Spreadsheet secara real-time
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-slate-100 bg-slate-50/50">
          <button
            onClick={() => setActiveTab('api')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'api'
                ? 'border-blue-600 text-blue-700 font-extrabold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            1. Web App API Endpoint (Wajib untuk Portal Publik)
          </button>
          <button
            onClick={() => setActiveTab('bootstrap')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'bootstrap'
                ? 'border-purple-600 text-purple-700 font-extrabold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            2. Generator Struktur Baru (Tahun Ajaran Baru)
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4">
          <div className="p-3.5 bg-purple-50/70 border border-purple-200/80 rounded-2xl text-xs text-purple-900 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-purple-600" />
              <span>
                {activeTab === 'api'
                  ? 'Cara Pasang Endpoint API Web App di Spreadsheet:'
                  : 'Cara Kerja Generator Struktur Baru:'}
              </span>
            </div>
            {activeTab === 'api' ? (
              <ol className="list-decimal list-inside space-y-0.5 text-purple-800 text-[11px] leading-relaxed">
                <li>Buka Google Spreadsheet aktif &rarr; menu <b>Ekstensi</b> &rarr; <b>Apps Script</b> &rarr; tempel kode lalu <b>Simpan</b>.</li>
                <li>Klik <b>Deploy</b> &rarr; <b>New deployment</b> &rarr; pilih jenis <b>Web app</b> (jika update kode lama: pilih <b>Manage deployments</b> &rarr; ikon Edit &rarr; Version: <b>New version</b>).</li>
                <li>Wajib atur <b>Execute as: Me (Saya)</b> dan <b>Who has access: Anyone (Siapa saja)</b> &rarr; klik <b>Deploy</b> &amp; berikan izin akses (*Authorize*).</li>
                <li>Salin <b>Web app URL</b> berakhiran <code>/exec</code> (bukan <code>/dev</code>). <i>Catatan: Jika memakai akun Workspace sekolah (<code>@sch.id</code>) dan akses &quot;Anyone&quot; diblokir admin domain, deploy memakai akun Gmail biasa yang dijadikan Editor Spreadsheet.</i></li>
              </ol>
            ) : (
              <ol className="list-decimal list-inside space-y-0.5 text-purple-800 text-[11px] leading-relaxed">
                <li>Buka <a href="https://script.google.com" target="_blank" rel="noreferrer" className="underline font-bold">script.google.com</a> &rarr; Klik <b>New Project</b>.</li>
                <li>Tempelkan kode di bawah ini, lalu pilih fungsi <b>setupGoogleWorkspaceEnvironment</b>.</li>
                <li>Klik tombol <b>Run</b> untuk membuat folder Drive, Spreadsheet 10 sheet, Form, dan 5 Docs kosong.</li>
              </ol>
            )}
          </div>

          <div className="relative">
            <button
              onClick={copyCode}
              className="absolute right-3 top-3 flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Tersalin!' : 'Salin Kode Script'}</span>
            </button>
            <pre className="p-4 bg-slate-900 text-slate-100 rounded-2xl text-[11px] font-mono overflow-x-auto max-h-[360px] leading-relaxed">
              <code>{activeCode}</code>
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Ekosistem Google Workspace SMK PGRI 2 Ponorogo
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
