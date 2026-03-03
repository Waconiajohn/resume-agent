/**
 * Agent 6: Section Writer
 *
 * Writes one resume section per call. Receives only the slice of the blueprint
 * relevant to that section.
 *
 * In strategic mode (evidence_priorities), the writer has creative freedom to
 * decide how to construct bullets from available evidence and requirements.
 * In legacy mode (bullets_to_write), follows prescriptive instructions.
 *
 * Uses MODEL_PRIMARY (quality writing).
 */

import { llm, MODEL_PRIMARY, MODEL_MID } from '../lib/llm.js';
import { repairJSON } from '../lib/json-repair.js';
import { ATS_RULEBOOK_SNIPPET } from './ats-rules.js';
import type {
  SectionWriterInput,
  SectionWriterOutput,
  ArchitectOutput,
} from './types.js';

/**
 * Write a single resume section based on the Architect's blueprint slice.
 */
export async function runSectionWriter(input: SectionWriterInput): Promise<SectionWriterOutput> {
  const { section, blueprint_slice, evidence_sources, global_rules } = input;

  // Use MODEL_MID for simpler structural sections, MODEL_PRIMARY for creative ones
  const model = ['skills', 'education_and_certifications', 'header'].includes(section)
    ? MODEL_MID
    : MODEL_PRIMARY;

  // Adaptive max_tokens: simpler sections need fewer tokens
  const maxTokens = ['skills', 'education_and_certifications', 'header', 'certifications', 'education'].includes(section)
    ? 2048
    : section === 'summary' || section === 'professional_summary'
      ? 3072
      : 4096;

  const prompt = buildSectionPrompt(section, blueprint_slice, evidence_sources, global_rules, input.cross_section_context);

  const response = await llm.chat({
    model,
    max_tokens: maxTokens,
    system: WRITER_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
    signal: input.signal,
  });

  const parsed = repairJSON<Record<string, unknown>>(response.text);
  if (!parsed) {
    // Fallback: treat entire response as content
    return {
      section,
      content: response.text.trim(),
      keywords_used: [],
      requirements_addressed: [],
      evidence_ids_used: [],
    };
  }

  return {
    section,
    content: coerceContent(parsed.content, response.text),
    keywords_used: (parsed.keywords_used as string[]) ?? [],
    requirements_addressed: (parsed.requirements_addressed as string[]) ?? [],
    evidence_ids_used: (parsed.evidence_ids_used as string[]) ?? [],
  };
}

/**
 * Run a targeted revision on a specific section based on Quality Reviewer feedback.
 */
export async function runSectionRevision(
  section: string,
  original_content: string,
  revision_instruction: string,
  blueprint_slice: Record<string, unknown>,
  global_rules: ArchitectOutput['global_rules'],
  options?: { signal?: AbortSignal },
): Promise<SectionWriterOutput> {
  const response = await llm.chat({
    model: MODEL_PRIMARY,
    max_tokens: 4096,
    system: WRITER_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `REVISION REQUEST for section: ${section}

ORIGINAL CONTENT:
${original_content}

ISSUE TO FIX:
${revision_instruction}

BLUEPRINT CONTEXT:
${JSON.stringify(blueprint_slice, null, 2)}

GLOBAL RULES:
Voice: ${global_rules.voice}
Bullet format: ${global_rules.bullet_format}

Rewrite the section to fix the identified issue. Keep everything that's working — only change what's flagged.

Return ONLY valid JSON:
{
  "content": "The revised section content",
  "keywords_used": ["keywords in the revised version"],
  "requirements_addressed": ["requirements addressed"],
  "evidence_ids_used": ["evidence IDs referenced"]
}`,
    }],
    signal: options?.signal,
  });

  const parsed = repairJSON<Record<string, unknown>>(response.text);
  return {
    section,
    content: coerceContent(parsed?.content, response.text.trim()),
    keywords_used: (parsed?.keywords_used as string[]) ?? [],
    requirements_addressed: (parsed?.requirements_addressed as string[]) ?? [],
    evidence_ids_used: (parsed?.evidence_ids_used as string[]) ?? [],
  };
}

/**
 * Coerce LLM content to a non-empty string.
 * Z.AI sometimes returns content as an array of bullet objects, a nested object,
 * or an empty string. This ensures we always get usable text.
 */
function coerceContent(content: unknown, fallback: string): string {
  if (typeof content === 'string' && content.trim()) return sanitizeAtsUnsafeDelimiters(content);
  if (Array.isArray(content)) {
    // Array of strings or objects — join them
    const lines = content.map((item) =>
      typeof item === 'string' ? item : (item?.text ?? item?.bullet ?? JSON.stringify(item))
    );
    const joined = lines.join('\n');
    if (joined.trim()) return sanitizeAtsUnsafeDelimiters(joined);
  }
  if (content && typeof content === 'object') {
    return sanitizeAtsUnsafeDelimiters(JSON.stringify(content));
  }
  // Content is empty/null/undefined — use raw LLM response as fallback
  return sanitizeAtsUnsafeDelimiters(fallback);
}

function sanitizeAtsUnsafeDelimiters(text: string): string {
  return text.replace(/\s\|\s/g, ', ');
}

/** Check if a blueprint slice uses strategic evidence_priorities mode */
function hasEvidencePriorities(blueprint: Record<string, unknown>): boolean {
  return Array.isArray(blueprint.evidence_priorities) && blueprint.evidence_priorities.length > 0;
}

// ─── System prompt ───────────────────────────────────────────────────

const WRITER_SYSTEM_PROMPT = `You are an expert resume writer. You receive a precise brief for ONE section of a resume and write ONLY that section.

VOICE & AUTHENTICITY:
- When evidence sources include raw interview answers, use the candidate's phrasing as the foundation. Refine for clarity and impact — do NOT rewrite from scratch in corporate jargon.
- Authentic voice beats resume-speak. "Grew the team from 3 to 40 people" beats "Scaled organizational headcount by 1233%."
- If the candidate describes something with a vivid phrase, keep it. That is what makes this resume theirs.

CRITICAL — HONESTY RULES (NEVER VIOLATE):
- NEVER fabricate metrics, percentages, dollar amounts, team sizes, or any specific numbers that are not explicitly stated in the evidence sources or blueprint.
- NEVER invent achievements, scope, titles, or credentials. Every claim must trace back to the evidence.
- If a specific number is not in the evidence, use qualitative scale language: "enterprise-wide," "cross-functional," "organization-wide" — do NOT make up a number.
- If the original resume says "$18B annual transaction volume," you may use that exact number. Do NOT round it, inflate it, or change it.

WRITING RULES:
- Follow the blueprint instructions. Add creative interpretation where the blueprint provides strategic direction rather than prescriptive bullet instructions.
- Rewrite and improve every bullet for maximum impact — do NOT copy bullets verbatim from the evidence sources. Your job is to make them stronger, not to echo them.
- Every bullet must have at least one quantified element (number, percentage, dollar amount, scale) — but ONLY from the evidence.
- Use the candidate's authentic phrases where specified. Do NOT replace them with corporate-speak.
- Vary sentence structure. Never start 3+ bullets the same way.
- Avoid: "leveraged," "spearheaded," "synergized," "passionate about," "proven track record," "results-oriented"
- Use strong, specific action verbs: Built, Designed, Negotiated, Reduced, Implemented, Transformed
- Keep bullets concise: 1-2 lines each, front-loaded with the most important information.
- Never use vertical bar separators (" | ") in any resume line; use commas, semicolons, or line breaks.
${ATS_RULEBOOK_SNIPPET}

Return your output as ONLY valid JSON — no markdown, no explanation, no text before or after the JSON:
{
  "content": "The complete section content as formatted text",
  "keywords_used": ["keywords present in the section"],
  "requirements_addressed": ["JD requirements addressed by this section"],
  "evidence_ids_used": ["evidence IDs from the evidence library used"]
}`;

// ─── Prompt builders ─────────────────────────────────────────────────

function buildSectionPrompt(
  section: string,
  blueprint: Record<string, unknown>,
  evidence: Record<string, unknown>,
  rules: ArchitectOutput['global_rules'],
  crossSectionContext?: Record<string, string>,
): string {
  const lines: string[] = [];

  lines.push(`Write the "${section}" section of a resume.`);
  lines.push('');

  // Cross-section context for narrative continuity
  if (crossSectionContext && Object.keys(crossSectionContext).length > 0) {
    lines.push('PREVIOUSLY WRITTEN SECTIONS (for narrative continuity):');
    for (const [name, excerpt] of Object.entries(crossSectionContext)) {
      lines.push(`--- ${name} ---`);
      lines.push(excerpt);
      lines.push('');
    }
    lines.push('Ensure this section complements — not repeats — the content above.');
    lines.push('Build narrative momentum: if the summary establishes the positioning angle, experience bullets should provide the proof.');
    lines.push('');
  }

  lines.push('BLUEPRINT INSTRUCTIONS:');
  lines.push(JSON.stringify(blueprint, null, 2));
  lines.push('');
  lines.push('EVIDENCE SOURCES:');
  lines.push(JSON.stringify(evidence, null, 2));
  lines.push('');
  lines.push('GLOBAL RULES:');
  lines.push(`Voice: ${rules.voice}`);
  lines.push(`Bullet format: ${rules.bullet_format}`);
  lines.push(`Length target: ${rules.length_target}`);
  lines.push(`ATS rules: ${rules.ats_rules}`);
  lines.push('');

  // Section-specific instructions
  switch (section) {
    case 'summary':
      lines.push('Write a 3-5 sentence professional summary (NOT an objective statement).');
      lines.push('Include the positioning angle, must-include elements, and embedded keywords.');
      lines.push('Echo the authentic phrases naturally — don\'t force them.');
      lines.push('If a gap reframe is specified, weave it in subtly.');
      lines.push('CRITICAL: Only use metrics that appear in the evidence sources. Do NOT invent percentages, dollar amounts, or team sizes.');
      lines.push('Target the summary toward the specific company and role in the blueprint.');
      break;

    case 'selected_accomplishments':
      lines.push('Write 3-5 achievement bullets, each highlighting a different strength.');
      lines.push('These are the candidate\'s absolute best proof points — make them shine.');
      lines.push('Format: "Action verb + scope + method + measurable result"');
      break;

    case 'skills':
      lines.push('Write a skills section organized into categories from the blueprint.');
      lines.push('List the most JD-relevant category first.');
      lines.push('Remove any skills flagged for age protection.');
      lines.push('');
      lines.push('FORMAT — Use this exact structure:');
      lines.push('[Category Name]: [Skill 1], [Skill 2], [Skill 3], ...');
      lines.push('[Category Name]: [Skill 1], [Skill 2], ...');
      lines.push('');
      lines.push('Example:');
      lines.push('Technical Leadership: Engineering Strategy, Architecture Review, Technical Roadmapping, M&A Due Diligence');
      lines.push('Cloud & Infrastructure: AWS, GCP, Kubernetes, Terraform, Microservices, Event-Driven Architecture');
      lines.push('');
      lines.push('If the blueprint does not specify categories, create 3-4 logical groupings from the evidence.');
      lines.push('Include 4-8 skills per category. Prioritize skills mentioned in the job description.');
      break;

    case 'education_and_certifications':
      lines.push('Format education entries cleanly. REMOVE graduation years if flagged by age protection.');
      lines.push('List certifications after education.');
      break;

    default:
      if (section === 'experience' || section.startsWith('experience_role_')) {
        lines.push('Write the COMPLETE experience section covering ALL positions listed in the blueprint.');
        lines.push('');
        lines.push('FORMAT — Each position MUST follow this exact structure:');
        lines.push('');
        lines.push('[Title] | [Company] | [Start Date] – [End Date]');
        lines.push('• [Bullet 1: Action verb + specific achievement + quantified result from evidence]');
        lines.push('• [Bullet 2: ...]');
        lines.push('• [Continue for each bullet specified in the blueprint]');
        lines.push('');
        lines.push('IMPORTANT:');
        lines.push('- Include EVERY position from the blueprint — do not skip any roles.');
        lines.push('- Rewrite each bullet to be stronger and more impactful than the original — do NOT just copy bullets from the evidence.');
        lines.push('- Start each bullet with a strong action verb (Built, Architected, Reduced, Drove, Led, Designed, Established).');
        lines.push('- Each bullet must contain a specific, measurable result from the evidence. Do NOT invent new metrics.');
        lines.push('- Front-load bullets with the most impressive achievement.');
        lines.push('');

        // Detect strategic vs prescriptive mode from blueprint slice
        if (hasEvidencePriorities(blueprint)) {
          lines.push('STRATEGIC MODE — You have creative freedom for this section.');
          lines.push('The blueprint provides evidence_priorities: requirements to address, available evidence, and importance levels.');
          lines.push('You decide how to construct each bullet. Address "critical" priorities first, then "important", then "supporting".');
          lines.push('Use the bullet_count_range as your target. Do not include topics listed in do_not_include.');
        } else {
          lines.push('Follow bullet instructions: each bullet has a focus, evidence source, and target metric.');
          lines.push('Improve every bullet for narrative impact — do not copy them mechanically.');
        }

        lines.push('Keep bullets that are marked to keep. Remove bullets marked to cut.');
        lines.push('Apply any title adjustments specified in the blueprint.');
      }
      break;
  }

  lines.push('');
  lines.push('Return ONLY valid JSON — no markdown fences, no explanation, no text before or after:');
  lines.push('{');
  lines.push('  "content": "The complete section content as a single string. Use \\n for line breaks between entries.",');
  lines.push('  "keywords_used": ["keyword1", "keyword2"],');
  lines.push('  "requirements_addressed": ["requirement1", "requirement2"],');
  lines.push('  "evidence_ids_used": ["id1", "id2"]');
  lines.push('}');

  return lines.join('\n');
}
