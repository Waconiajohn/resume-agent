import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import {
  User,
  Mic,
  LayoutGrid,
  Linkedin,
  Briefcase,
  Users,
  Award,
  Loader2,
  AlertCircle,
  RotateCcw,
  Copy,
  Check,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useExecutiveBio } from '@/hooks/useExecutiveBio';
import { supabase } from '@/lib/supabase';
import { markdownToHtml } from '@/lib/markdown';

// --- Bio format options ---

interface FormatOption {
  id: string;
  label: string;
  icon: React.ElementType;
  description: string;
}

const FORMAT_OPTIONS: FormatOption[] = [
  { id: 'speaker', label: 'Speaker', icon: Mic, description: 'Conference & keynote bio' },
  { id: 'board', label: 'Board', icon: LayoutGrid, description: 'Board of directors bio' },
  { id: 'advisory', label: 'Advisory', icon: Users, description: 'Advisory board bio' },
  { id: 'professional', label: 'Professional', icon: Briefcase, description: 'General professional bio' },
  { id: 'linkedin', label: 'LinkedIn', icon: Linkedin, description: 'LinkedIn About section' },
];

const LENGTH_OPTIONS = [
  { id: 'short', label: 'Short', description: '50-100 words' },
  { id: 'long', label: 'Long', description: '200-300 words' },
];

// --- Stage labels ---

const STAGE_LABELS: Record<string, string> = {
  analysis: 'Analyzing your background',
  drafting: 'Drafting bios',
  quality: 'Quality review',
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
              <div className={cn('h-1.5 w-1.5 rounded-full mt-1.5 flex-shrink-0', age === 0 ? 'bg-[#A396E2]' : 'bg-white/20')} />
              <span className={cn('text-[12px] leading-relaxed transition-colors', opacity)}>{msg.message}</span>
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-gradient-to-br from-[#A396E2]/15 to-[#98b3ff]/10 p-2.5 border border-[#A396E2]/20">
            <User size={18} className="text-[#A396E2]" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white/90">Executive Bio Collection</h2>
            <p className="text-[13px] text-white/40">Your bios, ready to deploy across every channel</p>
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
            {copied ? 'Copied' : 'Copy All'}
          </GlassButton>
          <GlassButton variant="ghost" onClick={onReset} className="text-[13px] px-3 py-2">
            <RotateCcw size={14} className="mr-1.5" />
            New Bios
          </GlassButton>
        </div>
      </div>

      {/* Report content */}
      <GlassCard className="p-8 bg-gradient-to-br from-white/[0.04] to-white/[0.02]">
        <div
          className="prose prose-invert prose-sm max-w-none
            prose-headings:text-white/85 prose-headings:font-semibold
            prose-h1:text-lg prose-h1:border-b prose-h1:border-white/[0.08] prose-h1:pb-3 prose-h1:mb-5
            prose-h2:text-[15px] prose-h2:mt-7 prose-h2:mb-3 prose-h2:text-[#A396E2]/90
            prose-h3:text-[14px] prose-h3:mt-5 prose-h3:mb-2 prose-h3:text-white/70
            prose-p:text-white/65 prose-p:text-[13px] prose-p:leading-relaxed prose-p:my-2
            prose-li:text-white/55 prose-li:text-[13px] prose-li:leading-relaxed
            prose-strong:text-white/80
            prose-em:text-[#dfc797]/80
            prose-blockquote:border-[#A396E2]/30 prose-blockquote:text-white/45 prose-blockquote:bg-[#A396E2]/[0.03] prose-blockquote:rounded-r-lg prose-blockquote:py-1
            prose-hr:border-white/[0.06] prose-hr:my-6"
          dangerouslySetInnerHTML={{ __html: markdownToHtml(report) }}
        />
      </GlassCard>
    </div>
  );
}

// --- Main component ---

export function ExecutiveBioRoom() {
  const [resumeText, setResumeText] = useState('');
  const [resumeLoading, setResumeLoading] = useState(false);
  const [selectedFormats, setSelectedFormats] = useState<string[]>(['professional', 'linkedin']);
  const [selectedLengths, setSelectedLengths] = useState<string[]>(['short', 'long']);
  const [targetRole, setTargetRole] = useState('');
  const [targetIndustry, setTargetIndustry] = useState('');

  const {
    status,
    report,
    qualityScore,
    activityMessages,
    error,
    currentStage,
    startPipeline,
    reset,
  } = useExecutiveBio();

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

  const toggleFormat = useCallback((id: string) => {
    setSelectedFormats((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id],
    );
  }, []);

  const toggleLength = useCallback((id: string) => {
    setSelectedLengths((prev) =>
      prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id],
    );
  }, []);

  const canSubmit = resumeText.length > 50 && selectedFormats.length > 0 && selectedLengths.length > 0;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    await startPipeline({
      resumeText,
      requestedFormats: selectedFormats,
      requestedLengths: selectedLengths,
      targetRole: targetRole.trim() || undefined,
      targetIndustry: targetIndustry.trim() || undefined,
    });
  }, [canSubmit, resumeText, selectedFormats, selectedLengths, targetRole, targetIndustry, startPipeline]);

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
    const stageOrder = ['analysis', 'drafting', 'quality'];
    const currentIdx = currentStage ? stageOrder.indexOf(currentStage) : -1;

    return (
      <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-white/90">Executive Bio Suite</h1>
          <p className="text-[13px] text-white/40">
            Drafting {selectedFormats.length} bio{selectedFormats.length !== 1 ? 's' : ''} in {selectedLengths.join(' & ')} formats...
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
                  isActive ? 'bg-[#A396E2]/15 text-[#A396E2] border border-[#A396E2]/25'
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
            <div className="rounded-lg bg-[#A396E2]/10 p-2">
              <Loader2 size={16} className="text-[#A396E2] animate-spin" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-white/80">
                {currentStage ? STAGE_LABELS[currentStage] ?? currentStage : 'Starting...'}
              </h3>
              <p className="text-[12px] text-white/35">Crafting bios that position you as the benchmark</p>
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
          <h1 className="text-xl font-semibold text-white/90">Executive Bio Suite</h1>
        </div>
        <GlassCard className="p-6 border-[#f87171]/20">
          <div className="flex items-start gap-3 mb-4">
            <AlertCircle size={18} className="text-[#f87171] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] text-[#f87171] font-medium">Generation failed</p>
              <p className="text-[12px] text-white/40 mt-0.5">{error}</p>
            </div>
          </div>
          <GlassButton variant="ghost" onClick={handleReset} className="text-[13px]">
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
        <div className="rounded-xl bg-gradient-to-br from-[#A396E2]/15 to-[#98b3ff]/10 p-2.5 border border-[#A396E2]/20">
          <User size={20} className="text-[#A396E2]" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-white/90">Executive Bio Suite</h1>
          <p className="text-[13px] text-white/40">Generate professional bios for every channel — speaker, board, LinkedIn, and more</p>
        </div>
      </div>

      {/* Resume section */}
      <GlassCard className="p-6 bg-gradient-to-br from-white/[0.04] to-white/[0.02]">
        <div className="flex items-center gap-2 mb-4">
          <Award size={15} className="text-[#A396E2]" />
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
            <div className="flex items-center gap-2 text-[12px] text-[#dfc797]/70 mb-1">
              <AlertCircle size={12} />
              No master resume found — paste below
            </div>
            <textarea
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              placeholder="Paste your full resume text here..."
              rows={6}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[13px] text-white/80 placeholder:text-white/25 resize-none focus:outline-none focus:border-[#A396E2]/40 focus:ring-2 focus:ring-[#A396E2]/10 transition-all"
            />
          </div>
        )}
      </GlassCard>

      {/* Bio format selection */}
      <GlassCard className="p-6 bg-gradient-to-br from-white/[0.04] to-white/[0.02]">
        <div className="flex items-center gap-2 mb-5">
          <LayoutGrid size={15} className="text-[#A396E2]" />
          <h2 className="text-[14px] font-semibold text-white/75">Bio Formats</h2>
          <span className="ml-auto text-[11px] text-white/30">Select all that apply</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {FORMAT_OPTIONS.map(({ id, label, icon: Icon, description }) => {
            const isSelected = selectedFormats.includes(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleFormat(id)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-xl p-4 border text-center transition-all',
                  isSelected
                    ? 'bg-[#A396E2]/10 border-[#A396E2]/30 text-[#A396E2]'
                    : 'bg-white/[0.02] border-white/[0.06] text-white/35 hover:bg-white/[0.04] hover:text-white/55',
                )}
              >
                <Icon size={18} />
                <div>
                  <div className="text-[12px] font-semibold">{label}</div>
                  <div className="text-[10px] opacity-60 mt-0.5">{description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </GlassCard>

      {/* Length + optional fields */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GlassCard className="p-6 bg-gradient-to-br from-white/[0.04] to-white/[0.02]">
          <h2 className="text-[14px] font-semibold text-white/75 mb-4">Bio Length</h2>
          <div className="flex gap-3">
            {LENGTH_OPTIONS.map(({ id, label, description }) => {
              const isSelected = selectedLengths.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleLength(id)}
                  className={cn(
                    'flex-1 flex flex-col items-center gap-1 rounded-xl p-4 border transition-all',
                    isSelected
                      ? 'bg-[#98b3ff]/10 border-[#98b3ff]/30 text-[#98b3ff]'
                      : 'bg-white/[0.02] border-white/[0.06] text-white/35 hover:bg-white/[0.04] hover:text-white/55',
                  )}
                >
                  <span className="text-[13px] font-semibold">{label}</span>
                  <span className="text-[11px] opacity-60">{description}</span>
                </button>
              );
            })}
          </div>
        </GlassCard>

        <GlassCard className="p-6 bg-gradient-to-br from-white/[0.04] to-white/[0.02] flex flex-col gap-4">
          <h2 className="text-[14px] font-semibold text-white/75">Target Context <span className="text-[11px] font-normal text-white/30">optional</span></h2>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold text-white/50 uppercase tracking-wider">Target Role</label>
            <input
              type="text"
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              placeholder="e.g. Chief Operating Officer"
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[13px] text-white/80 placeholder:text-white/25 focus:outline-none focus:border-[#A396E2]/40 focus:ring-2 focus:ring-[#A396E2]/10 transition-all"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold text-white/50 uppercase tracking-wider">Target Industry</label>
            <input
              type="text"
              value={targetIndustry}
              onChange={(e) => setTargetIndustry(e.target.value)}
              placeholder="e.g. Healthcare Technology"
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[13px] text-white/80 placeholder:text-white/25 focus:outline-none focus:border-[#A396E2]/40 focus:ring-2 focus:ring-[#A396E2]/10 transition-all"
            />
          </div>
        </GlassCard>
      </div>

      {/* Submit */}
      <div className="flex items-center justify-between pt-2">
        <p className="text-[12px] text-white/30">
          Generating {selectedFormats.length || 0} bio{selectedFormats.length !== 1 ? 's' : ''} × {selectedLengths.length || 0} length{selectedLengths.length !== 1 ? 's' : ''}.
          Takes 1-2 minutes.
        </p>
        <GlassButton
          variant="primary"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={cn(
            'px-6 py-3 text-[14px] font-medium rounded-xl',
            'bg-gradient-to-r from-[#A396E2]/20 to-[#98b3ff]/15 hover:from-[#A396E2]/30 hover:to-[#98b3ff]/25',
            !canSubmit && 'opacity-40 cursor-not-allowed',
          )}
        >
          <User size={15} className="mr-2" />
          Generate Bio Suite
        </GlassButton>
      </div>
    </div>
  );
}
