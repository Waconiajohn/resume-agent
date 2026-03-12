import { GlassCard } from '@/components/GlassCard';
import type { CareerIQRoom } from './Sidebar';

const ROOM_INFO: Record<string, { title: string; description: string }> = {
  dashboard: { title: 'Dashboard', description: '' },
  resume: { title: 'Resume Builder', description: 'AI-powered resume tailored to every job you apply for.' },
  linkedin: { title: 'LinkedIn Studio', description: 'Profile optimization, content creation, and posting calendar.' },
  jobs: { title: 'Job Command Center', description: 'Search, match, pipeline, and daily momentum tracking.' },
  networking: { title: 'Smart Referrals', description: 'Import connections, find jobs at their companies, referral bonuses, and AI outreach.' },
  interview: { title: 'Interview Lab', description: 'Prep, practice, debrief, and follow-up all in one place.' },
  'salary-negotiation': { title: 'Salary & Negotiation', description: 'Market benchmarks, negotiation scripts, and counter-offer simulation.' },
  'executive-bio': { title: 'Executive Documents', description: 'Professional bios and consulting-grade case studies.' },
  'personal-brand': { title: 'Personal Brand Audit', description: 'Assess and strengthen your executive brand across all channels.' },
  'ninety-day-plan': { title: '90-Day Plan', description: 'Build a compelling first 90 days roadmap tailored to your target role.' },
  financial: { title: 'Financial Wellness', description: 'Retirement readiness assessment and fiduciary planner matching.' },
  learning: { title: 'Learning Center', description: 'Browse our 150-tip library, attend live webinars, and access on-demand resources.' },
  // Legacy IDs — fallback descriptions for any stale references
  'content-calendar': { title: 'LinkedIn Studio', description: 'Content Calendar has moved to LinkedIn Studio.' },
  'case-study': { title: 'Executive Documents', description: 'Case Studies have moved to Executive Documents.' },
  'thank-you-note': { title: 'Interview Lab', description: 'Thank You Notes have moved to Interview Lab.' },
  'network-intelligence': { title: 'Smart Referrals', description: 'Network Intelligence has moved to Smart Referrals.' },
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
