import { Link, useLocation } from 'react-router-dom'

export function ShelfHeader() {
  const location = useLocation()
  const tabs = [
    { label: '书架', to: '/' },
    { label: '收藏', to: '/favorites' },
  ]

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          {tabs.map((tab) => {
            const active = tab.to === '/favorites'
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={`rounded-full px-4 py-2 font-semibold transition ${
                  active
                    ? 'bg-slate-900 text-white hover:bg-slate-800'
                    : 'bg-transparent text-slate-900 hover:bg-transparent'
                } ${tab.to === '/' ? 'text-xl leading-none' : 'text-sm'}`}
                aria-current={location.pathname === tab.to ? 'page' : undefined}
              >
                {tab.label}
              </Link>
            )
          })}
        </div>
        <Link
          to="/add"
          className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
        >
          添加书籍
        </Link>
      </div>
    </header>
  )
}
