/** 真实性声明条：自动发布的数据仍需明确标注其审核边界。 */
export default function DemoDataNotice() {
  return (
    <p className="rounded-md border border-bronze/40 bg-bronze/10 px-3 py-2 text-xs leading-relaxed text-ink-soft">
      工程演示：史实 / 争议 / 传说 / 虚构为内容分类，自动发布不等同于人工核验。
      文化问答仅使用符合审核约束的证据；资料不足时会明确拒答。剧情、谜题与积分用于体验，不代表科学验证的学习成绩。
    </p>
  )
}
