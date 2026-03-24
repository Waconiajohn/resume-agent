import { useEffect, useState } from 'react';
import { X, Copy, Download } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { resumeToText, downloadAsText } from '@/lib/export';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import type { FinalResume } from '@/types/resume';

interface SessionResumeModalProps {
  sessionId: string;
  onClose: () => void;
  onGetSessionResume: (id: string) => Promise<FinalResume | null>;
}

export function SessionResumeModal({ sessionId, onClose, onGetSessionResume }: SessionResumeModalProps) {
  const { dialogRef } = useDialogA11y(true, onClose);
  const [resume, setResume] = useState<FinalResume | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    onGetSessionResume(sessionId)
      .then((data) => {
        if (!cancelled) {
          setResume(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, onGetSessionResume]);

  const handleCopy = async () => {
    if (!resume) return;
    const text = resumeToText(resume);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!resume) return;
    const text = resumeToText(resume);
    downloadAsText(text, `resume-${sessionId.slice(0, 8)}.txt`);
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <GlassCard role="dialog" aria-modal="true" aria-label="Saved Resume" className="room-shell flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden p-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--line-soft)] px-5 py-4">
          <div>
            <div className="eyebrow-label">Saved Asset</div>
            <h2 className="mt-1 text-sm font-semibold text-[var(--text-strong)]">Saved Resume</h2>
          </div>
          <div className="flex items-center gap-2">
            {resume && (
              <>
                <GlassButton variant="ghost" size="sm" onClick={handleCopy} className="h-8 gap-1.5">
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? 'Copied!' : 'Copy'}
                </GlassButton>
                <GlassButton variant="ghost" size="sm" onClick={handleDownload} className="h-8 gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  Download TXT
                </GlassButton>
              </>
            )}
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-md p-1.5 text-[var(--text-soft)] transition-colors hover:bg-[var(--accent-muted)] hover:text-[var(--text-strong)]"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="h-7 w-7 motion-safe:animate-spin rounded-full border-2 border-[var(--line-strong)] border-t-[#afc4ff]" />
            </div>
          )}

          {!loading && error && (
            <div className="support-callout border-[#f0b8b8]/28 bg-[#f0b8b8]/[0.08] px-4 py-3 text-xs text-[#f0b8b8]/90">
              Failed to load resume: {error}
            </div>
          )}

          {!loading && !error && !resume && (
            <p className="py-8 text-center text-sm text-[var(--text-soft)]">No saved resume was found for this session.</p>
          )}

          {!loading && !error && resume && (
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-[var(--text-muted)]">
              {resumeToText(resume)}
            </pre>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
