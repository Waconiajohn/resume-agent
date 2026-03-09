import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type GlassButtonSize = 'sm' | 'md' | 'lg';

interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost';
  size?: GlassButtonSize;
  loading?: boolean;
  children: React.ReactNode;
}

const sizeClasses: Record<GlassButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-3 text-base',
};

export const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(function GlassButton(
  { variant = 'primary', size = 'md', loading, className, children, type = 'button', disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl border font-medium tracking-[0.01em] transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:pointer-events-none disabled:border-dashed disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/45 active:scale-[0.97] active:duration-75',
        sizeClasses[size],
        variant === 'primary' &&
          'border-[#9eb8ff]/45 bg-[linear-gradient(180deg,rgba(158,184,255,0.2),rgba(158,184,255,0.1))] text-white shadow-[0_10px_28px_-18px_rgba(132,160,255,0.9)] hover:border-[#b2c7ff]/65 hover:bg-[linear-gradient(180deg,rgba(172,196,255,0.26),rgba(158,184,255,0.13))]',
        variant === 'ghost' &&
          'border-white/[0.1] bg-white/[0.02] text-white/70 hover:border-white/[0.18] hover:bg-white/[0.07] hover:text-white/90',
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 motion-safe:animate-spin" />}
      {children}
    </button>
  );
});
