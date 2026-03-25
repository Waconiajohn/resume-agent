/**
 * InlineEditToolbar — Floating toolbar that appears when user selects text in the resume
 *
 * Actions: Strengthen | + Metrics | Shorten | + Keywords | Rewrite | Custom | "Not my voice"
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Loader2, Zap, BarChart3, Minimize2, Key, RefreshCw, MessageSquare, Mic } from 'lucide-react';
import type { EditAction } from '@/hooks/useInlineEdit';

interface InlineEditToolbarProps {
  position: { top: number; left: number; bottom: number } | null;
  isEditing: boolean;
  onAction: (action: EditAction, customInstruction?: string) => void;
  onDismiss: () => void;
}

const ACTIONS: Array<{ action: EditAction; label: string; icon: typeof Zap }> = [
  { action: 'strengthen', label: 'Strengthen', icon: Zap },
  { action: 'add_metrics', label: '+ Metrics', icon: BarChart3 },
  { action: 'shorten', label: 'Shorten', icon: Minimize2 },
  { action: 'add_keywords', label: '+ Keywords', icon: Key },
  { action: 'rewrite', label: 'Rewrite', icon: RefreshCw },
  { action: 'custom', label: 'Custom', icon: MessageSquare },
  { action: 'not_my_voice', label: 'Not my voice', icon: Mic },
];

export function InlineEditToolbar({ position, isEditing, onAction, onDismiss }: InlineEditToolbarProps) {
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customText, setCustomText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [flipped, setFlipped] = useState(false);

  // After render, check if toolbar would go above viewport — if so, flip below.
  // Also clamp horizontal position so the toolbar never clips outside the viewport.
  useEffect(() => {
    if (!position || !toolbarRef.current) return;
    const toolbarHeight = toolbarRef.current.offsetHeight;
    const MARGIN = 8;
    // Flip below selection if toolbar would go above viewport OR if selection top is above viewport
    setFlipped(position.top - toolbarHeight - MARGIN < 0 || position.top < MARGIN);
  }, [position]);

  // Compute a viewport-safe left position for the toolbar.
  // The toolbar is centered on position.left via translateX(-50%), so the raw center can
  // be at most (window.innerWidth - toolbarWidth/2 - MARGIN) and at least (toolbarWidth/2 + MARGIN).
  const getSafeLeft = (): number => {
    if (!toolbarRef.current) return position?.left ?? 0;
    const toolbarWidth = toolbarRef.current.offsetWidth;
    const half = toolbarWidth / 2;
    const MARGIN = 8;
    return Math.max(half + MARGIN, Math.min(position?.left ?? 0, window.innerWidth - half - MARGIN));
  };

  // Focus custom input when shown
  useEffect(() => {
    if (showCustomInput) inputRef.current?.focus();
  }, [showCustomInput]);

  // Dismiss on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showCustomInput) {
          setShowCustomInput(false);
          setCustomText('');
        } else {
          onDismiss();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onDismiss, showCustomInput]);

  const handleAction = useCallback((action: EditAction) => {
    if (action === 'custom') {
      setShowCustomInput(true);
      return;
    }
    onAction(action);
  }, [onAction]);

  const handleCustomSubmit = useCallback(() => {
    if (!customText.trim()) return;
    onAction('custom', customText.trim());
    setShowCustomInput(false);
    setCustomText('');
  }, [onAction, customText]);

  if (!position) return null;

  return (
    <div
      ref={toolbarRef}
      className="fixed z-50 flex flex-col items-start gap-1 rounded-xl border border-gray-200 bg-white/95 backdrop-blur-xl px-1.5 py-1.5 shadow-2xl"
      style={{
        top: flipped ? position.bottom + 8 : position.top,
        left: getSafeLeft(),
        transform: flipped ? 'translateX(-50%)' : 'translate(-50%, -100%) translateY(-8px)',
      }}
      role="toolbar"
      aria-label="AI editing actions"
    >
      {isEditing ? (
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500">
          <Loader2 className="h-3 w-3 motion-safe:animate-spin" />
          Editing...
        </div>
      ) : showCustomInput ? (
        <div className="flex items-center gap-1.5">
          <input
            ref={inputRef}
            type="text"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCustomSubmit(); }}
            placeholder="What should I do?"
            maxLength={500}
            className="w-48 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-800 placeholder:text-gray-400 outline-none focus:border-blue-300"
          />
          <button
            type="button"
            onClick={handleCustomSubmit}
            disabled={!customText.trim()}
            className="rounded-lg bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-200 disabled:opacity-40"
          >
            Go
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-0.5">
          {ACTIONS.map(({ action, label, icon: Icon }) => (
            <button
              key={action}
              type="button"
              onClick={() => handleAction(action)}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-100 hover:text-gray-800 transition-colors"
              title={label}
            >
              <Icon className="h-3 w-3" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
