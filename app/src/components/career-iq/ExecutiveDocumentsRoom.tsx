import { useState } from 'react';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/GlassCard';
import { ExecutiveBioRoom } from './ExecutiveBioRoom';
import { CaseStudyRoom } from './CaseStudyRoom';
import { FileText, BookOpen } from 'lucide-react';

type DocTab = 'bio' | 'case-study';

const TABS: { id: DocTab; label: string; icon: typeof FileText; description: string }[] = [
  { id: 'bio', label: 'Executive Bios', icon: FileText, description: 'Speaker, board & LinkedIn bios' },
  { id: 'case-study', label: 'Case Studies', icon: BookOpen, description: 'Consulting-grade narratives' },
];

export function ExecutiveDocumentsRoom() {
  const [activeTab, setActiveTab] = useState<DocTab>('bio');

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white/90">Executive Documents</h2>
        <p className="text-sm text-white/50 mt-1">
          Professional bios and consulting-grade case studies
        </p>
      </div>

      {/* Tab bar */}
      <GlassCard className="p-1">
        <div className="flex gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all',
                  isActive
                    ? 'bg-white/[0.08] text-white'
                    : 'text-white/50 hover:bg-white/[0.04] hover:text-white/70',
                )}
                title={tab.description}
              >
                <Icon size={16} className={isActive ? 'text-[#98b3ff]' : 'text-white/40'} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </GlassCard>

      {/* Tab content */}
      {activeTab === 'bio' ? <ExecutiveBioRoom /> : <CaseStudyRoom />}
    </div>
  );
}
