/**
 * AddContextCard — "Tell us what we missed" text area
 *
 * Appears after gap analysis when pipeline is complete.
 * User submits additional context → pipeline re-runs with enriched evidence.
 */

import { useState, useCallback } from 'react';
import { MessageSquarePlus, Loader2 } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import { GlassButton } from '../GlassButton';

interface AddContextCardProps {
  onSubmit: (context: string) => void;
  loading: boolean;
}

const EXAMPLE_PROMPTS = [
  'I managed a $6M annual budget at CWT — never put it on my resume',
  'My team of 40 at Acme Corp handled all APAC operations — that\'s the international scope they want',
  'I led the Salesforce-to-HubSpot migration — similar CRM platform expertise they\'re asking for',
] as const;

export function AddContextCard({ onSubmit, loading }: AddContextCardProps) {
  const [context, setContext] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  const canSubmit = context.trim().length >= 20 && !loading;

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    onSubmit(context.trim());
  }, [canSubmit, context, onSubmit]);

  const handleCancel = useCallback(() => {
    setIsExpanded(false);
    setContext('');
  }, []);

  return (
    <div>
      {/* Collapsed trigger */}
      {!isExpanded && (
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="flex items-center gap-2 rounded-xl border border-dashed border-white/[0.12] bg-white/[0.02] px-4 py-3 text-sm text-white/50 hover:border-[#afc4ff]/30 hover:text-white/70 transition-colors w-full text-left"
        >
          <MessageSquarePlus className="h-4 w-4 shrink-0" />
          Tell us what we missed — add context the AI didn't find in your resume
        </button>
      )}

      {/* Expandable panel */}
      <div
        className={`transition-all duration-300 overflow-hidden ${
          isExpanded ? 'max-h-96 mt-2' : 'max-h-0'
        }`}
      >
        <GlassCard className="p-4 border-[#afc4ff]/15">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquarePlus className="h-4 w-4 text-[#afc4ff]" />
            <h4 className="text-sm font-medium text-white/80">Add Context</h4>
          </div>

          <p className="text-xs text-white/45 mb-2">
            Tell us about experience, skills, or accomplishments the AI missed. Examples:
          </p>

          {/* Clickable example pills */}
          <div className="flex flex-col gap-1 mb-3">
            {EXAMPLE_PROMPTS.map((example, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setContext(example)}
                disabled={loading}
                className="rounded-lg px-3 py-1.5 text-xs text-white/35 text-left hover:bg-white/[0.06] hover:text-white/55 transition-colors disabled:pointer-events-none"
              >
                &ldquo;{example}&rdquo;
              </button>
            ))}
          </div>

          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Be specific — mention job titles, team sizes, budget amounts, or project outcomes..."
            rows={4}
            disabled={loading}
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-sm text-white/90 placeholder:text-white/30 outline-none focus:border-[#afc4ff]/40 disabled:opacity-50 resize-y mb-1"
          />
          <p className="text-xs text-white/30 mb-2">
            {context.trim().length < 20 && context.length > 0
              ? `Be specific — ${20 - context.trim().length} more characters needed`
              : '\u00a0'}
          </p>

          <div className="flex items-center gap-2">
            <GlassButton
              onClick={handleSubmit}
              disabled={!canSubmit}
              size="sm"
              className="gap-1.5"
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />
                  Re-running with your context...
                </>
              ) : (
                'Re-run with this context'
              )}
            </GlassButton>
            <GlassButton
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              disabled={loading}
            >
              Cancel
            </GlassButton>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
