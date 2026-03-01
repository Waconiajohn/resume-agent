import { useCallback, useEffect, useState } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { ExperienceCard } from '@/components/dashboard/ExperienceCard';
import { SkillsCategoryCard } from '@/components/dashboard/SkillsCategoryCard';
import { EditableField } from '@/components/dashboard/EditableField';
import type { MasterResume, MasterResumeListItem, MasterResumeExperience } from '@/types/resume';

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface MasterResumeTabProps {
  resumes: MasterResumeListItem[];
  loading: boolean;
  onLoadResumes: () => void;
  onGetDefaultResume: () => Promise<MasterResume | null>;
  onGetResumeById: (id: string) => Promise<MasterResume | null>;
  onUpdateMasterResume: (id: string, changes: Record<string, unknown>) => Promise<MasterResume | null>;
  onSetDefaultResume: (id: string) => Promise<boolean>;
  onDeleteResume: (id: string) => Promise<boolean>;
  onGetResumeHistory: (id: string) => Promise<Array<{ id: string; changes_summary: string; created_at: string }>>;
}

export function MasterResumeTab({
  resumes,
  loading,
  onLoadResumes,
  onGetDefaultResume,
  onGetResumeById,
  onUpdateMasterResume,
  onSetDefaultResume,
  onDeleteResume,
  onGetResumeHistory,
}: MasterResumeTabProps) {
  const [resume, setResume] = useState<MasterResume | null>(null);
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null);
  const [resumeLoading, setResumeLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<MasterResume | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{ id: string; changes_summary: string; created_at: string }>>([]);

  const loadResume = useCallback(async (id?: string | null) => {
    setResumeLoading(true);
    setSaveError(null);
    try {
      const data = id ? await onGetResumeById(id) : await onGetDefaultResume();
      setResume(data);
      setDraft(data ? structuredClone(data) : null);
      if (data) {
        setSelectedResumeId(data.id);
        const hist = await onGetResumeHistory(data.id);
        setHistory(hist);
      }
    } finally {
      setResumeLoading(false);
    }
  }, [onGetDefaultResume, onGetResumeById, onGetResumeHistory]);

  useEffect(() => {
    onLoadResumes();
    void loadResume();
  }, [onLoadResumes, loadResume]);

  const handleSelectResume = async (id: string) => {
    setIsEditing(false);
    await loadResume(id);
  };

  const handleSave = async () => {
    if (!draft || !resume) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await onUpdateMasterResume(resume.id, {
        summary: draft.summary,
        experience: draft.experience,
        skills: draft.skills,
        education: draft.education,
        certifications: draft.certifications,
        contact_info: draft.contact_info,
      });
      if (updated) {
        setResume(updated);
        setDraft(structuredClone(updated));
        setIsEditing(false);
        const hist = await onGetResumeHistory(updated.id);
        setHistory(hist);
      } else {
        setSaveError('Save failed. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDraft(resume ? structuredClone(resume) : null);
    setIsEditing(false);
    setSaveError(null);
  };

  const updateExperience = (index: number, updated: MasterResumeExperience) => {
    if (!draft) return;
    const experience = draft.experience.map((e, i) => i === index ? updated : e);
    setDraft({ ...draft, experience });
  };

  const deleteExperience = (index: number) => {
    if (!draft) return;
    const experience = draft.experience.filter((_, i) => i !== index);
    setDraft({ ...draft, experience });
  };

  const updateSkillCategory = (oldCategory: string, newCategory: string, skills: string[]) => {
    if (!draft) return;
    const updated = { ...draft.skills };
    if (oldCategory !== newCategory) {
      delete updated[oldCategory];
    }
    updated[newCategory] = skills;
    setDraft({ ...draft, skills: updated });
  };

  const deleteSkillCategory = (category: string) => {
    if (!draft) return;
    const updated = { ...draft.skills };
    delete updated[category];
    setDraft({ ...draft, skills: updated });
  };

  const updateSummary = (value: string) => {
    if (!draft) return;
    setDraft({ ...draft, summary: value });
  };

  if (loading && !resume) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <GlassCard key={i} className="p-4">
            <div className="h-4 w-2/3 animate-pulse rounded-lg bg-white/[0.05]" />
          </GlassCard>
        ))}
      </div>
    );
  }

  if (!resumeLoading && !resume) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-6 py-12 text-center">
        <p className="text-sm text-white/40">No master resume found.</p>
        <p className="mt-1 text-xs text-white/30">Complete a session and save your resume to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {resumes.length > 1 && (
            <select
              value={selectedResumeId ?? ''}
              onChange={(e) => void handleSelectResume(e.target.value)}
              className="rounded-lg border border-white/[0.12] bg-white/[0.05] px-3 py-1.5 text-xs text-white/80 outline-none focus:border-white/[0.22]"
            >
              {resumes.map((r) => (
                <option key={r.id} value={r.id}>
                  Version {r.version}{r.is_default ? ' (Default)' : ''}
                </option>
              ))}
            </select>
          )}
          {resume && (
            <div className="flex items-center gap-2 text-xs text-white/40">
              <span>v{resume.version}</span>
              <span>·</span>
              <span>Updated {timeAgo(resume.updated_at)}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <GlassButton variant="ghost" className="h-8 px-3 text-xs" onClick={handleCancel} disabled={saving}>
                Cancel
              </GlassButton>
              <GlassButton className="h-8 px-3 text-xs" onClick={handleSave} loading={saving}>
                Save Changes
              </GlassButton>
            </>
          ) : (
            <GlassButton variant="ghost" className="h-8 px-3 text-xs" onClick={() => setIsEditing(true)}>
              Edit
            </GlassButton>
          )}
        </div>
      </div>

      {saveError && (
        <div className="rounded-lg border border-red-300/28 bg-red-500/[0.08] px-4 py-2 text-xs text-red-100/90">
          {saveError}
        </div>
      )}

      {resumeLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/20 border-t-[#afc4ff]" />
        </div>
      ) : draft ? (
        <>
          {/* Contact Info */}
          {draft.contact_info && (
            <GlassCard className="p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/50">Contact</h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(['name', 'email', 'phone', 'linkedin', 'location'] as const).map((field) => (
                  <div key={field}>
                    <label className="mb-0.5 block text-[10px] uppercase tracking-wider text-white/35">
                      {field}
                    </label>
                    <EditableField
                      value={draft.contact_info?.[field] ?? ''}
                      onSave={(v) => setDraft({
                        ...draft,
                        contact_info: { ...draft.contact_info!, [field]: v },
                      })}
                      isEditing={isEditing}
                      placeholder={field}
                      className="text-sm"
                    />
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {/* Summary */}
          <GlassCard className="p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/50">Summary</h3>
            <EditableField
              value={draft.summary}
              onSave={updateSummary}
              isEditing={isEditing}
              placeholder="Professional summary..."
              multiline
              className="text-sm"
            />
          </GlassCard>

          {/* Experience */}
          {draft.experience.length > 0 && (
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/50">Experience</h3>
              <div className="space-y-2">
                {draft.experience.map((role, i) => (
                  <ExperienceCard
                    key={i}
                    role={role}
                    isEditing={isEditing}
                    onEdit={(updated) => updateExperience(i, updated)}
                    onDelete={isEditing ? () => deleteExperience(i) : undefined}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Skills */}
          {Object.keys(draft.skills).length > 0 && (
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/50">Skills</h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {Object.entries(draft.skills).map(([category, items]) => (
                  <SkillsCategoryCard
                    key={category}
                    category={category}
                    skills={Array.isArray(items) ? items : []}
                    isEditing={isEditing}
                    onEdit={(cat, skills) => updateSkillCategory(category, cat, skills)}
                    onDelete={isEditing ? () => deleteSkillCategory(category) : undefined}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Education */}
          {draft.education.length > 0 && (
            <GlassCard className="p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/50">Education</h3>
              <div className="space-y-2">
                {draft.education.map((edu, i) => (
                  <div key={i} className="text-sm text-white/80">
                    <span className="font-medium">{edu.degree}</span>
                    {edu.field && <span> in {edu.field}</span>}
                    {edu.institution && <span>, {edu.institution}</span>}
                    {edu.year && <span className="text-white/50"> ({edu.year})</span>}
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {/* Certifications */}
          {draft.certifications.length > 0 && (
            <GlassCard className="p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/50">Certifications</h3>
              <div className="space-y-1.5">
                {draft.certifications.map((cert, i) => (
                  <div key={i} className="text-sm text-white/80">
                    <span className="font-medium">{cert.name}</span>
                    {cert.issuer && <span className="text-white/55"> — {cert.issuer}</span>}
                    {cert.year && <span className="text-white/40"> ({cert.year})</span>}
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {/* Version history */}
          {history.length > 0 && !isEditing && (
            <GlassCard className="p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/50">Version History</h3>
              <div className="space-y-2">
                {history.map((entry) => (
                  <div key={entry.id} className="flex items-start justify-between gap-3">
                    <p className="text-xs text-white/70">{entry.changes_summary}</p>
                    <span className="shrink-0 text-xs text-white/35">{timeAgo(entry.created_at)}</span>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}
        </>
      ) : null}
    </div>
  );
}
