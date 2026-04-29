import { useState, useEffect, useCallback } from 'react';

export type PostedWithin = '24h' | '3d' | '7d' | '14d' | '30d' | 'any';
export type WorkModeKey = 'remote' | 'hybrid' | 'onsite';

export interface WorkModes {
  remote: boolean;
  hybrid: boolean;
  onsite: boolean;
}

export interface JobFilters {
  location: string;
  radiusMiles: number;
  workModes: WorkModes;
  postedWithin: PostedWithin;
}

const DEFAULT_FILTERS: JobFilters = {
  location: '',
  radiusMiles: 25,
  workModes: { remote: true, hybrid: true, onsite: false },
  postedWithin: '7d',
};

function isPostingWithin(value: unknown): value is PostedWithin {
  return value === '24h' || value === '3d' || value === '7d' || value === '14d' || value === '30d' || value === 'any';
}

function loadFromStorage(key: string): JobFilters {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_FILTERS;
    const raw = localStorage.getItem(key);
    if (!raw) return DEFAULT_FILTERS;
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const location = typeof parsed.location === 'string' ? parsed.location : DEFAULT_FILTERS.location;

    const radiusRaw = parsed.radiusMiles;
    const radiusMiles =
      typeof radiusRaw === 'number' && [10, 25, 50, 100].includes(radiusRaw)
        ? radiusRaw
        : DEFAULT_FILTERS.radiusMiles;

    const modesRaw = parsed.workModes;
    const workModes: WorkModes =
      modesRaw && typeof modesRaw === 'object' && !Array.isArray(modesRaw)
        ? {
            remote: (modesRaw as Record<string, unknown>).remote === true,
            hybrid: (modesRaw as Record<string, unknown>).hybrid === true,
            onsite: (modesRaw as Record<string, unknown>).onsite === true,
          }
        : { ...DEFAULT_FILTERS.workModes };

    const postedWithin = isPostingWithin(parsed.postedWithin)
      ? parsed.postedWithin
      : DEFAULT_FILTERS.postedWithin;

    return { location, radiusMiles, workModes, postedWithin };
  } catch {
    return DEFAULT_FILTERS;
  }
}

export function useJobFilters(storageKey = 'job-filters') {
  const [state, setState] = useState<{ storageKey: string; filters: JobFilters }>(() => ({
    storageKey,
    filters: loadFromStorage(storageKey),
  }));

  const filters = state.filters;

  useEffect(() => {
    setState((prev) => (
      prev.storageKey === storageKey
        ? prev
        : { storageKey, filters: loadFromStorage(storageKey) }
    ));
  }, [storageKey]);

  // Persist on every change
  useEffect(() => {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(state.storageKey, JSON.stringify(state.filters));
    } catch {
      // Storage may be unavailable in some contexts — fail silently
    }
  }, [state]);

  const setLocation = useCallback((location: string) => {
    setState((prev) => ({ ...prev, filters: { ...prev.filters, location } }));
  }, []);

  const setRadiusMiles = useCallback((radiusMiles: number) => {
    setState((prev) => ({ ...prev, filters: { ...prev.filters, radiusMiles } }));
  }, []);

  const setWorkModes = useCallback((workModes: WorkModes) => {
    const remoteOnly = workModes.remote && !workModes.hybrid && !workModes.onsite;
    setState((prev) => ({
      ...prev,
      filters: {
        ...prev.filters,
        workModes,
        location: remoteOnly ? '' : prev.filters.location,
      },
    }));
  }, []);

  const setPostedWithin = useCallback((postedWithin: PostedWithin) => {
    setState((prev) => ({ ...prev, filters: { ...prev.filters, postedWithin } }));
  }, []);

  return {
    filters,
    setLocation,
    setRadiusMiles,
    setWorkModes,
    setPostedWithin,
  };
}
