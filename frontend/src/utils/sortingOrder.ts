/**
 * Build the display order for a sorting task without revealing the answer.
 *
 * The server sends a safe scrambled `initialOrder` for new payloads. Older
 * servers omit it, so the deterministic fallback is a single left rotation,
 * [1, 2, ..., n-1, 0]. For two or more items that is non-identity; for the
 * four-item demo task it also differs from both the normal answer [0,1,2,3]
 * and the advanced-difficulty reversed answer [3,2,1,0]. A malformed or stale
 * server order also falls back rather than rendering an invalid permutation.
 */
export function sortingOrderIsPermutation(
  order: readonly number[] | null | undefined,
  itemCount: number,
): order is readonly number[] {
  if (!Array.isArray(order) || order.length !== itemCount) return false
  const seen = new Set<number>()
  for (const index of order) {
    if (!Number.isInteger(index) || index < 0 || index >= itemCount || seen.has(index)) return false
    seen.add(index)
  }
  return true
}

export function initialSortingOrder(
  itemCount: number,
  serverOrder?: readonly number[] | null,
): number[] {
  if (!Number.isInteger(itemCount) || itemCount <= 0) return []
  if (sortingOrderIsPermutation(serverOrder, itemCount)) return [...serverOrder]
  return Array.from({ length: itemCount }, (_, index) => (index + 1) % itemCount)
}
