import { cn } from '@/lib/utils';
import { forwardRef } from 'react';

interface GlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const GlassInput = forwardRef<HTMLInputElement, GlassInputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          'w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm text-white/90 placeholder:text-white/30 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-colors',
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
          'w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm text-white/90 placeholder:text-white/30 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-colors resize-none',
          className,
        )}
        {...props}
      />
    );
  },
);

GlassTextarea.displayName = 'GlassTextarea';
