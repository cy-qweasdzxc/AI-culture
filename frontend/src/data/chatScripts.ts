import type { MockNpcReply } from '@/types'

/**
 * NPC 对话规则（Mock 演示：关键词匹配的规则引擎）。
 * 正式版由后端 NPC Agent + RAG 生成，响应结构与技术方案 11.1 节对齐。
 * 规则越界的输入统一走拒答兜底（技术方案 13.3）。
 */

export interface ChatRule {
  id: string
  npcId: string
  /** 命中任意关键词即候选，按命中数排序取最高 */
  keywords: string[]
  reply: MockNpcReply
  /** 仅特定角色可见的额外回复后缀（角色差异） */
  roleExtra?: Record<string, string>
}

/** 证据不足 / 超出知识边界的统一兜底（技术方案 13.3 固定话术） */
export const REFUSAL_TEXT =
  '现有资料无法确认这一内容。你可以继续探索相关点位，或查看已经审核的文化图鉴。'

export const chatRules: ChatRule[] = [
  // ============ 周伯（平江路）============
  {
    id: 'zb-greet',
    npcId: 'zhou-bo',
    keywords: ['你好', '您好', '在吗', '你是谁', '介绍'],
    reply: {
      dialogue:
        '我姓周，在这条河沿上喝了六十年茶。你顺着平江路往北走，河在左手，街在右手，八百年前就是这个走法。想听什么，坐下来慢慢问。',
      intent: 'greeting',
      emotion: 'pleased',
      evidence_ids: [],
      safety_flag: 'ok',
    },
  },
  {
    id: 'zb-shuangqipan',
    npcId: 'zhou-bo',
    keywords: ['格局', '双棋盘', '水陆', '河街', '平江路'],
    reply: {
      dialogue:
        '看到没有，河和街是并排走的，这叫"水陆并行、河街相邻"，老苏州叫双棋盘。人家前门沿街，后门就是河埠头，买汰烧都靠着这条水。整个苏州古城，数这一段保存得最齐整。',
      intent: 'ask_culture',
      emotion: 'calm',
      evidence_ids: ['kn-shuangqipan'],
      safety_flag: 'ok',
    },
  },
  {
    id: 'zb-pingjiangtu',
    npcId: 'zhou-bo',
    keywords: ['平江图', '碑', '绍定', '年份', '1229', '南宋'],
    reply: {
      dialogue:
        '问《平江图》？那是南宋绍定二年刻的碑，换成公元是 1229 年，如今收在碑刻博物馆。碑上把这座城的街巷水巷刻得清清楚楚，你拿它对照今天的平江路，八九不离十。这四个字你记好，后面用得上。',
      intent: 'ask_culture',
      emotion: 'pleased',
      evidence_ids: ['kn-pingjiangtu'],
      task_action: 'grant_clue',
      clue_id: 'clue-shaoding',
      safety_flag: 'ok',
    },
  },
  {
    id: 'zb-yuxiang',
    npcId: 'zhou-bo',
    keywords: ['雨巷', '丁香', '戴望舒'],
    reply: {
      dialogue:
        '你是说丁香巷吧？戴望舒那首《雨巷》是不是写的这条巷子，说法多了去了，谁也拿不出铁证。我当它是桩美谈，你可别当定论听。',
      intent: 'ask_culture',
      emotion: 'calm',
      evidence_ids: ['kn-yuxiang'],
      safety_flag: 'ok',
    },
  },
  {
    id: 'zb-tea-ticket',
    npcId: 'zhou-bo',
    keywords: ['茶票', '旧票', '茶馆'],
    reply: {
      dialogue:
        '哟，这张票根你还在？临河雅座，看橹船最好的位置。既是有缘人，多送你一句：往北走到大新桥，抬头看看河对岸的屋脊，老房子都是"粉墙黛瓦"，一路看到拙政园去。',
      intent: 'ask_story',
      emotion: 'pleased',
      evidence_ids: [],
      safety_flag: 'ok',
    },
    roleExtra: {
      wanderer: '你这张旧票比我的年纪都稀罕，回头再给你沏一壶。',
    },
  },
  {
    id: 'zb-next',
    npcId: 'zhou-bo',
    keywords: ['怎么走', '下一站', '耦园', '路线', '接下来'],
    reply: {
      dialogue:
        '顺着平江路走到白塔东路，往东一拐就是耦园。那园子三面临水，从前是坐船去的。园艺人阿蘅在那儿，造园的事她比我在行。',
      intent: 'ask_route',
      emotion: 'calm',
      evidence_ids: ['kn-ouyuan-water'],
      safety_flag: 'ok',
    },
  },

  // ============ 阿蘅（耦园 / 狮子林 / 拙政园）============
  {
    id: 'ah-greet',
    npcId: 'a-heng',
    keywords: ['你好', '您好', '你是谁', '介绍'],
    reply: {
      dialogue:
        '我是阿蘅，跟师父在这些园子里修了十几年山和。耦园、狮子林、拙政园，造园的事你尽管问；别的事我不敢乱讲，怕误了你。',
      intent: 'greeting',
      emotion: 'calm',
      evidence_ids: [],
      safety_flag: 'ok',
    },
  },
  {
    id: 'ah-ouyuan',
    npcId: 'a-heng',
    keywords: ['耦园', '耦', '偶', '佳偶', '沈秉成', '涉园'],
    reply: {
      dialogue:
        '耦园原来叫涉园。清末沈秉成买下来扩建，和夫人严永华一起住进来，才改的名。耦，通"偶"，是佳偶的意思。你看它东花园、西花园对着中厅，处处成双，园主人的心思都藏在布局里。园子三面临水，从前访客是坐船来的。',
      intent: 'ask_culture',
      emotion: 'calm',
      evidence_ids: ['kn-ouyuan-jiaou', 'kn-ouyuan-water'],
      task_action: 'grant_clue',
      clue_id: 'clue-ou-zi',
      safety_flag: 'ok',
    },
  },
  {
    id: 'ah-shizilin',
    npcId: 'a-heng',
    keywords: ['狮子林', '假山', '朝代', '元代', '至正', '天如'],
    reply: {
      dialogue:
        '狮子林是元代至正二年建的，1342 年，天如禅师的弟子们为他盖的。满园的湖石假山，钻进去像进迷阵，所以叫"假山王国"。叠山这手艺，讲究"瘦、皱、漏、透"，不是把石头堆高就算数的。',
      intent: 'ask_culture',
      emotion: 'calm',
      evidence_ids: ['kn-shizi-origin'],
      safety_flag: 'ok',
    },
  },
  {
    id: 'ah-zhenqu',
    npcId: 'a-heng',
    keywords: ['乾隆', '真趣', '皇帝'],
    reply: {
      dialogue:
        '"真趣"那两个字，传说是乾隆爷题的，说他在假山里转了半日才出来。这类帝王轶闻，书上和民间讲得都多，你只当掌故听，别当正史。我们干这行的，分得清什么能当依据。',
      intent: 'ask_culture',
      emotion: 'calm',
      evidence_ids: ['kn-zhenqu'],
      safety_flag: 'ok',
    },
  },
  {
    id: 'ah-zhuozheng',
    npcId: 'a-heng',
    keywords: ['拙政园', '王献臣', '拙者', '正德', '命名', '园名'],
    reply: {
      dialogue:
        '拙政园是明正德年间王献臣辞官回乡建的。名字从潘岳《闲居赋》里来，"拙者之为政"，是自谦，也是自适。园子以水为中心，亭台都贴着水面走，这是明代文人园的章法。',
      intent: 'ask_culture',
      emotion: 'calm',
      evidence_ids: ['kn-zhuozheng-origin'],
      safety_flag: 'ok',
    },
  },
  {
    id: 'ah-wenzhengming',
    npcId: 'a-heng',
    keywords: ['文徵明', '文征明', '图咏', '设计'],
    reply: {
      dialogue:
        '文徵明和王献臣是好友，给园子画过图咏，诗文都传下来了，这是他实打实留下的。但你要问他是不是参与了造园设计、参与多深，记载对不上，学界也没个准话。我只能说：图咏是真的，参与程度存争议。',
      intent: 'ask_culture',
      emotion: 'evasive',
      evidence_ids: ['kn-wenzhengming'],
      safety_flag: 'ok',
    },
  },
  {
    id: 'ah-pianshi',
    npcId: 'a-heng',
    keywords: ['片石', '湖石', '叠山', '石头', '苏博'],
    reply: {
      dialogue:
        '好假山不是堆出来的，是"叠"出来的。这片湖石你收着——回头到了苏博，看看贝先生那面白墙前的片石假山，你就知道石头到了高手手里，能变成一幅画。',
      intent: 'ask_culture',
      emotion: 'pleased',
      evidence_ids: ['kn-pianshi'],
      task_action: 'grant_clue',
      clue_id: 'clue-pianshi',
      safety_flag: 'ok',
    },
  },

  // ============ 小沈（苏博）============
  {
    id: 'xs-greet',
    npcId: 'xiao-shen',
    keywords: ['你好', '您好', '你是谁', '介绍'],
    reply: {
      dialogue:
        '你好，我是馆里的观众教育员小沈。苏博的建筑和藏品都可以问我。先说好规矩：有定论的我讲定论，有争议的我标争议，我不确定的就直说不确定。',
      intent: 'greeting',
      emotion: 'calm',
      evidence_ids: [],
      safety_flag: 'ok',
    },
  },
  {
    id: 'xs-bei',
    npcId: 'xiao-shen',
    keywords: ['贝聿铭', '建筑', '新馆', '设计', '2006'],
    reply: {
      dialogue:
        '新馆是贝聿铭先生设计的，2006 年 10 月开放。你看它的屋顶，是几何形的坡顶，灰白两色，这是在呼应苏州民居的天际线。贝先生自己是苏州人，他说过要让这栋建筑"不高、不大、不突出"，融进古城里去。',
      intent: 'ask_culture',
      emotion: 'calm',
      evidence_ids: ['kn-subo-bei'],
      safety_flag: 'ok',
    },
  },
  {
    id: 'xs-pianshi',
    npcId: 'xiao-shen',
    keywords: ['片石', '假山', '白墙', '以壁为纸', '庭园', '山水'],
    reply: {
      dialogue:
        '主庭园那面白墙，贝先生是当宣纸用的——"以壁为纸，以石为绘"，把石头切成片叠上去，借米芾山水画的意。这是传统造园语言的现代写法。这张照片你收好，那八个字，等你把路上的线索凑齐了，自己对出下联。',
      intent: 'ask_culture',
      emotion: 'pleased',
      evidence_ids: ['kn-pianshi'],
      task_action: 'grant_clue',
      clue_id: 'clue-baibi',
      safety_flag: 'ok',
    },
  },
  {
    id: 'xs-zhongwangfu',
    npcId: 'xiao-shen',
    keywords: ['忠王府', '太平天国', '旧址'],
    reply: {
      dialogue:
        '馆址里包含了太平天国忠王府旧址，是保存得比较完整的太平天国时期王府建筑。新馆挨着它盖，一新一旧并排放着，这本身就是展品的一部分。',
      intent: 'ask_culture',
      emotion: 'calm',
      evidence_ids: ['kn-zhongwangfu'],
      safety_flag: 'ok',
    },
  },
  {
    id: 'xs-shijieyichan',
    npcId: 'xiao-shen',
    keywords: ['世界遗产', '世遗', '遗产', '1997', '联合国'],
    reply: {
      dialogue:
        '1997 年，拙政园、留园、网师园、环秀山庄作为苏州古典园林的代表列入《世界遗产名录》，2000 年狮子林、耦园等又作为扩展项目列入。这条路线上的三座园子，全在名录里。',
      intent: 'ask_culture',
      emotion: 'pleased',
      evidence_ids: ['kn-shijieyichan'],
      safety_flag: 'ok',
    },
  },
  {
    id: 'xs-deng',
    npcId: 'xiao-shen',
    keywords: ['守园灯', '灯', '尾声', '结局'],
    reply: {
      dialogue:
        '守园灯是这条路线留给你的一个念想——它是剧情里的意象，不是史实，这一点我要讲清楚。传说点亮它的人，会把一路的故事继续讲下去。等你准备好，就来找我进入尾声。',
      intent: 'ask_story',
      emotion: 'calm',
      evidence_ids: ['kn-shouyuandeng'],
      safety_flag: 'ok',
    },
  },
]

/** 按 NPC 返回当前阶段的推荐选项（2-4 个） */
export function suggestedChoices(npcId: string, hasClue: (id: string) => boolean): string[] {
  switch (npcId) {
    case 'zhou-bo':
      return [
        '平江路的格局有什么讲究？',
        '《平江图》是什么？',
        hasClue('clue-tea-ticket') ? '周伯，您认得这张茶票吗？' : '丁香巷和《雨巷》有关系吗？',
        '下一站往哪儿走？',
      ]
    case 'a-heng':
      return ['耦园为什么改名？', '狮子林的假山有名在哪里？', '拙政园的名字怎么来的？', '什么样的假山才算好？']
    case 'xiao-shen':
      return ['贝聿铭是怎么设计新馆的？', '片石假山妙在哪里？', '苏州园林和世界遗产的关系？', '守园灯是什么？']
    default:
      return []
  }
}
