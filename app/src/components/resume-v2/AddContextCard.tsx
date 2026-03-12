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

export function AddContextCard({ onSubmit, loading }: AddContextCardProps) {
  const [context, setContext] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  const handleSubmit = useCallback(() => {
    if (!context.trim() || loading) return;
    onSubmit(context.trim());
  }, [context, loading, onSubmit]);

  if (!isExpanded) {
    return (
      <button
        type="button"
        onClick={() => setIsExpanded(true)}
        className="flex items-center gap-2 rounded-xl border border-dashed border-white/[0.12] bg-white/[0.02] px-4 py-3 text-sm text-white/50 hover:border-[#afc4ff]/30 hover:text-white/70 transition-colors w-full text-left"
      >
        <MessageSquarePlus className="h-4 w-4 shrink-0" />
        Tell us what we missed — add context the AI didn't find in your resume
      </button>
    );
  }

  return (
    <GlassCard className="p-4 border-[#afc4ff]/15">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquarePlus className="h-4 w-4 text-[#afc4ff]" />
        <h4 className="text-sm font-medium text-white/80">Add Context</h4>
      </div>

      <p className="text-xs text-white/45 mb-3">
        Tell us about experience, skills, or accomplishments the AI missed. Examples:
      </p>
      <ul className="text-xs text-white/35 mb-3 space-y-1 pl-3">
        <li>&ldquo;I managed a $6M annual budget at CWT but never put it on my resume&rdquo;</li>
        <li>&ldquo;My HubSpot experience is comparable to what they want with Salesforce&rdquo;</li>
        <li>&ldquo;I led the offshore transition — that's the centralization experience they're looking for&rdquo;</li>
      </ul>

      <textarea
        value={context}
        onChange={(e) => setContext(e.target.value)}
        placeholder="What did we miss?"
        rows={4}
        disabled={loading}
        className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-sm text-white/90 placeholder:text-white/30 outline-none focus:border-[#afc4ff]/40 disabled:opacity-50 resize-y mb-3"
      />

      <div className="flex items-center gap-2">
        <GlassButton
          onClick={handleSubmit}
          disabled={!context.trim() || loading}
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
          onClick={() => { setIsExpanded(false); setContext(''); }}
          disabled={loading}
        >
          Cancel
        </GlassButton>
      </div>
    </GlassCard>
  );
}
