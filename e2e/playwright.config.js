// End-to-end tests. Run: npx playwright test -c e2e
// BASE_URL defaults to a local server on :8080 serving the repo at /tracker/.
import { defineConfig, devices } from '@playwright/test';

const phone = {
  ...devices['iPhone 13'],
  timezoneId: 'Europe/Vilnius',
  locale: 'en-GB',
};

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: '../playwright-report' }]] : 'list',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8080/tracker/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'allow',
  },
  projects: [
    { name: 'iphone-webkit', use: { ...phone, browserName: 'webkit' } },
    { name: 'iphone-chromium', use: { ...phone, browserName: 'chromium', ...(process.env.CHROME_PATH ? { launchOptions: { executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] } } : {}) } },
  ],
  webServer: process.env.BASE_URL ? undefined : {
    command: 'node e2e/serve.js',
    cwd: '..',
    url: 'http://localhost:8080/tracker/',
    reuseExistingServer: true,
  },
});
