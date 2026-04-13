# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. # 此文件为 Claude Code (claude.ai/code) 在此代码库中工作时提供指导。

## Project Overview

Kunde is a web-based EPUB reader built with React, Vite, and Tailwind CSS. # Kunde 是一个基于 React、Vite 和 Tailwind CSS 构建的网页版 EPUB 阅读器。
It stores books locally using IndexedDB (via `idb` library) and renders EPUB content using the `epubjs` library. # 它使用 IndexedDB（通过 `idb` 库）在本地存储书籍，并使用 `epubjs` 库渲染 EPUB 内容。
The app is entirely client-side with no backend. # 该应用完全是客户端运行，没有后端。

## Development Commands

- `npm run dev` - Start development server # 启动开发服务器
- `npm run build` - Build for production (runs TypeScript compiler then Vite build) # 生产环境构建（运行 TypeScript 编译器然后执行 Vite 构建）
- `npm run lint` - Run ESLint # 运行 ESLint
- `npm run preview` - Preview production build # 预览生产构建

## Architecture

### Core Libraries

- **epubjs**: Renders EPUB files and provides navigation, locations, search, and rendering capabilities. # 渲染 EPUB 文件并提供导航、定位、搜索和渲染功能。
Custom type definitions are in `src/types/epubjs.d.ts`. # 自定义类型定义位于 `src/types/epubjs.d.ts`。
- **idb**: IndexedDB wrapper for persistent storage of book metadata and file blobs. # IndexedDB 封装库，用于持久化存储书籍元数据和文件 Blob。
- **react-router-dom**: Client-side routing between home, favorites, add book, and reader pages. # 客户端路由，用于在首页、收藏、添加书籍和阅读器页面之间导航。

### Storage Layer (`src/utils/bookStorage.ts`)

The IndexedDB schema has two object stores: # IndexedDB 模式包含两个对象存储：
- `books`: BookRecord objects containing metadata, reading progress, chapters, and a unique `importFingerprint` (SHA-256 hash) for duplicate detection # BookRecord 对象，包含元数据、阅读进度、章节以及用于重复检测的唯一 `importFingerprint`（SHA-256 哈希）
- `files`: Blob storage of the actual EPUB file data # 实际 EPUB 文件数据的 Blob 存储

Key functions: # 核心函数：
- `saveImportedBook()`: Parses EPUB metadata, extracts cover, flattens TOC, and stores book. # 解析 EPUB 元数据、提取封面、扁平化目录并存储书籍。
Detects duplicates by `identifier` or `importFingerprint`. # 通过 `identifier` 或 `importFingerprint` 检测重复。
- `listBooks()`, `getBook()`, `getBookBlob()`: Retrieve book data # 检索书籍数据
- `deleteBook()`, `toggleFavoriteBook()`, `updateLastOpenedAt()`, `saveReadingProgress()`: Modify book records # 修改书籍记录
- `subscribeBooksChange()`: Subscribe to custom events emitted when books change # 订阅书籍变更时发出的自定义事件

### Reader Page (`src/pages/ReaderPage.tsx`)

This is the most complex component. # 这是最复杂的组件。
Key patterns: # 核心模式：

**Initialization flow**: # 初始化流程：
1. Load book metadata and blob from IndexedDB # 从 IndexedDB 加载书籍元数据和 Blob
2. Create epub.js instance and wait for `ready` promise # 创建 epub.js 实例并等待 `ready` promise
3. Call `epub.renderTo()` to create rendition with pagination settings # 调用 `epub.renderTo()` 创建带有分页设置的 rendition
4. Call `rendition.display()` - if saved CFI exists, defer restoration to avoid blocking # 调用 `rendition.display()` - 如果存在保存的 CFI，延迟恢复以避免阻塞
5. Generate locations (1200 chars) for progress calculation # 生成定位点（1200 字符）用于进度计算
6. Set flags: `initialDisplaySettledRef` and `locationsReadyRef` for location persistence # 设置标志位：`initialDisplaySettledRef` 和 `locationsReadyRef` 用于位置持久化

**Location persistence**: # 位置持久化：
- `canPersistLocationRef` guards when location can be saved (only after initial display settles AND locations are ready) # 控制何时可以保存位置（仅在初始显示完成且定位点就绪后）
- `userTriggeredLocationSaveRef` distinguishes between user page turns and passive relocations # 区分用户翻页和被动重新定位
- Location is debounced 200ms after user-triggered relocations # 用户触发的重新定位后，位置保存会延迟 200ms

**Styling application**: # 样式应用：
- Uses epub.js themes API for global styles # 使用 epub.js themes API 应用全局样式
- Also injects direct styles into iframe documents via `rendition.hooks.content.register()` and `getContents()` # 同时通过 `rendition.hooks.content.register()` 和 `getContents()` 直接注入样式到 iframe 文档
- This dual approach is necessary because some styles don't apply reliably through themes alone # 这种双重方法是必要的，因为某些样式仅通过 themes API 无法可靠应用

**Reader backgrounds** (`src/utils/readerBackgrounds.ts`): # 阅读器背景：
- 4 color themes: white, yellow, green, dark # 4 种颜色主题：白色、米黄、淡绿、夜间
- 3 variants each: pure, moon, scene # 每种主题 3 个变体：纯色、月色、景色
- Backgrounds are served from `public/reader-backgrounds/` with fallback colors # 背景图从 `public/reader-backgrounds/` 提供并带有后备颜色

### Reader Preferences (`src/utils/readerPreferences.ts`)

Stored in localStorage under `kunde_reader_preferences`: # 存储在 localStorage 的 `kunde_reader_preferences` 键下：
- `fontId`: Font family selection # 字体族选择
- `fontSize`: 14-30 range, default 18 # 14-30 范围，默认 18
- `lineHeight`: 1.2-2.2 range, default 1.6 # 1.2-2.2 范围，默认 1.6
- `pagePadding`: 0-30 range, default 15 # 0-30 范围，默认 15
- `colorId` + `backgroundVariantId`: Reader theme # 阅读器主题

Legacy migration: Old `bgId` values are resolved to new `colorId`/`backgroundVariantId` pairs. # 遗留迁移：旧的 `bgId` 值会被解析为新的 `colorId`/`backgroundVariantId` 对。

### Chapter Drawer (`src/components/ChapterDrawer.tsx`)

Uses `scrollIntoView({ block: 'center' })` to auto-scroll the active chapter into view when opened. # 使用 `scrollIntoView({ block: 'center' })` 在打开时自动滚动到当前章节。
Tracks `wasOpenRef` and `hasAutoCenteredThisOpenRef` to prevent re-centering on subsequent renders. # 跟踪 `wasOpenRef` 和 `hasAutoCenteredThisOpenRef` 以防止在后续渲染中重复居中。

## Type Safety

The project uses TypeScript with strict mode. # 项目使用严格模式的 TypeScript。
Key custom types: # 核心自定义类型：
- `BookRecord`: Complete book metadata structure # 完整的书籍元数据结构
- `ChapterItem`: Flattened TOC entry with level # 带层级的扁平化目录条目
- `ReaderPreferences`: User reader settings # 用户阅读器设置
- `ReaderBackground`: Theme configuration # 主题配置
