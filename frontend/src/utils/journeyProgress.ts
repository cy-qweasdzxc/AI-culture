import type { JourneySnapshot } from '@/types'

export function journeyProgress(state: Pick<JourneySnapshot, 'state' | 'currentSpotId' | 'spotStatus' | 'taskStates' | 'messages' | 'events' | 'endingId'>) {
  const tasks = Object.values(state.taskStates)
  const completed = tasks.filter((task) => task.status === 'completed').length
  const started = state.state !== 'CREATED'
  const ending = Boolean(state.endingId)
  const interactive = Object.values(state.messages).some((thread) => thread.length > 0) || state.events.some((event) => event.kind === 'scene')
  const current = ending ? 6 : state.state === 'ENDING_READY' ? 5 : state.state === 'TASK_ACTIVE' ? 4 : state.state === 'DIALOGUE' ? 3 : started ? 2 : 0
  return {
    completed, total: tasks.length, score: tasks.reduce((sum, task) => sum + task.score, 0),
    percent: tasks.length ? Math.round(completed / tasks.length * 100) : 0,
    current,
    steps: ['选择模式', '选择路线', '探索景点', '文化互动', '完成任务', '结局', '体验报告'].map((label, index) => ({
      label, complete: [started, started, Boolean(state.currentSpotId), interactive, tasks.length > 0 && completed === tasks.length, ending, ending][index],
    })),
    next: ending ? '查看结局与体验报告' : state.state === 'ENDING_READY' ? '前往尾声作出选择' : state.state === 'CHAPTER_COMPLETE' ? '前往下一站' : state.state === 'DIALOGUE' || state.state === 'TASK_ACTIVE' ? '查看线索并完成当前任务' : started ? '在地图选择已解锁景点' : '选择表达模式与剧情角色',
  }
}
