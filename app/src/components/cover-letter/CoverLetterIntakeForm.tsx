import { useState } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { GlassTextarea } from '@/components/GlassInput';
import { GlassInput } from '@/components/GlassInput';
import { Loader2 } from 'lucide-react';

interface CoverLetterIntakeFormProps {
  onSubmit: (data: {
    resumeText: string;
    jobDescription: string;
    companyName: string;
  }) => void | Promise<void>;
  onBack: () => void;
  loading?: boolean;
  error?: string | null;
}

export function CoverLetterIntakeForm({
  onSubmit,
  onBack,
  loading = false,
  error = null,
}: CoverLetterIntakeFormProps) {
  const [resumeText, setResumeText] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [companyName, setCompanyName] = useState('');

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
    });
  };

  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition-colors duration-150"
        >
          <span aria-hidden="true">&#8592;</span>
          Back to Tools
        </button>

        <h1 className="mb-2 text-2xl font-semibold text-white/90">Cover Letter Writer</h1>
        <p className="mb-8 text-sm text-white/50">
          Paste your resume, the job description, and the company name. We'll generate a targeted cover letter that complements your resume strategy.
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-rose-300/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <GlassCard className="space-y-5 p-5">
            <div>
              <label htmlFor="cl-resume" className="mb-1.5 block text-xs font-medium text-white/70">
                Resume Text
              </label>
              <GlassTextarea
                id="cl-resume"
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                placeholder="Paste your resume text here (minimum 50 characters)..."
                rows={8}
                disabled={loading}
              />
              {resumeText.length > 0 && resumeText.trim().length < 50 && (
                <p className="mt-1 text-xs text-amber-200/70">
                  Minimum 50 characters ({resumeText.trim().length}/50)
                </p>
              )}
            </div>

            <div>
              <label htmlFor="cl-jd" className="mb-1.5 block text-xs font-medium text-white/70">
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

            <div>
              <label htmlFor="cl-company" className="mb-1.5 block text-xs font-medium text-white/70">
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

            <div className="flex justify-end pt-2">
              <GlassButton
                type="submit"
                variant="primary"
                disabled={!isValid || loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
