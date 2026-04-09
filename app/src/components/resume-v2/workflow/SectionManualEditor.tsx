import type { SectionRefineActionId, SectionRefineActionOption } from '@/lib/section-draft-refinement';

interface SectionManualEditorProps {
  value: string;
  onChange: (value: string) => void;
  onApply: () => void;
  onReset: () => void;
  onCancel: () => void;
  onAssist: (actionId: SectionRefineActionId) => void;
  assistActions: SectionRefineActionOption[];
  refiningActionId?: SectionRefineActionId | null;
}

export function SectionManualEditor({
  value,
  onChange,
  onApply,
  onReset,
  onCancel,
  onAssist,
  assistActions,
  refiningActionId,
}: SectionManualEditorProps) {
  return (
    <div className="rounded-2xl border border-[var(--line-soft)] bg-[var(--surface-1)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
            Edit This Yourself
          </p>
          <p className="mt-1.5 text-sm leading-6 text-[var(--text-soft)]">
            Adjust the full section directly, or let AI tighten what you just wrote.
          </p>
        </div>
      </div>

      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={value.split('\n').length > 6 ? 10 : 8}
        className="mt-4 w-full rounded-2xl border border-[var(--line-soft)] bg-[var(--surface-0)] px-4 py-3 text-sm leading-7 text-[var(--text-strong)] outline-none transition-colors focus:border-[var(--link)]"
      />

      <div className="mt-4 flex flex-wrap gap-2">
        {assistActions.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={() => onAssist(action.id)}
            disabled={Boolean(refiningActionId)}
            className="rounded-lg border border-[var(--line-soft)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-soft)] transition-colors hover:bg-[var(--surface-0)] hover:text-[var(--text-strong)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refiningActionId === action.id ? 'Working…' : action.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onApply}
          className="rounded-lg bg-[var(--link)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white transition-opacity hover:opacity-95"
        >
          Apply edited version
        </button>
        <button
          type="button"
          onClick={onReset}
          className="rounded-lg border border-[var(--line-soft)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-soft)] transition-colors hover:bg-[var(--surface-0)] hover:text-[var(--text-strong)]"
        >
          Reset to AI draft
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-[var(--line-soft)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-soft)] transition-colors hover:bg-[var(--surface-0)] hover:text-[var(--text-strong)]"
        >
          Close editor
        </button>
      </div>
    </div>
  );
}
