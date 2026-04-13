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
  high: 'text-[var(--badge-green-text)] bg-[var(--badge-green-text)]/10',
  above_average: 'text-[var(--link)] bg-[var(--link)]/10',
  average: 'text-[var(--badge-amber-text)] bg-[var(--badge-amber-text)]/10',
  below_average: 'text-[var(--badge-amber-text)] bg-[var(--badge-amber-text)]/10',
  low: 'text-[var(--badge-red-text)] bg-[var(--badge-red-text)]/10',
};

const AI_RISK_COLORS: Record<string, string> = {
  very_low: 'text-[var(--badge-green-text)]',
  low: 'text-[var(--link)]',
  moderate: 'text-[var(--badge-amber-text)]',
  high: 'text-[var(--badge-amber-text)]',
  very_high: 'text-[var(--badge-red-text)]',
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
      ? 'text-[var(--badge-green-text)]'
      : result.overall_score >= 60
      ? 'text-[var(--link)]'
      : result.overall_score >= 40
      ? 'text-[var(--badge-amber-text)]'
      : 'text-[var(--badge-red-text)]';

  return (
    <div className="flex flex-col gap-4">
      <GlassCard className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Eye size={16} className="text-[var(--link)]" />
          <h3 className="text-[15px] font-semibold text-[var(--text-strong)]">Writing Analyzer</h3>
        </div>
        <p className="text-[13px] text-[var(--text-soft)] mb-4 leading-relaxed">
          Paste any LinkedIn text to get an instant analysis of tone, readability, engagement potential, and detection risk.
        </p>

        <div className="flex flex-col gap-3">
          <div className="flex gap-1.5 flex-wrap">
            {CONTEXT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setContext(opt.value)}
                className={cn(
                  'text-[13px] font-medium px-3 py-1 rounded-full border transition-colors',
                  context === opt.value
                    ? 'text-[var(--link)] border-[var(--link)]/30 bg-[var(--link)]/[0.08]'
                    : 'text-[var(--text-soft)] border-[var(--line-soft)] bg-[var(--accent-muted)] hover:text-[var(--text-soft)] hover:border-[var(--line-strong)]',
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
            className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2.5 text-[13px] text-[var(--text-muted)] placeholder:text-[var(--text-soft)] resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:border-[var(--link)]/30"
          />

          <div className="flex items-center justify-between">
            <span className="text-[13px] text-[var(--text-soft)]">{text.length} characters</span>
          </div>

          {error && (
            <div className="rounded-xl border border-[var(--badge-red-text)]/20 bg-[var(--badge-red-text)]/[0.06] px-4 py-3 flex items-center gap-3">
              <AlertCircle size={14} className="text-[var(--badge-red-text)] flex-shrink-0" />
              <p className="text-[12px] text-[var(--badge-red-text)]/80">{error}</p>
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
              <span className="text-[12px] text-[var(--text-soft)] uppercase tracking-wider">Quality</span>
            </div>
            <div className="flex-1 min-w-0 grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-3 text-center">
                <p className="text-[12px] text-[var(--text-soft)] uppercase tracking-wider mb-1">Authenticity</p>
                <p className={cn(
                  'text-[18px] font-bold tabular-nums',
                  result.authenticity_score >= 80 ? 'text-[var(--badge-green-text)]' :
                  result.authenticity_score >= 60 ? 'text-[var(--badge-amber-text)]' : 'text-[var(--badge-red-text)]',
                )}>{result.authenticity_score}</p>
              </div>
              <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-3 text-center">
                <p className="text-[12px] text-[var(--text-soft)] uppercase tracking-wider mb-1">Hook</p>
                <p className={cn(
                  'text-[18px] font-bold tabular-nums',
                  result.hook_quality >= 70 ? 'text-[var(--link)]' :
                  result.hook_quality >= 50 ? 'text-[var(--badge-amber-text)]' : 'text-[var(--badge-red-text)]',
                )}>{result.hook_quality}</p>
              </div>
              <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-3 text-center">
                <p className="text-[12px] text-[var(--text-soft)] uppercase tracking-wider mb-1">Engage</p>
                <p className={cn(
                  'text-[13px] font-semibold mt-1',
                  ENGAGEMENT_COLORS[result.engagement_prediction] ?? 'text-[var(--text-soft)]',
                )}>
                  {result.engagement_prediction.replace(/_/g, ' ')}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-5">
            <span className="text-[12px] font-medium px-2 py-0.5 rounded-full border border-[var(--line-soft)] bg-[var(--accent-muted)] text-[var(--text-soft)]">
              {TONE_LABELS[result.tone_assessment] ?? result.tone_assessment}
            </span>
            <span className="text-[12px] font-medium px-2 py-0.5 rounded-full border border-[var(--line-soft)] bg-[var(--accent-muted)] text-[var(--text-soft)]">
              {result.readability_level.replace(/_/g, ' ')}
            </span>
            <span className={cn('text-[12px] font-medium px-2 py-0.5 rounded-full border border-[var(--line-soft)] bg-[var(--accent-muted)]', AI_RISK_COLORS[result.ai_detection_risk] ?? 'text-[var(--text-soft)]')} title="How natural and authentic the writing sounds">
              Authenticity: {result.ai_detection_risk === 'very_low' ? 'very strong' : result.ai_detection_risk === 'low' ? 'strong' : result.ai_detection_risk === 'moderate' ? 'fair' : result.ai_detection_risk === 'high' ? 'weak' : 'needs work'}
            </span>
          </div>

          {result.strengths.length > 0 && (
            <div className="mb-4">
              <p className="text-[12px] font-medium text-[var(--text-soft)] uppercase tracking-wider mb-2">What works</p>
              <ul className="space-y-1.5">
                {result.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-[var(--text-soft)]">
                    <Check size={12} className="text-[var(--badge-green-text)] flex-shrink-0 mt-0.5" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.improvements.length > 0 && (
            <div className="mb-4">
              <p className="text-[12px] font-medium text-[var(--text-soft)] uppercase tracking-wider mb-2">Improvements</p>
              <ul className="space-y-1.5">
                {result.improvements.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-[var(--text-soft)]">
                    <TrendingUp size={12} className="text-[var(--badge-amber-text)] flex-shrink-0 mt-0.5" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.suggested_rewrite_of_first_line && (
            <div className="rounded-xl border border-[var(--link)]/15 bg-[var(--link)]/[0.03] px-4 py-3">
              <p className="text-[12px] font-medium text-[var(--link)]/60 uppercase tracking-wider mb-2">Stronger opening</p>
              <p className="text-[13px] text-[var(--text-soft)] leading-relaxed italic">
                &ldquo;{result.suggested_rewrite_of_first_line}&rdquo;
              </p>
            </div>
          )}
        </GlassCard>
      )}
    </div>
  );
}
