import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/services/api'

afterEach(() => vi.unstubAllGlobals())

describe('read-only API recovery', () => {
  it('retries a transient GET connection failure without replaying a mutation', async () => {
    const fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError('connection unavailable'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ready: true }), {
        headers: { 'Content-Type': 'application/json' },
      }))
    vi.stubGlobal('fetch', fetch)
    await expect(api.get<{ ready: boolean }>('/health')).resolves.toEqual({ ready: true })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls.map((call) => call[1].method)).toEqual([undefined, undefined])
  })

  it('returns a repeated connection failure after two bounded GET retries', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('connection unavailable'))
    vi.stubGlobal('fetch', fetch)
    await expect(api.get('/health')).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('never retries a POST or an HTTP denial', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('connection unavailable'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'NO_ACCESS' } }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }))
    vi.stubGlobal('fetch', fetch)
    await expect(api.post('/journeys/start', {})).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
    expect(fetch).toHaveBeenCalledTimes(1)
    await expect(api.get('/health')).rejects.toMatchObject({ code: 'NO_ACCESS' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
