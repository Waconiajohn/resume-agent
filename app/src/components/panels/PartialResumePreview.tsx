import { FileText } from 'lucide-react';

interface PartialResumePreviewProps {
  approvedSections: Record<string, string>;
  totalSections?: number;
}

function toTitleCase(str: string): string {
  return str
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function PartialResumePreview({ approvedSections, totalSections = 7 }: PartialResumePreviewProps) {
  const sections = Object.entries(approvedSections);
  const approvedCount = sections.length;

  return (
    <div data-panel-root className="flex h-full flex-col">
      <div className="border-b border-white/[0.12] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-[#afc4ff]" />
            <span className="text-sm font-medium text-white/85">Resume Preview</span>
          </div>
          <span className="text-xs text-white/50">
            {approvedCount} of {totalSections} sections
          </span>
        </div>
      </div>

      <div data-panel-scroll className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-2xl space-y-4">
          {/* Paper view */}
          <div className="rounded-lg border border-white/[0.10] bg-white/[0.95] p-6 shadow-lg">
            {sections.length > 0 ? (
              sections.map(([key, content]) => (
                <div key={key} className="mb-4 last:mb-0">
                  <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-gray-500">
                    {toTitleCase(key)}
                  </h3>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                    {content}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-sm text-gray-400">
                Approved sections will appear here as you review them.
              </p>
            )}
          </div>

          {/* Pending sections skeleton */}
          {approvedCount < totalSections && (
            <div className="space-y-2">
              {Array.from({ length: totalSections - approvedCount }).map((_, i) => (
                <div
                  key={`pending-${i}`}
                  className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3"
                >
                  <div className="mb-2 h-3 w-24 animate-pulse rounded bg-white/[0.08]" />
                  <div className="space-y-1.5">
                    <div className="h-2 w-full animate-pulse rounded bg-white/[0.05]" />
                    <div className="h-2 w-3/4 animate-pulse rounded bg-white/[0.05]" />
                    <div className="h-2 w-5/6 animate-pulse rounded bg-white/[0.05]" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
