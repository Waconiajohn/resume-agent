import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import {
  Heart,
  TrendingDown,
  Shield,
  BookOpen,
  ArrowRight,
  Clock,
  DollarSign,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// --- Types ---

type FinancialHealth = 'comfortable' | 'needs-attention' | 'at-risk';

interface BridgeAnalysis {
  monthlySavings: number;
  monthlyBurn: number;
  runwayMonths: number;
  healthLevel: FinancialHealth;
}

// --- Mock data ---

const MOCK_BRIDGE: BridgeAnalysis = {
  monthlySavings: 85000,
  monthlyBurn: 8200,
  runwayMonths: 10,
  healthLevel: 'needs-attention',
};

const MOCK_RESOURCES = [
  {
    id: '1',
    title: 'Understanding Your Retirement Bridge',
    description: 'What displaced executives need to know about protecting their retirement savings during a career transition.',
    readTime: '6 min read',
    category: 'Planning',
  },
  {
    id: '2',
    title: 'COBRA vs. Marketplace: Making the Right Health Insurance Decision',
    description: 'A practical comparison for executives between jobs, including often-overlooked tax implications.',
    readTime: '8 min read',
    category: 'Insurance',
  },
  {
    id: '3',
    title: 'Should You Touch Your 401(k)? A Framework for the Decision',
    description: 'When early withdrawal makes sense, when it doesn\'t, and the questions to ask a fiduciary planner.',
    readTime: '5 min read',
    category: 'Retirement',
  },
  {
    id: '4',
    title: 'Negotiating Severance: What Most Executives Leave on the Table',
    description: 'The five components of severance most people don\'t negotiate — and how to approach the conversation.',
    readTime: '7 min read',
    category: 'Negotiation',
  },
];

// --- Components ---

const HEALTH_CONFIG: Record<FinancialHealth, { label: string; color: string; bgColor: string; description: string }> = {
  comfortable: {
    label: 'Comfortable',
    color: 'text-[#b5dec2]',
    bgColor: 'bg-[#b5dec2]',
    description: 'Your savings runway gives you time to be strategic about your next move.',
  },
  'needs-attention': {
    label: 'Needs Attention',
    color: 'text-[#dfc797]',
    bgColor: 'bg-[#dfc797]',
    description: 'Your runway is manageable, but a conversation with a planner could help you extend it and reduce stress.',
  },
  'at-risk': {
    label: 'At Risk',
    color: 'text-[#e8a0a0]',
    bgColor: 'bg-[#e8a0a0]',
    description: 'Your timeline is tight. A fiduciary planner can help you identify options you may not have considered.',
  },
};

function RetirementBridgeCard({ bridge }: { bridge: BridgeAnalysis }) {
  const health = HEALTH_CONFIG[bridge.healthLevel];
  const runwayPercent = Math.min(100, (bridge.runwayMonths / 18) * 100);

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-5">
        <TrendingDown size={18} className="text-[#98b3ff]" />
        <h3 className="text-[15px] font-semibold text-white/85">Retirement Bridge Analysis</h3>
      </div>

      {/* Runway visualization */}
      <div className="mb-5">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[28px] font-bold text-white/90 tabular-nums">
            {bridge.runwayMonths}
          </span>
          <span className="text-[13px] text-white/40">months at current burn rate</span>
        </div>
        <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-700', health.bgColor)}
            style={{ width: `${runwayPercent}%`, opacity: 0.6 }}
          />
        </div>
      </div>

      {/* Key figures */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <DollarSign size={12} className="text-white/30" />
            <span className="text-[11px] text-white/35 uppercase tracking-wider">Monthly Burn</span>
          </div>
          <span className="text-[16px] font-semibold text-white/75 tabular-nums">
            ${bridge.monthlyBurn.toLocaleString()}
          </span>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Shield size={12} className="text-white/30" />
            <span className="text-[11px] text-white/35 uppercase tracking-wider">Liquid Savings</span>
          </div>
          <span className="text-[16px] font-semibold text-white/75 tabular-nums">
            ${bridge.monthlySavings.toLocaleString()}k
          </span>
        </div>
      </div>

      {/* Health indicator */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className={cn('h-2.5 w-2.5 rounded-full', health.bgColor)} />
          <span className={cn('text-[13px] font-semibold', health.color)}>{health.label}</span>
        </div>
        <p className="text-[13px] text-white/45 leading-relaxed">
          {health.description}
        </p>
      </div>
    </GlassCard>
  );
}

function PlannerConnectionCard() {
  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Users size={18} className="text-[#98b3ff]" />
        <h3 className="text-[15px] font-semibold text-white/85">Connect with a Planner</h3>
      </div>

      <p className="text-[14px] text-white/50 leading-relaxed mb-2">
        Our network includes only fiduciary financial planners — professionals legally required to act in your best interest, not sell you products.
      </p>
      <p className="text-[13px] text-white/35 leading-relaxed mb-5">
        A 30-minute introductory conversation is free and comes with no obligation. Most executives in transition find that one conversation changes how they think about their timeline.
      </p>

      <div className="space-y-3 mb-5">
        {[
          'Fee-only fiduciary advisors — no commissions, no conflicts',
          'Specialize in career transition and early retirement scenarios',
          'Your data is shared only with your explicit consent',
        ].map((point) => (
          <div key={point} className="flex items-start gap-2.5">
            <Shield size={13} className="text-[#b5dec2] mt-0.5 flex-shrink-0" />
            <span className="text-[13px] text-white/55">{point}</span>
          </div>
        ))}
      </div>

      <GlassButton variant="primary" className="w-full text-[14px]">
        Schedule a Free Introduction
        <ArrowRight size={16} className="ml-2" />
      </GlassButton>

      <p className="mt-3 text-center text-[11px] text-white/25">
        No credit card required. No sales pitch. Just a conversation.
      </p>
    </GlassCard>
  );
}

function EducationalResources() {
  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <BookOpen size={18} className="text-[#98b3ff]" />
        <h3 className="text-[15px] font-semibold text-white/85">Financial Resources</h3>
      </div>

      <div className="space-y-3">
        {MOCK_RESOURCES.map((resource) => (
          <div
            key={resource.id}
            className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 hover:bg-white/[0.04] hover:border-white/[0.1] transition-all cursor-pointer"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-medium text-[#98b3ff]/50 uppercase tracking-wider">
                    {resource.category}
                  </span>
                  <span className="text-[10px] text-white/20">·</span>
                  <span className="flex items-center gap-1 text-[10px] text-white/25">
                    <Clock size={9} />
                    {resource.readTime}
                  </span>
                </div>
                <h4 className="text-[13px] font-medium text-white/70 group-hover:text-white/85 transition-colors">
                  {resource.title}
                </h4>
                <p className="mt-1 text-[12px] text-white/35 leading-relaxed line-clamp-2">
                  {resource.description}
                </p>
              </div>
              <ArrowRight size={14} className="text-white/20 group-hover:text-white/50 transition-colors flex-shrink-0 mt-1" />
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

// --- Main component ---

export function FinancialWellnessRoom() {
  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1400px] mx-auto">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-white/90">Financial Wellness</h1>
        <p className="text-[13px] text-white/40">
          Understand your financial position and connect with fiduciary planners who specialize in career transitions.
        </p>
      </div>

      {/* Bridge Analysis + Planner side-by-side */}
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-[3] min-w-0">
          <RetirementBridgeCard bridge={MOCK_BRIDGE} />
        </div>
        <div className="flex-[2]">
          <PlannerConnectionCard />
        </div>
      </div>

      {/* Educational resources — full width */}
      <EducationalResources />
    </div>
  );
}
