import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import {
  Search,
  AlertCircle,
  Loader2,
  Zap,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { API_BASE } from '@/lib/api';

interface RecruiterSimResult {
  visibility_score: number;
  rank_assessment: string;
  keyword_matches: string[];
  keyword_gaps: string[];
  profile_completeness_feedback: string;
  top_recommendation: string;
  full_explanation: string;
}

const RANK_LABELS: Record<string, string> = {
  top_10_percent: 'Top 10%',
  top_25_percent: 'Top 25%',
  average: 'Average',
  below_average: 'Below Average',
  unlikely_to_appear: 'Unlikely to Appear',
};

const RANK_COLORS: Record<string, string> = {
  top_10_percent: 'text-[var(--badge-green-text)] border-[var(--badge-green-text)]/20 bg-[var(--badge-green-text)]/[0.04]',
  top_25_percent: 'text-[var(--link)] border-[var(--link)]/20 bg-[var(--link)]/[0.04]',
  average: 'text-[var(--badge-amber-text)] border-[var(--badge-amber-text)]/20 bg-[var(--badge-amber-text)]/[0.04]',
  below_average: 'text-[var(--badge-amber-text)] border-[var(--badge-amber-text)]/20 bg-[var(--badge-amber-text)]/[0.04]',
  unlikely_to_appear: 'text-[var(--badge-red-text)] border-[var(--badge-red-text)]/20 bg-[var(--badge-red-text)]/[0.04]',
};

export function RecruiterSimulator() {
  const [searchTerms, setSearchTerms] = useState('');
  const [headline, setHeadline] = useState('');
  const [about, setAbout] = useState('');
  const [skills, setSkills] = useState('');
  const [result, setResult] = useState<RecruiterSimResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = useCallback(async () => {
    if (!searchTerms.trim()) {
      setError('Enter at least one search term to simulate.');
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

      const res = await fetch(`${API_BASE}/linkedin-tools/recruiter-sim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          search_terms: searchTerms.trim(),
          headline: headline.trim() || undefined,
          about_section: about.trim() || undefined,
          skills: skills.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        setError(`Analysis failed (${res.status}): ${body}`);
        return;
      }

      const data = (await res.json()) as { result: RecruiterSimResult };
      setResult(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }, [searchTerms, headline, about, skills]);

  const scoreColor =
    !result
      ? ''
      : result.visibility_score >= 80
      ? 'text-[var(--badge-green-text)]'
      : result.visibility_score >= 60
      ? 'text-[var(--link)]'
      : result.visibility_score >= 40
      ? 'text-[var(--badge-amber-text)]'
      : 'text-[var(--badge-red-text)]';

  return (
    <div className="flex flex-col gap-4">
      <GlassCard className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Search size={16} className="text-[var(--link)]" />
          <h3 className="text-[15px] font-semibold text-[var(--text-strong)]">Recruiter Search Simulator</h3>
        </div>
        <p className="text-[13px] text-[var(--text-soft)] mb-4 leading-relaxed">
          Enter the search terms a recruiter might use and paste your profile sections to see how you'd rank — and what's holding you back.
        </p>

        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-[13px] font-medium text-[var(--text-soft)] uppercase tracking-wider mb-1.5">
              Recruiter Search Terms <span className="text-[var(--badge-red-text)]">*</span>
            </label>
            <input
              type="text"
              value={searchTerms}
              onChange={(e) => setSearchTerms(e.target.value)}
              placeholder="e.g. VP Operations manufacturing supply chain"
              className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2.5 text-[13px] text-[var(--text-muted)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:border-[var(--link)]/30"
            />
          </div>

          <div>
            <label className="block text-[13px] font-medium text-[var(--text-soft)] uppercase tracking-wider mb-1.5">
              LinkedIn Headline
            </label>
            <input
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="Your current LinkedIn headline"
              className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2.5 text-[13px] text-[var(--text-muted)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:border-[var(--link)]/30"
            />
          </div>

          <div>
            <label className="block text-[13px] font-medium text-[var(--text-soft)] uppercase tracking-wider mb-1.5">
              About Section (optional)
            </label>
            <textarea
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              placeholder="Paste your About section for a more detailed analysis..."
              rows={3}
              className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2.5 text-[13px] text-[var(--text-muted)] placeholder:text-[var(--text-soft)] resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:border-[var(--link)]/30"
            />
          </div>

          <div>
            <label className="block text-[13px] font-medium text-[var(--text-soft)] uppercase tracking-wider mb-1.5">
              Skills (optional)
            </label>
            <input
              type="text"
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
              placeholder="e.g. Supply Chain, P&L Management, Lean Manufacturing"
              className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2.5 text-[13px] text-[var(--text-muted)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:border-[var(--link)]/30"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-[var(--badge-red-text)]/20 bg-[var(--badge-red-text)]/[0.06] px-4 py-3 flex items-center gap-3">
              <AlertCircle size={14} className="text-[var(--badge-red-text)] flex-shrink-0" />
              <p className="text-[12px] text-[var(--badge-red-text)]/80">{error}</p>
            </div>
          )}

          <GlassButton
            onClick={handleRun}
            disabled={loading || !searchTerms.trim()}
            className="self-start flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                Simulating...
              </>
            ) : (
              <>
                <Search size={13} />
                Run Simulation
              </>
            )}
          </GlassButton>
        </div>
      </GlassCard>

      {result && (
        <GlassCard className="p-6">
          <div className="flex items-start gap-4 mb-5">
            <div className="flex flex-col items-center gap-1">
              <span className={cn('text-[36px] font-bold tabular-nums', scoreColor)}>
                {result.visibility_score}
              </span>
              <span className="text-[12px] text-[var(--text-soft)] uppercase tracking-wider">Visibility</span>
            </div>
            <div className="flex-1 min-w-0">
              <div
                className={cn(
                  'inline-flex items-center text-[13px] font-semibold px-2.5 py-1 rounded-full border mb-2',
                  RANK_COLORS[result.rank_assessment] ?? 'text-[var(--text-soft)] border-[var(--line-soft)] bg-[var(--accent-muted)]',
                )}
              >
                {RANK_LABELS[result.rank_assessment] ?? result.rank_assessment}
              </div>
              <p className="text-[12px] text-[var(--text-soft)] leading-relaxed">
                {result.profile_completeness_feedback}
              </p>
            </div>
          </div>

          {result.keyword_matches.length > 0 && (
            <div className="mb-4">
              <p className="text-[12px] font-medium text-[var(--text-soft)] uppercase tracking-wider mb-2">Keyword Matches</p>
              <div className="flex flex-wrap gap-1.5">
                {result.keyword_matches.map((kw) => (
                  <span key={kw} className="text-[12px] text-[var(--badge-green-text)] bg-[var(--badge-green-text)]/10 px-2 py-0.5 rounded-full">
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}

          {result.keyword_gaps.length > 0 && (
            <div className="mb-4">
              <p className="text-[12px] font-medium text-[var(--text-soft)] uppercase tracking-wider mb-2">Missing Keywords</p>
              <div className="flex flex-wrap gap-1.5">
                {result.keyword_gaps.map((kw) => (
                  <span key={kw} className="text-[12px] text-[var(--badge-amber-text)] bg-[var(--badge-amber-text)]/10 px-2 py-0.5 rounded-full">
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-[var(--link)]/15 bg-[var(--link)]/[0.03] px-4 py-3 mb-4 flex items-start gap-2">
            <Zap size={13} className="text-[var(--link)] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-medium text-[var(--link)]/80 mb-0.5">Top Recommendation</p>
              <p className="text-[12px] text-[var(--text-soft)] leading-relaxed">{result.top_recommendation}</p>
            </div>
          </div>

          <details>
            <summary className="cursor-pointer text-[12px] text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors list-none flex items-center gap-1">
              <ChevronRight size={12} className="transition-transform" />
              Full explanation
            </summary>
            <p className="mt-3 text-[12px] text-[var(--text-soft)] leading-relaxed whitespace-pre-line">
              {result.full_explanation}
            </p>
          </details>
        </GlassCard>
      )}
    </div>
  );
}
