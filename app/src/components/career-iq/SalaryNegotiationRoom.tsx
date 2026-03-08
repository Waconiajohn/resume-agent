import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import {
  DollarSign,
  TrendingUp,
  Briefcase,
  Loader2,
  AlertCircle,
  ArrowLeft,
  RotateCcw,
  Copy,
  Check,
  ChevronRight,
  Target,
  Shield,
  Swords,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useSalaryNegotiation } from '@/hooks/useSalaryNegotiation';
import { supabase } from '@/lib/supabase';
import { markdownToHtml } from '@/lib/markdown';
import { CounterOfferView } from '@/components/career-iq/CounterOfferView';

// --- Stage label map ---

const STAGE_LABELS: Record<string, string> = {
  research: 'Researching market rates',
  strategy: 'Designing strategy',
  scenarios: 'Building negotiation scenarios',
  quality: 'Quality review',
};

// --- Activity feed ---

function ActivityFeed({
  messages,
  currentStage,
}: {
  messages: { id: string; text: string; stage: string; timestamp: number }[];
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
              <div className={cn('h-1.5 w-1.5 rounded-full mt-1.5 flex-shrink-0', age === 0 ? 'bg-[#98b3ff]' : 'bg-white/20')} />
              <span className={cn('text-[12px] leading-relaxed transition-colors', opacity)}>{msg.text}</span>
            </div>
          );
        })
      )}
      <div ref={bottomRef} />
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
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-gradient-to-br from-[#98b3ff]/15 to-[#A396E2]/10 p-2.5 border border-[#98b3ff]/20">
            <TrendingUp size={18} className="text-[#98b3ff]" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white/90">Negotiation Playbook</h2>
            <p className="text-[13px] text-white/40">Your personalized salary negotiation strategy</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {qualityScore !== null && (
            <div className={cn(
              'text-[12px] font-semibold px-3 py-1.5 rounded-full border',
              qualityScore >= 80
                ? 'text-[#57CDA4] bg-[#57CDA4]/10 border-[#57CDA4]/20'
                : qualityScore >= 60
                ? 'text-[#dfc797] bg-[#dfc797]/10 border-[#dfc797]/20'
                : 'text-[#f87171] bg-[#f87171]/10 border-[#f87171]/20',
            )}>
              Quality {qualityScore}%
            </div>
          )}
          <GlassButton variant="ghost" onClick={handleCopy} className="text-[13px] px-3 py-2">
            {copied ? <Check size={14} className="mr-1.5 text-[#57CDA4]" /> : <Copy size={14} className="mr-1.5" />}
            {copied ? 'Copied' : 'Copy'}
          </GlassButton>
          <GlassButton variant="ghost" onClick={onReset} className="text-[13px] px-3 py-2">
            <RotateCcw size={14} className="mr-1.5" />
            New Analysis
          </GlassButton>
        </div>
      </div>

      {/* Report content */}
      <GlassCard className="p-8 bg-gradient-to-br from-white/[0.04] to-white/[0.02]">
        <div
          className="prose prose-invert prose-sm max-w-none
            prose-headings:text-white/85 prose-headings:font-semibold
            prose-h1:text-lg prose-h1:border-b prose-h1:border-white/[0.08] prose-h1:pb-3 prose-h1:mb-5
            prose-h2:text-[15px] prose-h2:mt-7 prose-h2:mb-3 prose-h2:text-[#98b3ff]/90
            prose-h3:text-[14px] prose-h3:mt-5 prose-h3:mb-2 prose-h3:text-white/70
            prose-p:text-white/60 prose-p:text-[13px] prose-p:leading-relaxed prose-p:my-2
            prose-li:text-white/55 prose-li:text-[13px] prose-li:leading-relaxed
            prose-strong:text-white/80
            prose-em:text-[#dfc797]/80
            prose-blockquote:border-[#98b3ff]/30 prose-blockquote:text-white/45 prose-blockquote:bg-[#98b3ff]/[0.03] prose-blockquote:rounded-r-lg prose-blockquote:py-1
            prose-hr:border-white/[0.06] prose-hr:my-6"
          dangerouslySetInnerHTML={{ __html: markdownToHtml(report) }}
        />
      </GlassCard>
    </div>
  );
}

// --- Idle form ---

interface FormState {
  offerCompany: string;
  offerRole: string;
  offerBaseSalary: string;
  offerTotalComp: string;
  offerEquityDetails: string;
  offerOtherDetails: string;
  currentBaseSalary: string;
  currentTotalComp: string;
  currentEquity: string;
  targetRole: string;
  targetIndustry: string;
}

const DEFAULT_FORM: FormState = {
  offerCompany: '',
  offerRole: '',
  offerBaseSalary: '',
  offerTotalComp: '',
  offerEquityDetails: '',
  offerOtherDetails: '',
  currentBaseSalary: '',
  currentTotalComp: '',
  currentEquity: '',
  targetRole: '',
  targetIndustry: '',
};

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  prefix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  prefix?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] font-semibold text-white/50 uppercase tracking-wider">{label}</label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[13px] text-white/30">{prefix}</span>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            'w-full rounded-xl border border-white/[0.08] bg-white/[0.03] py-3 text-[13px] text-white/80 placeholder:text-white/25',
            'focus:outline-none focus:border-[#98b3ff]/40 focus:ring-2 focus:ring-[#98b3ff]/10 transition-all',
            prefix ? 'pl-7 pr-4' : 'px-4',
          )}
        />
      </div>
    </div>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 2,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] font-semibold text-white/50 uppercase tracking-wider">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[13px] text-white/80 placeholder:text-white/25 resize-none focus:outline-none focus:border-[#98b3ff]/40 focus:ring-2 focus:ring-[#98b3ff]/10 transition-all"
      />
    </div>
  );
}

// --- Counter-offer sim config ---

type CounterOfferMode = 'full' | 'single_round';

interface CounterOfferConfig {
  mode: CounterOfferMode;
  roundType?: string;
}

// --- Main component ---

export function SalaryNegotiationRoom() {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [resumeText, setResumeText] = useState('');
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [counterOfferConfig, setCounterOfferConfig] = useState<CounterOfferConfig | null>(null);

  const {
    status,
    report,
    qualityScore,
    activityMessages,
    error,
    currentStage,
    startPipeline,
    reset,
  } = useSalaryNegotiation();

  // Auto-load resume on mount
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

  const setField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const canSubmit = form.offerCompany.trim().length > 0 && form.offerRole.trim().length > 0 && resumeText.length > 50;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setResumeError(null);

    if (!resumeText || resumeText.length < 50) {
      setResumeError('No resume found. Please complete the Resume Strategist first.');
      return;
    }

    await startPipeline({
      resumeText,
      offerCompany: form.offerCompany.trim(),
      offerRole: form.offerRole.trim(),
      offerBaseSalary: form.offerBaseSalary ? Number(form.offerBaseSalary) : undefined,
      offerTotalComp: form.offerTotalComp ? Number(form.offerTotalComp) : undefined,
      offerEquityDetails: form.offerEquityDetails.trim() || undefined,
      offerOtherDetails: form.offerOtherDetails.trim() || undefined,
      currentBaseSalary: form.currentBaseSalary ? Number(form.currentBaseSalary) : undefined,
      currentTotalComp: form.currentTotalComp ? Number(form.currentTotalComp) : undefined,
      currentEquity: form.currentEquity.trim() || undefined,
      targetRole: form.targetRole.trim() || undefined,
      targetIndustry: form.targetIndustry.trim() || undefined,
    });
  }, [canSubmit, form, resumeText, startPipeline]);

  const handleReset = useCallback(() => {
    reset();
    setForm(DEFAULT_FORM);
  }, [reset]);

  const handleStartCounterOffer = useCallback((mode: CounterOfferMode, roundType?: string) => {
    if (!resumeText || resumeText.length < 50) {
      setResumeError('No resume found. Please complete the Resume Strategist first.');
      return;
    }
    setCounterOfferConfig({ mode, roundType });
  }, [resumeText]);

  const handleBackFromCounterOffer = useCallback(() => {
    setCounterOfferConfig(null);
  }, []);

  // Counter-offer simulation view
  if (counterOfferConfig) {
    return (
      <CounterOfferView
        mode={counterOfferConfig.mode}
        roundType={counterOfferConfig.roundType}
        resumeText={resumeText}
        offerCompany={form.offerCompany}
        offerRole={form.offerRole}
        offerBaseSalary={form.offerBaseSalary ? Number(form.offerBaseSalary) : undefined}
        offerTotalComp={form.offerTotalComp ? Number(form.offerTotalComp) : undefined}
        onBack={handleBackFromCounterOffer}
      />
    );
  }

  // Complete → report view
  if (status === 'complete' && report) {
    return (
      <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
        <ReportView report={report} qualityScore={qualityScore} onReset={handleReset} />
      </div>
    );
  }

  // Running view
  if (status === 'connecting' || status === 'running') {
    return (
      <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
        {/* Room header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-white/90">Salary Negotiation</h1>
          <p className="text-[13px] text-white/40">Building your personalized negotiation strategy...</p>
        </div>

        {/* Stage indicators */}
        <div className="flex items-center gap-3">
          {['research', 'strategy', 'scenarios', 'quality'].map((stage, i, arr) => {
            const stageOrder = ['research', 'strategy', 'scenarios', 'quality'];
            const currentIdx = currentStage ? stageOrder.indexOf(currentStage) : -1;
            const stageIdx = stageOrder.indexOf(stage);
            const isDone = currentIdx > stageIdx;
            const isActive = currentStage === stage;
            return (
              <div key={stage} className="flex items-center gap-3">
                <div className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all',
                  isActive ? 'bg-[#98b3ff]/15 text-[#98b3ff] border border-[#98b3ff]/25'
                    : isDone ? 'bg-[#57CDA4]/10 text-[#57CDA4] border border-[#57CDA4]/20'
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
            <div className="rounded-lg bg-[#98b3ff]/10 p-2">
              <Loader2 size={16} className="text-[#98b3ff] animate-spin" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-white/80">
                {currentStage ? STAGE_LABELS[currentStage] ?? currentStage : 'Starting analysis...'}
              </h3>
              <p className="text-[12px] text-white/35">Analyzing market data and designing your strategy</p>
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
          <h1 className="text-xl font-semibold text-white/90">Salary Negotiation</h1>
        </div>
        <GlassCard className="p-6 border-[#f87171]/20">
          <div className="flex items-start gap-3 mb-4">
            <AlertCircle size={18} className="text-[#f87171] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] text-[#f87171] font-medium">Analysis failed</p>
              <p className="text-[12px] text-white/40 mt-0.5">{error}</p>
            </div>
          </div>
          <GlassButton variant="ghost" onClick={handleReset} className="text-[13px]">
            <ArrowLeft size={14} className="mr-1.5" />
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
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-gradient-to-br from-[#98b3ff]/15 to-[#A396E2]/10 p-2.5 border border-[#98b3ff]/20">
            <DollarSign size={20} className="text-[#98b3ff]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white/90">Salary Negotiation</h1>
            <p className="text-[13px] text-white/40">Get a personalized playbook with market benchmarks, leverage points, and scenario scripts</p>
          </div>
        </div>
      </div>

      {/* Resume status */}
      {resumeLoading ? (
        <div className="flex items-center gap-2 text-[12px] text-white/35">
          <Loader2 size={12} className="animate-spin" />
          Loading your resume...
        </div>
      ) : resumeText.length > 50 ? (
        <div className="flex items-center gap-2 text-[12px] text-[#57CDA4]/70">
          <Check size={12} />
          Resume loaded from Resume Strategist
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-[12px] text-[#dfc797]/70 mb-1">
            <AlertCircle size={12} />
            No master resume found — paste your resume below
          </div>
          <TextareaField
            label="Your Resume"
            value={resumeText}
            onChange={setResumeText}
            placeholder="Paste your full resume text here..."
            rows={5}
          />
        </div>
      )}

      {resumeError && (
        <div className="flex items-center gap-2 text-[12px] text-[#f87171]">
          <AlertCircle size={12} />
          {resumeError}
        </div>
      )}

      {/* Two-column form */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column — The Offer */}
        <GlassCard className="p-6 bg-gradient-to-br from-white/[0.04] to-white/[0.02] flex flex-col gap-5">
          <div className="flex items-center gap-2 mb-1">
            <div className="rounded-lg bg-[#98b3ff]/10 p-1.5">
              <Target size={14} className="text-[#98b3ff]" />
            </div>
            <h2 className="text-[15px] font-semibold text-white/80">The Offer</h2>
          </div>

          <InputField
            label="Company"
            value={form.offerCompany}
            onChange={(v) => setField('offerCompany', v)}
            placeholder="e.g. Acme Corp"
          />
          <InputField
            label="Role"
            value={form.offerRole}
            onChange={(v) => setField('offerRole', v)}
            placeholder="e.g. VP of Operations"
          />
          <div className="grid grid-cols-2 gap-4">
            <InputField
              label="Base Salary"
              value={form.offerBaseSalary}
              onChange={(v) => setField('offerBaseSalary', v)}
              placeholder="180000"
              type="number"
              prefix="$"
            />
            <InputField
              label="Total Comp"
              value={form.offerTotalComp}
              onChange={(v) => setField('offerTotalComp', v)}
              placeholder="220000"
              type="number"
              prefix="$"
            />
          </div>
          <TextareaField
            label="Equity Details"
            value={form.offerEquityDetails}
            onChange={(v) => setField('offerEquityDetails', v)}
            placeholder="e.g. 10,000 RSUs vesting over 4 years, 1-year cliff..."
            rows={2}
          />
          <TextareaField
            label="Other Benefits"
            value={form.offerOtherDetails}
            onChange={(v) => setField('offerOtherDetails', v)}
            placeholder="e.g. signing bonus, relocation, PTO..."
            rows={2}
          />
        </GlassCard>

        {/* Right column — Your Position */}
        <div className="flex flex-col gap-5">
          <GlassCard className="p-6 bg-gradient-to-br from-white/[0.04] to-white/[0.02] flex flex-col gap-5">
            <div className="flex items-center gap-2 mb-1">
              <div className="rounded-lg bg-[#A396E2]/10 p-1.5">
                <Shield size={14} className="text-[#A396E2]" />
              </div>
              <h2 className="text-[15px] font-semibold text-white/80">Your Current Position</h2>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <InputField
                label="Current Base"
                value={form.currentBaseSalary}
                onChange={(v) => setField('currentBaseSalary', v)}
                placeholder="165000"
                type="number"
                prefix="$"
              />
              <InputField
                label="Current Total Comp"
                value={form.currentTotalComp}
                onChange={(v) => setField('currentTotalComp', v)}
                placeholder="200000"
                type="number"
                prefix="$"
              />
            </div>
            <InputField
              label="Current Equity"
              value={form.currentEquity}
              onChange={(v) => setField('currentEquity', v)}
              placeholder="e.g. 5,000 vested RSUs remaining..."
            />
          </GlassCard>

          <GlassCard className="p-6 bg-gradient-to-br from-white/[0.04] to-white/[0.02] flex flex-col gap-5">
            <div className="flex items-center gap-2 mb-1">
              <div className="rounded-lg bg-[#57CDA4]/10 p-1.5">
                <Briefcase size={14} className="text-[#57CDA4]" />
              </div>
              <h2 className="text-[15px] font-semibold text-white/80">Target Context <span className="text-[11px] font-normal text-white/30 ml-1">optional</span></h2>
            </div>

            <InputField
              label="Target Role"
              value={form.targetRole}
              onChange={(v) => setField('targetRole', v)}
              placeholder="e.g. VP of Operations"
            />
            <InputField
              label="Target Industry"
              value={form.targetIndustry}
              onChange={(v) => setField('targetIndustry', v)}
              placeholder="e.g. Medical Devices"
            />
          </GlassCard>
        </div>
      </div>

      {/* Submit */}
      <div className="flex items-center justify-between pt-2">
        <p className="text-[12px] text-white/30">
          Analysis takes 1-3 minutes. You'll get market benchmarks, leverage points, and word-for-word scripts.
        </p>
        <GlassButton
          variant="primary"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={cn(
            'px-6 py-3 text-[14px] font-medium rounded-xl',
            'bg-gradient-to-r from-[#98b3ff]/20 to-[#A396E2]/15 hover:from-[#98b3ff]/30 hover:to-[#A396E2]/25',
            !canSubmit && 'opacity-40 cursor-not-allowed',
          )}
        >
          <TrendingUp size={15} className="mr-2" />
          Build Negotiation Strategy
        </GlassButton>
      </div>

      {/* Counter-offer practice */}
      {resumeText.length > 50 && (
        <div className="border-t border-white/[0.06] pt-6 flex flex-col gap-3">
          <div className="flex items-center gap-2 mb-1">
            <Swords size={14} className="text-[#dfc797]/70" />
            <span className="text-[13px] font-medium text-white/60">Practice Counter-Offers</span>
            <span className="text-[11px] text-white/30 ml-1">
              Simulate employer pushback and get scored feedback
            </span>
          </div>
          <div className="flex flex-wrap gap-3">
            <GlassButton
              variant="ghost"
              onClick={() => handleStartCounterOffer('full')}
              className="text-[13px] border-[#dfc797]/20 hover:border-[#dfc797]/40"
            >
              <Swords size={14} className="mr-1.5 text-[#dfc797]/70" />
              Practice Counter-Offer
            </GlassButton>
            <GlassButton
              variant="ghost"
              onClick={() => handleStartCounterOffer('single_round', 'budget_constraints')}
              className="text-[13px]"
            >
              <Zap size={14} className="mr-1.5 text-[#98b3ff]/70" />
              Quick Round
            </GlassButton>
          </div>
        </div>
      )}
    </div>
  );
}
