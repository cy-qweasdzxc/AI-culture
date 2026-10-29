import { expect, test } from '@playwright/test'

test('独立演示支持四模式和老人虚拟旅程，不读取定位', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: () => { throw new Error('Virtual demo must not geolocate') } } })
  })
  await page.goto('/demo')
  await expect(page.getByRole('heading', { name: '用一段旅程，了解平江寻梦' })).toBeVisible()
  await expect(page.getByLabel('演示人群').locator('option')).toHaveCount(4)
  await page.getByLabel('演示人群').selectOption('senior')
  await expect(page.getByLabel('演示难度')).toHaveValue('easy')
  await page.getByRole('button', { name: '开始苏州经典演示', exact: true }).click()
  await expect(page).toHaveURL(/\/map$/)
  const state = (await (await page.request.get('/api/journeys/current')).json()).snapshot
  expect(state.audienceMode).toBe('senior'); expect(state.difficulty).toBe('easy'); expect(state.visitMode).toBe('virtual')
  await expect(page.locator('html')).toHaveAttribute('data-audience', 'senior')
  for (const width of [320, 375, 390, 412, 768]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  }
  await page.getByRole('button', { name: '平江路，已发现', exact: true }).click()
  await page.getByRole('button', { name: '到达此点（虚拟游览）', exact: true }).click()
  await expect(page).toHaveURL(/\/spot\/pingjiang$/)
  for (const path of ['/spot/pingjiang', '/chat/zhou-bo', '/task/task-shuangqipan', '/clues', '/codex', '/settings', '/report', '/theme']) {
    await page.goto(path)
    await expect(page.locator('main#main-content').getByRole('heading', { level: 1 })).toBeVisible()
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    }
  }
})

test('演示入口继续原旅程，取消重开不丢进度，确认后才能替换', async ({ page }) => {
  await page.goto('/demo')
  await page.getByRole('button', { name: '开始苏州经典演示', exact: true }).click()
  await expect(page).toHaveURL(/\/map$/)
  const before = (await (await page.request.get('/api/journeys/current')).json()).snapshot
  await page.goto('/demo')
  await expect(page.getByRole('link', { name: '继续已有旅程', exact: true })).toBeVisible()
  expect((await (await page.request.get('/api/journeys/current')).json()).snapshot).toEqual(before)
  await page.getByRole('button', { name: '重新开始苏州经典演示', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('其他城市或路线的进度也会被替换')
  await page.getByRole('button', { name: '保留当前旅程', exact: true }).click()
  expect((await (await page.request.get('/api/journeys/current')).json()).snapshot).toEqual(before)
  await page.getByRole('link', { name: '继续已有旅程', exact: true }).click()
  await expect(page).toHaveURL(/\/map$/)
  await page.goto('/demo')
  await page.getByLabel('演示人群').selectOption('student')
  await page.getByRole('button', { name: '重新开始苏州经典演示', exact: true }).click()
  await page.getByRole('button', { name: '确认重新开始演示', exact: true }).click()
  await expect(page).toHaveURL(/\/map$/)
  const after = (await (await page.request.get('/api/journeys/current')).json()).snapshot
  expect(after.journeyId).not.toBe(before.journeyId); expect(after.audienceMode).toBe('student')
})

test('全域街道底图按需加载且能返回示意，不使预览景点变为可玩', async ({ page }) => {
  let requests = 0
  await page.route('https://www.openstreetmap.org/**', async route => { requests++; await route.fulfill({ contentType: 'text/html', body: '<p>Isolated map fixture</p>' }) })
  await page.goto('/')
  await page.locator('summary').filter({ hasText: '苏州全域景点资料' }).click()
  await expect(page.getByLabel('全域景点列表').getByRole('button')).toHaveCount(50)
  expect(requests).toBe(0)
  await page.getByRole('button', { name: '加载全域街道底图', exact: true }).click()
  await expect(page.getByTitle('OpenStreetMap 街道底图')).toBeVisible()
  await expect.poll(() => requests).toBe(1)
  await page.getByRole('button', { name: '返回示意图', exact: true }).click()
  await expect(page.getByTitle('OpenStreetMap 街道底图')).toHaveCount(0)
  expect((await (await page.request.get('/api/journeys/current')).json()).snapshot).toBeNull()
})
