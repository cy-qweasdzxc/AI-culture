import { useEffect, useState } from 'react'
import ResilientImage from '@/components/ResilientImage'
import { sceneVisual } from '@/data/sceneVisuals'
import { api } from '@/services/api'
import { safeSourceUrl } from '@/utils/sourceUrl'

interface Asset {
  kind: 'photograph' | 'illustration'
  id: string; url: string | null; title: string; caption: string; author: string
  source_url: string; license: string; license_url: string; attribution: string; displayable: boolean
}
interface Props { locationId: string; name: string }

function Credits({ asset, unavailable = false }: { asset: Asset; unavailable?: boolean }) {
  const source = safeSourceUrl(asset.source_url)
  const license = safeSourceUrl(asset.license_url)
  return <div className="space-y-2">
    <p>{asset.title}{unavailable ? '（未能显示）' : ''} · {asset.kind === 'photograph' ? '实景照片' : '艺术化示意'}</p>
    <p>{asset.caption}</p>
    <details><summary className="min-h-11 cursor-pointer leading-[44px]">照片来源与许可</summary>
      <p>作者：{asset.author || '待确认'} · {asset.attribution}</p>
      {source && <a className="inline-link mr-4" href={source} target="_blank" rel="noreferrer">原始文件页面</a>}
      {license ? <a className="inline-link" href={license} target="_blank" rel="noreferrer">{asset.license || '许可待确认'}</a> : <span>许可待确认</span>}
    </details>
  </div>
}

function PlaceMedia({ locationId, name }: Props) {
  const [assets, setAssets] = useState<Asset[]>([])
  const [failedUrls, setFailedUrls] = useState<string[]>([])
  const [attempt, setAttempt] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    setLoading(true); setError(false)
    api.get<{ items: Asset[] }>(`/places/${encodeURIComponent(locationId)}/media`)
      .then((data) => { if (active) setAssets(data.items) })
      .catch(() => { if (active) { setAssets([]); setError(true) } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [locationId, attempt])
  const available = assets.filter((asset) => asset.displayable && asset.url)
  const ordered = [...available.filter((asset) => asset.kind === 'photograph'),
    ...available.filter((asset) => asset.kind === 'illustration')]
  const slides = ordered.filter((asset) => !failedUrls.includes(asset.url!))
  const selected = slides.find((asset) => asset.id === activeId) ?? slides[0]
  const selectedIndex = selected ? slides.indexOf(selected) : 0
  const move = (offset: number) => {
    if (slides.length) setActiveId(slides[(selectedIndex + offset + slides.length) % slides.length].id)
  }
  const failed = ordered.filter((asset) => failedUrls.includes(asset.url!))
  const art = sceneVisual(locationId)
  return <figure className="spot-media-carousel my-5 min-w-0 overflow-hidden rounded-xl border border-line bg-surface" aria-label={`${name}图片`}>
    <div className="relative aspect-[4/3] w-full bg-paper-deep">
      {selected ? <img key={selected.url} src={selected.url!} alt={selected.title} loading="lazy"
        className="h-full w-full object-contain" onError={() => setFailedUrls((urls) =>
          urls.includes(selected.url!) ? urls : [...urls, selected.url!])} />
        : <ResilientImage key={attempt} src={art?.src} alt={`${name}艺术化示意`} className="h-full w-full object-contain" />}
      {slides.length > 1 && <>
        <button type="button" className="spot-media-arrow spot-media-prev" onClick={() => move(-1)} aria-label="上一张图片">‹</button>
        <button type="button" className="spot-media-arrow spot-media-next" onClick={() => move(1)} aria-label="下一张图片">›</button>
        <div className="spot-media-dots" aria-label="图片切换">
          {slides.map((asset, index) => <button key={asset.id} type="button" className={index === selectedIndex ? 'is-active' : ''}
            onClick={() => setActiveId(asset.id)} aria-label={`查看第 ${index + 1} 张图片`} aria-current={index === selectedIndex} />)}
        </div>
      </>}
    </div>
    <figcaption className="space-y-2 p-4 text-xs leading-6 text-bluegray">
      {loading && <p role="status">正在加载图片资料…</p>}
      {selected ? <Credits asset={selected} /> : <p>场景插画 · 艺术化示意</p>}
      {(failed.length > 0 || error) && <>
        <p role="status">{error ? '图片资料暂时无法加载。' : '照片加载失败，已尝试使用艺术化示意。'}任务、对话和虚拟游览仍可继续。</p>
        <button type="button" className="inline-link min-h-11" disabled={loading} onClick={() => {
          setActiveId(null); setFailedUrls([]); setAttempt((value) => value + 1)
        }}>重新加载图片</button>
      </>}
      {failed.map((asset) => <div key={asset.id} className="border-t border-line pt-2">
        <p>未能显示的图片：</p><Credits asset={asset} unavailable />
      </div>)}
    </figcaption>
  </figure>
}

export default function SpotMedia(props: Props) {
  // A place switch must discard the previous place's photo before the next paint.
  return <PlaceMedia key={props.locationId} {...props} />
}
