import { cn } from '@/lib/utils';

interface Tab {
  id: string;
  label: string;
}

interface DashboardTabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (id: string) => void;
}

export function DashboardTabs({ tabs, activeTab, onTabChange }: DashboardTabsProps) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200',
            activeTab === tab.id
              ? 'bg-[var(--surface-1)] text-[var(--text-strong)] shadow-sm'
              : 'text-[var(--text-soft)] hover:bg-[var(--accent-muted)] hover:text-[var(--text-muted)]',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
