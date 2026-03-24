import { useCallback, useEffect, useRef, useState } from 'react';
import { Lightbulb, Loader2, Wand2, FileText, Target, Check, X } from 'lucide-react';
import type { ResumeDraft } from '@/types/resume-v2';
import type { InlineSuggestion } from '@/lib/compute-inline-diffs';
import { scrollToAndHighlight } from '../useStrategyThread';
import type { PendingEdit, EditAction } from '@/hooks/useInlineEdit';
import { AiHelperHint } from '@/components/shared/AiHelperHint';

interface ResumeDocumentCardProps {
  resume: ResumeDraft;
  onTextSelect?: (selectedText: string, section: string, rect: DOMRect) => void;
  /** Which bullet is currently selected for inline editing */
  activeBullet?: { section: string; index: number } | null;
  /** Click handler for bullet selection */
  onBulletClick?: (bulletText: string, section: string, bulletIndex: number, requirements: string[]) => void;
  /** The pending AI suggestion for the active bullet */
  pendingEdit?: PendingEdit | null;
  isEditing?: boolean;
  onAcceptEdit?: (text: string) => void;
  onRejectEdit?: () => void;
  onRequestEdit?: (text: string, section: string, action: EditAction, instruction?: string) => void;
  /** Inline suggestions to render directly in the document */
  inlineSuggestions?: InlineSuggestion[];
  onAcceptSuggestion?: (id: string) => void;
  onRejectSuggestion?: (id: string) => void;
  /** The id of the suggestion currently being focused/reviewed */
  currentSuggestionId?: string | null;
  /** Map from suggestion id to its sequential 1-based number across the document */
  suggestionIndexMap?: Map<string, number>;
}

export function ResumeDocumentCard({
  resume,
  onTextSelect,
  activeBullet = null,
  onBulletClick,
  pendingEdit = null,
  isEditing = false,
  onAcceptEdit,
  onRejectEdit,
  onRequestEdit,
  inlineSuggestions = [],
  onAcceptSuggestion,
  onRejectSuggestion,
  currentSuggestionId = null,
  suggestionIndexMap,
}: ResumeDocumentCardProps) {
  const handleMouseUp = useCallback(() => {
    if (!onTextSelect) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return;

    const text = selection.toString().trim();
    if (text.length < 5) return;

    // Find which section the selection is in
    const range = selection.getRangeAt(0);
    const sectionEl = (range.startContainer as HTMLElement).closest?.('[data-section]')
      ?? (range.startContainer.parentElement)?.closest?.('[data-section]');
    const section = sectionEl?.getAttribute('data-section') ?? 'unknown';

    const rect = range.getBoundingClientRect();
    onTextSelect(text, section, rect);
  }, [onTextSelect]);

  const coreCompetencies = Array.isArray(resume.core_competencies) ? resume.core_competencies : [];
  const selectedAccomplishments = Array.isArray(resume.selected_accomplishments) ? resume.selected_accomplishments : [];
  const professionalExperience = Array.isArray(resume.professional_experience) ? resume.professional_experience : [];
  const earlierCareer = Array.isArray(resume.earlier_career) ? resume.earlier_career : [];
  const education = Array.isArray(resume.education) ? resume.education : [];
  const certifications = Array.isArray(resume.certifications) ? resume.certifications : [];

  // Track which suggestion popover is open (by suggestion id or bullet key)
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);

  /**
   * Find a pending inline suggestion that matches a given bullet text in a section.
   * sectionId on the suggestion is the section name from the resume draft.
   */
  const findSuggestion = useCallback(
    (sectionId: string, bulletText: string): InlineSuggestion | undefined => {
      return inlineSuggestions.find(
        (s) => s.sectionId === sectionId && (s.originalText === bulletText || s.suggestedText === bulletText),
      );
    },
    [inlineSuggestions],
  );

  /**
   * Build a 1-based sequential number map for all suggestions.
   * Uses the prop when provided; falls back to generating one from inlineSuggestions order.
   */
  const resolvedIndexMap = useCallback((): Map<string, number> => {
    if (suggestionIndexMap) return suggestionIndexMap;
    const map = new Map<string, number>();
    inlineSuggestions.forEach((s, i) => map.set(s.id, i + 1));
    return map;
  }, [suggestionIndexMap, inlineSuggestions])();

  const totalSuggestions = inlineSuggestions.length;

  return (
    <div
      className="space-y-6 font-['Georgia','Times_New_Roman',serif] leading-relaxed select-text cursor-text p-8"
      onMouseUp={handleMouseUp}
    >
      {/* Header */}
      <div data-section="header" className="text-center border-b border-gray-200 pb-5">
        <h2 className="text-2xl font-bold tracking-wide text-gray-900">{resume.header.name}</h2>
        <p className="text-base text-blue-700 font-medium tracking-wider uppercase mt-1.5">
          {resume.header.branded_title}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-0 gap-y-1 text-xs text-gray-500 sm:flex-row">
          {resume.header.phone && (
            <>
              <span className="px-2 sm:first:pl-0">{resume.header.phone}</span>
              {(resume.header.email || resume.header.linkedin) && (
                <span className="hidden sm:inline text-gray-400" aria-hidden="true">·</span>
              )}
            </>
          )}
          {resume.header.email && (
            <>
              <span className="px-2">{resume.header.email}</span>
              {resume.header.linkedin && (
                <span className="hidden sm:inline text-gray-400" aria-hidden="true">·</span>
              )}
            </>
          )}
          {resume.header.linkedin && (
            <span className="px-2">{resume.header.linkedin}</span>
          )}
        </div>
      </div>

      {/* Executive Summary */}
      <section data-section="executive_summary">
        <SectionHeading>Executive Summary</SectionHeading>
        <p className="text-sm leading-relaxed text-gray-800">
          {resume.executive_summary.content}
        </p>
      </section>

      {/* Core Competencies */}
      {coreCompetencies.length > 0 && (
        <section data-section="core_competencies">
          <SectionHeading>Core Competencies</SectionHeading>
          <div className="flex flex-wrap gap-2">
            {coreCompetencies.map((comp, i) => (
              <span
                key={i}
                className="rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-gray-600"
              >
                {comp}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Selected Accomplishments */}
      {selectedAccomplishments.length > 0 && (
        <section data-section="selected_accomplishments">
          <SectionHeading>Selected Accomplishments</SectionHeading>
          <ul className="space-y-2">
            {selectedAccomplishments.map((a, i) => {
              const accomplishmentRequirements = Array.isArray(a.addresses_requirements) ? a.addresses_requirements : [];
              const hasStrategy = accomplishmentRequirements.length > 0;
              const isActive = activeBullet?.section === 'selected_accomplishments' && activeBullet.index === i;
              const suggestion = findSuggestion('selected_accomplishments', a.content);
              const popoverKey = `sa-${i}`;
              const isPopoverOpen = openPopoverId === popoverKey;
              const suggestionNum = suggestion ? resolvedIndexMap.get(suggestion.id) : undefined;
              const suggestionDataIdx = suggestion ? inlineSuggestions.findIndex((s) => s.id === suggestion.id) : undefined;

              return (
                <li
                  key={i}
                  data-bullet-id={`selected_accomplishments-${i}`}
                  data-suggestion-id={suggestion?.id}
                  className="text-sm leading-relaxed pl-4 relative"
                  {...(hasStrategy
                    ? { 'data-addresses': JSON.stringify(a.addresses_requirements) }
                    : {})}
                >
                  {/* Bullet dot — blue for strategy, neutral default */}
                  <span
                    className={`absolute left-0 top-[0.45em] h-1.5 w-1.5 rounded-full ${
                      hasStrategy ? 'bg-blue-400/60' : 'bg-gray-400'
                    }`}
                    aria-hidden="true"
                  />
                  {suggestion ? (
                    <BulletWithSuggestion
                      suggestion={suggestion}
                      popoverKey={popoverKey}
                      isPopoverOpen={isPopoverOpen}
                      onOpenPopover={() => setOpenPopoverId(isPopoverOpen ? null : popoverKey)}
                      onClosePopover={() => setOpenPopoverId(null)}
                      onAcceptSuggestion={onAcceptSuggestion}
                      onRejectSuggestion={onRejectSuggestion}
                      requirements={accomplishmentRequirements}
                      suggestionNumber={suggestionNum}
                      isCurrent={suggestion.id === currentSuggestionId}
                      suggestionDataIndex={suggestionDataIdx}
                      totalSuggestions={totalSuggestions}
                    />
                  ) : onBulletClick ? (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        onBulletClick(a.content, 'selected_accomplishments', i, accomplishmentRequirements);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          onBulletClick(a.content, 'selected_accomplishments', i, accomplishmentRequirements);
                        }
                      }}
                      className={
                        a.is_new
                          ? 'text-green-600 cursor-pointer rounded-md px-2 py-0.5 -mx-2 hover:bg-green-50 transition-colors focus-visible:ring-1 focus-visible:ring-green-400/60 focus-visible:outline-none'
                          : isActive
                            ? 'ring-2 ring-blue-300/40 rounded-lg bg-blue-50/40 px-2 py-1 -mx-2 -my-0.5 cursor-pointer transition-all duration-200 text-gray-800'
                            : 'hover:bg-gray-50 cursor-pointer rounded-md px-2 py-0.5 -mx-2 transition-colors focus-visible:ring-1 focus-visible:ring-blue-300/60 focus-visible:outline-none text-gray-800'
                      }
                    >
                      {a.content}
                    </span>
                  ) : (
                    <span className={a.is_new ? 'text-green-600' : 'text-gray-800'}>{a.content}</span>
                  )}
                  {hasStrategy && !suggestion && (
                    <StrategyTooltip requirements={accomplishmentRequirements} />
                  )}
                  {isActive && onRequestEdit && (
                    <InlineEditPanel
                      bulletText={a.content}
                      section="selected_accomplishments"
                      requirements={accomplishmentRequirements}
                      pendingEdit={pendingEdit}
                      isEditing={isEditing}
                      onRequestEdit={onRequestEdit}
                      onAcceptEdit={onAcceptEdit}
                      onRejectEdit={onRejectEdit}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Professional Experience */}
      {professionalExperience.length > 0 && (
        <section data-section="professional_experience">
          <SectionHeading>Professional Experience</SectionHeading>
          <div className="space-y-5">
            {professionalExperience.map((exp, i) => (
              <div key={i}>
                <div className="flex items-baseline justify-between gap-2">
                  <div>
                    <span className="text-sm font-bold text-gray-900">{exp.title}</span>
                    <span className="text-sm text-gray-500"> · {exp.company}</span>
                  </div>
                  <span className="text-xs text-gray-500 whitespace-nowrap shrink-0">
                    {exp.start_date} — {exp.end_date}
                  </span>
                </div>
                {exp.scope_statement && (
                  <p className="mt-1 text-xs text-gray-500 italic pl-1">
                    {exp.scope_statement}
                  </p>
                )}
                <ul className="mt-2 space-y-1.5">
                  {(Array.isArray(exp.bullets) ? exp.bullets : []).map((bullet, j) => {
                    const bulletRequirements = Array.isArray(bullet.addresses_requirements) ? bullet.addresses_requirements : [];
                    const hasStrategy = bulletRequirements.length > 0;
                    const bulletIndex = i * 100 + j;
                    const isActive = activeBullet?.section === 'professional_experience' && activeBullet.index === bulletIndex;
                    const suggestion = findSuggestion('professional_experience', bullet.text);
                    const popoverKey = `pe-${bulletIndex}`;
                    const isPopoverOpen = openPopoverId === popoverKey;
                    const suggestionNum = suggestion ? resolvedIndexMap.get(suggestion.id) : undefined;
                    const suggestionDataIdx = suggestion ? inlineSuggestions.findIndex((s) => s.id === suggestion.id) : undefined;

                    return (
                      <li
                        key={j}
                        data-bullet-id={`professional_experience-${bulletIndex}`}
                        data-suggestion-id={suggestion?.id}
                        className="text-sm leading-relaxed pl-4 relative"
                        {...(hasStrategy
                          ? { 'data-addresses': JSON.stringify(bullet.addresses_requirements) }
                          : {})}
                      >
                        {/* Bullet dot — blue (repositioned), neutral */}
                        <span
                          className={`absolute left-0 top-[0.5em] h-1 w-1 rounded-full ${
                            hasStrategy ? 'bg-blue-400/60' : 'bg-gray-400'
                          }`}
                          aria-hidden="true"
                        />
                        {suggestion ? (
                          <BulletWithSuggestion
                            suggestion={suggestion}
                            popoverKey={popoverKey}
                            isPopoverOpen={isPopoverOpen}
                            onOpenPopover={() => setOpenPopoverId(isPopoverOpen ? null : popoverKey)}
                            onClosePopover={() => setOpenPopoverId(null)}
                            onAcceptSuggestion={onAcceptSuggestion}
                            onRejectSuggestion={onRejectSuggestion}
                            requirements={bulletRequirements}
                            suggestionNumber={suggestionNum}
                            isCurrent={suggestion.id === currentSuggestionId}
                            suggestionDataIndex={suggestionDataIdx}
                            totalSuggestions={totalSuggestions}
                          />
                        ) : onBulletClick ? (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              onBulletClick(bullet.text, 'professional_experience', bulletIndex, bulletRequirements);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                onBulletClick(bullet.text, 'professional_experience', bulletIndex, bulletRequirements);
                              }
                            }}
                            className={
                              bullet.is_new
                                ? 'text-green-600 cursor-pointer rounded-md px-2 py-0.5 -mx-2 hover:bg-green-50 transition-colors focus-visible:ring-1 focus-visible:ring-green-400/60 focus-visible:outline-none'
                                : isActive
                                  ? 'ring-2 ring-blue-300/40 rounded-lg bg-blue-50/40 px-2 py-1 -mx-2 -my-0.5 cursor-pointer transition-all duration-200 text-gray-800'
                                  : 'hover:bg-gray-50 cursor-pointer rounded-md px-2 py-0.5 -mx-2 transition-colors focus-visible:ring-1 focus-visible:ring-blue-300/60 focus-visible:outline-none text-gray-800'
                            }
                          >
                            {bullet.text}
                          </span>
                        ) : (
                          <span className={bullet.is_new ? 'text-green-600' : 'text-gray-800'}>{bullet.text}</span>
                        )}
                        {hasStrategy && !suggestion && (
                          <StrategyTooltip requirements={bulletRequirements} />
                        )}
                        {isActive && onRequestEdit && (
                          <InlineEditPanel
                            bulletText={bullet.text}
                            section="professional_experience"
                            requirements={bulletRequirements}
                            pendingEdit={pendingEdit}
                            isEditing={isEditing}
                            onRequestEdit={onRequestEdit}
                            onAcceptEdit={onAcceptEdit}
                            onRejectEdit={onRejectEdit}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Earlier Career */}
      {earlierCareer.length > 0 && (
        <section data-section="earlier_career">
          <SectionHeading>Earlier Career</SectionHeading>
          <div className="space-y-1">
            {earlierCareer.map((ec, i) => (
              <div key={i} className="flex items-baseline justify-between text-sm">
                <span className="text-gray-600">
                  {ec.title}{' '}
                  <span className="text-gray-500">· {ec.company}</span>
                </span>
                <span className="text-xs text-gray-500">{ec.dates}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Education */}
      {education.length > 0 && (
        <section data-section="education">
          <SectionHeading>Education</SectionHeading>
          <div className="space-y-1">
            {education.map((edu, i) => (
              <div key={i} className="text-sm text-gray-800">
                {edu.degree} — {edu.institution}
                {edu.year && <span className="text-gray-500"> ({edu.year})</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Certifications */}
      {certifications.length > 0 && (
        <section data-section="certifications">
          <SectionHeading>Certifications</SectionHeading>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {certifications.map((cert, i) => (
              <span key={i} className="text-sm text-gray-600">{cert}</span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── BulletWithSuggestion ────────────────────────────────────────────────────
// Renders a bullet that has an attached inline suggestion.
// - If `is_new` (addition): green text only, click opens popover.
// - If replacement: red strikethrough original + green new text, click opens popover.
// - If accepted: renders normal dark text.

interface BulletWithSuggestionProps {
  suggestion: InlineSuggestion;
  popoverKey: string;
  isPopoverOpen: boolean;
  onOpenPopover: () => void;
  onClosePopover: () => void;
  onAcceptSuggestion?: (id: string) => void;
  onRejectSuggestion?: (id: string) => void;
  requirements: string[];
  /** 1-based sequential number for this suggestion across the whole document */
  suggestionNumber?: number;
  /** True when this is the currently focused/active suggestion */
  isCurrent?: boolean;
  /** Index in the suggestions array for data attribute (0-based) */
  suggestionDataIndex?: number;
  /** Total suggestion count across document */
  totalSuggestions?: number;
}

function BulletWithSuggestion({
  suggestion,
  popoverKey,
  isPopoverOpen,
  onOpenPopover,
  onClosePopover,
  onAcceptSuggestion,
  onRejectSuggestion,
  requirements,
  suggestionNumber,
  isCurrent = false,
  suggestionDataIndex,
  totalSuggestions,
}: BulletWithSuggestionProps) {
  const isAccepted = suggestion.status === 'accepted';
  const isRejected = suggestion.status === 'rejected';
  const isReplacement = suggestion.changeType === 'replacement' && Boolean(suggestion.originalText) && Boolean(suggestion.suggestedText);

  // Numbered badge shown before the suggestion text
  const NumberBadge = () => {
    if (suggestionNumber === undefined) return null;

    if (isAccepted) {
      return (
        <span
          aria-label={`Suggestion ${suggestionNumber} accepted`}
          className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-500 text-white mr-1.5 flex-shrink-0 align-middle"
        >
          <Check className="w-3 h-3" strokeWidth={3} />
        </span>
      );
    }

    if (isRejected) {
      return (
        <span
          aria-label={`Suggestion ${suggestionNumber} rejected`}
          className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-300 text-gray-500 mr-1.5 flex-shrink-0 align-middle"
        >
          <X className="w-3 h-3" strokeWidth={3} />
        </span>
      );
    }

    return (
      <span
        aria-label={`Suggestion ${suggestionNumber}`}
        className={`inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-500 text-white text-[11px] font-bold mr-1.5 flex-shrink-0 align-middle transition-all ${
          isCurrent ? 'ring-2 ring-blue-400 ring-offset-1 animate-pulse' : ''
        }`}
      >
        {suggestionNumber}
      </span>
    );
  };

  if (isAccepted) {
    return (
      <span
        data-suggestion-index={suggestionDataIndex}
        className="inline transition-colors duration-300"
      >
        <NumberBadge />
        <span className="text-gray-800 transition-colors duration-300">{suggestion.suggestedText}</span>
      </span>
    );
  }

  if (isRejected) {
    return (
      <span
        data-suggestion-index={suggestionDataIndex}
        className="inline"
      >
        <NumberBadge />
        <span className="text-gray-500 line-through">{suggestion.originalText || suggestion.suggestedText}</span>
      </span>
    );
  }

  return (
    <span
      data-suggestion-index={suggestionDataIndex}
      className="inline"
    >
      <NumberBadge />
      {/* Clickable suggestion text */}
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => { e.stopPropagation(); onOpenPopover(); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            onOpenPopover();
          }
        }}
        aria-label={`Suggestion ${suggestionNumber ?? ''}: ${suggestion.suggestedText}. Click to review.`}
        aria-expanded={isPopoverOpen}
        className="cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-green-500/60"
      >
        {isReplacement ? (
          <>
            <del className="text-red-500 no-underline line-through mr-1">{suggestion.originalText}</del>
            <ins className="text-green-600 no-underline">{suggestion.suggestedText}</ins>
          </>
        ) : (
          <span className="text-green-600">{suggestion.suggestedText}</span>
        )}
      </span>

      {/* Inline popover */}
      {isPopoverOpen && (
        <SuggestionPopover
          suggestion={suggestion}
          requirements={requirements}
          suggestionNumber={suggestionNumber}
          totalSuggestions={totalSuggestions}
          onAccept={() => {
            onAcceptSuggestion?.(suggestion.id);
            onClosePopover();
          }}
          onReject={() => {
            onRejectSuggestion?.(suggestion.id);
            onClosePopover();
          }}
          onClose={onClosePopover}
        />
      )}
    </span>
  );
}

// ─── SuggestionPopover ───────────────────────────────────────────────────────
// Inline popover that opens below a green suggestion bullet.

interface SuggestionPopoverProps {
  suggestion: InlineSuggestion;
  requirements: string[];
  onAccept: () => void;
  onReject: () => void;
  onClose: () => void;
  suggestionNumber?: number;
  totalSuggestions?: number;
}

function SuggestionPopover({ suggestion, requirements, onAccept, onReject, onClose, suggestionNumber, totalSuggestions }: SuggestionPopoverProps) {
  const [editedText, setEditedText] = useState(suggestion.suggestedText);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Close on outside click
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Use a short delay so the originating click doesn't immediately close the popover
    const timerId = window.setTimeout(() => {
      window.addEventListener('mousedown', handleMouseDown);
    }, 50);
    return () => {
      window.clearTimeout(timerId);
      window.removeEventListener('mousedown', handleMouseDown);
    };
  }, [onClose]);

  const requirementLabel = requirements[0] ?? suggestion.requirementText;
  const isJd = suggestion.requirementSource === 'jd';

  return (
    <div
      ref={popoverRef}
      className="mt-2 rounded-lg border border-green-500/20 bg-white shadow-xl p-4 space-y-3.5 z-20 relative max-w-2xl"
      role="dialog"
      aria-label="Review suggestion"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Suggestion position header */}
      {suggestionNumber !== undefined && totalSuggestions !== undefined && (
        <div className="flex items-center justify-between mb-1 pb-2 border-b border-gray-100">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            Suggestion {suggestionNumber} of {totalSuggestions}
          </span>
        </div>
      )}

      {/* Source badge — prominent at the top */}
      <div className="flex items-center gap-2">
        {isJd ? (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 border border-blue-200 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-blue-700">
            <FileText className="h-3 w-3 shrink-0" aria-hidden="true" />
            Job Description
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-gray-50 border border-gray-200 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            <Target className="h-3 w-3 shrink-0" aria-hidden="true" />
            Benchmark
          </span>
        )}
        {isJd && (
          <span className="text-[11px] text-blue-600/70 font-medium">Critical — explicitly required by this posting</span>
        )}
        {!isJd && (
          <span className="text-[11px] text-gray-400">Nice to have — ideal candidate profile</span>
        )}
      </div>

      {/* Requirement text — full, not truncated */}
      {requirementLabel && (
        <div className="rounded-md bg-gray-50 border border-gray-100 px-3 py-2">
          <span className="block text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-1">Addresses Requirement</span>
          <span className="text-[13px] text-gray-700 leading-snug">{requirementLabel}</span>
        </div>
      )}

      {/* Editable textarea */}
      <div>
        <span className="block text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-1.5">Edit Before Accepting</span>
        <textarea
          value={editedText}
          onChange={(e) => setEditedText(e.target.value)}
          rows={5}
          aria-label="Edit suggestion before accepting"
          className="w-full resize-y rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm leading-relaxed text-gray-800 outline-none focus:border-green-400 focus:bg-white transition-colors"
        />
      </div>

      {/* Rationale */}
      {suggestion.rationale && (
        <div className="rounded-md bg-green-50/60 border border-green-100 px-3 py-2">
          <span className="block text-[10px] uppercase tracking-wider font-semibold text-green-700/60 mb-1">Why This Change</span>
          <p className="text-[12px] text-gray-600 leading-snug">{suggestion.rationale}</p>
        </div>
      )}

      {/* Action row */}
      <div className="flex items-center gap-2 flex-wrap pt-0.5">
        <button
          type="button"
          onClick={onAccept}
          className="rounded-md bg-green-500/15 border border-green-500/30 px-4 py-1.5 text-xs font-medium text-green-700 hover:bg-green-500/25 transition-colors"
        >
          Accept
        </button>
        <button
          type="button"
          onClick={onReject}
          className="rounded-md border border-gray-200 bg-white px-4 py-1.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
        >
          Reject
        </button>
        <button
          type="button"
          disabled
          title="Coming soon"
          className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-400 opacity-50 cursor-not-allowed"
        >
          <Wand2 className="h-3 w-3" />
          AI Alternatives
        </button>
      </div>
    </div>
  );
}

// ─── InlineEditPanel ─────────────────────────────────────────────────────────

interface InlineEditPanelProps {
  bulletText: string;
  section: string;
  requirements: string[];
  pendingEdit: PendingEdit | null;
  isEditing: boolean;
  onRequestEdit: (text: string, section: string, action: EditAction, instruction?: string) => void;
  onAcceptEdit?: (text: string) => void;
  onRejectEdit?: () => void;
}

function InlineEditPanel({
  bulletText,
  section,
  requirements,
  pendingEdit,
  isEditing,
  onRequestEdit,
  onAcceptEdit,
  onRejectEdit,
}: InlineEditPanelProps) {
  const [draftValue, setDraftValue] = useState('');

  useEffect(() => {
    if (
      pendingEdit
      && pendingEdit.section === section
      && pendingEdit.originalText === bulletText
    ) {
      setDraftValue(pendingEdit.replacement);
      return;
    }
    setDraftValue('');
  }, [bulletText, pendingEdit, section]);

  const matchesPendingEdit = Boolean(
    pendingEdit && pendingEdit.section === section && pendingEdit.originalText === bulletText,
  );

  return (
    <div className="support-callout mt-2 border border-[#afc4ff]/20 bg-[#0f141e]/90 p-3 space-y-3 motion-safe:animate-[card-enter_200ms_ease-out_forwards] motion-safe:opacity-0">
      <AiHelperHint
        title="AI Rewrite Help"
        body="Pick a rewrite angle to generate a stronger version of this bullet. You can apply the AI draft directly or edit it here first."
        tip="This should feel collaborative. You should not have to copy and paste the AI text into a blank box just to use it."
      />

      {/* Requirement tags */}
      {requirements.length > 0 && (
        <p className="text-[13px] leading-5 text-[var(--text-soft)]">
          This bullet currently supports: <span className="text-[#afc4ff]/75">{requirements.join(', ')}</span>
        </p>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {(['strengthen', 'add_metrics', 'rewrite'] as EditAction[]).map(action => (
          <button
            key={action}
            type="button"
            onClick={(e) => { e.stopPropagation(); onRequestEdit(bulletText, section, action); }}
            disabled={isEditing}
            className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-1.5 text-xs uppercase tracking-[0.08em] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text-strong)] disabled:opacity-40 transition-colors"
          >
            {action === 'strengthen' ? 'Improve Wording' : action === 'add_metrics' ? 'Add Proof' : 'Rewrite'}
          </button>
        ))}
      </div>

      {/* Loading state */}
      {isEditing && (
        <div className="flex items-center gap-2 text-xs text-[var(--text-soft)]">
          <Loader2 className="h-3 w-3 animate-spin" />
          Generating a reviewable draft...
        </div>
      )}

      {/* Pending edit suggestion — only show if it matches this bullet's text */}
      {matchesPendingEdit && pendingEdit && (
        <div className="support-callout border border-[#b5dec2]/20 bg-[#b5dec2]/[0.04] p-3 space-y-2">
          <p className="text-[12px] font-medium uppercase tracking-wider text-[#b5dec2]/60">Suggested</p>
          <p className="text-[13px] leading-relaxed text-[var(--text-soft)]">
            Review the draft below. You can make small edits before you apply it.
          </p>
          <textarea
            value={draftValue}
            onChange={(event) => setDraftValue(event.target.value)}
            rows={4}
            aria-label="Edit suggested rewrite before applying"
            className="w-full resize-y rounded-md border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2 text-sm leading-relaxed text-[var(--text-strong)] outline-none transition-colors focus:border-[var(--line-strong)] focus:bg-[var(--surface-2)]"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAcceptEdit?.(draftValue.trim() || pendingEdit.replacement);
              }}
              className="rounded-md bg-[#b5dec2]/20 border border-[#b5dec2]/30 px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] text-[#b5dec2] hover:bg-[#b5dec2]/30 transition-colors"
            >
              Accept
            </button>
            {draftValue !== pendingEdit.replacement && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDraftValue(pendingEdit.replacement);
                }}
                className="rounded-md border border-[var(--line-soft)] px-3 py-1 text-xs uppercase tracking-[0.08em] text-[var(--text-soft)] hover:bg-[var(--surface-1)] transition-colors"
              >
                Reset
              </button>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRejectEdit?.(); }}
              className="rounded-md border border-[var(--line-soft)] px-3 py-1 text-xs uppercase tracking-[0.08em] text-[var(--text-soft)] hover:bg-[var(--surface-1)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StrategyTooltip({ requirements }: { requirements: string[] }) {
  const [show, setShow] = useState(false);

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (requirements.length > 0) {
      // A3: Scroll to GapAnalysisReportPanel card for this requirement
      scrollToAndHighlight(`[data-requirement="${CSS.escape(requirements[0])}"]`);
    }
  }

  return (
    <span
      className="relative inline-flex items-center ml-1.5 align-middle"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      <button
        type="button"
        onClick={handleClick}
        aria-label={`View gap analysis for: ${requirements[0] ?? 'requirement'}`}
        className="flex items-center focus:outline-none focus-visible:ring-1 focus-visible:ring-[#afc4ff]/60 rounded-md"
      >
        <Lightbulb
          className={`h-3 w-3 transition-colors duration-150 ${
            show ? 'text-[#afc4ff]/80' : 'text-[#afc4ff]/40'
          } hover:text-[#afc4ff]/80`}
        />
      </button>

      {show && (
        <span
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-max max-w-[280px] bg-[#0f141e]/95 backdrop-blur-md border border-[var(--line-strong)] rounded-lg shadow-xl pointer-events-none"
          role="tooltip"
        >
          {/* Tooltip header */}
          <span className="block px-3 pt-2 pb-1.5 border-b border-[var(--line-soft)]">
            <span className="flex items-center gap-1.5">
              <Lightbulb className="h-2.5 w-2.5 text-[#afc4ff]/60 shrink-0" aria-hidden="true" />
              <span className="text-[12px] uppercase tracking-wider font-semibold text-[#afc4ff]/70">
                Strategy Applied
              </span>
            </span>
          </span>

          {/* Requirements list */}
          <span className="block px-3 pt-2 pb-2.5 space-y-1.5">
            <span className="block text-[12px] uppercase tracking-wider text-[var(--text-soft)] mb-1">
              Addresses:
            </span>
            {requirements.map((req, i) => (
              <span
                key={i}
                className="flex items-start gap-1.5"
              >
                <span
                  className="mt-[3px] h-1.5 w-1.5 rounded-full bg-[#afc4ff]/50 shrink-0"
                  aria-hidden="true"
                />
                <span className="text-[13px] text-[var(--text-muted)] leading-snug">{req}</span>
              </span>
            ))}
            <span className="block mt-2 pt-2 border-t border-[var(--line-soft)] text-[12px] text-[var(--text-soft)] italic">
              Click to highlight in gap analysis report
            </span>
          </span>
        </span>
      )}
    </span>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-xs font-bold tracking-[0.2em] uppercase text-gray-500 border-b border-gray-200 pb-1 sm:text-[13px]">
      {children}
    </h3>
  );
}
