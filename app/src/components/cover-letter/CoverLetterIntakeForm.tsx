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
}

export type CoverLetterTone = 'formal' | 'conversational' | 'bold';

interface ToneOption {
  id: CoverLetterTone;
  label: string;
  description: string;
  icon: React.ElementType;
}

const TONE_OPTIONS: ToneOption[] = [
  {
    id: 'formal',
    label: 'Formal',
    description: 'Executive gravitas, structured language',
    icon: Briefcase,
  },
  {
    id: 'conversational',
    label: 'Conversational',
    description: 'Warm, direct, human voice',
    icon: MessageSquare,
  },
  {
    id: 'bold',
    label: 'Bold',
    description: 'High-conviction, declarative positioning',
    icon: Zap,
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
}: CoverLetterIntakeFormProps) {
  const [resumeText, setResumeText] = useState(defaultResumeText ?? '');
  const [jobDescription, setJobDescription] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [tone, setTone] = useState<CoverLetterTone>('formal');

  // Sync pre-filled text when it arrives asynchronously (e.g. after API fetch completes)
  useEffect(() => {
    if (defaultResumeText && resumeText === '') {
      setResumeText(defaultResumeText);
    }
  // resumeText intentionally excluded: only apply the default when the field is still empty
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultResumeText]);

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
          Paste your resume, the job description, and the company name. We'll generate a targeted cover letter that tells the WHY ME story — not a resume rehash.
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-[#f0b8b8]/20 bg-[#f0b8b8]/10 px-4 py-3 text-sm text-[#f0b8b8]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <GlassCard className="space-y-5 p-5">
            {/* Resume Text */}
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <label htmlFor="cl-resume" className="block text-xs font-medium text-[var(--text-muted)]">
                  Resume Text
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
                placeholder="Paste your resume text here (minimum 50 characters)..."
                rows={8}
                disabled={loading}
              />
              {resumeText.length > 0 && resumeText.trim().length < 50 && (
                <p className="mt-1 text-xs text-[#f0d99f]/70">
                  Minimum 50 characters ({resumeText.trim().length}/50)
                </p>
              )}
            </div>

            {/* Job Description */}
            <div>
              <label htmlFor="cl-jd" className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
                Job Description
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
                          ? 'border-[#afc4ff]/30 bg-[#afc4ff]/10 text-[#afc4ff]'
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
