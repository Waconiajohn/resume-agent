import { useState, useEffect, lazy, Suspense } from 'react';
import { Sidebar, type CareerIQRoom } from './Sidebar';
import { DashboardHome } from './DashboardHome';
import { WelcomeState } from './WelcomeState';
import { WhyMeEngine } from './WhyMeEngine';
import { LivePulseStrip } from './LivePulseStrip';
import { MobileBriefing } from './MobileBriefing';
import { useWhyMeStory } from './useWhyMeStory';
import { useMediaQuery } from './useMediaQuery';
import { supabase } from '@/lib/supabase';
import type { PipelineInterviewCard } from './InterviewLabRoom';

// Lazy-load room components for code splitting
const LiveSessionsRoom = lazy(() => import('./LiveSessionsRoom').then(m => ({ default: m.LiveSessionsRoom })));
const FinancialWellnessRoom = lazy(() => import('./FinancialWellnessRoom').then(m => ({ default: m.FinancialWellnessRoom })));
const ResumeWorkshopRoom = lazy(() => import('./ResumeWorkshopRoom').then(m => ({ default: m.ResumeWorkshopRoom })));
const LinkedInStudioRoom = lazy(() => import('./LinkedInStudioRoom').then(m => ({ default: m.LinkedInStudioRoom })));
const JobCommandCenterRoom = lazy(() => import('./JobCommandCenterRoom').then(m => ({ default: m.JobCommandCenterRoom })));
const InterviewLabRoom = lazy(() => import('./InterviewLabRoom').then(m => ({ default: m.InterviewLabRoom })));
const NetworkingHubRoom = lazy(() => import('./NetworkingHubRoom').then(m => ({ default: m.NetworkingHubRoom })));
const ContentCalendarRoom = lazy(() => import('./ContentCalendarRoom').then(m => ({ default: m.ContentCalendarRoom })));
const SalaryNegotiationRoom = lazy(() => import('./SalaryNegotiationRoom').then(m => ({ default: m.SalaryNegotiationRoom })));
const ExecutiveBioRoom = lazy(() => import('./ExecutiveBioRoom').then(m => ({ default: m.ExecutiveBioRoom })));
const CaseStudyRoom = lazy(() => import('./CaseStudyRoom').then(m => ({ default: m.CaseStudyRoom })));
const ThankYouNoteRoom = lazy(() => import('./ThankYouNoteRoom').then(m => ({ default: m.ThankYouNoteRoom })));
const PersonalBrandRoom = lazy(() => import('./PersonalBrandRoom').then(m => ({ default: m.PersonalBrandRoom })));
const NinetyDayPlanRoom = lazy(() => import('./NinetyDayPlanRoom').then(m => ({ default: m.NinetyDayPlanRoom })));
const NetworkIntelligenceRoom = lazy(() => import('./NetworkIntelligenceRoom').then(m => ({ default: m.NetworkIntelligenceRoom })));
const RoomPlaceholder = lazy(() => import('./RoomPlaceholder').then(m => ({ default: m.RoomPlaceholder })));

interface ResumeSession {
  id: string;
  company_name?: string | null;
  created_at: string;
  pipeline_stage?: string | null;
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
}

function RoomLoadingSkeleton() {
  return (
    <div className="p-6 max-w-[1400px] mx-auto animate-pulse">
      <div className="h-6 w-48 bg-white/[0.06] rounded mb-2" />
      <div className="h-4 w-80 bg-white/[0.04] rounded mb-6" />
      <div className="h-64 bg-white/[0.03] rounded-xl border border-white/[0.06]" />
    </div>
  );
}

export function CareerIQScreen({
  userName,
  onNavigate,
  sessions = [],
  resumes = [],
  sessionsLoading = false,
  onNewSession,
  onResumeSession,
}: CareerIQScreenProps) {
  const [activeRoom, setActiveRoom] = useState<CareerIQRoom>('dashboard');
  const [showWhyMeEngine, setShowWhyMeEngine] = useState(false);
  const { story, updateField, signals, dashboardState } = useWhyMeStory();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [pipelineInterviews, setPipelineInterviews] = useState<PipelineInterviewCard[]>([]);

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

  const handleRoomNavigate = (room: CareerIQRoom) => {
    setActiveRoom(room);
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

    // Content Calendar room
    if (activeRoom === 'content-calendar') {
      return <ContentCalendarRoom />;
    }

    // Job Command Center room
    if (activeRoom === 'jobs') {
      return <JobCommandCenterRoom onNavigate={onNavigate} onNavigateRoom={handleRoomNavigate} />;
    }

    // Interview Lab room
    if (activeRoom === 'interview') {
      return <InterviewLabRoom pipelineInterviews={pipelineInterviews} />;
    }

    // Networking Hub room
    if (activeRoom === 'networking') {
      return <NetworkingHubRoom />;
    }

    // Salary Negotiation room
    if (activeRoom === 'salary-negotiation') {
      return <SalaryNegotiationRoom />;
    }

    // Executive Bio room
    if (activeRoom === 'executive-bio') {
      return <ExecutiveBioRoom />;
    }

    // Case Study room
    if (activeRoom === 'case-study') {
      return <CaseStudyRoom />;
    }

    // Thank You Note room
    if (activeRoom === 'thank-you-note') {
      return <ThankYouNoteRoom />;
    }

    // Personal Brand room
    if (activeRoom === 'personal-brand') {
      return <PersonalBrandRoom />;
    }

    // 90-Day Plan room
    if (activeRoom === 'ninety-day-plan') {
      return <NinetyDayPlanRoom />;
    }

    // Network Intelligence room
    if (activeRoom === 'network-intelligence') {
      return <NetworkIntelligenceRoom />;
    }

    // Other rooms
    return <RoomPlaceholder room={activeRoom} />;
  };

  // Mobile: show daily briefing card stack
  if (isMobile) {
    return (
      <MobileBriefing
        userName={userName}
        signals={signals}
        dashboardState={dashboardState}
        onRefineWhyMe={handleStartWhyMe}
        onNavigateRoom={handleRoomNavigate}
      />
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <Sidebar
        activeRoom={activeRoom}
        onNavigate={handleRoomNavigate}
        dashboardState={dashboardState}
      />
      <main className="flex-1 overflow-y-auto flex flex-col">
        <LivePulseStrip />
        <Suspense fallback={<RoomLoadingSkeleton />}>
          {renderContent()}
        </Suspense>
      </main>
    </div>
  );
}
