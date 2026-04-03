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
    <div className="sticky top-0 z-10 border-b border-[var(--line-soft)] bg-black/40 backdrop-blur-sm px-4 py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-[var(--text-soft)]">
          Section{' '}
          <span className="text-[var(--text-strong)] font-medium">{displayIndex}</span>
          {' '}of{' '}
          <span className="text-[var(--text-strong)] font-medium">{total}</span>
          {': '}
          <span className="text-[var(--text-muted)]">{toTitleCase(currentSection)}</span>
        </span>
        <span className="text-xs text-[var(--text-soft)]">
          {approvedCount}/{total} approved
        </span>
      </div>

      {/* 3px linear progress bar */}
      <div className="flex h-[3px] w-full overflow-hidden bg-[var(--accent-muted)]">
        {sectionOrder.map((section) => {
          const isApproved = sectionsApproved.includes(section);
          const isCurrent = section === currentSection && !isApproved;
          return (
            <div
              key={section}
              className={cn(
                'h-full flex-1',
                isApproved && 'bg-[var(--badge-green-text)]',
                isCurrent && 'bg-[var(--link)] motion-safe:animate-pulse',
                !isApproved && !isCurrent && 'bg-transparent',
              )}
            />
          );
        })}
      </div>
    </div>
  );
}
