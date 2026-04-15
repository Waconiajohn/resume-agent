import { useState, useCallback, useMemo, useEffect } from 'react';
import type { CompanySummary } from '@/types/ni';

const MAX_SELECTION = 50;
const STORAGE_KEY = 'ni-selected-companies';

function loadSaved(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (Array.isArray(arr)) return new Set(arr.filter((v): v is string => typeof v === 'string'));
    return new Set();
  } catch {
    return new Set();
  }
}

function saveToDisk(selected: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...selected]));
  } catch {
    // Storage unavailable
  }
}

export function useCompanySelection(companies: CompanySummary[]) {
  const [selectedRaws, setSelectedRaws] = useState<Set<string>>(() => loadSaved());

  // Persist on every change
  useEffect(() => {
    saveToDisk(selectedRaws);
  }, [selectedRaws]);

  const eligibleCompanies = useMemo(
    () => companies.filter((c) => c.companyId !== null),
    [companies],
  );

  const toggleCompany = useCallback((companyRaw: string) => {
    setSelectedRaws((prev) => {
      const next = new Set(prev);
      if (next.has(companyRaw)) {
        next.delete(companyRaw);
      } else if (next.size < MAX_SELECTION) {
        next.add(companyRaw);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((filtered: CompanySummary[]) => {
    const eligible = filtered
      .filter((c) => c.companyId !== null)
      .slice(0, MAX_SELECTION)
      .map((c) => c.companyRaw);
    setSelectedRaws(new Set(eligible));
  }, []);

  const clearAll = useCallback(() => {
    setSelectedRaws(new Set());
  }, []);

  const getSelectedCompanyIds = useCallback((): string[] => {
    return companies
      .filter((c) => selectedRaws.has(c.companyRaw) && c.companyId !== null)
      .map((c) => c.companyId as string);
  }, [companies, selectedRaws]);

  return {
    selectedRaws,
    selectedCount: selectedRaws.size,
    isAtLimit: selectedRaws.size >= MAX_SELECTION,
    maxSelection: MAX_SELECTION,
    eligibleCount: eligibleCompanies.length,
    toggleCompany,
    selectAll,
    clearAll,
    getSelectedCompanyIds,
  };
}
