import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import type { PanelData } from '@/types/panels';

interface BenchmarkInspectorCardProps {
  panelData: PanelData | null;
  benchmarkEditSummary?: {
    version: number | null;
    edited_at: string | null;
    note: string | null;
    assumption_key_count: number;
    assumption_keys: string[];
  } | null;
  replanSummary?: {
    pending: boolean;
    requires_restart: boolean;
    benchmark_edit_version: number | null;
  } | null;
  replanStatus?: {
    state: 'requested' | 'in_progress' | 'completed';
    benchmark_edit_version: number;
  } | null;
  onSaveAssumptions?: (assumptions: Record<string, unknown>, note?: string) => Promise<{ success: boolean; message: string }>;
  isSaving?: boolean;
}

export function BenchmarkInspectorCard({
  panelData,
  benchmarkEditSummary,
  replanSummary,
  replanStatus,
  onSaveAssumptions,
  isSaving,
}: BenchmarkInspectorCardProps) {
  const researchPanel = panelData?.type === 'research_dashboard' ? panelData : null;
  const benchmarkAssumptions = (researchPanel?.benchmark?.assumptions && typeof researchPanel.benchmark.assumptions === 'object')
    ? researchPanel.benchmark.assumptions as Record<string, unknown>
    : {};
  const inferredAssumptions = (researchPanel?.benchmark?.inferred_assumptions && typeof researchPanel.benchmark.inferred_assumptions === 'object')
    ? researchPanel.benchmark.inferred_assumptions as Record<string, unknown>
    : {};
  const assumptionProvenance = (researchPanel?.benchmark?.assumption_provenance && typeof researchPanel.benchmark.assumption_provenance === 'object')
    ? researchPanel.benchmark.assumption_provenance
    : {};
  const confidenceByAssumption = (researchPanel?.benchmark?.confidence_by_assumption && typeof researchPanel.benchmark.confidence_by_assumption === 'object')
    ? researchPanel.benchmark.confidence_by_assumption
    : {};
  const whyInferred = (researchPanel?.benchmark?.why_inferred && typeof researchPanel.benchmark.why_inferred === 'object')
    ? researchPanel.benchmark.why_inferred
    : {};
  const assumptionEntries = Object.entries(benchmarkAssumptions).filter(([, value]) => value != null);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState('');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [companyValue, setCompanyValue] = useState(
    (typeof benchmarkAssumptions.company_name === 'string' ? benchmarkAssumptions.company_name : null)
    ?? researchPanel?.company?.company_name
    ?? '',
  );
  const [seniorityValue, setSeniorityValue] = useState(
    (typeof benchmarkAssumptions.seniority_level === 'string' ? benchmarkAssumptions.seniority_level : null)
    ?? researchPanel?.jd_requirements?.seniority_level
    ?? '',
  );
  const [mustHavesText, setMustHavesText] = useState((researchPanel?.jd_requirements?.must_haves ?? []).join('\n'));
  const [keywordsText, setKeywordsText] = useState((researchPanel?.benchmark?.language_keywords ?? []).join('\n'));
  const [differentiatorsText, setDifferentiatorsText] = useState(
    (
      researchPanel?.benchmark?.competitive_differentiators
      ?? Object.values(researchPanel?.benchmark?.section_expectations ?? {}).filter((v): v is string => typeof v === 'string')
    ).join('\n'),
  );
  const [idealSummary, setIdealSummary] = useState(
    researchPanel?.benchmark?.ideal_candidate_summary ?? researchPanel?.benchmark?.ideal_profile ?? '',
  );

  useEffect(() => {
    if (!researchPanel) return;
    const assumptions = (researchPanel.benchmark?.assumptions && typeof researchPanel.benchmark.assumptions === 'object')
      ? researchPanel.benchmark.assumptions as Record<string, unknown>
      : {};
    setCompanyValue(
      (typeof assumptions.company_name === 'string' ? assumptions.company_name : null)
      ?? researchPanel.company?.company_name
      ?? '',
    );
    setSeniorityValue(
      (typeof assumptions.seniority_level === 'string' ? assumptions.seniority_level : null)
      ?? researchPanel.jd_requirements?.seniority_level
      ?? '',
    );
    setMustHavesText((researchPanel.jd_requirements?.must_haves ?? []).join('\n'));
    setKeywordsText((researchPanel.benchmark?.language_keywords ?? []).join('\n'));
    setDifferentiatorsText(
      (
        researchPanel.benchmark?.competitive_differentiators
        ?? Object.values(researchPanel.benchmark?.section_expectations ?? {}).filter((v): v is string => typeof v === 'string')
      ).join('\n'),
    );
    setIdealSummary(researchPanel.benchmark?.ideal_candidate_summary ?? researchPanel.benchmark?.ideal_profile ?? '');
    setNote('');
    setSaveMessage(null);
    setSaveError(null);
  }, [researchPanel]);

  if (!researchPanel) return null;

  const companyName = researchPanel.company?.company_name ?? 'Unknown company';
  const seniority = researchPanel.jd_requirements?.seniority_level ?? 'Not inferred yet';
  const mustHaveCount = researchPanel.jd_requirements?.must_haves?.length ?? 0;
  const keywordCount = researchPanel.benchmark?.language_keywords?.length ?? 0;
  const differentiatorCount = researchPanel.benchmark?.competitive_differentiators?.length
    ?? Object.keys(researchPanel.benchmark?.section_expectations ?? {}).length;
  const visibleAssumptionEntries = assumptionEntries
    .filter(([, value]) => {
      if (typeof value === 'string') return value.trim().length > 0;
      return value != null;
    })
    .slice(0, 8);
  const latestEditVersion = benchmarkEditSummary?.version ?? null;
  const pendingReplanForLatestEdit = latestEditVersion != null
    && (
      replanSummary?.pending === true && replanSummary.benchmark_edit_version === latestEditVersion
      || replanStatus?.state === 'requested' && replanStatus.benchmark_edit_version === latestEditVersion
      || replanStatus?.state === 'in_progress' && replanStatus.benchmark_edit_version === latestEditVersion
    );
  const appliedLatestEdit = latestEditVersion != null
    && replanStatus?.state === 'completed'
    && replanStatus.benchmark_edit_version === latestEditVersion;

  const handleSave = async () => {
    if (!onSaveAssumptions) return;
    setSaveMessage(null);
    setSaveError(null);
    const assumptions = {
      company_name: companyValue.trim(),
      seniority_level: seniorityValue.trim(),
      must_haves: mustHavesText.split('\n').map((s) => s.trim()).filter(Boolean),
      benchmark_keywords: keywordsText.split('\n').map((s) => s.trim()).filter(Boolean),
      competitive_differentiators: differentiatorsText.split('\n').map((s) => s.trim()).filter(Boolean),
      ideal_candidate_summary: idealSummary.trim(),
    };
    const result = await onSaveAssumptions(assumptions, note.trim() || undefined);
    if (result.success) {
      setSaveMessage(result.message);
      setEditing(false);
    } else {
      setSaveError(result.message);
    }
  };

  return (
    <GlassCard className="mb-3 p-4">
      <div className="mb-2 flex items-center gap-2">
        <History className="h-4 w-4 text-[#afc4ff]/70" />
        <h3 className="text-sm font-semibold text-white/88">Benchmark Inspector</h3>
        <div className="ml-auto flex items-center gap-2">
          <GlassButton
            type="button"
            variant="ghost"
            onClick={() => setEditing((prev) => !prev)}
            className="h-auto px-2 py-1 text-[11px]"
          >
            {editing ? 'Close' : 'Edit Assumptions'}
          </GlassButton>
        </div>
      </div>
      <p className="mb-3 text-xs text-white/56">
        These are the current inferred benchmark assumptions driving positioning decisions. Edits apply immediately early in the process; after section writing starts, changes require confirmation and a downstream rebuild to stay consistent.
      </p>
      {benchmarkEditSummary?.version != null && (
        <div className="mb-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
              Latest Benchmark Edit
            </span>
            <span className="rounded-full border border-white/[0.1] bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/70">
              v{benchmarkEditSummary.version}
            </span>
            {pendingReplanForLatestEdit && (
              <span className="rounded-full border border-sky-300/20 bg-sky-400/[0.06] px-2 py-0.5 text-[10px] text-sky-100/85">
                Pending apply
              </span>
            )}
            {appliedLatestEdit && (
              <span className="rounded-full border border-emerald-300/20 bg-emerald-400/[0.06] px-2 py-0.5 text-[10px] text-emerald-100/85">
                Applied to run
              </span>
            )}
            {!pendingReplanForLatestEdit && !appliedLatestEdit && (
              <span className="rounded-full border border-white/[0.1] bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/60">
                Saved
              </span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-white/55">
            {benchmarkEditSummary.edited_at
              ? `Edited ${new Date(benchmarkEditSummary.edited_at).toLocaleString()}`
              : 'Edit time unavailable'}
            {' • '}
            {benchmarkEditSummary.assumption_key_count} field{benchmarkEditSummary.assumption_key_count === 1 ? '' : 's'} changed
          </div>
          {benchmarkEditSummary.note && (
            <div className="mt-1 text-[11px] leading-relaxed text-white/62">
              Note: {benchmarkEditSummary.note}
            </div>
          )}
        </div>
      )}
      {visibleAssumptionEntries.length > 0 && (
        <div className="mb-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
            Inferred Assumptions (Why + Confidence)
          </div>
          <div className="space-y-2">
            {visibleAssumptionEntries.map(([key, value]) => {
              const confidence = typeof confidenceByAssumption[key] === 'number'
                ? confidenceByAssumption[key]
                : null;
              const why = typeof whyInferred[key] === 'string' ? whyInferred[key] : null;
              const provenance = assumptionProvenance[key];
              const isUserEdited = provenance?.source === 'user_edited';
              const originalValue = inferredAssumptions[key];
              const stringValue = Array.isArray(value)
                ? value.filter((v): v is string | number => typeof v === 'string' || typeof v === 'number').slice(0, 5).join(', ')
                : typeof value === 'number'
                  ? String(value)
                  : (typeof value === 'string' ? value : JSON.stringify(value));
              const originalStringValue = Array.isArray(originalValue)
                ? originalValue.filter((v): v is string | number => typeof v === 'string' || typeof v === 'number').slice(0, 5).join(', ')
                : typeof originalValue === 'number'
                  ? String(originalValue)
                  : (typeof originalValue === 'string' ? originalValue : (originalValue == null ? '' : JSON.stringify(originalValue)));
              const confidenceClass = confidence == null
                ? 'border-white/[0.1] bg-white/[0.03] text-white/60'
                : confidence >= 0.85
                  ? 'border-emerald-300/20 bg-emerald-400/[0.06] text-emerald-100/85'
                  : confidence >= 0.65
                    ? 'border-sky-300/20 bg-sky-400/[0.06] text-sky-100/85'
                    : 'border-amber-300/20 bg-amber-400/[0.06] text-amber-100/85';
              return (
                <div key={key} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] uppercase tracking-[0.12em] text-white/45">
                      {key.replace(/_/g, ' ')}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${
                      isUserEdited
                        ? 'border-violet-300/20 bg-violet-400/[0.08] text-violet-100/85'
                        : 'border-white/[0.1] bg-white/[0.03] text-white/60'
                    }`}>
                      {isUserEdited ? 'User edited' : 'Inferred'}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${confidenceClass}`}>
                      {confidence == null ? 'Confidence n/a' : `Confidence ${Math.round(confidence * 100)}%`}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-white/84 break-words">
                    {String(stringValue ?? 'Not inferred')}
                  </div>
                  {isUserEdited && originalStringValue && originalStringValue !== String(stringValue ?? '') && (
                    <div className="mt-1 text-[10px] text-white/45 break-words">
                      Originally inferred: {originalStringValue}
                    </div>
                  )}
                  {why && (
                    <div className="mt-1 text-[10px] leading-relaxed text-white/50">
                      {why}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {saveMessage && (
        <div className="mb-3 rounded-lg border border-emerald-300/20 bg-emerald-400/[0.06] px-3 py-2 text-xs text-emerald-100/85">
          {saveMessage}
        </div>
      )}
      {saveError && (
        <div className="mb-3 rounded-lg border border-red-300/20 bg-red-400/[0.06] px-3 py-2 text-xs text-red-100/85">
          {saveError}
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/45">Company</div>
          <div className="mt-1 text-xs text-white/84">{companyName}</div>
        </div>
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/45">Seniority</div>
          <div className="mt-1 text-xs text-white/84">{seniority}</div>
        </div>
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/45">Must-Haves</div>
          <div className="mt-1 text-xs text-white/84">{mustHaveCount}</div>
        </div>
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/45">Benchmark Keywords</div>
          <div className="mt-1 text-xs text-white/84">{keywordCount}</div>
        </div>
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2 sm:col-span-2">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/45">Competitive Differentiators</div>
          <div className="mt-1 text-xs text-white/84">{differentiatorCount}</div>
        </div>
      </div>
      {editing && (
        <div className="mt-3 space-y-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs text-white/65">
              <span className="mb-1 block">Company</span>
              <input
                value={companyValue}
                onChange={(e) => setCompanyValue(e.target.value)}
                className="w-full rounded-lg border border-white/[0.12] bg-white/[0.03] px-2.5 py-2 text-xs text-white/90 outline-none focus:border-[#afc4ff]/40"
              />
            </label>
            <label className="text-xs text-white/65">
              <span className="mb-1 block">Seniority</span>
              <input
                value={seniorityValue}
                onChange={(e) => setSeniorityValue(e.target.value)}
                className="w-full rounded-lg border border-white/[0.12] bg-white/[0.03] px-2.5 py-2 text-xs text-white/90 outline-none focus:border-[#afc4ff]/40"
              />
            </label>
          </div>
          <label className="block text-xs text-white/65">
            <span className="mb-1 block">Must-Haves (one per line)</span>
            <textarea
              value={mustHavesText}
              onChange={(e) => setMustHavesText(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-white/[0.12] bg-white/[0.03] px-2.5 py-2 text-xs text-white/90 outline-none focus:border-[#afc4ff]/40"
            />
          </label>
          <label className="block text-xs text-white/65">
            <span className="mb-1 block">Benchmark Keywords (one per line)</span>
            <textarea
              value={keywordsText}
              onChange={(e) => setKeywordsText(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-white/[0.12] bg-white/[0.03] px-2.5 py-2 text-xs text-white/90 outline-none focus:border-[#afc4ff]/40"
            />
          </label>
          <label className="block text-xs text-white/65">
            <span className="mb-1 block">Competitive Differentiators (one per line)</span>
            <textarea
              value={differentiatorsText}
              onChange={(e) => setDifferentiatorsText(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-white/[0.12] bg-white/[0.03] px-2.5 py-2 text-xs text-white/90 outline-none focus:border-[#afc4ff]/40"
            />
          </label>
          <label className="block text-xs text-white/65">
            <span className="mb-1 block">Ideal Candidate Summary</span>
            <textarea
              value={idealSummary}
              onChange={(e) => setIdealSummary(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-white/[0.12] bg-white/[0.03] px-2.5 py-2 text-xs text-white/90 outline-none focus:border-[#afc4ff]/40"
            />
          </label>
          <label className="block text-xs text-white/65">
            <span className="mb-1 block">Note (optional)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-lg border border-white/[0.12] bg-white/[0.03] px-2.5 py-2 text-xs text-white/90 outline-none focus:border-[#afc4ff]/40"
              placeholder="Why you are changing these assumptions"
            />
          </label>
          <div className="flex justify-end gap-2">
            <GlassButton
              type="button"
              variant="ghost"
              onClick={() => { setEditing(false); setNote(''); }}
              className="h-auto px-3 py-2 text-xs"
            >
              Cancel
            </GlassButton>
            <GlassButton
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="h-auto px-3 py-2 text-xs"
            >
              {isSaving ? 'Saving...' : 'Save Assumptions'}
            </GlassButton>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
