import { Link } from 'react-router-dom'

interface EmptyShelfProps {
  title: string
  description: string
  actionLabel?: string
  actionTo?: string
}

export function EmptyShelf({
  title,
  description,
  actionLabel = '去添加书籍',
  actionTo = '/add',
}: EmptyShelfProps) {
  return (
    <div className="flex min-h-[50vh] flex-col items-start justify-center rounded-[2rem] border border-dashed border-slate-300 bg-white/50 px-[4.5rem] text-left">
      <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
      <p className="mt-3 max-w-lg text-sm leading-7 text-slate-600">{description}</p>
      <Link
        to={actionTo}
        className="mt-6 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
      >
        {actionLabel}
      </Link>
    </div>
  )
}
