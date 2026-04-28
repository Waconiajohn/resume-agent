import { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { CsvUploader } from '@/components/network-intelligence/CsvUploader';
import { ConnectionsBrowser } from '@/components/network-intelligence/ConnectionsBrowser';
import { TargetTitlesManager } from '@/components/network-intelligence/TargetTitlesManager';
import { JobMatchesList } from '@/components/network-intelligence/JobMatchesList';
import { ScrapeJobsPanel } from '@/components/network-intelligence/ScrapeJobsPanel';
import { JobFilterPanel } from '@/components/shared/JobFilterPanel';
import { BonusSearchPanel } from '@/components/network-intelligence/BonusSearchPanel';
import { ReferralOpportunitiesPanel } from '@/components/network-intelligence/ReferralOpportunitiesPanel';
import { NetworkingHubRoom, type OutreachReferralContext } from './NetworkingHubRoom';
import { API_BASE } from '@/lib/api';
import { trackProductEvent } from '@/lib/product-telemetry';
import { useAuth } from '@/hooks/useAuth';
import { useJobFilters } from '@/hooks/useJobFilters';
import { useTailorPicker } from '@/components/applications/TailorPickerProvider';
import type { CsvUploadSummary, JobMatch } from '@/types/ni';
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
  network: ['import', 'connections', 'targets', 'job-scan', 'job-matches', 'contacts'],
  bonus: ['bonus-search', 'job-matches', 'referrals', 'contacts'],
};

const ALWAYS_UNLOCKED: Record<ReferralPath, SmartReferralsTab[]> = {
  network: ['import', 'targets', 'contacts'],
  bonus: ['bonus-search', 'job-matches', 'referrals', 'contacts'],
};


interface OutreachPrefill {
  name: string;
  title: string;
  company: string;
  referralContext?: OutreachReferralContext;
}

interface SmartReferralsRoomProps {
  initialFocus?: string | null;
  onNavigate?: (route: string) => void;
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
  onViewMatches,
  onScanComplete,
}: {
  accessToken: string;
  supportView: NetworkSupportView;
  onToggleSupportView: (view: Exclude<NetworkSupportView, null>) => void;
  onViewMatches?: () => void;
  onScanComplete?: () => void;
}) {
  const { filters, setLocation, setRadiusMiles, setWorkModes, setPostedWithin } = useJobFilters('ni-job-filters');

  return (
    <div className="space-y-4">
      <ConnectionsBrowser accessToken={accessToken} />

      <GlassCard className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-soft)]">
            Tools
          </span>
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
      </GlassCard>

      {supportView === 'targets' && (
        <>
          <TargetTitlesManager accessToken={accessToken} />
          <JobFilterPanel
            location={filters.location}
            onLocationChange={setLocation}
            radiusMiles={filters.radiusMiles}
            onRadiusMilesChange={setRadiusMiles}
            workModes={filters.workModes}
            onWorkModesChange={setWorkModes}
            postedWithin={filters.postedWithin}
            onPostedWithinChange={setPostedWithin}
          />
        </>
      )}
      {supportView === 'job-scan' && (
        <ScrapeJobsPanel
          accessToken={accessToken}
          onViewMatches={onViewMatches}
          onScanComplete={onScanComplete}
        />
      )}
    </div>
  );
}

export function SmartReferralsRoom({ initialFocus = null }: SmartReferralsRoomProps) {
  const { openPicker } = useTailorPicker();
  const { user, session, loading: authLoading } = useAuth();
  const { filters: niFilters, setLocation: setNiLocation, setRadiusMiles: setNiRadiusMiles, setWorkModes: setNiWorkModes, setPostedWithin: setNiPostedWithin } = useJobFilters('ni-job-filters');
  const [activeTab, setActiveTab] = useState<SmartReferralsTab>('import');
  const [selectedPath, setSelectedPath] = useState<ReferralPath>(() => getPathForTab(resolveFocusTab(initialFocus)));
  const [networkSupportView, setNetworkSupportView] = useState<NetworkSupportView>(null);
  const [hasConnections, setHasConnections] = useState(false);
  const [outreachPrefill, setOutreachPrefill] = useState<OutreachPrefill | null>(null);
  const [matchRefreshKey, setMatchRefreshKey] = useState(0);

  const handleScanComplete = useCallback(() => {
    setMatchRefreshKey(k => k + 1);
  }, []);
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

  const handleApplyWithResume = useCallback((match: JobMatch) => {
    if (!match.url) return;
    trackProductEvent('job_resume_build_requested', {
      source: 'job_board',
      company_name: match.companyName,
      role_title: match.title,
      has_job_url: true,
    });
    openPicker({
      source: match.searchContext === 'bonus_search' ? 'smart_referrals_bonus_matches' : 'smart_referrals_network_matches',
      jobUrl: match.url,
      companyName: match.companyName ?? undefined,
      roleTitle: match.title,
    });
  }, [openPicker]);

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
          <p className="text-sm text-[var(--text-muted)]">Please sign in to use Networking tools.</p>
          <p className="mt-2 text-xs text-[var(--text-soft)]">
            Please sign in and try again.
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
            onViewMatches={() => setActiveTab('job-matches')}
            onScanComplete={handleScanComplete}
          />
        );
      case 'targets':
        return (
          <>
            <TargetTitlesManager accessToken={accessToken} />
            <JobFilterPanel
              location={niFilters.location}
              onLocationChange={setNiLocation}
              radiusMiles={niFilters.radiusMiles}
              onRadiusMilesChange={setNiRadiusMiles}
              workModes={niFilters.workModes}
              onWorkModesChange={setNiWorkModes}
              postedWithin={niFilters.postedWithin}
              onPostedWithinChange={setNiPostedWithin}
            />
          </>
        );
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
              onApplyWithResume={handleApplyWithResume}
            refreshKey={matchRefreshKey}
            workModes={niFilters.workModes}
          />
        );
      case 'job-scan':
        return (
          <ScrapeJobsPanel
            accessToken={accessToken}
            onViewMatches={() => setActiveTab('job-matches')}
            onScanComplete={handleScanComplete}
          />
        );
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
    <div className="p-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold text-[var(--text-strong)]">Insider Jobs</h2>
        <div className="flex items-center gap-1 rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] p-1">
          <button
            type="button"
            onClick={() => handlePathSelect('network')}
            aria-pressed={selectedPath === 'network'}
            className={cn(
              'rounded-md px-3 py-1.5 text-[13px] font-medium transition-all',
              selectedPath === 'network'
                ? 'bg-[var(--surface-1)] text-[var(--link)]'
                : 'text-[var(--text-soft)] hover:text-[var(--text-muted)]',
            )}
          >
            Network path
          </button>
          <button
            type="button"
            onClick={() => handlePathSelect('bonus')}
            aria-pressed={selectedPath === 'bonus'}
            className={cn(
              'rounded-md px-3 py-1.5 text-[13px] font-medium transition-all',
              selectedPath === 'bonus'
                ? 'bg-[var(--surface-1)] text-[var(--badge-amber-text)]'
                : 'text-[var(--text-soft)] hover:text-[var(--text-muted)]',
            )}
          >
            Bonus path
          </button>
        </div>
      </div>

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
                <Icon size={16} className={cn(locked ? 'text-[var(--text-soft)]' : isActive ? 'text-[var(--link)]' : 'text-[var(--text-soft)]')} />
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
