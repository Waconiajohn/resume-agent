import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/GlassCard';
import { CsvUploader } from '@/components/network-intelligence/CsvUploader';
import { ConnectionsBrowser } from '@/components/network-intelligence/ConnectionsBrowser';
import { TargetTitlesManager } from '@/components/network-intelligence/TargetTitlesManager';
import { ScrapeJobsPanel } from '@/components/network-intelligence/ScrapeJobsPanel';
import { ReferralOpportunitiesPanel } from '@/components/network-intelligence/ReferralOpportunitiesPanel';
import { NetworkingHubRoom } from './NetworkingHubRoom';
import type { CsvUploadSummary } from '@/types/ni';
import { API_BASE } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { Upload, Users, Target, ScanLine, UserCircle, Send, Handshake } from 'lucide-react';

type SmartReferralsTab = 'import' | 'connections' | 'targets' | 'job-scan' | 'referrals' | 'contacts' | 'outreach';

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
  { id: 'job-scan', label: 'Job Scan', icon: ScanLine, description: 'Scan career pages' },
  { id: 'referrals', label: 'Referrals', icon: Handshake, description: 'Cross-referenced referral opportunities' },
  { id: 'contacts', label: 'Contacts', icon: UserCircle, description: 'CRM & Rule of Four' },
  { id: 'outreach', label: 'Outreach', icon: Send, description: 'AI outreach sequences' },
];

// Tabs accessible without connections
const ALWAYS_UNLOCKED: SmartReferralsTab[] = ['import', 'job-scan', 'referrals', 'contacts', 'outreach'];

export function SmartReferralsRoom() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SmartReferralsTab>('import');
  const [hasConnections, setHasConnections] = useState(false);
  const [uploadSummary, setUploadSummary] = useState<CsvUploadSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadToken() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!cancelled) setAccessToken(session?.access_token ?? null);
    }
    void loadToken();
    return () => { cancelled = true; };
  }, []);

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

  const isTabLocked = (tabId: SmartReferralsTab) =>
    !hasConnections && !ALWAYS_UNLOCKED.includes(tabId);

  const renderTabContent = () => {
    if (!accessToken) {
      return (
        <div className="flex items-center justify-center p-12 text-white/40 text-sm">
          Loading...
        </div>
      );
    }

    switch (activeTab) {
      case 'import':
        return (
          <CsvUploader
            accessToken={accessToken}
            onUploadComplete={handleUploadComplete}
          />
        );
      case 'connections':
        return <ConnectionsBrowser accessToken={accessToken} />;
      case 'targets':
        return <TargetTitlesManager accessToken={accessToken} />;
      case 'job-scan':
        return <ScrapeJobsPanel accessToken={accessToken} />;
      case 'referrals':
        return <ReferralOpportunitiesPanel />;
      case 'contacts':
      case 'outreach':
        return <NetworkingHubRoom />;
      default:
        return null;
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white/90">Smart Referrals</h2>
        <p className="text-sm text-white/50 mt-1">
          Import connections, find jobs at their companies, and generate targeted outreach
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
                    ? 'text-white/25 cursor-not-allowed'
                    : isActive
                      ? 'bg-white/[0.08] text-white'
                      : 'text-white/50 hover:bg-white/[0.04] hover:text-white/70',
                )}
                title={locked ? 'Upload connections to unlock this tab' : tab.description}
              >
                <Icon size={16} className={cn(locked ? 'text-white/15' : isActive ? 'text-[#98b3ff]' : 'text-white/40')} />
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
