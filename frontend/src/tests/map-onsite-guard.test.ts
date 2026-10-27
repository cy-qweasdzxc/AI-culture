import { expect, test } from 'vitest'
import { MAX_ACCURACY_M, formatAccuracy, isUsableReading } from '@/utils/locationReading'

const reading = (overrides: Partial<{ lat: number; lng: number; accuracy_m: number }> = {}) => ({
  lat: 31.3169,
  lng: 120.6343,
  accuracy_m: 10,
  ...overrides,
})

test('accepts finite readings inside the allowed accuracy range', () => {
  expect(MAX_ACCURACY_M).toBe(100000)
  expect(isUsableReading(reading())).toBe(true)
  expect(isUsableReading(reading({ accuracy_m: 0 }))).toBe(true)
  expect(isUsableReading(reading({ accuracy_m: MAX_ACCURACY_M }))).toBe(true)
})

test('rejects coarse, negative and non-finite readings before submit', () => {
  expect(isUsableReading(reading({ accuracy_m: 806391.7 }))).toBe(false)
  expect(isUsableReading(reading({ accuracy_m: -1 }))).toBe(false)
  expect(isUsableReading(reading({ lat: Number.NaN }))).toBe(false)
  expect(isUsableReading(reading({ lng: Number.NaN }))).toBe(false)
  expect(isUsableReading(reading({ accuracy_m: Number.NaN }))).toBe(false)
  expect(isUsableReading(reading({ lat: Number.POSITIVE_INFINITY }))).toBe(false)
  expect(isUsableReading(reading({ lng: Number.POSITIVE_INFINITY }))).toBe(false)
  expect(isUsableReading(reading({ accuracy_m: Number.POSITIVE_INFINITY }))).toBe(false)
})

test('formats accuracy with metres below one kilometre and kilometres above', () => {
  expect(formatAccuracy(0)).toBe('±0 米')
  expect(formatAccuracy(12)).toBe('±12 米')
  expect(formatAccuracy(999)).toBe('±999 米')
  expect(formatAccuracy(1500)).toBe('±1.5 公里')
  expect(formatAccuracy(806391.7)).toBe('±806 公里')
  expect(formatAccuracy(Number.NaN)).toBe('±未知')
})
