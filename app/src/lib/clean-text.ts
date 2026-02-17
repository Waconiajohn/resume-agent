/**
 * Utility functions for cleaning markdown/HTML artifacts from LLM-generated text.
 * Perplexity and other research tools often return raw markdown, HTML tags,
 * and citation references that should not render literally in the UI.
 */

/**
 * Strip markdown and HTML to plain text for simple displays.
 * Converts <br> to space, removes bold/italic markers, heading markers,
 * citation references, and HTML tags.
 */
export function stripMarkdown(text: string): string {
  if (!text) return '';

  let result = text;

  // Convert <br> / <br/> / <br /> to space (for single-line contexts)
  result = result.replace(/<br\s*\/?>/gi, ' ');

  // Remove all remaining HTML tags
  result = result.replace(/<[^>]+>/g, '');

  // Remove citation references like [1], [2][3], [1, 2]
  result = result.replace(/\[[\d,\s]+\]/g, '');

  // Remove markdown heading markers (# ## ### etc.)
  result = result.replace(/^#{1,6}\s+/gm, '');

  // Remove bold/italic markers: ***text***, **text**, *text*
  result = result.replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1');

  // Remove underline bold/italic: ___text___, __text__, _text_
  result = result.replace(/_{1,3}([^_]+)_{1,3}/g, '$1');

  // Remove inline code backticks
  result = result.replace(/`([^`]+)`/g, '$1');

  // Remove markdown links: [text](url) -> text
  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Remove markdown images: ![alt](url) -> alt
  result = result.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');

  // Collapse multiple spaces
  result = result.replace(/  +/g, ' ');

  // Trim each line
  result = result
    .split('\n')
    .map((line) => line.trim())
    .join('\n');

  return result.trim();
}

/**
 * Clean markdown/HTML for multi-line rich text displays.
 * Preserves line breaks but removes formatting artifacts.
 */
export function cleanText(text: string): string {
  if (!text) return '';

  let result = text;

  // Convert <br> / <br/> / <br /> to newline
  result = result.replace(/<br\s*\/?>/gi, '\n');

  // Remove all remaining HTML tags
  result = result.replace(/<[^>]+>/g, '');

  // Remove citation references like [1], [2][3], [1, 2]
  result = result.replace(/\[[\d,\s]+\]/g, '');

  // Remove markdown heading markers (# ## ### etc.)
  result = result.replace(/^#{1,6}\s+/gm, '');

  // Remove bold/italic markers: ***text***, **text**, *text*
  result = result.replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1');

  // Remove underline bold/italic: ___text___, __text__, _text_
  result = result.replace(/_{1,3}([^_]+)_{1,3}/g, '$1');

  // Remove inline code backticks
  result = result.replace(/`([^`]+)`/g, '$1');

  // Remove markdown links: [text](url) -> text
  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Remove markdown images: ![alt](url) -> alt
  result = result.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');

  // Collapse multiple spaces (but not newlines)
  result = result.replace(/[ \t]+/g, ' ');

  // Collapse 3+ newlines to 2
  result = result.replace(/\n{3,}/g, '\n\n');

  // Trim each line
  result = result
    .split('\n')
    .map((line) => line.trim())
    .join('\n');

  return result.trim();
}
