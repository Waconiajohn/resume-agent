import { useEffect, useRef, useState } from 'react';
import { ChevronDown, CreditCard, FileText, HelpCircle, LayoutDashboard, Linkedin, LogOut, Menu, Mic, Palette, Search, Settings2, User, X } from 'lucide-react';
import { PipelineProgressBar } from './PipelineProgressBar';
import { AccessibilitySettings } from './AccessibilitySettings';
import { useTheme } from '@/hooks/useTheme';

interface HeaderProps {
  email?: string;
  displayName?: string;
  onSignOut: () => void;
  onUpdateProfile?: (data: { firstName: string; lastName: string }) => Promise<{ error: unknown }>;
  pipelineStage?: string | null;
  isProcessing?: boolean;
  sessionComplete?: boolean;
  onNavigate?: (view: string) => void;
  /** Called when the user clicks the Help button to replay the onboarding tour */
  onReplayTour?: () => void;
}

export function Header({ email, displayName, onSignOut, onUpdateProfile, pipelineStage, isProcessing, sessionComplete, onNavigate, onReplayTour }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [a11yOpen, setA11yOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameFirst, setNameFirst] = useState('');
  const [nameLast, setNameLast] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { theme, toggle: toggleTheme } = useTheme();

  const startEditName = () => {
    const parts = (displayName ?? '').split(' ');
    setNameFirst(parts[0] || '');
    setNameLast(parts.slice(1).join(' ') || '');
    setEditingName(true);
  };

  const saveNameEdit = async () => {
    if (!onUpdateProfile || !nameFirst.trim()) return;
    setNameSaving(true);
    await onUpdateProfile({ firstName: nameFirst.trim(), lastName: nameLast.trim() });
    setNameSaving(false);
    setEditingName(false);
  };

  // Close menu on Escape key
  useEffect(() => {
    if (!menuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (menuPanelRef.current && !menuPanelRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [menuOpen]);

  // Close user dropdown on Escape key
  useEffect(() => {
    if (!userMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setUserMenuOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [userMenuOpen]);

  // Close user dropdown on outside click
  useEffect(() => {
    if (!userMenuOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [userMenuOpen]);

  const handleNavClick = (view: string) => {
    setMenuOpen(false);
    onNavigate?.(view);
  };

  const handleSignOut = () => {
    setMenuOpen(false);
    onSignOut();
  };

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line-soft)] bg-[var(--header-bg)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-6 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <button
            type="button"
            onClick={() => onNavigate?.('workspace')}
            className="flex items-center text-left"
            aria-label="Go to CareerIQ home"
          >
            <span className="text-[20px] font-normal tracking-tight text-[var(--text-strong)]">
              Career<span className="font-bold text-[var(--accent)]">IQ</span>
            </span>
          </button>

        </div>

        <div className="flex items-center gap-2">
          {email && (
            <div className="relative hidden lg:flex" ref={userMenuRef}>
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={nameFirst}
                    onChange={(e) => setNameFirst(e.target.value)}
                    placeholder="First"
                    className="w-24 rounded-[10px] border border-[var(--line-soft)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-strong)] outline-none focus:border-[var(--line-strong)]"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') void saveNameEdit(); if (e.key === 'Escape') setEditingName(false); }}
                  />
                  <input
                    type="text"
                    value={nameLast}
                    onChange={(e) => setNameLast(e.target.value)}
                    placeholder="Last"
                    className="w-24 rounded-[10px] border border-[var(--line-soft)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-strong)] outline-none focus:border-[var(--line-strong)]"
                    onKeyDown={(e) => { if (e.key === 'Enter') void saveNameEdit(); if (e.key === 'Escape') setEditingName(false); }}
                  />
                  <button onClick={() => void saveNameEdit()} disabled={nameSaving || !nameFirst.trim()} className="rounded-[10px] px-3 py-2 text-xs font-medium uppercase tracking-[0.12em] text-[var(--text-strong)] transition-colors hover:bg-[var(--accent-muted)] disabled:opacity-50">
                    {nameSaving ? '...' : 'Save'}
                  </button>
                  <button onClick={() => setEditingName(false)} className="rounded-[10px] px-2 py-2 text-xs uppercase tracking-[0.12em] text-[var(--text-soft)] transition-colors hover:bg-[var(--accent-muted)]">
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((prev) => !prev)}
                  aria-haspopup="true"
                  aria-expanded={userMenuOpen}
                  className="flex items-center gap-1.5 rounded-[10px] px-2 py-1.5 transition-colors hover:bg-[var(--surface-2)]"
                >
                  <span className="text-[13px] font-medium text-[var(--text-strong)]">
                    {displayName || email}
                  </span>
                  <ChevronDown className={`h-3.5 w-3.5 text-[var(--text-muted)] transition-transform duration-150 ${userMenuOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
              )}

              {userMenuOpen && !editingName && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-2 w-52 overflow-hidden rounded-[14px] border border-[var(--line-soft)] bg-[var(--surface-raised)] shadow-[var(--shadow-mid)]"
                >
                  <div className="border-b border-[var(--line-soft)] px-4 py-3">
                    <div className="eyebrow-label">Signed in as</div>
                    <div className="mt-0.5 truncate text-[12px] text-[var(--text-soft)]">{email}</div>
                    {onUpdateProfile && (
                      <button
                        onClick={() => { setUserMenuOpen(false); startEditName(); }}
                        className="mt-1 text-[11px] text-[var(--accent)] transition-colors hover:underline"
                      >
                        Edit name
                      </button>
                    )}
                  </div>
                  <div className="py-1">
                    <button
                      role="menuitem"
                      onClick={() => { toggleTheme(); setUserMenuOpen(false); }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] text-[var(--text-strong)] transition-colors hover:bg-[var(--surface-2)]"
                    >
                      <Palette className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
                      {theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => { setUserMenuOpen(false); onNavigate?.('billing'); }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] text-[var(--text-strong)] transition-colors hover:bg-[var(--surface-2)]"
                    >
                      <CreditCard className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
                      Billing &amp; plan
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => { setUserMenuOpen(false); onSignOut(); }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] text-[var(--text-strong)] transition-colors hover:bg-[var(--surface-2)]"
                    >
                      <LogOut className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Help / tour replay button */}
          {onReplayTour && (
            <button
              type="button"
              onClick={onReplayTour}
              aria-label="Replay onboarding tour"
              title="Take a guided tour of the workspace"
              className="flex items-center gap-1.5 rounded-[12px] border border-[var(--line-soft)] bg-[var(--surface-2)] px-3 py-2.5 text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text-strong)]"
            >
              <HelpCircle className="h-5 w-5" aria-hidden="true" />
              <span className="text-[13px] font-medium hidden sm:inline">Help</span>
            </button>
          )}

          {/* Accessibility settings */}
          <button
            type="button"
            onClick={() => setA11yOpen(true)}
            aria-label="Accessibility settings"
            title="Accessibility settings"
            aria-expanded={a11yOpen}
            aria-controls="accessibility-settings-panel"
            className="rounded-[12px] border border-[var(--line-soft)] bg-[var(--surface-2)] p-2.5 text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text-strong)]"
          >
            <Settings2 className="h-5 w-5" aria-hidden="true" />
          </button>

          <button
            className="rounded-[12px] border border-[var(--line-soft)] bg-[var(--surface-2)] p-2.5 text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text-strong)] lg:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <PipelineProgressBar
        pipelineStage={pipelineStage ?? null}
        isProcessing={isProcessing ?? false}
        sessionComplete={sessionComplete ?? false}
      />

      {/* Accessibility settings panel */}
      <div id="accessibility-settings-panel">
        <AccessibilitySettings isOpen={a11yOpen} onClose={() => setA11yOpen(false)} />
      </div>

      {/* Mobile menu overlay */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" aria-hidden="false">
          <div className="absolute inset-0 bg-[var(--mobile-overlay-bg)] backdrop-blur-sm" aria-hidden="true" />

          <div
            ref={menuPanelRef}
            role="dialog"
            aria-label="Navigation menu"
            className="absolute right-0 top-0 flex h-full w-80 flex-col border-l border-[var(--line-soft)] bg-[var(--mobile-menu-bg)] shadow-[var(--shadow-mid)]"
            style={{ transform: 'translateX(0)', transition: 'transform 0.2s ease-out' }}
          >
            <div className="flex h-16 items-center justify-between border-b border-[var(--line-soft)] px-5">
              <span className="text-[18px] font-normal tracking-tight text-[var(--text-strong)]">
                Career<span className="font-bold text-[var(--accent)]">IQ</span>
              </span>
              <button
                onClick={() => setMenuOpen(false)}
                className="rounded-[12px] border border-[var(--line-soft)] bg-[var(--surface-2)] p-2.5 text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text-strong)]"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <nav className="flex flex-1 flex-col gap-2 overflow-y-auto px-5 py-5">
              {[
                { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
                { id: 'career-profile', label: 'Your Profile', icon: User },
                { id: 'resume', label: 'Resume Builder', icon: FileText },
                { id: 'linkedin', label: 'LinkedIn', icon: Linkedin },
                { id: 'jobs', label: 'Job Search', icon: Search },
                { id: 'interview', label: 'Interview Prep', icon: Mic },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleNavClick(id)}
                  className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[13px] font-medium text-[var(--text-strong)] transition-colors hover:bg-[var(--surface-2)]"
                >
                  <Icon className="h-4 w-4 flex-shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </nav>

            {email && (
              <div className="border-t border-[var(--line-soft)] px-5 py-5">
                <div className="eyebrow-label">Account</div>
                <div className="mt-1 truncate text-sm text-[var(--text-strong)]">{email}</div>
                <div className="mt-4 flex flex-col gap-1">
                  <button
                    onClick={() => handleNavClick('billing')}
                    aria-label="Billing"
                    className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[13px] text-[var(--text-strong)] transition-colors hover:bg-[var(--surface-2)]"
                  >
                    <CreditCard className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
                    Billing &amp; plan
                  </button>
                  <button
                    onClick={handleSignOut}
                    aria-label="Sign out"
                    className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[13px] text-[var(--text-strong)] transition-colors hover:bg-[var(--surface-2)]"
                  >
                    <LogOut className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
