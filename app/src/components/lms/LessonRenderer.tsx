/**
 * LessonRenderer
 *
 * Renders a single LMS lesson with a two-tab layout:
 *   - Lesson tab: core insight, key points, markdown content, next lesson
 *   - Your Situation tab: personalized injection cards from agent data
 *
 * Design reference: CareerIQ_LMS.jsx prototype
 */

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  ExternalLink,
  Lock,
  TrendingUp,
  List,
  Hash,
  AlignLeft,
  Award,
  ChevronDown,
  ChevronRight,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import type { LessonConfig, LessonInjection, LessonSlot } from '@/types/lms';

// ─── Props ────────────────────────────────────────────────────────────────────

interface LessonRendererProps {
  lesson: LessonConfig;
  injections: LessonInjection[];
  onLaunchTool?: (agentRoom: string) => void;
  nextLesson?: LessonConfig | null;
  onSelectLesson?: (lesson: LessonConfig) => void;
}

// ─── Score Badge sub-component ────────────────────────────────────────────────

function ScoreBadge({ value }: { value: number }) {
  const pct = Math.round(value > 1 ? value : value * 100);
  const isHigh = pct >= 70;
  const isMid = pct >= 40 && pct < 70;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-[10px] border px-4 py-2',
        isHigh
          ? 'border-[var(--badge-green-text)]/30 bg-[var(--badge-green-bg)] text-[var(--badge-green-text)]'
          : isMid
            ? 'border-[var(--badge-amber-text)]/30 bg-[var(--badge-amber-bg)] text-[var(--badge-amber-text)]'
            : 'border-[var(--badge-red-text)]/30 bg-[var(--badge-red-bg)] text-[var(--badge-red-text)]',
      )}
    >
      <TrendingUp size={16} />
      <span className="text-[22px] font-bold tabular-nums">{pct}</span>
      <span className="text-[13px] font-medium opacity-80">/ 100</span>
    </div>
  );
}

// ─── Format icon ──────────────────────────────────────────────────────────────

function FormatIcon({ format }: { format: LessonSlot['format'] }) {
  switch (format) {
    case 'number':
      return <Hash size={14} />;
    case 'percentage':
    case 'score-badge':
      return <TrendingUp size={14} />;
    case 'list':
      return <List size={14} />;
    default:
      return <AlignLeft size={14} />;
  }
}

// ─── Injection card — available ───────────────────────────────────────────────

function AvailableInjection({ slot, injection }: { slot: LessonSlot; injection: LessonInjection }) {
  const { value } = injection;

  const renderValue = () => {
    if (value === null) return null;

    if (slot.format === 'score-badge') {
      return <ScoreBadge value={typeof value === 'number' ? value : parseFloat(String(value))} />;
    }

    if (slot.format === 'percentage') {
      const pct = typeof value === 'number' ? value : parseFloat(String(value));
      const display = pct <= 1 ? Math.round(pct * 100) : Math.round(pct);
      return (
        <div className="flex items-center gap-3">
          <span className="text-[28px] font-extrabold tabular-nums text-[var(--accent)]"
            style={{ fontFamily: 'var(--font-mono, monospace)' }}>
            {display}%
          </span>
          <div className="flex-1">
            <div className="h-[3px] rounded-full bg-[var(--surface-3)]">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.min(display, 100)}%`,
                  background: display >= 70 ? 'var(--accent)' : display >= 40 ? 'var(--color-warning, #EAB308)' : 'var(--color-destructive, #EF4444)',
                }}
              />
            </div>
          </div>
        </div>
      );
    }

    if (slot.format === 'number') {
      return (
        <span className="text-[28px] font-extrabold tabular-nums text-[var(--accent)]"
          style={{ fontFamily: 'var(--font-mono, monospace)' }}>
          {value}
        </span>
      );
    }

    if (slot.format === 'list' && Array.isArray(value)) {
      return (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {value.map((item, index) => (
            <span
              key={index}
              className="inline-block rounded-full border border-[var(--line-soft)] bg-[var(--surface-2)] px-3 py-1 text-[12px] text-[var(--text-muted)]"
            >
              {item}
            </span>
          ))}
        </div>
      );
    }

    // Text
    return (
      <p className="text-[14px] leading-relaxed text-[var(--text-strong)]">
        {String(value)}
      </p>
    );
  };

  return (
    <div className="rounded-[8px] border border-[var(--line-soft)] bg-[var(--surface-1)] p-4">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-soft)]"
        style={{ fontFamily: 'var(--font-mono, monospace)' }}>
        <FormatIcon format={slot.format} />
        {slot.label}
      </div>
      {renderValue()}
    </div>
  );
}

// ─── Injection card — unavailable ─────────────────────────────────────────────

function UnavailableInjection({
  slot,
  injection,
  onLaunchTool,
}: {
  slot: LessonSlot;
  injection: LessonInjection;
  onLaunchTool?: (agentRoom: string) => void;
}) {
  const agentRoom = injection.unavailableRoom ?? injection.unavailableLink?.replace('/workspace?room=', '') ?? '';

  return (
    <div className="rounded-[8px] border border-dashed border-[var(--line-soft)] bg-[var(--surface-1)] p-4">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-soft)]"
        style={{ fontFamily: 'var(--font-mono, monospace)' }}>
        <Lock size={12} />
        {slot.label}
      </div>
      <p className="mb-3 text-[12px] leading-relaxed text-[var(--text-muted)]">
        {injection.unavailableMessage}
      </p>
      {injection.unavailableLink && (
        <button
          type="button"
          onClick={() => onLaunchTool?.(agentRoom)}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
        >
          Run to unlock
          <ExternalLink size={12} />
        </button>
      )}
    </div>
  );
}

// ─── Core Insight badge ──────────────────────────────────────────────────────

function CoreInsightBadge({ text }: { text: string }) {
  return (
    <div className="mb-7 rounded-[8px] border border-[var(--accent)]/20 bg-gradient-to-br from-[var(--accent)]/8 to-[var(--accent)]/3 p-5"
      style={{ borderLeftWidth: '3px', borderLeftColor: 'var(--accent)' }}>
      <div className="mb-2 flex items-center gap-2">
        <Sparkles size={14} className="text-[var(--accent)]" />
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--accent)]"
          style={{ fontFamily: 'var(--font-mono, monospace)' }}>
          Core Insight
        </span>
      </div>
      <p className="text-[14px] italic leading-relaxed text-[var(--text-strong)]">
        &ldquo;{text}&rdquo;
      </p>
    </div>
  );
}

// ─── Key Point card ──────────────────────────────────────────────────────────

function KeyPointCard({ heading, text }: { heading: string; text: string }) {
  return (
    <div className="mb-2.5 rounded-[8px] border border-[var(--line-soft)] bg-[var(--surface-1)] p-5">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--accent)]"
        style={{ fontFamily: 'var(--font-mono, monospace)' }}>
        {heading}
      </div>
      <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">{text}</p>
    </div>
  );
}

// ─── Simple markdown-ish renderer ────────────────────────────────────────────

function renderMarkdown(content: string): React.ReactNode {
  const lines = content.split('\n');
  const nodes: React.ReactNode[] = [];
  let key = 0;
  let paragraphBuffer: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length > 0) {
      const text = paragraphBuffer.join(' ').trim();
      if (text) {
        nodes.push(
          <p key={key++} className="text-[14px] leading-relaxed text-[var(--text-muted)]">
            {renderInline(text)}
          </p>,
        );
      }
      paragraphBuffer = [];
    }
  };

  let listBuffer: string[] = [];
  let listType: 'ul' | 'ol' = 'ul';

  const flushList = () => {
    if (listBuffer.length > 0) {
      if (listType === 'ol') {
        nodes.push(
          <ol key={key++} className="ml-4 list-decimal space-y-1.5">
            {listBuffer.map((item, i) => (
              <li key={i} className="pl-1 text-[14px] leading-relaxed text-[var(--text-muted)]">
                {renderInline(item)}
              </li>
            ))}
          </ol>,
        );
      } else {
        nodes.push(
          <ul key={key++} className="ml-4 space-y-1.5">
            {listBuffer.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-[14px] leading-relaxed text-[var(--text-muted)]">
                <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--accent)]" />
                {renderInline(item)}
              </li>
            ))}
          </ul>,
        );
      }
      listBuffer = [];
      listType = 'ul'; // reset default
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('## ')) {
      flushParagraph();
      flushList();
      nodes.push(
        <h2
          key={key++}
          className="mt-4 text-[17px] font-bold text-[var(--text-strong)] first:mt-0"
        >
          {trimmed.slice(3)}
        </h2>,
      );
      continue;
    }

    if (trimmed.startsWith('**') && trimmed.endsWith('**') && trimmed.length > 4) {
      flushList();
      paragraphBuffer.push(trimmed);
      continue;
    }

    if (trimmed.startsWith('- ')) {
      flushParagraph();
      if (listType !== 'ul' && listBuffer.length > 0) flushList();
      listType = 'ul';
      listBuffer.push(trimmed.slice(2));
      continue;
    }

    if (/^\d+\. /.test(trimmed)) {
      flushParagraph();
      if (listType !== 'ol' && listBuffer.length > 0) flushList();
      listType = 'ol';
      listBuffer.push(trimmed.replace(/^\d+\.\s*/, ''));
      continue;
    }

    if (trimmed === '') {
      flushParagraph();
      flushList();
      continue;
    }

    flushList();
    paragraphBuffer.push(trimmed);
  }

  flushParagraph();
  flushList();

  return nodes;
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length === 1) return text;

  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-[var(--text-strong)]">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

// ─── Injection lookup helper ──────────────────────────────────────────────────

function findInjection(injections: LessonInjection[], key: string): LessonInjection | undefined {
  return injections.find((i) => i.slotKey === key);
}

// ─── LessonRenderer ──────────────────────────────────────────────────────────

export function LessonRenderer({
  lesson,
  injections,
  onLaunchTool,
  nextLesson,
  onSelectLesson,
}: LessonRendererProps) {
  const [activeTab, setActiveTab] = useState<'lesson' | 'situation'>('lesson');
  const [situationOpen, setSituationOpen] = useState(true);

  const availableCount = useMemo(
    () => injections.filter((i) => i.available).length,
    [injections],
  );
  const hasSlots = lesson.slots.length > 0;

  return (
    <article className="mx-auto max-w-[720px] pb-16 pt-2">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2 text-[11px]"
        style={{ fontFamily: 'var(--font-mono, monospace)' }}>
        <span className="text-[var(--text-soft)]">{lesson.courseTitle}</span>
        <span className="text-[var(--line-strong)]">&rsaquo;</span>
        <span className="text-[var(--accent)]">Lesson {lesson.lessonNumber}</span>
      </div>

      {/* Title */}
      <header className="mb-8">
        <h1 className="text-[26px] font-bold leading-tight text-[var(--text-strong)]">
          {lesson.title}
        </h1>
        <div className="mt-3 flex items-center gap-3">
          {lesson.duration && (
            <>
              <span className="text-[11px] text-[var(--text-soft)]"
                style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                {lesson.duration}
              </span>
              <span className="h-1 w-1 rounded-full bg-[var(--line-strong)]" />
            </>
          )}
          <span className="text-[12px] text-[var(--text-muted)]">{lesson.description}</span>
        </div>
      </header>

      {/* Tab Toggle */}
      {hasSlots && (
        <div role="tablist" className="mb-7 flex w-fit rounded-[10px] border border-[var(--line-soft)] bg-[var(--surface-1)] p-1">
          <button
            id="tab-lesson"
            type="button"
            role="tab"
            aria-selected={activeTab === 'lesson'}
            onClick={() => setActiveTab('lesson')}
            className={cn(
              'rounded-[8px] px-5 py-2 text-[12px] font-medium transition-all',
              activeTab === 'lesson'
                ? 'bg-[var(--surface-3)] text-[var(--text-strong)] shadow-sm'
                : 'text-[var(--text-soft)] hover:text-[var(--text-muted)]',
            )}
          >
            Lesson
          </button>
          <button
            id="tab-situation"
            type="button"
            role="tab"
            aria-selected={activeTab === 'situation'}
            onClick={() => setActiveTab('situation')}
            className={cn(
              'rounded-[8px] px-5 py-2 text-[12px] font-medium transition-all',
              activeTab === 'situation'
                ? 'bg-[var(--surface-3)] text-[var(--text-strong)] shadow-sm'
                : 'text-[var(--text-soft)] hover:text-[var(--text-muted)]',
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              Your Situation
              {availableCount > 0 && (
                <span className="rounded-full bg-[var(--accent)]/15 px-1.5 py-px text-[10px] font-semibold leading-4 text-[var(--accent)]">
                  Live
                </span>
              )}
            </span>
          </button>
        </div>
      )}

      {/* ─── Lesson Tab ─── */}
      {activeTab === 'lesson' && (
        <div role="tabpanel" aria-labelledby="tab-lesson" className="animate-in fade-in duration-200">
          {/* Core Insight */}
          {lesson.coreInsight && (
            <CoreInsightBadge text={lesson.coreInsight} />
          )}

          {/* Key Points */}
          {lesson.keyPoints && lesson.keyPoints.length > 0 && (
            <div className="mb-8">
              <h3 className="mb-3.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-soft)]"
                style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                Key Points
              </h3>
              {lesson.keyPoints.map((pt, i) => (
                <KeyPointCard key={i} heading={pt.heading} text={pt.text} />
              ))}
            </div>
          )}

          {/* Full content */}
          <div className="mb-8 space-y-4">
            {renderMarkdown(lesson.content)}
          </div>

          {/* Next Lesson */}
          {nextLesson && (
            <button
              type="button"
              onClick={() => onSelectLesson?.(nextLesson)}
              className="mb-10 flex w-full items-center justify-between rounded-[10px] border border-[var(--line-soft)] bg-[var(--surface-1)] p-5 text-left transition-colors hover:border-[var(--accent)]/30"
            >
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-soft)]"
                  style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                  Next Lesson
                </div>
                <div className="text-[14px] font-medium text-[var(--text-muted)]">
                  {nextLesson.title}
                </div>
              </div>
              <ArrowRight size={16} className="flex-shrink-0 text-[var(--accent)]" />
            </button>
          )}
        </div>
      )}

      {/* ─── Your Situation Tab ─── */}
      {activeTab === 'situation' && hasSlots && (
        <div role="tabpanel" aria-labelledby="tab-situation" className="animate-in fade-in duration-200">
          <p className="mb-4 text-[13px] leading-relaxed text-[var(--text-soft)]">
            This lesson applied to your current resume, target role, and career data.
          </p>

          {/* Collapsible situation panel */}
          <div className="rounded-[10px] border border-[var(--line-soft)] bg-[var(--surface-1)] overflow-hidden">
            <button
              type="button"
              aria-expanded={situationOpen}
              onClick={() => setSituationOpen(!situationOpen)}
              className="flex w-full items-center justify-between p-5 text-left"
            >
              <div className="flex items-center gap-2.5">
                <Sparkles size={14} className="text-[var(--accent)]" />
                <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--accent)]"
                  style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                  Your Situation
                </span>
                <span className="text-[11px] text-[var(--text-soft)]">
                  {availableCount}/{lesson.slots.length} data points
                </span>
              </div>
              {situationOpen ? (
                <ChevronDown size={14} className="text-[var(--text-soft)]" />
              ) : (
                <ChevronRight size={14} className="text-[var(--text-soft)]" />
              )}
            </button>

            {situationOpen && (
              <div className="border-t border-[var(--line-soft)] p-5">
                <div className="grid gap-3">
                  {lesson.slots.map((slot) => {
                    const injection = findInjection(injections, slot.key);
                    if (!injection) return null;

                    if (injection.available) {
                      return <AvailableInjection key={slot.key} slot={slot} injection={injection} />;
                    }
                    return (
                      <UnavailableInjection
                        key={slot.key}
                        slot={slot}
                        injection={injection}
                        onLaunchTool={onLaunchTool}
                      />
                    );
                  })}
                </div>

                {/* Launch tool CTA */}
                {lesson.linkedAgent && lesson.linkedAgentLabel && (
                  <button
                    type="button"
                    onClick={() => onLaunchTool?.(lesson.linkedAgent ?? '')}
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-[8px] border border-[var(--accent)]/30 bg-gradient-to-r from-[var(--accent)]/15 to-[var(--accent)]/8 px-5 py-3 text-[12px] font-bold uppercase tracking-[0.05em] text-[var(--accent)] transition-colors hover:from-[var(--accent)]/25 hover:to-[var(--accent)]/12"
                  >
                    <Award size={16} />
                    {lesson.linkedAgentLabel}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom Launch Tool — shown on lesson tab when no situation tab exists */}
      {!hasSlots && lesson.linkedAgent && lesson.linkedAgentLabel && (
        <div className="mt-10 flex items-center gap-3">
          <button
            type="button"
            onClick={() => onLaunchTool?.(lesson.linkedAgent ?? '')}
            className="inline-flex items-center gap-2 rounded-[10px] border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-5 py-3 text-[13px] font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/20"
          >
            <Award size={16} />
            {lesson.linkedAgentLabel}
          </button>
        </div>
      )}
    </article>
  );
}
