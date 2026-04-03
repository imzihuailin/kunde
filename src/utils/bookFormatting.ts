import type { BookRecord, ChapterItem } from './bookStorage'

export function formatProgress(progressPercent: number): string {
  return progressPercent <= 0 ? '未开始' : `已读 ${Math.round(progressPercent)}%`
}

export function getBookAuthorLabel(book: BookRecord): string {
  return book.author?.trim() || '未知作者'
}

export function findCurrentChapter(chapters: ChapterItem[], href?: string): ChapterItem | null {
  if (!href) return null
  const normalizedHref = href.split('#')[0]
  return chapters.find((chapter) => chapter.href.split('#')[0] === normalizedHref) ?? null
}
