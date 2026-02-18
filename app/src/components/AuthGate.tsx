import { useState } from 'react';
import { GlassCard } from './GlassCard';
import { GlassButton } from './GlassButton';
import { GlassInput } from './GlassInput';
import { Sparkles } from 'lucide-react';

interface AuthGateProps {
  onSignIn: (email: string, password: string) => Promise<{ error: unknown }>;
  onSignUp: (email: string, password: string) => Promise<{ error: unknown }>;
  onGoogleSignIn: () => Promise<{ error: unknown }>;
}

export function AuthGate({ onSignIn, onSignUp, onGoogleSignIn }: AuthGateProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = isSignUp
      ? await onSignUp(email, password)
      : await onSignIn(email, password);

    if (error) {
      setError((error as { message?: string })?.message ?? String(error));
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-300/[0.08] via-transparent to-transparent" />

      <GlassCard className="relative z-10 w-full max-w-sm p-8">
        <div className="mb-6 flex flex-col items-center gap-2">
          <Sparkles className="h-8 w-8 text-[#afc4ff]" />
          <h1 className="text-xl font-semibold text-white/90">Resume Agent</h1>
          <p className="text-sm text-white/50">Your AI resume coach</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <GlassInput
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <GlassInput
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          <GlassButton type="submit" disabled={loading} className="w-full">
            {loading ? 'Loading...' : isSignUp ? 'Create Account' : 'Sign In'}
          </GlassButton>
        </form>

        <div className="mt-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-white/[0.06]" />
            <span className="text-xs text-white/30">or</span>
            <div className="h-px flex-1 bg-white/[0.06]" />
          </div>

          <GlassButton
            variant="ghost"
            onClick={() => onGoogleSignIn()}
            className="w-full border border-white/[0.06]"
          >
            Continue with Google
          </GlassButton>

          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-xs text-white/60 hover:text-white/80 transition-colors"
          >
            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>
        </div>
      </GlassCard>
    </div>
  );
}
