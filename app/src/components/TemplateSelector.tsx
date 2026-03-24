import { cn } from '@/lib/utils';
import { RESUME_TEMPLATES } from '@/lib/export-templates';
import type { TemplateId } from '@/lib/export-templates';

interface TemplateSelectorProps {
  selected: TemplateId;
  onChange: (id: TemplateId) => void;
  className?: string;
}

export function TemplateSelector({ selected, onChange, className }: TemplateSelectorProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)} role="radiogroup" aria-label="Resume template">
      <p className="text-xs uppercase tracking-[0.1em] text-[var(--text-soft)] font-semibold">Template</p>
      <div className="grid grid-cols-2 gap-2">
        {RESUME_TEMPLATES.map((template) => {
          const isSelected = selected === template.id;
          return (
            <button
              key={template.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onChange(template.id)}
              className={cn(
                'flex flex-col gap-1 rounded-[10px] border px-3 py-2.5 text-left transition-[border-color,background-color] duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30',
                isSelected
                  ? 'border-[var(--accent-strong)] bg-[var(--accent-muted)]'
                  : 'border-[var(--line-soft)] bg-[var(--accent-muted)] hover:bg-[var(--accent-muted)]',
              )}
            >
              <span
                className={cn(
                  'text-[12px] font-semibold leading-none',
                  isSelected ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]',
                )}
              >
                {template.name}
              </span>
              <span className="text-xs leading-[1.4] text-[var(--text-soft)]">
                {template.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
