import { safeSourceUrl } from '@/utils/sourceUrl'

export default function SourceStatus({ trustLevel, reviewStatus, sourceUrl, license }: {
  trustLevel?: string; reviewStatus?: string; sourceUrl?: string | null; license?: string
}) {
  const label = reviewStatus === 'reviewed' && trustLevel === 'human_reviewed'
    ? '已记录人工审核'
    : trustLevel === 'auto_published' ? '自动发布 · 未人工核验' : '未核验或待人工确认'
  const url = safeSourceUrl(sourceUrl)
  return <div className="mt-2 space-y-1 text-xs text-bluegray">
    <p>{label}</p>
    {url ? <a href={url} target="_blank" rel="noreferrer" className="inline-link break-all">查看原始来源</a> : <p>原始来源链接待补充</p>}
    {license && <p>许可：{license}</p>}
  </div>
}
