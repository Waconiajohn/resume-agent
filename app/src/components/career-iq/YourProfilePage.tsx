/**
 * YourProfilePage
 *
 * Unified "Your Profile" page consolidating all "who you are" data:
 *   Section A — Why Me Story (positioning backbone)
 *   Section B — Master Resume (source of truth)
 *   Section C — Brand & Benchmark Assets (bio + case studies)
 *   Section D — LinkedIn Profile (public-facing summary)
 *   Section E — Proof Library (aggregated read-only + manual entry)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  FileText,
  Linkedin,
  Loader2,
  Plus,
  Save,
  Upload,
  X,
} from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { cn } from '@/lib/utils';
import { WhyMeStoryCard } from './WhyMeStoryCard';
import { WhyMeEngine } from './WhyMeEngine';
import { useWhyMeStory } from './useWhyMeStory';
import { useLinkedInProfile } from '@/hooks/useLinkedInProfile';
import { useEvidenceLibrary } from '@/hooks/useEvidenceLibrary';
import { ExecutiveBioRoom } from './ExecutiveBioRoom';
import { CaseStudyRoom } from './CaseStudyRoom';
import { extractResumeTextFromUpload } from '@/lib/resume-upload';
import type { MasterResume } from '@/types/resume';
import type { CareerProfileV2 } from '@/types/career-profile';

// ─── Source badge ─────────────────────────────────────────────────────────────

type EvidenceSource = 'resume' | 'why_me' | 'career_profile' | 'manual';

const SOURCE_LABELS: Record<EvidenceSource, string> = {
  resume: 'From Resume',
  why_me: 'From Why Me',
  career_profile: 'From Interview',
  manual: 'Manual Entry',
};

const SOURCE_COLORS: Record<EvidenceSource, string> = {
  resume: 'border-[#98b3ff]/20 bg-[#98b3ff]/10 text-[#98b3ff]/80',
  why_me: 'border-[#b5dec2]/20 bg-[#b5dec2]/10 text-[#b5dec2]/80',
  career_profile: 'border-[#f0d99f]/20 bg-[#f0d99f]/10 text-[#f0d99f]/80',
  manual: 'border-[var(--line-strong)] bg-[var(--accent-muted)] text-[var(--text-soft)]',
};

function SourceBadge({ source }: { source: EvidenceSource }) {
  return (
    <span
      className={cn(
        'rounded-md border px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] shrink-0',
        SOURCE_COLORS[source],
      )}
    >
      {SOURCE_LABELS[source]}
    </span>
  );
}

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
      <div className="rounded-lg bg-[#98b3ff]/12 p-2">
        <Icon size={16} className="text-[#98b3ff]" />
      </div>
      <div>
        <div className="text-[13px] font-medium uppercase tracking-widest text-[#98b3ff]/70">
          {label}
        </div>
        <h2 className="mt-0.5 text-sm font-semibold text-[var(--text-strong)]">{title}</h2>
      </div>
    </div>
  );
}

function ProfileBackboneCard() {
  return (
    <GlassCard className="p-4">
      <div>
        <div className="text-[13px] font-medium uppercase tracking-widest text-[#98b3ff]/70">
          Profile backbone
        </div>
        <h2 className="mt-2 text-base font-semibold text-[var(--text-strong)]">
          Keep your story, source resume, and benchmark proof aligned.
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-soft)]">
          Everything else on this page should support these three assets, not outrank them.
        </p>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-[#98b3ff]/18 bg-[#98b3ff]/[0.07] p-3.5">
          <div className="text-[12px] font-medium uppercase tracking-widest text-[#98b3ff]/75">
            Why Me
          </div>
          <div className="mt-2 text-sm font-semibold text-[var(--text-strong)]">
            Set the positioning story every tool should follow.
          </div>
        </div>
        <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-3.5">
          <div className="text-[12px] font-medium uppercase tracking-widest text-[var(--text-soft)]">
            Master Resume
          </div>
          <div className="mt-2 text-sm font-semibold text-[var(--text-strong)]">
            Keep the facts, chronology, and real proof grounded.
          </div>
        </div>
        <div className="rounded-xl border border-[#b5dec2]/18 bg-[#b5dec2]/[0.06] p-3.5">
          <div className="text-[12px] font-medium uppercase tracking-widest text-[#b5dec2]">
            Brand & Benchmark
          </div>
          <div className="mt-2 text-sm font-semibold text-[var(--text-strong)]">
            Turn the story into reusable assets and deeper proof.
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

// ─── Section A — Master Resume ────────────────────────────────────────────────

interface ResumeSectionProps {
  onGetDefaultResume?: () => Promise<MasterResume | null>;
  onNavigateResume?: () => void;
}

function ResumeSection({ onGetDefaultResume, onNavigateResume }: ResumeSectionProps) {
  const [resume, setResume] = useState<MasterResume | null>(null);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadAttemptedRef = useRef(false);

  // Load default resume once on mount — ref guards against double-runs
  useEffect(() => {
    if (!onGetDefaultResume || loadAttemptedRef.current) return;
    loadAttemptedRef.current = true;
    let cancelled = false;
    setResumeLoading(true);
    void onGetDefaultResume().then((r) => {
      if (!cancelled) {
        setResume(r);
        setResumeLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setResumeLoading(false);
    });
    return () => { cancelled = true; };
  }, [onGetDefaultResume]);

  const processFile = useCallback(async (file: File) => {
    setFileError(null);
    setFileLoading(true);
    try {
      const text = await extractResumeTextFromUpload(file);
      if (!text) {
        setFileError('No readable text found in this file.');
        return;
      }
      setFileName(file.name);
      // The page is read-only for MVP — file text is available but not uploaded
      // here. Direct user to Resume Builder to upload a new master resume.
      setFileError('To upload a new master resume, use Resume Builder above.');
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Failed to read file.');
    } finally {
      setFileLoading(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void processFile(file);
    },
    [processFile],
  );

  if (resumeLoading) {
    return (
      <GlassCard className="p-6">
        <SectionHeader icon={FileText} label="Section B" title="Your Master Resume" />
        <div className="mt-4 flex items-center gap-2 text-sm text-[var(--text-soft)]">
          <Loader2 size={16} className="animate-spin text-[#98b3ff]" />
          Loading your master resume...
        </div>
      </GlassCard>
    );
  }

  if (!resume) {
    // Empty state — drag-drop zone
    return (
      <GlassCard className="p-6">
        <SectionHeader icon={FileText} label="Section B" title="Your Master Resume" />
        <p className="mt-3 text-sm leading-relaxed text-[var(--text-soft)]">
          Your master resume is the source of truth for every tool in the workspace. Upload it once
          and every session starts with full context.
        </p>

        <div
          role="button"
          tabIndex={fileLoading ? -1 : 0}
          aria-label="Drop zone for resume file. Click to browse or drag and drop."
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
          onClick={() => !fileLoading && fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !fileLoading) {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className={cn(
            'mt-5 flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-all duration-200 select-none',
            isDragging
              ? 'border-[#afc4ff]/60 bg-[#afc4ff]/10 scale-[1.01]'
              : 'border-[var(--line-strong)] bg-[var(--accent-muted)] hover:border-[#afc4ff]/40 hover:bg-[#afc4ff]/[0.04]',
            fileLoading && 'pointer-events-none opacity-60',
          )}
        >
          {fileLoading ? (
            <>
              <Loader2 className="h-8 w-8 text-[#afc4ff] motion-safe:animate-spin" />
              <p className="text-sm text-[var(--text-soft)]">Reading file...</p>
            </>
          ) : (
            <>
              <div
                className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-xl border transition-colors duration-200',
                  isDragging
                    ? 'border-[#afc4ff]/40 bg-[#afc4ff]/10'
                    : 'border-[var(--line-strong)] bg-[var(--surface-1)]',
                )}
              >
                <Upload
                  className={cn(
                    'h-6 w-6 transition-colors duration-200',
                    isDragging ? 'text-[#afc4ff]' : 'text-[var(--text-soft)]',
                  )}
                />
              </div>
              <div className="text-center">
                <p
                  className={cn(
                    'text-sm font-medium transition-colors duration-200',
                    isDragging ? 'text-[#afc4ff]' : 'text-[var(--text-strong)]',
                  )}
                >
                  {isDragging ? 'Drop your resume here' : 'Upload your master resume to get started'}
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-soft)]">
                  PDF, Word, or plain text — or go to Resume Builder to upload
                </p>
              </div>
            </>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.doc,.txt"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void processFile(file);
            e.target.value = '';
          }}
        />

        {fileError && (
          <div className="mt-3 flex items-start gap-2 text-sm text-[var(--text-soft)]">
            <AlertCircle size={14} className="mt-0.5 shrink-0 text-amber-400" />
            <span>{fileError}</span>
          </div>
        )}

        {onNavigateResume && (
          <div className="mt-4">
            <button
              type="button"
              onClick={onNavigateResume}
              className="inline-flex items-center gap-1.5 text-[13px] text-[#98b3ff] transition-colors hover:text-[#98b3ff]/70"
            >
              Go to Resume Builder to upload
              <ExternalLink size={12} />
            </button>
          </div>
        )}
      </GlassCard>
    );
  }

  // Resume exists — compact summary view
  const contact = resume.contact_info;
  const experienceCount = resume.experience.length;
  const skillGroupCount = Object.keys(resume.skills).length;
  const summaryPreview = resume.summary
    ? resume.summary.slice(0, 200) + (resume.summary.length > 200 ? '…' : '')
    : '';

  return (
    <GlassCard className="p-6">
      <div className="flex items-start justify-between gap-4">
        <SectionHeader icon={FileText} label="Section B" title="Your Master Resume" />
        <div className="flex items-center gap-2 shrink-0">
          {onNavigateResume && (
            <GlassButton variant="ghost" size="sm" onClick={onNavigateResume}>
              <ExternalLink size={13} className="mr-1" />
              View Full Resume
            </GlassButton>
          )}
        </div>
      </div>

      {/* Contact row */}
      {contact && (
        <div className="mt-4 rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4">
          <div className="flex flex-wrap items-start gap-4">
            {contact.name && (
              <div>
                <div className="text-[13px] font-medium uppercase tracking-widest text-[var(--text-soft)]">
                  Name
                </div>
                <div className="mt-1 text-sm font-semibold text-[var(--text-strong)]">
                  {contact.name}
                </div>
              </div>
            )}
            {contact.email && (
              <div>
                <div className="text-[13px] font-medium uppercase tracking-widest text-[var(--text-soft)]">
                  Email
                </div>
                <div className="mt-1 text-sm text-[var(--text-muted)]">{contact.email}</div>
              </div>
            )}
            {contact.phone && (
              <div>
                <div className="text-[13px] font-medium uppercase tracking-widest text-[var(--text-soft)]">
                  Phone
                </div>
                <div className="mt-1 text-sm text-[var(--text-muted)]">{contact.phone}</div>
              </div>
            )}
            {contact.linkedin && (
              <div>
                <div className="text-[13px] font-medium uppercase tracking-widest text-[var(--text-soft)]">
                  LinkedIn
                </div>
                <div className="mt-1 text-sm text-[var(--text-muted)]">{contact.linkedin}</div>
              </div>
            )}
          </div>
        </div>
      )}

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
          <div className="rounded-md border border-[#b5dec2]/20 bg-[#b5dec2]/[0.05] px-3 py-2">
            <span className="text-[13px] text-[#b5dec2]/80">
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
            className="text-[13px] text-[#98b3ff] transition-colors hover:text-[#98b3ff]/70"
          >
            Upload a new version in Resume Builder
          </button>
        </div>
      )}

      {fileName && (
        <div className="mt-3 flex items-center gap-2 text-[13px] text-[var(--text-soft)]">
          <CheckCircle2 size={14} className="text-[#b5dec2]" />
          {fileName} read successfully
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
      <SectionHeader icon={Linkedin} label="Section D" title="LinkedIn Profile" />
      <p className="mt-3 text-sm leading-relaxed text-[var(--text-soft)]">
        Your headline and About section should read like the public version of your Why Me Story.
        LinkedIn Studio uses this as supporting context, not as a separate identity.
      </p>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-[var(--text-soft)]">
          <Loader2 size={16} className="animate-spin text-[#98b3ff]" />
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
                'focus:border-[#98b3ff]/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#98b3ff]/35',
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
              placeholder="Paste your full LinkedIn About section here. This gives the AI the same first impression a recruiter gets before your resume."
              rows={8}
              className={cn(
                'mt-2 w-full resize-y rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3',
                'text-sm leading-relaxed text-[var(--text-strong)] placeholder:text-[var(--text-soft)]',
                'focus:border-[#98b3ff]/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#98b3ff]/35',
              )}
            />
            {profile.about.trim().length > 0 && (
              <p className="mt-1 text-[12px] text-[var(--text-soft)]">
                {profile.about.trim().length} characters
              </p>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-300">
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
              <div className="flex items-center gap-1.5 text-[13px] text-[#b5dec2]">
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

// ─── Section D — Evidence Library ─────────────────────────────────────────────

interface EvidenceLibrarySectionProps {
  onGetDefaultResume?: () => Promise<MasterResume | null>;
  careerProfile: CareerProfileV2 | null;
}

function EvidenceLibrarySection({
  onGetDefaultResume,
  careerProfile,
}: EvidenceLibrarySectionProps) {
  const { story } = useWhyMeStory();
  const { items, loading, addManualItem } = useEvidenceLibrary({
    onGetDefaultResume,
    whyMeStory: story,
    careerProfile,
  });
  const [newItemText, setNewItemText] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  const handleAdd = () => {
    if (!newItemText.trim()) return;
    addManualItem(newItemText.trim());
    setNewItemText('');
    setShowAddForm(false);
  };

  return (
    <GlassCard className="p-6">
      <div className="flex items-start justify-between gap-4">
        <SectionHeader icon={BookOpen} label="Section E" title="Proof Library" />
        <button
          type="button"
          onClick={() => setShowAddForm((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-1.5 text-[13px] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text-strong)] shrink-0"
          aria-expanded={showAddForm}
        >
          <Plus size={13} />
          Add
        </button>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-[var(--text-soft)]">
        Everything the AI knows about your accomplishments and positioning, aggregated from all
        your profile sources. Use this as the supporting proof base behind your Why Me Story and benchmark assets.
      </p>

      {showAddForm && (
        <div className="mt-4 rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4">
          <label
            htmlFor="new-evidence-item"
            className="text-[13px] font-medium uppercase tracking-widest text-[var(--text-soft)]"
          >
            Add accomplishment
          </label>
          <textarea
            id="new-evidence-item"
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            placeholder="Describe a specific accomplishment, capability, or proof point. Be concrete — include scope, scale, and result."
            rows={3}
            className={cn(
              'mt-2 w-full resize-y rounded-xl border border-[var(--line-soft)] bg-black/20 px-3 py-2.5',
              'text-sm leading-relaxed text-[var(--text-strong)] placeholder:text-[var(--text-soft)]',
              'focus:border-[#98b3ff]/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#98b3ff]/35',
            )}
          />
          <div className="mt-2 flex items-center gap-2">
            <GlassButton
              variant="primary"
              size="sm"
              onClick={handleAdd}
              disabled={!newItemText.trim()}
            >
              Add to library
            </GlassButton>
            <button
              type="button"
              onClick={() => { setShowAddForm(false); setNewItemText(''); }}
              className="rounded-md p-1.5 text-[var(--text-soft)] transition-colors hover:text-[var(--text-muted)]"
              aria-label="Cancel"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-[var(--text-soft)]">
          <Loader2 size={16} className="animate-spin text-[#98b3ff]" />
          Loading evidence...
        </div>
      ) : items.length === 0 ? (
        <div className="mt-4 rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-[var(--accent-muted)] p-2">
              <BookOpen size={14} className="text-[var(--text-soft)]" />
            </div>
            <div>
              <div className="text-sm font-medium text-[var(--text-soft)]">No evidence yet</div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--text-soft)]">
                Complete the Why Me Story below, run a Resume Builder session, or use the Career
                Profile assessment to populate your evidence library automatically.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-3 rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-relaxed text-[var(--text-muted)]">{item.text}</p>
                {item.category && (
                  <p className="mt-1 text-[12px] text-[var(--text-soft)]">{item.category}</p>
                )}
              </div>
              <SourceBadge source={item.source as EvidenceSource} />
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}

// ─── Section E — Brand & Proof Assets ────────────────────────────────────────

type BrandAssetFocus = 'overview' | 'bio' | 'case-study';

function getBrandAssetFocus(initialFocus?: string): BrandAssetFocus {
  if (initialFocus === 'bio') return 'bio';
  if (initialFocus === 'case-study') return 'case-study';
  return 'overview';
}

function BrandProofAssetsSection({ initialFocus }: { initialFocus?: string }) {
  const [activeAsset, setActiveAsset] = useState<BrandAssetFocus>(getBrandAssetFocus(initialFocus));

  useEffect(() => {
    setActiveAsset(getBrandAssetFocus(initialFocus));
  }, [initialFocus]);

  const showBio = activeAsset === 'bio';
  const showCaseStudy = activeAsset === 'case-study';

  return (
    <div className="space-y-4">
      <GlassCard className="p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <SectionHeader icon={BookOpen} label="Section C" title="Brand & Benchmark Assets" />
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-soft)]">
              Turn your core story into reusable bios and deeper proof without drifting away from
              your Why Me Story or master resume.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <GlassButton
              variant={activeAsset === 'overview' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setActiveAsset('overview')}
            >
              Overview
            </GlassButton>
            <GlassButton
              variant={showBio ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setActiveAsset('bio')}
            >
              Bio Builder
            </GlassButton>
            <GlassButton
              variant={showCaseStudy ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setActiveAsset('case-study')}
            >
              Case Studies
            </GlassButton>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4">
            <div className="text-[13px] font-medium uppercase tracking-widest text-[var(--text-soft)]">
              Bio Builder
            </div>
            <div className="mt-2 text-sm font-semibold text-[var(--text-strong)]">
              Build the short narrative version people reuse in intros, boards, and LinkedIn.
            </div>
          </div>
          <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4">
            <div className="text-[13px] font-medium uppercase tracking-widest text-[var(--text-soft)]">
              Case Studies
            </div>
            <div className="mt-2 text-sm font-semibold text-[var(--text-strong)]">
              Turn your strongest wins into deeper proof that supports the same benchmark story.
            </div>
          </div>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-[var(--text-soft)]">
          Start with the short-form bio, then deepen the proof once the core story is stable.
        </p>

        {activeAsset === 'overview' ? (
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            <button
              type="button"
              onClick={() => setActiveAsset('bio')}
              className="rounded-xl border border-[var(--line-soft)] bg-black/10 p-4 text-left transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-1)]"
            >
              <div className="text-[13px] font-medium uppercase tracking-widest text-[#98b3ff]/70">
                Open first
              </div>
              <div className="mt-2 text-sm font-semibold text-[var(--text-strong)]">
                Build the bio version of your story
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-[var(--text-soft)]">
                Create the concise narrative people reuse most often across introductions and public-facing materials.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setActiveAsset('case-study')}
              className="rounded-xl border border-[var(--line-soft)] bg-black/10 p-4 text-left transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-1)]"
            >
              <div className="text-[13px] font-medium uppercase tracking-widest text-[#98b3ff]/70">
                Then build
              </div>
              <div className="mt-2 text-sm font-semibold text-[var(--text-strong)]">
                Turn your strongest wins into deeper proof
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-[var(--text-soft)]">
                Add longer proof narratives once the identity story is clear enough to anchor them.
              </p>
            </button>
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-[var(--line-soft)] bg-black/10 p-4">
            <div className="text-[13px] font-medium uppercase tracking-widest text-[var(--text-soft)]">
              Current focus
            </div>
            <div className="mt-2 text-sm font-semibold text-[var(--text-strong)]">
              {showBio ? 'Bio Builder' : 'Case Studies'}
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-[var(--text-soft)]">
              {showBio
                ? 'Keep this aligned with your Why Me Story and LinkedIn so people get the same operator every time they encounter you.'
                : 'Use this to deepen the proof behind your benchmark story, not to create a separate persona.'}
            </p>
          </div>
        )}
      </GlassCard>

      {showBio ? <ExecutiveBioRoom /> : null}
      {showCaseStudy ? <CaseStudyRoom /> : null}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

interface YourProfilePageProps {
  onGetDefaultResume?: () => Promise<MasterResume | null>;
  onNavigateResume?: () => void;
  careerProfile?: CareerProfileV2 | null;
  initialFocus?: string;
}

export function YourProfilePage({
  onGetDefaultResume,
  onNavigateResume,
  careerProfile = null,
  initialFocus,
}: YourProfilePageProps) {
  const { story, signals, updateField, hasStarted } = useWhyMeStory();

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-6 px-6 py-8">
      {/* Page title */}
      <div>
        <h1 className="text-xl font-semibold text-[var(--text-strong)]">Your Profile</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-soft)]">
          Keep your positioning story, master resume, and proof base aligned here so every other
          workspace tool starts from the same foundation.
        </p>
      </div>

      <ProfileBackboneCard />

      {/* Section A — Why Me Story */}
      {hasStarted ? (
        // WhyMeStoryCard renders its own GlassCard
        <div>
          <div className="mb-3 flex items-center gap-2 px-1">
            <div className="rounded-lg bg-[#98b3ff]/12 p-2">
              <BookOpen size={16} className="text-[#98b3ff]" />
            </div>
            <div>
              <div className="text-[13px] font-medium uppercase tracking-widest text-[#98b3ff]/70">Section A</div>
              <h2 className="mt-0.5 text-sm font-semibold text-[var(--text-strong)]">
                Your Why Me Story
              </h2>
            </div>
          </div>
          <WhyMeStoryCard />
        </div>
      ) : (
        <GlassCard className="p-6">
          <SectionHeader icon={BookOpen} label="Section A" title="Your Why Me Story" />
          <p className="mt-3 text-sm leading-relaxed text-[var(--text-soft)]">
            Three answers that define how Resume Builder, LinkedIn, Interview Prep, and every other
            tool frames your positioning. This is the most important section on this page.
          </p>
          <div className="mt-5">
            <WhyMeEngine story={story} signals={signals} onUpdate={updateField} />
          </div>
        </GlassCard>
      )}

      {/* Section B — Master Resume */}
      <ResumeSection
        onGetDefaultResume={onGetDefaultResume}
        onNavigateResume={onNavigateResume}
      />

      {/* Section C — Brand & Benchmark Assets */}
      <BrandProofAssetsSection initialFocus={initialFocus} />

      {/* Section D — LinkedIn Profile */}
      <LinkedInSection />

      {/* Section E — Proof Library */}
      <EvidenceLibrarySection
        onGetDefaultResume={onGetDefaultResume}
        careerProfile={careerProfile}
      />
    </div>
  );
}
