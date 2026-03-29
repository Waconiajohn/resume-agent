import { useEffect, useState } from 'react';
import { Lightbulb, Loader2, AlertTriangle } from 'lucide-react';
import type {
  ResumeDraft,
  BulletConfidence,
  RequirementSource,
  ResumeContentOrigin,
  ResumeReviewState,
  ResumeSupportOrigin,
} from '@/types/resume-v2';
import { scrollToAndHighlight } from '../useStrategyThread';
import type { PendingEdit, EditAction } from '@/hooks/useInlineEdit';
import { BulletEditPopover } from './BulletEditPopover';
import { canonicalRequirementSignals } from '@/lib/resume-requirement-signals';

interface ResumeDocumentCardProps {
  resume: ResumeDraft;
  requirementCatalog?: Array<{ requirement: string; source?: RequirementSource }>;
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
  requirementCatalog = [],
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
              const accomplishmentRequirements = canonicalRequirementSignals(
                a.primary_target_requirement,
                a.addresses_requirements,
              );
              const accomplishmentPrimaryTarget = resolvePrimaryDisplayRequirement(
                accomplishmentRequirements,
                requirementCatalog,
                a.primary_target_source ?? a.requirement_source,
                a.content,
              );
              const accomplishmentDisplayTargets = accomplishmentPrimaryTarget ? [accomplishmentPrimaryTarget] : [];
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
                    getConfidenceLineClass(a.review_state, a.confidence, a.requirement_source)
                  }`}
                  {...(hasStrategy
                    ? { 'data-addresses': JSON.stringify(accomplishmentRequirements) }
                    : {})}
                >
                  <>
                    <BulletLineContent
                      text={a.content}
                      confidence={a.confidence}
                      reviewState={a.review_state}
                      requirementSource={a.requirement_source}
                      section="selected_accomplishments"
                      bulletIndex={i}
                      requirements={accomplishmentDisplayTargets}
                      onToggle={() => setOpenPopoverId(isPopoverOpen ? null : popoverKey)}
                      onBulletClick={onBulletClick}
                    />
                    {isPopoverOpen && (
                      <BulletEditPopover
                        text={a.content}
                        confidence={a.confidence}
                        evidenceFound={a.evidence_found}
                        requirementSource={a.requirement_source}
                        addressesRequirements={accomplishmentDisplayTargets}
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
                      requirements={accomplishmentDisplayTargets}
                      pendingEdit={pendingEdit}
                      isEditing={isEditing}
                      confidence={a.confidence}
                      reviewState={a.review_state}
                      requirementSource={a.requirement_source}
                      evidenceFound={a.evidence_found}
                      targetEvidence={a.target_evidence}
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
                    const bulletRequirements = canonicalRequirementSignals(
                      bullet.primary_target_requirement,
                      bullet.addresses_requirements,
                    );
                    const bulletPrimaryTarget = resolvePrimaryDisplayRequirement(
                      bulletRequirements,
                      requirementCatalog,
                      bullet.primary_target_source ?? bullet.requirement_source,
                      bullet.text,
                    );
                    const bulletDisplayTargets = bulletPrimaryTarget ? [bulletPrimaryTarget] : [];
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
                          getConfidenceLineClass(bullet.review_state, bullet.confidence, bullet.requirement_source)
                        }`}
                        {...(hasStrategy
                          ? { 'data-addresses': JSON.stringify(bulletRequirements) }
                          : {})}
                      >
                        <>
                          <BulletLineContent
                            text={bullet.text}
                            confidence={bullet.confidence}
                            reviewState={bullet.review_state}
                            requirementSource={bullet.requirement_source}
                            section="professional_experience"
                            bulletIndex={bulletIndex}
                            requirements={bulletDisplayTargets}
                            onToggle={() => setOpenPopoverId(isPopoverOpen ? null : popoverKey)}
                            onBulletClick={onBulletClick}
                          />
                          {isPopoverOpen && (
                            <BulletEditPopover
                              text={bullet.text}
                              confidence={bullet.confidence}
                              evidenceFound={bullet.evidence_found}
                              requirementSource={bullet.requirement_source}
                              addressesRequirements={bulletDisplayTargets}
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
                            requirements={bulletDisplayTargets}
                            pendingEdit={pendingEdit}
                            isEditing={isEditing}
                            confidence={bullet.confidence}
                            reviewState={bullet.review_state}
                            requirementSource={bullet.requirement_source}
                            evidenceFound={bullet.evidence_found}
                            targetEvidence={bullet.target_evidence}
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
  reviewState?: ResumeReviewState;
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
  reviewState,
  requirementSource,
  section,
  bulletIndex,
  requirements,
  onToggle,
  onBulletClick,
}: BulletLineContentProps) {
  const resolvedReviewState = resolveReviewState(reviewState, confidence, requirementSource);
  const statusMeta = getConfidencePill(resolvedReviewState, requirementSource);
  const sourceLabel = getConfidenceSourceLabel(resolvedReviewState, requirementSource);
  const handleActivate = () => {
    if (!isResolvedReviewState(resolvedReviewState) && onBulletClick) {
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
          isResolvedReviewState(resolvedReviewState)
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
  reviewState?: ResumeReviewState;
  requirementSource: RequirementSource;
  evidenceFound: string;
  targetEvidence?: string;
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
  reviewState,
  requirementSource,
  evidenceFound,
  targetEvidence,
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
  const resolvedReviewState = resolveReviewState(reviewState, confidence, requirementSource);
  const isBenchmarkValidation = resolvedReviewState === 'confirm_fit';
  const isCodeRed = resolvedReviewState === 'code_red';
  const displayEvidence = typeof targetEvidence === 'string' && targetEvidence.trim().length > 0
    ? targetEvidence.trim()
    : '';
  const hasEvidence = displayEvidence.length > 0;
  const targetSummary = requirements[0]
    ? requirements[0]
    : requirementSource === 'benchmark'
      ? 'The benchmark signal this line is trying to prove still needs review.'
      : 'The job need this line is trying to prove still needs review.';

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
  const actionToneByType: Record<EditAction, 'primary' | 'secondary' | 'tertiary'> = isBenchmarkValidation
    ? {
        strengthen: 'primary',
        add_metrics: 'secondary',
        add_keywords: 'tertiary',
        shorten: 'tertiary',
        rewrite: 'primary',
        custom: 'secondary',
        not_my_voice: 'secondary',
      }
    : isCodeRed
      ? {
          strengthen: 'primary',
          add_metrics: 'primary',
          add_keywords: 'secondary',
          shorten: 'tertiary',
          rewrite: 'secondary',
          custom: 'secondary',
          not_my_voice: 'tertiary',
        }
      : {
          strengthen: 'primary',
          add_metrics: 'primary',
          add_keywords: 'secondary',
          shorten: 'tertiary',
          rewrite: 'secondary',
          custom: 'secondary',
          not_my_voice: 'tertiary',
        };
  const aiActions: Array<{ action: EditAction; label: string; tone: 'primary' | 'secondary' | 'tertiary' }> = isBenchmarkValidation
    ? [
        { action: 'strengthen', label: 'Connect to my background', tone: actionToneByType.strengthen },
        { action: 'rewrite', label: 'Rewrite to match my background', tone: actionToneByType.rewrite },
        { action: 'add_metrics', label: 'Add direct support', tone: actionToneByType.add_metrics },
        { action: 'custom', label: 'Custom', tone: actionToneByType.custom },
        { action: 'add_keywords', label: 'Add keywords', tone: actionToneByType.add_keywords },
        { action: 'shorten', label: 'Shorten', tone: actionToneByType.shorten },
        { action: 'not_my_voice', label: 'Not my voice', tone: actionToneByType.not_my_voice },
      ]
    : isCodeRed
      ? [
          { action: 'strengthen', label: 'Connect adjacent proof', tone: actionToneByType.strengthen },
          { action: 'add_metrics', label: 'Add working knowledge', tone: actionToneByType.add_metrics },
          { action: 'rewrite', label: 'Rewrite safely', tone: actionToneByType.rewrite },
          { action: 'custom', label: 'Custom', tone: actionToneByType.custom },
          { action: 'add_keywords', label: 'Add keywords', tone: actionToneByType.add_keywords },
          { action: 'shorten', label: 'Shorten', tone: actionToneByType.shorten },
          { action: 'not_my_voice', label: 'Not my voice', tone: actionToneByType.not_my_voice },
        ]
      : [
          { action: 'strengthen', label: 'Strengthen wording', tone: actionToneByType.strengthen },
          { action: 'add_metrics', label: 'Add proof', tone: actionToneByType.add_metrics },
          { action: 'rewrite', label: 'Rewrite safely', tone: actionToneByType.rewrite },
          { action: 'custom', label: 'Custom', tone: actionToneByType.custom },
          { action: 'add_keywords', label: 'Add keywords', tone: actionToneByType.add_keywords },
          { action: 'shorten', label: 'Shorten', tone: actionToneByType.shorten },
          { action: 'not_my_voice', label: 'Not my voice', tone: actionToneByType.not_my_voice },
        ];
  const recommendedAiActions = aiActions.filter((action) => action.tone === 'primary');
  const followOnAiActions = aiActions.filter((action) => action.tone === 'secondary');
  const polishAiActions = aiActions.filter((action) => action.tone === 'tertiary');
  const applyHelperText = isEditing
    ? 'AI is generating a replacement draft now.'
    : canApplyDraft
      ? matchesPendingEdit
        ? 'Apply will replace the current line with the loaded AI draft.'
        : 'Apply will replace the current line with your working draft.'
      : 'Edit the draft or run an AI action to enable Apply to Resume.';
  const panelIntro = getInlinePanelIntro(resolvedReviewState, requirementSource);
  const flagReason = getInlinePanelFlagReason(resolvedReviewState, requirementSource);

  return (
    <div className="resume-inline-panel mt-3 space-y-3 motion-safe:animate-[card-enter_200ms_ease-out_forwards] motion-safe:opacity-0">
      <div className="resume-inline-panel__surface">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
            Resolve This Line
          </p>
          <p className="mt-1 text-sm leading-6 text-gray-700">
            {panelIntro}
          </p>
        </div>

        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Current line
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-800">
              {bulletText}
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]">
            <div className="resume-inline-panel__target-card rounded-xl px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {requirementSource === 'benchmark' ? "Benchmark signal we're covering" : "Job need we're covering"}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-800">
                {targetSummary}
              </p>
            </div>

            <div className={`resume-inline-panel__status ${getInlinePanelTone(resolvedReviewState, requirementSource)}`}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-75">
                Why it&apos;s flagged
              </p>
              <p className="mt-2 text-[13px] leading-6">
                {flagReason}
              </p>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.82fr)]">
            <div className="resume-inline-panel__support-card rounded-xl px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Supporting evidence
              </p>
              {hasEvidence ? (
                <p className="mt-2 text-sm italic leading-6 text-slate-600">
                  &ldquo;{displayEvidence}&rdquo;
                </p>
              ) : (
                <div className="mt-2 flex items-start gap-2 text-sm leading-6 text-[#8f2d2d]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>No target-specific resume support found yet.</span>
                </div>
              )}
            </div>

            <div className="resume-inline-panel__context-card rounded-xl px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Line context</p>
              <dl className="mt-3 grid grid-cols-[5.25rem_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-sm leading-6 text-slate-700">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Built from</dt>
                <dd className="min-w-0 break-words">{getContentOriginLabel(contentOrigin)}</dd>

                <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Support</dt>
                <dd className="min-w-0 break-words">{getSupportOriginLabel(supportOrigin, hasEvidence, requirementSource)}</dd>
              </dl>
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
                  ? 'Rewrite this so it clearly matches background you can honestly stand behind.'
                  : isCodeRed
                    ? 'Reconnect this line to real adjacent experience or honest working knowledge.'
                    : 'Tighten this line with clearer proof, scope, or outcome.'}
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

          <div className="mt-3 space-y-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Recommended first moves
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {recommendedAiActions.map(({ action, label }) => (
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
                    className="resume-inline-panel__action resume-inline-panel__action--primary"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {(followOnAiActions.length > 0 || polishAiActions.length > 0) && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Other AI edits
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {followOnAiActions.map(({ action, label }) => (
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
                      className="resume-inline-panel__action resume-inline-panel__action--secondary"
                    >
                      {label}
                    </button>
                  ))}
                  {polishAiActions.map(({ action, label }) => (
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
                      className="resume-inline-panel__action resume-inline-panel__action--tertiary"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
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

          <p className="mt-2 text-xs leading-5 text-slate-500">
            {applyHelperText}
          </p>

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

function resolveReviewState(
  reviewState: ResumeReviewState | undefined,
  confidence: BulletConfidence,
  requirementSource?: RequirementSource,
): ResumeReviewState {
  if (reviewState) return reviewState;
  if (confidence === 'needs_validation' && requirementSource === 'benchmark') return 'confirm_fit';
  if (confidence === 'needs_validation') return 'code_red';
  if (confidence === 'partial') return 'strengthen';
  return 'supported';
}

function isResolvedReviewState(reviewState: ResumeReviewState): boolean {
  return reviewState === 'supported' || reviewState === 'supported_rewrite';
}

function getConfidenceLineClass(
  reviewState: ResumeReviewState | undefined,
  confidence: BulletConfidence,
  requirementSource?: RequirementSource,
): string {
  const resolved = resolveReviewState(reviewState, confidence, requirementSource);
  switch (resolved) {
    case 'supported':
    case 'supported_rewrite':
      return 'resume-proof-line--strong';
    case 'strengthen':
      return 'resume-proof-line--partial';
    case 'confirm_fit':
      return 'resume-proof-line--benchmark';
    case 'code_red':
      return 'resume-proof-line--code-red';
    default:
      return '';
  }
}

function getConfidencePill(
  reviewState: ResumeReviewState,
  requirementSource?: RequirementSource,
): { label: string; className: string } | null {
  if (reviewState === 'strengthen') {
    return {
      label: 'Strengthen',
      className:
        'resume-proof-meta-label resume-proof-meta-label--partial',
    };
  }

  if (reviewState === 'confirm_fit' || (reviewState === 'code_red' && requirementSource === 'benchmark')) {
    return {
      label: 'Confirm Fit',
      className:
        'resume-proof-meta-label resume-proof-meta-label--benchmark',
    };
  }

  if (reviewState === 'code_red') {
    return {
      label: 'Code Red',
      className:
        'resume-proof-meta-label resume-proof-meta-label--code-red',
    };
  }

  return null;
}

function getConfidenceSourceLabel(
  reviewState: ResumeReviewState,
  requirementSource?: RequirementSource,
): string | null {
  if (isResolvedReviewState(reviewState)) return null;
  return requirementSource === 'benchmark' ? 'Benchmark Signal' : 'Job Need';
}

function normalizeRequirementKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokenizeRequirementValue(value: string): string[] {
  return normalizeRequirementKey(value).split(/\s+/).filter(Boolean);
}

function getTokenOverlapScore(a: string, b: string): number {
  const aTokens = new Set(tokenizeRequirementValue(a));
  const bTokens = new Set(tokenizeRequirementValue(b));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let shared = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) shared += 1;
  }
  return shared / Math.max(aTokens.size, bTokens.size);
}

function requirementLooksLikeBulletText(requirement: string, bulletText: string): boolean {
  const normalizedRequirement = normalizeRequirementKey(requirement);
  const normalizedBullet = normalizeRequirementKey(bulletText);
  if (!normalizedRequirement || !normalizedBullet) return false;
  if (normalizedRequirement === normalizedBullet) return true;
  if (normalizedBullet.includes(normalizedRequirement) || normalizedRequirement.includes(normalizedBullet)) return true;
  return getTokenOverlapScore(requirement, bulletText) >= 0.72;
}

function findRequirementCatalogMatch(
  rawRequirement: string,
  requirementCatalog: Array<{ requirement: string; source?: RequirementSource }>,
  requirementSource: RequirementSource,
): string | null {
  const normalizedRaw = normalizeRequirementKey(rawRequirement);
  if (!normalizedRaw) return null;

  const scopedCatalog = requirementCatalog.filter((item) => !item.source || item.source === requirementSource);
  for (const entry of scopedCatalog) {
    const normalizedEntry = normalizeRequirementKey(entry.requirement);
    if (!normalizedEntry) continue;
    if (normalizedEntry === normalizedRaw) return entry.requirement;
    if (normalizedEntry.includes(normalizedRaw) || normalizedRaw.includes(normalizedEntry)) return entry.requirement;
  }

  let bestMatch: string | null = null;
  let bestScore = 0;
  const rawTokens = new Set(normalizedRaw.split(/\s+/).filter(Boolean));
  for (const entry of scopedCatalog) {
    const normalizedEntry = normalizeRequirementKey(entry.requirement);
    const entryTokens = new Set(normalizedEntry.split(/\s+/).filter(Boolean));
    let shared = 0;
    for (const token of rawTokens) {
      if (entryTokens.has(token)) shared += 1;
    }
    const score = shared === 0 ? 0 : shared / Math.max(rawTokens.size, entryTokens.size);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry.requirement;
    }
  }

  return bestScore >= 0.45 ? bestMatch : null;
}

function inferRequirementFromBulletText(
  bulletText: string,
  requirementCatalog: Array<{ requirement: string; source?: RequirementSource }>,
  requirementSource: RequirementSource,
): string | null {
  const scopedCatalog = requirementCatalog.filter((item) => !item.source || item.source === requirementSource);
  if (scopedCatalog.length === 0) return null;
  if (scopedCatalog.length === 1) return scopedCatalog[0].requirement;

  let bestMatch: string | null = null;
  let bestScore = 0;
  for (const entry of scopedCatalog) {
    const score = getTokenOverlapScore(bulletText, entry.requirement);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry.requirement;
    }
  }

  return bestScore >= 0.18 ? bestMatch : null;
}

function resolveDisplayRequirements(
  rawRequirements: string[],
  requirementCatalog: Array<{ requirement: string; source?: RequirementSource }>,
  requirementSource: RequirementSource,
  bulletText?: string,
): string[] {
  const filteredRequirements = rawRequirements.filter((requirement) => {
    const cleaned = typeof requirement === 'string' ? requirement.trim() : '';
    if (!cleaned) return false;
    if (!bulletText) return true;
    return !requirementLooksLikeBulletText(cleaned, bulletText);
  });

  const validated = filteredRequirements
    .map((requirement) => findRequirementCatalogMatch(requirement, requirementCatalog, requirementSource))
    .filter((value): value is string => Boolean(value));

  if (validated.length > 0) {
    return Array.from(new Set(validated));
  }

  if (bulletText) {
    const inferredFromBullet = findRequirementCatalogMatch(bulletText, requirementCatalog, requirementSource)
      ?? inferRequirementFromBulletText(bulletText, requirementCatalog, requirementSource);
    if (inferredFromBullet) {
      return [inferredFromBullet];
    }
  }

  return Array.from(new Set(filteredRequirements)).slice(0, 3);
}

function resolvePrimaryDisplayRequirement(
  rawRequirements: string[],
  requirementCatalog: Array<{ requirement: string; source?: RequirementSource }>,
  requirementSource: RequirementSource,
  bulletText?: string,
): string | null {
  const resolved = resolveDisplayRequirements(
    rawRequirements,
    requirementCatalog,
    requirementSource,
    bulletText,
  );

  return resolved[0] ?? null;
}

function getContentOriginLabel(
  contentOrigin: ResumeContentOrigin | undefined,
): string {
  if (contentOrigin === 'verbatim_resume') return 'Direct resume line';
  if (contentOrigin === 'resume_rewrite') return 'Resume rewrite';
  if (contentOrigin === 'multi_source_synthesis') return 'Resume-backed synthesis';
  return 'Gap-closing draft';
}

function getSupportOriginLabel(
  supportOrigin: ResumeSupportOrigin | undefined,
  hasEvidence: boolean,
  requirementSource?: RequirementSource,
): string {
  if (supportOrigin === 'user_confirmed_context') return 'User-confirmed context';
  if (supportOrigin === 'adjacent_resume_inference') return 'Adjacent resume proof';
  if (supportOrigin === 'original_resume' || hasEvidence) return 'Resume support found';
  if (requirementSource === 'benchmark') return 'Not directly confirmed';
  return 'No direct resume proof yet';
}

function getInlinePanelTone(
  reviewState: ResumeReviewState,
  requirementSource: RequirementSource,
): string {
  if (isResolvedReviewState(reviewState)) {
    return 'resume-inline-panel__status--supported';
  }
  if (reviewState === 'strengthen') {
    return 'resume-inline-panel__status--partial';
  }
  if (reviewState === 'confirm_fit' || requirementSource === 'benchmark') {
    return 'resume-inline-panel__status--benchmark';
  }
  return 'resume-inline-panel__status--code-red';
}

function getInlinePanelIntro(
  reviewState: ResumeReviewState,
  requirementSource: RequirementSource,
): string {
  if (reviewState === 'strengthen') {
    return 'This is part of the strongest resume we can build for this role, but the proof in this line still needs to be sharper.';
  }
  if (reviewState === 'confirm_fit' || requirementSource === 'benchmark') {
    return 'This is the ultimate-resume draft for this role. The line is aimed at a benchmark signal, and now we need to anchor it in background you can honestly stand behind.';
  }
  return 'This is the ultimate-resume draft for this role. The line is aimed at a real job need, and now we need to anchor it in proof you can honestly support.';
}

function getInlinePanelFlagReason(
  reviewState: ResumeReviewState,
  requirementSource: RequirementSource,
): string {
  if (isResolvedReviewState(reviewState)) {
    return 'The supporting proof is already present.';
  }
  if (reviewState === 'strengthen') {
    return 'The line reads as plausible, but the proof is still too thin or too generic.';
  }
  if (reviewState === 'confirm_fit' || requirementSource === 'benchmark') {
    return 'This may be the right kind of benchmark claim, but we still need to confirm it honestly matches your background.';
  }
  return 'We do not yet have direct resume proof for this exact claim.';
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-xs font-bold tracking-[0.2em] uppercase text-gray-500 border-b border-gray-200 pb-1 sm:text-[13px]">
      {children}
    </h3>
  );
}
