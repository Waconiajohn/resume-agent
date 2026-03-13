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
      description: 'Get instant feedback on tone, hooks, and AI risk',
      icon: Eye,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => setActiveTool(tool.id)}
              className={cn(
                'flex-1 rounded-xl border p-4 text-left transition-all',
                activeTool === tool.id
                  ? 'border-[#98b3ff]/30 bg-[#98b3ff]/[0.06]'
                  : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]',
              )}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <Icon
                  size={14}
                  className={activeTool === tool.id ? 'text-[#98b3ff]' : 'text-white/30'}
                />
                <span className={cn('text-[12px] font-semibold', activeTool === tool.id ? 'text-white/80' : 'text-white/45')}>
                  {tool.label}
                </span>
              </div>
              <p className="text-[11px] text-white/30 leading-snug">{tool.description}</p>
            </button>
          );
        })}
      </div>

      {activeTool === 'recruiter_sim' && <RecruiterSimulator />}
      {activeTool === 'writing_analyzer' && <WritingAnalyzer />}
    </div>
  );
}
