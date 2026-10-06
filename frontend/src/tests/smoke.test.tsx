import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { selectKnowledgeScore, useJourney } from '@/engine/journeyStore'
import HomePage from '@/pages/HomePage'

describe('首页', () => {
  it('渲染品牌与开始体验入口', () => {
    const router = createMemoryRouter([{ path: '/', element: <HomePage /> }], { initialEntries: ['/'] })
    render(<RouterProvider router={router} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('把一座城')
    expect(screen.getAllByRole('link', { name: /开始体验/ }).length).toBeGreaterThan(0)
  })
})

describe('旅程引擎（状态机红线：界面无权直接改状态）', () => {
  beforeEach(() => {
    useJourney.getState().resetJourney()
    window.localStorage.clear()
  })

  it('创建旅程后首个点位被发现，其余未发现', () => {
    useJourney.getState().startJourney('scholar', 'virtual')
    const s = useJourney.getState()
    expect(s.state).toBe('EXPLORING')
    expect(s.spotStatus['pingjiang']).toBe('discovered')
    expect(s.spotStatus['subo']).toBe('undiscovered')
    expect(s.inventory).toContain('clue-tuopian')
  })

  it('未发现的点位不能到达（状态边校验）', () => {
    useJourney.getState().startJourney('scholar', 'virtual')
    expect(useJourney.getState().arriveSpot('ouyuan')).toBe(false)
    expect(useJourney.getState().arriveSpot('pingjiang')).toBe(true)
    expect(useJourney.getState().state).toBe('AT_SPOT')
  })

  it('任务答错不计分，答对计分且不可重复完成（幂等）', () => {
    useJourney.getState().startJourney('scholar', 'virtual')
    const wrong = useJourney.getState().verifyTask('task-shuangqipan', 'A')
    expect(wrong.ok).toBe(false)
    expect(selectKnowledgeScore(useJourney.getState())).toBe(0)

    const right = useJourney.getState().verifyTask('task-shuangqipan', 'B')
    expect(right.ok).toBe(true)
    expect(selectKnowledgeScore(useJourney.getState())).toBe(20)

    const again = useJourney.getState().verifyTask('task-shuangqipan', 'B')
    expect(again.ok).toBe(false)
    expect(selectKnowledgeScore(useJourney.getState())).toBe(20)
  })

  it('密码任务缺少前置线索时被拒，获得线索后可通过', () => {
    const j = useJourney.getState()
    j.startJourney('scholar', 'virtual')
    const blocked = useJourney.getState().verifyTask('task-pingjiangtu', '1229')
    expect(blocked.ok).toBe(false)
    expect(blocked.missingClues).toContain('clue-shaoding')

    // 通过 NPC 对话获得线索（Mock 动作校验）
    useJourney.getState().sendChat('zhou-bo', '《平江图》是什么？')
    expect(useJourney.getState().inventory).toContain('clue-shaoding')

    const ok = useJourney.getState().verifyTask('task-pingjiangtu', '1229')
    expect(ok.ok).toBe(true)
  })

  it('越界问题触发拒答兜底，不发放任何奖励', () => {
    useJourney.getState().startJourney('scholar', 'virtual')
    const reply = useJourney.getState().sendChat('zhou-bo', '今晚吃什么外卖好？')
    expect(reply.intent).toBe('out_of_scope')
    expect(reply.dialogue).toContain('现有资料无法确认')
    expect(useJourney.getState().inventory).toHaveLength(1) // 仅有角色初始线索
  })

  it('完成全部任务后按关键选择进入不同结局', () => {
    const j = useJourney.getState()
    j.startJourney('scholar', 'virtual')
    // 通关流程
    useJourney.getState().verifyTask('task-shuangqipan', 'B')
    useJourney.getState().sendChat('zhou-bo', '《平江图》是什么？')
    useJourney.getState().verifyTask('task-pingjiangtu', '1229')
    useJourney.getState().verifyTask('task-jiaou', 'B')
    useJourney.getState().verifyTask('task-shizi-dynasty', 'B')
    useJourney.getState().verifyTask('task-zhuozheng-timeline', [0, 1, 2, 3])
    // task-pianshi 需要两条线索
    useJourney.getState().sendChat('xiao-shen', '片石假山妙在哪里？')
    const combined = useJourney.getState().verifyTask('task-pianshi', 'A')
    expect(combined.ok).toBe(true)

    expect(useJourney.getState().spotStatus['subo']).toBe('completed')
    const endingId = useJourney.getState().enterFinale('keep')
    expect(endingId).toBe('qu-jing')
    expect(useJourney.getState().state).toBe('COMPLETED')
  })

  it('未完成全部任务进入尾声 → 未尽之约', () => {
    const j = useJourney.getState()
    j.startJourney('scholar', 'virtual')
    useJourney.getState().verifyTask('task-shuangqipan', 'B')
    const endingId = useJourney.getState().enterFinale('hang')
    expect(endingId).toBe('wei-jin')
  })
})
