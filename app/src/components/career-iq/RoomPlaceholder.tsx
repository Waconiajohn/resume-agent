import { GlassCard } from '@/components/GlassCard';
import type { CareerIQRoom } from './Sidebar';

const ROOM_INFO: Record<string, { title: string; description: string }> = {
  dashboard: { title: 'Workspace Home', description: '' },
  resume: { title: 'Resume Builder', description: 'AI-powered resume tailored to every job you apply for.' },
  'career-profile': { title: 'Career Profile', description: 'Define the story, strengths, and direction that power every tool in your workspace.' },
  linkedin: { title: 'LinkedIn', description: 'Profile optimization, content creation, and posting calendar.' },
  jobs: { title: 'Job Search', description: 'Search, match, pipeline, and daily momentum tracking.' },
  networking: { title: 'Smart Referrals', description: 'Import connections, find jobs at their companies, referral bonuses, and AI outreach.' },
  interview: { title: 'Interview Prep', description: 'Prep, practice, debrief, and follow-up all in one place.' },
  'salary-negotiation': { title: 'Negotiation Prep', description: 'Offer-stage benchmarks, negotiation scripts, and total-comp strategy.' },
  'executive-bio': { title: 'Executive Documents', description: 'Professional bios and consulting-grade case studies.' },
  financial: { title: 'Financial Wellness', description: 'Retirement readiness assessment and fiduciary planner matching.' },
  learning: { title: 'Learning Center', description: 'Browse our 150-tip library, attend live webinars, and access on-demand resources.' },
  // Legacy IDs — fallback descriptions for any stale references
  'content-calendar': { title: 'LinkedIn', description: 'Content Calendar has moved into LinkedIn.' },
  'case-study': { title: 'Executive Documents', description: 'Case Studies have moved to Executive Documents.' },
  'thank-you-note': { title: 'Interview Prep', description: 'Thank You Notes have moved into Interview Prep.' },
  'network-intelligence': { title: 'Smart Referrals', description: 'Network Intelligence has moved to Smart Referrals.' },
  'personal-brand': { title: 'Career Profile', description: 'Personal brand work now lives inside Career Profile.' },
  'ninety-day-plan': { title: 'Interview Prep', description: '30-60-90 Day Plan has moved into Interview Prep.' },
};

const FALLBACK = { title: 'Coming Soon', description: 'This room is being built by the agent team.' };

export function RoomPlaceholder({ room }: { room: CareerIQRoom }) {
  const info = ROOM_INFO[room] ?? FALLBACK;
  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <GlassCard className="p-8 text-center">
        <div className="text-[11px] font-medium text-[#98b3ff]/60 uppercase tracking-widest mb-2">
          Coming Soon
        </div>
        <h2 className="text-xl font-semibold text-white/90">{info.title}</h2>
        <p className="mt-3 text-[14px] text-white/50 max-w-md mx-auto leading-relaxed">
          {info.description}
        </p>
        <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-[12px] text-white/40">
          This room is being built by the agent team
        </div>
      </GlassCard>
    </div>
  );
}
