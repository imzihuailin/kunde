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
        className="h-full w-full object-cover"
      />
    )
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-200 via-slate-100 to-white p-6 text-center">
      <span className="line-clamp-4 text-lg font-semibold leading-7 text-slate-600">{title}</span>
    </div>
  )
}
