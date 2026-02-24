import { useState, useRef, useCallback, useEffect } from 'react';
import { Sparkles, ArrowLeft, Upload, Loader2 } from 'lucide-react';
import { GlassCard } from './GlassCard';
import { GlassInput } from './GlassInput';
import { GlassTextarea } from './GlassInput';
import { GlassButton } from './GlassButton';
import { extractResumeTextFromUpload } from '@/lib/resume-upload';
import { extractJobDescriptionTextFromUpload } from '@/lib/job-description-upload';
import type { MasterResumeListItem } from '@/types/resume';

interface PipelineIntakeFormProps {
  onSubmit: (data: {
    resumeText: string;
    jobDescription: string;
    companyName: string;
    workflowMode: 'fast_draft' | 'balanced' | 'deep_dive';
  }) => void;
  onBack: () => void;
  loading?: boolean;
  initialResumeText?: string;
  defaultResumeId?: string | null;
  savedResumes?: MasterResumeListItem[];
  onLoadSavedResume?: (resumeId: string) => Promise<string | null>;
  error?: string | null;
}

export function PipelineIntakeForm({
  onSubmit,
  onBack,
  loading = false,
  initialResumeText,
  defaultResumeId = null,
  savedResumes = [],
  onLoadSavedResume,
  error,
}: PipelineIntakeFormProps) {
  const [resumeText, setResumeText] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [workflowMode, setWorkflowMode] = useState<'fast_draft' | 'balanced' | 'deep_dive'>('balanced');
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [savedResumeLoadError, setSavedResumeLoadError] = useState<string | null>(null);
  const [savedResumeLoadLoading, setSavedResumeLoadLoading] = useState(false);
  const [selectedSavedResumeId, setSelectedSavedResumeId] = useState<string>('');
  const [jobFileError, setJobFileError] = useState<string | null>(null);
  const [jobFileLoading, setJobFileLoading] = useState(false);
  const initialAppliedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jobFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialAppliedRef.current) return;
    if (!initialResumeText?.trim()) return;
    if (resumeText.trim().length > 0) return;
    setResumeText(initialResumeText);
    initialAppliedRef.current = true;
  }, [initialResumeText, resumeText]);

  useEffect(() => {
    if (!savedResumes.length) {
      setSelectedSavedResumeId('');
      return;
    }
    setSelectedSavedResumeId((prev) => (prev && savedResumes.some((r) => r.id === prev) ? prev : savedResumes[0].id));
  }, [savedResumes]);

  const isValid = resumeText.trim().length > 0 && jobDescription.trim().length > 0 && companyName.trim().length > 0;

  const handleFileClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleJobFileClick = useCallback(() => {
    jobFileInputRef.current?.click();
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

  const handleJobFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setJobFileError(null);
    setJobFileLoading(true);
    void (async () => {
      try {
        const extracted = await extractJobDescriptionTextFromUpload(file);
        if (!extracted) {
          setJobFileError('No readable text found in this file. Try another file or paste the job description directly.');
          return;
        }
        setJobDescription(extracted);
      } catch (err) {
        setJobFileError(err instanceof Error ? err.message : 'Failed to read file. Please paste JD text or use a job link.');
      } finally {
        setJobFileLoading(false);
        e.target.value = '';
      }
    })();
  }, []);

  const loadSavedResume = useCallback(async (resumeId: string) => {
    if (!onLoadSavedResume) return;
    setSavedResumeLoadError(null);
    setSavedResumeLoadLoading(true);
    try {
      const rawText = await onLoadSavedResume(resumeId);
      if (!rawText?.trim()) {
        setSavedResumeLoadError('Saved resume could not be loaded.');
        return;
      }
      setResumeText(rawText);
    } catch (err) {
      setSavedResumeLoadError(err instanceof Error ? err.message : 'Failed to load saved resume.');
    } finally {
      setSavedResumeLoadLoading(false);
    }
  }, [onLoadSavedResume]);

  const latestSavedResumeId = savedResumes[0]?.id ?? null;
  const hasDefaultSavedResume = Boolean(defaultResumeId && initialResumeText?.trim());

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || loading) return;
    onSubmit({
      resumeText: resumeText.trim(),
      jobDescription: jobDescription.trim(),
      companyName: companyName.trim(),
      workflowMode,
    });
  }, [isValid, loading, onSubmit, resumeText, jobDescription, companyName, workflowMode]);

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
            Start from a saved resume, upload a file, or paste text. For the job description, paste text, use a link, or upload a file.
          </p>
        </div>

        {/* Form */}
        <GlassCard className="p-6">
          {error && (
            <div className="mb-4 rounded-lg border border-red-300/28 bg-red-500/[0.08] px-3 py-2 text-xs text-red-100/90">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            {/* Resume field */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white/80" htmlFor="resume-text">
                Resume <span className="text-white/62">*</span>
              </label>
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
                <div className="mb-2 text-xs font-medium text-white/72">Quick Start Sources</div>
                <div className="flex flex-wrap gap-2">
                  <GlassButton
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      if (!initialResumeText?.trim()) return;
                      setResumeText(initialResumeText);
                      setSavedResumeLoadError(null);
                    }}
                    disabled={loading || fileLoading || !hasDefaultSavedResume}
                    className="h-auto px-3 py-2 text-xs"
                  >
                    Use Default Saved Resume
                  </GlassButton>
                  <GlassButton
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      if (!latestSavedResumeId) return;
                      void loadSavedResume(latestSavedResumeId);
                    }}
                    disabled={loading || fileLoading || savedResumeLoadLoading || !latestSavedResumeId}
                    className="h-auto px-3 py-2 text-xs"
                  >
                    {savedResumeLoadLoading ? 'Loading...' : 'Use Most Recent Saved'}
                  </GlassButton>
                  <GlassButton
                    type="button"
                    variant="ghost"
                    onClick={handleFileClick}
                    disabled={loading || fileLoading}
                    className="h-auto px-3 py-2 text-xs"
                  >
                    {fileLoading ? 'Reading Resume File...' : 'Upload Resume File'}
                  </GlassButton>
                </div>

                {savedResumes.length > 0 && onLoadSavedResume && (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <label htmlFor="saved-resume-select" className="text-xs text-white/60">
                      Saved resume:
                    </label>
                    <select
                      id="saved-resume-select"
                      value={selectedSavedResumeId}
                      onChange={(e) => setSelectedSavedResumeId(e.target.value)}
                      disabled={loading || savedResumeLoadLoading}
                      className="min-w-0 flex-1 rounded-lg border border-white/[0.12] bg-white/[0.03] px-3 py-2 text-xs text-white/85 outline-none focus:border-[#afc4ff]/40"
                    >
                      {savedResumes.map((resume) => (
                        <option key={resume.id} value={resume.id} className="bg-[#0a0d14] text-white">
                          {resume.is_default ? 'Default • ' : ''}v{resume.version} • {new Date(resume.updated_at).toLocaleDateString()}
                        </option>
                      ))}
                    </select>
                    <GlassButton
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        if (!selectedSavedResumeId) return;
                        void loadSavedResume(selectedSavedResumeId);
                      }}
                      disabled={loading || savedResumeLoadLoading || !selectedSavedResumeId}
                      className="h-auto px-3 py-2 text-xs"
                    >
                      Load Selected
                    </GlassButton>
                  </div>
                )}
                {savedResumeLoadError && (
                  <p className="mt-2 text-xs text-red-400" role="alert">{savedResumeLoadError}</p>
                )}
              </div>
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
                  accept=".txt,.docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                  className="hidden"
                  onChange={handleFileChange}
                  aria-hidden="true"
                  tabIndex={-1}
                />
              </div>
              {initialResumeText?.trim() && (
                <p className="text-xs text-emerald-300/80">
                  Default base resume is available. You can reuse it, load another saved resume, upload a new file, or edit manually.
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
                You can paste full JD text or a job link (URL). Uploads support .txt, .docx, .pdf, and .html.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleJobFileClick}
                  disabled={loading || jobFileLoading}
                  className="inline-flex items-center gap-1 text-xs text-white/58 transition-colors hover:text-white/84 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:underline"
                  aria-label="Upload a job description file (.txt, .docx, .pdf, .html)"
                >
                  {jobFileLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                  {jobFileLoading ? 'reading job file...' : 'or upload JD file (.txt, .docx, .pdf, .html)'}
                </button>
                <input
                  ref={jobFileInputRef}
                  type="file"
                  accept=".txt,.docx,.pdf,.html,.htm,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/html"
                  className="hidden"
                  onChange={handleJobFileChange}
                  aria-hidden="true"
                  tabIndex={-1}
                />
              </div>
              {jobFileError && (
                <p className="text-xs text-red-400" role="alert">
                  {jobFileError}
                </p>
              )}
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

            {/* Workflow mode */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white/80" htmlFor="workflow-mode">
                Session Mode
              </label>
              <select
                id="workflow-mode"
                value={workflowMode}
                onChange={(e) => setWorkflowMode(e.target.value as 'fast_draft' | 'balanced' | 'deep_dive')}
                disabled={loading}
                className="w-full rounded-xl border border-white/[0.12] bg-white/[0.03] px-3 py-2.5 text-sm text-white/90 outline-none focus:border-[#afc4ff]/45"
              >
                <option value="fast_draft" className="bg-[#0a0d14] text-white">
                  Fast Draft (fewer questions, quicker first resume)
                </option>
                <option value="balanced" className="bg-[#0a0d14] text-white">
                  Balanced (recommended)
                </option>
                <option value="deep_dive" className="bg-[#0a0d14] text-white">
                  Deep Dive (more questioning, max detail)
                </option>
              </select>
              <p className="text-xs text-white/50">
                You can still move around the workspace and refine later. This mainly changes how aggressively the interview asks follow-up questions.
              </p>
            </div>

            {/* Submit button */}
            <GlassButton
              type="submit"
              disabled={!isValid || loading || fileLoading || jobFileLoading || savedResumeLoadLoading}
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
