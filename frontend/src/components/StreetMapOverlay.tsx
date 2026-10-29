import { useEffect, useRef, useState } from 'react'
import { streetMapUrl, type StreetMapPoint } from '@/services/streetMap'
export type { StreetMapPoint } from '@/services/streetMap'

export const STREET_MAP_NOTICE = '点击后将连接 OpenStreetMap，发送当前显示点位的近似坐标；不读取你的实时位置。'

/** Mount only after an explicit user choice; never geolocates or unlocks a station. */
export default function StreetMapOverlay({ points, focusId, onClose }: {
  points: StreetMapPoint[]; focusId?: string; onClose: () => void
}) {
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const frame = useRef<HTMLIFrameElement | null>(null)
  const url = streetMapUrl(points, focusId)
  useEffect(() => {
    setFailed(false)
    timer.current = window.setTimeout(() => setFailed(true), 12000)
    return () => window.clearTimeout(timer.current)
  }, [url, attempt])
  useEffect(() => {
    const element = frame.current
    const onError = () => { window.clearTimeout(timer.current); setFailed(true) }
    element?.addEventListener('error', onError)
    return () => element?.removeEventListener('error', onError)
  }, [url, attempt, failed])
  return <section className="street-map-overlay flex h-full min-h-0 flex-col bg-paper-deep" aria-label="可选街道底图">
    <div className="flex min-h-0 flex-1 items-center justify-center">
      {url && !failed ? <iframe ref={frame} key={`${url}-${attempt}`} title="OpenStreetMap 街道底图" src={url}
        className="h-full min-h-40 w-full border-0" referrerPolicy="no-referrer"
        onLoad={() => window.clearTimeout(timer.current)} />
        : <p role="status" className="p-4 text-sm">街道底图暂不可用，仍可返回示意路线和点位列表继续游览。</p>}
    </div>
    <div className="shrink-0 border-t border-line bg-surface p-3 text-xs leading-6 text-bluegray">
      <p>点位为近似坐标，坐标系可能存在偏差；仅供街巷参考，不用于导航、实地定位或任务触发。</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <a className="inline-link inline-flex min-h-11 items-center" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · 来源与许可</a>
        <div className="flex flex-wrap gap-3">
          {failed && url && <button className="inline-link min-h-11" type="button" onClick={() => setAttempt((value) => value + 1)}>重试街道底图</button>}
          <button className="inline-link min-h-11" type="button" onClick={onClose}>返回示意图</button>
        </div>
      </div>
    </div>
  </section>
}
