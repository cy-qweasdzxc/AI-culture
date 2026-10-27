import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const routes = [
  ['/', '把一座城'],
  ['/intro', '玩法说明'],
  ['/theme', '平江寻梦'],
  ['/role', '选择你的身份'],
  ['/map', '平江寻梦 · 路线'],
  ['/spot/pingjiang', '平江路'],
  ['/chat/zhou-bo', '与周伯对话'],
  ['/task/task-shuangqipan', '双棋盘之谜'],
  ['/clues', '线索背包'],
  ['/codex', '文化图鉴'],
  ['/settings', '设置与隐私'],
  ['/report', '体验报告'],
] as const

async function sendQuestion(page: Page) {
  const input = page.locator('#chat-input')
  const send = page.getByRole('button', { name: '发送', exact: true })
  await expect(input).toBeEnabled()
  await expect(send).toBeEnabled()
  // The error banner changes the mobile layout. A retained WebKit trace shows
  // smooth auto-scroll placing the retry click under the fixed navigation.
  await send.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
  await send.click()
}

test('五种窄屏宽度中公开页面、旅程页面和长标题没有横向溢出', async ({ page }) => {
  expect((await page.request.post('/api/session')).ok()).toBeTruthy()
  const started = await page.request.post('/api/journeys/start', {
    data: { role_id: 'scholar', mode: 'virtual' },
  })
  expect(started.ok(), await started.text()).toBeTruthy()
  const snapshot = (await started.json()).snapshot
  const arrived = await page.request.post('/api/location/trigger', {
    data: {
      journey_id: snapshot.journeyId,
      state_version: snapshot.stateVersion,
      request_id: crypto.randomUUID(),
      spot_id: 'pingjiang',
    },
  })
  expect(arrived.ok(), await arrived.text()).toBeTruthy()
  for (const width of [320, 375, 390, 412, 768]) {
    await page.setViewportSize({ width, height: 812 })
    for (const [route, heading] of routes) {
      await page.goto(route)
      await expect(page.locator('main h1').first(), `${width}px ${route} rendered`).toContainText(heading)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
        `${width}px ${route} horizontal overflow`,
      ).toBe(true)
    }
  }
  const recovered = await page.evaluate(async () => {
    const response = await fetch('/api/journeys/current', { credentials: 'include' })
    return { status: response.status, snapshot: (await response.json()).snapshot }
  })
  expect(recovered.status).toBe(200)
  expect(recovered.snapshot.journeyId).toBe(snapshot.journeyId)

  const password = process.env.E2E_ADMIN_PASSWORD
  if (password) {
    const login = await page.request.post('/api/admin/login', {
      data: { username: process.env.E2E_ADMIN_USERNAME ?? 'admin', password },
    })
    expect(login.ok()).toBeTruthy()
    for (const width of [320, 375, 390, 412, 768]) {
      await page.setViewportSize({ width, height: 812 })
      await page.goto('/admin')
      await page.getByRole('tab', { name: '文化资料', exact: true }).click()
      await page.locator('article h4').first().evaluate((heading) => {
        heading.textContent = '合成长标题 ' + 'W'.repeat(150)
      })
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
        `${width}px long admin title horizontal overflow`,
      ).toBe(true)
    }
  }
})

test('局域网 HTTP 实地定位提示 HTTPS，虚拟游览仍可到达', async ({ page }) => {
  expect((await page.request.post('/api/session')).ok()).toBeTruthy()
  const started = await page.request.post('/api/journeys/start', {
    data: { role_id: 'scholar', mode: 'virtual' },
  })
  expect(started.ok()).toBeTruthy()
  await page.goto('/map')
  await expect(page.getByRole('heading', { name: '平江寻梦 · 路线' })).toBeVisible()
  await page.getByRole('button', { name: '实地探索', exact: true }).click()
  await expect(page.getByRole('button', { name: '实地探索', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const secure = await page.evaluate(() => window.isSecureContext)
  if (!secure) {
    await page.getByRole('button', { name: '使用我的位置到达' }).click()
    await expect(page.getByText(/实地定位需要 HTTPS 安全连接/)).toBeVisible()
  }
  await page.getByRole('button', { name: '虚拟游览', exact: true }).click()
  await expect(page.getByRole('button', { name: '虚拟游览', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '到达此点（虚拟游览）' }).click()
  await expect(page).toHaveURL(/\/spot\/pingjiang$/)
})

test('离线重试只保存一次 NPC 提问，刷新后仍可恢复', async ({ page, context }) => {
  expect((await page.request.post('/api/session')).ok()).toBeTruthy()
  const started = await page.request.post('/api/journeys/start', {
    data: { role_id: 'scholar', mode: 'virtual' },
  })
  expect(started.ok()).toBeTruthy()
  const initial = (await started.json()).snapshot
  const arrived = await page.request.post('/api/location/trigger', { data: {
    journey_id: initial.journeyId,
    state_version: initial.stateVersion,
    request_id: crypto.randomUUID(),
    spot_id: 'pingjiang',
  } })
  expect(arrived.ok()).toBeTruthy()
  await page.goto('/chat/zhou-bo')
  await expect(page.getByRole('heading', { name: '与周伯对话' })).toBeVisible()
  await page.getByRole('button', { name: '单人对话', exact: true }).click()
  const question = `离线恢复合成提问 ${crypto.randomUUID()}`
  const input = page.locator('#chat-input')
  await input.fill(question)
  await context.setOffline(true)
  await sendQuestion(page)
  await expect(page.getByRole('alert').last()).toContainText(/无法连接|网络|请求失败/)
  await expect(input).toHaveValue(question)
  await context.setOffline(false)
  await sendQuestion(page)
  await expect.poll(async () => {
    const current = await page.request.get('/api/journeys/current')
    const snapshot = (await current.json()).snapshot
    return (snapshot.messages['zhou-bo'] ?? []).filter((item: { from: string; text: string }) =>
      item.from === 'user' && item.text === question).length
  }).toBe(1)
  await page.reload()
  await expect(page.getByRole('heading', { name: '与周伯对话' })).toBeVisible()
  const current = (await (await page.request.get('/api/journeys/current')).json()).snapshot
  expect(current.journeyId).toBe(initial.journeyId)
  expect(current.messages['zhou-bo'].filter((item: { from: string; text: string }) =>
    item.from === 'user' && item.text === question)).toHaveLength(1)
})

test('SSE 在 done 前中断后重试沿用请求 ID，服务端只保存一次', async ({ page }) => {
  expect((await page.request.post('/api/session')).ok()).toBeTruthy()
  const started = await page.request.post('/api/journeys/start', {
    data: { role_id: 'scholar', mode: 'virtual' },
  })
  expect(started.ok()).toBeTruthy()
  const initial = (await started.json()).snapshot
  const arrived = await page.request.post('/api/location/trigger', { data: {
    journey_id: initial.journeyId,
    state_version: initial.stateVersion,
    request_id: crypto.randomUUID(),
    spot_id: 'pingjiang',
  } })
  expect(arrived.ok()).toBeTruthy()
  const before = (await arrived.json()).snapshot
  await page.goto('/chat/zhou-bo')
  await expect(page.getByRole('heading', { name: '与周伯对话' })).toBeVisible()
  const question = `中断恢复合成提问 ${crypto.randomUUID()}`
  let firstRequestId = ''
  const routePattern = '**/api/chat/scene/stream'
  await page.route(routePattern, async (route) => {
    firstRequestId = route.request().postDataJSON().request_id
    await route.fulfill({ status: 200, contentType: 'text/event-stream',
      body: 'event: status\ndata: {"phase":"speaking"}\n\n' })
  })
  await page.locator('#chat-input').fill(question)
  await sendQuestion(page)
  await expect(page.getByRole('alert').last()).toContainText(/中断|同步|重试/)
  expect(firstRequestId).toBeTruthy()
  const unchanged = (await (await page.request.get('/api/journeys/current')).json()).snapshot
  expect(unchanged.stateVersion).toBe(before.stateVersion)
  await page.unroute(routePattern)
  const retried = page.waitForRequest((request) =>
    request.url().endsWith('/api/chat/scene/stream') && request.method() === 'POST')
  await sendQuestion(page)
  const second = await retried
  expect(second.postDataJSON().request_id).toBe(firstRequestId)
  await expect.poll(async () => {
    const current = (await (await page.request.get('/api/journeys/current')).json()).snapshot
    return (current.messages['zhou-bo'] ?? []).filter((item: { from: string; text: string }) =>
      item.from === 'user' && item.text === question).length
  }).toBe(1)
  const current = (await (await page.request.get('/api/journeys/current')).json()).snapshot
  expect(current.stateVersion).toBe(before.stateVersion + 1)
})
