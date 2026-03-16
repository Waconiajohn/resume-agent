import { useState, useMemo } from 'react';
import {
  CheckCircle2,
  Shuffle,
  XCircle,
  CircleDot,
  ChevronDown,
  Lightbulb,
  Ruler,
  MessageSquare,
} from 'lucide-react';
import type {
  JobIntelligence,
  BenchmarkCandidate,
  PositioningAssessment,
  GapAnalysis,
  GapCoachingCard,
  ResumeDraft,
  RequirementGap,
} from '@/types/resume-v2';
import type { EditAction, EditContext } from '@/hooks/useInlineEdit';
import { importanceLabel, importanceStyle } from '../cards/shared-badges';
import {
  normalizeRequirement,
  findBulletForRequirement,
  buildEditContext,
  buildCoachingLookup,
} from '../utils/coaching-actions';

// ─── Props ──────────────────────────────────────────────────────────────────────

interface RequirementsChecklistPanelProps {
  jobIntelligence: JobIntelligence;
  benchmarkCandidate: BenchmarkCandidate | null;
  positioningAssessment: PositioningAssessment | null;
  gapAnalysis: GapAnalysis;
  /** Currently selected bullet's requirements — highlight these */
  activeRequirements: string[];
  /** Callback when user clicks a requirement to scroll to the addressing bullet */
  onRequirementClick: (requirement: string) => void;
  /** Gap coaching cards from the gap analysis agent (optional — enables coaching drawer) */
  gapCoachingCards?: GapCoachingCard[] | null;
  /** Callback for inline editing actions (optional — enables action buttons) */
  onRequestEdit?: (selectedText: string, section: string, action: EditAction, customInstruction?: string, editContext?: EditContext) => void;
  /** Current resume for finding target bullets (optional — required for edit actions) */
  currentResume?: ResumeDraft | null;
  /** Whether an edit is in progress (disables action buttons) */
  isEditing?: boolean;
}

// ─── Importance groups ───────────────────────────────────────────────────────

const IMPORTANCE_ORDER = ['must_have', 'important', 'nice_to_have'] as const;
type Importance = (typeof IMPORTANCE_ORDER)[number];

// ─── Status icon ─────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: 'strong' | 'repositioned' | 'gap' | 'partial' }) {
  switch (status) {
    case 'strong':
      return <CheckCircle2 className="h-3.5 w-3.5 shrink-0" style={{ color: '#b5dec2' }} aria-hidden="true" />;
    case 'repositioned':
      return <Shuffle className="h-3.5 w-3.5 shrink-0" style={{ color: '#afc4ff' }} aria-hidden="true" />;
    case 'gap':
      return <XCircle className="h-3.5 w-3.5 shrink-0" style={{ color: '#f0b8b8' }} aria-hidden="true" />;
    case 'partial':
      return <CircleDot className="h-3.5 w-3.5 shrink-0" style={{ color: '#f0d99f' }} aria-hidden="true" />;
  }
}

// ─── Importance group header ──────────────────────────────────────────────────

function GroupHeader({ importance, count }: { importance: Importance; count: number }) {
  const style = importanceStyle(importance);
  return (
    <div className="flex items-center gap-2 mb-2 mt-1">
      <span
        className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide shrink-0"
        style={style}
      >
        {importanceLabel(importance)}
      </span>
      <div className="flex-1 h-px" style={{ backgroundColor: style.borderColor }} />
      <span className="text-[10px] tabular-nums text-white/30">{count}</span>
    </div>
  );
}

// ─── Benchmark context lookup ─────────────────────────────────────────────────

/** Tokenize a string into lowercase words (strips punctuation) */
function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
}

function findBenchmarkContext(
  requirement: string,
  expectedAchievements: BenchmarkCandidate['expected_achievements'],
): string | null {
  const needleTokens = tokenize(requirement);
  // D2: Require ≥2 overlapping words to avoid false positives
  const match = expectedAchievements.find((a) => {
    const areaTokens = tokenize(a.area);
    const overlap = areaTokens.filter((t) => needleTokens.includes(t)).length;
    return overlap >= 2 || a.area.toLowerCase() === requirement.toLowerCase();
  });
  return match ? match.description : null;
}

// ─── Status line ──────────────────────────────────────────────────────────────

function StatusLine({
  status,
  addressedBy,
  strategyUsed,
}: {
  status: 'strong' | 'repositioned' | 'gap';
  addressedBy: Array<{ section: string; bullet_text: string }>;
  strategyUsed?: string;
}) {
  if (status === 'gap') {
    return (
      <span className="text-[10px] font-medium tracking-wide" style={{ color: '#f0b8b8' }}>
        GAP — Not addressed in resume
      </span>
    );
  }

  if (status === 'repositioned' && strategyUsed) {
    return (
      <span className="text-[10px] leading-snug" style={{ color: '#afc4ff' }}>
        Repositioned: {strategyUsed}
      </span>
    );
  }

  if (addressedBy.length > 0) {
    const first = addressedBy[0];
    const snippet =
      first.bullet_text.length > 80
        ? first.bullet_text.slice(0, 80).trimEnd() + '…'
        : first.bullet_text;
    return (
      <span className="text-[10px] text-white/45 leading-snug">
        Addressed by:{' '}
        <span className="text-white/60 italic">&ldquo;{snippet}&rdquo;</span>
        {' '}in{' '}
        <span
          className="rounded px-1 py-px text-[9px] font-medium not-italic"
          style={{
            color: 'rgba(255,255,255,0.50)',
            backgroundColor: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {first.section}
        </span>
      </span>
    );
  }

  return null;
}

// ─── Coaching drawer (expanded content below a requirement row) ──────────────

function CoachingDrawer({
  coaching,
  gapReq,
  status,
  onRequestEdit,
  currentResume,
  positioningAssessment,
  isEditing,
}: {
  coaching: GapCoachingCard | undefined;
  gapReq: RequirementGap | undefined;
  status: 'strong' | 'repositioned' | 'gap';
  onRequestEdit?: RequirementsChecklistPanelProps['onRequestEdit'];
  currentResume?: ResumeDraft | null;
  positioningAssessment: PositioningAssessment | null;
  isEditing?: boolean;
}) {
  const [contextText, setContextText] = useState('');
  const [showContextInput, setShowContextInput] = useState(false);

  const requirement = coaching?.requirement ?? gapReq?.requirement ?? '';
  const evidence = coaching?.evidence_found ?? gapReq?.evidence ?? [];
  const strategy = gapReq?.strategy;
  const canAct = onRequestEdit && currentResume && !isEditing;

  // Determine classification-based accent color
  const classification = coaching?.classification ?? gapReq?.classification ?? 'missing';
  const accentColor = classification === 'strong' ? '#b5dec2' : classification === 'partial' ? '#afc4ff' : '#f0b8b8';

  const handleApplyStrategy = () => {
    if (!canAct || !strategy) return;
    const target = findBulletForRequirement(requirement, positioningAssessment, currentResume!);
    if (!target) return;
    const label = status === 'gap' ? 'safe resume language' : 'positioning';
    onRequestEdit!(
      target.text,
      target.section,
      'custom',
      `Naturally weave this ${label} into the text: "${strategy.positioning}". This addresses the job requirement: "${requirement}".`,
      buildEditContext(requirement, evidence, strategy.positioning),
    );
  };

  const handleStrengthen = () => {
    if (!canAct) return;
    const target = findBulletForRequirement(requirement, positioningAssessment, currentResume!);
    if (!target) return;
    onRequestEdit!(target.text, target.section, 'strengthen', undefined, buildEditContext(requirement, evidence, strategy?.positioning));
  };

  const handleAddMetrics = () => {
    if (!canAct) return;
    const target = findBulletForRequirement(requirement, positioningAssessment, currentResume!);
    if (!target) return;
    onRequestEdit!(target.text, target.section, 'add_metrics', undefined, buildEditContext(requirement, evidence, strategy?.positioning));
  };

  const handleSubmitContext = () => {
    if (!canAct || !contextText.trim()) return;
    const target = findBulletForRequirement(requirement, positioningAssessment, currentResume!);
    if (!target) return;
    onRequestEdit!(
      target.text,
      target.section,
      'custom',
      `The user provided this additional context about their experience for the requirement "${requirement}": "${contextText.trim()}". Rewrite this bullet to naturally incorporate this context.`,
      buildEditContext(requirement, evidence, strategy?.positioning),
    );
    setContextText('');
    setShowContextInput(false);
  };

  // Nothing to show if no coaching data and no gap requirement data
  if (!coaching && !gapReq) return null;

  return (
    <div className="px-3 pb-3 space-y-2.5" data-testid="coaching-drawer">
      {/* Evidence chips */}
      {evidence.length > 0 && (
        <div>
          <div className="text-[9px] font-semibold text-white/30 uppercase tracking-wider mb-1.5">
            Your Relevant Experience
          </div>
          <div className="flex flex-wrap gap-1">
            {evidence.map((e, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-white/60 bg-white/[0.05] border border-white/[0.10]"
              >
                <CheckCircle2 className="h-2.5 w-2.5 text-[#b5dec2]/60 shrink-0" />
                {e}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* AI Reasoning bubble */}
      {coaching?.ai_reasoning && (
        <div className="flex gap-2.5">
          <div className="shrink-0 mt-0.5">
            <div className="h-6 w-6 rounded-full bg-[#afc4ff]/15 border border-[#afc4ff]/30 flex items-center justify-center">
              <span className="text-[8px] font-bold text-[#afc4ff] tracking-tight leading-none">AI</span>
            </div>
          </div>
          <div className="flex-1 rounded-lg border border-[#afc4ff]/[0.12] bg-[#afc4ff]/[0.05] px-3 py-2">
            <p className="text-[12px] text-white/70 leading-[1.6]">{coaching.ai_reasoning}</p>
          </div>
        </div>
      )}

      {/* Strategy card */}
      {strategy?.positioning && (
        <div
          className="relative rounded-lg border bg-white/[0.03] pl-3.5 pr-2.5 py-2 overflow-hidden"
          style={{ borderColor: `${accentColor}20` }}
        >
          <div
            className="absolute left-0 inset-y-0 w-[2px] rounded-l-lg"
            style={{ background: `linear-gradient(to bottom, ${accentColor}, transparent)` }}
          />
          <div className="flex items-center gap-1.5 mb-1">
            <Lightbulb className="h-3 w-3 shrink-0" style={{ color: `${accentColor}B3` }} />
            <span
              className="text-[9px] font-semibold uppercase tracking-wider"
              style={{ color: `${accentColor}B3` }}
            >
              {status === 'gap' ? 'Safe Resume Language' : 'Suggested Language'}
            </span>
          </div>
          <p className="text-[12px] text-white/70 leading-relaxed">{strategy.positioning}</p>
        </div>
      )}

      {/* Inferred metrics */}
      {(coaching?.inferred_metric || strategy?.inferred_metric) && (
        <div className="flex items-start gap-1.5 px-1">
          <Ruler className="h-3 w-3 text-[#f0d99f]/60 shrink-0 mt-0.5" />
          <div>
            <span className="text-[11px] text-[#f0d99f]/80">
              {coaching?.inferred_metric ?? strategy?.inferred_metric}
            </span>
            {(coaching?.inference_rationale || strategy?.inference_rationale) && (
              <span className="text-[11px] text-white/30 ml-1">
                — {coaching?.inference_rationale ?? strategy?.inference_rationale}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Context input */}
      {showContextInput && (
        <div className="space-y-2">
          <textarea
            value={contextText}
            onChange={(e) => setContextText(e.target.value)}
            placeholder="Share relevant experience, projects, or context not in your resume..."
            rows={3}
            className="w-full rounded-lg border border-[#afc4ff]/20 bg-[#afc4ff]/[0.04] px-2.5 py-2 text-[12px] text-white/80 placeholder-white/25 resize-none focus:outline-none focus:border-[#afc4ff]/40 transition-colors"
            aria-label={`Additional context for: ${requirement}`}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!contextText.trim() || isEditing}
              onClick={handleSubmitContext}
              className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium bg-[#afc4ff]/10 text-[#afc4ff] border border-[#afc4ff]/20 hover:bg-[#afc4ff]/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              data-testid="submit-context"
            >
              Submit & Rewrite
            </button>
            <button
              type="button"
              onClick={() => { setShowContextInput(false); setContextText(''); }}
              className="text-[11px] text-white/35 hover:text-white/55 transition-colors px-1"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {canAct && (
        <div className="flex items-center gap-1.5 flex-wrap" data-testid="coaching-actions">
          {status === 'strong' && (
            <>
              <button
                type="button"
                onClick={handleStrengthen}
                className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium bg-[#b5dec2]/10 text-[#b5dec2] border border-[#b5dec2]/20 hover:bg-[#b5dec2]/20 transition-colors"
                data-testid="action-strengthen"
              >
                <CheckCircle2 className="h-3 w-3" />
                Strengthen
              </button>
              <button
                type="button"
                onClick={handleAddMetrics}
                className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium bg-[#f0d99f]/10 text-[#f0d99f] border border-[#f0d99f]/20 hover:bg-[#f0d99f]/20 transition-colors"
                data-testid="action-add-metrics"
              >
                <Ruler className="h-3 w-3" />
                Add Metrics
              </button>
            </>
          )}

          {status === 'repositioned' && (
            <>
              <button
                type="button"
                onClick={handleStrengthen}
                className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium bg-[#b5dec2]/10 text-[#b5dec2] border border-[#b5dec2]/20 hover:bg-[#b5dec2]/20 transition-colors"
                data-testid="action-strengthen"
              >
                <CheckCircle2 className="h-3 w-3" />
                Strengthen
              </button>
              {strategy?.positioning && (
                <button
                  type="button"
                  onClick={handleApplyStrategy}
                  className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium bg-[#afc4ff]/10 text-[#afc4ff] border border-[#afc4ff]/20 hover:bg-[#afc4ff]/20 transition-colors"
                  data-testid="action-refine-positioning"
                >
                  <Lightbulb className="h-3 w-3" />
                  Refine Positioning
                </button>
              )}
            </>
          )}

          {status === 'gap' && strategy?.positioning && (
            <button
              type="button"
              onClick={handleApplyStrategy}
              className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium bg-[#afc4ff]/10 text-[#afc4ff] border border-[#afc4ff]/20 hover:bg-[#afc4ff]/20 transition-colors"
              data-testid="action-apply-strategy"
            >
              <Lightbulb className="h-3 w-3" />
              Apply Safe Language
            </button>
          )}

          {!showContextInput && (
            <button
              type="button"
              onClick={() => setShowContextInput(true)}
              className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium bg-white/[0.04] text-white/50 border border-white/[0.08] hover:bg-white/[0.07] hover:text-white/70 transition-colors"
              data-testid="action-add-context"
            >
              <MessageSquare className="h-3 w-3" />
              Add My Context
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Individual requirement row ───────────────────────────────────────────────

interface RequirementRowProps {
  requirement: string;
  importance: Importance;
  status: 'strong' | 'repositioned' | 'gap';
  addressedBy: Array<{ section: string; bullet_text: string }>;
  strategyUsed?: string;
  benchmarkContext: string | null;
  isActive: boolean;
  onClick: () => void;
  /** Coaching data for this requirement (enables expandable drawer) */
  coaching?: GapCoachingCard;
  /** Gap requirement data (for strategy/evidence) */
  gapReq?: RequirementGap;
  /** Props passed through for coaching drawer actions */
  onRequestEdit?: RequirementsChecklistPanelProps['onRequestEdit'];
  currentResume?: ResumeDraft | null;
  positioningAssessment?: PositioningAssessment | null;
  isEditing?: boolean;
}

function RequirementRow({
  requirement,
  importance,
  status,
  addressedBy,
  strategyUsed,
  benchmarkContext,
  isActive,
  onClick,
  coaching,
  gapReq,
  onRequestEdit,
  currentResume,
  positioningAssessment,
  isEditing,
}: RequirementRowProps) {
  const [expanded, setExpanded] = useState(false);
  const hasDrawer = !!(coaching || gapReq);

  const handleHeaderClick = () => {
    if (hasDrawer) {
      setExpanded((prev) => {
        // Only scroll to bullet on expand, not on collapse
        if (!prev) onClick();
        return !prev;
      });
    } else {
      onClick();
    }
  };

  return (
    <div
      data-requirement-row={requirement}
      className={[
        'rounded-lg transition-all duration-200 overflow-hidden',
        'border',
        isActive
          ? 'border-[#afc4ff]/40 bg-[#afc4ff]/[0.06]'
          : 'border-white/[0.06] bg-white/[0.01]',
      ].join(' ')}
      style={
        isActive
          ? { boxShadow: '0 0 0 2px rgba(175,196,255,0.40)' }
          : undefined
      }
    >
      <button
        type="button"
        onClick={handleHeaderClick}
        className="w-full text-left px-3 py-2.5 cursor-pointer hover:bg-white/[0.04] transition-colors"
        aria-pressed={isActive}
        aria-expanded={hasDrawer ? expanded : undefined}
      >
        {/* Top row: chevron + icon + text + importance badge */}
        <div className="flex items-start gap-2 mb-1.5">
          {hasDrawer && (
            <ChevronDown
              className={[
                'h-3 w-3 text-white/30 shrink-0 mt-0.5 transition-transform duration-200',
                expanded ? 'rotate-0' : '-rotate-90',
              ].join(' ')}
              aria-hidden="true"
            />
          )}
          <div className="mt-0.5">
            <StatusIcon status={status} />
          </div>
          <span className="flex-1 min-w-0 text-xs text-white/80 leading-snug">
            {requirement}
          </span>
          <span
            className="rounded-full px-1.5 py-0.5 text-[9px] font-medium shrink-0"
            style={importanceStyle(importance)}
          >
            {importanceLabel(importance)}
          </span>
        </div>

        {/* Benchmark context */}
        {benchmarkContext && (
          <div
            className="ml-5 mb-1.5 rounded px-2 py-1"
            style={{
              backgroundColor: 'rgba(255,255,255,0.03)',
              borderLeft: '2px solid rgba(255,255,255,0.10)',
            }}
          >
            <span className="text-[9px] uppercase tracking-wide font-medium text-white/30 block mb-0.5">
              Benchmark
            </span>
            <span className="text-[10px] text-white/45 leading-snug">{benchmarkContext}</span>
          </div>
        )}

        {/* Status line */}
        <div className="ml-5">
          <StatusLine status={status} addressedBy={addressedBy} strategyUsed={strategyUsed} />
        </div>
      </button>

      {/* Expandable coaching drawer */}
      {hasDrawer && (
        <div
          className={[
            'overflow-hidden transition-all duration-300',
            expanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0',
          ].join(' ')}
        >
          <div className="border-t border-white/[0.04]">
            <CoachingDrawer
              coaching={coaching}
              gapReq={gapReq}
              status={status}
              onRequestEdit={onRequestEdit}
              currentResume={currentResume}
              positioningAssessment={positioningAssessment ?? null}
              isEditing={isEditing}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Progress summary bar ─────────────────────────────────────────────────────

// D3: Accept pre-computed counts from displayed items (not requirement_map which may differ)
function ProgressSummary({
  strongCount,
  repoCount,
  gapCount,
}: {
  strongCount: number;
  repoCount: number;
  gapCount: number;
}) {
  const total = strongCount + repoCount + gapCount;
  if (total === 0) return null;

  const addressedCount = strongCount + repoCount;

  const strongPct = (strongCount / total) * 100;
  const repoPct = (repoCount / total) * 100;
  const gapPct = (gapCount / total) * 100;

  return (
    <div
      className="px-4 py-3 border-t shrink-0"
      style={{ borderColor: 'rgba(255,255,255,0.06)', backgroundColor: 'rgba(0,0,0,0.15)' }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-white/40 font-medium">
          {addressedCount} of {total} requirements addressed
        </span>
        <span className="text-[10px] tabular-nums text-white/30">
          {Math.round((addressedCount / total) * 100)}%
        </span>
      </div>

      {/* Stacked progress bar */}
      <div className="h-1.5 w-full rounded-full overflow-hidden flex" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
        {strongPct > 0 && (
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${strongPct}%`, backgroundColor: '#b5dec2' }}
            title={`${strongCount} strong match${strongCount !== 1 ? 'es' : ''}`}
          />
        )}
        {repoPct > 0 && (
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${repoPct}%`, backgroundColor: '#afc4ff' }}
            title={`${repoCount} repositioned`}
          />
        )}
        {gapPct > 0 && (
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${gapPct}%`, backgroundColor: 'rgba(240,184,184,0.40)' }}
            title={`${gapCount} gap${gapCount !== 1 ? 's' : ''}`}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-1.5">
        {strongCount > 0 && (
          <span className="flex items-center gap-1 text-[9px]" style={{ color: '#b5dec2' }}>
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: '#b5dec2' }} />
            {strongCount} strong
          </span>
        )}
        {repoCount > 0 && (
          <span className="flex items-center gap-1 text-[9px]" style={{ color: '#afc4ff' }}>
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: '#afc4ff' }} />
            {repoCount} repositioned
          </span>
        )}
        {gapCount > 0 && (
          <span className="flex items-center gap-1 text-[9px]" style={{ color: '#f0b8b8' }}>
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: '#f0b8b8' }} />
            {gapCount} gap{gapCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function RequirementsChecklistPanel({
  jobIntelligence,
  benchmarkCandidate,
  positioningAssessment,
  gapAnalysis,
  activeRequirements,
  onRequirementClick,
  gapCoachingCards,
  onRequestEdit,
  currentResume,
  isEditing,
}: RequirementsChecklistPanelProps) {
  // Build a fast lookup from requirement text → positioning assessment entry
  const requirementMap = positioningAssessment?.requirement_map ?? [];
  const assessmentMap = new Map(
    requirementMap.map((entry) => [
      entry.requirement.trim().toLowerCase(),
      entry,
    ]),
  );

  // D1: Fuzzy fallback — when exact match fails, find by token overlap
  const fuzzyLookup = (key: string) => {
    const exact = assessmentMap.get(key);
    if (exact) return exact;
    const keyTokens = tokenize(key);
    if (keyTokens.length === 0) return undefined;
    let bestEntry: (typeof requirementMap)[number] | undefined;
    let bestOverlap = 0;
    for (const entry of requirementMap) {
      const entryTokens = tokenize(entry.requirement);
      const overlap = keyTokens.filter((t) => entryTokens.includes(t)).length;
      const score = overlap / Math.max(keyTokens.length, entryTokens.length);
      if (overlap >= 2 && score > 0.5 && overlap > bestOverlap) {
        bestOverlap = overlap;
        bestEntry = entry;
      }
    }
    return bestEntry;
  };

  // Build coaching lookup for matching gap coaching cards to requirements
  const coachingLookup = useMemo(
    () => buildCoachingLookup(gapCoachingCards ?? null),
    [gapCoachingCards],
  );

  // Build gap analysis requirement lookup for strategy/evidence data
  const gapReqLookup = useMemo(() => {
    const map = new Map<string, RequirementGap>();
    for (const req of gapAnalysis.requirements) {
      map.set(normalizeRequirement(req.requirement), req);
    }
    return map;
  }, [gapAnalysis]);

  // Normalize active requirements for case-insensitive matching
  const activeSet = new Set(activeRequirements.map((r) => r.trim().toLowerCase()));

  // Group core competencies by importance
  const grouped = IMPORTANCE_ORDER.reduce<
    Record<Importance, typeof jobIntelligence.core_competencies>
  >(
    (acc, imp) => {
      acc[imp] = jobIntelligence.core_competencies.filter((c) => c.importance === imp);
      return acc;
    },
    { must_have: [], important: [], nice_to_have: [] },
  );

  return (
    <div
      className="flex flex-col h-full"
      data-testid="requirements-checklist"
      style={{
        background: 'rgba(10,12,20,0.85)',
        backdropFilter: 'blur(12px)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 shrink-0 border-b"
        style={{ borderColor: 'rgba(255,255,255,0.06)', backgroundColor: 'rgba(0,0,0,0.10)' }}
      >
        <h2 className="text-xs font-semibold text-white/70 uppercase tracking-wide">
          Requirements Checklist
        </h2>
        {jobIntelligence.role_title && (
          <p className="text-[10px] text-white/40 mt-0.5 truncate">
            {jobIntelligence.role_title}
            {jobIntelligence.company_name ? ` — ${jobIntelligence.company_name}` : ''}
          </p>
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 min-h-0">
        {IMPORTANCE_ORDER.map((importance) => {
          const competencies = grouped[importance];
          if (competencies.length === 0) return null;

          return (
            <section key={importance}>
              <GroupHeader importance={importance} count={competencies.length} />
              <div className="space-y-1.5">
                {competencies.map((competency) => {
                  const key = competency.competency.trim().toLowerCase();
                  const assessmentEntry = fuzzyLookup(key);
                  const status = assessmentEntry?.status ?? 'gap';
                  const addressedBy = assessmentEntry?.addressed_by ?? [];
                  const strategyUsed = assessmentEntry?.strategy_used;
                  const benchmarkContext = benchmarkCandidate
                    ? findBenchmarkContext(competency.competency, benchmarkCandidate.expected_achievements)
                    : null;
                  const isActive = activeSet.has(key);
                  const normalizedKey = normalizeRequirement(competency.competency);
                  const coaching = coachingLookup.get(normalizedKey)?.card;
                  const gapReq = gapReqLookup.get(normalizedKey);

                  return (
                    <RequirementRow
                      key={competency.competency}
                      requirement={competency.competency}
                      importance={importance}
                      status={status}
                      addressedBy={addressedBy}
                      strategyUsed={strategyUsed}
                      benchmarkContext={benchmarkContext}
                      isActive={isActive}
                      onClick={() => onRequirementClick(competency.competency)}
                      coaching={coaching}
                      gapReq={gapReq}
                      onRequestEdit={onRequestEdit}
                      currentResume={currentResume}
                      positioningAssessment={positioningAssessment}
                      isEditing={isEditing}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}

        {/* Gap-only requirements not in core_competencies (sourced from gap analysis) */}
        {(() => {
          const coveredKeys = new Set(
            jobIntelligence.core_competencies.map((c) => c.competency.trim().toLowerCase()),
          );
          const extraGaps = gapAnalysis.requirements.filter(
            (req) =>
              req.classification === 'missing' &&
              !coveredKeys.has(req.requirement.trim().toLowerCase()),
          );
          if (extraGaps.length === 0) return null;

          return (
            <section>
              <div className="flex items-center gap-2 mb-2 mt-1">
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide shrink-0"
                  style={{
                    color: '#f0b8b8',
                    backgroundColor: 'rgba(240,184,184,0.10)',
                    border: '1px solid rgba(240,184,184,0.20)',
                  }}
                >
                  Additional Gaps
                </span>
                <div
                  className="flex-1 h-px"
                  style={{ backgroundColor: 'rgba(240,184,184,0.15)' }}
                />
                <span className="text-[10px] tabular-nums text-white/30">{extraGaps.length}</span>
              </div>
              <div className="space-y-1.5">
                {extraGaps.map((req) => {
                  const key = req.requirement.trim().toLowerCase();
                  const isActive = activeSet.has(key);
                  const normalizedKey = normalizeRequirement(req.requirement);
                  const coaching = coachingLookup.get(normalizedKey)?.card;
                  return (
                    <RequirementRow
                      key={req.requirement}
                      requirement={req.requirement}
                      importance={req.importance}
                      status="gap"
                      addressedBy={[]}
                      benchmarkContext={benchmarkCandidate
                        ? findBenchmarkContext(req.requirement, benchmarkCandidate.expected_achievements)
                        : null}
                      isActive={isActive}
                      onClick={() => onRequirementClick(req.requirement)}
                      coaching={coaching}
                      gapReq={req}
                      onRequestEdit={onRequestEdit}
                      currentResume={currentResume}
                      positioningAssessment={positioningAssessment}
                      isEditing={isEditing}
                    />
                  );
                })}
              </div>
            </section>
          );
        })()}
      </div>

      {/* Bottom progress summary — computed from displayed items */}
      {(() => {
        const allCompetencies = jobIntelligence.core_competencies;
        let strong = 0, repo = 0, gap = 0;
        for (const c of allCompetencies) {
          const entry = fuzzyLookup(c.competency.trim().toLowerCase());
          const s = entry?.status ?? 'gap';
          if (s === 'strong') strong++;
          else if (s === 'repositioned') repo++;
          else gap++;
        }
        // Count extra gaps from gap analysis
        const coveredKeys = new Set(allCompetencies.map((c) => c.competency.trim().toLowerCase()));
        const extraGapCount = gapAnalysis.requirements.filter(
          (r) => r.classification === 'missing' && !coveredKeys.has(r.requirement.trim().toLowerCase()),
        ).length;
        gap += extraGapCount;
        const total = strong + repo + gap;
        if (total === 0) return null;
        return <ProgressSummary strongCount={strong} repoCount={repo} gapCount={gap} />;
      })()}
    </div>
  );
}
