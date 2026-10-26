/** 仅为界面推荐问题；回答、证据、动作全部来自服务端。 */
import { SUZHOU_QUESTION_BANK } from '@/data/suzhouQuestionBank'
import type { QuestionTopic } from '@/data/suzhouQuestionBank'

export type { QuestionTopic } from '@/data/suzhouQuestionBank'
export type ChoiceTopic = QuestionTopic | '全部主题'

export interface ChoiceContext {
  spotId: string | null
  roleId?: string | null
  turn?: number
  offset?: number
  asked?: string[]
  topic?: ChoiceTopic
}

const NPC_SPOTS: Record<string, string[]> = {
  'zhou-bo': ['pingjiang'],
  'a-heng': ['ouyuan', 'shizilin', 'zhuozhengyuan'],
  'xiao-shen': ['subo'],
}

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

export function suggestedChoices(npcId: string, context: ChoiceContext): string[] {
  const spotId = context.spotId
  if (!spotId || !NPC_SPOTS[npcId]?.includes(spotId)) return []
  const pool = SUZHOU_QUESTION_BANK.filter(
    (choice) =>
      choice.spotId === spotId &&
      (context.topic === '全部主题' || !context.topic || choice.topic === context.topic),
  )
  const asked = (context.asked ?? []).map(normalize).filter(Boolean)
  const available = pool.filter((choice) => !alreadyAsked(choice.text, asked))
  if (available.length === 0) return []

  const seed = seedFrom(
    [
      npcId,
      context.roleId ?? '',
      spotId,
      context.topic ?? '全部主题',
      context.turn ?? 0,
      context.offset ?? 0,
    ].join('|'),
  )
  // 默认主题首轮优先展示本点位的主线入口题；主题筛选后按所选主题推荐。
  const isDefaultTheme = !context.topic || context.topic === '全部主题'
  const lead =
    context.turn === 0 && isDefaultTheme ? available.find((choice) => choice.priority) : undefined
  const rest = shuffled(
    available.filter((choice) => choice !== lead),
    seed,
  )
  const selected = lead ? [lead, ...rest.slice(0, 2)] : rest.slice(0, 3)
  return shuffled(selected, seed ^ 0x9e3779b9).map((choice) => choice.text)
}
