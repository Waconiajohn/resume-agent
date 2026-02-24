import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WorkflowNodeKey } from '@/types/workflow';
import { WORKFLOW_NODES } from '@/types/workflow';

interface WorkspaceNavState {
  entries: WorkflowNodeKey[];
  cursor: number;
  selectedNode: WorkflowNodeKey;
}

interface UseWorkspaceNavigationArgs {
  sessionId: string | null;
  activeNode: WorkflowNodeKey;
}

interface UseWorkspaceNavigationResult {
  selectedNode: WorkflowNodeKey;
  entries: WorkflowNodeKey[];
  cursor: number;
  canGoBack: boolean;
  canGoForward: boolean;
  goToNode: (node: WorkflowNodeKey) => void;
  goBack: () => void;
  goForward: () => void;
  returnToActiveNode: () => void;
}

const DEFAULT_NODE: WorkflowNodeKey = 'overview';

function isWorkflowNodeKey(value: string): value is WorkflowNodeKey {
  return WORKFLOW_NODES.some((node) => node.key === value);
}

function buildWorkspacePath(sessionId: string, node: WorkflowNodeKey): string {
  return `/sessions/${encodeURIComponent(sessionId)}/workspace/${node}`;
}

function readNodeFromPath(sessionId: string | null, pathname: string): WorkflowNodeKey | null {
  if (!sessionId) return null;
  const match = pathname.match(/^\/sessions\/([^/]+)\/workspace\/([^/]+)\/?$/);
  if (!match) return null;
  const [, routeSessionId, routeNode] = match;
  if (decodeURIComponent(routeSessionId) !== sessionId) return null;
  if (!isWorkflowNodeKey(routeNode)) return null;
  return routeNode;
}

function storageKey(sessionId: string) {
  return `resume-agent:workspace-nav:${sessionId}`;
}

function safeLoadNavState(sessionId: string): Partial<WorkspaceNavState> | null {
  try {
    const raw = window.localStorage.getItem(storageKey(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WorkspaceNavState>;
    const entries = Array.isArray(parsed.entries)
      ? parsed.entries.filter((entry): entry is WorkflowNodeKey => typeof entry === 'string' && isWorkflowNodeKey(entry))
      : [];
    const selectedNode = typeof parsed.selectedNode === 'string' && isWorkflowNodeKey(parsed.selectedNode)
      ? parsed.selectedNode
      : undefined;
    const cursor = typeof parsed.cursor === 'number' && Number.isFinite(parsed.cursor)
      ? Math.max(0, Math.floor(parsed.cursor))
      : undefined;
    return { entries, selectedNode, cursor };
  } catch {
    return null;
  }
}

function safeSaveNavState(sessionId: string, state: WorkspaceNavState) {
  try {
    window.localStorage.setItem(storageKey(sessionId), JSON.stringify(state));
  } catch {
    // Best effort only
  }
}

export function useWorkspaceNavigation({
  sessionId,
  activeNode,
}: UseWorkspaceNavigationArgs): UseWorkspaceNavigationResult {
  const [navState, setNavState] = useState<WorkspaceNavState>({
    entries: [DEFAULT_NODE],
    cursor: 0,
    selectedNode: DEFAULT_NODE,
  });
  const initializedSessionRef = useRef<string | null>(null);
  const prevActiveNodeRef = useRef<WorkflowNodeKey>(activeNode);

  const applySelection = useCallback((
    node: WorkflowNodeKey,
    options?: {
      push?: boolean;
      replace?: boolean;
      source?: 'user' | 'system' | 'popstate';
      force?: boolean;
    },
  ) => {
    setNavState((prev) => {
      const currentNode = prev.entries[prev.cursor] ?? prev.selectedNode ?? DEFAULT_NODE;
      const nextNode = node;
      const isSameNode = currentNode === nextNode && prev.selectedNode === nextNode;
      const source = options?.source ?? 'user';
      const force = Boolean(options?.force);

      let nextEntries = prev.entries.length > 0 ? prev.entries : [currentNode];
      let nextCursor = Math.min(prev.cursor, nextEntries.length - 1);

      if (source === 'user') {
        if (!isSameNode || force) {
          const base = nextEntries.slice(0, nextCursor + 1);
          nextEntries = [...base, nextNode];
          nextCursor = nextEntries.length - 1;
        }
      } else if (source === 'popstate') {
        const prevNode = nextCursor > 0 ? nextEntries[nextCursor - 1] : null;
        const forwardNode = nextCursor < nextEntries.length - 1 ? nextEntries[nextCursor + 1] : null;
        if (prevNode === nextNode) {
          nextCursor -= 1;
        } else if (forwardNode === nextNode) {
          nextCursor += 1;
        } else if (!isSameNode || force) {
          const base = nextEntries.slice(0, nextCursor + 1);
          nextEntries = [...base, nextNode];
          nextCursor = nextEntries.length - 1;
        }
      } else {
        if (!isSameNode || force) {
          nextEntries = nextEntries.slice(0, nextCursor + 1);
          if (nextEntries.length === 0) nextEntries = [nextNode];
          nextEntries[nextCursor] = nextNode;
        }
      }

      const nextState: WorkspaceNavState = {
        entries: nextEntries,
        cursor: Math.max(0, Math.min(nextCursor, nextEntries.length - 1)),
        selectedNode: nextNode,
      };
      return nextState;
    });

    if (!sessionId || typeof window === 'undefined') return;
    const path = buildWorkspacePath(sessionId, node);
    const currentPath = window.location.pathname;
    const shouldReplace = Boolean(options?.replace);
    const shouldPush = Boolean(options?.push);
    if (currentPath !== path) {
      if (shouldReplace) {
        window.history.replaceState({ workspace: true, sessionId, node }, '', path);
      } else if (shouldPush) {
        window.history.pushState({ workspace: true, sessionId, node }, '', path);
      } else {
        window.history.replaceState({ workspace: true, sessionId, node }, '', path);
      }
    }
  }, [sessionId]);

  const pushPathForNode = useCallback((node: WorkflowNodeKey) => {
    if (!sessionId || typeof window === 'undefined') return;
    const path = buildWorkspacePath(sessionId, node);
    if (window.location.pathname !== path) {
      window.history.pushState({ workspace: true, sessionId, node }, '', path);
    }
  }, [sessionId]);

  // Session/bootstrap init
  useEffect(() => {
    if (!sessionId || typeof window === 'undefined') return;

    if (initializedSessionRef.current === sessionId) return;
    initializedSessionRef.current = sessionId;

    const pathNode = readNodeFromPath(sessionId, window.location.pathname);
    const persisted = safeLoadNavState(sessionId);
    const persistedEntries = persisted?.entries && persisted.entries.length > 0
      ? persisted.entries
      : undefined;
    const persistedCursor = typeof persisted?.cursor === 'number'
      ? Math.max(0, Math.min(persisted.cursor, (persistedEntries?.length ?? 1) - 1))
      : undefined;
    const persistedSelected = persisted?.selectedNode;

    const initialNode = pathNode ?? persistedSelected ?? activeNode ?? DEFAULT_NODE;
    let entries = persistedEntries ?? [initialNode];
    if (!entries.length) entries = [initialNode];
    if (!entries.includes(initialNode)) entries = [...entries, initialNode];
    const cursor = typeof persistedCursor === 'number'
      ? persistedCursor
      : Math.max(0, entries.lastIndexOf(initialNode));

    setNavState({
      entries,
      cursor,
      selectedNode: initialNode,
    });

    if (!pathNode) {
      applySelection(initialNode, {
        replace: true,
        source: 'system',
        force: true,
      });
    }
  }, [sessionId, activeNode, applySelection]);

  // Persist nav state
  useEffect(() => {
    if (!sessionId || typeof window === 'undefined') return;
    safeSaveNavState(sessionId, navState);
  }, [sessionId, navState]);

  // Follow pipeline progression when the user is still viewing the active node
  useEffect(() => {
    const prevActive = prevActiveNodeRef.current;
    if (prevActive === activeNode) return;
    const wasFollowing = navState.selectedNode === prevActive;
    prevActiveNodeRef.current = activeNode;
    if (wasFollowing) {
      applySelection(activeNode, {
        push: true,
        source: 'system',
        force: true,
      });
    }
  }, [activeNode, navState.selectedNode, applySelection]);

  // Respond to browser back/forward
  useEffect(() => {
    if (!sessionId || typeof window === 'undefined') return;
    const onPopState = () => {
      const pathNode = readNodeFromPath(sessionId, window.location.pathname);
      if (!pathNode) return;
      applySelection(pathNode, { source: 'popstate' });
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [sessionId, applySelection]);

  const selectedNode = navState.entries[navState.cursor] ?? navState.selectedNode ?? DEFAULT_NODE;
  const canGoBack = navState.cursor > 0;
  const canGoForward = navState.cursor < navState.entries.length - 1;

  const goToNode = useCallback((node: WorkflowNodeKey) => {
    applySelection(node, { push: true, source: 'user' });
  }, [applySelection]);

  const goBack = useCallback(() => {
    if (!canGoBack) return;
    setNavState((prev) => {
      const nextCursor = Math.max(0, prev.cursor - 1);
      const node = prev.entries[nextCursor] ?? prev.selectedNode;
      if (node) pushPathForNode(node);
      return {
        ...prev,
        cursor: nextCursor,
        selectedNode: node ?? prev.selectedNode,
      };
    });
  }, [canGoBack, pushPathForNode]);

  const goForward = useCallback(() => {
    if (!canGoForward) return;
    setNavState((prev) => {
      const nextCursor = Math.min(prev.entries.length - 1, prev.cursor + 1);
      const node = prev.entries[nextCursor] ?? prev.selectedNode;
      if (node) pushPathForNode(node);
      return {
        ...prev,
        cursor: nextCursor,
        selectedNode: node ?? prev.selectedNode,
      };
    });
  }, [canGoForward, pushPathForNode]);

  const returnToActiveNode = useCallback(() => {
    applySelection(activeNode, { push: true, source: 'user', force: true });
  }, [activeNode, applySelection]);

  return useMemo(() => ({
    selectedNode,
    entries: navState.entries,
    cursor: navState.cursor,
    canGoBack,
    canGoForward,
    goToNode,
    goBack,
    goForward,
    returnToActiveNode,
  }), [
    selectedNode,
    navState.entries,
    navState.cursor,
    canGoBack,
    canGoForward,
    goToNode,
    goBack,
    goForward,
    returnToActiveNode,
  ]);
}
