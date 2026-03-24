import { useState } from 'react';
import {
  BookOpen,
  FileText,
  Linkedin,
  MessageSquare,
  Network,
  Pencil,
  Sparkles,
  X,
} from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { cn } from '@/lib/utils';
import { useWhyMeStory } from './useWhyMeStory';
import type { WhyMeStory, SignalLevel } from './useWhyMeStory';
import { useNarrativeSnapshot } from './useNarrativeSnapshot';

// ---------------------------------------------------------------------------
// Signal dot — rendered in the header row
// ---------------------------------------------------------------------------
function SignalDot({ level, label }: { level: SignalLevel; label: string }) {
  const colorMap: Record<SignalLevel, string> = {
    green: 'bg-[#b5dec2]',
    yellow: 'bg-[#f0d99f]',
    red: 'bg-[var(--line-strong)]',
  };
  return (
    <div className="flex items-center gap-1.5">
      <div className={cn('h-2 w-2 shrink-0 rounded-full', colorMap[level])} />
      <span className="text-[12px] text-[var(--text-soft)]">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline editable narrative block — shows value with a pencil edit button
// ---------------------------------------------------------------------------
interface EditableBlockProps {
  label: string;
  value: string;
  placeholder: string;
  onSave: (value: string) => void;
}

function EditableBlock({ label, value, placeholder, onSave }: EditableBlockProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const handleEdit = () => {
    setDraft(value);
    setEditing(true);
  };

  const handleSave = () => {
    onSave(draft);
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(value);
    setEditing(false);
  };

  return (
    <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[13px] font-medium uppercase tracking-widest text-[var(--text-soft)]">{label}</div>
        {editing ? (
          <button
            type="button"
            onClick={handleCancel}
            aria-label="Cancel edit"
            className="rounded-md p-1 text-[var(--text-soft)] transition-colors hover:text-[var(--text-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#98b3ff]/40"
          >
            <X size={13} />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleEdit}
            aria-label={`Edit ${label}`}
            className="rounded-md p-1 text-[var(--text-soft)] transition-colors hover:text-[var(--text-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#98b3ff]/40"
          >
            <Pencil size={13} />
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            autoFocus
            className={cn(
              'min-h-[100px] w-full rounded-xl border border-[#98b3ff]/20 bg-black/20 px-3 py-2.5',
              'text-sm leading-relaxed text-[var(--text-strong)] placeholder:text-[var(--text-soft)]',
              'focus:border-[#98b3ff]/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#98b3ff]/35',
              'resize-y',
            )}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[12px] text-[var(--text-soft)]">
              {draft.trim().length > 0
                ? `${draft.trim().length} characters`
                : 'Be specific — include proof, scope, and language you would use in a real conversation'}
            </span>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-lg border border-[#98b3ff]/25 bg-[#98b3ff]/10 px-3 py-1.5 text-[13px] font-medium text-[#98b3ff] transition-colors hover:bg-[#98b3ff]/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#98b3ff]/40"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
          {value.trim() ? value : (
            <span className="italic text-[var(--text-soft)]">
              Not answered yet — click the edit icon to add your answer
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// "How this drives your tools" connection grid
// ---------------------------------------------------------------------------
const TOOL_CONNECTIONS: Array<{
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  detail: string;
}> = [
  { icon: FileText, label: 'Resume', detail: 'Opens with your positioning' },
  { icon: Linkedin, label: 'LinkedIn', detail: 'Headline and About section' },
  { icon: MessageSquare, label: 'Interview', detail: 'Your career story' },
  { icon: Network, label: 'Networking', detail: 'Outreach messages' },
];

// ---------------------------------------------------------------------------
// Main component — fully self-contained, owns its own data hooks
// ---------------------------------------------------------------------------
export function WhyMeStoryCard() {
  const { story, signals, updateField, hasStarted } = useWhyMeStory();
  const { snapshot, status: snapshotStatus } = useNarrativeSnapshot();

  // Only show once the user has started at least one answer
  if (!hasStarted) return null;

  return (
    <GlassCard className="p-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="rounded-lg bg-[#98b3ff]/12 p-2">
          <BookOpen size={16} className="text-[#98b3ff]" />
        </div>
        <div>
          <div className="text-[13px] font-medium uppercase tracking-widest text-[#98b3ff]/70">
            Your Why Me Story
          </div>
          <h2 className="mt-1 text-sm font-semibold text-[var(--text-strong)]">
            The narrative every tool works from
          </h2>
        </div>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-[var(--text-soft)]">
        This is your positioning foundation. The three answers below shape how Resume Builder, LinkedIn, Interview Prep, and Networking frame your story.
      </p>

      {/* Signal row */}
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <SignalDot level={signals.clarity} label="Clarity" />
        <SignalDot level={signals.alignment} label="Alignment" />
        <SignalDot level={signals.differentiation} label="Differentiation" />
      </div>

      {/* Section A: Core Identity (editable) */}
      <div className="mt-6">
        <div className="mb-3 text-[13px] font-medium uppercase tracking-widest text-[var(--text-soft)]">
          A — Your Core Identity
        </div>
        <div className="space-y-3">
          <EditableBlock
            label="What colleagues came to you for"
            value={story.colleaguesCameForWhat}
            placeholder="The thing people specifically sought you out to help with — not because you were assigned, but because they chose you."
            onSave={(v) => updateField('colleaguesCameForWhat', v)}
          />
          <EditableBlock
            label="What you want to be known for"
            value={story.knownForWhat}
            placeholder="Not a job title — a capability, a contribution, a result. The thing that creates the most value when someone describes you to a hiring manager."
            onSave={(v) => updateField('knownForWhat', v)}
          />
          <EditableBlock
            label="Where you are not the right fit"
            value={story.whyNotMe}
            placeholder="The roles, industries, or functions that are a bad fit. Naming the Why-Not-Me sharpens your targeting by contrast and builds trust with hiring managers."
            onSave={(v) => updateField('whyNotMe', v)}
          />
        </div>
      </div>

      {/* Section B: Pipeline Narrative (read-only) */}
      <div className="mt-6">
        <div className="mb-3 text-[13px] font-medium uppercase tracking-widest text-[var(--text-soft)]">
          B — Your Positioning Narrative
        </div>

        {snapshotStatus === 'loading' ? (
          <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4">
            <div className="text-sm text-[var(--text-soft)]">
              Loading narrative from your most recent resume session...
            </div>
          </div>
        ) : snapshot ? (
          <div className="space-y-3">
            {/* Branded title */}
            {snapshot.branded_title && (
              <div className="rounded-xl border border-[#98b3ff]/18 bg-[#98b3ff]/[0.05] p-4">
                <div className="text-[13px] font-medium uppercase tracking-widest text-[#98b3ff]/70">
                  Branded Title
                </div>
                <div className="mt-2 text-base font-semibold text-[var(--text-strong)]">
                  {snapshot.branded_title}
                </div>
              </div>
            )}

            {/* Positioning angle / concise pitch */}
            {snapshot.why_me_concise && (
              <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4">
                <div className="text-[13px] font-medium uppercase tracking-widest text-[var(--text-soft)]">
                  Positioning Angle
                </div>
                <p className="mt-2 text-sm italic leading-relaxed text-[var(--text-strong)]">
                  {snapshot.why_me_concise}
                </p>
              </div>
            )}

            {/* Best line — pull-quote treatment */}
            {snapshot.why_me_best_line && (
              <div className="relative overflow-hidden rounded-xl border border-[#b5dec2]/15 bg-[#b5dec2]/[0.04] p-4">
                <div
                  className="absolute left-3 top-2 select-none font-serif text-4xl leading-none text-[#b5dec2]/10"
                  aria-hidden="true"
                >
                  &ldquo;
                </div>
                <div className="relative z-10">
                  <div className="text-[13px] font-medium uppercase tracking-widest text-[#b5dec2]/70">
                    Best Line to Reuse
                  </div>
                  <p className="mt-2 pl-2 text-sm italic text-[var(--text-strong)]">
                    {snapshot.why_me_best_line}
                  </p>
                </div>
              </div>
            )}

            {/* Unique differentiators */}
            {snapshot.unique_differentiators.length > 0 && (
              <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4">
                <div className="text-[13px] font-medium uppercase tracking-widest text-[var(--text-soft)]">
                  Points to Emphasize
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {snapshot.unique_differentiators.map((diff) => (
                    <span
                      key={diff}
                      className="flex items-center gap-1.5 rounded-md border border-[#98b3ff]/20 bg-[#98b3ff]/10 px-3 py-1.5 text-xs uppercase tracking-[0.08em] text-[#98b3ff]/80"
                    >
                      <Sparkles size={11} className="shrink-0" />
                      {diff}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Full narrative story — collapsed by default */}
            {snapshot.why_me_story && (
              <details className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4">
                <summary className="cursor-pointer text-[13px] font-medium uppercase tracking-widest text-[var(--text-soft)] hover:text-[var(--text-soft)]">
                  Full narrative story
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-[var(--text-soft)]">
                  {snapshot.why_me_story}
                </p>
              </details>
            )}

            <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3">
              <p className="text-xs leading-relaxed text-[var(--text-soft)]">
                This narrative was generated during a Resume Builder session. To update it, run a new resume session — the narrative will reflect your positioning for that specific role.
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-[var(--accent-muted)] p-2">
                <Sparkles size={14} className="text-[var(--text-soft)]" />
              </div>
              <div>
                <div className="text-sm font-medium text-[var(--text-soft)]">No pipeline narrative yet</div>
                <p className="mt-1 text-xs leading-relaxed text-[var(--text-soft)]">
                  Run your first Resume Builder session to unlock your full positioning narrative — branded title, elevator pitch, and the single most powerful line to reuse across every tool.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Section C: How this drives your tools */}
      <div className="mt-6">
        <div className="mb-3 text-[13px] font-medium uppercase tracking-widest text-[var(--text-soft)]">
          C — How This Drives Your Tools
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TOOL_CONNECTIONS.map(({ icon: Icon, label, detail }) => (
            <div
              key={label}
              className="flex flex-col items-center rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4 text-center"
            >
              <div className="rounded-lg bg-[#98b3ff]/10 p-2.5">
                <Icon size={14} className="text-[#98b3ff]/70" />
              </div>
              <div className="mt-2 text-[13px] font-medium text-[var(--text-muted)]">{label}</div>
              <div className="mt-1 text-xs leading-relaxed text-[var(--text-soft)]">{detail}</div>
            </div>
          ))}
        </div>
      </div>
    </GlassCard>
  );
}
