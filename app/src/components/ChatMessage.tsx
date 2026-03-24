import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { Bot, User } from 'lucide-react';

interface ChatMessageProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  animate?: boolean;
}

export function ChatMessage({ role, content, animate = true }: ChatMessageProps) {
  return (
    <div
      className={cn(
        'flex gap-3 px-4 py-3',
        role === 'user' && 'flex-row-reverse',
        animate && (role === 'user' ? 'animate-msg-in-right' : 'animate-msg-in-left'),
      )}
    >
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--line-soft)]',
          role === 'user' ? 'bg-[var(--accent-muted)]' : 'bg-[var(--accent-muted)]',
        )}
      >
        {role === 'user' ? (
          <User className="h-4 w-4 text-[#afc4ff]" />
        ) : (
          <Bot className="h-4 w-4 text-[var(--text-soft)]" />
        )}
      </div>

      <div
        className={cn(
          'max-w-[80%] min-w-0 rounded-2xl border border-[var(--line-soft)] px-4 py-3 text-sm break-words',
          role === 'user'
            ? 'bg-[var(--accent-muted)] text-[var(--text-strong)]'
            : 'bg-[var(--accent-muted)] text-[var(--text-muted)]',
        )}
      >
        <ReactMarkdown
          rehypePlugins={[rehypeSanitize]}
          components={{
            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
            strong: ({ children }) => <strong className="font-semibold text-[var(--text-strong)]">{children}</strong>,
            ul: ({ children }) => <ul className="ml-4 list-disc space-y-1">{children}</ul>,
            ol: ({ children }) => <ol className="ml-4 list-decimal space-y-1">{children}</ol>,
            li: ({ children }) => <li className="text-[var(--text-muted)]">{children}</li>,
            pre: ({ children }) => (
              <pre className="my-2 overflow-x-auto rounded-lg bg-[var(--accent-muted)] p-3 text-xs font-mono text-[var(--text-muted)] whitespace-pre-wrap break-words">
                {children}
              </pre>
            ),
            code: ({ children }) => (
              <code className="rounded bg-[var(--accent-muted)] px-1.5 py-0.5 text-xs font-mono text-[var(--text-muted)] break-words">
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
