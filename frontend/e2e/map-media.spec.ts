import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { JourneySnapshot } from '../src/types'

const seed = JSON.parse(readFileSync(new URL('../../data/demo/seed.json', import.meta.url), 'utf8')) as {
  spots: { id: string; name: string }[]
  tasks: { id: string; spotId: string; answerKey?: string; password?: string; sortingAnswer?: number[] }[]
}
const media = JSON.parse(readFileSync(new URL('../../data/demo/media.json', import.meta.url), 'utf8')) as {
  location_id: string; title: string; url: string; source_url: string; license_url: string
}[]
async function begin(page: Page) {
  expect((await page.request.post('/api/session')).ok()).toBeTruthy()
  const response = await page.request.post('/api/journeys/start', { data: { role_id: 'scholar', mode: 'virtual' } })
  expect(response.ok(), await response.text()).toBeTruthy()
  return (await response.json()).snapshot as JourneySnapshot
}
async function act(page: Page, state: JourneySnapshot, path: string, extra: Record<string, unknown>) {
  const response = await page.request.post('/api' + path, { data: {
    journey_id: state.journeyId, state_version: state.stateVersion, request_id: crypto.randomUUID(), ...extra,
  } })
  expect(response.ok(), await response.text()).toBeTruthy()
  return (await response.json()).snapshot as JourneySnapshot
}

async function openPhotoCredits(page: Page) {
  const summary = page.getByText('照片来源与许可', { exact: true })
  // A retained WebKit trace shows smooth auto-scroll continuing at pointer-down:
  // the click can land below this summary or behind the fixed bottom navigation.
  // Finish the scroll before a real pointer click; keep all license assertions.
  await summary.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
  await summary.click()
  await expect(summary.locator('..')).toHaveAttribute('open', '')
}

test('五站图片、许可、示意标记和六种宽度与实际数据一致', async ({ page }, info) => {
  test.setTimeout(120000)
  let state = await begin(page)
  const planned = await page.request.post('/api/navigation/walking', { data: { journey_id: state.journeyId } })
  expect(planned.ok()).toBeTruthy()
  expect((await planned.json()).stop_ids).toEqual(['pingjiang'])
  const locked = await page.request.post('/api/navigation/walking', { data: { journey_id: state.journeyId, stop_ids: ['pingjiang', 'ouyuan'] } })
  expect(locked.status()).toBe(409)
  for (const spot of seed.spots) {
    state = await act(page, state, '/location/trigger', { spot_id: spot.id })
    if (spot.id === 'pingjiang') state = await act(page, state, '/chat/message', { npc_id: 'zhou-bo', message: '《平江图》是什么？' })
    if (spot.id === 'ouyuan') state = await act(page, state, '/chat/message', { npc_id: 'a-heng', message: '耦园为什么改名？' })
    if (spot.id === 'subo') state = await act(page, state, '/chat/message', { npc_id: 'xiao-shen', message: '片石假山妙在哪里？' })
    for (const task of seed.tasks.filter(task => task.spotId === spot.id)) {
      state = await act(page, state, `/tasks/${task.id}/verify`, { answer: task.answerKey ?? task.password ?? task.sortingAnswer })
      expect(state.taskStates[task.id].status).toBe('completed')
    }
  }
  await page.goto('/map')
  await expect(page.getByRole('heading', { name: '平江寻梦 · 路线', exact: true })).toBeVisible()
  const map = page.getByRole('group', { name: '文化路线示意图', exact: true })
  await expect(map).toBeVisible()
  await expect(page.getByText(/当前连线为示意路线/)).toBeVisible()
  for (const width of [320, 375, 390, 412, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const spot of seed.spots) {
      const marker = map.getByRole('button', { name: `${spot.name}：${({ completed: '已完成', current: '当前点位', discovered: '已发现', undiscovered: '未发现' })[state.spotStatus[spot.id]]}`, exact: true })
      await expect(marker).toBeVisible()
      const bounds = await marker.boundingBox()
      expect(bounds!.width).toBeGreaterThanOrEqual(44)
      expect(bounds!.height).toBeGreaterThanOrEqual(44)
      await marker.click()
      await expect(page.locator('section[aria-label="路线地图与点位详情"] h2')).toHaveText(spot.name)
      expect(await marker.locator('span').nth(1).evaluate(node => Number.parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(12)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    if (width === 375 || width === 1440) await page.screenshot({ path: info.outputPath(`map-${width}.png`), fullPage: true })
  }
  for (const spot of seed.spots) {
    await map.getByRole('button', { name: `${spot.name}：${({ completed: '已完成', current: '当前点位', discovered: '已发现', undiscovered: '未发现' })[state.spotStatus[spot.id]]}`, exact: true }).click()
    await page.getByRole('button', { name: '进入点位剧情', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/spot/${spot.id}$`))
    await page.goto('/map')
    await expect(map).toBeVisible()
  }
  for (const width of [320, 375, 390, 412, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const asset of media) {
      await page.goto(`/spot/${asset.location_id}`)
      const image = page.getByAltText(asset.title, { exact: true })
      await expect(image).toBeVisible()
      await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBe(1280)
      await expect(image).toHaveAttribute('src', asset.url)
      expect(await image.evaluate(node => getComputedStyle(node).objectFit)).toBe('contain')
      await openPhotoCredits(page)
      await expect(page.getByRole('link', { name: '原始文件页面', exact: true })).toHaveAttribute('href', asset.source_url)
      await expect(page.getByRole('link', { name: /^CC BY-SA/ })).toHaveAttribute('href', asset.license_url)
      await expect(page.getByText('图片许可核对不代表文化史实已完成人工审核。')).toBeVisible()
      await expect(page.getByText('地点简介 · 演示资料，未经人工事实核验')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      if (asset.location_id === 'pingjiang' && (width === 375 || width === 1440))
        await page.screenshot({ path: info.outputPath(`photo-${width}.png`), fullPage: true })
    }
  }
})

test('照片 404、示意图网络失败后保留来源并可手动恢复', async ({ page }, info) => {
  let state = await begin(page)
  state = await act(page, state, '/location/trigger', { spot_id: 'pingjiang' })
  expect(state.currentSpotId).toBe('pingjiang')
  await page.route('**/assets/places/pingjiang.jpg', route => route.fulfill({ status: 404, body: 'not found' }))
  await page.goto('/spot/pingjiang')
  const illustration = page.getByAltText('平江路艺术化示意', { exact: true })
  await expect(illustration).toBeVisible()
  await expect.poll(() => illustration.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  await page.route('**/assets/scenes/pingjiang.webp', route => route.abort())
  await page.reload()
  await expect(page.getByText('图片暂不可用', { exact: true })).toBeVisible()
  await expect(page.locator('figure img')).toHaveCount(0)
  await openPhotoCredits(page)
  await expect(page.getByRole('link', { name: '原始文件页面', exact: true })).toHaveAttribute('href', media[0].source_url)
  await expect(page.getByRole('link', { name: '与周伯对话', exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('double-image-failure.png'), fullPage: true })
  await page.unroute('**/assets/places/pingjiang.jpg')
  await page.unroute('**/assets/scenes/pingjiang.webp')
  await page.getByRole('button', { name: '重新加载图片', exact: true }).click()
  const real = page.getByAltText(media[0].title, { exact: true })
  await expect.poll(() => real.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBe(1280)
})

test('首页与主题插画失败显示占位，城市与路线入口仍可操作', async ({ page }) => {
  await page.route('**/assets/scenes/*.webp', route => route.abort())
  await page.goto('/')
  const entry = page.getByRole('link', { name: '了解平江寻梦文化路线', exact: true })
  await expect(entry.getByText('图片暂不可用', { exact: true })).toBeVisible()
  await entry.click()
  await expect(page).toHaveURL(/\/theme$/)
  await expect(page.getByRole('heading', { level: 1, name: '平江寻梦' })).toBeVisible()
  await expect(page.getByRole('link', { name: '选择角色，走这条路', exact: true })).toBeVisible()
  await expect(page.getByRole('group', { name: '城市选择' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
})
