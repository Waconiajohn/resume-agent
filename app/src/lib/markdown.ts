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

export function markdownToHtml(md: string): string {
  const escaped = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped
    .split('\n')
    .map((line) => {
      if (line.startsWith('### ')) return `<h3>${inlineFormat(line.slice(4))}</h3>`;
      if (line.startsWith('## ')) return `<h2>${inlineFormat(line.slice(3))}</h2>`;
      if (line.startsWith('# ')) return `<h1>${inlineFormat(line.slice(2))}</h1>`;
      if (/^---+$/.test(line.trim())) return '<hr />';
      if (line.startsWith('&gt; ')) return `<blockquote><p>${inlineFormat(line.slice(5))}</p></blockquote>`;
      if (/^[\s]*[-*] /.test(line)) {
        const content = line.replace(/^[\s]*[-*] /, '');
        return `<li>${inlineFormat(content)}</li>`;
      }
      if (/^[\s]*\d+\. /.test(line)) {
        const content = line.replace(/^[\s]*\d+\. /, '');
        return `<li>${inlineFormat(content)}</li>`;
      }
      if (line.trim() === '') return '<br />';
      return `<p>${inlineFormat(line)}</p>`;
    })
    .join('\n');
}
