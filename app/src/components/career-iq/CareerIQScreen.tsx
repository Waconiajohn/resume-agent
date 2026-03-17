import { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { Sidebar, type CareerIQRoom } from './Sidebar';
import { RoomSkeleton } from '@/components/shared/RoomSkeleton';
import { DashboardHome } from './DashboardHome';
import { WhyMeEngine } from './WhyMeEngine';
import { MobileBriefing } from './MobileBriefing';
import { useWhyMeStory } from './useWhyMeStory';
import { useMediaQuery } from './useMediaQuery';
import { useMomentum } from '@/hooks/useMomentum';
import { useCoachRecommendation } from '@/hooks/useCoachRecommendation';
import { supabase } from '@/lib/supabase';
import type { PipelineInterviewCard } from './InterviewLabRoom';
import type { RealFeedEvent } from './ZoneAgentFeed';
import type { CoachRecommendation } from '@/hooks/useCoachRecommendation';
import type { CoachSession } from '@/types/session';
import type { FinalResume, MasterResume, MasterResumeListItem } from '@/types/resume';
import type { PipelineCard } from './ZoneYourPipeline';

const VALID_ROOMS = new Set<string>([
  'dashboard',
  'career-profile',
  'resume',
  'linkedin',
  'jobs',
  'networking',
  'interview',
  'salary-negotiation',
  'executive-bio',
  'personal-brand',
  'ninety-day-plan',
  'financial',
  'learning',
  'content-calendar',
  'case-study',
  'thank-you-note',
  'network-intelligence',
]);

const LEGACY_REDIRECTS: Record<string, CareerIQRoom> = {
  'content-calendar': 'linkedin',
  'case-study': 'executive-bio',
  'thank-you-note': 'interview',
  'network-intelligence': 'networking',
};

const COMING_SOON_ROOMS = new Set<string>([
  'linkedin',
  'networking',
  'interview',
  'salary-negotiation',
  'executive-bio',
  'personal-brand',
  'ninety-day-plan',
  'financial',
  'learning',
]);

function toValidRoom(value: string | undefined): CareerIQRoom {
  if (!value) return 'dashboard';
  const redirect = LEGACY_REDIRECTS[value];
  if (redirect) return redirect;
  if (VALID_ROOMS.has(value)) return value as CareerIQRoom;
  return 'dashboard';
}

const MOCK_PIPELINE_CARDS: PipelineCard[] = [
  { id: 'mp-1', company: 'Google', role: 'Sr. Program Manager', stage: 'Interviewing', daysSinceMovement: 1, hasNewActivity: true, interviewRound: 2, scheduledDate: new Date(Date.now() + 3 * 86400000).toISOString() },
  { id: 'mp-2', company: 'Microsoft', role: 'Principal PM', stage: 'Applied', daysSinceMovement: 3, hasNewActivity: false },
  { id: 'mp-3', company: 'Amazon', role: 'Sr. TPM', stage: 'Discovered', daysSinceMovement: 0, hasNewActivity: true },
];

const MOCK_COACH_REC: CoachRecommendation = {
  action: 'Strengthen your Career Profile first, then open Resume Builder and tailor the resume for your top target role.',
  product: 'Resume Builder',
  room: 'career-profile',
  urgency: 'immediate',
  phase: 'active_search',
  phase_label: 'Active Job Search',
  rationale: 'Your profile sharpens the recommendations every other tool gives you, so it is the fastest leverage point.',
};

const LiveSessionsRoom = lazy(() => import('./LiveSessionsRoom').then((module) => ({ default: module.LiveSessionsRoom })));
const FinancialWellnessRoom = lazy(() => import('./FinancialWellnessRoom').then((module) => ({ default: module.FinancialWellnessRoom })));
const ResumeWorkshopRoom = lazy(() => import('./ResumeWorkshopRoom').then((module) => ({ default: module.ResumeWorkshopRoom })));
const LinkedInStudioRoom = lazy(() => import('./LinkedInStudioRoom').then((module) => ({ default: module.LinkedInStudioRoom })));
const JobCommandCenterRoom = lazy(() => import('./JobCommandCenterRoom').then((module) => ({ default: module.JobCommandCenterRoom })));
const InterviewLabRoom = lazy(() => import('./InterviewLabRoom').then((module) => ({ default: module.InterviewLabRoom })));
const SalaryNegotiationRoom = lazy(() => import('./SalaryNegotiationRoom').then((module) => ({ default: module.SalaryNegotiationRoom })));
const PersonalBrandRoom = lazy(() => import('./PersonalBrandRoom').then((module) => ({ default: module.PersonalBrandRoom })));
const NinetyDayPlanRoom = lazy(() => import('./NinetyDayPlanRoom').then((module) => ({ default: module.NinetyDayPlanRoom })));
const SmartReferralsRoom = lazy(() => import('./SmartReferralsRoom').then((module) => ({ default: module.SmartReferralsRoom })));
const ExecutiveDocumentsRoom = lazy(() => import('./ExecutiveDocumentsRoom').then((module) => ({ default: module.ExecutiveDocumentsRoom })));
const RoomPlaceholder = lazy(() => import('./RoomPlaceholder').then((module) => ({ default: module.RoomPlaceholder })));
const CoachDrawer = lazy(() => import('./CoachDrawer').then((module) => ({ default: module.CoachDrawer })));

interface CoverLetterSession {
  id: string;
  company_name: string | null;
  created_at: string;
  pipeline_status: string | null;
}

interface CareerIQScreenProps {
  userName: string;
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
}

export function CareerIQScreen({
  userName,
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
}: CareerIQScreenProps) {
  const [activeRoom, setActiveRoom] = useState<CareerIQRoom>(toValidRoom(initialRoom));
  const { story, updateField, signals, dashboardState } = useWhyMeStory();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [pipelineInterviews, setPipelineInterviews] = useState<PipelineInterviewCard[]>([]);
  const [coverLetterSessions, setCoverLetterSessions] = useState<CoverLetterSession[]>([]);
  const { nudges, dismissNudge, checkStalls } = useMomentum();
  const { recommendation: coachRec, loading: coachLoading, refresh: refreshCoachRec } = useCoachRecommendation();
  const [coachDrawerOpen, setCoachDrawerOpen] = useState(false);
  const [salaryNegoPrefill, setSalaryNegoPrefill] = useState<{ company: string; role: string } | null>(null);

  useEffect(() => {
    if (initialRoom) {
      setActiveRoom(toValidRoom(initialRoom));
    }
  }, [initialRoom]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void checkStalls();
    }, 2000);
    return () => clearTimeout(timer);
  }, [checkStalls]);

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

  const handleRoomNavigate = (room: CareerIQRoom) => {
    setActiveRoom(room);
    refreshCoachRec();
    onNavigate(room === 'dashboard' ? '/workspace' : `/workspace?room=${room}`);
  };

  const handleInterviewPrepClick = (card: PipelineCard) => {
    setPipelineInterviews((current) => {
      if (current.some((item) => item.id === card.id)) return current;
      return [{ id: card.id, company: card.company, role: card.role }, ...current];
    });
    handleRoomNavigate('interview');
  };

  const handleNegotiationPrepClick = (card: PipelineCard) => {
    setSalaryNegoPrefill({ company: card.company, role: card.role });
    handleRoomNavigate('salary-negotiation');
  };

  const openCareerProfile = () => handleRoomNavigate('career-profile');

  const renderContent = () => {
    if (COMING_SOON_ROOMS.has(activeRoom)) {
      return <RoomPlaceholder room={activeRoom} />;
    }

    if (activeRoom === 'dashboard') {
      const isDemo = sessions.length === 0 && coverLetterSessions.length === 0;
      return (
        <DashboardHome
          userName={userName}
          signals={signals}
          dashboardState={dashboardState}
          onNavigateRoom={handleRoomNavigate}
          onRefineWhyMe={openCareerProfile}
          hasResumeSessions={isDemo ? true : sessions.length > 0}
          sessionCount={isDemo ? 3 : sessions.length}
          nudges={nudges}
          onDismissNudge={dismissNudge}
          onOpenCoach={() => setCoachDrawerOpen(true)}
          coachRecommendation={isDemo ? MOCK_COACH_REC : coachRec}
          coachLoading={isDemo ? false : coachLoading}
          mockPipelineCards={isDemo ? MOCK_PIPELINE_CARDS : undefined}
          onInterviewPrepClick={isDemo ? undefined : handleInterviewPrepClick}
          onNegotiationPrepClick={isDemo ? undefined : handleNegotiationPrepClick}
        />
      );
    }

    if (activeRoom === 'career-profile') {
      return (
        <div className="mx-auto max-w-4xl p-6">
          <WhyMeEngine
            story={story}
            signals={signals}
            onUpdate={updateField}
            onClose={() => handleRoomNavigate('dashboard')}
          />
        </div>
      );
    }

    if (activeRoom === 'resume') {
      return (
        <ResumeWorkshopRoom
          sessions={sessions}
          resumes={resumes}
          loading={sessionsLoading}
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

    if (activeRoom === 'learning') {
      return <LiveSessionsRoom />;
    }

    if (activeRoom === 'financial') {
      return <FinancialWellnessRoom />;
    }

    if (activeRoom === 'linkedin') {
      return <LinkedInStudioRoom signals={signals} whyMeClarity={story.colleaguesCameForWhat} />;
    }

    if (activeRoom === 'jobs') {
      return <JobCommandCenterRoom onNavigate={onNavigate} onNavigateRoom={handleRoomNavigate} />;
    }

    if (activeRoom === 'interview') {
      return <InterviewLabRoom pipelineInterviews={pipelineInterviews} />;
    }

    if (activeRoom === 'networking') {
      return <SmartReferralsRoom />;
    }

    if (activeRoom === 'salary-negotiation') {
      return (
        <SalaryNegotiationRoom
          prefillCompany={salaryNegoPrefill?.company}
          prefillRole={salaryNegoPrefill?.role}
          onPrefillConsumed={() => setSalaryNegoPrefill(null)}
        />
      );
    }

    if (activeRoom === 'executive-bio') {
      return <ExecutiveDocumentsRoom />;
    }

    if (activeRoom === 'personal-brand') {
      return <PersonalBrandRoom />;
    }

    if (activeRoom === 'ninety-day-plan') {
      return <NinetyDayPlanRoom />;
    }

    return <RoomPlaceholder room={activeRoom} />;
  };

  if (isMobile) {
    if (activeRoom === 'dashboard') {
      return (
        <>
          <MobileBriefing
            userName={userName}
            signals={signals}
            dashboardState={dashboardState}
            activeRoom={activeRoom}
            onRefineWhyMe={openCareerProfile}
            onNavigateRoom={handleRoomNavigate}
            feedEvents={mobileFeedEvents}
          />
          <Suspense fallback={null}>
            <CoachDrawer
              userName={userName}
              onNavigate={(room) => handleRoomNavigate(toValidRoom(room))}
              isOpen={coachDrawerOpen}
              onOpen={() => setCoachDrawerOpen(true)}
              onClose={() => setCoachDrawerOpen(false)}
              isMobile
            />
          </Suspense>
        </>
      );
    }

    return (
      <div className="flex min-h-screen flex-col pb-20">
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 pb-3 pt-4">
          <button
            type="button"
            onClick={() => handleRoomNavigate('dashboard')}
            className="flex items-center gap-1.5 text-[13px] font-medium text-[#98b3ff]"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Home
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <Suspense fallback={<RoomSkeleton />}>
            {renderContent()}
          </Suspense>
        </div>

        <MobileBriefing
          userName={userName}
          signals={signals}
          dashboardState={dashboardState}
          activeRoom={activeRoom}
          onRefineWhyMe={openCareerProfile}
          onNavigateRoom={handleRoomNavigate}
          feedEvents={mobileFeedEvents}
          navOnly
        />

        <Suspense fallback={null}>
          <CoachDrawer
            userName={userName}
            onNavigate={(room) => handleRoomNavigate(toValidRoom(room))}
            isOpen={coachDrawerOpen}
            onOpen={() => setCoachDrawerOpen(true)}
            onClose={() => setCoachDrawerOpen(false)}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <Sidebar
        activeRoom={activeRoom}
        onNavigate={handleRoomNavigate}
        dashboardState={dashboardState}
        onOpenCoach={() => setCoachDrawerOpen(true)}
        coachData={{
          firstName: userName?.split(' ')[0] || '',
          phase: coachRec?.phase_label || 'Getting Started',
          recommendation: coachRec?.action,
        }}
      />

      <main className="flex flex-1 flex-col overflow-y-auto">
        <Suspense fallback={<RoomSkeleton />}>
          {renderContent()}
        </Suspense>
      </main>

      <Suspense fallback={null}>
        <CoachDrawer
          userName={userName}
          onNavigate={(room) => handleRoomNavigate(toValidRoom(room))}
          isOpen={coachDrawerOpen}
          onOpen={() => setCoachDrawerOpen(true)}
          onClose={() => setCoachDrawerOpen(false)}
        />
      </Suspense>
    </div>
  );
}
