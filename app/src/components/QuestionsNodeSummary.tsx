import { History } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';

interface QuestionsNodeSummaryProps {
  isActiveNode: boolean;
  draftReadiness: {
    high_impact_remaining?: Array<{
      requirement: string;
      classification: 'partial' | 'gap';
      priority: 'must_have' | 'implicit' | 'nice_to_have';
      evidence_count: number;
    }>;
  } | null;
  questionMetrics?: {
    total: number;
    answered: number;
    skipped: number;
    deferred: number;
    by_impact: {
      high: { total: number; answered: number; skipped: number; deferred: number };
      medium: { total: number; answered: number; skipped: number; deferred: number };
      low: { total: number; answered: number; skipped: number; deferred: number };
      untagged: { total: number; answered: number; skipped: number; deferred: number };
    };
    latest_activity_at: string | null;
  } | null;
  questionHistory?: Array<{
    questionnaire_id: string;
    question_id: string;
    stage: string;
    status: 'answered' | 'skipped' | 'deferred';
    impact_tag: 'high' | 'medium' | 'low' | null;
    payoff_hint: string | null;
    updated_at: string | null;
  }> | null;
  questionReuseSummaries?: Array<{
    stage: 'positioning' | 'gap_analysis';
    questionnaire_kind: 'positioning_batch' | 'gap_analysis_quiz';
    skipped_count: number;
    matched_by_topic_count: number;
    matched_by_payoff_count: number;
    prior_answered_count: number;
    prior_deferred_count: number;
    benchmark_edit_version: number | null;
    sample_topics: string[];
    sample_payoffs: string[];
    message: string | null;
    version: number | null;
    created_at: string | null;
  }> | null;
  questionReuseMetrics?: {
    total_skipped: number;
    by_stage: {
      positioning: { events: number; skipped_count: number };
      gap_analysis: { events: number; skipped_count: number };
    };
    matched_by_topic_count: number;
    matched_by_payoff_count: number;
    prior_answered_count: number;
    prior_deferred_count: number;
    latest_created_at: string | null;
  } | null;
  onOpenQuestions?: () => void;
}

export function QuestionsNodeSummary({
  isActiveNode,
  draftReadiness,
  questionMetrics,
  questionHistory,
  questionReuseSummaries,
  questionReuseMetrics,
  onOpenQuestions,
}: QuestionsNodeSummaryProps) {
  const remaining = draftReadiness?.high_impact_remaining ?? [];
  return (
    <div className="h-full p-3 md:p-4">
      <GlassCard className="h-full p-6">
        <div className="mb-2 flex items-center gap-2 text-[var(--text-muted)]">
          <History className="h-4 w-4 text-[var(--text-soft)]" />
          <h3 className="text-sm font-semibold">Questions</h3>
        </div>
        {remaining.length > 0 ? (
          <>
            <p className="max-w-2xl text-sm text-[var(--text-soft)]">
              {isActiveNode
                ? 'The coach is between question batches. These are the highest-impact remaining areas it is likely to ask about next.'
                : 'These are the highest-impact remaining areas the coach is likely to ask about next.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {remaining.slice(0, 6).map((item, index) => (
                <div
                  key={`${item.requirement}-${index}`}
                  className="rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2.5 py-2 text-xs text-[var(--text-muted)]"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full border px-1.5 py-0.5 text-[12px] ${
                      item.priority === 'must_have'
                        ? 'border-[#f0b8b8]/20 bg-[#f0b8b8]/[0.08] text-[#f0b8b8]/85'
                        : item.priority === 'implicit'
                          ? 'border-[#f0d99f]/20 bg-[#f0d99f]/[0.08] text-[#f0d99f]/85'
                          : 'border-[var(--line-soft)] bg-[var(--accent-muted)] text-[var(--text-soft)]'
                    }`}>
                      {item.priority === 'must_have' ? 'Must-have' : item.priority === 'implicit' ? 'Implicit' : 'Nice-to-have'}
                    </span>
                    <span className={item.classification === 'gap' ? 'text-[#f0b8b8]/80' : 'text-[#f0d99f]/80'}>
                      {item.classification === 'gap' ? 'Gap' : 'Partial'}
                    </span>
                  </div>
                  <div className="mt-1 max-w-[32rem]">{item.requirement}</div>
                </div>
              ))}
            </div>
            {questionMetrics && questionMetrics.total > 0 && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2">
                  <div className="text-[12px] uppercase tracking-[0.1em] text-[var(--text-soft)]">Question Progress</div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">
                    Answered {questionMetrics.answered} • Deferred {questionMetrics.deferred} • Skipped {questionMetrics.skipped}
                  </div>
                  {questionMetrics.latest_activity_at && (
                    <div className="mt-1 text-[12px] text-[var(--text-soft)]">
                      Last activity: {new Date(questionMetrics.latest_activity_at).toLocaleString()}
                    </div>
                  )}
                </div>
                <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2">
                  <div className="text-[12px] uppercase tracking-[0.1em] text-[var(--text-soft)]">High-Impact Questions</div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">
                    Answered {questionMetrics.by_impact.high.answered} / {questionMetrics.by_impact.high.total}
                  </div>
                  <div className="mt-1 text-[12px] text-[var(--text-soft)]">
                    Deferred {questionMetrics.by_impact.high.deferred} • Skipped {questionMetrics.by_impact.high.skipped}
                  </div>
                </div>
              </div>
            )}
            {Array.isArray(questionHistory) && questionHistory.length > 0 && (
              <div className="mt-3 rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2">
                <div className="text-[12px] uppercase tracking-[0.1em] text-[var(--text-soft)]">Recent Question Rationale</div>
                <div className="mt-2 space-y-1.5">
                  {questionHistory.slice(0, 5).map((item, index) => (
                    <div key={`${item.questionnaire_id}:${item.question_id}:${index}`} className="rounded-md border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2 py-1.5">
                      <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                        <span className={`rounded-full border px-1.5 py-0.5 ${
                          item.impact_tag === 'high'
                            ? 'border-[#f0b8b8]/20 bg-[#f0b8b8]/[0.08] text-[#f0b8b8]/85'
                            : item.impact_tag === 'medium'
                              ? 'border-[#afc4ff]/20 bg-[#afc4ff]/[0.08] text-[#afc4ff]/85'
                              : 'border-[var(--line-soft)] bg-[var(--accent-muted)] text-[var(--text-soft)]'
                        }`}>
                          {item.impact_tag ? `${item.impact_tag} impact` : 'untagged'}
                        </span>
                        <span className={`rounded-full border px-1.5 py-0.5 ${
                          item.status === 'answered'
                            ? 'border-[#b5dec2]/20 bg-[#b5dec2]/[0.08] text-[#b5dec2]/85'
                            : item.status === 'deferred'
                              ? 'border-[#f0d99f]/20 bg-[#f0d99f]/[0.08] text-[#f0d99f]/85'
                              : 'border-[var(--line-soft)] bg-[var(--accent-muted)] text-[var(--text-soft)]'
                        }`}>
                          {item.status}
                        </span>
                        <span className="text-[var(--text-soft)]">{item.stage.replace(/_/g, ' ')}</span>
                      </div>
                      <div className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">
                        {item.payoff_hint}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {Array.isArray(questionReuseSummaries) && questionReuseSummaries.length > 0 && (
              <div className="mt-3 rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2">
                <div className="text-[12px] uppercase tracking-[0.1em] text-[var(--text-soft)]">Question Reuse (to reduce repeats)</div>
                {questionReuseMetrics && questionReuseMetrics.total_skipped > 0 && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-md border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2.5 py-2">
                      <div className="text-[12px] uppercase tracking-[0.08em] text-[var(--text-soft)]">Reuse Savings</div>
                      <div className="mt-1 text-xs text-[var(--text-muted)]">
                        Reused {questionReuseMetrics.total_skipped} lower-impact question{questionReuseMetrics.total_skipped === 1 ? '' : 's'}
                      </div>
                      <div className="mt-1 text-[12px] text-[var(--text-soft)]">
                        Positioning {questionReuseMetrics.by_stage.positioning.skipped_count} • Gap Analysis {questionReuseMetrics.by_stage.gap_analysis.skipped_count}
                      </div>
                    </div>
                    <div className="rounded-md border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2.5 py-2">
                      <div className="text-[12px] uppercase tracking-[0.08em] text-[var(--text-soft)]">Reuse Basis</div>
                      <div className="mt-1 text-xs text-[var(--text-muted)]">
                        Topic match {questionReuseMetrics.matched_by_topic_count} • Payoff match {questionReuseMetrics.matched_by_payoff_count}
                      </div>
                      <div className="mt-1 text-[12px] text-[var(--text-soft)]">
                        Prior answered {questionReuseMetrics.prior_answered_count} • Prior deferred {questionReuseMetrics.prior_deferred_count}
                      </div>
                    </div>
                  </div>
                )}
                <div className="mt-2 space-y-1.5">
                  {questionReuseSummaries.slice(0, 4).map((item, index) => (
                    <div key={`${item.stage}:${item.version ?? index}:${index}`} className="rounded-md border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2 py-1.5">
                      <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                        <span className="rounded-full border border-[var(--line-soft)] bg-[var(--accent-muted)] px-1.5 py-0.5 text-[var(--text-soft)]">
                          {item.stage === 'positioning' ? 'Positioning' : 'Gap Analysis'}
                        </span>
                        <span className="rounded-full border border-[#afc4ff]/20 bg-[#afc4ff]/[0.08] px-1.5 py-0.5 text-[#afc4ff]/85">
                          Reused {item.skipped_count}
                        </span>
                        <span className="text-[var(--text-soft)]">
                          topic {item.matched_by_topic_count} • payoff {item.matched_by_payoff_count}
                        </span>
                        {typeof item.benchmark_edit_version === 'number' && (
                          <span className="text-[var(--text-soft)]">benchmark v{item.benchmark_edit_version}</span>
                        )}
                      </div>
                      {item.message && (
                        <div className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">
                          {item.message}
                        </div>
                      )}
                      {(item.prior_answered_count > 0 || item.prior_deferred_count > 0) && (
                        <div className="mt-1 text-[12px] text-[var(--text-soft)]">
                          Based on prior {item.prior_answered_count > 0 ? `${item.prior_answered_count} answered` : '0 answered'}
                          {item.prior_deferred_count > 0 ? ` and ${item.prior_deferred_count} deferred` : ''} response
                          {item.prior_answered_count + item.prior_deferred_count === 1 ? '' : 's'}.
                        </div>
                      )}
                      {item.sample_payoffs.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {item.sample_payoffs.slice(0, 2).map((payoff, payoffIndex) => (
                            <span
                              key={`${payoff}-${payoffIndex}`}
                              className="rounded-full border border-[var(--line-soft)] bg-[var(--accent-muted)] px-1.5 py-0.5 text-[12px] text-[var(--text-soft)]"
                              title={payoff}
                            >
                              {payoff.length > 44 ? `${payoff.slice(0, 44)}...` : payoff}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {onOpenQuestions && (
              <div className="mt-3">
                <GlassButton type="button" variant="ghost" size="sm" className="h-8" onClick={onOpenQuestions}>
                  Refresh Questions
                </GlassButton>
              </div>
            )}
          </>
        ) : (
          <p className="max-w-xl text-sm text-[var(--text-soft)]">
            {isActiveNode
              ? 'Your coach is working on this step. Results will appear here shortly.'
              : 'This step hasn\'t been reached yet. Continue your session to see results here.'}
          </p>
        )}
      </GlassCard>
    </div>
  );
}
