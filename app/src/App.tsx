import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSession } from '@/hooks/useSession';
import { useAgent } from '@/hooks/useAgent';
import { Header } from '@/components/Header';
import { AuthGate } from '@/components/AuthGate';
import { LandingScreen } from '@/components/LandingScreen';
import { CoachScreen } from '@/components/CoachScreen';
import { PipelineIntakeForm } from '@/components/PipelineIntakeForm';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SalesPage } from '@/components/SalesPage';
import { PricingPage } from '@/components/PricingPage';
import { BillingDashboard } from '@/components/BillingDashboard';
import { AffiliateDashboard } from '@/components/AffiliateDashboard';
import { resumeToText } from '@/lib/export';

type View = 'landing' | 'intake' | 'coach' | 'pricing' | 'billing' | 'affiliate';

export default function App() {
  const { user, session, loading, signInWithEmail, signUpWithEmail, signInWithGoogle, signOut } =
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
    createSession,
    getDefaultResume,
    getResumeById,
    loadSession,
    deleteSession,
    setDefaultResume,
    deleteResume,
    saveResumeAsBase,
    sendMessage,
    setCurrentSession,
    startPipeline,
    restartPipelineWithCachedInputs,
    respondToGate,
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
    reconnectStreamNow,
  } = useAgent(currentSession?.id ?? null, accessToken);

  const [view, setView] = useState<View>('landing');
  const [checkoutStatus, setCheckoutStatus] = useState<'success' | 'cancelled' | null>(null);
  const [intakeLoading, setIntakeLoading] = useState(false);

  // Detect URL-based views on mount
  useEffect(() => {
    const path = window.location.pathname;
    if (path === '/pricing') setView('pricing');
    else if (path === '/billing') setView('billing');
    else if (path === '/affiliate') setView('affiliate');
  }, []);

  // Detect referral code from URL query parameter and persist to localStorage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get('ref');
    if (refCode && refCode.trim()) {
      localStorage.setItem('referral_code', refCode.trim().toUpperCase());
    }
  }, []);

  // Handle checkout query params returned from Stripe
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success') {
      setCheckoutStatus('success');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('checkout') === 'cancelled') {
      setCheckoutStatus('cancelled');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path === '/pricing') setView('pricing');
      else if (path === '/billing') setView('billing');
      else if (path === '/affiliate') setView('affiliate');
      else setView('landing');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  const [intakeInitialResumeText, setIntakeInitialResumeText] = useState('');
  const [intakeDefaultResumeId, setIntakeDefaultResumeId] = useState<string | null>(null);
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

  const handleNewSession = useCallback(async () => {
    setView('intake');
    setIntakeInitialResumeText('');
    setIntakeDefaultResumeId(null);
    void listResumes();
    const defaultResume = await getDefaultResume();
    if (defaultResume?.raw_text?.trim()) {
      setIntakeInitialResumeText(defaultResume.raw_text);
      setIntakeDefaultResumeId(defaultResume.id);
    }
  }, [getDefaultResume, listResumes]);

  const handleLoadSavedResumeForIntake = useCallback(
    async (resumeId: string) => {
      const resume = await getResumeById(resumeId);
      if (!resume?.raw_text?.trim()) return null;
      return resume.raw_text;
    },
    [getResumeById],
  );

  const handleIntakeSubmit = useCallback(
    async (data: {
      resumeText: string;
      jobDescription: string;
      companyName: string;
      workflowMode: 'fast_draft' | 'balanced' | 'deep_dive';
      minimumEvidenceTarget: number;
      resumePriority: 'authentic' | 'ats' | 'impact' | 'balanced';
      seniorityDelta: 'same' | 'one_up' | 'big_jump' | 'step_back';
    }) => {
      setIntakeLoading(true);
      try {
        const s = await createSession(intakeDefaultResumeId ?? undefined);
        if (!s) {
          setIntakeLoading(false);
          return;
        }

        const started = await startPipeline(
          s.id,
          data.resumeText,
          data.jobDescription,
          data.companyName,
          data.workflowMode,
          data.minimumEvidenceTarget,
          data.resumePriority,
          data.seniorityDelta,
        );
        if (!started) {
          await deleteSession(s.id);
          setIntakeLoading(false);
          return;
        }

        setView('coach');
        setIntakeLoading(false);
      } catch {
        setIntakeLoading(false);
      }
    },
    [createSession, startPipeline, intakeDefaultResumeId, deleteSession],
  );

  const handleResumeSession = useCallback(
    async (sessionId: string) => {
      await loadSession(sessionId);
      setView('coach');
    },
    [loadSession],
  );

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      const ok = await deleteSession(sessionId);
      if (ok && currentSession?.id === sessionId) {
        setView('landing');
      }
      return ok;
    },
    [deleteSession, currentSession],
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
    [setDefaultResume, getDefaultResume],
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
      if (isProcessing || isPipelineGateActive) return; // Prevent 409 and gate collisions
      addUserMessage(content);
      const clientMessageId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const ok = await sendMessage(currentSession.id, content, clientMessageId);
      if (!ok) {
        // API rejected the message (e.g. 409 still processing) — reset processing state
        setIsProcessing(false);
      }
    },
    [currentSession, isProcessing, isPipelineGateActive, addUserMessage, sendMessage, setIsProcessing],
  );

  const handlePipelineRespond = useCallback(
    async (gate: string, response: unknown) => {
      if (!currentSession) return;
      if (!isPipelineGateActive) return; // Prevent 409 when no gate is pending
      setIsPipelineGateActive(false); // Optimistic disable prevents double-click
      const ok = await respondToGate(currentSession.id, gate, response);
      if (!ok) {
        setIsPipelineGateActive(true); // Re-enable on failure so user can retry
      }
    },
    [currentSession, isPipelineGateActive, respondToGate, setIsPipelineGateActive],
  );

  const handleRestartPipelineFromCache = useCallback(
    async (sessionId: string) => restartPipelineWithCachedInputs(sessionId),
    [restartPipelineWithCachedInputs],
  );

  const handleSignOut = useCallback(async () => {
    await signOut();
    setCurrentSession(null);
    setView('landing');
  }, [signOut, setCurrentSession]);

  const navigateTo = useCallback((viewName: string) => {
    const validViews: View[] = ['landing', 'intake', 'coach', 'pricing', 'billing', 'affiliate'];
    const newView = validViews.includes(viewName as View) ? (viewName as View) : 'landing';
    setView(newView);
    const paths: Record<View, string> = {
      landing: '/app',
      intake: '/app',
      coach: '/app',
      pricing: '/pricing',
      billing: '/billing',
      affiliate: '/affiliate',
    };
    const newPath = paths[newView];
    if (newPath && window.location.pathname !== newPath) {
      window.history.pushState({}, '', newPath);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[#afc4ff]" />
      </div>
    );
  }

  const isSalesPage = ['/', '/sales'].includes(window.location.pathname);
  if (isSalesPage) return <SalesPage />;

  if (!user) {
    return (
      <AuthGate
        onSignIn={signInWithEmail}
        onSignUp={signUpWithEmail}
        onGoogleSignIn={signInWithGoogle}
      />
    );
  }

  return (
    <ErrorBoundary key={currentSession?.id ?? view}>
      <div className="h-screen bg-surface">
        <Header
          email={user.email}
          onSignOut={handleSignOut}
          pipelineStage={view === 'coach' ? (pipelineStage ?? currentPhase) : null}
          isProcessing={view === 'coach' ? isProcessing : false}
          sessionComplete={view === 'coach' ? (sessionComplete ?? false) : false}
          onNavigate={navigateTo}
        />

        {checkoutStatus === 'success' && (
          <div className="mx-auto max-w-6xl px-4 pt-3">
            <div className="rounded-xl border border-emerald-300/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 flex items-center justify-between">
              <span>Subscription activated! You now have access to all plan features.</span>
              <button onClick={() => setCheckoutStatus(null)} className="text-emerald-300 hover:text-emerald-100 text-xs ml-4">Dismiss</button>
            </div>
          </div>
        )}
        {checkoutStatus === 'cancelled' && (
          <div className="mx-auto max-w-6xl px-4 pt-3">
            <div className="rounded-xl border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 flex items-center justify-between">
              <span>Checkout cancelled. You can try again anytime from the pricing page.</span>
              <button onClick={() => setCheckoutStatus(null)} className="text-amber-300 hover:text-amber-100 text-xs ml-4">Dismiss</button>
            </div>
          </div>
        )}

      {view === 'landing' && (
        <LandingScreen
          sessions={sessions}
          resumes={resumes}
          loading={sessionLoading}
          resumesLoading={resumesLoading}
          error={sessionError}
          onNewSession={handleNewSession}
          onResumeSession={handleResumeSession}
          onDeleteSession={handleDeleteSession}
          onLoadSessions={listSessions}
          onLoadResumes={listResumes}
          onSetDefaultResume={handleSetDefaultBaseResume}
          onDeleteResume={handleDeleteBaseResume}
        />
      )}

      {view === 'intake' && (
        <PipelineIntakeForm
          onSubmit={handleIntakeSubmit}
          onBack={() => setView('landing')}
          loading={intakeLoading}
          initialResumeText={intakeInitialResumeText}
          defaultResumeId={intakeDefaultResumeId}
          savedResumes={resumes}
          onLoadSavedResume={handleLoadSavedResumeForIntake}
          error={sessionError}
        />
      )}

      {view === 'coach' && !connected && !sessionComplete && !agentError && currentSession && !hasLiveWorkspaceState && (
        <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[#afc4ff]" />
            <span className="text-sm text-white/50">Connecting to session...</span>
          </div>
        </div>
      )}

      {view === 'coach' && (connected || hasLiveWorkspaceState || sessionComplete || agentError || sessionError) && (
        <CoachScreen
          sessionId={currentSession?.id ?? null}
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
          onDismissSuggestion={dismissSuggestion}
          onRestartPipelineFromLastInputs={handleRestartPipelineFromCache}
          liveDraftReadiness={draftReadiness}
          liveWorkflowReplan={workflowReplan}
          pipelineActivity={pipelineActivity}
          onReconnectStream={reconnectStreamNow}
        />
      )}

      {view === 'pricing' && (
        <PricingPage
          accessToken={accessToken}
          onUpgradeSuccess={() => setCheckoutStatus('success')}
        />
      )}

      {view === 'billing' && user && (
        <BillingDashboard accessToken={accessToken} />
      )}

      {view === 'affiliate' && (
        <AffiliateDashboard
          accessToken={accessToken}
          onNavigate={(v) => setView(v as View)}
        />
      )}
      </div>
    </ErrorBoundary>
  );
}
