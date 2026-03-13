import { useState, useRef, useCallback } from 'react';
import { Sparkles, Upload, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import { GlassButton } from '../GlassButton';
import { GlassTextarea } from '../GlassInput';
import { cn } from '@/lib/utils';
import { extractResumeTextFromUpload } from '@/lib/resume-upload';
import { extractJobDescriptionTextFromUpload } from '@/lib/job-description-upload';

interface V2IntakeFormProps {
  onSubmit: (resumeText: string, jobDescription: string) => void;
  loading?: boolean;
  error?: string | null;
  initialResumeText?: string;
}

const MIN_CHARS = 50;

function CharCounter({ value, label }: { value: string; label: string }) {
  const len = value.trim().length;
  const met = len >= MIN_CHARS;
  const remaining = MIN_CHARS - len;
  return (
    <p
      className={cn(
        'text-[10px] transition-colors duration-200',
        met ? 'text-[#b5dec2]/60' : 'text-[#f0b8b8]/60',
      )}
      aria-live="polite"
    >
      {met ? (
        <>
          <CheckCircle2 className="mr-0.5 inline h-2.5 w-2.5" />
          {label} ready
        </>
      ) : len > 0 ? (
        `${remaining} more character${remaining === 1 ? '' : 's'} needed`
      ) : null}
    </p>
  );
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

  const isValid = resumeText.trim().length >= MIN_CHARS && jobDescription.trim().length >= MIN_CHARS;

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

      <div className="relative z-10 mx-auto max-w-3xl px-4 py-16">
        {/* Header */}
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.12] bg-white/[0.04]">
            <Sparkles className="h-8 w-8 text-[#afc4ff]" />
          </div>
          <h1 className="mb-2 text-3xl font-bold text-white/90">Position Your Resume</h1>

          {/* Value proposition tagline */}
          <div className="mt-3 mb-1">
            <p className="text-xl font-semibold text-white/90">Position yourself as the benchmark</p>
            <p className="mt-1 max-w-xl text-sm text-white/40">
              Paste your resume and target job description. Our AI agents will craft a resume that makes you the standard others are measured against.
            </p>
          </div>
        </div>

        <GlassCard className="animate-in fade-in duration-500 p-8">
          {/* Error display */}
          {error && (
            <div
              className="mb-6 flex items-start gap-2 rounded-lg border border-[#f0b8b8]/20 bg-[#f0b8b8]/10 p-3"
              role="alert"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#f0b8b8]" />
              <p className="text-sm text-[#f0b8b8]/90">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-8" noValidate>
            {/* Resume */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white/80" htmlFor="v2-resume">
                Your Resume
              </label>
              <GlassTextarea
                id="v2-resume"
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                placeholder="Paste your current resume here — we'll identify your strengths and hidden accomplishments..."
                rows={10}
                disabled={loading}
                aria-required="true"
                className="min-h-[200px] resize-y bg-white/[0.03] border-white/[0.08] focus:border-[#afc4ff]/30 focus:ring-1 focus:ring-[#afc4ff]/20 text-white/80 placeholder:text-white/20"
              />
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  {/* File upload zone */}
                  <button
                    type="button"
                    onClick={() => resumeFileRef.current?.click()}
                    disabled={loading || resumeFileLoading}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-white/[0.12] px-2 py-1.5 text-xs text-white/50 transition-all hover:border-[#afc4ff]/30 hover:bg-[#afc4ff]/[0.02] hover:text-white/70 disabled:pointer-events-none disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#afc4ff]/40"
                    aria-label="Upload resume file"
                  >
                    {resumeFileLoading
                      ? <Loader2 className="h-3 w-3 motion-safe:animate-spin" />
                      : <Upload className="h-3 w-3" />
                    }
                    {resumeFileLoading ? 'Reading file...' : 'Upload file'}
                    <span className="text-white/30">.txt, .docx, .pdf</span>
                  </button>
                  {resumeFileError && (
                    <p className="text-[10px] text-[#f0b8b8]" role="alert">{resumeFileError}</p>
                  )}
                </div>
                <CharCounter value={resumeText} label="Resume" />
              </div>
              <input
                ref={resumeFileRef}
                type="file"
                accept=".txt,.docx,.pdf"
                className="hidden"
                onChange={handleResumeFile}
                tabIndex={-1}
              />
            </div>

            {/* Job Description */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white/80" htmlFor="v2-jd">
                Job Description
              </label>
              <GlassTextarea
                id="v2-jd"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste the target job description — we'll analyze every requirement and position you strategically..."
                rows={8}
                disabled={loading}
                aria-required="true"
                className="min-h-[200px] resize-y bg-white/[0.03] border-white/[0.08] focus:border-[#afc4ff]/30 focus:ring-1 focus:ring-[#afc4ff]/20 text-white/80 placeholder:text-white/20"
              />
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  {/* File upload zone */}
                  <button
                    type="button"
                    onClick={() => jdFileRef.current?.click()}
                    disabled={loading || jdFileLoading}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-white/[0.12] px-2 py-1.5 text-xs text-white/50 transition-all hover:border-[#afc4ff]/30 hover:bg-[#afc4ff]/[0.02] hover:text-white/70 disabled:pointer-events-none disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#afc4ff]/40"
                    aria-label="Upload job description file"
                  >
                    {jdFileLoading
                      ? <Loader2 className="h-3 w-3 motion-safe:animate-spin" />
                      : <Upload className="h-3 w-3" />
                    }
                    {jdFileLoading ? 'Reading file...' : 'Upload file'}
                    <span className="text-white/30">.txt, .docx, .pdf</span>
                  </button>
                  {jdFileError && (
                    <p className="text-[10px] text-[#f0b8b8]" role="alert">{jdFileError}</p>
                  )}
                </div>
                <CharCounter value={jobDescription} label="Job description" />
              </div>
              <input
                ref={jdFileRef}
                type="file"
                accept=".txt,.docx,.pdf,.html,.htm"
                className="hidden"
                onChange={handleJdFile}
                tabIndex={-1}
              />
            </div>

            {/* Submit */}
            <div className="pt-2">
              <GlassButton
                type="submit"
                size="lg"
                disabled={!isValid || loading}
                className="w-full px-8 py-3 text-base font-medium bg-[#afc4ff]/20 border-[#afc4ff]/30 hover:bg-[#afc4ff]/30 text-[#afc4ff]"
                aria-busy={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 motion-safe:animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" />
                    Analyze and craft my resume
                  </>
                )}
              </GlassButton>
            </div>
          </form>
        </GlassCard>
      </div>
    </div>
  );
}
