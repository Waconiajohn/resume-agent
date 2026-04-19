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
import { BookMarked, Pencil } from 'lucide-react';
import type { V3MasterSummary } from '@/hooks/useV3Pipeline';

interface V3IntakeFormProps {
  onSubmit: (input: {
    resumeText?: string;
    useMaster?: boolean;
    jobDescription: string;
    jdTitle?: string;
    jdCompany?: string;
  }) => void;
  initialResumeText?: string;
  disabled?: boolean;
  /**
   * User's default master resume summary, if one exists. When non-null,
   * the form renders a "using your knowledge base" card at the top and
   * auto-fills the resume textarea with a placeholder message. The user
   * can click "paste a different one" to override.
   */
  master?: V3MasterSummary | null;
}

function formatRelativeDate(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const days = Math.round((now - then) / (1000 * 60 * 60 * 24));
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30) return `${days}d ago`;
    const months = Math.round(days / 30);
    if (months < 12) return `${months}mo ago`;
    const years = Math.round(days / 365);
    return `${years}y ago`;
  } catch {
    return iso;
  }
}

export function V3IntakeForm({ onSubmit, initialResumeText, disabled, master }: V3IntakeFormProps) {
  const [resumeText, setResumeText] = useState(initialResumeText ?? '');
  const [jobDescription, setJobDescription] = useState('');
  const [jdTitle, setJdTitle] = useState('');
  const [jdCompany, setJdCompany] = useState('');
  // When the user has a master, they can toggle between using it (empty
  // resumeText + master-sourced run) or overriding (paste a different one).
  const [overridingMaster, setOverridingMaster] = useState(false);

  const usingMaster = Boolean(master && !overridingMaster);
  // Validation: resume must be pasted OR master must be in use.
  const isValid =
    (usingMaster || resumeText.trim().length >= 50) && jobDescription.trim().length >= 50;

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
        {/* Master resume card — shown when a default master exists */}
        {master && !overridingMaster && (
          <div className="rounded-[var(--radius-card,18px)] border border-[var(--bullet-confirm-border)] bg-[var(--bullet-confirm-bg)] p-4 flex items-start gap-3">
            <BookMarked className="h-4 w-4 text-[var(--bullet-confirm)] flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-[var(--text-strong)]">
                Using your knowledge base
              </div>
              <div className="text-[12px] text-[var(--text-muted)] mt-0.5">
                v{master.version}, last updated {formatRelativeDate(master.updated_at)} · {master.positionCount} positions · {master.evidenceCount} evidence items
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOverridingMaster(true)}
              className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-strong)] whitespace-nowrap"
            >
              Paste a different resume
            </button>
          </div>
        )}

        {(!master || overridingMaster) && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Your resume
              </label>
              {master && overridingMaster && (
                <button
                  type="button"
                  onClick={() => { setOverridingMaster(false); setResumeText(''); }}
                  className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-strong)] flex items-center gap-1"
                >
                  <Pencil className="h-3 w-3" /> Use knowledge base instead
                </button>
              )}
            </div>
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
        )}

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
                ...(usingMaster
                  ? { useMaster: true }
                  : { resumeText: resumeText.trim() }),
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
