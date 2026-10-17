import { defineConfig } from '@playwright/test'
import base from './playwright.config'

if (process.env.E2E_ALLOW_PAID_CALLS !== '1' || !process.env.E2E_BASE_URL) {
  throw new Error('真实 AI 验收须设置 E2E_ALLOW_PAID_CALLS=1 和独立验收栈 E2E_BASE_URL。')
}

export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: '**/real-ai.spec.ts',
  webServer: undefined,
})
