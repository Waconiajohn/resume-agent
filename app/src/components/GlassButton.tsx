import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type GlassButtonSize = 'sm' | 'md' | 'lg';

interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'secondary';
  size?: GlassButtonSize;
  loading?: boolean;
  children: React.ReactNode;
}

const sizeClasses: Record<GlassButtonSize, string> = {
  sm: 'min-h-[42px] px-3.5 py-2 text-[13px] tracking-[0.08em] uppercase',
  md: 'min-h-[46px] px-4.5 py-2.5 text-[13px] tracking-[0.08em] uppercase',
  lg: 'min-h-[50px] px-5.5 py-3 text-[13px] tracking-[0.1em] uppercase',
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
        'group inline-flex items-center justify-center gap-2 rounded-[12px] border font-semibold transition-[transform,background-color,border-color,color,box-shadow] duration-200',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset-bg)]',
        'active:translate-y-px',
        sizeClasses[size],
        variant === 'primary' &&
          'border-[var(--line-strong)] bg-[var(--accent-strong)] text-[var(--accent-ink)] shadow-[var(--shadow-low)] hover:border-[var(--line-soft)] hover:bg-[var(--accent-muted)] hover:text-[var(--text-strong)] hover:shadow-[var(--shadow-mid)]',
        variant === 'secondary' &&
          'border-[var(--line-strong)] bg-[var(--surface-3)] text-[var(--text-strong)] shadow-[inset_0_1px_0_var(--shell-top-highlight)] hover:border-[var(--line-strong)] hover:bg-[var(--accent-strong)] hover:text-[var(--accent-ink)]',
        variant === 'ghost' &&
          'border-[var(--line-soft)] bg-[var(--accent-muted)] text-[var(--text-muted)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)] hover:text-[var(--text-strong)]',
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 motion-safe:animate-spin" />}
      {children}
    </button>
  );
});
