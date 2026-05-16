# Kunde（坤德）

一个专注阅读体验的本地优先 EPUB 阅读器。全屏沉浸式阅读，所有数据存储在浏览器本地，无需注册、无需联网。

## 特点

- **专注阅读** — 全屏沉浸式阅读，无社交、无广告、无推送，打开即读
- **美观** — 4 种配色主题 × 3 种背景纹理，共 12 种视觉风格；字体、字号、行高、页边距均可自由调节
- **本地免费开源** — 纯前端，书库与阅读进度保存在 IndexedDB；不收集任何数据
- **书架管理** — 支持导入 / 去重、收藏、章节导航，阅读进度自动保存
- **格式支持** — 目前仅支持 EPUB 格式

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | React 19 + TypeScript |
| 构建 | Vite |
| 样式 | Tailwind CSS |
| 路由 | React Router |
| EPUB 渲染 | epubjs |
| 本地存储 | IndexedDB（idb） |

## 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 本地预览构建结果
npm run preview

# 运行 lint
npm run lint
```

## 链接

- 在线体验：[kunde.vercel.app](https://dist-qcnh037ak-imzihuailin-3982s-projects.vercel.app/)
- GitHub：[github.com/imzihuailin/kunde](https://github.com/imzihuailin/kunde)
