import { useState, useRef, useEffect } from 'react';
import { cleanText } from '@/lib/clean-text';
import { cn } from '@/lib/utils';

interface WorkbenchContentEditorProps {
  content: string;
  localContent: string;
  onLocalContentChange: (content: string) => void;
  isRefining: boolean;
  hasLocalEdits: boolean;
}

function parseContentLines(content: string): string[] {
  return cleanText(content)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function isBullet(line: string): boolean {
  return /^\s*[•\-\*]\s/.test(line);
}

function stripBulletPrefix(line: string): string {
  return line.replace(/^\s*[•\-\*]\s*/, '');
}

function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

export function WorkbenchContentEditor({
  content,
  localContent,
  onLocalContentChange,
  isRefining,
  hasLocalEdits,
}: WorkbenchContentEditorProps) {
  const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null);
  const [editingLineValue, setEditingLineValue] = useState('');
  const [activeLinePrefix, setActiveLinePrefix] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const lines = parseContentLines(localContent || content);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [editingLineValue]);

  // Reset active line when isRefining changes to false
  useEffect(() => {
    if (!isRefining) {
      setActiveLineIndex(null);
      setActiveLinePrefix('');
    }
  }, [isRefining]);

  const handleLineClick = (index: number, line: string) => {
    if (isRefining) return;
    const prefixMatch = line.match(/^(\s*[•\-\*]\s*)/);
    setActiveLineIndex(index);
    setActiveLinePrefix(prefixMatch ? '• ' : '');
    setEditingLineValue(stripBulletPrefix(line));
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleLineBlur = () => {
    if (activeLineIndex === null) return;
    // Save edits back into localContent
    const updatedLines = [...lines];
    const nextValue = editingLineValue.trimEnd();
    updatedLines[activeLineIndex] = activeLinePrefix && nextValue
      ? `${activeLinePrefix}${nextValue}`
      : nextValue;
    onLocalContentChange(updatedLines.join('\n'));
    setActiveLineIndex(null);
    setActiveLinePrefix('');
  };

  const handleLineKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setActiveLineIndex(null);
      setActiveLinePrefix('');
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleLineBlur();
    }
  };

  const wc = wordCount(localContent || content);

  return (
    <div className="relative rounded-[18px] border border-white/[0.08] bg-white/[0.03] overflow-hidden">
      {/* Shimmer overlay when refining */}
      {isRefining && (
        <div className="absolute inset-0 z-10 rounded-[18px] overflow-hidden pointer-events-none">
          <div className="absolute inset-0 workbench-shimmer" />
          <div className="absolute inset-0 bg-black/20" />
        </div>
      )}

      <div className="p-5 space-y-0.5">
        {lines.length > 0 ? (
          lines.map((line, i) => {
            const bullet = isBullet(line);
            const displayText = bullet ? stripBulletPrefix(line) : line;
            const isActive = activeLineIndex === i;

            return (
              <div
                key={i}
                className={cn(
                  'group flex items-start gap-2 px-2 py-1.5 rounded-lg transition-colors duration-100 cursor-text',
                  !isRefining && 'hover:bg-white/[0.04]',
                  isActive && 'bg-white/[0.04]',
                )}
                onClick={() => handleLineClick(i, line)}
              >
                {bullet && !isActive && (
                  <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-white/40" />
                )}
                {isActive ? (
                  <div className="flex-1 border-l-2 border-[#98b3ff] pl-2">
                    <textarea
                      ref={textareaRef}
                      value={editingLineValue}
                      onChange={(e) => setEditingLineValue(e.target.value)}
                      onBlur={handleLineBlur}
                      onKeyDown={handleLineKeyDown}
                      className="w-full resize-none bg-transparent text-sm leading-relaxed text-white/90 outline-none placeholder:text-white/30"
                      rows={1}
                    />
                  </div>
                ) : (
                  <p className="flex-1 text-sm leading-relaxed text-white/85">{displayText}</p>
                )}
              </div>
            );
          })
        ) : (
          <p className="text-sm text-white/40 italic px-2 py-1.5">No content to display.</p>
        )}
      </div>

      {/* Word count + edit status */}
      <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-2">
        {hasLocalEdits && (
          <span className="text-[10px] text-[#98b3ff]/80 font-medium">Unsaved edits</span>
        )}
        {!hasLocalEdits && <span />}
        <span className="text-[10px] text-white/30">{wc} words</span>
      </div>
    </div>
  );
}
