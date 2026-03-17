import { defineConfig, devices } from '@playwright/test';

const appHost = process.env.E2E_APP_HOST ?? '127.0.0.1';
const appPort = Number(process.env.E2E_APP_PORT ?? '5173');
const apiPort = Number(process.env.E2E_API_PORT ?? '3001');
const baseURL = `http://${appHost}:${appPort}`;

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
      name: 'auth-smoke',
      testMatch: [/auth\.spec\.ts/, /auth-errors\.spec\.ts/],
      use: devices['Desktop Chrome'],
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
      testMatch: [/workspace-responsive-audit\.spec\.ts/, /workspace-guided-flows\.spec\.ts/],
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
      command: `cd server && PORT=${apiPort} npx tsx --env-file=.env src/index.ts`,
      url: `http://${appHost}:${apiPort}/health`,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: `cd app && VITE_E2E_MOCK_AUTH=true VITE_SUPABASE_URL=http://127.0.0.1/mock-supabase VITE_SUPABASE_ANON_KEY=playwright-test-anon-key VITE_API_PROXY_TARGET=http://${appHost}:${apiPort} npm run dev -- --host ${appHost} --port ${appPort}`,
      url: baseURL,
      reuseExistingServer: true,
      timeout: 15_000,
    },
  ],
});
