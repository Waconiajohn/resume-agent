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
    <div className="flex items-center gap-2 border-b border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-2.5 backdrop-blur-sm">
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
                    ? 'bg-[var(--badge-green-text)]'
                    : isActive
                      ? 'bg-[var(--link)] ring-2 ring-[var(--link)]/30 dot-current'
                      : 'border border-[var(--text-soft)] bg-transparent'
                }`}
                role="img"
                aria-label={`${SECTION_DISPLAY_NAMES[key] ?? toTitleCase(key)}: ${isApproved ? 'approved' : isActive ? 'reviewing now' : 'pending'}`}
              />
              <span
                className={`hidden text-[13px] font-medium sm:inline ${
                  isApproved
                    ? 'text-[var(--badge-green-text)]/80'
                    : isActive
                      ? 'text-[var(--link)]'
                      : 'text-[var(--text-soft)]'
                }`}
              >
                {SECTION_DISPLAY_NAMES[key] ?? toTitleCase(key)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Status label */}
      <span className="ml-auto text-xs text-[var(--text-soft)]" aria-live="polite" role="status">
        {isProcessing && activeLabel
          ? `Writing your ${activeLabel}...`
          : activeLabel
            ? `Please review your ${activeLabel}`
            : `${approvedCount} of ${sectionBuildOrder.length} sections`}
      </span>
    </div>
  );
}
