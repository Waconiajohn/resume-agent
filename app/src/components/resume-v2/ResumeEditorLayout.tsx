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
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(DEFAULT_LEFT);
  const [leftPercent, setLeftPercent] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? parseFloat(stored) : DEFAULT_LEFT;
  });
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    startXRef.current = touch.clientX;
    startWidthRef.current = leftPercent;
    setIsDragging(true);
  }, [leftPercent]);

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

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;
      const touch = e.touches[0];
      const rect = container.getBoundingClientRect();
      const totalWidth = rect.width;
      const delta = touch.clientX - startXRef.current;
      const deltaPercent = (delta / totalWidth) * 100;
      const newPercent = startWidthRef.current + deltaPercent;

      const minLeftPercent = (MIN_LEFT_PX / totalWidth) * 100;
      const maxLeftPercent = ((totalWidth - MIN_RIGHT_PX) / totalWidth) * 100;
      setLeftPercent(Math.max(minLeftPercent, Math.min(maxLeftPercent, newPercent)));
    };

    const handleTouchEnd = () => {
      setIsDragging(false);
      localStorage.setItem(STORAGE_KEY, String(leftPercent));
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, leftPercent]);

  return (
    <div
      ref={containerRef}
      className={`resume-editor-shell flex h-full w-full overflow-hidden ${isDragging ? 'select-none' : ''}`}
    >
      {/* Left panel */}
      <div
        className="resume-editor-guide-pane shrink-0 overflow-y-auto border-r border-[var(--line-soft)]"
        style={{ width: `${leftPercent}%` }}
      >
        {leftPanel}
      </div>

      {/* Draggable divider */}
      <div
        className={`resume-editor-divider w-1 shrink-0 cursor-col-resize transition-colors hover:bg-[var(--link)]/24 focus:outline-none focus-visible:bg-[var(--link)]/30 ${isDragging ? 'bg-[var(--link)]/30' : 'bg-transparent'}`}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setLeftPercent(prev => Math.max(20, prev - 2));
          if (e.key === 'ArrowRight') setLeftPercent(prev => Math.min(70, prev + 2));
        }}
        tabIndex={0}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panels"
        aria-valuenow={Math.round(leftPercent)}
        aria-valuemin={20}
        aria-valuemax={70}
      />

      {/* Right panel */}
      <div className="resume-editor-document-pane flex-1 overflow-y-auto">
        {rightPanel}
      </div>
    </div>
  );
}
