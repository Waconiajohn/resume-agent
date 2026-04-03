import { useState } from 'react';
import { Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ExperienceEntry } from '@/hooks/useLinkedInOptimizer';

interface ExperienceEntryCardProps {
  entry: ExperienceEntry;
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-[var(--badge-green-text)] bg-[var(--badge-green-text)]/10';
  if (score >= 60) return 'text-[var(--badge-amber-text)] bg-[var(--badge-amber-text)]/10';
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
  const [isExpanded, setIsExpanded] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  const hasOriginal = entry.original.trim().length > 0;
  const scores = entry.quality_scores;

  const handleCopy = () => {
    navigator.clipboard.writeText(entry.optimized).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)]">
      {/* Header row — always visible, clickable to expand/collapse */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        className="w-full flex items-start justify-between gap-3 p-4 text-left"
      >
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
        <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
          {/* Compact score badges in collapsed header */}
          <div className="flex flex-wrap gap-1">
            {(Object.keys(SCORE_LABELS) as Array<keyof ExperienceEntry['quality_scores']>).map((key) => (
              <span
                key={key}
                className={cn(
                  'text-[11px] font-medium px-1.5 rounded-full leading-5',
                  scoreColor(scores[key]),
                )}
              >
                {scores[key]}
              </span>
            ))}
          </div>
          {isExpanded ? (
            <ChevronUp size={14} className="text-[var(--text-soft)]" />
          ) : (
            <ChevronDown size={14} className="text-[var(--text-soft)]" />
          )}
        </div>
      </button>

      {/* Expanded body */}
      {isExpanded && (
        <div className="px-4 pb-4 flex flex-col gap-3">
          {/* Score badges with labels */}
          <div className="flex flex-wrap gap-1.5">
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

          {/* Before/after toggle — only shown when original content is available */}
          {hasOriginal && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowOriginal(false)}
                className={cn(
                  'text-[12px] px-3 py-1 rounded-lg border transition-colors',
                  !showOriginal
                    ? 'border-[var(--link)]/40 bg-[var(--link)]/10 text-[var(--link)]'
                    : 'border-[var(--line-soft)] text-[var(--text-soft)] hover:text-[var(--text-strong)]',
                )}
              >
                Optimized
              </button>
              <button
                type="button"
                onClick={() => setShowOriginal(true)}
                className={cn(
                  'text-[12px] px-3 py-1 rounded-lg border transition-colors',
                  showOriginal
                    ? 'border-[var(--link)]/40 bg-[var(--link)]/10 text-[var(--link)]'
                    : 'border-[var(--line-soft)] text-[var(--text-soft)] hover:text-[var(--text-strong)]',
                )}
              >
                Original
              </button>
            </div>
          )}

          {/* Content area */}
          <div className="rounded-lg border border-[var(--link)]/10 bg-[var(--link)]/[0.03] px-3 py-2.5">
            <pre className="text-[12px] text-[var(--text-soft)] leading-relaxed whitespace-pre-wrap font-sans">
              {showOriginal && hasOriginal ? entry.original : entry.optimized}
            </pre>
          </div>

          {/* Copy button */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-[13px] text-[var(--text-soft)] hover:text-[var(--text-strong)] transition-colors"
              title="Copy optimized content"
            >
              {copied ? (
                <>
                  <Check size={12} className="text-[var(--badge-green-text)]" />
                  <span className="text-[var(--badge-green-text)]">Copied</span>
                </>
              ) : (
                <>
                  <Copy size={12} />
                  Copy
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
