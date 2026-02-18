import { useState } from 'react';
import { Tag, Check, MessageSquare, Pencil, X, ChevronDown, ChevronUp } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import { GlassButton } from '../GlassButton';
import { cleanText } from '@/lib/clean-text';
import type { LiveResumeData, SectionChange } from '@/types/panels';

interface LiveResumePanelProps {
  data: LiveResumeData;
  isProcessing?: boolean;
  onSendMessage?: (content: string) => void;
}

function sectionTitle(section: string): string {
  return section
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Parse proposed_content into lines (bullets and paragraphs), cleaning markdown artifacts */
function parseContentLines(content: string): string[] {
  return cleanText(content)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Detect if a line is a bullet point */
function isBullet(line: string): boolean {
  return /^\s*[•\-\*]\s/.test(line);
}

/** Strip bullet prefix for display */
function stripBulletPrefix(line: string): string {
  return line.replace(/^\s*[•\-\*]\s*/, '');
}

function EditableLine({
  line,
  index,
  section,
  editingIndex,
  editText,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onEditTextChange,
}: {
  line: string;
  index: number;
  section: string;
  editingIndex: number | null;
  editText: string;
  onStartEdit: (index: number, text: string) => void;
  onSaveEdit: (index: number) => void;
  onCancelEdit: () => void;
  onDelete: (index: number) => void;
  onEditTextChange: (text: string) => void;
}) {
  const isEditing = editingIndex === index;
  const bullet = isBullet(line);
  const displayText = bullet ? stripBulletPrefix(line) : line;

  if (isEditing) {
    return (
      <div className="group rounded-lg border border-white/[0.14] bg-white/[0.04] p-3">
        <textarea
          className="w-full resize-none rounded border border-white/[0.14] bg-white/[0.05] px-3 py-2 text-sm text-white/90 focus:border-white/[0.24] focus:outline-none"
          value={editText}
          onChange={(e) => onEditTextChange(e.target.value)}
          rows={3}
          autoFocus
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => onSaveEdit(index)}
            className="rounded border border-white/[0.14] bg-white/[0.08] px-3 py-1 text-xs font-medium text-white/85 transition-colors hover:bg-white/[0.12]"
          >
            Save
          </button>
          <button
            onClick={onCancelEdit}
            className="rounded bg-white/5 px-3 py-1 text-xs font-medium text-white/50 hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative rounded-lg px-3 py-2 hover:bg-white/[0.03] transition-colors">
      <div className="flex items-start gap-2">
        {bullet && (
          <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-white/40" />
        )}
        <p className="flex-1 text-sm leading-relaxed text-white/85">
          {displayText}
        </p>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={() => onStartEdit(index, displayText)}
            className="rounded p-1 text-white/30 hover:bg-white/10 hover:text-white/60 transition-colors"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDelete(index)}
            className="rounded p-1 text-white/30 transition-colors hover:bg-white/[0.1] hover:text-white/72"
            title="Remove"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ChangeBlock({
  change,
  index,
  section,
  disabled,
  onSendMessage,
}: {
  change: SectionChange;
  index: number;
  section: string;
  disabled?: boolean;
  onSendMessage?: (content: string) => void;
}) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 space-y-2">
      {change.original && (
        <div className="rounded border border-white/[0.1] bg-white/[0.03] px-3 py-2">
          <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wider text-white/56">
            Original
          </span>
          <p className="text-xs text-white/60 leading-relaxed line-through decoration-red-400/30 break-words">
            {cleanText(change.original)}
          </p>
        </div>
      )}
      {change.proposed && (
        <div className="rounded border border-white/[0.1] bg-white/[0.03] px-3 py-2">
          <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wider text-white/56">
            Proposed
          </span>
          <p className="text-xs text-white/80 leading-relaxed break-words">{cleanText(change.proposed)}</p>
        </div>
      )}
      {change.reasoning && (
        <p className="text-xs text-white/50 italic break-words">{cleanText(change.reasoning)}</p>
      )}
      {change.jd_requirements?.length > 0 && (
        <div className="space-y-1">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
            JD Alignment
          </span>
          <div className="flex flex-wrap gap-1">
            {change.jd_requirements.map((req, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-full border border-white/[0.12] bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/76"
                >
                  <Tag className="h-2.5 w-2.5" />
                  {req}
              </span>
            ))}
          </div>
        </div>
      )}
      {/* Per-change approve/reject */}
      {onSendMessage && (
        <div className="flex items-center gap-2 pt-1 border-t border-white/[0.06]">
          <button
            onClick={() => onSendMessage(`I approve change ${index + 1} in ${sectionTitle(section)}.`)}
            disabled={disabled}
            className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-white/78 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Check className="h-3 w-3" />
            Approve
          </button>
          <button
            onClick={() => onSendMessage(`I'd like to revise change ${index + 1} in ${sectionTitle(section)}. `)}
            disabled={disabled}
            className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-white/40 transition-colors hover:bg-white/5 hover:text-white/60 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <X className="h-3 w-3" />
            Revise
          </button>
        </div>
      )}
    </div>
  );
}

export function LiveResumePanel({ data, isProcessing, onSendMessage }: LiveResumePanelProps) {
  const active_section = data.active_section ?? '';
  const changes = data.changes ?? [];
  const proposedContent = data.proposed_content;

  const [showDiffs, setShowDiffs] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState('');

  // Build WYSIWYG content: prefer proposed_content, fall back to concatenating changes
  // Defensive: if proposed_content is a JSON string, extract the actual content
  let resolvedContent = proposedContent;
  if (typeof resolvedContent === 'string' && resolvedContent.trimStart().startsWith('{')) {
    try {
      const parsed = JSON.parse(resolvedContent);
      if (typeof parsed.proposed_content === 'string') {
        resolvedContent = parsed.proposed_content;
      }
    } catch {
      // Not valid JSON, use as-is
    }
  }
  const wysiwygContent = resolvedContent
    ?? changes.map((c) => c.proposed).filter(Boolean).join('\n\n');

  const contentLines = wysiwygContent ? parseContentLines(wysiwygContent) : [];

  const handleStartEdit = (index: number, text: string) => {
    setEditingIndex(index);
    setEditText(text);
  };

  const handleSaveEdit = (index: number) => {
    if (editText.trim() && onSendMessage) {
      onSendMessage(`Please update bullet ${index + 1} in ${sectionTitle(active_section)}: ${editText.trim()}`);
    }
    setEditingIndex(null);
    setEditText('');
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditText('');
  };

  const handleDelete = (index: number) => {
    onSendMessage?.(`Please remove bullet ${index + 1} from ${sectionTitle(active_section)}`);
  };

  const handleAccept = () => {
    onSendMessage?.(`I approve the proposed changes to the ${sectionTitle(active_section)} section. Please confirm and move on.`);
  };

  const handleRequestChanges = () => {
    onSendMessage?.(`I'd like some changes to the ${sectionTitle(active_section)} section. `);
  };

  return (
    <div data-panel-root className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-white/[0.12] px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-white/85">Resume Preview</span>
          <span className="rounded-full border border-white/[0.14] bg-white/[0.05] px-2.5 py-0.5 text-[10px] font-medium text-white/78">
            {sectionTitle(active_section)}
          </span>
        </div>
      </div>

      {/* WYSIWYG Resume Preview */}
      <div data-panel-scroll className="flex-1 overflow-y-auto p-4 space-y-3">
        {contentLines.length > 0 ? (
          <GlassCard className="p-5 space-y-1 bg-white/[0.03] border-white/[0.08]">
            {/* Section heading */}
            <h3 className="text-base font-semibold text-white/90 mb-3 pb-2 border-b border-white/[0.08]">
              {sectionTitle(active_section)}
            </h3>

            {/* Content lines with inline editing */}
            <div className="space-y-0.5">
              {contentLines.map((line, i) => (
                <EditableLine
                  key={i}
                  line={line}
                  index={i}
                  section={active_section}
                  editingIndex={editingIndex}
                  editText={editText}
                  onStartEdit={handleStartEdit}
                  onSaveEdit={handleSaveEdit}
                  onCancelEdit={handleCancelEdit}
                  onDelete={handleDelete}
                  onEditTextChange={setEditText}
                />
              ))}
            </div>
          </GlassCard>
        ) : (
          /* Fallback: show diff cards if no WYSIWYG content */
          changes.map((change, i) => (
            <ChangeBlock key={i} change={change} index={i} section={active_section} disabled={isProcessing} onSendMessage={onSendMessage} />
          ))
        )}

        {/* "View N Changes" toggle — collapsed by default */}
        {contentLines.length > 0 && changes.length > 0 && (
          <div>
            <button
              onClick={() => setShowDiffs(!showDiffs)}
              className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/60 transition-colors"
            >
              {showDiffs ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              View {changes.length} change{changes.length !== 1 ? 's' : ''}
            </button>
            {showDiffs && (
              <div className="mt-2 space-y-2">
                {changes.map((change, i) => (
                  <ChangeBlock key={i} change={change} index={i} section={active_section} disabled={isProcessing} onSendMessage={onSendMessage} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action bar */}
      {(contentLines.length > 0 || changes.length > 0) && onSendMessage && (
        <div className="border-t border-white/[0.12] px-4 py-3">
          <div className="flex items-center gap-2">
            <GlassButton variant="primary" className="flex-1" onClick={handleAccept} disabled={isProcessing}>
              <Check className="mr-1.5 h-3.5 w-3.5" />
              Approve All
            </GlassButton>
            <GlassButton variant="ghost" className="flex-1" onClick={handleRequestChanges} disabled={isProcessing}>
              <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
              Request Changes
            </GlassButton>
          </div>
        </div>
      )}
    </div>
  );
}
