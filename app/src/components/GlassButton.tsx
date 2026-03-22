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
  sm: 'min-h-[42px] px-3.5 py-2 text-[11px] tracking-[0.08em] uppercase',
  md: 'min-h-[46px] px-4.5 py-2.5 text-[12px] tracking-[0.08em] uppercase',
  lg: 'min-h-[50px] px-5.5 py-3 text-[12px] tracking-[0.1em] uppercase',
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
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d1218]',
        'active:translate-y-px',
        sizeClasses[size],
        variant === 'primary' &&
          'border-[rgba(238,243,248,0.82)] bg-[var(--accent-strong)] text-[var(--accent-ink)] shadow-[0_18px_36px_-24px_rgba(238,243,248,0.52)] hover:border-[rgba(238,243,248,0.36)] hover:bg-transparent hover:text-[var(--text-strong)] hover:shadow-[0_22px_40px_-30px_rgba(0,0,0,0.88)]',
        variant === 'secondary' &&
          'border-[var(--line-strong)] bg-[var(--surface-3)] text-[var(--text-strong)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:border-[rgba(238,243,248,0.46)] hover:bg-[var(--accent-strong)] hover:text-[var(--accent-ink)]',
        variant === 'ghost' &&
          'border-[var(--line-soft)] bg-[rgba(255,255,255,0.02)] text-[var(--text-muted)] hover:border-[rgba(238,243,248,0.38)] hover:bg-[rgba(238,243,248,0.06)] hover:text-[var(--text-strong)]',
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 motion-safe:animate-spin" />}
      {children}
    </button>
  );
});
