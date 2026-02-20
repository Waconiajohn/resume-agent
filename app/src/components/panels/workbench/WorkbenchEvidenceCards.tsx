import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EvidenceItem {
  id: string;
  situation: string;
  action: string;
  result: string;
  metrics_defensible: boolean;
  user_validated: boolean;
  mapped_requirements: string[];
  scope_metrics: Record<string, string>;
}

interface WorkbenchEvidenceCardsProps {
  evidence: EvidenceItem[];
  content: string;
  onWeaveIn: (evidence: EvidenceItem) => void;
}

const INITIAL_VISIBLE = 3;

function isEvidenceUsed(evidenceResult: string, content: string): boolean {
  if (!evidenceResult || !content) return false;
  // Check if any significant phrase from the result appears in content
  const words = evidenceResult
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 4);
  if (words.length === 0) return false;
  const contentLower = content.toLowerCase();
  const matches = words.filter((w) => contentLower.includes(w));
  return matches.length >= Math.min(3, Math.ceil(words.length * 0.4));
}

function truncate(str: string, maxLen: number): string {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen).trimEnd() + '…' : str;
}

interface EvidenceCardProps {
  item: EvidenceItem;
  content: string;
  onWeaveIn: (evidence: EvidenceItem) => void;
}

function EvidenceCard({ item, content, onWeaveIn }: EvidenceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const used = isEvidenceUsed(item.result, content);

  const scopeBadges = Object.entries(item.scope_metrics || {})
    .filter(([, v]) => v)
    .slice(0, 3);

  return (
    <div
      className={cn(
        'rounded-xl border p-3 transition-all duration-200',
        used
          ? 'border-[#a8d7b8]/25 bg-[#a8d7b8]/[0.04]'
          : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.12]',
      )}
    >
      {/* Result headline */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              'text-sm font-medium leading-snug line-clamp-1',
              used ? 'text-[#a8d7b8]/80' : 'text-white/80',
            )}
          >
            {item.result || 'No result recorded'}
          </p>
        </div>
        {used && (
          <span className="flex-shrink-0 flex items-center gap-0.5 text-[10px] text-[#a8d7b8]/70 font-medium">
            <Check className="h-3 w-3" />
            Used
          </span>
        )}
      </div>

      {/* Scope badges */}
      {scopeBadges.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {scopeBadges.map(([k, v]) => (
            <span
              key={k}
              className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/50"
            >
              {k.replace(/_/g, ' ')}: {v}
            </span>
          ))}
        </div>
      )}

      {/* Requirement badges */}
      {item.mapped_requirements && item.mapped_requirements.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {item.mapped_requirements.slice(0, 3).map((req) => (
            <span
              key={req}
              className="rounded-full border border-[#98b3ff]/20 bg-[#98b3ff]/[0.07] px-2 py-0.5 text-[10px] text-[#98b3ff]/70"
            >
              {truncate(req, 30)}
            </span>
          ))}
        </div>
      )}

      {/* Expanded STAR detail */}
      {expanded && (
        <div className="mt-3 space-y-2 border-t border-white/[0.06] pt-3">
          {item.situation && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-white/35 mb-0.5">
                Situation
              </p>
              <p className="text-xs text-white/65 leading-relaxed">{item.situation}</p>
            </div>
          )}
          {item.action && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-white/35 mb-0.5">
                Action
              </p>
              <p className="text-xs text-white/65 leading-relaxed">{item.action}</p>
            </div>
          )}
        </div>
      )}

      {/* Footer actions */}
      <div className="mt-2.5 flex items-center gap-2">
        <button
          onClick={() => setExpanded((p) => !p)}
          className="flex items-center gap-1 text-[10px] text-white/40 hover:text-white/60 transition-colors"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? 'Less' : 'More'}
        </button>
        <div className="flex-1" />
        {!used && (
          <button
            onClick={() => onWeaveIn(item)}
            className="flex items-center gap-1 rounded-full border border-white/[0.1] bg-white/[0.03] px-2.5 py-1 text-[10px] font-medium text-white/55 hover:border-white/[0.2] hover:text-white/80 transition-all duration-150"
          >
            <Layers className="h-3 w-3" />
            Weave In
          </button>
        )}
      </div>
    </div>
  );
}

export function WorkbenchEvidenceCards({
  evidence,
  content,
  onWeaveIn,
}: WorkbenchEvidenceCardsProps) {
  const [showAll, setShowAll] = useState(false);

  if (!evidence || evidence.length === 0) return null;

  const visible = showAll ? evidence : evidence.slice(0, INITIAL_VISIBLE);
  const hiddenCount = evidence.length - INITIAL_VISIBLE;

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-medium tracking-wide uppercase text-white/35 px-0.5">
        Evidence Library
      </p>
      <div className="space-y-2">
        {visible.map((item, idx) => (
          <EvidenceCard
            key={item.id || `evidence_${idx}_${item.result.slice(0, 24)}`}
            item={item}
            content={content}
            onWeaveIn={onWeaveIn}
          />
        ))}
      </div>
      {!showAll && hiddenCount > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full rounded-xl border border-white/[0.06] bg-white/[0.02] py-2 text-xs text-white/40 hover:text-white/60 hover:border-white/[0.1] transition-all duration-150"
        >
          Show {hiddenCount} more
        </button>
      )}
    </div>
  );
}
