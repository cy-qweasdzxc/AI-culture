import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { REFUSAL_TEXT, chatRules } from '@/data/chatScripts'
import { clueById } from '@/data/clues'
import { codexById } from '@/data/codex'
import { endingById } from '@/data/endings'
import { npcById } from '@/data/npcs'
import { roleById } from '@/data/roles'
import { nextSpot, spotById, spots } from '@/data/theme'
import { taskById, tasks } from '@/data/tasks'
import type {
  ChatMessage,
  JourneyEvent,
  JourneyMode,
  JourneyState,
  MockNpcReply,
  SpotStatus,
  TaskState,
} from '@/types'

/**
 * 旅程引擎（阶段一：前端 Mock 权威状态机）。
 * 技术方案红线：界面组件无权直接改状态，一切变化经由本引擎的校验与转移函数；
 * 阶段二起本引擎由 FastAPI 后端动作校验器 + 状态机替代，接口形态保持不变。
 */

export interface VerifyResult {
  ok: boolean
  feedback: string
  missingClues?: string[]
}

interface JourneyStore {
  sessionId: string | null
  roleId: string | null
  mode: JourneyMode
  state: JourneyState
  currentSpotId: string | null
  spotStatus: Record<string, SpotStatus>
  taskStates: Record<string, TaskState>
  inventory: string[]
  unlockedCodex: string[]
  flags: Record<string, string>
  events: JourneyEvent[]
  messages: Record<string, ChatMessage[]>
  auditLog: { at: number; npcId: string; messageId: string; reason: string }[]
  endingId: string | null
  startedAt: number | null
  finishedAt: number | null

  ensureSession: () => string
  startJourney: (roleId: string, mode: JourneyMode) => void
  setMode: (mode: JourneyMode) => void
  arriveSpot: (spotId: string) => boolean
  verifyTask: (taskId: string, answer: unknown) => VerifyResult
  sendChat: (npcId: string, text: string) => MockNpcReply
  reportIssue: (npcId: string, messageId: string, reason: string) => void
  enterFinale: (choiceKey: 'hang' | 'keep') => string
  resetJourney: () => void
}

let msgSeq = 0
const nextMsgId = () => `m-${Date.now()}-${msgSeq++}`

function newSessionId(): string {
  return `anon-${Math.random().toString(36).slice(2, 10)}`
}

function makeEvent(kind: JourneyEvent['kind'], text: string): JourneyEvent {
  return { at: Date.now(), kind, text }
}

export const useJourney = create<JourneyStore>()(
  persist(
    (set, get) => ({
      sessionId: null,
      roleId: null,
      mode: 'virtual',
      state: 'CREATED',
      currentSpotId: null,
      spotStatus: {},
      taskStates: {},
      inventory: [],
      unlockedCodex: [],
      flags: {},
      events: [],
      messages: {},
      auditLog: [],
      endingId: null,
      startedAt: null,
      finishedAt: null,

      ensureSession: () => {
        const cur = get().sessionId
        if (cur) return cur
        const id = newSessionId()
        set({ sessionId: id })
        return id
      },

      startJourney: (roleId, mode) => {
        const role = roleById.get(roleId)
        if (!role) return
        get().ensureSession()
        const spotStatus: Record<string, SpotStatus> = {}
        for (const s of spots) spotStatus[s.id] = s.order === 1 ? 'discovered' : 'undiscovered'
        const taskStates: Record<string, TaskState> = {}
        for (const t of tasks) taskStates[t.id] = { status: 'available', attempts: 0, score: 0 }
        const first = spots[0]
        set({
          roleId,
          mode,
          state: 'EXPLORING',
          currentSpotId: null,
          spotStatus,
          taskStates,
          inventory: [role.startClueId],
          unlockedCodex: [],
          flags: {},
          events: [
            makeEvent('journey', `以「${role.name}」（${role.identity}）的身份出发，模式：${mode === 'virtual' ? '虚拟游览' : '实地探索'}`),
            makeEvent('spot', `点位已发现：${first.name}`),
          ],
          messages: {},
          endingId: null,
          startedAt: Date.now(),
          finishedAt: null,
        })
      },

      setMode: (mode) => {
        if (get().state === 'CREATED') return
        set({ mode, events: [...get().events, makeEvent('mode', `切换为${mode === 'virtual' ? '虚拟游览' : '实地探索'}模式`)] })
      },

      arriveSpot: (spotId) => {
        const { spotStatus, events } = get()
        const spot = spotById.get(spotId)
        if (!spot) return false
        const status = spotStatus[spotId]
        if (status !== 'discovered' && status !== 'current') return false
        set({
          currentSpotId: spotId,
          state: 'AT_SPOT',
          spotStatus: { ...spotStatus, [spotId]: 'current' },
          events: [...events, makeEvent('spot', `到达点位：${spot.name}`)],
        })
        return true
      },

      verifyTask: (taskId, answer) => {
        const s = get()
        const task = taskById.get(taskId)
        if (!task) return { ok: false, feedback: '任务不存在。' }
        const prev = s.taskStates[taskId]
        if (!prev || prev.status === 'completed') return { ok: false, feedback: '该任务已完成。' }

        // 前置线索校验（对应后端校验顺序第 5 步）
        if (task.requiredClues?.length) {
          const missing = task.requiredClues.filter((c) => !s.inventory.includes(c))
          if (missing.length) {
            return {
              ok: false,
              feedback: `线索不足：需要「${missing.map((m) => clueById.get(m)?.name ?? m).join('」和「')}」。去和 NPC 聊聊，或翻翻背包里的提示。`,
              missingClues: missing,
            }
          }
        }

        let correct = false
        let ratio = 0
        if (task.type === 'quiz' || task.type === 'combine') {
          correct = answer === task.answerKey
          ratio = correct ? 1 : 0
        } else if (task.type === 'password') {
          correct = String(answer ?? '').trim() === task.password
          ratio = correct ? 1 : 0
        } else if (task.type === 'sorting') {
          const arr = Array.isArray(answer) ? (answer as number[]) : []
          const ans = task.sortingAnswer ?? []
          const hits = ans.filter((v, i) => arr[i] === v).length
          ratio = ans.length ? hits / ans.length : 0
          correct = hits === ans.length && arr.length === ans.length
        }

        const attempts = prev.attempts + 1
        if (!correct) {
          set({
            taskStates: { ...s.taskStates, [taskId]: { ...prev, attempts } },
          })
          const hint =
            task.type === 'sorting'
              ? `顺序还不对（约 ${Math.round(ratio * 100)}% 的位置正确）。再想想年代先后。`
              : task.type === 'password'
                ? `口令不对。${task.passwordHint ? `提示：${task.passwordHint}。` : ''}`
                : '这个答案不对。回去看看点位介绍，或向 NPC 打听一下。'
          return { ok: false, feedback: hint }
        }

        // 校验通过：事务式更新（Mock）
        const score = task.knowledgeScore
        const taskStates = { ...s.taskStates, [taskId]: { status: 'completed' as const, attempts, score } }
        const events = [...s.events, makeEvent('task', `完成任务：${task.title}（知识分 +${score}）`)]
        const inventory = [...s.inventory]
        const unlockedCodex = [...s.unlockedCodex]

        if (task.rewardClueId && !inventory.includes(task.rewardClueId)) {
          inventory.push(task.rewardClueId)
          events.push(makeEvent('clue', `获得线索：${clueById.get(task.rewardClueId)?.name}`))
        }
        for (const cid of task.rewardCodexIds ?? []) {
          if (!unlockedCodex.includes(cid)) {
            unlockedCodex.push(cid)
            events.push(makeEvent('codex', `图鉴解锁：${codexById.get(cid)?.title}`))
          }
        }

        // 点位完成判定 → 解锁下一点位
        const spot = spotById.get(task.spotId)
        const spotStatus = { ...s.spotStatus }
        let state: JourneyState = 'TASK_ACTIVE'
        if (spot && spot.taskIds.every((tid) => taskStates[tid]?.status === 'completed')) {
          spotStatus[task.spotId] = 'completed'
          events.push(makeEvent('spot', `点位完成：${spot.name}`))
          const nxt = nextSpot(task.spotId)
          if (nxt && spotStatus[nxt.id] === 'undiscovered') {
            spotStatus[nxt.id] = 'discovered'
            events.push(makeEvent('spot', `点位已发现：${nxt.name}`))
          }
          state = 'EXPLORING'
        }

        set({ taskStates, inventory, unlockedCodex, spotStatus, events, state })
        return { ok: true, feedback: `答对了。${task.explanation}` }
      },

      sendChat: (npcId, text) => {
        const s = get()
        const npc = npcById.get(npcId)
        const userMsg: ChatMessage = { id: nextMsgId(), from: 'user', text, at: Date.now() }
        const thread = [...(s.messages[npcId] ?? []), userMsg]

        // 规则匹配（Mock 检索：关键词命中数排序）
        let best: { rule: (typeof chatRules)[number]; hits: number } | null = null
        for (const rule of chatRules) {
          if (rule.npcId !== npcId) continue
          const hits = rule.keywords.filter((k) => text.includes(k)).length
          if (hits > 0 && (!best || hits > best.hits)) best = { rule, hits }
        }

        const reply: MockNpcReply = best
          ? { ...best.rule.reply }
          : {
              dialogue: `${npc?.name ?? '对方'}摇了摇头：${REFUSAL_TEXT}`,
              intent: 'out_of_scope',
              emotion: 'evasive',
              evidence_ids: [],
              safety_flag: 'ok',
            }

        // 角色差异：特定角色的额外一句
        if (best?.rule.roleExtra && s.roleId && best.rule.roleExtra[s.roleId]) {
          reply.dialogue = `${reply.dialogue}\n\n${best.rule.roleExtra[s.roleId]}`
        }

        const npcMsg: ChatMessage = {
          id: nextMsgId(),
          from: 'npc',
          text: reply.dialogue,
          evidenceIds: reply.evidence_ids,
          at: Date.now(),
        }
        let newThread = [...thread, npcMsg]
        const events = [...s.events]
        const inventory = [...s.inventory]
        const unlockedCodex = [...s.unlockedCodex]

        // 动作校验（Mock approved_actions）
        if (reply.task_action === 'grant_clue' && reply.clue_id && !inventory.includes(reply.clue_id)) {
          inventory.push(reply.clue_id)
          const clueName = clueById.get(reply.clue_id)?.name ?? reply.clue_id
          events.push(makeEvent('clue', `获得线索：${clueName}`))
          newThread = [
            ...newThread,
            { id: nextMsgId(), from: 'system', text: `获得线索：${clueName}（已放入线索背包）`, at: Date.now() },
          ]
        }
        for (const cid of reply.codex_ids ?? []) {
          if (!unlockedCodex.includes(cid)) {
            unlockedCodex.push(cid)
            events.push(makeEvent('codex', `图鉴解锁：${codexById.get(cid)?.title}`))
          }
        }

        set({
          messages: { ...s.messages, [npcId]: newThread },
          inventory,
          unlockedCodex,
          events,
          state: s.state === 'AT_SPOT' ? 'DIALOGUE' : s.state,
        })
        return reply
      },

      reportIssue: (npcId, messageId, reason) => {
        set({ auditLog: [...get().auditLog, { at: Date.now(), npcId, messageId, reason }] })
      },

      enterFinale: (choiceKey) => {
        const s = get()
        const allDone = tasks.every((t) => s.taskStates[t.id]?.status === 'completed')
        const endingId = !allDone ? 'wei-jin' : choiceKey === 'hang' ? 'cheng-huai' : 'qu-jing'
        const ending = endingById.get(endingId)
        const events = [
          ...s.events,
          makeEvent('choice', `尾声选择：${choiceKey === 'hang' ? '把灯挂上长廊' : '把灯收进行囊'}`),
          makeEvent('ending', `达成结局：${ending?.name ?? endingId}`),
        ]
        const unlockedCodex = [...s.unlockedCodex]
        if (!unlockedCodex.includes('codex-shouyuandeng')) unlockedCodex.push('codex-shouyuandeng')
        set({
          flags: { ...s.flags, finalChoice: choiceKey },
          endingId,
          unlockedCodex,
          events,
          state: 'COMPLETED',
          finishedAt: Date.now(),
        })
        return endingId
      },

      resetJourney: () => {
        set({
          roleId: null,
          mode: 'virtual',
          state: 'CREATED',
          currentSpotId: null,
          spotStatus: {},
          taskStates: {},
          inventory: [],
          unlockedCodex: [],
          flags: {},
          events: [],
          messages: {},
          auditLog: [],
          endingId: null,
          startedAt: null,
          finishedAt: null,
        })
      },
    }),
    {
      name: 'citystory.journey.v1',
      version: 1,
    },
  ),
)

// ---------- 派生选择器（纯函数） ----------

export function selectKnowledgeScore(s: JourneyStore): number {
  return Object.values(s.taskStates).reduce((sum, t) => sum + (t.score ?? 0), 0)
}

export function selectMaxScore(): number {
  return tasks.reduce((sum, t) => sum + t.knowledgeScore, 0)
}

export function selectCompletedTaskCount(s: JourneyStore): number {
  return Object.values(s.taskStates).filter((t) => t.status === 'completed').length
}

export function selectCompletedSpotCount(s: JourneyStore): number {
  return Object.values(s.spotStatus).filter((v) => v === 'completed').length
}

/** 尾声入口是否开放：抵达苏博（current）或苏博已完成 */
export function canEnterFinale(s: JourneyStore): boolean {
  const st = s.spotStatus['subo']
  return s.state !== 'CREATED' && (st === 'current' || st === 'completed') && !s.endingId
}
