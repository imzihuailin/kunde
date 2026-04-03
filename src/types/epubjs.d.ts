declare module 'epubjs' {
  export interface EpubTocItem {
    id?: string
    href: string
    label: string
    subitems?: EpubTocItem[]
  }

  export interface EpubNavigation {
    toc: EpubTocItem[]
  }

  export interface EpubLocations {
    generate(chars?: number): Promise<void>
    percentageFromCfi(cfi: string): number
    cfiFromPercentage(percentage: number): string
  }

  export interface EpubThemeApi {
    default(styles: Record<string, string>): void
    font(name: string): void
    fontSize(size: string): void
    override(name: string, value: string, priority?: boolean): void
  }

  export interface EpubRenditionLocation {
    start: {
      cfi: string
      href?: string
      displayed?: {
        page: number
        total: number
      }
    }
  }

  export interface EpubRendition {
    display(target?: string): Promise<void>
    next(): Promise<void>
    prev(): Promise<void>
    on(event: 'relocated', callback: (location: EpubRenditionLocation) => void): void
    off(event: 'relocated', callback: (location: EpubRenditionLocation) => void): void
    themes: EpubThemeApi
    destroy(): void
  }

  export interface EpubBook {
    ready: Promise<void>
    loaded: {
      metadata: Promise<Record<string, string>>
      navigation: Promise<EpubNavigation>
    }
    locations: EpubLocations
    coverUrl(): Promise<string | null>
    renderTo(element: Element | string, options?: Record<string, unknown>): EpubRendition
    destroy(): void
  }

  export default function ePub(input: ArrayBuffer | Blob | string): EpubBook
}
