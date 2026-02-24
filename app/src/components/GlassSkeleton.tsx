import { cn } from '@/lib/utils';

export function GlassSkeleton({ className }: { className?: string }) {
  return <div className={cn('rounded-lg bg-white/[0.06] animate-pulse', className)} />;
}

export function GlassSkeletonCard({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-white/[0.1] bg-white/[0.03] p-4 space-y-3', className)}>
      <GlassSkeleton className="h-3 w-24" />
      {Array.from({ length: lines }).map((_, i) => (
        <GlassSkeleton key={i} className={cn('h-2.5', i === lines - 1 ? 'w-3/5' : 'w-full')} />
      ))}
    </div>
  );
}
