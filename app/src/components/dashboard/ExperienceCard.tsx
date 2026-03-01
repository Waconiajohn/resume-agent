import { useState } from 'react';
import { ChevronDown, ChevronUp, Trash2, Plus } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { EditableField } from '@/components/dashboard/EditableField';
import type { MasterResumeExperience } from '@/types/resume';

interface ExperienceCardProps {
  role: MasterResumeExperience;
  isEditing?: boolean;
  onEdit?: (updated: MasterResumeExperience) => void;
  onDelete?: () => void;
}

export function ExperienceCard({ role, isEditing = false, onEdit, onDelete }: ExperienceCardProps) {
  const [expanded, setExpanded] = useState(false);

  const updateField = (field: keyof MasterResumeExperience, value: string) => {
    onEdit?.({ ...role, [field]: value });
  };

  const updateBullet = (index: number, text: string) => {
    const bullets = role.bullets.map((b, i) => i === index ? { ...b, text } : b);
    onEdit?.({ ...role, bullets });
  };

  const deleteBullet = (index: number) => {
    const bullets = role.bullets.filter((_, i) => i !== index);
    onEdit?.({ ...role, bullets });
  };

  const addBullet = () => {
    const bullets = [...role.bullets, { text: '', source: 'crafted' }];
    onEdit?.({ ...role, bullets });
  };

  return (
    <GlassCard className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <EditableField
              value={role.title}
              onSave={(v) => updateField('title', v)}
              isEditing={isEditing}
              placeholder="Job Title"
              className="text-sm font-medium"
            />
            <span className="text-white/40 text-xs">at</span>
            <EditableField
              value={role.company}
              onSave={(v) => updateField('company', v)}
              isEditing={isEditing}
              placeholder="Company"
              className="text-sm font-medium"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap text-xs text-white/50">
            <EditableField
              value={role.start_date}
              onSave={(v) => updateField('start_date', v)}
              isEditing={isEditing}
              placeholder="Start date"
            />
            <span>–</span>
            <EditableField
              value={role.end_date}
              onSave={(v) => updateField('end_date', v)}
              isEditing={isEditing}
              placeholder="End date"
            />
            {role.location && (
              <>
                <span className="text-white/30">·</span>
                <EditableField
                  value={role.location}
                  onSave={(v) => updateField('location', v)}
                  isEditing={isEditing}
                  placeholder="Location"
                />
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {isEditing && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center justify-center rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/[0.08] hover:text-red-400"
              aria-label="Delete role"
              title="Delete role"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center justify-center rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white/70"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-1.5 border-t border-white/[0.06] pt-3">
          {role.bullets.map((bullet, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-1 text-white/30 text-xs">•</span>
              <div className="flex-1">
                <EditableField
                  value={bullet.text}
                  onSave={(v) => updateBullet(i, v)}
                  isEditing={isEditing}
                  placeholder="Bullet point..."
                  multiline
                  className="text-xs"
                />
              </div>
              {isEditing && (
                <button
                  type="button"
                  onClick={() => deleteBullet(i)}
                  className="mt-1 inline-flex items-center justify-center rounded-md p-1 text-white/30 transition-colors hover:text-red-400"
                  aria-label="Delete bullet"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
          {isEditing && (
            <button
              type="button"
              onClick={addBullet}
              className="mt-2 flex items-center gap-1 text-xs text-white/40 transition-colors hover:text-white/70"
            >
              <Plus className="h-3 w-3" />
              Add bullet
            </button>
          )}
        </div>
      )}
    </GlassCard>
  );
}
