import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost';
  loading?: boolean;
  children: React.ReactNode;
}

export const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(function GlassButton(
  { variant = 'primary', loading, className, children, type = 'button', disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium tracking-[0.01em] transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/45 active:scale-[0.97] active:duration-75',
        variant === 'primary' &&
          'border-[#9eb8ff]/45 bg-[linear-gradient(180deg,rgba(158,184,255,0.2),rgba(158,184,255,0.1))] text-white shadow-[0_10px_28px_-18px_rgba(132,160,255,0.9)] hover:border-[#b2c7ff]/65 hover:bg-[linear-gradient(180deg,rgba(172,196,255,0.26),rgba(158,184,255,0.13))]',
        variant === 'ghost' &&
          'border-white/[0.1] bg-white/[0.02] text-white/70 hover:border-white/[0.18] hover:bg-white/[0.07] hover:text-white/90',
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
});
