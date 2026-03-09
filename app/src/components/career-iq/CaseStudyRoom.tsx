import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import {
  BookOpen,
  Target,
  Sparkles,
  Loader2,
  AlertCircle,
  RotateCcw,
  Copy,
  Check,
  ChevronRight,
  Minus,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useCaseStudy } from '@/hooks/useCaseStudy';
import { supabase } from '@/lib/supabase';
import { markdownToHtml } from '@/lib/markdown';

// --- Stage labels ---

const STAGE_LABELS: Record<string, string> = {
  selection: 'Selecting strongest achievements',
  drafting: 'Drafting case studies',
  quality: 'Quality & polish review',
};

// --- Activity feed ---

function ActivityFeed({
  messages,
  currentStage,
}: {
  messages: { id: string; message: string; stage?: string; timestamp: number }[];
  currentStage: string | null;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
      {messages.length === 0 ? (
        <div className="text-center py-8">
          <Loader2 size={20} className="text-white/20 mx-auto mb-2 animate-spin" />
          <p className="text-[12px] text-white/30">Connecting...</p>
        </div>
      ) : (
        messages.map((msg, i) => {
          const age = messages.length - 1 - i;
          const opacity = age === 0 ? 'text-white/70' : age <= 2 ? 'text-white/50' : age <= 5 ? 'text-white/35' : 'text-white/20';
          return (
            <div key={msg.id} className="flex items-start gap-2.5 py-0.5">
              <div className={cn('h-1.5 w-1.5 rounded-full mt-1.5 flex-shrink-0', age === 0 ? 'bg-[#57CDA4]' : 'bg-white/20')} />
              <span className={cn('text-[12px] leading-relaxed transition-colors', opacity)}>{msg.message}</span>
            </div>
          );
        })
      )}
      <div ref={bottomRef} />
    </div>
  );
}

// --- Slider component ---

function CaseStudySlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <label className="text-[12px] font-semibold text-white/50 uppercase tracking-wider">Number of Case Studies</label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChange(Math.max(1, value - 1))}
            disabled={value <= 1}
            className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-1.5 text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Minus size={12} />
          </button>
          <span className="w-8 text-center text-[16px] font-bold text-white/80">{value}</span>
          <button
            type="button"
            onClick={() => onChange(Math.min(5, value + 1))}
            disabled={value >= 5}
            className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-1.5 text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={cn(
              'flex-1 h-2 rounded-full transition-all',
              n <= value ? 'bg-[#57CDA4]/60' : 'bg-white/[0.08]',
            )}
          />
        ))}
      </div>
      <p className="text-[11px] text-white/30">
        {value === 1 ? 'One deep-dive case study' : `${value} consulting-grade case studies`}
      </p>
    </div>
  );
}

// --- Report view ---

function ReportView({
  report,
  qualityScore,
  onReset,
}: {
  report: string;
  qualityScore: number | null;
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

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-gradient-to-br from-[#57CDA4]/15 to-[#98b3ff]/10 p-2.5 border border-[#57CDA4]/20">
            <BookOpen size={18} className="text-[#57CDA4]" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white/90">Case Study Portfolio</h2>
            <p className="text-[13px] text-white/40">Consulting-grade narratives from your real achievements</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {qualityScore !== null && (
            <div className={cn(
              'text-[12px] font-semibold px-3 py-1.5 rounded-full border',
              qualityScore >= 80
                ? 'text-[#57CDA4] bg-[#57CDA4]/10 border-[#57CDA4]/20'
                : qualityScore >= 60
                ? 'text-[#f0d99f] bg-[#f0d99f]/10 border-[#f0d99f]/20'
                : 'text-[#f87171] bg-[#f87171]/10 border-[#f87171]/20',
            )}>
              Quality {qualityScore}%
            </div>
          )}
          <GlassButton variant="ghost" onClick={handleCopy} size="sm">
            {copied ? <Check size={14} className="mr-1.5 text-[#57CDA4]" /> : <Copy size={14} className="mr-1.5" />}
            {copied ? 'Copied' : 'Copy All'}
          </GlassButton>
          <GlassButton variant="ghost" onClick={onReset} size="sm">
            <RotateCcw size={14} className="mr-1.5" />
            New Case Studies
          </GlassButton>
        </div>
      </div>

      {/* Report content */}
      <GlassCard className="p-8 bg-gradient-to-br from-white/[0.04] to-white/[0.02]">
        <div
          className="prose prose-invert prose-sm max-w-none
            prose-headings:text-white/85 prose-headings:font-semibold
            prose-h1:text-lg prose-h1:border-b prose-h1:border-white/[0.08] prose-h1:pb-3 prose-h1:mb-5
            prose-h2:text-[15px] prose-h2:mt-7 prose-h2:mb-3 prose-h2:text-[#57CDA4]/90
            prose-h3:text-[14px] prose-h3:mt-5 prose-h3:mb-2 prose-h3:text-white/70
            prose-p:text-white/65 prose-p:text-[13px] prose-p:leading-relaxed prose-p:my-2
            prose-li:text-white/55 prose-li:text-[13px] prose-li:leading-relaxed
            prose-strong:text-white/80
            prose-em:text-[#f0d99f]/80
            prose-blockquote:border-[#57CDA4]/30 prose-blockquote:text-white/45 prose-blockquote:bg-[#57CDA4]/[0.03] prose-blockquote:rounded-r-lg prose-blockquote:py-1
            prose-hr:border-white/[0.06] prose-hr:my-6"
          dangerouslySetInnerHTML={{ __html: markdownToHtml(report) }}
        />
      </GlassCard>
    </div>
  );
}

// --- Main component ---

export function CaseStudyRoom() {
  const [resumeText, setResumeText] = useState('');
  const [resumeLoading, setResumeLoading] = useState(false);
  const [focusAreas, setFocusAreas] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [targetIndustry, setTargetIndustry] = useState('');
  const [maxCaseStudies, setMaxCaseStudies] = useState(3);

  const {
    status,
    report,
    qualityScore,
    activityMessages,
    error,
    currentStage,
    startPipeline,
    reset,
  } = useCaseStudy();

  // Auto-load resume
  useEffect(() => {
    let cancelled = false;
    async function loadResume() {
      setResumeLoading(true);
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
          setResumeText(data.raw_text);
        }
      } catch { /* ignore */ } finally {
        if (!cancelled) setResumeLoading(false);
      }
    }
    loadResume();
    return () => { cancelled = true; };
  }, []);

  const canSubmit = resumeText.length > 50;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    await startPipeline({
      resumeText,
      focusAreas: focusAreas.trim() || undefined,
      targetRole: targetRole.trim() || undefined,
      targetIndustry: targetIndustry.trim() || undefined,
      maxCaseStudies,
    });
  }, [canSubmit, resumeText, focusAreas, targetRole, targetIndustry, maxCaseStudies, startPipeline]);

  const handleReset = useCallback(() => {
    reset();
  }, [reset]);

  // Complete view
  if (status === 'complete' && report) {
    return (
      <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
        <ReportView report={report} qualityScore={qualityScore} onReset={handleReset} />
      </div>
    );
  }

  // Running view
  if (status === 'connecting' || status === 'running') {
    const stageOrder = ['selection', 'drafting', 'quality'];
    const currentIdx = currentStage ? stageOrder.indexOf(currentStage) : -1;

    return (
      <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-white/90">Case Study Generator</h1>
          <p className="text-[13px] text-white/40">
            Building {maxCaseStudies} consulting-grade case stud{maxCaseStudies !== 1 ? 'ies' : 'y'}...
          </p>
        </div>

        {/* Stage indicators */}
        <div className="flex items-center gap-3">
          {stageOrder.map((stage, i, arr) => {
            const stageIdx = stageOrder.indexOf(stage);
            const isDone = currentIdx > stageIdx;
            const isActive = currentStage === stage;
            return (
              <div key={stage} className="flex items-center gap-3">
                <div className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all',
                  isActive ? 'bg-[#57CDA4]/15 text-[#57CDA4] border border-[#57CDA4]/25'
                    : isDone ? 'bg-[#57CDA4]/10 text-[#57CDA4]/60 border border-[#57CDA4]/15'
                    : 'bg-white/[0.04] text-white/25 border border-white/[0.06]',
                )}>
                  {isActive && <Loader2 size={10} className="animate-spin" />}
                  {isDone && <Check size={10} />}
                  {STAGE_LABELS[stage]}
                </div>
                {i < arr.length - 1 && <ChevronRight size={12} className="text-white/15 flex-shrink-0" />}
              </div>
            );
          })}
        </div>

        {/* Activity feed */}
        <GlassCard className="p-6 bg-gradient-to-br from-white/[0.04] to-white/[0.02]">
          <div className="flex items-center gap-2 mb-5">
            <div className="rounded-lg bg-[#57CDA4]/10 p-2">
              <Loader2 size={16} className="text-[#57CDA4] animate-spin" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-white/80">
                {currentStage ? STAGE_LABELS[currentStage] ?? currentStage : 'Starting...'}
              </h3>
              <p className="text-[12px] text-white/35">Extracting your most impactful achievements</p>
            </div>
          </div>
          <ActivityFeed messages={activityMessages} currentStage={currentStage} />
        </GlassCard>

        <button
          type="button"
          onClick={handleReset}
          className="text-[12px] text-white/25 hover:text-white/45 transition-colors self-start"
        >
          Cancel
        </button>
      </div>
    );
  }

  // Error view
  if (status === 'error') {
    return (
      <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-white/90">Case Study Generator</h1>
        </div>
        <GlassCard className="p-6 border-[#f87171]/20">
          <div className="flex items-start gap-3 mb-4">
            <AlertCircle size={18} className="text-[#f87171] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] text-[#f87171] font-medium">Generation failed</p>
              <p className="text-[12px] text-white/40 mt-0.5">{error}</p>
            </div>
          </div>
          <GlassButton variant="ghost" onClick={handleReset} size="sm">
            Try Again
          </GlassButton>
        </GlassCard>
      </div>
    );
  }

  // Idle form
  return (
    <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
      {/* Room header */}
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-gradient-to-br from-[#57CDA4]/15 to-[#98b3ff]/10 p-2.5 border border-[#57CDA4]/20">
          <BookOpen size={20} className="text-[#57CDA4]" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-white/90">Case Study Generator</h1>
          <p className="text-[13px] text-white/40">Transform your achievements into consulting-grade case studies — the kind that close executive interviews</p>
        </div>
      </div>

      {/* Resume section */}
      <GlassCard className="p-6 bg-gradient-to-br from-white/[0.04] to-white/[0.02]">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={15} className="text-[#57CDA4]" />
          <h2 className="text-[14px] font-semibold text-white/75">Your Resume</h2>
        </div>

        {resumeLoading ? (
          <div className="flex items-center gap-2 text-[12px] text-white/35">
            <Loader2 size={12} className="animate-spin" />
            Loading from Resume Strategist...
          </div>
        ) : resumeText.length > 50 ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[12px] text-[#57CDA4]/70">
              <Check size={12} />
              Resume loaded — {Math.round(resumeText.length / 5)} words
            </div>
            <button
              type="button"
              onClick={() => setResumeText('')}
              className="text-[11px] text-white/25 hover:text-white/45 transition-colors"
            >
              Clear and paste manually
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[12px] text-[#f0d99f]/70 mb-1">
              <AlertCircle size={12} />
              No master resume found — paste below
            </div>
            <textarea
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              placeholder="Paste your full resume text here..."
              rows={6}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[13px] text-white/80 placeholder:text-white/25 resize-none focus:outline-none focus:border-[#57CDA4]/40 focus:ring-2 focus:ring-[#57CDA4]/10 transition-all"
            />
          </div>
        )}
      </GlassCard>

      {/* Options */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left — Focus + count */}
        <GlassCard className="p-6 bg-gradient-to-br from-white/[0.04] to-white/[0.02] flex flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 mb-2">
              <Target size={15} className="text-[#57CDA4]" />
              <h2 className="text-[14px] font-semibold text-white/75">Focus Areas <span className="text-[11px] font-normal text-white/30">optional</span></h2>
            </div>
            <label className="text-[12px] font-semibold text-white/50 uppercase tracking-wider">What to emphasize</label>
            <textarea
              value={focusAreas}
              onChange={(e) => setFocusAreas(e.target.value)}
              placeholder="e.g. Cost reduction, team leadership, digital transformation, supply chain optimization..."
              rows={3}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[13px] text-white/80 placeholder:text-white/25 resize-none focus:outline-none focus:border-[#57CDA4]/40 focus:ring-2 focus:ring-[#57CDA4]/10 transition-all"
            />
          </div>

          <CaseStudySlider value={maxCaseStudies} onChange={setMaxCaseStudies} />
        </GlassCard>

        {/* Right — Target context */}
        <GlassCard className="p-6 bg-gradient-to-br from-white/[0.04] to-white/[0.02] flex flex-col gap-5">
          <div className="flex items-center gap-2 mb-1">
            <Target size={15} className="text-[#98b3ff]" />
            <h2 className="text-[14px] font-semibold text-white/75">Target Context <span className="text-[11px] font-normal text-white/30">optional</span></h2>
          </div>
          <p className="text-[12px] text-white/35 -mt-3">Tailor the case studies for a specific role or industry</p>

          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold text-white/50 uppercase tracking-wider">Target Role</label>
            <input
              type="text"
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              placeholder="e.g. Chief Operating Officer"
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[13px] text-white/80 placeholder:text-white/25 focus:outline-none focus:border-[#98b3ff]/40 focus:ring-2 focus:ring-[#98b3ff]/10 transition-all"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold text-white/50 uppercase tracking-wider">Target Industry</label>
            <input
              type="text"
              value={targetIndustry}
              onChange={(e) => setTargetIndustry(e.target.value)}
              placeholder="e.g. Healthcare Technology"
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[13px] text-white/80 placeholder:text-white/25 focus:outline-none focus:border-[#98b3ff]/40 focus:ring-2 focus:ring-[#98b3ff]/10 transition-all"
            />
          </div>

          {/* What you'll get */}
          <div className="rounded-xl border border-[#57CDA4]/15 bg-[#57CDA4]/[0.04] p-4 mt-auto">
            <p className="text-[11px] font-semibold text-[#57CDA4]/70 uppercase tracking-wider mb-2">What you'll get</p>
            <ul className="space-y-1">
              {[
                'Situation, Task, Action, Result structure',
                'Specific metrics and quantified outcomes',
                'Strategic framing for executive audiences',
                'Ready to use in interviews and proposals',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-[11px] text-white/40">
                  <Check size={10} className="text-[#57CDA4]/60 mt-0.5 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </GlassCard>
      </div>

      {/* Submit */}
      <div className="flex items-center justify-between pt-2">
        <p className="text-[12px] text-white/30">
          Generating {maxCaseStudies} case stud{maxCaseStudies !== 1 ? 'ies' : 'y'}. Takes 1-3 minutes.
        </p>
        <GlassButton
          variant="primary"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={cn(
            'px-6 py-3 text-[14px] font-medium rounded-xl',
            'bg-gradient-to-r from-[#57CDA4]/20 to-[#98b3ff]/15 hover:from-[#57CDA4]/30 hover:to-[#98b3ff]/25',
            !canSubmit && 'opacity-40 cursor-not-allowed',
          )}
        >
          <BookOpen size={15} className="mr-2" />
          Generate Case Studies
        </GlassButton>
      </div>
    </div>
  );
}
