import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import SourceStatus from '@/components/SourceStatus'
import { safeSourceUrl } from '@/utils/sourceUrl'

test('automatic publication cannot acquire a human-review badge', () => {
  render(<SourceStatus trustLevel="auto_published" reviewStatus="reviewed" />)
  expect(screen.getByText('自动发布 · 未人工核验')).toBeInTheDocument()
  expect(screen.queryByText('已记录人工审核')).not.toBeInTheDocument()
})

test('withdrawn review cannot retain a human-review badge', () => {
  render(<SourceStatus trustLevel="human_reviewed" reviewStatus="pending" />)
  expect(screen.queryByText('已记录人工审核')).not.toBeInTheDocument()
})

test('source links require an absolute HTTP URL without credentials', () => {
  expect(safeSourceUrl('#')).toBeUndefined()
  expect(safeSourceUrl('javascript:alert(1)')).toBeUndefined()
  expect(safeSourceUrl('https://user:secret@example.org/a')).toBeUndefined()
  expect(safeSourceUrl('https://example.org/source')).toBe('https://example.org/source')
})
