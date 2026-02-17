import { useState, useRef, useCallback } from 'react';
import { Sparkles, ArrowLeft, Upload, Loader2 } from 'lucide-react';
import { GlassCard } from './GlassCard';
import { GlassInput } from './GlassInput';
import { GlassTextarea } from './GlassInput';
import { GlassButton } from './GlassButton';

interface PipelineIntakeFormProps {
  onSubmit: (data: { resumeText: string; jobDescription: string; companyName: string }) => void;
  onBack: () => void;
  loading?: boolean;
}

export function PipelineIntakeForm({ onSubmit, onBack, loading = false }: PipelineIntakeFormProps) {
  const [resumeText, setResumeText] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isValid = resumeText.trim().length > 0 && jobDescription.trim().length > 0 && companyName.trim().length > 0;

  const handleFileClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileError(null);

    if (!file.name.endsWith('.txt')) {
      setFileError('Only .txt files are supported for upload. PDF/DOCX support coming soon.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === 'string') {
        setResumeText(text);
      }
    };
    reader.onerror = () => {
      setFileError('Failed to read file. Please paste your resume text instead.');
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || loading) return;
    onSubmit({ resumeText: resumeText.trim(), jobDescription: jobDescription.trim(), companyName: companyName.trim() });
  }, [isValid, loading, onSubmit, resumeText, jobDescription, companyName]);

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)] overflow-y-auto">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-purple-500/5 to-transparent pointer-events-none" />

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
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/20">
            <Sparkles className="h-8 w-8 text-blue-400" />
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
                Resume <span className="text-blue-400">*</span>
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
                  disabled={loading}
                  id="file-upload-hint"
                  className="inline-flex items-center gap-1 text-xs text-blue-400/80 hover:text-blue-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:underline"
                  aria-label="Upload a .txt file to populate resume text"
                >
                  <Upload className="h-3 w-3" />
                  or upload a .txt file
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt"
                  className="hidden"
                  onChange={handleFileChange}
                  aria-hidden="true"
                  tabIndex={-1}
                />
              </div>
              {fileError && (
                <p id="file-error" className="text-xs text-red-400" role="alert">
                  {fileError}
                </p>
              )}
            </div>

            {/* Job Description field */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white/80" htmlFor="job-description">
                Job Description <span className="text-blue-400">*</span>
              </label>
              <GlassTextarea
                id="job-description"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste the job description here..."
                rows={8}
                disabled={loading}
                aria-required="true"
              />
            </div>

            {/* Company Name field */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white/80" htmlFor="company-name">
                Company Name <span className="text-blue-400">*</span>
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
              disabled={!isValid || loading}
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
