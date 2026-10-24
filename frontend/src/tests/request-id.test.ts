import { afterEach, expect, test, vi } from 'vitest'
import { createRequestId } from '@/utils/requestId'

afterEach(() => vi.unstubAllGlobals())

test('HTTP LAN without randomUUID still creates independent valid idempotency keys', () => {
  let sequence = 0
  vi.stubGlobal('crypto', {
    getRandomValues: (bytes: Uint8Array) => { bytes.fill(++sequence); return bytes },
  })
  const first = createRequestId()
  const second = createRequestId()
  expect(first).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/)
  expect(second).not.toBe(first)
})

test('HTTPS uses the platform UUID implementation', () => {
  const randomUUID = vi.fn(() => 'b6c09941-9670-45d2-9549-cab5f21c2317')
  vi.stubGlobal('crypto', { randomUUID })
  expect(createRequestId()).toBe('b6c09941-9670-45d2-9549-cab5f21c2317')
  expect(randomUUID).toHaveBeenCalledOnce()
})
