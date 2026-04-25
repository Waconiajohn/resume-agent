/**
 * StandalonePathBanners — Phase 2 of pursuit timeline.
 *
 * Three small banners that appear above V3PipelineScreen when it renders
 * at the standalone /resume-builder/session path:
 *
 *  1. StaleApplicationBanner — for sessions whose original application
 *     was deleted. Tells the user their work isn't lost; offers a path
 *     to relink via Session History.
 *  2. OrphanSessionBanner — for sessions that never had an application
 *     attached. Soft prompt to link, dismissible per session via
 *     localStorage.
 *  3. DeprecationBanner — for any other landing on the standalone path.
 *     "This URL is going away — use the application workspace next time."
 *     Opens the picker on click.
 *
 * Three separate components rather than a switch — clearer call sites.
 */

import { useCallback, useState } from 'react';
import { AlertTriangle, ArrowRight, X, Info } from 'lucide-react';
import { GlassButton } from '@/components/GlassButton';
import { useTailorPicker } from './TailorPickerProvider';

const DISMISS_KEY_PREFIX = 'resume-agent:standalone-banner-dismissed:';

function isDismissed(sessionId: string): boolean {
  try {
    return window.localStorage.getItem(`${DISMISS_KEY_PREFIX}${sessionId}`) === '1';
  } catch {
    return false;
  }
}

function dismiss(sessionId: string): void {
  try {
    window.localStorage.setItem(`${DISMISS_KEY_PREFIX}${sessionId}`, '1');
  } catch {
    /* ignore quota errors */
  }
}

// ─── StaleApplicationBanner ──────────────────────────────────────────

export function StaleApplicationBanner({ staleApplicationId }: { staleApplicationId: string }) {
  return (
    <div className="rounded-xl border border-[var(--badge-amber-text)]/30 bg-[var(--badge-amber-text)]/[0.06] px-4 py-3 mb-4">
      <div className="flex items-start gap-3">
        <AlertTriangle size={16} className="text-[var(--badge-amber-text)] flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-[var(--text-strong)]">
            This session&rsquo;s application was removed
          </div>
          <p className="text-[12px] text-[var(--text-soft)] mt-1 leading-relaxed">
            Your work isn&rsquo;t lost — finish what you&rsquo;re doing here, then relink it to a new
            application from Session History when you&rsquo;re ready.
          </p>
          <div className="text-[11px] text-[var(--text-muted)] mt-1 font-mono">
            (former app id: {staleApplicationId.slice(0, 8)}…)
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── OrphanSessionBanner ─────────────────────────────────────────────

interface OrphanSessionBannerProps {
  sessionId: string;
  /** Optional source label passed to the picker when the user clicks "Link". */
  source?: string;
}

export function OrphanSessionBanner({ sessionId, source = 'orphan_resume_session' }: OrphanSessionBannerProps) {
  const { openPicker } = useTailorPicker();
  const [hidden, setHidden] = useState(() => isDismissed(sessionId));

  const handleDismiss = useCallback(() => {
    dismiss(sessionId);
    setHidden(true);
  }, [sessionId]);

  const handleLink = useCallback(() => {
    openPicker({ source });
  }, [openPicker, source]);

  if (hidden) return null;

  return (
    <div className="rounded-xl border border-[var(--link)]/25 bg-[var(--link)]/[0.05] px-4 py-3 mb-4">
      <div className="flex items-start gap-3">
        <Info size={16} className="text-[var(--link)] flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-[var(--text-strong)]">
            This resume isn&rsquo;t linked to an application yet
          </div>
          <p className="text-[12px] text-[var(--text-soft)] mt-1 leading-relaxed">
            The platform tracks pursuits — applications, follow-ups, interviews — through application
            records. Link this resume to a real or new application so it doesn&rsquo;t get lost.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <GlassButton variant="ghost" size="sm" onClick={handleLink} className="text-[12px]">
              Link to an application
              <ArrowRight size={11} className="ml-1.5" />
            </GlassButton>
            <button
              type="button"
              onClick={handleDismiss}
              className="text-[12px] text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors"
            >
              Not now
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="p-1 rounded-md text-[var(--text-soft)] hover:bg-[var(--accent-muted)] hover:text-[var(--text-strong)]"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── DeprecationBanner ───────────────────────────────────────────────
//
// Appears when V3PipelineScreen renders at the standalone path WITHOUT a
// session id (i.e., a fresh start landed here via legacy bookmark or
// manual URL). Tells the user the URL is going away. Opens picker on
// click. Dismissible per browser via a sticky localStorage key.

const DEPRECATION_DISMISS_KEY = 'resume-agent:standalone-deprecation-dismissed';

function isDeprecationDismissed(): boolean {
  try {
    return window.localStorage.getItem(DEPRECATION_DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function dismissDeprecation(): void {
  try {
    window.localStorage.setItem(DEPRECATION_DISMISS_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function StandaloneDeprecationBanner() {
  const { openPicker } = useTailorPicker();
  const [hidden, setHidden] = useState(() => isDeprecationDismissed());

  const handleDismiss = useCallback(() => {
    dismissDeprecation();
    setHidden(true);
  }, []);

  const handleMigrate = useCallback(() => {
    openPicker({ source: 'standalone_deprecation_banner' });
  }, [openPicker]);

  if (hidden) return null;

  return (
    <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 mb-4">
      <div className="flex items-start gap-3">
        <Info size={16} className="text-[var(--text-muted)] flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-[var(--text-strong)]">
            This URL is going away
          </div>
          <p className="text-[12px] text-[var(--text-soft)] mt-1 leading-relaxed">
            Tailoring a resume should happen inside an application. Open the picker to point this run
            at an existing application or create a new one.
          </p>
          <div className="mt-2">
            <GlassButton variant="ghost" size="sm" onClick={handleMigrate} className="text-[12px]">
              Pick an application
              <ArrowRight size={11} className="ml-1.5" />
            </GlassButton>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="p-1 rounded-md text-[var(--text-soft)] hover:bg-[var(--accent-muted)] hover:text-[var(--text-strong)]"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
