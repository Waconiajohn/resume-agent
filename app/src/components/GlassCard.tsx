import { cn } from '@/lib/utils';

type GlassCardProps = React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
};

export function GlassCard({ children, className, hover = false, ...rest }: GlassCardProps) {
  return (
    <div
      className={cn(
        'shell-panel',
        'glass-card-ring',
        'glass-card-bottom',
        hover && 'glass-card-hover',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
