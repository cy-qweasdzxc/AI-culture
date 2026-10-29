import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './e2e', testMatch: 'release-compatibility.spec.ts',
  fullyParallel: false, workers: 1, timeout: 90000,
  reporter: [['list'], ['json', { outputFile: 'test-results/compatibility.json' }]],
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:18110', locale: 'zh-CN', trace: 'retain-on-failure' },
  projects: [
    { name: 'Android-Chromium', use: { ...devices['Pixel 7'] } },
    { name: 'iPhone-WebKit', use: { ...devices['iPhone 13'] } },
  ],
})
