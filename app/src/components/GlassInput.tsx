import { cn } from '@/lib/utils';
import { forwardRef } from 'react';

interface GlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const GlassInput = forwardRef<HTMLInputElement, GlassInputProps>(
  ({ className, ...props }, ref) => {
    return (
        <input
          ref={ref}
          className={cn(
          'w-full min-h-[44px] rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-3)] px-4 py-2.5 text-sm font-medium text-[var(--text-strong)] placeholder:text-[var(--text-soft)] outline-none transition-[border-color,background-color,box-shadow,color] duration-200',
          'focus:border-[var(--link)] focus:bg-[var(--surface-elevated)] focus:ring-2 focus:ring-[var(--focus-ring)] focus:ring-offset-2 focus:ring-offset-[var(--focus-ring-offset-bg)] focus:shadow-[var(--shadow-low)]',
          className,
        )}
        {...props}
      />
    );
  },
);

GlassInput.displayName = 'GlassInput';

interface GlassTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const GlassTextarea = forwardRef<HTMLTextAreaElement, GlassTextareaProps>(
  ({ className, ...props }, ref) => {
    return (
        <textarea
          ref={ref}
          className={cn(
          'w-full min-h-[44px] resize-none rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-3)] px-4 py-2.5 text-sm font-medium text-[var(--text-strong)] placeholder:text-[var(--text-soft)] outline-none transition-[border-color,background-color,box-shadow,color] duration-200',
          'focus:border-[var(--link)] focus:bg-[var(--surface-elevated)] focus:ring-2 focus:ring-[var(--focus-ring)] focus:ring-offset-2 focus:ring-offset-[var(--focus-ring-offset-bg)] focus:shadow-[var(--shadow-low)]',
          className,
        )}
        {...props}
      />
    );
  },
);

GlassTextarea.displayName = 'GlassTextarea';
