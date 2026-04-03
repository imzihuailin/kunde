import ePub, { type EpubTocItem } from 'epubjs'
import { openDB, type DBSchema } from 'idb'

const DB_NAME = 'kunde_reader_db'
const DB_VERSION = 1
const BOOKS_CHANGE_EVENT = 'bookschange'

export interface ChapterItem {
  id: string
  label: string
  href: string
  level: number
}

export interface BookRecord {
  id: string
  title: string
  author: string
  coverUrl: string | null
  fileName: string
  fileSize: number
  importedAt: number
  lastOpenedAt: number | null
  isFavorite: boolean
  progressPercent: number
  locationCfi: string | null
  chapters: ChapterItem[]
  identifier?: string | null
  importFingerprint: string
}

interface BookFileRecord {
  id: string
  file: Blob
}

interface KundeDb extends DBSchema {
  books: {
    key: string
    value: BookRecord
  }
  files: {
    key: string
    value: BookFileRecord
  }
}

function emitBooksChange() {
  window.dispatchEvent(new CustomEvent(BOOKS_CHANGE_EVENT))
}

export function subscribeBooksChange(callback: () => void): () => void {
  const handler = () => callback()
  window.addEventListener(BOOKS_CHANGE_EVENT, handler)
  return () => window.removeEventListener(BOOKS_CHANGE_EVENT, handler)
}

function createFingerprint(file: File): string {
  return [file.name, file.size, file.lastModified].join('__')
}

function normalizeIdentifier(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function flattenToc(items: EpubTocItem[], level = 0): ChapterItem[] {
  return items.flatMap((item, index) => {
    const current: ChapterItem = {
      id: item.id || `${level}-${index}-${item.href}`,
      label: item.label?.trim() || '未命名章节',
      href: item.href,
      level,
    }

    return [current, ...flattenToc(item.subitems ?? [], level + 1)]
  })
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error('封面读取失败'))
    reader.readAsDataURL(blob)
  })
}

const dbPromise = openDB<KundeDb>(DB_NAME, DB_VERSION, {
  upgrade(db) {
    db.createObjectStore('books', { keyPath: 'id' })
    db.createObjectStore('files', { keyPath: 'id' })
  },
})

function sortBooks(books: BookRecord[]): BookRecord[] {
  return [...books].sort((a, b) => {
    const aRank = a.lastOpenedAt ?? a.importedAt
    const bRank = b.lastOpenedAt ?? b.importedAt
    return bRank - aRank
  })
}

export async function listBooks(): Promise<BookRecord[]> {
  const db = await dbPromise
  return sortBooks(await db.getAll('books'))
}

export async function getBook(bookId: string): Promise<BookRecord | undefined> {
  const db = await dbPromise
  return db.get('books', bookId)
}

export async function getBookBlob(bookId: string): Promise<Blob | undefined> {
  const db = await dbPromise
  return (await db.get('files', bookId))?.file
}

export async function deleteBook(bookId: string): Promise<void> {
  const db = await dbPromise
  const tx = db.transaction(['books', 'files'], 'readwrite')
  await tx.objectStore('books').delete(bookId)
  await tx.objectStore('files').delete(bookId)
  await tx.done
  emitBooksChange()
}

export async function toggleFavoriteBook(bookId: string): Promise<boolean> {
  const db = await dbPromise
  const record = await db.get('books', bookId)
  if (!record) throw new Error('书籍不存在')
  const next = { ...record, isFavorite: !record.isFavorite }
  await db.put('books', next)
  emitBooksChange()
  return next.isFavorite
}

export async function updateLastOpenedAt(bookId: string): Promise<void> {
  const db = await dbPromise
  const record = await db.get('books', bookId)
  if (!record) return
  await db.put('books', { ...record, lastOpenedAt: Date.now() })
  emitBooksChange()
}

export async function saveReadingProgress(
  bookId: string,
  payload: { progressPercent: number; locationCfi: string | null },
): Promise<void> {
  const db = await dbPromise
  const record = await db.get('books', bookId)
  if (!record) return
  await db.put('books', {
    ...record,
    progressPercent: Math.max(0, Math.min(100, payload.progressPercent)),
    locationCfi: payload.locationCfi,
  })
  emitBooksChange()
}

export async function getBookChapters(bookId: string): Promise<ChapterItem[]> {
  return (await getBook(bookId))?.chapters ?? []
}

export async function saveImportedBook(file: File): Promise<BookRecord> {
  const db = await dbPromise
  const fileBlob = file.slice(0, file.size, file.type || 'application/epub+zip')
  const epub = ePub(await file.arrayBuffer())

  try {
    await epub.ready
    const metadata = await epub.loaded.metadata
    const navigation = await epub.loaded.navigation
    const identifier = normalizeIdentifier(metadata.identifier)
    const importFingerprint = createFingerprint(file)
    const existingBooks = await db.getAll('books')
    const duplicate = existingBooks.find((item) => {
      if (identifier && item.identifier && item.identifier === identifier) return true
      return item.importFingerprint === importFingerprint
    })

    let coverUrl: string | null = null
    try {
      const generatedCoverUrl = await epub.coverUrl()
      if (generatedCoverUrl) {
        const response = await fetch(generatedCoverUrl)
        if (response.ok) {
          coverUrl = await blobToDataUrl(await response.blob())
        }
        URL.revokeObjectURL(generatedCoverUrl)
      }
    } catch {
      coverUrl = duplicate?.coverUrl ?? null
    }

    const now = Date.now()
    const record: BookRecord = {
      id: duplicate?.id ?? `book_${now}_${Math.random().toString(36).slice(2, 9)}`,
      title: metadata.title?.trim() || file.name.replace(/\.epub$/i, '') || '未命名书籍',
      author: metadata.creator?.trim() || metadata.author?.trim() || duplicate?.author || '未知作者',
      coverUrl: coverUrl ?? duplicate?.coverUrl ?? null,
      fileName: file.name,
      fileSize: file.size,
      importedAt: duplicate?.importedAt ?? now,
      lastOpenedAt: duplicate?.lastOpenedAt ?? null,
      isFavorite: duplicate?.isFavorite ?? false,
      progressPercent: duplicate?.progressPercent ?? 0,
      locationCfi: duplicate?.locationCfi ?? null,
      chapters: flattenToc(navigation.toc ?? []),
      identifier,
      importFingerprint,
    }

    const tx = db.transaction(['books', 'files'], 'readwrite')
    await tx.objectStore('books').put(record)
    await tx.objectStore('files').put({ id: record.id, file: fileBlob })
    await tx.done
    emitBooksChange()
    return record
  } finally {
    epub.destroy()
  }
}
