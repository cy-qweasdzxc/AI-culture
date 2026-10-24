import { expect, test } from '@playwright/test'

test('首页图片优先级兼容当前React版本且控制台无未知属性警告', async ({ page }) => {
  const warnings: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') warnings.push(message.text())
  })
  await page.goto('/')
  await expect(page.locator('.home-hero-scene img')).toBeVisible()
  expect(warnings.filter((text) => /fetchPriority|does not recognize|Unknown prop/i.test(text))).toEqual([])
})

test('实景图片网络失败后显示已标注的插画且仍可继续旅程', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.home-hero-scene img')).toBeVisible()
  const start = await page.request.post('/api/journeys/start', { data: { role_id: 'scholar', mode: 'virtual' } })
  expect(start.ok()).toBeTruthy()
  const state = (await start.json()).snapshot
  expect((await page.request.post('/api/location/trigger', { data: {
    journey_id: state.journeyId, state_version: state.stateVersion,
    request_id: 'image-fallback-fixture', spot_id: 'pingjiang',
  } })).ok()).toBeTruthy()
  await page.route('**/assets/places/pingjiang.jpg', (route) => route.abort('failed'))
  await page.goto('/spot/pingjiang')
  const fallback = page.getByAltText('平江路艺术化示意')
  await expect(fallback).toBeVisible()
  await expect.poll(() => fallback.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  await expect(page.getByRole('link', { name: /与周伯对话/ })).toBeVisible()
})
