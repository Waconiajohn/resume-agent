export function canonicalRequirementSignals(
  primaryRequirement: string | null | undefined,
  requirements: string[] | null | undefined,
): string[] {
  const normalizedPrimary = typeof primaryRequirement === 'string'
    ? primaryRequirement.trim()
    : '';
  if (normalizedPrimary) return [normalizedPrimary];

  if (!Array.isArray(requirements)) return [];

  const deduped = new Set<string>();
  for (const requirement of requirements) {
    if (typeof requirement !== 'string') continue;
    const normalizedRequirement = requirement.trim();
    if (!normalizedRequirement) continue;
    deduped.add(normalizedRequirement);
  }
  return [...deduped];
}
