import { useState, useCallback } from 'react';
import { Users, CheckCircle2, MessageSquare, ArrowRight } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import { GlassButton } from '../GlassButton';
import { cn } from '@/lib/utils';
import type { StakeholderReviewData } from '@/types/panels';

interface StakeholderReviewPanelProps {
  data: StakeholderReviewData;
  onPipelineRespond?: (gate: string, response: unknown) => void;
}

type Mode = 'review' | 'request_changes';

const RELATIONSHIP_LABELS: Record<string, string> = {
  direct_report: 'Direct Report',
  peer: 'Peer',
  superior: 'Superior',
  cross_functional: 'Cross-Functional',
  external: 'External',
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  critical: { label: 'Critical', color: 'text-[#f0a9a9]' },
  high: { label: 'High', color: 'text-[#f0c9a9]' },
  medium: { label: 'Medium', color: 'text-[#f0d99f]' },
  low: { label: 'Low', color: 'text-[var(--text-soft)]' },
};

export function StakeholderReviewPanel({ data, onPipelineRespond }: StakeholderReviewPanelProps) {
  const { stakeholder_map, quick_wins, role_context } = data;

  const [mode, setMode] = useState<Mode>('review');
  const [feedback, setFeedback] = useState('');

  const handleApprove = useCallback(() => {
    onPipelineRespond?.('stakeholder_review', true);
  }, [onPipelineRespond]);

  const handleSubmitFeedback = useCallback(() => {
    if (!feedback.trim()) return;
    onPipelineRespond?.('stakeholder_review', { approved: false, feedback: feedback.trim() });
  }, [onPipelineRespond, feedback]);

  return (
    <div data-panel-root className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-[var(--line-soft)] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[#afc4ff]" />
            <span className="text-sm font-medium text-[var(--text-strong)]">Stakeholder Map Review</span>
          </div>
          <span className="text-xs text-[var(--text-soft)] tabular-nums">
            {stakeholder_map.length} stakeholder{stakeholder_map.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div data-panel-scroll className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Guidance card */}
        <GlassCard className="p-3">
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            The AI inferred these stakeholders from your role context. Confirm or correct this map before the plan is written — the engagement strategies in your 90-day plan depend on it.
          </p>
        </GlassCard>

        {/* Role context */}
        {role_context && (
          <GlassCard className="p-3">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--text-soft)] mb-1">
              Target Role
            </p>
            <p className="text-xs font-medium text-[var(--text-muted)]">{role_context.target_role}</p>
            <p className="text-[13px] text-[var(--text-soft)]">{role_context.target_company} · {role_context.target_industry}</p>
          </GlassCard>
        )}

        {/* Stakeholder list */}
        <div className="space-y-2">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">
            Inferred Stakeholders
          </p>
          {stakeholder_map.map((stakeholder, idx) => {
            const priorityConfig = PRIORITY_CONFIG[stakeholder.priority] ?? PRIORITY_CONFIG.low;
            const relationshipLabel = RELATIONSHIP_LABELS[stakeholder.relationship_type] ?? stakeholder.relationship_type;
            return (
              <GlassCard key={idx} className="p-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-xs font-medium text-[var(--text-strong)]">{stakeholder.name_or_role}</p>
                  <span className={cn('shrink-0 text-[12px] font-semibold', priorityConfig.color)}>
                    {priorityConfig.label}
                  </span>
                </div>
                <p className="text-[13px] text-[var(--text-soft)] mb-2">{relationshipLabel}</p>
                {stakeholder.engagement_strategy && (
                  <p className="text-[13px] text-[var(--text-muted)] leading-relaxed">
                    {stakeholder.engagement_strategy}
                  </p>
                )}
              </GlassCard>
            );
          })}
        </div>

        {/* Quick wins summary (for context) */}
        {quick_wins && quick_wins.length > 0 && (
          <div className="space-y-2">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">
              Early Quick Wins
            </p>
            <GlassCard className="p-3">
              <ul className="space-y-1.5">
                {quick_wins.slice(0, 3).map((win, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-[13px] text-[var(--text-muted)]">
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 bg-[#afc4ff]/50" />
                    <span>{win.description}</span>
                    <span className="shrink-0 text-[var(--text-soft)]">{win.impact} impact</span>
                  </li>
                ))}
              </ul>
            </GlassCard>
          </div>
        )}

        {/* Request changes textarea */}
        {mode === 'request_changes' && (
          <div className="space-y-2">
            <label className="text-[12px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">
              Correct the stakeholder map
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={4}
              placeholder="e.g. I will not have direct reports — this is an IC role. Add the Head of Product as a cross-functional stakeholder. The CFO is a critical superior, not medium..."
              className="w-full rounded-md border border-[var(--line-strong)] bg-[var(--accent-muted)] px-3 py-2 text-xs text-[var(--text-strong)] leading-relaxed placeholder:text-[var(--text-soft)] focus:border-[#afc4ff]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:ring-1 focus:ring-[#afc4ff]/20 resize-none"
              aria-label="Corrections to stakeholder map"
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
                aria-label="Confirm stakeholder map and proceed"
              >
                <CheckCircle2 className="h-4 w-4" />
                Confirm Map
                <ArrowRight className="h-4 w-4 ml-auto" />
              </GlassButton>
              <GlassButton
                variant="ghost"
                className="w-full"
                onClick={() => setMode('request_changes')}
                aria-label="Correct the stakeholder map"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Correct Stakeholders
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
                aria-label="Submit stakeholder corrections"
              >
                <MessageSquare className="h-4 w-4" />
                Submit Corrections
                <ArrowRight className="h-4 w-4 ml-auto" />
              </GlassButton>
              <button
                type="button"
                onClick={() => { setFeedback(''); setMode('review'); }}
                className="w-full text-center text-xs text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors py-1"
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
