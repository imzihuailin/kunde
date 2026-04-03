import { Link } from 'react-router-dom'

interface EmptyShelfProps {
  title: string
  description: string
}

export function EmptyShelf({ title, description }: EmptyShelfProps) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-[2rem] border border-dashed border-slate-300 bg-white/50 px-8 text-center">
      <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
      <p className="mt-3 max-w-lg text-sm leading-7 text-slate-600">{description}</p>
      <Link
        to="/add"
        className="mt-6 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
      >
        去添加书籍
      </Link>
    </div>
  )
}
