import type { ATSPlatform } from './types.js';

type ExtensionEnv = Record<string, string | boolean | undefined>;

export interface ExtensionRuntimeConfig {
  API_BASE_URL: string;
  APP_BASE_URL: string;
}

const DEFAULT_DEV_API_BASE_URL = 'http://localhost:3001';
const DEFAULT_DEV_APP_BASE_URL = 'http://localhost:5173';
const DEFAULT_PROD_BASE_URL = 'https://resume-agent-production-fc86.up.railway.app';

function readEnv(): ExtensionEnv {
  return ((import.meta as unknown as { env?: ExtensionEnv }).env ?? {});
}

export function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export function resolveExtensionConfig(env: ExtensionEnv = readEnv()): ExtensionRuntimeConfig {
  const isProd = env.PROD === true || env.PROD === 'true';
  const defaultApiBaseUrl = isProd ? DEFAULT_PROD_BASE_URL : DEFAULT_DEV_API_BASE_URL;
  const defaultAppBaseUrl = isProd ? DEFAULT_PROD_BASE_URL : DEFAULT_DEV_APP_BASE_URL;
  const apiBaseUrl = typeof env.VITE_CAREERIQ_API_BASE_URL === 'string' && env.VITE_CAREERIQ_API_BASE_URL.trim()
    ? env.VITE_CAREERIQ_API_BASE_URL
    : defaultApiBaseUrl;
  const appBaseUrl = typeof env.VITE_CAREERIQ_APP_BASE_URL === 'string' && env.VITE_CAREERIQ_APP_BASE_URL.trim()
    ? env.VITE_CAREERIQ_APP_BASE_URL
    : defaultAppBaseUrl;

  return {
    API_BASE_URL: normalizeBaseUrl(apiBaseUrl),
    APP_BASE_URL: normalizeBaseUrl(appBaseUrl),
  };
}

const runtimeConfig = resolveExtensionConfig();

export const CONFIG = {
  ...runtimeConfig,

  ENDPOINTS: {
    RESUME_LOOKUP: '/api/extension/resume-lookup',
    READY_RESUME: '/api/extension/ready-resume',
    JOB_DISCOVER: '/api/extension/job-discover',
    APPLY_STATUS: '/api/extension/apply-status',
    AUTH_VERIFY: '/api/extension/auth-verify',
    INFER_FIELD: '/api/extension/infer-field',
  },

  STORAGE: {
    AUTH_TOKEN: 'careeriq_auth_token',
    USER_ID: 'careeriq_user_id',
    USER_EMAIL: 'careeriq_user_email',
    CACHED_RESUME: 'careeriq_cached_resume',
  },

  CACHE_TTL_MS: 5 * 60 * 1000, // 5 minutes
} as const;

export interface ATSPlatformDef {
  name: string;
  urlPatterns: RegExp[];
  formSelector: string;
}

export const ATS_PLATFORMS: Record<ATSPlatform, ATSPlatformDef> = {
  GREENHOUSE: {
    name: 'Greenhouse',
    urlPatterns: [/greenhouse\.io\/applications/i, /boards\.greenhouse\.io/i],
    formSelector: 'form#application_form, form.s-apply-form',
  },
  LEVER: {
    name: 'Lever',
    urlPatterns: [/jobs\.lever\.co\/.*\/apply/i],
    formSelector: 'form.application-form, .posting-apply',
  },
  LINKEDIN: {
    name: 'LinkedIn Easy Apply',
    urlPatterns: [/linkedin\.com\/jobs/i],
    formSelector: '.jobs-easy-apply-modal, .jobs-apply-form',
  },
  INDEED: {
    name: 'Indeed',
    urlPatterns: [/indeed\.com\/viewjob/i, /smartapply\.indeed\.com/i],
    formSelector: '#apply-form-container, .ia-BasePage',
  },
  WORKDAY: {
    name: 'Workday',
    urlPatterns: [/myworkdayjobs\.com/i, /wd\d+\.myworkday\.com/i],
    formSelector: '[data-automation-id="richTextEditor"], .gwt-app',
  },
  ICIMS: {
    name: 'iCIMS',
    urlPatterns: [/icims\.com/i],
    formSelector: '#iCIMS_MainColumn, .iCIMS_Toolbar',
  },
  UNKNOWN: {
    name: 'Unknown',
    urlPatterns: [],
    formSelector: '',
  },
};

export const FIELD_LABEL_MAP: Record<string, string[]> = {
  first_name: ['first name', 'given name', 'fname', 'first'],
  last_name: ['last name', 'surname', 'family name', 'lname', 'last'],
  full_name: ['full name', 'name', 'your name', 'applicant name'],
  email: ['email', 'email address', 'e-mail'],
  phone: ['phone', 'phone number', 'mobile', 'cell', 'telephone'],
  address: ['address', 'street address', 'mailing address'],
  city: ['city', 'city/town'],
  state: ['state', 'province', 'region'],
  zip: ['zip', 'zip code', 'postal code'],
  linkedin_url: ['linkedin', 'linkedin profile', 'linkedin url'],
  portfolio_url: ['portfolio', 'website', 'personal website', 'github'],
  current_title: ['current title', 'current job title', 'job title'],
  current_company: ['current company', 'current employer', 'employer'],
  years_experience: ['years of experience', 'years experience', 'experience'],
  salary_expectation: ['salary', 'desired salary', 'expected salary', 'compensation'],
  cover_letter: ['cover letter', 'message', 'additional information', 'why do you want'],
  start_date: ['start date', 'available start date', 'earliest start'],
  work_auth: ['work authorization', 'authorized to work', 'visa status', 'sponsorship'],
  veteran_status: ['veteran', 'military', 'veteran status'],
  disability: ['disability', 'disability status'],
};
