import { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { GlassTextarea } from './GlassInput';
import { GlassButton } from './GlassButton';
import { ChatMessage } from './ChatMessage';
import { AskUserPrompt } from './AskUserPrompt';
import type { ChatMessage as ChatMessageType, ToolStatus, AskUserPromptData } from '@/types/session';

interface ChatPanelProps {
  messages: ChatMessageType[];
  streamingText: string;
  tools: ToolStatus[];
  askPrompt: AskUserPromptData | null;
  onSendMessage: (content: string) => void;
}

export function ChatPanel({
  messages,
  streamingText,
  tools,
  askPrompt,
  onSendMessage,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const isProcessing = streamingText.length > 0 || tools.some((t) => t.status === 'running');

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streamingText, tools, askPrompt]);

  const handleSubmit = () => {
    if (!input.trim() || isProcessing) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-4 space-y-1">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} role={msg.role} content={msg.content} />
        ))}

        {/* Tool status indicators */}
        {tools.filter((t) => t.status === 'running').map((tool) => (
          <div key={tool.name} className="flex items-center gap-2 px-4 py-2">
            <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
            <span className="text-xs text-white/50">{tool.description}</span>
          </div>
        ))}

        {/* Streaming text */}
        {streamingText && (
          <ChatMessage role="assistant" content={streamingText} />
        )}

        {/* Ask user prompt */}
        {askPrompt && (
          <AskUserPrompt prompt={askPrompt} onSubmit={onSendMessage} />
        )}
      </div>

      {/* Input */}
      <div className="border-t border-white/[0.06] p-4">
        <div className="flex gap-2">
          <GlassTextarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={askPrompt ? 'Answer the question above...' : 'Type a message...'}
            rows={1}
            className="flex-1"
            disabled={isProcessing}
          />
          <GlassButton
            onClick={handleSubmit}
            disabled={!input.trim() || isProcessing}
            className="self-end"
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </GlassButton>
        </div>
      </div>
    </div>
  );
}
