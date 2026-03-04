import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ContextPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function ContextPanel({ isOpen, onClose, title, children }: ContextPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus trap: return focus when panel closes or unmounts
  const previousFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
    return () => {
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
        previousFocusRef.current = null;
      }
    };
  }, [isOpen]);

  return (
    <div
      ref={panelRef}
      // Issue 3 fix: when collapsed, use `hidden` (display:none) rather than
      // `w-0` + `flex-shrink-0`. The previous approach left a 0-width flex
      // item in the layout because `flex-shrink-0` prevents the container from
      // collapsing it, and the responsive `lg:w-[360px]` / `xl:w-[420px]`
      // classes win over a plain `w-0` on larger viewports. `hidden` removes
      // the element from the flex layout entirely, so the document panel
      // correctly expands to fill the full available width when closed.
      className={`flex-shrink-0 flex-col border-l border-white/[0.08] bg-[#0d1117]/95 backdrop-blur-sm transition-all duration-300 ease-in-out ${
        isOpen
          ? 'flex h-full w-[300px] translate-x-0 opacity-100 lg:w-[360px] xl:w-[420px]'
          : 'hidden'
      }`}
    >
      {isOpen && (
        <>
          <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
            <span className="text-sm font-medium text-white/85">
              {title ?? 'Context'}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              aria-label="Close context panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {children}
          </div>
        </>
      )}
    </div>
  );
}
