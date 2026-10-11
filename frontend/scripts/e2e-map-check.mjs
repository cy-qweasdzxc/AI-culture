// 地图页专项复查：瓦片加载 + 点位标记可见性（桌面 & 移动）
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const base = process.argv[2] ?? 'http://127.0.0.1:5173'
const outDir = process.argv[3] ?? fileURLToPath(new URL('../../.cache/map-check/', import.meta.url))
fs.mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {},
)

for (const vp of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 375, height: 812 },
]) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    locale: 'zh-CN',
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log(`${vp.name} PAGE_ERROR:`, e.message))

  await page.goto(`${base}/role`, { waitUntil: 'networkidle' })
  await page.getByRole('radio').first().click()
  await page.getByRole('button', { name: '创建旅程，开始体验' }).click()
  await page.waitForURL('**/map')
  // 等待地图 SDK + 瓦片充分加载
  await page.waitForTimeout(4000)

  const info = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('img')].map((i) => i.src.slice(0, 60))
    const canvas = document.querySelectorAll('canvas').length
    return {
      imgCount: imgs.length,
      canvas,
      hasSchematic: !!document.querySelector('svg[aria-label="文化路线示意图"]'),
    }
  })
  console.log(vp.name, JSON.stringify(info))
  await page.screenshot({ path: `${outDir}/mapcheck-${vp.name}.png` })

  // 点击一个地图标记区域（若有点位浮层交互）
  await page.getByRole('button', { name: /平江路，已发现/ }).click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${outDir}/mapcheck-${vp.name}-selected.png` })
  await ctx.close()
}

await browser.close()
console.log('MAP CHECK DONE')
