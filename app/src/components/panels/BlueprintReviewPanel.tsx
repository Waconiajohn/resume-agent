import { useState, useCallback } from 'react';
import { ShieldCheck, AlertTriangle, ClipboardList, CheckCircle2, ArrowRight, ChevronUp, ChevronDown, Pencil, RotateCcw } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import { GlassButton } from '../GlassButton';
import { ProcessStepGuideCard } from '@/components/shared/ProcessStepGuideCard';
import { cn } from '@/lib/utils';
import type { BlueprintReviewData } from '@/types/panels';

export interface BlueprintEdits {
  positioning_angle?: string;
  section_order?: string[];
}

interface BlueprintReviewPanelProps {
  data: BlueprintReviewData;
  onApprove?: (edits?: BlueprintEdits) => void;
}

// Section labels for the mini wireframe — height and weight reflect typical content volume
const sectionLabels: Record<string, { short: string; height: string; weight: number }> = {
  summary: { short: 'Summary', height: 'h-6', weight: 3 },
  selected_accomplishments: { short: 'Accomplishments', height: 'h-8', weight: 4 },
  accomplishments: { short: 'Accomplishments', height: 'h-8', weight: 4 },
  skills: { short: 'Skills', height: 'h-5', weight: 2 },
  experience: { short: 'Experience', height: 'h-12', weight: 5 },
  education: { short: 'Education', height: 'h-4', weight: 1 },
  certifications: { short: 'Certifications', height: 'h-3', weight: 1 },
  leadership: { short: 'Leadership', height: 'h-6', weight: 3 },
  projects: { short: 'Projects', height: 'h-7', weight: 3 },
  awards: { short: 'Awards', height: 'h-3', weight: 1 },
  publications: { short: 'Publications', height: 'h-4', weight: 1 },
};

function ReorderableWireframe({
  sections,
  canEdit,
  onMove,
}: {
  sections: string[];
  canEdit: boolean;
  onMove: (index: number, direction: 'up' | 'down') => void;
}) {
  let emphasisIndex = 0;
  let maxWeight = 0;
  sections.forEach((section, i) => {
    const config = sectionLabels[section.toLowerCase()];
    const weight = config?.weight ?? 2;
    if (i < 3 && weight > maxWeight) {
      maxWeight = weight;
      emphasisIndex = i;
    }
  });

  return (
    <div className="space-y-1 rounded-lg border border-white/[0.12] bg-white/[0.05] p-2">
      {/* Header bar representing contact/name block */}
      <div className="h-3 w-2/3 rounded-sm bg-white/20" />
      <div className="h-1.5 w-1/3 rounded-sm bg-white/10" />
      <div className="my-1 h-px bg-white/[0.12]" />
      {/* Section blocks */}
      {sections.map((section, i) => {
        const config = sectionLabels[section.toLowerCase()] ?? {
          short: section.charAt(0).toUpperCase() + section.slice(1),
          height: 'h-5',
          weight: 2,
        };
        const isEmphasis = i === emphasisIndex;
        return (
          <div key={`section-${section}-${i}`} className="flex items-center gap-1.5">
            <span className="w-3 shrink-0 text-right text-[8px] text-white/30">{i + 1}</span>
            <div
              className={cn(
                'flex-1 rounded-sm',
                isEmphasis
                  ? 'border border-white/[0.2] bg-white/[0.11]'
                  : 'bg-white/[0.10]',
                config.height,
              )}
            />
            <span
              className={cn(
                'w-20 shrink-0 text-right text-[9px]',
                isEmphasis ? 'font-medium text-white/84' : 'text-white/50',
              )}
            >
              {config.short}
            </span>
            {canEdit && (
              <div className="flex flex-col shrink-0">
                <button
                  type="button"
                  disabled={i === 0}
                  onClick={() => onMove(i, 'up')}
                  className="p-0.5 text-white/40 hover:text-white/80 disabled:opacity-20 disabled:cursor-default transition-colors"
                  aria-label={`Move ${config.short} up`}
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  disabled={i === sections.length - 1}
                  onClick={() => onMove(i, 'down')}
                  className="p-0.5 text-white/40 hover:text-white/80 disabled:opacity-20 disabled:cursor-default transition-colors"
                  aria-label={`Move ${config.short} down`}
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatBadge({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-white/[0.12] bg-white/[0.06] px-3 py-1.5">
      <span className="text-xs font-medium text-white/80">{label}</span>
    </div>
  );
}

export function BlueprintReviewPanel({ data, onApprove }: BlueprintReviewPanelProps) {
  const {
    target_role,
    positioning_angle,
    section_plan,
    age_protection,
    evidence_allocation_count,
    keyword_count,
  } = data;

  const [editingAngle, setEditingAngle] = useState(false);
  const [editedAngle, setEditedAngle] = useState<string | null>(null);
  const [editedOrder, setEditedOrder] = useState<string[] | null>(null);

  const currentAngle = editedAngle ?? positioning_angle;
  const currentOrder = editedOrder ?? section_plan?.order ?? [];
  const hasEdits = editedAngle !== null || editedOrder !== null;
  const angleWasEdited = editedAngle !== null && editedAngle !== positioning_angle;
  const orderWasEdited = editedOrder !== null;

  const handleMoveSection = useCallback((index: number, direction: 'up' | 'down') => {
    const order = [...(editedOrder ?? section_plan?.order ?? [])];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= order.length) return;
    [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
    setEditedOrder(order);
  }, [editedOrder, section_plan?.order]);

  const handleApprove = useCallback(() => {
    if (!onApprove) return;
    if (hasEdits) {
      const edits: BlueprintEdits = {};
      if (angleWasEdited) edits.positioning_angle = editedAngle;
      if (orderWasEdited) edits.section_order = editedOrder!;
      onApprove(edits);
    } else {
      onApprove();
    }
  }, [onApprove, hasEdits, angleWasEdited, editedAngle, orderWasEdited, editedOrder]);

  const handleResetEdits = useCallback(() => {
    setEditedAngle(null);
    setEditedOrder(null);
    setEditingAngle(false);
  }, []);

  const hasAgeFlags = !age_protection?.clean && age_protection?.flags?.length > 0;

  return (
    <div data-panel-root className="flex h-full flex-col">
      {/* Panel header */}
        <div className="border-b border-white/[0.12] px-4 py-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-[#afc4ff]" />
            <span className="text-sm font-medium text-white/85">Resume Blueprint</span>
          </div>
        </div>

      <div data-panel-scroll className="flex-1 overflow-y-auto p-4 space-y-3">
        <ProcessStepGuideCard
          step="architect"
          tone="review"
          userDoesOverride="Review the positioning angle and section order. Edit if needed, then approve to start writing."
          nextOverride="Section drafts will be written and reviewed next."
        />

        <GlassCard className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-sky-300/20 bg-sky-400/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-100/90">
              What To Do In This Panel
            </span>
            <span className="text-[11px] text-white/62">
              Review and optionally edit the strategy before section writing begins.
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            {onApprove ? (
              <>
                <span className="rounded-full border border-white/[0.08] bg-white/[0.02] px-2 py-0.5 text-white/55">
                  Editable: positioning angle, section order
                </span>
                <span className="rounded-full border border-emerald-300/18 bg-emerald-400/[0.06] px-2 py-0.5 text-emerald-100/85">
                  Action required: review and approve to continue
                </span>
              </>
            ) : (
              <span className="rounded-full border border-white/[0.08] bg-white/[0.02] px-2 py-0.5 text-white/55">
                This run will continue automatically in this mode
              </span>
            )}
          </div>
        </GlassCard>

        {/* Target Role & Positioning Angle */}
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className={cn(
              'rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]',
              angleWasEdited
                ? 'border-amber-300/20 bg-amber-400/[0.08] text-amber-100/90'
                : 'border-white/[0.08] bg-white/[0.02] text-white/48',
            )}>
              {angleWasEdited ? 'Edited' : onApprove ? 'Editable' : 'Info only'}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
              Target
            </span>
          </div>
          <p className="text-sm font-semibold text-white leading-snug">
            {target_role}
          </p>
          {positioning_angle && (
            <div className="mt-2">
              {editingAngle ? (
                <div className="space-y-2">
                  <textarea
                    value={currentAngle}
                    onChange={(e) => setEditedAngle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setEditingAngle(false);
                        setEditedAngle(null);
                      }
                    }}
                    rows={3}
                    className="w-full rounded-md border border-white/[0.15] bg-white/[0.06] px-3 py-2 text-xs text-white/85 leading-relaxed placeholder:text-white/30 focus:border-[#afc4ff]/40 focus:outline-none focus:ring-1 focus:ring-[#afc4ff]/20 resize-none"
                    placeholder="Enter positioning angle..."
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingAngle(false)}
                      className="text-[10px] text-[#afc4ff]/80 hover:text-[#afc4ff] transition-colors"
                    >
                      Done
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditedAngle(null); setEditingAngle(false); }}
                      className="text-[10px] text-white/40 hover:text-white/60 transition-colors"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onApprove && setEditingAngle(true)}
                  disabled={!onApprove}
                  className={cn(
                    'group w-full text-left',
                    onApprove && 'cursor-pointer',
                  )}
                >
                  <div className="flex items-start gap-2">
                    <p className={cn(
                      'flex-1 text-xs italic leading-relaxed',
                      angleWasEdited ? 'text-amber-100/70' : 'text-white/62',
                    )}>
                      &ldquo;{currentAngle}&rdquo;
                    </p>
                    {onApprove && (
                      <Pencil className="h-3 w-3 shrink-0 mt-0.5 text-white/0 group-hover:text-white/40 transition-colors" />
                    )}
                  </div>
                </button>
              )}
            </div>
          )}
        </GlassCard>

        {/* Section Plan with Reorderable Wireframe */}
        {currentOrder.length > 0 && (
          <GlassCard className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className={cn(
                'rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]',
                orderWasEdited
                  ? 'border-amber-300/20 bg-amber-400/[0.08] text-amber-100/90'
                  : 'border-white/[0.08] bg-white/[0.02] text-white/48',
              )}>
                {orderWasEdited ? 'Edited' : onApprove ? 'Reorderable' : 'Info only'}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
                Section Layout
              </span>
            </div>
            <ReorderableWireframe
              sections={currentOrder}
              canEdit={!!onApprove}
              onMove={handleMoveSection}
            />
            {section_plan?.rationale && (
              <p className="mt-3 text-xs text-white/60 leading-relaxed italic">
                {section_plan.rationale}
              </p>
            )}
          </GlassCard>
        )}

        {/* Stats Row */}
        {(evidence_allocation_count > 0 || keyword_count > 0) && (
          <div className="flex flex-wrap gap-2">
            {evidence_allocation_count > 0 && (
              <StatBadge label={`${evidence_allocation_count} evidence pts allocated`} />
            )}
            {keyword_count > 0 && (
              <StatBadge label={`${keyword_count} keywords targeted`} />
            )}
          </div>
        )}

        {/* Age Protection Card */}
        {hasAgeFlags ? (
          <GlassCard className="p-4 border-white/[0.14]">
            <div className="flex items-center gap-2 mb-3">
              <span className="rounded-full border border-white/[0.08] bg-white/[0.02] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-white/48">
                Info only
              </span>
              <AlertTriangle className="h-3.5 w-3.5 text-white/62" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60">
                Age Protection
              </h3>
            </div>
            <div className="space-y-3">
              {age_protection.flags.map((flag, i) => (
                <div
                  key={`age-flag-${flag.item.slice(0, 30)}-${i}`}
                  className="space-y-1 rounded-lg border border-white/[0.1] bg-white/[0.03] p-2.5"
                >
                  <p className="text-xs font-medium text-white/85">{flag.item}</p>
                  <div className="flex items-start gap-1.5">
                    <span className="shrink-0 text-[10px] font-semibold text-white/66">Risk:</span>
                    <span className="text-[10px] text-white/60 leading-relaxed">{flag.risk}</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="shrink-0 text-[10px] font-semibold text-white/66">Action:</span>
                    <span className="text-[10px] text-white/60 leading-relaxed">{flag.action}</span>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        ) : (
          <GlassCard className="p-3 border-white/[0.14]">
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-white/[0.08] bg-white/[0.02] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-white/48">
                Info only
              </span>
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#a8d7b8]" />
              <span className="text-xs font-medium text-white/76">No age signals detected</span>
            </div>
          </GlassCard>
        )}

        {/* Approve Button */}
        <div className="pt-1 pb-2">
          {!onApprove && (
            <div className="mb-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[11px] text-white/56">
              This blueprint is shown for transparency. In your current mode, the pipeline may continue automatically without a manual approval step.
            </div>
          )}
          {hasEdits && (
            <button
              type="button"
              onClick={handleResetEdits}
              className="mb-2 flex items-center gap-1.5 text-[11px] text-white/50 hover:text-white/70 transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              Reset all edits
            </button>
          )}
          <GlassButton
            variant="primary"
            className="w-full"
            onClick={handleApprove}
            disabled={!onApprove}
            aria-label={hasEdits ? 'Approve blueprint with edits and start writing' : 'Approve blueprint and start writing'}
          >
            <ShieldCheck className="h-4 w-4" />
            {hasEdits ? 'Approve with Edits & Start Writing' : 'Approve Blueprint & Start Section Writing'}
            <ArrowRight className="h-4 w-4 ml-auto" />
          </GlassButton>
        </div>
      </div>
    </div>
  );
}
