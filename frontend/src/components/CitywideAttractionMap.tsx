import { useEffect, useRef, useState } from 'react'
import { loadTMap, type TMapMap, type TMapNS } from '@/services/tmap'
import StreetMapOverlay, { STREET_MAP_NOTICE } from '@/components/StreetMapOverlay'

export interface CitywidePlace {
  id: string; name: string; lat: number; lng: number; district: string; category: string
  address: string; intro: string; note: string; tags: string[]; source_name: string
  source_url: string; source_checked_at: string; playable: false
}
interface Props { places: CitywidePlace[]; selectedId: string; onSelect: (id: string) => void }

export default function CitywideAttractionMap({ places, selectedId, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<TMapMap | null>(null)
  const select = useRef(onSelect)
  select.current = onSelect
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [streetMap, setStreetMap] = useState(false)
  const data = JSON.stringify(places.map(({ id, name, lat, lng }) => ({ id, name, lat, lng })))
  useEffect(() => {
    const points = JSON.parse(data) as CitywidePlace[]
    let cancelled = false
    let map: TMapMap | null = null
    let markers: InstanceType<TMapNS['MultiMarker']> | null = null
    let observer: ResizeObserver | undefined
    const clicked = (event: { geometry?: { id?: string } }) => {
      if (event.geometry?.id && points.some((p) => p.id === event.geometry?.id)) select.current(event.geometry.id)
    }
    const dispose = () => {
      observer?.disconnect(); markers?.off?.('click', clicked); markers?.setMap?.(null)
      markers = null; map?.destroy(); map = null; mapRef.current = null
    }
    setReady(false); setError('')
    if (!import.meta.env.VITE_TMAP_KEY || !points.length) return
    loadTMap().then(() => {
      if (cancelled || !container.current || !window.TMap) return
      const sdk = window.TMap
      map = new sdk.Map(container.current, { center: new sdk.LatLng(31.45, 120.6), zoom: 8 })
      mapRef.current = map
      const icon = '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40"><circle cx="15" cy="17" r="12" fill="#A6352B" stroke="white" stroke-width="2"/></svg>'
      markers = new sdk.MultiMarker({ map, styles: { preview: new sdk.MarkerStyle({ src: `data:image/svg+xml,${encodeURIComponent(icon)}`, width: 30, height: 40 }) },
        geometries: points.map((p) => ({ id: p.id, styleId: 'preview', position: new sdk.LatLng(p.lat, p.lng), properties: { title: p.name } })) })
      markers.on('click', clicked)
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => map?.resize?.()); observer.observe(container.current)
      }
      setReady(true)
    }).catch(() => { if (!cancelled) { dispose(); setError('在线地图暂不可用，已使用坐标示意。') } })
    return () => { cancelled = true; dispose() }
  }, [data, attempt])
  useEffect(() => {
    const point = places.find((p) => p.id === selectedId)
    if (ready && point && window.TMap) {
      mapRef.current?.setCenter(new window.TMap.LatLng(point.lat, point.lng)); mapRef.current?.setZoom(13)
    }
  }, [selectedId, places, ready])
  const minLat = Math.min(...places.map((p) => p.lat), 31.1), maxLat = Math.max(...places.map((p) => p.lat), 31.7)
  const minLng = Math.min(...places.map((p) => p.lng), 120.2), maxLng = Math.max(...places.map((p) => p.lng), 121)
  return <section className="min-w-0 rounded-lg border border-line p-3" aria-label="全域景点分布">
    <p className="text-xs leading-6 text-bluegray">近似坐标 · 未核验入口 · 非导航；可从地图标记或景点列表选择。</p>
    {streetMap && <div className="h-[420px]"><StreetMapOverlay points={places} focusId={selectedId} onClose={() => setStreetMap(false)} /></div>}
    <div ref={container} className={`h-72 w-full ${ready && !streetMap ? '' : 'hidden'}`} aria-label="苏州全域在线地图" />
    {!ready && !streetMap && <>
      <p role="status" className="my-2 text-xs leading-6">{error || '坐标分布示意（非地理底图），列表和资料仍可使用。'}</p>
      <svg viewBox="0 0 600 340" className="h-auto w-full rounded bg-paper-deep" role="group" aria-label="苏州全域景点坐标示意">
        {places.map((place) => <g key={place.id} transform={`translate(${30 + (place.lng - minLng) / (maxLng - minLng) * 540}, ${310 - (place.lat - minLat) / (maxLat - minLat) * 280})`}
          role="button" tabIndex={0} aria-label={`地图点位：${place.name}`} onClick={() => onSelect(place.id)}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(place.id) } }}>
          <circle r="14" fill="transparent" /><circle r={place.id === selectedId ? 7 : 4} fill={place.id === selectedId ? '#A6352B' : '#1E5A46'} />
          <title>{place.name}</title>
        </g>)}
      </svg>
      {error && <button className="inline-link min-h-11" type="button" onClick={() => setAttempt((n) => n + 1)}>重新加载全域地图</button>}
    </>}
    {!streetMap && places.length > 0 && <div className="mt-3 border-t border-line pt-3 text-xs leading-6 text-bluegray">
      <p>{STREET_MAP_NOTICE}</p><button className="inline-link min-h-11" type="button" onClick={() => setStreetMap(true)}>加载全域街道底图</button>
    </div>}
    {!places.length && <p className="text-sm">当前筛选没有可显示的点位。</p>}
  </section>
}
