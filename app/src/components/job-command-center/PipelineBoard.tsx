import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { Briefcase, Loader2 } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { PipelineColumn } from './PipelineColumn';
import { OpportunityCard } from './OpportunityCard';
import type { Application, PipelineStage } from '@/hooks/useApplicationPipeline';

const PIPELINE_STAGES: { key: PipelineStage; label: string; color: string }[] = [
  { key: 'saved', label: 'Shortlist', color: 'text-[var(--text-soft)]' },
  { key: 'researching', label: 'Researching', color: 'text-[var(--link)]' },
  { key: 'applied', label: 'Applied', color: 'text-[var(--badge-amber-text)]' },
  { key: 'screening', label: 'Screening', color: 'text-[var(--badge-amber-text)]' },
  { key: 'interviewing', label: 'Interviewing', color: 'text-[var(--badge-green-text)]' },
  { key: 'offer', label: 'Offer', color: 'text-[var(--badge-green-text)]' },
  { key: 'closed_won', label: 'Won', color: 'text-[var(--badge-green-text)]' },
  { key: 'closed_lost', label: 'Lost', color: 'text-red-400/60' },
];

interface PipelineBoardProps {
  applications: Application[];
  loading: boolean;
  onMoveStage: (id: string, stage: PipelineStage) => void;
  onSelect?: (application: Application) => void;
  onAddApplication?: () => void;
  onBuildResume?: (application: Application) => void;
  onPrepInterview?: (application: Application) => void;
  onNegotiateSalary?: (application: Application) => void;
}

export function PipelineBoard({
  applications,
  loading,
  onMoveStage,
  onSelect,
  onAddApplication,
  onBuildResume,
  onPrepInterview,
  onNegotiateSalary,
}: PipelineBoardProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        // Require 5px of movement before drag starts — prevents accidental drags on click
        distance: 5,
      },
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const draggedId = active.id as string;
    const targetStage = over.id as PipelineStage;

    const app = applications.find((a) => a.id === draggedId);
    if (!app || app.stage === targetStage) return;

    onMoveStage(draggedId, targetStage);
  }

  const byStage = (stage: PipelineStage) => applications.filter((a) => a.stage === stage);

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Briefcase size={18} className="text-[var(--link)]" />
        <h3 className="text-[15px] font-semibold text-[var(--text-strong)]">Application Pipeline</h3>
        {loading && <Loader2 size={14} className="text-[var(--link)] animate-spin ml-1" />}
        {onAddApplication && (
          <button
            type="button"
            onClick={onAddApplication}
            className="ml-auto flex items-center gap-1 text-[13px] text-[var(--link)]/60 hover:text-[var(--link)] transition-colors"
          >
            <span className="text-base leading-none">+</span> Add Application
          </button>
        )}
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {PIPELINE_STAGES.map(({ key, label, color }) => {
            const cards = byStage(key);
            return (
              <PipelineColumn
                key={key}
                stageKey={key}
                label={label}
                color={color}
                count={cards.length}
              >
                {cards.map((app) => (
                  <OpportunityCard
                    key={app.id}
                    application={app}
                    onMoveStage={onMoveStage}
                    onClick={onSelect}
                    onBuildResume={onBuildResume}
                    onPrepInterview={onPrepInterview}
                    onNegotiateSalary={onNegotiateSalary}
                  />
                ))}
                {cards.length === 0 && (
                  <div className="rounded-xl border border-dashed border-[var(--line-soft)] bg-[var(--accent-muted)] p-3 text-center">
                    <span className="text-[13px] text-[var(--text-soft)]">Empty</span>
                  </div>
                )}
              </PipelineColumn>
            );
          })}
        </div>
      </DndContext>
    </GlassCard>
  );
}
