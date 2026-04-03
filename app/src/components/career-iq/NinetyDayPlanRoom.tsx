import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { ContextLoadedBadge } from '@/components/career-iq/ContextLoadedBadge';
import {
  Map,
  Building2,
  Briefcase,
  Users,
  Target,
  Loader2,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Check,
  Sparkles,
  Calendar,
  UserCheck,
  RotateCcw,
  Trophy,
  MessageSquare,
  ChevronRight,
  Zap,
  Flag,
  ShieldAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useNinetyDayPlan } from '@/hooks/useNinetyDayPlan';
import { usePriorResult } from '@/hooks/usePriorResult';
import { markdownToHtml } from '@/lib/markdown';
import { useLatestMasterResumeText } from './useLatestMasterResumeText';

// --- Phase configuration ---

const PHASES = [
  {
    days: 'Days 1–30',
    label: 'Listen & Learn',
    theme: 'Absorb context and build relationships',
    color: 'text-[var(--link)]',
    bg: 'bg-[var(--link)]/10',
    border: 'border-[var(--link)]/15',
    accent: 'var(--link)',
    dot: 'bg-[var(--link)]',
  },
  {
    days: 'Days 31–60',
    label: 'Contribute & Build',
    theme: 'Execute quick wins and build confidence',
    color: 'text-[var(--badge-green-text)]',
    bg: 'bg-[var(--badge-green-text)]/10',
    border: 'border-[var(--badge-green-text)]/15',
    accent: 'var(--badge-green-text)',
    dot: 'bg-[var(--badge-green-text)]',
  },
  {
    days: 'Days 61–90',
    label: 'Lead & Deliver',
    theme: 'Drive strategy and deliver results',
    color: 'text-[var(--badge-amber-text)]',
    bg: 'bg-[var(--badge-amber-text)]/10',
    border: 'border-[var(--badge-amber-text)]/15',
    accent: 'var(--badge-amber-text)',
    dot: 'bg-[var(--badge-amber-text)]',
  },
];

// --- Progress tracker ---

function PhaseProgressTracker({ activePhase }: { activePhase?: number }) {
  return (
    <div className="relative flex items-center justify-between px-2 py-4">
      {/* Connecting line */}
      <div className="absolute left-8 right-8 top-1/2 -translate-y-1/2 h-px bg-[var(--accent-muted)]" />

      {PHASES.map((phase, i) => (
        <div key={phase.label} className="relative flex flex-col items-center gap-2 z-10">
          <div
            className={cn(
              'h-8 w-8 rounded-full border-2 flex items-center justify-center text-[13px] font-bold transition-all duration-500',
              activePhase !== undefined && i <= activePhase
                ? `${phase.bg} ${phase.border} ${phase.color}`
                : 'bg-[var(--accent-muted)] border-[var(--line-soft)] text-[var(--text-soft)]',
            )}
          >
            {i + 1}
          </div>
          <div className="text-center">
            <div className={cn('text-[12px] font-semibold', phase.color)}>{phase.days}</div>
            <div className="text-[12px] text-[var(--text-soft)] mt-0.5">{phase.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Score ring ---

function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (score / 100) * circumference;
  const color = score >= 80 ? 'var(--badge-green-text)' : score >= 60 ? 'var(--badge-amber-text)' : 'var(--badge-red-text)';
  const label = score >= 80 ? 'Strong' : score >= 60 ? 'Solid' : 'Developing';

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={6}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - filled}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <div className="flex flex-col items-center -mt-[68px] mb-8">
        <span className="text-[20px] font-bold text-[var(--text-strong)]">{score}</span>
        <span className="text-[12px] text-[var(--text-soft)] uppercase tracking-wider">{label}</span>
      </div>
    </div>
  );
}

// --- Activity feed ---

function ActivityFeed({
  activityMessages,
  currentStage,
  targetRole,
  targetCompany,
}: {
  activityMessages: { id: string; message: string; stage?: string; timestamp: number }[];
  currentStage: string | null;
  targetRole: string;
  targetCompany: string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activityMessages.length]);

  const stageLabel =
    currentStage === 'research'
      ? 'Researching the role and company'
      : currentStage === 'planning'
      ? 'Building your 90-day plan'
      : currentStage === 'stakeholders'
      ? 'Mapping key stakeholders'
      : currentStage
      ? currentStage
      : 'Starting...';

  const displayName =
    targetRole && targetCompany
      ? `${targetRole} at ${targetCompany}`
      : targetRole || targetCompany || 'your new role';

  return (
    <GlassCard className="p-8 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-72 h-72 rounded-full bg-[var(--link)]/[0.04] blur-3xl pointer-events-none" />

      <div className="flex items-center gap-4 mb-8">
        <div className="relative">
          <div className="rounded-xl bg-[var(--link)]/10 p-3">
            <Map size={20} className="text-[var(--link)]" />
          </div>
          <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-[var(--badge-green-text)]/20 border-2 border-[var(--badge-green-text)]/40 flex items-center justify-center">
            <Loader2 size={8} className="text-[var(--badge-green-text)] animate-spin" />
          </div>
        </div>
        <div>
          <h3 className="text-[17px] font-semibold text-[var(--text-strong)]">Building your 90-day plan</h3>
          <p className="text-[13px] text-[var(--text-soft)] mt-0.5">
            {stageLabel} — {displayName}
          </p>
        </div>
      </div>

      {/* Phase progress */}
      <PhaseProgressTracker />

      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 mt-4">
        {activityMessages.length === 0 ? (
          <div className="text-center py-10">
            <Loader2 size={24} className="text-[var(--text-soft)] mx-auto mb-3 animate-spin" />
            <p className="text-[13px] text-[var(--text-soft)]">Connecting to pipeline...</p>
          </div>
        ) : (
          activityMessages.map((msg, i) => {
            const opacity = Math.max(0.3, 1 - (activityMessages.length - 1 - i) * 0.08);
            return (
              <div key={msg.id} className="flex items-start gap-3 py-1.5" style={{ opacity }}>
                <div className="h-1.5 w-1.5 rounded-full bg-[var(--link)]/50 mt-2 flex-shrink-0" />
                <span className="text-[13px] text-[var(--text-soft)] leading-relaxed">{msg.message}</span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </GlassCard>
  );
}

// --- Phase card ---

function PhaseCard({ phase, index }: { phase: (typeof PHASES)[number]; index: number }) {
  return (
    <div
      className={cn(
        'rounded-xl border px-5 py-4',
        phase.bg,
        phase.border,
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className={cn('h-5 w-5 rounded-full flex items-center justify-center text-[12px] font-bold', phase.bg, phase.border, 'border')}
          style={{ color: phase.accent }}
        >
          {index + 1}
        </div>
        <span className={cn('text-[12px] font-semibold', phase.color)}>{phase.days}</span>
      </div>
      <div className="text-[13px] font-semibold text-[var(--text-strong)]">{phase.label}</div>
      <div className="text-[13px] text-[var(--text-soft)] mt-0.5 leading-relaxed">{phase.theme}</div>
    </div>
  );
}

// --- Report view ---

function ReportView({
  report,
  qualityScore,
  targetRole,
  targetCompany,
  onReset,
}: {
  report: string;
  qualityScore: number | null;
  targetRole: string;
  targetCompany: string;
  onReset: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [report]);

  const scoreColor =
    qualityScore !== null && qualityScore >= 80
      ? 'text-[var(--badge-green-text)] bg-[var(--badge-green-text)]/10 border-[var(--badge-green-text)]/20'
      : qualityScore !== null && qualityScore >= 60
      ? 'text-[var(--badge-amber-text)] bg-[var(--badge-amber-text)]/10 border-[var(--badge-amber-text)]/20'
      : 'text-[var(--badge-red-text)] bg-[var(--badge-red-text)]/10 border-[var(--badge-red-text)]/20';

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1.5 text-[13px] text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors"
        >
          <ArrowLeft size={14} />
          Draft another plan
        </button>
        <div className="flex-1" />
        {qualityScore !== null && (
          <div className={cn('text-[12px] font-semibold px-3 py-1 rounded-full border', scoreColor)}>
            Plan Score {qualityScore}%
          </div>
        )}
        <GlassButton variant="ghost" onClick={handleCopy} size="sm">
          {copied ? (
            <Check size={13} className="mr-1.5 text-[var(--badge-green-text)]" />
          ) : (
            <Copy size={13} className="mr-1.5" />
          )}
          {copied ? 'Copied!' : 'Copy Plan'}
        </GlassButton>
      </div>

      {/* Header card */}
      <GlassCard className="p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-[var(--link)]/[0.04] blur-3xl pointer-events-none" />
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-[var(--link)]/10 p-3 flex-shrink-0">
            <Map size={20} className="text-[var(--link)]" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[18px] font-semibold text-[var(--text-strong)]">30-60-90 Plan</h2>
            <p className="text-[13px] text-[var(--text-soft)] mt-0.5">
              {targetRole}
              {targetCompany ? ` — ${targetCompany}` : ''}
            </p>
          </div>
          {qualityScore !== null && (
            <div className="flex-shrink-0">
              <ScoreRing score={qualityScore} size={72} />
            </div>
          )}
        </div>
      </GlassCard>

      {/* Phase timeline */}
      <div className="space-y-2">
        <h3 className="text-[13px] font-semibold text-[var(--text-soft)] uppercase tracking-wider px-1">
          Three-Phase Roadmap
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {PHASES.map((phase, i) => (
            <PhaseCard key={phase.label} phase={phase} index={i} />
          ))}
        </div>
        <PhaseProgressTracker activePhase={2} />
      </div>

      {/* Quick wins callout */}
      <div className="rounded-xl border border-[var(--badge-amber-text)]/15 bg-[var(--badge-amber-text)]/[0.03] px-5 py-4">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={14} className="text-[var(--badge-amber-text)]" />
          <span className="text-[12px] font-semibold text-[var(--badge-amber-text)]">First-Week Priority</span>
        </div>
        <p className="text-[12px] text-[var(--text-soft)] leading-relaxed">
          Your plan includes specific quick wins designed to demonstrate competence in the first 30 days — without reorganizing the team or pushing premature change. Listen first, earn trust, then lead.
        </p>
      </div>

      {/* Key sections legend */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { icon: Users, label: 'Stakeholder Map', desc: 'Who to meet, in what order', color: 'text-[var(--link)]', bg: 'bg-[var(--link)]/10' },
          { icon: Trophy, label: 'Quick Wins', desc: 'Early impact opportunities', color: 'text-[var(--badge-green-text)]', bg: 'bg-[var(--badge-green-text)]/10' },
          { icon: Flag, label: 'Measurable Milestones', desc: 'Observable success markers', color: 'text-[var(--badge-amber-text)]', bg: 'bg-[var(--badge-amber-text)]/10' },
          { icon: MessageSquare, label: 'Manager Talking Points', desc: 'How to frame the plan upward', color: 'text-[var(--link)]', bg: 'bg-[var(--link)]/10' },
        ].map(({ icon: Icon, label, desc, color, bg }) => (
          <div key={label} className="flex items-start gap-2.5 rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-3">
            <div className={cn('rounded-lg p-1.5 flex-shrink-0', bg)}>
              <Icon size={12} className={color} />
            </div>
            <div>
              <div className="text-[13px] font-semibold text-[var(--text-muted)]">{label}</div>
              <div className="text-[12px] text-[var(--text-soft)] mt-0.5">{desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Full plan prose */}
      <GlassCard className="p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 rounded-full bg-[var(--link)]/[0.03] blur-3xl pointer-events-none" />

        <div className="flex items-center gap-3 mb-6">
          <ChevronRight size={14} className="text-[var(--link)]/60" />
          <span className="text-[12px] font-semibold text-[var(--text-soft)] uppercase tracking-wider">Full Strategic Plan</span>
        </div>

        <div
          className="prose prose-invert prose-sm max-w-none
            prose-headings:text-[var(--text-strong)] prose-headings:font-semibold
            prose-h1:text-[18px] prose-h1:border-b prose-h1:border-[var(--line-soft)] prose-h1:pb-3 prose-h1:mb-5
            prose-h2:text-[15px] prose-h2:mt-8 prose-h2:mb-3 prose-h2:text-[var(--link)]/80
            prose-h3:text-[13px] prose-h3:mt-5 prose-h3:mb-2 prose-h3:text-[var(--text-muted)]
            prose-p:text-[var(--text-soft)] prose-p:text-[13px] prose-p:leading-relaxed
            prose-li:text-[var(--text-soft)] prose-li:text-[13px] prose-li:leading-relaxed
            prose-strong:text-[var(--text-muted)]
            prose-em:text-[var(--text-soft)]
            prose-blockquote:border-[var(--link)]/30 prose-blockquote:text-[var(--text-soft)] prose-blockquote:italic
            prose-hr:border-[var(--line-soft)]
            prose-table:text-[12px] prose-table:text-[var(--text-soft)]
            prose-th:text-[var(--text-soft)] prose-th:font-semibold prose-th:border-[var(--line-soft)]
            prose-td:border-[var(--line-soft)]"
          dangerouslySetInnerHTML={{ __html: markdownToHtml(report) }}
        />
      </GlassCard>

      {/* Guardrail reminder */}
      <div className="rounded-xl border border-[var(--badge-red-text)]/15 bg-[var(--badge-red-text)]/[0.03] px-5 py-4">
        <div className="flex items-start gap-3">
          <ShieldAlert size={14} className="text-[var(--badge-red-text)] mt-0.5 flex-shrink-0" />
          <p className="text-[12px] text-[var(--text-soft)] leading-relaxed">
            <span className="text-[var(--badge-red-text)]/80 font-semibold">Guardrail: </span>
            Avoid reorganizing the team in the first 30 days. This is the single most common mistake new executives make. Build trust and earn the right to drive organizational change first.
          </p>
        </div>
      </div>
    </div>
  );
}

// --- Field label component ---

function FieldLabel({
  label,
  required,
  optional,
  htmlFor,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-[13px] font-semibold text-[var(--text-soft)] uppercase tracking-wider mb-1.5"
    >
      {label}
      {required && <span className="text-[var(--link)]/60 ml-1">*</span>}
      {optional && (
        <span className="text-[var(--text-soft)] normal-case font-normal ml-1">(optional)</span>
      )}
    </label>
  );
}

const INPUT_CLASS =
  'w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 text-[13px] text-[var(--text-strong)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:ring-2 focus:ring-[var(--link)]/20 focus:border-[var(--link)]/30 transition-colors';

// --- Main component ---

interface NinetyDayPlanRoomProps {
  initialTargetRole?: string;
  initialTargetCompany?: string;
  initialJobApplicationId?: string;
  initialSessionId?: string;
}

export function NinetyDayPlanRoom({
  initialTargetRole,
  initialTargetCompany,
  initialJobApplicationId,
  initialSessionId,
}: NinetyDayPlanRoomProps = {}) {
  const [targetRole, setTargetRole] = useState(initialTargetRole ?? '');
  const [targetCompany, setTargetCompany] = useState(initialTargetCompany ?? '');
  const [targetIndustry, setTargetIndustry] = useState('');
  const [reportingTo, setReportingTo] = useState('');
  const [teamSize, setTeamSize] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const resumeRef = useRef<string>('');
  const [manualResumeText, setManualResumeText] = useState('');
  const { resumeText: loadedResumeText, loading: loadingResume } = useLatestMasterResumeText();

  const {
    status,
    report,
    qualityScore,
    activityMessages,
    error,
    currentStage,
    stakeholderReviewData,
    startPipeline,
    respondToGate,
    reset,
  } = useNinetyDayPlan();

  const isPipelineActive = status === 'connecting' || status === 'running';
  const { priorResult, loading: priorLoading, clearPrior } = usePriorResult<{
    report_markdown?: string;
    quality_score?: number;
  }>({
    productSlug: 'ninety-day-plan',
    skip: isPipelineActive,
    sessionId: initialSessionId,
  });

  useEffect(() => {
    if (loadedResumeText) {
      resumeRef.current = loadedResumeText;
    }
  }, [loadedResumeText]);

  useEffect(() => {
    if (initialTargetRole) {
      setTargetRole(initialTargetRole);
    }
    if (initialTargetCompany) {
      setTargetCompany(initialTargetCompany);
    }
  }, [initialTargetCompany, initialTargetRole]);

  const handleSubmit = useCallback(async () => {
    setFormError(null);

    if (!targetRole.trim()) {
      setFormError('Role title is required.');
      return;
    }
    if (!targetCompany.trim()) {
      setFormError('Company name is required.');
      return;
    }
    const resolvedResume = resumeRef.current || manualResumeText.trim();
    if (!resolvedResume) {
      setFormError(
        'Resume text is required. Paste your resume below or complete the Resume Strategist to auto-load it.',
      );
      return;
    }

    await startPipeline({
      resumeText: resolvedResume,
      targetRole: targetRole.trim(),
      targetCompany: targetCompany.trim(),
      targetIndustry: targetIndustry.trim() || undefined,
      reportingTo: reportingTo.trim() || undefined,
      teamSize: teamSize.trim() || undefined,
      jobApplicationId: initialJobApplicationId,
    });
  }, [initialJobApplicationId, targetRole, targetCompany, targetIndustry, reportingTo, teamSize, manualResumeText, startPipeline]);

  const handleReset = useCallback(() => {
    reset();
    setFormError(null);
    setTargetRole(initialTargetRole ?? '');
    setTargetCompany(initialTargetCompany ?? '');
  }, [initialTargetCompany, initialTargetRole, reset]);

  // Complete → report
  if (status === 'complete' && report) {
    return (
      <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
        <ReportView
          report={report}
          qualityScore={qualityScore}
          targetRole={targetRole}
          targetCompany={targetCompany}
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
          targetRole={targetRole}
          targetCompany={targetCompany}
          onReset={() => {
            clearPrior();
            handleReset();
          }}
        />
      </div>
    );
  }

  // Stakeholder review gate — pipeline paused awaiting user confirmation
  if (status === 'stakeholder_review') {
    const stakeholderCount = Array.isArray(stakeholderReviewData?.stakeholder_map)
      ? stakeholderReviewData.stakeholder_map.length
      : 0;
    const quickWinCount = Array.isArray(stakeholderReviewData?.quick_wins)
      ? stakeholderReviewData.quick_wins.length
      : 0;
    return (
      <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-strong)]">30-60-90 Plan</h1>
          <p className="text-[13px] text-[var(--text-soft)] mt-1">
            Stakeholder map ready to review
          </p>
        </div>
        <GlassCard className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle2 size={18} className="text-[var(--badge-green-text)]" />
            <h3 className="text-[15px] font-semibold text-[var(--text-strong)]">Research Ready</h3>
          </div>
          <p className="text-[13px] text-[var(--text-soft)] mb-4 leading-relaxed">
            We mapped{' '}
            <span className="text-[var(--text-strong)] font-medium">{stakeholderCount} stakeholder{stakeholderCount !== 1 ? 's' : ''}</span>{' '}
            and identified{' '}
            <span className="text-[var(--text-strong)] font-medium">{quickWinCount} quick win{quickWinCount !== 1 ? 's' : ''}</span>{' '}
            for your first 30 days. Review it, then draft the full 30-60-90 plan.
          </p>
          <div className="flex gap-3">
            <GlassButton
              variant="primary"
              onClick={() => void respondToGate('stakeholder_review', true)}
              className="text-[13px] px-5 py-2.5"
            >
              <Map size={14} className="mr-1.5" />
              Draft My 30-60-90 Plan
            </GlassButton>
            <GlassButton variant="ghost" onClick={handleReset} size="sm">
              <ArrowLeft size={13} className="mr-1.5" />
              Cancel
            </GlassButton>
          </div>
        </GlassCard>
      </div>
    );
  }

  // Running
  if (status === 'connecting' || status === 'running') {
    return (
      <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-strong)]">30-60-90 Plan</h1>
          <p className="text-[13px] text-[var(--text-soft)] mt-1">
            Building your stakeholder map and phased success plan
          </p>
        </div>
        <ActivityFeed
          activityMessages={activityMessages}
          currentStage={currentStage}
          targetRole={targetRole}
          targetCompany={targetCompany}
        />
        <div className="flex justify-start">
          <button
            type="button"
            onClick={handleReset}
            className="text-[12px] text-[var(--text-soft)] hover:text-[var(--text-soft)] transition-colors"
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
            <AlertCircle size={18} className="text-[var(--badge-red-text)]" />
            <span className="text-[13px] text-[var(--badge-red-text)]">{error}</span>
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
        <div className="rounded-xl bg-[var(--link)]/10 p-2.5 self-start shrink-0">
          <Map size={20} className="text-[var(--link)]" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-strong)]">30-60-90 Plan</h1>
          <p className="text-[13px] text-[var(--text-soft)] leading-relaxed mt-1">
            Draft a role-specific 30-60-90 plan with stakeholder map, quick wins, and phased milestones built around your story, not a generic template.
          </p>
        </div>
      </div>
      <ContextLoadedBadge
        contextTypes={['positioning_strategy', 'emotional_baseline']}
        className="mb-3"
      />

      {/* Prior result */}
      {priorLoading && (
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 text-[12px] text-[var(--text-soft)]">
            <Loader2 size={12} className="animate-spin" />
            Loading saved draft...
          </div>
        </GlassCard>
      )}
      {priorResult && !isPipelineActive && (
        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-[var(--text-muted)]">
              {initialSessionId ? 'Saved 30-60-90 plan for this job' : 'Earlier draft'}
            </h3>
            <button
              type="button"
              onClick={clearPrior}
              className="flex items-center gap-1.5 text-xs text-[var(--text-soft)] hover:text-[var(--text-strong)] transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Start New Draft
            </button>
          </div>
          <div
            className="prose prose-invert prose-sm max-w-none text-[var(--text-strong)] max-h-96 overflow-y-auto"
            dangerouslySetInnerHTML={{ __html: markdownToHtml(priorResult.report_markdown ?? '') }}
          />
        </GlassCard>
      )}

      {/* Three-phase overview */}
      <div className="space-y-3">
        <h2 className="text-[13px] font-semibold text-[var(--text-soft)] uppercase tracking-wider">
          Your plan will follow three phases
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {PHASES.map((phase, i) => (
            <PhaseCard key={phase.label} phase={phase} index={i} />
          ))}
        </div>
      </div>

      {/* Resume status */}
      <div
        className={cn(
          'flex items-center gap-2 text-[12px]',
          loadingResume
            ? 'text-[var(--text-soft)]'
            : loadedResumeText
            ? 'text-[var(--badge-green-text)]/70'
            : 'text-[var(--badge-amber-text)]/70',
        )}
      >
        {loadingResume ? (
          <>
            <Loader2 size={12} className="animate-spin" /> Loading resume from your profile...
          </>
        ) : loadedResumeText ? (
          <>
            <CheckCircle2 size={12} /> Resume loaded — plan will be tailored to your background
          </>
        ) : (
          <>
            <AlertCircle size={12} /> No resume found — paste below or complete the Resume
            Strategist to auto-load
          </>
        )}
      </div>

      {/* Resume fallback textarea */}
      {!loadingResume && !loadedResumeText && (
        <textarea
          value={manualResumeText}
          onChange={(e) => setManualResumeText(e.target.value)}
          placeholder="Paste your resume text here..."
          rows={5}
          className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 text-[13px] text-[var(--text-strong)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:ring-2 focus:ring-[var(--link)]/20 focus:border-[var(--link)]/30 transition-colors resize-none leading-relaxed"
        />
      )}

      {/* Section 1: Role details */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Briefcase size={16} className="text-[var(--link)]" />
          <h2 className="text-[15px] font-semibold text-[var(--text-strong)]">Role Details</h2>
          <div className="flex-1 h-px bg-[var(--accent-muted)]" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel label="Role Title" required htmlFor="ndp-target-role" />
            <input
              id="ndp-target-role"
              type="text"
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              placeholder="e.g. VP of Supply Chain Operations"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <FieldLabel label="Company" required htmlFor="ndp-target-company" />
            <input
              id="ndp-target-company"
              type="text"
              value={targetCompany}
              onChange={(e) => setTargetCompany(e.target.value)}
              placeholder="e.g. Medtronic"
              className={INPUT_CLASS}
            />
          </div>
        </div>

        <div>
          <FieldLabel label="Target Industry" optional htmlFor="ndp-target-industry" />
          <input
            id="ndp-target-industry"
            type="text"
            value={targetIndustry}
            onChange={(e) => setTargetIndustry(e.target.value)}
            placeholder="e.g. Medical Devices / Healthcare"
            className={INPUT_CLASS}
          />
        </div>
      </div>

      {/* Section 2: Reporting structure */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <UserCheck size={16} className="text-[var(--badge-green-text)]" />
          <h2 className="text-[15px] font-semibold text-[var(--text-strong)]">Reporting Structure</h2>
          <div className="flex-1 h-px bg-[var(--accent-muted)]" />
          <span className="text-[13px] text-[var(--text-soft)]">optional — improves stakeholder map</span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel label="Reporting To" optional htmlFor="ndp-reporting-to" />
            <input
              id="ndp-reporting-to"
              type="text"
              value={reportingTo}
              onChange={(e) => setReportingTo(e.target.value)}
              placeholder="e.g. Chief Operations Officer"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <FieldLabel label="Team Size" optional htmlFor="ndp-team-size" />
            <input
              id="ndp-team-size"
              type="text"
              value={teamSize}
              onChange={(e) => setTeamSize(e.target.value)}
              placeholder="e.g. 25 direct / 200 org"
              className={INPUT_CLASS}
            />
          </div>
        </div>
      </div>

      {/* What you'll get */}
      <div className="rounded-2xl border border-[var(--line-soft)] bg-gradient-to-br from-white/[0.03] to-white/[0.01] px-5 py-4">
        <p className="text-[13px] font-semibold text-[var(--text-soft)] uppercase tracking-wider mb-3">
          What you will get
        </p>
        <div className="grid grid-cols-2 gap-2">
          {[
            {
              icon: Users,
              text: 'Stakeholder map with engagement priorities and talking points',
              color: 'text-[var(--link)]',
            },
            {
              icon: Target,
              text: 'Quick wins that build credibility without overstepping',
              color: 'text-[var(--badge-green-text)]',
            },
            {
              icon: Calendar,
              text: 'Three-phase milestone roadmap with measurable outcomes',
              color: 'text-[var(--link)]',
            },
            {
              icon: Building2,
              text: 'Manager talking points to frame your plan upward',
              color: 'text-[var(--badge-amber-text)]',
            },
          ].map(({ icon: Icon, text, color }) => (
            <div key={text} className="flex items-start gap-2">
              <Icon size={13} className={cn(color, 'mt-0.5 flex-shrink-0')} />
              <span className="text-[12px] text-[var(--text-soft)] leading-relaxed">{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Error */}
      {formError && (
        <div className="flex items-center gap-2 text-[13px] text-[var(--badge-red-text)] bg-[var(--badge-red-text)]/5 border border-[var(--badge-red-text)]/15 rounded-xl px-4 py-3">
          <AlertCircle size={14} className="flex-shrink-0" />
          {formError}
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-[var(--text-soft)]">
          Plan is role-specific — leverages your positioning narrative, not a generic template.
        </p>
        <GlassButton
          variant="primary"
          onClick={handleSubmit}
          className="text-[14px] px-6 py-3 gap-2"
        >
          <Sparkles size={15} />
          Draft Plan
        </GlassButton>
      </div>
    </div>
  );
}
