import { LogOut, Sparkles } from 'lucide-react';
import { GlassButton } from './GlassButton';

interface HeaderProps {
  email?: string;
  onSignOut: () => void;
}

export function Header({ email, onSignOut }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-blue-400" />
          <span className="text-sm font-semibold text-white/90">Resume Agent</span>
        </div>

        {email && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/40">{email}</span>
            <GlassButton variant="ghost" onClick={onSignOut} className="h-8 px-2">
              <LogOut className="h-4 w-4" />
            </GlassButton>
          </div>
        )}
      </div>
    </header>
  );
}
