import { useState, useEffect, useCallback } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { GlassInput } from '@/components/GlassInput';
import type { TargetTitle } from '@/types/ni';
import { API_BASE } from '@/lib/api';

export interface TargetTitlesManagerProps {
  accessToken: string | null;
}

export function TargetTitlesManager({ accessToken }: TargetTitlesManagerProps) {
  const [titles, setTitles] = useState<TargetTitle[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchTitles = useCallback(async () => {
    if (!accessToken) return;
    try {
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
      }
    } catch {
      // Silently fail
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
      }
    } catch {
      // Silently fail
    } finally {
      setAdding(false);
    }
  }, [newTitle, accessToken, fetchTitles]);

  const handleDelete = useCallback(async (titleId: string) => {
    if (!accessToken) return;
    try {
      const res = await fetch(`${API_BASE}/ni/target-titles/${titleId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        setTitles((prev) => prev.filter((t) => t.id !== titleId));
      }
    } catch {
      // Silently fail
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

      {titles.length === 0 ? (
        <p className="mt-3 text-center text-xs text-[var(--text-soft)]">
          Add target titles to match jobs
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {titles.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between rounded-lg bg-[var(--accent-muted)] px-3 py-1.5"
            >
              <span className="text-xs text-[var(--text-muted)]">{t.title}</span>
              <button
                onClick={() => void handleDelete(t.id)}
                className="ml-2 text-xs text-[var(--text-soft)] transition-colors hover:text-[#f0b8b8]/70"
                aria-label={`Remove ${t.title}`}
              >
                x
              </button>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
