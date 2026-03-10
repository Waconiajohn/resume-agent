import { FIELD_LABEL_MAP } from '../shared/config.js';
import type { ATSPlatform, ResumePayload, FillLogEntry, FlattenedResume, FormElementSnapshot } from '../shared/types.js';

// ─── ATS Profile Definitions ──────────────────────────────────────────────────

type ATSFieldSelector = () => Element | null;

interface ATSProfile {
  [key: string]: ATSFieldSelector | string | undefined;
  _strategy?: string;
}

const ATS_PROFILES: Partial<Record<ATSPlatform, ATSProfile>> = {
  GREENHOUSE: {
    first_name: () => document.getElementById('first_name'),
    last_name: () => document.getElementById('last_name'),
    email: () => document.getElementById('email'),
    phone: () => document.getElementById('phone'),
    resume_upload: () => document.getElementById('resume'),
    cover_letter: () => document.getElementById('cover_letter'),
    linkedin_url: () => document.querySelector('[name*="linkedin"]'),
    website_url: () => document.querySelector('[name*="website"], [name*="portfolio"]'),
  },
  LEVER: {
    full_name: () => document.querySelector('[name="name"]'),
    email: () => document.querySelector('[name="email"]'),
    phone: () => document.querySelector('[name="phone"]'),
    org: () => document.querySelector('[name="org"]'),
    urls_linkedin: () => document.querySelector('[name="urls[LinkedIn]"]'),
    urls_portfolio: () => document.querySelector('[name="urls[Portfolio]"]'),
    resume_upload: () => document.querySelector('.upload-input, [data-qa="resume-upload"]'),
    cover_letter: () => document.querySelector('[name="comments"]'),
  },
  LINKEDIN: {
    _strategy: 'label_match',
    resume_upload: () => document.querySelector<HTMLElement>(
      '.jobs-document-upload__upload-button input[type="file"], ' +
      'input[type="file"][id*="resume"], ' +
      'input[type="file"][data-test-file-input]'
    ),
    phone: () => document.querySelector<HTMLElement>(
      'input[id*="phoneNumber"], input[name*="phoneNumber"]'
    ),
  },
  WORKDAY: {
    _strategy: 'workday_automation_id',
    email: () => document.querySelector('[data-automation-id="email"]'),
    phone: () => document.querySelector('[data-automation-id="phone"]'),
    resume_upload: () => document.querySelector('[data-automation-id="file-upload-input"]'),
  },
};

// ─── Utility ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Standalone flattenResumePayload (exported for testing) ───────────────────

export function flattenResumePayload(resume: ResumePayload): FlattenedResume {
  const flat: FlattenedResume = {};

  // Our contact_info has { name, email, phone, location, linkedin? }
  if (resume.contact_info) {
    const nameParts = (resume.contact_info.name || '').trim().split(/\s+/);
    flat.first_name = nameParts[0] || '';
    flat.last_name = nameParts.slice(1).join(' ') || '';
    flat.full_name = resume.contact_info.name || '';
    flat.email = resume.contact_info.email;
    flat.phone = resume.contact_info.phone;
    flat.location = resume.contact_info.location;
    flat.linkedin_url = resume.contact_info.linkedin;
  }

  // Most recent work experience
  if (resume.experience?.length > 0) {
    const latest = resume.experience[0];
    flat.current_title = latest.title;
    flat.current_company = latest.company;
  }

  // Summary as cover letter fallback
  flat.summary = resume.summary;

  return flat;
}

// ─── FieldMapper Class ────────────────────────────────────────────────────────

export class FieldMapper {
  private platform: ATSPlatform;
  private resume: ResumePayload;
  private profile: ATSProfile;
  private fillLog: FillLogEntry[];
  private allInputs: HTMLElement[];

  constructor(platform: ATSPlatform, resume: ResumePayload) {
    this.platform = platform;
    this.resume = resume;
    this.profile = ATS_PROFILES[platform] ?? {};
    this.fillLog = [];
    this.allInputs = this.collectAllInputs();
  }

  async fillAll(): Promise<FillLogEntry[]> {
    const flat = this.flattenResume();

    console.log('[CareerIQ] Starting fill for platform:', this.platform);
    console.log('[CareerIQ] Flattened resume fields:', Object.keys(flat));

    for (const [fieldName, value] of Object.entries(flat)) {
      if (!value || fieldName === 'summary') continue;

      // Refresh inputs before each field in case of DOM mutations
      this.allInputs = this.collectAllInputs();

      await this.fillField(fieldName, value);
      await sleep(80 + Math.random() * 120);
    }

    // Handle resume upload separately
    await this.handleResumeUpload();

    console.log('[CareerIQ] Fill complete. Log:', this.fillLog);
    return this.fillLog;
  }

  async fillVisibleFields(): Promise<FillLogEntry[]> {
    this.fillLog = [];
    this.allInputs = this.collectAllInputs();
    const resumeFields = this.flattenResume();

    for (const [fieldName, value] of Object.entries(resumeFields)) {
      if (!value || fieldName === 'summary') continue;

      // Only fill if there is a matching visible input on the current step
      const element = this.findByLabelMatch(fieldName) ?? this.findByAttributeMatch(fieldName);
      if (element && this.isElementVisible(element)) {
        await this.fillField(fieldName, value);
        await sleep(80 + Math.random() * 120);
      }
    }

    return this.fillLog;
  }

  private isElementVisible(el: HTMLElement): boolean {
    return el.offsetParent !== null && !el.closest('[style*="display: none"]');
  }

  private async fillField(fieldName: string, value: string): Promise<void> {
    let element: HTMLElement | null = null;

    // 1. Try ATS profile selector first
    const profileEntry = this.profile[fieldName];
    if (typeof profileEntry === 'function') {
      const found = profileEntry();
      if (found instanceof HTMLElement) {
        element = found;
      }
    }

    // 2. Try label-based matching
    if (!element) {
      element = this.findByLabelMatch(fieldName);
    }

    // 3. Try attribute-based matching (name, id, placeholder)
    if (!element) {
      element = this.findByAttributeMatch(fieldName);
    }

    // 4. Fall back to AI inference
    if (!element) {
      element = await this.findByAIInference(fieldName, value);
    }

    if (!element) {
      console.log(`[CareerIQ] Field not found: ${fieldName}`);
      this.fillLog.push({ field: fieldName, status: 'NOT_FOUND' });
      return;
    }

    try {
      await this.setElementValue(element, value);
      this.fillLog.push({
        field: fieldName,
        status: 'FILLED',
        elementTag: element.tagName.toLowerCase(),
      });
      console.log(`[CareerIQ] Filled field: ${fieldName} (${element.tagName.toLowerCase()})`);
    } catch (err) {
      this.fillLog.push({
        field: fieldName,
        status: 'NOT_FOUND',
        error: (err as Error).message,
      });
      console.log(`[CareerIQ] Error filling field ${fieldName}:`, (err as Error).message);
    }
  }

  private findByLabelMatch(fieldName: string): HTMLElement | null {
    const aliases = FIELD_LABEL_MAP[fieldName] ?? [fieldName.replace(/_/g, ' ')];

    // Check <label> elements for text matches
    const labels = Array.from(document.querySelectorAll('label'));
    for (const label of labels) {
      const labelText = label.textContent?.toLowerCase().trim() ?? '';
      const matches = aliases.some(alias => labelText.includes(alias.toLowerCase()));
      if (!matches) continue;

      // Prefer explicit for= association
      if (label.htmlFor) {
        const target = document.getElementById(label.htmlFor);
        if (target instanceof HTMLElement) return target;
      }

      // Fall back to first input inside the label
      const nested = label.querySelector('input, textarea, select');
      if (nested instanceof HTMLElement) return nested;
    }

    // Check aria-label attributes
    for (const el of this.allInputs) {
      const ariaLabel = el.getAttribute('aria-label')?.toLowerCase() ?? '';
      if (aliases.some(alias => ariaLabel.includes(alias.toLowerCase()))) {
        return el;
      }
    }

    return null;
  }

  private findByAttributeMatch(fieldName: string): HTMLElement | null {
    const aliases = FIELD_LABEL_MAP[fieldName] ?? [fieldName];
    // Include the raw fieldName itself as a candidate
    const candidates = [...new Set([fieldName, ...aliases.map(a => a.replace(/\s+/g, '_'))])];

    for (const el of this.allInputs) {
      const name = el.getAttribute('name')?.toLowerCase() ?? '';
      const id = el.getAttribute('id')?.toLowerCase() ?? '';
      const placeholder = el.getAttribute('placeholder')?.toLowerCase() ?? '';

      for (const candidate of candidates) {
        const c = candidate.toLowerCase();
        if (name.includes(c) || id.includes(c) || placeholder.includes(c)) {
          return el;
        }
      }
    }

    return null;
  }

  private async findByAIInference(fieldName: string, value: string): Promise<HTMLElement | null> {
    if (this.allInputs.length === 0) return null;

    const formSnapshot: FormElementSnapshot[] = this.allInputs.map((el, index) => ({
      index,
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') ?? '',
      name: el.getAttribute('name') ?? '',
      id: el.getAttribute('id') ?? '',
      placeholder: el.getAttribute('placeholder') ?? '',
      ariaLabel: el.getAttribute('aria-label'),
      labelText: this.getLabelForElement(el),
    }));

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'AI_FIELD_INFERENCE',
        payload: {
          fieldName,
          fieldValue: value,
          formSnapshot,
          platform: this.platform,
        },
      }) as { elementIndex: number | null };

      if (response?.elementIndex !== null && response?.elementIndex !== undefined) {
        const matched = this.allInputs[response.elementIndex];
        if (matched) {
          console.log(`[CareerIQ] AI inferred field ${fieldName} at index ${response.elementIndex}`);
          return matched;
        }
      }
    } catch (err) {
      console.log(`[CareerIQ] AI inference failed for ${fieldName}:`, (err as Error).message);
    }

    return null;
  }

  private async setElementValue(element: HTMLElement, value: string): Promise<void> {
    const tag = element.tagName.toLowerCase();

    if (element instanceof HTMLSelectElement) {
      this.setSelectValue(element, value);
      return;
    }

    if (element instanceof HTMLInputElement && element.type === 'radio') {
      this.setRadioValue(element, value);
      return;
    }

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      // React-compatible value setter
      const proto = tag === 'textarea'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;

      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(element, value);
      } else {
        (element as HTMLInputElement).value = value;
      }

      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('blur', { bubbles: true }));
      return;
    }

    // Fallback for contenteditable divs and other elements
    if ((element as HTMLElement).isContentEditable) {
      element.textContent = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('blur', { bubbles: true }));
    }
  }

  private setSelectValue(selectEl: HTMLSelectElement, value: string): void {
    const lowerValue = value.toLowerCase();

    // Try exact match first
    for (const option of Array.from(selectEl.options)) {
      if (option.value.toLowerCase() === lowerValue || option.text.toLowerCase() === lowerValue) {
        selectEl.value = option.value;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
    }

    // Try partial match
    for (const option of Array.from(selectEl.options)) {
      if (option.value.toLowerCase().includes(lowerValue) || option.text.toLowerCase().includes(lowerValue)) {
        selectEl.value = option.value;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
    }

    console.log(`[CareerIQ] No matching option found for select value: "${value}"`);
  }

  private setRadioValue(radioEl: HTMLInputElement, value: string): void {
    const name = radioEl.name;
    if (!name) return;

    const radios = Array.from(document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${name}"]`));
    const lowerValue = value.toLowerCase();

    for (const radio of radios) {
      if (radio.value.toLowerCase() === lowerValue || radio.labels?.[0]?.textContent?.toLowerCase().includes(lowerValue)) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
    }

    console.log(`[CareerIQ] No matching radio option for name="${name}" value="${value}"`);
  }

  async handleResumeUpload(): Promise<void> {
    // Find the file upload input — try ATS profile selector first, then generic fallback
    const profileEntry = this.profile['resume_upload'];
    const profileResult = typeof profileEntry === 'function' ? profileEntry() : null;
    const uploadInput: HTMLInputElement | null =
      (profileResult instanceof HTMLInputElement ? profileResult : null) ??
      document.querySelector<HTMLInputElement>(
        'input[type="file"][accept*="pdf"], input[type="file"][accept*="doc"], input[type="file"][name*="resume"]',
      );

    if (!uploadInput) {
      this.fillLog.push({ field: 'resume_upload', status: 'SKIPPED' });
      return;
    }

    const sessionId = this.resume.session_id;
    if (!sessionId) {
      this.fillLog.push({ field: 'resume_upload', status: 'SKIPPED', error: 'No session_id on resume' });
      return;
    }

    // Request the background service worker to fetch the resume data and convert to a data URL
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'FETCH_RESUME_PDF',
        payload: { sessionId },
      }) as { dataUrl: string | null } | null;

      if (!response?.dataUrl) {
        this.fillLog.push({ field: 'resume_upload', status: 'SKIPPED', error: 'No PDF available' });
        return;
      }

      // Convert data URL back to a blob, then build a File for the input
      const pdfResponse = await fetch(response.dataUrl);
      const blob = await pdfResponse.blob();
      const fileName = `${this.resume.contact_info?.['name'] ?? 'resume'}_CareerIQ.pdf`;
      const file = new File([blob], fileName, { type: 'application/pdf' });

      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      uploadInput.files = dataTransfer.files;
      uploadInput.dispatchEvent(new Event('change', { bubbles: true }));

      this.fillLog.push({ field: 'resume_upload', status: 'UPLOADED' });
    } catch (e) {
      console.warn('[CareerIQ] Resume upload failed:', e);
      this.fillLog.push({
        field: 'resume_upload',
        status: 'UPLOAD_FAILED',
        error: e instanceof Error ? e.message : 'Unknown error',
      });
    }
  }

  private flattenResume(): FlattenedResume {
    return flattenResumePayload(this.resume);
  }

  private collectAllInputs(): HTMLElement[] {
    return Array.from(
      document.querySelectorAll<HTMLElement>('input, textarea, select, [contenteditable="true"]')
    ).filter(el => {
      // Exclude hidden and file inputs from label/attribute matching
      if (el instanceof HTMLInputElement) {
        if (el.type === 'hidden' || el.type === 'file') return false;
      }
      return true;
    });
  }

  private getLabelForElement(el: HTMLElement): string {
    // Explicit label association
    const id = el.getAttribute('id');
    if (id) {
      const label = document.querySelector<HTMLLabelElement>(`label[for="${id}"]`);
      if (label?.textContent) return label.textContent.trim();
    }

    // Wrapping label
    const parent = el.closest('label');
    if (parent?.textContent) {
      // Strip the input's own value from the label text
      return parent.textContent.trim();
    }

    // aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;

    // aria-labelledby
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const labelEl = document.getElementById(labelledBy);
      if (labelEl?.textContent) return labelEl.textContent.trim();
    }

    return '';
  }
}
