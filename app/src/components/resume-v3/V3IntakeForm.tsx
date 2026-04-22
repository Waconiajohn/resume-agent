/**
 * V3IntakeForm — paste-a-resume + paste-a-JD starting form.
 *
 * Intentionally stripped: resume_text, job_description, optional jd_title,
 * optional jd_company. No gate flow, no clarification memory, no pre-scores.
 * v3 is a straight shot.
 */

import { useCallback, useEffect, useState } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { GlassInput } from '@/components/GlassInput';
import { BookMarked, Link as LinkIcon, Loader2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FileDropZone } from './FileDropZone';
import { extractResumeTextFromUpload } from '@/lib/resume-upload';
import { extractJobDescriptionTextFromUpload } from '@/lib/job-description-upload';
import { API_BASE } from '@/lib/api';
import type { V3MasterSummary } from '@/hooks/useV3Pipeline';

interface V3IntakeFormProps {
  onSubmit: (input: {
    resumeText?: string;
    useMaster?: boolean;
    jobDescription: string;
    jdTitle?: string;
    jdCompany?: string;
  }) => void;
  initialResumeText?: string;
  disabled?: boolean;
  /**
   * User's default master resume summary, if one exists. When non-null,
   * the form renders a "using your knowledge base" card at the top and
   * auto-fills the resume textarea with a placeholder message. The user
   * can click "paste a different one" to override.
   */
  master?: V3MasterSummary | null;
  /**
   * Auth token — needed for the JD URL fetch endpoint
   * (POST /api/discovery/fetch-jd) which is rate-limited per user.
   */
  accessToken?: string | null;
  /**
   * Optional: initial JD URL to auto-fetch on mount. Used by the
   * Networking Intelligence "this job → tailor resume" handoff; NI
   * navigates to /resume-builder/session?jdUrl=<encoded-url>.
   */
  initialJobUrl?: string;
  /**
   * Approach C — when the form is rendered inside an application workspace,
   * these prefill the JD textarea, job-title, and company fields from the
   * parent application so the user doesn't retype. All three are optional;
   * missing values fall back to empty strings.
   */
  initialJobDescription?: string;
  initialJdTitle?: string;
  initialJdCompany?: string;
}

function formatRelativeDate(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const days = Math.round((now - then) / (1000 * 60 * 60 * 24));
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30) return `${days}d ago`;
    const months = Math.round(days / 30);
    if (months < 12) return `${months}mo ago`;
    const years = Math.round(days / 365);
    return `${years}y ago`;
  } catch {
    return iso;
  }
}

export function V3IntakeForm({
  onSubmit,
  initialResumeText,
  disabled,
  master,
  accessToken,
  initialJobUrl,
  initialJobDescription,
  initialJdTitle,
  initialJdCompany,
}: V3IntakeFormProps) {
  const [resumeText, setResumeText] = useState(initialResumeText ?? '');
  const [jobDescription, setJobDescription] = useState(initialJobDescription ?? '');
  const [jdTitle, setJdTitle] = useState(initialJdTitle ?? '');
  const [jdCompany, setJdCompany] = useState(initialJdCompany ?? '');
  // When the user has a master, they can toggle between using it (empty
  // resumeText + master-sourced run) or overriding (paste a different one).
  const [overridingMaster, setOverridingMaster] = useState(false);

  // JD URL fetch state
  const [jdUrl, setJdUrl] = useState(initialJobUrl ?? '');
  const [jdUrlLoading, setJdUrlLoading] = useState(false);
  const [jdUrlError, setJdUrlError] = useState<string | null>(null);
  const [jdUrlLoadedFrom, setJdUrlLoadedFrom] = useState<string | null>(null);

  const fetchJdFromUrl = useCallback(async (url: string) => {
    if (!accessToken) {
      setJdUrlError('Not authenticated');
      return;
    }
    const trimmed = url.trim();
    if (!trimmed) return;
    setJdUrlLoading(true);
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
      const data = (await res.json()) as { text: string; title?: string };
      setJobDescription(data.text);
      setJdUrlLoadedFrom(trimmed);
      if (data.title && !jdTitle.trim()) {
        setJdTitle(data.title);
      }
    } catch (err) {
      setJdUrlError(err instanceof Error ? err.message : String(err));
    } finally {
      setJdUrlLoading(false);
    }
  }, [accessToken, jdTitle]);

  // Auto-fetch when the form mounts with an initial JD URL (NI hand-off).
  useEffect(() => {
    if (initialJobUrl && initialJobUrl.trim() && accessToken) {
      void fetchJdFromUrl(initialJobUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialJobUrl, accessToken]);

  const usingMaster = Boolean(master && !overridingMaster);
  // Validation: resume must be pasted OR master must be in use.
  const isValid =
    (usingMaster || resumeText.trim().length >= 50) && jobDescription.trim().length >= 50;

  return (
    <GlassCard className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl text-[var(--text-strong)] font-semibold">
          Tailor your resume
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Paste your resume and the job description. The pipeline extracts, classifies,
          strategizes, writes, and verifies — with full source attribution on every bullet.
        </p>
      </div>

      <div className="space-y-5">
        {/* Resume source — two-card chooser when the user has a master;
            upload-only when they don't. */}
        {master ? (
          <div className="space-y-2">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Resume source
            </label>
            <div
              role="radiogroup"
              aria-label="Choose the resume to tailor"
              className="space-y-3"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                  e.preventDefault();
                  setOverridingMaster(true);
                } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                  e.preventDefault();
                  setOverridingMaster(false);
                  setResumeText('');
                }
              }}
            >
              {/* Master option */}
              <div
                role="radio"
                aria-checked={usingMaster}
                tabIndex={0}
                onClick={() => {
                  if (!usingMaster) { setOverridingMaster(false); setResumeText(''); }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (!usingMaster) { setOverridingMaster(false); setResumeText(''); }
                  }
                }}
                className={cn(
                  'rounded-[var(--radius-card,18px)] border p-4 flex items-start gap-3 transition-all duration-150 cursor-pointer select-none',
                  usingMaster
                    ? 'border-[var(--bullet-confirm)] bg-[var(--bullet-confirm-bg)] shadow-[var(--shadow-low)]'
                    : 'border-[var(--line-soft)] bg-[var(--surface-1)] hover:border-[var(--bullet-confirm)]/40 hover:bg-[var(--bullet-confirm-bg)]/30',
                )}
              >
                <RadioDot active={usingMaster} />
                <BookMarked
                  className={cn(
                    'h-4 w-4 flex-shrink-0 mt-0.5 transition-colors',
                    usingMaster ? 'text-[var(--bullet-confirm)]' : 'text-[var(--text-soft)]',
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-[var(--text-strong)]">
                    Use my knowledge base
                  </div>
                  <div className="text-[12px] text-[var(--text-muted)] mt-0.5">
                    v{master.version}, last updated {formatRelativeDate(master.updated_at)} · {master.positionCount} positions · {master.evidenceCount} evidence items
                  </div>
                  {usingMaster && (
                    <div className="text-[11px] text-[var(--text-soft)] mt-2 leading-snug">
                      Tailored resume will offer new accomplishments to add back to your vault.
                    </div>
                  )}
                </div>
              </div>

              {/* Upload option */}
              <div
                role="radio"
                aria-checked={!usingMaster}
                tabIndex={0}
                onClick={() => {
                  if (usingMaster) setOverridingMaster(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (usingMaster) setOverridingMaster(true);
                  }
                }}
                className={cn(
                  'rounded-[var(--radius-card,18px)] border p-4 transition-all duration-150 select-none',
                  !usingMaster
                    ? 'border-[var(--bullet-confirm)] bg-[var(--bullet-confirm-bg)] shadow-[var(--shadow-low)]'
                    : 'border-[var(--line-soft)] bg-[var(--surface-1)] hover:border-[var(--bullet-confirm)]/40 hover:bg-[var(--bullet-confirm-bg)]/30 cursor-pointer',
                )}
              >
                <div className="flex items-start gap-3">
                  <RadioDot active={!usingMaster} />
                  <Upload
                    className={cn(
                      'h-4 w-4 flex-shrink-0 mt-0.5 transition-colors',
                      !usingMaster ? 'text-[var(--bullet-confirm)]' : 'text-[var(--text-soft)]',
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-[var(--text-strong)]">
                      Upload a different resume for this run
                    </div>
                    <div className="text-[12px] text-[var(--text-muted)] mt-0.5">
                      Use a new PDF, DOCX, or TXT — or paste text. Your knowledge base stays unchanged until you choose to promote new bullets.
                    </div>
                  </div>
                </div>
                {!usingMaster && (
                  <div
                    className="mt-4"
                    // Clicks inside the dropzone (file browser, drag events, textarea typing)
                    // must not re-trigger the card's radio handler.
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <FileDropZone
                      label="resume"
                      accept=".txt,.docx,.pdf"
                      extract={extractResumeTextFromUpload}
                      value={resumeText}
                      onChange={setResumeText}
                      disabled={disabled}
                      pastePlaceholder="Paste your resume text here…"
                      pasteRows={10}
                      defaultPasteOpen={Boolean(initialResumeText)}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-2">
              Your resume
            </label>
            <FileDropZone
              label="resume"
              accept=".txt,.docx,.pdf"
              extract={extractResumeTextFromUpload}
              value={resumeText}
              onChange={setResumeText}
              disabled={disabled}
              pastePlaceholder="Paste your resume text here…"
              pasteRows={10}
              defaultPasteOpen={Boolean(initialResumeText)}
            />
          </div>
        )}

        <div className="space-y-3">
          <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Job description
          </label>

          {/* URL fetch row */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)]">
              <LinkIcon className="h-3.5 w-3.5 text-[var(--bullet-confirm)]" />
              Fetch from job posting URL
            </label>
            <div className="flex gap-2">
              <GlassInput
                type="url"
                value={jdUrl}
                onChange={(e) => {
                  setJdUrl(e.target.value);
                  if (jdUrlError) setJdUrlError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void fetchJdFromUrl(jdUrl);
                  }
                }}
                placeholder="https://example.com/jobs/…"
                disabled={disabled || jdUrlLoading}
                className="flex-1"
              />
              <GlassButton
                variant="secondary"
                size="md"
                disabled={disabled || jdUrlLoading || !jdUrl.trim() || !accessToken}
                onClick={() => void fetchJdFromUrl(jdUrl)}
              >
                {jdUrlLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 motion-safe:animate-spin mr-1.5" />
                    Fetching…
                  </>
                ) : (
                  'Fetch'
                )}
              </GlassButton>
            </div>
            {jdUrlError && (
              <p className="text-[11px] text-[var(--badge-red-text)]" role="alert">
                {jdUrlError}
              </p>
            )}
            {jdUrlLoadedFrom && !jdUrlError && (
              <p className="text-[11px] text-[var(--text-soft)]">
                Loaded {jobDescription.length.toLocaleString()} characters from{' '}
                <span className="text-[var(--bullet-confirm)]">{new URL(jdUrlLoadedFrom).hostname}</span>.
                Review and edit below if needed.
              </p>
            )}
          </div>

          <FileDropZone
            label="job description"
            accept=".txt,.docx,.pdf,.html,.htm"
            extract={extractJobDescriptionTextFromUpload}
            value={jobDescription}
            onChange={(next) => {
              setJobDescription(next);
              if (jdUrlLoadedFrom) setJdUrlLoadedFrom(null);
            }}
            disabled={disabled}
            pastePlaceholder="Paste the target job description…"
            pasteRows={8}
            defaultPasteOpen={Boolean(jobDescription)}
          />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-2">
              Job title (optional)
            </label>
            <GlassInput
              value={jdTitle}
              onChange={(e) => setJdTitle(e.target.value)}
              placeholder="e.g. Senior Product Manager"
              disabled={disabled}
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-2">
              Company (optional)
            </label>
            <GlassInput
              value={jdCompany}
              onChange={(e) => setJdCompany(e.target.value)}
              placeholder="e.g. Acme Corp"
              disabled={disabled}
            />
          </div>
        </div>

        <div className="pt-2">
          <GlassButton
            variant="primary"
            size="lg"
            disabled={!isValid || disabled}
            onClick={() => {
              if (!isValid || disabled) return;
              onSubmit({
                ...(usingMaster
                  ? { useMaster: true }
                  : { resumeText: resumeText.trim() }),
                jobDescription: jobDescription.trim(),
                jdTitle: jdTitle.trim() || undefined,
                jdCompany: jdCompany.trim() || undefined,
              });
            }}
          >
            {disabled ? 'Starting…' : 'Generate tailored resume'}
          </GlassButton>
        </div>
      </div>
    </GlassCard>
  );
}

/** Small radio-dot indicator rendered at the left edge of each option card. */
function RadioDot({ active }: { active: boolean }) {
  return (
    <div
      className={cn(
        'relative mt-0.5 h-4 w-4 flex-shrink-0 rounded-full border-2 transition-colors',
        active
          ? 'border-[var(--bullet-confirm)]'
          : 'border-[var(--line-strong)]',
      )}
      aria-hidden="true"
    >
      {active && (
        <div className="absolute inset-[2px] rounded-full bg-[var(--bullet-confirm)]" />
      )}
    </div>
  );
}
