/**
 * SettingsPage — minimal account settings surface.
 *
 * Sprint E5. The audit noted there was no Settings / Help / Support page:
 * the user menu had "Edit name" and "Billing & plan" but nowhere to go for
 * support, FAQ, or to see the basics of their account. This route covers
 * that gap without trying to be a full profile editor — editable name is
 * already handled via the user menu, password resets go through Supabase's
 * forgot-password flow, and email changes are deferred (that's an own
 * sprint since it requires reverification).
 */

import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { CreditCard, ExternalLink, LifeBuoy, LogOut, Mail, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { User as SupabaseUser } from '@supabase/supabase-js';

interface SettingsPageProps {
  user: SupabaseUser | null;
  onNavigate: (route: string) => void;
  onSignOut?: () => Promise<void> | void;
}

export function SettingsPage({ user, onNavigate, onSignOut }: SettingsPageProps) {
  const displayName = (() => {
    const meta = user?.user_metadata ?? {};
    const first = typeof meta.firstName === 'string' ? meta.firstName.trim() : '';
    const last = typeof meta.lastName === 'string' ? meta.lastName.trim() : '';
    const full = `${first} ${last}`.trim();
    if (full) return full;
    if (typeof meta.full_name === 'string' && meta.full_name.trim()) return meta.full_name.trim();
    if (typeof meta.name === 'string' && meta.name.trim()) return meta.name.trim();
    return user?.email ?? 'User';
  })();

  const handleSignOut = async () => {
    if (onSignOut) {
      await onSignOut();
      return;
    }
    await supabase.auth.signOut();
    onNavigate('/sales');
  };

  return (
    <div className="mx-auto flex h-full max-w-[960px] flex-col gap-6 overflow-y-auto p-6">
      <div>
        <div className="text-[11px] font-medium uppercase tracking-widest text-[var(--link)]">
          Account
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-[var(--text-strong)]">Settings</h1>
        <p className="mt-1 text-sm text-[var(--text-soft)]">
          Your account, plan, and support links. Name edits and password resets happen through the
          menus below.
        </p>
      </div>

      {/* Account card */}
      <GlassCard className="p-5">
        <div className="flex items-center gap-3 pb-3">
          <User size={18} className="text-[var(--link)]" />
          <h2 className="text-[15px] font-semibold text-[var(--text-strong)]">Your account</h2>
        </div>
        <dl className="grid gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-soft)]">Name</dt>
            <dd className="mt-1 text-[var(--text-strong)]">{displayName}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-soft)]">Email</dt>
            <dd className="mt-1 text-[var(--text-strong)]">{user?.email ?? '—'}</dd>
          </div>
        </dl>
        <p className="mt-4 text-[12px] text-[var(--text-muted)]">
          Edit your name from the user menu in the top right. Email changes require reverification
          and are on the roadmap.
        </p>
      </GlassCard>

      {/* Billing card */}
      <GlassCard className="p-5">
        <div className="flex items-center gap-3 pb-3">
          <CreditCard size={18} className="text-[var(--link)]" />
          <h2 className="text-[15px] font-semibold text-[var(--text-strong)]">Billing &amp; plan</h2>
        </div>
        <p className="text-sm text-[var(--text-soft)]">
          Current plan, usage, and invoices live in the billing dashboard.
        </p>
        <div className="mt-4">
          <GlassButton onClick={() => onNavigate('/billing')}>
            Open billing dashboard
          </GlassButton>
        </div>
      </GlassCard>

      {/* Help / support card */}
      <GlassCard className="p-5">
        <div className="flex items-center gap-3 pb-3">
          <LifeBuoy size={18} className="text-[var(--link)]" />
          <h2 className="text-[15px] font-semibold text-[var(--text-strong)]">Help &amp; support</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <a
            href="/contact"
            className="group flex items-center justify-between rounded-xl border border-[var(--line-soft)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--text-strong)] hover:border-[var(--link)]/40"
          >
            <span className="flex items-center gap-2">
              <Mail size={14} />
              Contact support
            </span>
            <ExternalLink size={13} className="text-[var(--text-soft)] group-hover:text-[var(--text-strong)]" />
          </a>
          <a
            href="/sales#methodology"
            className="group flex items-center justify-between rounded-xl border border-[var(--line-soft)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--text-strong)] hover:border-[var(--link)]/40"
          >
            <span>How CareerIQ works</span>
            <ExternalLink size={13} className="text-[var(--text-soft)] group-hover:text-[var(--text-strong)]" />
          </a>
          <a
            href="/terms"
            className="group flex items-center justify-between rounded-xl border border-[var(--line-soft)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--text-strong)] hover:border-[var(--link)]/40"
          >
            <span>Terms of Service</span>
            <ExternalLink size={13} className="text-[var(--text-soft)] group-hover:text-[var(--text-strong)]" />
          </a>
          <a
            href="/privacy"
            className="group flex items-center justify-between rounded-xl border border-[var(--line-soft)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--text-strong)] hover:border-[var(--link)]/40"
          >
            <span>Privacy Policy</span>
            <ExternalLink size={13} className="text-[var(--text-soft)] group-hover:text-[var(--text-strong)]" />
          </a>
        </div>
      </GlassCard>

      {/* Sign out */}
      <div className="flex justify-end pt-2">
        <GlassButton variant="ghost" onClick={() => void handleSignOut()}>
          <LogOut size={14} className="mr-1.5" />
          Sign out
        </GlassButton>
      </div>
    </div>
  );
}
