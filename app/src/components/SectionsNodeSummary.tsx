import { History } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { renderNodeContentPlaceholder } from '@/lib/coach-screen-utils';

interface BundleSummary {
  review_strategy: 'per_section' | 'bundled';
  current_review_bundle_key: 'headline' | 'core_experience' | 'supporting' | null;
  total_bundles: number;
  completed_bundles: number;
  bundles: Array<{
    key: 'headline' | 'core_experience' | 'supporting';
    label: string;
    total_sections: number;
    review_required: number;
    reviewed_required: number;
    status: 'pending' | 'in_progress' | 'complete' | 'auto_approved';
  }>;
}

interface SectionsNodeSummaryProps {
  isActiveNode: boolean;
  bundleSummary?: BundleSummary | null;
}

export function SectionsNodeSummary({ isActiveNode, bundleSummary }: SectionsNodeSummaryProps) {
  if (!bundleSummary || bundleSummary.review_strategy !== 'bundled' || bundleSummary.total_bundles <= 0) {
    return renderNodeContentPlaceholder('sections', isActiveNode);
  }
  return (
    <div className="h-full p-3 md:p-4">
      <GlassCard className="h-full p-6">
        <div className="mb-2 flex items-center gap-2 text-[var(--text-muted)]">
          <History className="h-4 w-4 text-[var(--text-soft)]" />
          <h3 className="text-sm font-semibold">Sections</h3>
        </div>
        <p className="max-w-2xl text-sm text-[var(--text-soft)]">
          {isActiveNode
            ? 'The coach is working through section writing/review. Bundle progress is shown below so you can see what is being reviewed versus what draft-now mode continued automatically.'
            : 'Bundle review progress from the latest section-review checkpoint.'}
        </p>
        <div className="mt-3 rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
            <span className="rounded-full border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2 py-0.5 text-[12px] uppercase tracking-[0.1em] text-[var(--text-soft)]">
              Bundled Review
            </span>
            <span>{bundleSummary.completed_bundles}/{bundleSummary.total_bundles} bundles complete</span>
            {bundleSummary.current_review_bundle_key && (
              <span className="text-[var(--text-soft)]">
                Current: {bundleSummary.bundles.find((b) => b.key === bundleSummary.current_review_bundle_key)?.label ?? bundleSummary.current_review_bundle_key}
              </span>
            )}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {bundleSummary.bundles.map((bundle) => (
              <div
                key={`sections-node-bundle-${bundle.key}`}
                className={`rounded-lg border px-2.5 py-2 ${
                  bundle.status === 'complete'
                    ? 'border-[#b5dec2]/18 bg-[#b5dec2]/[0.04]'
                    : bundle.status === 'in_progress'
                      ? 'border-[#afc4ff]/18 bg-[#afc4ff]/[0.04]'
                      : bundle.status === 'auto_approved'
                        ? 'border-[var(--line-soft)] bg-[var(--accent-muted)]'
                        : 'border-[var(--line-soft)] bg-[var(--accent-muted)]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-[var(--text-strong)]">{bundle.label}</span>
                  <span className="text-[12px] text-[var(--text-soft)]">
                    {bundle.status === 'auto_approved'
                      ? 'auto'
                      : `${bundle.reviewed_required}/${bundle.review_required}`}
                  </span>
                </div>
                <div className="mt-1 text-[12px] text-[var(--text-soft)]">
                  {bundle.total_sections} section{bundle.total_sections === 1 ? '' : 's'}
                  {bundle.review_required > 0 ? ` • ${bundle.review_required} in review set` : ' • continued automatically in draft-now mode'}
                </div>
                <div className="mt-1 text-[12px] text-[var(--text-soft)]">
                  {bundle.status === 'in_progress'
                    ? 'In progress'
                    : bundle.status === 'complete'
                      ? 'Complete'
                      : bundle.status === 'auto_approved'
                        ? 'Continued automatically'
                        : 'Pending'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
