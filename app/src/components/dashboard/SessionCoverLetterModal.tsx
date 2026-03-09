import { useEffect, useState } from 'react';
import { X, Copy, Download } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { downloadAsText } from '@/lib/export';

interface SessionCoverLetterModalProps {
  sessionId: string;
  onClose: () => void;
  onGetSessionCoverLetter: (id: string) => Promise<{ letter: string; quality_score?: number | null } | null>;
}

export function SessionCoverLetterModal({
  sessionId,
  onClose,
  onGetSessionCoverLetter,
}: SessionCoverLetterModalProps) {
  const [letter, setLetter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    onGetSessionCoverLetter(sessionId)
      .then((data) => {
        if (!cancelled) {
          setLetter(data?.letter ?? null);
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
  }, [sessionId, onGetSessionCoverLetter]);

  const handleCopy = async () => {
    if (!letter) return;
    await navigator.clipboard.writeText(letter);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!letter) return;
    downloadAsText(letter, `cover-letter-${sessionId.slice(0, 8)}.txt`);
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <GlassCard className="flex max-h-[90vh] w-full max-w-2xl flex-col p-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <h2 className="text-sm font-semibold text-white/90">Session Cover Letter</h2>
          <div className="flex items-center gap-2">
            {letter && (
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
              className="inline-flex items-center justify-center rounded-md p-1.5 text-white/50 transition-colors hover:bg-white/[0.08] hover:text-white/85"
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
              <div className="h-7 w-7 motion-safe:animate-spin rounded-full border-2 border-white/20 border-t-[#afc4ff]" />
            </div>
          )}

          {!loading && error && (
            <div className="rounded-lg border border-[#f0b8b8]/28 bg-[#f0b8b8]/[0.08] px-4 py-3 text-xs text-[#f0b8b8]/90">
              Failed to load cover letter: {error}
            </div>
          )}

          {!loading && !error && !letter && (
            <p className="py-8 text-center text-sm text-white/40">No cover letter found for this session.</p>
          )}

          {!loading && !error && letter && (
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-white/80">
              {letter}
            </pre>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
