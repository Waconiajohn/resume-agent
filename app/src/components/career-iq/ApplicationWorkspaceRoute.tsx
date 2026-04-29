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

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, Handshake, Mail, MessageSquare, Mic, Plus, Send, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import {
  APPLICATION_WORKSPACE_TOOLS,
  buildApplicationWorkspaceRoute,
  type ApplicationWorkspaceTool,
} from '@/lib/app-routing';
import { PursuitTimeline } from '@/components/applications/PursuitTimeline';
import { useApplicationTimeline } from '@/hooks/useApplicationTimeline';
import { API_BASE } from '@/lib/api';
import { CoverLetterScreen } from '@/components/cover-letter/CoverLetterScreen';
import { V3PipelineScreen } from '@/components/resume-v3/V3PipelineScreen';
import { ThankYouNoteRoom } from '@/components/career-iq/ThankYouNoteRoom';
import { NetworkingRoom } from '@/components/career-iq/NetworkingRoom';
import { InterviewLabRoom } from '@/components/career-iq/InterviewLabRoom';
import { FollowUpEmailRoom } from '@/components/career-iq/FollowUpEmailRoom';
import { SalaryNegotiationRoom } from '@/components/career-iq/SalaryNegotiationRoom';
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
  /**
   * Phase 2.3c — explicit user override for Offer / Negotiation tool
   * visibility. NULL defers to the stage-derived default (active when
   * stage = 'offer'). TRUE/FALSE force the result.
   */
  offer_enabled?: boolean | null;
  /**
   * Phase 2.3d — explicit user override for Follow-Up Email tool
   * visibility. NULL defers to the client-side stage approximation
   * (active when stage === 'interviewing'); the server's
   * computeFollowUpEmailDefault enriches that with thank-you / debrief
   * signals when the user asks to reset.
   */
  follow_up_email_enabled?: boolean | null;
  /**
   * Phase 2.3e — explicit user override for Thank-You Note tool
   * visibility. NULL defers to the stage-derived default (active when
   * stage in screening/interviewing; inactive for offer/closed_won/
   * closed_lost). TRUE/FALSE force the result.
   */
  thank_you_note_enabled?: boolean | null;
  /**
   * Phase 2.3f — explicit user override for the thin Networking
   * Message tool. NULL defers to the stage-derived default (active on
   * saved/researching/applied/screening/interviewing; inactive on
   * offer/closed_won/closed_lost). TRUE/FALSE force the result.
   */
  networking_enabled?: boolean | null;
  created_at: string;
  updated_at: string;
}

const TOOL_TOGGLE_FIELDS = [
  'interview_prep_enabled',
  'offer_enabled',
  'follow_up_email_enabled',
  'thank_you_note_enabled',
  'networking_enabled',
] as const;

type ToolToggleField = (typeof TOOL_TOGGLE_FIELDS)[number];
type ToolToggleOverrides = Partial<Record<ToolToggleField, boolean>>;

function toggleOverrideKey(applicationId: string): string {
  return `career-iq:application-tool-toggles:${applicationId}`;
}

function readToolToggleOverrides(applicationId: string): ToolToggleOverrides {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(toggleOverrideKey(applicationId)) ?? '{}') as Record<string, unknown>;
    const overrides: ToolToggleOverrides = {};
    for (const field of TOOL_TOGGLE_FIELDS) {
      if (typeof parsed[field] === 'boolean') overrides[field] = parsed[field];
    }
    return overrides;
  } catch {
    return {};
  }
}

function writeToolToggleOverrides(applicationId: string, patch: Partial<ApplicationRecord>) {
  if (typeof window === 'undefined') return;
  const next = readToolToggleOverrides(applicationId);
  let hasToggle = false;
  for (const field of TOOL_TOGGLE_FIELDS) {
    if (typeof patch[field] === 'boolean') {
      next[field] = patch[field];
      hasToggle = true;
    }
  }
  if (!hasToggle) return;
  try {
    window.localStorage.setItem(toggleOverrideKey(applicationId), JSON.stringify(next));
  } catch {
    // localStorage can be unavailable in private or restricted contexts.
  }
}

function applyToolToggleOverrides(app: ApplicationRecord): ApplicationRecord {
  return { ...app, ...readToolToggleOverrides(app.id) };
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

/**
 * Phase 2.3c — effective active-state for Offer / Negotiation on this
 * application. Explicit user toggle wins; otherwise derive from stage.
 */
export function isOfferActive(
  app: Pick<ApplicationRecord, 'stage' | 'offer_enabled'>,
): boolean {
  if (app.offer_enabled !== null && app.offer_enabled !== undefined) {
    return app.offer_enabled;
  }
  return app.stage === 'offer';
}

/**
 * Phase 2.3f — effective active-state for the thin Networking Message
 * tool. Explicit user toggle wins; otherwise derive from stage (active
 * on every non-terminal stage; inactive on offer/closed_won/closed_lost).
 */
export function isNetworkingActive(
  app: Pick<ApplicationRecord, 'stage' | 'networking_enabled'>,
): boolean {
  if (app.networking_enabled !== null && app.networking_enabled !== undefined) {
    return app.networking_enabled;
  }
  if (app.stage === 'offer' || app.stage === 'closed_won' || app.stage === 'closed_lost') {
    return false;
  }
  return true;
}

/**
 * Phase 2.3e — effective active-state for Thank-You Note on this
 * application. Explicit user toggle wins; otherwise derive from stage
 * (active when stage is screening or interviewing; inactive for
 * offer/closed_won/closed_lost).
 */
export function isThankYouNoteActive(
  app: Pick<ApplicationRecord, 'stage' | 'thank_you_note_enabled'>,
): boolean {
  if (app.thank_you_note_enabled !== null && app.thank_you_note_enabled !== undefined) {
    return app.thank_you_note_enabled;
  }
  if (app.stage === 'offer' || app.stage === 'closed_won' || app.stage === 'closed_lost') {
    return false;
  }
  return app.stage === 'screening' || app.stage === 'interviewing';
}

/**
 * Phase 2.3d — effective active-state for Follow-Up Email on this
 * application. Explicit user toggle wins; otherwise fall back to the
 * stage-only approximation (active when stage === 'interviewing').
 *
 * The authoritative stage-derived default (interviewing AND (thank-you
 * sent OR days-since-debrief > 3)) requires DB joins and lives on the
 * server (computeFollowUpEmailDefault in server/src/routes/follow-up-email.ts).
 * The client-side approximation is only used to decide whether to mute
 * the pill before the user clicks; any user action round-trips through
 * the server, so drift between the approximation and the authoritative
 * rule never produces a wrong-looking tool state.
 */
export function isFollowUpEmailActive(
  app: Pick<ApplicationRecord, 'stage' | 'follow_up_email_enabled'>,
): boolean {
  if (app.follow_up_email_enabled !== null && app.follow_up_email_enabled !== undefined) {
    return app.follow_up_email_enabled;
  }
  return app.stage === 'interviewing';
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
  signal?: AbortSignal,
): Promise<{ ok: true; data: ApplicationRecord } | { ok: false; status: number }> {
  const res = await fetch(`${API_BASE}/job-applications/${id}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
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
  // Phase 3 — when :tool is absent we run the smart-default resolver below
  // (fetches the timeline payload, then redirects to overview or the highest-
  // priority Next rule). When :tool is present we trust it and dispatch.
  const { applicationId = '', tool: rawTool } = useParams();
  const isSmartDefault = rawTool === undefined;
  const invalidTool = !isSmartDefault && !isValidTool(rawTool);
  const tool: ApplicationWorkspaceTool = isSmartDefault || invalidTool ? 'overview' : rawTool;

  const [loading, setLoading] = useState(true);
  const [application, setApplication] = useState<ApplicationRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toggleInFlight, setToggleInFlight] = useState(false);
  const [toolMenuOpen, setToolMenuOpen] = useState(false);
  const toolMenuRef = useRef<HTMLDivElement | null>(null);

  // Declared before the early returns below so hook order stays stable across
  // the loading / error / loaded render branches (Rules of Hooks).
  const applyToggle = useCallback(
    async (patch: Partial<ApplicationRecord>) => {
      if (!accessToken || !application) return;
      writeToolToggleOverrides(application.id, patch);
      setApplication((current) => (current ? { ...current, ...patch } : current));
      setToggleInFlight(true);
      try {
        const result = await patchApplication(application.id, accessToken, patch);
        if (result.ok) {
          setApplication(applyToolToggleOverrides(result.data));
        }
      } finally {
        setToggleInFlight(false);
      }
    },
    [accessToken, application],
  );

  const handleToggleInterviewPrep = useCallback(
    (enabled: boolean) => applyToggle({ interview_prep_enabled: enabled }),
    [applyToggle],
  );

  const handleToggleOffer = useCallback(
    (enabled: boolean) => applyToggle({ offer_enabled: enabled }),
    [applyToggle],
  );

  const handleToggleFollowUpEmail = useCallback(
    (enabled: boolean) => applyToggle({ follow_up_email_enabled: enabled }),
    [applyToggle],
  );

  const handleToggleThankYouNote = useCallback(
    (enabled: boolean) => applyToggle({ thank_you_note_enabled: enabled }),
    [applyToggle],
  );

  const handleToggleNetworking = useCallback(
    (enabled: boolean) => applyToggle({ networking_enabled: enabled }),
    [applyToggle],
  );

  // Phase 3 — always fetch the timeline payload alongside the application.
  // The overview body needs Done/Next/Their-turn; the smart-default resolver
  // needs hasAnyDone + the highest-priority Next rule's target.
  const timeline = useApplicationTimeline({ applicationId });

  useEffect(() => {
    if (!toolMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!toolMenuRef.current?.contains(event.target)) {
        setToolMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setToolMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [toolMenuOpen]);

  useEffect(() => {
    setToolMenuOpen(false);
  }, [applicationId, tool]);

  useEffect(() => {
    if (!applicationId) {
      setApplication(null);
      setError('Application ID is missing from this link.');
      setLoading(false);
      return;
    }

    if (!accessToken) {
      setApplication(null);
      setError(null);
      setLoading(true);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    setLoading(true);
    setError(null);

    fetchApplication(applicationId, accessToken, controller.signal)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setApplication(applyToolToggleOverrides(res.data));
        } else if (res.status === 404) {
          setError('Application not found');
        } else {
          setError(`Failed to load application (HTTP ${res.status})`);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof DOMException && err.name === 'AbortError'
            ? 'Application load timed out. Try opening the Pipeline and selecting this application again.'
            : err instanceof Error ? err.message : 'Failed to load application');
        }
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [applicationId, accessToken]);

  // Validate the tool after hooks have run so bad URLs redirect without
  // violating React's Rules of Hooks.
  if (invalidTool) {
    return <Navigate to={`/workspace/application/${encodeURIComponent(applicationId)}/overview`} replace />;
  }

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
          <GlassButton variant="ghost" className="mt-5" onClick={() => onNavigate?.('/workspace/applications')}>
            Back to applications
          </GlassButton>
        </GlassCard>
      </div>
    );
  }

  // Phase 3 — smart-default resolver. When the URL has no :tool, decide
  // where to land based on Done content. If anything is done, render
  // overview. If nothing is done, route to the highest-priority Next rule
  // (so a brand-new pursuit lands on the action that matters most). Falls
  // through to overview when neither signal fires. Explicit ?tool= URLs
  // always bypass this — the user's choice wins.
  if (isSmartDefault) {
    if (timeline.loading) {
      return (
        <div className="mx-auto flex max-w-[1200px] flex-col gap-6 p-6">
          <PursuitTimeline
            applicationId={applicationId}
            stage={application.stage}
            done={[]}
            next={[]}
            theirTurn={[]}
            loading
          />
        </div>
      );
    }
    if (timeline.hasAnyDone || timeline.next.length === 0) {
      return (
        <Navigate
          to={buildApplicationWorkspaceRoute(applicationId, 'overview')}
          replace
        />
      );
    }
    return (
      <Navigate
        to={buildApplicationWorkspaceRoute(applicationId, timeline.next[0].target)}
        replace
      />
    );
  }

  // Phase 1.3 — dispatch to the real tool screen with applicationId.
  // When :applicationId changes (user switches to a different application),
  // React Router replaces this subtree, unmounting the tool screen and
  // clearing any singleton hook state it held. That's the state-reset
  // fix: scope lives in the URL, not in long-lived hooks.

  const interviewPrepActive = isInterviewPrepActive(application);
  const offerActive = isOfferActive(application);
  const followUpEmailActive = isFollowUpEmailActive(application);
  const thankYouNoteActive = isThankYouNoteActive(application);
  const networkingActive = isNetworkingActive(application);
  const primaryTools: readonly ApplicationWorkspaceTool[] = [
    'overview',
    'resume',
    'cover-letter',
    'networking',
    'interview-prep',
  ];
  const secondaryTools: readonly ApplicationWorkspaceTool[] = [
    'thank-you-note',
    'follow-up-email',
    'offer-negotiation',
  ];
  const toolLabel = (value: ApplicationWorkspaceTool) => {
    if (value === 'cover-letter') return 'Cover Letter';
    if (value === 'interview-prep') return 'Interview Prep';
    if (value === 'thank-you-note') return 'Thank You';
    if (value === 'follow-up-email') return 'Follow Up';
    if (value === 'offer-negotiation') return 'Offer';
    return value.replace(/-/g, ' ');
  };
  const visibleSecondaryTools = secondaryTools.filter((value) => value === tool);
  const hiddenSecondaryTools = secondaryTools.filter((value) => !visibleSecondaryTools.includes(value));
  const visibleTools = [...primaryTools, ...visibleSecondaryTools];

  const ApplicationHeader = (
    <div className="panel-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
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
      </div>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1 text-xs">
        {visibleTools.map((t) => {
          const isSelected = t === tool;
          // Phase 2.3b + 2.3c — Interview Prep and Offer/Negotiation render
          // muted (dashed border, muted text) when they're not the current
          // tool AND their toggle resolves inactive. When the user IS
          // viewing one of them, the pill renders active-selected
          // regardless of activation state — the activation screen lives
          // in the body, not the pill.
          const isMutedInactive = !isSelected && (
            (t === 'interview-prep' && !interviewPrepActive)
            || (t === 'offer-negotiation' && !offerActive)
            || (t === 'follow-up-email' && !followUpEmailActive)
            || (t === 'thank-you-note' && !thankYouNoteActive)
            || (t === 'networking' && !networkingActive)
          );
          return (
            <button
              key={t}
              type="button"
              onClick={() => onNavigate?.(buildApplicationWorkspaceRoute(applicationId, t))}
              aria-pressed={isSelected}
              data-state={isSelected ? 'active' : isMutedInactive ? 'muted' : 'available'}
              className={cn(
                'shrink-0 rounded-[8px] px-3 py-1.5 font-semibold capitalize transition-colors',
                isSelected
                  ? 'bg-[var(--link)] text-white'
                  : isMutedInactive
                    ? 'border border-dashed border-[var(--line-soft)] text-[var(--text-muted)] hover:bg-[var(--rail-tab-hover-bg)] hover:text-[var(--text-soft)]'
                    : 'border border-[var(--line-soft)] text-[var(--text-soft)] hover:bg-[var(--rail-tab-hover-bg)]',
              )}
            >
              {toolLabel(t)}
            </button>
          );
        })}
        {hiddenSecondaryTools.length > 0 && (
          <div className="relative shrink-0" ref={toolMenuRef}>
            <button
              type="button"
              onClick={() => setToolMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={toolMenuOpen}
              data-state="available"
              className="rounded-[8px] border border-[var(--line-soft)] px-3 py-1.5 font-semibold text-[var(--text-soft)] transition-colors hover:bg-[var(--rail-tab-hover-bg)]"
            >
              More tools
            </button>
            {toolMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-[10px] border border-[var(--line-soft)] bg-[var(--surface-1)] py-1 shadow-lg"
              >
                {hiddenSecondaryTools.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setToolMenuOpen(false);
                      onNavigate?.(buildApplicationWorkspaceRoute(applicationId, t));
                    }}
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-[12px] text-[var(--text-soft)] hover:bg-[var(--rail-tab-hover-bg)] hover:text-[var(--text-strong)]"
                  >
                    <span className="font-semibold">{toolLabel(t)}</span>
                    <span className="text-[11px] text-[var(--text-muted)]">Turn on when this pursuit reaches that moment.</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // ── Tool dispatch ────────────────────────────────────────────────────
  // Approach C Sprint A — pass the application's stored values (role, company,
  // JD) through to every tool that accepts them so the user doesn't retype
  // what they entered at app creation. Each tool's own `initial*` props are
  // optional; missing values degrade to empty-form behavior.
  let body: ReactElement;
  if (tool === 'overview') {
    body = (
      <PursuitTimeline
        applicationId={applicationId}
        stage={application.stage}
        done={timeline.done}
        next={timeline.next}
        theirTurn={timeline.theirTurn}
        loading={timeline.loading}
        onNavigate={onNavigate}
      />
    );
  } else if (tool === 'resume') {
    body = (
      <V3PipelineScreen
        accessToken={accessToken}
        applicationId={applicationId}
        initialJobUrl={application.url}
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
        initialRoleTitle={application.role_title}
        initialJobDescription={application.jd_text}
        backTarget={buildApplicationWorkspaceRoute(applicationId, 'resume')}
        backLabel="Back to resume"
      />
    );
  } else if (tool === 'thank-you-note') {
    // Phase 2.3e — gate on activation state. Inactive applications
    // render the activation screen; clicking Activate flips
    // thank_you_note_enabled to TRUE and reveals the room.
    if (thankYouNoteActive) {
      body = (
        <>
          <ThankYouNoteRoom
            key={applicationId}
            initialJobApplicationId={applicationId}
            initialCompany={application.company_name}
            initialRole={application.role_title}
          />
          <HideToolLink
            label="Hide Thank-You Notes for this application"
            disabled={toggleInFlight}
            onHide={() => handleToggleThankYouNote(false)}
          />
        </>
      );
    } else {
      body = (
        <ToolActivationScreen
          icon={Mail}
          title="Write thank-you notes"
          description="Draft tailored thank-yous for everyone you met with. Each note is calibrated by recipient role — hiring manager, recruiter, panel interviewer, executive sponsor — and you can refine each one independently. Send within a day or two of the interview."
          activateLabel="Activate Thank-You Notes"
          activating={toggleInFlight}
          onActivate={() => handleToggleThankYouNote(true)}
          onBack={() => onNavigate?.(buildApplicationWorkspaceRoute(applicationId, 'resume'))}
        />
      );
    }
  } else if (tool === 'networking') {
    // Phase 2.3f — thin peer-tool treatment. Swapped from NetworkingHubRoom
    // (still alive inside SmartReferralsRoom's Outreach tab) to the new
    // single-recipient, single-message NetworkingRoom. Toggle gates entry.
    if (networkingActive) {
      body = (
        <>
          <NetworkingRoom
            key={applicationId}
            applicationId={applicationId}
            initialCompany={application.company_name}
            initialRole={application.role_title}
          />
          <HideToolLink
            label="Hide Networking Message for this application"
            disabled={toggleInFlight}
            onHide={() => handleToggleNetworking(false)}
          />
        </>
      );
    } else {
      body = (
        <ToolActivationScreen
          icon={MessageSquare}
          title="Draft a networking message"
          description="Write a focused message to someone in your network for this application. Pick the recipient, set your goal, and we'll draft a clean, appropriately-toned opener — calibrated to a former colleague, a second-degree connection, a cold outreach, or a referrer. Turn it off once the application's past the networking window."
          activateLabel="Activate Networking Message"
          activating={toggleInFlight}
          onActivate={() => handleToggleNetworking(true)}
          onBack={() => onNavigate?.(buildApplicationWorkspaceRoute(applicationId, 'resume'))}
        />
      );
    }
  } else if (tool === 'interview-prep') {
    // Phase 2.3b — gate on activation state. Inactive applications render
    // the lightweight activation screen instead of the lab; clicking
    // Activate flips interview_prep_enabled to TRUE server-side and
    // re-renders the lab. Reverse toggle lives below the lab content.
    if (interviewPrepActive) {
      body = (
        <>
          <InterviewLabRoom
            key={applicationId}
            initialJobApplicationId={applicationId}
            initialCompany={application.company_name}
            initialRole={application.role_title}
          />
          <HideToolLink
            label="Hide Interview Prep for this application"
            disabled={toggleInFlight}
            onHide={() => handleToggleInterviewPrep(false)}
          />
        </>
      );
    } else {
      body = (
        <ToolActivationScreen
          icon={Mic}
          title="Interview Prep is ready when you are"
          description="Turn this on once an interview is on the calendar. Interview Prep uses the role, the job description, and your positioning to generate a briefing, practice questions, and leave-behinds — all scoped to this application. Leave it off until you have an interview scheduled; nothing is lost by flipping it on later."
          activateLabel="Activate Interview Prep"
          activating={toggleInFlight}
          onActivate={() => handleToggleInterviewPrep(true)}
          onBack={() => onNavigate?.(buildApplicationWorkspaceRoute(applicationId, 'resume'))}
        />
      );
    }
  } else if (tool === 'follow-up-email') {
    // Phase 2.3d — tool === 'follow-up-email'. Same toggle pattern as
    // Interview Prep and Offer / Negotiation. FollowUpEmailRoom hosts the
    // SSE agent flow; the activation screen gates it until the user turns
    // the tool on.
    if (followUpEmailActive) {
      body = (
        <>
          <FollowUpEmailRoom
            key={applicationId}
            applicationId={applicationId}
            initialCompany={application.company_name}
            initialRole={application.role_title}
          />
          <HideToolLink
            label="Hide Follow-Up Email for this application"
            disabled={toggleInFlight}
            onHide={() => handleToggleFollowUpEmail(false)}
          />
        </>
      );
    } else {
      body = (
        <ToolActivationScreen
          icon={Send}
          title="Follow up with the hiring team"
          description="Send a polite nudge when the timeline has stretched. Follow-Up Email drafts a sequence-aware message that references your interview conversation and keeps you top of mind — first a warm check-in, then a more direct ask, and finally a graceful value-add if the silence continues. Turn it on when you're ready to nudge."
          activateLabel="Activate Follow-Up Email"
          activating={toggleInFlight}
          onActivate={() => handleToggleFollowUpEmail(true)}
          onBack={() => onNavigate?.(buildApplicationWorkspaceRoute(applicationId, 'resume'))}
        />
      );
    }
  } else {
    // Phase 2.3c — tool === 'offer-negotiation'. Same toggle pattern as
    // Interview Prep: activation screen when inactive, SalaryNegotiationRoom
    // plus a reverse-toggle link when active.
    if (offerActive) {
      body = (
        <>
          <SalaryNegotiationRoom
            key={applicationId}
            prefillJobApplicationId={applicationId}
            prefillCompany={application.company_name}
            prefillRole={application.role_title}
          />
          <HideToolLink
            label="Hide Offer & Negotiation for this application"
            disabled={toggleInFlight}
            onHide={() => handleToggleOffer(false)}
          />
        </>
      );
    } else {
      body = (
        <ToolActivationScreen
          icon={Handshake}
          title="Offer & Negotiation is ready when you are"
          description="Turn this on once an offer has been extended. Offer & Negotiation helps you analyze the offer, prepare your counter, and practice the conversation — all scoped to this application. Leave it off until the offer lands; nothing is lost by flipping it on later."
          activateLabel="Activate Offer & Negotiation"
          activating={toggleInFlight}
          onActivate={() => handleToggleOffer(true)}
          onBack={() => onNavigate?.(buildApplicationWorkspaceRoute(applicationId, 'resume'))}
        />
      );
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-[1280px] flex-col gap-6 overflow-y-auto p-6">
      {/* Sprint B6 — breadcrumb. Matches the pattern rendered by room
          screens (Workspace > Section) but adds the application's company
          name and active tool for a full trail. Workspace and Pipeline are
          clickable back-links. */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 overflow-x-auto py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">
        <button
          type="button"
          className="shrink-0 whitespace-nowrap hover:text-[var(--text-strong)]"
          onClick={() => onNavigate?.('/workspace')}
        >
          Workspace
        </button>
        <ChevronRight className="h-3 w-3 flex-none" aria-hidden="true" />
        <button
          type="button"
          className="shrink-0 whitespace-nowrap hover:text-[var(--text-strong)]"
          onClick={() => onNavigate?.('/workspace/applications')}
        >
          Pipeline
        </button>
        <ChevronRight className="h-3 w-3 flex-none" aria-hidden="true" />
        <span className="shrink-0 whitespace-nowrap text-[var(--text-strong)]">{application.company_name}</span>
        <ChevronRight className="h-3 w-3 flex-none" aria-hidden="true" />
        <span className="shrink-0 whitespace-nowrap text-[var(--text-strong)]" aria-current="page">
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

// ─── ToolActivationScreen (Phase 2.3c, extracted from Phase 2.3b) ──────
// Shared body-level activation surface. Renders when a toggleable tool's
// effective state is inactive. Keeps URL stable at the tool route; the
// user clicks Activate to flip the enabled flag and reveal the tool body.
// Used by Interview Prep (Mic icon) and Offer / Negotiation (Handshake
// icon). `description` accepts ReactNode so future screens can use
// multi-paragraph or inline-linked copy without widening the API.

interface ToolActivationScreenProps {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  activateLabel: string;
  activating: boolean;
  onActivate: () => void;
  onBack: () => void;
}

function ToolActivationScreen({
  icon: Icon,
  title,
  description,
  activateLabel,
  activating,
  onActivate,
  onBack,
}: ToolActivationScreenProps) {
  return (
    <GlassCard className="p-8">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-[var(--link)]/12 p-2">
          <Icon size={16} className="text-[var(--link)]" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-[var(--text-strong)]">
            {title}
          </h2>
          <div className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--text-soft)]">
            {typeof description === 'string' ? <p>{description}</p> : description}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <GlassButton
              variant="primary"
              size="sm"
              onClick={onActivate}
              disabled={activating}
              loading={activating}
            >
              {activating ? 'Activating…' : activateLabel}
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

// ─── HideToolLink (Phase 2.3c, extracted from Phase 2.3b) ──────────────
// Shared reverse-toggle affordance. Small right-aligned muted link that
// sits below a tool's content. Setting the enabled flag to FALSE re-
// renders the activation screen in place (URL stays put).

interface HideToolLinkProps {
  label: string;
  disabled: boolean;
  onHide: () => void;
}

function HideToolLink({ label, disabled, onHide }: HideToolLinkProps) {
  return (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={onHide}
        disabled={disabled}
        className="text-[12px] text-[var(--text-soft)] transition-colors hover:text-[var(--text-muted)] disabled:opacity-60"
      >
        {label}
      </button>
    </div>
  );
}
