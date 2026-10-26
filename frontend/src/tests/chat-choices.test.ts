import { describe, expect, it } from 'vitest'
import { suggestedChoices } from '@/data/chatChoices'
import { QUESTION_TOPICS, SUZHOU_QUESTION_BANK } from '@/data/suzhouQuestionBank'

const base = {
  spotId: 'pingjiang',
  roleId: 'apprentice',
  turn: 0,
  offset: 0,
  asked: [] as string[],
}

describe('苏州路线推荐问题', () => {
  it('五个点位各有至少12条不重复的问题，且全局覆盖六个主题', () => {
    const spotIds = ['pingjiang', 'ouyuan', 'shizilin', 'zhuozhengyuan', 'subo']
    for (const spotId of spotIds) {
      const questions = SUZHOU_QUESTION_BANK.filter((question) => question.spotId === spotId)
      expect(questions.length, spotId).toBeGreaterThanOrEqual(12)
      expect(new Set(questions.map((question) => question.text)).size, spotId).toBe(
        questions.length,
      )
    }
    expect(new Set(SUZHOU_QUESTION_BANK.map((question) => question.text)).size).toBe(
      SUZHOU_QUESTION_BANK.length,
    )
    expect(new Set(SUZHOU_QUESTION_BANK.map((question) => question.topic))).toEqual(
      new Set(QUESTION_TOPICS),
    )
  })

  it('默认主题首轮保留五站原主线入口题，并凑足三条', () => {
    const mainlineEntries = [
      ['zhou-bo', 'pingjiang', '《平江图》是什么？'],
      ['a-heng', 'ouyuan', '耦园为什么改名？'],
      ['a-heng', 'shizilin', '狮子林始建于什么朝代？'],
      ['a-heng', 'zhuozhengyuan', '拙政园是什么时候列入世界遗产的？'],
      ['xiao-shen', 'subo', '片石假山妙在哪里？'],
    ] as const
    for (const [npcId, spotId, entry] of mainlineEntries) {
      const choices = suggestedChoices(npcId, { ...base, spotId })
      expect(choices).toHaveLength(3)
      expect(new Set(choices).size).toBe(3)
      expect(choices).toContain(entry)
    }
  })

  it('按主题筛选推荐问题', () => {
    const choices = suggestedChoices('a-heng', {
      ...base,
      spotId: 'ouyuan',
      roleId: 'wanderer',
      topic: '园林营造',
    })
    expect(choices.length).toBeGreaterThan(0)
    expect(choices.every((question) => /耦园|园|假山/.test(question))).toBe(true)
  })

  it('问过之后不再重复推荐同一题', () => {
    const asked = '平江路的河道和街巷怎样组成“双棋盘”？'
    const choices = suggestedChoices('zhou-bo', {
      ...base,
      turn: 1,
      asked: [asked],
    })
    expect(choices).not.toContain(asked)
    expect(choices).toHaveLength(3)
  })

  it('点位与角色不匹配时不借用 NPC 默认点位的问题', () => {
    expect(suggestedChoices('a-heng', { ...base, spotId: 'pingjiang' })).toEqual([])
    expect(suggestedChoices('a-heng', { ...base, spotId: null })).toEqual([])
    expect(suggestedChoices('zhou-bo', { ...base, spotId: 'ouyuan' })).toEqual([])
  })

  it('阿蘅在三个园林点位分别只推荐当前点位问题', () => {
    for (const [spotId, otherSpot] of [
      ['ouyuan', /狮子林|拙政园/],
      ['shizilin', /耦园|拙政园/],
      ['zhuozhengyuan', /耦园|狮子林/],
    ] as const) {
      const choices = suggestedChoices('a-heng', { ...base, spotId, roleId: 'wanderer' })
      expect(
        choices.every(
          (question) =>
            SUZHOU_QUESTION_BANK.find((item) => item.text === question)?.spotId === spotId,
        ),
      ).toBe(true)
      expect(choices.every((question) => !otherSpot.test(question))).toBe(true)
    }
  })

  it('追问轮次和换一批可以改变推荐批次', () => {
    const first = suggestedChoices('xiao-shen', { ...base, spotId: 'subo' })
    const nextTurn = suggestedChoices('xiao-shen', { ...base, spotId: 'subo', turn: 1 })
    const refreshed = suggestedChoices('xiao-shen', { ...base, spotId: 'subo', offset: 1 })
    expect(
      new Set([first.join('|'), nextTurn.join('|'), refreshed.join('|')]).size,
    ).toBeGreaterThan(1)
  })

  it('所有问题都问过后不再露出已问问题', () => {
    const asked = SUZHOU_QUESTION_BANK.filter((question) => question.spotId === 'pingjiang').map(
      (question) => question.text,
    )
    expect(suggestedChoices('zhou-bo', { ...base, asked, turn: asked.length })).toEqual([])
  })

  it('未知 NPC 不硬凑推荐', () => {
    expect(suggestedChoices('unknown', base)).toEqual([])
  })
})
