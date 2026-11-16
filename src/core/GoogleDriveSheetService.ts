import { HUBIN_SHEETS_BLUEPRINT } from './types/sheetBlueprint';

/**
 * Pure schema header & row normalizer for Google Spreadsheet rows
 * returned via Cloud GAS Web App / Server Proxy (Zero OAuth dependency).
 */
export class GoogleDriveSheetService {
  private static instance: GoogleDriveSheetService;

  private constructor() {}

  public static getInstance(): GoogleDriveSheetService {
    if (!GoogleDriveSheetService.instance) {
      GoogleDriveSheetService.instance = new GoogleDriveSheetService();
    }
    return GoogleDriveSheetService.instance;
  }

  public clearSheetIdCache(_spreadsheetId?: string) {
    // No-op kept for API compatibility
  }

  private static readonly FIELD_ALIASES: Record<string, string[]> = {
    // Siswa
    Nama_Lengkap: ['nama', 'namaLengkap', 'nama_lengkap', 'Nama_Lengkap'],
    Jenis_Kelamin: ['jenisKelamin', 'jenis_kelamin', 'Jenis_Kelamin'],
    ID_Jurusan: ['jurusan', 'idJurusan', 'id_jurusan', 'ID_Jurusan'],
    No_HP_Siswa: ['noHpSiswa', 'noHp', 'no_hp_siswa', 'No_HP_Siswa', 'no_wa', 'noWa'],
    Alamat_Domisili: ['alamatDomisili', 'alamat_domisili', 'Alamat_Domisili', 'alamat'],
    Nama_Ortu_Wali: ['namaOrtuWali', 'nama_ortu_wali', 'Nama_Ortu_Wali', 'nama_orang_tua', 'namaOrtu'],
    No_Ortu_Wali: ['noOrtuWali', 'no_ortu_wali', 'No_Ortu_Wali', 'telepon_orang_tua', 'noHpOrtu'],
    Status_PKL: ['statusPKL', 'status_pkl', 'Status_PKL'],
    NIK: ['nik', 'NIK'],
    NIS: ['nis', 'NIS'],
    Kelas: ['kelas', 'Kelas'],
    ID: ['id', 'ID'],

    // Jurusan
    Kode: ['kode', 'Kode'],
    Nama_Jurusan: ['nama', 'namaJurusan', 'nama_jurusan', 'Nama_Jurusan'],
    Nama_Kakomli: ['namaKakomli', 'nama_kakomli', 'Nama_Kakomli'],
    NIP_Kakomli: ['nipKakomli', 'nip_kakomli', 'NIP_Kakomli'],
    Kontak_WA: ['kontakWA', 'kontakWa', 'kontak_wa', 'Kontak_WA', 'noWa', 'no_wa'],
    Kuota_Siswa: ['kuotaSiswa', 'kuota_siswa', 'Kuota_Siswa'],
    Total_Terdaftar: ['totalTerdaftar', 'total_terdaftar', 'Total_Terdaftar'],

    // Kelas
    Nama_Kelas: ['namaKelas', 'nama_kelas', 'Nama_Kelas'],
    Jurusan: ['jurusan', 'Jurusan'],
    Tingkat: ['tingkat', 'Tingkat'],
    Wali_Kelas: ['waliKelas', 'wali_kelas', 'Wali_Kelas'],
    Kontak_Walas: ['kontakWalas', 'kontak_walas', 'Kontak_Walas'],
    Jumlah_Siswa: ['jumlahSiswa', 'jumlah_siswa', 'Jumlah_Siswa'],

    // DUDI
    Nama_DUDI: ['namaDudi', 'nama_dudi', 'Nama_DUDI', 'nama'],
    Bidang_Keahlian: ['bidangKeahlian', 'bidang_keahlian', 'Bidang_Keahlian'],
    Alamat: ['alamat', 'Alamat'],
    Wilayah_Kota: ['wilayahKota', 'wilayah_kota', 'Wilayah_Kota'],
    Nama_Pemimpin: ['namaPemimpin', 'nama_pemimpin', 'Nama_Pemimpin', 'pimpinan'],
    Nama_PIC: ['namaPic', 'nama_pic', 'Nama_PIC'],
    Kontak_PIC: ['kontakPic', 'kontak_pic', 'Kontak_PIC'],
    No_Telp_DUDI: ['noTelpDudi', 'no_telp_dudi', 'No_Telp_DUDI', 'teleponDudi'],
    Kuota_Maksimal: ['kuotaMaksimal', 'kuota_maksimal', 'Kuota_Maksimal'],
    Terisi: ['terisi', 'Terisi'],
    Status_Kerjasama: ['statusKerjasama', 'status_kerjasama', 'Status_Kerjasama'],

    // Guru
    NIP: ['nip', 'NIP'],
    Email_Google: ['email', 'emailGoogle', 'email_google', 'Email_Google'],
    Peran_Utama: ['peranUtama', 'peran_utama', 'Peran_Utama'],
    Jumlah_Bimbingan: ['jumlahBimbingan', 'jumlah_bimbingan', 'Jumlah_Bimbingan'],
    PIN: ['pin', 'PIN', 'Pin'],

    // Pengajuan
    No_Pengajuan: ['noPengajuan', 'no_pengajuan', 'No_Pengajuan', 'id'],
    Timestamp: ['timestamp', 'Timestamp'],
    Nama_Siswa: ['namaSiswa', 'nama_siswa', 'Nama_Siswa', 'nama'],
    DUDI_Tujuan: ['dudiTujuan', 'dudi_tujuan', 'DUDI_Tujuan'],
    Alamat_DUDI: ['alamatDudi', 'alamat_dudi', 'Alamat_DUDI', 'alamat'],
    Bidang_Pekerjaan: ['bidangPekerjaan', 'bidang_pekerjaan', 'Bidang_Pekerjaan'],
    No_WA: ['noWa', 'no_wa', 'No_WA', 'kontakWA'],
    Status_Kakomli: ['statusKakomli', 'status_kakomli', 'Status_Kakomli'],
    Catatan_Kakomli: ['catatanKakomli', 'catatan_kakomli', 'Catatan_Kakomli'],
    Status_Hubin: ['statusHubin', 'status_hubin', 'Status_Hubin'],
    Guru_Pendamping: ['guruPendamping', 'guru_pendamping', 'Guru_Pendamping'],
    Tgl_Berangkat: ['tanggalBerangkat', 'tglBerangkat', 'tgl_berangkat', 'Tgl_Berangkat'],

    // Perizinan PKL
    ID_Perizinan: ['noPerizinan', 'idPerizinan', 'id_perizinan', 'ID_Perizinan', 'id'],
    Status_Izin_Ortu: ['statusIzinOrtu', 'status_izin_ortu', 'Status_Izin_Ortu'],
    No_Surat_Permohonan: ['noSuratPermohonan', 'no_surat_permohonan', 'No_Surat_Permohonan'],
    Tgl_Kirim_Surat: ['tanggalKirimSurat', 'tglKirimSurat', 'tgl_kirim_surat', 'Tgl_Kirim_Surat'],
    Status_Balasan_DUDI: ['statusBalasanDudi', 'status_balasan_dudi', 'Status_Balasan_DUDI'],
    Tgl_Balasan: ['tanggalBalasan', 'tglBalasan', 'tgl_balasan', 'Tgl_Balasan'],
    Catatan_Perizinan: ['catatanPerizinan', 'catatan_perizinan', 'Catatan_Perizinan'],
    Link_Bukti_Balasan: ['linkBuktiBalasan', 'link_bukti_balasan', 'Link_Bukti_Balasan'],

    // Plotting / Data Siswa PKL
    ID_Penempatan: ['idPenempatan', 'id_penempatan', 'ID_Penempatan', 'id'],
    ID_DUDI: ['idDudi', 'id_dudi', 'ID_DUDI'],
    ID_Guru_Pendamping: ['idGuruPendamping', 'id_guru_pendamping', 'ID_Guru_Pendamping'],
    Tanggal_Berangkat: ['tanggalBerangkat', 'tanggal_berangkat', 'Tanggal_Berangkat', 'tglBerangkat'],
    Tanggal_Rencana_Tarik: ['tanggalRencanaTarik', 'tanggal_rencana_tarik', 'Tanggal_Rencana_Tarik'],
    Status_Penempatan: ['statusPenempatan', 'status_penempatan', 'Status_Penempatan'],

    // Monitoring
    ID_Monitoring: ['idMonitoring', 'id_monitoring', 'ID_Monitoring', 'id'],
    Daftar_Siswa: ['daftarSiswa', 'daftar_siswa', 'Daftar_Siswa'],
    Tahap: ['tahap', 'Tahap'],
    Tanggal_Kunjungan: ['tanggalKunjungan', 'tanggal_kunjungan', 'Tanggal_Kunjungan'],
    Sakit: ['sakit', 'Sakit'],
    Izin: ['izin', 'Izin'],
    Alpha: ['alpha', 'alfa', 'Alpha'],
    Nilai_PKL_Muncul: ['nilaiPklMuncul', 'nilai_pkl_muncul', 'Nilai_PKL_Muncul'],
    // Monitoring & Sertifikat Nilai (4 Kategori DUDI + Rata-rata)
    Nilai_K3LH: ['nilaiK3lh', 'nilai_k3lh', 'Nilai_K3LH'],
    Nilai_Softskills: ['nilaiSoftskill', 'nilaiSoftskills', 'nilai_softskills', 'nilai_softskill', 'Nilai_Softskills', 'Nilai_Softskill'],
    Nilai_Softskill: ['nilaiSoftskill', 'nilaiSoftskills', 'nilai_softskill', 'nilai_softskills', 'Nilai_Softskill', 'Nilai_Softskills'],
    Nilai_Hardskills: ['nilaiKompetensiTeknis', 'nilaiHardskills', 'nilai_hardskills', 'nilai_kompetensi_teknis', 'Nilai_Hardskills', 'Nilai_Kompetensi_Teknis'],
    Nilai_Kompetensi_Teknis: ['nilaiKompetensiTeknis', 'nilaiHardskills', 'nilai_kompetensi_teknis', 'nilai_hardskills', 'Nilai_Kompetensi_Teknis', 'Nilai_Hardskills'],
    Nilai_Alur_Bisnis_Dunia_Kerja: ['nilaiAlurBisnis', 'nilaiAlurBisnisDuniaKerja', 'nilai_alur_bisnis_dunia_kerja', 'nilai_alur_bisnis', 'Nilai_Alur_Bisnis_Dunia_Kerja', 'Nilai_Alur_Bisnis'],
    Nilai_Alur_Bisnis: ['nilaiAlurBisnis', 'nilaiAlurBisnisDuniaKerja', 'nilai_alur_bisnis', 'nilai_alur_bisnis_dunia_kerja', 'Nilai_Alur_Bisnis', 'Nilai_Alur_Bisnis_Dunia_Kerja'],
    Nilai_rata_rata: ['nilaiRataRata', 'nilaiDudi', 'nilaiAkhir', 'nilai_rata_rata', 'Nilai_rata_rata', 'Nilai_Rata_Rata', 'Nilai_DUDI', 'Nilai_Akhir'],
    Nilai_Rata_Rata: ['nilaiRataRata', 'nilaiDudi', 'nilaiAkhir', 'nilai_rata_rata', 'Nilai_Rata_Rata', 'Nilai_rata_rata', 'Nilai_DUDI', 'Nilai_Akhir'],
    Catatan_Kunjungan: ['catatanKunjungan', 'catatan_kunjungan', 'Catatan_Kunjungan'],
    Foto_Bukti_Drive: ['fotoBuktiUrl', 'fotoBuktiDrive', 'foto_bukti_drive', 'Foto_Bukti_Drive'],
    Nilai_DUDI_Terkumpul: ['nilaiDudiTerkumpul', 'nilai_dudi_terkumpul', 'Nilai_DUDI_Terkumpul'],
    Blangko_Sertifikat_Bawa: ['blangkoSertifikatBawa', 'blangko_sertifikat_bawa', 'Blangko_Sertifikat_Bawa'],
    Status_Tahap: ['statusTahap', 'status_tahap', 'Status_Tahap'],

    // Sertifikat & Blangko
    Predikat: ['predikat', 'Predikat'],
    No_Seri_Blangko: ['noSeriBlangko', 'no_seri_blangko', 'No_Seri_Blangko'],
    Status_Blangko: ['statusBlangko', 'status_blangko', 'Status_Blangko'],
    Status_Raport: ['statusRaport', 'status_raport', 'Status_Raport'],
    Tgl_Terbit: ['tanggalTerbit', 'tglTerbit', 'tgl_terbit', 'Tgl_Terbit'],
  };

  private static readonly PRIMARY_ID_HEADER_BY_SHEET: Record<string, string> = {
    Master_Siswa_XI: 'ID',
    Master_Siswa: 'ID',
    Master_Jurusan: 'ID',
    Master_Kelas_Walas: 'ID',
    Master_DUDI: 'ID',
    Master_Guru_Pendamping: 'ID',
    Data_Pengajuan_PKL: 'No_Pengajuan',
    Data_Perizinan_PKL: 'ID_Perizinan',
    Plotting_Pemberangkatan: 'ID_Penempatan',
    Monitoring_5_Tahap: 'ID_Monitoring',
    Nilai_Dan_Sertifikat: 'ID_Penempatan',
    Master_Akun: 'ID',
  };

  private static normalizeKey(key: string): string {
    return String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  public static stripSyntheticRowSuffix(rawId: unknown): { cleanId: string; hintedRowNumber?: number } {
    const str = String(rawId ?? '').trim();
    if (!str) return { cleanId: '' };

    const hashMatch = str.match(/^(.*)#r(\d+)$/);
    if (hashMatch) {
      return {
        cleanId: hashMatch[1].trim(),
        hintedRowNumber: Number(hashMatch[2]),
      };
    }

    const rowPlaceholder = str.match(/^row_(\d+)$/);
    if (rowPlaceholder) {
      return {
        cleanId: '',
        hintedRowNumber: Number(rowPlaceholder[1]),
      };
    }

    return { cleanId: str };
  }

  public getHeadersForSheet(sheetName: string): string[] {
    const blueprint = HUBIN_SHEETS_BLUEPRINT.find((b) => b.sheetName === sheetName);
    if (blueprint) return blueprint.headers;
    if (sheetName === 'Master_Siswa') {
      const siswaBp = HUBIN_SHEETS_BLUEPRINT.find((b) => b.sheetName === 'Master_Siswa_XI');
      if (siswaBp) return siswaBp.headers;
    }
    return ['id'];
  }

  private formatCellValue(val: any): string | number {
    if (typeof val === 'boolean') {
      return val ? 'Ya' : 'Belum';
    }
    if (typeof val === 'number') {
      return Number.isFinite(val) ? val : '';
    }
    return String(val ?? '');
  }

  /**
   * Synchronizes canonical spreadsheet column keys (from blueprint headers)
   * with camelCase / aliased domain keys so GAS always reads the latest edited values
   * instead of stale raw column properties copied from memoryData.
   */
  public prepareOutgoingRecord(
    sheetName: string,
    record: Record<string, any>,
    updatedKeys?: Iterable<string>
  ): Record<string, any> {
    if (!record || typeof record !== 'object') return record;

    const out: Record<string, any> = { ...record };
    const { cleanId, hintedRowNumber } = GoogleDriveSheetService.stripSyntheticRowSuffix(out.id);
    const sheetRowNumber =
      typeof out._sheetRowNumber === 'number' && out._sheetRowNumber >= 2
        ? out._sheetRowNumber
        : hintedRowNumber;

    if (sheetRowNumber && sheetRowNumber >= 2) {
      out._sheetRowNumber = sheetRowNumber;
    }

    const updatedNormalized = new Set<string>();
    if (updatedKeys) {
      for (const k of updatedKeys) {
        if (k === 'id' || k === '_sheetRowNumber') continue;
        updatedNormalized.add(GoogleDriveSheetService.normalizeKey(k));
        // Add any header aliases whose camelCase matches k
        for (const [header, aliases] of Object.entries(GoogleDriveSheetService.FIELD_ALIASES)) {
          const allForms = [header, ...aliases].map((f) => GoogleDriveSheetService.normalizeKey(f));
          if (allForms.includes(GoogleDriveSheetService.normalizeKey(k))) {
            allForms.forEach((f) => updatedNormalized.add(f));
          }
        }
      }
    }

    const blueprintHeaders = this.getHeadersForSheet(sheetName);
    const allRecordKeys = Object.keys(out);

    for (const header of blueprintHeaders) {
      const aliases = GoogleDriveSheetService.FIELD_ALIASES[header] || [];
      const cleanHeader = GoogleDriveSheetService.normalizeKey(header);
      const isFieldUpdated = updatedNormalized.has(cleanHeader);

      let chosenVal: any = undefined;
      if (isFieldUpdated) {
        // When a field is in `updates`, prefer camelCase/alias keys over stale raw header key first
        for (const alias of aliases) {
          if (out[alias] !== undefined && out[alias] !== null) {
            chosenVal = out[alias];
            break;
          }
        }
        if (chosenVal === undefined) {
          for (const recKey of allRecordKeys) {
            if (
              recKey !== header &&
              GoogleDriveSheetService.normalizeKey(recKey) === cleanHeader &&
              out[recKey] !== undefined &&
              out[recKey] !== null
            ) {
              chosenVal = out[recKey];
              break;
            }
          }
        }
        if (chosenVal === undefined && out[header] !== undefined) {
          chosenVal = out[header];
        }
      } else {
        // Not explicitly in `updates`: prefer non-empty across aliases or raw header
        const candidates = [header, ...aliases];
        for (const keyName of candidates) {
          const v = out[keyName];
          if (v !== undefined && v !== null && String(v).trim() !== '') {
            chosenVal = v;
            break;
          }
        }
        if (chosenVal === undefined) {
          for (const keyName of candidates) {
            if (out[keyName] !== undefined && out[keyName] !== null) {
              chosenVal = out[keyName];
              break;
            }
          }
        }
      }

      if (chosenVal !== undefined) {
        const formatted = this.formatCellValue(chosenVal);
        out[header] = formatted;
        // Also keep legacy/variant header aliases in sync so older/custom sheet headers receive updates too
        for (const alias of aliases) {
          if (alias.includes('_')) {
            out[alias] = formatted;
          }
        }
      }
    }

    const primaryIdHeader = GoogleDriveSheetService.PRIMARY_ID_HEADER_BY_SHEET[sheetName] || 'ID';
    if (cleanId && (!out[primaryIdHeader] || String(out[primaryIdHeader]).includes('#r'))) {
      out[primaryIdHeader] = cleanId;
    }

    return out;
  }

  /**
   * Merges partial updates into an existing base record while stripping conflicting
   * raw spreadsheet header keys so updated domain values always win.
   */
  public applyUpdatesAndPrepareRecord(
    sheetName: string,
    baseRecord: Record<string, any>,
    updates: Record<string, any>
  ): Record<string, any> {
    const cleanBase: Record<string, any> = { ...baseRecord };
    const updatedKeys = Object.keys(updates || {});
    const updatedNorms = new Set<string>();

    for (const k of updatedKeys) {
      updatedNorms.add(GoogleDriveSheetService.normalizeKey(k));
      for (const [header, aliases] of Object.entries(GoogleDriveSheetService.FIELD_ALIASES)) {
        const forms = [header, ...aliases].map((f) => GoogleDriveSheetService.normalizeKey(f));
        if (forms.includes(GoogleDriveSheetService.normalizeKey(k))) {
          forms.forEach((f) => updatedNorms.add(f));
        }
      }
    }

    // Remove old raw/aliased keys belonging to any updated field before merging
    for (const baseKey of Object.keys(cleanBase)) {
      if (baseKey === 'id' || baseKey === '_sheetRowNumber') continue;
      if (updatedNorms.has(GoogleDriveSheetService.normalizeKey(baseKey))) {
        delete cleanBase[baseKey];
      }
    }

    const merged = {
      ...cleanBase,
      ...updates,
    };

    // Preserve original internal row locator and unique client row id
    if (baseRecord._sheetRowNumber && !merged._sheetRowNumber) {
      merged._sheetRowNumber = baseRecord._sheetRowNumber;
    }
    if (baseRecord.id && !updates.id) {
      merged.id = baseRecord.id;
    }

    return this.prepareOutgoingRecord(sheetName, merged, updatedKeys);
  }

  public recordToRow(headers: string[], record: any): any[] {
    return headers.map((header) => {
      if (record[header] !== undefined && record[header] !== null) {
        return this.formatCellValue(record[header]);
      }

      const aliases = GoogleDriveSheetService.FIELD_ALIASES[header] || [];
      for (const alias of aliases) {
        if (record[alias] !== undefined && record[alias] !== null) {
          return this.formatCellValue(record[alias]);
        }
      }

      const cleanHeader = header.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const recKey of Object.keys(record)) {
        const cleanKey = recKey.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanKey === cleanHeader && record[recKey] !== undefined && record[recKey] !== null) {
          return this.formatCellValue(record[recKey]);
        }
      }

      return '';
    });
  }

  public rowToRecord(_sheetName: string, headers: string[], rowValues: any[], rowIndex: number = 0): any {
    const record: any = {};

    headers.forEach((header, idx) => {
      if (header === '_sheetRowNumber') return;
      const cellVal = rowValues[idx] !== undefined && rowValues[idx] !== null ? rowValues[idx] : '';
      const aliases = GoogleDriveSheetService.FIELD_ALIASES[header] || [];
      const primaryKey = aliases[0] || header.charAt(0).toLowerCase() + header.slice(1);
      const upperHeader = header.toUpperCase();

      let parsedVal: any = cellVal;
      if (typeof cellVal === 'string') {
        const lower = cellVal.trim().toLowerCase();
        if (lower === 'ya' || lower === 'true') parsedVal = true;
        else if (lower === 'belum' || lower === 'false') parsedVal = false;
        else if (
          !isNaN(Number(cellVal)) &&
          cellVal.trim() !== '' &&
          !upperHeader.includes('NIS') &&
          !upperHeader.includes('NIK') &&
          !upperHeader.includes('NO_') &&
          !upperHeader.includes('KONTAK') &&
          !upperHeader.includes('HP') &&
          !upperHeader.includes('NIP') &&
          !upperHeader.includes('PIN') &&
          !upperHeader.includes('TELEPON')
        ) {
          parsedVal = Number(cellVal);
        }
      }

      if (record[primaryKey] === undefined || record[primaryKey] === '' || parsedVal !== '') {
        record[primaryKey] = parsedVal;
      }
      record[header] = cellVal;
    });

    const sheetRowNum = rowIndex + 2;
    record._sheetRowNumber = sheetRowNum;

    if (!record.id) {
      record.id =
        record.ID ||
        record.No_Pengajuan ||
        record.noPengajuan ||
        record.ID_Perizinan ||
        record.noPerizinan ||
        record.ID_Penempatan ||
        record.idPenempatan ||
        record.ID_Monitoring ||
        record.idMonitoring ||
        record.NIS ||
        record.nis ||
        `row_${sheetRowNum}`;
    }

    return record;
  }

  /**
   * Normalizes raw row objects returned by GAS Web App / Server Proxy
   * into the exact same typed/aliased record shape used by all UI modules.
   */
  public normalizeExternalRows(sheetName: string, rawRows: any[]): any[] {
    if (!Array.isArray(rawRows) || rawRows.length === 0) return [];
    const seenIds = new Set<string>();
    const blueprintHeaders = this.getHeadersForSheet(sheetName);

    return rawRows
      .filter((raw) => raw && typeof raw === 'object')
      .map((raw, idx) => {
        const dynamicKeys = Object.keys(raw).filter((k) => k !== '_sheetRowNumber');
        const headerSet = new Set<string>(blueprintHeaders);
        dynamicKeys.forEach((k) => headerSet.add(k));
        const headers = Array.from(headerSet);

        const rowValues = headers.map((header) => {
          if (raw[header] !== undefined && raw[header] !== null) return raw[header];
          const aliases = GoogleDriveSheetService.FIELD_ALIASES[header] || [];
          for (const alias of aliases) {
            if (raw[alias] !== undefined && raw[alias] !== null) return raw[alias];
          }
          const cleanHeader = header.toLowerCase().replace(/[^a-z0-9]/g, '');
          for (const recKey of dynamicKeys) {
            if (
              recKey.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanHeader &&
              raw[recKey] !== undefined &&
              raw[recKey] !== null
            ) {
              return raw[recKey];
            }
          }
          return '';
        });

        const resolvedRowIndex =
          typeof raw._sheetRowNumber === 'number' && raw._sheetRowNumber >= 2
            ? raw._sheetRowNumber - 2
            : idx;

        const rec = this.rowToRecord(sheetName, headers, rowValues, resolvedRowIndex);
        const sheetRowNumber =
          typeof raw._sheetRowNumber === 'number' && raw._sheetRowNumber >= 2
            ? raw._sheetRowNumber
            : resolvedRowIndex + 2;
        rec._sheetRowNumber = sheetRowNumber;

        const baseId = String(rec.id || `row_${sheetRowNumber}`);
        if (seenIds.has(baseId)) {
          rec.id = `${baseId}#r${sheetRowNumber}`;
        } else {
          rec.id = baseId;
        }
        seenIds.add(rec.id);
        return rec;
      });
  }
}
