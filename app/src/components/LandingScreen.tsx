import { useEffect, useState } from 'react';
import { Sparkles, Plus, Star, Trash2, AlertTriangle } from 'lucide-react';
import { GlassCard } from './GlassCard';
import { GlassButton } from './GlassButton';
import { SessionCard } from './SessionCard';
import type { CoachSession } from '@/types/session';
import type { MasterResumeListItem } from '@/types/resume';

interface LandingScreenProps {
  sessions: CoachSession[];
  resumes: MasterResumeListItem[];
  loading: boolean;
  resumesLoading: boolean;
  error?: string | null;
  onNewSession: () => void;
  onResumeSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => Promise<boolean>;
  onLoadSessions: () => void;
  onLoadResumes: () => void;
  onSetDefaultResume: (resumeId: string) => Promise<boolean>;
  onDeleteResume: (resumeId: string) => Promise<boolean>;
}

type LandingToast = {
  type: 'success' | 'error';
  message: string;
};

type ConfirmState = {
  kind: 'resume' | 'session';
  id: string;
  title: string;
  message: string;
  confirmLabel: string;
};

export function LandingScreen({
  sessions,
  resumes,
  loading,
  resumesLoading,
  error,
  onNewSession,
  onResumeSession,
  onDeleteSession,
  onLoadSessions,
  onLoadResumes,
  onSetDefaultResume,
  onDeleteResume,
}: LandingScreenProps) {
  const [busyResumeId, setBusyResumeId] = useState<string | null>(null);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);
  const [toast, setToast] = useState<LandingToast | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  useEffect(() => {
    onLoadSessions();
    onLoadResumes();
  }, [onLoadSessions, onLoadResumes]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const showToast = (type: LandingToast['type'], message: string) => {
    setToast({ type, message });
  };

  const handleSetDefault = async (resumeId: string) => {
    setBusyResumeId(resumeId);
    try {
      const ok = await onSetDefaultResume(resumeId);
      if (ok) {
        showToast('success', 'Default base resume updated.');
      } else {
        showToast('error', 'Failed to set default base resume.');
      }
    } finally {
      setBusyResumeId(null);
    }
  };

  const handleDeleteResume = async (resumeId: string) => {
    setBusyResumeId(resumeId);
    try {
      const ok = await onDeleteResume(resumeId);
      if (ok) {
        showToast('success', 'Base resume deleted.');
      } else {
        showToast('error', 'Failed to delete base resume.');
      }
    } finally {
      setBusyResumeId(null);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    setBusySessionId(sessionId);
    try {
      const ok = await onDeleteSession(sessionId);
      if (ok) {
        showToast('success', 'Session deleted.');
      } else {
        showToast('error', 'Failed to delete session.');
      }
    } finally {
      setBusySessionId(null);
    }
  };

  const confirmAction = async () => {
    if (!confirmState) return;
    const target = confirmState;
    setConfirmState(null);
    if (target.kind === 'resume') {
      await handleDeleteResume(target.id);
      return;
    }
    await handleDeleteSession(target.id);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-slate-300/[0.07] via-transparent to-transparent" />

      <div className="relative z-10 flex flex-col items-center text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.12] bg-white/[0.04]">
          <Sparkles className="h-8 w-8 text-[#afc4ff]" />
        </div>

        <h1 className="mb-2 text-3xl font-bold text-white/90">
          Your AI Resume Coach
        </h1>
        <p className="mb-8 max-w-md text-sm text-white/50">
          I research companies, analyze job descriptions, and help you craft a tailored resume that gets interviews.
        </p>
        {error && (
          <div className="mb-6 w-full rounded-lg border border-red-300/28 bg-red-500/[0.08] px-4 py-2 text-left text-xs text-red-100/90">
            {error}
          </div>
        )}
        {toast && (
          <div
            className={`mb-6 w-full rounded-lg border px-4 py-2 text-left text-xs ${
              toast.type === 'success'
                ? 'border-emerald-300/28 bg-emerald-500/[0.08] text-emerald-100/90'
                : 'border-red-300/28 bg-red-500/[0.08] text-red-100/90'
            }`}
          >
            {toast.message}
          </div>
        )}

        <GlassButton onClick={onNewSession} className="mb-12 px-8 py-3 text-base">
          <Plus className="h-5 w-5" />
          Start New Session
        </GlassButton>

        <div className="mb-10 w-full">
          <h2 className="mb-4 text-left text-sm font-medium text-white/60">Base Resumes</h2>
          {resumesLoading ? (
            <GlassCard className="w-full p-4">
              <div className="h-4 w-40 animate-pulse rounded-lg bg-white/[0.03]" />
            </GlassCard>
          ) : resumes.length === 0 ? (
            <GlassCard className="w-full p-4 text-left">
              <p className="text-xs text-white/50">
                No saved base resumes yet. Complete a session and use "Save As Base Resume" to add one.
              </p>
            </GlassCard>
          ) : (
            <div className="space-y-2">
              {resumes.map((resume) => (
                <GlassCard key={resume.id} className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 text-left">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-xs text-white/70">Version {resume.version}</span>
                        {resume.is_default && (
                          <span className="rounded-full border border-white/[0.16] bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/78">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="line-clamp-2 text-xs text-white/50">
                        {(resume.summary ?? '').trim() || 'No summary preview available'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {!resume.is_default && (
                        <button
                          type="button"
                          onClick={() => void handleSetDefault(resume.id)}
                          disabled={busyResumeId === resume.id}
                          className="inline-flex items-center justify-center rounded-md p-1.5 text-white/50 transition-colors hover:bg-white/[0.08] hover:text-white/85 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Set as default base resume"
                          title="Set as default"
                        >
                          <Star className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmState({
                            kind: 'resume',
                            id: resume.id,
                            title: 'Delete base resume?',
                            message: 'This action cannot be undone.',
                            confirmLabel: 'Delete Resume',
                          });
                        }}
                        disabled={busyResumeId === resume.id}
                        className="inline-flex items-center justify-center rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white/75 disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label="Delete base resume"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </div>

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
                  deleteDisabled={busySessionId === session.id}
                  onDelete={() => {
                    setConfirmState({
                      kind: 'session',
                      id: session.id,
                      title: 'Delete session?',
                      message: 'This action cannot be undone.',
                      confirmLabel: 'Delete Session',
                    });
                  }}
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

      {confirmState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4">
          <GlassCard className="w-full max-w-sm border border-white/[0.18] p-5 text-left">
            <h3 className="mb-2 text-sm font-semibold text-white/90">{confirmState.title}</h3>
            <p className="mb-4 text-xs text-white/60">{confirmState.message}</p>
            <div className="flex justify-end gap-2">
              <GlassButton variant="ghost" onClick={() => setConfirmState(null)}>
                Cancel
              </GlassButton>
              <GlassButton variant="primary" onClick={() => void confirmAction()}>
                {confirmState.confirmLabel}
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
