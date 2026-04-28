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
  sm: 'min-h-[40px] px-3.5 py-2 text-[13px]',
  md: 'min-h-[42px] px-4 py-2.5 text-[14px]',
  lg: 'min-h-[48px] px-5 py-3 text-[15px]',
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
        'group inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] border font-bold transition-[transform,background-color,border-color,color,box-shadow] duration-200',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset-bg)]',
        'active:translate-y-px',
        sizeClasses[size],
        variant === 'primary' &&
          'border-[var(--btn-primary-border)] bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] shadow-[0_5px_0_rgba(3,75,105,0.24)] hover:border-[var(--btn-primary-hover)] hover:bg-[var(--btn-primary-hover)] hover:shadow-[0_4px_0_rgba(3,75,105,0.28)]',
        variant === 'secondary' &&
          'border-[var(--line-strong)] bg-[var(--surface-3)] text-[var(--text-strong)] shadow-[var(--shadow-low)] hover:border-[var(--link)] hover:bg-[var(--badge-blue-bg)] hover:text-[var(--badge-blue-text)]',
        variant === 'ghost' &&
          'border-[var(--line-strong)] bg-[var(--surface-3)] text-[var(--text-muted)] hover:border-[var(--line-strong)] hover:bg-[var(--accent-muted)] hover:text-[var(--text-strong)]',
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 motion-safe:animate-spin" />}
      {children}
    </button>
  );
});
