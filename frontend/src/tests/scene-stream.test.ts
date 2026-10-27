import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, streamSceneChat, type SceneChatRequest } from '@/services/api'
import type { SceneChatReply, SceneDirection, SceneStreamEvent } from '@/types'

const body: SceneChatRequest = {
  journey_id: 'journey-1',
  state_version: 7,
  request_id: 'turn-1',
  npc_id: 'zhou-bo',
  message: '周伯，请继续',
  participant_ids: ['zhou-bo'],
}
const director: SceneDirection = {
  turnId: body.request_id,
  beat: '茶馆里的新问题',
  objective: '核对平江图的线索',
  reason: '玩家请周伯继续讲述',
  speakerOrder: ['zhou-bo'],
  pace: 'explore',
  nextAction: { type: 'chat', targetId: 'zhou-bo', label: '继续交谈' },
  mode: 'rules',
}
const message = {
  id: 'message-1',
  from: 'narrator' as const,
  text: '茶盏被轻轻放回桌面。',
  at: 100,
  turnId: body.request_id,
}
const reply: SceneChatReply = {
  director,
  messages: [message],
  snapshot: {
    sessionId: 'session-1',
    journeyId: body.journey_id,
    stateVersion: 8,
    roleId: 'scholar',
    mode: 'virtual',
    state: 'DIALOGUE',
    currentSpotId: 'pingjiang',
    spotStatus: { pingjiang: 'current' },
    taskStates: {},
    inventory: [],
    unlockedCodex: [],
    flags: {},
    events: [],
    messages: { 'zhou-bo': [message] },
    sceneDirections: { 'zhou-bo': director },
    auditLog: [],
    endingId: null,
    startedAt: 1,
    finishedAt: null,
  },
}
function event(name: string, data: unknown, separator = '\n') {
  return `event: ${name}${separator}data: ${JSON.stringify(data)}${separator}${separator}`
}
function response(text: string, sizes = [text.length * 4]) {
  const bytes = new TextEncoder().encode(text)
  let offset = 0
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset === bytes.length) return controller.close()
        const size = sizes.shift() ?? bytes.length
        controller.enqueue(bytes.slice(offset, offset + size))
        offset = Math.min(offset + size, bytes.length)
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } },
  )
}
function bufferedResponse(text: string) {
  const result = new Response(text, { headers: { 'Content-Type': 'text/event-stream' } })
  Object.defineProperty(result, 'body', { value: null })
  return result
}

afterEach(() => vi.unstubAllGlobals())

describe('实时同场对话传输', () => {
  it('handles UTF-8 byte splits, CRLF, keep-alives and merged frames in order', async () => {
    const frames =
      ': keep-alive\r\n\r\n' +
      event('status', { phase: 'directing' }, '\r\n') +
      event('director', director) +
      event('message', message, '\r\n') +
      event('done', reply)
    const fetch = vi.fn().mockResolvedValue(response(frames, Array(180).fill(1)))
    vi.stubGlobal('fetch', fetch)
    const received: SceneStreamEvent[] = []
    const result = await streamSceneChat(body, (entry) => received.push(entry))
    expect(received.map((entry) => entry.type)).toEqual(['status', 'director', 'message', 'done'])
    expect(received[2].data).toEqual(message)
    expect(result.snapshot.stateVersion).toBe(8)
    expect(fetch).toHaveBeenCalledWith(
      '/api/chat/scene/stream',
      expect.objectContaining({
        credentials: 'include',
        method: 'POST',
        body: JSON.stringify(body),
        headers: expect.objectContaining({ Accept: 'text/event-stream' }),
      }),
    )
  })
  it('accepts buffered SSE without a response stream using one POST', async () => {
    const fetch = vi.fn().mockResolvedValue(bufferedResponse(event('message', message) + event('done', reply)))
    vi.stubGlobal('fetch', fetch)
    const received: SceneStreamEvent[] = []
    expect((await streamSceneChat(body, (entry) => received.push(entry))).director.turnId).toBe('turn-1')
    expect(received.map((entry) => entry.type)).toEqual(['message', 'done'])
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('requires a saved done event in buffered mode', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(bufferedResponse(event('message', message))))
    await expect(streamSceneChat(body, () => undefined)).rejects.toMatchObject({
      code: 'STREAM_INTERRUPTED',
    })
  })
  it('rejects an invalid buffered done event', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(bufferedResponse(event('done', { ...reply, director: { ...director, turnId: 'other' } }))))
    await expect(streamSceneChat(body, () => undefined)).rejects.toMatchObject({ code: 'STREAM_INVALID' })
  })
  it('does not consider an utterance without a done event a saved turn', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(event('message', message))))
    const received: SceneStreamEvent[] = []
    await expect(streamSceneChat(body, (entry) => received.push(entry))).rejects.toMatchObject({
      code: 'STREAM_INTERRUPTED',
    })
    expect(received.map((entry) => entry.type)).toEqual(['message'])
  })
  it('surfaces server-side conflict events without manufacturing a completion', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          response(event('error', { code: 'STATE_CONFLICT', message: '旅程已更新' })),
        ),
    )
    await expect(streamSceneChat(body, () => undefined)).rejects.toMatchObject({
      code: 'STATE_CONFLICT',
      message: '旅程已更新',
    })
  })
  it('preserves a JSON HTTP denial before the SSE response begins', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ error: { code: 'NPC_UNAVAILABLE', message: '角色尚未登场' } }),
            { status: 409 },
          ),
        ),
    )
    await expect(streamSceneChat(body, () => undefined)).rejects.toMatchObject({
      code: 'NPC_UNAVAILABLE',
      status: 409,
    })
  })
  it('rejects a done event belonging to a different journey or turn', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          response(event('done', { ...reply, director: { ...director, turnId: 'other-turn' } })),
        ),
    )
    const onEvent = vi.fn()
    await expect(streamSceneChat(body, onEvent)).rejects.toMatchObject({ code: 'STREAM_INVALID' })
    expect(onEvent).not.toHaveBeenCalled()
  })
  it('cancels an in-flight response and releases the stream reader', async () => {
    let source: ReadableStreamDefaultController<Uint8Array>
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        init.signal?.addEventListener('abort', () =>
          source.error(new DOMException('Aborted', 'AbortError')),
        )
        return Promise.resolve(
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                source = controller
              },
            }),
            { headers: { 'Content-Type': 'text/event-stream' } },
          ),
        )
      }),
    )
    const controller = new AbortController()
    const result = streamSceneChat(body, () => undefined, controller.signal)
    controller.abort()
    await expect(result).rejects.toBeInstanceOf(ApiError)
    await expect(result).rejects.toMatchObject({ code: 'REQUEST_ABORTED' })
  })
})
