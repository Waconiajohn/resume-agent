/**
 * InlineEditToolbar — Floating toolbar that appears when user selects text in the resume
 *
 * Actions: Strengthen | + Metrics | Shorten | + Keywords | Rewrite | Custom | "Not my voice"
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Loader2, Zap, BarChart3, Minimize2, Key, RefreshCw, MessageSquare, Mic } from 'lucide-react';
import type { EditAction } from '@/hooks/useInlineEdit';

interface InlineEditToolbarProps {
  position: { top: number; left: number } | null;
  isEditing: boolean;
  onAction: (action: EditAction, customInstruction?: string) => void;
  onDismiss: () => void;
}

const ACTIONS: Array<{ action: EditAction; label: string; icon: typeof Zap; shortLabel: string }> = [
  { action: 'strengthen', label: 'Strengthen', icon: Zap, shortLabel: 'Strengthen' },
  { action: 'add_metrics', label: '+ Metrics', icon: BarChart3, shortLabel: 'Metrics' },
  { action: 'shorten', label: 'Shorten', icon: Minimize2, shortLabel: 'Shorten' },
  { action: 'add_keywords', label: '+ Keywords', icon: Key, shortLabel: 'Keywords' },
  { action: 'rewrite', label: 'Rewrite', icon: RefreshCw, shortLabel: 'Rewrite' },
  { action: 'custom', label: 'Custom', icon: MessageSquare, shortLabel: 'Custom' },
  { action: 'not_my_voice', label: 'Not my voice', icon: Mic, shortLabel: 'Voice' },
];

export function InlineEditToolbar({ position, isEditing, onAction, onDismiss }: InlineEditToolbarProps) {
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customText, setCustomText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

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
      className="fixed z-50 flex flex-col items-start gap-1 rounded-xl border border-white/[0.12] bg-[#0f141e]/95 backdrop-blur-xl px-1.5 py-1.5 shadow-2xl"
      style={{
        top: position.top,
        left: position.left,
        transform: 'translate(-50%, -100%) translateY(-8px)',
      }}
      role="toolbar"
      aria-label="AI editing actions"
    >
      {isEditing ? (
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-white/50">
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
            className="w-48 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-xs text-white/90 placeholder:text-white/30 outline-none focus:border-[#afc4ff]/40"
          />
          <button
            type="button"
            onClick={handleCustomSubmit}
            disabled={!customText.trim()}
            className="rounded-lg bg-[#afc4ff]/20 px-2 py-1 text-xs font-medium text-[#afc4ff] hover:bg-[#afc4ff]/30 disabled:opacity-40"
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
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-white/70 hover:bg-white/[0.08] hover:text-white/90 transition-colors"
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
