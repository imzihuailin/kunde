import ePub, {
  type EpubBook,
  type EpubRendition,
  type EpubRenditionLocation,
  type EpubSection,
} from 'epubjs'
import { useEffect, useMemo, useRef, useState } from 'react'
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
  const initAttemptedRef = useRef(false)
  const activeSearchHighlightCfiRef = useRef<string | null>(null)

  const [book, setBook] = useState<BookRecord | null>(null)
  const [loadingMessage, setLoadingMessage] = useState('加载中……')
  const [isPreparing, setIsPreparing] = useState(true)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(0)
  const [currentHref, setCurrentHref] = useState<string>()
  const [chapterOpen, setChapterOpen] = useState(false)
  const [toolbarVisible, setToolbarVisible] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [searchResults, setSearchResults] = useState<ReaderSearchResult[]>([])

  const initialPrefs = useMemo(() => getReaderPreferences(), [])
  const [fontId, setFontId] = useState(initialPrefs.fontId)
  const [fontSize, setFontSize] = useState(initialPrefs.fontSize)
  const [lineHeight, setLineHeight] = useState(initialPrefs.lineHeight)
  const [colorId, setColorId] = useState<ReaderColorId>(initialPrefs.colorId as ReaderColorId)
  const [backgroundVariantId, setBackgroundVariantId] = useState<ReaderBackgroundVariantId>(
    initialPrefs.backgroundVariantId as ReaderBackgroundVariantId,
  )

  const background = getReaderBackground(colorId, backgroundVariantId)

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
    const loadBookData = async () => {
      if (!bookId) return

      setIsPreparing(true)
      setLoadingMessage('加载中……')
      setError('')
      setBook(null)
      setCurrentHref(undefined)
      setToolbarVisible(false)
      setChapterOpen(false)
      setSearchOpen(false)
      setSearchQuery('')
      setSearchResults([])
      setSearchError('')
      setSearching(false)
      activeSearchHighlightCfiRef.current = null
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
          setSearchOpen(false)
          setSearching(false)
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
          setSearchOpen(false)
          setSearching(false)
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
        applySearchHighlight(activeSearchHighlightCfiRef.current)
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
        setSearchOpen(false)
        setSearching(false)
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
          clearSearchHighlight()
          void renditionRef.current?.display(href)
        }}
      />

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
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
