import React, { useEffect } from 'react';
import { FileText, Loader2, X } from 'lucide-react';
import { useStudentWizard } from './student-wizard/useStudentWizard';
import { WizardSuccessView } from './student-wizard/WizardSuccessView';
import { WizardStep1Identity } from './student-wizard/WizardStep1Identity';
import { WizardStep2Bio } from './student-wizard/WizardStep2Bio';
import { WizardStep3DudiMap } from './student-wizard/WizardStep3DudiMap';

interface StudentApplicationWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessOpenDocs?: (student: any) => void;
}

export const StudentApplicationWizard: React.FC<StudentApplicationWizardProps> = ({
  isOpen,
  onClose,
  onSuccessOpenDocs,
}) => {
  const wizard = useStudentWizard(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (wizard.submitting) {
          e.preventDefault();
          return;
        }
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, wizard.submitting, onClose]);

  if (!isOpen) return null;

  const handleSafeClose = () => {
    if (wizard.submitting) return;
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={handleSafeClose}
    >
      <div
        className="relative bg-white rounded-none sm:rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-2xl h-[100dvh] sm:h-auto sm:max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                Portal Pengajuan PKL Siswa Mandiri
              </h2>
              <p className="text-xs text-slate-500 truncate">
                Tahun Ajaran {wizard.activeYear} · Terhubung Cloud Server Sekolah
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={wizard.submitting}
            onClick={handleSafeClose}
            aria-label="Tutup portal pengajuan"
            className="min-w-[40px] min-h-[40px] rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {(wizard.searching || wizard.loadingDudi || wizard.submitting) && (
          <div
            className="progress-sweep-track shrink-0"
            role="progressbar"
            aria-label="Memproses data Cloud Server"
          >
            <div className="progress-sweep-bar" />
          </div>
        )}

        {/* Step Indicator */}
        {!wizard.submissionResult && (
          <div className="px-5 sm:px-6 py-3 bg-slate-50 border-b border-slate-200/70 flex items-center justify-between gap-2 text-xs font-semibold shrink-0 overflow-x-auto">
            <div
              className={`flex items-center gap-2 whitespace-nowrap ${
                wizard.currentStep === 1
                  ? 'text-blue-700 font-bold'
                  : wizard.identityStatus === 'confirmed'
                  ? 'text-emerald-700'
                  : 'text-slate-500'
              }`}
            >
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                  wizard.currentStep > 1 && wizard.identityStatus === 'confirmed'
                    ? 'bg-emerald-600 text-white'
                    : wizard.currentStep === 1
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {wizard.currentStep > 1 && wizard.identityStatus === 'confirmed' ? '✓' : '1'}
              </span>
              <span>Cek &amp; Konfirmasi NIS</span>
            </div>

            <span className="text-slate-300" aria-hidden="true">
              /
            </span>

            <div
              className={`flex items-center gap-2 whitespace-nowrap ${
                wizard.currentStep === 2
                  ? 'text-blue-700 font-bold'
                  : wizard.currentStep > 2
                  ? 'text-emerald-700'
                  : 'text-slate-400'
              }`}
            >
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                  wizard.currentStep > 2
                    ? 'bg-emerald-600 text-white'
                    : wizard.currentStep === 2
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {wizard.currentStep > 2 ? '✓' : '2'}
              </span>
              <span>Bio Siswa &amp; Ortu</span>
            </div>

            <span className="text-slate-300" aria-hidden="true">
              /
            </span>

            <div
              className={`flex items-center gap-2 whitespace-nowrap ${
                wizard.currentStep === 3 ? 'text-blue-700 font-bold' : 'text-slate-400'
              }`}
            >
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                  wizard.currentStep === 3
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                3
              </span>
              <span>Pilih &amp; Bio DUDI</span>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5">
          {wizard.submissionResult ? (
            <WizardSuccessView
              submissionResult={wizard.submissionResult}
              onSuccessOpenDocs={onSuccessOpenDocs}
              onClose={onClose}
              onResetForm={wizard.resetForm}
            />
          ) : (
            <form onSubmit={wizard.handleSubmit} className="space-y-5">
              {wizard.currentStep === 1 && (
                <WizardStep1Identity
                  nisInput={wizard.nisInput}
                  searching={wizard.searching}
                  studentData={wizard.studentData}
                  searchError={wizard.searchError}
                  identityStatus={wizard.identityStatus}
                  onChangeNis={(nextDigits) => {
                    wizard.setNisInput(nextDigits);
                    wizard.setSearchError('');
                  }}
                  onLookupNis={() => wizard.handleLookupNis()}
                  onConfirmIdentity={wizard.handleConfirmIdentity}
                  onResetSearch={() => {
                    wizard.setStudentData(null);
                    wizard.setIdentityStatus('pending');
                    wizard.setNisInput('');
                  }}
                />
              )}

              {wizard.currentStep === 2 && wizard.studentData && (
                <WizardStep2Bio
                  studentData={wizard.studentData}
                  telepon={wizard.telepon}
                  alamatDomisili={wizard.alamatDomisili}
                  namaOrtu={wizard.namaOrtu}
                  teleponOrtu={wizard.teleponOrtu}
                  bioError={wizard.bioError}
                  onChangeTelepon={(val) => {
                    wizard.setTelepon(val);
                    wizard.setBioError('');
                  }}
                  onChangeAlamatDomisili={(val) => {
                    wizard.setAlamatDomisili(val);
                    wizard.setBioError('');
                  }}
                  onChangeNamaOrtu={(val) => {
                    wizard.setNamaOrtu(val);
                    wizard.setBioError('');
                  }}
                  onChangeTeleponOrtu={(val) => {
                    wizard.setTeleponOrtu(val);
                    wizard.setBioError('');
                  }}
                  onBackToStep1={() => wizard.setCurrentStep(1)}
                  onNextStep={wizard.handleValidateBioAndNext}
                />
              )}

              {wizard.currentStep === 3 && wizard.studentData && (
                <WizardStep3DudiMap
                  dudiList={wizard.dudiList}
                  loadingDudi={wizard.loadingDudi}
                  dudiLoadError={wizard.dudiLoadError}
                  selectedDudiId={wizard.selectedDudiId}
                  isDudiUnregistered={wizard.isDudiUnregistered}
                  selectedDudiMeta={wizard.selectedDudiMeta}
                  customDudiName={wizard.customDudiName}
                  customDudiAddress={wizard.customDudiAddress}
                  customDudiField={wizard.customDudiField}
                  hariMulai={wizard.hariMulai}
                  hariSelesai={wizard.hariSelesai}
                  jamMulai={wizard.jamMulai}
                  jamSelesai={wizard.jamSelesai}
                  linkMaps={wizard.linkMaps}
                  mapsValidation={wizard.mapsValidation}
                  submitting={wizard.submitting}
                  submitError={wizard.submitError}
                  onSelectDudi={wizard.handleDudiChange}
                  onChangeCustomDudiName={wizard.setCustomDudiName}
                  onChangeCustomDudiAddress={wizard.setCustomDudiAddress}
                  onChangeCustomDudiField={wizard.setCustomDudiField}
                  onChangeHariMulai={(val) => {
                    wizard.setHariMulai(val);
                    wizard.setSubmitError('');
                  }}
                  onChangeHariSelesai={(val) => {
                    wizard.setHariSelesai(val);
                    wizard.setSubmitError('');
                  }}
                  onChangeJamMulai={(val) => {
                    wizard.setJamMulai(val);
                    wizard.setSubmitError('');
                  }}
                  onChangeJamSelesai={(val) => {
                    wizard.setJamSelesai(val);
                    wizard.setSubmitError('');
                  }}
                  onChangeLinkMaps={(val) => {
                    wizard.setLinkMaps(val);
                    wizard.setSubmitError('');
                  }}
                  onBackToStep2={() => wizard.setCurrentStep(2)}
                />
              )}
            </form>
          )}
        </div>
        {wizard.submitting && (
          <div
            role="status"
            aria-live="assertive"
            className="absolute inset-0 z-30 bg-white/90 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center space-y-4"
          >
            <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg">
              <Loader2 className="w-7 h-7 animate-spin" />
            </div>
            <div className="space-y-1.5 max-w-sm">
              <h3 className="text-sm sm:text-base font-bold text-slate-900">
                Sedang Menyimpan &amp; Memverifikasi ke Spreadsheet...
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Mohon tunggu sejenak dan <b>jangan tutup halaman atau browser Anda</b> sampai bukti konfirmasi resmi muncul.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
