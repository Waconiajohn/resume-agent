import { useEffect, useRef, useState } from 'react';
import { LogOut, Menu, Sparkles, X } from 'lucide-react';
import { GlassButton } from './GlassButton';
import { PipelineProgressBar } from './PipelineProgressBar';

interface HeaderProps {
  email?: string;
  onSignOut: () => void;
  pipelineStage?: string | null;
  isProcessing?: boolean;
  sessionComplete?: boolean;
  onNavigate?: (view: string) => void;
}

export function Header({ email, onSignOut, pipelineStage, isProcessing, sessionComplete, onNavigate }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuPanelRef = useRef<HTMLDivElement>(null);

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

  const handleNavClick = (view: string) => {
    setMenuOpen(false);
    onNavigate?.(view);
  };

  const handleSignOut = () => {
    setMenuOpen(false);
    onSignOut();
  };

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.1] bg-[linear-gradient(180deg,rgba(15,20,30,0.78),rgba(11,16,24,0.68))] backdrop-blur-2xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#aac2ff]" />
          <span className="text-sm font-semibold tracking-[0.01em] text-white/90">Resume Agent</span>
        </div>

        {/* Desktop nav — hidden below lg */}
        <nav className="hidden lg:flex items-center gap-1">
          {email && (
            <button
              onClick={() => onNavigate?.('tools')}
              className="rounded-lg px-2.5 py-1.5 text-xs text-white/55 hover:bg-white/5 hover:text-white/80 transition-colors"
            >
              Tools
            </button>
          )}
          {email && (
            <button
              onClick={() => onNavigate?.('/tools/job-applier')}
              className="rounded-lg px-2.5 py-1.5 text-xs text-white/55 hover:bg-white/5 hover:text-white/80 transition-colors"
            >
              Job Applier
            </button>
          )}
          {email && (
            <button
              onClick={() => onNavigate?.('career-iq')}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#98b3ff]/80 hover:bg-[#98b3ff]/10 hover:text-[#98b3ff] transition-colors"
            >
              CareerIQ
            </button>
          )}
          {email && (
            <button
              onClick={() => onNavigate?.('dashboard')}
              className="rounded-lg px-2.5 py-1.5 text-xs text-white/55 hover:bg-white/5 hover:text-white/80 transition-colors"
            >
              Dashboard
            </button>
          )}
          <button
            onClick={() => onNavigate?.('pricing')}
            className="rounded-lg px-2.5 py-1.5 text-xs text-white/55 hover:bg-white/5 hover:text-white/80 transition-colors"
          >
            Pricing
          </button>
          {email && (
            <button
              onClick={() => onNavigate?.('billing')}
              className="rounded-lg px-2.5 py-1.5 text-xs text-white/55 hover:bg-white/5 hover:text-white/80 transition-colors"
            >
              Billing
            </button>
          )}
          {email && (
            <button
              onClick={() => onNavigate?.('affiliate')}
              className="rounded-lg px-2.5 py-1.5 text-xs text-white/55 hover:bg-white/5 hover:text-white/80 transition-colors"
            >
              Affiliate
            </button>
          )}
        </nav>

        {/* Desktop user controls — hidden below lg */}
        {email && (
          <div className="hidden lg:flex items-center gap-3">
            <span className="text-xs text-white/55">{email}</span>
            <GlassButton variant="ghost" size="sm" onClick={onSignOut} className="h-8" aria-label="Sign out" title="Sign out">
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </GlassButton>
          </div>
        )}

        {/* Mobile hamburger — visible below lg */}
        <button
          className="lg:hidden rounded-lg p-2 text-white/55 hover:bg-white/5 hover:text-white/80 transition-colors"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          aria-expanded={menuOpen}
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <PipelineProgressBar
        pipelineStage={pipelineStage ?? null}
        isProcessing={isProcessing ?? false}
        sessionComplete={sessionComplete ?? false}
      />

      {/* Mobile menu overlay */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" aria-hidden="false">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true" />

          {/* Slide-in panel */}
          <div
            ref={menuPanelRef}
            role="dialog"
            aria-label="Navigation menu"
            className="absolute right-0 top-0 h-full w-72 border-l border-white/[0.06] bg-white/[0.03] backdrop-blur-2xl flex flex-col"
            style={{ transform: 'translateX(0)', transition: 'transform 0.2s ease-out' }}
          >
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 h-14 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#aac2ff]" />
                <span className="text-sm font-semibold tracking-[0.01em] text-white/90">Resume Agent</span>
              </div>
              <button
                onClick={() => setMenuOpen(false)}
                className="rounded-lg p-2 text-white/55 hover:bg-white/5 hover:text-white/80 transition-colors"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {/* Nav items */}
            <nav className="flex flex-col flex-1 px-2 py-3 gap-0.5 overflow-y-auto">
              {email && (
                <button
                  onClick={() => handleNavClick('tools')}
                  className="w-full rounded-lg px-4 py-3 text-sm text-left text-white/55 hover:bg-white/5 hover:text-white/80 transition-colors"
                >
                  Tools
                </button>
              )}
              {email && (
                <button
                  onClick={() => handleNavClick('/tools/job-applier')}
                  className="w-full rounded-lg px-4 py-3 text-sm text-left text-white/55 hover:bg-white/5 hover:text-white/80 transition-colors"
                >
                  Job Applier
                </button>
              )}
              {email && (
                <button
                  onClick={() => handleNavClick('career-iq')}
                  className="w-full rounded-lg px-4 py-3 text-sm text-left font-medium text-[#98b3ff]/80 hover:bg-[#98b3ff]/10 hover:text-[#98b3ff] transition-colors"
                >
                  CareerIQ
                </button>
              )}
              {email && (
                <button
                  onClick={() => handleNavClick('dashboard')}
                  className="w-full rounded-lg px-4 py-3 text-sm text-left text-white/55 hover:bg-white/5 hover:text-white/80 transition-colors"
                >
                  Dashboard
                </button>
              )}
              <button
                onClick={() => handleNavClick('pricing')}
                className="w-full rounded-lg px-4 py-3 text-sm text-left text-white/55 hover:bg-white/5 hover:text-white/80 transition-colors"
              >
                Pricing
              </button>
              {email && (
                <button
                  onClick={() => handleNavClick('billing')}
                  className="w-full rounded-lg px-4 py-3 text-sm text-left text-white/55 hover:bg-white/5 hover:text-white/80 transition-colors"
                >
                  Billing
                </button>
              )}
              {email && (
                <button
                  onClick={() => handleNavClick('affiliate')}
                  className="w-full rounded-lg px-4 py-3 text-sm text-left text-white/55 hover:bg-white/5 hover:text-white/80 transition-colors"
                >
                  Affiliate
                </button>
              )}
            </nav>

            {/* User section at bottom */}
            {email && (
              <div className="px-4 py-4 border-t border-white/[0.06] flex items-center justify-between gap-3">
                <span className="text-xs text-white/55 truncate">{email}</span>
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-white/55 hover:bg-white/5 hover:text-white/80 transition-colors shrink-0"
                  aria-label="Sign out"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
