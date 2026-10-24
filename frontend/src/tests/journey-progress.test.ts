import { expect, test } from 'vitest'
import { journeyProgress } from '@/utils/journeyProgress'

const snapshot = { state: 'EXPLORING' as const, currentSpotId: null, spotStatus: {}, taskStates: {}, messages: {}, events: [], endingId: null }
test('progress comes from server tasks and survives route changes without local counters', () => {
  const progress = journeyProgress({ ...snapshot, state: 'TASK_ACTIVE', currentSpotId: 'pingjiang', taskStates: { a: {status:'completed', attempts:1, score:15}, b:{status:'available', attempts:0, score:0} } })
  expect(progress.score).toBe(15)
  expect(progress.percent).toBe(50)
  expect(progress.current).toBe(4)
  expect(progress.steps[4].complete).toBe(false)
  expect(progress.steps[3].complete).toBe(false)
})
test('ending and fresh-session stages do not require pathname guesses', () => {
  expect(journeyProgress({...snapshot, state:'CREATED'}).current).toBe(0)
  expect(journeyProgress({...snapshot, state:'COMPLETED', endingId:'ending-complete'}).current).toBe(6)
})
