import type { ChapterItem } from '../utils/bookStorage'

interface ChapterDrawerProps {
  open: boolean
  chapters: ChapterItem[]
  currentHref?: string
  textColor: string
  borderColor: string
  surfaceOverlay: string
  onClose: () => void
  onSelect: (href: string) => void
}

export function ChapterDrawer({
  open,
  chapters,
  currentHref,
  textColor,
  borderColor,
  surfaceOverlay,
  onClose,
  onSelect,
}: ChapterDrawerProps) {
  return (
    <div className={`fixed inset-0 z-[70] transition ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}>
      <div
        className={`absolute inset-0 bg-black/35 transition ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <aside
        className={`absolute inset-y-0 left-0 w-[28rem] max-w-[90vw] transform transition duration-300 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          backgroundColor: surfaceOverlay,
          borderRight: `1px solid ${borderColor}`,
          color: textColor,
        }}
      >
        <div className="flex h-full flex-col backdrop-blur-xl">
          <div className="flex items-center justify-between border-b px-6 py-5" style={{ borderColor }}>
            <h2 className="text-lg font-semibold">章节目录</h2>
            <button type="button" onClick={onClose} className="text-sm opacity-70 transition hover:opacity-100">
              关闭
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-3">
            {chapters.length === 0 ? (
              <div className="rounded-2xl border border-dashed px-5 py-8 text-sm opacity-75" style={{ borderColor }}>
                本书暂无目录
              </div>
            ) : (
              <ul className="space-y-1">
                {chapters.map((chapter) => {
                  const active = currentHref && currentHref.split('#')[0] === chapter.href.split('#')[0]
                  return (
                    <li key={chapter.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(chapter.href)}
                        className={`w-full rounded-2xl px-4 py-3 text-left text-sm transition ${
                          active ? 'bg-blue-500/15 font-semibold text-blue-500' : 'hover:bg-white/10'
                        }`}
                        style={{ paddingLeft: `${16 + chapter.level * 18}px` }}
                      >
                        {chapter.label}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}
