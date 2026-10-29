import { expect, test } from '@playwright/test'

for (const audience of ['child', 'student', 'adult', 'senior']) {
  test('人群 ' + audience + ' 的同源会话、SSE引用、刷新与聊天实际点击', async ({ page }) => {
    await page.goto('/demo')
    await page.getByLabel('演示人群').selectOption(audience)
    await expect(page.getByLabel('演示难度')).toHaveValue(['child', 'senior'].includes(audience) ? 'easy' : 'normal')
    await page.getByRole('button', { name: '开始苏州经典演示', exact: true }).click()
    await expect(page).toHaveURL(/\/map$/)
    await page.getByRole('button', { name: '平江路，已发现', exact: true }).click()
    await page.getByRole('button', { name: '到达此点（虚拟游览）', exact: true }).click()
    await page.goto('/chat/zhou-bo')
    const input = page.locator('#chat-input')
    for (const width of [320, 375, 390, 412, 768, 1440]) {
      await page.setViewportSize({ width, height: 667 })
      await expect(input).toBeVisible()
      await input.click()
      await input.fill('平江图有什么来源资料？')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      const box = await input.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.y).toBeGreaterThanOrEqual(0)
      expect(box!.y + box!.height).toBeLessThanOrEqual(668)
    }
    await page.getByRole('button', { name: '发送', exact: true }).click()
    await expect(input).toBeEnabled()
    const citation = page.getByRole('button', { name: /证据 ·/ }).first()
    await expect(citation).toBeVisible()
    await citation.click()
    const drawer = page.getByRole('dialog', { name: '证据来源', exact: true })
    await expect(drawer.getByText('已记录人工审核', { exact: true })).toBeVisible()
    await expect(drawer.getByRole('link', { name: '查看原始来源' })).toHaveAttribute('href', /^https?:/)
    await drawer.getByRole('button', { name: '关闭', exact: true }).click()
    await input.click()
    await page.reload()
    await expect(page.getByRole('button', { name: /证据 ·/ }).first()).toBeVisible()
    const response = await page.request.get('/api/journeys/current')
    expect((await response.json()).snapshot.audienceMode).toBe(audience)
    await expect(page.locator('html')).toHaveAttribute('data-audience', audience)
  })
}

test('实际音频播放按浏览器选择音源，关闭后解除网络资源', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeAudio = window.Audio
    window.Audio = new Proxy(NativeAudio, { construct(target, args) {
      const audio = Reflect.construct(target, args) as HTMLAudioElement
      ;(window as unknown as { probeAudio: HTMLAudioElement }).probeAudio = audio
      return audio
    } })
  })
  let requests = 0
  const active = new Set<unknown>()
  page.on('request', (request) => { if (request.url().includes('/assets/audio/')) { requests++; active.add(request) } })
  page.on('requestfinished', (request) => active.delete(request))
  page.on('requestfailed', (request) => active.delete(request))
  await page.goto('/')
  expect(requests).toBe(0)
  await page.getByRole('button', { name: '开启古琴背景音乐' }).click()
  await expect(page.getByRole('button', { name: '关闭古琴背景音乐' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window as unknown as { probeAudio: HTMLAudioElement }).probeAudio.currentTime)).toBeGreaterThan(0)
  await page.getByRole('button', { name: '关闭古琴背景音乐' }).click()
  expect(await page.evaluate(() => {
    const audio = (window as unknown as { probeAudio: HTMLAudioElement }).probeAudio
    // After load() without a source, engines can settle on EMPTY or NO_SOURCE.
    // Neither state represents an active download.
    return audio.paused && !audio.getAttribute('src')
      && [HTMLMediaElement.NETWORK_EMPTY, HTMLMediaElement.NETWORK_NO_SOURCE].includes(audio.networkState)
  })).toBe(true)
  await expect.poll(() => active.size).toBe(0)
  const stoppedCount = requests
  await page.request.get('/api/health')
  expect(requests).toBe(stoppedCount)
})

test('全域50点位可选、底图故障回退且不创建旅程', async ({ page }) => {
  await page.route('https://www.openstreetmap.org/**', (route) => route.abort())
  await page.goto('/')
  await page.locator('summary').filter({ hasText: '苏州全域景点资料' }).click()
  const entries = page.getByLabel('全域景点列表').getByRole('button')
  await expect(entries).toHaveCount(50)
  await entries.last().click()
  await page.getByRole('button', { name: '加载全域街道底图', exact: true }).click()
  const overlay = page.getByRole('region', { name: '可选街道底图' })
  await expect(overlay).toBeVisible()
  await overlay.getByRole('button', { name: '返回示意图' }).click()
  await expect(page.getByRole('group', { name: '苏州全域景点坐标示意' })).toBeVisible()
  expect((await (await page.request.get('/api/journeys/current')).json()).snapshot).toBeNull()
})
