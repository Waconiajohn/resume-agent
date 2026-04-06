import { Pencil } from 'lucide-react';
import type {
  ResumeDraft,
  BulletConfidence,
  RequirementSource,
  ResumeReviewState,
} from '@/types/resume-v2';
import { canonicalRequirementSignals } from '@/lib/resume-requirement-signals';
import { REVIEW_STATE_DISPLAY } from '../utils/review-state-labels';

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
  ) => void;
  /** Direct edit callback — saves edited text back into the resume */
  onBulletEdit?: (section: string, index: number, newText: string) => void;
  /** Remove a bullet from the resume */
  onBulletRemove?: (section: string, index: number) => void;
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
              const resolvedState = resolveReviewState(a.review_state, a.confidence, a.requirement_source);
              const isActive = activeBullet?.section === 'selected_accomplishments' && activeBullet.index === i;

              return (
                <li
                  key={i}
                  data-bullet-id={`selected_accomplishments-${i}`}
                  data-confidence={a.confidence}
                  className={`resume-proof-line text-sm leading-relaxed text-gray-800 ${
                    getConfidenceLineClass(a.review_state, a.confidence, a.requirement_source)
                  }${isActive ? ' bg-[var(--link)]/5 border-l-2 border-l-[var(--link)] -ml-2 pl-2' : ''}`}
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
                    requirements={accomplishmentDisplayTargets}
                    resolvedState={resolvedState}
                    evidenceFound={a.evidence_found}
                    isActive={isActive}
                    onBulletClick={onBulletClick}
                  />
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
                    const resolvedState = resolveReviewState(bullet.review_state, bullet.confidence, bullet.requirement_source);
                    const isActive = activeBullet?.section === 'professional_experience' && activeBullet.index === bulletIndex;

                    return (
                      <li
                        key={j}
                        data-bullet-id={`professional_experience-${bulletIndex}`}
                        data-confidence={bullet.confidence}
                        className={`resume-proof-line text-sm leading-relaxed text-gray-800 ${
                          getConfidenceLineClass(bullet.review_state, bullet.confidence, bullet.requirement_source)
                        }${isActive ? ' bg-[var(--link)]/5 border-l-2 border-l-[var(--link)] -ml-2 pl-2' : ''}`}
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
                          requirements={bulletDisplayTargets}
                          resolvedState={resolvedState}
                          evidenceFound={bullet.evidence_found}
                          isActive={isActive}
                          onBulletClick={onBulletClick}
                        />
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
  resolvedState: ResumeReviewState;
  evidenceFound?: string;
  /** Whether this bullet is currently selected for editing in the left panel. */
  isActive?: boolean;
  /** Click handler — marks this bullet active, surfacing coaching in the left panel. Not provided for supported bullets. */
  onBulletClick?: (
    text: string,
    section: string,
    index: number,
    requirements: string[],
    reviewState: ResumeReviewState,
    requirementSource: RequirementSource | undefined,
    evidenceFound: string,
  ) => void;
}

function BulletLineContent({
  text,
  confidence,
  reviewState,
  requirementSource,
  section,
  bulletIndex,
  requirements,
  resolvedState,
  evidenceFound,
  isActive = false,
  onBulletClick,
}: BulletLineContentProps) {
  const resolvedReviewState = resolveReviewState(reviewState, confidence, requirementSource);
  const statusMeta = getConfidencePill(resolvedReviewState, requirementSource);
  const sourceLabel = getConfidenceSourceLabel(resolvedReviewState, requirementSource);
  const isClickable = !!onBulletClick;

  const handleActivate = () => {
    if (isClickable) {
      onBulletClick!(text, section, bulletIndex, requirements, resolvedState, requirementSource, evidenceFound ?? '');
    }
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
      {isClickable ? (
        <span className="group flex items-start gap-1">
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
            className="resume-bullet-interactive resume-bullet-interactive--flagged block cursor-pointer rounded-lg px-2.5 py-1.5 -mx-2.5 font-medium text-gray-900 hover:bg-slate-50/70 transition-colors focus-visible:ring-1 focus-visible:ring-blue-300/60 focus-visible:outline-none min-w-0 flex-1"
          >
            {text}
          </span>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity mt-1.5 shrink-0" aria-hidden="true">
            <Pencil className="h-3.5 w-3.5 text-gray-400" />
          </span>
        </span>
      ) : (
        <span className="block font-normal text-gray-800">
          {text}
        </span>
      )}
      {isActive && (
        <p className="mt-1 text-[10px] text-blue-500">&#8592; Editing in left panel</p>
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
      label: REVIEW_STATE_DISPLAY.strengthen.label,
      className:
        'resume-proof-meta-label resume-proof-meta-label--partial',
    };
  }

  if (reviewState === 'confirm_fit' || (reviewState === 'code_red' && requirementSource === 'benchmark')) {
    return {
      label: REVIEW_STATE_DISPLAY.confirm_fit.label,
      className:
        'resume-proof-meta-label resume-proof-meta-label--benchmark',
    };
  }

  if (reviewState === 'code_red') {
    return {
      label: REVIEW_STATE_DISPLAY.code_red.label,
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

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-xs font-bold tracking-[0.2em] uppercase text-gray-500 border-b border-gray-200 pb-1 sm:text-[13px]">
      {children}
    </h3>
  );
}
