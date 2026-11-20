# AGENTS.md — Arsitektur & Standarisasi Pengembangan SI-HUBIN SMK PGRI 2 Ponorogo

Dokumen ini merupakan **Single Source of Truth (SSOT)** untuk arsitektur sistem, pola desain (*Low-Code*, *Metadata-Driven*, *DRY*), aturan bisnis, struktur direktori modular, dan standar kualitas kode pada aplikasi **SI-HUBIN SMK PGRI 2 Ponorogo**. Setiap perubahan atau penambahan fitur wajib mengikuti seluruh aturan di bawah ini.

---

## 1. Aturan Kerja & Protokol Agen

1. **Periksa Arsitektur Sebelum Mengubah Kode**: Sebelum menulis atau memodifikasi kode, selalu periksa struktur modul, tipe domain (`src/core/types/`), registry (`src/core/moduleRegistry.ts`), helper utilitas (`src/core/utils/`), serta `security_spec.md` agar tidak membuat logika duplikat atau menyimpang dari standar.
2. **Mode Diskusi**: Jika pengguna mengetik `"kita diskusi"`, **dilarang membuat atau mengubah kode apa pun** sampai pengguna menyatakan `"diskusi selesai"`.
3. **Anti File Monolitik**: Dilarang menumpuk UI, transport jaringan, caching, dan logika domain dalam satu file besar. Komponen kompleks harus dipecah menjadi orkestrator ringkas + sub-modul domain/UI yang fokus.
4. **Zero Mock / Zero Static Data**: Seluruh data operasional berasal dari Google Spreadsheet (SSOT) melalui Backend Proxy atau fallback GAS langsung. Tidak boleh menggunakan data dummy/statis untuk siswa, DUDI, guru, pengajuan, monitoring, maupun nilai.

---

## 2. Arsitektur Sistem & Single Source of Truth (SSOT)

### 2.1 Lapisan Penyimpanan & Infrastruktur
- **Google Spreadsheet (SSOT Operasional)**: Menyimpan seluruh data operasional PKL (`Master_Jurusan`, `Master_Kelas_Walas`, `Master_DUDI`, `Master_Guru_Pendamping`, `Master_Siswa_XI`, `Data_Pengajuan_PKL`, `Data_Perizinan_PKL`, `Plotting_Pemberangkatan`, `Monitoring_5_Tahap`, `Nilai_Dan_Sertifikat`, `Master_Akun`).
- **Firestore (`src/core/firebase/`, `firestore.rules`, `security_spec.md`)**:
  - `/config/workspace`: Hanya menyimpan konfigurasi infrastruktur non-PII (`activeYear`, `spreadsheetId`, `spreadsheetName`, `spreadsheetUrl`, `driveFolderUrl`, `gasDeployUrl`, `academicYears` maks 20, `templates` maks 15, `monitoringStageControl`, `updatedBy`, `updatedAt`).
  - `/admins/{uid}`: Registry admin & peran RBAC (terisolasi, `allow list: false`, pencegahan *self-escalation*).
  - **Larangan Keras**: Data PII siswa, NIK, no HP, nilai, atau status PKL tidak boleh disimpan ke Firestore.
- **Google Apps Script (GAS Web App)**: Bertindak sebagai adapter baca/tulis Spreadsheet dan generator PDF (Surat Perizinan & Paket Monitoring Google Docs).

### 2.2 Arsitektur Dual-Mode Transport (Proxy + Static SPA Fallback)
- **Primary Path**: Client -> Express/Vercel Serverless (`/api/v1/*`, `/api/public/*`, `/api/admin/*`, `/api/perizinan/*`, `/api/documents/*`) -> GAS Web App.
- **Automatic Fallback Path**: Jika hosting statis SPA mengembalikan HTML untuk `/api/*` atau proxy tidak tersedia/mengalami error infrastruktur (`INFRA_ERROR_CODES`), klien (`PublicPortalClient` / `GoogleSheetClient`) otomatis beralih memanggil GAS Web App langsung menggunakan konfigurasi terhidrasi dari Firestore (`text/plain;charset=utf-8` untuk menghindari CORS preflight).
- **Catatan Timeout**: Jika backend mengembalikan `GAS_TIMEOUT` (HTTP 504), **jangan** mengulangi panggilan direct GAS ganda yang memperlambat kegagalan.

---

## 3. Arsitektur Low-Code, Metadata-Driven, & DRY

### 3.1 Metadata-Driven CRUD Engine
Penambahan atau penyesuaian modul admin standar tidak boleh membuat halaman CRUD manual dari nol:
1. Definisikan tipe entity di `src/core/types/schema.ts`.
2. Buat konfigurasi `ModuleMetadata<T>` di `src/modules/<modul>.meta.ts` (berisi `tableName`, `allowedRoles`, `statCards`, `fields` lengkap dengan `type`, `validation`, `relationSource`, `renderCell`, serta `bulkActions`/`customActions`).
3. Buat service singleton turunan `BaseRepository<T>` di `src/services/<Modul>Service.ts`.
4. Daftarkan modul di **dua SSOT registry**:
   - `src/core/moduleRegistry.ts` (`MODULE_REGISTRY`) — mengatur grup sidebar (`operasional` | `master`), label, ikon, izin peran, dan kapabilitas dokumen.
   - `src/core/constants/sheetResourceMap.ts` — mengatur pemetaan `moduleId ↔ REST resource ↔ Sheet Name`.
5. UI otomatis dirender oleh `ModulePage`, `DynamicDataGrid`, `DynamicFormModal`, `DynamicFilterModal`, `BulkActionModal`, `StatCards`, `Toolbar`, dan `ImportExcelModal` melalui hooks `useDataGrid` dan `useDynamicForm`.

### 3.2 Standar Tampilan Data
- **Default View Mode**: Tampilan daftar data pada `ModulePage` / `DynamicDataGrid` menggunakan **`card` sebagai tampilan default**, dengan opsi pergantian ke mode `table` melalui toolbar.

### 3.3 Prinsip DRY & Utilitas Terpusat
Selalu gunakan helper terpusat alih-alih menulis ulang parsing/validasi di komponen atau backend:
- `src/core/utils/rowFieldHelpers.ts`: `pickField`, `normalizeStr` (pembacaan kolom fleksibel lintas variasi nama header sheet).
- `src/core/utils/nisHelpers.ts`: `stripNisSymbols`, `formatNisVisual`, `formatNisInsideText` (konsistensi kanonik NIS).
- `src/core/utils/dateHelpers.ts`: `getTodayWibIsoDate`, `getTodayWibDateTime`, `getOffsetWibIsoDate`, `normalizeToIsoDate`, `formatIndonesianDate`, `formatPerizinanDateRange` (seluruh tanggal memakai zona waktu WIB).
- `src/core/utils/mapsHelpers.ts`: validasi & normalisasi URL Google Maps.
- `src/core/utils/monitoringHelpers.ts`: helper 8 tahap monitoring (`extractStageNumber`, `getStageValueByNumber`, `pickRecommendedStageForControl`, `buildStudentMonitoringSummary`, `calculateEqualWeightedAverage`, `getPredikatFromScore`, `stripStructuredTagsFromNote`).
- `src/core/utils/relationHelpers.ts`: normalisasi teks relasi & pengecekan status penempatan aktif (`isActivePlacementStatus`).
- `src/core/utils/autoIdHelpers.ts`: generator ID & normalisasi nomor WhatsApp (`normalizeWhatsAppNumber`, `isPhoneFieldKey`, `getWhatsAppHref`).
- `src/core/utils/safeFetchJson.ts`: wrapper fetch aman dari HTML response SPA, deteksi timeout, validasi URL GAS, dan deteksi proxy unavailable.
- `src/core/utils/xlsxGenerator.ts`: ekspor & template import Excel.

---

## 4. Struktur Direktori Modular (Pasca-Refactoring Tahap 1–3)

### 4.1 Frontend (`src/`)
- `src/App.tsx`: Orkestrator navigasi, sesi auth, lazy-loading halaman utama & modal.
- `src/core/`:
  - `BaseRepository.ts`: Abstraksi repository CRUD, query, filter, pagination, sync, dan cache lokal.
  - `GoogleSheetClient.ts`: Engine koneksi client, bootstrap multi-sheet, ETag, BroadcastChannel invalidation, dan sinkronisasi config Firestore.
  - `GoogleDriveSheetService.ts`: Normalisasi schema baris & pemetaan alias kolom Google Sheet (`FIELD_ALIASES`, `prepareOutgoingRecord`).
  - `PublicPortalClient.ts`: **Facade** ringkas portal publik & PDF generator; mendelegasikan detail ke `src/core/portal/`:
    - `portalTransport.ts`: Transport GAS langsung, cache sheet langsung (`DIRECT_SHEET_CACHE_TTL_MS`), `callPublicEndpoint`, dan `callAuthenticatedProxyWithGasAction`.
    - `portalSwrCache.ts`: Engine SWR + ETag + IndexedDB cache terpusat (`executeSwrCachedPublicList`, `invalidatePublicTeacherCaches`).
    - `portalGasFallback.ts`: Fallback direct GAS untuk operasi publik & deduplikasi `syncDudiContactFallback` / `upsertNilaiDanSertifikatFallback`.
  - `ToastManager.ts`: Sistem notifikasi non-blocking singleton (`AppleToastContainer`).
  - `auth/`: `GoogleAuthService.ts` (Firebase Auth), `LocalAccountAuthService.ts` (akun lokal via `Master_Akun`).
  - `cache/`: `IndexedDbSheetCache.ts` (persisten cache browser dengan sinkronisasi in-memory).
  - `firebase/`: `firebaseApp.ts`, `WorkspaceConfigStore.ts`.
  - `constants/`: `sheetResourceMap.ts`.
  - `types/`: `schema.ts`, `metadata.ts`, `sheetBlueprint.ts`.
  - `utils/`: Seluruh helper murni domain & format.
- `src/hooks/`: `useDataGrid.ts`, `useDynamicForm.ts`.
- `src/modules/`: Definisi metadata deklaratif (`*.meta.ts`) untuk 10 modul.
- `src/services/`: Repository service per modul (`*Service.ts`) + `RelationSyncService.ts` + `InitialData.ts`.
- `src/ui/`:
  - **Komponen Generik & Modal**: `ModulePage.tsx`, `DynamicDataGrid.tsx`, `DynamicFormModal.tsx`, `DynamicFilterModal.tsx`, `BulkActionModal.tsx`, `ImportExcelModal.tsx`, `StatCards.tsx`, `Toolbar.tsx`, `Navbar.tsx`, `Sidebar.tsx`, `AppleConfirmModal.tsx`, `AppleToastContainer.tsx`, `ImageCropperModal.tsx`.
  - **Portal Publik & Siswa**: `PublicLandingPage.tsx`, `StudentApplicationWizard.tsx`, `StudentGFormSimulatorModal.tsx`.
  - **Portal Monitoring Guru (Modular)** — `TeacherMonitoringPortal.tsx` (orkestrator) + `src/ui/monitoring-portal/`:
    - `types.ts`: Draft state, konstanta preset nilai (`[75, 80, 85, 90, 95]`), daftar 4 kategori nilai (`GRADE_CATEGORIES`), dan helper kelengkapan kontak DUDI (`isDudiContactIncomplete`).
    - `PinVerificationStep.tsx`: Langkah 1 pemilihan petugas & verifikasi PIN.
    - `DudiSelectionStep.tsx`: Langkah 2 daftar DUDI binaan & status kelengkapan kontak.
    - `DudiContactPopupModal.tsx`: Modal wajib pengisian pimpinan/PIC/telp DUDI + checkbox konfirmasi ejaan.
    - `MonitoringEntryStep.tsx`: Langkah 3 input supervisi, riwayat tahap, dan edit nilai siswa.
    - `GradeScoreEditorGrid.tsx`: Komponen *reusable* grid nilai 4 kategori (mode `initial` dan `edit`).
  - **Pusat Dokumen & Cetak (Modular)** — `DocumentHubPage.tsx` (orkestrator) + `src/ui/document-hub/`:
    - `documentHubConfig.ts`: Tipe `DocumentHubKey`, `DOC_META`, dedup penempatan by NIS, ekstraksi ID Google Docs, resolver link Maps.
    - `documentDataBuilders.ts`: Builder data murni (bundel per DUDI, paginasi cetak, filter metadata, audit & batch Surat Tugas).
    - `DocumentBodies.tsx`: Renderer preview/cetak per jenis dokumen (`BundlePageRenderer`, `SuratTugasMultiPreview`, `DocumentBodyRenderer`, `PreviewPaginationBar`).
    - `DocumentPickerSidebar.tsx`: Sidebar desktop & quick-select/modal checklist mobile.
    - `DocumentParametersModal.tsx`: Modal parameter nomor surat, tanggal surat, kepala sekolah, dan opsi cetak.
  - **Manajemen Workspace & Kontrol**: `WorkspaceHubPage.tsx`, `MonitoringStageControlModal.tsx`, `MonitoringRecapModal.tsx`, `SpreadsheetConfigModal.tsx`, `SetupWizardModal.tsx`, `GasScriptModal.tsx`, `AccountManagementModal.tsx`, `GoogleDocsPreviewModal.tsx`, `GoogleDocsTemplateManagerModal.tsx`, `DocumentPrintTemplates.tsx`, `PrintPortal.tsx`, `ResizablePaperPreview.tsx`, `QrCodeSvg.tsx`, `AutoGenerateSyncModal.tsx`.

### 4.2 Backend (`server.ts` & `server/`)
- `server.ts`: Entry point Express (port `3000`) dengan kompatibilitas Vercel Serverless (`isServerlessRuntime`), header `Cache-Control` (CDN edge cache untuk directory publik non-PII, `private` untuk `/api/v1/*`, `no-store` untuk mutasi), Vite dev middleware pada mode development, dan build output `api/_server.mjs`.
- `server/config/runtimeConfig.ts`: Konfigurasi runtime, Firebase, dan CORS/cache env.
- `server/routes/`:
  - `adminRoutes.ts`: Konfigurasi workspace, bootstrap multi-sheet, manajemen akun admin, dan invalidasi cache.
  - `restApiRoutes.ts`: REST CRUD `/api/v1/:resource` dengan validasi RBAC.
  - `publicPortalRoutes.ts`: Endpoint portal siswa, petugas monitoring, kontak DUDI, kontrol tahap monitoring, dan update nilai.
  - `documentRoutes.ts`: Proxy generasi PDF Surat Perizinan & Paket Monitoring Bundle.
- `server/services/`:
  - `adminAuthService.ts`: Verifikasi token Firebase ID / sesi lokal & otorisasi peran.
  - `monitoringDomainService.ts`: Aturan domain monitoring, validasi tahap, kalkulasi nilai rata-rata & predikat, sinkronisasi `Nilai_Dan_Sertifikat` & kontak DUDI.
  - `relationRecalculator.ts`: Rekalkulasi kuota DUDI (`Terisi`), jumlah bimbingan guru, dan status siswa.
  - `sheetsTransport.ts`: Transport server-to-GAS, cache in-memory server, ETag, dan pemetaan sheet.
- `server/utils/httpHelpers.ts`: Helper respons JSON standar dan error code terstruktur.

---

## 5. Aturan Domain & Keamanan Wajib

1. **8 Tahap Monitoring & Kontrol Kunci Tahap (`MonitoringStageControl`)**:
   - Tahap monitoring berjumlah **8 tahap**: `1. Pengantaran` s.d. `8. Penarikan` (didefinisikan di `MONITORING_STAGES` pada `schema.ts`).
   - Pengaturan kunci/buka tahap (`unlockedStages`, `requireSequential`, `lockedReason`) **hanya dapat diubah oleh role `SuperAdmin`** (melalui `MonitoringStageControlModal` dan aturan `/config/workspace`).
   - Baik frontend (`TeacherMonitoringPortal`), server (`monitoringDomainService`), maupun fallback direct (`portalGasFallback`) wajib menegakkan status kunci tahap dan aturan sekuensial (`requireSequential`).
2. **Validasi Wajib Kontak DUDI saat Monitoring**:
   - Jika data `Nama_Pemimpin`, `Nama_PIC`, atau `No_Telp_DUDI` pada DUDI binaan masih kosong/tidak lengkap (`isDudiContactIncomplete`), sistem wajib memunculkan popup (`DudiContactPopupModal`) agar petugas melengkapi data dan mencentang konfirmasi kebenaran data & ejaan (`spelling_confirmed`) sebelum melanjutkan pengisian monitoring, lalu menyinkronkannya ke `Master_DUDI` dan `Data_Pengajuan_PKL`.
3. **Plotting Guru Pendamping & Privasi Akun Siswa**:
   - Informasi plotting guru pendamping **tidak ditampilkan** pada portal/form pengajuan siswa karena plotting guru pendamping ditetapkan oleh Hubin/Kakomli setelah pengajuan.
4. **Kasus Siswa Pindah PKL & Durasi Habis**:
   - Penempatan dengan status `Dibatalkan`, `Batal`, atau `Pindah DUDI` tidak dihitung sebagai penempatan aktif pada rekap DUDI binaan, kuota `Terisi`, maupun daftar monitoring aktif (`isActivePlacementStatus`).
   - Kasus perpindahan DUDI atau penarikan/penyesuaian durasi dikelola melalui status penempatan (`Pindah DUDI`, `Selesai PKL`, `Tanggal_Rencana_Tarik`) pada modul Penempatan PKL & rekalkulasi relasi (`RelationSyncService` / `relationRecalculator`).
5. **Sinkronisasi Nilai PKL (4 Komponen Bobot Setara)**:
   - Nilai terdiri dari 4 komponen (`Nilai_K3LH`, `Nilai_Softskill`, `Nilai_Kompetensi_Teknis`, `Nilai_Alur_Bisnis`) dengan rata-rata berbobot setara via `calculateEqualWeightedAverage` dan predikat via `getPredikatFromScore`.
   - Saat nilai disimpan dari monitoring maupun edit nilai, sistem menyinkronkan ke `Monitoring_5_Tahap` dan melakukan *upsert* ke `Nilai_Dan_Sertifikat`.
6. **RBAC & Keamanan**:
   - Role terdaftar: `'SuperAdmin' | 'Hubin' | 'Kepsek' | 'Waka' | 'Pokja' | 'Kakomli' | 'GuruPendamping' | 'Siswa'`.
   - `SuperAdmin` selalu memiliki akses penuh terhadap seluruh modul di `MODULE_REGISTRY` serta pengaturan kunci tahap & registry admin.
   - Seluruh API key / kredensial sensitif tetap di sisi server (`server/`); tidak boleh ada UI input API key atau pembocoran rahasia di client bundle.

---

## 6. Standar Kode, Styling, & Verifikasi Wajib

1. **Bahasa & Runtime**:
   - TypeScript strict; seluruh `import` di top-level file; gunakan union types atau enum standar.
   - Jangan gunakan `window.alert`, `window.confirm`, atau `window.open` untuk interaksi utama — gunakan modal komponen (`AppleConfirmModal`) dan `ToastManager`.
2. **Styling**:
   - Gunakan **Tailwind CSS** (`src/index.css` via `@import "tailwindcss";`).
   - Dilarang membuat file CSS terpisah baru dan hindari *inline style* baru (kecuali atribut dinamis ukuran kertas cetak yang sudah ada di template cetak).
3. **Caching & Invalidation**:
   - Setiap operasi tulis (`CREATE`, `UPDATE`, `DELETE`) pada sheet wajib menginvalidasi cache relevan: `directSheetCache`, `GoogleSheetClient.invalidateClientSheetCache(sheetName)`, `invalidatePublicTeacherCaches`, dan endpoint `/api/cache/invalidate`.
4. **Checklist Verifikasi Sebelum Menyelesaikan Tugas**:
   - Jalankan `npm run lint` (`tsc --noEmit`) — **wajib exit 0 tanpa error**.
   - Jalankan `npm run build` (`vite build && npm run build:api`) — **wajib sukses membangun client + `api/_server.mjs`**.
   - Pastikan dev server berjalan sehat di port `3000`.
