import { useState } from 'react';
import { Copy, Check, Sparkles, Search } from 'lucide-react';
import { API_BASE } from '@/lib/api';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { trackProductEvent } from '@/lib/product-telemetry';

interface BooleanSearchResult {
  linkedin: string;
  indeed: string;
  google: string;
  recommendedTitles: string[];
  extractedTerms: {
    skills: string[];
    titles: string[];
    industries: string[];
  };
  generatedAt: string;
}

type CopyTarget = 'linkedin' | 'indeed' | 'titles';

interface BooleanSearchPanelProps {
  accessToken: string | null;
  resumeText: string;
  loadingResume: boolean;
  onShowAiSuggestions?: () => void;
}

export function BooleanSearchPanel({
  accessToken,
  resumeText,
  loadingResume,
  onShowAiSuggestions,
}: BooleanSearchPanelProps) {
  const [result, setResult] = useState<BooleanSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const canGenerate = Boolean(accessToken && resumeText.trim()) && !loadingResume;

  async function handleGenerate() {
    if (!accessToken || !resumeText.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/ni/boolean-search/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ resume_text: resumeText }),
      });

      if (!response.ok) {
        const message = await response.text();
        setError(`Could not generate search strings (${response.status}): ${message}`);
        return;
      }

      const payload = (await response.json()) as BooleanSearchResult & { id: string };
      const nextResult = {
        linkedin: payload.linkedin,
        indeed: payload.indeed,
        google: payload.google,
        recommendedTitles: Array.isArray(payload.recommendedTitles) ? payload.recommendedTitles : [],
        extractedTerms: payload.extractedTerms ?? { skills: [], titles: [], industries: [] },
        generatedAt: payload.generatedAt,
      };
      setResult(nextResult);
      trackProductEvent('boolean_search_generated', {
        title_count: nextResult.recommendedTitles.length,
        has_resume_text: Boolean(resumeText.trim()),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate search strings.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy(text: string, key: CopyTarget) {
    try {
      await navigator.clipboard.writeText(text);
      trackProductEvent('boolean_search_copied', {
        target: key,
        title_count: result?.recommendedTitles.length ?? 0,
      });
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1500);
    } catch {
      setError('Copy to clipboard failed.');
    }
  }

  const titlePreview = result?.recommendedTitles ?? [];
  const hiddenTitleCount = Math.max(0, titlePreview.length - 12);

  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2">
        <Search size={18} className="text-[var(--link)]" />
        <h3 className="text-[15px] font-semibold text-[var(--text-strong)]">Search Strings</h3>
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-[var(--text-soft)]">
        Generate OR-only job-title strings from your master resume, then paste them into LinkedIn or Indeed.
      </p>

      {loadingResume && (
        <p className="mt-4 text-[12px] text-[var(--text-soft)]">Loading your latest master resume...</p>
      )}

      {!loadingResume && !accessToken && (
        <p className="mt-4 text-[12px] text-[var(--text-soft)]">Sign in to generate search strings.</p>
      )}

      {!loadingResume && accessToken && !resumeText.trim() && (
        <p className="mt-4 text-[12px] text-[var(--text-soft)]">
          Save a master resume first so we can identify the job titles you should be searching for.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <GlassButton onClick={handleGenerate} loading={loading} disabled={!canGenerate}>
          <Sparkles size={14} /> Generate Search Strings
        </GlassButton>
        {onShowAiSuggestions && (
          <GlassButton
            variant="ghost"
            onClick={() => {
              trackProductEvent('more_role_suggestions_requested', { source: 'boolean_search_panel' });
              onShowAiSuggestions();
            }}
          >
            Show More Suggestions
          </GlassButton>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/[0.04] px-4 py-3">
          <p className="text-[12px] text-red-400/70">{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-5 space-y-5">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-soft)]">
              Recommended titles
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {titlePreview.slice(0, 12).map((title) => (
                <span
                  key={title}
                  className="rounded-full border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-1.5 text-[12px] text-[var(--text-soft)]"
                >
                  {title}
                </span>
              ))}
              {hiddenTitleCount > 0 && (
                <span className="rounded-full border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-1.5 text-[12px] text-[var(--text-soft)]">
                  +{hiddenTitleCount} more
                </span>
              )}
            </div>
          </div>

          <SearchStringField
            label="LinkedIn"
            value={result.linkedin}
            copied={copiedKey === 'linkedin'}
            onCopy={() => handleCopy(result.linkedin, 'linkedin')}
          />

          <SearchStringField
            label="Indeed"
            value={result.indeed}
            copied={copiedKey === 'indeed'}
            onCopy={() => handleCopy(result.indeed, 'indeed')}
          />

          <SearchStringField
            label="Title List"
            value={result.recommendedTitles.join('\n')}
            copied={copiedKey === 'titles'}
            onCopy={() => handleCopy(result.recommendedTitles.join('\n'), 'titles')}
          />
        </div>
      )}
    </GlassCard>
  );
}

function SearchStringField({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-soft)]">
          {label}
        </div>
        <GlassButton variant="ghost" size="sm" onClick={onCopy}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </GlassButton>
      </div>
      <textarea
        readOnly
        value={value}
        className="min-h-[92px] w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-3 text-[12px] leading-relaxed text-[var(--text-muted)] focus:outline-none"
      />
    </div>
  );
}
