import { useState, useRef, useEffect } from 'react';
import { Check, Zap, Pencil, Send } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import { GlassButton } from '../GlassButton';
import { SectionEditor } from './SectionEditor';
import { cleanText } from '@/lib/clean-text';
import { cn } from '@/lib/utils';

interface SectionReviewPanelProps {
  section: string;
  content: string;
  onApprove: () => void;
  onRequestChanges: (feedback: string) => void;
  onDirectEdit?: (editedContent: string) => void;
}

type Mode = 'view' | 'quickfix' | 'edit';

const QUICK_FIX_CHIPS = [
  'Add metrics',
  'Make it shorter',
  'More leadership focus',
  'Sounds too generic',
  'Wrong tone',
  'Missing key detail',
] as const;

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
  onDirectEdit,
}: SectionReviewPanelProps) {
  const [mode, setMode] = useState<Mode>('view');
  const [selectedChips, setSelectedChips] = useState<Set<string>>(new Set());
  const chipsRef = useRef<HTMLDivElement>(null);

  // Reset mode/chips when section or content changes (e.g. new section_draft from server)
  useEffect(() => {
    setMode('view');
    setSelectedChips(new Set());
  }, [section, content]);

  // Scroll chips into view when quickfix mode activates
  useEffect(() => {
    if (mode === 'quickfix' && chipsRef.current) {
      chipsRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [mode]);

  const contentLines = parseContentLines(content);

  const toggleChip = (chip: string) => {
    setSelectedChips((prev) => {
      const next = new Set(prev);
      if (next.has(chip)) {
        next.delete(chip);
      } else {
        next.add(chip);
      }
      return next;
    });
  };

  const handleSendQuickFix = () => {
    if (selectedChips.size === 0) return;
    const feedback = `Quick fix requests: ${Array.from(selectedChips).join(', ')}`;
    onRequestChanges(feedback);
    setMode('view');
    setSelectedChips(new Set());
  };

  const handleDirectSave = (editedContent: string) => {
    if (onDirectEdit) {
      onDirectEdit(editedContent);
    }
    setMode('view');
  };

  const handleModeButton = (next: Mode) => {
    setMode((prev) => (prev === next ? 'view' : next));
    if (next !== 'quickfix') setSelectedChips(new Set());
  };

  return (
    <div data-panel-root className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-white/[0.12] px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-white/85">Section Review</span>
          <span className="rounded-full border border-white/[0.14] bg-white/[0.06] px-2.5 py-0.5 text-[10px] font-medium text-white/78">
            {sectionTitle(section)}
          </span>
        </div>
      </div>

      {/* Scrollable body */}
      <div data-panel-scroll className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Content card — replaced by editor in 'edit' mode */}
        {mode === 'edit' ? (
          <SectionEditor
            content={content}
            section={section}
            onSave={handleDirectSave}
            onCancel={() => setMode('view')}
          />
        ) : (
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
        )}

        {/* Quick Fix chips — shown below content card in 'quickfix' mode */}
        {mode === 'quickfix' && (
          <div ref={chipsRef} className="space-y-3">
            <p className="text-xs text-white/50 font-medium tracking-wide uppercase px-0.5">
              Select quick fixes
            </p>
            <div className="flex flex-wrap gap-2">
              {QUICK_FIX_CHIPS.map((chip) => {
                const active = selectedChips.has(chip);
                return (
                  <button
                    key={chip}
                    onClick={() => toggleChip(chip)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/45',
                      active
                        ? 'border-[#9eb8ff]/55 bg-[rgba(158,184,255,0.18)] text-white'
                        : 'border-white/[0.1] bg-white/[0.03] text-white/60 hover:border-white/[0.2] hover:bg-white/[0.07] hover:text-white/85',
                    )}
                    aria-pressed={active}
                  >
                    {chip}
                  </button>
                );
              })}
            </div>
            <GlassButton
              variant="ghost"
              onClick={handleSendQuickFix}
              disabled={selectedChips.size === 0}
              className="w-full"
            >
              <Send className="mr-1.5 h-3.5 w-3.5" />
              Send Feedback
            </GlassButton>
          </div>
        )}
      </div>

      {/* Fixed action bar — hidden in edit mode (editor has its own Save/Cancel) */}
      {mode !== 'edit' && (
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
              onClick={() => handleModeButton('quickfix')}
              aria-pressed={mode === 'quickfix'}
            >
              <Zap className="mr-1.5 h-3.5 w-3.5" />
              Quick Fix
            </GlassButton>
            <GlassButton
              variant="ghost"
              className="flex-1"
              onClick={() => handleModeButton('edit')}
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Edit
            </GlassButton>
          </div>
        </div>
      )}
    </div>
  );
}
