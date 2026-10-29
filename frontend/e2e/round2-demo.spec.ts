import { expect, test } from '@playwright/test'

test('城市状态、规则推荐、儿童简单任务、权威积分与刷新恢复', async ({ page }, info) => {
  await page.goto('/theme')
  const catalog = page.locator('#city-catalog')
  const capture = async (name: string) => {
    await page.evaluate(() => new Promise<void>(done => {
      document.documentElement.style.scrollBehavior = 'auto'
      window.scrollTo(0, 0)
      requestAnimationFrame(() => requestAnimationFrame(() => done()))
    }))
    await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true, animations: 'disabled' })
  }
  try {
    await catalog.getByRole('button', {name:/北京 · 筹备中/}).click()
    await expect(catalog.getByText('故宫博物院', {exact:true})).toBeVisible()
    await expect(catalog.getByText(/尚未开放完整剧情/)).toBeVisible()
    await expect(catalog.getByRole('link',{name:'选择这条完整路线'})).toHaveCount(0)
    await capture('city-beijing')
    for (const name of ['西安','成都']) {
      await catalog.getByRole('button',{name:new RegExp(`${name} · 筹备中`)}).click()
      await expect(catalog.getByRole('link',{name:'原始资料来源'})).toHaveCount(3)
      await capture(`city-${name}`)
    }
    await catalog.getByRole('button',{name:/苏州 · 已开放/}).click()
    await catalog.getByLabel('可用时间',{exact:true}).selectOption('30')
    const recommendationResponse = page.waitForResponse(response =>
      response.url().endsWith('/api/routes/recommend') && response.request().method() === 'POST',
    )
    await catalog.getByRole('button',{name:'推荐可用路线'}).click()
    const recommended = await recommendationResponse
    expect(recommended.ok()).toBe(true)
    const recommendation = await recommended.json()
    expect(recommendation).toMatchObject({ provider: 'rules', model_calls: 0, city_id: 'suzhou' })
    expect(recommendation.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ route_id: 'suzhou-classic', preview_only: false }),
    ]))
    const recommendedRoute = catalog.getByRole('link',{name:'选择角色，开始旅程', exact: true})
    await expect(recommendedRoute).toBeVisible()
    await capture('recommended-route')
    await recommendedRoute.click()
    await page.getByRole('radio',{name:'儿童模式',exact:true}).click()
    await expect(page.getByLabel('任务难度',{exact:true})).toHaveValue('easy')
    await page.getByRole('radio',{name:/沈观澜/}).click()
    await page.getByRole('button',{name:'创建旅程，开始体验'}).click()
    await expect(page).toHaveURL(/\/map$/)
    const state = (await (await page.request.get('/api/journeys/current')).json()).snapshot
    expect(state.audienceMode).toBe('child')
    expect(state.difficulty).toBe('easy')
    await page.getByRole('button',{name:'平江路，已发现'}).click()
    await page.getByRole('button',{name:'到达此点（虚拟游览）'}).click()
    await expect(page.locator('img[src="/assets/places/pingjiang.jpg"]')).toBeVisible()
    await page.getByText('照片来源与许可',{exact:true}).click()
    await expect(page.getByRole('link',{name:'原始文件页面'})).toBeVisible()
    await page.goto('/task/task-shuangqipan')
    await expect(page.getByRole('radio')).toHaveCount(2)
    await page.getByRole('radio',{name:/水陆并行，河街相邻/}).check()
    await page.getByRole('button',{name:'提交答案'}).click()
    await expect(page.getByRole('status').filter({hasText:/本次获得 \+/})).toBeVisible()
    await capture('child-task-completed')
    const report = await (await page.request.get('/api/report')).json()
    await expect(page.getByTestId('journey-timeline')).toContainText(`游戏积分 ${report.knowledgeScore}`)
    await page.reload()
    await expect(page.getByTestId('journey-timeline')).toContainText(`游戏积分 ${report.knowledgeScore}`)
    await page.goto('/settings')
    await expect(page.getByLabel('任务难度',{exact:true})).toBeDisabled()
    const saved = page.waitForResponse((response) => response.url().endsWith('/api/journeys/profile') && response.request().method() === 'POST')
    await page.getByLabel('表达模式',{exact:true}).selectOption('student')
    const savedResponse = await saved
    expect(savedResponse.ok()).toBe(true)
    expect((await savedResponse.json()).snapshot.audienceMode).toBe('student')
    await page.reload()
    await expect(page.getByLabel('表达模式',{exact:true})).toHaveValue('student')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await capture('settings-restored')
  } finally { await page.request.delete('/api/session', {timeout:5000}).catch(() => {}) }
})

test('浏览器语音控制手势与页面离开停止（模拟语音引擎）', async ({ page }) => {
  await page.addInitScript(() => {
    const calls:string[] = []
    Object.defineProperty(window,'__round2Speech',{value:calls})
    Object.defineProperty(window,'SpeechSynthesisUtterance',{value:class {text:string; constructor(text:string) {this.text=text}}})
    Object.defineProperty(window,'speechSynthesis',{value:{speak:()=>calls.push('speak'), cancel:()=>calls.push('cancel'), pause:()=>calls.push('pause'), resume:()=>calls.push('resume'), getVoices:()=>[]}})
  })
  await page.request.post('/api/session')
  try {
    const state = (await (await page.request.post('/api/journeys/start',{data:{role_id:'scholar'}})).json()).snapshot
    await page.request.post('/api/location/trigger',{data:{journey_id:state.journeyId,state_version:state.stateVersion,request_id:crypto.randomUUID(),spot_id:'pingjiang'}})
    await page.goto('/spot/pingjiang')
    const calls = () => page.evaluate(() => (window as unknown as {__round2Speech:string[]}).__round2Speech)
    expect(await calls()).not.toContain('speak')
    await page.getByRole('button',{name:'播放讲解'}).click()
    await page.getByRole('button',{name:'暂停',exact:true}).click()
    await page.getByRole('button',{name:'继续',exact:true}).click()
    await page.getByRole('button',{name:'停止',exact:true}).click()
    expect(await calls()).toEqual(expect.arrayContaining(['speak','pause','resume','cancel']))
    await page.getByRole('button',{name:'播放讲解'}).click()
    const count = (await calls()).filter((item) => item === 'cancel').length
    // SPA navigation preserves the mock call list, making cleanup observable.
    await page.getByRole('link',{name:'路线',exact:true}).first().click()
    await expect.poll(async () => (await calls()).filter((item) => item === 'cancel').length).toBeGreaterThan(count)
  } finally { await page.request.delete('/api/session', {timeout:5000}).catch(() => {}) }
})

test('连续六轮真实 SSE 传输、长会话滚动与刷新恢复', async ({ page }) => {
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.request.post('/api/session')
  try {
    const state = (await (await page.request.post('/api/journeys/start',{data:{role_id:'scholar'}})).json()).snapshot
    const arrived = await page.request.post('/api/location/trigger',{data:{journey_id:state.journeyId,state_version:state.stateVersion,request_id:crypto.randomUUID(),spot_id:'pingjiang'}})
    expect(arrived.ok()).toBe(true)
    const initial = (await arrived.json()).snapshot
    await page.goto('/chat/zhou-bo')
    const input = page.locator('#chat-input')
    for (let turn=0;turn<6;turn++) {
      await expect(input).toBeEnabled()
      await input.fill('继续剧情')
      const reply = page.waitForResponse((response) => response.url().endsWith('/api/chat/scene/stream') && response.request().method() === 'POST')
      await page.getByRole('button',{name:'发送',exact:true}).click()
      const streamed = await reply
      expect(streamed.ok()).toBe(true)
      expect(await streamed.headerValue('content-type')).toContain('text/event-stream')
      // The client cancels its reader after the SSE done event. HTTP EOF is not
      // a reliable browser-test completion signal for this streaming request.
      await expect.poll(async () => (await (await page.request.get('/api/journeys/current')).json()).snapshot.stateVersion).toBe(initial.stateVersion+turn+1)
      await expect(input).toBeEnabled()
    }
    const saved = (await (await page.request.get('/api/journeys/current')).json()).snapshot
    expect(saved.stateVersion).toBe(initial.stateVersion+6)
    expect(saved.messages['zhou-bo'].filter((message:{agentRole?:string})=>message.agentRole==='narrator')).toHaveLength(6)
    expect(saved.messages['zhou-bo'].filter((message:{agentRole?:string})=>message.agentRole==='character')).toHaveLength(6)
    expect(saved.messages['zhou-bo'].filter((message:{from:string})=>message.from==='user')).toHaveLength(6)
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
    await page.reload()
    await expect(input).toBeVisible()
    const restored = (await (await page.request.get('/api/journeys/current')).json()).snapshot
    expect(restored.messages).toEqual(saved.messages)
    expect(restored.stateVersion).toBe(saved.stateVersion)
  } finally { await page.request.delete('/api/session',{timeout:5000}).catch(()=>{}) }
})
