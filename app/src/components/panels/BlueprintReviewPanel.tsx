import { useState, useCallback, useEffect } from 'react';
import { ShieldCheck, AlertTriangle, ClipboardList, CheckCircle2, ArrowRight, ChevronUp, ChevronDown, Pencil, RotateCcw } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import { GlassButton } from '../GlassButton';
import { ProcessStepGuideCard } from '@/components/shared/ProcessStepGuideCard';
import { cn } from '@/lib/utils';
import type { BlueprintReviewData, BlueprintKeywordTarget, BlueprintEvidenceItem } from '@/types/panels';

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
          short: section.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
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
    keyword_targets,
    evidence_items,
    experience_roles,
  } = data;

  const [editingAngle, setEditingAngle] = useState(false);
  const [editedAngle, setEditedAngle] = useState<string | null>(null);
  const [editedOrder, setEditedOrder] = useState<string[] | null>(null);

  // Reset edits when new blueprint data arrives from the server.
  // Use positioning_angle as the stable identity key for the blueprint.
  useEffect(() => {
    setEditedAngle(null);
    setEditedOrder(null);
    setEditingAngle(false);
  }, [positioning_angle]);

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
            <span className="text-sm font-medium text-white/85">Your Resume Plan</span>
          </div>
        </div>

      <div data-panel-scroll className="flex-1 overflow-y-auto p-4 space-y-3">
        <ProcessStepGuideCard
          step="architect"
          tone="review"
          userDoesOverride={
            onApprove
              ? 'Review the positioning angle and section order. Edit if needed, then approve to start writing.'
              : 'Review the positioning strategy. This run will continue automatically without a manual approval step.'
          }
          nextOverride="Section drafts will be written and reviewed next."
        />

        {/* Target Role & Positioning Angle */}
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-2">
            {(angleWasEdited || onApprove) && (
              <span className={cn(
                'rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]',
                angleWasEdited
                  ? 'border-[#f0d99f]/20 bg-[#f0d99f]/[0.08] text-[#f0d99f]/90'
                  : 'border-white/[0.08] bg-white/[0.02] text-white/48',
              )}>
                {angleWasEdited ? 'Edited' : 'Editable'}
              </span>
            )}
            {!angleWasEdited && (
              <span className="text-[10px] text-indigo-300/60 bg-indigo-400/[0.08] border border-indigo-400/20 rounded px-1.5 py-0.5">AI-suggested</span>
            )}
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
                    className="w-full rounded-md border border-white/[0.15] bg-white/[0.06] px-3 py-2 text-xs text-white/85 leading-relaxed placeholder:text-white/30 focus:border-[#afc4ff]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:ring-1 focus:ring-[#afc4ff]/20 resize-none"
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
                      angleWasEdited ? 'text-[#f0d99f]/70' : 'text-white/62',
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
              {(orderWasEdited || onApprove) && (
                <span className={cn(
                  'rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]',
                  orderWasEdited
                    ? 'border-[#f0d99f]/20 bg-[#f0d99f]/[0.08] text-[#f0d99f]/90'
                    : 'border-white/[0.08] bg-white/[0.02] text-white/48',
                )}>
                  {orderWasEdited ? 'Edited' : 'Reorderable'}
                </span>
              )}
              {!orderWasEdited && (
                <span className="text-[10px] text-indigo-300/60 bg-indigo-400/[0.08] border border-indigo-400/20 rounded px-1.5 py-0.5">AI-suggested</span>
              )}
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

        {/* Evidence Allocation */}
        {(evidence_items && evidence_items.length > 0) ? (
          <details className="group">
            <summary className="cursor-pointer list-none rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[11px] text-white/56 hover:bg-white/[0.04] hover:text-white/72 transition-colors select-none">
              <span>{evidence_items.length} key achievements mapped to requirements</span>
            </summary>
            <div className="mt-2 space-y-1.5">
              {evidence_items.map((item: BlueprintEvidenceItem, i: number) => (
                <div key={`ev-${item.achievement.slice(0, 30)}-${i}`} className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-2">
                  <p className="text-xs text-white/85">{item.achievement}</p>
                  {item.maps_to_requirements.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {item.maps_to_requirements.map((req: string, j: number) => (
                        <span key={`ev-req-${i}-${j}`} className="rounded border border-white/10 bg-white/[0.06] px-1.5 py-0.5 text-[9px] text-white/60">
                          {req}
                        </span>
                      ))}
                    </div>
                  )}
                  {item.placement_rationale && (
                    <p className="mt-1 text-[10px] italic text-white/50">{item.placement_rationale}</p>
                  )}
                </div>
              ))}
            </div>
          </details>
        ) : evidence_allocation_count > 0 ? (
          <StatBadge label={`${evidence_allocation_count} key achievements matched`} />
        ) : null}

        {/* Keyword Targets */}
        {(keyword_targets && keyword_targets.length > 0) ? (
          <details className="group">
            <summary className="cursor-pointer list-none rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[11px] text-white/56 hover:bg-white/[0.04] hover:text-white/72 transition-colors select-none">
              <span>{keyword_targets.length} keywords to weave into your resume</span>
            </summary>
            <div className="mt-2 space-y-1">
              {keyword_targets.map((kw: BlueprintKeywordTarget) => (
                <div key={`kw-${kw.keyword}`} className="flex items-center justify-between rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5">
                  <span className="text-xs text-white/85">{kw.keyword}</span>
                  <div className="flex items-center gap-2">
                    {kw.placements.length > 0 && (
                      <span className="text-[9px] text-white/40">{kw.placements.slice(0, 2).join(', ')}</span>
                    )}
                    <span className={cn(
                      'rounded-full px-1.5 py-0.5 text-[9px] font-medium',
                      kw.current_count > 0
                        ? 'border border-[#b5dec2]/20 bg-[#b5dec2]/10 text-[#b5dec2]'
                        : 'border border-[#f0d99f]/20 bg-[#f0d99f]/10 text-[#f0d99f]'
                    )}>
                      {kw.action || (kw.current_count > 0 ? 'present' : 'add')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </details>
        ) : keyword_count > 0 ? (
          <StatBadge label={`${keyword_count} relevant terms to include`} />
        ) : null}

        {/* Experience Roles */}
        {experience_roles && experience_roles.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer list-none rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[11px] text-white/56 hover:bg-white/[0.04] hover:text-white/72 transition-colors select-none">
              <span>{experience_roles.length} roles planned for experience section</span>
            </summary>
            <div className="mt-2 space-y-1">
              {experience_roles.map((role) => (
                <div key={`role-${role.role_key}`} className="flex items-center justify-between rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5">
                  <span className="text-xs text-white/85">{role.company}</span>
                  {role.bullet_range && (
                    <span className="text-[10px] text-white/50">{role.bullet_range[0]}–{role.bullet_range[1]} bullets</span>
                  )}
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Age Protection Card */}
        {hasAgeFlags ? (
          <GlassCard className="p-4 border-white/[0.14]">
            <div className="flex items-center gap-2 mb-3">
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
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#a8d7b8]" />
              <span className="text-xs font-medium text-white/76">No age signals detected</span>
            </div>
          </GlassCard>
        )}

        {/* Approve Button */}
        <div className="pt-1 pb-2">
          {!onApprove && (
            <div className="mb-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[11px] text-white/56">
              This is a preview of your resume plan. Writing will begin automatically.
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
            {hasEdits ? 'Approve with Edits & Start Writing' : 'Looks Good — Start Writing'}
            <ArrowRight className="h-4 w-4 ml-auto" />
          </GlassButton>
        </div>
      </div>
    </div>
  );
}
