/**
 * useB2BBranding — detect if the current user is a B2B employee, load org
 * branding, and apply CSS custom properties to the document root.
 *
 * Sprint 51, Story 7-4: White-label branding.
 * Mounted against GET /api/b2b/user/branding (b2b-admin routes).
 */

import { useState, useEffect } from 'react';
import { API_BASE } from '@/lib/api';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrgResource {
  title: string;
  url: string;
  description: string;
}

export interface OrgBranding {
  org_id: string;
  org_name: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  custom_welcome_message: string | null;
  custom_resources: OrgResource[];
}

export interface UseB2BBrandingReturn {
  branding: OrgBranding | null;
  isB2BUser: boolean;
  loading: boolean;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useB2BBranding(): UseB2BBrandingReturn {
  const [branding, setBranding] = useState<OrgBranding | null>(null);
  const [isB2BUser, setIsB2BUser] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadBranding() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const token = session?.access_token ?? null;
        if (!token) {
          if (!cancelled) setLoading(false);
          return;
        }

        const res = await fetch(`${API_BASE}/b2b/user/branding`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = (await res.json()) as { branding: OrgBranding | null };
          if (!cancelled && data.branding) {
            setBranding(data.branding);
            setIsB2BUser(true);

            // Apply CSS custom properties for white-label theming
            const root = document.documentElement;
            root.style.setProperty('--b2b-primary', data.branding.primary_color);
            root.style.setProperty('--b2b-secondary', data.branding.secondary_color);
          }
        }
      } catch {
        // Not a B2B user or endpoint not available — that is fine
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadBranding();

    return () => {
      cancelled = true;
      // Clean up CSS custom properties on unmount
      const root = document.documentElement;
      root.style.removeProperty('--b2b-primary');
      root.style.removeProperty('--b2b-secondary');
    };
  }, []);

  return { branding, isB2BUser, loading };
}
