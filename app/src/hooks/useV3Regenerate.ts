/**
 * useV3Regenerate — stateless REST helpers for Phase 4 of the three-panel
 * redesign. Three operations:
 *
 *   - regenerateBullet(posIdx, bulletIdx, guidance?) — one-bullet rewrite
 *   - regeneratePosition(posIdx, weight?) — whole-position rewrite, optionally
 *     with a weight override to try a different emphasis
 *   - reverify(written) — re-run verify against the current resume state
 *
 * The hook owns three small Sets for in-flight tracking so the UI can show
 * per-bullet / per-position spinners without callers maintaining their own
 * loading state. Errors are surfaced via a single `lastError` string.
 *
 * Deliberately NOT merged into useV3Pipeline: the SSE pipeline hook owns
 * the streaming run; this hook owns REST edits on top of an already-run
 * pipeline. Different lifecycles; mixing them invites bugs.
 */

import { useCallback, useState } from 'react';
import { API_BASE } from '@/lib/api';
import type {
  V3Bullet,
  V3Strategy,
  V3StructuredResume,
  V3VerifyResult,
  V3WrittenPosition,
  V3WrittenResume,
} from './useV3Pipeline';

export type PositionWeight = 'primary' | 'secondary' | 'brief';

interface Props {
  accessToken: string | null;
  structured: V3StructuredResume | null;
  strategy: V3Strategy | null;
}

export function useV3Regenerate({ accessToken, structured, strategy }: Props) {
  const [pendingBullets, setPendingBullets] = useState<Set<string>>(new Set());
  const [pendingPositions, setPendingPositions] = useState<Set<number>>(new Set());
  const [summaryPending, setSummaryPending] = useState(false);
  const [reverifying, setReverifying] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const regenerateBullet = useCallback(
    async (
      positionIndex: number,
      bulletIndex: number,
      guidance?: string,
    ): Promise<V3Bullet | null> => {
      if (!accessToken || !structured || !strategy) return null;
      const bulletKey = `${positionIndex}#${bulletIndex}`;
      setPendingBullets((s) => new Set(s).add(bulletKey));
      setLastError(null);
      try {
        const res = await fetch(`${API_BASE}/v3-pipeline/regenerate`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            structured,
            strategy,
            target: {
              kind: 'bullet',
              positionIndex,
              bulletIndex,
              guidance: guidance?.trim() ?? undefined,
            },
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
          throw new Error(body?.message ?? body?.error ?? `Regenerate failed (${res.status})`);
        }
        const data = (await res.json()) as { bullet: V3Bullet };
        return data.bullet;
      } catch (err) {
        setLastError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setPendingBullets((s) => {
          const next = new Set(s);
          next.delete(bulletKey);
          return next;
        });
      }
    },
    [accessToken, structured, strategy],
  );

  const regeneratePosition = useCallback(
    async (
      positionIndex: number,
      weightOverride?: PositionWeight,
    ): Promise<V3WrittenPosition | null> => {
      if (!accessToken || !structured || !strategy) return null;
      setPendingPositions((s) => new Set(s).add(positionIndex));
      setLastError(null);
      try {
        const res = await fetch(`${API_BASE}/v3-pipeline/regenerate`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            structured,
            strategy,
            target: { kind: 'position', positionIndex, weightOverride },
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
          throw new Error(body?.message ?? body?.error ?? `Regenerate failed (${res.status})`);
        }
        const data = (await res.json()) as { position: V3WrittenPosition };
        return data.position;
      } catch (err) {
        setLastError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setPendingPositions((s) => {
          const next = new Set(s);
          next.delete(positionIndex);
          return next;
        });
      }
    },
    [accessToken, structured, strategy],
  );

  const regenerateSummary = useCallback(
    async (guidance?: string): Promise<string | null> => {
      if (!accessToken || !structured || !strategy) return null;
      setSummaryPending(true);
      setLastError(null);
      try {
        const res = await fetch(`${API_BASE}/v3-pipeline/regenerate`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            structured,
            strategy,
            target: { kind: 'summary', guidance: guidance?.trim() || undefined },
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
          throw new Error(body?.message ?? body?.error ?? `Regenerate failed (${res.status})`);
        }
        const data = (await res.json()) as { summary: string };
        return data.summary;
      } catch (err) {
        setLastError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setSummaryPending(false);
      }
    },
    [accessToken, structured, strategy],
  );

  const reverify = useCallback(
    async (written: V3WrittenResume): Promise<V3VerifyResult | null> => {
      if (!accessToken || !structured || !strategy) return null;
      setReverifying(true);
      setLastError(null);
      try {
        const res = await fetch(`${API_BASE}/v3-pipeline/reverify`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ structured, strategy, written }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
          throw new Error(body?.message ?? body?.error ?? `Re-verify failed (${res.status})`);
        }
        const data = (await res.json()) as { verify: V3VerifyResult };
        return data.verify;
      } catch (err) {
        setLastError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setReverifying(false);
      }
    },
    [accessToken, structured, strategy],
  );

  return {
    regenerateBullet,
    regeneratePosition,
    regenerateSummary,
    reverify,
    pendingBullets,
    pendingPositions,
    summaryPending,
    reverifying,
    lastError,
  };
}
