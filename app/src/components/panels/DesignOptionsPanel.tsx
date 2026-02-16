import { Layout } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import { cn } from '@/lib/utils';
import type { DesignOptionsData, DesignOption } from '@/types/panels';

interface DesignOptionsPanelProps {
  data: DesignOptionsData;
}

// Section labels for the mini wireframe — height reflects typical content volume
const sectionLabels: Record<string, { short: string; height: string; weight: number }> = {
  summary: { short: 'Summary', height: 'h-6', weight: 3 },
  selected_accomplishments: { short: 'Accomplishments', height: 'h-8', weight: 4 },
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
    // Emphasize the first high-weight section that appears early (top 3 positions)
    const config = sectionLabels[section.toLowerCase()];
    const weight = config?.weight ?? 2;
    if (i < 3 && weight > maxWeight) {
      maxWeight = weight;
      emphasisIndex = i;
    }
  });

  return (
    <div className="space-y-1 rounded-lg border border-white/[0.12] bg-white/[0.05] p-2">
      {/* Header bar */}
      <div className="h-3 w-2/3 rounded-sm bg-white/20" />
      <div className="h-1.5 w-1/3 rounded-sm bg-white/10" />
      <div className="my-1 h-px bg-white/[0.12]" />
      {/* Section blocks — heaviest early section emphasized */}
      {sections.map((section, i) => {
        const config = sectionLabels[section.toLowerCase()] ?? { short: section, height: 'h-5', weight: 2 };
        const isEmphasis = i === emphasisIndex;
        return (
          <div key={i} className="flex items-center gap-2">
            <span className="w-3 text-[8px] text-white/30 text-right shrink-0">{i + 1}</span>
            <div className={cn(
              'flex-1 rounded-sm',
              isEmphasis ? 'bg-blue-500/20 border border-blue-500/30' : 'bg-white/[0.10]',
              config.height,
            )} />
            <span className={cn(
              'w-20 text-right text-[9px] shrink-0',
              isEmphasis ? 'text-blue-300 font-medium' : 'text-white/50',
            )}>
              {config.short}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DesignCard({ option, isSelected }: { option: DesignOption; isSelected: boolean }) {
  return (
    <GlassCard
      className={cn(
        'p-4 transition-all duration-200',
        isSelected
          ? 'border-blue-500/40 shadow-[0_0_20px_-4px_rgba(59,130,246,0.15)]'
          : 'hover:border-white/10',
      )}
      hover={!isSelected}
    >
      <div className="flex items-center gap-2 mb-2">
        <Layout className="h-3.5 w-3.5 text-blue-400" />
        <span className="text-sm font-medium text-white">{option.name}</span>
        {isSelected && (
          <span className="ml-auto rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-medium text-blue-300">
            Selected
          </span>
        )}
      </div>

      <p className="text-xs text-white/70 mb-3">{option.description}</p>

      {option.section_order?.length > 0 && (
        <MiniWireframe sections={option.section_order} />
      )}

      {option.rationale && (
        <p className="mt-3 text-xs text-blue-300 italic">{option.rationale}</p>
      )}
    </GlassCard>
  );
}

export function DesignOptionsPanel({ data }: DesignOptionsPanelProps) {
  const options = data.options ?? [];
  const selected_id = data.selected_id;

  // Once a selection is made, only show the selected option
  const hasSelection = !!selected_id || options.some(o => o.selected);
  const displayOptions = hasSelection
    ? options.filter(o => o.selected || o.id === selected_id)
    : options;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/[0.12] px-4 py-3">
        <span className="text-sm font-medium text-white/85">Resume Design</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {displayOptions.map((option) => (
          <DesignCard
            key={option.id}
            option={option}
            isSelected={option.selected || option.id === selected_id}
          />
        ))}
      </div>
    </div>
  );
}
