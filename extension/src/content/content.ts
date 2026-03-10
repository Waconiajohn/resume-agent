import { FieldMapper } from './field-mapper.js';
import { detectPlatform } from '../shared/url-normalizer.js';
import type { ATSPlatform, ResumePayload } from '../shared/types.js';

// ─── Module State ─────────────────────────────────────────────────────────────

let currentResume: ResumePayload | null = null;
let fillButton: HTMLDivElement | null = null;
let statusBanner: HTMLDivElement | null = null;
let isFilledAlready = false;

// ─── Initialisation ───────────────────────────────────────────────────────────

async function init(): Promise<void> {
  const platform = detectPlatform(window.location.href);
  if (platform === 'UNKNOWN') return;

  console.log('[CareerIQ] Detected platform:', platform, 'on', window.location.href);

  // Request resume from background service worker
  let resume: ResumePayload | null = null;
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_RESUME_FOR_CURRENT_PAGE',
    }) as { resume: ResumePayload | null };
    resume = response?.resume ?? null;
  } catch (err) {
    console.log('[CareerIQ] Failed to fetch resume:', (err as Error).message);
  }

  currentResume = resume;
  injectUI(platform, resume);
  watchForSubmission(platform);
  watchForFormChanges(platform);

  // LinkedIn: if the Easy Apply modal hasn't opened yet, watch for it
  if (platform === 'LINKEDIN' && !document.querySelector('.jobs-easy-apply-modal')) {
    watchForLinkedInModal();
  }
}

// ─── UI Injection ─────────────────────────────────────────────────────────────

function injectUI(platform: ATSPlatform, resume: ResumePayload | null): void {
  removeExistingUI();

  if (resume) {
    injectFillButton(platform, resume);
    injectStatusBanner('ready', resume);
  } else {
    injectStatusBanner('warn', null);
  }
}

function injectFillButton(platform: ATSPlatform, resume: ResumePayload): void {
  const btn = document.createElement('div');
  btn.id = 'careeriq-fill-btn';
  btn.innerHTML = `
    <div class="ciq-btn-inner">
      <span class="ciq-logo">⚡</span>
      <div class="ciq-btn-text">
        <span class="ciq-btn-title">Fill with CareerIQ</span>
        <span class="ciq-btn-sub">Tailored for this role</span>
      </div>
      <span class="ciq-btn-arrow">→</span>
    </div>
  `;

  btn.addEventListener('click', () => {
    if (isFilledAlready) return;
    handleFillClick(platform, resume);
  });

  document.body.appendChild(btn);
  fillButton = btn;
}

function injectStatusBanner(state: 'ready' | 'warn', resume: ResumePayload | null): void {
  const banner = document.createElement('div');
  banner.id = 'careeriq-banner';

  if (state === 'ready' && resume) {
    const role = resume.job_title ?? 'this role';
    const company = resume.company_name ?? 'the company';
    banner.innerHTML = `
      <div class="ciq-banner-inner ciq-banner-ready">
        <span class="ciq-banner-icon">✓</span>
        <span class="ciq-banner-text">
          CareerIQ resume ready — tailored for <strong>${role}</strong> at <strong>${company}</strong>
        </span>
        <button class="ciq-banner-close" title="Dismiss">✕</button>
      </div>
    `;
  } else {
    banner.innerHTML = `
      <div class="ciq-banner-inner ciq-banner-warn">
        <span class="ciq-banner-icon">⚠</span>
        <span class="ciq-banner-text">
          No tailored resume found for this job.
          <a href="http://localhost:5173" target="_blank" class="ciq-link">Build one on CareerIQ →</a>
        </span>
        <button class="ciq-banner-close" title="Dismiss">✕</button>
      </div>
    `;
  }

  const closeBtn = banner.querySelector<HTMLButtonElement>('.ciq-banner-close');
  closeBtn?.addEventListener('click', () => banner.remove());

  document.body.insertBefore(banner, document.body.firstChild);
  statusBanner = banner;
}

function showFillProgress(message: string, type: 'loading' | 'done' | 'error'): void {
  if (!fillButton) return;

  fillButton.classList.remove('ciq-loading', 'ciq-done');

  if (type === 'loading') {
    fillButton.classList.add('ciq-loading');
  } else if (type === 'done') {
    fillButton.classList.add('ciq-done');
  }

  const subtitle = fillButton.querySelector<HTMLElement>('.ciq-btn-sub');
  if (subtitle) {
    subtitle.textContent = message;
  }

  if (statusBanner) {
    const text = statusBanner.querySelector<HTMLElement>('.ciq-banner-text');
    if (text) {
      text.textContent = message;
    }
  }
}

// ─── Fill Orchestration ───────────────────────────────────────────────────────

async function handleFillClick(platform: ATSPlatform, resume: ResumePayload): Promise<void> {
  if (isFilledAlready) return;

  console.log('[CareerIQ] Fill triggered for platform:', platform);
  showFillProgress('Filling form...', 'loading');

  try {
    const mapper = new FieldMapper(platform, resume);
    const log = await mapper.fillAll();

    const filled = log.filter(e => e.status === 'FILLED').length;
    const notFound = log.filter(e => e.status === 'NOT_FOUND').length;

    isFilledAlready = true;
    showFillProgress(`Done — ${filled} fields filled${notFound > 0 ? `, ${notFound} not found` : ''}`, 'done');
    console.log('[CareerIQ] Fill result:', log);
  } catch (err) {
    console.log('[CareerIQ] Fill failed:', (err as Error).message);
    showFillProgress('Fill error — please fill manually', 'error');
  }
}

// ─── Submission Detection ─────────────────────────────────────────────────────

function watchForSubmission(platform: ATSPlatform): void {
  let lastUrl = window.location.href;

  // Poll for URL changes (SPA navigation)
  const urlPoller = setInterval(() => {
    const currentUrl = window.location.href;
    if (currentUrl === lastUrl) return;

    lastUrl = currentUrl;

    if (isConfirmationPage(currentUrl)) {
      clearInterval(urlPoller);
      notifySubmission(currentUrl, platform);
      return;
    }

    // URL changed but not a confirmation — re-init (new form step or new page)
    isFilledAlready = false;
    init();
  }, 1000);

  // Also watch for submit button clicks as a fallback signal
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const isSubmitBtn =
      (target instanceof HTMLButtonElement && target.type === 'submit') ||
      (target instanceof HTMLInputElement && target.type === 'submit') ||
      target.closest('[type="submit"]') !== null ||
      /submit|apply now|send application/i.test(target.textContent ?? '');

    if (isSubmitBtn) {
      // Delay check to allow SPA navigation to settle
      setTimeout(() => {
        if (isConfirmationPage(window.location.href)) {
          notifySubmission(window.location.href, platform);
        }
      }, 2000);
    }
  }, { capture: true });
}

function isConfirmationPage(url: string): boolean {
  return /thank[-_]?you|confirmation|application[-_]?submitted|success|applied/i.test(url);
}

function notifySubmission(jobUrl: string, platform: ATSPlatform): void {
  console.log('[CareerIQ] Application submitted detected, notifying background');
  chrome.runtime.sendMessage({
    type: 'APPLICATION_SUBMITTED',
    payload: { jobUrl, platform },
  }).catch((err: Error) => {
    console.log('[CareerIQ] Failed to notify submission:', err.message);
  });
}

// ─── Multi-Step Form Handling (LinkedIn / Workday) ────────────────────────────

function watchForFormChanges(platform: ATSPlatform): void {
  if (platform !== 'LINKEDIN' && platform !== 'WORKDAY') return;

  let fillDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  const observer = new MutationObserver((mutations) => {
    // Check if new form inputs were added to the DOM
    const hasNewInputs = mutations.some(m =>
      Array.from(m.addedNodes).some(n =>
        n.nodeType === Node.ELEMENT_NODE &&
        ((n as Element).tagName === 'INPUT' ||
         (n as Element).querySelector?.('input, textarea, select') !== null)
      )
    );

    if (!hasNewInputs || !currentResume) return;

    // Debounce — LinkedIn may add multiple DOM nodes in rapid succession
    if (fillDebounceTimer) clearTimeout(fillDebounceTimer);
    fillDebounceTimer = setTimeout(async () => {
      console.log('[CareerIQ] New form step detected — auto-filling visible fields');
      const mapper = new FieldMapper(platform, currentResume!);
      try {
        const log = await mapper.fillVisibleFields();
        const filled = log.filter(l => l.status === 'FILLED').length;
        if (filled > 0) {
          showFillProgress(`Auto-filled ${filled} fields on new step`, 'done');
        }
      } catch (e) {
        console.warn('[CareerIQ] Step auto-fill error:', e);
      }
    }, 500); // 500ms debounce for DOM settle
  });

  // Observe the modal container specifically for LinkedIn; fall back to body
  const observeTarget = platform === 'LINKEDIN'
    ? document.querySelector('.jobs-easy-apply-modal') ?? document.body
    : document.body;

  observer.observe(observeTarget, { childList: true, subtree: true });
}

// ─── LinkedIn Modal Detection ─────────────────────────────────────────────────

function watchForLinkedInModal(): void {
  // LinkedIn Easy Apply modal may not exist when the content script first loads
  const observer = new MutationObserver(() => {
    const modal = document.querySelector('.jobs-easy-apply-modal');
    if (modal) {
      console.log('[CareerIQ] LinkedIn Easy Apply modal detected');
      observer.disconnect();
      // Re-run init logic now that the modal is present
      if (currentResume) {
        injectFillButton(detectPlatform(window.location.href), currentResume);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

function removeExistingUI(): void {
  document.getElementById('careeriq-fill-btn')?.remove();
  document.getElementById('careeriq-banner')?.remove();
  fillButton = null;
  statusBanner = null;
}

// ─── Message Listener (from popup / background DO_FILL) ───────────────────────

chrome.runtime.onMessage.addListener((message: { type: string }) => {
  if (message.type === 'DO_FILL' && currentResume) {
    const platform = detectPlatform(window.location.href);
    handleFillClick(platform, currentResume);
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { init(); });
} else {
  init();
}
