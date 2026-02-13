import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import { Bot, User } from 'lucide-react';

interface ChatMessageProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export function ChatMessage({ role, content }: ChatMessageProps) {
  return (
    <div
      className={cn(
        'flex gap-3 px-4 py-3',
        role === 'user' && 'flex-row-reverse',
      )}
    >
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
          role === 'user' ? 'bg-blue-500/20' : 'bg-white/[0.06]',
        )}
      >
        {role === 'user' ? (
          <User className="h-4 w-4 text-blue-400" />
        ) : (
          <Bot className="h-4 w-4 text-white/60" />
        )}
      </div>

      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-3 text-sm',
          role === 'user'
            ? 'bg-blue-500/20 text-white/90'
            : 'bg-white/[0.03] text-white/80',
        )}
      >
        <ReactMarkdown
          components={{
            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
            strong: ({ children }) => <strong className="font-semibold text-white/90">{children}</strong>,
            ul: ({ children }) => <ul className="ml-4 list-disc space-y-1">{children}</ul>,
            ol: ({ children }) => <ol className="ml-4 list-decimal space-y-1">{children}</ol>,
            li: ({ children }) => <li className="text-white/70">{children}</li>,
            code: ({ children }) => (
              <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-xs font-mono text-white/70">
                {children}
              </code>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
