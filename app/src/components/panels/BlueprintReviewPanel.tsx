import { ShieldCheck, AlertTriangle, ClipboardList, CheckCircle2, ArrowRight } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import { GlassButton } from '../GlassButton';
import { cn } from '@/lib/utils';
import type { BlueprintReviewData } from '@/types/panels';

interface BlueprintReviewPanelProps {
  data: BlueprintReviewData;
  onApprove?: () => void;
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

function MiniWireframe({ sections }: { sections: string[] }) {
  // Find the "heaviest" section to emphasize (represents the layout's primary focus)
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
      {/* Section blocks — heaviest early section emphasized */}
      {sections.map((section, i) => {
        const config = sectionLabels[section.toLowerCase()] ?? {
          short: section.charAt(0).toUpperCase() + section.slice(1),
          height: 'h-5',
          weight: 2,
        };
        const isEmphasis = i === emphasisIndex;
        return (
          <div key={i} className="flex items-center gap-2">
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
                'w-24 shrink-0 text-right text-[9px]',
                isEmphasis ? 'font-medium text-white/84' : 'text-white/50',
              )}
            >
              {config.short}
            </span>
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
        {/* Target Role & Positioning Angle */}
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
              Target
            </span>
          </div>
          <p className="text-sm font-semibold text-white leading-snug">
            {target_role}
          </p>
          {positioning_angle && (
            <p className="mt-2 text-xs italic leading-relaxed text-white/62">
              "{positioning_angle}"
            </p>
          )}
        </GlassCard>

        {/* Section Plan with Wireframe */}
        {section_plan?.order?.length > 0 && (
          <GlassCard className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
                Section Layout
              </span>
            </div>
            <MiniWireframe sections={section_plan.order} />
            {section_plan.rationale && (
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
              <AlertTriangle className="h-3.5 w-3.5 text-white/62" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60">
                Age Protection
              </h3>
            </div>
            <div className="space-y-3">
              {age_protection.flags.map((flag, i) => (
                <div
                  key={i}
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
          <GlassButton
            variant="primary"
            className="w-full"
            onClick={onApprove}
            disabled={!onApprove}
            aria-label="Approve blueprint and start writing"
          >
            <ShieldCheck className="h-4 w-4" />
            Approve Blueprint &amp; Start Writing
            <ArrowRight className="h-4 w-4 ml-auto" />
          </GlassButton>
        </div>
      </div>
    </div>
  );
}
