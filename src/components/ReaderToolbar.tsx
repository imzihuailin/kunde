import { useState, type ReactNode } from 'react'
import {
  getReaderBackground,
  READER_BACKGROUND_VARIANTS,
  READER_COLOR_OPTIONS,
  type ReaderBackgroundVariantId,
  type ReaderColorId,
} from '../utils/readerBackgrounds'
import { FONT_OPTIONS } from '../utils/fontOptions'

type ExpandKey = 'progress' | 'font' | 'bg' | null

const sliderStyles =
  'h-2 flex-1 appearance-none rounded-full bg-slate-200 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500'

interface ReaderToolbarProps {
  visible: boolean
  progress: number
  progressReady: boolean
  fontSize: number
  lineHeight: number
  fontId: string
  colorId: ReaderColorId
  backgroundVariantId: ReaderBackgroundVariantId
  onOpenChapters: () => void
  onOpenSearch: () => void
  onProgressChange: (value: number) => void
  onFontSizeChange: (value: number) => void
  onLineHeightChange: (value: number) => void
  onFontChange: (id: string) => void
  onColorChange: (id: ReaderColorId) => void
  onBackgroundVariantChange: (id: ReaderBackgroundVariantId) => void
}

export function ReaderToolbar({
  visible,
  progress,
  progressReady,
  fontSize,
  lineHeight,
  fontId,
  colorId,
  backgroundVariantId,
  onOpenChapters,
  onOpenSearch,
  onProgressChange,
  onFontSizeChange,
  onLineHeightChange,
  onFontChange,
  onColorChange,
  onBackgroundVariantChange,
}: ReaderToolbarProps) {
  const [expanded, setExpanded] = useState<ExpandKey>(null)
  const currentBackground = getReaderBackground(colorId, backgroundVariantId)
  const hoverClass = currentBackground.isDarkScheme ? 'hover:bg-white/10' : 'hover:bg-black/5'
  const activeClass = 'bg-blue-500/20 text-blue-500'
  const toolbarItems: Array<{ key: ExpandKey; label: string; icon: ReactNode }> = [
    {
      key: 'progress',
      label: '进度',
      icon: (
        <div
          className="relative h-2.5 w-11 rounded-full"
          style={{ backgroundColor: `${currentBackground.textColor}30` }}
        >
          <div
            className="absolute top-1/2 h-3 w-3 -translate-y-1/2 -translate-x-1/2 rounded-full bg-blue-500"
            style={{ left: `${Math.max(2, Math.min(progress, 98))}%` }}
          />
        </div>
      ),
    },
    { key: 'font', label: '字体', icon: <span className="text-2xl font-serif font-bold">A</span> },
    { key: 'bg', label: '背景', icon: <span className="text-2xl font-bold">B</span> },
  ]

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-[60] transition-transform duration-300 ${
        visible ? 'translate-y-0' : 'translate-y-full pointer-events-none'
      }`}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        className="border-t shadow-[0_-12px_35px_rgba(15,23,42,0.12)] backdrop-blur-xl"
        style={{
          backgroundColor: currentBackground.surfaceOverlay,
          borderColor: currentBackground.borderColor,
          color: currentBackground.textColor,
        }}
      >
        <div className="mx-auto max-w-6xl px-5 py-2">
          <div className="flex items-stretch justify-center gap-6">
            <button
              type="button"
              onClick={onOpenChapters}
              className={`flex min-w-[2.9rem] flex-col items-center gap-1 rounded-xl px-2 py-1.5 transition ${hoverClass}`}
              title="章节目录"
            >
              <div className="flex h-7 w-7 flex-col items-center justify-center gap-1">
                <span className="h-0.5 w-[1.15rem] rounded-full bg-current" />
                <span className="h-0.5 w-[1.15rem] rounded-full bg-current" />
                <span className="h-0.5 w-[1.15rem] rounded-full bg-current" />
              </div>
              <span className="text-[10px] leading-none">目录</span>
            </button>

            {toolbarItems.map(({ key, label, icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setExpanded((prev) => (prev === key ? null : key))}
                className={`flex min-w-[2.9rem] flex-col items-center gap-1 rounded-xl px-2 py-1.5 transition ${
                  expanded === key ? activeClass : hoverClass
                }`}
                title={label}
              >
                <div className="flex h-7 items-center justify-center">{icon}</div>
                <span className="text-[10px] leading-none">{label}</span>
              </button>
            ))}

            <button
              type="button"
              onClick={onOpenSearch}
              className={`flex min-w-[2.9rem] flex-col items-center gap-1 rounded-xl px-2 py-1.5 transition ${hoverClass}`}
              title="搜索"
            >
              <div className="flex h-7 w-7 items-center justify-center">
                <span className="relative block h-5 w-5">
                  <span className="absolute left-0 top-0 h-3.5 w-3.5 rounded-full border-[2.5px] border-current" />
                  <span className="absolute bottom-[1px] right-0 h-2.5 w-1 origin-bottom rotate-[-45deg] rounded-full bg-current" />
                </span>
              </div>
              <span className="text-[10px] leading-none">搜索</span>
            </button>
          </div>

          {expanded && (
            <div className="mt-2 border-t pt-2" style={{ borderColor: currentBackground.borderColor }}>
              {expanded === 'progress' && (
                <div className="flex items-center gap-3">
                  <span className="w-10 shrink-0 text-xs opacity-75">进度</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="0.1"
                    value={progress}
                    disabled={!progressReady}
                    onChange={(event) => onProgressChange(parseFloat(event.target.value))}
                    className={`${sliderStyles} ${progressReady ? '' : 'cursor-not-allowed opacity-50'}`}
                  />
                  <span className="w-12 shrink-0 text-right text-xs opacity-75">
                    {progressReady ? `${Math.round(progress)}%` : '--'}
                  </span>
                </div>
              )}

              {expanded === 'font' && (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3">
                    <span className="w-10 shrink-0 text-xs opacity-75">字号</span>
                    <input
                      type="range"
                      min="14"
                      max="30"
                      step="1"
                      value={fontSize}
                      onChange={(event) => onFontSizeChange(parseInt(event.target.value, 10))}
                      className={sliderStyles}
                    />
                    <span className="w-12 shrink-0 text-right text-xs opacity-75">{fontSize}px</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-10 shrink-0 text-xs opacity-75">行距</span>
                    <input
                      type="range"
                      min="1.2"
                      max="2.2"
                      step="0.1"
                      value={lineHeight}
                      onChange={(event) => onLineHeightChange(parseFloat(event.target.value))}
                      className={sliderStyles}
                    />
                    <span className="w-12 shrink-0 text-right text-xs opacity-75">
                      {lineHeight.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {FONT_OPTIONS.map((font) => (
                      <button
                        key={font.id}
                        type="button"
                        onClick={() => onFontChange(font.id)}
                        className={`rounded-xl px-2.5 py-1 text-sm transition ${
                          fontId === font.id
                            ? 'bg-blue-500 text-white'
                            : currentBackground.isDarkScheme
                              ? 'bg-white/15 hover:bg-white/20'
                              : 'bg-black/5 hover:bg-black/10'
                        }`}
                      >
                        {font.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {expanded === 'bg' && (
                <div className="space-y-3">
                  <div>
                    <div className="mb-2 text-xs opacity-75">颜色</div>
                    <div className="grid grid-cols-4 gap-2">
                      {READER_COLOR_OPTIONS.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => onColorChange(option.id)}
                          className={`relative h-14 overflow-hidden rounded-[1.1rem] border transition ${
                            colorId === option.id ? 'scale-[1.02] shadow-lg' : 'hover:-translate-y-0.5'
                          }`}
                          style={{
                            borderColor:
                              colorId === option.id
                                ? option.previewBorder
                                : currentBackground.borderColor,
                            backgroundImage: `url("${option.previewImage}")`,
                            backgroundSize: 'cover',
                          }}
                        >
                          <span
                            className="absolute inset-0"
                            style={{ backgroundColor: option.overlayTint }}
                          />
                          <span className="relative z-10 text-sm font-medium">{option.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 text-xs opacity-75">背景</div>
                    <div className="grid grid-cols-3 gap-2">
                      {READER_BACKGROUND_VARIANTS.map((variant) => {
                        const preview = getReaderBackground(colorId, variant.id)
                        const selected = variant.id === backgroundVariantId
                        return (
                          <button
                            key={variant.id}
                            type="button"
                            onClick={() => onBackgroundVariantChange(variant.id)}
                            className={`relative h-20 overflow-hidden rounded-[1.1rem] border transition ${
                              selected ? 'scale-[1.02] shadow-lg' : 'hover:-translate-y-0.5'
                            }`}
                            style={{
                              borderColor: selected ? '#3b82f6' : currentBackground.borderColor,
                              backgroundImage: `url("${preview.image}")`,
                              backgroundSize: 'cover',
                              backgroundPosition: preview.previewPosition,
                            }}
                          >
                            <span
                              className="absolute inset-0"
                              style={{
                                backgroundColor: selected
                                  ? 'rgba(59,130,246,0.12)'
                                  : preview.isDarkScheme
                                    ? 'rgba(5,10,18,0.18)'
                                    : 'rgba(255,255,255,0.1)',
                              }}
                            />
                            <span className="absolute bottom-2.5 left-2.5 text-xs font-medium">
                              {variant.label}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
