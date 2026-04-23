/**
 * ApplicationsListScreen — "My Applications" surface.
 *
 * Approach C Phase 2.1 + 2.2. URL: /workspace/applications. Lists the
 * user's job_applications grouped by stage, with a "New application"
 * inline form that creates a row and navigates to
 * /workspace/application/:id/resume.
 *
 * Entry point for the application-scoped workspace. Before this screen
 * existed, users had to know the full /workspace/application/:id URL to
 * reach the new routing.
 */

import { useMemo, useState, type FormEvent } from 'react';
import { Plus, ArrowRight, Briefcase, Archive, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { useJobApplications, type JobApplicationStage, type JobApplicationArchivedFilter } from '@/hooks/useJobApplications';
import { buildApplicationWorkspaceRoute } from '@/lib/app-routing';

interface ApplicationsListScreenProps {
  onNavigate?: (route: string) => void;
}

// Ordered for display. Kept in sync with the CHECK constraint on
// job_applications.stage (see 20260421_job_applications_kanban_columns.sql).
// Phase 2.2 — closed_won / closed_lost are intentionally absent from the
// Active view; they live in the Archived view only.
const STAGE_ORDER: readonly JobApplicationStage[] = [
  'saved',
  'researching',
  'applied',
  'screening',
  'interviewing',
  'offer',
  'closed_won',
  'closed_lost',
];

const STAGE_LABELS: Record<JobApplicationStage, string> = {
  saved: 'Saved',
  researching: 'Researching',
  applied: 'Applied',
  screening: 'Screening',
  interviewing: 'Interviewing',
  offer: 'Offer',
  closed_won: 'Accepted',
  closed_lost: 'Closed',
};

// Phase 2.2 — 4 high-level buckets that appear above the Active list as
// clickable counts. Mapping (Option B from the audit): `researching` folds
// into Saved because it's a pre-application state; `applied` sits in its
// own bucket; `screening` + `interviewing` merge into Interviewing.
type PipelineBucket = 'saved' | 'applied' | 'interviewing' | 'offer';

const BUCKET_DEFINITIONS: ReadonlyArray<{
  id: PipelineBucket;
  label: string;
  stages: readonly JobApplicationStage[];
}> = [
  { id: 'saved', label: 'Saved', stages: ['saved', 'researching'] },
  { id: 'applied', label: 'Applied', stages: ['applied'] },
  { id: 'interviewing', label: 'Interviewing', stages: ['screening', 'interviewing'] },
  { id: 'offer', label: 'Offer', stages: ['offer'] },
];

// Stages hidden from the Active view (rendered only when the Archived
// toggle is on).
const TERMINAL_STAGES: readonly JobApplicationStage[] = ['closed_won', 'closed_lost'];

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diffMs = Date.now() - then;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

export function ApplicationsListScreen({ onNavigate }: ApplicationsListScreenProps) {
  const [archivedFilter, setArchivedFilter] = useState<JobApplicationArchivedFilter>('active');
  const {
    applications,
    groupedByStage,
    loading,
    error,
    createApplication,
    archiveApplication,
    restoreApplication,
  } = useJobApplications({ archived: archivedFilter });
  const [selectedBucket, setSelectedBucket] = useState<PipelineBucket | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [roleTitle, setRoleTitle] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [url, setUrl] = useState('');
  const [jdText, setJdText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!roleTitle.trim() || !companyName.trim()) {
      setSubmitError('Role and company are both required.');
      return;
    }
    setSubmitting(true);
    try {
      const created = await createApplication({
        role_title: roleTitle.trim(),
        company_name: companyName.trim(),
        url: url.trim() || undefined,
        jd_text: jdText.trim() || undefined,
        stage: 'saved',
      });
      if (!created) {
        setSubmitError(error ?? 'Failed to create application. Try again.');
        return;
      }
      // Reset form state, close inline form, navigate into the new workspace.
      setRoleTitle('');
      setCompanyName('');
      setUrl('');
      setJdText('');
      setFormOpen(false);
      onNavigate?.(buildApplicationWorkspaceRoute(created.id, 'resume'));
    } finally {
      setSubmitting(false);
    }
  }

  const isActiveView = archivedFilter === 'active';

  // Bucket counts are computed from the stages the Active view actually
  // renders — terminal stages (closed_won / closed_lost) are intentionally
  // excluded. In the Archived view the counter row is hidden, so the
  // computation is unused but cheap.
  const bucketCounts = useMemo<Record<PipelineBucket, number>>(() => {
    const counts: Record<PipelineBucket, number> = {
      saved: 0,
      applied: 0,
      interviewing: 0,
      offer: 0,
    };
    for (const bucket of BUCKET_DEFINITIONS) {
      counts[bucket.id] = bucket.stages.reduce(
        (total, stage) => total + (groupedByStage[stage]?.length ?? 0),
        0,
      );
    }
    return counts;
  }, [groupedByStage]);

  // Stages rendered in the list body.
  //   Active + no bucket selected → all non-terminal stages.
  //   Active + bucket selected → just that bucket's stages.
  //   Archived → every stage (terminal rows are the whole point of Archived).
  const visibleStages = useMemo<readonly JobApplicationStage[]>(() => {
    if (!isActiveView) return STAGE_ORDER;
    const nonTerminal = STAGE_ORDER.filter((s) => !TERMINAL_STAGES.includes(s));
    if (!selectedBucket) return nonTerminal;
    const bucket = BUCKET_DEFINITIONS.find((b) => b.id === selectedBucket);
    return bucket ? bucket.stages : nonTerminal;
  }, [isActiveView, selectedBucket]);

  return (
    <div className="mx-auto flex h-full max-w-[1280px] flex-col gap-6 overflow-y-auto p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-widest text-[var(--link)]">
            My applications
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--text-strong)]">
            Job applications
          </h1>
          <p className="mt-1 text-sm text-[var(--text-soft)]">
            Each application groups the resume, cover letter, interview prep, networking outreach, and thank-you notes you create for that specific role.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* Sprint B4 — active/archived toggle. Archived applications stay
              in the database; users restore from the archived view. */}
          <div className="inline-flex rounded-full border border-[var(--line-soft)] p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => {
                setArchivedFilter('active');
              }}
              className={
                archivedFilter === 'active'
                  ? 'rounded-full bg-[var(--link)] px-3 py-1 font-semibold text-[var(--link-on)]'
                  : 'rounded-full px-3 py-1 text-[var(--text-soft)] hover:text-[var(--text-strong)]'
              }
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => {
                setArchivedFilter('archived');
                setSelectedBucket(null);
              }}
              className={
                archivedFilter === 'archived'
                  ? 'rounded-full bg-[var(--link)] px-3 py-1 font-semibold text-[var(--link-on)]'
                  : 'rounded-full px-3 py-1 text-[var(--text-soft)] hover:text-[var(--text-strong)]'
              }
            >
              Archived
            </button>
          </div>
          <GlassButton
            variant={formOpen ? 'ghost' : 'primary'}
            onClick={() => setFormOpen((v) => !v)}
          >
            <Plus size={14} className="mr-1.5" />
            {formOpen ? 'Cancel' : 'New application'}
          </GlassButton>
        </div>
      </div>

      {formOpen && (
        <GlassCard className="p-5">
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-[var(--text-strong)]">Role title</span>
                <input
                  value={roleTitle}
                  onChange={(e) => setRoleTitle(e.target.value)}
                  required
                  autoFocus
                  placeholder="VP Engineering"
                  className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-strong)] focus:border-[var(--link)] focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-[var(--text-strong)]">Company</span>
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                  placeholder="Acme Corp"
                  className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-strong)] focus:border-[var(--link)] focus:outline-none"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-[var(--text-strong)]">Job posting URL <span className="text-[var(--text-soft)]">(optional)</span></span>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                type="url"
                placeholder="https://acme.com/careers/vp-eng"
                className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-strong)] focus:border-[var(--link)] focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-[var(--text-strong)]">Job description <span className="text-[var(--text-soft)]">(optional — you can add it later)</span></span>
              <textarea
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
                rows={5}
                placeholder="Paste the full job description so it's available to every tool in this workspace."
                className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-strong)] focus:border-[var(--link)] focus:outline-none"
              />
            </label>
            {submitError && (
              <div className="rounded-lg border border-[var(--badge-red-text)]/20 bg-[var(--badge-red-text)]/[0.06] px-3 py-2 text-[13px] text-[var(--badge-red-text)]/85">
                {submitError}
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              <GlassButton variant="ghost" onClick={() => setFormOpen(false)} type="button">
                Cancel
              </GlassButton>
              <GlassButton variant="primary" type="submit" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create and open'}
                {!submitting && <ArrowRight size={14} className="ml-1.5" />}
              </GlassButton>
            </div>
          </form>
        </GlassCard>
      )}

      {loading && applications.length === 0 && (
        <GlassCard className="p-8 text-sm text-[var(--text-soft)]">Loading your applications…</GlassCard>
      )}

      {!loading && applications.length === 0 && !formOpen && (
        <GlassCard className="p-8 text-center">
          <Briefcase size={24} className="mx-auto text-[var(--text-soft)]" />
          <h2 className="mt-3 text-lg font-semibold text-[var(--text-strong)]">No applications yet</h2>
          <p className="mt-2 text-sm text-[var(--text-soft)]">
            Start a new application to group its resume, cover letter, and interview prep in one place.
          </p>
          <GlassButton variant="primary" className="mt-4" onClick={() => setFormOpen(true)}>
            <Plus size={14} className="mr-1.5" />
            New application
          </GlassButton>
        </GlassCard>
      )}

      {/* Phase 2.2 — 4-bucket pipeline summary. Active view only. Clicking a
          count filters the list below; clicking the selected count clears
          the filter. */}
      {isActiveView && applications.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {BUCKET_DEFINITIONS.map((bucket) => {
            const count = bucketCounts[bucket.id];
            const isSelected = selectedBucket === bucket.id;
            return (
              <button
                key={bucket.id}
                type="button"
                onClick={() =>
                  setSelectedBucket((prev) => (prev === bucket.id ? null : bucket.id))
                }
                aria-pressed={isSelected}
                className={cn(
                  'flex flex-col items-start rounded-2xl border px-4 py-3 text-left transition-all duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/60',
                  isSelected
                    ? 'border-[var(--link)]/60 bg-[var(--rail-tab-active-bg)]'
                    : 'border-[var(--line-soft)] bg-[var(--bg-1)] hover:border-[var(--link)]/40 hover:bg-[var(--rail-tab-hover-bg)]',
                )}
              >
                <span className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-soft)]">
                  {bucket.label}
                </span>
                <span className="mt-1 text-xl font-semibold tabular-nums text-[var(--text-strong)]">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {applications.length > 0 && (
        <div className="flex flex-col gap-6">
          {visibleStages.map((stage) => {
            const items = groupedByStage[stage] ?? [];
            if (items.length === 0) return null;
            return (
              <section key={stage} className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-[13px] font-semibold uppercase tracking-widest text-[var(--text-soft)]">
                    {STAGE_LABELS[stage]} <span className="ml-1 text-[var(--text-muted)]">{items.length}</span>
                  </h2>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((app) => {
                    const isArchived = Boolean(app.archived_at);
                    const handleOpen = () => onNavigate?.(buildApplicationWorkspaceRoute(app.id, 'resume'));
                    const handleArchiveToggle = (e: React.MouseEvent) => {
                      e.stopPropagation();
                      if (isArchived) void restoreApplication(app.id);
                      else void archiveApplication(app.id);
                    };
                    return (
                      <div
                        key={app.id}
                        role="button"
                        tabIndex={0}
                        onClick={handleOpen}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleOpen();
                          }
                        }}
                        aria-label={`Open application: ${app.role_title} at ${app.company_name}`}
                        className="group relative flex cursor-pointer flex-col gap-2 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-1)] p-4 text-left transition-all duration-150 hover:border-[var(--link)]/40 hover:bg-[var(--rail-tab-hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/60"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-[var(--text-strong)]">{app.company_name}</span>
                          <span className="text-[11px] text-[var(--text-muted)]">{formatRelative(app.updated_at)}</span>
                        </div>
                        <div className="text-sm text-[var(--text-soft)]">{app.role_title}</div>
                        {app.next_action && (
                          <div className="mt-1 rounded-lg bg-[var(--accent-muted)] px-2.5 py-1 text-[12px] text-[var(--text-soft)]">
                            Next: {app.next_action}
                          </div>
                        )}
                        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                          <button
                            type="button"
                            onClick={handleArchiveToggle}
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-[var(--text-muted)] opacity-0 transition-opacity hover:bg-[var(--accent-muted)] hover:text-[var(--text-strong)] group-hover:opacity-100"
                            aria-label={isArchived ? 'Restore application' : 'Archive application'}
                            title={isArchived ? 'Restore' : 'Archive'}
                          >
                            {isArchived ? <Undo2 size={12} /> : <Archive size={12} />}
                            {isArchived ? 'Restore' : 'Archive'}
                          </button>
                          <span className="inline-flex items-center gap-1 text-[12px] text-[var(--link)] opacity-0 transition-opacity group-hover:opacity-100">
                            Open
                            <ArrowRight size={12} />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-[var(--badge-red-text)]/20 bg-[var(--badge-red-text)]/[0.06] px-4 py-3 text-[13px] text-[var(--badge-red-text)]/80">
          {error}
        </div>
      )}
    </div>
  );
}
