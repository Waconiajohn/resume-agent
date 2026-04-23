/**
 * YourProfilePage — renders at the "Career Vault" sidebar destination.
 *
 * Unified identity page consolidating all "who you are" data:
 *   Section A — Why-Me Story (positioning backbone)
 *   Section B — Career Record (source of truth)
 *   Section C — Brand & Benchmark Assets (bio + case studies)
 *   Section D — LinkedIn Profile (public-facing summary)
 *   Section E — Proof Library (aggregated read-only + manual entry)
 *
 * Phase 3 will restructure this into the three Career Vault sections
 * (Positioning / Career Record / Benchmark LinkedIn Brand). Phase 1
 * is a pure label rename — structure preserved.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Linkedin,
  Loader2,
  MessageSquare,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { cn } from '@/lib/utils';
import { WhyMeStoryCard } from './WhyMeStoryCard';
import { WhyMeEngine } from './WhyMeEngine';
import { useWhyMeStory } from './useWhyMeStory';
import { useLinkedInProfile } from '@/hooks/useLinkedInProfile';
import { useStoryBank } from '@/hooks/useStoryBank';
import type { InterviewStory, StoryBankRow } from '@/hooks/useStoryBank';
import type { MasterResume } from '@/types/resume';
import type { CareerProfileV2 } from '@/types/career-profile';

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  label,
  title,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="rounded-lg bg-[var(--link)]/12 p-2">
        <Icon size={16} className="text-[var(--link)]" />
      </div>
      <div>
        <div className="text-[13px] font-medium uppercase tracking-widest text-[var(--link)]">
          {label}
        </div>
        <h2 className="mt-0.5 text-sm font-semibold text-[var(--text-strong)]">{title}</h2>
      </div>
    </div>
  );
}

// ─── Section A — Career Record ────────────────────────────────────────────────

interface ResumeSectionProps {
  onGetDefaultResume?: () => Promise<MasterResume | null>;
  onNavigateResume?: () => void;
}

function ResumeSection({ onGetDefaultResume, onNavigateResume }: ResumeSectionProps) {
  const navigate = useNavigate();
  const [resume, setResume] = useState<MasterResume | null>(null);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeError, setResumeError] = useState(false);
  const loadAttemptedRef = useRef(false);

  // Load default resume once on mount
  useEffect(() => {
    if (!onGetDefaultResume) return;
    if (loadAttemptedRef.current) { setResumeLoading(false); return; }
    loadAttemptedRef.current = true;
    let cancelled = false;
    setResumeLoading(true);

    // Timeout: if resume doesn't load in 10s, stop spinning and show empty state
    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        setResumeLoading(false);
        setResumeError(true);
      }
    }, 10_000);

    void onGetDefaultResume().then((r) => {
      clearTimeout(timeoutId);
      if (!cancelled) {
        setResume(r);
        setResumeLoading(false);
      }
    }).catch(() => {
      clearTimeout(timeoutId);
      if (!cancelled) {
        setResumeLoading(false);
        setResumeError(true);
      }
    });
    return () => { cancelled = true; clearTimeout(timeoutId); };
  }, [onGetDefaultResume]);

  if (resumeLoading) {
    return (
      <GlassCard className="p-6">
        <SectionHeader icon={FileText} label="Resume" title="Your Career Record" />
        <div className="mt-4 flex items-center gap-2 text-sm text-[var(--text-soft)]">
          <Loader2 size={16} className="animate-spin text-[var(--link)]" />
          Loading your Career Record...
        </div>
      </GlassCard>
    );
  }

  if (!resume) {
    return (
      <GlassCard className="p-6">
        <SectionHeader icon={FileText} label="Resume" title="Your Career Record" />
        <p className="mt-3 text-sm leading-relaxed text-[var(--text-soft)]">
          Your Career Record is the source of truth for every tool in the workspace. Upload it once
          and every application starts with full context.
        </p>
        <div className="mt-5 text-center py-6">
          {resumeError ? (
            <div className="text-sm text-[var(--text-soft)]">
              <p>We couldn't load your Career Record. You may not have uploaded one yet.</p>
              <button onClick={() => navigate('/workspace?room=resume')} className="mt-2 text-[var(--link)] hover:underline text-sm">
                Go to Resume Builder →
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-[var(--text-muted)] mb-3">
                No Career Record yet.
              </p>
              <GlassButton onClick={() => navigate('/workspace?room=resume')}>
                Go to Resume Builder
              </GlassButton>
            </>
          )}
        </div>
      </GlassCard>
    );
  }

  // Resume exists — compact summary view
  const experienceCount = resume.experience.length;
  const skillGroupCount = Object.keys(resume.skills).length;
  const summaryPreview = resume.summary
    ? resume.summary.slice(0, 200) + (resume.summary.length > 200 ? '…' : '')
    : '';

  return (
    <GlassCard className="p-6">
      <div className="flex items-start justify-between gap-4">
        <SectionHeader icon={FileText} label="Resume" title="Your Career Record" />
        <div className="flex items-center gap-2 shrink-0">
          {onNavigateResume && (
            <GlassButton variant="ghost" size="sm" onClick={onNavigateResume}>
              <ExternalLink size={13} className="mr-1" />
              View Full Resume
            </GlassButton>
          )}
        </div>
      </div>

      {/* Summary preview */}
      {summaryPreview && (
        <div className="mt-3 rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4">
          <div className="text-[13px] font-medium uppercase tracking-widest text-[var(--text-soft)]">
            Summary
          </div>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
            {summaryPreview}
          </p>
        </div>
      )}

      {/* Stats row */}
      <div className="mt-3 flex flex-wrap gap-3">
        {experienceCount > 0 && (
          <div className="rounded-md border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2">
            <span className="text-[13px] text-[var(--text-muted)]">
              {experienceCount} experience{experienceCount !== 1 ? 's' : ''}
            </span>
          </div>
        )}
        {skillGroupCount > 0 && (
          <div className="rounded-md border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2">
            <span className="text-[13px] text-[var(--text-muted)]">
              {skillGroupCount} skill{skillGroupCount !== 1 ? ' groups' : ' group'}
            </span>
          </div>
        )}
        {resume.evidence_items.length > 0 && (
          <div className="rounded-md border border-[var(--badge-green-text)]/20 bg-[var(--badge-green-text)]/[0.05] px-3 py-2">
            <span className="text-[13px] text-[var(--badge-green-text)]/80">
              {resume.evidence_items.length} evidence item{resume.evidence_items.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {onNavigateResume && (
        <div className="mt-4 border-t border-[var(--line-soft)] pt-4">
          <button
            type="button"
            onClick={onNavigateResume}
            className="text-[13px] text-[var(--link)] transition-colors hover:text-[var(--link)]/70"
          >
            Upload a new version in Resume Builder
          </button>
        </div>
      )}
    </GlassCard>
  );
}

// ─── Section C — LinkedIn Profile ─────────────────────────────────────────────

function LinkedInSection() {
  const { profile, updateField, save, loading, saving, error, hasContent } = useLinkedInProfile();
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    const ok = await save();
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  };

  return (
    <GlassCard className="p-6">
      <SectionHeader icon={Linkedin} label="LinkedIn" title="LinkedIn Profile" />
      <p className="mt-3 text-sm leading-relaxed text-[var(--text-soft)]">
        Your LinkedIn headline and About section are stored here as source material. LinkedIn Studio
        uses this to generate optimized content and profile suggestions.
      </p>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-[var(--text-soft)]">
          <Loader2 size={16} className="animate-spin text-[var(--link)]" />
          Loading...
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {/* Headline */}
          <div>
            <label
              htmlFor="linkedin-headline"
              className="text-[13px] font-medium uppercase tracking-widest text-[var(--text-soft)]"
            >
              Headline
            </label>
            <input
              id="linkedin-headline"
              type="text"
              value={profile.headline}
              onChange={(e) => updateField('headline', e.target.value)}
              placeholder="VP of Operations | Scaling teams from 20 to 200 | Operational excellence"
              className={cn(
                'mt-2 w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3',
                'text-sm text-[var(--text-strong)] placeholder:text-[var(--text-soft)]',
                'focus:border-[var(--link)]/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/35',
              )}
            />
          </div>

          {/* About */}
          <div>
            <label
              htmlFor="linkedin-about"
              className="text-[13px] font-medium uppercase tracking-widest text-[var(--text-soft)]"
            >
              About Section
            </label>
            <textarea
              id="linkedin-about"
              value={profile.about}
              onChange={(e) => updateField('about', e.target.value)}
              placeholder="Paste your full LinkedIn About section here. This is often the first profile summary a recruiter reads before your resume."
              rows={8}
              className={cn(
                'mt-2 w-full resize-y rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3',
                'text-sm leading-relaxed text-[var(--text-strong)] placeholder:text-[var(--text-soft)]',
                'focus:border-[var(--link)]/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/35',
              )}
            />
            {profile.about.trim().length > 0 && (
              <p className="mt-1 text-[12px] text-[var(--text-soft)]">
                {profile.about.trim().length} characters
              </p>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-[var(--badge-red-text)]">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <GlassButton
              variant="primary"
              size="sm"
              onClick={() => void handleSave()}
              disabled={saving || !hasContent}
              loading={saving}
            >
              <Save size={13} className="mr-1" />
              {saving ? 'Saving...' : 'Save LinkedIn Profile'}
            </GlassButton>
            {saved && (
              <div className="flex items-center gap-1.5 text-[13px] text-[var(--badge-green-text)]">
                <CheckCircle2 size={13} />
                Saved
              </div>
            )}
          </div>
        </div>
      )}
    </GlassCard>
  );
}

// ─── Story Bank ──────────────────────────────────────────────────────────────

function ThemeBadge({ theme }: { theme: string }) {
  return (
    <span className="rounded-md border border-[var(--link)]/20 bg-[var(--link)]/[0.07] px-2 py-0.5 text-[11px] text-[var(--link)]/80 uppercase tracking-[0.06em]">
      {theme}
    </span>
  );
}

function ObjectionBadge({ objection }: { objection: string }) {
  return (
    <span className="rounded-md border border-[var(--badge-amber-text)]/20 bg-[var(--badge-amber-text)]/[0.07] px-2 py-0.5 text-[11px] text-[var(--badge-amber-text)]/80">
      {objection}
    </span>
  );
}

interface StoryCardProps {
  row: StoryBankRow;
  onDelete: (id: string) => void;
  onSave: (id: string, content: InterviewStory) => Promise<boolean>;
}

function StoryCard({ row, onDelete, onSave }: StoryCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<InterviewStory>(row.content);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    const ok = await onSave(row.id, draft);
    setSaving(false);
    if (ok) {
      setEditing(false);
    } else {
      setSaveError('Save failed. Please try again.');
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    await onDelete(row.id);
    // Parent removes the row from state; no need to reset local state
  };

  const generatedDate = row.content.generated_at
    ? new Date(row.content.generated_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)]">
      {/* Card header — always visible */}
      <div className="flex items-start gap-3 p-4">
        <div className="mt-0.5 rounded-lg bg-[var(--link)]/10 p-1.5 shrink-0">
          <MessageSquare size={13} className="text-[var(--link)]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-relaxed text-[var(--text-muted)] line-clamp-2">
            {row.content.situation}
          </p>
          {(row.content.themes.length > 0 || row.content.objections_addressed.length > 0) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {row.content.themes.map((t) => (
                <ThemeBadge key={t} theme={t} />
              ))}
              {row.content.objections_addressed.map((o) => (
                <ObjectionBadge key={o} objection={o} />
              ))}
            </div>
          )}
          {generatedDate && (
            <p className="mt-1.5 text-[12px] text-[var(--text-soft)]">Generated {generatedDate}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 rounded-md p-1.5 text-[var(--text-soft)] transition-colors hover:text-[var(--text-muted)]"
          aria-label={expanded ? 'Collapse story' : 'Expand story'}
        >
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>

      {/* Expanded — STAR+R detail or edit form */}
      {expanded && (
        <div className="border-t border-[var(--line-soft)] p-4">
          {editing ? (
            <div className="space-y-4">
              {(
                ['situation', 'task', 'action', 'result', 'reflection'] as const
              ).map((field) => (
                <div key={field}>
                  <label
                    htmlFor={`story-${row.id}-${field}`}
                    className="text-[13px] font-medium uppercase tracking-widest text-[var(--text-soft)]"
                  >
                    {field.charAt(0).toUpperCase() + field.slice(1)}
                    {field === 'reflection' && (
                      <span className="ml-1 text-[11px] normal-case text-[var(--badge-amber-text)]">required</span>
                    )}
                  </label>
                  <textarea
                    id={`story-${row.id}-${field}`}
                    value={draft[field]}
                    onChange={(e) => setDraft((prev) => ({ ...prev, [field]: e.target.value }))}
                    rows={field === 'action' ? 5 : 3}
                    className={cn(
                      'mt-1.5 w-full resize-y rounded-xl border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2.5',
                      'text-sm leading-relaxed text-[var(--text-strong)] placeholder:text-[var(--text-soft)]',
                      'focus:border-[var(--link)]/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/35',
                    )}
                  />
                </div>
              ))}

              {saveError && (
                <div className="flex items-center gap-2 text-sm text-[var(--badge-red-text)]">
                  <AlertCircle size={13} />
                  {saveError}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <GlassButton
                  variant="primary"
                  size="sm"
                  onClick={() => void handleSave()}
                  disabled={saving || !draft.reflection.trim()}
                  loading={saving}
                >
                  <Save size={13} className="mr-1" />
                  {saving ? 'Saving...' : 'Save changes'}
                </GlassButton>
                <button
                  type="button"
                  onClick={() => { setEditing(false); setDraft(row.content); setSaveError(null); }}
                  className="rounded-md p-1.5 text-[var(--text-soft)] transition-colors hover:text-[var(--text-muted)]"
                  aria-label="Cancel edit"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {(
                [
                  { key: 'situation', label: 'Situation' },
                  { key: 'task', label: 'Task' },
                  { key: 'action', label: 'Action' },
                  { key: 'result', label: 'Result' },
                  { key: 'reflection', label: 'Reflection' },
                ] as const
              ).map(({ key, label }) => (
                <div key={key}>
                  <div className="text-[12px] font-medium uppercase tracking-widest text-[var(--text-soft)]">
                    {label}
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">
                    {row.content[key]}
                  </p>
                </div>
              ))}

              <div className="flex items-center gap-2 border-t border-[var(--line-soft)] pt-3">
                <button
                  type="button"
                  onClick={() => { setDraft(row.content); setEditing(true); }}
                  className="inline-flex items-center gap-1.5 text-[13px] text-[var(--link)] transition-colors hover:text-[var(--link)]/70"
                >
                  Edit story
                </button>
                <span className="text-[var(--line-strong)]">·</span>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  className="inline-flex items-center gap-1.5 text-[13px] text-red-400/70 transition-colors hover:text-red-400 disabled:opacity-50"
                >
                  <Trash2 size={12} />
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StoryBankSection() {
  const navigate = useNavigate();
  const { stories, loading, error, reload, updateStory, deleteStory } = useStoryBank();

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteStory(id);
    },
    [deleteStory],
  );

  return (
    <GlassCard className="p-6">
      <div className="flex items-start justify-between gap-4">
        <SectionHeader icon={MessageSquare} label="Stories" title="Story Bank" />
        {stories.length > 0 && (
          <div className="shrink-0 rounded-full border border-[var(--link)]/20 bg-[var(--link)]/[0.07] px-2.5 py-0.5 text-[12px] text-[var(--link)]/80">
            {stories.length} {stories.length === 1 ? 'story' : 'stories'}
          </div>
        )}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-[var(--text-soft)]">
        STAR+R stories that accumulate across every interview prep session. Each new session builds
        on this bank instead of starting from scratch — existing stories are reframed for the
        current role, new ones are generated only for gaps.
      </p>

      {loading ? (
        <div className="mt-5 flex items-center gap-2 text-sm text-[var(--text-soft)]">
          <Loader2 size={16} className="animate-spin text-[var(--link)]" />
          Loading your story bank...
        </div>
      ) : error ? (
        <div className="mt-5 flex items-start gap-2 text-sm text-[var(--text-soft)]">
          <AlertCircle size={14} className="mt-0.5 shrink-0 text-[var(--badge-amber-text)]" />
          <div>
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void reload()}
              className="ml-2 text-[var(--link)] transition-colors hover:text-[var(--link)]/70"
            >
              Retry
            </button>
          </div>
        </div>
      ) : stories.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-[var(--text-soft)] mb-3">
            Interview stories you create during Interview Prep sessions will appear here. Each story follows the STAR+R framework and can be reused across applications.
          </p>
          <button onClick={() => navigate('/workspace?room=interview')} className="text-sm text-[var(--link)] hover:underline">
            Start Interview Prep →
          </button>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {stories.map((row) => (
            <StoryCard
              key={row.id}
              row={row}
              onDelete={handleDelete}
              onSave={updateStory}
            />
          ))}
        </div>
      )}
    </GlassCard>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

interface YourProfilePageProps {
  onGetDefaultResume?: () => Promise<MasterResume | null>;
  onNavigateResume?: () => void;
  careerProfile?: CareerProfileV2 | null;
}

export function YourProfilePage({
  onGetDefaultResume,
  onNavigateResume,
  careerProfile: _careerProfile = null,
}: YourProfilePageProps) {
  const { story, signals, updateField, hasStarted, lastSavedAt } = useWhyMeStory();
  const _navigate = useNavigate();
  const [whyMeSaved, setWhyMeSaved] = useState(false);
  const prevLastSavedAtRef = useRef<Date | null>(null);

  // Show "Saved" indicator briefly whenever lastSavedAt changes
  useEffect(() => {
    if (!lastSavedAt) return;
    if (prevLastSavedAtRef.current?.getTime() === lastSavedAt.getTime()) return;
    prevLastSavedAtRef.current = lastSavedAt;
    setWhyMeSaved(true);
    const t = setTimeout(() => setWhyMeSaved(false), 2500);
    return () => clearTimeout(t);
  }, [lastSavedAt]);

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-6 px-6 py-8">
      {/* Page title */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-strong)]">Career Vault</h1>
          <p className="mt-1 text-sm text-[var(--text-soft)]">
            Your career foundation. Everything here feeds into your resumes, cover letters, and interview prep. The stronger this vault, the better every tool works for you.
          </p>
        </div>
        <button
          type="button"
          onClick={() => _navigate('/profile-setup')}
          className="flex-shrink-0 rounded-[10px] border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2 text-[12px] font-semibold text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text-strong)]"
        >
          Re-run Career Assessment
        </button>
      </div>

      {/* Section A — Why-Me Story */}
      {hasStarted ? (
        // WhyMeStoryCard renders its own GlassCard
        <div>
          <div className="mb-3 flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-[var(--link)]/12 p-2">
                <BookOpen size={16} className="text-[var(--link)]" />
              </div>
              <div>
                <div className="text-[13px] font-medium uppercase tracking-widest text-[var(--link)]">Positioning</div>
                <h2 className="mt-0.5 text-sm font-semibold text-[var(--text-strong)]">
                  Your Why-Me Story
                </h2>
              </div>
            </div>
            {whyMeSaved && (
              <div className="flex items-center gap-1.5 text-[13px] text-[var(--badge-green-text)]">
                <CheckCircle2 size={13} />
                Saved
              </div>
            )}
          </div>
          <WhyMeStoryCard />
        </div>
      ) : (
        <GlassCard className="p-6">
          <div className="flex items-center justify-between gap-4">
            <SectionHeader icon={BookOpen} label="Positioning" title="Your Why-Me Story" />
            {whyMeSaved && (
              <div className="flex items-center gap-1.5 text-[13px] text-[var(--badge-green-text)] shrink-0">
                <CheckCircle2 size={13} />
                Saved
              </div>
            )}
          </div>
          <p className="mt-3 text-sm leading-relaxed text-[var(--text-soft)]">
            Three answers that define how Resume Builder, LinkedIn, Interview Prep, and every other
            tool frames your positioning. This is the most important section on this page.
          </p>
          <div className="mt-5">
            <WhyMeEngine story={story} signals={signals} onUpdate={updateField} />
          </div>
        </GlassCard>
      )}

      {/* Section B — Career Record */}
      <ResumeSection
        onGetDefaultResume={onGetDefaultResume}
        onNavigateResume={onNavigateResume}
      />

      {/* Section C — LinkedIn Profile */}
      <LinkedInSection />

      {/* Story Bank */}
      <StoryBankSection />
    </div>
  );
}
