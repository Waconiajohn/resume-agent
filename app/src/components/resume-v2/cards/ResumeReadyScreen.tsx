import { ScoreRing } from '@/components/shared/ScoreRing';
import { REVIEW_STATE_DISPLAY } from '../utils/review-state-labels';

interface ResumeReadyScreenProps {
  jobMatchPercent: number;
  benchmarkMatchPercent: number;
  strengthSummary: string;
  flaggedBulletCount: number;
  companyName?: string;
  roleTitle?: string;
  /** True when score_breakdown was present in gap analysis. Distinguishes genuine 0% from missing data. */
  hasScoreData?: boolean;
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
          <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="3" className="text-neutral-200" />
          <circle
            cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="3"
            strokeDasharray={circumference} strokeLinecap="round"
            className="text-neutral-300"
            style={{ strokeDashoffset: circumference * 0.75 }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-neutral-400">
          —
        </span>
      </div>
      <span className="text-[12px] font-semibold uppercase tracking-wider text-neutral-400">Calculating\u2026</span>
    </div>
  );
}

export function ResumeReadyScreen({
  jobMatchPercent,
  benchmarkMatchPercent,
  strengthSummary,
  flaggedBulletCount,
  companyName,
  roleTitle,
  hasScoreData = true,
  onStartEditing,
}: ResumeReadyScreenProps) {
  return (
    <div className="bg-white rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.35)] p-8 space-y-8">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-[22px] font-semibold text-neutral-800">Your Resume Is Ready</h2>
        {companyName && roleTitle && (
          <p className="mt-1 text-[13px] text-neutral-400">{roleTitle} at {companyName}</p>
        )}
      </div>

      {/* Section A: Scores */}
      <div className="space-y-4">
        <div className="flex justify-center gap-10">
          {hasScoreData ? (
            <ScoreRing
              score={Math.round(jobMatchPercent)}
              max={100}
              label="Job Match"
              color="text-blue-500"
            />
          ) : (
            <PendingScoreRing label="Job Match" />
          )}
          {hasScoreData ? (
            <ScoreRing
              score={Math.round(benchmarkMatchPercent)}
              max={100}
              label="Benchmark Match"
              color="text-emerald-500"
            />
          ) : (
            <PendingScoreRing label="Benchmark Match" />
          )}
        </div>
        {strengthSummary && (
          <p className="text-[14px] leading-relaxed text-neutral-600 text-center max-w-[520px] mx-auto">
            {strengthSummary}
          </p>
        )}
      </div>

      {/* Section B: Color legend */}
      <div className="space-y-3">
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-neutral-400">
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
                  <p className="text-[13px] font-semibold text-neutral-700">
                    {display.label}
                  </p>
                  <p className="text-[12px] leading-relaxed text-neutral-500">
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
          <p className="text-[14px] text-neutral-600">
            You have <span className="font-semibold">{flaggedBulletCount}</span>{' '}
            {flaggedBulletCount === 1 ? 'bullet' : 'bullets'} that{' '}
            {flaggedBulletCount === 1 ? 'needs' : 'need'} your input.
          </p>
        ) : (
          <p className="text-[14px] text-neutral-600">
            Your resume looks great — no lines flagged.
          </p>
        )}
        <button
          type="button"
          onClick={onStartEditing}
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-[15px] font-semibold text-white shadow-sm hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-colors"
        >
          Start Editing My Resume
        </button>
      </div>
    </div>
  );
}
