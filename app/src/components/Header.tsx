import { LogOut, Sparkles } from 'lucide-react';
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
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.1] bg-[linear-gradient(180deg,rgba(15,20,30,0.78),rgba(11,16,24,0.68))] backdrop-blur-2xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#aac2ff]" />
          <span className="text-sm font-semibold tracking-[0.01em] text-white/90">Resume Agent</span>
        </div>

        <nav className="flex items-center gap-1">
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

        {email && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/55">{email}</span>
            <GlassButton variant="ghost" onClick={onSignOut} className="h-8 px-2.5" aria-label="Sign out" title="Sign out">
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </GlassButton>
          </div>
        )}
      </div>
      <PipelineProgressBar
        pipelineStage={pipelineStage ?? null}
        isProcessing={isProcessing ?? false}
        sessionComplete={sessionComplete ?? false}
      />
    </header>
  );
}
