# Kunde（坤德）

Kunde 是一个本地优先的 EPUB 阅读器，专注于纯粹、安静的阅读体验。它是纯前端 WebApp，各平台通用；书籍文件和阅读进度保存在浏览器本地。

## 介绍

- **专注阅读**：全屏沉浸式阅读，没有背景干扰。
- **美观**：借鉴微信读书的阅读背景，提供舒适的阅读视觉。
- **本地免费开源**：纯前端实现，阅读进度保存在本地。
- **书架管理**：直接拖入或选择 EPUB 格式的电子书。目前只支持 EPUB。
- **应用平台**：纯前端 WebApp，各平台通用。

## 在线体验

Vercel：<https://dist-gamma-ivory-32.vercel.app/>

当前在线版本已添加测试书籍，可直接打开查看效果。

## 技术栈

| 模块 | 技术 |
| --- | --- |
| 框架 | React 19 + TypeScript |
| 构建 | Vite |
| 样式 | Tailwind CSS |
| 路由 | React Router |
| EPUB 渲染 | epubjs |
| 本地存储 | IndexedDB（idb） |

## 本地运行

### 使用 npm

```bash
npm install
npm run dev
```

### 使用 bun

```bash
bun install
bun run dev
```

## 常用命令

### npm

```bash
npm run build
npm run preview
npm run lint
```

### bun

```bash
bun run build
bun run preview
bun run lint
```

## 感谢

- [OpenDesign](https://github.com/nexu-io/open-design)：Local-first, open-source alternative to Anthropic's Claude Design.
- 微信读书
