import type { Ending } from '@/types'

/**
 * 结局配置（演示数据，3 个，满足"至少 2 个结局"）。
 * 判定规则（正式版由后端执行）：
 *  - 全部任务完成 + 选择「挂灯」→ cheng-huai
 *  - 全部任务完成 + 选择「收灯」→ qu-jing
 *  - 未全部完成即进入尾声 → wei-jin
 */
export const endings: Ending[] = [
  {
    id: 'cheng-huai',
    name: '澄怀观道',
    category: '完整探索型',
    narrative:
      '你把守园灯挂上了长廊。灯亮起来的那一刻，平江路的橹声、耦园的水影、狮子林的石峰、拙政园的荷风，都一一亮了起来。小沈说，每一位点亮守园灯的人，都会成为这条路的讲述者。你走完了全部五个点位，解开了六道谜题，这条八百年的水巷，从此有了一位新的守灯人。',
    conditionText: '完成全部 6 个任务，并在尾声选择「把灯挂上长廊」',
  },
  {
    id: 'qu-jing',
    name: '曲径归舟',
    category: '分支选择型',
    narrative:
      '你把守园灯轻轻收进行囊。有些故事不必急着讲给别人，先在心底养一养。你循着来路走回平江路，夜色里的河面映着灯影，像一页没写完的《平江图》。你解开了全部六道谜题，这条路已经属于你了——下一次带谁来，讲哪一段，都由你定。',
    conditionText: '完成全部 6 个任务，并在尾声选择「把灯收进行囊」',
  },
  {
    id: 'wei-jin',
    name: '未尽之约',
    category: '未尽探索型',
    narrative:
      '你提前走到了尾声。守园灯还挂在长廊尽头，等你把它点亮。小沈把灯替你留着："这条路不急，回去把没走完的点位走完，没解开的谜解开，灯一直在这里。"水巷深处，还有几扇门你没有推开。',
    conditionText: '未完成全部任务便进入尾声',
  },
]

export const endingById = new Map(endings.map((e) => [e.id, e]))

/** 尾声关键选择 */
export const finalChoices = [
  {
    key: 'hang',
    label: '把灯挂上长廊',
    detail: '把这一路的故事，讲给更多人听',
  },
  {
    key: 'keep',
    label: '把灯收进行囊',
    detail: '把故事留给自己，慢慢消化',
  },
] as const
