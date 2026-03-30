import { Search, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import type React from 'react';
import { RecruiterSimulator } from './RecruiterSimulator';
import { WritingAnalyzer } from './WritingAnalyzer';

type LinkedInTool = 'recruiter_sim' | 'writing_analyzer';

export function ToolsPanel() {
  const [activeTool, setActiveTool] = useState<LinkedInTool>('recruiter_sim');

  const tools: { id: LinkedInTool; label: string; description: string; icon: React.ComponentType<{ size: number; className?: string }> }[] = [
    {
      id: 'recruiter_sim',
      label: 'Recruiter Search Simulator',
      description: 'See how your profile ranks for specific searches',
      icon: Search,
    },
    {
      id: 'writing_analyzer',
      label: 'Writing Analyzer',
      description: 'Get instant feedback on tone, hooks, and detection risk',
      icon: Eye,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="rail-tabs">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => setActiveTool(tool.id)}
              className={cn('rail-tab flex-1 items-start justify-start')}
              data-active={activeTool === tool.id}
            >
              <div className="mb-1.5 flex items-center gap-2">
                <Icon
                  size={14}
                  className={activeTool === tool.id ? 'text-[var(--accent)]' : 'text-[var(--text-soft)]'}
                />
                <span className={cn('text-[12px] font-semibold', activeTool === tool.id ? 'text-[var(--text-strong)]' : 'text-[var(--text-soft)]')}>
                  {tool.label}
                </span>
              </div>
              <p className="text-[13px] text-[var(--text-soft)] leading-snug">{tool.description}</p>
            </button>
          );
        })}
      </div>

      {activeTool === 'recruiter_sim' && <RecruiterSimulator />}
      {activeTool === 'writing_analyzer' && <WritingAnalyzer />}
    </div>
  );
}
