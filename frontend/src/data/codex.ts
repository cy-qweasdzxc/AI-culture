import type { CodexEntry } from '@/types'

/**
 * 文化图鉴条目（演示数据）。
 * 四级标注：fact 史实 / disputed 争议 / legend 传说 / fiction 虚构。
 * 未解锁条目前端只显示轮廓，完整内容不返回（正式版由后端控制）。
 */
export const codexEntries: CodexEntry[] = [
  {
    id: 'codex-shuangqipan',
    spotId: 'pingjiang',
    type: 'fact',
    title: '双棋盘格局',
    summary: '水陆并行、河街相邻的古城肌理',
    content:
      '苏州古城自宋代以来保持"水陆并行、河街相邻"的双棋盘格局：河道与街道两两相伴，人家临水而居，后门是河埠，前门是街巷。平江路历史街区是这一格局保存较为完整的区域之一。',
    source: '苏州市地方志与公开文旅资料（自动发布，未经人工核验）',
  },
  {
    id: 'codex-pingjiangtu',
    spotId: 'pingjiang',
    type: 'fact',
    title: '《平江图》碑',
    summary: '南宋绍定二年的城市地图',
    content:
      '《平江图》碑刻于南宋绍定二年（公元1229年），高逾两米，详尽描绘平江府城（今苏州）的城墙、街巷、河道与官署，是现存较早的大型城市石刻地图之一，现存于苏州碑刻博物馆。',
    source: '苏州碑刻博物馆公开介绍（自动发布，未经人工核验）',
  },
  {
    id: 'codex-yuxiang',
    spotId: 'pingjiang',
    type: 'disputed',
    title: '《雨巷》与丁香巷',
    summary: '戴望舒的雨巷是不是这条巷子',
    content:
      '平江路一带有条丁香巷，因戴望舒《雨巷》中"丁香一样的姑娘"而常被游人寻访。但《雨巷》是否真写于此，历来众说纷纭、并无定论。此条目存在争议，宜作文学趣谈看待。',
    source: '现代文学研究公开讨论（自动发布，未经人工核验）',
  },
  {
    id: 'codex-ouyuan-jiaou',
    spotId: 'ouyuan',
    type: 'fact',
    title: '耦园佳偶',
    summary: '"耦"通"偶"的偕隐之约',
    content:
      '耦园原名涉园，清末沈秉成购得后扩建，与夫人严永华偕隐于此，取"耦"与"偶"相通之意，寓意佳偶天成。园中的东花园、西花园分列中厅两侧，暗合成双之趣。',
    source: '苏州园林公开史料（自动发布，未经人工核验）',
  },
  {
    id: 'codex-ouyuan-water',
    spotId: 'ouyuan',
    type: 'fact',
    title: '三面临水的耦园',
    summary: '可以乘船抵达的园子',
    content:
      '耦园宅园相依，园外三面临河，从前访客可沿水巷乘船直抵园门。在苏州诸园中，这样"枕水而居"的格局颇为少见。',
    source: '苏州园林公开史料（自动发布，未经人工核验）',
  },
  {
    id: 'codex-shizi-origin',
    spotId: 'shizilin',
    type: 'fact',
    title: '假山王国',
    summary: '元代至正二年的禅意园林',
    content:
      '狮子林始建于元代至正二年（1342年），由天如禅师的弟子们为其师修建。园内湖石假山群峰回路转、洞壑盘旋，游人入其中如入迷阵，素有"假山王国"之称。',
    source: '苏州园林公开史料（自动发布，未经人工核验）',
  },
  {
    id: 'codex-zhenqu',
    spotId: 'shizilin',
    type: 'legend',
    title: '"真趣"轶闻',
    summary: '相传乾隆帝的题字',
    content:
      '相传清乾隆帝游历狮子林，在假山间穿行半日方出，兴之所至题下"真趣"二字。此类帝王轶闻多见于后世记载与民间讲述，本图鉴按传说标注，作为掌故欣赏为宜。',
    source: '民间传说与地方掌故（自动发布，未经人工核验）',
  },
  {
    id: 'codex-zhuozheng-origin',
    spotId: 'zhuozhengyuan',
    type: 'fact',
    title: '拙政园园名由来',
    summary: '"拙者之为政"的自谦',
    content:
      '拙政园始建于明正德年间（16世纪初），御史王献臣辞官归乡后所建。园名借西晋潘岳《闲居赋》"拙者之为政"一句，自谦拙于从政、退而理园。全园以水为中心，是明代文人园林的代表。',
    source: '苏州园林公开史料（自动发布，未经人工核验）',
  },
  {
    id: 'codex-wenzhengming',
    spotId: 'zhuozhengyuan',
    type: 'disputed',
    title: '文徵明与拙政园',
    summary: '图咏传世，参与程度存争议',
    content:
      '文徵明与王献臣交好，曾屡游拙政园并作图咏、诗文传世，是研究该园早期面貌的重要资料。至于文徵明是否直接参与造园设计、参与到何种程度，史料记载不一，学界说法并存。',
    source: '园林史研究公开讨论（自动发布，未经人工核验）',
  },
  {
    id: 'codex-shijieyichan',
    spotId: 'zhuozhengyuan',
    type: 'fact',
    title: '列入《世界遗产名录》',
    summary: '1997年，苏州古典园林',
    content:
      '1997年，以拙政园、留园、网师园、环秀山庄为代表的苏州古典园林被联合国教科文组织列入《世界遗产名录》；2000年，沧浪亭、狮子林、耦园等作为扩展项目列入。',
    source: '联合国教科文组织世界遗产名录（自动发布，未经人工核验）',
  },
  {
    id: 'codex-subo-bei',
    spotId: 'subo',
    type: 'fact',
    title: '贝聿铭与苏博新馆',
    summary: '2006年，为古城写新的一页',
    content:
      '苏州博物馆新馆由建筑师贝聿铭设计，2006年10月建成开放。建筑以灰白为主调，几何形坡顶呼应苏州传统民居的轮廓，让新建筑谦逊地嵌入古城肌理。',
    source: '苏州博物馆公开介绍（自动发布，未经人工核验）',
  },
  {
    id: 'codex-pianshi',
    spotId: 'subo',
    type: 'fact',
    title: '片石假山',
    summary: '以壁为纸，以石为绘',
    content:
      '苏博新馆主庭园中，贝聿铭以白墙为纸、片石为绘，将石头切片叠置，借米芾山水画意，在一面素墙前营造出层峦叠嶂的山水意境，是传统造园语言的一次现代转译。',
    source: '苏州博物馆公开介绍（自动发布，未经人工核验）',
  },
  {
    id: 'codex-zhongwangfu',
    spotId: 'subo',
    type: 'fact',
    title: '忠王府旧址',
    summary: '苏博馆址的太平天国遗存',
    content:
      '苏州博物馆馆址包含太平天国忠王府旧址，是国内保存较完整的太平天国时期王府建筑之一，与新馆建筑相邻，新旧并置。',
    source: '苏州博物馆公开介绍（自动发布，未经人工核验）',
  },
  {
    id: 'codex-shouyuandeng',
    spotId: 'subo',
    type: 'fiction',
    title: '守园灯',
    summary: '本平台剧情创作的一盏灯',
    content:
      '"守园灯"是《城迹入戏》为本条路线创作的剧情意象：传说每座园林都有一盏守园灯，点亮它的人，会把这一路听到、看到的故事继续讲下去。本条目为艺术化虚构。',
    source: '城迹入戏剧情创作（艺术化虚构）',
  },
]

export const codexById = new Map(codexEntries.map((c) => [c.id, c]))

export const knowledgeTypeLabel: Record<string, string> = {
  fact: '可靠史实',
  disputed: '争议观点',
  legend: '民间传说',
  fiction: '艺术化虚构',
}
