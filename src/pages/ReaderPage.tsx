import ePub, { type EpubBook, type EpubRendition, type EpubRenditionLocation } from 'epubjs'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChapterDrawer } from '../components/ChapterDrawer'
import { ReaderToolbar } from '../components/ReaderToolbar'
import {
  getBook,
  getBookBlob,
  saveReadingProgress,
  updateLastOpenedAt,
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

export function ReaderPage() {
  const { bookId } = useParams<{ bookId: string }>()
  const navigate = useNavigate()
  const readerRef = useRef<HTMLDivElement>(null)
  const renditionRef = useRef<EpubRendition | null>(null)
  const epubBookRef = useRef<EpubBook | null>(null)
  const bookBlobRef = useRef<Blob | null>(null)
  const locationSaveTimerRef = useRef<number | null>(null)
  const initAttemptedRef = useRef(false)

  const [book, setBook] = useState<BookRecord | null>(null)
  const [loadingMessage, setLoadingMessage] = useState('加载中……')
  const [isPreparing, setIsPreparing] = useState(true)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(0)
  const [currentHref, setCurrentHref] = useState<string>()
  const [chapterOpen, setChapterOpen] = useState(false)
  const [toolbarVisible, setToolbarVisible] = useState(false)

  const initialPrefs = useMemo(() => getReaderPreferences(), [])
  const [fontId, setFontId] = useState(initialPrefs.fontId)
  const [fontSize, setFontSize] = useState(initialPrefs.fontSize)
  const [lineHeight, setLineHeight] = useState(initialPrefs.lineHeight)
  const [colorId, setColorId] = useState<ReaderColorId>(initialPrefs.colorId as ReaderColorId)
  const [backgroundVariantId, setBackgroundVariantId] = useState<ReaderBackgroundVariantId>(
    initialPrefs.backgroundVariantId as ReaderBackgroundVariantId,
  )

  const background = getReaderBackground(colorId, backgroundVariantId)

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
    const loadBookData = async () => {
      if (!bookId) return

      setIsPreparing(true)
      setLoadingMessage('加载中……')
      setError('')
      setBook(null)
      setCurrentHref(undefined)
      setToolbarVisible(false)
      setChapterOpen(false)
      initAttemptedRef.current = false

      try {
        const [bookRecord, blob] = await Promise.all([getBook(bookId), getBookBlob(bookId)])
        if (!bookRecord || !blob) {
          setError('这本书已经不存在了。')
          setIsPreparing(false)
          return
        }

        await updateLastOpenedAt(bookId)
        bookBlobRef.current = blob
        setBook({ ...bookRecord, lastOpenedAt: Date.now() })
        setProgress(bookRecord.progressPercent)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : '打开失败，请重新导入。')
      }
    }

    void loadBookData()

    return () => {
      if (locationSaveTimerRef.current) {
        window.clearTimeout(locationSaveTimerRef.current)
        locationSaveTimerRef.current = null
      }
      renditionRef.current?.destroy()
      renditionRef.current = null
      epubBookRef.current?.destroy()
      epubBookRef.current = null
      bookBlobRef.current = null
      initAttemptedRef.current = false
    }
  }, [bookId])

  useEffect(() => {
    const initializeReader = async () => {
      if (!bookId || !book || !readerRef.current || !bookBlobRef.current) return
      if (initAttemptedRef.current) return

      initAttemptedRef.current = true
      setLoadingMessage('加载中……')

      try {
        const epub = ePub(await bookBlobRef.current.arrayBuffer())
        epubBookRef.current = epub
        await epub.ready
        await epub.locations.generate(1200)

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

        renditionRef.current = rendition

        const toggleToolbar = () => {
          setToolbarVisible((visible) => !visible)
          setChapterOpen(false)
        }
        const goPrev = () => {
          void renditionRef.current?.prev()
        }
        const goNext = () => {
          void renditionRef.current?.next()
        }
        const closePanels = () => {
          setChapterOpen(false)
          setToolbarVisible(false)
        }

        const onRelocated = (location: EpubRenditionLocation) => {
          const cfi = location.start.cfi
          const nextProgress = epub.locations.percentageFromCfi(cfi) * 100
          setProgress(Number.isFinite(nextProgress) ? nextProgress : 0)
          setCurrentHref(location.start.href)

          if (locationSaveTimerRef.current) {
            window.clearTimeout(locationSaveTimerRef.current)
          }

          locationSaveTimerRef.current = window.setTimeout(() => {
            void saveReadingProgress(bookId, {
              progressPercent: Number.isFinite(nextProgress) ? nextProgress : 0,
              locationCfi: cfi,
            })
          }, 200)
        }

        rendition.on('relocated', onRelocated)
        ;(rendition as EpubRendition & { on: (event: string, callback: () => void) => void }).on(
          'rendered',
          () => {
            attachIframeClickHandlers(readerRef.current, toggleToolbar)
            attachIframeKeyHandlers(readerRef.current, goPrev, goNext, closePanels)
          },
        )

        await rendition.display(book.locationCfi || undefined)
        attachIframeClickHandlers(readerRef.current, toggleToolbar)
        attachIframeKeyHandlers(readerRef.current, goPrev, goNext, closePanels)
        setIsPreparing(false)
      } catch (initError) {
        setError(initError instanceof Error ? initError.message : '阅读器初始化失败')
      }
    }

    void initializeReader()
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
      'body, body *': `font-family: ${font.fontFamily} !important;`,
      'body *': `line-height: ${lineHeight} !important;`,
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
        void renditionRef.current?.prev()
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        void renditionRef.current?.next()
      }
      if (event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault()
        void renditionRef.current?.next()
      }
      if (event.key === 'Escape') {
        setChapterOpen(false)
        setToolbarVisible(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleProgressChange = (value: number) => {
    const epub = epubBookRef.current
    const rendition = renditionRef.current
    if (!epub || !rendition) return
    const target = epub.locations.cfiFromPercentage(value / 100)
    setProgress(value)
    void rendition.display(target)
  }

  if (error) {
    return (
      <div className="fixed inset-0 flex items-center justify-center text-slate-700">
        <div className="rounded-3xl bg-white/80 px-8 py-8 text-center shadow-xl">
          <p>{error}</p>
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
          void renditionRef.current?.display(href)
        }}
      />

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          navigate('/')
        }}
        className={`absolute left-6 top-6 z-50 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg transition-all ${
          toolbarVisible ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0 pointer-events-none'
        }`}
      >
        返回书架
      </button>

      <div
        className="absolute inset-0 z-10"
        onClick={() => {
          setToolbarVisible((visible) => !visible)
          setChapterOpen(false)
        }}
      >
        <div
          ref={readerRef}
          className="reader-content h-full w-full"
        />
        {isPreparing && (
          <div className="absolute inset-0 flex items-center justify-center text-sm opacity-70">
            {loadingMessage}
          </div>
        )}
      </div>

      <ReaderToolbar
        visible={toolbarVisible}
        progress={progress}
        fontSize={fontSize}
        lineHeight={lineHeight}
        fontId={fontId}
        colorId={colorId}
        backgroundVariantId={backgroundVariantId}
        onOpenChapters={() => {
          setToolbarVisible(true)
          setChapterOpen(true)
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
