import { useState, useRef, useCallback } from 'react';
import { Sparkles, Upload, Loader2 } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import { GlassButton } from '../GlassButton';
import { extractResumeTextFromUpload } from '@/lib/resume-upload';
import { extractJobDescriptionTextFromUpload } from '@/lib/job-description-upload';

interface V2IntakeFormProps {
  onSubmit: (resumeText: string, jobDescription: string) => void;
  loading?: boolean;
  error?: string | null;
  initialResumeText?: string;
}

export function V2IntakeForm({ onSubmit, loading = false, error, initialResumeText }: V2IntakeFormProps) {
  const [resumeText, setResumeText] = useState(initialResumeText ?? '');
  const [jobDescription, setJobDescription] = useState('');
  const [resumeFileLoading, setResumeFileLoading] = useState(false);
  const [resumeFileError, setResumeFileError] = useState<string | null>(null);
  const [jdFileLoading, setJdFileLoading] = useState(false);
  const [jdFileError, setJdFileError] = useState<string | null>(null);
  const resumeFileRef = useRef<HTMLInputElement>(null);
  const jdFileRef = useRef<HTMLInputElement>(null);

  const isValid = resumeText.trim().length >= 50 && jobDescription.trim().length >= 50;

  const handleResumeFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResumeFileError(null);
    setResumeFileLoading(true);
    void (async () => {
      try {
        const text = await extractResumeTextFromUpload(file);
        if (!text) { setResumeFileError('No readable text found.'); return; }
        setResumeText(text);
      } catch (err) {
        setResumeFileError(err instanceof Error ? err.message : 'Failed to read file.');
      } finally {
        setResumeFileLoading(false);
        e.target.value = '';
      }
    })();
  }, []);

  const handleJdFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setJdFileError(null);
    setJdFileLoading(true);
    void (async () => {
      try {
        const text = await extractJobDescriptionTextFromUpload(file);
        if (!text) { setJdFileError('No readable text found.'); return; }
        setJobDescription(text);
      } catch (err) {
        setJdFileError(err instanceof Error ? err.message : 'Failed to read file.');
      } finally {
        setJdFileLoading(false);
        e.target.value = '';
      }
    })();
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || loading) return;
    onSubmit(resumeText.trim(), jobDescription.trim());
  }, [isValid, loading, onSubmit, resumeText, jobDescription]);

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)] overflow-y-auto">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-slate-300/[0.07] via-transparent to-transparent" />

      <div className="relative z-10 mx-auto max-w-2xl px-4 py-12">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.12] bg-white/[0.04]">
            <Sparkles className="h-8 w-8 text-[#afc4ff]" />
          </div>
          <h1 className="mb-2 text-3xl font-bold text-white/90">Position Your Resume</h1>
          <p className="max-w-md text-sm text-white/50">
            Paste your resume and the job description. AI does the rest in under 2 minutes.
          </p>
        </div>

        <GlassCard className="p-6">
          {error && (
            <div className="mb-4 rounded-lg border border-[#f0b8b8]/28 bg-[#f0b8b8]/[0.08] px-3 py-2 text-xs text-[#f0b8b8]/90" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            {/* Resume */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white/80" htmlFor="v2-resume">
                Your Resume
              </label>
              <textarea
                id="v2-resume"
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                placeholder="Paste your resume here..."
                rows={10}
                disabled={loading}
                aria-required="true"
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-sm text-white/90 placeholder:text-white/30 outline-none focus:border-[#afc4ff]/40 disabled:opacity-50 resize-y"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => resumeFileRef.current?.click()}
                  disabled={loading || resumeFileLoading}
                  className="inline-flex items-center gap-1 text-xs text-white/50 hover:text-white/80 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#afc4ff]/40"
                >
                  {resumeFileLoading ? <Loader2 className="h-3 w-3 motion-safe:animate-spin" /> : <Upload className="h-3 w-3" />}
                  {resumeFileLoading ? 'reading...' : 'upload .txt, .docx, or .pdf'}
                </button>
                <input ref={resumeFileRef} type="file" accept=".txt,.docx,.pdf" className="hidden" onChange={handleResumeFile} tabIndex={-1} />
              </div>
              {resumeFileError && <p className="text-xs text-[#f0b8b8]" role="alert">{resumeFileError}</p>}
            </div>

            {/* Job Description */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white/80" htmlFor="v2-jd">
                Job Description
              </label>
              <textarea
                id="v2-jd"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste the job posting here..."
                rows={8}
                disabled={loading}
                aria-required="true"
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-sm text-white/90 placeholder:text-white/30 outline-none focus:border-[#afc4ff]/40 disabled:opacity-50 resize-y"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => jdFileRef.current?.click()}
                  disabled={loading || jdFileLoading}
                  className="inline-flex items-center gap-1 text-xs text-white/50 hover:text-white/80 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#afc4ff]/40"
                >
                  {jdFileLoading ? <Loader2 className="h-3 w-3 motion-safe:animate-spin" /> : <Upload className="h-3 w-3" />}
                  {jdFileLoading ? 'reading...' : 'upload .txt, .docx, .pdf, or .html'}
                </button>
                <input ref={jdFileRef} type="file" accept=".txt,.docx,.pdf,.html,.htm" className="hidden" onChange={handleJdFile} tabIndex={-1} />
              </div>
              {jdFileError && <p className="text-xs text-[#f0b8b8]" role="alert">{jdFileError}</p>}
            </div>

            {/* Submit */}
            <GlassButton
              type="submit"
              size="lg"
              disabled={!isValid || loading}
              className="w-full"
              aria-busy={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 motion-safe:animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5" />
                  Go
                </>
              )}
            </GlassButton>

            {resumeText.length > 0 && resumeText.length < 50 && (
              <p className="text-center text-xs text-white/40">Resume needs at least 50 characters</p>
            )}
            {jobDescription.length > 0 && jobDescription.length < 50 && (
              <p className="text-center text-xs text-white/40">Job description needs at least 50 characters</p>
            )}
          </form>
        </GlassCard>
      </div>
    </div>
  );
}
