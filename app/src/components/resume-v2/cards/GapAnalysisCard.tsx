import { BarChart3, CheckCircle2, AlertTriangle, XCircle, ThumbsUp, ThumbsDown } from 'lucide-react';
import type { GapAnalysis, GapClassification } from '@/types/resume-v2';

export type StrategyApprovals = Record<string, boolean>; // requirement → approved

interface GapAnalysisCardProps {
  data: GapAnalysis;
  /** When provided, enables approve/reject toggles on strategies */
  onStrategyChange?: (approvals: StrategyApprovals) => void;
  approvals?: StrategyApprovals;
  isComplete?: boolean;
}

export function GapAnalysisCard({ data, onStrategyChange, approvals = {}, isComplete }: GapAnalysisCardProps) {
  const strong = data.requirements.filter(r => r.classification === 'strong');
  const partial = data.requirements.filter(r => r.classification === 'partial');
  const missing = data.requirements.filter(r => r.classification === 'missing');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-[#afc4ff]" />
        <h3 className="text-sm font-semibold text-white/90">Gap Analysis</h3>
        <span className="ml-auto text-xs text-white/40">Coverage: {data.coverage_score}%</span>
      </div>

      <p className="text-sm text-white/60">{data.strength_summary}</p>

      {/* Coverage bar */}
      <div className="h-2 w-full rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#b5dec2] to-[#afc4ff] transition-all duration-700"
          style={{ width: `${Math.min(100, data.coverage_score)}%` }}
        />
      </div>

      {/* Summary counts */}
      <div className="flex gap-4 text-xs">
        <span className="flex items-center gap-1 text-[#b5dec2]"><CheckCircle2 className="h-3 w-3" /> {strong.length} strong</span>
        <span className="flex items-center gap-1 text-[#f0d99f]"><AlertTriangle className="h-3 w-3" /> {partial.length} partial</span>
        <span className="flex items-center gap-1 text-[#f0b8b8]"><XCircle className="h-3 w-3" /> {missing.length} missing</span>
      </div>

      {/* Requirements list — array index keys are acceptable here (static render-once list;
           strategy toggles mutate approval state but never reorder/add/remove items) */}
      <div className="space-y-2">
        {data.requirements.map((req, i) => (
          <RequirementRow
            key={i}
            requirement={req.requirement}
            classification={req.classification}
            evidence={req.evidence}
            strategy={req.strategy}
            showToggle={isComplete && !!onStrategyChange && !!req.strategy}
            approved={approvals[req.requirement]}
            onToggle={(approved) => {
              if (!onStrategyChange) return;
              onStrategyChange({ ...approvals, [req.requirement]: approved });
            }}
          />
        ))}
      </div>
    </div>
  );
}

function RequirementRow({ requirement, classification, evidence, strategy, showToggle, approved, onToggle }: {
  requirement: string;
  classification: GapClassification;
  evidence: string[];
  strategy?: { real_experience: string; positioning: string; inferred_metric?: string; inference_rationale?: string };
  showToggle?: boolean;
  approved?: boolean;
  onToggle?: (approved: boolean) => void;
}) {
  const icon = {
    strong: <CheckCircle2 className="h-3.5 w-3.5 text-[#b5dec2] shrink-0" />,
    partial: <AlertTriangle className="h-3.5 w-3.5 text-[#f0d99f] shrink-0" />,
    missing: <XCircle className="h-3.5 w-3.5 text-[#f0b8b8] shrink-0" />,
  }[classification];

  // Only show active state after user interaction; neutral by default
  const isApproved = approved === true;
  const isRejected = approved === false;
  const isNeutral = approved === undefined;

  return (
    <div className={`rounded-lg border px-3 py-2.5 transition-colors ${isRejected ? 'border-white/[0.04] bg-white/[0.01] opacity-50' : isNeutral || isApproved ? 'border-white/[0.06] bg-white/[0.02]' : 'border-white/[0.06] bg-white/[0.02]'}`}>
      <div className="flex items-start gap-2">
        {icon}
        <div className="flex-1 min-w-0">
          <div className="text-sm text-white/80">{requirement}</div>
          {evidence.length > 0 && (
            <div className="mt-1 text-xs text-white/45 line-clamp-2">{evidence.join(' | ')}</div>
          )}
          {strategy && (
            <div className={`mt-2 rounded border px-2.5 py-2 ${isRejected ? 'border-white/[0.06] bg-white/[0.02]' : 'border-[#afc4ff]/15 bg-[#afc4ff]/[0.04]'}`}>
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-[#afc4ff]/80 mb-0.5">Positioning strategy</div>
                {showToggle && onToggle && (
                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onToggle(true)}
                      className={`rounded p-1 transition-colors ${isApproved ? 'bg-[#b5dec2]/20 text-[#b5dec2]' : 'text-white/25 hover:text-white/50'}`}
                      title="Use this strategy"
                      aria-label={`Approve strategy for ${requirement}`}
                      aria-pressed={isApproved}
                    >
                      <ThumbsUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggle(false)}
                      className={`rounded p-1 transition-colors ${isRejected ? 'bg-[#f0b8b8]/20 text-[#f0b8b8]' : 'text-white/25 hover:text-white/50'}`}
                      title="Skip this strategy"
                      aria-label={`Reject strategy for ${requirement}`}
                      aria-pressed={isRejected}
                    >
                      <ThumbsDown className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
              <div className="text-xs text-white/60">{strategy.positioning}</div>
              {strategy.inferred_metric && (
                <div className="mt-1 text-xs text-[#f0d99f]/70">
                  Suggested metric: {strategy.inferred_metric}
                  <span className="text-white/25 ml-1">(conservative estimate)</span>
                  {strategy.inference_rationale && <span className="text-white/30"> — {strategy.inference_rationale}</span>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
