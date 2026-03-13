import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSession } from '@/hooks/useSession';
import { useAgent } from '@/hooks/useAgent';
import { Header } from '@/components/Header';
import { AuthGate } from '@/components/AuthGate';
import { LandingScreen } from '@/components/LandingScreen';
import { CoachScreen } from '@/components/CoachScreen';
// PipelineIntakeForm — legacy intake, replaced by V2IntakeForm in resume-v2
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SalesPage } from '@/components/SalesPage';
import { PricingPage } from '@/components/PricingPage';
import { BillingDashboard } from '@/components/BillingDashboard';
import { AffiliateDashboard } from '@/components/AffiliateDashboard';
import { DashboardScreen } from '@/components/dashboard/DashboardScreen';
import { ToolsScreen } from '@/components/platform/ToolsScreen';
import { CoverLetterScreen } from '@/components/cover-letter/CoverLetterScreen';
import { CareerIQScreen } from '@/components/career-iq/CareerIQScreen';
import { V2ResumeScreen } from '@/components/resume-v2/V2ResumeScreen';
import { ToastProvider } from '@/components/Toast';
import { resumeToText } from '@/lib/export';

const CoachDrawer = lazy(() => import('@/components/career-iq/CoachDrawer').then(m => ({ default: m.CoachDrawer })));

type View = 'landing' | 'coach' | 'resume-v2' | 'pricing' | 'billing' | 'affiliate' | 'dashboard' | 'tools' | 'cover-letter' | 'career-iq';

export default function App() {
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

  // Request-level lock: prevents concurrent gate responses even when React state
  // updates haven't flushed yet (fixes Bug 18 — double-click 409s).
  const isRespondingRef = useRef(false);

  const [view, setView] = useState<View>('landing');
  const [toolSlug, setToolSlug] = useState<string | undefined>(undefined);
  const [initialRoom, setInitialRoom] = useState<string | undefined>(undefined);
  const [checkoutStatus, setCheckoutStatus] = useState<'success' | 'cancelled' | null>(null);
  const [toolsCoachOpen, setToolsCoachOpen] = useState(false);


  // Detect URL-based views on mount
  useEffect(() => {
    const path = window.location.pathname;
    if (path === '/pricing') setView('pricing');
    else if (path === '/billing') setView('billing');
    else if (path === '/affiliate') setView('affiliate');
    else if (path === '/dashboard') setView('dashboard');
    else if (path === '/cover-letter') setView('cover-letter');
    else if (path === '/career-iq') setView('career-iq');
    else if (path === '/tools') { setView('tools'); setToolSlug(undefined); }
    else if (path.startsWith('/tools/')) { setView('tools'); setToolSlug(path.split('/tools/')[1]); }
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

  // When a new gate becomes active, reset the in-flight lock so the user can respond.
  useEffect(() => {
    if (isPipelineGateActive) {
      isRespondingRef.current = false;
    }
  }, [isPipelineGateActive]);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path === '/pricing') setView('pricing');
      else if (path === '/billing') setView('billing');
      else if (path === '/affiliate') setView('affiliate');
      else if (path === '/dashboard') setView('dashboard');
      else if (path === '/cover-letter') setView('cover-letter');
      else if (path === '/career-iq') setView('career-iq');
      else if (path === '/tools') { setView('tools'); setToolSlug(undefined); }
      else if (path.startsWith('/tools/')) { setView('tools'); setToolSlug(path.split('/tools/')[1]); }
      else setView('landing');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  const [intakeInitialResumeText, setIntakeInitialResumeText] = useState('');
  const [intakeDefaultResumeId, setIntakeDefaultResumeId] = useState<string | null>(null);
  const [v2SessionId, setV2SessionId] = useState<string | null>(null);
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
    setView('resume-v2');
    setV2SessionId(null);
    setIntakeInitialResumeText('');
    setIntakeDefaultResumeId(null);
    void listResumes();
    const defaultResume = await getDefaultResume();
    if (defaultResume?.raw_text?.trim()) {
      setIntakeInitialResumeText(defaultResume.raw_text);
      setIntakeDefaultResumeId(defaultResume.id);
    }
  }, [getDefaultResume, listResumes]);

  const handleResumeSession = useCallback(
    async (sessionId: string) => {
      // Check if this is a V2 session — route to V2 screen instead of coach
      const session = sessions.find(s => s.id === sessionId);
      if (session?.product_type === 'resume_v2') {
        setV2SessionId(sessionId);
        setView('resume-v2');
        return;
      }
      await loadSession(sessionId);
      setView('coach');
    },
    [loadSession, sessions],
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
      if (isRespondingRef.current) return; // Ref-level lock: blocks concurrent calls before state flush
      isRespondingRef.current = true;
      setIsPipelineGateActive(false); // Optimistic disable prevents double-click
      try {
        const ok = await respondToGate(currentSession.id, gate, response);
        if (!ok) {
          setIsPipelineGateActive(true); // Re-enable on failure so user can retry
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
    setView('landing');
  }, [signOut, setCurrentSession]);

  const navigateTo = useCallback((viewName: string) => {
    // Handle /tools/:slug
    if (viewName.startsWith('/tools/')) {
      setView('tools');
      setToolSlug(viewName.split('/tools/')[1]);
      if (window.location.pathname !== viewName) {
        window.history.pushState({}, '', viewName);
      }
      return;
    }
    if (viewName === '/tools' || viewName === 'tools') {
      setView('tools');
      setToolSlug(undefined);
      if (window.location.pathname !== '/tools') {
        window.history.pushState({}, '', '/tools');
      }
      return;
    }
    if (viewName === 'cover-letter' || viewName === '/cover-letter') {
      setView('cover-letter');
      if (window.location.pathname !== '/cover-letter') {
        window.history.pushState({}, '', '/cover-letter');
      }
      return;
    }
    if (viewName === 'career-iq' || viewName === '/career-iq') {
      setView('career-iq');
      if (window.location.pathname !== '/career-iq') {
        window.history.pushState({}, '', '/career-iq');
      }
      return;
    }
    const validViews: View[] = ['landing', 'coach', 'resume-v2', 'pricing', 'billing', 'affiliate', 'dashboard', 'tools', 'cover-letter', 'career-iq'];
    const newView = validViews.includes(viewName as View) ? (viewName as View) : 'landing';
    setView(newView);
    const paths: Record<View, string> = {
      landing: '/app',
      coach: '/app',
      'resume-v2': '/app',
      pricing: '/pricing',
      billing: '/billing',
      affiliate: '/affiliate',
      dashboard: '/dashboard',
      tools: '/tools',
      'cover-letter': '/cover-letter',
      'career-iq': '/career-iq',
    };
    const newPath = paths[newView];
    if (newPath && window.location.pathname !== newPath) {
      window.history.pushState({}, '', newPath);
    }
  }, []);

  if (loading) {
    return (
      <ToastProvider>
        <div className="flex h-screen items-center justify-center bg-surface">
          <div className="h-8 w-8 motion-safe:animate-spin rounded-full border-2 border-white/20 border-t-[#afc4ff]" />
        </div>
      </ToastProvider>
    );
  }

  const isSalesPage = ['/', '/sales'].includes(window.location.pathname);
  if (isSalesPage) return <ToastProvider><SalesPage /></ToastProvider>;

  if (!user) {
    return (
      <ToastProvider>
        <AuthGate
          onSignIn={signInWithEmail}
          onSignUp={signUpWithEmail}
          onGoogleSignIn={signInWithGoogle}
        />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
    <ErrorBoundary key={currentSession?.id ?? view}>
      <div className="h-screen bg-surface">
        <Header
          email={user.email}
          displayName={displayName}
          onSignOut={handleSignOut}
          onUpdateProfile={updateProfile}
          pipelineStage={view === 'coach' ? (pipelineStage ?? currentPhase) : null}
          isProcessing={view === 'coach' ? isProcessing : false}
          sessionComplete={view === 'coach' ? (sessionComplete ?? false) : false}
          onNavigate={navigateTo}
        />

        {checkoutStatus === 'success' && (
          <div className="mx-auto max-w-6xl px-4 pt-3">
            <div role="status" aria-live="polite" className="rounded-xl border border-[#b5dec2]/30 bg-[#b5dec2]/10 px-4 py-3 text-sm text-[#b5dec2] flex items-center justify-between">
              <span>Subscription activated! You now have access to all plan features.</span>
              <button type="button" onClick={() => setCheckoutStatus(null)} className="text-[#b5dec2] hover:text-white/90 text-xs ml-4">Dismiss</button>
            </div>
          </div>
        )}
        {checkoutStatus === 'cancelled' && (
          <div className="mx-auto max-w-6xl px-4 pt-3">
            <div role="status" aria-live="polite" className="rounded-xl border border-[#f0d99f]/30 bg-[#f0d99f]/10 px-4 py-3 text-sm text-[#f0d99f] flex items-center justify-between">
              <span>Checkout cancelled. You can try again anytime from the pricing page.</span>
              <button type="button" onClick={() => setCheckoutStatus(null)} className="text-[#f0d99f] hover:text-white/90 text-xs ml-4">Dismiss</button>
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
          onNavigateToDashboard={() => navigateTo('dashboard')}
        />
      )}

      {view === 'coach' && !connected && !sessionComplete && !agentError && currentSession && !hasLiveWorkspaceState && (
        <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 motion-safe:animate-spin rounded-full border-2 border-white/20 border-t-[#afc4ff]" />
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
          sectionDrafts={sectionDrafts}
          sectionBuildOrder={sectionBuildOrder}
          onDismissSuggestion={dismissSuggestion}
          onLocalSectionEdit={updateSectionLocally}
          liveDraftReadiness={draftReadiness}
          liveWorkflowReplan={workflowReplan}
          pipelineActivity={pipelineActivity}
          onReconnectStream={reconnectStreamNow}
        />
      )}

      {view === 'resume-v2' && (
        <V2ResumeScreen
          accessToken={accessToken}
          onBack={() => { setV2SessionId(null); setView('landing'); }}
          initialResumeText={intakeInitialResumeText}
          initialSessionId={v2SessionId ?? undefined}
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

      {view === 'tools' && (
        <>
          <ToolsScreen
            slug={toolSlug}
            userName={displayName}
            onOpenCoach={() => setToolsCoachOpen(true)}
            onNavigate={(route) => {
              if (route === '/tools') navigateTo('tools');
              else if (route.startsWith('/tools/')) navigateTo(route);
              else if (route === '/cover-letter') navigateTo('cover-letter');
              else if (route === '/app' || route === '/') navigateTo('landing');
              else if (route === '/onboarding') {
                setInitialRoom('onboarding');
                navigateTo('career-iq');
              }
              else if (route.startsWith('/career-iq')) {
                const roomParam = new URL(route, 'http://x').searchParams.get('room');
                setInitialRoom(roomParam ?? undefined);
                navigateTo('career-iq');
              }
              else navigateTo('landing');
            }}
          />
          <Suspense fallback={null}>
            <CoachDrawer
              userName={displayName}
              isOpen={toolsCoachOpen}
              onOpen={() => setToolsCoachOpen(true)}
              onClose={() => setToolsCoachOpen(false)}
              onNavigate={(room) => {
                setToolsCoachOpen(false);
                setInitialRoom(room);
                navigateTo('career-iq');
              }}
            />
          </Suspense>
        </>
      )}

      {view === 'cover-letter' && (
        <CoverLetterScreen
          accessToken={accessToken}
          onNavigate={navigateTo}
          onGetDefaultResume={getDefaultResume}
        />
      )}

      {view === 'career-iq' && (
        <CareerIQScreen
          userName={displayName}
          onNavigate={navigateTo}
          sessions={sessions}
          resumes={resumes}
          sessionsLoading={sessionLoading}
          onNewSession={handleNewSession}
          onResumeSession={handleResumeSession}
          initialRoom={initialRoom}
        />
      )}

      {view === 'dashboard' && (
        <DashboardScreen
          accessToken={accessToken}
          sessions={sessions}
          resumes={resumes}
          onLoadSessions={listSessions}
          onLoadResumes={listResumes}
          onResumeSession={handleResumeSession}
          onDeleteSession={handleDeleteSession}
          onGetSessionResume={getSessionResume}
          onGetSessionCoverLetter={getSessionCoverLetter}
          onGetDefaultResume={getDefaultResume}
          onGetResumeById={getResumeById}
          onUpdateMasterResume={updateMasterResume}
          onGetResumeHistory={getResumeHistory}
          onSetDefaultResume={handleSetDefaultBaseResume}
          onDeleteResume={handleDeleteBaseResume}
          loading={sessionLoading}
          resumesLoading={resumesLoading}
          error={sessionError}
        />
      )}
      </div>
    </ErrorBoundary>
    </ToastProvider>
  );
}
