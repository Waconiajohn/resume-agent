interface ResumeReadyScreenProps {
  keywordMatchPercent: number | null;
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

function KeywordPhraseGroup({
  title,
  items,
  emptyLabel,
  tone,
}: {
  title: string;
  items: string[];
  emptyLabel: string;
  tone: 'found' | 'missing';
}) {
  return (
    <div
      className={`ready-phrase-card ready-phrase-card--${tone}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-soft)]">
          {title}
        </p>
        <span className="rounded-full border border-[var(--line-soft)] bg-[var(--surface-0)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
          {items.length}
        </span>
      </div>
      {items.length > 0 ? (
        <div className="mt-3 space-y-2">
          {items.slice(0, 8).map((item) => (
            <div
              key={item}
              className={`ready-phrase-row ready-phrase-row--${tone}`}
            >
              <span className="ready-phrase-row__dot" aria-hidden="true" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm leading-6 text-[var(--text-soft)]">{emptyLabel}</p>
      )}
    </div>
  );
}

function ScoreStat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'good' | 'warn';
}) {
  return (
    <div className={`ready-score-stat ready-score-stat--${tone}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--text-soft)]">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tracking-tight text-[var(--text-strong)]">
        {value}
      </p>
    </div>
  );
}

export function ResumeReadyScreen({
  keywordMatchPercent,
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
  primaryActionLabel = 'Start Editing My Resume',
  onStartEditing,
}: ResumeReadyScreenProps) {
  const needsReview = flaggedBulletCount > 0;
  const headline = needsReview ? 'Your First Draft Is Ready' : 'Your Resume Is Ready for Final Review';
  const summary = needsReview
    ? 'The structure is in place. Now tighten the few lines that still need proof, clearer scope, or a more honest fit.'
    : 'The draft is in strong shape. Do one last review for tone, credibility, and final polish before export.';
  const foundPhrases = dedupePhrases(keywordsFound);
  const missingPhrases = dedupePhrases(keywordsMissing);
  const reportIntro = hasScoreData
    ? 'This draft is now being judged the way a job-scan style reviewer would: by the language it lands, the phrases it still misses, and how directly it mirrors the role.'
    : 'The keyword and key-phrasing report is still calculating.';
  const summaryLine = (() => {
    if (typeof keywordMatchPercent === 'number') {
      return `Language match ${Math.round(keywordMatchPercent)}%. ${foundPhrases.length} phrase${foundPhrases.length === 1 ? '' : 's'} are already landing, and ${missingPhrases.length} still need attention.`;
    }
    if (foundPhrases.length > 0 || missingPhrases.length > 0) {
      return `${foundPhrases.length} phrase${foundPhrases.length === 1 ? '' : 's'} are already landing, and ${missingPhrases.length} still need attention.`;
    }
    return 'The keyword and key-phrasing report is still calculating.';
  })();
  const nextSteps = (actionSummaryLines.length > 0 ? actionSummaryLines : [summary]).slice(0, 2);

  return (
    <div className="ready-checkpoint-shell grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.85fr)] lg:items-start">
      <div className="space-y-4">
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-soft)]">
            Draft Checkpoint
          </p>
          <div className="space-y-2">
            <h2 className="text-[28px] font-semibold tracking-tight text-[var(--text-strong)] sm:text-[34px]">
              {headline}
            </h2>
            <p className="max-w-[760px] text-[15px] leading-7 text-[var(--text-muted)]">
              {summary}
            </p>
          </div>
          {companyName && roleTitle && (
            <p className="text-[13px] text-[var(--text-soft)]">{roleTitle} at {companyName}</p>
          )}
          <p className="text-[14px] leading-6 text-[var(--text-muted)]">{summaryLine}</p>
          {strengthSummary && (
            <p className="text-sm leading-6 text-[var(--text-muted)]">
              {strengthSummary}
            </p>
          )}
        </div>

        <details className="ready-keyword-disclosure">
          <summary className="ready-keyword-disclosure__summary">
            View keyword report
          </summary>
          <div className="ready-keyword-disclosure__content">
            <p className="text-sm leading-6 text-[var(--text-muted)]">
              {reportIntro}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <ScoreStat label="Language Match" value={typeof keywordMatchPercent === 'number' ? `${Math.round(keywordMatchPercent)}%` : '—'} tone="good" />
              <ScoreStat label="Role Coverage" value={hasScoreData ? `${Math.round(requirementCoveragePercent)}%` : '—'} tone="good" />
              {typeof benchmarkMatchPercent === 'number' && (
                <ScoreStat label="Benchmark Fit" value={hasScoreData ? `${Math.round(benchmarkMatchPercent)}%` : '—'} tone="neutral" />
              )}
              <ScoreStat label="Still Missing" value={String(missingPhrases.length)} tone={missingPhrases.length > 0 ? 'warn' : 'neutral'} />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <KeywordPhraseGroup
                title="Landing Well"
                items={foundPhrases}
                emptyLabel="Matched phrases will appear here once the current draft is scored."
                tone="found"
              />
              <KeywordPhraseGroup
                title="Still Missing"
                items={missingPhrases}
                emptyLabel="Nothing obvious is missing right now."
                tone="missing"
              />
            </div>
          </div>
        </details>
      </div>

      <div className="space-y-4">
        <section className="ready-next-card">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[var(--text-soft)]">
            Start Here
          </h3>
          <div className="mt-3 space-y-3">
            {nextSteps.map((line) => (
              <div key={line} className="flex items-start gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--link)]" aria-hidden="true" />
                <p className="text-[14px] leading-6 text-[var(--text-muted)]">{line}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="ready-next-card">
          <p className="text-[14px] leading-6 text-[var(--text-muted)]">
            {needsReview
              ? 'Open the draft and tighten the few lines that still block a stronger fit.'
              : 'Open the draft and do one last confidence check before export.'}
          </p>
          <button
            type="button"
            onClick={onStartEditing}
            className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-[var(--btn-primary-bg)] border border-[var(--btn-primary-border)] px-6 py-3.5 text-[15px] font-semibold text-[var(--btn-primary-text)] shadow-sm hover:bg-[var(--btn-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset-bg)] transition-colors"
          >
            {primaryActionLabel}
          </button>
        </section>
      </div>
    </div>
  );
}
