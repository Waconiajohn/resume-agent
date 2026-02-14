import { useEffect } from 'react';
import { Sparkles, Plus } from 'lucide-react';
import { GlassCard } from './GlassCard';
import { GlassButton } from './GlassButton';
import { SessionCard } from './SessionCard';
import type { CoachSession } from '@/types/session';

interface LandingScreenProps {
  sessions: CoachSession[];
  loading: boolean;
  onNewSession: () => void;
  onResumeSession: (sessionId: string) => void;
  onLoadSessions: () => void;
}

export function LandingScreen({
  sessions,
  loading,
  onNewSession,
  onResumeSession,
  onLoadSessions,
}: LandingScreenProps) {
  useEffect(() => {
    onLoadSessions();
  }, [onLoadSessions]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-purple-500/5 to-transparent pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/20">
          <Sparkles className="h-8 w-8 text-blue-400" />
        </div>

        <h1 className="mb-2 text-3xl font-bold text-white/90">
          Your AI Resume Coach
        </h1>
        <p className="mb-8 max-w-md text-sm text-white/50">
          I research companies, analyze job descriptions, and help you craft a tailored resume that gets interviews.
        </p>

        <GlassButton onClick={onNewSession} className="mb-12 px-8 py-3 text-base">
          <Plus className="h-5 w-5" />
          Start New Session
        </GlassButton>

        {sessions.length > 0 && (
          <div className="w-full">
            <h2 className="mb-4 text-left text-sm font-medium text-white/60">
              Recent Sessions
            </h2>
            <div className="space-y-2">
              {sessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  onClick={() => onResumeSession(session.id)}
                />
              ))}
            </div>
          </div>
        )}

        {loading && (
          <GlassCard className="w-full p-4">
            <div className="h-4 w-32 bg-white/[0.03] animate-pulse rounded-lg" />
          </GlassCard>
        )}
      </div>
    </div>
  );
}
