import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/tests',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: '.auth/user.json' },
      dependencies: ['setup'],
      testIgnore: [/auth\.spec\.ts/, /full-pipeline\.spec\.ts/, /quality-validation\.spec\.ts/],
    },
    { name: 'auth-smoke', testMatch: /auth\.spec\.ts/, use: devices['Desktop Chrome'] },
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
  ],
  webServer: [
    {
      command: 'cd server && npm run dev',
      url: 'http://localhost:3001/health',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'cd app && npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 15_000,
    },
  ],
});
