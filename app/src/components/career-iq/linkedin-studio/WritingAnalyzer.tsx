import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import {
  Eye,
  TrendingUp,
  AlertCircle,
  Loader2,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { API_BASE } from '@/lib/api';

interface WritingAnalysisResult {
  overall_score: number;
  tone_assessment: string;
  readability_level: string;
  engagement_prediction: string;
  strengths: string[];
  improvements: string[];
  ai_detection_risk: string;
  authenticity_score: number;
  hook_quality: number;
  suggested_rewrite_of_first_line: string;
}

const TONE_LABELS: Record<string, string> = {
  authoritative: 'Authoritative',
  conversational: 'Conversational',
  inspirational: 'Inspirational',
  educational: 'Educational',
  too_formal: 'Too Formal',
  too_casual: 'Too Casual',
  generic: 'Generic',
};

const ENGAGEMENT_COLORS: Record<string, string> = {
  high: 'text-[#b5dec2] bg-[#b5dec2]/10',
  above_average: 'text-[#98b3ff] bg-[#98b3ff]/10',
  average: 'text-[#f0d99f] bg-[#f0d99f]/10',
  below_average: 'text-[#ffc4a0] bg-[#ffc4a0]/10',
  low: 'text-red-400 bg-red-400/10',
};

const AI_RISK_COLORS: Record<string, string> = {
  very_low: 'text-[#b5dec2]',
  low: 'text-[#98b3ff]',
  moderate: 'text-[#f0d99f]',
  high: 'text-[#ffc4a0]',
  very_high: 'text-red-400',
};

const CONTEXT_OPTIONS: { value: string; label: string }[] = [
  { value: 'post', label: 'Post' },
  { value: 'headline', label: 'Headline' },
  { value: 'about', label: 'About Section' },
  { value: 'experience', label: 'Experience Entry' },
  { value: 'comment', label: 'Comment' },
];

export function WritingAnalyzer() {
  const [text, setText] = useState('');
  const [context, setContext] = useState('post');
  const [result, setResult] = useState<WritingAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = useCallback(async () => {
    if (!text.trim() || text.trim().length < 10) {
      setError('Please enter at least 10 characters to analyze.');
      return;
    }
    setError(null);
    setLoading(true);
    setResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError('Please sign in to use this tool.');
        return;
      }

      const res = await fetch(`${API_BASE}/linkedin-tools/writing-analyzer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text: text.trim(), context }),
      });

      if (!res.ok) {
        const body = await res.text();
        setError(`Analysis failed (${res.status}): ${body}`);
        return;
      }

      const data = (await res.json()) as { result: WritingAnalysisResult };
      setResult(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }, [text, context]);

  const scoreColor =
    !result
      ? ''
      : result.overall_score >= 80
      ? 'text-[#b5dec2]'
      : result.overall_score >= 60
      ? 'text-[#98b3ff]'
      : result.overall_score >= 40
      ? 'text-[#f0d99f]'
      : 'text-red-400';

  return (
    <div className="flex flex-col gap-4">
      <GlassCard className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Eye size={16} className="text-[#98b3ff]" />
          <h3 className="text-[15px] font-semibold text-white/85">Writing Analyzer</h3>
        </div>
        <p className="text-[13px] text-white/45 mb-4 leading-relaxed">
          Paste any LinkedIn text to get an instant analysis of tone, readability, engagement potential, and AI-detection risk.
        </p>

        <div className="flex flex-col gap-3">
          <div className="flex gap-1.5 flex-wrap">
            {CONTEXT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setContext(opt.value)}
                className={cn(
                  'text-[11px] font-medium px-3 py-1 rounded-full border transition-colors',
                  context === opt.value
                    ? 'text-[#98b3ff] border-[#98b3ff]/30 bg-[#98b3ff]/[0.08]'
                    : 'text-white/35 border-white/[0.08] bg-white/[0.02] hover:text-white/55 hover:border-white/15',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste your LinkedIn text here..."
            rows={6}
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[13px] text-white/70 placeholder:text-white/20 resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:border-[#98b3ff]/30"
          />

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-white/25">{text.length} characters</span>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 flex items-center gap-3">
              <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
              <p className="text-[12px] text-red-300/80">{error}</p>
            </div>
          )}

          <GlassButton
            onClick={handleAnalyze}
            disabled={loading || text.trim().length < 10}
            className="self-start flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Eye size={13} />
                Analyze Writing
              </>
            )}
          </GlassButton>
        </div>
      </GlassCard>

      {result && (
        <GlassCard className="p-6">
          <div className="flex items-center gap-6 mb-5">
            <div className="flex flex-col items-center gap-1">
              <span className={cn('text-[40px] font-bold tabular-nums leading-none', scoreColor)}>
                {result.overall_score}
              </span>
              <span className="text-[9px] text-white/30 uppercase tracking-wider">Quality</span>
            </div>
            <div className="flex-1 min-w-0 grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Authenticity</p>
                <p className={cn(
                  'text-[18px] font-bold tabular-nums',
                  result.authenticity_score >= 80 ? 'text-[#b5dec2]' :
                  result.authenticity_score >= 60 ? 'text-[#f0d99f]' : 'text-red-400',
                )}>{result.authenticity_score}</p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Hook</p>
                <p className={cn(
                  'text-[18px] font-bold tabular-nums',
                  result.hook_quality >= 70 ? 'text-[#98b3ff]' :
                  result.hook_quality >= 50 ? 'text-[#f0d99f]' : 'text-red-400',
                )}>{result.hook_quality}</p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Engage</p>
                <p className={cn(
                  'text-[11px] font-semibold mt-1',
                  ENGAGEMENT_COLORS[result.engagement_prediction] ?? 'text-white/40',
                )}>
                  {result.engagement_prediction.replace(/_/g, ' ')}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-5">
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-white/[0.08] bg-white/[0.03] text-white/50">
              {TONE_LABELS[result.tone_assessment] ?? result.tone_assessment}
            </span>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-white/[0.08] bg-white/[0.03] text-white/50">
              {result.readability_level.replace(/_/g, ' ')}
            </span>
            <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full border border-white/[0.08] bg-white/[0.03]', AI_RISK_COLORS[result.ai_detection_risk] ?? 'text-white/50')}>
              AI risk: {result.ai_detection_risk.replace(/_/g, ' ')}
            </span>
          </div>

          {result.strengths.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] font-medium text-white/35 uppercase tracking-wider mb-2">What works</p>
              <ul className="space-y-1.5">
                {result.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-white/55">
                    <Check size={12} className="text-[#b5dec2] flex-shrink-0 mt-0.5" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.improvements.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] font-medium text-white/35 uppercase tracking-wider mb-2">Improvements</p>
              <ul className="space-y-1.5">
                {result.improvements.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-white/55">
                    <TrendingUp size={12} className="text-[#f0d99f] flex-shrink-0 mt-0.5" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.suggested_rewrite_of_first_line && (
            <div className="rounded-xl border border-[#98b3ff]/15 bg-[#98b3ff]/[0.03] px-4 py-3">
              <p className="text-[10px] font-medium text-[#98b3ff]/60 uppercase tracking-wider mb-2">Stronger opening</p>
              <p className="text-[13px] text-white/65 leading-relaxed italic">
                &ldquo;{result.suggested_rewrite_of_first_line}&rdquo;
              </p>
            </div>
          )}
        </GlassCard>
      )}
    </div>
  );
}
