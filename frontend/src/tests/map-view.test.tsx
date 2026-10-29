import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Spot } from '@/types'

const spots: Spot[] = [{ id: 'fixture', name: '合成点位', shortName: '点位', order: 1,
  lat: 31.3, lng: 120.6, triggerRadiusM: 50, intro: '', story: '', taskIds: [], codexIds: [] }]
beforeEach(() => { vi.resetModules(); vi.stubEnv('VITE_TMAP_KEY', 'synthetic-public-key') })
afterEach(() => {
  cleanup(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); delete window.TMap
  document.querySelectorAll('script[src*="map.qq.com"]').forEach(script => script.remove())
})
it('allows a later mount to retry after the SDK script failed', async () => {
  const MapView = (await import('@/components/MapView')).default
  const unavailable = vi.fn()
  const view = render(<MapView spots={spots} spotStatus={{ fixture: 'discovered' }} onUnavailable={unavailable} />)
  const first = document.querySelector('script[src*="map.qq.com"]')!
  expect(first).not.toBeNull()
  fireEvent.error(first)
  await waitFor(() => expect(unavailable).toHaveBeenCalled())
  view.unmount()
  render(<MapView spots={spots} spotStatus={{ fixture: 'discovered' }} onUnavailable={vi.fn()} />)
  await waitFor(() => expect(document.querySelector('script[src*="map.qq.com"]')).not.toBe(first))
})

function sdk() {
  const instance = { destroy: vi.fn(), resize: vi.fn(), setCenter: vi.fn(), setZoom: vi.fn(), on: vi.fn() }
  const markers = { on: vi.fn(), off: vi.fn(), setMap: vi.fn(), setGeometries: vi.fn() }
  const line = { setMap: vi.fn() }
  const namespace = {
    Map: vi.fn(function () { return instance }),
    LatLng: class { constructor(public lat: number, public lng: number) {} getLat() { return this.lat } getLng() { return this.lng } },
    MultiMarker: vi.fn(function () { return markers }),
    MultiPolyline: vi.fn(function () { return line }),
    MarkerStyle: vi.fn(function () { return {} }), PolylineStyle: vi.fn(function () { return {} }),
  }
  return { namespace, instance, markers, line }
}
function install(value: ReturnType<typeof sdk>) { window.TMap = value.namespace as unknown as NonNullable<Window['TMap']> }
it('missing key uses the schematic without adding an SDK script', async () => {
  vi.stubEnv('VITE_TMAP_KEY', '')
  const MapView = (await import('@/components/MapView')).default
  const unavailable = vi.fn()
  render(<MapView spots={spots} spotStatus={{ fixture: 'discovered' }} onUnavailable={unavailable} />)
  await waitFor(() => expect(unavailable).toHaveBeenCalledWith('未配置地图密钥'))
  expect(document.querySelector('script[src*="map.qq.com"]')).toBeNull()
})
it('reuses an existing loading script and cleans up map events and resize observation', async () => {
  const MapView = (await import('@/components/MapView')).default
  const script = document.createElement('script'); script.src = 'https://map.qq.com/api/gljs?v=1.exp&key=synthetic-public-key'; document.head.appendChild(script)
  const value = sdk()
  const disconnect = vi.fn()
  let resized: () => void = () => undefined
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { resized = callback } observe() {} disconnect = disconnect })
  const click = vi.fn()
  const view = render(<MapView spots={spots} spotStatus={{ fixture: 'discovered' }} onUnavailable={vi.fn()} onSpotClick={click} />)
  expect(document.querySelectorAll('script[src*="map.qq.com"]')).toHaveLength(1)
  install(value); fireEvent.load(script)
  await waitFor(() => expect(value.namespace.Map).toHaveBeenCalledTimes(1))
  const handler = value.markers.on.mock.calls[0][1] as (event: { geometry: { id: string } }) => void
  handler({ geometry: { id: 'fixture' } }); expect(click).toHaveBeenCalledWith('fixture')
  handler({ geometry: { id: 'not-in-this-route' } }); expect(click).toHaveBeenCalledTimes(1)
  resized(); expect(value.instance.resize).toHaveBeenCalledTimes(1)
  view.unmount()
  expect(value.instance.destroy).toHaveBeenCalledTimes(1)
  expect(value.markers.off).toHaveBeenCalledWith('click', handler)
  expect(disconnect).toHaveBeenCalledTimes(1)
})
it('does not construct a map after unmount while the SDK is still loading', async () => {
  const MapView = (await import('@/components/MapView')).default
  const view = render(<MapView spots={spots} spotStatus={{ fixture: 'discovered' }} onUnavailable={vi.fn()} />)
  const script = document.querySelector('script[src*="map.qq.com"]')!
  view.unmount(); const value = sdk(); install(value); fireEvent.load(script)
  await act(async () => { await Promise.resolve() })
  expect(value.namespace.Map).not.toHaveBeenCalled()
})
it('times out once and lets the next mount start a fresh SDK attempt', async () => {
  vi.useFakeTimers()
  const MapView = (await import('@/components/MapView')).default
  const unavailable = vi.fn()
  const view = render(<MapView spots={spots} spotStatus={{ fixture: 'discovered' }} onUnavailable={unavailable} />)
  const first = document.querySelector('script[src*="map.qq.com"]')!
  await act(async () => { await vi.advanceTimersByTimeAsync(10001) })
  expect(unavailable).toHaveBeenCalledWith('在线地图加载超时')
  expect(unavailable).toHaveBeenCalledTimes(1)
  expect(first.isConnected).toBe(false)
  view.unmount()
  render(<MapView spots={spots} spotStatus={{ fixture: 'discovered' }} onUnavailable={vi.fn()} />)
  expect(document.querySelector('script[src*="map.qq.com"]')).not.toBeNull()
})
it('updates routes after coordinate changes without leaking old map instances', async () => {
  const MapView = (await import('@/components/MapView')).default
  const value = sdk(); install(value)
  const routeSpots = [...spots, { ...spots[0], id: 'second', order: 2, lat: 31.31 }]
  const unavailable = vi.fn()
  const view = render(<MapView spots={routeSpots} spotStatus={{ fixture: 'discovered', second: 'undiscovered' }} onUnavailable={unavailable} />)
  await waitFor(() => expect(value.namespace.MultiPolyline).toHaveBeenCalledTimes(1))
  view.rerender(<MapView spots={routeSpots.map(spot => ({ ...spot, lat: spot.lat + 0.01 }))} spotStatus={{ fixture: 'discovered' }} onUnavailable={unavailable} />)
  await waitFor(() => expect(value.namespace.MultiPolyline).toHaveBeenCalledTimes(2))
  expect(value.instance.destroy).toHaveBeenCalledTimes(1)
  expect(value.line.setMap).toHaveBeenCalledWith(null)
})
it('invalid coordinates and constructor errors degrade without leaking key text', async () => {
  const MapView = (await import('@/components/MapView')).default
  const unavailable = vi.fn()
  const view = render(<MapView spots={[{ ...spots[0], lat: Number.NaN }]} spotStatus={{ fixture: 'discovered' }} onUnavailable={unavailable} />)
  await waitFor(() => expect(unavailable).toHaveBeenCalledWith('点位坐标暂不可用'))
  view.unmount()
  const value = sdk(); value.namespace.Map.mockImplementation(function () { throw new Error('synthetic-secret-key') }); install(value)
  render(<MapView spots={spots} spotStatus={{ fixture: 'discovered' }} onUnavailable={unavailable} />)
  await waitFor(() => expect(unavailable).toHaveBeenCalledWith('在线地图暂不可用'))
  expect(JSON.stringify(unavailable.mock.calls)).not.toContain('synthetic-secret-key')
})
it('an invalid SDK response can be retried without a duplicate script', async () => {
  const MapView = (await import('@/components/MapView')).default
  const unavailable = vi.fn()
  render(<MapView spots={spots} spotStatus={{ fixture: 'discovered' }} onUnavailable={unavailable} />)
  fireEvent.load(document.querySelector('script[src*="map.qq.com"]')!)
  await waitFor(() => expect(unavailable).toHaveBeenCalledWith('在线地图 SDK 未能就绪'))
  expect(document.querySelectorAll('script[src*="map.qq.com"]')).toHaveLength(0)
})

it('shares one SDK download between two maps without constructing after either unmount', async () => {
  const MapView = (await import('@/components/MapView')).default
  const first = render(<MapView spots={spots} spotStatus={{ fixture: 'discovered' }} onUnavailable={vi.fn()} />)
  const second = render(<MapView spots={spots} spotStatus={{ fixture: 'discovered' }} onUnavailable={vi.fn()} />)
  expect(document.querySelectorAll('script[src*="map.qq.com"]')).toHaveLength(1)
  first.unmount()
  const value = sdk(); install(value)
  fireEvent.load(document.querySelector('script[src*="map.qq.com"]')!)
  await waitFor(() => expect(value.namespace.Map).toHaveBeenCalledTimes(1))
  second.unmount()
  expect(value.instance.destroy).toHaveBeenCalledTimes(1)
})

it('focuses a selected disclosed station without rebuilding the SDK map or unlocking a hidden station', async () => {
  const MapView = (await import('@/components/MapView')).default
  const value = sdk(); install(value)
  const second = { ...spots[0], id: 'second', order: 2, lat: 31.32, lng: 120.65 }
  const routeSpots = [...spots, second]
  const props = { spots: routeSpots, spotStatus: { fixture: 'current', second: 'discovered' } as const, onUnavailable: vi.fn() }
  const view = render(<MapView {...props} focusSpotId="fixture" />)
  await waitFor(() => expect(value.instance.setCenter).toHaveBeenCalled())
  value.instance.setCenter.mockClear()
  view.rerender(<MapView {...props} focusSpotId="second" />)
  await waitFor(() => expect(value.instance.setCenter).toHaveBeenCalledWith(expect.objectContaining({ lat: 31.32, lng: 120.65 })))
  expect(value.instance.setZoom).toHaveBeenCalledWith(17)
  expect(value.namespace.Map).toHaveBeenCalledTimes(1)
  value.instance.setCenter.mockClear()
  view.rerender(<MapView {...props} spots={[...routeSpots]} spotStatus={{ ...props.spotStatus }} focusSpotId="second" />)
  expect(value.instance.setCenter).not.toHaveBeenCalled()
  view.rerender(<MapView {...props} spotStatus={{ fixture: 'current', second: 'undiscovered' }} focusSpotId="second" />)
  expect(value.instance.setCenter).not.toHaveBeenCalled()
})
