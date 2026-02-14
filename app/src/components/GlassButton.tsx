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
        'inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-400/50',
        variant === 'primary' &&
          'bg-gradient-to-b from-blue-500 to-blue-600 text-white rounded-2xl border border-blue-400/30 backdrop-blur-lg hover:from-blue-400 hover:to-blue-500 shadow-lg shadow-blue-500/25',
        variant === 'ghost' &&
          'text-white/60 hover:text-white hover:bg-white/10 hover:border-white/[0.12] rounded-2xl border border-transparent',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
