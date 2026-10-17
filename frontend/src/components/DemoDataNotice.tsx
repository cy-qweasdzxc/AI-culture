/** 真实性声明条：自动发布的数据仍需明确标注其审核边界。 */
export default function DemoDataNotice() {
  return (
    <p className="rounded-md border border-bronze/40 bg-bronze/10 px-3 py-2 text-xs leading-relaxed text-ink-soft">
      演示资料 · 自动发布：史实 / 争议 / 传说 / 虚构为内容分类，不能等同于人工核验或授权审查。
      当前内容可用于文化问答；证据不足时仍会明确拒答，剧情、谜题与图鉴用于开发演示。
    </p>
  )
}
