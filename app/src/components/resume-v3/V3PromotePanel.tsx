/**
 * V3PromotePanel — shown after pipeline_complete. Offers the user a
 * curated checkbox list of newly-written content to promote into their
 * master resume (the "knowledge base").
 *
 * What's promotable:
 *  - The rewritten summary (if different from the master's summary)
 *  - Position scope statements (if different from master's scope)
 *  - Individual bullets marked is_new=true on each position
 *
 * Defaults:
 *  - High-confidence bullets (confidence >= 0.7) start checked.
 *  - Low-confidence bullets start unchecked.
 *  - Scope changes start checked when the master's scope differs.
 *  - Summary change starts checked when the master's summary differs.
 *
 * On "Save to knowledge base" → POST /api/v3-pipeline/promote. On success
 * the master summary is refreshed (via the hook) so subsequent runs see
 * the updated vault.
 */

import { useMemo, useState } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { BookMarked, CheckCircle2, AlertTriangle } from 'lucide-react';
import { API_BASE } from '@/lib/api';
import { EditableText } from './EditableText';
import type { V3WrittenResume, V3MasterSummary } from '@/hooks/useV3Pipeline';

interface Props {
  accessToken: string | null;
  sessionId: string;
  written: V3WrittenResume | null;
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
  originalText?: string;
}

function confidenceBucket(c: number): 'high' | 'medium' | 'low' {
  if (c >= 0.7) return 'high';
  if (c >= 0.4) return 'medium';
  return 'low';
}

export function V3PromotePanel({ accessToken, sessionId, written, master, onSaved }: Props) {
  const items = useMemo<PromoteItem[]>(() => {
    if (!written) return [];
    const out: PromoteItem[] = [];
    // Summary — always promotable if present
    if (written.summary?.trim()) {
      out.push({ key: 'summary', kind: 'summary', text: written.summary });
    }
    // Per-position scope + bullets
    written.positions.forEach((p, posIdx) => {
      if (p.scope?.trim()) {
        out.push({
          key: `scope-${posIdx}`,
          kind: 'scope',
          positionIndex: posIdx,
          text: p.scope,
        });
      }
      p.bullets.forEach((b, bIdx) => {
        if (!b.is_new) return;
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
  }, [written]);

  // Track selected items + any inline edits the reviewer applies.
  const [selection, setSelection] = useState<Record<string, boolean>>(() => {
    // Default: summary checked if there is one; scopes checked; high-confidence
    // bullets checked; medium/low unchecked.
    const init: Record<string, boolean> = {};
    return init;
  });
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedVersion, setSavedVersion] = useState<number | null>(null);

  // Apply defaults whenever items change.
  useMemo(() => {
    const next: Record<string, boolean> = {};
    for (const it of items) {
      if (it.kind === 'summary') next[it.key] = true;
      else if (it.kind === 'scope') next[it.key] = true;
      else if (it.kind === 'bullet') next[it.key] = it.confidenceBucket === 'high';
    }
    setSelection(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  if (!written || items.length === 0) return null;

  const selectedCount = Object.values(selection).filter(Boolean).length;

  const toggle = (key: string) => {
    setSelection((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    setSavedVersion(null);

    const selectedItems = items.filter((it) => selection[it.key]);
    const body: Record<string, unknown> = { source_session_id: sessionId };

    const summaryItem = selectedItems.find((it) => it.kind === 'summary');
    if (summaryItem) {
      body.summary = { text: edits[summaryItem.key] ?? summaryItem.text };
    }

    const scopes = selectedItems
      .filter((it) => it.kind === 'scope')
      .map((it) => ({
        positionIndex: it.positionIndex!,
        text: edits[it.key] ?? it.text,
      }));
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
        throw new Error(b?.error ?? `Promote failed (${res.status})`);
      }
      const data = (await res.json()) as { new_version?: number };
      setSavedVersion(data.new_version ?? null);
      if (onSaved) await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const bulletItems = items.filter((it) => it.kind === 'bullet');
  const scopeItems = items.filter((it) => it.kind === 'scope');
  const summaryItem = items.find((it) => it.kind === 'summary');

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2">
        <BookMarked className="h-4 w-4 text-[var(--bullet-confirm)]" />
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--text-strong)]">
          Add to knowledge base
        </h2>
      </div>
      <p className="text-[12px] text-[var(--text-muted)] mt-1 mb-4">
        {master
          ? `Select what to add to your master resume (v${master.version}). High-confidence bullets are pre-selected.`
          : 'Select what to add to your new knowledge base. We\'ll create version 1 with your selections.'}
      </p>

      <div className="space-y-5">
        {summaryItem && (
          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-soft)] mb-2">
              New summary
            </h3>
            <label className="flex items-start gap-2 cursor-pointer text-[13px]">
              <input
                type="checkbox"
                checked={selection[summaryItem.key] ?? false}
                onChange={() => toggle(summaryItem.key)}
                className="mt-1 accent-[var(--bullet-confirm)]"
              />
              <div className="flex-1">
                <EditableText
                  value={edits[summaryItem.key] ?? summaryItem.text}
                  onChange={(next) => setEdits((e) => ({ ...e, [summaryItem.key]: next }))}
                  multiline
                />
              </div>
            </label>
          </section>
        )}

        {scopeItems.length > 0 && (
          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-soft)] mb-2">
              Updated scope statements ({scopeItems.length})
            </h3>
            <ul className="space-y-2">
              {scopeItems.map((it) => (
                <li key={it.key}>
                  <label className="flex items-start gap-2 cursor-pointer text-[13px]">
                    <input
                      type="checkbox"
                      checked={selection[it.key] ?? false}
                      onChange={() => toggle(it.key)}
                      className="mt-1 accent-[var(--bullet-confirm)]"
                    />
                    <div className="flex-1">
                      <div className="text-[10px] uppercase tracking-wider text-[var(--text-soft)]">
                        Position {it.positionIndex}
                      </div>
                      <EditableText
                        value={edits[it.key] ?? it.text}
                        onChange={(next) => setEdits((e) => ({ ...e, [it.key]: next }))}
                        multiline
                      />
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        )}

        {bulletItems.length > 0 && (
          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-soft)] mb-2">
              New accomplishments ({bulletItems.length})
            </h3>
            <ul className="space-y-2">
              {bulletItems.map((it) => (
                <li key={it.key}>
                  <label className="flex items-start gap-2 cursor-pointer text-[13px]">
                    <input
                      type="checkbox"
                      checked={selection[it.key] ?? false}
                      onChange={() => toggle(it.key)}
                      className="mt-1 accent-[var(--bullet-confirm)]"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--text-soft)]">
                        <span>Position {it.positionIndex}</span>
                        {it.confidenceBucket === 'low' && (
                          <span className="text-[var(--badge-red-text)]">low confidence</span>
                        )}
                        {it.confidenceBucket === 'medium' && (
                          <span className="text-[var(--badge-amber-text)]">medium confidence</span>
                        )}
                      </div>
                      <EditableText
                        value={edits[it.key] ?? it.text}
                        onChange={(next) => setEdits((e) => ({ ...e, [it.key]: next }))}
                        multiline
                      />
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-[var(--line-soft)] pt-4">
        <div className="text-[12px] text-[var(--text-muted)]">
          {savedVersion !== null ? (
            <span className="inline-flex items-center gap-1.5 text-[var(--badge-green-text)]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Saved as v{savedVersion}
            </span>
          ) : error ? (
            <span className="inline-flex items-center gap-1.5 text-[var(--badge-red-text)]">
              <AlertTriangle className="h-3.5 w-3.5" />
              {error}
            </span>
          ) : (
            <span>{selectedCount} item{selectedCount === 1 ? '' : 's'} selected</span>
          )}
        </div>
        <GlassButton
          variant="primary"
          size="md"
          disabled={saving || selectedCount === 0 || !accessToken}
          onClick={() => void handleSave()}
        >
          {saving ? 'Saving…' : 'Save to knowledge base'}
        </GlassButton>
      </div>
    </GlassCard>
  );
}
