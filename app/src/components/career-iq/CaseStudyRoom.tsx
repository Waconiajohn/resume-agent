import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { ContextLoadedBadge } from '@/components/career-iq/ContextLoadedBadge';
import {
  BookOpen,
  Target,
  Sparkles,
  Loader2,
  AlertCircle,
  RotateCcw,
  Copy,
  Check,
  ChevronRight,
  Minus,
  Plus,
  TrendingUp,
  Wrench,
  BarChart3,
  Lightbulb,
  Tag,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useCaseStudy } from '@/hooks/useCaseStudy';
import { usePriorResult } from '@/hooks/usePriorResult';
import { supabase } from '@/lib/supabase';
import { markdownToHtml } from '@/lib/markdown';

// --- Stage labels ---

const STAGE_LABELS: Record<string, string> = {
  selection: 'Selecting strongest achievements',
  drafting: 'Drafting case studies',
  quality: 'Quality & polish review',
};

// --- Activity feed ---

function ActivityFeed({
  messages,
}: {
  messages: { id: string; message: string; stage?: string; timestamp: number }[];
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
          const opacity = age === 0 ? 'text-[var(--text-muted)]' : 'text-[var(--text-soft)]';
          return (
            <div key={msg.id} className="flex items-start gap-2.5 py-0.5">
              <div className={cn('h-1.5 w-1.5 rounded-full mt-1.5 flex-shrink-0', age === 0 ? 'bg-[var(--badge-green-text)]' : 'bg-[var(--line-strong)]')} />
              <span className={cn('text-[12px] leading-relaxed transition-colors', opacity)}>{msg.message}</span>
            </div>
          );
        })
      )}
      <div ref={bottomRef} />
    </div>
  );
}

// --- Slider component ---

function CaseStudySlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <label className="text-[12px] font-semibold text-[var(--text-soft)] uppercase tracking-wider">Number of Case Studies</label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Decrease case study count"
            onClick={() => onChange(Math.max(1, value - 1))}
            disabled={value <= 1}
            className="rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] p-1.5 text-[var(--text-soft)] hover:text-[var(--text-strong)] hover:bg-[var(--accent-muted)] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Minus size={12} />
          </button>
          <span className="w-8 text-center text-[16px] font-bold text-[var(--text-strong)]">{value}</span>
          <button
            type="button"
            aria-label="Increase case study count"
            onClick={() => onChange(Math.min(5, value + 1))}
            disabled={value >= 5}
            className="rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] p-1.5 text-[var(--text-soft)] hover:text-[var(--text-strong)] hover:bg-[var(--accent-muted)] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`Set to ${n} case stud${n !== 1 ? 'ies' : 'y'}`}
            onClick={() => onChange(n)}
            className={cn(
              'flex-1 h-2 rounded-full transition-all',
              n <= value ? 'bg-[var(--badge-green-text)]/60' : 'bg-[var(--surface-1)]',
            )}
          />
        ))}
      </div>
      <p className="text-[13px] text-[var(--text-soft)]">
        {value === 1 ? 'One deep-dive case study' : `${value} consulting-grade case studies`}
      </p>
    </div>
  );
}

// --- Metric highlight chip ---

interface MetricChip {
  label: string;
  value: string;
}

function MetricHighlight({ metric }: { metric: MetricChip }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-[var(--badge-green-text)]/15 bg-[var(--badge-green-text)]/[0.04] px-4 py-3 min-w-[80px]">
      <span className="text-[20px] font-bold text-[var(--badge-green-text)] leading-none">{metric.value}</span>
      <span className="text-[12px] text-[var(--text-soft)] mt-1 text-center leading-tight">{metric.label}</span>
    </div>
  );
}

// --- Parse metrics from text ---

function extractMetrics(text: string): MetricChip[] {
  const metrics: MetricChip[] = [];
  // Match patterns like: $X.XM, X%, Xx, $XB, X months, X weeks, team of X
  const patterns: { regex: RegExp; label: string }[] = [
    { regex: /\$(\d+(?:\.\d+)?[MBK]?)\s*(?:in\s+)?(?:revenue|savings|growth|ARR|pipeline)/gi, label: 'Revenue/Savings' },
    { regex: /(\d+(?:\.\d+)?%)\s*(?:increase|growth|reduction|improvement|churn|conversion|retention)/gi, label: 'Improvement' },
    { regex: /(\d+)\s*(?:months?|weeks?)\s*(?:to|ahead|under|early)/gi, label: 'Timeline' },
    { regex: /team\s+(?:of\s+)?(\d+)/gi, label: 'Team Size' },
    { regex: /(\d+x)\s*(?:faster|growth|increase|improvement)/gi, label: 'Multiplier' },
  ];

  for (const { regex, label } of patterns) {
    let match: RegExpExecArray | null;
    regex.lastIndex = 0;
    while ((match = regex.exec(text)) !== null && metrics.length < 4) {
      const value = match[1];
      if (value && !metrics.some((m) => m.value === value)) {
        metrics.push({ value, label });
      }
    }
    if (metrics.length >= 4) break;
  }

  return metrics.slice(0, 4);
}

// --- Parse skill/industry tags from text ---

function extractTags(text: string): string[] {
  const tagPatterns = [
    /\b(supply chain|digital transformation|go-to-market|product-led growth|enterprise sales|data analytics|cloud migration|AI|machine learning|ERP|CRM|SaaS|P&L|M&A|post-merger integration|turnaround|cost reduction|revenue growth|customer success|workforce transformation)\b/gi,
  ];

  const found = new Set<string>();
  for (const pattern of tagPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null && found.size < 5) {
      found.add(match[0].toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()));
    }
  }
  return Array.from(found).slice(0, 5);
}

// --- Structured case study card ---

interface CaseStudyCardSection {
  type: 'challenge' | 'approach' | 'results' | 'unique';
  label: string;
  content: string;
  icon: React.ElementType;
  color: string;
  border: string;
}

const SECTION_CONFIG: Omit<CaseStudyCardSection, 'content'>[] = [
  { type: 'challenge', label: 'Challenge', icon: AlertCircle, color: 'text-[var(--badge-amber-text)]', border: 'border-[var(--badge-amber-text)]/15' },
  { type: 'approach', label: 'Approach', icon: Wrench, color: 'text-[var(--link)]', border: 'border-[var(--link)]/15' },
  { type: 'results', label: 'Results', icon: TrendingUp, color: 'text-[var(--badge-green-text)]', border: 'border-[var(--badge-green-text)]/15' },
  { type: 'unique', label: 'What Made This Unique', icon: Lightbulb, color: 'text-[var(--badge-amber-text)]', border: 'border-[var(--badge-amber-text)]/15' },
];

function parseCaseStudySections(content: string): Partial<Record<CaseStudyCardSection['type'], string>> {
  const sections: Partial<Record<CaseStudyCardSection['type'], string>> = {};

  // Try to parse H3 sub-sections within a case study
  const lines = content.split('\n');
  let currentSection: CaseStudyCardSection['type'] | null = null;
  let buffer: string[] = [];

  const sectionKeywords: Record<string, CaseStudyCardSection['type']> = {
    situation: 'challenge',
    challenge: 'challenge',
    context: 'challenge',
    approach: 'approach',
    action: 'approach',
    task: 'approach',
    result: 'results',
    results: 'results',
    impact: 'results',
    outcome: 'results',
    'what made': 'unique',
    unique: 'unique',
    lesson: 'unique',
  };

  for (const line of lines) {
    if (line.startsWith('### ') || line.startsWith('**')) {
      // Save previous
      if (currentSection && buffer.length > 0) {
        sections[currentSection] = buffer.join('\n').trim();
        buffer = [];
      }
      const heading = line.replace(/^#{1,3}\s*\*{0,2}/, '').replace(/\*{0,2}:?$/, '').trim().toLowerCase();
      for (const [keyword, type] of Object.entries(sectionKeywords)) {
        if (heading.includes(keyword)) {
          currentSection = type;
          break;
        }
      }
    } else if (currentSection) {
      buffer.push(line);
    }
  }

  if (currentSection && buffer.length > 0) {
    sections[currentSection] = buffer.join('\n').trim();
  }

  return sections;
}

interface StructuredCaseStudyCardProps {
  title: string;
  content: string;
}

function StructuredCaseStudyCard({ title, content }: StructuredCaseStudyCardProps) {
  const [copied, setCopied] = useState(false);

  const sections = parseCaseStudySections(content);
  const metrics = extractMetrics(content);
  const tags = extractTags(content);
  const hasSections = Object.keys(sections).length >= 2;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }, [content]);

  return (
    <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] overflow-hidden">
      {/* Card header */}
      <div className="flex items-start justify-between px-5 py-4 border-b border-[var(--line-soft)] bg-[var(--accent-muted)]">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="rounded-lg bg-[var(--badge-green-text)]/10 p-1.5 flex-shrink-0">
            <BookOpen size={14} className="text-[var(--badge-green-text)]" />
          </div>
          <h3 className="text-[14px] font-semibold text-[var(--text-strong)] truncate">{title}</h3>
        </div>
        <div className="flex items-center gap-2 ml-3 flex-shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className={cn(
              'flex items-center gap-1 rounded-md px-2 py-1 text-[12px] border transition-all',
              copied
                ? 'bg-[var(--badge-green-text)]/10 border-[var(--badge-green-text)]/20 text-[var(--badge-green-text)]'
                : 'bg-[var(--accent-muted)] border-[var(--line-soft)] text-[var(--text-soft)] hover:text-[var(--text-muted)] hover:bg-[var(--accent-muted)]',
            )}
          >
            {copied ? <Check size={10} /> : <Copy size={10} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Metric highlights (if found) */}
        {metrics.length > 0 && (
          <div className="flex gap-3 flex-wrap">
            {metrics.map((m, i) => (
              <MetricHighlight key={i} metric={m} />
            ))}
          </div>
        )}

        {/* Structured narrative sections or raw content */}
        {hasSections ? (
          <div className="space-y-3">
            {SECTION_CONFIG.map(({ type, label, icon: Icon, color, border }) => {
              const sectionContent = sections[type];
              if (!sectionContent) return null;
              return (
                <div key={type} className={cn('rounded-lg border p-3.5', border, 'bg-[var(--accent-muted)]')}>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={cn('h-3 w-3', color)} />
                    <span className={cn('text-[12px] font-semibold uppercase tracking-wider', color)}>
                      {label}
                    </span>
                  </div>
                  <p className="text-[12px] text-[var(--text-soft)] leading-relaxed whitespace-pre-wrap">{sectionContent}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[13px] text-[var(--text-soft)] leading-relaxed whitespace-pre-wrap">{content}</p>
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <Tag className="h-3 w-3 text-[var(--text-soft)] flex-shrink-0" />
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md px-1.5 py-0.5 text-[12px] bg-[var(--accent-muted)] border border-[var(--line-soft)] text-[var(--text-soft)]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Parse case studies from markdown report ---

function parseCaseStudies(report: string): { title: string; content: string }[] {
  const studies: { title: string; content: string }[] = [];
  const lines = report.split('\n');
  let current: { title: string; lines: string[] } | null = null;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (current) {
        const content = current.lines.join('\n').trim();
        if (content) studies.push({ title: current.title, content });
      }
      current = { title: line.replace(/^## /, '').trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) {
    const content = current.lines.join('\n').trim();
    if (content) studies.push({ title: current.title, content });
  }

  return studies;
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

  const caseStudies = parseCaseStudies(report);
  const hasParsedStudies = caseStudies.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-gradient-to-br from-[var(--badge-green-text)]/15 to-[var(--link)]/10 p-2.5 border border-[var(--badge-green-text)]/20">
            <BookOpen size={18} className="text-[var(--badge-green-text)]" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-[var(--text-strong)]">Case Study Portfolio</h2>
            <p className="text-[13px] text-[var(--text-soft)]">Consulting-grade narratives from your real achievements</p>
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
            New Case Studies
          </GlassButton>
        </div>
      </div>

      {/* Quality bar */}
      {qualityScore !== null && (
        <GlassCard className="px-4 py-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[13px] text-[var(--text-soft)]">Portfolio Quality</span>
            <span className={cn(
              'text-[13px] font-semibold',
              qualityScore >= 80 ? 'text-[var(--badge-green-text)]' : qualityScore >= 60 ? 'text-[var(--badge-amber-text)]' : 'text-[var(--badge-red-text)]',
            )}>
              {qualityScore >= 80 ? 'Consulting-Grade' : qualityScore >= 60 ? 'Strong' : 'Needs Work'}
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

      {/* Structured case study cards or fallback prose */}
      {hasParsedStudies ? (
        <div className="space-y-4">
          {caseStudies.map((study, i) => (
            <StructuredCaseStudyCard
              key={i}
              title={study.title}
              content={study.content}
            />
          ))}
        </div>
      ) : (
        <GlassCard className="p-8 bg-[var(--accent-muted)]">
          <div
            className="prose prose-invert prose-sm max-w-none
              prose-headings:text-[var(--text-strong)] prose-headings:font-semibold
              prose-h1:text-lg prose-h1:border-b prose-h1:border-[var(--line-soft)] prose-h1:pb-3 prose-h1:mb-5
              prose-h2:text-[15px] prose-h2:mt-7 prose-h2:mb-3 prose-h2:text-[var(--badge-green-text)]/90
              prose-h3:text-[14px] prose-h3:mt-5 prose-h3:mb-2 prose-h3:text-[var(--text-muted)]
              prose-p:text-[var(--text-soft)] prose-p:text-[13px] prose-p:leading-relaxed prose-p:my-2
              prose-li:text-[var(--text-soft)] prose-li:text-[13px] prose-li:leading-relaxed
              prose-strong:text-[var(--text-strong)]
              prose-em:text-[var(--badge-amber-text)]/80
              prose-blockquote:border-[var(--badge-green-text)]/30 prose-blockquote:text-[var(--text-soft)] prose-blockquote:bg-[var(--badge-green-text)]/[0.03] prose-blockquote:rounded-r-lg prose-blockquote:py-1
              prose-hr:border-[var(--line-soft)] prose-hr:my-6"
            dangerouslySetInnerHTML={{ __html: markdownToHtml(report) }}
          />
        </GlassCard>
      )}
    </div>
  );
}

// --- Main component ---

export function CaseStudyRoom() {
  const [resumeText, setResumeText] = useState('');
  const [resumeLoading, setResumeLoading] = useState(false);
  const [focusAreas, setFocusAreas] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [targetIndustry, setTargetIndustry] = useState('');
  const [maxCaseStudies, setMaxCaseStudies] = useState(3);

  const {
    status,
    report,
    qualityScore,
    activityMessages,
    error,
    currentStage,
    startPipeline,
    reset,
  } = useCaseStudy();

  const isPipelineActive = status === 'connecting' || status === 'running';
  const { priorResult, loading: priorLoading, clearPrior } = usePriorResult<{ report_markdown?: string; quality_score?: number }>({
    productSlug: 'case-study',
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

  const canSubmit = resumeText.length > 50;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    await startPipeline({
      resumeText,
      focusAreas: focusAreas.trim() || undefined,
      targetRole: targetRole.trim() || undefined,
      targetIndustry: targetIndustry.trim() || undefined,
      maxCaseStudies,
    });
  }, [canSubmit, resumeText, focusAreas, targetRole, targetIndustry, maxCaseStudies, startPipeline]);

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
    const stageOrder = ['selection', 'drafting', 'quality'];
    const currentIdx = currentStage ? stageOrder.indexOf(currentStage) : -1;

    return (
      <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-[var(--text-strong)]">Case Study Generator</h1>
          <p className="text-[13px] text-[var(--text-soft)]">
            Building {maxCaseStudies} consulting-grade case stud{maxCaseStudies !== 1 ? 'ies' : 'y'}...
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
                  isActive ? 'bg-[var(--badge-green-text)]/15 text-[var(--badge-green-text)] border border-[var(--badge-green-text)]/25'
                    : isDone ? 'bg-[var(--badge-green-text)]/10 text-[var(--badge-green-text)]/60 border border-[var(--badge-green-text)]/15'
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
        <GlassCard className="p-6 bg-[var(--accent-muted)]">
          <div className="flex items-center gap-2 mb-5">
            <div className="rounded-lg bg-[var(--badge-green-text)]/10 p-2">
              <Loader2 size={16} className="text-[var(--badge-green-text)] animate-spin" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-[var(--text-strong)]">
                {currentStage ? STAGE_LABELS[currentStage] ?? currentStage : 'Starting...'}
              </h3>
              <p className="text-[12px] text-[var(--text-soft)]">Building compelling stories from your achievements</p>
            </div>
          </div>
          <ActivityFeed messages={activityMessages} />
        </GlassCard>

        <button
          type="button"
          onClick={handleReset}
          className="text-[12px] text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors self-start"
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
          <h1 className="text-xl font-semibold text-[var(--text-strong)]">Case Study Generator</h1>
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
        <div className="rounded-xl bg-gradient-to-br from-[var(--badge-green-text)]/15 to-[var(--link)]/10 p-2.5 border border-[var(--badge-green-text)]/20">
          <BookOpen size={20} className="text-[var(--badge-green-text)]" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-strong)]">Case Study Generator</h1>
          <p className="text-[13px] text-[var(--text-soft)]">Transform your achievements into compelling business stories — structured with metrics, narrative arc, and what only you could have done</p>
        </div>
      </div>
      <ContextLoadedBadge
        contextTypes={['positioning_strategy', 'evidence_item', 'emotional_baseline']}
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
              New Case Studies
            </button>
          </div>
          <div
            className="prose prose-invert prose-sm max-w-none text-[var(--text-strong)] max-h-96 overflow-y-auto"
            dangerouslySetInnerHTML={{ __html: markdownToHtml(priorResult.report_markdown ?? '') }}
          />
        </GlassCard>
      )}

      {/* Resume section */}
      <GlassCard className="p-6 bg-[var(--accent-muted)]">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={15} className="text-[var(--badge-green-text)]" />
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
              className="text-[13px] text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors"
            >
              Clear and paste manually
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[12px] text-[var(--badge-amber-text)]/70 mb-1">
              <AlertCircle size={12} />
              No Career Evidence found — paste below
            </div>
            <textarea
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              placeholder="Paste your full resume text here..."
              rows={6}
              className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 text-[13px] text-[var(--text-strong)] placeholder:text-[var(--text-soft)] resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:border-[var(--badge-green-text)]/40 focus:ring-2 focus:ring-[var(--badge-green-text)]/10 transition-all"
            />
          </div>
        )}
      </GlassCard>

      {/* Options */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left — Focus + count */}
        <GlassCard className="p-6 bg-[var(--accent-muted)] flex flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 mb-2">
              <Target size={15} className="text-[var(--badge-green-text)]" />
              <h2 className="text-[14px] font-semibold text-[var(--text-muted)]">Focus Areas <span className="text-[13px] font-normal text-[var(--text-soft)]">optional</span></h2>
            </div>
            <label htmlFor="focus-areas-input" className="text-[12px] font-semibold text-[var(--text-soft)] uppercase tracking-wider">What to emphasize</label>
            <textarea
              id="focus-areas-input"
              value={focusAreas}
              onChange={(e) => setFocusAreas(e.target.value)}
              placeholder="e.g. Cost reduction, team leadership, digital transformation, supply chain optimization..."
              rows={3}
              className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 text-[13px] text-[var(--text-strong)] placeholder:text-[var(--text-soft)] resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:border-[var(--badge-green-text)]/40 focus:ring-2 focus:ring-[var(--badge-green-text)]/10 transition-all"
            />
          </div>

          <CaseStudySlider value={maxCaseStudies} onChange={setMaxCaseStudies} />
        </GlassCard>

        {/* Right — Target context */}
        <GlassCard className="p-6 bg-[var(--accent-muted)] flex flex-col gap-5">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 size={15} className="text-[var(--link)]" />
            <h2 className="text-[14px] font-semibold text-[var(--text-muted)]">Target Context <span className="text-[13px] font-normal text-[var(--text-soft)]">optional</span></h2>
          </div>
          <p className="text-[12px] text-[var(--text-soft)] -mt-3">Tailor the case studies for a specific role or industry</p>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="target-role-input" className="text-[12px] font-semibold text-[var(--text-soft)] uppercase tracking-wider">Target Role</label>
            <input
              id="target-role-input"
              type="text"
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              placeholder="e.g. Chief Operating Officer"
              className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 text-[13px] text-[var(--text-strong)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:border-[var(--link)]/40 focus:ring-2 focus:ring-[var(--link)]/10 transition-all"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="target-industry-input" className="text-[12px] font-semibold text-[var(--text-soft)] uppercase tracking-wider">Target Industry</label>
            <input
              id="target-industry-input"
              type="text"
              value={targetIndustry}
              onChange={(e) => setTargetIndustry(e.target.value)}
              placeholder="e.g. Healthcare Technology"
              className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 text-[13px] text-[var(--text-strong)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:border-[var(--link)]/40 focus:ring-2 focus:ring-[var(--link)]/10 transition-all"
            />
          </div>

          {/* What you'll get */}
          <div className="rounded-xl border border-[var(--badge-green-text)]/15 bg-[var(--badge-green-text)]/[0.04] p-4 mt-auto">
            <p className="text-[13px] font-semibold text-[var(--badge-green-text)]/70 uppercase tracking-wider mb-2">What you'll get</p>
            <ul className="space-y-1">
              {[
                'Challenge → Approach → Results → Impact structure',
                'Specific metrics with before/after context',
                'What Made This Unique section',
                'Industry and skill tags',
                'Ready for interviews, proposals, and portfolio',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-[13px] text-[var(--text-soft)]">
                  <Check size={10} className="text-[var(--badge-green-text)]/60 mt-0.5 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </GlassCard>
      </div>

      {/* Submit */}
      <div className="flex items-center justify-between pt-2">
        <p className="text-[12px] text-[var(--text-soft)]">
          Generating {maxCaseStudies} case stud{maxCaseStudies !== 1 ? 'ies' : 'y'}. Takes 1-3 minutes.
        </p>
        <GlassButton
          variant="primary"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={cn(
            'px-6 py-3 text-[14px] font-medium rounded-xl',
            'bg-gradient-to-r from-[var(--badge-green-text)]/20 to-[var(--link)]/15 hover:from-[var(--badge-green-text)]/30 hover:to-[var(--link)]/25',
            !canSubmit && 'opacity-40 cursor-not-allowed',
          )}
        >
          <BookOpen size={15} className="mr-2" />
          Generate Case Studies
        </GlassButton>
      </div>
    </div>
  );
}
