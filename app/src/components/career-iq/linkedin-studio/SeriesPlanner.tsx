import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import {
  Calendar,
  PenLine,
  Check,
  Copy,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import type { StructuredPost } from '@/hooks/useContentCalendar';

const CONTENT_TYPE_LABELS_SHORT: Record<string, string> = {
  thought_leadership: 'Thought Leadership',
  storytelling: 'Story',
  engagement: 'Engagement',
  industry_insight: 'Industry Insight',
  how_to: 'How-To',
  case_study: 'Case Study',
  career_lesson: 'Career Lesson',
};

const CONTENT_TYPE_COLORS: Record<string, string> = {
  thought_leadership: 'text-[#afc4ff] bg-[#afc4ff]/10',
  storytelling: 'text-[#b5dec2] bg-[#b5dec2]/10',
  engagement: 'text-[#f0d99f] bg-[#f0d99f]/10',
  industry_insight: 'text-[#98b3ff] bg-[#98b3ff]/10',
  how_to: 'text-[#c9b8ff] bg-[#c9b8ff]/10',
  case_study: 'text-[#ffc4a0] bg-[#ffc4a0]/10',
  career_lesson: 'text-[#a0e0ff] bg-[#a0e0ff]/10',
};

function SeriesPost({ post, index }: { post: StructuredPost; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text = [post.hook, '', post.body, '', post.cta, '', post.hashtags.map((h) => `#${h}`).join(' ')].join('\n');
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const typeLabel = CONTENT_TYPE_LABELS_SHORT[post.content_type] ?? post.content_type;
  const typeColor = CONTENT_TYPE_COLORS[post.content_type] ?? 'text-[var(--text-soft)] bg-[var(--accent-muted)]';
  const scoreColor =
    post.quality_score >= 80
      ? 'text-[#b5dec2] bg-[#b5dec2]/10'
      : post.quality_score >= 60
      ? 'text-[#f0d99f] bg-[#f0d99f]/10'
      : 'text-[var(--text-soft)] bg-[var(--accent-muted)]';

  return (
    <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-[var(--accent-muted)] transition-colors"
      >
        <span className="w-7 h-7 rounded-full border border-[var(--line-soft)] bg-[var(--accent-muted)] flex items-center justify-center text-[13px] font-bold text-[var(--text-soft)] flex-shrink-0">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] text-[var(--text-soft)] truncate leading-snug">{post.hook}</p>
          <p className="text-[12px] text-[var(--text-soft)] mt-0.5">
            {post.day_of_week.charAt(0).toUpperCase() + post.day_of_week.slice(1)} · {post.word_count}w
          </p>
        </div>
        <span className={cn('text-[12px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0', typeColor)}>
          {typeLabel}
        </span>
        {post.quality_score > 0 && (
          <span className={cn('text-[12px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0', scoreColor)}>
            {post.quality_score}
          </span>
        )}
        {expanded ? (
          <ChevronDown size={13} className="text-[var(--text-soft)] flex-shrink-0" />
        ) : (
          <ChevronRight size={13} className="text-[var(--text-soft)] flex-shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-[var(--line-soft)]">
          <div className="mt-3 rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-3">
            <pre className="text-[12px] text-[var(--text-soft)] leading-relaxed whitespace-pre-wrap font-sans">
              {[post.hook, '', post.body, '', post.cta].join('\n')}
            </pre>
            {post.hashtags.length > 0 && (
              <p className="mt-2 text-[13px] text-[#98b3ff]/50">
                {post.hashtags.map((h) => `#${h}`).join(' ')}
              </p>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-[13px] text-[var(--text-soft)] hover:text-[var(--text-soft)] transition-colors"
            >
              {copied ? <Check size={12} className="text-[#b5dec2]" /> : <Copy size={12} />}
              {copied ? 'Copied!' : 'Copy post'}
            </button>
            {post.posting_time && (
              <span className="text-[12px] text-[var(--text-soft)] ml-auto">Best time: {post.posting_time}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function SeriesPlanner({ posts, onWritePost }: { posts: StructuredPost[]; onWritePost: () => void }) {
  if (posts.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <GlassCard className="p-6 flex flex-col items-center gap-3 text-center">
          <Calendar size={28} className="text-[var(--text-soft)]" />
          <p className="text-[14px] font-medium text-[var(--text-soft)]">No series generated yet</p>
          <p className="text-[12px] text-[var(--text-soft)] max-w-[320px]">
            Generate a content calendar above to populate your 30-day series plan.
          </p>
        </GlassCard>
      </div>
    );
  }

  const grouped = posts.reduce<Record<string, StructuredPost[]>>((acc, post) => {
    const key = post.content_type;
    if (!acc[key]) acc[key] = [];
    acc[key].push(post);
    return acc;
  }, {});

  const seriesEntries = Object.entries(grouped).sort((a, b) => b[1].length - a[1].length);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-medium text-[var(--text-muted)]">{posts.length} posts across {seriesEntries.length} themes</p>
          <p className="text-[13px] text-[var(--text-soft)] mt-0.5">Expand any post to preview and copy</p>
        </div>
        <GlassButton onClick={onWritePost} className="flex items-center gap-2">
          <PenLine size={13} />
          Write a Post
        </GlassButton>
      </div>

      {seriesEntries.map(([type, typePosts]) => {
        const typeLabel = CONTENT_TYPE_LABELS_SHORT[type] ?? type;
        const typeColor = CONTENT_TYPE_COLORS[type] ?? 'text-[var(--text-soft)] bg-[var(--accent-muted)]';
        const avgScore =
          typePosts.filter((p) => p.quality_score > 0).length > 0
            ? Math.round(
                typePosts.reduce((sum, p) => sum + (p.quality_score ?? 0), 0) / typePosts.length,
              )
            : null;

        return (
          <GlassCard key={type} className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className={cn('text-[12px] font-semibold px-2 py-0.5 rounded-full', typeColor)}>
                {typeLabel}
              </span>
              <span className="text-[13px] text-[var(--text-soft)]">{typePosts.length} posts</span>
              {avgScore !== null && (
                <span
                  className={cn(
                    'ml-auto text-[12px] font-medium px-1.5 py-0.5 rounded-full',
                    avgScore >= 80
                      ? 'text-[#b5dec2] bg-[#b5dec2]/10'
                      : 'text-[#f0d99f] bg-[#f0d99f]/10',
                  )}
                >
                  Avg {avgScore}
                </span>
              )}
            </div>
            <div className="space-y-2">
              {typePosts.map((post, i) => (
                <SeriesPost key={`${type}-${i}`} post={post} index={posts.indexOf(post)} />
              ))}
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
}
