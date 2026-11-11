import { defineConfig, devices } from '@playwright/test';

// Uses the installed Google Chrome (channel: 'chrome'); AudioWorklet + OfflineAudioContext
// run for real. Autoplay is allowed so tests can start audio without a gesture.
const launch = { args: ['--autoplay-policy=no-user-gesture-required'] };
// (E2E_PORT: another port for a second checkout's run at the same time; the server on a port is reused,
// so two worktrees on one port would test one build)
const port = process.env.E2E_PORT ?? '4199';

/** the one file Playwright's WebKit runs */
const WEBKIT = /webkit\.spec\.ts$/;

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  // (each project names its own browser: Chrome's channel and flags are not WebKit's)
  use: {
    baseURL: `http://localhost:${port}`,
  },
  webServer: {
    command: `pnpm build && pnpm preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop', testIgnore: WEBKIT, use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1440, height: 900 }, launchOptions: launch } },
    { name: 'phone', testIgnore: WEBKIT, use: { ...devices['Pixel 7'], channel: 'chrome', launchOptions: launch } },
    // Safari's engine, a smoke test (e2e/webkit.spec.ts alone): a Mac's window and an iPhone
    // (`npx playwright install webkit` once)
    { name: 'webkit', testMatch: WEBKIT, use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } } },
    { name: 'webkit-phone', testMatch: WEBKIT, use: { ...devices['iPhone 14'] } },
  ],
});
