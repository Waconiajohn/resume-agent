import { cn } from '@/lib/utils';
import type { PostedWithin, WorkModes } from '@/hooks/useJobFilters';

export interface JobFilterPanelProps {
  location: string;
  onLocationChange: (location: string) => void;
  radiusMiles: number;
  onRadiusMilesChange: (miles: number) => void;
  workModes: WorkModes;
  onWorkModesChange: (modes: WorkModes) => void;
  postedWithin: PostedWithin;
  onPostedWithinChange: (value: PostedWithin) => void;
}

const RADIUS_OPTIONS: { value: number; label: string }[] = [
  { value: 10, label: '10 miles' },
  { value: 25, label: '25 miles' },
  { value: 50, label: '50 miles' },
  { value: 100, label: '100 miles' },
];

const POSTED_WITHIN_OPTIONS: { value: PostedWithin; label: string }[] = [
  { value: '24h', label: 'Today' },
  { value: '3d', label: 'Last 3 days' },
  { value: '7d', label: 'Last 7 days' },
  { value: '14d', label: 'Last 14 days' },
];

const WORK_MODE_CHIPS: { key: keyof WorkModes; label: string }[] = [
  { key: 'remote', label: 'Remote' },
  { key: 'hybrid', label: 'Hybrid' },
  { key: 'onsite', label: 'On-site' },
];

const selectBase =
  'rounded-lg border border-[var(--line-soft)] bg-[var(--surface-2)] px-2.5 py-1.5 text-sm text-[var(--text-strong)] outline-none transition-[border-color,background-color] duration-200 focus-visible:border-[var(--link)]/40 focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--focus-ring-offset-bg)] cursor-pointer';

export function JobFilterPanel({
  location,
  onLocationChange,
  radiusMiles,
  onRadiusMilesChange,
  workModes,
  onWorkModesChange,
  postedWithin,
  onPostedWithinChange,
}: JobFilterPanelProps) {
  function toggleWorkMode(key: keyof WorkModes) {
    onWorkModesChange({ ...workModes, [key]: !workModes[key] });
  }

  return (
    <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--surface-1)] px-4 py-3">
      <div className="flex flex-wrap items-end gap-3">

        {/* Location */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-soft)]">
            Location
          </label>
          <input
            type="text"
            value={location}
            onChange={(e) => onLocationChange(e.target.value)}
            placeholder="City, State (e.g., Portland, OR)"
            aria-label="Filter by location"
            className={cn(
              'w-[200px] rounded-lg border border-[var(--line-soft)] bg-[var(--surface-2)] px-2.5 py-1.5 text-sm text-[var(--text-strong)] placeholder:text-[var(--text-soft)] outline-none transition-[border-color,background-color] duration-200',
              'focus-visible:border-[var(--link)]/40 focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--focus-ring-offset-bg)]',
            )}
          />
        </div>

        {/* Radius — only visible when location has a value */}
        {location.trim().length > 0 && (
          <div className="flex flex-col gap-1">
            <label
              htmlFor="job-filter-radius"
              className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-soft)]"
            >
              Radius
            </label>
            <select
              id="job-filter-radius"
              value={radiusMiles}
              onChange={(e) => onRadiusMilesChange(Number(e.target.value))}
              aria-label="Search radius in miles"
              className={cn(selectBase, 'w-[120px]')}
            >
              {RADIUS_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Work Mode */}
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-soft)]">
            Work Mode
          </span>
          <div className="flex items-center gap-1.5" role="group" aria-label="Work mode filters">
            {WORK_MODE_CHIPS.map(({ key, label }) => {
              const active = workModes[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleWorkMode(key)}
                  aria-pressed={active}
                  className={cn(
                    'rounded-full px-3 py-1 text-[12px] font-medium transition-colors duration-150 border',
                    active
                      ? 'border-[var(--link)]/40 bg-[var(--link)]/15 text-[var(--link)]'
                      : 'border-[var(--line-soft)] bg-[var(--accent-muted)] text-[var(--text-soft)] hover:border-[var(--line-strong)] hover:text-[var(--text-muted)]',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Posted Within */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="job-filter-posted-within"
            className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-soft)]"
          >
            Posted Within
          </label>
          <select
            id="job-filter-posted-within"
            value={postedWithin}
            onChange={(e) => onPostedWithinChange(e.target.value as PostedWithin)}
            aria-label="Jobs posted within"
            className={cn(selectBase, 'w-[140px]')}
          >
            {POSTED_WITHIN_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

      </div>
    </div>
  );
}
