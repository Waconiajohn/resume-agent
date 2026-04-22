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

import { useEffect, useState, type ReactElement } from 'react';
import { Navigate, useParams } from 'react-router-dom';
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
  created_at: string;
  updated_at: string;
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

  const ApplicationHeader = (
    <GlassCard className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-widest text-[var(--link)]">
            Application
          </div>
          <h1 className="mt-1 text-xl font-semibold text-[var(--text-strong)]">
            {application.company_name}
          </h1>
          <p className="mt-0.5 text-sm text-[var(--text-soft)]">
            {application.role_title} · Stage: <span className="font-medium text-[var(--text-strong)]">{application.stage}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {(APPLICATION_WORKSPACE_TOOLS as readonly ApplicationWorkspaceTool[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onNavigate?.(buildApplicationWorkspaceRoute(applicationId, t))}
              className={
                t === tool
                  ? 'rounded-full bg-[var(--link)] px-3 py-1 font-semibold text-[var(--link-on)]'
                  : 'rounded-full border border-[var(--line-soft)] px-3 py-1 text-[var(--text-soft)] hover:bg-[var(--rail-tab-hover-bg)]'
              }
            >
              {t.replace(/-/g, ' ')}
            </button>
          ))}
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
    // APPLICATION_WORKSPACE_TOOLS). InterviewLabRoom already accepts all
    // three props; pre-fill company + role from the application record
    // so the Interview form can skip a step. Key forces remount on
    // application switch.
    body = (
      <InterviewLabRoom
        key={applicationId}
        initialJobApplicationId={applicationId}
        initialCompany={application.company_name}
        initialRole={application.role_title}
      />
    );
  }

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6 p-6">
      {ApplicationHeader}
      {body}
    </div>
  );
}
