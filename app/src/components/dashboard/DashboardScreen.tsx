import { useEffect, useState } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { DashboardTabs } from '@/components/dashboard/DashboardTabs';
import type { CoachSession } from '@/types/session';
import type { MasterResume, MasterResumeListItem, FinalResume } from '@/types/resume';

// These tab content components are imported once available; placeholders rendered initially
// and replaced as stories 7-11 are implemented.
import { SessionHistoryTab } from '@/components/dashboard/SessionHistoryTab';
import { MasterResumeTab } from '@/components/dashboard/MasterResumeTab';
import { EvidenceLibraryTab } from '@/components/dashboard/EvidenceLibraryTab';

const TABS = [
  { id: 'sessions', label: 'Session History' },
  { id: 'master_resume', label: 'Master Resume' },
  { id: 'evidence_library', label: 'Evidence Library' },
];

export interface DashboardScreenProps {
  accessToken: string | null;
  sessions: CoachSession[];
  resumes: MasterResumeListItem[];
  onLoadSessions: (filters?: { limit?: number; status?: string }) => void;
  onLoadResumes: () => void;
  onResumeSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => Promise<boolean>;
  onGetSessionResume: (sessionId: string) => Promise<FinalResume | null>;
  onGetDefaultResume: () => Promise<MasterResume | null>;
  onGetResumeById: (resumeId: string) => Promise<MasterResume | null>;
  onUpdateMasterResume: (resumeId: string, changes: Record<string, unknown>) => Promise<MasterResume | null>;
  onGetResumeHistory: (resumeId: string) => Promise<Array<{ id: string; changes_summary: string; created_at: string }>>;
  onSetDefaultResume: (resumeId: string) => Promise<boolean>;
  onDeleteResume: (resumeId: string) => Promise<boolean>;
  loading: boolean;
  resumesLoading: boolean;
  error?: string | null;
}

export function DashboardScreen({
  sessions,
  resumes,
  onLoadSessions,
  onLoadResumes,
  onResumeSession,
  onDeleteSession,
  onGetSessionResume,
  onGetDefaultResume,
  onGetResumeById,
  onUpdateMasterResume,
  onGetResumeHistory,
  onSetDefaultResume,
  onDeleteResume,
  loading,
  resumesLoading,
  error,
}: DashboardScreenProps) {
  const [activeTab, setActiveTab] = useState('sessions');

  useEffect(() => {
    onLoadSessions();
    onLoadResumes();
  }, [onLoadSessions, onLoadResumes]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <GlassCard className="p-6">
        <div className="mb-6">
          <h1 className="mb-1 text-xl font-semibold text-white/90">Dashboard</h1>
          <p className="text-sm text-white/50">Manage your resume sessions, master resume, and evidence library.</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-300/28 bg-red-500/[0.08] px-4 py-2 text-xs text-red-100/90">
            {error}
          </div>
        )}

        <DashboardTabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="mt-6">
          {activeTab === 'sessions' && (
            <SessionHistoryTab
              sessions={sessions}
              loading={loading}
              onLoadSessions={onLoadSessions}
              onResumeSession={onResumeSession}
              onDeleteSession={onDeleteSession}
              onGetSessionResume={onGetSessionResume}
            />
          )}

          {activeTab === 'master_resume' && (
            <MasterResumeTab
              resumes={resumes}
              loading={resumesLoading}
              onLoadResumes={onLoadResumes}
              onGetDefaultResume={onGetDefaultResume}
              onGetResumeById={onGetResumeById}
              onUpdateMasterResume={onUpdateMasterResume}
              onSetDefaultResume={onSetDefaultResume}
              onDeleteResume={onDeleteResume}
              onGetResumeHistory={onGetResumeHistory}
            />
          )}

          {activeTab === 'evidence_library' && (
            <EvidenceLibraryTab
              resumes={resumes}
              onGetDefaultResume={onGetDefaultResume}
              onGetResumeById={onGetResumeById}
              onUpdateMasterResume={onUpdateMasterResume}
            />
          )}
        </div>
      </GlassCard>
    </div>
  );
}
