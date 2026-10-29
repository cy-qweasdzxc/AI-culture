import { expect, test } from '@playwright/test'

test('全域资料筛选与地图选择保留待审核标记，且不创建旅程', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  const open = page.locator('summary').filter({ hasText: '苏州全域景点资料' })
  await expect(open).toBeVisible(); await open.click()
  const entries = page.getByLabel('全域景点列表').getByRole('button')
  await expect(entries).toHaveCount(50)
  await expect(page.getByLabel('全域景点详情')).toContainText('来源候选')
  await page.getByLabel('搜索全域景点').fill('同里')
  // 同里古镇 and 退思园 both match: search includes addresses as well as names.
  await expect(entries).toHaveCount(2)
  await page.getByLabel('全域景点列表').getByRole('button', { name: /^同里古镇/ }).click()
  await expect(page.getByLabel('全域景点详情').getByRole('heading', { name: '同里古镇' })).toBeVisible()
  await page.getByLabel('搜索全域景点').fill('不存在的合成景点')
  await expect(page.getByText('没有匹配的景点，请调整筛选。')).toBeVisible()
  await page.getByLabel('搜索全域景点').fill('')
  await expect(entries).toHaveCount(50)
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 850 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  }
  const state = await (await page.request.get('/api/journeys/current')).json()
  expect(state.snapshot).toBeNull()
  expect(errors).toEqual([])
})

test('古琴音乐默认不下载，播放被拒绝时仍可继续浏览', async ({ page }) => {
  let audioRequests = 0
  await page.route('**/assets/audio/*.ogg', async (route) => { audioRequests++; await route.abort() })
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.canPlayType = () => 'probably'
    HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('synthetic denied', 'NotAllowedError'))
  })
  await page.goto('/')
  const button = page.getByRole('button', { name: '开启古琴背景音乐' })
  await expect(button).toBeVisible(); expect(audioRequests).toBe(0)
  await button.click(); await expect(page.getByText(/音乐未能播放/)).toBeVisible()
  await page.locator('summary').filter({ hasText: '音乐来源与许可' }).click()
  await expect(page.getByRole('link', { name: '音乐原始来源' })).toHaveAttribute('href', /commons.wikimedia.org/)
  await expect(page.getByRole('link', { name: 'CC BY-SA 3.0' })).toBeVisible()
  await page.getByRole('link', { name: '开始体验', exact: true }).first().click()
  await expect(page).toHaveURL(/role/)
})
