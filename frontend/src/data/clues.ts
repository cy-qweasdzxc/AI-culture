import type { Clue } from '@/types'

/** 线索与道具（演示数据）。部分由任务奖励或 NPC 对话获得。 */
export const clues: Clue[] = [
  {
    id: 'clue-tuopian',
    name: '平江图残页',
    kind: 'clue',
    description: '半页碑刻拓片的影印件，边角写着"绍定二年"四个字。学者沈观澜的随身之物。',
    fromSpotId: 'pingjiang',
  },
  {
    id: 'clue-tea-ticket',
    name: '茶馆旧票',
    kind: 'item',
    description: '一张泛黄的茶馆旧票，票根印着"临河雅座"。周伯认得它。',
    fromSpotId: 'pingjiang',
  },
  {
    id: 'clue-tong-key',
    name: '铜钥匙',
    kind: 'item',
    description: '一把磨得发亮的铜钥匙，师父说"园子的门好开，看园子的眼难开"。',
  },
  {
    id: 'clue-shaoding',
    name: '纪年卡「绍定二年」',
    kind: 'clue',
    description: '周伯写给你的小卡：南宋绍定二年，即公元 1229 年，《平江图》碑刻成。',
    fromSpotId: 'pingjiang',
  },
  {
    id: 'clue-ou-zi',
    name: '「耦」字笺',
    kind: 'clue',
    description: '阿蘅递来的一张字笺：耦，通"偶"。园子改名那年，主人夫妇正当年。',
    fromSpotId: 'ouyuan',
  },
  {
    id: 'clue-pianshi',
    name: '一片湖石',
    kind: 'item',
    description: '阿蘅送你的一小片湖石：好假山不是堆出来的，是"叠"出来的。到了苏博，你会想起它。',
    fromSpotId: 'zhuozhengyuan',
  },
  {
    id: 'clue-baibi',
    name: '白壁照片',
    kind: 'clue',
    description: '小沈给你看的一张照片：苏博主庭园的白墙，"以壁为纸"的下半句，要你自己对上。',
    fromSpotId: 'subo',
  },
]

export const clueById = new Map(clues.map((c) => [c.id, c]))
