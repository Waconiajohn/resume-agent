import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { ComparisonSectionBlock } from '@/components/dashboard/ComparisonSectionBlock';
import { resumeToText } from '@/lib/export';
import type { CoachSession } from '@/types/session';
import type { FinalResume } from '@/types/resume';

interface ResumeComparisonModalProps {
  sessionIds: [string, string];
  onClose: () => void;
  onGetSessionResume: (id: string) => Promise<FinalResume | null>;
  sessions: CoachSession[];
}

function getSessionLabel(sessionId: string, sessions: CoachSession[]): string {
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) return sessionId.slice(0, 8);
  const parts = [session.company_name, session.job_title].filter(Boolean);
  return parts.length > 0 ? parts.join(' — ') : 'Untitled Session';
}

function extractSections(resume: FinalResume | null): Record<string, string> {
  if (!resume) return {};
  const sections: Record<string, string> = {};
  if (resume.summary) sections['Summary'] = resume.summary;
  if (resume.experience?.length) {
    sections['Experience'] = resume.experience
      .map((e) => `${e.title} at ${e.company}\n${e.bullets.map((b) => `• ${b.text}`).join('\n')}`)
      .join('\n\n');
  }
  if (resume.skills && Object.keys(resume.skills).length > 0) {
    sections['Skills'] = Object.entries(resume.skills)
      .map(([cat, items]) => `${cat}: ${Array.isArray(items) ? items.join(', ') : items}`)
      .join('\n');
  }
  if (resume.education?.length) {
    sections['Education'] = resume.education
      .map((e) => `${e.degree} in ${e.field}, ${e.institution} (${e.year})`)
      .join('\n');
  }
  if (resume.certifications?.length) {
    sections['Certifications'] = resume.certifications
      .map((c) => `${c.name} — ${c.issuer} (${c.year})`)
      .join('\n');
  }
  return sections;
}

export function ResumeComparisonModal({
  sessionIds,
  onClose,
  onGetSessionResume,
  sessions,
}: ResumeComparisonModalProps) {
  const [resumes, setResumes] = useState<[FinalResume | null, FinalResume | null]>([null, null]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      onGetSessionResume(sessionIds[0]),
      onGetSessionResume(sessionIds[1]),
    ])
      .then(([r1, r2]) => {
        if (!cancelled) {
          setResumes([r1, r2]);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sessionIds, onGetSessionResume]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const leftLabel = getSessionLabel(sessionIds[0], sessions);
  const rightLabel = getSessionLabel(sessionIds[1], sessions);

  const allSectionKeys = new Set([
    ...Object.keys(extractSections(resumes[0])),
    ...Object.keys(extractSections(resumes[1])),
  ]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <GlassCard className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden p-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <h2 className="text-sm font-semibold text-white/90">Resume Comparison</h2>
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-md p-1.5 text-white/50 transition-colors hover:bg-white/[0.08] hover:text-white/85"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-2 gap-3 border-b border-white/[0.06] px-5 py-3">
          <div>
            <p className="text-xs font-medium text-white/70 truncate">{leftLabel}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-white/70 truncate">{rightLabel}</p>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/20 border-t-[#afc4ff]" />
            </div>
          )}

          {!loading && error && (
            <div className="rounded-lg border border-red-300/28 bg-red-500/[0.08] px-4 py-3 text-xs text-red-100/90">
              Failed to load resumes: {error}
            </div>
          )}

          {!loading && !error && resumes[0] === null && resumes[1] === null && (
            <p className="py-8 text-center text-sm text-white/40">No resumes found for these sessions.</p>
          )}

          {!loading && !error && (resumes[0] !== null || resumes[1] !== null) && (
            <div className="space-y-3">
              {/* Full text row */}
              <ComparisonSectionBlock
                title="Full Resume"
                leftContent={resumes[0] ? resumeToText(resumes[0]) : null}
                rightContent={resumes[1] ? resumeToText(resumes[1]) : null}
              />
              {/* Section-level rows */}
              {Array.from(allSectionKeys).map((section) => {
                const leftSections = extractSections(resumes[0]);
                const rightSections = extractSections(resumes[1]);
                return (
                  <ComparisonSectionBlock
                    key={section}
                    title={section}
                    leftContent={leftSections[section] ?? null}
                    rightContent={rightSections[section] ?? null}
                  />
                );
              })}
            </div>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
