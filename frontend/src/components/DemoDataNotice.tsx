/** 真实性声明条：占位/演示数据必须在界面明示（技术方案红线） */
export default function DemoDataNotice() {
  return (
    <p className="rounded-md border border-bronze/40 bg-bronze/10 px-3 py-2 text-xs leading-relaxed text-ink-soft">
      演示资料 · 待人工审核：史实 / 争议 / 传说 / 虚构为内容分类，不能替代来源核验与授权审查。
      未审核资料不用于正式文化问答；当前剧情、谜题与图鉴用于开发演示，证据不足时明确拒答。
    </p>
  )
}
