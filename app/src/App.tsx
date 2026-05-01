import { useState, useCallback, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
const ProfileSetupPage = lazy(() => import('./components/profile-setup/ProfileSetupPage'));
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useSession } from '@/hooks/useSession';
import { useAgent } from '@/hooks/useAgent';
import { Header } from '@/components/Header';
import { AuthGate } from '@/components/AuthGate';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SalesPage } from '@/components/SalesPage';
import { SettingsPage } from '@/components/SettingsPage';
import { BillingDashboard } from '@/components/BillingDashboard';
import { AffiliateDashboard } from '@/components/AffiliateDashboard';
import { CareerIQScreen } from '@/components/career-iq/CareerIQScreen';
import { CareerProfileProvider } from '@/components/career-iq/CareerProfileContext';
import { WorkspaceLayout } from '@/components/career-iq/WorkspaceLayout';
import { TailorPickerProvider } from '@/components/applications/TailorPickerProvider';
import { ApplicationWorkspaceRoute } from '@/components/career-iq/ApplicationWorkspaceRoute';
import { ApplicationsListScreen } from '@/components/career-iq/ApplicationsListScreen';
import { V3PipelineScreen } from '@/components/resume-v3/V3PipelineScreen';
import { ResumeV2VisualHarness } from '@/components/resume-v2/dev/ResumeV2VisualHarness';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { ToastProvider } from '@/components/Toast';
import { ApiErrorToaster } from '@/components/ApiErrorToaster';
import { SessionExpiryToaster } from '@/components/SessionExpiryToaster';
import { EmailVerificationBanner } from '@/components/EmailVerificationBanner';
import { SessionDegradedBanner } from '@/components/SessionDegradedBanner';
import { AuthEventEmitter } from '@/components/AuthEventEmitter';
import { MfaChallengeGate } from '@/components/auth/MfaChallengeGate';
import { TermsOfService } from '@/components/legal/TermsOfService';
import { PrivacyPolicy } from '@/components/legal/PrivacyPolicy';
import { Contact } from '@/components/legal/Contact';
import { NotFoundPage } from '@/components/NotFoundPage';
import { ResetPassword } from '@/components/auth/ResetPassword';
import { resumeToText } from '@/lib/export';
import { buildMasterResumePromotionPayload } from '@/lib/master-resume-promotion';
import { resumeDraftToFinalResume } from '@/lib/resume-v2-export';
import { trackProductEvent } from '@/lib/product-telemetry';
import { flushProductTelemetryEvents } from '@/lib/product-telemetry-sync';
import {
  buildApplicationWorkspaceRoute,
  buildResumeBuilderSessionRoute,
  buildResumeWorkspaceRoute,
  getAppView,
  getNormalizedWorkspaceRedirect,
  getResumeBuilderSessionIdFromSearch,
  getWorkspaceEntryRedirect,
  getWorkspaceRoomFromSearch,
  RESUME_BUILDER_SESSION_ROUTE,
  resolveNavigationTarget,
} from '@/lib/app-routing';
import { API_BASE } from '@/lib/api';
import type { ClarificationMemoryEntry, MasterPromotionItem, ResumeDraft } from '@/types/resume-v2';

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    user,
    session,
    loading,
    displayName,
    sessionDegraded,
    signInWithEmail,
    signUpWithEmail,
    signInWithProvider,
    updateProfile,
    signOut,
  } = useAuth();
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
  const replayTourRef = useRef<(() => void) | undefined>(undefined);
  const handleTourReplay = useCallback(() => {
    replayTourRef.current?.();
  }, []);
  const [checkoutStatus, setCheckoutStatus] = useState<'success' | 'cancelled' | null>(null);
  const [intakeInitialResumeText, setIntakeInitialResumeText] = useState('');
  const [intakeDefaultResumeId, setIntakeDefaultResumeId] = useState<string | null>(null);
  const currentView = getAppView(location.pathname);
  const workspaceRoom = getWorkspaceRoomFromSearch(location.search);
  const normalizedWorkspaceRedirect = getNormalizedWorkspaceRedirect(location.search);
  const resumeRouteSessionId = useMemo(() => (
    location.pathname === RESUME_BUILDER_SESSION_ROUTE
      ? getResumeBuilderSessionIdFromSearch(location.search) ?? null
      : null
  ), [location.pathname, location.search]);
  const isResumeV2VisualHarnessRoute = import.meta.env.DEV && location.pathname === '/__dev/resume-v2-visual';
  const isDiscoveryRoute = location.pathname === '/discover';
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
    if (typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('jsdom')) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname, location.search]);

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

  const intakeInitialJobUrl = useMemo(() => {
    if (location.pathname !== RESUME_BUILDER_SESSION_ROUTE) return '';
    return new URLSearchParams(location.search).get('jobUrl')?.trim() ?? '';
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!accessToken) return undefined;

    let cancelled = false;
    let flushing = false;

    const flush = async () => {
      if (cancelled || flushing) return;
      flushing = true;
      try {
        let remaining = Infinity;
        while (!cancelled && remaining > 0) {
          const result = await flushProductTelemetryEvents(accessToken);
          remaining = result.remaining;
          if (result.flushed === 0) break;
        }
      } catch {
        // Best effort only — telemetry should never block the app.
      } finally {
        flushing = false;
      }
    };

    void flush();

    const intervalId = window.setInterval(() => {
      void flush();
    }, 30_000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void flush();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [accessToken]);

  const navigateTo = useCallback((target: string) => {
    navigate(resolveNavigationTarget(target));
  }, [navigate]);

  const handleNewSession = useCallback(async () => {
    setIntakeInitialResumeText('');
    setIntakeDefaultResumeId(null);
    trackProductEvent('resume_builder_session_started', { source: 'workspace_resume_builder' });
    navigate(RESUME_BUILDER_SESSION_ROUTE);
    void listResumes();
    const defaultResume = await getDefaultResume();
    if (defaultResume?.raw_text?.trim()) {
      setIntakeInitialResumeText(defaultResume.raw_text);
      setIntakeDefaultResumeId(defaultResume.id);
    }
  }, [getDefaultResume, listResumes, navigate]);

  // Phase 2 (pursuit timeline) — three-way redirect.
  //   1. Session has job_application_id AND that app exists →
  //      /workspace/application/:id/resume (state hydrates from sessionId)
  //   2. Session has job_application_id but app was deleted →
  //      standalone path with ?staleApplicationId so V3 renders the banner
  //   3. Session has no job_application_id →
  //      standalone path; V3PipelineScreen surfaces the link-to-app prompt
  const handleResumeSession = useCallback(
    async (sessionId: string) => {
      // Look the session up in our cached list first (cheaper than re-fetch).
      const session = sessions.find((s) => s.id === sessionId) ?? await loadSession(sessionId);
      const jobApplicationId = session?.job_application_id ?? null;

      if (!jobApplicationId) {
        navigate(buildResumeBuilderSessionRoute({ sessionId }));
        return;
      }

      // Verify the application still exists. 404 → render standalone with
      // stale-FK banner. Network errors fall through to standalone too.
      try {
        const token = accessToken;
        if (!token) {
          navigate(buildResumeBuilderSessionRoute({ sessionId }));
          return;
        }
        const res = await fetch(`${API_BASE}/job-applications/${encodeURIComponent(jobApplicationId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          navigate(`${buildApplicationWorkspaceRoute(jobApplicationId, 'resume')}?sessionId=${encodeURIComponent(sessionId)}`);
          return;
        }
        if (res.status === 404) {
          navigate(buildResumeBuilderSessionRoute({ sessionId, staleApplicationId: jobApplicationId }));
          return;
        }
        navigate(buildResumeBuilderSessionRoute({ sessionId }));
      } catch {
        navigate(buildResumeBuilderSessionRoute({ sessionId }));
      }
    },
    [accessToken, loadSession, navigate, sessions],
  );

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      const ok = await deleteSession(sessionId);
      if (ok && currentSession?.id === sessionId) {
        navigate(buildResumeWorkspaceRoute());
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
        clarificationMemory?: ClarificationMemoryEntry[];
      },
    ) => {
      const finalResume = resumeDraftToFinalResume(draft, {
        companyName: options?.companyName,
        jobTitle: options?.jobTitle,
        atsScore: options?.atsScore,
      });
      const rawText = resumeToText(finalResume);
      const selectedPromotionItems = options?.promotionItems ?? [];
      const clarificationMemory = options?.clarificationMemory ?? [];

      let targetResumeId = intakeDefaultResumeId ?? resumes.find((item) => item.is_default)?.id ?? null;
      const defaultResume = await getDefaultResume();
      if (!targetResumeId) {
        targetResumeId = defaultResume?.id ?? null;
      }

      if (targetResumeId) {
        const changes = selectedPromotionItems.length > 0 || clarificationMemory.length > 0
          ? buildMasterResumePromotionPayload({
              draft,
              baseResume: defaultResume,
              selectedItems: selectedPromotionItems,
              clarificationMemory,
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
            message: 'Failed to update your Career Proof.',
          };
        }

        setIntakeDefaultResumeId(updated.id);
        setIntakeInitialResumeText(updated.raw_text || changes.raw_text || rawText);
        await listResumes();

        return {
          success: true,
          resumeId: updated.id,
          message: selectedPromotionItems.length > 0 || clarificationMemory.length > 0
            ? `Synced your selected edits${clarificationMemory.length > 0 ? ' and clarification evidence' : ''} to your Career Proof.`
            : 'Career Proof updated.',
        };
      }

      const created = await saveResumeAsBase(finalResume, {
        setAsDefault: true,
        sourceSessionId: options?.sourceSessionId ?? null,
      });
      if (!created.success) {
        return {
          success: false,
          message: created.error ?? 'Failed to create Career Proof.',
        };
      }

      const createdResumeId = created.resumeId ?? null;

      if (createdResumeId && (selectedPromotionItems.length > 0 || clarificationMemory.length > 0)) {
        const changes = buildMasterResumePromotionPayload({
          draft,
          baseResume: null,
          selectedItems: selectedPromotionItems,
          clarificationMemory,
          sourceSessionId: options?.sourceSessionId ?? null,
          companyName: options?.companyName,
          jobTitle: options?.jobTitle,
          atsScore: options?.atsScore,
        });
        await updateMasterResume(createdResumeId, { evidence_items: changes.evidence_items });
      }

      setIntakeDefaultResumeId(createdResumeId);
      setIntakeInitialResumeText(rawText);
      await listResumes();

      return {
        success: true,
        resumeId: createdResumeId ?? undefined,
        message: 'Created your default Career Proof.',
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
    navigate('/sales');
  }, [navigate, setCurrentSession, signOut]);

  if (isResumeV2VisualHarnessRoute) {
    return (
      <ToastProvider>
        <ResumeV2VisualHarness />
      </ToastProvider>
    );
  }

  if (loading) {
    return (
      <ToastProvider>
        <div className="flex h-screen items-center justify-center bg-[var(--surface-0)]">
          <div className="text-center">
            <p className="text-2xl font-semibold text-[var(--text-strong)] tracking-wider mb-4">CareerIQ</p>
            <Loader2 className="h-6 w-6 animate-spin text-[var(--text-soft)] mx-auto" />
          </div>
        </div>
      </ToastProvider>
    );
  }

  const isSalesRoute = location.pathname === '/' || location.pathname === '/sales';
  if (!user) {
    const legalPath = location.pathname === '/terms' || location.pathname === '/privacy' || location.pathname === '/contact';
    const isResetPasswordPath = location.pathname === '/reset-password';
    const knownUnauthPaths = [
      '/', '/sales', '/workspace', '/billing', '/pricing',
      '/profile-setup', '/resume-builder', '/affiliate', '/admin',
    ];
    const isKnownPath = knownUnauthPaths.some(
      (p) => location.pathname === p || location.pathname.startsWith(p + '/'),
    );

    return (
      <ToastProvider>
        {isSalesRoute ? (
          <SalesPage />
        ) : legalPath ? (
          <Routes>
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/contact" element={<Contact />} />
          </Routes>
        ) : isResetPasswordPath ? (
          <ResetPassword />
        ) : isKnownPath ? (
          <AuthGate
            onSignIn={signInWithEmail}
            onSignUp={signUpWithEmail}
            onSocialSignIn={signInWithProvider}
          />
        ) : (
          <NotFoundPage />
        )}
      </ToastProvider>
    );
  }

  if (isDiscoveryRoute) {
    return <Navigate to="/workspace" replace />;
  }

  return (
    <ToastProvider>
      {/* Sprint C7 — subscribes to apiFetch error events and emits toasts. */}
      <ApiErrorToaster />
      {/* Sprint E2 — session-expiry toast when auth silently drops. */}
      <SessionExpiryToaster />
      {/* Sprint E1 — nags users who haven't confirmed their email. */}
      <EmailVerificationBanner user={user} />
      {/* Sprint B (auth hardening) — surfaces silent token-refresh failures. */}
      <SessionDegradedBanner degraded={sessionDegraded} onSignInAgain={handleSignOut} />
      {/* Sprint B (auth hardening) — writes auth events to the activity log. */}
      <AuthEventEmitter />
      {/* Sprint B (auth hardening) — blocks app behind TOTP challenge for users with MFA enrolled. */}
      <MfaChallengeGate hasSession={!!session} onSignOut={handleSignOut} />
      <CareerProfileProvider>
        <ErrorBoundary key={`${currentSession?.id ?? 'no-session'}:${location.pathname}${location.search}`}>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:border focus:border-[var(--line-strong)] focus:bg-[var(--surface-elevated)] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[var(--text-strong)] focus:shadow-[var(--shadow-mid)] focus:outline-none"
          >
            Skip to main content
          </a>
          <div className="min-h-screen">
            <Header
              email={user.email}
              displayName={displayName}
              onSignOut={handleSignOut}
              onUpdateProfile={updateProfile}
              pipelineStage={null}
              isProcessing={false}
              sessionComplete={false}
              onNavigate={navigateTo}
            />

            {checkoutStatus === 'success' && (
              <div className="mx-auto max-w-6xl px-4 pt-3">
                <div role="status" aria-live="polite" className="flex items-center justify-between rounded-xl border border-[var(--badge-green-text)]/30 bg-[var(--badge-green-bg)] px-4 py-3 text-sm text-[var(--badge-green-text)]">
                  <span>Subscription activated! You now have access to all plan features.</span>
                  <button type="button" onClick={() => setCheckoutStatus(null)} className="ml-4 text-xs text-[var(--badge-green-text)] hover:text-[var(--badge-green-text)]/80">Dismiss</button>
                </div>
              </div>
            )}

            {checkoutStatus === 'cancelled' && (
              <div className="mx-auto max-w-6xl px-4 pt-3">
                <div role="status" aria-live="polite" className="flex items-center justify-between rounded-xl border border-[var(--badge-amber-text)]/30 bg-[var(--badge-amber-bg)] px-4 py-3 text-sm text-[var(--badge-amber-text)]">
                  <span>Checkout cancelled. You can try again anytime from billing.</span>
                  <button type="button" onClick={() => setCheckoutStatus(null)} className="ml-4 text-xs text-[var(--badge-amber-text)] hover:text-[var(--badge-amber-text)]/80">Dismiss</button>
                </div>
              </div>
            )}

            <main id="main-content">
            <TailorPickerProvider>
            <Routes>
              <Route path="/" element={<Navigate to="/workspace" replace />} />
              <Route path="/sales" element={<Navigate to="/workspace" replace />} />
              <Route path="/app" element={<Navigate to="/workspace" replace />} />
              <Route path="/career-iq" element={<Navigate to={getWorkspaceEntryRedirect(location.search)} replace />} />
              <Route path="/dashboard" element={<Navigate to="/workspace" replace />} />
              <Route path="/coach" element={<Navigate to={buildResumeWorkspaceRoute()} replace />} />
              <Route path="/resume-builder" element={<Navigate to={buildResumeWorkspaceRoute()} replace />} />
              {/* v3 cutover phase F: resume-builder serves v3.
                  v2 pipeline source is at tag v2-final-2026-04-19; see
                  docs/v3-rebuild/v2-archaeology.md for retrieval. */}
              <Route
                path={RESUME_BUILDER_SESSION_ROUTE}
                element={(
                  <WorkspaceLayout>
                    <V3PipelineScreen
                      accessToken={accessToken}
                      initialResumeText={intakeInitialResumeText}
                      initialSessionId={resumeRouteSessionId}
                    />
                  </WorkspaceLayout>
                )}
              />
              <Route
                path="/profile-setup"
                element={(
                  <WorkspaceLayout>
                    <ErrorBoundary key="profile-setup">
                      <Suspense fallback={
                        <div className="flex h-full items-center justify-center" style={{ background: 'var(--bg-0)' }}>
                          <div className="h-8 w-8 rounded-full border-2 border-[var(--line-soft)] border-t-[var(--link)] motion-safe:animate-spin" />
                        </div>
                      }>
                        <ProfileSetupPage />
                      </Suspense>
                    </ErrorBoundary>
                  </WorkspaceLayout>
                )}
              />
              {/* Approach C Phase 2.1 — My Applications list.
                  Entry point to the application-scoped workspace.
                  Sprint B2 — wrapped in WorkspaceLayout so the global sidebar
                  stays visible; users get consistent nav from any screen. */}
              <Route
                path="/workspace/applications"
                element={(
                  <WorkspaceLayout>
                    <ApplicationsListScreen onNavigate={navigateTo} />
                  </WorkspaceLayout>
                )}
              />
              {/* Approach C Phase 1.2 — application-scoped workspace URLs.
                  /workspace/application/:applicationId/:tool where tool is
                  resume | cover-letter | thank-you-note | networking |
                  interview-prep. React Router remounts children when
                  :applicationId changes, which clears singleton hook state
                  (fixes the state-reset bug as a side effect).
                  Sprint B2 — wrapped in WorkspaceLayout so the global sidebar
                  is still reachable from inside a tool, not just via the
                  browser back button. */}
              <Route
                path="/workspace/application/:applicationId/:tool"
                element={(
                  <WorkspaceLayout>
                    <ApplicationWorkspaceRoute
                      accessToken={accessToken}
                      onNavigate={navigateTo}
                      onGetDefaultResume={getDefaultResume}
                    />
                  </WorkspaceLayout>
                )}
              />
              <Route
                path="/workspace/application/:applicationId"
                element={(
                  <WorkspaceLayout>
                    <ApplicationWorkspaceRoute
                      accessToken={accessToken}
                      onNavigate={navigateTo}
                      onGetDefaultResume={getDefaultResume}
                    />
                  </WorkspaceLayout>
                )}
              />
              <Route path="/pricing" element={<Navigate to="/billing" replace />} />
              <Route
                path="/billing"
                element={(
                  <WorkspaceLayout>
                    <BillingDashboard accessToken={accessToken} />
                  </WorkspaceLayout>
                )}
              />
              {/* Sprint E5 — Settings / Help page. */}
              <Route
                path="/settings"
                element={(
                  <WorkspaceLayout>
                    <SettingsPage
                      user={user}
                      onNavigate={navigateTo}
                      onSignOut={handleSignOut}
                    />
                  </WorkspaceLayout>
                )}
              />
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
                element={<Navigate to="/workspace" replace />}
              />
              <Route
                path="/cover-letter"
                element={<Navigate to={buildResumeWorkspaceRoute('cover-letter')} replace />}
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
                      onRegisterTourReplay={(fn) => { replayTourRef.current = fn; }}
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
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
            </TailorPickerProvider>
            </main>
          </div>
        </ErrorBoundary>
      </CareerProfileProvider>
    </ToastProvider>
  );
}
