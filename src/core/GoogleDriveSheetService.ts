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
    Nilai_Softskill: ['nilaiSoftskill', 'nilai_softskill', 'Nilai_Softskill'],
    Nilai_Kompetensi_Teknis: ['nilaiKompetensiTeknis', 'nilai_kompetensi_teknis', 'Nilai_Kompetensi_Teknis'],
    Nilai_Alur_Bisnis: ['nilaiAlurBisnis', 'nilai_alur_bisnis', 'Nilai_Alur_Bisnis'],
    Nilai_Rata_Rata: ['nilaiRataRata', 'nilaiDudi', 'nilaiAkhir', 'nilai_rata_rata', 'Nilai_Rata_Rata', 'Nilai_DUDI', 'Nilai_Akhir'],
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
      return val;
    }
    return String(val ?? '');
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

      record[primaryKey] = parsedVal;
      record[header] = cellVal;
    });

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
        `row_${rowIndex + 2}`;
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
        const dynamicKeys = Object.keys(raw);
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

        const rec = this.rowToRecord(sheetName, headers, rowValues, idx);
        const baseId = String(rec.id || `row_${idx + 2}`);
        if (seenIds.has(baseId)) {
          rec.id = `${baseId}#r${idx + 2}`;
        } else {
          rec.id = baseId;
        }
        seenIds.add(rec.id);
        return rec;
      });
  }
}
