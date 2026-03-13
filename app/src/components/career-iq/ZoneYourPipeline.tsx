import { GlassCard } from '@/components/GlassCard';
import { cn } from '@/lib/utils';
import { Clock, MessageCircle, GripVertical, Archive, Search } from 'lucide-react';
import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { CareerIQRoom } from './Sidebar';

const PIPELINE_STAGES = ['Discovered', 'Applied', 'Interviewing', 'Offer', 'Accepted'] as const;
type PipelineStage = typeof PIPELINE_STAGES[number];

export interface PipelineCard {
  id: string;
  company: string;
  role: string;
  stage: PipelineStage;
  daysSinceMovement: number;
  hasNewActivity: boolean;
  interviewRound?: number;
  scheduledDate?: string;
}

const STAGE_DB_MAP: Record<string, PipelineStage> = {
  discovered: 'Discovered',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  accepted: 'Accepted',
};

const STAGE_TO_DB: Record<PipelineStage, string> = {
  Discovered: 'discovered',
  Applied: 'applied',
  Interviewing: 'interviewing',
  Offer: 'offer',
  Accepted: 'accepted',
};


function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function toCard(row: { id: string; company: string; title: string; pipeline_stage: string; updated_at: string }): PipelineCard {
  const days = daysSince(row.updated_at);
  return {
    id: row.id,
    company: row.company,
    role: row.title,
    stage: STAGE_DB_MAP[row.pipeline_stage] ?? 'Discovered',
    daysSinceMovement: days,
    hasNewActivity: days <= 1,
  };
}

const ORDINAL_SUFFIXES = ['th', 'st', 'nd', 'rd'] as const;
function ordinal(n: number): string {
  const v = n % 100;
  return `${n}${ORDINAL_SUFFIXES[(v - 20) % 10] ?? ORDINAL_SUFFIXES[v] ?? ORDINAL_SUFFIXES[0]}`;
}

function formatScheduledDate(dateStr: string): string | null {
  const date = new Date(dateStr);
  const now = new Date();
  if (date.getTime() > now.getTime()) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return null;
}

const STAGE_COLORS: Record<PipelineStage, string> = {
  Discovered: 'border-t-white/20',
  Applied: 'border-t-[#98b3ff]/40',
  Interviewing: 'border-t-[#f0d99f]/40',
  Offer: 'border-t-[#b5dec2]/40',
  Accepted: 'border-t-[#b5dec2]/60',
};

interface ZoneYourPipelineProps {
  onNavigateRoom?: (room: CareerIQRoom) => void;
  /** When provided, skip Supabase fetch and render these cards (demo mode). */
  mockCards?: PipelineCard[];
}

function CompanyInitials({ company }: { company: string }) {
  const initials = company
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="h-7 w-7 rounded-lg bg-white/[0.08] flex items-center justify-center text-[10px] font-bold text-white/50 flex-shrink-0">
      {initials}
    </div>
  );
}

function PipelineCardItem({
  card,
  onDragStart,
  onArchive,
}: {
  card: PipelineCard;
  onDragStart: (e: React.DragEvent, cardId: string) => void;
  onArchive: (cardId: string) => void;
}) {
  const isStale = card.daysSinceMovement >= 7;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, card.id)}
      className={cn(
        'group rounded-xl border-t-2 border border-white/[0.08] bg-white/[0.03] p-3 cursor-grab active:cursor-grabbing transition-all duration-150',
        'hover:border-white/[0.15] hover:bg-white/[0.05] hover:shadow-lg hover:shadow-black/10',
        isStale && 'opacity-50 hover:opacity-80',
        card.hasNewActivity && 'border-[#98b3ff]/20',
        STAGE_COLORS[card.stage],
      )}
    >
      <div className="flex items-start gap-2.5">
        <CompanyInitials company={card.company} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-medium text-white/85 truncate">
              {card.company}
            </span>
            {card.hasNewActivity && (
              <span className="h-1.5 w-1.5 rounded-full bg-[#98b3ff] flex-shrink-0 animate-pulse" />
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[11px] text-white/45 truncate">
              {card.role}
            </span>
            {card.stage === 'Interviewing' && card.interviewRound != null && (
              <span className="flex-shrink-0 rounded bg-[#f0d99f]/15 border border-[#f0d99f]/20 px-1.5 py-px text-[9px] font-medium text-[#f0d99f]/80">
                {ordinal(card.interviewRound)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onArchive(card.id); }}
            className="rounded p-1 text-white/30 hover:text-white/60 hover:bg-white/[0.06]"
            title="Archive"
          >
            <Archive size={12} />
          </button>
          <div className="text-white/20 cursor-grab">
            <GripVertical size={12} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2.5 text-[11px] text-white/35">
        <Clock size={11} />
        <span>
          {card.scheduledDate && formatScheduledDate(card.scheduledDate)
            ? formatScheduledDate(card.scheduledDate)
            : card.daysSinceMovement === 0
              ? 'Today'
              : `${card.daysSinceMovement}d ago`}
        </span>
        {isStale && (
          <span className="flex items-center gap-1 text-[#f0d99f] ml-auto">
            <MessageCircle size={11} />
            Follow up?
          </span>
        )}
      </div>
    </div>
  );
}

export function ZoneYourPipeline({ onNavigateRoom, mockCards }: ZoneYourPipelineProps) {
  const [cards, setCards] = useState<PipelineCard[]>([]);
  const [dragOverStage, setDragOverStage] = useState<PipelineStage | null>(null);
  const [loaded, setLoaded] = useState(false);
  const draggedCardId = useRef<string | null>(null);
  const isDemo = !!mockCards;

  // Load from Supabase on mount (skip in demo mode)
  useEffect(() => {
    if (mockCards) {
      setCards(mockCards);
      setLoaded(true);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        const { data, error } = await supabase
          .from('job_applications')
          .select('id, company, title, pipeline_stage, updated_at')
          .neq('status', 'archived')
          .order('updated_at', { ascending: false });

        if (cancelled) return;
        if (!error && data) {
          setCards(data.map(toCard));
        }
        setLoaded(true);
      } catch {
        // Supabase unreachable — show empty state
        setLoaded(true);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [mockCards]);

  const handleDragStart = useCallback((_e: React.DragEvent, cardId: string) => {
    draggedCardId.current = cardId;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, stage: PipelineStage) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStage(stage);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverStage(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetStage: PipelineStage) => {
    e.preventDefault();
    setDragOverStage(null);
    const cardId = draggedCardId.current;
    if (!cardId) return;
    draggedCardId.current = null;

    // Optimistic update
    setCards((prev) =>
      prev.map((c) =>
        c.id === cardId ? { ...c, stage: targetStage, daysSinceMovement: 0, hasNewActivity: true } : c,
      ),
    );

    // Skip persistence in demo mode
    if (isDemo) return;

    // Persist to Supabase
    const dbStage = STAGE_TO_DB[targetStage];
    supabase
      .from('job_applications')
      .update({ pipeline_stage: dbStage, updated_at: new Date().toISOString() })
      .eq('id', cardId)
      .then(({ error }) => {
        if (error) {
          // Rollback on error — reload from DB
          supabase
            .from('job_applications')
            .select('id, company, title, pipeline_stage, updated_at')
            .neq('status', 'archived')
            .order('updated_at', { ascending: false })
            .then(({ data }) => {
              if (data) setCards(data.map(toCard));
            });
        }
      });
  }, []);

  const handleArchive = useCallback((cardId: string) => {
    // Optimistic remove
    setCards((prev) => prev.filter((c) => c.id !== cardId));

    // Skip persistence in demo mode
    if (isDemo) return;

    // Persist archive to Supabase
    supabase
      .from('job_applications')
      .update({ status: 'archived' })
      .eq('id', cardId)
      .then(({ error }) => {
        if (error) {
          // Rollback — reload
          supabase
            .from('job_applications')
            .select('id, company, title, pipeline_stage, updated_at')
            .neq('status', 'archived')
            .order('updated_at', { ascending: false })
            .then(({ data }) => {
              if (data) setCards(data.map(toCard));
            });
        }
      });
  }, []);

  const totalActive = cards.length;
  const inMotion = cards.filter((c) => c.daysSinceMovement <= 3).length;

  return (
    <GlassCard className="p-5 flex-1 min-w-0">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[14px] font-semibold text-white/80">Your Pipeline</h3>
        <div className="flex items-center gap-4 text-[11px] text-white/40">
          <span>{totalActive} active</span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[#b5dec2]" />
            {inMotion} in motion
          </span>
        </div>
      </div>

      {/* Empty state — shown once data has loaded and no applications exist */}
      {loaded && cards.length === 0 ? (
        <div className="text-center py-8">
          <Search size={24} className="text-white/20 mx-auto mb-3" />
          <p className="text-[13px] text-white/45 mb-1">No applications yet</p>
          <p className="text-[11px] text-white/30">
            Start from the{' '}
            <button
              type="button"
              onClick={() => onNavigateRoom?.('jobs')}
              className="text-[#98b3ff]/60 hover:text-[#98b3ff] underline underline-offset-2 transition-colors"
            >
              Job Command Center
            </button>
            {' '}to find matching roles.
          </p>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
          {PIPELINE_STAGES.map((stage) => {
            const stageCards = cards.filter((c) => c.stage === stage);
            const isDragOver = dragOverStage === stage;
            return (
              <div
                key={stage}
                className="flex-shrink-0 w-[190px]"
                onDragOver={(e) => handleDragOver(e, stage)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, stage)}
              >
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="text-[11px] font-medium text-white/50 uppercase tracking-wider">
                    {stage}
                  </span>
                  <span className="text-[10px] text-white/30 bg-white/[0.06] rounded-full px-1.5 py-0.5 tabular-nums">
                    {stageCards.length}
                  </span>
                </div>
                <div
                  className={cn(
                    'space-y-2 min-h-[120px] rounded-xl p-1.5 transition-colors duration-150',
                    isDragOver && 'bg-[#98b3ff]/[0.06] ring-1 ring-[#98b3ff]/20',
                  )}
                >
                  {stageCards.map((card) => (
                    <PipelineCardItem
                      key={card.id}
                      card={card}
                      onDragStart={handleDragStart}
                      onArchive={handleArchive}
                    />
                  ))}
                  {stageCards.length === 0 && (
                    <div className={cn(
                      'rounded-xl border border-dashed p-4 text-center transition-colors',
                      isDragOver ? 'border-[#98b3ff]/30 bg-[#98b3ff]/[0.04]' : 'border-white/[0.06]',
                    )}>
                      <span className="text-[11px] text-white/25">
                        {isDragOver ? 'Drop here' : 'No items'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}
