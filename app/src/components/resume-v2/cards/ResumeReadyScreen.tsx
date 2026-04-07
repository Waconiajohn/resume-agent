import { ScoreRing } from '@/components/shared/ScoreRing';
import { REVIEW_STATE_DISPLAY } from '../utils/review-state-labels';

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

const LEGEND_STATES = ['code_red', 'confirm_fit', 'strengthen', 'supported'] as const;

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
  return (
    <div className="bg-[var(--surface-1)] rounded-lg shadow-[var(--shadow-mid)] p-8 space-y-8">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-[22px] font-semibold text-[var(--text-strong)]">Your Resume Is Ready</h2>
        {companyName && roleTitle && (
          <p className="mt-1 text-[13px] text-[var(--text-soft)]">{roleTitle} at {companyName}</p>
        )}
      </div>

      {/* Section A: Scores */}
      <div className="space-y-4">
        <div className="flex justify-center gap-10">
          {hasScoreData ? (
            <ScoreRing
              score={Math.round(jobMatchPercent)}
              max={100}
              label="Resume Match"
              color="text-[var(--link)]"
            />
          ) : (
            <PendingScoreRing label="Resume Match" />
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
          <p className="text-[14px] leading-relaxed text-[var(--text-muted)] text-center max-w-[520px] mx-auto">
            {strengthSummary}
          </p>
        )}
      </div>

      {actionSummaryLines.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">
            Best next moves
          </h3>
          <div className="space-y-2 rounded-lg border border-[var(--line-soft)] bg-[var(--surface-0)] px-4 py-3">
            {actionSummaryLines.map((line) => (
              <p key={line} className="text-[13px] leading-relaxed text-[var(--text-muted)]">
                {line}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Section B: Color legend */}
      <div className="space-y-3">
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">
          What the colors mean
        </h3>
        <div className="space-y-2.5">
          {LEGEND_STATES.map((state) => {
            const display = REVIEW_STATE_DISPLAY[state];
            return (
              <div key={state} className="flex items-start gap-3">
                <span
                  className="mt-1 h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: display.colorHex }}
                  aria-hidden="true"
                />
                <div>
                  <p className="text-[13px] font-semibold text-[var(--text-strong)]">
                    {display.label}
                  </p>
                  <p className="text-[12px] leading-relaxed text-[var(--text-soft)]">
                    {display.meaning}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section C: CTA */}
      <div className="text-center space-y-3 pt-2">
        {flaggedBulletCount > 0 ? (
          <p className="text-[14px] text-[var(--text-muted)]">
            You have <span className="font-semibold">{flaggedBulletCount}</span>{' '}
            {flaggedBulletCount === 1 ? 'bullet' : 'bullets'} that{' '}
            {flaggedBulletCount === 1 ? 'needs' : 'need'} your input.
          </p>
        ) : (
          <p className="text-[14px] text-[var(--text-muted)]">
            Your resume looks great — no lines flagged.
          </p>
        )}
        <button
          type="button"
          onClick={onStartEditing}
          className="inline-flex items-center justify-center rounded-lg bg-[var(--btn-primary-bg)] border border-[var(--btn-primary-border)] px-6 py-3 text-[15px] font-semibold text-[var(--btn-primary-text)] shadow-sm hover:bg-[var(--btn-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset-bg)] transition-colors"
        >
          {primaryActionLabel}
        </button>
      </div>
    </div>
  );
}
