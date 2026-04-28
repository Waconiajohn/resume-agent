// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useV3SessionPersistence } from '../useV3SessionPersistence';
import type {
  V3BenchmarkProfile,
  V3DiscoveryAnswer,
  V3Strategy,
  V3StructuredResume,
  V3VerifyResult,
  V3WrittenResume,
} from '../useV3Pipeline';

vi.mock('@/lib/api', () => ({
  API_BASE: 'http://localhost:3001/api',
}));

const structuredFixture: V3StructuredResume = {
  contact: { fullName: 'Jane Doe' },
  discipline: 'product',
  positions: [],
  education: [],
  certifications: [],
  skills: [],
  customSections: [],
  crossRoleHighlights: [],
  careerGaps: [],
  pronoun: null,
};

const benchmarkFixture: V3BenchmarkProfile = {
  roleProblemHypothesis: '',
  idealProfileSummary: '',
  directMatches: [],
  gapAssessment: [],
  positioningFrame: '',
  hiringManagerObjections: [],
};

const strategyFixture: V3Strategy = {
  positioningFrame: '',
  targetDisciplinePhrase: '',
  emphasizedAccomplishments: [],
  objections: [],
  positionEmphasis: [],
};

const writtenFixture: V3WrittenResume = {
  summary: 'x',
  selectedAccomplishments: [],
  coreCompetencies: [],
  positions: [],
  customSections: [],
};

const verifyFixture: V3VerifyResult = {
  passed: true,
  issues: [],
};

const discoveryAnswersFixture: V3DiscoveryAnswer[] = [
  {
    requirement: 'Industry 4.0 / smart manufacturing technologies',
    question: 'Have you led any IoT, predictive maintenance, or smart manufacturing work?',
    answer: 'Sponsored a CMMS sensor-alert pilot using machine downtime data for preventive maintenance.',
    level: 'candidate_discovery_needed',
    risk: 'high',
    recommendedFraming: 'Frame as smart-manufacturing exposure, not full digital twin ownership.',
  },
];

const emptyPipeline = {
  isComplete: false,
  sessionId: null,
  structured: null,
  benchmark: null,
  strategy: null,
  written: null,
  verify: null,
  timings: null,
  costs: null,
};

const STORAGE_KEY = 'resume-v3-last-session-user-1';

describe('useV3SessionPersistence', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('returns localStorage snapshot when present and fresh', async () => {
    const snap = {
      version: 1,
      sessionId: 'sess-1',
      structured: structuredFixture,
      benchmark: benchmarkFixture,
      strategy: strategyFixture,
      written: writtenFixture,
      verify: verifyFixture,
      timings: null,
      costs: null,
      editedWritten: null,
      jdTitle: 'Director',
      jdCompany: 'Acme',
      savedAt: Date.now(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));

    const { result } = renderHook(() =>
      useV3SessionPersistence({
        accessToken: 'token',
        userId: 'user-1',
        pipeline: emptyPipeline,
        editedWritten: null,
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.lastSession?.sessionId).toBe('sess-1');
    expect(result.current.lastSession?.jdTitle).toBe('Director');
    // Server was never called — cache hit short-circuits.
    expect(fetch).not.toHaveBeenCalled();
  });

  it('falls back to GET /sessions/latest when localStorage is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            session: {
              id: 'sess-2',
              updatedAt: new Date().toISOString(),
              pipelineOutput: {
                structured: structuredFixture,
                benchmark: benchmarkFixture,
                strategy: strategyFixture,
                written: writtenFixture,
                verify: verifyFixture,
                discoveryAnswers: discoveryAnswersFixture,
                timings: null,
                costs: null,
              },
              jdText: 'JD body',
              jdTitle: 'VP Ops',
              jdCompany: 'Globex',
              resumeSource: 'upload',
              editedWritten: null,
            },
          }),
      }),
    );

    const { result } = renderHook(() =>
      useV3SessionPersistence({
        accessToken: 'token',
        userId: 'user-1',
        pipeline: emptyPipeline,
        editedWritten: null,
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.lastSession?.sessionId).toBe('sess-2');
    expect(result.current.lastSession?.jdTitle).toBe('VP Ops');
    expect(result.current.lastSession?.discoveryAnswers).toEqual(discoveryAnswersFixture);
  });

  it('loads an explicit saved v3 session when initialSessionId is present', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            session: {
              id: 'sess-explicit',
              product_type: 'resume_v3',
              updated_at: new Date().toISOString(),
              v3_pipeline_output: {
                structured: structuredFixture,
                benchmark: benchmarkFixture,
                strategy: strategyFixture,
                written: writtenFixture,
                verify: verifyFixture,
                discoveryAnswers: discoveryAnswersFixture,
                timings: null,
                costs: null,
              },
              v3_jd_title: 'COO',
              v3_jd_company: 'Northwind',
              v3_edited_written: null,
            },
          }),
      }),
    );

    const { result } = renderHook(() =>
      useV3SessionPersistence({
        accessToken: 'token',
        userId: 'user-1',
        initialSessionId: 'sess-explicit',
        pipeline: emptyPipeline,
        editedWritten: null,
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/sessions/sess-explicit',
      { headers: { Authorization: 'Bearer token' } },
    );
    expect(result.current.lastSession?.sessionId).toBe('sess-explicit');
    expect(result.current.lastSession?.jdTitle).toBe('COO');
    expect(result.current.lastSession?.discoveryAnswers).toEqual(discoveryAnswersFixture);
  });

  it('writes discovery answers into the local resumable snapshot', async () => {
    vi.useFakeTimers();

    const completedPipeline = {
      isComplete: true,
      sessionId: 'sess-3',
      structured: structuredFixture,
      benchmark: benchmarkFixture,
      strategy: strategyFixture,
      written: writtenFixture,
      verify: verifyFixture,
      timings: null,
      costs: null,
    };

    renderHook(() =>
      useV3SessionPersistence({
        accessToken: null,
        userId: 'user-1',
        pipeline: completedPipeline,
        editedWritten: null,
        discoveryAnswers: discoveryAnswersFixture,
        jdTitle: 'VP Ops',
        jdCompany: 'Globex',
      }),
    );

    act(() => {
      vi.advanceTimersByTime(500);
    });

    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as {
      discoveryAnswers?: V3DiscoveryAnswer[];
    };
    expect(saved.discoveryAnswers).toEqual(discoveryAnswersFixture);

    vi.useRealTimers();
  });

  it('ignores stale localStorage entries (>7 days old)', async () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        sessionId: 'old',
        structured: structuredFixture,
        benchmark: benchmarkFixture,
        strategy: strategyFixture,
        written: writtenFixture,
        verify: verifyFixture,
        timings: null,
        costs: null,
        savedAt: eightDaysAgo,
      }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ session: null }),
      }),
    );

    const { result } = renderHook(() =>
      useV3SessionPersistence({
        accessToken: 'token',
        userId: 'user-1',
        pipeline: emptyPipeline,
        editedWritten: null,
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    // Stale cache ignored; server returned null → no last session.
    expect(result.current.lastSession).toBeNull();
    expect(fetch).toHaveBeenCalled();
  });

  it('returns null when no user is signed in', async () => {
    const { result } = renderHook(() =>
      useV3SessionPersistence({
        accessToken: null,
        userId: null,
        pipeline: emptyPipeline,
        editedWritten: null,
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.lastSession).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('clear() removes the localStorage entry and nulls lastSession', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        sessionId: 'sess-to-clear',
        structured: structuredFixture,
        benchmark: benchmarkFixture,
        strategy: strategyFixture,
        written: writtenFixture,
        verify: verifyFixture,
        timings: null,
        costs: null,
        savedAt: Date.now(),
      }),
    );

    const { result } = renderHook(() =>
      useV3SessionPersistence({
        accessToken: 'token',
        userId: 'user-1',
        pipeline: emptyPipeline,
        editedWritten: null,
      }),
    );

    await waitFor(() => expect(result.current.lastSession?.sessionId).toBe('sess-to-clear'));
    result.current.clear();
    await waitFor(() => expect(result.current.lastSession).toBeNull());
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
