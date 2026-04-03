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
  Applied: 'border-t-[var(--link)]/40',
  Interviewing: 'border-t-[var(--badge-amber-text)]/40',
  Offer: 'border-t-[var(--badge-green-text)]/40',
  Accepted: 'border-t-[var(--badge-green-text)]/60',
};

interface ZoneYourPipelineProps {
  onNavigateRoom?: (room: CareerIQRoom) => void;
  /** Called when user clicks "Prepare for this interview?" on an Interviewing card. */
  onInterviewPrepClick?: (card: PipelineCard) => void;
  /** Called when user clicks "Prepare your negotiation?" on an Offer card. */
  onNegotiationPrepClick?: (card: PipelineCard) => void;
}

function CompanyInitials({ company }: { company: string }) {
  const initials = company
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="h-7 w-7 rounded-lg bg-[var(--surface-1)] flex items-center justify-center text-[12px] font-bold text-[var(--text-soft)] flex-shrink-0">
      {initials}
    </div>
  );
}

function PipelineCardItem({
  card,
  onDragStart,
  onArchive,
  onInterviewPrepClick,
  onNegotiationPrepClick,
}: {
  card: PipelineCard;
  onDragStart: (e: React.DragEvent, cardId: string) => void;
  onArchive: (cardId: string) => void;
  onInterviewPrepClick?: (card: PipelineCard) => void;
  onNegotiationPrepClick?: (card: PipelineCard) => void;
}) {
  const isStale = card.daysSinceMovement >= 7;
  const showInterviewCta = card.stage === 'Interviewing' && !!onInterviewPrepClick;
  const showNegotiationCta = card.stage === 'Offer' && !!onNegotiationPrepClick;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, card.id)}
      className={cn(
        'group rounded-xl border-t-2 border border-[var(--line-soft)] bg-[var(--accent-muted)] p-3 cursor-grab active:cursor-grabbing transition-all duration-150',
        'hover:border-[var(--line-strong)] hover:bg-[var(--accent-muted)] hover:shadow-lg hover:shadow-black/10',
        isStale && 'opacity-50 hover:opacity-80',
        card.hasNewActivity && 'border-[var(--link)]/20',
        STAGE_COLORS[card.stage],
      )}
    >
      <div className="flex items-start gap-2.5">
        <CompanyInitials company={card.company} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-medium text-[var(--text-strong)] truncate">
              {card.company}
            </span>
            {card.hasNewActivity && (
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--link)] flex-shrink-0 animate-pulse" />
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[13px] text-[var(--text-soft)] truncate">
              {card.role}
            </span>
            {card.stage === 'Interviewing' && card.interviewRound != null && (
              <span className="flex-shrink-0 rounded bg-[var(--badge-amber-text)]/15 border border-[var(--badge-amber-text)]/20 px-1.5 py-px text-[12px] font-medium text-[var(--badge-amber-text)]/80">
                {ordinal(card.interviewRound)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onArchive(card.id); }}
            className="rounded p-1 text-[var(--text-soft)] hover:text-[var(--text-soft)] hover:bg-[var(--accent-muted)]"
            title="Archive"
          >
            <Archive size={12} />
          </button>
          <div className="text-[var(--text-soft)] cursor-grab">
            <GripVertical size={12} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2.5 text-[13px] text-[var(--text-soft)]">
        <Clock size={11} />
        <span>
          {card.scheduledDate && formatScheduledDate(card.scheduledDate)
            ? formatScheduledDate(card.scheduledDate)
            : card.daysSinceMovement === 0
              ? 'Today'
              : `${card.daysSinceMovement}d ago`}
        </span>
        {isStale && (
          <span className="flex items-center gap-1 text-[var(--badge-amber-text)] ml-auto">
            <MessageCircle size={11} />
            Follow up?
          </span>
        )}
      </div>

      {/* Contextual CTA — shown only when callback is wired and stage matches */}
      {showInterviewCta && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onInterviewPrepClick?.(card); }}
          className={cn(
            'mt-2.5 w-full rounded-lg border border-[var(--badge-amber-text)]/20 bg-[var(--badge-amber-text)]/[0.04]',
            'px-2.5 py-1.5 text-[12px] font-medium text-[var(--badge-amber-text)]/70',
            'hover:border-[var(--badge-amber-text)]/35 hover:bg-[var(--badge-amber-text)]/[0.08] hover:text-[var(--badge-amber-text)] transition-colors',
            'cursor-pointer',
          )}
        >
          Prepare for this interview?
        </button>
      )}
      {showNegotiationCta && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNegotiationPrepClick?.(card); }}
          className={cn(
            'mt-2.5 w-full rounded-lg border border-[var(--badge-green-text)]/20 bg-[var(--badge-green-text)]/[0.04]',
            'px-2.5 py-1.5 text-[12px] font-medium text-[var(--badge-green-text)]/70',
            'hover:border-[var(--badge-green-text)]/35 hover:bg-[var(--badge-green-text)]/[0.08] hover:text-[var(--badge-green-text)] transition-colors',
            'cursor-pointer',
          )}
        >
          Prepare your negotiation?
        </button>
      )}
    </div>
  );
}

export function ZoneYourPipeline({ onNavigateRoom, onInterviewPrepClick, onNegotiationPrepClick }: ZoneYourPipelineProps) {
  const [cards, setCards] = useState<PipelineCard[]>([]);
  const [dragOverStage, setDragOverStage] = useState<PipelineStage | null>(null);
  const [loaded, setLoaded] = useState(false);
  const draggedCardId = useRef<string | null>(null);

  // Load from Supabase on mount.
  useEffect(() => {
    let cancelled = false;
    async function load(userIdOverride?: string | null) {
      try {
        const resolvedUserId = userIdOverride === undefined
          ? (await supabase.auth.getUser()).data.user?.id ?? null
          : userIdOverride;

        if (!resolvedUserId || cancelled) {
          if (!cancelled) {
            setCards([]);
            setLoaded(true);
          }
          return;
        }

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

    void load();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void load(session?.user?.id ?? null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

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
        <h3 className="text-[14px] font-semibold text-[var(--text-strong)]">Your Pipeline</h3>
        <div className="flex items-center gap-4 text-[13px] text-[var(--text-soft)]">
          <span>{totalActive} active</span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--badge-green-text)]" />
            {inMotion} in motion
          </span>
        </div>
      </div>

      {/* Empty state — shown once data has loaded and no applications exist */}
      {loaded && cards.length === 0 ? (
        <div className="text-center py-8">
          <Search size={24} className="text-[var(--text-soft)] mx-auto mb-3" />
          <p className="text-[13px] text-[var(--text-soft)] mb-1">No applications yet</p>
          <p className="text-[13px] text-[var(--text-soft)]">
            Start from the{' '}
            <button
              type="button"
              onClick={() => onNavigateRoom?.('jobs')}
              className="text-[var(--link)]/60 hover:text-[var(--link)] underline underline-offset-2 transition-colors"
            >
              Job Search
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
                  <span className="text-[13px] font-medium text-[var(--text-soft)] uppercase tracking-wider">
                    {stage}
                  </span>
                  <span className="text-[12px] text-[var(--text-soft)] bg-[var(--accent-muted)] rounded-full px-1.5 py-0.5 tabular-nums">
                    {stageCards.length}
                  </span>
                </div>
                <div
                  className={cn(
                    'space-y-2 min-h-[120px] rounded-xl p-1.5 transition-colors duration-150',
                    isDragOver && 'bg-[var(--link)]/[0.06] ring-1 ring-[var(--link)]/20',
                  )}
                >
                  {stageCards.map((card) => (
                    <PipelineCardItem
                      key={card.id}
                      card={card}
                      onDragStart={handleDragStart}
                      onArchive={handleArchive}
                      onInterviewPrepClick={onInterviewPrepClick}
                      onNegotiationPrepClick={onNegotiationPrepClick}
                    />
                  ))}
                  {stageCards.length === 0 && (
                    <div className={cn(
                      'rounded-xl border border-dashed p-4 text-center transition-colors',
                      isDragOver ? 'border-[var(--link)]/30 bg-[var(--link)]/[0.04]' : 'border-[var(--line-soft)]',
                    )}>
                      <span className="text-[13px] text-[var(--text-soft)]">
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
