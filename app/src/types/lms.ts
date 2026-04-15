/**
 * LMS (Learning Management System) — Lesson injection schema
 *
 * Every lesson can declare injection slots that pull from the user's real agent data.
 * If the data is available, it renders inline. If not, it shows a prompt to run the
 * relevant agent first.
 */

export interface LessonSlot {
  key: string;
  label: string;
  agentSource:
    | 'resume-v2'
    | 'gap-analysis'
    | 'positioning'
    | 'job-finder'
    | 'job-tracker'
    | 'interview-prep'
    | 'linkedin'
    | 'linkedin-content'
    | 'networking'
    | 'salary-negotiation'
    | 'retirement-bridge'
    | 'ninety-day-plan';
  dataPath: string;
  format?: 'number' | 'percentage' | 'text' | 'list' | 'score-badge';
}

export interface KeyPoint {
  heading: string;
  text: string;
}

export interface LessonConfig {
  id: string;
  courseId: string;
  courseTitle: string;
  lessonNumber: number;
  title: string;
  description: string;
  duration?: string;
  content: string;
  coreInsight?: string;
  keyPoints?: KeyPoint[];
  videoNotes?: string[];
  slots: LessonSlot[];
  linkedAgent?: string;
  linkedAgentLabel?: string;
}

export interface LessonInjection {
  slotKey: string;
  value: string | number | string[] | null;
  available: boolean;
  unavailableMessage?: string;
  unavailableLink?: string;
  unavailableRoom?: string;
}

export type CourseProgress = Record<
  string,
  {
    completed: boolean;
    injectionsFilled: number;
    injectionsTotal: number;
  }
>;

export interface CourseConfig {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  description: string;
  lessonCount: number;
  category: 'foundation' | 'resume' | 'linkedin' | 'job-search' | 'networking' | 'interview' | 'financial';
  color: string;
  lessons: LessonConfig[];
}
