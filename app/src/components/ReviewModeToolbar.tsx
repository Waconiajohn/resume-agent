const SECTION_DISPLAY_NAMES: Record<string, string> = {
  summary: 'Summary',
  selected_accomplishments: 'Accomplishments',
  skills: 'Skills',
  experience: 'Experience',
  education: 'Education',
  certifications: 'Certifications',
};

function toTitleCase(str: string): string {
  return str
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ReviewModeToolbarProps {
  sectionBuildOrder: string[];
  approvedSections: Record<string, string>;
  activeSectionKey: string | null;
  isProcessing: boolean;
}

export function ReviewModeToolbar({
  sectionBuildOrder,
  approvedSections,
  activeSectionKey,
  isProcessing,
}: ReviewModeToolbarProps) {
  if (sectionBuildOrder.length === 0) return null;

  const approvedCount = sectionBuildOrder.filter((k) => k in approvedSections).length;
  const activeLabel = activeSectionKey
    ? (SECTION_DISPLAY_NAMES[activeSectionKey] ?? toTitleCase(activeSectionKey))
    : null;

  return (
    <div className="flex items-center gap-2 border-b border-white/[0.08] bg-white/[0.02] px-4 py-2.5 backdrop-blur-sm">
      {/* Section dots */}
      <div className="flex items-center gap-1.5">
        {sectionBuildOrder.map((key) => {
          const isApproved = key in approvedSections;
          const isActive = key === activeSectionKey;
          return (
            <div
              key={key}
              className="group relative flex items-center gap-1"
            >
              <div
                className={`h-2 w-2 rounded-full transition-all ${
                  isApproved
                    ? 'bg-emerald-400'
                    : isActive
                      ? 'bg-blue-400 ring-2 ring-blue-400/30 dot-current'
                      : 'border border-white/30 bg-transparent'
                }`}
                title={SECTION_DISPLAY_NAMES[key] ?? toTitleCase(key)}
              />
              <span
                className={`hidden text-[11px] font-medium sm:inline ${
                  isApproved
                    ? 'text-emerald-400/80'
                    : isActive
                      ? 'text-blue-400'
                      : 'text-white/40'
                }`}
              >
                {SECTION_DISPLAY_NAMES[key] ?? toTitleCase(key)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Status label */}
      <span className="ml-auto text-xs text-white/50">
        {isProcessing && activeLabel
          ? `Writing your ${activeLabel}...`
          : activeLabel
            ? `Please review your ${activeLabel}`
            : `${approvedCount} of ${sectionBuildOrder.length} sections`}
      </span>
    </div>
  );
}
