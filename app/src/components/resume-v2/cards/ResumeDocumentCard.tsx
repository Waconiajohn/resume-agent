import type { ReactNode } from 'react';
import { Pencil } from 'lucide-react';
import type {
  ResumeDraft,
  BulletConfidence,
  NextBestAction,
  ProofLevel,
  RequirementSource,
  ResumeReviewState,
  ActiveContextChip,
} from '@/types/resume-v2';
import type { OptimisticResumeEditMetadata } from '@/lib/resume-edit-progress';
import { canonicalRequirementSignals } from '@/lib/resume-requirement-signals';
import { getEnabledResumeSectionPlan, getResumeCustomSectionMap } from '@/lib/resume-section-plan';

// ─── Context Chip Resolution ─────────────────────────────────────────

const CHIP_STYLES: Record<ActiveContextChip['source'], string> = {
  requirement: 'bg-blue-50 text-blue-600',
  positioning: 'bg-indigo-50 text-indigo-600',
  rationale: 'bg-slate-50 text-slate-600',
  gap_prompt: 'bg-amber-50 text-amber-700',
};

function resolveContextChip(
  requirements: string[],
  sectionType: 'experience' | 'summary' | 'competencies' | 'custom',
  brandedTitle?: string,
  sectionRationale?: string,
): ActiveContextChip | null {
  // Priority 1: Mapped JD requirement
  if (requirements.length > 0) {
    const label = requirements[0];
    return {
      label: label.length > 60 ? `${label.slice(0, 57)}…` : label,
      source: 'requirement',
      tooltip: label.length > 60 ? label : undefined,
    };
  }
  // Priority 2: Section rationale (custom sections)
  if (sectionType === 'custom' && sectionRationale) {
    return {
      label: sectionRationale.length > 60 ? `${sectionRationale.slice(0, 57)}…` : sectionRationale,
      source: 'rationale',
      tooltip: sectionRationale.length > 60 ? sectionRationale : undefined,
    };
  }
  // Priority 3: Positioning angle (executive summary)
  if (sectionType === 'summary' && brandedTitle) {
    return {
      label: brandedTitle.length > 60 ? `${brandedTitle.slice(0, 57)}…` : brandedTitle,
      source: 'positioning',
      tooltip: brandedTitle.length > 60 ? brandedTitle : undefined,
    };
  }
  return null;
}

function ContextChipTag({ chip, isVisible }: { chip: ActiveContextChip | null; isVisible: boolean }) {
  if (!chip) return null;
  return (
    <span
      aria-hidden="true"
      title={chip.tooltip}
      className={`inline-flex items-center mt-1 ml-0.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium
        ${CHIP_STYLES[chip.source]}
        transition-all duration-200
        ${isVisible
          ? 'opacity-100 translate-y-0 pointer-events-none'
          : 'opacity-0 -translate-y-1 pointer-events-none'
        }`}
    >
      {chip.label}
    </span>
  );
}

interface ResumeDocumentCardProps {
  resume: ResumeDraft;
  requirementCatalog?: Array<{ requirement: string; source?: RequirementSource }>;
  /** Which bullet is currently selected for inline editing */
  activeBullet?: { section: string; index: number } | null;
  /** Click handler for bullet selection */
  onBulletClick?: (
    text: string,
    section: string,
    index: number,
    requirements: string[],
    reviewState: ResumeReviewState,
    requirementSource: RequirementSource | undefined,
    evidenceFound: string,
    workItemId?: string,
    proofLevel?: ProofLevel,
    nextBestAction?: NextBestAction,
    canRemove?: boolean,
    isAIEnhanced?: boolean,
  ) => void;
  /** Direct edit callback — saves edited text back into the resume */
  onBulletEdit?: (section: string, index: number, newText: string, metadata?: OptimisticResumeEditMetadata) => void;
  /** Remove a bullet from the resume */
  onBulletRemove?: (section: string, index: number) => void;
}

function getResumeLineToken(section: string, index: number): string {
  return `${section}:${index}`;
}

export function ResumeDocumentCard({
  resume,
  requirementCatalog = [],
  activeBullet = null,
  onBulletClick,
  onBulletEdit,
  onBulletRemove,
}: ResumeDocumentCardProps) {
  const coreCompetencies = Array.isArray(resume.core_competencies) ? resume.core_competencies : [];
  const selectedAccomplishments = Array.isArray(resume.selected_accomplishments) ? resume.selected_accomplishments : [];
  const professionalExperience = Array.isArray(resume.professional_experience) ? resume.professional_experience : [];
  const earlierCareer = Array.isArray(resume.earlier_career) ? resume.earlier_career : [];
  const education = Array.isArray(resume.education) ? resume.education : [];
  const certifications = Array.isArray(resume.certifications) ? resume.certifications : [];

  // Flagged-only bullet numbering: only bullets that need attention get sequential numbers.
  // "Done" states (supported, supported_rewrite) are not numbered.
  // We do a pre-pass over all numbered bullet positions to assign sequential flagged numbers.
  type BulletKey = string; // `${section}:${index}`
  const flaggedBulletNumbers = new Map<BulletKey, number>();
  let flaggedBulletCounter = 0;

  const isFlaggedReviewState = (state: ResumeReviewState): boolean =>
    state === 'strengthen' || state === 'confirm_fit' || state === 'code_red';

  // Selected accomplishments
  for (let i = 0; i < selectedAccomplishments.length; i++) {
    const resolved = resolveReviewState(
      selectedAccomplishments[i].review_state,
      selectedAccomplishments[i].confidence,
      selectedAccomplishments[i].requirement_source,
    );
    if (isFlaggedReviewState(resolved)) {
      flaggedBulletCounter += 1;
      flaggedBulletNumbers.set(`selected_accomplishments:${i}`, flaggedBulletCounter);
    }
  }

  // Professional experience bullets
  for (const exp of professionalExperience) {
    const bullets = Array.isArray(exp.bullets) ? exp.bullets : [];
    for (let j = 0; j < bullets.length; j++) {
      const bullet = bullets[j];
      const resolved = resolveReviewState(
        bullet.review_state,
        bullet.confidence,
        bullet.requirement_source,
      );
      if (isFlaggedReviewState(resolved)) {
        flaggedBulletCounter += 1;
        const expIdx = professionalExperience.indexOf(exp);
        const bulletIndex = expIdx * 100 + j;
        flaggedBulletNumbers.set(`professional_experience:${bulletIndex}`, flaggedBulletCounter);
      }
    }
  }

  const customSections = getResumeCustomSectionMap(resume);
  const sectionNodes = new Map<string, ReactNode>();

  sectionNodes.set('executive_summary', (
    <section key="executive_summary" data-section="executive_summary">
      <SectionHeading>Executive Summary</SectionHeading>
      {onBulletClick ? (
        <div
          data-resume-line={getResumeLineToken('executive_summary', 0)}
          data-active-line={activeBullet?.section === 'executive_summary' && activeBullet.index === 0 ? 'true' : undefined}
          className={`resume-line-card group relative cursor-pointer rounded-xl px-2.5 py-2 -mx-2.5 transition-all hover:bg-white/70 ${
            activeBullet?.section === 'executive_summary' && activeBullet.index === 0
              ? 'resume-line-active'
              : resume.executive_summary.is_new
                ? 'resume-proof-line--partial'
                : ''
          }`}
        >
          <p
            role="button"
            tabIndex={0}
            className="resume-document-copy text-sm leading-relaxed text-gray-800"
            title="Click to edit the executive summary"
            onClick={() => onBulletClick(
              resume.executive_summary.content,
              'executive_summary',
              0,
              resolveStandaloneDisplayRequirements(
                resume.executive_summary.addresses_requirements ?? [],
                requirementCatalog,
                resume.executive_summary.content,
              ),
              'strengthen' as ResumeReviewState,
              undefined,
              resume.executive_summary.content,
              undefined,
              'adjacent',
              'tighten',
              false,
            )}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onBulletClick(
                  resume.executive_summary.content,
                  'executive_summary',
                  0,
                  resolveStandaloneDisplayRequirements(
                    resume.executive_summary.addresses_requirements ?? [],
                    requirementCatalog,
                    resume.executive_summary.content,
                  ),
                  'strengthen' as ResumeReviewState,
                  undefined,
                  resume.executive_summary.content,
                  undefined,
                  'adjacent',
                  'tighten',
                  false,
                );
              }
            }}
          >
            {resume.executive_summary.content}
          </p>
          <span className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Pencil className="h-3.5 w-3.5 text-gray-400" />
          </span>
          <ContextChipTag
            chip={resolveContextChip(
              resume.executive_summary.addresses_requirements ?? [],
              'summary',
              resume.header.branded_title,
            )}
            isVisible={activeBullet?.section === 'executive_summary' && activeBullet.index === 0}
          />
        </div>
      ) : (
        <p className="resume-document-copy text-sm leading-relaxed text-gray-800">
          {resume.executive_summary.content}
        </p>
      )}
    </section>
  ));

  if (coreCompetencies.length > 0) {
    sectionNodes.set('core_competencies', (
      <section key="core_competencies" data-section="core_competencies">
        <SectionHeading>Core Competencies</SectionHeading>
        <div className="flex flex-wrap gap-2">
          {coreCompetencies.map((comp, i) => (
            <span
              key={i}
              data-resume-line={getResumeLineToken('core_competencies', i)}
              data-active-line={activeBullet?.section === 'core_competencies' && activeBullet.index === i ? 'true' : undefined}
              role={onBulletClick ? 'button' : undefined}
              tabIndex={onBulletClick ? 0 : undefined}
              title={onBulletClick ? 'Click to review and edit this competency' : undefined}
              onClick={onBulletClick ? () => onBulletClick(
                comp,
                'core_competencies',
                i,
                resolveStandaloneDisplayRequirements([], requirementCatalog, comp),
                'strengthen',
                undefined,
                comp,
                undefined,
                'adjacent',
                'tighten',
                true,
              ) : undefined}
              onKeyDown={onBulletClick ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onBulletClick(
                    comp,
                    'core_competencies',
                    i,
                    resolveStandaloneDisplayRequirements([], requirementCatalog, comp),
                    'strengthen',
                    undefined,
                    comp,
                    undefined,
                    'adjacent',
                    'tighten',
                    true,
                  );
                }
              } : undefined}
              className={`resume-competency-chip rounded-full border border-stone-200 bg-stone-50/90 px-3 py-1.5 text-[11px] font-semibold tracking-[0.08em] text-stone-600 ${
                onBulletClick ? 'cursor-pointer transition-colors hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-300/60' : ''
              }${
                activeBullet?.section === 'core_competencies' && activeBullet.index === i
                  ? ' resume-line-active border-[var(--link)] bg-[var(--link)]/6 text-[var(--link)]'
                  : ''
              }`}
            >
              {comp}
            </span>
          ))}
        </div>
      </section>
    ));
  }

  if (selectedAccomplishments.length > 0) {
    sectionNodes.set('selected_accomplishments', (
      <section key="selected_accomplishments" data-section="selected_accomplishments">
        <SectionHeading>Selected Accomplishments</SectionHeading>
        <ul className="resume-proof-list space-y-3 list-none pl-0">
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
            const resolvedState = resolveReviewState(a.review_state, a.confidence, a.requirement_source);
            const isActive = activeBullet?.section === 'selected_accomplishments' && activeBullet.index === i;

            return (
              <li
                key={i}
                data-bullet-id={`selected_accomplishments-${i}`}
                data-resume-line={getResumeLineToken('selected_accomplishments', i)}
                data-active-line={isActive ? 'true' : undefined}
                data-confidence={a.confidence}
                className={`resume-proof-line text-sm leading-relaxed text-gray-800 ${
                  getConfidenceLineClass(a.review_state, a.confidence, a.requirement_source)
                }${isActive ? ' resume-line-active' : ''}`}
                {...(hasStrategy
                  ? { 'data-addresses': JSON.stringify(accomplishmentRequirements) }
                  : {})}
              >
                <BulletLineContent
                  text={a.content}
                  confidence={a.confidence}
                  reviewState={a.review_state}
                  requirementSource={a.requirement_source}
                  section="selected_accomplishments"
                  bulletIndex={i}
                  globalNumber={flaggedBulletNumbers.get(`selected_accomplishments:${i}`)}
                  requirements={accomplishmentDisplayTargets}
                  resolvedState={resolvedState}
                  evidenceFound={a.evidence_found}
                  workItemId={a.work_item_id}
                  proofLevel={a.proof_level}
                  nextBestAction={a.next_best_action}
                  isAIEnhanced={a.is_new}
                  isActive={isActive}
                  onBulletClick={onBulletClick}
                />
              </li>
            );
          })}
        </ul>
      </section>
    ));
  }

  if (professionalExperience.length > 0) {
    sectionNodes.set('professional_experience', (
      <section key="professional_experience" data-section="professional_experience">
        <SectionHeading>Professional Experience</SectionHeading>
        <div className="space-y-7">
          {professionalExperience.map((exp, i) => (
            <div key={i}>
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <span className="resume-role-title text-[1rem] font-semibold text-gray-900">{exp.title}</span>
                  <span className="resume-role-company ml-1.5 text-[0.93rem] text-gray-500">· {exp.company}</span>
                </div>
                <span className="resume-role-date whitespace-nowrap shrink-0 text-[0.82rem] text-gray-500">
                  {exp.start_date} — {exp.end_date}
                </span>
              </div>
              {exp.scope_statement && (
                onBulletClick ? (
                  <div
                    data-scope-id={`professional_experience-${i}-scope`}
                    data-resume-line={getResumeLineToken('professional_experience', i * 100 - 1)}
                    data-active-line={activeBullet?.section === 'professional_experience' && activeBullet.index === i * 100 - 1 ? 'true' : undefined}
                    className={`resume-line-card group relative mt-1.5 rounded-xl px-2.5 py-1.5 -mx-2.5 transition-all hover:bg-white/70${
                      activeBullet?.section === 'professional_experience' && activeBullet.index === i * 100 - 1
                        ? ' resume-line-active'
                        : ''
                    }`}
                  >
                    <p
                      role="button"
                      tabIndex={0}
                      className={`resume-scope-note text-[0.94rem] text-gray-500 italic${exp.scope_statement_is_new ? ' resume-proof-line resume-proof-line--partial' : ''}`}
                      title="Click to edit this role scope"
                      onClick={() => onBulletClick(
                        exp.scope_statement!,
                        'professional_experience',
                        i * 100 - 1,
                        [],
                        'strengthen' as ResumeReviewState,
                        undefined,
                        exp.scope_statement!,
                        undefined,
                        'adjacent',
                        'tighten',
                        false,
                      )}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onBulletClick(
                            exp.scope_statement!,
                            'professional_experience',
                            i * 100 - 1,
                            [],
                            'strengthen' as ResumeReviewState,
                            undefined,
                            exp.scope_statement!,
                            undefined,
                            'adjacent',
                            'tighten',
                            false,
                          );
                        }
                      }}
                    >
                      {exp.scope_statement}
                    </p>
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Pencil className="h-3.5 w-3.5 text-gray-400" />
                    </span>
                  </div>
                ) : (
                  <p
                    data-scope-id={`professional_experience-${i}-scope`}
                    className={`resume-scope-note mt-1.5 pl-0.5 text-[0.94rem] text-gray-500 italic${exp.scope_statement_is_new ? ' resume-proof-line resume-proof-line--partial' : ''}`}
                  >
                    {exp.scope_statement}
                  </p>
                )
              )}
              <ul className="resume-proof-list mt-2.5 space-y-3 list-none pl-0">
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
                  const resolvedState = resolveReviewState(bullet.review_state, bullet.confidence, bullet.requirement_source);
                  const isActive = activeBullet?.section === 'professional_experience' && activeBullet.index === bulletIndex;

                  return (
                    <li
                      key={j}
                      data-bullet-id={`professional_experience-${bulletIndex}`}
                      data-resume-line={getResumeLineToken('professional_experience', bulletIndex)}
                      data-active-line={isActive ? 'true' : undefined}
                      data-confidence={bullet.confidence}
                      className={`resume-proof-line text-sm leading-relaxed text-gray-800 ${
                        getConfidenceLineClass(bullet.review_state, bullet.confidence, bullet.requirement_source)
                      }${isActive ? ' resume-line-active' : ''}`}
                      {...(hasStrategy
                        ? { 'data-addresses': JSON.stringify(bulletRequirements) }
                        : {})}
                    >
                      <BulletLineContent
                        text={bullet.text}
                        confidence={bullet.confidence}
                        reviewState={bullet.review_state}
                        requirementSource={bullet.requirement_source}
                        section="professional_experience"
                        bulletIndex={bulletIndex}
                        globalNumber={flaggedBulletNumbers.get(`professional_experience:${bulletIndex}`)}
                        requirements={bulletDisplayTargets}
                        resolvedState={resolvedState}
                        evidenceFound={bullet.evidence_found}
                        workItemId={bullet.work_item_id}
                        proofLevel={bullet.proof_level}
                        nextBestAction={bullet.next_best_action}
                        isAIEnhanced={bullet.is_new}
                        isActive={isActive}
                        onBulletClick={onBulletClick}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>
    ));
  }

  if (earlierCareer.length > 0) {
    sectionNodes.set('earlier_career', (
      <section key="earlier_career" data-section="earlier_career">
        <SectionHeading>Earlier Career</SectionHeading>
        <div className="space-y-1">
          {earlierCareer.map((ec, i) => (
            <div key={i} className="flex items-baseline justify-between text-sm">
              <span className="resume-document-copy text-gray-600">
                {ec.title}{' '}
                <span className="resume-role-company text-gray-500">· {ec.company}</span>
              </span>
              <span className="resume-role-date text-xs text-gray-500">{ec.dates}</span>
            </div>
          ))}
        </div>
      </section>
    ));
  }

  if (education.length > 0) {
    sectionNodes.set('education', (
      <section key="education" data-section="education">
        <SectionHeading>Education</SectionHeading>
        <div className="space-y-1">
          {education.map((edu, i) => (
            <div key={i} className="resume-document-copy text-[0.95rem] text-gray-800">
              {edu.degree} — {edu.institution}
              {edu.year && <span className="resume-role-date text-gray-500"> ({edu.year})</span>}
            </div>
          ))}
        </div>
      </section>
    ));
  }

  if (certifications.length > 0) {
    sectionNodes.set('certifications', (
      <section key="certifications" data-section="certifications">
        <SectionHeading>Certifications</SectionHeading>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {certifications.map((cert, i) => (
            <span key={i} className="resume-document-copy text-[0.95rem] text-gray-600">{cert}</span>
          ))}
        </div>
      </section>
    ));
  }

  for (const [sectionId, section] of customSections.entries()) {
    if (section.lines.length === 0 && !section.summary) continue;
    const customSectionKey = `custom_section:${sectionId}`;
    const summaryText = section.summary;
    sectionNodes.set(sectionId, (
      <section key={sectionId} data-section={sectionId}>
        <SectionHeading>{section.title}</SectionHeading>
        {summaryText && (
          onBulletClick ? (
            <div
              data-resume-line={getResumeLineToken(customSectionKey, -1)}
              data-active-line={activeBullet?.section === customSectionKey && activeBullet.index === -1 ? 'true' : undefined}
              className={`resume-line-card group relative mb-2 rounded-xl px-2.5 py-2 -mx-2.5 transition-all hover:bg-white/70 ${
                activeBullet?.section === customSectionKey && activeBullet.index === -1
                  ? 'resume-line-active'
                  : ''
              }`}
            >
              <p
                role="button"
                tabIndex={0}
                className="resume-document-copy text-sm leading-relaxed text-gray-700"
                title={`Click to edit the ${section.title} summary`}
                onClick={() => onBulletClick(
                  summaryText,
                  customSectionKey,
                  -1,
                  resolveStandaloneDisplayRequirements([], requirementCatalog, summaryText),
                  'strengthen',
                  undefined,
                  summaryText,
                  undefined,
                  'adjacent',
                  'tighten',
                  false,
                )}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onBulletClick(
                      summaryText,
                      customSectionKey,
                      -1,
                      resolveStandaloneDisplayRequirements([], requirementCatalog, summaryText),
                      'strengthen',
                      undefined,
                      summaryText,
                      undefined,
                      'adjacent',
                      'tighten',
                      false,
                    );
                  }
                }}
              >
                {summaryText}
              </p>
              <span className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Pencil className="h-3.5 w-3.5 text-gray-400" />
              </span>
              <ContextChipTag
                chip={resolveContextChip([], 'custom', undefined, section.rationale)}
                isVisible={activeBullet?.section === customSectionKey && activeBullet.index === -1}
              />
            </div>
          ) : (
            <p className="resume-document-copy mb-2 text-sm leading-relaxed text-gray-700">{summaryText}</p>
          )
        )}
        <div className="space-y-1.5">
          {section.kind === 'paragraph'
            ? section.lines.map((line, index) => (
              onBulletClick ? (
                <div
                  key={index}
                  data-resume-line={getResumeLineToken(customSectionKey, index)}
                  data-active-line={activeBullet?.section === customSectionKey && activeBullet.index === index ? 'true' : undefined}
                  className={`resume-line-card group relative rounded-xl px-2.5 py-2 -mx-2.5 transition-all hover:bg-white/70 ${
                    activeBullet?.section === customSectionKey && activeBullet.index === index
                      ? 'resume-line-active'
                      : ''
                  }`}
                >
                  <p
                    role="button"
                    tabIndex={0}
                    className="resume-document-copy text-sm leading-relaxed text-gray-800"
                    title={`Click to review and edit this ${section.title} line`}
                    onClick={() => onBulletClick(
                      line,
                      customSectionKey,
                      index,
                      resolveStandaloneDisplayRequirements([], requirementCatalog, line),
                      'strengthen',
                      undefined,
                      line,
                      undefined,
                      'adjacent',
                      'tighten',
                      true,
                    )}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onBulletClick(
                          line,
                          customSectionKey,
                          index,
                          resolveStandaloneDisplayRequirements([], requirementCatalog, line),
                          'strengthen',
                          undefined,
                          line,
                          undefined,
                          'adjacent',
                          'tighten',
                          true,
                        );
                      }
                    }}
                  >
                    {line}
                  </p>
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Pencil className="h-3.5 w-3.5 text-gray-400" />
                  </span>
                </div>
              ) : (
                <p key={index} className="resume-document-copy text-sm leading-relaxed text-gray-800">{line}</p>
              )
            ))
            : (
              <ul className="resume-proof-list space-y-2 list-none pl-0">
                {section.lines.map((line, index) => (
                  <li key={index} className="text-sm leading-relaxed text-gray-800">
                    {onBulletClick ? (
                      <div
                        data-resume-line={getResumeLineToken(customSectionKey, index)}
                        data-active-line={activeBullet?.section === customSectionKey && activeBullet.index === index ? 'true' : undefined}
                        className={`resume-line-card group relative rounded-xl px-2.5 py-2 -mx-2.5 transition-all hover:bg-white/70 ${
                        activeBullet?.section === customSectionKey && activeBullet.index === index
                          ? 'resume-line-active'
                          : ''
                      }`}
                      >
                        <p
                          role="button"
                          tabIndex={0}
                          className="resume-document-copy text-sm leading-relaxed text-gray-800"
                          title={`Click to review and edit this ${section.title} line`}
                          onClick={() => onBulletClick(
                            line,
                            customSectionKey,
                            index,
                            resolveStandaloneDisplayRequirements([], requirementCatalog, line),
                            'strengthen',
                            undefined,
                            line,
                            undefined,
                            'adjacent',
                            'tighten',
                            true,
                          )}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onBulletClick(
                                line,
                                customSectionKey,
                                index,
                                resolveStandaloneDisplayRequirements([], requirementCatalog, line),
                                'strengthen',
                                undefined,
                                line,
                                undefined,
                                'adjacent',
                                'tighten',
                                true,
                              );
                            }
                          }}
                        >
                          {line}
                        </p>
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Pencil className="h-3.5 w-3.5 text-gray-400" />
                        </span>
                      </div>
                    ) : (
                      <span className="resume-document-copy">{line}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
        </div>
      </section>
    ));
  }

  const orderedSectionIds = getEnabledResumeSectionPlan(resume)
    .map((item) => item.id)
    .filter((id) => sectionNodes.has(id));

  return (
    <div className={`resume-document-shell space-y-6 p-6 font-['Georgia','Times_New_Roman',serif] leading-[1.85] select-text cursor-text sm:space-y-7 sm:p-9${activeBullet ? ' resume-has-active-bullet' : ''}`}>
      {/* Header */}
      <div data-section="header" className="resume-document-header text-center border-b border-gray-200 pb-6 sm:pb-7">
        <h2 className="resume-document-name text-[2.08rem] font-semibold tracking-[-0.028em] text-gray-900 sm:text-[2.62rem]">{resume.header.name}</h2>
        <p className="resume-document-title mt-2.5 text-[0.76rem] font-semibold tracking-[0.24em] text-blue-700 uppercase sm:text-[0.9rem]">
          {resume.header.branded_title}
        </p>
        <div className="resume-document-contact mt-4 flex flex-wrap items-center justify-center gap-x-0 gap-y-1 text-[11.5px] text-gray-500 sm:flex-row sm:text-[12.5px]">
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

      {orderedSectionIds.map((sectionId) => sectionNodes.get(sectionId))}
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
  /** Continuous 1-based number across all bullets in the resume. */
  globalNumber?: number;
  requirements: string[];
  resolvedState: ResumeReviewState;
  evidenceFound?: string;
  workItemId?: string;
  proofLevel?: ProofLevel;
  nextBestAction?: NextBestAction;
  /** True when this bullet was AI-generated/enhanced (is_new on the source bullet). */
  isAIEnhanced?: boolean;
  /** True when this bullet is currently selected for coaching. */
  isActive?: boolean;
  /** Click handler — marks this bullet active, surfacing coaching in the left panel. When provided, ALL bullets are clickable regardless of review state. */
  onBulletClick?: (
    text: string,
    section: string,
    index: number,
    requirements: string[],
    reviewState: ResumeReviewState,
    requirementSource: RequirementSource | undefined,
    evidenceFound: string,
    workItemId?: string,
    proofLevel?: ProofLevel,
    nextBestAction?: NextBestAction,
    canRemove?: boolean,
    isAIEnhanced?: boolean,
  ) => void;
}

function BulletLineContent({
  text,
  confidence,
  reviewState,
  requirementSource,
  section,
  bulletIndex,
  globalNumber,
  requirements,
  resolvedState,
  evidenceFound,
  workItemId,
  proofLevel,
  nextBestAction,
  isAIEnhanced,
  isActive,
  onBulletClick,
}: BulletLineContentProps) {
  const resolvedReviewState = resolveReviewState(reviewState, confidence, requirementSource);
  const isClickable = !!onBulletClick;

  const handleActivate = () => {
    if (isClickable) {
      onBulletClick!(text, section, bulletIndex, requirements, resolvedState, requirementSource, evidenceFound ?? '', workItemId, proofLevel, nextBestAction, true, isAIEnhanced);
    }
  };

  // Resolve the context chip for this bullet
  const contextChip = isActive
    ? resolveContextChip(requirements, section.startsWith('custom_section:') ? 'custom' : 'experience')
    : null;

  return (
    <span className="block">
      {isClickable ? (
        <span className="group flex items-start gap-1">
          <span className="min-w-0 flex-1">
            <span
              role="button"
              tabIndex={0}
              title="Click to review and edit this bullet"
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
              className="resume-bullet-interactive resume-bullet-interactive--flagged block rounded-xl px-2.5 py-1.5 -mx-2.5 font-normal text-gray-900 focus-visible:ring-1 focus-visible:ring-blue-300/60 focus-visible:outline-none"
            >
              {globalNumber !== undefined && (
                <sup className="text-[10px] text-gray-400 mr-1 not-italic font-normal select-none">{globalNumber}</sup>
              )}
              {text}
            </span>
            {/* Floating context chip — source-aware styling */}
            <ContextChipTag chip={contextChip} isVisible={!!isActive && !!contextChip} />
          </span>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity mt-1.5 shrink-0" aria-hidden="true">
            <Pencil className="h-3.5 w-3.5 text-gray-400" />
          </span>
        </span>
      ) : (
        <span className="block font-normal text-gray-800">
          {globalNumber !== undefined && (
            <sup className="text-[10px] text-gray-400 mr-1 not-italic font-normal select-none">{globalNumber}</sup>
          )}
          {text}
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
    case 'confirm_fit':
      // Both "needs strengthening" and "confirm fit" use amber — they both mean
      // "review this." The user doesn't need to know the backend distinction.
      return 'resume-proof-line--partial';
    case 'code_red':
      return 'resume-proof-line--code-red';
    default:
      return '';
  }
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

function resolveStandaloneDisplayRequirements(
  rawRequirements: string[],
  requirementCatalog: Array<{ requirement: string; source?: RequirementSource }>,
  lineText?: string,
): string[] {
  const cleaned = rawRequirements
    .map((requirement) => requirement.trim())
    .filter(Boolean);

  if (cleaned.length > 0) {
    return Array.from(new Set(cleaned));
  }

  if (!lineText?.trim() || requirementCatalog.length === 0) {
    return [];
  }

  let bestMatch: string | null = null;
  let bestScore = 0;
  for (const entry of requirementCatalog) {
    const score = getTokenOverlapScore(lineText, entry.requirement);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry.requirement;
    }
  }

  return bestMatch && bestScore >= 0.18 ? [bestMatch] : [];
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="resume-section-heading mb-4 border-b border-stone-200/80 pb-2.5 text-[10.5px] font-semibold uppercase tracking-[0.28em] text-stone-500 sm:text-[11.5px]">
      {children}
    </h3>
  );
}
