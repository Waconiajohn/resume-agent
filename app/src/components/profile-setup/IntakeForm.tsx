import { useState, useRef, useCallback } from 'react';
import { Upload } from 'lucide-react';
import { extractResumeTextFromUpload } from '@/lib/resume-upload';
import { cn } from '@/lib/utils';

interface IntakeFormProps {
  onSubmit: (
    resumeText: string,
    linkedinAbout: string,
    targetRoles: string,
    situation: string,
  ) => void;
  loading: boolean;
}

export function IntakeForm({ onSubmit, loading }: IntakeFormProps) {
  const [resumeText, setResumeText] = useState('');
  const [linkedinAbout, setLinkedinAbout] = useState('');
  const [targetRoles, setTargetRoles] = useState('');
  const [situation, setSituation] = useState('');
  const [showLinkedInSkipConfirm, setShowLinkedInSkipConfirm] = useState(false);
  const [showLinkedInHelp, setShowLinkedInHelp] = useState(false);
  const [linkedinFileName, setLinkedinFileName] = useState<string | null>(null);
  const linkedinFileRef = useRef<HTMLInputElement>(null);
  const [resumeDragging, setResumeDragging] = useState(false);
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const resumeFileRef = useRef<HTMLInputElement>(null);

  const canSubmit = resumeText.trim().length > 0 && targetRoles.trim().length > 0 && !loading;

  const handleResumeFile = useCallback(async (file: File) => {
    try {
      const text = await extractResumeTextFromUpload(file);
      setResumeText(text);
      setResumeFileName(file.name);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not read file';
      setResumeFileName(message);
    }
  }, []);

  const handleLinkedInFile = useCallback(async (file: File) => {
    try {
      const text = await extractResumeTextFromUpload(file);
      setLinkedinAbout(text);
      setLinkedinFileName(file.name);
      if (showLinkedInSkipConfirm) setShowLinkedInSkipConfirm(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not read file';
      setLinkedinFileName(message);
    }
  }, [showLinkedInSkipConfirm]);

  const handleResumeDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setResumeDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      await handleResumeFile(file);
    } else {
      const text = e.dataTransfer.getData('text/plain');
      if (text.trim()) {
        setResumeText(text);
        setResumeFileName(null);
      }
    }
  }, [handleResumeFile]);

  const handleSubmit = () => {
    if (!canSubmit) return;

    if (!linkedinAbout.trim() && !showLinkedInSkipConfirm) {
      setShowLinkedInSkipConfirm(true);
      return;
    }

    onSubmit(resumeText.trim(), linkedinAbout.trim(), targetRoles.trim(), situation.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit();
    }
  };

  return (
    <div
      className="flex h-full items-start justify-center overflow-y-auto px-8 py-16"
      onKeyDown={handleKeyDown}
    >
      <div className="w-full max-w-2xl">
        <h1
          className="text-3xl font-light text-[var(--text-strong)] mb-3"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Let's build your CareerIQ profile.
        </h1>
        <p className="text-sm text-[var(--text-muted)] mb-10">
          About 20 minutes. Built to last your entire search.
        </p>

        {/* Resume */}
        <div className="mb-8">
          <label className="block text-xs uppercase tracking-widest font-semibold text-[var(--text-muted)] mb-2">
            Your resume
          </label>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            Upload a file, drag and drop, or paste the text of your resume.
          </p>

          {/* File upload bar */}
          <div className="mb-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => resumeFileRef.current?.click()}
              className="flex items-center gap-2 rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-4 py-2 text-xs text-[var(--text-muted)] hover:border-[var(--link)] hover:text-[var(--text-strong)] transition-colors"
            >
              <Upload className="h-3.5 w-3.5" />
              Browse file
            </button>
            {resumeFileName && (
              <span className="text-xs text-[var(--text-soft)] truncate max-w-[300px]">
                {resumeFileName}
              </span>
            )}
            <input
              ref={resumeFileRef}
              type="file"
              accept=".txt,.pdf,.docx"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) await handleResumeFile(file);
              }}
              aria-label="Upload resume file"
            />
          </div>

          {/* Textarea with drag-and-drop */}
          <div
            className={cn(
              'rounded-lg transition-all duration-200',
              resumeDragging && 'ring-2 ring-[var(--link)] ring-offset-2 ring-offset-[var(--bg-0)]',
            )}
            onDrop={handleResumeDrop}
            onDragOver={(e) => { e.preventDefault(); setResumeDragging(true); }}
            onDragLeave={() => setResumeDragging(false)}
          >
            <textarea
              className="w-full min-h-[200px] bg-[var(--surface-1)] border border-[var(--line-soft)] rounded-lg px-4 py-3 text-sm text-[var(--text-strong)] leading-relaxed resize-y outline-none focus:border-[var(--link)] transition-colors placeholder:text-[var(--text-muted)]"
              placeholder={resumeDragging ? 'Drop your resume here...' : 'Paste your resume text here, or drag a file onto this area...'}
              value={resumeText}
              onChange={(e) => { setResumeText(e.target.value); setResumeFileName(null); }}
              aria-label="Resume text"
              aria-required="true"
            />
          </div>
        </div>

        {/* LinkedIn Profile */}
        <div className="mb-8">
          <label className="block text-xs uppercase tracking-widest font-semibold text-[var(--text-muted)] mb-2">
            LinkedIn profile
            <span className="ml-2 normal-case tracking-normal font-normal opacity-60">(encouraged)</span>
          </label>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            Your LinkedIn profile reveals how you talk about yourself — your voice, your framing, what you lead with.
            Upload a PDF of your profile, or paste your About section below.
          </p>

          {/* Upload bar + help toggle */}
          <div className="mb-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => linkedinFileRef.current?.click()}
              className="flex items-center gap-2 rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-4 py-2 text-xs text-[var(--text-muted)] hover:border-[var(--link)] hover:text-[var(--text-strong)] transition-colors"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload LinkedIn PDF
            </button>
            {linkedinFileName && (
              <span className="text-xs text-[var(--text-soft)] truncate max-w-[300px]">
                {linkedinFileName}
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowLinkedInHelp(!showLinkedInHelp)}
              className="ml-auto text-xs text-[var(--link)] hover:text-[var(--link-hover)] transition-colors"
            >
              {showLinkedInHelp ? 'Hide instructions' : 'How do I get a PDF?'}
            </button>
            <input
              ref={linkedinFileRef}
              type="file"
              accept=".pdf,.txt,.docx"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) await handleLinkedInFile(file);
              }}
              aria-label="Upload LinkedIn profile file"
            />
          </div>

          {/* Print-to-PDF instructions */}
          {showLinkedInHelp && (
            <div className="mb-3 rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-4 py-3">
              <p className="text-xs font-medium text-[var(--text-strong)] mb-2">
                Save your LinkedIn profile as a PDF:
              </p>
              <ol className="text-xs text-[var(--text-muted)] space-y-1.5 list-decimal list-inside">
                <li>Open your LinkedIn profile in a browser</li>
                <li>Press <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-0)] border border-[var(--line-soft)] text-[var(--text-strong)] font-mono text-[10px]">{navigator.platform?.includes('Mac') ? 'Cmd' : 'Ctrl'}+P</kbd> to open the print dialog</li>
                <li>Change the destination to <strong>Save as PDF</strong></li>
                <li>Click Save, then upload the file here</li>
              </ol>
              <p className="mt-2 text-[10px] text-[var(--text-soft)]">
                This captures your full profile including expanded sections.
              </p>
            </div>
          )}

          <textarea
            className="w-full min-h-[120px] bg-[var(--surface-1)] border border-[var(--line-soft)] rounded-lg px-4 py-3 text-sm text-[var(--text-strong)] leading-relaxed resize-y outline-none focus:border-[var(--link)] transition-colors placeholder:text-[var(--text-muted)]"
            placeholder="Or paste your LinkedIn About section or full profile text here..."
            value={linkedinAbout}
            onChange={(e) => {
              setLinkedinAbout(e.target.value);
              setLinkedinFileName(null);
              if (showLinkedInSkipConfirm) setShowLinkedInSkipConfirm(false);
            }}
            aria-label="LinkedIn profile text"
          />

          {showLinkedInSkipConfirm && (
            <div className="mt-3 rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-4 py-3">
              <p className="text-sm text-[var(--text-muted)] mb-3">
                Adding your LinkedIn About section significantly improves your profile. Are you sure you want to skip it?
              </p>
              <div className="flex gap-4">
                <button
                  type="button"
                  className="text-sm text-[var(--link)] hover:text-[var(--link-hover)] transition-colors"
                  onClick={() => {
                    setShowLinkedInSkipConfirm(false);
                    const el = document.querySelector<HTMLTextAreaElement>('[aria-label="LinkedIn About section"]');
                    el?.focus();
                  }}
                >
                  Add it now
                </button>
                <button
                  type="button"
                  className="text-sm text-[var(--text-muted)] hover:text-[var(--text-strong)] transition-colors"
                  onClick={() => {
                    setShowLinkedInSkipConfirm(false);
                    onSubmit(resumeText.trim(), '', targetRoles.trim(), situation.trim());
                  }}
                >
                  Continue without it
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Target Roles */}
        <div className="mb-8">
          <label className="block text-xs uppercase tracking-widest font-semibold text-[var(--text-muted)] mb-2">
            Target roles
          </label>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            What roles are you pursuing? List titles or functional areas — one per line or comma-separated.
          </p>
          <textarea
            className="w-full min-h-[60px] bg-[var(--surface-1)] border border-[var(--line-soft)] rounded-lg px-4 py-3 text-sm text-[var(--text-strong)] leading-relaxed resize-y outline-none focus:border-[var(--link)] transition-colors placeholder:text-[var(--text-muted)]"
            placeholder="e.g. VP of Marketing, Chief Marketing Officer, Head of Growth"
            value={targetRoles}
            onChange={(e) => setTargetRoles(e.target.value)}
            aria-label="Target roles"
            aria-required="true"
          />
        </div>

        {/* Situation */}
        <div className="mb-10">
          <label className="block text-xs uppercase tracking-widest font-semibold text-[var(--text-muted)] mb-2">
            Your situation
            <span className="ml-2 normal-case tracking-normal font-normal opacity-60">(optional)</span>
          </label>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            Anything useful to know about your search right now — urgency, industry preferences, geographic constraints, gaps, or anything on your mind.
          </p>
          <textarea
            className="w-full min-h-[100px] bg-[var(--surface-1)] border border-[var(--line-soft)] rounded-lg px-4 py-3 text-sm text-[var(--text-strong)] leading-relaxed resize-y outline-none focus:border-[var(--link)] transition-colors placeholder:text-[var(--text-muted)]"
            placeholder="e.g. I was recently laid off and am targeting a move from B2B SaaS into healthcare tech..."
            value={situation}
            onChange={(e) => setSituation(e.target.value)}
            aria-label="Your situation"
          />
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full py-4 rounded-xl text-sm font-medium transition-colors disabled:cursor-not-allowed"
          style={{
            background: canSubmit ? 'var(--link)' : 'var(--surface-1)',
            color: canSubmit ? '#080b10' : 'var(--text-muted)',
          }}
          aria-label="Build my CareerIQ profile"
        >
          {loading ? 'Analyzing your background...' : 'Build my CareerIQ profile \u2192'}
        </button>
      </div>
    </div>
  );
}
