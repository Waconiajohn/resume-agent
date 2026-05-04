// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { V3PromotePanel } from '@/components/resume-v3/V3PromotePanel';
import type {
  V3DiscoveryAnswer,
  V3MasterSummary,
  V3StructuredResume,
  V3WrittenResume,
} from '@/hooks/useV3Pipeline';

const written: V3WrittenResume = {
  summary: 'Manufacturing operations leader with multi-site scope.',
  selectedAccomplishments: [],
  coreCompetencies: [],
  customSections: [],
  positions: [{
    positionIndex: 0,
    title: 'Director of Operations',
    company: 'Pinnacle',
    dates: { start: '2018', end: null, raw: '2018-Present' },
    scope: '3 facilities; 420 employees',
    bullets: [{
      text: 'Led $14.2M operational excellence program across three facilities.',
      source: 'positions[0].bullets[0]',
      is_new: true,
      evidence_found: true,
      confidence: 0.95,
    }],
  }],
};

const structured: V3StructuredResume = {
  contact: { fullName: 'Michael Torres' },
  discipline: 'manufacturing operations',
  positions: [{
    title: 'Director of Operations',
    company: 'Pinnacle',
    dates: { start: '2018', end: null, raw: '2018-Present' },
    scope: '3 facilities; 420 employees',
    bullets: [{
      text: 'Led operational excellence program across three facilities.',
      source: null,
      is_new: false,
      evidence_found: true,
      confidence: 1,
    }],
    confidence: 1,
  }],
  education: [],
  certifications: [],
  skills: [],
  customSections: [],
  crossRoleHighlights: [],
  careerGaps: [],
  pronoun: null,
};

const master: V3MasterSummary = {
  id: 'master-1',
  version: 3,
  is_default: true,
  updated_at: '2026-04-25T00:00:00Z',
  hasExperience: true,
  hasEvidence: true,
  positionCount: 1,
  evidenceCount: 8,
};

const discoveryAnswers: V3DiscoveryAnswer[] = [{
  requirement: 'Industry 4.0 / smart manufacturing technologies',
  question: 'Have you used predictive maintenance, IoT, or digital twin tools directly?',
  answer: 'Sponsored a CMMS sensor-alert pilot using machine downtime data for preventive maintenance.',
  level: 'adjacent_proof',
  risk: 'medium',
}];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('V3PromotePanel discovery evidence promotion', () => {
  it('shows confirmed discovery evidence as a promotable Career Vault item', async () => {
    const user = userEvent.setup();

    render(
      <V3PromotePanel
        accessToken="token"
        sessionId="11111111-1111-4111-8111-111111111111"
        written={written}
        structured={structured}
        discoveryAnswers={discoveryAnswers}
        master={master}
      />,
    );

    expect(screen.getByText(/1 confirmed evidence note/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /review & pick/i }));

    expect(screen.getByRole('button', { name: /confirmed evidence/i })).toBeInTheDocument();
    expect(screen.getByText(/Candidate confirmed for Industry 4\.0/)).toBeInTheDocument();
  });

  it('sends selected discovery answers as promote evidence', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, new_version: 4 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(
      <V3PromotePanel
        accessToken="token"
        sessionId="11111111-1111-4111-8111-111111111111"
        written={written}
        structured={structured}
        discoveryAnswers={discoveryAnswers}
        master={master}
      />,
    );

    await user.click(screen.getByRole('button', { name: /save defaults to Career Vault/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String(init?.body)) as {
      evidence?: Array<{ text: string; category: string }>;
    };

    expect(body.evidence).toEqual([
      {
        text: 'Candidate confirmed for Industry 4.0 / smart manufacturing technologies: Sponsored a CMMS sensor-alert pilot using machine downtime data for preventive maintenance.',
        category: 'candidate_discovery',
      },
    ]);
  });
});
