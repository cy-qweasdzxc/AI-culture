/** 仅为界面推荐问题；回答、证据、动作全部来自服务端。 */

type ChoiceKind = 'task' | 'culture' | 'craft' | 'story'

interface Choice {
  text: string
  kind: ChoiceKind
  /** 只在对应点位推荐，避免在耦园问狮子林这类会落空的题。 */
  spots?: string[]
  /** 当前点位优先保留的任务推进题，问过一次后不再置顶。 */
  priority?: boolean
  taskId?: string
}

export interface ChoiceContext {
  spotId: string | null
  roleId?: string | null
  turn?: number
  offset?: number
  asked?: string[]
  completedTaskIds?: string[]
  inventory?: string[]
  difficulty?: string
}

const CHOICE_POOLS: Record<string, Choice[]> = {
  'zhou-bo': [
    { text: '《平江图》是什么？', kind: 'task', taskId: 'task-pingjiangtu', priority: true },
    { text: '《平江图》上画了些什么？', kind: 'task', taskId: 'task-pingjiangtu' },
    { text: '绍定二年是哪一年？', kind: 'task', taskId: 'task-pingjiangtu' },
    { text: '平江路的格局有什么讲究？', kind: 'culture' },
    { text: '为什么说平江路是“双棋盘”？', kind: 'culture' },
    { text: '“水陆并行、河街相邻”是什么意思？', kind: 'culture' },
    { text: '平江古巷现在还剩多少座老桥？', kind: 'culture' },
    { text: '平江路的水巷是怎么走的？', kind: 'culture' },
    { text: '丁香巷和《雨巷》有关系吗？', kind: 'story' },
    { text: '戴望舒真的写过丁香巷吗？', kind: 'story' },
    { text: '丁香巷的名字是怎么来的？', kind: 'story' },
  ],
  'a-heng': [
    { text: '耦园为什么改名？', kind: 'task', taskId: 'task-jiaou', spots: ['ouyuan'], priority: true },
    { text: '耦园的“耦”是什么意思？', kind: 'culture', spots: ['ouyuan'] },
    { text: '耦园为什么三面临水？', kind: 'culture', spots: ['ouyuan'] },
    { text: '耦园走马楼是做什么用的？', kind: 'culture', spots: ['ouyuan'] },
    { text: '耦园的假山有什么讲究？', kind: 'craft', spots: ['ouyuan'] },
    { text: '什么样的假山才算好？', kind: 'craft', spots: ['ouyuan'] },
    { text: '园子三面临水有什么好处？', kind: 'craft', spots: ['ouyuan'] },
    { text: '狮子林始建于什么朝代？', kind: 'task', taskId: 'task-shizi-dynasty', spots: ['shizilin'], priority: true },
    { text: '狮子林为什么叫“假山王国”？', kind: 'culture', spots: ['shizilin'] },
    { text: '狮子林“真趣”匾有什么来历？', kind: 'story', spots: ['shizilin'] },
    { text: '贝润生和狮子林有什么关系？', kind: 'culture', spots: ['shizilin'] },
    { text: '狮子林的假山为什么像迷宫？', kind: 'craft', spots: ['shizilin'] },
    { text: '什么样的假山才算好？', kind: 'craft', spots: ['shizilin'] },
    {
      text: '拙政园是什么时候列入世界遗产的？',
      kind: 'task',
      taskId: 'task-zhuozheng-timeline',
      spots: ['zhuozhengyuan'],
      priority: true,
    },
    { text: '拙政园的名字怎么来的？', kind: 'culture', spots: ['zhuozhengyuan'] },
    { text: '文徵明和拙政园有什么关系？', kind: 'story', spots: ['zhuozhengyuan'] },
    { text: '拙政园的历史地位如何？', kind: 'culture', spots: ['zhuozhengyuan'] },
    { text: '拙政园的布局有什么讲究？', kind: 'craft', spots: ['zhuozhengyuan'] },
    { text: '拙政园以水为中心吗？', kind: 'craft', spots: ['zhuozhengyuan'] },
  ],
  'xiao-shen': [
    { text: '片石假山妙在哪里？', kind: 'task', taskId: 'task-pianshi', priority: true },
    { text: '“以壁为纸，以石为画”是什么意思？', kind: 'task', taskId: 'task-pianshi' },
    { text: '贝聿铭是怎么设计新馆的？', kind: 'culture' },
    { text: '新馆为什么用白墙灰瓦？', kind: 'culture' },
    { text: '苏博和忠王府是什么关系？', kind: 'culture' },
    { text: '创意山水园里有什么？', kind: 'culture' },
    { text: '守园灯是什么？', kind: 'story' },
    { text: '守园灯的故事是真的吗？', kind: 'story' },
  ],
}

const KIND_ORDER: ChoiceKind[] = ['task', 'culture', 'craft', 'story']

function normalize(text: string): string {
  return text.trim().replace(/[\s？?！!。，,、；;：:]+$/g, '')
}

function seedFrom(text: string): number {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function shuffled<T>(items: T[], seed: number): T[] {
  const result = [...items]
  let state = seed
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(next() * (index + 1))
    ;[result[index], result[swap]] = [result[swap], result[index]]
  }
  return result
}

function alreadyAsked(text: string, asked: string[]): boolean {
  const target = normalize(text)
  return asked.some((item) => item === target || (target.length >= 6 && item.includes(target)))
}

function select(pool: Choice[], seed: number, turn: number): Choice[] {
  // 首轮固定展示本点位的入口题；之后同类题轮换，避免一行字始终不变。
  const priority = turn === 0 ? pool.find((choice) => choice.priority) : undefined
  const task =
    turn > 0
      ? shuffled(
          pool.filter((choice) => choice.kind === 'task'),
          seed,
        )[0]
      : undefined
  const lead = priority ?? task
  const remaining = shuffled(
    pool.filter((choice) => choice !== lead),
    seed,
  )
  const selected: Choice[] = lead ? [lead] : []
  const kinds = new Set(selected.map((choice) => choice.kind))
  // 同一批尽量跨类型：一个任务或事实、一个工艺或故事，而不是三连问。
  for (const kind of shuffled(KIND_ORDER, seed ^ 0x85ebca6b)) {
    if (selected.length >= 3) break
    if (kinds.has(kind)) continue
    const choice = remaining.find((item) => item.kind === kind && !selected.includes(item))
    if (choice) {
      selected.push(choice)
      kinds.add(choice.kind)
    }
  }
  for (const choice of remaining) {
    if (selected.length >= 3) break
    if (!selected.includes(choice)) selected.push(choice)
  }
  return shuffled(selected, seed ^ 0x9e3779b9)
}

export function suggestedChoices(npcId: string, context: ChoiceContext): string[] {
  const spotId = context.spotId ?? ''
  const pool = (CHOICE_POOLS[npcId] ?? []).filter(
    (choice) => (!choice.spots || choice.spots.includes(spotId)) &&
      (!choice.taskId || !context.completedTaskIds?.includes(choice.taskId)) &&
      !(choice.taskId === 'task-pingjiangtu' && context.inventory?.includes('clue-shaoding')) &&
      !(choice.taskId === 'task-pianshi' && context.inventory?.includes('clue-baibi') && context.inventory?.includes('clue-pianshi')),
  )
  if (pool.length === 0) return []

  const asked = (context.asked ?? []).map(normalize).filter(Boolean)
  const unasked = pool.filter((choice) => !alreadyAsked(choice.text, asked))
  const available = unasked
  if (!available.length) return []
  const seed = seedFrom(
    [npcId, context.roleId ?? '', spotId, context.turn ?? 0, context.offset ?? 0, context.difficulty ?? '', [...(context.inventory ?? [])].sort().join(',')].join('|'),
  )
  return select(available, seed, context.turn ?? 0).map((choice) => choice.text)
}
