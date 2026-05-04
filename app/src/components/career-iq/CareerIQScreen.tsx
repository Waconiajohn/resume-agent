import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import type { CareerIQRoom } from './Sidebar';
import { OnboardingTour } from '@/components/OnboardingTour';
import { CareerProfileSummaryCard } from './CareerProfileSummaryCard';
import { useCareerProfile } from './CareerProfileContext';
import { YourProfilePage } from './YourProfilePage';
import { RoomSkeleton } from '@/components/shared/RoomSkeleton';
import { DashboardHome } from './DashboardHome';
import { MobileBriefing } from './MobileBriefing';
import { useMediaQuery } from './useMediaQuery';
import { useMomentum } from '@/hooks/useMomentum';
import { useCoachRecommendation } from '@/hooks/useCoachRecommendation';
import { useJobApplications } from '@/hooks/useJobApplications';
import { useV3Master } from '@/hooks/useV3Master';
import { Breadcrumbs } from '@/components/shared/Breadcrumbs';
import { supabase } from '@/lib/supabase';
import { hydrateV2SessionLoad, type LoadSessionResponseBody } from '@/lib/resume-v2-session-load';
import type { AgentDataSources } from '@/lib/lms-injection-mapper';
import type { PipelineInterviewCard } from './InterviewLabRoom';
import type { RealFeedEvent } from './ZoneAgentFeed';
import type { CoachSession } from '@/types/session';
import type { FinalResume, MasterResume, MasterResumeListItem } from '@/types/resume';
import { resolveWorkspaceRoom, toExposedWorkspaceRoom, type WorkspaceRoom } from './workspaceRoomAccess';
import { WorkspaceTopNav } from './WorkspaceTopNav';

const FinancialWellnessRoom = lazy(() => import('./FinancialWellnessRoom').then((module) => ({ default: module.FinancialWellnessRoom })));
const ResumeWorkshopRoom = lazy(() => import('./ResumeWorkshopRoom').then((module) => ({ default: module.ResumeWorkshopRoom })));
const LinkedInStudioRoom = lazy(() => import('./LinkedInStudioRoom').then((module) => ({ default: module.LinkedInStudioRoom })));
const JobCommandCenterRoom = lazy(() => import('./JobCommandCenterRoom').then((module) => ({ default: module.JobCommandCenterRoom })));
const InterviewLabRoom = lazy(() => import('./InterviewLabRoom').then((module) => ({ default: module.InterviewLabRoom })));
const SmartReferralsRoom = lazy(() => import('./SmartReferralsRoom').then((module) => ({ default: module.SmartReferralsRoom })));
const LMSRoom = lazy(() => import('@/components/lms/LMSRoom').then((module) => ({ default: module.LMSRoom })));
const ExecutiveBioRoom = lazy(() => import('./ExecutiveBioRoom').then((module) => ({ default: module.ExecutiveBioRoom })));
const LiveWebinarsRoom = lazy(() => import('./LiveWebinarsRoom').then((module) => ({ default: module.LiveWebinarsRoom })));

const ROOM_LABELS: Record<WorkspaceRoom, string> = {
  dashboard: 'Today',
  'career-profile': 'Career Vault',
  resume: 'Tailor Resume',
  linkedin: 'LinkedIn Growth',
  jobs: 'Find Jobs',
  networking: 'Networking',
  interview: 'Interview & Offer',
  financial: 'Retirement Bridge',
  learning: 'Playbook',
  'live-webinars': 'Live Webinars',
  'executive-bio': 'Executive Bio',
};

interface CoverLetterSession {
  id: string;
  company_name: string | null;
  created_at: string;
  pipeline_status: string | null;
}

interface CareerIQScreenProps {
  userName: string;
  accessToken?: string | null;
  onNavigate: (route: string) => void;
  sessions?: CoachSession[];
  resumes?: MasterResumeListItem[];
  sessionsLoading?: boolean;
  resumesLoading?: boolean;
  onNewSession?: () => void;
  onResumeSession?: (sessionId: string) => void;
  initialRoom?: string;
  onLoadSessions?: (filters?: { limit?: number; status?: string }) => void;
  onLoadResumes?: () => void;
  onDeleteSession?: (sessionId: string) => Promise<boolean>;
  onGetSessionResume?: (sessionId: string) => Promise<FinalResume | null>;
  onGetSessionCoverLetter?: (sessionId: string) => Promise<{ letter: string; quality_score?: number | null } | null>;
  onGetDefaultResume?: () => Promise<MasterResume | null>;
  onGetResumeById?: (resumeId: string) => Promise<MasterResume | null>;
  onUpdateMasterResume?: (resumeId: string, changes: Record<string, unknown>) => Promise<MasterResume | null>;
  onGetResumeHistory?: (resumeId: string) => Promise<Array<{ id: string; changes_summary: string; created_at: string }>>;
  onSetDefaultResume?: (resumeId: string) => Promise<boolean>;
  onDeleteResume?: (resumeId: string) => Promise<boolean>;
  /** Called with the tour replay function so the parent can wire it to the Help button */
  onRegisterTourReplay?: (replayFn: () => void) => void;
}

export function CareerIQScreen({
  userName,
  accessToken = null,
  onNavigate,
  sessions = [],
  resumes = [],
  sessionsLoading = false,
  resumesLoading = false,
  onNewSession,
  onResumeSession,
  initialRoom,
  onLoadSessions,
  onLoadResumes,
  onDeleteSession,
  onGetSessionResume,
  onGetSessionCoverLetter,
  onGetDefaultResume,
  onGetResumeById,
  onUpdateMasterResume,
  onGetResumeHistory,
  onSetDefaultResume,
  onDeleteResume,
  onRegisterTourReplay,
}: CareerIQScreenProps) {
  const location = useLocation();
  const [activeRoom, setActiveRoom] = useState<WorkspaceRoom>(resolveWorkspaceRoom(initialRoom));
  const {
    profile,
    story: _story,
    signals,
    dashboardState,
    summary,
    updateBenchmarkProfileItem,
    answerBenchmarkDiscoveryQuestion,
  } = useCareerProfile();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [pipelineInterviews, setPipelineInterviews] = useState<PipelineInterviewCard[]>([]);
  const [coverLetterSessions, setCoverLetterSessions] = useState<CoverLetterSession[]>([]);
  const { checkStalls } = useMomentum();
  const { recommendation: coachRec, refresh: refreshCoachRec } = useCoachRecommendation();
  const { applications } = useJobApplications();
  // Sprint E3 — lets the dashboard hero render the "returning user" variant
  // when the user already has a Career Vault but hasn't finished the Why
  // Me positioning interview.
  const v3Master = useV3Master(accessToken);
  const hasMasterResume = Boolean(v3Master.summary) || resumes.some((r) => r.is_default);
  const [lmsAgentDataSources, setLmsAgentDataSources] = useState<AgentDataSources>({});
  const workspaceLaunchContext = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const jobApplicationId = params.get('job');
    const company = params.get('company');
    const role = params.get('role');
    const focus = params.get('focus');
    const sessionId = params.get('session');

    return {
      jobApplicationId: jobApplicationId?.trim() || undefined,
      company: company?.trim() || undefined,
      role: role?.trim() || undefined,
      focus: focus?.trim() || undefined,
      sessionId: sessionId?.trim() || undefined,
    };
  }, [location.search]);
  const normalizedWorkspaceFocus = workspaceLaunchContext.focus;

  useEffect(() => {
    if (initialRoom) {
      setActiveRoom(resolveWorkspaceRoom(initialRoom));
    }
  }, [initialRoom]);

  // Sprint C3 — fire check-stalls once per CareerIQScreen mount, not every
  // time the callback reference changes. useMomentum returns a fresh
  // useCallback each render, so the previous dependency list re-ran this
  // effect on every render and burned the server's 3/5min rate budget.
  const stallsCheckedRef = useRef(false);
  useEffect(() => {
    if (stallsCheckedRef.current) return;
    stallsCheckedRef.current = true;
    const timer = setTimeout(() => {
      void checkStalls();
    }, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadInterviewing() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        const { data } = await supabase
          .from('job_applications')
          .select('id, company, title')
          .eq('pipeline_stage', 'interviewing')
          .neq('status', 'archived');

        if (!cancelled && data) {
          setPipelineInterviews(data.map((item) => ({ id: item.id, company: item.company, role: item.title })));
        }
      } catch {
        if (!cancelled) setPipelineInterviews([]);
      }
    }

    void loadInterviewing();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadCoverLetters() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        const { data } = await supabase
          .from('coach_sessions')
          .select('id, last_panel_data, pipeline_status, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10);

        if (!cancelled && data) {
          const nextSessions = data
            .filter((row) => {
              const panelData = row.last_panel_data as Record<string, unknown> | null;
              return panelData?.product_type === 'cover_letter';
            })
            .slice(0, 5)
            .map((row) => {
              const panelData = row.last_panel_data as Record<string, unknown>;
              return {
                id: row.id as string,
                company_name: typeof panelData.company_name === 'string' ? panelData.company_name : null,
                created_at: row.created_at as string,
                pipeline_status: typeof row.pipeline_status === 'string' ? row.pipeline_status : null,
              };
            });

          setCoverLetterSessions(nextSessions);
        }
      } catch {
        if (!cancelled) setCoverLetterSessions([]);
      }
    }

    void loadCoverLetters();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (activeRoom !== 'learning') return;

    let cancelled = false;

    async function loadLmsDataSources() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        // Load resume pipeline result + master resume in parallel
        const [sessionResult, masterResumeResult] = await Promise.all([
          supabase
            .from('coach_sessions')
            .select('id, tailored_sections')
            .eq('user_id', user.id)
            .eq('product_type', 'resume_v2')
            .eq('pipeline_status', 'complete')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('master_resumes')
            .select('id, summary, experience, skills, education, certifications, contact_info, raw_text, version, evidence_items')
            .eq('user_id', user.id)
            .eq('is_default', true)
            .limit(1)
            .maybeSingle(),
        ]);

        if (cancelled) return;

        const sources: AgentDataSources = {};

        // Pipeline result
        const stored = sessionResult.data?.tailored_sections as Record<string, unknown> | null;
        if (stored && stored.version === 'v2') {
          const body = stored as unknown as LoadSessionResponseBody;
          const hydrated = hydrateV2SessionLoad(sessionResult.data!.id as string, body);
          if (hydrated) sources.resumePipelineResult = hydrated.data;
        }

        // Master resume
        if (masterResumeResult.data) {
          sources.masterResume = masterResumeResult.data as Record<string, unknown>;
        }

        setLmsAgentDataSources(sources);
      } catch {
        // Data unavailable — LMS slots gracefully show as unavailable
      }
    }

    void loadLmsDataSources();
    return () => { cancelled = true; };
  }, [activeRoom]);

  const mobileFeedEvents = useMemo<RealFeedEvent[] | undefined>(() => {
    const events: RealFeedEvent[] = [];

    for (const session of sessions) {
      const company = session.company_name || 'Untitled';
      const isComplete = session.pipeline_stage === 'complete' || session.pipeline_stage === 'completed';
      events.push({
        type: isComplete ? 'session_completed' : 'session_created',
        timestamp: session.created_at,
        detail: isComplete
          ? `Completed resume for ${company}`
          : `Started resume session for ${company}`,
      });
    }

    for (const session of coverLetterSessions) {
      const company = session.company_name || 'Untitled';
      const isComplete = session.pipeline_status === 'complete';
      events.push({
        type: isComplete ? 'session_completed' : 'session_created',
        timestamp: session.created_at,
        detail: isComplete
          ? `Generated cover letter for ${company}`
          : `Started cover letter for ${company}`,
      });
    }

    if (events.length === 0) return undefined;
    events.sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());
    return events.slice(0, 5);
  }, [coverLetterSessions, sessions]);

  const handleRoomNavigate = (room: WorkspaceRoom | CareerIQRoom) => {
    const resolvedRoom = resolveWorkspaceRoom(room);
    refreshCoachRec();
    setActiveRoom(resolvedRoom);
    onNavigate(resolvedRoom === 'dashboard' ? '/workspace' : `/workspace?room=${resolvedRoom}`);
  };

  const handleTourMount = useCallback(
    (replayFn: () => void) => {
      onRegisterTourReplay?.(replayFn);
    },
    [onRegisterTourReplay],
  );

  const openCareerProfile = () => handleRoomNavigate('career-profile');
  const breadcrumbItems = activeRoom === 'dashboard'
    ? [{ label: 'Workspace' }]
    : [
        { label: 'Workspace', onClick: () => handleRoomNavigate('dashboard') },
        { label: ROOM_LABELS[activeRoom] ?? 'Workspace' },
      ];

  const renderContent = () => {
    if (activeRoom === 'dashboard') {
      return (
        <DashboardHome
          dashboardState={dashboardState}
          onNavigateRoom={handleRoomNavigate}
          onRefineWhyMe={openCareerProfile}
          hasMasterResume={hasMasterResume}
          sessions={sessions}
          applications={applications}
          onNavigateRoute={onNavigate}
        />
      );
    }

    if (activeRoom === 'career-profile') {
      return (
        <YourProfilePage
          onGetDefaultResume={onGetDefaultResume}
          onNavigateResume={() => handleRoomNavigate('resume')}
          careerProfile={profile}
          focusSection={normalizedWorkspaceFocus}
          onUpdateBenchmarkItem={updateBenchmarkProfileItem}
          onAnswerDiscoveryQuestion={answerBenchmarkDiscoveryQuestion}
        />
      );
    }

    if (activeRoom === 'resume') {
      return (
        <ResumeWorkshopRoom
          sessions={sessions}
          resumes={resumes}
          loading={sessionsLoading}
          accessToken={accessToken}
          initialFocus={normalizedWorkspaceFocus}
          resumesLoading={resumesLoading}
          onNewSession={onNewSession ?? (() => onNavigate('/resume-builder/session'))}
          onResumeSession={onResumeSession ?? (() => undefined)}
          onNavigate={onNavigate}
          onLoadSessions={onLoadSessions}
          onLoadResumes={onLoadResumes}
          onDeleteSession={onDeleteSession}
          onGetSessionResume={onGetSessionResume}
          onGetSessionCoverLetter={onGetSessionCoverLetter}
          onGetDefaultResume={onGetDefaultResume}
          onGetResumeById={onGetResumeById}
          onUpdateMasterResume={onUpdateMasterResume}
          onGetResumeHistory={onGetResumeHistory}
          onSetDefaultResume={onSetDefaultResume}
          onDeleteResume={onDeleteResume}
        />
      );
    }

    if (activeRoom === 'financial') {
      return (
        <FinancialWellnessRoom
          careerProfileSummary={summary}
          onOpenCareerProfile={openCareerProfile}
          initialSessionId={workspaceLaunchContext.sessionId}
        />
      );
    }

    if (activeRoom === 'linkedin') {
      return (
        <LinkedInStudioRoom
          signals={signals}
          careerProfile={profile}
        />
      );
    }

    if (activeRoom === 'jobs') {
      return (
        <JobCommandCenterRoom
          onNavigate={onNavigate}
          onNavigateRoom={handleRoomNavigate}
        />
      );
    }

    if (activeRoom === 'interview') {
      return (
        <InterviewLabRoom
          pipelineInterviews={pipelineInterviews}
          initialCompany={workspaceLaunchContext.company}
          initialRole={workspaceLaunchContext.role}
          initialJobApplicationId={workspaceLaunchContext.jobApplicationId}
          initialFocus={normalizedWorkspaceFocus}
          initialAssetSessionId={workspaceLaunchContext.sessionId}
        />
      );
    }

    if (activeRoom === 'networking') {
      return <SmartReferralsRoom initialFocus={normalizedWorkspaceFocus} onNavigate={onNavigate} />;
    }

    if (activeRoom === 'learning') {
      return (
        <LMSRoom
          onNavigateRoom={handleRoomNavigate}
          agentDataSources={lmsAgentDataSources}
        />
      );
    }

    if (activeRoom === 'executive-bio') {
      return <ExecutiveBioRoom />;
    }

    if (activeRoom === 'live-webinars') {
      return <LiveWebinarsRoom />;
    }

    const unhandledRoom: never = activeRoom;
    return <div data-unhandled-room={unhandledRoom} />;
  };

  if (isMobile) {
    if (activeRoom === 'dashboard') {
      return (
        <>
          <div className="px-4 pt-4">
            <CareerProfileSummaryCard
              summary={summary}
              title="Career Vault powers your job search"
              onOpenProfile={openCareerProfile}
              onContinue={() => handleRoomNavigate(summary.nextRecommendedRoom === 'career-profile' ? 'career-profile' : 'resume')}
            />
          </div>
          <MobileBriefing
            userName={userName}
            signals={signals}
            dashboardState={dashboardState}
            activeRoom={activeRoom}
            onRefineWhyMe={openCareerProfile}
            onNavigateRoom={handleRoomNavigate}
            hasResumeSessions={sessions.length > 0}
            sessionCount={sessions.length}
            coachRecommendation={coachRec}
            feedEvents={mobileFeedEvents}
            onNavigateRoute={onNavigate}
          />
        </>
      );
    }

    return (
      <div className="flex h-[calc(100vh-4rem)] flex-col">
        <div className="border-b border-[var(--line-soft)] px-4 pb-3 pt-4">
          <Breadcrumbs items={breadcrumbItems} />
          <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => handleRoomNavigate('dashboard')}
            className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--accent)]"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Home
          </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pb-6">
          <Suspense fallback={<RoomSkeleton />}>
            {renderContent()}
          </Suspense>
        </div>

        <MobileBriefing
          userName={userName}
          signals={signals}
          dashboardState={dashboardState}
          activeRoom={toExposedWorkspaceRoom(activeRoom)}
          onRefineWhyMe={openCareerProfile}
          onNavigateRoom={handleRoomNavigate}
          feedEvents={mobileFeedEvents}
          navOnly
          navFixed={false}
        />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <WorkspaceTopNav
        activeRoom={activeRoom}
        onNavigate={handleRoomNavigate}
        onNavigateRoute={onNavigate}
        pathname={location.pathname}
      />

      <main className="flex flex-1 flex-col overflow-y-auto">
        <div className="border-b border-[var(--line-soft)] px-8 py-5">
          <Breadcrumbs items={breadcrumbItems} />
        </div>
        <Suspense fallback={<RoomSkeleton />}>
          {renderContent()}
        </Suspense>
      </main>

      <OnboardingTour onMountReplay={handleTourMount} />
    </div>
  );
}
