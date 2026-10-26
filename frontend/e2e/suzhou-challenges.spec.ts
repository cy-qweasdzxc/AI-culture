import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

interface SeedTask {
  id: string
  spotId: string
  type: string
  title: string
  optional?: boolean
  options?: { key: string; text: string }[]
  answerKey?: string
  answerKeys?: string[]
  matchingLeft?: { id: string; text: string }[]
  matchingAnswer?: Record<string, string>
}

const seed = JSON.parse(readFileSync(resolve(process.cwd(), '../data/demo/seed.json'), 'utf8')) as { tasks: SeedTask[] }

test('苏州主线后继续观察、多选、配对挑战，刷新保留进度', async ({ page }, testInfo) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.request.post('/api/session')
  const started = await page.request.post('/api/journeys/start', {
    data: { role_id: 'scholar', mode: 'virtual', route_id: 'suzhou-classic' },
  })
  expect(started.ok()).toBeTruthy()
  let state = (await started.json()).snapshot
  const action = async (path: string, extra: Record<string, unknown>) => {
    const response = await page.request.post(path, {
      data: { journey_id: state.journeyId, state_version: state.stateVersion, request_id: crypto.randomUUID(), ...extra },
    })
    expect(response.ok(), await response.text()).toBeTruthy()
    const body = await response.json()
    state = body.snapshot
    return body
  }
  await action('/api/location/trigger', { spot_id: 'pingjiang' })
  await action('/api/chat/message', { npc_id: 'zhou-bo', text: '《平江图》是什么？' })
  expect((await action('/api/tasks/task-shuangqipan/verify', { answer: 'B' })).ok).toBeTruthy()
  expect((await action('/api/tasks/task-pingjiangtu/verify', { answer: '1229' })).ok).toBeTruthy()
  expect(state.spotStatus.ouyuan).toBe('discovered')

  await page.goto('/spot/pingjiang')
  await expect(page.getByRole('heading', { name: /^自选挑战 · 0\/3$/ })).toBeVisible()
  const optional = seed.tasks.filter((task) => task.spotId === 'pingjiang' && task.optional)
  expect(optional).toHaveLength(3)
  for (const kind of ['observation', 'multi_select', 'matching']) {
    const task = optional.find((item) => item.type === kind)
    expect(task, `平江路需要 ${kind} 挑战`).toBeDefined()
    if (!task) throw new Error(`缺少 ${kind}`)
    await page.goto(`/task/${task.id}`)
    await expect(page.getByRole('heading', { level: 1, name: task.title })).toBeVisible()
    const submit = page.getByRole('button', { name: '提交答案', exact: true })
    await expect(submit).toBeDisabled()
    if (kind === 'observation') {
      const correct = task.options?.find((option) => option.key === task.answerKey)
      if (!correct) throw new Error('观察题缺少标准答案')
      await page.getByRole('radio', { name: `${correct.key}.${correct.text}`, exact: true }).check()
    } else if (kind === 'multi_select') {
      for (const key of task.answerKeys ?? []) {
        const option = task.options?.find((item) => item.key === key)
        if (!option) throw new Error('多选题缺少选项')
        await page.getByRole('checkbox', { name: `${key}.${option.text}`, exact: true }).check()
      }
    } else {
      const publicResponse = await page.request.get('/api/tasks')
      const publicTask = (await publicResponse.json()).items.find((item: { id: string }) => item.id === task.id)
      expect(publicTask.matchingAnswer).toBeUndefined()
      expect(publicTask.matchingPairs).toBeUndefined()
      for (let index = 0; index < publicTask.matchingLeft.length; index += 1) {
        const item = publicTask.matchingLeft[index]
        const rightId = task.matchingAnswer?.[item.id]
        if (!rightId) throw new Error('配对题缺少标准答案')
        await page.getByRole('combobox', { name: `为${item.text}选择配对项`, exact: true }).selectOption(rightId)
      }
    }
    await expect(submit).toBeEnabled()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(overflow).toBe(false)
    await page.screenshot({ path: testInfo.outputPath(`${kind}.png`), fullPage: true, animations: 'disabled' })
    await submit.click()
    await expect(page.getByText(/^任务已完成（/)).toBeVisible()
    await page.reload()
    await expect(page.getByText(/^任务已完成（/)).toBeVisible()
  }
  await page.goto('/report')
  await expect(page.getByText('自选挑战 3/15', { exact: true })).toBeVisible()
  await expect(page.getByText('主线任务 2/6', { exact: true })).toBeVisible()
  await page.goto('/map')
  await page.getByRole('button', { name: '耦园，已发现', exact: true }).click()
  await page.getByRole('button', { name: '到达此点（虚拟游览）', exact: true }).click()
  await expect(page).toHaveURL(/\/spot\/ouyuan$/)
  await page.goto('/spot/pingjiang')
  await page.getByRole('button', { name: '回到此点继续探索', exact: true }).click()
  await expect(page.getByRole('heading', { name: /^自选挑战 · 3\/3$/ })).toBeVisible()
  const restored = (await (await page.request.get('/api/journeys/current')).json()).snapshot
  expect(restored.currentSpotId).toBe('pingjiang')
  expect(restored.spotStatus.ouyuan).toBe('current')
  await page.getByRole('link', { name: '与周伯对话', exact: true }).click()
  await page.getByRole('combobox', { name: '按主题筛选推荐问题' }).selectOption('史实辨析')
  await expect(page.locator('#chat-input')).toBeVisible()
  await expect(page.locator('.chat-quick-question')).toHaveCount(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
  await page.screenshot({ path: testInfo.outputPath('question-topics.png'), fullPage: true, animations: 'disabled' })
  expect(pageErrors).toEqual([])
})
