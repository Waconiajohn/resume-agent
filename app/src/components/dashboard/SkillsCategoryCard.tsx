import { useState } from 'react';
import { Trash2, Plus, X } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';

interface SkillsCategoryCardProps {
  category: string;
  skills: string[];
  isEditing?: boolean;
  onEdit?: (category: string, skills: string[]) => void;
  onDelete?: () => void;
}

export function SkillsCategoryCard({
  category,
  skills,
  isEditing = false,
  onEdit,
  onDelete,
}: SkillsCategoryCardProps) {
  const [newSkill, setNewSkill] = useState('');

  const handleRemoveSkill = (index: number) => {
    const updated = skills.filter((_, i) => i !== index);
    onEdit?.(category, updated);
  };

  const handleAddSkill = () => {
    const trimmed = newSkill.trim();
    if (!trimmed) return;
    onEdit?.(category, [...skills, trimmed]);
    setNewSkill('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddSkill();
    }
  };

  return (
    <GlassCard className="p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-white/70">{category}</h4>
        {isEditing && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center justify-center rounded-md p-1 text-white/30 transition-colors hover:text-red-400"
            aria-label={`Delete ${category} category`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {skills.map((skill, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-full border border-white/[0.1] bg-white/[0.05] px-2.5 py-0.5 text-xs text-white/75"
          >
            {skill}
            {isEditing && (
              <button
                type="button"
                onClick={() => handleRemoveSkill(i)}
                className="text-white/40 hover:text-red-400 transition-colors"
                aria-label={`Remove ${skill}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}

        {isEditing && (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={newSkill}
              onChange={(e) => setNewSkill(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add skill..."
              className="rounded-full border border-white/[0.12] bg-white/[0.05] px-2.5 py-0.5 text-xs text-white/80 placeholder-white/30 outline-none focus:border-white/[0.22] w-28"
            />
            <button
              type="button"
              onClick={handleAddSkill}
              className="inline-flex items-center justify-center rounded-full p-0.5 text-white/40 transition-colors hover:text-white/80"
              aria-label="Add skill"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </GlassCard>
  );
}
