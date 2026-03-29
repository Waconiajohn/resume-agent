import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/GlassCard';
import { ExecutiveBioRoom } from './ExecutiveBioRoom';
import { CaseStudyRoom } from './CaseStudyRoom';
import { CareerProfileSummaryCard } from './CareerProfileSummaryCard';
import type { CareerProfileSummary } from './career-profile-summary';
import { FileText, BookOpen } from 'lucide-react';

type DocTab = 'bio' | 'case-study';

const TABS: { id: DocTab; label: string; icon: typeof FileText; description: string }[] = [
  { id: 'bio', label: 'Executive Bios', icon: FileText, description: 'Speaker, board & LinkedIn bios' },
  { id: 'case-study', label: 'Case Studies', icon: BookOpen, description: 'Consulting-grade narratives' },
];

type DocumentStageConfig = {
  focusTitle: string;
  focusSummary: string;
  next: {
    tab: DocTab;
    label: string;
    description: string;
  };
};

const DOCUMENT_STAGE_CONFIG: Record<DocTab, DocumentStageConfig> = {
  bio: {
    focusTitle: 'Write the short-form narrative people will reuse most often',
    focusSummary: 'Use Executive Bios for the concise identity docs that need to stay aligned with your resume, LinkedIn, and speaking profile.',
    next: {
      tab: 'case-study',
      label: 'Case Studies',
      description: 'Move into Case Studies when you want the deeper proof stories that back up the executive narrative.',
    },
  },
  'case-study': {
    focusTitle: 'Turn your strongest wins into proof-led narratives',
    focusSummary: 'Use Case Studies when you need the longer consulting-style stories that show how you think, lead, and create results.',
    next: {
      tab: 'bio',
      label: 'Executive Bios',
      description: 'Return to Bios when the deeper proof is ready and you want the tighter executive summary version.',
    },
  },
};

interface ExecutiveDocumentsRoomProps {
  careerProfileSummary?: CareerProfileSummary;
  onOpenCareerProfile?: () => void;
  initialFocus?: string;
}

export function ExecutiveDocumentsRoom({
  careerProfileSummary,
  onOpenCareerProfile,
  initialFocus,
}: ExecutiveDocumentsRoomProps) {
  const [activeTab, setActiveTab] = useState<DocTab>(initialFocus === 'case-study' ? 'case-study' : 'bio');
  const activeStage = DOCUMENT_STAGE_CONFIG[activeTab];

  useEffect(() => {
    if (initialFocus === 'case-study') {
      setActiveTab('case-study');
      return;
    }
    if (initialFocus === 'bio') {
      setActiveTab('bio');
    }
  }, [initialFocus]);

  return (
    <div className="p-6 space-y-6">
      {careerProfileSummary && (
        <CareerProfileSummaryCard
          summary={careerProfileSummary}
          title="Career Profile is shaping your executive documents"
          description="Executive bios and case studies should sound like the same operator the rest of the platform is positioning, not a separate marketing persona."
          usagePoints={[
            'The profile story decides what identity thread leads your bio.',
            'Differentiators and proof themes determine which wins become case studies.',
            'These documents should reinforce LinkedIn and resume positioning, not contradict it.',
          ]}
          onOpenProfile={onOpenCareerProfile}
        />
      )}

      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-[var(--text-strong)]">Executive Documents</h2>
        <p className="text-sm text-[var(--text-soft)] mt-1">
          Professional bios and consulting-grade case studies
        </p>
      </div>

      <GlassCard className="p-5">
        <div className="grid gap-4 xl:grid-cols-[1.4fr,1fr,1fr]">
          <div>
            <div className="eyebrow-label">Document workflow</div>
            <h3 className="text-[17px] font-semibold text-[var(--text-strong)]">
              Keep the shorter bio and the deeper proof stories aligned.
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-soft)]">
              This room works best when Executive Bios handles the concise executive story and Case Studies handles the longer proof that supports it.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {TABS.map((tab, index) => {
                const isActive = activeTab === tab.id;
                return (
                  <span
                    key={tab.id}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium',
                      isActive
                        ? 'border-[#98b3ff]/30 bg-[#98b3ff]/[0.08] text-[#98b3ff]'
                        : 'border-[var(--line-soft)] bg-[var(--accent-muted)] text-[var(--text-soft)]',
                    )}
                  >
                    <span className="tabular-nums opacity-80">{index + 1}</span>
                    {tab.label}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-soft)]">
              Current focus
            </div>
            <div className="mt-2 text-[14px] font-semibold text-[var(--text-strong)]">
              {activeStage.focusTitle}
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-soft)]">
              {activeStage.focusSummary}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab(activeStage.next.tab)}
            className="rounded-2xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4 text-left transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-1)]"
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-soft)]">
              Next best move
            </div>
            <div className="mt-2 text-[14px] font-semibold text-[var(--text-strong)]">
              {activeStage.next.label}
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-soft)]">
              {activeStage.next.description}
            </p>
          </button>
        </div>
      </GlassCard>

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
                    ? 'bg-[var(--surface-1)] text-[var(--text-strong)]'
                    : 'text-[var(--text-soft)] hover:bg-[var(--surface-1)] hover:text-[var(--text-muted)]',
                )}
                title={tab.description}
              >
                <Icon size={16} className={isActive ? 'text-[#98b3ff]' : 'text-[var(--text-soft)]'} />
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
