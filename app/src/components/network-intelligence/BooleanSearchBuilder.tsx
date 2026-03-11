import { useState, useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { supabase } from '@/lib/supabase';
import { API_BASE } from '@/lib/api';
import {
  Sparkles,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  Pencil,
  X,
  Linkedin,
  Globe,
  Search,
} from 'lucide-react';

// --- Types ---

interface BooleanSearchResult {
  id: string;
  linkedin: string;
  indeed: string;
  google: string;
  extractedTerms: {
    skills: string[];
    titles: string[];
    industries: string[];
  };
  generatedAt: string;
}

export interface BooleanSearchBuilderProps {
  accessToken: string | null;
}

// --- Syntax highlighting ---

/**
 * Tokenize a boolean search string into spans with semantic color classes.
 * Operators (AND/OR/NOT) → blue, quoted phrases → emerald, negative prefix → amber,
 * parentheses → muted, plain text → default.
 */
function HighlightedString({ value }: { value: string }) {
  // Split on quoted strings, operators, parens so we can color each segment
  const tokens = value.split(/("(?:[^"\\]|\\.)*"|\b(?:AND|OR|NOT)\b|[()])/g);

  return (
    <code className="font-mono text-[12px] leading-relaxed break-all whitespace-pre-wrap">
      {tokens.map((token, i) => {
        if (/^"/.test(token)) {
          return <span key={i} className="text-[#57CDA4]">{token}</span>;
        }
        if (/^\b(AND|OR)\b$/.test(token)) {
          return <span key={i} className="text-[#98b3ff] font-semibold">{token}</span>;
        }
        if (/^\bNOT\b$/.test(token)) {
          return <span key={i} className="text-[#f0d99f] font-semibold">{token}</span>;
        }
        if (/^-"/.test(token)) {
          return <span key={i} className="text-[#f0d99f]">{token}</span>;
        }
        if (/^[()]$/.test(token)) {
          return <span key={i} className="text-white/35">{token}</span>;
        }
        return <span key={i} className="text-white/70">{token}</span>;
      })}
    </code>
  );
}

// --- Per-platform card ---

interface Platform {
  key: keyof Pick<BooleanSearchResult, 'linkedin' | 'indeed' | 'google'>;
  label: string;
  icon: typeof Linkedin;
  accent: string;
}

const PLATFORMS: Platform[] = [
  { key: 'linkedin', label: 'LinkedIn', icon: Linkedin, accent: '#98b3ff' },
  { key: 'indeed', label: 'Indeed', icon: Search, accent: '#57CDA4' },
  { key: 'google', label: 'Google X-Ray', icon: Globe, accent: '#f0d99f' },
];

interface PlatformCardProps {
  platform: Platform;
  value: string;
  onUpdate: (value: string) => void;
}

function PlatformCard({ platform, value, onUpdate }: PlatformCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const Icon = platform.icon;

  // Keep draft in sync if value changes externally (e.g. new generation)
  useEffect(() => {
    setDraft(value);
    setEditing(false);
  }, [value]);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [editing]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(editing ? draft : value).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [value, draft, editing]);

  const handleSave = useCallback(() => {
    onUpdate(draft);
    setEditing(false);
  }, [draft, onUpdate]);

  const handleCancel = useCallback(() => {
    setDraft(value);
    setEditing(false);
  }, [value]);

  return (
    <div
      className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-5 flex flex-col gap-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="h-8 w-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${platform.accent}15` }}
          >
            <Icon size={15} style={{ color: platform.accent }} />
          </div>
          <span className="text-[14px] font-semibold text-white/85">{platform.label}</span>
        </div>

        <div className="flex items-center gap-1.5">
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              title="Edit search string"
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-colors"
            >
              <Pencil size={11} />
              Edit
            </button>
          )}
          {editing && (
            <>
              <button
                type="button"
                onClick={handleSave}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-[#57CDA4]/70 hover:text-[#57CDA4] hover:bg-[#57CDA4]/[0.06] transition-colors"
              >
                Save
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] text-white/25 hover:text-white/50 transition-colors"
              >
                <X size={11} />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={handleCopy}
            title="Copy to clipboard"
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-colors"
          >
            {copied ? (
              <><Check size={11} className="text-[#57CDA4]" /> Copied</>
            ) : (
              <><Copy size={11} /> Copy</>
            )}
          </button>
        </div>
      </div>

      {/* String display / edit */}
      {editing ? (
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 font-mono text-[12px] text-white/80 placeholder:text-white/25 focus:border-[#98b3ff]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 resize-none leading-relaxed"
        />
      ) : (
        <div className="rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3">
          <HighlightedString value={value} />
        </div>
      )}
    </div>
  );
}

// --- Extracted terms ---

interface TermPillProps {
  label: string;
  color: string;
}

function TermPill({ label, color }: TermPillProps) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium"
      style={{ color, backgroundColor: `${color}15` }}
    >
      {label}
    </span>
  );
}

interface ExtractedTermsProps {
  terms: BooleanSearchResult['extractedTerms'];
}

function ExtractedTerms({ terms }: ExtractedTermsProps) {
  const hasAny = terms.skills.length > 0 || terms.titles.length > 0 || terms.industries.length > 0;
  if (!hasAny) return null;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 flex flex-col gap-4">
      <h3 className="text-[13px] font-semibold text-white/60">Extracted Terms</h3>
      <div className="flex flex-col gap-3">
        {terms.titles.length > 0 && (
          <div>
            <span className="text-[11px] text-white/30 uppercase tracking-wider">Titles</span>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {terms.titles.map((t) => <TermPill key={t} label={t} color="#98b3ff" />)}
            </div>
          </div>
        )}
        {terms.skills.length > 0 && (
          <div>
            <span className="text-[11px] text-white/30 uppercase tracking-wider">Skills</span>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {terms.skills.map((s) => <TermPill key={s} label={s} color="#57CDA4" />)}
            </div>
          </div>
        )}
        {terms.industries.length > 0 && (
          <div>
            <span className="text-[11px] text-white/30 uppercase tracking-wider">Industries</span>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {terms.industries.map((ind) => <TermPill key={ind} label={ind} color="#f0d99f" />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Main component ---

export function BooleanSearchBuilder({ accessToken }: BooleanSearchBuilderProps) {
  const [resumeText, setResumeText] = useState('');
  const [resumeLoading, setResumeLoading] = useState(true);
  const [targetTitles, setTargetTitles] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BooleanSearchResult | null>(null);
  // Allow per-platform edits after generation
  const [overrides, setOverrides] = useState<Partial<Record<keyof Pick<BooleanSearchResult, 'linkedin' | 'indeed' | 'google'>, string>>>({});

  // Auto-load resume text from master_resumes
  useEffect(() => {
    let cancelled = false;
    async function loadResume() {
      setResumeLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id || cancelled) return;
        const { data } = await supabase
          .from('master_resumes')
          .select('raw_text')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!cancelled && data?.raw_text) {
          setResumeText(data.raw_text);
        }
      } catch {
        // Silently fall back to empty — user can paste manually
      } finally {
        if (!cancelled) setResumeLoading(false);
      }
    }
    void loadResume();
    return () => { cancelled = true; };
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!resumeText.trim() || resumeText.trim().length < 50) {
      setError('Resume text is required (minimum 50 characters).');
      return;
    }
    setError(null);
    setStatus('loading');
    setOverrides({});

    try {
      const res = await fetch(`${API_BASE}/ni/boolean-search/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          resume_text: resumeText.trim(),
          target_titles: targetTitles
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
      }

      const data = await res.json() as BooleanSearchResult;
      setResult(data);
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setStatus('error');
    }
  }, [resumeText, targetTitles, accessToken]);

  const handlePlatformUpdate = useCallback(
    (key: keyof Pick<BooleanSearchResult, 'linkedin' | 'indeed' | 'google'>, value: string) => {
      setOverrides((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const resolvedValue = (key: Platform['key']) =>
    overrides[key] ?? result?.[key] ?? '';

  const isLoading = status === 'loading';
  const canGenerate = !isLoading && resumeText.trim().length >= 50;

  return (
    <div className="flex flex-col gap-6">
      {/* Intro + input card */}
      <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-[#98b3ff]/[0.05] to-white/[0.01] p-6 flex flex-col gap-5">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 rounded-xl bg-[#98b3ff]/10 flex items-center justify-center flex-shrink-0">
            <Search size={18} className="text-[#98b3ff]" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-white/85 mb-1">Boolean Search Generator</h3>
            <p className="text-[13px] text-white/45 leading-relaxed">
              Generate optimized Boolean search strings for LinkedIn, Indeed, and Google X-Ray from your
              resume. Use them to find roles — or to see how recruiters are finding candidates like you.
            </p>
          </div>
        </div>

        {/* Resume text */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="bool-resume" className="text-[12px] text-white/40 font-medium">
            Resume Text
            {resumeLoading && <span className="ml-2 text-white/25 font-normal">Loading...</span>}
          </label>
          <textarea
            id="bool-resume"
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder={resumeLoading ? 'Loading your resume...' : 'Paste your resume text here (min 50 characters)'}
            rows={5}
            disabled={resumeLoading}
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-[13px] text-white/80 placeholder:text-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:ring-2 focus:ring-[#98b3ff]/20 focus:border-[#98b3ff]/30 transition-colors resize-none disabled:opacity-40"
          />
        </div>

        {/* Optional target titles */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="bool-titles" className="text-[12px] text-white/40 font-medium">
            Target Titles <span className="text-white/25 font-normal">(optional, comma-separated)</span>
          </label>
          <input
            id="bool-titles"
            type="text"
            value={targetTitles}
            onChange={(e) => setTargetTitles(e.target.value)}
            placeholder="e.g. VP of Operations, Director of Supply Chain"
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-[13px] text-white/80 placeholder:text-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:ring-2 focus:ring-[#98b3ff]/20 focus:border-[#98b3ff]/30 transition-colors"
          />
        </div>

        <div className="flex items-center gap-3">
          <GlassButton onClick={handleGenerate} disabled={!canGenerate}>
            {isLoading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles size={14} />
                {result ? 'Regenerate' : 'Generate Search Strings'}
              </>
            )}
          </GlassButton>

          {result && !isLoading && (
            <span className="text-[11px] text-white/25">
              Generated {new Date(result.generatedAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      {/* Error */}
      {(error) && (
        <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3">
          <AlertCircle size={15} className="text-red-400 flex-shrink-0" />
          <p className="text-[13px] text-red-300/80">{error}</p>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <GlassCard className="p-6 flex items-center gap-3">
          <Loader2 size={16} className="animate-spin text-[#98b3ff]" />
          <span className="text-[13px] text-white/55">Analyzing your resume and building search strings...</span>
        </GlassCard>
      )}

      {/* Results */}
      {status === 'done' && result && (
        <>
          {/* Legend */}
          <div className="flex items-center gap-4 px-1">
            <span className="text-[11px] text-white/25 uppercase tracking-wider">Syntax</span>
            <span className="text-[11px] text-[#98b3ff]">AND / OR</span>
            <span className="text-[11px] text-[#f0d99f]">NOT</span>
            <span className="text-[11px] text-[#57CDA4]">"quoted phrase"</span>
          </div>

          {/* Platform cards */}
          <div className="flex flex-col gap-4">
            {PLATFORMS.map((platform) => (
              <PlatformCard
                key={platform.key}
                platform={platform}
                value={resolvedValue(platform.key)}
                onUpdate={(val) => handlePlatformUpdate(platform.key, val)}
              />
            ))}
          </div>

          {/* Extracted terms */}
          <ExtractedTerms terms={result.extractedTerms} />
        </>
      )}
    </div>
  );
}
