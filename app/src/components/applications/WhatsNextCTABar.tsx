/**
 * WhatsNextCTABar — Phase 4 of pursuit timeline.
 *
 * The completion-handoff bar. Reads from the same rule engine the workspace
 * overview reads from (useApplicationTimeline → computeTimelineRules) and
 * surfaces the top 1–3 next actions as buttons. Single source of truth: a
 * change to the rule engine instantly updates both the overview and every
 * completion screen.
 *
 * Renders nothing when applicationId is undefined (some completion screens
 * — legacy session resumes — render outside an application context). On
 * timeline load failure, renders nothing rather than a broken bar.
 *
 * Special case: the "Apply now" rule (N3) routes to the resume tab, where
 * the IAppliedCTA lives. To keep the apply path single-source-of-truth and
 * avoid the user round-tripping back to a different tab to record the event,
 * the bar renders the IAppliedCTA inline for that one rule. Other rules
 * route normally.
 */

import { ArrowRight, ArrowLeft, AlertCircle } from 'lucide-react';
import { GlassButton } from '@/components/GlassButton';
import {
  buildApplicationWorkspaceRoute,
  type ApplicationWorkspaceTool,
} from '@/lib/app-routing';
import { useApplicationTimeline } from '@/hooks/useApplicationTimeline';
import { IAppliedCTA } from '@/components/applications/IAppliedCTA';
import type { NextItem } from '@/lib/timeline/rules';

interface WhatsNextCTABarProps {
  applicationId?: string | null;
  /** Resume session id, threaded into IAppliedCTA when the apply rule fires. */
  resumeSessionId?: string;
  /** Cover letter session id (same purpose as resumeSessionId). */
  coverLetterSessionId?: string;
  /** Maximum number of next-rule buttons to display. Defaults to 3. */
  maxButtons?: number;
  /** Optional navigate handler. Defaults to window.location.assign. */
  onNavigate?: (to: string) => void;
  className?: string;
}

const MAX_BUTTONS_DEFAULT = 3;

function navigateTo(target: ApplicationWorkspaceTool, applicationId: string, onNavigate?: (to: string) => void) {
  const route = buildApplicationWorkspaceRoute(applicationId, target);
  if (onNavigate) onNavigate(route);
  else window.location.assign(route);
}

export function WhatsNextCTABar({
  applicationId,
  resumeSessionId,
  coverLetterSessionId,
  maxButtons = MAX_BUTTONS_DEFAULT,
  onNavigate,
  className,
}: WhatsNextCTABarProps) {
  const { next, loading, error } = useApplicationTimeline({ applicationId });

  // Edge case: no application context. Don't fake one; render nothing.
  if (!applicationId) return null;

  // While the timeline is loading or errored, render nothing — the screen
  // still shows the existing completion controls (export, save, etc.) so the
  // user isn't stuck.
  if (loading || error) return null;

  const top = next.slice(0, maxButtons);

  // Empty rule set: render the back-to-overview fallback so the user always
  // has somewhere to land after wrapping up the current tool.
  if (top.length === 0) {
    return (
      <div className={className} data-testid="whats-next-cta-bar">
        <GlassButton
          variant="ghost"
          size="sm"
          onClick={() => navigateTo('overview', applicationId, onNavigate)}
          data-testid="whats-next-back-to-overview"
        >
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Back to overview
        </GlassButton>
      </div>
    );
  }

  return (
    <div
      className={className}
      data-testid="whats-next-cta-bar"
    >
      <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)] mb-2">
        What&apos;s next
      </div>
      <div className="flex flex-wrap items-start gap-2">
        {top.map((item, idx) => (
          <NextButton
            key={item.id}
            item={item}
            isPrimary={idx === 0}
            applicationId={applicationId}
            resumeSessionId={resumeSessionId}
            coverLetterSessionId={coverLetterSessionId}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </div>
  );
}

interface NextButtonProps {
  item: NextItem;
  isPrimary: boolean;
  applicationId: string;
  resumeSessionId?: string;
  coverLetterSessionId?: string;
  onNavigate?: (to: string) => void;
}

function NextButton({
  item,
  isPrimary,
  applicationId,
  resumeSessionId,
  coverLetterSessionId,
  onNavigate,
}: NextButtonProps) {
  // Special-case N3: surface the IAppliedCTA inline so the apply-event path
  // stays a single source of truth (the same component that fires the event
  // from the V3 / cover-letter completion screens). The rule's target=resume
  // would otherwise route the user to a different tab just to find the same
  // CTA.
  if (item.id === 'N3') {
    return (
      <div data-testid="whats-next-button-N3" data-rule-id={item.id}>
        <IAppliedCTA
          applicationId={applicationId}
          resumeSessionId={resumeSessionId}
          coverLetterSessionId={coverLetterSessionId}
        />
      </div>
    );
  }

  const isUrgent = item.tier === 'A';

  return (
    <GlassButton
      variant={isPrimary ? 'primary' : 'ghost'}
      size="sm"
      onClick={() => navigateTo(item.target, applicationId, onNavigate)}
      className="text-[13px]"
      data-testid={`whats-next-button-${item.id}`}
      data-rule-id={item.id}
      data-urgent={isUrgent ? 'true' : 'false'}
    >
      {isUrgent && (
        <AlertCircle
          className="mr-1.5 h-3.5 w-3.5 text-amber-300"
          aria-hidden="true"
          data-testid={`whats-next-urgency-${item.id}`}
        />
      )}
      <span className="truncate max-w-[280px]">{item.title}</span>
      <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
    </GlassButton>
  );
}
