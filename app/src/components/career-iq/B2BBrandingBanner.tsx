/**
 * B2BBrandingBanner — displays org branding for B2B outplacement employees.
 *
 * Shows the org logo (or icon fallback), a custom welcome message, and a list
 * of custom resources (severance docs, benefits contacts, etc.) that the
 * employer has configured.  All resource links open in a new tab.
 *
 * Sprint 51, Story 7-4: White-label branding.
 */

import { GlassCard } from '@/components/GlassCard';
import { ExternalLink, Building2 } from 'lucide-react';
import type { OrgBranding } from '@/hooks/useB2BBranding';

// ─── Props ────────────────────────────────────────────────────────────────────

interface B2BBrandingBannerProps {
  branding: OrgBranding;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function B2BBrandingBanner({ branding }: B2BBrandingBannerProps) {
  return (
    <GlassCard className="p-4">
      {/* Org identity row */}
      <div className="flex items-center gap-3 mb-3">
        {branding.logo_url ? (
          <img
            src={branding.logo_url}
            alt={branding.org_name}
            className="h-8 w-auto object-contain"
          />
        ) : (
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${branding.primary_color}20` }}
          >
            <Building2 size={16} style={{ color: branding.primary_color }} />
          </div>
        )}
        <div className="min-w-0">
          <span className="text-[13px] font-medium text-white/70 block truncate">
            {branding.org_name}
          </span>
          <span className="text-[11px] text-white/30 block">Career Transition Support</span>
        </div>
      </div>

      {/* Custom welcome message */}
      {branding.custom_welcome_message && (
        <p className="text-[13px] text-white/50 leading-relaxed mb-3">
          {branding.custom_welcome_message}
        </p>
      )}

      {/* Custom resources list */}
      {branding.custom_resources.length > 0 && (
        <div className="space-y-2">
          <span className="text-[11px] text-white/30 uppercase tracking-wider">
            Company Resources
          </span>
          {branding.custom_resources.map((resource, i) => (
            <a
              key={i}
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 hover:bg-white/[0.04] hover:border-white/[0.1] transition-all group"
            >
              <div className="min-w-0 flex-1">
                <span className="text-[12px] font-medium text-white/60 group-hover:text-white/80 transition-colors block">
                  {resource.title}
                </span>
                {resource.description && (
                  <span className="text-[11px] text-white/30 block mt-0.5 line-clamp-1">
                    {resource.description}
                  </span>
                )}
              </div>
              <ExternalLink
                size={12}
                className="text-white/20 group-hover:text-white/50 flex-shrink-0 transition-colors"
              />
            </a>
          ))}
        </div>
      )}
    </GlassCard>
  );
}
