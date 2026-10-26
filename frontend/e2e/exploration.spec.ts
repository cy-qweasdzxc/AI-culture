import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { JourneySnapshot } from '../src/types'

interface Definition {
  id: string; spotId: string; title: string; mechanism: 'ordering' | 'matching' | 'evidence'; hintQuestion?: string; npcId?: string
  variants: Record<string, { items?: {id:string;label:string}[]; statements?: {id:string;label:string}[]; answer: string[] | Record<string,string>; supports?: Record<string,string> }>
}
const catalog = JSON.parse(readFileSync(new URL('../../data/demo/activities.json', import.meta.url), 'utf8')) as { activities: Definition[] }
const seed = JSON.parse(readFileSync(new URL('../../data/demo/seed.json', import.meta.url), 'utf8')) as {
  spots: {id:string;name:string}[]
  tasks: {id:string;spotId:string;type:string;answerKey?:string;password?:string;sortingAnswer?:number[];options?:{key:string;text:string}[]}[]
}
const difficulties = ['easy', 'normal', 'advanced'] as const
const current = async (page: Page) => (await (await page.request.get('/api/journeys/current')).json()).snapshot as JourneySnapshot
async function act(page: Page, state: JourneySnapshot, path: string, extra: Record<string, unknown>) {
  const response = await page.request.post('/api' + path, { data: { journey_id: state.journeyId, state_version: state.stateVersion, request_id: crypto.randomUUID(), ...extra } })
  expect(response.ok(), await response.text()).toBeTruthy()
  return (await response.json()).snapshot as JourneySnapshot
}
async function solve(card: Locator, activity: Definition, difficulty: string) {
  const variant = activity.variants[difficulty]
  if (activity.mechanism === 'matching') {
    for (const [id, value] of Object.entries(variant.answer)) {
      const label = variant.items!.find((item) => item.id === id)!.label
      await card.getByRole('combobox', { name: `为${label}选择对应项`, exact: true }).selectOption(value)
    }
  } else if (activity.mechanism === 'ordering') {
    const wanted = variant.answer as string[]
    for (let target = 0; target < wanted.length; target++) {
      const label = variant.items!.find((item) => item.id === wanted[target])!.label
      const rows = await card.getByRole('listitem').allTextContents()
      let position = rows.findIndex((text) => text.includes(label))
      while (position-- > target) await card.getByRole('button', { name: `上移${label}`, exact: true }).click()
    }
  } else {
    for (const statement of variant.statements!) {
      const checked = (variant.answer as string[]).includes(statement.id)
      await card.getByRole('checkbox', { name: statement.label, exact: true }).setChecked(checked)
      if (checked && difficulty === 'advanced') await card.getByRole('combobox', { name: `判断依据：${statement.label}`, exact: true }).selectOption(variant.supports![statement.id])
    }
  }
}

for (const [index, difficulty] of difficulties.entries()) test(`首页出发与八项可选探索、存档、结局 · ${difficulty}`, async ({ page }, info) => {
  test.setTimeout(240000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: /苏州 · 已开放/ }).click()
  await page.getByRole('link', { name: '选择这条完整路线', exact: true }).click()
  await page.getByLabel('适合人群', { exact: true }).selectOption(['child','student','adult'][index])
  await page.getByLabel('任务难度', { exact: true }).selectOption(difficulty)
  await page.getByRole('radio', { name: /沈观澜/ }).check()
  await page.getByRole('button', { name: '创建旅程，开始体验', exact: true }).click()
  await expect(page).toHaveURL(/\/map$/)
  await expect(page.getByRole('heading', { name: '平江寻梦 · 路线', exact: true })).toBeVisible()
  let state = await current(page)
  const captured = new Set<string>()
  for (const spot of seed.spots) {
    state = await act(page, state, '/location/trigger', { spot_id: spot.id })
    if (spot.id === 'pingjiang') state = await act(page, state, '/chat/message', { npc_id: 'zhou-bo', message: '《平江图》是什么？' })
    if (spot.id === 'subo') state = await act(page, state, '/chat/message', { npc_id: 'xiao-shen', message: '片石假山妙在哪里？' })
    for (const task of seed.tasks.filter((task) => task.spotId === spot.id)) {
      if (difficulty === 'advanced' && task.id === 'task-pianshi') continue
      let answer: unknown = task.answerKey ?? task.password ?? task.sortingAnswer
      if (difficulty === 'advanced' && task.answerKey) answer = task.options!.find((option) => option.key === task.answerKey)!.text
      if (difficulty === 'advanced' && task.sortingAnswer) answer = task.sortingAnswer.map((n) => task.sortingAnswer!.length - 1 - n)
      state = await act(page, state, `/tasks/${task.id}/verify`, { answer })
      expect(state.taskStates[task.id].status).toBe('completed')
    }
    await page.goto(`/spot/${spot.id}`)
    await expect(page.getByRole('heading', { name: spot.name, exact: true })).toBeVisible()
    for (const activity of catalog.activities.filter((a) => a.spotId === spot.id)) {
      let card = page.locator(`[data-activity-id="${activity.id}"]`)
      await card.locator('summary').first().click()
      if (difficulty === 'advanced' && activity.hintQuestion) {
        await expect(card.getByRole('button', { name: '提交探索', exact: true })).toBeDisabled()
        await card.getByRole('link', { name: /询问剧情线索/ }).click()
        await page.getByRole('button', { name: `可选探索：${activity.hintQuestion}`, exact: true }).click()
        await expect(page.getByText(/可选探索剧情提示（非历史事实）/).last()).toBeVisible()
        await expect(page.locator('#chat-input')).toBeEnabled()
        await page.goto(`/spot/${spot.id}`)
        card = page.locator(`[data-activity-id="${activity.id}"]`)
        await card.locator('summary').first().click()
        await expect(card.getByText('剧情线索已收入背包。')).toBeVisible()
      }
      for (const width of difficulty === 'normal' ? [320,375,390,412,768,1440] : [375]) {
        await page.setViewportSize({ width, height: 900 })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy()
      }
      if (difficulty === 'normal' && !captured.has(activity.mechanism)) {
        captured.add(activity.mechanism)
        await page.setViewportSize({ width: 375, height: 900 })
        await card.screenshot({ path: info.outputPath(`${activity.mechanism}-375.png`) })
      }
      await solve(card, activity, difficulty)
      await card.getByRole('button', { name: '提交探索', exact: true }).click()
      await expect(card.locator('summary').first()).toContainText('已完成')
      await expect(card.getByText('本次获得 8 探索积分；', { exact: false })).toBeVisible()
      state = await current(page)
      expect(state.activityStates![activity.id].score).toBe(8)
      await page.reload()
      card = page.locator(`[data-activity-id="${activity.id}"]`)
      await expect(card.locator('summary').first()).toContainText('已完成')
    }
  }
  const report = await (await page.request.get('/api/report')).json()
  expect(report.optionalScore).toBe(64)
  expect(report.optionalMaxScore).toBe(64)
  expect(report.optionalCompletedCount).toBe(8)
  expect(report.totalScore).toBe(report.knowledgeScore + 64)
  await page.goto('/report')
  await expect(page.getByText('探索积分 64/64', { exact: true })).toBeVisible()
  await page.goto('/clues')
  await expect(page.getByRole('heading', { name: /探索札记：/ })).toHaveCount(8)
  await page.goto('/codex')
  await expect(page.getByRole('heading', { name: '文化图鉴', exact: true })).toBeVisible()
  await page.goto('/spot/subo')
  const ending = difficulty === 'easy' ? '曲径归舟' : difficulty === 'normal' ? '澄怀观道' : '未尽之约'
  await page.getByRole('radio', { name: difficulty === 'easy' ? /把灯收进行囊/ : /把灯挂上长廊/ }).check()
  await page.getByRole('button', { name: '确认选择，迎接结局', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: ending, exact: true })).toBeVisible()
  await page.reload()
  expect((await (await page.request.get('/api/report')).json()).optionalScore).toBe(64)
})

test('观察照片与示意图均失败仍可依据替代文字完成探索', async ({ page }) => {
  await page.route('**/assets/places/pingjiang.jpg', (route) => route.fulfill({ status: 404, body: '' }))
  await page.route('**/assets/scenes/pingjiang.webp', (route) => route.abort('failed'))
  await page.request.post('/api/session')
  const state = (await (await page.request.post('/api/journeys/start', { data: { role_id:'scholar' } })).json()).snapshot as JourneySnapshot
  await act(page, state, '/location/trigger', { spot_id: 'pingjiang' })
  await page.goto('/spot/pingjiang')
  const a = catalog.activities[0];const card = page.locator(`[data-activity-id="${a.id}"]`)
  await card.locator('summary').first().click()
  await expect(card.getByRole('img', { name: /暂不可用/ })).toBeVisible()
  await expect(card.getByRole('region', { name: '判断依据', exact: true }).getByText(/替代观察说明/)).toBeVisible()
  await solve(card, a, 'normal')
  await card.getByRole('button', { name: '提交探索', exact: true }).click()
  await expect(card.locator('summary').first()).toContainText('已完成')
})

test('奖励响应丢失后刷新恢复，一次探索仅领取一次', async ({ page }) => {
  await page.request.post('/api/session')
  const state = (await (await page.request.post('/api/journeys/start', { data: { role_id:'scholar' } })).json()).snapshot as JourneySnapshot
  await act(page, state, '/location/trigger', { spot_id: 'pingjiang' })
  await page.goto('/spot/pingjiang')
  const a = catalog.activities[1];const card = page.locator(`[data-activity-id="${a.id}"]`)
  await card.locator('summary').first().click()
  await solve(card, a, 'normal')
  await page.route(`**/api/activities/${a.id}/verify`, async (route) => { await route.fetch(); await route.abort('failed') }, { times: 1 })
  await card.getByRole('button', { name: '提交探索', exact: true }).click()
  await expect(card.getByRole('alert')).toBeVisible()
  await page.reload()
  await expect(card.locator('summary').first()).toContainText('已完成')
  const report = await (await page.request.get('/api/report')).json()
  expect(report.optionalScore).toBe(8)
  expect((await current(page)).inventory.filter((id) => id === 'activity-note-' + a.id)).toHaveLength(1)
  await page.goto('/settings')
  await expect(page.getByLabel('任务难度', { exact: true })).toBeDisabled()
  await expect(page.getByLabel('表达模式', { exact: true })).toBeEnabled()
})
