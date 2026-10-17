import type { KnowledgeEvidence } from '@/types'

/**
 * 证据知识库（Mock 演示数据）。
 * 内容均为公开常识级文化事实或明确标注的传说/争议/虚构；
 * 运行时由后端自动发布为 reviewed 并由 RAG 提供；自动发布不代表人工事实核验。
 */

export const knowledgeBase: KnowledgeEvidence[] = [
  {
    id: 'kn-shuangqipan',
    spotId: 'pingjiang',
    type: 'fact',
    title: '水陆并行、河街相邻',
    content:
      '平江路历史街区延续了苏州古城"水陆并行、河街相邻"的双棋盘格局，是古城内保存较为完整的历史街区之一。',
    source: '苏州市地方志与公开文旅资料（自动发布，未经人工核验）',
  },
  {
    id: 'kn-pingjiangtu',
    spotId: 'pingjiang',
    type: 'fact',
    title: '《平江图》碑',
    content:
      '《平江图》碑刻于南宋绍定二年（公元1229年），描绘了当时平江府城的街巷与河道布局，现存于苏州碑刻博物馆。',
    source: '苏州碑刻博物馆公开介绍（自动发布，未经人工核验）',
  },
  {
    id: 'kn-yuxiang',
    spotId: 'pingjiang',
    type: 'disputed',
    title: '《雨巷》与丁香巷',
    content:
      '戴望舒《雨巷》的原型是否为苏州丁香巷，历来有多种说法，并无定论。此说多为后人附会，宜作文学趣谈看待。',
    source: '现代文学研究公开讨论（自动发布，未经人工核验）',
  },
  {
    id: 'kn-ouyuan-jiaou',
    spotId: 'ouyuan',
    type: 'fact',
    title: '"耦"通"偶"',
    content:
      '耦园原名涉园，清末沈秉成购得后扩建，与夫人严永华偕隐于此，取"耦"与"偶"相通之意，寓意佳偶天成。',
    source: '苏州园林公开史料（自动发布，未经人工核验）',
  },
  {
    id: 'kn-ouyuan-water',
    spotId: 'ouyuan',
    type: 'fact',
    title: '三面临水的耦园',
    content: '耦园宅园相依，东花园与西花园分列中厅两侧，园外三面临河，可从水巷乘船而至，是苏州园林中颇特别的一处。',
    source: '苏州园林公开史料（自动发布，未经人工核验）',
  },
  {
    id: 'kn-shizi-origin',
    spotId: 'shizilin',
    type: 'fact',
    title: '元代始建的狮子林',
    content:
      '狮子林始建于元代至正二年（1342年），由天如禅师的弟子们为其师修建。园内湖石假山群峰回路转，素有"假山王国"之称。',
    source: '苏州园林公开史料（自动发布，未经人工核验）',
  },
  {
    id: 'kn-zhenqu',
    spotId: 'shizilin',
    type: 'legend',
    title: '"真趣"轶闻',
    content:
      '相传清乾隆帝游历狮子林，兴之所至题下"真趣"二字。此类帝王轶闻多见于后世记载与民间讲述，作为传说欣赏为宜。',
    source: '民间传说与地方掌故（自动发布，未经人工核验）',
  },
  {
    id: 'kn-zhuozheng-origin',
    spotId: 'zhuozhengyuan',
    type: 'fact',
    title: '拙政园园名由来',
    content:
      '拙政园始建于明正德年间（16世纪初），御史王献臣辞官归乡后所建。园名借西晋潘岳《闲居赋》中"拙者之为政"一句，自谦"拙于从政"。',
    source: '苏州园林公开史料（自动发布，未经人工核验）',
  },
  {
    id: 'kn-wenzhengming',
    spotId: 'zhuozhengyuan',
    type: 'disputed',
    title: '文徵明与拙政园',
    content:
      '文徵明与王献臣交好，为拙政园作图咏多幅并传世。至于他是否直接参与造园设计、参与到何种程度，史料记载不一，学界说法并存。',
    source: '园林史研究公开讨论（自动发布，未经人工核验）',
  },
  {
    id: 'kn-shijieyichan',
    spotId: 'zhuozhengyuan',
    type: 'fact',
    title: '列入《世界遗产名录》',
    content:
      '1997年，以拙政园、留园、网师园、环秀山庄为代表的苏州古典园林被联合国教科文组织列入《世界遗产名录》。',
    source: '联合国教科文组织世界遗产名录（自动发布，未经人工核验）',
  },
  {
    id: 'kn-subo-bei',
    spotId: 'subo',
    type: 'fact',
    title: '贝聿铭与苏博新馆',
    content:
      '苏州博物馆新馆由建筑师贝聿铭设计，于2006年10月建成开放。建筑以灰白为主调，几何坡顶呼应苏州传统民居的天际线。',
    source: '苏州博物馆公开介绍（自动发布，未经人工核验）',
  },
  {
    id: 'kn-pianshi',
    spotId: 'subo',
    type: 'fact',
    title: '片石假山',
    content:
      '苏博新馆主庭园中，贝聿铭以白墙为纸、片石为绘，叠石成山，借米芾山水画意，在一面素墙前营造出层峦叠嶂的山水意境。',
    source: '苏州博物馆公开介绍（自动发布，未经人工核验）',
  },
  {
    id: 'kn-zhongwangfu',
    spotId: 'subo',
    type: 'fact',
    title: '忠王府旧址',
    content: '苏州博物馆馆址包含太平天国忠王府旧址，是国内保存较完整的太平天国时期王府建筑之一。',
    source: '苏州博物馆公开介绍（自动发布，未经人工核验）',
  },
  {
    id: 'kn-shouyuandeng',
    spotId: 'subo',
    type: 'fiction',
    title: '守园灯（剧情创作）',
    content:
      '"守园灯"为本平台剧情创作：传说每座园林都有一盏守园灯，点亮它的人，会把这一路的故事继续讲下去。',
    source: '城迹入戏剧情创作（艺术化虚构）',
  },
]

export const knowledgeById = new Map(knowledgeBase.map((k) => [k.id, k]))

/** 按点位与类型过滤（对应正式版"按 NPC 知识边界过滤"） */
export function evidenceForSpot(spotId: string): KnowledgeEvidence[] {
  return knowledgeBase.filter((k) => k.spotId === spotId)
}
