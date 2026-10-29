import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import CitywideAttractionMap from '@/components/CitywideAttractionMap'
import { loadTMap } from '@/services/tmap'
vi.mock('@/services/tmap', () => ({ loadTMap: vi.fn() }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })
const place = { id: 'p', name: '合成景点', lat: 31.3, lng: 120.6, district: '', category: '', address: '', intro: '', note: '', tags: [], source_name: '', source_url: '', source_checked_at: '', playable: false as const }
it('keeps the map container mounted before the SDK resolves and releases it on unmount', async () => {
  vi.stubEnv('VITE_TMAP_KEY', 'synthetic-test-only'); vi.mocked(loadTMap).mockResolvedValue()
  const destroy = vi.fn(), off = vi.fn(), setMap = vi.fn(), on = vi.fn()
  const Map = vi.fn(function (element) { expect(element).toBeInstanceOf(HTMLElement); return { destroy, setCenter: vi.fn(), setZoom: vi.fn() } })
  vi.stubGlobal('TMap', { Map, LatLng: vi.fn(function () { return {} }), MarkerStyle: vi.fn(function () { return {} }), MultiMarker: vi.fn(function () { return { on, off, setMap } }) })
  const { unmount } = render(<CitywideAttractionMap places={[place]} selectedId="p" onSelect={vi.fn()} />)
  await waitFor(() => expect(screen.getByLabelText('苏州全域在线地图')).not.toHaveClass('hidden'))
  expect(Map).toHaveBeenCalledTimes(1); unmount(); expect(destroy).toHaveBeenCalledTimes(1); expect(off).toHaveBeenCalledTimes(1)
})
it('a failed SDK keeps the coordinate diagram usable and allows explicit retry', async () => {
  vi.stubEnv('VITE_TMAP_KEY', 'synthetic-test-only'); vi.mocked(loadTMap).mockRejectedValue(new Error('synthetic unavailable'))
  render(<CitywideAttractionMap places={[place]} selectedId="p" onSelect={vi.fn()} />)
  expect(await screen.findByText('在线地图暂不可用，已使用坐标示意。')).toBeVisible()
  expect(screen.getByRole('button', { name: '地图点位：合成景点' })).toBeInTheDocument()
})
