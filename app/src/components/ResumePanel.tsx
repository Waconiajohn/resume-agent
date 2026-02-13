import { Download, FileText } from 'lucide-react';
import { GlassCard } from './GlassCard';
import { GlassButton } from './GlassButton';
import { resumeToText, downloadAsText } from '@/lib/export';
import type { FinalResume } from '@/types/resume';

interface ResumePanelProps {
  resume: FinalResume | null;
}

export function ResumePanel({ resume }: ResumePanelProps) {
  if (!resume) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <FileText className="h-10 w-10 text-white/20" />
          <p className="text-sm text-white/40">
            Your tailored resume will appear here as we work together.
          </p>
        </div>
      </div>
    );
  }

  const handleDownload = () => {
    const text = resumeToText(resume);
    downloadAsText(text, 'tailored-resume.txt');
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <span className="text-sm font-medium text-white/70">Resume Preview</span>
        <div className="flex items-center gap-2">
          {resume.ats_score > 0 && (
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
              ATS {resume.ats_score}%
            </span>
          )}
          <GlassButton variant="ghost" onClick={handleDownload} className="h-8 px-2">
            <Download className="h-4 w-4" />
          </GlassButton>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {resume.summary && (
          <GlassCard className="p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
              Summary
            </h3>
            <p className="text-sm text-white/80 leading-relaxed">{resume.summary}</p>
          </GlassCard>
        )}

        {resume.experience.length > 0 && (
          <GlassCard className="p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/40">
              Experience
            </h3>
            <div className="space-y-4">
              {resume.experience.map((exp, i) => (
                <div key={i}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-medium text-white/90">{exp.title}</span>
                    <span className="text-xs text-white/40">
                      {exp.start_date} – {exp.end_date}
                    </span>
                  </div>
                  <div className="text-xs text-white/50">{exp.company} | {exp.location}</div>
                  <ul className="mt-2 space-y-1">
                    {exp.bullets.map((b, j) => (
                      <li key={j} className="flex gap-2 text-sm text-white/70">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-white/30" />
                        {b.text}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </GlassCard>
        )}

        {Object.keys(resume.skills).length > 0 && (
          <GlassCard className="p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
              Skills
            </h3>
            <div className="space-y-2">
              {Object.entries(resume.skills).map(([category, items]) => (
                <div key={category}>
                  <span className="text-xs font-medium text-white/50">{category}: </span>
                  <span className="text-xs text-white/70">{items.join(', ')}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        )}

        {resume.education.length > 0 && (
          <GlassCard className="p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
              Education
            </h3>
            {resume.education.map((edu, i) => (
              <div key={i} className="text-sm text-white/70">
                {edu.degree} in {edu.field}, {edu.institution} ({edu.year})
              </div>
            ))}
          </GlassCard>
        )}

        {resume.certifications.length > 0 && (
          <GlassCard className="p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
              Certifications
            </h3>
            {resume.certifications.map((cert, i) => (
              <div key={i} className="text-sm text-white/70">
                {cert.name} — {cert.issuer} ({cert.year})
              </div>
            ))}
          </GlassCard>
        )}
      </div>
    </div>
  );
}
