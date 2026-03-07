import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import {
  Linkedin,
  TrendingUp,
  Eye,
  Search,
  MessageSquare,
  Sparkles,
  Calendar,
  PenLine,
  BarChart3,
  Copy,
  Check,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useCallback } from 'react';
import { useLinkedInOptimizer } from '@/hooks/useLinkedInOptimizer';
import { supabase } from '@/lib/supabase';
import type { WhyMeSignals } from './useWhyMeStory';

interface LinkedInStudioRoomProps {
  signals: WhyMeSignals;
  whyMeClarity?: string;
}

// --- Mock data (shown before pipeline runs) ---

const MOCK_PROFILE = {
  currentHeadline: 'VP of Operations | Supply Chain | Manufacturing',
  suggestedHeadline: 'I turn around underperforming supply chains — 3 turnarounds, $40M+ in recovered margin',
  currentAbout: 'Experienced operations executive with 20+ years in manufacturing and supply chain management...',
  suggestedAbout: 'When a supply chain is broken, I\'m the person they call. Three times in my career, I\'ve walked into plants losing money and rebuilt them into profit centers...',
};

const MOCK_CONTENT_PLAN = [
  { week: 1, day: 'Mon', type: 'Article', topic: 'Why supply chain leaders should stop optimizing and start redesigning', status: 'published' as const },
  { week: 1, day: 'Wed', type: 'Poll', topic: 'What\'s the #1 reason supply chain transformations fail?', status: 'published' as const },
  { week: 1, day: 'Fri', type: 'Comment', topic: 'Engage with 3 posts from target company leaders', status: 'published' as const },
  { week: 2, day: 'Mon', type: 'Article', topic: 'The hidden cost of "good enough" inventory management', status: 'draft' as const },
  { week: 2, day: 'Wed', type: 'Story', topic: 'Behind the scenes: How I reduced a 45-day cycle to 12', status: 'draft' as const },
  { week: 2, day: 'Fri', type: 'Comment', topic: 'Engage with industry thought leaders', status: 'scheduled' as const },
  { week: 3, day: 'Mon', type: 'Article', topic: 'What executives get wrong about operational efficiency', status: 'scheduled' as const },
  { week: 3, day: 'Wed', type: 'Poll', topic: 'Is AI actually improving your supply chain, or just your reports?', status: 'scheduled' as const },
];

const MOCK_ANALYTICS = [
  { label: 'Profile Views', value: '147', change: '+23%', trend: 'up' as const, period: 'vs. last week' },
  { label: 'Search Appearances', value: '89', change: '+41%', trend: 'up' as const, period: 'vs. last week' },
  { label: 'Post Engagement', value: '3.2%', change: '+0.8%', trend: 'up' as const, period: 'avg. rate' },
];

// --- Components ---

function ProfileOptimizer({ signals, report }: { signals: WhyMeSignals; report: string | null }) {
  const [copied, setCopied] = useState<'headline' | 'about' | null>(null);

  // Parse sections from report if available
  const parsedSections = report ? parseReportSections(report) : null;

  const headline = parsedSections?.headline ?? MOCK_PROFILE.suggestedHeadline;
  const about = parsedSections?.about ?? MOCK_PROFILE.suggestedAbout;
  const currentHeadline = parsedSections?.currentHeadline ?? MOCK_PROFILE.currentHeadline;
  const currentAbout = parsedSections?.currentAbout ?? MOCK_PROFILE.currentAbout;

  const handleCopy = (text: string, field: 'headline' | 'about') => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-5">
        <PenLine size={18} className="text-[#98b3ff]" />
        <h3 className="text-[15px] font-semibold text-white/85">Profile Optimizer</h3>
        {!report && signals.clarity !== 'green' && (
          <span className="ml-auto text-[11px] text-[#dfc797]/70 flex items-center gap-1">
            <Sparkles size={11} />
            Strengthen your Clarity signal for better suggestions
          </span>
        )}
        {report && (
          <span className="ml-auto text-[11px] text-[#b5dec2]/70 flex items-center gap-1">
            <Check size={11} />
            AI-optimized
          </span>
        )}
      </div>

      {/* Headline comparison */}
      <div className="mb-5">
        <div className="text-[11px] font-medium text-white/40 uppercase tracking-wider mb-2">Headline</div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">Current</div>
            <p className="text-[13px] text-white/50 leading-relaxed">{currentHeadline}</p>
          </div>
          <div className="rounded-xl border border-[#98b3ff]/15 bg-[#98b3ff]/[0.04] p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-[#98b3ff]/60 uppercase tracking-wider">Optimized</span>
              <button
                type="button"
                onClick={() => handleCopy(headline, 'headline')}
                className="text-white/30 hover:text-white/60 transition-colors"
              >
                {copied === 'headline' ? <Check size={12} className="text-[#b5dec2]" /> : <Copy size={12} />}
              </button>
            </div>
            <p className="text-[13px] text-white/70 leading-relaxed">{headline}</p>
          </div>
        </div>
      </div>

      {/* About comparison */}
      <div>
        <div className="text-[11px] font-medium text-white/40 uppercase tracking-wider mb-2">About Section</div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">Current</div>
            <p className="text-[12px] text-white/45 leading-relaxed line-clamp-3">{currentAbout}</p>
          </div>
          <div className="rounded-xl border border-[#98b3ff]/15 bg-[#98b3ff]/[0.04] p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-[#98b3ff]/60 uppercase tracking-wider">Optimized</span>
              <button
                type="button"
                onClick={() => handleCopy(about, 'about')}
                className="text-white/30 hover:text-white/60 transition-colors"
              >
                {copied === 'about' ? <Check size={12} className="text-[#b5dec2]" /> : <Copy size={12} />}
              </button>
            </div>
            <p className="text-[12px] text-white/65 leading-relaxed line-clamp-3">{about}</p>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

function ContentCalendar() {
  const statusColors: Record<string, string> = {
    published: 'text-[#b5dec2] bg-[#b5dec2]/10',
    draft: 'text-[#dfc797] bg-[#dfc797]/10',
    scheduled: 'text-[#98b3ff] bg-[#98b3ff]/10',
  };

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Calendar size={18} className="text-[#98b3ff]" />
        <h3 className="text-[15px] font-semibold text-white/85">Content Calendar</h3>
        <span className="ml-auto text-[11px] text-white/30">4-week plan</span>
      </div>

      <div className="space-y-1.5">
        {MOCK_CONTENT_PLAN.map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-white/[0.03] transition-colors"
          >
            <div className="w-[48px] flex-shrink-0">
              <div className="text-[11px] font-medium text-white/40">W{item.week}</div>
              <div className="text-[10px] text-white/25">{item.day}</div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] text-white/60 truncate">{item.topic}</div>
            </div>
            <span className="text-[10px] text-white/30 flex-shrink-0 w-[52px]">{item.type}</span>
            <span className={cn(
              'text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 capitalize',
              statusColors[item.status],
            )}>
              {item.status}
            </span>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

function AnalyticsOverview() {
  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={18} className="text-[#98b3ff]" />
        <h3 className="text-[15px] font-semibold text-white/85">Analytics</h3>
        <span className="ml-auto text-[11px] text-white/30">Last 7 days</span>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {MOCK_ANALYTICS.map((metric) => {
          const IconComp = metric.label === 'Profile Views' ? Eye
            : metric.label === 'Search Appearances' ? Search
            : MessageSquare;
          return (
            <div key={metric.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center">
              <IconComp size={16} className="text-white/30 mx-auto mb-2" />
              <div className="text-[22px] font-bold text-white/85 tabular-nums">{metric.value}</div>
              <div className="text-[11px] text-white/35 mt-0.5">{metric.label}</div>
              <div className="flex items-center justify-center gap-1 mt-2">
                <TrendingUp size={11} className="text-[#b5dec2]" />
                <span className="text-[11px] text-[#b5dec2]">{metric.change}</span>
                <span className="text-[10px] text-white/20">{metric.period}</span>
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

function ActivityFeed({ messages }: { messages: Array<{ id: string; text: string; timestamp: number }> }) {
  if (messages.length === 0) return null;
  return (
    <GlassCard className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Loader2 size={14} className="text-[#98b3ff] animate-spin" />
        <span className="text-[12px] font-medium text-white/60">Optimization in progress...</span>
      </div>
      <div className="space-y-1 max-h-[160px] overflow-y-auto">
        {messages.slice(-8).map((msg) => (
          <div key={msg.id} className="text-[11px] text-white/40 leading-relaxed">
            {msg.text}
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

// --- Helpers ---

function parseReportSections(report: string): {
  headline: string;
  about: string;
  currentHeadline: string;
  currentAbout: string;
} | null {
  try {
    // Extract headline section
    const headlineMatch = report.match(/## Headline[\s\S]*?### Optimized\s*\n([\s\S]*?)(?:\n>|\n---|\n##)/);
    const headline = headlineMatch?.[1]?.trim() ?? '';

    // Extract about section
    const aboutMatch = report.match(/## About Section[\s\S]*?### Optimized\s*\n([\s\S]*?)(?:\n>|\n---|\n##)/);
    const about = aboutMatch?.[1]?.trim() ?? '';

    // Extract current headline
    const currentHeadlineMatch = report.match(/## Headline[\s\S]*?### Current\s*\n([\s\S]*?)(?:\n### Optimized)/);
    const currentHeadline = currentHeadlineMatch?.[1]?.trim() ?? '';

    // Extract current about
    const currentAboutMatch = report.match(/## About Section[\s\S]*?### Current\s*\n([\s\S]*?)(?:\n### Optimized)/);
    const currentAbout = currentAboutMatch?.[1]?.trim() ?? '';

    if (!headline && !about) return null;

    return {
      headline: headline || MOCK_PROFILE.suggestedHeadline,
      about: about || MOCK_PROFILE.suggestedAbout,
      currentHeadline: currentHeadline || MOCK_PROFILE.currentHeadline,
      currentAbout: currentAbout || MOCK_PROFILE.currentAbout,
    };
  } catch {
    return null;
  }
}

// --- Main component ---

export function LinkedInStudioRoom({ signals }: LinkedInStudioRoomProps) {
  const optimizer = useLinkedInOptimizer();
  const [inputError, setInputError] = useState<string | null>(null);

  const handleOptimize = useCallback(async () => {
    setInputError(null);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      setInputError('Please sign in to optimize your LinkedIn profile.');
      return;
    }

    // Fetch resume
    const { data: resumeData, error: resumeError } = await supabase
      .from('master_resumes')
      .select('raw_text')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (resumeError || !resumeData?.raw_text || resumeData.raw_text.length < 50) {
      setInputError('Upload a resume first — we need it to optimize your LinkedIn profile.');
      return;
    }

    await optimizer.startPipeline({
      resumeText: resumeData.raw_text,
    });
  }, [optimizer.startPipeline]);

  const isRunning = optimizer.status === 'connecting' || optimizer.status === 'running';

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold text-white/90">LinkedIn Studio</h1>
          <p className="text-[13px] text-white/40">
            Optimize your profile, plan your content strategy, and track your LinkedIn presence.
          </p>
        </div>
        <GlassButton
          onClick={handleOptimize}
          disabled={isRunning}
          className="flex items-center gap-2"
        >
          {isRunning ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Optimizing...
            </>
          ) : (
            <>
              <Linkedin size={14} />
              {optimizer.report ? 'Re-optimize' : 'Optimize Profile'}
            </>
          )}
        </GlassButton>
      </div>

      {/* Error display */}
      {(inputError || optimizer.error) && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 flex items-center gap-3">
          <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
          <p className="text-[13px] text-red-300/80">{inputError || optimizer.error}</p>
        </div>
      )}

      {/* Agent suggestion banner */}
      {!isRunning && !optimizer.report && signals.clarity !== 'green' && (
        <div className="rounded-xl border border-[#98b3ff]/15 bg-[#98b3ff]/[0.04] px-4 py-3 flex items-center gap-3">
          <Sparkles size={16} className="text-[#98b3ff] flex-shrink-0" />
          <p className="text-[13px] text-[#98b3ff]/70">
            Your LinkedIn Agent suggests: strengthen your Clarity signal first — your headline and about section will be much sharper once your Why-Me story is fully defined.
          </p>
        </div>
      )}

      {/* Quality score */}
      {optimizer.qualityScore !== null && (
        <div className="flex items-center gap-2">
          <div className={cn(
            'text-[12px] font-medium px-2.5 py-1 rounded-full',
            optimizer.qualityScore >= 80 ? 'text-[#b5dec2] bg-[#b5dec2]/10' :
            optimizer.qualityScore >= 60 ? 'text-[#dfc797] bg-[#dfc797]/10' :
            'text-red-400 bg-red-400/10',
          )}>
            Quality: {optimizer.qualityScore}%
          </div>
        </div>
      )}

      {/* Activity feed while running */}
      {isRunning && <ActivityFeed messages={optimizer.activityMessages} />}

      {/* Profile Optimizer — full width */}
      <ProfileOptimizer signals={signals} report={optimizer.report} />

      {/* Calendar + Analytics side-by-side */}
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-[3] min-w-0">
          <ContentCalendar />
        </div>
        <div className="flex-[2]">
          <AnalyticsOverview />
        </div>
      </div>
    </div>
  );
}
