import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookCard } from '../components/BookCard'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyShelf } from '../components/EmptyShelf'
import { ShelfHeader } from '../components/ShelfHeader'
import { formatProgress, getBookAuthorLabel } from '../utils/bookFormatting'
import {
  deleteBook,
  listBooks,
  subscribeBooksChange,
  toggleFavoriteBook,
  type BookRecord,
} from '../utils/bookStorage'

export function FavoritesPage() {
  const navigate = useNavigate()
  const [books, setBooks] = useState<BookRecord[]>([])
  const [deleteTarget, setDeleteTarget] = useState<BookRecord | null>(null)

  useEffect(() => {
    const load = async () => setBooks(await listBooks())
    void load()
    return subscribeBooksChange(() => {
      void load()
    })
  }, [])

  const favorites = useMemo(() => books.filter((book) => book.isFavorite), [books])

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <ShelfHeader />

      <main className="mx-auto max-w-7xl px-6 py-8">
        {favorites.length === 0 ? (
          <EmptyShelf
            title="还没有收藏的书"
            description="在书架里点亮星标，你常读的书就会单独收进这里。"
          />
        ) : (
          <section className="grid grid-cols-2 gap-x-7 gap-y-10 xl:grid-cols-4">
            {favorites.map((book) => (
              <BookCard
                key={book.id}
                title={book.title}
                author={getBookAuthorLabel(book)}
                coverUrl={book.coverUrl}
                progressLabel={formatProgress(book.progressPercent)}
                isFavorite={book.isFavorite}
                onOpen={() => navigate(`/read/${book.id}`)}
                onToggleFavorite={() => void toggleFavoriteBook(book.id)}
                onDelete={() => setDeleteTarget(book)}
              />
            ))}
          </section>
        )}
      </main>

      <ConfirmDialog
        open={!!deleteTarget}
        title="删除这本书？"
        description={`删除后会移除《${deleteTarget?.title ?? ''}》的文件、收藏状态和阅读进度。`}
        confirmText="删除"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return
          void deleteBook(deleteTarget.id)
          setDeleteTarget(null)
        }}
      />
    </div>
  )
}
