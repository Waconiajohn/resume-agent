// Chrome Extension Service Worker — handles auth, API proxy, tab monitoring, badge

import { CONFIG } from '../shared/config.js';
import { normalizeJobUrl, isJobApplicationPage, detectPlatform } from '../shared/url-normalizer.js';
import type { ExtensionMessage, TabStatus, ResumePayload, ATSPlatform } from '../shared/types.js';

// ─── Auth Helpers ─────────────────────────────────────────────────────────────

async function getAuthToken(): Promise<string | null> {
  const result = await chrome.storage.local.get(CONFIG.STORAGE.AUTH_TOKEN);
  return (result[CONFIG.STORAGE.AUTH_TOKEN] as string) ?? null;
}

async function getUserId(): Promise<string | null> {
  const result = await chrome.storage.local.get(CONFIG.STORAGE.USER_ID);
  return (result[CONFIG.STORAGE.USER_ID] as string) ?? null;
}

async function getUserEmail(): Promise<string | null> {
  const result = await chrome.storage.local.get(CONFIG.STORAGE.USER_EMAIL);
  return (result[CONFIG.STORAGE.USER_EMAIL] as string) ?? null;
}

async function setAuth(token: string, userId: string, email: string): Promise<void> {
  await chrome.storage.local.set({
    [CONFIG.STORAGE.AUTH_TOKEN]: token,
    [CONFIG.STORAGE.USER_ID]: userId,
    [CONFIG.STORAGE.USER_EMAIL]: email,
  });
}

async function clearAuth(): Promise<void> {
  await chrome.storage.local.remove([
    CONFIG.STORAGE.AUTH_TOKEN,
    CONFIG.STORAGE.USER_ID,
    CONFIG.STORAGE.USER_EMAIL,
  ]);
}

// ─── API Client ───────────────────────────────────────────────────────────────

async function apiRequest<T>(endpoint: string, method = 'GET', body?: unknown): Promise<T> {
  const token = await getAuthToken();
  const version = chrome.runtime.getManifest().version;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Extension-Version': version,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const response = await fetch(`${CONFIG.API_BASE_URL}${endpoint}`, init);

  if (response.status === 401) {
    await clearAuth();
    throw new Error('NOT_AUTHENTICATED');
  }

  return response.json() as Promise<T>;
}

// ─── Resume Lookup with Cache ──────────────────────────────────────────────────

interface CachedResume {
  resume: ResumePayload | null;
  cachedAt: number;
}

async function fetchResumeForJob(jobUrl: string): Promise<ResumePayload | null> {
  const normalizedUrl = normalizeJobUrl(jobUrl);
  const cacheKey = `resume_cache_${normalizedUrl}`;

  // Check session storage cache
  try {
    const cached = await chrome.storage.session.get(cacheKey);
    const entry = cached[cacheKey] as CachedResume | undefined;
    if (entry && Date.now() - entry.cachedAt < CONFIG.CACHE_TTL_MS) {
      console.log('[CareerIQ] Resume cache hit for', normalizedUrl);
      return entry.resume;
    }
  } catch {
    // Session storage may not be available — proceed to network request
  }

  // Cache miss — fetch from API
  try {
    const result = await apiRequest<{ resume: ResumePayload | null }>(
      CONFIG.ENDPOINTS.RESUME_LOOKUP,
      'POST',
      { jobUrl: normalizedUrl }
    );

    const resume = result.resume ?? null;

    // Write to session storage cache (best-effort)
    chrome.storage.session
      .set({ [cacheKey]: { resume, cachedAt: Date.now() } satisfies CachedResume })
      .catch(() => {});

    return resume;
  } catch (err) {
    if ((err as Error).message === 'NOT_AUTHENTICATED') {
      return null;
    }
    console.log('[CareerIQ] Resume lookup failed:', (err as Error).message);
    return null;
  }
}

// ─── Job Discovery ─────────────────────────────────────────────────────────────

async function discoverJob(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.url) return;

  apiRequest<void>(CONFIG.ENDPOINTS.JOB_DISCOVER, 'POST', {
    url: tab.url,
    title: tab.title ?? '',
    platform: detectPlatform(tab.url),
  }).catch((err: Error) => {
    console.log('[CareerIQ] Job discovery error (non-critical):', err.message);
  });
}

// ─── Apply Status ──────────────────────────────────────────────────────────────

async function updateApplyStatus(jobUrl: string, platform: ATSPlatform): Promise<void> {
  const normalizedUrl = normalizeJobUrl(jobUrl);
  await apiRequest<void>(CONFIG.ENDPOINTS.APPLY_STATUS, 'POST', {
    jobUrl: normalizedUrl,
    platform,
    appliedAt: new Date().toISOString(),
  });
}

// ─── Badge Helpers ─────────────────────────────────────────────────────────────

function setBadgeReady(tabId: number): void {
  chrome.action.setBadgeText({ text: '', tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#22c55e', tabId }); // green
  chrome.action.setTitle({ title: 'CareerIQ — Tailored resume ready', tabId });
}

function setBadgeNoResume(tabId: number): void {
  chrome.action.setBadgeText({ text: '!', tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#eab308', tabId }); // yellow
  chrome.action.setTitle({ title: 'CareerIQ — No tailored resume for this job', tabId });
}

function setBadgeAuthError(tabId: number): void {
  chrome.action.setBadgeText({ text: '?', tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#6b7280', tabId }); // gray
  chrome.action.setTitle({ title: 'CareerIQ — Sign in to enable resume fill', tabId });
}

function clearBadge(tabId: number): void {
  chrome.action.setBadgeText({ text: '', tabId });
  chrome.action.setTitle({ title: 'CareerIQ', tabId });
}

// ─── Tab Status Cache ──────────────────────────────────────────────────────────

function tabStatusKey(tabId: number): string {
  return `tab_status_${tabId}`;
}

async function cacheTabStatus(tabId: number, status: TabStatus): Promise<void> {
  chrome.storage.session
    .set({ [tabStatusKey(tabId)]: status })
    .catch(() => {});
}

async function getCachedTabStatus(tabId: number): Promise<TabStatus | null> {
  try {
    const result = await chrome.storage.session.get(tabStatusKey(tabId));
    return (result[tabStatusKey(tabId)] as TabStatus) ?? null;
  } catch {
    return null;
  }
}

async function clearTabStatus(tabId: number): Promise<void> {
  chrome.storage.session.remove(tabStatusKey(tabId)).catch(() => {});
}

// ─── Tab Monitoring ────────────────────────────────────────────────────────────

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url) return;

  const token = await getAuthToken();
  if (!token) {
    // Not authenticated — clear any stale status for this tab
    clearBadge(tabId);
    return;
  }

  if (!isJobApplicationPage(tab.url)) {
    clearBadge(tabId);
    return;
  }

  // Fire-and-forget job discovery
  discoverJob(tab);

  // Fetch resume and update badge
  const resume = await fetchResumeForJob(tab.url);
  const platform = detectPlatform(tab.url);

  let status: TabStatus;

  if (resume !== null) {
    setBadgeReady(tabId);
    status = {
      status: 'RESUME_READY',
      isJobPage: true,
      platform,
      url: tab.url,
      resume,
    };
  } else {
    // Distinguish auth error vs no resume by re-checking token
    const currentToken = await getAuthToken();
    if (!currentToken) {
      setBadgeAuthError(tabId);
      status = {
        status: 'ERROR',
        isJobPage: true,
        platform,
        url: tab.url,
        resume: null,
      };
    } else {
      setBadgeNoResume(tabId);
      status = {
        status: 'NO_RESUME',
        isJobPage: true,
        platform,
        url: tab.url,
        resume: null,
      };
    }
  }

  await cacheTabStatus(tabId, status);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  clearTabStatus(tabId);
});

// ─── Message Router ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, sender: chrome.runtime.MessageSender, sendResponse) => {
    handleMessage(message, sender)
      .then(sendResponse)
      .catch((err: unknown) => sendResponse({ error: (err as Error).message }));
    return true; // Keep channel open for async response
  }
);

async function handleMessage(
  message: ExtensionMessage,
  _sender: chrome.runtime.MessageSender
): Promise<unknown> {
  switch (message.type) {
    case 'GET_TAB_STATUS': {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.id || !activeTab.url) {
        return {
          status: 'NOT_JOB_PAGE',
          isJobPage: false,
          platform: 'UNKNOWN' as ATSPlatform,
          url: activeTab?.url ?? '',
          resume: null,
        } satisfies TabStatus;
      }

      const cached = await getCachedTabStatus(activeTab.id);
      const isJobPage = isJobApplicationPage(activeTab.url);
      const platform = detectPlatform(activeTab.url);

      if (cached) {
        // Merge live detection with cached resume data
        return {
          ...cached,
          isJobPage,
          platform,
          url: activeTab.url,
        } satisfies TabStatus;
      }

      return {
        status: isJobPage ? 'LOADING' : 'NOT_JOB_PAGE',
        isJobPage,
        platform,
        url: activeTab.url,
        resume: null,
      } satisfies TabStatus;
    }

    case 'FETCH_RESUME_FOR_JOB': {
      const resume = await fetchResumeForJob(message.payload.jobUrl);
      return { resume };
    }

    case 'GET_RESUME_FOR_CURRENT_PAGE': {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.url) return { resume: null };
      const resume = await fetchResumeForJob(activeTab.url);
      return { resume };
    }

    case 'APPLICATION_SUBMITTED': {
      const { jobUrl, platform } = message.payload;
      await updateApplyStatus(jobUrl, platform);
      return { ok: true };
    }

    case 'SET_AUTH': {
      const { token, userId } = message.payload;
      // Email may come from a separate flow — read current email or leave blank
      const existingEmail = (await getUserEmail()) ?? '';
      await setAuth(token, userId, existingEmail);
      console.log('[CareerIQ] Auth set for user', userId);
      return { ok: true };
    }

    case 'LOGOUT': {
      await clearAuth();
      // Clear all tab status caches on logout
      const tabs = await chrome.tabs.query({});
      await Promise.all(tabs.map(tab => (tab.id ? clearTabStatus(tab.id) : Promise.resolve())));
      console.log('[CareerIQ] Logged out, auth cleared');
      return { ok: true };
    }

    case 'CHECK_AUTH': {
      const token = await getAuthToken();
      if (!token) {
        return { authenticated: false };
      }

      try {
        const result = await apiRequest<{ id: string; email: string }>(
          CONFIG.ENDPOINTS.AUTH_VERIFY,
          'GET'
        );
        const id = result.id ?? (await getUserId()) ?? '';
        const email = result.email ?? (await getUserEmail()) ?? '';

        // Persist latest email from server
        if (result.email) {
          await chrome.storage.local.set({ [CONFIG.STORAGE.USER_EMAIL]: result.email });
        }

        return { authenticated: true, user: { id, email } };
      } catch {
        return { authenticated: false };
      }
    }

    case 'AI_FIELD_INFERENCE': {
      const result = await apiRequest<{ elementIndex: number | null }>(
        CONFIG.ENDPOINTS.INFER_FIELD,
        'POST',
        message.payload
      );
      return { elementIndex: result.elementIndex ?? null };
    }

    case 'TRIGGER_FILL': {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.id) return { ok: false, error: 'No active tab' };

      await chrome.tabs.sendMessage(activeTab.id, { type: 'DO_FILL' });
      return { ok: true };
    }

    case 'FETCH_RESUME_PDF': {
      const { sessionId } = message.payload;
      try {
        const token = await getAuthToken();
        if (!token || !sessionId) return { dataUrl: null };

        const resp = await fetch(
          `${CONFIG.API_BASE_URL}/api/extension/resume-pdf/${sessionId}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'X-Extension-Version': chrome.runtime.getManifest().version,
            },
          },
        );

        if (!resp.ok) return { dataUrl: null };

        const blob = await resp.blob();
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });

        return { dataUrl };
      } catch {
        return { dataUrl: null };
      }
    }

    default: {
      // Exhaustiveness guard — message.type is `never` here if all cases are covered
      const _exhaustive: never = message;
      console.log('[CareerIQ] Unhandled message type:', (_exhaustive as ExtensionMessage).type);
      return { error: 'Unknown message type' };
    }
  }
}

console.log('[CareerIQ] Service worker initialized');
