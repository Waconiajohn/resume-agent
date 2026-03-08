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
  FileText,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useCallback } from 'react';
import { useLinkedInOptimizer } from '@/hooks/useLinkedInOptimizer';
import { useLinkedInContent } from '@/hooks/useLinkedInContent';
import { useLinkedInEditor } from '@/hooks/useLinkedInEditor';
import { supabase } from '@/lib/supabase';
import { ExperienceEntryCard } from './ExperienceEntryCard';
import type { WhyMeSignals } from './useWhyMeStory';
import type { TopicSuggestion } from '@/hooks/useLinkedInContent';
import type { ProfileSection } from '@/hooks/useLinkedInEditor';

interface LinkedInStudioRoomProps {
  signals: WhyMeSignals;
  whyMeClarity?: string;
}

type StudioTab = 'composer' | 'editor' | 'calendar' | 'analytics';

// ─── Mock data (calendar + analytics remain mocked) ───────────────────────

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

const PROFILE_SECTION_LABELS: Record<ProfileSection, string> = {
  headline: 'Headline',
  about: 'About Section',
  experience: 'Experience Entries',
  skills: 'Skills & Endorsements',
  education: 'Education',
};

const PROFILE_SECTION_ORDER: ProfileSection[] = ['headline', 'about', 'experience', 'skills', 'education'];

// ─── Sub-components ───────────────────────────────────────────────────────

function ActivityFeed({ messages, label }: { messages: Array<{ id: string; text: string; timestamp: number }>; label?: string }) {
  if (messages.length === 0) return null;
  return (
    <GlassCard className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Loader2 size={14} className="text-[#98b3ff] animate-spin" />
        <span className="text-[12px] font-medium text-white/60">{label ?? 'Working...'}</span>
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

// ─── Post Composer ────────────────────────────────────────────────────────

function PostComposer({ signals }: { signals: WhyMeSignals }) {
  const content = useLinkedInContent();
  const [revisionFeedback, setRevisionFeedback] = useState('');
  const [showRevisionInput, setShowRevisionInput] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);

  const handleStart = useCallback(async () => {
    setInputError(null);
    const ok = await content.startContentPipeline();
    if (!ok && !content.error) {
      setInputError('Unable to start the Post Composer. Please try again.');
    }
  }, [content]);

  const handleSelectTopic = useCallback(async (topic: TopicSuggestion) => {
    await content.selectTopic(topic.id);
  }, [content]);

  const handleApprove = useCallback(async () => {
    await content.approvePost();
  }, [content]);

  const handleRevise = useCallback(async () => {
    if (!revisionFeedback.trim()) return;
    await content.requestRevision(revisionFeedback.trim());
    setRevisionFeedback('');
    setShowRevisionInput(false);
  }, [content, revisionFeedback]);

  const handleCopy = useCallback(() => {
    if (!content.postDraft) return;
    const text = [content.postDraft, '', ...content.postHashtags.map((h) => `#${h}`)].join('\n');
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content.postDraft, content.postHashtags]);

  const isRunning = content.status === 'connecting' || content.status === 'running';
  const error = inputError || content.error;

  // ── Idle state ──
  if (content.status === 'idle') {
    return (
      <div className="flex flex-col gap-4">
        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 flex items-center gap-3">
            <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
            <p className="text-[13px] text-red-300/80">{error}</p>
          </div>
        )}
        {signals.clarity !== 'green' && (
          <div className="rounded-xl border border-[#98b3ff]/15 bg-[#98b3ff]/[0.04] px-4 py-3 flex items-center gap-3">
            <Sparkles size={16} className="text-[#98b3ff] flex-shrink-0" />
            <p className="text-[13px] text-[#98b3ff]/70">
              Strengthen your Clarity signal first — your posts will have sharper positioning once your Why-Me story is defined.
            </p>
          </div>
        )}
        <GlassCard className="p-8 flex flex-col items-center gap-4 text-center">
          <FileText size={32} className="text-white/20" />
          <div>
            <p className="text-[15px] font-semibold text-white/80 mb-1">Write a LinkedIn Post</p>
            <p className="text-[13px] text-white/40 max-w-[380px]">
              The agent analyzes your positioning and suggests compelling topics, then writes an authentic post in your voice.
            </p>
          </div>
          <GlassButton onClick={handleStart} className="flex items-center gap-2">
            <Sparkles size={14} />
            Write a Post
          </GlassButton>
        </GlassCard>
      </div>
    );
  }

  // ── Running / connecting ──
  if (isRunning && content.status !== 'topic_selection' && content.status !== 'post_review') {
    return (
      <div className="flex flex-col gap-4">
        <ActivityFeed messages={content.activityMessages} label="Generating post topics..." />
      </div>
    );
  }

  // ── Topic selection gate ──
  if (content.status === 'topic_selection') {
    return (
      <div className="flex flex-col gap-4">
        <GlassCard className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={16} className="text-[#98b3ff]" />
            <h3 className="text-[15px] font-semibold text-white/85">Choose a Topic</h3>
            <span className="ml-auto text-[11px] text-white/30">Select one to write</span>
          </div>
          <div className="space-y-3">
            {content.topics.map((topic) => (
              <button
                key={topic.id}
                type="button"
                onClick={() => handleSelectTopic(topic)}
                className="w-full text-left rounded-xl border border-white/[0.08] bg-white/[0.02] hover:border-[#98b3ff]/30 hover:bg-[#98b3ff]/[0.04] p-4 transition-all group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-white/80 mb-1">{topic.topic}</p>
                    <p className="text-[12px] text-white/45 italic mb-2">&ldquo;{topic.hook}&rdquo;</p>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-medium text-[#98b3ff]/60 bg-[#98b3ff]/[0.08] px-2 py-0.5 rounded-full">
                        {topic.expertise_area}
                      </span>
                      <span className="text-[11px] text-white/30">{topic.rationale}</span>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-white/20 group-hover:text-[#98b3ff]/50 flex-shrink-0 mt-0.5 transition-colors" />
                </div>
              </button>
            ))}
          </div>
        </GlassCard>
        {content.activityMessages.length > 0 && (
          <ActivityFeed messages={content.activityMessages} label="Generating post topics..." />
        )}
      </div>
    );
  }

  // ── Post review gate ──
  if (content.status === 'post_review' || (content.postDraft && content.status === 'running')) {
    const scores = content.qualityScores;
    return (
      <div className="flex flex-col gap-4">
        <GlassCard className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText size={16} className="text-[#98b3ff]" />
            <h3 className="text-[15px] font-semibold text-white/85">Post Draft</h3>
            {scores && (
              <div className="ml-auto flex items-center gap-2">
                <span className={cn(
                  'text-[10px] font-medium px-2 py-0.5 rounded-full',
                  scores.authenticity >= 80 ? 'text-[#b5dec2] bg-[#b5dec2]/10' : 'text-[#dfc797] bg-[#dfc797]/10',
                )}>
                  Auth {scores.authenticity}
                </span>
                <span className={cn(
                  'text-[10px] font-medium px-2 py-0.5 rounded-full',
                  scores.engagement_potential >= 80 ? 'text-[#b5dec2] bg-[#b5dec2]/10' : 'text-[#dfc797] bg-[#dfc797]/10',
                )}>
                  Engage {scores.engagement_potential}
                </span>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 mb-4">
            <pre className="text-[13px] text-white/70 leading-relaxed whitespace-pre-wrap font-sans">
              {content.postDraft}
            </pre>
            {content.postHashtags.length > 0 && (
              <p className="mt-3 text-[12px] text-[#98b3ff]/60">
                {content.postHashtags.map((h) => `#${h}`).join(' ')}
              </p>
            )}
          </div>

          {content.status === 'post_review' && (
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <GlassButton onClick={handleApprove} className="flex items-center gap-2 flex-1 justify-center">
                  <Check size={14} />
                  Approve Post
                </GlassButton>
                <GlassButton
                  onClick={() => setShowRevisionInput((v) => !v)}
                  className="flex items-center gap-2 flex-1 justify-center"
                >
                  <RotateCcw size={14} />
                  Request Changes
                </GlassButton>
              </div>

              {showRevisionInput && (
                <div className="flex flex-col gap-2">
                  <textarea
                    value={revisionFeedback}
                    onChange={(e) => setRevisionFeedback(e.target.value)}
                    placeholder="What would you like changed? (e.g. make it more direct, add a specific story, shorten it)"
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[13px] text-white/70 placeholder:text-white/25 resize-none focus:outline-none focus:border-[#98b3ff]/30 min-h-[80px]"
                  />
                  <GlassButton
                    onClick={handleRevise}
                    disabled={!revisionFeedback.trim()}
                    className="self-end flex items-center gap-2"
                  >
                    <ChevronRight size={14} />
                    Send Feedback
                  </GlassButton>
                </div>
              )}
            </div>
          )}

          {isRunning && (
            <div className="flex items-center gap-2 text-[12px] text-white/40 mt-2">
              <Loader2 size={12} className="animate-spin" />
              Revising...
            </div>
          )}
        </GlassCard>
        {content.activityMessages.length > 0 && (
          <ActivityFeed messages={content.activityMessages} label="Writing your post..." />
        )}
      </div>
    );
  }

  // ── Complete ──
  if (content.status === 'complete' && content.postDraft) {
    return (
      <div className="flex flex-col gap-4">
        <GlassCard className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Check size={16} className="text-[#b5dec2]" />
            <h3 className="text-[15px] font-semibold text-white/85">Your Post is Ready</h3>
            <button
              type="button"
              onClick={handleCopy}
              className="ml-auto flex items-center gap-1.5 text-[12px] text-white/40 hover:text-white/70 transition-colors"
            >
              {copied ? <Check size={13} className="text-[#b5dec2]" /> : <Copy size={13} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          <div className="rounded-xl border border-[#b5dec2]/15 bg-[#b5dec2]/[0.03] p-4 mb-4">
            <pre className="text-[13px] text-white/75 leading-relaxed whitespace-pre-wrap font-sans">
              {content.postDraft}
            </pre>
            {content.postHashtags.length > 0 && (
              <p className="mt-3 text-[12px] text-[#98b3ff]/60">
                {content.postHashtags.map((h) => `#${h}`).join(' ')}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <GlassButton onClick={content.reset} className="flex items-center gap-2">
              <RotateCcw size={14} />
              Write Another Post
            </GlassButton>
          </div>
        </GlassCard>
      </div>
    );
  }

  // ── Error ──
  if (content.status === 'error') {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 flex items-center gap-3">
          <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
          <p className="text-[13px] text-red-300/80">{content.error}</p>
        </div>
        <GlassButton onClick={content.reset} className="self-start flex items-center gap-2">
          <RotateCcw size={14} />
          Try Again
        </GlassButton>
      </div>
    );
  }

  return null;
}

// ─── Profile Editor ───────────────────────────────────────────────────────

function ProfileEditor({ signals }: { signals: WhyMeSignals }) {
  const editor = useLinkedInEditor();
  const [revisionFeedback, setRevisionFeedback] = useState('');
  const [showRevisionInput, setShowRevisionInput] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);

  const handleStart = useCallback(async () => {
    setInputError(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      setInputError('Please sign in to use the Profile Editor.');
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
      setInputError('Upload a resume first — we need it to optimize your LinkedIn profile.');
      return;
    }

    const ok = await editor.startEditor();
    if (!ok && !editor.error) {
      setInputError('Unable to start the Profile Editor. Please try again.');
    }
  }, [editor]);

  const handleApprove = useCallback(async () => {
    await editor.approveSection();
    setRevisionFeedback('');
    setShowRevisionInput(false);
  }, [editor]);

  const handleRevise = useCallback(async () => {
    if (!revisionFeedback.trim()) return;
    await editor.requestSectionRevision(revisionFeedback.trim());
    setRevisionFeedback('');
    setShowRevisionInput(false);
  }, [editor, revisionFeedback]);

  const isRunning = editor.status === 'connecting' || editor.status === 'running';
  const error = inputError || editor.error;

  // ── Idle ──
  if (editor.status === 'idle') {
    return (
      <div className="flex flex-col gap-4">
        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 flex items-center gap-3">
            <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
            <p className="text-[13px] text-red-300/80">{error}</p>
          </div>
        )}
        {signals.clarity !== 'green' && (
          <div className="rounded-xl border border-[#98b3ff]/15 bg-[#98b3ff]/[0.04] px-4 py-3 flex items-center gap-3">
            <Sparkles size={16} className="text-[#98b3ff] flex-shrink-0" />
            <p className="text-[13px] text-[#98b3ff]/70">
              Strengthen your Clarity signal first — your LinkedIn sections will be sharper once your Why-Me story is defined.
            </p>
          </div>
        )}
        <GlassCard className="p-8 flex flex-col items-center gap-4 text-center">
          <PenLine size={32} className="text-white/20" />
          <div>
            <p className="text-[15px] font-semibold text-white/80 mb-1">Optimize Your LinkedIn Profile</p>
            <p className="text-[13px] text-white/40 max-w-[380px]">
              The agent writes each profile section in your authentic voice — headline, about, experience, skills, and education.
            </p>
          </div>
          <GlassButton onClick={handleStart} className="flex items-center gap-2">
            <PenLine size={14} />
            Edit Profile
          </GlassButton>
        </GlassCard>
      </div>
    );
  }

  // ── Connecting / running (no current section yet) ──
  if (isRunning && editor.status !== 'section_review') {
    return (
      <div className="flex flex-col gap-4">
        {/* Progress bar */}
        {editor.sectionsCompleted.length > 0 && (
          <GlassCard className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[12px] font-medium text-white/60">Progress</span>
              <span className="ml-auto text-[11px] text-white/30">
                {editor.sectionsCompleted.length} / {PROFILE_SECTION_ORDER.length} sections
              </span>
            </div>
            <div className="flex gap-1.5">
              {PROFILE_SECTION_ORDER.map((section) => (
                <div
                  key={section}
                  className={cn(
                    'flex-1 h-1.5 rounded-full',
                    editor.sectionsCompleted.includes(section) ? 'bg-[#b5dec2]' : 'bg-white/10',
                  )}
                />
              ))}
            </div>
          </GlassCard>
        )}
        <ActivityFeed messages={editor.activityMessages} label="Writing profile sections..." />
      </div>
    );
  }

  // ── Section review gate ──
  if (editor.status === 'section_review' && editor.currentSection) {
    const section = editor.currentSection;
    const scores = editor.sectionScores[section];
    const label = PROFILE_SECTION_LABELS[section];

    return (
      <div className="flex flex-col gap-4">
        {/* Progress indicator */}
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[12px] font-medium text-white/60">Progress</span>
            <span className="ml-auto text-[11px] text-white/30">
              {editor.sectionsCompleted.length} / {PROFILE_SECTION_ORDER.length} sections done
            </span>
          </div>
          <div className="flex gap-1.5">
            {PROFILE_SECTION_ORDER.map((s) => (
              <div
                key={s}
                className={cn(
                  'flex-1 h-1.5 rounded-full',
                  editor.sectionsCompleted.includes(s)
                    ? 'bg-[#b5dec2]'
                    : s === section
                    ? 'bg-[#98b3ff]'
                    : 'bg-white/10',
                )}
              />
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            {PROFILE_SECTION_ORDER.map((s) => (
              <span
                key={s}
                className={cn(
                  'flex-1 text-center text-[9px] font-medium uppercase tracking-wide',
                  editor.sectionsCompleted.includes(s)
                    ? 'text-[#b5dec2]/70'
                    : s === section
                    ? 'text-[#98b3ff]/80'
                    : 'text-white/20',
                )}
              >
                {PROFILE_SECTION_LABELS[s].split(' ')[0]}
              </span>
            ))}
          </div>
        </GlassCard>

        {/* Section draft */}
        <GlassCard className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <PenLine size={16} className="text-[#98b3ff]" />
            <h3 className="text-[15px] font-semibold text-white/85">{label}</h3>
            {scores && (
              <div className="ml-auto flex items-center gap-2">
                <span className={cn(
                  'text-[10px] font-medium px-2 py-0.5 rounded-full',
                  scores.keyword_coverage >= 80 ? 'text-[#b5dec2] bg-[#b5dec2]/10' : 'text-[#dfc797] bg-[#dfc797]/10',
                )}>
                  Keywords {scores.keyword_coverage}
                </span>
                <span className={cn(
                  'text-[10px] font-medium px-2 py-0.5 rounded-full',
                  scores.positioning_alignment >= 80 ? 'text-[#b5dec2] bg-[#b5dec2]/10' : 'text-[#dfc797] bg-[#dfc797]/10',
                )}>
                  Positioning {scores.positioning_alignment}
                </span>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[#98b3ff]/15 bg-[#98b3ff]/[0.03] p-4 mb-4">
            <pre className="text-[13px] text-white/70 leading-relaxed whitespace-pre-wrap font-sans">
              {editor.currentDraft}
            </pre>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <GlassButton onClick={handleApprove} className="flex items-center gap-2 flex-1 justify-center">
                <Check size={14} />
                Approve
              </GlassButton>
              <GlassButton
                onClick={() => setShowRevisionInput((v) => !v)}
                className="flex items-center gap-2 flex-1 justify-center"
              >
                <RotateCcw size={14} />
                Request Changes
              </GlassButton>
            </div>

            {showRevisionInput && (
              <div className="flex flex-col gap-2">
                <textarea
                  value={revisionFeedback}
                  onChange={(e) => setRevisionFeedback(e.target.value)}
                  placeholder="What would you like changed?"
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[13px] text-white/70 placeholder:text-white/25 resize-none focus:outline-none focus:border-[#98b3ff]/30 min-h-[80px]"
                />
                <GlassButton
                  onClick={handleRevise}
                  disabled={!revisionFeedback.trim()}
                  className="self-end flex items-center gap-2"
                >
                  <ChevronRight size={14} />
                  Send Feedback
                </GlassButton>
              </div>
            )}
          </div>
        </GlassCard>

        {editor.activityMessages.length > 0 && (
          <ActivityFeed messages={editor.activityMessages} label="Writing profile sections..." />
        )}
      </div>
    );
  }

  // ── Complete ──
  if (editor.status === 'complete') {
    return (
      <div className="flex flex-col gap-4">
        <GlassCard className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Check size={16} className="text-[#b5dec2]" />
            <h3 className="text-[15px] font-semibold text-white/85">Profile Optimization Complete</h3>
          </div>
          <div className="space-y-3">
            {PROFILE_SECTION_ORDER.filter((s) => editor.sectionDrafts[s]).map((section) => (
              <SectionResult
                key={section}
                label={PROFILE_SECTION_LABELS[section]}
                content={editor.sectionDrafts[section]}
              />
            ))}
          </div>
          <div className="mt-4">
            <GlassButton onClick={editor.reset} className="flex items-center gap-2">
              <RotateCcw size={14} />
              Edit Again
            </GlassButton>
          </div>
        </GlassCard>
      </div>
    );
  }

  // ── Error ──
  if (editor.status === 'error') {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 flex items-center gap-3">
          <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
          <p className="text-[13px] text-red-300/80">{editor.error}</p>
        </div>
        <GlassButton onClick={editor.reset} className="self-start flex items-center gap-2">
          <RotateCcw size={14} />
          Try Again
        </GlassButton>
      </div>
    );
  }

  return null;
}

function SectionResult({ label, content }: { label: string; content: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(content).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-medium text-white/50 uppercase tracking-wider">{label}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="text-white/25 hover:text-white/60 transition-colors"
        >
          {copied ? <Check size={12} className="text-[#b5dec2]" /> : <Copy size={12} />}
        </button>
      </div>
      <p className="text-[12px] text-white/60 leading-relaxed line-clamp-3">{content}</p>
    </div>
  );
}

// ─── Profile Optimizer (legacy: wraps useLinkedInOptimizer) ───────────────

function ProfileOptimizer({ signals, report }: { signals: WhyMeSignals; report: string | null }) {
  const [copied, setCopied] = useState<'headline' | 'about' | null>(null);

  const parsedSections = report ? parseReportSections(report) : null;

  const MOCK_PROFILE = {
    currentHeadline: 'VP of Operations | Supply Chain | Manufacturing',
    suggestedHeadline: 'I turn around underperforming supply chains — 3 turnarounds, $40M+ in recovered margin',
    currentAbout: 'Experienced operations executive with 20+ years in manufacturing and supply chain management...',
    suggestedAbout: 'When a supply chain is broken, I\'m the person they call. Three times in my career, I\'ve walked into plants losing money and rebuilt them into profit centers...',
  };

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
        <h3 className="text-[15px] font-semibold text-white/85">Quick Profile Optimizer</h3>
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

// ─── Content Calendar ──────────────────────────────────────────────────────

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

// ─── Analytics Overview ───────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────

function parseReportSections(report: string): {
  headline: string;
  about: string;
  currentHeadline: string;
  currentAbout: string;
} | null {
  try {
    const headlineMatch = report.match(/## Headline[\s\S]*?### Optimized\s*\n([\s\S]*?)(?:\n>|\n---|\n##)/);
    const headline = headlineMatch?.[1]?.trim() ?? '';

    const aboutMatch = report.match(/## About Section[\s\S]*?### Optimized\s*\n([\s\S]*?)(?:\n>|\n---|\n##)/);
    const about = aboutMatch?.[1]?.trim() ?? '';

    const currentHeadlineMatch = report.match(/## Headline[\s\S]*?### Current\s*\n([\s\S]*?)(?:\n### Optimized)/);
    const currentHeadline = currentHeadlineMatch?.[1]?.trim() ?? '';

    const currentAboutMatch = report.match(/## About Section[\s\S]*?### Current\s*\n([\s\S]*?)(?:\n### Optimized)/);
    const currentAbout = currentAboutMatch?.[1]?.trim() ?? '';

    if (!headline && !about) return null;

    return { headline, about, currentHeadline, currentAbout };
  } catch {
    return null;
  }
}

// ─── Main component ───────────────────────────────────────────────────────

export function LinkedInStudioRoom({ signals }: LinkedInStudioRoomProps) {
  const optimizer = useLinkedInOptimizer();
  const [activeTab, setActiveTab] = useState<StudioTab>('composer');
  const [inputError, setInputError] = useState<string | null>(null);

  const handleOptimize = useCallback(async () => {
    setInputError(null);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      setInputError('Please sign in to optimize your LinkedIn profile.');
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
      setInputError('Upload a resume first — we need it to optimize your LinkedIn profile.');
      return;
    }

    await optimizer.startPipeline({
      resumeText: resumeData.raw_text,
    });
  }, [optimizer]);

  const isOptimizerRunning = optimizer.status === 'connecting' || optimizer.status === 'running';

  const tabs: { id: StudioTab; label: string; icon: React.ComponentType<{ size: number; className?: string }> }[] = [
    { id: 'composer', label: 'Post Composer', icon: FileText },
    { id: 'editor', label: 'Profile Editor', icon: PenLine },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  ];

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold text-white/90">LinkedIn Studio</h1>
          <p className="text-[13px] text-white/40">
            Write posts, optimize your profile, plan your content strategy, and track your LinkedIn presence.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <GlassButton
            onClick={handleOptimize}
            disabled={isOptimizerRunning}
            className="flex items-center gap-2"
          >
            {isOptimizerRunning ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Optimizing...
              </>
            ) : (
              <>
                <Linkedin size={14} />
                {optimizer.report ? 'Re-optimize' : 'Quick Optimize'}
              </>
            )}
          </GlassButton>
        </div>
      </div>

      {/* Global error */}
      {(inputError || optimizer.error) && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 flex items-center gap-3">
          <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
          <p className="text-[13px] text-red-300/80">{inputError || optimizer.error}</p>
        </div>
      )}

      {/* Quality score badge */}
      {optimizer.qualityScore !== null && (
        <div className="flex items-center gap-2">
          <div className={cn(
            'text-[12px] font-medium px-2.5 py-1 rounded-full',
            optimizer.qualityScore >= 80 ? 'text-[#b5dec2] bg-[#b5dec2]/10' :
            optimizer.qualityScore >= 60 ? 'text-[#dfc797] bg-[#dfc797]/10' :
            'text-red-400 bg-red-400/10',
          )}>
            Profile Quality: {optimizer.qualityScore}%
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/[0.06] pb-0">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium transition-colors rounded-t-lg border-b-2 -mb-px',
                activeTab === tab.id
                  ? 'text-white/85 border-[#98b3ff] bg-[#98b3ff]/[0.04]'
                  : 'text-white/35 border-transparent hover:text-white/60 hover:bg-white/[0.02]',
              )}
            >
              <Icon size={14} className="flex-shrink-0" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'composer' && <PostComposer signals={signals} />}
        {activeTab === 'editor' && <ProfileEditor signals={signals} />}
        {activeTab === 'calendar' && <ContentCalendar />}
        {activeTab === 'analytics' && (
          <div className="flex flex-col gap-6">
            <AnalyticsOverview />
            {optimizer.experienceEntries.length > 0 && (
              <GlassCard className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Linkedin size={18} className="text-[#98b3ff]" />
                  <h3 className="text-[15px] font-semibold text-white/85">Optimized Experience Entries</h3>
                  <span className="ml-auto text-[11px] text-white/30">
                    {optimizer.experienceEntries.length} role{optimizer.experienceEntries.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="space-y-3">
                  {optimizer.experienceEntries.map((entry) => (
                    <ExperienceEntryCard key={entry.role_id} entry={entry} />
                  ))}
                </div>
              </GlassCard>
            )}
            {!isOptimizerRunning && !optimizer.report && (
              <ProfileOptimizer signals={signals} report={optimizer.report} />
            )}
            {optimizer.report && (
              <ProfileOptimizer signals={signals} report={optimizer.report} />
            )}
            {isOptimizerRunning && (
              <ActivityFeed messages={optimizer.activityMessages} label="Optimization in progress..." />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
