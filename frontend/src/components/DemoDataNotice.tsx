/** 真实性声明条：占位/演示数据必须在界面明示（技术方案红线） */
export default function DemoDataNotice() {
  return (
    <p className="rounded-md border border-bronze/40 bg-bronze/10 px-3 py-2 text-xs leading-relaxed text-ink-soft">
      演示数据说明：当前文化内容为公开常识级示例，标注了史实 / 争议 / 传说 / 虚构四级；正式版本全部内容需经人工审核后入库，AI
      回答必须附证据引用，证据不足时明确拒答。
    </p>
  )
}
