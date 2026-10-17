import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useJourney } from '@/engine/journeyStore'
import { api, ApiError, streamSceneChat, type SceneChatRequest } from '@/services/api'
import type {
  ChatMessage,
  JourneySnapshot,
  SceneChatReply,
  SceneDirection,
  SceneStreamEvent,
} from '@/types'

vi.mock('@/services/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/api')>()
  return {
    ...original,
    api: {
      ...original.api,
      get: vi.fn(),
      post: vi.fn(),
      delete: vi.fn(),
    },
    streamSceneChat: vi.fn(),
  }
})

const stream = vi.mocked(streamSceneChat)
const get = vi.mocked(api.get)
const post = vi.mocked(api.post)
const onEvent = vi.fn<(event: SceneStreamEvent) => void>()
let original: JourneySnapshot
let serverSnapshot: JourneySnapshot | null

function direction(turnId: string): SceneDirection {
  return {
    turnId,
    beat: '循着水巷继续寻找线索',
    objective: '请周伯解释街巷格局',
    reason: '周伯熟悉当前问题涉及的街巷',
    speakerOrder: ['zhou-bo'],
    pace: 'focus',
    nextAction: { type: 'chat', targetId: 'zhou-bo', label: '继续询问周伯' },
    mode: 'rules',
  }
}

function committedReply(request: SceneChatRequest): SceneChatReply {
  const director = direction(request.request_id)
  const messages: ChatMessage[] = [
    {
      id: `${request.request_id}-user`,
      from: 'user',
      text: request.message,
      turnId: request.request_id,
      at: 200,
    },
    {
      id: `${request.request_id}-npc`,
      from: 'npc',
      npcId: 'zhou-bo',
      speakerName: '周伯',
      text: '这是服务器确认保存的回答。',
      turnId: request.request_id,
      at: 201,
    },
  ]
  return {
    director,
    messages,
    snapshot: {
      ...original,
      stateVersion: request.state_version + 1,
      inventory: ['server-confirmed-clue'],
      messages: { 'zhou-bo': [...original.messages['zhou-bo'], ...messages] },
      sceneDirections: { 'zhou-bo': director },
    },
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const send = (participants = ['zhou-bo']) =>
  useJourney.getState().sendSceneChat('zhou-bo', '平江路的格局有什么讲究？', participants, onEvent)

beforeEach(async () => {
  vi.clearAllMocks()
  stream.mockReset()
  get.mockReset()
  post.mockReset()
  vi.mocked(api.delete).mockReset().mockResolvedValue(undefined)
  original = {
    sessionId: 'server-session',
    journeyId: crypto.randomUUID(),
    stateVersion: 7,
    roleId: 'scholar',
    mode: 'virtual',
    state: 'AT_SPOT',
    currentSpotId: 'pingjiang',
    spotStatus: { pingjiang: 'current' },
    taskStates: {},
    inventory: [],
    unlockedCodex: [],
    flags: {},
    events: [],
    messages: {
      'zhou-bo': [{ id: 'saved-before-scene', from: 'npc', text: '已保存的历史对话。', at: 100 }],
    },
    auditLog: [],
    endingId: null,
    startedAt: 100,
    finishedAt: null,
  }
  serverSnapshot = original
  get.mockImplementation(async (path) => {
    if (path === '/journeys/current') return { snapshot: serverSnapshot }
    if (path.startsWith('/routes/')) return { spots: [], npcs: [] }
    if (path.startsWith('/ending')) return { ending: null }
    if (path.startsWith('/codex')) return { items: [], total: 0 }
    if (path.startsWith('/report'))
      return {
        knowledgeScore: 0,
        maxScore: 0,
        completedTaskCount: 0,
        totalTaskCount: 0,
        completedSpotCount: 0,
        totalSpotCount: 0,
        unlockedCodexCount: 0,
        totalCodexCount: 0,
        durationMinutes: 0,
        events: [],
        weakPoints: [],
        bySpot: [],
      }
    return { items: [] }
  })
  post.mockImplementation(async (path) => {
    if (path === '/session') return { sessionId: original.sessionId, snapshot: serverSnapshot }
    if (path === '/journeys/reset') return { snapshot: null }
    throw new Error(`测试未预期的请求：${path}`)
  })
  useJourney.setState({ busy: false, error: null, ready: false })
  await useJourney.getState().restore()
})

describe('多人场景的客户端权威状态', () => {
  it('导演与完整发言仍是临时事件，done后只采用服务端快照', async () => {
    const completion = deferred<SceneChatReply>()
    let request!: SceneChatRequest
    let emit!: (event: SceneStreamEvent) => void
    stream.mockImplementationOnce((body, callback) => {
      request = body
      emit = callback
      return completion.promise
    })
    const pending = send()
    emit({ type: 'director', data: direction(request.request_id) })
    emit({
      type: 'message',
      data: {
        id: 'uncommitted-message',
        from: 'npc',
        npcId: 'zhou-bo',
        text: '尚未保存的临时回答。',
        turnId: request.request_id,
        at: 150,
      },
    })
    expect(onEvent).toHaveBeenCalledTimes(2)
    expect(useJourney.getState().messages).toEqual(original.messages)
    expect(useJourney.getState().stateVersion).toBe(7)
    expect(useJourney.getState().sceneDirections).toEqual({})
    expect(useJourney.getState().inventory).toEqual([])
    const reply = committedReply(request)
    emit({ type: 'done', data: reply })
    completion.resolve(reply)
    await pending
    expect(useJourney.getState().messages).toEqual(reply.snapshot.messages)
    expect(useJourney.getState().messages['zhou-bo']).not.toContainEqual(
      expect.objectContaining({ id: 'uncommitted-message' }),
    )
    expect(useJourney.getState().sceneDirections['zhou-bo']).toEqual(reply.director)
    expect(useJourney.getState().stateVersion).toBe(8)
    expect(useJourney.getState().inventory).toEqual(['server-confirmed-clue'])
    expect(useJourney.getState().busy).toBe(false)
  })

  it('缺少done的断流会重新同步，不把临时回答或导演写进历史', async () => {
    serverSnapshot = { ...original, stateVersion: 9 }
    stream.mockImplementationOnce(async (request, callback) => {
      callback({ type: 'director', data: direction(request.request_id) })
      callback({
        type: 'message',
        data: {
          id: 'lost-message',
          from: 'narrator',
          text: '未保存的旁白',
          at: 150,
        },
      })
      throw new ApiError('STREAM_INTERRUPTED', '保存确认前连接中断。', 0)
    })
    await expect(send()).rejects.toMatchObject({ code: 'STREAM_INTERRUPTED' })
    expect(get).toHaveBeenCalledWith('/journeys/current')
    expect(useJourney.getState().messages).toEqual(original.messages)
    expect(useJourney.getState().stateVersion).toBe(9)
    expect(useJourney.getState().sceneDirections).toEqual({})
    expect(useJourney.getState().inventory).toEqual([])
    expect(useJourney.getState().busy).toBe(false)
    expect(useJourney.getState().error).toBe('保存确认前连接中断。')
  })

  it('done丢失但服务器已经保存同一turnId时恢复为成功', async () => {
    let committed!: SceneChatReply
    stream.mockImplementationOnce(async (request) => {
      committed = committedReply(request)
      serverSnapshot = committed.snapshot
      throw new ApiError('NETWORK_ERROR', '连接中断。', 0)
    })
    const result = await send()
    expect(result.replayed).toBe(true)
    expect(result.messages).toEqual(committed.messages)
    expect(onEvent).toHaveBeenLastCalledWith({ type: 'done', data: result })
    expect(useJourney.getState().messages).toEqual(committed.snapshot.messages)
    expect(useJourney.getState().stateVersion).toBe(8)
    expect(useJourney.getState().sceneDirections['zhou-bo'].turnId).toBe(committed.director.turnId)
    expect(useJourney.getState().error).toBeNull()
    expect(useJourney.getState().busy).toBe(false)
  })

  it('无法确认提交结果时手动重试复用请求ID，已保存回合只出现一次', async () => {
    let committed!: SceneChatReply
    stream.mockImplementationOnce(async (request) => {
      committed = committedReply(request)
      serverSnapshot = committed.snapshot
      get.mockRejectedValueOnce(new ApiError('NETWORK_ERROR', '同步也暂时失败。', 0))
      throw new ApiError('STREAM_INTERRUPTED', '没有收到保存确认。', 0)
    })
    await expect(send(['a-heng', 'zhou-bo', 'a-heng'])).rejects.toMatchObject({
      code: 'STREAM_INTERRUPTED',
    })
    expect(useJourney.getState().stateVersion).toBe(7)
    expect(useJourney.getState().messages).toEqual(original.messages)
    stream.mockResolvedValueOnce({ ...committed, replayed: true })
    const recovered = await send(['zhou-bo', 'a-heng'])
    const firstRequest = stream.mock.calls[0][0]
    const retryRequest = stream.mock.calls[1][0]
    expect(retryRequest.request_id).toBe(firstRequest.request_id)
    expect(retryRequest.state_version).toBe(firstRequest.state_version)
    expect(retryRequest.participant_ids).toEqual(['a-heng', 'zhou-bo'])
    expect(recovered.replayed).toBe(true)
    expect(useJourney.getState().messages['zhou-bo']).toHaveLength(3)
    expect(
      useJourney
        .getState()
        .messages['zhou-bo'].filter((message) => message.turnId === firstRequest.request_id),
    ).toHaveLength(2)
    expect(useJourney.getState().stateVersion).toBe(8)
  })

  it.each([0, 409])('版本冲突（status=%i）刷新后重试使用新请求ID与新版本', async (status) => {
    serverSnapshot = { ...original, stateVersion: 12 }
    stream.mockRejectedValueOnce(new ApiError('STATE_CONFLICT', '旅程已更新，请重试。', status))
    await expect(send()).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
    expect(useJourney.getState().stateVersion).toBe(12)
    stream.mockImplementationOnce(async (request) => committedReply(request))
    await send()
    const firstRequest = stream.mock.calls[0][0]
    const retryRequest = stream.mock.calls[1][0]
    expect(retryRequest.request_id).not.toBe(firstRequest.request_id)
    expect(retryRequest.state_version).toBe(12)
    expect(useJourney.getState().stateVersion).toBe(13)
  })

  it('同一回合生成期间重复调用会被拒绝，不发起第二条流', async () => {
    const completion = deferred<SceneChatReply>()
    stream.mockReturnValueOnce(completion.promise)
    const pending = send()
    expect(useJourney.getState().busy).toBe(true)
    await expect(send()).rejects.toMatchObject({ code: 'ACTION_PENDING' })
    expect(stream).toHaveBeenCalledTimes(1)
    completion.resolve(committedReply(stream.mock.calls[0][0]))
    await pending
    expect(useJourney.getState().busy).toBe(false)
  })

  it('恢复旧版快照会移除旧导演状态，归一化为空对象', async () => {
    useJourney.setState({ sceneDirections: { 'zhou-bo': direction('stale-turn') } })
    await useJourney.getState().restore()
    expect(useJourney.getState().sceneDirections).toEqual({})
    expect(useJourney.getState().messages).toEqual(original.messages)
  })

  it.each(['resetJourney', 'clearSession'] as const)(
    '%s清除旅程时同步清除导演状态',
    async (method) => {
      useJourney.setState({ sceneDirections: { 'zhou-bo': direction('saved-turn') } })
      serverSnapshot = null
      await useJourney.getState()[method]()
      expect(useJourney.getState().journeyId).toBeNull()
      expect(useJourney.getState().messages).toEqual({})
      expect(useJourney.getState().sceneDirections).toEqual({})
      expect(useJourney.getState().busy).toBe(false)
    },
  )
})
