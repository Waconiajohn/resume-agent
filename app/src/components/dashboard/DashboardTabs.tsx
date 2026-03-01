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
    <div className="flex flex-wrap gap-1 rounded-xl border border-white/[0.1] bg-white/[0.04] p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200',
            activeTab === tab.id
              ? 'bg-white/[0.08] text-white shadow-sm'
              : 'text-white/55 hover:bg-white/[0.04] hover:text-white/80',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
