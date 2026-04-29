/**
 * TailorForApplicationPicker — Phase 2 of pursuit timeline.
 *
 * Modal opened by useTailorPicker. Two paths:
 *   1. Pick an existing application (left): list of non-terminal apps
 *   2. Create a new application from a JD (right): URL fetch OR raw text
 *
 * JD-URL flow: only creates the row when fetch succeeds. Failure shows
 * the error inline; no row is created.
 *
 * Modal renders via a fixed overlay rather than a portal — same pattern
 * other inline modals in this codebase use, no Radix dependency required.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, FileText, Loader2, X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassButton } from '@/components/GlassButton';
import { GlassCard } from '@/components/GlassCard';
import { API_BASE } from '@/lib/api';
import {
  type JobApplication,
  type JobApplicationStage,
} from '@/hooks/useJobApplications';
import type { TailorPickerContext } from './TailorPickerProvider';

const NON_TERMINAL_STAGES: ReadonlySet<JobApplicationStage> = new Set([
  'saved',
  'researching',
  'applied',
  'screening',
  'interviewing',
]);

function cleanFetchedMetadata(value: string): string {
  return value
    .replace(/\s*\|\s*(LinkedIn|Indeed|Glassdoor|Greenhouse|Lever|Workday|Careers).*$/i, '')
    .replace(/\s+-\s*(LinkedIn|Indeed|Glassdoor|Greenhouse|Lever|Workday|Careers).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitFetchedJobMetadata(rawTitle?: string, rawCompany?: string): { title: string; company: string } {
  const title = cleanFetchedMetadata(rawTitle ?? '');
  const company = cleanFetchedMetadata(rawCompany ?? '');
  if (company) return { title, company };

  const linkedinHiring = title.match(/^(.+?)\s+hiring\s+(.+?)(?:\s+in\s+.+)?$/i);
  if (linkedinHiring) {
    return {
      company: cleanFetchedMetadata(linkedinHiring[1] ?? ''),
      title: cleanFetchedMetadata(linkedinHiring[2] ?? ''),
    };
  }

  const jobApplication = title.match(/^Job Application for\s+(.+?)\s+at\s+(.+)$/i);
  if (jobApplication) {
    return {
      title: cleanFetchedMetadata(jobApplication[1] ?? ''),
      company: cleanFetchedMetadata(jobApplication[2] ?? ''),
    };
  }

  const roleAtCompany = title.match(/^(.+?)\s+at\s+(.+)$/i);
  if (roleAtCompany) {
    return {
      title: cleanFetchedMetadata(roleAtCompany[1] ?? ''),
      company: cleanFetchedMetadata(roleAtCompany[2] ?? ''),
    };
  }

  return { title, company };
}

interface TailorForApplicationPickerProps {
  context: TailorPickerContext;
  accessToken: string | null;
  applications: JobApplication[];
  loading: boolean;
  onCancel: () => void;
  onPickExisting: (app: JobApplication) => void;
  onCreateAndOpen: (input: {
    roleTitle: string;
    companyName: string;
    jdText: string;
    url?: string;
    origin: 'jd_url' | 'jd_text';
  }) => Promise<{ ok: true; applicationId: string } | { ok: false; error: string }>;
}

export function TailorForApplicationPicker({
  context,
  accessToken,
  applications,
  loading,
  onCancel,
  onPickExisting,
  onCreateAndOpen,
}: TailorForApplicationPickerProps) {
  // Non-terminal apps only, most recently updated first.
  const eligibleApps = useMemo(
    () =>
      applications
        .filter((a) => !a.archived_at && NON_TERMINAL_STAGES.has(a.stage))
        .sort((a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
        ),
    [applications],
  );

  const [activeTab, setActiveTab] = useState<'url' | 'text'>(
    context.jobUrl ? 'url' : 'text',
  );

  // Shared form state for the new-app form.
  const [companyName, setCompanyName] = useState(context.companyName ?? '');
  const [roleTitle, setRoleTitle] = useState(context.roleTitle ?? '');

  // URL-tab state.
  const [jdUrl, setJdUrl] = useState(context.jobUrl ?? '');
  const [jdUrlFetching, setJdUrlFetching] = useState(false);
  const [jdUrlFetched, setJdUrlFetched] = useState(false);
  const [jdUrlError, setJdUrlError] = useState<string | null>(null);
  const [fetchedJdText, setFetchedJdText] = useState('');
  const autoFetchAttemptedRef = useRef(false);

  // Text-tab state.
  const [jdText, setJdText] = useState('');

  // Submit-state for the create flow.
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleFetchJdUrl = useCallback(async () => {
    const trimmed = jdUrl.trim();
    if (!trimmed || !accessToken) return;
    setJdUrlFetching(true);
    setJdUrlError(null);
    try {
      const res = await fetch(`${API_BASE}/discovery/fetch-jd`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: trimmed }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Fetch failed (${res.status})`);
      }
      const data = (await res.json()) as { text: string; title?: string; company?: string };
      const metadata = splitFetchedJobMetadata(data.title, data.company);
      setFetchedJdText(data.text);
      setJdUrlFetched(true);
      if (metadata.title) setRoleTitle(metadata.title);
      if (metadata.company) setCompanyName(metadata.company);
    } catch (err) {
      setJdUrlError(err instanceof Error ? err.message : String(err));
      setJdUrlFetched(false);
      setFetchedJdText('');
    } finally {
      setJdUrlFetching(false);
    }
  }, [jdUrl, accessToken, roleTitle, companyName]);

  useEffect(() => {
    if (!context.jobUrl || autoFetchAttemptedRef.current) return;
    if (activeTab !== 'url' || !accessToken || !jdUrl.trim() || jdUrlFetched || jdUrlFetching) return;
    autoFetchAttemptedRef.current = true;
    void handleFetchJdUrl();
  }, [
    activeTab,
    accessToken,
    context.jobUrl,
    handleFetchJdUrl,
    jdUrl,
    jdUrlFetched,
    jdUrlFetching,
  ]);

  const canSubmitFromUrl =
    jdUrlFetched && roleTitle.trim().length > 0 && companyName.trim().length > 0 && fetchedJdText.length > 0;
  const canSubmitFromText =
    roleTitle.trim().length > 0 && companyName.trim().length > 0 && jdText.trim().length >= 50;

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    setSubmitError(null);
    if (activeTab === 'url') {
      if (!canSubmitFromUrl) {
        setSubmitError('Fetch the JD first, then confirm role and company.');
        return;
      }
      setSubmitting(true);
      const result = await onCreateAndOpen({
        roleTitle: roleTitle.trim(),
        companyName: companyName.trim(),
        jdText: fetchedJdText,
        url: jdUrl.trim(),
        origin: 'jd_url',
      });
      setSubmitting(false);
      if (!result.ok) setSubmitError(result.error);
      return;
    }
    // Text tab.
    if (!canSubmitFromText) {
      setSubmitError('Add company name, role, and a job description (50+ characters).');
      return;
    }
    setSubmitting(true);
    const result = await onCreateAndOpen({
      roleTitle: roleTitle.trim(),
      companyName: companyName.trim(),
      jdText: jdText.trim(),
      origin: 'jd_text',
    });
    setSubmitting(false);
    if (!result.ok) setSubmitError(result.error);
  }, [
    submitting,
    activeTab,
    canSubmitFromUrl,
    canSubmitFromText,
    onCreateAndOpen,
    roleTitle,
    companyName,
    fetchedJdText,
    jdUrl,
    jdText,
  ]);

  const inputClass =
    'w-full rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2 text-[13px] text-[var(--text-strong)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40';
  const labelClass =
    'block text-[12px] font-semibold text-[var(--text-soft)] uppercase tracking-wider mb-1.5';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Tailor for an application"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <GlassCard className="p-6 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-semibold text-[var(--text-strong)]">
                Tailor for an application
              </h2>
              <p className="text-[13px] text-[var(--text-soft)] mt-1">
                Every tailored resume lives inside an application — that&rsquo;s how the platform tracks the
                full pursuit. Pick an existing application or create a new one from a job description.
              </p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              aria-label="Close"
              className="p-1 rounded-md text-[var(--text-soft)] hover:bg-[var(--accent-muted)] hover:text-[var(--text-strong)]"
            >
              <X size={18} />
            </button>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {/* ── Existing applications ── */}
            <section className="space-y-3">
              <h3 className="text-[13px] font-semibold text-[var(--text-strong)]">
                Tailor for an existing application
              </h3>
              <p className="text-[12px] text-[var(--text-soft)]">
                Active applications you haven&rsquo;t closed out yet.
              </p>
              <div className="max-h-[280px] overflow-y-auto rounded-lg border border-[var(--line-soft)]">
                {loading && eligibleApps.length === 0 ? (
                  <div className="p-4 text-[13px] text-[var(--text-soft)] flex items-center gap-2">
                    <Loader2 size={12} className="animate-spin" />
                    Loading…
                  </div>
                ) : eligibleApps.length === 0 ? (
                  <div className="p-4 text-[13px] text-[var(--text-soft)]">
                    No active applications yet — create a new one on the right.
                  </div>
                ) : (
                  <ul className="divide-y divide-[var(--line-soft)]">
                    {eligibleApps.slice(0, 30).map((app) => (
                      <li key={app.id}>
                        <button
                          type="button"
                          onClick={() => onPickExisting(app)}
                          className="w-full text-left px-3 py-2.5 hover:bg-[var(--rail-tab-hover-bg)] transition-colors"
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[13px] font-medium text-[var(--text-strong)] truncate">
                                {app.company_name}
                              </div>
                              <div className="text-[12px] text-[var(--text-soft)] truncate">
                                {app.role_title}
                              </div>
                            </div>
                            <span className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider">
                              {app.stage}
                            </span>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* ── New application ── */}
            <section className="space-y-3">
              <h3 className="text-[13px] font-semibold text-[var(--text-strong)]">
                Tailor for a new application
              </h3>

              <div className="flex gap-1.5 rounded-md bg-[var(--accent-muted)] p-1 text-[12px]">
                <button
                  type="button"
                  onClick={() => setActiveTab('url')}
                  className={cn(
                    'flex-1 rounded px-2 py-1 transition-colors',
                    activeTab === 'url'
                      ? 'bg-[var(--bg-1)] text-[var(--text-strong)]'
                      : 'text-[var(--text-soft)] hover:text-[var(--text-muted)]',
                  )}
                >
                  Paste JD URL
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('text')}
                  className={cn(
                    'flex-1 rounded px-2 py-1 transition-colors',
                    activeTab === 'text'
                      ? 'bg-[var(--bg-1)] text-[var(--text-strong)]'
                      : 'text-[var(--text-soft)] hover:text-[var(--text-muted)]',
                  )}
                >
                  Paste JD text
                </button>
              </div>

              {activeTab === 'url' && (
                <div className="space-y-3">
                  <div>
                    <label className={labelClass}>Job posting URL</label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={jdUrl}
                        onChange={(e) => { setJdUrl(e.target.value); setJdUrlFetched(false); setJdUrlError(null); }}
                        placeholder="https://..."
                        className={inputClass}
                      />
                      <GlassButton
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleFetchJdUrl()}
                        disabled={jdUrl.trim().length === 0 || jdUrlFetching}
                        className="text-[12px] flex-shrink-0"
                      >
                        {jdUrlFetching ? <Loader2 size={11} className="animate-spin mr-1" /> : <ExternalLink size={11} className="mr-1" />}
                        Fetch
                      </GlassButton>
                    </div>
                    {jdUrlError && (
                      <p className="text-[12px] text-[var(--badge-red-text)] mt-1">{jdUrlError}</p>
                    )}
                    {jdUrlFetched && !jdUrlError && (
                      <p className="text-[12px] text-[var(--badge-green-text)]/80 mt-1">
                        Fetched {fetchedJdText.length.toLocaleString()} characters.
                      </p>
                    )}
                  </div>
                  {jdUrlFetched && (
                    <>
                      <div>
                        <label className={labelClass}>Company *</label>
                        <input
                          type="text"
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Role *</label>
                        <input
                          type="text"
                          value={roleTitle}
                          onChange={(e) => setRoleTitle(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeTab === 'text' && (
                <div className="space-y-3">
                  <div>
                    <label className={labelClass}>Company *</label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="e.g. Medtronic"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Role *</label>
                    <input
                      type="text"
                      value={roleTitle}
                      onChange={(e) => setRoleTitle(e.target.value)}
                      placeholder="e.g. VP of Supply Chain"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Job description *</label>
                    <textarea
                      rows={6}
                      value={jdText}
                      onChange={(e) => setJdText(e.target.value)}
                      placeholder="Paste the full job description here…"
                      className={`${inputClass} resize-none leading-relaxed`}
                    />
                  </div>
                </div>
              )}
            </section>
          </div>

          {submitError && (
            <div className="rounded-lg border border-[var(--badge-red-text)]/20 bg-[var(--badge-red-text)]/[0.06] px-3 py-2 text-[12px] text-[var(--badge-red-text)]">
              {submitError}
            </div>
          )}

          <div className="flex items-center justify-between border-t border-[var(--line-soft)] pt-4">
            <p className="text-[11px] text-[var(--text-soft)] flex items-center gap-1">
              <FileText size={11} />
              You can edit company, role, and JD on the next screen.
            </p>
            <div className="flex items-center gap-2">
              <GlassButton variant="ghost" onClick={onCancel} disabled={submitting} className="text-[13px]">
                Cancel
              </GlassButton>
              <GlassButton
                variant="primary"
                onClick={() => void handleSubmit()}
                disabled={
                  submitting
                  || (activeTab === 'url' && !canSubmitFromUrl)
                  || (activeTab === 'text' && !canSubmitFromText)
                }
                className="text-[13px]"
              >
                {submitting ? <Loader2 size={12} className="animate-spin mr-1.5" /> : <Plus size={12} className="mr-1.5" />}
                Create &amp; tailor
              </GlassButton>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
