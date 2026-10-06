import { create } from 'zustand'
import type { JourneyMode } from '@/types'

interface SessionState {
  /** 匿名 Session 标记（HttpOnly Cookie 之外的界面侧缓存；权威状态在服务端） */
  sessionId: string | null
  /** 已选玩家角色 ID */
  roleId: string | null
  /** 体验模式：虚拟游览 / 实地定位 */
  mode: JourneyMode
  setSession: (sessionId: string) => void
  setRole: (roleId: string) => void
  setMode: (mode: JourneyMode) => void
  reset: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  sessionId: null,
  roleId: null,
  mode: 'virtual',
  setSession: (sessionId) => set({ sessionId }),
  setRole: (roleId) => set({ roleId }),
  setMode: (mode) => set({ mode }),
  reset: () => set({ sessionId: null, roleId: null, mode: 'virtual' }),
}))
