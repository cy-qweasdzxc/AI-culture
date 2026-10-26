/**
 * API 客户端封装：统一 /api 前缀、JSON 编解码与稳定错误码处理。
 * 约定见 docs/api-contract.md：错误不得暴露内部堆栈，按 error.code 分支处理。
 */
import type { SceneChatReply, SceneStreamEvent } from '@/types'

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 45000)
  try {
    const res = await fetch(`/api${path}`, {
      credentials: 'include',
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      signal: init?.signal ?? controller.signal,
    })
    if (!res.ok) {
      const body = (await res.json().catch((error: unknown) => {
        if (controller.signal.aborted) throw error
        return {}
      })) as {
        error?: { code?: string; message?: string }
        code?: string
        message?: string
      }
      throw new ApiError(
        body.error?.code ?? body.code ?? 'UNKNOWN',
        body.error?.message ?? body.message ?? '请求失败，请重试。',
        res.status,
      )
    }
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(
      error instanceof DOMException && error.name === 'AbortError'
        ? 'REQUEST_TIMEOUT'
        : 'NETWORK_ERROR',
      '服务暂时无法连接，请重试。旅程进度以服务端记录为准。',
      0,
    )
  } finally {
    window.clearTimeout(timeout)
  }
}

async function retryGet<T>(path: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await request<T>(path)
    } catch (error) {
      if (
        attempt >= 2 ||
        !(error instanceof ApiError) ||
        error.code !== 'NETWORK_ERROR'
      ) throw error
      await new Promise((resolve) => window.setTimeout(resolve, attempt === 0 ? 200 : 500))
    }
  }
}

export const api = {
  get: <T>(path: string) => retryGet<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(data ?? {}) }),
  patch: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
  put: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(data) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

export interface SceneChatRequest {
  journey_id: string
  state_version: number
  request_id: string
  npc_id: string
  message: string
  participant_ids: string[]
}

/** Read completed agent utterances as SSE. Only `done` confirms a saved scene turn. */
export async function streamSceneChat(
  body: SceneChatRequest,
  onEvent: (event: SceneStreamEvent) => void,
  signal?: AbortSignal,
): Promise<SceneChatReply> {
  const controller = new AbortController()
  let timedOut = false
  const abort = () => controller.abort()
  if (signal?.aborted) abort()
  else signal?.addEventListener('abort', abort, { once: true })
  const timeout = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, 210000)
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    const response = await fetch('/api/chat/scene/stream', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as {
        error?: { code?: string; message?: string }
      }
      throw new ApiError(
        error.error?.code ?? 'UNKNOWN',
        error.error?.message ?? '同场对话暂不可用，请重试。',
        response.status,
      )
    }
    if (!response.headers.get('content-type')?.includes('text/event-stream'))
      throw new ApiError('STREAM_INVALID', '对话连接格式异常，请重试。', response.status)
    let buffer = ''
    let result: SceneChatReply | undefined
    const consume = (frame: string) => {
      let name = 'message'
      const data: string[] = []
      for (const line of frame.split(/\r?\n/)) {
        if (line.startsWith('event:')) name = line.slice(6).trim()
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
      }
      if (!data.length) return
      if (!['status', 'director', 'message', 'done', 'error'].includes(name)) return
      let value: unknown
      try {
        value = JSON.parse(data.join('\n'))
      } catch {
        throw new ApiError('STREAM_INVALID', '收到的对话片段不完整，请重新同步旅程。', 0)
      }
      if (!value || typeof value !== 'object')
        throw new ApiError('STREAM_INVALID', '收到的对话片段格式异常。', 0)
      if (name === 'error') {
        const error = value as { code?: string; message?: string }
        throw new ApiError(
          error.code ?? 'SCENE_FAILED',
          error.message ?? '本轮对话未完成，请重试。',
          0,
        )
      }
      if (name === 'done') {
        const reply = value as SceneChatReply
        if (
          !reply.snapshot ||
          !reply.director ||
          !Array.isArray(reply.messages) ||
          reply.snapshot.journeyId !== body.journey_id ||
          !Number.isInteger(reply.snapshot.stateVersion) ||
          reply.snapshot.stateVersion < body.state_version ||
          reply.director.turnId !== body.request_id
        )
          throw new ApiError('STREAM_INVALID', '对话尚未确认保存，请重新同步旅程。', 0)
        result = reply
      }
      onEvent({ type: name, data: value } as SceneStreamEvent)
    }
    const append = (text: string) => {
      buffer += text
      if (buffer.length > 8 * 1024 * 1024)
        throw new ApiError('STREAM_TOO_LARGE', '对话内容过长，请重新同步旅程。', 0)
      let separator = /\r?\n\r?\n/.exec(buffer)
      while (separator && !result) {
        consume(buffer.slice(0, separator.index))
        buffer = buffer.slice(separator.index + separator[0].length)
        separator = /\r?\n\r?\n/.exec(buffer)
      }
    }
    // Some embedded browsers expose fetch without a readable response stream.
    // Read the same POST response once; never send a second scene turn.
    if (response.body?.getReader && typeof TextDecoder !== 'undefined') {
      reader = response.body.getReader()
      const decoder = new TextDecoder()
      while (!result) {
        const chunk = await reader.read()
        append(decoder.decode(chunk.value, { stream: !chunk.done }))
        if (chunk.done) break
      }
    } else {
      append(await response.text())
    }
    if (!result && buffer.trim()) consume(buffer)
    if (!result)
      throw new ApiError(
        'STREAM_INTERRUPTED',
        '连接在本轮保存确认前中断，正在同步旅程，请稍后重试。',
        0,
      )
    return result
  } catch (error) {
    if (controller.signal.aborted)
      throw new ApiError(
        timedOut ? 'REQUEST_TIMEOUT' : 'REQUEST_ABORTED',
        timedOut
          ? '本轮等待超时，请同步旅程后重试。'
          : '已停止接收本轮对话，旅程以服务端保存的记录为准。',
        0,
      )
    if (error instanceof ApiError) throw error
    throw new ApiError('NETWORK_ERROR', '对话连接暂时中断，请同步旅程后重试。', 0)
  } finally {
    window.clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
    if (reader) {
      await reader.cancel().catch(() => undefined)
      reader.releaseLock()
    }
  }
}
