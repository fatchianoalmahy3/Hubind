import React, { useEffect, useState } from 'react';
import { BarChart3, ChevronRight, X } from 'lucide-react';
import { ToastManager } from '../core/ToastManager';
import { PinVerificationStep } from './monitoring-portal/PinVerificationStep';
import { DudiSelectionStep } from './monitoring-portal/DudiSelectionStep';
import { MonitoringEntryStep } from './monitoring-portal/MonitoringEntryStep';
import { PortalBottomNav, type PortalMobileTab } from './monitoring-portal/PortalBottomNav';
import { PortalOfficerSummaryView } from './monitoring-portal/PortalOfficerSummaryView';
import { DudiContactPopupModal } from './monitoring-portal/DudiContactPopupModal';
import { OfficerComplianceNoticeModal } from './monitoring-portal/OfficerComplianceNoticeModal';
import { MonitoringSaveSuccessModal } from './monitoring-portal/MonitoringSaveSuccessModal';
import { StageEditConfirmModal } from './monitoring-portal/StageEditConfirmModal';
import { getStudentKey } from './monitoring-portal/types';
import { useTeacherMonitoring } from './monitoring-portal/useTeacherMonitoring';
import { CrudLoadingOverlay, TopProgressBar } from './CrudProgressFeedback';
import { PWAInstallGate } from './PWAInstallGate';
import { usePWAInstall } from '../hooks/usePWAInstall';

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
  const { requiresMobileInstallGate } = usePWAInstall();
  const m = useTeacherMonitoring(isOpen && !requiresMobileInstallGate, onSuccess);
  const isSaveLocked = m.submitting || m.savingGradeEdit || m.savingPopupContact;
  const [showProgressTab, setShowProgressTab] = useState(false);
  const [isKeyboardInputFocused, setIsKeyboardInputFocused] = useState(false);

  const activePortalTab: PortalMobileTab = showProgressTab
    ? 'progress'
    : m.currentStep === 3 && m.selectedDudi
    ? 'monitoring'
    : 'dudi';

  useEffect(() => {
    if (!m.isPinVerified) {
      setShowProgressTab(false);
    }
  }, [m.isPinVerified]);

  useEffect(() => {
    if (!isOpen) return;
    const isTextInputEl = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      if (el.tagName === 'TEXTAREA') return true;
      if (el.tagName === 'INPUT') {
        const t = (el as HTMLInputElement).type;
        return t !== 'checkbox' && t !== 'radio' && t !== 'button' && t !== 'submit';
      }
      return false;
    };
    const handleFocusIn = (e: FocusEvent) => {
      if (isTextInputEl(e.target)) {
        setIsKeyboardInputFocused(true);
      }
    };
    const handleFocusOut = () => {
      window.setTimeout(() => {
        if (!isTextInputEl(document.activeElement)) {
          setIsKeyboardInputFocused(false);
        }
      }, 120);
    };
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, [isOpen]);

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

  if (requiresMobileInstallGate) {
    return (
      <PWAInstallGate
        targetTitle="Portal Petugas Monitoring DUDI"
        targetDescription="Pasang aplikasi Hubind PKL di HP Anda terlebih dahulu dan buka lewat ikon di layar utama agar tampilan penuh serta stabil saat bertugas di lapangan."
        onBack={onClose}
      />
    );
  }

  const handleSafeClose = () => {
    if (isSaveLocked) return;
    onClose();
  };

  const handleChangePortalTab = (tab: PortalMobileTab) => {
    if (isSaveLocked) return;
    if (tab === 'dudi') {
      setShowProgressTab(false);
      m.setCurrentStep(2);
      return;
    }
    if (tab === 'monitoring') {
      if (m.selectedDudi) {
        setShowProgressTab(false);
        m.setCurrentStep(3);
      } else {
        setShowProgressTab(false);
        m.setCurrentStep(2);
        ToastManager.getInstance().show(
          'Pilih DUDI Terlebih Dahulu',
          'info',
          'Ketuk salah satu DUDI pada daftar untuk membuka form monitoring.'
        );
      }
      return;
    }
    setShowProgressTab(true);
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
        <div className="px-3 sm:px-6 py-2 sm:py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0 gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <img
              src="/assets/logo-hubind.png"
              alt="Logo Hubind SMK PGRI 2 Ponorogo"
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl object-contain shrink-0"
            />
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight truncate">
                <span className="sm:hidden">Portal Monitoring</span>
                <span className="hidden sm:inline">Portal Monitoring Guru Pembimbing</span>
              </h2>
              <p className="text-[11px] text-slate-500 truncate">
                {m.isPinVerified
                  ? `Petugas: ${m.selectedPetugasNama || '-'}`
                  : 'Verifikasi Identitas Petugas · Tersinkron ke Server'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {m.isPinVerified && (
              <>
                <button
                  type="button"
                  disabled={isSaveLocked}
                  onClick={() => setShowProgressTab((v) => !v)}
                  className={`hidden sm:inline-flex min-h-[36px] px-3 py-1.5 text-[11px] font-semibold rounded-lg border items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap ${
                    showProgressTab
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>{showProgressTab ? 'Kembali' : 'Progres & Akun'}</span>
                </button>
                <button
                  type="button"
                  disabled={isSaveLocked}
                  onClick={() => {
                    setShowProgressTab(false);
                    m.handlePetugasLogout();
                  }}
                  className="hidden sm:inline-flex min-h-[36px] px-3 py-1.5 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  Ganti Petugas
                </button>
              </>
            )}
            <button
              type="button"
              disabled={isSaveLocked}
              onClick={handleSafeClose}
              aria-label="Tutup portal monitoring"
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
          label="Menyinkronkan data monitoring dengan Cloud Server"
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
            <span>1. Identitas &amp; Password</span>
          </div>

          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />

          <button
            type="button"
            disabled={!m.isPinVerified || isSaveLocked}
            onClick={() => handleChangePortalTab('dudi')}
            className={`flex items-center gap-2 whitespace-nowrap cursor-pointer disabled:cursor-default ${
              !showProgressTab && m.currentStep === 2
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
                  : !showProgressTab && m.currentStep === 2
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {m.selectedDudi ? '✓' : '2'}
            </span>
            <span>2. DUDI Bimbingan</span>
          </button>

          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />

          <button
            type="button"
            disabled={!m.isPinVerified || !m.selectedDudi || isSaveLocked}
            onClick={() => handleChangePortalTab('monitoring')}
            className={`flex items-center gap-2 whitespace-nowrap cursor-pointer disabled:cursor-default ${
              !showProgressTab && m.currentStep === 3
                ? 'text-blue-700 font-bold'
                : 'text-slate-400'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                !showProgressTab && m.currentStep === 3
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              3
            </span>
            <span>3. Absensi &amp; Monitoring</span>
          </button>
        </div>

        {/* Body */}
        <div className="px-3 py-2.5 sm:p-6 overflow-y-auto flex-1">
          {!m.isPinVerified && m.currentStep === 1 && (
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

          {m.isPinVerified && showProgressTab && (
            <PortalOfficerSummaryView
              petugasNama={m.selectedPetugasNama}
              petugasNip={m.selectedPetugasNip}
              isOnline={m.isOnline}
              assignedDudiList={m.assignedDudiList}
              selectedDudi={m.selectedDudi}
              dudiStudents={m.dudiStudents}
              stageControl={m.stageControl}
              disabled={isSaveLocked}
              onGoToDudiList={() => handleChangePortalTab('dudi')}
              onGoToMonitoringStudent={(studentIdx) => {
                if (typeof studentIdx === 'number') {
                  m.setSelectedStudentIndex(studentIdx);
                }
                handleChangePortalTab('monitoring');
              }}
              onLogout={() => {
                setShowProgressTab(false);
                m.handlePetugasLogout();
              }}
            />
          )}

          {m.isPinVerified && !showProgressTab && m.currentStep === 2 && (
            <DudiSelectionStep
              selectedPetugasNama={m.selectedPetugasNama}
              assignedDudiList={m.assignedDudiList}
              loadingDudi={m.loadingDudi}
              dudiError={m.dudiError}
              activeDudiId={m.selectedDudi?.id}
              activeDudiNama={m.selectedDudi?.nama}
              onSelectDudi={(dudi) => {
                setShowProgressTab(false);
                void m.handleSelectDudi(dudi);
              }}
            />
          )}

          {m.isPinVerified && !showProgressTab && m.currentStep === 3 && m.selectedDudi && (
            <MonitoringEntryStep
              selectedDudi={m.selectedDudi}
              selectedPetugasNama={m.selectedPetugasNama}
              dudiStudents={m.dudiStudents}
              loadingStudents={m.loadingStudents}
              studentsError={m.studentsError}
              dudiStagePolicy={m.dudiStagePolicy}
              activeStageNum={m.activeStageNum}
              stageControl={m.stageControl}
              issuedStages={m.issuedStages}
              issuedStageDetails={m.issuedStageDetails}
              isStageLetterIssued={m.isStageLetterIssued}
              isStageReadOnly={m.isStageReadOnly}
              isCompletedReadOnly={m.isCompletedReadOnly}
              isStageCompleted={m.isStageCompleted}
              draftsByKey={m.draftsByKey}
              activeWorkshopDraft={m.activeWorkshopDraft}
              editUnlockedKeys={m.editUnlockedKeys}
              batchSelectedKeys={m.batchSelectedKeys}
              gradeEditDrafts={m.gradeEditDrafts}
              editingGradeByStudent={m.editingGradeByStudent}
              focusedStudentKey={
                m.activeStudent ? getStudentKey(m.activeStudent, m.selectedStudentIndex) : ''
              }
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
              isOnline={m.isOnline}
              onChangeStepToDudiList={m.backToDudiList}
              onSelectStage={m.setStudentStage}
              onUpdateWorkshopDraft={m.updateActiveWorkshopDraft}
              onCopyWorkshopFromPrevStage={m.copyWorkshopFromPrevStage}
              onMarkAllBengkelBaik={m.markAllBengkelBaik}
              onToggleBatchStudent={m.toggleBatchStudentKey}
              onSelectAllPending={m.selectAllPendingBatchStudents}
              onClearBatchSelection={m.clearBatchStudentSelection}
              onApplyBatchStandardAll={m.applyBatchStandardDefaults}
              onUpdateStudentDraft={m.updateStudentDraftFor}
              onApplyStudentStandard={m.applyStandardStudentChecklistFor}
              onRequestUnlockStudentEdit={m.requestUnlockStudentStageEdit}
              onStartEditGradeFor={m.startEditGradeFor}
              onCancelEditGradeFor={m.cancelEditGradeFor}
              onUpdateGradeEditDraftFor={m.updateGradeEditDraftFor}
              onSaveEditedGradesFor={m.handleSaveEditedGradesFor}
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
              onRequestUnlockEdit={m.requestUnlockCurrentStageEdit}
              onSaveSupervision={m.handleSaveSupervision}
            />
          )}
        </div>

        {/* Mobile 3-Menu Bottom Navigation (Only when authenticated) */}
        {m.isPinVerified && (
          <PortalBottomNav
            activeTab={activePortalTab}
            hasSelectedDudi={Boolean(m.selectedDudi)}
            dudiCount={m.assignedDudiList.length}
            disabled={isSaveLocked}
            hidden={isKeyboardInputFocused}
            onChangeTab={handleChangePortalTab}
          />
        )}

        {/* Footer (Desktop & Tablet, or Mobile only during Step 1 login) */}
        <div
          className={`px-4 sm:px-6 py-2 sm:py-3 border-t border-slate-100 bg-slate-50/60 items-center justify-between shrink-0 ${
            m.isPinVerified ? 'hidden sm:flex' : 'flex'
          }`}
        >
          <div className="text-[11px] text-slate-500">
            {!showProgressTab && m.currentStep === 3 && m.dudiStudents.length > 0 && (
              <span>
                {m.activeStageNum === 1
                  ? `${m.deliverySelectedKeys.length} dari ${m.dudiStudents.length} siswa diantar`
                  : `${m.batchSelectedKeys.length} dari ${m.dudiStudents.length} siswa dipilih · Tahap ${m.activeStageNum}`}
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

        <StageEditConfirmModal
          pending={m.pendingEditConfirm}
          onViewReadOnly={m.confirmStageViewReadOnly}
          onConfirmEdit={m.confirmStageEditUnlock}
          onCancel={m.cancelStageEditConfirm}
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
          onBackToDudiList={m.backToDudiList}
          onSubmit={m.handleSaveDudiPopup}
        />
      </div>
    </div>
  );
};
