import { expect, test } from '@playwright/test'
import type { JourneySnapshot, SceneChatReply } from '../src/types'

test('导演调度两位已相识角色，旁白串场并在刷新后恢复', async ({ page }, testInfo) => {
  expect((await page.request.post('/api/session')).ok()).toBeTruthy()
  const start = await page.request.post('/api/journeys/start', {
    data: { role_id: 'scholar', mode: 'virtual' },
  })
  let state: JourneySnapshot = (await start.json()).snapshot
  const act = async (path: string, extra: Record<string, unknown>) => {
    const response = await page.request.post('/api' + path, {
      data: {
        journey_id: state.journeyId,
        state_version: state.stateVersion,
        request_id: crypto.randomUUID(),
        ...extra,
      },
    })
    expect(response.ok(), await response.text()).toBeTruthy()
    state = (await response.json()).snapshot
  }
  await act('/location/trigger', { spot_id: 'pingjiang' })
  await act('/chat/message', { npc_id: 'zhou-bo', message: '《平江图》是什么？' })
  await act('/tasks/task-shuangqipan/verify', { answer: 'B' })
  await act('/tasks/task-pingjiangtu/verify', { answer: '1229' })
  await act('/location/trigger', { spot_id: 'ouyuan' })
  await page.goto('/chat/a-heng')
  await expect(page.getByRole('button', { name: '多人同场', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  const openDirector = async () => {
    if ((page.viewportSize()?.width ?? 1440) < 768)
      await page.getByRole('button', { name: /查看导演调度与/ }).click()
  }
  const closeDirector = async () => {
    if ((page.viewportSize()?.width ?? 1440) < 768)
      await page.getByRole('button', { name: '关闭', exact: true }).click()
  }
  await openDirector()
  await expect(page.getByRole('checkbox', { name: '周伯参与同场对话' }).last()).toBeChecked()
  await expect(page.getByRole('checkbox', { name: '小沈参与同场对话' })).toHaveCount(0)
  await closeDirector()
  const savedTurn = async (requestId: string): Promise<SceneChatReply> => {
    // A browser fetch reader may close its SSE body after `done`; inspect the
    // authoritative saved turn instead of relying on DevTools retaining a live body.
    await expect(page.locator('#chat-input')).toBeEnabled()
    let saved: JourneySnapshot
    await expect
      .poll(async () => {
        saved = (await (await page.request.get('/api/journeys/current')).json()).snapshot
        return saved.sceneDirections?.['a-heng']?.turnId
      })
      .toBe(requestId)
    return {
      snapshot: saved!,
      director: saved!.sceneDirections!['a-heng'],
      messages: saved!.messages['a-heng'].filter(
        (message) => message.turnId === requestId && message.from !== 'user',
      ),
    }
  }
  const ask = async (text: string) => {
    const request = page.waitForRequest(
      (entry) => entry.url().endsWith('/api/chat/scene/stream') && entry.method() === 'POST',
    )
    await page.locator('#chat-input').fill(text)
    await page.getByRole('button', { name: '发送', exact: true }).click()
    return savedTurn((await request).postDataJSON().request_id)
  }
  const group = await ask('周伯先说说平江图，再请阿蘅介绍耦园。')
  expect(group.director.speakerOrder).toEqual(['zhou-bo', 'a-heng'])
  expect(
    group.messages.filter((message) => message.from === 'npc').map((message) => message.npcId),
  ).toEqual(['zhou-bo', 'a-heng'])
  await expect(page.getByText('剧情旁白 · 虚构', { exact: true }).last()).toBeVisible()
  await expect(page.getByText('周伯 · 虚构角色', { exact: true }).last()).toBeVisible()
  await expect(page.getByText('阿蘅 · 虚构角色', { exact: true }).last()).toBeVisible()
  expect(group.snapshot.stateVersion).toBe(state.stateVersion + 1)
  await page.reload()
  await expect(
    page.getByText(group.director.beat, { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible()
  await openDirector()
  await expect(page.getByRole('heading', { name: '导演 Agent', exact: true }).last()).toBeVisible()
  await closeDirector()
  const redirected = await ask('暂时别让周伯发言，阿蘅总结。')
  expect(redirected.director.speakerOrder).toEqual(['a-heng'])
  await openDirector()
  const continued = page.waitForRequest(
    (entry) => entry.url().endsWith('/api/chat/scene/stream') && entry.method() === 'POST',
  )
  await page.getByRole('button', { name: '继续剧情', exact: true }).last().click()
  const next = await savedTurn((await continued).postDataJSON().request_id)
  expect(next.director.pace).toBe('transition')
  expect(next.director.nextAction.type).toBe('task')
  expect(next.messages.some((message) => message.reason === 'NARRATIVE_GUIDANCE')).toBe(true)
  expect(next.snapshot.taskStates).toEqual(group.snapshot.taskStates)
  expect(next.snapshot.endingId).toBeNull()
  await closeDirector()
  await expect(page.locator('#chat-input')).toBeEnabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  await page.screenshot({
    path: testInfo.outputPath('multi-agent-scene.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await page.goto('/clues')
  await page.getByRole('tab', { name: '人物关系' }).click()
  const relationship = page
    .locator('li')
    .filter({ has: page.getByRole('heading', { name: /周伯/ }) })
  await expect(relationship.getByText('对话 2 轮', { exact: true })).toBeVisible()
})
