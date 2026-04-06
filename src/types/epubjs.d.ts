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

  export interface EpubSearchMatch {
    cfi: string
    excerpt: string
  }

  export interface EpubSection {
    href: string
    index: number
    linear?: boolean
    load(request: (path: string) => Promise<unknown>): Promise<Document>
    unload(): void
    find(query: string): EpubSearchMatch[]
    search(query: string, maxSeqEle?: number): EpubSearchMatch[]
  }

  export interface EpubSpine {
    spineItems: EpubSection[]
    get(target: string | number): EpubSection | null
  }

  export interface EpubThemeApi {
    default(styles: Record<string, string>): void
    font(name: string): void
    fontSize(size: string): void
    override(name: string, value: string, priority?: boolean): void
  }

  export interface EpubAnnotations {
    highlight(
      cfiRange: string,
      data?: Record<string, unknown>,
      cb?: () => void,
      className?: string,
      styles?: Record<string, string>,
    ): void
    remove(cfiRange: string, type?: 'highlight' | 'underline' | 'mark'): void
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
    annotations: EpubAnnotations
    destroy(): void
  }

  export interface EpubBook {
    ready: Promise<void>
    loaded: {
      metadata: Promise<Record<string, string>>
      navigation: Promise<EpubNavigation>
    }
    locations: EpubLocations
    spine: EpubSpine
    coverUrl(): Promise<string | null>
    load(path: string): Promise<unknown>
    renderTo(element: Element | string, options?: Record<string, unknown>): EpubRendition
    destroy(): void
  }

  export default function ePub(input: ArrayBuffer | Blob | string): EpubBook
}
