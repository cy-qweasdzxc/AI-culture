import { useEffect, useRef, useState } from 'react'
import SchematicMap from '@/components/SchematicMap'
import type { Spot, SpotStatus } from '@/types'

/**
 * 腾讯地图 GL JS 封装（合规底图）。
 * 密钥策略（不内置任何真实密钥）：
 *  - 配置了 VITE_TMAP_KEY：使用用户自行申请的密钥加载（生产部署路径）；
 *  - 未配置：直接降级为示意路线，不访问无密钥代理。
 * 加载失败时通过 onUnavailable 回调让上层降级为示意图。
 */

interface TMapLatLng {
  getLat(): number
  getLng(): number
}

interface TMapNS {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => TMapMap
  LatLng: new (lat: number, lng: number) => TMapLatLng
  MultiMarker: new (opts: Record<string, unknown>) => {
    setGeometries(g: unknown[]): void
    on(e: string, cb: (evt: { geometry?: { id?: string } }) => void): void
    off?(e: string, cb: (evt: { geometry?: { id?: string } }) => void): void
    setMap?(map: null): void
  }
  MultiPolyline: new (opts: Record<string, unknown>) => { setMap?(map: null): void }
  MarkerStyle: new (opts: Record<string, unknown>) => object
  PolylineStyle: new (opts: Record<string, unknown>) => object
}

interface TMapMap {
  setCenter(c: TMapLatLng): void
  setZoom(z: number): void
  resize?(): void
  destroy(): void
  on(e: string, cb: () => void): void
}

declare global {
  interface Window {
    TMap?: TMapNS
    _TMapSecurityConfig?: { serviceHost: string }
  }
}

const STATUS_COLOR: Record<SpotStatus, { bg: string; fg: string; glyph: string }> = {
  undiscovered: { bg: '#8b8b8b', fg: '#ffffff', glyph: '?' },
  discovered: { bg: '#B08D57', fg: '#ffffff', glyph: '!' },
  current: { bg: '#A6352B', fg: '#ffffff', glyph: '●' },
  completed: { bg: '#1E5A46', fg: '#ffffff', glyph: '✓' },
}

function hasCoordinates(spot: Spot): boolean {
  return (
    Number.isFinite(spot.lat) &&
    Number.isFinite(spot.lng) &&
    Math.abs(spot.lat) <= 90 &&
    Math.abs(spot.lng) <= 180
  )
}

function markerIcon(status: SpotStatus): string {
  const c = STATUS_COLOR[status]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40"><path d="M15 1C7.8 1 2 6.8 2 14c0 9.5 11 24 12.4 25.5a1 1 0 0 0 1.2 0C17 38 28 23.5 28 14 28 6.8 22.2 1 15 1z" fill="${c.bg}" stroke="#fff" stroke-width="1.5"/><text x="15" y="18" text-anchor="middle" font-size="13" fill="${c.fg}" font-family="sans-serif">${c.glyph}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

let loaderPromise: Promise<void> | null = null

function loadTMap(): Promise<void> {
  if (window.TMap) return Promise.resolve()
  if (loaderPromise) return loaderPromise
  const key = import.meta.env.VITE_TMAP_KEY as string | undefined
  if (!key) return Promise.reject(new Error('未配置地图密钥'))
  const existing = [...document.scripts].find((script) => {
    try { const url = new URL(script.src); return url.origin === 'https://map.qq.com' && url.pathname === '/api/gljs' }
    catch { return false }
  })
  const script = existing ?? document.createElement('script')
  const promise = new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      window.clearTimeout(timeout)
      script.removeEventListener('load', loaded)
      script.removeEventListener('error', failed)
      if (error) { script.remove(); reject(error) }
      else resolve()
    }
    const loaded = () => finish(window.TMap ? undefined : new Error('在线地图 SDK 未能就绪'))
    const failed = () => finish(new Error('在线地图 SDK 加载失败'))
    const timeout = window.setTimeout(() => finish(new Error('在线地图加载超时')), 10000)
    script.addEventListener('load', loaded, { once: true })
    script.addEventListener('error', failed, { once: true })
    if (!existing) {
      script.async = true
      script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${encodeURIComponent(key)}`
      document.head.appendChild(script)
    }
  })
  loaderPromise = promise.catch((error: unknown) => {
    loaderPromise = null
    throw error
  })
  return loaderPromise
}

interface MapViewProps {
  routeGeometry?: { lat: number; lng: number }[]
  spots: Spot[]
  spotStatus: Record<string, SpotStatus>
  onSpotClick?: (spotId: string) => void
  onUnavailable: (reason: string) => void
}

export default function MapView({ spots, spotStatus, onSpotClick, onUnavailable, routeGeometry }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const callbacks = useRef({ onSpotClick, onUnavailable })
  callbacks.current = { onSpotClick, onUnavailable }
  const statuses = useRef(spotStatus)
  statuses.current = spotStatus
  const markersRef = useRef<InstanceType<TMapNS['MultiMarker']> | null>(null)
  const [ready, setReady] = useState(false)
  // Include coordinates and names: an edited point must update the route as well as its marker.
  const mapData = JSON.stringify({ spots: spots.filter(hasCoordinates).map(({ id, name, lat, lng }) => ({ id, name, lat, lng })), routeGeometry })

  useEffect(() => {
    let cancelled = false
    let map: TMapMap | null = null
    let markers: InstanceType<TMapNS['MultiMarker']> | null = null
    let line: InstanceType<TMapNS['MultiPolyline']> | null = null
    let observer: ResizeObserver | undefined
    const data = JSON.parse(mapData) as { spots: Pick<Spot, 'id' | 'name' | 'lat' | 'lng'>[]; routeGeometry?: { lat: number; lng: number }[] }
    const clicked = (event: { geometry?: { id?: string } }) => {
      const id = event.geometry?.id
      if (id && data.spots.some((spot) => spot.id === id) && (statuses.current[id] ?? 'undiscovered') !== 'undiscovered')
        callbacks.current.onSpotClick?.(id)
    }
    const dispose = () => {
      observer?.disconnect()
      markers?.off?.('click', clicked)
      markers?.setMap?.(null)
      line?.setMap?.(null)
      markersRef.current = null
      markers = null; line = null
      map?.destroy(); map = null
    }
    setReady(false)
    if (!data.spots.length) {
      callbacks.current.onUnavailable('点位坐标暂不可用')
      return
    }
    loadTMap().then(() => {
      if (cancelled || !containerRef.current || !window.TMap) return
      const TMap = window.TMap
      const first = data.spots[0]
      map = new TMap.Map(containerRef.current, { center: new TMap.LatLng(first.lat, first.lng), zoom: 15 })
      const route = data.routeGeometry ?? data.spots
      if (route.some((point) => !hasCoordinates(point as Spot))) throw new Error('Invalid route coordinates')
      if (route.length > 1) line = new TMap.MultiPolyline({
        map, styles: { route: new TMap.PolylineStyle({ color: '#A6352B', width: 3, borderWidth: 1, borderColor: '#ffffff' }) },
        geometries: [{ id: 'route', styleId: 'route', paths: route.map((point) => new TMap.LatLng(point.lat, point.lng)) }],
      })
      const styles: Record<string, object> = {}
      for (const status of Object.keys(STATUS_COLOR) as SpotStatus[])
        styles[status] = new TMap.MarkerStyle({ src: markerIcon(status), width: 30, height: 40 })
      markers = new TMap.MultiMarker({ map, styles, geometries: data.spots.map((spot) => ({
        id: spot.id, styleId: statuses.current[spot.id] ?? 'undiscovered',
        position: new TMap.LatLng(spot.lat, spot.lng), properties: { title: spot.name },
      })) })
      markers.on('click', clicked)
      markersRef.current = markers
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => map?.resize?.())
        observer.observe(containerRef.current)
      }
      setReady(true)
    }).catch((error: unknown) => {
      if (cancelled) return
      dispose()
      const known = ['未配置地图密钥', '在线地图 SDK 未能就绪', '在线地图 SDK 加载失败', '在线地图加载超时']
      callbacks.current.onUnavailable(error instanceof Error && known.includes(error.message) ? error.message : '在线地图暂不可用')
    })
    return () => { cancelled = true; dispose() }
  }, [mapData])

  useEffect(() => {
    if (!ready || !markersRef.current || !window.TMap) return
    const TMap = window.TMap
    markersRef.current.setGeometries(spots.filter(hasCoordinates).map((spot) => ({
      id: spot.id, styleId: spotStatus[spot.id] ?? 'undiscovered',
      position: new TMap.LatLng(spot.lat, spot.lng), properties: { title: spot.name },
    })))
  }, [spotStatus, spots, ready])

  return (
    <div className="relative h-full w-full bg-paper-deep">
      <div ref={containerRef} className="absolute inset-0" aria-label="文化路线地图" />
      {ready && <button type="button" className="absolute bottom-2 right-2 min-h-11 rounded border border-line bg-surface px-3 text-xs text-inkgreen"
        onClick={() => onUnavailable('已选择示意路线')}>使用示意路线</button>}
      {!ready && (
        <div className="absolute inset-0 bg-paper-deep">
          <SchematicMap spots={spots} spotStatus={spotStatus} onSpotClick={onSpotClick} />
          <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface px-4 py-2">
            <p role="status" className="text-xs text-bluegray">
              正在载入在线地图，示意路线已可操作。
            </p>
            <button
              type="button"
              className="min-h-11 text-xs font-medium text-inkgreen underline underline-offset-4"
              onClick={() => onUnavailable('已选择示意路线')}
            >
              使用示意路线
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
