/** 核心类型定义（与技术方案数据模型 / 状态机对齐） */

/** 旅程状态机状态（docs/story-state-machine.md） */
export type JourneyState =
  | 'CREATED'
  | 'EXPLORING'
  | 'AT_SPOT'
  | 'DIALOGUE'
  | 'TASK_ACTIVE'
  | 'CHAPTER_COMPLETE'
  | 'ENDING_READY'
  | 'COMPLETED'

/** 点位状态（地图页视觉规范：图标 + 文字 + 形状三通道） */
export type SpotStatus = 'undiscovered' | 'discovered' | 'current' | 'completed'

/** 体验模式 */
export type JourneyMode = 'virtual' | 'onsite'

/** 文化内容四级（输出时必须明确标注） */
export type KnowledgeType = 'fact' | 'disputed' | 'legend' | 'fiction'

/** 任务类型 */
export type TaskType = 'quiz' | 'password' | 'sorting' | 'combine' | 'observation'

export interface Theme {
  id: string
  name: string
  subtitle: string
  city: string
  district: string
  description: string
  durationMinutes: number
  distanceKm: number
}

export interface Spot {
  id: string
  order: number
  name: string
  shortName: string
  /** GCJ-02 坐标（火星坐标系，腾讯地图直接使用） */
  lat: number
  lng: number
  triggerRadiusM: number
  intro: string
  story: string
  npcId?: string
  taskIds: string[]
  codexIds: string[]
}

export interface Role {
  id: string
  name: string
  identity: string
  tagline: string
  description: string
  /** 初始能力：影响可见线索或任务方式 */
  perk: string
  /** 剧情影响：NPC 态度 / 选项 / 结局变量 */
  storyEffect: string
  startClueId: string
  isFictional: true
}

export interface Npc {
  id: string
  name: string
  title: string
  spotId: string
  personality: string[]
  greeting: string
  /** 知识边界：该 NPC 能回答的文化领域 */
  knowledgeScope: string
  isFictional: true
}

/** 证据条目（RAG 检索单元的 Mock；阶段三起由后端审核库提供） */
export interface KnowledgeEvidence {
  id: string
  spotId: string
  type: KnowledgeType
  title: string
  content: string
  source: string
}

export interface CodexEntry {
  id: string
  spotId: string
  type: KnowledgeType
  title: string
  summary: string
  content: string
  source: string
}

export interface QuizOption {
  key: string
  text: string
}

export interface Task {
  id: string
  spotId: string
  type: TaskType
  title: string
  briefing: string
  knowledgeScore: number
  /** quiz / observation */
  options?: QuizOption[]
  answerKey?: string
  /** password */
  password?: string
  passwordHint?: string
  /** sorting */
  sortingItems?: string[]
  sortingAnswer?: number[]
  /** combine：需要的线索 id 组合 */
  requiredClues?: string[]
  /** 答对奖励 */
  rewardClueId?: string
  rewardCodexIds?: string[]
  explanation: string
}

export interface Clue {
  id: string
  name: string
  kind: 'clue' | 'item'
  description: string
  fromSpotId?: string
}

export interface Ending {
  id: string
  name: string
  category: '完整探索型' | '分支选择型' | '未尽探索型'
  narrative: string
  conditionText: string
}

export interface JourneyEvent {
  at: number
  kind: 'journey' | 'spot' | 'task' | 'clue' | 'codex' | 'choice' | 'ending' | 'mode'
  text: string
}

export interface ChatMessage {
  id: string
  from: 'user' | 'npc' | 'system'
  text: string
  evidenceIds?: string[]
  at: number
}

export interface TaskState {
  status: 'locked' | 'available' | 'completed'
  attempts: number
  score: number
}

/** AI 对话结构化响应的 Mock 形态（与技术方案 11.1 节字段对齐） */
export interface MockNpcReply {
  dialogue: string
  intent: string
  emotion: 'calm' | 'pleased' | 'evasive'
  evidence_ids: string[]
  task_action?: 'grant_clue' | 'unlock_codex' | null
  clue_id?: string
  codex_ids?: string[]
  safety_flag: 'ok'
}
