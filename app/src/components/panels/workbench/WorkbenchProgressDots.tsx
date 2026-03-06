import { cn } from '@/lib/utils';

interface WorkbenchProgressDotsProps {
  sectionOrder: string[];
  sectionsApproved: string[];
  currentSection: string;
}

function toTitleCase(str: string): string {
  return str
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function WorkbenchProgressDots({
  sectionOrder,
  sectionsApproved,
  currentSection,
}: WorkbenchProgressDotsProps) {
  if (!sectionOrder || sectionOrder.length === 0) return null;

  const total = sectionOrder.length;
  const currentIndex = sectionOrder.indexOf(currentSection);
  const approvedCount = sectionsApproved.length;

  // Position in 1-based display (fallback to approved count + 1 if not found)
  const displayIndex = currentIndex >= 0 ? currentIndex + 1 : approvedCount + 1;

  return (
    <div className="sticky top-0 z-10 border-b border-white/[0.08] bg-black/40 backdrop-blur-sm px-4 py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-white/60">
          Section{' '}
          <span className="text-white/90 font-medium">{displayIndex}</span>
          {' '}of{' '}
          <span className="text-white/90 font-medium">{total}</span>
          {': '}
          <span className="text-white/80">{toTitleCase(currentSection)}</span>
        </span>
        <span className="text-xs text-white/40">
          {approvedCount}/{total} approved
        </span>
      </div>

      {/* 3px linear progress bar */}
      <div className="h-[3px] w-full rounded-full bg-white/10 overflow-hidden flex">
        {sectionOrder.map((section) => {
          const isApproved = sectionsApproved.includes(section);
          const isCurrent = section === currentSection && !isApproved;
          return (
            <div
              key={section}
              className={cn(
                'h-full flex-1',
                isApproved && 'bg-[#a8d7b8]',
                isCurrent && 'bg-[#98b3ff] motion-safe:animate-pulse',
                !isApproved && !isCurrent && 'bg-transparent',
              )}
            />
          );
        })}
      </div>
    </div>
  );
}
