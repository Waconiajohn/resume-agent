import { useState, useEffect, useCallback } from 'react';
import { Check, Pencil } from 'lucide-react';
import { GlassButton } from '../GlassButton';
import { WorkbenchProgressDots } from './workbench/WorkbenchProgressDots';
import { WorkbenchContentEditor } from './workbench/WorkbenchContentEditor';
import { WorkbenchActionChips } from './workbench/WorkbenchActionChips';
import { WorkbenchEvidenceCards, type EvidenceItem } from './workbench/WorkbenchEvidenceCards';
import { WorkbenchKeywordBar } from './workbench/WorkbenchKeywordBar';
import { cn } from '@/lib/utils';
import type { SectionWorkbenchContext } from '@/types/panels';

export type { SectionWorkbenchContext };

interface SectionWorkbenchProps {
  section: string;
  content: string;
  context: SectionWorkbenchContext | null;
  onApprove: () => void;
  onRequestChanges: (feedback: string) => void;
  onDirectEdit: (editedContent: string) => void;
}

function toTitleCase(str: string): string {
  return str
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SectionWorkbench({
  section,
  content,
  context,
  onApprove,
  onRequestChanges,
  onDirectEdit,
}: SectionWorkbenchProps) {
  const [localContent, setLocalContent] = useState(content);
  const [hasLocalEdits, setHasLocalEdits] = useState(false);
  const [isRefining, setIsRefining] = useState(false);

  // Reset local content when the content prop changes (new draft from server)
  useEffect(() => {
    setLocalContent(content);
    setHasLocalEdits(false);
    if (isRefining) {
      setIsRefining(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  // Also reset when section changes
  useEffect(() => {
    setLocalContent(content);
    setHasLocalEdits(false);
    setIsRefining(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!isRefining) {
          onApprove();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isRefining, onApprove]);

  const handleLocalContentChange = useCallback(
    (updated: string) => {
      setLocalContent(updated);
      setHasLocalEdits(updated !== content);
    },
    [content],
  );

  const handleAction = useCallback(
    (instruction: string) => {
      setIsRefining(true);
      onRequestChanges(instruction);
    },
    [onRequestChanges],
  );

  const handleWeaveIn = useCallback(
    (evidence: EvidenceItem) => {
      const instruction = `Weave in this evidence: ${evidence.result}. Situation: ${evidence.situation}. Action: ${evidence.action}.`;
      handleAction(instruction);
    },
    [handleAction],
  );

  const handleKeywordAction = useCallback(
    (keyword: string) => {
      handleAction(`Naturally integrate the keyword "${keyword}" into this section`);
    },
    [handleAction],
  );

  const handleSaveEdits = useCallback(() => {
    onDirectEdit(localContent);
    setHasLocalEdits(false);
  }, [localContent, onDirectEdit]);

  const positioningAngle =
    context?.blueprint_slice &&
    typeof context.blueprint_slice['positioning_angle'] === 'string'
      ? (context.blueprint_slice['positioning_angle'] as string)
      : null;

  const sectionOrder = context?.section_order ?? [];
  const sectionsApproved = context?.sections_approved ?? [];

  return (
    <div
      className="flex h-full flex-col"
      data-panel-root
    >
      {/* Progress dots — sticky */}
      {sectionOrder.length > 0 && (
        <WorkbenchProgressDots
          sectionOrder={sectionOrder}
          sectionsApproved={sectionsApproved}
          currentSection={section}
        />
      )}

      {/* Scrollable body */}
      <div data-panel-scroll className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-5 py-6 space-y-6">
          {/* Section title */}
          <div className="text-center space-y-1">
            <h2 className="text-xl font-semibold text-white/90 tracking-tight">
              {toTitleCase(section)}
            </h2>
            {positioningAngle && (
              <p className="text-xs text-white/45 leading-relaxed max-w-sm mx-auto">
                {positioningAngle}
              </p>
            )}
          </div>

          {/* Content editor */}
          <WorkbenchContentEditor
            content={content}
            localContent={localContent}
            onLocalContentChange={handleLocalContentChange}
            isRefining={isRefining}
            hasLocalEdits={hasLocalEdits}
          />

          {/* Refining indicator */}
          {isRefining && (
            <div className="flex items-center gap-2 justify-center">
              <div className="h-1.5 w-1.5 rounded-full bg-[#98b3ff] animate-pulse" />
              <p className="text-xs text-[#98b3ff]/70">Refining section…</p>
            </div>
          )}

          {/* Action chips */}
          <WorkbenchActionChips
            section={section}
            onAction={handleAction}
            disabled={isRefining}
          />

          {/* Evidence cards */}
          {context && context.evidence.length > 0 && (
            <WorkbenchEvidenceCards
              evidence={context.evidence}
              content={localContent}
              onWeaveIn={handleWeaveIn}
            />
          )}

          {/* Keyword bar */}
          {context && context.keywords.length > 0 && (
            <WorkbenchKeywordBar
              keywords={context.keywords}
              content={localContent}
              onKeywordAction={handleKeywordAction}
            />
          )}

          {/* Bottom spacer for sticky CTA */}
          <div className="h-20" />
        </div>
      </div>

      {/* Sticky bottom CTA bar */}
      <div className="border-t border-white/[0.12] bg-black/30 backdrop-blur-sm px-5 py-3">
        <div className="mx-auto max-w-3xl">
          {hasLocalEdits ? (
            <div className="flex items-center gap-2">
              <GlassButton
                variant="primary"
                className="flex-1"
                onClick={handleSaveEdits}
              >
                <Check className="mr-1.5 h-3.5 w-3.5" />
                Save Edits
              </GlassButton>
              <GlassButton
                variant="ghost"
                onClick={() => {
                  setLocalContent(content);
                  setHasLocalEdits(false);
                }}
                className="px-3"
              >
                Discard
              </GlassButton>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <GlassButton
                variant="primary"
                className={cn('flex-1', isRefining && 'opacity-50 pointer-events-none')}
                onClick={onApprove}
                disabled={isRefining}
              >
                <Check className="mr-1.5 h-3.5 w-3.5" />
                Looks Good — Next Section
              </GlassButton>
              <GlassButton
                variant="ghost"
                onClick={() => {
                  const instruction = 'Please make this section more concise and impactful';
                  handleAction(instruction);
                }}
                disabled={isRefining}
                className="flex-shrink-0"
              >
                <Pencil className="h-3.5 w-3.5" />
              </GlassButton>
            </div>
          )}
          <p className="mt-1.5 text-center text-[10px] text-white/25">
            {hasLocalEdits ? 'Save your inline edits or discard' : 'Cmd+Enter to approve'}
          </p>
        </div>
      </div>
    </div>
  );
}
