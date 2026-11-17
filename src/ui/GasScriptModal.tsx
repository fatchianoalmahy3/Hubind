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
    { name: 'Master_Siswa_XI', headers: ['ID', 'NIS', 'NIK', 'Nama_Lengkap', 'Jenis_Kelamin', 'ID_Jurusan', 'Kelas', 'No_HP_Siswa', 'Alamat_Domisili', 'Nama_Ortu_Wali', 'No_Ortu_Wali', 'Status_PKL', 'Foto_URL'] },
    { name: 'Master_Jurusan', headers: ['ID', 'Kode', 'Nama_Jurusan', 'Nama_Kakomli', 'NIP_Kakomli', 'Kontak_WA', 'Kuota_Siswa', 'Total_Terdaftar'] },
    { name: 'Master_Kelas_Walas', headers: ['ID', 'Nama_Kelas', 'Jurusan', 'Tingkat', 'Wali_Kelas', 'Kontak_Walas', 'Jumlah_Siswa'] },
    { name: 'Master_DUDI', headers: ['ID', 'Nama_DUDI', 'Bidang_Keahlian', 'Alamat', 'Wilayah_Kota', 'Nama_Pemimpin', 'Nama_PIC', 'Kontak_PIC', 'No_Telp_DUDI', 'Kuota_Maksimal', 'Terisi', 'Status_Kerjasama'] },
    { name: 'Master_Guru_Pendamping', headers: ['ID', 'NIP', 'Nama_Lengkap', 'Kontak_WA', 'Email_Google', 'Peran_Utama', 'Jumlah_Bimbingan', 'PIN'] },
    { name: 'Data_Pengajuan_PKL', headers: ['No_Pengajuan', 'Timestamp', 'NIS', 'Nama_Siswa', 'Jurusan', 'Kelas', 'DUDI_Tujuan', 'Alamat_DUDI', 'Bidang_Pekerjaan', 'Nama_Pemimpin', 'Nama_PIC', 'No_Telp_DUDI', 'No_WA', 'Alamat_Domisili', 'Nama_Ortu_Wali', 'No_Ortu_Wali', 'Status_Kakomli', 'Catatan_Kakomli', 'Status_Hubin', 'Guru_Pendamping', 'Tgl_Berangkat'] },
    { name: 'Data_Perizinan_PKL', headers: ['ID_Perizinan', 'No_Pengajuan', 'NIS', 'Nama_Siswa', 'Jurusan', 'Kelas', 'Nama_Ortu_Wali', 'No_Ortu_Wali', 'Status_Izin_Ortu', 'No_Surat_Permohonan', 'DUDI_Tujuan', 'Alamat_DUDI', 'Tgl_Kirim_Surat', 'Status_Balasan_DUDI', 'Tgl_Balasan', 'Catatan_Perizinan', 'Link_Bukti_Balasan'] },
    { name: 'Plotting_Pemberangkatan', headers: ['ID_Penempatan', 'NIS', 'Nama_Siswa', 'ID_DUDI', 'Nama_DUDI', 'ID_Guru_Pendamping', 'Guru_Pendamping', 'Tanggal_Berangkat', 'Tanggal_Rencana_Tarik', 'Status_Penempatan'] },
    { name: 'Monitoring_5_Tahap', headers: ['ID_Monitoring', 'ID_Penempatan', 'NIS', 'Nama_Siswa', 'DUDI_Tujuan', 'Alamat_DUDI', 'Daftar_Siswa', 'Jurusan', 'Guru_Pendamping', 'Tahap', 'Tanggal_Kunjungan', 'Sakit', 'Izin', 'Alpha', 'Nilai_PKL_Muncul', 'Nilai_K3LH', 'Nilai_Softskills', 'Nilai_Hardskills', 'Nilai_Alur_Bisnis_Dunia_Kerja', 'Nilai_rata_rata', 'Catatan_Kunjungan', 'Foto_Bukti_Drive', 'Nilai_DUDI_Terkumpul', 'Blangko_Sertifikat_Bawa', 'Status_Tahap'] },
    { name: 'Nilai_Dan_Sertifikat', headers: ['ID_Penempatan', 'NIS', 'Nama_Siswa', 'Jurusan', 'Kelas', 'DUDI_Tujuan', 'Nilai_K3LH', 'Nilai_Softskills', 'Nilai_Hardskills', 'Nilai_Alur_Bisnis_Dunia_Kerja', 'Nilai_rata_rata', 'Predikat', 'No_Seri_Blangko', 'Status_Blangko', 'Status_Raport', 'Tgl_Terbit'] },
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

const KEY_ALIASES = {
  id: ['id', 'idperizinan', 'idpenempatan', 'idmonitoring', 'nopengajuan'],
  idperizinan: ['idperizinan', 'noperizinan', 'id'],
  noperizinan: ['noperizinan', 'idperizinan', 'id'],
  nopengajuan: ['nopengajuan', 'id'],
  idpenempatan: ['idpenempatan', 'id'],
  idmonitoring: ['idmonitoring', 'id'],
  tahap: ['tahap', 'tahapmonitoring'],
  tahapmonitoring: ['tahapmonitoring', 'tahap'],
  nohpsiswa: ['nohpsiswa', 'nohp', 'telepon'],
  alamatdudi: ['alamatdudi', 'alamat'],
  tglberangkat: ['tglberangkat', 'tanggalberangkat'],
  tanggalberangkat: ['tanggalberangkat', 'tglberangkat'],
  tglkirimsurat: ['tglkirimsurat', 'tanggalkirimsurat'],
  tanggalkirimsurat: ['tanggalkirimsurat', 'tglkirimsurat'],
  tglbalasan: ['tglbalasan', 'tanggalbalasan'],
  tanggalbalasan: ['tanggalbalasan', 'tglbalasan'],
  tglterbit: ['tglterbit', 'tanggalterbit'],
  tanggalterbit: ['tanggalterbit', 'tglterbit'],
  fotobuktidrive: ['fotobuktidrive', 'fotobuktiurl'],
  fotobuktiurl: ['fotobuktiurl', 'fotobuktidrive'],
  fotourl: ['fotourl', 'foto'],
  noseriblangko: ['noseriblangko'],
  passwordhash: ['passwordhash'],
  nilaisoftskills: ['nilaisoftskills', 'nilaisoftskill'],
  nilaisoftskill: ['nilaisoftskill', 'nilaisoftskills'],
  nilaihardskills: ['nilaihardskills', 'nilaikompetensiteknis'],
  nilaikompetensiteknis: ['nilaikompetensiteknis', 'nilaihardskills'],
  nilaialurbisnisduniakerja: ['nilaialurbisnisduniakerja', 'nilaialurbisnis'],
  nilaialurbisnis: ['nilaialurbisnis', 'nilaialurbisnisduniakerja'],
  nilairatarata: ['nilairatarata', 'nilaidudi', 'nilaiakhir'],
  nilaidudi: ['nilaidudi', 'nilairatarata', 'nilaiakhir'],
  idjurusan: ['idjurusan', 'jurusan'],
  jurusan: ['jurusan', 'idjurusan'],
  namalengkap: ['namalengkap', 'nama', 'namasiswa'],
  namasiswa: ['namasiswa', 'nama', 'namalengkap']
};

function getNormalizedValue(rowObj, header) {
  if (!rowObj || typeof rowObj !== 'object') return undefined;
  const target = normalizeKey(header);
  const candidateTargets = KEY_ALIASES[target] || [target];
  const keys = Object.keys(rowObj);

  let firstDefined = undefined;
  if (rowObj[header] !== undefined) {
    if (String(rowObj[header] === null ? '' : rowObj[header]).trim() !== '') {
      return rowObj[header];
    }
    firstDefined = rowObj[header];
  }

  for (let c = 0; c < candidateTargets.length; c++) {
    const wanted = candidateTargets[c];
    for (let i = 0; i < keys.length; i++) {
      if (keys[i] === '_sheetRowNumber') continue;
      if (normalizeKey(keys[i]) === wanted) {
        const val = rowObj[keys[i]];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return val;
        }
        if (firstDefined === undefined && val !== undefined) {
          firstDefined = val;
        }
      }
    }
  }
  return firstDefined;
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

function readSheetRowsFast(ss, sheetName, ssId, ver, bypassCache) {
  const cacheKey = 'sh_' + ver + '_' + ssId + '_' + sheetName;
  let scriptCache = null;
  if (!bypassCache) {
    try {
      scriptCache = CacheService.getScriptCache();
      const cached = scriptCache.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {
      // ignore cache miss
    }
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
  const tz = ss.getSpreadsheetTimeZone() || 'Asia/Jakarta';
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const row = {};
    let hasValue = false;
    for (let j = 0; j < headers.length; j++) {
      let cellVal = data[i][j];
      if (Object.prototype.toString.call(cellVal) === '[object Date]' && !isNaN(cellVal.getTime())) {
        const hNorm = normalizeKey(headers[j]);
        const fmt = (hNorm === 'timestamp' || hNorm === 'updatedat') ? 'yyyy-MM-dd HH:mm:ss' : 'yyyy-MM-dd';
        cellVal = Utilities.formatDate(cellVal, tz, fmt);
      }
      row[headers[j]] = cellVal;
      if (String(cellVal === null || cellVal === undefined ? '' : cellVal).trim() !== '') hasValue = true;
    }
    if (hasValue) {
      row._sheetRowNumber = i + 1;
      rows.push(row);
    }
  }

  const result = { rows: rows };
  try {
    scriptCache = scriptCache || CacheService.getScriptCache();
    const serialized = JSON.stringify(result);
    if (serialized.length < 90000) {
      scriptCache.put(cacheKey, serialized, 90);
    }
  } catch (e) {
    // ignore CacheService 100KB limit
  }
  return result;
}

function doGet(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    const action = String(params.action || '').toUpperCase();
    const bypassCache = String(params.fresh || '') === '1';
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
        const res = readSheetRowsFast(ss, name, ssId, ver, bypassCache);
        sheetsPayload[name] = res.error ? [] : (res.rows || []);
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        sheets: sheetsPayload
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const sheetName = params.sheet || 'Master_Jurusan';
    const res = readSheetRowsFast(ss, sheetName, ssId, ver, bypassCache);
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
  Master_Siswa_XI: ['ID', 'NIS', 'NIK', 'Nama_Lengkap', 'Jenis_Kelamin', 'ID_Jurusan', 'Kelas', 'No_HP_Siswa', 'Alamat_Domisili', 'Nama_Ortu_Wali', 'No_Ortu_Wali', 'Status_PKL', 'Foto_URL'],
  Master_Jurusan: ['ID', 'Kode', 'Nama_Jurusan', 'Nama_Kakomli', 'NIP_Kakomli', 'Kontak_WA', 'Kuota_Siswa', 'Total_Terdaftar'],
  Master_Kelas_Walas: ['ID', 'Nama_Kelas', 'Jurusan', 'Tingkat', 'Wali_Kelas', 'Kontak_Walas', 'Jumlah_Siswa'],
  Master_DUDI: ['ID', 'Nama_DUDI', 'Bidang_Keahlian', 'Alamat', 'Wilayah_Kota', 'Nama_Pemimpin', 'Nama_PIC', 'Kontak_PIC', 'No_Telp_DUDI', 'Kuota_Maksimal', 'Terisi', 'Status_Kerjasama'],
  Master_Guru_Pendamping: ['ID', 'NIP', 'Nama_Lengkap', 'Kontak_WA', 'Email_Google', 'Peran_Utama', 'Jumlah_Bimbingan', 'PIN'],
  Data_Pengajuan_PKL: ['No_Pengajuan', 'Timestamp', 'NIS', 'Nama_Siswa', 'Jurusan', 'Kelas', 'DUDI_Tujuan', 'Alamat_DUDI', 'Bidang_Pekerjaan', 'Nama_Pemimpin', 'Nama_PIC', 'No_Telp_DUDI', 'No_WA', 'Alamat_Domisili', 'Nama_Ortu_Wali', 'No_Ortu_Wali', 'Status_Kakomli', 'Catatan_Kakomli', 'Status_Hubin', 'Guru_Pendamping', 'Tgl_Berangkat'],
  Data_Perizinan_PKL: ['ID_Perizinan', 'No_Pengajuan', 'NIS', 'Nama_Siswa', 'Jurusan', 'Kelas', 'Nama_Ortu_Wali', 'No_Ortu_Wali', 'Status_Izin_Ortu', 'No_Surat_Permohonan', 'DUDI_Tujuan', 'Alamat_DUDI', 'Tgl_Kirim_Surat', 'Status_Balasan_DUDI', 'Tgl_Balasan', 'Catatan_Perizinan', 'Link_Bukti_Balasan'],
  Plotting_Pemberangkatan: ['ID_Penempatan', 'NIS', 'Nama_Siswa', 'ID_DUDI', 'Nama_DUDI', 'ID_Guru_Pendamping', 'Guru_Pendamping', 'Tanggal_Berangkat', 'Tanggal_Rencana_Tarik', 'Status_Penempatan'],
  Monitoring_5_Tahap: ['ID_Monitoring', 'ID_Penempatan', 'NIS', 'Nama_Siswa', 'DUDI_Tujuan', 'Alamat_DUDI', 'Daftar_Siswa', 'Jurusan', 'Guru_Pendamping', 'Tahap', 'Tanggal_Kunjungan', 'Sakit', 'Izin', 'Alpha', 'Nilai_PKL_Muncul', 'Nilai_K3LH', 'Nilai_Softskills', 'Nilai_Hardskills', 'Nilai_Alur_Bisnis_Dunia_Kerja', 'Nilai_rata_rata', 'Catatan_Kunjungan', 'Foto_Bukti_Drive', 'Nilai_DUDI_Terkumpul', 'Blangko_Sertifikat_Bawa', 'Status_Tahap'],
  Nilai_Dan_Sertifikat: ['ID_Penempatan', 'NIS', 'Nama_Siswa', 'Jurusan', 'Kelas', 'DUDI_Tujuan', 'Nilai_K3LH', 'Nilai_Softskills', 'Nilai_Hardskills', 'Nilai_Alur_Bisnis_Dunia_Kerja', 'Nilai_rata_rata', 'Predikat', 'No_Seri_Blangko', 'Status_Blangko', 'Status_Raport', 'Tgl_Terbit'],
  Master_Akun: ['ID', 'Username', 'Password_Hash', 'Role', 'Nama_Lengkap', 'Jabatan', 'Status', 'Updated_At']
};

function canonicalizeSheetName(sheetName) {
  if (sheetName === 'Master_Siswa') return 'Master_Siswa_XI';
  if (
    sheetName === 'Monitoring_6_Tahap' ||
    sheetName === 'Monitoring_8_Tahap' ||
    sheetName === 'Monitoring_PKL'
  ) {
    return 'Monitoring_5_Tahap';
  }
  return sheetName;
}

function ensureMissingHeaders(sheet, rawSheetName) {
  const canonicalSheetName = canonicalizeSheetName(rawSheetName);
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
    const expNorm = normalizeKey(expected[j]);
    const aliases = KEY_ALIASES[expNorm] || [expNorm];
    const hasMatch = aliases.some(function(a) { return Boolean(existingNorms[a]); });
    if (!hasMatch) {
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

function parseRowHintFromId(rawId) {
  const str = String(rawId || '').trim();
  const hashMatch = str.match(/^(.*)#r(\d+)$/);
  if (hashMatch) {
    return { cleanId: hashMatch[1].trim(), rowNum: Number(hashMatch[2]) };
  }
  const placeholderMatch = str.match(/^row_(\d+)$/);
  if (placeholderMatch) {
    return { cleanId: '', rowNum: Number(placeholderMatch[1]) };
  }
  return { cleanId: str, rowNum: 0 };
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

function findColumnIndex(headers, candidatesNorm) {
  for (let c = 0; c < headers.length; c++) {
    const k = normalizeKey(headers[c]);
    if (candidatesNorm.indexOf(k) !== -1) {
      return c;
    }
  }
  return -1;
}

function findRowIndexById(values, headers, targetId, rowObj, sheetName, explicitRowNum) {
  const parsed = parseRowHintFromId(targetId);
  const cleanId = parsed.cleanId;
  const rowNumHint = Number(explicitRowNum || (rowObj && rowObj._sheetRowNumber) || parsed.rowNum || 0);

  let idColIdx = findColumnIndex(headers, ['id', 'nopengajuan', 'idperizinan', 'idpenempatan', 'idmonitoring']);
  if (idColIdx === -1) idColIdx = 0;

  const nisColIdx = findColumnIndex(headers, ['nis']);
  const userColIdx = findColumnIndex(headers, ['username']);
  const namaColIdx = findColumnIndex(headers, ['namasiswa', 'namalengkap', 'namadudi']);

  const stripNis = function(v) {
    return String(v || '').replace(/\\D/g, '');
  };

  // 1. If explicit physical row number hint exists, verify it first
  if (rowNumHint >= 2 && rowNumHint <= values.length) {
    const idx = rowNumHint - 1;
    const cellId = String(values[idx][idColIdx] || '').trim();
    const nisWanted = String((rowObj && (rowObj.NIS || rowObj.nis)) || '').trim();
    const nisWantedDigits = stripNis(nisWanted);
    const cellNis = nisColIdx !== -1 ? String(values[idx][nisColIdx] || '').trim() : '';
    const cellNisDigits = stripNis(cellNis);
    const nisMatches = (nisWanted && cellNis === nisWanted) || (nisWantedDigits && cellNisDigits === nisWantedDigits);

    if (
      (cleanId && cellId === cleanId) ||
      (!cellId && (!nisWanted || !cellNis || nisMatches)) ||
      nisMatches
    ) {
      return idx;
    }
  }

  // 2. Match exact primary ID column
  if (cleanId) {
    for (let r = 1; r < values.length; r++) {
      const colVal = String(values[r][idColIdx] || '').trim();
      const firstColVal = String(values[r][0] || '').trim();
      if (colVal === cleanId || firstColVal === cleanId) {
        return r;
      }
    }
  }

  // 3. Fallback secondary unique key match (NIS / Username / Nama) when ID_Penempatan/ID is blank or missing
  const nisWanted = String((rowObj && (rowObj.NIS || rowObj.nis)) || '').trim() ||
    ((sheetName === 'Nilai_Dan_Sertifikat' || sheetName === 'Master_Siswa_XI' || sheetName === 'Master_Siswa') ? cleanId : '');
  const nisWantedDigits = stripNis(nisWanted);
  if (nisWanted && nisColIdx !== -1) {
    for (let r2 = 1; r2 < values.length; r2++) {
      const rowNisStr = String(values[r2][nisColIdx] || '').trim();
      if (rowNisStr === nisWanted || (nisWantedDigits && stripNis(rowNisStr) === nisWantedDigits)) {
        return r2;
      }
    }
  }

  const userWanted = String((rowObj && (rowObj.Username || rowObj.username)) || '').trim();
  if (userWanted && userColIdx !== -1) {
    for (let r3 = 1; r3 < values.length; r3++) {
      if (String(values[r3][userColIdx] || '').trim().toLowerCase() === userWanted.toLowerCase()) {
        return r3;
      }
    }
  }

  const namaWanted = String((rowObj && (rowObj.Nama_Siswa || rowObj.namaSiswa || rowObj.Nama_Lengkap || rowObj.Nama_DUDI)) || '').trim();
  if (namaWanted && namaColIdx !== -1 && (rowNumHint >= 2 || !cleanId)) {
    for (let r4 = 1; r4 < values.length; r4++) {
      if (String(values[r4][namaColIdx] || '').trim().toLowerCase() === namaWanted.toLowerCase()) {
        return r4;
      }
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
      const newRow = headers.map(function(h) {
        const val = getNormalizedValue(rowObj, h);
        return val !== undefined ? val : '';
      });
      sheet.appendRow(newRow);
    } else if (action === 'IMPORT') {
      const items = Array.isArray(body.data) ? body.data : [];
      if (items.length > 0) {
        const matrix = items.map(function(item) {
          return headers.map(function(h) {
            const val = getNormalizedValue(item, h);
            return val !== undefined ? val : '';
          });
        });
        const startRow = sheet.getLastRow() + 1;
        sheet.getRange(startRow, 1, matrix.length, headers.length).setValues(matrix);
      }
    } else if (action === 'UPDATE') {
      const rowObj = body.data || {};
      const targetId = String(body.id || extractRecordId(rowObj)).trim();
      const explicitRowNum = Number(body.sheetRowNumber || rowObj._sheetRowNumber || 0);
      const values = sheet.getDataRange().getValues();
      const rowIdx = findRowIndexById(values, headers, targetId, rowObj, sheetName, explicitRowNum);
      if (rowIdx === -1) {
        return ContentService.createTextOutput(JSON.stringify({
          error: 'Baris data dengan ID "' + targetId + '" tidak ditemukan di sheet "' + sheetName + '". Segarkan tabel terlebih dahulu lalu coba simpan ulang.'
        })).setMimeType(ContentService.MimeType.JSON);
      }
      const updatedRow = headers.map(function(h, colIdx) {
        const val = getNormalizedValue(rowObj, h);
        return val !== undefined ? val : values[rowIdx][colIdx];
      });
      sheet.getRange(rowIdx + 1, 1, 1, headers.length).setValues([updatedRow]);
    } else if (action === 'BULK_UPDATE') {
      const updatedRows = (body.data && Array.isArray(body.data.updatedRows)) ? body.data.updatedRows : [];
      const values = sheet.getDataRange().getValues();
      updatedRows.forEach(function(rowObj) {
        const targetId = extractRecordId(rowObj);
        const rowIdx = findRowIndexById(values, headers, targetId, rowObj, sheetName, rowObj && rowObj._sheetRowNumber);
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
      const deletedRowObj = payload.deletedRow || payload;
      const targetId = String(body.id || extractRecordId(payload) || extractRecordId(deletedRowObj)).trim();
      const explicitRowNum = Number(body.sheetRowNumber || deletedRowObj._sheetRowNumber || 0);
      const values = sheet.getDataRange().getValues();
      const rowIdx = findRowIndexById(values, headers, targetId, deletedRowObj, sheetName, explicitRowNum);
      if (rowIdx === -1) {
        return ContentService.createTextOutput(JSON.stringify({
          error: 'Baris data yang akan dihapus (ID: "' + targetId + '") tidak ditemukan di sheet "' + sheetName + '".'
        })).setMimeType(ContentService.MimeType.JSON);
      }
      sheet.deleteRow(rowIdx + 1);
    } else if (action === 'BULK_DELETE') {
      const ids = (body.data && Array.isArray(body.data.ids)) ? body.data.ids : [];
      const deletedRows = (body.data && Array.isArray(body.data.deletedRows)) ? body.data.deletedRows : [];
      const values = sheet.getDataRange().getValues();
      const rowsToDelete = {};

      deletedRows.forEach(function(rowObj) {
        const idx = findRowIndexById(values, headers, extractRecordId(rowObj), rowObj, sheetName, rowObj && rowObj._sheetRowNumber);
        if (idx >= 1) rowsToDelete[idx] = true;
      });
      ids.forEach(function(rawId) {
        const idx = findRowIndexById(values, headers, String(rawId), null, sheetName, 0);
        if (idx >= 1) rowsToDelete[idx] = true;
      });

      const sortedDesc = Object.keys(rowsToDelete).map(Number).sort(function(a, b) { return b - a; });
      for (let d = 0; d < sortedDesc.length; d++) {
        sheet.deleteRow(sortedDesc[d] + 1);
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
            return headers.map(function(h) {
              const val = getNormalizedValue(r, h);
              return val !== undefined ? val : '';
            });
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
                Integrasi API Server &amp; Generator Struktur
              </h3>
              <p className="text-[11px] text-slate-500">
                Hubungkan Portal Publik Siswa/Guru ke Database Cloud Server secara real-time
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
            1. Endpoint API Cloud Server (Wajib untuk Portal Publik)
          </button>
          <button
            onClick={() => setActiveTab('bootstrap')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'bootstrap'
                ? 'border-purple-600 text-purple-700 font-extrabold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            2. Generator Struktur Database Baru (Tahun Ajaran Baru)
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4">
          <div className="p-3.5 bg-purple-50/70 border border-purple-200/80 rounded-2xl text-xs text-purple-900 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-purple-600" />
              <span>
                {activeTab === 'api'
                  ? 'Panduan Pemasangan Endpoint API Cloud Server:'
                  : 'Cara Kerja Generator Struktur Server Baru:'}
              </span>
            </div>
            {activeTab === 'api' ? (
              <ol className="list-decimal list-inside space-y-0.5 text-purple-800 text-[11px] leading-relaxed">
                <li>Buka konsol konektor database aktif &rarr; menu <b>Ekstensi</b> &rarr; <b>Apps Script</b> &rarr; tempel kode lalu <b>Simpan</b>.</li>
                <li>Klik <b>Deploy</b> &rarr; <b>New deployment</b> &rarr; pilih jenis <b>Web app</b> (jika update kode lama: pilih <b>Manage deployments</b> &rarr; ikon Edit &rarr; Version: <b>New version</b>).</li>
                <li>Wajib atur <b>Execute as: Me (Saya)</b> dan <b>Who has access: Anyone (Siapa saja)</b> &rarr; klik <b>Deploy</b> &amp; berikan izin akses (*Authorize*).</li>
                <li>Salin <b>Endpoint URL</b> berakhiran <code>/exec</code> (bukan <code>/dev</code>) ke menu Konfigurasi Server.</li>
              </ol>
            ) : (
              <ol className="list-decimal list-inside space-y-0.5 text-purple-800 text-[11px] leading-relaxed">
                <li>Buka konsol generator skrip &rarr; Klik <b>New Project</b>.</li>
                <li>Tempelkan kode di bawah ini, lalu pilih fungsi <b>setupGoogleWorkspaceEnvironment</b>.</li>
                <li>Klik tombol <b>Run</b> untuk menginisialisasi folder arsip, 11 tabel server, formulir, dan 5 templat dokumen.</li>
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
            Integrasi Cloud Server SMK PGRI 2 Ponorogo
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
