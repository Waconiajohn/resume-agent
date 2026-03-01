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
        <div className="mb-2 flex items-center gap-2 text-white/78">
          <History className="h-4 w-4 text-white/45" />
          <h3 className="text-sm font-semibold">Sections</h3>
        </div>
        <p className="max-w-2xl text-sm text-white/56">
          {isActiveNode
            ? 'The coach is working through section writing/review. Bundle progress is shown below so you can see what is being reviewed versus auto-approved.'
            : 'Bundle review progress from the latest section-review checkpoint.'}
        </p>
        <div className="mt-3 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-white/75">
            <span className="rounded-full border border-white/[0.1] bg-white/[0.03] px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-white/70">
              Bundled Review
            </span>
            <span>{bundleSummary.completed_bundles}/{bundleSummary.total_bundles} bundles complete</span>
            {bundleSummary.current_review_bundle_key && (
              <span className="text-white/55">
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
                    ? 'border-emerald-300/18 bg-emerald-400/[0.04]'
                    : bundle.status === 'in_progress'
                      ? 'border-sky-300/18 bg-sky-400/[0.04]'
                      : bundle.status === 'auto_approved'
                        ? 'border-white/[0.08] bg-white/[0.015]'
                        : 'border-white/[0.06] bg-white/[0.01]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-white/82">{bundle.label}</span>
                  <span className="text-[10px] text-white/50">
                    {bundle.status === 'auto_approved'
                      ? 'auto'
                      : `${bundle.reviewed_required}/${bundle.review_required}`}
                  </span>
                </div>
                <div className="mt-1 text-[10px] text-white/50">
                  {bundle.total_sections} section{bundle.total_sections === 1 ? '' : 's'}
                  {bundle.review_required > 0 ? ` • ${bundle.review_required} in review set` : ' • auto-approved by mode'}
                </div>
                <div className="mt-1 text-[10px] text-white/42">
                  {bundle.status === 'in_progress'
                    ? 'In progress'
                    : bundle.status === 'complete'
                      ? 'Complete'
                      : bundle.status === 'auto_approved'
                        ? 'Auto-approved'
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
