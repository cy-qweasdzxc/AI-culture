import { Link } from 'react-router-dom'
import Icon from '@/components/Icon'

export default function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-5 py-16 text-center">
      <Icon name="compass" className="mb-7 h-12 w-12 text-cinnabar" />
      <p className="mb-3 text-xs text-bluegray">404 · 路线之外</p>
      <h1 className="font-serif text-3xl font-bold leading-relaxed text-ink">这条巷子不存在</h1>
      <p className="mt-4 max-w-sm text-sm leading-7 text-ink-soft">
        你要找的页面不存在或尚未开放，回到首页重新选一条路走。
      </p>
      <Link to="/" className="btn-primary mt-8 gap-5">
        返回首页
        <Icon name="arrow" className="h-4 w-4" />
      </Link>
    </main>
  )
}
