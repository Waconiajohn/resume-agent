import { useState, useEffect, useCallback } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { CsvUploader } from '@/components/network-intelligence/CsvUploader';
import { ConnectionsBrowser } from '@/components/network-intelligence/ConnectionsBrowser';
import { TargetTitlesManager } from '@/components/network-intelligence/TargetTitlesManager';
import { JobMatchesList } from '@/components/network-intelligence/JobMatchesList';
import type { CsvUploadSummary } from '@/types/ni';
import { API_BASE } from '@/lib/api';

export interface NetworkIntelligenceTabProps {
  accessToken: string | null;
}

type TabState = 'loading' | 'upload' | 'browser';

export function NetworkIntelligenceTab({ accessToken }: NetworkIntelligenceTabProps) {
  const [tabState, setTabState] = useState<TabState>('loading');
  const [uploadSummary, setUploadSummary] = useState<CsvUploadSummary | null>(null);

  // On mount, check if user already has connections
  useEffect(() => {
    if (!accessToken) {
      setTabState('upload');
      return;
    }

    let cancelled = false;

    async function checkConnections() {
      try {
        const res = await fetch(`${API_BASE}/ni/connections/count`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.ok && !cancelled) {
          const data = await res.json();
          setTabState(data.count > 0 ? 'browser' : 'upload');
        } else if (!cancelled) {
          setTabState('upload');
        }
      } catch {
        if (!cancelled) setTabState('upload');
      }
    }

    void checkConnections();
    return () => { cancelled = true; };
  }, [accessToken]);

  const handleUploadComplete = useCallback((summary: CsvUploadSummary) => {
    setUploadSummary(summary);
    setTabState('browser');
  }, []);

  const handleReimport = useCallback(() => {
    setTabState('upload');
    setUploadSummary(null);
  }, []);

  if (tabState === 'loading') {
    return (
      <div className="space-y-4">
        <div className="h-24 motion-safe:animate-pulse rounded-[18px] bg-[var(--accent-muted)]" />
        <div className="h-40 motion-safe:animate-pulse rounded-[18px] bg-[var(--accent-muted)]" />
      </div>
    );
  }

  if (tabState === 'upload') {
    return (
      <div className="space-y-4">
        <GlassCard className="p-6">
          <h2 className="mb-2 text-lg font-semibold text-[var(--text-strong)]">Network Intelligence</h2>
          <p className="text-sm text-[var(--text-soft)]">
            Upload your LinkedIn connections to discover job opportunities at companies where you
            already have contacts. We'll match open positions to your target roles and identify
            referral paths.
          </p>
        </GlassCard>

        <CsvUploader accessToken={accessToken} onUploadComplete={handleUploadComplete} />

        {uploadSummary && (
          <GlassCard className="p-6">
            <h3 className="mb-3 text-sm font-semibold text-[var(--text-muted)]">Import Summary</h3>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <p className="text-[var(--text-soft)]">Connections</p>
                <p className="text-lg font-medium text-[var(--text-strong)]">{uploadSummary.validRows}</p>
              </div>
              <div>
                <p className="text-[var(--text-soft)]">Companies</p>
                <p className="text-lg font-medium text-[var(--text-strong)]">{uploadSummary.uniqueCompanies}</p>
              </div>
              <div>
                <p className="text-[var(--text-soft)]">Duplicates</p>
                <p className="text-lg font-medium text-[var(--text-strong)]">{uploadSummary.duplicatesRemoved}</p>
              </div>
              <div>
                <p className="text-[var(--text-soft)]">Skipped</p>
                <p className="text-lg font-medium text-[var(--text-strong)]">{uploadSummary.skippedRows}</p>
              </div>
            </div>
          </GlassCard>
        )}
      </div>
    );
  }

  // tabState === 'browser'
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--text-strong)]">Network Intelligence</h2>
        <GlassButton variant="ghost" size="sm" onClick={handleReimport}>
          Re-import
        </GlassButton>
      </div>

      <TargetTitlesManager accessToken={accessToken} />
      <ConnectionsBrowser accessToken={accessToken} />
      <JobMatchesList accessToken={accessToken} />
    </div>
  );
}
