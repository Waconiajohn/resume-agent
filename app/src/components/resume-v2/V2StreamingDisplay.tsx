/**
 * V2StreamingDisplay — Output display for the v2 pipeline
 *
 * Two layout modes:
 *   1. Processing mode — OriginalScoresCard + LivePipelineCard (or PostGapDebriefCard after gap submission)
 *   2. Resume mode — coaching banner + full-width centered document with inline editing
 */

import { useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { Loader2, AlertCircle, Undo2, Redo2, ChevronDown, ChevronUp, CheckCircle, Check, X, TrendingUp, Target, Lightbulb, ShieldCheck } from 'lucide-react';
import type { V2PipelineData, V2Stage, ResumeDraft, InlineSuggestion } from '@/types/resume-v2';
import type { GapCoachingResponse, PreScores, GapCoachingCard as GapCoachingCardType, GapAnalysis, BenchmarkCandidate, NarrativeStrategy, AssemblyResult, VerificationDetail } from '@/types/resume-v2';
import type { CoachingThreadSnapshot, FinalReviewChatContext, MasterPromotionItem, PostReviewPolishState } from '@/types/resume-v2';
import type { EditAction, PendingEdit } from '@/hooks/useInlineEdit';
import { ResumeDocumentCard } from './cards/ResumeDocumentCard';
import type { LiveScores } from '@/hooks/useLiveScoring';
import { InlineEditToolbar } from './InlineEditToolbar';
import { DiffView } from './DiffView';
import type { HiringManagerReviewResult, HiringManagerConcern } from '@/hooks/useHiringManagerReview';
import type { GapChatHook } from '@/hooks/useGapChat';
import type { FinalReviewChatHook } from '@/hooks/useFinalReviewChat';
import type { GapChatContext } from '@/types/resume-v2';
import { ReviewInboxCard } from './cards/ReviewInboxCard';
import { ResumeWorkspaceRail } from './ResumeWorkspaceRail';
import { ScoringReport } from './ScoringReport';
import { GapOverviewCard } from './cards/GapOverviewCard';
import { buildRewriteQueue } from '@/lib/rewrite-queue';
import { SuggestionsBadge } from './SuggestionsBadge';
import { useInlineSuggestions } from '@/hooks/useInlineSuggestions';
import { GapQuestionFlow, coachingCardsToQuestions, questionResponsesToCoachingResponses } from './GapQuestionFlow';
import type { GapQuestionResponse } from './GapQuestionFlow';
import { PostGapDebriefCard } from './cards/PostGapDebriefCard';

interface V2StreamingDisplayProps {
  data: V2PipelineData;
  isComplete: boolean;
  isConnected: boolean;
  error: string | null;
  /** The editable resume (may differ from pipeline data after user edits) */
  editableResume: ResumeDraft | null;
  /** Inline editing state */
  pendingEdit: PendingEdit | null;
  isEditing: boolean;
  editError: string | null;
  undoCount: number;
  redoCount: number;
  onRequestEdit: (selectedText: string, section: string, action: EditAction, customInstruction?: string, editContext?: import('@/hooks/useInlineEdit').EditContext) => void;
  onAcceptEdit: (editedText: string) => void;
  onRejectEdit: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onAddContext: (context: string) => void;
  isRerunning: boolean;
  liveScores: LiveScores | null;
  isScoring: boolean;
  gapCoachingCards: GapCoachingCardType[] | null;
  onRespondGapCoaching: (responses: GapCoachingResponse[]) => void;
  preScores: PreScores | null;
  onIntegrateKeyword?: (keyword: string) => void;
  previousResume?: ResumeDraft | null;
  onDismissChanges?: () => void;
  hiringManagerResult?: HiringManagerReviewResult | null;
  resolvedFinalReviewConcernIds?: string[];
  isFinalReviewStale?: boolean;
  finalReviewWarningsAcknowledged?: boolean;
  onAcknowledgeFinalReviewWarnings?: () => void;
  isHiringManagerLoading?: boolean;
  hiringManagerError?: string | null;
  onRequestHiringManagerReview?: () => void;
  onApplyHiringManagerRecommendation?: (
    concern: HiringManagerConcern,
    languageOverride?: string,
    candidateInputUsed?: boolean,
  ) => void;
  gapChat?: GapChatHook | null;
  gapChatSnapshot?: CoachingThreadSnapshot | null;
  buildChatContext?: (requirement: string) => GapChatContext;
  finalReviewChat?: FinalReviewChatHook | null;
  finalReviewChatSnapshot?: CoachingThreadSnapshot | null;
  buildFinalReviewChatContext?: (concern: HiringManagerConcern) => FinalReviewChatContext | null;
  postReviewPolish?: PostReviewPolishState;
  masterSaveMode?: 'session_only' | 'master_resume';
  onChangeMasterSaveMode?: (mode: 'session_only' | 'master_resume') => void;
  onSaveCurrentToMaster?: () => void;
  isSavingToMaster?: boolean;
  masterSaveStatus?: {
    tone: 'neutral' | 'success' | 'error';
    message: string;
  };
  promotableMasterItems?: MasterPromotionItem[];
  selectedMasterPromotionIds?: string[];
  onToggleMasterPromotionItem?: (itemId: string) => void;
  onSelectAllMasterPromotionItems?: () => void;
  onClearMasterPromotionItems?: () => void;
  /** Callback for AI-assist buttons in GapQuestionFlow cards */
  onGapAssist?: (
    requirement: string,
    classification: string,
    action: 'strengthen' | 'add_metrics' | 'rewrite',
    currentDraft: string,
    evidence: string[],
    aiReasoning?: string,
    signal?: AbortSignal,
  ) => Promise<string | null>;
}

function AnimatedCard({ children, index = 0 }: { children: ReactNode; index?: number }) {
  return (
    <div
      className="motion-safe:animate-[card-enter_500ms_ease-out_forwards] motion-safe:opacity-0"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {children}
    </div>
  );
}

// ─── OriginalScoresCard ───────────────────────────────────────────────────────
// Shows the pre-optimization ATS score + full two-column keyword breakdown.

interface OriginalScoresCardProps {
  preScores: PreScores;
  /** When true (resume mode), renders as a collapsible card */
  collapsible?: boolean;
}

const KEYWORD_INITIAL_LIMIT = 8;

function OriginalScoresCard({ preScores, collapsible = false }: OriginalScoresCardProps) {
  const { ats_match, keywords_found, keywords_missing } = preScores;
  const total = keywords_found.length + keywords_missing.length;
  const [showAll, setShowAll] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const visibleFound = showAll ? keywords_found : keywords_found.slice(0, KEYWORD_INITIAL_LIMIT);
  const visibleMissing = showAll ? keywords_missing : keywords_missing.slice(0, KEYWORD_INITIAL_LIMIT);
  const hasMore = keywords_found.length > KEYWORD_INITIAL_LIMIT || keywords_missing.length > KEYWORD_INITIAL_LIMIT;

  return (
    <div
      className="bg-white rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.35)] mb-6 overflow-hidden"
      role="region"
      aria-label="Original resume analysis"
    >
      {/* Header — always visible */}
      <div className="px-6 pt-5 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 mb-3">
              Your Starting Point — Original Resume Analysis
            </p>

            {/* ATS score + bar */}
            <div className="mb-1.5">
              <div className="flex items-baseline gap-2 mb-1.5">
                <span className="text-2xl font-bold tabular-nums text-neutral-800">{ats_match}%</span>
                <span className="text-sm text-neutral-500">ATS Keyword Match</span>
                <span className="text-[11px] text-neutral-400">({total} JD keywords total)</span>
              </div>
              <div
                className="h-2 w-full rounded-full bg-neutral-100 overflow-hidden"
                role="progressbar"
                aria-valuenow={ats_match}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`ATS match: ${ats_match}%`}
              >
                <div
                  className="h-full rounded-full bg-blue-400 transition-[width] duration-700 ease-out"
                  style={{ width: `${ats_match}%` }}
                />
              </div>
            </div>
          </div>
          {collapsible && (
            <button
              type="button"
              onClick={() => setCollapsed((p) => !p)}
              className="mt-1 text-neutral-400 hover:text-neutral-600 transition-colors"
              aria-expanded={!collapsed}
              aria-label={collapsed ? 'Expand original analysis' : 'Collapse original analysis'}
            >
              {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </button>
          )}
        </div>

        {/* Keyword summary counts row */}
        <div className="flex items-center gap-4 mt-2">
          <div className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
            <Check className="h-4 w-4 shrink-0" />
            {keywords_found.length} found
          </div>
          <span className="text-neutral-300">|</span>
          <div className="flex items-center gap-1.5 text-sm text-red-400 font-medium">
            <X className="h-4 w-4 shrink-0" />
            {keywords_missing.length} missing
          </div>
        </div>
      </div>

      {/* Collapsible body */}
      {(!collapsible || !collapsed) && (
        <div className="px-6 pb-5">
          {/* Two-column keyword table */}
          {(keywords_found.length > 0 || keywords_missing.length > 0) && (
            <div>
              <div className="border border-neutral-200 rounded-lg overflow-hidden">
                {/* Column headers */}
                <div className="grid grid-cols-2 border-b border-neutral-200 bg-neutral-50">
                  <div className="px-3 py-2 flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                      Found ({keywords_found.length})
                    </span>
                  </div>
                  <div className="px-3 py-2 flex items-center gap-1.5 border-l border-neutral-200">
                    <X className="h-3.5 w-3.5 text-red-400" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                      Missing ({keywords_missing.length})
                    </span>
                  </div>
                </div>

                {/* Keyword rows */}
                <div className="grid grid-cols-2">
                  {/* Found column */}
                  <div className="py-1">
                    {visibleFound.length === 0
                      ? <p className="px-3 py-2 text-[12px] text-neutral-400 italic">None detected</p>
                      : visibleFound.map((kw, i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-1.5">
                          <Check className="h-3 w-3 shrink-0 text-emerald-500" />
                          <span className="text-[12px] text-neutral-700">{kw}</span>
                        </div>
                      ))
                    }
                  </div>
                  {/* Missing column */}
                  <div className="py-1 border-l border-neutral-200">
                    {visibleMissing.length === 0
                      ? <p className="px-3 py-2 text-[12px] text-neutral-400 italic">All keywords present</p>
                      : visibleMissing.map((kw, i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-1.5">
                          <X className="h-3 w-3 shrink-0 text-red-400" />
                          <span className="text-[12px] text-neutral-700">{kw}</span>
                        </div>
                      ))
                    }
                  </div>
                </div>
              </div>

              {/* Show all toggle */}
              {hasMore && (
                <button
                  type="button"
                  onClick={() => setShowAll((p) => !p)}
                  className="mt-2 flex items-center gap-1 text-[12px] text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  {showAll ? (
                    <>
                      <ChevronUp className="h-3.5 w-3.5" />
                      Show fewer keywords
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3.5 w-3.5" />
                      Show all keywords
                      {keywords_found.length + keywords_missing.length > KEYWORD_INITIAL_LIMIT * 2
                        ? ` (${keywords_found.length + keywords_missing.length - KEYWORD_INITIAL_LIMIT * 2} more)`
                        : ''}
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {!collapsible && (
            <p className="mt-4 text-[13px] text-neutral-500 leading-relaxed">
              We are now optimizing your resume to close these gaps...
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── LivePipelineCard ─────────────────────────────────────────────────────────
// Shows live data as it arrives from SSE events during pipeline processing.

function LivePipelineCard({ data, isComplete }: { data: V2PipelineData; isComplete: boolean }) {
  const items: Array<{ key: string; label: string; detail?: string }> = [];

  if (data.jobIntelligence) {
    const ji = data.jobIntelligence;
    const reqCount = ji.core_competencies.length + ji.strategic_responsibilities.length;
    items.push({
      key: 'job',
      label: `Found ${reqCount} requirements from the job description`,
      detail: `${ji.company_name} — ${ji.role_title}`,
    });
  }

  if (data.candidateIntelligence) {
    const ci = data.candidateIntelligence;
    items.push({
      key: 'candidate',
      label: `Identified ${ci.career_themes.length} career themes and ${ci.quantified_outcomes.length} quantified outcomes`,
    });
  }

  if (data.benchmarkCandidate) {
    items.push({
      key: 'benchmark',
      label: `Benchmark expects ${data.benchmarkCandidate.differentiators.length} differentiators`,
    });
  }

  if (data.preScores) {
    items.push({
      key: 'prescores',
      label: `Baseline ATS match: ${data.preScores.ats_match}% — ${data.preScores.keywords_found.length} keywords found, ${data.preScores.keywords_missing.length} missing`,
    });
  }

  if (data.gapAnalysis) {
    const ga = data.gapAnalysis;
    const strong = ga.requirements.filter((r) => r.classification === 'strong').length;
    const partial = ga.requirements.filter((r) => r.classification === 'partial').length;
    const missing = ga.requirements.filter((r) => r.classification === 'missing').length;
    items.push({
      key: 'gap',
      label: `Mapped requirements: ${strong} strong, ${partial} partial, ${missing} gaps`,
    });
  }

  if (data.narrativeStrategy) {
    items.push({
      key: 'narrative',
      label: `Positioning angle: "${data.narrativeStrategy.primary_narrative}"`,
    });
  }

  const progress = isComplete ? 100 : getStageProgressPercent(data.stage);
  const stageLabel = getStageStatusLabel(data.stage, isComplete);

  return (
    <div
      className="bg-white rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.35)] p-6"
      role="status"
      aria-live="polite"
    >
      <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 mb-3">
        AI Working On Your Resume
      </p>

      {/* Progress bar */}
      <div className="mb-4">
        <div
          className="h-1.5 w-full rounded-full bg-neutral-100 overflow-hidden"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-blue-400 transition-[width] duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-1.5 text-[12px] text-neutral-500">{stageLabel}</p>
      </div>

      {/* Live data feed */}
      {items.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <Loader2 className="h-4 w-4 motion-safe:animate-spin" />
          Analyzing your resume and the job description...
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((item, i) => (
            <div
              key={item.key}
              className="flex items-start gap-2.5 motion-safe:animate-[card-enter_400ms_ease-out_forwards] motion-safe:opacity-0"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-neutral-700">{item.label}</p>
                {item.detail && (
                  <p className="text-[12px] text-neutral-400 mt-0.5">{item.detail}</p>
                )}
              </div>
            </div>
          ))}
          {!isComplete && (
            <div className="flex items-center gap-2.5 text-sm text-neutral-500">
              <Loader2 className="h-4 w-4 motion-safe:animate-spin shrink-0" />
              {stageLabel}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── SuggestionProgressStrip ─────────────────────────────────────────────────
// Sticky strip shown above the resume document to guide the user through review.

interface SuggestionProgressStripProps {
  total: number;
  reviewed: number;
  currentIndex: number;
  /** Per-index status so dot colors reflect actual reviewed state, not just sequential count */
  statuses: Array<'pending' | 'accepted' | 'rejected'>;
  onAcceptAll: () => void;
  allResolved: boolean;
  onExport: () => void;
}

function SuggestionProgressStrip({
  total,
  reviewed,
  currentIndex,
  statuses,
  onAcceptAll,
  allResolved,
  onExport,
}: SuggestionProgressStripProps) {
  const getLabel = () => {
    if (total === 0) return null;
    if (allResolved) return `All ${total} reviewed! Ready to export`;
    if (reviewed === 0) return `Click suggestion \u2460 to start`;
    return `${reviewed} of ${total} reviewed`;
  };

  const label = getLabel();
  if (!label) return null;

  return (
    <div
      className={`sticky top-0 z-20 rounded-lg shadow-[0_2px_16px_rgba(0,0,0,0.18)] px-5 py-3 mb-4 transition-colors duration-300 ${
        allResolved
          ? 'bg-green-50 border border-green-200'
          : 'bg-white border border-neutral-200'
      }`}
      role="status"
      aria-live="polite"
      aria-label="Suggestion review progress"
    >
      <div className="flex items-center gap-4">
        {/* Label */}
        <div className="flex-1 min-w-0">
          <p className={`text-[13px] font-medium leading-tight ${allResolved ? 'text-green-700' : 'text-neutral-700'}`}>
            {label}
          </p>

          {/* Dot progress indicators */}
          {total > 0 && !allResolved && (
            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
              {Array.from({ length: total }, (_, i) => {
                const status = statuses[i] ?? 'pending';
                const isReviewed = status !== 'pending';
                const isCurrent = i === currentIndex && !isReviewed;
                if (isCurrent) {
                  return (
                    <span
                      key={i}
                      className="h-2.5 w-2.5 rounded-full bg-blue-400 motion-safe:animate-pulse ring-2 ring-blue-300 ring-offset-1 flex-shrink-0"
                      aria-label={`Suggestion ${i + 1}: current`}
                    />
                  );
                }
                if (isReviewed) {
                  return (
                    <span
                      key={i}
                      className="h-2.5 w-2.5 rounded-full bg-green-500 flex-shrink-0"
                      aria-label={`Suggestion ${i + 1}: reviewed`}
                    />
                  );
                }
                return (
                  <span
                    key={i}
                    className="h-2.5 w-2.5 rounded-full border border-neutral-300 flex-shrink-0"
                    aria-label={`Suggestion ${i + 1}: pending`}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Action button */}
        {allResolved ? (
          <button
            type="button"
            onClick={onExport}
            className="shrink-0 rounded-md bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600"
          >
            Export Resume
          </button>
        ) : (
          <button
            type="button"
            onClick={onAcceptAll}
            className="shrink-0 rounded-md border border-neutral-300 bg-white px-4 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
          >
            Accept All
          </button>
        )}
      </div>
    </div>
  );
}

export function V2StreamingDisplay({
  data, isComplete, isConnected, error,
  editableResume, pendingEdit, isEditing, editError, undoCount, redoCount,
  onRequestEdit, onAcceptEdit, onRejectEdit, onUndo, onRedo,
  onAddContext, isRerunning,
  liveScores, isScoring,
  gapCoachingCards, onRespondGapCoaching, preScores, onIntegrateKeyword,
  previousResume, onDismissChanges,
  hiringManagerResult, resolvedFinalReviewConcernIds = [], isFinalReviewStale = false, finalReviewWarningsAcknowledged = false, onAcknowledgeFinalReviewWarnings,
  isHiringManagerLoading, hiringManagerError,
  onRequestHiringManagerReview, onApplyHiringManagerRecommendation,
  gapChat, gapChatSnapshot, buildChatContext,
  finalReviewChat, finalReviewChatSnapshot, buildFinalReviewChatContext, postReviewPolish,
  masterSaveMode = 'session_only',
  onChangeMasterSaveMode,
  onSaveCurrentToMaster,
  isSavingToMaster = false,
  masterSaveStatus,
  promotableMasterItems = [],
  selectedMasterPromotionIds = [],
  onToggleMasterPromotionItem,
  onSelectAllMasterPromotionItems,
  onClearMasterPromotionItems,
  onGapAssist,
}: V2StreamingDisplayProps) {
  // ── Inline suggestions ────────────────────────────────────────────────────
  const {
    suggestions,
    pendingCount,
    reviewedCount,
    allResolved,
    currentSuggestionIndex,
    accept: acceptSuggestion,
    reject: rejectSuggestion,
    scrollToNext,
    handleSuggestionEvent,
    containerRef,
  } = useInlineSuggestions();

  // Build a stable 1-based index map from suggestion id → sequential number
  const suggestionIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    suggestions.forEach((s, i) => map.set(s.id, i + 1));
    return map;
  }, [suggestions]);

  // The id of the currently focused suggestion
  const currentSuggestionId = suggestions[currentSuggestionIndex]?.id ?? null;

  // Sync incoming suggestions from SSE into the suggestion hook state
  const prevSuggestionsRef = useRef<InlineSuggestion[]>([]);
  useEffect(() => {
    const incoming = data.inlineSuggestions;
    if (incoming === prevSuggestionsRef.current || incoming.length === 0) return;
    prevSuggestionsRef.current = incoming;
    handleSuggestionEvent({ suggestions: incoming });
  }, [data.inlineSuggestions, handleSuggestionEvent]);

  // Toolbar position state (for text-selection inline editing)
  const [toolbarPos, setToolbarPos] = useState<{ top: number; left: number; bottom: number } | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [selectedSection, setSelectedSection] = useState('');

  // Active bullet for inline editing
  const [activeBullet, setActiveBullet] = useState<{
    section: string;
    index: number;
    requirements: string[];
  } | null>(null);

  // ── Gap question flow ─────────────────────────────────────────────────────
  // When gapCoachingCards arrive during processing (no resume yet), show the
  // one-at-a-time question flow. Track whether the user has already submitted.
  const [gapQuestionsSubmitted, setGapQuestionsSubmitted] = useState(false);
  const [gapResponses, setGapResponses] = useState<GapQuestionResponse[]>([]);

  // Reset the submitted flag when a new pipeline run starts (gapCoachingCards
  // goes back to null as part of INITIAL_DATA reset in useV2Pipeline).
  const prevGapCoachingCardsRef = useRef(gapCoachingCards);
  useEffect(() => {
    if (prevGapCoachingCardsRef.current !== null && gapCoachingCards === null) {
      setGapQuestionsSubmitted(false);
      setGapResponses([]);
    }
    prevGapCoachingCardsRef.current = gapCoachingCards;
  }, [gapCoachingCards]);

  // On re-runs, all coaching cards arrive with previously_approved=true.
  // Skip showing the gap question flow in that case to avoid a visual flash.
  const allPreviouslyApproved = useMemo(
    () => gapCoachingCards != null && gapCoachingCards.length > 0 && gapCoachingCards.every(c => c.previously_approved),
    [gapCoachingCards],
  );

  // When the orchestrator auto-approves all strategies, the pipeline moves past
  // the strategy stage without waiting for user gap coaching responses.
  // Skip the gap question flow if the pipeline has already advanced.
  const pipelinePastGaps = data.stage != null && ['writing', 'verification', 'assembly', 'complete'].includes(data.stage);

  const gapQuestions = useMemo(
    () => (gapCoachingCards && !allPreviouslyApproved ? coachingCardsToQuestions(gapCoachingCards) : []),
    [gapCoachingCards, allPreviouslyApproved],
  );

  const handleGapQuestionsComplete = useCallback(
    (questionResponses: GapQuestionResponse[]) => {
      setGapResponses(questionResponses);
      setGapQuestionsSubmitted(true);
      const coachingResponses = questionResponsesToCoachingResponses(
        questionResponses,
        gapQuestions,
      );
      onRespondGapCoaching(coachingResponses);
    },
    [gapQuestions, onRespondGapCoaching],
  );

  const displayResume = editableResume ?? data.assembly?.final_resume ?? data.resumeDraft;
  const hasResume = displayResume !== null && displayResume !== undefined;

  const handleTextSelect = useCallback((text: string, section: string, rect: DOMRect) => {
    setSelectedText(text);
    setSelectedSection(section);
    setToolbarPos({ top: rect.top, left: rect.left + rect.width / 2, bottom: rect.bottom });
  }, []);

  const dismissToolbar = useCallback(() => {
    setToolbarPos(null);
    setSelectedText('');
    setSelectedSection('');
    window.getSelection()?.removeAllRanges();
  }, []);

  const handleToolbarAction = useCallback((action: EditAction, customInstruction?: string) => {
    dismissToolbar();
    onRequestEdit(selectedText, selectedSection, action, customInstruction);
  }, [selectedText, selectedSection, onRequestEdit, dismissToolbar]);

  useEffect(() => {
    if (!toolbarPos) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[role="toolbar"]')) return;
      if (target.closest('[data-section]')) return;
      dismissToolbar();
    };
    window.addEventListener('mousedown', handleMouseDown);
    return () => window.removeEventListener('mousedown', handleMouseDown);
  }, [toolbarPos, dismissToolbar]);

  // Bullet click handler for cross-referencing
  const handleBulletClick = useCallback((bulletText: string, section: string, bulletIndex: number, requirements: string[]) => {
    setActiveBullet((prev) => {
      if (prev?.section === section && prev?.index === bulletIndex) return null;
      return { section, index: bulletIndex, requirements };
    });
  }, []);

  // Clear activeBullet after accepting an edit (inline panel should close)
  const handleAcceptEdit = useCallback((editedText: string) => {
    onAcceptEdit(editedText);
    setActiveBullet(null);
  }, [onAcceptEdit]);

  const canEdit = isComplete && displayResume !== null && displayResume !== undefined;

  const canShowUndoBar = canEdit && (undoCount > 0 || redoCount > 0);

  // Accept all pending suggestions at once
  const handleAcceptAll = useCallback(() => {
    suggestions.forEach((s) => {
      if (s.status === 'pending') {
        acceptSuggestion(s.id);
      }
    });
  }, [suggestions, acceptSuggestion]);

  // A1/A2: Clear activeBullet when re-running (stale state from previous run)
  useEffect(() => {
    if (isRerunning) {
      setActiveBullet(null);
    }
  }, [isRerunning]);

  // B3: Escape key closes inline edit panel
  useEffect(() => {
    if (!activeBullet) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveBullet(null);
        onRejectEdit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeBullet, onRejectEdit]);

  // Scroll to top when scoring report data arrives so it's visible
  useEffect(() => {
    if (data.assembly && containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [data.assembly]);

  // Show the full-width resume document once a draft exists.
  // Don't show it while re-running — the old assembly data persists and would be stale.
  const canShowResumeDocument = hasResume && !isRerunning;

  const jobBreakdown = data.gapAnalysis?.score_breakdown?.job_description ?? {
    addressed: 0,
    total: 0,
    partial: 0,
    missing: 0,
    coverage_score: 0,
  };
  const benchmarkBreakdown = data.gapAnalysis?.score_breakdown?.benchmark ?? {
    addressed: 0,
    total: 0,
    partial: 0,
    missing: 0,
    coverage_score: 0,
  };
  const rewriteQueue = useMemo(() => {
    if (!data.jobIntelligence || !data.gapAnalysis) return null;
    return buildRewriteQueue({
      jobIntelligence: data.jobIntelligence,
      gapAnalysis: data.gapAnalysis,
      currentResume: displayResume,
      benchmarkCandidate: data.benchmarkCandidate,
      gapCoachingCards,
      gapChatSnapshot,
      finalReviewResult: hiringManagerResult ?? null,
      finalReviewChatSnapshot,
      resolvedFinalReviewConcernIds,
    });
  }, [
    data.benchmarkCandidate,
    data.gapAnalysis,
    data.jobIntelligence,
    displayResume,
    finalReviewChatSnapshot,
    gapChatSnapshot,
    gapCoachingCards,
    hiringManagerResult,
    resolvedFinalReviewConcernIds,
  ]);

  // ─── Unified layout — single ScoringReport above the branch split ────────
  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto relative">
      {/* Gap Overview — "Your Resume vs. This Role" — persists across all phases */}
      {data.gapAnalysis && data.preScores && (
        <div className="mx-auto max-w-[900px] px-6 pt-8">
          <GapOverviewCard
            gapAnalysis={data.gapAnalysis}
            preScores={data.preScores}
            questionCount={0}
            onBeginReview={() => {}}
          />
        </div>
      )}

      {/* Scoring report — single instance, persists across layout transitions */}
      {data.preScores && data.assembly && (
        <div className="mx-auto max-w-[900px] px-6 pt-4">
          <ScoringReport
            preScores={data.preScores}
            assembly={data.assembly}
            verificationDetail={data.verificationDetail ?? null}
            gapAnalysis={data.gapAnalysis ?? null}
          />
        </div>
      )}

      {canShowResumeDocument ? (
        <>
          {/* Undo/redo bar */}
          {canShowUndoBar && (
            <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-2 bg-[#0f141e]/85 border-b border-[var(--line-soft)]">
              <button
                type="button"
                onClick={onUndo}
                disabled={undoCount === 0}
                className="flex items-center gap-1.5 rounded-md border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2.5 py-1.5 text-xs text-[var(--text-soft)] hover:bg-[var(--surface-1)] hover:text-[var(--text-strong)] disabled:opacity-30 transition-colors"
                title="Undo"
              >
                <Undo2 className="h-3 w-3" />
                <span>Undo</span>
                {undoCount > 0 && (
                  <span className="rounded-sm bg-[var(--surface-1)] px-1.5 py-0.5 font-mono text-[12px] text-[var(--text-soft)]">
                    {undoCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={onRedo}
                disabled={redoCount === 0}
                className="flex items-center gap-1.5 rounded-md border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2.5 py-1.5 text-xs text-[var(--text-soft)] hover:bg-[var(--surface-1)] hover:text-[var(--text-strong)] disabled:opacity-30 transition-colors"
                title="Redo"
              >
                <Redo2 className="h-3 w-3" />
                <span>Redo</span>
                {redoCount > 0 && (
                  <span className="rounded-sm bg-[var(--surface-1)] px-1.5 py-0.5 font-mono text-[12px] text-[var(--text-soft)]">
                    {redoCount}
                  </span>
                )}
              </button>
            </div>
          )}

          {/* Full-width centered resume document */}
          <div className="mx-auto max-w-[900px] px-6 py-8 space-y-6">
            {/* Error banners */}
            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-[#f0b8b8]/28 bg-[#f0b8b8]/[0.08] px-4 py-3 text-sm text-[#f0b8b8]/90" role="alert">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            {editError && (
              <div className="flex items-center gap-2 rounded-xl border border-[#f0b8b8]/28 bg-[#f0b8b8]/[0.08] px-4 py-3 text-sm text-[#f0b8b8]/90" role="alert">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {editError}
              </div>
            )}

            {/* Processing banner — shown while pipeline finalises after resume first appears */}
            {!isComplete && isConnected && (
              <div className="flex items-center gap-2 text-xs text-[var(--text-soft)]" role="status" aria-live="polite">
                <Loader2 className="h-3 w-3 motion-safe:animate-spin" />
                <span>{getStageMessage(data.stage)}</span>
              </div>
            )}

            {pendingEdit && <ReviewInboxCard pendingEdit={pendingEdit} />}

            {/* Original scores card — suppressed; unified GapOverviewCard shows ATS data */}

            {/* Detailed analysis — gap analysis, benchmark, narrative strategy, verification */}
            {isComplete && (
              <PipelineAnalysisSummary
                gapAnalysis={data.gapAnalysis}
                benchmarkCandidate={data.benchmarkCandidate}
                narrativeStrategy={data.narrativeStrategy}
                assembly={data.assembly}
                verificationDetail={data.verificationDetail}
              />
            )}

            {/* Suggestion progress strip — sticky, shown when there are suggestions */}
            {isComplete && suggestions.length > 0 && (
              <SuggestionProgressStrip
                total={suggestions.length}
                reviewed={reviewedCount}
                currentIndex={currentSuggestionIndex}
                statuses={suggestions.map((s) => s.status)}
                onAcceptAll={handleAcceptAll}
                allResolved={allResolved}
                onExport={() => {
                  const rail = containerRef.current?.querySelector('[data-workspace-rail]');
                  rail?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              />
            )}

            {/* Resume document with inline editing */}
            {displayResume && (
              <AnimatedCard index={0}>
                {/* Paper-on-desk document card */}
                <div className="bg-white rounded-lg shadow-[0_4px_32px_rgba(0,0,0,0.45)] overflow-hidden">
                  <ResumeDocumentCard
                    resume={displayResume}
                    onTextSelect={canEdit ? handleTextSelect : undefined}
                    activeBullet={activeBullet}
                    onBulletClick={canEdit ? handleBulletClick : undefined}
                    pendingEdit={pendingEdit}
                    isEditing={isEditing}
                    onAcceptEdit={handleAcceptEdit}
                    onRejectEdit={onRejectEdit}
                    onRequestEdit={canEdit ? onRequestEdit : undefined}
                    inlineSuggestions={suggestions}
                    onAcceptSuggestion={acceptSuggestion}
                    onRejectSuggestion={rejectSuggestion}
                    currentSuggestionId={currentSuggestionId}
                    suggestionIndexMap={suggestionIndexMap}
                  />
                </div>
              </AnimatedCard>
            )}

            {/* Pending edit diff view (for text-selection edits, not inline bullet edits) */}
            {pendingEdit && !activeBullet && (
              <div className="mt-4" ref={(el) => el?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                <DiffView key={pendingEdit.originalText + pendingEdit.section} edit={pendingEdit} onAccept={handleAcceptEdit} onReject={onRejectEdit} />
              </div>
            )}

            {/* Below resume: workspace rail — collapsed by default */}
            {isComplete && data.assembly && displayResume && (
              <CollapsibleWorkspaceRail>
              <ResumeWorkspaceRail
                displayResume={displayResume}
                assembly={data.assembly}
                companyName={data.jobIntelligence?.company_name}
                jobTitle={data.jobIntelligence?.role_title}
                atsScore={data.assembly.scores.ats_match}
                hiringManagerResult={hiringManagerResult ?? null}
                resolvedFinalReviewConcernIds={resolvedFinalReviewConcernIds}
                isFinalReviewStale={isFinalReviewStale}
                isHiringManagerLoading={isHiringManagerLoading}
                hiringManagerError={hiringManagerError}
                onRequestHiringManagerReview={onRequestHiringManagerReview}
                onApplyHiringManagerRecommendation={onApplyHiringManagerRecommendation}
                finalReviewChat={finalReviewChat}
                buildFinalReviewChatContext={buildFinalReviewChatContext}
                isEditing={isEditing}
                queueSummary={rewriteQueue?.summary ?? { needsAttention: 0, partiallyAddressed: 0, resolved: 0, hardGapCount: 0 }}
                nextQueueItemLabel={rewriteQueue?.nextItem?.title}
                finalReviewWarningsAcknowledged={finalReviewWarningsAcknowledged}
                onAcknowledgeFinalReviewWarnings={onAcknowledgeFinalReviewWarnings}
              />
              </CollapsibleWorkspaceRail>
            )}
          </div>

          {/* Floating toolbar (text selection) */}
          {canEdit && (
            <InlineEditToolbar
              position={toolbarPos}
              isEditing={isEditing}
              onAction={handleToolbarAction}
              onDismiss={dismissToolbar}
            />
          )}

          {/* SuggestionsBadge — fixed bottom-right overlay showing suggestion count */}
          <SuggestionsBadge
            pendingCount={pendingCount}
            isProcessing={!isComplete && data.inlineSuggestions.length === 0}
            processingStatus={null}
            allResolved={allResolved}
            onScrollToNext={scrollToNext}
            onExport={() => {
              // Export is handled by ResumeWorkspaceRail — scroll to it
              const rail = containerRef.current?.querySelector('[data-workspace-rail]');
              rail?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          />
        </>
      ) : (
        /* Processing layout (pipeline running, no resume yet) */
        <div className="mx-auto max-w-[720px] px-6 py-8">
          {/* Connection lost notice */}
          {!isComplete && !isConnected && data.stage !== 'intake' && (
            <div className="flex items-center gap-2 text-xs text-[#f0d99f]/70 mb-4" role="status">
              <AlertCircle className="h-3 w-3" />
              Connection lost — waiting to reconnect...
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-[#f0b8b8]/28 bg-[#f0b8b8]/[0.08] px-4 py-3 text-sm text-[#f0b8b8]/90 mb-4" role="alert">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Original scores card — suppressed; unified GapOverviewCard shows ATS data */}

          {/* Gap question flow — shown when coaching cards arrive, before resume generation.
              Replaces the staged processing viewer while questions are pending. */}
          {gapQuestions.length > 0 && !gapQuestionsSubmitted && !pipelinePastGaps ? (
            <GapQuestionFlow
              questions={gapQuestions}
              gapAnalysis={data.gapAnalysis}
              preScores={data.preScores}
              onComplete={handleGapQuestionsComplete}
              onAssist={onGapAssist}
            />
          ) : gapQuestionsSubmitted && !hasResume ? (
            <PostGapDebriefCard
              responses={gapResponses}
              stage={data.stage}
              isComplete={isComplete}
            />
          ) : (
            <LivePipelineCard data={data} isComplete={isComplete} />
          )}
        </div>
      )}
    </div>
  );
}

function getStageMessage(stage: V2Stage): string {
  switch (stage) {
    case 'intake': return 'Reading your background...';
    case 'analysis': return 'Reading the role, the benchmark, and the strongest proof already on your resume...';
    case 'strategy': return 'Building the requirement map and lining it up against the current resume...';
    case 'writing': return 'Improving one requirement at a time and drafting edits you can review inline...';
    case 'verification': return 'Running final review and checking tone, evidence, and accuracy...';
    case 'assembly': return 'Preparing the latest approved draft for export...';
    case 'complete': return 'Your polished resume is ready';
    default: return 'Working on it...';
  }
}

/** One-line status label shown in the processing status bar */
function getStageStatusLabel(stage: V2Stage, isComplete: boolean): string {
  if (isComplete) return 'Ready — review your suggestions below';
  switch (stage) {
    case 'intake':
    case 'analysis': return 'Reading your resume...';
    case 'strategy': return 'Building your positioning strategy...';
    case 'writing': return 'Drafting your resume...';
    case 'verification': return 'Running quality checks...';
    case 'assembly': return 'Preparing your suggestions...';
    case 'complete': return 'Ready — review your suggestions below';
    default: return 'Working on it...';
  }
}

/** 0–100 progress value for the processing status bar progress track */
function getStageProgressPercent(stage: V2Stage): number {
  switch (stage) {
    case 'intake': return 8;
    case 'analysis': return 25;
    case 'strategy': return 50;
    case 'writing': return 70;
    case 'verification': return 87;
    case 'assembly': return 95;
    case 'complete': return 100;
    default: return 0;
  }
}

// ─── PipelineAnalysisSummary ──────────────────────────────────────────────────
// Displays the detailed pipeline analysis data between the scores and resume.
// All sections are collapsed by default.

interface PipelineAnalysisSummaryProps {
  gapAnalysis: GapAnalysis | null;
  benchmarkCandidate: BenchmarkCandidate | null;
  narrativeStrategy: NarrativeStrategy | null;
  assembly: AssemblyResult | null;
  verificationDetail: VerificationDetail | null;
}

function AnalysisSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-lg shadow-[0_2px_12px_rgba(0,0,0,0.14)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-neutral-50 transition-colors"
        aria-expanded={open}
      >
        <span className="shrink-0 text-neutral-400">{icon}</span>
        <span className="flex-1 text-sm font-medium text-neutral-700">{title}</span>
        {open
          ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
          : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
        }
      </button>
      {open && (
        <div className="border-t border-neutral-100 px-5 py-4 space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}

function PipelineAnalysisSummary({
  gapAnalysis,
  benchmarkCandidate,
  narrativeStrategy,
  assembly,
  verificationDetail,
}: PipelineAnalysisSummaryProps) {
  const [showAllToneFindings, setShowAllToneFindings] = useState(false);
  const hasAnyData = gapAnalysis || benchmarkCandidate || narrativeStrategy || assembly || verificationDetail;
  if (!hasAnyData) return null;

  const truth = verificationDetail?.truth ?? null;
  const tone = verificationDetail?.tone ?? null;
  const ats = verificationDetail?.ats ?? assembly?.scores ?? null;

  return (
    <div className="space-y-2 mb-6" role="region" aria-label="Pipeline analysis summary">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 mb-3 px-1">
        Detailed Analysis
      </p>

      {/* Gap Analysis Summary */}
      {gapAnalysis && (
        <AnalysisSection
          title={`Gap Analysis — ${gapAnalysis.requirements.filter((r) => r.classification === 'strong').length} strong, ${gapAnalysis.requirements.filter((r) => r.classification === 'partial').length} partial, ${gapAnalysis.requirements.filter((r) => r.classification === 'missing').length} missing`}
          icon={<TrendingUp className="h-4 w-4" />}
        >
          {gapAnalysis.strength_summary && (
            <p className="text-[13px] text-neutral-600 leading-relaxed">{gapAnalysis.strength_summary}</p>
          )}
          {/* Counts */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Strong Match', count: gapAnalysis.requirements.filter((r) => r.classification === 'strong').length, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
              { label: 'Partial Match', count: gapAnalysis.requirements.filter((r) => r.classification === 'partial').length, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-100' },
              { label: 'Gap', count: gapAnalysis.requirements.filter((r) => r.classification === 'missing').length, color: 'text-red-500', bg: 'bg-red-50 border-red-100' },
            ].map(({ label, count, color, bg }) => (
              <div key={label} className={`rounded-lg border px-3 py-2 text-center ${bg}`}>
                <p className={`text-lg font-bold tabular-nums ${color}`}>{count}</p>
                <p className="text-[11px] text-neutral-500">{label}</p>
              </div>
            ))}
          </div>
          {/* Critical gaps */}
          {gapAnalysis.critical_gaps.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-neutral-400 mb-1.5">Critical gaps to address</p>
              <ul className="space-y-1">
                {gapAnalysis.critical_gaps.map((gap, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-neutral-600">
                    <X className="h-3 w-3 shrink-0 mt-0.5 text-red-400" />
                    {gap}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </AnalysisSection>
      )}

      {/* Benchmark Overview */}
      {benchmarkCandidate && (
        <AnalysisSection
          title="Benchmark Overview — What the ideal candidate looks like"
          icon={<Target className="h-4 w-4" />}
        >
          {benchmarkCandidate.ideal_profile_summary && (
            <p className="text-[13px] text-neutral-600 leading-relaxed">{benchmarkCandidate.ideal_profile_summary}</p>
          )}
          {benchmarkCandidate.differentiators.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-neutral-400 mb-1.5">Key differentiators expected</p>
              <ul className="space-y-1">
                {benchmarkCandidate.differentiators.map((d, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-neutral-600">
                    <span className="shrink-0 mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-400" />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </AnalysisSection>
      )}

      {/* Narrative Strategy */}
      {narrativeStrategy && (
        <AnalysisSection
          title="Narrative Strategy — Positioning angle and Why Me story"
          icon={<Lightbulb className="h-4 w-4" />}
        >
          {narrativeStrategy.primary_narrative && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-neutral-400 mb-1">Positioning Angle</p>
              <p className="text-[13px] font-medium text-blue-600 leading-relaxed">{narrativeStrategy.primary_narrative}</p>
            </div>
          )}
          {narrativeStrategy.why_me_concise && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-neutral-400 mb-1">Why Me</p>
              <p className="text-[13px] text-neutral-600 leading-relaxed italic">"{narrativeStrategy.why_me_concise}"</p>
            </div>
          )}
          {narrativeStrategy.supporting_themes.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-neutral-400 mb-1.5">Supporting themes</p>
              <div className="flex flex-wrap gap-1.5">
                {narrativeStrategy.supporting_themes.map((theme, i) => (
                  <span
                    key={i}
                    className="rounded-md px-2 py-0.5 text-[11px] text-blue-600 bg-blue-50 border border-blue-100"
                  >
                    {theme}
                  </span>
                ))}
              </div>
            </div>
          )}
        </AnalysisSection>
      )}

      {/* Verification Results */}
      {(truth || tone || ats) && (
        <AnalysisSection
          title={`Verification Results — Truth${truth ? ` ${truth.truth_score}/100` : ''}, Tone${tone ? ` ${tone.tone_score}/100` : ''}, ATS${assembly ? ` ${assembly.scores.ats_match}%` : ''}`}
          icon={<ShieldCheck className="h-4 w-4" />}
        >
          <div className="grid grid-cols-3 gap-2">
            {truth && (
              <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-center">
                <p className="text-lg font-bold tabular-nums text-blue-600">{truth.truth_score}</p>
                <p className="text-[11px] text-neutral-500">Truth Score</p>
                <p className="text-[10px] text-neutral-400 mt-0.5">
                  {truth.claims.filter((c) => c.confidence === 'verified').length} verified
                  {truth.flagged_items.length > 0 ? `, ${truth.flagged_items.length} flagged` : ''}
                </p>
              </div>
            )}
            {tone && (
              <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-center">
                <p className="text-lg font-bold tabular-nums text-amber-600">{tone.tone_score}</p>
                <p className="text-[11px] text-neutral-500">Tone Score</p>
                <p className="text-[10px] text-neutral-400 mt-0.5">
                  {tone.findings.length === 0 ? 'No issues' : `${tone.findings.length} finding${tone.findings.length !== 1 ? 's' : ''}`}
                </p>
              </div>
            )}
            {assembly && (
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-center">
                <p className="text-lg font-bold tabular-nums text-emerald-600">{assembly.scores.ats_match}%</p>
                <p className="text-[11px] text-neutral-500">ATS Match</p>
                <p className="text-[10px] text-neutral-400 mt-0.5">After optimization</p>
              </div>
            )}
          </div>
          {/* Claim breakdown */}
          {truth && truth.claims.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-neutral-400 mb-1.5">Claim breakdown ({truth.claims.length} total)</p>
              <div className="flex flex-wrap gap-2">
                {(['verified', 'plausible', 'unverified', 'fabricated'] as const).map((conf) => {
                  const count = truth.claims.filter((c) => c.confidence === conf).length;
                  if (count === 0) return null;
                  const color = conf === 'verified' ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
                    : conf === 'plausible' ? 'text-blue-600 bg-blue-50 border-blue-100'
                    : conf === 'unverified' ? 'text-amber-600 bg-amber-50 border-amber-100'
                    : 'text-red-500 bg-red-50 border-red-100';
                  return (
                    <span key={conf} className={`rounded-md px-2 py-0.5 text-[11px] border capitalize ${color}`}>
                      {count} {conf}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          {/* Tone findings count by type */}
          {tone && tone.findings.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-neutral-400 mb-1.5">Tone findings</p>
              <ul className="space-y-1">
                {(showAllToneFindings ? tone.findings : tone.findings.slice(0, 3)).map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-neutral-600">
                    <span className="shrink-0 mt-0.5 h-1.5 w-1.5 rounded-full bg-amber-400 mt-1" />
                    <span className="font-medium">{f.section}:</span> {f.issue ?? f.text}
                  </li>
                ))}
              </ul>
              {tone.findings.length > 3 && (
                <button
                  type="button"
                  onClick={() => setShowAllToneFindings((p) => !p)}
                  className="mt-1.5 flex items-center gap-1 text-[11px] text-neutral-400 hover:text-neutral-600 transition-colors cursor-pointer"
                >
                  {showAllToneFindings ? (
                    <><ChevronUp className="h-3 w-3" />Show fewer findings</>
                  ) : (
                    <><ChevronDown className="h-3 w-3" />Show all {tone.findings.length} findings</>
                  )}
                </button>
              )}
            </div>
          )}
        </AnalysisSection>
      )}
    </div>
  );
}

// ─── CollapsibleWorkspaceRail ─────────────────────────────────────────────────
// Wraps the ResumeWorkspaceRail in a collapsible section defaulting to closed.
// Shows only a thin "Export & Details" toggle bar when collapsed.

function CollapsibleWorkspaceRail({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mt-4 rounded-xl border border-[var(--line-soft)] overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-1)] transition-colors"
        aria-expanded={isOpen}
        aria-controls="workspace-rail-content"
      >
        <span className="font-medium tracking-wide uppercase">Export &amp; Details</span>
        {isOpen ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        )}
      </button>
      {isOpen && (
        <div id="workspace-rail-content">
          {children}
        </div>
      )}
    </div>
  );
}
