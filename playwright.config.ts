import { defineConfig, devices } from '@playwright/test';

// Uses the installed Google Chrome (channel: 'chrome'); AudioWorklet + OfflineAudioContext
// run for real. Autoplay is allowed so tests can start audio without a gesture.
const launch = { args: ['--autoplay-policy=no-user-gesture-required'] };

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4199',
    channel: 'chrome',
    launchOptions: launch,
  },
  webServer: {
    command: 'pnpm build && pnpm preview --port 4199 --strictPort',
    url: 'http://localhost:4199',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1440, height: 900 }, launchOptions: launch } },
    { name: 'phone', use: { ...devices['Pixel 7'], channel: 'chrome', launchOptions: launch } },
  ],
});
