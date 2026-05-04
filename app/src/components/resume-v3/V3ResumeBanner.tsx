/**
 * V3ResumeBanner — "pick up where you left off" prompt.
 *
 * Rendered above the intake form when useV3SessionPersistence surfaces a
 * resumable snapshot. Two actions:
 *   • Resume — hydrates the pipeline state in-place, jumps straight to the
 *     tailored resume results view.
 *   • Start fresh — dismisses the banner, clears the cache, leaves the
 *     intake form visible.
 */

import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { ArrowRight, Clock } from 'lucide-react';

interface V3ResumeBannerProps {
  jdTitle?: string | null;
  jdCompany?: string | null;
  savedAt: number;
  onResume: () => void;
  onDiscard: () => void;
}

function formatRelative(ms: number): string {
  const delta = Date.now() - ms;
  if (delta < 60_000) return 'moments ago';
  if (delta < 3_600_000) {
    const mins = Math.round(delta / 60_000);
    return `${mins}m ago`;
  }
  if (delta < 86_400_000) {
    const hrs = Math.round(delta / 3_600_000);
    return `${hrs}h ago`;
  }
  const days = Math.round(delta / 86_400_000);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

export function V3ResumeBanner({
  jdTitle,
  jdCompany,
  savedAt,
  onResume,
  onDiscard,
}: V3ResumeBannerProps) {
  const context =
    jdTitle && jdCompany
      ? `for ${jdTitle} at ${jdCompany}`
      : jdTitle
        ? `for ${jdTitle}`
        : jdCompany
          ? `at ${jdCompany}`
          : null;

  return (
    <GlassCard className="p-4 border-[var(--bullet-confirm-border)]/60">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--bullet-confirm)]">
            Pick up where you left off
          </div>
          <p className="text-sm text-[var(--text-strong)] mt-1">
            Your last tailored resume is ready to resume
            {context ? ` — ${context}` : ''}.
          </p>
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[var(--text-soft)]">
            <Clock className="h-3 w-3" />
            <span>Completed {formatRelative(savedAt)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <GlassButton variant="ghost" size="sm" onClick={onDiscard}>
            Start fresh
          </GlassButton>
          <GlassButton variant="primary" size="sm" onClick={onResume}>
            Resume
            <ArrowRight className="h-4 w-4 ml-1.5" />
          </GlassButton>
        </div>
      </div>
    </GlassCard>
  );
}
