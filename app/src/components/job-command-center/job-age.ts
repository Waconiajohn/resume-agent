export function formatJobAgeLabel(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;

  try {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return 'Posted today';
    if (diffDays === 1) return 'Posted yesterday';
    if (diffDays < 7) return `Posted ${diffDays}d ago`;
    if (diffDays < 30) return `Posted ${Math.floor(diffDays / 7)}w ago`;

    return `Posted ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
  } catch {
    return dateStr;
  }
}
