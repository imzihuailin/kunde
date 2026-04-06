import ePub, {
  type EpubBook,
  type EpubRendition,
  type EpubRenditionLocation,
  type EpubSection,
} from 'epubjs'
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChapterDrawer } from '../components/ChapterDrawer'
import { ReaderToolbar } from '../components/ReaderToolbar'
import {
  getBook,
  getBookBlob,
  saveReadingProgress,
  updateLastOpenedAt,
  type ChapterItem,
  type BookRecord,
} from '../utils/bookStorage'
import { FONT_OPTIONS } from '../utils/fontOptions'
import { getReaderPreferences, saveReaderPreferences } from '../utils/readerPreferences'
import {
  getReaderBackground,
  type ReaderBackground,
  type ReaderBackgroundVariantId,
  type ReaderColorId,
} from '../utils/readerBackgrounds'

const RESTORE_DISPLAY_TIMEOUT_MS = 6000
const DEFERRED_RESTORE_TIMEOUT_MS = 3000
const RENDITION_DISPLAY_ERROR_EVENT = 'displayerror'
const READER_DEBUG_EVENT = 'kunde-reader-debug'
const READER_DEBUG_VERSION = 'reader-debug-v2'

type RenditionEventCallback = (...args: unknown[]) => void

type RenditionWithEvents = EpubRendition & {
  on: (event: string, callback: RenditionEventCallback) => void
  off?: (event: string, callback: RenditionEventCallback) => void
}

interface ReaderDebugEntry {
  level: 'info' | 'warn'
  message: string
  payload?: Record<string, unknown>
  createdAt: number
}

function emitReaderDebugEntry(level: 'info' | 'warn', message: string, payload?: Record<string, unknown>) {
  if (!import.meta.env.DEV || typeof window === 'undefined') return

  window.dispatchEvent(
    new CustomEvent<ReaderDebugEntry>(READER_DEBUG_EVENT, {
      detail: {
        level,
        message,
        payload,
        createdAt: Date.now(),
      },
    }),
  )
}

function clearWindowTimer(timerRef: MutableRefObject<number | null>) {
  if (timerRef.current !== null) {
    window.clearTimeout(timerRef.current)
    timerRef.current = null
  }
}

function persistCurrentReadingProgress(
  bookId: string | undefined,
  currentLocationCfiRef: MutableRefObject<string | null>,
  progressRef: MutableRefObject<number>,
  initialDisplaySettledRef: MutableRefObject<boolean>,
) {
  if (!bookId || !initialDisplaySettledRef.current) return

  const locationCfi = currentLocationCfiRef.current
  if (!locationCfi) return

  void saveReadingProgress(bookId, {
    progressPercent: Number.isFinite(progressRef.current) ? progressRef.current : 0,
    locationCfi,
  })
}

function logReaderPhaseTiming(label: string, startedAt: number) {
  if (!import.meta.env.DEV) return

  const duration = Math.round(performance.now() - startedAt)
  console.info(`[ReaderPage] ${label}: ${duration}ms`)
  emitReaderDebugEntry('info', `${label}: ${duration}ms`)
}

function logReaderDebug(label: string, payload?: Record<string, unknown>) {
  if (!import.meta.env.DEV) return

  if (payload) {
    console.info(`[ReaderPage] ${label}`, payload)
    emitReaderDebugEntry('info', label, payload)
    return
  }

  console.info(`[ReaderPage] ${label}`)
  emitReaderDebugEntry('info', label)
}

function logReaderWarn(label: string, payload?: Record<string, unknown>) {
  if (!import.meta.env.DEV) return

  if (payload) {
    console.warn(`[ReaderPage] ${label}`, payload)
    emitReaderDebugEntry('warn', label, payload)
    return
  }

  console.warn(`[ReaderPage] ${label}`)
  emitReaderDebugEntry('warn', label)
}

async function logReaderCheckpoint(label: string, payload?: Record<string, unknown>) {
  logReaderDebug(label, payload)

  if (!import.meta.env.DEV) return

  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0)
  })
}

function normalizeReaderError(error: unknown, fallbackMessage: string) {
  return error instanceof Error ? error : new Error(fallbackMessage)
}

function normalizeLoadingProgress(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function getInitialDisplayTarget(savedLocationCfi: string | null) {
  if (!savedLocationCfi) {
    return {
      target: undefined,
      restoreMode: 'default' as const,
      savedLocationCfi: null,
    }
  }

  // Avoid touching saved CFI during startup. In practice this sync parse can
  // hang the main thread before we even reach rendition.display().
  return {
    target: undefined,
    restoreMode: 'default_from_saved_cfi' as const,
    savedLocationCfi,
  }
}

function syncCanPersistLocation(
  canPersistLocationRef: MutableRefObject<boolean>,
  initialDisplaySettledRef: MutableRefObject<boolean>,
  locationsReadyRef: MutableRefObject<boolean>,
) {
  canPersistLocationRef.current =
    initialDisplaySettledRef.current && locationsReadyRef.current
}

function updateInitialDisplaySettled(
  value: boolean,
  initialDisplaySettledRef: MutableRefObject<boolean>,
  canPersistLocationRef: MutableRefObject<boolean>,
  locationsReadyRef: MutableRefObject<boolean>,
) {
  initialDisplaySettledRef.current = value
  syncCanPersistLocation(canPersistLocationRef, initialDisplaySettledRef, locationsReadyRef)
}

function updateLocationsReady(
  value: boolean,
  locationsReadyRef: MutableRefObject<boolean>,
  canPersistLocationRef: MutableRefObject<boolean>,
  initialDisplaySettledRef: MutableRefObject<boolean>,
  setLocationsReady: (value: boolean) => void,
) {
  locationsReadyRef.current = value
  syncCanPersistLocation(canPersistLocationRef, initialDisplaySettledRef, locationsReadyRef)
  setLocationsReady(value)
}

function resetInitializationGuards(
  locationSaveTimerRef: MutableRefObject<number | null>,
  displayTimeoutRef: MutableRefObject<number | null>,
  displayAttemptIdRef: MutableRefObject<number>,
  canPersistLocationRef: MutableRefObject<boolean>,
  initialDisplaySettledRef: MutableRefObject<boolean>,
  locationsReadyRef: MutableRefObject<boolean>,
  userTriggeredLocationSaveRef: MutableRefObject<boolean>,
) {
  clearWindowTimer(locationSaveTimerRef)
  clearWindowTimer(displayTimeoutRef)
  displayAttemptIdRef.current += 1
  canPersistLocationRef.current = false
  initialDisplaySettledRef.current = false
  locationsReadyRef.current = false
  userTriggeredLocationSaveRef.current = false
}

async function waitForInitialDisplay(
  rendition: EpubRendition,
  target: string | undefined,
  hasSavedLocation: boolean,
  displayAttemptIdRef: MutableRefObject<number>,
  displayTimeoutRef: MutableRefObject<number | null>,
  restoreMode: 'default' | 'default_from_saved_cfi' | 'deferred_saved_cfi',
  timeoutMs = RESTORE_DISPLAY_TIMEOUT_MS,
) {
  const startedAt = performance.now()
  const renditionWithEvents = rendition as RenditionWithEvents
  const attemptId = displayAttemptIdRef.current + 1
  displayAttemptIdRef.current = attemptId

  logReaderDebug('initial display:start', {
    attemptId,
    hasSavedLocation,
    target,
    restoreMode,
  })

  return new Promise<void>((resolve, reject) => {
    let settled = false

    const cleanup = () => {
      clearWindowTimer(displayTimeoutRef)
      renditionWithEvents.off?.(RENDITION_DISPLAY_ERROR_EVENT, onDisplayError)
    }

    const finish = (status: 'success' | 'error' | 'timeout', error?: Error) => {
      if (settled || displayAttemptIdRef.current !== attemptId) return

      settled = true
      cleanup()
      if (status === 'success') {
        logReaderDebug('initial display:success', { attemptId, target, restoreMode })
      } else {
        logReaderWarn(`initial display:${status}`, {
          attemptId,
          target,
          restoreMode,
          message: error?.message,
        })
      }
      logReaderPhaseTiming(
        status === 'success' ? 'initial display' : `initial display (${status})`,
        startedAt,
      )

      if (error) {
        reject(error)
        return
      }

      resolve()
    }

    const onDisplayError: RenditionEventCallback = (error) => {
      logReaderWarn('initial display:displayerror event', {
        attemptId,
        target,
        restoreMode,
        error,
      })
      finish('error', normalizeReaderError(error, 'Failed to restore the saved location.'))
    }

    renditionWithEvents.on(RENDITION_DISPLAY_ERROR_EVENT, onDisplayError)

    if (hasSavedLocation) {
      displayTimeoutRef.current = window.setTimeout(() => {
        finish('timeout', new Error('Restore timed out. Please retry or start from the beginning.'))
      }, timeoutMs)
    }

    void rendition
      .display(target)
      .then(() => {
        finish('success')
      })
      .catch((error) => {
        logReaderWarn('initial display:display promise rejected', {
          attemptId,
          target,
          restoreMode,
          error,
        })
        finish('error', normalizeReaderError(error, 'Failed to open the book.'))
      })
  })
}

function getBackgroundLayerStyle(background: ReaderBackground): React.CSSProperties {
  return {
    backgroundColor: background.fallbackColor,
    backgroundImage: `url("${background.image}")`,
    backgroundPosition: background.pagePosition,
    backgroundRepeat: 'no-repeat',
    backgroundSize: 'cover',
  }
}

function attachIframeClickHandlers(
  container: HTMLDivElement | null,
  onToggleToolbar: () => void,
) {
  if (!container) return

  const frames = Array.from(container.querySelectorAll('iframe'))
  for (const frame of frames) {
    const win = frame.contentWindow
    const doc = frame.contentDocument
    if (!win || !doc) continue

    const boundWindow = win as Window & { __kundeClickBound?: boolean }
    if (boundWindow.__kundeClickBound) continue

    doc.addEventListener('click', () => {
      const selection = win.getSelection?.()
      if (selection && selection.toString().trim().length > 0) return
      onToggleToolbar()
    })

    boundWindow.__kundeClickBound = true
  }
}

function shouldIgnoreKeydownTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  )
}

function isPageTurnKey(key: string) {
  return key === 'ArrowLeft' || key === 'ArrowRight' || key === ' ' || key === 'Spacebar'
}

function attachIframeKeyHandlers(
  container: HTMLDivElement | null,
  onPrev: () => void,
  onNext: () => void,
  onEscape: () => void,
) {
  if (!container) return

  const frames = Array.from(container.querySelectorAll('iframe'))
  for (const frame of frames) {
    const win = frame.contentWindow
    const doc = frame.contentDocument
    if (!win || !doc) continue

    const boundWindow = win as Window & { __kundeKeyBound?: boolean }
    if (boundWindow.__kundeKeyBound) continue

    doc.addEventListener('keydown', (event) => {
      if (shouldIgnoreKeydownTarget(event.target)) return

      if (event.repeat) {
        if (isPageTurnKey(event.key)) {
          event.preventDefault()
        }
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        onPrev()
        return
      }

      if (event.key === 'ArrowRight' || event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault()
        onNext()
        return
      }

      if (event.key === 'Escape') {
        onEscape()
      }
    })

    boundWindow.__kundeKeyBound = true
  }
}

function applyReaderStylesToDocument(
  doc: Document,
  options: {
    fontFamily: string
    lineHeight: number
    textColor: string
    linkColor: string
  },
) {
  const styleId = 'kunde-reader-overrides'
  let styleEl = doc.getElementById(styleId) as HTMLStyleElement | null

  if (!styleEl) {
    styleEl = doc.createElement('style')
    styleEl.id = styleId
    doc.head?.appendChild(styleEl)
  }

  styleEl.textContent = `
    html, body, body * {
      font-family: ${options.fontFamily} !important;
      box-sizing: border-box !important;
    }

    body, body * {
      color: ${options.textColor} !important;
      line-height: ${options.lineHeight} !important;
    }

    body {
      margin: 0 !important;
      color: ${options.textColor} !important;
      background: transparent !important;
    }

    p, div, li, blockquote,
    h1, h2, h3, h4, h5, h6 {
      line-height: ${options.lineHeight} !important;
    }

    h1, h2, h3, h4, h5, h6 {
      color: ${options.textColor} !important;
    }

    a {
      color: ${options.linkColor} !important;
    }
  `
}

interface ReaderSearchResult {
  cfi: string
  excerpt: string
  chapterLabel: string
}

function normalizeHref(href?: string): string {
  if (!href) return ''

  try {
    return decodeURIComponent(href).split('#')[0].trim()
  } catch {
    return href.split('#')[0].trim()
  }
}

function normalizeSearchText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function getProgressFromCfi(epub: EpubBook, cfi: string, fallback: number): number {
  try {
    const nextProgress = epub.locations.percentageFromCfi(cfi) * 100
    return Number.isFinite(nextProgress) ? nextProgress : fallback
  } catch {
    return fallback
  }
}

function buildChapterLabelMap(chapters: ChapterItem[]) {
  return new Map(
    chapters.map((chapter) => [normalizeHref(chapter.href), chapter.label.trim() || '未命名章节']),
  )
}

async function buildSearchResults(
  sections: EpubSection[],
  chapterMap: Map<string, string>,
  query: string,
  book: EpubBook,
): Promise<ReaderSearchResult[]> {
  const results: ReaderSearchResult[] = []
  let lastChapterLabel = '开始'

  for (const [index, section] of sections.entries()) {
    if (section.linear === false) continue

    const sectionHref = normalizeHref(section.href)
    const chapterLabel = chapterMap.get(sectionHref) ?? lastChapterLabel ?? `章节 ${index + 1}`
    lastChapterLabel = chapterLabel

    try {
      await section.load(book.load.bind(book))
      const matches = section.search(query)

      results.push(
        ...matches.map((match) => ({
          cfi: match.cfi,
          excerpt: normalizeSearchText(match.excerpt),
          chapterLabel,
        })),
      )
    } finally {
      section.unload()
    }
  }

  return results
}

export function ReaderPage() {
  const { bookId } = useParams<{ bookId: string }>()
  const navigate = useNavigate()
  const readerRef = useRef<HTMLDivElement>(null)
  const renditionRef = useRef<EpubRendition | null>(null)
  const epubBookRef = useRef<EpubBook | null>(null)
  const bookBlobRef = useRef<Blob | null>(null)
  const locationSaveTimerRef = useRef<number | null>(null)
  const activeSearchHighlightCfiRef = useRef<string | null>(null)
  const currentLocationCfiRef = useRef<string | null>(null)
  const progressRef = useRef(0)
  const locationsReadyRef = useRef(false)
  const canPersistLocationRef = useRef(false)
  const initialDisplaySettledRef = useRef(false)
  const displayTimeoutRef = useRef<number | null>(null)
  const displayAttemptIdRef = useRef(0)
  const userTriggeredLocationSaveRef = useRef(false)

  const [book, setBook] = useState<BookRecord | null>(null)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [loadingMessage, setLoadingMessage] = useState('加载中……')
  const [isPreparing, setIsPreparing] = useState(true)
  const [error, setError] = useState('')
  const [restoreFailed, setRestoreFailed] = useState(false)
  const [progress, setProgress] = useState(0)
  const [locationsReady, setLocationsReady] = useState(false)
  const [currentHref, setCurrentHref] = useState<string>()
  const [chapterOpen, setChapterOpen] = useState(false)
  const [toolbarVisible, setToolbarVisible] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [searchResults, setSearchResults] = useState<ReaderSearchResult[]>([])
  const [retryNonce, setRetryNonce] = useState(0)
  const [debugEntries, setDebugEntries] = useState<ReaderDebugEntry[]>([])

  const initialPrefs = useMemo(() => getReaderPreferences(), [])
  const [fontId, setFontId] = useState(initialPrefs.fontId)
  const [fontSize, setFontSize] = useState(initialPrefs.fontSize)
  const [lineHeight, setLineHeight] = useState(initialPrefs.lineHeight)
  const [colorId, setColorId] = useState<ReaderColorId>(initialPrefs.colorId as ReaderColorId)
  const [backgroundVariantId, setBackgroundVariantId] = useState<ReaderBackgroundVariantId>(
    initialPrefs.backgroundVariantId as ReaderBackgroundVariantId,
  )

  const background = getReaderBackground(colorId, backgroundVariantId)

  const setProgressValue = (value: number) => {
    progressRef.current = value
    setProgress(value)
  }

  const setLoadingProgressValue = (value: number) => {
    setLoadingProgress(normalizeLoadingProgress(value))
  }

  const markNextLocationSaveAsUserTriggered = () => {
    userTriggeredLocationSaveRef.current = true
  }

  const clearUserTriggeredLocationSave = () => {
    userTriggeredLocationSaveRef.current = false
  }

  const clearSearchHighlight = () => {
    const rendition = renditionRef.current
    const currentHighlightCfi = activeSearchHighlightCfiRef.current
    if (!rendition || !currentHighlightCfi) return

    rendition.annotations.remove(currentHighlightCfi, 'highlight')
    activeSearchHighlightCfiRef.current = null
  }

  const applySearchHighlight = (cfi: string | null) => {
    const rendition = renditionRef.current
    if (!rendition) return

    const currentHighlightCfi = activeSearchHighlightCfiRef.current
    if (currentHighlightCfi && currentHighlightCfi !== cfi) {
      rendition.annotations.remove(currentHighlightCfi, 'highlight')
    }

    if (!cfi) {
      activeSearchHighlightCfiRef.current = null
      return
    }

    rendition.annotations.highlight(cfi, {}, undefined, 'kunde-search-highlight', {
      fill: '#fde047',
      'fill-opacity': '0.45',
      'mix-blend-mode': 'multiply',
      stroke: '#facc15',
      'stroke-opacity': '0.08',
      'stroke-width': '0.6',
    })
    activeSearchHighlightCfiRef.current = cfi
  }

  useEffect(() => {
    saveReaderPreferences({
      fontId,
      fontSize,
      lineHeight,
      colorId,
      backgroundVariantId,
    })
  }, [fontId, fontSize, lineHeight, colorId, backgroundVariantId])

  useEffect(() => {
    if (!import.meta.env.DEV) return

    const handleDebugEvent = (event: Event) => {
      const detail = (event as CustomEvent<ReaderDebugEntry>).detail
      if (!detail) return

      setDebugEntries((entries) => [...entries.slice(-7), detail])
    }

    window.addEventListener(READER_DEBUG_EVENT, handleDebugEvent as EventListener)
    return () => window.removeEventListener(READER_DEBUG_EVENT, handleDebugEvent as EventListener)
  }, [])

  useEffect(() => {
    const loadBookData = async () => {
      if (!bookId) return

      const dbLoadStartedAt = performance.now()

      resetInitializationGuards(
        locationSaveTimerRef,
        displayTimeoutRef,
        displayAttemptIdRef,
        canPersistLocationRef,
        initialDisplaySettledRef,
        locationsReadyRef,
        userTriggeredLocationSaveRef,
      )

      setIsPreparing(true)
      setLoadingProgressValue(8)
      setLoadingMessage('加载中……')
      setError('')
      setRestoreFailed(false)
      setBook(null)
      setCurrentHref(undefined)
      currentLocationCfiRef.current = null
      setToolbarVisible(false)
      setChapterOpen(false)
      setSearchOpen(false)
      setSearchQuery('')
      setSearchResults([])
      setSearchError('')
      setSearching(false)
      setDebugEntries([])
      activeSearchHighlightCfiRef.current = null
      updateInitialDisplaySettled(
        false,
        initialDisplaySettledRef,
        canPersistLocationRef,
        locationsReadyRef,
      )
      updateLocationsReady(
        false,
        locationsReadyRef,
        canPersistLocationRef,
        initialDisplaySettledRef,
        setLocationsReady,
      )
      setProgressValue(0)

      try {
        const [bookRecord, blob] = await Promise.all([getBook(bookId), getBookBlob(bookId)])
        logReaderPhaseTiming('db load', dbLoadStartedAt)
        setLoadingProgressValue(30)
        if (!bookRecord || !blob) {
          setError('这本书已经不存在了。')
          setIsPreparing(false)
          return
        }

        bookBlobRef.current = blob
        currentLocationCfiRef.current = bookRecord.locationCfi
        setBook({ ...bookRecord, lastOpenedAt: Date.now() })
        setProgressValue(bookRecord.progressPercent)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : '打开失败，请重新导入。')
      }
    }

    void loadBookData()

    return () => {
      persistCurrentReadingProgress(
        bookId,
        currentLocationCfiRef,
        progressRef,
        initialDisplaySettledRef,
      )
      resetInitializationGuards(
        locationSaveTimerRef,
        displayTimeoutRef,
        displayAttemptIdRef,
        canPersistLocationRef,
        initialDisplaySettledRef,
        locationsReadyRef,
        userTriggeredLocationSaveRef,
      )
      renditionRef.current?.destroy()
      renditionRef.current = null
      epubBookRef.current?.destroy()
      epubBookRef.current = null
      bookBlobRef.current = null
      currentLocationCfiRef.current = null
    }
  }, [bookId, retryNonce])

  useEffect(() => {
    let cancelled = false

    const initializeReader = async () => {
      if (!bookId || !book || !readerRef.current || !bookBlobRef.current) return

      await logReaderCheckpoint('initialize:start', {
        bookId,
        hasSavedLocation: Boolean(book.locationCfi),
        savedLocationCfi: book.locationCfi,
        debugVersion: READER_DEBUG_VERSION,
      })

      setLoadingProgressValue(40)
      updateInitialDisplaySettled(
        false,
        initialDisplaySettledRef,
        canPersistLocationRef,
        locationsReadyRef,
      )
      updateLocationsReady(
        false,
        locationsReadyRef,
        canPersistLocationRef,
        initialDisplaySettledRef,
        setLocationsReady,
      )
      setLoadingMessage('加载中……')

      try {
        const epubReadyStartedAt = performance.now()
        const epub = ePub(bookBlobRef.current)
        await logReaderCheckpoint('initialize:epub instance created', { bookId })
        epubBookRef.current = epub
        await epub.ready
        logReaderPhaseTiming('epub.ready', epubReadyStartedAt)
        await logReaderCheckpoint('initialize:epub.ready resolved', { bookId })
        setLoadingProgressValue(65)
        await logReaderCheckpoint('initialize:after setLoadingProgress(65)', { bookId })
        if (cancelled) return

        await logReaderCheckpoint('initialize:select restore target:before', {
          bookId,
          savedLocationCfi: book.locationCfi,
        })
        const { target: initialDisplayTarget, restoreMode } = getInitialDisplayTarget(
          book.locationCfi,
        )
        await logReaderCheckpoint('initialize:restore target selected', {
          bookId,
          savedLocationCfi: book.locationCfi,
          initialDisplayTarget,
          restoreMode,
        })

        await logReaderCheckpoint('initialize:renderTo:before', { bookId })
        const rendition = epub.renderTo(readerRef.current, {
          width: '100%',
          height: '100%',
          manager: 'default',
          flow: 'paginated',
          spread: 'always',
          minSpreadWidth: 960,
          snap: true,
          allowScriptedContent: false,
        })
        await logReaderCheckpoint('initialize:renderTo:after', { bookId })

        renditionRef.current = rendition

        const toggleToolbar = () => {
          setToolbarVisible((visible) => !visible)
          setChapterOpen(false)
          setSearchOpen(false)
          setSearching(false)
        }
        const goPrev = () => {
          markNextLocationSaveAsUserTriggered()
          void renditionRef.current?.prev()
        }
        const goNext = () => {
          markNextLocationSaveAsUserTriggered()
          void renditionRef.current?.next()
        }
        const closePanels = () => {
          setChapterOpen(false)
          setToolbarVisible(false)
          setSearchOpen(false)
          setSearching(false)
        }

        const onRelocated = (location: EpubRenditionLocation) => {
          const cfi = location.start.cfi
          currentLocationCfiRef.current = cfi
          const nextProgress = locationsReadyRef.current
            ? getProgressFromCfi(epub, cfi, progressRef.current)
            : progressRef.current
          setProgressValue(nextProgress)
          setCurrentHref(location.start.href)

          if (!canPersistLocationRef.current) {
            clearWindowTimer(locationSaveTimerRef)
            return
          }

          if (!userTriggeredLocationSaveRef.current) {
            clearWindowTimer(locationSaveTimerRef)
            logReaderDebug('location persist:skipped passive relocation', { cfi })
            return
          }

          clearUserTriggeredLocationSave()

          clearWindowTimer(locationSaveTimerRef)
          locationSaveTimerRef.current = window.setTimeout(() => {
            void saveReadingProgress(bookId, {
              progressPercent: Number.isFinite(nextProgress) ? nextProgress : 0,
              locationCfi: cfi,
            })
          }, 200)
        }

        rendition.on('relocated', onRelocated)
        await logReaderCheckpoint('initialize:relocated listener attached', { bookId })
        ;(rendition as EpubRendition & { on: (event: string, callback: () => void) => void }).on(
          'rendered',
          () => {
            attachIframeClickHandlers(readerRef.current, toggleToolbar)
            attachIframeKeyHandlers(readerRef.current, goPrev, goNext, closePanels)
          },
        )
        await logReaderCheckpoint('initialize:rendered listener attached', { bookId })

        await logReaderCheckpoint('initialize:waitForInitialDisplay:before', {
          bookId,
          initialDisplayTarget,
          restoreMode,
        })
        await waitForInitialDisplay(
          rendition,
          initialDisplayTarget,
          Boolean(book.locationCfi),
          displayAttemptIdRef,
          displayTimeoutRef,
          restoreMode,
        )
        await logReaderCheckpoint('initialize:waitForInitialDisplay:after', { bookId })
        if (cancelled) return

        if (book.locationCfi) {
          setLoadingMessage('恢复上次阅读位置...')
          await logReaderCheckpoint('initialize:restore saved location:before', {
            bookId,
            savedLocationCfi: book.locationCfi,
          })
          try {
            await waitForInitialDisplay(
              rendition,
              book.locationCfi,
              true,
              displayAttemptIdRef,
              displayTimeoutRef,
              'deferred_saved_cfi',
              DEFERRED_RESTORE_TIMEOUT_MS,
            )
            await logReaderCheckpoint('initialize:restore saved location:after', {
              bookId,
              savedLocationCfi: book.locationCfi,
            })
          } catch (restoreError) {
            logReaderWarn('initialize:restore saved location failed', {
              bookId,
              savedLocationCfi: book.locationCfi,
              message: restoreError instanceof Error ? restoreError.message : String(restoreError),
            })
          }
          if (cancelled) return
        }

        setLoadingProgressValue(100)
        updateInitialDisplaySettled(
          true,
          initialDisplaySettledRef,
          canPersistLocationRef,
          locationsReadyRef,
        )
        attachIframeClickHandlers(readerRef.current, toggleToolbar)
        attachIframeKeyHandlers(readerRef.current, goPrev, goNext, closePanels)
        applySearchHighlight(activeSearchHighlightCfiRef.current)
        setIsPreparing(false)
        void updateLastOpenedAt(bookId)

        const locationsStartedAt = performance.now()
        void epub.locations
          .generate(1200)
          .then(() => {
            logReaderPhaseTiming('locations.generate', locationsStartedAt)
            if (cancelled || epubBookRef.current !== epub) return
            updateLocationsReady(
              true,
              locationsReadyRef,
              canPersistLocationRef,
              initialDisplaySettledRef,
              setLocationsReady,
            )

            const currentCfi = currentLocationCfiRef.current
            if (!currentCfi) return

            const nextProgress = getProgressFromCfi(epub, currentCfi, progressRef.current)
            setProgressValue(nextProgress)
          })
          .catch(() => {
            logReaderPhaseTiming('locations.generate (failed)', locationsStartedAt)
            if (cancelled || epubBookRef.current !== epub) return
            updateLocationsReady(
              false,
              locationsReadyRef,
              canPersistLocationRef,
              initialDisplaySettledRef,
              setLocationsReady,
            )
          })
      } catch (initError) {
        if (cancelled) return
        logReaderWarn('initialize:failed', {
          bookId,
          hasSavedLocation: Boolean(book.locationCfi),
          message: initError instanceof Error ? initError.message : String(initError),
        })
        resetInitializationGuards(
          locationSaveTimerRef,
          displayTimeoutRef,
          displayAttemptIdRef,
          canPersistLocationRef,
          initialDisplaySettledRef,
          locationsReadyRef,
          userTriggeredLocationSaveRef,
        )
        updateLocationsReady(
          false,
          locationsReadyRef,
          canPersistLocationRef,
          initialDisplaySettledRef,
          setLocationsReady,
        )
        renditionRef.current?.destroy()
        renditionRef.current = null
        epubBookRef.current?.destroy()
        epubBookRef.current = null
        setRestoreFailed(Boolean(book.locationCfi))
        setIsPreparing(false)
        setError(initError instanceof Error ? initError.message : '阅读器初始化失败')
      }
    }

    void initializeReader()
    return () => {
      cancelled = true
    }
  }, [bookId, book])

  useEffect(() => {
    const rendition = renditionRef.current
    const font = FONT_OPTIONS.find((item) => item.id === fontId) ?? FONT_OPTIONS[0]
    if (!rendition) return

    const applyOverrides = (doc: Document) => {
      applyReaderStylesToDocument(doc, {
        fontFamily: font.fontFamily,
        lineHeight,
        textColor: background.textColor,
        linkColor: background.linkColor,
      })
    }

    rendition.themes.default({
      html: `font-family: ${font.fontFamily} !important;`,
      body: `color: ${background.textColor} !important; line-height: ${lineHeight} !important; background: transparent !important;`,
      'body, body *': `font-family: ${font.fontFamily} !important; color: ${background.textColor} !important;`,
      'body *': `line-height: ${lineHeight} !important; color: ${background.textColor} !important;`,
      p: `line-height: ${lineHeight} !important; margin: 0 0 1em;`,
      'div, li, blockquote': `line-height: ${lineHeight} !important;`,
      'h1, h2, h3, h4, h5, h6': `color: ${background.textColor} !important; line-height: ${lineHeight} !important;`,
      a: `color: ${background.linkColor} !important;`,
    })
    rendition.themes.font(font.fontFamily)
    rendition.themes.fontSize(`${fontSize}px`)
    rendition.themes.override('font-family', font.fontFamily, true)
    rendition.themes.override('color', background.textColor, true)
    rendition.themes.override('background', 'transparent', true)
    rendition.themes.override('line-height', String(lineHeight), true)

    const renditionWithInternals = rendition as EpubRendition & {
      getContents?: () => Array<{ document?: Document }>
      hooks?: {
        content?: {
          register?: (callback: (contents: { document?: Document }) => void) => void
        }
      }
    }

    renditionWithInternals.getContents?.().forEach((contents) => {
      if (contents.document) {
        applyOverrides(contents.document)
      }
    })

    renditionWithInternals.hooks?.content?.register?.((contents) => {
      if (contents.document) {
        applyOverrides(contents.document)
      }
    })
  }, [fontId, fontSize, lineHeight, background.textColor, background.linkColor])

  useEffect(() => {
    applySearchHighlight(activeSearchHighlightCfiRef.current)
  }, [background.isDarkScheme])

  useEffect(() => {
    const epub = epubBookRef.current
    const query = normalizeSearchText(searchQuery)

    if (!searchOpen) return

    if (!epub || !book || !query) return

    let cancelled = false
    const searchTimer = window.setTimeout(() => {
      setSearching(true)
      setSearchError('')

      void buildSearchResults(epub.spine.spineItems, buildChapterLabelMap(book.chapters), query, epub)
        .then((results) => {
          if (cancelled) return
          setSearchResults(results)
        })
        .catch((searchLoadError) => {
          if (cancelled) return
          setSearchResults([])
          setSearchError(searchLoadError instanceof Error ? searchLoadError.message : '搜索失败，请稍后重试')
        })
        .finally(() => {
          if (cancelled) return
          setSearching(false)
        })
    }, 220)

    return () => {
      cancelled = true
      window.clearTimeout(searchTimer)
    }
  }, [book, searchOpen, searchQuery])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreKeydownTarget(event.target)) return

      if (event.repeat) {
        if (isPageTurnKey(event.key)) {
          event.preventDefault()
        }
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        userTriggeredLocationSaveRef.current = true
        void renditionRef.current?.prev()
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        userTriggeredLocationSaveRef.current = true
        void renditionRef.current?.next()
      }
      if (event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault()
        userTriggeredLocationSaveRef.current = true
        void renditionRef.current?.next()
      }
      if (event.key === 'Escape') {
        setChapterOpen(false)
        setToolbarVisible(false)
        setSearchOpen(false)
        setSearching(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const retryRestore = () => {
    resetInitializationGuards(
      locationSaveTimerRef,
      displayTimeoutRef,
      displayAttemptIdRef,
      canPersistLocationRef,
      initialDisplaySettledRef,
      locationsReadyRef,
      userTriggeredLocationSaveRef,
    )
    setError('')
    setRestoreFailed(false)
    setRetryNonce((value) => value + 1)
  }

  const startFromBeginning = async () => {
    if (!bookId) return

    resetInitializationGuards(
      locationSaveTimerRef,
      displayTimeoutRef,
      displayAttemptIdRef,
      canPersistLocationRef,
      initialDisplaySettledRef,
      locationsReadyRef,
      userTriggeredLocationSaveRef,
    )
    await saveReadingProgress(bookId, {
      progressPercent: 0,
      locationCfi: null,
    })

    setError('')
    setRestoreFailed(false)
    setRetryNonce((value) => value + 1)
  }

  const handleProgressChange = (value: number) => {
    const epub = epubBookRef.current
    const rendition = renditionRef.current
    if (!epub || !rendition || !locationsReadyRef.current) return
    const target = epub.locations.cfiFromPercentage(value / 100)
    setProgressValue(value)
    markNextLocationSaveAsUserTriggered()
    void rendition.display(target)
  }

  if (error) {
    return (
      <div className="fixed inset-0 flex items-center justify-center text-slate-700">
        <div className="rounded-3xl bg-white/80 px-8 py-8 text-center shadow-xl">
          <p>{error}</p>
          {restoreFailed && (
            <div className="mt-3 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={retryRestore}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
              >
                重试
              </button>
              <button
                type="button"
                onClick={() => {
                  void startFromBeginning()
                }}
                className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white"
              >
                从头阅读
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => navigate('/')}
            className="mt-4 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            返回书架
          </button>
        </div>
      </div>
    )
  }

  if (!book) {
    return (
      <div className="fixed inset-0 flex items-center justify-center text-slate-700">
        {loadingMessage}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ color: background.textColor }}>
      <div className="absolute inset-0" style={getBackgroundLayerStyle(background)} />
      <div className="absolute inset-0" style={{ backgroundColor: background.pageScrim }} />

      <ChapterDrawer
        open={chapterOpen}
        chapters={book.chapters}
        currentHref={currentHref}
        textColor={background.textColor}
        borderColor={background.borderColor}
        surfaceOverlay={background.surfaceOverlay}
        onClose={() => setChapterOpen(false)}
        onSelect={(href) => {
          setChapterOpen(false)
          clearSearchHighlight()
          markNextLocationSaveAsUserTriggered()
          void renditionRef.current?.display(href)
        }}
      />

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          persistCurrentReadingProgress(
            bookId,
            currentLocationCfiRef,
            progressRef,
            initialDisplaySettledRef,
          )
          navigate('/')
        }}
        className={`absolute left-6 top-6 z-50 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-blue-900/20 transition-all hover:bg-blue-500 ${
          toolbarVisible ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0 pointer-events-none'
        }`}
      >
        返回书架
      </button>

      <div
        className={`absolute left-1/2 top-6 z-[55] w-[min(56rem,calc(100vw-2rem))] -translate-x-1/2 transition-all duration-300 ${
          searchOpen ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0 pointer-events-none'
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="overflow-hidden rounded-[1.75rem] border shadow-[0_20px_60px_rgba(15,23,42,0.24)] backdrop-blur-xl"
          style={{
            backgroundColor: background.surfaceOverlay,
            borderColor: background.borderColor,
            color: background.textColor,
          }}
        >
          <div
            className="flex items-center gap-3 border-b px-5 py-4"
            style={{ borderColor: background.borderColor }}
          >
            <span className="text-xl leading-none">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => {
                const nextQuery = event.target.value
                setSearchQuery(nextQuery)

                if (!normalizeSearchText(nextQuery)) {
                  setSearching(false)
                  setSearchError('')
                  setSearchResults([])
                }
              }}
              placeholder="搜索正文中的关键词"
              className="flex-1 bg-transparent text-sm outline-none placeholder:opacity-50"
              autoFocus={searchOpen}
            />
            <button
              type="button"
              onClick={() => {
                setSearchOpen(false)
                setSearching(false)
              }}
              className={`rounded-full px-3 py-1 text-xs transition ${
                background.isDarkScheme ? 'bg-white/10 hover:bg-white/15' : 'bg-black/5 hover:bg-black/10'
              }`}
            >
              关闭
            </button>
          </div>

          <div className="max-h-[22rem] overflow-y-auto px-3 py-3">
            {!normalizeSearchText(searchQuery) && (
              <div className="px-3 py-8 text-center text-sm opacity-65">输入关键词后即可检索整本书</div>
            )}

            {normalizeSearchText(searchQuery) && searching && (
              <div className="px-3 py-8 text-center text-sm opacity-65">正在搜索...</div>
            )}

            {searchError && !searching && (
              <div className="px-3 py-8 text-center text-sm text-rose-500">{searchError}</div>
            )}

            {!searching && !searchError && normalizeSearchText(searchQuery) && searchResults.length === 0 && (
              <div className="px-3 py-8 text-center text-sm opacity-65">没有找到相关内容</div>
            )}

            {!searching && !searchError && searchResults.length > 0 && (
              <div className="space-y-2">
                {searchResults.map((item) => (
                  <button
                    key={item.cfi}
                    type="button"
                    onClick={() => {
                      setSearchOpen(false)
                      setToolbarVisible(false)
                      setChapterOpen(false)
                      setSearching(false)
                      applySearchHighlight(item.cfi)
                      markNextLocationSaveAsUserTriggered()
                      void renditionRef.current?.display(item.cfi)
                    }}
                    className={`flex w-full items-start gap-4 rounded-2xl px-3 py-3 text-left transition ${
                      background.isDarkScheme ? 'hover:bg-white/8' : 'hover:bg-black/5'
                    }`}
                  >
                    <span className="w-32 shrink-0 text-xs font-medium opacity-70">{item.chapterLabel}</span>
                    <span className="min-w-0 flex-1 text-sm leading-6">{item.excerpt}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className="absolute inset-0 z-10"
        onClick={() => {
          setToolbarVisible((visible) => !visible)
          setChapterOpen(false)
          setSearchOpen(false)
          setSearching(false)
        }}
      >
        <div
          ref={readerRef}
          className="reader-content h-full w-full"
        />
        {isPreparing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/10 px-6">
            <div className="w-full max-w-sm rounded-3xl bg-white/80 px-6 py-5 shadow-xl backdrop-blur-md">
              <div className="flex items-center justify-between text-sm text-slate-700">
                <span>{loadingMessage}</span>
                <span>{loadingProgress}%</span>
              </div>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-blue-500 transition-[width] duration-300 ease-out"
                  style={{ width: `${loadingProgress}%` }}
                />
              </div>
              {import.meta.env.DEV && debugEntries.length > 0 && (
                <div className="mt-4 rounded-2xl bg-slate-950/90 px-3 py-3 font-mono text-[11px] leading-5 text-slate-100">
                  <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                    {READER_DEBUG_VERSION}
                  </div>
                  {debugEntries.map((entry) => (
                    <div key={`${entry.createdAt}-${entry.message}`} className="break-all">
                      <span className={entry.level === 'warn' ? 'text-amber-300' : 'text-sky-300'}>
                        [{entry.level}]
                      </span>{' '}
                      <span>{entry.message}</span>
                      {entry.payload && (
                        <span className="text-slate-400"> {JSON.stringify(entry.payload)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <ReaderToolbar
        visible={toolbarVisible}
        progress={progress}
        progressReady={locationsReady}
        fontSize={fontSize}
        lineHeight={lineHeight}
        fontId={fontId}
        colorId={colorId}
        backgroundVariantId={backgroundVariantId}
        onOpenChapters={() => {
          setToolbarVisible(true)
          setChapterOpen(true)
          setSearchOpen(false)
          setSearching(false)
        }}
        onOpenSearch={() => {
          setToolbarVisible(true)
          setChapterOpen(false)
          setSearchOpen(true)
          setSearchError('')
          if (!normalizeSearchText(searchQuery)) {
            setSearchResults([])
          }
        }}
        onProgressChange={handleProgressChange}
        onFontSizeChange={setFontSize}
        onLineHeightChange={setLineHeight}
        onFontChange={setFontId}
        onColorChange={setColorId}
        onBackgroundVariantChange={setBackgroundVariantId}
      />
    </div>
  )
}
