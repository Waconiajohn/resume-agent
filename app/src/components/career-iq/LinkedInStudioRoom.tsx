import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import {
  Linkedin,
  TrendingUp,
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
  ChevronDown,
  RotateCcw,
  BookOpen,
  Users,
  Clock,
  Search,
  Eye,
  Zap,
  Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useCallback } from 'react';
import { useLinkedInOptimizer } from '@/hooks/useLinkedInOptimizer';
import { useLinkedInContent } from '@/hooks/useLinkedInContent';
import { useLinkedInEditor } from '@/hooks/useLinkedInEditor';
import { useContentCalendar } from '@/hooks/useContentCalendar';
import type { SavedCalendarReportFull } from '@/hooks/useContentCalendar';
import { useContentPosts } from '@/hooks/useContentPosts';
import { supabase } from '@/lib/supabase';
import { SeriesPlanner } from './linkedin-studio/SeriesPlanner';
import { ToolsPanel } from './linkedin-studio/ToolsPanel';
import { ExperienceEntryCard } from './ExperienceEntryCard';
import type { WhyMeSignals } from './useWhyMeStory';
import type { TopicSuggestion } from '@/hooks/useLinkedInContent';
import type { ProfileSection } from '@/hooks/useLinkedInEditor';

interface LinkedInStudioRoomProps {
  signals: WhyMeSignals;
  whyMeClarity?: string;
}

type StudioTab = 'composer' | 'editor' | 'calendar' | 'analytics' | 'library' | 'tools';

const PROFILE_SECTION_LABELS: Record<ProfileSection, string> = {
  headline: 'Headline',
  about: 'About Section',
  experience: 'Experience Entries',
  skills: 'Skills & Endorsements',
  education: 'Education',
};

const PROFILE_SECTION_ORDER: ProfileSection[] = ['headline', 'about', 'experience', 'skills', 'education'];

// ─── Sub-components ───────────────────────────────────────────────────────

function ActivityFeed({ messages, label }: { messages: Array<{ id: string; message: string; timestamp: number }>; label?: string }) {
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
            {msg.message}
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
              Strengthen your Clarity signal first — your posts will have sharper positioning once your Career Profile is defined.
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
                  scores.authenticity >= 80 ? 'text-[#b5dec2] bg-[#b5dec2]/10' : 'text-[#f0d99f] bg-[#f0d99f]/10',
                )}>
                  Auth {scores.authenticity}
                </span>
                <span className={cn(
                  'text-[10px] font-medium px-2 py-0.5 rounded-full',
                  scores.engagement_potential >= 80 ? 'text-[#b5dec2] bg-[#b5dec2]/10' : 'text-[#f0d99f] bg-[#f0d99f]/10',
                )}>
                  Engage {scores.engagement_potential}
                </span>
                {content.hookScore != null && (
                  <span className={cn(
                    'text-[10px] font-medium px-2 py-0.5 rounded-full',
                    content.hookScore >= 60 ? 'text-[#b5dec2] bg-[#b5dec2]/10' : 'text-[#f0d99f] bg-[#f0d99f]/10',
                  )}>
                    Hook {content.hookScore}
                  </span>
                )}
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

          {content.hookScore != null && content.hookScore < 60 && (
            <div className="mb-4 rounded-xl border border-[#f0d99f]/20 bg-[#f0d99f]/[0.04] px-4 py-3 flex items-start gap-2">
              <TrendingUp size={14} className="text-[#f0d99f] flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-[#f0d99f]">Your opening could be stronger.</p>
                <p className="text-[11px] text-[#f0d99f]/70 mt-0.5 leading-relaxed">
                  {content.hookAssessment ?? 'The first 210 characters need to earn the click — that\'s what shows before "see more".'}
                </p>
              </div>
            </div>
          )}

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
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[13px] text-white/70 placeholder:text-white/25 resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:border-[#98b3ff]/30 min-h-[80px]"
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
        {content.postSaved && (
          <div className="rounded-xl border border-[#b5dec2]/20 bg-[#b5dec2]/[0.05] px-4 py-2.5 flex items-center gap-2">
            <Check size={13} className="text-[#b5dec2] flex-shrink-0" />
            <span className="text-[12px] text-[#b5dec2]/80 font-medium">Saved to Library</span>
            <span className="text-[11px] text-white/30 ml-1">— find it in the Post Library tab</span>
          </div>
        )}
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
              Strengthen your Clarity signal first — your LinkedIn sections will be sharper once your Career Profile is defined.
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
                  scores.keyword_coverage >= 80 ? 'text-[#b5dec2] bg-[#b5dec2]/10' : 'text-[#f0d99f] bg-[#f0d99f]/10',
                )}>
                  Keywords {scores.keyword_coverage}
                </span>
                <span className={cn(
                  'text-[10px] font-medium px-2 py-0.5 rounded-full',
                  scores.positioning_alignment >= 80 ? 'text-[#b5dec2] bg-[#b5dec2]/10' : 'text-[#f0d99f] bg-[#f0d99f]/10',
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
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[13px] text-white/70 placeholder:text-white/25 resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:border-[#98b3ff]/30 min-h-[80px]"
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

// ─── Profile Score Ring (SVG gauge) ───────────────────────────────────────

function ProfileScoreRing({ score, label }: { score: number; label: string }) {
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const strokeColor =
    score >= 80 ? '#b5dec2' : score >= 60 ? '#f0d99f' : '#f0b8b8';

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative w-20 h-20 flex items-center justify-center">
        <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
          <circle
            cx="40"
            cy="40"
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="6"
          />
          <circle
            cx="40"
            cy="40"
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
            className="transition-all duration-700"
          />
        </svg>
        <span className="absolute text-[18px] font-bold tabular-nums" style={{ color: strokeColor }}>
          {score}
        </span>
      </div>
      <span className="text-[10px] text-white/40 uppercase tracking-wider text-center leading-tight">
        {label}
      </span>
    </div>
  );
}

// ─── Section Score Cards ───────────────────────────────────────────────────

const SECTION_SCORE_CONFIG: {
  key: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ size: number; className?: string }>;
}[] = [
  { key: 'headline', label: 'Headline', description: 'Positioning statement quality', icon: Zap },
  { key: 'about', label: 'About', description: 'Career Profile narrative depth', icon: Eye },
  { key: 'keywords', label: 'Keywords', description: 'Search discoverability', icon: Search },
  { key: 'experience', label: 'Experience', description: 'Impact framing', icon: TrendingUp },
];

function SectionScoreCards({ qualityScore }: { qualityScore: number | null }) {
  if (qualityScore === null) return null;

  // The optimizer returns a single overall quality score — per-section scores are not
  // available from the backend. Show the overall score once with a clear label rather
  // than repeating the same number across four cards and implying false per-section data.
  const scoreColor =
    qualityScore >= 80
      ? 'text-[#b5dec2]'
      : qualityScore >= 60
      ? 'text-[#f0d99f]'
      : 'text-[#f0b8b8]';
  const borderColor =
    qualityScore >= 80
      ? 'border-[#b5dec2]/15'
      : qualityScore >= 60
      ? 'border-[#f0d99f]/15'
      : 'border-[#f0b8b8]/15';

  return (
    <div className={cn('rounded-xl border bg-white/[0.02] p-4 flex items-center gap-4', borderColor)}>
      <div className={cn('text-[32px] font-bold tabular-nums', scoreColor)}>{qualityScore}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium text-white/60 mb-0.5">Overall Profile Score</p>
        <p className="text-[11px] text-white/30 leading-tight">
          Run the Profile Editor to generate optimized content for each section and improve this score.
        </p>
      </div>
    </div>
  );
}

// ─── Profile Optimizer (legacy: wraps useLinkedInOptimizer) ───────────────

function ProfileOptimizer({ report }: { signals: WhyMeSignals; report: string | null }) {
  const [copied, setCopied] = useState<'headline' | 'about' | null>(null);

  const parsedSections = report ? parseReportSections(report) : null;

  const handleCopy = (text: string, field: 'headline' | 'about') => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  };

  if (!parsedSections) {
    return (
      <GlassCard className="p-6">
        <div className="flex items-center gap-2 mb-5">
          <PenLine size={18} className="text-[#98b3ff]" />
          <h3 className="text-[15px] font-semibold text-white/85">Quick Profile Optimizer</h3>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Sparkles size={24} className="text-[#98b3ff]/40 mb-3" />
          <p className="text-[13px] text-white/40 leading-relaxed">
            Run the optimizer to see profile recommendations
          </p>
        </div>
      </GlassCard>
    );
  }

  const { headline, about, currentHeadline, currentAbout } = parsedSections;

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-5">
        <PenLine size={18} className="text-[#98b3ff]" />
        <h3 className="text-[15px] font-semibold text-white/85">Quick Profile Optimizer</h3>
        <span className="ml-auto text-[11px] text-[#b5dec2]/70 flex items-center gap-1">
          <Check size={11} />
          AI-optimized
        </span>
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

// ─── Fifty Groups Guide ────────────────────────────────────────────────────

function FiftyGroupsGuide() {
  return (
    <GlassCard className="p-6 mt-6">
      <details>
        <summary className="cursor-pointer flex items-center gap-2 text-[14px] font-semibold text-white/70 hover:text-white/90 transition-colors list-none">
          <Users size={16} className="text-[#98b3ff]" />
          The 50 Groups Strategy
          <span className="ml-auto text-[11px] text-white/25 font-normal">Coaching Guide</span>
        </summary>
        <div className="mt-4 space-y-4 text-[13px] text-white/55 leading-relaxed">
          <p>
            <strong className="text-white/70">Why 50 groups?</strong> LinkedIn lets you message any
            member of a shared group for free — no InMail credits needed. By joining 50 relevant
            groups, you unlock free messaging to thousands of potential contacts.
          </p>

          <div>
            <p className="text-white/70 font-medium mb-2">How to find the right groups:</p>
            <ul className="space-y-1.5 list-disc list-inside text-white/50">
              <li>Search for groups in your target industry (e.g., "Supply Chain Leaders")</li>
              <li>Join groups your target companies' employees belong to</li>
              <li>Look for professional associations in your field</li>
              <li>Find alumni groups from your schools and past employers</li>
              <li>Join groups for your target role titles</li>
            </ul>
          </div>

          <div>
            <p className="text-white/70 font-medium mb-2">The free messaging advantage:</p>
            <ul className="space-y-1.5 list-disc list-inside text-white/50">
              <li>Most professionals have only 5 InMail credits per week</li>
              <li>Group messages bypass this limit entirely</li>
              <li>Group members see you as a peer, not a cold contact</li>
              <li>Your message arrives in their primary inbox, not "Other"</li>
            </ul>
          </div>

          <div>
            <p className="text-white/70 font-medium mb-2">How to participate (without being spammy):</p>
            <ul className="space-y-1.5 list-disc list-inside text-white/50">
              <li>Comment thoughtfully on 2-3 discussions per week</li>
              <li>Share relevant insights from your experience</li>
              <li>Wait at least a week after joining before messaging members</li>
              <li>Reference group content when reaching out ("I saw your comment about...")</li>
            </ul>
          </div>
        </div>
      </details>
    </GlassCard>
  );
}

// ─── Content Calendar ──────────────────────────────────────────────────────

type CalendarView = 'calendar' | 'series';

function ContentCalendar({ onWritePost }: { onWritePost: () => void }) {
  const calendar = useContentCalendar();
  const [inputError, setInputError] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<SavedCalendarReportFull | null>(null);
  const [loadingReportId, setLoadingReportId] = useState<string | null>(null);
  const [calendarView, setCalendarView] = useState<CalendarView>('calendar');

  const handleGenerate = useCallback(async () => {
    setInputError(null);
    setSelectedReport(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      setInputError('Please sign in.');
      return;
    }
    const { data: resumeData } = await supabase
      .from('master_resumes')
      .select('raw_text')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!resumeData?.raw_text || resumeData.raw_text.length < 50) {
      setInputError('Upload a resume first.');
      return;
    }

    await calendar.startPipeline({ resumeText: resumeData.raw_text });
  }, [calendar]);

  const handleLoadReport = useCallback(async (id: string) => {
    setLoadingReportId(id);
    const report = await calendar.fetchReportById(id);
    setLoadingReportId(null);
    if (report) {
      setSelectedReport(report);
    }
  }, [calendar]);

  const isRunning = calendar.status === 'connecting' || calendar.status === 'running';

  // Idle state — show generate button + previous calendars
  if (calendar.status === 'idle') {
    return (
      <div className="flex flex-col gap-4">
        {inputError && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 flex items-center gap-3">
            <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
            <p className="text-[13px] text-red-300/80">{inputError}</p>
          </div>
        )}

        {/* Selected historical report */}
        {selectedReport && (
          <GlassCard className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock size={16} className="text-[#98b3ff]" />
              <h3 className="text-[15px] font-semibold text-white/85">
                {selectedReport.target_role || 'Content Calendar'}
              </h3>
              <span className="ml-auto text-[11px] text-white/30">
                {new Date(selectedReport.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              <button
                type="button"
                onClick={() => setSelectedReport(null)}
                className="text-[11px] text-white/30 hover:text-white/60 transition-colors ml-2"
              >
                Close
              </button>
            </div>
            <div className="flex items-center gap-3 mb-4">
              {selectedReport.quality_score > 0 && (
                <span className={cn(
                  'text-[10px] font-medium px-2 py-0.5 rounded-full',
                  selectedReport.quality_score >= 80 ? 'text-[#b5dec2] bg-[#b5dec2]/10' : 'text-[#f0d99f] bg-[#f0d99f]/10',
                )}>
                  Quality {selectedReport.quality_score}
                </span>
              )}
              {selectedReport.post_count > 0 && (
                <span className="text-[11px] text-white/30">{selectedReport.post_count} posts</span>
              )}
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 max-h-[500px] overflow-y-auto">
              <pre className="text-[13px] text-white/60 leading-relaxed whitespace-pre-wrap font-sans">
                {selectedReport.report_markdown}
              </pre>
            </div>
            <div className="mt-4">
              <GlassButton onClick={onWritePost} className="flex items-center gap-2">
                <PenLine size={14} />
                Write a Post from This Calendar
              </GlassButton>
            </div>
          </GlassCard>
        )}

        {!selectedReport && (
          <GlassCard className="p-8 flex flex-col items-center gap-4 text-center">
            <Calendar size={32} className="text-white/20" />
            <div>
              <p className="text-[15px] font-semibold text-white/80 mb-1">Generate Content Calendar</p>
              <p className="text-[13px] text-white/40 max-w-[380px]">
                Create a 30-day content plan with 4 posts per week, tailored to your positioning.
              </p>
            </div>
            <GlassButton onClick={handleGenerate} className="flex items-center gap-2">
              <Sparkles size={14} />
              Generate Calendar
            </GlassButton>
          </GlassCard>
        )}

        {/* Previous Calendars — progressive disclosure */}
        {calendar.savedReports.length > 0 && (
          <GlassCard className="p-4">
            <details>
              <summary className="cursor-pointer flex items-center gap-2 text-[13px] font-medium text-white/55 hover:text-white/80 transition-colors list-none">
                <Clock size={14} className="text-white/30 flex-shrink-0" />
                Previous Calendars
                <span className="ml-auto text-[11px] text-white/25 font-normal">
                  {calendar.savedReports.length} saved
                </span>
              </summary>
              <div className="mt-3 space-y-2">
                {calendar.savedReports.map((saved) => (
                  <button
                    key={saved.id}
                    type="button"
                    onClick={() => void handleLoadReport(saved.id)}
                    disabled={loadingReportId === saved.id}
                    className="w-full text-left rounded-xl border border-white/[0.06] bg-white/[0.02] hover:border-[#98b3ff]/25 hover:bg-[#98b3ff]/[0.03] px-4 py-3 transition-all flex items-center gap-3 disabled:opacity-50"
                  >
                    <Calendar size={13} className="text-white/30 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-white/65 truncate">
                        {saved.target_role || 'Content Calendar'}
                      </p>
                      <p className="text-[11px] text-white/30 mt-0.5">
                        {new Date(saved.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {saved.post_count > 0 && ` · ${saved.post_count} posts`}
                      </p>
                    </div>
                    {saved.quality_score > 0 && (
                      <span className={cn(
                        'text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0',
                        saved.quality_score >= 80 ? 'text-[#b5dec2] bg-[#b5dec2]/10' : 'text-[#f0d99f] bg-[#f0d99f]/10',
                      )}>
                        {saved.quality_score}
                      </span>
                    )}
                    {loadingReportId === saved.id ? (
                      <Loader2 size={12} className="text-white/30 animate-spin flex-shrink-0" />
                    ) : (
                      <ChevronRight size={13} className="text-white/20 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </details>
          </GlassCard>
        )}
      </div>
    );
  }

  // Running state
  if (isRunning) {
    return (
      <div className="flex flex-col gap-4">
        <ActivityFeed messages={calendar.activityMessages} label="Generating content calendar..." />
      </div>
    );
  }

  // Complete state — show report or series view
  if (calendar.status === 'complete' && calendar.report) {
    return (
      <div className="flex flex-col gap-4">
        {/* View toggle */}
        <div className="flex items-center gap-1 border-b border-white/[0.06] pb-0">
          {([
            { id: 'calendar' as CalendarView, label: 'Full Calendar', icon: FileText },
            { id: 'series' as CalendarView, label: 'Series View', icon: BookOpen },
          ] as const).map((view) => {
            const Icon = view.icon;
            return (
              <button
                key={view.id}
                type="button"
                onClick={() => setCalendarView(view.id)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2 text-[12px] font-medium transition-colors rounded-t-lg border-b-2 -mb-px',
                  calendarView === view.id
                    ? 'text-white/85 border-[#98b3ff] bg-[#98b3ff]/[0.04]'
                    : 'text-white/35 border-transparent hover:text-white/60 hover:bg-white/[0.02]',
                )}
              >
                <Icon size={13} className="flex-shrink-0" />
                {view.label}
                {view.id === 'series' && calendar.posts.length > 0 && (
                  <span className="ml-1 text-[9px] text-white/25 font-normal">
                    {calendar.posts.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {calendarView === 'calendar' && (
          <GlassCard className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Calendar size={18} className="text-[#98b3ff]" />
              <h3 className="text-[15px] font-semibold text-white/85">Content Calendar</h3>
              {calendar.postCount !== null && (
                <span className="ml-auto text-[11px] text-white/30">{calendar.postCount} posts planned</span>
              )}
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 max-h-[500px] overflow-y-auto">
              <pre className="text-[13px] text-white/60 leading-relaxed whitespace-pre-wrap font-sans">
                {calendar.report}
              </pre>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <GlassButton onClick={onWritePost} className="flex items-center gap-2">
                <PenLine size={14} />
                Write Next Post
              </GlassButton>
              <GlassButton onClick={calendar.reset} className="flex items-center gap-2">
                <RotateCcw size={14} />
                Generate New Calendar
              </GlassButton>
            </div>
          </GlassCard>
        )}

        {calendarView === 'series' && (
          <SeriesPlanner posts={calendar.posts} onWritePost={onWritePost} />
        )}
      </div>
    );
  }

  // Error state
  if (calendar.status === 'error') {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 flex items-center gap-3">
          <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
          <p className="text-[13px] text-red-300/80">{calendar.error}</p>
        </div>
        <GlassButton onClick={calendar.reset} className="self-start flex items-center gap-2">
          <RotateCcw size={14} />
          Try Again
        </GlassButton>
      </div>
    );
  }

  return null;
}

// ─── Analytics Overview ───────────────────────────────────────────────────

function AnalyticsOverview() {
  const { posts: rawPosts } = useContentPosts();
  const posts = rawPosts ?? [];

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const postsThisWeek = posts.filter((p) => new Date(p.created_at) >= weekStart).length;
  const approvedOrPublished = posts.filter((p) => p.status === 'approved' || p.status === 'published').length;
  const approvalRate = posts.length > 0 ? Math.round((approvedOrPublished / posts.length) * 100) : 0;

  const avgQuality = (() => {
    const scored = posts.filter((p) => p.quality_scores?.authenticity !== undefined);
    if (scored.length === 0) return 0;
    return Math.round(
      scored.reduce((sum, p) => sum + (p.quality_scores?.authenticity ?? 0), 0) / scored.length,
    );
  })();

  const metrics = [
    { label: 'Total Posts', value: String(posts.length), icon: FileText },
    { label: 'This Week', value: String(postsThisWeek), icon: Calendar },
    { label: 'Avg Quality', value: avgQuality > 0 ? `${avgQuality}%` : '—', icon: TrendingUp },
  ];

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={18} className="text-[#98b3ff]" />
        <h3 className="text-[15px] font-semibold text-white/85">Platform Metrics</h3>
        <span className="ml-auto text-[11px] text-white/30">From your generated content</span>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center">
              <Icon size={16} className="text-white/30 mx-auto mb-2" />
              <div className="text-[22px] font-bold text-white/85 tabular-nums">{metric.value}</div>
              <div className="text-[11px] text-white/35 mt-0.5">{metric.label}</div>
            </div>
          );
        })}
      </div>

      {posts.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 flex items-center gap-3">
          <Check size={14} className="text-[#b5dec2] flex-shrink-0" />
          <span className="text-[12px] text-white/50">
            Approval rate: <span className="text-white/70 font-medium">{approvalRate}%</span>
            <span className="text-white/30 ml-1">({approvedOrPublished} of {posts.length} posts approved or published)</span>
          </span>
        </div>
      )}
    </GlassCard>
  );
}

// ─── Post Library ────────────────────────────────────────────────────────

function PostLibrary() {
  const { posts: rawPosts, loading, error, updatePostStatus, deletePost } = useContentPosts();
  const posts = rawPosts ?? [];
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = useCallback((post: { id: string; content: string; hashtags: string[] | null }) => {
    const text = [post.content, '', ...(post.hashtags ?? []).map((h) => `#${h}`)].join('\n');
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(post.id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const handleMarkPublished = useCallback(async (id: string) => {
    await updatePostStatus(id, 'published');
  }, [updatePostStatus]);

  const handleDelete = useCallback(async (id: string) => {
    await deletePost(id);
  }, [deletePost]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[13px] text-white/40 py-8 justify-center">
        <Loader2 size={14} className="animate-spin" />
        Loading posts...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 flex items-center gap-3">
        <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
        <p className="text-[13px] text-red-300/80">{error}</p>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <GlassCard className="p-8 flex flex-col items-center gap-3 text-center">
        <BookOpen size={32} className="text-white/20" />
        <p className="text-[14px] font-medium text-white/60">No posts yet</p>
        <p className="text-[13px] text-white/35 max-w-[320px]">
          Write your first post in the Composer tab. Approved posts will appear here.
        </p>
      </GlassCard>
    );
  }

  const STATUS_COLORS: Record<string, string> = {
    published: 'text-[#b5dec2] bg-[#b5dec2]/10',
    approved: 'text-[#98b3ff] bg-[#98b3ff]/10',
    draft: 'text-[#f0d99f] bg-[#f0d99f]/10',
  };

  return (
    <div className="flex flex-col gap-3">
      {posts.map((post) => (
        <GlassCard key={post.id} className="p-4">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-white/75 truncate">{post.topic || 'Untitled Post'}</p>
              <p className="text-[11px] text-white/35 mt-0.5">
                {new Date(post.created_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            </div>
            <span className={cn(
              'text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 capitalize',
              STATUS_COLORS[post.status] ?? 'text-white/40 bg-white/[0.06]',
            )}>
              {post.status}
            </span>
          </div>

          <p className="text-[12px] text-white/50 leading-relaxed line-clamp-2 mb-3">
            {post.content.slice(0, 160)}{post.content.length > 160 ? '…' : ''}
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleCopy(post)}
              className="flex items-center gap-1.5 text-[11px] text-white/40 hover:text-white/70 transition-colors"
            >
              {copiedId === post.id ? (
                <Check size={12} className="text-[#b5dec2]" />
              ) : (
                <Copy size={12} />
              )}
              {copiedId === post.id ? 'Copied!' : 'Copy'}
            </button>

            {post.status !== 'published' && (
              <button
                type="button"
                onClick={() => handleMarkPublished(post.id)}
                className="flex items-center gap-1.5 text-[11px] text-white/40 hover:text-[#b5dec2] transition-colors ml-2"
              >
                <Check size={12} />
                Mark Published
              </button>
            )}

            <button
              type="button"
              onClick={() => handleDelete(post.id)}
              className="flex items-center gap-1.5 text-[11px] text-white/25 hover:text-red-400 transition-colors ml-auto"
            >
              Delete
            </button>
          </div>
        </GlassCard>
      ))}
    </div>
  );
}

// ─── Keyword Multiplier Nudge ──────────────────────────────────────────────

function KeywordMultiplierNudge() {
  const { posts: rawPosts } = useContentPosts();
  const posts = rawPosts ?? [];

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const postedThisWeek = posts.filter(
    (p) => p.status === 'published' && new Date(p.created_at) >= weekStart,
  ).length;

  const colorClass =
    postedThisWeek >= 4
      ? 'text-[#b5dec2] bg-[#b5dec2]/10 border-[#b5dec2]/15'
      : postedThisWeek >= 2
      ? 'text-[#f0d99f] bg-[#f0d99f]/10 border-[#f0d99f]/15'
      : 'text-red-400 bg-red-400/10 border-red-400/15';

  return (
    <div className={cn('rounded-xl border px-4 py-3 flex items-start gap-3', colorClass)}>
      <TrendingUp size={15} className="flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium">
          {postedThisWeek} of 4 posts this week
        </p>
        <p className="text-[11px] opacity-70 mt-0.5 leading-relaxed">
          LinkedIn amplifies search visibility for active users. 4+ posts per week significantly increases recruiter discovery.
        </p>
      </div>
    </div>
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
  const [showUtilityTabs, setShowUtilityTabs] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);

  const handleWritePostFromCalendar = useCallback(() => {
    setActiveTab('composer');
  }, []);

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

  const primaryTabs: { id: StudioTab; label: string; icon: React.ComponentType<{ size: number; className?: string }> }[] = [
    { id: 'composer', label: 'Write', icon: FileText },
    { id: 'editor', label: 'Profile', icon: PenLine },
    { id: 'analytics', label: 'Results', icon: BarChart3 },
  ];
  const utilityTabs: { id: StudioTab; label: string; icon: React.ComponentType<{ size: number; className?: string }> }[] = [
    { id: 'calendar', label: 'Content Plan', icon: Calendar },
    { id: 'library', label: 'Saved Posts', icon: BookOpen },
    { id: 'tools', label: 'Extras', icon: Wrench },
  ];
  const utilityTabActive = activeTab === 'calendar' || activeTab === 'library' || activeTab === 'tools';

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold text-white/90">LinkedIn</h1>
          <p className="text-[13px] text-white/40">
            Write posts, sharpen your profile, plan content, and keep your strongest ideas ready to reuse.
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
            optimizer.qualityScore >= 60 ? 'text-[#f0d99f] bg-[#f0d99f]/10' :
            'text-red-400 bg-red-400/10',
          )}>
            Profile Quality: {optimizer.qualityScore}%
          </div>
        </div>
      )}

      {/* Keyword multiplier coaching nudge */}
      {(activeTab === 'composer' || activeTab === 'calendar' || activeTab === 'library') && (
        <KeywordMultiplierNudge />
      )}

      {/* Tabs */}
      <div className="space-y-2 border-b border-white/[0.06] pb-2">
        <div className="flex items-center gap-1">
        {primaryTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setShowUtilityTabs(false);
              }}
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
          <button
            type="button"
            onClick={() => setShowUtilityTabs((value) => !value)}
            className={cn(
              'ml-auto flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
              utilityTabActive || showUtilityTabs
                ? 'bg-white/[0.05] text-white/72'
                : 'text-white/40 hover:bg-white/[0.03] hover:text-white/62',
            )}
          >
            <Wrench size={13} className="flex-shrink-0" />
            More
          </button>
        </div>

        {(showUtilityTabs || utilityTabActive) && (
          <div className="flex flex-wrap items-center gap-2">
            {utilityTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    setShowUtilityTabs(true);
                  }}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    activeTab === tab.id
                      ? 'border-[#98b3ff]/22 bg-[#98b3ff]/[0.08] text-white/82'
                      : 'border-white/[0.08] text-white/48 hover:text-white/68',
                  )}
                >
                  <Icon size={12} className="flex-shrink-0" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'composer' && <PostComposer signals={signals} />}
        {activeTab === 'editor' && (
          <div className="flex flex-col gap-6">
            <ProfileEditor signals={signals} />
            <FiftyGroupsGuide />
          </div>
        )}
        {activeTab === 'calendar' && <ContentCalendar onWritePost={handleWritePostFromCalendar} />}
        {activeTab === 'library' && <PostLibrary />}
        {activeTab === 'tools' && <ToolsPanel />}
        {activeTab === 'analytics' && (
          <div className="flex flex-col gap-6">
            {/* Profile score ring + section scores */}
            {optimizer.qualityScore !== null && (
              <GlassCard className="p-6">
                <div className="flex items-center gap-2 mb-5">
                  <Linkedin size={18} className="text-[#afc4ff]" />
                  <h3 className="text-[15px] font-semibold text-white/85">Profile Score</h3>
                  <span className="ml-auto text-[11px] text-white/30">AI-assessed</span>
                </div>
                <div className="flex items-center gap-6 mb-5">
                  <ProfileScoreRing score={optimizer.qualityScore} label="Overall" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-white/60 leading-relaxed mb-2">
                      {optimizer.qualityScore >= 80
                        ? 'Strong profile. Well-positioned for recruiter discovery with clear value proposition.'
                        : optimizer.qualityScore >= 60
                        ? 'Good foundation. A few strategic improvements will significantly boost visibility.'
                        : 'Significant opportunity. The Quick Optimize can meaningfully improve your discoverability.'}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded-md border',
                        optimizer.qualityScore >= 80
                          ? 'text-[#b5dec2] bg-[#b5dec2]/10 border-[#b5dec2]/20'
                          : 'text-[#f0d99f] bg-[#f0d99f]/10 border-[#f0d99f]/20',
                      )}>
                        {optimizer.qualityScore >= 80 ? 'Recruiter-Ready' : 'Needs Optimization'}
                      </span>
                      <span className="text-[10px] text-white/25">
                        Top profiles score 85+
                      </span>
                    </div>
                  </div>
                </div>
                <SectionScoreCards qualityScore={optimizer.qualityScore} />
              </GlassCard>
            )}

            <AnalyticsOverview />

            {optimizer.experienceEntries.length > 0 && (
              <GlassCard className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Linkedin size={18} className="text-[#afc4ff]" />
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
