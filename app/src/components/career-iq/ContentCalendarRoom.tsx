import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import {
  Calendar,
  Sparkles,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  FileText,
  Hash,
  Clock,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useCallback } from 'react';
import { useContentCalendar } from '@/hooks/useContentCalendar';
import { supabase } from '@/lib/supabase';

// --- Content type labels & colors ---

const CONTENT_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  thought_leadership: { label: 'Thought Leadership', color: 'text-[#98b3ff] bg-[#98b3ff]/10' },
  storytelling: { label: 'Storytelling', color: 'text-[#dfc797] bg-[#dfc797]/10' },
  engagement: { label: 'Engagement', color: 'text-[#b5dec2] bg-[#b5dec2]/10' },
  industry_insight: { label: 'Industry Insight', color: 'text-[#c4a8e0] bg-[#c4a8e0]/10' },
  how_to: { label: 'How-To', color: 'text-[#e0abab] bg-[#e0abab]/10' },
  case_study: { label: 'Case Study', color: 'text-[#98d4e8] bg-[#98d4e8]/10' },
  career_lesson: { label: 'Career Lesson', color: 'text-[#d4c098] bg-[#d4c098]/10' },
};

// --- Components ---

function ActivityFeed({ messages }: { messages: Array<{ id: string; message: string; timestamp: number }> }) {
  if (messages.length === 0) return null;
  return (
    <GlassCard className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Loader2 size={14} className="text-[#98b3ff] animate-spin" />
        <span className="text-[12px] font-medium text-white/60">Generating your content calendar...</span>
      </div>
      <div className="space-y-1 max-h-[200px] overflow-y-auto">
        {messages.slice(-10).map((msg) => (
          <div key={msg.id} className="text-[11px] text-white/40 leading-relaxed">
            {msg.message}
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

interface PostCardProps {
  day: number;
  dayOfWeek: string;
  contentType: string;
  hook: string;
  body: string;
  hashtags: string[];
  postingTime: string;
  qualityScore: number;
}

function PostCard({ day, dayOfWeek, contentType, hook, body, hashtags, postingTime, qualityScore }: PostCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const typeConfig = CONTENT_TYPE_CONFIG[contentType] ?? { label: contentType, color: 'text-white/60 bg-white/5' };

  const fullPost = `${body}\n\n${hashtags.map((h) => `#${h}`).join(' ')}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(fullPost).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-white/30 font-medium tabular-nums">Day {day}</span>
          <span className="text-[10px] text-white/20 capitalize">{dayOfWeek}</span>
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', typeConfig.color)}>
            {typeConfig.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            'text-[10px] px-1.5 py-0.5 rounded-full',
            qualityScore >= 80 ? 'text-[#b5dec2] bg-[#b5dec2]/10' :
            qualityScore >= 60 ? 'text-[#dfc797] bg-[#dfc797]/10' :
            'text-[#e0abab] bg-[#e0abab]/10',
          )}>
            {qualityScore}%
          </span>
          <button type="button" onClick={handleCopy} className="text-white/30 hover:text-white/60 transition-colors">
            {copied ? <Check size={12} className="text-[#b5dec2]" /> : <Copy size={12} />}
          </button>
        </div>
      </div>

      {/* Hook preview */}
      <p className="text-[12px] text-white/70 leading-relaxed line-clamp-2 mb-1.5">{hook}</p>

      {/* Expand toggle */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[10px] text-[#98b3ff]/60 hover:text-[#98b3ff] transition-colors"
      >
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        {expanded ? 'Collapse' : 'Full post'}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] text-white/55 leading-relaxed whitespace-pre-line">{body}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <Hash size={10} className="text-white/20" />
            {hashtags.map((tag) => (
              <span key={tag} className="text-[10px] text-[#98b3ff]/50">#{tag}</span>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <Clock size={10} className="text-white/20" />
            <span className="text-[10px] text-white/30">{postingTime}</span>
          </div>
        </div>
      )}
    </div>
  );
}

interface ParsedPost {
  day: number;
  dayOfWeek: string;
  contentType: string;
  hook: string;
  body: string;
  hashtags: string[];
  postingTime: string;
  qualityScore: number;
}

function parsePostsFromReport(report: string): ParsedPost[] {
  const posts: ParsedPost[] = [];
  // Match day sections in the markdown report
  const dayPattern = /### Day (\d+)\s*\((\w+)\)\s*\n(?:.*?\n)*?.*?Type:\s*([\w_]+)\s*\n.*?Hook:\s*(.*?)\n([\s\S]*?)(?=### Day \d+|## Week|## Calendar|$)/gi;
  let match;
  while ((match = dayPattern.exec(report)) !== null) {
    const body = match[5]?.trim() ?? '';
    const hashtagMatch = body.match(/#(\w+)/g);
    posts.push({
      day: parseInt(match[1], 10),
      dayOfWeek: match[2]?.toLowerCase() ?? '',
      contentType: match[3]?.toLowerCase() ?? 'thought_leadership',
      hook: match[4]?.trim() ?? '',
      body: body.replace(/#\w+\s*/g, '').trim(),
      hashtags: hashtagMatch?.map((h) => h.slice(1)) ?? [],
      postingTime: '8:00 AM EST',
      qualityScore: 80,
    });
  }
  return posts;
}

// --- Main component ---

export function ContentCalendarRoom() {
  const calendar = useContentCalendar();
  const [inputError, setInputError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');

  const handleGenerate = useCallback(async () => {
    setInputError(null);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      setInputError('Please sign in to generate your content calendar.');
      return;
    }

    const { data: resumeData, error: resumeError } = await supabase
      .from('master_resumes')
      .select('raw_text')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (resumeError || !resumeData?.raw_text || resumeData.raw_text.length < 50) {
      setInputError('Upload a resume first — we need it to plan your content themes.');
      return;
    }

    await calendar.startPipeline({
      resumeText: resumeData.raw_text,
    });
  }, [calendar.startPipeline]);

  const isRunning = calendar.status === 'connecting' || calendar.status === 'running';
  const parsedPosts = calendar.report ? parsePostsFromReport(calendar.report) : [];

  // Group posts by week
  const weeks: ParsedPost[][] = [];
  for (let i = 0; i < parsedPosts.length; i += 4) {
    weeks.push(parsedPosts.slice(i, i + 4));
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-[20px] font-bold text-white/90">Content Calendar</h2>
          <p className="text-[13px] text-white/40">
            30 days of strategic LinkedIn posts based on your expertise and positioning.
          </p>
        </div>
        <GlassButton
          onClick={handleGenerate}
          disabled={isRunning}
          className="flex items-center gap-2"
        >
          {isRunning ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Calendar size={14} />
              {calendar.report ? 'Regenerate' : 'Generate Calendar'}
            </>
          )}
        </GlassButton>
      </div>

      {/* Error */}
      {(inputError || calendar.error) && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 flex items-center gap-3">
          <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
          <p className="text-[13px] text-red-300/80">{inputError || calendar.error}</p>
        </div>
      )}

      {/* Quality + Post count badges */}
      {calendar.qualityScore !== null && (
        <div className="flex items-center gap-3">
          <div className={cn(
            'text-[12px] font-medium px-2.5 py-1 rounded-full',
            calendar.qualityScore >= 80 ? 'text-[#b5dec2] bg-[#b5dec2]/10' :
            calendar.qualityScore >= 60 ? 'text-[#dfc797] bg-[#dfc797]/10' :
            'text-[#e0abab] bg-[#e0abab]/10',
          )}>
            Quality: {calendar.qualityScore}%
          </div>
          {calendar.postCount !== null && (
            <div className="text-[12px] text-white/40 flex items-center gap-1.5">
              <FileText size={12} />
              {calendar.postCount} posts
            </div>
          )}
        </div>
      )}

      {/* Activity feed while running */}
      {isRunning && <ActivityFeed messages={calendar.activityMessages} />}

      {/* Empty state */}
      {!isRunning && !calendar.report && (
        <GlassCard className="p-8 text-center">
          <Sparkles size={28} className="text-[#98b3ff]/40 mx-auto mb-3" />
          <h3 className="text-[15px] font-semibold text-white/70 mb-2">Your AI Content Strategist</h3>
          <p className="text-[12px] text-white/40 max-w-md mx-auto leading-relaxed">
            Generate a personalized 30-day LinkedIn posting plan based on your resume,
            positioning strategy, and industry expertise. Each post includes a hook,
            body, CTA, and hashtags — ready to copy and post.
          </p>
        </GlassCard>
      )}

      {/* Calendar view */}
      {parsedPosts.length > 0 && (
        <>
          {/* View toggle */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className={cn(
                'text-[11px] px-3 py-1 rounded-full transition-colors',
                viewMode === 'week' ? 'text-white/80 bg-white/[0.08]' : 'text-white/30 hover:text-white/50',
              )}
            >
              By Week
            </button>
            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={cn(
                'text-[11px] px-3 py-1 rounded-full transition-colors',
                viewMode === 'month' ? 'text-white/80 bg-white/[0.08]' : 'text-white/30 hover:text-white/50',
              )}
            >
              All Posts
            </button>
          </div>

          {viewMode === 'week' ? (
            weeks.map((weekPosts, weekIdx) => (
              <GlassCard key={weekIdx} className="p-4">
                <h3 className="text-[13px] font-semibold text-white/60 mb-3">Week {weekIdx + 1}</h3>
                <div className="space-y-2">
                  {weekPosts.map((post) => (
                    <PostCard key={post.day} {...post} />
                  ))}
                </div>
              </GlassCard>
            ))
          ) : (
            <div className="space-y-2">
              {parsedPosts.map((post) => (
                <PostCard key={post.day} {...post} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
