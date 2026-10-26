import { defineConfig, devices } from '@playwright/test'
import base from './playwright.config'

export default defineConfig({ ...base,
  testMatch: ['**/journey.spec.ts', '**/scene.spec.ts', '**/mobile-access.spec.ts', '**/mobile-layout.spec.ts', '**/map-media.spec.ts', '**/exploration.spec.ts'],
  projects: [
    {
      name: 'android-chromium',
      use: {
        ...devices['Pixel 7'],
        locale: 'zh-CN',
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
          : {},
      },
    },
    {
      name: 'iphone-webkit',
      use: { ...devices['iPhone 13'], locale: 'zh-CN', launchOptions: {} },
    },
  ],
})
