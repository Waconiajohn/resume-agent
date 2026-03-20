import { defineConfig, devices } from '@playwright/test';

const appHost = process.env.E2E_APP_HOST ?? '127.0.0.1';
const appPort = Number(process.env.E2E_APP_PORT ?? '4175');
const apiPort = Number(process.env.E2E_API_PORT ?? '3101');
const baseURL = `http://${appHost}:${appPort}`;
const e2eMockUserId = process.env.E2E_MOCK_AUTH_USER_ID ?? '5b756a7a-3e35-4465-bcf4-69d92f160f21';
const e2eMockAuthToken = process.env.E2E_MOCK_AUTH_TOKEN ?? 'mock-e2e-access-token';
const e2eMockAuthEmail = process.env.E2E_MOCK_AUTH_EMAIL ?? 'e2e@example.com';

export default defineConfig({
  testDir: './e2e/tests',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: '.auth/user.json' },
      dependencies: ['setup'],
      testIgnore: [/auth\.spec\.ts/, /auth-errors\.spec\.ts/, /full-pipeline\.spec\.ts/, /quality-validation\.spec\.ts/],
    },
    {
      name: 'full-pipeline',
      testMatch: /full-pipeline\.spec\.ts/,
      timeout: 15 * 60 * 1000, // 15 min (was 60 min for Z.AI; Groq completes in ~2-3 min)
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
        headless: !!process.env.CI,
        video: 'on',
        trace: 'on',
        viewport: { width: 1440, height: 900 },
        launchOptions: { slowMo: process.env.CI ? 0 : 150 },
      },
      dependencies: ['setup'],
    },
    {
      name: 'quality-validation',
      testMatch: /quality-validation\.spec\.ts/,
      timeout: 45 * 60 * 1000, // 45 min total (3 pipelines × ~5 min max each + overhead)
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
        headless: !!process.env.CI,
        video: 'on',
        trace: 'on',
        viewport: { width: 1440, height: 900 },
        launchOptions: { slowMo: process.env.CI ? 0 : 150 },
      },
      dependencies: ['setup'],
    },
    {
      name: 'mock-desktop',
      testMatch: [
        /workspace-responsive-audit\.spec\.ts/,
        /workspace-guided-flows\.spec\.ts/,
        /workspace-core-actions\.spec\.ts/,
        /chat-drawer\.spec\.ts/,
      ],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 960 },
      },
    },
    {
      name: 'mock-mobile',
      testMatch: /workspace-responsive-audit\.spec\.ts/,
      use: {
        ...devices['iPhone 13'],
      },
    },
  ],
  webServer: [
    {
      command: `cd server && npm run build && HOST=${appHost} PORT=${apiPort} E2E_MOCK_AUTH=true E2E_MOCK_AUTH_USER_ID=${e2eMockUserId} E2E_MOCK_AUTH_TOKEN=${e2eMockAuthToken} E2E_MOCK_AUTH_EMAIL=${e2eMockAuthEmail} node --env-file=.env dist/index.js`,
      url: `http://${appHost}:${apiPort}/health`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: `cd app && VITE_E2E_MOCK_AUTH=true VITE_E2E_MOCK_USER_ID=${e2eMockUserId} VITE_E2E_MOCK_ACCESS_TOKEN=${e2eMockAuthToken} VITE_E2E_MOCK_EMAIL=${e2eMockAuthEmail} VITE_SUPABASE_URL=http://127.0.0.1/mock-supabase VITE_SUPABASE_ANON_KEY=playwright-test-anon-key VITE_API_PROXY_TARGET=http://${appHost}:${apiPort} npm run dev -- --host ${appHost} --port ${appPort}`,
      url: baseURL,
      reuseExistingServer: true,
      timeout: 15_000,
    },
  ],
});
