interface BookCoverProps {
  title: string
  coverUrl: string | null
}

export function BookCover({ title, coverUrl }: BookCoverProps) {
  if (coverUrl) {
    return (
      <img
        src={coverUrl}
        alt={title}
        className="h-full w-full rounded-[1.75rem] object-cover shadow-[0_16px_50px_rgba(15,23,42,0.15)]"
      />
    )
  }

  return (
    <div className="flex h-full w-full items-center justify-center rounded-[1.75rem] bg-gradient-to-br from-slate-200 via-slate-100 to-white p-6 text-center shadow-[0_16px_50px_rgba(15,23,42,0.1)]">
      <span className="line-clamp-4 text-lg font-semibold leading-7 text-slate-600">{title}</span>
    </div>
  )
}
