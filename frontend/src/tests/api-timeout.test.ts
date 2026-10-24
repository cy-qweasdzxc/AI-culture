import { afterEach, expect, it, vi } from 'vitest'
import { api } from '@/services/api'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

it('keeps the request deadline active while a response body is stalled and permits retry', async () => {
  vi.useFakeTimers()
  let bodyAborted = false
  const fetch = vi.fn(async (_url, options: RequestInit) => ({
    ok: true, status: 200,
    json: () => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => {
        bodyAborted = true
        reject(new DOMException('aborted', 'AbortError'))
      }, { once: true })
    }),
  }))
  vi.stubGlobal('fetch', fetch)
  const pending = api.get('/journeys/current').catch((error: unknown) => error)
  await vi.advanceTimersByTimeAsync(45001)
  expect(bodyAborted).toBe(true)
  await expect(pending).resolves.toMatchObject({ code: 'REQUEST_TIMEOUT' })
  fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ snapshot: null }) })
  await expect(api.get('/journeys/current')).resolves.toEqual({ snapshot: null })
})
