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
        'before:pointer-events-none before:absolute before:inset-0 before:rounded-[20px] before:ring-1 before:ring-inset before:ring-white/[0.03]',
        'after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-16 after:bg-[linear-gradient(180deg,transparent,rgba(255,255,255,0.015))] after:opacity-70',
        hover &&
          'transition-[transform,border-color,box-shadow,background-color] duration-200 hover:-translate-y-0.5 hover:border-[rgba(238,243,248,0.22)] hover:shadow-[0_34px_80px_-46px_rgba(0,0,0,0.95)]',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
