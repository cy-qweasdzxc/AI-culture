import { create } from 'zustand'
import { api, ApiError } from '@/services/api'
import type {
  ChatReply,
  Clue,
  CodexEntry,
  Ending,
  JourneyMode,
  JourneyReport,
  JourneySnapshot,
  LocationReading,
  Npc,
  PublicTask,
  Role,
  Spot,
  Theme,
} from '@/types'

export interface VerifyResult {
  ok: boolean
  feedback: string
  missingClues?: string[]
}
const emptyJourney = {
  journeyId: null as string | null,
  stateVersion: 0,
  roleId: null as string | null,
  mode: 'virtual' as JourneyMode,
  state: 'CREATED' as JourneySnapshot['state'],
  currentSpotId: null as string | null,
  spotStatus: {},
  taskStates: {},
  inventory: [],
  unlockedCodex: [],
  flags: {},
  events: [],
  messages: {},
  auditLog: [],
  endingId: null as string | null,
  startedAt: null as number | null,
  finishedAt: null as number | null,
}
interface JourneyStore extends Omit<JourneySnapshot, 'sessionId' | 'journeyId'> {
  sessionId: string | null
  journeyId: string | null
  ready: boolean
  loading: boolean
  busy: boolean
  error: string | null
  themes: Theme[]
  roles: Role[]
  npcs: Npc[]
  spots: Spot[]
  tasks: PublicTask[]
  clues: Clue[]
  codexEntries: CodexEntry[]
  codexTotal: number
  ending: Ending | null
  report: JourneyReport | null
  restore: () => Promise<void>
  refresh: () => Promise<void>
  startJourney: (roleId: string, mode: JourneyMode) => Promise<void>
  setMode: (mode: JourneyMode) => Promise<void>
  arriveSpot: (spotId: string, location?: LocationReading) => Promise<boolean>
  verifyTask: (taskId: string, answer: unknown) => Promise<VerifyResult>
  sendChat: (npcId: string, text: string) => Promise<ChatReply>
  reportIssue: (npcId: string, messageId: string, reason: string) => Promise<void>
  enterFinale: (choiceKey: 'hang' | 'keep') => Promise<string>
  resetJourney: () => Promise<void>
  clearSession: () => Promise<void>
  clearError: () => void
}
let restoring: Promise<void> | null = null
type ActionResponse = { snapshot: JourneySnapshot | null }

/** Zustand 仅缓存服务器响应，本地存储不参与会话恢复和业务判定。 */
export const useJourney = create<JourneyStore>((set, get) => {
  function applySnapshot(snapshot: JourneySnapshot | null) {
    if (snapshot) set(snapshot)
    else
      set({
        ...emptyJourney,
        spots: [],
        tasks: [],
        clues: [],
        codexEntries: [],
        codexTotal: 0,
        ending: null,
        report: null,
      })
  }
  async function catalogs() {
    const [themes, roles] = await Promise.all([
      api.get<{ items: Theme[] }>('/themes'),
      api.get<{ items: Role[] }>('/roles?story_id=suzhou-pingjiang'),
    ])
    set({ themes: themes.items, roles: roles.items })
    if (!get().journeyId) return
    const query = `?journey_id=${encodeURIComponent(get().journeyId!)}`
    const [route, tasks, clues, codex, ending, report] = await Promise.all([
      api.get<{ spots: Spot[]; npcs: Npc[] }>(`/routes/suzhou-pingjiang${query}`),
      api.get<{ items: PublicTask[] }>(`/tasks${query}`),
      api.get<{ items: Clue[] }>(`/clues${query}`),
      api.get<{ items: CodexEntry[]; total: number }>(`/codex${query}`),
      api.get<{ ending: Ending | null }>(`/ending${query}`),
      api.get<JourneyReport>(`/report${query}`),
    ])
    set({
      spots: route.spots,
      npcs: route.npcs,
      tasks: tasks.items,
      clues: clues.items,
      codexEntries: codex.items,
      codexTotal: codex.total,
      ending: ending.ending,
      report,
    })
  }
  async function action<T extends ActionResponse>(
    path: string,
    data: Record<string, unknown>,
  ): Promise<T> {
    if (get().busy) throw new ApiError('ACTION_PENDING', '上一项操作仍在处理中，请稍候。', 409)
    const s = get()
    set({ busy: true, error: null })
    try {
      const body =
        path === '/journeys/start'
          ? data
          : {
              journey_id: s.journeyId,
              state_version: s.stateVersion,
              request_id: crypto.randomUUID(),
              ...data,
            }
      const result = await api.post<T>(path, body)
      applySnapshot(result.snapshot)
      try {
        await catalogs()
      } catch {
        set({ error: '操作已保存，但详情暂未同步。请刷新旅程。' })
      }
      return result
    } catch (error) {
      if (error instanceof ApiError && error.code === 'STATE_CONFLICT')
        await get()
          .refresh()
          .catch(() => undefined)
      set({ error: error instanceof Error ? error.message : '操作失败，请重试。' })
      throw error
    } finally {
      set({ busy: false })
    }
  }
  return {
    ...emptyJourney,
    sessionId: null,
    ready: false,
    loading: false,
    busy: false,
    error: null,
    themes: [],
    roles: [],
    npcs: [],
    spots: [],
    tasks: [],
    clues: [],
    codexEntries: [],
    codexTotal: 0,
    ending: null,
    report: null,
    clearError: () => set({ error: null }),
    restore: () => {
      if (restoring) return restoring
      set({ loading: true, error: null })
      restoring = (async () => {
        try {
          const response = await api.post<{ sessionId: string; snapshot: JourneySnapshot | null }>(
            '/session',
          )
          set({ sessionId: response.sessionId })
          applySnapshot(response.snapshot)
          await catalogs()
          window.localStorage.removeItem('citystory.journey.v1')
          set({ ready: true })
        } catch (error) {
          set({ error: error instanceof Error ? error.message : '无法恢复旅程。', ready: false })
        } finally {
          set({ loading: false })
          restoring = null
        }
      })()
      return restoring
    },
    refresh: async () => {
      const response = await api.get<{ snapshot: JourneySnapshot | null }>('/journeys/current')
      applySnapshot(response.snapshot)
      await catalogs()
      set({ error: null })
    },
    startJourney: async (roleId, mode) => {
      await action('/journeys/start', { story_id: 'suzhou-pingjiang', role_id: roleId, mode })
    },
    setMode: async (mode) => {
      await action('/journeys/mode', { mode })
    },
    arriveSpot: async (spotId, location) => {
      await action('/location/trigger', { spot_id: spotId, ...location })
      return true
    },
    verifyTask: async (taskId, answer) =>
      action<ActionResponse & VerifyResult>(`/tasks/${encodeURIComponent(taskId)}/verify`, {
        answer,
      }),
    sendChat: async (npcId, text) =>
      action<ChatReply>('/chat/message', { npc_id: npcId, message: text }),
    reportIssue: async (npcId, messageId, reason) => {
      await api.post('/chat/feedback', {
        journey_id: get().journeyId,
        npc_id: npcId,
        message_id: messageId,
        reason,
      })
    },
    enterFinale: async (choiceKey) => {
      const response = await action<ActionResponse & { ending: Ending }>('/journeys/finale', {
        choice_key: choiceKey,
      })
      return response.ending.id
    },
    resetJourney: async () => {
      await action('/journeys/reset', {})
    },
    clearSession: async () => {
      if (get().busy) throw new ApiError('ACTION_PENDING', '上一项操作仍在处理中，请稍候。', 409)
      set({ busy: true })
      try {
        await api.delete('/session')
        applySnapshot(null)
        set({ sessionId: null })
        await get().restore()
      } finally { set({ busy: false }) }
    },
  }
})
export function selectKnowledgeScore(s: Pick<JourneyStore, 'taskStates'>): number {
  return Object.values(s.taskStates).reduce((sum, task) => sum + task.score, 0)
}
export function selectMaxScore(): number {
  return useJourney.getState().report?.maxScore ?? 0
}
export function selectCompletedTaskCount(s: Pick<JourneyStore, 'taskStates'>): number {
  return Object.values(s.taskStates).filter((task) => task.status === 'completed').length
}
export function selectCompletedSpotCount(s: Pick<JourneyStore, 'spotStatus'>): number {
  return Object.values(s.spotStatus).filter((status) => status === 'completed').length
}
export function canEnterFinale(
  s: Pick<JourneyStore, 'state' | 'spotStatus' | 'endingId'>,
): boolean {
  return (
    s.state !== 'COMPLETED' &&
    (s.spotStatus.subo === 'current' || s.spotStatus.subo === 'completed') &&
    !s.endingId
  )
}
