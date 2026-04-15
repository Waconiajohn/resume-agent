/**
 * LessonRenderer
 *
 * Renders a single LMS lesson with personalized data injections.
 * Handles all five formats: number, percentage, text, list, score-badge.
 * Shows an "unavailable" card with an action link when data isn't yet generated.
 */

import { useMemo } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { cn } from '@/lib/utils';
import { ExternalLink, Lock, TrendingUp, List, Hash, AlignLeft, Award } from 'lucide-react';
import type { LessonConfig, LessonInjection, LessonSlot } from '@/types/lms';

// ─── Props ────────────────────────────────────────────────────────────────────

interface LessonRendererProps {
  lesson: LessonConfig;
  injections: LessonInjection[];
  onLaunchTool?: (agentRoom: string) => void;
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
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
          : isMid
            ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400'
            : 'border-red-500/30 bg-red-500/10 text-red-400',
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
        <span className="text-[26px] font-bold tabular-nums text-[var(--accent)]">
          {display}%
        </span>
      );
    }

    if (slot.format === 'number') {
      return (
        <span className="text-[26px] font-bold tabular-nums text-[var(--accent)]">
          {typeof value === 'number' ? value : value}
        </span>
      );
    }

    if (slot.format === 'list' && Array.isArray(value)) {
      return (
        <ul className="mt-1 space-y-1.5">
          {value.map((item, index) => (
            <li
              key={index}
              className="flex items-start gap-2 text-[14px] text-[var(--text-strong)] leading-relaxed"
            >
              <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--accent)]" />
              {item}
            </li>
          ))}
        </ul>
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
    <div className="rounded-[12px] border border-[var(--line-soft)] bg-[var(--surface-2)] p-4">
      <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.07em] text-[var(--text-soft)]">
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
  const agentRoom = injection.unavailableLink?.replace('/workspace?room=', '') ?? '';

  return (
    <div className="rounded-[12px] border border-dashed border-[var(--line-soft)] bg-[var(--accent-muted)] p-4">
      <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.07em] text-[var(--text-soft)]">
        <Lock size={12} />
        {slot.label}
      </div>
      <p className="mb-3 text-[13px] leading-relaxed text-[var(--text-muted)]">
        {injection.unavailableMessage}
      </p>
      {injection.unavailableLink && (
        <button
          type="button"
          onClick={() => onLaunchTool?.(agentRoom)}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
        >
          Go there now
          <ExternalLink size={12} />
        </button>
      )}
    </div>
  );
}

// ─── Simple markdown-ish renderer ────────────────────────────────────────────
// Supports: ## headers, **bold**, bullet lists (- ), blank lines → paragraphs.
// No external dependency needed for this level of content.

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
          <p key={key++} className="text-[15px] leading-relaxed text-[var(--text-muted)]">
            {renderInline(text)}
          </p>,
        );
      }
      paragraphBuffer = [];
    }
  };

  let listBuffer: string[] = [];

  const flushList = () => {
    if (listBuffer.length > 0) {
      nodes.push(
        <ul key={key++} className="ml-4 space-y-1.5">
          {listBuffer.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-[15px] leading-relaxed text-[var(--text-muted)]">
              <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--accent)]" />
              {renderInline(item)}
            </li>
          ))}
        </ul>,
      );
      listBuffer = [];
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
          className="mt-4 text-[18px] font-bold text-[var(--text-strong)] first:mt-0"
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
      listBuffer.push(trimmed.slice(2));
      continue;
    }

    if (trimmed.startsWith('1.') || /^\d+\. /.test(trimmed)) {
      flushParagraph();
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
  // Replace **bold** with <strong>
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

export function LessonRenderer({ lesson, injections, onLaunchTool }: LessonRendererProps) {
  const availableCount = useMemo(
    () => injections.filter((i) => i.available).length,
    [injections],
  );
  const hasSlots = lesson.slots.length > 0;

  return (
    <article className="mx-auto max-w-[780px] pb-16 pt-6">
      {/* Header */}
      <header className="mb-8">
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded-[6px] border border-[var(--line-soft)] bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            {lesson.courseTitle}
          </span>
          <span className="text-[var(--text-soft)]">·</span>
          <span className="text-[12px] text-[var(--text-soft)]">
            Lesson {lesson.lessonNumber}
          </span>
        </div>
        <h1 className="text-[26px] font-bold leading-tight text-[var(--text-strong)]">
          {lesson.title}
        </h1>
        <p className="mt-2 text-[15px] text-[var(--text-muted)]">{lesson.description}</p>
      </header>

      {/* Lesson content */}
      <GlassCard className="mb-8 space-y-4 p-6">
        {renderMarkdown(lesson.content)}
      </GlassCard>

      {/* Your Situation section */}
      {hasSlots && (
        <section aria-label="Your Situation">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[16px] font-bold text-[var(--text-strong)]">
              Your Situation
            </h2>
            {lesson.slots.length > 0 && (
              <span className="text-[12px] text-[var(--text-soft)]">
                {availableCount} of {lesson.slots.length} data points available
              </span>
            )}
          </div>

          <div className="grid gap-3">
            {lesson.slots.map((slot) => {
              const injection = findInjection(injections, slot.key);

              if (!injection) return null;

              if (injection.available) {
                return (
                  <AvailableInjection
                    key={slot.key}
                    slot={slot}
                    injection={injection}
                  />
                );
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
        </section>
      )}

      {/* Launch tool button */}
      {lesson.linkedAgent && lesson.linkedAgentLabel && (
        <div className="mt-10 flex items-center gap-3">
          <GlassButton
            variant="primary"
            size="lg"
            onClick={() => onLaunchTool?.(lesson.linkedAgent ?? '')}
          >
            <Award size={16} />
            {lesson.linkedAgentLabel}
          </GlassButton>
        </div>
      )}
    </article>
  );
}
