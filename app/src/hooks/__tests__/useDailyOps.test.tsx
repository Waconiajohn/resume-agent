// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDailyOps } from '../useDailyOps';
import type { Application, DueAction } from '@/hooks/useApplicationPipeline';
import type { RadarJob } from '@/hooks/useRadarSearch';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeApp(overrides: Partial<Application> = {}): Application {
  return {
    id: 'app-1',
    role_title: 'CTO',
    company_name: 'Acme Corp',
    stage: 'applied',
    source: 'linkedin',
    stage_history: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeStaleApp(id: string, stage: Application['stage'] = 'applied'): Application {
  const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  return makeApp({ id, stage, updated_at: oldDate });
}

function makeFreshApp(id: string, stage: Application['stage'] = 'applied'): Application {
  return makeApp({ id, stage, updated_at: new Date().toISOString() });
}

function makeRadarJob(externalId: string, score: number | null = null): RadarJob {
  return {
    external_id: externalId,
    title: 'VP Engineering',
    company: 'Acme',
    location: null,
    salary_min: null,
    salary_max: null,
    description: null,
    posted_date: new Date().toISOString(),
    apply_url: null,
    source: 'jsearch',
    remote_type: null,
    employment_type: null,
    required_skills: null,
    match_score: score,
  };
}

function makeDueAction(id: string): DueAction {
  return {
    id,
    role_title: 'CTO',
    company_name: 'Acme',
    next_action: 'Follow up',
    next_action_due: new Date().toISOString(),
    stage: 'applied',
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useDailyOps — activeCount', () => {
  it('excludes closed_won and closed_lost from activeCount', () => {
    const apps = [
      makeApp({ id: '1', stage: 'applied' }),
      makeApp({ id: '2', stage: 'interviewing' }),
      makeApp({ id: '3', stage: 'closed_won' }),
      makeApp({ id: '4', stage: 'closed_lost' }),
    ];
    const { result } = renderHook(() => useDailyOps(apps, [], []));
    expect(result.current.activeCount).toBe(2);
  });

  it('returns 0 when all applications are closed', () => {
    const apps = [
      makeApp({ id: '1', stage: 'closed_won' }),
      makeApp({ id: '2', stage: 'closed_lost' }),
    ];
    const { result } = renderHook(() => useDailyOps(apps, [], []));
    expect(result.current.activeCount).toBe(0);
  });
});

describe('useDailyOps — interviewCount and offerCount', () => {
  it('counts applications in interviewing stage', () => {
    const apps = [
      makeApp({ id: '1', stage: 'interviewing' }),
      makeApp({ id: '2', stage: 'interviewing' }),
      makeApp({ id: '3', stage: 'applied' }),
    ];
    const { result } = renderHook(() => useDailyOps(apps, [], []));
    expect(result.current.interviewCount).toBe(2);
  });

  it('counts applications in offer stage', () => {
    const apps = [
      makeApp({ id: '1', stage: 'offer' }),
      makeApp({ id: '2', stage: 'applied' }),
    ];
    const { result } = renderHook(() => useDailyOps(apps, [], []));
    expect(result.current.offerCount).toBe(1);
  });
});

describe('useDailyOps — topMatches', () => {
  it('returns top 5 jobs with score >= 60, sorted descending', () => {
    const jobs = [
      makeRadarJob('j1', 90),
      makeRadarJob('j2', 75),
      makeRadarJob('j3', 60),
      makeRadarJob('j4', 55), // below threshold
      makeRadarJob('j5', 85),
      makeRadarJob('j6', 70),
      makeRadarJob('j7', 65), // this one gets cut at limit
    ];
    const { result } = renderHook(() => useDailyOps([], [], jobs));
    expect(result.current.topMatches).toHaveLength(5);
    expect(result.current.topMatches[0].match_score).toBe(90);
    expect(result.current.topMatches[1].match_score).toBe(85);
    expect(result.current.topMatches[2].match_score).toBe(75);
    // Score 55 must not appear
    const scores = result.current.topMatches.map((j) => j.match_score);
    expect(scores).not.toContain(55);
  });

  it('excludes jobs with score below 60', () => {
    const jobs = [makeRadarJob('j1', 59), makeRadarJob('j2', 50)];
    const { result } = renderHook(() => useDailyOps([], [], jobs));
    expect(result.current.topMatches).toHaveLength(0);
  });

  it('excludes jobs with null match_score', () => {
    const jobs = [makeRadarJob('j1', null), makeRadarJob('j2', 80)];
    const { result } = renderHook(() => useDailyOps([], [], jobs));
    expect(result.current.topMatches).toHaveLength(1);
    expect(result.current.topMatches[0].external_id).toBe('j2');
  });
});

describe('useDailyOps — staleApplications', () => {
  it('returns apps with updated_at older than 7 days (excluding closed)', () => {
    const apps = [
      makeStaleApp('stale-1', 'applied'),
      makeFreshApp('fresh-1', 'applied'),
      makeStaleApp('stale-closed', 'closed_won'), // closed, should be excluded
    ];
    const { result } = renderHook(() => useDailyOps(apps, [], []));
    expect(result.current.staleApplications).toHaveLength(1);
    expect(result.current.staleApplications[0].id).toBe('stale-1');
  });

  it('excludes closed stages from stale applications', () => {
    const apps = [
      makeStaleApp('1', 'closed_lost'),
      makeStaleApp('2', 'closed_won'),
    ];
    const { result } = renderHook(() => useDailyOps(apps, [], []));
    expect(result.current.staleApplications).toHaveLength(0);
  });
});

describe('useDailyOps — empty inputs', () => {
  it('handles all empty inputs gracefully', () => {
    const { result } = renderHook(() => useDailyOps([], [], []));
    expect(result.current.activeCount).toBe(0);
    expect(result.current.interviewCount).toBe(0);
    expect(result.current.offerCount).toBe(0);
    expect(result.current.topMatches).toHaveLength(0);
    expect(result.current.staleApplications).toHaveLength(0);
    expect(result.current.dueActions).toHaveLength(0);
  });

  it('passes through dueActions and loading as-is', () => {
    const dueActions = [makeDueAction('d-1')];
    const { result } = renderHook(() => useDailyOps([], dueActions, [], true));
    expect(result.current.dueActions).toBe(dueActions);
    expect(result.current.loading).toBe(true);
  });
});
