import { afterEach, describe, expect, it, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import SourceStatus from '@/components/SourceStatus'
import { safeSourceUrl, sourceName } from '@/utils/sourceUrl'

afterEach(cleanup)
describe('文化来源信任标记', () => {
  it('演示资料即使有人工审核字符串也不能显示为通过审核', () => {
    render(<SourceStatus reviewStatus="reviewed" trustLevel="human_reviewed" isDemo />)
    expect(screen.getByText('参考资料 · 待核验')).toBeInTheDocument()
    expect(screen.queryByText('已记录人工审核')).not.toBeInTheDocument()
  })
  it('来源候选及自动发布不冒充人工审核', () => {
    render(<SourceStatus reviewStatus="reviewed" trustLevel="auto_published" isDemo={false} />)
    expect(screen.getByText('参考资料 · 待核验')).toBeInTheDocument()
    expect(screen.queryByText('已记录人工审核')).not.toBeInTheDocument()
  })
  it('pending 不能借 human_reviewed 字符串显示审核通过', () => {
    render(<SourceStatus reviewStatus="pending" trustLevel="human_reviewed" isDemo={false} />)
    expect(screen.getByText('未核验或待人工确认')).toBeInTheDocument()
  })
  it('撤审与拒绝有明确标签', () => {
    render(<SourceStatus reviewStatus="rejected" trustLevel="unverified" isDemo={false} />)
    expect(screen.getByText('已拒绝或撤审 · 不用于事实检索')).toBeInTheDocument()
  })
  it('历史版本不能借当前条目的重新审核获得信任', () => {
    render(<SourceStatus reviewStatus="reviewed" trustLevel="human_reviewed" isDemo={false} citationCurrent={false} />)
    expect(screen.getByText('历史引用 · 当前审核或版本已失效')).toBeInTheDocument()
    expect(screen.queryByText('已记录人工审核')).not.toBeInTheDocument()
  })
  it('独立审核与剧情虚构、来源许可分别准确显示', () => {
    render(<SourceStatus reviewStatus="reviewed" trustLevel="human_reviewed" isDemo={false} isFictional humanReviewVerified
      sourceUrl="https://example.invalid/synthetic" license="合成测试许可" />)
    expect(screen.getByText('已记录人工审核')).toBeInTheDocument()
    expect(screen.getByText('剧情虚构 · 不作为文化史实')).toBeInTheDocument()
    expect(screen.getByText('许可：合成测试许可')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '查看原始来源' })).toHaveAttribute('href', 'https://example.invalid/synthetic')
  })
})

test('automatic publication cannot acquire a human-review badge', () => {
  render(<SourceStatus trustLevel="auto_published" reviewStatus="reviewed" />)
  expect(screen.getByText('参考资料 · 待核验')).toBeInTheDocument()
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


test('a legacy human_reviewed string without a verified review record stays unverified', () => {
  render(<SourceStatus trustLevel="human_reviewed" reviewStatus="reviewed" isDemo={false} />)
  expect(screen.queryByText('已记录人工审核')).not.toBeInTheDocument()
  expect(screen.getByText('未核验或待人工确认')).toBeInTheDocument()
})

test('来源名称仅移除重复的发布标签，保留来源本身的不确定性', () => {
  expect(sourceName('苏州园林资料（自动发布，未经人工核验）')).toBe('苏州园林资料')
  expect(sourceName('地方掌故（说法存疑）')).toBe('地方掌故（说法存疑）')
  expect(sourceName('演示资料（自动发布，未经人工核验）')).toBe('参考资料')
})
