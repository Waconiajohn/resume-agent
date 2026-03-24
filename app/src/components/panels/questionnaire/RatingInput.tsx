import { cn } from '@/lib/utils';

const DEFAULT_LEVELS = ['None', 'Familiar', 'Proficient', 'Expert'];

interface RatingInputProps {
  value: string | null;
  onChange: (value: string) => void;
  levels?: string[];
}

export function RatingInput({ value, onChange, levels = DEFAULT_LEVELS }: RatingInputProps) {
  return (
    <div
      className="flex gap-2 flex-wrap"
      role="radiogroup"
      aria-label="Rating scale"
    >
      {levels.map((level) => {
        const isActive = value === level;
        return (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(level)}
            className={cn(
              'min-h-[44px] flex-1 min-w-[72px] rounded-xl border px-3 py-2.5 text-sm font-medium',
              'transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/45',
              isActive
                ? 'border-[#9eb8ff]/65 bg-[linear-gradient(180deg,rgba(158,184,255,0.22),rgba(158,184,255,0.11))] text-white shadow-[0_4px_18px_-10px_rgba(132,160,255,0.7)]'
                : 'border-[var(--line-soft)] bg-[var(--accent-muted)] text-[var(--text-soft)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-1)] hover:text-[var(--text-muted)]',
            )}
          >
            {level}
          </button>
        );
      })}
    </div>
  );
}
