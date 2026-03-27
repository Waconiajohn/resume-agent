import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/GlassCard';
import { CsvUploader } from '@/components/network-intelligence/CsvUploader';
import { ConnectionsBrowser } from '@/components/network-intelligence/ConnectionsBrowser';
import { TargetTitlesManager } from '@/components/network-intelligence/TargetTitlesManager';
import { JobMatchesList } from '@/components/network-intelligence/JobMatchesList';
import { ScrapeJobsPanel } from '@/components/network-intelligence/ScrapeJobsPanel';
import { BonusSearchPanel } from '@/components/network-intelligence/BonusSearchPanel';
import { ReferralOpportunitiesPanel } from '@/components/network-intelligence/ReferralOpportunitiesPanel';
import { NetworkingHubRoom, type OutreachReferralContext } from './NetworkingHubRoom';
import type { CsvUploadSummary } from '@/types/ni';
import { API_BASE } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Upload, Users, Target, ScanLine, UserCircle, Send, Handshake, Briefcase, Coins } from 'lucide-react';

type SmartReferralsTab = 'import' | 'connections' | 'targets' | 'job-matches' | 'job-scan' | 'bonus-search' | 'referrals' | 'contacts' | 'outreach';

interface TabDef {
  id: SmartReferralsTab;
  label: string;
  icon: typeof Upload;
  description: string;
}

const TABS: TabDef[] = [
  { id: 'import', label: 'Import', icon: Upload, description: 'Upload LinkedIn connections CSV' },
  { id: 'connections', label: 'Connections', icon: Users, description: 'Browse by company' },
  { id: 'targets', label: 'Target Titles', icon: Target, description: 'Manage target job titles' },
  { id: 'job-matches', label: 'Job Matches', icon: Briefcase, description: 'Jobs at companies where you have first-level connections' },
  { id: 'job-scan', label: 'Job Scan', icon: ScanLine, description: 'Scan career pages' },
  { id: 'bonus-search', label: 'Bonus Search', icon: Coins, description: 'Search high-referral-bonus companies even without a connection' },
  { id: 'referrals', label: 'Referral Bonus', icon: Handshake, description: 'Bonus-tagged opportunities where a referral program exists' },
  { id: 'contacts', label: 'Contacts', icon: UserCircle, description: 'CRM & Rule of Four' },
  { id: 'outreach', label: 'Outreach', icon: Send, description: 'AI outreach sequences' },
];

// Tabs accessible without connections
const ALWAYS_UNLOCKED: SmartReferralsTab[] = ['import', 'job-scan', 'bonus-search', 'referrals', 'contacts', 'outreach'];

interface OutreachPrefill {
  name: string;
  title: string;
  company: string;
  referralContext?: OutreachReferralContext;
}

export function SmartReferralsRoom() {
  const { session, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<SmartReferralsTab>('import');
  const [hasConnections, setHasConnections] = useState(false);
  const [uploadSummary, setUploadSummary] = useState<CsvUploadSummary | null>(null);
  const [outreachPrefill, setOutreachPrefill] = useState<OutreachPrefill | null>(null);
  const accessToken = session?.access_token ?? null;

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
        }
      } catch { /* ignore */ }
    }
    checkConnections();
    return () => { cancelled = true; };
  }, [accessToken]);

  const handleUploadComplete = useCallback((summary: CsvUploadSummary) => {
    setUploadSummary(summary);
    setHasConnections(true);
    setActiveTab('connections');
  }, []);

  const handleGenerateOutreach = useCallback((prefill: OutreachPrefill) => {
    setOutreachPrefill(prefill);
    setActiveTab('outreach');
  }, []);

  const isTabLocked = (tabId: SmartReferralsTab) =>
    !hasConnections && !ALWAYS_UNLOCKED.includes(tabId);

  const renderTabContent = () => {
    if (authLoading) {
      return (
        <div className="flex items-center justify-center p-12 text-[var(--text-soft)] text-sm">
          Loading...
        </div>
      );
    }

    if (!accessToken) {
      return (
        <GlassCard className="p-6 text-center">
          <p className="text-sm text-[var(--text-muted)]">You need an active session to import connections.</p>
          <p className="mt-2 text-xs text-[var(--text-soft)]">
            Refresh the page or sign back in, then try the CSV import again.
          </p>
        </GlassCard>
      );
    }

    switch (activeTab) {
      case 'import':
        return (
          <CsvUploader
            accessToken={accessToken}
            authLoading={authLoading}
            onUploadComplete={handleUploadComplete}
          />
        );
      case 'connections':
        return <ConnectionsBrowser accessToken={accessToken} />;
      case 'targets':
        return <TargetTitlesManager accessToken={accessToken} />;
      case 'job-matches':
        return <JobMatchesList accessToken={accessToken} />;
      case 'job-scan':
        return <ScrapeJobsPanel accessToken={accessToken} />;
      case 'bonus-search':
        return <BonusSearchPanel accessToken={accessToken} />;
      case 'referrals':
        return <ReferralOpportunitiesPanel onGenerateOutreach={handleGenerateOutreach} />;
      case 'contacts':
        return <NetworkingHubRoom />;
      case 'outreach':
        return <NetworkingHubRoom initialPrefill={outreachPrefill ?? undefined} />;
      default:
        return null;
    }
  };

  // Suppress unused variable warning — uploadSummary is retained for future use
  void uploadSummary;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-[var(--text-strong)]">Smart Referrals</h2>
        <p className="text-sm text-[var(--text-soft)] mt-1">
          Import connections, find jobs at their companies, scan high-bonus companies separately, and generate targeted outreach
        </p>
      </div>

      {/* Tab bar */}
      <GlassCard className="p-1">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const locked = isTabLocked(tab.id);
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => !locked && setActiveTab(tab.id)}
                disabled={locked}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all',
                  locked
                    ? 'text-[var(--text-soft)] cursor-not-allowed'
                    : isActive
                      ? 'bg-[var(--surface-1)] text-[var(--text-strong)]'
                      : 'text-[var(--text-soft)] hover:bg-[var(--surface-1)] hover:text-[var(--text-muted)]',
                )}
                title={locked ? 'Upload connections to unlock this tab' : tab.description}
              >
                <Icon size={16} className={cn(locked ? 'text-[var(--text-soft)]' : isActive ? 'text-[#98b3ff]' : 'text-[var(--text-soft)]')} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </GlassCard>

      {/* Tab content */}
      {renderTabContent()}
    </div>
  );
}
