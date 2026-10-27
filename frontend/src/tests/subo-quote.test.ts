import { describe, expect, it } from 'vitest'
import { suggestedChoices } from '@/data/chatChoices'
import { SUZHOU_QUESTION_BANK } from '@/data/suzhouQuestionBank'

const WRONG_QUOTE = '以石为画'
const QUESTION_TEXT = '“以壁为纸，以石为绘”具体描述了怎样的叠石效果？'
const CHOICE_TEXT = '“以壁为纸，以石为绘”是什么意思？'

/** 翻遍苏博推荐问句的轮次与换一批偏移，确保所有会露出的候选都被检查到。 */
function suboRecommendations(): string[] {
  const texts = new Set<string>()
  for (let turn = 0; turn < 24; turn += 1) {
    for (let offset = 0; offset < 3; offset += 1) {
      const choices = suggestedChoices('xiao-shen', { spotId: 'subo', turn, offset, asked: [] })
      choices.forEach((text) => texts.add(text))
    }
  }
  return [...texts]
}

describe('苏博引文用字', () => {
  it('问题池与推荐问句都不含“以石为画”', () => {
    const allTexts = [
      ...SUZHOU_QUESTION_BANK.map((question) => question.text),
      ...suboRecommendations(),
    ]
    expect(allTexts.length).toBeGreaterThan(0)
    expect(allTexts.filter((text) => text.includes(WRONG_QUOTE))).toEqual([])
  })

  it('保留“以石为绘”的已修正文案', () => {
    expect(SUZHOU_QUESTION_BANK.some((question) => question.text === QUESTION_TEXT)).toBe(true)
    expect(suboRecommendations()).toContain(CHOICE_TEXT)
  })
})
