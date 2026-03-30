/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadSnapshotMap,
  persistSnapshotMap,
  snapshotsStorageKey,
  type SnapshotMap,
} from '@/lib/coach-screen-utils';

const SESSION_ID = 'session-123';
const USER_ID = 'user-1';
const LEGACY_KEY = `resume-agent:workspace-snapshots:${SESSION_ID}`;

const SNAPSHOT_MAP: SnapshotMap = {
  benchmark: {
    nodeKey: 'benchmark',
    panelType: null,
    panelData: null,
    resume: null,
    capturedAt: '2026-03-29T23:00:00.000Z',
    currentPhase: 'benchmark',
    isGateActive: false,
  },
};

describe('coach-screen snapshot storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('writes scoped snapshot keys and removes the legacy key', () => {
    window.localStorage.setItem(LEGACY_KEY, JSON.stringify({ legacy: true }));

    persistSnapshotMap(SESSION_ID, USER_ID, SNAPSHOT_MAP);

    expect(window.localStorage.getItem(snapshotsStorageKey(SESSION_ID, USER_ID))).toBe(JSON.stringify(SNAPSHOT_MAP));
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it('loads scoped snapshots for a signed-in user', () => {
    window.localStorage.setItem(
      snapshotsStorageKey(SESSION_ID, USER_ID),
      JSON.stringify(SNAPSHOT_MAP),
    );

    expect(loadSnapshotMap(SESSION_ID, USER_ID)).toEqual(SNAPSHOT_MAP);
  });

  it('does not read a legacy shared snapshot into a signed-in user scope', () => {
    window.localStorage.setItem(LEGACY_KEY, JSON.stringify(SNAPSHOT_MAP));

    expect(loadSnapshotMap(SESSION_ID, USER_ID)).toEqual({});
  });

  it('still allows anonymous sessions to read the legacy snapshot key', () => {
    window.localStorage.setItem(LEGACY_KEY, JSON.stringify(SNAPSHOT_MAP));

    expect(loadSnapshotMap(SESSION_ID, null)).toEqual(SNAPSHOT_MAP);
  });
});
