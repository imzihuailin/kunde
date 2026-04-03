import { BookCover } from './BookCover'

interface BookCardProps {
  title: string
  author: string
  coverUrl: string | null
  progressLabel: string
  isFavorite: boolean
  onOpen: () => void
  onToggleFavorite: () => void
  onDelete: () => void
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.48 3.5c.2-.62 1.08-.62 1.28 0l1.81 5.56a.68.68 0 0 0 .65.47h5.84c.66 0 .93.84.4 1.23l-4.72 3.43a.68.68 0 0 0-.25.76l1.8 5.56c.2.62-.5 1.12-1.03.74l-4.72-3.44a.68.68 0 0 0-.8 0l-4.72 3.44c-.53.38-1.23-.12-1.03-.74l1.8-5.56a.68.68 0 0 0-.25-.76L2.8 10.76c-.53-.39-.26-1.23.4-1.23h5.84a.68.68 0 0 0 .65-.47L11.48 3.5z"
      />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3" />
    </svg>
  )
}

export function BookCard({
  title,
  author,
  coverUrl,
  progressLabel,
  isFavorite,
  onOpen,
  onToggleFavorite,
  onDelete,
}: BookCardProps) {
  return (
    <article className="group">
      <button type="button" onClick={onOpen} className="w-full text-left">
        <div className="relative aspect-[0.72] overflow-hidden rounded-[1.75rem] bg-white/80 p-3 shadow-[0_24px_80px_rgba(15,23,42,0.12)] transition duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
          <div className="absolute right-5 top-5 z-10 flex items-center gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onToggleFavorite()
              }}
              className={`rounded-full border px-2.5 py-2 backdrop-blur transition ${
                isFavorite ? 'border-amber-300 bg-amber-400/90 text-white' : 'border-white/40 bg-white/75 text-slate-600 hover:bg-white'
              }`}
              aria-label={isFavorite ? '取消收藏' : '收藏书籍'}
            >
              <StarIcon filled={isFavorite} />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onDelete()
              }}
              className="rounded-full border border-white/40 bg-white/75 px-2.5 py-2 text-slate-600 backdrop-blur transition hover:bg-white"
              aria-label="删除书籍"
            >
              <TrashIcon />
            </button>
          </div>
          <BookCover title={title} coverUrl={coverUrl} />
        </div>
        <div className="px-1 pt-4">
          <h3 className="line-clamp-1 text-xl font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 line-clamp-1 text-sm text-slate-500">{author}</p>
          <p className="mt-2 text-sm font-medium text-slate-700">{progressLabel}</p>
        </div>
      </button>
    </article>
  )
}
