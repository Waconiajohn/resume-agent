import type { Application, PipelineStage } from '@/hooks/useApplicationPipeline';
import type { CoachSession } from '@/types/session';

export interface SessionJobRecord {
  key: string;
  company: string;
  role: string;
  createdAt: string;
  jobApplicationId: string | null;
  jobStage: string | null;
  latestSession: CoachSession;
  status: ReturnType<typeof formatStatus>;
  assets: CoachSession[];
}

export const JOB_WORKSPACE_STAGES: PipelineStage[] = [
  'saved',
  'researching',
  'applied',
  'screening',
  'interviewing',
  'offer',
  'closed_won',
  'closed_lost',
];

const WORKSPACE_PRODUCT_TYPES = new Set([
  'resume',
  'resume_v2',
  'cover_letter',
  'interview_prep',
  'thank_you_note',
  'ninety_day_plan',
  'salary_negotiation',
]);

export function isPipelineStage(value?: string | null): value is PipelineStage {
  return JOB_WORKSPACE_STAGES.includes(value as PipelineStage);
}

export function stageLabel(stage: PipelineStage): string {
  switch (stage) {
    case 'closed_won':
      return 'Accepted';
    case 'closed_lost':
      return 'Closed';
    default:
      return stage.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  }
}

export function formatJobStage(stage?: string | null): { label: string; classes: string } {
  switch (stage) {
    case 'researching':
      return { label: 'Researching', classes: 'border-[#98b3ff]/25 bg-[#98b3ff]/10 text-[#d4dfff]' };
    case 'applied':
      return { label: 'Applied', classes: 'border-[#98b3ff]/25 bg-[#98b3ff]/10 text-[#d4dfff]' };
    case 'screening':
      return { label: 'Screening', classes: 'border-[#f0d99f]/25 bg-[#f0d99f]/10 text-[#f3e4b5]' };
    case 'interviewing':
      return { label: 'Interviewing', classes: 'border-[#b5dec2]/25 bg-[#b5dec2]/10 text-[#cfe9d6]' };
    case 'offer':
      return { label: 'Offer', classes: 'border-[#b5dec2]/25 bg-[#b5dec2]/10 text-[#cfe9d6]' };
    case 'closed_won':
      return { label: 'Accepted', classes: 'border-[#b5dec2]/25 bg-[#b5dec2]/10 text-[#cfe9d6]' };
    case 'closed_lost':
      return { label: 'Closed', classes: 'border-white/[0.10] bg-white/[0.04] text-white/60' };
    case 'saved':
    default:
      return { label: 'Saved', classes: 'border-white/[0.10] bg-white/[0.04] text-white/60' };
  }
}

export function stageAwareActions(stage?: string | null): {
  unlocked: string[];
  nextActionLabel: string;
} {
  switch (stage) {
    case 'interviewing':
      return {
        unlocked: ['Interview Prep', 'Follow-up documents'],
        nextActionLabel: 'Open Interview Prep',
      };
    case 'offer':
      return {
        unlocked: ['Interview Prep', 'Negotiation Prep'],
        nextActionLabel: 'Open Interview Prep',
      };
    case 'closed_won':
      return {
        unlocked: ['Archive-worthy assets'],
        nextActionLabel: 'Reopen Job Workspace',
      };
    case 'closed_lost':
      return {
        unlocked: ['Reference-only assets'],
        nextActionLabel: 'Reopen Job Workspace',
      };
    case 'screening':
      return {
        unlocked: ['Resume Builder'],
        nextActionLabel: 'Keep this workspace lean until an interview is scheduled',
      };
    case 'researching':
    case 'applied':
    case 'saved':
    default:
      return {
        unlocked: ['Resume Builder'],
        nextActionLabel: 'Interview assets unlock when the job reaches interviewing',
      };
  }
}

export function humanizeProductType(type: string): string {
  switch (type) {
    case 'resume_v2':
    case 'resume':
      return 'Role-Specific Resume';
    case 'cover_letter':
      return 'Cover Letter';
    default:
      return type.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  }
}

export function productTypeForSession(session: CoachSession): string {
  return session.product_type ?? 'resume';
}

export function isResumeProductType(type: string): boolean {
  return type === 'resume' || type === 'resume_v2';
}

export function isWorkspaceProductType(type: string): boolean {
  return WORKSPACE_PRODUCT_TYPES.has(type);
}

export function getUniqueProductTypes(sessions: CoachSession[]): string[] {
  const types = new Set<string>();
  for (const session of sessions) {
    const type = productTypeForSession(session);
    if (isWorkspaceProductType(type)) {
      types.add(type);
    }
  }
  return Array.from(types).sort();
}

export function buildWorkspaceRoomRoute(
  room: 'interview',
  context: {
    company: string;
    role: string;
    jobApplicationId?: string | null;
  },
  options?: {
    focus?: 'prep' | 'plan' | 'thank-you' | 'negotiation';
    sessionId?: string | null;
  },
): string {
  const params = new URLSearchParams({ room });
  if (context.jobApplicationId) {
    params.set('job', context.jobApplicationId);
  }
  if (context.company) {
    params.set('company', context.company);
  }
  if (context.role) {
    params.set('role', context.role);
  }
  if (options?.focus) {
    params.set('focus', options.focus);
  }
  if (options?.sessionId) {
    params.set('session', options.sessionId);
  }
  return `/workspace?${params.toString()}`;
}

export function buildJobWorkspaceRoute(jobApplicationId: string): string {
  return `/workspace/job/${jobApplicationId}`;
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatStatus(status?: string | null): { label: string; classes: string } {
  switch (status) {
    case 'complete':
    case 'completed':
      return { label: 'Completed', classes: 'border-[#b5dec2]/25 bg-[#b5dec2]/10 text-[#cfe9d6]' };
    case 'error':
      return { label: 'Needs Review', classes: 'border-[#f0b8b8]/25 bg-[#f0b8b8]/10 text-[#f6d0d0]' };
    default:
      return { label: 'In Progress', classes: 'border-[#98b3ff]/25 bg-[#98b3ff]/10 text-[#d4dfff]' };
  }
}

function buildJobRecordKey(session: CoachSession): string {
  const fallbackKey = buildFallbackJobRecordKey(session);
  if (session.job_application_id?.trim()) {
    return `jobapp::${session.job_application_id}`;
  }
  return fallbackKey;
}

function buildFallbackJobRecordKey(session: CoachSession): string {
  const company = session.company_name?.trim().toLowerCase();
  const role = session.job_title?.trim().toLowerCase();
  if (company && role) {
    return `${company}::${role}`;
  }
  // No company/role — use session ID so unidentified sessions don't merge
  return `session::${session.id}`;
}

export function buildJobRecords(sessions: CoachSession[]): SessionJobRecord[] {
  const grouped = new Map<string, SessionJobRecord>();
  const preferredAppIdByFallbackKey = new Map<string, string>();

  for (const session of sessions) {
    const fallbackKey = buildFallbackJobRecordKey(session);
    if (session.job_application_id?.trim()) {
      preferredAppIdByFallbackKey.set(fallbackKey, session.job_application_id);
    }
  }

  for (const session of sessions) {
    const fallbackKey = buildFallbackJobRecordKey(session);
    const resolvedJobApplicationId = session.job_application_id ?? preferredAppIdByFallbackKey.get(fallbackKey) ?? null;
    const key = resolvedJobApplicationId ? `jobapp::${resolvedJobApplicationId}` : buildJobRecordKey(session);
    const existing = grouped.get(key);

    if (!existing) {
      const sessionDateLabel = new Date(session.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      grouped.set(key, {
        key,
        company: session.company_name?.trim() || `Resume session`,
        role: session.job_title?.trim() || sessionDateLabel,
        createdAt: session.created_at,
        jobApplicationId: resolvedJobApplicationId,
        jobStage: session.job_stage ?? null,
        latestSession: session,
        status: formatStatus(session.pipeline_status ?? session.pipeline_stage),
        assets: [session],
      });
      continue;
    }

    existing.assets.push(session);
    if (new Date(session.updated_at).getTime() > new Date(existing.latestSession.updated_at).getTime()) {
      existing.latestSession = session;
      existing.status = formatStatus(session.pipeline_status ?? session.pipeline_stage);
      existing.createdAt = session.created_at;
    }
    if (resolvedJobApplicationId && !existing.jobApplicationId) {
      existing.jobApplicationId = resolvedJobApplicationId;
    }
    if (session.job_stage && !existing.jobStage) {
      existing.jobStage = session.job_stage;
    }
  }

  return Array.from(grouped.values()).sort(
    (left, right) => new Date(right.latestSession.updated_at).getTime() - new Date(left.latestSession.updated_at).getTime(),
  );
}

export function assetBadgeLabel(type: string): string {
  switch (type) {
    case 'cover_letter':
      return 'Cover Letter';
    case 'resume':
    case 'resume_v2':
      return 'Resume';
    default:
      return humanizeProductType(type);
  }
}

export function resolveJobApplication(
  record: SessionJobRecord,
  applicationsById: Map<string, Application>,
): Application | undefined {
  return record.jobApplicationId ? applicationsById.get(record.jobApplicationId) : undefined;
}
