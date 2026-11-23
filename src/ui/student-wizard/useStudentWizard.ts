import React, { useState, useEffect, useMemo } from 'react';
import { GoogleSheetClient } from '../../core/GoogleSheetClient';
import { PublicPortalClient } from '../../core/PublicPortalClient';
import { ToastManager } from '../../core/ToastManager';
import { useUnloadGuard } from '../../hooks/useUnloadGuard';
import { formatNisVisual, stripNisSymbols } from '../../core/utils/nisHelpers';
import { validateGoogleMapsUrl } from '../../core/utils/mapsHelpers';

const STUDENT_DRAFT_KEY = 'hubin_student_pengajuan_draft_v1';

export function useStudentWizard(isOpen: boolean) {
  const activeYear = GoogleSheetClient.getInstance().getActiveYear();

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Step 1: NIS Search & Identity Confirmation
  const [nisInput, setNisInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [studentData, setStudentData] = useState<any>(null);
  const [searchError, setSearchError] = useState('');
  const [identityStatus, setIdentityStatus] = useState<'pending' | 'confirmed' | 'mismatch'>('pending');

  // Step 2: Student & Parent Bio
  const [telepon, setTelepon] = useState('');
  const [alamatDomisili, setAlamatDomisili] = useState('');
  const [namaOrtu, setNamaOrtu] = useState('');
  const [teleponOrtu, setTeleponOrtu] = useState('');
  const [bioError, setBioError] = useState('');

  // Step 3: DUDI Selection + Bio DUDI + Link Google Maps
  const [dudiList, setDudiList] = useState<any[]>([]);
  const [loadingDudi, setLoadingDudi] = useState(false);
  const [dudiLoadError, setDudiLoadError] = useState('');
  const [selectedDudiId, setSelectedDudiId] = useState('');
  const [isDudiUnregistered, setIsDudiUnregistered] = useState(false);
  const [selectedDudiMeta, setSelectedDudiMeta] = useState<any>(null);
  const [customDudiName, setCustomDudiName] = useState('');
  const [customDudiAddress, setCustomDudiAddress] = useState('');
  const [customDudiField, setCustomDudiField] = useState('');
  const [linkMaps, setLinkMaps] = useState('');

  const mapsValidation = useMemo(
    () => (linkMaps.trim() ? validateGoogleMapsUrl(linkMaps) : null),
    [linkMaps]
  );

  // Submission State
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submissionResult, setSubmissionResult] = useState<any>(null);

  useUnloadGuard(submitting);

  const loadDudiList = async () => {
    setLoadingDudi(true);
    setDudiLoadError('');
    try {
      const json = await PublicPortalClient.getDudiList({
        onUpdate: (freshJson) => {
          if (freshJson?.success && Array.isArray(freshJson.data)) {
            setDudiList(freshJson.data);
          }
        },
      });
      if (!json.success) {
        const msg = 'Gagal membaca daftar DUDI dari Cloud Server.';
        setDudiList([]);
        setDudiLoadError(msg);
        ToastManager.getInstance().show('Gagal Memuat DUDI', 'error', msg);
        return;
      }
      setDudiList(Array.isArray(json.data) ? json.data : []);
    } catch (e: any) {
      const msg = e?.message || 'Tidak dapat terhubung ke Cloud Server.';
      setDudiList([]);
      setDudiLoadError(msg);
      ToastManager.getInstance().show('Gagal Memuat DUDI', 'error', msg);
    } finally {
      setLoadingDudi(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void loadDudiList();
      try {
        const rawDraft = localStorage.getItem(STUDENT_DRAFT_KEY);
        if (rawDraft && !submissionResult) {
          const parsed = JSON.parse(rawDraft);
          if (parsed && parsed.nisInput) {
            setNisInput(String(parsed.nisInput || ''));
            if (parsed.studentData) setStudentData(parsed.studentData);
            if (parsed.identityStatus) setIdentityStatus(parsed.identityStatus);
            if (parsed.currentStep) setCurrentStep(parsed.currentStep);
            if (parsed.telepon) setTelepon(String(parsed.telepon));
            if (parsed.alamatDomisili) setAlamatDomisili(String(parsed.alamatDomisili));
            if (parsed.namaOrtu) setNamaOrtu(String(parsed.namaOrtu));
            if (parsed.teleponOrtu) setTeleponOrtu(String(parsed.teleponOrtu));
            if (parsed.selectedDudiId) setSelectedDudiId(String(parsed.selectedDudiId));
            if (typeof parsed.isDudiUnregistered === 'boolean') {
              setIsDudiUnregistered(parsed.isDudiUnregistered);
            }
            if (parsed.selectedDudiMeta) setSelectedDudiMeta(parsed.selectedDudiMeta);
            if (parsed.customDudiName) setCustomDudiName(String(parsed.customDudiName));
            if (parsed.customDudiAddress) setCustomDudiAddress(String(parsed.customDudiAddress));
            if (parsed.customDudiField) setCustomDudiField(String(parsed.customDudiField));
            if (parsed.linkMaps) setLinkMaps(String(parsed.linkMaps));
          }
        }
      } catch {
        // Ignore malformed draft
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || submissionResult) return;
    if (!nisInput && !studentData && !telepon && !selectedDudiId) return;
    try {
      localStorage.setItem(
        STUDENT_DRAFT_KEY,
        JSON.stringify({
          currentStep,
          nisInput,
          studentData,
          identityStatus,
          telepon,
          alamatDomisili,
          namaOrtu,
          teleponOrtu,
          selectedDudiId,
          isDudiUnregistered,
          selectedDudiMeta,
          customDudiName,
          customDudiAddress,
          customDudiField,
          linkMaps,
          updatedAt: Date.now(),
        })
      );
    } catch {
      // Ignore storage quota issues
    }
  }, [
    isOpen,
    submissionResult,
    currentStep,
    nisInput,
    studentData,
    identityStatus,
    telepon,
    alamatDomisili,
    namaOrtu,
    teleponOrtu,
    selectedDudiId,
    isDudiUnregistered,
    selectedDudiMeta,
    customDudiName,
    customDudiAddress,
    customDudiField,
    linkMaps,
  ]);

  const clearDraft = () => {
    try {
      localStorage.removeItem(STUDENT_DRAFT_KEY);
    } catch {
      // ignore
    }
  };

  const resetForm = () => {
    clearDraft();
    setCurrentStep(1);
    setNisInput('');
    setStudentData(null);
    setSearchError('');
    setIdentityStatus('pending');
    setTelepon('');
    setAlamatDomisili('');
    setNamaOrtu('');
    setTeleponOrtu('');
    setBioError('');
    setSelectedDudiId('');
    setIsDudiUnregistered(false);
    setSelectedDudiMeta(null);
    setCustomDudiName('');
    setCustomDudiAddress('');
    setCustomDudiField('');
    setLinkMaps('');
    setSubmitError('');
    setSubmissionResult(null);
  };

  const handleLookupNis = async (nisToSearch?: string) => {
    const nis = stripNisSymbols(nisToSearch ?? nisInput);
    if (!nis) {
      setSearchError('Silakan masukkan NIS (angka saja) terlebih dahulu.');
      return;
    }

    setSearching(true);
    setSearchError('');
    setStudentData(null);
    setIdentityStatus('pending');

    try {
      const json = await PublicPortalClient.lookupStudentByNis(nis);

      if (!json.success) {
        const msg = json.message || 'Gagal mengakses data siswa di Cloud Server.';
        setSearchError(msg);
        ToastManager.getInstance().show('Gagal Mencari NIS', 'error', msg);
        return;
      }

      if (json.found && json.student) {
        setStudentData(json.student);
        setTelepon(json.student.telepon || '');
        setAlamatDomisili(json.student.alamat_domisili || '');
        setNamaOrtu(json.student.nama_wali || '');
        setTeleponOrtu(json.student.telepon_wali || '');
      } else {
        setSearchError(
          json.message ||
            `Siswa dengan NIS [${formatNisVisual(nis)}] tidak ditemukan di Database Sekolah.`
        );
      }
    } catch (e: any) {
      const msg = e?.message || 'Gagal mencari NIS. Periksa koneksi internet Anda.';
      setSearchError(msg);
      ToastManager.getInstance().show('Gagal Mencari NIS', 'error', msg);
    } finally {
      setSearching(false);
    }
  };

  const handleConfirmIdentity = (isMatch: boolean) => {
    if (isMatch) {
      setIdentityStatus('confirmed');
      setCurrentStep(2);
    } else {
      setIdentityStatus('mismatch');
    }
  };

  const handleValidateBioAndNext = () => {
    setBioError('');
    const waDigits = telepon.replace(/\D/g, '');
    const parentWaDigits = teleponOrtu.replace(/\D/g, '');

    if (!telepon.trim() || waDigits.length < 9) {
      setBioError('Nomor WhatsApp Siswa wajib diisi dengan benar (minimal 9 digit angka).');
      return;
    }
    if (!namaOrtu.trim()) {
      setBioError('Nama Orang Tua / Wali wajib diisi.');
      return;
    }
    if (!alamatDomisili.trim()) {
      setBioError('Alamat Domisili Siswa wajib diisi lengkap.');
      return;
    }
    if (!teleponOrtu.trim() || parentWaDigits.length < 9) {
      setBioError('Nomor Telepon / WhatsApp Orang Tua wajib diisi dengan benar (minimal 9 digit angka).');
      return;
    }

    setCurrentStep(3);
  };

  const handleDudiChange = (val: string) => {
    setSelectedDudiId(val);
    setSubmitError('');

    if (!val) {
      setIsDudiUnregistered(false);
      setSelectedDudiMeta(null);
      setCustomDudiName('');
      setCustomDudiAddress('');
      setCustomDudiField('');
      setLinkMaps('');
      return;
    }

    if (val === 'unregistered') {
      setIsDudiUnregistered(true);
      setSelectedDudiMeta(null);
      setCustomDudiName('');
      setCustomDudiAddress('');
      setCustomDudiField('');
      setLinkMaps('');
    } else {
      setIsDudiUnregistered(false);
      const chosen = dudiList.find((d) => d.id === val);
      setSelectedDudiMeta(chosen || null);
      if (chosen) {
        setCustomDudiName(chosen.nama_dudi || '');
        setCustomDudiAddress(chosen.alamat || chosen.kota || '');
        setCustomDudiField(chosen.bidang_usaha || '');
        setLinkMaps(chosen.link_maps || '');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    if (!studentData || identityStatus !== 'confirmed') {
      setCurrentStep(1);
      setSearchError('Harap cari NIS dan konfirmasi kesesuaian data terlebih dahulu.');
      return;
    }

    if (!selectedDudiId) {
      setSubmitError('Silakan pilih DUDI tujuan Anda.');
      return;
    }

    if (isDudiUnregistered && !customDudiName.trim()) {
      setSubmitError('Silakan ketik nama perusahaan / DUDI yang dituju.');
      return;
    }

    if (isDudiUnregistered && !customDudiAddress.trim()) {
      setSubmitError('Silakan ketik alamat lengkap perusahaan / DUDI.');
      return;
    }

    const mapsCheck = validateGoogleMapsUrl(linkMaps);
    if (!mapsCheck.valid) {
      setSubmitError(mapsCheck.error || 'Link Google Maps lokasi tempat PKL tidak valid.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        nis: stripNisSymbols(studentData.nis) || studentData.nis,
        nama: studentData.nama,
        kelas: studentData.kelas,
        jurusan: studentData.jurusan,
        telepon: telepon.trim(),
        alamat_domisili: alamatDomisili.trim(),
        nama_orang_tua: namaOrtu.trim(),
        telepon_orang_tua: teleponOrtu.trim(),
        dudi_id: isDudiUnregistered ? 'custom_hubin' : selectedDudiId,
        nama_dudi: customDudiName.trim(),
        alamat_dudi: customDudiAddress.trim(),
        bidang_dudi: customDudiField.trim() || '-',
        link_maps: mapsCheck.normalizedUrl,
        is_dudi_unregistered: isDudiUnregistered,
      };

      const json = await PublicPortalClient.submitApplication(payload);

      if (json.success && json.application) {
        clearDraft();
        setSubmissionResult({
          ...json.application,
          verifiedInSpreadsheet: json.verifiedInSpreadsheet !== false,
          sheetRowNumber: json.sheetRowNumber,
          savedAt: json.savedAt,
          deduplicated: json.deduplicated,
        });
      } else {
        setSubmitError(
          json.message || 'Gagal mengirim pengajuan ke Cloud Server. Hubungi Admin Hubin.'
        );
      }
    } catch (e: any) {
      setSubmitError(e?.message || 'Gagal mengirim pengajuan. Periksa koneksi internet Anda.');
    } finally {
      setSubmitting(false);
    }
  };

  return {
    activeYear,
    currentStep,
    setCurrentStep,
    nisInput,
    setNisInput,
    searching,
    studentData,
    setStudentData,
    searchError,
    setSearchError,
    identityStatus,
    setIdentityStatus,
    telepon,
    setTelepon,
    alamatDomisili,
    setAlamatDomisili,
    namaOrtu,
    setNamaOrtu,
    teleponOrtu,
    setTeleponOrtu,
    bioError,
    setBioError,
    dudiList,
    loadingDudi,
    dudiLoadError,
    selectedDudiId,
    isDudiUnregistered,
    selectedDudiMeta,
    customDudiName,
    setCustomDudiName,
    customDudiAddress,
    setCustomDudiAddress,
    customDudiField,
    setCustomDudiField,
    linkMaps,
    setLinkMaps,
    mapsValidation,
    submitting,
    submitError,
    setSubmitError,
    submissionResult,
    resetForm,
    handleLookupNis,
    handleConfirmIdentity,
    handleValidateBioAndNext,
    handleDudiChange,
    handleSubmit,
  };
}
