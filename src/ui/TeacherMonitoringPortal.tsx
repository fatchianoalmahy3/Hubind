import React, { useEffect } from 'react';
import { Building2, ChevronRight, X } from 'lucide-react';
import { PinVerificationStep } from './monitoring-portal/PinVerificationStep';
import { DudiSelectionStep } from './monitoring-portal/DudiSelectionStep';
import { MonitoringEntryStep } from './monitoring-portal/MonitoringEntryStep';
import { DudiContactPopupModal } from './monitoring-portal/DudiContactPopupModal';
import { OfficerComplianceNoticeModal } from './monitoring-portal/OfficerComplianceNoticeModal';
import { MonitoringSaveSuccessModal } from './monitoring-portal/MonitoringSaveSuccessModal';
import { useTeacherMonitoring } from './monitoring-portal/useTeacherMonitoring';
import { CrudLoadingOverlay, TopProgressBar } from './CrudProgressFeedback';

interface TeacherMonitoringPortalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const TeacherMonitoringPortal: React.FC<TeacherMonitoringPortalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const m = useTeacherMonitoring(isOpen, onSuccess);
  const isSaveLocked = m.submitting || m.savingGradeEdit || m.savingPopupContact;

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isSaveLocked || m.saveReceipt) {
          e.preventDefault();
          return;
        }
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSaveLocked, m.saveReceipt, onClose]);

  if (!isOpen) return null;

  const handleSafeClose = () => {
    if (isSaveLocked) return;
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={handleSafeClose}
    >
      <div
        className="relative bg-white rounded-none sm:rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-3xl h-[100dvh] sm:h-auto sm:max-h-[94vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-3 sm:px-6 py-2.5 sm:py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0 gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <Building2 className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight truncate">
                <span className="sm:hidden">Portal Supervisi</span>
                <span className="hidden sm:inline">Portal Supervisi Guru Pembimbing</span>
              </h2>
              <p className="text-[11px] text-slate-500">
                Langkah {m.currentStep} dari 3 · Tersinkron ke Cloud Server
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {m.isPinVerified && (
              <button
                type="button"
                disabled={isSaveLocked}
                onClick={m.handlePetugasLogout}
                className="min-h-[36px] px-2.5 sm:px-3 py-1.5 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                Ganti Petugas
              </button>
            )}
            <button
              type="button"
              disabled={isSaveLocked}
              onClick={handleSafeClose}
              aria-label="Tutup portal supervisi"
              className="min-w-[40px] min-h-[40px] rounded-full hover:bg-slate-200/70 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <TopProgressBar
          active={
            m.loadingPetugas ||
            m.verifyingPin ||
            m.loadingDudi ||
            m.loadingStudents ||
            m.submitting ||
            m.savingGradeEdit
          }
          label="Menyinkronkan data supervisi dengan Cloud Server"
        />

        {/* Step Progress Bar (Desktop & Tablet) */}
        <div className="hidden sm:flex px-6 py-2.5 bg-slate-100/70 border-b border-slate-200/70 items-center justify-between text-xs font-semibold shrink-0 gap-2">
          <div
            className={`flex items-center gap-1.5 sm:gap-2 whitespace-nowrap ${
              m.currentStep === 1
                ? 'text-blue-700 font-bold'
                : m.isPinVerified
                ? 'text-emerald-700'
                : 'text-slate-500'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                m.isPinVerified
                  ? 'bg-emerald-600 text-white'
                  : m.currentStep === 1
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-300 text-slate-700'
              }`}
            >
              {m.isPinVerified ? '✓' : '1'}
            </span>
            <span className="hidden sm:inline">1. Identitas &amp; Password</span>
            <span className="sm:hidden">1. Password</span>
          </div>

          <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 shrink-0" />

          <div
            className={`flex items-center gap-1.5 sm:gap-2 whitespace-nowrap ${
              m.currentStep === 2
                ? 'text-blue-700 font-bold'
                : m.selectedDudi
                ? 'text-emerald-700'
                : 'text-slate-400'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                m.selectedDudi
                  ? 'bg-emerald-600 text-white'
                  : m.currentStep === 2
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {m.selectedDudi ? '✓' : '2'}
            </span>
            <span className="hidden sm:inline">2. DUDI Bimbingan</span>
            <span className="sm:hidden">2. DUDI</span>
          </div>

          <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 shrink-0" />

          <div
            className={`flex items-center gap-1.5 sm:gap-2 whitespace-nowrap ${
              m.currentStep === 3 ? 'text-blue-700 font-bold' : 'text-slate-400'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                m.currentStep === 3 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
              }`}
            >
              3
            </span>
            <span className="hidden sm:inline">3. Absensi &amp; Supervisi</span>
            <span className="sm:hidden">3. Supervisi</span>
          </div>
        </div>

        {/* Body */}
        <div className="px-3 py-3 sm:p-6 overflow-y-auto flex-1">
          {m.currentStep === 1 && (
            <PinVerificationStep
              petugasList={m.petugasList}
              loadingPetugas={m.loadingPetugas}
              petugasLoadError={m.petugasLoadError}
              selectedPetugasId={m.selectedPetugasId}
              selectedPetugasNama={m.selectedPetugasNama}
              pinInput={m.pinInput}
              verifyingPin={m.verifyingPin}
              pinError={m.pinError}
              onSelectPetugas={(id, nama, nip) => {
                m.setSelectedPetugasId(id);
                m.setSelectedPetugasNama(nama);
                m.setSelectedPetugasNip(nip);
                m.setPinError('');
              }}
              onChangePin={(nextPin) => {
                m.setPinInput(nextPin);
                m.setPinError('');
              }}
              onReloadPetugas={m.loadPetugasList}
              onSubmit={m.handleVerifyPin}
            />
          )}

          {m.currentStep === 2 && (
            <DudiSelectionStep
              selectedPetugasNama={m.selectedPetugasNama}
              assignedDudiList={m.assignedDudiList}
              loadingDudi={m.loadingDudi}
              dudiError={m.dudiError}
              onSelectDudi={m.handleSelectDudi}
            />
          )}

          {m.currentStep === 3 && m.selectedDudi && (
            <MonitoringEntryStep
              selectedDudi={m.selectedDudi}
              selectedPetugasNama={m.selectedPetugasNama}
              dudiStudents={m.dudiStudents}
              loadingStudents={m.loadingStudents}
              studentsError={m.studentsError}
              selectedStudentIndex={m.selectedStudentIndex}
              activeStudent={m.activeStudent}
              activeStageNum={m.activeStageNum}
              stageControl={m.stageControl}
              issuedStages={m.issuedStages}
              issuedStageDetails={m.issuedStageDetails}
              isStageLetterIssued={m.isStageLetterIssued}
              isStageReadOnly={m.isStageReadOnly}
              isStageCompleted={m.isStageCompleted}
              activeDraft={m.activeDraft}
              activeWorkshopDraft={m.activeWorkshopDraft}
              alreadyHasGrade={m.alreadyHasGrade}
              isEditingGrade={m.isEditingGrade}
              canInputGradeThisStage={m.canInputGradeThisStage}
              showGradeInputs={m.showGradeInputs}
              activeGradeEditDraft={m.activeGradeEditDraft}
              rataRataEditNilai={m.rataRataEditNilai}
              predikatEditNilai={m.predikatEditNilai}
              rataRataNilai={m.rataRataNilai}
              predikatNilai={m.predikatNilai}
              savingGradeEdit={m.savingGradeEdit}
              submitting={m.submitting}
              formError={m.formError}
              formErrorTrigger={m.formErrorTrigger}
              dudiPemimpin={m.dudiPemimpin}
              dudiPic={m.dudiPic}
              dudiTelp={m.dudiTelp}
              dudiHariMulai={m.dudiHariMulai}
              dudiHariSelesai={m.dudiHariSelesai}
              dudiJamMulai={m.dudiJamMulai}
              dudiJamSelesai={m.dudiJamSelesai}
              showDudiContactEditor={m.showDudiContactEditor}
              deliveryTtdByKey={m.deliveryTtdByKey}
              deliveryCatatan={m.deliveryCatatan}
              deliveryContactConfirmed={m.deliveryContactConfirmed}
              deliverySelectedKeys={m.deliverySelectedKeys}
              canCopyWorkshopFromPrevStage={m.canCopyWorkshopFromPrevStage}
              onChangeStepToDudiList={() => m.setCurrentStep(2)}
              onSelectStudentIndex={(idx) => {
                m.setSelectedStudentIndex(idx);
                m.setFormError('');
              }}
              onSelectStage={m.setStudentStage}
              onUpdateDraft={m.updateActiveDraft}
              onUpdateWorkshopDraft={m.updateActiveWorkshopDraft}
              onCopyWorkshopFromPrevStage={m.copyWorkshopFromPrevStage}
              onMarkAllBengkelBaik={m.markAllBengkelBaik}
              onApplyStandardChecklist={m.applyStandardStudentChecklist}
              onChangeDudiPemimpin={(val) => {
                m.setDudiPemimpin(val);
                m.setFormError('');
              }}
              onChangeDudiPic={(val) => {
                m.setDudiPic(val);
                m.setFormError('');
              }}
              onChangeDudiTelp={(val) => {
                m.setDudiTelp(val);
                m.setFormError('');
              }}
              onChangeDudiHariMulai={(val) => {
                m.setDudiHariMulai(val);
                m.setFormError('');
              }}
              onChangeDudiHariSelesai={(val) => {
                m.setDudiHariSelesai(val);
                m.setFormError('');
              }}
              onChangeDudiJamMulai={(val) => {
                m.setDudiJamMulai(val);
                m.setFormError('');
              }}
              onChangeDudiJamSelesai={(val) => {
                m.setDudiJamSelesai(val);
                m.setFormError('');
              }}
              onCloseDudiContactEditor={() => m.setShowDudiContactEditor(false)}
              onOpenDudiPopupForEdit={() => {
                m.setPopupPemimpin(m.dudiPemimpin);
                m.setPopupPic(m.dudiPic);
                m.setPopupTelp(m.dudiTelp);
                m.setPopupHariMulai(m.dudiHariMulai);
                m.setPopupHariSelesai(m.dudiHariSelesai);
                m.setPopupJamMulai(m.dudiJamMulai);
                m.setPopupJamSelesai(m.dudiJamSelesai);
                m.setPopupSpellingConfirmed(false);
                m.setPopupError('');
                m.setDudiPopupOpen(true);
              }}
              onChangeDeliveryStudentTtd={m.updateDeliveryStudentTtd}
              onChangeDeliveryCatatan={m.updateDeliveryCatatan}
              onChangeDeliveryContactConfirmed={(val) => {
                m.setDeliveryContactConfirmed(val);
                m.setFormError('');
              }}
              onToggleDeliveryStudentKey={m.toggleDeliveryStudentKey}
              onStartEditGrade={m.startEditGrade}
              onCancelEditGrade={m.cancelEditGrade}
              onUpdateGradeEditDraft={m.updateGradeEditDraft}
              onSaveEditedGrades={m.handleSaveEditedGrades}
              onSaveSupervision={m.handleSaveSupervision}
            />
          )}
        </div>

        {/* Footer (Hidden on mobile during Step 3 to preserve viewport space for form & save CTA) */}
        <div
          className={`px-4 sm:px-6 py-2 sm:py-3 border-t border-slate-100 bg-slate-50/60 items-center justify-between shrink-0 ${
            m.currentStep === 3 ? 'hidden sm:flex' : 'flex'
          }`}
        >
          <div className="text-[11px] text-slate-500">
            {m.currentStep === 3 && m.dudiStudents.length > 0 && (
              <span>
                Siswa ke-{m.selectedStudentIndex + 1} dari {m.dudiStudents.length}
              </span>
            )}
          </div>
          <button
            type="button"
            disabled={isSaveLocked}
            onClick={handleSafeClose}
            className="min-h-[40px] px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Tutup
          </button>
        </div>

        <CrudLoadingOverlay
          visible={m.submitting || m.savingGradeEdit}
          title="Sedang Menyimpan & Memverifikasi ke Cloud Server..."
          subtitle="Mohon tunggu sejenak dan jangan tutup halaman atau browser Anda sampai bukti konfirmasi resmi muncul."
        />

        <MonitoringSaveSuccessModal
          receipt={m.saveReceipt}
          onContinueNext={() => m.handleContinueAfterSave('next')}
          onStayHere={() => m.handleContinueAfterSave('stay')}
          onClosePortal={() => m.handleContinueAfterSave('close', onClose)}
        />

        <OfficerComplianceNoticeModal
          isOpen={Boolean(m.isPinVerified && m.showComplianceNotice)}
          petugasNama={m.selectedPetugasNama}
          onAcknowledge={m.handleAcknowledgeComplianceNotice}
          onLogout={m.handlePetugasLogout}
        />

        <DudiContactPopupModal
          isOpen={Boolean(m.dudiPopupOpen && m.selectedDudi)}
          dudiNama={m.selectedDudi?.nama || ''}
          pemimpin={m.popupPemimpin}
          pic={m.popupPic}
          telp={m.popupTelp}
          hariMulai={m.popupHariMulai}
          hariSelesai={m.popupHariSelesai}
          jamMulai={m.popupJamMulai}
          jamSelesai={m.popupJamSelesai}
          spellingConfirmed={m.popupSpellingConfirmed}
          error={m.popupError}
          saving={m.savingPopupContact}
          onChangePemimpin={(v) => {
            m.setPopupPemimpin(v);
            m.setPopupError('');
          }}
          onChangePic={(v) => {
            m.setPopupPic(v);
            m.setPopupError('');
          }}
          onChangeTelp={(v) => {
            m.setPopupTelp(v);
            m.setPopupError('');
          }}
          onChangeHariMulai={(v) => {
            m.setPopupHariMulai(v);
            m.setPopupError('');
          }}
          onChangeHariSelesai={(v) => {
            m.setPopupHariSelesai(v);
            m.setPopupError('');
          }}
          onChangeJamMulai={(v) => {
            m.setPopupJamMulai(v);
            m.setPopupError('');
          }}
          onChangeJamSelesai={(v) => {
            m.setPopupJamSelesai(v);
            m.setPopupError('');
          }}
          onChangeSpellingConfirmed={(v) => {
            m.setPopupSpellingConfirmed(v);
            m.setPopupError('');
          }}
          onBackToDudiList={() => {
            m.setDudiPopupOpen(false);
            m.setSelectedDudi(null);
            m.setDudiStudents([]);
            m.setCurrentStep(2);
          }}
          onSubmit={m.handleSaveDudiPopup}
        />
      </div>
    </div>
  );
};
