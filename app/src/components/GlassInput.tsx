import { cn } from '@/lib/utils';
import { forwardRef } from 'react';

interface GlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const GlassInput = forwardRef<HTMLInputElement, GlassInputProps>(
  ({ className, ...props }, ref) => {
    return (
        <input
          ref={ref}
          className={cn(
          'w-full rounded-xl border border-white/[0.1] bg-white/[0.03] px-4 py-2.5 text-sm text-white/90 placeholder:text-white/40 outline-none backdrop-blur-2xl transition-all duration-200 focus:border-[#a5bdff]/55 focus:bg-white/[0.045] focus:ring-2 focus:ring-[#a5bdff]/20 focus:shadow-[0_0_12px_-6px_rgba(165,189,255,0.3)]',
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
          'w-full resize-none rounded-xl border border-white/[0.1] bg-white/[0.03] px-4 py-2.5 text-sm text-white/90 placeholder:text-white/40 outline-none backdrop-blur-2xl transition-all duration-200 focus:border-[#a5bdff]/55 focus:bg-white/[0.045] focus:ring-2 focus:ring-[#a5bdff]/20 focus:shadow-[0_0_12px_-6px_rgba(165,189,255,0.3)]',
          className,
        )}
        {...props}
      />
    );
  },
);

GlassTextarea.displayName = 'GlassTextarea';
