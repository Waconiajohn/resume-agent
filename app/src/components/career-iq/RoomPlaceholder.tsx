import { GlassCard } from '@/components/GlassCard';
import type { CareerIQRoom } from './Sidebar';

const ROOM_INFO: Record<CareerIQRoom, { title: string; description: string }> = {
  dashboard: { title: 'Dashboard', description: '' },
  resume: { title: 'Resume Workshop', description: 'Create targeted resumes, manage your master resume, generate cover letters, and check your Quick Score.' },
  linkedin: { title: 'LinkedIn Studio', description: 'Optimize your profile, plan your content strategy, and track your LinkedIn analytics.' },
  'content-calendar': { title: 'Content Calendar', description: 'Generate a 30-day LinkedIn posting plan based on your expertise and positioning.' },
  jobs: { title: 'Job Command Center', description: 'Discover matching roles, manage Boolean searches, and track your application pipeline.' },
  networking: { title: 'Networking Hub', description: 'Identify target contacts, manage outreach, and track follow-ups.' },
  interview: { title: 'Interview Lab', description: 'Prepare for interviews, practice with mock sessions, and review your history.' },
  'salary-negotiation': { title: 'Salary Negotiation', description: 'Get market benchmarks, leverage points, and word-for-word negotiation scripts.' },
  'executive-bio': { title: 'Executive Bio Suite', description: 'Generate professional bios for speaker events, board roles, LinkedIn, and more.' },
  'case-study': { title: 'Case Study Generator', description: 'Transform your achievements into consulting-grade case studies.' },
  'thank-you-note': { title: 'Thank You Note', description: 'Craft personalized post-interview thank you notes that reinforce your candidacy.' },
  'personal-brand': { title: 'Personal Brand Audit', description: 'Assess and strengthen your executive brand across all channels.' },
  'ninety-day-plan': { title: '90-Day Plan', description: 'Build a compelling first 90 days roadmap tailored to your target role.' },
  'network-intelligence': { title: 'Network Intelligence', description: 'Map your network, identify key connectors, and grow strategic relationships.' },
  financial: { title: 'Financial Wellness', description: 'Explore your Retirement Bridge Analysis, access educational resources, and connect with a financial planner.' },
  learning: { title: 'Learning Center', description: 'Browse our 150-tip library, attend live webinars, and access on-demand resources.' },
};

export function RoomPlaceholder({ room }: { room: CareerIQRoom }) {
  const info = ROOM_INFO[room];
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
