/**
 * V3IntakeForm — paste-a-resume + paste-a-JD starting form.
 *
 * Intentionally stripped: resume_text, job_description, optional jd_title,
 * optional jd_company. No gate flow, no clarification memory, no pre-scores.
 * v3 is a straight shot.
 */

import { useState } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { GlassInput, GlassTextarea } from '@/components/GlassInput';

interface V3IntakeFormProps {
  onSubmit: (input: {
    resumeText: string;
    jobDescription: string;
    jdTitle?: string;
    jdCompany?: string;
  }) => void;
  initialResumeText?: string;
  disabled?: boolean;
}

export function V3IntakeForm({ onSubmit, initialResumeText, disabled }: V3IntakeFormProps) {
  const [resumeText, setResumeText] = useState(initialResumeText ?? '');
  const [jobDescription, setJobDescription] = useState('');
  const [jdTitle, setJdTitle] = useState('');
  const [jdCompany, setJdCompany] = useState('');

  const isValid =
    resumeText.trim().length >= 50 && jobDescription.trim().length >= 50;

  return (
    <GlassCard className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl text-[var(--text-strong)] font-semibold">
          Tailor your resume
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Paste your resume and the job description. The pipeline extracts, classifies,
          strategizes, writes, and verifies — with full source attribution on every bullet.
        </p>
      </div>

      <div className="space-y-5">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-2">
            Your resume
          </label>
          <GlassTextarea
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder="Paste your resume text here…"
            rows={14}
            disabled={disabled}
            className="font-mono text-[13px] leading-relaxed"
          />
          <div className="text-[11px] text-[var(--text-soft)] mt-1">
            {resumeText.trim().length.toLocaleString()} characters
            {resumeText.trim().length > 0 && resumeText.trim().length < 50 && (
              <span className="text-[var(--badge-red-text)] ml-2">
                (at least 50 required)
              </span>
            )}
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-2">
            Job description
          </label>
          <GlassTextarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste the target job description…"
            rows={10}
            disabled={disabled}
          />
          <div className="text-[11px] text-[var(--text-soft)] mt-1">
            {jobDescription.trim().length.toLocaleString()} characters
            {jobDescription.trim().length > 0 && jobDescription.trim().length < 50 && (
              <span className="text-[var(--badge-red-text)] ml-2">
                (at least 50 required)
              </span>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-2">
              Job title (optional)
            </label>
            <GlassInput
              value={jdTitle}
              onChange={(e) => setJdTitle(e.target.value)}
              placeholder="e.g. Senior Product Manager"
              disabled={disabled}
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-2">
              Company (optional)
            </label>
            <GlassInput
              value={jdCompany}
              onChange={(e) => setJdCompany(e.target.value)}
              placeholder="e.g. Acme Corp"
              disabled={disabled}
            />
          </div>
        </div>

        <div className="pt-2">
          <GlassButton
            variant="primary"
            size="lg"
            disabled={!isValid || disabled}
            onClick={() => {
              if (!isValid || disabled) return;
              onSubmit({
                resumeText: resumeText.trim(),
                jobDescription: jobDescription.trim(),
                jdTitle: jdTitle.trim() || undefined,
                jdCompany: jdCompany.trim() || undefined,
              });
            }}
          >
            {disabled ? 'Starting…' : 'Generate tailored resume'}
          </GlassButton>
        </div>
      </div>
    </GlassCard>
  );
}
