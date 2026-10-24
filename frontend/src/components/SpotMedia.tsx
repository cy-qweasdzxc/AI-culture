import { useEffect, useState } from 'react'
import { sceneVisual } from '@/data/sceneVisuals'
import { api } from '@/services/api'
import { safeSourceUrl } from '@/utils/sourceUrl'

interface Asset {
  id: string; url: string | null; title: string; caption: string; author: string
  source_url: string; license: string; license_url: string; attribution: string; displayable: boolean
}

export default function SpotMedia({ locationId, name }: { locationId: string; name: string }) {
  const [assets, setAssets] = useState<Asset[]>([])
  useEffect(() => {
    let active = true
    setAssets([])
    api.get<{ items: Asset[] }>(`/places/${encodeURIComponent(locationId)}/media`)
      .then((data) => { if (active) setAssets(data.items) })
      .catch(() => { if (active) setAssets([]) })
    return () => { active = false }
  }, [locationId])
  const photo = assets.find((asset) => asset.displayable && asset.url)
  const art = sceneVisual(locationId)
  return <figure className="my-5 overflow-hidden rounded-xl border border-line bg-surface">
    {photo ? <>
      <img src={photo.url!} alt={photo.title} loading="lazy" className="max-h-80 w-full object-contain" />
      <figcaption className="space-y-2 p-4 text-xs leading-6 text-bluegray">
        <p>{photo.title} · 实景照片</p><p>{photo.caption}</p>
        <details><summary className="min-h-11 cursor-pointer leading-[44px]">照片来源与许可</summary>
          <p>作者：{photo.author} · {photo.attribution}</p>
          <a className="inline-link mr-4" href={safeSourceUrl(photo.source_url)} target="_blank" rel="noreferrer">原始文件页面</a>
          <a className="inline-link" href={safeSourceUrl(photo.license_url)} target="_blank" rel="noreferrer">{photo.license}</a>
          <p>图片许可核对不代表文化史实已完成人工审核。</p>
        </details>
      </figcaption>
    </> : <>
      {art && <img src={art.src} alt={`${name}艺术化示意`} className="max-h-64 w-full object-contain" />}
      <figcaption className="p-4 text-xs leading-6 text-bluegray">艺术化示意 · 实景照片待接入；未以插画冒充真实摄影。</figcaption>
    </>}
  </figure>
}
