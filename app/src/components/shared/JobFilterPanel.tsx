import { cn } from '@/lib/utils';
import type { PostedWithin, WorkModeKey, WorkModes } from '@/hooks/useJobFilters';

export interface JobFilterPanelProps {
  location: string;
  onLocationChange: (location: string) => void;
  radiusMiles: number;
  onRadiusMilesChange: (miles: number) => void;
  workModes: WorkModes;
  onWorkModesChange: (modes: WorkModes) => void;
  postedWithin: PostedWithin;
  onPostedWithinChange: (value: PostedWithin) => void;
  workModeSelection?: 'multi' | 'single' | 'scan-shape';
  guidanceText?: string;
}

const RADIUS_OPTIONS: { value: number; label: string }[] = [
  { value: 10, label: '10 miles' },
  { value: 25, label: '25 miles' },
  { value: 50, label: '50 miles' },
  { value: 100, label: '100 miles' },
];

const POSTED_WITHIN_OPTIONS: { value: PostedWithin; label: string }[] = [
  { value: '24h', label: 'Last 24 hours' },
  { value: '3d', label: 'Last 3 days' },
  { value: '7d', label: 'Last 7 days' },
  { value: '14d', label: 'Last 14 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'any', label: 'Any date' },
];

const WORK_MODE_CHIPS: { key: WorkModeKey; label: string }[] = [
  { key: 'remote', label: 'Remote' },
  { key: 'hybrid', label: 'Hybrid' },
  { key: 'onsite', label: 'On-site' },
];

const SINGLE_WORK_MODE_CHIPS: { key: WorkModeKey | 'any'; label: string }[] = [
  { key: 'any', label: 'Any' },
  { key: 'remote', label: 'Remote' },
  { key: 'hybrid', label: 'Hybrid' },
  { key: 'onsite', label: 'On-site' },
];

const SCAN_SHAPE_CHIPS: { key: WorkModeKey; label: string; hint: string }[] = [
  { key: 'remote', label: 'Remote', hint: 'Nationwide' },
  { key: 'hybrid', label: 'Hybrid', hint: 'Uses location' },
  { key: 'onsite', label: 'On-site', hint: 'Uses location' },
];

const insiderGuidance =
  'Run one search shape at a time: Remote is nationwide, while Hybrid and On-site use city/state as a search hint. Posted-within filters only include jobs with a readable source date; Any date also allows undated public job pages.';

const broadSearchGuidance =
  'Broad Search checks Google web results for public ATS and career pages. Posted-within filters only show jobs with a readable source date; Any date also allows undated public job pages.';

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
  workModeSelection = 'multi',
  guidanceText,
}: JobFilterPanelProps) {
  const activeModeCount = Object.values(workModes).filter(Boolean).length;
  const singleModeValue: WorkModeKey | 'any' =
    activeModeCount === 1
      ? (WORK_MODE_CHIPS.find(({ key }) => workModes[key])?.key ?? 'any')
      : 'any';
  const scanShapeValue: WorkModeKey =
    activeModeCount === 1
      ? (WORK_MODE_CHIPS.find(({ key }) => workModes[key])?.key ?? 'remote')
      : 'remote';
  const resolvedGuidance = guidanceText
    ?? (workModeSelection === 'single' ? broadSearchGuidance : insiderGuidance);
  const remoteOnly = workModes.remote && !workModes.hybrid && !workModes.onsite;

  function toggleWorkMode(key: WorkModeKey) {
    if (workModes[key] && activeModeCount === 1) return;
    onWorkModesChange({ ...workModes, [key]: !workModes[key] });
  }

  function chooseSingleWorkMode(key: WorkModeKey | 'any') {
    onWorkModesChange({
      remote: key === 'remote',
      hybrid: key === 'hybrid',
      onsite: key === 'onsite',
    });
  }

  function chooseScanShape(key: WorkModeKey) {
    onWorkModesChange({
      remote: key === 'remote',
      hybrid: key === 'hybrid',
      onsite: key === 'onsite',
    });
  }

  return (
    <div className="rounded-[8px] border border-[var(--line-soft)] bg-[var(--surface-1)] px-4 py-3">
      <div className="flex flex-wrap items-end gap-3">

        {/* Location */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-soft)]">
            {remoteOnly ? 'Location' : 'Location'}
          </label>
          <input
            type="text"
            value={remoteOnly ? '' : location}
            onChange={(e) => onLocationChange(e.target.value)}
            placeholder={remoteOnly ? 'Remote searches run nationwide' : 'City, State (e.g., Portland, OR)'}
            aria-label={remoteOnly ? 'Remote searches run nationwide' : 'Filter by location'}
            disabled={remoteOnly}
            className={cn(
              'w-[200px] rounded-lg border border-[var(--line-soft)] bg-[var(--surface-2)] px-2.5 py-1.5 text-sm text-[var(--text-strong)] placeholder:text-[var(--text-soft)] outline-none transition-[border-color,background-color] duration-200',
              'focus-visible:border-[var(--link)]/40 focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--focus-ring-offset-bg)]',
              remoteOnly && 'cursor-not-allowed bg-[var(--accent-muted)] text-[var(--text-soft)]',
            )}
          />
        </div>

        {/* Location reach — only visible when location has a value */}
        {!remoteOnly && location.trim().length > 0 && (
          <div className="flex flex-col gap-1">
            <label
              htmlFor="job-filter-radius"
              className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-soft)]"
            >
              Search Reach
            </label>
            <select
              id="job-filter-radius"
              value={radiusMiles}
              onChange={(e) => onRadiusMilesChange(Number(e.target.value))}
              aria-label="Location search reach hint"
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
            {workModeSelection === 'scan-shape'
              ? SCAN_SHAPE_CHIPS.map(({ key, label, hint }) => {
                  const active = scanShapeValue === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => chooseScanShape(key)}
                      aria-pressed={active}
                      className={cn(
                        'rounded-lg px-3 py-1.5 text-left text-[12px] font-medium transition-colors duration-150 border',
                        active
                          ? 'border-[var(--link)]/40 bg-[var(--link)]/15 text-[var(--link)]'
                          : 'border-[var(--line-soft)] bg-[var(--accent-muted)] text-[var(--text-soft)] hover:border-[var(--line-strong)] hover:text-[var(--text-muted)]',
                      )}
                    >
                      <span className="block leading-none">{label}</span>
                      <span className="mt-0.5 block text-[10px] font-normal text-current opacity-75">{hint}</span>
                    </button>
                  );
                })
              : workModeSelection === 'single'
              ? SINGLE_WORK_MODE_CHIPS.map(({ key, label }) => {
                  const active = singleModeValue === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => chooseSingleWorkMode(key)}
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
                })
              : WORK_MODE_CHIPS.map(({ key, label }) => {
                  const active = workModes[key];
                  const isOnlyActiveMode = active && activeModeCount === 1;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleWorkMode(key)}
                      aria-pressed={active}
                      aria-disabled={isOnlyActiveMode}
                      disabled={isOnlyActiveMode}
                      className={cn(
                        'rounded-full px-3 py-1 text-[12px] font-medium transition-colors duration-150 border',
                        active
                          ? 'border-[var(--link)]/40 bg-[var(--link)]/15 text-[var(--link)]'
                          : 'border-[var(--line-soft)] bg-[var(--accent-muted)] text-[var(--text-soft)] hover:border-[var(--line-strong)] hover:text-[var(--text-muted)]',
                        isOnlyActiveMode && 'cursor-not-allowed opacity-80',
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
      <p className="mt-2 max-w-3xl text-xs leading-5 text-[var(--text-soft)]">
        {resolvedGuidance}
      </p>
    </div>
  );
}
