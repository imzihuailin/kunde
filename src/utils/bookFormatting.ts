import type { BookRecord } from './bookStorage'

export function formatProgress(progressPercent: number): string {
  return progressPercent <= 0 ? '未开始' : `已读 ${Math.round(progressPercent)}%`
}

export function getBookAuthorLabel(book: BookRecord): string {
  return book.author?.trim() || '未知作者'
}
