import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="seal" aria-hidden>
        迷路
      </span>
      <h1 className="font-serif text-3xl font-bold text-ink">这条巷子不存在</h1>
      <p className="max-w-sm text-sm text-bluegray">你要找的页面不存在或尚未开放，回到首页重新选一条路走。</p>
      <Link to="/" className="btn-primary">
        返回首页
      </Link>
    </div>
  )
}
