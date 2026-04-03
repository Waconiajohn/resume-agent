import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { ContextLoadedBadge } from '@/components/career-iq/ContextLoadedBadge';
import {
  User,
  Mic,
  LayoutGrid,
  Linkedin,
  Briefcase,
  Users,
  Award,
  Loader2,
  AlertCircle,
  RotateCcw,
  Copy,
  Check,
  ChevronRight,
  Clock,
  Hash,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useExecutiveBio } from '@/hooks/useExecutiveBio';
import { usePriorResult } from '@/hooks/usePriorResult';
import { supabase } from '@/lib/supabase';
import { markdownToHtml } from '@/lib/markdown';

// --- Bio format options ---

interface FormatOption {
  id: string;
  label: string;
  icon: React.ElementType;
  description: string;
}

const FORMAT_OPTIONS: FormatOption[] = [
  { id: 'speaker', label: 'Speaker', icon: Mic, description: 'Conference & keynote bio' },
  { id: 'board', label: 'Board', icon: LayoutGrid, description: 'Board of directors bio' },
  { id: 'advisory', label: 'Advisory', icon: Users, description: 'Advisory board bio' },
  { id: 'professional', label: 'Professional', icon: Briefcase, description: 'General professional bio' },
  { id: 'linkedin_featured', label: 'LinkedIn', icon: Linkedin, description: 'LinkedIn About section' },
];

const LENGTH_OPTIONS = [
  { id: 'short', label: 'Short', description: '50-100 words' },
  { id: 'standard', label: 'Long', description: '150-250 words' },
];

// --- Stage labels ---

const STAGE_LABELS: Record<string, string> = {
  analysis: 'Analyzing your background',
  drafting: 'Drafting bios',
  quality: 'Quality review',
};

// --- Activity feed ---

function ActivityFeed({
  messages,
  currentStage,
}: {
  messages: { id: string; message: string; stage?: string; timestamp: number }[];
  currentStage: string | null;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
      {messages.length === 0 ? (
        <div className="text-center py-8">
          <Loader2 size={20} className="text-[var(--text-soft)] mx-auto mb-2 animate-spin" />
          <p className="text-[12px] text-[var(--text-soft)]">Connecting...</p>
        </div>
      ) : (
        messages.map((msg, i) => {
          const age = messages.length - 1 - i;
          const opacity = age === 0 ? 'text-[var(--text-muted)]' : age <= 2 ? 'text-[var(--text-soft)]' : age <= 5 ? 'text-[var(--text-soft)]' : 'text-[var(--text-soft)]';
          return (
            <div key={msg.id} className="flex items-start gap-2.5 py-0.5">
              <div className={cn('h-1.5 w-1.5 rounded-full mt-1.5 flex-shrink-0', age === 0 ? 'bg-[#A396E2]' : 'bg-[var(--line-strong)]')} />
              <span className={cn('text-[12px] leading-relaxed transition-colors', opacity)}>{msg.message}</span>
            </div>
          );
        })
      )}
      <div ref={bottomRef} />
    </div>
  );
}

// --- Bio section card (per-bio copy + metadata) ---

interface BioSectionCardProps {
  title: string;
  content: string;
}

function BioSectionCard({ title, content }: BioSectionCardProps) {
  const [copied, setCopied] = useState(false);

  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
  const readTime = Math.max(1, Math.round(wordCount / 200));

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }, [content]);

  return (
    <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-5">
      {/* Bio header row */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-semibold text-[#A396E2]/90">{title}</h3>
        <div className="flex items-center gap-2">
          {/* Word count chip */}
          <span className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] bg-[var(--accent-muted)] border border-[var(--line-soft)] text-[var(--text-soft)]">
            <Hash className="h-2.5 w-2.5" />
            {wordCount}w
          </span>
          {/* Read time chip */}
          <span className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] bg-[var(--accent-muted)] border border-[var(--line-soft)] text-[var(--text-soft)]">
            <Clock className="h-2.5 w-2.5" />
            ~{readTime}m
          </span>
          {/* Copy button */}
          <button
            type="button"
            onClick={handleCopy}
            className={cn(
              'flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] border transition-all',
              copied
                ? 'bg-[var(--badge-green-text)]/10 border-[var(--badge-green-text)]/20 text-[var(--badge-green-text)]'
                : 'bg-[var(--accent-muted)] border-[var(--line-soft)] text-[var(--text-soft)] hover:text-[var(--text-muted)] hover:bg-[var(--accent-muted)]',
            )}
          >
            {copied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <p className="text-[13px] text-[var(--text-soft)] leading-relaxed whitespace-pre-wrap">{content}</p>
    </div>
  );
}

// --- Parse bio sections from markdown report ---

function parseBioSections(report: string): { title: string; content: string }[] {
  // Find H2 sections in the markdown report
  const sections: { title: string; content: string }[] = [];
  const lines = report.split('\n');
  let current: { title: string; lines: string[] } | null = null;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (current) {
        const content = current.lines.join('\n').trim();
        if (content) sections.push({ title: current.title, content });
      }
      current = { title: line.replace(/^## /, '').trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) {
    const content = current.lines.join('\n').trim();
    if (content) sections.push({ title: current.title, content });
  }

  return sections;
}

// --- Report view ---

function ReportView({
  report,
  qualityScore,
  onReset,
}: {
  report: string;
  qualityScore: number | null;
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

  const bioSections = parseBioSections(report);
  const hasParsedSections = bioSections.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-gradient-to-br from-[#A396E2]/15 to-[var(--link)]/10 p-2.5 border border-[#A396E2]/20">
            <User size={18} className="text-[#A396E2]" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-[var(--text-strong)]">Executive Bio Collection</h2>
            <p className="text-[13px] text-[var(--text-soft)]">Your bios, ready to deploy across every channel</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {qualityScore !== null && (
            <div className={cn(
              'text-[12px] font-semibold px-3 py-1.5 rounded-full border',
              qualityScore >= 80
                ? 'text-[var(--badge-green-text)] bg-[var(--badge-green-text)]/10 border-[var(--badge-green-text)]/20'
                : qualityScore >= 60
                ? 'text-[var(--badge-amber-text)] bg-[var(--badge-amber-text)]/10 border-[var(--badge-amber-text)]/20'
                : 'text-[var(--badge-red-text)] bg-[var(--badge-red-text)]/10 border-[var(--badge-red-text)]/20',
            )}>
              Quality {qualityScore}%
            </div>
          )}
          <GlassButton variant="ghost" onClick={handleCopyAll} size="sm">
            {copiedAll ? <Check size={14} className="mr-1.5 text-[var(--badge-green-text)]" /> : <Copy size={14} className="mr-1.5" />}
            {copiedAll ? 'Copied' : 'Copy All'}
          </GlassButton>
          <GlassButton variant="ghost" onClick={onReset} size="sm">
            <RotateCcw size={14} className="mr-1.5" />
            New Bios
          </GlassButton>
        </div>
      </div>

      {/* Quality bar */}
      {qualityScore !== null && (
        <GlassCard className="px-4 py-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[13px] text-[var(--text-soft)]">Bio Collection Quality</span>
            <span className={cn(
              'text-[13px] font-semibold',
              qualityScore >= 80 ? 'text-[var(--badge-green-text)]' : qualityScore >= 60 ? 'text-[var(--badge-amber-text)]' : 'text-[var(--badge-red-text)]',
            )}>
              {qualityScore >= 80 ? 'Strong' : qualityScore >= 60 ? 'Good' : 'Needs Work'}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[var(--accent-muted)]">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                qualityScore >= 80 ? 'bg-[var(--badge-green-text)]/60' : qualityScore >= 60 ? 'bg-[var(--badge-amber-text)]/60' : 'bg-[var(--badge-red-text)]/60',
              )}
              style={{ width: `${qualityScore}%` }}
            />
          </div>
        </GlassCard>
      )}

      {/* Per-bio cards (if parseable) or fallback prose */}
      {hasParsedSections ? (
        <div className="space-y-3">
          {bioSections.map((section, i) => (
            <BioSectionCard key={i} title={section.title} content={section.content} />
          ))}
        </div>
      ) : (
        <GlassCard className="p-8 bg-gradient-to-br from-white/[0.04] to-white/[0.02]">
          <div
            className="prose prose-invert prose-sm max-w-none
              prose-headings:text-[var(--text-strong)] prose-headings:font-semibold
              prose-h1:text-lg prose-h1:border-b prose-h1:border-[var(--line-soft)] prose-h1:pb-3 prose-h1:mb-5
              prose-h2:text-[15px] prose-h2:mt-7 prose-h2:mb-3 prose-h2:text-[#A396E2]/90
              prose-h3:text-[14px] prose-h3:mt-5 prose-h3:mb-2 prose-h3:text-[var(--text-muted)]
              prose-p:text-[var(--text-soft)] prose-p:text-[13px] prose-p:leading-relaxed prose-p:my-2
              prose-li:text-[var(--text-soft)] prose-li:text-[13px] prose-li:leading-relaxed
              prose-strong:text-[var(--text-strong)]
              prose-em:text-[var(--badge-amber-text)]/80
              prose-blockquote:border-[#A396E2]/30 prose-blockquote:text-[var(--text-soft)] prose-blockquote:bg-[#A396E2]/[0.03] prose-blockquote:rounded-r-lg prose-blockquote:py-1
              prose-hr:border-[var(--line-soft)] prose-hr:my-6"
            dangerouslySetInnerHTML={{ __html: markdownToHtml(report) }}
          />
        </GlassCard>
      )}
    </div>
  );
}

// --- Main component ---

export function ExecutiveBioRoom() {
  const [resumeText, setResumeText] = useState('');
  const [resumeLoading, setResumeLoading] = useState(false);
  const [selectedFormats, setSelectedFormats] = useState<string[]>(['professional', 'linkedin_featured']);
  const [selectedLengths, setSelectedLengths] = useState<string[]>(['short', 'standard']);
  const [targetRole, setTargetRole] = useState('');
  const [targetIndustry, setTargetIndustry] = useState('');

  const {
    status,
    report,
    qualityScore,
    activityMessages,
    error,
    currentStage,
    startPipeline,
    reset,
  } = useExecutiveBio();

  const isPipelineActive = status === 'connecting' || status === 'running';
  const { priorResult, loading: priorLoading, clearPrior } = usePriorResult<{ report_markdown?: string; quality_score?: number }>({
    productSlug: 'executive-bio',
    skip: isPipelineActive,
  });

  // Auto-load resume
  useEffect(() => {
    let cancelled = false;
    async function loadResume() {
      setResumeLoading(true);
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
          setResumeText(data.raw_text);
        }
      } catch { /* ignore */ } finally {
        if (!cancelled) setResumeLoading(false);
      }
    }
    loadResume();
    return () => { cancelled = true; };
  }, []);

  const toggleFormat = useCallback((id: string) => {
    setSelectedFormats((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id],
    );
  }, []);

  const toggleLength = useCallback((id: string) => {
    setSelectedLengths((prev) =>
      prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id],
    );
  }, []);

  const canSubmit = resumeText.length > 50 && selectedFormats.length > 0 && selectedLengths.length > 0;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    await startPipeline({
      resumeText,
      requestedFormats: selectedFormats,
      requestedLengths: selectedLengths,
      targetRole: targetRole.trim() || undefined,
      targetIndustry: targetIndustry.trim() || undefined,
    });
  }, [canSubmit, resumeText, selectedFormats, selectedLengths, targetRole, targetIndustry, startPipeline]);

  const handleReset = useCallback(() => {
    reset();
  }, [reset]);

  // Complete view
  if (status === 'complete' && report) {
    return (
      <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
        <ReportView report={report} qualityScore={qualityScore} onReset={handleReset} />
      </div>
    );
  }

  // Running view
  if (status === 'connecting' || status === 'running') {
    const stageOrder = ['analysis', 'drafting', 'quality'];
    const currentIdx = currentStage ? stageOrder.indexOf(currentStage) : -1;

    return (
      <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-[var(--text-strong)]">Executive Bio Suite</h1>
          <p className="text-[13px] text-[var(--text-soft)]">
            Drafting {selectedFormats.length} bio{selectedFormats.length !== 1 ? 's' : ''} in {selectedLengths.join(' & ')} formats...
          </p>
        </div>

        {/* Stage indicators */}
        <div className="flex items-center gap-3">
          {stageOrder.map((stage, i, arr) => {
            const stageIdx = stageOrder.indexOf(stage);
            const isDone = currentIdx > stageIdx;
            const isActive = currentStage === stage;
            return (
              <div key={stage} className="flex items-center gap-3">
                <div className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-medium transition-all',
                  isActive ? 'bg-[#A396E2]/15 text-[#A396E2] border border-[#A396E2]/25'
                    : isDone ? 'bg-[var(--badge-green-text)]/10 text-[var(--badge-green-text)] border border-[var(--badge-green-text)]/20'
                    : 'bg-[var(--accent-muted)] text-[var(--text-soft)] border border-[var(--line-soft)]',
                )}>
                  {isActive && <Loader2 size={10} className="animate-spin" />}
                  {isDone && <Check size={10} />}
                  {STAGE_LABELS[stage]}
                </div>
                {i < arr.length - 1 && <ChevronRight size={12} className="text-[var(--text-soft)] flex-shrink-0" />}
              </div>
            );
          })}
        </div>

        {/* Activity feed */}
        <GlassCard className="p-6 bg-gradient-to-br from-white/[0.04] to-white/[0.02]">
          <div className="flex items-center gap-2 mb-5">
            <div className="rounded-lg bg-[#A396E2]/10 p-2">
              <Loader2 size={16} className="text-[#A396E2] animate-spin" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-[var(--text-strong)]">
                {currentStage ? STAGE_LABELS[currentStage] ?? currentStage : 'Starting...'}
              </h3>
              <p className="text-[12px] text-[var(--text-soft)]">Crafting bios that position you as the benchmark</p>
            </div>
          </div>
          <ActivityFeed messages={activityMessages} currentStage={currentStage} />
        </GlassCard>

        <button
          type="button"
          onClick={handleReset}
          className="text-[12px] text-[var(--text-soft)] hover:text-[var(--text-soft)] transition-colors self-start"
        >
          Cancel
        </button>
      </div>
    );
  }

  // Error view
  if (status === 'error') {
    return (
      <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-[var(--text-strong)]">Executive Bio Suite</h1>
        </div>
        <GlassCard className="p-6 border-[var(--badge-red-text)]/20">
          <div className="flex items-start gap-3 mb-4">
            <AlertCircle size={18} className="text-[var(--badge-red-text)] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] text-[var(--badge-red-text)] font-medium">Generation failed</p>
              <p className="text-[12px] text-[var(--text-soft)] mt-0.5">{error}</p>
            </div>
          </div>
          <GlassButton variant="ghost" onClick={handleReset} size="sm">
            Try Again
          </GlassButton>
        </GlassCard>
      </div>
    );
  }

  // Idle form
  return (
    <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
      {/* Room header */}
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-gradient-to-br from-[#A396E2]/15 to-[var(--link)]/10 p-2.5 border border-[#A396E2]/20">
          <User size={20} className="text-[#A396E2]" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-strong)]">Executive Bio Suite</h1>
          <p className="text-[13px] text-[var(--text-soft)]">Generate professional bios for every channel — speaker, board, LinkedIn, and more</p>
        </div>
      </div>
      <ContextLoadedBadge
        contextTypes={['career_profile', 'positioning_strategy', 'career_narrative', 'emotional_baseline']}
        className="mb-3"
      />

      {/* Prior result */}
      {priorLoading && (
        <GlassCard className="p-4 mb-4">
          <div className="flex items-center gap-2 text-[12px] text-[var(--text-soft)]">
            <Loader2 size={12} className="animate-spin" />
            Loading previous result...
          </div>
        </GlassCard>
      )}
      {priorResult && !isPipelineActive && (
        <GlassCard className="p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-[var(--text-muted)]">Previous Result</h3>
            <button
              type="button"
              onClick={clearPrior}
              className="flex items-center gap-1.5 text-xs text-[var(--text-soft)] hover:text-[var(--text-strong)] transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              New Bio Suite
            </button>
          </div>
          <div
            className="prose prose-invert prose-sm max-w-none text-[var(--text-strong)] max-h-96 overflow-y-auto"
            dangerouslySetInnerHTML={{ __html: markdownToHtml(priorResult.report_markdown ?? '') }}
          />
        </GlassCard>
      )}

      {/* Resume section */}
      <GlassCard className="p-6 bg-gradient-to-br from-white/[0.04] to-white/[0.02]">
        <div className="flex items-center gap-2 mb-4">
          <Award size={15} className="text-[#A396E2]" />
          <h2 className="text-[14px] font-semibold text-[var(--text-muted)]">Your Resume</h2>
        </div>

        {resumeLoading ? (
          <div className="flex items-center gap-2 text-[12px] text-[var(--text-soft)]">
            <Loader2 size={12} className="animate-spin" />
            Loading from Resume Strategist...
          </div>
        ) : resumeText.length > 50 ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[12px] text-[var(--badge-green-text)]/70">
              <Check size={12} />
              Resume loaded — {Math.round(resumeText.length / 5)} words
            </div>
            <button
              type="button"
              onClick={() => setResumeText('')}
              className="text-[13px] text-[var(--text-soft)] hover:text-[var(--text-soft)] transition-colors"
            >
              Clear and paste manually
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[12px] text-[var(--badge-amber-text)]/70 mb-1">
              <AlertCircle size={12} />
              No master resume found — paste below
            </div>
            <textarea
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              placeholder="Paste your full resume text here..."
              rows={6}
              className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 text-[13px] text-[var(--text-strong)] placeholder:text-[var(--text-soft)] resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:border-[#A396E2]/40 focus:ring-2 focus:ring-[#A396E2]/10 transition-all"
            />
          </div>
        )}
      </GlassCard>

      {/* Bio format selection */}
      <GlassCard className="p-6 bg-gradient-to-br from-white/[0.04] to-white/[0.02]">
        <div className="flex items-center gap-2 mb-5">
          <LayoutGrid size={15} className="text-[#A396E2]" />
          <h2 className="text-[14px] font-semibold text-[var(--text-muted)]">Bio Formats</h2>
          <span className="ml-auto text-[13px] text-[var(--text-soft)]">Select all that apply</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {FORMAT_OPTIONS.map(({ id, label, icon: Icon, description }) => {
            const isSelected = selectedFormats.includes(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleFormat(id)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-xl p-4 border text-center transition-all',
                  isSelected
                    ? 'bg-[#A396E2]/10 border-[#A396E2]/30 text-[#A396E2]'
                    : 'bg-[var(--accent-muted)] border-[var(--line-soft)] text-[var(--text-soft)] hover:bg-[var(--accent-muted)] hover:text-[var(--text-soft)]',
                )}
              >
                <Icon size={18} />
                <div>
                  <div className="text-[12px] font-semibold">{label}</div>
                  <div className="text-[12px] opacity-60 mt-0.5">{description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </GlassCard>

      {/* Length + optional fields */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GlassCard className="p-6 bg-gradient-to-br from-white/[0.04] to-white/[0.02]">
          <h2 className="text-[14px] font-semibold text-[var(--text-muted)] mb-4">Bio Length</h2>
          <div className="flex gap-3">
            {LENGTH_OPTIONS.map(({ id, label, description }) => {
              const isSelected = selectedLengths.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleLength(id)}
                  className={cn(
                    'flex-1 flex flex-col items-center gap-1 rounded-xl p-4 border transition-all',
                    isSelected
                      ? 'bg-[var(--link)]/10 border-[var(--link)]/30 text-[var(--link)]'
                      : 'bg-[var(--accent-muted)] border-[var(--line-soft)] text-[var(--text-soft)] hover:bg-[var(--accent-muted)] hover:text-[var(--text-soft)]',
                  )}
                >
                  <span className="text-[13px] font-semibold">{label}</span>
                  <span className="text-[13px] opacity-60">{description}</span>
                </button>
              );
            })}
          </div>
        </GlassCard>

        <GlassCard className="p-6 bg-gradient-to-br from-white/[0.04] to-white/[0.02] flex flex-col gap-4">
          <h2 className="text-[14px] font-semibold text-[var(--text-muted)]">Target Context <span className="text-[13px] font-normal text-[var(--text-soft)]">optional</span></h2>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold text-[var(--text-soft)] uppercase tracking-wider">Target Role</label>
            <input
              type="text"
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              placeholder="e.g. Chief Operating Officer"
              className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 text-[13px] text-[var(--text-strong)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:border-[#A396E2]/40 focus:ring-2 focus:ring-[#A396E2]/10 transition-all"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold text-[var(--text-soft)] uppercase tracking-wider">Target Industry</label>
            <input
              type="text"
              value={targetIndustry}
              onChange={(e) => setTargetIndustry(e.target.value)}
              placeholder="e.g. Healthcare Technology"
              className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 text-[13px] text-[var(--text-strong)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:border-[#A396E2]/40 focus:ring-2 focus:ring-[#A396E2]/10 transition-all"
            />
          </div>
        </GlassCard>
      </div>

      {/* Submit */}
      <div className="flex items-center justify-between pt-2">
        <p className="text-[12px] text-[var(--text-soft)]">
          Generating {selectedFormats.length || 0} bio{selectedFormats.length !== 1 ? 's' : ''} × {selectedLengths.length || 0} length{selectedLengths.length !== 1 ? 's' : ''}.
          Takes 1-2 minutes.
        </p>
        <GlassButton
          variant="primary"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={cn(
            'px-6 py-3 text-[14px] font-medium rounded-xl',
            'bg-gradient-to-r from-[#A396E2]/20 to-[var(--link)]/15 hover:from-[#A396E2]/30 hover:to-[var(--link)]/25',
            !canSubmit && 'opacity-40 cursor-not-allowed',
          )}
        >
          <User size={15} className="mr-2" />
          Generate Bio Suite
        </GlassButton>
      </div>
    </div>
  );
}
