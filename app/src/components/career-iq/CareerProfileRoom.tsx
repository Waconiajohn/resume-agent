import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Brain,
  CheckCircle2,
  ChevronLeft,
  Loader2,
  Sparkles,
  Target,
} from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import type { CareerProfileSummary } from './career-profile-summary';
import type { CareerProfileV2 } from '@/types/career-profile';
import type { AssessmentQuestion, OnboardingStatus } from '@/types/onboarding';
import type { ActivityMessage } from '@/types/activity';
import { cn } from '@/lib/utils';

interface CareerProfileRoomProps {
  profile: CareerProfileV2 | null;
  summary: CareerProfileSummary;
  profileLoading: boolean;
  profileError: string | null;
  onboardingStatus: OnboardingStatus;
  questions: AssessmentQuestion[];
  activityMessages: ActivityMessage[];
  currentStage: string | null;
  onStartAssessment: () => Promise<boolean>;
  onSubmitResponses: (responses: Record<string, string>) => Promise<boolean>;
  onResetAssessment: () => void;
}

export function CareerProfileRoom({
  profile,
  summary,
  profileLoading,
  profileError,
  onboardingStatus,
  questions,
  activityMessages,
  currentStage,
  onStartAssessment,
  onSubmitResponses,
  onResetAssessment,
}: CareerProfileRoomProps) {
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (questions.length === 0) return;
    setResponses((prev) => {
      const next = { ...prev };
      for (const question of questions) {
        if (!(question.id in next)) next[question.id] = '';
      }
      return next;
    });
    setCurrentIndex(0);
  }, [questions]);

  const currentQuestion = questions[currentIndex] ?? null;
  const readyToSubmit = useMemo(
    () => questions.length > 0 && questions.every((question) => (responses[question.id] ?? '').trim().length > 0),
    [questions, responses],
  );

  const handleSubmit = async () => {
    if (!readyToSubmit || submitting) return;
    setSubmitting(true);
    try {
      await onSubmitResponses(responses);
    } finally {
      setSubmitting(false);
    }
  };

  const isRunning = onboardingStatus === 'connecting' || onboardingStatus === 'generating_questions' || onboardingStatus === 'evaluating';

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <GlassCard className="p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-[#98b3ff]/12 p-2">
                <Target size={16} className="text-[#98b3ff]" />
              </div>
              <div>
                <div className="text-[11px] font-medium uppercase tracking-widest text-[#98b3ff]/70">
                  Career Profile Strategist
                </div>
                <h1 className="mt-1 text-lg font-semibold text-white/90">One shared profile that every agent reads</h1>
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-white/55">
              This assessment sharpens your role direction, strengths, proof themes, and constraints so Resume Builder, LinkedIn, Job Search, and Interview Lab stop starting from scratch.
            </p>
          </div>

          <div className="flex w-full max-w-sm flex-col gap-2">
            <GlassButton
              variant="primary"
              onClick={() => void onStartAssessment()}
              disabled={isRunning || onboardingStatus === 'awaiting_responses'}
            >
              <Sparkles size={14} className="mr-1.5" />
              {profile ? 'Refine with AI' : 'Start Career Profile'}
            </GlassButton>
            {(onboardingStatus === 'error' || onboardingStatus === 'complete') && (
              <GlassButton variant="ghost" onClick={onResetAssessment}>
                Reset Assessment State
              </GlassButton>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <SummaryMetric label="Readiness" value={`${summary.readinessPercent}%`} detail={summary.readinessLabel} />
          <SummaryMetric label="Core Story" value={summary.primaryStory} detail={summary.strengthSnapshot} />
          <SummaryMetric label="Next Step" value={summary.nextRecommendedAction} detail={summary.statusLine} />
        </div>
      </GlassCard>

      {profileError && (
        <GlassCard className="border border-red-500/15 bg-red-500/[0.05] p-4">
          <div className="flex items-start gap-3">
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-300" />
            <div>
              <div className="text-sm font-medium text-red-200/90">Career Profile load issue</div>
              <div className="mt-1 text-xs leading-relaxed text-red-200/70">{profileError}</div>
            </div>
          </div>
        </GlassCard>
      )}

      {isRunning && (
        <GlassCard className="p-5">
          <div className="flex items-center gap-2">
            <Loader2 size={16} className="animate-spin text-[#98b3ff]" />
            <div className="text-sm font-medium text-white/78">
              {currentStage === 'evaluation' ? 'Refining your Career Profile...' : 'Generating your next best questions...'}
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {activityMessages.slice(-6).map((message) => (
              <div key={message.id} className="text-xs leading-relaxed text-white/45">
                {message.message}
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {onboardingStatus === 'awaiting_responses' && currentQuestion && (
        <GlassCard className="p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-widest text-[#98b3ff]/70">
                Guided Intake
              </div>
              <h2 className="mt-2 text-lg font-semibold text-white/88">
                Question {currentIndex + 1} of {questions.length}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-white/55">{currentQuestion.question}</p>
            </div>
            <div className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[11px] text-white/45">
              {currentQuestion.category.split('_').join(' ')}
            </div>
          </div>

          <textarea
            value={responses[currentQuestion.id] ?? ''}
            onChange={(event) => {
              const value = event.target.value;
              setResponses((prev) => ({ ...prev, [currentQuestion.id]: value }));
            }}
            placeholder="Answer in your own words. The agent is looking for proof, constraints, and the language you naturally use to describe your value."
            className={cn(
              'mt-5 min-h-[170px] w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3',
              'text-sm leading-relaxed text-white/85 placeholder:text-white/30',
              'focus:border-[#98b3ff]/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#98b3ff]/35',
            )}
          />

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
              disabled={currentIndex === 0}
              className="inline-flex items-center gap-1.5 text-sm text-white/45 transition-colors hover:text-white/70 disabled:cursor-not-allowed disabled:text-white/20"
            >
              <ChevronLeft size={16} />
              Previous
            </button>

            <div className="flex items-center gap-2">
              {currentIndex < questions.length - 1 ? (
                <GlassButton
                  variant="primary"
                  onClick={() => setCurrentIndex((index) => Math.min(questions.length - 1, index + 1))}
                >
                  Next Question
                  <ArrowRight size={14} className="ml-1.5" />
                </GlassButton>
              ) : (
                <GlassButton variant="primary" onClick={() => void handleSubmit()} disabled={!readyToSubmit || submitting}>
                  {submitting ? 'Submitting...' : 'Build Career Profile'}
                </GlassButton>
              )}
            </div>
          </div>
        </GlassCard>
      )}

      {profileLoading && !profile && !isRunning && onboardingStatus === 'idle' && (
        <GlassCard className="p-6">
          <div className="flex items-center gap-2 text-sm text-white/55">
            <Loader2 size={16} className="animate-spin text-[#98b3ff]" />
            Loading your saved Career Profile...
          </div>
        </GlassCard>
      )}

      {profile && (
        <>
          <GlassCard className="p-6">
            <div className="flex items-center gap-2">
              <Brain size={16} className="text-[#98b3ff]" />
              <h2 className="text-sm font-semibold text-white/85">What the platform currently knows about you</h2>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-4">
              {profile.completeness.sections.map((section) => (
                <div key={section.id} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-medium uppercase tracking-widest text-white/42">{section.label}</div>
                    <div className="text-[11px] text-white/35">{section.score}%</div>
                  </div>
                  <div className="mt-2 text-sm font-semibold text-white/84">
                    {section.status === 'ready' ? 'Ready' : section.status === 'partial' ? 'Partial' : 'Needs work'}
                  </div>
                  <div className="mt-2 text-xs leading-relaxed text-white/48">{section.summary}</div>
                </div>
              ))}
            </div>
          </GlassCard>

          <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
            <GlassCard className="p-6">
              <h3 className="text-sm font-semibold text-white/86">Profile backbone</h3>
              <div className="mt-4 space-y-4">
                <ProfileList
                  title="Targeting"
                  items={[
                    ...profile.targeting.target_roles.map((item) => `Target role: ${item}`),
                    ...profile.targeting.target_industries.map((item) => `Target industry: ${item}`),
                    `Seniority: ${profile.targeting.seniority}`,
                    `Transition type: ${profile.targeting.transition_type}`,
                  ]}
                />
                <ProfileList
                  title="Positioning"
                  items={[
                    ...profile.positioning.core_strengths,
                    ...profile.positioning.proof_themes,
                    ...profile.positioning.differentiators,
                  ]}
                />
                <ProfileList
                  title="Preferences and constraints"
                  items={[
                    ...profile.preferences.must_haves.map((item) => `Must-have: ${item}`),
                    ...profile.preferences.constraints.map((item) => `Constraint: ${item}`),
                    profile.preferences.compensation_direction
                      ? `Comp direction: ${profile.preferences.compensation_direction}`
                      : '',
                  ].filter(Boolean)}
                />
              </div>
            </GlassCard>

            <GlassCard className="p-6">
              <h3 className="text-sm font-semibold text-white/86">Narrative that agents can reuse</h3>
              <div className="mt-4 space-y-3">
                <NarrativeBlock label="What people come to you for" value={profile.narrative.colleagues_came_for_what} />
                <NarrativeBlock label="What you want to be known for" value={profile.narrative.known_for_what} />
                <NarrativeBlock label="Truthful edge / adjacent positioning" value={profile.narrative.why_not_me} />
              </div>

              {profile.evidence_positioning_statements.length > 0 && (
                <div className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
                  <div className="text-[11px] font-medium uppercase tracking-widest text-white/40">
                    Agent-ready positioning statements
                  </div>
                  <div className="mt-3 space-y-2">
                    {profile.evidence_positioning_statements.map((item) => (
                      <div key={item} className="flex items-start gap-2 text-sm text-white/68">
                        <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-[#b5dec2]" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </GlassCard>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
      <div className="text-[11px] font-medium uppercase tracking-widest text-white/42">{label}</div>
      <div className="mt-2 text-sm font-semibold leading-relaxed text-white/85">{value}</div>
      <div className="mt-2 text-xs leading-relaxed text-white/48">{detail}</div>
    </div>
  );
}

function ProfileList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;

  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-widest text-white/42">{title}</div>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div key={item} className="text-sm leading-relaxed text-white/66">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function NarrativeBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
      <div className="text-[11px] font-medium uppercase tracking-widest text-white/42">{label}</div>
      <div className="mt-2 text-sm leading-relaxed text-white/72">
        {value || 'Not defined yet.'}
      </div>
    </div>
  );
}
