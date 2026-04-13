import { useState } from 'react';

interface ResumeReadyScreenProps {
  keywordMatchPercent: number | null;
  /** Keyword match score from the original resume before AI improvements. */
  beforeKeywordMatchPercent?: number | null;
  requirementCoveragePercent: number;
  benchmarkMatchPercent?: number;
  keywordsFound?: string[];
  keywordsMissing?: string[];
  strengthSummary: string;
  flaggedBulletCount: number;
  actionSummaryLines?: string[];
  companyName?: string;
  roleTitle?: string;
  /** True when score_breakdown was present in gap analysis. Distinguishes genuine 0% from missing data. */
  hasScoreData?: boolean;
  primaryActionLabel?: string;
  /** Actual count of addressed requirements from score_breakdown. */
  requirementsAddressed?: number;
  /** Actual total requirement count from score_breakdown. */
  requirementsTotal?: number;
  /** True when the resume has a non-empty executive summary. */
  hasExecutiveSummary?: boolean;
  onStartEditing: () => void;
}

function dedupePhrases(items: string[] = []): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const normalized = item.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export function ResumeReadyScreen({
  keywordMatchPercent,
  beforeKeywordMatchPercent,
  requirementCoveragePercent,
  benchmarkMatchPercent,
  keywordsFound = [],
  keywordsMissing = [],
  strengthSummary,
  flaggedBulletCount,
  actionSummaryLines = [],
  companyName,
  roleTitle,
  hasScoreData = true,
  primaryActionLabel = 'Start Reviewing →',
  requirementsAddressed,
  requirementsTotal,
  hasExecutiveSummary = false,
  onStartEditing,
}: ResumeReadyScreenProps) {
  const [keywordExpanded, setKeywordExpanded] = useState(false);

  const foundPhrases = dedupePhrases(keywordsFound);
  const missingPhrases = dedupePhrases(keywordsMissing);

  // ── Stat card color classes ─────────────────────────────────────────────
  const keywordStatClass = (keywordMatchPercent ?? 0) >= 50 ? 'ready-score-stat--good' : 'ready-score-stat--warn';
  const reqStatClass = (requirementCoveragePercent ?? 0) >= 50 ? 'ready-score-stat--good' : 'ready-score-stat--warn';

  // ── Stat card values ────────────────────────────────────────────────────
  const keywordDisplay =
    typeof keywordMatchPercent === 'number' && hasScoreData
      ? `${Math.round(keywordMatchPercent)}%`
      : '—';

  const reqDisplay = typeof requirementsAddressed === 'number' && typeof requirementsTotal === 'number'
    ? `${requirementsAddressed} of ${requirementsTotal}`
    : hasScoreData
      ? `${Math.round(requirementCoveragePercent)}%`
      : '—';

  // ── "What's done" — derived from available data ─────────────────────────
  // Pipeline produced a resume if we have any score data or phrases found.
  const pipelineRan = hasScoreData || foundPhrases.length > 0 || missingPhrases.length > 0;
  const hasBenchmark = typeof benchmarkMatchPercent === 'number';

  const doneBullets: string[] = [];
  if (pipelineRan) doneBullets.push('Experience bullets written');
  if (hasExecutiveSummary) doneBullets.push('Executive summary positioned');
  if (hasBenchmark) doneBullets.push('Competencies matched to role');

  // ── "What's next" — derive from actionSummaryLines if available, else build ──
  const nextItems: string[] = [];
  if (flaggedBulletCount > 0) {
    nextItems.push(`Review ${flaggedBulletCount} flagged item${flaggedBulletCount === 1 ? '' : 's'}`);
  }
  if (missingPhrases.length > 0) {
    nextItems.push(`${missingPhrases.length} keyword${missingPhrases.length === 1 ? '' : 's'} still need attention`);
  }
  // Pull any additional context from actionSummaryLines (e.g. gap areas, structure)
  const extraNextItems = actionSummaryLines.filter((line) => {
    const lower = line.toLowerCase();
    return !lower.includes('keyword') && !lower.includes('flagged');
  });
  for (const line of extraNextItems.slice(0, 2)) {
    if (nextItems.length < 3) nextItems.push(line);
  }

  return (
    <div className="ready-checkpoint-shell space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="space-y-1">
        <h2 className="text-[26px] font-semibold tracking-tight text-[var(--text-strong)] sm:text-[30px]">
          Your draft is ready
        </h2>
        {companyName && roleTitle && (
          <p className="text-[14px] text-[var(--text-soft)]">
            {roleTitle} at {companyName}
          </p>
        )}
      </div>

      {/* ── Stat cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <div className={`ready-score-stat ${keywordStatClass}`}>
          {typeof beforeKeywordMatchPercent === 'number' && typeof keywordMatchPercent === 'number' ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[var(--text-soft)]">Before:</span>
                <span className="text-lg font-bold text-[var(--text-soft)]">{Math.round(beforeKeywordMatchPercent)}%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[var(--text-soft)]">After:</span>
                <span className="text-lg font-bold text-[var(--text-strong)]">{Math.round(keywordMatchPercent)}%</span>
                {keywordMatchPercent > beforeKeywordMatchPercent && (
                  <span className="text-[11px] font-medium text-emerald-500">
                    ↑ +{Math.round(keywordMatchPercent) - Math.round(beforeKeywordMatchPercent)}%
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p className="text-[22px] font-semibold tracking-tight text-[var(--text-strong)]">
              {keywordDisplay}
            </p>
          )}
          <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--text-soft)]">
            Keyword Match
          </p>
        </div>
        <div className={`ready-score-stat ${reqStatClass}`}>
          <p className="text-[22px] font-semibold tracking-tight text-[var(--text-strong)]">
            {reqDisplay}
          </p>
          <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--text-soft)]">
            Requirements Addressed
          </p>
        </div>
      </div>

      {/* ── What's done ─────────────────────────────────────────────────── */}
      {doneBullets.length > 0 && (
        <section aria-label="What's done">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-soft)] mb-2">
            What's done
          </p>
          <ul className="space-y-1.5">
            {doneBullets.map((item) => (
              <li key={item} className="flex items-center gap-2.5">
                <span
                  className="shrink-0 text-[var(--badge-green-text)]"
                  aria-hidden="true"
                >
                  ✓
                </span>
                <span className="text-[14px] leading-6 text-[var(--text-muted)]">{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── What's next ─────────────────────────────────────────────────── */}
      {nextItems.length > 0 && (
        <section aria-label="What's next">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-soft)] mb-2">
            What's next
          </p>
          <ul className="space-y-1.5">
            {nextItems.map((item) => (
              <li key={item} className="flex items-center gap-2.5">
                <span
                  className="shrink-0 text-[var(--link)]"
                  aria-hidden="true"
                >
                  →
                </span>
                <span className="text-[14px] leading-6 text-[var(--text-muted)]">{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Primary CTA ─────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={onStartEditing}
        className="inline-flex w-full items-center justify-center rounded-xl bg-[var(--btn-primary-bg)] border border-[var(--btn-primary-border)] px-6 py-3.5 text-[15px] font-semibold text-[var(--btn-primary-text)] shadow-sm hover:bg-[var(--btn-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset-bg)] transition-colors"
      >
        {primaryActionLabel}
      </button>

      {/* ── Expandable keyword details ───────────────────────────────────── */}
      {(foundPhrases.length > 0 || missingPhrases.length > 0) && (
        <div className="ready-keyword-disclosure">
          <button
            type="button"
            aria-expanded={keywordExpanded}
            onClick={() => setKeywordExpanded((prev) => !prev)}
            className="ready-keyword-disclosure__summary flex w-full items-center justify-between gap-2"
          >
            <span>
              {keywordExpanded ? '▾' : '▸'} View keyword details
            </span>
            <span className="rounded-full border border-[var(--line-soft)] bg-[var(--surface-0)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
              {foundPhrases.length + missingPhrases.length}
            </span>
          </button>

          {keywordExpanded && (
            <div className="ready-keyword-disclosure__content">
              {/* Found keywords */}
              {foundPhrases.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-soft)] mb-2">
                    Landing well
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {foundPhrases.slice(0, 20).map((phrase) => (
                      <span
                        key={phrase}
                        className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium"
                        style={{
                          background: 'color-mix(in srgb, var(--badge-green-bg) 90%, transparent)',
                          border: '1px solid color-mix(in srgb, var(--badge-green-text) 30%, var(--line-soft))',
                          color: 'var(--badge-green-text)',
                        }}
                      >
                        {phrase}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing keywords */}
              {missingPhrases.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-soft)] mb-2">
                    Still missing
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {missingPhrases.slice(0, 20).map((phrase) => (
                      <span
                        key={phrase}
                        className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium"
                        style={{
                          background: 'color-mix(in srgb, var(--badge-amber-bg) 90%, transparent)',
                          border: '1px solid color-mix(in srgb, var(--badge-amber-text) 30%, var(--line-soft))',
                          color: 'var(--badge-amber-text)',
                        }}
                      >
                        {phrase}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
