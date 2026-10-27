import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { JourneySnapshot } from '../src/types'

interface SeedTask {
  id: string; spotId: string; title: string; type: string; optional?: boolean
  answerKey?: string; password?: string; sortingAnswer?: number[]
  options?: { key: string; text: string }[]
}
const seed = JSON.parse(readFileSync(new URL('../../data/demo/seed.json', import.meta.url), 'utf8')) as {
  spots: { id: string; name: string }[]; tasks: SeedTask[]
}
const activities = JSON.parse(readFileSync(new URL('../../data/demo/activities.json', import.meta.url), 'utf8')) as {
  activities: { id: string; title: string; variants: Record<string, { answer: string[]; statements: { id: string; label: string }[] }> }[]
}

test('合并版三类进度、挑战与探索、回访及结局只读共同生效', async ({ page }, info) => {
  test.setTimeout(120000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.request.post('/api/session')
  const cities = (await (await page.request.get('/api/cities')).json()).items
  expect(cities.map((city: { id: string }) => city.id).sort()).toEqual(['beijing', 'chengdu', 'suzhou', 'xian'])
  const routes = (await (await page.request.get('/api/cities/suzhou/routes')).json()).items
  expect(routes.filter((route: { playable: boolean }) => route.playable).map((route: { id: string }) => route.id)).toEqual(['suzhou-classic'])
  const started = await page.request.post('/api/journeys/start', { data: { role_id: 'scholar', mode: 'virtual', route_id: 'suzhou-classic' } })
  expect(started.ok(), await started.text()).toBeTruthy()
  let state = (await started.json()).snapshot as JourneySnapshot
  const refresh = async () => {
    state = (await (await page.request.get('/api/journeys/current')).json()).snapshot
    return state
  }
  const action = async (path: string, extra: Record<string, unknown>) => {
    const response = await page.request.post('/api' + path, { data: {
      journey_id: state.journeyId, state_version: state.stateVersion, request_id: crypto.randomUUID(), ...extra,
    } })
    expect(response.ok(), await response.text()).toBeTruthy()
    const body = await response.json()
    state = body.snapshot
    return body
  }
  await action('/location/trigger', { spot_id: 'pingjiang' })
  const challenge = seed.tasks.find(task => task.spotId === 'pingjiang' && task.optional && task.type === 'observation')!
  await page.goto(`/task/${challenge.id}`)
  await expect(page.getByRole('heading', { name: challenge.title, exact: true })).toBeVisible()
  const correct = challenge.options!.find(option => option.key === challenge.answerKey)!
  await page.getByRole('radio', { name: `${correct.key}.${correct.text}`, exact: true }).check()
  await page.getByRole('button', { name: '提交答案', exact: true }).click()
  await expect(page.getByText(/^任务已完成/)).toBeVisible()
  await refresh()
  expect(state.taskStates[challenge.id].score).toBe(8)

  const activity = activities.activities.find(item => item.id === 'explore-pingjiang-photo')!
  await page.goto('/spot/pingjiang')
  const card = page.locator(`[data-activity-id="${activity.id}"]`)
  await card.locator('summary').first().click()
  for (const statement of activity.variants.normal.statements)
    await card.getByRole('checkbox', { name: statement.label, exact: true }).setChecked(activity.variants.normal.answer.includes(statement.id))
  await card.getByRole('button', { name: '提交探索', exact: true }).click()
  await expect(card.getByText(/探索已完成/)).toBeVisible()
  await refresh()
  expect(state.activityStates?.[activity.id].score).toBe(8)
  await page.reload()
  await expect(page.getByRole('heading', { name: '自选挑战 · 1/3', exact: true })).toBeVisible()

  await page.goto('/report')
  await expect(page.getByText('主线任务 0/6', { exact: true })).toBeVisible()
  await expect(page.getByText('自选挑战 1/15', { exact: true })).toBeVisible()
  await expect(page.getByText(/可选探索 1\/8/)).toBeVisible()
  const partial = await (await page.request.get('/api/report')).json()
  expect(partial).toMatchObject({ requiredTaskScore: 0, optionalTaskScore: 8, optionalScore: 8, totalScore: 16, totalMaxScore: 324 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  await page.screenshot({ path: info.outputPath('three-part-report.png'), fullPage: true, animations: 'disabled' })

  await action('/chat/message', { npc_id: 'zhou-bo', message: '《平江图》是什么？' })
  for (const task of seed.tasks.filter(task => task.spotId === 'pingjiang' && !task.optional))
    expect((await action(`/tasks/${task.id}/verify`, { answer: task.answerKey ?? task.password ?? task.sortingAnswer })).ok).toBeTruthy()
  await action('/location/trigger', { spot_id: 'ouyuan' })
  await page.goto('/spot/pingjiang')
  await page.getByRole('button', { name: '回到此点继续探索', exact: true }).click()
  await refresh()
  expect(state.currentSpotId).toBe('pingjiang')
  expect(state.spotStatus.ouyuan).toBe('current')

  for (const spot of seed.spots.filter(spot => spot.id !== 'pingjiang')) {
    await action('/location/trigger', { spot_id: spot.id })
    if (spot.id === 'subo') await action('/chat/message', { npc_id: 'xiao-shen', message: '片石假山妙在哪里？' })
    for (const task of seed.tasks.filter(task => task.spotId === spot.id && !task.optional))
      expect((await action(`/tasks/${task.id}/verify`, { answer: task.answerKey ?? task.password ?? task.sortingAnswer })).ok).toBeTruthy()
  }
  await action('/journeys/finale', { choice_key: 'hang' })
  expect(state.state).toBe('COMPLETED')
  expect(state.endingId).toBe('cheng-huai')
  const completedVersion = state.stateVersion
  await page.goto('/spot/pingjiang')
  await expect(page.getByRole('heading', { name: '平江路', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '回到此点继续探索', exact: true })).toHaveCount(0)
  const unsolved = seed.tasks.find(task => task.optional && task.spotId === 'pingjiang' && task.id !== challenge.id)!
  await page.goto(`/task/${unsolved.id}`)
  await expect(page.getByText(/本次旅程已结束/).first()).toBeVisible()
  const submit = page.getByRole('button', { name: '提交答案', exact: true })
  if (await submit.count()) await expect(submit).toBeDisabled()
  await refresh()
  expect(state.stateVersion).toBe(completedVersion)
  const report = await (await page.request.get('/api/report')).json()
  expect(report).toMatchObject({ completedRequiredTaskCount: 6, completedOptionalTaskCount: 1, optionalCompletedCount: 1, requiredTaskScore: 140, optionalTaskScore: 8, optionalScore: 8, totalScore: 156, totalMaxScore: 324 })
  await page.goto('/report')
  await expect(page.getByText('主线任务 6/6', { exact: true })).toBeVisible()
  await expect(page.getByText('自选挑战 1/15', { exact: true })).toBeVisible()
  await expect(page.getByText(/可选探索 1\/8/)).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  expect(errors).toEqual([])
})
