/**
 * Work Mode Classifier — keyword-based work arrangement detection.
 *
 * No LLM required. Classifies jobs as remote / hybrid / onsite / unknown
 * from title, description, location, and structured extensions arrays.
 *
 * Priority order:
 *   1. Exact "Remote" extension label (most reliable — comes from the job board itself)
 *   2. Strong remote/hybrid/onsite phrases
 *   3. Weak "remote" keyword with negation guard
 *   4. Unknown fallback
 */

export type WorkMode = 'remote' | 'hybrid' | 'onsite' | 'unknown';

/**
 * Classify the work arrangement for a job posting.
 *
 * @param title       Job title
 * @param description Full or snippet description text
 * @param location    Location string (e.g., "Remote", "New York, NY")
 * @param extensions  Structured labels from the job board (e.g., ["Full-time", "Remote", "$120K"])
 */
export function classifyWorkMode(
  title: string,
  description: string,
  location?: string,
  extensions?: string[],
): WorkMode {
  const text = `${title} ${description} ${location ?? ''} ${(extensions ?? []).join(' ')}`.toLowerCase();

  // Check extensions first (most reliable — explicit label from job board)
  if (extensions?.some((e) => /^remote$/i.test(e.trim()))) return 'remote';

  // Strong remote signals
  if (
    /\b(fully remote|100% remote|remote position|remote role|work from anywhere|remote-first)\b/.test(
      text,
    )
  )
    return 'remote';

  // Hybrid signals
  if (
    /\b(hybrid|flex schedule|flexible location|partial remote|[23]-days? (in[- ]office|on[- ]site))\b/.test(
      text,
    )
  )
    return 'hybrid';

  // On-site signals
  if (
    /\b(on[- ]site|onsite|in[- ]office|in[- ]person|must be located|relocation required|relocation assistance)\b/.test(
      text,
    )
  )
    return 'onsite';

  // Weak remote signal — just the word "remote" without negation
  if (/\bremote\b/.test(text) && !/\b(not remote|no remote|non[- ]remote)\b/.test(text))
    return 'remote';

  return 'unknown';
}
