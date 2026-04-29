/**
 * YourProfilePage — renders at the "Benchmark Profile" workspace destination.
 *
 * Phase 3 — three explicit sections matching the product model:
 *   Section 1 — Positioning
 *     Why-Me Story today. Future surfaces: Why-Not-Me, target industries /
 *     ideal companies / target roles.
 *   Section 2 — Career Proof
 *     Resume summary (ResumeSection) + Story Bank (STAR+R stories reused
 *     across Interview Prep). Future surface: Signature Accomplishments as
 *     a first-class managed list.
 *   Section 3 — Benchmark LinkedIn Brand
 *     LinkedIn headline + About storage (LinkedInSection). Future surfaces:
 *     five-second LinkedIn test audit, blogging / carousels.
 *
 * Each section's layout + education strip renders directly in this file's
 * return tree. Sub-components (ResumeSection, LinkedInSection,
 * StoryBankSection) are inline helpers below.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Linkedin,
  Loader2,
  MessageSquare,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { cn } from '@/lib/utils';
import { WhyMeStoryCard } from './WhyMeStoryCard';
import { WhyMeEngine } from './WhyMeEngine';
import { useWhyMeStory } from './useWhyMeStory';
import { useLinkedInProfile } from '@/hooks/useLinkedInProfile';
import { useStoryBank } from '@/hooks/useStoryBank';
import type { InterviewStory, StoryBankRow } from '@/hooks/useStoryBank';
import type { MasterResume } from '@/types/resume';
import type {
  BenchmarkProfileDraftItem,
  BenchmarkProfileDiscoveryQuestion,
  BenchmarkProfileReviewStatus,
  BenchmarkProfileV1,
  CareerProfileV2,
} from '@/types/career-profile';

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  label,
  title,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="rounded-lg bg-[var(--link)]/12 p-2">
        <Icon size={16} className="text-[var(--link)]" />
      </div>
      <div>
        <div className="text-[13px] font-medium uppercase tracking-widest text-[var(--link)]">
          {label}
        </div>
        <h2 className="mt-0.5 text-sm font-semibold text-[var(--text-strong)]">{title}</h2>
      </div>
    </div>
  );
}

function labelFromToken(token: string) {
  return token
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function ConfidencePill({ value }: { value: BenchmarkProfileDraftItem['confidence'] }) {
  const className = value === 'high_confidence'
    ? 'border-[var(--badge-green-text)]/20 bg-[var(--badge-green-text)]/[0.07] text-[var(--badge-green-text)]'
    : value === 'good_inference'
      ? 'border-[var(--link)]/20 bg-[var(--link)]/[0.07] text-[var(--link)]'
      : value === 'risky_claim'
        ? 'border-[var(--badge-red-text)]/20 bg-[var(--badge-red-text)]/[0.07] text-[var(--badge-red-text)]'
        : 'border-[var(--badge-amber-text)]/20 bg-[var(--badge-amber-text)]/[0.07] text-[var(--badge-amber-text)]';

  return (
    <span className={cn('rounded-md border px-2 py-0.5 text-[11px] font-semibold', className)}>
      {labelFromToken(value)}
    </span>
  );
}

function ReviewStatusPill({ value }: { value: BenchmarkProfileDraftItem['review_status'] }) {
  const className = value === 'approved'
    ? 'border-[var(--badge-green-text)]/20 bg-[var(--badge-green-text)]/[0.07] text-[var(--badge-green-text)]'
    : value === 'needs_evidence'
      ? 'border-[var(--badge-red-text)]/20 bg-[var(--badge-red-text)]/[0.07] text-[var(--badge-red-text)]'
      : 'border-[var(--line-soft)] bg-[var(--accent-muted)] text-[var(--text-soft)]';

  return (
    <span className={cn('rounded-md border px-2 py-0.5 text-[11px] font-semibold', className)}>
      {labelFromToken(value)}
    </span>
  );
}

function BenchmarkItemCard({
  item,
  onUpdate,
}: {
  item: BenchmarkProfileDraftItem;
  onUpdate?: (itemId: string, changes: { statement?: string; review_status?: BenchmarkProfileReviewStatus }) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draftStatement, setDraftStatement] = useState(item.statement);
  const [saving, setSaving] = useState<BenchmarkProfileReviewStatus | 'statement' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraftStatement(item.statement);
  }, [item.statement]);

  const handleStatus = async (reviewStatus: BenchmarkProfileReviewStatus) => {
    if (!onUpdate || saving) return;
    setSaving(reviewStatus);
    setError(null);
    const ok = await onUpdate(item.id, { review_status: reviewStatus });
    setSaving(null);
    if (!ok) setError('Could not save review status.');
  };

  const handleSaveStatement = async () => {
    if (!onUpdate || saving) return;
    const trimmed = draftStatement.trim();
    if (!trimmed) {
      setError('Statement cannot be empty.');
      return;
    }
    setSaving('statement');
    setError(null);
    const ok = await onUpdate(item.id, {
      statement: trimmed,
      review_status: item.review_status === 'approved' ? 'draft' : item.review_status,
    });
    setSaving(null);
    if (ok) {
      setEditing(false);
    } else {
      setError('Could not save draft language.');
    }
  };

  return (
    <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[13px] font-semibold text-[var(--text-strong)]">{item.label}</p>
        <ConfidencePill value={item.confidence} />
        <ReviewStatusPill value={item.review_status} />
      </div>
      {editing ? (
        <textarea
          value={draftStatement}
          onChange={(event) => setDraftStatement(event.target.value)}
          rows={5}
          className={cn(
            'mt-3 w-full resize-y rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2.5',
            'text-sm leading-relaxed text-[var(--text-strong)] placeholder:text-[var(--text-soft)]',
            'focus:border-[var(--link)]/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/30',
          )}
        />
      ) : (
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{item.statement}</p>
      )}
      {item.evidence.length > 0 && (
        <p className="mt-2 text-[12px] leading-relaxed text-[var(--text-soft)]">
          Evidence: {item.evidence.slice(0, 2).join(' · ')}
        </p>
      )}
      {item.used_by.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.used_by.slice(0, 5).map((tool) => (
            <span
              key={tool}
              className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-1)] px-2 py-0.5 text-[11px] text-[var(--text-soft)]"
            >
              {labelFromToken(tool)}
            </span>
          ))}
        </div>
      )}
      {onUpdate && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--line-soft)] pt-3">
          {editing ? (
            <>
              <button
                type="button"
                onClick={() => void handleSaveStatement()}
                disabled={Boolean(saving)}
                className="rounded-md bg-[var(--link)] px-3 py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {saving === 'statement' ? 'Saving...' : 'Save draft'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setDraftStatement(item.statement);
                  setError(null);
                }}
                disabled={Boolean(saving)}
                className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-strong)] disabled:opacity-50"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void handleStatus('approved')}
                disabled={Boolean(saving) || item.review_status === 'approved'}
                className="rounded-md border border-[var(--badge-green-text)]/25 bg-[var(--badge-green-text)]/[0.08] px-3 py-1.5 text-[12px] font-semibold text-[var(--badge-green-text)] transition-opacity hover:opacity-85 disabled:opacity-50"
              >
                {saving === 'approved' ? 'Saving...' : 'Approve'}
              </button>
              <button
                type="button"
                onClick={() => void handleStatus('needs_evidence')}
                disabled={Boolean(saving) || item.review_status === 'needs_evidence'}
                className="rounded-md border border-[var(--badge-amber-text)]/25 bg-[var(--badge-amber-text)]/[0.08] px-3 py-1.5 text-[12px] font-semibold text-[var(--badge-amber-text)] transition-opacity hover:opacity-85 disabled:opacity-50"
              >
                {saving === 'needs_evidence' ? 'Saving...' : 'Needs evidence'}
              </button>
              <button
                type="button"
                onClick={() => setEditing(true)}
                disabled={Boolean(saving)}
                className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-strong)] disabled:opacity-50"
              >
                Edit
              </button>
            </>
          )}
        </div>
      )}
      {error && (
        <p className="mt-2 text-[12px] text-[var(--badge-red-text)]">{error}</p>
      )}
    </div>
  );
}

function DiscoveryQuestionCard({
  question,
  onAnswer,
}: {
  question: BenchmarkProfileDiscoveryQuestion;
  onAnswer?: (questionId: string, answer: string) => Promise<boolean>;
}) {
  const [answer, setAnswer] = useState(question.answer ?? question.recommended_answer ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAnswer(question.answer ?? question.recommended_answer ?? '');
  }, [question.answer, question.recommended_answer]);

  const trimmed = answer.trim();
  const existingAnswer = question.answer?.trim() ?? '';
  const canSave = Boolean(onAnswer) && trimmed.length > 0 && trimmed !== existingAnswer && !saving;

  const handleSave = async () => {
    if (!onAnswer || !canSave) return;
    setSaving(true);
    setError(null);
    const ok = await onAnswer(question.id, trimmed);
    setSaving(false);
    if (!ok) {
      setError('Could not save this answer.');
    }
  };

  return (
    <div className="border-t border-[var(--line-soft)] pt-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold leading-relaxed text-[var(--text-strong)]">{question.question}</p>
        {existingAnswer && (
          <span className="rounded-md border border-[var(--badge-green-text)]/20 bg-[var(--badge-green-text)]/[0.07] px-2 py-0.5 text-[11px] font-semibold text-[var(--badge-green-text)]">
            Answered
          </span>
        )}
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-soft)]">{question.why_it_matters}</p>
      {question.evidence_found.length > 0 && (
        <p className="mt-2 text-[12px] leading-relaxed text-[var(--text-soft)]">
          Evidence we found: {question.evidence_found.slice(0, 2).join(' · ')}
        </p>
      )}
      <textarea
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        rows={3}
        placeholder="Answer in your own words. Specific tools, scope, metrics, and examples help most."
        className={cn(
          'mt-3 w-full resize-y rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2.5',
          'text-sm leading-relaxed text-[var(--text-strong)] placeholder:text-[var(--text-soft)]',
          'focus:border-[var(--link)]/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/30',
        )}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!canSave}
          className="rounded-md bg-[var(--link)] px-3 py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving...' : existingAnswer ? 'Update answer' : 'Save answer'}
        </button>
        {question.used_by.slice(0, 5).map((tool) => (
          <span
            key={tool}
            className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-1)] px-2 py-0.5 text-[11px] text-[var(--text-soft)]"
          >
            {labelFromToken(tool)}
          </span>
        ))}
      </div>
      {error && (
        <p className="mt-2 text-[12px] text-[var(--badge-red-text)]">{error}</p>
      )}
    </div>
  );
}

function BenchmarkProfileDraftPanel({
  benchmarkProfile,
  onUpdateItem,
  onAnswerQuestion,
}: {
  benchmarkProfile: BenchmarkProfileV1;
  onUpdateItem?: (itemId: string, changes: { statement?: string; review_status?: BenchmarkProfileReviewStatus }) => Promise<boolean>;
  onAnswerQuestion?: (questionId: string, answer: string) => Promise<boolean>;
}) {
  const primaryItems = [
    benchmarkProfile.identity.benchmark_headline,
    benchmarkProfile.identity.why_me_story,
  ];
  const supportingItems = [
    benchmarkProfile.identity.why_not_me,
    benchmarkProfile.linkedin_brand.five_second_verdict,
  ];

  const topProof = benchmarkProfile.proof.signature_accomplishments.slice(0, 3);
  const questions = benchmarkProfile.discovery_questions.slice(0, 4);
  const hasSupportingDetails = supportingItems.length > 0 || topProof.length > 0 || questions.length > 0;

  return (
    <GlassCard className="p-6">
      <div className="flex items-start justify-between gap-4">
        <SectionHeader icon={Sparkles} label="AI Draft" title="Benchmark Profile Draft" />
        <span className="rounded-md border border-[var(--link)]/20 bg-[var(--link)]/[0.07] px-2.5 py-1 text-[12px] font-semibold text-[var(--link)]">
          Ready for review
        </span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-[var(--text-soft)]">
        Confirm the headline and Why-Me first. Supporting proof is still available, but it stays out of the way until you want to inspect it.
      </p>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {primaryItems.map((item) => (
          <BenchmarkItemCard key={item.id} item={item} onUpdate={onUpdateItem} />
        ))}
      </div>

      {hasSupportingDetails && (
        <details className="group mt-5 rounded-[10px] border border-[var(--line-soft)] bg-[var(--surface-1)]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
            <span>
              <span className="block text-sm font-semibold text-[var(--text-strong)]">Review supporting details</span>
              <span className="mt-0.5 block text-xs text-[var(--text-soft)]">
                Why-not-me, LinkedIn five-second verdict, proof points, and discovery questions.
              </span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="flex flex-col gap-5 border-t border-[var(--line-soft)] p-4">
            {supportingItems.length > 0 && (
              <div className="grid gap-3 md:grid-cols-2">
                {supportingItems.map((item) => (
                  <BenchmarkItemCard key={item.id} item={item} onUpdate={onUpdateItem} />
                ))}
              </div>
            )}

            {topProof.length > 0 && (
              <div>
                <div className="mb-3 text-[12px] font-semibold uppercase tracking-widest text-[var(--text-soft)]">
                  Signature Proof
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  {topProof.map((item) => (
                    <BenchmarkItemCard key={item.id} item={item} onUpdate={onUpdateItem} />
                  ))}
                </div>
              </div>
            )}

            {questions.length > 0 && (
              <div className="rounded-lg border border-[var(--badge-amber-text)]/20 bg-[var(--badge-amber-text)]/[0.06] p-4">
                <div className="mb-2 flex items-center gap-2">
                  <AlertCircle size={14} className="text-[var(--badge-amber-text)]" />
                  <p className="text-[13px] font-semibold text-[var(--text-strong)]">
                    Pointed questions that would improve the foundation
                  </p>
                </div>
                <div className="space-y-3">
                  {questions.map((question) => (
                    <DiscoveryQuestionCard
                      key={question.id}
                      question={question}
                      onAnswer={onAnswerQuestion}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </details>
      )}
    </GlassCard>
  );
}

// ─── ResumeSection (Career Proof inner card) ─────────────────────────────────

interface ResumeSectionProps {
  onGetDefaultResume?: () => Promise<MasterResume | null>;
  onNavigateResume?: () => void;
  benchmarkProfile?: BenchmarkProfileV1 | null;
}

function ResumeSection({ onGetDefaultResume, onNavigateResume, benchmarkProfile = null }: ResumeSectionProps) {
  const navigate = useNavigate();
  const [resume, setResume] = useState<MasterResume | null>(null);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeError, setResumeError] = useState(false);
  const loadAttemptedRef = useRef(false);

  // Load default resume once on mount
  useEffect(() => {
    if (!onGetDefaultResume) return;
    if (loadAttemptedRef.current) { setResumeLoading(false); return; }
    loadAttemptedRef.current = true;
    let cancelled = false;
    setResumeLoading(true);

    // Timeout: if resume doesn't load in 10s, stop spinning and show empty state
    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        setResumeLoading(false);
        setResumeError(true);
      }
    }, 10_000);

    void onGetDefaultResume().then((r) => {
      clearTimeout(timeoutId);
      if (!cancelled) {
        setResume(r);
        setResumeLoading(false);
      }
    }).catch(() => {
      clearTimeout(timeoutId);
      if (!cancelled) {
        setResumeLoading(false);
        setResumeError(true);
      }
    });
    return () => { cancelled = true; clearTimeout(timeoutId); };
  }, [onGetDefaultResume]);

  if (resumeLoading) {
    return (
      <GlassCard className="p-6">
        <SectionHeader icon={FileText} label="Resume" title="Your Career Proof" />
        <div className="mt-4 flex items-center gap-2 text-sm text-[var(--text-soft)]">
          <Loader2 size={16} className="animate-spin text-[var(--link)]" />
          Loading your Career Proof...
        </div>
      </GlassCard>
    );
  }

  if (!resume) {
    const proofDrafts = benchmarkProfile?.proof.signature_accomplishments ?? [];
    return (
      <GlassCard className="p-6">
        <SectionHeader icon={FileText} label="Resume" title="Your Career Proof" />
        <p className="mt-3 text-sm leading-relaxed text-[var(--text-soft)]">
          Your Career Proof is the source material for every tool in the workspace. Upload it once
          and every application starts with full context.
        </p>
        <div className="mt-5 text-center py-6">
          {resumeError ? (
            <div className="text-sm text-[var(--text-soft)]">
              <p>We couldn't load your Career Proof. You may not have uploaded a source resume yet.</p>
              <button onClick={() => navigate('/workspace?room=resume')} className="mt-2 text-[var(--link)] hover:underline text-sm">
                Go to Tailor Resume →
              </button>
            </div>
          ) : proofDrafts.length > 0 ? (
            <div className="text-left">
              <p className="text-sm font-semibold text-[var(--text-strong)]">
                Benchmark proof draft is ready for review.
              </p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--text-soft)]">
                The profile setup created proof points from your source material. Confirming a comprehensive resume will make this stronger, but downstream tools already have draft evidence to work from.
              </p>
              <div className="mt-4 grid gap-2">
                {proofDrafts.slice(0, 3).map((item) => (
                  <div key={item.id} className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2">
                    <p className="text-[12px] font-semibold text-[var(--text-strong)]">{item.label}</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-soft)]">{item.statement}</p>
                  </div>
                ))}
              </div>
              <GlassButton onClick={() => navigate('/workspace?room=resume')} className="mt-4">
                Add or confirm Career Proof
              </GlassButton>
            </div>
          ) : (
            <>
              <p className="text-sm text-[var(--text-muted)] mb-3">
                No Career Proof yet.
              </p>
              <GlassButton onClick={() => navigate('/workspace?room=resume')}>
                Go to Tailor Resume
              </GlassButton>
            </>
          )}
        </div>
      </GlassCard>
    );
  }

  // Resume exists — compact summary view
  const experienceCount = resume.experience.length;
  const skillGroupCount = Object.keys(resume.skills).length;
  const summaryPreview = resume.summary
    ? resume.summary.slice(0, 200) + (resume.summary.length > 200 ? '…' : '')
    : '';

  return (
    <GlassCard className="p-6">
      <div className="flex items-start justify-between gap-4">
        <SectionHeader icon={FileText} label="Resume" title="Your Career Proof" />
        <div className="flex items-center gap-2 shrink-0">
          {onNavigateResume && (
            <GlassButton variant="ghost" size="sm" onClick={onNavigateResume}>
              <ExternalLink size={13} className="mr-1" />
              View Full Resume
            </GlassButton>
          )}
        </div>
      </div>

      {/* Summary preview */}
      {summaryPreview && (
        <div className="mt-3 rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4">
          <div className="text-[13px] font-medium uppercase tracking-widest text-[var(--text-soft)]">
            Summary
          </div>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
            {summaryPreview}
          </p>
        </div>
      )}

      {/* Stats row */}
      <div className="mt-3 flex flex-wrap gap-3">
        {experienceCount > 0 && (
          <div className="rounded-md border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2">
            <span className="text-[13px] text-[var(--text-muted)]">
              {experienceCount} experience{experienceCount !== 1 ? 's' : ''}
            </span>
          </div>
        )}
        {skillGroupCount > 0 && (
          <div className="rounded-md border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2">
            <span className="text-[13px] text-[var(--text-muted)]">
              {skillGroupCount} skill{skillGroupCount !== 1 ? ' groups' : ' group'}
            </span>
          </div>
        )}
        {resume.evidence_items.length > 0 && (
          <div className="rounded-md border border-[var(--badge-green-text)]/20 bg-[var(--badge-green-text)]/[0.05] px-3 py-2">
            <span className="text-[13px] text-[var(--badge-green-text)]/80">
              {resume.evidence_items.length} evidence item{resume.evidence_items.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {onNavigateResume && (
        <div className="mt-4 border-t border-[var(--line-soft)] pt-4">
          <button
            type="button"
            onClick={onNavigateResume}
            className="text-[13px] text-[var(--link)] transition-colors hover:text-[var(--link)]/70"
          >
            Upload a new version in Tailor Resume
          </button>
        </div>
      )}
    </GlassCard>
  );
}

// ─── LinkedInSection (Benchmark LinkedIn Brand inner card) ────────────────────

function LinkedInSection() {
  const { profile, updateField, save, loading, saving, error, hasContent } = useLinkedInProfile();
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    const ok = await save();
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  };

  return (
    <GlassCard className="p-6">
      <SectionHeader icon={Linkedin} label="LinkedIn" title="LinkedIn Profile" />
      <p className="mt-3 text-sm leading-relaxed text-[var(--text-soft)]">
        Your LinkedIn headline and About section are stored here as source material. LinkedIn Studio
        uses this to generate optimized content and profile suggestions.
      </p>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-[var(--text-soft)]">
          <Loader2 size={16} className="animate-spin text-[var(--link)]" />
          Loading...
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {/* Headline */}
          <div>
            <label
              htmlFor="linkedin-headline"
              className="text-[13px] font-medium uppercase tracking-widest text-[var(--text-soft)]"
            >
              Headline
            </label>
            <input
              id="linkedin-headline"
              type="text"
              value={profile.headline}
              onChange={(e) => updateField('headline', e.target.value)}
              placeholder="VP of Operations | Scaling teams from 20 to 200 | Operational excellence"
              className={cn(
                'mt-2 w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3',
                'text-sm text-[var(--text-strong)] placeholder:text-[var(--text-soft)]',
                'focus:border-[var(--link)]/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/35',
              )}
            />
          </div>

          {/* About */}
          <div>
            <label
              htmlFor="linkedin-about"
              className="text-[13px] font-medium uppercase tracking-widest text-[var(--text-soft)]"
            >
              About Section
            </label>
            <textarea
              id="linkedin-about"
              value={profile.about}
              onChange={(e) => updateField('about', e.target.value)}
              placeholder="Paste your full LinkedIn About section here. This is often the first profile summary a recruiter reads before your resume."
              rows={8}
              className={cn(
                'mt-2 w-full resize-y rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3',
                'text-sm leading-relaxed text-[var(--text-strong)] placeholder:text-[var(--text-soft)]',
                'focus:border-[var(--link)]/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/35',
              )}
            />
            {profile.about.trim().length > 0 && (
              <p className="mt-1 text-[12px] text-[var(--text-soft)]">
                {profile.about.trim().length} characters
              </p>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-[var(--badge-red-text)]">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <GlassButton
              variant="primary"
              size="sm"
              onClick={() => void handleSave()}
              disabled={saving || !hasContent}
              loading={saving}
            >
              <Save size={13} className="mr-1" />
              {saving ? 'Saving...' : 'Save LinkedIn Profile'}
            </GlassButton>
            {saved && (
              <div className="flex items-center gap-1.5 text-[13px] text-[var(--badge-green-text)]">
                <CheckCircle2 size={13} />
                Saved
              </div>
            )}
          </div>
        </div>
      )}
    </GlassCard>
  );
}

// ─── Story Bank ──────────────────────────────────────────────────────────────

function ThemeBadge({ theme }: { theme: string }) {
  return (
    <span className="rounded-md border border-[var(--link)]/20 bg-[var(--link)]/[0.07] px-2 py-0.5 text-[11px] text-[var(--link)]/80 uppercase tracking-[0.06em]">
      {theme}
    </span>
  );
}

function ObjectionBadge({ objection }: { objection: string }) {
  return (
    <span className="rounded-md border border-[var(--badge-amber-text)]/20 bg-[var(--badge-amber-text)]/[0.07] px-2 py-0.5 text-[11px] text-[var(--badge-amber-text)]/80">
      {objection}
    </span>
  );
}

interface StoryCardProps {
  row: StoryBankRow;
  onDelete: (id: string) => void;
  onSave: (id: string, content: InterviewStory) => Promise<boolean>;
}

function StoryCard({ row, onDelete, onSave }: StoryCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<InterviewStory>(row.content);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    const ok = await onSave(row.id, draft);
    setSaving(false);
    if (ok) {
      setEditing(false);
    } else {
      setSaveError('Save failed. Please try again.');
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    await onDelete(row.id);
    // Parent removes the row from state; no need to reset local state
  };

  const generatedDate = row.content.generated_at
    ? new Date(row.content.generated_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)]">
      {/* Card header — always visible */}
      <div className="flex items-start gap-3 p-4">
        <div className="mt-0.5 rounded-lg bg-[var(--link)]/10 p-1.5 shrink-0">
          <MessageSquare size={13} className="text-[var(--link)]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-relaxed text-[var(--text-muted)] line-clamp-2">
            {row.content.situation}
          </p>
          {(row.content.themes.length > 0 || row.content.objections_addressed.length > 0) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {row.content.themes.map((t) => (
                <ThemeBadge key={t} theme={t} />
              ))}
              {row.content.objections_addressed.map((o) => (
                <ObjectionBadge key={o} objection={o} />
              ))}
            </div>
          )}
          {generatedDate && (
            <p className="mt-1.5 text-[12px] text-[var(--text-soft)]">Generated {generatedDate}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 rounded-md p-1.5 text-[var(--text-soft)] transition-colors hover:text-[var(--text-muted)]"
          aria-label={expanded ? 'Collapse story' : 'Expand story'}
        >
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>

      {/* Expanded — STAR+R detail or edit form */}
      {expanded && (
        <div className="border-t border-[var(--line-soft)] p-4">
          {editing ? (
            <div className="space-y-4">
              {(
                ['situation', 'task', 'action', 'result', 'reflection'] as const
              ).map((field) => (
                <div key={field}>
                  <label
                    htmlFor={`story-${row.id}-${field}`}
                    className="text-[13px] font-medium uppercase tracking-widest text-[var(--text-soft)]"
                  >
                    {field.charAt(0).toUpperCase() + field.slice(1)}
                    {field === 'reflection' && (
                      <span className="ml-1 text-[11px] normal-case text-[var(--badge-amber-text)]">required</span>
                    )}
                  </label>
                  <textarea
                    id={`story-${row.id}-${field}`}
                    value={draft[field]}
                    onChange={(e) => setDraft((prev) => ({ ...prev, [field]: e.target.value }))}
                    rows={field === 'action' ? 5 : 3}
                    className={cn(
                      'mt-1.5 w-full resize-y rounded-xl border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2.5',
                      'text-sm leading-relaxed text-[var(--text-strong)] placeholder:text-[var(--text-soft)]',
                      'focus:border-[var(--link)]/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/35',
                    )}
                  />
                </div>
              ))}

              {saveError && (
                <div className="flex items-center gap-2 text-sm text-[var(--badge-red-text)]">
                  <AlertCircle size={13} />
                  {saveError}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <GlassButton
                  variant="primary"
                  size="sm"
                  onClick={() => void handleSave()}
                  disabled={saving || !draft.reflection.trim()}
                  loading={saving}
                >
                  <Save size={13} className="mr-1" />
                  {saving ? 'Saving...' : 'Save changes'}
                </GlassButton>
                <button
                  type="button"
                  onClick={() => { setEditing(false); setDraft(row.content); setSaveError(null); }}
                  className="rounded-md p-1.5 text-[var(--text-soft)] transition-colors hover:text-[var(--text-muted)]"
                  aria-label="Cancel edit"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {(
                [
                  { key: 'situation', label: 'Situation' },
                  { key: 'task', label: 'Task' },
                  { key: 'action', label: 'Action' },
                  { key: 'result', label: 'Result' },
                  { key: 'reflection', label: 'Reflection' },
                ] as const
              ).map(({ key, label }) => (
                <div key={key}>
                  <div className="text-[12px] font-medium uppercase tracking-widest text-[var(--text-soft)]">
                    {label}
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">
                    {row.content[key]}
                  </p>
                </div>
              ))}

              <div className="flex items-center gap-2 border-t border-[var(--line-soft)] pt-3">
                <button
                  type="button"
                  onClick={() => { setDraft(row.content); setEditing(true); }}
                  className="inline-flex items-center gap-1.5 text-[13px] text-[var(--link)] transition-colors hover:text-[var(--link)]/70"
                >
                  Edit story
                </button>
                <span className="text-[var(--line-strong)]">·</span>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  className="inline-flex items-center gap-1.5 text-[13px] text-[var(--badge-red-text)] transition-colors hover:brightness-90 disabled:opacity-50"
                >
                  <Trash2 size={12} />
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StoryBankSection() {
  const navigate = useNavigate();
  const { stories, loading, error, reload, updateStory, deleteStory } = useStoryBank();

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteStory(id);
    },
    [deleteStory],
  );

  return (
    <GlassCard className="p-6">
      <div className="flex items-start justify-between gap-4">
        <SectionHeader icon={MessageSquare} label="Stories" title="Story Bank" />
        {stories.length > 0 && (
          <div className="shrink-0 rounded-full border border-[var(--link)]/20 bg-[var(--link)]/[0.07] px-2.5 py-0.5 text-[12px] text-[var(--link)]/80">
            {stories.length} {stories.length === 1 ? 'story' : 'stories'}
          </div>
        )}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-[var(--text-soft)]">
        STAR+R stories that accumulate across every interview prep session. Each new session builds
        on this bank instead of starting from scratch — existing stories are reframed for the
        current role, new ones are generated only for gaps.
      </p>

      {loading ? (
        <div className="mt-5 flex items-center gap-2 text-sm text-[var(--text-soft)]">
          <Loader2 size={16} className="animate-spin text-[var(--link)]" />
          Loading your story bank...
        </div>
      ) : error ? (
        <div className="mt-5 flex items-start gap-2 text-sm text-[var(--text-soft)]">
          <AlertCircle size={14} className="mt-0.5 shrink-0 text-[var(--badge-amber-text)]" />
          <div>
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void reload()}
              className="ml-2 text-[var(--link)] transition-colors hover:text-[var(--link)]/70"
            >
              Retry
            </button>
          </div>
        </div>
      ) : stories.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-[var(--text-soft)] mb-3">
            Interview stories you create during Interview Prep sessions will appear here. Each story follows the STAR+R framework and can be reused across applications.
          </p>
          <button onClick={() => navigate('/workspace?room=interview')} className="text-sm text-[var(--link)] hover:underline">
            Start Interview Prep →
          </button>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {stories.map((row) => (
            <StoryCard
              key={row.id}
              row={row}
              onDelete={handleDelete}
              onSave={updateStory}
            />
          ))}
        </div>
      )}
    </GlassCard>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

interface YourProfilePageProps {
  onGetDefaultResume?: () => Promise<MasterResume | null>;
  onNavigateResume?: () => void;
  careerProfile?: CareerProfileV2 | null;
  onUpdateBenchmarkItem?: (
    itemId: string,
    changes: { statement?: string; review_status?: BenchmarkProfileReviewStatus },
  ) => Promise<boolean>;
  onAnswerDiscoveryQuestion?: (questionId: string, answer: string) => Promise<boolean>;
  /**
   * Phase 3.1 — section id to scroll to on mount/when the param changes.
   * Passed in from CareerIQScreen's workspaceLaunchContext.focus. Recognised
   * values: 'positioning' | 'career-evidence' | 'benchmark-linkedin-brand'.
   * Anything else is a no-op (page stays at the top).
   */
  focusSection?: string | null;
}

const KNOWN_SECTION_IDS = new Set([
  'positioning',
  'career-evidence',
  'benchmark-linkedin-brand',
]);

function isSourceMaterialSection(sectionId: string | null | undefined): boolean {
  return sectionId === 'career-evidence' || sectionId === 'benchmark-linkedin-brand';
}

export function YourProfilePage({
  onGetDefaultResume,
  onNavigateResume,
  careerProfile = null,
  onUpdateBenchmarkItem,
  onAnswerDiscoveryQuestion,
  focusSection = null,
}: YourProfilePageProps) {
  const { story, signals, updateField, hasStarted, lastSavedAt } = useWhyMeStory();
  const _navigate = useNavigate();
  const [whyMeSaved, setWhyMeSaved] = useState(false);
  const [sourceToolsOpen, setSourceToolsOpen] = useState(
    () => isSourceMaterialSection(focusSection),
  );
  const prevLastSavedAtRef = useRef<Date | null>(null);

  // Show "Saved" indicator briefly whenever lastSavedAt changes
  useEffect(() => {
    if (!lastSavedAt) return;
    if (prevLastSavedAtRef.current?.getTime() === lastSavedAt.getTime()) return;
    prevLastSavedAtRef.current = lastSavedAt;
    setWhyMeSaved(true);
    const t = setTimeout(() => setWhyMeSaved(false), 2500);
    return () => clearTimeout(t);
  }, [lastSavedAt]);

  // Phase 3.1 — deep-link into a specific Benchmark Profile section when the
  // `focus` URL param matches one of the three section ids. Uses rAF to let
  // the layout settle (education strips default-collapsed, but the outer
  // career-vault strip may reflow as it reads localStorage on mount).
  useEffect(() => {
    if (!focusSection || !KNOWN_SECTION_IDS.has(focusSection)) return;
    if (typeof window === 'undefined') return;

    if (isSourceMaterialSection(focusSection)) {
      setSourceToolsOpen(true);
    }

    let scrollFrame = 0;
    const settleFrame = window.requestAnimationFrame(() => {
      scrollFrame = window.requestAnimationFrame(() => {
        const el = document.getElementById(focusSection);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    return () => {
      window.cancelAnimationFrame(settleFrame);
      window.cancelAnimationFrame(scrollFrame);
    };
  }, [focusSection]);

  const benchmarkProfile = careerProfile?.benchmark_profile ?? null;

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-6 px-6 py-8">
      {/* Page title */}
      <div className="mb-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-strong)]">Benchmark Profile</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--text-soft)]">
            Your source of truth for why an employer should pick you. Keep it sharp; the rest of CareerIQ reuses it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => _navigate('/profile-setup')}
          className="flex-shrink-0 rounded-[10px] border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2 text-[12px] font-semibold text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text-strong)]"
        >
          Re-run Career Assessment
        </button>
      </div>

      {benchmarkProfile ? (
        <section id="positioning" className="scroll-mt-6">
          <BenchmarkProfileDraftPanel
            benchmarkProfile={benchmarkProfile}
            onUpdateItem={onUpdateBenchmarkItem}
            onAnswerQuestion={onAnswerDiscoveryQuestion}
          />
        </section>
      ) : (
        <section
          id="positioning"
          className="flex flex-col gap-4 border-t border-[var(--line-soft)] pt-6 scroll-mt-6"
        >
          <h2 className="text-lg font-semibold text-[var(--text-strong)]">Core Positioning</h2>

          {hasStarted ? (
            // WhyMeStoryCard renders its own GlassCard
            <div>
              <div className="mb-3 flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-[var(--link)]/12 p-2">
                    <BookOpen size={16} className="text-[var(--link)]" />
                  </div>
                  <div>
                    <div className="text-[13px] font-medium uppercase tracking-widest text-[var(--link)]">Positioning</div>
                    <h2 className="mt-0.5 text-sm font-semibold text-[var(--text-strong)]">
                      Why They Should Choose You
                    </h2>
                  </div>
                </div>
                {whyMeSaved && (
                  <div className="flex items-center gap-1.5 text-[13px] text-[var(--badge-green-text)]">
                    <CheckCircle2 size={13} />
                    Saved
                  </div>
                )}
              </div>
              <WhyMeStoryCard />
            </div>
          ) : (
            <GlassCard className="p-6">
              <div className="flex items-center justify-between gap-4">
                <SectionHeader icon={BookOpen} label="Positioning" title="Your Why-Me Story" />
                {whyMeSaved && (
                  <div className="flex items-center gap-1.5 text-[13px] text-[var(--badge-green-text)] shrink-0">
                    <CheckCircle2 size={13} />
                    Saved
                  </div>
                )}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-[var(--text-soft)]">
                Three answers that define how LinkedIn Growth, Find Jobs, Tailor Resume, Interview & Offer, and every other
                tool frames your positioning. This is the most important section on this page.
              </p>
              <div className="mt-5">
                <WhyMeEngine story={story} signals={signals} onUpdate={updateField} />
              </div>
            </GlassCard>
          )}

          {/* TODO: Surface Why-Not-Me here when built. See product model — Benchmark Profile / Positioning section. */}
          {/* TODO: Surface Target Industries / Ideal Companies / Target Roles here when built. See product model — Benchmark Profile / Positioning section. */}
        </section>
      )}

      <details
        className="group rounded-[10px] border border-[var(--line-soft)] bg-[var(--surface-1)]"
        open={sourceToolsOpen}
        onToggle={(event) => setSourceToolsOpen(event.currentTarget.open)}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-left">
          <span>
            <span className="block text-sm font-semibold text-[var(--text-strong)]">Source Material</span>
            <span className="mt-0.5 block text-xs text-[var(--text-soft)]">
              Resume evidence, story bank, and saved LinkedIn inputs are tucked away until you need to edit them.
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="flex flex-col gap-6 border-t border-[var(--line-soft)] px-5 py-5">
          {/* ─── Section 2 — Career Proof ───────────────────────────────────── */}
          <section
            id="career-evidence"
            className="flex flex-col gap-4 scroll-mt-6"
          >
            <h2 className="text-base font-semibold text-[var(--text-strong)]">Career Proof</h2>

            <ResumeSection
              onGetDefaultResume={onGetDefaultResume}
              onNavigateResume={onNavigateResume}
              benchmarkProfile={benchmarkProfile}
            />

            <StoryBankSection />

            {/* TODO: Surface Signature Accomplishments as a first-class managed list here when built. See product model — Benchmark Profile / Career Proof section. */}
          </section>

          {/* ─── Section 3 — Benchmark LinkedIn Brand ────────────────────────── */}
          <section
            id="benchmark-linkedin-brand"
            className="flex flex-col gap-4 border-t border-[var(--line-soft)] pt-6 scroll-mt-6"
          >
            <h2 className="text-base font-semibold text-[var(--text-strong)]">LinkedIn Inputs</h2>

            <LinkedInSection />

            {/* TODO: Surface the five-second LinkedIn test audit here when built. See product model — Benchmark Profile / Benchmark LinkedIn Brand section. */}
            {/* TODO: Surface Blogging / carousels here when built. See product model — Benchmark Profile / Benchmark LinkedIn Brand section. */}
          </section>
        </div>
      </details>
    </div>
  );
}
