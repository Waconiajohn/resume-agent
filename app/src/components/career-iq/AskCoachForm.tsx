/**
 * AskCoachForm — Human escalation form for the Emotional Intelligence Layer.
 *
 * Sprint EI1, Story EI1-4.
 * Submits a structured coaching request to POST /api/momentum/coaching-requests.
 * The pre-populated context prop allows callers to seed the description with
 * current pipeline stage information.
 *
 * Design: glass morphism, consistent with career-iq room components.
 */

import { useState } from 'react';
import { HelpCircle, CheckCircle } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { API_BASE } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CoachTopic =
  | 'resume_help'
  | 'interview_prep'
  | 'salary_negotiation'
  | 'career_direction'
  | 'emotional_support'
  | 'other';

export type CoachUrgency = 'low' | 'normal' | 'high';

export interface CoachingRequest {
  id: string;
  user_id: string;
  topic: CoachTopic;
  description: string;
  urgency: CoachUrgency;
  status: 'pending' | 'in_review' | 'responded' | 'closed';
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

interface AskCoachFormProps {
  /** Optional pre-populated context (e.g., current pipeline stage) */
  initialContext?: string;
  /** Called with the created request when submission succeeds */
  onSubmitted?: (request: CoachingRequest) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COACH_TOPICS: Array<{ value: CoachTopic; label: string }> = [
  { value: 'resume_help', label: 'Resume Strategy' },
  { value: 'interview_prep', label: 'Interview Preparation' },
  { value: 'salary_negotiation', label: 'Salary Negotiation' },
  { value: 'career_direction', label: 'Career Direction' },
  { value: 'emotional_support', label: 'Emotional Support' },
  { value: 'other', label: 'Other' },
];

const URGENCY_CONFIG: Record<CoachUrgency, { label: string; activeClass: string }> = {
  low: {
    label: 'Low',
    activeClass: 'bg-[var(--badge-green-text)]/10 text-[var(--badge-green-text)] border-[var(--badge-green-text)]/20',
  },
  normal: {
    label: 'Normal',
    activeClass: 'bg-[var(--link)]/10 text-[var(--link)] border-[var(--link)]/20',
  },
  high: {
    label: 'High',
    activeClass: 'bg-red-400/10 text-red-300 border-red-400/20',
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function AskCoachForm({ initialContext = '', onSubmitted }: AskCoachFormProps) {
  const [topic, setTopic] = useState<CoachTopic | ''>('');
  const [description, setDescription] = useState(initialContext);
  const [urgency, setUrgency] = useState<CoachUrgency>('normal');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!topic || !description.trim()) return;
    setSubmitting(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setError('Not authenticated');
        setSubmitting(false);
        return;
      }

      const res = await fetch(`${API_BASE}/momentum/coaching-requests`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ topic, description: description.trim(), urgency }),
      });

      if (!res.ok) {
        setError('Failed to submit request. Please try again.');
        setSubmitting(false);
        return;
      }

      const json = (await res.json()) as { request: CoachingRequest };
      setSubmitted(true);
      setSubmitting(false);
      onSubmitted?.(json.request);
    } catch {
      setError('Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSubmitted(false);
    setTopic('');
    setDescription(initialContext);
    setUrgency('normal');
    setError(null);
  };

  if (submitted) {
    return (
      <GlassCard className="p-5">
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="rounded-full bg-[var(--badge-green-text)]/10 p-3">
            <CheckCircle size={24} className="text-[var(--badge-green-text)]" />
          </div>
          <div className="text-center">
            <div className="text-[14px] font-medium text-[var(--text-strong)]">Request Submitted</div>
            <div className="text-[12px] text-[var(--text-soft)] mt-1">
              A career coach will review your request within 24-48 hours.
            </div>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="text-[12px] text-[var(--link)] hover:text-[var(--link)]/80 transition-colors mt-2"
          >
            Submit another request
          </button>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <HelpCircle size={16} className="text-[var(--badge-amber-text)]" />
        <h3 className="text-[14px] font-semibold text-[var(--text-strong)]">Ask a Coach</h3>
      </div>
      <p className="text-[12px] text-[var(--text-soft)] mb-4">
        Need personalized guidance? Submit a question and a career coach will respond within
        24-48 hours.
      </p>

      <div className="space-y-3">
        {/* Topic */}
        <div>
          <label className="text-[13px] text-[var(--text-soft)] uppercase tracking-wide mb-1.5 block">
            Topic
          </label>
          <select
            value={topic}
            onChange={(e) => setTopic(e.target.value as CoachTopic)}
            className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2 text-[13px] text-[var(--text-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:border-[var(--link)]/30 appearance-none"
          >
            <option value="" className="bg-[#1a1a2e]">
              Select a topic...
            </option>
            {COACH_TOPICS.map((t) => (
              <option key={t.value} value={t.value} className="bg-[#1a1a2e]">
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div>
          <label className="text-[13px] text-[var(--text-soft)] uppercase tracking-wide mb-1.5 block">
            Your Question
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what you need help with..."
            rows={3}
            className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2 text-[13px] text-[var(--text-muted)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 focus:border-[var(--link)]/30 resize-none"
          />
        </div>

        {/* Urgency */}
        <div>
          <label className="text-[13px] text-[var(--text-soft)] uppercase tracking-wide mb-1.5 block">
            Urgency
          </label>
          <div className="flex gap-2">
            {(['low', 'normal', 'high'] as CoachUrgency[]).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUrgency(u)}
                className={cn(
                  'flex-1 rounded-lg px-2 py-1.5 text-[12px] font-medium transition-colors border',
                  urgency === u
                    ? URGENCY_CONFIG[u].activeClass
                    : 'bg-[var(--accent-muted)] text-[var(--text-soft)] border-[var(--line-soft)] hover:text-[var(--text-soft)]',
                )}
              >
                {URGENCY_CONFIG[u].label}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="text-[12px] text-red-400/80 bg-red-400/[0.06] border border-red-400/15 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* Submit */}
        <GlassButton
          onClick={handleSubmit}
          disabled={!topic || !description.trim() || submitting}
          className="w-full text-[13px]"
        >
          {submitting ? 'Submitting...' : 'Submit Request'}
        </GlassButton>
      </div>
    </GlassCard>
  );
}
