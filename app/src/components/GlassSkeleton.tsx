import { cn } from '@/lib/utils';

export function GlassSkeleton({ className }: { className?: string }) {
  return <div className={cn('rounded-[var(--radius-control)] bg-[var(--accent-muted)] motion-safe:animate-pulse', className)} />;
}

export function GlassSkeletonCard({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-3 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-3)] p-4 shadow-[var(--shadow-low)]', className)}>
      <GlassSkeleton className="h-3 w-24" />
      {Array.from({ length: lines }).map((_, i) => (
        <GlassSkeleton key={i} className={cn('h-2.5', i === lines - 1 ? 'w-3/5' : 'w-full')} />
      ))}
    </div>
  );
}
