import { type ReactNode, useState, useCallback, useRef, useEffect } from 'react';

interface ResumeEditorLayoutProps {
  leftPanel: ReactNode;
  rightPanel: ReactNode;
}

const STORAGE_KEY = 'resume-editor-left-width';
const DEFAULT_LEFT = 35; // percent
const MIN_LEFT_PX = 300;
const MIN_RIGHT_PX = 400;

export function ResumeEditorLayout({ leftPanel, rightPanel }: ResumeEditorLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftPercent, setLeftPercent] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? parseFloat(stored) : DEFAULT_LEFT;
  });
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const totalWidth = rect.width;

      // Enforce min widths
      const minLeftPercent = (MIN_LEFT_PX / totalWidth) * 100;
      const maxLeftPercent = ((totalWidth - MIN_RIGHT_PX) / totalWidth) * 100;
      const newPercent = Math.max(minLeftPercent, Math.min(maxLeftPercent, (x / totalWidth) * 100));

      setLeftPercent(newPercent);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      localStorage.setItem(STORAGE_KEY, String(leftPercent));
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, leftPercent]);

  return (
    <div
      ref={containerRef}
      className={`flex h-full w-full overflow-hidden ${isDragging ? 'select-none' : ''}`}
    >
      {/* Left panel */}
      <div
        className="shrink-0 overflow-y-auto border-r border-[var(--line-soft)]"
        style={{ width: `${leftPercent}%` }}
      >
        {leftPanel}
      </div>

      {/* Draggable divider */}
      <div
        className={`w-1 shrink-0 cursor-col-resize transition-colors hover:bg-[var(--link)]/30 ${isDragging ? 'bg-[var(--link)]/40' : 'bg-transparent'}`}
        onMouseDown={handleMouseDown}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panels"
      />

      {/* Right panel */}
      <div className="flex-1 overflow-y-auto bg-[var(--bg-1)]">
        {rightPanel}
      </div>
    </div>
  );
}
