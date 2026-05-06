import { Link, useLocation } from 'react-router-dom'

export function ShelfHeader() {
  const location = useLocation()
  const shelfTab = { label: '书架', to: '/' }
  const favoriteTab = { label: '收藏', to: '/favorites' }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <Link
            to={shelfTab.to}
            className="flex h-10 w-[104px] items-center rounded-full bg-transparent text-[40px] font-semibold leading-none text-slate-900 transition hover:bg-transparent"
            aria-current={location.pathname === shelfTab.to ? 'page' : undefined}
          >
            {shelfTab.label}
          </Link>
          <Link
            to="/add"
            className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
          >
            添加书籍
          </Link>
        </div>
        <Link
          to={favoriteTab.to}
          className="flex h-10 items-center rounded-full bg-slate-900 px-4 text-sm font-semibold leading-none text-white transition hover:bg-slate-800"
          aria-current={location.pathname === favoriteTab.to ? 'page' : undefined}
        >
          {favoriteTab.label}
        </Link>
      </div>
    </header>
  )
}
