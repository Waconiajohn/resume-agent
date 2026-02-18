import { useState, useRef, useCallback, useEffect } from 'react';
import { Sparkles, ArrowLeft, Upload, Loader2 } from 'lucide-react';
import { GlassCard } from './GlassCard';
import { GlassInput } from './GlassInput';
import { GlassTextarea } from './GlassInput';
import { GlassButton } from './GlassButton';
import { extractResumeTextFromUpload } from '@/lib/resume-upload';

interface PipelineIntakeFormProps {
  onSubmit: (data: { resumeText: string; jobDescription: string; companyName: string }) => void;
  onBack: () => void;
  loading?: boolean;
  initialResumeText?: string;
}

export function PipelineIntakeForm({ onSubmit, onBack, loading = false, initialResumeText }: PipelineIntakeFormProps) {
  const [resumeText, setResumeText] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const initialAppliedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialAppliedRef.current) return;
    if (!initialResumeText?.trim()) return;
    if (resumeText.trim().length > 0) return;
    setResumeText(initialResumeText);
    initialAppliedRef.current = true;
  }, [initialResumeText, resumeText]);

  const isValid = resumeText.trim().length > 0 && jobDescription.trim().length > 0 && companyName.trim().length > 0;

  const handleFileClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileError(null);
    setFileLoading(true);
    void (async () => {
      try {
        const extracted = await extractResumeTextFromUpload(file);
        if (!extracted) {
          setFileError('No readable text found in this file. Try another file or paste text directly.');
          return;
        }
        setResumeText(extracted);
      } catch (err) {
        setFileError(err instanceof Error ? err.message : 'Failed to read file. Please paste your resume text instead.');
      } finally {
        setFileLoading(false);
        e.target.value = '';
      }
    })();

  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || loading) return;
    onSubmit({ resumeText: resumeText.trim(), jobDescription: jobDescription.trim(), companyName: companyName.trim() });
  }, [isValid, loading, onSubmit, resumeText, jobDescription, companyName]);

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)] overflow-y-auto">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-slate-300/[0.07] via-transparent to-transparent" />

      <div className="relative z-10 mx-auto max-w-2xl px-4 py-12">
        {/* Back button */}
        <div className="mb-8">
          <GlassButton
            variant="ghost"
            onClick={onBack}
            disabled={loading}
            className="gap-1.5 text-sm"
            aria-label="Back to landing screen"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </GlassButton>
        </div>

        {/* Header */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.12] bg-white/[0.04]">
            <Sparkles className="h-8 w-8 text-[#afc4ff]" />
          </div>
          <h1 className="mb-2 text-3xl font-bold text-white/90">New Resume Session</h1>
          <p className="max-w-md text-sm text-white/50">
            Paste your resume and the job description to get started. I'll tailor your resume to the role.
          </p>
        </div>

        {/* Form */}
        <GlassCard className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            {/* Resume field */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white/80" htmlFor="resume-text">
                Resume <span className="text-white/62">*</span>
              </label>
              <GlassTextarea
                id="resume-text"
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                placeholder="Paste your resume here..."
                rows={10}
                disabled={loading}
                aria-required="true"
                aria-describedby={fileError ? 'file-error' : 'file-upload-hint'}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleFileClick}
                  disabled={loading || fileLoading}
                  id="file-upload-hint"
                  className="inline-flex items-center gap-1 text-xs text-white/58 transition-colors hover:text-white/84 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:underline"
                  aria-label="Upload a resume file (.txt, .docx, .pdf)"
                >
                  {fileLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                  {fileLoading ? 'reading file...' : 'or upload .txt, .docx, or .pdf'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.docx,.pdf,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,text/plain"
                  className="hidden"
                  onChange={handleFileChange}
                  aria-hidden="true"
                  tabIndex={-1}
                />
              </div>
              {initialResumeText?.trim() && (
                <p className="text-xs text-emerald-300/80">
                  Loaded your current default base resume. Edit it as needed before starting.
                </p>
              )}
              {fileError && (
                <p id="file-error" className="text-xs text-red-400" role="alert">
                  {fileError}
                </p>
              )}
            </div>

            {/* Job Description field */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white/80" htmlFor="job-description">
                Job Description <span className="text-white/62">*</span>
              </label>
              <GlassTextarea
                id="job-description"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste the job description text or a job posting URL..."
                rows={8}
                disabled={loading}
                aria-required="true"
              />
              <p className="text-xs text-white/50">
                You can paste full JD text or a job link (URL).
              </p>
            </div>

            {/* Company Name field */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white/80" htmlFor="company-name">
                Company Name <span className="text-white/62">*</span>
              </label>
              <GlassInput
                id="company-name"
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Company name (e.g., Google, Stripe)"
                disabled={loading}
                aria-required="true"
              />
            </div>

            {/* Submit button */}
            <GlassButton
              type="submit"
              disabled={!isValid || loading || fileLoading}
              className="w-full py-3 text-base"
              aria-busy={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Starting session...
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5" />
                  Start Resume Session
                </>
              )}
            </GlassButton>
          </form>
        </GlassCard>
      </div>
    </div>
  );
}
