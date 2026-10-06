import type { Role } from '@/types'

/**
 * 玩家角色（虚构身份，界面中明确标注）。
 * 角色差异影响：NPC 称呼、初始线索、部分对话选项与结局文案变量。
 */
export const roles: Role[] = [
  {
    id: 'scholar',
    name: '沈观澜',
    identity: '寻访学者（虚构身份）',
    tagline: '带着半页残碑拓片来的考据人',
    description:
      '你研究城市史多年，此行是为核对一段关于《平江图》的记载。NPC 会称你"先生"，对话中更容易引出文献与年代线索。',
    perk: '初始持有线索「平江图残页」：可提前查看《平江图》相关证据。',
    storyEffect: 'NPC 以"先生"相称；涉及碑刻、世遗的对话会给出更具体的出处。',
    startClueId: 'clue-tuopian',
    isFictional: true,
  },
  {
    id: 'wanderer',
    name: '阿蘅姐的故交',
    identity: '风雅闲客（虚构身份）',
    tagline: '为一口茶、一窗景而来的慢游者',
    description:
      '你不赶时间，只想把这条水巷走慢一些。NPC 会把你当作老熟人，对话中更容易听到掌故与传说。',
    perk: '初始持有道具「茶馆旧票」：周伯会对你多说一段巷子里的旧事。',
    storyEffect: 'NPC 以"你"亲切相称；传说类内容更容易触发，传说会明确标注。',
    startClueId: 'clue-tea-ticket',
    isFictional: true,
  },
  {
    id: 'apprentice',
    name: '小满',
    identity: '见习园主（虚构身份）',
    tagline: '揣着一把铜钥匙的造园学徒',
    description:
      '你拜在一位老园艺人门下学手艺，师父让你把这条路线上的园子挨个看明白。NPC 会考你，也会教你。',
    perk: '初始持有道具「铜钥匙」：可提前开启一个点位任务的提示。',
    storyEffect: 'NPC 以"小满"相称；造园工艺类对话会多出追问选项。',
    startClueId: 'clue-tong-key',
    isFictional: true,
  },
]

export const roleById = new Map(roles.map((r) => [r.id, r]))
