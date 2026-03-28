import { useEffect, useState } from 'react';
import { Lightbulb, Loader2, AlertTriangle } from 'lucide-react';
import type {
  ResumeDraft,
  BulletConfidence,
  RequirementSource,
  ResumeContentOrigin,
  ResumeSupportOrigin,
} from '@/types/resume-v2';
import { scrollToAndHighlight } from '../useStrategyThread';
import type { PendingEdit, EditAction } from '@/hooks/useInlineEdit';
import { BulletEditPopover } from './BulletEditPopover';

interface ResumeDocumentCardProps {
  resume: ResumeDraft;
  /** Which bullet is currently selected for inline editing */
  activeBullet?: { section: string; index: number } | null;
  /** Click handler for bullet selection */
  onBulletClick?: (bulletText: string, section: string, bulletIndex: number, requirements: string[]) => void;
  /** Direct edit callback — saves edited text back into the resume */
  onBulletEdit?: (section: string, index: number, newText: string) => void;
  /** Remove a bullet from the resume */
  onBulletRemove?: (section: string, index: number) => void;
  /** The pending AI suggestion for the active bullet */
  pendingEdit?: PendingEdit | null;
  isEditing?: boolean;
  onAcceptEdit?: (text: string) => void;
  onRejectEdit?: () => void;
  onRequestEdit?: (text: string, section: string, action: EditAction, instruction?: string) => void;
}

export function ResumeDocumentCard({
  resume,
  activeBullet = null,
  onBulletClick,
  onBulletEdit,
  onBulletRemove,
  pendingEdit = null,
  isEditing = false,
  onAcceptEdit,
  onRejectEdit,
  onRequestEdit,
}: ResumeDocumentCardProps) {
  const coreCompetencies = Array.isArray(resume.core_competencies) ? resume.core_competencies : [];
  const selectedAccomplishments = Array.isArray(resume.selected_accomplishments) ? resume.selected_accomplishments : [];
  const professionalExperience = Array.isArray(resume.professional_experience) ? resume.professional_experience : [];
  const earlierCareer = Array.isArray(resume.earlier_career) ? resume.earlier_career : [];
  const education = Array.isArray(resume.education) ? resume.education : [];
  const certifications = Array.isArray(resume.certifications) ? resume.certifications : [];

  // Track which suggestion popover is open (by suggestion id or bullet key)
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);

  return (
    <div className="space-y-6 font-['Georgia','Times_New_Roman',serif] leading-relaxed select-text cursor-text p-8">
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
          <ol className="resume-proof-list space-y-2 list-decimal pl-6">
            {selectedAccomplishments.map((a, i) => {
              const accomplishmentRequirements = Array.isArray(a.addresses_requirements) ? a.addresses_requirements : [];
              const hasStrategy = accomplishmentRequirements.length > 0;
              const isActive = activeBullet?.section === 'selected_accomplishments' && activeBullet.index === i;
              const popoverKey = `sa-${i}`;
              const isPopoverOpen = openPopoverId === popoverKey;
              
              return (
                <li
                  key={i}
                  data-bullet-id={`selected_accomplishments-${i}`}
                  data-confidence={a.confidence}
                  className={`resume-proof-line text-sm leading-relaxed text-gray-800 ${
                    getConfidenceLineClass(a.confidence, a.requirement_source)
                  }`}
                  {...(hasStrategy
                    ? { 'data-addresses': JSON.stringify(a.addresses_requirements) }
                    : {})}
                >
                  <>
                    <BulletLineContent
                      text={a.content}
                      confidence={a.confidence}
                      requirementSource={a.requirement_source}
                      section="selected_accomplishments"
                      bulletIndex={i}
                      requirements={accomplishmentRequirements}
                      onToggle={() => setOpenPopoverId(isPopoverOpen ? null : popoverKey)}
                      onBulletClick={onBulletClick}
                    />
                    {isPopoverOpen && (
                      <BulletEditPopover
                        text={a.content}
                        confidence={a.confidence}
                        evidenceFound={a.evidence_found}
                        requirementSource={a.requirement_source}
                        addressesRequirements={accomplishmentRequirements}
                        contentOrigin={a.content_origin}
                        supportOrigin={a.support_origin}
                        onSave={(newText) => {
                          onBulletEdit?.('selected_accomplishments', i, newText);
                          setOpenPopoverId(null);
                        }}
                        onRemove={() => {
                          onBulletRemove?.('selected_accomplishments', i);
                          setOpenPopoverId(null);
                        }}
                        onClose={() => setOpenPopoverId(null)}
                        onRequestAiEdit={onRequestEdit ? (text, action) => onRequestEdit(text, 'selected_accomplishments', action) : undefined}
                      />
                    )}
                  </>
                  {isActive && onRequestEdit && (
                    <InlineEditPanel
                      bulletText={a.content}
                      section="selected_accomplishments"
                      bulletIndex={i}
                      requirements={accomplishmentRequirements}
                      pendingEdit={pendingEdit}
                      isEditing={isEditing}
                      confidence={a.confidence}
                      requirementSource={a.requirement_source}
                      evidenceFound={a.evidence_found}
                      contentOrigin={a.content_origin}
                      supportOrigin={a.support_origin}
                      onRequestEdit={onRequestEdit}
                      onBulletEdit={onBulletEdit}
                      onAcceptEdit={onAcceptEdit}
                      onRejectEdit={onRejectEdit}
                    />
                  )}
                </li>
              );
            })}
          </ol>
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
                  <p
                    data-scope-id={`professional_experience-${i}-scope`}
                    className="mt-1 text-xs text-gray-500 italic pl-1"
                  >
                    {exp.scope_statement}
                  </p>
                )}
                <ol className="resume-proof-list mt-2 space-y-2 list-decimal pl-6">
                  {(Array.isArray(exp.bullets) ? exp.bullets : []).map((bullet, j) => {
                    const bulletRequirements = Array.isArray(bullet.addresses_requirements) ? bullet.addresses_requirements : [];
                    const hasStrategy = bulletRequirements.length > 0;
                    const bulletIndex = i * 100 + j;
                    const isActive = activeBullet?.section === 'professional_experience' && activeBullet.index === bulletIndex;
                    const popoverKey = `pe-${bulletIndex}`;
                    const isPopoverOpen = openPopoverId === popoverKey;
                    
                    return (
                      <li
                        key={j}
                        data-bullet-id={`professional_experience-${bulletIndex}`}
                        data-confidence={bullet.confidence}
                        className={`resume-proof-line text-sm leading-relaxed text-gray-800 ${
                          getConfidenceLineClass(bullet.confidence, bullet.requirement_source)
                        }`}
                        {...(hasStrategy
                          ? { 'data-addresses': JSON.stringify(bullet.addresses_requirements) }
                          : {})}
                      >
                        <>
                          <BulletLineContent
                            text={bullet.text}
                            confidence={bullet.confidence}
                            requirementSource={bullet.requirement_source}
                            section="professional_experience"
                            bulletIndex={bulletIndex}
                            requirements={bulletRequirements}
                            onToggle={() => setOpenPopoverId(isPopoverOpen ? null : popoverKey)}
                            onBulletClick={onBulletClick}
                          />
                          {isPopoverOpen && (
                            <BulletEditPopover
                              text={bullet.text}
                              confidence={bullet.confidence}
                              evidenceFound={bullet.evidence_found}
                              requirementSource={bullet.requirement_source}
                              addressesRequirements={bulletRequirements}
                              contentOrigin={bullet.content_origin}
                              supportOrigin={bullet.support_origin}
                              onSave={(newText) => {
                                onBulletEdit?.('professional_experience', bulletIndex, newText);
                                setOpenPopoverId(null);
                              }}
                              onRemove={() => {
                                onBulletRemove?.('professional_experience', bulletIndex);
                                setOpenPopoverId(null);
                              }}
                              onClose={() => setOpenPopoverId(null)}
                              onRequestAiEdit={onRequestEdit ? (text, action) => onRequestEdit(text, 'professional_experience', action) : undefined}
                            />
                          )}
                        </>
                        {isActive && onRequestEdit && (
                          <InlineEditPanel
                            bulletText={bullet.text}
                            section="professional_experience"
                            bulletIndex={bulletIndex}
                            requirements={bulletRequirements}
                            pendingEdit={pendingEdit}
                            isEditing={isEditing}
                            confidence={bullet.confidence}
                            requirementSource={bullet.requirement_source}
                            evidenceFound={bullet.evidence_found}
                            contentOrigin={bullet.content_origin}
                            supportOrigin={bullet.support_origin}
                            onRequestEdit={onRequestEdit}
                            onBulletEdit={onBulletEdit}
                            onAcceptEdit={onAcceptEdit}
                            onRejectEdit={onRejectEdit}
                          />
                        )}
                      </li>
                    );
                  })}
                </ol>
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

interface BulletLineContentProps {
  text: string;
  confidence: BulletConfidence;
  requirementSource?: RequirementSource;
  section: string;
  bulletIndex: number;
  requirements: string[];
  onToggle: () => void;
  onBulletClick?: (bulletText: string, section: string, bulletIndex: number, requirements: string[]) => void;
}

function BulletLineContent({
  text,
  confidence,
  requirementSource,
  section,
  bulletIndex,
  requirements,
  onToggle,
  onBulletClick,
}: BulletLineContentProps) {
  const statusMeta = getConfidencePill(confidence, requirementSource);
  const sourceLabel = getConfidenceSourceLabel(confidence, requirementSource);
  const handleActivate = () => {
    if (confidence !== 'strong' && onBulletClick) {
      onBulletClick?.(text, section, bulletIndex, requirements);
      return;
    }
    onToggle();
  };

  return (
    <span className="block">
      {statusMeta ? (
        <span className="resume-proof-meta-row mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={statusMeta.className}>{statusMeta.label}</span>
          {sourceLabel ? (
            <>
              <span aria-hidden="true" className="text-gray-300">/</span>
              <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-gray-500">
                {sourceLabel}
              </span>
            </>
          ) : null}
        </span>
      ) : null}
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          handleActivate();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            handleActivate();
          }
        }}
        className={`resume-bullet-interactive block cursor-pointer rounded-lg px-2.5 py-1.5 -mx-2.5 transition-colors focus-visible:ring-1 focus-visible:ring-blue-300/60 focus-visible:outline-none ${
          confidence === 'strong'
            ? 'resume-bullet-interactive--strong font-normal text-gray-800 hover:bg-gray-50/90'
            : 'resume-bullet-interactive--flagged font-medium text-gray-900 hover:bg-slate-50/70'
        }`}
      >
        {text}
      </span>
    </span>
  );
}

// ─── InlineEditPanel ─────────────────────────────────────────────────────────

interface InlineEditPanelProps {
  bulletText: string;
  section: string;
  bulletIndex: number;
  requirements: string[];
  pendingEdit: PendingEdit | null;
  isEditing: boolean;
  confidence: BulletConfidence;
  requirementSource: RequirementSource;
  evidenceFound: string;
  contentOrigin?: ResumeContentOrigin;
  supportOrigin?: ResumeSupportOrigin;
  onRequestEdit: (text: string, section: string, action: EditAction, instruction?: string) => void;
  onBulletEdit?: (section: string, index: number, newText: string) => void;
  onAcceptEdit?: (text: string) => void;
  onRejectEdit?: () => void;
}

function InlineEditPanel({
  bulletText,
  section,
  bulletIndex,
  requirements,
  pendingEdit,
  isEditing,
  confidence,
  requirementSource,
  evidenceFound,
  contentOrigin,
  supportOrigin,
  onRequestEdit,
  onBulletEdit,
  onAcceptEdit,
  onRejectEdit,
}: InlineEditPanelProps) {
  const [draftValue, setDraftValue] = useState('');
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const isBenchmarkValidation = confidence === 'needs_validation' && requirementSource === 'benchmark';
  const isCodeRed = confidence === 'needs_validation' && requirementSource !== 'benchmark';
  const statusMeta = getConfidencePill(confidence, requirementSource);
  const requirementLabel = requirementSource === 'benchmark' ? 'Targets Benchmark Signal' : 'Targets Job Need';
  const hasEvidence = evidenceFound.trim().length > 0;
  const requestedCoverage = requirements.length > 0 ? requirements.join(', ') : requirementLabel;

  useEffect(() => {
    if (
      pendingEdit
      && pendingEdit.section === section
      && pendingEdit.originalText === bulletText
    ) {
      setDraftValue(pendingEdit.replacement);
      return;
    }
    setDraftValue(bulletText);
    setShowCustomPrompt(false);
    setCustomPrompt('');
  }, [bulletText, pendingEdit, section]);

  const matchesPendingEdit = Boolean(
    pendingEdit && pendingEdit.section === section && pendingEdit.originalText === bulletText,
  );
  const trimmedDraft = draftValue.trim();
  const hasManualChanges = trimmedDraft.length > 0 && trimmedDraft !== bulletText.trim();
  const canApplyDraft = trimmedDraft.length > 0 && (matchesPendingEdit || hasManualChanges);
  const resetTarget = matchesPendingEdit && pendingEdit ? pendingEdit.replacement : bulletText;
  const aiInstruction = trimmedDraft || bulletText.trim();
  const aiActions: Array<{ action: EditAction; label: string }> = isBenchmarkValidation
    ? [
        { action: 'strengthen', label: 'Connect to my background' },
        { action: 'add_metrics', label: 'Add direct support' },
        { action: 'add_keywords', label: 'Add keywords' },
        { action: 'shorten', label: 'Shorten' },
        { action: 'rewrite', label: 'Rewrite to match my background' },
        { action: 'custom', label: 'Custom' },
        { action: 'not_my_voice', label: 'Not my voice' },
      ]
    : isCodeRed
      ? [
          { action: 'strengthen', label: 'Connect adjacent proof' },
          { action: 'add_metrics', label: 'Add working knowledge' },
          { action: 'add_keywords', label: 'Add keywords' },
          { action: 'shorten', label: 'Shorten' },
          { action: 'rewrite', label: 'Rewrite safely' },
          { action: 'custom', label: 'Custom' },
          { action: 'not_my_voice', label: 'Not my voice' },
        ]
      : [
          { action: 'strengthen', label: 'Strengthen wording' },
          { action: 'add_metrics', label: 'Add proof' },
          { action: 'add_keywords', label: 'Add keywords' },
          { action: 'shorten', label: 'Shorten' },
          { action: 'rewrite', label: 'Rewrite safely' },
          { action: 'custom', label: 'Custom' },
          { action: 'not_my_voice', label: 'Not my voice' },
        ];

  return (
    <div className="resume-inline-panel mt-3 space-y-3 motion-safe:animate-[card-enter_200ms_ease-out_forwards] motion-safe:opacity-0">
      <div className="resume-inline-panel__surface">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
              Resolve This Line
            </p>
            <p className="mt-1 text-sm leading-6 text-gray-700">
              Keep it truthful, bring forward adjacent proof or working knowledge where it honestly exists, and only use AI where it makes the line safer or sharper.
            </p>
          </div>
          {statusMeta ? (
            <span className={statusMeta.className}>
              {statusMeta.label}
            </span>
          ) : (
            <span className="resume-proof-meta-label text-slate-700">Supported</span>
          )}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Line context
            </p>
            <dl className="mt-3 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm leading-6 text-slate-700">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Target</dt>
              <dd className="min-w-0 break-words">{requirementLabel}</dd>

              <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Origin</dt>
              <dd className="min-w-0 break-words">{getContentOriginLabel(contentOrigin, confidence)}</dd>

              <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Support</dt>
              <dd className="min-w-0 break-words">{getSupportOriginLabel(supportOrigin, hasEvidence, confidence, requirementSource)}</dd>
            </dl>
            <div className="mt-3 border-t border-slate-200 pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Coverage goal
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-700">
                {requestedCoverage}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className={`resume-inline-panel__status ${getInlinePanelTone(confidence, requirementSource)}`}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                {confidence === 'strong' ? 'Supported' : confidence === 'partial' ? 'Needs stronger detail' : requirementSource === 'benchmark' ? 'Confirm Fit' : 'Code Red'}
              </p>
              <p className="mt-1 text-[13px] leading-6">
                {getProofStateNextStep(confidence, requirementSource)}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Supporting evidence
              </p>
              {hasEvidence ? (
                <p className="mt-2 text-sm italic leading-6 text-slate-600">
                  &ldquo;{evidenceFound}&rdquo;
                </p>
              ) : (
                <div className="mt-2 flex items-start gap-2 text-sm leading-6 text-[#8f2d2d]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>No original resume support found yet.</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Working draft
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {isBenchmarkValidation
                  ? 'Review the assessment above, then confirm this line honestly fits your background. If it does, connect it to real experience and rewrite it in your own terms. If it does not, rewrite it to a truer fit.'
                  : isCodeRed
                    ? 'Review the assessment above, then use this box to connect the line to adjacent experience, tools, scope, or strong working knowledge you can honestly stand behind.'
                    : 'Review the assessment above, then rewrite the sentence here directly or use the AI actions to make the proof stronger and clearer.'}
              </p>
            </div>
            {matchesPendingEdit && (
              <span className="resume-proof-meta-label text-slate-600">
                AI draft loaded
              </span>
            )}
          </div>

          <textarea
            value={draftValue}
            onChange={(event) => setDraftValue(event.target.value)}
            rows={4}
            aria-label="Working draft for this resume line"
            className="mt-3 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm leading-6 text-slate-800 outline-none transition-colors focus:border-slate-500 focus:bg-white"
          />

          <div className="mt-3 flex flex-wrap gap-2">
            {aiActions.map(({ action, label }) => (
              <button
                key={action}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (action === 'custom') {
                    setShowCustomPrompt((previous) => !previous);
                    return;
                  }
                  onRequestEdit(bulletText, section, action, aiInstruction);
                }}
                disabled={isEditing}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 hover:bg-slate-50 hover:border-slate-400 disabled:opacity-40 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>

          {showCustomPrompt && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Custom AI instruction
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Tell AI exactly how to revise this line. It will replace the current working draft, not append to it.
              </p>
              <div className="mt-3 flex flex-wrap items-start gap-2">
                <input
                  type="text"
                  value={customPrompt}
                  onChange={(event) => setCustomPrompt(event.target.value)}
                  placeholder="Example: keep the metric but make this sound more executive."
                  maxLength={500}
                  className="min-w-[260px] flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-slate-500"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!customPrompt.trim()) return;
                    onRequestEdit(bulletText, section, 'custom', customPrompt.trim());
                  }}
                  disabled={isEditing || !customPrompt.trim()}
                  className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-white hover:bg-slate-800 disabled:opacity-40 transition-colors"
                >
                  Run custom edit
                </button>
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (!trimmedDraft) return;
                if (matchesPendingEdit) {
                  onAcceptEdit?.(trimmedDraft);
                  return;
                }
                onBulletEdit?.(section, bulletIndex, trimmedDraft);
              }}
              disabled={!canApplyDraft}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Apply to Resume
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDraftValue(resetTarget);
              }}
              disabled={draftValue === resetTarget}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              Reset Draft
            </button>
            {matchesPendingEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDraftValue(bulletText);
                  onRejectEdit?.();
                }}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Discard AI Draft
              </button>
            )}
          </div>

          {isEditing && (
            <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              Generating a reviewable draft...
            </div>
          )}
        </div>
      </div>
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

// ─── Confidence styling helpers ──────────────────────────────────────────────

function getConfidenceLineClass(
  confidence: BulletConfidence,
  requirementSource?: RequirementSource,
): string {
  switch (confidence) {
    case 'strong':
      return 'resume-proof-line--strong';
    case 'partial':
      return 'resume-proof-line--partial';
    case 'needs_validation':
      return requirementSource === 'benchmark'
        ? 'resume-proof-line--benchmark'
        : 'resume-proof-line--code-red';
    default:
      return '';
  }
}

function getConfidencePill(
  confidence: BulletConfidence,
  requirementSource?: RequirementSource,
): { label: string; className: string } | null {
  if (confidence === 'partial') {
    return {
      label: 'Strengthen',
      className:
        'resume-proof-meta-label resume-proof-meta-label--partial',
    };
  }

  if (confidence === 'needs_validation' && requirementSource === 'benchmark') {
    return {
      label: 'Confirm Fit',
      className:
        'resume-proof-meta-label resume-proof-meta-label--benchmark',
    };
  }

  if (confidence === 'needs_validation') {
    return {
      label: 'Code Red',
      className:
        'resume-proof-meta-label resume-proof-meta-label--code-red',
    };
  }

  return null;
}

function getConfidenceSourceLabel(
  confidence: BulletConfidence,
  requirementSource?: RequirementSource,
): string | null {
  if (confidence === 'strong') return null;
  return requirementSource === 'benchmark' ? 'Targets Benchmark Signal' : 'Targets Job Need';
}

function getContentOriginLabel(
  contentOrigin: ResumeContentOrigin | undefined,
  confidence: BulletConfidence,
): string {
  if (contentOrigin === 'original_resume' || confidence === 'strong') return 'From Resume';
  if (contentOrigin === 'enhanced_from_resume' || confidence === 'partial') return 'Rewritten From Resume';
  return 'Drafted To Close Gap';
}

function getSupportOriginLabel(
  supportOrigin: ResumeSupportOrigin | undefined,
  hasEvidence: boolean,
  confidence: BulletConfidence,
  requirementSource?: RequirementSource,
): string {
  if (supportOrigin === 'user_confirmed_context') return 'User confirmed';
  if (supportOrigin === 'adjacent_resume_inference' || confidence === 'partial') return 'Adjacent resume proof';
  if (supportOrigin === 'original_resume' || hasEvidence) return 'Original resume';
  if (requirementSource === 'benchmark' && confidence === 'needs_validation') return 'Not directly confirmed';
  return 'Not found yet';
}

function getInlinePanelTone(
  confidence: BulletConfidence,
  requirementSource: RequirementSource,
): string {
  if (confidence === 'strong') {
    return 'resume-inline-panel__status--supported';
  }
  if (confidence === 'partial') {
    return 'resume-inline-panel__status--partial';
  }
  if (requirementSource === 'benchmark') {
    return 'resume-inline-panel__status--benchmark';
  }
  return 'resume-inline-panel__status--code-red';
}

function getProofStateNextStep(
  confidence: BulletConfidence,
  requirementSource: RequirementSource,
): string {
  if (confidence === 'strong') {
    return 'The proof is already there. Tighten the wording only if you want it sharper.';
  }
  if (confidence === 'partial') {
    return 'Add one concrete metric, scope detail, or outcome so this reads as direct proof.';
  }
  if (requirementSource === 'benchmark') {
    return 'This line may fit the role. Connect it to real background you can stand behind, then keep it only if it still reads honestly.';
  }
  return 'Look for adjacent experience, tools, scope, or strong working knowledge you can honestly claim, then rewrite this line safely before export.';
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-xs font-bold tracking-[0.2em] uppercase text-gray-500 border-b border-gray-200 pb-1 sm:text-[13px]">
      {children}
    </h3>
  );
}
