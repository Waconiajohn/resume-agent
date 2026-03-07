import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import {
  Map,
  Building2,
  Briefcase,
  Users,
  Target,
  Loader2,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Check,
  Sparkles,
  Calendar,
  UserCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useNinetyDayPlan } from '@/hooks/useNinetyDayPlan';
import { supabase } from '@/lib/supabase';
import { markdownToHtml } from '@/lib/markdown';

// --- Phase badges ---

const PHASES = [
  { days: 'Days 1–30', label: 'Listen & Learn', color: 'text-[#98b3ff] bg-[#98b3ff]/10 border-[#98b3ff]/20' },
  { days: 'Days 31–60', label: 'Align & Plan', color: 'text-[#57CDA4] bg-[#57CDA4]/10 border-[#57CDA4]/20' },
  { days: 'Days 61–90', label: 'Execute & Win', color: 'text-[#dfc797] bg-[#dfc797]/10 border-[#dfc797]/20' },
];

// --- Activity feed ---

function ActivityFeed({
  activityMessages,
  currentStage,
  targetRole,
  targetCompany,
}: {
  activityMessages: { id: string; text: string; stage: string; timestamp: number }[];
  currentStage: string | null;
  targetRole: string;
  targetCompany: string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activityMessages.length]);

  const stageLabel =
    currentStage === 'research'
      ? 'Researching the role and company'
      : currentStage === 'planning'
      ? 'Building your 90-day plan'
      : currentStage === 'stakeholders'
      ? 'Mapping key stakeholders'
      : currentStage
      ? currentStage
      : 'Starting...';

  const displayName = targetRole && targetCompany
    ? `${targetRole} at ${targetCompany}`
    : targetRole || targetCompany || 'your new role';

  return (
    <GlassCard className="p-8 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-72 h-72 rounded-full bg-[#98b3ff]/[0.04] blur-3xl pointer-events-none" />

      <div className="flex items-center gap-4 mb-8">
        <div className="relative">
          <div className="rounded-xl bg-[#98b3ff]/10 p-3">
            <Map size={20} className="text-[#98b3ff]" />
          </div>
          <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-[#57CDA4]/20 border-2 border-[#57CDA4]/40 flex items-center justify-center">
            <Loader2 size={8} className="text-[#57CDA4] animate-spin" />
          </div>
        </div>
        <div>
          <h3 className="text-[17px] font-semibold text-white/90">Building your 90-day plan</h3>
          <p className="text-[13px] text-white/40 mt-0.5">
            {stageLabel} — {displayName}
          </p>
        </div>
      </div>

      {/* Phase preview pills */}
      <div className="flex gap-3 mb-6">
        {PHASES.map((phase) => (
          <div
            key={phase.days}
            className={cn('flex-1 rounded-xl border px-3 py-2 text-center', phase.color)}
          >
            <div className="text-[11px] font-semibold">{phase.days}</div>
            <div className="text-[10px] opacity-70 mt-0.5">{phase.label}</div>
          </div>
        ))}
      </div>

      <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
        {activityMessages.length === 0 ? (
          <div className="text-center py-10">
            <Loader2 size={24} className="text-white/20 mx-auto mb-3 animate-spin" />
            <p className="text-[13px] text-white/30">Connecting to pipeline...</p>
          </div>
        ) : (
          activityMessages.map((msg, i) => {
            const opacity = Math.max(0.3, 1 - (activityMessages.length - 1 - i) * 0.08);
            return (
              <div
                key={msg.id}
                className="flex items-start gap-3 py-1.5"
                style={{ opacity }}
              >
                <div className="h-1.5 w-1.5 rounded-full bg-[#98b3ff]/50 mt-2 flex-shrink-0" />
                <span className="text-[13px] text-white/60 leading-relaxed">{msg.text}</span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </GlassCard>
  );
}

// --- Report view ---

function ReportView({
  report,
  qualityScore,
  targetRole,
  targetCompany,
  onReset,
}: {
  report: string;
  qualityScore: number | null;
  targetRole: string;
  targetCompany: string;
  onReset: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }, [report]);

  const scoreColor =
    qualityScore !== null && qualityScore >= 80
      ? 'text-[#57CDA4] bg-[#57CDA4]/10 border-[#57CDA4]/20'
      : qualityScore !== null && qualityScore >= 60
      ? 'text-[#dfc797] bg-[#dfc797]/10 border-[#dfc797]/20'
      : 'text-[#f87171] bg-[#f87171]/10 border-[#f87171]/20';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1.5 text-[13px] text-white/40 hover:text-white/70 transition-colors"
        >
          <ArrowLeft size={14} />
          Build another plan
        </button>
        <div className="flex-1" />
        {qualityScore !== null && (
          <div className={cn('text-[12px] font-semibold px-3 py-1 rounded-full border', scoreColor)}>
            Quality {qualityScore}%
          </div>
        )}
        <GlassButton variant="ghost" onClick={handleCopy} className="text-[12px]">
          {copied ? <Check size={13} className="mr-1.5 text-[#57CDA4]" /> : <Copy size={13} className="mr-1.5" />}
          {copied ? 'Copied!' : 'Copy Plan'}
        </GlassButton>
      </div>

      {/* Phase overview */}
      <div className="grid grid-cols-3 gap-3">
        {PHASES.map((phase) => (
          <div
            key={phase.days}
            className={cn(
              'rounded-2xl border px-4 py-3 text-center',
              phase.color,
            )}
          >
            <div className="text-[13px] font-semibold">{phase.days}</div>
            <div className="text-[12px] opacity-75 mt-0.5">{phase.label}</div>
          </div>
        ))}
      </div>

      {/* Report card */}
      <GlassCard className="p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 rounded-full bg-[#98b3ff]/[0.03] blur-3xl pointer-events-none" />

        <div className="flex items-center gap-4 mb-8">
          <div className="rounded-xl bg-[#98b3ff]/10 p-3">
            <Map size={20} className="text-[#98b3ff]" />
          </div>
          <div>
            <h2 className="text-[17px] font-semibold text-white/90">90-Day Success Plan</h2>
            <p className="text-[13px] text-white/40 mt-0.5">
              {targetRole}{targetCompany ? ` — ${targetCompany}` : ''}
            </p>
          </div>
        </div>

        <div
          className="prose prose-invert prose-sm max-w-none
            prose-headings:text-white/85 prose-headings:font-semibold
            prose-h1:text-[18px] prose-h1:border-b prose-h1:border-white/[0.08] prose-h1:pb-3 prose-h1:mb-5
            prose-h2:text-[15px] prose-h2:mt-8 prose-h2:mb-3
            prose-h3:text-[14px] prose-h3:mt-5 prose-h3:mb-2
            prose-p:text-white/60 prose-p:text-[13px] prose-p:leading-relaxed
            prose-li:text-white/55 prose-li:text-[13px] prose-li:leading-relaxed
            prose-strong:text-white/75
            prose-em:text-white/50
            prose-blockquote:border-[#98b3ff]/30 prose-blockquote:text-white/45 prose-blockquote:italic
            prose-hr:border-white/[0.08]"
          dangerouslySetInnerHTML={{ __html: markdownToHtml(report) }}
        />
      </GlassCard>
    </div>
  );
}

// --- Field label component ---

function FieldLabel({ label, required, optional }: { label: string; required?: boolean; optional?: boolean }) {
  return (
    <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
      {label}
      {required && <span className="text-[#98b3ff]/60 ml-1">*</span>}
      {optional && <span className="text-white/20 normal-case font-normal ml-1">(optional)</span>}
    </label>
  );
}

const INPUT_CLASS =
  'w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white/80 placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-[#98b3ff]/20 focus:border-[#98b3ff]/30 transition-colors';

// --- Main component ---

export function NinetyDayPlanRoom() {
  const [targetRole, setTargetRole] = useState('');
  const [targetCompany, setTargetCompany] = useState('');
  const [targetIndustry, setTargetIndustry] = useState('');
  const [reportingTo, setReportingTo] = useState('');
  const [teamSize, setTeamSize] = useState('');
  const [loadingResume, setLoadingResume] = useState(false);
  const [resumeLoaded, setResumeLoaded] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const resumeRef = useRef<string>('');
  const [manualResumeText, setManualResumeText] = useState('');

  const {
    status,
    report,
    qualityScore,
    activityMessages,
    error,
    currentStage,
    startPipeline,
    reset,
  } = useNinetyDayPlan();

  // Auto-load resume on mount
  useEffect(() => {
    let cancelled = false;
    async function loadResume() {
      setLoadingResume(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const { data } = await supabase
          .from('master_resumes')
          .select('raw_text')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .single();
        if (!cancelled && data?.raw_text) {
          resumeRef.current = data.raw_text;
          setResumeLoaded(true);
        }
      } catch { /* ignore */ } finally {
        if (!cancelled) setLoadingResume(false);
      }
    }
    void loadResume();
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = useCallback(async () => {
    setFormError(null);

    if (!targetRole.trim()) { setFormError('Role title is required.'); return; }
    if (!targetCompany.trim()) { setFormError('Company name is required.'); return; }
    const resolvedResume = resumeRef.current || manualResumeText.trim();
    if (!resolvedResume) {
      setFormError('Resume text is required. Paste your resume below or complete the Resume Strategist to auto-load it.');
      return;
    }

    await startPipeline({
      resumeText: resolvedResume,
      targetRole: targetRole.trim(),
      targetCompany: targetCompany.trim(),
      targetIndustry: targetIndustry.trim() || undefined,
      reportingTo: reportingTo.trim() || undefined,
      teamSize: teamSize.trim() || undefined,
    });
  }, [targetRole, targetCompany, targetIndustry, reportingTo, teamSize, manualResumeText, startPipeline]);

  const handleReset = useCallback(() => {
    reset();
    setFormError(null);
    setResumeLoaded(false);
  }, [reset]);

  // Complete → report
  if (status === 'complete' && report) {
    return (
      <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
        <ReportView
          report={report}
          qualityScore={qualityScore}
          targetRole={targetRole}
          targetCompany={targetCompany}
          onReset={handleReset}
        />
      </div>
    );
  }

  // Running
  if (status === 'connecting' || status === 'running') {
    return (
      <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
        <div>
          <h1 className="text-xl font-semibold text-white/90">90-Day Plan Generator</h1>
          <p className="text-[13px] text-white/40 mt-1">Building your stakeholder map and phased success plan</p>
        </div>
        <ActivityFeed
          activityMessages={activityMessages}
          currentStage={currentStage}
          targetRole={targetRole}
          targetCompany={targetCompany}
        />
        <div className="flex justify-start">
          <button
            type="button"
            onClick={handleReset}
            className="text-[12px] text-white/30 hover:text-white/50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Error state
  if (status === 'error' && error) {
    return (
      <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
        <GlassCard className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle size={18} className="text-[#f87171]" />
            <span className="text-[13px] text-[#f87171]">{error}</span>
          </div>
          <GlassButton variant="ghost" onClick={handleReset} className="text-[12px]">
            <ArrowLeft size={14} className="mr-1.5" />
            Try again
          </GlassButton>
        </GlassCard>
      </div>
    );
  }

  // Idle form
  return (
    <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
      {/* Header */}
      <div className="flex gap-3">
        <div className="rounded-xl bg-[#98b3ff]/10 p-2.5 self-start shrink-0">
          <Map size={20} className="text-[#98b3ff]" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-white/90">90-Day Plan Generator</h1>
          <p className="text-[13px] text-white/40 leading-relaxed mt-1">
            Generate a tailored 90-day success plan with stakeholder map, quick wins, and phased milestones for your new role.
          </p>
        </div>
      </div>

      {/* Phase overview */}
      <div className="grid grid-cols-3 gap-3">
        {PHASES.map((phase) => (
          <div
            key={phase.days}
            className={cn(
              'rounded-2xl border px-4 py-3 text-center',
              phase.color,
            )}
          >
            <div className="text-[13px] font-semibold">{phase.days}</div>
            <div className="text-[12px] opacity-70 mt-0.5">{phase.label}</div>
          </div>
        ))}
      </div>

      {/* Resume status */}
      <div className={cn(
        'flex items-center gap-2 text-[12px]',
        loadingResume ? 'text-white/30' : resumeLoaded ? 'text-[#57CDA4]/70' : 'text-[#dfc797]/70',
      )}>
        {loadingResume ? (
          <><Loader2 size={12} className="animate-spin" /> Loading resume from your profile...</>
        ) : resumeLoaded ? (
          <><CheckCircle2 size={12} /> Resume loaded — plan will be tailored to your background</>
        ) : (
          <><AlertCircle size={12} /> No resume found — paste below or complete the Resume Strategist to auto-load</>
        )}
      </div>

      {/* Resume fallback textarea */}
      {!loadingResume && !resumeLoaded && (
        <textarea
          value={manualResumeText}
          onChange={(e) => setManualResumeText(e.target.value)}
          placeholder="Paste your resume text here..."
          rows={5}
          className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white/80 placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-[#98b3ff]/20 focus:border-[#98b3ff]/30 transition-colors resize-none leading-relaxed"
        />
      )}

      {/* Section 1: Role details */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Briefcase size={16} className="text-[#98b3ff]" />
          <h2 className="text-[15px] font-semibold text-white/80">Role Details</h2>
          <div className="flex-1 h-px bg-white/[0.06]" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel label="Role Title" required />
            <input
              type="text"
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              placeholder="e.g. VP of Supply Chain Operations"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <FieldLabel label="Company" required />
            <input
              type="text"
              value={targetCompany}
              onChange={(e) => setTargetCompany(e.target.value)}
              placeholder="e.g. Medtronic"
              className={INPUT_CLASS}
            />
          </div>
        </div>

        <div>
          <FieldLabel label="Target Industry" optional />
          <input
            type="text"
            value={targetIndustry}
            onChange={(e) => setTargetIndustry(e.target.value)}
            placeholder="e.g. Medical Devices / Healthcare"
            className={INPUT_CLASS}
          />
        </div>
      </div>

      {/* Section 2: Reporting structure */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <UserCheck size={16} className="text-[#57CDA4]" />
          <h2 className="text-[15px] font-semibold text-white/80">Reporting Structure</h2>
          <div className="flex-1 h-px bg-white/[0.06]" />
          <span className="text-[11px] text-white/25">optional — improves stakeholder map</span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel label="Reporting To" optional />
            <input
              type="text"
              value={reportingTo}
              onChange={(e) => setReportingTo(e.target.value)}
              placeholder="e.g. Chief Operations Officer"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <FieldLabel label="Team Size" optional />
            <input
              type="text"
              value={teamSize}
              onChange={(e) => setTeamSize(e.target.value)}
              placeholder="e.g. 25 direct / 200 org"
              className={INPUT_CLASS}
            />
          </div>
        </div>
      </div>

      {/* What you'll get */}
      <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-white/[0.01] px-5 py-4">
        <p className="text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-3">What you will get</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: Users, text: 'Stakeholder map with engagement priorities', color: 'text-[#A396E2]' },
            { icon: Target, text: 'Quick wins for the first 30 days', color: 'text-[#57CDA4]' },
            { icon: Calendar, text: 'Three-phase milestone roadmap', color: 'text-[#98b3ff]' },
            { icon: Building2, text: 'Culture and relationship-building tactics', color: 'text-[#dfc797]' },
          ].map(({ icon: Icon, text, color }) => (
            <div key={text} className="flex items-start gap-2">
              <Icon size={13} className={cn(color, 'mt-0.5 flex-shrink-0')} />
              <span className="text-[12px] text-white/40 leading-relaxed">{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Error */}
      {formError && (
        <div className="flex items-center gap-2 text-[13px] text-[#f87171] bg-[#f87171]/5 border border-[#f87171]/15 rounded-xl px-4 py-3">
          <AlertCircle size={14} className="flex-shrink-0" />
          {formError}
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-white/25">
          Plan will be tailored to your background and the specific role context.
        </p>
        <GlassButton
          variant="primary"
          onClick={handleSubmit}
          className="text-[14px] px-6 py-3 gap-2"
        >
          <Sparkles size={15} />
          Generate Plan
        </GlassButton>
      </div>
    </div>
  );
}
