import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { CsvUploader } from '@/components/network-intelligence/CsvUploader';
import { ConnectionsBrowser } from '@/components/network-intelligence/ConnectionsBrowser';
import { TargetTitlesManager } from '@/components/network-intelligence/TargetTitlesManager';
import { JobMatchesList } from '@/components/network-intelligence/JobMatchesList';
import { BooleanSearchBuilder } from '@/components/network-intelligence/BooleanSearchBuilder';
import { ScrapeJobsPanel } from '@/components/network-intelligence/ScrapeJobsPanel';
import type { CsvUploadSummary } from '@/types/ni';
import { API_BASE } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { Upload, Users, Target, Briefcase, Search, ScanLine, AlertCircle } from 'lucide-react';

type NiTab = 'upload' | 'connections' | 'targets' | 'matches' | 'boolean-search' | 'scan-jobs';

interface TabDef {
  id: NiTab;
  label: string;
  icon: typeof Upload;
  description: string;
}

const TABS: TabDef[] = [
  { id: 'upload', label: 'Upload', icon: Upload, description: 'Import LinkedIn connections' },
  { id: 'connections', label: 'Connections', icon: Users, description: 'Browse your network by company' },
  { id: 'targets', label: 'Target Titles', icon: Target, description: 'Manage your target job titles' },
  { id: 'matches', label: 'Job Matches', icon: Briefcase, description: 'Jobs at companies where you have contacts' },
  { id: 'boolean-search', label: 'Boolean Search', icon: Search, description: 'Generate Boolean search strings for any job board' },
  { id: 'scan-jobs', label: 'Scan Jobs', icon: ScanLine, description: 'Scan target company career pages for open roles' },
];

// Tabs that are always accessible regardless of connection status
// scan-jobs scans career pages by company name — no CSV required
const ALWAYS_UNLOCKED: NiTab[] = ['upload', 'boolean-search', 'scan-jobs'];

export function NetworkIntelligenceRoom() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<NiTab>('upload');
  const [hasConnections, setHasConnections] = useState(false);
  const [uploadSummary, setUploadSummary] = useState<CsvUploadSummary | null>(null);
  const [connectionsError, setConnectionsError] = useState<string | null>(null);

  // Load access token from Supabase session
  useEffect(() => {
    let cancelled = false;
    async function loadToken() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!cancelled) setAccessToken(session?.access_token ?? null);
    }
    void loadToken();
    return () => { cancelled = true; };
  }, []);

  // Auto-detect if user has connections to set initial tab
  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;
    async function checkConnections() {
      try {
        const res = await fetch(`${API_BASE}/ni/connections/count`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.ok && !cancelled) {
          const data = await res.json();
          const has = (data.count ?? 0) > 0;
          setHasConnections(has);
          if (has) setActiveTab('connections');
        } else if (!cancelled) {
          setHasConnections(false);
        }
      } catch {
        if (!cancelled) {
          setHasConnections(false);
          setConnectionsError('Could not load connections. Please try again.');
        }
      }
    }

    void checkConnections();
    return () => { cancelled = true; };
  }, [accessToken]);

  const handleUploadComplete = useCallback((summary: CsvUploadSummary) => {
    setUploadSummary(summary);
    setHasConnections(true);
    setActiveTab('connections');
  }, []);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'upload':
        return (
          <div className="space-y-6">
            {/* Intro card */}
            <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-[#98b3ff]/[0.06] to-white/[0.02] p-6">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-xl bg-[#98b3ff]/10 flex items-center justify-center flex-shrink-0">
                  <Upload size={18} className="text-[#98b3ff]" />
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold text-white/85 mb-1">Import Your LinkedIn Network</h3>
                  <p className="text-[13px] text-white/45 leading-relaxed">
                    Upload your LinkedIn connections export to discover job opportunities at companies where
                    you already have contacts. We match open positions to your target roles and surface
                    warm referral paths — so you bypass the applicant queue.
                  </p>
                </div>
              </div>
            </div>

            <CsvUploader accessToken={accessToken} onUploadComplete={handleUploadComplete} />

            {uploadSummary && (
              <div className="rounded-2xl border border-[#57CDA4]/20 bg-[#57CDA4]/[0.04] p-6">
                <h3 className="text-[13px] font-semibold text-[#57CDA4]/80 mb-4">Import Complete</h3>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {[
                    { label: 'Connections', value: uploadSummary.validRows },
                    { label: 'Companies', value: uploadSummary.uniqueCompanies },
                    { label: 'Duplicates', value: uploadSummary.duplicatesRemoved },
                    { label: 'Skipped', value: uploadSummary.skippedRows },
                  ].map(({ label, value }) => (
                    <div key={label} className="text-center">
                      <div className="text-[22px] font-bold text-white/85 tabular-nums">{value}</div>
                      <div className="text-[11px] text-white/35 mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case 'connections':
        return <ConnectionsBrowser accessToken={accessToken} />;

      case 'targets':
        return <TargetTitlesManager accessToken={accessToken} />;

      case 'matches':
        return <JobMatchesList accessToken={accessToken} />;

      case 'boolean-search':
        return <BooleanSearchBuilder accessToken={accessToken} />;

      case 'scan-jobs':
        return <ScrapeJobsPanel accessToken={accessToken} />;
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1400px] mx-auto">
      {/* Room header */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold text-white/90">Network Intelligence</h1>
          <p className="text-[13px] text-white/40">
            Find jobs where your network gives you an inside track. Warm referrals beat cold applications every time.
          </p>
        </div>

        {hasConnections && (
          <GlassButton
            variant="ghost"
            className="text-xs shrink-0"
            onClick={() => setActiveTab('upload')}
          >
            Re-import
          </GlassButton>
        )}
      </div>

      {/* Connection check error */}
      {connectionsError && (
        <div className="text-[12px] text-red-400/70 flex items-center gap-2">
          <AlertCircle size={12} />
          {connectionsError}
          <button
            type="button"
            onClick={() => { setConnectionsError(null); }}
            className="text-[#98b3ff] hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex items-center gap-1 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const isLocked = !ALWAYS_UNLOCKED.includes(tab.id) && !hasConnections;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => !isLocked && setActiveTab(tab.id)}
              disabled={isLocked ?? false}
              title={isLocked ? 'Upload your connections first' : tab.description}
              className={cn(
                'flex items-center gap-2 flex-1 justify-center rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-150',
                isActive
                  ? 'bg-[#98b3ff]/10 text-[#98b3ff] shadow-sm'
                  : isLocked
                    ? 'text-white/20 cursor-not-allowed'
                    : 'text-white/45 hover:text-white/70 hover:bg-white/[0.03]',
              )}
            >
              <Icon
                size={15}
                className={cn(
                  'flex-shrink-0',
                  isActive ? 'text-[#98b3ff]' : isLocked ? 'text-white/15' : 'text-white/35',
                )}
              />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {renderTabContent()}
    </div>
  );
}
