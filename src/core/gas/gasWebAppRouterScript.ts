export function buildGasWebAppRouterCode(): string {
  return `/**
 * ============================================================================
 * FILE 02: WEB APP ROUTER (doGet & doPost CRUD / BATCH / DISPATCHER)
 * Bagian dari Google Apps Script SI-HUBIN SMK PGRI 2 Ponorogo (4 File Modular)
 * Bergantung pada fungsi & konstanta di 01_ConfigAndHelpers.gs,
 * 03_RelationalMigration.gs, dan 04_PdfAndYearlyRollover.gs
 * ============================================================================
 */

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
        locale: ss.getSpreadsheetLocale(),
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

function doPost(e) {
  let scriptLock = null;
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(body.action || '').toUpperCase();
    const sheetName = body.sheetName;
    const spreadsheetId = String(body.spreadsheetId || '').trim();

    const lockRequired =
      action !== 'GENERATE_SURAT_IZIN_PDF' && action !== 'GENERATE_MONITORING_BUNDLE_PDF';
    if (lockRequired) {
      scriptLock = LockService.getScriptLock();
      scriptLock.waitLock(15000);
    }

    if (action === 'CREATE_YEARLY_SPREADSHEET') {
      return handleCreateYearlySpreadsheet(body);
    }

    const ss = spreadsheetId ? SpreadsheetApp.openById(spreadsheetId) : SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      throw new Error('Spreadsheet tidak ditemukan.');
    }

    if (action === 'MIGRATE_RELATIONAL_FORMULAS') {
      const result = applyRelationalFormulasToSpreadsheet(ss);
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        success: true,
        message: 'Migrasi FK (' + result.backfilledRows + ' sel) & ' + result.plantedFormulas + ' ARRAYFORMULA Baris-1 berhasil diterapkan.',
        details: result
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'GENERATE_SURAT_IZIN_PDF') {
      return handleGenerateSuratIzinPdf(body);
    }

    if (action === 'GENERATE_MONITORING_BUNDLE_PDF') {
      return handleGenerateMonitoringBundlePdf(body);
    }

    let sheet = resolveSheetAlias(ss, sheetName);

    if (!sheet && (sheetName === 'Master_Akun' || sheetName === 'Log_Penerbitan_Surat')) {
      const autoHeaders = REQUIRED_SHEET_HEADERS[sheetName] || [];
      sheet = ss.insertSheet(sheetName);
      if (autoHeaders.length > 0) {
        sheet.appendRow(autoHeaders);
        sheet.getRange(1, 1, 1, autoHeaders.length)
          .setFontWeight('bold')
          .setBackground('#0F172A')
          .setFontColor('#FFFFFF');
        sheet.setFrozenRows(1);
      }
    }

    if (!sheet) {
      throw new Error('Sheet tidak ditemukan: ' + sheetName);
    }

    const headers = ensureMissingHeaders(sheet, sheetName);
    const isFormulaCol = detectFormulaColFlags(sheet, headers.length);
    let savedId = '';
    let savedRowNumber = 0;

    if (action === 'CREATE') {
      const rowObj = body.data || {};
      savedId = String(body.id || extractRecordId(rowObj) || '').trim();
      const newRow = headers.map(function(h) {
        const val = getNormalizedValue(rowObj, h);
        return val !== undefined ? val : '';
      });
      const targetRow = getNextAppendRowNonFormula(sheet, isFormulaCol);
      formatNisAndTextColumns(sheet, headers, targetRow, 1);
      writeNonFormulaRowSpans(sheet, targetRow, newRow, isFormulaCol);
      savedRowNumber = targetRow;
    } else if (action === 'IMPORT') {
      const items = Array.isArray(body.data) ? body.data : [];
      if (items.length > 0) {
        const matrix = items.map(function(item) {
          return headers.map(function(h) {
            const val = getNormalizedValue(item, h);
            return val !== undefined ? val : '';
          });
        });
        const startRow = getNextAppendRowNonFormula(sheet, isFormulaCol);
        formatNisAndTextColumns(sheet, headers, startRow, matrix.length);
        writeNonFormulaMatrixSpans(sheet, startRow, matrix, isFormulaCol);
        savedRowNumber = startRow;
      }
    } else if (action === 'UPDATE') {
      const rowObj = body.data || {};
      const targetId = String(body.id || extractRecordId(rowObj)).trim();
      savedId = targetId;
      const explicitRowNum = Number(body.sheetRowNumber || rowObj._sheetRowNumber || 0);
      const values = sheet.getDataRange().getValues();
      const rowIdx = findRowIndexById(values, headers, targetId, rowObj, sheetName, explicitRowNum);
      if (rowIdx === -1) {
        return ContentService.createTextOutput(JSON.stringify({
          error: 'Baris data dengan ID "' + targetId + '" tidak ditemukan di sheet "' + sheetName + '". Segarkan tabel terlebih dahulu lalu coba simpan ulang.'
        })).setMimeType(ContentService.MimeType.JSON);
      }
      const updatedRow = headers.map(function(h, colIdx) {
        if (isFormulaCol[colIdx]) return '';
        const val = getNormalizedValue(rowObj, h);
        return val !== undefined ? val : values[rowIdx][colIdx];
      });
      formatNisAndTextColumns(sheet, headers, rowIdx + 1, 1);
      writeNonFormulaRowSpans(sheet, rowIdx + 1, updatedRow, isFormulaCol);
      savedRowNumber = rowIdx + 1;
    } else if (action === 'BULK_UPDATE') {
      const updatedRows = (body.data && Array.isArray(body.data.updatedRows)) ? body.data.updatedRows : [];
      const values = sheet.getDataRange().getValues();
      const pendingWrites = [];
      updatedRows.forEach(function(rowObj) {
        const targetId = extractRecordId(rowObj);
        const rowIdx = findRowIndexById(values, headers, targetId, rowObj, sheetName, rowObj && rowObj._sheetRowNumber);
        if (rowIdx !== -1) {
          const updatedRow = headers.map(function(h, colIdx) {
            if (isFormulaCol[colIdx]) return '';
            const val = getNormalizedValue(rowObj, h);
            return val !== undefined ? val : values[rowIdx][colIdx];
          });
          values[rowIdx] = updatedRow;
          pendingWrites.push({ sheetRow: rowIdx + 1, row: updatedRow });
        }
      });
      if (pendingWrites.length > 0) {
        pendingWrites.sort(function(a, b) { return a.sheetRow - b.sheetRow; });
        let runStartIdx = 0;
        while (runStartIdx < pendingWrites.length) {
          let runEndIdx = runStartIdx;
          const runMatrix = [pendingWrites[runStartIdx].row];
          while (
            runEndIdx + 1 < pendingWrites.length &&
            pendingWrites[runEndIdx + 1].sheetRow === pendingWrites[runEndIdx].sheetRow + 1
          ) {
            runEndIdx++;
            runMatrix.push(pendingWrites[runEndIdx].row);
          }
          const startSheetRow = pendingWrites[runStartIdx].sheetRow;
          formatNisAndTextColumns(sheet, headers, startSheetRow, runMatrix.length);
          writeNonFormulaMatrixSpans(sheet, startSheetRow, runMatrix, isFormulaCol);
          runStartIdx = runEndIdx + 1;
        }
      }
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
        clearNonFormulaDataRows(sheet, headers.length, isFormulaCol);
        if (rows.length > 0) {
          const matrix = rows.map(function(r) {
            return headers.map(function(h) {
              const val = getNormalizedValue(r, h);
              return val !== undefined ? val : '';
            });
          });
          formatNisAndTextColumns(sheet, headers, 2, matrix.length);
          writeNonFormulaMatrixSpans(sheet, 2, matrix, isFormulaCol);
        }
      }
    }

    SpreadsheetApp.flush();
    bumpGasSheetCacheVersion(ss.getId());
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      verified: true,
      action: action,
      sheetName: sheetName,
      savedId: savedId || undefined,
      sheetRowNumber: savedRowNumber >= 2 ? savedRowNumber : undefined,
      savedAt: new Date().toISOString()
    }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    if (scriptLock) {
      try {
        scriptLock.releaseLock();
      } catch (releaseErr) {}
    }
  }
}
`;
}
