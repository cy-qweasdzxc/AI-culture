/** 人物视觉设定。位图头像加载失败时，仍以专属印章字和色调兜底。 */
export type PersonaTone = 'cinnabar' | 'inkgreen' | 'bronze' | 'bluegray' | 'ink'

export interface PersonaVisual {
  /** 印章用字：取人物姓名中最具辨识度的一个字 */
  char: string
  /** 色调：朱砂 / 墨绿 / 古铜 / 青灰 / 墨 */
  tone: PersonaTone
  /** 项目内生成头像；public 目录下使用绝对 URL。 */
  avatarSrc: string
  /** 本次头像生成采用的人设提示词，便于后续复现和迭代。 */
  portraitPrompt: string
}

export const personaVisuals: Record<string, PersonaVisual> = {
  // NPC（虚构角色）
  'zhou-bo': {
    char: '周',
    tone: 'inkgreen',
    avatarSrc: '/assets/personas/zhou-bo.webp',
    portraitPrompt:
      '周伯，约68岁的平江路老茶客，银灰短发、温暖而有岁月感的面容，穿青灰棉布外套，手持素瓷茶盏；健谈、念旧、爱考人。背景隐约可见临河茶馆、白墙黛瓦与石桥。克制的中国水墨与矿物设色半写实人物肖像，宣纸肌理，非动漫。',
  },
  'a-heng': {
    char: '蘅',
    tone: 'bronze',
    avatarSrc: '/assets/personas/a-heng.webp',
    portraitPrompt:
      '阿蘅，约38岁的苏州园艺女工匠，低束发、沉静专注，穿深橄榄色实用工装，手持园艺麻绳；细致、话少、对手艺较真。背景为月洞门、太湖石与竹影。克制的中国水墨与矿物设色半写实人物肖像，宣纸肌理，非动漫。',
  },
  'xiao-shen': {
    char: '沈',
    tone: 'bluegray',
    avatarSrc: '/assets/personas/xiao-shen.webp',
    portraitPrompt:
      '小沈，约27岁的苏州博物馆青年馆员，齐肩黑发、神情温和可信，穿深蓝现代馆员外套与米白衬衣；严谨、温和、引经据典。背景为苏博白墙、深灰几何屋面与片石山水。克制的中国水墨与矿物设色半写实人物肖像，宣纸肌理，非动漫。',
  },
  // 玩家角色
  scholar: {
    char: '澜',
    tone: 'ink',
    avatarSrc: '/assets/personas/scholar.webp',
    portraitPrompt:
      '沈观澜，约34岁的城市史寻访学者，短黑发、细圆眼镜，穿炭灰旅行外套与米白立领衫，手持空白拓片纸卷；耐心、考据、安静好奇。背景为江南窗边书案、碑拓纹理与水巷光影。克制的中国水墨与矿物设色半写实人物肖像，宣纸肌理，非古装。',
  },
  wanderer: {
    char: '客',
    tone: 'ink',
    avatarSrc: '/assets/personas/wanderer.webp',
    portraitPrompt:
      '阿蘅姐的故交，约32岁的风雅闲客，中性而温和的气质，松束长发，穿石青旅行外套与旧铜色围巾，手持无字旧茶票；慢游、敏锐、略带神秘。背景为水巷花窗、茶烟与虚化石桥。克制的中国水墨与矿物设色半写实人物肖像。',
  },
  apprentice: {
    char: '满',
    tone: 'ink',
    avatarSrc: '/assets/personas/apprentice.webp',
    portraitPrompt:
      '小满，约21岁的见习园主，黑发高束、目光明亮，穿苔绿色实用工装，腰间系一把素铜钥匙；认真、灵动、爱学手艺。背景为园艺工坊、竹影、太湖石与木制工具架。克制的中国水墨与矿物设色半写实人物肖像，明确为青年成人。',
  },
}

/** 取人物视觉标识；未知 id 退回姓名首字，保证任何数据都能渲染。 */
export function personaVisual(id: string | null | undefined, name: string): PersonaVisual {
  const known = id ? personaVisuals[id] : undefined
  if (known) return known
  return {
    char: name.trim().slice(0, 1) || '文',
    tone: 'ink',
    avatarSrc: '',
    portraitPrompt: '',
  }
}
