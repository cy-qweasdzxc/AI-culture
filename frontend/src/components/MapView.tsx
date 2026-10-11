import { useEffect, useRef, useState } from 'react'
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
  }
  MultiPolyline: new (opts: Record<string, unknown>) => object
  MarkerStyle: new (opts: Record<string, unknown>) => object
  PolylineStyle: new (opts: Record<string, unknown>) => object
}

interface TMapMap {
  setCenter(c: TMapLatLng): void
  setZoom(z: number): void
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

function markerIcon(status: SpotStatus): string {
  const c = STATUS_COLOR[status]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40"><path d="M15 1C7.8 1 2 6.8 2 14c0 9.5 11 24 12.4 25.5a1 1 0 0 0 1.2 0C17 38 28 23.5 28 14 28 6.8 22.2 1 15 1z" fill="${c.bg}" stroke="#fff" stroke-width="1.5"/><text x="15" y="18" text-anchor="middle" font-size="13" fill="${c.fg}" font-family="sans-serif">${c.glyph}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

let loaderPromise: Promise<void> | null = null

function loadTMap(): Promise<void> {
  if (window.TMap) return Promise.resolve()
  if (loaderPromise) return loaderPromise
  loaderPromise = new Promise((resolve, reject) => {
    const key = import.meta.env.VITE_TMAP_KEY as string | undefined
    if (!key) {
      reject(new Error('未配置地图密钥'))
      return
    }
    const script = document.createElement('script')
    script.src = key
      ? `https://map.qq.com/api/gljs?v=1.exp&key=${encodeURIComponent(key)}`
      : 'https://map.qq.com/api/gljs?v=1.exp'
    script.onload = () => (window.TMap ? resolve() : reject(new Error('TMap 未就绪')))
    script.onerror = () => reject(new Error('腾讯地图 SDK 加载失败'))
    document.head.appendChild(script)
  })
  return loaderPromise
}

interface MapViewProps {
  spots: Spot[]
  spotStatus: Record<string, SpotStatus>
  onSpotClick?: (spotId: string) => void
  onUnavailable: (reason: string) => void
}

export default function MapView({ spots, spotStatus, onSpotClick, onUnavailable }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<TMapMap | null>(null)
  const markersRef = useRef<{ setGeometries(g: unknown[]): void } | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadTMap()
      .then(() => {
        if (cancelled || !containerRef.current || !window.TMap) return
        const TMap = window.TMap
        const map = new TMap.Map(containerRef.current, {
          center: new TMap.LatLng(31.3212, 120.6335),
          zoom: 15,
        })
        mapRef.current = map

        new TMap.MultiPolyline({
          map,
          styles: {
            route: new TMap.PolylineStyle({
              color: '#A6352B',
              width: 3,
              borderWidth: 1,
              borderColor: '#ffffff',
            }),
          },
          geometries: [
            {
              id: 'route',
              styleId: 'route',
              paths: spots.map((s) => new TMap.LatLng(s.lat, s.lng)),
            },
          ],
        })

        const styles: Record<string, object> = {}
        for (const st of Object.keys(STATUS_COLOR) as SpotStatus[]) {
          styles[st] = new TMap.MarkerStyle({ src: markerIcon(st), width: 30, height: 40 })
        }
        const markers = new TMap.MultiMarker({
          map,
          styles,
          geometries: spots.map((s) => ({
            id: s.id,
            styleId: spotStatus[s.id] ?? 'undiscovered',
            position: new TMap.LatLng(s.lat, s.lng),
            properties: { title: s.name },
          })),
        })
        markers.on('click', (evt) => {
          const id = evt?.geometry?.id
          if (id && onSpotClick) onSpotClick(id)
        })
        markersRef.current = markers
        setReady(true)
      })
      .catch((err: Error) => {
        if (!cancelled) onUnavailable(err.message)
      })
    return () => {
      cancelled = true
      mapRef.current?.destroy()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spots.map((spot) => spot.id).join(',')])

  // 点位状态变化 → 更新标记样式
  useEffect(() => {
    if (!ready || !markersRef.current || !window.TMap) return
    const TMap = window.TMap
    markersRef.current.setGeometries(
      spots.map((s) => ({
        id: s.id,
        styleId: spotStatus[s.id] ?? 'undiscovered',
        position: new TMap.LatLng(s.lat, s.lng),
        properties: { title: s.name },
      })),
    )
  }, [spotStatus, spots, ready])

  return <div ref={containerRef} className="h-full w-full" aria-label="文化路线地图" />
}
