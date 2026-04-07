import { ScoreRing } from '@/components/shared/ScoreRing';

interface ResumeReadyScreenProps {
  jobMatchPercent: number;
  benchmarkMatchPercent?: number;
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

/** Placeholder ring shown when score data is absent — neutral "—" with "Calculating..." label. */
function PendingScoreRing({ label }: { label: string }) {
  const circumference = 2 * Math.PI * 28;
  return (
    <div className="flex flex-col items-center gap-1.5" role="img" aria-label={`${label}: Calculating`}>
      <div className="relative h-16 w-16">
        <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="3" className="text-[var(--ring-track)]" />
          <circle
            cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="3"
            strokeDasharray={circumference} strokeLinecap="round"
            className="text-[var(--text-soft)]"
            style={{ strokeDashoffset: circumference * 0.75 }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-[var(--text-soft)]">
          —
        </span>
      </div>
      <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">Calculating\u2026</span>
    </div>
  );
}

export function ResumeReadyScreen({
  jobMatchPercent,
  benchmarkMatchPercent,
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
  const chips = [
    needsReview
      ? `${flaggedBulletCount} ${flaggedBulletCount === 1 ? 'line needs review' : 'lines need review'}`
      : 'No flagged lines',
    primaryActionLabel.toLowerCase().includes('structure')
      ? 'Structure first'
      : 'Line editing next',
  ];

  return (
    <div className="bg-[var(--surface-1)] rounded-2xl shadow-[var(--shadow-mid)] p-6 space-y-6 sm:p-8 sm:space-y-7">
      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-soft)]">
          Draft Checkpoint
        </p>
        <div className="space-y-2">
          <h2 className="text-[22px] font-semibold tracking-tight text-[var(--text-strong)] sm:text-[25px]">{headline}</h2>
          <p className="max-w-[600px] text-[14px] leading-6 text-[var(--text-muted)]">
            {summary}
          </p>
        </div>
        {companyName && roleTitle && (
          <p className="text-[13px] text-[var(--text-soft)]">{roleTitle} at {companyName}</p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {chips.map((chip) => (
            <span
              key={chip}
              className="inline-flex rounded-full border border-[var(--line-soft)] bg-[var(--surface-0)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]"
            >
              {chip}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--line-soft)] bg-[var(--surface-0)] px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10">
          {hasScoreData ? (
            <ScoreRing
              score={Math.round(jobMatchPercent)}
              max={100}
              label="Role Match"
              color="text-[var(--link)]"
            />
          ) : (
            <PendingScoreRing label="Role Match" />
          )}
          {typeof benchmarkMatchPercent === 'number' && (
            hasScoreData ? (
              <ScoreRing
                score={Math.round(benchmarkMatchPercent)}
                max={100}
                label="Benchmark Fit"
                color="text-[var(--badge-blue-text)]"
              />
            ) : (
              <PendingScoreRing label="Benchmark Fit" />
            )
          )}
        </div>
        {strengthSummary && (
          <p className="mx-auto mt-4 max-w-[560px] text-center text-[14px] leading-6 text-[var(--text-muted)]">
            {strengthSummary}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[var(--text-soft)]">
          What to do next
        </h3>
        <div className="rounded-2xl border border-[var(--line-soft)] bg-[var(--surface-0)] px-4 py-4 sm:px-5">
          <div className="space-y-2.5">
            {(actionSummaryLines.length > 0 ? actionSummaryLines : [summary]).slice(0, 3).map((line) => (
              <div key={line} className="flex items-start gap-3">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--link)]" aria-hidden="true" />
                <p className="text-[13px] leading-6 text-[var(--text-muted)]">{line}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="text-center space-y-3 pt-1">
        <p className="text-[14px] text-[var(--text-muted)]">
          {needsReview
            ? 'Review the draft while the strongest improvements are still easy to make.'
            : 'Open the draft and do a final confidence check before export.'}
        </p>
        <button
          type="button"
          onClick={onStartEditing}
          className="inline-flex w-full items-center justify-center rounded-xl bg-[var(--btn-primary-bg)] border border-[var(--btn-primary-border)] px-6 py-3.5 text-[15px] font-semibold text-[var(--btn-primary-text)] shadow-sm hover:bg-[var(--btn-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset-bg)] transition-colors sm:min-w-[220px] sm:w-auto"
        >
          {primaryActionLabel}
        </button>
      </div>
    </div>
  );
}
