import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useSession } from '@/hooks/useSession';
import { useAgent } from '@/hooks/useAgent';
import { Header } from '@/components/Header';
import { AuthGate } from '@/components/AuthGate';
import { CoachScreen } from '@/components/CoachScreen';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SalesPage } from '@/components/SalesPage';
import { BillingDashboard } from '@/components/BillingDashboard';
import { AffiliateDashboard } from '@/components/AffiliateDashboard';
import { CareerIQScreen } from '@/components/career-iq/CareerIQScreen';
import { CareerProfileProvider } from '@/components/career-iq/CareerProfileContext';
import { JobWorkspaceRoute } from '@/components/career-iq/JobWorkspaceRoute';
import { V2ResumeScreen } from '@/components/resume-v2/V2ResumeScreen';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { ToastProvider } from '@/components/Toast';
import { resumeToText } from '@/lib/export';
import { buildMasterResumePromotionPayload } from '@/lib/master-resume-promotion';
import { resumeDraftToFinalResume } from '@/lib/resume-v2-export';
import { trackProductEvent } from '@/lib/product-telemetry';
import {
  getAppView,
  getLegacyToolRedirect,
  getNormalizedWorkspaceRedirect,
  getLegacyWorkspaceRedirect,
  getWorkspaceRoomFromSearch,
  resolveNavigationTarget,
} from '@/lib/app-routing';
import type { MasterPromotionItem, ResumeDraft } from '@/types/resume-v2';

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, session, loading, displayName, signInWithEmail, signUpWithEmail, signInWithGoogle, updateProfile, signOut } =
    useAuth();
  const accessToken = session?.access_token ?? null;
  const {
    sessions,
    resumes,
    currentSession,
    loading: sessionLoading,
    resumesLoading,
    error: sessionError,
    listSessions,
    listResumes,
    getDefaultResume,
    getResumeById,
    loadSession,
    deleteSession,
    setDefaultResume,
    deleteResume,
    saveResumeAsBase,
    sendMessage,
    setCurrentSession,
    respondToGate,
    getSessionResume,
    getSessionCoverLetter,
    updateMasterResume,
    getResumeHistory,
  } = useSession(accessToken);

  const {
    messages,
    streamingText,
    tools,
    askPrompt,
    phaseGate,
    currentPhase,
    isProcessing,
    setIsProcessing,
    resume,
    connected,
    lastBackendActivityAt,
    stalledSuspected,
    sessionComplete,
    error: agentError,
    panelType,
    panelData,
    addUserMessage,
    pipelineStage,
    positioningProfileFound,
    draftReadiness,
    workflowReplan,
    pipelineActivity,
    isPipelineGateActive,
    setIsPipelineGateActive,
    dismissSuggestion,
    approvedSections,
    sectionDrafts,
    sectionBuildOrder,
    reconnectStreamNow,
    updateSectionLocally,
  } = useAgent(currentSession?.id ?? null, accessToken);

  const isRespondingRef = useRef(false);
  const [checkoutStatus, setCheckoutStatus] = useState<'success' | 'cancelled' | null>(null);
  const [intakeInitialResumeText, setIntakeInitialResumeText] = useState('');
  const [intakeDefaultResumeId, setIntakeDefaultResumeId] = useState<string | null>(null);
  const [v2SessionId, setV2SessionId] = useState<string | null>(null);

  const currentView = getAppView(location.pathname);
  const workspaceRoom = getWorkspaceRoomFromSearch(location.search);
  const normalizedWorkspaceRedirect = getNormalizedWorkspaceRedirect(location.search);
  const hasLiveWorkspaceState = Boolean(
    currentSession
    && (
      messages.length > 0
      || panelType
      || panelData
      || resume
      || isProcessing
      || isPipelineGateActive
      || (pipelineStage && pipelineStage !== 'intake')
      || (currentPhase && currentPhase !== 'onboarding')
    ),
  );

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const refCode = params.get('ref');
    if (refCode && refCode.trim()) {
      localStorage.setItem('referral_code', refCode.trim().toUpperCase());
    }
  }, [location.search]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const checkoutValue = params.get('checkout');
    if (checkoutValue !== 'success' && checkoutValue !== 'cancelled') return;

    setCheckoutStatus(checkoutValue);
    params.delete('checkout');
    const nextSearch = params.toString();
    navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ''}`, { replace: true });
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    trackProductEvent('route_viewed', {
      view: currentView,
      room: workspaceRoom ?? null,
    });

    if (location.pathname === '/workspace' && workspaceRoom === 'resume') {
      trackProductEvent('resume_builder_opened', { surface: 'workspace' });
    }
  }, [currentView, location.pathname, workspaceRoom]);

  useEffect(() => {
    if (isPipelineGateActive) {
      isRespondingRef.current = false;
    }
  }, [isPipelineGateActive]);

  const navigateTo = useCallback((target: string) => {
    navigate(resolveNavigationTarget(target));
  }, [navigate]);

  const handleNewSession = useCallback(async () => {
    setV2SessionId(null);
    setIntakeInitialResumeText('');
    setIntakeDefaultResumeId(null);
    trackProductEvent('resume_builder_session_started', { source: 'workspace_resume_builder' });
    navigate('/resume-builder/session');
    void listResumes();
    const defaultResume = await getDefaultResume();
    if (defaultResume?.raw_text?.trim()) {
      setIntakeInitialResumeText(defaultResume.raw_text);
      setIntakeDefaultResumeId(defaultResume.id);
    }
  }, [getDefaultResume, listResumes, navigate]);

  const handleResumeSession = useCallback(
    async (sessionId: string) => {
      const targetSession = sessions.find((session) => session.id === sessionId);
      if (targetSession?.product_type === 'resume_v2') {
        setV2SessionId(sessionId);
        navigate('/resume-builder/session');
        return;
      }

      await loadSession(sessionId);
      navigate('/coach');
    },
    [loadSession, navigate, sessions],
  );

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      const ok = await deleteSession(sessionId);
      if (ok && currentSession?.id === sessionId) {
        navigate('/workspace?room=resume');
      }
      return ok;
    },
    [currentSession, deleteSession, navigate],
  );

  const handleSaveCurrentResumeAsBase = useCallback(
    async (mode: 'default' | 'alternate') => {
      if (!resume) return { success: false, message: 'No resume available to save' };
      const result = await saveResumeAsBase(resume, {
        setAsDefault: mode === 'default',
        sourceSessionId: currentSession?.id ?? null,
      });
      if (result.success && mode === 'default') {
        setIntakeDefaultResumeId(result.resumeId ?? null);
        setIntakeInitialResumeText(resumeToText(resume));
      }
      if (result.success) {
        await listResumes();
      }
      return {
        success: result.success,
        message: result.success
          ? mode === 'default'
            ? 'Saved as your new default base resume.'
            : 'Saved as an alternate base resume.'
          : (result.error ?? 'Failed to save resume'),
      };
    },
    [resume, saveResumeAsBase, currentSession, listResumes],
  );

  const handleSetDefaultBaseResume = useCallback(
    async (resumeId: string) => {
      const ok = await setDefaultResume(resumeId);
      if (!ok) return false;
      const defaultResume = await getDefaultResume();
      if (defaultResume?.raw_text?.trim()) {
        setIntakeDefaultResumeId(defaultResume.id);
        setIntakeInitialResumeText(defaultResume.raw_text);
      }
      return true;
    },
    [getDefaultResume, setDefaultResume],
  );

  const handleSyncV2ResumeToMaster = useCallback(
    async (
      draft: ResumeDraft,
      options?: {
        sourceSessionId?: string | null;
        companyName?: string;
        jobTitle?: string;
        atsScore?: number;
        promotionItems?: MasterPromotionItem[];
      },
    ) => {
      const finalResume = resumeDraftToFinalResume(draft, {
        companyName: options?.companyName,
        jobTitle: options?.jobTitle,
        atsScore: options?.atsScore,
      });
      const rawText = resumeToText(finalResume);
      const selectedPromotionItems = options?.promotionItems ?? [];

      let targetResumeId = intakeDefaultResumeId ?? resumes.find((item) => item.is_default)?.id ?? null;
      let defaultResume = await getDefaultResume();
      if (!targetResumeId) {
        targetResumeId = defaultResume?.id ?? null;
      }

      if (targetResumeId) {
        const changes = selectedPromotionItems.length > 0
          ? buildMasterResumePromotionPayload({
              draft,
              baseResume: defaultResume,
              selectedItems: selectedPromotionItems,
              sourceSessionId: options?.sourceSessionId ?? null,
              companyName: options?.companyName,
              jobTitle: options?.jobTitle,
              atsScore: options?.atsScore,
            })
          : {
              summary: finalResume.summary,
              experience: finalResume.experience,
              skills: finalResume.skills,
              education: finalResume.education,
              certifications: finalResume.certifications,
              contact_info: finalResume.contact_info,
              raw_text: rawText,
            };

        const updated = await updateMasterResume(targetResumeId, changes);
        if (!updated) {
          return {
            success: false,
            message: 'Failed to update your master resume.',
          };
        }

        setIntakeDefaultResumeId(updated.id);
        setIntakeInitialResumeText(updated.raw_text || changes.raw_text || rawText);
        await listResumes();

        return {
          success: true,
          resumeId: updated.id,
          message: selectedPromotionItems.length > 0
            ? `Promoted ${selectedPromotionItems.length} selected edit${selectedPromotionItems.length === 1 ? '' : 's'} to your master resume.`
            : 'Master resume updated.',
        };
      }

      const created = await saveResumeAsBase(finalResume, {
        setAsDefault: true,
        sourceSessionId: options?.sourceSessionId ?? null,
      });
      if (!created.success) {
        return {
          success: false,
          message: created.error ?? 'Failed to create a master resume.',
        };
      }

      setIntakeDefaultResumeId(created.resumeId ?? null);
      setIntakeInitialResumeText(rawText);
      await listResumes();

      return {
        success: true,
        resumeId: created.resumeId,
        message: 'Created your default master resume.',
      };
    },
    [
      getDefaultResume,
      intakeDefaultResumeId,
      listResumes,
      resumes,
      saveResumeAsBase,
      updateMasterResume,
    ],
  );

  const handleDeleteBaseResume = useCallback(
    async (resumeId: string) => {
      const ok = await deleteResume(resumeId);
      if (!ok) return false;
      const defaultResume = await getDefaultResume();
      if (defaultResume?.raw_text?.trim()) {
        setIntakeDefaultResumeId(defaultResume.id);
        setIntakeInitialResumeText(defaultResume.raw_text);
      } else {
        setIntakeDefaultResumeId(null);
        setIntakeInitialResumeText('');
      }
      return true;
    },
    [deleteResume, getDefaultResume],
  );

  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!currentSession) return;
      if (isProcessing || isPipelineGateActive) return;
      addUserMessage(content);
      const clientMessageId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const ok = await sendMessage(currentSession.id, content, clientMessageId);
      if (!ok) {
        setIsProcessing(false);
      }
    },
    [currentSession, isProcessing, isPipelineGateActive, addUserMessage, sendMessage, setIsProcessing],
  );

  const handlePipelineRespond = useCallback(
    async (gate: string, response: unknown) => {
      if (!currentSession) return;
      if (!isPipelineGateActive) return;
      if (isRespondingRef.current) return;
      isRespondingRef.current = true;
      setIsPipelineGateActive(false);
      try {
        const ok = await respondToGate(currentSession.id, gate, response);
        if (!ok) {
          setIsPipelineGateActive(true);
        }
      } finally {
        isRespondingRef.current = false;
      }
    },
    [currentSession, isPipelineGateActive, respondToGate, setIsPipelineGateActive],
  );

  const handleSignOut = useCallback(async () => {
    await signOut();
    setCurrentSession(null);
    setV2SessionId(null);
    navigate('/sales');
  }, [navigate, setCurrentSession, signOut]);

  if (loading) {
    return (
      <ToastProvider>
        <div className="flex h-screen items-center justify-center bg-surface">
          <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-[#afc4ff] motion-safe:animate-spin" />
        </div>
      </ToastProvider>
    );
  }

  const isSalesRoute = location.pathname === '/' || location.pathname === '/sales';
  if (!user) {
    return (
      <ToastProvider>
        {isSalesRoute ? (
          <SalesPage />
        ) : (
          <AuthGate
            onSignIn={signInWithEmail}
            onSignUp={signUpWithEmail}
            onGoogleSignIn={signInWithGoogle}
          />
        )}
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <CareerProfileProvider>
        <ErrorBoundary key={`${currentSession?.id ?? 'no-session'}:${location.pathname}${location.search}`}>
          <div className="h-screen bg-surface">
            <Header
              email={user.email}
              displayName={displayName}
              onSignOut={handleSignOut}
              onUpdateProfile={updateProfile}
              pipelineStage={currentView === 'coach' ? (pipelineStage ?? currentPhase) : null}
              isProcessing={currentView === 'coach' ? isProcessing : false}
              sessionComplete={currentView === 'coach' ? (sessionComplete ?? false) : false}
              onNavigate={navigateTo}
            />

            {checkoutStatus === 'success' && (
              <div className="mx-auto max-w-6xl px-4 pt-3">
                <div role="status" aria-live="polite" className="flex items-center justify-between rounded-xl border border-[#b5dec2]/30 bg-[#b5dec2]/10 px-4 py-3 text-sm text-[#b5dec2]">
                  <span>Subscription activated! You now have access to all plan features.</span>
                  <button type="button" onClick={() => setCheckoutStatus(null)} className="ml-4 text-xs text-[#b5dec2] hover:text-white/90">Dismiss</button>
                </div>
              </div>
            )}

            {checkoutStatus === 'cancelled' && (
              <div className="mx-auto max-w-6xl px-4 pt-3">
                <div role="status" aria-live="polite" className="flex items-center justify-between rounded-xl border border-[#f0d99f]/30 bg-[#f0d99f]/10 px-4 py-3 text-sm text-[#f0d99f]">
                  <span>Checkout cancelled. You can try again anytime from billing.</span>
                  <button type="button" onClick={() => setCheckoutStatus(null)} className="ml-4 text-xs text-[#f0d99f] hover:text-white/90">Dismiss</button>
                </div>
              </div>
            )}

            <Routes>
              <Route path="/" element={<Navigate to="/workspace" replace />} />
              <Route path="/sales" element={<Navigate to="/workspace" replace />} />
              <Route path="/app" element={<Navigate to="/workspace" replace />} />
              <Route path="/career-iq" element={<Navigate to={getLegacyWorkspaceRedirect(location.search)} replace />} />
              <Route path="/dashboard" element={<Navigate to="/workspace?room=resume" replace />} />
              <Route
                path="/coach"
                element={currentSession ? (
                  currentView === 'coach' && !connected && !sessionComplete && !agentError && !hasLiveWorkspaceState ? (
                    <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-[#afc4ff] motion-safe:animate-spin" />
                        <span className="text-sm text-white/50">Connecting to session...</span>
                      </div>
                    </div>
                  ) : (
                    <CoachScreen
                      sessionId={currentSession.id}
                      accessToken={accessToken}
                      messages={messages}
                      streamingText={streamingText}
                      tools={tools}
                      askPrompt={askPrompt}
                      phaseGate={phaseGate}
                      currentPhase={pipelineStage ?? currentPhase}
                      isProcessing={isProcessing}
                      connected={connected}
                      lastBackendActivityAt={lastBackendActivityAt}
                      stalledSuspected={stalledSuspected}
                      sessionComplete={sessionComplete}
                      resume={resume}
                      panelType={panelType}
                      panelData={panelData}
                      error={agentError ?? sessionError}
                      onSendMessage={handleSendMessage}
                      isPipelineGateActive={isPipelineGateActive}
                      onPipelineRespond={handlePipelineRespond}
                      positioningProfileFound={positioningProfileFound}
                      onSaveCurrentResumeAsBase={handleSaveCurrentResumeAsBase}
                      approvedSections={approvedSections}
                      sectionDrafts={sectionDrafts}
                      sectionBuildOrder={sectionBuildOrder}
                      onDismissSuggestion={dismissSuggestion}
                      onLocalSectionEdit={updateSectionLocally}
                      liveDraftReadiness={draftReadiness}
                      liveWorkflowReplan={workflowReplan}
                      pipelineActivity={pipelineActivity}
                      onReconnectStream={reconnectStreamNow}
                    />
                  )
                ) : (
                  <Navigate to="/workspace?room=resume" replace />
                )}
              />
              <Route path="/resume-builder" element={<Navigate to="/workspace?room=resume" replace />} />
              <Route
                path="/resume-builder/session"
                element={(
                  <V2ResumeScreen
                    accessToken={accessToken}
                    onBack={() => navigate('/workspace?room=resume')}
                    initialResumeText={intakeInitialResumeText}
                    initialSessionId={v2SessionId ?? undefined}
                    onSyncToMasterResume={handleSyncV2ResumeToMaster}
                  />
                )}
              />
              <Route
                path="/workspace/job/:jobId"
                element={(
                  <JobWorkspaceRoute
                    sessions={sessions}
                    loading={sessionLoading}
                    onLoadSessions={listSessions}
                    onResumeSession={handleResumeSession}
                    onNavigate={navigateTo}
                    onGetSessionResume={getSessionResume}
                    onGetSessionCoverLetter={getSessionCoverLetter}
                  />
                )}
              />
              <Route path="/pricing" element={<Navigate to="/billing" replace />} />
              <Route path="/billing" element={<BillingDashboard accessToken={accessToken} />} />
              <Route
                path="/affiliate"
                element={<AffiliateDashboard accessToken={accessToken} onNavigate={navigateTo} />}
              />
              <Route
                path="/tools"
                element={<Navigate to="/workspace" replace />}
              />
              <Route
                path="/tools/:slug"
                element={<Navigate to={getLegacyToolRedirect(location.pathname.split('/tools/')[1] || undefined)} replace />}
              />
              <Route
                path="/cover-letter"
                element={<Navigate to="/workspace?room=resume&focus=cover-letter" replace />}
              />
              <Route
                path="/workspace"
                element={
                  normalizedWorkspaceRedirect ? (
                    <Navigate to={normalizedWorkspaceRedirect} replace />
                  ) : (
                    <CareerIQScreen
                      userName={displayName}
                      accessToken={accessToken}
                      onNavigate={navigateTo}
                      sessions={sessions}
                      resumes={resumes}
                      sessionsLoading={sessionLoading}
                      resumesLoading={resumesLoading}
                      onNewSession={handleNewSession}
                      onResumeSession={handleResumeSession}
                      initialRoom={workspaceRoom}
                      onLoadSessions={listSessions}
                      onLoadResumes={listResumes}
                      onDeleteSession={handleDeleteSession}
                      onGetSessionResume={getSessionResume}
                      onGetSessionCoverLetter={getSessionCoverLetter}
                      onGetDefaultResume={getDefaultResume}
                      onGetResumeById={getResumeById}
                      onUpdateMasterResume={updateMasterResume}
                      onGetResumeHistory={getResumeHistory}
                      onSetDefaultResume={handleSetDefaultBaseResume}
                      onDeleteResume={handleDeleteBaseResume}
                    />
                  )
                }
              />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="*" element={<Navigate to="/workspace" replace />} />
            </Routes>
          </div>
        </ErrorBoundary>
      </CareerProfileProvider>
    </ToastProvider>
  );
}
