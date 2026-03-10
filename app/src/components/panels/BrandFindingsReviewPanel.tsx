import { useState, useCallback } from 'react';
import { Search, CheckCircle2, MessageSquare, ArrowRight, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import { GlassButton } from '../GlassButton';
import { cn } from '@/lib/utils';
import type { BrandFindingsReviewData } from '@/types/panels';

interface BrandFindingsReviewPanelProps {
  data: BrandFindingsReviewData;
  onPipelineRespond?: (gate: string, response: unknown) => void;
}

type Mode = 'review' | 'request_changes';

const SEVERITY_CONFIG = {
  critical: { label: 'Critical', color: 'text-[#f0a9a9]', bg: 'bg-[#f0a9a9]/10', icon: AlertCircle },
  high: { label: 'High', color: 'text-[#f0c9a9]', bg: 'bg-[#f0c9a9]/10', icon: AlertTriangle },
  medium: { label: 'Medium', color: 'text-[#f0d99f]', bg: 'bg-[#f0d99f]/10', icon: AlertTriangle },
  low: { label: 'Low', color: 'text-[#a8d7b8]', bg: 'bg-[#a8d7b8]/10', icon: Info },
} as const;

export function BrandFindingsReviewPanel({ data, onPipelineRespond }: BrandFindingsReviewPanelProps) {
  const { findings, consistency_scores } = data;

  const [mode, setMode] = useState<Mode>('review');
  const [feedback, setFeedback] = useState('');

  const handleApprove = useCallback(() => {
    onPipelineRespond?.('findings_review', true);
  }, [onPipelineRespond]);

  const handleSubmitFeedback = useCallback(() => {
    if (!feedback.trim()) return;
    onPipelineRespond?.('findings_review', { approved: false, feedback: feedback.trim() });
  }, [onPipelineRespond, feedback]);

  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const highCount = findings.filter((f) => f.severity === 'high').length;

  return (
    <div data-panel-root className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-white/[0.12] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-[#afc4ff]" />
            <span className="text-sm font-medium text-white/85">Brand Findings Review</span>
          </div>
          <span className="text-xs text-white/45 tabular-nums">
            {findings.length} finding{findings.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div data-panel-scroll className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Guidance card */}
        <GlassCard className="p-3">
          <p className="text-xs text-white/65 leading-relaxed">
            Review these brand gap findings before recommendations are written. Dispute any finding that is inaccurate or missing context — the advisor will adjust accordingly.
          </p>
        </GlassCard>

        {/* Consistency scores summary */}
        {consistency_scores && (
          <GlassCard className="p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/45 mb-2">
              Consistency Scores
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {(
                [
                  ['Overall', consistency_scores.overall],
                  ['Messaging', consistency_scores.messaging],
                  ['Value Prop', consistency_scores.value_proposition],
                  ['Tone & Voice', consistency_scores.tone_voice],
                ] as [string, number][]
              ).map(([label, score]) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-xs text-white/55">{label}</span>
                  <span
                    className={cn(
                      'text-xs font-semibold tabular-nums',
                      score >= 80 ? 'text-[#a8d7b8]' : score >= 60 ? 'text-[#f0d99f]' : 'text-[#f0a9a9]',
                    )}
                  >
                    {score}/100
                  </span>
                </div>
              ))}
            </div>
          </GlassCard>
        )}

        {/* Severity summary */}
        {(criticalCount > 0 || highCount > 0) && (
          <div className="flex gap-2">
            {criticalCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#f0a9a9]/10 px-2 py-0.5 text-[10px] font-semibold text-[#f0a9a9]">
                <AlertCircle className="h-3 w-3" />
                {criticalCount} Critical
              </span>
            )}
            {highCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#f0c9a9]/10 px-2 py-0.5 text-[10px] font-semibold text-[#f0c9a9]">
                <AlertTriangle className="h-3 w-3" />
                {highCount} High
              </span>
            )}
          </div>
        )}

        {/* Findings list */}
        <div className="space-y-2">
          {findings.map((finding) => {
            const config = SEVERITY_CONFIG[finding.severity] ?? SEVERITY_CONFIG.low;
            const Icon = config.icon;
            return (
              <GlassCard key={finding.id} className={cn('p-3', config.bg)}>
                <div className="flex items-start gap-2">
                  <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', config.color)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-white/85">{finding.title}</span>
                      <span className={cn('text-[10px] font-semibold', config.color)}>
                        {config.label}
                      </span>
                      <span className="text-[10px] text-white/40">{finding.source}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-white/60 leading-relaxed">
                      {finding.description}
                    </p>
                    {finding.recommendation && (
                      <p className="mt-1 text-[11px] text-[#afc4ff]/70 leading-relaxed">
                        Rec: {finding.recommendation}
                      </p>
                    )}
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>

        {/* Request changes textarea */}
        {mode === 'request_changes' && (
          <div className="space-y-2">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
              Dispute or correct findings
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={4}
              placeholder="e.g. The LinkedIn tone finding is incorrect — I intentionally use informal language on LinkedIn. The messaging inconsistency finding about the bio is accurate..."
              className="w-full rounded-md border border-white/[0.15] bg-white/[0.06] px-3 py-2 text-xs text-white/85 leading-relaxed placeholder:text-white/30 focus:border-[#afc4ff]/40 focus:outline-none focus:ring-1 focus:ring-[#afc4ff]/20 resize-none"
              aria-label="Feedback on brand findings"
              autoFocus
            />
          </div>
        )}

        {/* Action buttons */}
        <div className="space-y-2 pt-1 pb-2">
          {mode === 'review' && (
            <>
              <GlassButton
                variant="primary"
                className="w-full"
                onClick={handleApprove}
                aria-label="Accept findings and proceed to recommendations"
              >
                <CheckCircle2 className="h-4 w-4" />
                Accept Findings
                <ArrowRight className="h-4 w-4 ml-auto" />
              </GlassButton>
              <GlassButton
                variant="ghost"
                className="w-full"
                onClick={() => setMode('request_changes')}
                aria-label="Dispute or correct findings"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Dispute Findings
              </GlassButton>
            </>
          )}

          {mode === 'request_changes' && (
            <>
              <GlassButton
                variant="primary"
                className="w-full"
                onClick={handleSubmitFeedback}
                disabled={!feedback.trim()}
                aria-label="Submit corrections"
              >
                <MessageSquare className="h-4 w-4" />
                Submit Corrections
                <ArrowRight className="h-4 w-4 ml-auto" />
              </GlassButton>
              <button
                type="button"
                onClick={() => { setFeedback(''); setMode('review'); }}
                className="w-full text-center text-xs text-white/40 hover:text-white/60 transition-colors py-1"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
