import { defineConfig, devices } from '@playwright/test';

// Dedicated port so a `pnpm dev` on 3000 is never picked up instead of the production build.
const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'html',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Always a production build: `next dev` compiles routes on demand, which made e2e flaky.
  webServer: {
    command: `pnpm build && pnpm start -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 240_000,
    // `next start` runs with NODE_ENV=production, where Auth.js rejects localhost as an untrusted host.
    // Every test signs up from the same localhost IP: the auth rate limits would block it by test #6.
    env: { AUTH_TRUST_HOST: 'true', DISABLE_RATE_LIMIT: 'true' },
  },
});
