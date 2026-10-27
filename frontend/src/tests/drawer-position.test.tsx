import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Drawer from '@/components/Drawer'

afterEach(cleanup)

/**
 * jsdom 没有实现 HTMLDialogElement.showModal，因此用 open={false} 渲染：
 * 抽屉不打开，effect 不会调用 showModal，仍然可以断言 DOM 上的定位类与 data-side。
 */
function renderDrawer(side: 'left' | 'right') {
  return render(
    <Drawer open={false} onClose={vi.fn()} title="测试抽屉" side={side}>
      <p>抽屉内容</p>
    </Drawer>,
  )
}

describe('Drawer 左右停靠定位', () => {
  it('side=right 显式清除 left inset，并从右侧贴边', () => {
    const { getByTestId } = renderDrawer('right')
    const drawer = getByTestId('drawer')

    expect(drawer).toHaveAttribute('data-side', 'right')
    expect(drawer).toHaveClass('fixed', 'inset-y-0', 'right-0', 'left-auto', 'border-l')
    expect(drawer).not.toHaveClass('left-0')
    expect(drawer.className).not.toMatch(/(^|\s)left-0(\s|$)/)
  })

  it('side=left 显式清除 right inset，并从左侧贴边', () => {
    const { getByTestId } = renderDrawer('left')
    const drawer = getByTestId('drawer')

    expect(drawer).toHaveAttribute('data-side', 'left')
    expect(drawer).toHaveClass('fixed', 'inset-y-0', 'left-0', 'right-auto', 'border-r')
    expect(drawer).not.toHaveClass('right-0')
    expect(drawer.className).not.toMatch(/(^|\s)right-0(\s|$)/)
  })
})
