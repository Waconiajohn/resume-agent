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

import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import {
  APPLICATION_WORKSPACE_TOOLS,
  RESUME_BUILDER_SESSION_ROUTE,
  type ApplicationWorkspaceTool,
} from '@/lib/app-routing';
import { API_BASE } from '@/lib/api';

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

  // Phase 1.2 stub: the per-tool render surface lands in Phase 1.3.
  // For now, render a placeholder that proves the route works end-to-end
  // (application loaded, tool segment validated, key params exposed).
  // Phase 1.3 replaces this block with dispatched CoverLetterScreen /
  // ThankYouNoteScreen / etc.
  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6 p-6">
      <GlassCard className="p-6">
        <div className="text-[13px] font-medium uppercase tracking-widest text-[var(--link)]">
          Application Workspace (Phase 1.2 stub)
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--text-strong)]">
          {application.company_name}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-soft)]">
          {application.role_title} · Stage: {application.stage}
        </p>
        <div className="mt-4 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-1)] p-4 text-sm">
          <div className="text-[var(--text-soft)]">Tool: <span className="font-semibold text-[var(--text-strong)]">{tool}</span></div>
          <div className="text-[var(--text-soft)]">applicationId: <span className="font-mono text-xs text-[var(--text-strong)]">{applicationId}</span></div>
          <div className="mt-3 text-xs text-[var(--text-soft)]">
            Phase 1.3 replaces this stub with the real tool screen wired to receive the applicationId.
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
