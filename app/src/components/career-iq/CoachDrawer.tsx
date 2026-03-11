import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, X, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCoach } from '@/hooks/useCoach';
import type { CoachMode } from '@/types/coach';

// Generate a stable conversation ID per browser session
function getOrCreateConversationId(): string {
  const key = 'coach_conversation_id';
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}

interface CoachDrawerProps {
  userName: string;
  onNavigate?: (room: string) => void;
  /** Controlled open state — when provided, overrides internal state */
  isOpen?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
  /** When true, raises the FAB to clear mobile bottom navigation */
  isMobile?: boolean;
}

export function CoachDrawer({ userName, onNavigate, isOpen: controlledOpen, onOpen, onClose, isMobile = false }: CoachDrawerProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = useCallback((open: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(open);
    if (open) onOpen?.(); else onClose?.();
  }, [controlledOpen, onOpen, onClose]);
  const [input, setInput] = useState('');
  const conversationId = useRef(getOrCreateConversationId()).current;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { messages, mode, loading, error, events, sendMessage, setMode, clearError } =
    useCoach(conversationId);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const lastNavRef = useRef<string | null>(null);

  // Handle navigation events from coach
  useEffect(() => {
    const navEvent = events.find(
      (e) => e.type === 'recommendation_ready' && typeof e.room === 'string',
    );
    if (navEvent && onNavigate && typeof navEvent.room === 'string') {
      // Deduplicate: only navigate if this is a new room recommendation
      const navKey = `${navEvent.room}:${navEvent.action ?? ''}`;
      if (navKey !== lastNavRef.current) {
        lastNavRef.current = navKey;
        onNavigate(navEvent.room);
      }
    }
  }, [events, onNavigate]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    await sendMessage(text);
    inputRef.current?.focus();
  }, [input, loading, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  const handleModeToggle = useCallback(() => {
    const nextMode: CoachMode = mode === 'guided' ? 'chat' : 'guided';
    void setMode(nextMode);
  }, [mode, setMode]);

  const firstName = userName?.split(' ')[0] || '';

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={cn('fixed right-6 z-50 w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 flex items-center justify-center transition-all hover:scale-105', isMobile ? 'bottom-20' : 'bottom-6')}
        aria-label="Open AI Coach"
      >
        <MessageSquare size={22} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 h-[32rem] flex flex-col rounded-2xl border border-white/[0.08] bg-[#0a0a1a]/95 backdrop-blur-xl shadow-2xl shadow-black/40">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-indigo-600/30 flex items-center justify-center">
            <span className="text-xs font-semibold text-indigo-300">AI</span>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white/90">{firstName ? `AI ${firstName}` : 'AI Coach'}</h3>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-[10px] text-white/40 uppercase tracking-wider">
                {mode === 'guided' ? 'Guided' : 'Chat'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleModeToggle}
            className="p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.05] transition-colors text-xs"
            title={`Switch to ${mode === 'guided' ? 'Chat' : 'Guided'} mode`}
          >
            {mode === 'guided' ? 'Chat' : 'Guided'}
          </button>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.05] transition-colors"
            aria-label="Close coach"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && !loading && (
          <div className="text-center text-white/30 text-sm mt-8">
            <p className="font-medium text-white/50 mb-1">Hi {firstName || 'there'}!</p>
            <p>I'm your AI career coach. Ask me anything about your career transition.</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-indigo-600/80 text-white'
                  : 'bg-white/[0.06] text-white/80 border border-white/[0.06]'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white/[0.06] rounded-2xl px-4 py-3 border border-white/[0.06]">
              <div className="flex gap-1">
                <span
                  className="w-2 h-2 rounded-full bg-white/20 animate-bounce"
                  style={{ animationDelay: '0ms' }}
                />
                <span
                  className="w-2 h-2 rounded-full bg-white/20 animate-bounce"
                  style={{ animationDelay: '150ms' }}
                />
                <span
                  className="w-2 h-2 rounded-full bg-white/20 animate-bounce"
                  style={{ animationDelay: '300ms' }}
                />
              </div>
            </div>
          </div>
        )}
        {error && (
          <div className="text-center">
            <p className="text-red-400/80 text-xs mb-1">{error}</p>
            <button
              type="button"
              onClick={clearError}
              className="text-xs text-white/40 hover:text-white/60 underline"
            >
              Dismiss
            </button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 pb-3 pt-2 border-t border-white/[0.06]">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              // Auto-resize: reset then set to scrollHeight
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask your coach..."
            rows={1}
            className="flex-1 resize-none bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white/90 placeholder:text-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
            style={{ maxHeight: '120px' }}
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={loading || !input.trim()}
            className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:hover:bg-indigo-600 text-white transition-colors"
            aria-label="Send message"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
