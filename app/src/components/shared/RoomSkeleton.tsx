import { GlassSkeleton } from '@/components/GlassSkeleton';

/**
 * Standard loading skeleton for room components.
 * Used as the Suspense fallback while lazy-loaded room modules are loading.
 */
export function RoomSkeleton() {
  return (
    <div role="status" aria-label="Loading..." className="flex flex-col gap-6 p-6 max-w-[1400px] mx-auto">
      {/* Title + subtitle */}
      <div className="flex flex-col gap-2">
        <GlassSkeleton className="h-5 w-40" />
        <GlassSkeleton className="h-3.5 w-72" />
      </div>

      {/* Main content area */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Primary column */}
        <div className="flex-[3] min-w-0 flex flex-col gap-3">
          <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-5">
            <GlassSkeleton className="h-4 w-32 mb-4" />
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4 flex items-center gap-3"
                >
                  <GlassSkeleton className="h-8 w-8 rounded-lg flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <GlassSkeleton className="h-3 w-3/4" />
                    <GlassSkeleton className="h-2.5 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Secondary column */}
        <div className="flex-[2] flex flex-col gap-4">
          <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-5">
            <GlassSkeleton className="h-4 w-28 mb-4" />
            <div className="space-y-3">
              <GlassSkeleton className="h-3 w-full" />
              <GlassSkeleton className="h-3 w-5/6" />
              <GlassSkeleton className="h-3 w-4/5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
