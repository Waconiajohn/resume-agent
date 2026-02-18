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
        'relative overflow-hidden rounded-[18px] border border-white/[0.1] bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] backdrop-blur-2xl backdrop-saturate-150 shadow-[0_20px_44px_-28px_rgba(0,0,0,0.9)]',
        'before:pointer-events-none before:absolute before:inset-0 before:rounded-[18px] before:ring-1 before:ring-inset before:ring-white/[0.04]',
        hover && 'transition-all duration-200 hover:border-white/[0.16] hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.035))] hover:shadow-[0_24px_52px_-30px_rgba(0,0,0,0.95)]',
        className,
      )}
      onClick={onClick}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/[0.18]" />
      {children}
    </div>
  );
}
