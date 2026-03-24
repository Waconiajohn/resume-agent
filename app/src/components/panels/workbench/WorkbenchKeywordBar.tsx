import { cn } from '@/lib/utils';

export interface KeywordItem {
  keyword: string;
  target_density: number;
  current_count: number;
}

interface WorkbenchKeywordBarProps {
  keywords: KeywordItem[];
  content: string;
  onKeywordAction: (keyword: string) => void;
}

function countKeywordInContent(keyword: string, content: string): number {
  if (!keyword || !content) return 0;
  const escaped = keyword
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
  const regex = new RegExp(`(^|[^A-Za-z0-9])(${escaped})(?=$|[^A-Za-z0-9])`, 'gi');
  let count = 0;
  for (const _ of content.matchAll(regex)) {
    count += 1;
  }
  return count;
}

type KeywordStatus = 'met' | 'partial' | 'missing';

function getStatus(liveCount: number, target: number): KeywordStatus {
  if (liveCount >= target) return 'met';
  if (liveCount > 0) return 'partial';
  return 'missing';
}

export function WorkbenchKeywordBar({ keywords, content, onKeywordAction }: WorkbenchKeywordBarProps) {
  if (!keywords || keywords.length === 0) return null;

  // Client-side live counting
  const enriched = keywords.map((kw) => ({
    ...kw,
    liveCount: countKeywordInContent(kw.keyword, content),
  }));

  const metCount = enriched.filter((kw) => getStatus(kw.liveCount, kw.target_density) === 'met').length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-0.5">
        <p className="text-[12px] font-medium tracking-wide uppercase text-[var(--text-soft)]">Keywords</p>
        <span className="text-[12px] text-[var(--text-soft)]">
          {metCount}/{enriched.length} covered
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {enriched.map((kw) => {
          const status = getStatus(kw.liveCount, kw.target_density);
          const isMissing = status === 'missing';

          return (
            <button
              type="button"
              key={kw.keyword}
              onClick={() => isMissing && onKeywordAction(kw.keyword)}
              disabled={!isMissing}
              aria-label={`${kw.keyword} — ${status === 'met' ? 'covered' : status === 'partial' ? 'partially covered' : 'not yet included'}`}
              className={cn(
                'rounded-md border px-2.5 py-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/45',
                status === 'met' &&
                  'border-[#a8d7b8]/35 bg-[#a8d7b8]/[0.08] text-[#a8d7b8]/80 cursor-default',
                status === 'partial' &&
                  'border-[#f0d99f]/30 bg-[#f0d99f]/[0.07] text-[#f0d99f]/70 cursor-default',
                status === 'missing' &&
                  'border-[var(--line-soft)] bg-[var(--accent-muted)] text-[var(--text-soft)] hover:border-[var(--line-strong)] hover:text-[var(--text-muted)] cursor-pointer',
              )}
            >
              {status === 'met' && <span className="mr-0.5 text-[12px]" aria-hidden="true">✓</span>}
              {status === 'partial' && <span className="mr-0.5 text-[12px]" aria-hidden="true">◐</span>}
              {kw.keyword}
              {status !== 'missing' && (
                <span
                  className={cn(
                    'ml-1 text-[12px] tracking-normal',
                    status === 'met' ? 'text-[#a8d7b8]/60' : 'text-[#f0d99f]/50',
                  )}
                >
                  {kw.liveCount}/{kw.target_density}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
