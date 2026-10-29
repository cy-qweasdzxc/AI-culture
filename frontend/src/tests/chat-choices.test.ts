import { describe, expect, it } from 'vitest'
import { suggestedChoices } from '@/data/chatChoices'
import { SUZHOU_QUESTION_BANK, topicsForSpot } from '@/data/suzhouQuestionBank'

const base = {
  spotId: 'pingjiang',
  roleId: 'apprentice',
  turn: 0,
  offset: 0,
  asked: [] as string[],
}

describe('推荐问题', () => {
  it('首轮保留当前任务问题，并展示五条不同的问题', () => {
    const choices = suggestedChoices('zhou-bo', base)
    expect(choices).toHaveLength(5)
    expect(new Set(choices).size).toBe(5)
    expect(choices).toContain('《平江图》是什么？')
  })

  it('问过之后不再重复推荐同一题', () => {
    const choices = suggestedChoices('zhou-bo', {
      ...base,
      turn: 1,
      asked: ['《平江图》是什么？'],
    })
    expect(choices).not.toContain('《平江图》是什么？')
    expect(choices).toHaveLength(5)
  })

  it('按点位过滤，不在耦园推荐狮子林或拙政园', () => {
    const choices = suggestedChoices('a-heng', {
      ...base,
      spotId: 'ouyuan',
      roleId: 'wanderer',
    })
    expect(choices).toContain('耦园为什么改名？')
    expect(choices.every((choice) => !/狮子林|拙政园/.test(choice))).toBe(true)
  })

  it('在狮子林推荐狮子林相关题目', () => {
    const choices = suggestedChoices('a-heng', {
      ...base,
      spotId: 'shizilin',
      roleId: 'wanderer',
    })
    expect(choices).toContain('狮子林始建于什么朝代？')
    expect(choices.every((choice) => !/耦园|拙政园/.test(choice))).toBe(true)
  })

  it('追问轮次和换一批都会改变批次', () => {
    const first = suggestedChoices('xiao-shen', { ...base, spotId: 'subo' })
    const nextTurn = suggestedChoices('xiao-shen', {
      ...base,
      spotId: 'subo',
      turn: 1,
    })
    const refreshed = suggestedChoices('xiao-shen', {
      ...base,
      spotId: 'subo',
      offset: 1,
    })
    expect(
      new Set([first.join('|'), nextTurn.join('|'), refreshed.join('|')]).size,
    ).toBeGreaterThan(1)
  })

  it('未知 NPC 不硬凑推荐', () => {
    expect(suggestedChoices('unknown', base)).toEqual([])
  })
})


it('任务完成与线索到手后不再推荐对应主线推进题', () => {
  const done = suggestedChoices('zhou-bo', { ...base, completedTaskIds: ['task-pingjiangtu'] })
  expect(done).not.toContain('《平江图》是什么？')
  const clue = suggestedChoices('zhou-bo', { ...base, inventory: ['clue-shaoding'] })
  expect(clue).not.toContain('绍定二年是哪一年？')
})
it('问题池问尽后不循环推荐旧问题', () => {
  const seen = new Set<string>()
  for (let turn = 0; turn < 20; turn++)
    suggestedChoices('zhou-bo', { ...base, turn, asked: [...seen] }).forEach((text) => seen.add(text))
  expect(seen.size).toBeGreaterThan(3)
  expect(suggestedChoices('zhou-bo', { ...base, asked: [...seen] })).toEqual([])
})

it('80 条苏州问题可按当前点位主题筛选，同时保留默认主线入口', () => {
  expect(SUZHOU_QUESTION_BANK).toHaveLength(80)
  expect(topicsForSpot('pingjiang')).toContain('史实辨析')
  const choices = suggestedChoices('zhou-bo', { ...base, topic: '史实辨析' })
  expect(choices.length).toBeGreaterThan(0)
  expect(choices.every((text) => SUZHOU_QUESTION_BANK.some((q) => q.text === text && q.spotId === 'pingjiang' && q.topic === '史实辨析'))).toBe(true)
  expect(suggestedChoices('zhou-bo', base)).toContain('《平江图》是什么？')
})
