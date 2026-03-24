import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ExperienceEntry } from '@/hooks/useLinkedInOptimizer';

interface ExperienceEntryCardProps {
  entry: ExperienceEntry;
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-[#b5dec2] bg-[#b5dec2]/10';
  if (score >= 60) return 'text-[#f0d99f] bg-[#f0d99f]/10';
  return 'text-red-400 bg-red-400/10';
}

const SCORE_LABELS: Record<keyof ExperienceEntry['quality_scores'], string> = {
  impact: 'Impact',
  metrics: 'Metrics',
  context: 'Context',
  keywords: 'Keywords',
};

export function ExperienceEntryCard({ entry }: ExperienceEntryCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(entry.optimized).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const scores = entry.quality_scores;

  return (
    <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[var(--text-strong)] leading-tight truncate">
            {entry.title}
          </p>
          <p className="text-[12px] text-[var(--text-soft)] mt-0.5">
            {entry.company}
            {entry.duration ? (
              <span className="text-[var(--text-soft)]"> · {entry.duration}</span>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex-shrink-0 flex items-center gap-1.5 text-[13px] text-[var(--text-soft)] hover:text-[var(--text-soft)] transition-colors mt-0.5"
          title="Copy optimized content"
        >
          {copied ? (
            <>
              <Check size={12} className="text-[#b5dec2]" />
              <span className="text-[#b5dec2]">Copied</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              Copy
            </>
          )}
        </button>
      </div>

      {/* Quality score badges */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {(Object.keys(SCORE_LABELS) as Array<keyof ExperienceEntry['quality_scores']>).map((key) => (
          <span
            key={key}
            className={cn(
              'text-[12px] font-medium px-2 py-0.5 rounded-full',
              scoreColor(scores[key]),
            )}
          >
            {SCORE_LABELS[key]} {scores[key]}
          </span>
        ))}
      </div>

      {/* Optimized content */}
      <div className="rounded-lg border border-[#98b3ff]/10 bg-[#98b3ff]/[0.03] px-3 py-2.5">
        <pre className="text-[12px] text-[var(--text-soft)] leading-relaxed whitespace-pre-wrap font-sans">
          {entry.optimized}
        </pre>
      </div>
    </div>
  );
}
