/**
 * ApplicationWorkspaceRoute — Approach C Phase 1.2.
 *
 * URL: /workspace/application/:applicationId/:tool
 * Tools: resume | cover-letter | thank-you-note | networking | interview-prep
 *
 * Thin container. Reads the application ID + tool from the URL, fetches the
 * application record, and renders the appropriate tool screen with the
 * applicationId prop. React Router remounts this route (and every child
 * below it) when :applicationId changes — which clears any singleton hook
 * state in the children as a side effect. That's the routing-layer fix for
 * the cover-letter state-reset bug (see
 * docs/investigations/state-reset-and-export-plan.md).
 *
 * Phase 1.3 will update the individual tool screens (CoverLetterScreen,
 * ThankYouNoteScreen, etc.) to accept an `applicationId` prop and thread
 * it through their startPipeline calls.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, Mic, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import {
  APPLICATION_WORKSPACE_TOOLS,
  RESUME_BUILDER_SESSION_ROUTE,
  buildApplicationWorkspaceRoute,
  type ApplicationWorkspaceTool,
} from '@/lib/app-routing';
import { API_BASE } from '@/lib/api';
import { CoverLetterScreen } from '@/components/cover-letter/CoverLetterScreen';
import { V3PipelineScreen } from '@/components/resume-v3/V3PipelineScreen';
import { ThankYouNoteRoom } from '@/components/career-iq/ThankYouNoteRoom';
import { NetworkingHubRoom } from '@/components/career-iq/NetworkingHubRoom';
import { InterviewLabRoom } from '@/components/career-iq/InterviewLabRoom';
import { useJobApplications } from '@/hooks/useJobApplications';
import type { MasterResume } from '@/types/resume';

interface ApplicationRecord {
  id: string;
  user_id: string;
  role_title: string;
  company_name: string;
  stage: string;
  url?: string;
  jd_text?: string;
  applied_date?: string | null;
  next_action?: string | null;
  /**
   * Phase 2.3b — explicit user override for Interview Prep tool visibility.
   * NULL defers to the stage-derived default (active when stage in
   * screening/interviewing). TRUE/FALSE force the result.
   */
  interview_prep_enabled?: boolean | null;
  created_at: string;
  updated_at: string;
}

/**
 * Phase 2.3b — effective active-state for Interview Prep on this application.
 * Explicit user toggle wins; otherwise derive from stage.
 */
export function isInterviewPrepActive(
  app: Pick<ApplicationRecord, 'stage' | 'interview_prep_enabled'>,
): boolean {
  if (app.interview_prep_enabled !== null && app.interview_prep_enabled !== undefined) {
    return app.interview_prep_enabled;
  }
  return app.stage === 'screening' || app.stage === 'interviewing';
}

interface ApplicationWorkspaceRouteProps {
  accessToken: string | null;
  onNavigate?: (route: string) => void;
  /**
   * Optional default-resume fetcher, passed through to tool screens that
   * pre-fill from the master resume (cover letter, thank-you note). App.tsx
   * wires `getDefaultResume` from useSession here when available.
   */
  onGetDefaultResume?: () => Promise<MasterResume | null>;
}

function isValidTool(value: string | undefined): value is ApplicationWorkspaceTool {
  return typeof value === 'string' && (APPLICATION_WORKSPACE_TOOLS as readonly string[]).includes(value);
}

async function fetchApplication(
  id: string,
  accessToken: string,
): Promise<{ ok: true; data: ApplicationRecord } | { ok: false; status: number }> {
  const res = await fetch(`${API_BASE}/job-applications/${id}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { ok: false, status: res.status };
  const data = (await res.json()) as ApplicationRecord;
  return { ok: true, data };
}

async function patchApplication(
  id: string,
  accessToken: string,
  patch: Partial<ApplicationRecord>,
): Promise<{ ok: true; data: ApplicationRecord } | { ok: false; status: number }> {
  const res = await fetch(`${API_BASE}/job-applications/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) return { ok: false, status: res.status };
  const data = (await res.json()) as ApplicationRecord;
  return { ok: true, data };
}

export function ApplicationWorkspaceRoute({
  accessToken,
  onNavigate,
  onGetDefaultResume,
}: ApplicationWorkspaceRouteProps) {
  const { applicationId = '', tool = 'resume' } = useParams();

  // Validate the tool before rendering anything — a bad URL segment should
  // fall back to the default rather than crash a product screen.
  if (!isValidTool(tool)) {
    return <Navigate to={`/workspace/application/${encodeURIComponent(applicationId)}/resume`} replace />;
  }

  const [loading, setLoading] = useState(true);
  const [application, setApplication] = useState<ApplicationRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toggleInFlight, setToggleInFlight] = useState(false);

  // Declared before the early returns below so hook order stays stable across
  // the loading / error / loaded render branches (Rules of Hooks).
  const handleToggleInterviewPrep = useCallback(
    async (enabled: boolean) => {
      if (!accessToken || !application) return;
      setToggleInFlight(true);
      try {
        const result = await patchApplication(application.id, accessToken, {
          interview_prep_enabled: enabled,
        });
        if (result.ok) {
          setApplication(result.data);
        }
      } finally {
        setToggleInFlight(false);
      }
    },
    [accessToken, application],
  );

  useEffect(() => {
    if (!applicationId || !accessToken) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchApplication(applicationId, accessToken)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setApplication(res.data);
        } else if (res.status === 404) {
          setError('Application not found');
        } else {
          setError(`Failed to load application (HTTP ${res.status})`);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load application');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [applicationId, accessToken]);

  if (loading) {
    return (
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 p-6">
        <GlassCard className="p-8 text-sm text-[var(--text-soft)]">Loading application…</GlassCard>
      </div>
    );
  }

  if (error || !application) {
    return (
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 p-6">
        <GlassCard className="p-8">
          <h1 className="text-xl font-semibold text-[var(--text-strong)]">Application not found</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--text-soft)]">
            {error ?? 'This application could not be loaded. It may have been deleted or you may not have access.'}
          </p>
          <GlassButton variant="ghost" className="mt-5" onClick={() => onNavigate?.(RESUME_BUILDER_SESSION_ROUTE)}>
            Back to workspace
          </GlassButton>
        </GlassCard>
      </div>
    );
  }

  // Phase 1.3 — dispatch to the real tool screen with applicationId.
  // When :applicationId changes (user switches to a different application),
  // React Router replaces this subtree, unmounting the tool screen and
  // clearing any singleton hook state it held. That's the state-reset
  // fix: scope lives in the URL, not in long-lived hooks.

  const interviewPrepActive = isInterviewPrepActive(application);

  const ApplicationHeader = (
    <GlassCard className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-widest text-[var(--link)]">
            Application
          </div>
          <ApplicationSwitcher
            current={application}
            onNavigate={onNavigate}
          />
          <p className="mt-0.5 text-sm text-[var(--text-soft)]">
            {application.role_title} · Stage: <span className="font-medium text-[var(--text-strong)]">{application.stage}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {(APPLICATION_WORKSPACE_TOOLS as readonly ApplicationWorkspaceTool[]).map((t) => {
            const isSelected = t === tool;
            // Phase 2.3b — Interview Prep is muted (dashed border, muted text)
            // when it's not the current tool AND its toggle resolves inactive.
            // When the user IS viewing Interview Prep, the pill renders
            // active-selected regardless of activation state — the activation
            // screen lives in the body, not the pill.
            const isMutedInactive = t === 'interview-prep' && !isSelected && !interviewPrepActive;
            return (
              <button
                key={t}
                type="button"
                onClick={() => onNavigate?.(buildApplicationWorkspaceRoute(applicationId, t))}
                aria-pressed={isSelected}
                data-state={isSelected ? 'active' : isMutedInactive ? 'muted' : 'available'}
                className={cn(
                  'rounded-full px-3 py-1',
                  isSelected
                    ? 'bg-[var(--link)] font-semibold text-[var(--link-on)]'
                    : isMutedInactive
                      ? 'border border-dashed border-[var(--line-soft)] text-[var(--text-muted)] hover:bg-[var(--rail-tab-hover-bg)] hover:text-[var(--text-soft)]'
                      : 'border border-[var(--line-soft)] text-[var(--text-soft)] hover:bg-[var(--rail-tab-hover-bg)]',
                )}
              >
                {t.replace(/-/g, ' ')}
              </button>
            );
          })}
        </div>
      </div>
    </GlassCard>
  );

  // ── Tool dispatch ────────────────────────────────────────────────────
  // Approach C Sprint A — pass the application's stored values (role, company,
  // JD) through to every tool that accepts them so the user doesn't retype
  // what they entered at app creation. Each tool's own `initial*` props are
  // optional; missing values degrade to empty-form behavior.
  let body: ReactElement;
  if (tool === 'resume') {
    body = (
      <V3PipelineScreen
        accessToken={accessToken}
        applicationId={applicationId}
        initialJobDescription={application.jd_text}
        initialJdTitle={application.role_title}
        initialJdCompany={application.company_name}
      />
    );
  } else if (tool === 'cover-letter') {
    body = (
      <CoverLetterScreen
        accessToken={accessToken}
        onNavigate={onNavigate ?? (() => {})}
        onGetDefaultResume={onGetDefaultResume}
        embedded
        applicationId={applicationId}
        initialCompanyName={application.company_name}
        initialJobDescription={application.jd_text}
        backTarget={buildApplicationWorkspaceRoute(applicationId, 'resume')}
        backLabel="Back to resume"
      />
    );
  } else if (tool === 'thank-you-note') {
    // ThankYouNoteRoom already accepts initialJobApplicationId; bonus:
    // pre-fill company + role from the application so the user doesn't
    // have to retype them. Key on applicationId forces a full remount
    // when the user switches applications within the thank-you tool.
    body = (
      <ThankYouNoteRoom
        key={applicationId}
        initialJobApplicationId={applicationId}
        initialCompany={application.company_name}
        initialRole={application.role_title}
      />
    );
  } else if (tool === 'networking') {
    body = (
      <NetworkingHubRoom
        key={applicationId}
        initialJobApplicationId={applicationId}
        initialTargetCompany={application.company_name}
      />
    );
  } else {
    // `tool` narrows to 'interview-prep' here (the only remaining case in
    // APPLICATION_WORKSPACE_TOOLS). Phase 2.3b — gate on activation state.
    // Inactive applications render the lightweight activation screen
    // instead of the lab; clicking Activate flips interview_prep_enabled
    // to TRUE server-side and re-renders the lab.
    if (interviewPrepActive) {
      body = (
        <>
          <InterviewLabRoom
            key={applicationId}
            initialJobApplicationId={applicationId}
            initialCompany={application.company_name}
            initialRole={application.role_title}
          />
          <HideInterviewPrepLink
            disabled={toggleInFlight}
            onHide={() => handleToggleInterviewPrep(false)}
          />
        </>
      );
    } else {
      body = (
        <InterviewPrepActivationScreen
          activating={toggleInFlight}
          onActivate={() => handleToggleInterviewPrep(true)}
          onBack={() => onNavigate?.(buildApplicationWorkspaceRoute(applicationId, 'resume'))}
        />
      );
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-[1280px] flex-col gap-6 overflow-y-auto p-6">
      {/* Sprint B6 — breadcrumb. Matches the pattern rendered by room
          screens (Workspace > Section) but adds the application's company
          name and active tool for a full trail. Workspace and My
          Applications are clickable back-links. */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">
        <button
          type="button"
          className="hover:text-[var(--text-strong)]"
          onClick={() => onNavigate?.('/workspace')}
        >
          Workspace
        </button>
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
        <button
          type="button"
          className="hover:text-[var(--text-strong)]"
          onClick={() => onNavigate?.('/workspace/applications')}
        >
          My Applications
        </button>
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
        <span className="text-[var(--text-strong)]">{application.company_name}</span>
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
        <span className="text-[var(--text-strong)]" aria-current="page">
          {tool.replace(/-/g, ' ')}
        </span>
      </nav>
      {ApplicationHeader}
      {body}
    </div>
  );
}

// ─── ApplicationSwitcher ───────────────────────────────────────────────
// Sprint B3 — the application's company name in the header doubles as a
// dropdown: click to see other recent applications + a shortcut to the full
// list. Lets a user hop between applications without round-tripping through
// the list screen.

interface ApplicationSwitcherProps {
  current: ApplicationRecord;
  onNavigate?: (route: string) => void;
}

function ApplicationSwitcher({ current, onNavigate }: ApplicationSwitcherProps) {
  const { applications } = useJobApplications();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Show the most-recently-updated applications other than the current one.
  const others = useMemo(
    () =>
      applications
        .filter((app) => app.id !== current.id)
        .slice(0, 6),
    [applications, current.id],
  );

  // Click-outside / Escape to close.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative inline-block" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-1 inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-xl font-semibold text-[var(--text-strong)] hover:bg-[var(--accent-muted)]"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {current.company_name}
        <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-10 mt-1 w-72 overflow-hidden rounded-[10px] border border-[var(--line-soft)] bg-[var(--surface-1)] shadow-lg"
        >
          {others.length > 0 && (
            <div className="border-b border-[var(--line-soft)] py-1">
              <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-soft)]">
                Switch application
              </div>
              {others.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onNavigate?.(buildApplicationWorkspaceRoute(app.id, 'resume'));
                  }}
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-[var(--rail-tab-hover-bg)]"
                >
                  <span className="text-sm text-[var(--text-strong)]">{app.company_name}</span>
                  <span className="text-[11px] text-[var(--text-soft)]">{app.role_title}</span>
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onNavigate?.('/workspace/applications');
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text-muted)] hover:bg-[var(--rail-tab-hover-bg)] hover:text-[var(--text-strong)]"
          >
            <Plus className="h-4 w-4" />
            New application · View all
          </button>
        </div>
      )}
    </div>
  );
}

// ─── InterviewPrepActivationScreen (Phase 2.3b) ────────────────────────
// Minimal body-level activation surface shown when Interview Prep's
// effective state is inactive (either explicit `interview_prep_enabled =
// false` or stage-derived default off). Keeps URL stable at
// `/workspace/application/:id/interview-prep`; the user clicks Activate to
// flip the flag and reveal InterviewLabRoom.

interface InterviewPrepActivationScreenProps {
  activating: boolean;
  onActivate: () => void;
  onBack: () => void;
}

function InterviewPrepActivationScreen({
  activating,
  onActivate,
  onBack,
}: InterviewPrepActivationScreenProps) {
  return (
    <GlassCard className="p-8">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-[var(--link)]/12 p-2">
          <Mic size={16} className="text-[var(--link)]" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-[var(--text-strong)]">
            Interview Prep is ready when you are
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--text-soft)]">
            Turn this on once an interview is on the calendar. Interview Prep uses the role,
            the job description, and your positioning to generate a briefing, practice
            questions, and leave-behinds — all scoped to this application. Leave it off until
            you have an interview scheduled; nothing is lost by flipping it on later.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <GlassButton
              variant="primary"
              size="sm"
              onClick={onActivate}
              disabled={activating}
              loading={activating}
            >
              {activating ? 'Activating…' : 'Activate Interview Prep'}
            </GlassButton>
            <button
              type="button"
              onClick={onBack}
              className="text-[13px] text-[var(--text-soft)] transition-colors hover:text-[var(--text-muted)]"
            >
              I&rsquo;ll come back later
            </button>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

// ─── HideInterviewPrepLink (Phase 2.3b) ────────────────────────────────
// Reverse toggle — renders below InterviewLabRoom. Lets the user set
// `interview_prep_enabled = false` when they don't need the tool anymore;
// the activation screen takes over next visit.

interface HideInterviewPrepLinkProps {
  disabled: boolean;
  onHide: () => void;
}

function HideInterviewPrepLink({ disabled, onHide }: HideInterviewPrepLinkProps) {
  return (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={onHide}
        disabled={disabled}
        className="text-[12px] text-[var(--text-soft)] transition-colors hover:text-[var(--text-muted)] disabled:opacity-60"
      >
        Hide Interview Prep for this application
      </button>
    </div>
  );
}
