/**
 * ShadowRunsTab — Phase 5 Week 0 admin review surface.
 *
 * Lists rows from resume_v3_shadow_runs (v2 vs v3 pairwise comparison data).
 * Admin clicks a row to expand the detail view showing v2_output_json and
 * v3_output_json side-by-side, then marks the row as reviewed_v3_better /
 * reviewed_v2_better / reviewed_equivalent / reviewed_v3_unacceptable.
 *
 * Keeps scope tight per Phase 5 Week 0 spec:
 *   - No fancy diffing.
 *   - No aggregate stats dashboard (defer until real data accrues).
 *   - No inline editing of v3.
 *
 * Styling mirrors UsersTab / AdminDashboard's existing conventions.
 */

import { useCallback, useEffect, useState } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { API_BASE } from '@/lib/api';
import { cn } from '@/lib/utils';

type ComparisonStatus =
  | 'pending_review'
  | 'reviewed_v3_better'
  | 'reviewed_v2_better'
  | 'reviewed_equivalent'
  | 'reviewed_v3_unacceptable';

interface ShadowRunListRow {
  id: string;
  request_id: string;
  candidate_id: string | null;
  created_at: string;
  v3_passed: boolean | null;
  v3_errors: number;
  v3_warnings: number;
  v3_total_cost_usd: number | null;
  v3_duration_ms: number | null;
  v2_duration_ms: number | null;
  v3_pipeline_error: string | null;
  v3_pipeline_error_stage: string | null;
  comparison_status: ComparisonStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

interface ShadowRunsResponse {
  shadow_runs: ShadowRunListRow[];
  total: number;
  limit: number;
  offset: number;
}

interface ShadowRunDetail {
  id: string;
  request_id: string;
  candidate_id: string | null;
  created_at: string;
  v2_output_json: unknown;
  v2_duration_ms: number | null;
  v3_output_json: unknown;
  v3_verify_result_json: unknown;
  v3_stage_timings_json: unknown;
  v3_stage_costs_json: unknown;
  v3_duration_ms: number | null;
  v3_pipeline_error: string | null;
  v3_pipeline_error_stage: string | null;
  comparison_status: ComparisonStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
}

interface ShadowRunsTabProps {
  adminKey: string;
}

const PAGE_SIZE = 50;

const STATUS_OPTIONS: { value: ComparisonStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending_review', label: 'Pending review' },
  { value: 'reviewed_v3_better', label: 'v3 better' },
  { value: 'reviewed_v2_better', label: 'v2 better' },
  { value: 'reviewed_equivalent', label: 'Equivalent' },
  { value: 'reviewed_v3_unacceptable', label: 'v3 unacceptable' },
];

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatCostUsd(v: number | null): string {
  if (v === null || v === undefined) return '—';
  return `$${v.toFixed(4)}`;
}

function formatMs(v: number | null): string {
  if (v === null || v === undefined) return '—';
  return `${(v / 1000).toFixed(1)}s`;
}

function statusBadgeClass(status: ComparisonStatus): string {
  if (status === 'pending_review') return 'bg-[var(--accent-muted)] text-[var(--text-muted)]';
  if (status === 'reviewed_v3_better') return 'bg-[var(--badge-green-bg,rgba(34,197,94,0.12))] text-[var(--badge-green-text)]';
  if (status === 'reviewed_v2_better') return 'bg-[var(--badge-blue-bg)] text-[var(--link)]';
  if (status === 'reviewed_equivalent') return 'bg-[var(--accent-muted)] text-[var(--text-muted)]';
  return 'bg-[var(--badge-red-bg)] text-[var(--badge-red-text)]';
}

export function ShadowRunsTab({ adminKey }: ShadowRunsTabProps) {
  const [rows, setRows] = useState<ShadowRunListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<ComparisonStatus | 'all'>('all');
  const [hasErrorOnly, setHasErrorOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ShadowRunDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const [reviewStatus, setReviewStatus] = useState<ComparisonStatus>('reviewed_v3_better');
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState('');

  const loadList = useCallback(
    async (newPage: number, newStatus: ComparisonStatus | 'all', newHasErrorOnly: boolean) => {
      setLoading(true);
      setListError('');
      try {
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(newPage * PAGE_SIZE),
        });
        if (newStatus !== 'all') params.set('status', newStatus);
        if (newHasErrorOnly) params.set('has_error', 'true');

        const res = await fetch(`${API_BASE}/api/admin/shadow-runs?${params.toString()}`, {
          headers: { Authorization: `Bearer ${adminKey}` },
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `Failed to load (${res.status})`);
        }
        const data = (await res.json()) as ShadowRunsResponse;
        setRows(data.shadow_runs);
        setTotal(data.total);
        setPage(newPage);
        setStatusFilter(newStatus);
        setHasErrorOnly(newHasErrorOnly);
      } catch (err) {
        setListError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [adminKey],
  );

  useEffect(() => {
    void loadList(0, 'all', false);
  }, [loadList]);

  const loadDetail = useCallback(
    async (id: string) => {
      setDetailLoading(true);
      setDetailError('');
      setDetail(null);
      try {
        const res = await fetch(`${API_BASE}/api/admin/shadow-runs/${id}`, {
          headers: { Authorization: `Bearer ${adminKey}` },
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `Failed to load (${res.status})`);
        }
        const data = (await res.json()) as { shadow_run: ShadowRunDetail };
        setDetail(data.shadow_run);
        setReviewStatus(data.shadow_run.comparison_status === 'pending_review'
          ? 'reviewed_v3_better'
          : data.shadow_run.comparison_status);
        setReviewNotes(data.shadow_run.review_notes ?? '');
      } catch (err) {
        setDetailError(err instanceof Error ? err.message : String(err));
      } finally {
        setDetailLoading(false);
      }
    },
    [adminKey],
  );

  const handleSelect = (id: string) => {
    setSelectedId(id);
    void loadDetail(id);
  };

  const handleSaveReview = async () => {
    if (!selectedId) return;
    setReviewSaving(true);
    setReviewError('');
    try {
      // reviewed_by defaults to a short label; future enhancement: pull from auth session.
      const reviewer = sessionStorage.getItem('admin_reviewer_name') ?? 'admin';
      const res = await fetch(`${API_BASE}/api/admin/shadow-runs/${selectedId}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminKey}`,
        },
        body: JSON.stringify({
          comparison_status: reviewStatus,
          reviewed_by: reviewer,
          review_notes: reviewNotes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Save failed (${res.status})`);
      }
      await loadList(page, statusFilter, hasErrorOnly);
      await loadDetail(selectedId);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : String(err));
    } finally {
      setReviewSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-[var(--text-soft)]">
          Status
          <select
            value={statusFilter}
            onChange={(e) => void loadList(0, e.target.value as ComparisonStatus | 'all', hasErrorOnly)}
            className="ml-2 bg-[var(--surface)] border border-[var(--line-soft)] rounded px-2 py-1 text-xs"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[var(--text-soft)] flex items-center gap-2">
          <input
            type="checkbox"
            checked={hasErrorOnly}
            onChange={(e) => void loadList(0, statusFilter, e.target.checked)}
          />
          Has v3 error only
        </label>
        <div className="ml-auto text-xs text-[var(--text-soft)]">
          {total} total • page {page + 1} / {totalPages}
        </div>
      </div>

      {/* List */}
      <GlassCard className="p-0 overflow-hidden">
        {listError && (
          <div className="p-4 border-b border-[var(--line-soft)]">
            <p className="text-sm text-[var(--badge-red-text)]">Error: {listError}</p>
          </div>
        )}
        <table className="w-full text-xs">
          <thead className="bg-[var(--surface-strong,rgba(255,255,255,0.02))] text-[var(--text-soft)]">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Created</th>
              <th className="text-left px-3 py-2 font-medium">Session</th>
              <th className="text-left px-3 py-2 font-medium">v3 verify</th>
              <th className="text-left px-3 py-2 font-medium">v3 err/warn</th>
              <th className="text-left px-3 py-2 font-medium">v2 / v3 dur</th>
              <th className="text-left px-3 py-2 font-medium">v3 cost</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => handleSelect(r.id)}
                className={cn(
                  'cursor-pointer border-t border-[var(--line-soft)] hover:bg-[var(--accent-muted)]',
                  selectedId === r.id && 'bg-[var(--accent-muted)]',
                )}
              >
                <td className="px-3 py-2 text-[var(--text-muted)]">{formatDate(r.created_at)}</td>
                <td className="px-3 py-2 font-mono text-[10px]">{r.request_id.slice(0, 10)}…</td>
                <td className="px-3 py-2">
                  {r.v3_pipeline_error
                    ? <span className="text-[var(--badge-red-text)]">ERROR ({r.v3_pipeline_error_stage ?? 'unknown'})</span>
                    : r.v3_passed === true
                      ? <span className="text-[var(--badge-green-text)]">PASS</span>
                      : r.v3_passed === false
                        ? <span className="text-[var(--badge-red-text)]">FAIL</span>
                        : '—'}
                </td>
                <td className="px-3 py-2 text-[var(--text-muted)]">
                  {r.v3_errors}/{r.v3_warnings}
                </td>
                <td className="px-3 py-2 text-[var(--text-muted)]">
                  {formatMs(r.v2_duration_ms)} / {formatMs(r.v3_duration_ms)}
                </td>
                <td className="px-3 py-2 text-[var(--text-muted)]">{formatCostUsd(r.v3_total_cost_usd)}</td>
                <td className="px-3 py-2">
                  <span className={cn('px-2 py-0.5 rounded text-[10px]', statusBadgeClass(r.comparison_status))}>
                    {r.comparison_status.replace(/_/g, ' ')}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-[var(--text-soft)]">
                  No shadow runs yet. Enable FF_V3_SHADOW_ENABLED in production.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </GlassCard>

      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={page <= 0 || loading}
          onClick={() => void loadList(page - 1, statusFilter, hasErrorOnly)}
          className="text-xs px-3 py-1.5 rounded border border-[var(--line-soft)] text-[var(--text-muted)] disabled:opacity-50"
        >
          ← Previous
        </button>
        <button
          type="button"
          disabled={page + 1 >= totalPages || loading}
          onClick={() => void loadList(page + 1, statusFilter, hasErrorOnly)}
          className="text-xs px-3 py-1.5 rounded border border-[var(--line-soft)] text-[var(--text-muted)] disabled:opacity-50"
        >
          Next →
        </button>
      </div>

      {/* Detail panel */}
      {selectedId && (
        <GlassCard className="p-4">
          {detailLoading && (
            <p className="text-sm text-[var(--text-soft)]">Loading detail…</p>
          )}
          {detailError && <p className="text-sm text-[var(--badge-red-text)]">Error: {detailError}</p>}
          {detail && !detailLoading && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-strong)]">Shadow run detail</h3>
                  <p className="text-xs text-[var(--text-soft)]">
                    session {detail.request_id} • {formatDate(detail.created_at)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(null);
                    setDetail(null);
                  }}
                  className="text-xs text-[var(--text-soft)]"
                >
                  Close
                </button>
              </div>

              {detail.v3_pipeline_error && (
                <div className="p-3 rounded-[8px] bg-[var(--badge-red-bg)] border border-[var(--badge-red-text)]/20">
                  <p className="text-xs font-medium text-[var(--badge-red-text)]">
                    v3 pipeline error (stage: {detail.v3_pipeline_error_stage ?? 'unknown'})
                  </p>
                  <pre className="mt-1 text-[10px] text-[var(--text-muted)] whitespace-pre-wrap">
                    {detail.v3_pipeline_error}
                  </pre>
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <h4 className="text-xs font-semibold text-[var(--text-muted)] mb-1">v2 output (authoritative)</h4>
                  <pre className="text-[10px] bg-[var(--surface-strong,rgba(255,255,255,0.02))] p-2 rounded overflow-auto max-h-96">
                    {JSON.stringify(detail.v2_output_json, null, 2)}
                  </pre>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-[var(--text-muted)] mb-1">v3 output (shadow)</h4>
                  <pre className="text-[10px] bg-[var(--surface-strong,rgba(255,255,255,0.02))] p-2 rounded overflow-auto max-h-96">
                    {JSON.stringify(detail.v3_output_json, null, 2)}
                  </pre>
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-3 text-xs">
                <div>
                  <h4 className="text-[var(--text-muted)] font-semibold mb-1">Verify</h4>
                  <pre className="text-[10px] bg-[var(--surface-strong,rgba(255,255,255,0.02))] p-2 rounded overflow-auto max-h-40">
                    {JSON.stringify(detail.v3_verify_result_json, null, 2)}
                  </pre>
                </div>
                <div>
                  <h4 className="text-[var(--text-muted)] font-semibold mb-1">Stage timings</h4>
                  <pre className="text-[10px] bg-[var(--surface-strong,rgba(255,255,255,0.02))] p-2 rounded overflow-auto max-h-40">
                    {JSON.stringify(detail.v3_stage_timings_json, null, 2)}
                  </pre>
                </div>
                <div>
                  <h4 className="text-[var(--text-muted)] font-semibold mb-1">Stage costs (USD)</h4>
                  <pre className="text-[10px] bg-[var(--surface-strong,rgba(255,255,255,0.02))] p-2 rounded overflow-auto max-h-40">
                    {JSON.stringify(detail.v3_stage_costs_json, null, 2)}
                  </pre>
                </div>
              </div>

              {/* Review form */}
              <div className="border-t border-[var(--line-soft)] pt-3 space-y-2">
                <h4 className="text-sm font-semibold text-[var(--text-strong)]">Reviewer decision</h4>
                <div className="flex flex-wrap gap-2">
                  {(['reviewed_v3_better', 'reviewed_v2_better', 'reviewed_equivalent', 'reviewed_v3_unacceptable'] as const).map(
                    (s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setReviewStatus(s)}
                        className={cn(
                          'text-xs px-3 py-1.5 rounded border',
                          reviewStatus === s
                            ? 'border-[var(--link)] text-[var(--link)] bg-[var(--badge-blue-bg)]'
                            : 'border-[var(--line-soft)] text-[var(--text-muted)] hover:text-[var(--text-strong)]',
                        )}
                      >
                        {s.replace('reviewed_', '').replace(/_/g, ' ')}
                      </button>
                    ),
                  )}
                </div>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Notes (optional)"
                  rows={2}
                  className="w-full bg-[var(--surface-strong,rgba(255,255,255,0.02))] border border-[var(--line-soft)] rounded p-2 text-xs"
                />
                {reviewError && <p className="text-xs text-[var(--badge-red-text)]">{reviewError}</p>}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={reviewSaving}
                    onClick={() => void handleSaveReview()}
                    className="text-xs px-4 py-1.5 rounded bg-[var(--link)] text-white disabled:opacity-50"
                  >
                    {reviewSaving ? 'Saving…' : 'Save review'}
                  </button>
                  {detail.reviewed_by && (
                    <span className="text-[10px] text-[var(--text-soft)]">
                      Last reviewed by {detail.reviewed_by} @ {formatDate(detail.reviewed_at)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </GlassCard>
      )}
    </div>
  );
}
