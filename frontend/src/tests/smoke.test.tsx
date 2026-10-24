import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useJourney } from '@/engine/journeyStore'
import HomePage from '@/pages/HomePage'
import { api, ApiError } from '@/services/api'
import type { JourneySnapshot } from '@/types'

const snapshot: JourneySnapshot = {
  sessionId: 'session-from-server',
  journeyId: 'journey-from-server',
  stateVersion: 7,
  roleId: 'scholar',
  mode: 'virtual',
  state: 'AT_SPOT',
  currentSpotId: 'pingjiang',
  spotStatus: { pingjiang: 'current', subo: 'undiscovered' },
  taskStates: { 'task-shuangqipan': { status: 'available', attempts: 0, score: 0 } },
  inventory: ['clue-tuopian'],
  unlockedCodex: [],
  flags: {},
  events: [],
  messages: {},
  auditLog: [],
  endingId: null,
  startedAt: 100,
  finishedAt: null,
}
const report = {
  knowledgeScore: 0,
  maxScore: 140,
  completedTaskCount: 0,
  totalTaskCount: 6,
  completedSpotCount: 0,
  totalSpotCount: 5,
  unlockedCodexCount: 0,
  totalCodexCount: 14,
  durationMinutes: 0,
  events: [],
  weakPoints: [],
  bySpot: [],
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const fetchMock = vi.fn<typeof fetch>()
function standardResponse(input: RequestInfo | URL): Response {
  const url = String(input)
  if (url === '/api/session') return json({ sessionId: snapshot.sessionId, snapshot })
  if (url === '/api/journeys/current') return json({ snapshot: { ...snapshot, stateVersion: 9 } })
  if (url.startsWith('/api/routes/')) return json({ spots: [], npcs: [] })
  if (url.startsWith('/api/report')) return json(report)
  if (url.startsWith('/api/ending')) return json({ ending: null })
  if (url.startsWith('/api/codex')) return json({ items: [], total: 14 })
  return json({ items: [] })
}
beforeEach(() => {
  window.localStorage.clear()
  useJourney.setState({
    sessionId: null,
    journeyId: null,
    stateVersion: 0,
    state: 'CREATED',
    inventory: [],
    taskStates: {},
    messages: {},
    ready: false,
    busy: false,
    error: null,
  })
  useJourney.setState({
    themes: [
      {
        id: 'suzhou-pingjiang',
        name: '平江寻梦',
        subtitle: '苏州古城文化路线',
        city: '苏州',
        district: '姑苏区',
        description: '演示路线',
        durationMinutes: 120,
        distanceKm: 2.5,
      },
    ],
  })
  fetchMock.mockReset().mockImplementation(async (input) => standardResponse(input))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('首页', () => {
  it('保留品牌与体验入口', async () => {
    const router = createMemoryRouter([{ path: '/', element: <HomePage /> }])
    render(<RouterProvider router={router} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('把一座城')
    expect(screen.getAllByRole('link', { name: /开始体验/ }).length).toBeGreaterThan(0)
    await screen.findByRole('heading', { name:'选择城市与路线' })
  })
})
describe('服务端旅程缓存', () => {
  it('恢复权威快照并丢弃篡改的原型 localStorage', async () => {
    localStorage.setItem(
      'citystory.journey.v1',
      JSON.stringify({ state: { state: 'COMPLETED', inventory: ['fake-reward'] } }),
    )
    await useJourney.getState().restore()
    expect(useJourney.getState().state).toBe('AT_SPOT')
    expect(useJourney.getState().inventory).toEqual(['clue-tuopian'])
    expect(useJourney.getState().stateVersion).toBe(7)
    expect(localStorage.getItem('citystory.journey.v1')).toBeNull()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/session',
      expect.objectContaining({ credentials: 'include' }),
    )
  })
  it('任务只提交答案与版本，由服务器快照发放奖励', async () => {
    await useJourney.getState().restore()
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input).endsWith('/verify')) {
        const body = JSON.parse(String(init?.body))
        expect(body).toEqual({
          journey_id: snapshot.journeyId,
          state_version: 7,
          request_id: expect.any(String),
          answer: 'B',
        })
        return json({
          snapshot: { ...snapshot, stateVersion: 8, inventory: ['server-reward'] },
          ok: true,
          feedback: '服务端校验通过',
        })
      }
      return standardResponse(input)
    })
    const result = await useJourney.getState().verifyTask('task-shuangqipan', 'B')
    expect(result.ok).toBe(true)
    expect(useJourney.getState().inventory).toEqual(['server-reward'])
    expect(useJourney.getState().stateVersion).toBe(8)
  })
  it('任务越级拒绝后不修改本地奖励', async () => {
    await useJourney.getState().restore()
    fetchMock.mockResolvedValueOnce(
      json({ error: { code: 'TASK_UNAVAILABLE', message: '请先到达点位。' } }, 409),
    )
    await expect(useJourney.getState().verifyTask('locked-task', 'B')).rejects.toMatchObject({
      code: 'TASK_UNAVAILABLE',
    })
    expect(useJourney.getState().inventory).toEqual(snapshot.inventory)
    expect(useJourney.getState().busy).toBe(false)
  })
  it('状态版本冲突时恢复最新快照并保留明确错误', async () => {
    await useJourney.getState().restore()
    fetchMock.mockResolvedValueOnce(
      json({ error: { code: 'STATE_CONFLICT', message: '旅程已更新。' } }, 409),
    )
    await expect(useJourney.getState().setMode('onsite')).rejects.toBeInstanceOf(ApiError)
    expect(useJourney.getState().stateVersion).toBe(9)
    expect(useJourney.getState().error).toBe('旅程已更新。')
  })
  it('创建旅程不发送不属于契约的客户端状态', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input) === '/api/journeys/start') {
        expect(JSON.parse(String(init?.body))).toEqual({
          story_id: 'suzhou-pingjiang',
          role_id: 'scholar',
          mode: 'virtual',
        })
        return json({ snapshot })
      }
      return standardResponse(input)
    })
    await useJourney.getState().startJourney('scholar', 'virtual')
    expect(useJourney.getState().journeyId).toBe(snapshot.journeyId)
  })
  it('浏览器原始定位与精度交由后端判断', async () => {
    await useJourney.getState().restore()
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input) === '/api/location/trigger') {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          spot_id: 'pingjiang',
          lat: 31.3,
          lng: 120.6,
          accuracy_m: 20,
          coordinate_system: 'wgs84',
        })
        return json({ snapshot })
      }
      return standardResponse(input)
    })
    await useJourney
      .getState()
      .arriveSpot('pingjiang', {
        lat: 31.3,
        lng: 120.6,
        accuracy_m: 20,
        coordinate_system: 'wgs84',
      })
  })
})
describe('API 错误', () => {
  it('读取稳定嵌套错误码', async () => {
    fetchMock.mockResolvedValue(
      json({ error: { code: 'SESSION_INVALID', message: '会话已失效。' } }, 401),
    )
    await expect(api.get('/journeys/current')).rejects.toMatchObject({
      code: 'SESSION_INVALID',
      message: '会话已失效。',
      status: 401,
    })
  })
  it('网络错误不伪造服务端进度', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await useJourney.getState().restore()
    expect(useJourney.getState().ready).toBe(false)
    expect(useJourney.getState().journeyId).toBeNull()
    expect(useJourney.getState().error).toContain('服务暂时无法连接')
  })
})
