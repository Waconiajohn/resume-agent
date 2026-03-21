import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { ContextLoadedBadge } from '@/components/career-iq/ContextLoadedBadge';
import {
  Mail,
  Plus,
  Trash2,
  User,
  Building2,
  Calendar,
  Video,
  Phone,
  MapPin,
  MessageSquare,
  Loader2,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Sparkles,
  RotateCcw,
  Clock,
  Hash,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useThankYouNote, type InterviewerInput } from '@/hooks/useThankYouNote';
import { usePriorResult } from '@/hooks/usePriorResult';
import { supabase } from '@/lib/supabase';
import { markdownToHtml } from '@/lib/markdown';

// --- Delivery timing recommendation helpers ---

interface DeliveryRecommendation {
  label: string;
  urgency: 'high' | 'medium' | 'low';
  color: string;
  bg: string;
  border: string;
}

function getDeliveryRecommendation(interviewType: string): DeliveryRecommendation {
  switch (interviewType) {
    case 'onsite':
    case 'panel':
      return {
        label: 'Send within 2 hours',
        urgency: 'high',
        color: 'text-[#f0d99f]',
        bg: 'bg-[#f0d99f]/10',
        border: 'border-[#f0d99f]/20',
      };
    case 'video':
      return {
        label: 'Send within 4 hours',
        urgency: 'medium',
        color: 'text-[#afc4ff]',
        bg: 'bg-[#afc4ff]/10',
        border: 'border-[#afc4ff]/20',
      };
    case 'phone':
    default:
      return {
        label: 'Send same day',
        urgency: 'low',
        color: 'text-[#b5dec2]',
        bg: 'bg-[#b5dec2]/10',
        border: 'border-[#b5dec2]/20',
      };
  }
}

// Detect approximate tone from note content
function detectNoteTone(content: string): { label: string; color: string } {
  const warmWords = /\b(enjoyed|delightful|wonderful|pleasure|warm|appreciate|grateful|exciting|excited)\b/gi;
  const boldWords = /\b(confident|compelling|strong|proven|demonstrated|decisive|strategic)\b/gi;
  const formalWords = /\b(sincerely|appreciate|regarding|professional|respectfully|conversation|discussion)\b/gi;

  const warmCount = (content.match(warmWords) || []).length;
  const boldCount = (content.match(boldWords) || []).length;
  const formalCount = (content.match(formalWords) || []).length;

  if (warmCount >= boldCount && warmCount >= formalCount) {
    return { label: 'Warm', color: 'text-[#b5dec2]' };
  }
  if (boldCount >= warmCount && boldCount >= formalCount) {
    return { label: 'Confident', color: 'text-[#f0d99f]' };
  }
  return { label: 'Professional', color: 'text-[#afc4ff]' };
}

// --- Individual note card in the output ---

interface NoteCardProps {
  title: string;
  content: string;
  interviewType: string;
}

function NoteCard({ title, content, interviewType }: NoteCardProps) {
  const [copied, setCopied] = useState(false);

  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
  const readTime = Math.max(1, Math.round(wordCount / 200));
  const delivery = getDeliveryRecommendation(interviewType);
  const tone = detectNoteTone(content);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }, [content]);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      {/* Note header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] bg-white/[0.01]">
        <div className="flex items-center gap-2">
          <Mail className="h-3.5 w-3.5 text-[#A396E2]" />
          <span className="text-[13px] font-semibold text-white/80">{title}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Delivery timing badge */}
          <span className={cn(
            'flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium border',
            delivery.color, delivery.bg, delivery.border,
          )}>
            <Zap className="h-2.5 w-2.5" />
            {delivery.label}
          </span>
          {/* Tone indicator */}
          <span className={cn(
            'rounded-md px-1.5 py-0.5 text-[10px] border bg-white/[0.04] border-white/[0.06]',
            tone.color,
          )}>
            {tone.label}
          </span>
          {/* Word count */}
          <span className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] bg-white/[0.04] border border-white/[0.06] text-white/40">
            <Hash className="h-2.5 w-2.5" />
            {wordCount}w
          </span>
          {/* Read time */}
          <span className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] bg-white/[0.04] border border-white/[0.06] text-white/40">
            <Clock className="h-2.5 w-2.5" />
            ~{readTime}m read
          </span>
          {/* Copy */}
          <button
            type="button"
            onClick={handleCopy}
            className={cn(
              'flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] border transition-all',
              copied
                ? 'bg-[#b5dec2]/10 border-[#b5dec2]/20 text-[#b5dec2]'
                : 'bg-white/[0.04] border-white/[0.06] text-white/40 hover:text-white/70 hover:bg-white/[0.06]',
            )}
          >
            {copied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      {/* Note body */}
      <div className="px-5 py-4">
        <p className="text-[13px] text-white/70 leading-relaxed whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  );
}

// --- Parse individual notes from markdown report ---

function parseNoteCards(report: string): { title: string; content: string }[] {
  const cards: { title: string; content: string }[] = [];
  const lines = report.split('\n');
  let current: { title: string; lines: string[] } | null = null;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (current) {
        const content = current.lines.join('\n').trim();
        if (content) cards.push({ title: current.title, content });
      }
      current = { title: line.replace(/^## /, '').trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) {
    const content = current.lines.join('\n').trim();
    if (content) cards.push({ title: current.title, content });
  }

  return cards;
}

// --- Interviewer card ---

interface InterviewerCardProps {
  index: number;
  interviewer: InterviewerInput;
  onChange: (index: number, updated: InterviewerInput) => void;
  onRemove: (index: number) => void;
  isOnly: boolean;
}

function InterviewerCard({ index, interviewer, onChange, onRemove, isOnly }: InterviewerCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [topicsRaw, setTopicsRaw] = useState(interviewer.topics_discussed.join(', '));
  const [keyQsRaw, setKeyQsRaw] = useState((interviewer.key_questions ?? []).join('\n'));

  const update = (patch: Partial<InterviewerInput>) => onChange(index, { ...interviewer, ...patch });

  const handleTopicsBlur = () => {
    const topics = topicsRaw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    update({ topics_discussed: topics });
  };

  const handleKeyQsBlur = () => {
    const qs = keyQsRaw
      .split('\n')
      .map((q) => q.trim())
      .filter(Boolean);
    update({ key_questions: qs });
  };

  const label = interviewer.name.trim() || `Interviewer ${index + 1}`;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-white/[0.04] to-white/[0.02] overflow-hidden">
      {/* Header */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="h-8 w-8 rounded-full bg-[#A396E2]/10 flex items-center justify-center flex-shrink-0">
          <User size={14} className="text-[#A396E2]" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[14px] font-medium text-white/80">{label}</span>
          {interviewer.title && (
            <span className="text-[12px] text-white/40 ml-2">{interviewer.title}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isOnly && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRemove(index); }}
              className="p-1 rounded-lg text-white/20 hover:text-[#f0b8b8]/70 hover:bg-[#f0b8b8]/5 transition-colors"
              aria-label="Remove interviewer"
            >
              <Trash2 size={13} />
            </button>
          )}
          {expanded ? <ChevronUp size={14} className="text-white/25" /> : <ChevronDown size={14} className="text-white/25" />}
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-white/[0.06]">
          <div className="grid grid-cols-2 gap-3 pt-4">
            <div>
              <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">Name</label>
              <input
                type="text"
                value={interviewer.name}
                onChange={(e) => update({ name: e.target.value })}
                placeholder="e.g. Sarah Chen"
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white/80 placeholder:text-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:ring-2 focus:ring-[#98b3ff]/20 focus:border-[#98b3ff]/30 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">Title</label>
              <input
                type="text"
                value={interviewer.title}
                onChange={(e) => update({ title: e.target.value })}
                placeholder="e.g. VP of Engineering"
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white/80 placeholder:text-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:ring-2 focus:ring-[#98b3ff]/20 focus:border-[#98b3ff]/30 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
              Topics Discussed <span className="text-white/20 normal-case font-normal">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={topicsRaw}
              onChange={(e) => setTopicsRaw(e.target.value)}
              onBlur={handleTopicsBlur}
              placeholder="e.g. supply chain transformation, Q3 targets, team structure"
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white/80 placeholder:text-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:ring-2 focus:ring-[#98b3ff]/20 focus:border-[#98b3ff]/30 transition-colors"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
              Rapport Notes <span className="text-white/20 normal-case font-normal">(optional)</span>
            </label>
            <textarea
              value={interviewer.rapport_notes ?? ''}
              onChange={(e) => update({ rapport_notes: e.target.value })}
              placeholder="Shared interests, personal anecdotes, memorable moments..."
              rows={2}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white/80 placeholder:text-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:ring-2 focus:ring-[#98b3ff]/20 focus:border-[#98b3ff]/30 transition-colors resize-none leading-relaxed"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
              Key Questions Asked <span className="text-white/20 normal-case font-normal">(one per line, optional)</span>
            </label>
            <textarea
              value={keyQsRaw}
              onChange={(e) => setKeyQsRaw(e.target.value)}
              onBlur={handleKeyQsBlur}
              placeholder="Tell me about a transformation you led..."
              rows={2}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white/80 placeholder:text-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:ring-2 focus:ring-[#98b3ff]/20 focus:border-[#98b3ff]/30 transition-colors resize-none leading-relaxed"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// --- Activity feed ---

function ActivityFeed({
  activityMessages,
  currentStage,
  company,
}: {
  activityMessages: { id: string; message: string; stage?: string; timestamp: number }[];
  currentStage: string | null;
  company: string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activityMessages.length]);

  const stageLabel = currentStage === 'drafting'
    ? 'Drafting notes'
    : currentStage === 'quality'
    ? 'Checking quality'
    : currentStage
    ? currentStage
    : 'Starting...';

  return (
    <GlassCard className="p-8">
      {/* Glow orb */}
      <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-[#A396E2]/[0.04] blur-3xl pointer-events-none" />

      <div className="flex items-center gap-4 mb-8">
        <div className="relative">
          <div className="rounded-xl bg-[#A396E2]/10 p-3">
            <Mail size={20} className="text-[#A396E2]" />
          </div>
          <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-[#b5dec2]/20 border-2 border-[#b5dec2]/40 flex items-center justify-center">
            <Loader2 size={8} className="text-[#b5dec2] animate-spin" />
          </div>
        </div>
        <div>
          <h3 className="text-[17px] font-semibold text-white/90">
            Writing notes for {company || 'your interview'}
          </h3>
          <p className="text-[13px] text-white/40 mt-0.5">{stageLabel}</p>
        </div>
      </div>

      <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
        {activityMessages.length === 0 ? (
          <div className="text-center py-12">
            <Loader2 size={24} className="text-white/20 mx-auto mb-3 animate-spin" />
            <p className="text-[13px] text-white/30">Connecting to pipeline...</p>
          </div>
        ) : (
          activityMessages.map((msg, i) => {
            const opacity = Math.max(0.3, 1 - (activityMessages.length - 1 - i) * 0.08);
            return (
              <div
                key={msg.id}
                className="flex items-start gap-3 py-1.5"
                style={{ opacity }}
              >
                <div className="h-1.5 w-1.5 rounded-full bg-[#A396E2]/50 mt-2 flex-shrink-0" />
                <span className="text-[13px] text-white/60 leading-relaxed">{msg.message}</span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </GlassCard>
  );
}

// --- Report view ---

function ReportView({
  report,
  qualityScore,
  company,
  role,
  interviewType,
  onReset,
}: {
  report: string;
  qualityScore: number | null;
  company: string;
  role: string;
  interviewType: string;
  onReset: () => void;
}) {
  const [copiedAll, setCopiedAll] = useState(false);

  const handleCopyAll = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch { /* ignore */ }
  }, [report]);

  const scoreColor =
    qualityScore !== null && qualityScore >= 80
      ? 'text-[#b5dec2] bg-[#b5dec2]/10 border-[#b5dec2]/20'
      : qualityScore !== null && qualityScore >= 60
      ? 'text-[#f0d99f] bg-[#f0d99f]/10 border-[#f0d99f]/20'
      : 'text-[#f0b8b8] bg-[#f0b8b8]/10 border-[#f0b8b8]/20';

  const noteCards = parseNoteCards(report);
  const hasParsedCards = noteCards.length > 0;

  return (
    <div className="space-y-6">
      {/* Back + actions bar */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1.5 text-[13px] text-white/40 hover:text-white/70 transition-colors"
        >
          <ArrowLeft size={14} />
          Draft more notes
        </button>
        <div className="flex-1" />
        {qualityScore !== null && (
          <div className={cn('text-[12px] font-semibold px-3 py-1 rounded-full border', scoreColor)}>
            Draft Strength {qualityScore}%
          </div>
        )}
        <GlassButton variant="ghost" onClick={handleCopyAll} size="sm">
          {copiedAll ? <Check size={13} className="mr-1.5 text-[#b5dec2]" /> : <Copy size={13} className="mr-1.5" />}
          {copiedAll ? 'Copied!' : 'Copy All'}
        </GlassButton>
      </div>

      {/* Report card header */}
      <GlassCard className="px-5 py-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-80 h-80 rounded-full bg-[#A396E2]/[0.03] blur-3xl pointer-events-none" />
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-[#b5dec2]/10 p-2.5">
            <CheckCircle2 size={18} className="text-[#b5dec2]" />
          </div>
          <div>
            <h2 className="text-[16px] font-semibold text-white/90">Thank-You Notes — {company}</h2>
            <p className="text-[12px] text-white/40 mt-0.5">{role}</p>
          </div>
        </div>
      </GlassCard>

      {/* Quality bar */}
      {qualityScore !== null && (
        <GlassCard className="px-4 py-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-white/40">Draft Strength</span>
            <span className={cn(
              'text-[11px] font-semibold',
              qualityScore >= 80 ? 'text-[#b5dec2]' : qualityScore >= 60 ? 'text-[#f0d99f]' : 'text-[#f0b8b8]',
            )}>
              {qualityScore >= 80 ? 'Strong' : qualityScore >= 60 ? 'Good' : 'Needs Work'}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/[0.06]">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                qualityScore >= 80 ? 'bg-[#b5dec2]/60' : qualityScore >= 60 ? 'bg-[#f0d99f]/60' : 'bg-[#f0b8b8]/60',
              )}
              style={{ width: `${qualityScore}%` }}
            />
          </div>
        </GlassCard>
      )}

      {/* Per-note cards or fallback prose */}
      {hasParsedCards ? (
        <div className="space-y-3">
          {noteCards.map((card, i) => (
            <NoteCard
              key={i}
              title={card.title}
              content={card.content}
              interviewType={interviewType}
            />
          ))}
        </div>
      ) : (
        <GlassCard className="p-8 relative overflow-hidden">
          <div
            className="prose prose-invert prose-sm max-w-none
              prose-headings:text-white/85 prose-headings:font-semibold
              prose-h1:text-[18px] prose-h1:border-b prose-h1:border-white/[0.08] prose-h1:pb-3 prose-h1:mb-5
              prose-h2:text-[15px] prose-h2:mt-8 prose-h2:mb-3
              prose-h3:text-[14px] prose-h3:mt-5 prose-h3:mb-2
              prose-p:text-white/60 prose-p:text-[13px] prose-p:leading-relaxed
              prose-li:text-white/55 prose-li:text-[13px] prose-li:leading-relaxed
              prose-strong:text-white/75
              prose-em:text-white/50
              prose-blockquote:border-[#A396E2]/30 prose-blockquote:text-white/45 prose-blockquote:italic
              prose-hr:border-white/[0.08]"
            dangerouslySetInnerHTML={{ __html: markdownToHtml(report) }}
          />
        </GlassCard>
      )}
    </div>
  );
}

// --- Idle form ---

const INTERVIEW_TYPES = [
  { value: 'phone', label: 'Phone Screen', icon: Phone },
  { value: 'video', label: 'Video Call', icon: Video },
  { value: 'onsite', label: 'Onsite', icon: MapPin },
  { value: 'panel', label: 'Panel Interview', icon: MessageSquare },
];

let interviewerIdCounter = 0;

function makeEmptyInterviewer(): InterviewerInput & { _id: number } {
  return { _id: ++interviewerIdCounter, name: '', title: '', topics_discussed: [], rapport_notes: '', key_questions: [] };
}

// --- Main component ---

interface ThankYouNoteRoomProps {
  initialCompany?: string;
  initialRole?: string;
  initialJobApplicationId?: string;
  initialSessionId?: string;
}

export function ThankYouNoteRoom({
  initialCompany,
  initialRole,
  initialJobApplicationId,
  initialSessionId,
}: ThankYouNoteRoomProps = {}) {
  const [company, setCompany] = useState(initialCompany ?? '');
  const [role, setRole] = useState(initialRole ?? '');
  const [interviewDate, setInterviewDate] = useState('');
  const [interviewType, setInterviewType] = useState('video');
  const [interviewers, setInterviewers] = useState<(InterviewerInput & { _id: number })[]>([makeEmptyInterviewer()]);
  const [loadingResume, setLoadingResume] = useState(false);
  const [resumeLoaded, setResumeLoaded] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const resumeRef = useRef<string>('');

  const {
    status,
    report,
    qualityScore,
    activityMessages,
    error,
    currentStage,
    startPipeline,
    reset,
  } = useThankYouNote();

  const isPipelineActive = status === 'connecting' || status === 'running';
  const { priorResult, loading: priorLoading, clearPrior } = usePriorResult<{ report_markdown?: string; quality_score?: number }>({
    productSlug: 'thank-you-note',
    skip: isPipelineActive,
    sessionId: initialSessionId,
  });

  // Auto-load resume on mount
  useEffect(() => {
    let cancelled = false;
    async function loadResume() {
      setLoadingResume(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const { data } = await supabase
          .from('master_resumes')
          .select('raw_text')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .single();
        if (!cancelled && data?.raw_text) {
          resumeRef.current = data.raw_text;
          setResumeLoaded(true);
        }
      } catch { /* ignore */ } finally {
        if (!cancelled) setLoadingResume(false);
      }
    }
    void loadResume();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (initialCompany) {
      setCompany(initialCompany);
    }
    if (initialRole) {
      setRole(initialRole);
    }
  }, [initialCompany, initialRole]);

  const handleAddInterviewer = () => {
    setInterviewers((prev) => [...prev, makeEmptyInterviewer()]);
  };

  const handleChangeInterviewer = (index: number, updated: InterviewerInput) => {
    setInterviewers((prev) => prev.map((iv, i) => (i === index ? { ...updated, _id: iv._id } : iv)));
  };

  const handleRemoveInterviewer = (index: number) => {
    setInterviewers((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = useCallback(async () => {
    setFormError(null);

    if (!company.trim()) { setFormError('Company name is required.'); return; }
    if (!role.trim()) { setFormError('Role title is required.'); return; }

    const validInterviewers = interviewers.filter((iv) => iv.name.trim() || iv.title.trim());
    if (validInterviewers.length === 0) {
      setFormError('Add at least one interviewer with a name or title.');
      return;
    }
    if (!resumeRef.current && !resumeLoaded) {
      setFormError('No resume found. Please complete the Resume Strategist first to load your resume.');
      return;
    }

    await startPipeline({
      resumeText: resumeRef.current || '(no resume loaded)',
      company: company.trim(),
      role: role.trim(),
      interviewDate: interviewDate || undefined,
      interviewType,
      interviewers: validInterviewers,
      jobApplicationId: initialJobApplicationId,
    });
  }, [company, initialJobApplicationId, role, interviewDate, interviewType, interviewers, resumeLoaded, startPipeline]);

  const handleReset = useCallback(() => {
    reset();
    setFormError(null);
    setResumeLoaded(false);
    setCompany(initialCompany ?? '');
    setRole(initialRole ?? '');
  }, [initialCompany, initialRole, reset]);

  // Complete → report
  if (status === 'complete' && report) {
    return (
      <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
        <ReportView
          report={report}
          qualityScore={qualityScore}
          company={company}
          role={role}
          interviewType={interviewType}
          onReset={handleReset}
        />
      </div>
    );
  }

  if (status === 'idle' && initialSessionId && priorResult?.report_markdown) {
    return (
      <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
        <ReportView
          report={priorResult.report_markdown}
          qualityScore={priorResult.quality_score ?? null}
          company={company}
          role={role}
          interviewType={interviewType}
          onReset={() => {
            clearPrior();
            handleReset();
          }}
        />
      </div>
    );
  }

  // Running
  if (status === 'connecting' || status === 'running') {
    return (
      <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
        <div>
          <h1 className="text-xl font-semibold text-white/90">Thank-You Notes</h1>
          <p className="text-[13px] text-white/40 mt-1">Drafting tailored follow-up notes for each interviewer</p>
        </div>
        <ActivityFeed
          activityMessages={activityMessages}
          currentStage={currentStage}
          company={company}
        />
        <div className="flex justify-start">
          <button
            type="button"
            onClick={handleReset}
            className="text-[12px] text-white/30 hover:text-white/50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Error state
  if (status === 'error' && error) {
    return (
      <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
        <GlassCard className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle size={18} className="text-[#f0b8b8]" />
            <span className="text-[13px] text-[#f0b8b8]">{error}</span>
          </div>
          <GlassButton variant="ghost" onClick={handleReset} size="sm">
            <ArrowLeft size={14} className="mr-1.5" />
            Try again
          </GlassButton>
        </GlassCard>
      </div>
    );
  }

  // Idle form
  return (
    <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
      {/* Header */}
      <div className="flex gap-3">
        <div className="rounded-xl bg-[#A396E2]/10 p-2.5 self-start shrink-0">
          <Mail size={20} className="text-[#A396E2]" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-white/90">Thank-You Notes</h1>
          <p className="text-[13px] text-white/40 leading-relaxed mt-1">
            Draft notes for each interviewer that reference the conversation, reinforce your fit, and make the follow-up easier to send.
          </p>
        </div>
      </div>
      <ContextLoadedBadge
        contextTypes={['career_profile', 'positioning_strategy', 'emotional_baseline']}
        className="mb-3"
      />

      {/* Prior result */}
      {priorLoading && (
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 text-[12px] text-white/35">
            <Loader2 size={12} className="animate-spin" />
            Loading saved draft...
          </div>
        </GlassCard>
      )}
      {priorResult && !isPipelineActive && (
        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-white/70">
              {initialSessionId ? 'Saved thank-you notes for this job' : 'Earlier draft'}
            </h3>
            <button
              type="button"
              onClick={clearPrior}
              className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Start New Draft
            </button>
          </div>
          <div
            className="prose prose-invert prose-sm max-w-none text-white/80 max-h-96 overflow-y-auto"
            dangerouslySetInnerHTML={{ __html: markdownToHtml(priorResult.report_markdown ?? '') }}
          />
        </GlassCard>
      )}

      {/* Resume status */}
      {loadingResume ? (
        <div className="flex items-center gap-2 text-[12px] text-white/30">
          <Loader2 size={12} className="animate-spin" />
          Loading your resume...
        </div>
      ) : resumeLoaded ? (
        <div className="flex items-center gap-2 text-[12px] text-[#b5dec2]/70">
          <CheckCircle2 size={12} />
          Resume loaded from your profile
        </div>
      ) : (
        <div className="flex items-center gap-2 text-[12px] text-[#f0d99f]/70">
          <AlertCircle size={12} />
          No resume found — complete the Resume Strategist first for best results
        </div>
      )}

      {/* Section 1: Interview details */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Building2 size={16} className="text-[#98b3ff]" />
          <h2 className="text-[15px] font-semibold text-white/80">Interview Details</h2>
          <div className="flex-1 h-px bg-white/[0.06]" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
              Company <span className="text-[#98b3ff]/60">*</span>
            </label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. Medtronic"
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white/80 placeholder:text-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:ring-2 focus:ring-[#98b3ff]/20 focus:border-[#98b3ff]/30 transition-colors"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
              Role <span className="text-[#98b3ff]/60">*</span>
            </label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. VP of Supply Chain"
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white/80 placeholder:text-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:ring-2 focus:ring-[#98b3ff]/20 focus:border-[#98b3ff]/30 transition-colors"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
              Interview Date <span className="text-white/20 normal-case font-normal">(optional)</span>
            </label>
            <input
              type="date"
              value={interviewDate}
              onChange={(e) => setInterviewDate(e.target.value)}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:ring-2 focus:ring-[#98b3ff]/20 focus:border-[#98b3ff]/30 transition-colors [color-scheme:dark]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-2">
              Interview Type
            </label>
            <div className="flex gap-2 flex-wrap">
              {INTERVIEW_TYPES.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setInterviewType(value)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium border transition-all',
                    interviewType === value
                      ? 'border-[#98b3ff]/30 bg-[#98b3ff]/10 text-[#98b3ff]'
                      : 'border-white/[0.06] bg-white/[0.02] text-white/40 hover:text-white/60 hover:border-white/[0.1]',
                  )}
                >
                  <Icon size={12} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Delivery timing hint */}
        {interviewType && (
          <div className={cn(
            'flex items-center gap-2 rounded-xl px-4 py-2.5 border text-[12px]',
            getDeliveryRecommendation(interviewType).bg,
            getDeliveryRecommendation(interviewType).border,
            getDeliveryRecommendation(interviewType).color,
          )}>
            <Clock size={12} className="flex-shrink-0" />
            <span>
              Recommended send time: <span className="font-semibold">{getDeliveryRecommendation(interviewType).label}</span> after the interview
            </span>
          </div>
        )}
      </div>

      {/* Section 2: Interviewers */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <User size={16} className="text-[#A396E2]" />
          <h2 className="text-[15px] font-semibold text-white/80">Interviewers</h2>
          <div className="flex-1 h-px bg-white/[0.06]" />
          <button
            type="button"
            onClick={handleAddInterviewer}
            className="flex items-center gap-1.5 text-[12px] text-[#A396E2]/60 hover:text-[#A396E2] transition-colors"
          >
            <Plus size={13} />
            Add interviewer
          </button>
        </div>

        <div className="space-y-3">
          {interviewers.map((iv, i) => (
            <InterviewerCard
              key={iv._id}
              index={i}
              interviewer={iv}
              onChange={handleChangeInterviewer}
              onRemove={handleRemoveInterviewer}
              isOnly={interviewers.length === 1}
            />
          ))}
        </div>
      </div>

      {/* Error */}
      {formError && (
        <div className="flex items-center gap-2 text-[13px] text-[#f0b8b8] bg-[#f0b8b8]/5 border border-[#f0b8b8]/15 rounded-xl px-4 py-3">
          <AlertCircle size={14} className="flex-shrink-0" />
          {formError}
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-white/25">
          Notes will reference specific moments and close with forward momentum.
        </p>
        <GlassButton
          variant="primary"
          onClick={handleSubmit}
          className="text-[14px] px-6 py-3 gap-2"
        >
          <Sparkles size={15} />
          Draft Notes
        </GlassButton>
      </div>
    </div>
  );
}
