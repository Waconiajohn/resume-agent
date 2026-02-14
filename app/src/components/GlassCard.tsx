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
        'relative rounded-2xl border border-white/[0.12] bg-white/[0.06] backdrop-blur-xl backdrop-saturate-150 shadow-lg shadow-black/20',
        hover && 'transition-all hover:bg-white/[0.10] hover:border-white/[0.18] hover:shadow-xl hover:shadow-black/25',
        className,
      )}
      onClick={onClick}
    >
      {/* Apple glass inner highlight */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      {children}
    </div>
  );
}
