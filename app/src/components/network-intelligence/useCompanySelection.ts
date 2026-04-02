import { useState, useCallback, useMemo } from 'react';
import type { CompanySummary } from '@/types/ni';

const MAX_SELECTION = 50;

export function useCompanySelection(companies: CompanySummary[]) {
  const [selectedRaws, setSelectedRaws] = useState<Set<string>>(new Set());

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
