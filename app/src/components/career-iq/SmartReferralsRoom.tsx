import { useState, useEffect, useCallback, useRef } from 'react';
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
import { API_BASE } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Upload, Users, Target, ScanLine, UserCircle, Handshake, Briefcase, Coins } from 'lucide-react';

type SmartReferralsTab = 'import' | 'connections' | 'targets' | 'job-matches' | 'job-scan' | 'bonus-search' | 'referrals' | 'contacts';

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
  { id: 'contacts', label: 'Contacts & Outreach', icon: UserCircle, description: 'CRM, Rule of Four, and AI outreach' },
];

// Tabs accessible without connections
const ALWAYS_UNLOCKED: SmartReferralsTab[] = ['import', 'job-scan', 'bonus-search', 'referrals', 'contacts'];

interface OutreachPrefill {
  name: string;
  title: string;
  company: string;
  referralContext?: OutreachReferralContext;
}

interface SmartReferralsRoomProps {
  initialFocus?: string | null;
}

const FOCUS_TO_TAB: Partial<Record<string, SmartReferralsTab>> = {
  import: 'import',
  connections: 'connections',
  targets: 'targets',
  'job-matches': 'job-matches',
  'job-scan': 'job-scan',
  'bonus-search': 'bonus-search',
  referrals: 'referrals',
  contacts: 'contacts',
  outreach: 'contacts',
};

function resolveFocusTab(focus: string | null | undefined): SmartReferralsTab | null {
  if (!focus) return null;
  return FOCUS_TO_TAB[focus] ?? null;
}

export function SmartReferralsRoom({ initialFocus = null }: SmartReferralsRoomProps) {
  const { user, session, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<SmartReferralsTab>('import');
  const [hasConnections, setHasConnections] = useState(false);
  const [outreachPrefill, setOutreachPrefill] = useState<OutreachPrefill | null>(null);
  const accessToken = session?.access_token ?? null;
  const requestedTab = resolveFocusTab(initialFocus);
  const previousAccessTokenRef = useRef<string | null>(accessToken);
  const connectionsRequestIdRef = useRef(0);

  useEffect(() => {
    if (!requestedTab) return;

    setActiveTab((prev) => {
      if (requestedTab === 'import') return 'import';
      if (!hasConnections && !ALWAYS_UNLOCKED.includes(requestedTab)) return 'import';
      return prev === requestedTab ? prev : requestedTab;
    });
  }, [hasConnections, requestedTab]);

  useEffect(() => {
    const previousAccessToken = previousAccessTokenRef.current;
    if (previousAccessToken === accessToken) return;
    previousAccessTokenRef.current = accessToken;

    setOutreachPrefill(null);

    if (!accessToken) {
      setHasConnections(false);
      setActiveTab('import');
      return;
    }

    setHasConnections(false);
    setActiveTab((prev) => {
      if (requestedTab && ALWAYS_UNLOCKED.includes(requestedTab)) return requestedTab;
      return ALWAYS_UNLOCKED.includes(prev) ? prev : 'import';
    });
  }, [accessToken, requestedTab]);

  useEffect(() => {
    if (!accessToken) {
      connectionsRequestIdRef.current += 1;
      return;
    }

    let cancelled = false;
    const requestId = ++connectionsRequestIdRef.current;

    async function checkConnections() {
      try {
        const res = await fetch(`${API_BASE}/ni/connections/count`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (cancelled || requestId !== connectionsRequestIdRef.current) return;
          const has = (data.count ?? 0) > 0;
          setHasConnections(has);
          setActiveTab((prev) => {
            if (requestedTab) {
              if (!has && !ALWAYS_UNLOCKED.includes(requestedTab)) return 'import';
              return requestedTab;
            }
            if (has) {
              return prev === 'import' ? 'connections' : prev;
            }
            return ALWAYS_UNLOCKED.includes(prev) ? prev : 'import';
          });
        }
      } catch {
        if (!cancelled) {
          if (requestId !== connectionsRequestIdRef.current) return;
          setHasConnections(false);
          setActiveTab((prev) => {
            if (requestedTab && ALWAYS_UNLOCKED.includes(requestedTab)) return requestedTab;
            return ALWAYS_UNLOCKED.includes(prev) ? prev : 'import';
          });
        }
      }
    }
    checkConnections();
    return () => { cancelled = true; };
  }, [accessToken, requestedTab]);

  const handleUploadComplete = useCallback(() => {
    setHasConnections(true);
    setActiveTab('connections');
  }, []);

  const handleGenerateOutreach = useCallback((prefill: OutreachPrefill) => {
    setOutreachPrefill(prefill);
    setActiveTab('contacts');
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
        return <NetworkingHubRoom key={user?.id ?? 'anonymous'} initialPrefill={outreachPrefill ?? undefined} />;
      default:
        return null;
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-[var(--text-strong)]">Smart Referrals</h2>
        <p className="text-sm text-[var(--text-soft)] mt-1">
          Import connections, find jobs at their companies, scan high-bonus companies separately, and run contact plus outreach work from one place
        </p>
      </div>

      <GlassCard className="p-5">
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-[#afc4ff]/15 bg-[#afc4ff]/[0.04] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#afc4ff]">Your Network</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
              Import first-level connections, run <span className="text-[var(--text-strong)]">Job Scan</span>, and surface roles at companies where you already know someone.
            </p>
          </div>
          <div className="rounded-xl border border-[#f0d99f]/15 bg-[#f0d99f]/[0.04] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f0d99f]">Bonus Search</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
              Search high-referral-bonus companies even without a connection. These results still land in <span className="text-[var(--text-strong)]">Job Matches</span>.
            </p>
          </div>
          <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-soft)]">Referral Bonus</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
              Treat this as a bonus overlay, not a separate search engine. It only highlights matches where a referral program is known.
            </p>
          </div>
        </div>
      </GlassCard>

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
