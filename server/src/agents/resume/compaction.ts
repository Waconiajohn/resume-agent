/**
 * Resume-specific compaction helpers for the agent loop.
 *
 * These are passed into AgentConfig.compactionHints and AgentConfig.scratchpadSummaryHook
 * for the Strategist, Craftsman, and Producer agents. This keeps resume vocabulary
 * out of the generic agent-loop.ts infrastructure.
 */

// ─── Resume section entity names ─────────────────────────────────────

/**
 * Section names to detect in dropped conversation messages.
 * Used by extractDroppedMessageSummary() to surface which sections
 * were worked on in the compacted history.
 */
const RESUME_SECTION_NAMES = [
  'summary', 'professional_summary', 'experience', 'skills',
  'education', 'education_and_certifications', 'certifications',
  'selected_accomplishments', 'header',
];

/**
 * Patterns to extract key outcomes from dropped conversation messages.
 * Captures tool-call results like "wrote the experience section" or
 * "self-review score: 85".
 */
const RESUME_OUTCOME_PATTERNS = [
  /(?:wrote|completed|approved|revised|presented)\s+(?:the\s+)?["']?(\w[\w_\s]*?)["']?\s+section/i,
  /section[_\s]+(?:draft|revised|approved).*?["'](\w[\w_\s]*?)["']/i,
  /self.review.*?score.*?(\d+)/i,
];

export const RESUME_COMPACTION_HINTS = {
  sectionNames: RESUME_SECTION_NAMES,
  outcomePatterns: RESUME_OUTCOME_PATTERNS,
};

// ─── Resume scratchpad summary hook ──────────────────────────────────

/**
 * Build a rich scratchpad status summary for resume agent compaction.
 * Lists completed sections and their status (written/reviewed/approved)
 * so the model doesn't forget what's already done.
 *
 * This is passed as AgentConfig.scratchpadSummaryHook for all resume agents.
 * It replaces the generic key-listing with resume-aware status descriptions.
 *
 * Note: `approved_sections` is read from the scratchpad key if present.
 * The resume product stores this as `_approved_sections` on the scratchpad
 * (copied from PipelineState.approved_sections by the onComplete hooks).
 */
export function buildResumeScratchpadSummary(scratchpad: Record<string, unknown>): string {
  const approvedSections =
    Array.isArray(scratchpad['_approved_sections'])
      ? (scratchpad['_approved_sections'] as string[])
      : undefined;

  const sectionEntries: string[] = [];
  const otherKeys: string[] = [];

  for (const [key, val] of Object.entries(scratchpad)) {
    if (key.startsWith('section_') && val && typeof val === 'object') {
      const section = key.replace('section_', '');
      const hasContent = typeof (val as Record<string, unknown>).content === 'string';
      if (hasContent) {
        const presented = scratchpad[`presented_${section}`] === true;
        const approved = approvedSections?.includes(section) === true;
        let status: string;
        if (approved) {
          status = 'written + presented + approved (immutable)';
        } else if (presented) {
          status = 'written + presented';
        } else {
          status = 'written';
        }
        sectionEntries.push(`  - ${section}: ${status}`);
      }
    } else if (
      key === '_final_text' ||
      key.startsWith('presented_') ||
      key === '_approved_sections'
    ) {
      // skip internal keys
    } else if (val !== undefined && val !== null) {
      otherKeys.push(key);
    }
  }

  if (sectionEntries.length === 0) {
    if (otherKeys.length === 0) return '';
    return `Scratchpad data available: ${otherKeys.slice(0, 10).join(', ')}`;
  }

  const parts = ['Completed sections in scratchpad:', ...sectionEntries];
  if (otherKeys.length > 0) {
    parts.push(`Other scratchpad data: ${otherKeys.slice(0, 10).join(', ')}`);
  }
  return parts.join('\n');
}
