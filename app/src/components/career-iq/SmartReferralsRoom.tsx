import { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { CsvUploader } from '@/components/network-intelligence/CsvUploader';
import { ConnectionsBrowser } from '@/components/network-intelligence/ConnectionsBrowser';
import { TargetTitlesManager } from '@/components/network-intelligence/TargetTitlesManager';
import { JobMatchesList } from '@/components/network-intelligence/JobMatchesList';
import { ScrapeJobsPanel } from '@/components/network-intelligence/ScrapeJobsPanel';
import { BonusSearchPanel } from '@/components/network-intelligence/BonusSearchPanel';
import { ReferralOpportunitiesPanel } from '@/components/network-intelligence/ReferralOpportunitiesPanel';
import { NetworkingHubRoom, type OutreachReferralContext } from './NetworkingHubRoom';
import { API_BASE } from '@/lib/api';
import { trackProductEvent } from '@/lib/product-telemetry';
import { useAuth } from '@/hooks/useAuth';
import type { CsvUploadSummary } from '@/types/ni';
import { Upload, Users, Target, ScanLine, UserCircle, Handshake, Briefcase, Coins } from 'lucide-react';

type SmartReferralsTab = 'import' | 'connections' | 'targets' | 'job-matches' | 'job-scan' | 'bonus-search' | 'referrals' | 'contacts';
type ReferralPath = 'network' | 'bonus';
type NetworkSupportView = 'targets' | 'job-scan' | null;

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
  { id: 'job-matches', label: 'Matches', icon: Briefcase, description: 'Jobs at companies where you have first-level connections' },
  { id: 'job-scan', label: 'Job Scan', icon: ScanLine, description: 'Scan career pages' },
  { id: 'bonus-search', label: 'Bonus Search', icon: Coins, description: 'Search high-referral-bonus companies even without a connection' },
  { id: 'referrals', label: 'Referral Bonus', icon: Handshake, description: 'Bonus-tagged opportunities where a referral program exists' },
  { id: 'contacts', label: 'Outreach', icon: UserCircle, description: 'CRM, Rule of Four, and outreach drafts' },
];

const TAB_MAP = Object.fromEntries(TABS.map((tab) => [tab.id, tab])) as Record<SmartReferralsTab, TabDef>;

const PATH_TABS: Record<ReferralPath, SmartReferralsTab[]> = {
  network: ['import', 'connections', 'job-matches', 'contacts'],
  bonus: ['bonus-search', 'job-matches', 'referrals', 'contacts'],
};

const ALWAYS_UNLOCKED: Record<ReferralPath, SmartReferralsTab[]> = {
  network: ['import', 'contacts'],
  bonus: ['bonus-search', 'job-matches', 'referrals', 'contacts'],
};

const PATH_COPY: Record<ReferralPath, {
  eyebrow: string;
  title: string;
  description: string;
  helper: string;
  accentClass: string;
}> = {
  network: {
    eyebrow: 'Best first path',
    title: 'Use your existing connections first',
    description: 'Import first-degree connections, scan their company job pages, review the roles, and move straight into outreach.',
    helper: 'This is the strongest path when someone is already there.',
    accentClass: 'border-[#afc4ff]/20 bg-[#afc4ff]/[0.05]',
  },
  bonus: {
    eyebrow: 'Second visible path',
    title: 'Chase strong referral bonuses separately',
    description: 'Search known high-bonus companies even without a connection, review those roles, and keep growing the bonus-company database as matches appear.',
    helper: 'Coverage is still limited to the bonus programs we have identified so far.',
    accentClass: 'border-[#f0d99f]/20 bg-[#f0d99f]/[0.05]',
  },
};

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

function getPathForTab(tab: SmartReferralsTab | null): ReferralPath {
  if (tab === 'bonus-search' || tab === 'referrals') return 'bonus';
  return 'network';
}

function getDefaultTab(path: ReferralPath, hasConnections: boolean): SmartReferralsTab {
  if (path === 'bonus') return 'bonus-search';
  return hasConnections ? 'connections' : 'import';
}

function isNetworkSupportTab(tab: SmartReferralsTab | null): tab is 'targets' | 'job-scan' {
  return tab === 'targets' || tab === 'job-scan';
}

function NetworkSetupPanel({
  accessToken,
  supportView,
  onToggleSupportView,
}: {
  accessToken: string;
  supportView: NetworkSupportView;
  onToggleSupportView: (view: Exclude<NetworkSupportView, null>) => void;
}) {
  return (
    <div className="space-y-4">
      <ConnectionsBrowser accessToken={accessToken} />

      <GlassCard className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-soft)]">
              Support tools
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-soft)]">
              Keep target titles and company-page scans close to the connection workflow without turning them into first-class tabs.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <GlassButton
              variant={supportView === 'targets' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => onToggleSupportView('targets')}
            >
              Target titles
            </GlassButton>
            <GlassButton
              variant={supportView === 'job-scan' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => onToggleSupportView('job-scan')}
            >
              Scan company pages
            </GlassButton>
          </div>
        </div>
      </GlassCard>

      {supportView === 'targets' && <TargetTitlesManager accessToken={accessToken} />}
      {supportView === 'job-scan' && <ScrapeJobsPanel accessToken={accessToken} />}
    </div>
  );
}

export function SmartReferralsRoom({ initialFocus = null }: SmartReferralsRoomProps) {
  const { user, session, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<SmartReferralsTab>('import');
  const [selectedPath, setSelectedPath] = useState<ReferralPath>(() => getPathForTab(resolveFocusTab(initialFocus)));
  const [networkSupportView, setNetworkSupportView] = useState<NetworkSupportView>(null);
  const [hasConnections, setHasConnections] = useState(false);
  const [outreachPrefill, setOutreachPrefill] = useState<OutreachPrefill | null>(null);
  const accessToken = session?.access_token ?? null;
  const requestedTab = resolveFocusTab(initialFocus);
  const previousAccessTokenRef = useRef<string | null>(accessToken);
  const connectionsRequestIdRef = useRef(0);

  useEffect(() => {
    if (!requestedTab) return;

    setSelectedPath(getPathForTab(requestedTab));
    setActiveTab(isNetworkSupportTab(requestedTab) ? 'connections' : requestedTab);
    setNetworkSupportView(isNetworkSupportTab(requestedTab) ? requestedTab : null);
  }, [requestedTab]);

  useEffect(() => {
    const previousAccessToken = previousAccessTokenRef.current;
    if (previousAccessToken === accessToken) return;
    previousAccessTokenRef.current = accessToken;

    setOutreachPrefill(null);
    setNetworkSupportView(null);

    if (!accessToken) {
      setHasConnections(false);
      setActiveTab(getDefaultTab(selectedPath, false));
      return;
    }

    setHasConnections(false);
    setActiveTab((prev) => {
      const unlockedTabs = ALWAYS_UNLOCKED[selectedPath];
      if (requestedTab && unlockedTabs.includes(requestedTab)) return requestedTab;
      return unlockedTabs.includes(prev) ? prev : getDefaultTab(selectedPath, false);
    });
  }, [accessToken, requestedTab, selectedPath]);

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
          if (requestedTab && isNetworkSupportTab(requestedTab)) {
            setNetworkSupportView(has && selectedPath === 'network' ? requestedTab : null);
          }
          setActiveTab((prev) => {
            if (requestedTab) {
              if (getPathForTab(requestedTab) !== selectedPath) {
                return getDefaultTab(selectedPath, has);
              }
              if (isNetworkSupportTab(requestedTab)) {
                return has && selectedPath === 'network' ? 'connections' : getDefaultTab(selectedPath, has);
              }
              if (!has && !ALWAYS_UNLOCKED[selectedPath].includes(requestedTab)) return getDefaultTab(selectedPath, has);
              return requestedTab;
            }
            if (!PATH_TABS[selectedPath].includes(prev)) return getDefaultTab(selectedPath, has);
            if (!has && !ALWAYS_UNLOCKED[selectedPath].includes(prev)) return getDefaultTab(selectedPath, has);
            if (has && selectedPath === 'network' && prev === 'import') return 'connections';
            return prev;
          });
        }
      } catch {
        if (!cancelled) {
          if (requestId !== connectionsRequestIdRef.current) return;
          setHasConnections(false);
          setNetworkSupportView(null);
          setActiveTab((prev) => {
            if (requestedTab && ALWAYS_UNLOCKED[selectedPath].includes(requestedTab)) return requestedTab;
            return ALWAYS_UNLOCKED[selectedPath].includes(prev) ? prev : getDefaultTab(selectedPath, false);
          });
        }
      }
    }
    checkConnections();
    return () => { cancelled = true; };
  }, [accessToken, requestedTab, selectedPath]);

  const handleUploadComplete = useCallback((summary: CsvUploadSummary) => {
    trackProductEvent('smart_referrals_connections_imported', {
      total_rows: summary.totalRows,
      valid_rows: summary.validRows,
      skipped_rows: summary.skippedRows,
      duplicates_removed: summary.duplicatesRemoved,
      unique_companies: summary.uniqueCompanies,
    });
    setHasConnections(true);
    setSelectedPath('network');
    setActiveTab('connections');
    setNetworkSupportView(null);
  }, []);

  const handleGenerateOutreach = useCallback((prefill: OutreachPrefill) => {
    trackProductEvent('smart_referrals_outreach_opened', {
      path: prefill.referralContext ? 'bonus' : 'network',
      prefilled: true,
      trigger: 'referral_bonus',
    });
    setOutreachPrefill(prefill);
    setSelectedPath(prefill.referralContext ? 'bonus' : 'network');
    setActiveTab('contacts');
    setNetworkSupportView(null);
  }, []);

  const visibleTabs = PATH_TABS[selectedPath];

  const isTabLocked = useCallback((tabId: SmartReferralsTab) =>
    !hasConnections && !ALWAYS_UNLOCKED[selectedPath].includes(tabId),
  [hasConnections, selectedPath]);

  const effectiveActiveTab =
    visibleTabs.includes(activeTab) && !isTabLocked(activeTab)
      ? activeTab
      : getDefaultTab(selectedPath, hasConnections);

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

    switch (effectiveActiveTab) {
      case 'import':
        return (
          <CsvUploader
            accessToken={accessToken}
            authLoading={authLoading}
            onUploadComplete={handleUploadComplete}
          />
        );
      case 'connections':
        return (
          <NetworkSetupPanel
            accessToken={accessToken}
            supportView={networkSupportView}
            onToggleSupportView={(view) => {
              setActiveTab('connections');
              setNetworkSupportView((current) => (current === view ? null : view));
            }}
          />
        );
      case 'targets':
        return null;
      case 'job-matches':
        return (
          <JobMatchesList
            accessToken={accessToken}
            initialFilter={selectedPath === 'bonus' ? 'bonus_search' : 'network_connections'}
            title={selectedPath === 'bonus' ? 'Bonus Matches' : 'Network Matches'}
            description={
              selectedPath === 'bonus'
                ? 'Review the roles coming from the bonus-company path. Use this lane when the payout is worth chasing even without a first-degree connection.'
                : 'Review the roles found at companies where you already know someone, then move straight into outreach or your main job pipeline.'
            }
          />
        );
      case 'job-scan':
        return null;
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

  const handlePathSelect = useCallback((path: ReferralPath) => {
    trackProductEvent('smart_referrals_path_selected', {
      path,
      source: 'user',
      has_connections: hasConnections,
    });
    setSelectedPath(path);
    setActiveTab(getDefaultTab(path, hasConnections));
    setNetworkSupportView(null);
  }, [hasConnections]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[var(--text-strong)]">Smart Referrals</h2>
        <p className="text-sm text-[var(--text-soft)] mt-1">
          Work this in two clear ways: start with companies where you already know someone, or run a separate bonus-first search when the payout is worth chasing.
        </p>
      </div>

      <GlassCard className="p-5">
        <div className="grid gap-3 lg:grid-cols-2">
          {(['network', 'bonus'] as const).map((path) => {
            const copy = PATH_COPY[path];
            const isActive = selectedPath === path;
            return (
              <button
                key={path}
                type="button"
                onClick={() => handlePathSelect(path)}
                aria-pressed={isActive}
                className={cn(
                  'rounded-xl border p-4 text-left transition-all',
                  copy.accentClass,
                  isActive ? 'ring-1 ring-offset-0 ring-[var(--surface-1)]' : 'hover:bg-[var(--surface-1)]/70',
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className={cn(
                    'text-[11px] font-semibold uppercase tracking-[0.18em]',
                    path === 'network' ? 'text-[#afc4ff]' : 'text-[#f0d99f]',
                  )}>
                    {copy.eyebrow}
                  </p>
                  {isActive && (
                    <span className="rounded-full border border-[var(--line-soft)] bg-[var(--surface-1)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
                      Active
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm font-semibold text-[var(--text-strong)]">{copy.title}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-muted)]">{copy.description}</p>
                <p className="mt-2 text-[11px] text-[var(--text-soft)]">{copy.helper}</p>
              </button>
            );
          })}
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-soft)]">
              {selectedPath === 'network' ? 'Connection path' : 'Bonus path'}
            </p>
            <h3 className="mt-1.5 text-base font-semibold text-[var(--text-strong)]">
              {selectedPath === 'network'
                ? 'Use your network first, then move into outreach'
                : 'Search strong bonus companies, then work the worthwhile ones'}
            </h3>
            <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-[var(--text-soft)]">
              {selectedPath === 'network'
                ? 'Import your connections, review the companies where someone already works, check the matches, and then move into outreach.'
                : 'Use this when no one is already there but the company is known to pay a meaningful referral bonus.'}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 text-[13px] text-[var(--text-soft)] lg:max-w-sm">
            {selectedPath === 'network'
              ? 'Best path when you already have a first-degree connection at the company.'
              : 'Separate path for known bonus companies. We keep expanding that database as new matches are found.'}
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-1">
        <div className="flex gap-1 overflow-x-auto">
          {visibleTabs.map((tabId) => {
            const tab = TAB_MAP[tabId];
            const Icon = tab.icon;
            const locked = isTabLocked(tab.id);
            const isActive = effectiveActiveTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  if (locked) return;
                  if (tab.id === 'job-matches') {
                    trackProductEvent('smart_referrals_matches_opened', {
                      path: selectedPath,
                      initial_filter: selectedPath === 'bonus' ? 'bonus_search' : 'network_connections',
                    });
                  }
                  if (tab.id === 'contacts') {
                    trackProductEvent('smart_referrals_outreach_opened', {
                      path: selectedPath,
                      prefilled: false,
                      trigger: 'manual',
                    });
                  }
                  setActiveTab(tab.id);
                  if (tab.id !== 'connections') {
                    setNetworkSupportView(null);
                  }
                }}
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
