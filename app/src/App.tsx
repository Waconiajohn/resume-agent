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

type View = 'landing' | 'intake' | 'coach';

export default function App() {
  const { user, session, loading, signInWithEmail, signUpWithEmail, signInWithGoogle, signOut } =
    useAuth();
  const accessToken = session?.access_token ?? null;
  const {
    sessions,
    currentSession,
    loading: sessionLoading,
    error: sessionError,
    listSessions,
    createSession,
    loadSession,
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
  } = useAgent(currentSession?.id ?? null, accessToken);

  const [view, setView] = useState<View>('landing');
  const [intakeLoading, setIntakeLoading] = useState(false);

  const handleNewSession = useCallback(() => {
    setView('intake');
  }, []);

  const handleIntakeSubmit = useCallback(
    async (data: { resumeText: string; jobDescription: string; companyName: string }) => {
      setIntakeLoading(true);
      try {
        const s = await createSession();
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
    [createSession, startPipeline],
  );

  const handleResumeSession = useCallback(
    async (sessionId: string) => {
      await loadSession(sessionId);
      setView('coach');
    },
    [loadSession],
  );

  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!currentSession) return;
      addUserMessage(content);
      const ok = await sendMessage(currentSession.id, content);
      if (!ok) {
        // API rejected the message (e.g. 409 still processing) — reset processing state
        setIsProcessing(false);
      }
    },
    [currentSession, addUserMessage, sendMessage, setIsProcessing],
  );

  const handlePipelineRespond = useCallback(
    async (gate: string, response: unknown) => {
      if (!currentSession) return;
      await respondToGate(currentSession.id, gate, response);
    },
    [currentSession, respondToGate],
  );

  const handleSignOut = useCallback(async () => {
    await signOut();
    setCurrentSession(null);
    setView('landing');
  }, [signOut, setCurrentSession]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-blue-400" />
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
          loading={sessionLoading}
          onNewSession={handleNewSession}
          onResumeSession={handleResumeSession}
          onLoadSessions={listSessions}
        />
      )}

      {view === 'intake' && (
        <PipelineIntakeForm
          onSubmit={handleIntakeSubmit}
          onBack={() => setView('landing')}
          loading={intakeLoading}
        />
      )}

      {view === 'coach' && !connected && !sessionComplete && !agentError && currentSession && (
        <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-blue-400" />
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
          resume={resume}
          panelType={panelType}
          panelData={panelData}
          error={agentError ?? sessionError}
          onSendMessage={handleSendMessage}
          onPipelineRespond={handlePipelineRespond}
          positioningProfileFound={positioningProfileFound}
        />
      )}
    </div>
    </ErrorBoundary>
  );
}
