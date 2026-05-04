import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { ExperienceCard } from '@/components/dashboard/ExperienceCard';
import { SkillsCategoryCard } from '@/components/dashboard/SkillsCategoryCard';
import { EditableField } from '@/components/dashboard/EditableField';
import type { MasterResume, MasterResumeListItem, MasterResumeExperience, MasterResumeEvidenceItem } from '@/types/resume';
import type { CoachSession } from '@/types/session';

const SOURCE_BADGE: Record<MasterResumeEvidenceItem['source'], { label: string; classes: string }> = {
  crafted: { label: 'Crafted', classes: 'bg-[var(--badge-blue-bg)] text-[var(--badge-blue-text)] border-[var(--badge-blue-text)]/30' },
  upgraded: { label: 'Upgraded', classes: 'bg-[var(--badge-green-bg)] text-[var(--badge-green-text)] border-[var(--badge-green-text)]/30' },
  interview: { label: 'Interview', classes: 'bg-[var(--badge-amber-bg)] text-[var(--badge-amber-text)] border-[var(--badge-amber-text)]/30' },
};

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
  sessions?: CoachSession[];
}

/** Match evidence items to experience entries by looking up the session's company_name */
function buildEvidenceByCompany(
  evidence: MasterResumeEvidenceItem[],
  experience: MasterResumeExperience[],
  sessions: CoachSession[],
): { byRole: Map<number, MasterResumeEvidenceItem[]>; unmatched: MasterResumeEvidenceItem[] } {
  const sessionMap = new Map(sessions.map(s => [s.id, s]));
  const byRole = new Map<number, MasterResumeEvidenceItem[]>();
  const unmatched: MasterResumeEvidenceItem[] = [];

  for (const item of evidence) {
    const session = sessionMap.get(item.source_session_id);
    const companyName = session?.company_name?.toLowerCase().trim();
    let matched = false;

    if (companyName) {
      const roleIndex = experience.findIndex(
        r => r.company.toLowerCase().trim() === companyName,
      );
      if (roleIndex >= 0) {
        const existing = byRole.get(roleIndex) ?? [];
        existing.push(item);
        byRole.set(roleIndex, existing);
        matched = true;
      }
    }

    if (!matched) {
      unmatched.push(item);
    }
  }

  return { byRole, unmatched };
}

export function MasterResumeTab({
  resumes,
  loading,
  onLoadResumes,
  onGetDefaultResume,
  onGetResumeById,
  onUpdateMasterResume,
  onSetDefaultResume: _onSetDefaultResume,
  onDeleteResume: _onDeleteResume,
  onGetResumeHistory,
  sessions = [],
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

  const deleteEvidence = async (evidenceIndex: number) => {
    if (!resume) return;
    const updatedItems = resume.evidence_items.filter((_, i) => i !== evidenceIndex);
    const updated = await onUpdateMasterResume(resume.id, { evidence_items: updatedItems });
    if (updated) {
      setResume(updated);
      setDraft(structuredClone(updated));
    }
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
            <div className="h-4 w-2/3 motion-safe:animate-pulse rounded-lg bg-[var(--accent-muted)]" />
          </GlassCard>
        ))}
      </div>
    );
  }

  if (!resumeLoading && !resume) {
    return (
      <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-6 py-12 text-center">
        <p className="text-sm text-[var(--text-soft)]">No achievement proof found.</p>
        <p className="mt-1 text-xs text-[var(--text-soft)]">Complete an application and save your resume to get started.</p>
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
              className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-1.5 text-xs text-[var(--text-muted)] outline-none focus:border-[var(--line-strong)]"
            >
              {resumes.map((r) => (
                <option key={r.id} value={r.id}>
                  Version {r.version}{r.is_default ? ' (Default)' : ''}
                </option>
              ))}
            </select>
          )}
          {resume && (
            <div className="flex items-center gap-2 text-xs text-[var(--text-soft)]">
              <span>v{resume.version}</span>
              <span>·</span>
              <span>Updated {timeAgo(resume.updated_at)}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <GlassButton variant="ghost" size="sm" className="h-8" onClick={handleCancel} disabled={saving}>
                Cancel
              </GlassButton>
              <GlassButton size="sm" className="h-8" onClick={handleSave} loading={saving}>
                Save Changes
              </GlassButton>
            </>
          ) : (
            <GlassButton variant="ghost" size="sm" className="h-8" onClick={() => setIsEditing(true)}>
              Edit
            </GlassButton>
          )}
        </div>
      </div>

      {saveError && (
        <div className="rounded-lg border border-[var(--badge-red-text)]/28 bg-[var(--badge-red-bg)] px-4 py-2 text-xs text-[var(--badge-red-text)]/90">
          {saveError}
        </div>
      )}

      {resumeLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-7 w-7 motion-safe:animate-spin rounded-full border-2 border-[var(--line-strong)] border-t-[var(--link)]" />
        </div>
      ) : draft ? (
        <>
          {/* Contact Info */}
          {draft.contact_info && (
            <GlassCard className="p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">Contact</h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(['name', 'email', 'phone', 'linkedin', 'location'] as const).map((field) => (
                  <div key={field}>
                    <label className="mb-0.5 block text-[12px] uppercase tracking-wider text-[var(--text-soft)]">
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
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">Summary</h3>
            <EditableField
              value={draft.summary}
              onSave={updateSummary}
              isEditing={isEditing}
              placeholder="Professional summary..."
              multiline
              className="text-sm"
            />
          </GlassCard>

          {/* Experience + Evidence */}
          {draft.experience.length > 0 && (() => {
            const { byRole, unmatched } = buildEvidenceByCompany(
              resume?.evidence_items ?? [],
              draft.experience,
              sessions,
            );
            return (
              <div>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">Experience</h3>
                <div className="space-y-2">
                  {draft.experience.map((role, i) => {
                    const roleEvidence = byRole.get(i) ?? [];
                    return (
                      <div key={i}>
                        <ExperienceCard
                          role={role}
                          isEditing={isEditing}
                          onEdit={(updated) => updateExperience(i, updated)}
                          onDelete={isEditing ? () => deleteExperience(i) : undefined}
                        />
                        {roleEvidence.length > 0 && (
                          <div className="ml-4 mt-1 mb-2 space-y-1">
                            <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">Evidence ({roleEvidence.length})</span>
                            {roleEvidence.map((item) => {
                              const originalIndex = (resume?.evidence_items ?? []).indexOf(item);
                              const badge = SOURCE_BADGE[item.source] ?? SOURCE_BADGE.crafted;
                              return (
                                <div key={originalIndex} className="flex items-start gap-2 rounded-lg bg-[var(--accent-muted)] border border-[var(--line-soft)] px-3 py-2">
                                  <p className="flex-1 min-w-0 text-xs leading-relaxed text-[var(--text-muted)]">{item.text}</p>
                                  <span className={cn('shrink-0 rounded-md border px-2.5 py-1 text-[12px] font-semibold uppercase tracking-[0.12em]', badge.classes)}>
                                    {badge.label}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => void deleteEvidence(originalIndex)}
                                    className="shrink-0 inline-flex items-center justify-center rounded-md p-1 text-[var(--text-soft)] transition-colors hover:text-[var(--badge-red-text)]"
                                    aria-label="Delete evidence"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Unmatched evidence */}
                {unmatched.length > 0 && (
                  <div className="mt-4">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">Unassigned Evidence ({unmatched.length})</h3>
                    <div className="space-y-1">
                      {unmatched.map((item) => {
                        const originalIndex = (resume?.evidence_items ?? []).indexOf(item);
                        const badge = SOURCE_BADGE[item.source] ?? SOURCE_BADGE.crafted;
                        return (
                          <div key={originalIndex} className="flex items-start gap-2 rounded-lg bg-[var(--accent-muted)] border border-[var(--line-soft)] px-3 py-2">
                            <p className="flex-1 min-w-0 text-xs leading-relaxed text-[var(--text-muted)]">{item.text}</p>
                            <span className={cn('shrink-0 rounded-md border px-2.5 py-1 text-[12px] font-semibold uppercase tracking-[0.12em]', badge.classes)}>
                              {badge.label}
                            </span>
                            {item.category && (
                              <span className="shrink-0 rounded-md border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-soft)]">
                                {item.category}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => void deleteEvidence(originalIndex)}
                              className="shrink-0 inline-flex items-center justify-center rounded-md p-1 text-[var(--text-soft)] transition-colors hover:text-[var(--badge-red-text)]"
                              aria-label="Delete evidence"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Skills */}
          {Object.keys(draft.skills).length > 0 && (
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">Skills</h3>
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
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">Education</h3>
              <div className="space-y-2">
                {draft.education.map((edu, i) => (
                  <div key={i} className="text-sm text-[var(--text-muted)]">
                    <span className="font-medium">{edu.degree}</span>
                    {edu.field && <span> in {edu.field}</span>}
                    {edu.institution && <span>, {edu.institution}</span>}
                    {edu.year && <span className="text-[var(--text-soft)]"> ({edu.year})</span>}
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {/* Certifications */}
          {draft.certifications.length > 0 && (
            <GlassCard className="p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">Certifications</h3>
              <div className="space-y-1.5">
                {draft.certifications.map((cert, i) => (
                  <div key={i} className="text-sm text-[var(--text-muted)]">
                    <span className="font-medium">{cert.name}</span>
                    {cert.issuer && <span className="text-[var(--text-soft)]"> — {cert.issuer}</span>}
                    {cert.year && <span className="text-[var(--text-soft)]"> ({cert.year})</span>}
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {/* Version history */}
          {history.length > 0 && !isEditing && (
            <GlassCard className="p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">Version History</h3>
              <div className="space-y-2">
                {history.map((entry) => (
                  <div key={entry.id} className="flex items-start justify-between gap-3">
                    <p className="text-xs text-[var(--text-muted)]">{entry.changes_summary}</p>
                    <span className="shrink-0 text-xs text-[var(--text-soft)]">{timeAgo(entry.created_at)}</span>
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
