import { useState } from 'react';
import { ChevronDown, ChevronRight, MessageSquare, HelpCircle } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import type { InterviewPrepData, InterviewQuestion } from '@/types/panels';

interface InterviewPrepPanelProps {
  data: InterviewPrepData;
}

function QuestionItem({ q }: { q: InterviewQuestion }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden transition-all duration-200"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-2 p-3 text-left hover:bg-white/[0.03] transition-colors"
      >
        {expanded ? (
          <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/30" />
        ) : (
          <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/30" />
        )}
        <span className="text-sm text-white/80">{q.question}</span>
      </button>

      {expanded && (
        <div className="border-t border-white/[0.06] px-3 pb-3 pt-2 space-y-3">
          {/* Why they ask */}
          <div className="flex items-start gap-2">
            <HelpCircle className="mt-0.5 h-3 w-3 shrink-0 text-purple-400/60" />
            <p className="text-xs text-white/50 italic">{q.why_asked}</p>
          </div>

          {/* STAR framework */}
          <div className="space-y-2">
            {(['situation', 'task', 'action', 'result'] as const).map((step) => {
              const value = q.star_framework[step];
              if (!value) return null;
              const colors = {
                situation: 'border-blue-500/20 text-blue-300',
                task: 'border-amber-500/20 text-amber-300',
                action: 'border-emerald-500/20 text-emerald-300',
                result: 'border-purple-500/20 text-purple-300',
              };
              return (
                <div key={step} className="flex items-start gap-2">
                  <span className={`mt-0.5 shrink-0 rounded border px-1 py-px text-[9px] font-bold uppercase ${colors[step]}`}>
                    {step[0]}
                  </span>
                  <p className="text-xs text-white/70 leading-relaxed">{value}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function InterviewPrepPanel({ data }: InterviewPrepPanelProps) {
  const { categories } = data;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-blue-400/70" />
          <span className="text-sm font-medium text-white/70">Interview Prep</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {categories.map((cat, ci) => (
          <GlassCard key={ci} className="p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/40">
              {cat.category}
            </h3>
            <div className="space-y-2">
              {cat.questions.map((q, qi) => (
                <QuestionItem key={qi} q={q} />
              ))}
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
