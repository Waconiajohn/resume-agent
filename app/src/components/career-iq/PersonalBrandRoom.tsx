import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import {
  Fingerprint,
  Linkedin,
  FileText,
  Target,
  Briefcase,
  Loader2,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Check,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useCallback, useEffect, useRef } from 'react';
import { usePersonalBrand } from '@/hooks/usePersonalBrand';
import { supabase } from '@/lib/supabase';
import { markdownToHtml } from '@/lib/markdown';

// --- Activity feed ---

function ActivityFeed({
  activityMessages,
  currentStage,
}: {
  activityMessages: { id: string; message: string; stage?: string; timestamp: number }[];
  currentStage: string | null;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activityMessages.length]);

  const stageLabel =
    currentStage === 'audit'
      ? 'Auditing your brand presence'
      : currentStage === 'advising'
      ? 'Generating recommendations'
      : currentStage
      ? currentStage
      : 'Starting analysis...';

  return (
    <GlassCard className="p-8 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-72 h-72 rounded-full bg-[#57CDA4]/[0.04] blur-3xl pointer-events-none" />

      <div className="flex items-center gap-4 mb-8">
        <div className="relative">
          <div className="rounded-xl bg-[#57CDA4]/10 p-3">
            <Fingerprint size={20} className="text-[#57CDA4]" />
          </div>
          <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-[#98b3ff]/20 border-2 border-[#98b3ff]/40 flex items-center justify-center">
            <Loader2 size={8} className="text-[#98b3ff] animate-spin" />
          </div>
        </div>
        <div>
          <h3 className="text-[17px] font-semibold text-white/90">Auditing your personal brand</h3>
          <p className="text-[13px] text-white/40 mt-0.5">{stageLabel}</p>
        </div>
      </div>

      <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
        {activityMessages.length === 0 ? (
          <div className="text-center py-12">
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
                <div className="h-1.5 w-1.5 rounded-full bg-[#57CDA4]/50 mt-2 flex-shrink-0" />
                <span className="text-[13px] text-white/60 leading-relaxed">{msg.message}</span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </GlassCard>
  );
}

// --- Findings summary ---

const SEVERITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  critical: { label: 'Critical', color: 'text-[#f87171]', bg: 'border-[#f87171]/20 bg-[#f87171]/[0.05]' },
  high:     { label: 'High',     color: 'text-[#f0a070]', bg: 'border-[#f0a070]/20 bg-[#f0a070]/[0.05]' },
  medium:   { label: 'Medium',   color: 'text-[#f0d99f]', bg: 'border-[#f0d99f]/20 bg-[#f0d99f]/[0.05]' },
  low:      { label: 'Low',      color: 'text-[#57CDA4]', bg: 'border-[#57CDA4]/20 bg-[#57CDA4]/[0.05]' },
  info:     { label: 'Info',     color: 'text-[#98b3ff]', bg: 'border-[#98b3ff]/20 bg-[#98b3ff]/[0.05]' },
};

function FindingsSummary({ findings }: { findings: import('@/hooks/usePersonalBrand').BrandFinding[] }) {
  if (findings.length === 0) return null;

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <AlertCircle size={16} className="text-[#f0d99f]" />
        <h3 className="text-[14px] font-semibold text-white/80">Key Findings</h3>
        <span className="ml-auto text-[11px] text-white/30">{findings.length} finding{findings.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="space-y-2">
        {findings.map((f, i) => {
          const cfg = SEVERITY_CONFIG[f.severity] ?? SEVERITY_CONFIG.info;
          return (
            <div key={i} className={cn('flex items-center gap-3 rounded-lg border px-3 py-2', cfg.bg)}>
              <span className={cn('text-[10px] font-semibold uppercase tracking-wider flex-shrink-0 w-12', cfg.color)}>
                {cfg.label}
              </span>
              <span className="text-[12px] text-white/65">{f.title}</span>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

// --- Report view ---

function ReportView({
  report,
  qualityScore,
  findings,
  onReset,
}: {
  report: string;
  qualityScore: number | null;
  findings: import('@/hooks/usePersonalBrand').BrandFinding[];
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
      ? 'text-[#f0d99f] bg-[#f0d99f]/10 border-[#f0d99f]/20'
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
          Run another audit
        </button>
        <div className="flex-1" />
        {qualityScore !== null && (
          <div className={cn('text-[12px] font-semibold px-3 py-1 rounded-full border', scoreColor)}>
            Score {qualityScore}%
          </div>
        )}
        <GlassButton variant="ghost" onClick={handleCopy} size="sm">
          {copied ? <Check size={13} className="mr-1.5 text-[#57CDA4]" /> : <Copy size={13} className="mr-1.5" />}
          {copied ? 'Copied!' : 'Copy Report'}
        </GlassButton>
      </div>

      <FindingsSummary findings={findings} />

      <GlassCard className="p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 rounded-full bg-[#57CDA4]/[0.03] blur-3xl pointer-events-none" />

        <div className="flex items-center gap-4 mb-8">
          <div className="rounded-xl bg-[#57CDA4]/10 p-3">
            <TrendingUp size={20} className="text-[#57CDA4]" />
          </div>
          <div>
            <h2 className="text-[17px] font-semibold text-white/90">Personal Brand Audit</h2>
            <p className="text-[13px] text-white/40 mt-0.5">Consistency analysis and recommendations</p>
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
            prose-blockquote:border-[#57CDA4]/30 prose-blockquote:text-white/45 prose-blockquote:italic
            prose-hr:border-white/[0.08]"
          dangerouslySetInnerHTML={{ __html: markdownToHtml(report) }}
        />
      </GlassCard>
    </div>
  );
}

// --- Main component ---

export function PersonalBrandRoom() {
  const [resumeText, setResumeText] = useState('');
  const [linkedinText, setLinkedinText] = useState('');
  const [bioText, setBioText] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [targetIndustry, setTargetIndustry] = useState('');
  const [loadingResume, setLoadingResume] = useState(false);
  const [resumeAutoLoaded, setResumeAutoLoaded] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const {
    status,
    report,
    qualityScore,
    findings,
    activityMessages,
    error,
    currentStage,
    startPipeline,
    reset,
  } = usePersonalBrand();

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
          setResumeText(data.raw_text);
          setResumeAutoLoaded(true);
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

    if (!resumeText.trim() || resumeText.trim().length < 50) {
      setFormError('Resume text is required. Please paste your resume or complete the Resume Strategist to auto-load it.');
      return;
    }
    if (!linkedinText.trim() && !bioText.trim()) {
      setFormError('Add at least one additional source — LinkedIn profile text or a bio — for a meaningful audit.');
      return;
    }

    await startPipeline({
      resumeText: resumeText.trim(),
      linkedinText: linkedinText.trim() || undefined,
      bioText: bioText.trim() || undefined,
      targetRole: targetRole.trim() || undefined,
      targetIndustry: targetIndustry.trim() || undefined,
    });
  }, [resumeText, linkedinText, bioText, targetRole, targetIndustry, startPipeline]);

  const handleReset = useCallback(() => {
    reset();
    setFormError(null);
  }, [reset]);

  // Complete → report
  if (status === 'complete' && report) {
    return (
      <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
        <ReportView report={report} qualityScore={qualityScore} findings={findings} onReset={handleReset} />
      </div>
    );
  }

  // Running
  if (status === 'connecting' || status === 'running') {
    return (
      <div className="flex flex-col gap-8 p-8 max-w-[900px] mx-auto">
        <div>
          <h1 className="text-xl font-semibold text-white/90">Personal Brand Audit</h1>
          <p className="text-[13px] text-white/40 mt-1">Analyzing your brand consistency across all sources</p>
        </div>
        <ActivityFeed activityMessages={activityMessages} currentStage={currentStage} />
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
          <GlassButton variant="ghost" onClick={handleReset} size="sm">
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
        <div className="rounded-xl bg-[#57CDA4]/10 p-2.5 self-start shrink-0">
          <Fingerprint size={20} className="text-[#57CDA4]" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-white/90">Personal Brand Audit</h1>
          <p className="text-[13px] text-white/40 leading-relaxed mt-1">
            Audit your professional brand across resume, LinkedIn, and bio for consistency, gaps, and positioning opportunities.
          </p>
        </div>
      </div>

      {/* Section 1: Resume */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <FileText size={16} className="text-[#98b3ff]" />
          <h2 className="text-[15px] font-semibold text-white/80">Resume</h2>
          <div className="flex-1 h-px bg-white/[0.06]" />
          {loadingResume && (
            <div className="flex items-center gap-1.5 text-[11px] text-white/30">
              <Loader2 size={10} className="animate-spin" />
              Loading...
            </div>
          )}
          {resumeAutoLoaded && !loadingResume && (
            <div className="flex items-center gap-1.5 text-[11px] text-[#57CDA4]/60">
              <CheckCircle2 size={10} />
              Auto-loaded
            </div>
          )}
        </div>

        <textarea
          value={resumeText}
          onChange={(e) => setResumeText(e.target.value)}
          placeholder={loadingResume ? 'Loading from your profile...' : 'Paste your resume text here, or complete the Resume Strategist to auto-load it...'}
          rows={resumeAutoLoaded ? 5 : 8}
          disabled={loadingResume}
          className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white/80 placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-[#98b3ff]/20 focus:border-[#98b3ff]/30 transition-colors resize-none leading-relaxed disabled:opacity-50"
        />
      </div>

      {/* Section 2: LinkedIn */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Linkedin size={16} className="text-[#98b3ff]" />
          <h2 className="text-[15px] font-semibold text-white/80">LinkedIn Profile</h2>
          <div className="flex-1 h-px bg-white/[0.06]" />
          <span className="text-[11px] text-white/25">Recommended</span>
        </div>

        <textarea
          value={linkedinText}
          onChange={(e) => setLinkedinText(e.target.value)}
          placeholder="Paste your LinkedIn About section, headline, and experience summaries..."
          rows={6}
          className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white/80 placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-[#98b3ff]/20 focus:border-[#98b3ff]/30 transition-colors resize-none leading-relaxed"
        />
      </div>

      {/* Section 3: Bio + targeting (collapsible) */}
      <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-white/[0.02] to-transparent overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
        >
          <Target size={15} className="text-[#f0d99f]" />
          <span className="text-[14px] font-medium text-white/60">Additional Sources &amp; Targeting</span>
          <span className="text-[11px] text-white/25 ml-1">bio, target role, industry</span>
          <div className="flex-1" />
          <span className="text-[11px] text-white/30">{showAdvanced ? 'Collapse' : 'Expand'}</span>
        </button>

        {showAdvanced && (
          <div className="px-5 pb-5 space-y-5 border-t border-white/[0.06]">
            <div className="pt-4 space-y-3">
              <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">Bio / Speaker Bio (optional)</label>
              <textarea
                value={bioText}
                onChange={(e) => setBioText(e.target.value)}
                placeholder="Paste any bio, speaker profile, or about page text..."
                rows={4}
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white/80 placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-[#98b3ff]/20 focus:border-[#98b3ff]/30 transition-colors resize-none leading-relaxed"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">Target Role (optional)</label>
                <input
                  type="text"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  placeholder="e.g. Chief Operating Officer"
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white/80 placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-[#98b3ff]/20 focus:border-[#98b3ff]/30 transition-colors"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">Target Industry (optional)</label>
                <input
                  type="text"
                  value={targetIndustry}
                  onChange={(e) => setTargetIndustry(e.target.value)}
                  placeholder="e.g. Medical Devices"
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white/80 placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-[#98b3ff]/20 focus:border-[#98b3ff]/30 transition-colors"
                />
              </div>
            </div>
          </div>
        )}
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
          Audit checks messaging consistency, positioning gaps, and keyword alignment across all sources.
        </p>
        <GlassButton
          variant="primary"
          onClick={handleSubmit}
          className="text-[14px] px-6 py-3 gap-2"
        >
          <Sparkles size={15} />
          Run Audit
        </GlassButton>
      </div>
    </div>
  );
}
