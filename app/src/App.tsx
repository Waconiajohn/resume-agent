import { useState, useCallback } from 'react';
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
import { resumeToText } from '@/lib/export';

type View = 'landing' | 'intake' | 'coach';

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
    loadSession,
    deleteSession,
    setDefaultResume,
    deleteResume,
    saveResumeAsBase,
    sendMessage,
    setCurrentSession,
    startPipeline,
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
    sessionComplete,
    error: agentError,
    panelType,
    panelData,
    addUserMessage,
    pipelineStage,
    positioningProfileFound,
    isPipelineGateActive,
    setIsPipelineGateActive,
  } = useAgent(currentSession?.id ?? null, accessToken);

  const [view, setView] = useState<View>('landing');
  const [intakeLoading, setIntakeLoading] = useState(false);
  const [intakeInitialResumeText, setIntakeInitialResumeText] = useState('');
  const [intakeDefaultResumeId, setIntakeDefaultResumeId] = useState<string | null>(null);

  const handleNewSession = useCallback(async () => {
    setView('intake');
    setIntakeInitialResumeText('');
    setIntakeDefaultResumeId(null);
    const defaultResume = await getDefaultResume();
    if (defaultResume?.raw_text?.trim()) {
      setIntakeInitialResumeText(defaultResume.raw_text);
      setIntakeDefaultResumeId(defaultResume.id);
    }
  }, [getDefaultResume]);

  const handleIntakeSubmit = useCallback(
    async (data: { resumeText: string; jobDescription: string; companyName: string }) => {
      setIntakeLoading(true);
      try {
        const s = await createSession(intakeDefaultResumeId ?? undefined);
        if (!s) {
          setIntakeLoading(false);
          return;
        }
        setView('coach');
        setTimeout(async () => {
          await startPipeline(s.id, data.resumeText, data.jobDescription, data.companyName);
          setIntakeLoading(false);
        }, 500);
      } catch {
        setIntakeLoading(false);
      }
    },
    [createSession, startPipeline, intakeDefaultResumeId],
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
      const ok = await sendMessage(currentSession.id, content);
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
      const ok = await respondToGate(currentSession.id, gate, response);
      setIsPipelineGateActive(!ok);
    },
    [currentSession, respondToGate, setIsPipelineGateActive],
  );

  const handleSignOut = useCallback(async () => {
    await signOut();
    setCurrentSession(null);
    setView('landing');
  }, [signOut, setCurrentSession]);

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
    <ErrorBoundary>
      <div className="h-screen bg-surface">
        <Header email={user.email} onSignOut={handleSignOut} />

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
        />
      )}

      {view === 'coach' && !connected && !sessionComplete && !agentError && currentSession && (
        <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[#afc4ff]" />
            <span className="text-sm text-white/50">Connecting to session...</span>
          </div>
        </div>
      )}

      {view === 'coach' && (connected || sessionComplete || agentError || sessionError) && (
        <CoachScreen
          messages={messages}
          streamingText={streamingText}
          tools={tools}
          askPrompt={askPrompt}
          phaseGate={phaseGate}
          currentPhase={pipelineStage ?? currentPhase}
          isProcessing={isProcessing}
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
        />
      )}
      </div>
    </ErrorBoundary>
  );
}
