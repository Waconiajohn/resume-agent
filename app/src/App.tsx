import { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSession } from '@/hooks/useSession';
import { useAgent } from '@/hooks/useAgent';
import { Header } from '@/components/Header';
import { AuthGate } from '@/components/AuthGate';
import { LandingScreen } from '@/components/LandingScreen';
import { CoachScreen } from '@/components/CoachScreen';

type View = 'landing' | 'coach';

export default function App() {
  const { user, session, loading, signInWithEmail, signUpWithEmail, signInWithGoogle, signOut } =
    useAuth();
  const accessToken = session?.access_token ?? null;
  const {
    sessions,
    currentSession,
    loading: sessionLoading,
    listSessions,
    createSession,
    loadSession,
    sendMessage,
    setCurrentSession,
  } = useSession(accessToken);

  const {
    messages,
    streamingText,
    tools,
    askPrompt,
    phaseGate,
    currentPhase,
    isProcessing,
    resume,
    addUserMessage,
  } = useAgent(currentSession?.id ?? null, accessToken);

  const [view, setView] = useState<View>('landing');

  const handleNewSession = useCallback(async () => {
    const s = await createSession();
    if (s) {
      setView('coach');
    }
  }, [createSession]);

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
      await sendMessage(currentSession.id, content);
    },
    [currentSession, addUserMessage, sendMessage],
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

      {view === 'coach' && (
        <CoachScreen
          messages={messages}
          streamingText={streamingText}
          tools={tools}
          askPrompt={askPrompt}
          phaseGate={phaseGate}
          currentPhase={currentPhase}
          isProcessing={isProcessing}
          resume={resume}
          onSendMessage={handleSendMessage}
        />
      )}
    </div>
  );
}
