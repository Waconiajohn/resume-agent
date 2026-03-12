import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { Sidebar, type CareerIQRoom } from './Sidebar';
import { RoomSkeleton } from '@/components/shared/RoomSkeleton';

const VALID_ROOMS = new Set<string>([
  'dashboard',
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
  // Legacy IDs — still accepted, redirected to merged rooms
  'content-calendar',
  'case-study',
  'thank-you-note',
  'network-intelligence',
]);

/**
 * Legacy room IDs that have been absorbed into other rooms.
 * When navigated to, they redirect to their parent room.
 */
const LEGACY_REDIRECTS: Record<string, CareerIQRoom> = {
  'content-calendar': 'linkedin',
  'case-study': 'executive-bio',
  'thank-you-note': 'interview',
  'network-intelligence': 'networking',
};

/**
 * Rooms whose server-side feature flags are disabled by default.
 * Rooms in this set render the Coming Soon placeholder instead of their
 * full UI, preventing API calls to routes that return 404.
 *
 * Update this set when a feature flag is enabled in server/.env.
 */
const COMING_SOON_ROOMS = new Set<string>([
  'linkedin',
  'networking',
  'interview',
  'salary-negotiation',
  'executive-bio',
  'personal-brand',
  'ninety-day-plan',
]);

function toValidRoom(value: string | undefined): CareerIQRoom {
  if (!value) return 'dashboard';
  // Redirect legacy room IDs to their merged parent
  const redirect = LEGACY_REDIRECTS[value];
  if (redirect) return redirect;
  if (VALID_ROOMS.has(value)) return value as CareerIQRoom;
  return 'dashboard';
}
import { DashboardHome } from './DashboardHome';
import { WelcomeState } from './WelcomeState';
import { WhyMeEngine } from './WhyMeEngine';
import { LivePulseStrip } from './LivePulseStrip';
import { MobileBriefing } from './MobileBriefing';
import { useWhyMeStory } from './useWhyMeStory';
import { useMediaQuery } from './useMediaQuery';
import { useMomentum } from '@/hooks/useMomentum';
import { useCoachRecommendation } from '@/hooks/useCoachRecommendation';
import { supabase } from '@/lib/supabase';
import type { PipelineInterviewCard } from './InterviewLabRoom';
import type { RealFeedEvent } from './ZoneAgentFeed';

// Lazy-load room components for code splitting
const LiveSessionsRoom = lazy(() => import('./LiveSessionsRoom').then(m => ({ default: m.LiveSessionsRoom })));
const FinancialWellnessRoom = lazy(() => import('./FinancialWellnessRoom').then(m => ({ default: m.FinancialWellnessRoom })));
const ResumeWorkshopRoom = lazy(() => import('./ResumeWorkshopRoom').then(m => ({ default: m.ResumeWorkshopRoom })));
const LinkedInStudioRoom = lazy(() => import('./LinkedInStudioRoom').then(m => ({ default: m.LinkedInStudioRoom })));
const JobCommandCenterRoom = lazy(() => import('./JobCommandCenterRoom').then(m => ({ default: m.JobCommandCenterRoom })));
const InterviewLabRoom = lazy(() => import('./InterviewLabRoom').then(m => ({ default: m.InterviewLabRoom })));
const SalaryNegotiationRoom = lazy(() => import('./SalaryNegotiationRoom').then(m => ({ default: m.SalaryNegotiationRoom })));
const PersonalBrandRoom = lazy(() => import('./PersonalBrandRoom').then(m => ({ default: m.PersonalBrandRoom })));
const NinetyDayPlanRoom = lazy(() => import('./NinetyDayPlanRoom').then(m => ({ default: m.NinetyDayPlanRoom })));
const SmartReferralsRoom = lazy(() => import('./SmartReferralsRoom').then(m => ({ default: m.SmartReferralsRoom })));
const ExecutiveDocumentsRoom = lazy(() => import('./ExecutiveDocumentsRoom').then(m => ({ default: m.ExecutiveDocumentsRoom })));
const RoomPlaceholder = lazy(() => import('./RoomPlaceholder').then(m => ({ default: m.RoomPlaceholder })));
const CoachDrawer = lazy(() => import('./CoachDrawer').then(m => ({ default: m.CoachDrawer })));

interface ResumeSession {
  id: string;
  company_name?: string | null;
  created_at: string;
  pipeline_stage?: string | null;
}

interface CoverLetterSession {
  id: string;
  company_name: string | null;
  created_at: string;
  pipeline_status: string | null;
}

interface SavedResume {
  id: string;
  name?: string;
  is_default?: boolean;
  created_at: string;
}

interface CareerIQScreenProps {
  userName: string;
  onNavigate: (route: string) => void;
  sessions?: ResumeSession[];
  resumes?: SavedResume[];
  sessionsLoading?: boolean;
  onNewSession?: () => void;
  onResumeSession?: (sessionId: string) => void;
  initialRoom?: string;
}


export function CareerIQScreen({
  userName,
  onNavigate,
  sessions = [],
  resumes = [],
  sessionsLoading = false,
  onNewSession,
  onResumeSession,
  initialRoom,
}: CareerIQScreenProps) {
  const [activeRoom, setActiveRoom] = useState<CareerIQRoom>(
    toValidRoom(initialRoom)
  );

  // When initialRoom changes (e.g., user clicks a different tool from catalog),
  // update the active room even if already mounted
  useEffect(() => {
    if (initialRoom) {
      setActiveRoom(toValidRoom(initialRoom));
    }
  }, [initialRoom]);

  const [showWhyMeEngine, setShowWhyMeEngine] = useState(false);
  const { story, updateField, signals, dashboardState } = useWhyMeStory();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [pipelineInterviews, setPipelineInterviews] = useState<PipelineInterviewCard[]>([]);
  const [coverLetterSessions, setCoverLetterSessions] = useState<CoverLetterSession[]>([]);
  const { summary: momentum, nudges, loading: momentumLoading, dismissNudge, checkStalls } = useMomentum();
  const { recommendation: coachRec, loading: coachLoading, refresh: refreshCoachRec } = useCoachRecommendation();
  const [coachDrawerOpen, setCoachDrawerOpen] = useState(false);

  // Check for stalled activity after initial load (non-blocking, 2s delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      void checkStalls();
    }, 2000);
    return () => clearTimeout(timer);
  }, [checkStalls]);

  // Load pipeline cards in "Interviewing" stage for Interview Lab
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
        if (data && !cancelled) {
          setPipelineInterviews(data.map((d) => ({ id: d.id, company: d.company, role: d.title })));
        }
      } catch { /* fallback to empty */ }
    }
    loadInterviewing();
    return () => { cancelled = true; };
  }, []);

  // Load recent cover letter sessions
  useEffect(() => {
    let cancelled = false;
    async function loadCoverLetterSessions() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const { data } = await supabase
          .from('coach_sessions')
          .select('id, last_panel_data, pipeline_status, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10);
        if (data && !cancelled) {
          const clSessions = data
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
          setCoverLetterSessions(clSessions);
        }
      } catch { /* fallback to empty */ }
    }
    loadCoverLetterSessions();
    return () => { cancelled = true; };
  }, []);

  // Compute feed events for mobile briefing (mirrors DashboardHome logic)
  const mobileFeedEvents = useMemo<RealFeedEvent[] | undefined>(() => {
    const events: RealFeedEvent[] = [];
    for (const s of sessions) {
      const company = s.company_name || 'Untitled';
      const isComplete = s.pipeline_stage === 'complete' || s.pipeline_stage === 'completed';
      events.push({
        type: isComplete ? 'session_completed' : 'session_created',
        timestamp: s.created_at,
        detail: isComplete
          ? `Completed resume for ${company} — ready for download`
          : `Started resume session for ${company}`,
      });
    }
    for (const s of coverLetterSessions) {
      const company = s.company_name || 'Untitled';
      const isComplete = s.pipeline_status === 'complete';
      events.push({
        type: isComplete ? 'session_completed' : 'session_created',
        timestamp: s.created_at,
        detail: isComplete
          ? `Generated cover letter for ${company}`
          : `Started cover letter for ${company}`,
      });
    }
    if (events.length === 0) return undefined;
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return events.slice(0, 5);
  }, [sessions, coverLetterSessions]);

  const handleRoomNavigate = (room: CareerIQRoom) => {
    setActiveRoom(room);
    refreshCoachRec();
  };

  const handleStartWhyMe = () => setShowWhyMeEngine(true);
  const handleCloseWhyMe = () => setShowWhyMeEngine(false);

  const renderContent = () => {
    // Why-Me Engine overlay
    if (showWhyMeEngine) {
      return (
        <div className="p-6">
          <WhyMeEngine
            story={story}
            signals={signals}
            onUpdate={updateField}
            onClose={handleCloseWhyMe}
          />
        </div>
      );
    }

    // Feature-flag guard: rooms whose backend flags are disabled show Coming Soon
    if (COMING_SOON_ROOMS.has(activeRoom)) {
      return <RoomPlaceholder room={activeRoom} />;
    }

    // State 1: New user — show welcome
    if (dashboardState === 'new-user' && activeRoom === 'dashboard') {
      return <WelcomeState userName={userName} onStartWhyMe={handleStartWhyMe} />;
    }

    // Dashboard home with all 4 zones
    if (activeRoom === 'dashboard') {
      return (
        <DashboardHome
          userName={userName}
          signals={signals}
          dashboardState={dashboardState}
          onNavigateRoom={handleRoomNavigate}
          onRefineWhyMe={handleStartWhyMe}
          hasResumeSessions={sessions.length > 0}
          sessionCount={sessions.length}
          recentSessions={sessions}
          coverLetterSessions={coverLetterSessions}
          momentum={momentum}
          momentumLoading={momentumLoading}
          nudges={nudges}
          onDismissNudge={dismissNudge}
          onOpenCoach={() => setCoachDrawerOpen(true)}
          coachRecommendation={coachRec}
          coachLoading={coachLoading}
        />
      );
    }

    // Resume Workshop room
    if (activeRoom === 'resume') {
      return (
        <ResumeWorkshopRoom
          sessions={sessions}
          resumes={resumes}
          loading={sessionsLoading}
          onNewSession={onNewSession ?? (() => onNavigate('intake'))}
          onResumeSession={onResumeSession ?? ((id) => onNavigate(`coach:${id}`))}
          onNavigate={onNavigate}
        />
      );
    }

    // Live Sessions room
    if (activeRoom === 'learning') {
      return <LiveSessionsRoom />;
    }

    // Financial Wellness room
    if (activeRoom === 'financial') {
      return <FinancialWellnessRoom />;
    }

    // LinkedIn Studio room
    if (activeRoom === 'linkedin') {
      return <LinkedInStudioRoom signals={signals} whyMeClarity={story.colleaguesCameForWhat} />;
    }

    // Job Command Center room
    if (activeRoom === 'jobs') {
      return <JobCommandCenterRoom onNavigate={onNavigate} onNavigateRoom={handleRoomNavigate} />;
    }

    // Interview Lab room
    if (activeRoom === 'interview') {
      return <InterviewLabRoom pipelineInterviews={pipelineInterviews} />;
    }

    // Smart Referrals room (merged NI + Networking Hub)
    if (activeRoom === 'networking') {
      return <SmartReferralsRoom />;
    }

    // Salary Negotiation room
    if (activeRoom === 'salary-negotiation') {
      return <SalaryNegotiationRoom />;
    }

    // Executive Documents room (merged Bio + Case Study)
    if (activeRoom === 'executive-bio') {
      return <ExecutiveDocumentsRoom />;
    }

    // Personal Brand room
    if (activeRoom === 'personal-brand') {
      return <PersonalBrandRoom />;
    }

    // 90-Day Plan room
    if (activeRoom === 'ninety-day-plan') {
      return <NinetyDayPlanRoom />;
    }

    // Other rooms
    return <RoomPlaceholder room={activeRoom} />;
  };

  // Mobile: show daily briefing on dashboard, room content on any other room
  if (isMobile) {
    if (activeRoom === 'dashboard') {
      return (
        <>
          <MobileBriefing
            userName={userName}
            signals={signals}
            dashboardState={dashboardState}
            activeRoom={activeRoom}
            onRefineWhyMe={handleStartWhyMe}
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
              isMobile={isMobile}
            />
          </Suspense>
        </>
      );
    }

    return (
      <div className="flex flex-col min-h-screen pb-20">
        {/* Mobile room header with back button */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-white/[0.06]">
          <button
            type="button"
            onClick={() => handleRoomNavigate('dashboard')}
            className="flex items-center gap-1.5 text-[#98b3ff] text-[13px] font-medium"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Home
          </button>
        </div>

        {/* Room content */}
        <div className="flex-1 overflow-y-auto">
          <Suspense fallback={<RoomSkeleton />}>
            {renderContent()}
          </Suspense>
        </div>

        {/* Bottom nav persists on room views so users can switch rooms */}
        <MobileBriefing
          userName={userName}
          signals={signals}
          dashboardState={dashboardState}
          activeRoom={activeRoom}
          onRefineWhyMe={handleStartWhyMe}
          onNavigateRoom={handleRoomNavigate}
          feedEvents={mobileFeedEvents}
          navOnly
        />
        {/* Coach drawer available on all mobile room views */}
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
      <main className="flex-1 overflow-y-auto flex flex-col">
        <LivePulseStrip />
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
