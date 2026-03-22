function normalize(text: string): string {
  return text.trim().toLowerCase();
}

const AVAILABILITY_REQUIREMENT_PATTERN = /\b(on[- ]?call|travel|outside standard working hours|after[- ]?hours|weekend|weekends|overtime|overnight|rotation|rotational|shift work|availability|24\/7|24x7|24 x 7)\b/i;
const AVAILABILITY_EVIDENCE_PATTERN = /\b(on[- ]?call|travel|traveled|travelling|traveling|site visits?|field visits?|after[- ]?hours|outside standard working hours|weekend|weekends|overtime|overnight|rotation|rotational|shift work|24\/7|24x7|24 x 7|emergency response|callout)\b/i;

export function requirementNeedsStrictAvailabilityProof(requirement: string): boolean {
  return AVAILABILITY_REQUIREMENT_PATTERN.test(requirement);
}

export function evidenceLooksDirectForRequirement(requirement: string, evidenceText: string): boolean {
  if (!evidenceText.trim()) return false;

  if (!requirementNeedsStrictAvailabilityProof(requirement)) {
    return true;
  }

  return AVAILABILITY_EVIDENCE_PATTERN.test(normalize(evidenceText));
}
