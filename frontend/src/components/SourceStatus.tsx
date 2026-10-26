import { safeSourceUrl } from '@/utils/sourceUrl'

export default function SourceStatus({ trustLevel, reviewStatus, sourceUrl, license, isDemo, isFictional, citationCurrent, humanReviewVerified }: {
  trustLevel?: string; reviewStatus?: string; sourceUrl?: string | null; license?: string
  isDemo?: boolean; isFictional?: boolean; citationCurrent?: boolean; humanReviewVerified?: boolean
}) {
  const label = citationCurrent === false
    ? '历史引用 · 当前审核或版本已失效'
    : reviewStatus === 'rejected' ? '已拒绝或撤审 · 不用于事实检索'
    : isDemo ? '演示资料 · 未经人工事实核验'
    : reviewStatus === 'reviewed' && trustLevel === 'human_reviewed' && isDemo === false && humanReviewVerified === true
      ? '已记录人工审核'
      : trustLevel === 'auto_published' ? '自动发布 · 未人工核验' : '未核验或待人工确认'
  const url = safeSourceUrl(sourceUrl)
  return <div className="mt-2 space-y-1 text-xs text-bluegray">
    <p>{label}</p>
    {isFictional && <p>剧情虚构 · 不作为文化史实</p>}
    {url ? <a href={url} target="_blank" rel="noreferrer" className="inline-link break-all">查看原始来源</a> : <p>原始来源链接待补充</p>}
    {license && <p>许可：{license}</p>}
  </div>
}
