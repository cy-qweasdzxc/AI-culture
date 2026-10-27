import { describe, expect, it } from 'vitest'
import { initialSortingOrder, sortingOrderIsPermutation } from '@/utils/sortingOrder'

const range = (count: number) => Array.from({ length: count }, (_, index) => index)

describe('initialSortingOrder', () => {
  it('uses a valid server-provided permutation without mutating it', () => {
    const serverOrder = [2, 0, 3, 1]
    const order = initialSortingOrder(4, serverOrder)
    expect(order).toEqual([2, 0, 3, 1])
    expect(order).not.toBe(serverOrder)
  })

  it('falls back to a deterministic reversed order when the server omits it', () => {
    for (let count = 2; count <= 8; count += 1) {
      const order = initialSortingOrder(count)
      expect(order).toEqual(range(count).reverse())
      expect(order).not.toEqual(range(count))
      expect(initialSortingOrder(count)).toEqual(order)
    }
  })

  it('rejects stale server orders that are not a permutation of the current items', () => {
    const fallback = [3, 2, 1, 0]
    const invalidOrders = [
      [0, 1, 2],
      [0, 1, 2, 3, 4],
      [0, 1, 2, 2],
      [0, 1, 2, 4],
      [0, 1, 2, -1],
      [0, 1, 2, 1.5],
      [0, 1, 2, Number.NaN],
    ]
    for (const invalid of invalidOrders) {
      expect(sortingOrderIsPermutation(invalid, 4)).toBe(false)
      expect(initialSortingOrder(4, invalid)).toEqual(fallback)
    }
  })

  it('handles empty and single-item tasks without inventing an invalid order', () => {
    expect(initialSortingOrder(0)).toEqual([])
    expect(initialSortingOrder(-1)).toEqual([])
    // A one-item list has no non-identity permutation.
    expect(initialSortingOrder(1)).toEqual([0])
    expect(initialSortingOrder(1, [])).toEqual([0])
  })
})
