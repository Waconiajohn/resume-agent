import { useState, useRef, useEffect } from 'react';
import { Check, MessageSquare } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import { GlassButton } from '../GlassButton';
import { GlassTextarea } from '../GlassInput';
import { cleanText } from '@/lib/clean-text';

interface SectionReviewPanelProps {
  section: string;
  content: string;
  onApprove: () => void;
  onRequestChanges: (feedback: string) => void;
}

/** Convert snake_case or kebab-case section names to Title Case */
function sectionTitle(section: string): string {
  return section
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Parse content into lines (bullets and paragraphs), cleaning markdown artifacts */
function parseContentLines(content: string): string[] {
  return cleanText(content)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Detect if a line is a bullet point */
function isBullet(line: string): boolean {
  return /^\s*[•\-\*]\s/.test(line);
}

/** Strip bullet prefix for display */
function stripBulletPrefix(line: string): string {
  return line.replace(/^\s*[•\-\*]\s*/, '');
}

export function SectionReviewPanel({
  section,
  content,
  onApprove,
  onRequestChanges,
}: SectionReviewPanelProps) {
  const [feedback, setFeedback] = useState('');
  const [showTextarea, setShowTextarea] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus the textarea when it becomes visible
  useEffect(() => {
    if (showTextarea && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [showTextarea]);

  const contentLines = parseContentLines(content);

  const handleRequestChanges = () => {
    if (feedback.trim()) {
      onRequestChanges(feedback.trim());
    } else {
      // No feedback typed yet — reveal the textarea so the user can type
      setShowTextarea(true);
    }
  };

  const handleSubmitFeedback = () => {
    if (feedback.trim()) {
      onRequestChanges(feedback.trim());
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-white/[0.12] px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-white/85">Section Review</span>
          <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-0.5 text-[10px] font-medium text-blue-300">
            {sectionTitle(section)}
          </span>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Content card */}
        <GlassCard className="p-5 space-y-1 bg-white/[0.03] border-white/[0.08]">
          {/* Section heading */}
          <h3 className="text-base font-semibold text-white/90 mb-3 pb-2 border-b border-white/[0.08]">
            {sectionTitle(section)}
          </h3>

          {/* Content lines */}
          <div className="space-y-0.5">
            {contentLines.length > 0 ? (
              contentLines.map((line, i) => {
                const bullet = isBullet(line);
                const displayText = bullet ? stripBulletPrefix(line) : line;
                return (
                  <div key={i} className="flex items-start gap-2 px-1 py-1.5">
                    {bullet && (
                      <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-white/40" />
                    )}
                    <p className="flex-1 text-sm leading-relaxed text-white/85">{displayText}</p>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-white/40 italic">No content to display.</p>
            )}
          </div>
        </GlassCard>

        {/* Feedback textarea — shown when the user clicks "Request Changes" without typing */}
        {showTextarea && (
          <div className="space-y-2">
            <GlassTextarea
              ref={textareaRef}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="What would you like to change?"
              rows={4}
              className="w-full"
            />
            <GlassButton
              variant="ghost"
              onClick={handleSubmitFeedback}
              disabled={!feedback.trim()}
              className="w-full"
            >
              <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
              Submit Feedback
            </GlassButton>
          </div>
        )}
      </div>

      {/* Fixed action bar */}
      <div className="border-t border-white/[0.12] px-4 py-3">
        <div className="flex items-center gap-2">
          <GlassButton
            variant="primary"
            className="flex-1"
            onClick={onApprove}
          >
            <Check className="mr-1.5 h-3.5 w-3.5" />
            Approve
          </GlassButton>
          <GlassButton
            variant="ghost"
            className="flex-1"
            onClick={handleRequestChanges}
          >
            <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
            Request Changes
          </GlassButton>
        </div>
      </div>
    </div>
  );
}
