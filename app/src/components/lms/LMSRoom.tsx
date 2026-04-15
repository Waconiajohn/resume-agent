/**
 * LMSRoom
 *
 * The learning room. Sidebar lists courses and lessons; main panel renders
 * the selected lesson with personalized injections built from available agent data.
 * Lesson completion is tracked in localStorage.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/GlassCard';
import { LessonRenderer } from './LessonRenderer';
import { COURSE_CONFIGS } from '@/lib/lms-courses';
import { buildLessonInjections, type AgentDataSources } from '@/lib/lms-injection-mapper';
import { useCareerProfile } from '@/components/career-iq/CareerProfileContext';
import type { CareerIQRoom } from '@/components/career-iq/Sidebar';
import { resolveWorkspaceRoom, type WorkspaceRoom } from '@/components/career-iq/workspaceRoomAccess';
import type { LessonConfig } from '@/types/lms';
import {
  ChevronRight,
  ChevronDown,
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

// ─── Category label ───────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  foundation: 'Foundation',
  resume: 'Resume',
  linkedin: 'LinkedIn',
  'job-search': 'Job Search',
  networking: 'Networking',
  interview: 'Interview',
  financial: 'Financial',
};

// ─── Course nav item ──────────────────────────────────────────────────────────

function CourseNavItem({
  courseId,
  title,
  lessonCount,
  completedCount,
  isOpen,
  isActive,
  onToggle,
  lessons,
  activeLessonId,
  viewedLessons,
  onSelectLesson,
}: {
  courseId: string;
  title: string;
  lessonCount: number;
  completedCount: number;
  isOpen: boolean;
  isActive: boolean;
  onToggle: () => void;
  lessons: LessonConfig[];
  activeLessonId: string | null;
  viewedLessons: Set<string>;
  onSelectLesson: (lesson: LessonConfig) => void;
}) {
  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'group flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left transition-colors',
          isActive
            ? 'bg-[var(--rail-tab-active-bg)] text-[var(--text-strong)]'
            : 'text-[var(--text-muted)] hover:bg-[var(--rail-tab-hover-bg)] hover:text-[var(--text-strong)]',
        )}
      >
        <div className="flex-1 min-w-0">
          <div className="truncate text-[13px] font-semibold">{title}</div>
          <div className="mt-0.5 text-[11px] text-[var(--text-soft)]">
            {completedCount}/{lessonCount} viewed
          </div>
        </div>
        {isOpen ? (
          <ChevronDown size={14} className="flex-shrink-0 text-[var(--text-soft)]" />
        ) : (
          <ChevronRight size={14} className="flex-shrink-0 text-[var(--text-soft)]" />
        )}
      </button>

      {isOpen && (
        <div className="ml-3 mt-0.5 space-y-0.5 border-l border-[var(--line-soft)] pl-3">
          {lessons.map((lesson) => {
            const isLessonActive = activeLessonId === lesson.id;
            const isViewed = viewedLessons.has(lesson.id);

            return (
              <button
                key={lesson.id}
                type="button"
                onClick={() => onSelectLesson(lesson)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[13px] transition-colors',
                  isLessonActive
                    ? 'bg-[var(--rail-tab-active-bg)] font-semibold text-[var(--text-strong)]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--rail-tab-hover-bg)] hover:text-[var(--text-strong)]',
                )}
              >
                {isViewed ? (
                  <CheckCircle2 size={14} className="flex-shrink-0 text-emerald-500" />
                ) : (
                  <Circle size={14} className="flex-shrink-0 text-[var(--text-soft)]" />
                )}
                <span className="line-clamp-2 leading-snug">
                  {lesson.lessonNumber}. {lesson.title}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Welcome screen ───────────────────────────────────────────────────────────

function WelcomeScreen({ onSelectFirst }: { onSelectFirst: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-8">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-[16px] border border-[var(--line-soft)] bg-[var(--accent-muted)]">
        <GraduationCap size={32} className="text-[var(--accent)]" />
      </div>
      <h2 className="text-[22px] font-bold text-[var(--text-strong)]">
        CareerIQ Learning
      </h2>
      <p className="mt-3 max-w-[480px] text-[15px] leading-relaxed text-[var(--text-muted)]">
        Eight courses built around your real career data. Every lesson shows your actual scores,
        gaps, and positioning — not generic advice.
      </p>
      <p className="mt-2 text-[14px] text-[var(--text-soft)]">
        Start with Course 1, or jump to the topic that matters most right now.
      </p>
      <button
        type="button"
        onClick={onSelectFirst}
        className="mt-8 inline-flex items-center gap-2 rounded-[12px] border border-[var(--line-strong)] bg-[var(--accent-strong)] px-5 py-2.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent-muted)] hover:text-[var(--text-strong)]"
      >
        <BookOpen size={16} />
        Start Learning
      </button>
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

  // Bridge: LessonRenderer passes a raw string from lesson configs;
  // resolve it to a valid WorkspaceRoom before forwarding to parent.
  const handleLaunchTool = useCallback((room: string) => {
    const resolved: WorkspaceRoom | CareerIQRoom = resolveWorkspaceRoom(room);
    onNavigateRoom?.(resolved);
  }, [onNavigateRoom]);

  return (
    <div className="flex h-full min-h-0">
      {/* Sidebar */}
      <aside className="w-[280px] flex-shrink-0 overflow-y-auto border-r border-[var(--line-soft)] px-3 py-5">
        <div className="mb-4 px-3">
          <h2 className="flex items-center gap-2 text-[14px] font-bold uppercase tracking-[0.07em] text-[var(--text-strong)]">
            <BookOpen size={16} className="text-[var(--accent)]" />
            Courses
          </h2>
        </div>

        {COURSE_CONFIGS.map((course) => {
          const isOpen = openCourseId === course.id;
          const isActive = activeLesson?.courseId === course.id;
          const completed = completedPerCourse[course.id] ?? 0;
          const categoryLabel = CATEGORY_LABELS[course.category] ?? course.category;

          return (
            <div key={course.id} className="mb-3">
              <div className="mb-1 px-3">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                  {categoryLabel}
                </span>
              </div>
              <CourseNavItem
                courseId={course.id}
                title={course.title}
                lessonCount={course.lessonCount}
                completedCount={completed}
                isOpen={isOpen}
                isActive={isActive}
                onToggle={() => handleToggleCourse(course.id)}
                lessons={course.lessons}
                activeLessonId={activeLesson?.id ?? null}
                viewedLessons={viewedLessons}
                onSelectLesson={handleSelectLesson}
              />
            </div>
          );
        })}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto px-8 py-6">
        {activeLesson ? (
          <LessonRenderer
            lesson={activeLesson}
            injections={injections}
            onLaunchTool={handleLaunchTool}
          />
        ) : (
          <GlassCard className="h-full">
            <WelcomeScreen onSelectFirst={handleSelectFirst} />
          </GlassCard>
        )}
      </main>
    </div>
  );
}
