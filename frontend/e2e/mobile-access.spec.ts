import { expect, test } from '@playwright/test'

test('同源代理会话与四种窄屏聊天、抽屉和输入区域', async ({ page }) => {
  expect((await page.request.post('/api/session')).ok()).toBeTruthy()
  try {
    const start = await page.request.post('/api/journeys/start', { data: { role_id: 'scholar', mode: 'virtual' } })
    expect(start.ok()).toBeTruthy()
    const snapshot = (await start.json()).snapshot
    const arrived = await page.request.post('/api/location/trigger', { data: {
      journey_id: snapshot.journeyId, state_version: snapshot.stateVersion,
      request_id: crypto.randomUUID(), spot_id: 'pingjiang',
    } })
    expect(arrived.ok()).toBeTruthy()
    for (const width of [375, 390, 412, 768]) {
      await page.setViewportSize({ width, height: 812 })
      await page.goto('/chat/zhou-bo')
      const input = page.locator('#chat-input')
      await expect(input).toBeVisible()
      await input.focus()
      await input.scrollIntoViewIfNeeded()
      const bounds = await input.boundingBox()
      expect(bounds).not.toBeNull()
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(813)
      if (width < 768) {
        const nav = await page.locator('.journey-bottom-nav').boundingBox()
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(nav!.y + 1)
        await page.setViewportSize({width,height:540})
        await input.focus()
        await input.scrollIntoViewIfNeeded()
        const smaller = await input.boundingBox()
        const smallNav = await page.locator('.journey-bottom-nav').boundingBox()
        expect(smaller!.y + smaller!.height).toBeLessThanOrEqual(smallNav!.y + 1)
        const center = {x:smaller!.x + smaller!.width/2, y:smaller!.y + smaller!.height/2}
        expect(await page.evaluate(({x,y}) => document.elementFromPoint(x,y)?.id === 'chat-input', center)).toBe(true)
        await page.setViewportSize({width,height:812})
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
      await page.reload()
      await expect(input).toBeVisible()
    }
    const restored = (await (await page.request.get('/api/journeys/current')).json()).snapshot
    expect(restored.journeyId).toBe(snapshot.journeyId)
  } finally {
    expect((await page.request.delete('/api/session')).ok()).toBeTruthy()
  }
})
