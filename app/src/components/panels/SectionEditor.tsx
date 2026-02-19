import { useState } from 'react';
import { Save, X } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import { GlassButton } from '../GlassButton';
import { GlassTextarea } from '../GlassInput';

interface SectionEditorProps {
  content: string;
  section: string;
  onSave: (editedContent: string) => void;
  onCancel: () => void;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
}

export function SectionEditor({ content, section, onSave, onCancel }: SectionEditorProps) {
  const [value, setValue] = useState(content);
  const words = wordCount(value);
  const sectionLabel = section.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <GlassCard className="p-5 space-y-3 bg-white/[0.03] border-white/[0.08]">
      <GlassTextarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={12}
        className="w-full resize-y"
        aria-label={`Edit ${sectionLabel} section content`}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/40">{words} {words === 1 ? 'word' : 'words'}</span>
        <div className="flex items-center gap-2">
          <GlassButton variant="ghost" onClick={onCancel}>
            <X className="mr-1.5 h-3.5 w-3.5" />
            Cancel
          </GlassButton>
          <GlassButton variant="primary" onClick={() => onSave(value)} disabled={!value.trim()}>
            <Save className="mr-1.5 h-3.5 w-3.5" />
            Save
          </GlassButton>
        </div>
      </div>
    </GlassCard>
  );
}
