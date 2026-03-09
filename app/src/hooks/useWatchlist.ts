import { useState, useCallback, useRef, useEffect } from 'react';
import { API_BASE } from '@/lib/api';
import { supabase } from '@/lib/supabase';

export interface WatchlistCompany {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  careers_url: string | null;
  priority: number;
  source: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

async function getAuthHeader(): Promise<Record<string, string> | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token ?? null;
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}

export function useWatchlist() {
  const [companies, setCompanies] = useState<WatchlistCompany[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchCompanies = useCallback(async (): Promise<void> => {
    if (!mountedRef.current) return;
    setLoading(true);
    setError(null);

    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) {
        if (mountedRef.current) {
          setLoading(false);
          setError('Not authenticated');
        }
        return;
      }

      const res = await fetch(`${API_BASE}/watchlist`, { headers: authHeader });

      if (!res.ok) {
        const body = await res.text();
        if (mountedRef.current) {
          setLoading(false);
          setError(`Failed to fetch watchlist (${res.status}): ${body}`);
        }
        return;
      }

      const data = (await res.json()) as WatchlistCompany[];
      if (mountedRef.current) {
        setCompanies(data);
        setLoading(false);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (mountedRef.current) {
        setLoading(false);
        setError(message);
      }
    }
  }, []);

  const addCompany = useCallback(
    async (data: Partial<WatchlistCompany>): Promise<WatchlistCompany | null> => {
      // Optimistic add with a temporary id
      const tempId = `temp-${Date.now()}`;
      const optimistic: WatchlistCompany = {
        id: tempId,
        name: data.name ?? '',
        industry: data.industry ?? null,
        website: data.website ?? null,
        careers_url: data.careers_url ?? null,
        priority: data.priority ?? 3,
        source: data.source ?? 'manual',
        notes: data.notes ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (mountedRef.current) {
        setCompanies((prev) => [optimistic, ...prev]);
      }

      try {
        const authHeader = await getAuthHeader();
        if (!authHeader) {
          if (mountedRef.current) {
            setCompanies((prev) => prev.filter((c) => c.id !== tempId));
          }
          return null;
        }

        const res = await fetch(`${API_BASE}/watchlist`, {
          method: 'POST',
          headers: { ...authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        if (!res.ok) {
          if (mountedRef.current) {
            setCompanies((prev) => prev.filter((c) => c.id !== tempId));
          }
          return null;
        }

        const created = (await res.json()) as WatchlistCompany;
        if (mountedRef.current) {
          setCompanies((prev) =>
            prev.map((c) => (c.id === tempId ? created : c)),
          );
        }
        return created;
      } catch {
        if (mountedRef.current) {
          setCompanies((prev) => prev.filter((c) => c.id !== tempId));
        }
        return null;
      }
    },
    [],
  );

  const updateCompany = useCallback(
    async (id: string, data: Partial<WatchlistCompany>): Promise<WatchlistCompany | null> => {
      try {
        const authHeader = await getAuthHeader();
        if (!authHeader) return null;

        const res = await fetch(`${API_BASE}/watchlist/${id}`, {
          method: 'PATCH',
          headers: { ...authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        if (!res.ok) return null;

        const updated = (await res.json()) as WatchlistCompany;
        if (mountedRef.current) {
          setCompanies((prev) => prev.map((c) => (c.id === id ? updated : c)));
        }
        return updated;
      } catch {
        return null;
      }
    },
    [],
  );

  const removeCompany = useCallback(async (id: string): Promise<boolean> => {
    // Optimistic remove
    let removed: WatchlistCompany | undefined;
    if (mountedRef.current) {
      setCompanies((prev) => {
        removed = prev.find((c) => c.id === id);
        return prev.filter((c) => c.id !== id);
      });
    }

    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) {
        if (mountedRef.current && removed) {
          setCompanies((prev) => [removed!, ...prev]);
        }
        return false;
      }

      const res = await fetch(`${API_BASE}/watchlist/${id}`, {
        method: 'DELETE',
        headers: authHeader,
      });

      if (!res.ok) {
        if (mountedRef.current && removed) {
          setCompanies((prev) => [removed!, ...prev]);
        }
        return false;
      }

      return true;
    } catch {
      if (mountedRef.current && removed) {
        setCompanies((prev) => [removed!, ...prev]);
      }
      return false;
    }
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    await fetchCompanies();
  }, [fetchCompanies]);

  return {
    companies,
    loading,
    error,
    fetchCompanies,
    addCompany,
    updateCompany,
    removeCompany,
    refresh,
  };
}
