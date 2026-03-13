import { BarChart3, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import type { GapAnalysis, GapClassification } from '@/types/resume-v2';

interface GapAnalysisCardProps {
  data: GapAnalysis;
}

export function GapAnalysisCard({ data }: GapAnalysisCardProps) {
  const strong = data.requirements.filter(r => r.classification === 'strong');
  const partial = data.requirements.filter(r => r.classification === 'partial');
  const missing = data.requirements.filter(r => r.classification === 'missing');

  const noStrategiesNeeded =
    data.requirements.every(r => !r.strategy) && data.coverage_score >= 95;

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

      {noStrategiesNeeded ? (
        <p className="text-sm text-[#b5dec2]/70">Strong match — no positioning strategies needed</p>
      ) : (
        /* Requirements list — array index keys are acceptable here (static render-once list) */
        <div className="space-y-2">
          {data.requirements.map((req, i) => (
            <RequirementRow
              key={i}
              requirement={req.requirement}
              classification={req.classification}
              evidence={req.evidence}
              strategy={req.strategy}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RequirementRow({ requirement, classification, evidence, strategy }: {
  requirement: string;
  classification: GapClassification;
  evidence: string[];
  strategy?: { real_experience: string; positioning: string; inferred_metric?: string; inference_rationale?: string };
}) {
  const icon = {
    strong: <CheckCircle2 className="h-3.5 w-3.5 text-[#b5dec2] shrink-0" />,
    partial: <AlertTriangle className="h-3.5 w-3.5 text-[#f0d99f] shrink-0" />,
    missing: <XCircle className="h-3.5 w-3.5 text-[#f0b8b8] shrink-0" />,
  }[classification];

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-start gap-2">
        {icon}
        <div className="flex-1 min-w-0">
          <div className="text-sm text-white/80">{requirement}</div>
          {evidence.length > 0 && (
            <div className="mt-1 text-xs text-white/45 line-clamp-2">{evidence.join(' | ')}</div>
          )}
          {strategy && (
            <div className="mt-2 rounded border border-[#afc4ff]/15 bg-[#afc4ff]/[0.04] px-2.5 py-2">
              <div className="text-xs font-medium text-[#afc4ff]/80 mb-0.5">Positioning strategy</div>
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
