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

import { useState } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { GlassInput } from '@/components/GlassInput';
import { ActivityLogCard } from '@/components/settings/ActivityLogCard';
import { AlertTriangle, CreditCard, ExternalLink, LifeBuoy, Loader2, LogOut, Mail, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { API_BASE } from '@/lib/api';
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

  // Account deletion — type-to-confirm gate. Hard-delete; cascades through
  // every public-schema FK to auth.users. Cancels the user's Stripe
  // subscription first so they don't keep getting billed.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteEnabled = deleteConfirm.trim().toUpperCase() === 'DELETE';

  const handleDeleteAccount = async () => {
    if (!deleteEnabled || deleteLoading) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setDeleteError('Not authenticated. Please sign in again.');
        setDeleteLoading(false);
        return;
      }
      const res = await fetch(`${API_BASE}/account`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setDeleteError(body.error ?? `Failed to delete account (${res.status})`);
        setDeleteLoading(false);
        return;
      }
      // Sign out client-side and redirect to the sales page. The auth.users
      // row is already deleted server-side; we're just clearing the local
      // cached session.
      await supabase.auth.signOut().catch(() => undefined);
      onNavigate('/sales');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete account');
      setDeleteLoading(false);
    }
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

      {/* Activity log — Sprint B (auth hardening) */}
      <ActivityLogCard />

      {/* Danger zone — account deletion */}
      <GlassCard className="p-6 border-[var(--badge-red-text)]/20">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 text-[var(--badge-red-text)]" />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-[var(--text-strong)]">Delete account</h2>
            <p className="mt-1 text-xs text-[var(--text-soft)]">
              Permanently removes your account and every artifact tied to it: your Career Vault,
              all applications and resumes, cover letters, interview prep, networking history, and
              any active subscription. This cannot be undone.
            </p>
            {!deleteOpen && (
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="mt-3 text-xs text-[var(--badge-red-text)] hover:underline"
              >
                I understand — start deletion
              </button>
            )}
            {deleteOpen && (
              <div className="mt-3 space-y-3" data-testid="delete-account-confirm-panel">
                <p className="text-xs text-[var(--text-strong)]">
                  Type <span className="font-mono font-semibold">DELETE</span> in the box below to
                  confirm. Your subscription will be cancelled before the account is removed.
                </p>
                <GlassInput
                  type="text"
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder="Type DELETE to confirm"
                  autoComplete="off"
                  data-testid="delete-account-confirm-input"
                />
                {deleteError && (
                  <p className="text-xs text-[var(--badge-red-text)]" role="alert">{deleteError}</p>
                )}
                <div className="flex gap-2">
                  <GlassButton
                    variant="ghost"
                    onClick={() => {
                      setDeleteOpen(false);
                      setDeleteConfirm('');
                      setDeleteError(null);
                    }}
                    disabled={deleteLoading}
                  >
                    Cancel
                  </GlassButton>
                  <button
                    type="button"
                    onClick={() => void handleDeleteAccount()}
                    disabled={!deleteEnabled || deleteLoading}
                    data-testid="delete-account-confirm-button"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--badge-red-text)]/40 bg-[var(--badge-red-text)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--badge-red-text)] disabled:opacity-40"
                  >
                    {deleteLoading ? (
                      <>
                        <Loader2 size={13} className="motion-safe:animate-spin" />
                        Deleting…
                      </>
                    ) : (
                      'Delete my account'
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
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
