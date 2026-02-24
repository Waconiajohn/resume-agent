import { useState, useRef, useCallback, useEffect } from 'react';
import {
  AlertTriangle, Layers, Target, BarChart2, Zap, Compass, Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SectionSuggestion, SuggestionIntent } from '@/types/panels';

interface WorkbenchSuggestionsProps {
  suggestions: SectionSuggestion[];
  content: string;
  onApplySuggestion: (suggestionId: string) => void;
  onSkipSuggestion: (suggestionId: string, reason?: string) => void;
  disabled: boolean;
}

const INTENT_ICONS: Record<SuggestionIntent, React.ReactNode> = {
  address_requirement: <AlertTriangle className="h-3.5 w-3.5" />,
  weave_evidence: <Layers className="h-3.5 w-3.5" />,
  integrate_keyword: <Target className="h-3.5 w-3.5" />,
  quantify_bullet: <BarChart2 className="h-3.5 w-3.5" />,
  tighten: <Zap className="h-3.5 w-3.5" />,
  strengthen_verb: <Zap className="h-3.5 w-3.5" />,
  align_positioning: <Compass className="h-3.5 w-3.5" />,
};

const INTENT_LABELS: Record<SuggestionIntent, string> = {
  address_requirement: 'Requirement Gap',
  weave_evidence: 'Evidence',
  integrate_keyword: 'Keyword',
  quantify_bullet: 'Metrics',
  tighten: 'Tighten',
  strengthen_verb: 'Language',
  align_positioning: 'Positioning',
};

const SKIP_REASON_PRESETS = [
  "Not applicable to my experience",
  "Already addressed elsewhere",
  "Not relevant to this role",
];

function checkResolved(suggestion: SectionSuggestion, content: string): boolean {
  const { resolved_when } = suggestion;
  if (resolved_when.type === 'always_recheck') return false;

  const lowerContent = content.toLowerCase();
  const targetId = resolved_when.target_id;

  if (resolved_when.type === 'keyword_present') {
    return lowerContent.includes(targetId.toLowerCase());
  }

  if (
    resolved_when.type === 'evidence_referenced' ||
    resolved_when.type === 'requirement_addressed'
  ) {
    const keywords = targetId
      .split(/\s+/)
      .filter((w) => w.length > 4)
      .map((w) => w.toLowerCase());
    if (keywords.length === 0) return false;
    return keywords.some((kw) => lowerContent.includes(kw));
  }

  return false;
}

export function WorkbenchSuggestions({
  suggestions,
  content,
  onApplySuggestion,
  onSkipSuggestion,
  disabled,
}: WorkbenchSuggestionsProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [slideDir, setSlideDir] = useState<'in' | 'out' | 'resolved' | null>('in');
  const [showSkipReason, setShowSkipReason] = useState(false);
  const [skipReasonInput, setSkipReasonInput] = useState('');
  const [resolvedAnimId, setResolvedAnimId] = useState<string | null>(null);

  const dismissedIdsRef = useRef<Set<string>>(new Set());
  const animationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeSuggestions = suggestions.filter(
    (s) => !dismissedIdsRef.current.has(s.id),
  );

  const currentSuggestion = activeSuggestions[currentIndex] ?? activeSuggestions[0] ?? null;

  // Client-side resolution checking
  useEffect(() => {
    if (!content || activeSuggestions.length === 0) return;

    for (const suggestion of activeSuggestions) {
      if (dismissedIdsRef.current.has(suggestion.id)) continue;
      if (checkResolved(suggestion, content)) {
        setResolvedAnimId(suggestion.id);
        const timer = setTimeout(() => {
          dismissedIdsRef.current.add(suggestion.id);
          setResolvedAnimId(null);
          setCurrentIndex((prev) => {
            const newActive = suggestions.filter(
              (s) => !dismissedIdsRef.current.has(s.id),
            );
            return Math.min(prev, Math.max(0, newActive.length - 1));
          });
          setSlideDir('in');
        }, 400);
        return () => clearTimeout(timer);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  const advance = useCallback(() => {
    const newActive = suggestions.filter(
      (s) => !dismissedIdsRef.current.has(s.id),
    );
    setCurrentIndex((prev) => Math.min(prev, Math.max(0, newActive.length - 1)));
    setSlideDir('in');
    setShowSkipReason(false);
    setSkipReasonInput('');
  }, [suggestions]);

  const handleApply = useCallback(() => {
    if (!currentSuggestion || disabled) return;
    onApplySuggestion(currentSuggestion.id);
    dismissedIdsRef.current.add(currentSuggestion.id);
    setSlideDir('out');
    if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
    animationTimerRef.current = setTimeout(advance, 200);
  }, [currentSuggestion, disabled, onApplySuggestion, advance]);

  const handleSkipConfirm = useCallback(
    (reason?: string) => {
      if (!currentSuggestion || disabled) return;
      onSkipSuggestion(currentSuggestion.id, reason);
      dismissedIdsRef.current.add(currentSuggestion.id);
      setSlideDir('out');
      if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
      animationTimerRef.current = setTimeout(advance, 200);
    },
    [currentSuggestion, disabled, onSkipSuggestion, advance],
  );

  const handleSkip = useCallback(() => {
    if (!currentSuggestion || disabled) return;
    const isHighGap =
      currentSuggestion.priority_tier === 'high' &&
      currentSuggestion.intent === 'address_requirement';
    if (isHighGap) {
      setShowSkipReason(true);
    } else {
      handleSkipConfirm();
    }
  }, [currentSuggestion, disabled, handleSkipConfirm]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
    };
  }, []);

  // All addressed state
  if (activeSuggestions.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-4">
        <Check
          className={cn('h-4 w-4 text-emerald-400/70', 'suggestion-resolved')}
        />
        <span className="text-xs text-white/40">All suggestions addressed</span>
      </div>
    );
  }

  if (!currentSuggestion) return null;

  const isHighPriority = currentSuggestion.priority_tier === 'high';
  const isResolvedAnim = resolvedAnimId === currentSuggestion.id;
  const applyOption = currentSuggestion.options.find((o) => o.action === 'apply');
  const applyLabel = applyOption?.label ?? 'Apply';
  const total = activeSuggestions.length;
  const displayIndex = activeSuggestions.indexOf(currentSuggestion) + 1;

  return (
    <div
      key={currentSuggestion.id}
      className={cn(
        'rounded-2xl border border-white/[0.1] bg-white/[0.03] p-5',
        isHighPriority && 'border-l-2 border-l-[#98b3ff]',
        isResolvedAnim ? 'suggestion-resolved' : slideDir === 'out' ? 'suggestion-slide-out' : 'suggestion-slide-in',
      )}
    >
      {/* Header row: intent icon + label + counter */}
      <div className="flex items-center gap-2">
        <span className="text-white/50">
          {INTENT_ICONS[currentSuggestion.intent]}
        </span>
        <span className="text-xs font-medium uppercase tracking-wide text-white/50">
          {INTENT_LABELS[currentSuggestion.intent]}
        </span>
        <span className="ml-auto text-xs text-white/40">
          {displayIndex} of {total}
        </span>
      </div>

      {/* Question text */}
      <p className="mt-3 text-sm leading-relaxed text-white/80">
        {currentSuggestion.question_text}
      </p>

      {/* Context (optional) */}
      {currentSuggestion.context && (
        <p className="mt-2 text-xs text-white/40">{currentSuggestion.context}</p>
      )}

      {/* Skip reason UI */}
      {showSkipReason && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-white/50">Why are you skipping this?</p>
          <div className="flex flex-wrap gap-2">
            {SKIP_REASON_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handleSkipConfirm(preset)}
                disabled={disabled}
                className={cn(
                  'rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-xs text-white/60 transition',
                  !disabled && 'hover:bg-white/[0.08] hover:text-white/80 cursor-pointer',
                  disabled && 'opacity-50 pointer-events-none',
                )}
              >
                {preset}
              </button>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <input
              type="text"
              value={skipReasonInput}
              onChange={(e) => setSkipReasonInput(e.target.value)}
              placeholder="Or type a reason..."
              disabled={disabled}
              className={cn(
                'flex-1 rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-xs text-white/70 placeholder-white/30 outline-none transition',
                'focus:border-white/[0.2] focus:bg-white/[0.07]',
                disabled && 'opacity-50 pointer-events-none',
              )}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && skipReasonInput.trim()) {
                  handleSkipConfirm(skipReasonInput.trim());
                }
              }}
            />
            <button
              type="button"
              onClick={() => handleSkipConfirm(skipReasonInput.trim() || undefined)}
              disabled={disabled}
              className={cn(
                'rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-xs text-white/50 transition',
                !disabled && 'hover:bg-white/[0.08] hover:text-white/70 cursor-pointer',
                disabled && 'opacity-50 pointer-events-none',
              )}
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {!showSkipReason && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={handleApply}
            disabled={disabled}
            className={cn(
              'min-h-[44px] rounded-xl bg-white/[0.08] px-4 py-2.5 text-sm font-medium text-white/80 transition',
              !disabled && 'hover:bg-white/[0.14] hover:text-white/95 cursor-pointer',
              disabled && 'opacity-50 pointer-events-none cursor-default',
            )}
          >
            {applyLabel}
          </button>
          <button
            type="button"
            onClick={handleSkip}
            disabled={disabled}
            className={cn(
              'min-h-[44px] rounded-xl px-4 py-2.5 text-sm text-white/40 transition',
              !disabled && 'hover:bg-white/[0.04] hover:text-white/60 cursor-pointer',
              disabled && 'opacity-50 pointer-events-none cursor-default',
            )}
          >
            Skip
          </button>
        </div>
      )}
    </div>
  );
}
