/**
 * 人物视觉标识：印章式头像的用字与色调。
 *
 * 约束（技术方案视觉节）：只用设计令牌中的语义色，不引入位图资源；身份区分不能只靠颜色，
 * 因此每个人物都有专属用字（与颜色共同构成两重标识）。
 */
export type PersonaTone = 'cinnabar' | 'inkgreen' | 'bronze' | 'bluegray' | 'ink'

export interface PersonaVisual {
  /** 印章用字：取人物姓名中最具辨识度的一个字 */
  char: string
  /** 色调：朱砂 / 墨绿 / 古铜 / 青灰 / 墨 */
  tone: PersonaTone
}

export const personaVisuals: Record<string, PersonaVisual> = {
  // NPC（虚构角色）
  'zhou-bo': { char: '周', tone: 'inkgreen' },
  'a-heng': { char: '蘅', tone: 'bronze' },
  'xiao-shen': { char: '沈', tone: 'bluegray' },
  // 玩家角色
  scholar: { char: '澜', tone: 'ink' },
  wanderer: { char: '客', tone: 'ink' },
  apprentice: { char: '满', tone: 'ink' },
}

/** 取人物视觉标识；未知 id 退回姓名首字，保证任何数据都能渲染。 */
export function personaVisual(id: string | null | undefined, name: string): PersonaVisual {
  const known = id ? personaVisuals[id] : undefined
  if (known) return known
  return { char: name.trim().slice(0, 1) || '文', tone: 'ink' }
}
