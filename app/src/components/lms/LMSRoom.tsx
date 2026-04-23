/**
 * LMSRoom
 *
 * Three-column learning room:
 *   Left: Course sidebar with progress rings and lesson lists
 *   Center: LessonRenderer with tab-based lesson/situation view
 *   Right: Course progress stepper and quick stats
 *
 * Design reference: CareerIQ_LMS.jsx prototype
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { LessonRenderer } from './LessonRenderer';
import { COURSE_CONFIGS } from '@/lib/lms-courses';
import { buildLessonInjections, type AgentDataSources } from '@/lib/lms-injection-mapper';
import { useCareerProfile } from '@/components/career-iq/CareerProfileContext';
import type { CareerIQRoom } from '@/components/career-iq/Sidebar';
import { resolveWorkspaceRoom, type WorkspaceRoom } from '@/components/career-iq/workspaceRoomAccess';
import type { LessonConfig, CourseConfig } from '@/types/lms';
import {
  ChevronDown,
  ChevronRight,
  BookOpen,
  CheckCircle2,
  Circle,
  GraduationCap,
} from 'lucide-react';

// ─── Props ────────────────────────────────────────────────────────────────────

interface LMSRoomProps {
  onNavigateRoom?: (room: WorkspaceRoom | CareerIQRoom) => void;
  agentDataSources?: AgentDataSources;
}

// ─── Local storage key helpers ────────────────────────────────────────────────

const VIEWED_KEY = 'lms_viewed_lessons';

function loadViewedLessons(): Set<string> {
  try {
    const raw = localStorage.getItem(VIEWED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(parsed);
  } catch {
    return new Set();
  }
}

function saveViewedLessons(viewed: Set<string>): void {
  try {
    localStorage.setItem(VIEWED_KEY, JSON.stringify([...viewed]));
  } catch {
    // Storage unavailable — silently skip
  }
}

// ─── Progress Ring ───────────────────────────────────────────────────────────

function ProgressRing({
  progress,
  size = 36,
  stroke = 3,
  color = 'var(--accent)',
  label,
  children,
}: {
  progress: number;
  size?: number;
  stroke?: number;
  color?: string;
  label?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (progress / 100) * circ;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        role="img"
        aria-label={label ?? `${progress}% complete`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="transition-all duration-700"
        />
      </svg>
      {children && (
        <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Course nav item ──────────────────────────────────────────────────────────

function CourseNavItem({
  course,
  completedCount,
  isOpen,
  isActive,
  onToggle,
  activeLessonId,
  viewedLessons,
  onSelectLesson,
}: {
  course: CourseConfig;
  completedCount: number;
  isOpen: boolean;
  isActive: boolean;
  onToggle: () => void;
  activeLessonId: string | null;
  viewedLessons: Set<string>;
  onSelectLesson: (lesson: LessonConfig) => void;
}) {
  const progress = Math.round((completedCount / course.lessonCount) * 100);

  return (
    <div className="mb-0.5">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={onToggle}
        className={cn(
          'group flex w-full items-center gap-3 rounded-[8px] px-3 py-3 text-left transition-all',
          isActive
            ? 'bg-[var(--accent)]/8'
            : 'hover:bg-[var(--surface-2)]',
        )}
        style={{
          borderLeft: isActive ? `2px solid ${course.color}` : '2px solid transparent',
        }}
      >
        <ProgressRing progress={progress} color={course.color} size={36} stroke={2.5} label={`${course.title}: ${progress}% complete`}>
          <span
            className="text-[9px] tracking-[0.05em] text-[var(--text-soft)]"
            style={{ fontFamily: 'var(--font-mono, monospace)' }}
          >
            {course.number}
          </span>
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <div className={cn(
            'truncate text-[12px] font-semibold leading-tight',
            isActive ? 'text-[var(--text-strong)]' : 'text-[var(--text-muted)]',
          )}>
            {course.title}
          </div>
          <div className="mt-0.5 text-[10px] text-[var(--text-soft)]">
            {completedCount}/{course.lessonCount} lessons
          </div>
        </div>
        {isOpen ? (
          <ChevronDown size={14} className="flex-shrink-0 text-[var(--text-soft)]" />
        ) : (
          <ChevronRight size={14} className="flex-shrink-0 text-[var(--text-soft)]" />
        )}
      </button>

      {isOpen && (
        <div className="ml-5 mt-0.5 space-y-0.5 border-l border-[var(--line-soft)] pl-5 pb-2">
          {course.lessons.map((lesson) => {
            const isLessonActive = activeLessonId === lesson.id;
            const isViewed = viewedLessons.has(lesson.id);

            return (
              <button
                key={lesson.id}
                type="button"
                aria-current={isLessonActive ? 'true' : undefined}
                onClick={() => onSelectLesson(lesson)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left transition-colors',
                  isLessonActive
                    ? 'bg-[var(--accent)]/6'
                    : 'hover:bg-[var(--surface-2)]',
                )}
              >
                <div className="w-[14px] flex-shrink-0">
                  {isViewed ? (
                    <CheckCircle2 size={13} className="text-emerald-500" />
                  ) : (
                    <Circle size={13} className={cn(
                      'text-[var(--text-soft)]',
                      isLessonActive && 'text-[var(--accent)]',
                    )} />
                  )}
                </div>
                <span className={cn(
                  'flex-1 text-[11px] leading-snug',
                  isLessonActive
                    ? 'font-medium text-[var(--accent)]'
                    : isViewed
                      ? 'text-[var(--text-muted)]'
                      : 'text-[var(--text-soft)]',
                )}>
                  {lesson.lessonNumber}. {lesson.title}
                </span>
                {lesson.duration && (
                  <span className="flex-shrink-0 text-[10px] text-[var(--text-soft)]"
                    style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                    {lesson.duration}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Right Rail — Course Progress Stepper ─────────────────────────────────────

function CourseProgressStepper({
  course,
  activeLessonId,
  viewedLessons,
}: {
  course: CourseConfig;
  activeLessonId: string | null;
  viewedLessons: Set<string>;
}) {
  return (
    <div>
      <div
        className="mb-3.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-soft)]"
        style={{ fontFamily: 'var(--font-mono, monospace)' }}
      >
        Course Progress
      </div>
      {course.lessons.map((lesson, i) => {
        const isActive = activeLessonId === lesson.id;
        const isViewed = viewedLessons.has(lesson.id);
        const isLast = i === course.lessons.length - 1;

        return (
          <div key={lesson.id} className="flex items-start gap-2.5 mb-3.5">
            <div className="flex flex-col items-center flex-shrink-0">
              <div
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-[9px] transition-all',
                  isViewed
                    ? 'border border-[var(--accent)]/40 bg-[var(--accent)]/15 text-[var(--accent)]'
                    : isActive
                      ? 'border-[1.5px] border-[var(--accent)] bg-[var(--accent)]/8 text-[var(--accent)]'
                      : 'border border-[var(--line-soft)] bg-[var(--surface-1)] text-[var(--text-soft)]',
                )}
                style={{ fontFamily: 'var(--font-mono, monospace)' }}
              >
                {isViewed ? '\u2713' : i + 1}
              </div>
              {!isLast && (
                <div
                  className={cn(
                    'mt-1 w-px',
                    isViewed ? 'bg-[var(--accent)]/20' : 'bg-[var(--line-soft)]',
                  )}
                  style={{ height: '18px' }}
                />
              )}
            </div>
            <div className="pt-0.5">
              <div className={cn(
                'text-[11px] leading-tight',
                isActive ? 'font-semibold text-[var(--text-strong)]'
                  : isViewed ? 'text-[var(--text-muted)]'
                    : 'text-[var(--text-soft)]',
              )}>
                {lesson.title}
              </div>
              {lesson.duration && (
                <div className="mt-0.5 text-[10px] text-[var(--text-soft)]"
                  style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                  {lesson.duration}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Right Rail — Quick Stats ────────────────────────────────────────────────

function QuickStats({ dataSources }: { dataSources: AgentDataSources }) {
  const stats = useMemo(() => {
    const atsScore = getNestedValue(dataSources.resumePipelineResult, 'assembly.scores.ats_match');
    const truthScore = getNestedValue(dataSources.resumePipelineResult, 'assembly.scores.truth');
    const trophyCount = getNestedValue(dataSources.resumePipelineResult, 'candidateIntelligence.quantified_outcomes');

    return [
      {
        label: 'ATS Score',
        value: typeof atsScore === 'number' ? `${Math.round(atsScore)}%` : null,
        target: '90%',
        pct: typeof atsScore === 'number' ? Math.round(atsScore) : 0,
        bad: typeof atsScore === 'number' && atsScore < 70,
      },
      {
        label: 'Trophies Found',
        value: Array.isArray(trophyCount) ? String(trophyCount.length) : null,
        target: '10+',
        pct: Array.isArray(trophyCount) ? Math.min(100, (trophyCount.length / 10) * 100) : 0,
        bad: false,
      },
      {
        label: 'Truth Score',
        value: typeof truthScore === 'number' ? `${Math.round(truthScore)}%` : null,
        target: '95%',
        pct: typeof truthScore === 'number' ? Math.round(truthScore) : 0,
        bad: typeof truthScore === 'number' && truthScore < 80,
      },
    ];
  }, [dataSources]);

  const hasAnyData = stats.some((s) => s.value !== null);
  if (!hasAnyData) return null;

  return (
    <div className="border-t border-[var(--line-soft)] pt-5">
      <div
        className="mb-3.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-soft)]"
        style={{ fontFamily: 'var(--font-mono, monospace)' }}
      >
        Your Stats
      </div>
      {stats.map((stat) => {
        if (stat.value === null) return null;
        return (
          <div key={stat.label} className="mb-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] text-[var(--text-muted)]">{stat.label}</span>
              <span
                className={cn(
                  'text-[11px] font-semibold',
                  stat.bad ? 'text-red-400' : 'text-[var(--accent)]',
                )}
                style={{ fontFamily: 'var(--font-mono, monospace)' }}
              >
                {stat.value}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-[2px] flex-1 overflow-hidden rounded-full bg-[var(--surface-3)]">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${stat.pct}%`,
                    background: stat.bad ? 'var(--color-destructive, #EF4444)' : 'var(--accent)',
                  }}
                />
              </div>
              <span className="text-[9px] text-[var(--text-soft)]"
                style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                &rarr; {stat.target}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Dot-path helper for stats
function getNestedValue(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ─── Welcome screen ───────────────────────────────────────────────────────────

function WelcomeScreen({ onSelectFirst }: { onSelectFirst: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-8">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-[16px] border border-[var(--line-soft)] bg-[var(--accent)]/8">
        <GraduationCap size={32} className="text-[var(--accent)]" />
      </div>
      <h2 className="text-[22px] font-bold text-[var(--text-strong)]">
        CareerIQ Learning
      </h2>
      <p className="mt-3 max-w-[480px] text-[14px] leading-relaxed text-[var(--text-muted)]">
        Eight courses built around your real career data. Every lesson shows your actual scores,
        gaps, and positioning — not generic advice.
      </p>
      <p className="mt-2 text-[13px] text-[var(--text-soft)]">
        Start with Course 1, or jump to the topic that matters most right now.
      </p>
      <button
        type="button"
        onClick={onSelectFirst}
        className="mt-8 inline-flex items-center gap-2 rounded-[10px] border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-5 py-3 text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/20"
      >
        <BookOpen size={16} />
        Start Learning
      </button>
    </div>
  );
}

// ─── Overall Progress Bar ────────────────────────────────────────────────────

function OverallProgress({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="px-5 py-4 border-b border-[var(--line-soft)]">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-soft)]"
          style={{ fontFamily: 'var(--font-mono, monospace)' }}>
          Overall Progress
        </span>
        <span className="text-[11px] font-semibold text-[var(--accent)]"
          style={{ fontFamily: 'var(--font-mono, monospace)' }}>
          {pct}%
        </span>
      </div>
      <div className="flex items-center gap-2.5">
        <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-[var(--surface-3)]">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[10px] text-[var(--text-soft)]"
          style={{ fontFamily: 'var(--font-mono, monospace)' }}>
          {completed}/{total}
        </span>
      </div>
    </div>
  );
}

// ─── LMSRoom ─────────────────────────────────────────────────────────────────

export function LMSRoom({ onNavigateRoom, agentDataSources = {} }: LMSRoomProps) {
  const { profile } = useCareerProfile();
  const [activeLesson, setActiveLesson] = useState<LessonConfig | null>(null);
  const [openCourseId, setOpenCourseId] = useState<string | null>('course-1');
  const [viewedLessons, setViewedLessons] = useState<Set<string>>(() => loadViewedLessons());

  // Merge positioning profile from context if not explicitly passed
  const mergedDataSources = useMemo<AgentDataSources>(() => ({
    positioningProfile: profile,
    ...agentDataSources,
  }), [profile, agentDataSources]);

  // Find the active course
  const activeCourse = useMemo(
    () => COURSE_CONFIGS.find((c) => c.id === activeLesson?.courseId) ?? null,
    [activeLesson],
  );

  // Find next lesson
  const nextLesson = useMemo(() => {
    if (!activeLesson || !activeCourse) return null;
    const idx = activeCourse.lessons.findIndex((l) => l.id === activeLesson.id);
    if (idx >= 0 && idx < activeCourse.lessons.length - 1) {
      return activeCourse.lessons[idx + 1];
    }
    // If last lesson of course, try first lesson of next course
    const courseIdx = COURSE_CONFIGS.findIndex((c) => c.id === activeCourse.id);
    if (courseIdx >= 0 && courseIdx < COURSE_CONFIGS.length - 1) {
      return COURSE_CONFIGS[courseIdx + 1].lessons[0] ?? null;
    }
    return null;
  }, [activeLesson, activeCourse]);

  // Mark lesson as viewed when selected
  const handleSelectLesson = useCallback((lesson: LessonConfig) => {
    setActiveLesson(lesson);
    setViewedLessons((prev) => {
      if (prev.has(lesson.id)) return prev;
      const next = new Set(prev);
      next.add(lesson.id);
      saveViewedLessons(next);
      return next;
    });
  }, []);

  const handleToggleCourse = useCallback((courseId: string) => {
    setOpenCourseId((prev) => (prev === courseId ? null : courseId));
  }, []);

  const handleSelectFirst = useCallback(() => {
    const firstLesson = COURSE_CONFIGS[0]?.lessons[0];
    if (firstLesson) {
      setOpenCourseId('course-1');
      handleSelectLesson(firstLesson);
    }
  }, [handleSelectLesson]);

  // Persist open state when active lesson changes
  useEffect(() => {
    if (activeLesson) {
      setOpenCourseId(activeLesson.courseId);
    }
  }, [activeLesson]);

  const injections = useMemo(() => {
    if (!activeLesson) return [];
    return buildLessonInjections(activeLesson, mergedDataSources);
  }, [activeLesson, mergedDataSources]);

  const completedPerCourse = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const course of COURSE_CONFIGS) {
      counts[course.id] = course.lessons.filter((l) => viewedLessons.has(l.id)).length;
    }
    return counts;
  }, [viewedLessons]);

  const totalLessons = COURSE_CONFIGS.reduce((a, c) => a + c.lessonCount, 0);
  const totalCompleted = Object.values(completedPerCourse).reduce((a, c) => a + c, 0);

  // Bridge: LessonRenderer passes a raw string from lesson configs;
  // resolve it to a valid WorkspaceRoom before forwarding to parent.
  const handleLaunchTool = useCallback((room: string) => {
    const resolved: WorkspaceRoom | CareerIQRoom = resolveWorkspaceRoom(room);
    onNavigateRoom?.(resolved);
  }, [onNavigateRoom]);

  return (
    <div className="flex h-full min-h-0">
      {/* ── LEFT SIDEBAR ── */}
      <aside className="w-[280px] flex-shrink-0 overflow-hidden border-r border-[var(--line-soft)] bg-[var(--surface-0)] flex flex-col">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-[var(--line-soft)]">
          <div className="flex items-center gap-2 text-[14px] font-bold">
            <GraduationCap size={18} className="text-[var(--accent)]" />
            <span className="text-[var(--text-strong)]">Masterclass</span>
          </div>
        </div>

        {/* Overall Progress */}
        <OverallProgress completed={totalCompleted} total={totalLessons} />

        {/* Course List */}
        <div className="flex-1 overflow-y-auto px-2 py-3">
          {COURSE_CONFIGS.map((course) => (
            <CourseNavItem
              key={course.id}
              course={course}
              completedCount={completedPerCourse[course.id] ?? 0}
              isOpen={openCourseId === course.id}
              isActive={activeLesson?.courseId === course.id}
              onToggle={() => handleToggleCourse(course.id)}
              activeLessonId={activeLesson?.id ?? null}
              viewedLessons={viewedLessons}
              onSelectLesson={handleSelectLesson}
            />
          ))}
        </div>
      </aside>

      {/* ── CENTER — LESSON CONTENT ── */}
      <main className="flex-1 overflow-y-auto px-10 py-8">
        {activeLesson ? (
          <LessonRenderer
            key={activeLesson.id}
            lesson={activeLesson}
            injections={injections}
            onLaunchTool={handleLaunchTool}
            nextLesson={nextLesson}
            onSelectLesson={handleSelectLesson}
          />
        ) : (
          <WelcomeScreen onSelectFirst={handleSelectFirst} />
        )}
      </main>

      {/* ── RIGHT RAIL ── */}
      {activeLesson && activeCourse && (
        <aside className="hidden xl:flex w-[240px] flex-shrink-0 flex-col gap-6 overflow-y-auto border-l border-[var(--line-soft)] bg-[var(--surface-0)] px-5 py-8">
          <CourseProgressStepper
            course={activeCourse}
            activeLessonId={activeLesson.id}
            viewedLessons={viewedLessons}
          />
          <QuickStats dataSources={mergedDataSources} />
        </aside>
      )}
    </div>
  );
}
