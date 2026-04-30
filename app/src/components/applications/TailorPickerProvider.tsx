/**
 * TailorPickerProvider — Phase 2 of pursuit timeline.
 *
 * Single global mount of TailorForApplicationPicker. The eight tailor entry
 * points (sidebar, dashboard, workshop landing, job command center, NI
 * scanner, JD-paste flows) call useTailorPicker().openPicker(context)
 * instead of navigating directly to /resume-builder/session.
 *
 * The picker resolves to one of four outcomes — the first three navigate
 * to /workspace/application/:id/resume; the fourth closes the picker:
 *   - existing_app: user picked an app from the list
 *   - new_app_jd_url: JD URL fetched + new app row created
 *   - new_app_jd_text: JD text submitted + new app row created
 *   - cancelled: user closed without choosing
 *
 * Tracking: resume_builder_session_started fires on resolution with
 * { source, resolution } — gives product analytics visibility into
 * picker outcomes (existing-app re-use vs. new-app creation).
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useJobApplications, type JobApplication } from '@/hooks/useJobApplications';
import { trackProductEvent } from '@/lib/product-telemetry';
import { buildApplicationWorkspaceRoute } from '@/lib/app-routing';
import { TailorForApplicationPicker } from './TailorForApplicationPicker';

export interface TailorPickerContext {
  /** Where the picker was opened from. Required for product analytics. */
  source: string;
  /** Optional JD URL prefill (Job Command Center, NI scanner). */
  jobUrl?: string;
  /** Optional company prefill. */
  companyName?: string;
  /** Optional role title prefill. */
  roleTitle?: string;
  /** Optional job-board summary/snippet to use when the job URL cannot be fetched. */
  jobDescription?: string;
}

interface TailorPickerApi {
  openPicker: (context: TailorPickerContext) => void;
}

const TailorPickerCtx = createContext<TailorPickerApi | null>(null);

export function useTailorPicker(): TailorPickerApi {
  const value = useContext(TailorPickerCtx);
  if (!value) {
    // Soft fallback when used outside the provider — mostly for tests that
    // mount a single component in isolation. The hook still works as a
    // no-op so tests don't have to wrap every render in a provider.
    return {
      openPicker: () => {
        if (typeof window !== 'undefined') {
          // eslint-disable-next-line no-console
          console.warn('[useTailorPicker] called outside TailorPickerProvider — picker not mounted');
        }
      },
    };
  }
  return value;
}

interface TailorPickerProviderProps {
  children: ReactNode;
}

export function TailorPickerProvider({ children }: TailorPickerProviderProps) {
  const [open, setOpen] = useState(false);
  const [pickerContext, setPickerContext] = useState<TailorPickerContext | null>(null);
  const navigate = useNavigate();
  const auth = useAuth();
  const accessToken = auth.session?.access_token ?? null;
  const {
    applications,
    loading,
    fetchApplications,
    createApplication,
    getLastError,
  } = useJobApplications({ archived: 'active' });

  const openPicker = useCallback((context: TailorPickerContext) => {
    setPickerContext(context);
    setOpen(true);
    // Refresh the application list so the picker reflects the latest state
    // (a user may have just created an app on another tab or surface).
    void fetchApplications();
  }, [fetchApplications]);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const fireResolution = useCallback(
    (
      resolution: 'existing_app' | 'new_app_jd_url' | 'new_app_jd_text' | 'cancelled',
      source: string,
    ) => {
      trackProductEvent('resume_builder_session_started', {
        source,
        resolution,
      });
    },
    [],
  );

  const handleCancel = useCallback(() => {
    if (pickerContext) {
      fireResolution('cancelled', pickerContext.source);
    }
    close();
  }, [pickerContext, fireResolution, close]);

  const handlePickExisting = useCallback(
    (app: JobApplication) => {
      if (pickerContext) {
        fireResolution('existing_app', pickerContext.source);
      }
      close();
      navigate(buildApplicationWorkspaceRoute(app.id, 'resume'));
    },
    [pickerContext, fireResolution, close, navigate],
  );

  const handleCreateAndOpen = useCallback(
    async (input: {
      roleTitle: string;
      companyName: string;
      jdText: string;
      url?: string;
      origin: 'jd_url' | 'jd_text';
    }): Promise<{ ok: true; applicationId: string } | { ok: false; error: string }> => {
      if (!accessToken) {
        return { ok: false, error: 'Not authenticated' };
      }
      const created = await createApplication({
        role_title: input.roleTitle,
        company_name: input.companyName,
        jd_text: input.jdText,
        url: input.url,
        stage: 'researching',
        source: 'tailor_picker',
      });
      if (!created) {
        return { ok: false, error: getLastError() ?? 'Failed to create application' };
      }

      if (pickerContext) {
        fireResolution(
          input.origin === 'jd_url' ? 'new_app_jd_url' : 'new_app_jd_text',
          pickerContext.source,
        );
      }
      close();
      navigate(buildApplicationWorkspaceRoute(created.id, 'resume'));
      return { ok: true, applicationId: created.id };
    },
    [accessToken, createApplication, getLastError, pickerContext, fireResolution, close, navigate],
  );

  const api = useMemo<TailorPickerApi>(() => ({ openPicker }), [openPicker]);

  return (
    <TailorPickerCtx.Provider value={api}>
      {children}
      {open && pickerContext && (
        <TailorForApplicationPicker
          context={pickerContext}
          accessToken={accessToken ?? null}
          applications={applications}
          loading={loading}
          onCancel={handleCancel}
          onPickExisting={handlePickExisting}
          onCreateAndOpen={handleCreateAndOpen}
        />
      )}
    </TailorPickerCtx.Provider>
  );
}
