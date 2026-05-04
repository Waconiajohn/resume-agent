import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { GlassTextarea } from '@/components/GlassInput';
import { GlassInput } from '@/components/GlassInput';
import { Loader2, Briefcase, MessageSquare, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CoverLetterIntakeFormProps {
  onSubmit: (data: {
    resumeText: string;
    jobDescription: string;
    companyName: string;
    tone: CoverLetterTone;
  }) => void | Promise<void>;
  onBack: () => void;
  loading?: boolean;
  error?: string | null;
  defaultResumeText?: string;
  resumeLoading?: boolean;
  backLabel?: string;
  embedded?: boolean;
  /**
   * Approach C Sprint A — when rendered inside an application workspace,
   * the parent passes the application's company_name and jd_text so the
   * form prefills instead of asking the user to retype. Both optional.
   */
  initialCompanyName?: string;
  initialJobDescription?: string;
}

export type CoverLetterTone = 'formal' | 'conversational' | 'bold';

interface ToneOption {
  id: CoverLetterTone;
  label: string;
  description: string;
  icon: React.ElementType;
  /**
   * Sprint D4 — one-sentence preview of the voice this tone produces. Shown
   * on hover so users can feel the difference before they pick one.
   */
  sample: string;
}

const TONE_OPTIONS: ToneOption[] = [
  {
    id: 'formal',
    label: 'Formal',
    description: 'Executive gravitas, structured language',
    icon: Briefcase,
    sample:
      '"Your target role calls for someone who can turn complexity into operating rhythm. My strongest proof is building cross-functional teams through measurable change, not simply managing the status quo."',
  },
  {
    id: 'conversational',
    label: 'Conversational',
    description: 'Warm, direct, human voice',
    icon: MessageSquare,
    sample:
      '"What stood out to me about this role is the mix of execution, people leadership, and messy business problems. That is where my best work has usually happened."',
  },
  {
    id: 'bold',
    label: 'Bold',
    description: 'High-conviction, declarative positioning',
    icon: Zap,
    sample:
      '"The benchmark candidate for this role should already have proof of solving this kind of problem. My background gives you that proof, with enough range to move quickly."',
  },
];

export function CoverLetterIntakeForm({
  onSubmit,
  onBack,
  loading = false,
  error = null,
  defaultResumeText,
  resumeLoading = false,
  backLabel = 'Back to Tools',
  embedded = false,
  initialCompanyName,
  initialJobDescription,
}: CoverLetterIntakeFormProps) {
  const [resumeText, setResumeText] = useState(defaultResumeText ?? '');
  const [jobDescription, setJobDescription] = useState(initialJobDescription ?? '');
  const [companyName, setCompanyName] = useState(initialCompanyName ?? '');
  const [tone, setTone] = useState<CoverLetterTone>('formal');

  // Sync pre-filled text when it arrives asynchronously (e.g. after API fetch completes)
  useEffect(() => {
    if (defaultResumeText && resumeText.trim() === '') {
      setResumeText(defaultResumeText);
    }
  // resumeText intentionally excluded: only apply the default when the field is still empty
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultResumeText]);

  useEffect(() => {
    if (initialJobDescription && jobDescription.trim() === '') {
      setJobDescription(initialJobDescription);
    }
  // jobDescription intentionally excluded: never overwrite a user's edits after prefill
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialJobDescription]);

  useEffect(() => {
    if (initialCompanyName && companyName.trim() === '') {
      setCompanyName(initialCompanyName);
    }
  // companyName intentionally excluded: never overwrite a user's edits after prefill
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCompanyName]);

  const isValid =
    resumeText.trim().length >= 50 &&
    jobDescription.trim().length >= 1 &&
    companyName.trim().length >= 1;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || loading) return;
    void onSubmit({
      resumeText: resumeText.trim(),
      jobDescription: jobDescription.trim(),
      companyName: companyName.trim(),
      tone,
    });
  };

  return (
    <div className={embedded ? '' : 'h-[calc(100vh-3.5rem)] overflow-y-auto'}>
      <div className="mx-auto max-w-2xl px-4 py-8">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 flex items-center gap-1.5 text-sm text-[var(--text-soft)] hover:text-[var(--text-strong)] transition-colors duration-150"
        >
          <span aria-hidden="true">&#8592;</span>
          {backLabel}
        </button>

        <h1 className="mb-2 text-2xl font-semibold text-[var(--text-strong)]">Cover Letter</h1>
        <p className="mb-8 text-sm text-[var(--text-soft)]">
          Use your Career Vault resume and the target job description. We'll generate a targeted why-you letter, not a resume rehash.
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-[var(--badge-red-text)]/20 bg-[var(--badge-red-bg)] px-4 py-3 text-sm text-[var(--badge-red-text)]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <GlassCard className="space-y-5 p-5">
            {/* Resume Text */}
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <label htmlFor="cl-resume" className="block text-xs font-medium text-[var(--text-muted)]">
                  Career Vault Resume Text
                </label>
                {resumeLoading && (
                  <span
                    data-testid="resume-loading-indicator"
                    className="flex items-center gap-1 text-xs text-[var(--text-soft)]"
                    aria-live="polite"
                    aria-label="Loading resume"
                  >
                    <Loader2 className="h-3 w-3 motion-safe:animate-spin" />
                    Loading resume...
                  </span>
                )}
              </div>
              <GlassTextarea
                id="cl-resume"
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                placeholder="Paste your Career Vault resume text here (minimum 50 characters)..."
                rows={8}
                disabled={loading}
              />
              {resumeText.length > 0 && resumeText.trim().length < 50 && (
                <p className="mt-1 text-xs text-[var(--badge-amber-text)]/70">
                  Minimum 50 characters ({resumeText.trim().length}/50)
                </p>
              )}
            </div>

            {/* Job Description */}
            <div>
              <label htmlFor="cl-jd" className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
                Target Job Description
              </label>
              <GlassTextarea
                id="cl-jd"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste the job description..."
                rows={6}
                disabled={loading}
              />
            </div>

            {/* Company Name */}
            <div>
              <label htmlFor="cl-company" className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
                Company Name
              </label>
              <GlassInput
                id="cl-company"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Acme Corp"
                disabled={loading}
              />
            </div>

            {/* Tone Selector */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--text-muted)]">Letter Tone</span>
                <span className="text-[12px] text-[var(--text-soft)]">Choose the voice that fits the company culture</span>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {TONE_OPTIONS.map(({ id, label, description, icon: Icon }) => {
                  const isSelected = tone === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTone(id)}
                      disabled={loading}
                      className={cn(
                        'flex flex-col items-center gap-2 rounded-xl border p-3.5 text-center transition-all',
                        isSelected
                          ? 'border-[var(--link)]/30 bg-[var(--badge-blue-bg)] text-[var(--link)]'
                          : 'border-[var(--line-soft)] bg-[var(--accent-muted)] text-[var(--text-soft)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-1)] hover:text-[var(--text-muted)]',
                        loading && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <div>
                        <div className="text-[12px] font-semibold">{label}</div>
                        <div className="mt-0.5 text-[12px] opacity-60 leading-tight">{description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {/* Sprint D4 — sample of the selected tone so the user hears
                  the difference before they generate anything. */}
              <div
                className="mt-2 rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)]/60 px-3 py-2 text-[12px] italic leading-relaxed text-[var(--text-soft)]"
                aria-live="polite"
              >
                {TONE_OPTIONS.find((t) => t.id === tone)?.sample}
              </div>
            </div>

            {/* Submit */}
            <div className="flex justify-end pt-2">
              <GlassButton
                type="submit"
                variant="primary"
                disabled={!isValid || loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" />
                    Starting...
                  </>
                ) : (
                  'Generate Cover Letter'
                )}
              </GlassButton>
            </div>
          </GlassCard>
        </form>
      </div>
    </div>
  );
}
