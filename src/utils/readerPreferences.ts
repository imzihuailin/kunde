import {
  isReaderBackgroundVariantId,
  isReaderColorId,
  resolveLegacyBackgroundId,
} from './readerBackgrounds'
import { FONT_OPTIONS } from './fontOptions'

const READING_PREFERENCES_KEY = 'kunde_reader_preferences'

export interface ReaderPreferences {
  fontId: string
  fontSize: number
  lineHeight: number
  pagePadding: number
  colorId: string
  backgroundVariantId: string
}

const DEFAULTS: ReaderPreferences = {
  fontId: 'yahei-arial',
  fontSize: 18,
  lineHeight: 1.6,
  pagePadding: 15,
  colorId: 'white',
  backgroundVariantId: 'pure',
}

const FONT_ID_SET = new Set(FONT_OPTIONS.map((font) => font.id))

export function getReaderPreferences(): ReaderPreferences {
  try {
    const data = localStorage.getItem(READING_PREFERENCES_KEY)
    if (!data) return { ...DEFAULTS }
    const raw = JSON.parse(data)
    const legacy = resolveLegacyBackgroundId(typeof raw.bgId === 'string' ? raw.bgId : null)
    return {
      fontId:
        typeof raw.fontId === 'string' && FONT_ID_SET.has(raw.fontId)
          ? raw.fontId
          : DEFAULTS.fontId,
      fontSize: typeof raw.fontSize === 'number' ? Math.max(14, Math.min(30, raw.fontSize)) : DEFAULTS.fontSize,
      lineHeight: typeof raw.lineHeight === 'number' ? Math.max(1.2, Math.min(2.2, raw.lineHeight)) : DEFAULTS.lineHeight,
      pagePadding: typeof raw.pagePadding === 'number' ? Math.max(0, Math.min(30, raw.pagePadding)) : DEFAULTS.pagePadding,
      colorId: isReaderColorId(raw.colorId) ? raw.colorId : legacy.colorId,
      backgroundVariantId: isReaderBackgroundVariantId(raw.backgroundVariantId) ? raw.backgroundVariantId : legacy.backgroundVariantId,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveReaderPreferences(prefs: Partial<ReaderPreferences>): void {
  try {
    const next = { ...getReaderPreferences(), ...prefs }
    localStorage.setItem(READING_PREFERENCES_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
}
