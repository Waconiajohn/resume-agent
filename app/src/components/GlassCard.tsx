import { cn } from '@/lib/utils';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export function GlassCard({ children, className, hover = false, onClick }: GlassCardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl',
        hover && 'transition-colors hover:bg-white/[0.08]',
        className,
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
