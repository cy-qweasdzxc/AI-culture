export interface SceneVisual {
  src: string
  alt: string
  position: string
  prompt: string
}

/** 对话背景随当前文化点位切换；提示词保留在此，方便复现和继续调色。 */
export const sceneVisuals: Record<string, SceneVisual> = {
  pingjiang: {
    src: '/assets/scenes/pingjiang.webp',
    alt: '平江路河街相邻的水巷、茶馆与石桥',
    position: 'center center',
    prompt:
      '平江路水巷：白墙黛瓦、临河茶馆、窄河、拱形石桥与柳影。宽幅对话背景，中心留出安静水面供消息气泡阅读，中国水墨与矿物设色环境插画。',
  },
  ouyuan: {
    src: '/assets/scenes/ouyuan.webp',
    alt: '耦园月洞门、太湖石与临水园景',
    position: 'center center',
    prompt:
      '耦园水边小园：月洞门、白墙黛瓦、太湖石、古树与平静水面，含蓄表现成双成对的园林章法。宽幅对话背景，中国水墨与矿物设色环境插画。',
  },
  shizilin: {
    src: '/assets/scenes/shizilin.webp',
    alt: '狮子林太湖石假山迷宫与园中小亭',
    position: 'center center',
    prompt:
      '狮子林假山迷宫：层叠太湖石、曲折小径、竹影、白墙与小亭，神秘但不阴暗。宽幅对话背景，中央路径留白，中国水墨与矿物设色环境插画。',
  },
  zhuozhengyuan: {
    src: '/assets/scenes/zhuozhengyuan.webp',
    alt: '拙政园荷池、亭榭与层叠园林',
    position: 'center center',
    prompt:
      '拙政园开阔荷池：临水亭榭、曲桥、荷叶、白墙与层叠树木，水面宁静。宽幅对话背景，中央水面留白，中国水墨与矿物设色环境插画。',
  },
  subo: {
    src: '/assets/scenes/subo.webp',
    alt: '苏州博物馆白墙几何屋面、镜池与片石山水',
    position: 'center center',
    prompt:
      '苏州博物馆新馆庭院：白色几何墙面、深灰屋面线条、镜池、松树与片石山水，现代建筑与江南园林相接。宽幅对话背景，中国水墨与矿物设色环境插画。',
  },
}

export function sceneVisual(spotId: string | null | undefined): SceneVisual | null {
  return spotId ? (sceneVisuals[spotId] ?? null) : null
}
