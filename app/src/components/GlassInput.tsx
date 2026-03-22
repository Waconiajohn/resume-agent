import { cn } from '@/lib/utils';
import { forwardRef } from 'react';

interface GlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const GlassInput = forwardRef<HTMLInputElement, GlassInputProps>(
  ({ className, ...props }, ref) => {
    return (
        <input
          ref={ref}
          className={cn(
          'w-full min-h-[46px] rounded-[12px] border border-[var(--line-soft)] bg-[var(--surface-2)] px-4 py-2.5 text-sm text-[var(--text-strong)] placeholder:text-[var(--text-soft)] outline-none transition-[border-color,background-color,box-shadow,color] duration-200',
          'focus:border-[rgba(238,243,248,0.36)] focus:bg-[var(--surface-elevated)] focus:ring-2 focus:ring-[var(--focus-ring)] focus:ring-offset-2 focus:ring-offset-[#0d1218] focus:shadow-[0_16px_30px_-24px_rgba(0,0,0,0.9)]',
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
          'w-full min-h-[46px] resize-none rounded-[12px] border border-[var(--line-soft)] bg-[var(--surface-2)] px-4 py-2.5 text-sm text-[var(--text-strong)] placeholder:text-[var(--text-soft)] outline-none transition-[border-color,background-color,box-shadow,color] duration-200',
          'focus:border-[rgba(238,243,248,0.36)] focus:bg-[var(--surface-elevated)] focus:ring-2 focus:ring-[var(--focus-ring)] focus:ring-offset-2 focus:ring-offset-[#0d1218] focus:shadow-[0_16px_30px_-24px_rgba(0,0,0,0.9)]',
          className,
        )}
        {...props}
      />
    );
  },
);

GlassTextarea.displayName = 'GlassTextarea';
