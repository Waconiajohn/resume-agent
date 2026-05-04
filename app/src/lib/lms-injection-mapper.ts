/**
 * LMS Injection Mapper
 *
 * Takes the user's available agent data and maps it to lesson injection values.
 * For each slot in a lesson, looks up the `dataPath` in the corresponding `agentSource`.
 * If the data is present: returns { available: true, value }.
 * If absent: returns { available: false, unavailableMessage, unavailableLink }.
 */

import type { LessonConfig, LessonInjection, LessonSlot } from '@/types/lms';
import type { CareerProfileV2 } from '@/types/career-profile';
import type { V2PipelineData } from '@/types/resume-v2';

// ─── Data source shape ────────────────────────────────────────────────────────

export interface AgentDataSources {
  resumePipelineResult?: V2PipelineData | null;
  positioningProfile?: CareerProfileV2 | null;
  masterResume?: Record<string, unknown> | null;
  jobFinderResults?: Record<string, unknown> | null;
  jobTrackerResults?: Record<string, unknown> | null;
  linkedInProfile?: Record<string, unknown> | null;
  interviewPrepResult?: Record<string, unknown> | null;
  networkingResults?: Record<string, unknown> | null;
  retirementBridgeResult?: Record<string, unknown> | null;
  evidenceLibrary?: Array<{ text: string; source: string }> | null;
}

// ─── Unavailable copy per agent source ───────────────────────────────────────

const UNAVAILABLE_CONFIG: Record<
  LessonSlot['agentSource'],
  { message: string; link: string }
> = {
  'resume-v2': {
    message: 'Run your resume through the builder first to see your real data here.',
    link: '/workspace?room=resume',
  },
  'gap-analysis': {
    message: 'Run a resume session to generate your gap analysis.',
    link: '/workspace?room=resume',
  },
  positioning: {
    message: 'Complete your Career Vault to unlock your positioning data.',
    link: '/workspace?room=career-profile',
  },
  'job-finder': {
    message: 'Open Job Command Center to start tracking opportunities.',
    link: '/workspace?room=jobs',
  },
  'interview-prep': {
    message: 'Run Interview Prep to unlock this data.',
    link: '/workspace?room=interview',
  },
  linkedin: {
    message: 'Run the LinkedIn Optimizer to analyze your profile.',
    link: '/workspace?room=linkedin',
  },
  networking: {
    message: 'Import your LinkedIn connections to unlock this data.',
    link: '/workspace?room=networking',
  },
  'master-resume': {
    message: 'Upload your master resume to unlock this data.',
    link: '/workspace?room=resume',
  },
  'job-tracker': {
    message: 'Start tracking job applications to unlock this data.',
    link: '/workspace?room=jobs',
  },
  'linkedin-content': {
    message: 'Create LinkedIn content to unlock this data.',
    link: '/workspace?room=linkedin',
  },
  'salary-negotiation': {
    message: 'Run Salary Negotiation prep to unlock this data.',
    link: '/workspace?room=interview',
  },
  'retirement-bridge': {
    message: 'Complete your Retirement Bridge assessment to unlock this data.',
    link: '/workspace?room=financial',
  },
  'ninety-day-plan': {
    message: 'Build your 90-Day Plan to unlock this data.',
    link: '/workspace?room=interview',
  },
};

// ─── Dot-path resolver ────────────────────────────────────────────────────────

function resolvePath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

// ─── Source resolver — maps agentSource to the data object ───────────────────

function resolveSource(
  agentSource: LessonSlot['agentSource'],
  dataSources: AgentDataSources,
): unknown {
  switch (agentSource) {
    case 'resume-v2':
      return dataSources.resumePipelineResult ?? null;

    case 'gap-analysis':
      // Gap analysis lives inside the resume pipeline result
      return dataSources.resumePipelineResult ?? null;

    case 'positioning':
      return dataSources.positioningProfile ?? null;

    case 'master-resume':
      return dataSources.masterResume ?? null;

    case 'job-finder':
      return dataSources.jobFinderResults ?? null;

    case 'interview-prep':
      return dataSources.interviewPrepResult ?? null;

    case 'linkedin':
      return dataSources.linkedInProfile ?? null;

    case 'networking':
      return dataSources.networkingResults ?? null;

    case 'job-tracker':
      return dataSources.jobTrackerResults ?? null;

    case 'linkedin-content':
      return dataSources.linkedInProfile ?? null;

    case 'salary-negotiation':
      return dataSources.interviewPrepResult ?? null;

    case 'retirement-bridge':
      return dataSources.retirementBridgeResult ?? null;

    case 'ninety-day-plan':
      return dataSources.interviewPrepResult ?? null;

    default:
      return null;
  }
}

// ─── Value coercion — ensure returned values match LessonInjection.value type

function coerceValue(raw: unknown, format: LessonSlot['format']): string | number | string[] | null {
  if (raw === null || raw === undefined) return null;

  if (format === 'list') {
    if (Array.isArray(raw)) {
      return raw.map((item) => {
        if (typeof item === 'string') return item;
        if (typeof item === 'object' && item !== null) {
          // Handle objects — pick a sensible string representation
          const obj = item as Record<string, unknown>;
          return String(
            obj.text ?? obj.outcome ?? obj.description ?? obj.requirement ?? obj.finding ?? JSON.stringify(obj),
          );
        }
        return String(item);
      }).filter(Boolean).slice(0, 8);
    }
    if (typeof raw === 'string') return [raw];
    return null;
  }

  if (format === 'number') {
    if (typeof raw === 'number') return raw;
    if (Array.isArray(raw)) return raw.length;
    if (typeof raw === 'string') {
      const n = parseFloat(raw);
      return isNaN(n) ? null : n;
    }
    return null;
  }

  if (format === 'percentage') {
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string') {
      const n = parseFloat(raw);
      return isNaN(n) ? null : n;
    }
    return null;
  }

  if (format === 'score-badge') {
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string') {
      const n = parseFloat(raw);
      return isNaN(n) ? null : n;
    }
    return null;
  }

  // Default: text
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number') return raw;
  if (Array.isArray(raw)) return raw.map(String).join(', ');
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    return String(obj.content ?? obj.text ?? obj.summary ?? obj.description ?? JSON.stringify(obj));
  }
  return String(raw);
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function buildLessonInjections(
  lesson: LessonConfig,
  dataSources: AgentDataSources,
): LessonInjection[] {
  return lesson.slots.map((slot): LessonInjection => {
    const source = resolveSource(slot.agentSource, dataSources);
    const unavailableCfg = UNAVAILABLE_CONFIG[slot.agentSource];

    if (source === null || source === undefined) {
      return {
        slotKey: slot.key,
        value: null,
        available: false,
        unavailableMessage: unavailableCfg.message,
        unavailableLink: unavailableCfg.link,
        unavailableRoom: unavailableCfg.link.replace('/workspace?room=', ''),
      };
    }

    const raw = resolvePath(source, slot.dataPath);

    if (raw === null || raw === undefined) {
      return {
        slotKey: slot.key,
        value: null,
        available: false,
        unavailableMessage: unavailableCfg.message,
        unavailableLink: unavailableCfg.link,
        unavailableRoom: unavailableCfg.link.replace('/workspace?room=', ''),
      };
    }

    const value = coerceValue(raw, slot.format);

    if (value === null) {
      return {
        slotKey: slot.key,
        value: null,
        available: false,
        unavailableMessage: unavailableCfg.message,
        unavailableLink: unavailableCfg.link,
        unavailableRoom: unavailableCfg.link.replace('/workspace?room=', ''),
      };
    }

    // Empty arrays/strings are not available
    if (Array.isArray(value) && value.length === 0) {
      return {
        slotKey: slot.key,
        value: null,
        available: false,
        unavailableMessage: unavailableCfg.message,
        unavailableLink: unavailableCfg.link,
        unavailableRoom: unavailableCfg.link.replace('/workspace?room=', ''),
      };
    }

    if (typeof value === 'string' && value.trim().length === 0) {
      return {
        slotKey: slot.key,
        value: null,
        available: false,
        unavailableMessage: unavailableCfg.message,
        unavailableLink: unavailableCfg.link,
        unavailableRoom: unavailableCfg.link.replace('/workspace?room=', ''),
      };
    }

    return {
      slotKey: slot.key,
      value,
      available: true,
    };
  });
}

// ─── Progress helpers ────────────────────────────────────────────────────────

export function countAvailableInjections(injections: LessonInjection[]): number {
  return injections.filter((i) => i.available).length;
}
