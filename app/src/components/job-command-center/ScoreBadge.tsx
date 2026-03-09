import { cn } from '@/lib/utils';

export function ScoreBadge({ score }: { score: number }) {
  return (
    <span
      className={cn(
        'text-[10px] font-medium px-1.5 py-0.5 rounded-full tabular-nums',
        score >= 80
          ? 'bg-[#b5dec2]/10 text-[#b5dec2]'
          : score >= 60
            ? 'bg-[#98b3ff]/10 text-[#98b3ff]'
            : 'bg-white/[0.05] text-white/35',
      )}
    >
      {score}
    </span>
  );
}
