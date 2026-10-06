import type { Spot, Theme } from '@/types'

/**
 * 演示主题：苏州古城 · 平江路文化路线。
 * 坐标为 GCJ-02 近似值（演示用途，精确坐标【待核实】后在后台点位管理中维护）。
 */

export const demoTheme: Theme = {
  id: 'suzhou-pingjiang',
  name: '平江寻梦',
  subtitle: '苏州古城文化路线',
  city: '苏州',
  district: '姑苏区 · 平江历史街区',
  description:
    '从平江路的水巷石桥出发，一路走进耦园、狮子林、拙政园，最后抵达苏州博物馆。一条街巷、三座园林、一座新馆，串起苏州八百年的城市记忆。',
  durationMinutes: 120,
  distanceKm: 2.5,
}

/** 路线顺序即点位顺序 */
export const spots: Spot[] = [
  {
    id: 'pingjiang',
    order: 1,
    name: '平江路',
    shortName: '平江路',
    lat: 31.3169,
    lng: 120.6343,
    triggerRadiusM: 150,
    intro: '水陆并行、河街相邻，苏州古城双棋盘格局的活标本。',
    story:
      '南宋绍定二年，一方《平江图》碑刻下了这座城的街巷水巷。八百年后，平江路依然河街并行，桥影相衔。茶馆的周伯在这里坐了一辈子，巷子里的事，他比碑刻记得还细。',
    npcId: 'zhou-bo',
    taskIds: ['task-shuangqipan', 'task-pingjiangtu'],
    codexIds: ['codex-shuangqipan', 'codex-pingjiangtu', 'codex-yuxiang'],
  },
  {
    id: 'ouyuan',
    order: 2,
    name: '耦园',
    shortName: '耦园',
    lat: 31.3199,
    lng: 120.6416,
    triggerRadiusM: 120,
    intro: '"耦"通"偶"，一座藏着偕隐之约的水边园子。',
    story:
      '清末，沈秉成携夫人严永华在此隐居，把园子改名"耦园"。三面临水的小园不事张扬，却把"佳偶"二字藏进了名字里。',
    npcId: 'a-heng',
    taskIds: ['task-jiaou'],
    codexIds: ['codex-ouyuan-jiaou', 'codex-ouyuan-water'],
  },
  {
    id: 'shizilin',
    order: 3,
    name: '狮子林',
    shortName: '狮子林',
    lat: 31.3231,
    lng: 120.6324,
    triggerRadiusM: 120,
    intro: '元代的假山王国，石峰如狮，曲径如谜。',
    story:
      '至正二年，弟子们为天如禅师建起这座园子。满园的湖石假山盘旋起伏，相传连乾隆皇帝都在里面转得兴致盎然，题下"真趣"二字。',
    npcId: 'a-heng',
    taskIds: ['task-shizi-dynasty'],
    codexIds: ['codex-shizi-origin', 'codex-zhenqu'],
  },
  {
    id: 'zhuozhengyuan',
    order: 4,
    name: '拙政园',
    shortName: '拙政园',
    lat: 31.3254,
    lng: 120.6307,
    triggerRadiusM: 150,
    intro: '"拙者之为政"，明代文人园林的集大成者。',
    story:
      '明正德年间，御史王献臣辞官归乡，以潘岳《闲居赋》中一句"拙者之为政"为园命名。数百年间园分园合，1997年，它作为苏州古典园林的代表列入《世界遗产名录》。',
    npcId: 'a-heng',
    taskIds: ['task-zhuozheng-timeline'],
    codexIds: ['codex-zhuozheng-origin', 'codex-wenzhengming', 'codex-shijieyichan'],
  },
  {
    id: 'subo',
    order: 5,
    name: '苏州博物馆',
    shortName: '苏博',
    lat: 31.3244,
    lng: 120.6294,
    triggerRadiusM: 150,
    intro: '贝聿铭以壁为纸、以石为绘，为古城写下新的一页。',
    story:
      '2006年，贝聿铭设计的苏博新馆在忠王府旁落成。灰白几何的屋顶接住了古城的天际线，一庭片石假山，把山水收进了一面白墙。青年馆员小沈在这里等你，她手里有一盏"守园灯"。',
    npcId: 'xiao-shen',
    taskIds: ['task-pianshi'],
    codexIds: ['codex-subo-bei', 'codex-pianshi', 'codex-zhongwangfu', 'codex-shouyuandeng'],
  },
]

export const spotById = new Map(spots.map((s) => [s.id, s]))

export function nextSpot(spotId: string): Spot | undefined {
  const cur = spotById.get(spotId)
  return cur ? spots.find((s) => s.order === cur.order + 1) : undefined
}
