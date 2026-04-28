/**
 * Minimal markdown-to-HTML converter with HTML escaping.
 * Shared across Career IQ room report views.
 */

function inlineFormat(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>');
}

/** Returns true when the line is a markdown table separator (e.g. |---|---| or | :--- | ---: |) */
function isTableSeparator(line: string): boolean {
  return /^\|[\s\-:|]+\|/.test(line.trim());
}

/** Returns true when the line looks like a table row (starts and ends with |) */
function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith('|') && t.endsWith('|');
}

/** Parse a table row into trimmed cell strings, dropping the outer empty splits from leading/trailing pipes. */
function parseTableRow(line: string): string[] {
  const parts = line.trim().split('|');
  // split('|') on "|a|b|" yields ["", "a", "b", ""] — drop the outer empties
  return parts.slice(1, parts.length - 1).map((c) => c.trim());
}

const TABLE_STYLES = {
  table:
    'border-collapse:collapse;width:100%;margin:1em 0;font-size:0.9em;',
  th: 'padding:8px 12px;border:1px solid var(--line-soft);background:var(--surface-2);color:var(--text-strong);font-weight:600;text-align:left;',
  td: 'padding:8px 12px;border:1px solid var(--line-soft);color:var(--text-muted);',
};

function renderTable(rows: string[]): string {
  // Locate the separator row to split header from body
  const sepIndex = rows.findIndex(isTableSeparator);
  if (sepIndex < 1) {
    // No valid separator found — fall back to rendering as paragraphs
    return rows.map((r) => `<p>${inlineFormat(r)}</p>`).join('\n');
  }

  const headerRow = rows[sepIndex - 1];
  const bodyRows = rows.slice(sepIndex + 1);

  const headerCells = parseTableRow(headerRow)
    .map((c) => `<th style="${TABLE_STYLES.th}">${inlineFormat(c)}</th>`)
    .join('');

  const bodyHtml = bodyRows
    .filter((r) => r.trim() !== '')
    .map((r) => {
      const cells = parseTableRow(r)
        .map((c) => `<td style="${TABLE_STYLES.td}">${inlineFormat(c)}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('\n');

  return (
    `<table style="${TABLE_STYLES.table}">` +
    `<thead><tr>${headerCells}</tr></thead>` +
    (bodyHtml ? `<tbody>${bodyHtml}</tbody>` : '') +
    `</table>`
  );
}

export function markdownToHtml(md: string): string {
  const escaped = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const lines = escaped.split('\n');
  const output: string[] = [];

  // Pending list buffers
  let ulBuffer: string[] = [];
  let olBuffer: string[] = [];
  let tableBuffer: string[] = [];

  function flushUl() {
    if (ulBuffer.length === 0) return;
    output.push(`<ul>${ulBuffer.join('')}</ul>`);
    ulBuffer = [];
  }

  function flushOl() {
    if (olBuffer.length === 0) return;
    output.push(`<ol>${olBuffer.join('')}</ol>`);
    olBuffer = [];
  }

  function flushTable() {
    if (tableBuffer.length === 0) return;
    output.push(renderTable(tableBuffer));
    tableBuffer = [];
  }

  for (const line of lines) {
    // --- Table rows ---
    if (isTableRow(line) || isTableSeparator(line)) {
      flushUl();
      flushOl();
      tableBuffer.push(line);
      continue;
    } else {
      flushTable();
    }

    // --- Unordered list item ---
    if (/^[\s]*[-*] /.test(line)) {
      flushOl();
      const content = line.replace(/^[\s]*[-*] /, '');
      ulBuffer.push(`<li>${inlineFormat(content)}</li>`);
      continue;
    } else {
      flushUl();
    }

    // --- Ordered list item ---
    if (/^[\s]*\d+\. /.test(line)) {
      const content = line.replace(/^[\s]*\d+\. /, '');
      olBuffer.push(`<li>${inlineFormat(content)}</li>`);
      continue;
    } else {
      flushOl();
    }

    // --- Block-level elements ---
    if (line.startsWith('### ')) {
      output.push(`<h3>${inlineFormat(line.slice(4))}</h3>`);
    } else if (line.startsWith('## ')) {
      output.push(`<h2>${inlineFormat(line.slice(3))}</h2>`);
    } else if (line.startsWith('# ')) {
      output.push(`<h1>${inlineFormat(line.slice(2))}</h1>`);
    } else if (/^---+$/.test(line.trim())) {
      output.push('<hr />');
    } else if (line.startsWith('&gt; ')) {
      output.push(`<blockquote><p>${inlineFormat(line.slice(5))}</p></blockquote>`);
    } else if (line.trim() === '') {
      output.push('<br />');
    } else {
      output.push(`<p>${inlineFormat(line)}</p>`);
    }
  }

  // Flush any open buffers at end of input
  flushUl();
  flushOl();
  flushTable();

  return output.join('\n');
}
