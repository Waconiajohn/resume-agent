import { useState } from 'react';
import { GlassCard } from './GlassCard';
import { GlassButton } from './GlassButton';
import { GlassTextarea } from './GlassInput';
import type { AskUserPromptData } from '@/types/session';

interface AskUserPromptProps {
  prompt: AskUserPromptData;
  onSubmit: (answer: string) => void;
}

export function AskUserPrompt({ prompt, onSubmit }: AskUserPromptProps) {
  const [textAnswer, setTextAnswer] = useState('');

  if (prompt.inputType === 'multiple_choice' && prompt.choices) {
    return (
      <GlassCard className="mx-4 p-4">
        <p className="mb-1 text-sm font-medium text-white/90">{prompt.question}</p>
        <p className="mb-4 text-xs text-white/60">{prompt.context}</p>
        <div className="space-y-2">
          {prompt.choices.map((choice) => (
            <GlassButton
              key={choice.label}
              variant="ghost"
              onClick={() => onSubmit(choice.label)}
              className="w-full justify-start border border-white/[0.06] text-left"
            >
              <div>
                <div className="text-sm text-white/80">{choice.label}</div>
                {choice.description && (
                  <div className="text-xs text-white/60">{choice.description}</div>
                )}
              </div>
            </GlassButton>
          ))}
        </div>
        {prompt.skipAllowed && (
          <GlassButton
            variant="ghost"
            onClick={() => onSubmit('[skipped]')}
            className="mt-2 text-xs"
          >
            Skip this question
          </GlassButton>
        )}
      </GlassCard>
    );
  }

  return (
    <GlassCard className="mx-4 p-4">
      <p className="mb-1 text-sm font-medium text-white/90">{prompt.question}</p>
      <p className="mb-3 text-xs text-white/60">{prompt.context}</p>
      <div className="flex gap-2">
        <GlassTextarea
          value={textAnswer}
          onChange={(e) => setTextAnswer(e.target.value)}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = 'auto';
            el.style.height = `${el.scrollHeight}px`;
          }}
          placeholder="Type your answer..."
          rows={3}
          className="flex-1"
        />
        <GlassButton
          onClick={() => {
            if (textAnswer.trim()) {
              onSubmit(textAnswer.trim());
              setTextAnswer('');
            }
          }}
          disabled={!textAnswer.trim()}
          className="self-end"
        >
          Send
        </GlassButton>
      </div>
      {prompt.skipAllowed && (
        <GlassButton
          variant="ghost"
          onClick={() => onSubmit('[skipped]')}
          className="mt-2 text-xs"
        >
          Skip this question
        </GlassButton>
      )}
    </GlassCard>
  );
}
