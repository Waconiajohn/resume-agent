import { Mail, CheckCircle, PenLine } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import type { CoverLetterData } from '@/types/panels';

interface CoverLetterPanelProps {
  data: CoverLetterData;
}

export function CoverLetterPanel({ data }: CoverLetterPanelProps) {
  const { paragraphs, company_name, role_title } = data;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-blue-400/70" />
          <span className="text-sm font-medium text-white/70">Cover Letter</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Letter header */}
        <GlassCard className="p-6 space-y-4">
          {(company_name || role_title) && (
            <div className="border-b border-white/[0.06] pb-4">
              {company_name && (
                <p className="text-sm font-medium text-white/80">{company_name}</p>
              )}
              {role_title && (
                <p className="text-xs text-white/50 mt-0.5">Re: {role_title}</p>
              )}
            </div>
          )}

          {/* Paragraphs */}
          <div className="space-y-4">
            {paragraphs.map((para, i) => {
              const isDraft = para.status === 'draft';
              return (
                <div
                  key={i}
                  className={`relative rounded-lg transition-all duration-300 ${
                    isDraft
                      ? 'border border-amber-500/20 bg-amber-500/[0.03] p-3'
                      : 'pl-0'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {isDraft ? (
                      <PenLine className="mt-0.5 h-3 w-3 shrink-0 text-amber-400/60" />
                    ) : (
                      <CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400/60" />
                    )}
                    <p className="text-sm text-white/80 leading-relaxed">{para.content}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
