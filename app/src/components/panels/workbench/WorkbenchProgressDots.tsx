import { Check } from 'lucide-react';
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

  return (
    <div className="sticky top-0 z-10 border-b border-white/[0.08] bg-black/40 backdrop-blur-sm px-4 py-2.5">
      <div className="flex items-center justify-center gap-2 flex-wrap">
        {sectionOrder.map((section) => {
          const isApproved = sectionsApproved.includes(section);
          const isCurrent = section === currentSection;

          const statusLabel = isApproved ? 'approved' : isCurrent ? 'current' : 'pending';
          return (
            <div key={section} className="relative group">
              <div
                role="img"
                aria-label={`${toTitleCase(section)}: ${statusLabel}`}
                className={cn(
                  'h-2 w-2 rounded-full transition-all duration-300 flex items-center justify-center',
                  isApproved && 'bg-[#a8d7b8]',
                  isCurrent && !isApproved && 'bg-[#98b3ff] animate-pulse',
                  !isApproved && !isCurrent && 'bg-white/20',
                )}
              >
                {isApproved && (
                  <Check
                    className="absolute -top-0.5 -left-0.5 h-3 w-3 text-[#a8d7b8]"
                    strokeWidth={3}
                  />
                )}
              </div>
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20">
                <div className="whitespace-nowrap rounded bg-black/80 border border-white/[0.1] px-2 py-1 text-[10px] text-white/80">
                  {toTitleCase(section)}
                </div>
                <div className="mx-auto h-1 w-1 rotate-45 bg-black/80 border-b border-r border-white/[0.1] -mt-0.5" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
