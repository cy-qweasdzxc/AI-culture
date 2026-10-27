/**
 * 苏州路线可点选提问。问题只覆盖演示种子与现有知识条目；它们是提问入口，
 * 不代表 NPC 必须给出肯定回答，事实仍由服务端 RAG 和证据边界决定。
 */
export type QuestionTopic =
  '街巷生活' | '园林营造' | '历史人物' | '古今建筑' | '史实辨析' | '线索推理'

export interface SuggestedQuestion {
  spotId: string
  topic: QuestionTopic
  text: string
  priority?: boolean
}

export const QUESTION_TOPICS: QuestionTopic[] = [
  '街巷生活',
  '园林营造',
  '历史人物',
  '古今建筑',
  '史实辨析',
  '线索推理',
]

export const SUZHOU_QUESTION_BANK: SuggestedQuestion[] = [
  // 平江路：街巷生活
  {
    spotId: 'pingjiang',
    topic: '街巷生活',
    text: '平江路的河道和街巷怎样组成“双棋盘”？',
  },
  { spotId: 'pingjiang', topic: '街巷生活', text: '“水陆并行、河街相邻”在居民出行上意味着什么？' },
  { spotId: 'pingjiang', topic: '街巷生活', text: '平江古巷里有哪些不同类型的街巷遗存？' },
  { spotId: 'pingjiang', topic: '街巷生活', text: '现有资料能确认平江古巷保存了多少座古桥吗？' },
  // 平江路：人物与历史
  {
    spotId: 'pingjiang',
    topic: '历史人物',
    text: '《平江图》记录的是谁治理下的平江府？现有资料能确认吗？',
  },
  { spotId: 'pingjiang', topic: '历史人物', text: '戴望舒和丁香巷之间有可核实的联系吗？' },
  // 平江路：建筑空间、史实与线索
  { spotId: 'pingjiang', topic: '线索推理', text: '《平江图》是什么？', priority: true },
  { spotId: 'pingjiang', topic: '古今建筑', text: '《平江图》上能辨认出哪些城市空间要素？' },
  {
    spotId: 'pingjiang',
    topic: '古今建筑',
    text: '从《平江图》到今天的平江路，哪些格局延续了下来？',
  },
  { spotId: 'pingjiang', topic: '史实辨析', text: '“《雨巷》写的就是丁香巷”有可靠定论吗？' },
  { spotId: 'pingjiang', topic: '史实辨析', text: '《平江图》碑的年代和地图所绘年代是一回事吗？' },
  {
    spotId: 'pingjiang',
    topic: '线索推理',
    text: '“绍定二年”这条线索能帮我们确认什么？',
  },
  {
    spotId: 'pingjiang',
    topic: '线索推理',
    text: '如果要用《平江图》解释“双棋盘”，应该先看哪类信息？',
  },

  // 耦园
  {
    spotId: 'ouyuan',
    topic: '街巷生活',
    text: '耦园三面临河，旧时访园者可能怎样抵达园门？',
  },
  { spotId: 'ouyuan', topic: '街巷生活', text: '耦园的住宅与花园怎样和临河环境相接？' },
  { spotId: 'ouyuan', topic: '园林营造', text: '耦园为什么形成“东园—中宅—西园”的布局？' },
  { spotId: 'ouyuan', topic: '园林营造', text: '耦园东西两座假山在石材和气质上有什么差别？' },
  {
    spotId: 'ouyuan',
    topic: '历史人物',
    text: '沈秉成和严永华与耦园改名有什么关系？',
  },
  { spotId: 'ouyuan', topic: '历史人物', text: '耦园为什么改名？', priority: true },
  { spotId: 'ouyuan', topic: '历史人物', text: '现有资料能确认沈秉成夫妇为何选择在此偕隐吗？' },
  { spotId: 'ouyuan', topic: '古今建筑', text: '耦园走马楼把园中的哪些部分连在一起？' },
  { spotId: 'ouyuan', topic: '古今建筑', text: '走马楼的“走马”指的是怎样的楼廊结构？' },
  {
    spotId: 'ouyuan',
    topic: '史实辨析',
    text: '耦园原名涉园、后来改名的时间和原因，哪些有资料支持？',
  },
  { spotId: 'ouyuan', topic: '史实辨析', text: '“耦”与“偶”相通是文字解释，还是园名的唯一来历？' },
  { spotId: 'ouyuan', topic: '线索推理', text: '“佳偶”这条线索，能和园中的哪些成双布局对应？' },
  { spotId: 'ouyuan', topic: '线索推理', text: '若要从园名推断园主心意，哪些证据能互相印证？' },

  // 狮子林
  { spotId: 'shizilin', topic: '街巷生活', text: '狮子林对公众开放的时间，现有资料记载是哪一年？' },
  {
    spotId: 'shizilin',
    topic: '街巷生活',
    text: '狮子林从私人园林到公众游园，资料能确认哪些变化？',
  },
  {
    spotId: 'shizilin',
    topic: '园林营造',
    text: '狮子林假山的上、中、下三层如何形成游览变化？',
  },
  { spotId: 'shizilin', topic: '园林营造', text: '太湖石堆叠出的洞壑为什么会让路径显得曲折？' },
  { spotId: 'shizilin', topic: '历史人物', text: '天如禅师的弟子为何为师修建狮子林？' },
  { spotId: 'shizilin', topic: '历史人物', text: '狮子林始建于什么朝代？', priority: true },
  { spotId: 'shizilin', topic: '历史人物', text: '贝润生整修狮子林时，保留或新增了什么？' },
  { spotId: 'shizilin', topic: '古今建筑', text: '狮子林的假山群有哪些可数的空间特征？' },
  {
    spotId: 'shizilin',
    topic: '古今建筑',
    text: '从元代始建到近代整修，狮子林经历了哪些建筑变化？',
  },
  { spotId: 'shizilin', topic: '史实辨析', text: '“真趣”题字的说法属于确证史实还是轶闻？' },
  { spotId: 'shizilin', topic: '史实辨析', text: '关于乾隆题“真趣”，现有资料之间有哪些不同表述？' },
  {
    spotId: 'shizilin',
    topic: '线索推理',
    text: '“九条山路、二十一个洞口”能说明假山怎样组织空间？',
  },
  { spotId: 'shizilin', topic: '线索推理', text: '“假山王国”这个称号，可以用哪些具体信息来解释？' },

  // 拙政园
  {
    spotId: 'zhuozhengyuan',
    topic: '街巷生活',
    text: '拙政园的园史资料记录了哪些面向公众保护的节点？',
  },
  {
    spotId: 'zhuozhengyuan',
    topic: '街巷生活',
    text: '拙政园在1961年和1997年分别获得了什么身份？',
  },
  {
    spotId: 'zhuozhengyuan',
    topic: '园林营造',
    text: '拙政园中部为什么被称作全园精华？',
  },
  {
    spotId: 'zhuozhengyuan',
    topic: '园林营造',
    text: '中部池水、树木和建筑怎样形成以水为主的格局？',
  },
  {
    spotId: 'zhuozhengyuan',
    topic: '历史人物',
    text: '王献臣辞官归乡后，为什么用“拙政”给园子命名？',
  },
  { spotId: 'zhuozhengyuan', topic: '历史人物', text: '文徵明为拙政园留下了哪些图咏？' },
  {
    spotId: 'zhuozhengyuan',
    topic: '古今建筑',
    text: '拙政园东、中、西三部分各自有什么布局线索？',
  },
  {
    spotId: 'zhuozhengyuan',
    topic: '古今建筑',
    text: '远香堂、香洲和小飞虹等景点分布在怎样的园林格局里？',
  },
  {
    spotId: 'zhuozhengyuan',
    topic: '史实辨析',
    text: '文徵明是否直接参与造园设计，现有史料能下定论吗？',
  },
  {
    spotId: 'zhuozhengyuan',
    topic: '史实辨析',
    text: '拙政园是什么时候列入世界遗产的？',
    priority: true,
  },
  {
    spotId: 'zhuozhengyuan',
    topic: '史实辨析',
    text: '“拙政园始建于明正德年间”能对应到哪个大致年代？',
  },
  {
    spotId: 'zhuozhengyuan',
    topic: '线索推理',
    text: '园名里的“拙者之为政”和王献臣的经历如何相互解释？',
  },
  {
    spotId: 'zhuozhengyuan',
    topic: '线索推理',
    text: '把园史、分区和遗产年份放在一起，能拼出怎样的时间线？',
  },

  // 苏州博物馆
  { spotId: 'subo', topic: '街巷生活', text: '苏博馆址与忠王府旧址是什么关系？' },
  { spotId: 'subo', topic: '街巷生活', text: '现有资料能确认忠王府旧址有哪些保存价值吗？' },
  { spotId: 'subo', topic: '园林营造', text: '创意山水园由哪些水景、石景和园林构件组成？' },
  { spotId: 'subo', topic: '园林营造', text: '片石假山妙在哪里？', priority: true },
  { spotId: 'subo', topic: '园林营造', text: '“以壁为纸，以石为绘”具体描述了怎样的叠石效果？' },
  {
    spotId: 'subo',
    topic: '历史人物',
    text: '贝聿铭为苏博新馆设计时，怎样回应苏州传统建筑？',
  },
  { spotId: 'subo', topic: '历史人物', text: '贝聿铭和拙政园之间，现有资料能确认哪些联系？' },
  { spotId: 'subo', topic: '古今建筑', text: '苏博新馆的几何坡顶如何呼应古城天际线？' },
  { spotId: 'subo', topic: '古今建筑', text: '苏博新馆的灰白色调与传统民居意象有什么联系？' },
  { spotId: 'subo', topic: '史实辨析', text: '苏博新馆的设计者和开放时间，资料分别怎么记载？' },
  { spotId: 'subo', topic: '史实辨析', text: '“守园灯”是苏州史实，还是这条路线的剧情创作？' },
  { spotId: 'subo', topic: '线索推理', text: '片石、白墙和拙政园景致之间的“笔断意连”怎么理解？' },
  {
    spotId: 'subo',
    topic: '线索推理',
    text: '把平江图、园林和新馆串起来，哪些线索能讲述城市变化？',
  },
]

/** 当前点位适用的主题，避免展示该地点没有相关资料的问题类别。 */
export function topicsForSpot(spotId: string | null | undefined): QuestionTopic[] {
  if (!spotId) return []
  const present = new Set(
    SUZHOU_QUESTION_BANK.filter((question) => question.spotId === spotId).map(
      (question) => question.topic,
    ),
  )
  return QUESTION_TOPICS.filter((topic) => present.has(topic))
}
