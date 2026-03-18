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
  const answeredItems = useMemo(
    () => questions
      .map((question) => ({
        question,
        response: responses[question.id] ?? '',
      }))
      .filter((item) => item.response.trim().length > 0),
    [questions, responses],
  );
  const currentResponse = currentQuestion ? (responses[currentQuestion.id] ?? '') : '';
  const remainingCount = Math.max(questions.length - answeredItems.length, 0);
  const liveReflection = useMemo(() => {
    if (!currentQuestion) return '';
    if (currentResponse.trim().length === 0) {
      return currentQuestion.purpose || `This answer helps the AI sharpen your ${formatCategory(currentQuestion.category)} story before it writes anything else.`;
    }

    const preview = clipText(currentResponse, 120);
    return `The AI is hearing "${preview}" and using it to strengthen your ${formatCategory(currentQuestion.category)} story across Resume Builder, LinkedIn, interview prep, and job matching.`;
  }, [currentQuestion, currentResponse]);

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
        <div className="grid gap-6 xl:grid-cols-[1.25fr_0.9fr]">
          <GlassCard className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-3xl">
                <div className="text-[11px] font-medium uppercase tracking-widest text-[#98b3ff]/70">
                  AI Career Intake
                </div>
                <h2 className="mt-2 text-lg font-semibold text-white/88">
                  One question, one confirmation, one stronger profile update
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-white/58">
                  The goal here is not to race through a form. It is to let the AI ask the next best question, reflect back what it heard, and let you confirm or refine it before the platform uses it everywhere else.
                </p>
              </div>
              <div className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-white/45">
                {formatCategory(currentQuestion.category)} · {currentIndex + 1}/{questions.length}
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-[#98b3ff]/18 bg-[#98b3ff]/[0.05] p-5">
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-[#98b3ff]/74">
                  <Brain size={13} />
                  AI strategist
                </div>
                <p className="mt-3 text-base leading-relaxed text-white/88">{currentQuestion.question}</p>
                <p className="mt-3 text-sm leading-relaxed text-white/58">
                  {currentQuestion.purpose || `This answer helps the platform understand your ${formatCategory(currentQuestion.category)} so every tool stops guessing.`}
                </p>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
                <div className="text-[11px] font-medium uppercase tracking-widest text-white/42">
                  Your answer
                </div>
                <textarea
                  value={currentResponse}
                  onChange={(event) => {
                    const value = event.target.value;
                    setResponses((prev) => ({ ...prev, [currentQuestion.id]: value }));
                  }}
                  placeholder="Answer in your own words. Include proof, constraints, scope, and the language you naturally use to describe your value."
                  className={cn(
                    'mt-3 min-h-[180px] w-full rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3',
                    'text-sm leading-relaxed text-white/85 placeholder:text-white/30',
                    'focus:border-[#98b3ff]/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#98b3ff]/35',
                  )}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <ConversationHint
                label="Answered"
                value={`${answeredItems.length}`}
                detail="Only confirmed answers should shape the shared profile."
              />
              <ConversationHint
                label="Up next"
                value={remainingCount === 0 ? 'Build profile' : `${remainingCount} more`}
                detail="The intake stays focused on the biggest missing context."
              />
              <ConversationHint
                label="What to include"
                value="Proof + scope"
                detail="Use examples, metrics, seniority, constraints, and the language you would use in real conversation."
              />
            </div>

            <div className="mt-5 rounded-2xl border border-[#98b3ff]/16 bg-[#98b3ff]/[0.05] px-4 py-4">
              <div className="text-[11px] font-medium uppercase tracking-widest text-[#98b3ff]/72">
                AI reflection before this answer is reused
              </div>
              <p className="mt-3 text-sm leading-relaxed text-white/74">{liveReflection}</p>
              <div className="mt-4 space-y-2">
                {buildInterpretationPoints(currentQuestion, currentResponse).map((point) => (
                  <div key={point} className="flex items-start gap-2 text-sm leading-6 text-white/68">
                    <CheckCircle2 size={14} className="mt-1 shrink-0 text-[#b5dec2]" />
                    <span>{point}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
                disabled={currentIndex === 0}
                className="inline-flex items-center gap-1.5 text-sm text-white/45 transition-colors hover:text-white/70 disabled:cursor-not-allowed disabled:text-white/20"
              >
                <ChevronLeft size={16} />
                Review previous answer
              </button>

              <div className="flex items-center gap-2">
                {currentIndex < questions.length - 1 ? (
                  <GlassButton
                    variant="primary"
                    onClick={() => setCurrentIndex((index) => Math.min(questions.length - 1, index + 1))}
                    disabled={currentResponse.trim().length === 0}
                  >
                    Confirm and continue
                    <ArrowRight size={14} className="ml-1.5" />
                  </GlassButton>
                ) : (
                  <GlassButton variant="primary" onClick={() => void handleSubmit()} disabled={!readyToSubmit || submitting || currentResponse.trim().length === 0}>
                    {submitting ? 'Submitting...' : 'Confirm and build Career Profile'}
                  </GlassButton>
                )}
              </div>
            </div>
          </GlassCard>

          <div className="space-y-6">
            <GlassCard className="p-6">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-[#98b3ff]" />
                <h3 className="text-sm font-semibold text-white/86">Conversation map</h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-white/54">
                This keeps the intake focused. You should always know what has already been confirmed, what the AI is asking now, and what is still missing.
              </p>

              <div className="mt-4 space-y-3">
                {questions.map((question, index) => {
                  const value = responses[question.id] ?? '';
                  const isCurrent = question.id === currentQuestion.id;
                  const isAnswered = value.trim().length > 0;
                  return (
                    <div
                      key={question.id}
                      className={cn(
                        'rounded-xl border px-3 py-3 transition-colors',
                        isCurrent
                          ? 'border-[#98b3ff]/24 bg-[#98b3ff]/[0.08]'
                          : isAnswered
                            ? 'border-[#b5dec2]/18 bg-[#b5dec2]/[0.05]'
                            : 'border-white/[0.06] bg-white/[0.025]',
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-medium text-white/75">
                          {index + 1}. {clipText(question.question, 90)}
                        </div>
                        <div className="text-[10px] uppercase tracking-[0.16em] text-white/38">
                          {isCurrent ? 'Current' : isAnswered ? 'Confirmed' : 'Queued'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </GlassCard>

            <GlassCard className="p-6">
            <div className="flex items-center gap-2">
              <Brain size={16} className="text-[#98b3ff]" />
              <h3 className="text-sm font-semibold text-white/86">Live profile preview</h3>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-white/54">
              This is the story the platform is building while you answer. You should be able to see what the AI thinks it knows before it starts writing on your behalf.
            </p>

            <div className="mt-4 space-y-3">
              <PreviewBlock label="Primary story" value={summary.primaryStory} />
              <PreviewBlock label="Strength signal" value={summary.strengthSnapshot} />
              <PreviewBlock label="Differentiation" value={summary.differentiationSnapshot} />
            </div>

            <div className="mt-5 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4">
              <div className="text-[11px] font-medium uppercase tracking-widest text-white/40">
                Readiness right now
              </div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div>
                  <div className="text-2xl font-semibold text-white/88">{summary.readinessPercent}%</div>
                  <div className="text-sm text-white/50">{summary.readinessLabel}</div>
                </div>
                <div className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[11px] text-white/45">
                  {answeredItems.length} answered
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-white/58">{summary.statusLine}</p>
            </div>

            <div className="mt-5 space-y-3">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-widest text-white/40">Strongest themes taking shape</div>
                <div className="mt-3 space-y-2">
                  {(summary.highlightPoints.length > 0 ? summary.highlightPoints : [
                    'The AI will start surfacing your proof themes here as you answer.',
                  ]).map((item) => (
                    <div key={item} className="flex items-start gap-2 text-sm text-white/68">
                      <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-[#b5dec2]" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-medium uppercase tracking-widest text-white/40">Still needs clarity</div>
                <div className="mt-3 space-y-2">
                  {(summary.focusAreas.length > 0 ? summary.focusAreas : [
                    'Once this intake is complete, the platform will use it to drive Resume Builder, LinkedIn, Interview Lab, and Job Search.',
                  ]).slice(0, 3).map((item) => (
                    <div key={item} className="rounded-xl border border-white/[0.06] bg-black/15 px-3 py-2 text-sm leading-6 text-white/60">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            </GlassCard>
          </div>
        </div>
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

function ConversationHint({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
      <div className="text-[11px] font-medium uppercase tracking-widest text-white/40">{label}</div>
      <div className="mt-2 text-sm font-semibold text-white/84">{value}</div>
      <div className="mt-2 text-xs leading-relaxed text-white/48">{detail}</div>
    </div>
  );
}

function PreviewBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
      <div className="text-[11px] font-medium uppercase tracking-widest text-white/40">{label}</div>
      <div className="mt-2 text-sm leading-relaxed text-white/72">{value}</div>
    </div>
  );
}

function buildInterpretationPoints(question: AssessmentQuestion, response: string): string[] {
  if (response.trim().length === 0) {
    return [
      `This answer will sharpen your ${formatCategory(question.category)} story before Resume Builder, LinkedIn, and Interview Lab reuse it.`,
      'Add concrete proof, scope, constraints, or language you would naturally use in a live conversation.',
    ];
  }

  return [
    `Carry forward this proof theme: "${clipText(response, 96)}"`,
    question.purpose || `Use this answer to reduce guesswork around your ${formatCategory(question.category)} profile.`,
    'If the wording still feels off, revise it now. Once confirmed, the rest of the platform will treat it as part of your shared story.',
  ];
}

function formatCategory(category: string): string {
  return category.split('_').join(' ');
}

function clipText(value: string, maxLength = 120): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}
