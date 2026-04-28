import { useState, useRef, useCallback } from 'react';
import { Clock, Sparkles, Upload } from 'lucide-react';
import { extractResumeTextFromUpload } from '@/lib/resume-upload';
import { cn } from '@/lib/utils';

const MIN_RESUME_TEXT_LENGTH = 100;
const MIN_TARGET_ROLES_LENGTH = 5;

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
  const [showLinkedInHelp, setShowLinkedInHelp] = useState(false);
  const [linkedinFileName, setLinkedinFileName] = useState<string | null>(null);
  const linkedinFileRef = useRef<HTMLInputElement>(null);
  const [resumeDragging, setResumeDragging] = useState(false);
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const resumeFileRef = useRef<HTMLInputElement>(null);

  const trimmedResumeLength = resumeText.trim().length;
  const trimmedTargetRolesLength = targetRoles.trim().length;
  const resumeNeedsMoreChars = trimmedResumeLength > 0 && trimmedResumeLength < MIN_RESUME_TEXT_LENGTH;
  const targetRolesNeedMoreChars = trimmedTargetRolesLength > 0 && trimmedTargetRolesLength < MIN_TARGET_ROLES_LENGTH;
  const canSubmit = (
    trimmedResumeLength >= MIN_RESUME_TEXT_LENGTH
    && trimmedTargetRolesLength >= MIN_TARGET_ROLES_LENGTH
    && !loading
  );

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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not read file';
      setLinkedinFileName(message);
    }
  }, []);

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
        <div className="mb-10">
          <div className="mb-4 inline-flex items-center gap-2 rounded-md border border-[var(--link)]/20 bg-[var(--link)]/[0.07] px-3 py-1.5 text-[12px] font-semibold text-[var(--link)]">
            <Clock className="h-3.5 w-3.5" />
            10-15 minutes now. Hours saved later.
          </div>
          <h1
            className="text-3xl font-semibold text-[var(--text-strong)] mb-3"
          >
            Build the profile every future application uses.
          </h1>
          <p className="text-sm leading-relaxed text-[var(--text-muted)]">
            Upload your most complete career history once. CareerIQ turns it into the foundation for
            role-specific resumes, LinkedIn updates, cover letters, networking messages, interview prep,
            thank-you notes, and follow-up emails.
          </p>
          <div className="mt-5 rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-md bg-[var(--link)]/10 p-1.5 text-[var(--link)]">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--text-strong)]">
                  Use your most comprehensive resume, not your shortest resume.
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">
                  This is the one place where more evidence is better: older roles, extra bullets,
                  projects, metrics, tools, awards, certifications, leadership scope, and anything else
                  that proves what you can do. We will trim and tailor later.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Resume */}
        <div className="mb-8">
          <label className="block text-xs uppercase tracking-widest font-semibold text-[var(--text-muted)] mb-2">
            Most comprehensive resume
          </label>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            Upload the longest, most detailed version you have. It can be too long for a real application.
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
              placeholder={resumeDragging ? 'Drop your comprehensive resume here...' : 'Paste your most complete resume text here, or drag a file onto this area...'}
              value={resumeText}
              onChange={(e) => { setResumeText(e.target.value); setResumeFileName(null); }}
              aria-label="Resume text"
              aria-required="true"
            />
          </div>
          {resumeNeedsMoreChars && (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Add at least {MIN_RESUME_TEXT_LENGTH - trimmedResumeLength} more characters so we have enough resume detail to analyze.
            </p>
          )}
        </div>

        {/* LinkedIn Context */}
        <div className="mb-8">
          <label className="block text-xs uppercase tracking-widest font-semibold text-[var(--text-muted)] mb-2">
            LinkedIn context
            <span className="ml-2 normal-case tracking-normal font-normal opacity-60">(optional)</span>
          </label>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            Add this only when it is your own profile or you have permission to use the content.
            You can paste a public profile URL, add a few brand notes, upload a permitted file, or leave this blank.
            CareerIQ can build the first Benchmark Profile from the resume alone.
          </p>

          {/* Upload bar + help toggle */}
          <div className="mb-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => linkedinFileRef.current?.click()}
              className="flex items-center gap-2 rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-4 py-2 text-xs text-[var(--text-muted)] hover:border-[var(--link)] hover:text-[var(--text-strong)] transition-colors"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload permitted file
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
              {showLinkedInHelp ? 'Hide guidance' : 'What can I add?'}
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

          {/* LinkedIn context guidance */}
          {showLinkedInHelp && (
            <div className="mb-3 rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-4 py-3">
              <p className="text-xs font-medium text-[var(--text-strong)] mb-2">
                Good optional LinkedIn context:
              </p>
              <ul className="text-xs text-[var(--text-muted)] space-y-1.5 list-disc list-inside">
                <li>Use only content you own or are allowed to process.</li>
                <li>A public LinkedIn URL is stored as context only. CareerIQ will not scrape LinkedIn from it.</li>
                <li>Approved headline, About, experience, recommendations, or recent post notes can improve the brand draft.</li>
                <li>Skipping this is fine. Your comprehensive resume will drive the first version.</li>
              </ul>
              <p className="mt-3 text-[10px] text-[var(--text-soft)]">
                If you upload a profile export or PDF, make sure it is your own profile or that you have permission to use it.
              </p>
            </div>
          )}

          <textarea
            className="w-full min-h-[120px] bg-[var(--surface-1)] border border-[var(--line-soft)] rounded-lg px-4 py-3 text-sm text-[var(--text-strong)] leading-relaxed resize-y outline-none focus:border-[var(--link)] transition-colors placeholder:text-[var(--text-muted)]"
            placeholder="Optional: paste a public LinkedIn URL, approved profile notes, headline/About text you own, or leave this blank..."
            value={linkedinAbout}
            onChange={(e) => {
              setLinkedinAbout(e.target.value);
              setLinkedinFileName(null);
            }}
            aria-label="Optional LinkedIn context"
          />
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
          {targetRolesNeedMoreChars && (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Add at least {MIN_TARGET_ROLES_LENGTH - trimmedTargetRolesLength} more characters so we know what roles to target.
            </p>
          )}
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
            color: canSubmit ? 'var(--bg-0)' : 'var(--text-muted)',
          }}
          aria-label="Build my Benchmark Profile"
        >
          {loading ? 'Analyzing your background...' : 'Build my Benchmark Profile \u2192'}
        </button>
      </div>
    </div>
  );
}
