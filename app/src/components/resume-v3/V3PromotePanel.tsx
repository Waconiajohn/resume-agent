/**
 * V3PromotePanel — post-pipeline "save to knowledge base" surface.
 *
 * Design philosophy (after v1 proved too intrusive):
 *  - Collapsed by default. The resume is the deliverable; the promote
 *    action is a wrap-up. Render as a slim banner below the results.
 *  - Two CTAs in collapsed mode:
 *      * "Save defaults to knowledge base" — one-click commit of
 *        pre-selected high-confidence items. 90% of users want this.
 *      * "Review & pick ▸" — expands into the full checkbox UI.
 *  - Expanded mode: sticky header with counts + Save + Collapse.
 *    Three nested sections (summary / scopes / bullets), each itself
 *    collapsible — bullets (the largest section) starts collapsed.
 *  - Every bullet renders with VISIBLE text (via EditableText's
 *    text-[var(--text-strong)] default) + an inline editor.
 *
 * Selection defaults: summary + scopes auto-checked; bullets
 * auto-checked only when confidence >= 0.7 (high-confidence bucket).
 * Low/medium confidence start unchecked — user opts in.
 */

import { useMemo, useState } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import {
  BookMarked, CheckCircle2, AlertTriangle,
  ChevronDown, ChevronRight, ChevronUp,
} from 'lucide-react';
import { API_BASE } from '@/lib/api';
import { cn } from '@/lib/utils';
import { EditableText } from './EditableText';
import type { V3WrittenResume, V3MasterSummary, V3StructuredResume } from '@/hooks/useV3Pipeline';

interface Props {
  accessToken: string | null;
  sessionId: string;
  written: V3WrittenResume | null;
  /**
   * The classified source resume. Used to filter reverted bullets out of
   * the promotable-item list — a bullet whose text now matches the source
   * bullet it was rewritten from isn't "new" anymore, it's back to the
   * master, and offering it for promotion would pollute the vault.
   */
  structured?: V3StructuredResume | null;
  master: V3MasterSummary | null;
  /** Called after a successful save so the parent can refresh the master summary. */
  onSaved?: () => void | Promise<void>;
}

type PromoteKind = 'summary' | 'scope' | 'bullet';
interface PromoteItem {
  key: string;
  kind: PromoteKind;
  positionIndex?: number;
  text: string;
  confidenceBucket?: 'high' | 'medium' | 'low';
}

function confidenceBucket(c: number): 'high' | 'medium' | 'low' {
  if (c >= 0.7) return 'high';
  if (c >= 0.4) return 'medium';
  return 'low';
}

export function V3PromotePanel({ accessToken, sessionId, written, structured, master, onSaved }: Props) {
  // ─── Build the promotable-item list ────────────────────────────────
  const items = useMemo<PromoteItem[]>(() => {
    if (!written) return [];
    const out: PromoteItem[] = [];
    if (written.summary?.trim()) {
      out.push({ key: 'summary', kind: 'summary', text: written.summary });
    }
    written.positions.forEach((p, posIdx) => {
      if (p.scope?.trim()) {
        out.push({ key: `scope-${posIdx}`, kind: 'scope', positionIndex: posIdx, text: p.scope });
      }
      p.bullets.forEach((b, bIdx) => {
        if (!b.is_new) return;
        // Skip bullets that have been reverted to their source text — those
        // are already in the master resume (or will be, once we promote the
        // originating run), and offering them as "new accomplishments"
        // would duplicate or pollute the vault.
        const srcText = resolveSingleSourceBulletText(b.source, structured);
        if (srcText !== null && normalizePromoteText(b.text) === normalizePromoteText(srcText)) {
          return;
        }
        out.push({
          key: `bullet-${posIdx}-${bIdx}`,
          kind: 'bullet',
          positionIndex: posIdx,
          text: b.text,
          confidenceBucket: confidenceBucket(b.confidence ?? 0.5),
        });
      });
    });
    return out;
  }, [written, structured]);

  // Default selection — summary/scopes on, high-confidence bullets on.
  const defaultSelection = useMemo<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const it of items) {
      if (it.kind === 'summary' || it.kind === 'scope') init[it.key] = true;
      else if (it.kind === 'bullet') init[it.key] = it.confidenceBucket === 'high';
    }
    return init;
  }, [items]);

  const [selection, setSelection] = useState<Record<string, boolean>>(defaultSelection);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState(false);
  const [sectionOpen, setSectionOpen] = useState<{ summary: boolean; scopes: boolean; bullets: boolean }>({
    summary: true,
    scopes: true,
    bullets: false, // largest section — collapsed even within the expanded panel
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedVersion, setSavedVersion] = useState<number | null>(null);

  // Rebuild selection when items change (e.g. new run wiped the previous).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemo(() => setSelection(defaultSelection), [defaultSelection]);

  if (!written || items.length === 0) return null;

  const summaryItem = items.find((it) => it.kind === 'summary');
  const scopeItems = items.filter((it) => it.kind === 'scope');
  const bulletItems = items.filter((it) => it.kind === 'bullet');

  const selectedCount = Object.values(selection).filter(Boolean).length;
  const highConfidenceCount = items.filter((it) =>
    (it.kind === 'summary' || it.kind === 'scope') || it.confidenceBucket === 'high',
  ).length;

  const summaryLine = buildSummaryLine({
    hasSummary: Boolean(summaryItem),
    scopeCount: scopeItems.length,
    bulletCount: bulletItems.length,
  });

  const save = async (override?: Record<string, boolean>) => {
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    setSavedVersion(null);

    const active = override ?? selection;
    const selectedItems = items.filter((it) => active[it.key]);
    const body: Record<string, unknown> = { source_session_id: sessionId };

    const s = selectedItems.find((it) => it.kind === 'summary');
    if (s) body.summary = { text: edits[s.key] ?? s.text };

    const scopes = selectedItems
      .filter((it) => it.kind === 'scope')
      .map((it) => ({ positionIndex: it.positionIndex!, text: edits[it.key] ?? it.text }));
    if (scopes.length > 0) body.scopes = scopes;

    const bullets = selectedItems
      .filter((it) => it.kind === 'bullet')
      .map((it) => ({
        positionIndex: it.positionIndex!,
        text: edits[it.key] ?? it.text,
        source: 'crafted' as const,
      }));
    if (bullets.length > 0) body.bullets = bullets;

    try {
      const res = await fetch(`${API_BASE}/v3-pipeline/promote`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(b?.error ?? `Save failed (${res.status})`);
      }
      const data = (await res.json()) as { new_version?: number };
      setSavedVersion(data.new_version ?? null);
      setExpanded(false); // collapse back after success
      if (onSaved) await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: string) => setSelection((prev) => ({ ...prev, [key]: !prev[key] }));

  // ─── Collapsed banner ──────────────────────────────────────────────
  if (!expanded) {
    return (
      <GlassCard className="p-5">
        <div className="flex items-start gap-3">
          <BookMarked className="h-5 w-5 text-[var(--bullet-confirm)] flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            {savedVersion !== null ? (
              <>
                <div className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-strong)]">
                  <CheckCircle2 className="h-4 w-4 text-[var(--badge-green-text)]" />
                  Saved as knowledge base v{savedVersion}
                </div>
                <p className="text-[12px] text-[var(--text-muted)] mt-1">
                  {selectedCount} item{selectedCount === 1 ? '' : 's'} added. Your next run will auto-load this updated master.
                </p>
              </>
            ) : (
              <>
                <div className="text-sm font-semibold text-[var(--text-strong)]">
                  {master ? 'Ready to update your knowledge base' : 'Save this run as your knowledge base'}
                </div>
                <p className="text-[12px] text-[var(--text-muted)] mt-1 leading-relaxed">
                  {summaryLine} {master
                    ? `${highConfidenceCount} are pre-selected as high-confidence; you can save defaults or review first.`
                    : `This will create knowledge base v1 — the starting point of your vault.`}
                </p>
              </>
            )}
            {error && (
              <p className="text-[11px] text-[var(--badge-red-text)] mt-2 flex items-start gap-1.5" role="alert">
                <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                {error}
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <GlassButton
                variant="primary"
                size="md"
                disabled={saving || !accessToken}
                onClick={() => void save(defaultSelection)}
              >
                {saving ? 'Saving…' : master ? 'Save defaults to knowledge base' : 'Save as v1'}
              </GlassButton>
              <GlassButton
                variant="ghost"
                size="md"
                onClick={() => setExpanded(true)}
              >
                Review &amp; pick
                <ChevronRight className="h-4 w-4 ml-1" />
              </GlassButton>
            </div>
          </div>
        </div>
      </GlassCard>
    );
  }

  // ─── Expanded picker ───────────────────────────────────────────────
  return (
    <GlassCard className="p-6">
      {/* Sticky header within the panel: counts + actions */}
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-[var(--line-soft)]">
        <div className="flex items-center gap-2 min-w-0">
          <BookMarked className="h-5 w-5 text-[var(--bullet-confirm)] flex-shrink-0" />
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-strong)]">
              Add to knowledge base
            </h2>
            <p className="text-[11px] text-[var(--text-muted)]">
              {selectedCount} of {items.length} selected
              {master ? ` · master v${master.version} → v${master.version + 1}` : ' · will create v1'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <GlassButton
            variant="primary"
            size="sm"
            disabled={saving || selectedCount === 0 || !accessToken}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : 'Save to knowledge base'}
          </GlassButton>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-strong)] inline-flex items-center gap-1 px-2 py-1.5 rounded"
          >
            <ChevronUp className="h-3.5 w-3.5" />
            Collapse
          </button>
        </div>
      </div>

      {error && (
        <p className="text-[12px] text-[var(--badge-red-text)] mt-3 flex items-start gap-1.5" role="alert">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          {error}
        </p>
      )}

      {/* Sections */}
      <div className="mt-4 space-y-4">
        {summaryItem && (
          <Section
            title="New summary"
            count={1}
            open={sectionOpen.summary}
            onToggle={() => setSectionOpen((s) => ({ ...s, summary: !s.summary }))}
          >
            <PromoteRow
              item={summaryItem}
              selected={selection[summaryItem.key] ?? false}
              onToggle={() => toggle(summaryItem.key)}
              editedText={edits[summaryItem.key]}
              onEdit={(next) => setEdits((e) => ({ ...e, [summaryItem.key]: next }))}
            />
          </Section>
        )}

        {scopeItems.length > 0 && (
          <Section
            title="Updated scope statements"
            count={scopeItems.length}
            open={sectionOpen.scopes}
            onToggle={() => setSectionOpen((s) => ({ ...s, scopes: !s.scopes }))}
          >
            <div className="space-y-3">
              {scopeItems.map((it) => (
                <PromoteRow
                  key={it.key}
                  item={it}
                  selected={selection[it.key] ?? false}
                  onToggle={() => toggle(it.key)}
                  editedText={edits[it.key]}
                  onEdit={(next) => setEdits((e) => ({ ...e, [it.key]: next }))}
                />
              ))}
            </div>
          </Section>
        )}

        {bulletItems.length > 0 && (
          <Section
            title="New accomplishments"
            count={bulletItems.length}
            open={sectionOpen.bullets}
            onToggle={() => setSectionOpen((s) => ({ ...s, bullets: !s.bullets }))}
          >
            <div className="space-y-3">
              {bulletItems.map((it) => (
                <PromoteRow
                  key={it.key}
                  item={it}
                  selected={selection[it.key] ?? false}
                  onToggle={() => toggle(it.key)}
                  editedText={edits[it.key]}
                  onEdit={(next) => setEdits((e) => ({ ...e, [it.key]: next }))}
                />
              ))}
            </div>
          </Section>
        )}
      </div>
    </GlassCard>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function Section({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section>
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)] hover:text-[var(--text-strong)] transition-colors w-full text-left"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {title}
        <span className="text-[var(--text-soft)] font-normal normal-case tracking-normal">({count})</span>
      </button>
      {open && <div className="mt-3 pl-5">{children}</div>}
    </section>
  );
}

function PromoteRow({
  item,
  selected,
  onToggle,
  editedText,
  onEdit,
}: {
  item: PromoteItem;
  selected: boolean;
  onToggle: () => void;
  editedText: string | undefined;
  onEdit: (next: string) => void;
}) {
  return (
    <label
      className={cn(
        'flex items-start gap-3 p-3 rounded-[10px] border cursor-pointer transition-colors',
        selected
          ? 'border-[var(--bullet-confirm-border)] bg-[var(--bullet-confirm-bg)]'
          : 'border-[var(--line-soft)] bg-[var(--surface-1)] hover:border-[var(--bullet-confirm)]/30',
      )}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="mt-1 accent-[var(--bullet-confirm)] h-4 w-4 flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--text-soft)] mb-1">
          {item.kind === 'summary'
            ? <span>Executive summary</span>
            : <span>Position {item.positionIndex}</span>}
          {item.kind === 'bullet' && item.confidenceBucket === 'low' && (
            <span className="text-[var(--badge-red-text)]">low confidence</span>
          )}
          {item.kind === 'bullet' && item.confidenceBucket === 'medium' && (
            <span className="text-[var(--badge-amber-text)]">medium confidence</span>
          )}
        </div>
        <EditableText
          value={editedText ?? item.text}
          onChange={onEdit}
          multiline
          className="text-[13px] leading-relaxed"
        />
      </div>
    </label>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Resolve a bullet's source ref back to the original source text, but only
 * when the rewrite derives from exactly one source bullet. Multi-source
 * bullets (consolidations) return null — reverting a consolidation is
 * ambiguous and outside the scope of the "revert to source" feature.
 */
function resolveSingleSourceBulletText(
  sourceRef: string | null | undefined,
  structured: V3StructuredResume | null | undefined,
): string | null {
  if (!sourceRef || !structured) return null;
  const re = /positions\[(\d+)\]\.bullets\[(\d+)\]/g;
  const matches = [...sourceRef.matchAll(re)];
  if (matches.length !== 1) return null;
  const m = matches[0]!;
  const posIdx = Number(m[1]);
  const bulletIdx = Number(m[2]);
  const pos = structured.positions[posIdx];
  if (!pos) return null;
  const b = pos.bullets[bulletIdx];
  if (!b) return null;
  return b.text;
}

function normalizePromoteText(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

function buildSummaryLine({
  hasSummary,
  scopeCount,
  bulletCount,
}: {
  hasSummary: boolean;
  scopeCount: number;
  bulletCount: number;
}): string {
  const parts: string[] = [];
  if (bulletCount > 0) parts.push(`${bulletCount} new accomplishment${bulletCount === 1 ? '' : 's'}`);
  if (scopeCount > 0) parts.push(`${scopeCount} updated scope statement${scopeCount === 1 ? '' : 's'}`);
  if (hasSummary) parts.push('a refreshed summary');
  if (parts.length === 0) return 'No changes to promote.';
  if (parts.length === 1) return `We wrote ${parts[0]}.`;
  if (parts.length === 2) return `We wrote ${parts[0]} and ${parts[1]}.`;
  return `We wrote ${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}.`;
}
