import { useState, useEffect, useCallback } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { GlassInput } from '@/components/GlassInput';
import type { TargetTitle } from '@/types/ni';
import { API_BASE } from '@/lib/api';
import { readApiError } from '@/lib/api-errors';

export interface TargetTitlesManagerProps {
  accessToken: string | null;
}

export function TargetTitlesManager({ accessToken }: TargetTitlesManagerProps) {
  const [titles, setTitles] = useState<TargetTitle[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTitles = useCallback(async () => {
    if (!accessToken) {
      setError('Sign in to manage target titles.');
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const res = await fetch(`${API_BASE}/ni/target-titles`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTitles(
          (data.titles ?? []).map((t: Record<string, unknown>) => ({
            id: t.id as string,
            title: t.title as string,
            priority: t.priority as number,
            createdAt: t.created_at as string,
          })),
        );
      } else {
        setError(await readApiError(res, `Unable to load target titles (${res.status}).`));
      }
    } catch (err) {
      setError(err instanceof Error && err.message
        ? err.message
        : 'Unable to load target titles. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void fetchTitles();
  }, [fetchTitles]);

  const handleAdd = useCallback(async () => {
    const trimmed = newTitle.trim();
    if (!trimmed || !accessToken) return;

    setAdding(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/ni/target-titles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ title: trimmed }),
      });
      if (res.ok) {
        setNewTitle('');
        await fetchTitles();
      } else {
        setError(await readApiError(res, `Unable to add target title (${res.status}).`));
      }
    } catch (err) {
      setError(err instanceof Error && err.message
        ? err.message
        : 'Unable to add target title. Please try again.');
    } finally {
      setAdding(false);
    }
  }, [newTitle, accessToken, fetchTitles]);

  const handleDelete = useCallback(async (titleId: string) => {
    if (!accessToken) return;
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/ni/target-titles/${titleId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        setTitles((prev) => prev.filter((t) => t.id !== titleId));
      } else {
        setError(await readApiError(res, `Unable to remove target title (${res.status}).`));
      }
    } catch (err) {
      setError(err instanceof Error && err.message
        ? err.message
        : 'Unable to remove target title. Please try again.');
    }
  }, [accessToken]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleAdd();
    }
  }, [handleAdd]);

  if (loading) {
    return (
      <GlassCard className="p-4">
        <div className="h-4 w-32 motion-safe:animate-pulse rounded bg-[var(--accent-muted)]" />
        <div className="mt-3 space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-8 motion-safe:animate-pulse rounded bg-[var(--accent-muted)]" />
          ))}
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-4">
      <h3 className="mb-3 text-sm font-semibold text-[var(--text-muted)]">Target Titles</h3>

      <div className="flex gap-2">
        <GlassInput
          placeholder="Add a target job title..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 !rounded-lg !py-1.5 text-xs"
          maxLength={200}
        />
        <GlassButton
          variant="ghost"
          className="shrink-0 !px-3 !py-1.5 text-xs"
          onClick={handleAdd}
          disabled={!newTitle.trim() || adding}
          loading={adding}
        >
          Add
        </GlassButton>
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-[var(--badge-red-text)]/20 bg-[var(--badge-red-text)]/5 px-3 py-2">
          <p className="text-xs text-[var(--badge-red-text)]/80">{error}</p>
        </div>
      )}

      {titles.length === 0 && !error ? (
        <p className="mt-3 text-center text-xs text-[var(--text-soft)]">
          Add target titles to match jobs
        </p>
      ) : titles.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {titles.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between rounded-lg bg-[var(--accent-muted)] px-3 py-1.5"
            >
              <span className="text-xs text-[var(--text-muted)]">{t.title}</span>
              <button
                onClick={() => void handleDelete(t.id)}
                className="ml-2 text-xs text-[var(--text-soft)] transition-colors hover:text-[var(--badge-red-text)]/70"
                aria-label={`Remove ${t.title}`}
              >
                x
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </GlassCard>
  );
}
