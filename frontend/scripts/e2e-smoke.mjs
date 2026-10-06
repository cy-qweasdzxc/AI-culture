// 前端可视化验证脚本：走完核心旅程并对各页面截图
// 用法: node verify-frontend.mjs [baseURL] [outDir]
import { chromium } from '@playwright/test'
import fs from 'node:fs'

const base = process.argv[2] ?? 'http://localhost:5173'
const outDir = process.argv[3] ?? 'D:/aic/.workbuddy/tmp/shots'
fs.mkdirSync(outDir, { recursive: true })

const results = []
const shot = async (page, name) => {
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: false })
  results.push(name)
  console.log('shot:', name)
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGE_ERROR:', e.message))
page.on('console', (m) => {
  if (m.type() === 'error') console.log('CONSOLE_ERROR:', m.text().slice(0, 200))
})

// 1. 首页
await page.goto(base, { waitUntil: 'networkidle' })
await shot(page, '01-home')

// 2. 玩法说明 & 主题
await page.goto(`${base}/intro`)
await shot(page, '02-intro')
await page.goto(`${base}/theme`)
await shot(page, '03-theme')

// 3. 角色选择 → 开始旅程
await page.goto(`${base}/role`)
await shot(page, '04-role')
await page.getByRole('radio').first().click()
await page.getByRole('button', { name: '创建旅程，开始体验' }).click()
await page.waitForURL('**/map')
await shot(page, '05-map')

// 4. 选择平江路 → 到达
await page.getByRole('button', { name: /平江路，已发现/ }).click()
await shot(page, '06-map-selected')
await page.getByRole('button', { name: '到达此点（虚拟游览）' }).click()
await page.waitForURL('**/spot/pingjiang')
await shot(page, '07-spot')

// 5. 与周伯对话
await page.getByRole('link', { name: /与周伯对话/ }).click()
await page.waitForURL('**/chat/zhou-bo')
await shot(page, '08-chat')
await page.getByRole('button', { name: '《平江图》是什么？' }).click()
await page.waitForTimeout(1200)
await shot(page, '09-chat-evidence')

// 6. 证据抽屉
const evBtn = page.getByRole('button', { name: /证据 ·/ }).first()
if (await evBtn.count()) {
  await evBtn.click()
  await shot(page, '10-evidence-drawer')
  await page.getByRole('button', { name: '关闭' }).click()
}

// 7. 密码任务（已有线索）
await page.goto(`${base}/task/task-pingjiangtu`)
await page.locator('#password-input').fill('1229')
await page.getByRole('button', { name: '提交答案' }).click()
await shot(page, '11-task-password-done')

// 8. 问答题
await page.goto(`${base}/task/task-shuangqipan`)
await page.locator('label', { hasText: '水陆并行，河街相邻' }).click()
await page.getByRole('button', { name: '提交答案' }).click()
await shot(page, '12-task-quiz-done')

// 9. 图鉴
await page.goto(`${base}/codex`)
await shot(page, '13-codex')
const card = page.locator('button.card').first()
if (await card.count()) {
  await card.click()
  await shot(page, '14-codex-detail')
  await page.getByRole('button', { name: '关闭' }).click()
}

// 10. 背包 & 报告 & 后台
await page.goto(`${base}/clues`)
await shot(page, '15-clues')
await page.goto(`${base}/report`)
await shot(page, '16-report')
await page.goto(`${base}/admin`)
await shot(page, '17-admin')
await page.goto(`${base}/settings`)
await shot(page, '18-settings')
await page.goto(`${base}/demo`)
await shot(page, '19-demo')
await page.goto(`${base}/nonexistent`)
await shot(page, '20-404')

// 移动端视口抽查
await page.setViewportSize({ width: 375, height: 812 })
await page.goto(base)
await shot(page, '21-mobile-home')
await page.goto(`${base}/map`)
await shot(page, '22-mobile-map')
await page.goto(`${base}/chat/zhou-bo`)
await shot(page, '23-mobile-chat')

await browser.close()
console.log('DONE', results.length, 'screenshots')
