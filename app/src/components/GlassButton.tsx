import { cn } from '@/lib/utils';

interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost';
  children: React.ReactNode;
}

export function GlassButton({
  variant = 'primary',
  className,
  children,
  ...props
}: GlassButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed',
        variant === 'primary' &&
          'bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-xl hover:from-blue-500 hover:to-blue-400 shadow-lg shadow-blue-500/20',
        variant === 'ghost' &&
          'text-white/50 hover:text-white hover:bg-white/10 rounded-xl',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
