import { CONFIG } from '../shared/config.js';
import type { ATSPlatform, TabStatus } from '../shared/types.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CheckAuthResponse {
  authenticated: boolean;
  user?: { id: string; email: string };
}

interface GetTabStatusResponse extends TabStatus {}

interface LogoutResponse {
  ok: boolean;
}

// ─── DOM Helpers ──────────────────────────────────────────────────────────────

const $ = (id: string): HTMLElement | null => document.getElementById(id);

function getEl(id: string): HTMLElement {
  const el = $(id);
  if (!el) throw new Error(`Element #${id} not found`);
  return el;
}

function getBtn(id: string): HTMLButtonElement {
  const el = getEl(id);
  if (!(el instanceof HTMLButtonElement)) throw new Error(`Element #${id} is not a button`);
  return el;
}

function getAnchor(id: string): HTMLAnchorElement {
  const el = getEl(id);
  if (!(el instanceof HTMLAnchorElement)) throw new Error(`Element #${id} is not an anchor`);
  return el;
}

// ─── State ────────────────────────────────────────────────────────────────────

let currentTabStatus: TabStatus | null = null;

// ─── Screen Management ────────────────────────────────────────────────────────

function showScreen(name: 'loading' | 'auth' | 'main'): void {
  const screens = ['loading-screen', 'auth-screen', 'main-screen'];
  for (const screenId of screens) {
    const el = $(screenId);
    if (el) {
      el.style.display = screenId === `${name}-screen` ? 'block' : 'none';
    }
  }
}

// ─── Status Rendering ─────────────────────────────────────────────────────────

function setStatus(color: string, label: string, body: string): void {
  const dot = $('status-dot');
  const labelEl = $('status-label');
  const bodyEl = $('status-body');

  if (dot) {
    dot.style.background = color;
  }
  if (labelEl) {
    labelEl.textContent = label;
  }
  if (bodyEl) {
    bodyEl.textContent = body;
  }
}

function renderStatus(status: TabStatus | null): void {
  const card = $('status-card');
  const resumeInfo = $('resume-info');
  const resumeName = $('resume-name');
  const resumeMeta = $('resume-meta');
  const fillBtn = getBtn('fill-btn');
  const tailorBtn = $('tailor-btn');
  const platformBadge = $('platform-badge');
  const platformName = $('platform-name');

  // Reset card classes
  if (card) {
    card.className = 'status-card';
  }

  // Hide tailor button by default
  if (tailorBtn) {
    tailorBtn.style.display = 'none';
  }

  // Hide resume info by default
  if (resumeInfo) {
    resumeInfo.style.display = 'none';
  }

  // Platform badge
  if (platformBadge && platformName) {
    if (status && status.platform && status.platform !== 'UNKNOWN') {
      platformName.textContent = formatPlatformName(status.platform);
      platformBadge.style.display = 'inline-block';
    } else {
      platformBadge.style.display = 'none';
    }
  }

  if (!status || !status.isJobPage) {
    // Not a job page
    setStatus('#6b7280', 'Not a Job Page', 'Navigate to a job application to get started.');
    fillBtn.disabled = true;
    fillBtn.textContent = 'Auto-Fill Resume';
    if (card) card.classList.add('not-job-page');
    return;
  }

  if (status.status === 'RESUME_READY' && status.resume) {
    // Tailored resume available
    setStatus('#22c55e', 'Resume Ready', 'A tailored resume is ready for this job.');
    fillBtn.disabled = false;
    fillBtn.textContent = 'Auto-Fill Resume';

    if (card) card.classList.add('ready');

    // Show resume info
    if (resumeInfo) {
      resumeInfo.style.display = 'block';
    }
    if (resumeName) {
      const jobTitle = status.resume.job_title ?? 'Tailored Resume';
      const company = status.resume.company_name ?? '';
      resumeName.textContent = company ? `${jobTitle} — ${company}` : jobTitle;
    }
    if (resumeMeta) {
      const version = status.resume.version != null ? `v${status.resume.version}` : '';
      const date = formatDate(status.resume.created_at);
      const parts = [version, date].filter(Boolean);
      resumeMeta.textContent = parts.join('  ·  ');
    }

    // Hide tailor button when resume is ready
    if (tailorBtn) {
      tailorBtn.style.display = 'none';
    }
  } else {
    // Job page but no tailored resume
    setStatus('#eab308', 'No Tailored Resume', 'No resume has been tailored for this job yet.');
    fillBtn.disabled = false;
    fillBtn.textContent = 'Fill with Master Resume';

    if (card) card.classList.add('no-resume');

    // Show tailor button
    if (tailorBtn) {
      tailorBtn.style.display = 'block';
      const appBase = CONFIG.API_BASE_URL.replace(':3001', ':5173');
      const jobUrl = status.url ? encodeURIComponent(status.url) : '';
      if (tailorBtn instanceof HTMLAnchorElement) {
        tailorBtn.href = `${appBase}/tailor?url=${jobUrl}`;
      }
    }
  }
}

// ─── Fill Handler ─────────────────────────────────────────────────────────────

function triggerFillFromPopup(): void {
  document.dispatchEvent(new CustomEvent('careeriq:trigger-fill'));
}

async function handleFillClick(): Promise<void> {
  const fillBtn = getBtn('fill-btn');

  fillBtn.disabled = true;
  fillBtn.textContent = 'Filling...';

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) {
      throw new Error('No active tab');
    }

    await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: triggerFillFromPopup,
    });

    fillBtn.textContent = 'Fill Complete';

    setTimeout(() => {
      fillBtn.disabled = false;
      fillBtn.textContent = 'Fill Again';
    }, 3000);
  } catch (err) {
    console.error('[CareerIQ] Fill error:', err);
    fillBtn.disabled = false;
    fillBtn.textContent = 'Try Again';
  }
}

// ─── Logout Handler ───────────────────────────────────────────────────────────

async function handleLogout(e: Event): Promise<void> {
  e.preventDefault();
  await sendMessage({ type: 'LOGOUT' });
  showScreen('auth');
}

// ─── Message Helpers ──────────────────────────────────────────────────────────

function sendMessage(message: { type: string; payload?: unknown }): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: unknown) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

// ─── Formatting Helpers ───────────────────────────────────────────────────────

function formatPlatformName(platform: ATSPlatform): string {
  const names: Record<ATSPlatform, string> = {
    GREENHOUSE: 'Greenhouse',
    LEVER: 'Lever',
    LINKEDIN: 'LinkedIn',
    INDEED: 'Indeed',
    WORKDAY: 'Workday',
    ICIMS: 'iCIMS',
    UNKNOWN: '',
  };
  return names[platform] ?? '';
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '';
  try {
    const date = new Date(iso);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

// ─── DOM Builder ──────────────────────────────────────────────────────────────

function buildUI(): void {
  const app = document.getElementById('app');
  if (!app) return;

  const appBase = CONFIG.API_BASE_URL.replace(':3001', ':5173');

  app.innerHTML = `
    <!-- Loading Screen -->
    <div id="loading-screen" style="display:none;">
      <div class="loading">Loading...</div>
    </div>

    <!-- Auth Screen -->
    <div id="auth-screen" style="display:none;">
      <div class="header">
        <span class="header-logo">&#9670;</span>
        <span class="header-title">CareerIQ</span>
      </div>
      <div class="status-card">
        <div class="status-label">Sign in to get started</div>
        <div class="status-value">Auto-fill job applications with your tailored resume.</div>
      </div>
      <a
        href="${appBase}/login?source=extension"
        target="_blank"
        rel="noopener noreferrer"
        class="btn"
      >Sign In to CareerIQ</a>
    </div>

    <!-- Main Screen -->
    <div id="main-screen" style="display:none;">
      <div class="header">
        <span class="header-logo">&#9670;</span>
        <span class="header-title">CareerIQ</span>
        <span id="platform-badge" style="margin-left:auto; display:none; font-size:11px; color:#888; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:4px; padding:2px 6px;">
          <span id="platform-name"></span>
        </span>
      </div>

      <div id="status-card" class="status-card">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
          <span id="status-dot" style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#6b7280; flex-shrink:0;"></span>
          <span id="status-label" class="status-label" style="margin-bottom:0;">—</span>
        </div>
        <div id="status-body" class="status-value"></div>
        <div id="resume-info" style="display:none; margin-top:8px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.06);">
          <div id="resume-name" style="font-size:13px; color:#fff; font-weight:500;"></div>
          <div id="resume-meta" style="font-size:11px; color:#555; margin-top:2px;"></div>
        </div>
      </div>

      <button id="fill-btn" class="btn" disabled>Auto-Fill Resume</button>
      <a id="tailor-btn" href="#" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="display:none; text-decoration:none;">
        Tailor Resume for This Job
      </a>
      <button id="open-app-btn" class="btn btn-secondary">Open CareerIQ</button>

      <div style="margin-top:12px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.06); display:flex; justify-content:space-between; align-items:center;">
        <span id="user-email" style="font-size:11px; color:#444;"></span>
        <button id="logout-btn" style="background:none; border:none; color:#555; font-size:11px; cursor:pointer; padding:0;">Sign out</button>
      </div>
    </div>
  `;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  // Build the 3-screen UI into #app
  buildUI();

  showScreen('loading');

  let authResponse: CheckAuthResponse;
  try {
    authResponse = (await sendMessage({ type: 'CHECK_AUTH' })) as CheckAuthResponse;
  } catch (err) {
    console.error('[CareerIQ] CHECK_AUTH failed:', err);
    showScreen('auth');
    return;
  }

  if (!authResponse.authenticated) {
    showScreen('auth');
    return;
  }

  // Set user email in footer
  const userEmailEl = $('user-email');
  if (userEmailEl && authResponse.user?.email) {
    userEmailEl.textContent = authResponse.user.email;
  }

  showScreen('main');

  // Fetch tab status
  try {
    const status = (await sendMessage({ type: 'GET_TAB_STATUS' })) as GetTabStatusResponse;
    currentTabStatus = status;
    renderStatus(status);
  } catch (err) {
    console.error('[CareerIQ] GET_TAB_STATUS failed:', err);
    renderStatus(null);
  }

  // Wire up fill button
  const fillBtn = $('fill-btn');
  if (fillBtn) {
    fillBtn.addEventListener('click', () => {
      handleFillClick().catch((err: unknown) => console.error('[CareerIQ] Fill click error:', err));
    });
  }

  // Wire up logout button
  const logoutBtn = $('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      handleLogout(e).catch((err: unknown) =>
        console.error('[CareerIQ] Logout error:', err)
      );
    });
  }

  // Wire up open-app button
  const openAppBtn = $('open-app-btn');
  if (openAppBtn) {
    openAppBtn.addEventListener('click', () => {
      const appBase = CONFIG.API_BASE_URL.replace(':3001', ':5173');
      chrome.tabs.create({ url: appBase });
    });
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  init().catch((err: unknown) => console.error('[CareerIQ] Popup init error:', err));
});
