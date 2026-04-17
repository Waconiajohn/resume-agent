// Fixture slug derivation.
// Turns a raw filename like "Ben Wedewer - Resume trimmed.docx" into a
// stable kebab-case slug usable in meta/, extracted/, and snapshots/ paths.
// Purely mechanical (regex for char class normalization).

export function slugifyFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '');
  return base
    .toLowerCase()
    .normalize('NFKD')
    // Drop diacritics
    .replace(/[\u0300-\u036f]/g, '')
    // Non-alphanumerics become hyphens
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
