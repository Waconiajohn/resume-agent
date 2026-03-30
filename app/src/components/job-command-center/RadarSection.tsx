import { useState, useCallback } from 'react';
import {
  Search,
  MapPin,
  Building2,
  DollarSign,
  Star,
  X,
  Plus,
  Loader2,
  Sparkles,
  Users,
  ExternalLink,
  FileText,
} from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { cn } from '@/lib/utils';
import { trackProductEvent } from '@/lib/product-telemetry';
import { ReferralBadge, getBestBonusDisplay } from '@/components/job-command-center/ReferralBadge';
import type { RadarJob, RadarSearchFilters } from '@/hooks/useRadarSearch';
import { formatJobAgeLabel } from './job-age';

interface RadarSectionProps {
  jobs: RadarJob[];
  loading: boolean;
  error: string | null;
  onSearch: (query: string, location: string, filters?: RadarSearchFilters) => void;
  onDismiss: (externalId: string) => void;
  onPromote: (job: RadarJob) => void;
  onBuildResume?: (job: RadarJob) => void;
}

function formatSalary(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  const fmt = (n: number) =>
    n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`;
  if (min != null && max != null) return `${fmt(min)}–${fmt(max)}`;
  if (min != null) return `${fmt(min)}+`;
  if (max != null) return `Up to ${fmt(max)}`;
  return null;
}

function NetworkBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span
      className="inline-flex flex-shrink-0 items-center gap-1 rounded-md border border-[#98b3ff]/20 bg-[#98b3ff]/[0.06] px-2.5 py-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#98b3ff]/70"
      title={`${count} network contact${count === 1 ? '' : 's'} at this company`}
    >
      <Users size={9} />
      {count} {count === 1 ? 'connection' : 'connections'}
    </span>
  );
}

function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score == null) return null;
  const colorClass =
    score >= 80
      ? 'bg-[#b5dec2]/10 border-[#b5dec2]/20 text-[#b5dec2]'
      : score >= 60
        ? 'bg-[#98b3ff]/10 border-[#98b3ff]/20 text-[#98b3ff]'
        : 'bg-[var(--accent-muted)] border-[var(--line-soft)] text-[var(--text-soft)]';

  return (
    <span
      className={cn(
        'inline-flex flex-shrink-0 items-center gap-1 rounded-md border px-2.5 py-1 text-[12px] font-semibold uppercase tracking-[0.12em] tabular-nums',
        colorClass,
      )}
    >
      <Star size={9} />
      {score}%
    </span>
  );
}

export function RadarSection({
  jobs,
  loading,
  error,
  onSearch,
  onDismiss,
  onPromote,
  onBuildResume,
}: RadarSectionProps) {
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [datePosted, setDatePosted] = useState<RadarSearchFilters['datePosted']>('any');
  const [remoteType, setRemoteType] = useState<RadarSearchFilters['remoteType']>('any');

  const handleSearch = useCallback(() => {
    if (!query.trim()) return;
    const filters: RadarSearchFilters = { datePosted, remoteType };
    trackProductEvent('job_board_search_run', {
      query: query.trim(),
      location: location.trim() || null,
      date_posted: datePosted ?? 'any',
      remote_type: remoteType ?? 'any',
      source: 'manual',
    });
    onSearch(query.trim(), location.trim(), filters);
  }, [query, location, datePosted, remoteType, onSearch]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSearch();
    },
    [handleSearch],
  );

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={18} className="text-[#98b3ff]" />
        <h3 className="text-[15px] font-semibold text-[var(--text-strong)]">Job Board</h3>
        {jobs.length > 0 && (
          <span className="ml-auto text-[13px] text-[var(--text-soft)]">{jobs.length} results</span>
        )}
      </div>

      <p className="mb-4 text-[13px] leading-relaxed text-[var(--text-soft)]">
        Search public jobs, check how old each role is, and save the best 5 or 6 to your shortlist before you start building resumes.
      </p>

      {/* Search bar */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-[3]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-soft)] pointer-events-none"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Job title, keywords..."
            className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] pl-9 pr-3 py-2 text-[13px] text-[var(--text-muted)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:border-[#98b3ff]/30"
          />
        </div>
        <div className="relative flex-[2]">
          <MapPin
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-soft)] pointer-events-none"
          />
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Location or Remote"
            className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] pl-9 pr-3 py-2 text-[13px] text-[var(--text-muted)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:border-[#98b3ff]/30"
          />
        </div>
      </div>

      {/* Filter row */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <select
          value={datePosted}
          onChange={(e) => setDatePosted(e.target.value as RadarSearchFilters['datePosted'])}
          className="rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-1.5 text-[12px] text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:border-[#98b3ff]/30"
        >
          <option value="any">Any time</option>
          <option value="24h">Last 24h</option>
          <option value="3d">Last 3 days</option>
          <option value="7d">Last 7 days</option>
          <option value="14d">Last 14 days</option>
          <option value="30d">Last 30 days</option>
        </select>
        <select
          value={remoteType}
          onChange={(e) => setRemoteType(e.target.value as RadarSearchFilters['remoteType'])}
          className="rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-1.5 text-[12px] text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:border-[#98b3ff]/30"
        >
          <option value="any">Any work type</option>
          <option value="remote">Remote</option>
          <option value="hybrid">Hybrid</option>
          <option value="onsite">On-site</option>
        </select>
        <div className="flex gap-2 ml-auto">
          <GlassButton onClick={handleSearch} disabled={loading || !query.trim()} size="sm">
            {loading ? (
              <>
                <Loader2 size={13} className="animate-spin" /> Searching...
              </>
            ) : (
              <>
                <Search size={13} /> Search
              </>
            )}
          </GlassButton>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-red-400/20 bg-red-400/[0.04] px-4 py-3 mb-4">
          <p className="text-[12px] text-red-400/70">{error}</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && jobs.length === 0 && (
        <div className="py-8 text-center">
          <Search size={24} className="mx-auto mb-3 text-[var(--text-soft)]" />
          <p className="text-[12px] text-[var(--text-soft)]">
            Search public jobs here. You can start with a title, a keyword, or click a target company above.
          </p>
        </div>
      )}

      {/* Results */}
      {jobs.length > 0 && (
        <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
          {jobs.map((job) => {
            const salary = formatSalary(job.salary_min, job.salary_max);
            const ageLabel = formatJobAgeLabel(job.posted_date);
            return (
              <div
                key={job.external_id}
                className="group rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4 hover:bg-[var(--accent-muted)] hover:border-[var(--line-strong)] transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="text-[14px] font-medium text-[var(--text-muted)] group-hover:text-[var(--text-strong)] transition-colors leading-snug">
                        {job.title}
                      </div>
                      <ScoreBadge score={job.match_score} />
                    </div>

                    <div className="flex items-center gap-2 text-[12px] text-[var(--text-soft)] flex-wrap">
                      <span className="flex items-center gap-1">
                        <Building2 size={11} />
                        {job.company}
                      </span>
                      {job.location && (
                        <>
                          <span className="text-[var(--text-soft)]">·</span>
                          <span className="flex items-center gap-1">
                            <MapPin size={11} />
                            {job.location}
                          </span>
                        </>
                      )}
                      {salary && (
                        <>
                          <span className="text-[var(--text-soft)]">·</span>
                          <span className="flex items-center gap-1">
                            <DollarSign size={11} />
                            {salary}
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-1 text-[13px] text-[var(--text-soft)] flex-wrap">
                      {ageLabel && (
                        <span className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-1)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-soft)]">
                          {ageLabel}
                        </span>
                      )}
                      {job.source && (
                        <>
                          <span className="text-[var(--text-soft)]">·</span>
                          <span className="capitalize">{job.source}</span>
                        </>
                      )}
                      {job.remote_type && (
                        <>
                          <span className="text-[var(--text-soft)]">·</span>
                          <span className="capitalize">{job.remote_type}</span>
                        </>
                      )}
                      {job.employment_type && (
                        <>
                          <span className="text-[var(--text-soft)]">·</span>
                          <span className="capitalize">{job.employment_type}</span>
                        </>
                      )}
                      {(job.network_contacts?.length ?? 0) > 0 && (
                        <>
                          <span className="text-[var(--text-soft)]">·</span>
                          <NetworkBadge count={job.network_contacts!.length} />
                        </>
                      )}
                      {job.referral_bonus && (() => {
                        const bonusDisplay = getBestBonusDisplay(job.referral_bonus);
                        return bonusDisplay ? (
                          <>
                            <span className="text-[var(--text-soft)]">·</span>
                            <ReferralBadge
                              bonusAmount={bonusDisplay}
                              confidence={job.referral_bonus.confidence}
                            />
                          </>
                        ) : null;
                      })()}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => onPromote(job)}
                      className="flex items-center gap-1 rounded-lg border border-[#b5dec2]/20 bg-[#b5dec2]/[0.04] px-2.5 py-1.5 text-[13px] text-[#b5dec2]/60 hover:text-[#b5dec2]/90 hover:bg-[#b5dec2]/[0.08] transition-colors"
                    >
                      <Plus size={11} />
                      Save
                    </button>
                    {job.apply_url && (
                      <a
                        href={job.apply_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2.5 py-1.5 text-[13px] text-[var(--text-soft)] hover:text-[var(--text-soft)] hover:bg-[var(--surface-1)] transition-colors"
                      >
                        <ExternalLink size={11} />
                        Open Job
                      </a>
                    )}
                    {onBuildResume && (
                      <button
                        type="button"
                        onClick={() => onBuildResume(job)}
                        className="flex items-center gap-1 rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2.5 py-1.5 text-[13px] text-[var(--text-soft)] hover:text-[var(--text-soft)] hover:bg-[var(--surface-1)] transition-colors"
                      >
                        <FileText size={11} />
                        Build Resume
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onDismiss(job.external_id)}
                      className="flex items-center gap-1 rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2.5 py-1.5 text-[13px] text-[var(--text-soft)] hover:text-[var(--text-soft)] hover:bg-[var(--surface-1)] transition-colors"
                    >
                      <X size={11} />
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}
