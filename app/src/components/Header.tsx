import { LogOut, Sparkles } from 'lucide-react';
import { GlassButton } from './GlassButton';

interface HeaderProps {
  email?: string;
  onSignOut: () => void;
}

export function Header({ email, onSignOut }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.1] bg-[linear-gradient(180deg,rgba(15,20,30,0.78),rgba(11,16,24,0.68))] backdrop-blur-2xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#aac2ff]" />
          <span className="text-sm font-semibold tracking-[0.01em] text-white/90">Resume Agent</span>
        </div>

        {email && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/55">{email}</span>
            <GlassButton variant="ghost" onClick={onSignOut} className="h-8 px-2.5" aria-label="Sign out" title="Sign out">
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </GlassButton>
          </div>
        )}
      </div>
    </header>
  );
}
